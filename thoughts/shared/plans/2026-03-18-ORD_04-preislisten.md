# Implementation Plan: ORD_04 Preislisten (Price Lists)

## Meta
- Ticket: `thoughts/shared/tickets/orgAuftrag/TICKET_ORD_04_PREISLISTEN.md`
- Date: 2026-03-18
- Research: `thoughts/shared/research/2026-03-18-ORD_04-preislisten.md`
- Dependencies: CRM_01 (Addresses), ORD_01 (Billing Documents)

---

## Phase 1: Database & Schema

### Files
- `supabase/migrations/20260101000102_create_billing_price_lists.sql` (CREATE)
- `prisma/schema.prisma` (MODIFY)

### Implementation Details

#### 1a. Supabase Migration

Create `supabase/migrations/20260101000102_create_billing_price_lists.sql`:

```sql
-- ORD_04: Billing Price Lists (Preislisten)

CREATE TABLE billing_price_lists (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT            NOT NULL,
    description     TEXT,
    is_default      BOOLEAN         NOT NULL DEFAULT FALSE,
    valid_from      TIMESTAMPTZ,
    valid_to        TIMESTAMPTZ,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by_id   UUID
);

CREATE INDEX idx_billing_price_lists_tenant_default ON billing_price_lists(tenant_id, is_default);
CREATE INDEX idx_billing_price_lists_tenant_active ON billing_price_lists(tenant_id, is_active);

CREATE TRIGGER set_billing_price_lists_updated_at
  BEFORE UPDATE ON billing_price_lists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE billing_price_list_entries (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    price_list_id   UUID            NOT NULL REFERENCES billing_price_lists(id) ON DELETE CASCADE,
    article_id      UUID,
    item_key        TEXT,
    description     TEXT,
    unit_price      DOUBLE PRECISION NOT NULL,
    min_quantity    DOUBLE PRECISION,
    unit            TEXT,
    valid_from      TIMESTAMPTZ,
    valid_to        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_billing_price_list_entries_list_article ON billing_price_list_entries(price_list_id, article_id);
CREATE INDEX idx_billing_price_list_entries_list_key ON billing_price_list_entries(price_list_id, item_key);

CREATE TRIGGER set_billing_price_list_entries_updated_at
  BEFORE UPDATE ON billing_price_list_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add FK constraint from existing crm_addresses.price_list_id column to billing_price_lists
ALTER TABLE crm_addresses
  ADD CONSTRAINT fk_crm_addresses_price_list
  FOREIGN KEY (price_list_id) REFERENCES billing_price_lists(id) ON DELETE SET NULL;
```

Pattern follows: `20260101000101_create_billing_payments.sql`

#### 1b. Prisma Schema Changes

**In `prisma/schema.prisma`:**

1. **Tenant model** (around line 186): Add `billingPriceLists BillingPriceList[]` after `billingPayments BillingPayment[]`

2. **CrmAddress model** (around line 305): Add relation field `priceList BillingPriceList? @relation(fields: [priceListId], references: [id])` after the existing `priceListId` field area and the other relations. The column `priceListId` already exists at line 290.

3. **New models** (after BillingPayment model, line 803, before UserGroup at line 816):

```prisma
// -----------------------------------------------------------------------------
// BillingPriceList
// -----------------------------------------------------------------------------
// Migration: 000102
model BillingPriceList {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  name        String
  description String?
  isDefault   Boolean  @default(false) @map("is_default")
  validFrom   DateTime? @map("valid_from") @db.Timestamptz(6)
  validTo     DateTime? @map("valid_to") @db.Timestamptz(6)
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById String?  @map("created_by_id") @db.Uuid

  tenant     Tenant                 @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  entries    BillingPriceListEntry[]
  addresses  CrmAddress[]

  @@index([tenantId, isDefault])
  @@index([tenantId, isActive])
  @@map("billing_price_lists")
}

// -----------------------------------------------------------------------------
// BillingPriceListEntry
// -----------------------------------------------------------------------------
// Migration: 000102
model BillingPriceListEntry {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  priceListId String    @map("price_list_id") @db.Uuid
  articleId   String?   @map("article_id") @db.Uuid
  itemKey     String?   @map("item_key")
  description String?
  unitPrice   Float     @map("unit_price")
  minQuantity Float?    @map("min_quantity")
  unit        String?
  validFrom   DateTime? @map("valid_from") @db.Timestamptz(6)
  validTo     DateTime? @map("valid_to") @db.Timestamptz(6)
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  priceList BillingPriceList @relation(fields: [priceListId], references: [id], onDelete: Cascade)

  @@index([priceListId, articleId])
  @@index([priceListId, itemKey])
  @@map("billing_price_list_entries")
}
```

#### 1c. Regenerate Prisma Client

After schema changes, run `pnpm db:generate` to regenerate the Prisma client.

### Verification
```bash
# Apply migration (requires running Supabase)
pnpm db:generate
pnpm typecheck  # Verify schema compiles (ignoring pre-existing errors)
```

---

## Phase 2: Permissions

### Files
- `src/lib/auth/permission-catalog.ts` (MODIFY)

### Implementation Details

Add two new permissions after the "Billing Payments" section (after line 264, before the closing `]`):

```ts
  // Billing Price Lists
  p("billing_price_lists.view", "billing_price_lists", "view", "View price lists"),
  p("billing_price_lists.manage", "billing_price_lists", "manage", "Manage price lists and entries"),
```

Update the comment at line 41 from "All 81 permissions" to "All 83 permissions".

The `p()` function generates deterministic UUIDs via `uuidv5(key, PERMISSION_NAMESPACE)`, so no seed data update is needed -- the UUIDs will be stable. However, admin user groups that use "all permissions" will need to include these new permission IDs. Check if seed data auto-includes all permissions or if it needs manual update.

### Verification
```bash
pnpm typecheck
```

---

## Phase 3: Repository Layer

### Files
- `src/lib/services/billing-price-list-repository.ts` (CREATE)

### Implementation Details

Follow the exact pattern from `src/lib/services/billing-service-case-repository.ts`.

**Include constants:**
```ts
const DETAIL_INCLUDE = {
  entries: true,
  addresses: { select: { id: true, number: true, company: true } },
}

const LIST_INCLUDE = {
  _count: { select: { entries: true, addresses: true } },
}
```

**Repository functions:**

1. `findMany(prisma, tenantId, params: { isActive?, search?, page, pageSize })` — Paginated list with search on `name`/`description`, filtered by `isActive`. Returns `{ items, total }`.

2. `findById(prisma, tenantId, id)` — Single price list with `DETAIL_INCLUDE`.

3. `create(prisma, data)` — Create with `DETAIL_INCLUDE` return.

