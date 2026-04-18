# Konfigurierbare Überstunden-Auszahlung

## Kontext

Anforderung aus dem HR-Gespräch mit Pro-Di am 15.04.2026. Pro-Di braucht eine klare Regelung, welche Überstunden wann ausbezahlt vs. ins Gleitzeitkonto gebucht werden.

**Vertikal-relevant**: Jeder Betrieb mit Überstunden braucht konfigurierbare Auszahlungsregeln. Die Schwellenwerte, Prozentsätze und Auszahlungszeitpunkte variieren stark (pro Vertrag, pro Tarifvertrag, pro betrieblicher Vereinbarung). Mehrere Mitarbeitergruppen (Vollzeit/Teilzeit/Führung) können über unterschiedliche Tarife mit unterschiedlichen Auszahlungsregeln bedient werden.

Fachlicher Hintergrund aus der Recherche (`thoughts/shared/research/2026-04-17-ueberstunden-auszahlung.md`):
- Der **Gleitzeitsaldo lebt direkt auf `MonthlyValue`** (`flextimeStart`, `flextimeChange`, `flextimeEnd`, `flextimeCarryover`) — **nicht** im `Account`/`DailyAccountValue`-System. Jede Saldenreduktion muss daher eine Spalte auf `MonthlyValue` ändern, nicht ein DailyAccountValue posten.
- DATEV-Lohnart `1002` "Mehrarbeit/Überstunden" existiert heute und transportiert `mv.totalOvertime / 60` als rein informative Stundenzeile (leerer `Betrag`). Diese Zeile bleibt unverändert — die Auszahlung wird eine **zusätzliche** Lohnart.
- Der Monatsabschluss (`closeMonth`/`closeBatch`) ist heute ein reiner Flag-Toggle und hat keine nachgelagerte Berechnungs-Logik — der Haken für die Payout-Erzeugung muss dort sauber eingehängt werden, ohne dass ein Payout-Fehler das Close blockiert.

## Problem / Pain Point

**Ist-Zustand im Code**:
- `DailyValue.overtime = max(0, netTime - targetTime)` wird korrekt tagesweise berechnet (`src/lib/calculation/breaks.ts:247-260`).
- `MonthlyValue.totalOvertime` wird korrekt monatsweise aggregiert, der Saldo via `creditType`/`flextimeThreshold`/`upperLimitAnnual`/`lowerLimitAnnual`/`maxFlextimePerMonth` fortgeschrieben (`src/lib/calculation/monthly.ts:135-278`).
- Es gibt **keine Auszahlungslogik**, keinen Schwellenwert für Auszahlung, keine Differenzierung zwischen "bleibt im Konto" und "wird ausbezahlt".
- HR muss manuell in Excel die Auszahlungsbeträge berechnen und dem Steuerberater mitteilen.
- Keine Konfiguration pro Mitarbeiter/Vertrag möglich.
- DATEV-Export liefert nur die informative Gesamt-Überstunden-Zeile, nicht den davon zu leistenden Auszahlungs-Anteil.

## Akzeptanzkriterien

Strukturiert in die fünf Umsetzungs-Blöcke.

### Block A — OvertimePayout-Modell + Tarif-Erweiterung

1. **Neues Prisma-Modell `OvertimePayout`** als eigenständige Tabelle:
   - `id`, `tenantId`, `employeeId`, `year`, `month`
   - `payoutMinutes Int` (die errechneten Auszahlungsstunden in Minuten)
   - `status` CHECK `IN ('pending', 'approved', 'rejected')`
   - `sourceFlextimeEnd Int` — Saldo **vor** Auszahlung (Snapshot für Nachvollziehbarkeit)
   - `tariffRuleSnapshot Jsonb` — geltende Tarif-Regel zum Berechnungszeitpunkt (enabled/threshold/mode/percentage/fixedMinutes/approvalRequired + ggf. überlagerndes Employee-Override), damit nachträgliche Tarifänderungen die Historie nicht verfälschen
   - `approvedBy String? @db.Uuid`, `approvedAt DateTime?`
   - `rejectedBy String? @db.Uuid`, `rejectedAt DateTime?`, `rejectedReason Text?`
   - `createdAt`, `updatedAt`
   - `@@unique([tenantId, employeeId, year, month])` — maximal ein Payout pro MA pro Monat

