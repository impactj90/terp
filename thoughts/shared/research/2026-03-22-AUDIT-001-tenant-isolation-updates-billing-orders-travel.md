# Research: AUDIT-001 Tenant Isolation Gaps in Update Operations (Billing, Orders, Travel)

## Summary

Seven repository files use `prisma.model.update({ where: { id } })` without `tenantId` in the where clause. This bypasses tenant isolation at the database layer. All seven should be fixed using either the existing `tenantScopedUpdate` / `relationScopedUpdate` helpers from `prisma-helpers.ts` or a manual `updateMany` + refetch pattern.

---

## 1. prisma-helpers.ts — Existing Helpers

**File:** `src/lib/services/prisma-helpers.ts`

### `tenantScopedUpdate`

```ts
export async function tenantScopedUpdate(
  delegate: PrismaDelegate,
  where: { id: string; tenantId: string } & Record<string, unknown>,
  data: Record<string, unknown>,
  opts?: { include?: Record<string, unknown>; select?: Record<string, unknown>; entity?: string },
): Promise<any>
```

- Uses `delegate.updateMany({ where, data })` internally
- Checks `count === 0` and throws `TenantScopedNotFoundError`
- Refetches via `delegate.findFirst({ where, include?, select? })`
- Returns the refetched record

### `relationScopedUpdate`

```ts
export async function relationScopedUpdate(
  delegate: PrismaDelegate,
  where: Record<string, unknown>,
  data: Record<string, unknown>,
  opts?: { include?: Record<string, unknown>; select?: Record<string, unknown>; entity?: string },
): Promise<any>
```

- Same pattern but with a relaxed `where` type (no `{ id, tenantId }` requirement)
- Used for models that don't have a direct `tenantId` field — uses relation-based where (e.g., `{ id, message: { tenantId } }`)
- Currently **not used** anywhere in the codebase (zero callers)

### `TenantScopedNotFoundError`

```ts
export class TenantScopedNotFoundError extends Error {
  constructor(entity = "Record") {
    super(`${entity} not found`)
    this.name = "TenantScopedNotFoundError"
  }
}
```

- Name ends with `NotFoundError`, so `handleServiceError` in `src/trpc/errors.ts` automatically maps it to tRPC `NOT_FOUND`
- Import: `import { TenantScopedNotFoundError } from "@/lib/services/prisma-helpers"`

### Existing usage pattern (example from bookings-repository.ts):

```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

export async function update(prisma, tenantId, id, data) {
  return tenantScopedUpdate(prisma.booking, { id, tenantId }, data, {
    include: bookingDetailInclude,
    entity: "Booking",
  })
}
```

Other repos using `tenantScopedUpdate`: `reports-repository`, `absences-repository`, `payroll-export-repository`, `absence-type-repository`, `order-repository`, `user-group-repository`, `notification-repository`, `terminal-booking-repository`, `system-settings-repository`, `employees-repository`, `schedules-repository`, `shift-repository`, `vacation-balances-repository`, `correction-repository`, `bookings-repository`, `cost-center-repository`, `crm-address-repository`, `access-profile-repository`, `access-zone-repository`, `account-group-repository`.

---

## 2. Error Handling

**File:** `src/trpc/errors.ts`

`handleServiceError` uses `err.constructor.name.endsWith("NotFoundError")` to map errors to tRPC `NOT_FOUND`. The `TenantScopedNotFoundError` class name satisfies this check.

---

## 3. Affected File Analysis

### 3.1 billing-price-list-repository.ts — `upsertEntries` (line 237)

**File:** `src/lib/services/billing-price-list-repository.ts`

