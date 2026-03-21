# Implementation Plan: Tenant-Scoped Updates

**Date**: 2026-03-21
**Branch**: `staging`
**Research**: `thoughts/shared/research/2026-03-21-tenant-scoped-updates.md`
**Severity**: HIGH — cross-tenant write vulnerability in 28 update calls + 6 read/count gaps

---

## Overview

Repository `update()` functions use `prisma.Model.update({ where: { id } })` without `tenantId` in the where clause. This allows cross-tenant data modification if an attacker guesses a valid record ID from another tenant. The fix uses `updateMany({ where: { id, tenantId } })` + count check + refetch pattern, which is already established in the codebase (see `group-repository.ts`, `export-interface-repository.ts`).

**Total locations**: 34 (28 update + 6 non-update)
**Files affected**: 21 repository files + 1 context file

---

## Phase 0: Create `tenantScopedUpdate()` Helper

### File: `src/lib/services/prisma-helpers.ts` (NEW)

This is a new file in the services directory, co-located with the repositories that use it.

```ts
/**
 * Shared Prisma helper for tenant-scoped updates.
 *
 * Uses updateMany({ where: { id, tenantId } }) to prevent cross-tenant
 * writes, then refetches the updated record (with optional includes).
 * Throws TenantScopedNotFoundError if no row matched.
 */

// Error class — name ends with "NotFoundError" so handleServiceError
// in src/trpc/errors.ts automatically maps it to tRPC NOT_FOUND.
export class TenantScopedNotFoundError extends Error {
  constructor(entity = "Record") {
    super(`${entity} not found`)
    this.name = "TenantScopedNotFoundError"
  }
}

/**
 * Tenant-scoped update: updateMany with {id, tenantId}, check count,
 * refetch with optional include/select.
 *
 * @param delegate  Prisma model delegate (e.g., prisma.booking)
 * @param where     Must include { id, tenantId } at minimum; can include extra fields (e.g., status for atomic checks)
 * @param data      The update payload
 * @param opts      Optional: include, select, entity name for error message
 * @returns         The refetched record after update
 * @throws          TenantScopedNotFoundError if count === 0
 */
export async function tenantScopedUpdate<T>(
  delegate: {
    updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>
    findFirst: (args: { where: Record<string, unknown>; include?: unknown; select?: unknown }) => Promise<T | null>
  },
  where: { id: string; tenantId: string } & Record<string, unknown>,
  data: Record<string, unknown>,
  opts?: { include?: unknown; select?: unknown; entity?: string },
): Promise<T> {
  const { count } = await delegate.updateMany({ where, data })
  if (count === 0) {
    throw new TenantScopedNotFoundError(opts?.entity)
  }
  const refetchArgs: { where: Record<string, unknown>; include?: unknown; select?: unknown } = { where }
  if (opts?.include) refetchArgs.include = opts.include
  if (opts?.select) refetchArgs.select = opts.select
  const result = await delegate.findFirst(refetchArgs)
  if (!result) {
    throw new TenantScopedNotFoundError(opts?.entity)
  }
  return result
}

/**
 * Tenant-scoped update via relation (for models without direct tenantId).
 * Uses a relation filter like { id, document: { tenantId } }.
 *
 * @param delegate  Prisma model delegate
 * @param where     Relation-scoped where (e.g., { id, document: { tenantId } })
 * @param data      The update payload
 * @param opts      Optional: include, select, entity name
 * @returns         The refetched record or throws
 */
export async function relationScopedUpdate<T>(
  delegate: {
    updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>
    findFirst: (args: { where: Record<string, unknown>; include?: unknown; select?: unknown }) => Promise<T | null>
  },
  where: Record<string, unknown>,
  data: Record<string, unknown>,
  opts?: { include?: unknown; select?: unknown; entity?: string },
): Promise<T> {
  const { count } = await delegate.updateMany({ where, data })
  if (count === 0) {
    throw new TenantScopedNotFoundError(opts?.entity)
  }
  const refetchArgs: { where: Record<string, unknown>; include?: unknown; select?: unknown } = { where }
  if (opts?.include) refetchArgs.include = opts.include
  if (opts?.select) refetchArgs.select = opts.select
  const result = await delegate.findFirst(refetchArgs)
  if (!result) {
    throw new TenantScopedNotFoundError(opts?.entity)
  }
  return result
}
```

