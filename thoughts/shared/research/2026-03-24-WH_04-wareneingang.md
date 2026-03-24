# Research: WH_04 Wareneingang (Goods Receipt & Stock Movements)

Date: 2026-03-24
Ticket: `thoughts/shared/tickets/orgAuftrag/TICKET_WH_04_WARENEINGANG.md`

---

## 1. WH_03 Purchase Orders — Existing Implementation

WH_04 depends on WH_03 for goods receipt booking against purchase orders. Here is the full WH_03 stack.

### 1A. Prisma Schema (lines 4252-4336 in `prisma/schema.prisma`)

**Enums:**
```prisma
enum WhPurchaseOrderStatus {
  DRAFT
  ORDERED
  PARTIALLY_RECEIVED
  RECEIVED
  CANCELLED
  @@map("wh_purchase_order_status")
}

enum WhPurchaseOrderMethod {
  PHONE
  EMAIL
  FAX
  PRINT
  @@map("wh_purchase_order_method")
}
```

**WhPurchaseOrder model** (table: `wh_purchase_orders`):
- `id`, `tenantId`, `number`, `supplierId`, `contactId`, `inquiryId`
- `status` (WhPurchaseOrderStatus, default DRAFT)
- `orderDate`, `requestedDelivery`, `confirmedDelivery`
- `orderMethod`, `orderMethodNote`, `notes`
- `subtotalNet`, `totalGross`, `printedAt`
- `createdAt`, `updatedAt`, `createdById`
- Relations: `tenant`, `supplier` (CrmAddress), `contact` (CrmContact), `inquiry` (CrmInquiry), `positions[]`
- Unique: `@@unique([tenantId, number])`
- Indexes: `[tenantId, status]`, `[tenantId, supplierId]`, `[tenantId, requestedDelivery]`

**WhPurchaseOrderPosition model** (table: `wh_purchase_order_positions`):
- `id`, `purchaseOrderId`, `sortOrder`, `articleId`
- `supplierArticleNumber`, `description`
- `quantity`, `receivedQuantity` (Float, default 0)
- `unit`, `unitPrice`, `flatCosts`, `totalPrice`
- `requestedDelivery`, `confirmedDelivery`
- `createdAt`, `updatedAt`
- Relations: `purchaseOrder`, `article` (WhArticle)
- Index: `[purchaseOrderId, sortOrder]`

**Key field for WH_04:** `receivedQuantity` on `WhPurchaseOrderPosition` tracks how much of each line item has been received. WH_04 will increment this field when booking goods receipt.

### 1B. SQL Migration

**File:** `supabase/migrations/20260323120000_wh_purchase_orders.sql`

Creates the two tables, enums, and indexes. Key detail: `received_quantity DOUBLE PRECISION NOT NULL DEFAULT 0` on positions table.

### 1C. Service Layer

**File:** `src/lib/services/wh-purchase-order-service.ts`

Service functions:
- `list(prisma, tenantId, params)` — paginated, filterable by supplier/status/search/dates
- `getById(prisma, tenantId, id)` — with positions, supplier, contact, inquiry includes
- `create(prisma, tenantId, input, createdById?, audit?)` — validates supplier type, generates number via NumberSequence
- `update(prisma, tenantId, input, audit?)` — DRAFT only
- `deleteOrder(prisma, tenantId, id, audit?)` — DRAFT only, hard delete
- `sendOrder(prisma, tenantId, id, input, audit?)` — DRAFT -> ORDERED, requires positions
- `cancel(prisma, tenantId, id, audit?)` — not RECEIVED/CANCELLED
- `listPositions(prisma, tenantId, purchaseOrderId)`
- `addPosition(prisma, tenantId, input, audit?)` — auto-fill from WhArticleSupplier
- `updatePosition(prisma, tenantId, input, audit?)`
- `deletePosition(prisma, tenantId, positionId, audit?)`
- `getReorderSuggestions(prisma, tenantId, supplierId?)`
- `createFromSuggestions(prisma, tenantId, input, createdById?, audit?)`

Error classes:
- `WhPurchaseOrderNotFoundError`
- `WhPurchaseOrderValidationError`
- `WhPurchaseOrderConflictError`

