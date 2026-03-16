# WH_05 — Lagerentnahmen

| Field | Value |
|-------|-------|
| **Module** | Warehouse |
| **Dependencies** | WH_01 (Articles), WH_04 (Stock Movements — extends `WhStockMovement`) |
| **Complexity** | M |
| **New Models** | None (uses `WhStockMovement` with type=WITHDRAWAL from WH_04) |

---

## Goal

Implement stock withdrawals (Lagerentnahmen). Articles are withdrawn from inventory by reference to a Terp order (time tracking), a delivery note (packing list), or a machine/equipment ID. Withdrawal creates a stock movement of type WITHDRAWAL with negative quantity. Supports withdrawal cancellation (reversal). Replaces ZMI orgAuftrag section 10.1.

---

## Prisma Models

No new models. Uses `WhStockMovement` (WH_04) with `type = WITHDRAWAL`.

The `WhStockMovement` model already has the needed reference fields:
- `orderId` — for withdrawal against a Terp order (Auftragsnummer)
- `documentId` — for withdrawal against a delivery note (Packliste/Lieferschein)

Add one optional field for equipment/machine reference:

```prisma
// Extension to WhStockMovement (add in WH_05 migration)
model WhStockMovement {
  // ... existing fields ...
  machineId  String?  @map("machine_id") // For withdrawal against a machine/equipment
}
```

---

## Permissions

No new permissions needed. Uses existing from WH_04:
- `wh_stock.view` — View stock movements
- `wh_stock.manage` — Create/cancel withdrawals

---

## tRPC Router

**File:** `src/trpc/routers/warehouse/withdrawals.ts`

All procedures use `tenantProcedure.use(requireModule("warehouse"))`.

### Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `create` | mutation | `wh_stock.manage` | `{ articleId, quantity, referenceType, referenceId?, machineId?, notes? }` | Withdraw article from stock |
| `createBatch` | mutation | `wh_stock.manage` | `{ referenceType, referenceId?, items: [{ articleId, quantity }], notes? }` | Withdraw multiple articles at once |
| `cancel` | mutation | `wh_stock.manage` | `{ movementId }` | Cancel/reverse a withdrawal (creates positive movement) |
| `list` | query | `wh_stock.view` | `{ orderId?, documentId?, machineId?, dateFrom?, dateTo?, page, pageSize }` | List withdrawals with filters |
| `listByOrder` | query | `wh_stock.view` | `{ orderId }` | All withdrawals for a Terp order |
| `listByDocument` | query | `wh_stock.view` | `{ documentId }` | All withdrawals for a delivery note |

### Input Schemas

```ts
const referenceTypeEnum = z.enum(["ORDER", "DOCUMENT", "MACHINE", "NONE"])

const createInput = z.object({
  articleId: z.string().uuid(),
  quantity: z.number().positive(), // Will be stored as negative in movement
  referenceType: referenceTypeEnum,
  referenceId: z.string().optional(), // orderId, documentId, or machineId depending on type
  machineId: z.string().optional(),
  notes: z.string().optional(),
})

const createBatchInput = z.object({
  referenceType: referenceTypeEnum,
  referenceId: z.string().optional(),
  machineId: z.string().optional(),
  items: z.array(z.object({
    articleId: z.string().uuid(),
    quantity: z.number().positive(),
  })).min(1),
  notes: z.string().optional(),
})
```

---

## Service Layer

**File:** `src/lib/services/wh-withdrawal-service.ts`

### Key Logic

#### Create Withdrawal

```ts
export async function createWithdrawal(prisma, tenantId, input, userId) {
  return prisma.$transaction(async (tx) => {
    const article = await tx.whArticle.findUnique({ where: { id: input.articleId } })
    // Validate article exists and belongs to tenant
    // Validate stock is sufficient (currentStock >= quantity)
    //   (Warning if below min stock after withdrawal, error if insufficient)

    const previousStock = article.currentStock
    const newStock = previousStock - input.quantity

    // Create stock movement (negative quantity)
    const movement = await tx.whStockMovement.create({
      data: {
        tenantId,
        articleId: input.articleId,
        type: "WITHDRAWAL",
        quantity: -input.quantity, // Negative!
        previousStock,
        newStock,
        orderId: input.referenceType === "ORDER" ? input.referenceId : null,
        documentId: input.referenceType === "DOCUMENT" ? input.referenceId : null,
        machineId: input.referenceType === "MACHINE" ? input.referenceId : null,
        notes: input.notes,
        createdById: userId,
      }
    })

    // Update article stock
    await tx.whArticle.update({
      where: { id: input.articleId },
      data: { currentStock: newStock }
    })

    return movement
  })
}
```

#### Cancel Withdrawal (Storno)

```ts
export async function cancelWithdrawal(prisma, tenantId, movementId, userId) {
  return prisma.$transaction(async (tx) => {
    const movement = await tx.whStockMovement.findUnique({ where: { id: movementId } })
    // Validate movement exists, belongs to tenant, type=WITHDRAWAL

    const article = await tx.whArticle.findUnique({ where: { id: movement.articleId } })
    const previousStock = article.currentStock
    const reverseQty = Math.abs(movement.quantity) // Original was negative, reverse is positive
    const newStock = previousStock + reverseQty

    // Create reversal movement
    await tx.whStockMovement.create({
      data: {
        tenantId,
        articleId: movement.articleId,
        type: "WITHDRAWAL", // Same type but positive quantity indicates reversal
        quantity: reverseQty,
        previousStock,
        newStock,
        orderId: movement.orderId,
        documentId: movement.documentId,
        machineId: movement.machineId,
        reason: `Storno of movement ${movementId}`,
        createdById: userId,
      }
    })

    // Update article stock
    await tx.whArticle.update({
      where: { id: movement.articleId },
      data: { currentStock: newStock }
    })
  })
}
```

