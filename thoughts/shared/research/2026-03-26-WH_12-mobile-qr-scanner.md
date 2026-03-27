# WH_12 Mobile QR-Scanner -- Codebase Research

Date: 2026-03-26

---

## 1. Existing Warehouse Services

### 1.1 Article Service (WH_01)

**Files:**
- `src/lib/services/wh-article-service.ts` (business logic)
- `src/lib/services/wh-article-repository.ts` (data access)

**WhArticle fields** (from `prisma/schema.prisma:4221`):
- `id` (UUID), `tenantId` (UUID), `number` (VarChar 50), `name` (VarChar 255)
- `description`, `descriptionAlt`, `groupId`, `matchCode`
- `unit` (default "Stk"), `vatRate` (default 19.0), `sellPrice`, `buyPrice`
- `stockTracking` (boolean, default false), `currentStock` (float, default 0), `minStock`
- `warehouseLocation`, `images` (JSONB), `isActive` (boolean, default true)
- `createdById`, `createdAt`, `updatedAt`

**Unique constraint:** `@@unique([tenantId, number])` -- article numbers are unique per tenant.

**Tenant isolation pattern:** Every repository function accepts `tenantId` and includes it in `where` clauses. Example from `findById`:
```ts
return prisma.whArticle.findFirst({
  where: { id, tenantId },
  include: { group: true, suppliers: {...}, bomParent: {...} },
})
```

**Article number generation:** Uses `numberSeqService.getNextNumber(prisma, tenantId, "article")` -- auto-generated, not user-provided.

**Key repository function for QR resolution** -- `findByNumber` (line 121-129):
```ts
export async function findByNumber(
  prisma: PrismaClient,
  tenantId: string,
  number: string
) {
  return prisma.whArticle.findFirst({
    where: { tenantId, number },
  })
}
```

**Article search** (`repo.search`, line 210-239):
```ts
return prisma.whArticle.findMany({
  where: {
    tenantId,
    isActive: true,
    OR: [
      { number: { startsWith: query, mode: "insensitive" } },
      { name: { contains: query, mode: "insensitive" } },
    ],
  },
  select: {
    id: true, number: true, name: true, unit: true,
    sellPrice: true, buyPrice: true, vatRate: true,
    currentStock: true, minStock: true,
  },
  orderBy: { number: "asc" },
  take: limit,
})
```

### 1.2 Goods Receipt / Stock Movement Service (WH_04)

**Files:**
- `src/lib/services/wh-stock-movement-service.ts`
- `src/lib/services/wh-stock-movement-repository.ts`

**`bookGoodsReceipt` function** (line 93-251): Takes `purchaseOrderId` + array of `{ positionId, quantity }`. Runs in `$transaction`. For each position:
1. Validates PO status is ORDERED or PARTIALLY_RECEIVED
2. Validates position exists and is ARTICLE type
3. Validates quantity does not exceed remaining
4. Creates `WhStockMovement` with type `GOODS_RECEIPT`, positive quantity
5. Updates `WhArticle.currentStock`
6. Updates `WhPurchaseOrderPosition.receivedQuantity`
7. Updates PO status (PARTIALLY_RECEIVED or RECEIVED)

**`bookSinglePosition`** (line 253-284): Convenience wrapper that looks up the PO from a position ID and calls `bookGoodsReceipt`.

**Error classes:** `WhStockMovementNotFoundError`, `WhStockMovementValidationError`

### 1.3 Withdrawal Service (WH_05)

**File:** `src/lib/services/wh-withdrawal-service.ts`

**`createWithdrawal`** (line 62-151): Takes `articleId`, `quantity`, `referenceType` (ORDER|DOCUMENT|MACHINE|NONE), optional `referenceId`/`machineId`, `notes`. In `$transaction`:
1. Validates article exists, belongs to tenant
2. Validates `stockTracking` is enabled
3. Validates sufficient stock (`currentStock >= quantity`)
4. Creates `WhStockMovement` with type `WITHDRAWAL`, **negative quantity** (`-quantity`)
5. Updates `WhArticle.currentStock`

