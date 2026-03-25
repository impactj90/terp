# Research: EK_02 — Freie Bestellpositionen

## 1. Current WhPurchaseOrderPosition Schema

**File:** `prisma/schema.prisma` (lines 4332-4356)

```prisma
model WhPurchaseOrderPosition {
  id                    String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  purchaseOrderId       String    @map("purchase_order_id") @db.Uuid
  sortOrder             Int       @map("sort_order")
  articleId             String    @map("article_id") @db.Uuid          // NOT nullable — must change
  supplierArticleNumber String?   @map("supplier_article_number") @db.VarChar(100)
  description           String?
  quantity              Float                                           // NOT nullable — must change
  receivedQuantity      Float     @default(0) @map("received_quantity")
  unit                  String?   @db.VarChar(20)
  unitPrice             Float?    @map("unit_price")
  flatCosts             Float?    @map("flat_costs")
  totalPrice            Float?    @map("total_price")
  vatRate               Float     @default(19.0) @map("vat_rate")
  requestedDelivery     DateTime? @map("requested_delivery") @db.Timestamptz(6)
  confirmedDelivery     DateTime? @map("confirmed_delivery") @db.Timestamptz(6)
  createdAt             DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt             DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  purchaseOrder WhPurchaseOrder @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
  article       WhArticle       @relation(fields: [articleId], references: [id])   // relation must become optional

  @@index([purchaseOrderId, sortOrder])
  @@map("wh_purchase_order_positions")
}
```

### Key changes needed:
- `articleId` → `String?` (nullable)
- `quantity` → `Float?` (nullable for TEXT positions)
- Add `positionType WhPurchaseOrderPositionType @default(ARTICLE) @map("position_type")`
- Add `freeText String? @map("free_text")`
- `article` relation → optional (`WhArticle?`)
- New enum `WhPurchaseOrderPositionType { ARTICLE, FREETEXT, TEXT }`

### Related parent model: WhPurchaseOrder (lines 4295-4330)
- Has `positions WhPurchaseOrderPosition[]`
- Totals: `subtotalNet`, `totalVat`, `totalGross`
- Positions included in `findById` with `article` relation included

## 2. Purchase Order Service

**File:** `/home/tolga/projects/terp/src/lib/services/wh-purchase-order-service.ts` (732 lines)

### Key functions that need changes:

**`addPosition` (lines 395-499):**
- Currently requires `articleId` (mandatory in input type)
- Validates article exists in `whArticle` table (line 423)
- Auto-fills from `WhArticleSupplier` link (supplier article number, buy price, order unit)
- Calculates `totalPrice = (quantity * unitPrice) + flatCosts`
- All this article-specific logic needs to be conditional on `positionType === "ARTICLE"`

**`updatePosition` (lines 501-583):**
- Recalculates `totalPrice` on every update
- For TEXT positions, `totalPrice` should stay null

**`deletePosition` (lines 585-628):**
- No type-specific changes needed (works on any position)

**`recalculateTotals` (lines 46-84):**
- Uses `pos.totalPrice != null` check — TEXT positions will naturally be excluded since their `totalPrice` is null. No change needed.

**`sendOrder` (lines 299-342):**
- Checks `positions.length > 0` — needs to be updated to only count non-TEXT positions, or keep as-is (a TEXT-only PO is arguably valid if user wants to send it)

**Repository file:** `/home/tolga/projects/terp/src/lib/services/wh-purchase-order-repository.ts` (321 lines)

Key repo functions:
- `createPosition` (lines 185-225): needs `articleId` optional, add `positionType`, `freeText`
- `findById` (lines 65-86): includes `article` relation — must handle nullable
- `updatePosition` (lines 227-252): no type-specific changes needed
- `findPositionsByOrder` (lines 162-183): includes `article` relation — must handle nullable

## 3. Purchase Order Router

**File:** `/home/tolga/projects/terp/src/trpc/routers/warehouse/purchaseOrders.ts` (357 lines)

### Position procedures that need changes:

**`positions.add` (lines 43-75):**
- Input schema currently requires `articleId: z.string().uuid()` — must become optional
- Need to add: `positionType: z.enum(["ARTICLE", "FREETEXT", "TEXT"]).default("ARTICLE")`
- Need to add: `freeText: z.string().optional()`

**`positions.update` (lines 77-108):**
- Input needs `freeText: z.string().optional()`
- May want `positionType` to be updatable too (or not)

**`positions.list` (lines 28-41):**
- No changes needed (just returns positions)

**`positions.delete` (lines 110-130):**
- No changes needed

## 4. UI Components

**File:** `/home/tolga/projects/terp/src/components/warehouse/purchase-order-position-table.tsx` (622 lines)

### Current structure:
- `AddPositionForm` interface: has `articleId`, `quantity`, `unitPrice`, etc. — no `positionType` or `freeText`
- `EMPTY_ADD_FORM`: defaults `articleId` to `''`, `quantity` to `'1'`
- Add form uses `ArticleSearchPopover` for article selection — this needs to be conditional on type
- The add form has a single `handleAddPosition()` that always sends `articleId`
- Table rows show `pos.article.number` and `pos.article.name` — must handle null article
- Disabled check: `disabled={!addForm.articleId || addMutation.isPending}` — must adapt per type

