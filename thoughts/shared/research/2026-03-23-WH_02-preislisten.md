# WH_02 — Preislisten Research

Research for implementing warehouse article price lists. Documents only what exists in the codebase.

---

## 1. Existing Price List Models

### BillingPriceList (line 902, `prisma/schema.prisma`)

```prisma
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
```

### BillingPriceListEntry (line 928, `prisma/schema.prisma`)

```prisma
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

**Key findings on `articleId`:**
- `articleId` is a plain `String?` UUID field. There is NO Prisma `@relation` to `WhArticle`. It is currently a "loose" foreign key — the schema does not enforce referential integrity.
- There is no `priceListEntries` relation on the `WhArticle` model.
- The `CrmAddress` model (line 300) has `priceListId String? @map("price_list_id") @db.Uuid` with a `@relation` to `BillingPriceList` — this is how customers are assigned to a price list.
- The existing billing code uses `articleId` as an optional identifier, alongside `itemKey` for non-article items (free-text service items like "beratung_std").

---

## 2. Existing Price List Router/Service

### Router: `src/trpc/routers/billing/priceLists.ts`

Uses `billingProcedure = tenantProcedure.use(requireModule("billing"))` as base.

**Procedures:**
| Procedure | Type | Permission |
|-----------|------|-----------|
| `list` | query | `billing_price_lists.view` |
| `getById` | query | `billing_price_lists.view` |
| `create` | mutation | `billing_price_lists.manage` |
| `update` | mutation | `billing_price_lists.manage` |
| `delete` | mutation | `billing_price_lists.manage` |
| `setDefault` | mutation | `billing_price_lists.manage` |
| `entries.list` | query | `billing_price_lists.view` |
| `entries.create` | mutation | `billing_price_lists.manage` |
| `entries.update` | mutation | `billing_price_lists.manage` |
| `entries.delete` | mutation | `billing_price_lists.manage` |
| `entries.bulkImport` | mutation | `billing_price_lists.manage` |
| `entriesForAddress` | query | `billing_price_lists.view` |
| `lookupPrice` | query | `billing_price_lists.view` |

Uses a relaxed UUID regex pattern instead of `z.string().uuid()`:
```ts
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const uuid = z.string().regex(UUID_RE, "Invalid UUID")
```

### Service: `src/lib/services/billing-price-list-service.ts`

Error classes: `BillingPriceListNotFoundError`, `BillingPriceListValidationError`, `BillingPriceListConflictError`.

Key functions:
- `list(prisma, tenantId, params)` — paginated with search
- `getById(prisma, tenantId, id)` — throws NotFoundError
- `create(prisma, tenantId, input, createdById, audit?)` — auto-unsets other defaults if `isDefault=true`
- `update(prisma, tenantId, input, audit?)` — field-by-field update with audit tracking
- `remove(prisma, tenantId, id, audit?)` — checks for assigned customers before deleting
- `setDefault(prisma, tenantId, id, audit?)` — unsets all other defaults first
- `listEntries(prisma, tenantId, priceListId, params)` — verifies price list ownership then lists entries
- `createEntry(prisma, tenantId, input, audit?)`
- `updateEntry(prisma, tenantId, input, audit?)`
- `removeEntry(prisma, tenantId, priceListId, entryId, audit?)`
- `bulkImport(prisma, tenantId, priceListId, entries, audit?)` — transaction-based upsert
- `entriesForAddress(prisma, tenantId, addressId)` — resolves customer's price list with fallback to default
- `lookupPrice(prisma, tenantId, input)` — finds best price entry with volume pricing support

### Repository: `src/lib/services/billing-price-list-repository.ts`

Key patterns:
- `findMany` — uses `tenantId` in where clause, with paginated results
- `findById` — uses `{ id, tenantId }` for tenant scoping
- `update` — uses `updateMany({ where: { id, tenantId } })` then re-fetches
- `remove` — uses `deleteMany({ where: { id, tenantId } })`
- `findEntries` — queries by `priceListId` only (tenant isolation via parent price list check in service layer)
- `createEntry`, `updateEntry`, `removeEntry` — operate by `priceListId` and `entryId`
- `upsertEntries` — uses `$transaction` for bulk operations
- `lookupEntries` — filters by validity dates using `AND`/`OR` clauses

### Billing Router Index: `src/trpc/routers/billing/index.ts`

```ts
export const billingRouter = createTRPCRouter({
  documents: billingDocumentsRouter,
  documentTemplates: billingDocumentTemplatesRouter,
  tenantConfig: billingTenantConfigRouter,
  serviceCases: billingServiceCasesRouter,
  payments: billingPaymentsRouter,
  priceLists: billingPriceListsRouter,
  recurringInvoices: billingRecurringInvoicesRouter,
})
```

---

## 3. WH_01 Article Models

### WhArticle (line 4169, `prisma/schema.prisma`)

```prisma
model WhArticle {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String   @map("tenant_id") @db.Uuid
  number            String   @db.VarChar(50)
  name              String   @db.VarChar(255)
  description       String?  @db.Text
  descriptionAlt    String?  @map("description_alt") @db.Text
  groupId           String?  @map("group_id") @db.Uuid
  matchCode         String?  @map("match_code") @db.VarChar(100)
  unit              String   @default("Stk") @db.VarChar(20)
  vatRate           Float    @default(19.0) @map("vat_rate")
  sellPrice         Float?   @map("sell_price")
  buyPrice          Float?   @map("buy_price")
  discountGroup     String?  @map("discount_group") @db.VarChar(50)
  orderType         String?  @map("order_type") @db.VarChar(50)
  stockTracking     Boolean  @default(false) @map("stock_tracking")
  currentStock      Float    @default(0) @map("current_stock")
  minStock          Float?   @map("min_stock")
  warehouseLocation String?  @map("warehouse_location") @db.VarChar(255)
  images            Json?    @db.JsonB
  isActive          Boolean  @default(true) @map("is_active")
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById       String?  @map("created_by_id") @db.Uuid

  tenant    Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  group     WhArticleGroup?    @relation(fields: [groupId], references: [id], onDelete: SetNull)
  suppliers WhArticleSupplier[]
  bomParent WhBillOfMaterial[] @relation("BomParent")
  bomChild  WhBillOfMaterial[] @relation("BomChild")

  @@unique([tenantId, number], map: "uq_wh_articles_tenant_number")
  @@index([tenantId, groupId])
  @@index([tenantId, matchCode])
  @@index([tenantId, name])
  @@index([tenantId, isActive])
  @@map("wh_articles")
}
```

### WhArticleGroup (line 4151, `prisma/schema.prisma`)

```prisma
model WhArticleGroup {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  parentId  String?  @map("parent_id") @db.Uuid
  name      String   @db.VarChar(255)
  sortOrder Int      @default(0) @map("sort_order")
  ...

  @@index([tenantId, parentId])
  @@map("wh_article_groups")
}
```

**Relationship to `BillingPriceListEntry`:**
- There is NO formal Prisma relation between `WhArticle` and `BillingPriceListEntry`.
- `BillingPriceListEntry.articleId` is a loose UUID string. Queries will need manual joins or raw lookups.
- `WhArticle` has `sellPrice` and `buyPrice` fields directly on the model, serving as "base" prices independent of price lists.

---

## 4. Warehouse Router Pattern

### `src/trpc/routers/warehouse/index.ts`

```ts
import { createTRPCRouter } from "@/trpc/init"
import { whArticlesRouter } from "./articles"

