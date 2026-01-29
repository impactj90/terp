# ZMI-TICKET-006: Day Plan Advanced Rules and Daily Calculation Integration

Status: Proposed
Priority: P1
Owner: TBD
Manual references: 3.4.4 Day Plan, 3.4.4.6 Special Functions, 3.4.4.6 Day Change, 3.4.4.7 Surcharges

## Goal
Ensure daily calculation uses all ZMI day plan settings and special functions exactly as specified in the manual.

## Scope
- In scope: Day plan fields integration into daily calc, no-booking behaviors, holiday credit categories, regular hours overrides, rounding options, day change behavior.
- Out of scope: Booking import, absence day lifecycle, monthly evaluation.

## Requirements
### Business rules
- Target hours resolution order:
  1. If day plan uses "from employee master" and employee has target hours, use that.
  2. If the day is an absence day and RegularHours2 is set, use RegularHours2.
  3. Otherwise use RegularHours.
- Holiday credit:
  - Use holiday category (1/2/3) to apply day plan credit values for that category.
  - If day plan credit for category is missing, credit 0 for that category.
- Break types (per day plan):
  - Fixed breaks are always deducted if work overlaps the configured window, regardless of manual break bookings.
  - Variable breaks are deducted only when no manual break booking exists.
  - Minimum breaks are deducted after a configured presence threshold; if “minutes difference” is enabled, deduct only the minutes above the threshold until full break is reached.
- Vacation deduction:
  - Use day plan "vacation deduction" value for vacation balance reduction on absence days.
- No bookings behavior options (day plan setting):
  - No evaluation: mark day as error in correction assistant.
  - Deduct target: subtract target hours and do not create booking entries.
  - Vocational school: create an absence day of the configured type for past dates, no error.
  - Adopt target: credit target time as if worked (daily net/gross equals target).
  - Target with order: if default order exists, create order booking entry for target time.
- Rounding behavior:
  - "Round all bookings" applies rounding to every in/out booking; otherwise round only first in and last out.
  - Support add/subtract rounding with configurable values.
- Tolerance behavior:
  - For fixed plans: Come- tolerance applies only if “variable work time” is enabled.
  - For flextime plans: Come+ and Go- tolerances are not used (per manual).
- Evaluation window capping:
  - Time is only credited within the evaluation window (Kommen von → Gehen bis), except when tolerance settings extend the window.
  - Arrivals before the window are capped to the earliest allowed time; departures after the window are capped to the latest allowed time.
- Core time:
  - If core time window is configured, missing coverage triggers core time violation errors.
- Day change behavior:
  - None, at arrival, at departure, auto-complete at 00:00 (creation of 00:00 bookings on next day calculation).
- Rounding relative to plan start:
  - If enabled in system settings, rounding must be relative to planned start time, not absolute clock intervals.

### API / OpenAPI
- Expose all day plan fields used above (including RegularHours2, from employee master flag, holiday credits, vacation deduction, no booking behavior, round all bookings).
- Document behavioral semantics in OpenAPI field descriptions.

## Acceptance criteria
- Daily calculation respects all day plan settings above and produces expected target, net, gross, and error states.
- "No bookings" behaviors produce correct daily values and error/hint states.
- Holiday credit uses category-based values.
- Auto-complete day change creates 00:00 bookings on the correct dates.
- OpenAPI includes all relevant day plan fields with clear descriptions.

## Tests
### Unit tests
- Target hours resolution order (employee master override, absence day override, regular hours fallback).
- Holiday category credit mapping (1/2/3 to day plan credits).
- Rounding behavior for first/last booking vs all bookings.
- Fixed/variable/minimum break deductions with and without manual breaks.
- Minimum break with minutes-difference example: threshold 5:00, break 0:30, presence 5:10 => deduct 10 minutes.
- No-booking behaviors produce expected daily value state and errors/warnings.
- Day change auto-complete inserts 00:00 bookings with correct dates.
 - Evaluation window capping: arrivals before Kommen von are credited from window start; departures after Gehen bis are credited only to window end (with tolerance adjustments).

### API tests
- Update day plan settings and verify they are reflected in API responses.
- Create daily calculation inputs for each no-booking behavior and verify outputs.

### Integration tests
- Daily calculation uses holiday category + day plan credit values.
- Rounding relative to plan start vs absolute intervals based on system setting.
- Target-with-order behavior creates booking entries tied to default order (if order module enabled).
- Flextime plan ignores Come+ and Go- tolerance values; fixed plan uses Come- only when variable work time is enabled.


## Test Case Pack
1) Evaluation window capping
   - Input: Kommen von=06:00, Gehen bis=18:00, booking at 05:30–18:30
   - Expected: credited from 06:00 to 18:00 (unless tolerance extends)
2) Fixed vs variable breaks
   - Input: fixed break 12:00–12:30, variable break 12:00–12:30, no manual break
   - Expected: fixed break always deducted; variable break deducted only if no manual break
3) Minimum break with minutes difference
   - Input: threshold 5:00, break 0:30, presence 5:10, minutes_difference=true
   - Expected: deduct 0:10
4) Tolerance rules
   - Input: fixed plan, variable_work_time=false, come- tolerance set
   - Expected: come- tolerance ignored
5) No-booking behavior
   - Input: no bookings, behavior=deduct target
   - Expected: undertime set to target; no bookings created
6) Day change auto-complete
   - Input: come 23:03 20:00, go 24:03 07:00, auto-complete
   - Expected: add 23:03 00:00 go, 24:03 00:00 come on next day calc


## Dependencies
- Time plan framework (ZMI-TICKET-005).
- Holiday categories (ZMI-TICKET-002).
- Employee master data (ZMI-TICKET-004).
- System settings options (ZMI-TICKET-023).
