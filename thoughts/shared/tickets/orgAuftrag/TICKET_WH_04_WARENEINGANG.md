# WH_04 — Wareneingang / Lagerbuchungen

| Field | Value |
|-------|-------|
| **Module** | Warehouse |
| **Dependencies** | WH_03 (Purchase Orders) |
| **Complexity** | M |
| **New Models** | `WhStockMovement` |

---

## Goal

Implement goods receipt (Wareneingang) and stock movement tracking. When goods arrive from a supplier, they are booked against an existing purchase order, updating stock levels and recording the movement. The stock movement model is also used for manual stock adjustments (WH_01), stock withdrawals (WH_05), and inventory counts (WH_08). Replaces ZMI orgAuftrag section 9.3.

---

## Prisma Models

### WhStockMovement

```prisma
enum WhStockMovementType {
  GOODS_RECEIPT      // Wareneingang (from purchase order)
  WITHDRAWAL         // Lagerentnahme (WH_05)
  ADJUSTMENT         // Manuelle Korrektur (WH_01)
  INVENTORY          // Inventurbuchung (WH_08)
  RETURN             // Rücklieferung

  @@map("wh_stock_movement_type")
}

model WhStockMovement {
  id                   String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId             String              @map("tenant_id") @db.Uuid
  articleId            String              @map("article_id") @db.Uuid
  type                 WhStockMovementType
  quantity             Float               // Positive = in, Negative = out
  previousStock        Float               @map("previous_stock") // Stock before this movement
  newStock             Float               @map("new_stock")      // Stock after this movement
  date                 DateTime            @default(now()) @db.Timestamptz(6)

  // Context references (one of these is set depending on type)
  purchaseOrderId      String?             @map("purchase_order_id") @db.Uuid  // For GOODS_RECEIPT
  purchaseOrderPositionId String?          @map("purchase_order_position_id") @db.Uuid
  documentId           String?             @map("document_id") @db.Uuid        // For WITHDRAWAL (delivery note)
  orderId              String?             @map("order_id") @db.Uuid           // For WITHDRAWAL (terp order)
  inventorySessionId   String?             @map("inventory_session_id") @db.Uuid // For INVENTORY (WH_08)

  reason               String?             // Reason for adjustment/correction
  notes                String?
  createdById          String?             @map("created_by_id") @db.Uuid
  createdAt            DateTime            @default(now()) @map("created_at") @db.Timestamptz(6)

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

---

## Permissions

Add to `permission-catalog.ts`:

```ts
p("wh_stock.view", "wh_stock", "view", "View stock movements and goods receipts"),
p("wh_stock.manage", "wh_stock", "manage", "Manage goods receipts and stock bookings"),
```

---

## tRPC Router

**File:** `src/trpc/routers/warehouse/stockMovements.ts`

All procedures use `tenantProcedure.use(requireModule("warehouse"))`.

### Goods Receipt Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `goodsReceipt.listPendingOrders` | query | `wh_stock.view` | `{ supplierId? }` | POs with status ORDERED or PARTIALLY_RECEIVED |
| `goodsReceipt.getOrderPositions` | query | `wh_stock.view` | `{ purchaseOrderId }` | Positions with ordered vs received quantities |
| `goodsReceipt.book` | mutation | `wh_stock.manage` | `{ purchaseOrderId, positions: [{ positionId, quantity }] }` | Book received goods for one or more positions |
| `goodsReceipt.bookSingle` | mutation | `wh_stock.manage` | `{ purchaseOrderPositionId, quantity }` | Book single position |

### Stock Movement Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `movements.list` | query | `wh_stock.view` | `{ articleId?, type?, dateFrom?, dateTo?, page, pageSize }` | Paginated movement history |
| `movements.listByArticle` | query | `wh_stock.view` | `{ articleId }` | All movements for an article (for detail tab) |

---

## Service Layer

**Files:**
- `src/lib/services/wh-stock-movement-service.ts`
- `src/lib/services/wh-stock-movement-repository.ts`

### Key Logic

#### Goods Receipt Booking

```ts
export async function bookGoodsReceipt(
  prisma: PrismaClient,
  tenantId: string,
  input: { purchaseOrderId: string; positions: { positionId: string; quantity: number }[] },
  userId: string
) {
  return prisma.$transaction(async (tx) => {
    const po = await tx.whPurchaseOrder.findUnique({ where: { id: input.purchaseOrderId } })
    // Validate PO belongs to tenant and status is ORDERED or PARTIALLY_RECEIVED

    for (const pos of input.positions) {
      const poPos = await tx.whPurchaseOrderPosition.findUnique({ where: { id: pos.positionId } })
      // Validate position belongs to PO
      // Validate quantity ≤ (ordered quantity - already received)

      const article = await tx.whArticle.findUnique({ where: { id: poPos.articleId } })
      const previousStock = article.currentStock
      const newStock = previousStock + pos.quantity

      // 1. Create stock movement
      await tx.whStockMovement.create({
        data: {
          tenantId,
          articleId: poPos.articleId,
          type: "GOODS_RECEIPT",
          quantity: pos.quantity,
          previousStock,
          newStock,
          purchaseOrderId: input.purchaseOrderId,
          purchaseOrderPositionId: pos.positionId,
          createdById: userId,
        }
      })

      // 2. Update article stock
      await tx.whArticle.update({
        where: { id: poPos.articleId },
        data: { currentStock: newStock }
      })

      // 3. Update position received quantity
      await tx.whPurchaseOrderPosition.update({
        where: { id: pos.positionId },
        data: { receivedQuantity: { increment: pos.quantity } }
      })
    }

    // 4. Update PO status
    const allPositions = await tx.whPurchaseOrderPosition.findMany({
      where: { purchaseOrderId: input.purchaseOrderId }
    })
    const allReceived = allPositions.every(p => p.receivedQuantity >= p.quantity)
    const someReceived = allPositions.some(p => p.receivedQuantity > 0)

    await tx.whPurchaseOrder.update({
      where: { id: input.purchaseOrderId },
      data: { status: allReceived ? "RECEIVED" : someReceived ? "PARTIALLY_RECEIVED" : undefined }
    })
  })
}
```

#### Stock Tracking

Every stock movement records:
- `previousStock` — stock before the movement (for audit trail)
- `newStock` — stock after the movement
- `quantity` — positive for incoming (receipt), negative for outgoing (withdrawal)

---

## UI Components

### Page Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/warehouse/goods-receipt` | `WhGoodsReceiptPage` | Goods receipt terminal |
| `/warehouse/stock-movements` | `WhStockMovementsPage` | Movement history |

