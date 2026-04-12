# Implementation Plan: WH_09 — Automatische Lagerbuchung bei Lieferschein

## Overview

When a delivery note (Lieferschein, `DELIVERY_NOTE`) is finalized, optionally create stock withdrawals for all article positions with `stockTracking=true`. Three modes per tenant: MANUAL (no change), CONFIRM (dialog with preview), AUTO (immediate booking).

---

## Key Design Decisions

### 1. Stock Movement Type: Add `DELIVERY_NOTE` to enum

**Decision:** Add `DELIVERY_NOTE` to the `WhStockMovementType` Postgres enum via migration, and update the Prisma schema.

**Rationale:** Using `WITHDRAWAL` with `documentId` + `reason` would work but makes filtering and reporting ambiguous. A dedicated type is cleaner, more explicit, and matches how the existing code distinguishes `GOODS_RECEIPT`, `WITHDRAWAL`, `ADJUSTMENT`, `INVENTORY`, `RETURN`. The stock movement list already filters by type — a `DELIVERY_NOTE` type makes this trivial. The `wh-stock-movement-repository.ts` `create()` function uses a string cast for type anyway (line 105), so it accepts any valid enum value.

**Impact:** One enum migration, one Prisma schema line, one cast update in `wh-stock-movement-repository.ts`, and the `cancelWithdrawal` function's type check (line 268) needs updating to also accept `DELIVERY_NOTE` movements for cancellation.

### 2. Negative Stock: `allowNegative` parameter on a new dedicated function

**Decision:** Do NOT modify the existing `createWithdrawal()` / `createBatchWithdrawal()` functions. Instead, create a new function `createDeliveryNoteStockBookings()` in `billing-document-service.ts` that replicates the withdrawal logic but skips the `currentStock >= quantity` check. The preview function returns a `negativeStockWarning` flag per position so the UI can highlight it.

**Rationale:** The existing withdrawal service is used by the withdrawal terminal (WH_05) where rejecting insufficient stock is correct business logic. Adding a flag would couple the two features. A dedicated function in the billing document service keeps the logic self-contained and the withdrawal service untouched.

### 3. SystemSettings field: `deliveryNoteStockMode`

**Decision:** Add `deliveryNoteStockMode String @default("MANUAL") @map("delivery_note_stock_mode")` to `SystemSetting` in Prisma schema. Migration adds the column with default `'MANUAL'`. The field stores one of `"MANUAL"`, `"CONFIRM"`, or `"AUTO"`.

### 4. Service Integration: Best-effort stock booking AFTER finalize transaction

**Decision:** For AUTO mode, stock bookings happen outside the finalize transaction (same pattern as PDF generation). The `finalize()` function in `billing-document-service.ts` gets a new block after the PDF generation section that handles DELIVERY_NOTE stock booking. For CONFIRM mode, finalize does nothing; the frontend calls `confirmStockBookings` separately after finalize succeeds.

**Flow:**
- MANUAL: `finalize()` unchanged.
- AUTO: `finalize()` → transaction (status=PRINTED) → PDF generation → **stock booking (best-effort, outside transaction)** → audit log. Returns `{ ...doc, stockBookingResult }`.
- CONFIRM: `finalize()` → transaction (status=PRINTED) → PDF generation → audit log. Afterwards, frontend queries `previewStockBookings`, shows dialog, user confirms, frontend calls `confirmStockBookings`.

### 5. Transaction scope for stock bookings

**Decision:** All stock bookings for a single delivery note run in ONE transaction (batch). If any single article's booking fails, the entire batch rolls back. The delivery note remains finalized regardless (stock booking is outside the finalize transaction). Error is logged and returned to the frontend.

### 6. `cancelWithdrawal` extension

**Decision:** Extend the existing `cancelWithdrawal()` in `wh-withdrawal-service.ts` to also accept `DELIVERY_NOTE` type movements (currently only accepts `WITHDRAWAL`). This allows reversing delivery note stock bookings through the standard stock movement interface.

---

## Phase 1: Database Migration + Prisma Schema

### Migration: `supabase/migrations/20260331100000_wh_delivery_note_stock_mode.sql`

```sql
-- WH_09: Add delivery_note_stock_mode to system_settings
-- and add DELIVERY_NOTE to wh_stock_movement_type enum

-- 1. Add deliveryNoteStockMode column to system_settings
ALTER TABLE system_settings
  ADD COLUMN delivery_note_stock_mode VARCHAR(10) NOT NULL DEFAULT 'MANUAL';

-- 2. Add DELIVERY_NOTE to wh_stock_movement_type enum
ALTER TYPE wh_stock_movement_type ADD VALUE IF NOT EXISTS 'DELIVERY_NOTE';
```

