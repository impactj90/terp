# AUDIT-002 Implementation Plan: Tenant Isolation Updates -- HR, Time, Planning

**Date**: 2026-03-22
**Ticket**: AUDIT-002
**Branch**: staging

---

## 1. Summary

12 update methods across 10 repository files use `prisma.model.update({ where: { id } })` without `tenantId` in the where clause. All models have a direct `tenantId` column. All functions already receive `tenantId` as a parameter but ignore it.

**Fix**: Replace every bare `prisma.model.update({ where: { id } })` with a call to `tenantScopedUpdate()` from `prisma-helpers.ts`, which does `updateMany({ where: { id, tenantId } })` + count check + `findFirst` refetch.

**Out of scope** (per ticket):
- Service-layer callers -- do NOT modify
- Read methods (findById, findFirst) -- separate ticket AUDIT-006
- Repositories already using `tenantScopedUpdate`
- Refactoring beyond the 12 update methods
- `macro-executor.ts` direct Prisma calls (noted for follow-up, NOT in this ticket)

---

## 2. Pattern

### Helper signature (`src/lib/services/prisma-helpers.ts`)

```ts
export async function tenantScopedUpdate(
  delegate: PrismaDelegate,
  where: { id: string; tenantId: string } & Record<string, unknown>,
  data: Record<string, unknown>,
  opts?: { include?: Record<string, unknown>; select?: Record<string, unknown>; entity?: string },
): Promise<any>
```

Behavior: `updateMany({ where, data })` -> if count===0, throws `TenantScopedNotFoundError` -> `findFirst({ where, include?, select? })` -> returns record.

### Import to add in each file

