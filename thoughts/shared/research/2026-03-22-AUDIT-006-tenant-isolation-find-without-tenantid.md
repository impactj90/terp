# AUDIT-006 Research: Tenant Isolation — findUnique/findFirst without tenantId

**Date**: 2026-03-22
**Audit Ticket**: AUDIT-006
**Priority**: P1 / HIGH
**Scope**: 4 repository files, 5 caller sites

---

## Summary

Four repository methods perform `findUnique` or `findFirst` using only `{ id }` in the where clause, without constraining by `tenantId`. This allows the database layer to return records belonging to any tenant. Some callers perform a post-hoc tenant check, but the repository itself is unsafe and any caller that omits the check creates a cross-tenant data leak.

---

## File 1: `employee-contacts-repository.ts` — `findContactWithEmployee()`

### Current Code (lines 56-68)

```ts
export async function findContactWithEmployee(
  prisma: PrismaClient,
  contactId: string
) {
  return prisma.employeeContact.findUnique({
    where: { id: contactId },
    include: {
      employee: {
        select: { tenantId: true },
      },
    },
  })
}
```

### Prisma Schema — `EmployeeContact`

- **No `tenantId` column** on `EmployeeContact` directly
- Tenant is accessible only via relation: `EmployeeContact -> Employee -> tenantId`
- The `Employee` model has `tenantId` directly

### Callers

#### 1. `employee-contacts-service.ts` — `deleteContact()` (line 151)

```ts
const contact = await repo.findContactWithEmployee(prisma, contactId)
if (!contact) {
  throw new ContactNotFoundError()
}
if (contact.employee.tenantId !== tenantId) {
  throw new ContactNotFoundError()
}
```

- **Has `tenantId`?** Yes, `tenantId` is a parameter of `deleteContact()`.
- **Post-hoc check?** Yes, lines 156-158 check `contact.employee.tenantId !== tenantId`.
- **Risk level**: LOW (post-hoc check exists), but the repository still fetches cross-tenant data before the check.

### Fix Required

Since `EmployeeContact` has no `tenantId` column, the fix must use a **relation filter**:

**Repository change** — Add `tenantId` parameter, switch to `findFirst` with relation filter:
```ts
export async function findContactWithEmployee(
  prisma: PrismaClient,
  tenantId: string,
  contactId: string
) {
  return prisma.employeeContact.findFirst({
    where: { id: contactId, employee: { tenantId } },
    include: {
      employee: {
        select: { tenantId: true },
      },
    },
  })
}
```

**Caller change** — `employee-contacts-service.ts:151`:
```ts
const contact = await repo.findContactWithEmployee(prisma, tenantId, contactId)
```
The post-hoc check (lines 156-158) becomes redundant but can be kept as defense-in-depth.

**Type change**: `findUnique` -> `findFirst`. Return type stays `T | null` — no downstream impact.

**Include still needed?** The `employee: { select: { tenantId: true } }` include is no longer needed for the tenant check, but keeping it is harmless and provides defense-in-depth for the caller's existing check.

### Test File

- `src/trpc/routers/__tests__/employee-contacts-router.test.ts` — exists, should be run after fix

---

## File 2: `day-plans-repository.ts` — `findByIdWithDetail()`

### Current Code (lines 97-102)

```ts
export async function findByIdWithDetail(prisma: PrismaClient, id: string) {
  return prisma.dayPlan.findUnique({
    where: { id },
    include: dayPlanDetailInclude,
  })
}
```

Where `dayPlanDetailInclude` is:
```ts
const dayPlanDetailInclude = {
  breaks: { orderBy: { sortOrder: "asc" as const } },
  bonuses: { orderBy: { sortOrder: "asc" as const } },
} as const
```

### Prisma Schema — `DayPlan`

- **Has `tenantId` directly** on the model
- Unique constraint: `@@unique([tenantId, code])` — but no unique constraint on `[tenantId, id]` (id is the PK)
- Therefore `findFirst` with `{ id, tenantId }` is the correct approach

### Callers

All callers are in `day-plans-service.ts`:

#### 1. `create()` (line 318)

```ts
return repo.findByIdWithDetail(prisma, created.id)
```

- **Has `tenantId`?** Yes, `tenantId` is a parameter of `create()`.
- **Post-hoc check?** No — but the `created.id` was just created within this tenant, so the risk is theoretical (the just-created record belongs to this tenant).
- **Risk**: LOW (freshly created), but should still be fixed for consistency.

