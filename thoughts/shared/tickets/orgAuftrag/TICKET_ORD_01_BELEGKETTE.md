# ORD_01 — Belege — Belegkette

| Field | Value |
|-------|-------|
| **Module** | Billing |
| **Dependencies** | CRM_01 (Addresses, Contacts), CRM_03 (Inquiries) |
| **Complexity** | L |
| **New Models** | `BillingDocument`, `BillingDocumentPosition` |

---

## Goal

Implement the complete document chain (Belegkette) from offer to invoice/credit note. This is the core Orders/Billing feature — the full lifecycle of commercial documents. Supports seven document types (Offer, Order Confirmation, Delivery Note, Service Note, Return Delivery, Invoice, Credit Note), with positions (articles, free positions, text lines, page breaks, subtotals), PDF generation, printing workflow (immutable after print), and document progression (Fortführen). Integrates with CRM addresses, inquiries, and the existing Terp order system. Replaces ZMI orgAuftrag section 4.

---

## Prisma Models

### BillingDocument

```prisma
enum BillingDocumentType {
  OFFER
  ORDER_CONFIRMATION
  DELIVERY_NOTE
  SERVICE_NOTE         // Leistungsschein / Abnahmeprotokoll
  RETURN_DELIVERY
  INVOICE
  CREDIT_NOTE

  @@map("billing_document_type")
}

enum BillingDocumentStatus {
  DRAFT              // In Arbeit — editable
  PRINTED            // Aktuell — printed, immutable
  PARTIALLY_FORWARDED // Teilweise fortgeführt
  FORWARDED          // Fortgeführt/Abgeschlossen
  CANCELLED          // Storniert

  @@map("billing_document_status")
}

model BillingDocument {
  id                  String                @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId            String                @map("tenant_id") @db.Uuid
  number              String                // Auto-generated via NumberSequence per type
  type                BillingDocumentType
  status              BillingDocumentStatus  @default(DRAFT)

  // Customer / Address
  addressId           String                @map("address_id") @db.Uuid
  contactId           String?               @map("contact_id") @db.Uuid
  deliveryAddressId   String?               @map("delivery_address_id") @db.Uuid  // Lieferadresse
  invoiceAddressId    String?               @map("invoice_address_id") @db.Uuid   // Rechnungsadresse (can differ)

  // Links
  inquiryId           String?               @map("inquiry_id") @db.Uuid   // Linked Anfrage (CRM_03)
  orderId             String?               @map("order_id") @db.Uuid     // Linked Terp Order (time tracking)
  parentDocumentId    String?               @map("parent_document_id") @db.Uuid // Fortgeführt aus

  // Dates
  orderDate           DateTime?             @map("order_date") @db.Timestamptz(6)  // Auftragsdatum
  documentDate        DateTime              @default(now()) @map("document_date") @db.Timestamptz(6) // Belegdatum
  deliveryDate        DateTime?             @map("delivery_date") @db.Timestamptz(6) // Gewünschter Liefertermin

  // Terms & Conditions
  deliveryType        String?               @map("delivery_type")       // Lieferart
  deliveryTerms       String?               @map("delivery_terms")      // Lieferbedingungen
  paymentTermDays     Int?                  @map("payment_term_days")   // Zahlungsziel Tage
  discountPercent     Float?                @map("discount_percent")    // Skonto %
  discountDays        Int?                  @map("discount_days")       // Skonto Tage
  discountPercent2    Float?                @map("discount_percent_2")  // 2. Skonto-Stufe %
  discountDays2       Int?                  @map("discount_days_2")     // 2. Skonto-Stufe Tage
  shippingCostNet     Float?                @map("shipping_cost_net")   // Versandkosten netto
  shippingCostVatRate Float?                @map("shipping_cost_vat_rate") // MwSt-Satz Versand

  // Totals (computed, stored for performance)
  subtotalNet         Float                 @default(0) @map("subtotal_net")
  totalVat            Float                 @default(0) @map("total_vat")
  totalGross          Float                 @default(0) @map("total_gross")

  // State
  notes               String?
  internalNotes       String?               @map("internal_notes")
  printedAt           DateTime?             @map("printed_at") @db.Timestamptz(6)
  printedById         String?               @map("printed_by_id") @db.Uuid
  createdAt           DateTime              @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime              @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById         String?               @map("created_by_id") @db.Uuid

  tenant           Tenant                   @relation(fields: [tenantId], references: [id])
  address          CrmAddress               @relation(fields: [addressId], references: [id])
  contact          CrmContact?              @relation(fields: [contactId], references: [id], onDelete: SetNull)
  deliveryAddress  CrmAddress?              @relation("DeliveryAddress", fields: [deliveryAddressId], references: [id], onDelete: SetNull)
  invoiceAddress   CrmAddress?              @relation("InvoiceAddress", fields: [invoiceAddressId], references: [id], onDelete: SetNull)
  inquiry          CrmInquiry?              @relation(fields: [inquiryId], references: [id], onDelete: SetNull)
  order            Order?                   @relation(fields: [orderId], references: [id], onDelete: SetNull)
  parentDocument   BillingDocument?         @relation("DocumentChain", fields: [parentDocumentId], references: [id], onDelete: SetNull)
  childDocuments   BillingDocument[]        @relation("DocumentChain")
  positions        BillingDocumentPosition[]

  @@unique([tenantId, number])
  @@index([tenantId, type])
  @@index([tenantId, status])
  @@index([tenantId, addressId])
  @@index([tenantId, inquiryId])
  @@index([tenantId, parentDocumentId])
  @@index([tenantId, documentDate])
  @@map("billing_documents")
}
```