**Current code (lines 207-265):**
```ts
export async function upsertEntries(
  prisma: PrismaClient,
  priceListId: string,
  entries: Array<{
    articleId?: string
    itemKey?: string
    description?: string
    unitPrice: number
    minQuantity?: number
    unit?: string
  }>
) {
  let created = 0
  let updated = 0

  await prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      const existing = await tx.billingPriceListEntry.findFirst({
        where: {
          priceListId,
          ...(entry.articleId
            ? { articleId: entry.articleId }
            : entry.itemKey
              ? { itemKey: entry.itemKey }
              : {}),
        },
      })

      if (existing) {
        await tx.billingPriceListEntry.update({       // <-- VULNERABLE: no tenantId
          where: { id: existing.id },
          data: {
            unitPrice: entry.unitPrice,
            ...(entry.description !== undefined ? { description: entry.description } : {}),
            ...(entry.minQuantity !== undefined ? { minQuantity: entry.minQuantity } : {}),
            ...(entry.unit !== undefined ? { unit: entry.unit } : {}),
          },
        })
        updated++
      } else {
        await tx.billingPriceListEntry.create({ ... })
        created++
      }
    }
  })

  return { created, updated }
}
```

**Schema (BillingPriceListEntry):**
- **NO `tenantId` field** on `BillingPriceListEntry` model
- Has `priceListId` FK to `BillingPriceList` (which HAS `tenantId`)
- Cascade delete from `BillingPriceList`

**Caller:** `billing-price-list-service.ts` line 360 — `bulkImport()` already validates `priceListId` belongs to tenant via `repo.findById(prisma, tenantId, priceListId)` before calling `upsertEntries`.

**Return type:** `{ created: number, updated: number }`

**Special considerations:**
- Inside a `$transaction` callback — uses `tx`, not `prisma`
- `BillingPriceListEntry` does NOT have a direct `tenantId` column
- The existing `findFirst` scopes by `priceListId`, and the service validates that `priceListId` belongs to the tenant
- The `update` uses `{ id: existing.id }` where `existing` was just found by `priceListId` — so in practice the tenant scope is enforced transitively through the `priceListId` constraint
- **Risk level: LOW** — the `findFirst` that precedes the update already scopes by `priceListId`, which is tenant-verified by the caller. The update targets the `existing.id` just returned.
- **Fix approach:** Since `BillingPriceListEntry` has no `tenantId`, should add `priceListId` to the update where clause: `tx.billingPriceListEntry.updateMany({ where: { id: existing.id, priceListId }, data })`. Cannot use `tenantScopedUpdate` helper (requires `tenantId` in where). Could use a simple `updateMany` with `{ id: existing.id, priceListId }` instead.

**Other update methods in this file (already safe):**
- `update()` (line 83) — already uses `updateMany({ where: { id, tenantId } })` + refetch
- `updateEntry()` (line 181) — already uses `updateMany({ where: { id: entryId, priceListId } })` + refetch

---

### 3.2 order-assignment-repository.ts — `update()` (line 108)

**File:** `src/lib/services/order-assignment-repository.ts`

**Current code (lines 102-109):**
```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.orderAssignment.update({ where: { id }, data })
}
```

**Schema (OrderAssignment):**
- **HAS `tenantId` field** (`tenant_id UUID`)
- Has index on `tenantId`
- Has unique constraint on `[orderId, employeeId, role]`

**Caller:** `order-assignment-service.ts` line 168 — `update()` calls `repo.update(prisma, tenantId, input.id, data)`. The service does `repo.findByIdSimple(prisma, tenantId, input.id)` before calling update (TOCTOU gap). Return value from `repo.update` is discarded (uses `await`); service re-fetches via `repo.findByIdWithIncludes` afterward.

**Return type:** Currently returns the updated `OrderAssignment` record (from `prisma.orderAssignment.update`). But caller discards it.

**Fix approach:** Use `tenantScopedUpdate(prisma.orderAssignment, { id, tenantId }, data, { entity: "OrderAssignment" })`. Since the caller discards the return value and re-fetches with includes, no include is needed in the helper call.

---

### 3.3 order-booking-repository.ts — `update()` (line 160)

**File:** `src/lib/services/order-booking-repository.ts`

**Current code (lines 154-161):**
```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.orderBooking.update({ where: { id }, data })
}
```