export const warehouseRouter = createTRPCRouter({
  articles: whArticlesRouter,
})
```

### `src/trpc/routers/warehouse/articles.ts`

Key patterns:
- **Module guard base procedure:** `const whProcedure = tenantProcedure.use(requireModule("warehouse"))`
- **Permission constants:** resolved at module load time via `permissionIdByKey()`
- **Router structure:** flat procedures + nested sub-routers (`groups: createTRPCRouter({...})`)
- **Service delegation:** each procedure wraps service call in `try { ... } catch (err) { handleServiceError(err) }`
- **Type casting:** `ctx.prisma as unknown as PrismaClient` on every service call
- **Audit context:** `{ userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }`

---

## 5. WH Article Service Pattern

### `src/lib/services/wh-article-service.ts`

**Pattern:**
- Error classes: `WhArticleNotFoundError`, `WhArticleValidationError`, `WhArticleConflictError`
- `ARTICLE_TRACKED_FIELDS` array for audit change tracking
- Functions accept `(prisma, tenantId, ...)` — always pass tenantId
- Audit logging: `.catch(err => console.error('[AuditLog] Failed:', err))` — never throws
- Uses `import * as repo from "./wh-article-repository"`
- Uses `import * as auditLog from "./audit-logs-service"`

### `src/lib/services/wh-article-repository.ts`

**Pattern:**
- `findMany(prisma, tenantId, params)` — builds where clause, returns `{ items, total }`
- `findById(prisma, tenantId, id)` — uses `findFirst({ where: { id, tenantId } })`
- `create(prisma, data)` — `prisma.whArticle.create({ data })`
- `update(prisma, tenantId, id, data)` — uses `tenantScopedUpdate` helper
- `softDelete` / `restore` — `tenantScopedUpdate` with `isActive` toggle
- `hardDelete` — `deleteMany({ where: { id, tenantId } })`
- Sub-entity operations (suppliers, BOM) verify tenant ownership via parent entity before modifying

---

## 6. Existing Hooks Pattern

### `src/hooks/use-wh-articles.ts`

Pattern:
```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useWhArticles(options) {
  const trpc = useTRPC()
  return useQuery(trpc.warehouse.articles.list.queryOptions(input, { enabled }))
}

