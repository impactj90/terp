# WH_02 — Preislisten Artikel

| Field | Value |
|-------|-------|
| **Module** | Warehouse |
| **Dependencies** | WH_01 (Articles), ORD_04 (Price Lists) |
| **Complexity** | M |
| **New Models** | None (extends `BillingPriceListEntry` from ORD_04) |

---

## Goal

Extend the existing price list system (ORD_04) with warehouse-specific functionality. Provide a three-panel UI (price lists | articles | prices) for managing article prices across multiple price lists. The article detail page gets a "Prices" tab showing all price list entries for that article. No new database models — this ticket adds warehouse-aware UI and integrates WH_01 articles with ORD_04 price lists. Replaces ZMI orgAuftrag section 16 from the warehouse perspective.

---

## Prisma Models

No new models. Uses existing:
- `BillingPriceList` (ORD_04)
- `BillingPriceListEntry` (ORD_04) — `articleId` links to `WhArticle` (WH_01)
- `WhArticle` (WH_01)

---

## Permissions

No new permissions. Uses existing:
- `billing_price_lists.view` — View price lists
- `billing_price_lists.manage` — Manage price lists
- `wh_articles.view` — View articles (for the three-panel UI)

---

## tRPC Router

**File:** `src/trpc/routers/warehouse/articlePrices.ts`

All procedures use `tenantProcedure.use(requireModule("warehouse"))`.

### Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `listByArticle` | query | `wh_articles.view` | `{ articleId }` | All price list entries for a specific article, across all price lists |
| `listByPriceList` | query | `billing_price_lists.view` | `{ priceListId, search? }` | All articles in a price list with their prices |
| `setPrice` | mutation | `billing_price_lists.manage` | `{ priceListId, articleId, unitPrice, minQuantity?, unit? }` | Add or update an article price in a price list |
| `removePrice` | mutation | `billing_price_lists.manage` | `{ priceListId, articleId }` | Remove article from price list |
| `bulkSetPrices` | mutation | `billing_price_lists.manage` | `{ priceListId, entries: [{ articleId, unitPrice, minQuantity? }] }` | Bulk add/update article prices |
| `copyPriceList` | mutation | `billing_price_lists.manage` | `{ sourceId, targetId, overwrite? }` | Copy all entries from one price list to another |
| `adjustPrices` | mutation | `billing_price_lists.manage` | `{ priceListId, adjustmentPercent, articleGroupId? }` | Bulk adjust all prices by percentage (optionally filtered by article group) |

### Input Schemas

```ts
const setPriceInput = z.object({
  priceListId: z.string().uuid(),
  articleId: z.string().uuid(),
  unitPrice: z.number().min(0),
  minQuantity: z.number().min(0).optional(),
  unit: z.string().optional(),
})

const adjustPricesInput = z.object({
  priceListId: z.string().uuid(),
  adjustmentPercent: z.number(), // e.g. 5.0 for +5%, -3.0 for -3%
  articleGroupId: z.string().uuid().optional(), // Only adjust articles in this group
})
```

---

## Service Layer

**File:** `src/lib/services/wh-article-price-service.ts`

### Key Logic

- `listByArticle` — Joins `BillingPriceListEntry` with `BillingPriceList` to show price list name, unitPrice, validity, for a given article across all lists.
- `setPrice` — Upserts a `BillingPriceListEntry` for the given `(priceListId, articleId)`. If minQuantity differs, creates a new entry (volume pricing).
- `copyPriceList` — Copies all entries from source to target. If `overwrite=true`, replaces existing; if `false`, skips entries that already exist.
- `adjustPrices` — Updates all entries in a price list by multiplying unitPrice by `(1 + adjustmentPercent/100)`. Optionally filtered to articles in a specific group. Rounds to 2 decimal places.

---

## UI Components

### Page Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/warehouse/prices` | `WhPricesPage` | Three-panel price management |

### Component Files

All in `src/components/warehouse/`:

