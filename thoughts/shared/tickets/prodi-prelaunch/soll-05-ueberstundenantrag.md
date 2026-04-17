# Überstundenantrag (Vorab + Reaktiv) mit Genehmigungs-Workflow

## Kontext

Anforderung aus dem HR-Gespräch mit Pro-Di am 15.04.2026. Zwei Use Cases wurden identifiziert: Vorab-Antrag ("ich werde länger bleiben") und reaktiver Antrag ("Zeiterfassung wieder öffnen"). Beide brauchen einen formalisierten Genehmigungs-Workflow.

**Vertikal-relevant**: Überstundenantrag mit Genehmigung ist ein Standard-HR-Prozess in jedem Betrieb mit Zeiterfassung. ArbZG-Validierung ist gesetzlich für alle deutschen Arbeitgeber relevant. Die Genehmiger-Konfiguration muss pro Tenant flexibel sein.

## Problem / Pain Point

**Ist-Zustand im Code**:
- **Kein Überstundenantrag**: Es gibt kein Request/Approval-System für Überstunden
- **Kein generisches Antragsmodell**: Das einzige Antragskonzept ist `AbsenceDay.status` (pending/approved/rejected/cancelled) — direkt in der Domain eingebettet, nicht abstrahiert
- **Urlaubs-Genehmigungs-Flow** existiert (Referenz-Architektur): `absences.createRange()` → `findApproverUserIds()` (Raw-SQL über Permissions) → Notification → `absences.approve()` → atomischer Statuswechsel + Recalc
- **Korrekturassistent** existiert: `DailyValue.hasError` → HR-Review-View. Separates `Correction`-Modell für manuelle Kontokorrekturen mit eigenem Genehmigungs-Workflow
- **Zeiterfassung**: `Booking`-Modell (in/out via `BookingType.direction`), kein Lock/Unlock-Konzept
- **Keine ArbZG-Validierung** implementiert

**Konsequenz**: Ungenehmigte Mehrarbeit wird heute gar nicht erkannt. MA stempelt einfach länger, Schichtleiter sieht es erst bei der Monatsauswertung. Keine Compliance mit ArbZG-Höchstarbeitszeiten.

## Akzeptanzkriterien

### Flow A — Vorab-Antrag
1. MA erstellt Antrag "Geplante Überstunden" mit: Datum, geplante Zusatzstunden, Begründung, Verwertungswunsch (Konto / Auszahlung / Freizeitausgleich — Default aus Ticket 3)
2. Genehmiger (konfigurierbar, Pro-Di-Default: Schichtleiter) erhält In-App-Notification
3. Genehmiger kann genehmigen (mit optionaler Anpassung der Stunden) oder ablehnen (mit Begründung)
4. Bei Genehmigung: MA kann normal arbeiten und stempeln, genehmigte Zusatzstunden werden als "genehmigt" markiert
5. Bei Ablehnung: MA wird benachrichtigt

### Flow B — Reaktiver Antrag ("Zeiterfassung wieder öffnen")
1. MA hat ausgestempelt, möchte weiterarbeiten → stellt Antrag "Zeiterfassung wieder öffnen" mit: Begründung, geschätzte Zusatzzeit
2. Genehmiger erhält Notification
3. Bei Genehmigung: MA kann sich erneut einstempeln (neues Booking-Paar wird erlaubt)
4. Tatsächlich gearbeitete Zeit wird nach Feierabend als Überstunden behandelt

### ArbZG-Validierung (serverseitig)
5. Bei Antragserstellung und -genehmigung werden ArbZG-Regeln geprüft:
   - Tageshöchstarbeitszeit max. 10h (§3 ArbZG)
   - Wochenhöchstarbeitszeit max. 48h im 6-Monats-Schnitt (§3 ArbZG)
   - Mindestruhezeit 11h zwischen zwei Arbeitstagen (§5 ArbZG)
   - Sonn-/Feiertagsverbot (§9 ArbZG)
6. Verletzungen werden als **Warnung** angezeigt (nicht als harter Block)
7. Genehmiger kann Warnung überschreiben — **Pflicht-Begründung** bei Überschreitung