**`createBatchWithdrawal`** (line 153-248): Same logic but for multiple items in a single transaction.

**`cancelWithdrawal`** (line 250-339): Storno/reversal pattern:
1. Finds original movement by ID + tenantId
2. Validates type is `WITHDRAWAL` or `DELIVERY_NOTE`
3. Validates original quantity is negative (not already a reversal)
4. Creates **reversal movement**: same type (`WITHDRAWAL`), **positive quantity** (`Math.abs(original.quantity)`)
5. Updates article stock by adding back the reversed quantity
6. Sets reason to `"Storno of movement ${movementId}"`

### 1.4 Inventur (WH_08) -- NOT YET IMPLEMENTED

**WH_08 exists only as a ticket definition:** `thoughts/shared/tickets/orgAuftrag/TICKET_WH_08_INVENTUR.md`

No service, repository, router, or Prisma models exist yet. The ticket defines:
- `WhInventorySession` model (OPEN -> REVIEW -> COMMITTED or CANCELLED)
- `WhInventoryCount` model (sessionId, articleId, expectedStock, countedStock, difference)
- Permissions: `wh_inventory.view`, `wh_inventory.count`, `wh_inventory.commit`
- Router: `warehouse/inventory.ts`
- Service: `wh-inventory-service.ts` + `wh-inventory-repository.ts`

The `WhStockMovement` model already has `inventorySessionId` field (nullable UUID) ready for WH_08.

The `WhStockMovementType` enum already includes `INVENTORY` as a valid type.

### 1.5 Correction Service (WH_09)

**File:** `src/lib/services/wh-correction-service.ts`

Runs automated correction checks (negative stock, duplicate receipts, overdue orders, stock mismatches, etc.). Not directly relevant to QR scanner but shows the pattern for warehouse consistency checking.

### 1.6 Reservation Service (WH_10)

**File:** `src/lib/services/wh-reservation-service.ts`

Stock reservations created automatically on ORDER_CONFIRMATION finalization. Not directly relevant to QR scanning.

---

## 2. Prisma Schema -- Key Models

### WhArticle (line 4221-4262)
See section 1.1 above. Key relation for scanner:
- `@@unique([tenantId, number])` -- enables efficient lookup by tenant + article number

### WhStockMovement (line 4444-4476)
```
id, tenantId, articleId, type (WhStockMovementType), quantity, previousStock, newStock,
date, purchaseOrderId, purchaseOrderPositionId, documentId, orderId,
inventorySessionId, machineId, reason, notes, createdById, createdAt
```

### WhStockMovementType enum (line 4333-4342)
```
GOODS_RECEIPT, WITHDRAWAL, ADJUSTMENT, INVENTORY, RETURN, DELIVERY_NOTE
```

### Tenant model (line 85-115)
```
id, name, slug, settings (JSONB), isActive, addressStreet, addressZip, addressCity,
addressCountry, phone, email, ...
```
The `slug` field (VarChar 100, unique) could potentially be used for tenant identification in QR codes, but the ticket specifies using the first 6 characters of the tenant UUID.

---

## 3. Existing Router Patterns

### Router Structure (example: `src/trpc/routers/warehouse/withdrawals.ts`)

```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as withdrawalService from "@/lib/services/wh-withdrawal-service"
import type { PrismaClient } from "@/generated/prisma/client"

const WH_STOCK_VIEW = permissionIdByKey("wh_stock.view")!
const WH_STOCK_MANAGE = permissionIdByKey("wh_stock.manage")!

const whProcedure = tenantProcedure.use(requireModule("warehouse"))

export const whWithdrawalsRouter = createTRPCRouter({
  create: whProcedure
    .use(requirePermission(WH_STOCK_MANAGE))
    .input(z.object({ ... }))
    .mutation(async ({ ctx, input }) => {
      try {
        const audit = {
          userId: ctx.user!.id,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        }
        return await withdrawalService.createWithdrawal(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          ctx.user!.id,
          audit
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
```

