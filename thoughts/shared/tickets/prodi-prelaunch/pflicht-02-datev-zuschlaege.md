# DATEV-Zuschläge im Export-Template und DayPlanBonus-Update

## Kontext

Anforderung aus dem HR-Gespräch mit Pro-Di am 15.04.2026. Zuschläge (Nacht, Sonntag, Feiertag) sollen im DATEV-Lohnexport als eigene Lohnart ausgewiesen werden. Grundlage dieser Ticket-Version ist die Code-Recherche `thoughts/shared/research/2026-04-17-datev-zuschlaege.md` vom 2026-04-17, die gezeigt hat: der Zuschlags-Flow existiert End-to-End und ist architektonisch korrekt modelliert. Es fehlen drei konkrete Lücken, nicht ein neues Konzept.

**Ist-Zustand End-to-End (funktional verkabelt):**

```
DayPlanBonus (am Tagesplan)
  → convertBonusesToSurchargeConfigs  [daily-calc.helpers.ts:409-424]
  → calculateSurcharges               [src/lib/calculation/surcharges.ts:31-95]
  → DailyAccountValue source="surcharge"  [daily-calc.ts:1624-1693]
  → Pfad A: generateDatevLodas  [payroll-export-service.ts:135-190]
     (funktioniert korrekt über Account.payrollCode || Account.code)
  → Pfad B: LiquidJS-Template-Engine
     (export-context-builder.ts — Konten-Werte FEHLEN im Kontext)
```

**Vertikal-relevant**: Jeder Tenant mit Schichtarbeit oder Wochenendarbeit braucht korrekt exportierte Zuschläge. Die Lösung ist nicht Pro-Di-spezifisch — sie schließt eine dokumentierte Feature-Lücke in der Template-Engine und ergänzt ein fehlendes CRUD.

## Problem / Pain Point

**Drei konkrete Lücken (nicht: "Zuschläge fehlen")**:

### Lücke 1: Template-Engine hat keinen Zugriff auf Zuschlagsdaten

`src/lib/services/export-context-builder.ts:98-124` stellt im `ExportContextEmployee.monthlyValues` nur sechs vor-aggregierte `MonthlyValue`-Felder bereit: `targetHours`, `workedHours`, `overtimeHours`, `vacationDays`, `sickDays`, `otherAbsenceDays`. Konten-Summen aus `DailyAccountValue` (also die tatsächlich berechneten Zuschlagsminuten pro Bonus-Konto) sind im LiquidJS-Kontext nicht verfügbar.

Die System-Seed-Templates in `supabase/migrations/20260418100000_create_phase3_payroll_tables.sql:71-163` und das Lohnart-Mapping im Handbuch `docs/TERP_HANDBUCH.md:9479-9531` referenzieren `terpSource`-Werte `nightHours`/`sundayHours`/`holidayHours` (Codes 1003/1004/1005). Diese `terpSource`-Werte existieren im Code **nirgends** — weder auf `MonthlyValue` noch im Template-Kontext. Das Handbuch dokumentiert ein Feature, das der Code nicht liefert.

### Lücke 2: Kein Update auf DayPlanBonus

`src/lib/services/day-plans-repository.ts:145-166` exponiert nur `findBonusById`, `createBonus`, `deleteBonus`. Ein `updateBonus` fehlt auf allen Ebenen: Repository, Service, tRPC-Router (`src/trpc/routers/dayPlans.ts:627-674` hat nur `createBonus`/`deleteBonus`), Hook (`src/hooks/use-day-plans.ts:177-216`) und UI (`src/components/day-plans/day-plan-detail-sheet.tsx:322-481` zeigt nur Liste + Add-Form + Delete-Button).

Folge: Soll ein Zuschlagsprozentsatz, eine Zeitfenstergrenze oder das `appliesOnHoliday`-Flag geändert werden, muss der Bonus gelöscht und neu angelegt werden. Das ist für den Steuerberater-/Admin-Alltag unnötig umständlich.