### Genehmiger-Konfiguration
8. Pro Tenant konfigurierbar: Genehmiger-Rolle pro Antragstyp (Default: `SHIFT_LEADER`)
9. Vertretungsregel bei Abwesenheit des Genehmigers (Fallback auf nächsthöhere Ebene oder HR)
10. Mehrstufige Genehmigung als Konfigurations-Option: z.B. "ab 4h Überstunden auch HR-Freigabe nötig" (Pro-Di-Default: einstufig)

### Konfigurierbar pro Tenant
11. Vorlauffrist: Pro-Di keine, andere Kunden ggf. 24h
12. Maximalanzahl Überstunden pro Monat/Jahr (Warn-Schwelle, kein harter Block)
13. Genehmigungspflicht ja/nein (kleine Betriebe evtl. ohne)
14. Verwertungsdefault: Konto / Auszahlung / Freizeitausgleich (referenziert Ticket 3)

### Korrekturassistent-Integration
15. Ungenehmigte Mehrarbeit (Ist > Soll, kein Antrag vorhanden) erscheint im bestehenden Korrekturassistent als neuer ErrorCode (z.B. `UNAPPROVED_OVERTIME`)
16. HR/Schichtleiter entscheidet im Korrekturassistent pro Fall: nachträglich genehmigen (→ wandelt in genehmigten Überstundenantrag), ablehnen (Stunden verfallen), oder Klärung mit MA einleiten
17. Kein neuer Korrekturassistent — nur Integration in den bestehenden (neuer ErrorCode + Aktion)

## Test-Anforderungen

### Unit-Tests (Vitest)

Services/Functions unter Test:
- `OvertimeRequestService.create(tenantId, employeeId, input)` → Request-Erstellung + Genehmiger-Ermittlung
- `OvertimeRequestService.approve(tenantId, requestId, approverId, input)` → Genehmigung + ArbZG-Check
- `OvertimeRequestService.reject(tenantId, requestId, approverId, reason)` → Ablehnung
- `ArbZGValidator.validate(employeeId, date, plannedAdditionalMinutes)` → Warnings[]
- `ApprovalRuleResolver.resolveApprover(tenantId, requestType, employeeId)` → Approver-User(s)

Konkrete Test-Cases:
- **Vorab-Antrag Happy Path**: MA erstellt Antrag → Status "pending" → Genehmiger-Notification erstellt
- **Genehmigung**: pending → approved → MA-Notification erstellt
- **Ablehnung mit Begründung**: pending → rejected → Grund persistiert → MA-Notification
- **Doppel-Genehmigung**: Zweiter Approve auf already-approved → atomisch abgelehnt (wie bei Absenz)
- **ArbZG 10h-Warnung**: MA hat 8h Soll + 3h Antrag = 11h → Warning DAILY_MAX_EXCEEDED
- **ArbZG 11h-Ruhezeit**: Letzte Ausstempelung 23:00, Antrag für 06:00 nächsten Tag → Warning REST_TIME_VIOLATED
- **ArbZG Sonntagsverbot**: Antrag für Sonntag → Warning SUNDAY_WORK
- **ArbZG Kombination**: Mehrere Warnungen gleichzeitig → alle gelistet
- **ArbZG-Override mit Begründung**: Genehmiger genehmigt trotz Warnung → Begründung Pflicht → gespeichert
- **ArbZG-Override ohne Begründung**: Genehmiger genehmigt trotz Warnung ohne Begründung → Fehler
- **Genehmiger-Ermittlung Default**: Keine ApprovalRule konfiguriert → Fallback auf `absences.approve`-Permission-Holder
- **Genehmiger-Ermittlung konfiguriert**: ApprovalRule mit role=SHIFT_LEADER → Abteilungs-Team-Leader ermittelt
- **Genehmiger abwesend**: Vertretungsregel greift → Fallback-Genehmiger
- **Mehrstufig**: Ab 4h → zweite Stufe (HR) → beide müssen genehmigen
- **Verwertungsdefault**: Kein Verwertungswunsch im Antrag → Default aus Ticket 3 verwendet
- **Reaktiv-Flow**: Antrag "reopen" → Genehmigung → MA kann neues Booking erstellen (Validierung dass Booking nach Antragserstellung liegt)
- **Korrekturassistent-Integration**: DailyValue mit Überstunden ohne Antrag → errorCode UNAPPROVED_OVERTIME in errorCodes[]