### Design decisions

1. **Location**: `src/lib/services/prisma-helpers.ts` — co-located with repositories, importable as `@/lib/services/prisma-helpers`.
2. **Error class**: `TenantScopedNotFoundError` — name ends with `NotFoundError` so `handleServiceError()` in `src/trpc/errors.ts` automatically maps it to tRPC `NOT_FOUND` (line 17 pattern match).
3. **Two functions**: `tenantScopedUpdate` for models with direct `tenantId`; `relationScopedUpdate` for models scoped through a parent relation (e.g., `BillingDocumentPosition.document.tenantId`).
4. **Generic but pragmatic**: Uses `Record<string, unknown>` types to match existing repository conventions (all repositories already type `data` as `Record<string, unknown>`). The `<T>` generic preserves the return type from `findFirst`.
5. **No dependency on individual service errors**: The helper throws its own `TenantScopedNotFoundError`. Individual services can catch and rethrow their own domain-specific errors if needed.

### Verification
- `pnpm typecheck` must pass with the new file
- Import from a single repository and verify it compiles

### Rollback
- Delete `src/lib/services/prisma-helpers.ts`

---

## Phase 1: Fix All `update()` Functions in Repositories

Each fix follows the same pattern. For simple updates (no include), use `tenantScopedUpdate()`. For updates that need include, pass the include option. For the few special cases, inline code is noted.

For each file: import `tenantScopedUpdate` from `@/lib/services/prisma-helpers` and replace the `prisma.Model.update({ where: { id } })` call.

---

### Batch 1A: Simple Updates (no include, no special cases)

These 16 repositories all follow the identical pattern: `prisma.model.update({ where: { id }, data })` replaced by `tenantScopedUpdate(prisma.model, { id, tenantId }, data)`.

#### 1. `src/lib/services/employees-repository.ts` (line 180)

**Current**:
```ts
return prisma.employee.update({ where: { id }, data })
```
**New**:
```ts
return tenantScopedUpdate(prisma.employee, { id, tenantId }, data, { entity: "Employee" })
```

#### 2. `src/lib/services/payroll-export-repository.ts` (line 79)

**Current**:
```ts
return prisma.payrollExport.update({ where: { id }, data })
```
**New**:
```ts
return tenantScopedUpdate(prisma.payrollExport, { id, tenantId }, data, { entity: "PayrollExport" })
```

#### 3. `src/lib/services/reports-repository.ts` (line 105)

**Current**:
```ts
return prisma.report.update({ where: { id }, data })
```
**New**:
```ts
return tenantScopedUpdate(prisma.report, { id, tenantId }, data, { entity: "Report" })
```

#### 4. `src/lib/services/system-settings-repository.ts` (line 32)

**Current**:
```ts
return prisma.systemSetting.update({ where: { id }, data })
```
**New**:
```ts
return tenantScopedUpdate(prisma.systemSetting, { id, tenantId }, data, { entity: "SystemSetting" })
```

#### 5. `src/lib/services/crm-address-repository.ts` — `update` (line 109)

**Current**:
```ts
return prisma.crmAddress.update({ where: { id }, data })
```
**New**:
```ts
return tenantScopedUpdate(prisma.crmAddress, { id, tenantId }, data, { entity: "CrmAddress" })
```

#### 6. `src/lib/services/crm-address-repository.ts` — `updateContact` (line 192)

**Current**:
```ts
return prisma.crmContact.update({ where: { id }, data })
```
**New**:
```ts
return tenantScopedUpdate(prisma.crmContact, { id, tenantId }, data, { entity: "CrmContact" })
```

#### 7. `src/lib/services/crm-address-repository.ts` — `updateBankAccount` (line 250)