**Recalculate totals helper:** After position changes, `recalculateTotals` sums position `totalPrice` values and updates the PO's `subtotalNet` and `totalGross`.

### 1D. Repository Layer

**File:** `src/lib/services/wh-purchase-order-repository.ts`

Key functions:
- `findMany` — with supplier include, `_count: { select: { positions: true } }`
- `findById` — includes supplier, contact, inquiry, positions (with article select)
- `create` — includes supplier select, positions
- `update` — uses `tenantScopedUpdate` from `prisma-helpers`
- `softDeleteById` — deleteMany with `{ id, tenantId, status: "DRAFT" }`
- `findPositionsByOrder`, `createPosition`, `updatePosition`, `deletePosition`, `countPositions`
- `findArticlesBelowMinStock` — for reorder suggestions

### 1E. Router

**File:** `src/trpc/routers/warehouse/purchaseOrders.ts`

Pattern:
```ts
const PO_VIEW = permissionIdByKey("wh_purchase_orders.view")!
const PO_CREATE = permissionIdByKey("wh_purchase_orders.create")!
const PO_EDIT = permissionIdByKey("wh_purchase_orders.edit")!
const PO_DELETE = permissionIdByKey("wh_purchase_orders.delete")!
const PO_ORDER = permissionIdByKey("wh_purchase_orders.order")!

const whProcedure = tenantProcedure.use(requireModule("warehouse"))

export const whPurchaseOrdersRouter = createTRPCRouter({
  list: whProcedure.use(requirePermission(PO_VIEW)).input(...).query(...),
  // ... all procedures follow same pattern
  positions: positionsRouter,  // sub-router for position CRUD
})
```

Audit context passed on mutations:
```ts
const audit = {
  userId: ctx.user!.id,
  ipAddress: ctx.ipAddress,
  userAgent: ctx.userAgent,
}
```

### 1F. Hooks

**File:** `src/hooks/use-wh-purchase-orders.ts`

Query hooks: `useWhPurchaseOrders`, `useWhPurchaseOrder`, `useWhReorderSuggestions`, `useWhPOPositions`
Mutation hooks: `useCreateWhPurchaseOrder`, `useUpdateWhPurchaseOrder`, `useDeleteWhPurchaseOrder`, `useSendWhPurchaseOrder`, `useCancelWhPurchaseOrder`, `useCreateWhPOFromSuggestions`, `useAddWhPOPosition`, `useUpdateWhPOPosition`, `useDeleteWhPOPosition`

Query invalidation pattern on mutation success:
```ts
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: trpc.warehouse.purchaseOrders.list.queryKey() })
  queryClient.invalidateQueries({ queryKey: trpc.warehouse.purchaseOrders.getById.queryKey() })
}
```

### 1G. UI Components

**Files in `src/components/warehouse/`:**
- `purchase-order-list.tsx` — data table with status/supplier/date filters
- `purchase-order-detail.tsx` — detail view with status badge, positions table, action buttons
- `purchase-order-form.tsx` — create/edit form
- `purchase-order-position-table.tsx` — editable positions table
- `purchase-order-status-badge.tsx` — status badge component
- `purchase-order-send-dialog.tsx` — send order dialog (method selection)
- `reorder-suggestions-list.tsx` — below-min-stock suggestions

### 1H. Pages

- `src/app/[locale]/(dashboard)/warehouse/purchase-orders/page.tsx` — list
- `src/app/[locale]/(dashboard)/warehouse/purchase-orders/[id]/page.tsx` — detail
- `src/app/[locale]/(dashboard)/warehouse/purchase-orders/new/page.tsx` — create
- `src/app/[locale]/(dashboard)/warehouse/purchase-orders/suggestions/page.tsx` — reorder suggestions

---

## 2. WH_01 Articles — Existing Implementation

### 2A. Prisma Schema (lines 4173-4211 in `prisma/schema.prisma`)