### Integration-Tests (Vitest, describe.sequential, echte DB)

- **Vorab-Antrag End-to-End**: MA erstellt Antrag → Genehmiger genehmigt → MA stempelt Überstunden → DailyCalc → DailyValue.overtime korrekt → Antrag als "fulfilled" markiert
- **Reaktiv-Antrag End-to-End**: MA stempelt aus → stellt Reopen-Antrag → Genehmiger genehmigt → MA stempelt ein → neues Booking-Paar → DailyCalc korrekt
- **Ungenehmigte Überstunden → Korrekturassistent**: MA stempelt 2h länger ohne Antrag → DailyCalc → DailyValue.errorCodes enthält UNAPPROVED_OVERTIME → Korrekturassistent listItems() zeigt den Fall
- **ArbZG-Validierung im Flow**: Antrag → ArbZG-Warnings → Genehmiger sieht Warnings → genehmigt mit Begründung → Warning-Override persistiert
- **Multi-Tenant-Isolation**: Tenant A Antrag → Tenant B sieht ihn nicht
- **Genehmigungs-Konfiguration**: ApprovalRule für Tenant anlegen → Antrag erstellen → korrekter Genehmiger erhält Notification

### Browser-E2E-Tests (Playwright)

- **MA stellt Vorab-Antrag**: Login als MA → Überstundenantrag → Formular ausfüllen → Absenden → Bestätigung sichtbar
- **Schichtleiter genehmigt**: Login als Schichtleiter → Genehmigungen → Überstundenantrag sichtbar → Genehmigen → MA sieht Genehmigung
- **Schichtleiter lehnt ab**: Login als Schichtleiter → Ablehnen mit Begründung → MA sieht Ablehnung
- **ArbZG-Warnung im UI**: Antrag der ArbZG verletzt → Warnung im Genehmigungs-Dialog → Begründungsfeld Pflicht → Genehmigen
- **Multi-User-Flow**: MA stellt Antrag → Schichtleiter genehmigt → MA sieht Genehmigung (beide Rollen in einem Test)
- **Admin konfiguriert Genehmiger**: Admin → Einstellungen → Genehmiger-Konfiguration → Rolle wählen → Speichern → Antrag wird an neuen Genehmiger geroutet

## Offene Fragen für Pro-Di

1. **Ist Überstundenantrag neu?**: Hat Pro-Di heute überhaupt einen formalisierten Prozess, oder läuft das "auf Zuruf"?
2. **Vorlauffrist**: Gibt es eine Mindestvorlaufzeit für Vorab-Anträge?
3. **Verwertungs-Default**: Standard "aufs Konto" oder "Auszahlung"?
4. **Mehrstufig**: Ab welcher Stundenzahl soll eine zweite Genehmigungsstufe (HR) greifen?
5. **Reaktiv-Flow Praxis**: Wie häufig kommt es vor, dass MAs "wieder einstempeln" müssen? Ist das ein realistischer Use Case?
6. **Genehmiger bei Abwesenheit**: Wer genehmigt, wenn der Schichtleiter krank/im Urlaub ist?
7. **Maximale Überstunden**: Gibt es eine harte Grenze pro Monat/Quartal?

## Technische Skizze

### Betroffene Komponenten

| Komponente | Änderung |
|---|---|
| `prisma/schema.prisma` | Neue Modelle: `OvertimeRequest` (Antrag), `ApprovalRule` (Genehmiger-Konfiguration), `OvertimeRequestConfig` (Tenant-Settings) |
| `supabase/migrations/` | Migration für neue Tabellen |
| `src/lib/services/overtime-request-service.ts` | Neuer Service: CRUD, Genehmigung, Ablehnung, ArbZG-Check |
| `src/lib/services/arbzg-validator.ts` | Neue Pure-Logic: ArbZG-Regeln prüfen |
| `src/lib/services/approval-rule-service.ts` | Neuer Service: Genehmiger-Ermittlung basierend auf ApprovalRule + Vertretung |
| `src/lib/services/daily-calc.ts` | Erweiterung: UNAPPROVED_OVERTIME ErrorCode in `DailyValue.errorCodes` setzen |
| `src/lib/services/correction-assistant-service.ts` | Neuer ErrorCode `UNAPPROVED_OVERTIME` in Default-Message-Catalog |
| `src/trpc/routers/overtimeRequests.ts` | Neuer Router: create, approve, reject, list, getById |
| `src/trpc/routers/approvalRules.ts` | Neuer Router: CRUD für Genehmiger-Konfiguration |
| `src/app/[locale]/(dashboard)/` | Neue UI-Seiten: Antragsformular (MA), Genehmigungsliste (Schichtleiter), Konfiguration (Admin) |

