# WH_03 — Einkauf / Bestellungen

| Field | Value |
|-------|-------|
| **Module** | Warehouse |
| **Dependencies** | CRM_01 (Addresses — suppliers), WH_01 (Articles) |
| **Complexity** | L |
| **New Models** | `WhPurchaseOrder`, `WhPurchaseOrderPosition` |

---

## Goal

Implement the purchasing system (Einkauf). Purchase orders are created for suppliers, either manually or from automatic reorder suggestions (when articles fall below minimum stock). Purchase orders follow a workflow from draft through ordered to received/completed. Positions link to articles with supplier-specific details. Replaces ZMI orgAuftrag sections 9.1-9.2.

---

## Prisma Models

### WhPurchaseOrder

```prisma
enum WhPurchaseOrderStatus {
  DRAFT            // In Arbeit
  ORDERED          // Bestellt (sent to supplier)
  PARTIALLY_RECEIVED  // Teilweise geliefert
  RECEIVED         // Vollständig geliefert
  CANCELLED        // Storniert

  @@map("wh_purchase_order_status")
}

enum WhPurchaseOrderMethod {
  PHONE
  EMAIL
  FAX
  PRINT

  @@map("wh_purchase_order_method")
}

model WhPurchaseOrder {
  id                  String                   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId            String                   @map("tenant_id") @db.Uuid
  number              String                   // Auto-generated via NumberSequence (key: "purchase_order")
  supplierId          String                   @map("supplier_id") @db.Uuid // CrmAddress (SUPPLIER or BOTH)
  contactId           String?                  @map("contact_id") @db.Uuid  // Supplier contact
  inquiryId           String?                  @map("inquiry_id") @db.Uuid  // Optional link to CRM inquiry
  status              WhPurchaseOrderStatus    @default(DRAFT)
  orderDate           DateTime?                @map("order_date") @db.Timestamptz(6)   // When ordered
  requestedDelivery   DateTime?                @map("requested_delivery") @db.Timestamptz(6) // Gewünschter Liefertermin
  confirmedDelivery   DateTime?                @map("confirmed_delivery") @db.Timestamptz(6) // Bestätigter Liefertermin
  orderMethod         WhPurchaseOrderMethod?   @map("order_method")
  orderMethodNote     String?                  @map("order_method_note") // e.g. phone contact name, date
  notes               String?

  // Totals (computed)
  subtotalNet         Float                    @default(0) @map("subtotal_net")
  totalGross          Float                    @default(0) @map("total_gross")

  printedAt           DateTime?                @map("printed_at") @db.Timestamptz(6)
  createdAt           DateTime                 @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime                 @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById         String?                  @map("created_by_id") @db.Uuid

  tenant    Tenant                    @relation(fields: [tenantId], references: [id])
  supplier  CrmAddress                @relation(fields: [supplierId], references: [id])
  contact   CrmContact?               @relation(fields: [contactId], references: [id], onDelete: SetNull)
  positions WhPurchaseOrderPosition[]

  @@unique([tenantId, number])
  @@index([tenantId, status])
  @@index([tenantId, supplierId])
  @@index([tenantId, requestedDelivery])
  @@map("wh_purchase_orders")
}
```

### WhPurchaseOrderPosition

```prisma
model WhPurchaseOrderPosition {
  id                    String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  purchaseOrderId       String   @map("purchase_order_id") @db.Uuid
  sortOrder             Int      @map("sort_order")
  articleId             String   @map("article_id") @db.Uuid
  supplierArticleNumber String?  @map("supplier_article_number") // From WhArticleSupplier
  description           String?
  quantity              Float
  receivedQuantity      Float    @default(0) @map("received_quantity") // Gelieferte Menge
  unit                  String?
  unitPrice             Float?   @map("unit_price")
  flatCosts             Float?   @map("flat_costs")
  totalPrice            Float?   @map("total_price")
  requestedDelivery     DateTime? @map("requested_delivery") @db.Timestamptz(6)
  confirmedDelivery     DateTime? @map("confirmed_delivery") @db.Timestamptz(6)
  createdAt             DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt             DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  purchaseOrder WhPurchaseOrder @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
  article       WhArticle       @relation(fields: [articleId], references: [id])

  @@index([purchaseOrderId, sortOrder])
  @@map("wh_purchase_order_positions")
}
```

---

## Permissions

Add to `permission-catalog.ts`:

