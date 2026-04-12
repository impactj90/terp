# WH_12 -- Mobile QR-Scanner fur Lagervorgange: Implementation Plan

Date: 2026-03-26

---

## Overview

Implement a mobile QR-scanner solution that replaces the ZMI Timeboy hardware terminal. Warehouse employees scan QR codes with their phone camera (HTML5 Camera API, no native app). Covers: Wareneingang (goods receipt), Lagerentnahme (withdrawal), Inventur (inventory count), Storno (cancellation). QR codes are generated on-the-fly from tenant ID + article number and can be printed as PDF label sheets.

**QR Code Format:** `TERP:ART:{tenantId-short}:{articleNumber}` (e.g. `TERP:ART:a1b2c3:ART-00042`)

---

## Phase 1: Backend -- QR Service + Router

### Goal
Create the QR service layer with code resolution, QR image generation, and the tRPC router with proper permissions.

### 1.1 Install Dependencies

**File:** `package.json`

```bash
pnpm add qrcode html5-qrcode
pnpm add -D @types/qrcode
```

- `qrcode` (MIT) -- Server-side QR code generation as SVG/PNG data URLs for embedding in PDFs
- `html5-qrcode` (MIT, ~50KB gzip) -- Client-side camera-based QR scanning
- `@types/qrcode` -- TypeScript types for qrcode

### 1.2 Add Permissions

**File to modify:** `src/lib/auth/permission-catalog.ts`

Add two new permissions at the end of the warehouse section (after `wh_reservations.manage`):

```ts
// Warehouse QR Scanner
p("wh_qr.scan", "wh_qr", "scan", "Use QR scanner for warehouse operations"),
p("wh_qr.print", "wh_qr", "print", "Print QR code labels"),
```

**Pattern reference:** Follow the existing `p(key, resource, action, description)` pattern. The `permissionId` function generates a deterministic UUID via `uuidv5(key, PERMISSION_NAMESPACE)`.

Update the comment that says "All 93 permissions" to the new count (95).

### 1.3 Create QR Service

**New file:** `src/lib/services/wh-qr-service.ts`

**Pattern reference:** Follow `src/lib/services/wh-withdrawal-service.ts` -- same error class pattern, same function signatures with `(prisma, tenantId, ...)`.

```ts
// Error classes
export class WhQrValidationError extends Error { ... }   // -> BAD_REQUEST
export class WhQrNotFoundError extends Error { ... }      // -> NOT_FOUND
export class WhQrForbiddenError extends Error { ... }     // -> FORBIDDEN

// Functions to implement:

// 1. resolveQrCode(prisma, tenantId, rawCode)
//    - Parse format: /^TERP:ART:([a-f0-9]{6}):(.+)$/
//    - Validate tenantId.startsWith(tenantShort)
//    - Look up article via prisma.whArticle.findFirst({ where: { tenantId, number, isActive: true } })
//    - Return article with stock info (id, number, name, unit, currentStock, minStock, warehouseLocation, images)
//    - Throw WhQrValidationError for bad format
//    - Throw WhQrForbiddenError for cross-tenant codes
//    - Throw WhQrNotFoundError for unknown/inactive articles

// 2. buildQrContent(tenantId, articleNumber)
//    - Returns "TERP:ART:{tenantId.substring(0,6)}:{articleNumber}"
//    - Pure function, no DB access

// 3. generateQrDataUrl(content, size?)
//    - Uses `qrcode` package to generate SVG or PNG data URL
//    - import QRCode from 'qrcode'
//    - return QRCode.toDataURL(content, { width: size ?? 150, margin: 1 })

// 4. generateLabelPdf(prisma, tenantId, articleIds, format?)
//    - Load articles by IDs (filtered by tenantId)
//    - For each article: build QR content, generate QR data URL
//    - Render PDF with @react-pdf/renderer (see Phase 2)
//    - Return { buffer: Buffer, filename: string }

// 5. generateAllLabelsPdf(prisma, tenantId, options?)
//    - Load all active articles (optional filter by groupId)
//    - Delegate to generateLabelPdf with collected IDs

// 6. generateSingleQr(prisma, tenantId, articleId)
//    - Load single article
//    - Return { dataUrl: string, content: string, article: {...} }

// 7. listRecentMovements(prisma, tenantId, articleId, limit?)
//    - For Storno flow: fetch last N stock movements for a given article
//    - prisma.whStockMovement.findMany({ where: { tenantId, articleId }, orderBy: { createdAt: 'desc' }, take: limit ?? 10 })
//    - Include article relation for display
```

**Tenant isolation:** Every DB query must include `tenantId` in the `where` clause. The `resolveQrCode` function must validate the tenant prefix before querying.

### 1.4 Create QR Router

**New file:** `src/trpc/routers/warehouse/qr.ts`

**Pattern reference:** Follow `src/trpc/routers/warehouse/withdrawals.ts` exactly.

