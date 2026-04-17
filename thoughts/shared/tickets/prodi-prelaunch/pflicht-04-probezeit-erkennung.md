# Probezeit-Erkennung + Reminder

## Kontext

Anforderung aus dem HR-Gespräch mit Pro-Di am 15.04.2026. HR verliert den Überblick über auslaufende Probezeiten und verpasst Fristen für Probezeit-Gespräche und Entscheidungen über Weiterbeschäftigung.

**Vertikal-relevant**: Jeder Betrieb hat Probezeiten. Die Dauer variiert (3 oder 6 Monate, je nach Vertrag/Tarif). Das Feature ist generisch nutzbar.

## Problem / Pain Point

**Ist-Zustand im Code**:
- `Employee.entryDate` existiert (Eintrittsdatum)
- `Employee.probationMonths` existiert (`Int?`, SmallInt) — hinzugefügt in Migration `20260416100000`
- `Employee.contractType` existiert (`VarChar(30)?`)
- Es gibt KEIN Dashboard-Widget, keine automatische Probezeit-Ende-Berechnung, keine Reminder
- HR führt eine manuelle Excel-Liste mit Probezeit-Enden und prüft wöchentlich

## Akzeptanzkriterien

1. **Probezeit-Ende-Berechnung**: `probationEndDate = entryDate + probationMonths Monate`. Wenn `probationMonths` nicht gesetzt: Tenant-Default (konfigurierbar, Standard 6 Monate).
2. **Dashboard-Widget**: HR-Dashboard zeigt "Probezeiten enden in den nächsten 30 Tagen" als Karte/Widget mit Liste der betroffenen MAs (Name, Abteilung, Eintrittsdatum, Probezeit-Ende-Datum, verbleibende Tage).
3. **Reminder-Notifications**: Automatische In-App-Notifications an HR-Verantwortliche X Wochen vor Probezeit-Ende. Default-Zeitpunkte: 4 Wochen, 2 Wochen, 1 Woche vor Ende.
4. **Reminder-Konfiguration**: Pro Tenant konfigurierbar: Anzahl und Zeitpunkte der Reminder (z.B. `[28, 14, 7]` Tage vor Ende), Empfänger (HR-Rolle, Abteilungsleiter, oder beides).
5. **Cron-Job**: Täglicher Cron-Job prüft Probezeit-Enden und erstellt Notifications.
6. **Probezeit-Status auf Mitarbeiter-Detailseite**: Badge/Indicator "In Probezeit" / "Probezeit abgelaufen" auf der Employee-Detailseite.
7. **Filter**: Mitarbeiterliste filterbar nach "In Probezeit" / "Probezeit endet in X Tagen".

## Test-Anforderungen

### Unit-Tests (Vitest)

Services/Functions unter Test:
- Neue Pure Function `calculateProbationEndDate(entryDate, probationMonths)` → Date
- `ProbationService.getUpcomingProbationEnds(tenantId, daysAhead)` → Employee[]
- `ProbationService.shouldSendReminder(employee, reminderConfig, today)` → boolean

Konkrete Test-Cases:
- **Happy Path**: entryDate=01.01.2026, probationMonths=6 → Probezeit-Ende=01.07.2026
- **3-Monats-Probezeit**: entryDate=01.03.2026, probationMonths=3 → Probezeit-Ende=01.06.2026
- **Null probationMonths, Tenant-Default**: probationMonths=null, tenantDefault=6 → Probezeit-Ende berechnet mit 6 Monaten
- **Schaltjahr**: entryDate=29.02.2024, probationMonths=12 → Probezeit-Ende=28.02.2025 (kein 29.02)
- **Monatsendefall**: entryDate=31.01.2026, probationMonths=1 → Probezeit-Ende=28.02.2026
- **Reminder 4 Wochen vorher**: Probezeit-Ende=01.07, heute=03.06, Reminder bei 28 Tagen → Reminder fällig
- **Reminder nicht fällig**: Probezeit-Ende=01.07, heute=01.05 → kein Reminder
- **Bereits abgelaufene Probezeit**: entryDate=01.01.2025, probationMonths=6, heute=16.04.2026 → Status "abgelaufen", keine Reminder
- **Kein Eintrittsdatum**: entryDate=null → kein Fehler, MA wird übersprungen
- **Ausgetretener MA**: exitDate gesetzt und in Vergangenheit → MA wird nicht berücksichtigt

