# ZMI-TICKET-009: Accounts and Account Groups

Status: Proposed
Priority: P1
Owner: TBD
Manual references: 6.2.1 Accounts (Konten); 8 Reports (accounts in reports); 11 Data exchange uses export flags

## Goal
Provide full account model used for day/month values, bonuses, and payroll export.

## Scope
- In scope: Account CRUD, account groups, account types (day/month/bonus), export settings, OpenAPI coverage.
- Out of scope: Calculation rules that write into accounts (separate tickets).

## Requirements
### Data model
- Account fields:
  - Account number/code
  - Name
  - Payroll type (Lohnart)
  - Format (decimal or hours:minutes)
  - Account type (day/month/bonus)
  - Bonus factor (used in macros/reports)
  - Carry-forward flag (year-end)
  - Export flag
  - Active flag
- Account groups:
  - Name
  - Ordered list of accounts for display/reporting

### Business rules
- Account numbers must be unique per tenant.
- Accounts referenced by booking types, absence types, and bonuses must exist and be active.
- Export flag controls inclusion in payroll export configuration.

### API / OpenAPI
- Endpoints:
  - CRUD accounts
  - CRUD account groups and assign accounts to groups
  - List accounts by type and export flag
- OpenAPI must describe field semantics and validation constraints.

## Acceptance criteria
- Accounts and groups can be created, updated, and listed with filters.
- Uniqueness and referential integrity enforced.
- Export flag and format settings are preserved in API responses.

## Tests
### Unit tests
- Uniqueness validation for account number/code.
- Group ordering preserved and stable.
- Validation of account type and format values.
- Format conversion helpers (decimal vs HH:MM) round-trip correctly if implemented.

### API tests
- Create account, update export flag and format; verify response.
- Create account group, assign accounts, list group contents in order.

### Integration tests
- Payroll export configuration includes only accounts with export flag true.


## Test Case Pack
1) Unique account code
   - Input: create account code=100, then another code=100
   - Expected: second creation rejected
2) Export flag inclusion
   - Input: account export=false
   - Expected: not available in export configuration
3) Group ordering
   - Input: group with accounts A,B,C
   - Expected: list returns A,B,C in defined order


## Dependencies
- Mandant master data (ZMI-TICKET-001).
