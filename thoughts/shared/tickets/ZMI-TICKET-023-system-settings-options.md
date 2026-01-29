# ZMI-TICKET-023: System Settings Options and Safety Tools

Status: Proposed
Priority: P2
Owner: TBD
Manual references: 10 System Settings (Options, Cleanup, Program Start, Proxy, Server Alive)

## Goal
Implement system-wide settings that influence calculation, error handling, and maintenance operations.

## Scope
- In scope: Options, error list, rounding relative to plan, startup displays, proxy settings, server alive settings, cleanup tools, OpenAPI coverage.
- Out of scope: UI grid configuration (separate if required).

## Requirements
### Settings areas
- Options:
  - Error list configuration (which errors are tracked)
  - Rounding relative to plan start (affects rounding behavior)
  - Auto-fill end bookings for order changes (if Auftrag enabled)
- Program start:
  - Birthday list window (days before/after)
  - Follow-up entries (if supported)
- Proxy settings for email/internet access
- Server Alive monitoring:
  - Expected calculation completion time
  - Notification recipients and thresholds
- Cleanup tools (dangerous operations):
  - Delete bookings for date range
  - Delete booking data (bookings + plans)
  - Re-read bookings
  - Mark/delete orders (Auftrag)

### Business rules
- Changing rounding relative to plan start immediately affects subsequent calculations.
- Cleanup tools require elevated permissions and should log all actions.
- Server Alive triggers notifications if calculations are late or errors occur.

### API / OpenAPI
- Endpoints:
  - Get/update system settings
  - Trigger cleanup operations (with confirmations)
  - Configure Server Alive alerts
- OpenAPI must document each setting and its impact.

## Acceptance criteria
- Settings can be read/updated via API and persist correctly.
- Rounding relative to plan start affects calculation results.
- Cleanup operations are permission-gated and audited.
- Server Alive alerts can be configured and emitted.

## Tests
### Unit tests
- Validation for rounding relative to plan start flag.
- Permission checks for cleanup operations.
- Server Alive alert rule evaluation.

### API tests
- Update options and verify persistence.
- Trigger cleanup operation with insufficient permissions => forbidden.

### Integration tests
- Rounding behavior changes based on setting.
- Server Alive notification is triggered when calculations miss deadline.


## Test Case Pack
1) Rounding relative to plan start
   - Input: plan start=08:10, rounding=15m, booking=08:11
   - Expected: rounded to 08:25 when relative flag enabled
2) Cleanup permission
   - Input: non-admin triggers delete bookings
   - Expected: forbidden
3) Server alive threshold
   - Input: expected completion 05:00, actual 05:30
   - Expected: alert triggered


## Dependencies
- User permissions (ZMI-TICKET-003).
- Daily calculation (ZMI-TICKET-006).
- Auftrag module (ZMI-TICKET-017) for order-related options.
