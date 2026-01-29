# ZMI-TICKET-004: Personnel Master Data Coverage

Status: Proposed
Priority: P1
Owner: TBD
Manual references: 4 Personnel Master; 4.2-4.13 fields and tabs; 10.15 Contact Management

## Goal
Implement complete employee master data and related configuration used by time calculation, reporting, and downstream modules.

## Scope
- In scope: Employee fields, contact data, groups, tariff fields, default order/activity, attachments, API coverage.
- Out of scope: Absence day creation and calculation (separate tickets).

## Requirements
### Data model
Employee entity must include (at minimum):
- Identity: personnel number, PIN, first/last name, entry date, exit date, exit reason, notes
- Address: standard address fields
- Additional fields: birth date, gender, nationality, religion, marital status, birth place/country, room number
- Organization: mandant, department, cost center, tree structure for access rights
- Contact data: dynamic contact fields based on Contact Management configuration
- Groups: employee group, workflow group, activity group
- Defaults: default order and default activity (ZMI Auftrag)
- Tariff-related fields (see manual section 4.10):
  - Annual vacation days, work days per week
  - Employment type, part-time percent
  - Disability flag
  - Daily/weekly/monthly/annual target hours overrides
  - Monthly evaluation assignment
- Weekly and monthly macro assignments with execution day
- Calculation start date
- Photo metadata (store file separately if needed)

### Business rules
- Exit date blocks bookings after exit date.
- Required fields enforced on creation (personnel number, PIN, name, entry date).
- Tariff fields are default inputs for vacation and monthly evaluation when no tariff definition is assigned.
- Contact fields must validate against contact type definitions.
- PIN can be auto-assigned if not provided; must remain unique.
- Calculation start date (Berechne ab) is system-managed and not manually editable by normal users.

### API / OpenAPI
- Endpoints:
  - CRUD employees with filters (department, cost center, active, date range)
  - Manage contact data (list/update per employee)
  - Upload/update photo metadata
  - Assign defaults (order/activity) and tariff-related fields
- OpenAPI schemas must fully describe all employee fields and validation rules.

## Acceptance criteria
- Employee record supports all fields listed above and is fully accessible via API.
- Mandatory fields are validated and enforced.
- Exit date prevents new bookings and calculations after that date.
- Contact fields validate against configured contact types.

## Tests
### Unit tests
- Required field validation: personnel number, PIN, name, entry date.
- Exit date behavior: bookings after exit date rejected.
- Contact data validation against configured contact types.
- PIN auto-assignment creates unique values.

### API tests
- Create employee with full payload; read back all fields.
- Update tariff-related fields; verify persisted values.
- List/filter by department, cost center, active/inactive.
- Upload/attach photo metadata (if supported).

### Integration tests
- Daily calculation refuses to calculate dates after employee exit date.
- Vacation calculation defaults to employee tariff fields when no tariff definition is assigned.


## Test Case Pack
1) Required fields
   - Input: missing personnel number or entry date
   - Expected: validation error
2) PIN auto-assignment
   - Input: create employee without PIN
   - Expected: system assigns unique PIN
3) Exit date enforcement
   - Input: exit_date=2026-01-15, booking on 2026-01-16
   - Expected: booking rejected
4) Tariff fields default usage
   - Input: employee with tariff vacation fields, no tariff definition
   - Expected: vacation preview uses employee fields


## Dependencies
- Mandant master data (ZMI-TICKET-001).
- Contact management configuration (included here but may reference System Settings ticket if split).
- ZMI Auftrag module (ZMI-TICKET-017) for default order/activity linkage.
