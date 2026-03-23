# Implementation Plan: AUDIT-001 — Tenant Isolation Gaps in Update Operations

## 1. Summary

Seven repository files use `prisma.model.update({ where: { id } })` without `tenantId` in the where clause, allowing cross-tenant writes if an attacker guesses a record ID. The fix applies the `updateMany + count check + refetch` pattern (via existing helpers in `prisma-helpers.ts`) to enforce tenant isolation at the database layer.

**Scope:** 7 repository files, 1 service file (caller signature change). No service logic changes, no new tests, no read method changes.

---

## 2. Pattern

### 2a. Models with direct `tenantId` — use `tenantScopedUpdate`

```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

// Before:
return prisma.model.update({ where: { id }, data })

// After:
return tenantScopedUpdate(prisma.model, { id, tenantId }, data, {
  entity: "ModelName",
  // include: ... (only if caller uses the return value with relations)
})
```

`tenantScopedUpdate` internally does:
1. `delegate.updateMany({ where: { id, tenantId }, data })`
2. Throws `TenantScopedNotFoundError` if `count === 0`
3. Refetches via `delegate.findFirst({ where: { id, tenantId }, include?, select? })`
4. Returns the refetched record

### 2b. Models without direct `tenantId` but with relation — use `relationScopedUpdate`

```ts
import { relationScopedUpdate } from "@/lib/services/prisma-helpers"

return relationScopedUpdate(prisma.model, { id, parentRelation: { tenantId } }, data, {
  entity: "ModelName",
})
```

### 2c. Models without `tenantId` scoped by parent FK — manual `updateMany`

```ts
// Before:
await tx.model.update({ where: { id: existing.id }, data })

// After:
await tx.model.updateMany({ where: { id: existing.id, parentId }, data })
```

---

## 3. File-by-file Changes

### 3.1. `src/lib/services/order-assignment-repository.ts` — `update()` (line 108)

**Difficulty:** Trivial
**Model has tenantId:** YES
**Caller uses return value:** No (discarded, re-fetched separately)

**Current code (line 1, 102-109):**
```ts
import type { PrismaClient } from "@/generated/prisma/client"
...
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.orderAssignment.update({ where: { id }, data })
}
```

**New code:**
```ts
import type { PrismaClient } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
...
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.orderAssignment, { id, tenantId }, data, {
    entity: "OrderAssignment",
  })
}
```

**Changes:**
1. Add import for `tenantScopedUpdate` from `prisma-helpers`
2. Replace `prisma.orderAssignment.update(...)` with `tenantScopedUpdate(...)` call

**Special considerations:** None. Caller discards return value and re-fetches with includes.

---

### 3.2. `src/lib/services/order-booking-repository.ts` — `update()` (line 160)

**Difficulty:** Trivial
**Model has tenantId:** YES
**Caller uses return value:** No (discarded, re-fetched separately)

**Current code (line 1, 154-161):**
```ts
import type { PrismaClient } from "@/generated/prisma/client"
...
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.orderBooking.update({ where: { id }, data })
}
```

**New code:**
```ts
import type { PrismaClient } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
...
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.orderBooking, { id, tenantId }, data, {
    entity: "OrderBooking",
  })
}
```

**Changes:**
1. Add import for `tenantScopedUpdate`
2. Replace `prisma.orderBooking.update(...)` with `tenantScopedUpdate(...)` call

**Special considerations:** None.

---

### 3.3. `src/lib/services/travel-allowance-rule-set-repository.ts` — `update()` (line 59)

**Difficulty:** Trivial
**Model has tenantId:** YES
**Caller uses return value:** YES (used for audit logging and as return value)

**Current code (line 1, 53-60):**
```ts
import type { PrismaClient } from "@/generated/prisma/client"
...
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.travelAllowanceRuleSet.update({ where: { id }, data })
}
```

**New code:**
```ts
import type { PrismaClient } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
...
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.travelAllowanceRuleSet, { id, tenantId }, data, {
    entity: "TravelAllowanceRuleSet",
  })
}
```

**Changes:**
1. Add import for `tenantScopedUpdate`
2. Replace `prisma.travelAllowanceRuleSet.update(...)` with `tenantScopedUpdate(...)` call

