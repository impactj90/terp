# Implementation Plan: AUDIT-004 — Tenant Isolation: Update without tenantId — Reference Data B

**Date:** 2026-03-22
**Ticket:** AUDIT-004
**Priority:** P0 (CRITICAL)
**Status:** Ready for implementation

---

## Summary

Ten repository files use `prisma.model.update({ where: { id } })` without including `tenantId` in the where clause. This allows cross-tenant modification of reference data (employment types, travel rules, holidays, locations, vacation rules, vehicles, vehicle routes, and tenant settings). The fix applies the existing `tenantScopedUpdate` helper from `prisma-helpers.ts` to 9 of the 10 files, and adds a guard assertion for the special-case `tenant-repository.ts` (where the model's `id` IS the tenant identifier).

**Constraint:** Only the `update()` method body in each repository file is modified. No service layer changes. No read/count method changes. No refactoring beyond the update function.

---

## Fix Pattern

### Pattern A: Standard repositories (9 files)

Replace the single-line `prisma.model.update({ where: { id }, data })` with the `tenantScopedUpdate` helper:

```ts
// BEFORE (vulnerable):
import type { PrismaClient } from "@/generated/prisma/client"

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.modelName.update({ where: { id }, data })
}

// AFTER (fixed):
import type { PrismaClient } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.modelName, { id, tenantId }, data, { entity: "ModelName" })
}
```

**What `tenantScopedUpdate` does internally:**
1. `updateMany({ where: { id, tenantId }, data })` -- enforces tenant isolation at DB level
2. Checks `count === 0` and throws `TenantScopedNotFoundError` (maps to tRPC `NOT_FOUND`)
3. Refetches with `findFirst({ where: { id, tenantId } })` and returns the full record
4. Returns `Promise<any>` -- compatible with all current callers

### Pattern B: tenant-repository.ts (1 file)

The `Tenant` model has no `tenantId` column. The model's `id` IS the tenant. Add a guard that `id === tenantId`, then keep the existing update:

```ts
// BEFORE:
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  // For tenant updates, tenantId === id (the tenant being updated)
  return prisma.tenant.update({ where: { id }, data })
}

// AFTER:
import { TenantScopedNotFoundError } from "@/lib/services/prisma-helpers"

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  if (id !== tenantId) {
    throw new TenantScopedNotFoundError("Tenant")
  }
  return prisma.tenant.update({ where: { id }, data })
}
```

**Rationale:** Both callers in `tenant-service.ts` already pass `id === tenantId` (line 243: `repo.update(prisma, input.id, input.id, data)`, line 253: `repo.update(prisma, id, id, ...)`). This guard is a safety assertion that prevents any future caller from bypassing tenant scope.

---

## Phase 1: Fix 9 Standard Repository Files

Each file requires two changes:
1. **Add import:** `import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"` (after the existing PrismaClient import)
2. **Replace update body:** Change `return prisma.X.update({ where: { id }, data })` to `return tenantScopedUpdate(prisma.X, { id, tenantId }, data, { entity: "X" })`

### 1.1 `src/lib/services/employment-type-repository.ts`

**Add import** (after line 6):
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

**Replace line 68:**
```ts
// OLD:
  return prisma.employmentType.update({ where: { id }, data })
// NEW:
  return tenantScopedUpdate(prisma.employmentType, { id, tenantId }, data, { entity: "EmploymentType" })
```

**Note:** `EmploymentType.tenantId` is `String?` (nullable). This is correct -- `tenantScopedUpdate` with `{ id, tenantId }` will match only records where tenantId equals the provided value, and will NOT match system defaults (tenantId = null). This is the desired behavior.

### 1.2 `src/lib/services/extended-travel-rule-repository.ts`

**Add import** (after line 6):
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

**Replace line 72:**
```ts
// OLD:
  return prisma.extendedTravelRule.update({ where: { id }, data })
// NEW:
  return tenantScopedUpdate(prisma.extendedTravelRule, { id, tenantId }, data, { entity: "ExtendedTravelRule" })
```

### 1.3 `src/lib/services/holiday-repository.ts`

**Add import** (after line 6):
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

**Replace line 103:**
```ts
// OLD:
  return prisma.holiday.update({ where: { id }, data })
// NEW:
  return tenantScopedUpdate(prisma.holiday, { id, tenantId }, data, { entity: "Holiday" })
```

### 1.4 `src/lib/services/local-travel-rule-repository.ts`

**Add import** (after line 6):
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

**Replace line 69:**
```ts
// OLD:
  return prisma.localTravelRule.update({ where: { id }, data })
// NEW:
  return tenantScopedUpdate(prisma.localTravelRule, { id, tenantId }, data, { entity: "LocalTravelRule" })
```

### 1.5 `src/lib/services/location-repository.ts`

**Add import** (after line 6):
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

**Replace line 71:**
```ts
// OLD:
  return prisma.location.update({ where: { id }, data })
// NEW:
  return tenantScopedUpdate(prisma.location, { id, tenantId }, data, { entity: "Location" })
```

### 1.6 `src/lib/services/vacation-capping-rule-repository.ts`

**Add import** (after line 7):
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

**Replace line 73:**
```ts
// OLD:
  return prisma.vacationCappingRule.update({ where: { id }, data })
// NEW:
  return tenantScopedUpdate(prisma.vacationCappingRule, { id, tenantId }, data, { entity: "VacationCappingRule" })
```

### 1.7 `src/lib/services/vacation-special-calc-repository.ts`

**Add import** (after line 7):
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

**Replace line 71:**
```ts
// OLD:
  return prisma.vacationSpecialCalculation.update({ where: { id }, data })
// NEW:
  return tenantScopedUpdate(prisma.vacationSpecialCalculation, { id, tenantId }, data, { entity: "VacationSpecialCalculation" })
```

### 1.8 `src/lib/services/vehicle-repository.ts`

**Add import** (after line 6):
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

**Replace line 56:**
```ts
// OLD:
  return prisma.vehicle.update({ where: { id }, data })
// NEW:
  return tenantScopedUpdate(prisma.vehicle, { id, tenantId }, data, { entity: "Vehicle" })
```

### 1.9 `src/lib/services/vehicle-route-repository.ts`

**Add import** (after line 6):
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

**Replace line 56:**
```ts
// OLD:
  return prisma.vehicleRoute.update({ where: { id }, data })
// NEW:
  return tenantScopedUpdate(prisma.vehicleRoute, { id, tenantId }, data, { entity: "VehicleRoute" })
```

---

## Phase 2: Handle `tenant-repository.ts` Special Case

### `src/lib/services/tenant-repository.ts`

**Add import** (after line 6):
```ts
import { TenantScopedNotFoundError } from "@/lib/services/prisma-helpers"
```

**Replace lines 51-58 (the entire update function body):**
```ts
// OLD:
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  // For tenant updates, tenantId === id (the tenant being updated)
  return prisma.tenant.update({ where: { id }, data })
}

// NEW:
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  // For tenant updates, tenantId === id (the tenant being updated)
  if (id !== tenantId) {
    throw new TenantScopedNotFoundError("Tenant")
  }
  return prisma.tenant.update({ where: { id }, data })
}
```

**Why this is sufficient:**
- The `Tenant` model has no `tenantId` field -- `id` IS the tenant identifier
- Both callers in `tenant-service.ts` already pass `id === tenantId` (confirmed in code review)
- The guard assertion prevents any future misuse where someone might call `repo.update(prisma, tenantA, tenantB, data)` to modify tenant B from tenant A's context
- The existing `prisma.tenant.update({ where: { id } })` is safe AFTER the guard passes, because at that point `id === tenantId` is guaranteed

---

## Phase 3: Verification

### 3.1 Automated Checks

Run in this order:

```bash
# 1. TypeScript type check -- ensure no type errors from the change
pnpm typecheck

# 2. Lint -- ensure no lint issues with the new imports
pnpm lint

# 3. Run all tests
pnpm test
```

### 3.2 Code Review Checklist

- [ ] All 9 standard files import `tenantScopedUpdate` from `@/lib/services/prisma-helpers`
- [ ] All 9 standard files use `tenantScopedUpdate(prisma.X, { id, tenantId }, data, { entity: "X" })`
- [ ] `tenant-repository.ts` imports `TenantScopedNotFoundError` from `@/lib/services/prisma-helpers`
- [ ] `tenant-repository.ts` has the `id !== tenantId` guard before the update
- [ ] No service layer files were modified
- [ ] No read or count methods were modified
- [ ] No `include` or `select` options are needed (none of the 10 update methods used them before)

### 3.3 Grep Verification

After implementation, verify no vulnerable `update({ where: { id } })` calls remain in these 10 files:

```bash
# Should return 0 matches in the affected files:
grep -n "\.update({ where: { id }" \
  src/lib/services/employment-type-repository.ts \
  src/lib/services/extended-travel-rule-repository.ts \
  src/lib/services/holiday-repository.ts \
  src/lib/services/local-travel-rule-repository.ts \
  src/lib/services/location-repository.ts \
  src/lib/services/vacation-capping-rule-repository.ts \
  src/lib/services/vacation-special-calc-repository.ts \
  src/lib/services/vehicle-repository.ts \
  src/lib/services/vehicle-route-repository.ts

# tenant-repository.ts should still have the update but with the guard:
grep -n -A3 "id !== tenantId" src/lib/services/tenant-repository.ts
```

---

## Success Criteria

1. All 10 `update()` methods enforce tenant isolation at the database query level
2. Cross-tenant update attempts result in `TenantScopedNotFoundError` (maps to tRPC `NOT_FOUND`)
3. Same-tenant updates continue to work identically (return the updated record)
4. `pnpm typecheck` passes (no new type errors)
5. `pnpm lint` passes (no lint errors)
6. `pnpm test` passes (all existing tests pass)
7. No service layer callers were modified
8. No read or count methods were modified

---

## Files Modified (complete list)

| # | File | Change Type |
|---|------|-------------|
| 1 | `src/lib/services/employment-type-repository.ts` | Add import + replace update body |
| 2 | `src/lib/services/extended-travel-rule-repository.ts` | Add import + replace update body |
| 3 | `src/lib/services/holiday-repository.ts` | Add import + replace update body |
| 4 | `src/lib/services/local-travel-rule-repository.ts` | Add import + replace update body |
| 5 | `src/lib/services/location-repository.ts` | Add import + replace update body |
| 6 | `src/lib/services/tenant-repository.ts` | Add import + add guard assertion |
| 7 | `src/lib/services/vacation-capping-rule-repository.ts` | Add import + replace update body |
| 8 | `src/lib/services/vacation-special-calc-repository.ts` | Add import + replace update body |
| 9 | `src/lib/services/vehicle-repository.ts` | Add import + replace update body |
| 10 | `src/lib/services/vehicle-route-repository.ts` | Add import + replace update body |

No other files are created or modified.