**WhArticle model** (table: `wh_articles`):
- `id`, `tenantId`, `number`, `name`, `description`, `descriptionAlt`
- `groupId`, `matchCode`, `unit` (default "Stk"), `vatRate` (default 19.0)
- `sellPrice`, `buyPrice`, `discountGroup`, `orderType`
- `stockTracking` (Boolean, default false), `currentStock` (Float, default 0), `minStock`
- `warehouseLocation`, `images` (JsonB), `isActive` (default true)
- `createdAt`, `updatedAt`, `createdById`
- Relations: `tenant`, `group`, `suppliers[]`, `bomParent[]`, `bomChild[]`, `purchaseOrderPositions[]`
- Unique: `@@unique([tenantId, number])`

**Key fields for WH_04:**
- `currentStock` — updated by goods receipt and stock adjustments
- `stockTracking` — must be true for stock movements to be recorded

### 2B. Service

**File:** `src/lib/services/wh-article-service.ts`

Key function for WH_04 integration — `adjustStock`:
```ts
export async function adjustStock(prisma, tenantId, id, quantity, reason?, audit?) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new WhArticleNotFoundError()
  if (!existing.stockTracking) throw new WhArticleValidationError("Stock tracking is not enabled...")
  // TODO: When WH_04 (Stock Movements) is implemented, also create a
  // WhStockMovement record of type ADJUSTMENT here.
  const result = await repo.updateStock(prisma, tenantId, id, quantity)
  // ...audit log
}
```

This TODO at line 328-329 explicitly marks where WH_04 should integrate.

### 2C. Repository

**File:** `src/lib/services/wh-article-repository.ts`

Key function — `updateStock`:
```ts
export async function updateStock(prisma, tenantId, id, delta) {
  return tenantScopedUpdate(
    prisma.whArticle,
    { id, tenantId },
    { currentStock: { increment: delta } } as Record<string, unknown>,
    { entity: "WhArticle" }
  )
}
```

Uses `{ increment: delta }` for atomic stock updates (Prisma atomic number operation).

### 2D. Tenant Isolation Tests

**File:** `src/lib/services/__tests__/wh-article-service.test.ts`

Contains a `describe("tenant isolation")` block starting at line 327 with tests:
- `getById returns nothing for article from another tenant`
- `update rejects article from another tenant`

Pattern uses `OTHER_TENANT_ID = "ff000000-0000-4000-a000-000000000999"` and asserts `WhArticleNotFoundError`.

---

## 3. Warehouse Module Patterns

### 3A. Module Guard

**File:** `src/lib/modules/index.ts`

```ts
export function requireModule(module: string) {
  return createMiddleware(async ({ ctx, next }) => {
    const { tenantId, prisma } = ctx
    if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant ID required" })
    if (module === "core") return next({ ctx })
    const enabled = await hasModule(prisma, tenantId, module)
    if (!enabled) throw new TRPCError({ code: "FORBIDDEN", message: `Module "${module}" is not enabled...` })
    return next({ ctx })
  })
}
```

Checks `tenantModule` table for `{ tenantId, module }` record.

### 3B. `whProcedure` Pattern

Used in all warehouse routers:
```ts
const whProcedure = tenantProcedure.use(requireModule("warehouse"))
```

Then each endpoint chains: `whProcedure.use(requirePermission(PERM_ID)).input(z.object({...})).query/mutation(...)`

### 3C. Warehouse Router Mount

**File:** `src/trpc/routers/warehouse/index.ts`

```ts
export const warehouseRouter = createTRPCRouter({
  articles: whArticlesRouter,
  articlePrices: whArticlePricesRouter,
  purchaseOrders: whPurchaseOrdersRouter,
})
```

**Mounted in `src/trpc/routers/_app.ts`** at line 161:
```ts
warehouse: warehouseRouter,
```

WH_04 will add `stockMovements: whStockMovementsRouter` to the warehouse index.

### 3D. Error Handling

**File:** `src/trpc/errors.ts` — `handleServiceError(err)`

Maps error classes by constructor name suffix:
- `*NotFoundError` -> `NOT_FOUND`
- `*ValidationError` / `*InvalidError` -> `BAD_REQUEST`
- `*ConflictError` / `*DuplicateError` -> `CONFLICT`
- `*ForbiddenError` / `*AccessDeniedError` -> `FORBIDDEN`

### 3E. Prisma Helpers