### BillingDocumentPosition

```prisma
enum BillingPositionType {
  ARTICLE       // From article catalog (WH_01)
  FREE          // Free-text position with price
  TEXT          // Description-only line (no price)
  PAGE_BREAK    // Page separator for PDF
  SUBTOTAL      // Subtotal display line

  @@map("billing_position_type")
}

enum BillingPriceType {
  STANDARD      // Standardpreis
  ESTIMATE      // Richtpreis
  BY_EFFORT     // Nach Aufwand

  @@map("billing_price_type")
}

model BillingDocumentPosition {
  id              String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  documentId      String              @map("document_id") @db.Uuid
  sortOrder       Int                 @map("sort_order")
  type            BillingPositionType @default(FREE)
  articleId       String?             @map("article_id") @db.Uuid  // Link to WhArticle (WH_01)
  articleNumber   String?             @map("article_number")
  description     String?
  quantity        Float?
  unit            String?             // "Stk", "Std", "kg", etc.
  unitPrice       Float?              @map("unit_price")     // Einzelpreis netto
  flatCosts       Float?              @map("flat_costs")     // Pauschalkosten
  totalPrice      Float?              @map("total_price")    // = quantity * unitPrice + flatCosts
  priceType       BillingPriceType?   @map("price_type")
  vatRate         Float?              @map("vat_rate")       // MwSt-Satz in % (e.g. 19.0)
  deliveryDate    DateTime?           @map("delivery_date") @db.Timestamptz(6)  // Liefertermin gewünscht
  confirmedDate   DateTime?           @map("confirmed_date") @db.Timestamptz(6) // Liefertermin bestätigt
  createdAt       DateTime            @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime            @updatedAt @map("updated_at") @db.Timestamptz(6)

  document BillingDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@index([documentId, sortOrder])
  @@map("billing_document_positions")
}
```

---

## Permissions

Add to `permission-catalog.ts`:

```ts
p("billing_documents.view", "billing_documents", "view", "View billing documents"),
p("billing_documents.create", "billing_documents", "create", "Create billing documents"),
p("billing_documents.edit", "billing_documents", "edit", "Edit billing documents"),
p("billing_documents.delete", "billing_documents", "delete", "Delete billing documents"),
p("billing_documents.print", "billing_documents", "print", "Print/finalize billing documents"),
```

---

## tRPC Router

**File:** `src/trpc/routers/billing/documents.ts`

All procedures use `tenantProcedure.use(requireModule("billing"))`.

