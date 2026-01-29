# ZMI-TICKET-015: Vacation Carryover and Capping Rules

Status: Proposed
Priority: P1
Owner: TBD
Manual references: 10.17 Capping Rules (Kappungsregeln); 4.12 Offset Values

## Goal
Implement vacation carryover and capping rules including year-end and mid-year forfeiture.

## Scope
- In scope: Capping rule definitions, application timing, carryover into new year, OpenAPI coverage.
- Out of scope: Entitlement calculation (ZMI-TICKET-014).

## Requirements
### Data model
- Capping rule definitions:
  - Rule name
  - Rule type (year-end, mid-year)
  - Cutoff date (e.g., March 31) for mid-year rules
  - Maximum carryover amount (days)
  - Grouping of rules
  - Active flag
- Vacation balance fields:
  - Carryover
  - Adjustments
  - Taken
  - Entitlement

### Business rules
- Year-end capping limits how much unused vacation can be carried into the next year.
- Mid-year capping forfeits prior-year carryover after the configured cutoff date.
- Capping rules can be grouped and assigned to tariffs/employees.
- If no capping rule applies, carryover is unlimited.

### API / OpenAPI
- Endpoints:
  - CRUD capping rules
  - Assign capping rule groups to tariffs/employees
  - Run carryover/capping for a given year
- OpenAPI must document cutoff dates and carryover semantics.

## Acceptance criteria
- Carryover is computed correctly based on configured capping rules.
- Mid-year cutoff forfeits remaining prior-year carryover after cutoff.
- API provides endpoints to apply and preview carryover results.

## Tests
### Unit tests
- Year-end carryover capped at max.
- Mid-year cutoff forfeits prior-year carryover on and after cutoff date.
- No rule applied => unlimited carryover.

### API tests
- Create capping rule and group; assign to tariff; preview carryover.
- Apply carryover for year transition and verify balances.

### Integration tests
- Vacation balance for new year includes computed carryover per rule group.


## Test Case Pack
1) Year-end cap
   - Input: remaining=8, cap=5
   - Expected: carryover=5
2) Mid-year cutoff
   - Input: prior-year carryover=3, cutoff=03-31, date=04-01
   - Expected: carryover forfeited after cutoff
3) No rule
   - Input: remaining=8, no capping rule
   - Expected: carryover=8


## Dependencies
- Vacation entitlement calculation (ZMI-TICKET-014).
- Tariff definitions (ZMI-TICKET-018).
