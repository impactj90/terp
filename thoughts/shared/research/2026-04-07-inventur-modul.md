---
title: Research — Inventur-Modul (Stocktake Module)
date: 2026-04-07
status: complete
---

# Research: Inventur-Modul

## 1. Database Schema Analysis

### Existing Warehouse Models

**WhArticle** (`wh_articles`, line 4258 in schema.prisma):
- `id` UUID PK
- `tenantId` UUID FK -> tenants
- `number` VARCHAR(50) — auto-generated via NumberSequence key "article" with prefix "ART-"
- `name` VARCHAR(255)
- `unit` VARCHAR(20) default "Stk"
- `stockTracking` BOOLEAN default false — only articles with this flag have stock managed
- `currentStock` FLOAT default 0 — denormalized current stock level
- `minStock` FLOAT nullable — reorder threshold
- `warehouseLocation` VARCHAR(255) nullable — physical location string
- `isActive` BOOLEAN default true
- Relationships: `stockMovements WhStockMovement[]`, `stockReservations WhStockReservation[]`

**WhStockMovement** (`wh_stock_movements`, line 4481):
- `id` UUID PK
- `tenantId` UUID FK -> tenants
- `articleId` UUID FK -> wh_articles
- `type` WhStockMovementType enum
- `quantity` FLOAT — positive for inbound, negative for outbound
- `previousStock` FLOAT — stock before this movement
- `newStock` FLOAT — stock after this movement
- `date` TIMESTAMPTZ default now()
- `purchaseOrderId` UUID nullable — FK for goods receipt link
- `purchaseOrderPositionId` UUID nullable
- `documentId` UUID nullable — billing document reference
- `orderId` UUID nullable — order reference
- **`inventorySessionId` UUID nullable** — already exists, placeholder for stocktake link
- `machineId` VARCHAR nullable — machine/equipment reference
- `reason` TEXT nullable
- `notes` TEXT nullable
- `createdById` UUID nullable
- Indexes on: tenantId+articleId, tenantId+type, tenantId+date, tenantId+purchaseOrderId, tenantId+machineId

**WhStockMovementType** enum (line 4370):
```
GOODS_RECEIPT
WITHDRAWAL
ADJUSTMENT
INVENTORY      <-- already exists for stocktake movements
RETURN
DELIVERY_NOTE
```

**WhStockReservation** (`wh_stock_reservations`, line 4674):
- Tracks reserved stock per document position
- Has `status` (ACTIVE/RELEASED), quantity, release tracking

**NumberSequence** (`number_sequences`, line 295):
- `tenantId` + `key` unique constraint
- `prefix` VARCHAR(20) default ""
- `nextValue` INT default 1
- Used for auto-generating document numbers

### Key Observations
- The `INVENTORY` movement type already exists in the enum
- The `inventorySessionId` field already exists on `WhStockMovement` — designed as FK placeholder
- Stock is tracked via `currentStock` on `WhArticle` (denormalized) + movement history
- Only articles with `stockTracking = true` participate in stock management
- No existing Stocktake/InventorySession model exists yet — needs to be created

### New Tables Needed
1. **WhStocktake** — the main stocktake session (header)
2. **WhStocktakePosition** — per-article expected/counted quantities

## 2. Warehouse/Inventory Services

### Stock Movement Service (`src/lib/services/wh-stock-movement-service.ts`)
- **Pattern**: Service imports repository, audit service
- **Error classes**: `WhStockMovementNotFoundError`, `WhStockMovementValidationError`
- **Key function — `bookGoodsReceipt()`**:
  1. Runs in `prisma.$transaction()`
  2. Validates PO exists + status
  3. For each position: validates article, calculates previousStock/newStock
  4. Creates `WhStockMovement` with type "GOODS_RECEIPT"
  5. Updates `WhArticle.currentStock` via `whArticle.update()`
  6. Updates PO received quantities and status
  7. Fire-and-forget audit log outside transaction
- **This pattern is the template for INVENTORY movements**

### Stock Movement Repository (`src/lib/services/wh-stock-movement-repository.ts`)
- `findMany()` — paginated list with article + PO includes
- `create()` — accepts all fields including `inventorySessionId` already
- `findByArticle()` — article-specific history
- `findRecent()` — last N movements

### Withdrawal Service (`src/lib/services/wh-withdrawal-service.ts`)
- Creates WITHDRAWAL movements with **negative quantity**
- Same transaction pattern: fetch article -> calculate stock -> create movement -> update article
- `cancelWithdrawal()` creates a reversal movement with positive quantity