```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as qrService from "@/lib/services/wh-qr-service"
import type { PrismaClient } from "@/generated/prisma/client"

const WH_QR_SCAN = permissionIdByKey("wh_qr.scan")!
const WH_QR_PRINT = permissionIdByKey("wh_qr.print")!

const whProcedure = tenantProcedure.use(requireModule("warehouse"))

export const whQrRouter = createTRPCRouter({
  // Query: resolve a QR code string to an article
  resolveCode: whProcedure
    .use(requirePermission(WH_QR_SCAN))
    .input(z.object({ code: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await qrService.resolveQrCode(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.code
        )
      } catch (err) { handleServiceError(err) }
    }),

  // Query: generate label PDF for selected articles
  generateLabelPdf: whProcedure
    .use(requirePermission(WH_QR_PRINT))
    .input(z.object({
      articleIds: z.array(z.string().uuid()).min(1).max(200),
      format: z.enum(["AVERY_L4736", "AVERY_L4731", "CUSTOM"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await qrService.generateLabelPdf(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.articleIds,
          input.format
        )
      } catch (err) { handleServiceError(err) }
    }),

  // Query: generate label PDF for all articles (optional group filter)
  generateAllLabelsPdf: whProcedure
    .use(requirePermission(WH_QR_PRINT))
    .input(z.object({
      articleGroupId: z.string().uuid().optional(),
      format: z.enum(["AVERY_L4736", "AVERY_L4731", "CUSTOM"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await qrService.generateAllLabelsPdf(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) { handleServiceError(err) }
    }),

  // Query: generate single QR code as data URL
  generateSingleQr: whProcedure
    .use(requirePermission(WH_QR_PRINT))
    .input(z.object({ articleId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await qrService.generateSingleQr(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.articleId
        )
      } catch (err) { handleServiceError(err) }
    }),

  // Query: recent stock movements for an article (for Storno flow)
  recentMovements: whProcedure
    .use(requirePermission(WH_QR_SCAN))
    .input(z.object({
      articleId: z.string().uuid(),
      limit: z.number().int().min(1).max(50).default(10),
    }))
    .query(async ({ ctx, input }) => {
      try {
        return await qrService.listRecentMovements(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.articleId,
          input.limit
        )
      } catch (err) { handleServiceError(err) }
    }),
})
```

**Note on resolveCode:** This is a `mutation` (not a `query`) because it is called imperatively on scan events, not on page load. This avoids caching/deduplication issues with rapid scanning.

**Note on generateLabelPdf/generateAllLabelsPdf:** These are `mutation`s because they produce a PDF buffer as a side effect. The service will upload to Supabase Storage and return a signed URL (following the existing pattern in `wh-purchase-order-pdf-service.ts`).

### 1.5 Register Router

**File to modify:** `src/trpc/routers/warehouse/index.ts`

Add import and register:
```ts
import { whQrRouter } from "./qr"

// In createTRPCRouter:
qr: whQrRouter,
```

### Verification -- Phase 1

- `pnpm typecheck` passes (no new type errors from the new files)
- `pnpm lint` passes
- Manual test via tRPC panel or curl: `warehouse.qr.resolveCode({ code: "TERP:ART:a0b1c2:ART-00001" })` returns article or appropriate error

---

## Phase 2: Backend -- Label PDF Generation

### Goal
Create a React-PDF component that renders QR label sheets in Avery Zweckform format.

### 2.1 Create QR Label PDF Component

**New file:** `src/lib/pdf/qr-label-pdf.tsx`

**Pattern reference:** Follow `src/lib/pdf/purchase-order-pdf.tsx` -- same imports, same `MM = 2.835` constant, same StyleSheet pattern.

```tsx
import React from "react"
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer"

const MM = 2.835 // 1mm = 2.835pt

// Label format definitions
const LABEL_FORMATS = {
  AVERY_L4736: {
    // Avery Zweckform L4736REV: 45.7 x 21.2mm, 4 columns x 12 rows = 48 per page
    pageWidth: 210,     // A4 width in mm
    pageHeight: 297,    // A4 height in mm
    labelWidth: 45.7,
    labelHeight: 21.2,
    cols: 4,
    rows: 12,
    marginTop: 10.7,    // top margin to first label row
    marginLeft: 9.7,    // left margin to first label column
    spacingX: 2.5,      // horizontal gap between labels
    spacingY: 0,        // vertical gap between labels
  },
  AVERY_L4731: {
    // Avery Zweckform L4731: 25.4 x 10mm, 7 columns x 27 rows = 189 per page
    pageWidth: 210,
    pageHeight: 297,
    labelWidth: 25.4,
    labelHeight: 10,
    cols: 7,
    rows: 27,
    marginTop: 13.5,
    marginLeft: 9.0,
    spacingX: 2.5,
    spacingY: 0,
  },
} as const

type LabelFormat = keyof typeof LABEL_FORMATS

interface LabelData {
  qrDataUrl: string      // base64 QR code image
  articleNumber: string
  articleName: string
  unit: string
}

interface QrLabelPdfProps {
  labels: LabelData[]
  format: LabelFormat
}

// Component renders A4 pages filled with labels in the specified grid format.
// Each label contains:
//   - QR code image (left side, square fitting label height minus padding)
//   - Article number (right side, bold, truncated)
//   - Article name (right side, smaller, truncated)
//   - Unit (right side, smallest)
```

