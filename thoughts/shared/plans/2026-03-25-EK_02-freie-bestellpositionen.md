# Plan: EK_02 — Freie Bestellpositionen

## Summary

Add two new position types to purchase orders: **FREETEXT** (free-text line with price but no article reference) and **TEXT** (text-only line, no price/quantity). This follows the existing `BillingPositionType` pattern from sales documents but uses `positionType` + `freeText` fields to avoid semantic collision with the existing `description` field.

---

## Phase 1: Database Migration

### 1a. Migration file

**File:** `supabase/migrations/20260329100000_wh_po_position_types.sql`

```sql
-- 1. Create enum
CREATE TYPE wh_purchase_order_position_type AS ENUM (
  'ARTICLE',
  'FREETEXT',
  'TEXT'
);

-- 2. Add position_type column (default ARTICLE for existing rows)
ALTER TABLE wh_purchase_order_positions
  ADD COLUMN position_type wh_purchase_order_position_type NOT NULL DEFAULT 'ARTICLE';

-- 3. Add free_text column
ALTER TABLE wh_purchase_order_positions
  ADD COLUMN free_text TEXT;

-- 4. Make article_id nullable (existing rows keep their value)
ALTER TABLE wh_purchase_order_positions
  ALTER COLUMN article_id DROP NOT NULL;

-- 5. Make quantity nullable (TEXT positions have no quantity)
ALTER TABLE wh_purchase_order_positions
  ALTER COLUMN quantity DROP NOT NULL;
```

### 1b. Prisma schema changes

**File:** `prisma/schema.prisma`

**Add enum** (before `WhPurchaseOrderPosition` model, after `WhPurchaseOrderStatus` enum):

```prisma
enum WhPurchaseOrderPositionType {
  ARTICLE
  FREETEXT
  TEXT

  @@map("wh_purchase_order_position_type")
}
```

**Modify `WhPurchaseOrderPosition`** model — 5 field changes:

| Field | Current | New |
|---|---|---|
| `positionType` | (does not exist) | `WhPurchaseOrderPositionType @default(ARTICLE) @map("position_type")` |
| `freeText` | (does not exist) | `String? @map("free_text")` |
| `articleId` | `String @map("article_id") @db.Uuid` | `String? @map("article_id") @db.Uuid` |
| `quantity` | `Float` | `Float?` |
| `article` (relation) | `WhArticle @relation(...)` | `WhArticle? @relation(...)` |

### 1c. Regenerate Prisma client

```bash
pnpm db:generate
```

---

## Phase 2: Service Layer

### 2a. Repository: `src/lib/services/wh-purchase-order-repository.ts`

**`createPosition` (line 185):** Update the `data` type signature:
- `articleId: string` → `articleId?: string | null`
- `quantity: number` → `quantity?: number | null`
- Add `positionType?: string`
- Add `freeText?: string | null`
- In the `data` object passed to `prisma.whPurchaseOrderPosition.create`, include `positionType` and `freeText`

**`createPosition` include (line 219):** The `article` include must handle nullable — no code change needed since Prisma will return `null` for nullable relations.

### 2b. Service: `src/lib/services/wh-purchase-order-service.ts`

**`addPosition` (line 395):** Refactor into type-branching logic.

Current input type:
```ts
input: {
  purchaseOrderId: string
  articleId: string      // → string | undefined
  quantity: number       // → number | undefined
  // ... rest stays
}
```

New input type:
```ts
input: {
  purchaseOrderId: string
  positionType?: "ARTICLE" | "FREETEXT" | "TEXT"  // default "ARTICLE"
  articleId?: string
  freeText?: string
  quantity?: number
  unitPrice?: number
  unit?: string
  description?: string
  flatCosts?: number
  vatRate?: number
  requestedDelivery?: string
  confirmedDelivery?: string
}
```

Logic changes (after draft check, before repo.createPosition):

