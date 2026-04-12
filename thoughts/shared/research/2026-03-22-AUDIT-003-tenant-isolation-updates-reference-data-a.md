# AUDIT-003: Tenant Isolation - Update without tenantId in Reference Data Repositories

**Date:** 2026-03-22
**Severity:** Critical (tenant isolation bypass)
**Affected files:** 10 repository files

## Summary

All 10 affected repository files accept `tenantId` as a parameter in their `update()` function but **never use it** in the Prisma `where` clause. They all use `prisma.model.update({ where: { id } })` which allows any tenant to update any other tenant's record if they know the UUID.

A shared helper `tenantScopedUpdate` already exists at `src/lib/services/prisma-helpers.ts` and is already used by 20 other repository files. The fix is to import and use this helper in all 10 affected files.

---

## Existing Helper: `tenantScopedUpdate`

**File:** `src/lib/services/prisma-helpers.ts`

```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

The helper:
1. Calls `delegate.updateMany({ where: { id, tenantId }, data })` (tenant-scoped)
2. Checks `count === 0` and throws `TenantScopedNotFoundError` if no row matched
3. Refetches the updated record via `delegate.findFirst({ where: { id, tenantId } })`
4. Returns the refetched record

`TenantScopedNotFoundError` has its name ending in `NotFoundError`, so `handleServiceError` in `src/trpc/errors.ts` (line 17) automatically maps it to tRPC `NOT_FOUND`.

---

## Prisma Schema Confirmation

All 10 models have a `tenantId` field. Two (Account, BookingType) have **optional** `tenantId` (nullable, for system records); the other 8 have **required** `tenantId`.

| Model | tenantId | Nullable? | Schema Line |
|---|---|---|---|
| AbsenceTypeGroup | `tenantId String @map("tenant_id") @db.Uuid` | No | 1937 |
| Account | `tenantId String? @map("tenant_id") @db.Uuid` | **Yes** | 1212 |
| Activity | `tenantId String @map("tenant_id") @db.Uuid` | No | 1704 |
| BookingReason | `tenantId String @map("tenant_id") @db.Uuid` | No | 1853 |
| BookingTypeGroup | `tenantId String @map("tenant_id") @db.Uuid` | No | 1887 |
| BookingType | `tenantId String? @map("tenant_id") @db.Uuid` | **Yes** | 1817 |
| CalculationRule | `tenantId String @map("tenant_id") @db.Uuid` | No | 1965 |
| ContactKind | `tenantId String @map("tenant_id") @db.Uuid` | No | 1508 |
| ContactType | `tenantId String @map("tenant_id") @db.Uuid` | No | 1480 |
| Department | `tenantId String @map("tenant_id") @db.Uuid` | No | 1258 |

**Note on Account and BookingType:** These models allow `tenantId = null` for system-wide records. The `tenantScopedUpdate` helper will still work correctly because it filters `where: { id, tenantId }` -- passing the actual tenantId will only match tenant-owned records (not system records), which is the correct behavior. System records (tenantId=null) should not be editable via normal tenant update APIs.

---

## Affected Files: Current Buggy Code

### 1. `src/lib/services/absence-type-group-repository.ts` (lines 61-68)

```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.absenceTypeGroup.update({ where: { id }, data })  // BUG: tenantId ignored
}
```

### 2. `src/lib/services/account-repository.ts` (lines 93-100)

```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.account.update({ where: { id }, data })  // BUG: tenantId ignored
}
```

### 3. `src/lib/services/activity-repository.ts` (lines 61-68)

```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.activity.update({ where: { id }, data })  // BUG: tenantId ignored
}
```

### 4. `src/lib/services/booking-reason-repository.ts` (lines 63-70)

```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.bookingReason.update({ where: { id }, data })  // BUG: tenantId ignored
}
```

### 5. `src/lib/services/booking-type-group-repository.ts` (lines 122-129)

```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.bookingTypeGroup.update({ where: { id }, data })  // BUG: tenantId ignored
}
```

### 6. `src/lib/services/booking-type-repository.ts` (lines 72-79)

```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.bookingType.update({ where: { id }, data })  // BUG: tenantId ignored
}
```

### 7. `src/lib/services/calculation-rule-repository.ts` (lines 62-69)

```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.calculationRule.update({ where: { id }, data })  // BUG: tenantId ignored
}
```

### 8. `src/lib/services/contact-kind-repository.ts` (lines 66-73)

```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.contactKind.update({ where: { id }, data })  // BUG: tenantId ignored
}
```

### 9. `src/lib/services/contact-type-repository.ts` (lines 63-70)

```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.contactType.update({ where: { id }, data })  // BUG: tenantId ignored
}
```

### 10. `src/lib/services/department-repository.ts` (lines 88-95)

```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.department.update({ where: { id }, data })  // BUG: tenantId ignored
}
```

---

## Delete Methods: Already Correctly Implemented

All 10 files use `deleteMany({ where: { id, tenantId } })` for their `deleteById()` method, which correctly scopes to the tenant. No fix needed for delete methods.

| File | Delete Method | Tenant-scoped? |
|---|---|---|
| absence-type-group-repository.ts | `deleteMany({ where: { id, tenantId } })` (line 71) | Yes |
| account-repository.ts | `deleteMany({ where: { id, tenantId } })` (line 103) | Yes |
| activity-repository.ts | `deleteMany({ where: { id, tenantId } })` (line 71) | Yes |
| booking-reason-repository.ts | `deleteMany({ where: { id, tenantId } })` (line 73) | Yes |
| booking-type-group-repository.ts | `deleteMany({ where: { id, tenantId } })` (line 132) | Yes |
| booking-type-repository.ts | `deleteMany({ where: { id, tenantId } })` (line 82) | Yes |
| calculation-rule-repository.ts | `deleteMany({ where: { id, tenantId } })` (line 72) | Yes |
| contact-kind-repository.ts | `deleteMany({ where: { id, tenantId } })` (line 76) | Yes |
| contact-type-repository.ts | `deleteMany({ where: { id, tenantId } })` (line 73) | Yes |
| department-repository.ts | `deleteMany({ where: { id, tenantId } })` (line 102) | Yes |

---

## Additional Issue: `booking-type-group-repository.ts` - `findByIdWithMembers`

Line 112-120 has a `findByIdWithMembers` function that does NOT include tenantId:

```ts
export async function findByIdWithMembers(
  prisma: PrismaClient,
  id: string         // <-- no tenantId parameter at all
) {
  return prisma.bookingTypeGroup.findUnique({
    where: { id },   // <-- no tenantId
    include: groupInclude,
  })
}
```

This is a separate (lower-severity) read-isolation issue. It should be noted but is outside the scope of AUDIT-003 which focuses on update methods.

---

## Existing Correctly-Implemented Examples (for reference)

### Example 1: `access-profile-repository.ts` (lines 49-56)

```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.accessProfile, { id, tenantId }, data, { entity: "AccessProfile" })
}
```

### Example 2: `cost-center-repository.ts` (lines 62-69)

```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.costCenter, { id, tenantId }, data, { entity: "CostCenter" })
}
```

### Example 3: `account-group-repository.ts` (lines 63-70)

```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.accountGroup, { id, tenantId }, data, { entity: "AccountGroup" })
}
```

### Example 4: `group-repository.ts` (lines 121-131) - Manual updateMany pattern

```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  type: GroupType,
  id: string,
  data: Record<string, unknown>
) {
  const delegate = getGroupDelegate(prisma, type)
  await delegate.updateMany({ where: { id, tenantId }, data })
  return delegate.findFirst({ where: { id, tenantId } })
}
```

---

## Fix Pattern

For each of the 10 affected files, the fix is identical:

1. Add import: `import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"`
2. Replace the update function body:

