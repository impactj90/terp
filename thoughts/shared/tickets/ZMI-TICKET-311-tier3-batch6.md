# ZMI-TICKET-311: Extract Services — Tier 3 Batch 6

Status: Todo
Priority: P1
Depends on: ZMI-TICKET-303

## Goal
Extract service + repository layers for: dailyValues, userGroups, tenants, correctionAssistant, employeeTariffAssignments, departments.

## Routers (6 total)

### dailyValues.ts (~420 lines)
- Permission: `daily_values.read`
- Model: `DailyValue`
- Read-heavy: list by employee+date range, with aggregations
- Repository: complex date range queries, employee filter, includes
- Service: date validation, response formatting

### userGroups.ts (~400 lines)
- Permission: `user_groups.read`, `user_groups.write`
- Model: `UserGroup`
- Relations: permissions (many-to-many), users (count)
- Service: permission assignment/removal, group-level permission management

### tenants.ts (~380 lines)
- Permission: `tenants.manage` (for CRUD), none for list (user's own tenants)
- Model: `Tenant`
- Special: `list` returns only user-authorized tenants (via user_tenants)
- Service: tenant activation/deactivation, user-tenant access check

### correctionAssistant.ts (~400 lines)
- Permission: `corrections.read`, `corrections.write`
- Model: `Correction` (with related bookings, daily values)
- Complex: analyzes booking errors, suggests corrections
- Service: error detection logic, correction suggestion generation

### employeeTariffAssignments.ts (~380 lines)
- Permission: `employees.read`, `employees.write`
- Model: `EmployeeTariffAssignment`
- Relations: employee, tariff
- Service: date range overlap validation, bulk assignment

### departments.ts (~400 lines)
- Permission: `departments.read`, `departments.write`
- Model: `Department`
- Special: tree/hierarchy structure (parentId), department tree query
- Service: tree building, circular reference prevention
- Repository: recursive tree query

## Files Created (~12)
For each of the 6 routers: 1 service + 1 repository = 12 new files

## Verification
```bash
make typecheck
make test
```