**Special considerations:** Caller uses the return value. `tenantScopedUpdate` returns the refetched record (flat, no include needed), which matches what `prisma.update` returned. The caller's `!` non-null assertion (`(await repo.update(...))!`) is harmless — `tenantScopedUpdate` always returns a non-null record or throws.

---

### 3.4. `src/lib/services/trip-record-repository.ts` — `update()` (line 126)

**Difficulty:** Easy
**Model has tenantId:** YES
**Caller uses return value:** YES (used for mapping and audit logging)

**Current code (lines 1, 9-17, 120-131):**
```ts
import type { PrismaClient } from "@/generated/prisma/client"
...
const tripRecordInclude = {
  vehicle: {
    select: { id: true, code: true, name: true },
  },
  vehicleRoute: {
    select: { id: true, code: true, name: true },
  },
} as const
...
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.tripRecord.update({
    where: { id },
    data,
    include: tripRecordInclude,
  })
}
```

**New code:**
```ts
import type { PrismaClient } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
...
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.tripRecord, { id, tenantId }, data, {
    include: tripRecordInclude,
    entity: "TripRecord",
  })
}
```

**Changes:**
1. Add import for `tenantScopedUpdate`
2. Replace `prisma.tripRecord.update(...)` with `tenantScopedUpdate(...)`, passing `include: tripRecordInclude`

**Special considerations:** The `include: tripRecordInclude` is critical — the caller depends on `vehicle` and `vehicleRoute` relations being present. `tenantScopedUpdate` passes `include` to the `findFirst` refetch, so this works correctly.

---

### 3.5. `src/lib/services/employee-cards-repository.ts` — `updateCard()` (line 92)

**Difficulty:** Moderate (requires signature change + caller update)
**Model has tenantId:** YES
**Caller uses return value:** YES (used for mapping and audit logging)

**Current code (lines 1, 83-96):**
```ts
import type { PrismaClient } from "@/generated/prisma/client"
...
export async function updateCard(
  prisma: PrismaClient,
  cardId: string,
  data: {
    isActive: boolean
    deactivatedAt: Date
    deactivationReason: string | null
  }
) {
  return prisma.employeeCard.update({
    where: { id: cardId },
    data,
  })
}
```

**New code:**
```ts
import type { PrismaClient } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
...
export async function updateCard(
  prisma: PrismaClient,
  tenantId: string,
  cardId: string,
  data: {
    isActive: boolean
    deactivatedAt: Date
    deactivationReason: string | null
  }
) {
  return tenantScopedUpdate(
    prisma.employeeCard,
    { id: cardId, tenantId },
    data as unknown as Record<string, unknown>,
    { entity: "EmployeeCard" },
  )
}
```

