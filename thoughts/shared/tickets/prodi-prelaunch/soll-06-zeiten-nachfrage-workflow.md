# "Keine Zeiten erfasst"-Workflow (Nachfrage an Mitarbeiter)

## Kontext

Anforderung aus dem HR-Gespräch mit Pro-Di am 15.04.2026. HR verbringt viel Zeit damit, MAs hinterherzutelefonieren, die vergessen haben zu stempeln oder deren Abwesenheit nicht dokumentiert ist.

**Vertikal-relevant**: Jeder Betrieb mit Zeiterfassung hat das Problem fehlender Buchungen. Der Workflow ("Was war an Tag X?") ist generisch nutzbar. Die verfügbaren Klassifizierungs-Optionen können pro Tenant konfiguriert werden.

## Problem / Pain Point

**Ist-Zustand im Code**:
- `DailyCalcService.handleNoBookings()` behandelt fehlende Buchungen bereits: je nach `DayPlan.noBookingBehavior` wird entweder ein Fehler gesetzt, das Soll übernommen, oder abgezogen
- `DailyValue.errorCodes` enthält bereits relevante Codes: `MISSING_COME`, `NO_BOOKINGS`, `UNPAIRED_BOOKING`
- Korrekturassistent zeigt diese Fehler dem HR an
- **Was fehlt**: Es gibt keinen proaktiven Workflow Richtung Mitarbeiter. HR muss den Korrekturassistent manuell durchgehen und jeden MA einzeln kontaktieren. Es gibt keine Schnellauswahl für den MA ("Was war an Tag X?" → Urlaub/Krank/Gleitzeit/Vergessen)

## Akzeptanzkriterien

1. **Automatische Erkennung**: Täglicher oder wöchentlicher Job erkennt MAs mit fehlendem Soll: `EmployeeDayPlan.dayPlanId != null` (Arbeitstag) UND keine `Booking`-Einträge für den Tag UND keine `AbsenceDay`-Einträge für den Tag → "unklassifizierter Fehltag"
2. **MA-Notification mit Schnellauswahl**: Betroffene MAs erhalten eine In-App-Notification: "Am [Datum] fehlt eine Zeitbuchung. Was war los?" mit Schnellauswahl-Optionen:
   - Urlaub (→ erstellt AbsenceDay mit passendem AbsenceType)
   - Krank (→ erstellt AbsenceDay mit Krank-Type)
   - Gleitzeit / Freizeitausgleich (→ erstellt AbsenceDay mit Gleitzeit-Type)
   - Vergessen zu stempeln (→ öffnet Buchungskorrekturdialog)
   - Sonstiges (→ Freitextfeld, geht an HR zur Klärung)
3. **Konfigurierbare Optionen**: Pro Tenant konfigurierbar welche Optionen angeboten werden (z.B. "Sonderurlaub" als zusätzliche Option). Jede Option mappt auf einen AbsenceType oder eine Aktion.
4. **Konfigurierbare Zeitpunkte**: Tenant-Setting: täglicher Check (z.B. morgens um 08:00 für Vortag) oder wöchentlicher Check (montags für Vorwoche)
5. **Eskalation**: Wenn MA nach X Tagen nicht reagiert → Notification an Vorgesetzten (Abteilungsleiter oder Schichtleiter)
6. **MA-Self-Service**: MA kann direkt aus der Notification die Klassifizierung vornehmen. Bei "Urlaub" oder "Krank" wird automatisch ein AbsenceDay erstellt (ggf. mit Auto-Approve je nach AbsenceType-Config)
7. **HR-Nachverfolgung**: HR sieht im Dashboard eine Übersicht offener "Nachfragen" und deren Status (beantwortet/eskaliert/offen)
8. **Keine Doppel-Nachfrage**: Pro Employee+Datum wird maximal eine Nachfrage erstellt. Nachfragen für Tage, die nachträglich eine Buchung oder Absenz erhalten, werden automatisch als "erledigt" markiert.

## Test-Anforderungen