### Article Service (`src/lib/services/wh-article-service.ts`)
- `adjustStock()` — manual stock adjustment:
  1. Validates stockTracking is enabled
  2. Creates `ADJUSTMENT` stock movement via `stockMovementRepo.create()`
  3. Updates article via `repo.updateStock()` (increments `currentStock` by quantity)
  4. Audit log
- **This is closest to what inventory completion will do** — but INVENTORY type instead of ADJUSTMENT

### Key Pattern for Stocktake Completion
When completing a stocktake, for each position with a difference:
1. Calculate `difference = countedQty - expectedQty`
2. Create `WhStockMovement` with type `INVENTORY`, quantity = difference
3. Set `inventorySessionId` = stocktake ID
4. Update `WhArticle.currentStock` to the counted value
5. All within a single `prisma.$transaction()`

## 3. QR Scanner

### Location
- **Page**: `src/app/[locale]/(dashboard)/warehouse/scanner/page.tsx`
- **Scanner component**: `src/components/warehouse/qr-scanner.tsx`
- **Terminal component**: `src/components/warehouse/scanner-terminal.tsx`

### QR Scanner Component (`qr-scanner.tsx`)
- Uses `html5-qrcode` library (dynamically imported for SSR safety)
- Camera-based scanning with environment-facing camera
- Falls back to manual article number input
- QR format: `TERP:ART:{tenantId-short}:{articleNumber}`
- Only accepts `TERP:ART:` prefix — rejects other codes
- Features: beep sound on scan, vibration feedback, torch toggle, debounce (500ms)
- Props: `onScan(code)`, `onError(error)`, `onManualInput(articleNumber)`, `enabled`

### Scanner Terminal (`scanner-terminal.tsx`)
- State machine: `IDLE | SCANNED | GOODS_RECEIPT | WITHDRAWAL | INVENTORY | STORNO | BOOKED`
- **INVENTORY state already defined** but currently disabled (cursor-not-allowed, opacity-50)
- Scanner shows 2x2 action grid after scanning article:
  - Goods Receipt (green)
  - Withdrawal (orange)
  - **Inventory (blue) — "In Vorbereitung" / "Coming soon"**
  - Storno (red)
- Uses hooks: `useResolveQrCode`, `useResolveByNumber`, `useCreateWhWithdrawal`, `useBookSinglePosition`
- History stored in localStorage (max 50 entries)
- Mobile-first design (max-w-lg)

### Integration Plan for Stocktake
The scanner terminal already has the INVENTORY state prepared. When implementing:
1. Enable the INVENTORY card (remove disabled state)
2. Add inventory counting flow: show active stocktakes -> select stocktake -> enter counted quantity
3. Use the same `ResolvedArticle` interface
4. Create a new mutation hook for recording counts

## 4. PDF Generation

### Libraries
- **`@react-pdf/renderer` v4.3.2** — primary PDF generation library (React components)
- **`pdf-lib` v1.17.1** — available but used less (likely for PDF manipulation)

### Pattern: Purchase Order PDF (`src/lib/services/wh-purchase-order-pdf-service.ts`)
1. Load data (PO + supplier + positions + tenant config)
2. Create React element: `React.createElement(PurchaseOrderPdf, { ... })`
3. Render to buffer: `await renderToBuffer(pdfElement)`
4. Upload to Supabase Storage: `storage.upload("documents", storagePath, Buffer.from(buffer))`
5. Set `printedAt` timestamp on the record
6. Create signed URL: `storage.createSignedReadUrl("documents", storagePath, 300)`
7. Return `{ signedUrl, filename }`

### PDF Component Pattern (`src/lib/pdf/purchase-order-pdf.tsx`)
```tsx
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer"
// 1mm = 2.835pt
const MM = 2.835
const styles = StyleSheet.create({ page: { paddingTop: 20*MM, ... } })
// German date formatting
function formatDate(date) { return new Intl.DateTimeFormat("de-DE").format(new Date(date)) }
// Component receives props with all data pre-fetched
export function PurchaseOrderPdf({ order, supplier, positions, tenantConfig }) { ... }
```

### Available PDF Helpers
- `src/lib/pdf/position-table-pdf.tsx` — generic position table
- `src/lib/pdf/totals-summary-pdf.tsx` — totals summary block
- `src/lib/pdf/fusszeile-pdf.tsx` — footer with tenant info
- `src/lib/pdf/pdf-storage.ts` — path generation + filename sanitization

