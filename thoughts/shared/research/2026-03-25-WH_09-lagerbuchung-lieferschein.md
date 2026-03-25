# Research: WH_09 — Automatische Lagerbuchung bei Lieferschein

## 1. Billing Document Service — Finalize Logic

**File:** `/home/tolga/projects/terp/src/lib/services/billing-document-service.ts`

### `finalize()` function (line 510)

```ts
export async function finalize(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  finalizedById: string,
  orderParams?: {
    orderName: string
    orderDescription?: string
  },
  audit?: AuditContext
)
```

**Flow:**
1. Runs in `prisma.$transaction`:
   - Fetches document via `repo.findById(txPrisma, tenantId, id)` — includes positions
   - Validates `status === "DRAFT"`
   - Validates at least one position exists
   - For `ORDER_CONFIRMATION` type: optionally creates a linked Terp Order (time tracking)
   - Updates status to `"PRINTED"`, sets `printedAt` and `printedById`
2. Outside transaction (best-effort):
   - Generates PDF via `pdfService.generateAndStorePdf()`
   - For `INVOICE`/`CREDIT_NOTE` with e-invoice enabled: generates E-Invoice XML
3. Audit log (fire-and-forget)

**Key observation:** The finalize function already has type-specific branching (`ORDER_CONFIRMATION` creates an Order). Adding `DELIVERY_NOTE` stock booking follows the same pattern.

### `repo.findById()` (billing-document-repository.ts, line 62)

Returns document with `positions` included (ordered by `sortOrder: "asc"`). Positions include all fields but NO article relation (no join to `WhArticle`).

### Position types

Positions have field `type: BillingPositionType` — values: `ARTICLE`, `FREE`, `TEXT`, `PAGE_BREAK`, `SUBTOTAL`. Only `ARTICLE` type positions have `articleId` populated.

---

## 2. Withdrawal Service

**File:** `/home/tolga/projects/terp/src/lib/services/wh-withdrawal-service.ts`

### `createWithdrawal()` (line 62)

```ts
export async function createWithdrawal(
  prisma: PrismaClient,
  tenantId: string,
  input: CreateWithdrawalInput,
  userId: string,
  audit?: AuditContext
)
```

Where `CreateWithdrawalInput`:
```ts
interface CreateWithdrawalInput {
  articleId: string
  quantity: number
  referenceType: ReferenceType  // "ORDER" | "DOCUMENT" | "MACHINE" | "NONE"
  referenceId?: string
  machineId?: string
  notes?: string
}
```

**Flow:**
1. Transaction:
   - Validates article exists in tenant
   - Validates `stockTracking === true`
   - Validates sufficient stock (`currentStock >= quantity`)
   - Creates `WhStockMovement` with `type: "WITHDRAWAL"`, `quantity: -input.quantity`
   - Updates `WhArticle.currentStock`
2. Audit log

**Reference resolution** via `resolveReferences()`:
- `"DOCUMENT"` → sets `documentId = referenceId`
- `"ORDER"` → sets `orderId = referenceId`
- `"MACHINE"` → sets `machineId`

### `createBatchWithdrawal()` (line 153)

```ts
export async function createBatchWithdrawal(
  prisma: PrismaClient,
  tenantId: string,
  input: CreateBatchWithdrawalInput,
  userId: string,
  audit?: AuditContext
)
```

Where `CreateBatchWithdrawalInput`:
```ts
interface CreateBatchWithdrawalInput {
  referenceType: ReferenceType
  referenceId?: string
  machineId?: string
  items: Array<{ articleId: string; quantity: number }>
  notes?: string
}
```

Processes all items in a single `$transaction`. Each item: validate article, check stock, create movement, update stock.

**Important:** Both functions throw `WhWithdrawalValidationError` if stock is insufficient. The ticket says negative stock should be allowed (warning, not error). This means the implementation should NOT use the existing withdrawal functions directly but replicate the logic without the stock check, or add a `skipStockCheck` parameter.

### `cancelWithdrawal()` (line 250)

Creates a reversal movement with positive quantity.

---

## 3. Stock Movement Repository

**File:** `/home/tolga/projects/terp/src/lib/services/wh-stock-movement-repository.ts`

### `create()` (line 80)