**File:** `src/lib/services/prisma-helpers.ts`

- `tenantScopedUpdate(delegate, where, data, opts?)` — updateMany + refetch, throws `TenantScopedNotFoundError`
- `relationScopedUpdate(delegate, where, data, opts?)` — same but for relation-scoped updates

### 3F. Number Sequences

**File:** `src/lib/services/number-sequence-service.ts`

Default prefixes include:
```ts
const DEFAULT_PREFIXES = {
  article: "ART-",
  purchase_order: "BE-",
}
```

WH_04 may not need a new sequence since stock movements are typically identified by their movement ID, not a sequential number. But if needed, the pattern is:
```ts
const number = await numberSeqService.getNextNumber(prisma, tenantId, "goods_receipt")
```

### 3G. Audit Logging

**File:** `src/lib/services/audit-logs-service.ts`

Key exports:
- `AuditContext` interface: `{ userId, ipAddress?, userAgent? }`
- `log(prisma, data)` — fire-and-forget, never throws
- `logBulk(prisma, data[])` — batch create
- `computeChanges(before, after, fieldsToTrack?)` — returns diff object or null

Pattern in services:
```ts
if (audit) {
  await auditLog.log(prisma, {
    tenantId, userId: audit.userId, action: "create", entityType: "wh_stock_movement",
    entityId: movement.id, entityName: null, changes: { ... },
    ipAddress: audit.ipAddress, userAgent: audit.userAgent,
  }).catch(err => console.error('[AuditLog] Failed:', err))
}
```

---

## 4. Permissions

### 4A. Existing Warehouse Permissions

**File:** `src/lib/auth/permission-catalog.ts` (lines 275-287)

```ts
// Warehouse Articles
p("wh_articles.view", "wh_articles", "view", "View warehouse articles"),
p("wh_articles.create", "wh_articles", "create", "Create warehouse articles"),
p("wh_articles.edit", "wh_articles", "edit", "Edit warehouse articles"),
p("wh_articles.delete", "wh_articles", "delete", "Delete warehouse articles"),
p("wh_article_groups.manage", "wh_article_groups", "manage", "Manage warehouse article groups"),

// Warehouse Purchase Orders
p("wh_purchase_orders.view", "wh_purchase_orders", "view", "View purchase orders"),
p("wh_purchase_orders.create", "wh_purchase_orders", "create", "Create purchase orders"),
p("wh_purchase_orders.edit", "wh_purchase_orders", "edit", "Edit purchase orders"),
p("wh_purchase_orders.delete", "wh_purchase_orders", "delete", "Delete purchase orders"),
p("wh_purchase_orders.order", "wh_purchase_orders", "order", "Send/finalize purchase orders"),
```

### 4B. WH_04 Permissions to Add (per ticket)

```ts
p("wh_stock.view", "wh_stock", "view", "View stock movements and goods receipts"),
p("wh_stock.manage", "wh_stock", "manage", "Manage goods receipts and stock bookings"),
```

### 4C. Permission Usage Pattern

```ts
const WH_STOCK_VIEW = permissionIdByKey("wh_stock.view")!
const WH_STOCK_MANAGE = permissionIdByKey("wh_stock.manage")!

whProcedure
  .use(requirePermission(WH_STOCK_VIEW))
  .input(z.object({ ... }))
  .query(...)
```

---

## 5. Navigation & Sidebar

### 5A. Sidebar Nav Config

**File:** `src/components/layout/sidebar/sidebar-nav-config.ts` (lines 362-393)

Current warehouse section:
```ts
{
  titleKey: 'warehouseSection',
  module: 'warehouse',
  items: [
    { titleKey: 'warehouseOverview', href: '/warehouse', icon: Warehouse, module: 'warehouse' },
    { titleKey: 'warehouseArticles', href: '/warehouse/articles', icon: Package, module: 'warehouse', permissions: ['wh_articles.view'] },
    { titleKey: 'warehousePriceLists', href: '/warehouse/prices', icon: Tag, module: 'warehouse', permissions: ['billing_price_lists.view'] },
    { titleKey: 'warehousePurchaseOrders', href: '/warehouse/purchase-orders', icon: ShoppingCart, module: 'warehouse', permissions: ['wh_purchase_orders.view'] },
  ],
},
```

