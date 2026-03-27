# WH_10 Research: Artikelreservierungen bei Auftragsbestätigung

## 1. Document/Order System

### 1.1 BillingDocument Model

**File:** `prisma/schema.prisma` (line 675)

```prisma
model BillingDocument {
  id                  String                 @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId            String                 @map("tenant_id") @db.Uuid
  number              String                 @db.VarChar(50)
  type                BillingDocumentType
  status              BillingDocumentStatus  @default(DRAFT)
  addressId           String                 @map("address_id") @db.Uuid
  contactId           String?                @map("contact_id") @db.Uuid
  deliveryAddressId   String?                @map("delivery_address_id") @db.Uuid
  invoiceAddressId    String?                @map("invoice_address_id") @db.Uuid
  inquiryId           String?                @map("inquiry_id") @db.Uuid
  orderId             String?                @map("order_id") @db.Uuid
  parentDocumentId    String?                @map("parent_document_id") @db.Uuid
  // ... dates, terms, totals, notes, audit ...
  parentDocument   BillingDocument?          @relation("DocumentChain", fields: [parentDocumentId], references: [id])
  childDocuments   BillingDocument[]         @relation("DocumentChain")
  positions        BillingDocumentPosition[]
  @@unique([tenantId, number])
  @@map("billing_documents")
}
```

### 1.2 Document Types and Statuses

```prisma
enum BillingDocumentType {
  OFFER
  ORDER_CONFIRMATION
  DELIVERY_NOTE
  SERVICE_NOTE
  RETURN_DELIVERY
  INVOICE
  CREDIT_NOTE
}

enum BillingDocumentStatus {
  DRAFT
  PRINTED            // = "finalized"
  PARTIALLY_FORWARDED
  FORWARDED
  CANCELLED
}
```

### 1.3 BillingDocumentPosition Model

**File:** `prisma/schema.prisma` (line 764)

```prisma
model BillingDocumentPosition {
  id              String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  documentId      String              @map("document_id") @db.Uuid
  sortOrder       Int                 @map("sort_order")
  type            BillingPositionType @default(FREE)    // ARTICLE, FREE, TEXT, PAGE_BREAK, SUBTOTAL
  articleId       String?             @map("article_id") @db.Uuid
  articleNumber   String?             @map("article_number") @db.VarChar(50)
  description     String?
  quantity        Float?
  unit            String?             @db.VarChar(20)
  unitPrice       Float?              @map("unit_price")
  // ... more price fields ...
  document BillingDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)
  @@map("billing_document_positions")
}
```

**Key:** `articleId` links to `WhArticle` but is NOT a formal Prisma relation (no FK in schema). It is a UUID string that is matched manually. Positions can be ARTICLE type (with articleId) or FREE/TEXT/PAGE_BREAK/SUBTOTAL types (no articleId).

### 1.4 Document Chain (Belegkette)

**File:** `src/lib/services/billing-document-service.ts` (line 88)

Forwarding rules define the allowed document chain:
```ts
export const FORWARDING_RULES: Record<BillingDocumentType, BillingDocumentType[]> = {
  OFFER: ["ORDER_CONFIRMATION"],
  ORDER_CONFIRMATION: ["DELIVERY_NOTE", "SERVICE_NOTE"],
  DELIVERY_NOTE: ["INVOICE"],
  SERVICE_NOTE: ["INVOICE"],
  RETURN_DELIVERY: ["CREDIT_NOTE"],
  INVOICE: [],
  CREDIT_NOTE: [],
}
```

The chain is:
- OFFER -> ORDER_CONFIRMATION -> DELIVERY_NOTE -> INVOICE
- ORDER_CONFIRMATION -> SERVICE_NOTE -> INVOICE
- RETURN_DELIVERY -> CREDIT_NOTE

Documents are linked via `parentDocumentId` (self-referential). The `forward()` function creates a new child document with `parentDocumentId` pointing to the source.

### 1.5 Finalize Logic

**File:** `src/lib/services/billing-document-service.ts` (line 511)