```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

---

## 3. Phase 1: Simple Updates (no include) -- 7 violations in 5 files

### 3a. `src/lib/services/day-plans-repository.ts` -- `update()`

**Current code** (lines 87-94):
```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.dayPlan.update({ where: { id }, data })
}
```

**Replacement**:
```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.dayPlan, { id, tenantId }, data, { entity: "DayPlan" })
}
```

**Import to add** (line 7, after existing `import type { PrismaClient }`):
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

---

### 3b. `src/lib/services/employee-capping-exception-repository.ts` -- `update()`

**Current code** (lines 112-119):
```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.employeeCappingException.update({ where: { id }, data })
}
```

**Replacement**:
```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.employeeCappingException, { id, tenantId }, data, { entity: "EmployeeCappingException" })
}
```

**Import to add** (after line 8, after existing imports):
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

---

### 3c. `src/lib/services/employee-tariff-assignment-repository.ts` -- `update()`

**Current code** (lines 96-103):
```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.employeeTariffAssignment.update({ where: { id }, data })
}
```

**Replacement**:
```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.employeeTariffAssignment, { id, tenantId }, data, { entity: "EmployeeTariffAssignment" })
}
```

**Import to add** (after line 7, after existing import):
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

---

### 3d. `src/lib/services/week-plan-repository.ts` -- `update()`

**Current code** (lines 115-122):
```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.weekPlan.update({ where: { id }, data })
}
```

**Replacement**:
```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.weekPlan, { id, tenantId }, data, { entity: "WeekPlan" })
}
```

**Import to add** (after line 7, after existing import):
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

---

### 3e. `src/lib/services/correction-assistant-repository.ts` -- `updateMessage()`

**Current code** (lines 60-67):
```ts
export async function updateMessage(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.correctionMessage.update({ where: { id }, data })
}
```

**Replacement**:
```ts
export async function updateMessage(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.correctionMessage, { id, tenantId }, data, { entity: "CorrectionMessage" })
}
```

**Import to add** (after line 7, after existing import):
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

---

## 4. Phase 2: Updates with `include` -- 4 violations in 4 files

### 4a. `src/lib/services/daily-value-repository.ts` -- `updateStatus()`

**Current code** (lines 84-95):
```ts
export async function updateStatus(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  status: string
) {
  return prisma.dailyValue.update({
    where: { id },
    data: { status },
    include: dailyValueListAllInclude,
  })
}
```

**Replacement**:
```ts
export async function updateStatus(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  status: string
) {
  return tenantScopedUpdate(prisma.dailyValue, { id, tenantId }, { status }, {
    include: dailyValueListAllInclude,
    entity: "DailyValue",
  })
}
```

**Include structure preserved** (already defined at top of file, lines 8-20):
```ts
const dailyValueListAllInclude = {
  employee: {
    select: {
      id: true, firstName: true, lastName: true,
      personnelNumber: true, isActive: true,
      departmentId: true, tariffId: true,
    },
  },
} as const
```

**Import to add** (after line 6, after existing import):
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

---

### 4b. `src/lib/services/employee-day-plans-repository.ts` -- `update()`

**Current code** (lines 114-125):
```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.employeeDayPlan.update({
    where: { id },
    data,
    include: edpListInclude,
  })
}
```

**Replacement**:
```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.employeeDayPlan, { id, tenantId }, data, {
    include: edpListInclude,
    entity: "EmployeeDayPlan",
  })
}
```

**Include structure preserved** (already defined at line 10-13):
```ts
export const edpListInclude = {
  dayPlan: { select: { id: true, code: true, name: true, planType: true } },
  shift: { select: { id: true, code: true, name: true, color: true } },
} as const
```

**Import to add** (after line 7, after existing import):
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

---

### 4c. `src/lib/services/employee-access-assignment-repository.ts` -- `update()`

**Current code** (lines 95-106):
```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.employeeAccessAssignment.update({
    where: { id },
    data,
    include: assignmentInclude,
  })
}
```

**Replacement**:
```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.employeeAccessAssignment, { id, tenantId }, data, {
    include: assignmentInclude,
    entity: "EmployeeAccessAssignment",
  })
}
```

**Include structure preserved** (already defined at lines 8-20):
```ts
const assignmentInclude = {
  employee: {
    select: { id: true, firstName: true, lastName: true, personnelNumber: true },
  },
  accessProfile: {
    select: { id: true, code: true, name: true },
  },
} as const
```

**Import to add** (after line 7, after existing import):
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

---

### 4d. `src/lib/services/teams-repository.ts` -- `update()`

**Current code** (lines 124-135):
```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.team.update({
    where: { id },
    data,
    include: teamRelationsInclude,
  })
}
```

**Replacement**:
```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.team, { id, tenantId }, data, {
    include: teamRelationsInclude,
    entity: "Team",
  })
}
```

**Include structure preserved** (already defined at lines 10-18):
```ts
const teamRelationsInclude = {
  department: { select: { id: true, name: true, code: true } },
  leader: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { members: true } },
} as const
```

**Import to add** (after line 7, after existing import):
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

---

## 5. Phase 3: Macros Repository -- 3 violations in 1 file

**File**: `src/lib/services/macros-repository.ts`

**Single import to add** (after line 7, after existing import):
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

### 5a. `updateMacro()` (lines 71-78)

**Current code**:
```ts
export async function updateMacro(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.macro.update({ where: { id }, data })
}
```

**Replacement**:
```ts
export async function updateMacro(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.macro, { id, tenantId }, data, { entity: "Macro" })
}
```

### 5b. `updateAssignment()` (lines 123-130)

**Current code**:
```ts
export async function updateAssignment(
  prisma: PrismaClient,
  tenantId: string,
  assignmentId: string,
  data: Record<string, unknown>
) {
  return prisma.macroAssignment.update({ where: { id: assignmentId }, data })
}
```

**Replacement**:
```ts
export async function updateAssignment(
  prisma: PrismaClient,
  tenantId: string,
  assignmentId: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.macroAssignment, { id: assignmentId, tenantId }, data, { entity: "MacroAssignment" })
}
```

**Note**: The parameter is named `assignmentId` not `id`, so the where object uses `{ id: assignmentId, tenantId }`.

### 5c. `updateExecution()` (lines 181-193)

**Current code**:
```ts
export async function updateExecution(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: {
    completedAt: Date
    status: string
    result: object
    errorMessage: string | null
  }
) {
  return prisma.macroExecution.update({ where: { id }, data })
}
```

**Replacement**:
```ts
export async function updateExecution(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: {
    completedAt: Date
    status: string
    result: object
    errorMessage: string | null
  }
) {
  return tenantScopedUpdate(prisma.macroExecution, { id, tenantId }, data as Record<string, unknown>, { entity: "MacroExecution" })
}
```

**Special consideration**: The `data` parameter has a typed signature (`{ completedAt, status, result, errorMessage }`), not `Record<string, unknown>`. Must cast with `data as Record<string, unknown>` to satisfy `tenantScopedUpdate`'s type.

### 5d. Caller: `macro-executor.ts` -- NOT in scope

The ticket says "Do not refactor beyond the 3 update methods" and "Do not modify service layer callers." The `macro-executor.ts` makes 2 direct `prisma.macroExecution.update()` calls and 2 `prisma.macroAssignment.updateMany()` calls without tenant scoping. These are **out of scope** for AUDIT-002 and should be tracked separately. The `macros-repository.ts` fixes above are sufficient for the repository layer.

---

## 6. Complete Edit Summary

| # | File | Method | Has Include | Cast Needed | Import Needed |
|---|------|--------|-------------|-------------|---------------|
| 1 | `day-plans-repository.ts` | `update()` | No | No | Yes |
| 2 | `employee-capping-exception-repository.ts` | `update()` | No | No | Yes |
| 3 | `employee-tariff-assignment-repository.ts` | `update()` | No | No | Yes |
| 4 | `week-plan-repository.ts` | `update()` | No | No | Yes |
| 5 | `correction-assistant-repository.ts` | `updateMessage()` | No | No | Yes |
| 6 | `daily-value-repository.ts` | `updateStatus()` | `dailyValueListAllInclude` | No | Yes |
| 7 | `employee-day-plans-repository.ts` | `update()` | `edpListInclude` | No | Yes |
| 8 | `employee-access-assignment-repository.ts` | `update()` | `assignmentInclude` | No | Yes |
| 9 | `teams-repository.ts` | `update()` | `teamRelationsInclude` | No | Yes |
| 10 | `macros-repository.ts` | `updateMacro()` | No | No | Yes (once) |
| 11 | `macros-repository.ts` | `updateAssignment()` | No | No | (same file) |
| 12 | `macros-repository.ts` | `updateExecution()` | No | `data as Record<string, unknown>` | (same file) |

**Total files to modify**: 10
**Total imports to add**: 10 (one per file)
**Total method bodies to change**: 12

---

## 7. Verification Steps

After all 12 fixes are applied:

```bash
# 1. Type-check -- must pass with no NEW errors
pnpm typecheck