**Key patterns:**
1. `tenantProcedure.use(requireModule("warehouse"))` -- base procedure with module guard
2. `.use(requirePermission(PERMISSION_ID))` -- per-procedure permission check
3. `ctx.prisma as unknown as PrismaClient` -- cast needed throughout
4. `ctx.tenantId!` -- tenantId from context
5. `ctx.user!.id` -- user ID from context
6. `handleServiceError(err)` in catch block -- maps service errors to tRPC errors

### Warehouse Router Index (`src/trpc/routers/warehouse/index.ts`)

```ts
export const warehouseRouter = createTRPCRouter({
  articles: whArticlesRouter,
  articlePrices: whArticlePricesRouter,
  purchaseOrders: whPurchaseOrdersRouter,
  stockMovements: whStockMovementsRouter,
  withdrawals: whWithdrawalsRouter,
  supplierInvoices: whSupplierInvoicesRouter,
  corrections: whCorrectionsRouter,
  reservations: whReservationsRouter,
})
```

Registered in `_app.ts` as: `warehouse: warehouseRouter`

### Sub-router pattern (from `stockMovements.ts`)

Stock movements uses nested sub-routers:
```ts
export const whStockMovementsRouter = createTRPCRouter({
  goodsReceipt: goodsReceiptRouter,
  movements: movementsRouter,
})
```

### Error mapping (`src/trpc/errors.ts`)

`handleServiceError` maps by error class name suffix:
- `*NotFoundError` -> `NOT_FOUND`
- `*ValidationError` / `*InvalidError` -> `BAD_REQUEST`
- `*ConflictError` / `*DuplicateError` -> `CONFLICT`
- `*ForbiddenError` / `*AccessDeniedError` -> `FORBIDDEN`

---

## 4. Permission Catalog

**File:** `src/lib/auth/permission-catalog.ts`

Uses deterministic UUID generation: `uuidv5(key, PERMISSION_NAMESPACE)` where `PERMISSION_NAMESPACE = "f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1"`.

Permissions are registered as:
```ts
p("wh_stock.view", "wh_stock", "view", "View stock movements and goods receipts"),
p("wh_stock.manage", "wh_stock", "manage", "Manage goods receipts and stock bookings"),
```

Currently 93 permissions total. The catalog does NOT yet contain `wh_qr.scan` or `wh_qr.print` -- these need to be added.

Existing warehouse permissions:
- `wh_articles.view`, `wh_articles.create`, `wh_articles.edit`, `wh_articles.delete`
- `wh_article_groups.manage`
- `wh_articles.upload_image`, `wh_articles.delete_image`
- `wh_purchase_orders.view`, `wh_purchase_orders.create`, `wh_purchase_orders.edit`, `wh_purchase_orders.delete`, `wh_purchase_orders.order`
- `wh_stock.view`, `wh_stock.manage`
- `wh_supplier_invoices.view`, `wh_supplier_invoices.create`, `wh_supplier_invoices.edit`, `wh_supplier_invoices.pay`
- `wh_corrections.view`, `wh_corrections.manage`, `wh_corrections.run`
- `wh_reservations.view`, `wh_reservations.manage`

Lookup functions:
- `permissionIdByKey(key)` -> UUID string
- `lookupPermission(id)` -> Permission object

---

## 5. Existing PDF Generation

### Pattern: `@react-pdf/renderer`

**Already installed as dependency** in `package.json` (line 71):
```
"@react-pdf/renderer": "^4.3.2"
```

### PDF Component Files