### Document Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `list` | query | `billing_documents.view` | `{ type?, status?, addressId?, inquiryId?, search?, dateFrom?, dateTo?, page, pageSize }` | Paginated list with filters |
| `getById` | query | `billing_documents.view` | `{ id }` | Full document with positions, address, contact |
| `create` | mutation | `billing_documents.create` | Header fields | Creates document in DRAFT status, auto-generates number |
| `update` | mutation | `billing_documents.edit` | `{ id, ...fields }` | Only when status=DRAFT |
| `delete` | mutation | `billing_documents.delete` | `{ id }` | Only when status=DRAFT |
| `print` | mutation | `billing_documents.print` | `{ id }` | Sets status=PRINTED, printedAt. Returns PDF URL. Makes document immutable. |
| `forward` | mutation | `billing_documents.create` | `{ id, targetType }` | Creates new document from existing (Belegkette). Copies positions. |
| `cancel` | mutation | `billing_documents.edit` | `{ id, reason? }` | Sets status=CANCELLED |
| `duplicate` | mutation | `billing_documents.create` | `{ id }` | Creates a DRAFT copy of any document |
| `generatePdf` | query | `billing_documents.view` | `{ id }` | Returns PDF without changing status (preview) |

### Position Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `positions.list` | query | `billing_documents.view` | `{ documentId }` | All positions for a document |
| `positions.add` | mutation | `billing_documents.edit` | `{ documentId, type, ...fields }` | Add position (only DRAFT docs) |
| `positions.update` | mutation | `billing_documents.edit` | `{ id, ...fields }` | Update position |
| `positions.delete` | mutation | `billing_documents.edit` | `{ id }` | Remove position |
| `positions.reorder` | mutation | `billing_documents.edit` | `{ documentId, positionIds: string[] }` | Reorder positions by providing new sort order |

### Document Forwarding Rules (Belegkette)

```ts
const FORWARDING_RULES: Record<BillingDocumentType, BillingDocumentType[]> = {
  OFFER: ["ORDER_CONFIRMATION"],
  ORDER_CONFIRMATION: ["DELIVERY_NOTE", "SERVICE_NOTE"],
  DELIVERY_NOTE: ["INVOICE"],
  SERVICE_NOTE: ["INVOICE"],
  RETURN_DELIVERY: ["CREDIT_NOTE"],
  INVOICE: [],           // End of chain → triggers OP creation (ORD_03)
  CREDIT_NOTE: [],       // End of chain
}
```

### Input Schemas

```ts
const createInput = z.object({
  type: z.enum([
    "OFFER", "ORDER_CONFIRMATION", "DELIVERY_NOTE",
    "SERVICE_NOTE", "RETURN_DELIVERY", "INVOICE", "CREDIT_NOTE"
  ]),
  addressId: z.string().uuid(),
  contactId: z.string().uuid().optional(),
  deliveryAddressId: z.string().uuid().optional(),
  invoiceAddressId: z.string().uuid().optional(),
  inquiryId: z.string().uuid().optional(),
  orderDate: z.date().optional(),
  documentDate: z.date().optional(),
  deliveryDate: z.date().optional(),
  deliveryType: z.string().optional(),
  deliveryTerms: z.string().optional(),
  paymentTermDays: z.number().int().optional(),
  discountPercent: z.number().optional(),
  discountDays: z.number().int().optional(),
  discountPercent2: z.number().optional(),
  discountDays2: z.number().int().optional(),
  shippingCostNet: z.number().optional(),
  shippingCostVatRate: z.number().optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
})

const addPositionInput = z.object({
  documentId: z.string().uuid(),
  type: z.enum(["ARTICLE", "FREE", "TEXT", "PAGE_BREAK", "SUBTOTAL"]),
  articleId: z.string().uuid().optional(),
  articleNumber: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  unitPrice: z.number().optional(),
  flatCosts: z.number().optional(),
  priceType: z.enum(["STANDARD", "ESTIMATE", "BY_EFFORT"]).optional(),
  vatRate: z.number().optional(),
  deliveryDate: z.date().optional(),
  confirmedDate: z.date().optional(),
})

const forwardInput = z.object({
  id: z.string().uuid(),
  targetType: z.enum([
    "ORDER_CONFIRMATION", "DELIVERY_NOTE", "SERVICE_NOTE", "INVOICE", "CREDIT_NOTE"
  ]),
})
```

---

## Service Layer

**Files:**
- `src/lib/services/billing-document-service.ts`
- `src/lib/services/billing-document-repository.ts`
- `src/lib/services/billing-document-position-service.ts`
- `src/lib/services/billing-document-pdf-service.ts`

### Key Logic

#### Number Generation