2. **Neue Felder am `Tariff`-Modell** (Migration mit Defaults, die bestehende Tarife unverändert lassen):
   - `overtimePayoutEnabled Boolean @default(false)`
   - `overtimePayoutThresholdMinutes Int?` — ab welchem `flextimeEnd` (exklusiv) ausgezahlt wird
   - `overtimePayoutMode String?` CHECK `IN ('ALL_ABOVE_THRESHOLD', 'PERCENTAGE', 'FIXED_AMOUNT')`
   - `overtimePayoutPercentage Int?` — nur für `PERCENTAGE` (0–100)
   - `overtimePayoutFixedMinutes Int?` — nur für `FIXED_AMOUNT`
   - `overtimePayoutApprovalRequired Boolean @default(false)`

3. **Neues Modell `EmployeeOvertimePayoutOverride`** (analog zu `EmployeeCappingException`):
   - `id`, `tenantId`, `employeeId` (unique pro Tenant/Employee-Paar)
   - `overtimePayoutEnabled Boolean` — kann Tarif-Regel hart auf an/aus schalten (z.B. Führungskräfte: kein Payout)
   - `overtimePayoutMode String?` — optionaler Mode-Override; sonst Tarif-Default
   - `createdAt`, `updatedAt`
   - Scope: reines Opt-out/Mode-Override, **kein** vollständiger Regel-Clone (Schwelle/Prozent/Fix bleiben Tarif-gesteuert)

4. **Migration + Seed**:
   - Supabase-Migration für alle drei Schema-Änderungen (Tabelle `overtime_payouts`, Tabelle `employee_overtime_payout_overrides`, sechs neue Spalten auf `tariffs`).
   - Seed: Für den Pro-Di-Standardtarif `overtimePayoutEnabled=true`, `overtimePayoutMode='ALL_ABOVE_THRESHOLD'`, `overtimePayoutApprovalRequired=false`, Schwellenwert als Platzhalter (wird durch Pro-Di-Onboarding konfiguriert).
   - Neuer `DefaultPayrollWage`-Seed: `code='1010'`, `name='Überstunden-Auszahlung'`, `terpSource='overtimePayoutHours'`, `category='time'` (getrennt von `1002 Mehrarbeit/Überstunden`).

### Block B — Berechnungslogik + Monatsabschluss-Integration

5. **Pure Function `calculatePayout(flextimeEnd, rule)`** in neuem Service `src/lib/services/overtime-payout-service.ts`:
   - Input: aktueller `flextimeEnd` (Minuten, vorzeichenbehaftet) + effektive Regel (nach Employee-Override)
   - Output: `{ payoutMinutes: number, remainingBalance: number }`
   - Regeln:
     - `flextimeEnd <= threshold` → `payoutMinutes = 0` (Schwelle ist **exklusiv**, exakt auf Schwelle bedeutet kein Payout)
     - `ALL_ABOVE_THRESHOLD`: `payoutMinutes = flextimeEnd - threshold`
     - `PERCENTAGE`: `payoutMinutes = floor((flextimeEnd - threshold) * percentage / 100)`
     - `FIXED_AMOUNT`: `payoutMinutes = min(fixedMinutes, flextimeEnd - threshold)` (nie mehr als der Überschuss)
     - Negativer oder Null-Saldo → `payoutMinutes = 0`
   - Kein DB-Zugriff, keine Side-Effects.

6. **Integration in `monthly-values-service.ts`**:
   - `close()` und `closeBatch()` erweitert: **nach** erfolgreichem Close eines Monats wird für jeden betroffenen MA `createPayoutForClosedMonth(...)` aufgerufen.
   - Reihenfolge pro MA:
     1. Effektive Regel laden: Tarif-Felder via `employee.tariffId`, dann `EmployeeOvertimePayoutOverride` drübergelegt.
     2. Wenn `overtimePayoutEnabled = false` nach Override → keine Aktion, kein Payout-Record.
     3. `calculatePayout(mv.flextimeEnd, rule)` aufrufen.
     4. Wenn `payoutMinutes = 0` → keine Aktion, kein Payout-Record.
     5. Wenn `payoutMinutes > 0` und `approvalRequired = false` → `OvertimePayout` mit `status='approved'`, `approvedAt=now()`, `approvedBy=closerUserId` erzeugen **und** `MonthlyValue.flextimeEnd` im selben Monat um `payoutMinutes` reduzieren (zusätzlich `flextimeCarryover = flextimeEnd`).
     6. Wenn `approvalRequired = true` → `OvertimePayout` mit `status='pending'` erzeugen, `MonthlyValue.flextimeEnd` **nicht** anfassen.
   - `tariffRuleSnapshot` wird in jedem Fall mit der zum Zeitpunkt geltenden, durch Override bereits aufgelösten Regel befüllt.
   - Fehler bei Payout-Erzeugung führen **nicht** zum Abbruch des Close: Close-Flag + Payout sind getrennte atomare Schritte; Fehler werden in der `closeBatch`-Ergebnismenge als `errors[]` gemeldet und pro MA ein Retry möglich.