### Lücke 3: Seed-Konten ohne payrollCode + fehlende Onboarding-Dokumentation

`supabase/seed.sql:433-441` legt die Bonus-Konten `NIGHT` / `SAT` / `SUN` ohne `payrollCode` an. Ohne gesetzten `payrollCode` wird im DATEV-Export der Account-Code als Lohnart verwendet (Fallback in `payroll-export-service.ts:174`) — das ist selten das, was ein Steuerberater erwartet.

Im Handbuch existieren zwei Abschnitte zu Zuschlägen (`docs/TERP_HANDBUCH.md:1058-1103` Konfiguration und `1086-1101` Praxisbeispiel Nachtzuschlag), aber kein End-to-End-Onboarding-Leitfaden für den typischen Pro-Di-Ablauf: Bonus-Konten mit payrollCode anlegen → an DayPlan konfigurieren → Export testen → Steuerberater-Übergabe. Sonntagszuschlag und Feiertagszuschlag werden nur als Konto-Namen erwähnt, nicht als End-to-End-Beispiel.

## Design-Entscheidungen (getroffen)

Die folgenden Festlegungen wurden bewusst getroffen und sind nicht Gegenstand weiterer Klärung:

1. **Kein `SurchargeRule`-Modell auf Tenant-Ebene.** Zuschläge bleiben am `DayPlan` via `DayPlanBonus`. Die Tageszuordnung (Nachtschicht, Sonntag) ergibt sich aus `DayPlan.dayChangeBehavior` und dem gewählten Tagesplan pro Wochentag — das ist die architektonisch korrekte Stelle.

2. **Kein §3b EStG im Pre-Launch-Scope.** Pro-Di hat keinen Tarifvertrag. Der Steuerberater bekommt Zuschlagsstunden als Lohnart und macht die steuerfreie/steuerpflichtige Aufteilung in der Lohnsoftware selbst. §3b ist als Post-Launch-Ticket gestubbt: `thoughts/shared/tickets/post-launch/post-launch-3b-steuerfreie-zuschlaege.md`.

3. **Kein `stackingMode`/`priority`/Highest-Wins.** Das aktuelle Verhalten (alle zutreffenden Bonusse akkumulieren unabhängig) ist für die meisten Industriebetriebe korrekt und wird von Pro-Di so gewünscht. Highest-Wins kann als Post-Launch-Feature ergänzt werden, wenn ein Kunde es braucht.

4. **Kein `validFrom`/`validTo` auf `DayPlanBonus`.** Historisch korrekte Rückwirkung bei Tarifänderungen ist ein Post-Launch-Feature. Pro-Di ändert Zuschläge nicht rückwirkend.

5. **Zuschlagsvorlagen (Tarifvertrags-Templates) als separates Soll-Ticket.** Vorkonfigurierte DayPlanBonus-Sets pro Tarif (z. B. "Gebäudereiniger-Tarif" → Nacht 25%, Sonntag 50%, Feiertag 125%) sind reine Convenience, kein neues Berechnungsmodell. Getrackt als `soll-08-zuschlagsvorlagen-tarifvertraege.md` in diesem Ordner.

**Einzige externe Abhängigkeit:** Der Pro-Di-Steuerberater muss die konkreten DATEV-Lohnarten-Nummern für die drei Bonus-Konten liefern (Nacht, Samstag, Sonntag/Feiertag). Das ist ein Onboarding-Task, kein Implementation-Blocker — Platzhalter-Werte im Seed sind ausreichend für Pre-Launch; der finale Steuerberater-Wert wird vor Go-Live per Admin-UI gesetzt.

## Akzeptanzkriterien

### Block A — Export-Context um Account-Werte erweitern

A1. **`ExportContextEmployee.accountValues`**: Neues Property `accountValues: Record<string, number>` am Employee-Objekt. Key = `Account.code`, Value = Stunden (minutes / 60). Enthält für jedes aktive Konto des Tenants (alle `accountType`-Werte, nicht nur `bonus`) die Summe der `DailyAccountValue.valueMinutes` für den Abrechnungszeitraum. Konten mit Wert 0 erscheinen **nicht** im Record (Sparsity).

