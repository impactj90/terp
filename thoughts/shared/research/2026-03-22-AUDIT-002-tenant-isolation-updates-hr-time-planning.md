# AUDIT-002: Tenant Isolation Update Violations in HR, Time, and Planning Domains

**Date**: 2026-03-22
**Ticket**: AUDIT-002
**Severity**: Critical -- cross-tenant data modification via `update({ where: { id } })` without `tenantId`

## Summary

12 update violations across 10 repository files where `prisma.model.update({ where: { id } })` is used without `tenantId` in the where clause. All 12 models have a direct `tenantId` field, and all affected functions already receive `tenantId` as a parameter but ignore it in the where clause.

Additionally, 2 violations found in `macro-executor.ts` (direct Prisma calls bypassing the repository), and 1 secondary read issue in `day-plans-repository.ts` (`findByIdWithDetail` has no tenant scoping).

---

## 1. tenantScopedUpdate Helper Analysis

**File**: `src/lib/services/prisma-helpers.ts`

### Signature

```ts
export async function tenantScopedUpdate(
  delegate: PrismaDelegate,            // e.g., prisma.booking
  where: { id: string; tenantId: string } & Record<string, unknown>,
  data: Record<string, unknown>,
  opts?: {
    include?: Record<string, unknown>;
    select?: Record<string, unknown>;
    entity?: string
  },
): Promise<any>
```

### Behavior

1. Calls `delegate.updateMany({ where, data })` -- tenant-scoped
2. Checks `count === 0` and throws `TenantScopedNotFoundError` (mapped to tRPC NOT_FOUND)
3. Refetches with `delegate.findFirst({ where, include?, select? })` to return the full record
4. Returns the refetched record

### Key Points

- **Supports `include` and `select`**: The opts parameter accepts both, and they are passed to `findFirst` during refetch. This means files with include clauses (daily-value, employee-day-plans, employee-access-assignment, teams) can use this helper directly.
- **Already used in 25+ repositories**: Well-established pattern (bookings, corrections, absences, reports, employees, etc.)
- **Also available**: `relationScopedUpdate` for models without direct `tenantId` (uses relation filter like `{ id, document: { tenantId } }`). Not needed here since all 12 models have direct `tenantId`.

---

## 2. Prisma Schema Confirmation

All 12 affected models have a direct `tenantId` field:

| Model | tenantId | Relevant @@unique | Has compound id+tenantId unique? |
|---|---|---|---|
| DailyValue | `String @map("tenant_id") @db.Uuid` | `@@unique([employeeId, valueDate])` | No |
| DayPlan | `String @map("tenant_id") @db.Uuid` | `@@unique([tenantId, code])` | No |
| EmployeeDayPlan | `String @map("tenant_id") @db.Uuid` | `@@unique([employeeId, planDate])` | No |
| EmployeeAccessAssignment | `String @map("tenant_id") @db.Uuid` | None | No |
| EmployeeCappingException | `String @map("tenant_id") @db.Uuid` | None | No |
| EmployeeTariffAssignment | `String @map("tenant_id") @db.Uuid` | None | No |
| Macro | `String @map("tenant_id") @db.Uuid` | `@@unique([tenantId, name])` | No |
| MacroAssignment | `String @map("tenant_id") @db.Uuid` | None | No |
| MacroExecution | `String @map("tenant_id") @db.Uuid` | None | No |
| Team | `String @map("tenant_id") @db.Uuid` | `@@unique([tenantId, name])` | No |
| WeekPlan | `String @map("tenant_id") @db.Uuid` | `@@unique([tenantId, code])` | No |
| CorrectionMessage | `String @map("tenant_id") @db.Uuid` | `@@unique([tenantId, code])` | No |

**None of these models have a compound `@@unique([id, tenantId])` constraint**, so `prisma.model.update({ where: { id_tenantId: { id, tenantId } } })` is NOT possible. The fix must use either:
- `tenantScopedUpdate` helper (updateMany + refetch), or
- Manual `updateMany({ where: { id, tenantId } })` + refetch