### Storage Configuration
- Bucket: `"documents"` (private, requires signed URLs)
- Path convention: `bestellung/{sanitized_name}.pdf` for POs
- For stocktake: suggest `inventur/{INV-number}.pdf`
- Signed URL expiry: 300 seconds (5 minutes)
- Umlaut sanitization: ae/oe/ue/ss replacement

## 5. Permission System

### Structure (`src/lib/auth/permission-catalog.ts`)
- 120+ permissions organized by module/resource
- Each permission has: `id` (UUIDv5), `key` (human-readable), `resource`, `action`, `description`
- UUID generation: `uuidv5(key, PERMISSION_NAMESPACE)` where namespace = `f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1`
- Lookup functions: `permissionIdByKey(key)`, `lookupPermission(id)`, `listPermissions()`

### Warehouse Permissions (existing)
```
wh_articles.view / create / edit / delete
wh_article_groups.manage
wh_articles.upload_image / delete_image
wh_purchase_orders.view / create / edit / delete / order
wh_stock.view / manage
wh_supplier_invoices.view / create / edit / pay
wh_corrections.view / manage / run
wh_reservations.view / manage
wh_qr.scan / print
```

### New Permissions Needed for Stocktake
```
wh_stocktake.view    — View stocktakes and positions
wh_stocktake.create  — Create new stocktakes
wh_stocktake.count   — Record counted quantities (mobile/scanner)
wh_stocktake.complete — Complete/finalize stocktake + adjust stock
wh_stocktake.delete  — Delete draft stocktakes
```

### How Permissions Are Used in Routers
```typescript
const WH_STOCK_VIEW = permissionIdByKey("wh_stock.view")!
const whProcedure = tenantProcedure.use(requireModule("warehouse"))
// Then per endpoint:
whProcedure.use(requirePermission(WH_STOCK_VIEW)).query(...)
```

### Migration Pattern for Permission Groups
Migrations add permission UUIDs to default user groups (PERSONAL, LAGER, VORGESETZTER) via SQL:
```sql
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"<uuid>"'::jsonb
  ) sub
) WHERE code = 'LAGER' AND tenant_id IS NULL;
```

## 6. Number Sequences

### Service (`src/lib/services/number-sequence-service.ts`)
- `getNextNumber(prisma, tenantId, key)` — atomic upsert with increment
- Auto-creates sequence on first use via upsert
- Returns formatted string: `${prefix}${value}`
- Default prefixes map:
  ```
  customer: "K-", supplier: "L-", inquiry: "V-",
  article: "ART-", purchase_order: "BE-", inbound_invoice: "ER-"
  ```

### Stocktake Number Sequence
- Key: `"stocktake"` (or `"inventur"`)
- Prefix: `"INV-"` → produces INV-1, INV-2, ...
- For year-based pattern INV-YYYY-NNN: The current system doesn't support year-based patterns natively. Options:
  1. Use simple prefix "INV-" and let numbers increment globally
  2. Create a custom prefix "INV-2026-" and reset yearly (manual admin task)
  3. Implement year-based logic in the service function itself

**Recommendation**: Add to DEFAULT_PREFIXES as `stocktake: "INV-"` for simplicity. Year-based numbering can be a future enhancement.

## 7. UI Patterns

### List Page Pattern (`src/app/[locale]/(dashboard)/warehouse/articles/page.tsx`)
- `'use client'` directive
- Permission check: `const { allowed: canAccess } = useHasPermission(['wh_articles.view'])`
- State: page, search, filters, dialog open states
- Data fetching: `useWhArticles({ page, search, ... })`
- Layout structure:
  ```
  <div className="space-y-4 p-4 sm:p-6">
    {/* Header: title + action buttons */}
    {/* Toolbar: search + filters */}
    <Card><CardContent className="p-0"><DataTable /></CardContent></Card>
    {/* Pagination */}
    {/* Sheets/Dialogs */}
  </div>
  ```
- Uses `SearchInput`, `Pagination`, `ConfirmDialog`, form sheets
- Responsive: `flex-col gap-3 sm:flex-row sm:items-center`

### Dashboard Pattern (`src/app/[locale]/(dashboard)/warehouse/page.tsx`)
- KPI cards in responsive grid
- Action panels in 2-column layout
- Full-width activity panel