A2. **Aggregation nutzt bestehenden Code**: `payroll-export-repository.ts:189-210` (`aggregateDailyAccountValues`) wird aus `export-context-builder.ts` wiederverwendet (ggf. in einen gemeinsamen Helper extrahiert). Keine Duplizierung der Query-Logik.

A3. **`terpSource`-Mapping auflösbar**: Die im Seed-Template referenzierten `terpSource`-Werte `nightHours`, `sundayHours`, `holidayHours` müssen im Template-Kontext funktionieren. Auflösung erfolgt über eine Konvention: `terpSource` beginnend mit `account:` (z. B. `account:NIGHT`) liest aus `employee.accountValues["NIGHT"]`. Bestehende `terpSource`-Werte ohne Prefix bleiben unverändert (zeigen auf `monthlyValues`-Felder).

A4. **Lohnart-Mapping-Seed-Update**: Die Seed-Einträge in `TenantPayrollWage` / `SystemPayrollWage` für Codes 1003/1004/1005 werden auf das neue `account:`-Prefix umgestellt (`account:NIGHT`, `account:SUN`, `account:HOLIDAY` — exakte Codes nach Rücksprache mit Konto-Naming im Seed).

A5. **Rückwärtskompatibilität**: Bestehende Templates, die `accountValues` nicht nutzen, funktionieren unverändert. Der hart-codierte Pfad `generateDatevLodas()` in `payroll-export-service.ts` wird **nicht** geändert.

A6. **LiquidJS-Sparsity-Verhalten**: Wird im Template `{{ employee.accountValues.FOO }}` auf ein nicht vorhandenes Konto zugegriffen, liefert LiquidJS im Standard-Mode (non-strict) `undefined` → leerer String. Das ist akzeptabel.

### Block B — DayPlanBonus Update-Operation

B1. **Repository**: `src/lib/services/day-plans-repository.ts` bekommt `updateBonus(prisma, bonusId, data)` analog zu `createBonus`.

B2. **Service**: `src/lib/services/day-plans-service.ts` bekommt `updateBonusFn(prisma, tenantId, input)` mit:
   - Ownership-Check über `findBonusById` (tenant via parent DayPlan)
   - `validateBonus(timeFrom, timeTo)` Wiederverwendung
   - Partielles Update (nur übergebene Felder)
   - Audit-Log-Eintrag analog zu Create/Delete

B3. **tRPC**: `src/trpc/routers/dayPlans.ts` bekommt `updateBonus` Procedure mit Permission `day_plans.manage`. Input-Schema analog `createBonusInputSchema`, aber alle Felder außer `dayPlanId` und `bonusId` optional. Output: `dayPlanBonusOutputSchema`.

B4. **Hook**: `src/hooks/use-day-plans.ts` bekommt `useUpdateDayPlanBonus` mit denselben Cache-Invalidierungen wie Create/Delete (`dayPlans.list`, `dayPlans.getById`, `employees.dayView`).

B5. **UI**: `src/components/day-plans/day-plan-detail-sheet.tsx` bekommt Edit-Modus pro Bonus-Zeile (Inline oder separates Sheet — Umsetzung nach UX-Konsistenz mit anderen Detail-Sheets im Repo). Alle Felder der Add-Form sind editierbar.

### Block C — Onboarding-Dokumentation und Seed

C1. **Seed-Update**: `supabase/seed.sql:433-441` setzt `payrollCode` für die drei Bonus-Konten auf Platzhalter-Werte (Vorschlag: `NIGHT`=1015, `SAT`=1020, `SUN`=1025 — diese Werte müssen vor Go-Live durch den Steuerberater verifiziert werden). `isPayrollRelevant` wird auf `true` gesetzt.