```ts
export async function finalize(prisma, tenantId, id, finalizedById, orderParams?, audit?) {
  // Transaction:
  //   1. Validate status == DRAFT
  //   2. Validate has positions
  //   3. For ORDER_CONFIRMATION: optionally create linked Order
  //   4. Set status = "PRINTED", printedAt, printedById
  // Post-transaction (best-effort):
  //   5. Generate PDF
  //   6. For INVOICE/CREDIT_NOTE: generate E-Invoice XML
  //   7. For DELIVERY_NOTE: auto stock booking if deliveryNoteStockMode == "AUTO"
  //   8. Audit log
}
```

**Key integration point for WH_10:** After the transaction in `finalize()`, there is already a pattern for post-transaction side effects (PDF generation, stock booking for DELIVERY_NOTE). The reservation creation for ORDER_CONFIRMATION should follow the same pattern — after finalize transaction succeeds, call reservation creation as best-effort.

### 1.6 Forward Logic

**File:** `src/lib/services/billing-document-service.ts` (line 633)

```ts
export async function forward(prisma, tenantId, id, targetType, createdById, audit) {
  // Transaction:
  //   1. Validate source is PRINTED or PARTIALLY_FORWARDED
  //   2. Validate forwarding rule
  //   3. Generate number for target type
  //   4. Create child document (inheriting all header fields, parentDocumentId = source.id)
  //   5. Copy all positions from source to child
  //   6. Recalculate totals
  //   7. Update source status to FORWARDED
  // Post-transaction: audit log
  // Return: the new document
}
```

**Key for WH_10:** When ORDER_CONFIRMATION is forwarded to DELIVERY_NOTE, the `forward()` function is called. This is where reservation release (FULFILLED) should be triggered.

### 1.7 Cancel Logic

**File:** `src/lib/services/billing-document-service.ts` (line 747)

```ts
export async function cancel(prisma, tenantId, id, reason?, audit?) {
  // Atomic update: status -> CANCELLED (only if not already CANCELLED or FORWARDED)
  // No transaction needed (single atomic updateMany)
}
```

**Key for WH_10:** When an ORDER_CONFIRMATION is cancelled, reservations should be released (RELEASED with reason "CANCELLED").

### 1.8 Delivery Note Stock Booking (WH_09 Pattern)

**File:** `src/lib/services/billing-document-service.ts` (line 1279)

```ts
export async function createDeliveryNoteStockBookings(prisma, tenantId, documentId, positionIds, userId, audit?) {
  // 1. Validate document type == DELIVERY_NOTE and status == PRINTED
  // 2. Filter ARTICLE positions with articleId and quantity > 0
  // 3. Transaction: for each position:
  //    a. Fetch article (skip if not found or stockTracking disabled)
  //    b. Create WhStockMovement (type: DELIVERY_NOTE, quantity: -quantity)
  //    c. Update article.currentStock
  // 4. Audit log
}
```

This is called:
- Automatically after finalize if `deliveryNoteStockMode == "AUTO"` (line 594-609)
- Manually via `billing.documents.confirmStockBookings` mutation

The auto-call pattern from finalize (line 594-609):
```ts
// AUTO stock booking for DELIVERY_NOTE (best-effort, outside transaction)
let stockBookingResult: { bookedCount: number } | null = null
const docType = (result as unknown as { type?: string }).type
if (docType === "DELIVERY_NOTE") {
  try {
    const settings = await systemSettingsService.get(prisma, tenantId)
    const mode = (settings as unknown as { deliveryNoteStockMode?: string }).deliveryNoteStockMode
    if (mode === "AUTO") {
      stockBookingResult = await createDeliveryNoteStockBookings(...)
    }
  } catch (err) {
    console.error(`Auto stock booking failed for delivery note ${id}`, err)
  }
}
```

---

## 2. Warehouse Article System

### 2.1 WhArticle Model

**File:** `prisma/schema.prisma` (line 4220)