**Schema (OrderBooking):**
- **HAS `tenantId` field** (`tenant_id UUID`)
- Has index on `tenantId`
- No unique compound index that includes `tenantId`

**Caller:** `order-booking-service.ts` line 200 — `update()` calls `await repo.update(prisma, tenantId, input.id, data)`. Return value discarded. Service re-fetches via `repo.findByIdWithInclude` afterward.

**Return type:** Currently returns the updated `OrderBooking` record. Caller discards it.

**Fix approach:** Use `tenantScopedUpdate(prisma.orderBooking, { id, tenantId }, data, { entity: "OrderBooking" })`. No include needed since caller re-fetches.

---

### 3.4 trip-record-repository.ts — `update()` (line 126)

**File:** `src/lib/services/trip-record-repository.ts`

**Current code (lines 120-131):**
```ts
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

**Schema (TripRecord):**
- **HAS `tenantId` field** (`tenant_id UUID`)
- Has index on `tenantId`

**Caller:** `trip-record-service.ts` line 250 — `const record = await repo.update(prisma, tenantId, input.id, data)`. The return value IS used — it's passed to `mapRecord(record!)` and used for audit logging.

**Return type:** Returns `TripRecord` with `tripRecordInclude` (vehicle, vehicleRoute relations). **Caller depends on this.**

**Special considerations:**
- Must preserve the `include: tripRecordInclude` behavior after switching to `updateMany` + refetch
- `updateMany` does not support `include` — must refetch with `findFirst({ where: { id, tenantId }, include: tripRecordInclude })`

**Fix approach:** Use `tenantScopedUpdate(prisma.tripRecord, { id, tenantId }, data, { include: tripRecordInclude, entity: "TripRecord" })`. The helper handles refetch with include.

---

### 3.5 travel-allowance-rule-set-repository.ts — `update()` (line 59)

**File:** `src/lib/services/travel-allowance-rule-set-repository.ts`

**Current code (lines 53-60):**
```ts
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.travelAllowanceRuleSet.update({ where: { id }, data })
}
```

**Schema (TravelAllowanceRuleSet):**
- **HAS `tenantId` field** (`tenant_id UUID`)
- Has index on `tenantId`
- Has unique constraint on `[tenantId, code]`

**Caller:** `travel-allowance-rule-set-service.ts` line 211 — `const updated = (await repo.update(prisma, tenantId, input.id, data))!`. Return value IS used — assigned to `updated`, used for audit logging and as return value.

**Return type:** Returns the updated `TravelAllowanceRuleSet` record. **Caller depends on this.**

**Fix approach:** Use `tenantScopedUpdate(prisma.travelAllowanceRuleSet, { id, tenantId }, data, { entity: "TravelAllowanceRuleSet" })`. No include needed — the model is returned flat. The caller's `!` non-null assertion can be removed since `tenantScopedUpdate` throws on not found.

---

### 3.6 employee-cards-repository.ts — `updateCard()` (line 92)

**File:** `src/lib/services/employee-cards-repository.ts`

**Current code (lines 83-96):**
```ts
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

**Schema (EmployeeCard):**
- **HAS `tenantId` field** (`tenant_id UUID`)
- Has unique constraint on `[tenantId, cardNumber]`
- Has index on `employeeId`

**Caller:** `employee-cards-service.ts` line 186 — `const card = await repo.updateCard(prisma, input.id, { ... })`. Return value IS used — passed to `mapCardToOutput(card)` and for audit logging.

**Note:** The `updateCard` function does NOT accept `tenantId` as a parameter. The caller (`deactivateCard`) does a `repo.findCardByIdAndTenant(prisma, tenantId, input.id)` before calling `updateCard`, but the update itself is unscoped (TOCTOU gap).

**Return type:** Returns the updated `EmployeeCard` record. **Caller depends on this.**

**Fix approach:** Add `tenantId` parameter to `updateCard`. Use `tenantScopedUpdate(prisma.employeeCard, { id: cardId, tenantId }, data as Record<string, unknown>, { entity: "EmployeeCard" })`. Update the caller to pass `tenantId`.