---

## 3. Violation Details

### Violation 1: daily-value-repository.ts -- `updateStatus()`

**File**: `src/lib/services/daily-value-repository.ts`, line 84-95

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

**Include structure to preserve**:
```ts
const dailyValueListAllInclude = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      personnelNumber: true,
      isActive: true,
      departmentId: true,
      tariffId: true,
    },
  },
} as const
```

**Fix**: Use `tenantScopedUpdate(prisma.dailyValue, { id, tenantId }, { status }, { include: dailyValueListAllInclude, entity: "DailyValue" })`

---

### Violation 2: day-plans-repository.ts -- `update()`

**File**: `src/lib/services/day-plans-repository.ts`, line 87-94

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

**No include clause** -- simple update with no refetch relations needed.

**Fix**: Use `tenantScopedUpdate(prisma.dayPlan, { id, tenantId }, data, { entity: "DayPlan" })`

**Secondary issue in same file**: `findByIdWithDetail` at line 96 takes no `tenantId` parameter and uses `findUnique({ where: { id } })`. This is called by `day-plans-service.ts` after create/update operations (lines 318, 557, 717). While the service already validates tenant ownership before calling this, it should be scoped for defense-in-depth. (Separate from the 12 update violations -- could be addressed as a bonus fix.)

---

### Violation 3: employee-day-plans-repository.ts -- `update()`

**File**: `src/lib/services/employee-day-plans-repository.ts`, line 114-125

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

**Include structure to preserve**:
```ts
export const edpListInclude = {
  dayPlan: { select: { id: true, code: true, name: true, planType: true } },
  shift: { select: { id: true, code: true, name: true, color: true } },
} as const
```

**Fix**: Use `tenantScopedUpdate(prisma.employeeDayPlan, { id, tenantId }, data, { include: edpListInclude, entity: "EmployeeDayPlan" })`

---

### Violation 4: employee-access-assignment-repository.ts -- `update()`

**File**: `src/lib/services/employee-access-assignment-repository.ts`, line 95-106

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

**Include structure to preserve**:
```ts
const assignmentInclude = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      personnelNumber: true,
    },
  },
  accessProfile: {
    select: { id: true, code: true, name: true },
  },
} as const
```

**Fix**: Use `tenantScopedUpdate(prisma.employeeAccessAssignment, { id, tenantId }, data, { include: assignmentInclude, entity: "EmployeeAccessAssignment" })`

---

### Violation 5: employee-capping-exception-repository.ts -- `update()`

**File**: `src/lib/services/employee-capping-exception-repository.ts`, line 112-119

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

**No include clause**.

**Fix**: Use `tenantScopedUpdate(prisma.employeeCappingException, { id, tenantId }, data, { entity: "EmployeeCappingException" })`

---

### Violation 6: employee-tariff-assignment-repository.ts -- `update()`

**File**: `src/lib/services/employee-tariff-assignment-repository.ts`, line 96-103

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

**No include clause**.

**Fix**: Use `tenantScopedUpdate(prisma.employeeTariffAssignment, { id, tenantId }, data, { entity: "EmployeeTariffAssignment" })`

---

### Violation 7: macros-repository.ts -- `updateMacro()`

**File**: `src/lib/services/macros-repository.ts`, line 71-78

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

**No include clause**. (The service re-fetches with `findMacroById` after calling this, so the return value is not directly used for its relations.)

**Fix**: Use `tenantScopedUpdate(prisma.macro, { id, tenantId }, data, { entity: "Macro" })`

---

### Violation 8: macros-repository.ts -- `updateAssignment()`

**File**: `src/lib/services/macros-repository.ts`, line 123-130

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

**No include clause**.

**Fix**: Use `tenantScopedUpdate(prisma.macroAssignment, { id: assignmentId, tenantId }, data, { entity: "MacroAssignment" })`

---

### Violation 9: macros-repository.ts -- `updateExecution()`