### Sidebar Navigation (`src/components/layout/sidebar/sidebar-nav-config.ts`)
- Sections: `{ titleKey, items[], module? }`
- Items: `{ titleKey, href, icon, module?, permissions? }`
- Warehouse section has `module: 'warehouse'`
- Translation keys in `nav` namespace

### Scanner Page Pattern
- Simple wrapper: permission check + component render
- Mobile-optimized: `p-4 md:p-6`

## 8. tRPC Router Patterns

### Router Structure
- **Warehouse Router** (`src/trpc/routers/warehouse/index.ts`):
  ```typescript
  import { createTRPCRouter } from "@/trpc/init"
  export const warehouseRouter = createTRPCRouter({
    articles: whArticlesRouter,
    stockMovements: whStockMovementsRouter,
    // ... sub-routers
  })
  ```
- **Sub-router** (`src/trpc/routers/warehouse/stockMovements.ts`):
  ```typescript
  const whProcedure = tenantProcedure.use(requireModule("warehouse"))
  
  const goodsReceiptRouter = createTRPCRouter({
    book: whProcedure
      .use(requirePermission(WH_STOCK_MANAGE))
      .input(z.object({ ... }))
      .mutation(async ({ ctx, input }) => {
        try {
          const audit = { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
          return await service.bookGoodsReceipt(ctx.prisma as unknown as PrismaClient, ctx.tenantId!, input, ctx.user!.id, audit)
        } catch (err) { handleServiceError(err) }
      }),
  })
  ```

### Registration
- Add to `src/trpc/routers/warehouse/index.ts` as a new sub-router
- No changes needed to `_app.ts` (warehouse router already registered)

### Key Patterns
- `tenantProcedure.use(requireModule("warehouse"))` for module guard
- `requirePermission(PERMISSION_UUID)` for permission guard
- `ctx.prisma as unknown as PrismaClient` cast pattern
- `handleServiceError(err)` in catch blocks
- Audit context: `{ userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }`

## 9. Hook Patterns

### Query Hook (`src/hooks/use-wh-stock-movements.ts`)
```typescript
export function useWhStockMovements(options?, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.stockMovements.movements.list.queryOptions(
      { ...options },
      { enabled }
    )
  )
}
```

### Mutation Hook with Cache Invalidation
```typescript
export function useBookGoodsReceipt() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.stockMovements.goodsReceipt.book.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.stockMovements.movements.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.warehouse.articles.list.queryKey() })
      // ... invalidate related queries
    },
  })
}
```

### Registration in Barrel Export
Add to `src/hooks/index.ts` as a new export block:
```typescript
// Warehouse Stocktake
export { useWhStocktakes, useWhStocktake, ... } from './use-wh-stocktake'
```

## 10. Audit Trail

### AuditLog Model (`prisma/schema.prisma`, line 2778)
- `tenantId`, `userId`, `action` (VARCHAR 20), `entityType` (VARCHAR 100), `entityId` (UUID)
- `entityName` optional text, `changes` JSONB, `metadata` JSONB
- `ipAddress`, `userAgent` for request tracking
- `performedAt` timestamp

### Audit Service (`src/lib/services/audit-logs-service.ts`)
- `AuditContext`: `{ userId, ipAddress?, userAgent? }`
- `log(prisma, data)` — fire-and-forget, never throws
- `logBulk(prisma, data[])` — batch insert
- `computeChanges(before, after, fieldsToTrack)` — diff computation

### Usage Pattern in Services
```typescript
if (audit) {
  await auditLog.log(prisma, {
    tenantId,
    userId: audit.userId,
    action: "create", // or "update", "complete", "delete"
    entityType: "wh_stocktake",
    entityId: stocktake.id,
    entityName: stocktake.number,
    changes: { ... },
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch(err => console.error('[AuditLog] Failed:', err))
}
```

### Stocktake Audit Actions
- `create` — stocktake created
- `update` — stocktake metadata updated
- `count` — quantity counted for a position
- `complete` — stocktake completed, stock adjusted
- `delete` — draft stocktake deleted

## 11. Key Files Reference

### Schema & Migrations
- `prisma/schema.prisma` — add WhStocktake + WhStocktakePosition models
- `supabase/migrations/` — new migration pair (tables + permissions)