C2. **Handbuch-Erweiterung** `docs/TERP_HANDBUCH.md`:
   - Bestehender Abschnitt "Praxisbeispiel: Nachtzuschlag End-to-End" (Zeilen 1086-1101) wird um den End-to-End-Flow erweitert: Konto anlegen → Tagesplan konfigurieren → **Export generieren + Zuschlagszeile im Output verifizieren** → Steuerberater-Übergabe.
   - Neues Praxisbeispiel "Sonntagszuschlag End-to-End" analog.
   - Neues Praxisbeispiel "Feiertagszuschlag End-to-End" analog, inkl. `appliesOnHoliday`-Checkbox.
   - Neuer Abschnitt "DATEV-Zuschläge: Onboarding-Checkliste für den Steuerberater" mit der Reihenfolge: (1) Konto mit payrollCode vom Steuerberater erfragen, (2) Konto im Admin-Bereich eintragen, (3) Bonus am Tagesplan konfigurieren, (4) Test-Export generieren und Probezeile an Steuerberater mailen, (5) Go-Live.

C3. **Hinweis auf `accountValues`-Kontext**: Im Handbuch-Abschnitt zur Template-Engine (`§ 20f`) wird die neue Property `employee.accountValues` dokumentiert, inkl. Beispiel-Snippet `{{ employee.accountValues.NIGHT | datev_decimal: 2 }}`.

### Block D — Post-Launch-Tickets als Stubs erstellen

D1. **`thoughts/shared/tickets/post-launch/post-launch-3b-steuerfreie-zuschlaege.md`** — Stub mit Kontext (warum §3b ausgelagert wurde, Verweis auf dieses Ticket), grobem Scope (Tax-Klassifikation auf Account, Grundlohn-Input in Surcharge-Calc, Trennung steuerfrei/steuerpflichtig im Export), und Trigger-Bedingung (erster Tarifkunde oder Pro-Di-Steuerberater-Request).

D2. **`thoughts/shared/tickets/prodi-prelaunch/soll-08-zuschlagsvorlagen-tarifvertraege.md`** — Stub mit Kontext (Convenience-Feature für Tarifvertragskunden), grobem Scope (Template-Bibliothek mit vorkonfigurierten DayPlanBonus-Sets, Apply-Flow auf ausgewählte DayPlans), Abgrenzung (keine neue Berechnungslogik), Abhängigkeit (braucht erst Erfahrung mit erstem Tarifkunden).

## Test-Anforderungen

### Unit-Tests (Vitest)

Zu testende Funktionen/Module:
- `export-context-builder.ts` → Erweiterung um `accountValues`
- `day-plans-service.ts` → neues `updateBonusFn`
- `export-engine-service.ts` / `liquid-engine.ts` → `terpSource`-Auflösung mit `account:`-Prefix

Konkrete Test-Cases:

**Block A — Export-Context**:
- `accountValues` enthält alle aktiven Konten mit Wert > 0 für den Zeitraum
- Konten mit Wert 0 sind **nicht** im Record
- `accountValues` ist leer wenn keine DailyAccountValue-Rows im Zeitraum existieren
- `accountValues` summiert über alle `source`-Werte (`net_time`, `capped_time`, `surcharge`, `absence_rule`) — konsistent mit `generateDatevLodas` (keine `source`-Filterung)
- `accountValues`-Key ist `Account.code` (nicht `payrollCode`, nicht `id`) — UI-Verwendbarkeit
- `terpSource: "account:NIGHT"` liest korrekt `employee.accountValues.NIGHT`
- `terpSource: "workedHours"` (ohne Prefix) liest weiter aus `monthlyValues.workedHours`
- `terpSource: "account:UNKNOWN"` → leerer Output im Template (kein Error)
- Multi-Employee: zwei Employees mit unterschiedlichen Zuschlagswerten → getrennte `accountValues`

**Block B — DayPlanBonus-Update**:
- Update aller Felder (timeFrom, timeTo, calculationType, valueMinutes, minWorkMinutes, appliesOnHoliday, sortOrder)
- Partielles Update: nur `valueMinutes` geändert → andere Felder unverändert
- `validateBonus(timeFrom, timeTo)` wird beim Update aufgerufen (z. B. timeFrom === timeTo → Error)
- Update eines Bonus einer anderen Tenant → FORBIDDEN/NotFound
- Update eines nicht existenten Bonus → `BonusNotFoundError`
- Audit-Log wird geschrieben