### Prisma Schema: `prisma/schema.prisma`

**Modify `SystemSetting` model** (around line 2663):
```prisma
// Add after serverAliveNotifyAdmins:
deliveryNoteStockMode     String   @default("MANUAL") @map("delivery_note_stock_mode")
```

**Modify `WhStockMovementType` enum** (around line 4269):
```prisma
enum WhStockMovementType {
  GOODS_RECEIPT
  WITHDRAWAL
  ADJUSTMENT
  INVENTORY
  RETURN
  DELIVERY_NOTE

  @@map("wh_stock_movement_type")
}
```

### Verification

```bash
pnpm db:push:staging          # Push migration to staging Supabase (or local)
pnpm db:generate              # Regenerate Prisma client
pnpm typecheck                # Verify no new type errors from schema change
```

---

## Phase 2: Service Layer

### 2a. Extend `billing-document-service.ts`

**File:** `src/lib/services/billing-document-service.ts`

**Add imports:**
```ts
import * as systemSettingsService from "./system-settings-service"
```

**Add new functions (at bottom of file, before any existing exports or at the end):**

#### `previewDeliveryNoteStockBookings()`

```ts
export async function previewDeliveryNoteStockBookings(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string,
)
```

**Logic:**
1. Fetch document via `repo.findById(prisma, tenantId, documentId)` — must exist and be DELIVERY_NOTE type
2. Filter positions to only `type === "ARTICLE"` with non-null `articleId` and `quantity > 0`
3. Collect all unique `articleId` values
4. Batch-fetch articles: `prisma.whArticle.findMany({ where: { id: { in: articleIds }, tenantId } })` — select `id, number, name, unit, currentStock, stockTracking`
5. Build preview array: for each qualifying position, look up the article. If `stockTracking === true`, include in preview with:
   - `positionId`, `articleId`, `articleNumber`, `articleName`, `unit`
   - `quantity` (from position)
   - `currentStock` (from article)
   - `projectedStock: currentStock - quantity`
   - `negativeStockWarning: projectedStock < 0`
   - `stockTrackingEnabled: true`
6. Also include positions where `stockTracking === false` with `stockTrackingEnabled: false` (so the UI can show them as greyed out)
7. Return `{ documentId, documentNumber, positions: [...] }`

#### `createDeliveryNoteStockBookings()`

```ts
export async function createDeliveryNoteStockBookings(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string,
  positionIds: string[] | null, // null = all eligible positions
  userId: string,
  audit?: AuditContext,
)
```

**Logic:**
1. Fetch document via `repo.findById(prisma, tenantId, documentId)` — must exist, be DELIVERY_NOTE, be PRINTED (finalized)
2. Filter positions: `type === "ARTICLE"`, `articleId` non-null, `quantity > 0`
3. If `positionIds` is not null, further filter to only those position IDs
4. Run in single `prisma.$transaction`:
   a. For each qualifying position:
      - Fetch article (`whArticle.findFirst({ where: { id: pos.articleId, tenantId } })`)
      - Skip if article not found or `stockTracking === false`
      - Calculate `previousStock = article.currentStock`, `newStock = previousStock - pos.quantity`
      - Create `whStockMovement` with `type: "DELIVERY_NOTE"`, `quantity: -pos.quantity`, `documentId`, `reason: "Lieferschein {doc.number}"`, `createdById: userId`
      - Update `whArticle.currentStock` to `newStock`
      - Collect result into array
5. Outside transaction: audit log
6. Return `{ bookedCount: number, bookings: [...] }`

#### Modify `finalize()` for AUTO mode

**Location:** After the E-Invoice generation block (around line 591), before the audit log block.

**Add:**
```ts
// AUTO stock booking for DELIVERY_NOTE (best-effort, outside transaction)
let stockBookingResult: { bookedCount: number } | null = null
const docType = (result as unknown as { type?: string }).type
if (docType === "DELIVERY_NOTE") {
  try {
    const settings = await systemSettingsService.get(prisma, tenantId)
    const mode = (settings as unknown as { deliveryNoteStockMode?: string }).deliveryNoteStockMode
    if (mode === "AUTO") {
      stockBookingResult = await createDeliveryNoteStockBookings(
        prisma, tenantId, id, null, finalizedById, audit
      )
    }
  } catch (err) {
    console.error(`Auto stock booking failed for delivery note ${id}`, err)
  }
}
```