### Architektur: Anlehnung an Absenz-Flow

Der `OvertimeRequest`-Flow ist bewusst analog zum `AbsenceDay`-Flow modelliert:
- Status-State-Machine: `pending` → `approved` / `rejected` / `cancelled`
- Atomischer Statuswechsel via `updateIfStatus()` (wie in `absences-repository.ts`)
- Genehmiger-Ermittlung: Analog zu `findApproverUserIds()`, aber über konfigurierbare `ApprovalRule` statt hardcoded Permission-Check
- Notifications: Gleicher Mechanismus (`prisma.notification.create` + PubSub)

### OvertimeRequest-Modell (Skizze)

```
OvertimeRequest {
  id, tenantId, employeeId
  requestType: PLANNED | REOPEN
  requestDate: Date            // Tag der geplanten Überstunden
  plannedMinutes: Int          // geplante Zusatzminuten
  actualMinutes: Int?          // tatsächlich gearbeitete (nach Abschluss)
  reason: String
  utilizationType: ACCOUNT | PAYOUT | TIME_OFF  // Verwertungswunsch
  status: pending | approved | rejected | cancelled
  approvedBy, approvedAt, rejectionReason
  arbzgWarnings: String[]      // ArbZG-Warnungen bei Genehmigung
  arbzgOverrideReason: String? // Pflicht-Begründung bei Override
}
```

### ApprovalRule-Modell (Skizze)

```
ApprovalRule {
  id, tenantId
  requestType: OVERTIME | ABSENCE | CORRECTION  // erweiterbar
  approverRole: SHIFT_LEADER | DEPARTMENT_MANAGER | HR | ADMIN
  thresholdMinutes: Int?       // ab X Minuten → diese Stufe
  stage: Int                   // 1 = erste Stufe, 2 = zweite etc.
  isActive: Boolean
}
```

## Risiko / Komplexität

**T-Shirt-Größe: XL**

- Größtes Ticket: zwei Flows, ArbZG-Validierung, Genehmiger-Konfiguration, Korrekturassistent-Integration
- ArbZG-Berechnung (6-Monats-Schnitt für 48h/Woche) ist komplex
- Genehmiger-Ermittlung mit Vertretung und Mehrstufigkeit ist nicht trivial
- Integration in bestehenden DailyCalc (UNAPPROVED_OVERTIME) muss sauber sein
- UI-Aufwand groß: Antragsformular, Genehmigungsliste, ArbZG-Warnungs-Dialog, Konfigurations-Seite
- **Test-Aufwand: ~40-50% der Implementierungszeit** (Multi-User-Flows, ArbZG-Edge-Cases)

## Abhängigkeiten

- **Ticket 3 (Überstunden-Auszahlung)**: Der Verwertungsdefault (Konto/Auszahlung) referenziert die dort konfigurierte Regel. Kann aber mit Fallback-Default implementiert werden, auch wenn Ticket 3 noch nicht fertig ist.
- **Ticket 1 (Nachtschicht-Bewertung)**: ArbZG-Validierung muss Nachtschichten korrekt bewerten (10h = Schichtdauer, nicht Kalendertag-Arbeitszeit)

## Out of Scope

- Automatische Schichtplan-Anpassung bei genehmigten Überstunden
- Überstunden-Statistik/Reporting (Dashboard)
- Mehrstufige Genehmigung für Absenz-Anträge (nur für Überstunden in diesem Ticket)
- Antragswesen-Generalisierung (Sonderurlaub, Schichttausch etc. — Post-Launch)
- Email-Notifications an Genehmiger