WH_04 will add two new items:
- Goods Receipt page: `{ titleKey: 'warehouseGoodsReceipt', href: '/warehouse/goods-receipt', icon: <TBD>, module: 'warehouse', permissions: ['wh_stock.manage'] }`
- Stock Movements page: `{ titleKey: 'warehouseStockMovements', href: '/warehouse/stock-movements', icon: <TBD>, module: 'warehouse', permissions: ['wh_stock.view'] }`

Icons already imported in the file: `Warehouse`, `Package`, `Tag`, `ShoppingCart`. New icons to import from `lucide-react` for WH_04: likely `ClipboardCheck` or `PackageCheck` for goods receipt, `ArrowRightLeft` or `History` for stock movements.

### 5B. Sidebar Filtering

**File:** `src/components/layout/sidebar/sidebar-nav.tsx`

Items are filtered by:
1. Module check: `item.module && !enabledModules.has(item.module)` -> hidden
2. Permission check: `item.permissions` checked via `usePermissionChecker().check()`

### 5C. Nav Translation Keys

Located in `nav` namespace of `messages/de.json` and `messages/en.json`. Current warehouse keys:
- `warehouseSection` ("Lager" / "Warehouse")
- `warehouseOverview` ("Lageruebersicht" / "Warehouse Overview")
- `warehouseArticles` ("Artikel" / "Articles")
- `warehousePriceLists` ("Preislisten" / "Price Lists")
- `warehousePurchaseOrders` ("Bestellungen" / "Purchase Orders")

WH_04 will add:
- `warehouseGoodsReceipt` ("Wareneingang" / "Goods Receipt")
- `warehouseStockMovements` ("Lagerbewegungen" / "Stock Movements")

---

## 6. i18n Translations

### 6A. Translation Files

- `messages/de.json` — German translations
- `messages/en.json` — English translations

### 6B. Existing Warehouse Translation Sections

Top-level sections following the pattern `"sectionName": { ... }`:

1. **`warehouseArticles`** (lines 5576-5696 in de.json) — Article master data
2. **`warehousePrices`** (lines 5517-5575 in de.json) — Price list management
3. **`warehousePurchaseOrders`** (lines 5700-5838 in de.json) — Purchase orders

### 6C. Key Naming Convention

Translation keys use camelCase within each section:
- Page-level: `pageTitle`, `actionCreate`, `searchPlaceholder`, `loading`, `noPermission`
- Table columns: `colNumber`, `colName`, `colStatus`, `colTotal`
- Status badges: `statusDraft`, `statusOrdered`, `statusPartiallyReceived`
- Actions: `actionView`, `actionEdit`, `actionDelete`, `actionSendOrder`
- Form labels: `labelSupplier`, `labelContact`, `labelNotes`
- Detail view: `detailTitle`, `detailSupplier`, `detailOrderDate`
- Sections: `sectionPositions`, `sectionSummary`
- Toasts: `toastCreated`, `toastUpdated`, `toastDeleted`
- Dialogs: `sendDialogTitle`, `cancelDialogTitle`, `deleteDialogTitle`

### 6D. Existing WH_04 Placeholder

The article detail "Stock" tab currently shows a placeholder message:
```json
"stockMovementsPlaceholder": "Bestandsbewegungen werden mit WH_04 implementiert."
```

This key is at line 5637 in `messages/de.json` and is referenced in `src/components/warehouse/article-detail.tsx` line 226.

### 6E. WH_04 New Translation Sections

Two new sections needed:
1. **`warehouseGoodsReceipt`** — Goods receipt terminal UI
2. **`warehouseStockMovements`** — Stock movement history

---

## 7. E2E Test Patterns

### 7A. Router Tests (Vitest)

**Example file:** `src/trpc/routers/__tests__/whPurchaseOrders-router.test.ts`

