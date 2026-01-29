# ZMI-TICKET-010: Booking Types and Booking Type Groups

Status: Proposed
Priority: P1
Owner: TBD
Manual references: 6.2.2 Booking Types (Buchungsarten) and BA-Gruppen

## Goal
Implement booking type definitions that control terminal options and drive pairing and calculation logic.

## Scope
- In scope: Booking type CRUD, grouping, direction (come/go/break), linked account, OpenAPI coverage.
- Out of scope: Booking import and pairing logic (separate tickets).

## Requirements
### Data model
- Booking type fields:
  - Code (e.g., A1/A2, PA/PE)
  - Name/label
  - Direction (IN/OUT)
  - Category (work, break, business trip, other)
  - Linked account (optional)
  - Active flag
  - Optional “requires reason” flag
- Booking reasons (if required):
  - Code and label
  - Linkable to booking types that require a reason
- Booking type groups:
  - Name
  - Ordered list of booking types
  - Used to control availability at terminals

### Business rules
- Standard booking types must exist (A1/A2, PA/PE, business trip start/end).
- Direction determines pairing logic and daily calculation inputs.
- Group membership controls which booking types are allowed for a terminal.
- If a booking type requires a reason, bookings must include a valid reason code.

### API / OpenAPI
- Endpoints:
  - CRUD booking types
  - CRUD booking type groups
  - CRUD booking reasons (if supported)
  - List booking types by group
- OpenAPI must document direction and category semantics.

## Acceptance criteria
- Booking types can be created and grouped.
- Standard booking types are seeded for new tenants.
- API exposes booking types with direction/category fields.

## Tests
### Unit tests
- Validate direction values and category values.
- Enforce uniqueness for booking type code per tenant.
- Group ordering preserved.
- Booking types that require a reason reject bookings without a valid reason.

### API tests
- Create booking type and verify in list.
- Create group and assign booking types; list group contents.

### Integration tests
- Daily calculation pairing logic recognizes break vs work categories based on booking type.


## Test Case Pack
1) Standard booking types
   - Input: seed data check
   - Expected: A1/A2 and PA/PE exist with correct direction
2) Reason-required booking type
   - Input: booking type requires reason, booking without reason
   - Expected: validation error
3) Group membership
   - Input: booking type group for Terminal X
   - Expected: only group types available for that terminal


## Dependencies
- Accounts module (ZMI-TICKET-009) for optional account linkage.
