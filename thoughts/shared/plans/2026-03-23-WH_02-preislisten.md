# WH_02 Implementation Plan -- Preislisten (Article Price Lists)

| Field | Value |
|-------|-------|
| **Ticket** | `thoughts/shared/tickets/orgAuftrag/TICKET_WH_02_PREISLISTEN.md` |
| **Research** | `thoughts/shared/research/2026-03-23-WH_02-preislisten.md` |
| **Dependencies** | WH_01 (Articles), ORD_04 (Price Lists) -- both already implemented |
| **New DB Models** | None -- reuses `BillingPriceList` + `BillingPriceListEntry` from ORD_04 |
| **New Permissions** | None -- reuses `billing_price_lists.view`, `billing_price_lists.manage`, `wh_articles.view` |

---

## Phase 1: Service + Repository Layer

### Files to Create

#### `src/lib/services/wh-article-price-service.ts`

Combined service file (no separate repository file needed -- this module does not own its own DB models; it cross-queries existing `BillingPriceList`, `BillingPriceListEntry`, and `WhArticle` models).

**Pattern reference:** `src/lib/services/wh-article-service.ts` (error classes, function signatures, audit logging pattern)

**Error classes:**
```ts
export class WhArticlePriceNotFoundError extends Error {
  constructor(message = "Price entry not found") {
    super(message); this.name = "WhArticlePriceNotFoundError"
  }
}

export class WhArticlePriceValidationError extends Error {
  constructor(message: string) {
    super(message); this.name = "WhArticlePriceValidationError"
  }
}
```

These follow the `handleServiceError` naming convention in `src/trpc/errors.ts` (line 17: class name ending in `NotFoundError` maps to `NOT_FOUND`; ending in `ValidationError` maps to `BAD_REQUEST`).

**Service functions (7 total):**

| Function | Signature | Logic |
|----------|-----------|-------|
| `listByArticle` | `(prisma, tenantId, articleId)` | 1. Verify article exists via `prisma.whArticle.findFirst({ where: { id: articleId, tenantId } })`. Throw `WhArticlePriceNotFoundError("Article not found")` if null. 2. Find all `BillingPriceListEntry` records where `articleId` matches, joined with `BillingPriceList` (via `priceList` relation), filtered by `priceList.tenantId === tenantId`. Return entries with price list name, validity dates, etc. |
| `listByPriceList` | `(prisma, tenantId, priceListId, params: { search? })` | 1. Verify price list exists via `prisma.billingPriceList.findFirst({ where: { id: priceListId, tenantId } })`. Throw `WhArticlePriceNotFoundError("Price list not found")` if null. 2. Find all `BillingPriceListEntry` records for this priceListId that have an `articleId` (non-null). 3. For each entry, join the `WhArticle` data (number, name, unit) via a separate query or raw lookup (no Prisma relation exists). 4. If `search` is provided, filter by article name/number. Return array with article info + price info. |
| `setPrice` | `(prisma, tenantId, input: { priceListId, articleId, unitPrice, minQuantity?, unit? }, audit?)` | 1. Verify price list belongs to tenant. 2. Verify article belongs to tenant. 3. Upsert: find existing entry by `(priceListId, articleId, minQuantity)`. If exists, update `unitPrice` and `unit`. If not, create new `BillingPriceListEntry`. 4. Audit log with `entityType: "wh_article_price"`. |
| `removePrice` | `(prisma, tenantId, input: { priceListId, articleId }, audit?)` | 1. Verify price list belongs to tenant. 2. Delete all `BillingPriceListEntry` records matching `(priceListId, articleId)`. Use `deleteMany` to handle volume pricing (multiple entries per article). 3. Throw `WhArticlePriceNotFoundError` if count === 0. |
| `bulkSetPrices` | `(prisma, tenantId, priceListId, entries: Array<{ articleId, unitPrice, minQuantity? }>, audit?)` | 1. Verify price list belongs to tenant. 2. Use `prisma.$transaction` to upsert each entry (same logic as `setPrice` but in a loop). 3. Return `{ created, updated }` counts. Pattern reference: `billing-price-list-repository.ts` line 207-265 (`upsertEntries`). |
| `copyPriceList` | `(prisma, tenantId, input: { sourceId, targetId, overwrite? }, audit?)` | 1. Verify both source and target price lists belong to tenant. 2. Fetch all entries from source where `articleId IS NOT NULL`. 3. In a `$transaction`: if `overwrite=true`, delete all article-based entries in target, then insert all source entries. If `overwrite=false`, skip entries where `(targetId, articleId)` already exists. 4. Return `{ copied, skipped }` counts. |
| `adjustPrices` | `(prisma, tenantId, input: { priceListId, adjustmentPercent, articleGroupId? }, audit?)` | 1. Verify price list belongs to tenant. 2. Build entry filter: `priceListId`, `articleId IS NOT NULL`. 3. If `articleGroupId` provided, first find all article IDs in that group (`prisma.whArticle.findMany({ where: { tenantId, groupId: articleGroupId }, select: { id: true } })`), then filter entries to those articleIds. 4. For each matching entry, update `unitPrice = Math.round(unitPrice * (1 + adjustmentPercent / 100) * 100) / 100`. Use `$transaction` for atomicity. 5. Return `{ adjustedCount }`. |

