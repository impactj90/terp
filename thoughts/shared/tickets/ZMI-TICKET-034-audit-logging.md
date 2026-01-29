# ZMI-TICKET-034: Audit Logging for Bookings, Absences, Time Plans, and Accounts

Status: Proposed
Priority: P2
Owner: TBD
Manual references: 5.3.1 Log File; 9.6 Log Entries

## Goal
Provide comprehensive audit logs for changes to bookings, absence days, time plans, and monthly accounts.

## Scope
- In scope: Log schema, write-on-change behavior, query endpoints, OpenAPI coverage.
- Out of scope: UI display.

## Requirements
### Data model
- Audit log entry:
  - Entity type (booking, absence, time plan, monthly account)
  - Entity ID
  - User ID
  - Timestamp
  - Before/after values (structured JSON)
  - Action (create/update/delete)

### Business rules
- All create/update/delete operations for covered entities must write a log entry.
- Log entries must be immutable.

### API / OpenAPI
- Endpoints:
  - List logs with filters (entity type, date range, user)
  - Get log details
- OpenAPI must document log schema and filters.

## Acceptance criteria
- All relevant changes generate audit logs with correct before/after values.
- Logs are queryable by entity type and date range.

## Tests
### Unit tests
- Log entry created on create/update/delete for each entity type.
- Log entries are immutable after creation.

### API tests
- Query logs by entity type and date range returns expected entries.

### Integration tests
- Booking edit creates log entry visible in evaluation logs.


## Test Case Pack
1) Booking update log
   - Input: edit booking time
   - Expected: log entry with before/after and user ID
2) Absence deletion log
   - Input: delete absence day
   - Expected: log entry recorded


## Dependencies
- User management (ZMI-TICKET-003).
- Booking ingest/edit flow (ZMI-TICKET-011).
- Absence days lifecycle (ZMI-TICKET-008).
- Time plan framework (ZMI-TICKET-005).
- Monthly evaluation (ZMI-TICKET-016).
