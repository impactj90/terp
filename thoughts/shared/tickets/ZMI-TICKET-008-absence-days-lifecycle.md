# ZMI-TICKET-008: Absence Days Lifecycle and Logs

Status: Proposed
Priority: P1
Owner: TBD
Manual references: 5.2 Recording Absence Days; 6 Absence Days; Booking Overview; Absence logs

## Goal
Implement full absence day lifecycle (create, delete, range operations, logs) with ZMI conflict handling and integration into daily/monthly calculations.

## Scope
- In scope: Absence day CRUD, range operations, conflict resolution with holidays, logging, OpenAPI coverage.
- Out of scope: Vacation entitlement calculation (separate ticket).

## Requirements
### Data model
- Absence day fields:
  - Employee
  - Date (or date range stored as multiple records)
  - Absence type
  - Duration (full/half day)
  - Status (approved/pending/cancelled if required)
  - Optional remark
  - Created by, approved by
- Absence log records for create/update/delete with user identity and timestamps.

### Business rules
- Allow recording absence days from multiple entry points (booking overview, personnel master, yearly overview, vacation planner).
- Deleting absence days must remove records and log the deletion.
- Conflict handling with holidays:
  - If holiday and absence overlap, apply absence type priority and holiday code rules.
  - When both apply, daily calculation must use the effective code and correct credit.
- Range operations must expand to individual day records.
- Vacation-deducting absence types must update vacation balances (if enabled).

### API / OpenAPI
- Endpoints:
  - Create absence day (single date)
  - Create absence days for date range
  - List absence days by employee/date range
  - Delete absence day(s)
  - List absence logs
- OpenAPI must document conflict behavior with holidays and duration semantics.

## Acceptance criteria
- Absence days can be created and deleted for single dates and ranges.
- Conflict with holidays resolves according to priority and holiday code rules.
- Logs are written for create/update/delete with user identity.
- API returns accurate absence data for reporting and calculation.

## Tests
### Unit tests
- Range creation expands to correct set of dates.
- Conflict resolution with holiday: priority and holiday code applied correctly.
- Duration handling for half-day vs full-day.
- Log entry created for create/update/delete.
 - Vacation-deducting absence types reduce balance by configured deduction value.

### API tests
- Create single absence day and fetch by date range.
- Create range absence days; verify all days created.
- Delete absence day; verify not returned and log entry exists.

### Integration tests
- Daily calculation uses effective absence code and credits on holiday overlap.
- Monthly evaluation counts absence days correctly by type.
 - Vacation balance updates when absence days are approved and deduct vacation.


## Test Case Pack
1) Range creation
   - Input: 2026-03-01 to 2026-03-05, vacation type
   - Expected: 5 absence day records created
2) Holiday overlap resolution
   - Input: absence on holiday with priority rule
   - Expected: effective code and credit follow priority + holiday code
3) Half-day absence
   - Input: duration=0.5 day
   - Expected: credit and vacation deduction scaled to half day
4) Vacation deduction
   - Input: vacation-deducting type, day plan deduction=1.0
   - Expected: vacation balance reduced by 1.0 (or 0.5 for half day)


## Dependencies
- Absence types (ZMI-TICKET-007).
- Holiday categories (ZMI-TICKET-002).
- User management (ZMI-TICKET-003) for auditing.
