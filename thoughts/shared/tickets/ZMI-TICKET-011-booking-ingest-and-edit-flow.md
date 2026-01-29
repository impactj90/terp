# ZMI-TICKET-011: Booking Ingest, Edit, and Calculated Values

Status: Proposed
Priority: P1
Owner: TBD
Manual references: 5.3 Booking Overview; booking pair behavior; Original/Editiert/Berechnet values; terminal bookings

## Goal
Implement complete booking flow: ingest from terminals, store original and edited times, calculate derived times, and maintain pairing integrity.

## Scope
- In scope: Booking storage, edit rules, pair identifiers, ingest pipeline interfaces, OpenAPI coverage.
- Out of scope: Terminal communication protocol (separate ticket if needed).

## Requirements
### Data model
- Booking fields:
  - Original time (immutable)
  - Edited time (user-modifiable)
  - Calculated time (derived by day plan rules)
  - Booking type (direction/category)
  - Pair ID (linking come/go or break start/end)
  - Source (terminal, correction, import)
  - Notes
- Booking logs for edits (who, when, old/new values).

### Business rules
- Original time never changes after ingest.
- Edited time defaults to original time unless changed manually.
- Calculated time is derived during day calculation using day plan settings.
- Pairing rules:
  - Come/Go pairs by category and order.
  - Break pairs must be paired separately from work pairs.
- Cross-midnight logic handled by day change rules (see day plan ticket).
- Final daily calculation is performed on the following day by scheduled processing; manual “calculate day” triggers are available.

### API / OpenAPI
- Endpoints:
  - Create booking (manual)
  - Update booking edited time
  - Delete booking
  - List bookings by employee/date range
  - Retrieve booking logs
  - Trigger day calculation and month calculation for an employee/date range
- OpenAPI must document immutability of original time and semantics of edited vs calculated.

## Acceptance criteria
- Original time is immutable and preserved on edits.
- Edited time changes create log entries.
- Calculated time is updated on day recalculation.
- Pairing behaves deterministically and respects categories.

## Tests
### Unit tests
- Enforce immutability of original time.
- Pairing logic respects category and direction.
- Calculated time uses edited time as input.
- Logging captures old/new values on edit.
- Manual calculation trigger updates calculated time immediately.

### API tests
- Create manual booking; verify original=edited on creation.
- Update edited time; verify log entry.
- Delete booking; verify it is removed and daily calc re-runs if configured.

### Integration tests
- Day recalculation updates calculated times for all bookings in a day.
- Cross-midnight bookings handled consistently with day change behavior.
- Scheduled next-day calculation produces same results as manual calculation.


## Test Case Pack
1) Original vs edited
   - Input: ingest booking at 08:03
   - Expected: original=08:03, edited=08:03
2) Edit booking
   - Input: edited=08:00
   - Expected: original remains 08:03; log entry created
3) Calculated time
   - Input: day plan rounding to 15 min, edited=08:03
   - Expected: calculated=08:15 (per rounding rule)
4) Manual day calculation
   - Input: trigger calculate day
   - Expected: calculated times updated immediately


## Dependencies
- Booking types (ZMI-TICKET-010).
- Day plan advanced rules (ZMI-TICKET-006).
- User management (ZMI-TICKET-003) for audit logs.
- Audit logging (ZMI-TICKET-034).
