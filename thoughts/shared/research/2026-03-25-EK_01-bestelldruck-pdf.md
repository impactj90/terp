# Research: EK_01 Bestelldruck (Purchase Order PDF)

**Date:** 2026-03-25
**Ticket:** `thoughts/shared/tickets/orgAuftrag/TICKET_EK_01_BESTELLDRUCK_PDF.md`

---

## 1. Existing PDF Generation Engine (TICKET_140)

### Architecture

The billing document PDF system uses **@react-pdf/renderer** (v4.3.2) with React components rendered server-side to PDF buffers. The architecture is:

```
tRPC Router (billing/documents.ts)
  -> billing-document-pdf-service.ts (orchestration: load data, render, upload, sign URL)
    -> React PDF Components (src/lib/pdf/*.tsx)
      -> @react-pdf/renderer renderToBuffer()
    -> Supabase Storage (private "documents" bucket)
```

### Key Service File

**`src/lib/services/billing-document-pdf-service.ts`**

Three main functions:
- `generateAndStorePdf(prisma, tenantId, documentId)` -- renders PDF, uploads to Supabase Storage, saves storagePath on document
- `getSignedDownloadUrl(prisma, tenantId, documentId)` -- creates temporary signed URL (60s expiry) for download
- `generateAndGetDownloadUrl(prisma, tenantId, documentId)` -- generates if needed, then returns signed URL

Pattern:
1. Load document with positions, address, tenant config
2. Create React element with `React.createElement(BillingDocumentPdf, props)`
3. Call `renderToBuffer(element)` to get PDF buffer
4. Upload buffer to Supabase Storage (`supabase.storage.from("documents").upload(...)`)
5. Store the storagePath on the document record
6. For download: create signed URL and fix internal/public URL mismatch

**Important detail:** The signed URL replacement handles Docker internal URLs vs browser-facing URLs:
```ts
const internalUrl = serverEnv.supabaseUrl
const publicUrl = clientEnv.supabaseUrl
if (internalUrl && publicUrl && internalUrl !== publicUrl) {
  signedUrl = signedUrl.replace(internalUrl, publicUrl)
}
```

### PDF React Components (src/lib/pdf/)

| File | Component | Purpose | Reusable? |
|------|-----------|---------|-----------|
| `billing-document-pdf.tsx` | `BillingDocumentPdf` | Main document layout (A4, margins, sections) | **Template** -- need PO-specific version |
| `position-table-pdf.tsx` | `PositionTablePdf` | Positions table (Pos, Description, Qty, Unit, Price, Total) | **Partially** -- columns differ for PO (needs Art.-Nr. Lieferant, Fixkosten) |
| `totals-summary-pdf.tsx` | `TotalsSummaryPdf` | Netto / MwSt / Brutto summary block | **Fully reusable** |
| `fusszeile-pdf.tsx` | `FusszeilePdf` | Bottom footer with company data, bank, tax info | **Fully reusable** |
| `rich-text-pdf.tsx` | `RichTextPdf` | Renders HTML (bold/italic) from Tiptap editor | Not needed for PO (PO has plain text notes) |
| `pdf-storage.ts` | `getStoragePath()` | Generates storage path by document type | **Need extension** for PO type |

### Position Table Columns (billing)

Current billing `PositionTablePdf` columns: Pos (6%), Beschreibung (40%), Menge (10%), Einheit (8%), Einzelpreis (16%), Gesamt (20%)

PO ticket requires: Pos, Art.-Nr. (Lieferant), Bezeichnung, Menge, Einheit, Einzelpreis, Fixkosten, Gesamtpreis -- **8 columns instead of 6**. Need a new `PurchaseOrderPositionTablePdf` component.

### Styles / Constants

- Page: A4, paddingTop 20mm, paddingBottom 15mm, paddingHorizontal 25mm
- Font: Helvetica (base), Helvetica-Bold
- Base font size: 10pt
- 1mm = 2.835pt

---

## 2. Purchase Order Data Model

### Prisma Schema

