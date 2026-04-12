# Research: WH_05 Lagerentnahmen (Stock Withdrawals)

**Date:** 2026-03-24
**Ticket:** TICKET_WH_05_LAGERENTNAHMEN.md

---

## 1. Existing Warehouse Module Structure

### Router layer (`src/trpc/routers/warehouse/`)

| File | Router | Description |
|------|--------|-------------|
| `index.ts` | `warehouseRouter` | Merges `articles`, `articlePrices`, `purchaseOrders`, `stockMovements` |
| `articles.ts` | `whArticlesRouter` | Article CRUD, groups, suppliers, BOM, adjustStock, search |
| `articlePrices.ts` | `whArticlePricesRouter` | Price list management for articles |
| `purchaseOrders.ts` | `whPurchaseOrdersRouter` | PO CRUD, positions sub-router, sendOrder, cancel, reorderSuggestions |
| `stockMovements.ts` | `whStockMovementsRouter` | Two sub-routers: `goodsReceipt` (listPendingOrders, getOrderPositions, book, bookSingle) and `movements` (list, listByArticle) |

**Root router:** `src/trpc/routers/_app.ts` includes `warehouse: warehouseRouter` (line 161).

**New withdrawals router will be added at:** `src/trpc/routers/warehouse/withdrawals.ts`, then merged in `src/trpc/routers/warehouse/index.ts` as `withdrawals: whWithdrawalsRouter`.

### Service layer (`src/lib/services/`)

| File | Description |
|------|-------------|
| `wh-article-service.ts` | Article CRUD, stock adjust, suppliers, BOM. Error classes: `WhArticleNotFoundError`, `WhArticleValidationError`, `WhArticleConflictError` |
| `wh-article-repository.ts` | Prisma queries for articles |
| `wh-article-group-service.ts` | Article group tree operations |
| `wh-article-price-service.ts` | Price list operations |
| `wh-purchase-order-service.ts` | PO business logic |
| `wh-purchase-order-repository.ts` | PO Prisma queries |
| `wh-stock-movement-service.ts` | Goods receipt logic, stock movement queries |
| `wh-stock-movement-repository.ts` | Stock movement Prisma queries |

### Hooks (`src/hooks/`)

| File | Hooks |
|------|-------|
| `use-wh-articles.ts` | `useWhArticles`, `useWhArticle`, `useWhArticleSearch`, `useWhArticleGroups`, create/update/delete mutations |
| `use-wh-article-prices.ts` | Price-related hooks |
| `use-wh-purchase-orders.ts` | PO list/detail/create/update/delete/send/cancel hooks |
| `use-wh-stock-movements.ts` | `useWhPendingOrders`, `useWhOrderPositions`, `useWhStockMovements`, `useWhArticleMovements`, `useBookGoodsReceipt`, `useBookSinglePosition` |

All hooks are re-exported from `src/hooks/index.ts` (lines ~840-882).

### UI Components (`src/components/warehouse/`)

26 existing component files. Key ones:
- `goods-receipt-terminal.tsx` — Step-based wizard (4 steps: supplier, order, positions, confirm)
- `goods-receipt-position-row.tsx` — Row component for position quantity entry
- `stock-movement-list.tsx` — Paginated movement table with type filter
- `article-movements-tab.tsx` — Article detail movements tab
- `article-search-popover.tsx` — Reusable article search/autocomplete

### Page Routes (`src/app/[locale]/(dashboard)/warehouse/`)

| Route | Page Component |
|-------|---------------|
| `articles/page.tsx` | Article list |
| `articles/[id]/page.tsx` | Article detail |
| `prices/page.tsx` | Price lists |
| `purchase-orders/page.tsx` | PO list |
| `purchase-orders/[id]/page.tsx` | PO detail |
| `purchase-orders/new/page.tsx` | New PO form |
| `purchase-orders/suggestions/page.tsx` | Reorder suggestions |
| `goods-receipt/page.tsx` | Goods receipt terminal |
| `stock-movements/page.tsx` | Stock movement history |

---

## 2. WhStockMovement Model

### Prisma Schema (lines 4361-4391 of `prisma/schema.prisma`)

