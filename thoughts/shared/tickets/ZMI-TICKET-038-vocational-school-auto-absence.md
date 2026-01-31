# ZMI-TICKET-038: Auto-create Vocational School Absence on No Bookings

Status: Proposed
Priority: P3
Owner: TBD
Manual references: 3.4.4.6 Sonderfunktionen (Berufsschultag)

## Goal
Automatically create a Berufsschule absence when no bookings exist and the day plan is configured for vocational school behavior.

## Scope
- In scope: Daily calculation triggers absence creation for past dates, idempotent behavior.
- Out of scope: Workflow UI for selecting absence type (use system default).

## Requirements
### Data model
- Reuse existing absence type code "SB" (Berufsschule) seeded by system.

### Business rules
- If day plan no_booking_behavior == vocational_school and date is in the past:
  - If no absence exists for the date, create an AbsenceDay with type SB, duration 1.00, status approved.
  - Recalculate the day after absence creation.
- If SB absence type is missing, keep current behavior and add a warning.
- Idempotent: do not create duplicate absences.

### API / OpenAPI
- No new endpoints; behavior is internal to daily calculation.

## Acceptance criteria
- Past dates with no bookings and vocational_school behavior create an absence day.
- Daily value warning ABSENCE_CREATION_NOT_IMPLEMENTED is removed.
- Recalculation uses the created absence for time credit.

## Tests
### Unit tests
- No booking + vocational_school creates absence and marks as approved.
- If absence already exists, no duplicate is created.

### Integration tests
- Daily calc on a past date creates absence and produces expected daily value.


## Test Case Pack
1) Create absence
   - Input: no bookings, day plan behavior vocational_school, date in past
   - Expected: AbsenceDay created with type SB and status approved
2) Idempotency
   - Input: run daily calc twice
   - Expected: single absence record


## Dependencies
- Absence types (ZMI-TICKET-007).
- Absence days lifecycle (ZMI-TICKET-008).
- Day plan advanced rules (ZMI-TICKET-006).