**Layout per label (AVERY_L4736):**
```
+-------------------------------------------+
| +------+ ART-00042                        |
| | QR   | Schrauben M8x20 Edelstahl       |
| | CODE | Stk                              |
| +------+                                  |
+-------------------------------------------+
  45.7mm x 21.2mm
```

The QR code image is sized to fit within the label height minus padding (approximately 15mm square = ~42pt).

### 2.2 Wire PDF Generation into Service

In `src/lib/services/wh-qr-service.ts`, the `generateLabelPdf` function:

1. Loads articles from DB (filtered by tenantId + articleIds)
2. For each article, generates a QR data URL using `qrcode.toDataURL()`
3. Calls `React.createElement(QrLabelPdf, { labels, format })`
4. Calls `renderToBuffer(element)` to get a PDF Buffer
5. Uploads to Supabase Storage bucket `"documents"` at path `qr-labels/{sanitized-name}.pdf`
6. Creates a signed URL (5min expiry)
7. Returns `{ signedUrl, filename }`

**Pattern reference:** Follow `src/lib/services/wh-purchase-order-pdf-service.ts` exactly for the upload-to-Supabase-Storage + signed-URL + internal/public URL fix pattern.

### Verification -- Phase 2

- Generate a label PDF for a test article and verify:
  - Correct number of labels per page
  - QR codes are scannable (print and test with phone)
  - Article info is readable
  - Multiple pages work when > 48 articles (for AVERY_L4736)
- `pnpm typecheck` passes

---

## Phase 3: Frontend -- Scanner Component

### Goal
Create a reusable QR scanner component using `html5-qrcode` with camera access, vibration feedback, and manual input fallback.

### 3.1 Create Scanner Component

**New file:** `src/components/warehouse/qr-scanner.tsx`

```tsx
'use client'

import * as React from 'react'
import { Html5Qrcode } from 'html5-qrcode'

interface QrScannerProps {
  onScan: (code: string) => void       // called with raw QR content
  onError?: (error: string) => void    // called on scan errors
  enabled?: boolean                     // pause/resume scanning
  className?: string
}
```

**Key implementation details:**

1. **Initialization:** Create `Html5Qrcode` instance in a `useEffect`. Attach to a div ref.
2. **Camera start:** Call `html5Qrcode.start(facingMode, config, onDecodeSuccess, onDecodeError)`. Use `facingMode: { facingMode: "environment" }` for rear camera.
3. **Cleanup:** Call `html5Qrcode.stop()` in the useEffect cleanup function.
4. **Scan callback:** On successful decode, validate the `TERP:ART:` prefix client-side before calling `onScan`. Implement a debounce/cooldown (500ms) to prevent duplicate scans.
5. **Vibration feedback:** `navigator.vibrate?.(200)` on successful scan.
6. **Audio feedback:** Play a short beep using `AudioContext` or a small MP3.
7. **Error handling:** If camera access is denied, show a clear message and offer the manual input fallback.
8. **Torch toggle:** If `Html5Qrcode.isTorchSupported()`, show a flashlight button.
9. **Enabled prop:** When `enabled` is false, pause scanning (call `html5Qrcode.pause()` or stop the stream).

### 3.2 Create Manual Input Fallback

**Included in `qr-scanner.tsx` or as a sub-component.**

When camera is unavailable or user clicks "Manual Input":
- Show a text input field for article number
- On submit, construct `TERP:ART:{tenantShort}:{input}` and call onScan
- OR just call onScan with the raw article number and have the parent resolve it differently

**Decision:** The manual input should call a separate `resolveByNumber` function in the service that accepts a plain article number (not a full QR code). This avoids requiring the user to know the tenant short prefix. The scanner page component will handle both flows: QR scan -> resolveCode, manual input -> resolveByNumber (which can be a simple `findByNumber` call via the existing articles router or a new procedure in the QR router).

Add to QR router:
```ts
resolveByNumber: whProcedure
  .use(requirePermission(WH_QR_SCAN))
  .input(z.object({ articleNumber: z.string().min(1) }))
  .mutation(async ({ ctx, input }) => { ... })
```

And add `resolveByNumber` to the QR service.

### Verification -- Phase 3