7. **Approve-/Reject-Flow** in `overtime-payout-service.ts`:
   - `approve(payoutId, userId)`: nur wenn `status='pending'`; setzt `status='approved'`, `approvedBy`, `approvedAt`, reduziert `MonthlyValue.flextimeEnd` um `payoutMinutes` im passenden Monat und triggert `recalculateFromMonth(employeeId, year, month+1)`, damit `flextimeStart` aller Folgemonate korrekt neu gesetzt wird. Geschieht atomar über `prisma.$transaction`.
   - `reject(payoutId, userId, reason)`: nur wenn `status='pending'`; setzt `status='rejected'`, `rejectedBy`, `rejectedAt`, `rejectedReason`. Keine Saldo-Änderung.
   - Beide schreiben `audit_logs` mit `entityType='overtime_payout'`, `action='approve'`/`'reject'`.

8. **Reopen-Interaktion**:
   - Wird ein Monat via `reopenMonth` wiedereröffnet, werden alle zu diesem Monat gehörigen `OvertimePayout`-Records gelöscht (oder auf `rejected` mit `rejectedReason='month_reopened'` gesetzt — Implementierung: löschen ist einfacher und der Audit-Log-Eintrag reicht) und — sofern genehmigt — die entsprechende `flextimeEnd`-Reduktion durch den Standard-Recalc wieder zurückgedreht. Dieser Flow muss in Integration-Tests abgedeckt sein.

### Block C — DATEV-Export-Integration

9. **Template-Engine**: `src/lib/services/export-context-builder.ts` exponiert eine neue Variable `employee.monthlyValues.overtimePayoutHours`. Quelle: SUMME aller `OvertimePayout.payoutMinutes` im Periodenmonat, Employee-scoped, **nur Status `approved`**, durch 60.

10. **TenantPayrollWage-Seed**: Default-Lohnart `1010` "Überstunden-Auszahlung" mit `terpSource='overtimePayoutHours'` wird automatisch zu jedem neuen Tenant kopiert (bestehender `copyDefaultsToTenant`-Pfad in `payroll-wage-service.ts` greift durch den neuen `DefaultPayrollWage`-Seed).

11. **Legacy-Engine**: `src/lib/services/payroll-export-service.ts` `generateDatevLodas()` erhält eine zusätzliche hardcoded Zeile für `overtimePayoutHours` mit Lohnart `1010` (analog zum bestehenden `1002`-Pattern in Z. 143–167). Emittiert nur wenn `> 0`. Betrags-Spalte bleibt leer — Euro-Berechnung macht der Steuerberater.

12. **Lohnart `1002` bleibt unverändert**: Sie bleibt die informative Gesamt-Überstunden-Zeile (`mv.totalOvertime / 60`). `1010` transportiert den davon auszuzahlenden Anteil. Der Steuerberater sieht beide Zahlen getrennt.

### Block D — UI

13. **Tarif-Formular** (`src/app/[locale]/(dashboard)/admin/tariffs/`): Neue Sektion "Überstunden-Auszahlung" mit Feldern
    - `overtimePayoutEnabled` (Switch)
    - Bei enabled: `overtimePayoutMode` (Select), `overtimePayoutThresholdMinutes` (Minuten-Input mit Stunden-Preview), modus-spezifisch `overtimePayoutPercentage` (0–100) oder `overtimePayoutFixedMinutes`, `overtimePayoutApprovalRequired` (Switch)
    - Hilfetexte für jeden Modus mit Beispielrechnung.