Pattern:
```ts
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { whPurchaseOrdersRouter } from "../warehouse/purchaseOrders"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { createMockContext, createMockSession, createUserWithPermissions, createMockUserTenant } from "./helpers"

// Mock the db module for requireModule middleware
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "warehouse" }),
    },
  },
}))

const createCaller = createCallerFactory(whPurchaseOrdersRouter)

// Module mock helper
const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "warehouse" }),
  },
}

function withModuleMock(prisma) {
  return { ...MODULE_MOCK, ...prisma }
}

function createTestContext(prisma, permissions = ALL_PERMS) {
  return createMockContext({
    prisma: withModuleMock(prisma),
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

describe("warehouse.purchaseOrders", () => {
  it("requires warehouse module enabled", async () => {
    const prisma = {
      tenantModule: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null) },
      // ...
    }
    const caller = createCaller(createTestContext(prisma))
    await expect(caller.list({ page: 1, pageSize: 10 })).rejects.toThrow()
  })
})
```

### 7B. Test Helpers

**File:** `src/trpc/routers/__tests__/helpers.ts`

Exports:
- `autoMockPrisma(partial)` — Proxy that auto-stubs missing Prisma methods
- `createMockUser(overrides?)` — ContextUser factory
- `createMockSession()` — Session factory
- `createMockContext(overrides?)` — TRPCContext factory (auto-wraps prisma)
- `createMockUserGroup(overrides?)` — UserGroup factory
- `createAdminUser(overrides?)` — admin user with isAdmin=true
- `createUserWithPermissions(permissionIds, overrides?)` — user with specific permissions
- `createMockTenant(overrides?)` — Tenant factory
- `createMockUserTenant(userId, tenantId, tenant?)` — UserTenant with included Tenant

### 7C. Browser E2E Tests (Playwright)

**Example file:** `src/e2e-browser/40-wh-articles.spec.ts`

Pattern:
```ts
import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad, expectPageTitle } from "./helpers/nav";
import { fillInput, submitAndWaitForClose, waitForSheet, expectTableContains, ... } from "./helpers/forms";

test.describe.serial("UC-WH-01: Article Management", () => {
  test("enable warehouse module", async ({ page }) => {
    await navigateTo(page, "/admin/settings");
    // Toggle warehouse module switch
    const whSwitch = page.locator("main#main-content").locator("#module-warehouse");
    // ...
  });

  test("navigate to articles page", async ({ page }) => {
    await navigateTo(page, "/warehouse/articles");
    await expectPageTitle(page, "Artikel");
  });

  test("create an article", async ({ page }) => {
    await navigateTo(page, "/warehouse/articles");
    await page.getByRole("button", { name: "Neuer Artikel" }).click();
    await waitForSheet(page);
    await fillInput(page, "name", ARTICLE_NAME);
    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, ARTICLE_NAME);
  });
});
```

### 7D. E2E Helpers

**`src/e2e-browser/helpers/nav.ts`:**
- `navigateTo(page, path)` — goto + wait for main content
- `navigateViaSidebar(page, href)` — click sidebar link
- `waitForTableLoad(page)` — wait for table row
- `expectPageTitle(page, title)` — assert heading

**`src/e2e-browser/helpers/forms.ts`:**
- `waitForSheet(page)` — wait for sheet-content open
- `fillInput(page, id, value)` — fill by ID
- `selectOption(page, triggerLabel, optionText)` — Radix select
- `submitSheet(page)`, `submitAndWaitForClose(page)` — submit form
- `openRowActions(page, rowText)`, `clickMenuItem(page, text)` — row action menus
- `expectTableContains(page, text)`, `expectTableNotContains(page, text)`
- `clickTab(page, name)` — click tab by name

**`src/e2e-browser/helpers/auth.ts`:**
- `loginAsAdmin(page)`, `loginAsUser(page)` — dev quick-login
- `SEED` constants: `TENANT_ID`, `ADMIN_EMAIL`, etc.

---

## 8. Hooks Patterns

### 8A. Structure

**File pattern:** `src/hooks/use-wh-*.ts` (flat directory, no subdirectories)

Existing warehouse hooks:
- `src/hooks/use-wh-articles.ts` — 313 lines, covers articles, groups, suppliers, BOM
- `src/hooks/use-wh-article-prices.ts` — price-related hooks
- `src/hooks/use-wh-purchase-orders.ts` — 203 lines, PO and position hooks