4. `update(prisma, tenantId, id, data)` — Uses `updateMany` for tenant safety, then `findFirst` for return (same pattern as service cases).

5. `remove(prisma, tenantId, id)` — Uses `deleteMany`, returns boolean.

6. `findDefault(prisma, tenantId)` — Find the default price list (`{ tenantId, isDefault: true, isActive: true }`).

7. `unsetDefault(prisma, tenantId)` — `updateMany({ where: { tenantId, isDefault: true }, data: { isDefault: false } })`.

8. `countAddressesUsing(prisma, tenantId, priceListId)` — Count CRM addresses with this `priceListId`. Used for delete protection.

**Entry functions:**

9. `findEntries(prisma, priceListId, params: { search? })` — All entries for a price list, ordered by `articleId`, `minQuantity`.

10. `createEntry(prisma, data)` — Create entry.

11. `updateEntry(prisma, priceListId, entryId, data)` — Update using `updateMany` on `{ id: entryId, priceListId }` for safety.

12. `removeEntry(prisma, priceListId, entryId)` — Delete using `deleteMany`.

13. `upsertEntries(prisma, priceListId, entries[])` — For bulk import. For each entry: if entry with same `articleId` (or `itemKey`) already exists in the list, update it; otherwise create. Use a transaction.

14. `lookupEntries(prisma, priceListId, articleId?, itemKey?)` — Find matching entries for price lookup, considering validity dates and ordered by `minQuantity DESC`. Filter: `{ priceListId, articleId (or itemKey), validFrom <= now, validTo >= now (or null) }`.

### Verification
```bash
pnpm typecheck
```

---

## Phase 4: Service Layer

### Files
- `src/lib/services/billing-price-list-service.ts` (CREATE)

### Implementation Details

Follow the exact pattern from `src/lib/services/billing-service-case-service.ts`.

**Error classes:**
```ts
export class BillingPriceListNotFoundError extends Error {
  constructor(message = "Price list not found") {
    super(message); this.name = "BillingPriceListNotFoundError"
  }
}
export class BillingPriceListValidationError extends Error {
  constructor(message: string) {
    super(message); this.name = "BillingPriceListValidationError"
  }
}
export class BillingPriceListConflictError extends Error {
  constructor(message: string) {
    super(message); this.name = "BillingPriceListConflictError"
  }
}
```

These will be auto-mapped by `handleServiceError()` in `src/trpc/errors.ts` based on the name suffix.

**Service functions:**

1. `list(prisma, tenantId, params)` — Delegates to `repo.findMany`.

2. `getById(prisma, tenantId, id)` — Finds by ID, throws `NotFoundError` if missing.

3. `create(prisma, tenantId, input, createdById)` — Creates price list. If `isDefault` is true, calls `repo.unsetDefault(prisma, tenantId)` first to ensure only one default per tenant.

4. `update(prisma, tenantId, input: { id, name?, description?, isDefault?, validFrom?, validTo?, isActive? })` — Fetches existing, throws if not found. If `isDefault` changed to true, unset others first.

5. `remove(prisma, tenantId, id)` — Checks existence. Uses `repo.countAddressesUsing()` to verify no CRM addresses reference this price list. If count > 0, throws `BillingPriceListConflictError("Cannot delete price list assigned to X customer(s)")`. Otherwise deletes.

6. `setDefault(prisma, tenantId, id)` — Finds price list, verifies exists. Calls `repo.unsetDefault(tenantId)`, then `repo.update(tenantId, id, { isDefault: true })`.

7. `listEntries(prisma, priceListId, params)` — Verifies price list exists, delegates to `repo.findEntries`.

8. `createEntry(prisma, tenantId, input: { priceListId, articleId?, itemKey?, description?, unitPrice, minQuantity?, unit?, validFrom?, validTo? })` — Verifies price list exists and belongs to tenant. Creates entry.

9. `updateEntry(prisma, tenantId, input: { id, priceListId, ...fields })` — Verifies price list belongs to tenant. Updates entry.

10. `removeEntry(prisma, tenantId, priceListId, entryId)` — Verifies price list belongs to tenant. Removes entry.

11. `bulkImport(prisma, tenantId, priceListId, entries[])` — Verifies price list exists and belongs to tenant. Calls `repo.upsertEntries`. Returns count of created/updated.

12. **`lookupPrice(prisma, tenantId, input: { addressId, articleId?, itemKey?, quantity? })`** — The core algorithm:

```ts
export async function lookupPrice(
  prisma: PrismaClient,
  tenantId: string,
  input: { addressId: string; articleId?: string; itemKey?: string; quantity?: number }
): Promise<{ unitPrice: number; source: string; entryId: string } | null> {
  // 1. Get customer's assigned price list
  const address = await prisma.crmAddress.findFirst({
    where: { id: input.addressId, tenantId },
    select: { priceListId: true },
  })
  if (!address) throw new BillingPriceListValidationError("Address not found")

  // 2. If customer has a price list, try to find matching entry
  if (address.priceListId) {
    const result = await findBestEntry(
      prisma, address.priceListId, input.articleId, input.itemKey, input.quantity
    )
    if (result) return { ...result, source: "customer_list" }
  }

  // 3. Fallback to default price list
  const defaultList = await repo.findDefault(prisma, tenantId)
  if (defaultList) {
    const result = await findBestEntry(
      prisma, defaultList.id, input.articleId, input.itemKey, input.quantity
    )
    if (result) return { ...result, source: "default_list" }
  }

  // 4. No match anywhere
  return null
}

// Helper: Find best matching entry in a price list
async function findBestEntry(
  prisma: PrismaClient,
  priceListId: string,
  articleId?: string,
  itemKey?: string,
  quantity?: number
): Promise<{ unitPrice: number; entryId: string } | null> {
  const entries = await repo.lookupEntries(prisma, priceListId, articleId, itemKey)
  if (entries.length === 0) return null

  // If quantity provided, find best volume price (highest minQuantity that is <= quantity)
  if (quantity != null) {
    const volumeEntries = entries
      .filter(e => e.minQuantity == null || e.minQuantity <= quantity)
      .sort((a, b) => (b.minQuantity ?? 0) - (a.minQuantity ?? 0))
    if (volumeEntries.length > 0) {
      return { unitPrice: volumeEntries[0].unitPrice, entryId: volumeEntries[0].id }
    }
  }

  // No volume pricing or no quantity, return entry with no minQuantity (or lowest)
  const baseEntry = entries.find(e => e.minQuantity == null) ?? entries[0]
  return { unitPrice: baseEntry.unitPrice, entryId: baseEntry.id }
}
```

### Verification
```bash
pnpm typecheck
```

---

## Phase 5: tRPC Router