**Current**:
```ts
return prisma.crmBankAccount.update({ where: { id }, data })
```
**New**:
```ts
return tenantScopedUpdate(prisma.crmBankAccount, { id, tenantId }, data, { entity: "CrmBankAccount" })
```

#### 8. `src/lib/services/terminal-booking-repository.ts` — `updateImportBatch` (line 101)

**Current**:
```ts
return prisma.importBatch.update({ where: { id }, data })
```
**New**:
```ts
return tenantScopedUpdate(prisma.importBatch, { id, tenantId }, data, { entity: "ImportBatch" })
```

#### 9. `src/lib/services/access-profile-repository.ts` (line 54)

**Current**:
```ts
return prisma.accessProfile.update({ where: { id }, data })
```
**New**:
```ts
return tenantScopedUpdate(prisma.accessProfile, { id, tenantId }, data, { entity: "AccessProfile" })
```

#### 10. `src/lib/services/access-zone-repository.ts` (line 55)

**Current**:
```ts
return prisma.accessZone.update({ where: { id }, data })
```
**New**:
```ts
return tenantScopedUpdate(prisma.accessZone, { id, tenantId }, data, { entity: "AccessZone" })
```

#### 11. `src/lib/services/account-group-repository.ts` (line 68)

**Current**:
```ts
return prisma.accountGroup.update({ where: { id }, data })
```
**New**:
```ts
return tenantScopedUpdate(prisma.accountGroup, { id, tenantId }, data, { entity: "AccountGroup" })
```

#### 12. `src/lib/services/cost-center-repository.ts` (line 67)

**Current**:
```ts
return prisma.costCenter.update({ where: { id }, data })
```
**New**:
```ts
return tenantScopedUpdate(prisma.costCenter, { id, tenantId }, data, { entity: "CostCenter" })
```

#### 13. `src/lib/services/order-repository.ts` (line 96)

**Current**:
```ts
return prisma.order.update({ where: { id }, data })
```
**New**:
```ts
return tenantScopedUpdate(prisma.order, { id, tenantId }, data, { entity: "Order" })
```

#### 14. `src/lib/services/shift-repository.ts` (line 69)

**Current**:
```ts
return prisma.shift.update({ where: { id }, data })
```
**New**:
```ts
return tenantScopedUpdate(prisma.shift, { id, tenantId }, data, { entity: "Shift" })
```

#### 15. `src/lib/services/schedules-repository.ts` — `updateSchedule` (line 84)

**Current**:
```ts
return prisma.schedule.update({ where: { id }, data })
```
**New**:
```ts
return tenantScopedUpdate(prisma.schedule, { id, tenantId }, data, { entity: "Schedule" })
```

#### 16. `src/lib/services/schedules-repository.ts` — `updateExecution` (line 175)

**Current**:
```ts
return prisma.scheduleExecution.update({ where: { id }, data })
```
**New**:
```ts
return tenantScopedUpdate(prisma.scheduleExecution, { id, tenantId }, data, { entity: "ScheduleExecution" })
```

---

### Batch 1B: Updates with `include` (need refetch with includes)

#### 17. `src/lib/services/bookings-repository.ts` — `update` (lines 158-162)

**Current**:
```ts
return prisma.booking.update({
  where: { id },
  data,
  include: bookingDetailInclude,
})
```
**New**:
```ts
return tenantScopedUpdate(prisma.booking, { id, tenantId }, data, {
  include: bookingDetailInclude,
  entity: "Booking",
})
```

#### 18. `src/lib/services/correction-repository.ts` — `update` (lines 139-143)

**Current**:
```ts
return prisma.correction.update({
  where: { id },
  data,
  include: correctionInclude,
})
```
**New**:
```ts
return tenantScopedUpdate(prisma.correction, { id, tenantId }, data, {
  include: correctionInclude,
  entity: "Correction",
})
```

#### 19. `src/lib/services/absences-repository.ts` — `update` (lines 290-294)

**Current**:
```ts
return prisma.absenceDay.update({
  where: { id },
  data,
  include: absenceDayListInclude,
})
```
**New**:
```ts
return tenantScopedUpdate(prisma.absenceDay, { id, tenantId }, data, {
  include: absenceDayListInclude,
  entity: "AbsenceDay",
})
```