```prisma
enum WhStockMovementType {
  GOODS_RECEIPT
  WITHDRAWAL
  ADJUSTMENT
  INVENTORY
  RETURN
  @@map("wh_stock_movement_type")
}

model WhStockMovement {
  id                       String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId                 String              @map("tenant_id") @db.Uuid
  articleId                String              @map("article_id") @db.Uuid
  type                     WhStockMovementType
  quantity                 Float
  previousStock            Float               @map("previous_stock")
  newStock                 Float               @map("new_stock")
  date                     DateTime            @default(now()) @db.Timestamptz(6)

  purchaseOrderId          String?             @map("purchase_order_id") @db.Uuid
  purchaseOrderPositionId  String?             @map("purchase_order_position_id") @db.Uuid
  documentId               String?             @map("document_id") @db.Uuid
  orderId                  String?             @map("order_id") @db.Uuid
  inventorySessionId       String?             @map("inventory_session_id") @db.Uuid

  reason                   String?
  notes                    String?
  createdById              String?             @map("created_by_id") @db.Uuid
  createdAt                DateTime            @default(now()) @map("created_at") @db.Timestamptz(6)

  tenant        Tenant           @relation(fields: [tenantId], references: [id])
  article       WhArticle        @relation(fields: [articleId], references: [id])
  purchaseOrder WhPurchaseOrder? @relation(fields: [purchaseOrderId], references: [id], onDelete: SetNull)

  @@index([tenantId, articleId])
  @@index([tenantId, type])
  @@index([tenantId, date])
  @@index([tenantId, purchaseOrderId])
  @@map("wh_stock_movements")
}
```

### Key Fields for Withdrawals

- `type: WITHDRAWAL` — already exists in the enum
- `orderId` — for withdrawal against a Terp order (already exists)
- `documentId` — for withdrawal against a delivery note (already exists)
- **`machineId`** — DOES NOT YET EXIST. Ticket requires adding this field to the schema and creating a migration.

### Migration File

Existing migration: `supabase/migrations/20260324120000_wh_stock_movements.sql` creates the table and indexes.

**New migration needed:** Must add `machine_id` column (VARCHAR or TEXT, nullable) to `wh_stock_movements` table.

---

## 3. Warehouse Router Patterns

### Module Guard

All warehouse routers use:
```ts
import { requireModule } from "@/lib/modules"
const whProcedure = tenantProcedure.use(requireModule("warehouse"))
```

`requireModule` is defined in `src/lib/modules/index.ts`. It:
1. Checks `tenantId` exists (throws FORBIDDEN if not)
2. Queries `prisma.tenantModule.findUnique({ where: { tenantId_module: { tenantId, module } } })`
3. Throws FORBIDDEN if module not enabled

### Permission Pattern

```ts
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { requirePermission } from "@/lib/auth/middleware"

const WH_STOCK_VIEW = permissionIdByKey("wh_stock.view")!
const WH_STOCK_MANAGE = permissionIdByKey("wh_stock.manage")!
```

Permission catalog (lines 290-291 of `src/lib/auth/permission-catalog.ts`):
```ts
p("wh_stock.view", "wh_stock", "view", "View stock movements and goods receipts"),
p("wh_stock.manage", "wh_stock", "manage", "Manage goods receipts and stock bookings"),
```

### Sub-Router Pattern

The stock movements router uses sub-routers:
```ts
export const whStockMovementsRouter = createTRPCRouter({
  goodsReceipt: goodsReceiptRouter,
  movements: movementsRouter,
})
```

The withdrawals router should follow this same pattern and can either:
- Be a new top-level sub-router in `warehouse/index.ts`: `withdrawals: whWithdrawalsRouter`
- Or be added as a sub-router under `stockMovements` (but ticket specifies separate file)

### Procedure Pattern

Each procedure follows:
```ts
whProcedure
  .use(requirePermission(WH_STOCK_MANAGE))
  .input(z.object({ ... }))
  .mutation(async ({ ctx, input }) => {
    try {
      const audit = {
        userId: ctx.user!.id,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      }
      return await service.someFunction(
        ctx.prisma as unknown as PrismaClient,
        ctx.tenantId!,
        input,
        ctx.user!.id,
        audit
      )
    } catch (err) {
      handleServiceError(err)
    }
  })
```

---

## 4. i18n Translation Patterns

### File Locations

- `messages/de.json` — German translations
- `messages/en.json` — English translations

### Key Namespaces for Warehouse

