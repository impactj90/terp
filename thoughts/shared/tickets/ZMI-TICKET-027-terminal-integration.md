# ZMI-TICKET-027: Terminal Integration and Raw Booking Ingest

Status: Proposed
Priority: P2
Owner: TBD
Manual references: 12 ZMI Server tasks (terminal communication); 9.3 Terminal Bookings

## Goal
Provide terminal integration capabilities for importing raw bookings and syncing terminal state.

## Scope
- In scope: Storage of raw terminal bookings, import job hooks, OpenAPI coverage for raw data queries.
- Out of scope: Specific terminal protocols (requires vendor docs).

## Requirements
### Data model
- Terminal booking record:
  - Terminal ID
  - Employee ID/PIN
  - Raw timestamp
  - Raw booking code
  - Import batch ID

### Business rules
- Raw terminal bookings are stored separately from processed bookings.
- Import tasks must be idempotent per batch.
- Terminal sync tasks (time, accounts, access data) are represented as scheduler tasks with status tracking.

### API / OpenAPI
- Endpoints:
  - List terminal bookings by date range and terminal
  - Trigger terminal import (if supported)
- OpenAPI must document raw booking fields.

## Acceptance criteria
- Raw terminal bookings are stored and queryable.
- Import batches are idempotent.
- Scheduler tasks for terminal sync can be configured and logged.

## Tests
### Unit tests
- Idempotent import handling per batch ID.

### API tests
- List terminal bookings for a date range.

### Integration tests
- Terminal import task creates processed bookings and raw records.


## Test Case Pack
1) Idempotent batch import
   - Input: import batch ID twice
   - Expected: only one set of raw bookings stored
2) Raw bookings query
   - Input: date range query
   - Expected: raw records returned with terminal IDs


## Dependencies
- Booking ingest/edit flow (ZMI-TICKET-011).
- ZMI Server scheduler (ZMI-TICKET-022).

## Notes
- Full protocol support depends on terminal vendor documentation.