### Files
- `src/trpc/routers/billing/priceLists.ts` (CREATE)
- `src/trpc/routers/billing/index.ts` (MODIFY)

### Implementation Details

#### 5a. Price Lists Router

Create `src/trpc/routers/billing/priceLists.ts`. Follow exact pattern from `src/trpc/routers/billing/serviceCases.ts`.

**Imports:**
```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as priceListService from "@/lib/services/billing-price-list-service"
import type { PrismaClient } from "@/generated/prisma/client"
```

**Permission constants:**
```ts
const PL_VIEW = permissionIdByKey("billing_price_lists.view")!
const PL_MANAGE = permissionIdByKey("billing_price_lists.manage")!
```

**Base procedure:**
```ts
const billingProcedure = tenantProcedure.use(requireModule("billing"))
```

**UUID pattern** (same relaxed regex as service cases):
```ts
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const uuid = z.string().regex(UUID_RE, "Invalid UUID")
const optionalUuid = uuid.optional()
```

**Input schemas:**

```ts
const listInput = z.object({
  isActive: z.boolean().optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

const createInput = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date().optional(),
})

const updateInput = z.object({
  id: uuid,
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
  validFrom: z.coerce.date().nullable().optional(),
  validTo: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
})

const idInput = z.object({ id: uuid })

const entryListInput = z.object({
  priceListId: uuid,
  search: z.string().optional(),
})

const createEntryInput = z.object({
  priceListId: uuid,
  articleId: optionalUuid,
  itemKey: z.string().optional(),
  description: z.string().optional(),
  unitPrice: z.number(),
  minQuantity: z.number().optional(),
  unit: z.string().optional(),
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date().optional(),
})

const updateEntryInput = z.object({
  id: uuid,
  priceListId: uuid,
  description: z.string().nullable().optional(),
  unitPrice: z.number().optional(),
  minQuantity: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  validFrom: z.coerce.date().nullable().optional(),
  validTo: z.coerce.date().nullable().optional(),
})

const deleteEntryInput = z.object({
  id: uuid,
  priceListId: uuid,
})

const bulkImportInput = z.object({
  priceListId: uuid,
  entries: z.array(z.object({
    articleId: optionalUuid,
    itemKey: z.string().optional(),
    description: z.string().optional(),
    unitPrice: z.number(),
    minQuantity: z.number().optional(),
    unit: z.string().optional(),
  })).min(1),
})

const lookupPriceInput = z.object({
  addressId: uuid,
  articleId: optionalUuid,
  itemKey: z.string().optional(),
  quantity: z.number().optional(),
})
```

**Router definition:**

```ts
export const billingPriceListsRouter = createTRPCRouter({
  // --- Price List CRUD ---
  list: billingProcedure.use(requirePermission(PL_VIEW))
    .input(listInput).query(/* delegates to priceListService.list */),

  getById: billingProcedure.use(requirePermission(PL_VIEW))
    .input(idInput).query(/* delegates to priceListService.getById */),

  create: billingProcedure.use(requirePermission(PL_MANAGE))
    .input(createInput).mutation(/* delegates to priceListService.create */),

  update: billingProcedure.use(requirePermission(PL_MANAGE))
    .input(updateInput).mutation(/* delegates to priceListService.update */),

  delete: billingProcedure.use(requirePermission(PL_MANAGE))
    .input(idInput).mutation(/* delegates to priceListService.remove, returns { success: true } */),

  setDefault: billingProcedure.use(requirePermission(PL_MANAGE))
    .input(idInput).mutation(/* delegates to priceListService.setDefault */),

  // --- Entries sub-router ---
  entries: createTRPCRouter({
    list: billingProcedure.use(requirePermission(PL_VIEW))
      .input(entryListInput).query(/* delegates to priceListService.listEntries */),

    create: billingProcedure.use(requirePermission(PL_MANAGE))
      .input(createEntryInput).mutation(/* delegates to priceListService.createEntry */),

    update: billingProcedure.use(requirePermission(PL_MANAGE))
      .input(updateEntryInput).mutation(/* delegates to priceListService.updateEntry */),

    delete: billingProcedure.use(requirePermission(PL_MANAGE))
      .input(deleteEntryInput).mutation(/* delegates to priceListService.removeEntry */),

    bulkImport: billingProcedure.use(requirePermission(PL_MANAGE))
      .input(bulkImportInput).mutation(/* delegates to priceListService.bulkImport */),
  }),

  // --- Price Lookup ---
  lookupPrice: billingProcedure.use(requirePermission(PL_VIEW))
    .input(lookupPriceInput).query(/* delegates to priceListService.lookupPrice */),
})
```

Every handler follows the try/catch + `handleServiceError` pattern:
```ts
async ({ ctx, input }) => {
  try {
    return await priceListService.someMethod(
      ctx.prisma as unknown as PrismaClient,
      ctx.tenantId!,
      ...args
    )
  } catch (err) {
    handleServiceError(err)
  }
}
```

#### 5b. Register in Billing Router

Modify `src/trpc/routers/billing/index.ts`:

```ts
import { billingPriceListsRouter } from "./priceLists"

export const billingRouter = createTRPCRouter({
  documents: billingDocumentsRouter,
  serviceCases: billingServiceCasesRouter,
  payments: billingPaymentsRouter,
  priceLists: billingPriceListsRouter,   // ADD
})
```

No changes needed in `_app.ts` since `priceLists` is nested inside `billingRouter`.

### Verification
```bash
pnpm typecheck
```

---

## Phase 6: Hooks

### Files
- `src/hooks/use-billing-price-lists.ts` (CREATE)
- `src/hooks/index.ts` (MODIFY)

### Implementation Details

#### 6a. Hooks File

Create `src/hooks/use-billing-price-lists.ts`. Follow exact pattern from `src/hooks/use-billing-service-cases.ts`.

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Billing Price List Hooks ====================

interface UseBillingPriceListsOptions {
  enabled?: boolean
  isActive?: boolean
  search?: string
  page?: number
  pageSize?: number
}

export function useBillingPriceLists(options: UseBillingPriceListsOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.priceLists.list.queryOptions(
      { isActive: input.isActive, search: input.search, page: input.page ?? 1, pageSize: input.pageSize ?? 25 },
      { enabled }
    )
  )
}

export function useBillingPriceList(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.priceLists.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useBillingPriceLookup(input: { addressId: string; articleId?: string; itemKey?: string; quantity?: number }, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.priceLists.lookupPrice.queryOptions(
      input,
      { enabled: enabled && !!input.addressId && !!(input.articleId || input.itemKey) }
    )
  )
}

export function useCreateBillingPriceList() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.priceLists.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.list.queryKey() })
    },
  })
}

