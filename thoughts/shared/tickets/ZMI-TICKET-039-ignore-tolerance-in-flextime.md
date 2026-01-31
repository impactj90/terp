# ZMI-TICKET-039: Ignore Tolerance/Variable Work Time in Flextime Plans

Status: Proposed
Priority: P3
Owner: TBD
Manual references: 3.4.4.4 Toleranz (Gleitzeit note)

## Goal
Enforce manual rule that tolerance settings and variable work time do not apply to flextime day plans.

## Scope
- In scope: Validation and calculation behavior for flextime plans.
- Out of scope: UI enforcement (frontend may already block these inputs).

## Requirements
### Business rules
- For day plans with plan_type = flextime:
  - Ignore ToleranceComePlus and ToleranceGoMinus in calculation (treat as 0).
  - Ignore VariableWorkTime (treat as false).
- Server-side validation should normalize or reject non-zero values for these fields when plan_type is flextime.

### API / OpenAPI
- Document that these fields are ignored for flextime plans.
- If validation rejects them, return a clear error message.

## Acceptance criteria
- Flextime plans behave the same regardless of non-zero ComePlus/GoMinus values.
- VariableWorkTime has no effect when plan_type is flextime.

## Tests
### Unit tests
- Day plan validation normalizes or rejects ComePlus/GoMinus for flextime.
- Calculation ignores those fields for flextime.

### Integration tests
- Flextime plan with non-zero ComePlus/GoMinus produces identical daily values as zero.


## Test Case Pack
1) Flextime tolerance ignored
   - Input: flextime plan with ComePlus=5, GoMinus=5
   - Expected: same results as ComePlus=0, GoMinus=0
2) VariableWorkTime ignored
   - Input: flextime plan with VariableWorkTime=true
   - Expected: same results as VariableWorkTime=false


## Dependencies
- Time plan framework (ZMI-TICKET-005).
- Day plan advanced rules (ZMI-TICKET-006).