#### 20. `src/lib/services/vacation-balances-repository.ts` — `updateBalance` (lines 112-122)

**Signature change required**: Add `tenantId` parameter.

**Current**:
```ts
export async function updateBalance(
  prisma: PrismaClient,
  balanceId: string,
  data: Record<string, unknown>
) {
  return prisma.vacationBalance.update({
    where: { id: balanceId },
    data,
    include: { employee: { select: employeeSelect } },
  })
}
```
**New**:
```ts
export async function updateBalance(
  prisma: PrismaClient,
  tenantId: string,
  balanceId: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.vacationBalance, { id: balanceId, tenantId }, data, {
    include: { employee: { select: employeeSelect } },
    entity: "VacationBalance",
  })
}
```

**Caller update** in `src/lib/services/vacation-balances-service.ts` (line 376):

**Current**:
```ts
const balance = await repo.updateBalance(prisma, input.id, data)
```
**New**:
```ts
const balance = await repo.updateBalance(prisma, tenantId, input.id, data)
```

Also grep for any other callers of `repo.updateBalance` (only this one caller found).

---

### Batch 1C: Soft delete / restore (update as write)

#### 21. `src/lib/services/crm-address-repository.ts` — `softDelete` (lines 117-120)

**Current**:
```ts
return prisma.crmAddress.update({
  where: { id },
  data: { isActive: false },
})
```
**New**:
```ts
return tenantScopedUpdate(prisma.crmAddress, { id, tenantId }, { isActive: false } as Record<string, unknown>, { entity: "CrmAddress" })
```

#### 22. `src/lib/services/crm-address-repository.ts` — `restore` (lines 128-131)

**Current**:
```ts
return prisma.crmAddress.update({
  where: { id },
  data: { isActive: true },
})
```
**New**:
```ts
return tenantScopedUpdate(prisma.crmAddress, { id, tenantId }, { isActive: true } as Record<string, unknown>, { entity: "CrmAddress" })
```

#### 23. `src/lib/services/notification-repository.ts` — `markRead` (line 76)

**Current**:
```ts
return prisma.notification.update({ where: { id }, data: { readAt: new Date() } })
```
**New**:
```ts
return tenantScopedUpdate(prisma.notification, { id, tenantId }, { readAt: new Date() } as Record<string, unknown>, { entity: "Notification" })
```

---

### Batch 1D: Nullable tenantId models (special handling)

