# ZMI-TICKET-324: Extract Services — employees (1613 lines)

Status: Todo
Priority: P1
Depends on: ZMI-TICKET-303, ZMI-TICKET-317 (vacation), ZMI-TICKET-323 (absences)

## Goal
Extract service + repository layers for the employees router. This is the LARGEST router in the codebase with search, bulk tariff assignment, day view, calculateDay integration, and deep integration with multiple services.

## Current Router Analysis (src/server/routers/employees.ts — 1613 lines)

### Procedures
- `employees.list` — paginated list with search, department/team/group filters, data scope
- `employees.getById` — single employee with all relations
- `employees.create` — create employee with nested contacts + cards
- `employees.update` — update employee
- `employees.delete` — soft delete employee
- `employees.search` — full-text search across name, number, department
- `employees.getDayView` — complete day view (bookings, absences, daily values, day plan)
- `employees.calculateDay` — trigger daily calculation for employee on date
- `employees.getMonthSummary` — monthly summary (hours, absences, overtime)
- `employees.getYearOverview` — year overview (monthly summaries for all 12 months)
- `employees.getDailyBreakdown` — daily breakdown for a month
- `employees.bulkTariffAssignment` — assign tariff to multiple employees at once

### Key Business Logic
- Complex search with multiple filter dimensions + data scope
- Day view aggregation (combines data from 4+ tables)
- Daily calculation trigger (calls DailyCalcService)
- Monthly summary aggregation
- Year overview combining 12 months of data
- Bulk tariff assignment with date range
- Employee number generation/uniqueness

### Dependencies
- `@/lib/services/daily-calc` (DailyCalcService)
- `@/lib/services/monthly-calc` (MonthlyCalcService)
- `@/lib/services/recalc` (RecalcService)
- `@/lib/services/vacation-calculation` (vacation data)
- `@/lib/auth/middleware` (data scope, permissions)

## Implementation

### Repository: `src/lib/services/employee-repository.ts`
```typescript
// Core CRUD
export async function findMany(prisma, tenantId, params: { page?, pageSize?, search?, departmentId?, teamId?, groupId?, isActive?, dataScope? })
export async function count(prisma, tenantId, params)
export async function findById(prisma, tenantId, id) // with contacts, cards, tariffAssignments, department, employmentType
export async function create(prisma, tenantId, data) // with nested contacts + cards
export async function update(prisma, tenantId, id, data)
export async function softDelete(prisma, tenantId, id)

// Search
export async function search(prisma, tenantId, query: string, params)

// Day view data
export async function findDayViewData(prisma, tenantId, employeeId, date)
  // Fetches: bookings, absences, dailyValue, employeeDayPlan for one day

// Monthly/Year
export async function findMonthSummary(prisma, tenantId, employeeId, year, month)
export async function findYearOverview(prisma, tenantId, employeeId, year)
export async function findDailyBreakdown(prisma, tenantId, employeeId, year, month)

// Bulk operations
export async function bulkCreateTariffAssignments(prisma, tenantId, employeeIds[], tariffId, dateFrom, dateTo?)
```

### Service: `src/lib/services/employee-service.ts`
```typescript
export class EmployeeNotFoundError extends Error { ... }
export class EmployeeNumberExistsError extends Error { ... }
export class InvalidEmployeeDataError extends Error { ... }

// Core CRUD
export async function list(prisma, tenantId, params)
export async function getById(prisma, tenantId, id)
export async function create(prisma, tenantId, data)
  // Generate employee number if not provided
  // Validate department, employment type exist
export async function update(prisma, tenantId, id, data)
export async function remove(prisma, tenantId, id)
export async function search(prisma, tenantId, query, params)

// Day view
export async function getDayView(prisma, tenantId, employeeId, date)
  // Orchestrates: fetch day data + format for UI

// Calculation trigger
export async function calculateDay(prisma, tenantId, employeeId, date)
  // Calls DailyCalcService.calculateDay
  // Returns updated daily value

// Monthly/Year summaries
export async function getMonthSummary(prisma, tenantId, employeeId, year, month)
export async function getYearOverview(prisma, tenantId, employeeId, year)
export async function getDailyBreakdown(prisma, tenantId, employeeId, year, month)

// Bulk operations
export async function bulkTariffAssignment(prisma, tenantId, employeeIds, tariffId, dateFrom, dateTo?)
  // Validate tariff exists
  // Create assignments for all employees
  // Trigger recalculation for affected date ranges
```

## Files Created
- `src/lib/services/employee-service.ts`
- `src/lib/services/employee-repository.ts`

## Verification
```bash
make typecheck
make test        # employees has test files
```

## Notes
This is the most complex extraction. The calculateDay integration with DailyCalcService and the day view aggregation are the trickiest parts. Consider reading the full router carefully before starting.