**Before:**
```ts
return prisma.<model>.update({ where: { id }, data })
```

**After:**
```ts
return tenantScopedUpdate(prisma.<model>, { id, tenantId }, data, { entity: "<ModelName>" })
```

Entity names for the error messages:
| File | Prisma Delegate | Entity Name |
|---|---|---|
| absence-type-group-repository.ts | `prisma.absenceTypeGroup` | `"AbsenceTypeGroup"` |
| account-repository.ts | `prisma.account` | `"Account"` |
| activity-repository.ts | `prisma.activity` | `"Activity"` |
| booking-reason-repository.ts | `prisma.bookingReason` | `"BookingReason"` |
| booking-type-group-repository.ts | `prisma.bookingTypeGroup` | `"BookingTypeGroup"` |
| booking-type-repository.ts | `prisma.bookingType` | `"BookingType"` |
| calculation-rule-repository.ts | `prisma.calculationRule` | `"CalculationRule"` |
| contact-kind-repository.ts | `prisma.contactKind` | `"ContactKind"` |
| contact-type-repository.ts | `prisma.contactType` | `"ContactType"` |
| department-repository.ts | `prisma.department` | `"Department"` |

---

## Behavioral Change Note

The current buggy code uses `prisma.model.update()` which:
- Returns the updated record directly
- Throws a Prisma `P2025` error if the record doesn't exist (regardless of tenant)

The fixed code using `tenantScopedUpdate` will:
- Return the refetched record after update (same shape)
- Throw `TenantScopedNotFoundError` if the record doesn't exist OR belongs to a different tenant
- This is mapped to tRPC `NOT_FOUND` by `handleServiceError`

This is the correct behavior: a tenant should get a "not found" response rather than being able to update another tenant's data.

---

## Files Already Using `tenantScopedUpdate` (20 files)

For reference, these repositories already use the helper correctly:
- absences-repository.ts
- absence-type-repository.ts
- access-profile-repository.ts
- access-zone-repository.ts
- account-group-repository.ts
- bookings-repository.ts
- correction-repository.ts
- cost-center-repository.ts
- crm-address-repository.ts
- employees-repository.ts
- notification-repository.ts
- order-repository.ts
- payroll-export-repository.ts
- reports-repository.ts
- schedules-repository.ts
- shift-repository.ts
- system-settings-repository.ts
- terminal-booking-repository.ts
- user-group-repository.ts
- vacation-balances-repository.ts