---

### 3.7 employee-messages-repository.ts — `updateRecipientStatus()` (line 166)

**File:** `src/lib/services/employee-messages-repository.ts`

**Current code (lines 156-171):**
```ts
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

**Schema (EmployeeMessageRecipient):**
- **NO `tenantId` field** on `EmployeeMessageRecipient`
- Has `messageId` FK to `EmployeeMessage` (which HAS `tenantId`)
- Has `employeeId` FK to `Employee`
- Indexes on `messageId`, `employeeId`, `status`

**Schema (EmployeeMessage):**
- **HAS `tenantId` field** (`tenant_id UUID`)

**Caller:** `employee-messages-service.ts` lines 228-236 — `sendMessage()` calls `repo.updateRecipientStatus(prisma, tenantId, recipient.id, { ... })`. The `tenantId` is already passed but not used in the update. The `sendMessage()` function already verified the message belongs to the tenant via `repo.findMessageById(prisma, tenantId, messageId)` and iterated through its recipients, so `recipient.id` is transitively tenant-scoped.

**Return type:** Returns `true` (boolean). Caller does not use the return value.

**Special considerations:**
- `EmployeeMessageRecipient` does NOT have a direct `tenantId` column
- Must verify tenant ownership through the relation: `{ id: recipientId, message: { tenantId } }`
- This is the use case for `relationScopedUpdate` from `prisma-helpers.ts`
- **Risk level: LOW** — the caller iterates through recipients of a tenant-verified message, so in practice the recipient IDs are already tenant-scoped

**Fix approach:** Use `relationScopedUpdate(prisma.employeeMessageRecipient, { id: recipientId, message: { tenantId } }, data as Record<string, unknown>, { entity: "EmployeeMessageRecipient" })`. This uses `updateMany` with relation-based where clause. Since return type is `true`, just need to ensure no exception is thrown for valid updates.

---

## 4. Schema Summary

| Model | Has `tenantId`? | Notes |
|-------|----------------|-------|
| `BillingPriceListEntry` | NO | Has `priceListId` FK to `BillingPriceList` (which has `tenantId`) |
| `OrderAssignment` | YES | Direct `tenantId` field |
| `OrderBooking` | YES | Direct `tenantId` field |
| `TripRecord` | YES | Direct `tenantId` field |
| `TravelAllowanceRuleSet` | YES | Direct `tenantId` field |
| `EmployeeCard` | YES | Direct `tenantId` field, unique `[tenantId, cardNumber]` |
| `EmployeeMessageRecipient` | NO | Has `messageId` FK to `EmployeeMessage` (which has `tenantId`) |

---

## 5. Caller Return Value Dependencies

| Repository Method | Caller Uses Return Value? | Needs Include? |
|-------------------|--------------------------|----------------|
| `billing-price-list-repository.upsertEntries` | No (returns `{ created, updated }` counts) | No |
| `order-assignment-repository.update` | No (discarded, re-fetched) | No |
| `order-booking-repository.update` | No (discarded, re-fetched) | No |
| `trip-record-repository.update` | **YES** (used for mapping + audit) | **YES** (`tripRecordInclude`) |
| `travel-allowance-rule-set-repository.update` | **YES** (used for audit + return) | No |
| `employee-cards-repository.updateCard` | **YES** (used for mapping + audit) | No |
| `employee-messages-repository.updateRecipientStatus` | No (returns `true`) | No |

---

## 6. Existing Safe Patterns in the Same Files

Several of these files already use tenant-scoped patterns for other operations:

- **billing-price-list-repository.ts**: `update()` at line 83 uses `updateMany({ where: { id, tenantId } })` correctly. `deleteById` uses `deleteMany({ where: { id, tenantId } })`.
- **order-assignment-repository.ts**: `deleteById` uses `deleteMany({ where: { id, order: { tenantId } } })` (relation-based tenant check).
- **order-booking-repository.ts**: `deleteById` uses `deleteMany({ where: { id, tenantId } })`.
- **trip-record-repository.ts**: `deleteById` uses `deleteMany({ where: { id, tenantId } })`.
- **travel-allowance-rule-set-repository.ts**: `deleteById` uses `deleteMany({ where: { id, tenantId } })`.
- **employee-cards-repository.ts**: `findCardByIdAndTenant` uses `findFirst({ where: { id: cardId, tenantId } })`.
- **employee-messages-repository.ts**: `listMessagesForEmployee` uses `{ message: { tenantId } }` relation-based tenant check.

---

## 7. Fix Strategy Summary

| File | Fix | Helper to Use |
|------|-----|---------------|
| billing-price-list-repository.ts `upsertEntries` | `tx.billingPriceListEntry.updateMany({ where: { id: existing.id, priceListId }, data })` | Manual (no `tenantId` on model) |
| order-assignment-repository.ts `update` | Replace with `tenantScopedUpdate` | `tenantScopedUpdate` |
| order-booking-repository.ts `update` | Replace with `tenantScopedUpdate` | `tenantScopedUpdate` |
| trip-record-repository.ts `update` | Replace with `tenantScopedUpdate` with include | `tenantScopedUpdate` (with `include: tripRecordInclude`) |
| travel-allowance-rule-set-repository.ts `update` | Replace with `tenantScopedUpdate` | `tenantScopedUpdate` |
| employee-cards-repository.ts `updateCard` | Add `tenantId` param, replace with `tenantScopedUpdate` | `tenantScopedUpdate` |
| employee-messages-repository.ts `updateRecipientStatus` | Replace with `relationScopedUpdate` using `{ message: { tenantId } }` | `relationScopedUpdate` |

---

## 8. Imports Needed

For files using `tenantScopedUpdate`:
```ts
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
```

For `employee-messages-repository.ts` using `relationScopedUpdate`:
```ts
import { relationScopedUpdate } from "@/lib/services/prisma-helpers"
```

For `billing-price-list-repository.ts` — no new imports needed (manual updateMany pattern).

---

## 9. Signature Changes Required

### employee-cards-repository.ts `updateCard`

Current:
```ts
export async function updateCard(prisma: PrismaClient, cardId: string, data: { ... })
```

Must change to:
```ts
export async function updateCard(prisma: PrismaClient, tenantId: string, cardId: string, data: { ... })
```

**Caller update needed in `employee-cards-service.ts` line 186:**
```ts
// Current:
const card = await repo.updateCard(prisma, input.id, { ... })
// Must become:
const card = await repo.updateCard(prisma, tenantId, input.id, { ... })
```

### employee-messages-repository.ts `updateRecipientStatus`

Return type changes from `true` (always) to `any` (the refetched record from `relationScopedUpdate`). But caller doesn't use the return value, so no caller changes needed aside from the type. Could also keep the `return true` pattern by manually doing `updateMany` + count check.

---

## 10. Risk Assessment

| File | TOCTOU Gap? | Transitive Scope? | Priority |
|------|-------------|-------------------|----------|
| billing-price-list-repository.ts | Yes (findFirst then update) | Yes (priceListId validated by caller) | Medium |
| order-assignment-repository.ts | Yes (findByIdSimple then update) | No (tenantId available, not used) | **High** |
| order-booking-repository.ts | Yes (findByIdSimple then update) | No (tenantId available, not used) | **High** |
| trip-record-repository.ts | Yes (findByIdSimple then update) | No (tenantId available, not used) | **High** |
| travel-allowance-rule-set-repository.ts | Yes (findById then update) | No (tenantId available, not used) | **High** |
| employee-cards-repository.ts | Yes (findCardByIdAndTenant then updateCard) | No (tenantId not even passed to updateCard) | **High** |
| employee-messages-repository.ts | Yes (findMessageById then updateRecipientStatus) | Yes (iterates recipients of verified message) | Medium |