14. **Employee-Detailseite**: Neue Karte/Section "Überstunden-Auszahlung Override" mit Opt-out-Switch und optionalem Mode-Override. Default-Anzeige: "Tarif-Regel wird angewendet" wenn kein Override gesetzt ist.

15. **Admin-Monatswerte-Seite** (`/admin/monthly-values`): Neue Spalte "Auszahlung" mit Werten:
    - `—` wenn kein Payout-Record
    - `X:YY (ausstehend)` wenn `pending`
    - `X:YY (genehmigt)` wenn `approved`
    - `— (abgelehnt)` wenn `rejected`
    - Filter `hasPending` in der Toolbar.

16. **Payout-Freigabe-Übersicht** unter `/admin/overtime-payouts` (nur relevant wenn irgendein Tarif `approvalRequired=true` hat, aber immer sichtbar für den Admin):
    - Liste aller Payouts mit Filter `status`, `year`, `month`, `departmentId`, `employeeId`.
    - Pro-Zeile Approve-/Reject-Buttons für `pending`. Reject-Button öffnet Dialog mit Pflicht-Reason.
    - Batch-Approve für alle pending eines Monats, mit Bestätigungsdialog.
    - Detail-Sheet mit `tariffRuleSnapshot` und `sourceFlextimeEnd` für Nachvollziehbarkeit.

17. **Dashboard `FlextimeBalanceCard`** (`src/components/dashboard/flextime-balance-card.tsx`): Wenn der MA im aktuellen oder letzten Monat ein `OvertimePayout` hat, kleiner Hinweis "Auszahlung aus [Monat]: X:YY h (genehmigt|ausstehend)".

### Block E — Handbuch + Seed

18. **Handbuch-Abschnitt** in `TERP_HANDBUCH_V2.md`: "Überstunden-Auszahlung konfigurieren" mit End-to-End-Flow (Tarif konfigurieren → Monat schließen → Payouts prüfen/genehmigen → DATEV-Export generieren → Übergabe an Steuerberater). Step-by-Step klickbar, als Praxisbeispiel mit konkreten Zahlen (Saldo 12h, Schwelle 10h, ALL_ABOVE_THRESHOLD → Auszahlung 2h, verbleibender Saldo 10h).

19. **Seed** (`supabase/seed.sql` oder Pro-Di-spezifischer Onboarding-Seed):
    - Lohnart `1010` in `default_payroll_wages` (wird für alle Tenants kopiert).
    - Pro-Di-Tarif-Default: `overtimePayoutEnabled=true`, `overtimePayoutMode='ALL_ABOVE_THRESHOLD'`, `overtimePayoutApprovalRequired=false`, `overtimePayoutThresholdMinutes` als Platzhalter (finale Zahl via Admin-UI im Onboarding setzen).

## Design-Entscheidungen

Diese Entscheidungen stehen fest und werden nicht mehr verhandelt. Sie ersetzen die ursprünglichen "Offenen Fragen".

1. **Architektur**: Eigenständiges `OvertimePayout`-Modell mit Status-Lifecycle (`pending → approved → exported` implizit via Report-Join). **Kein** `DailyAccountValue`-Source `overtime_payout`, **keine** Account-Buchung. Die Saldenreduktion passiert direkt auf `MonthlyValue.flextimeEnd` — das ist der einzige Ort, an dem der Gleitzeitsaldo lebt (siehe Recherche §2.1).

2. **Regel-Ort**: Am `Tariff`-Modell. Verschiedene Mitarbeitergruppen (Vollzeit/Teilzeit/Führung) werden durch unterschiedliche Tarife mit unterschiedlichen Payout-Regeln bedient. Das passt zur bestehenden Architektur (`creditType`, `maxFlextimePerMonth`, `upperLimitAnnual`, `lowerLimitAnnual`, `flextimeThreshold` leben bereits am Tarif).

3. **Auslösung**: Automatisch beim Monatsabschluss. `close()` und `closeBatch()` berechnen für alle betroffenen MA die Payouts nach dem Flag-Toggle. Einzelbestätigung pro MA ist bei 200+ MA nicht praktikabel. Der Freigabe-Workflow ist darüber konfigurierbar.