**Edge Cases**:
- Account ohne `payrollCode`: Im hart-codierten DATEV-Pfad wird `code` als Fallback verwendet (bestehendes Verhalten, unverändert)
- Mehrere DayPlanBonus-Einträge auf dasselbe `accountId` am selben Tag → `DailyAccountValue` wird durch Upsert-Kollision überschrieben (bestehendes Verhalten dokumentieren, nicht ändern)

### Integration-Tests (Vitest, `describe.sequential`, echte DB)

- **End-to-End-Zuschlag im Export-Kontext**: DayPlan mit Bonus (22:00–06:00, 25% auf Konto NIGHT) anlegen → Employee mit EmployeeDayPlan verknüpfen → Booking 22:00–06:00 erfassen → `calculateDay` triggern → `DailyAccountValue` mit `source="surcharge"` prüfen → `buildExportContext` für den Monat aufrufen → `employee.accountValues.NIGHT` enthält korrekte Stundenzahl
- **Template-Rendering mit `account:`-Prefix**: Seed-Template "DATEV LODAS — Bewegungsdaten" mit `terpSource: "account:NIGHT"` rendern → Output enthält die Zuschlagszeile mit korrekter Stundenzahl und Lohnart-Code
- **Multi-Tenant-Isolation**: Tenant A (25% Nacht) und Tenant B (30% Nacht) → `buildExportContext` pro Tenant → keine Cross-Contamination in `accountValues`
- **Update-Flow**: Bonus erstellen → `updateBonus` mit neuem `valueMinutes` → `calculateDay` für betroffene Tage re-triggern → neue `DailyAccountValue`-Werte
- **Rückwärtskompatibilität**: Template ohne `accountValues`-Zugriff rendert unverändert wie vor Block A

### Browser-E2E-Tests (Playwright)

- **Admin ändert Zuschlag**: Login als Admin → Verwaltung → Tagespläne → Detail → Bonus editieren → `valueMinutes` ändern → Speichern → neuer Wert in der Liste sichtbar
- **Export-Flow mit Zuschlag**: Bonus konfiguriert → MA-Zeiten mit Nachtarbeit vorhanden → Administration → Lohnexporte → Export generieren (Template-Pfad) → Download → CSV-Stichprobe: Zuschlagszeile mit erwartetem Lohnart-Code und Stundenwert vorhanden

## Technische Skizze

### Betroffene Komponenten (keine neuen Modelle, keine Migration)

| Komponente | Änderung |
|---|---|
| `src/lib/services/export-context-builder.ts` | `accountValues: Record<string, number>` am `ExportContextEmployee` bereitstellen; Aggregation via `aggregateDailyAccountValues` |
| `src/lib/services/payroll-export-repository.ts` | `aggregateDailyAccountValues` für beide Export-Pfade nutzbar (ggf. Signatur anpassen / Helper extrahieren) |
| `src/lib/services/export-engine-service.ts` | `terpSource`-Auflösung: bei Prefix `account:` aus `employee.accountValues` lesen |
| `src/lib/services/day-plans-repository.ts` | `updateBonus(prisma, bonusId, data)` hinzufügen |
| `src/lib/services/day-plans-service.ts` | `updateBonusFn` + `updateBonusInputSchema` Validierung |
| `src/trpc/routers/dayPlans.ts` | `updateBonus` Procedure + Input-Schema (alle Felder optional außer IDs) |
| `src/hooks/use-day-plans.ts` | `useUpdateDayPlanBonus` Hook |
| `src/components/day-plans/day-plan-detail-sheet.tsx` | Edit-UI pro Bonus-Zeile (inline oder Sheet) |
| `docs/TERP_HANDBUCH.md` | Abschnitte 4.6 (Zuschläge) und 20f (Templates) erweitern; neue Onboarding-Checkliste |
| `supabase/seed.sql` | `payrollCode` und `isPayrollRelevant=true` für NIGHT/SAT/SUN setzen |
| Migration für `SystemPayrollWage` Seed | `terpSource`-Werte der Codes 1003/1004/1005 auf `account:<CODE>` umstellen |

