# ZMI-TICKET-232: Bookings CRUD (ohne Recalc-Trigger)

Status: Proposed
Priority: P1
Owner: TBD

## Goal
tRPC-Router für Buchungs-CRUD implementieren ohne Recalculation-Trigger. Buchungen (Zeitbuchungen) sind die Rohdaten der Zeiterfassung — Kommen/Gehen/Pause/etc. Die Neuberechnung nach Buchungsänderungen wird in TICKET-235 implementiert.

## Scope
- **In scope:**
  - tRPC `bookings` Router (CRUD + List mit Filtern)
  - Buchungs-Validierung (Zeitformat, Typ-Prüfung)
  - Paar-Buchungen (Start/Ende) Verknüpfung
  - Frontend-Hooks Migration
- **Out of scope:**
  - Recalculation-Trigger nach Buchungsänderung (TICKET-235)
  - Terminal-Import-Buchungen (TICKET-225)
  - Buchungs-Löschung durch Cleanup (TICKET-221)

## Requirements

### tRPC Router: `bookings`
- **Procedures:**
  - `bookings.list` (query) — Paginated mit umfangreichen Filtern
    - Input: `{ page?, pageSize?, employee_id?, from_date?, to_date?, booking_type_id?, source? }`
    - Output: `{ items: Booking[], total: number }`
    - Middleware: `tenantProcedure` + `requireEmployeePermission("bookings.read_own", "bookings.read")`
  - `bookings.getById` (query)
    - Input: `{ id }`
    - Output: `Booking` (mit BookingType, BookingReason, Employee)
  - `bookings.create` (mutation)
    - Input: `{ employee_id, booking_type_id, booking_reason_id?, date, time?, end_time?, duration_minutes?, notes?, source? }`
    - Output: `Booking`
    - Middleware: `requireEmployeePermission("bookings.write_own", "bookings.write")`
    - Validierung: Zeitformat, BookingType existiert, Employee existiert
  - `bookings.update` (mutation)
    - Input: `{ id, booking_type_id?, booking_reason_id?, time?, end_time?, duration_minutes?, notes? }`
    - Output: `Booking`
    - Middleware: `requireSelfOrPermission("bookings.write")`
  - `bookings.delete` (mutation) — Soft-Delete
    - Input: `{ id }`
    - Middleware: `requireSelfOrPermission("bookings.write")`

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-bookings.ts` → `trpc.bookings.*`

### Business Logic (aus Go portiert)
- `apps/api/internal/service/booking.go` (423 Zeilen) — CRUD + Validierung + Pair-Management
- Validierungen:
  - Zeitformat-Prüfung (HH:MM)
  - BookingType muss aktiv und gültig sein
  - Employee muss existieren und aktiv sein
  - Paar-Buchungen (is_pair_start/is_pair_end) korrekt verknüpfen

## Acceptance Criteria
- [ ] Booking CRUD mit allen Feldern
- [ ] Buchungs-Liste mit Filtern nach Employee, Datum, Typ
- [ ] Data-Scope-Enforcement (eigene vs. alle Buchungen)
- [ ] Paar-Buchungen werden korrekt verknüpft
- [ ] Validierung verhindert ungültige Buchungen
- [ ] Frontend-Hooks nutzen tRPC statt fetch
- [ ] Bestehende Tests portiert
- [ ] Kein Recalc-Trigger bei CRUD (kommt in TICKET-235)

## Tests
- Unit-Test: Buchungs-Validierung (Zeitformat, Typ-Prüfung)
- Unit-Test: Paar-Buchungs-Verknüpfung
- Unit-Test: Data-Scope-Filterung
- Integration-Test: Kompletter Booking CRUD-Flow
- E2E-Test: Buchungs-Eingabe im Frontend

## Dependencies
- ZMI-TICKET-231 (Prisma Schema: bookings)
- ZMI-TICKET-216 (Booking Types — BookingType/BookingReason Referenz)
- ZMI-TICKET-214 (Employees — Employee-Referenz)
- ZMI-TICKET-203 (Authorization Middleware — Data Scope)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/booking.go` (423 Zeilen)
- `apps/api/internal/handler/booking.go` (996 Zeilen)
- `apps/api/internal/repository/booking.go` (396 Zeilen)
- `apps/web/src/hooks/api/use-bookings.ts` (Frontend-Hook)