### Integration-Tests (Vitest, describe.sequential, echte DB)

- **Cron-Job End-to-End**: MAs mit verschiedenen Probezeit-Enden anlegen → Cron-Job ausführen → Notifications prüfen (korrekte MAs, korrekte Empfänger, korrekte Texte)
- **Multi-Tenant-Isolation**: Tenant A und B haben MAs mit endender Probezeit → Tenant A sieht nur eigene MAs
- **Dashboard-Query**: MAs anlegen → Widget-Endpoint aufrufen → korrekte Liste zurück
- **Keine Doppel-Notifications**: Cron zweimal am selben Tag ausführen → nur einmal Notification pro MA pro Reminder-Stufe

### Browser-E2E-Tests (Playwright)

- **HR sieht Dashboard-Widget**: Login als HR → Dashboard → "Probezeiten"-Widget sichtbar → MA mit bald endender Probezeit gelistet
- **Employee-Detailseite**: MA in Probezeit → Badge "In Probezeit" sichtbar; MA nach Probezeit → kein Badge
- **Mitarbeiterliste filtern**: Filter "In Probezeit" → nur MAs in Probezeit sichtbar
- **Konfiguration**: Admin → Einstellungen → Probezeit-Reminder → Zeitpunkte ändern → Speichern

## Offene Fragen für Pro-Di

1. **Reminder-Empfänger**: Wer soll die Erinnerung bekommen? Nur HR? Auch der direkte Vorgesetzte (Abteilungsleiter)?
2. **Reminder-Zeitpunkte**: 4/2/1 Wochen vorher — passt das? Andere gewünscht?
3. **Standard-Probezeit**: 6 Monate für alle? Oder gibt es Mitarbeitergruppen mit 3 Monaten?
4. **Probezeit-Gespräch**: Soll es einen Workflow für das Probezeit-Gespräch geben (Termin, Ergebnis protokollieren)? Oder reicht der Reminder?
5. **Probezeitverlängerung**: Kann eine Probezeit verlängert werden? Falls ja: wie wird das dokumentiert?

## Technische Skizze

### Betroffene Komponenten

| Komponente | Änderung |
|---|---|
| `prisma/schema.prisma` | Neues Modell `ProbationReminderConfig` (tenant-level), `ProbationReminderLog` (sent-tracking) |
| `src/lib/services/probation-service.ts` | Neuer Service: Berechnung, Dashboard-Query, Cron-Logik |
| `src/app/api/cron/probation-reminders/route.ts` | Neuer Cron-Job (täglich) |
| `src/trpc/routers/` | Neuer Router oder Erweiterung des Employee-Routers |
| `src/components/dashboard/` | Neues Widget "Probezeiten" |
| `src/app/[locale]/(dashboard)/admin/employees/` | Filter + Badge auf Detailseite |

### Cron-Design

```
/api/cron/probation-reminders (täglich, 07:00 UTC)
  → für jeden Tenant:
    → ProbationReminderConfig laden (oder Default)
    → Employees mit probationEndDate in [heute, heute + maxReminder] laden
    → pro Employee + Reminder-Stufe:
      → ProbationReminderLog prüfen (schon gesendet?)
      → wenn nicht: Notification erstellen + Log-Eintrag
```

`ProbationReminderLog` verhindert Doppel-Notifications: `unique(tenantId, employeeId, reminderDaysBefore, year)`.

## Risiko / Komplexität

**T-Shirt-Größe: S**

- Reine Berechnung + Cron + UI-Widget, keine Änderung an bestehender Kernlogik
- `probationMonths` und `entryDate` existieren bereits
- Einziges Risiko: Datumsberechnung bei Monatsgrenzen (z.B. 31.01 + 1 Monat)
- **Test-Aufwand: ~30% der Implementierungszeit** (Cron-Logik und Dedup brauchen gute Coverage)

## Abhängigkeiten

- Keine Abhängigkeiten zu anderen Tickets
- Kann unabhängig und als erstes implementiert werden (Quick Win)

## Out of Scope

- Probezeit-Gespräch-Workflow (Termin planen, Ergebnis protokollieren)
- Automatische Vertragsänderung nach Probezeit-Ende (z.B. andere Kündigungsfrist)
- Email-Notifications (nur In-App)
- Probezeitverlängerung als eigenes Feature