Each document type uses a separate NumberSequence key:
- `"offer"` → prefix "A" (Angebot)
- `"order_confirmation"` → prefix "AB"
- `"delivery_note"` → prefix "L" (Lieferschein)
- `"service_note"` → prefix "LS" (Leistungsschein)
- `"return_delivery"` → prefix "R" (Rücklieferung)
- `"invoice"` → prefix "RE" (Rechnung)
- `"credit_note"` → prefix "G" (Gutschrift)

Alternative: configurable per tenant via NumberSequence prefix field.

#### Document Immutability

After `print()` is called:
- Status changes from DRAFT → PRINTED
- `printedAt` and `printedById` are set
- All mutations on document and positions are rejected (except `forward`, `cancel`)

#### Forward (Belegkette)

1. Validate source document status is PRINTED
2. Validate target type is allowed per `FORWARDING_RULES`
3. Create new document with `parentDocumentId = source.id`
4. Copy all positions from source to new document
5. Inherit address, contact, terms from source (editable on new doc)
6. Set source document status to FORWARDED (or PARTIALLY_FORWARDED if only some positions transferred)
7. If target is INVOICE → trigger open item creation (ORD_03)

#### Print → Create Terp Order

When printing an ORDER_CONFIRMATION:
1. Prompt user for activity group and target hours
2. Create a Terp `Order` record linked to the document
3. Set `document.orderId = newOrder.id`
4. Employees can then book time against this order

#### Totals Calculation

On every position add/update/delete:
- Recalculate `totalPrice` per position: `quantity * unitPrice + flatCosts`
- Recalculate document totals: `subtotalNet`, `totalVat`, `totalGross`
- Group VAT by rate for the PDF (e.g., "19% MwSt: €X, 7% MwSt: €Y")

#### PDF Generation

Use a PDF library (e.g., `@react-pdf/renderer` or `puppeteer` headless) to generate branded PDFs:
- Company letterhead from tenant settings
- Document header (type, number, dates, addresses)
- Position table with columns, subtotals, VAT breakdown
- Payment terms footer
- Store generated PDF in Supabase Storage

---

## UI Components

### Page Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/orders/documents` | `BillingDocumentsPage` | Document list with type/status filters |
| `/orders/documents/[id]` | `BillingDocumentDetailPage` | Document detail with positions |
| `/orders/documents/new` | `BillingDocumentCreatePage` | New document form |

### Component Files

All in `src/components/billing/`:

| Component | Description |
|-----------|-------------|
| `document-list.tsx` | Data table. Columns: Number, Type (badge), Customer, Date, Total, Status. Toolbar: type tabs, status filter, date range, search. |
| `document-form.tsx` | Full-page form for create/edit. Sections: Header (type, customer, dates), Terms, Positions, Notes. |
| `document-detail.tsx` | Read-only detail view for printed documents. Action bar: Forward, Cancel, Print, Duplicate, Create Order. |
| `document-position-table.tsx` | Editable table of positions. Row types: Article (autocomplete), Free text, Text line, Page break, Subtotal. Drag-to-reorder. Running total at bottom. |
| `document-position-row.tsx` | Single position row with inline editing. Article search popover. |
| `document-forward-dialog.tsx` | Dialog to select target type when forwarding. Shows allowed targets. |
| `document-print-dialog.tsx` | Confirmation dialog before printing. For ORDER_CONFIRMATION: includes activity group select and target hours. |
| `document-pdf-preview.tsx` | PDF preview in modal/iframe. |
| `document-type-badge.tsx` | Colored badge per document type |
| `document-status-badge.tsx` | Status badge with icon |
| `document-totals-summary.tsx` | Net, VAT breakdown, Gross display |

---

## Hooks

**File:** `src/hooks/use-billing-documents.ts`