#### Integration with ORD_01 (Delivery Notes)

When a DELIVERY_NOTE is printed (ORD_01), the system can optionally create withdrawals for all article positions:
- Configurable per tenant: auto-withdraw, prompt, or manual only
- This is triggered from the document print flow in ORD_01

---

## UI Components

### Page Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/warehouse/withdrawals` | `WhWithdrawalsPage` | Withdrawal terminal and history |

### Component Files

All in `src/components/warehouse/`:

| Component | Description |
|-----------|-------------|
| `withdrawal-terminal.tsx` | Terminal-style withdrawal interface. Step 1: Select reference type (Order/Delivery Note/Machine/None). Step 2: Enter reference (order search, document search, or machine ID). Step 3: Scan/search articles and enter quantities. Step 4: Confirm withdrawal. |
| `withdrawal-article-row.tsx` | Row: Article number, name, current stock, withdrawal quantity input. Warning if stock would go below min. |
| `withdrawal-history.tsx` | Table of past withdrawals. Columns: Date, Article, Quantity, Reference, User. Filter by reference, date. Cancel button per row. |
| `withdrawal-cancel-dialog.tsx` | Confirmation dialog for cancellation/reversal. |

### Integration with Terp Orders

On the Terp order detail page, add a "Materials" tab showing all stock withdrawals booked against that order. This gives a complete picture of labor (time bookings) + materials (withdrawals) per order.

---

## Hooks

**File:** `src/hooks/use-wh-withdrawals.ts`

```ts
export function useWhWithdrawals(filters) {
  return useQuery(trpc.warehouse.withdrawals.list.queryOptions(filters))
}

export function useWhWithdrawalsByOrder(orderId: string) {
  return useQuery(trpc.warehouse.withdrawals.listByOrder.queryOptions({ orderId }))
}

export function useCreateWhWithdrawal() {
  return useMutation({
    ...trpc.warehouse.withdrawals.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.stockMovements.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.articles.queryKey() })
    },
  })
}

export function useCancelWhWithdrawal() { /* ... */ }
```

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/wh-withdrawal-service.test.ts`

- `createWithdrawal` — creates movement with negative quantity
- `createWithdrawal` — updates article stock
- `createWithdrawal` — links to order when referenceType=ORDER
- `createWithdrawal` — links to document when referenceType=DOCUMENT
- `createWithdrawal` — rejects if insufficient stock
- `createBatch` — processes multiple articles in one transaction
- `cancelWithdrawal` — creates positive reversal movement
- `cancelWithdrawal` — restores article stock
- `cancelWithdrawal` — rejects if movement is not WITHDRAWAL type
- `listByOrder` — returns all withdrawals for a Terp order

### Router Tests

**File:** `src/trpc/routers/__tests__/whWithdrawals-router.test.ts`

```ts
describe("warehouse.withdrawals", () => {
  it("create — requires wh_stock.manage", async () => { })
  it("create — requires warehouse module enabled", async () => { })
  it("create — decreases article stock", async () => { })
  it("create — rejects insufficient stock", async () => { })
  it("cancel — reverses withdrawal", async () => { })
  it("listByOrder — returns order withdrawals", async () => { })
})
```

### E2E Tests

**File:** `src/e2e-browser/44-wh-withdrawals.spec.ts`

```ts
test.describe("UC-WH-05: Stock Withdrawals", () => {
  test("withdraw article against a Terp order", async ({ page }) => {
    // Navigate to /warehouse/withdrawals
    // Select reference type: Order → search and select order
    // Search article → enter quantity
    // Confirm → verify stock decreased
  })

  test("cancel a withdrawal", async ({ page }) => {
    // Find withdrawal in history → click Cancel
    // Confirm → verify stock restored
  })

  test("batch withdrawal for delivery note", async ({ page }) => {
    // Select reference: Delivery Note → search document
    // Add multiple articles
    // Confirm all → verify stocks updated
  })
})
```

---

## Acceptance Criteria

- [ ] No new models — extends WhStockMovement with WITHDRAWAL type and machineId field
- [ ] Withdrawal creates stock movement with negative quantity
- [ ] Article stock updated in transaction
- [ ] Insufficient stock validation (prevents negative stock)
- [ ] Reference types: Order, Delivery Note, Machine, None
- [ ] Batch withdrawal for multiple articles
- [ ] Cancellation/reversal creates positive movement
- [ ] Terminal-style withdrawal UI
- [ ] Withdrawal history filterable by reference, date
- [ ] Integration: Terp order detail shows "Materials" tab with withdrawals
- [ ] Integration: Delivery note print can trigger auto-withdrawal (configurable)
- [ ] All procedures gated by `requireModule("warehouse")` and `wh_stock.*` permissions
- [ ] Cross-tenant isolation verified