- Component renders camera preview in a browser with HTTPS
- Scanning a QR code triggers the callback
- Phone vibrates on successful scan
- Manual input fallback works when camera is denied
- Component cleans up camera stream on unmount (no leaked streams)

---

## Phase 4: Frontend -- Scanner Page

### Goal
Create the mobile-first scanner page at `/warehouse/scanner` with action buttons and flows for Wareneingang, Entnahme, Inventur, and Storno.

### 4.1 Create Scanner Page Route

**New file:** `src/app/[locale]/(dashboard)/warehouse/scanner/page.tsx`

**Pattern reference:** Follow `src/app/[locale]/(dashboard)/warehouse/goods-receipt/page.tsx`.

```tsx
'use client'

import { useTranslations } from 'next-intl'
import { useHasPermission } from '@/hooks'
import { ScannerTerminal } from '@/components/warehouse/scanner-terminal'

export default function WhScannerPage() {
  const t = useTranslations('warehouseScanner')
  const { allowed: canAccess } = useHasPermission(['wh_qr.scan'])

  if (canAccess === false) {
    return <div className="p-6 text-center text-muted-foreground">{t('noPermission')}</div>
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <ScannerTerminal />
    </div>
  )
}
```

### 4.2 Create Scanner Terminal Component

**New file:** `src/components/warehouse/scanner-terminal.tsx`

**Pattern reference:** Follow `src/components/warehouse/goods-receipt-terminal.tsx` for the multi-step wizard pattern with state machine.

**State machine:**

```
IDLE -> SCANNED -> ACTION_SELECTED -> FORM -> BOOKED -> IDLE
```

States:
- `IDLE`: Scanner active, waiting for scan. Shows camera preview (80% screen).
- `SCANNED`: Article resolved. Shows article info (name, number, stock, image, location). Shows 4 action buttons as tiles.
- `ACTION_SELECTED`: One of Wareneingang/Entnahme/Inventur/Storno selected.
- `FORM`: Specific form for the selected action (quantity input, reference selection, etc.)
- `BOOKED`: Success state with confirmation. Auto-returns to IDLE after 3s or on tap.

**Action buttons (2x2 grid of cards):**
1. **Wareneingang** (PackageCheck icon, green) -- requires `wh_stock.manage`
2. **Entnahme** (PackageMinus icon, orange) -- requires `wh_stock.manage`
3. **Inventur** (ClipboardList icon, blue) -- requires `wh_qr.scan` (WH_08 dependency note below)
4. **Storno** (Undo icon, red) -- requires `wh_stock.manage`

**Mobile optimizations:**
- Touch targets >= 48px
- Large number input for quantities (use `type="number"` with `inputMode="decimal"`)
- Full-width buttons
- Minimal chrome, maximum scanner view
- Recent scan history at bottom (scrollable list from localStorage)

### 4.3 Sub-flows

#### 4.3.1 Wareneingang Flow (after article scanned)

1. Fetch open purchase order positions for this article using existing `warehouse.stockMovements.goodsReceipt.pendingOrdersForArticle` or similar. If no such procedure exists, add a new query to the QR router or stock movements router that finds PO positions containing this article that are not fully received.
2. Show list of open PO positions (PO number, supplier, ordered qty, received qty, remaining qty)
3. User selects a PO position
4. User enters received quantity (large number input, default = remaining qty)
5. Confirm button -> calls existing `warehouse.stockMovements.goodsReceipt.bookSingle` or `bookGoodsReceipt`
6. Success feedback (green checkmark, vibration, toast)

**Integration:** Uses existing `wh-stock-movement-service.ts` `bookGoodsReceipt()` or `bookSinglePosition()`.

**New query needed:** `pendingPositionsForArticle(prisma, tenantId, articleId)` -- find purchase order positions where `articleId` matches and `receivedQuantity < quantity`. Add this to the stock movement repository or the QR service.

#### 4.3.2 Entnahme Flow (after article scanned)

1. Show current stock prominently
2. User enters withdrawal quantity (large number input)
3. User selects reference type: Auftrag (ORDER), Lieferschein (DOCUMENT), Sonstige (NONE) -- card-based selection like withdrawal terminal
4. Optional: Select specific order/document from search
5. Optional: Notes
6. Confirm -> calls existing `warehouse.withdrawals.create`
7. Success feedback

**Integration:** Uses existing `wh-withdrawal-service.ts` `createWithdrawal()` via the withdrawals router.

#### 4.3.3 Inventur Flow (after article scanned)

**Important:** WH_08 (Inventur) is NOT yet implemented. The scanner page should show this action as disabled/coming-soon until WH_08 is built.

For now:
- Show "Inventur" button as disabled with tooltip "Inventur-Modul in Vorbereitung"
- The flow design (for when WH_08 is ready):
  1. Select active inventory session (or create new)
  2. Show expected stock
  3. Enter counted quantity
  4. Confirm -> creates inventory count record

