# AUDIT-006 Implementation Plan: Tenant Isolation — findUnique/findFirst without tenantId

**Date**: 2026-03-22
**Audit Ticket**: AUDIT-006
**Priority**: P1 / HIGH
**Total Changes**: 4 repository methods + 8 caller sites = 12 code changes
**Estimated Effort**: ~30 minutes

---

## Phase Ordering

All four fixes are independent — no dependencies between them. They can be done in any order. Recommended order (simplest first):

1. **File 3** — `booking-type-group-repository.ts` (simplest: direct `tenantId` column, 2 callers)
2. **File 2** — `day-plans-repository.ts` (direct `tenantId` column, 3 callers)
3. **File 1** — `employee-contacts-repository.ts` (relation filter, 1 caller)
4. **File 4** — `billing-document-repository.ts` (relation filter, 2 callers)

---

## Fix 1: `booking-type-group-repository.ts` — `findByIdWithMembers()`

### 1a. Repository Change

**File**: `src/lib/services/booking-type-group-repository.ts`
**Method**: `findByIdWithMembers` (lines 113-121)
**Conversion**: `findUnique` -> `findFirst` (no `[tenantId, id]` unique constraint exists)
**tenantId location**: Direct column on `BookingTypeGroup` model

**Old signature** (line 113-115):
```ts
export async function findByIdWithMembers(
  prisma: PrismaClient,
  id: string
) {
```

**New signature**:
```ts
export async function findByIdWithMembers(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
```

**Old where clause** (lines 117-118):
```ts
  return prisma.bookingTypeGroup.findUnique({
    where: { id },
```

**New where clause**:
```ts
  return prisma.bookingTypeGroup.findFirst({
    where: { id, tenantId },
```

**Include**: No change needed — `groupInclude` stays the same.

### 1b. Caller Changes

**File**: `src/lib/services/booking-type-group-service.ts`

| Caller | Line | Old Call | New Call | tenantId Source |
|--------|------|----------|----------|-----------------|
| `create()` | 122 | `repo.findByIdWithMembers(prisma, created.id)` | `repo.findByIdWithMembers(prisma, tenantId, created.id)` | `tenantId` parameter of `create()` (line 63) |
| `update()` | 179 | `repo.findByIdWithMembers(prisma, input.id)` | `repo.findByIdWithMembers(prisma, tenantId, input.id)` | `tenantId` parameter of `update()` (line 126) |

### 1c. Tests

**File**: `src/trpc/routers/__tests__/bookingTypes-router.test.ts`
**Action**: No test code changes expected — tests call through tRPC routers which already pass tenantId via context. Run to verify no regressions.

---

## Fix 2: `day-plans-repository.ts` — `findByIdWithDetail()`

### 2a. Repository Change

**File**: `src/lib/services/day-plans-repository.ts`
**Method**: `findByIdWithDetail` (lines 97-102)
**Conversion**: `findUnique` -> `findFirst` (no `[tenantId, id]` unique constraint exists)
**tenantId location**: Direct column on `DayPlan` model

**Old signature** (line 97):
```ts
export async function findByIdWithDetail(prisma: PrismaClient, id: string) {
```

**New signature**:
```ts
export async function findByIdWithDetail(prisma: PrismaClient, tenantId: string, id: string) {
```

**Old where clause** (lines 98-99):
```ts
  return prisma.dayPlan.findUnique({
    where: { id },
```

**New where clause**:
```ts
  return prisma.dayPlan.findFirst({
    where: { id, tenantId },
```

**Include**: No change needed — `dayPlanDetailInclude` stays the same.

### 2b. Caller Changes

**File**: `src/lib/services/day-plans-service.ts`

| Caller | Line | Old Call | New Call | tenantId Source |
|--------|------|----------|----------|-----------------|
| `create()` | 318 | `repo.findByIdWithDetail(prisma, created.id)` | `repo.findByIdWithDetail(prisma, tenantId, created.id)` | `tenantId` parameter of `create()` (line 161) |
| `update()` | 557 | `repo.findByIdWithDetail(prisma, input.id)` | `repo.findByIdWithDetail(prisma, tenantId, input.id)` | `tenantId` parameter of `update()` (line 322) |
| `copy()` | 717 | `repo.findByIdWithDetail(prisma, copiedPlan.id)` | `repo.findByIdWithDetail(prisma, tenantId, copiedPlan.id)` | `tenantId` parameter of `copy()` (line 599) |