### Unit-Tests (Vitest)

Services/Functions unter Test:
- `MissingTimeService.detectMissingDays(tenantId, dateRange)` → `{ employeeId, date }[]`
- `MissingTimeService.processClassification(inquiryId, classification, metadata)` → erstellt AbsenceDay oder leitet an HR
- `MissingTimeService.checkAutoResolve(inquiryId)` → prüft ob inzwischen Buchung/Absenz existiert

Konkrete Test-Cases:
- **Happy Path**: MA hat Arbeitstag (DayPlan != null) + keine Booking + keine AbsenceDay → erkannt
- **Freier Tag**: DayPlan == null → nicht erkannt
- **Wochenende**: Kein EmployeeDayPlan → nicht erkannt
- **Urlaubstag**: AbsenceDay vorhanden → nicht erkannt
- **Booking vorhanden**: Mindestens eine Booking → nicht erkannt
- **Teilbuchung**: Nur ein "In" ohne "Out" → wird NICHT hier erkannt (das ist UNPAIRED_BOOKING im Korrekturassistent)
- **MA klassifiziert "Urlaub"**: Inquiry → "Urlaub" gewählt → AbsenceDay mit Urlaub-Type erstellt → Inquiry als "resolved" markiert
- **MA klassifiziert "Krank"**: Analog mit Krank-Type
- **MA klassifiziert "Vergessen"**: Inquiry → "Vergessen" → Status bleibt "pending", HR wird informiert für manuelle Korrektur
- **Auto-Resolve**: Inquiry erstellt → nachträglich Buchung erfasst → Inquiry automatisch "resolved"
- **Eskalation nach X Tagen**: Inquiry seit 3 Tagen offen → Eskalations-Notification an Vorgesetzten
- **Keine Doppel-Inquiry**: Selber MA+Datum → nur eine Inquiry, auch wenn Job zweimal läuft
- **Konfigurierbare Optionen**: Tenant hat "Sonderurlaub" als Extra-Option → erscheint in der Auswahl

### Integration-Tests (Vitest, describe.sequential, echte DB)

- **Cron-Job End-to-End**: MAs mit verschiedenen Szenarien anlegen (fehlend, Urlaub, Buchung vorhanden) → Job ausführen → korrekte Inquiries + Notifications erstellt
- **Klassifizierung → AbsenceDay**: Inquiry erstellen → MA klassifiziert "Urlaub" → AbsenceDay-Row in DB prüfen → VacationBalance aktualisiert (wenn deductsVacation=true)
- **Multi-Tenant-Isolation**: Tenant A und B → Job läuft → Inquiries korrekt getrennt
- **Auto-Resolve-Flow**: Inquiry erstellt → Buchung nacherfasst → Auto-Resolve-Check → Inquiry resolved

### Browser-E2E-Tests (Playwright)

- **MA erhält Nachfrage**: Login als MA → Notification "Fehlende Zeit am [Datum]" sichtbar → Klick → Schnellauswahl-Dialog
- **MA klassifiziert**: Schnellauswahl "Urlaub" → Bestätigung → Notification als gelesen markiert → Urlaubstag im Kalender sichtbar
- **HR sieht Übersicht**: Login als HR → Dashboard → "Offene Zeitnachfragen"-Widget → Liste der unbearbeiteten Fälle
- **Konfiguration**: Admin → Einstellungen → Zeitnachfrage → Check-Frequenz + Optionen + Eskalationsfrist konfigurieren

## Offene Fragen für Pro-Di

1. **Check-Frequenz**: Täglicher oder wöchentlicher Check? Täglicher Check = mehr Notifications aber schnellere Klärung
2. **Eskalationsfrist**: Nach wie vielen Tagen soll an den Vorgesetzten eskaliert werden?
3. **Optionen-Liste**: Welche Klassifizierungen sollen angeboten werden? Standard: Urlaub, Krank, Gleitzeit, Vergessen, Sonstiges. Weitere?
4. **Auto-Approve bei Krank**: Soll "Krank" aus der Schnellauswahl direkt als genehmigt gelten (wie bei AbsenceType.requiresApproval=false)?
5. **Wer erhält die Nachfrage**: Nur der MA? Oder auch direkt der Vorgesetzte?
6. **"Vergessen zu stempeln"**: Soll der MA seine Zeiten direkt nachtragen können, oder muss HR das machen?