These models have `tenantId: String?` (nullable). System-wide records have `tenantId = null`. Updates should only target tenant-owned records, so using `{ id, tenantId }` (where tenantId is the caller's string) correctly excludes system records.

#### 24. `src/lib/services/users-repository.ts` — `update` (line 120)

**Current**:
```ts
return prisma.user.update({ where: { id }, data })
```
**New** (inline — User.tenantId is nullable, use relation-based scope like deleteById already does):
```ts
const { count } = await prisma.user.updateMany({
  where: { id, userTenants: { some: { tenantId } } },
  data,
})
if (count === 0) {
  throw new TenantScopedNotFoundError("User")
}
return prisma.user.findFirst({
  where: { id, userTenants: { some: { tenantId } } },
})
```
**Note**: This matches the existing `deleteById` pattern at line 124 which already uses `{ id, userTenants: { some: { tenantId } } }`. Import `TenantScopedNotFoundError` from `@/lib/services/prisma-helpers`.

#### 25. `src/lib/services/user-group-repository.ts` — `update` (line 108)

**Current**:
```ts
return prisma.userGroup.update({ where: { id }, data })
```
**New** (scope to tenant-owned groups only; system groups with null tenantId should not be editable):
```ts
return tenantScopedUpdate(prisma.userGroup, { id, tenantId }, data, { entity: "UserGroup" })
```
**Note**: `UserGroup.tenantId` is nullable. Using `{ id, tenantId }` where `tenantId` is a string correctly excludes system groups (null tenantId). This is the desired behavior — system groups should not be modified by tenants. The `deleteById` at line 112 already uses `{ id, tenantId }`.

#### 26. `src/lib/services/absence-type-repository.ts` — `update` (line 91)

**Current**:
```ts
return prisma.absenceType.update({ where: { id }, data })
```
**New** (scope to tenant-owned types only; system types with null tenantId should not be editable):
```ts
return tenantScopedUpdate(prisma.absenceType, { id, tenantId }, data, { entity: "AbsenceType" })
```
**Note**: Same rationale as UserGroup. The `deleteById` at line 96 already uses `{ id, tenantId }`.

---

### Batch 1E: TOCTOU Fixes (status-checking updates)

#### 27. `src/lib/services/correction-repository.ts` — `updateIfStatus` (lines 150-162)

**Current** (does NOT check status at all despite function name):
```ts
export async function updateIfStatus(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  expectedStatus: string,
  data: Record<string, unknown>
) {
  return prisma.correction.update({
    where: { id },
    data,
    include: correctionInclude,
  })
}
```
**New** (atomic tenant+status check):
```ts
export async function updateIfStatus(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  expectedStatus: string,
  data: Record<string, unknown>
) {
  const { count } = await prisma.correction.updateMany({
    where: { id, tenantId, status: expectedStatus },
    data,
  })
  if (count === 0) return null
  return prisma.correction.findFirst({
    where: { id, tenantId },
    include: correctionInclude,
  })
}
```
**Note**: Returns `null` instead of throwing when status doesn't match (or record not found). Callers should handle null. Check callers of `updateIfStatus` in correction-service.ts to ensure they handle null.

#### 28. `src/lib/services/absences-repository.ts` — `updateIfStatus` (lines 301-317)

**Current** (TOCTOU race: findFirst then update without tenantId):
```ts
export async function updateIfStatus(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  expectedStatus: string,
  data: Record<string, unknown>
) {
  const existing = await prisma.absenceDay.findFirst({ where: { id, tenantId, status: expectedStatus } })
  if (!existing) {
    return null
  }
  return prisma.absenceDay.update({
    where: { id },
    data,
    include: absenceDayListInclude,
  })
}
```
**New** (single atomic updateMany):
```ts
export async function updateIfStatus(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  expectedStatus: string,
  data: Record<string, unknown>
) {
  const { count } = await prisma.absenceDay.updateMany({
    where: { id, tenantId, status: expectedStatus },
    data,
  })
  if (count === 0) return null
  return prisma.absenceDay.findFirst({
    where: { id, tenantId },
    include: absenceDayListInclude,
  })
}
```

---

### Phase 1 Verification

1. **Typecheck**: `pnpm typecheck` — must not introduce new errors beyond baseline (~1463)
2. **Tests**: `pnpm test` — all existing tests must pass
3. **Spot-check**: For each modified repository, verify the corresponding service's update function still works by tracing the call path from router -> service -> repository
4. **Return type compatibility**: The `tenantScopedUpdate` helper returns `Promise<T>` (non-null). Functions that previously could return `null` from `update()` (e.g., `updateIfStatus`) use inline code instead of the helper.

### Rollback
- Revert each file to its previous `prisma.Model.update({ where: { id } })` call
- Remove the `import { tenantScopedUpdate }` line from each file

---

## Phase 2: Fix Additional Tenant Scope Gaps

### Fix A: `findUserGroupById` missing tenant scope

**File**: `src/lib/services/users-repository.ts` (lines 69-76)

**Current**:
```ts
export async function findUserGroupById(
  prisma: PrismaClient,
  id: string
) {
  return prisma.userGroup.findUnique({
    where: { id },
  })
}
```
**New** (add tenantId parameter, scope with OR to allow system groups):
```ts
export async function findUserGroupById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.userGroup.findFirst({
    where: {
      id,
      OR: [{ tenantId }, { tenantId: null }],
    },
  })
}
```
**Note**: Changed from `findUnique` to `findFirst` because the where clause is no longer just `{ id }`. The OR allows both tenant-owned and system-wide groups.

**Caller updates** in `src/lib/services/users-service.ts`:
- Line 85: `await repo.findUserGroupById(prisma, input.userGroupId)` → `await repo.findUserGroupById(prisma, tenantId, input.userGroupId)`
- Line 205: `await repo.findUserGroupById(prisma, input.userGroupId)` → `await repo.findUserGroupById(prisma, tenantId, input.userGroupId)`

Verify that `tenantId` is available in both calling functions (it should be — both `createUser` and `updateUser` receive `tenantId` as a parameter).

---

### Fix B: `billing-document-repository.ts` position queries without tenantId

**File**: `src/lib/services/billing-document-repository.ts`

**Context**: `BillingDocumentPosition` has no direct `tenantId` column. Scoping must go through the parent `document` relation: `{ document: { tenantId } }`.

The service layer already validates `pos.document.tenantId !== tenantId` before calling these functions, but defense-in-depth requires repository-level scoping.

#### B1. `findPositions` (lines 164-172) — add tenantId parameter

**Current**:
```ts
export async function findPositions(
  prisma: PrismaClient,
  documentId: string
) {
  return prisma.billingDocumentPosition.findMany({
    where: { documentId },
    orderBy: { sortOrder: "asc" },
  })
}
```
**New**:
```ts
export async function findPositions(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
) {
  return prisma.billingDocumentPosition.findMany({
    where: { documentId, document: { tenantId } },
    orderBy: { sortOrder: "asc" },
  })
}
```

**Callers to update** (in `billing-document-service.ts`):
- Line 74: `repo.findPositions(prisma, documentId)` → `repo.findPositions(prisma, tenantId, documentId)`
- Line 975: `repo.findPositions(prisma, documentId)` → `repo.findPositions(prisma, tenantId, documentId)`
- Line 990: `repo.findPositions(prisma, documentId)` → `repo.findPositions(prisma, tenantId, documentId)`

#### B2. `updatePosition` (lines 242-252) — add tenantId, scope through relation

**Current**:
```ts
export async function updatePosition(
  prisma: PrismaClient,
  id: string,
  data: Record<string, unknown>
) {
  await prisma.billingDocumentPosition.updateMany({
    where: { id },
    data,
  })
  return prisma.billingDocumentPosition.findFirst({ where: { id } })
}
```
**New**:
```ts
export async function updatePosition(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  const { count } = await prisma.billingDocumentPosition.updateMany({
    where: { id, document: { tenantId } },
    data,
  })
  if (count === 0) return null
  return prisma.billingDocumentPosition.findFirst({
    where: { id, document: { tenantId } },
  })
}
```

**Caller update** in `billing-document-service.ts` (line 879):
- `repo.updatePosition(prisma, input.id, data)` → `repo.updatePosition(prisma, tenantId, input.id, data)`

#### B3. `deletePosition` (lines 254-262) — add tenantId, scope through relation

**Current**:
```ts
export async function deletePosition(
  prisma: PrismaClient,
  id: string
): Promise<boolean> {
  const { count } = await prisma.billingDocumentPosition.deleteMany({
    where: { id },
  })
  return count > 0
}
```
**New**:
```ts
export async function deletePosition(
  prisma: PrismaClient,
  tenantId: string,
  id: string
): Promise<boolean> {
  const { count } = await prisma.billingDocumentPosition.deleteMany({
    where: { id, document: { tenantId } },
  })
  return count > 0
}
```

**Caller update** in `billing-document-service.ts` (line 920):
- `repo.deletePosition(prisma, id)` → `repo.deletePosition(prisma, tenantId, id)`

#### B4. `getMaxSortOrder` (lines 264-274) — add tenantId, scope through relation

**Current**:
```ts
export async function getMaxSortOrder(
  prisma: PrismaClient,
  documentId: string
): Promise<number> {
  const result = await prisma.billingDocumentPosition.findFirst({
    where: { documentId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  })
  return result?.sortOrder ?? 0
}
```
**New**:
```ts
export async function getMaxSortOrder(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
): Promise<number> {
  const result = await prisma.billingDocumentPosition.findFirst({
    where: { documentId, document: { tenantId } },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  })
  return result?.sortOrder ?? 0
}
```

**Caller update** in `billing-document-service.ts` (line 791):
- `repo.getMaxSortOrder(prisma, input.documentId)` → `repo.getMaxSortOrder(prisma, tenantId, input.documentId)`

---

### Fix C: `daily-calc.context.ts` raw SQL missing `tenant_id`

**File**: `src/lib/services/daily-calc.context.ts` (lines 141-155)

**Current SQL**:
```sql
WHERE ad.employee_id = ${employeeId}::uuid
  AND ad.absence_date >= ${fromDate}::date
  AND ad.absence_date <= ${toDate}::date
```
**New SQL** (add tenant_id filter):
```sql
WHERE ad.employee_id = ${employeeId}::uuid
  AND ad.tenant_id = ${tenantId}::uuid
  AND ad.absence_date >= ${fromDate}::date
  AND ad.absence_date <= ${toDate}::date
```

**Note**: `tenantId` is already available as a parameter of `loadEmployeeCalcContext()` (line 108). The other queries in the same `Promise.all` block (bookings at line 160) already include `tenantId`.

---

### Fix D: `crm-address-repository.ts` count queries without tenantId

**File**: `src/lib/services/crm-address-repository.ts`

#### D1. `countContacts` (lines 266-271)

**Current**:
```ts
export async function countContacts(
  prisma: PrismaClient,
  addressId: string
) {
  return prisma.crmContact.count({ where: { addressId } })
}
```
**New**:
```ts
export async function countContacts(
  prisma: PrismaClient,
  tenantId: string,
  addressId: string
) {
  return prisma.crmContact.count({ where: { tenantId, addressId } })
}
```

**Callers**: No current callers found in codebase. Function is defined but unused. Adding `tenantId` parameter is safe.

#### D2. `countBankAccounts` (lines 273-278)

**Current**:
```ts
export async function countBankAccounts(
  prisma: PrismaClient,
  addressId: string
) {
  return prisma.crmBankAccount.count({ where: { addressId } })
}
```
**New**:
```ts
export async function countBankAccounts(
  prisma: PrismaClient,
  tenantId: string,
  addressId: string
) {
  return prisma.crmBankAccount.count({ where: { tenantId, addressId } })
}
```

**Callers**: No current callers found. Safe to change.

---

### Phase 2 Verification

1. **Typecheck**: `pnpm typecheck`
2. **Tests**: `pnpm test`
3. **For billing-document changes**: Search for all callers of `findPositions`, `updatePosition`, `deletePosition`, `getMaxSortOrder` across the codebase and update each one
4. **For findUserGroupById**: Verify `tenantId` is available in both calling functions in `users-service.ts`

### Rollback
- Revert each individual file change

---

## Phase 3: Verification

### 3.1 Automated Verification

```bash
# Full type check (baseline ~1463 errors — must not increase)
pnpm typecheck

# Run all unit/integration tests
pnpm test

# Run E2E browser tests (covers booking, absence, correction flows)
pnpm exec playwright test
```

### 3.2 Manual Verification Checklist

For each fixed repository function, verify by tracing the call chain:

| # | Repository Function | Service Caller | Router | Verified? |
|---|---|---|---|---|
| 1 | employees-repository.update | employees-service.updateEmployee | employees.update | |
| 2 | bookings-repository.update | bookings-service.updateBooking | bookings.update | |
| 3 | correction-repository.update | correction-service.updateCorrection | corrections.update | |
| 4 | correction-repository.updateIfStatus | correction-service (approve/reject) | corrections.approve | |
| 5 | absences-repository.update | absences-service.updateAbsence | absences.update | |
| 6 | absences-repository.updateIfStatus | absences-service (approve/reject) | absences.approve | |
| 7 | payroll-export-repository.update | payroll-export-service | payroll-exports.update | |
| 8 | reports-repository.updateStatus | reports-service | reports.updateStatus | |
| 9 | system-settings-repository.update | system-settings-service | system-settings.update | |
| 10 | crm-address-repository.update | crm-address-service | crm-addresses.update | |
| 11 | crm-address-repository.softDelete | crm-address-service | crm-addresses.softDelete | |
| 12 | crm-address-repository.restore | crm-address-service | crm-addresses.restore | |
| 13 | crm-address-repository.updateContact | crm-address-service | crm-addresses.updateContact | |
| 14 | crm-address-repository.updateBankAccount | crm-address-service | crm-addresses.updateBankAccount | |
| 15 | user-group-repository.update | user-group-service | user-groups.update | |
| 16 | notification-repository.markRead | notification-service | notifications.markRead | |
| 17 | vacation-balances-repository.updateBalance | vacation-balances-service | vacation-balances.update | |
| 18 | terminal-booking-repository.updateImportBatch | terminal-booking-service | terminal-bookings.* | |
| 19 | absence-type-repository.update | absence-type-service | absence-types.update | |
| 20 | access-profile-repository.update | access-profile-service | access-profiles.update | |
| 21 | access-zone-repository.update | access-zone-service | access-zones.update | |
| 22 | account-group-repository.update | account-group-service | account-groups.update | |
| 23 | cost-center-repository.update | cost-center-service | cost-centers.update | |
| 24 | order-repository.update | order-service | orders.update | |
| 25 | shift-repository.update | shift-service | shifts.update | |
| 26 | schedules-repository.updateSchedule | schedules-service | schedules.update | |
| 27 | schedules-repository.updateExecution | schedules-service | schedules.updateExecution | |
| 28 | users-repository.update | users-service.updateUser | users.update | |

### 3.3 Edge Cases to Test

1. **Cross-tenant update attempt**: Call update with a valid ID from tenant A using tenant B's context. Should return NOT_FOUND (not update the record).
2. **Nullable tenantId models**: Attempt to update a system UserGroup (tenantId=null) or system AbsenceType. Should return NOT_FOUND.
3. **updateIfStatus race**: Call absences.approve on an already-approved absence. Should return null (no update).
4. **VacationBalance signature change**: Ensure the service still correctly passes tenantId to the updated repository function.
5. **BillingDocumentPosition relation scoping**: Attempt to update a position whose parent document belongs to a different tenant. Should fail at repository level.
6. **User update with relation-based scope**: Update a user that has no `user_tenants` entry for the current tenant. Should return NOT_FOUND.

### 3.4 Rollback Strategy

All changes are backward-compatible in behavior for legitimate same-tenant operations. The only behavioral change is that cross-tenant operations now fail with NOT_FOUND instead of succeeding.

If a regression is found:
1. Identify which specific repository change caused it
2. Revert that single file's update function to the original `prisma.Model.update({ where: { id } })` pattern
3. File a follow-up ticket for that specific case

---

## Implementation Order

1. **Phase 0**: Create `src/lib/services/prisma-helpers.ts` — 1 new file
2. **Phase 1 Batch A**: Fix 16 simple updates — 14 files (2 files have multiple fixes)
3. **Phase 1 Batch B**: Fix 4 updates with includes — 4 files
4. **Phase 1 Batch C**: Fix 3 soft-delete/restore/markRead — 2 files (overlap with Batch A)
5. **Phase 1 Batch D**: Fix 3 nullable-tenantId models — 3 files (overlap with Batch A)
6. **Phase 1 Batch E**: Fix 2 TOCTOU issues — 2 files (overlap with Batch B)
7. **Phase 2 Fix A**: findUserGroupById — 2 files
8. **Phase 2 Fix B**: billing position queries — 2 files
9. **Phase 2 Fix C**: raw SQL tenant_id — 1 file
10. **Phase 2 Fix D**: count queries — 1 file (overlap with Batch A)
11. **Phase 3**: Run typecheck + tests + verification

**Unique files modified**: 22 (21 repository files + 1 context file + 1 new helper + 2 service files for caller updates)

**Commit strategy**: Single commit with descriptive message covering all changes. All changes are security fixes for the same class of vulnerability.
