# ZMI-TICKET-021: Data Exchange and Payroll Exports

Status: Proposed
Priority: P2
Owner: TBD
Manual references: 11 Data Exchange (Datenaustausch)

## Goal
Implement data exchange configuration and export generation for payroll systems.

## Scope
- In scope: Interface configuration, export scripts, account selection, file generation, OpenAPI coverage.
- Out of scope: Specific third-party import logic (handled externally).

## Requirements
### Data model
- Interface definition fields:
  - Interface number
  - Name/label
  - Mandant number in payroll system
  - Export script name
  - Export path
  - Output filename
- Selected accounts and monthly values to include in export.

### Business rules
- Export uses configured script/template and outputs to configured path.
- Only accounts with export flag enabled can be included.
- Export data is scoped by selected period and employee filters.

### API / OpenAPI
- Endpoints:
  - CRUD interface definitions
  - Configure accounts for interface
  - Generate export file for a period
- OpenAPI must document payloads and output file handling.

## Acceptance criteria
- Interfaces can be configured and used to generate export files.
- Export contains only selected accounts and values.
- Errors are returned when configuration is incomplete.

## Tests
### Unit tests
- Validate interface configuration fields.
- Ensure export includes only accounts with export flag.

### API tests
- Create interface config; generate export; verify file is produced.
- Missing script/path returns validation error.

### Integration tests
- Export output matches monthly values for selected period.


## Test Case Pack
1) Valid interface export
   - Input: interface configured with script/path/name
   - Expected: export file generated
2) Missing configuration
   - Input: missing export path
   - Expected: validation error
3) Export flag
   - Input: account export=false
   - Expected: account excluded from export


## Dependencies
- Accounts module (ZMI-TICKET-009).
- Monthly evaluation (ZMI-TICKET-016).
