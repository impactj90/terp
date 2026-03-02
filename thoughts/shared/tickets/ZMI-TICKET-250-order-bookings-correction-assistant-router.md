# ZMI-TICKET-250: Order Bookings + Correction Assistant Router

Status: Proposed
Priority: P2
Owner: TBD

## Goal
tRPC-Router für Order Bookings (Auftrags-Buchungen) und den Correction-Workflow (Korrekturen erstellen, anwenden, rückgängig machen). Order Bookings ordnen Arbeitszeit konkreten Aufträgen zu.

## Scope
- **In scope:**
  - tRPC `orderBookings` Router (CRUD)
  - tRPC `corrections` Router (CRUD + Apply + Revert)
  - Frontend-Hooks Migration
- **Out of scope:**
  - Correction Assistant Items/Messages (bereits in TICKET-227)
  - Order CRUD (bereits in TICKET-215)

## Requirements

### tRPC Router: `orderBookings`
- **Procedures:**
  - `orderBookings.list` (query)
    - Input: `{ page?, pageSize?, employee_id?, order_id?, from_date?, to_date? }`
    - Output: `{ items: OrderBooking[], total: number }`
    - Middleware: `tenantProcedure` + `requirePermission("order_bookings.read")`
  - `orderBookings.getById` (query)
  - `orderBookings.create` (mutation)
    - Input: `{ employee_id, order_id, booking_id?, date, hours, description? }`
    - Middleware: `requirePermission("order_bookings.write")`
  - `orderBookings.update` (mutation)
  - `orderBookings.delete` (mutation)

### tRPC Router: `corrections`
- **Procedures:**
  - `corrections.list` (query)
    - Input: `{ page?, pageSize?, employee_id?, status?, from_date?, to_date? }`
    - Output: `{ items: Correction[], total: number }`
    - Middleware: `tenantProcedure` + `requirePermission("corrections.read")`
  - `corrections.getById` (query)
  - `corrections.create` (mutation)
    - Input: `{ employee_id, date, account_id?, corrected_value, type, reason? }`
    - Middleware: `requirePermission("corrections.write")`
  - `corrections.apply` (mutation) — Korrektur anwenden
    - Input: `{ id }`
    - Logik: Status → "applied", DailyValue/DailyAccountValue anpassen, Recalc triggern
    - Middleware: `requirePermission("corrections.apply")`
  - `corrections.revert` (mutation) — Korrektur rückgängig machen
    - Input: `{ id }`
    - Logik: Status → "reverted", Original-Werte wiederherstellen, Recalc triggern

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-order-bookings.ts` → `trpc.orderBookings.*`
- Correction-Hooks (falls in use-correction-assistant.ts enthalten) → `trpc.corrections.*`

### Business Logic (aus Go portiert)
- `apps/api/internal/service/order_booking.go` (209 Zeilen)
- `apps/api/internal/service/correction.go` (197 Zeilen) — CRUD + Apply + Revert

## Acceptance Criteria
- [ ] OrderBooking CRUD mit Order/Employee/Booking-Verknüpfung
- [ ] Correction Create + Apply + Revert Workflow
- [ ] Apply: DailyValue wird angepasst und Recalc getriggert
- [ ] Revert: Original-Werte werden wiederhergestellt
- [ ] Frontend-Hooks nutzen tRPC statt fetch
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: OrderBooking CRUD
- Unit-Test: Correction Apply ändert DailyValue
- Unit-Test: Correction Revert stellt Original wieder her
- Integration-Test: Correction Create → Apply → Recalc → Verify

## Dependencies
- ZMI-TICKET-249 (Prisma Schema: corrections, order_bookings)
- ZMI-TICKET-215 (Orders — Order-Referenz)
- ZMI-TICKET-232 (Bookings — Booking-Referenz)
- ZMI-TICKET-236 (Daily Values — für Correction Apply/Revert)
- ZMI-TICKET-243 (RecalcService — für Recalc nach Apply)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/order_booking.go` (209 Zeilen)
- `apps/api/internal/handler/order_booking.go` (219 Zeilen)
- `apps/api/internal/repository/order_booking.go` (115 Zeilen)
- `apps/api/internal/service/correction.go` (197 Zeilen)
- `apps/api/internal/handler/correction.go` (338 Zeilen)
- `apps/api/internal/repository/correction.go` (100 Zeilen)
- `apps/web/src/hooks/api/use-order-bookings.ts` (Frontend-Hook)