```ts
const positionType = input.positionType ?? "ARTICLE"

if (positionType === "ARTICLE") {
  // Existing logic: require articleId, validate article, auto-fill from supplier
  if (!input.articleId) throw new WhPurchaseOrderValidationError("articleId is required for ARTICLE positions")
  // ... existing article lookup, supplier auto-fill, totalPrice calc ...
  // Build position data with articleId, quantity (required), totalPrice, etc.
}
else if (positionType === "FREETEXT") {
  // Require freeText, quantity, unitPrice
  if (!input.freeText) throw new WhPurchaseOrderValidationError("freeText is required for FREETEXT positions")
  if (input.quantity == null || input.quantity <= 0) throw new WhPurchaseOrderValidationError("quantity is required for FREETEXT positions")
  if (input.unitPrice == null) throw new WhPurchaseOrderValidationError("unitPrice is required for FREETEXT positions")
  // Calculate totalPrice = (quantity * unitPrice) + flatCosts
  // Build position data with freeText, quantity, unitPrice, totalPrice, vatRate, NO articleId
}
else if (positionType === "TEXT") {
  // Require freeText only
  if (!input.freeText) throw new WhPurchaseOrderValidationError("freeText is required for TEXT positions")
  // Build position data with freeText only, quantity=null, unitPrice=null, totalPrice=null, NO articleId
}
```

The `repo.createPosition` call gets `positionType` and `freeText` added to the data object.

**`updatePosition` (line 501):** Add type-aware totalPrice recalculation.

After fetching the position (line 518), check its `positionType`:

```ts
// Add positionType to the select clause (line 523)
// After building `data` object:
if (position.positionType === "TEXT") {
  // TEXT positions never have totalPrice
  data.totalPrice = null
  // Don't allow setting quantity/unitPrice/flatCosts
} else {
  // Existing totalPrice recalculation (lines 558-562)
  const qty = data.quantity ?? position.quantity ?? 0
  const price = data.unitPrice ?? position.unitPrice ?? 0
  const flat = data.flatCosts ?? position.flatCosts ?? 0
  data.totalPrice = (qty * price) + flat
}
```

Also add `freeText` to the update input type and the `data` builder:
```ts
if (input.freeText !== undefined) data.freeText = input.freeText
```

**`recalculateTotals` (line 46):** No change needed — already uses `pos.totalPrice != null` guard, so TEXT positions (with null totalPrice) are naturally excluded.

**`sendOrder` (line 299):** Consider whether a PO with only TEXT positions is valid. **Recommendation:** Keep current check (`positions.length > 0`) as-is. A PO with only TEXT positions is an edge case unlikely in practice, and the user presumably knows what they're doing.

**`listPositions` (line 383):** No changes needed — it returns whatever positions exist.

### 2c. Stock movement guard: `src/lib/services/wh-stock-movement-service.ts`

**`bookGoodsReceipt` (line 93):** Add a defensive guard when iterating positions (line 121-190).

After fetching the position (line 123), add:
```ts
// Skip non-ARTICLE positions (they have no article to receive stock for)
if (position.positionType !== "ARTICLE") {
  throw new WhStockMovementValidationError(
    "Only ARTICLE positions can receive goods"
  )
}
```

Also fix the `allFullyReceived` check (line 197) to only consider ARTICLE positions:
```ts
const articlePositions = allPositions.filter(p => p.positionType === "ARTICLE")
const allFullyReceived = articlePositions.every(
  (p) => p.receivedQuantity >= (p.quantity ?? 0)
)
const anyReceived = articlePositions.some((p) => p.receivedQuantity > 0)
```

