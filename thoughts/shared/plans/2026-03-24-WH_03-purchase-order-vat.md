# WH_03 Purchase Order VAT (MwSt) Support

## Overview

Add per-position VAT rate tracking and proper gross total calculation to purchase orders (WH_03 Einkauf). Currently `totalGross = subtotalNet` with no tax calculation. After this change, each position carries a `vatRate` (auto-filled from the article), and the order totals show a proper VAT breakdown (Nettosumme → MwSt per rate → Bruttosumme).

## Current State Analysis

- `WhPurchaseOrderPosition` has no `vatRate` field (`prisma/schema.prisma:4326-4349`)
- `WhPurchaseOrder` has `subtotalNet` and `totalGross` but no `totalVat` (`prisma/schema.prisma:4291-4324`)
- `recalculateTotals` sets `totalGross = subtotalNet` — no VAT calculation (`wh-purchase-order-service.ts:46-60`)
- `WhArticle.vatRate` exists with `@default(19.0)` (`prisma/schema.prisma:4184`) — the source for auto-fill
- The billing module has a working reference implementation of grouped VAT calculation (`billing-document-service.ts:67-109`)
- The article search projection already includes `buyPrice` but not `vatRate` (`wh-article-repository.ts:219-225`)

## Desired End State

1. Each `WhPurchaseOrderPosition` stores a `vatRate` (auto-populated from article, editable in DRAFT)
2. `recalculateTotals` groups VAT by rate and calculates `totalGross = subtotalNet + Σ MwSt`
3. `WhPurchaseOrder` stores `totalVat` alongside `subtotalNet` and `totalGross`
4. Detail view shows Summenblock: Nettosumme → MwSt-Aufschlüsselung per rate → Bruttosumme
5. Position table add row shows vatRate (auto-filled from article, editable)

### Verification:
- Create a PO with two positions: one 19% article, one 7% article
- Summenblock shows separate MwSt lines for 19% and 7%
- `totalGross = subtotalNet + MwSt(19%) + MwSt(7%)`

## What We're NOT Doing

- No Vorsteuer booking integration (accounting module scope)
- No reverse-charge / Steuerschuldnerschaft handling
- No per-document "Prices including VAT" toggle (always netto input)
- No VAT reporting or ELSTER integration

## Implementation Approach

Follow the billing module pattern (`billing-document-service.ts:67-109`) for the VAT calculation. Single-phase implementation since the changes are straightforward and all connected.

---

## Phase 1: Database Migration

### Overview
Add `vat_rate` to positions and `total_vat` to orders. Backfill existing positions from their linked article.

### Changes Required:

#### 1. Migration
**File**: `supabase/migrations/20260325100000_wh_purchase_order_vat.sql`

```sql
-- Add vat_rate to positions (default 19% for existing rows)
ALTER TABLE wh_purchase_order_positions
  ADD COLUMN vat_rate double precision NOT NULL DEFAULT 19.0;

-- Add total_vat to orders
ALTER TABLE wh_purchase_orders
  ADD COLUMN total_vat double precision NOT NULL DEFAULT 0;

-- Backfill: set each position's vat_rate from its linked article
UPDATE wh_purchase_order_positions p
SET vat_rate = a.vat_rate
FROM wh_articles a
WHERE p.article_id = a.id;

-- Backfill: recalculate total_vat and total_gross for all orders
WITH order_vat AS (
  SELECT
    purchase_order_id,
    ROUND(CAST(SUM(COALESCE(total_price, 0) * vat_rate / 100) AS numeric), 2) AS total_vat
  FROM wh_purchase_order_positions
  GROUP BY purchase_order_id
)
UPDATE wh_purchase_orders o
SET
  total_vat = COALESCE(ov.total_vat, 0),
  total_gross = ROUND(CAST(o.subtotal_net + COALESCE(ov.total_vat, 0) AS numeric), 2)
FROM order_vat ov
WHERE o.id = ov.purchase_order_id;
```

#### 2. Prisma Schema
**File**: `prisma/schema.prisma`