**Modify return:** Instead of `return result`, return `{ ...result, stockBookingResult }` (only when stockBookingResult is not null). This is safe because the router currently passes through the result directly, and the extra field is benign.

Actually, to keep it cleaner: the `finalize()` function return type stays the same (the Prisma document). The `stockBookingResult` is attached as a non-Prisma field. The router can surface it.

### 2b. Extend `system-settings-service.ts`

**File:** `src/lib/services/system-settings-service.ts`

**Modify `update()` input type** — add:
```ts
deliveryNoteStockMode?: string
```

**Add handling block in `update()` function body:**
```ts
if (input.deliveryNoteStockMode !== undefined) {
  if (!["MANUAL", "CONFIRM", "AUTO"].includes(input.deliveryNoteStockMode)) {
    throw new SystemSettingsValidationError(
      "deliveryNoteStockMode must be MANUAL, CONFIRM, or AUTO"
    )
  }
  data.deliveryNoteStockMode = input.deliveryNoteStockMode
}
```

**Add `"deliveryNoteStockMode"` to `TRACKED_FIELDS` array** for audit logging.

### 2c. Extend `wh-withdrawal-service.ts`

**File:** `src/lib/services/wh-withdrawal-service.ts`

**Modify `cancelWithdrawal()`** (line 268):
```ts
// Current:
if (movement.type !== "WITHDRAWAL") {
  throw new WhWithdrawalValidationError("Can only cancel WITHDRAWAL type movements")
}
// Change to:
if (movement.type !== "WITHDRAWAL" && movement.type !== "DELIVERY_NOTE") {
  throw new WhWithdrawalValidationError("Can only cancel WITHDRAWAL or DELIVERY_NOTE type movements")
}
```

Also in the `listWithdrawals()` function (line 358), change the where clause to include DELIVERY_NOTE movements:
```ts
// Current:
type: "WITHDRAWAL",
// Change to:
type: { in: ["WITHDRAWAL", "DELIVERY_NOTE"] },
```

And same for `listByOrder()` and `listByDocument()`.

### 2d. Update `wh-stock-movement-repository.ts`

**File:** `src/lib/services/wh-stock-movement-repository.ts`

**Modify `create()` type cast** (line 105):
```ts
// Current:
type: data.type as "GOODS_RECEIPT" | "WITHDRAWAL" | "ADJUSTMENT" | "INVENTORY" | "RETURN",
// Change to:
type: data.type as "GOODS_RECEIPT" | "WITHDRAWAL" | "ADJUSTMENT" | "INVENTORY" | "RETURN" | "DELIVERY_NOTE",
```

### Verification

```bash
pnpm typecheck
pnpm vitest run src/lib/services/__tests__/wh-withdrawal-service.test.ts
```

---

## Phase 3: tRPC Routes

### 3a. Extend billing documents router

**File:** `src/trpc/routers/billing/documents.ts`

**Add two new procedures to `billingDocumentsRouter`:**

#### `previewStockBookings` (query)

```ts
previewStockBookings: billingProcedure
  .use(requirePermission(BILLING_VIEW))
  .input(z.object({ id: z.string().uuid() }))
  .query(async ({ ctx, input }) => {
    try {
      return await billingDocService.previewDeliveryNoteStockBookings(
        ctx.prisma as unknown as PrismaClient,
        ctx.tenantId!,
        input.id
      )
    } catch (err) {
      handleServiceError(err)
    }
  }),
```

#### `confirmStockBookings` (mutation)

```ts
confirmStockBookings: billingProcedure
  .use(requirePermission(BILLING_FINALIZE))
  .input(z.object({
    id: z.string().uuid(),
    positionIds: z.array(z.string().uuid()),
  }))
  .mutation(async ({ ctx, input }) => {
    try {
      return await billingDocService.createDeliveryNoteStockBookings(
        ctx.prisma as unknown as PrismaClient,
        ctx.tenantId!,
        input.id,
        input.positionIds,
        ctx.user!.id,
        { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
      )
    } catch (err) {
      handleServiceError(err)
    }
  }),
```

### 3b. Extend system settings router

**File:** `src/trpc/routers/systemSettings.ts`

**Add `deliveryNoteStockMode` to:**