**Tenant isolation approach for each function:**
- `listByArticle`: Verify article ownership via `{ id, tenantId }`, then query entries via `priceList: { tenantId }` join.
- `listByPriceList`: Verify price list ownership via `{ id, tenantId }`, then query entries by `priceListId` (tenant already verified via parent).
- `setPrice`: Verify both price list AND article ownership before creating/updating entry.
- `removePrice`: Verify price list ownership, then delete by `(priceListId, articleId)`.
- `bulkSetPrices`: Verify price list ownership, then verify all articleIds belong to tenant before upserting.
- `copyPriceList`: Verify both source and target price list ownership.
- `adjustPrices`: Verify price list ownership, optionally verify articleGroupId belongs to tenant.

**Imports:**
```ts
import type { PrismaClient } from "@/generated/prisma/client"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
```

### Verification

```bash
pnpm vitest run src/lib/services/__tests__/wh-article-price-service.test.ts
```

---

## Phase 2: tRPC Router

### Files to Create

#### `src/trpc/routers/warehouse/articlePrices.ts`

**Pattern reference:** `src/trpc/routers/warehouse/articles.ts`

**Structure:**
```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as whArticlePriceService from "@/lib/services/wh-article-price-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const WH_VIEW = permissionIdByKey("wh_articles.view")!
const PL_VIEW = permissionIdByKey("billing_price_lists.view")!
const PL_MANAGE = permissionIdByKey("billing_price_lists.manage")!

// --- Base procedure with module guard ---
const whProcedure = tenantProcedure.use(requireModule("warehouse"))
```

**Procedures (7):**

| Procedure | Type | Permission | Input Schema |
|-----------|------|-----------|--------------|
| `listByArticle` | query | `WH_VIEW` | `z.object({ articleId: z.string().uuid() })` |
| `listByPriceList` | query | `PL_VIEW` | `z.object({ priceListId: z.string().uuid(), search: z.string().max(255).optional() })` |
| `setPrice` | mutation | `PL_MANAGE` | `z.object({ priceListId: z.string().uuid(), articleId: z.string().uuid(), unitPrice: z.number().min(0), minQuantity: z.number().min(0).optional(), unit: z.string().optional() })` |
| `removePrice` | mutation | `PL_MANAGE` | `z.object({ priceListId: z.string().uuid(), articleId: z.string().uuid() })` |
| `bulkSetPrices` | mutation | `PL_MANAGE` | `z.object({ priceListId: z.string().uuid(), entries: z.array(z.object({ articleId: z.string().uuid(), unitPrice: z.number().min(0), minQuantity: z.number().min(0).optional() })).min(1).max(500) })` |
| `copyPriceList` | mutation | `PL_MANAGE` | `z.object({ sourceId: z.string().uuid(), targetId: z.string().uuid(), overwrite: z.boolean().optional().default(false) })` |
| `adjustPrices` | mutation | `PL_MANAGE` | `z.object({ priceListId: z.string().uuid(), adjustmentPercent: z.number().min(-99).max(999), articleGroupId: z.string().uuid().optional() })` |