**File**: `src/lib/services/macros-repository.ts`, line 181-193

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

**No include clause**.

**Fix**: Use `tenantScopedUpdate(prisma.macroExecution, { id, tenantId }, data as Record<string, unknown>, { entity: "MacroExecution" })`

---

### Violation 10: teams-repository.ts -- `update()`

**File**: `src/lib/services/teams-repository.ts`, line 124-135

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

**Include structure to preserve**:
```ts
const teamRelationsInclude = {
  department: {
    select: { id: true, name: true, code: true },
  },
  leader: {
    select: { id: true, firstName: true, lastName: true },
  },
  _count: { select: { members: true } },
} as const
```

**Fix**: Use `tenantScopedUpdate(prisma.team, { id, tenantId }, data, { include: teamRelationsInclude, entity: "Team" })`

---

### Violation 11: week-plan-repository.ts -- `update()`

**File**: `src/lib/services/week-plan-repository.ts`, line 115-122

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

**No include clause**.

**Fix**: Use `tenantScopedUpdate(prisma.weekPlan, { id, tenantId }, data, { entity: "WeekPlan" })`

---

### Violation 12: correction-assistant-repository.ts -- `updateMessage()`

**File**: `src/lib/services/correction-assistant-repository.ts`, line 60-67

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

**No include clause**.

**Fix**: Use `tenantScopedUpdate(prisma.correctionMessage, { id, tenantId }, data, { entity: "CorrectionMessage" })`

---

## 4. Macro-Executor Analysis

**File**: `src/lib/services/macro-executor.ts`

The `MacroExecutor` class bypasses the repository entirely for execution updates. It makes **direct Prisma calls**:

### Direct update calls in macro-executor.ts (lines 177-197)

```ts
// Line 177 -- error path
await this.prisma.macroExecution.update({
  where: { id: execution.id },
  data: {
    completedAt: new Date(),
    status: "failed",
    errorMessage: String(err),
  },
})

// Line 189 -- success path
await this.prisma.macroExecution.update({
  where: { id: execution.id },
  data: {
    completedAt: new Date(),
    status: actionResult.error ? "failed" : "completed",
    result: (actionResult.result as object) ?? {},
    errorMessage: actionResult.error,
  },
})
```

**Risk**: These updates use `{ where: { id: execution.id } }` without `tenantId`. While the execution record was just created by the same method (line 154), so it should be valid, this is still a defense-in-depth gap. The `tenantId` is available via `macro.tenantId`.

### MacroAssignment bulk updates (lines 87-91, 125-129)

```ts
await this.prisma.macroAssignment.updateMany({
  where: { id: { in: successfulWeeklyIds } },
  data: { lastExecutedAt: new Date(), lastExecutedDate: date },
})
```

**Risk**: These `updateMany` calls also lack `tenantId` in the where clause. The IDs come from a tenant-scoped query (`where: { tenantId, macroType: "weekly" }`) so they should be correct, but adding `tenantId` to the where clause costs nothing and provides defense-in-depth.

**Recommendation**: Fix macro-executor.ts by:
1. Using `repo.updateExecution()` instead of direct Prisma calls (after the repo is fixed)
2. Adding `tenantId` to the `macroAssignment.updateMany` where clauses

---

## 5. Reference Patterns from Properly-Scoped Repositories

### Pattern A: Simple update (no include)

**Example**: `src/lib/services/reports-repository.ts` line 107
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

export async function update(prisma: PrismaClient, tenantId: string, id: string, data: Record<string, unknown>) {
  return tenantScopedUpdate(prisma.report, { id, tenantId }, data, { entity: "Report" })
}
```

### Pattern B: Update with include

**Example**: `src/lib/services/bookings-repository.ts` line 159
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

export async function update(prisma: PrismaClient, tenantId: string, id: string, data: Record<string, unknown>) {
  return tenantScopedUpdate(prisma.booking, { id, tenantId }, data, {
    include: bookingDetailInclude,
    entity: "Booking",
  })
}
```