export function useUpdateBillingPriceList() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.priceLists.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.getById.queryKey() })
    },
  })
}

export function useDeleteBillingPriceList() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.priceLists.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.list.queryKey() })
    },
  })
}

export function useSetDefaultBillingPriceList() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.priceLists.setDefault.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.getById.queryKey() })
    },
  })
}

// --- Entry Hooks ---

export function useBillingPriceListEntries(priceListId: string, search?: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.priceLists.entries.list.queryOptions(
      { priceListId, search },
      { enabled: enabled && !!priceListId }
    )
  )
}

export function useCreateBillingPriceListEntry() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.priceLists.entries.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.entries.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.getById.queryKey() })
    },
  })
}

export function useUpdateBillingPriceListEntry() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.priceLists.entries.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.entries.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.getById.queryKey() })
    },
  })
}

export function useDeleteBillingPriceListEntry() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.priceLists.entries.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.entries.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.getById.queryKey() })
    },
  })
}

export function useBulkImportBillingPriceListEntries() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.priceLists.entries.bulkImport.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.entries.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.getById.queryKey() })
    },
  })
}
```

#### 6b. Barrel Export

Add to `src/hooks/index.ts` after the "Billing Payments" section (after line 765):

```ts
// Billing Price Lists
export {
  useBillingPriceLists,
  useBillingPriceList,
  useBillingPriceLookup,
  useCreateBillingPriceList,
  useUpdateBillingPriceList,
  useDeleteBillingPriceList,
  useSetDefaultBillingPriceList,
  useBillingPriceListEntries,
  useCreateBillingPriceListEntry,
  useUpdateBillingPriceListEntry,
  useDeleteBillingPriceListEntry,
  useBulkImportBillingPriceListEntries,
} from './use-billing-price-lists'
```

### Verification
```bash
pnpm typecheck
```

---

## Phase 7: UI Components

### Files
- `src/components/billing/price-list-list.tsx` (CREATE)
- `src/components/billing/price-list-form-sheet.tsx` (CREATE)
- `src/components/billing/price-list-detail.tsx` (CREATE)
- `src/components/billing/price-list-entries-table.tsx` (CREATE)
- `src/components/billing/price-list-entry-form-dialog.tsx` (CREATE)
- `src/components/billing/price-list-bulk-import-dialog.tsx` (CREATE)

### Implementation Details

All components follow existing billing component patterns from `src/components/billing/`.

#### 7a. `price-list-list.tsx`

Pattern: `service-case-list.tsx`

- `'use client'` directive
- Uses `useRouter` for navigation, `useBillingPriceLists` hook
- State: `search`, `isActiveFilter`, `page`, `sheetOpen`, `editingItem`
- Layout: Header with title "Preislisten" + "Neue Preisliste" button
- Filter row: Search input, Active toggle/filter
- Table columns: Name, Description, Default (star icon), Valid From, Valid To, Active badge, Entry count
- Click row → navigate to `/orders/price-lists/${id}` (detail page)
- Embed `<PriceListFormSheet>` for create/edit
- Default badge: Star icon (filled yellow for default, outline for others)
- Action: "Als Standard setzen" via dropdown or button, uses `useSetDefaultBillingPriceList`

#### 7b. `price-list-form-sheet.tsx`

Pattern: `service-case-form-sheet.tsx`

- Sheet (side panel) for creating/editing price list metadata
- Fields:
  - `name` (required, text input, id="pl-name")
  - `description` (optional, textarea, id="pl-description")
  - `isDefault` (checkbox, id="pl-is-default")
  - `validFrom` (date picker, id="pl-valid-from")
  - `validTo` (date picker, id="pl-valid-to")
- Uses `useCreateBillingPriceList` or `useUpdateBillingPriceList`
- Success toast: "Preisliste erstellt" / "Preisliste aktualisiert"

#### 7c. `price-list-detail.tsx`

Pattern: `service-case-detail.tsx`

- Uses `useBillingPriceList(id)` hook
- Header: Price list name + badges (Default, Active/Inactive)
- Info section: Description, Valid dates
- Edit button → opens `PriceListFormSheet` in edit mode
- Delete button → confirm dialog → `useDeleteBillingPriceList`. Shows error toast if assigned to customers.
- "Als Standard setzen" button (if not already default)
- Main content: `<PriceListEntriesTable priceListId={id} />`
- Actions row: "Neuer Eintrag" button + "Massenimport" button

#### 7d. `price-list-entries-table.tsx`

Pattern: `document-position-table.tsx` (inline editing)

- Uses `useBillingPriceListEntries(priceListId)` hook
- Table columns: Article/Item Key, Description, Unit Price, Min Quantity, Unit, Valid From, Valid To, Actions
- Inline editing: Click a cell to edit (similar to position table)
- Actions column: Edit (opens dialog), Delete (confirm)
- "Neuer Eintrag" button opens `PriceListEntryFormDialog`
- "Massenimport" button opens `PriceListBulkImportDialog`
- Format currency values as EUR

#### 7e. `price-list-entry-form-dialog.tsx`

Pattern: `payment-form-dialog.tsx`

- Dialog for adding/editing a single price entry
- Fields:
  - Article selector (autocomplete/combobox searching articles, id="entry-article") OR
  - Item Key (text input, id="entry-item-key") — shown when "Freier Eintrag" tab/toggle active
  - Description override (optional, id="entry-description")
  - Unit Price (number input, required, id="entry-unit-price")
  - Min Quantity (number input, optional, id="entry-min-quantity") — for volume pricing
  - Unit (text input, optional, id="entry-unit")
  - Valid From (date picker, id="entry-valid-from")
  - Valid To (date picker, id="entry-valid-to")
- Uses `useCreateBillingPriceListEntry` or `useUpdateBillingPriceListEntry`

#### 7f. `price-list-bulk-import-dialog.tsx`

Pattern: Custom dialog

- Dialog with textarea for CSV paste import
- Expected format: `ArticleId/ItemKey, Description, UnitPrice, MinQuantity, Unit` (tab or semicolon separated)
- Parse button → preview table showing parsed entries
- "Importieren" button → `useBulkImportBillingPriceListEntries`
- Shows success count / error count after import
- Alternative: File upload input for CSV file

### Verification
```bash
pnpm typecheck
pnpm lint
```

---

## Phase 8: Pages & Navigation

### Files
- `src/app/[locale]/(dashboard)/orders/price-lists/page.tsx` (CREATE)
- `src/app/[locale]/(dashboard)/orders/price-lists/[id]/page.tsx` (CREATE)
- `src/components/layout/sidebar/sidebar-nav-config.ts` (MODIFY)
- `messages/de.json` (MODIFY)
- `messages/en.json` (MODIFY)

### Implementation Details

#### 8a. List Page

Create `src/app/[locale]/(dashboard)/orders/price-lists/page.tsx`:

```tsx
import { PriceListList } from "@/components/billing/price-list-list"