## Technische Skizze

### Betroffene Komponenten

| Komponente | Änderung |
|---|---|
| `prisma/schema.prisma` | Neue Modelle: `MissingTimeInquiry`, `MissingTimeConfig` (Tenant-Settings), `MissingTimeOption` (konfigurierbare Optionen) |
| `supabase/migrations/` | Migration für neue Tabellen |
| `src/lib/services/missing-time-service.ts` | Neuer Service: Detection, Inquiry-CRUD, Klassifizierung, Auto-Resolve |
| `src/app/api/cron/missing-time-check/route.ts` | Neuer Cron-Job |
| `src/trpc/routers/missingTimeInquiries.ts` | Neuer Router: list, classify, resolve, config |
| `src/components/` | Schnellauswahl-Dialog, Dashboard-Widget |
| `src/lib/services/absences-service.ts` | Wird aufgerufen bei Klassifizierung "Urlaub"/"Krank" (kein Umbau, nur Nutzung) |

### Detection-Logik (Cron)

```sql
-- Pseudo-Query: Arbeitstage ohne Buchung und ohne Absenz
SELECT edp.employee_id, edp.plan_date
FROM employee_day_plans edp
WHERE edp.day_plan_id IS NOT NULL                           -- Arbeitstag
  AND edp.plan_date BETWEEN :from AND :to
  AND NOT EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.employee_id = edp.employee_id
      AND b.booking_date = edp.plan_date
      AND b.tenant_id = edp.tenant_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM absence_days ad
    WHERE ad.employee_id = edp.employee_id
      AND ad.absence_date = edp.plan_date
      AND ad.tenant_id = edp.tenant_id
      AND ad.status != 'cancelled'
  )
  AND NOT EXISTS (
    SELECT 1 FROM missing_time_inquiries mti
    WHERE mti.employee_id = edp.employee_id
      AND mti.inquiry_date = edp.plan_date
      AND mti.tenant_id = edp.tenant_id
  )
```

### Interaktion mit bestehendem System

- **Kein Umbau** des DailyCalcService oder Korrekturassistent
- Detection ist eigenständig (eigene Tabelle, eigener Cron)
- Klassifizierung ruft bestehende Services auf: `absencesService.createRange()` für Urlaub/Krank
- Korrekturassistent bleibt parallel als HR-Tool bestehen — die Nachfrage ergänzt ihn für den MA-Self-Service-Kanal

## Risiko / Komplexität

**T-Shirt-Größe: M**

- Klar abgegrenzt: Detection-Query + Notification + Schnellauswahl + Cron
- Hauptrisiko: Performance der Detection-Query bei vielen MAs und großen Datumsräumen
- Interaktion mit Absenz-Service (Klassifizierung erstellt AbsenceDay) muss sauber sein
- **Test-Aufwand: ~35% der Implementierungszeit** (Cron-Edge-Cases, Auto-Resolve, Multi-Tenant)

## Abhängigkeiten

- **Keine harten technischen Abhängigkeiten** zu anderen Tickets
- Profitiert von Ticket 1 (Nachtschicht-Bewertung): korrekte Tageszuordnung bei Nachtschicht-MAs, die keinen Eintrag für einen "logischen Arbeitstag" haben

## Out of Scope

- Automatische Buchungs-Nachtragung (MA trägt direkt Zeiten ein) — bleibt beim bestehenden Buchungskorrektur-Dialog
- Email-Notifications
- Integration mit externen Zeiterfassungsterminals (automatische Erkennung "Terminal offline")
- Reporting (wie viele MAs vergessen regelmäßig zu stempeln)