### Backend (Service Layer)
- `src/lib/services/wh-stocktake-service.ts` — NEW: business logic
- `src/lib/services/wh-stocktake-repository.ts` — NEW: Prisma queries
- `src/lib/services/wh-stocktake-pdf-service.ts` — NEW: PDF protocol generation
- `src/lib/services/wh-stock-movement-service.ts` — reference for movement creation pattern
- `src/lib/services/wh-stock-movement-repository.ts` — `create()` already supports inventorySessionId
- `src/lib/services/wh-article-service.ts` — `adjustStock()` reference for stock update pattern
- `src/lib/services/number-sequence-service.ts` — add "stocktake" to DEFAULT_PREFIXES
- `src/lib/services/audit-logs-service.ts` — audit logging interface

### tRPC Router
- `src/trpc/routers/warehouse/stocktake.ts` — NEW: router
- `src/trpc/routers/warehouse/index.ts` — MODIFY: register stocktake sub-router

### Auth & Permissions
- `src/lib/auth/permission-catalog.ts` — MODIFY: add 5 new permissions
- `src/lib/auth/middleware.ts` — reference only (no changes needed)
- `src/lib/modules/constants.ts` — no changes (uses existing "warehouse" module)

### PDF
- `src/lib/pdf/stocktake-protocol-pdf.tsx` — NEW: @react-pdf/renderer component
- `src/lib/pdf/purchase-order-pdf.tsx` — reference for PDF component pattern
- `src/lib/supabase/storage.ts` — reference for upload/signed-URL pattern

### Frontend Hooks
- `src/hooks/use-wh-stocktake.ts` — NEW: React hooks
- `src/hooks/index.ts` — MODIFY: add exports

### Frontend Pages
- `src/app/[locale]/(dashboard)/warehouse/stocktake/page.tsx` — NEW: list page
- `src/app/[locale]/(dashboard)/warehouse/stocktake/[id]/page.tsx` — NEW: detail page

### Frontend Components
- `src/components/warehouse/stocktake-list.tsx` — NEW: table component
- `src/components/warehouse/stocktake-form-sheet.tsx` — NEW: create/edit form
- `src/components/warehouse/stocktake-detail.tsx` — NEW: detail view with difference table
- `src/components/warehouse/stocktake-count-sheet.tsx` — NEW: count entry form
- `src/components/warehouse/scanner-terminal.tsx` — MODIFY: enable INVENTORY mode

### Navigation & i18n
- `src/components/layout/sidebar/sidebar-nav-config.ts` — MODIFY: add stocktake nav item
- `messages/de.json` — MODIFY: add warehouseStocktake translations
- `messages/en.json` — MODIFY: add warehouseStocktake translations

### Existing Scanner Integration
- `src/components/warehouse/scanner-terminal.tsx` — MODIFY: implement INVENTORY state
- `src/components/warehouse/qr-scanner.tsx` — reference only (reusable as-is)

## 12. Scanner Terminal INVENTORY State Integration

The scanner terminal (`scanner-terminal.tsx`) already defines `INVENTORY` as a valid `ScannerState` and renders a disabled card for it. The implementation needs to:

1. **Enable the card** (line 358-366): Remove `cursor-not-allowed opacity-50` and add `onClick`
2. **Add INVENTORY state rendering**: After scanning an article, show:
   - Active stocktakes that include this article
   - Current expected quantity (Sollbestand)
   - Input field for counted quantity (Istbestand)
   - Submit button to record the count
3. **Add mutation**: `useRecordStocktakeCount({ stocktakeId, articleId, countedQty })`
4. **Add history entry**: `action: 'inventory'`

## 13. Workflow States for Stocktake

Based on similar patterns in the codebase (PurchaseOrder status lifecycle):
```
DRAFT -> IN_PROGRESS -> COMPLETED
                     -> CANCELLED
```

- **DRAFT**: Created, frozen expected quantities, no counts yet. Can add/remove positions, delete stocktake.
- **IN_PROGRESS**: Counting started. Can record/update counts. Cannot add/remove articles.
- **COMPLETED**: All positions counted, differences reviewed, stock adjusted. Immutable.
- **CANCELLED**: Abandoned without applying. Immutable.

## 14. Data Snapshot (Sollbestand Freeze)

When creating a stocktake:
1. Query all articles with `stockTracking = true` (or filtered subset)
2. For each article, snapshot `currentStock` as `expectedQuantity`
3. Store in `WhStocktakePosition.expectedQuantity`
4. This is the frozen "Sollbestand" — independent of future stock movements
5. The `countedQuantity` is initially NULL (not yet counted)