Located in `src/lib/pdf/`:
- `purchase-order-pdf.tsx` -- Full A4 purchase order document
- `purchase-order-position-table-pdf.tsx` -- Position table sub-component
- `billing-document-pdf.tsx` -- Billing/invoice document
- `position-table-pdf.tsx` -- Generic position table
- `totals-summary-pdf.tsx` -- Totals block
- `fusszeile-pdf.tsx` -- Footer with tenant config
- `rich-text-pdf.tsx` -- Rich text rendering

### PDF Service Pattern (`src/lib/services/wh-purchase-order-pdf-service.ts`)

```ts
import { renderToBuffer } from "@react-pdf/renderer"
import { createAdminClient } from "@/lib/supabase/admin"
import React from "react"

export async function generateAndGetDownloadUrl(prisma, tenantId, purchaseOrderId) {
  // 1. Load data from DB
  // 2. Build props
  // 3. Render to buffer:
  const pdfElement = React.createElement(PurchaseOrderPdf, { ... })
  const buffer = await renderToBuffer(pdfElement as any)
  // 4. Upload to Supabase Storage (private bucket "documents")
  // 5. Create signed URL (5min expiry)
  // 6. Fix internal/public URL mismatch
  return { signedUrl, filename }
}
```

### PDF Component Pattern (`src/lib/pdf/purchase-order-pdf.tsx`)

Uses `@react-pdf/renderer` components: `Document`, `Page`, `View`, `Text`, `Image`, `StyleSheet`.
- Unit conversion: `const MM = 2.835` (1mm = 2.835pt)
- Page size: `A4` with padding in mm
- Font: `Helvetica` (built-in)

### Supabase Storage

PDFs are uploaded to the `"documents"` bucket in Supabase Storage with `upsert: true`. The service handles internal/public URL mismatch for Docker environments.

---

## 6. Frontend Patterns

### 6.1 Warehouse Page Structure

All warehouse pages are under `src/app/[locale]/(dashboard)/warehouse/`:
- `page.tsx` -- Dashboard (uses components from `src/components/warehouse/dashboard/`)
- `articles/page.tsx`, `articles/[id]/page.tsx`
- `goods-receipt/page.tsx`
- `withdrawals/page.tsx`
- `stock-movements/page.tsx`
- `purchase-orders/page.tsx`, `purchase-orders/[id]/page.tsx`, `purchase-orders/new/page.tsx`
- `supplier-invoices/page.tsx`, `supplier-invoices/[id]/page.tsx`
- `corrections/page.tsx`
- `reservations/page.tsx`
- `prices/page.tsx`

**No scanner or labels pages exist yet.**

### 6.2 Page Pattern (from `goods-receipt/page.tsx`)

```tsx
'use client'
import { useTranslations } from 'next-intl'
import { useHasPermission } from '@/hooks'
import { GoodsReceiptTerminal } from '@/components/warehouse/goods-receipt-terminal'

export default function WhGoodsReceiptPage() {
  const t = useTranslations('warehouseGoodsReceipt')
  const { allowed: canAccess } = useHasPermission(['wh_stock.manage'])

  if (canAccess === false) {
    return <div className="p-6 text-center text-muted-foreground">{t('noPermission')}</div>
  }

  return (
    <div className="space-y-4 p-6">
      <GoodsReceiptTerminal />
    </div>
  )
}
```

### 6.3 Terminal Component Patterns

**Goods Receipt Terminal** (`src/components/warehouse/goods-receipt-terminal.tsx`):
- Multi-step wizard: Supplier -> Order -> Positions -> Confirm
- State machine with `Step = 1 | 2 | 3 | 4`
- Step indicator bar with check marks for completed steps
- Card-based layout
- Uses `toast` from `sonner` for feedback
- Resets state on success

**Withdrawal Terminal** (`src/components/warehouse/withdrawal-terminal.tsx`):
- Multi-step wizard: Reference -> Articles -> Confirm
- Reference type selection with card-based UI (2x2 grid)
- Article search using `ArticleSearchPopover`
- Batch withdrawal support (multiple articles)
- Uses `toast` from `sonner`

### 6.4 Article Search Component