#### 4.3.4 Storno Flow (after article scanned)

1. Fetch recent stock movements for the article using `warehouse.qr.recentMovements`
2. Show list of movements (type, quantity, date, reference)
3. User selects a movement to reverse
4. Show confirmation dialog with details
5. Confirm -> calls existing `warehouse.withdrawals.cancel` for WITHDRAWAL type movements
6. Success feedback

**Integration:** Uses existing `wh-withdrawal-service.ts` `cancelWithdrawal()` for withdrawal reversals. For goods receipt storno, a new function may be needed (or could be deferred).

### 4.4 Scan History

**Stored in localStorage** (not server state). Structure:

```ts
interface ScanHistoryEntry {
  timestamp: string
  articleNumber: string
  articleName: string
  action: 'goodsReceipt' | 'withdrawal' | 'inventory' | 'storno' | 'lookup'
  quantity?: number
  success: boolean
}
```

Keep last 50 entries. Show as a scrollable list below the main scanner area. Stored per-browser (no sync needed).

### Verification -- Phase 4

- Scanner page accessible at `/warehouse/scanner`
- Camera opens and can scan QR codes
- Manual fallback input works
- All 4 action buttons visible after successful scan
- Wareneingang flow completes and books a goods receipt
- Entnahme flow completes and books a withdrawal
- Inventur button shows as disabled
- Storno flow shows recent movements and can cancel a withdrawal
- Scan history persists across page reloads

---

## Phase 5: Frontend -- Label Management

### Goal
Add QR label printing capabilities to the article list and article detail pages.

### 5.1 Create Hooks

**New file:** `src/hooks/use-wh-qr.ts`

**Pattern reference:** Follow `src/hooks/use-wh-withdrawals.ts`.

```ts
import { useTRPC } from "@/trpc"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

// Resolve QR code (mutation, called imperatively on scan)
export function useResolveQrCode() {
  const trpc = useTRPC()
  return useMutation({
    ...trpc.warehouse.qr.resolveCode.mutationOptions(),
  })
}

// Resolve by article number (manual input fallback)
export function useResolveByNumber() {
  const trpc = useTRPC()
  return useMutation({
    ...trpc.warehouse.qr.resolveByNumber.mutationOptions(),
  })
}

// Generate label PDF for selected articles
export function useGenerateLabelPdf() {
  const trpc = useTRPC()
  return useMutation({
    ...trpc.warehouse.qr.generateLabelPdf.mutationOptions(),
  })
}

// Generate label PDF for all articles (optional group filter)
export function useGenerateAllLabelsPdf() {
  const trpc = useTRPC()
  return useMutation({
    ...trpc.warehouse.qr.generateAllLabelsPdf.mutationOptions(),
  })
}

// Get single QR code data URL
export function useGenerateSingleQr(articleId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.qr.generateSingleQr.queryOptions(
      { articleId },
      { enabled: enabled && !!articleId }
    )
  )
}

// Recent movements for an article (Storno flow)
export function useQrRecentMovements(articleId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.qr.recentMovements.queryOptions(
      { articleId },
      { enabled: enabled && !!articleId }
    )
  )
}
```

### 5.2 Register Hooks in Barrel

**File to modify:** `src/hooks/index.ts`

Add at the end of the warehouse hooks section (after `use-wh-reservations` exports):

```ts
export {
  useResolveQrCode,
  useResolveByNumber,
  useGenerateLabelPdf,
  useGenerateAllLabelsPdf,
  useGenerateSingleQr,
  useQrRecentMovements,
} from './use-wh-qr'
```

### 5.3 Add "Print Labels" Button to Article List

**File to modify:** `src/components/warehouse/articles/` (the article list component)

Add a toolbar button "QR-Etiketten drucken" that:
1. Uses the current selection (if table supports multi-select) or all visible articles
2. Calls `useGenerateLabelPdf` with selected article IDs
3. Opens the returned signed URL in a new tab (browser prints the PDF)

If multi-select is not supported in the current article table, add a dedicated "Etiketten drucken" action that opens a dialog where the user can:
- Select articles by group or search
- Choose label format (AVERY_L4736 default)
- Generate and download PDF

### 5.4 Add "Print QR Label" Button to Article Detail

**File to modify:** The article detail page component (likely `src/app/[locale]/(dashboard)/warehouse/articles/[id]/page.tsx` or its child components)

Add a button in the article detail header/actions area:
- Icon: `QrCode` from lucide-react
- Label: "QR-Etikett"
- On click: calls `useGenerateLabelPdf` with `[articleId]`
- Opens the returned PDF URL in a new tab

Also show the QR code inline on the article detail page using `useGenerateSingleQr` -- display the QR data URL as an `<img>`.

### 5.5 Create Labels Page (Optional)

**New file:** `src/app/[locale]/(dashboard)/warehouse/labels/page.tsx`