### Required UI changes:
1. Add type dropdown (ARTICLE / Freitext / Text) to add form
2. Conditionally show article search (ARTICLE) vs text input (FREETEXT/TEXT)
3. Conditionally show quantity/price fields (hidden for TEXT)
4. Table rendering must handle positions without `article` relation
5. Delete label fallback already handles `!pos.article` case (line 466-468)

## 5. Reference Pattern: Sales Order Positions (Billing Documents)

### Enum: `BillingPositionType` (prisma/schema.prisma lines 446-454)

```prisma
enum BillingPositionType {
  ARTICLE
  FREE       // ← called FREE not FREETEXT (this is the "Freitext" type)
  TEXT
  PAGE_BREAK
  SUBTOTAL

  @@map("billing_position_type")
}
```

### Model: `BillingDocumentPosition` (lines 726-750)

```prisma
model BillingDocumentPosition {
  id              String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  documentId      String              @map("document_id") @db.Uuid
  sortOrder       Int                 @map("sort_order")
  type            BillingPositionType @default(FREE)
  articleId       String?             @map("article_id") @db.Uuid     // nullable
  articleNumber   String?             @map("article_number") @db.VarChar(50)
  description     String?
  quantity        Float?                                               // nullable
  unit            String?             @db.VarChar(20)
  unitPrice       Float?              @map("unit_price")
  flatCosts       Float?              @map("flat_costs")
  totalPrice      Float?              @map("total_price")
  priceType       BillingPriceType?   @map("price_type")
  vatRate         Float?              @map("vat_rate")
  ...
}
```

Key differences from PO positions:
- Uses `type` not `positionType` as field name
- Uses `description` for text (no separate `freeText` field)
- `quantity`, `vatRate` are all nullable
- No `receivedQuantity` field (not relevant for sales)

### Service: `billing-document-service.ts`

**`addPosition` (lines 832-908):**
- Takes `type: string` in input
- Does NOT validate per type — just passes everything through
- Uses `calculatePositionTotal` which returns null when all values are 0
- TEXT positions get `totalPrice: null` because quantity/unitPrice are null

**`recalculateTotals` (lines 69-108):**
- Uses `pos.totalPrice != null` check — TEXT positions with null totalPrice are naturally excluded

### UI: `document-position-table.tsx`

**Type dropdown pattern (lines 414-425):**
```tsx
<Select value={addType} onValueChange={setAddType}>
  <SelectTrigger className="w-40">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="FREE">Freitext</SelectItem>
    <SelectItem value="ARTICLE">Artikel</SelectItem>
    <SelectItem value="TEXT">Textzeile</SelectItem>
    <SelectItem value="PAGE_BREAK">Seitenumbruch</SelectItem>
    <SelectItem value="SUBTOTAL">Zwischensumme</SelectItem>
  </SelectContent>
</Select>
```

**Field visibility per type (lines 328-391):**
- TEXT, PAGE_BREAK, SUBTOTAL: hide quantity, unit, unitPrice, flatCosts, vatRate
- FREE, ARTICLE: show all fields

**Add handler (lines 195-209):**
- Sets defaults per type:
  - FREE/ARTICLE: `quantity: 1, unitPrice: 0, vatRate: 19`
  - TEXT: `description: 'Textzeile'`, no quantity/price

### PDF: `position-table-pdf.tsx`

Uses `pos.type` to control rendering:
- `PAGE_BREAK` → return null
- `TEXT` → render description only, no price columns
- `SUBTOTAL` → special subtotal row
- Default (ARTICLE/FREE) → full row with all columns

## 6. Hooks

**File:** `/home/tolga/projects/terp/src/hooks/use-wh-purchase-orders.ts` (204 lines)

Relevant hooks:
- `useAddWhPOPosition()` (line 157) — wraps `positions.add` mutation
- `useUpdateWhPOPosition()` (line 173) — wraps `positions.update` mutation
- `useDeleteWhPOPosition()` (line 189) — wraps `positions.delete` mutation
- `useWhPOPositions()` (line 55) — wraps `positions.list` query

No new hooks needed — existing mutations just need their input types updated.

## 7. Existing Tests

### Service Tests
**File:** `/home/tolga/projects/terp/src/lib/services/__tests__/wh-purchase-order-service.test.ts` (~900 lines)

Current `addPosition` tests (from line 560):
- Auto-fills supplier article details when WhArticleSupplier link exists
- Falls back to article buyPrice when no supplier link
- Calculates totalPrice = (quantity * unitPrice) + flatCosts
- Recalculates order totals after adding position
- Rejects if PO is ORDERED
- Rejects if article not found
- Uses explicit unitPrice over supplier/article defaults

Current `updatePosition` tests (from line 721):
- Updates position and recalculates totals
- Rejects if PO is not DRAFT
- Throws NotFoundError when position not found