**`WhPurchaseOrder`** (`prisma/schema.prisma:4306`)

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| tenantId | UUID | FK to Tenant |
| number | VarChar(50) | Unique per tenant |
| supplierId | UUID | FK to CrmAddress |
| contactId | UUID? | FK to CrmContact |
| inquiryId | UUID? | FK to CrmInquiry |
| status | WhPurchaseOrderStatus | DRAFT, ORDERED, PARTIALLY_RECEIVED, RECEIVED, CANCELLED |
| orderDate | DateTime? | Set when sent |
| requestedDelivery | DateTime? | |
| confirmedDelivery | DateTime? | |
| orderMethod | WhPurchaseOrderMethod? | PHONE, EMAIL, FAX, PRINT |
| orderMethodNote | String? | |
| notes | String? | |
| subtotalNet | Float | Calculated from positions |
| totalVat | Float | Calculated from positions |
| totalGross | Float | Calculated from positions |
| printedAt | DateTime? | **Already exists** -- can be set when PDF is generated |
| createdAt | DateTime | |
| createdById | UUID? | |

Relations: `supplier: CrmAddress`, `contact: CrmContact?`, `positions: WhPurchaseOrderPosition[]`

**Note:** There is NO `pdfUrl` field on WhPurchaseOrder. The billing model has `pdfUrl` but PO does not. Decision needed:
- Option A: Add `pdfUrl` field to WhPurchaseOrder (requires migration)
- Option B: Generate PDF on-the-fly without storing (simpler, no migration)
- **Recommended: Option B** -- generate on-the-fly. PO PDFs are lightweight and can be regenerated. Use `printedAt` to track when it was first generated.

**`WhPurchaseOrderPosition`** (`prisma/schema.prisma:4343`)

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| purchaseOrderId | UUID | FK to WhPurchaseOrder |
| sortOrder | Int | Position number |
| positionType | WhPurchaseOrderPositionType | ARTICLE, FREETEXT, TEXT |
| articleId | UUID? | FK to WhArticle (for ARTICLE type) |
| freeText | String? | For FREETEXT/TEXT types |
| supplierArticleNumber | VarChar(100)? | Lieferanten-Artikelnummer |
| description | String? | |
| quantity | Float? | |
| receivedQuantity | Float | Default 0 |
| unit | VarChar(20)? | |
| unitPrice | Float? | |
| flatCosts | Float? | Nebenkosten |
| totalPrice | Float? | |
| vatRate | Float | Default 19.0 |
| requestedDelivery | DateTime? | |
| confirmedDelivery | DateTime? | |

Relations: `article: WhArticle?`

---

## 3. Purchase Order Repository

**`src/lib/services/wh-purchase-order-repository.ts`**

The `findById` includes full relations needed for PDF:
```ts
include: {
  supplier: true,          // Full CrmAddress (includes ourCustomerNumber, street, zip, city, etc.)
  contact: true,           // Full CrmContact (firstName, lastName)
  inquiry: { select: { id, number, title } },
  positions: {
    include: {
      article: { select: { id, number, name, unit, buyPrice } },
    },
    orderBy: { sortOrder: "asc" },
  },
}
```

**Key:** `supplier: true` returns the full CrmAddress record, which includes `ourCustomerNumber`, `company`, `street`, `zip`, `city`, `country`, `phone`, `fax`, `email`.

---

## 4. Purchase Order Service

**`src/lib/services/wh-purchase-order-service.ts`**

- `getById(prisma, tenantId, id)` -- returns full PO with positions and supplier. Throws `WhPurchaseOrderNotFoundError` if not found.
- Error classes: `WhPurchaseOrderNotFoundError`, `WhPurchaseOrderValidationError`, `WhPurchaseOrderConflictError`

The PDF service should:
1. Call `poService.getById()` to load the PO with all relations
2. Load tenant config via `billingTenantConfigRepo.findByTenantId()`
3. Render the PDF component

---

## 5. Purchase Order tRPC Router

**`src/trpc/routers/warehouse/purchaseOrders.ts`**

Current procedures:
- `list`, `getById`, `create`, `update`, `delete`, `sendOrder`, `cancel`, `reorderSuggestions`, `createFromSuggestions`
- Sub-router: `positions` (list, add, update, delete)

Permission constants:
- `PO_VIEW = permissionIdByKey("wh_purchase_orders.view")`
- `PO_CREATE`, `PO_EDIT`, `PO_DELETE`, `PO_ORDER`