### 2c. Tests

**File**: `src/trpc/routers/__tests__/dayPlans-router.test.ts`
**Action**: No test code changes expected — tests call through tRPC routers which already pass tenantId via context. Run to verify no regressions.

---

## Fix 3: `employee-contacts-repository.ts` — `findContactWithEmployee()`

### 3a. Repository Change

**File**: `src/lib/services/employee-contacts-repository.ts`
**Method**: `findContactWithEmployee` (lines 56-68)
**Conversion**: `findUnique` -> `findFirst` (required because filter uses a relation)
**tenantId location**: NOT on `EmployeeContact` directly — accessible via `employee.tenantId` (relation filter required)

**Old signature** (lines 56-58):
```ts
export async function findContactWithEmployee(
  prisma: PrismaClient,
  contactId: string
) {
```

**New signature**:
```ts
export async function findContactWithEmployee(
  prisma: PrismaClient,
  tenantId: string,
  contactId: string
) {
```

**Old where clause** (lines 60-61):
```ts
  return prisma.employeeContact.findUnique({
    where: { id: contactId },
```

**New where clause**:
```ts
  return prisma.employeeContact.findFirst({
    where: { id: contactId, employee: { tenantId } },
```

**Include**: Keep `employee: { select: { tenantId: true } }` for defense-in-depth (the caller's post-hoc check still uses it).

### 3b. Caller Changes

**File**: `src/lib/services/employee-contacts-service.ts`

| Caller | Line | Old Call | New Call | tenantId Source |
|--------|------|----------|----------|-----------------|
| `deleteContact()` | 151 | `repo.findContactWithEmployee(prisma, contactId)` | `repo.findContactWithEmployee(prisma, tenantId, contactId)` | `tenantId` parameter of `deleteContact()` (line 147) |

**Note**: The post-hoc check at lines 156-158 (`if (contact.employee.tenantId !== tenantId)`) becomes redundant but should be kept as defense-in-depth. No changes to this code.

### 3c. Tests

**File**: `src/trpc/routers/__tests__/employee-contacts-router.test.ts`
**Action**: No test code changes expected — tests call through tRPC routers which already pass tenantId via context. Run to verify no regressions.

---

## Fix 4: `billing-document-repository.ts` — `findPositionById()`

### 4a. Repository Change

**File**: `src/lib/services/billing-document-repository.ts`
**Method**: `findPositionById` (lines 175-183)
**Conversion**: NOT needed — already uses `findFirst`
**tenantId location**: NOT on `BillingDocumentPosition` directly — accessible via `document.tenantId` (relation filter required)

**Old signature** (lines 175-177):
```ts
export async function findPositionById(
  prisma: PrismaClient,
  id: string
) {
```

**New signature**:
```ts
export async function findPositionById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
```

**Old where clause** (lines 179-180):
```ts
  return prisma.billingDocumentPosition.findFirst({
    where: { id },
```

**New where clause**:
```ts
  return prisma.billingDocumentPosition.findFirst({
    where: { id, document: { tenantId } },
```

**Include**: Keep `document: { select: { id: true, tenantId: true, status: true } }` — both callers use `pos.document.status` (via `assertDraft()`) and `pos.document.id` (for `recalculateTotals`).

### 4b. Caller Changes

**File**: `src/lib/services/billing-document-service.ts`

| Caller | Line | Old Call | New Call | tenantId Source |
|--------|------|----------|----------|-----------------|
| `updatePosition()` | 889 | `repo.findPositionById(prisma, input.id)` | `repo.findPositionById(prisma, tenantId, input.id)` | `tenantId` parameter of `updatePosition()` (line 872) |
| `deletePosition()` | 951 | `repo.findPositionById(prisma, id)` | `repo.findPositionById(prisma, tenantId, id)` | `tenantId` parameter of `deletePosition()` (line 946) |

**Note**: The post-hoc checks at lines 892 and 954 (`if (pos.document.tenantId !== tenantId)`) become redundant but should be kept as defense-in-depth. No changes to this code.

### 4c. Tests

**File**: `src/trpc/routers/__tests__/billingDocuments-router.test.ts`
**Action**: No test code changes expected — tests call through tRPC routers which already pass tenantId via context. Run to verify no regressions.

---

## Complete File Change Summary

| # | File | Type | Change |
|---|------|------|--------|
| 1 | `src/lib/services/booking-type-group-repository.ts` | Repository | `findByIdWithMembers`: add `tenantId` param, `findUnique` -> `findFirst`, add `tenantId` to where |
| 2 | `src/lib/services/booking-type-group-service.ts` | Service (caller) | 2 call sites: pass `tenantId` to `findByIdWithMembers` |
| 3 | `src/lib/services/day-plans-repository.ts` | Repository | `findByIdWithDetail`: add `tenantId` param, `findUnique` -> `findFirst`, add `tenantId` to where |
| 4 | `src/lib/services/day-plans-service.ts` | Service (caller) | 3 call sites: pass `tenantId` to `findByIdWithDetail` |
| 5 | `src/lib/services/employee-contacts-repository.ts` | Repository | `findContactWithEmployee`: add `tenantId` param, `findUnique` -> `findFirst`, add relation filter `employee: { tenantId }` |
| 6 | `src/lib/services/employee-contacts-service.ts` | Service (caller) | 1 call site: pass `tenantId` to `findContactWithEmployee` |
| 7 | `src/lib/services/billing-document-repository.ts` | Repository | `findPositionById`: add `tenantId` param, add relation filter `document: { tenantId }` (already `findFirst`) |
| 8 | `src/lib/services/billing-document-service.ts` | Service (caller) | 2 call sites: pass `tenantId` to `findPositionById` |

**Total**: 8 files, 12 individual code changes

---

## What NOT to Change

- **Service layer business logic** — only fix repository queries and update callers to pass `tenantId`
- **Post-hoc tenant checks** in services — keep as defense-in-depth (lines 156-158 in employee-contacts-service.ts, lines 892 and 954 in billing-document-service.ts)
- **Other find methods** that already include `tenantId` — no changes
- **count() methods** — those are tracked under AUDIT-013
- **Test files** — no test code changes needed; tests exercise these paths via tRPC routers which inject tenantId from context

---

## Verification Steps

### Automated

```bash
# Run targeted tests for all 4 affected areas
pnpm vitest run src/trpc/routers/__tests__/bookingTypes-router.test.ts
pnpm vitest run src/trpc/routers/__tests__/dayPlans-router.test.ts
pnpm vitest run src/trpc/routers/__tests__/employee-contacts-router.test.ts
pnpm vitest run src/trpc/routers/__tests__/billingDocuments-router.test.ts

# Full type check (will catch any missed caller sites)
pnpm typecheck

# Lint
pnpm lint

# Full test suite (optional, for confidence)
pnpm test
```

### Manual Checks

- [ ] Grep the codebase for any other callers of the 4 modified methods that may have been missed:
  - `grep -r "findByIdWithMembers" src/` — expect only repository + service
  - `grep -r "findByIdWithDetail" src/` — expect only repository + service
  - `grep -r "findContactWithEmployee" src/` — expect only repository + service
  - `grep -r "findPositionById" src/` — expect only repository + service
- [ ] Verify each modified method now requires `tenantId` as 2nd parameter (after `prisma`)
- [ ] Verify `findUnique` is replaced with `findFirst` where applicable
- [ ] Verify relation filters use correct nesting (`employee: { tenantId }` and `document: { tenantId }`)

---

## Risk Assessment

**Risk**: LOW — All 4 methods already have mitigating factors:
- Files 1 and 4 have post-hoc tenant checks in callers
- Files 2 and 3 are called only after prior tenant-scoped verification

The fix moves tenant isolation from "caller-dependent" to "repository-enforced", which is the correct defense-in-depth pattern. No business logic changes, no breaking API changes, no schema changes.
