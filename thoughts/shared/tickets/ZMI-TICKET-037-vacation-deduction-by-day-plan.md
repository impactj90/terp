# ZMI-TICKET-037: Vacation Deduction Uses Day Plan Urlaubsbewertung

Status: Proposed
Priority: P2
Owner: TBD
Manual references: 3.4.4.6 Sonderfunktionen (Urlaubsbewertung)

## Goal
Use day plan vacation_deduction when updating vacation balance for approved vacation absences.

## Scope
- In scope: Apply day plan VacationDeduction in absence approval and cancellation flows.
- Out of scope: Vacation entitlement rules (handled by existing tickets).

## Requirements
### Data model
- Reuse existing DayPlan.VacationDeduction (decimal).
- Reuse VacationBalance.Taken (decimal days).

### Business rules
- On approval of a vacation absence day:
  - Determine the effective day plan for that date.
  - Deduction = day_plan.vacation_deduction * absence.duration (1.0 or 0.5).
  - Increment VacationBalance.Taken by the deduction.
- On cancellation/rejection of an approved absence day, reverse the deduction.
- If no day plan is assigned, default deduction to 1.00 * duration.

### API / OpenAPI
- No new endpoints; ensure responses reflect updated vacation balance.
- Document that vacation_deduction on day plans drives vacation balance changes.

## Acceptance criteria
- Approved vacation absence deducts the day plan value from vacation balance.
- Half-day absences deduct half of the day plan value.
- Canceling an approved absence restores the deducted amount.

## Tests
### Unit tests
- Full-day and half-day deductions using day plan VacationDeduction.
- Fallback behavior when no day plan is present.
- Cancellation reverses deduction.

### Integration tests
- Creating and approving a vacation absence updates VacationBalance.Taken correctly.


## Test Case Pack
1) Full day deduction
   - Input: vacation_deduction=1.0, duration=1.0
   - Expected: Taken +1.0
2) Half day deduction
   - Input: vacation_deduction=1.0, duration=0.5
   - Expected: Taken +0.5
3) Custom deduction
   - Input: vacation_deduction=0.75, duration=1.0
   - Expected: Taken +0.75


## Dependencies
- Absence days lifecycle (ZMI-TICKET-008).
- Vacation entitlement calculation (ZMI-TICKET-014).
- Day plan advanced rules (ZMI-TICKET-006).