| Component | Description |
|-----------|-------------|
| `price-management.tsx` | Three-panel layout (ZMI style): Left panel: Price list selector. Middle panel: Articles in selected list (searchable table). Right panel: Price details for selected article (edit inline). |
| `price-list-selector.tsx` | Left panel: list of price lists with "Default" badge. Click to select. |
| `price-list-articles-table.tsx` | Middle panel: articles in the selected price list. Columns: Article Number, Name, Unit Price, Unit, Min Qty. Search by article name/number. |
| `price-detail-editor.tsx` | Right panel: inline editing of price, min quantity, unit for selected article. Shows article image and details. |
| `price-bulk-adjust-dialog.tsx` | Dialog for bulk price adjustment: percentage input, optional group filter. Preview affected count. |
| `price-copy-dialog.tsx` | Dialog to copy entries from one price list to another. |
| `article-price-tab.tsx` | Component for article detail page "Prices" tab: shows all price list entries for that article in a table. |

---

## Hooks

**File:** `src/hooks/use-wh-article-prices.ts`

```ts
export function useWhArticlePrices(articleId: string) {
  return useQuery(trpc.warehouse.articlePrices.listByArticle.queryOptions({ articleId }))
}

export function useWhPriceListArticles(priceListId: string, search?: string) {
  return useQuery(trpc.warehouse.articlePrices.listByPriceList.queryOptions({ priceListId, search }))
}

export function useSetWhArticlePrice() {
  return useMutation({
    ...trpc.warehouse.articlePrices.setPrice.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.articlePrices.queryKey() })
    },
  })
}

export function useAdjustWhPrices() { /* ... */ }
```

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/wh-article-price-service.test.ts`

- `listByArticle` — returns entries across all price lists
- `setPrice` — creates entry if not exists
- `setPrice` — updates entry if exists
- `removePrice` — removes entry
- `bulkSetPrices` — upserts multiple entries
- `copyPriceList` — copies all entries
- `copyPriceList` — with overwrite=false skips existing
- `adjustPrices` — adjusts by positive percentage
- `adjustPrices` — adjusts by negative percentage
- `adjustPrices` — filters by article group
- `adjustPrices` — rounds to 2 decimal places

### Router Tests

**File:** `src/trpc/routers/__tests__/whArticlePrices-router.test.ts`

```ts
describe("warehouse.articlePrices", () => {
  it("listByArticle — requires wh_articles.view", async () => { })
  it("listByArticle — requires warehouse module enabled", async () => { })
  it("setPrice — creates/updates price entry", async () => { })
  it("adjustPrices — bulk adjusts by percentage", async () => { })
  it("copyPriceList — copies entries between lists", async () => { })
})
```

### E2E Tests

**File:** `src/e2e-browser/41-wh-prices.spec.ts`

```ts
test.describe("UC-WH-02: Article Price Lists", () => {
  test("set price for article in price list", async ({ page }) => {
    // Navigate to /warehouse/prices
    // Select price list → find article → set price
    // Verify price saved
  })

  test("view prices on article detail page", async ({ page }) => {
    // Navigate to article detail → Prices tab
    // Verify all price list entries shown
  })

  test("bulk adjust prices by percentage", async ({ page }) => {
    // Select price list → click "Adjust Prices"
    // Enter +5% → confirm
    // Verify prices updated
  })
})
```

---

## Acceptance Criteria

- [ ] No new database models — extends existing BillingPriceListEntry with WhArticle integration
- [ ] Three-panel price management UI (ZMI style)
- [ ] Set/update/remove article prices in price lists
- [ ] Bulk price import
- [ ] Copy entries between price lists
- [ ] Bulk percentage adjustment with optional group filter
- [ ] Article detail page "Prices" tab shows all price list entries
- [ ] Integration with ORD_01: article prices auto-fill from customer's price list
- [ ] All procedures gated by `requireModule("warehouse")` and appropriate permissions
- [ ] Cross-tenant isolation verified