```ts
p("wh_purchase_orders.view", "wh_purchase_orders", "view", "View purchase orders"),
p("wh_purchase_orders.create", "wh_purchase_orders", "create", "Create purchase orders"),
p("wh_purchase_orders.edit", "wh_purchase_orders", "edit", "Edit purchase orders"),
p("wh_purchase_orders.delete", "wh_purchase_orders", "delete", "Delete purchase orders"),
p("wh_purchase_orders.order", "wh_purchase_orders", "order", "Send/finalize purchase orders"),
```

---

## tRPC Router

**File:** `src/trpc/routers/warehouse/purchaseOrders.ts`

All procedures use `tenantProcedure.use(requireModule("warehouse"))`.

### Purchase Order Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `list` | query | `wh_purchase_orders.view` | `{ supplierId?, status?, search?, dateFrom?, dateTo?, page, pageSize }` | Paginated list |
| `getById` | query | `wh_purchase_orders.view` | `{ id }` | Full PO with positions |
| `create` | mutation | `wh_purchase_orders.create` | `{ supplierId, contactId?, requestedDelivery?, notes? }` | Creates DRAFT PO with auto number |
| `update` | mutation | `wh_purchase_orders.edit` | `{ id, ...fields }` | Only when DRAFT |
| `delete` | mutation | `wh_purchase_orders.delete` | `{ id }` | Only when DRAFT |
| `sendOrder` | mutation | `wh_purchase_orders.order` | `{ id, method, methodNote? }` | Sets status=ORDERED, orderDate=now(). Generates PDF for print/email. |
| `cancel` | mutation | `wh_purchase_orders.edit` | `{ id }` | Sets CANCELLED |
| `generatePdf` | query | `wh_purchase_orders.view` | `{ id }` | PDF preview |
| `reorderSuggestions` | query | `wh_purchase_orders.view` | `{ supplierId? }` | Articles below min stock with suggested order quantities |
| `createFromSuggestions` | mutation | `wh_purchase_orders.create` | `{ supplierId, articleIds: string[] }` | Creates PO from reorder suggestions |

### Position Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `positions.list` | query | `wh_purchase_orders.view` | `{ purchaseOrderId }` | All positions |
| `positions.add` | mutation | `wh_purchase_orders.edit` | `{ purchaseOrderId, articleId, quantity, unitPrice?, ... }` | Add position (only DRAFT) |
| `positions.update` | mutation | `wh_purchase_orders.edit` | `{ id, ...fields }` | Update position |
| `positions.delete` | mutation | `wh_purchase_orders.edit` | `{ id }` | Remove position |

---

## Service Layer

**Files:**
- `src/lib/services/wh-purchase-order-service.ts`
- `src/lib/services/wh-purchase-order-repository.ts`

### Key Logic

#### Reorder Suggestions

```ts
export async function getReorderSuggestions(prisma, tenantId, supplierId?) {
  // 1. Find articles where stockTracking=true AND currentStock < minStock
  // 2. If supplierId provided, filter to articles linked to that supplier
  // 3. For each article, calculate suggested order quantity:
  //    suggestedQty = max(minStock - currentStock, defaultOrderQty from supplier link)
  // 4. Include supplier details (primary supplier or specified supplier)
  // 5. Return sorted by urgency (lowest stock ratio first)
}
```

#### Create From Suggestions

```ts
export async function createFromSuggestions(prisma, tenantId, supplierId, articleIds, userId) {
  // 1. Create DRAFT PO for supplierId
  // 2. For each articleId:
  //    a. Get supplier article details (supplierArticleNumber, buyPrice, unit, leadTime)
  //    b. Calculate suggested quantity (minStock - currentStock or defaultOrderQty)
  //    c. Create position with these details
  // 3. Calculate totals
  // 4. Return PO
}
```

#### Send Order

When `sendOrder()` is called:
1. Sets status = ORDERED, orderDate = now()
2. Records order method (phone/email/fax/print) and note
3. After ordering, positions can no longer be edited (but `receivedQuantity` can be updated via WH_04)

#### Position Defaults

When adding a position for an article:
- Auto-fill `supplierArticleNumber` from `WhArticleSupplier` record for the PO's supplier
- Auto-fill `unitPrice` from `WhArticleSupplier.buyPrice` or article's `buyPrice`
- Auto-fill `unit` from article or supplier link

---

## UI Components

### Page Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/warehouse/purchase-orders` | `WhPurchaseOrdersPage` | PO list |
| `/warehouse/purchase-orders/[id]` | `WhPurchaseOrderDetailPage` | PO detail |
| `/warehouse/purchase-orders/new` | `WhPurchaseOrderCreatePage` | New PO |
| `/warehouse/purchase-orders/suggestions` | `WhReorderSuggestionsPage` | Reorder suggestions |

### Component Files

All in `src/components/warehouse/`:

| Component | Description |
|-----------|-------------|
| `purchase-order-list.tsx` | Data table. Columns: Number, Supplier, Order Date, Delivery Date, Status, Total. Toolbar: status filter, supplier filter, search. |
| `purchase-order-form.tsx` | Full form for create/edit. Supplier select, delivery dates, positions table. |
| `purchase-order-detail.tsx` | Read-only detail for ordered POs. Action bar: Send Order, Cancel, Generate PDF. Shows received quantities. |
| `purchase-order-position-table.tsx` | Editable positions table. Article autocomplete (filtered by supplier), quantity, price, delivery dates. |
| `purchase-order-send-dialog.tsx` | Dialog for sending: method select (Phone/Email/Fax/Print), note, confirmation. |
| `reorder-suggestions-list.tsx` | Table of articles below min stock. Columns: Article, Current Stock, Min Stock, Deficit, Supplier, Suggested Qty. Checkboxes to select. "Create PO" button. |
| `purchase-order-status-badge.tsx` | Status badges |

---

## Hooks

**File:** `src/hooks/use-wh-purchase-orders.ts`

```ts
export function useWhPurchaseOrders(filters) {
  return useQuery(trpc.warehouse.purchaseOrders.list.queryOptions(filters))
}

export function useWhPurchaseOrder(id: string) {
  return useQuery(trpc.warehouse.purchaseOrders.getById.queryOptions({ id }))
}

export function useWhReorderSuggestions(supplierId?: string) {
  return useQuery(trpc.warehouse.purchaseOrders.reorderSuggestions.queryOptions({ supplierId }))
}

export function useCreateWhPurchaseOrder() { /* ... */ }
export function useSendWhPurchaseOrder() { /* ... */ }
export function useCreateWhPOFromSuggestions() { /* ... */ }
```

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/wh-purchase-order-service.test.ts`

- `create` — generates PO number via NumberSequence
- `create` — validates supplier is SUPPLIER or BOTH type
- `sendOrder` — sets ORDERED status and orderDate
- `sendOrder` — rejects if not DRAFT
- `positions.add` — auto-fills supplier details
- `positions.add` — recalculates totals
- `positions.add` — rejects if PO is ORDERED
- `reorderSuggestions` — returns articles below min stock
- `reorderSuggestions` — calculates correct suggested quantity
- `reorderSuggestions` — filters by supplier
- `createFromSuggestions` — creates PO with positions
- `cancel` — sets CANCELLED

### Router Tests

**File:** `src/trpc/routers/__tests__/whPurchaseOrders-router.test.ts`

```ts
describe("warehouse.purchaseOrders", () => {
  it("list — requires wh_purchase_orders.view", async () => { })
  it("list — requires warehouse module enabled", async () => { })
  it("create — auto-generates number", async () => { })
  it("sendOrder — finalizes PO", async () => { })
  it("reorderSuggestions — returns below-min-stock articles", async () => { })
})
```

### E2E Tests

**File:** `src/e2e-browser/42-wh-purchase-orders.spec.ts`

```ts
test.describe("UC-WH-03: Purchase Orders", () => {
  test("create a purchase order with positions", async ({ page }) => {
    // Navigate to /warehouse/purchase-orders/new
    // Select supplier, add article positions
    // Save → verify in list as DRAFT
  })

  test("send a purchase order", async ({ page }) => {
    // Open DRAFT PO → click "Send Order"
    // Select method: Email → confirm
    // Verify status = ORDERED
  })

  test("create PO from reorder suggestions", async ({ page }) => {
    // Navigate to /warehouse/purchase-orders/suggestions
    // Select articles below min stock
    // Click "Create PO" → verify PO created with positions
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

- [ ] `WhPurchaseOrder` and `WhPurchaseOrderPosition` models created with migration
- [ ] PO number auto-generated via NumberSequence (key: "purchase_order")
- [ ] Status workflow: DRAFT → ORDERED → PARTIALLY_RECEIVED → RECEIVED (with CANCELLED)
- [ ] Positions auto-fill from supplier article details
- [ ] Positions locked after PO is sent (ORDERED)
- [ ] Reorder suggestions: articles below min stock with suggested quantities
- [ ] Create PO from suggestions with one click
- [ ] Send order with method tracking (phone/email/fax/print)
- [ ] PDF generation for purchase orders
- [ ] Supplier detail page shows "Purchase Orders" tab (CRM_01 integration)
- [ ] All procedures gated by `requireModule("warehouse")` and `wh_purchase_orders.*` permissions
- [ ] Cross-tenant isolation verified: all operations reject access with wrong tenantId (tests included)