And handle the edge case where there are no ARTICLE positions (shouldn't happen in practice, but defensive):
```ts
if (articlePositions.length === 0) {
  newStatus = "RECEIVED"
}
```

---

## Phase 3: Router/Input Schema

**File:** `src/trpc/routers/warehouse/purchaseOrders.ts`

### 3a. `positions.add` input schema (line 46)

Change from:
```ts
z.object({
  purchaseOrderId: z.string().uuid(),
  articleId: z.string().uuid(),
  quantity: z.number().positive(),
  // ...
})
```

To:
```ts
z.object({
  purchaseOrderId: z.string().uuid(),
  positionType: z.enum(["ARTICLE", "FREETEXT", "TEXT"]).default("ARTICLE"),
  articleId: z.string().uuid().optional(),
  freeText: z.string().optional(),
  quantity: z.number().positive().optional(),
  unitPrice: z.number().optional(),
  unit: z.string().optional(),
  description: z.string().optional(),
  flatCosts: z.number().optional(),
  vatRate: z.number().min(0).max(100).optional(),
  requestedDelivery: z.string().optional(),
  confirmedDelivery: z.string().optional(),
})
```

Note: Per-type field requirements are enforced in the service layer (not Zod), because Zod discriminated unions add complexity without benefit here.

### 3b. `positions.update` input schema (line 80)

Add:
```ts
freeText: z.string().optional(),
```

Make quantity optional (already is `.optional()`, but confirm it allows the field to be omitted entirely — yes, it does).

---

## Phase 4: UI Changes

**File:** `src/components/warehouse/purchase-order-position-table.tsx`

### 4a. Add imports

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
```

### 4b. Update `AddPositionForm` interface and default (line 41-61)

Add `positionType` field:
```ts
interface AddPositionForm {
  positionType: 'ARTICLE' | 'FREETEXT' | 'TEXT'
  articleId: string
  articleLabel: string
  freeText: string
  quantity: string
  unitPrice: string
  unit: string
  description: string
  flatCosts: string
  vatRate: string
}

const EMPTY_ADD_FORM: AddPositionForm = {
  positionType: 'ARTICLE',
  articleId: '',
  articleLabel: '',
  freeText: '',
  quantity: '1',
  unitPrice: '',
  unit: '',
  description: '',
  flatCosts: '',
  vatRate: '19',
}
```

### 4c. Update `handleAddPosition` (line 100)

Branch on `addForm.positionType`:
```ts
function handleAddPosition() {
  const type = addForm.positionType

  if (type === 'ARTICLE' && !addForm.articleId) return
  if (type === 'FREETEXT' && (!addForm.freeText || !addForm.unitPrice)) return
  if (type === 'TEXT' && !addForm.freeText) return

  addMutation.mutate(
    {
      purchaseOrderId,
      positionType: type,
      articleId: type === 'ARTICLE' ? addForm.articleId : undefined,
      freeText: type !== 'ARTICLE' ? addForm.freeText || undefined : undefined,
      quantity: type !== 'TEXT'
        ? (parseFloat(addForm.quantity) || 1)
        : undefined,
      unitPrice: type !== 'TEXT' && addForm.unitPrice
        ? parseFloat(addForm.unitPrice)
        : undefined,
      unit: type !== 'TEXT' && addForm.unit ? addForm.unit : undefined,
      description: addForm.description || undefined,
      flatCosts: type !== 'TEXT' && addForm.flatCosts
        ? parseFloat(addForm.flatCosts)
        : undefined,
      vatRate: type !== 'TEXT' && addForm.vatRate
        ? parseFloat(addForm.vatRate)
        : undefined,
    },
    {
      onSuccess: () => {
        toast.success(t('toastPositionAdded'))
        setIsAdding(false)
        setAddForm(EMPTY_ADD_FORM)
      },
      onError: (err) => toast.error(err.message),
    }
  )
}
```

### 4d. Update add-form disabled check (line 586)

```tsx
disabled={
  (addForm.positionType === 'ARTICLE' && !addForm.articleId) ||
  (addForm.positionType === 'FREETEXT' && (!addForm.freeText || !addForm.unitPrice)) ||
  (addForm.positionType === 'TEXT' && !addForm.freeText) ||
  addMutation.isPending
}
```

### 4e. Update the add-form row (line 484-604)

Replace the current single-layout add row with type-aware rendering:

**First cell after "+":** Add a type selector `<Select>`:
```tsx
<TableCell>
  <Select
    value={addForm.positionType}
    onValueChange={(val) =>
      setAddForm({
        ...EMPTY_ADD_FORM,
        positionType: val as 'ARTICLE' | 'FREETEXT' | 'TEXT',
      })
    }
  >
    <SelectTrigger className="w-28 h-8">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="ARTICLE">Artikel</SelectItem>
      <SelectItem value="FREETEXT">Freitext</SelectItem>
      <SelectItem value="TEXT">Textzeile</SelectItem>
    </SelectContent>
  </Select>
</TableCell>
```

**Article/Description cell:** Conditionally render:
- **ARTICLE:** `ArticleSearchPopover` (existing behavior) + description input
- **FREETEXT:** `Textarea` for `freeText` + description input
- **TEXT:** `Textarea` for `freeText` only, spanning more columns

**Quantity/Price cells:** Conditionally show:
- **ARTICLE / FREETEXT:** Show quantity, unit, unitPrice, flatCosts, vatRate
- **TEXT:** Show empty cells (or skip with colSpan)

### 4f. Update table rows — position display (line 269-479)

Update the `pos` type to include:
```ts
positionType?: string
freeText?: string | null
```

Adapt the article cell (line 297-305):
```tsx
<TableCell className="text-sm">
  {pos.positionType === 'TEXT' && (
    <span className="italic text-muted-foreground">{pos.freeText}</span>
  )}
  {pos.positionType === 'FREETEXT' && (
    <span>{pos.freeText}</span>
  )}
  {(!pos.positionType || pos.positionType === 'ARTICLE') && pos.article && (
    <span>
      <span className="font-mono text-xs mr-1">{pos.article.number}</span>
      {pos.article.name}
    </span>
  )}
</TableCell>
```

For TEXT positions, show dashes in quantity/price columns. The existing `formatPrice(pos.totalPrice)` already handles null.

Update the quantity display (line 343) to handle nullable:
```tsx
<span className="text-sm">{pos.quantity != null ? pos.quantity : '\u2014'}</span>
```

### 4g. Update `startEdit` function (line 130)

Add `freeText` to the edit form, and handle nullable quantity:
```ts
interface EditPositionForm {
  freeText: string
  quantity: string
  unitPrice: string
  unit: string
  description: string
  flatCosts: string
  vatRate: string
}

function startEdit(position: { ... freeText?: string | null, quantity?: number | null, ... }) {
  setEditForm({
    freeText: position.freeText || '',
    quantity: position.quantity != null ? String(position.quantity) : '',
    // ... rest as before
  })
}
```

### 4h. Update `handleSaveEdit` (line 150)

Add `freeText` to the update mutation payload:
```ts
freeText: editForm.freeText || undefined,
```

### 4i. Update delete label fallback (line 466)

Already handles `!pos.article` — enhance with freeText:
```tsx
label: pos.article
  ? `${pos.article.number} — ${pos.article.name}`
  : pos.freeText || pos.id,
```

### 4j. Add i18n keys

**File:** `messages/de.json` (within `warehousePurchaseOrders` section, around line 5802)

```json
"posColType": "Typ",
"posTypeArticle": "Artikel",
"posTypeFreetext": "Freitext",
"posTypeText": "Textzeile",
"posFreetextPlaceholder": "Bezeichnung eingeben..."
```

**File:** `messages/en.json` (equivalent keys)

```json
"posColType": "Type",
"posTypeArticle": "Article",
"posTypeFreetext": "Free text",
"posTypeText": "Text line",
"posFreetextPlaceholder": "Enter description..."
```

---

## Phase 5: Tests

### 5a. Service tests

**File:** `src/lib/services/__tests__/wh-purchase-order-service.test.ts`

Add within the existing `describe("addPosition")` block:

1. **`addPosition FREETEXT — creates position without articleId`**
   - Input: `{ purchaseOrderId, positionType: "FREETEXT", freeText: "Custom gasket", quantity: 5, unitPrice: 12.50, vatRate: 19 }`
   - Assert: `prisma.whPurchaseOrderPosition.create` called with `positionType: "FREETEXT"`, `articleId: null`, `freeText: "Custom gasket"`, `totalPrice: 62.50`
   - Assert: article lookup NOT called

2. **`addPosition FREETEXT — rejects without freeText`**
   - Input: `{ purchaseOrderId, positionType: "FREETEXT", quantity: 5, unitPrice: 12.50 }` (no freeText)
   - Assert: throws `WhPurchaseOrderValidationError`

3. **`addPosition FREETEXT — rejects without unitPrice`**
   - Input: `{ purchaseOrderId, positionType: "FREETEXT", freeText: "Something", quantity: 5 }` (no unitPrice)
   - Assert: throws `WhPurchaseOrderValidationError`

4. **`addPosition TEXT — creates position without price/quantity`**
   - Input: `{ purchaseOrderId, positionType: "TEXT", freeText: "Garantiebedingungen: 2 Jahre" }`
   - Assert: `create` called with `positionType: "TEXT"`, `quantity: null`, `unitPrice: null`, `totalPrice: null`, `freeText: "Garantiebedingungen: 2 Jahre"`

5. **`addPosition TEXT — excluded from totals`**
   - Create PO with one ARTICLE position (totalPrice: 100) and one TEXT position
   - Assert: order `subtotalNet` is 100 (not affected by TEXT)

6. **`addPosition ARTICLE — still requires articleId`**
   - Input: `{ purchaseOrderId, positionType: "ARTICLE", quantity: 5 }` (no articleId)
   - Assert: throws `WhPurchaseOrderValidationError`

7. **`updatePosition — updates freeText on FREETEXT position`**
   - Mock position with `positionType: "FREETEXT"`
   - Input: `{ id, freeText: "Updated text" }`
   - Assert: update called with `freeText: "Updated text"`

8. **`updatePosition — TEXT position keeps totalPrice null`**
   - Mock position with `positionType: "TEXT"`
   - Input: `{ id, freeText: "New text" }`
   - Assert: update called with `totalPrice: null`

### 5b. Router tests

**File:** `src/trpc/routers/__tests__/whPurchaseOrders-router.test.ts`

Add within `describe("positions")`:

1. **`positions.add FREETEXT — creates position without article`**
   - Call `positions.add` with `{ positionType: "FREETEXT", freeText: "Special item", quantity: 2, unitPrice: 25 }`
   - Assert: returns position with `positionType: "FREETEXT"`, `article: null`

2. **`positions.add TEXT — creates text-only position`**
   - Call `positions.add` with `{ positionType: "TEXT", freeText: "Note: deliver before 10am" }`
   - Assert: returns position with `totalPrice: null`, `quantity: null`

3. **`totals — TEXT positions excluded from order totals`**
   - Add ARTICLE position (qty: 10, price: 5 = 50) + TEXT position
   - Fetch order, assert `subtotalNet: 50`

### 5c. Stock movement guard test

**File:** `src/lib/services/__tests__/wh-stock-movement-service.test.ts` (if exists, otherwise add inline)

1. **`bookGoodsReceipt — rejects FREETEXT position`**
   - Mock position with `positionType: "FREETEXT"`
   - Assert: throws `WhStockMovementValidationError("Only ARTICLE positions can receive goods")`

---

## Phase 6: Handbook (if TERP_HANDBUCH.md is maintained)

Not in scope for this ticket. The handbook section for Einkauf/Bestellungen (if it exists) should be updated to mention the new position types. This can be done as a follow-up.

---

## Verification Steps

- [ ] Migration applies cleanly: `pnpm db:push:staging` or `supabase db reset`
- [ ] `pnpm db:generate` succeeds, Prisma types include `positionType`, `freeText`, nullable `articleId` and `quantity`
- [ ] `pnpm typecheck` passes (or no new errors beyond baseline)
- [ ] Service tests pass: `pnpm vitest run src/lib/services/__tests__/wh-purchase-order-service.test.ts`
- [ ] Router tests pass: `pnpm vitest run src/trpc/routers/__tests__/whPurchaseOrders-router.test.ts`
- [ ] Manual UI test: open a draft PO, add ARTICLE position (existing flow works)
- [ ] Manual UI test: switch type to Freitext, enter text + qty + price, save — position appears with price
- [ ] Manual UI test: switch type to Textzeile, enter text, save — position appears without price/qty columns
- [ ] Manual UI test: verify order totals only include ARTICLE and FREETEXT positions
- [ ] Manual UI test: edit a FREETEXT position's text — updates correctly
- [ ] Manual UI test: delete a TEXT position — works, totals unchanged
- [ ] Goods receipt: TEXT/FREETEXT positions not shown as receivable (defensive guard rejects them)
- [ ] `pnpm lint` passes

---

## Files to Modify (Summary)

| # | File | Change |
|---|------|--------|
| 1 | `supabase/migrations/20260329100000_wh_po_position_types.sql` | **NEW** — enum + columns + nullable |
| 2 | `prisma/schema.prisma` | Add enum `WhPurchaseOrderPositionType`, modify `WhPurchaseOrderPosition` model |
| 3 | `src/lib/services/wh-purchase-order-repository.ts` | `createPosition` input types — add `positionType`, `freeText`, make `articleId`/`quantity` optional |
| 4 | `src/lib/services/wh-purchase-order-service.ts` | `addPosition` type branching, `updatePosition` type-aware totalPrice, input type updates |
| 5 | `src/lib/services/wh-stock-movement-service.ts` | `bookGoodsReceipt` — filter/reject non-ARTICLE positions, fix `allFullyReceived` check |
| 6 | `src/trpc/routers/warehouse/purchaseOrders.ts` | `positions.add` and `positions.update` input schemas |
| 7 | `src/components/warehouse/purchase-order-position-table.tsx` | Type selector, conditional fields, display per type |
| 8 | `messages/de.json` | New i18n keys for position types |
| 9 | `messages/en.json` | New i18n keys for position types |
| 10 | `src/lib/services/__tests__/wh-purchase-order-service.test.ts` | New test cases for FREETEXT, TEXT, validation |
| 11 | `src/trpc/routers/__tests__/whPurchaseOrders-router.test.ts` | New test cases for FREETEXT, TEXT |

**No new hooks needed** — existing `useAddWhPOPosition`, `useUpdateWhPOPosition` automatically pick up the updated tRPC input types.

**No PDF changes needed** — PO PDF does not exist yet (covered by separate ticket EK_01).