```ts
export async function create(
  prisma: PrismaClient | Prisma.TransactionClient,
  data: {
    tenantId: string
    articleId: string
    type: string             // cast to WhStockMovementType enum
    quantity: number
    previousStock: number
    newStock: number
    date?: Date
    purchaseOrderId?: string | null
    purchaseOrderPositionId?: string | null
    documentId?: string | null
    orderId?: string | null
    inventorySessionId?: string | null
    machineId?: string | null
    reason?: string | null
    notes?: string | null
    createdById?: string | null
  }
)
```

**Movement types** (enum `WhStockMovementType`):
- `GOODS_RECEIPT`
- `WITHDRAWAL`
- `ADJUSTMENT`
- `INVENTORY`
- `RETURN`

The `documentId` field on `WhStockMovement` already exists for linking movements to billing documents.

---

## 4. System Settings

### Prisma Model

**File:** `/home/tolga/projects/terp/prisma/schema.prisma` (line 2663)

```prisma
model SystemSetting {
  id                                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId                          String   @map("tenant_id") @db.Uuid
  roundingRelativeToPlan            Boolean  @default(false)
  errorListEnabled                  Boolean  @default(true)
  trackedErrorCodes                 String[] @default([])
  autoFillOrderEndBookings          Boolean  @default(false)
  birthdayWindowDaysBefore          Int      @default(7)
  birthdayWindowDaysAfter           Int      @default(7)
  followUpEntriesEnabled            Boolean  @default(false)
  proxyHost                         String?
  proxyPort                         Int?
  proxyUsername                     String?
  proxyPassword                     String?
  proxyEnabled                      Boolean  @default(false)
  serverAliveEnabled                Boolean  @default(false)
  serverAliveExpectedCompletionTime Int?
  serverAliveThresholdMinutes       Int?     @default(30)
  serverAliveNotifyAdmins           Boolean  @default(true)
  createdAt                         DateTime @default(now())
  updatedAt                         DateTime @default(now()) @updatedAt

  tenant Tenant @relation(...)
  @@unique([tenantId])
  @@map("system_settings")
}
```

No `deliveryNoteStockMode` field exists yet. Needs migration to add it.

### Service

**File:** `/home/tolga/projects/terp/src/lib/services/system-settings-service.ts`

- `get(prisma, tenantId)` — returns settings (auto-creates with defaults if missing)
- `update(prisma, tenantId, input, audit?)` — partial update, only sets provided fields
- Uses `getOrCreateSettings()` singleton pattern

### Repository

**File:** `/home/tolga/projects/terp/src/lib/services/system-settings-repository.ts`

- `findByTenantId(prisma, tenantId)` — `prisma.systemSetting.findUnique({ where: { tenantId } })`
- `create(prisma, { tenantId })` — creates with defaults
- `update(prisma, tenantId, id, data)` — uses `tenantScopedUpdate` helper

### Router

**File:** `/home/tolga/projects/terp/src/trpc/routers/systemSettings.ts`

- Permission: `settings.manage` for both get and update
- Output schema explicitly lists all fields (needs updating when adding new field)
- Input schema for update has each field as optional

### Hooks

**File:** `/home/tolga/projects/terp/src/hooks/use-system-settings.ts`

- `useSystemSettings(enabled?)` — `trpc.systemSettings.get`
- `useUpdateSystemSettings()` — `trpc.systemSettings.update` with query invalidation

### Frontend

**File:** `/home/tolga/projects/terp/src/components/settings/system-settings-form.tsx`

- Maps API fields to form state, renders sections with Card components
- Current sections: Calculation, Order, Birthday, Proxy, Server Alive
- Uses `useSystemSettings()` and `useUpdateSystemSettings()` hooks

---

## 5. Prisma Schema — Relevant Models

### BillingDocument (line 640)

Key fields:
- `type: BillingDocumentType` — `OFFER | ORDER_CONFIRMATION | DELIVERY_NOTE | SERVICE_NOTE | RETURN_DELIVERY | INVOICE | CREDIT_NOTE`
- `status: BillingDocumentStatus` — `DRAFT | PRINTED | PARTIALLY_FORWARDED | FORWARDED | CANCELLED`
- `orderId: String?` — link to Terp Order
- Relations: `positions: BillingDocumentPosition[]`
- Table: `billing_documents`

### BillingDocumentPosition (line 729)