```prisma
model WhArticle {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String   @map("tenant_id") @db.Uuid
  number            String   @db.VarChar(50)
  name              String   @db.VarChar(255)
  // ... description, group, pricing fields ...
  stockTracking     Boolean  @default(false) @map("stock_tracking")
  currentStock      Float    @default(0) @map("current_stock")
  minStock          Float?   @map("min_stock")
  warehouseLocation String?  @map("warehouse_location") @db.VarChar(255)
  isActive          Boolean  @default(true) @map("is_active")
  // Relations
  tenant    Tenant             @relation(fields: [tenantId], references: [id])
  group     WhArticleGroup?
  suppliers WhArticleSupplier[]
  bomParent WhBillOfMaterial[] @relation("BomParent")
  bomChild  WhBillOfMaterial[] @relation("BomChild")
  purchaseOrderPositions WhPurchaseOrderPosition[]
  stockMovements         WhStockMovement[]
  articleImages          WhArticleImage[]
  @@unique([tenantId, number])
  @@map("wh_articles")
}
```

**Key fields for WH_10:**
- `stockTracking` (boolean) - only articles with `stockTracking=true` should be reserved
- `currentStock` (float) - physical stock, updated by stock movements
- No `reservedStock` or `availableStock` fields exist — these must be computed

### 2.2 WhStockMovement Model

**File:** `prisma/schema.prisma` (line 4442)

```prisma
model WhStockMovement {
  id                       String              @id
  tenantId                 String
  articleId                String
  type                     WhStockMovementType  // GOODS_RECEIPT, WITHDRAWAL, ADJUSTMENT, INVENTORY, RETURN, DELIVERY_NOTE
  quantity                 Float               // positive for inbound, negative for outbound
  previousStock            Float
  newStock                 Float
  date                     DateTime
  purchaseOrderId          String?
  purchaseOrderPositionId  String?
  documentId               String?             // links to BillingDocument
  orderId                  String?
  inventorySessionId       String?
  machineId                String?
  reason                   String?
  notes                    String?
  createdById              String?
  createdAt                DateTime
  @@map("wh_stock_movements")
}
```

### 2.3 Article Service

**File:** `src/lib/services/wh-article-service.ts`

Error classes:
- `WhArticleNotFoundError`
- `WhArticleValidationError`
- `WhArticleConflictError`

Key functions: `list()`, `getById()`, `create()`, `update()`, `softDelete()`, `restore()`, `adjustStock()`, BOM functions, supplier functions.

### 2.4 Article Repository

**File:** `src/lib/services/wh-article-repository.ts`

Standard CRUD pattern with `tenantId` filtering on all queries.

### 2.5 Stock Display in Article Detail UI

**File:** `src/components/warehouse/article-detail.tsx` (line 200-214)

Currently shows stock info only if `stockTracking` is enabled:
```tsx
{article.stockTracking && (
  <Card>
    <CardContent className="pt-6">
      <h3 className="text-sm font-semibold mb-3">{t('sectionStock')}</h3>
      <DetailRow label={t('labelCurrentStock')} value={article.currentStock} />
      <DetailRow label={t('labelMinStock')} value={article.minStock ?? '\u2014'} />
      <DetailRow label={t('labelWarehouseLocation')} value={article.warehouseLocation} />
      {article.minStock != null && article.currentStock < article.minStock && (
        <div className="mt-2 p-2 bg-destructive/10 text-destructive text-sm rounded-md">
          {t('alertBelowMinStock')}
        </div>
      )}
    </CardContent>
  </Card>
)}
```

**WH_10 changes needed here:** Add "Reserviert" and "Verfügbar" rows. Add orange warning badge for reserved stock.

---

## 3. Existing Patterns

### 3.1 Service + Repository Pattern

**Reference service:** `src/lib/services/wh-stock-movement-service.ts` + `src/lib/services/wh-stock-movement-repository.ts`

Pattern:
- **Repository** (`*-repository.ts`): Pure Prisma queries. Functions accept `prisma: PrismaClient`, `tenantId: string` as first args. No business logic.
- **Service** (`*-service.ts`): Business logic. Imports repository as `import * as repo from "./<name>-repository"`. Defines error classes. Functions accept `prisma: PrismaClient`, `tenantId: string`, plus business inputs. Uses `prisma.$transaction()` for multi-step operations.