export function useCreateWhArticle() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articles.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.articles.list.queryKey() })
    },
  })
}
```

### `src/hooks/use-billing-price-lists.ts`

Same pattern. Notable mutation invalidation approach — invalidates related query keys on success:
```ts
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.list.queryKey() })
  queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.getById.queryKey() })
  queryClient.invalidateQueries({ queryKey: trpc.billing.priceLists.entriesForAddress.queryKey() })
},
```

### `src/hooks/index.ts`

Exports are organized by domain. WH articles are exported at lines 822-840. Billing price lists at lines 781-801. New hooks will need to be added to this barrel export.

---

## 7. Module Gating

### `src/lib/modules/index.ts`

The `requireModule(module)` function is a tRPC middleware:

```ts
export function requireModule(module: string) {
  return createMiddleware(async ({ ctx, next }) => {
    if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant ID required" })
    if (module === "core") return next({ ctx })

    const enabled = await hasModule(prisma, tenantId, module)
    if (!enabled) {
      throw new TRPCError({ code: "FORBIDDEN", message: `Module "${module}" is not enabled for this tenant` })
    }
    return next({ ctx })
  })
}
```

- Checks `tenantModule` table for `{ tenantId, module }` existence
- `"core"` is always enabled
- Available modules: `"core"`, `"crm"`, `"billing"`, `"warehouse"`

Usage in warehouse router: `const whProcedure = tenantProcedure.use(requireModule("warehouse"))`

In test mocking:
```ts
vi.mock("@/lib/db", () => ({
  prisma: { tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "warehouse" }),
  }},
}))

