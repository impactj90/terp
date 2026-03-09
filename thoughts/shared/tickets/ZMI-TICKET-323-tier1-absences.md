# ZMI-TICKET-323: Extract Services — absences (1335 lines)

Status: Todo
Priority: P1
Depends on: ZMI-TICKET-303, ZMI-TICKET-317 (vacation service)

## Goal
Extract service + repository layers for the absences router. This is a complex domain router handling absence range creation/deletion, overlap checking, and vacation balance integration.

## Current Router Analysis (src/server/routers/absences.ts — 1335 lines)

### Procedures
- `absences.list` — list absences with employee/date/type filters, data scope
- `absences.getById` — single absence with details
- `absences.create` — create single absence day
- `absences.createRange` — create absence for date range (multiple days)
- `absences.update` — update absence
- `absences.delete` — delete single absence
- `absences.deleteRange` — delete absences for date range
- `absences.getOverlaps` — check for overlapping absences
- `absences.getVacationImpact` — preview vacation balance impact of absence

### Key Business Logic
- Range creation: expand date range into individual absence days, skip weekends/holidays
- Overlap detection: prevent double-booking absence days
- Vacation impact: calculate how an absence affects vacation balance
- Half-day absences (morning/afternoon)
- Absence type rules (deduction settings, requires approval, etc.)
- Data scope enforcement (own absences vs all)
- Recalculation trigger after CUD operations
- Holiday-aware date expansion (skip public holidays)

### Dependencies
- `@/lib/services/daily-calc` (recalculation)
- `@/lib/services/recalc` (recalc orchestration)
- `@/lib/services/holiday-calendar` (holiday detection)
- `@/lib/services/vacation-calculation` (vacation impact)

## Implementation

### Repository: `src/lib/services/absence-repository.ts`
```typescript
export async function findMany(prisma, tenantId, params: { employeeId?, dateFrom?, dateTo?, absenceTypeId?, page?, pageSize?, dataScope? })
export async function count(prisma, tenantId, params)
export async function findById(prisma, tenantId, id)
export async function findByEmployeeAndDateRange(prisma, tenantId, employeeId, dateFrom, dateTo)
export async function create(prisma, tenantId, data)
export async function createMany(prisma, tenantId, items[]) // for range creation
export async function update(prisma, tenantId, id, data)
export async function remove(prisma, tenantId, id)
export async function removeRange(prisma, tenantId, employeeId, dateFrom, dateTo, absenceTypeId?)
export async function findOverlaps(prisma, tenantId, employeeId, dateFrom, dateTo, excludeId?)
```

### Service: `src/lib/services/absence-service.ts`
```typescript
export class AbsenceNotFoundError extends Error { ... }
export class OverlappingAbsenceError extends Error { ... }
export class InvalidDateRangeError extends Error { ... }
export class AbsenceTypeNotFoundError extends Error { ... }

export async function list(prisma, tenantId, params)
export async function getById(prisma, tenantId, id)
export async function create(prisma, tenantId, data)
  // Single day creation with overlap check + recalc trigger
export async function createRange(prisma, tenantId, data: { employeeId, dateFrom, dateTo, absenceTypeId, halfDay? })
  // 1. Validate date range
  // 2. Expand to individual days (skip weekends + holidays)
  // 3. Check overlaps for all days
  // 4. Bulk create
  // 5. Trigger recalculation for affected days
export async function update(prisma, tenantId, id, data)
export async function remove(prisma, tenantId, id)
  // Delete + trigger recalc
export async function deleteRange(prisma, tenantId, employeeId, dateFrom, dateTo, absenceTypeId?)
  // Bulk delete + trigger recalc
export async function getOverlaps(prisma, tenantId, employeeId, dateFrom, dateTo)
export async function getVacationImpact(prisma, tenantId, employeeId, absenceTypeId, dateFrom, dateTo)
  // Uses vacation calculation to preview balance impact
```

## Files Created
- `src/lib/services/absence-service.ts`
- `src/lib/services/absence-repository.ts`

## Verification
```bash
make typecheck
make test        # absences has test files
```