Key fields:
- `type: BillingPositionType` — `ARTICLE | FREE | TEXT | PAGE_BREAK | SUBTOTAL`
- `articleId: String?` — UUID referencing WhArticle (no FK relation in Prisma schema)
- `articleNumber: String?` — denormalized article number
- `quantity: Float?`
- `unit: String?`
- Table: `billing_document_positions`

**Critical:** No Prisma relation from `BillingDocumentPosition` to `WhArticle`. The `articleId` is a "loose" reference. To get article details (e.g., `stockTracking`), a separate query to `whArticle` is needed.

### WhArticle (line 4181)

Key fields:
- `stockTracking: Boolean @default(false)` — determines if stock is tracked
- `currentStock: Float @default(0)`
- `number: String`
- `name: String`
- `unit: String`
- Table: `wh_articles`

### WhStockMovement (line 4379)

Key fields:
- `type: WhStockMovementType` — `GOODS_RECEIPT | WITHDRAWAL | ADJUSTMENT | INVENTORY | RETURN`
- `quantity: Float` — negative for withdrawals
- `previousStock: Float`
- `newStock: Float`
- `documentId: String?` — already exists for linking to billing documents
- `orderId: String?`
- `reason: String?`
- `notes: String?`
- `createdById: String?`
- Table: `wh_stock_movements`

### WhStockMovementType enum

Values: `GOODS_RECEIPT`, `WITHDRAWAL`, `ADJUSTMENT`, `INVENTORY`, `RETURN`

The ticket mentions `type: "DELIVERY_NOTE"` but this enum value does not exist. Two options:
1. Add `DELIVERY_NOTE` to the enum (requires migration)
2. Use `WITHDRAWAL` type with `documentId` set + `reason: "Lieferschein {number}"` to differentiate

---

## 6. tRPC Routers

### Billing Documents Router

**File:** `/home/tolga/projects/terp/src/trpc/routers/billing/documents.ts`

- Exported as `billingDocumentsRouter`
- Base procedure: `billingProcedure = tenantProcedure.use(requireModule("billing"))`
- Permission constants: `BILLING_VIEW`, `BILLING_CREATE`, `BILLING_EDIT`, `BILLING_DELETE`, `BILLING_FINALIZE`
- Procedures: `list`, `getById`, `create`, `update`, `delete`, `finalize`, `forward`, `cancel`, `duplicate`, `generatePdf`, `downloadPdf`, `generateEInvoice`, `downloadXml`
- Nested router: `positions` with `list`, `add`, `update`, `delete`, `reorder`
- New procedures `previewStockBookings` and `confirmStockBookings` should be added here

### Billing Router (parent)

**File:** `/home/tolga/projects/terp/src/trpc/routers/billing/index.ts`

Merges: `documents`, `documentTemplates`, `tenantConfig`, `serviceCases`, `payments`, `priceLists`, `recurringInvoices`

### Warehouse Withdrawals Router

**File:** `/home/tolga/projects/terp/src/trpc/routers/warehouse/withdrawals.ts`

- Base procedure: `whProcedure = tenantProcedure.use(requireModule("warehouse"))`
- Permission: `wh_stock.view` / `wh_stock.manage`
- Procedures: `create`, `createBatch`, `cancel`, `list`, `listByOrder`, `listByDocument`
- `listByDocument` already queries movements by `documentId`

### Warehouse Router (parent)

**File:** `/home/tolga/projects/terp/src/trpc/routers/warehouse/index.ts`

Merges: `articles`, `articlePrices`, `purchaseOrders`, `stockMovements`, `withdrawals`, `supplierInvoices`

### Root Router

**File:** `/home/tolga/projects/terp/src/trpc/routers/_app.ts`

- `billing: billingRouter` (line 160)
- `warehouse: warehouseRouter` (line 161)
- `systemSettings: systemSettingsRouter` (line 124)

---

## 7. Permission Catalog

**File:** `/home/tolga/projects/terp/src/lib/auth/permission-catalog.ts`

Relevant existing permissions:

| Key | Resource | Action | Description |
|-----|----------|--------|-------------|
| `billing_documents.view` | billing_documents | view | View billing documents |
| `billing_documents.create` | billing_documents | create | Create billing documents |
| `billing_documents.edit` | billing_documents | edit | Edit billing documents |
| `billing_documents.delete` | billing_documents | delete | Delete billing documents |
| `billing_documents.finalize` | billing_documents | finalize | Finalize billing documents |
| `wh_stock.view` | wh_stock | view | View stock movements and goods receipts |
| `wh_stock.manage` | wh_stock | manage | Manage goods receipts and stock bookings |
| `settings.manage` | settings | manage | Manage settings |