Error class naming convention (drives `handleServiceError`):
```ts
class WhXxxNotFoundError extends Error { ... }    // -> NOT_FOUND
class WhXxxValidationError extends Error { ... }  // -> BAD_REQUEST
class WhXxxConflictError extends Error { ... }    // -> CONFLICT
```

### 3.2 Router Pattern

**Reference router:** `src/trpc/routers/warehouse/stockMovements.ts`

Pattern:
```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as service from "@/lib/services/<name>-service"
import type { PrismaClient } from "@/generated/prisma/client"

const PERM_VIEW = permissionIdByKey("xxx.view")!
const PERM_MANAGE = permissionIdByKey("xxx.manage")!

const whProcedure = tenantProcedure.use(requireModule("warehouse"))

export const xxxRouter = createTRPCRouter({
  list: whProcedure
    .use(requirePermission(PERM_VIEW))
    .input(z.object({ ... }))
    .query(async ({ ctx, input }) => {
      try {
        return await service.list(ctx.prisma as unknown as PrismaClient, ctx.tenantId!, input)
      } catch (err) { handleServiceError(err) }
    }),
  // mutations follow same pattern
})
```

### 3.3 Warehouse Router Index

**File:** `src/trpc/routers/warehouse/index.ts`

```ts
export const warehouseRouter = createTRPCRouter({
  articles: whArticlesRouter,
  articlePrices: whArticlePricesRouter,
  purchaseOrders: whPurchaseOrdersRouter,
  stockMovements: whStockMovementsRouter,
  withdrawals: whWithdrawalsRouter,
  supplierInvoices: whSupplierInvoicesRouter,
  corrections: whCorrectionsRouter,
})
```

**WH_10:** Add `reservations: whReservationsRouter` here.

### 3.4 Root Router

**File:** `src/trpc/routers/_app.ts`

The warehouse router is already registered at line 83/161:
```ts
import { warehouseRouter } from "./warehouse"
// ...
warehouse: warehouseRouter,
```

No changes needed to `_app.ts` — just add sub-router in `warehouse/index.ts`.

### 3.5 Auto-Create on Status Change Pattern

The delivery note auto-stock booking in `finalize()` is the closest pattern:

**Location:** `src/lib/services/billing-document-service.ts` lines 594-609

```ts
// AUTO stock booking for DELIVERY_NOTE (best-effort, outside transaction)
if (docType === "DELIVERY_NOTE") {
  try {
    const settings = await systemSettingsService.get(prisma, tenantId)
    const mode = (settings as unknown as { deliveryNoteStockMode?: string }).deliveryNoteStockMode
    if (mode === "AUTO") {
      stockBookingResult = await createDeliveryNoteStockBookings(prisma, tenantId, id, null, finalizedById, audit)
    }
  } catch (err) {
    console.error(`Auto stock booking failed for delivery note ${id}`, err)
  }
}
```

**For WH_10:** Add a similar block for ORDER_CONFIRMATION:
```ts
if (docType === "ORDER_CONFIRMATION") {
  try {
    await reservationService.createReservationsForDocument(prisma, tenantId, id, finalizedById)
  } catch (err) {
    console.error(`Auto reservation failed for order confirmation ${id}`, err)
  }
}
```

### 3.6 Permission Catalog Pattern

**File:** `src/lib/auth/permission-catalog.ts`

Existing warehouse permissions (lines 276-305):
```ts
// Warehouse Articles
p("wh_articles.view", "wh_articles", "view", "View warehouse articles"),
p("wh_articles.create", "wh_articles", "create", "Create warehouse articles"),
p("wh_articles.edit", "wh_articles", "edit", "Edit warehouse articles"),
p("wh_articles.delete", "wh_articles", "delete", "Delete warehouse articles"),
p("wh_article_groups.manage", "wh_article_groups", "manage", "Manage warehouse article groups"),
p("wh_articles.upload_image", "wh_articles", "upload_image", "Upload article images"),
p("wh_articles.delete_image", "wh_articles", "delete_image", "Delete article images"),
// Warehouse Purchase Orders
// ...
// Warehouse Stock / Goods Receipt
p("wh_stock.view", "wh_stock", "view", "View stock movements and goods receipts"),
p("wh_stock.manage", "wh_stock", "manage", "Manage goods receipts and stock bookings"),
// Warehouse Corrections
p("wh_corrections.view", "wh_corrections", "view", "View warehouse correction assistant"),
p("wh_corrections.manage", "wh_corrections", "manage", "Manage warehouse correction messages"),
p("wh_corrections.run", "wh_corrections", "run", "Run warehouse correction checks"),
```

