# ZMI-TICKET-030: Travel Allowance (ZMI Auslöse)

Status: Proposed
Priority: P3
Owner: TBD
Manual references: 10.14 Travel Allowance (Nahmontage/Fernmontage)

## Goal
Implement travel allowance (per diem) configuration and calculation rules.

## Scope
- In scope: Data model and calculation configuration per manual section 10.14.
- Out of scope: Full behavior until detailed Auslöse documentation is available.

## Requirements
### Data model (initial)
- Local travel (Nahmontage) rules: distance ranges, duration thresholds, tax-free/taxable amounts.
- Extended travel (Fernmontage) rules: arrival/departure day rates, intermediate day rates, three-month rule.
- Calculation options: per booking vs per day; distance selection rules.

### API / OpenAPI
- Endpoints:
  - CRUD travel allowance rules
  - Calculate allowance preview for a trip
- OpenAPI must document rule fields and preview outputs.

## Acceptance criteria
- Rules can be configured via API.
- Preview calculation returns expected values for simple scenarios.

## Tests
### Unit tests
- Rule validation for ranges and thresholds.

### API tests
- Create rule set and generate preview for a sample trip.


## Test Case Pack
1) Local travel rule preview
   - Input: trip duration and distance within configured range
   - Expected: preview returns correct tax-free/taxable amounts


## Dependencies
- Employee master data (ZMI-TICKET-004).

## Notes
- Full parity may require additional Auslöse documentation.
