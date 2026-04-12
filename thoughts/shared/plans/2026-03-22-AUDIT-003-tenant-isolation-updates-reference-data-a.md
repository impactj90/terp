# Implementation Plan: AUDIT-003 — Tenant Isolation: Update without tenantId in Reference Data Repositories

**Date:** 2026-03-22
**Ticket:** AUDIT-003
**Priority:** P0 / CRITICAL
**Scope:** 10 repository files, 1 line change + 1 import addition each

---

## 1. Summary

Ten reference data repository files accept `tenantId` as a parameter in their `update()` method but never include it in the Prisma `where` clause. They all use `prisma.<model>.update({ where: { id }, data })`, which allows any authenticated tenant to modify any other tenant's record by guessing or knowing the UUID. This is a cross-tenant write vulnerability.

The fix is mechanical: replace each bare `prisma.<model>.update({ where: { id }, data })` call with the existing `tenantScopedUpdate` helper from `src/lib/services/prisma-helpers.ts`, which is already used by 20 other repositories in the codebase.

---

## 2. Pattern

### Existing helper: `tenantScopedUpdate`

**Location:** `src/lib/services/prisma-helpers.ts`

The helper does three things:
1. Calls `delegate.updateMany({ where: { id, tenantId }, data })` -- tenant-scoped
2. If `count === 0`, throws `TenantScopedNotFoundError` (mapped to tRPC `NOT_FOUND` by `handleServiceError`)
3. Refetches the updated record via `delegate.findFirst({ where: { id, tenantId } })` and returns it

### Transformation (before / after)

**Before (buggy):**
```ts
import type { PrismaClient } from "@/generated/prisma/client"

// ...

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.<model>.update({ where: { id }, data })
}
```

**After (fixed):**
```ts
import type { PrismaClient } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

// ...

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.<model>, { id, tenantId }, data, { entity: "<ModelName>" })
}
```

### Import placement

Add the import on the line immediately after the existing `import type { PrismaClient }` line, matching the pattern used in `access-profile-repository.ts`, `cost-center-repository.ts`, and other correctly-implemented files.

---

## 3. File-by-File Changes

### 3.1 `src/lib/services/absence-type-group-repository.ts`

**Add import** after line 6:
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

**Change line 67** in `update()`:
```ts
// Before:
return prisma.absenceTypeGroup.update({ where: { id }, data })

// After:
return tenantScopedUpdate(prisma.absenceTypeGroup, { id, tenantId }, data, { entity: "AbsenceTypeGroup" })
```

---

### 3.2 `src/lib/services/account-repository.ts`

**Add import** after line 6:
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

**Change line 99** in `update()`:
```ts
// Before:
return prisma.account.update({ where: { id }, data })

// After:
return tenantScopedUpdate(prisma.account, { id, tenantId }, data, { entity: "Account" })
```

**Note:** Account has optional `tenantId` (nullable for system records). The `tenantScopedUpdate` helper correctly handles this -- passing the tenant's actual tenantId will only match tenant-owned records, not system records (where tenantId is null). This is the desired behavior: system records should not be editable through normal tenant update APIs.

---

### 3.3 `src/lib/services/activity-repository.ts`

**Add import** after line 6:
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

**Change line 67** in `update()`:
```ts
// Before:
return prisma.activity.update({ where: { id }, data })

// After:
return tenantScopedUpdate(prisma.activity, { id, tenantId }, data, { entity: "Activity" })
```

---

### 3.4 `src/lib/services/booking-reason-repository.ts`

**Add import** after line 6:
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

**Change line 69** in `update()`:
```ts
// Before:
return prisma.bookingReason.update({ where: { id }, data })

// After:
return tenantScopedUpdate(prisma.bookingReason, { id, tenantId }, data, { entity: "BookingReason" })
```

---

### 3.5 `src/lib/services/booking-type-group-repository.ts`

**Add import** after line 6:
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

**Change line 128** in `update()`:
```ts
// Before:
return prisma.bookingTypeGroup.update({ where: { id }, data })

// After:
return tenantScopedUpdate(prisma.bookingTypeGroup, { id, tenantId }, data, { entity: "BookingTypeGroup" })
```

---

### 3.6 `src/lib/services/booking-type-repository.ts`

**Add import** after line 7:
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

**Change line 78** in `update()`:
```ts
// Before:
return prisma.bookingType.update({ where: { id }, data })

// After:
return tenantScopedUpdate(prisma.bookingType, { id, tenantId }, data, { entity: "BookingType" })
```

**Note:** BookingType has optional `tenantId` (nullable for system types). Same consideration as Account -- the helper will only match tenant-owned records, preventing edits to system types.

---

### 3.7 `src/lib/services/calculation-rule-repository.ts`

**Add import** after line 7 (after the `Prisma` type import):
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

**Change line 68** in `update()`:
```ts
// Before:
return prisma.calculationRule.update({ where: { id }, data })

// After:
return tenantScopedUpdate(prisma.calculationRule, { id, tenantId }, data, { entity: "CalculationRule" })
```

---

### 3.8 `src/lib/services/contact-kind-repository.ts`

**Add import** after line 6:
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