**File:** `src/components/warehouse/article-search-popover.tsx`

Reusable autocomplete component. Props:
```ts
interface ArticleSearchPopoverProps {
  value: string | null
  onSelect: (id: string, name: string, article?: ArticleSearchResult) => void
  onFreeTextCommit?: (text: string) => void
  placeholder?: string
}
```

Uses `useWhArticleSearch(query)` hook internally. Shows results as a dropdown list with article number + name.

### 6.5 No Camera/Scanner Components Exist

No `html5-qrcode` or any camera-related components exist in the codebase. This will be entirely new.

### 6.6 Sidebar Navigation

**File:** `src/components/layout/sidebar/sidebar-nav-config.ts`

Warehouse section entries use:
```ts
{
  titleKey: 'warehouseGoodsReceipt',
  href: '/warehouse/goods-receipt',
  icon: PackageCheck,
  module: 'warehouse',
  permissions: ['wh_stock.manage'],
}
```

Each entry has: `titleKey` (i18n key), `href`, `icon` (lucide-react), `module`, optional `permissions` array.

### 6.7 Hook Patterns

**File:** `src/hooks/use-wh-withdrawals.ts` (representative example)

Query hooks:
```ts
export function useWhWithdrawals(options?, enabled = true) {
  const trpc = useTRPC()
  return useQuery(trpc.warehouse.withdrawals.list.queryOptions({ ...options }, { enabled }))
}
```

Mutation hooks with cache invalidation:
```ts
export function useCreateWhWithdrawal() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.withdrawals.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.withdrawals.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.stockMovements.movements.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.articles.list.queryKey() })
      // ... more invalidations
    },
  })
}
```

Hooks are exported from `src/hooks/index.ts` (barrel file with ~900 lines of re-exports).

---

## 7. Dependencies (from `package.json`)

### Already Installed -- Relevant
- `@react-pdf/renderer: ^4.3.2` -- PDF generation (React-based)
- `lucide-react: ^0.563.0` -- Icons
- `sonner: ^2.0.7` -- Toast notifications
- `zod: ^4.3.6` -- Input validation
- `uuid: ^13.0.0` -- UUID generation (includes v5 for deterministic IDs)
- `date-fns: ^4.1.0` -- Date formatting
- `sharp: ^0.34.5` -- Image processing

### NOT Installed -- Needed
- `html5-qrcode` -- HTML5 QR code scanner (ticket specifies this library)
- `qrcode` (or similar) -- QR code generation for labels (server-side, for PDF embedding)

---

## 8. Storno/Cancellation Patterns

### Withdrawal Cancellation (`wh-withdrawal-service.ts:cancelWithdrawal`)

The established reversal pattern:
1. Find original movement by `{ id: movementId, tenantId }`
2. Validate type is `WITHDRAWAL` or `DELIVERY_NOTE`
3. Validate original has negative quantity (is an actual withdrawal, not already reversed)
4. Create reversal: same type, positive quantity = `Math.abs(original.quantity)`
5. Update article stock: `currentStock + reverseQty`
6. Reason: `"Storno of movement ${movementId}"`

For goods receipts, there is no dedicated cancellation function in the stock movement service. The withdrawal cancel handles both `WITHDRAWAL` and `DELIVERY_NOTE` types.

---

## 9. Module System

**File:** `src/lib/modules/index.ts`

- `requireModule("warehouse")` -- tRPC middleware that checks `TenantModule` table
- `hasModule(prisma, tenantId, module)` -- boolean check
- `"core"` module is always enabled
- All warehouse routers use `tenantProcedure.use(requireModule("warehouse"))` as base

---

## 10. i18n / Translations

Translation files: `messages/de.json`, `messages/en.json`

Warehouse-related translation namespaces:
- `warehouseArticles`
- `warehouseGoodsReceipt`
- `warehouseWithdrawals`
- `warehouseStockMovements`
- `warehousePriceLists`
- `warehousePurchaseOrders`
- `warehouseSupplierInvoices`
- `warehouseCorrections`
- `warehouseReservations`