```ts
export function useBillingDocuments(filters) {
  return useQuery(trpc.billing.documents.list.queryOptions(filters))
}

export function useBillingDocument(id: string) {
  return useQuery(trpc.billing.documents.getById.queryOptions({ id }))
}

export function useCreateBillingDocument() { /* ... */ }
export function useUpdateBillingDocument() { /* ... */ }
export function usePrintBillingDocument() { /* ... */ }
export function useForwardBillingDocument() { /* ... */ }
export function useAddBillingPosition() { /* ... */ }
export function useUpdateBillingPosition() { /* ... */ }
export function useDeleteBillingPosition() { /* ... */ }
export function useReorderBillingPositions() { /* ... */ }
```

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/billing-document-service.test.ts`

- `create` — generates correct number per document type
- `create` — populates payment terms from customer address defaults
- `update` — rejects when status ≠ DRAFT
- `print` — sets status to PRINTED, records printedAt
- `print` — makes document immutable (subsequent update rejected)
- `forward` — OFFER can forward to ORDER_CONFIRMATION only
- `forward` — ORDER_CONFIRMATION can forward to DELIVERY_NOTE or SERVICE_NOTE
- `forward` — DELIVERY_NOTE/SERVICE_NOTE can forward to INVOICE
- `forward` — RETURN_DELIVERY can forward to CREDIT_NOTE
- `forward` — INVOICE cannot be forwarded (end of chain)
- `forward` — copies all positions to new document
- `forward` — sets parent status to FORWARDED
- `forward` — rejects if source status ≠ PRINTED
- `cancel` — sets status to CANCELLED
- `addPosition` — recalculates document totals
- `addPosition` — rejects if document status ≠ DRAFT
- `updatePosition` — recalculates totalPrice
- `reorderPositions` — updates sortOrder for all positions

### Router Tests

**File:** `src/trpc/routers/__tests__/billingDocuments-router.test.ts`

```ts
describe("billing.documents", () => {
  it("list — requires billing_documents.view permission", async () => { })
  it("list — requires billing module enabled", async () => { })
  it("create — creates DRAFT with auto number", async () => { })
  it("print — makes document immutable", async () => { })
  it("forward — creates child document with correct type", async () => { })
  it("forward — rejects invalid type transition", async () => { })
  it("positions.add — recalculates totals", async () => { })
  it("positions.reorder — updates sort order", async () => { })
})
```

### E2E Tests

**File:** `src/e2e-browser/30-billing-documents.spec.ts`

```ts
test.describe("UC-ORD-01: Document Chain", () => {
  test("create an offer with positions", async ({ page }) => {
    // Navigate to /orders/documents
    // Click "New Document" → select OFFER
    // Select customer, fill dates
    // Add free-text position: description, qty, price
    // Verify total calculated
    // Save → verify in list as DRAFT
  })

  test("print offer and forward to order confirmation", async ({ page }) => {
    // Open draft offer → click "Print"
    // Confirm print dialog → verify status = PRINTED
    // Click "Forward" → select "Auftragsbestätigung"
    // Verify new AB document created with positions copied
  })

  test("full document chain: Offer → AB → Delivery Note → Invoice", async ({ page }) => {
    // Create and print offer
    // Forward to AB, print AB
    // Forward to Delivery Note, print
    // Forward to Invoice, print
    // Verify each document links to parent
  })

  test("add article position with price lookup", async ({ page }) => {
    // In document form, add ARTICLE position
    // Search article → select → verify price auto-filled
  })

  test("cannot edit printed document", async ({ page }) => {
    // Print document
    // Verify edit button disabled / not visible
  })
})
```

---

## Acceptance Criteria

- [ ] `BillingDocument` and `BillingDocumentPosition` models created with migration
- [ ] All 7 document types supported (OFFER, ORDER_CONFIRMATION, DELIVERY_NOTE, SERVICE_NOTE, RETURN_DELIVERY, INVOICE, CREDIT_NOTE)
- [ ] Auto-number generation per document type via NumberSequence
- [ ] Document status workflow: DRAFT → PRINTED → FORWARDED (with CANCELLED possible at any point)
- [ ] Documents immutable after printing (no edits to header or positions)
- [ ] Forward (Belegkette) works per defined rules, copies positions
- [ ] Parent/child document chain tracked via `parentDocumentId`
- [ ] 5 position types: ARTICLE, FREE, TEXT, PAGE_BREAK, SUBTOTAL
- [ ] Position totals auto-calculated (quantity × unitPrice + flatCosts)
- [ ] Document totals (subtotalNet, totalVat, totalGross) auto-recalculated
- [ ] PDF generation works for all document types
- [ ] Payment terms pre-filled from customer address defaults
- [ ] Printing ORDER_CONFIRMATION can create linked Terp Order
- [ ] CRM Address detail shows "Documents" tab with linked documents
- [ ] CRM Inquiry detail shows linked documents
- [ ] All procedures gated by `requireModule("billing")` and `billing_documents.*` permissions
- [ ] Cross-tenant isolation verified
