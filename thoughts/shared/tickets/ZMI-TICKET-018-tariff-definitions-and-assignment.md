# ZMI-TICKET-018: Tariff Definitions and Assignment

Status: Proposed
Priority: P1
Owner: TBD
Manual references: 4.10 Tariff Tab; 4.11 Tariff Definition; 4.10.6 Time Plan Assignment

## Goal
Implement tariff definitions as reusable templates and support assignment to employees, including time plan rhythms and evaluation settings.

## Scope
- In scope: Tariff definition CRUD, assignment to employees, time plan rhythm settings, OpenAPI coverage.
- Out of scope: Actual time plan calculation (handled in time plan tickets).

## Requirements
### Data model
- Tariff definition:
  - Vacation fields (annual days, work days per week, basis)
  - Target hours fields (daily/weekly/monthly/annual)
  - Flextime evaluation fields (credit type, thresholds, caps)
  - Time plan rhythm settings (weekly, rolling, x-day) with start date
  - Macro assignments (weekly/monthly) and execution day
  - Active flag
- Tariff assignment:
  - Employee ID
  - Effective date range
  - Overwrite behavior for manual changes

### Business rules
- Tariff definitions provide defaults for employees who reference them.
- Changing a tariff definition should not retroactively change historical calculations unless recalculated explicitly.
- Time plan rhythm settings in tariff drive employee plan assignments.

### API / OpenAPI
- Endpoints:
  - CRUD tariff definitions
  - Assign tariff definition to employee with date range
  - Preview effective tariff for employee at a date
- OpenAPI must document all fields and validation constraints.

## Acceptance criteria
- Tariff definitions can be created and assigned.
- Employee effective tariff resolves correctly for a given date.
- Time plan rhythm settings are stored and available for calculation services.

## Tests
### Unit tests
- Validation for required tariff fields.
- Effective tariff resolution by date range.

### API tests
- Create tariff definition with full fields; assign to employee; fetch effective tariff.

### Integration tests
- Monthly evaluation and vacation calculation use tariff fields when assigned.


## Test Case Pack
1) Effective tariff resolution
   - Input: tariff A active 2026-01-01..2026-06-30, tariff B from 2026-07-01
   - Expected: date in June resolves A; date in July resolves B
2) Time plan rhythm
   - Input: tariff with rolling plan
   - Expected: employee plan assignment reflects rolling configuration


## Dependencies
- Personnel master data (ZMI-TICKET-004).
- Time plan framework (ZMI-TICKET-005).