A dedicated page for bulk label printing:
- Select article group or individual articles
- Choose label format
- Preview (optional, could just generate)
- Generate PDF button

This is lower priority -- the article list/detail buttons cover the main use case.

### Verification -- Phase 5

- "QR-Etiketten drucken" button appears in article list
- Clicking generates a PDF and opens it in a new tab
- Article detail page shows inline QR code
- "QR-Etikett" button in detail generates a single-article label PDF
- All generated PDFs have correct QR codes that scan correctly

---

## Phase 6: Integration -- Wire Scanner Actions to Existing Services

### Goal
Ensure all scanner flows properly connect to existing warehouse services. Add any missing queries/procedures needed.

### 6.1 Pending PO Positions for Article

**File to modify or extend:** `src/lib/services/wh-stock-movement-service.ts` or `src/lib/services/wh-qr-service.ts`

Add function `findPendingPositionsForArticle(prisma, tenantId, articleId)`:

```ts
// Find purchase order positions that reference this article and are not fully received
const positions = await prisma.whPurchaseOrderPosition.findMany({
  where: {
    purchaseOrder: { tenantId, status: { in: ['ORDERED', 'PARTIALLY_RECEIVED'] } },
    articleId: articleId,
    // receivedQuantity < quantity (filter in application layer or raw where)
  },
  include: {
    purchaseOrder: {
      select: { id: true, number: true, supplier: { select: { company: true } } },
    },
  },
  orderBy: { purchaseOrder: { orderDate: 'desc' } },
})
// Filter: position.receivedQuantity < position.quantity
return positions.filter(p => (p.receivedQuantity ?? 0) < (p.quantity ?? 0))
```

Add a corresponding router procedure in `qr.ts`:
```ts
pendingPositionsForArticle: whProcedure
  .use(requirePermission(WH_QR_SCAN))
  .input(z.object({ articleId: z.string().uuid() }))
  .query(...)
```

### 6.2 Goods Receipt from Scanner

The scanner's Wareneingang flow calls the existing `warehouse.stockMovements.goodsReceipt.bookSingle` mutation. Verify the existing `bookSinglePosition` function in `wh-stock-movement-service.ts` accepts the right parameters (positionId + quantity) and works from the scanner context.

### 6.3 Withdrawal from Scanner

The scanner's Entnahme flow calls `warehouse.withdrawals.create`. This already exists and needs no changes.

### 6.4 Storno from Scanner

The scanner's Storno flow calls `warehouse.withdrawals.cancel`. This already exists for WITHDRAWAL and DELIVERY_NOTE types.

For goods receipt storno: Consider adding a `cancelGoodsReceipt` function to `wh-stock-movement-service.ts` that reverses a GOODS_RECEIPT movement (creates negative movement, decrements stock, adjusts PO received quantity). This can be deferred to a follow-up if the scope is too large.

### Verification -- Phase 6

- Full end-to-end test: Scan article -> Wareneingang -> select PO -> enter qty -> book -> verify stock increased
- Full end-to-end test: Scan article -> Entnahme -> enter qty -> book -> verify stock decreased
- Full end-to-end test: Scan article -> Storno -> select withdrawal -> cancel -> verify stock restored

---

## Phase 7: Navigation + Translations

### 7.1 Add Sidebar Entry

**File to modify:** `src/components/layout/sidebar/sidebar-nav-config.ts`

Add to the `warehouseSection` items array (after `warehouseReservations`, before `warehouseCorrections`):

```ts
{
  titleKey: 'warehouseScanner',
  href: '/warehouse/scanner',
  icon: ScanLine,   // from lucide-react (or QrCode)
  module: 'warehouse',
  permissions: ['wh_qr.scan'],
},
```

Import `ScanLine` (or `QrCode`) from `lucide-react` at the top of the file.

### 7.2 Add Translations

**File to modify:** `messages/de.json`

Add nav key:
```json
"warehouseScanner": "QR-Scanner",
```

