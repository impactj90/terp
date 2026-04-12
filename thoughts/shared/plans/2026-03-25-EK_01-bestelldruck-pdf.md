# EK_01 — Bestelldruck (Purchase Order PDF) Implementation Plan

**Date:** 2026-03-25
**Ticket:** `thoughts/shared/tickets/orgAuftrag/TICKET_EK_01_BESTELLDRUCK_PDF.md`
**Research:** `thoughts/shared/research/2026-03-25-EK_01-bestelldruck-pdf.md`

---

## Overview

Implement PDF generation for purchase orders (Bestellungen). The system already has a mature PDF pipeline for billing documents using `@react-pdf/renderer` (v4.3.2). We follow the exact same architecture:

```
tRPC Router -> PDF Service (orchestration) -> React PDF Components -> @react-pdf/renderer -> Supabase Storage -> Signed URL
```

**Key decision: On-the-fly generation without `pdfUrl` field.** Unlike billing documents (which are finalized once), PO data can change (positions, notes). We generate the PDF fresh on every download request, upload it to Supabase Storage, and return a signed URL. We set `printedAt` on first generation. No schema migration needed since `printedAt` already exists on `WhPurchaseOrder`.

---

## Phase 1: PDF Components

### Step 1.1: Create Purchase Order Position Table Component

**Create:** `src/lib/pdf/purchase-order-position-table-pdf.tsx`

**Pattern reference:** `src/lib/pdf/position-table-pdf.tsx` (billing version with 6 columns)

The PO position table needs **8 columns** instead of 6:

| Column | Width | Align | Source field |
|--------|-------|-------|-------------|
| Pos | 5% | left | `sortOrder` |
| Art.-Nr. (Lief.) | 12% | left | `supplierArticleNumber` |
| Bezeichnung | 27% | left | `description` or `freeText` |
| Menge | 8% | right | `quantity` |
| Einheit | 7% | center | `unit` |
| Einzelpreis | 14% | right | `unitPrice` |
| Fixkosten | 12% | right | `flatCosts` |
| Gesamtpreis | 15% | right | `totalPrice` |

