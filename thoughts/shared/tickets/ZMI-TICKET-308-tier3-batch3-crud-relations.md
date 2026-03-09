# ZMI-TICKET-308: Extract Services — Tier 3 Batch 3 (CRUD with Relations)

Status: Todo
Priority: P1
Depends on: ZMI-TICKET-303

## Goal
Extract service + repository layers for routers with slightly more complex logic: calculationRules, monthlyEvalTemplates, shifts, employeeCappingExceptions, employeeAccessAssignments, travelAllowanceRuleSets, notifications.

## Routers (7 total)

### calculationRules.ts (~400 lines)
- Permission: `calculation_rules.read`, `calculation_rules.write`
- Model: `CalculationRule`
- Extra: complex validation of rule configuration (type, operator, value constraints)
- Service should contain rule validation logic

### monthlyEvalTemplates.ts (~350 lines)
- Permission: `monthly_evaluations.read`, `monthly_evaluations.write`
- Model: `MonthlyEvaluationTemplate`
- Relations: template columns, template rows
- Service: template structure validation

### shifts.ts (~380 lines)
- Permission: `shifts.read`, `shifts.write`
- Model: `Shift`
- Relations: employee assignments
- Service: shift overlap validation, assignment management

### employeeCappingExceptions.ts (~340 lines)
- Permission: `vacation_config.write`
- Model: `EmployeeCappingException`
- Relations: employee, vacationCappingRule
- Service: exception uniqueness per employee+rule

### employeeAccessAssignments.ts (~330 lines)
- Permission: `access_control.write`
- Model: `EmployeeAccessAssignment`
- Relations: employee, accessProfile
- Service: assignment management, duplicate prevention

### travelAllowanceRuleSets.ts (~360 lines)
- Permission: `travel_allowance.read`, `travel_allowance.write`
- Model: `TravelAllowanceRuleSet`
- Relations: localTravelRules, extendedTravelRules (nested CRUD)
- Service: rule set composition validation

### notifications.ts (~350 lines)
- Permission: none (user's own notifications)
- Model: `Notification`
- Extra: mark as read, mark all as read, unread count
- Service: notification delivery, read status management

## Files Created (~14)
For each of the 7 routers: 1 service + 1 repository = 14 new files

## Verification
```bash
make typecheck
make test
```