| Namespace | Usage |
|-----------|-------|
| `nav.warehouseSection` | Sidebar section title ("Lager" / "Warehouse") |
| `nav.warehouseArticles` | Sidebar item ("Artikel" / "Articles") |
| `nav.warehouseGoodsReceipt` | Sidebar item ("Wareneingang" / "Goods Receipt") |
| `nav.warehouseStockMovements` | Sidebar item ("Lagerbewegungen" / "Stock Movements") |
| `warehouseArticles` | Article management page keys (lines ~5584) |
| `warehousePurchaseOrders` | Purchase order page keys (lines ~5700) |
| `warehouseGoodsReceipt` | Goods receipt terminal keys (lines ~5851-5899) |
| `warehouseStockMovements` | Stock movements page keys (lines ~5900-5931) |

### Translation Key Pattern

Components use `useTranslations('warehouseGoodsReceipt')` and reference keys like:
- `pageTitle`, `noPermission`, `loading`
- Step keys: `stepSupplier`, `stepOrder`, `stepPositions`, `stepConfirm`
- Column keys: `colArticle`, `colQuantity`, etc.
- Action keys: `actionBook`, `actionCancel`, `actionBack`, `actionNext`
- Toast keys: `toastBooked`, `toastError`
- Error keys: `errorQuantityExceeds`, `errorNoPositions`

**New namespace needed:** `warehouseWithdrawals` following the same pattern.

### Existing Movement Type Translations

Already defined in `warehouseStockMovements`:
```json
"typeGoodsReceipt": "Wareneingang" / "Goods Receipt",
"typeWithdrawal": "Lagerentnahme" / "Withdrawal",
"typeAdjustment": "Korrektur" / "Adjustment",
"typeInventory": "Inventur" / "Inventory",
"typeReturn": "Ruecklieferung" / "Return"
```

---

## 5. E2E Browser Test Patterns

### File Naming

Warehouse tests use 40-49 prefix:
- `40-wh-articles.spec.ts` — UC-WH-01
- `41-wh-prices.spec.ts` — UC-WH-02
- `42-wh-purchase-orders.spec.ts` — UC-WH-03
- `43-wh-goods-receipt.spec.ts` — UC-WH-04
- **`44-wh-withdrawals.spec.ts`** — UC-WH-05 (new)

### Test Structure Pattern

```ts
import { test, expect } from "@playwright/test";
import { navigateTo } from "./helpers/nav";

test.describe.serial("UC-WH-04: Goods Receipt & Stock Movements", () => {
  test("navigate to page", async ({ page }) => {
    await navigateTo(page, "/warehouse/goods-receipt");
    const main = page.locator("main#main-content");
    await expect(
      main.getByRole("heading", { name: /Wareneingang/i }),
    ).toBeVisible({ timeout: 10_000 });
  });
  // ... more tests
});
```

### Key Helpers

From `src/e2e-browser/helpers/`:

**nav.ts:**
- `navigateTo(page, path)` — Navigate and wait for `main#main-content`
- `waitForTableLoad(page)` — Wait for first table row
- `expectPageTitle(page, title)` — Assert h1 text

**forms.ts:**
- `waitForSheet(page)` — Wait for sheet content visible
- `fillInput(page, id, value)` — Fill input by ID
- `selectOption(page, triggerLabel, optionText)` — Select from combobox
- `submitAndWaitForClose(page)` — Submit sheet and wait for close
- `expectTableContains(page, text)` — Assert table row with text
- `openRowActions(page, rowText)` — Click row action menu
- `clickMenuItem(page, text)` — Click menu item
- `clickTab(page, name)` — Click a tab

**auth.ts:**
- `ADMIN_STORAGE = ".auth/admin.json"` — Auth state file
- `SEED.TENANT_ID = "10000000-0000-0000-0000-000000000001"` — Test tenant
- `loginAsAdmin(page)` — Quick login via dev buttons

### Global Setup

`src/e2e-browser/global-setup.ts` runs SQL cleanup before all tests. Key warehouse cleanup (lines 112-138):
```sql
DELETE FROM wh_stock_movements WHERE purchase_order_id IN (
  SELECT id FROM wh_purchase_orders WHERE tenant_id = '10000000-0000-0000-0000-000000000001'
  AND supplier_id IN (SELECT id FROM crm_addresses WHERE company LIKE 'E2E%')
);
DELETE FROM wh_purchase_order_positions WHERE purchase_order_id IN (...);
DELETE FROM wh_purchase_orders WHERE ...;
DELETE FROM wh_articles WHERE name LIKE 'E2E%';
DELETE FROM wh_article_groups WHERE name LIKE 'E2E%';
```