**Example**: `src/lib/services/vacation-balances-repository.ts` line 119
```ts
return tenantScopedUpdate(prisma.vacationBalance, { id: balanceId, tenantId }, data, {
  include: { employee: { select: employeeSelect } },
  entity: "VacationBalance",
})
```

---

## 6. Implementation Summary

### Fix approach for all 12 violations

1. Add `import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"` to each file
2. Replace `prisma.model.update({ where: { id }, data, include? })` with `tenantScopedUpdate(prisma.model, { id, tenantId }, data, { include?, entity })`

### Categorized by fix complexity

**Simple (no include, one-liner)** -- 7 violations:
- `day-plans-repository.ts` -- `update()`
- `employee-capping-exception-repository.ts` -- `update()`
- `employee-tariff-assignment-repository.ts` -- `update()`
- `macros-repository.ts` -- `updateMacro()`
- `macros-repository.ts` -- `updateAssignment()`
- `week-plan-repository.ts` -- `update()`
- `correction-assistant-repository.ts` -- `updateMessage()`

**With include (one-liner, pass include to opts)** -- 4 violations:
- `daily-value-repository.ts` -- `updateStatus()` (include: `dailyValueListAllInclude`)
- `employee-day-plans-repository.ts` -- `update()` (include: `edpListInclude`)
- `employee-access-assignment-repository.ts` -- `update()` (include: `assignmentInclude`)
- `teams-repository.ts` -- `update()` (include: `teamRelationsInclude`)

**Typed data parameter** -- 1 violation:
- `macros-repository.ts` -- `updateExecution()` -- data is typed as `{ completedAt, status, result, errorMessage }` not `Record<string, unknown>`. Need to cast `data as Record<string, unknown>` when passing to `tenantScopedUpdate`.

**Macro-executor (direct Prisma, not repository)** -- 2+2 violations:
- 2x `prisma.macroExecution.update()` -- should use `repo.updateExecution()` after repo is fixed
- 2x `prisma.macroAssignment.updateMany()` -- add `tenantId` to where clause (the `tenantId` is available as `tenantId` parameter of `executeDueMacros`)

### Bonus fix (secondary read issue)
- `day-plans-repository.ts` -- `findByIdWithDetail()` takes no `tenantId` param, uses `findUnique({ where: { id } })`

---

## 7. Surprises and Edge Cases

1. **macro-executor.ts bypasses repo**: The `MacroExecutor` class does 4 direct Prisma calls without tenant scoping, not going through the repository layer. This is a separate concern from the 12 repository violations. After fixing `macros-repository.ts`, the executor should be refactored to use the repo methods.

2. **updateExecution typed data**: Unlike all other update functions that take `Record<string, unknown>`, `updateExecution` has a typed `data` parameter (`{ completedAt: Date, status: string, result: object, errorMessage: string | null }`). This needs a cast to `Record<string, unknown>` for `tenantScopedUpdate`.

3. **No compound unique on id+tenantId**: None of the 12 models have `@@unique([id, tenantId])`, so we cannot use `prisma.model.update({ where: { id_tenantId: { id, tenantId } } })`. The `tenantScopedUpdate` (updateMany + refetch) pattern is the correct approach.

4. **day-plans-repository.ts findByIdWithDetail**: Missing tenant scope on this read function. It's called after tenant-validated operations in the service layer, but the repo itself is unscoped. Low severity (read-only) but should be fixed for consistency.

5. **deleteById consistency**: All 10 repository files already use `deleteMany({ where: { id, tenantId } })` for delete operations, which is correctly tenant-scoped. The bug is exclusively in update operations.

6. **Service-layer pre-validation**: Most services (macros-service, day-plans-service, etc.) do a tenant-scoped `findById` before calling the vulnerable `update()`. This means exploitation requires a TOCTOU race condition where the record is deleted and recreated by another tenant between the check and the update. While this narrows the attack window, it does not eliminate the vulnerability -- the repository must be the single source of truth for tenant isolation.
