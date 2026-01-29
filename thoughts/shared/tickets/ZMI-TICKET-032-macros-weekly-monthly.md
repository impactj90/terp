# ZMI-TICKET-032: Weekly and Monthly Macros

Status: Proposed
Priority: P2
Owner: TBD
Manual references: 4.10.4 Weekly Macro; 4.10.5 Monthly Macro; 3.4.4.5 Abgleich mentions macros

## Goal
Implement macro definitions and scheduling for weekly and monthly automation.

## Scope
- In scope: Macro definitions, assignment to tariffs/employees, execution scheduling, OpenAPI coverage.
- Out of scope: Macro scripting language specifics if not defined.

## Requirements
### Data model
- Macro:
  - Name
  - Type (weekly/monthly)
  - Script or predefined action (to be defined)
  - Active flag
- Macro assignment:
  - Employee or tariff
  - Execution day (weekday for weekly, day-of-month for monthly)

### Business rules
- Weekly macros execute on configured weekday.
- Monthly macros execute on configured day; if day does not exist (e.g., 31), execute on last day of month.
- Macros execute after daily calculation for the day.

### API / OpenAPI
- Endpoints:
  - CRUD macros
  - Assign macros to tariffs/employees
  - Trigger macro execution
- OpenAPI must document execution scheduling rules.

## Acceptance criteria
- Macros can be defined and assigned.
- Execution scheduling follows configured rules.

## Tests
### Unit tests
- Monthly execution day falls back to last day if configured day exceeds month length.

### API tests
- Create macro, assign to tariff, trigger execution.

### Integration tests
- Macro execution occurs after daily calculation in scheduled runs.


## Test Case Pack
1) Monthly macro on 31st
   - Input: execute day=31 for February
   - Expected: runs on last day of February
2) Weekly macro
   - Input: execute day=Sunday
   - Expected: runs on next Sunday


## Dependencies
- Tariff definitions (ZMI-TICKET-018).
- ZMI Server scheduler (ZMI-TICKET-022).