The `previewStockBookings` query uses `billing_documents.view`. The `confirmStockBookings` mutation uses `billing_documents.finalize` (and possibly `wh_stock.manage`). No new permissions needed.

---

## 8. Frontend

### Finalize Dialog

**File:** `/home/tolga/projects/terp/src/components/billing/document-print-dialog.tsx`

`DocumentFinalizeDialog` component:
- Props: `open`, `onOpenChange`, `documentId`, `documentNumber`, `documentType`, `eInvoiceEnabled`, `eInvoiceMissingFields`
- Uses `useFinalizeBillingDocument()` hook
- Has type-specific sections (e.g., `ORDER_CONFIRMATION` shows order name fields)
- Shows warning alert about document becoming immutable
- Buttons: "Abbrechen" / "Abschließen"

**Pattern for DELIVERY_NOTE extension:** Add a section (like the ORDER_CONFIRMATION section) that:
- Fetches stock preview when `documentType === 'DELIVERY_NOTE'`
- In CONFIRM mode: shows positions table with checkboxes
- In AUTO mode: shows info message that stock will be booked automatically
- In MANUAL mode: no additional content

### Document Editor

**File:** `/home/tolga/projects/terp/src/components/billing/document-editor.tsx`

- Imports `DocumentFinalizeDialog` from `./document-print-dialog`
- Opens finalize dialog via `setShowFinalizeDialog(true)` when "Abschließen" button is clicked (only shown when `isDraft`)
- Has access to `doc.type` which can be used to determine if DELIVERY_NOTE

### Hooks

**File:** `/home/tolga/projects/terp/src/hooks/use-billing-documents.ts`

`useFinalizeBillingDocument()`:
```ts
export function useFinalizeBillingDocument() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.finalize.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.documents.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.documents.getById.queryKey() })
    },
  })
}
```

### System Settings Form

**File:** `/home/tolga/projects/terp/src/components/settings/system-settings-form.tsx`

Current sections: Calculation, Order, Birthday, Proxy, Server Alive. A new "Warehouse" or "Lager" section needs to be added for the `deliveryNoteStockMode` dropdown.

---

## 9. Migration Context

Latest migration: `20260330100000_crm_contact_salutation_fields.sql`

New migration needed for: adding `delivery_note_stock_mode` column to `system_settings` table.

---

## 10. Key Implementation Considerations

1. **No FK relation** between `BillingDocumentPosition.articleId` and `WhArticle`. The preview/booking logic must separately query `WhArticle` records by the articleIds found in positions.

2. **Stock movement type**: The existing enum `WhStockMovementType` does not have `DELIVERY_NOTE`. Must either add it (migration + Prisma schema change) or reuse `WITHDRAWAL` with `documentId` set and a descriptive `reason`.

3. **Stock validation**: Existing `createWithdrawal()` rejects withdrawals when stock is insufficient. The ticket says negative stock should be allowed with a warning. Either modify the function to accept a flag, or write dedicated logic.

4. **Module guards**: The billing router requires `billing` module, the warehouse router requires `warehouse` module. The new procedures sit in the billing router but need to interact with warehouse data. The service layer can access WhArticle directly via Prisma without module guard (module guards are router-level only).

5. **Transaction scope**: The ticket says the document should be finalized even if stock booking fails. This means stock booking must NOT be in the same transaction as finalization (or must catch errors and proceed). The current `finalize()` pattern already does this for PDF generation (outside transaction, best-effort).

6. **CONFIRM mode flow**:
   - User clicks "Abschließen"
   - Frontend queries `previewStockBookings` to get positions with stock info
   - Dialog shows positions table with checkboxes
   - User clicks "Lagerbuchung durchführen" → calls `confirmStockBookings`
   - OR user clicks "Überspringen" → document is already finalized, no stock booking

   This means for CONFIRM mode, the finalize mutation should NOT auto-book. The frontend handles the two-step flow.

7. **AUTO mode flow**:
   - Finalize mutation detects `DELIVERY_NOTE` type and `AUTO` setting
   - After finalize transaction succeeds, automatically creates withdrawals (best-effort, outside transaction)
   - Returns result with stock booking info (or errors)