Add to `WhPurchaseOrderPosition` (after `totalPrice` field):
```prisma
  vatRate               Float     @default(19.0) @map("vat_rate")
```

Add to `WhPurchaseOrder` (after `subtotalNet` field):
```prisma
  totalVat            Float                    @default(0) @map("total_vat")
```

---

## Phase 2: Service Layer

### Overview
Update all position-creating/updating functions to handle `vatRate`, and fix `recalculateTotals` to calculate VAT properly.

### Changes Required:

#### 1. Fix `recalculateTotals`
**File**: `src/lib/services/wh-purchase-order-service.ts:46-60`

Replace current implementation with billing-style grouped VAT calculation:

```typescript
async function recalculateTotals(
  prisma: PrismaClient,
  tenantId: string,
  purchaseOrderId: string
) {
  const positions = await prisma.whPurchaseOrderPosition.findMany({
    where: { purchaseOrderId },
    select: { totalPrice: true, vatRate: true },
  })

  let subtotalNet = 0
  const vatMap = new Map<number, number>()

  for (const pos of positions) {
    if (pos.totalPrice != null) {
      subtotalNet += pos.totalPrice
      if (pos.vatRate != null && pos.vatRate > 0) {
        const vatAmount = pos.totalPrice * (pos.vatRate / 100)
        vatMap.set(pos.vatRate, (vatMap.get(pos.vatRate) ?? 0) + vatAmount)
      }
    }
  }

  let totalVat = 0
  for (const amount of vatMap.values()) {
    totalVat += amount
  }

  const totalGross = subtotalNet + totalVat

  await prisma.whPurchaseOrder.updateMany({
    where: { id: purchaseOrderId, tenantId },
    data: {
      subtotalNet: Math.round(subtotalNet * 100) / 100,
      totalVat: Math.round(totalVat * 100) / 100,
      totalGross: Math.round(totalGross * 100) / 100,
    },
  })
}
```

#### 2. Update `addPosition` to fetch and store `vatRate`
**File**: `src/lib/services/wh-purchase-order-service.ts:398-456`

- Add `vatRate` to the article select at line 400: `select: { id: true, number: true, name: true, unit: true, buyPrice: true, vatRate: true }`
- Pass `vatRate: article.vatRate` into `repo.createPosition` data at line 440

#### 3. Update `addPosition` input type
**File**: `src/lib/services/wh-purchase-order-service.ts:374-384`

Add optional `vatRate` to the input:
```typescript
input: {
  // ...existing fields...
  vatRate?: number
}
```

Use it: `vatRate: input.vatRate ?? article.vatRate`

#### 4. Update `updatePosition` to handle `vatRate`
**File**: `src/lib/services/wh-purchase-order-service.ts:480-487`

Add `vatRate?: number` to the input type, and at line ~515 add:
```typescript
if (input.vatRate !== undefined) data.vatRate = input.vatRate
```

#### 5. Article search projection — add `vatRate`
**File**: `src/lib/services/wh-article-repository.ts:219-225`

Add `vatRate: true` to the `select` in the `search` function.

---

## Phase 3: tRPC Router

### Overview
Add `vatRate` to the position mutation input schemas.

### Changes Required:

**File**: `src/trpc/routers/warehouse/purchaseOrders.ts`

#### 1. `positions.add` input (line ~46-57)
Add: `vatRate: z.number().min(0).max(100).optional()`

#### 2. `positions.update` input (line ~79-88)
Add: `vatRate: z.number().min(0).max(100).optional()`

---

## Phase 4: Frontend

### Overview
Show `vatRate` in position table, auto-fill from article search, and add VAT breakdown Summenblock.

### Changes Required:

#### 1. Article search — forward `vatRate`
**File**: `src/components/warehouse/article-search-popover.tsx`

Add `vatRate` to the `ArticleSearchResult` interface:
```typescript
export interface ArticleSearchResult {
  id: string
  number: string
  name: string
  unit: string
  sellPrice: number | null
  buyPrice: number | null
  vatRate: number  // add this
}
```

