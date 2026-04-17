# VI-Wochenenden (Optionale Schichten / Verfügbarkeitsabsicherung)

## Kontext

Anforderung aus dem HR-Gespräch mit Pro-Di am 15.04.2026. Pro-Di bietet Wochenend-Schichten als optionales Angebot an MAs an (Verfügbarkeitsabsicherung = VI). MAs können annehmen oder ablehnen, ohne dass HR einzeln nachfragen muss.

**Vertikal-relevant**: Optionale Schichten sind relevant für jeden Betrieb mit flexiblem Wochenend- oder Zusatzbedarf — Logistik, Reinigung, Gastronomie, Produktion. Die Implementierung als `assignmentType` auf dem Schichtmodell ist generisch.

## Problem / Pain Point

**Ist-Zustand im Code**:
- `Shift`-Modell: `code`, `name`, `dayPlanId`, `color`, `isActive`, `sortOrder` — kein Konzept von "optional"
- `ShiftAssignment`: Zuweisung eines MA zu einer Schicht mit `validFrom`/`validTo` — keine Annahme/Ablehnung
- `EmployeeDayPlan`: Materialisierter Tagesplan — wird automatisch aus ShiftAssignment generiert
- **Was fehlt**: Kein Unterschied zwischen Pflichtschicht und optionalem Angebot. Kein Annahme-/Ablehnungs-Workflow für MAs. HR muss Wochenend-Schichten per WhatsApp/Telefon anbieten und Rückmeldungen manuell pflegen.

## Akzeptanzkriterien

1. **ShiftAssignment.assignmentType**: Neues Feld auf `ShiftAssignment` mit Werten `MANDATORY` (default, bestehendes Verhalten) und `OPTIONAL_OFFER`
2. **Optionale Schichten in MA-App**: MA sieht in der Schichtansicht/Kalender optionale Schichten markiert (z.B. andere Farbe, Badge "Optional")
3. **Annahme/Ablehnung**: MA kann optionale Schichten per Button annehmen oder ablehnen. Status-Feld auf ShiftAssignment: `responseStatus` mit Werten `PENDING`, `ACCEPTED`, `DECLINED`
4. **Notification bei neuem Angebot**: MA erhält In-App-Notification wenn eine optionale Schicht zugewiesen wird
5. **Notification bei Annahme**: Schichtleiter/HR erhält Notification wenn ein MA eine optionale Schicht annimmt oder ablehnt
6. **EmployeeDayPlan-Generierung**: Akzeptierte optionale Schichten werden in `EmployeeDayPlan` materialisiert (wie Pflichtschichten). Abgelehnte oder unbeantwortete werden NICHT materialisiert → keine Soll-Arbeitszeit, keine Fehlzeit.
7. **Antwortfrist**: Optional konfigurierbare Antwortfrist pro Tenant. Nach Ablauf: Status → `EXPIRED`, keine Materialisierung.
8. **Übersicht für HR**: Schichtplan-Ansicht zeigt pro optionaler Schicht: wie viele Angebote, wie viele angenommen, wie viele abgelehnt, wie viele ausstehend.
9. **Filter**: Schichtplan filterbar nach "nur optionale" / "nur Pflicht" / "alle"

## Test-Anforderungen

### Unit-Tests (Vitest)

Services/Functions unter Test:
- `ShiftAssignmentService.create(input)` — mit `assignmentType`
- `ShiftAssignmentService.respond(assignmentId, employeeId, response)` — Annahme/Ablehnung
- `EmployeeDayPlanGenerator.shouldMaterialize(assignment)` → boolean

Konkrete Test-Cases:
- **Pflichtschicht (Rückwärtskompatibel)**: assignmentType=MANDATORY → sofort materialisiert → responseStatus irrelevant
- **Optionale Schicht erstellt**: assignmentType=OPTIONAL_OFFER → responseStatus=PENDING → nicht materialisiert
- **Optionale Schicht angenommen**: respond(ACCEPTED) → materialisiert → EmployeeDayPlan erstellt
- **Optionale Schicht abgelehnt**: respond(DECLINED) → nicht materialisiert → kein EmployeeDayPlan
- **Doppel-Response**: Bereits ACCEPTED → nochmal respond → Fehler
- **Antwort durch falschen MA**: Employee B versucht für Assignment von Employee A zu antworten → Fehler
- **Antwortfrist abgelaufen**: Frist gesetzt, heute > Frist → Status EXPIRED, Antwort nicht mehr möglich
- **Keine Antwortfrist**: Frist null → unbegrenzt PENDING
- **Materialisierung prüft Status**: Generator iteriert ShiftAssignments → überspringt OPTIONAL_OFFER mit status != ACCEPTED

### Integration-Tests (Vitest, describe.sequential, echte DB)

- **End-to-End optionale Schicht**: Shift erstellen → ShiftAssignment mit OPTIONAL_OFFER → EmployeeDayPlan prüfen (nicht vorhanden) → MA akzeptiert → EmployeeDayPlan materialisiert → DailyCalc für den Tag zeigt Soll-Zeit
- **Ablehnung → kein Soll**: Optionale Schicht → MA lehnt ab → kein EmployeeDayPlan → DailyCalc zeigt keinen Fehler für fehlende Buchung
- **Notification-Flow**: Schicht zuweisen → MA-Notification prüfen → MA akzeptiert → Schichtleiter-Notification prüfen
- **Multi-Tenant-Isolation**: Tenant A optionale Schicht → Tenant B sieht sie nicht
- **Antwortfrist-Cron**: Optionale Schicht mit Frist gestern → Cron/Trigger → Status EXPIRED