export default function BillingPriceListsPage() {
  return <PriceListList />
}
```

#### 8b. Detail Page

Create `src/app/[locale]/(dashboard)/orders/price-lists/[id]/page.tsx`:

```tsx
'use client'

import { useParams } from 'next/navigation'
import { PriceListDetail } from "@/components/billing/price-list-detail"

export default function BillingPriceListDetailPage() {
  const params = useParams<{ id: string }>()
  return (
    <div className="container mx-auto py-6">
      <PriceListDetail id={params.id} />
    </div>
  )
}
```

#### 8c. Sidebar Navigation

Modify `src/components/layout/sidebar/sidebar-nav-config.ts`:

1. Add icon import at the top: `Tag` from `lucide-react` (or `ListOrdered`)
2. Add new item in the billing section items array, after `billingOpenItems` (after line 334):

```ts
{
  titleKey: 'billingPriceLists',
  href: '/orders/price-lists',
  icon: Tag,
  module: 'billing',
  permissions: ['billing_price_lists.view'],
},
```

#### 8d. Translation Keys

**`messages/de.json`** — Add after `billingOpenItems` (around line 113):
```json
"billingPriceLists": "Preislisten",
```

**`messages/en.json`** — Add after `billingOpenItems` (around line 113):
```json
"billingPriceLists": "Price Lists",
```

### Verification
```bash
pnpm typecheck
pnpm dev  # Manual: navigate to /orders/price-lists, verify page loads
```

---

## Phase 9: ORD_01 Integration (Price Lookup in Document Positions)

### Files
- `src/components/billing/document-position-table.tsx` (MODIFY)

### Implementation Details

The price lookup integration happens in the **frontend**, not the backend service. The `addPosition` function in `billing-document-service.ts` accepts `unitPrice` directly — no server-side lookup.

**Integration flow:**

When a user adds an ARTICLE-type position to a billing document:

1. The position row in `document-position-table.tsx` needs an article selector (combobox/autocomplete) for ARTICLE type positions
2. When an article is selected, the frontend calls `billing.priceLists.lookupPrice({ addressId, articleId, quantity })` where `addressId` comes from the parent document
3. If a price is found, pre-fill the `unitPrice` field
4. User can still override the pre-filled price

**Changes to `document-position-table.tsx`:**

1. Accept `addressId` as an additional prop: `interface DocumentPositionTableProps { documentId: string; positions: Position[]; readonly?: boolean; addressId?: string }`
2. Import `useBillingPriceLookup` hook
3. When adding or editing an ARTICLE position and an `articleId` is set, trigger the price lookup
4. If lookup returns a result, set `unitPrice` to the result value
5. Show a small indicator (e.g., tooltip "Preis aus Preisliste: Standardpreisliste") when price was auto-filled

**Changes to document detail page** that renders `DocumentPositionTable`:
- Pass `addressId={document.addressId}` to `DocumentPositionTable`

**Note:** This is a UI enhancement that can be implemented incrementally. The core price list functionality works without this integration. The lookup procedure is already available via the hooks.

### Verification
```bash
pnpm typecheck
# Manual test: Create document for customer with price list → add ARTICLE position → verify price auto-fills
```

---

## Phase 10: Tests

### Files
- `src/lib/services/__tests__/billing-price-list-service.test.ts` (CREATE)
- `src/trpc/routers/__tests__/billingPriceLists-router.test.ts` (CREATE)
- `src/e2e-browser/33-billing-price-lists.spec.ts` (CREATE)

### Implementation Details

#### 10a. Service Unit Tests

Create `src/lib/services/__tests__/billing-price-list-service.test.ts`.

Test the service functions with mocked repository. Test cases:

```ts
describe("billing-price-list-service", () => {
  describe("lookupPrice", () => {
    it("returns customer-specific price when customer has assigned price list")
    it("falls back to default price list when customer has no assigned list")
    it("falls back to default price list when customer list has no matching entry")
    it("returns null if no match in customer list or default list")
    it("respects validity dates (excludes expired entries)")
    it("selects best volume price for given quantity (highest minQuantity <= qty)")
    it("returns base price (no minQuantity) when quantity not provided")
    it("throws validation error when address not found")
  })

  describe("setDefault", () => {
    it("unsets previous default and sets new one")
    it("throws not-found when price list does not exist")
  })

  describe("remove", () => {
    it("deletes price list when not assigned to any customer")
    it("throws conflict error when assigned to customers")
    it("throws not-found when price list does not exist")
  })

  describe("bulkImport", () => {
    it("creates new entries for articles not in list")
    it("updates existing entries when articleId already present")
    it("throws not-found when price list does not exist")
  })

  describe("create", () => {
    it("creates price list and returns it")
    it("unsets other defaults when isDefault=true")
  })
})
```

Use mocked Prisma client pattern (vi.fn() mocks for each model method).

#### 10b. Router Integration Tests

Create `src/trpc/routers/__tests__/billingPriceLists-router.test.ts`.

Follow exact pattern from `billingServiceCases-router.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { billingPriceListsRouter } from "../billing/priceLists"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { createMockContext, createMockSession, createUserWithPermissions, createMockUserTenant } from "./helpers"

// Module mock (required for billing tests)
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "billing" }),
    },
  },
}))

const PL_VIEW = permissionIdByKey("billing_price_lists.view")!
const PL_MANAGE = permissionIdByKey("billing_price_lists.manage")!
const ALL_PERMS = [PL_VIEW, PL_MANAGE]

// ... test context helpers (same pattern as service cases)

describe("billing.priceLists", () => {
  describe("list", () => {
    it("returns paginated list")
    it("requires billing_price_lists.view permission")
    it("requires billing module enabled")
  })

  describe("getById", () => {
    it("returns price list with entries")
    it("throws NOT_FOUND for missing price list")
  })

  describe("create", () => {
    it("creates price list")
    it("requires billing_price_lists.manage permission")
  })

  describe("update", () => {
    it("updates price list fields")
  })

  describe("delete", () => {
    it("deletes price list")
    it("returns CONFLICT when assigned to customers")
  })

  describe("setDefault", () => {
    it("sets price list as default, unsets others")
  })

  describe("entries.create", () => {
    it("adds entry to price list")
    it("requires manage permission")
  })

  describe("entries.bulkImport", () => {
    it("bulk imports entries")
  })

  describe("lookupPrice", () => {
    it("returns correct price for customer with assigned list")
    it("falls back to default list when customer has no list")
    it("returns null when no match found")
  })
})
```

Each test follows the pattern:
1. Set up mock Prisma methods
2. Create caller with test context
3. Call procedure
4. Assert result or error

#### 10c. Browser E2E Tests

Create `src/e2e-browser/33-billing-price-lists.spec.ts`.

Follow exact pattern from `31-billing-service-cases.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test"
import { navigateTo, waitForTableLoad } from "./helpers/nav"
import { fillInput, submitAndWaitForClose, waitForSheet, expectTableContains } from "./helpers/forms"