#### 2. Position table — add `vatRate` to add/edit forms
**File**: `src/components/warehouse/purchase-order-position-table.tsx`

- Add `vatRate: string` to `AddPositionForm` interface (default `''`)
- Add `vatRate: string` to `EditPositionForm` interface
- Auto-fill `vatRate` from article on select: `vatRate: article?.vatRate != null ? String(article.vatRate) : '19'`
- Add MwSt % column header after Gesamtpreis column
- Add input field in add row for vatRate (small number input, w-16)
- Add display/edit for vatRate in existing position rows
- Pass `vatRate` to addPosition and updatePosition mutations
- Update Gesamtpreis live calculation to include VAT info

#### 3. Detail view — VAT breakdown Summenblock
**File**: `src/components/warehouse/purchase-order-detail.tsx`

Replace the two `DetailRow` entries in the summary card (lines 271-282) with:

```tsx
<DetailRow label={t('detailSubtotal')} value={formatPrice(order.subtotalNet)} />
{/* VAT breakdown — compute from positions grouped by vatRate */}
{(() => {
  const vatGroups = new Map<number, number>()
  for (const pos of order.positions ?? []) {
    if (pos.totalPrice != null && pos.vatRate != null && pos.vatRate > 0) {
      const amount = pos.totalPrice * (pos.vatRate / 100)
      vatGroups.set(pos.vatRate, (vatGroups.get(pos.vatRate) ?? 0) + amount)
    }
  }
  return Array.from(vatGroups.entries())
    .sort(([a], [b]) => a - b)
    .map(([rate, amount]) => (
      <DetailRow
        key={rate}
        label={t('detailVatRate', { rate: String(rate) })}
        value={formatPrice(Math.round(amount * 100) / 100)}
      />
    ))
})()}
<DetailRow
  label={t('detailTotal')}
  value={<span className="text-base font-bold">{formatPrice(order.totalGross)}</span>}
/>
```

#### 4. i18n translations
**File**: `messages/de.json` (warehousePurchaseOrders namespace)

Add keys:
```json
"posColVatRate": "MwSt %",
"detailVatRate": "davon {rate}% MwSt",
"detailTotalVat": "MwSt gesamt"
```

**File**: `messages/en.json` (warehousePurchaseOrders namespace)

Add keys:
```json
"posColVatRate": "VAT %",
"detailVatRate": "incl. {rate}% VAT",
"detailTotalVat": "Total VAT"
```

#### 5. Repository `findById` — include `vatRate` in position select
**File**: `src/lib/services/wh-purchase-order-repository.ts`

The `findById` query includes `positions` with their article. The position fields are returned fully (no select restriction), so `vatRate` will automatically be included after the schema change. No code change needed here.

---

## Phase 5: Hook update

### Changes Required:

**File**: `src/hooks/use-wh-purchase-orders.ts`

The `useAddWhPOPosition` and `useUpdateWhPOPosition` hooks pass input through to tRPC. Since the new `vatRate` field is optional in the schema, existing hooks will work. Just verify that the hooks forward all input fields.

---

## Success Criteria:

### Automated Verification:
- [x] Migration applies cleanly: `pnpm db:reset`
- [x] Prisma client regenerates: `pnpm db:generate`
- [x] Type checking passes: `pnpm typecheck` (no new errors)
- [x] Existing tests pass: 52/52 PO service tests pass

### Manual Verification:
- [ ] Create a PO with a 19% article → MwSt 19% line appears in Summenblock
- [ ] Add a 7% article → separate MwSt 7% line appears
- [ ] Gesamtbetrag = Nettosumme + MwSt(19%) + MwSt(7%)
- [ ] Edit a position's vatRate → totals recalculate
- [ ] Delete a position → totals recalculate
- [ ] Existing POs show correct backfilled vatRate and totals

## References

- Billing module VAT calculation: `src/lib/services/billing-document-service.ts:67-109`
- WhArticle.vatRate field: `prisma/schema.prisma:4184`
- Current recalcTotals: `src/lib/services/wh-purchase-order-service.ts:46-60`