### Was explizit NICHT geändert wird

- **Keine Änderung an `calculateSurcharges()`** (`src/lib/calculation/surcharges.ts`) oder `postSurchargeValues()` (`daily-calc.ts:1624-1693`). Die Berechnungslogik ist korrekt und wird unverändert bleiben.
- **Keine Änderung an `generateDatevLodas()`** (`payroll-export-service.ts:135-190`). Der hart-codierte DATEV-Pfad funktioniert bereits korrekt mit `Account.payrollCode || Account.code`.
- **Kein neues Prisma-Modell.** Kein `SurchargeRule`, keine neue Tabelle.
- **Keine neue Migration** außer dem Seed-Update für `payrollCode` und `TenantPayrollWage`-`terpSource`-Strings.

### Rückwärtskompatibilitäts-Risiko (Block A)

Die Template-Engine-Erweiterung muss so umgesetzt werden, dass bestehende Templates, die `accountValues` nicht nutzen, unverändert funktionieren. Der `terpSource`-Prefix-Ansatz ist rückwärtskompatibel: Werte ohne `account:`-Prefix fallen weiterhin auf `monthlyValues`-Zugriff zurück.

## Risiko / Komplexität

**T-Shirt-Größe: M** (runter von L)

Begründung:
- Kein neues Datenmodell, keine Berechnungslogik-Änderung, keine Migration außer Seed.
- Hauptarbeit: Template-Kontext-Erweiterung + DayPlanBonus-Update-CRUD + Handbuch-Erweiterung.
- Template-Engine-Erweiterung muss rückwärtskompatibel sein — Risiko durch Tests isolierbar.
- Test-Aufwand: ~30% der Implementierungszeit.

Hauptrisiko: Bestehende Templates dürfen nicht brechen. Mitigation: Der `account:`-Prefix als expliziter Opt-in macht Altverhalten unverändert.

## Abhängigkeiten

- **Keine harte Abhängigkeit zu Ticket 1 (Nachtschicht-Bewertung)**. Die Tageszuordnung an Kalendertage passiert vor der Zuschlagsberechnung via `DayPlan.dayChangeBehavior` (`daily-calc.ts:484-526`). `calculateSurcharges` ist davon nicht betroffen. **Ticket 2 kann parallel zu Ticket 1 entwickelt werden.**
- Ticket 3 (Überstunden-Auszahlung) kann auf der Überstunden-Zuschlagsberechnung aufbauen, sobald der Steuerberater eine Lohnart für Überstunden-Auszahlung liefert.
- Externer Onboarding-Task (nicht Implementation-Blocker): Pro-Di-Steuerberater liefert finale DATEV-Lohnarten-Nummern für Nacht/Samstag/Sonntag vor Go-Live.

## Out of Scope

- **§3b EStG steuerfreie Anteile** → Post-Launch-Ticket `post-launch-3b-steuerfreie-zuschlaege.md`
- **Tarifvertrags-spezifische Zuschlagsvorlagen** → Soll-Ticket `soll-08-zuschlagsvorlagen-tarifvertraege.md`
- **Highest-Wins-/Priority-Logik bei Kombinierbarkeit** → Post-Launch, wenn Kunde es fordert
- **`validFrom`/`validTo` auf DayPlanBonus** → Post-Launch, wenn Tarifkunde Historien-Korrektheit braucht
- **Änderung der Berechnungslogik `calculateSurcharges()`** → nicht nötig, korrekt
- **Änderung des hart-codierten `generateDatevLodas()`-Pfads** → nicht nötig, funktioniert
- **Neues Tenant-Level-SurchargeRule-Modell** → architektonisch falsch, Zuschläge sind tagesplanabhängig