# 2. Run full test suite
pnpm test

# 3. Lint check
pnpm lint
```

### Manual smoke tests (optional but recommended):
- Attempt to update a macro with an ID from a different tenant -> should get `TenantScopedNotFoundError` (mapped to tRPC NOT_FOUND)
- Verify daily value status updates return the full object with employee include
- Verify team updates return the team with department, leader, and member count
- Verify macro assignment and execution updates work in the normal same-tenant flow

---

## 8. Risks and Edge Cases

1. **Return type change**: `prisma.model.update()` returns the exact Prisma type. `tenantScopedUpdate` returns `Promise<any>`. Since the callers (service layer) are NOT being modified, and TypeScript does not fail on `any` flowing into typed variables, this is safe. The actual runtime return value is identical (same record, same includes).

2. **`updateExecution` typed data cast**: The `data as Record<string, unknown>` cast is necessary because the function signature uses a typed object, not `Record<string, unknown>`. This is safe because the cast only broadens the type for the helper; the actual data shape is unchanged.

3. **`assignmentId` naming**: In `updateAssignment()`, the parameter is named `assignmentId`, not `id`. The where clause must be `{ id: assignmentId, tenantId }` -- mapping the parameter to the `id` field.

4. **No compound unique constraint**: None of the 12 models have `@@unique([id, tenantId])`. The `tenantScopedUpdate` helper correctly uses `updateMany` (which does not require a unique constraint) rather than `update` (which would).

5. **`macro-executor.ts` remains unfixed**: The executor makes 4 direct Prisma calls without tenant scoping. While these are defense-in-depth gaps (the IDs come from tenant-scoped queries), they should be addressed in a follow-up ticket.
