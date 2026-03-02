# ZMI-TICKET-225: Terminal Bookings, Vehicles, Trip Records

Status: Proposed
Priority: P2
Owner: TBD

## Goal
tRPC-Router für Terminal-Buchungen (Import + List), Fahrzeuge, Fahrzeugrouten und Fahrtenbuch-Einträge implementieren.

## Scope
- **In scope:**
  - tRPC `terminalBookings` Router (List + Import + Batches)
  - tRPC `vehicles` Router (CRUD)
  - tRPC `vehicleRoutes` Router (CRUD)
  - tRPC `tripRecords` Router (CRUD)
  - Frontend-Hooks Migration
- **Out of scope:**
  - Terminal-Hardware-Integration
  - Booking-Erstellung aus Terminal-Daten (TICKET-232)

## Requirements

### tRPC Router: `terminalBookings`
- **Procedures:**
  - `terminalBookings.list` (query)
    - Input: `{ page?, pageSize?, employee_id?, from_date?, to_date? }`
    - Output: `{ items: TerminalBooking[], total: number }`
    - Middleware: `tenantProcedure` + `requirePermission("terminal_bookings.read")`
  - `terminalBookings.import` (mutation) — Terminal-Daten importieren
    - Input: `{ data: RawTerminalBooking[] }`
    - Output: `ImportBatch`
    - Middleware: `requirePermission("terminal_bookings.write")`
  - `terminalBookings.batches` (query) — Import-Batches
    - Input: `{ page?, pageSize? }`
    - Output: `{ items: ImportBatch[], total: number }`
  - `terminalBookings.batch` (query)
    - Input: `{ id }`
    - Output: `ImportBatch` (mit Details)

### tRPC Router: `vehicles`
- **Procedures:**
  - `vehicles.list/getById/create/update/delete`
  - Middleware: `tenantProcedure` + `requirePermission("vehicles.*")`

### tRPC Router: `vehicleRoutes`
- **Procedures:**
  - `vehicleRoutes.list/getById/create/update/delete`
  - Middleware: `tenantProcedure` + `requirePermission("vehicles.*")`

### tRPC Router: `tripRecords`
- **Procedures:**
  - `tripRecords.list` (query)
    - Input: `{ page?, pageSize?, vehicle_id?, employee_id?, from_date?, to_date? }`
    - Output: `{ items: TripRecord[], total: number }`
  - `tripRecords.getById/create/update/delete`
  - Middleware: `tenantProcedure` + `requirePermission("trip_records.*")`

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-terminal-bookings.ts` → `trpc.terminalBookings.*`
- Hinweis: Vehicles, VehicleRoutes, TripRecords haben noch keine Frontend-Hooks — werden neu erstellt

### Business Logic (aus Go portiert)
- `apps/api/internal/service/terminal.go` (276 Zeilen) — Import + List
- `apps/api/internal/service/vehicle.go` (147 Zeilen)
- `apps/api/internal/service/vehicle_route.go` (150 Zeilen)
- `apps/api/internal/service/trip_record.go` (150 Zeilen)

## Acceptance Criteria
- [ ] Terminal-Daten-Import erstellt ImportBatch
- [ ] Vehicle, VehicleRoute, TripRecord CRUD funktioniert
- [ ] Frontend-Hooks nutzen tRPC statt fetch
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: Terminal Import mit Batch-Erstellung
- Unit-Test: TripRecord mit Vehicle-Zuordnung
- Integration-Test: CRUD-Flow für alle Entitäten

## Dependencies
- ZMI-TICKET-203 (Authorization Middleware)
- ZMI-TICKET-214 (Employees — für Terminal-Buchungs-Zuordnung)
- ZMI-TICKET-210 (Tenants — tenantProcedure)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/terminal.go` (276 Zeilen)
- `apps/api/internal/handler/terminal.go` (396 Zeilen)
- `apps/api/internal/repository/terminal.go` (257 Zeilen)
- `apps/api/internal/service/vehicle.go` (147 Zeilen)
- `apps/api/internal/handler/vehicle.go` (190 Zeilen)
- `apps/api/internal/repository/vehicle.go` (79 Zeilen)
- `apps/api/internal/service/vehicle_route.go` (150 Zeilen)
- `apps/api/internal/handler/vehicle_route.go` (195 Zeilen)
- `apps/api/internal/repository/vehicle_route.go` (79 Zeilen)
- `apps/api/internal/service/trip_record.go` (150 Zeilen)
- `apps/api/internal/handler/trip_record.go` (234 Zeilen)
- `apps/api/internal/repository/trip_record.go` (77 Zeilen)
- `apps/web/src/hooks/api/use-terminal-bookings.ts` (Frontend-Hook)
