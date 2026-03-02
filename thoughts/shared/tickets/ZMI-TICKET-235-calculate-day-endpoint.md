# ZMI-TICKET-235: Calculate-Day Endpoint + Booking Create mit Recalc

Status: Proposed
Priority: P1
Owner: TBD

## Goal
tRPC-Endpoints für die Tagesberechnung und die Verknüpfung von Booking-Mutationen mit automatischer Neuberechnung. Wenn eine Buchung erstellt/geändert/gelöscht wird, wird der betroffene Tag automatisch neu berechnet.

## Scope
- **In scope:**
  - tRPC `calculateDay` Endpoint (manuelle Neuberechnung)
  - Booking-Mutationen mit Recalc-Trigger erweitern
  - Employee Day View Endpoint (Tagesansicht mit Buchungen + DailyValue)
  - Frontend-Hooks Migration
- **Out of scope:**
  - Forward-Recalculation-Cascade (TICKET-243)
  - Monthly Recalculation (TICKET-238)

## Requirements

### tRPC Router Erweiterungen

#### In `employees` Router:
- `employees.dayView` (query) — Tagesansicht eines Mitarbeiters
  - Input: `{ employeeId, date }`
  - Output: `{ bookings: Booking[], dayPlan: EmployeeDayPlan?, dailyValue: DailyValue?, tariff: Tariff? }`
  - Middleware: `requireEmployeePermission("bookings.read_own", "bookings.read")`

- `employees.calculateDay` (mutation) — Manuelle Neuberechnung
  - Input: `{ employeeId, date }`
  - Output: `DailyValue`
  - Middleware: `requirePermission("daily_values.write")`
  - Logik: Ruft `DailyCalcService.calculateDay()` auf

#### In `bookings` Router (Erweiterung von TICKET-232):
- `bookings.create` → nach erfolgreicher Erstellung: `DailyCalcService.calculateDay()`
- `bookings.update` → nach Update: Recalc des betroffenen Tages
- `bookings.delete` → nach Löschung: Recalc des betroffenen Tages

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-employee-day.ts` → `trpc.employees.dayView`, `trpc.employees.calculateDay`
- `apps/web/src/hooks/api/use-team-day-views.ts` → Parallel tRPC Queries für mehrere Employees

### Business Logic (aus Go portiert)
- Day View aus `apps/api/internal/service/evaluation.go` (564 Zeilen, Teile davon)
- Calculate-Day-Trigger aus `apps/api/internal/handler/booking.go` (Recalc nach Mutation)

## Acceptance Criteria
- [ ] Employee Day View gibt Buchungen + DayPlan + DailyValue zurück
- [ ] Manuelle Neuberechnung über calculateDay Endpoint
- [ ] Booking Create/Update/Delete löst automatisch Recalc aus
- [ ] Frontend-Hooks nutzen tRPC statt fetch
- [ ] Recalc-Ergebnis ist sofort in der Day View sichtbar
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: Day View lädt alle Daten korrekt
- Unit-Test: Booking Create → Recalc → DailyValue aktualisiert
- Unit-Test: Booking Delete → Recalc → DailyValue aktualisiert
- Integration-Test: Buchung erstellen → Tag neu berechnen → Ergebnis prüfen
- E2E-Test: Buchungs-Eingabe → DailyValue-Anzeige aktualisiert sich

## Dependencies
- ZMI-TICKET-232 (Bookings CRUD)
- ZMI-TICKET-234 (DailyCalcService Port)
- ZMI-TICKET-229 (Employee Day Plans — für DayPlan in Day View)

## Go-Dateien die ersetzt werden
- Teile von `apps/api/internal/service/evaluation.go` (Day-View-Logik)
- Teile von `apps/api/internal/handler/booking.go` (Recalc-Trigger)
- `apps/api/internal/handler/evaluation.go` (331 Zeilen — Day-View-Handler)
- `apps/web/src/hooks/api/use-employee-day.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-team-day-views.ts` (Frontend-Hook)