Add namespace:
```json
"warehouseScanner": {
  "pageTitle": "QR-Scanner",
  "noPermission": "Keine Berechtigung fur den QR-Scanner",
  "scannerTitle": "Artikel scannen",
  "scannerDescription": "Scannen Sie den QR-Code auf dem Artikeletikett",
  "manualInput": "Manuelle Eingabe",
  "manualInputPlaceholder": "Artikelnummer eingeben...",
  "cameraPermissionDenied": "Kamera-Zugriff verweigert. Bitte erlauben Sie den Zugriff in den Browser-Einstellungen.",
  "invalidQrCode": "Ungultiger QR-Code",
  "wrongTenant": "Dieser QR-Code gehort zu einem anderen Mandanten",
  "articleNotFound": "Artikel nicht gefunden",
  "articleResolved": "Artikel erkannt",
  "currentStock": "Aktueller Bestand",
  "warehouseLocation": "Lagerort",
  "selectAction": "Aktion wahlen",
  "actionGoodsReceipt": "Wareneingang",
  "actionWithdrawal": "Entnahme",
  "actionInventory": "Inventur",
  "actionStorno": "Storno",
  "inventoryNotAvailable": "Inventur-Modul in Vorbereitung",
  "quantity": "Menge",
  "confirm": "Bestatigen",
  "cancel": "Abbrechen",
  "back": "Zuruck",
  "success": "Erfolgreich gebucht",
  "scanHistory": "Letzte Scans",
  "noHistory": "Noch keine Scans durchgefuhrt",
  "selectPurchaseOrder": "Bestellung wahlen",
  "noPendingOrders": "Keine offenen Bestellungen fur diesen Artikel",
  "remainingQty": "Offene Menge",
  "referenceType": "Referenz",
  "referenceOrder": "Auftrag",
  "referenceDocument": "Lieferschein",
  "referenceNone": "Sonstige",
  "selectMovement": "Buchung zum Stornieren wahlen",
  "noMovements": "Keine Buchungen fur diesen Artikel",
  "confirmStorno": "Storno bestatigen",
  "stornoSuccess": "Storno erfolgreich",
  "torchOn": "Licht an",
  "torchOff": "Licht aus",
  "printLabels": "QR-Etiketten drucken",
  "printSingleLabel": "QR-Etikett drucken",
  "labelFormat": "Etikettenformat",
  "generating": "PDF wird generiert..."
}
```

**File to modify:** `messages/en.json`

Add equivalent English translations.

### Verification -- Phase 7

- Scanner appears in sidebar navigation under "Lager" section
- All translation keys resolve correctly (no missing translation warnings)
- Page title shows correctly in both de and en locales

---

## Phase 8: Tests

### 8.1 Service Tests

**New file:** `src/lib/services/__tests__/wh-qr-service.test.ts`

**Pattern reference:** Follow `src/lib/services/__tests__/wh-withdrawal-service.test.ts` -- same mock Prisma factory, same test structure.

Test cases:

```ts
describe("wh-qr-service", () => {
  describe("resolveQrCode", () => {
    it("parses valid TERP:ART: code and returns article", async () => {
      // Mock findFirst to return article
      // Call resolveQrCode("TERP:ART:a00000:ART-00001")
      // Expect article returned
    })

    it("rejects invalid QR code format", async () => {
      await expect(resolveQrCode(prisma, TENANT_ID, "INVALID"))
        .rejects.toThrow(WhQrValidationError)
    })

    it("rejects QR code from different tenant", async () => {
      await expect(resolveQrCode(prisma, TENANT_ID, "TERP:ART:ffffff:ART-00001"))
        .rejects.toThrow(WhQrForbiddenError)
    })

    it("rejects inactive article", async () => {
      // Mock findFirst to return null (isActive: true filter)
      await expect(resolveQrCode(prisma, TENANT_ID, "TERP:ART:a00000:GONE"))
        .rejects.toThrow(WhQrNotFoundError)
    })

    it("rejects unknown article number", async () => {
      // Mock findFirst to return null
      await expect(resolveQrCode(prisma, TENANT_ID, "TERP:ART:a00000:NOEXIST"))
        .rejects.toThrow(WhQrNotFoundError)
    })
  })

  describe("buildQrContent", () => {
    it("constructs correct format from tenant ID and article number", () => {
      expect(buildQrContent("a00000xx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", "ART-00042"))
        .toBe("TERP:ART:a00000:ART-00042")
    })
  })

  describe("generateQrDataUrl", () => {
    it("returns a valid data URL string", async () => {
      const url = await generateQrDataUrl("TERP:ART:a00000:ART-1")
      expect(url).toMatch(/^data:image\/png;base64,/)
    })
  })

  describe("generateLabelPdf", () => {
    it("generates PDF buffer for given articles", async () => {
      // Mock findMany to return articles
      // Call generateLabelPdf
      // Expect buffer to be non-empty
    })

    it("filters articles by tenant ID", async () => {
      // Verify prisma.whArticle.findMany was called with tenantId in where clause
    })
  })
})
```

### 8.2 Router Tests

**New file:** `src/trpc/routers/__tests__/whQr-router.test.ts`

**Pattern reference:** Follow `src/trpc/routers/__tests__/whWithdrawals-router.test.ts`.

Test cases:

```ts
describe("warehouse.qr", () => {
  it("resolveCode -- returns article for valid QR code", async () => { })
  it("resolveCode -- rejects cross-tenant QR code with FORBIDDEN", async () => { })
  it("resolveCode -- requires wh_qr.scan permission", async () => { })
  it("generateLabelPdf -- returns signed URL", async () => { })
  it("generateLabelPdf -- requires wh_qr.print permission", async () => { })
  it("recentMovements -- returns movements for article", async () => { })
})
```

