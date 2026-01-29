# ZMI-TICKET-019: Evaluations (Auswertungen) Query Module

Status: Proposed
Priority: P2
Owner: TBD
Manual references: 9 Evaluations (Tageswerte, Buchungen, Terminal-Buchungen, Logeinträge)

## Goal
Provide API-driven evaluation queries for daily values, bookings, terminal bookings, file entries, workflow history, and logs.

## Scope
- In scope: Query endpoints, filtering, "days without bookings" option, OpenAPI coverage.
- Out of scope: Grid layout persistence (UI feature) unless required by existing system.

## Requirements
### Business rules
- Evaluation types:
  - Daily values (one row per day)
  - Bookings (one row per booking)
  - Terminal bookings (raw transactions)
  - File entries (personnel/order file attachments)
  - Workflow history (requests and approvals)
  - Log entries (booking changes, absence changes, monthly account changes)
- "Days without bookings" toggle adds rows for dates with zero bookings in bookings evaluation.
- Filters by date range, employee, department, and optional account/booking type.

### API / OpenAPI
- Endpoints:
  - GET /evaluations/daily-values
  - GET /evaluations/bookings
  - GET /evaluations/terminal-bookings
  - GET /evaluations/logs
  - GET /evaluations/workflow-history
- OpenAPI must document filter parameters and response schemas for each evaluation type.

## Acceptance criteria
- Each evaluation type returns correct data and respects filters.
- "Days without bookings" produces rows with zero values for booking evaluation.
- Log evaluation includes user, timestamp, and before/after values.

## Tests
### Unit tests
- Filter logic for date range, employee, department.
- "Days without bookings" produces expected row set.

### API tests
- Daily values evaluation returns one row per date.
- Bookings evaluation returns one row per booking and includes calculated times.
- Logs evaluation returns booking and absence changes with user info.

### Integration tests
- Evaluation queries reflect changes after recalculation and after booking edits.


## Test Case Pack
1) Daily values evaluation
   - Input: date range with 5 days
   - Expected: 5 rows, one per day
2) Bookings evaluation
   - Input: 3 bookings on a day
   - Expected: 3 rows for that day
3) Days without bookings
   - Input: enable flag with no bookings on 2026-02-02
   - Expected: row included with zeroed values


## Dependencies
- Booking ingest/edit flow (ZMI-TICKET-011).
- Daily calculation (ZMI-TICKET-006).
- Audit logging (ZMI-TICKET-034).