**New cleanup needed:** Delete withdrawal movements (type=WITHDRAWAL) for E2E articles. Add to global-setup.ts SQL.

### Playwright Config

`playwright.config.ts`:
- `globalSetup: "./src/e2e-browser/global-setup.ts"`
- `testDir: "src/e2e-browser"`
- `fullyParallel: false`, `workers: 1`
- Viewport: `1280x1080`
- Storage state: `.auth/admin.json` (admin user)
- Base URL: `http://localhost:3001`

---

## 6. Tenant Isolation Patterns

### Service Layer

All service functions accept `tenantId` as a parameter. Every Prisma query includes `tenantId` in the `where` clause.

**Pattern from `wh-stock-movement-service.ts`:**
```ts
export async function bookGoodsReceipt(prisma, tenantId, input, userId, audit) {
  const result = await prisma.$transaction(async (tx) => {
    const po = await tx.whPurchaseOrder.findFirst({
      where: { id: input.purchaseOrderId, tenantId },  // <-- tenantId always included
    })
    if (!po) throw new WhStockMovementNotFoundError("Purchase order not found")
    // ...
  })
}
```

**Pattern from `bookSinglePosition`:**
```ts
const position = await prisma.whPurchaseOrderPosition.findFirst({
  where: { id: input.purchaseOrderPositionId },
  include: { purchaseOrder: { select: { id: true, tenantId: true } } },
})
if (!position || position.purchaseOrder.tenantId !== tenantId) {
  throw new WhStockMovementNotFoundError("Position not found")
}
```

### Repository Layer

`wh-stock-movement-repository.ts` always includes `tenantId` in queries:
```ts
export async function findMany(prisma, tenantId, params) {
  const where = { tenantId }
  // ... add filters
  return prisma.whStockMovement.findMany({ where, ... })
}
```

### Test Pattern

**Mandatory `describe("tenant isolation")` block** in every service test file.

From `wh-stock-movement-service.test.ts`:
```ts
describe("tenant isolation", () => {
  it("listMovements returns empty for other tenant", async () => {
    const prisma = createMockPrisma({ whStockMovement: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) } })
    const result = await service.listMovements(prisma, OTHER_TENANT_ID, { page: 1, pageSize: 25 })
    expect(result.items).toHaveLength(0)
    expect(prisma.whStockMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: OTHER_TENANT_ID }) })
    )
  })

  it("bookGoodsReceipt rejects PO from another tenant", async () => {
    const prisma = createMockPrisma({ whPurchaseOrder: { findFirst: vi.fn().mockResolvedValue(null) } })
    await expect(
      service.bookGoodsReceipt(prisma, OTHER_TENANT_ID, { ... }, USER_ID)
    ).rejects.toThrow(service.WhStockMovementNotFoundError)
  })
})
```

---

## 7. Service + Repository Pattern for Warehouse

### Error Class Pattern

```ts
export class WhStockMovementNotFoundError extends Error {
  constructor(message = "Stock movement not found") {
    super(message)
    this.name = "WhStockMovementNotFoundError"
  }
}

export class WhStockMovementValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhStockMovementValidationError"
  }
}
```

Error class naming convention: `Wh{Entity}{ErrorType}Error` where ErrorType is one of:
- `NotFound` — mapped to tRPC `NOT_FOUND` by `handleServiceError`
- `Validation` / `Invalid` — mapped to `BAD_REQUEST`
- `Conflict` / `Duplicate` — mapped to `CONFLICT`
- `Forbidden` / `AccessDenied` — mapped to `FORBIDDEN`

### Transaction Pattern

`bookGoodsReceipt` uses `prisma.$transaction(async (tx) => { ... })` for:
1. Validate PO exists and belongs to tenant
2. Validate PO status
3. For each position: validate, calculate stock, create movement, update article stock, update position
4. Update PO status

### Audit Log Pattern

```ts
if (audit) {
  await auditLog.log(prisma, {
    tenantId,
    userId: audit.userId,
    action: "goods_receipt",
    entityType: "wh_stock_movement",
    entityId: input.purchaseOrderId,
    entityName: null,
    changes: { positions: input.positions.length, purchaseOrderId: input.purchaseOrderId },
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch((err) => console.error("[AuditLog] Failed:", err))
}
```