**WH_10 additions needed:**
```ts
p("wh_reservations.view", "wh_reservations", "view", "View stock reservations"),
p("wh_reservations.manage", "wh_reservations", "manage", "Manage/release stock reservations"),
```

### 3.7 Hook Pattern

**Reference:** `src/hooks/use-wh-stock-movements.ts`

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useWhStockMovements(options?, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.stockMovements.movements.list.queryOptions({ ...options }, { enabled })
  )
}

export function useBookGoodsReceipt() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.stockMovements.goodsReceipt.book.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.stockMovements.movements.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.articles.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.articles.getById.queryKey() })
    },
  })
}
```

**Hook index re-exports:** `src/hooks/index.ts` must re-export all hooks.

### 3.8 Correction Service Deferred Check

**File:** `src/lib/services/wh-correction-service.ts` (lines 34, 179)

```ts
// const CHECK_ORPHAN_RESERVATION = "ORPHAN_RESERVATION"  // Deferred: WH_10 not implemented
// ...
// checkOrphanReservations — deferred, WH_10 not implemented
```

**WH_10:** Uncomment and implement `checkOrphanReservations` check.

---

## 4. UI Patterns

### 4.1 Article Detail Page

**Route:** `src/app/[locale]/(dashboard)/warehouse/articles/[id]/page.tsx`
**Component:** `src/components/warehouse/article-detail.tsx`

The page is a thin wrapper that checks permission and renders `<ArticleDetail articleId={params.id} />`.

### 4.2 Tab Structure in Article Detail

**File:** `src/components/warehouse/article-detail.tsx` (line 162)

```tsx
<Tabs defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">{t('tabOverview')}</TabsTrigger>
    <TabsTrigger value="suppliers">{t('tabSuppliers')}</TabsTrigger>
    <TabsTrigger value="bom">{t('tabBom')}</TabsTrigger>
    <TabsTrigger value="stock">{t('tabStock')}</TabsTrigger>
    <TabsTrigger value="prices">{t('tabPrices')}</TabsTrigger>
    <TabsTrigger value="images">{t('tabImages')}</TabsTrigger>
  </TabsList>
  <TabsContent value="overview"> ... </TabsContent>
  <TabsContent value="suppliers"><ArticleSupplierList articleId={articleId} /></TabsContent>
  <TabsContent value="bom"><ArticleBomList articleId={articleId} /></TabsContent>
  <TabsContent value="stock"><ArticleMovementsTab articleId={articleId} /></TabsContent>
  <TabsContent value="prices"><ArticlePriceTab articleId={articleId} /></TabsContent>
  <TabsContent value="images"><ArticleImagesTab articleId={articleId} /></TabsContent>
</Tabs>
```

**WH_10:** Add a "Reservierungen" tab after "stock":
```tsx
<TabsTrigger value="reservations">{t('tabReservations')}</TabsTrigger>
<TabsContent value="reservations"><ArticleReservationsTab articleId={articleId} /></TabsContent>
```

### 4.3 Stock Info Card with Warning/Badge Pattern

**File:** `src/components/warehouse/article-detail.tsx` (line 200-214)

Badges are used for status indicators:
```tsx
<Badge variant="outline">{t('badgeStockTracking')}</Badge>
```

Warning alerts use:
```tsx
<div className="mt-2 p-2 bg-destructive/10 text-destructive text-sm rounded-md">
  {t('alertBelowMinStock')}