/**
 * UC-ORD-04: Preislisten -- Praxisbeispiel "Preisliste erstellen und Kunden zuweisen"
 *
 * Follows TERP_HANDBUCH.md section 13.12.1 step-by-step.
 */

const COMPANY = "E2E Preislisten GmbH"
const PRICE_LIST_NAME = "Standardpreisliste"
const PRICE_LIST_DESC = "Preisliste für Standardkunden"

test.describe.serial("UC-ORD-04: Praxisbeispiel Preisliste erstellen und Kunden zuweisen", () => {

  test("Voraussetzung: Kundenadresse anlegen", async ({ page }) => {
    await navigateTo(page, "/crm/addresses")
    await page.getByRole("button", { name: "Neue Adresse" }).click()
    await waitForSheet(page)
    await fillInput(page, "company", COMPANY)
    await fillInput(page, "city", "Berlin")
    await submitAndWaitForClose(page)
    await waitForTableLoad(page)
    await expectTableContains(page, COMPANY)
  })

  test("Schritt 1: Preisliste anlegen", async ({ page }) => {
    // Navigate to price lists
    await navigateTo(page, "/orders/price-lists")

    // Click "Neue Preisliste"
    await page.getByRole("button", { name: "Neue Preisliste" }).click()
    await waitForSheet(page)

    // Fill form
    await page.locator("#pl-name").fill(PRICE_LIST_NAME)
    await page.locator("#pl-description").fill(PRICE_LIST_DESC)
    // Mark as default
    await page.locator("#pl-is-default").click()

    await submitAndWaitForClose(page)
    await waitForTableLoad(page)
    await expectTableContains(page, PRICE_LIST_NAME)
  })

  test("Schritt 2: Preiseinträge hinzufügen", async ({ page }) => {
    // Navigate to the price list detail
    await navigateTo(page, "/orders/price-lists")
    await waitForTableLoad(page)
    const row = page.locator("table tbody tr").filter({ hasText: PRICE_LIST_NAME })
    await row.click()
    await page.waitForURL(/\/orders\/price-lists\/[0-9a-f-]+/)

    // Click "Neuer Eintrag"
    await page.getByRole("button", { name: "Neuer Eintrag" }).click()
    // Fill entry form
    await page.locator("#entry-item-key").fill("beratung_std")
    await page.locator("#entry-description").fill("Beratung pro Stunde")
    await page.locator("#entry-unit-price").fill("120")
    await page.locator("#entry-unit").fill("Std")
    // Submit
    await page.getByRole("button", { name: "Speichern" }).click()

    // Verify entry appears
    await expect(page.getByText("Beratung pro Stunde")).toBeVisible()
    await expect(page.getByText("120")).toBeVisible()
  })

  test("Schritt 3: Preisliste dem Kunden zuweisen", async ({ page }) => {
    // Navigate to CRM address
    await navigateTo(page, "/crm/addresses")
    await waitForTableLoad(page)
    const row = page.locator("table tbody tr").filter({ hasText: COMPANY })
    await row.click()
    await page.waitForURL(/\/crm\/addresses\/[0-9a-f-]+/)

    // Edit address → select price list
    await page.getByRole("button", { name: "Bearbeiten" }).click()
    await waitForSheet(page)
    // Select price list from dropdown
    await page.locator("#address-price-list").click()
    await page.getByRole("option", { name: PRICE_LIST_NAME }).click()
    await submitAndWaitForClose(page)

    // Verify price list assigned
    await expect(page.getByText(PRICE_LIST_NAME)).toBeVisible()
  })

  test("Schritt 4: Preis wird im Beleg vorausgefüllt", async ({ page }) => {
    // Create a document for the customer
    await navigateTo(page, "/orders/documents")
    await page.getByRole("button", { name: "Neuer Beleg" }).click()
    // Fill document form (select customer with price list)
    // ... (implementation depends on existing document form patterns)
    // Add ARTICLE/FREE position → verify unitPrice pre-filled from price list
    // This test validates the ORD_01 integration
  })
})
```

**Note:** The E2E test for Schritt 4 (price auto-fill) depends on Phase 9 integration being complete. If Phase 9 is deferred, this test step can be marked as a TODO.

### Verification
```bash
# Unit tests
pnpm vitest run src/lib/services/__tests__/billing-price-list-service.test.ts

# Router tests
pnpm vitest run src/trpc/routers/__tests__/billingPriceLists-router.test.ts

# E2E browser tests (requires running dev server + Supabase)
pnpm playwright test src/e2e-browser/33-billing-price-lists.spec.ts

# All tests
pnpm test
```

---

## Phase 11: Handbook

### Files
- `docs/TERP_HANDBUCH.md` (MODIFY)

### Implementation Details

Add new section **13.12 Preislisten** before "## 14. Glossar" (before line 5664).

Follow the exact structure of existing sections (13.10 Kundendienst, 13.11 Offene Posten):

```markdown
---

### 13.12 Preislisten

**Was ist es?** Preislisten definieren Preise für Artikel und Freitextpositionen, die Kunden zugewiesen werden können. Das System unterstützt eine Standardpreisliste, kundenspezifische Preislisten und Mengenstaffeln. Beim Anlegen von Belegpositionen wird der Preis automatisch aus der zugewiesenen Preisliste des Kunden vorgeschlagen.

**Wozu dient es?** Einheitliche Preispflege, kundenindividuelle Konditionen und automatische Preisübernahme in Belege -- ohne manuelle Preissuche.

> Modul: **Billing** muss aktiviert sein

> Berechtigung: `billing_price_lists.view` (Anzeige), `billing_price_lists.manage` (Anlegen, Bearbeiten, Löschen)

📍 Aufträge > Preislisten

Sie sehen die Liste aller Preislisten des aktiven Mandanten.

#### Preislistenliste

Tabelle mit Spalten:

| Spalte | Beschreibung |
|--------|-------------|
| **Name** | Name der Preisliste (z.B. "Standardpreisliste", "Großkunde") |
| **Beschreibung** | Optionale Beschreibung |
| **Standard** | Stern-Symbol: ausgefüllt = Standardpreisliste des Mandanten |
| **Gültig von** | Beginn des Gültigkeitszeitraums |
| **Gültig bis** | Ende des Gültigkeitszeitraums |
| **Aktiv** | Aktiv/Inaktiv-Badge |
| **Einträge** | Anzahl der Preiseinträge |