### Verification -- Phase 8

```bash
pnpm vitest run src/lib/services/__tests__/wh-qr-service.test.ts
pnpm vitest run src/trpc/routers/__tests__/whQr-router.test.ts
pnpm typecheck
pnpm lint
```

---

## Phase 9: Handbuch Update

### Goal
Update the user manual if QR scanner / warehouse sections exist.

**File to check:** `TERP_HANDBUCH_V2.md` (if it exists and has a warehouse section)

Add a new section for QR-Scanner:
- How to print QR labels
- How to use the scanner page
- Step-by-step Praxisbeispiele for each flow (Wareneingang, Entnahme, Storno)
- Note about Inventur being in preparation

---

## File Summary

### New Files (12)

| File | Description |
|------|-------------|
| `src/lib/services/wh-qr-service.ts` | QR service: code resolution, QR generation, label PDF orchestration |
| `src/trpc/routers/warehouse/qr.ts` | tRPC router with resolveCode, generateLabelPdf, etc. |
| `src/hooks/use-wh-qr.ts` | React hooks wrapping QR router procedures |
| `src/lib/pdf/qr-label-pdf.tsx` | React-PDF component for QR label sheets |
| `src/components/warehouse/qr-scanner.tsx` | Camera QR scanner component (html5-qrcode) |
| `src/components/warehouse/scanner-terminal.tsx` | Scanner page terminal with action flows |
| `src/app/[locale]/(dashboard)/warehouse/scanner/page.tsx` | Scanner page route |
| `src/app/[locale]/(dashboard)/warehouse/labels/page.tsx` | Label management page (optional) |
| `src/lib/services/__tests__/wh-qr-service.test.ts` | Service unit tests |
| `src/trpc/routers/__tests__/whQr-router.test.ts` | Router integration tests |

### Modified Files (7)

| File | Change |
|------|--------|
| `package.json` | Add `qrcode`, `html5-qrcode`, `@types/qrcode` |
| `src/lib/auth/permission-catalog.ts` | Add `wh_qr.scan`, `wh_qr.print` permissions |
| `src/trpc/routers/warehouse/index.ts` | Register `qr: whQrRouter` |
| `src/hooks/index.ts` | Export new QR hooks |
| `src/components/layout/sidebar/sidebar-nav-config.ts` | Add scanner nav entry |
| `messages/de.json` | Add `warehouseScanner` nav key + namespace |
| `messages/en.json` | Add `warehouseScanner` nav key + namespace |

### Potentially Modified Files (3)

| File | Change |
|------|--------|
| `src/components/warehouse/articles/` (list component) | Add "Print Labels" button |
| `src/app/[locale]/(dashboard)/warehouse/articles/[id]/page.tsx` (or child) | Add inline QR + print button |
| `src/lib/services/wh-stock-movement-service.ts` or `wh-stock-movement-repository.ts` | Add `findPendingPositionsForArticle` |

---

## Dependencies & Sequencing

```
Phase 1 (Backend: QR Service + Router)
  |
  +-- Phase 2 (Backend: Label PDF) -- depends on Phase 1 for service structure
  |     |
  +-- Phase 3 (Frontend: Scanner Component) -- depends on Phase 1 for resolveCode
  |     |
  |     +-- Phase 4 (Frontend: Scanner Page) -- depends on Phase 1 + 3
  |     |
  +-- Phase 5 (Frontend: Label Management) -- depends on Phase 1 + 2
  |
  +-- Phase 6 (Integration) -- depends on Phase 1 + 4
  |
  +-- Phase 7 (Navigation + Translations) -- depends on Phase 4 + 5
  |
  +-- Phase 8 (Tests) -- depends on Phase 1 + 2
  |
  +-- Phase 9 (Handbuch) -- depends on all above
```

Phases 2, 3, and the hooks part of 5 can be developed in parallel after Phase 1 is complete. Phase 4 depends on Phase 3. Phase 7 (translations/nav) can be done alongside any phase.

---

## Risk Notes

1. **WH_08 (Inventur) not implemented:** The Inventur action in the scanner will be disabled until WH_08 is built. This is acceptable per ticket spec.
2. **HTTPS required for camera:** Development requires HTTPS. Use `pnpm dev` with tunnel or `--experimental-https`. The manual input fallback ensures the scanner page is still useful without camera access.
3. **QR code library size:** `html5-qrcode` is ~50KB gzip. It should be dynamically imported (`next/dynamic` with `ssr: false`) to avoid server-side rendering issues and reduce initial bundle size.
4. **PDF rendering performance:** Generating labels for 200+ articles may take several seconds. Show a loading spinner and consider generating in a background job for very large batches.
5. **Goods receipt storno:** No dedicated cancellation function exists for GOODS_RECEIPT type movements. The initial implementation will only support withdrawal storno. Goods receipt storno can be added as a follow-up.