### Component Files

All in `src/components/warehouse/`:

| Component | Description |
|-----------|-------------|
| `goods-receipt-terminal.tsx` | Terminal-style interface for booking goods receipt. Step 1: Select supplier (autocomplete). Step 2: Select PO (dropdown of ORDERED POs for supplier). Step 3: Position list with quantity input fields. Step 4: Confirm booking. |
| `goods-receipt-position-row.tsx` | Row showing: Article, Ordered Qty, Already Received, Remaining, Input for new receipt qty. |
| `stock-movement-list.tsx` | Data table. Columns: Date, Article, Type (badge), Quantity (+/-), Previous→New Stock, Reference (PO number / order number). Filters: article, type, date range. |
| `article-movements-tab.tsx` | Component for article detail page "Movements" tab: movement history for that article. |

---

## Hooks

**File:** `src/hooks/use-wh-stock-movements.ts`

```ts
export function useWhPendingOrders(supplierId?: string) {
  return useQuery(trpc.warehouse.stockMovements.goodsReceipt.listPendingOrders.queryOptions({ supplierId }))
}

export function useWhOrderPositions(purchaseOrderId: string) {
  return useQuery(trpc.warehouse.stockMovements.goodsReceipt.getOrderPositions.queryOptions({ purchaseOrderId }))
}

export function useBookGoodsReceipt() {
  return useMutation({
    ...trpc.warehouse.stockMovements.goodsReceipt.book.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.stockMovements.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.articles.queryKey() })
    },
  })
}

export function useWhStockMovements(filters) {
  return useQuery(trpc.warehouse.stockMovements.movements.list.queryOptions(filters))
}

export function useWhArticleMovements(articleId: string) {
  return useQuery(trpc.warehouse.stockMovements.movements.listByArticle.queryOptions({ articleId }))
}
```

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/wh-stock-movement-service.test.ts`

- `bookGoodsReceipt` — creates stock movement for each position
- `bookGoodsReceipt` — updates article currentStock
- `bookGoodsReceipt` — updates position receivedQuantity
- `bookGoodsReceipt` — sets PO status to PARTIALLY_RECEIVED
- `bookGoodsReceipt` — sets PO status to RECEIVED when all positions fulfilled
- `bookGoodsReceipt` — rejects if quantity exceeds remaining
- `bookGoodsReceipt` — rejects if PO is not ORDERED/PARTIALLY_RECEIVED
- `bookGoodsReceipt` — transaction rolls back on error
- `movements.list` — filters by article, type, date
- `movements.listByArticle` — returns chronological history

### Router Tests

**File:** `src/trpc/routers/__tests__/whStockMovements-router.test.ts`

```ts
describe("warehouse.stockMovements", () => {
  it("goodsReceipt.book — requires wh_stock.manage", async () => { })
  it("goodsReceipt.book — requires warehouse module enabled", async () => { })
  it("goodsReceipt.book — updates stock and PO status", async () => { })
  it("goodsReceipt.book — rejects over-receipt", async () => { })
  it("movements.list — returns filtered movements", async () => { })
})
```

### E2E Tests

**File:** `src/e2e-browser/43-wh-goods-receipt.spec.ts`

```ts
test.describe("UC-WH-04: Goods Receipt", () => {
  test("book full goods receipt for a PO", async ({ page }) => {
    // Navigate to /warehouse/goods-receipt
    // Select supplier → select PO
    // Enter quantities for all positions
    // Confirm → verify PO status = RECEIVED
    // Verify article stock updated
  })

  test("book partial goods receipt", async ({ page }) => {
    // Book only some positions
    // Verify PO status = PARTIALLY_RECEIVED
    // Verify article stock partially updated
  })

  test("view stock movement history", async ({ page }) => {
    // Navigate to /warehouse/stock-movements
    // Verify receipt entries visible
    // Filter by article → verify filtered
  })
})
```

---

## Tenant Isolation Requirements (MANDATORY)

All repository and service operations for this module MUST enforce tenant isolation. This is non-negotiable for a multi-tenant SaaS application.

### Repository Layer
- Every `findMany`, `findFirst`, `findById`, `count` query MUST include `tenantId` in the `where` clause
- Sub-entity queries (e.g. fetching child records by parent ID) MUST join back to the parent entity's `tenantId` filter: `where: { parentId, parentEntity: { tenantId } }`
- `update` and `delete` operations on sub-entities (records without their own `tenantId` column) MUST verify tenant ownership via the parent entity before modifying
- Use `tenantScopedUpdate` helper for entities with a `tenantId` column
- Never use `.update({ where: { id } })` or `.delete({ where: { id } })` alone for sub-entities — always verify tenant first

### Service Layer
- Every service function that operates on a sub-entity (supplier links, BOM entries, movements, etc.) MUST accept `tenantId` as a parameter
- Before listing sub-entities, verify the parent entity belongs to the calling tenant
- Before updating/deleting sub-entities, verify tenant ownership or return NotFoundError
- Pass `tenantId` through from the router's `ctx.tenantId!` — never omit it

### Router Layer
- All procedures MUST use `tenantProcedure` (via `whProcedure`)
- All service calls MUST pass `ctx.tenantId!` — even for sub-entity operations
- Never pass only a record `id` without tenant context to update/delete service functions

### Tests (MANDATORY)
- Every service test file MUST include a `describe("tenant isolation")` block
- Test that each operation rejects cross-tenant access by asserting `NotFoundError` when using a different `tenantId`
- Minimum test coverage: one isolation test per service function that takes a record `id` parameter

### Pattern Reference
See `src/lib/services/wh-article-service.ts` and `src/lib/services/__tests__/wh-article-service.test.ts` (tenant isolation describe block) for the canonical implementation pattern.

---

## Acceptance Criteria

- [ ] `WhStockMovement` model created with migration
- [ ] Goods receipt booking updates article stock, PO position received quantities, and PO status in a transaction
- [ ] Over-receipt prevented (cannot receive more than ordered)
- [ ] PO status transitions: ORDERED → PARTIALLY_RECEIVED → RECEIVED
- [ ] Stock movement records previous and new stock for audit trail
- [ ] Movement types: GOODS_RECEIPT, WITHDRAWAL, ADJUSTMENT, INVENTORY, RETURN
- [ ] Terminal-style goods receipt UI (supplier → PO → positions → confirm)
- [ ] Stock movement history viewable globally and per article
- [ ] Article detail page "Movements" tab shows movement history
- [ ] All procedures gated by `requireModule("warehouse")` and `wh_stock.*` permissions
- [ ] Cross-tenant isolation verified: all operations reject access with wrong tenantId (tests included)