### 8B. Query Hook Pattern

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useWhPurchaseOrders(options?, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.purchaseOrders.list.queryOptions(
      { ...defaultParams, ...options },
      { enabled }
    )
  )
}
```

### 8C. Mutation Hook Pattern with Invalidation

```ts
export function useCreateWhPurchaseOrder() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.purchaseOrders.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.purchaseOrders.list.queryKey(),
      })
    },
  })
}
```

For WH_04, goods receipt mutations should invalidate:
- `trpc.warehouse.stockMovements` queries (movements list, article movements)
- `trpc.warehouse.articles.list.queryKey()` (stock changed)
- `trpc.warehouse.articles.getById.queryKey()` (article detail)
- `trpc.warehouse.purchaseOrders.getById.queryKey()` (PO status/received changed)
- `trpc.warehouse.purchaseOrders.list.queryKey()` (PO status changed)

---

## 9. UI Components — Article Detail Integration

### 9A. Current Stock Tab Placeholder

**File:** `src/components/warehouse/article-detail.tsx` (lines 223-229)

```tsx
<TabsContent value="stock" className="mt-4">
  <Card>
    <CardContent className="pt-6 text-center text-muted-foreground">
      {t('stockMovementsPlaceholder')}
    </CardContent>
  </Card>
</TabsContent>
```

This will be replaced with the `ArticleMovementsTab` component that shows movement history for the article.

### 9B. Tab Structure

Current tabs: `overview`, `suppliers`, `bom`, `stock`, `prices`

The `stock` tab is already present and will become the movements tab content area.

---

## 10. Tenant Model Relations

### 10A. Current Warehouse Relations on Tenant

**File:** `prisma/schema.prisma` (lines 193-196)

```prisma
// Warehouse
whArticleGroups             WhArticleGroup[]
whArticles                  WhArticle[]
whPurchaseOrders            WhPurchaseOrder[]
```

WH_04 will add:
```prisma
whStockMovements            WhStockMovement[]
```

### 10B. WhArticle Relations to Add

Current WhArticle relations:
```prisma
suppliers WhArticleSupplier[]
bomParent WhBillOfMaterial[] @relation("BomParent")
bomChild  WhBillOfMaterial[] @relation("BomChild")
purchaseOrderPositions WhPurchaseOrderPosition[]
```

WH_04 will add:
```prisma
stockMovements WhStockMovement[]
```

### 10C. WhPurchaseOrder Relations to Add

Currently has `positions WhPurchaseOrderPosition[]`. WH_04 will add:
```prisma
stockMovements WhStockMovement[]
```

---

## 11. Existing TODO / Integration Points

### 11A. adjustStock TODO

**File:** `src/lib/services/wh-article-service.ts` (line 328-329)

```ts
// TODO: When WH_04 (Stock Movements) is implemented, also create a
// WhStockMovement record of type ADJUSTMENT here.
```

This means when WH_04 is implemented, the existing `adjustStock` function should also create a `WhStockMovement` record. The function already records audit logs and has all the data needed (articleId, quantity, reason, previousStock).

### 11B. Article Detail Placeholder

**File:** `src/components/warehouse/article-detail.tsx` (line 226)
Translation key: `stockMovementsPlaceholder`

Replace this placeholder with actual stock movement history component.

---

## 12. Ticket Specification Summary

**File:** `thoughts/shared/tickets/orgAuftrag/TICKET_WH_04_WARENEINGANG.md`

### 12A. New Model: WhStockMovement

Fields: `id`, `tenantId`, `articleId`, `type` (enum), `quantity`, `previousStock`, `newStock`, `date`, `purchaseOrderId?`, `purchaseOrderPositionId?`, `documentId?`, `orderId?`, `inventorySessionId?`, `reason?`, `notes?`, `createdById?`, `createdAt`

Enum: `WhStockMovementType` = `GOODS_RECEIPT`, `WITHDRAWAL`, `ADJUSTMENT`, `INVENTORY`, `RETURN`

### 12B. Router Procedures

Goods receipt sub-router:
- `goodsReceipt.listPendingOrders` (query, wh_stock.view)
- `goodsReceipt.getOrderPositions` (query, wh_stock.view)
- `goodsReceipt.book` (mutation, wh_stock.manage) — batch booking
- `goodsReceipt.bookSingle` (mutation, wh_stock.manage) — single position

Movements sub-router:
- `movements.list` (query, wh_stock.view) — paginated with filters
- `movements.listByArticle` (query, wh_stock.view) — for article detail tab

### 12C. Key Business Logic

Goods receipt booking in a `$transaction`:
1. Validate PO is ORDERED or PARTIALLY_RECEIVED
2. Validate quantity <= (ordered - already received)
3. Create WhStockMovement for each position
4. Update WhArticle.currentStock
5. Update WhPurchaseOrderPosition.receivedQuantity
6. Update WhPurchaseOrder.status (PARTIALLY_RECEIVED or RECEIVED)

### 12D. UI Pages

- `/warehouse/goods-receipt` — Terminal-style goods receipt
- `/warehouse/stock-movements` — Movement history

### 12E. Components

- `goods-receipt-terminal.tsx` — Step wizard: supplier -> PO -> positions -> confirm
- `goods-receipt-position-row.tsx` — Position row with quantity input
- `stock-movement-list.tsx` — Data table with filters
- `article-movements-tab.tsx` — Article detail movements tab

---

## 13. Schema End Position

The current `prisma/schema.prisma` file is **4336 lines** long, ending with the `WhPurchaseOrderPosition` model. New models will be appended after line 4336.

---

## 14. Migration File Naming

Existing warehouse migration: `supabase/migrations/20260323120000_wh_purchase_orders.sql`

Pattern: `YYYYMMDDHHMMSS_description.sql`

WH_04 migration suggestion: `supabase/migrations/20260324120000_wh_stock_movements.sql`

---

## 15. Files to Create (Summary)

Based on existing patterns:

| File | Type | Description |
|------|------|-------------|
| `supabase/migrations/20260324120000_wh_stock_movements.sql` | Migration | New table + enum + indexes |
| `src/lib/services/wh-stock-movement-service.ts` | Service | Business logic |
| `src/lib/services/wh-stock-movement-repository.ts` | Repository | Prisma queries |
| `src/trpc/routers/warehouse/stockMovements.ts` | Router | tRPC procedures |
| `src/hooks/use-wh-stock-movements.ts` | Hooks | React query/mutation hooks |
| `src/components/warehouse/goods-receipt-terminal.tsx` | Component | Terminal UI |
| `src/components/warehouse/goods-receipt-position-row.tsx` | Component | Position row |
| `src/components/warehouse/stock-movement-list.tsx` | Component | Movement table |
| `src/components/warehouse/article-movements-tab.tsx` | Component | Article detail tab |
| `src/app/[locale]/(dashboard)/warehouse/goods-receipt/page.tsx` | Page | Goods receipt route |
| `src/app/[locale]/(dashboard)/warehouse/stock-movements/page.tsx` | Page | Movements route |
| `src/trpc/routers/__tests__/whStockMovements-router.test.ts` | Test | Router tests |
| `src/lib/services/__tests__/wh-stock-movement-service.test.ts` | Test | Service tests |
| `src/e2e-browser/43-wh-goods-receipt.spec.ts` | Test | Browser E2E tests |

## 16. Files to Modify (Summary)

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add WhStockMovementType enum, WhStockMovement model, relations on Tenant/WhArticle/WhPurchaseOrder |
| `src/lib/auth/permission-catalog.ts` | Add wh_stock.view, wh_stock.manage permissions |
| `src/trpc/routers/warehouse/index.ts` | Add stockMovements router |
| `src/lib/services/wh-article-service.ts` | Update adjustStock to create WhStockMovement |
| `src/components/warehouse/article-detail.tsx` | Replace stock tab placeholder with ArticleMovementsTab |
| `src/components/layout/sidebar/sidebar-nav-config.ts` | Add goods receipt and stock movements nav items |
| `messages/de.json` | Add warehouseGoodsReceipt and warehouseStockMovements sections, nav keys |
| `messages/en.json` | Add warehouseGoodsReceipt and warehouseStockMovements sections, nav keys |