**Change line 72** in `update()`:
```ts
// Before:
return prisma.contactKind.update({ where: { id }, data })

// After:
return tenantScopedUpdate(prisma.contactKind, { id, tenantId }, data, { entity: "ContactKind" })
```

---

### 3.9 `src/lib/services/contact-type-repository.ts`

**Add import** after line 6:
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

**Change line 69** in `update()`:
```ts
// Before:
return prisma.contactType.update({ where: { id }, data })

// After:
return tenantScopedUpdate(prisma.contactType, { id, tenantId }, data, { entity: "ContactType" })
```

---

### 3.10 `src/lib/services/department-repository.ts`

**Add import** after line 6:
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

**Change line 94** in `update()`:
```ts
// Before:
return prisma.department.update({ where: { id }, data })

// After:
return tenantScopedUpdate(prisma.department, { id, tenantId }, data, { entity: "Department" })
```

---

## 4. Delete Methods

All 10 files already implement `deleteById()` correctly using `deleteMany({ where: { id, tenantId } })`. No changes needed for delete methods.

---

## 5. Out-of-Scope Issues Noted

### `booking-type-group-repository.ts` — `findByIdWithMembers` (line 112-120)

This read method does not include `tenantId` in the where clause:
```ts
export async function findByIdWithMembers(prisma: PrismaClient, id: string) {
  return prisma.bookingTypeGroup.findUnique({ where: { id }, include: groupInclude })
}
```

This is a read-isolation issue, not a write-isolation issue. It is outside the scope of AUDIT-003 and should be tracked separately (potentially AUDIT-013 or a new ticket).

---

## 6. Behavioral Change

The current buggy code uses `prisma.<model>.update()` which:
- Returns the updated record directly
- Throws Prisma `P2025` error if the record does not exist (regardless of tenant)

The fixed code using `tenantScopedUpdate` will:
- Return the refetched record after update (same shape, no include/select needed for these simple models)
- Throw `TenantScopedNotFoundError` if the record does not exist OR belongs to a different tenant
- `TenantScopedNotFoundError` is mapped to tRPC `NOT_FOUND` by `handleServiceError` (the error name ends with `NotFoundError`, matching the regex on line 17 of `src/trpc/errors.ts`)

This is the correct behavior: a tenant should receive "not found" rather than being able to update another tenant's data.

---

## 7. Verification Steps

### Automated

```bash
# Type checking -- should pass with no new errors
pnpm typecheck

# Linting -- should pass with no new errors
pnpm lint

# Unit/integration tests -- all existing tests should pass
pnpm test
```

### Manual

- [ ] Attempt to update a department using a cross-tenant ID -- should get NotFoundError (tRPC NOT_FOUND)
- [ ] Verify department updates still work correctly for the owning tenant
- [ ] Verify booking type updates still function in the booking workflow
- [ ] Verify account updates work for tenant-owned accounts
- [ ] Verify system records (Account/BookingType with tenantId=null) cannot be updated via tenant APIs

---

## 8. What NOT to Change

- **Service layer callers** -- do not modify any `*-service.ts` files. The function signatures are unchanged.
- **Read methods** (`findMany`, `findById`, `findByCode`, etc.) -- these are out of scope for AUDIT-003.
- **Count methods** (`countEmployees`, `countBookingsByType`, etc.) -- separate ticket (AUDIT-013).
- **Delete methods** -- already correctly tenant-scoped in all 10 files.
- **The `tenantScopedUpdate` helper itself** -- no modifications needed; use as-is.
- **Other repository files** -- only the 10 listed files are in scope.

---

## 9. Implementation Order

All 10 changes are independent and can be made in any order. Recommended order by functional grouping:

1. **CRM/HR domain:** department, contact-type, contact-kind
2. **Time tracking domain:** booking-type, booking-type-group, booking-reason, activity
3. **Finance domain:** account, calculation-rule
4. **Absence domain:** absence-type-group

All 10 changes should be in a single commit since they fix the same vulnerability pattern.

---

## 10. Checklist Summary

| # | File | Method | Import Needed | Entity Name |
|---|------|--------|--------------|-------------|
| 1 | `src/lib/services/absence-type-group-repository.ts` | `update` (line 67) | Yes | `"AbsenceTypeGroup"` |
| 2 | `src/lib/services/account-repository.ts` | `update` (line 99) | Yes | `"Account"` |
| 3 | `src/lib/services/activity-repository.ts` | `update` (line 67) | Yes | `"Activity"` |
| 4 | `src/lib/services/booking-reason-repository.ts` | `update` (line 69) | Yes | `"BookingReason"` |
| 5 | `src/lib/services/booking-type-group-repository.ts` | `update` (line 128) | Yes | `"BookingTypeGroup"` |
| 6 | `src/lib/services/booking-type-repository.ts` | `update` (line 78) | Yes | `"BookingType"` |
| 7 | `src/lib/services/calculation-rule-repository.ts` | `update` (line 68) | Yes | `"CalculationRule"` |
| 8 | `src/lib/services/contact-kind-repository.ts` | `update` (line 72) | Yes | `"ContactKind"` |
| 9 | `src/lib/services/contact-type-repository.ts` | `update` (line 69) | Yes | `"ContactType"` |
| 10 | `src/lib/services/department-repository.ts` | `update` (line 94) | Yes | `"Department"` |