1. `systemSettingsOutputSchema`:
```ts
deliveryNoteStockMode: z.string(),
```

2. `updateSettingsInputSchema`:
```ts
deliveryNoteStockMode: z.enum(["MANUAL", "CONFIRM", "AUTO"]).optional(),
```

3. `mapToOutput()` helper:
```ts
deliveryNoteStockMode: (s.deliveryNoteStockMode as string) ?? "MANUAL",
```

### Verification

```bash
pnpm typecheck
pnpm vitest run src/trpc/routers/__tests__/billingDocuments-router.test.ts
```

---

## Phase 4: Frontend

### 4a. New hook: `src/hooks/use-delivery-note-stock.ts`

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function usePreviewStockBookings(documentId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.documents.previewStockBookings.queryOptions(
      { id: documentId },
      { enabled: enabled && !!documentId }
    )
  )
}

export function useConfirmStockBookings() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.confirmStockBookings.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.stockMovements.list.queryKey(),
      })
    },
  })
}
```

**Update `src/hooks/index.ts`:** Add export for the new hooks alongside the billing documents section:
```ts
export {
  usePreviewStockBookings,
  useConfirmStockBookings,
} from './use-delivery-note-stock'
```

### 4b. Extend finalize dialog: `src/components/billing/document-print-dialog.tsx`

**Changes to `DocumentFinalizeDialog`:**

1. Add imports: `usePreviewStockBookings`, `useConfirmStockBookings`, `useSystemSettings`, `Checkbox` (from ui), `Table/TableBody/TableRow/TableCell/TableHead/TableHeader` (from ui).

2. Add state variables:
   - `showStockConfirmation: boolean` — controls whether the stock confirmation section is visible
   - `selectedPositionIds: Set<string>` — tracks which positions the user wants to book
   - `stockBookingDone: boolean` — prevents double-booking

3. Fetch system settings to determine mode: `const { data: settings } = useSystemSettings()`. Extract `deliveryNoteStockMode` from settings.

4. For CONFIRM mode: after `handleFinalize()` succeeds (document is finalized), if `documentType === 'DELIVERY_NOTE'` and mode is `CONFIRM`, fetch preview data and show the stock confirmation section within the dialog instead of closing it.

5. The confirmation section shows:
   - A table with columns: Checkbox | Artikel-Nr. | Bezeichnung | Menge | Bestand aktuell | Bestand neu
   - Positions with `stockTrackingEnabled: false` are greyed out, checkbox disabled
   - Positions where `projectedStock < 0` show the "Bestand neu" cell in red with warning icon
   - All eligible positions pre-selected
   - Two buttons: "Lagerbuchung durchführen" / "Überspringen"

6. For AUTO mode: after finalize succeeds, show a toast: `"Lagerbuchung fuer X Artikel durchgefuehrt"`. If the finalize response includes `stockBookingResult`, use that count. If it has errors, show a warning toast.

7. For MANUAL mode: no changes to current behavior.

**Detailed flow for CONFIRM mode:**

```
User clicks "Abschließen" button
→ handleFinalize() runs → document finalized → success
→ If DELIVERY_NOTE + CONFIRM:
  → Set showStockConfirmation = true (dialog stays open, header changes)
  → Fetch previewStockBookings query
  → Show positions table with checkboxes
  → User clicks "Lagerbuchung durchführen":
    → Call confirmStockBookings with selected positionIds
    → Toast success
    → Close dialog
  → User clicks "Überspringen":
    → Close dialog (no stock booking)
