# ZMI-TICKET-317: Extract Services — vacation (847 lines)

Status: Todo
Priority: P1
Depends on: ZMI-TICKET-303

## Goal
Extract service + repository layers for the vacation router. This handles vacation entitlement previews, carryover calculations, and balance management.

## Current Router Analysis (src/server/routers/vacation.ts — 847 lines)

### Procedures
- `vacation.getEntitlementPreview` — calculate vacation entitlement for employee
- `vacation.getCarryoverPreview` — calculate vacation carryover for year transition
- `vacation.getYearOverview` — year overview with all vacation data
- `vacation.getDailyBreakdown` — daily vacation usage breakdown
- `vacation.getBalance` — current vacation balance for employee

### Key Business Logic
- Entitlement calculation (uses vacation-calculation.ts lib)
- Carryover calculation (uses carryover-calculation.ts lib)
- Complex date arithmetic for prorated entitlements
- Integration with vacation calc groups, capping rules, special calculations
- Aggregation of absence days, balance entries, carryover amounts
- Year overview combining multiple data sources

### Dependencies
- `@/lib/services/vacation-calculation` (entitlement engine)
- `@/lib/services/carryover-calculation` (carryover engine)
- `@/lib/services/vacation-helpers` (utility functions)
- `@/lib/services/vacation-balance-output` (output formatting)

## Implementation

### Repository: `src/lib/services/vacation-repository.ts`
```typescript
export async function findVacationCalcGroup(prisma, tenantId, employeeId)
export async function findCappingRules(prisma, tenantId, groupId)
export async function findSpecialCalculations(prisma, tenantId, groupId)
export async function findCappingExceptions(prisma, tenantId, employeeId)
export async function findAbsenceDaysForYear(prisma, tenantId, employeeId, year)
export async function findBalanceEntries(prisma, tenantId, employeeId, year)
export async function findDailyBreakdown(prisma, tenantId, employeeId, dateFrom, dateTo)
```

### Service: `src/lib/services/vacation-service.ts`
```typescript
export class EmployeeNotAssignedError extends Error { ... }
export class CalcGroupNotFoundError extends Error { ... }

export async function getEntitlementPreview(prisma, tenantId, employeeId, year)
  // Orchestrates: fetch employee → calc group → rules → calculate
export async function getCarryoverPreview(prisma, tenantId, employeeId, fromYear, toYear)
  // Orchestrates: fetch data → apply capping rules → calculate carryover
export async function getYearOverview(prisma, tenantId, employeeId, year)
  // Combines: entitlement + carryover + absences + balances
export async function getDailyBreakdown(prisma, tenantId, employeeId, dateFrom, dateTo)
export async function getBalance(prisma, tenantId, employeeId)
```

## Files Created
- `src/lib/services/vacation-service.ts`
- `src/lib/services/vacation-repository.ts`

## Verification
```bash
make typecheck
make test
```