Base procedure: `whProcedure = tenantProcedure.use(requireModule("warehouse"))`

**New procedures to add:**
```ts
generatePdf: whProcedure
  .use(requirePermission(PO_VIEW))
  .input(z.object({ id: z.string().uuid() }))
  .mutation(...)

downloadPdf: whProcedure
  .use(requirePermission(PO_VIEW))
  .input(z.object({ id: z.string().uuid() }))
  .mutation(...)
```

Pattern matches billing `generatePdf` / `downloadPdf` procedures.

---

## 6. Purchase Order Detail UI

**`src/components/warehouse/purchase-order-detail.tsx`**

The PDF button **already exists** but is disabled:
```tsx
<Button variant="outline" size="sm" disabled>
  <FileText className="h-4 w-4 mr-2" />
  {t('actionGeneratePdf')}
</Button>
```

This button needs to be:
1. Enabled (remove `disabled`)
2. Wired to the `downloadPdf` mutation
3. Optionally split into "Download PDF" + "Preview PDF" buttons

The supplier type cast already includes `ourCustomerNumber`:
```tsx
const supplier = order.supplier as {
  id: string
  company?: string | null
  number?: string | null
  ourCustomerNumber?: string | null
} | null
```

And it's already displayed:
```tsx
{supplier?.ourCustomerNumber && (
  <DetailRow
    label={t('detailOurCustomerNumber')}
    value={supplier.ourCustomerNumber}
  />
)}
```

### How billing does PDF download (pattern to follow)

From `src/components/billing/document-editor.tsx`:
```tsx
const downloadPdfMutation = useDownloadBillingDocumentPdf()
// ...
<Button
  variant="outline"
  disabled={downloadPdfMutation.isPending}
  onClick={async () => {
    try {
      const result = await downloadPdfMutation.mutateAsync({ id: doc.id })
      if (result?.signedUrl) {
        window.open(result.signedUrl, '_blank')
      }
    } catch {
      toast.error(t('pdfDownloadFailed'))
    }
  }}
>
  <FileDown className="h-4 w-4 mr-1" />
  {downloadPdfMutation.isPending ? t('loadingPdf') : t('pdf')}
</Button>
```

---

## 7. CRM_06 "Unsere Kundennummer"

**Field location:** `CrmAddress.ourCustomerNumber` (`prisma/schema.prisma:304`)
```prisma
ourCustomerNumber String? @map("our_customer_number") @db.VarChar(50)
```

**Data access:** Already available through the `supplier: true` include in `findById`. No additional query needed.

**PDF usage:** Should appear in the document header info block, after the supplier address:
```
Unsere Kundennr.: <value>
```

---

## 8. Tenant Settings (Logo, Company Data)

**Model:** `BillingTenantConfig` (`prisma/schema.prisma:788`)

| Field | Type |
|-------|------|
| companyName | VarChar(255)? |
| companyAddress | String? (multiline) |
| companyStreet | VarChar(255)? |
| companyZip | VarChar(20)? |
| companyCity | VarChar(100)? |
| companyCountry | VarChar(10)? |
| logoUrl | String? |
| bankName | VarChar(255)? |
| iban | VarChar(34)? |
| bic | VarChar(11)? |
| taxId | VarChar(50)? |
| commercialRegister | VarChar(255)? |
| managingDirector | VarChar(255)? |
| phone | VarChar(50)? |
| email | VarChar(255)? |

**Repository:** `src/lib/services/billing-tenant-config-repository.ts`
```ts
findByTenantId(prisma, tenantId) // returns BillingTenantConfig | null
```

This is the same config used by billing PDFs. Reuse directly.

---

## 9. Hooks

**`src/hooks/use-wh-purchase-orders.ts`**

Current hooks: `useWhPurchaseOrders`, `useWhPurchaseOrder`, `useWhReorderSuggestions`, `useWhPOPositions`, `useCreateWhPurchaseOrder`, `useUpdateWhPurchaseOrder`, `useDeleteWhPurchaseOrder`, `useSendWhPurchaseOrder`, `useCancelWhPurchaseOrder`, `useCreateWhPOFromSuggestions`, `useAddWhPOPosition`, `useUpdateWhPOPosition`, `useDeleteWhPOPosition`