</div>
```

### 4.4 Billing Document Detail + Forward Dialog

**Forward dialog:** `src/components/billing/document-forward-dialog.tsx`
**Document detail:** `src/components/billing/document-detail.tsx`

The forward dialog uses `useForwardBillingDocument()` mutation hook and renders target type selection.

### 4.5 Warehouse Pages

Existing pages under `src/app/[locale]/(dashboard)/warehouse/`:
- `articles/page.tsx` — article list
- `articles/[id]/page.tsx` — article detail
- `prices/page.tsx` — price list management
- `purchase-orders/page.tsx` — purchase order list
- `purchase-orders/[id]/page.tsx` — PO detail
- `purchase-orders/new/page.tsx` — create PO
- `purchase-orders/suggestions/page.tsx` — reorder suggestions
- `goods-receipt/page.tsx` — goods receipt
- `stock-movements/page.tsx` — stock movement history
- `withdrawals/page.tsx` — withdrawals
- `supplier-invoices/page.tsx` — supplier invoices
- `supplier-invoices/[id]/page.tsx` — invoice detail
- `corrections/page.tsx` — correction assistant

**WH_10:** Add `reservations/page.tsx` for the global reservations overview.

---

## 5. Test Patterns

### 5.1 Service Test Structure

**Reference:** `src/lib/services/__tests__/wh-stock-movement-service.test.ts`

```ts
import { describe, it, expect, vi } from "vitest"
import * as service from "../wh-stock-movement-service"
import type { PrismaClient } from "@/generated/prisma/client"

// Constants (fixed UUIDs)
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const OTHER_TENANT_ID = "ff000000-0000-4000-a000-000000000999"
const USER_ID = "a0000000-0000-4000-a000-000000000001"

// Mock data objects
const mockArticle = { id: ARTICLE_ID, tenantId: TENANT_ID, ... }

// Mock Prisma factory
function createMockPrisma(overrides = {}) {
  const prisma = {
    whStockMovement: { findMany: vi.fn().mockResolvedValue([mockMovement]), ... },
    whArticle: { findFirst: vi.fn().mockResolvedValue(mockArticle), ... },
    $transaction: vi.fn().mockImplementation(async (fn) => fn(prisma)),
    ...overrides,
  } as unknown as PrismaClient
  return prisma
}

describe("wh-stock-movement-service", () => {
  describe("listMovements", () => {
    it("returns paginated movements", async () => { ... })
    it("filters by articleId", async () => { ... })
    it("filters by type", async () => { ... })
  })
  describe("bookGoodsReceipt", () => {
    it("creates movements and updates stock", async () => { ... })
    it("validates PO status", async () => { ... })
  })
})
```

### 5.2 Billing Document Service Test

**File:** `src/lib/services/__tests__/billing-document-service.test.ts`

Uses same mock Prisma pattern. Mocks audit-logs-service:
```ts
vi.mock("../audit-logs-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
  computeChanges: vi.fn().mockReturnValue(null),
}))
```

### 5.3 Tenant Isolation Testing Pattern

Tests use `OTHER_TENANT_ID` constant and verify operations fail or return empty for wrong tenant:
```ts
it("rejects cross-tenant access", async () => {
  const prisma = createMockPrisma({
    whArticle: { findFirst: vi.fn().mockResolvedValue(null) },
  })
  await expect(service.getById(prisma, OTHER_TENANT_ID, ARTICLE_ID))
    .rejects.toThrow("not found")
})
```

---

## 6. Tenant Model Relations (for WhStockReservation)

**File:** `prisma/schema.prisma` (line 194-203)

Current warehouse relations on Tenant:
```prisma
// Warehouse
whArticleGroups             WhArticleGroup[]
whArticles                  WhArticle[]
whPurchaseOrders            WhPurchaseOrder[]
whStockMovements            WhStockMovement[]
whSupplierInvoices          WhSupplierInvoice[]
whSupplierPayments          WhSupplierPayment[]
whArticleImages             WhArticleImage[]
whCorrectionRuns            WhCorrectionRun[]
whCorrectionMessages        WhCorrectionMessage[]
```

**WH_10:** Add `whStockReservations WhStockReservation[]` here.

---

## 7. Migration Pattern

**Reference:** `supabase/migrations/20260324120000_wh_stock_movements.sql`

```sql
-- WH_04: Stock Movements (Wareneingang / Lagerbewegungen)

