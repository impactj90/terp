# ZMI-TICKET-307: Extract Services — Tier 3 Batch 2 (Simple CRUD)

Status: Todo
Priority: P1
Depends on: ZMI-TICKET-303

## Goal
Extract service + repository layers for: bookingReasons, bookingTypeGroups, absenceTypeGroups, vacationCappingRules, vacationSpecialCalcs, localTravelRules, extendedTravelRules.

## Routers (7 total)

### bookingReasons.ts
- Permission: `booking_types.read`, `booking_types.write`
- Model: `BookingReason`
- Standard CRUD

### bookingTypeGroups.ts
- Permission: `booking_types.read`, `booking_types.write`
- Model: `BookingTypeGroup`
- Relations: bookingTypes (nested)

### absenceTypeGroups.ts
- Permission: `absence_types.read`, `absence_types.write`
- Model: `AbsenceTypeGroup`
- Relations: absenceTypes (nested)

### vacationCappingRules.ts
- Permission: `vacation_config.read`, `vacation_config.write`
- Model: `VacationCappingRule`
- Relations: vacationCappingRuleGroup

### vacationSpecialCalcs.ts
- Permission: `vacation_config.read`, `vacation_config.write`
- Model: `VacationSpecialCalculation`
- Standard CRUD

### localTravelRules.ts
- Permission: `travel_allowance.read`, `travel_allowance.write`
- Model: `LocalTravelRule`
- Relations: travelAllowanceRuleSet

### extendedTravelRules.ts
- Permission: `travel_allowance.read`, `travel_allowance.write`
- Model: `ExtendedTravelRule`
- Relations: travelAllowanceRuleSet

## Pattern
Same CRUD service+repository pattern as TICKET-306. Each router follows the identical structure.

## Files Created (~14)
For each of the 7 routers: 1 service + 1 repository = 14 new files

## Verification
```bash
make typecheck
make test
```
