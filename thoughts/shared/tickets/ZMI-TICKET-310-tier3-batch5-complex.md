# ZMI-TICKET-310: Extract Services — Tier 3 Batch 5 (More Complex)

Status: Todo
Priority: P1
Depends on: ZMI-TICKET-303

## Goal
Extract service + repository layers for routers with more elaborate business logic: orders, exportInterfaces, vacationCalcGroups, vacationCappingRuleGroups, terminalBookings, weekPlans, orderBookings.

## Routers (7 total)

### orders.ts (~400 lines)
- Permission: `orders.read`, `orders.write`
- Model: `Order`
- Relations: costCenter, orderAssignments
- Service: order number generation, status transitions

### exportInterfaces.ts (~420 lines)
- Permission: `export_interfaces.read`, `export_interfaces.write`
- Model: `ExportInterface`
- Relations: exportInterfaceAccounts (many-to-many with Account)
- Service: account configuration, setAccounts bulk operation

### vacationCalcGroups.ts (~380 lines)
- Permission: `vacation_config.read`, `vacation_config.write`
- Model: `VacationCalculationGroup`
- Relations: vacationSpecialCalculations
- Service: group composition validation

### vacationCappingRuleGroups.ts (~370 lines)
- Permission: `vacation_config.read`, `vacation_config.write`
- Model: `VacationCappingRuleGroup`
- Relations: vacationCappingRules
- Service: rule group composition

### terminalBookings.ts (~380 lines)
- Permission: `terminal.read`, `terminal.write`
- Model: `RawTerminalBooking`
- Extra: import trigger, batch processing
- Service: terminal import processing, raw→booking conversion

### weekPlans.ts (~400 lines)
- Permission: `week_plans.read`, `week_plans.write`
- Model: `WeekPlan`
- Relations: dayPlans (7 day assignments)
- Service: week structure validation (Mon-Sun mapping)

### orderBookings.ts (~380 lines)
- Permission: `orders.read`, `orders.write`
- Model: `OrderBooking`
- Relations: order, employee, booking
- Service: booking-order linkage validation

## Files Created (~14)
For each of the 7 routers: 1 service + 1 repository = 14 new files

## Verification
```bash
make typecheck
make test
```