#### 2. `update()` (line 557)

```ts
return repo.findByIdWithDetail(prisma, input.id)
```

- **Has `tenantId`?** Yes, `tenantId` is a parameter of `update()`.
- **Post-hoc check?** No, but `repo.findByIdBasic(prisma, tenantId, input.id)` was called at line 376 to verify existence — so `input.id` is known to belong to this tenant at this point.
- **Risk**: LOW (pre-verified), but should still be fixed for consistency.

#### 3. `copy()` (line 717)

```ts
return repo.findByIdWithDetail(prisma, copiedPlan.id)
```

- **Has `tenantId`?** Yes, `tenantId` is a parameter of `copy()`.
- **Post-hoc check?** No, but `copiedPlan` was just created with `tenantId`.
- **Risk**: LOW (freshly created), but should still be fixed for consistency.

### Fix Required

**Repository change** — Add `tenantId` parameter, switch to `findFirst`:
```ts
export async function findByIdWithDetail(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.dayPlan.findFirst({
    where: { id, tenantId },
    include: dayPlanDetailInclude,
  })
}
```

**Caller changes** (3 sites in `day-plans-service.ts`):
- Line 318: `return repo.findByIdWithDetail(prisma, tenantId, created.id)`
- Line 557: `return repo.findByIdWithDetail(prisma, tenantId, input.id)`
- Line 717: `return repo.findByIdWithDetail(prisma, tenantId, copiedPlan.id)`

**Type change**: `findUnique` -> `findFirst`. Return type stays `T | null` — no downstream impact.

### Test File

- `src/trpc/routers/__tests__/dayPlans-router.test.ts` — exists, should be run after fix

---

## File 3: `booking-type-group-repository.ts` — `findByIdWithMembers()`

### Current Code (lines 113-121)

```ts
export async function findByIdWithMembers(
  prisma: PrismaClient,
  id: string
) {
  return prisma.bookingTypeGroup.findUnique({
    where: { id },
    include: groupInclude,
  })
}
```

Where `groupInclude` includes `members` with nested `bookingType` selects.

### Prisma Schema — `BookingTypeGroup`

- **Has `tenantId` directly** on the model
- Unique constraint: `@@unique([tenantId, code])` — but no `[tenantId, id]` unique constraint
- Therefore `findFirst` with `{ id, tenantId }` is required

### Callers

All callers are in `booking-type-group-service.ts`:

#### 1. `create()` (line 122)

```ts
return repo.findByIdWithMembers(prisma, created.id)
```

- **Has `tenantId`?** Yes, `tenantId` is a parameter of `create()`.
- **Post-hoc check?** No — `created.id` was just created with this tenant.
- **Risk**: LOW (freshly created), but should be fixed for consistency.

#### 2. `update()` (line 179)

```ts
const result = await repo.findByIdWithMembers(prisma, input.id)
```

- **Has `tenantId`?** Yes, `tenantId` is a parameter of `update()`.
- **Post-hoc check?** No, but `repo.findById(prisma, tenantId, input.id)` was called at line 138 to pre-verify.
- **Risk**: LOW (pre-verified), but should be fixed for consistency.

### Fix Required

**Repository change** — Add `tenantId` parameter, switch to `findFirst`:
```ts
export async function findByIdWithMembers(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.bookingTypeGroup.findFirst({
    where: { id, tenantId },
    include: groupInclude,
  })
}
```

**Caller changes** (2 sites in `booking-type-group-service.ts`):
- Line 122: `return repo.findByIdWithMembers(prisma, tenantId, created.id)`
- Line 179: `const result = await repo.findByIdWithMembers(prisma, tenantId, input.id)`

**Type change**: `findUnique` -> `findFirst`. Return type stays `T | null` — no downstream impact.

### Test File

- `src/trpc/routers/__tests__/bookingTypes-router.test.ts` — covers booking type groups, should be run after fix

---

## File 4: `billing-document-repository.ts` — `findPositionById()`

### Current Code (lines 175-183)

```ts
export async function findPositionById(
  prisma: PrismaClient,
  id: string
) {
  return prisma.billingDocumentPosition.findFirst({
    where: { id },
    include: { document: { select: { id: true, tenantId: true, status: true } } },
  })
}
```

Note: This already uses `findFirst` (not `findUnique`), but without `tenantId` in the where clause.

### Prisma Schema — `BillingDocumentPosition`

- **No `tenantId` column** on `BillingDocumentPosition` directly
- Tenant is accessible only via relation: `BillingDocumentPosition -> BillingDocument -> tenantId`
- The `BillingDocument` model has `tenantId` directly