Each procedure follows the same pattern:
```ts
.query(async ({ ctx, input }) => {
  try {
    return await whArticlePriceService.functionName(
      ctx.prisma as unknown as PrismaClient,
      ctx.tenantId!,
      ...args
    )
  } catch (err) {
    handleServiceError(err)
  }
})
```

Mutation procedures pass audit context:
```ts
{
  userId: ctx.user!.id,
  ipAddress: ctx.ipAddress,
  userAgent: ctx.userAgent,
}
```

### Files to Modify

#### `src/trpc/routers/warehouse/index.ts`

Add import and register the new sub-router:

```ts
import { createTRPCRouter } from "@/trpc/init"
import { whArticlesRouter } from "./articles"
import { whArticlePricesRouter } from "./articlePrices"

export const warehouseRouter = createTRPCRouter({
  articles: whArticlesRouter,
  articlePrices: whArticlePricesRouter,
})
```

No changes to `src/trpc/routers/_app.ts` needed (warehouse router is already registered there at line 161).

### Verification

```bash
pnpm vitest run src/trpc/routers/__tests__/whArticlePrices-router.test.ts
pnpm typecheck
```

---

## Phase 3: Tests

### Files to Create

#### `src/lib/services/__tests__/wh-article-price-service.test.ts`

**Pattern reference:** `src/lib/services/__tests__/wh-article-service.test.ts`

**Constants:**
```ts
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const OTHER_TENANT_ID = "ff000000-0000-4000-a000-000000000999"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ARTICLE_ID = "b1000000-0000-4000-a000-000000000001"
const ARTICLE_ID_2 = "b1000000-0000-4000-a000-000000000002"
const PRICE_LIST_ID = "pl000000-0000-4000-a000-000000000001"
const PRICE_LIST_ID_2 = "pl000000-0000-4000-a000-000000000002"
const ENTRY_ID = "en000000-0000-4000-a000-000000000001"
```

**Mock data:**
```ts
const mockPriceList = {
  id: PRICE_LIST_ID,
  tenantId: TENANT_ID,
  name: "Standard Price List",
  isDefault: true,
  isActive: true,
  ...
}

const mockArticle = {
  id: ARTICLE_ID,
  tenantId: TENANT_ID,
  number: "ART-1",
  name: "Test Article",
  ...
}

const mockEntry = {
  id: ENTRY_ID,
  priceListId: PRICE_LIST_ID,
  articleId: ARTICLE_ID,
  unitPrice: 99.99,
  minQuantity: null,
  unit: "Stk",
  ...
}
```

**`createMockPrisma` helper:** Must mock `billingPriceList`, `billingPriceListEntry`, `whArticle`, `auditLog` models.

**Test blocks:**

```
describe("wh-article-price-service", () => {
  describe("listByArticle", () => {
    it("returns entries across all price lists for an article")
    it("throws WhArticlePriceNotFoundError if article not found")
  })

  describe("listByPriceList", () => {
    it("returns article entries in a price list")
    it("throws WhArticlePriceNotFoundError if price list not found")
    it("filters by search term")
  })

  describe("setPrice", () => {
    it("creates entry if not exists")
    it("updates entry if exists (same articleId + minQuantity)")
    it("throws if price list not found")
    it("throws if article not found")
  })

  describe("removePrice", () => {
    it("removes all entries for article in price list")
    it("throws WhArticlePriceNotFoundError if no entries found")
  })

  describe("bulkSetPrices", () => {
    it("upserts multiple entries in a transaction")
    it("returns created and updated counts")
  })

  describe("copyPriceList", () => {
    it("copies all entries from source to target")
    it("with overwrite=false skips existing entries")
    it("with overwrite=true replaces existing entries")
  })

  describe("adjustPrices", () => {
    it("adjusts by positive percentage (+5%)")
    it("adjusts by negative percentage (-3%)")
    it("filters by article group when articleGroupId provided")
    it("rounds adjusted prices to 2 decimal places")
  })

  // =========================================================================
  // TENANT ISOLATION TESTS
  // =========================================================================
  describe("tenant isolation", () => {
    it("listByArticle rejects article from another tenant")
    it("listByPriceList rejects price list from another tenant")
    it("setPrice rejects price list from another tenant")
    it("setPrice rejects article from another tenant")
    it("removePrice rejects price list from another tenant")
    it("copyPriceList rejects source from another tenant")
    it("copyPriceList rejects target from another tenant")
    it("adjustPrices rejects price list from another tenant")
  })
})
```