**Suchfeld:** Suche nach Name oder Beschreibung

#### Preisliste anlegen

1. **"Neue Preisliste"** (Preislistenliste, oben rechts)
2. Seitenformular öffnet sich
3. **Name** eintragen (Pflicht)
4. Optionale Felder:
   - **Beschreibung**: Freitext
   - **Standardpreisliste**: Checkbox -- wenn aktiviert, wird diese Preisliste als Fallback für alle Kunden ohne eigene Preisliste verwendet. Pro Mandant kann nur eine Standardpreisliste existieren.
   - **Gültig von / Gültig bis**: Gültigkeitszeitraum der Preisliste
5. **"Speichern"**
6. ✅ Preisliste wird erstellt und erscheint in der Liste

#### Standardpreisliste festlegen

Es kann pro Mandant nur **eine** Standardpreisliste geben. Wenn eine neue Preisliste als Standard gesetzt wird, verliert die bisherige Standardpreisliste diesen Status automatisch.

1. Preisliste in der Liste anklicken → Detailseite
2. **"Als Standard setzen"** klicken
3. ✅ Diese Preisliste wird zur Standardpreisliste (Stern-Symbol wird ausgefüllt)
4. ✅ Die vorherige Standardpreisliste verliert den Standard-Status

**Funktionsweise der Standardpreisliste:**
- Wenn ein Kunde **keine eigene Preisliste** zugewiesen hat, werden Preise aus der Standardpreisliste verwendet
- Wenn ein Kunde eine eigene Preisliste hat, aber dort kein Eintrag für einen bestimmten Artikel existiert, wird ebenfalls die Standardpreisliste als Fallback herangezogen

#### Preiseinträge verwalten

Auf der **Detailseite** einer Preisliste werden die Preiseinträge in einer Tabelle angezeigt:

| Spalte | Beschreibung |
|--------|-------------|
| **Artikel / Schlüssel** | Verknüpfter Artikel oder Freitext-Schlüssel (z.B. "beratung_std") |
| **Beschreibung** | Beschreibungstext (überschreibt Artikelbeschreibung) |
| **Einzelpreis** | Nettopreis pro Einheit in EUR |
| **Ab Menge** | Mengenstaffel: Preis gilt ab dieser Menge (leer = Standardpreis) |
| **Einheit** | Mengeneinheit (Stk, Std, kg, etc.) |
| **Gültig von / bis** | Gültigkeitszeitraum des Eintrags |

##### Eintrag hinzufügen

1. Detailseite der Preisliste: **"Neuer Eintrag"** klicken
2. Dialog öffnet sich
3. Wahlweise:
   - **Artikel** auswählen (Artikelsuche) -- verknüpft den Preis mit einem konkreten Artikel
   - **Schlüssel** eingeben -- für freie Positionen ohne Artikelstamm (z.B. "stundensatz_senior")
4. **Einzelpreis** eintragen (Pflicht, netto in EUR)
5. Optionale Felder:
   - **Beschreibung**: Überschreibt die Artikelbeschreibung
   - **Ab Menge**: Preis gilt erst ab dieser Menge (für Mengenstaffeln)
   - **Einheit**: z.B. Stk, Std, kg
   - **Gültig von / bis**: Zeitraum, in dem dieser Preis gilt
6. **"Speichern"**
7. ✅ Eintrag erscheint in der Tabelle

##### Mengenstaffel

Durch mehrere Einträge für denselben Artikel mit unterschiedlichen **Ab Menge**-Werten können Mengenstaffeln abgebildet werden:

| Artikel | Einzelpreis | Ab Menge |
|---------|------------|----------|
| Schraube M8 | 0,50 EUR | -- (Standardpreis) |
| Schraube M8 | 0,40 EUR | 100 |
| Schraube M8 | 0,30 EUR | 500 |

→ Bei einer Bestellung von 200 Stück wird automatisch 0,40 EUR/Stück vorgeschlagen.

##### Eintrag löschen

Löschsymbol am Zeilenende -- Eintrag wird entfernt.

#### Massenimport

Für die schnelle Erfassung vieler Preiseinträge steht ein Massenimport zur Verfügung:

1. Detailseite der Preisliste: **"Massenimport"** klicken
2. Dialog öffnet sich mit einem Textfeld
3. Einträge im Format einfügen (tabulatorgetrennt oder semikolongetrennt):
   ```
   Schlüssel;Beschreibung;Einzelpreis;Ab Menge;Einheit
   beratung_std;Beratung Standard;120;; Std
   beratung_senior;Beratung Senior;150;;Std
   montage;Montagearbeiten;85;;Std
   ```
4. Klick auf **"Importieren"**
5. ✅ Vorhandene Einträge (gleicher Artikel/Schlüssel) werden aktualisiert, neue werden erstellt
6. ✅ Erfolgsmeldung: "X Einträge importiert, Y aktualisiert"

#### Preisliste einem Kunden zuweisen

Die Zuweisung erfolgt in den **Stammdaten der CRM-Adresse**:

1. 📍 CRM > Adressen → Kunde anklicken
2. **"Bearbeiten"** klicken
3. Feld **"Preisliste"**: Dropdown mit allen aktiven Preislisten des Mandanten
4. Preisliste auswählen
5. **"Speichern"**
6. ✅ Ab sofort werden bei Belegpositionen für diesen Kunden die Preise aus der zugewiesenen Preisliste vorgeschlagen

#### Preisermittlung (Automatische Preisübernahme)

Beim Hinzufügen einer Position zu einem Beleg ermittelt das System den Preis in folgender Reihenfolge:

1. **Kundenspezifische Preisliste** → Kunde hat eine zugewiesene Preisliste? → Eintrag für den Artikel/Schlüssel vorhanden? → Mengenstaffel berücksichtigen → **Preis übernehmen**
2. **Standardpreisliste** → Kein Treffer beim Kunden? → In der Standardpreisliste nachschlagen → **Preis übernehmen**
3. **Kein Treffer** → Der Benutzer gibt den Preis manuell ein

Der vorgeschlagene Preis kann im Beleg jederzeit manuell überschrieben werden.

#### Preisliste löschen

1. Detailseite der Preisliste: **"Löschen"** klicken
2. **Schutz:** Wenn die Preisliste einem oder mehreren Kunden zugewiesen ist, wird das Löschen verweigert mit der Meldung: "Preisliste ist X Kunden zugewiesen und kann nicht gelöscht werden."
3. Preisliste erst von allen Kunden entfernen, dann erneut löschen.

#### 13.12.1 Praxisbeispiel: Preisliste erstellen und Kunden zuweisen