**Changes:**
1. Add import for `tenantScopedUpdate`
2. Add `tenantId: string` parameter (after `prisma`, before `cardId`)
3. Replace `prisma.employeeCard.update(...)` with `tenantScopedUpdate(...)` call
4. Cast `data` to `Record<string, unknown>` (the typed data object needs casting for the helper's generic signature)

**Caller update required in `src/lib/services/employee-cards-service.ts` (line 186):**

Current:
```ts
const card = await repo.updateCard(prisma, input.id, {
```

New:
```ts
const card = await repo.updateCard(prisma, tenantId, input.id, {
```

This is the only case where the ticket says "Do not modify the service layer callers" but a signature change is unavoidable because `updateCard` currently does not accept `tenantId` at all. The change is minimal (adding one argument) and does not alter business logic.

---

### 3.6. `src/lib/services/billing-price-list-repository.ts` — `upsertEntries()` (line 237)

**Difficulty:** Easy
**Model has tenantId:** NO (`BillingPriceListEntry` has `priceListId` FK to `BillingPriceList` which has `tenantId`)
**Caller uses return value:** No (returns `{ created, updated }` counts — not affected)

**Current code (lines 236-245):**
```ts
      if (existing) {
        await tx.billingPriceListEntry.update({
          where: { id: existing.id },
          data: {
            unitPrice: entry.unitPrice,
            ...(entry.description !== undefined ? { description: entry.description } : {}),
            ...(entry.minQuantity !== undefined ? { minQuantity: entry.minQuantity } : {}),
            ...(entry.unit !== undefined ? { unit: entry.unit } : {}),
          },
        })
        updated++
```

**New code:**
```ts
      if (existing) {
        await tx.billingPriceListEntry.updateMany({
          where: { id: existing.id, priceListId },
          data: {
            unitPrice: entry.unitPrice,
            ...(entry.description !== undefined ? { description: entry.description } : {}),
            ...(entry.minQuantity !== undefined ? { minQuantity: entry.minQuantity } : {}),
            ...(entry.unit !== undefined ? { unit: entry.unit } : {}),
          },
        })
        updated++
```

**Changes:**
1. Replace `tx.billingPriceListEntry.update(...)` with `tx.billingPriceListEntry.updateMany(...)`
2. Add `priceListId` to the where clause (alongside `id: existing.id`)

**Special considerations:**
- Inside a `$transaction` callback — uses `tx`, NOT `prisma`. This is already correct in the existing code.
- `BillingPriceListEntry` has no `tenantId` field; `priceListId` is the scope boundary. The caller (`billing-price-list-service.ts`) verifies `priceListId` belongs to the tenant before calling `upsertEntries`.
- Cannot use `tenantScopedUpdate` helper (requires `tenantId` in where type).
- No refetch needed — return value is `{ created, updated }` counts.
- The `updateEntry()` method at line 181 in the same file already uses this exact pattern (`updateMany({ where: { id: entryId, priceListId } })`), so this is consistent.
- No new imports needed.

---

### 3.7. `src/lib/services/employee-messages-repository.ts` — `updateRecipientStatus()` (line 166)

**Difficulty:** Moderate
**Model has tenantId:** NO (`EmployeeMessageRecipient` has `messageId` FK to `EmployeeMessage` which has `tenantId`)
**Caller uses return value:** No (returns `true`)

**Current code (lines 1, 156-171):**
```ts
import type { PrismaClient } from "@/generated/prisma/client"
...
export async function updateRecipientStatus(
  prisma: PrismaClient,
  tenantId: string,
  recipientId: string,
  data: {
    status: string
    sentAt?: Date
    errorMessage?: string
  }
) {
  await prisma.employeeMessageRecipient.update({
    where: { id: recipientId },
    data,
  })
  return true
}
```

**New code:**
```ts
import type { PrismaClient } from "@/generated/prisma/client"
import { relationScopedUpdate } from "@/lib/services/prisma-helpers"
...
export async function updateRecipientStatus(
  prisma: PrismaClient,
  tenantId: string,
  recipientId: string,
  data: {
    status: string
    sentAt?: Date
    errorMessage?: string
  }
) {
  await relationScopedUpdate(
    prisma.employeeMessageRecipient,
    { id: recipientId, message: { tenantId } },
    data as unknown as Record<string, unknown>,
    { entity: "EmployeeMessageRecipient" },
  )
  return true
}
```

**Changes:**
1. Add import for `relationScopedUpdate` from `prisma-helpers`
2. Replace `prisma.employeeMessageRecipient.update(...)` with `relationScopedUpdate(...)` call
3. Use `{ id: recipientId, message: { tenantId } }` as the where clause (relation-based tenant check)
4. Cast `data` to `Record<string, unknown>` for the helper's generic signature
5. Keep `return true` — the `relationScopedUpdate` return value is discarded (awaited but not assigned)

**Special considerations:**
- `relationScopedUpdate` is currently unused in the codebase — this will be its first caller. It was specifically designed for this pattern (models without direct `tenantId` that scope via parent relation).
- The `message: { tenantId }` relation filter works with Prisma's `updateMany` because Prisma supports relation filters in `updateMany` where clauses.
- The `listMessagesForEmployee` method in the same file already uses `{ message: { tenantId } }` as a relation filter, confirming this pattern works.

---

## 4. Execution Order

Start with the simplest (direct `tenantScopedUpdate` swaps), end with special cases:

| Order | File | Reason |
|-------|------|--------|
| 1 | `order-assignment-repository.ts` | Simplest: direct swap, caller discards return |
| 2 | `order-booking-repository.ts` | Same pattern as #1 |
| 3 | `travel-allowance-rule-set-repository.ts` | Direct swap, caller uses return (but no include) |
| 4 | `trip-record-repository.ts` | Direct swap with `include` parameter |
| 5 | `billing-price-list-repository.ts` | Manual `updateMany` (no helper), inside transaction |
| 6 | `employee-cards-repository.ts` + `employee-cards-service.ts` | Signature change + caller update |
| 7 | `employee-messages-repository.ts` | First use of `relationScopedUpdate`, relation-based where |

---

## 5. Verification Steps

Run after all changes are applied:

```bash
# 1. Type-check (confirms updateMany return type compatibility, signature changes compile)
pnpm typecheck

# 2. Lint (confirms imports are correct, no unused vars)
pnpm lint

# 3. Tests (confirms no regressions)
pnpm test
```

**What to watch for:**
- `typecheck`: The `tenantScopedUpdate` return type is `Promise<any>`, so it won't cause type mismatches with existing callers. The `employee-cards-service.ts` caller change should compile cleanly since `tenantId` is already in scope.
- `lint`: New imports should not trigger unused-import warnings since they replace the removed Prisma calls.
- `test`: No test should break because:
  - Tests use valid tenant-scoped data, so `updateMany` with `tenantId` will match the same rows as `update` with `id` alone.
  - `tenantScopedUpdate` returns the same record shape (with optional includes) as `prisma.model.update`.

---

## 6. Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `relationScopedUpdate` with `{ message: { tenantId } }` may not work in Prisma `updateMany` | Low — Prisma supports relation filters in `updateMany` where clauses, and the same pattern is used in `deleteMany` in `order-assignment-repository.ts` | Verify with typecheck; if it fails, fall back to manual `updateMany` + count check |
| `employee-cards-service.ts` caller change breaks something | Very low — adding one argument (`tenantId`) that is already in scope at the call site | Typecheck will catch any mismatch |
| `data as unknown as Record<string, unknown>` cast hides type errors | Low — the data types are narrowly defined in the function signatures and validated by the service layer before reaching the repository | The cast is only needed because the helper uses a generic `Record<string, unknown>` signature; the actual data is still type-checked at the function boundary |
| Existing tests assume `update` returns Prisma model type, not `any` | Very low — `tenantScopedUpdate` returns `any`, which is assignable to any type | Typecheck will pass; runtime behavior is identical |
| `updateMany` returns `{ count }` not the record, so any code depending on the direct return of the update call would break | None — `tenantScopedUpdate` handles the refetch internally, and for `billing-price-list-repository.ts` the return value of the update is not used |
| Race condition between `updateMany` and `findFirst` in `tenantScopedUpdate` | Very low — this is the same TOCTOU window that exists in all other repos already using `tenantScopedUpdate` (20+ repos). The window is microseconds within the same DB connection. | Accepted pattern across the codebase |

---

## 7. Files Modified (complete list)

| # | File | Change Type |
|---|------|-------------|
| 1 | `src/lib/services/order-assignment-repository.ts` | Add import + replace update body |
| 2 | `src/lib/services/order-booking-repository.ts` | Add import + replace update body |
| 3 | `src/lib/services/travel-allowance-rule-set-repository.ts` | Add import + replace update body |
| 4 | `src/lib/services/trip-record-repository.ts` | Add import + replace update body |
| 5 | `src/lib/services/billing-price-list-repository.ts` | Replace `.update()` with `.updateMany()` + add `priceListId` to where |
| 6 | `src/lib/services/employee-cards-repository.ts` | Add import + add `tenantId` param + replace update body |
| 7 | `src/lib/services/employee-cards-service.ts` | Pass `tenantId` to `repo.updateCard()` call |
| 8 | `src/lib/services/employee-messages-repository.ts` | Add import + replace update body with `relationScopedUpdate` |

**Files NOT modified:**
- `src/lib/services/prisma-helpers.ts` — no changes needed, both helpers already exist
- Service files (except `employee-cards-service.ts`) — no changes needed
- Router files — no changes needed
- Test files — not in scope
