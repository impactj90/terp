# ZMI-TICKET-035: Booking Reason Time Adjustments (Buchen mit Grund)

Status: Proposed
Priority: P2
Owner: TBD
Manual references: 3.4.4.10 Buchen mit Grund

## Goal
Implement booking reasons that automatically add/subtract work time relative to a day plan or booking time.

## Scope
- In scope: Reason configuration fields, auto-adjustment booking creation, daily calculation impact, API/OpenAPI.
- Out of scope: Terminal UI and vendor-specific terminal protocol.

## Requirements
### Data model
- Extend booking reasons with adjustment configuration:
  - reference_time: plan_start | plan_end | booking_time
  - offset_minutes (signed int)
  - adjustment_direction: in | out (optional; defaults to booking type direction)
  - auto_generated flag and original_booking_id on generated bookings

### Business rules
- When a booking is created with a reason that has adjustments configured, create a derived booking:
  - Reference time comes from the active day plan (start/end) or the original booking time.
  - Apply offset_minutes (negative or positive) to compute the derived time.
  - Derived booking is marked auto-generated and linked to the original booking.
- Auto-generated bookings are idempotent (recalc or re-import must not duplicate them).
- If no day plan is available when reference_time is plan-based, fall back to booking_time or skip with a warning.
- Derived bookings participate in pairing and daily calculation like normal work bookings.

### API / OpenAPI
- Extend booking reason CRUD to include adjustment configuration.
- Extend booking list responses to include auto-generated flag and original_booking_id.
- Document how booking reasons affect calculated time.

## Acceptance criteria
- Booking reason with offset creates a derived booking and increases/decreases daily net time accordingly.
- Recalculation or re-import does not create duplicate derived bookings.
- If reason has no adjustment configured, behavior is unchanged.

## Tests
### Unit tests
- Compute derived time from plan_start/plan_end/booking_time with positive and negative offsets.
- Idempotency: creating the same booking twice does not duplicate derived booking.

### API tests
- Create booking reason with offset; create booking with that reason; verify derived booking exists.

### Integration tests
- Daily calculation reflects the additional minutes from derived bookings.


## Test Case Pack
1) Plan-based offset
   - Input: plan_start=07:00, reason offset=-30
   - Expected: derived booking at 06:30
2) Booking-time offset
   - Input: booking at 17:00, reason offset=+20
   - Expected: derived booking at 17:20
3) Missing day plan
   - Input: reason uses plan_start, no day plan
   - Expected: derived booking skipped or falls back to booking_time with warning


## Dependencies
- Booking types and groups (ZMI-TICKET-010).
- Booking ingest/edit flow (ZMI-TICKET-011).
- Day plan advanced rules (ZMI-TICKET-006).
