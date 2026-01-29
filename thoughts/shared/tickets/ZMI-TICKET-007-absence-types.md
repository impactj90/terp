# ZMI-TICKET-007: Absence Types (Fehltage) Definitions

Status: Proposed
Priority: P1
Owner: TBD
Manual references: 6.1 Editing Absence Types; 6.2 Calculation; 4.6 Absence tabs

## Goal
Provide full absence type definitions with ZMI-specific fields used in daily and monthly calculations and the vacation planner.

## Scope
- In scope: Absence type CRUD, grouping, ZMI-specific fields (portion, holiday code, priority), account linkage, OpenAPI coverage.
- Out of scope: Absence day lifecycle and approvals (separate ticket).

## Requirements
### Data model
- Absence type fields:
  - Code (prefix K/S/U required by convention)
  - Name/description
  - Category (vacation, illness, special, unpaid)
  - Calculation rule reference (links to Absence Calculation Rules)
  - Portion of regular hours credited (0/1/2)
  - Holiday code override
  - Priority (holiday vs absence conflict)
  - Color
  - Function key shortcut
  - Linked account (optional)
  - Active/system flags
- Absence type groups for workflow selection (WebClient).

### Business rules
- Validate code prefix per category (K/S/U) with clear error messages.
- Portion must be one of 0, 1, 2.
- Holiday code is used only when the date is a holiday.
- Priority determines which absence type applies when holiday and absence overlap.
- If a linked account is configured, absence calculation rules determine account values (defined in Absence Calculation Rules ticket).

### API / OpenAPI
- Endpoints:
  - CRUD absence types
  - List absence types with filters (category, active, system)
  - CRUD absence groups and assignment of types to groups
- OpenAPI must include all fields and validation constraints.

## Acceptance criteria
- Absence types can be created/updated with all ZMI fields.
- Invalid code prefixes and portions are rejected.
- Groups can be created and used to filter available absence types.
- OpenAPI documents all fields and validation rules.

## Tests
### Unit tests
- Validate code prefix rules for K/S/U by category.
- Validate portion values and reject invalid integers.
- Holiday code applied only on holiday context.
- Priority ordering comparator behaves deterministically.
- Calculation rule reference must exist and be active.

### API tests
- Create absence types for K/S/U categories and verify stored fields.
- Update priority and holiday code; verify persisted changes.
- Create absence groups and assign types; list group contents.

### Integration tests
- Absence type portion is applied when calculating time credits (paired with daily calc ticket).
- Linked account receives values per calculation rules when absence day is applied.


## Test Case Pack
1) Code prefix validation
   - Input: category=vacation, code=KX
   - Expected: validation error (must start with U)
2) Portion credit
   - Input: portion=2 (half)
   - Expected: credit = 0.5 * regular hours
3) Holiday code override
   - Input: holiday_code=UH, absence on holiday
   - Expected: effective code = UH on holiday dates
4) Priority
   - Input: two absence types on holiday with priority 1 and 5
   - Expected: higher priority (5) wins


## Dependencies
- Mandant master data (ZMI-TICKET-001).
- Accounts module (ZMI-TICKET-009) for optional account linkage.
- Absence calculation rules (ZMI-TICKET-013).