4. **Freigabe-Workflow**: Konfigurierbar am Tarif via `overtimePayoutApprovalRequired`.
   - `false` (Pro-Di-Default): Payout beim Close sofort `approved`, `flextimeEnd` wird reduziert, DATEV-Export enthält sofort die Auszahlungs-Zeile.
   - `true`: Payout wird `pending` erstellt, `flextimeEnd` bleibt unverändert. HR gibt in der Freigabe-Übersicht frei, Approval löst die `flextimeEnd`-Reduktion und einen Folgemonat-Recalc aus. Für Kunden mit Vier-Augen-Pflicht bei Lohnthemen.

5. **Employee-Override**: `EmployeeOvertimePayoutOverride` als einfaches Opt-out-/Mode-Override-Modell, analog zu `EmployeeCappingException`. Kein vollständiger Regel-Clone (Schwelle/Prozent/Fix bleiben Tarif-gesteuert) — wer andere Schwellen braucht, wird in einen anderen Tarif gesetzt.

6. **Keine reale Geldtransaktion in Terp**. Terp berechnet Auszahlungsstunden und liefert sie als separate DATEV-Lohnart (`1010`) an den Steuerberater. Der Steuerberater macht die Euro-Umrechnung und die tatsächliche Auszahlung. Terp kennt keinen Stundenlohn-zu-Euro-Pfad für Auszahlungen (und braucht ihn nicht).

7. **Defaults** (ersetzen die Pro-Di-Klärungsfragen aus dem Original-Ticket):
   - **Schwellenwert**: konfigurierbar am Tarif, kein fester Default; beim Onboarding pro Pro-Di via Admin-UI setzen.
   - **Auszahlungsmodus**: `ALL_ABOVE_THRESHOLD` als Pro-Di-Default. `PERCENTAGE` und `FIXED_AMOUNT` sind im System verfügbar, werden aber erst bei Kundenbedarf aktiviert.
   - **Auszahlungszyklus**: `MONTHLY` (beim Monatsabschluss). Quartalsweise oder On-Demand sind Post-Launch.
   - **DATEV-Lohnart**: `1010` "Überstunden-Auszahlung" im Seed, getrennt von der bestehenden informativen `1002` "Mehrarbeit/Überstunden".
   - **Mitarbeiter ohne Auszahlung** (z.B. Führungskräfte): via `EmployeeOvertimePayoutOverride` mit `overtimePayoutEnabled=false` pro MA.
   - **Monatsabschluss-Prozess**: HR manuell via Batch-Close (bestehender Flow). Keine Auto-Close-Cron.
   - **Gleitzeitkonto-Obergrenze**: existiert bereits als `Tariff.upperLimitAnnual`, bleibt unverändert und unabhängig von der Auszahlungslogik.

## Test-Anforderungen

Alle drei Testebenen sind Pflicht.

### Unit-Tests (Vitest)

Services/Functions unter Test — `src/lib/services/overtime-payout-service.ts`:

- **`calculatePayout()` — `ALL_ABOVE_THRESHOLD`**: Saldo 20h, Schwelle 10h → Auszahlung 10h, Remaining 10h.
- **`calculatePayout()` — `PERCENTAGE` 50%**: Saldo 20h, Schwelle 10h → Auszahlung 5h (50% von 10h Überschuss), Remaining 15h.
- **`calculatePayout()` — `FIXED_AMOUNT`** mit Fix 10h: Saldo 20h, Schwelle 5h → Auszahlung 10h (Fix); Saldo 12h, Schwelle 5h → Auszahlung 7h (nie mehr als Überschuss).
- **Unter Schwelle**: Saldo 8h, Schwelle 10h → Auszahlung 0h.
- **Exakt Schwelle (exklusiv)**: Saldo 10h, Schwelle 10h → Auszahlung 0h.
- **Null-Saldo**: Saldo 0h → Auszahlung 0h.
- **Negativer Saldo (Minderstunden)**: Saldo -5h, Schwelle 10h → Auszahlung 0h, kein Error.
- **Dezimalminuten**: Saldo 10h 30min, Schwelle 10h, `ALL_ABOVE_THRESHOLD` → Auszahlung 30min.
- **`PERCENTAGE` mit Rundung**: Saldo 10h 3min, Schwelle 10h, 50% → Auszahlung 1min (floor).
- **Employee-Override deaktiviert**: Tarif sagt enabled, Override sagt `enabled=false` → Regel-Resolver gibt `enabled=false` zurück, keine Payout-Berechnung.
- **Employee-Override Mode**: Tarif Mode `ALL_ABOVE_THRESHOLD`, Override Mode `PERCENTAGE` (50%) → effektiver Mode ist `PERCENTAGE`, Schwelle/Prozent weiter vom Tarif.
- **`tariffRuleSnapshot`-Serialisierung**: Snapshot enthält alle Regel-Felder + Override-Flag; rundet keine Werte; JSON-serialisierbar.