CREATE TABLE wh_stock_movements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  article_id  UUID NOT NULL REFERENCES wh_articles(id),
  -- ... columns ...
  created_at  TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE INDEX idx_wh_stock_movements_tenant_article ON wh_stock_movements(tenant_id, article_id);
ALTER TABLE wh_stock_movements ENABLE ROW LEVEL SECURITY;
```

Migration naming: `YYYYMMDDHHMMSS_descriptive_name.sql`
Latest timestamp: `20260406100000`

**WH_10 migration:** Use `20260407100000_wh_stock_reservations.sql` (next available date).

---

## 8. handleServiceError Mapping

**File:** `src/trpc/errors.ts`

Error class name suffix -> tRPC code:
- `*NotFoundError` -> `NOT_FOUND`
- `*ValidationError` / `*InvalidError` -> `BAD_REQUEST`
- `*ConflictError` / `*DuplicateError` -> `CONFLICT`
- `*ForbiddenError` / `*AccessDeniedError` -> `FORBIDDEN`

---

## 9. Ticket Reference

**File:** `thoughts/shared/tickets/orgAuftrag/TICKET_WH_10_ARTIKELRESERVIERUNGEN.md`

The ticket specifies:
- **New model:** `WhStockReservation` with fields: id, tenantId, articleId, documentId, positionId, quantity, status (ACTIVE/RELEASED/FULFILLED), releasedAt, releasedById, releaseReason, createdAt, updatedAt, createdById
- **Permissions:** `wh_reservations.view`, `wh_reservations.manage`
- **Router procedures:** list, getByArticle, release, releaseBulk
- **Service functions:** createReservationsForDocument, releaseReservationsForDeliveryNote, getAvailableStock, release
- **Hook file:** `src/hooks/use-wh-reservations.ts`
- **UI:** Expanded stock display, reservations tab in article detail, reservations overview page

---

## 10. Key Integration Points Summary

| Event | Where | What Happens |
|-------|-------|--------------|
| ORDER_CONFIRMATION finalized | `billing-document-service.ts:finalize()` line ~597 | Create reservations (best-effort, after transaction) |
| ORDER_CONFIRMATION forwarded to DELIVERY_NOTE | `billing-document-service.ts:forward()` line ~641 | Release reservations (FULFILLED) for the parent AB |
| ORDER_CONFIRMATION cancelled | `billing-document-service.ts:cancel()` line ~747 | Release reservations (RELEASED, reason: CANCELLED) |
| Manual release | New router: `warehouse.reservations.release` | Set status=RELEASED with reason and timestamp |
| Bulk release by document | New router: `warehouse.reservations.releaseBulk` | Release all ACTIVE reservations for a document |
| Article detail view | `article-detail.tsx` stock section | Show reservedStock and availableStock |
| Correction assistant | `wh-correction-service.ts` | Uncomment ORPHAN_RESERVATION check |

---

## 11. Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/20260407100000_wh_stock_reservations.sql` | Create table + indexes + RLS |
| `src/lib/services/wh-reservation-repository.ts` | Prisma queries |
| `src/lib/services/wh-reservation-service.ts` | Business logic |
| `src/trpc/routers/warehouse/reservations.ts` | tRPC router |
| `src/hooks/use-wh-reservations.ts` | React query hooks |
| `src/components/warehouse/article-reservations-tab.tsx` | Tab component |
| `src/lib/services/__tests__/wh-reservation-service.test.ts` | Unit tests |
| `src/app/[locale]/(dashboard)/warehouse/reservations/page.tsx` | Overview page |

## 12. Files to Modify

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `WhStockReservation` model, add relation on `Tenant` and `WhArticle` |
| `src/lib/auth/permission-catalog.ts` | Add `wh_reservations.view` and `wh_reservations.manage` |
| `src/lib/services/billing-document-service.ts` | Add reservation hooks in `finalize()`, `forward()`, `cancel()` |
| `src/trpc/routers/warehouse/index.ts` | Register `reservations` sub-router |
| `src/hooks/index.ts` | Re-export reservation hooks |
| `src/components/warehouse/article-detail.tsx` | Add reservations tab, enhance stock display |
| `src/lib/services/wh-correction-service.ts` | Uncomment and implement ORPHAN_RESERVATION check |