**Szenario:** Sie erstellen eine Standardpreisliste mit Beratungspreisen, weisen sie einem Kunden zu und überprüfen, dass der Preis beim Beleg-Erstellen automatisch vorgeschlagen wird.

##### Schritt 1 -- Preisliste anlegen

1. 📍 Aufträge > Preislisten
2. Klick auf **"Neue Preisliste"** (oben rechts)
3. Seitenformular öffnet sich
4. **Name**: "Standardpreisliste" eintragen
5. **Beschreibung**: "Preisliste für Standardkunden"
6. **Standardpreisliste**: Checkbox aktivieren
7. Klick auf **"Speichern"**
8. ✅ Preisliste "Standardpreisliste" erscheint in der Liste mit ausgefülltem Stern-Symbol (= Standard)

##### Schritt 2 -- Preiseinträge hinzufügen

1. In der Preislistenliste: Klick auf **"Standardpreisliste"**
2. Detailseite öffnet sich
3. Klick auf **"Neuer Eintrag"**
4. Dialog öffnet sich:
   - **Schlüssel**: "beratung_std"
   - **Beschreibung**: "Beratung pro Stunde"
   - **Einzelpreis**: 120,00
   - **Einheit**: "Std"
5. Klick auf **"Speichern"**
6. ✅ Eintrag erscheint in der Tabelle: "Beratung pro Stunde | 120,00 EUR | Std"
7. Erneut **"Neuer Eintrag"** klicken:
   - **Schlüssel**: "fahrtkosten"
   - **Beschreibung**: "Anfahrtspauschale"
   - **Einzelpreis**: 35,00
8. Klick auf **"Speichern"**
9. ✅ Zweiter Eintrag erscheint in der Tabelle

##### Schritt 3 -- Preisliste dem Kunden zuweisen

1. 📍 CRM > Adressen
2. Klick auf **"Mustermann GmbH"** (oder den gewünschten Kunden)
3. Detailseite öffnet sich
4. Klick auf **"Bearbeiten"**
5. Feld **"Preisliste"**: Dropdown öffnen → **"Standardpreisliste"** auswählen
6. Klick auf **"Speichern"**
7. ✅ "Preisliste: Standardpreisliste" wird auf der Detailseite angezeigt

##### Schritt 4 -- Preis wird im Beleg vorausgefüllt

1. 📍 Aufträge > Belege
2. Klick auf **"Neuer Beleg"**
3. **Belegtyp**: "Angebot"
4. **Kundenadresse**: "Mustermann GmbH" auswählen
5. Klick auf **"Speichern"** → Detailseite des neuen Angebots
6. Tab **"Positionen"** → Positionstyp "Freitext" → **"Position hinzufügen"**
7. ✅ Bei der Erfassung eines Artikels oder Schlüssels, der in der Preisliste vorhanden ist, wird der **Einzelpreis automatisch mit 120,00 EUR vorausgefüllt**
8. Der Preis kann manuell überschrieben werden

##### Ergebnis

Die Preisliste ist vollständig eingerichtet:

- **Standardpreisliste** mit zwei Einträgen (Beratung 120 EUR/Std, Anfahrt 35 EUR)
- **Mustermann GmbH** hat die Standardpreisliste zugewiesen
- Bei neuen Belegen für diesen Kunden werden Preise automatisch vorgeschlagen

💡 **Tipp:** Für Großkunden können Sie eine separate Preisliste mit reduzierten Preisen anlegen und diese dem Kunden zuweisen. Die kundenspezifische Preisliste hat immer Vorrang vor der Standardpreisliste.
```

**Also update the Glossary** (section 14) by adding:

```markdown
| **Preisliste** | Liste mit Preisen für Artikel und Freitextpositionen, zuweisbar an Kunden. Standardpreisliste als Fallback. | 📍 Aufträge → Preislisten |
| **Preiseintrag** | Einzelne Preiszeile in einer Preisliste mit Artikel/Schlüssel, Einzelpreis und optionaler Mengenstaffel | 📍 Aufträge → Preislisten → Detail |
| **Mengenstaffel** | Mehrere Preiseinträge für denselben Artikel mit unterschiedlichen Ab-Mengen für mengenabhängige Rabatte | 📍 Aufträge → Preislisten → Detail |
```

**Also update the Anhang: Seitenübersicht** table (after line 5810) by adding:

```markdown
| `/orders/price-lists` | Aufträge → Preislisten | billing_price_lists.view |
| `/orders/price-lists/[id]` | Preislistenliste → Zeile anklicken | billing_price_lists.view |
```

**Also update the Inhaltsverzeichnis** (section at the top) to add `13.12 Preislisten` entry.

### Verification
```bash
# Review the handbook section manually for:
# - Correct section numbering
# - All steps in Praxisbeispiel are clickable/testable
# - Consistent formatting with other sections
# - Glossary entries added
# - Seitenübersicht updated
```

---

## Phase Dependencies

```
Phase 1 (DB & Schema) ─────────────┐
                                     │
Phase 2 (Permissions) ──────────────┤
                                     ├─→ Phase 3 (Repository) ─→ Phase 4 (Service) ─→ Phase 5 (Router)
                                     │                                                       │
                                     │                              Phase 6 (Hooks) ←────────┘
                                     │                                    │
                                     │                              Phase 7 (UI Components)
                                     │                                    │
                                     │                              Phase 8 (Pages & Nav)
                                     │                                    │
                                     │                              Phase 9 (ORD_01 Integration)
                                     │
Phase 10 (Tests) ← depends on Phases 3-8 being complete
Phase 11 (Handbook) ← can be done in parallel after Phase 8
```

**Execution order:**
1. Phase 1 + Phase 2 (parallel)
2. Phase 3
3. Phase 4
4. Phase 5
5. Phase 6
6. Phase 7 + Phase 11 (parallel)
7. Phase 8
8. Phase 9
9. Phase 10

---

## Summary

| Phase | New Files | Modified Files |
|-------|-----------|---------------|
| 1. DB & Schema | 1 (migration) | 1 (schema.prisma) |
| 2. Permissions | 0 | 1 (permission-catalog.ts) |
| 3. Repository | 1 | 0 |
| 4. Service | 1 | 0 |
| 5. Router | 1 | 1 (billing/index.ts) |
| 6. Hooks | 1 | 1 (hooks/index.ts) |
| 7. UI Components | 6 | 0 |
| 8. Pages & Nav | 2 | 3 (sidebar, de.json, en.json) |
| 9. ORD_01 Integration | 0 | 1-2 (position table, document detail) |
| 10. Tests | 3 | 0 |
| 11. Handbook | 0 | 1 (TERP_HANDBUCH.md) |
| **Total** | **16** | **8-9** |