**New hooks to add:**
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

Pattern matches `useDownloadBillingDocumentPdf()` from `src/hooks/use-billing-documents.ts`.

---

## 10. i18n Translations

**Existing keys** in `warehousePurchaseOrders` namespace (both `de.json` and `en.json`):
- `"actionGeneratePdf": "PDF erstellen"` -- already exists
- `"detailOurCustomerNumber": "Unsere Kundennr."` -- already exists

**New keys needed:**
```json
"pdfDownloadFailed": "PDF-Download fehlgeschlagen",
"loadingPdf": "Lade PDF...",
"actionDownloadPdf": "PDF herunterladen",
"actionPreviewPdf": "PDF Vorschau"
```

---

## 11. Storage Approach Decision

**Option A: Store in Supabase Storage (like billing)**
- Requires adding `pdfUrl` field to WhPurchaseOrder (migration)
- PDF generated once and stored
- Download via signed URL
- Pro: Consistent with billing pattern
- Con: PO data may change (positions, notes) -- stored PDF becomes stale

**Option B: Generate on-the-fly (recommended)**
- No migration needed
- Generate PDF buffer on every request
- Return as base64 or generate + upload + return signed URL each time
- Pro: Always current data, simpler
- Con: Slightly slower per request

**Recommended: Hybrid approach**
- Generate on-the-fly and upload to storage each time (upsert)
- Return signed URL for download
- Set `printedAt` on first generation
- This matches the billing pattern without needing a `pdfUrl` field (or add it)

Actually, looking more closely: billing documents store the `pdfUrl` path. For consistency, we should **add a `pdfUrl` field** to WhPurchaseOrder and follow the exact same pattern. This requires a small migration.

---

## 12. Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `src/lib/pdf/purchase-order-pdf.tsx` | Main PO PDF React component |
| `src/lib/pdf/purchase-order-position-table-pdf.tsx` | PO position table (8 columns) |
| `src/lib/services/wh-purchase-order-pdf-service.ts` | PDF generation service |

### Files to Modify

| File | Changes |
|------|---------|
| `src/trpc/routers/warehouse/purchaseOrders.ts` | Add `generatePdf` and `downloadPdf` procedures |
| `src/hooks/use-wh-purchase-orders.ts` | Add PDF hooks |
| `src/components/warehouse/purchase-order-detail.tsx` | Enable PDF button, wire to mutation |
| `src/lib/pdf/pdf-storage.ts` | Add PO storage path (or use inline path) |
| `messages/de.json` | Add PDF-related translation keys |
| `messages/en.json` | Add PDF-related translation keys |

### Optional Migration

If storing PDF URL: Add `pdfUrl` column to `wh_purchase_orders` table.

---

## 13. PDF Component Design

### `PurchaseOrderPdf` Props

```ts
interface PurchaseOrderPdfProps {
  order: {
    id: string
    number: string
    orderDate: Date | string | null
    requestedDelivery: Date | string | null
    confirmedDelivery: Date | string | null
    orderMethod: string | null
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
  }
  contact: {
    firstName: string | null
    lastName: string | null
  } | null
  positions: Array<{
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
  }>
  tenantConfig: {
    companyName: string | null
    companyAddress: string | null
    logoUrl: string | null
    bankName: string | null
    iban: string | null
    bic: string | null
    taxId: string | null
    commercialRegister: string | null
    managingDirector: string | null
    phone: string | null
    email: string | null
  } | null
}
```

### PDF Layout Structure

```
[Logo top-right]
[Sender line: company name + address]

[Supplier address block]
  Company
  Street
  ZIP City

BESTELLUNG

Nr.: BES-2026-001
Bestelldatum: 25.03.2026
Gewünschter Liefertermin: 01.04.2026
Bestätigter Liefertermin: 03.04.2026        (if set)
Unsere Kundennr.: KD-12345                  (if set)
Ansprechpartner: Max Mustermann             (if set)

[Position Table - 8 columns]
Pos | Art.-Nr. (Lief.) | Bezeichnung | Menge | Einheit | Einzelpreis | Fixkosten | Gesamt

[Totals Summary - reuse TotalsSummaryPdf]
                                                    Netto   1.234,56 EUR
                                                    MwSt      234,57 EUR
                                                    Brutto  1.469,13 EUR

[Notes section if present]
Bemerkungen:
<notes text>

[Signature line]
_________________________________
Ort, Datum                Unterschrift

[Footer - reuse FusszeilePdf]
Company | Bank | Tax info
```