```

### 4c. Extend system settings form: `src/components/settings/system-settings-form.tsx`

**Add "Lager" (Warehouse) section** — insert a new collapsible Card between the "Order" and "Birthday" sections.

**Add to `SettingsFormState` interface:**
```ts
deliveryNoteStockMode: string  // "MANUAL" | "CONFIRM" | "AUTO"
```

**Add to `mapApiToForm()`:**
```ts
deliveryNoteStockMode: data.delivery_note_stock_mode ?? 'MANUAL',
```

**Add to `INITIAL_STATE`:**
```ts
deliveryNoteStockMode: 'MANUAL',
```

**Add to `handleSubmit()` mutation call:**
```ts
deliveryNoteStockMode: form.deliveryNoteStockMode,
```

**Add to `expandedSections` default state:**
```ts
warehouse: true,
```

**Add new Card section (UI):**

```tsx
{/* Warehouse Settings */}
<Card>
  <CardHeader className="cursor-pointer" onClick={() => toggleSection('warehouse')}>
    <div className="flex items-center justify-between">
      <div>
        <CardTitle className="text-base">Lager</CardTitle>
        <CardDescription>Einstellungen fuer Lagerbuchungen</CardDescription>
      </div>
      {expandedSections.warehouse ? <ChevronUp /> : <ChevronDown />}
    </div>
  </CardHeader>
  {expandedSections.warehouse && (
    <CardContent className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="deliveryNoteStockMode">Lagerbuchung bei Lieferschein</Label>
        <p className="text-xs text-muted-foreground">
          Bestimmt ob beim Abschliessen eines Lieferscheins automatisch Lagerentnahmen erstellt werden.
        </p>
        <Select
          value={form.deliveryNoteStockMode}
          onValueChange={(value) => setForm(prev => ({ ...prev, deliveryNoteStockMode: value }))}
          disabled={isSubmitting}
        >
          <SelectTrigger id="deliveryNoteStockMode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MANUAL">Manuell (keine automatische Buchung)</SelectItem>
            <SelectItem value="CONFIRM">Mit Bestaetigung (Dialog zeigt Positionen)</SelectItem>
            <SelectItem value="AUTO">Automatisch (sofortige Buchung)</SelectItem>
          </SelectContent>
        </Select>
        {/* Mode explanation */}
        {form.deliveryNoteStockMode === 'CONFIRM' && (
          <p className="text-xs text-muted-foreground">
            Beim Abschliessen eines Lieferscheins wird ein Dialog angezeigt, in dem die zu buchenden Positionen bestaetigt werden koennen.
          </p>
        )}
        {form.deliveryNoteStockMode === 'AUTO' && (
          <p className="text-xs text-muted-foreground">
            Beim Abschliessen eines Lieferscheins werden automatisch Lagerentnahmen fuer alle Artikelpositionen mit Bestandsfuehrung erstellt.
          </p>
        )}
      </div>
    </CardContent>
  )}
</Card>
```

**Import `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` from `@/components/ui/select`** (add to existing imports).

### Verification

```bash
pnpm typecheck
pnpm dev  # Manual testing: Settings page → Lager section visible, finalize dialog with DELIVERY_NOTE
```

---

## Phase 5: Tests

### 5a. Service Tests

**File:** `src/lib/services/__tests__/delivery-note-stock-service.test.ts` (NEW)

**Test cases:**

```ts
describe("previewDeliveryNoteStockBookings", () => {
  it("returns eligible positions with stock info for DELIVERY_NOTE", ...)
  it("throws if document is not DELIVERY_NOTE type", ...)
  it("throws if document not found", ...)
  it("marks positions with stockTracking=false as stockTrackingEnabled=false", ...)
  it("sets negativeStockWarning=true when projected stock < 0", ...)
  it("excludes TEXT, PAGE_BREAK, SUBTOTAL position types", ...)
  it("excludes positions with quantity <= 0 or null", ...)
})

describe("createDeliveryNoteStockBookings", () => {
  it("creates stock movements for all eligible positions (positionIds=null)", ...)
  it("creates stock movements only for specified positionIds", ...)
  it("skips articles with stockTracking=false", ...)
  it("allows negative stock (does not throw)", ...)
  it("uses movement type DELIVERY_NOTE", ...)
  it("sets documentId on stock movement", ...)
  it("sets reason to 'Lieferschein {number}'", ...)
  it("calculates previousStock and newStock correctly", ...)
  it("updates article.currentStock", ...)
  it("throws if document is not DELIVERY_NOTE", ...)
  it("throws if document status is not PRINTED", ...)
  it("rolls back all bookings in transaction on error", ...)
})

describe("finalize() — AUTO mode integration", () => {
  it("creates stock bookings when mode is AUTO and type is DELIVERY_NOTE", ...)
  it("does not create stock bookings when mode is MANUAL", ...)
  it("does not create stock bookings when mode is CONFIRM", ...)
  it("does not create stock bookings for non-DELIVERY_NOTE types", ...)
  it("finalize succeeds even when stock booking fails (best-effort)", ...)
})