### Callers

Both callers are in `billing-document-service.ts`:

#### 1. `updatePosition()` (line 889)

```ts
const pos = await repo.findPositionById(prisma, input.id)
if (!pos) throw new BillingDocumentValidationError("Position not found")
if (!pos.document) throw new BillingDocumentNotFoundError()
if (pos.document.tenantId !== tenantId) throw new BillingDocumentNotFoundError()
assertDraft(pos.document.status)
```

- **Has `tenantId`?** Yes, `tenantId` is a parameter of `updatePosition()`.
- **Post-hoc check?** Yes, line 892 checks `pos.document.tenantId !== tenantId`.
- **Risk**: LOW (post-hoc check exists), but the repository fetches cross-tenant data before the check.

#### 2. `deletePosition()` (line 951)

```ts
const pos = await repo.findPositionById(prisma, id)
if (!pos) throw new BillingDocumentValidationError("Position not found")
if (!pos.document) throw new BillingDocumentNotFoundError()
if (pos.document.tenantId !== tenantId) throw new BillingDocumentNotFoundError()
assertDraft(pos.document.status)
```

- **Has `tenantId`?** Yes, `tenantId` is a parameter of `deletePosition()`.
- **Post-hoc check?** Yes, line 954 checks `pos.document.tenantId !== tenantId`.
- **Risk**: LOW (post-hoc check exists), but same issue.

### Fix Required

Since `BillingDocumentPosition` has no `tenantId` column, the fix must use a **relation filter**:

**Repository change** — Add `tenantId` parameter, add relation filter:
```ts
export async function findPositionById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.billingDocumentPosition.findFirst({
    where: { id, document: { tenantId } },
    include: { document: { select: { id: true, tenantId: true, status: true } } },
  })
}
```

**Caller changes** (2 sites in `billing-document-service.ts`):
- Line 889: `const pos = await repo.findPositionById(prisma, tenantId, input.id)`
- Line 951: `const pos = await repo.findPositionById(prisma, tenantId, id)`

The post-hoc checks (lines 892, 954) become redundant but can be kept as defense-in-depth.

**Type change**: Already `findFirst`, no conversion needed. Return type stays the same.

**Include still needed?** The `document: { select: { id, tenantId, status } }` include is still needed because both callers use `pos.document.status` (via `assertDraft()`) and `pos.document.id` (for `recalculateTotals`).

### Test File

- `src/trpc/routers/__tests__/billingDocuments-router.test.ts` — exists, should be run after fix

---

## Implementation Checklist

| # | File | Method | Change Type | Callers to Update |
|---|------|--------|-------------|-------------------|
| 1 | `src/lib/services/employee-contacts-repository.ts` | `findContactWithEmployee` | `findUnique` -> `findFirst` + relation filter `employee: { tenantId }` | 1 site in `employee-contacts-service.ts:151` |
| 2 | `src/lib/services/day-plans-repository.ts` | `findByIdWithDetail` | `findUnique` -> `findFirst` + add `tenantId` to where | 3 sites in `day-plans-service.ts:318,557,717` |
| 3 | `src/lib/services/booking-type-group-repository.ts` | `findByIdWithMembers` | `findUnique` -> `findFirst` + add `tenantId` to where | 2 sites in `booking-type-group-service.ts:122,179` |
| 4 | `src/lib/services/billing-document-repository.ts` | `findPositionById` | Add relation filter `document: { tenantId }` (already `findFirst`) | 2 sites in `billing-document-service.ts:889,951` |

**Total changes**: 4 repository methods + 8 caller sites = 12 code changes

### Risk Assessment

All 4 methods have either:
- A post-hoc tenant check in the caller (files 1 and 4), or
- Are called only after a prior tenant-scoped verification (files 2 and 3)

This means the practical risk of cross-tenant data leakage is **low** in the current codebase. However, the repository layer should enforce tenant isolation at the query level as defense-in-depth, and to prevent future callers from accidentally omitting the check.

### Test Commands

```bash
pnpm vitest run src/trpc/routers/__tests__/employee-contacts-router.test.ts
pnpm vitest run src/trpc/routers/__tests__/dayPlans-router.test.ts
pnpm vitest run src/trpc/routers/__tests__/bookingTypes-router.test.ts
pnpm vitest run src/trpc/routers/__tests__/billingDocuments-router.test.ts
pnpm typecheck
```