### `adjustStock` in article-service (Pattern for Withdrawal)

The `adjustStock` function in `wh-article-service.ts` (line 312) shows how non-goods-receipt movements work:
```ts
export async function adjustStock(prisma, tenantId, id, quantity, reason, audit) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new WhArticleNotFoundError()
  if (!existing.stockTracking) throw new WhArticleValidationError("Stock tracking is not enabled")

  await stockMovementRepo.create(prisma, {
    tenantId, articleId: id, type: "ADJUSTMENT",
    quantity, previousStock: existing.currentStock,
    newStock: existing.currentStock + quantity,
    reason: reason || null, createdById: audit?.userId ?? null,
  })

  const result = await repo.updateStock(prisma, tenantId, id, quantity)
  // ... audit log
  return result
}
```

---

## 8. UI Component Patterns

### Terminal-Style Interface (Goods Receipt)

`goods-receipt-terminal.tsx` uses a 4-step wizard pattern:
- Step state managed via `React.useState<ReceiveState>`
- Steps: 1=SelectSupplier, 2=SelectOrder, 3=Positions, 4=Confirm
- Step indicator with `ChevronRight` icons and colored circles
- Each step in a `Card` with `CardHeader`/`CardContent`
- Loading: `Skeleton` components
- Empty: centered text with `text-muted-foreground`
- Actions: `Button` components with `variant="ghost"` for back, default for primary
- Success: `toast.success(t('toastBooked'))` via sonner
- Errors: `toast.error(t('toastError'))`

### Table Pattern (Stock Movements)

`stock-movement-list.tsx`:
- Type filter: `Select` component with all movement types
- Paginated table with `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableCell`
- Movement type badges: `Badge` with colored styles per type
- Quantity formatting: positive = green `+N`, negative = red `-N`
- Pagination: simple prev/next buttons

### Article Search (Reusable)

`article-search-popover.tsx`:
- Uses `useWhArticleSearch(query)` hook
- Dropdown results on focus/type
- Returns `{ id, number, name, unit, sellPrice, buyPrice, vatRate }`

### Page Component Pattern

```tsx
'use client'
import { useTranslations } from 'next-intl'
import { useHasPermission } from '@/hooks'
import { SomeComponent } from '@/components/warehouse/some-component'

export default function WhSomePage() {
  const t = useTranslations('warehouseSome')
  const { allowed: canAccess } = useHasPermission(['wh_stock.manage'])

  if (canAccess === false) {
    return <div className="p-6 text-center text-muted-foreground">{t('noPermission')}</div>
  }

  return (
    <div className="space-y-4 p-6">
      <SomeComponent />
    </div>
  )
}
```

---

## 9. Hooks Pattern for Warehouse

### Query Hook Pattern

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useWhStockMovements(options?, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.stockMovements.movements.list.queryOptions(
      { ...options, page: options?.page ?? 1, pageSize: options?.pageSize ?? 25 },
      { enabled }
    )
  )
}
```

### Mutation Hook Pattern

```ts
export function useBookGoodsReceipt() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.stockMovements.goodsReceipt.book.mutationOptions(),
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.stockMovements.movements.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.articles.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.articles.getById.queryKey() })
    },
  })
}
```

---

## 10. Sidebar Navigation Config

`src/components/layout/sidebar/sidebar-nav-config.ts` (lines 365-408):

```ts
{
  titleKey: 'warehouseSection',
  module: 'warehouse',
  items: [
    { titleKey: 'warehouseOverview', href: '/warehouse', icon: Warehouse, module: 'warehouse' },
    { titleKey: 'warehouseArticles', href: '/warehouse/articles', icon: Package, module: 'warehouse', permissions: ['wh_articles.view'] },
    { titleKey: 'warehousePriceLists', href: '/warehouse/prices', icon: Tag, module: 'warehouse', permissions: ['billing_price_lists.view'] },
    { titleKey: 'warehousePurchaseOrders', href: '/warehouse/purchase-orders', icon: ShoppingCart, module: 'warehouse', permissions: ['wh_purchase_orders.view'] },
    { titleKey: 'warehouseGoodsReceipt', href: '/warehouse/goods-receipt', icon: PackageCheck, module: 'warehouse', permissions: ['wh_stock.manage'] },
    { titleKey: 'warehouseStockMovements', href: '/warehouse/stock-movements', icon: ArrowRightLeft, module: 'warehouse', permissions: ['wh_stock.view'] },
  ],
}
```

**New item needed:** `warehouseWithdrawals` with href `/warehouse/withdrawals`, appropriate icon (e.g., `PackageMinus` or `PackageX`), module `warehouse`, permissions `['wh_stock.manage']`.

---

## 11. Router Test Patterns

### Test Helpers (`src/trpc/routers/__tests__/helpers.ts`)

Key factories:
- `createMockContext(overrides)` — Creates TRPCContext, auto-wraps prisma via `autoMockPrisma`
- `createMockUser(overrides)` — Creates ContextUser
- `createUserWithPermissions(permissionIds, overrides)` — User with specific permissions
- `createMockUserTenant(userId, tenantId)` — UserTenant relation
- `createMockSession()` — Supabase session mock
- `autoMockPrisma(partial)` — Proxy that auto-stubs missing Prisma model methods

### Router Test Pattern (`whStockMovements-router.test.ts`)

```ts
import { createCallerFactory } from "@/trpc/init"
import { whStockMovementsRouter } from "../warehouse/stockMovements"

vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "warehouse" }),
    },
  },
}))

const createCaller = createCallerFactory(whStockMovementsRouter)

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

// Tests cover:
// 1. Happy path (returns expected data)
// 2. Permission rejection (no wh_stock.view/manage)
// 3. Module rejection (warehouse module not enabled)
// 4. Input validation (empty arrays, invalid UUIDs via zod)
```

---

## 12. Summary of What Needs to Be Created

### Schema / Migration
1. **New Prisma field:** `machineId String? @map("machine_id")` on `WhStockMovement` model
2. **New migration:** `ALTER TABLE wh_stock_movements ADD COLUMN machine_id TEXT;`

### Backend
3. **Service:** `src/lib/services/wh-withdrawal-service.ts` with:
   - `createWithdrawal` (single item, transaction)
   - `createBatchWithdrawal` (multiple items, transaction)
   - `cancelWithdrawal` (reversal, transaction)
   - `listWithdrawals` (paginated, filtered)
   - `listByOrder` / `listByDocument`
   - Error classes: `WhWithdrawalNotFoundError`, `WhWithdrawalValidationError`

4. **Router:** `src/trpc/routers/warehouse/withdrawals.ts` with procedures:
   - `create`, `createBatch`, `cancel`, `list`, `listByOrder`, `listByDocument`

5. **Update warehouse index:** Add `withdrawals: whWithdrawalsRouter` to `src/trpc/routers/warehouse/index.ts`

### Frontend
6. **Hooks:** `src/hooks/use-wh-withdrawals.ts` with:
   - `useWhWithdrawals(filters)`, `useWhWithdrawalsByOrder(orderId)`, `useWhWithdrawalsByDocument(documentId)`
   - `useCreateWhWithdrawal()`, `useCreateBatchWhWithdrawal()`, `useCancelWhWithdrawal()`

7. **Components:** All in `src/components/warehouse/`:
   - `withdrawal-terminal.tsx` — Step-based wizard
   - `withdrawal-article-row.tsx` — Article row with quantity input
   - `withdrawal-history.tsx` — Withdrawal history table
   - `withdrawal-cancel-dialog.tsx` — Cancel confirmation dialog

8. **Page route:** `src/app/[locale]/(dashboard)/warehouse/withdrawals/page.tsx`

9. **Sidebar nav:** Add `warehouseWithdrawals` item in `sidebar-nav-config.ts`

10. **i18n:** Add `warehouseWithdrawals` namespace to both `messages/de.json` and `messages/en.json`

11. **Hook index:** Export new hooks from `src/hooks/index.ts`

### Tests
12. **Service tests:** `src/lib/services/__tests__/wh-withdrawal-service.test.ts` with tenant isolation block
13. **Router tests:** `src/trpc/routers/__tests__/whWithdrawals-router.test.ts`
14. **E2E tests:** `src/e2e-browser/44-wh-withdrawals.spec.ts`
15. **Global setup:** Add withdrawal cleanup SQL to `src/e2e-browser/global-setup.ts`
