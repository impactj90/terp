# ZMI-TICKET-309: Extract Services — Tier 3 Batch 4

Status: Todo
Priority: P1
Depends on: ZMI-TICKET-303

## Goal
Extract service + repository layers for: bookingTypes, absenceTypes, orderAssignments, vehicleRoutes, vehicles, tripRecords.

## Routers (6 total)

### bookingTypes.ts (~420 lines)
- Permission: `booking_types.read`, `booking_types.write`
- Model: `BookingType`
- Relations: bookingTypeGroup, accounts
- Service: type configuration validation, account linkage

### absenceTypes.ts (~430 lines)
- Permission: `absence_types.read`, `absence_types.write`
- Model: `AbsenceType`
- Relations: absenceTypeGroup, accounts, calculationRules
- Service: type configuration validation, deduction settings

### orderAssignments.ts (~350 lines)
- Permission: `orders.read`, `orders.write`
- Model: `OrderAssignment`
- Relations: order, employee
- Service: assignment date range validation, overlap checks

### vehicleRoutes.ts (~320 lines)
- Permission: `vehicles.read`, `vehicles.write`
- Model: `VehicleRoute`
- Relations: vehicle
- Standard CRUD

### vehicles.ts (~330 lines)
- Permission: `vehicles.read`, `vehicles.write`
- Model: `Vehicle`
- Relations: vehicleRoutes
- Service: license plate uniqueness

### tripRecords.ts (~340 lines)
- Permission: `travel_allowance.read`, `travel_allowance.write`
- Model: `TripRecord`
- Relations: employee, vehicle
- Service: trip date validation, mileage calculation

## Files Created (~12)
For each of the 6 routers: 1 service + 1 repository = 12 new files

## Verification
```bash
make typecheck
make test
```