### Reusable Components

- **`TotalsSummaryPdf`** -- reuse as-is (Netto/MwSt/Brutto)
- **`FusszeilePdf`** -- reuse as-is (company footer)
- **`PositionTablePdf`** -- NOT reusable (different columns needed for PO)
- **`BillingDocumentPdf`** -- NOT reusable (different layout for PO header/info)

---

## 14. Service Implementation Pattern

```ts
// src/lib/services/wh-purchase-order-pdf-service.ts

import { renderToBuffer } from "@react-pdf/renderer"
import { createAdminClient } from "@/lib/supabase/admin"
import { clientEnv, serverEnv } from "@/lib/config"
import * as poService from "./wh-purchase-order-service"
import * as tenantConfigRepo from "./billing-tenant-config-repository"
import React from "react"
import { PurchaseOrderPdf } from "@/lib/pdf/purchase-order-pdf"

const BUCKET = "documents"
const SIGNED_URL_EXPIRY_SECONDS = 300  // 5 min for PO

export async function generatePdf(prisma, tenantId, purchaseOrderId) {
  // 1. Load PO with all relations (supplier, contact, positions)
  const order = await poService.getById(prisma, tenantId, purchaseOrderId)

  // 2. Load tenant config
  const tenantConfig = await tenantConfigRepo.findByTenantId(prisma, tenantId)

  // 3. Render PDF
  const element = React.createElement(PurchaseOrderPdf, {
    order: { ... },
    supplier: order.supplier,
    contact: order.contact,
    positions: order.positions,
    tenantConfig,
  })
  const buffer = await renderToBuffer(element)

  // 4. Upload to Supabase Storage
  const storagePath = `bestellung/${tenantId}_${purchaseOrderId}.pdf`
  const supabase = createAdminClient()
  await supabase.storage.from(BUCKET).upload(storagePath, Buffer.from(buffer), {
    contentType: "application/pdf",
    upsert: true,
  })

  // 5. Update printedAt
  await prisma.whPurchaseOrder.updateMany({
    where: { id: purchaseOrderId, tenantId },
    data: { printedAt: new Date() },
  })

  return storagePath
}

export async function getSignedDownloadUrl(prisma, tenantId, purchaseOrderId) {
  // Generate fresh PDF each time
  const storagePath = await generatePdf(prisma, tenantId, purchaseOrderId)

  const supabase = createAdminClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS)

  // Fix internal/public URL mismatch
  let signedUrl = data.signedUrl
  const internalUrl = serverEnv.supabaseUrl
  const publicUrl = clientEnv.supabaseUrl
  if (internalUrl && publicUrl && internalUrl !== publicUrl) {
    signedUrl = signedUrl.replace(internalUrl, publicUrl)
  }

  const order = await poService.getById(prisma, tenantId, purchaseOrderId)
  const filename = `${order.number.replace(/[/\\]/g, "_")}.pdf`

  return { signedUrl, filename }
}
```

---

## 15. Summary of Reuse

| What | Reuse Level | Notes |
|------|-------------|-------|
| @react-pdf/renderer | 100% | Same dependency |
| `renderToBuffer()` pattern | 100% | Same approach |
| Supabase Storage upload | 100% | Same bucket, same pattern |
| Signed URL generation | 100% | Same pattern with URL fix |
| `TotalsSummaryPdf` | 100% | Direct reuse |
| `FusszeilePdf` | 100% | Direct reuse |
| `BillingTenantConfig` loading | 100% | Same repository |
| Page styles (A4, margins) | 100% | Same constants |
| `PositionTablePdf` | 0% | Need new component (different columns) |
| `BillingDocumentPdf` | 0% | Need new component (different header/layout) |
| tRPC procedure pattern | 100% | Same mutation structure |
| Hook pattern | 100% | Same useMutation wrapper |
| UI download pattern | 100% | Same window.open(signedUrl) |
