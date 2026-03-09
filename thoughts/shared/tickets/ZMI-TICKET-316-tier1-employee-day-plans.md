# ZMI-TICKET-316: Extract Services — employeeDayPlans (736 lines)

Status: Todo
Priority: P1
Depends on: ZMI-TICKET-303

## Goal
Extract service + repository layers for the employeeDayPlans router. This handles employee-specific day plan assignments with bulk operations and tariff-based generation.

## Current Router Analysis (src/server/routers/employeeDayPlans.ts — 736 lines)

### Procedures
- `employeeDayPlans.list` — list by employee + date range
- `employeeDayPlans.getById` — single assignment with details
- `employeeDayPlans.create` — assign day plan to employee for date
- `employeeDayPlans.bulkCreate` — assign day plans for date range
- `employeeDayPlans.update` — update assignment
- `employeeDayPlans.delete` — remove assignment
- `employeeDayPlans.deleteRange` — remove assignments for date range
- `employeeDayPlans.generateFromTariff` — auto-generate from tariff week plan
- `employeeDayPlans.getEffectiveTariff` — get which tariff applies for employee on date
- `employeeDayPlans.getSource` — get source of day plan (manual, tariff, generated)

### Key Business Logic
- Bulk creation for date ranges (respecting weekday mapping)
- Tariff-based generation (uses employee's assigned tariff + week plan)
- Source tracking (manual vs generated vs tariff-derived)
- Date range operations (delete range)
- Effective tariff resolution (considers assignment history)

### Dependencies
- `@/lib/services/employee-day-plan-generator` (generation logic)

## Implementation

### Repository: `src/lib/services/employee-day-plan-repository.ts`
```typescript
export async function findMany(prisma, tenantId, params: { employeeId, dateFrom, dateTo })
export async function findById(prisma, tenantId, id)
export async function create(prisma, tenantId, data)
export async function bulkCreate(prisma, tenantId, items[])
export async function update(prisma, tenantId, id, data)
export async function remove(prisma, tenantId, id)
export async function removeRange(prisma, tenantId, employeeId, dateFrom, dateTo)
export async function findEffectiveTariff(prisma, tenantId, employeeId, date)
export async function findSource(prisma, tenantId, employeeId, date)
```

### Service: `src/lib/services/employee-day-plan-service.ts`
```typescript
export class EmployeeDayPlanNotFoundError extends Error { ... }
export class InvalidDateRangeError extends Error { ... }

export async function list(prisma, tenantId, params)
export async function getById(prisma, tenantId, id)
export async function create(prisma, tenantId, data)
export async function bulkCreate(prisma, tenantId, data)
  // Expands date range into individual day assignments
export async function update(prisma, tenantId, id, data)
export async function remove(prisma, tenantId, id)
export async function deleteRange(prisma, tenantId, employeeId, dateFrom, dateTo)
export async function generateFromTariff(prisma, tenantId, employeeId, dateFrom, dateTo)
  // Uses employee-day-plan-generator service
export async function getEffectiveTariff(prisma, tenantId, employeeId, date)
export async function getSource(prisma, tenantId, employeeId, date)
```

## Files Created
- `src/lib/services/employee-day-plan-service.ts`
- `src/lib/services/employee-day-plan-repository.ts`

## Verification
```bash
make typecheck
make test
```
