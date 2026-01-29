# ZMI-TICKET-017: ZMI Auftrag Module (Order/Project Tracking)

Status: Proposed
Priority: P2
Owner: TBD
Manual references: Mentioned in multiple sections as separate documentation (Auftragsdaten, Auftragsauswertungen, ZMI Auftrag)

## Goal
Implement the ZMI Auftrag module for order/project time tracking, including default order assignment and order-based calculations.

## Scope
- In scope: Order data model, order assignments, order booking rules, order reporting hooks, OpenAPI coverage.
- Out of scope: Full UI workflows; requires separate ZMI Auftrag documentation.

## Requirements
### Data model
- Order fields: code/number, name, status, mandant, customer, cost center, billing rates.
- Order assignments: employee-to-order links, order leader/sales assignments.
- Order booking rules: allow bookings to reference an order and activity.

### Business rules
- Default order from personnel master is used when "target with order" behavior is configured in day plan.
- Order-related calculations must integrate with daily and monthly values.
- Order export/analytics must be possible via data exchange and reports.

### API / OpenAPI
- Endpoints:
  - CRUD orders
  - Assign orders to employees
  - Create order bookings and list by date range
  - Order evaluation reports
- OpenAPI must include order fields and booking relations.

## Acceptance criteria
- Orders can be created and assigned to employees.
- Order bookings can be created and are included in daily values.
- Default order integration works when day plan requires it.

## Tests
### Unit tests
- Validate required order fields and status transitions.
- Default order used when day plan requires target-with-order.

### API tests
- Create order; assign to employee; create order booking; verify retrieval.

### Integration tests
- Daily calculation writes order-linked time when configured.


## Test Case Pack
1) Default order usage
   - Input: employee default order set; no-booking behavior = target-with-order
   - Expected: booking created against default order
2) Order booking retrieval
   - Input: create order booking
   - Expected: booking listed in order reports


## Dependencies
- Employee master data (ZMI-TICKET-004).
- Booking ingest/edit flow (ZMI-TICKET-011).
- Day plan advanced rules (ZMI-TICKET-006).

## Notes
- Full functional parity requires the separate ZMI Auftrag documentation.