Sidebar title keys for navigation:
```json
"warehouseSection": "Lager",
"warehouseOverview": "Lager-Ubersicht",
"warehouseArticles": "Artikel",
"warehouseGoodsReceipt": "Wareneingang",
"warehouseWithdrawals": "Lagerentnahmen",
...
```

New namespaces needed:
- `warehouseScanner` -- for scanner page
- `warehouseLabels` -- for label printing (could be combined)

---

## 11. Test Patterns

### Service Test Pattern (from existing warehouse tests)

Tests use `pnpm vitest run src/trpc/routers/__tests__/TestName.test.ts`

Router tests create test data in a shared dev DB with transaction rollback.

### Existing Warehouse Test Files

```
src/lib/services/__tests__/wh-stock-movement-service.test.ts
src/lib/services/__tests__/wh-withdrawal-service.test.ts
src/trpc/routers/__tests__/whStockMovements-router.test.ts
src/trpc/routers/__tests__/whWithdrawals-router.test.ts
src/trpc/routers/__tests__/whPurchaseOrders-router.test.ts
src/lib/services/__tests__/wh-purchase-order-pdf-service.test.ts
```

---

## 12. Key Integration Points for WH_12

### QR Code Resolution
- Parse format: `TERP:ART:{tenantShort}:{articleNumber}`
- Tenant validation: `tenantId.startsWith(tenantShort)`
- Article lookup: Use existing `repo.findByNumber(prisma, tenantId, articleNumber)` from `wh-article-repository.ts`
- Return article with stock info

### Goods Receipt Integration
- After scanning article, call existing `stockMovementService.bookGoodsReceipt()` or `bookSinglePosition()`
- Need purchase order selection step (existing `listPendingOrders` query)

### Withdrawal Integration
- After scanning article, call existing `withdrawalService.createWithdrawal()` or `createBatchWithdrawal()`
- Reference type selection needed

### Inventory Integration
- WH_08 not yet implemented -- scanner inventory flow depends on WH_08 being built first
- The `WhStockMovement` model already has `inventorySessionId` field ready

### Storno Integration
- List recent movements for scanned article (existing `repo.findByArticle()`)
- Call existing `withdrawalService.cancelWithdrawal()` for withdrawal reversals
- For goods receipt storno, no dedicated function exists yet

### Label PDF Generation
- Use `@react-pdf/renderer` (already installed)
- Need QR code generation library (e.g., `qrcode`) for creating QR images to embed in PDF
- Label layout: Avery Zweckform L4736REV (45.7x21.2mm, 4 columns x 12 rows = 48 per page)
- Content per label: QR code image + article number + name + unit

### New Files Needed
- `src/lib/services/wh-qr-service.ts`
- `src/trpc/routers/warehouse/qr.ts`
- `src/hooks/use-wh-qr.ts`
- `src/lib/pdf/qr-label-pdf.tsx`
- `src/components/warehouse/qr-scanner.tsx`
- `src/components/warehouse/scanner-page.tsx`
- `src/app/[locale]/(dashboard)/warehouse/scanner/page.tsx`
- Permission entries in `src/lib/auth/permission-catalog.ts`
- Sidebar entry in `src/components/layout/sidebar/sidebar-nav-config.ts`
- Translation entries in `messages/de.json` and `messages/en.json`
- Tests: service, router, and optionally E2E

### Files to Modify
- `src/lib/auth/permission-catalog.ts` -- add `wh_qr.scan`, `wh_qr.print`
- `src/trpc/routers/warehouse/index.ts` -- register `qr: whQrRouter`
- `src/hooks/index.ts` -- export new hooks
- `src/components/layout/sidebar/sidebar-nav-config.ts` -- add scanner nav entry
- `messages/de.json` and `messages/en.json` -- add translations
- `package.json` -- add `html5-qrcode` and `qrcode` dependencies