const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "warehouse" }),
  },
}
```

---

## 8. Tenant Isolation Pattern

### `src/lib/services/__tests__/wh-article-service.test.ts` (line 324-395+)

```ts
// =========================================================================
// TENANT ISOLATION TESTS
// =========================================================================
describe("tenant isolation", () => {
  const OTHER_TENANT_ID = "ff000000-0000-4000-a000-000000000999"
  const SUPPLIER_LINK_ID = "s1000000-0000-4000-a000-000000000001"
  const BOM_ID = "bom00000-0000-4000-a000-000000000001"

  it("getById returns nothing for article from another tenant", async () => {
    const prisma = createMockPrisma({
      whArticle: {
        findFirst: vi.fn().mockResolvedValue(null), // not found for other tenant
        ...
      },
    })
    await expect(
      service.getById(prisma, OTHER_TENANT_ID, ARTICLE_ID)
    ).rejects.toThrow(service.WhArticleNotFoundError)
  })

  it("update rejects article from another tenant", async () => { ... })
  it("remove rejects article from another tenant", async () => { ... })
  it("listSuppliers rejects article from another tenant", async () => { ... })
  it("updateSupplier rejects supplier link from another tenant", async () => { ... })
})
```

Pattern: mock Prisma to return `null` for cross-tenant lookups, assert `NotFoundError` is thrown.

---

## 9. Three-Panel UI Patterns

No existing three-panel (`ResizablePanel`, `threePanel`) components found in the codebase. The closest patterns are:

1. **Two-panel layout (WH_01 Articles page):** `src/app/[locale]/(dashboard)/warehouse/articles/page.tsx` (line 104-196)
   - Left panel: `ArticleGroupTree` in a `Card` with `w-64 shrink-0`
   - Right panel: `flex-1 space-y-4` containing search, filters, data table, pagination
   - Layout: `<div className="flex gap-6">`

2. **Billing Price Lists (list + detail pages):**
   - List page at `/orders/price-lists` — standard table list
   - Detail page at `/orders/price-lists/[id]` — card-based layout with grid
   - Uses router navigation between list and detail (`router.push`)

3. **Billing Price List Detail:** `src/components/billing/price-list-detail.tsx`
   - Uses `grid grid-cols-1 md:grid-cols-2 gap-6` for info + customers
   - `PriceListEntriesTable` component below for entries

The three-panel layout for WH_02 will be new UI pattern not yet in codebase.

---

## 10. Permission Catalog

### `src/lib/auth/permission-catalog.ts`

**Billing Price Lists (line 267-268):**
```ts
p("billing_price_lists.view", "billing_price_lists", "view", "View price lists"),
p("billing_price_lists.manage", "billing_price_lists", "manage", "Manage price lists and entries"),
```

**Warehouse Articles (line 276-280):**
```ts
p("wh_articles.view", "wh_articles", "view", "View warehouse articles"),
p("wh_articles.create", "wh_articles", "create", "Create warehouse articles"),
p("wh_articles.edit", "wh_articles", "edit", "Edit warehouse articles"),
p("wh_articles.delete", "wh_articles", "delete", "Delete warehouse articles"),
p("wh_article_groups.manage", "wh_article_groups", "manage", "Manage warehouse article groups"),
```

Per the ticket, no new permissions are needed. The WH_02 router will use `billing_price_lists.view`, `billing_price_lists.manage`, and `wh_articles.view`.

---

## 11. Root Router

### `src/trpc/routers/_app.ts`

The warehouse router is already merged at line 161:
```ts
warehouse: warehouseRouter,
```

The billing router is at line 160:
```ts
billing: billingRouter,
```

The new `articlePrices` sub-router needs to be added to the warehouse router index at `src/trpc/routers/warehouse/index.ts`, not to `_app.ts`.

---

## 12. Sidebar Nav

### `src/components/layout/sidebar/sidebar-nav-config.ts` (line 361-379)

```ts
{
  titleKey: 'warehouseSection',
  module: 'warehouse',
  items: [
    {
      titleKey: 'warehouseOverview',
      href: '/warehouse',
      icon: Warehouse,
      module: 'warehouse',
    },
    {
      titleKey: 'warehouseArticles',
      href: '/warehouse/articles',
      icon: Package,
      module: 'warehouse',
      permissions: ['wh_articles.view'],
    },
  ],
},
```

A new entry for "Preislisten" will need to be added here with:
- `titleKey: 'warehousePriceLists'`
- `href: '/warehouse/prices'`
- `icon: Tag` (already imported at line 45)
- `module: 'warehouse'`
- `permissions: ['billing_price_lists.view']`

The billing section already has a "billingPriceLists" entry (line 339-344) pointing to `/orders/price-lists`.

---

## 13. Existing E2E Tests

### `src/e2e-browser/40-wh-articles.spec.ts`

**Structure:**
```ts
test.describe.serial("UC-WH-01: Article Management", () => {
  test("enable warehouse module", async ({ page }) => { ... })
  test("navigate to articles page", async ({ page }) => { ... })
  test("create article group hierarchy", async ({ page }) => { ... })
  test("create an article", async ({ page }) => { ... })
  test("create a second article for BOM", async ({ page }) => { ... })
  test("search articles by name", async ({ page }) => { ... })
  test("navigate to article detail page", async ({ page }) => { ... })
  test("detail page shows overview tab with article data", async ({ page }) => { ... })
  test("suppliers tab shows empty state", async ({ page }) => { ... })
  test("BOM tab shows empty state", async ({ page }) => { ... })
  test("deactivate an article", async ({ page }) => { ... })
  test("restore an inactive article", async ({ page }) => { ... })
})
```

**Key patterns:**
- Uses `test.describe.serial` for sequential execution
- Imports from `./helpers/nav` (`navigateTo`, `waitForTableLoad`, `expectPageTitle`)
- Imports from `./helpers/forms` (`fillInput`, `submitAndWaitForClose`, `waitForSheet`, `expectTableContains`, `expectTableNotContains`, `openRowActions`, `clickMenuItem`, `clickTab`)
- First test enables warehouse module via settings page
- Uses `page.locator("main#main-content")` for scoping
- Tab navigation via `clickTab(page, "Lieferanten")` / `clickTab(page, "Stueckliste")`
- Asserts empty states with `page.getByText("Keine Lieferanten zugeordnet")`

---

## 14. Messages / i18n

### `messages/en.json`

```
line 118: "warehouseSection": "Warehouse",
line 119: "warehouseOverview": "Warehouse Overview",
line 120: "warehouseArticles": "Articles",
line 114: "billingPriceLists": "Price Lists",
```

### `messages/de.json`

```
line 118: "warehouseSection": "Lager",
line 119: "warehouseOverview": "Lagerübersicht",
line 120: "warehouseArticles": "Artikel",
line 114: "billingPriceLists": "Preislisten",
```

New translation keys needed for WH_02 (e.g. `warehousePriceLists`, plus UI strings for the three-panel page) will be added to both files under the `"nav"` section and wherever domain-specific strings are used.

---

## Summary of Existing Files Relevant to WH_02

### Backend
| File | Purpose |
|------|---------|
| `prisma/schema.prisma` (lines 902-947) | BillingPriceList + BillingPriceListEntry models |
| `prisma/schema.prisma` (lines 4151-4206) | WhArticle + WhArticleGroup models |
| `src/trpc/routers/warehouse/index.ts` | Warehouse router index — add `articlePrices` here |
| `src/trpc/routers/warehouse/articles.ts` | Article router — pattern reference for new router |
| `src/trpc/routers/billing/priceLists.ts` | Billing price list router — existing procedures to reuse/reference |
| `src/lib/services/billing-price-list-service.ts` | Price list service — to reuse for price list operations |
| `src/lib/services/billing-price-list-repository.ts` | Price list repository — to reuse for entry queries |
| `src/lib/services/wh-article-service.ts` | Article service — pattern reference |
| `src/lib/services/wh-article-repository.ts` | Article repository — pattern reference |
| `src/lib/modules/index.ts` | `requireModule()` middleware |
| `src/lib/auth/permission-catalog.ts` | Permission definitions |
| `src/trpc/routers/_app.ts` | Root router — warehouse already merged |

### Frontend
| File | Purpose |
|------|---------|
| `src/hooks/use-wh-articles.ts` | WH article hooks — pattern reference |
| `src/hooks/use-billing-price-lists.ts` | Billing price list hooks — pattern reference |
| `src/hooks/index.ts` | Barrel export — add new hooks here |
| `src/components/layout/sidebar/sidebar-nav-config.ts` | Sidebar nav — add warehouse prices entry |
| `src/app/[locale]/(dashboard)/warehouse/articles/page.tsx` | Articles page — two-panel layout reference |
| `src/components/billing/price-list-detail.tsx` | Billing price list detail — UI pattern reference |
| `src/components/billing/price-list-entries-table.tsx` | Price list entries table — UI pattern reference |
| `src/components/billing/price-list-entry-form-dialog.tsx` | Entry form dialog — UI pattern reference |
| `src/components/billing/price-list-bulk-import-dialog.tsx` | Bulk import dialog — UI pattern reference |
| `messages/en.json` | English translations |
| `messages/de.json` | German translations |

### Tests
| File | Purpose |
|------|---------|
| `src/trpc/routers/__tests__/whArticles-router.test.ts` | Router test pattern (module mock, permission tests) |
| `src/lib/services/__tests__/wh-article-service.test.ts` | Service test pattern (tenant isolation block) |
| `src/lib/services/__tests__/billing-price-list-service.test.ts` | Price list service tests |
| `src/trpc/routers/__tests__/billingPriceLists-router.test.ts` | Price list router tests |
| `src/trpc/routers/__tests__/helpers.ts` | Shared test helpers (`createMockContext`, `autoMockPrisma`, etc.) |
| `src/e2e-browser/40-wh-articles.spec.ts` | E2E test pattern for warehouse |