Each tenant isolation test mocks the relevant `findFirst` to return `null` for the `OTHER_TENANT_ID` and asserts the appropriate `NotFoundError` is thrown.

#### `src/trpc/routers/__tests__/whArticlePrices-router.test.ts`

**Pattern reference:** `src/trpc/routers/__tests__/whArticles-router.test.ts`

**Key setup:**
```ts
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "warehouse" }),
    },
  },
}))

const createCaller = createCallerFactory(whArticlePricesRouter)

// withModuleMock helper (same pattern as whArticles-router.test.ts)
// createTestContext helper (same pattern, with PL_VIEW + PL_MANAGE + WH_VIEW permissions)
```

**Test blocks:**
```
describe("warehouse.articlePrices", () => {
  describe("listByArticle", () => {
    it("returns entries for article")
    it("rejects without wh_articles.view permission")
    it("rejects when warehouse module not enabled")
  })

  describe("listByPriceList", () => {
    it("returns articles with prices")
    it("rejects without billing_price_lists.view permission")
  })

  describe("setPrice", () => {
    it("creates/updates price entry")
    it("rejects without billing_price_lists.manage permission")
  })

  describe("removePrice", () => {
    it("removes price entry")
  })

  describe("bulkSetPrices", () => {
    it("upserts multiple entries")
  })

  describe("adjustPrices", () => {
    it("bulk adjusts by percentage")
  })

  describe("copyPriceList", () => {
    it("copies entries between lists")
  })
})
```

### Verification

```bash
pnpm vitest run src/lib/services/__tests__/wh-article-price-service.test.ts
pnpm vitest run src/trpc/routers/__tests__/whArticlePrices-router.test.ts
```

---

## Phase 4: Hooks

### Files to Create

#### `src/hooks/use-wh-article-prices.ts`

**Pattern reference:** `src/hooks/use-wh-articles.ts`

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// --- Query Hooks ---

export function useWhArticlePrices(articleId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.articlePrices.listByArticle.queryOptions(
      { articleId },
      { enabled: enabled && !!articleId }
    )
  )
}

export function useWhPriceListArticles(priceListId: string, search?: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.articlePrices.listByPriceList.queryOptions(
      { priceListId, search },
      { enabled: enabled && !!priceListId }
    )
  )
}

// --- Mutation Hooks ---

export function useSetWhArticlePrice() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articlePrices.setPrice.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.articlePrices.listByArticle.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.articlePrices.listByPriceList.queryKey() })
    },
  })
}

export function useRemoveWhArticlePrice() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articlePrices.removePrice.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.articlePrices.listByArticle.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.articlePrices.listByPriceList.queryKey() })
    },
  })
}

export function useBulkSetWhArticlePrices() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articlePrices.bulkSetPrices.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.articlePrices.listByPriceList.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.articlePrices.listByArticle.queryKey() })
    },
  })
}

export function useCopyWhPriceList() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articlePrices.copyPriceList.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.articlePrices.listByPriceList.queryKey() })
    },
  })
}