### Integration-Tests (Vitest `describe.sequential`, echte DB)

- **End-to-End Happy Path**: MA mit 12h Saldo, Tarif `ALL_ABOVE_THRESHOLD`, Schwelle 10h, `approvalRequired=false`. Monat schließen → `OvertimePayout` mit `status='approved'`, `payoutMinutes=120` existiert → `MonthlyValue.flextimeEnd` ist 10h → Folgemonat wird recalculiert → `flextimeStart` im Folgemonat ist 10h.
- **Approval-Flow**: Tarif mit `approvalRequired=true`. Monat schließen → Payout `pending`, `flextimeEnd` **unverändert** bei 12h → `approve()` aufrufen → Payout `approved`, `flextimeEnd=10h`, Folgemonat-Recalc triggered.
- **Rejection-Flow**: Payout `pending` → `reject(reason='Test')` → Status `rejected`, `flextimeEnd` unverändert, keine Saldenänderung in Folgemonaten.
- **Batch-Close 3 MA, unterschiedliche Tarife**: MA1 Mode `ALL_ABOVE_THRESHOLD` (12h Saldo, Schwelle 10h → 2h Payout), MA2 Mode `PERCENTAGE` 50% (15h Saldo, Schwelle 5h → 5h Payout), MA3 Tarif ohne `overtimePayoutEnabled` (8h Saldo → kein Payout). Alle drei in einem `closeBatch`-Call → je MA korrektes Ergebnis, richtige `flextimeEnd`-Reduktion.
- **Employee-Override wirksam**: MA mit Override `enabled=false`, Tarif sagt enabled → Close erzeugt **keinen** Payout-Record; `flextimeEnd` bleibt unberührt. `tariffRuleSnapshot` wird nicht geschrieben (weil kein Record).
- **DATEV-Export mit approved Payout**: Tenant-Template-Engine: Payout `approved` 2h → Export enthält Lohnart `1010` mit `2,00` Stunden, zusätzlich Lohnart `1002` mit der ursprünglichen Gesamt-`totalOvertime`-Zeile (unverändert). Legacy-Engine: analog.
- **DATEV-Export ohne pending Payout**: Payout `pending` → Lohnart `1010` erscheint **nicht** im Export. Nur `approved` fließt ein.
- **Multi-Tenant-Isolation**: Tenant A mit enabled, Tenant B ohne. Close für beide → nur Tenant A erzeugt Payout-Records; keine Cross-Tenant-Leaks.
- **Reopen-Kaskade**: Monat schließen → Payout `approved`, `flextimeEnd` reduziert → Monat reopenen → Payout-Records für diesen Monat gelöscht → Folgemonat-Recalc → `flextimeStart` im Folgemonat ist wieder auf altem Wert.
- **Close schlägt nicht wegen Payout-Fehler fehl**: Simuliere Payout-Fehler (z.B. durch manipulierten Tarif-Snapshot) → `closeBatch`-Result enthält MA mit Fehler in `errors[]`, der Monat ist aber erfolgreich geschlossen (`isClosed=true`).

### Browser-E2E-Tests (Playwright)