describe("tenant isolation", () => {
  it("previewDeliveryNoteStockBookings rejects cross-tenant document", ...)
  it("createDeliveryNoteStockBookings rejects cross-tenant document", ...)
  it("uses tenant-specific settings for stock mode", ...)
})
```

**Mock pattern:** Follow `wh-withdrawal-service.test.ts` mock factory pattern with `createMockPrisma()`. Mock `repo.findById()`, `systemSettingsService.get()`, `whArticle.findFirst/findMany()`, `whStockMovement.create()`, `whArticle.update()`.

### 5b. Router Tests

**File:** `src/trpc/routers/__tests__/billingDocumentsStock-router.test.ts` (NEW)

**Test cases:**

```ts
describe("billing.documents.previewStockBookings", () => {
  it("returns preview with stock info for a DELIVERY_NOTE", ...)
  it("requires billing_documents.view permission", ...)
  it("rejects cross-tenant document", ...)
})

describe("billing.documents.confirmStockBookings", () => {
  it("creates stock bookings for confirmed positions", ...)
  it("requires billing_documents.finalize permission", ...)
  it("rejects cross-tenant document", ...)
})
```

**Mock pattern:** Follow `billingDocuments-router.test.ts` pattern using `createCallerFactory(billingDocumentsRouter)`, `createMockContext`, module mock, permission checks.

### 5c. Extend existing withdrawal service tests

**File:** `src/lib/services/__tests__/wh-withdrawal-service.test.ts`

Add test cases:

```ts
describe("cancelWithdrawal — DELIVERY_NOTE type", () => {
  it("can cancel a DELIVERY_NOTE movement (type accepted)", ...)
})

describe("listWithdrawals — includes DELIVERY_NOTE", () => {
  it("includes DELIVERY_NOTE type movements in results", ...)
})
```

### Verification

```bash
pnpm vitest run src/lib/services/__tests__/delivery-note-stock-service.test.ts
pnpm vitest run src/trpc/routers/__tests__/billingDocumentsStock-router.test.ts
pnpm vitest run src/lib/services/__tests__/wh-withdrawal-service.test.ts
pnpm test          # Full test suite
pnpm typecheck     # Final type check
```

---

## File Summary

### New Files

| File | Description |
|------|-------------|
| `supabase/migrations/20260331100000_wh_delivery_note_stock_mode.sql` | Migration: system_settings column + enum value |
| `src/hooks/use-delivery-note-stock.ts` | Hooks for preview and confirm stock bookings |
| `src/lib/services/__tests__/delivery-note-stock-service.test.ts` | Service-layer tests |
| `src/trpc/routers/__tests__/billingDocumentsStock-router.test.ts` | Router-layer tests |

### Modified Files

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add `deliveryNoteStockMode` to SystemSetting, add `DELIVERY_NOTE` to WhStockMovementType enum |
| `src/lib/services/billing-document-service.ts` | Add `previewDeliveryNoteStockBookings()`, `createDeliveryNoteStockBookings()`, extend `finalize()` for AUTO mode |
| `src/lib/services/system-settings-service.ts` | Add `deliveryNoteStockMode` to update input + validation + TRACKED_FIELDS |
| `src/lib/services/wh-withdrawal-service.ts` | Extend `cancelWithdrawal()` to accept DELIVERY_NOTE, extend list functions to include DELIVERY_NOTE |
| `src/lib/services/wh-stock-movement-repository.ts` | Update type cast in `create()` to include DELIVERY_NOTE |
| `src/trpc/routers/billing/documents.ts` | Add `previewStockBookings` query and `confirmStockBookings` mutation |
| `src/trpc/routers/systemSettings.ts` | Add `deliveryNoteStockMode` to output schema, input schema, and mapToOutput |
| `src/hooks/index.ts` | Export new hooks |
| `src/hooks/use-billing-documents.ts` | Add query key invalidation for warehouse data in finalize hook |
| `src/components/billing/document-print-dialog.tsx` | Add stock confirmation section for CONFIRM mode, auto toast for AUTO mode |
| `src/components/settings/system-settings-form.tsx` | Add "Lager" section with deliveryNoteStockMode dropdown |
| `src/lib/services/__tests__/wh-withdrawal-service.test.ts` | Add tests for DELIVERY_NOTE cancellation and listing |

---

## Implementation Order

1. **Phase 1** first — migration and Prisma schema must be in place before any service code references the new field/enum value.
2. **Phase 2** next — service layer is the foundation; can be tested independently.
3. **Phase 3** after Phase 2 — routers depend on service functions.
4. **Phase 4** after Phase 3 — frontend depends on tRPC types being available.
5. **Phase 5** can partially overlap with Phases 2-3 (write tests alongside service/router code).

Estimated total: ~4-5 hours of implementation work.