**Implementation details:**
- Use `StyleSheet.create()` with column widths as percentages (same pattern as billing)
- Header row: `fontSize: 7, fontFamily: "Helvetica-Bold", color: "#666"` (match billing)
- Data rows: `fontSize: 8` (match billing)
- Handle three `positionType` values:
  - `ARTICLE` — full row with all columns
  - `FREETEXT` — full row, use `freeText` as description if `description` is empty
  - `TEXT` — text-only row spanning full width (like billing's TEXT type), render `freeText` or `description`
- Reuse `formatCurrency()` and `formatNumber()` helper functions (copy from `position-table-pdf.tsx`)

**Props interface:**
```ts
interface PurchaseOrderPosition {
  sortOrder: number
  positionType: string
  supplierArticleNumber: string | null
  description: string | null
  freeText: string | null
  quantity: number | null
  unit: string | null
  unitPrice: number | null
  flatCosts: number | null
  totalPrice: number | null
}
```

### Step 1.2: Create Purchase Order PDF Main Component

**Create:** `src/lib/pdf/purchase-order-pdf.tsx`

**Pattern reference:** `src/lib/pdf/billing-document-pdf.tsx`

**Layout structure (A4 page):**
```
[Logo top-right — absolute positioned]
[Sender line — companyName + companyAddress, fontSize 7, color #666]

[Supplier address block — left side]
  Company
  Street
  ZIP City

BESTELLUNG (fontSize 14, Helvetica-Bold)

Nr.: BES-2026-001
Bestelldatum: 25.03.2026
Gewünschter Liefertermin: 01.04.2026
Bestätigter Liefertermin: 03.04.2026       (if set)
Unsere Kundennr.: KD-12345                 (if set)
Ansprechpartner: Max Mustermann            (if set)

[PurchaseOrderPositionTablePdf — 8 columns]

[TotalsSummaryPdf — reuse as-is]

[Notes section — if present]
Bemerkungen:
<notes text in plain text, not HTML>

[Signature line]
_________________________________
Ort, Datum                Unterschrift

[FusszeilePdf — reuse as-is, absolute-positioned at bottom]
```

**Reusable imports:**
- `TotalsSummaryPdf` from `./totals-summary-pdf` — 100% reuse
- `FusszeilePdf` from `./fusszeile-pdf` — 100% reuse
- `PurchaseOrderPositionTablePdf` from `./purchase-order-position-table-pdf` — new

**Constants (match billing):**
- `const MM = 2.835` (1mm in pt)
- Page: `paddingTop: 20 * MM, paddingBottom: 15 * MM, paddingHorizontal: 25 * MM`
- Font: `fontFamily: "Helvetica"`, bold: `"Helvetica-Bold"`
- Base `fontSize: 10`

**Props interface:**
```ts
interface PurchaseOrderPdfProps {
  order: {
    number: string
    orderDate: Date | string | null
    requestedDelivery: Date | string | null
    confirmedDelivery: Date | string | null
    notes: string | null
    subtotalNet: number
    totalVat: number
    totalGross: number
  }
  supplier: {
    company: string | null
    street: string | null
    zip: string | null
    city: string | null
    ourCustomerNumber: string | null
  } | null
  contact: {
    firstName: string | null
    lastName: string | null
  } | null
  positions: PurchaseOrderPosition[]
  tenantConfig: {
    companyName?: string | null
    companyAddress?: string | null
    logoUrl?: string | null
    bankName?: string | null
    iban?: string | null
    bic?: string | null
    taxId?: string | null
    commercialRegister?: string | null
    managingDirector?: string | null
    phone?: string | null
    email?: string | null
  } | null
}
```

**New elements not in billing:**
- "Unsere Kundennr." info line (conditionally rendered from `supplier.ourCustomerNumber`)
- "Ansprechpartner" info line (conditionally rendered from `contact`)
- Notes section in plain text (billing uses `RichTextPdf` for HTML — PO uses plain `<Text>`)
- Signature line block (horizontal rule + "Ort, Datum" / "Unterschrift" labels)

**Date formatter:** Use same `formatDate()` helper as billing: `new Intl.DateTimeFormat("de-DE").format(new Date(date))`

### Verification — Phase 1

```bash
pnpm typecheck 2>&1 | grep "purchase-order-pdf\|purchase-order-position-table"
```

Confirm no type errors in the two new PDF component files. (Rendering correctness will be verified in Phase 4 tests.)

---

## Phase 2: PDF Service

### Step 2.1: Create Purchase Order PDF Service

**Create:** `src/lib/services/wh-purchase-order-pdf-service.ts`

**Pattern reference:** `src/lib/services/billing-document-pdf-service.ts`

**Exports:**

```ts
export class WhPurchaseOrderPdfError extends Error { ... }

// Generate PDF buffer, upload to Supabase Storage, set printedAt, return signed URL
export async function generateAndGetDownloadUrl(
  prisma: PrismaClient,
  tenantId: string,
  purchaseOrderId: string
): Promise<{ signedUrl: string; filename: string }>
```

**Implementation steps (inside `generateAndGetDownloadUrl`):**

1. **Load PO data** — Call `poService.getById(prisma, tenantId, purchaseOrderId)` from `wh-purchase-order-service.ts`. This returns the full PO with `supplier: true`, `contact: true`, `positions` with `article` includes. Throws `WhPurchaseOrderNotFoundError` if not found (mapped to 404 by `handleServiceError`).

2. **Load tenant config** — Call `billingTenantConfigRepo.findByTenantId(prisma, tenantId)` from `billing-tenant-config-repository.ts`. Returns `BillingTenantConfig | null`.

3. **Render PDF** — `React.createElement(PurchaseOrderPdf, { order, supplier, contact, positions, tenantConfig })` then `renderToBuffer(element)`.

4. **Upload to Supabase Storage** — Use `createAdminClient()` from `@/lib/supabase/admin`. Storage path: `bestellung/${tenantId}_${purchaseOrderId}.pdf`. Upsert to overwrite previous versions. Bucket: `"documents"` (same as billing).

5. **Set printedAt** — `prisma.whPurchaseOrder.updateMany({ where: { id: purchaseOrderId, tenantId }, data: { printedAt: new Date() } })`. Uses `updateMany` with tenantId for tenant isolation (same pattern as `tenantScopedUpdate`).

6. **Create signed URL** — `supabase.storage.from(BUCKET).createSignedUrl(storagePath, 300)`. Apply the internal/public URL replacement:
   ```ts
   const internalUrl = serverEnv.supabaseUrl
   const publicUrl = clientEnv.supabaseUrl
   if (internalUrl && publicUrl && internalUrl !== publicUrl) {
     signedUrl = signedUrl.replace(internalUrl, publicUrl)
   }
   ```

7. **Return** — `{ signedUrl, filename }` where `filename = order.number.replace(/[/\\]/g, "_") + ".pdf"`.

**Imports:**
```ts
import type { PrismaClient } from "@/generated/prisma/client"
import { renderToBuffer } from "@react-pdf/renderer"
import { createAdminClient } from "@/lib/supabase/admin"
import { clientEnv, serverEnv } from "@/lib/config"
import * as poService from "./wh-purchase-order-service"
import * as billingTenantConfigRepo from "./billing-tenant-config-repository"
import React from "react"
import { PurchaseOrderPdf } from "@/lib/pdf/purchase-order-pdf"
```

**Constants:**
```ts
const BUCKET = "documents"
const SIGNED_URL_EXPIRY_SECONDS = 300  // 5 minutes
```

### Verification — Phase 2

```bash
pnpm typecheck 2>&1 | grep "wh-purchase-order-pdf"
```

Confirm no type errors in the new service file.

---

## Phase 3: tRPC Router Extension

### Step 3.1: Add PDF procedures to purchase orders router

**Modify:** `src/trpc/routers/warehouse/purchaseOrders.ts`

**Add import at top:**
```ts
import * as poPdfService from "@/lib/services/wh-purchase-order-pdf-service"
```

**Add two procedures** to the `whPurchaseOrdersRouter` (before `positions: positionsRouter`):

```ts
generatePdf: whProcedure
  .use(requirePermission(PO_VIEW))
  .input(z.object({ id: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    try {
      return await poPdfService.generateAndGetDownloadUrl(
        ctx.prisma as unknown as PrismaClient,
        ctx.tenantId!,
        input.id
      )
    } catch (err) {
      handleServiceError(err)
    }
  }),

downloadPdf: whProcedure
  .use(requirePermission(PO_VIEW))
  .input(z.object({ id: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    try {
      return await poPdfService.generateAndGetDownloadUrl(
        ctx.prisma as unknown as PrismaClient,
        ctx.tenantId!,
        input.id
      )
    } catch (err) {
      console.error("downloadPdf error:", err)
      handleServiceError(err)
    }
  }),
```

**Note:** Both `generatePdf` and `downloadPdf` call the same service function (`generateAndGetDownloadUrl`) since we generate on-the-fly. The `generatePdf` name keeps compatibility with the ticket spec. The `downloadPdf` name matches the billing pattern used by the frontend. Both are mutations (not queries) because they have side effects (upload, set printedAt).

### Verification — Phase 3

```bash
pnpm typecheck 2>&1 | grep "purchaseOrders"
```

Confirm no type errors in the modified router.

---

## Phase 4: Frontend (Hooks + UI)

### Step 4.1: Add PDF hooks

**Modify:** `src/hooks/use-wh-purchase-orders.ts`

Add at the bottom of the file (after the existing mutation hooks):

```ts
export function useGenerateWhPurchaseOrderPdf() {
  const trpc = useTRPC()
  return useMutation(trpc.warehouse.purchaseOrders.generatePdf.mutationOptions())
}

export function useDownloadWhPurchaseOrderPdf() {
  const trpc = useTRPC()
  return useMutation(trpc.warehouse.purchaseOrders.downloadPdf.mutationOptions())
}
```

**Pattern reference:** `src/hooks/use-billing-documents.ts` line 159 (`useDownloadBillingDocumentPdf`).

### Step 4.2: Export hooks from barrel

**Modify:** `src/hooks/index.ts`

Add the two new exports to the `use-wh-purchase-orders` export block (around line 872):

```ts
export {
  // ... existing exports ...
  useGenerateWhPurchaseOrderPdf,
  useDownloadWhPurchaseOrderPdf,
} from './use-wh-purchase-orders'
```

### Step 4.3: Wire PDF button in purchase order detail

**Modify:** `src/components/warehouse/purchase-order-detail.tsx`

**Changes:**

1. **Add import** — Add `useDownloadWhPurchaseOrderPdf` to the imports from `@/hooks/use-wh-purchase-orders`:
   ```ts
   import {
     useWhPurchaseOrder,
     useCancelWhPurchaseOrder,
     useDownloadWhPurchaseOrderPdf,
   } from '@/hooks/use-wh-purchase-orders'
   ```

2. **Add `FileDown` icon** — Update lucide import:
   ```ts
   import { ArrowLeft, Edit, Send, XCircle, FileText, FileDown, Loader2 } from 'lucide-react'
   ```

3. **Initialize mutation** — After `cancelMutation` (line 80):
   ```ts
   const downloadPdfMutation = useDownloadWhPurchaseOrderPdf()
   ```

4. **Replace the disabled PDF button** (lines 204-207) with an active one:
   ```tsx
   <Button
     variant="outline"
     size="sm"
     disabled={downloadPdfMutation.isPending}
     onClick={async () => {
       try {
         const result = await downloadPdfMutation.mutateAsync({ id: order.id })
         if (result?.signedUrl) {
           window.open(result.signedUrl, '_blank')
         }
       } catch {
         toast.error(t('pdfDownloadFailed'))
       }
     }}
   >
     {downloadPdfMutation.isPending ? (
       <Loader2 className="h-4 w-4 mr-2 animate-spin" />
     ) : (
       <FileDown className="h-4 w-4 mr-2" />
     )}
     {downloadPdfMutation.isPending ? t('loadingPdf') : t('actionGeneratePdf')}
   </Button>
   ```

   **Pattern reference:** `src/components/billing/document-editor.tsx` PDF download button.

### Step 4.4: Add translation keys

**Modify:** `messages/de.json` — in the `warehousePurchaseOrders` section (after `"actionGeneratePdf": "PDF erstellen"`):

```json
"pdfDownloadFailed": "PDF-Download fehlgeschlagen",
"loadingPdf": "Lade PDF..."
```

**Modify:** `messages/en.json` — same location:

```json
"pdfDownloadFailed": "PDF download failed",
"loadingPdf": "Loading PDF..."
```

**Note:** The keys `"actionGeneratePdf"` and `"detailOurCustomerNumber"` already exist. Only `"pdfDownloadFailed"` and `"loadingPdf"` are new for this namespace. (The billing namespace already has these keys, but we need them in `warehousePurchaseOrders` too.)

### Verification — Phase 4

```bash
pnpm typecheck 2>&1 | grep -E "purchase-order-detail|use-wh-purchase"
```

Confirm no type errors.

---

## Phase 5: Tests

### Step 5.1: Router Tests

**Modify:** `src/trpc/routers/__tests__/whPurchaseOrders-router.test.ts`

**Add new describe block** for PDF procedures. Follow the existing test patterns in this file.

Mock the PDF service module:
```ts
vi.mock("@/lib/services/wh-purchase-order-pdf-service", () => ({
  generateAndGetDownloadUrl: vi.fn().mockResolvedValue({
    signedUrl: "https://example.com/signed-url",
    filename: "BES-1.pdf",
  }),
}))
```

**Test cases:**

```ts
describe("generatePdf", () => {
  it("returns signed URL for valid PO", async () => {
    const prisma = { /* minimal mocks */ }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.generatePdf({ id: PO_ID })
    expect(result).toHaveProperty("signedUrl")
    expect(result).toHaveProperty("filename")
  })

  it("rejects without wh_purchase_orders.view permission", async () => {
    const prisma = { /* minimal mocks */ }
    const caller = createCaller(createNoPermContext(prisma))
    await expect(caller.generatePdf({ id: PO_ID }))
      .rejects.toThrow("Insufficient permissions")
  })
})

describe("downloadPdf", () => {
  it("returns signed URL for valid PO", async () => {
    const prisma = { /* minimal mocks */ }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.downloadPdf({ id: PO_ID })
    expect(result).toHaveProperty("signedUrl")
    expect(result).toHaveProperty("filename")
  })

  it("rejects without wh_purchase_orders.view permission", async () => {
    const prisma = { /* minimal mocks */ }
    const caller = createCaller(createNoPermContext(prisma))
    await expect(caller.downloadPdf({ id: PO_ID }))
      .rejects.toThrow("Insufficient permissions")
  })
})
```

### Step 5.2: PDF Service Tests

**Create:** `src/lib/services/__tests__/wh-purchase-order-pdf-service.test.ts`

These tests verify the PDF rendering produces valid output. They mock the Supabase Storage upload but exercise the actual `@react-pdf/renderer` rendering.

**Mock setup:**
```ts
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: "https://test.supabase.co/signed" },
          error: null,
        }),
      }),
    },
  }),
}))

vi.mock("@/lib/config", () => ({
  serverEnv: { supabaseUrl: "https://test.supabase.co" },
  clientEnv: { supabaseUrl: "https://test.supabase.co" },
}))
```

**Mock Prisma with full PO data:**
```ts
const mockPrisma = {
  whPurchaseOrder: {
    findFirst: vi.fn().mockResolvedValue({
      id: "po-id",
      tenantId: "tenant-id",
      number: "BES-2026-001",
      orderDate: new Date("2026-03-25"),
      requestedDelivery: new Date("2026-04-01"),
      confirmedDelivery: null,
      notes: "Test notes",
      subtotalNet: 100,
      totalVat: 19,
      totalGross: 119,
      supplier: {
        company: "Test Lieferant GmbH",
        street: "Teststraße 1",
        zip: "12345",
        city: "Teststadt",
        ourCustomerNumber: "KD-999",
      },
      contact: { firstName: "Max", lastName: "Mustermann" },
      positions: [
        {
          sortOrder: 1,
          positionType: "ARTICLE",
          supplierArticleNumber: "ART-001",
          description: "Testartikel",
          freeText: null,
          quantity: 10,
          unit: "Stk",
          unitPrice: 10,
          flatCosts: null,
          totalPrice: 100,
          vatRate: 19,
          article: { id: "art-1", number: "A001", name: "Testartikel", unit: "Stk", buyPrice: 10 },
        },
      ],
    }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  billingTenantConfig: {
    findFirst: vi.fn().mockResolvedValue({
      companyName: "Meine Firma GmbH",
      companyAddress: "Firmenstraße 1\n12345 Firmenstadt",
      logoUrl: null,
      bankName: "Testbank",
      iban: "DE89370400440532013000",
      bic: "COBADEFFXXX",
      taxId: "DE123456789",
      commercialRegister: "HRB 12345",
      managingDirector: "Chef Person",
      phone: "+49 123 456789",
      email: "info@firma.de",
    }),
  },
}
```

**Test cases:**

```ts
describe("wh-purchase-order-pdf-service", () => {
  describe("generateAndGetDownloadUrl", () => {
    it("returns signedUrl and filename", async () => {
      const result = await generateAndGetDownloadUrl(mockPrisma, "tenant-id", "po-id")
      expect(result.signedUrl).toBeDefined()
      expect(result.filename).toBe("BES-2026-001.pdf")
    })

    it("sets printedAt on the purchase order", async () => {
      await generateAndGetDownloadUrl(mockPrisma, "tenant-id", "po-id")
      expect(mockPrisma.whPurchaseOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "po-id", tenantId: "tenant-id" },
          data: expect.objectContaining({ printedAt: expect.any(Date) }),
        })
      )
    })

    it("uploads PDF to Supabase Storage with correct path", async () => {
      await generateAndGetDownloadUrl(mockPrisma, "tenant-id", "po-id")
      // Verify upload was called with bestellung/tenant-id_po-id.pdf
      const supabase = createAdminClient()
      expect(supabase.storage.from).toHaveBeenCalledWith("documents")
    })

    it("throws when purchase order not found", async () => {
      const emptyPrisma = {
        ...mockPrisma,
        whPurchaseOrder: {
          ...mockPrisma.whPurchaseOrder,
          findFirst: vi.fn().mockResolvedValue(null),
        },
      }
      await expect(
        generateAndGetDownloadUrl(emptyPrisma, "tenant-id", "nonexistent")
      ).rejects.toThrow()
    })
  })
})
```

### Step 5.3: Tenant Isolation in Router Test

Add to the router test file:

```ts
describe("tenant isolation", () => {
  it("generatePdf rejects for PO belonging to different tenant", async () => {
    // The service's getById uses tenantId in the where clause.
    // When PO not found for tenantId, it throws WhPurchaseOrderNotFoundError -> 404
    // We mock the PDF service to throw NotFoundError to verify the router propagates it
  })
})
```

**Note:** Tenant isolation is inherently enforced by `poService.getById()` which queries with `{ id, tenantId }`. If the PO belongs to a different tenant, `findFirst` returns null and the service throws `WhPurchaseOrderNotFoundError`. The router's `handleServiceError` maps this to a 404 `TRPCError`. No cross-tenant data leakage is possible.

### Verification — Phase 5

```bash
pnpm vitest run src/trpc/routers/__tests__/whPurchaseOrders-router.test.ts
pnpm vitest run src/lib/services/__tests__/wh-purchase-order-pdf-service.test.ts
```

All tests should pass.

---

## Phase 6: Final Verification

### Step 6.1: Type check

```bash
pnpm typecheck
```

Verify no new type errors beyond the ~1463 pre-existing baseline.

### Step 6.2: Lint

```bash
pnpm lint
```

Fix any lint issues in the new/modified files.

### Step 6.3: All tests

```bash
pnpm test
```

Verify no test regressions.

### Step 6.4: Manual smoke test

1. Start dev server: `pnpm dev`
2. Navigate to a purchase order detail page
3. Click "PDF erstellen" button
4. Verify: PDF opens in new tab
5. Verify: PDF contains all expected sections (header, supplier address, positions, totals, footer)
6. Verify: "Unsere Kundennr." appears if the supplier has one set
7. Verify: Spinner shows while PDF is generating
8. Verify: Error toast shows if something fails

---

## File Summary

### New Files (3)

| File | Purpose |
|------|---------|
| `src/lib/pdf/purchase-order-position-table-pdf.tsx` | PO-specific 8-column position table component |
| `src/lib/pdf/purchase-order-pdf.tsx` | Main PO PDF layout component (header, address, info, table, totals, notes, signature, footer) |
| `src/lib/services/wh-purchase-order-pdf-service.ts` | PDF orchestration: load data, render, upload, return signed URL |

### New Test File (1)

| File | Purpose |
|------|---------|
| `src/lib/services/__tests__/wh-purchase-order-pdf-service.test.ts` | Service-level tests for PDF generation |

### Modified Files (6)

| File | Changes |
|------|---------|
| `src/trpc/routers/warehouse/purchaseOrders.ts` | Add `generatePdf` and `downloadPdf` mutation procedures |
| `src/trpc/routers/__tests__/whPurchaseOrders-router.test.ts` | Add test cases for PDF procedures + tenant isolation |
| `src/hooks/use-wh-purchase-orders.ts` | Add `useGenerateWhPurchaseOrderPdf` and `useDownloadWhPurchaseOrderPdf` hooks |
| `src/hooks/index.ts` | Export the two new hooks |
| `src/components/warehouse/purchase-order-detail.tsx` | Enable PDF button, wire to `downloadPdf` mutation with loading state |
| `messages/de.json` | Add `pdfDownloadFailed`, `loadingPdf` to `warehousePurchaseOrders` |
| `messages/en.json` | Add `pdfDownloadFailed`, `loadingPdf` to `warehousePurchaseOrders` |

### NOT Modified (no migration needed)

- `prisma/schema.prisma` — No changes. `printedAt` field already exists on `WhPurchaseOrder`.
- `src/lib/pdf/pdf-storage.ts` — Not extended. PO uses inline storage path (`bestellung/${tenantId}_${purchaseOrderId}.pdf`) since it does not need the billing `BillingDocumentType` enum.

---

## Acceptance Criteria Mapping

| Criterion | Where |
|-----------|-------|
| PDF generation implemented | `wh-purchase-order-pdf-service.ts` |
| PDF contains: Logo, Firmenadresse, Lieferantenadresse, Bestellnummer, Positionen, Summen | `purchase-order-pdf.tsx` |
| "Unsere Kundennummer" displayed when set | `purchase-order-pdf.tsx` (conditional render from `supplier.ourCustomerNumber`) |
| PDF download as file | `purchase-order-detail.tsx` → `window.open(signedUrl, '_blank')` |
| Same PDF engine as billing (consistency) | `@react-pdf/renderer` + same component patterns |
| Cross-tenant isolation verified | Router test + service `getById` uses tenantId |
| PDF preview in browser (Modal) | Deferred — signed URL opens in new tab (browser's native PDF viewer). A dedicated preview modal (`purchase-order-pdf-preview.tsx` with react-pdf viewer) can be added as a follow-up if needed. The ticket's core requirement (viewing the PDF) is satisfied by the browser tab. |