export function useAdjustWhPrices() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articlePrices.adjustPrices.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.articlePrices.listByPriceList.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.articlePrices.listByArticle.queryKey() })
    },
  })
}
```

### Files to Modify

#### `src/hooks/index.ts`

Add exports after the existing Warehouse Articles block (after line 840):

```ts
// Warehouse Article Prices
export {
  useWhArticlePrices,
  useWhPriceListArticles,
  useSetWhArticlePrice,
  useRemoveWhArticlePrice,
  useBulkSetWhArticlePrices,
  useCopyWhPriceList,
  useAdjustWhPrices,
} from './use-wh-article-prices'
```

### Verification

```bash
pnpm typecheck
```

### Dependencies

- Phase 2 (router must exist for hooks to reference tRPC paths)

---

## Phase 5: UI Components

### Files to Create

All in `src/components/warehouse/`:

#### 1. `price-list-selector.tsx` -- Left Panel

**Purpose:** Vertical list of all price lists. Click to select. Shows "Default" badge on the default list. Uses existing `useBillingPriceLists` hook from `src/hooks/use-billing-price-lists.ts` (already exists via billing module).

**Key elements:**
- Scrollable list of cards/items
- Selected state with highlight
- Show `name`, `isDefault` badge, entry count via `_count.entries`
- Import `useBillingPriceLists` from `@/hooks` (reuse existing billing hook that calls `billing.priceLists.list`)

**Pattern reference:** `src/components/warehouse/article-group-tree.tsx` (sidebar-style selection component)

#### 2. `price-list-articles-table.tsx` -- Middle Panel

**Purpose:** Table showing articles in the selected price list. Columns: Article Number, Article Name, Unit Price, Unit, Min Qty. Searchable.

**Key elements:**
- Uses `useWhPriceListArticles(priceListId, search)` hook
- SearchInput at top
- Table with columns (shadcn `Table` component)
- Click row to select article (triggers right panel)
- Empty state when no price list selected or no entries
- "Add Article" button that opens article search popover (reuse `ArticleSearchPopover` from WH_01)

#### 3. `price-detail-editor.tsx` -- Right Panel

**Purpose:** Inline editing of the selected article's price in the selected price list. Shows article info (number, name, description) and editable fields: unitPrice, minQuantity, unit.

**Key elements:**
- Uses `useSetWhArticlePrice()` mutation hook
- Uses `useRemoveWhArticlePrice()` mutation hook
- Form fields: unitPrice (number input), minQuantity (optional number), unit (text)
- Save/Cancel buttons
- Delete button to remove from price list
- Shows article base price (sellPrice from WhArticle) as reference

#### 4. `price-management.tsx` -- Three-Panel Layout (Main Component)

**Purpose:** Orchestrates three panels. Manages selected price list ID and selected article ID state.

**Layout:**
```tsx
<div className="flex gap-4 h-[calc(100vh-12rem)]">
  {/* Left: Price list selector — w-64 shrink-0 */}
  <div className="w-64 shrink-0">
    <PriceListSelector
      selectedId={selectedPriceListId}
      onSelect={setSelectedPriceListId}
    />
  </div>

  {/* Middle: Articles table — flex-1 */}
  <div className="flex-1 min-w-0">
    <PriceListArticlesTable
      priceListId={selectedPriceListId}
      selectedArticleId={selectedArticleId}
      onSelectArticle={setSelectedArticleId}
    />
  </div>

  {/* Right: Price detail editor — w-80 shrink-0 */}
  <div className="w-80 shrink-0">
    <PriceDetailEditor
      priceListId={selectedPriceListId}
      articleId={selectedArticleId}
    />
  </div>
</div>
```

**Toolbar buttons:**
- "Preise anpassen" (Adjust Prices) -- opens `PriceBulkAdjustDialog`
- "Preisliste kopieren" (Copy Price List) -- opens `PriceCopyDialog`

**Pattern reference:** The articles page uses `<div className="flex gap-6">` with `w-64 shrink-0` for the left panel -- follow same approach but with 3 panels.

#### 5. `price-bulk-adjust-dialog.tsx`

**Purpose:** Dialog for bulk price adjustment. Fields: percentage input (+/- number), optional article group filter (dropdown from `useWhArticleGroups()`). Shows preview of affected entry count before confirming.

**Key elements:**
- Uses `useAdjustWhPrices()` mutation hook
- `adjustmentPercent` number input (allow negative)
- Optional `articleGroupId` select (populated from `useWhArticleGroups()`)
- Preview count: query entries to count affected before confirming
- Confirm/Cancel buttons
- Success toast via `sonner`

#### 6. `price-copy-dialog.tsx`

**Purpose:** Dialog to copy all article entries from one price list to another. Source is pre-selected (current price list). Target is a dropdown of other price lists. Overwrite toggle.

**Key elements:**
- Uses `useCopyWhPriceList()` mutation hook
- Source label (read-only, shows current price list name)
- Target select (dropdown of price lists, filtered to exclude source)
- Overwrite checkbox/switch
- Confirm/Cancel buttons
- Success toast showing `{ copied, skipped }` counts

#### 7. `article-price-tab.tsx`

**Purpose:** Component for the article detail page "Prices" tab. Shows a table of all price list entries for the current article across all price lists.

**Key elements:**
- Uses `useWhArticlePrices(articleId)` hook
- Table columns: Price List Name, Unit Price, Min Quantity, Unit, Valid From, Valid To
- Empty state: "Keine Preislisteneinträge" / "No price list entries"
- No inline editing (view-only, with link to the price management page)

**Integration point:** This component will be added as a new tab in the article detail page. The article detail page is at `src/app/[locale]/(dashboard)/warehouse/articles/[id]/page.tsx` (if exists) or in the article detail component. Need to add a "Preise" / "Prices" tab that renders `<ArticlePriceTab articleId={article.id} />`.

### Page Route to Create

#### `src/app/[locale]/(dashboard)/warehouse/prices/page.tsx`

```tsx
'use client'

