# ZMI-TICKET-012: Correction Assistant, Error/Hint Catalog, and Logs

Status: Proposed
Priority: P1
Owner: TBD
Manual references: 5.1 Correction Assistant; 10.5 Correction Messages; Booking overview logs

## Goal
Provide correction assistant data model and APIs to list, filter, and manage errors and hints produced by daily calculation.

## Scope
- In scope: Error/hint catalog, correction assistant list queries, custom messages, logs, OpenAPI coverage.
- Out of scope: UI workflows.

## Requirements
### Data model
- Error/hint record per employee-date:
  - Error code
  - Severity (error vs hint)
  - Message text (default or custom override)
  - Created/updated timestamp
  - Resolved flag (optional)
- Correction message catalog:
  - Code
  - Default text
  - Custom override text
  - Severity classification

### Business rules
- Daily calculation emits error codes based on missing bookings, core time violations, min work time, etc.
- Correction assistant shows previous and current month by default, filterable by date range and department.
- Custom message overrides replace default text in outputs.

### API / OpenAPI
- Endpoints:
  - List correction items by date range, department, employee
  - Retrieve error catalog
  - Update custom message text and severity classification
- OpenAPI must document error codes and severity rules.

## Acceptance criteria
- Daily calculation errors appear in correction list with correct severity.
- Custom message overrides are applied to outputs.
- Filtering by date range and department returns correct results.

## Tests
### Unit tests
- Error catalog lookup returns default text and severity.
- Custom overrides replace default text.
- Error/hint classification is preserved.

### API tests
- List correction items for a known date range with errors.
- Update custom message and verify in correction list output.
- Filter by department returns only matching employees.
- Default date-range behavior returns previous + current month when no range is specified.

### Integration tests
- Daily calculation writes error records that appear in correction assistant.


## Test Case Pack
1) Missing booking error
   - Input: only come booking in day
   - Expected: error code MissingGo appears in correction list
2) Custom message override
   - Input: override message text for MissingGo
   - Expected: correction list shows custom text
3) Default date range
   - Input: list without date range
   - Expected: previous + current month only


## Dependencies
- Daily calculation engine (ZMI-TICKET-006).
- User management (ZMI-TICKET-003) for auditing custom message changes.