### Browser-E2E-Tests (Playwright)

- **HR erstellt optionale Schicht**: Login als HR → Schichtplan → Wochenend-Schicht erstellen → assignmentType "Optional" wählen → MAs zuweisen → Speichern
- **MA sieht Angebot**: Login als MA → Kalender/Schichtplan → optionale Schicht sichtbar (markiert) → "Annehmen"-Button → Bestätigung
- **MA lehnt ab**: Login als MA → "Ablehnen"-Button → Bestätigung → Schicht verschwindet aus dem Soll-Plan
- **HR sieht Rücklauf**: Login als HR → Schichtplan → optionale Wochenend-Schicht → Übersicht "3 angenommen, 2 abgelehnt, 1 ausstehend"
- **Konfiguration Antwortfrist**: Admin → Einstellungen → Optionale Schichten → Antwortfrist konfigurieren

## Offene Fragen für Pro-Di

1. **Wer erstellt optionale Schichten?**: HR, Schichtleiter, oder beide?
2. **Antwortfrist**: Wie lange haben MAs Zeit zum Antworten? 24h? 48h? Keine Frist?
3. **Mindestbesetzung**: Gibt es eine Mindestanzahl MAs, die annehmen müssen, bevor die Schicht "stattfindet"? Oder reicht ein MA?
4. **Zuschläge**: Erhalten MAs, die optionale Wochenend-Schichten annehmen, einen Zuschlag (→ Verknüpfung mit Ticket 2)?
5. **Wiederholungs-Muster**: Sind VI-Wochenenden regelmäßig (jedes Wochenende) oder ad-hoc?
6. **Absage nach Annahme**: Kann ein MA nach Annahme noch absagen? Falls ja: bis wann?

## Technische Skizze

### Betroffene Komponenten

| Komponente | Änderung |
|---|---|
| `prisma/schema.prisma` | `ShiftAssignment`: neue Felder `assignmentType` (ENUM), `responseStatus` (ENUM), `responseAt`, `responseDeadline` |
| `supabase/migrations/` | ALTER TABLE `shift_assignments` ADD COLUMN ... |
| `src/lib/services/shift-service.ts` | Erweitern: create mit assignmentType, respond-Methode |
| `src/lib/services/employee-day-plans-service.ts` | Materialisierungslogik: OPTIONAL_OFFER nur bei ACCEPTED materialisieren |
| `src/trpc/routers/shifts.ts` | Erweitern: respond-Procedure für MA |
| `src/app/[locale]/(dashboard)/` | Schichtplan-UI: optionale Markierung, Annahme/Ablehnung-Buttons, Rücklauf-Übersicht |
| `src/components/` | Neue Komponenten: OptionalShiftBadge, ShiftResponseButton, ShiftResponseSummary |

### Design-Entscheidung: Feld auf ShiftAssignment vs. eigenes Modell

Empfehlung: Felder direkt auf `ShiftAssignment` (nicht eigenes Modell), weil:
- Semantisch klar: Eine Zuweisung ist entweder Pflicht oder optional
- Kein N:M-Problem (ein Assignment = ein MA + eine Schicht + ein Zeitraum)
- Rückwärtskompatibel: Default `MANDATORY`, bestehende Daten unverändert

### EmployeeDayPlan-Materialisierung

Der bestehende Generator (der aus ShiftAssignment → EmployeeDayPlan materialisiert) bekommt eine Filterbedingung:

```typescript
// Pseudo-Code
if (assignment.assignmentType === 'OPTIONAL_OFFER' && assignment.responseStatus !== 'ACCEPTED') {
  skip; // nicht materialisieren
}
```

Das stellt sicher, dass nicht angenommene optionale Schichten keine Soll-Arbeitszeit erzeugen und damit auch keine Fehlzeit-Meldung im DailyCalc.

## Risiko / Komplexität

**T-Shirt-Größe: M**

- Schema-Erweiterung auf bestehendes Modell (geringes Migrations-Risiko, neue Felder sind nullable/defaulted)
- Materialisierungslogik muss sauber angepasst werden (Risiko: EmployeeDayPlan-Generation ist evtl. an mehreren Stellen implementiert)
- UI-Aufwand moderat: bestehende Schichtplan-Ansicht erweitern
- **Test-Aufwand: ~30% der Implementierungszeit**

## Abhängigkeiten

- **Keine harten Abhängigkeiten** zu anderen Tickets
- Ticket 2 (Zuschläge): Optionale Wochenend-Schichten könnten eigene Zuschlagsregeln haben — aber das wird über die bestehende DayPlan-Zuschlagslogik abgedeckt
- Ticket 6 ("Keine Zeiten erfasst"): Wenn eine optionale Schicht nicht angenommen wird, darf der Missing-Time-Workflow den Tag NICHT als "fehlend" melden

## Out of Scope

- Schichttausch zwischen MAs (Post-Launch Antragswesen)
- KI-Schichtplanung / Optimierung
- Mindestbesetzungs-Prüfung (könnte als Follow-Up implementiert werden)
- Push-Notifications (nur In-App)
- Automatische Wiederholungsmuster für VI-Wochenenden (erst bei Bedarf)