Current `deletePosition` tests (from line 808):
- Removes position and recalculates totals
- Rejects if PO is not DRAFT
- Throws NotFoundError when position not found

### Router Tests
**File:** `/home/tolga/projects/terp/src/trpc/routers/__tests__/whPurchaseOrders-router.test.ts`

Covers: list, create, update, delete, sendOrder, cancel, reorderSuggestions, positions.list, positions.add

### New tests needed (per ticket):
- `addPosition FREETEXT` — creates position without articleId
- `addPosition FREETEXT` — rejects without freeText
- `addPosition FREETEXT` — rejects without unitPrice
- `addPosition TEXT` — creates position without price/quantity
- `addPosition TEXT` — is excluded from totals (totalPrice = null)
- `addPosition ARTICLE` — still requires articleId
- Sorting works across all position types

## 8. PDF Generation

**No purchase order PDF exists yet.** The `EK_01` ticket (TICKET_EK_01_BESTELLDRUCK_PDF.md) covers this.

Relevant existing PDF components:
- `/home/tolga/projects/terp/src/lib/pdf/position-table-pdf.tsx` — shared billing position table PDF component
  - Already handles `TEXT` type (renders description only, no price columns)
  - Already handles `PAGE_BREAK`, `SUBTOTAL`
  - Uses `pos.type` field to decide rendering

When EK_01 is implemented, the PO PDF should follow this pattern. The `position-table-pdf.tsx` component could potentially be reused or adapted for PO positions.

## 9. Migration Examples

### Enum creation pattern (from `20260323120000_wh_purchase_orders.sql`):
```sql
CREATE TYPE wh_purchase_order_position_type AS ENUM (
  'ARTICLE',
  'FREETEXT',
  'TEXT'
);
```

### Column addition pattern (from `20260325100000_wh_purchase_order_vat.sql`):
```sql
ALTER TABLE wh_purchase_order_positions
  ADD COLUMN position_type wh_purchase_order_position_type NOT NULL DEFAULT 'ARTICLE';

ALTER TABLE wh_purchase_order_positions
  ALTER COLUMN article_id DROP NOT NULL;

ALTER TABLE wh_purchase_order_positions
  ADD COLUMN free_text TEXT;
```

### Note on quantity:
The ticket's validation table says TEXT positions have `quantity: null`. Currently `quantity` is `DOUBLE PRECISION NOT NULL`. It needs to become nullable:
```sql
ALTER TABLE wh_purchase_order_positions
  ALTER COLUMN quantity DROP NOT NULL;
```

## 10. Key Findings & Recommendations

### Design decision: field naming

The ticket proposes:
- `positionType` field + `freeText` field (separate from `description`)

The billing reference pattern uses:
- `type` field + `description` (reuses existing description field, no separate freeText)

**Recommendation:** Follow the ticket's design (`positionType` + `freeText`), since PO positions already have a `description` field with different semantics (additional notes for an article position). Keeping `freeText` separate avoids confusion. The ticket was designed this way intentionally.

### Impact on goods receipt (stock movements)

**Critical:** `/home/tolga/projects/terp/src/lib/services/wh-stock-movement-service.ts` `bookGoodsReceipt()` (line 93+) processes PO positions and:
1. Fetches `position.articleId` to look up article (line 145)
2. Creates stock movement with `articleId: position.articleId` (line 159)
3. Updates article stock (line 181)

**FREETEXT and TEXT positions must be skipped during goods receipt.** Either:
- The UI must not show them as receivable positions
- The service must filter them out / reject them
- **Recommendation:** When loading receivable positions for a PO, filter to `positionType === 'ARTICLE'` only. Also validate in `bookGoodsReceipt` that submitted positions are ARTICLE type.

### Quantity nullability

For TEXT positions, quantity should be null. Currently `quantity Float` (not nullable) in Prisma. Must change to `Float?`. This also affects:
- `sendOrder` — checks `positions.length > 0` (still valid, counts all types)
- `recalculateTotals` — already uses `pos.totalPrice != null` guard (works fine)
- `updatePosition` — recalculates `totalPrice = qty * price + flat` — must skip for TEXT positions

### Summary of files to modify

1. **`prisma/schema.prisma`** — add enum, modify model
2. **`supabase/migrations/YYYYMMDD_wh_po_position_types.sql`** — new migration
3. **`src/lib/services/wh-purchase-order-service.ts`** — addPosition branching, updatePosition guard
4. **`src/lib/services/wh-purchase-order-repository.ts`** — createPosition input types, nullable article include
5. **`src/trpc/routers/warehouse/purchaseOrders.ts`** — input schema changes
6. **`src/components/warehouse/purchase-order-position-table.tsx`** — type dropdown, conditional fields
7. **`src/lib/services/__tests__/wh-purchase-order-service.test.ts`** — new test cases
8. **`src/lib/services/wh-stock-movement-service.ts`** — filter FREETEXT/TEXT from goods receipt (defensive guard)