import { useHasPermission } from '@/hooks'
import { PriceManagement } from '@/components/warehouse/price-management'

export default function WhPricesPage() {
  const { allowed: canViewPrices } = useHasPermission(['billing_price_lists.view'])
  const { allowed: canViewArticles } = useHasPermission(['wh_articles.view'])

  if (canViewPrices === false || canViewArticles === false) {
    return <div className="p-6">Insufficient permissions</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Preislisten</h1>
        {/* Toolbar: adjust + copy buttons */}
      </div>
      <PriceManagement />
    </div>
  )
}
```

### Files to Modify

The article detail page needs a new "Preise" tab. Identify the article detail component (likely `src/components/warehouse/article-detail.tsx` or the article detail page) and add:

```tsx
import { ArticlePriceTab } from '@/components/warehouse/article-price-tab'

// In the tabs section:
<TabsTrigger value="prices">Preise</TabsTrigger>
<TabsContent value="prices">
  <ArticlePriceTab articleId={article.id} />
</TabsContent>
```

### Verification

```bash
pnpm typecheck
pnpm dev  # Manual verification: navigate to /warehouse/prices
```

### Dependencies

- Phase 4 (hooks must exist)
- Phase 2 (router must exist)

---

## Phase 6: i18n + Navigation

### Files to Modify

#### `messages/en.json`

In the `"nav"` section (around line 120), add after `"warehouseArticles"`:

```json
"warehousePriceLists": "Price Lists",
```

Additionally, add a new `"warehousePrices"` section for UI strings (or add under an existing warehouse section):

```json
"warehousePrices": {
  "title": "Price Lists",
  "selectPriceList": "Select a price list",
  "noEntries": "No price entries",
  "addArticle": "Add Article",
  "removeArticle": "Remove Article",
  "unitPrice": "Unit Price",
  "minQuantity": "Min Quantity",
  "unit": "Unit",
  "adjustPrices": "Adjust Prices",
  "adjustPricesDescription": "Adjust all prices in this price list by a percentage",
  "adjustmentPercent": "Adjustment (%)",
  "filterByGroup": "Filter by article group",
  "allGroups": "All groups",
  "copyPriceList": "Copy Price List",
  "copyFrom": "Copy from",
  "copyTo": "Copy to",
  "overwriteExisting": "Overwrite existing entries",
  "pricesAdjusted": "Prices adjusted successfully",
  "pricesCopied": "Price list copied successfully",
  "priceSaved": "Price saved",
  "priceRemoved": "Price removed",
  "articlePricesTab": "Prices",
  "noPriceListEntries": "No price list entries for this article",
  "priceListName": "Price List",
  "basePrice": "Base Price (Article)",
  "preview": "Preview",
  "affectedEntries": "Affected entries"
}
```

#### `messages/de.json`

In the `"nav"` section (around line 120), add after `"warehouseArticles"`:

```json
"warehousePriceLists": "Preislisten",
```

Add matching `"warehousePrices"` section:

```json
"warehousePrices": {
  "title": "Preislisten",
  "selectPriceList": "Preisliste auswählen",
  "noEntries": "Keine Preiseinträge",
  "addArticle": "Artikel hinzufügen",
  "removeArticle": "Artikel entfernen",
  "unitPrice": "Einzelpreis",
  "minQuantity": "Mindestmenge",
  "unit": "Einheit",
  "adjustPrices": "Preise anpassen",
  "adjustPricesDescription": "Alle Preise in dieser Preisliste prozentual anpassen",
  "adjustmentPercent": "Anpassung (%)",
  "filterByGroup": "Nach Artikelgruppe filtern",
  "allGroups": "Alle Gruppen",
  "copyPriceList": "Preisliste kopieren",
  "copyFrom": "Kopieren von",
  "copyTo": "Kopieren nach",
  "overwriteExisting": "Bestehende Einträge überschreiben",
  "pricesAdjusted": "Preise erfolgreich angepasst",
  "pricesCopied": "Preisliste erfolgreich kopiert",
  "priceSaved": "Preis gespeichert",
  "priceRemoved": "Preis entfernt",
  "articlePricesTab": "Preise",
  "noPriceListEntries": "Keine Preislisteneinträge für diesen Artikel",
  "priceListName": "Preisliste",
  "basePrice": "Basispreis (Artikel)",
  "preview": "Vorschau",
  "affectedEntries": "Betroffene Einträge"
}
```

#### `src/components/layout/sidebar/sidebar-nav-config.ts`

Add new item in the warehouse section (after the `warehouseArticles` entry, around line 377):

```ts
{
  titleKey: 'warehousePriceLists',
  href: '/warehouse/prices',
  icon: Tag,
  module: 'warehouse',
  permissions: ['billing_price_lists.view'],
},
```

`Tag` is already imported at line 45 of this file.

### Verification

```bash
pnpm typecheck
pnpm dev  # Verify sidebar shows "Preislisten" under Warehouse section
```

### Dependencies

- None (can be done independently, but best done after Phase 5 so the page exists)

---

## Phase 7: E2E Tests

### Files to Create

#### `src/e2e-browser/41-wh-prices.spec.ts`

**Pattern reference:** `src/e2e-browser/40-wh-articles.spec.ts`

**Prerequisites:** The WH_01 E2E tests (40-wh-articles.spec.ts) must have already created articles and enabled the warehouse module. The billing price lists E2E tests (or seed data) must provide at least one price list.

**Structure:**

```ts
import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad, expectPageTitle } from "./helpers/nav";
import {
  fillInput,
  submitAndWaitForClose,
  waitForSheet,
  expectTableContains,
  expectTableNotContains,
  openRowActions,
  clickMenuItem,
  clickTab,
} from "./helpers/forms";