- **Admin konfiguriert Auszahlungsregel**: Login als Admin → Tarife → Tarif bearbeiten → Sektion "Überstunden-Auszahlung" → `enabled`, Mode `ALL_ABOVE_THRESHOLD`, Schwelle eingeben → Speichern → Wert persistiert nach Reload.
- **HR schließt Monat (Auto-Approve)**: Login als HR → `/admin/monthly-values` → Batch-Close für Monat → Erfolgsmeldung → Spalte "Auszahlung" zeigt für betroffene MA den genehmigten Betrag.
- **HR Freigabe-Flow**: Tarif mit `approvalRequired=true` konfigurieren → Monat schließen → `/admin/overtime-payouts` → pending Payouts sichtbar → Approve → Status wechselt auf approved → `/admin/monthly-values` zeigt reduzierten Saldo.
- **HR Rejection-Flow**: pending Payout → Reject mit Reason → Status rejected → `flextimeEnd` unverändert (via Monatswerte-Tabelle verifizierbar).
- **Employee-Override**: Mitarbeiter-Detailseite → Override-Karte → `enabled=false` → Speichern → nächster Monatsabschluss erzeugt für diesen MA keinen Payout.
- **Export nach Freigabe**: Nach approved Payout → Payroll-Export-Seite → DATEV-Lohn-Export generieren → Download-Preview zeigt Lohnart `1010` mit den korrekten Stunden.

## Technische Skizze

### Betroffene Komponenten

| Komponente | Änderung |
|---|---|
| `prisma/schema.prisma` | Neue Modelle `OvertimePayout`, `EmployeeOvertimePayoutOverride`; sechs neue Felder am `Tariff`-Modell (`overtimePayoutEnabled`, `overtimePayoutThresholdMinutes`, `overtimePayoutMode`, `overtimePayoutPercentage`, `overtimePayoutFixedMinutes`, `overtimePayoutApprovalRequired`) |
| `supabase/migrations/` | Migration für beide Tabellen + Tariff-Felder + CHECK-Constraints (`status`, `overtimePayoutMode`) |
| `src/lib/services/overtime-payout-service.ts` | Neuer Service: `calculatePayout` (pure), `resolveEffectiveRule` (Tarif + Override), `createPayoutForClosedMonth` (Close-Integration), `approve`, `reject`, CRUD für die Übersicht |
| `src/lib/services/overtime-payout-repository.ts` | Neues Repository: Prisma-CRUD für `OvertimePayout` |
| `src/lib/services/monthly-values-service.ts` | `close()` und `closeBatch()` erweitern: nach erfolgreichem Flag-Toggle pro MA `createPayoutForClosedMonth` aufrufen; Fehler in `errors[]` sammeln statt Close abbrechen; `reopen` löscht zugehörige Payouts |
| `src/lib/services/monthly-calc.ts` | Kein direkter Touch; der `flextimeEnd`-Update passiert im Payout-Service. `recalculateFromMonth` (bereits vorhanden) wird vom Payout-Service nach Approval aufgerufen |
| `src/lib/services/export-context-builder.ts` | Neue Variable `employee.monthlyValues.overtimePayoutHours`: SUM approved `OvertimePayout.payoutMinutes` für Employee/Monat / 60 |
| `src/lib/services/payroll-export-service.ts` | In `generateDatevLodas()` neue hardcoded Zeile für `overtimePayoutHours` mit Lohnart `1010` (analog zu `1002`) |
| `src/trpc/routers/overtimePayouts.ts` | Neuer Router: `list`, `getById`, `approve`, `reject`, `approveBatch` |
| `src/trpc/routers/tariffs.ts` | Zod-Schema um sechs Payout-Felder erweitern; Cross-Field-Validation (Mode-Feld muss zur Mode-spezifischen Eingabe passen) |
| `src/trpc/routers/employees.ts` | Optional: Procedure `setOvertimePayoutOverride` (oder eigener Router `employeeOvertimePayoutOverrides.ts`) |
| `src/app/[locale]/(dashboard)/admin/tariffs/` | Form-Erweiterung: Sektion "Überstunden-Auszahlung" |
| `src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx` | Override-Karte |
| `src/app/[locale]/(dashboard)/admin/monthly-values/page.tsx` | Spalte "Auszahlung" + Filter `hasPending` |
| `src/app/[locale]/(dashboard)/admin/overtime-payouts/page.tsx` | Neue Seite: Freigabe-Übersicht |
| `src/components/dashboard/flextime-balance-card.tsx` | Hinweis-Zeile für anstehende/genehmigte Auszahlung |
| `TERP_HANDBUCH_V2.md` | Neuer Abschnitt "Überstunden-Auszahlung konfigurieren" mit End-to-End-Praxisbeispiel |
| `supabase/seed.sql` bzw. Pro-Di-Onboarding-Seed | Lohnart `1010` in `default_payroll_wages`; Pro-Di-Tarif-Defaults |

### Interaktion mit Account-System / MonthlyValue

