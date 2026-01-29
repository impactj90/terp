# ZMI-TICKET-014: Vacation Entitlement Calculation (Urlaubsberechnung)

Status: Proposed
Priority: P1
Owner: TBD
Manual references: 4.10 Tariff Vacation Values; 10.16 Vacation Calculation (standard and special calculations)

## Goal
Implement full ZMI vacation entitlement calculation including standard calculation, special calculations, and basis selection.

## Scope
- In scope: Standard vacation calculation, special calculations (age, tenure, disability), grouping, basis (calendar year vs entry date), OpenAPI coverage.
- Out of scope: Vacation balance carryover/capping (separate ticket).

## Requirements
### Data model
- Vacation calculation definitions:
  - Standard calculation (fixed, non-editable)
  - Special calculation entries with type (age/tenure/disability), threshold, bonus days
  - Calculation groups with basis (calendar year or entry date) and selected special calculations
- Employee/tariff inputs:
  - Annual vacation days (Jahresurlaub)
  - Work days per week (AT pro Woche)
  - Employment type / part-time percent
  - Disability flag
  - Entry/exit dates

### Business rules
- Annual vacation entitlement is always entered as full-year value; system computes prorated amounts for mid-year entry.
- Employment type selects which vacation calculation group applies (if multiple groups exist).
- Vacation basis:
  - Calendar year basis uses Jan 1–Dec 31 for entitlement year.
  - Entry date basis uses the employee’s hire anniversary year.
- Special calculations:
  - Age: add bonus days if age >= threshold.
  - Tenure: add bonus days if years of service >= threshold.
  - Disability: add bonus days if disability flag is set.
- Part-time adjustment uses weekly hours/part-time percent against standard weekly hours.

### API / OpenAPI
- Endpoints:
  - CRUD special calculations
  - CRUD calculation groups
  - Calculate entitlement preview for an employee/year
- OpenAPI must document inputs/outputs and basis semantics.

## Acceptance criteria
- Entitlement calculation matches manual for standard and special cases.
- Basis selection (calendar year vs entry date) is honored.
- Special calculations apply correctly and are grouped as configured.
- API exposes calculation definitions and preview endpoint.

## Tests
### Unit tests
- Calendar year vs entry date basis produces correct entitlement periods.
- Age/tenure/disability bonuses apply at correct thresholds.
- Part-time adjustment scales entitlement based on weekly hours.

### API tests
- Create special calculation and group; calculate entitlement preview and verify values.
- Update basis selection; verify preview changes accordingly.

### Integration tests
- Vacation balance initialization uses tariff/employee values and selected calculation group.


## Test Case Pack
1) Calendar year basis
   - Input: entry 2026-03-01, annual=30
   - Expected: prorated for Mar–Dec (10/12 of 30)
2) Entry date basis
   - Input: entry 2026-03-01, basis=entry_date
   - Expected: entitlement year runs 03-01 to 02-28/29
3) Special calc by age
   - Input: age threshold 50 adds +2 days
   - Expected: entitlement includes +2 if age >=50
4) Disability bonus
   - Input: disability flag=true, bonus=5
   - Expected: +5 days


## Dependencies
- Personnel master data (ZMI-TICKET-004).
- Tariff definitions (ZMI-TICKET-018).
- Mandant basis setting (ZMI-TICKET-001).