// --- Constants ---
const PRICE_LIST_NAME = "Standard"; // From seed data or create in test
const ARTICLE_NAME = "E2E Testschraube M8x40"; // From 40-wh-articles.spec.ts

test.describe.serial("UC-WH-02: Article Price Lists", () => {
  test("navigate to price lists page", async ({ page }) => {
    await navigateTo(page, "/warehouse/prices");
    // Verify page loads
    const main = page.locator("main#main-content");
    await expect(main.getByText("Preislisten")).toBeVisible({ timeout: 10_000 });
  });

  test("select a price list", async ({ page }) => {
    await navigateTo(page, "/warehouse/prices");
    const main = page.locator("main#main-content");
    // Click on a price list in the left panel
    // Verify middle panel shows articles (or empty state)
  });

  test("set price for article in price list", async ({ page }) => {
    await navigateTo(page, "/warehouse/prices");
    const main = page.locator("main#main-content");
    // Select price list
    // Click "Add Article" or find article in middle panel
    // Set unit price
    // Save
    // Verify price appears in table
  });

  test("view prices on article detail page", async ({ page }) => {
    // Navigate to article detail page
    await navigateTo(page, "/warehouse/articles");
    // Find and click the article
    // Click "Preise" tab
    // Verify the price list entry created above is visible
  });

  test("bulk adjust prices by percentage", async ({ page }) => {
    await navigateTo(page, "/warehouse/prices");
    const main = page.locator("main#main-content");
    // Select price list
    // Click "Preise anpassen" button
    // Enter +10% in the dialog
    // Confirm
    // Verify prices updated in table
  });

  test("remove article from price list", async ({ page }) => {
    await navigateTo(page, "/warehouse/prices");
    const main = page.locator("main#main-content");
    // Select price list
    // Select article
    // Click remove/delete
    // Verify article no longer in table
  });
});
```

### Global Setup Modification

#### `src/e2e-browser/global-setup.ts`

May need to add cleanup for E2E price entries. Check if the existing cleanup already handles `billing_price_list_entries` or if WH_02-specific test data needs cleanup.

Add after the existing WH article cleanup:

```ts
// Clean WH_02 price test data
await client.query(`
  DELETE FROM billing_price_list_entries
  WHERE article_id IN (
    SELECT id FROM wh_articles WHERE name LIKE 'E2E %'
  )
`);
```

### Verification

```bash
pnpm exec playwright test src/e2e-browser/41-wh-prices.spec.ts --headed
```

### Dependencies

- All previous phases (1-6)
- WH_01 E2E tests must have run first (serial ordering via filename prefix `41-`)

---

## Implementation Order and Checkpoints

### Order

1. **Phase 1** (Service) -- no dependencies, pure backend logic
2. **Phase 2** (Router) -- depends on Phase 1
3. **Phase 3** (Tests) -- depends on Phases 1+2, run to verify backend is correct
4. **Phase 4** (Hooks) -- depends on Phase 2
5. **Phase 6** (i18n + Navigation) -- can be done in parallel with Phase 5
6. **Phase 5** (UI Components) -- depends on Phases 4+6
7. **Phase 7** (E2E) -- depends on all previous phases

### Checkpoints

After each phase, run these verification commands:

| After Phase | Verification Command |
|-------------|---------------------|
| 1 | `pnpm vitest run src/lib/services/__tests__/wh-article-price-service.test.ts` |
| 2 | `pnpm typecheck` (new router must compile) |
| 3 | `pnpm vitest run src/lib/services/__tests__/wh-article-price-service.test.ts && pnpm vitest run src/trpc/routers/__tests__/whArticlePrices-router.test.ts` |
| 4 | `pnpm typecheck` (hooks must compile against router types) |
| 5+6 | `pnpm typecheck && pnpm lint` |
| 7 | `pnpm exec playwright test src/e2e-browser/41-wh-prices.spec.ts` |

### Final Verification

```bash
pnpm test          # All tests pass
pnpm typecheck     # No new type errors
pnpm lint          # No new lint errors
pnpm build         # Production build succeeds
```

---

## File Summary

### New Files (13)

| File | Phase |
|------|-------|
| `src/lib/services/wh-article-price-service.ts` | 1 |
| `src/trpc/routers/warehouse/articlePrices.ts` | 2 |
| `src/lib/services/__tests__/wh-article-price-service.test.ts` | 3 |
| `src/trpc/routers/__tests__/whArticlePrices-router.test.ts` | 3 |
| `src/hooks/use-wh-article-prices.ts` | 4 |
| `src/components/warehouse/price-management.tsx` | 5 |
| `src/components/warehouse/price-list-selector.tsx` | 5 |
| `src/components/warehouse/price-list-articles-table.tsx` | 5 |
| `src/components/warehouse/price-detail-editor.tsx` | 5 |
| `src/components/warehouse/price-bulk-adjust-dialog.tsx` | 5 |
| `src/components/warehouse/price-copy-dialog.tsx` | 5 |
| `src/components/warehouse/article-price-tab.tsx` | 5 |
| `src/app/[locale]/(dashboard)/warehouse/prices/page.tsx` | 5 |
| `src/e2e-browser/41-wh-prices.spec.ts` | 7 |

### Modified Files (6)

| File | Phase | Change |
|------|-------|--------|
| `src/trpc/routers/warehouse/index.ts` | 2 | Add `articlePrices` sub-router |
| `src/hooks/index.ts` | 4 | Add barrel exports for price hooks |
| `src/components/warehouse/article-detail.tsx` | 5 | Add "Preise" tab with `ArticlePriceTab` |
| `messages/en.json` | 6 | Add `warehousePriceLists` nav key + `warehousePrices` section |
| `messages/de.json` | 6 | Add `warehousePriceLists` nav key + `warehousePrices` section |
| `src/components/layout/sidebar/sidebar-nav-config.ts` | 6 | Add warehouse prices nav item |
| `src/e2e-browser/global-setup.ts` | 7 | Add E2E price data cleanup |

### No Changes Required

- `prisma/schema.prisma` -- no new models
- `src/lib/auth/permission-catalog.ts` -- no new permissions
- `src/trpc/routers/_app.ts` -- warehouse router already registered
- `supabase/migrations/` -- no new migrations
