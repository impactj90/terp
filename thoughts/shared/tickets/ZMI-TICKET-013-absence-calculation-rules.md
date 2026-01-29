# ZMI-TICKET-013: Absence Calculation Rules (Berechnung)

Status: Proposed
Priority: P1
Owner: TBD
Manual references: 6.2 Berechnung; 6.2.1 Konten

## Goal
Implement the absence calculation rule system that determines how absence days impact accounts and time evaluation.

## Scope
- In scope: Calculation rule definitions, linkage to absence types, account value computation rules, OpenAPI coverage.
- Out of scope: Absence day creation and approval (ZMI-TICKET-008).

## Requirements
### Data model
- Calculation rule definition includes:
  - Rule name/code
  - Linked account (optional)
  - Value and factor inputs (as described in manual)
  - Active flag
- Absence types reference a calculation rule.

### Business rules
- Calculation rules define how absence days are evaluated in time accounts.
- Manual example indicates account value is computed from a value and factor; if value is zero, use target time (day plan) as base.
- If no account is linked, the rule may still affect daily time evaluation (e.g., crediting target time based on portion).
 - Manual warns changes can affect later time evaluation.

### API / OpenAPI
- Endpoints:
  - CRUD calculation rules
  - Assign rule to absence types
  - Preview calculation result for a given absence day input
- OpenAPI must document inputs, outputs, and the value/factor semantics.

## Acceptance criteria
- Calculation rules can be created and assigned to absence types.
- Absence day evaluation applies the rule consistently and writes account values if configured.
- Audit log captures rule changes with user identity.

## Tests
### Unit tests
- Rule computation using value * factor.
- Rule computation with value = 0 uses target time as base.
- Rule assignment to absence types enforces rule existence and active status.

### API tests
- Create rule, assign to absence type, verify preview calculation output.
- Update rule values and verify audit log entry.

### Integration tests
- Absence day application writes expected account values and daily credits.


## Test Case Pack
1) Value * factor
   - Input: value=2.0, factor=3.0
   - Expected: account value=6.0
2) Value=0 uses target time
   - Input: value=0, factor=1.0, target=8h
   - Expected: account value=8h
3) Rule inactive
   - Input: assign inactive rule to absence type
   - Expected: validation error


## Dependencies
- Accounts module (ZMI-TICKET-009).
- Absence types (ZMI-TICKET-007).
- Day plan advanced rules (ZMI-TICKET-006) for target time input.