**KEIN** `DailyAccountValue`-Source `overtime_payout` wird angelegt. **KEINE** Buchung auf Account-Konten. Die Saldenreduktion erfolgt direkt auf `MonthlyValue.flextimeEnd` (und entsprechend `flextimeCarryover`) im Payout-Service — sowohl beim Auto-Approve-Pfad (im selben `$transaction` wie der Record-Insert) als auch beim manuellen `approve()`-Pfad.

**Folgemonat-Recalc nach Approval**: Wenn `approve()` den Saldo reduziert, wird `recalculateFromMonth(employeeId, year, month+1)` aufgerufen, damit `flextimeStart` aller Folgemonate (bis zum heutigen offenen Monat) den neuen Wert liest. Dieser Call läuft gegen den bestehenden `MonthlyCalcService.calculateMonthBatch`-Pfad, der geschlossene Monate silent skipped und nur offene Monate neu rechnet.

## Risiko / Komplexität

**T-Shirt-Größe: L**

Haupt-Risiken:
- **Integration in den Close-Flow**: `closeMonth()` ist heute ein reiner Flag-Toggle. Nach dieser Änderung hat er einen nachgelagerten Seiteneffekt (Payout-Berechnung + ggf. Saldo-Update). Close-Flag und Payout müssen atomar getrennt sein: Close darf nicht fehlschlagen, nur weil die Payout-Berechnung für einen einzelnen MA fehlerhaft ist.
- **Folgemonat-Recalc nach Approval**: Wenn ein pending Payout genehmigt wird, kaskadiert die `flextimeEnd`-Reduktion über alle offenen Folgemonate (`flextimeStart` = `prev.flextimeEnd`). Dieser kaskadierende Recalc muss sauber laufen und gegen gleichzeitig laufende Batch-Closes geschützt sein.
- **Reopen-Kaskade**: Wird ein bereits mit approved Payout geschlossener Monat reopened, müssen die Payout-Records gelöscht und der Saldo rekonstruiert werden. Integration-Test ist Pflicht.
- **`tariffRuleSnapshot`-Historie**: Nachträgliche Tarifänderungen dürfen alte Payouts nicht verfälschen. Snapshot-Serialisierung muss alle effektiven Felder enthalten (inkl. Override-Resolution zum Zeitpunkt).

Test-Aufwand: ~40% der Implementierungszeit.

## Abhängigkeiten

- **Ticket 2 (DATEV-Zuschläge)**: Die Template-Engine-Erweiterung (`export-context-builder` + `terp_value`-Filter + `TenantPayrollWage.terpSource`-Dispatch) aus Ticket 2 ist Voraussetzung für die saubere Integration der `overtimePayoutHours`-Variable im Template-Kontext. Ticket 2 sollte vorher fertig sein. Die Legacy-Engine-Zeile ist unabhängig.
- **Ticket 5 (Überstundenantrag)**: Referenziert die hier konfigurierte Verwertungsregel als Default für "Konto vs. Auszahlung". Ticket 5 kann aber mit einem Fallback-Default implementiert werden, falls #3 noch nicht fertig ist.

## Out of Scope

- **Quartalsweise oder On-Demand-Auszahlung**: Nur `MONTHLY` beim Close. Andere Zyklen sind Post-Launch.
- **Euro-Berechnung (Stundenlohn × Stunden)**: Macht der Steuerberater. Terp transportiert nur Stunden.
- **Automatischer Close (Cron)**: Close bleibt manuell durch HR via Batch-Close-UI.
- **Rückwirkende Payout-Korrektur ohne Reopen**: Korrektur einer einzelnen Auszahlung ohne Monat-Reopen ist nicht vorgesehen. Wer korrigieren will, macht Reopen → Recalc → Close neu.
- **`MonthlyEvaluationTemplate`-Integration**: Das Template-Modell wird heute nicht vom Kalkulator gelesen und bleibt außen vor. Die Regel lebt ausschließlich am Tarif.
- **Mehrere Payouts pro MA pro Monat**: `@@unique([tenantId, employeeId, year, month])` verhindert das bewusst. Wer mehrfach auszahlen will, erhöht den Betrag der bestehenden Buchung via Reopen-Pfad.
- **Email-Notifications für Payout-Freigabe**: In-App nur. Email als separates Feature Post-Launch.
