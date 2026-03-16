# WH_06 — Lieferantenrechnungen

| Field | Value |
|-------|-------|
| **Module** | Warehouse |
| **Dependencies** | WH_03 (Purchase Orders), CRM_01 (Addresses — suppliers) |
| **Complexity** | M |
| **New Models** | `WhSupplierInvoice`, `WhSupplierPayment` |

---

## Goal

Implement supplier invoice management (Lieferantenrechnungen). When goods are received from a supplier, the corresponding invoice needs to be recorded and tracked for payment. Supports linking to purchase orders, payment terms with discount (Skonto), partial payments, and payment status tracking. Requires the supplier to have a tax number or VAT ID on file. Replaces ZMI orgAuftrag section 9.5.

---

## Prisma Models

### WhSupplierInvoice

```prisma
enum WhSupplierInvoiceStatus {
  OPEN
  PARTIAL
  PAID
  CANCELLED

  @@map("wh_supplier_invoice_status")
}

model WhSupplierInvoice {
  id                String                    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String                    @map("tenant_id") @db.Uuid
  number            String                    // Supplier's invoice number (entered manually)
  supplierId        String                    @map("supplier_id") @db.Uuid
  purchaseOrderId   String?                   @map("purchase_order_id") @db.Uuid
  status            WhSupplierInvoiceStatus   @default(OPEN)
  invoiceDate       DateTime                  @map("invoice_date") @db.Timestamptz(6)
  receivedDate      DateTime                  @default(now()) @map("received_date") @db.Timestamptz(6)
  totalNet          Float                     @map("total_net")
  totalVat          Float                     @map("total_vat")
  totalGross        Float                     @map("total_gross")

  // Payment terms
  paymentTermDays   Int?                      @map("payment_term_days")
  dueDate           DateTime?                 @map("due_date") @db.Timestamptz(6) // Can be explicit or calculated
  discountPercent   Float?                    @map("discount_percent")
  discountDays      Int?                      @map("discount_days")
  discountPercent2  Float?                    @map("discount_percent_2")
  discountDays2     Int?                      @map("discount_days_2")

  notes             String?
  createdAt         DateTime                  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime                  @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById       String?                   @map("created_by_id") @db.Uuid

  tenant        Tenant           @relation(fields: [tenantId], references: [id])
  supplier      CrmAddress       @relation(fields: [supplierId], references: [id])
  purchaseOrder WhPurchaseOrder? @relation(fields: [purchaseOrderId], references: [id], onDelete: SetNull)
  payments      WhSupplierPayment[]

  @@index([tenantId, supplierId])
  @@index([tenantId, status])
  @@index([tenantId, dueDate])
  @@map("wh_supplier_invoices")
}
```

### WhSupplierPayment

```prisma
model WhSupplierPayment {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String   @map("tenant_id") @db.Uuid
  invoiceId     String   @map("invoice_id") @db.Uuid
  date          DateTime @db.Timestamptz(6)
  amount        Float
  type          BillingPaymentType // Reuse: CASH or BANK
  isDiscount    Boolean  @default(false) @map("is_discount")
  notes         String?
  status        BillingPaymentStatus @default(ACTIVE) // Reuse: ACTIVE or CANCELLED
  cancelledAt   DateTime? @map("cancelled_at") @db.Timestamptz(6)
  cancelledById String?   @map("cancelled_by_id") @db.Uuid
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  createdById   String?  @map("created_by_id") @db.Uuid

  tenant  Tenant             @relation(fields: [tenantId], references: [id])
  invoice WhSupplierInvoice  @relation(fields: [invoiceId], references: [id])

  @@index([invoiceId])
  @@map("wh_supplier_payments")
}
```

---

## Permissions

Add to `permission-catalog.ts`:

```ts
p("wh_supplier_invoices.view", "wh_supplier_invoices", "view", "View supplier invoices"),
p("wh_supplier_invoices.create", "wh_supplier_invoices", "create", "Create supplier invoices"),
p("wh_supplier_invoices.edit", "wh_supplier_invoices", "edit", "Edit supplier invoices"),
p("wh_supplier_invoices.pay", "wh_supplier_invoices", "pay", "Record payments on supplier invoices"),
```

---

## tRPC Router

**File:** `src/trpc/routers/warehouse/supplierInvoices.ts`

All procedures use `tenantProcedure.use(requireModule("warehouse"))`.

### Invoice Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `list` | query | `wh_supplier_invoices.view` | `{ supplierId?, status?, search?, dateFrom?, dateTo?, page, pageSize }` | Paginated list |
| `getById` | query | `wh_supplier_invoices.view` | `{ id }` | Invoice with payments |
| `create` | mutation | `wh_supplier_invoices.create` | `{ number, supplierId, purchaseOrderId?, invoiceDate, totalNet, totalVat, totalGross, paymentTermDays?, ... }` | Creates invoice. Validates supplier has tax number or VAT ID. |
| `update` | mutation | `wh_supplier_invoices.edit` | `{ id, ...fields }` | Only when OPEN |
| `cancel` | mutation | `wh_supplier_invoices.edit` | `{ id }` | Sets CANCELLED |
| `summary` | query | `wh_supplier_invoices.view` | `{ supplierId? }` | Summary: total open, overdue, paid this month |

### Payment Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `payments.create` | mutation | `wh_supplier_invoices.pay` | `{ invoiceId, date, amount, type, isDiscount?, notes? }` | Record payment |
| `payments.cancel` | mutation | `wh_supplier_invoices.pay` | `{ id }` | Cancel payment |
| `payments.list` | query | `wh_supplier_invoices.view` | `{ invoiceId }` | Payments for an invoice |

---

## Service Layer

**Files:**
- `src/lib/services/wh-supplier-invoice-service.ts`
- `src/lib/services/wh-supplier-invoice-repository.ts`

### Key Logic

- `create` — Validates that the supplier (CrmAddress) has either `taxNumber` or `vatId` set. Rejects if neither is present (per ZMI requirement).
- `create` — If `paymentTermDays` is provided but not `dueDate`, calculates `dueDate = invoiceDate + paymentTermDays`.
- Payment logic mirrors ORD_03 (open items): partial payments, discount calculation, status tracking.
- Status transitions: OPEN → PARTIAL (when some payments) → PAID (when fully paid). CANCELLED at any point.

---

## UI Components

### Page Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/warehouse/supplier-invoices` | `WhSupplierInvoicesPage` | Supplier invoice list |
| `/warehouse/supplier-invoices/[id]` | `WhSupplierInvoiceDetailPage` | Invoice detail with payments |

### Component Files

All in `src/components/warehouse/`:

| Component | Description |
|-----------|-------------|
| `supplier-invoice-list.tsx` | Data table. Columns: Number, Supplier, Invoice Date, Due Date, Total, Open Amount, Status. Toolbar: status filter, supplier filter, overdue highlight. |
| `supplier-invoice-form-sheet.tsx` | Sheet for create/edit. Supplier select (validates tax number), PO link, amounts, payment terms. |
| `supplier-invoice-detail.tsx` | Detail view with payment history. Record Payment button, Cancel Invoice button. |
| `supplier-payment-form-dialog.tsx` | Dialog for recording payment: date, amount (pre-filled), type, discount checkbox. |
| `supplier-invoice-status-badge.tsx` | Status badges |

---

## Hooks

**File:** `src/hooks/use-wh-supplier-invoices.ts`

```ts
export function useWhSupplierInvoices(filters) {
  return useQuery(trpc.warehouse.supplierInvoices.list.queryOptions(filters))
}

export function useWhSupplierInvoice(id: string) {
  return useQuery(trpc.warehouse.supplierInvoices.getById.queryOptions({ id }))
}

export function useCreateWhSupplierInvoice() { /* ... */ }
export function useCreateWhSupplierPayment() { /* ... */ }
```

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/wh-supplier-invoice-service.test.ts`

- `create` — validates supplier has taxNumber or vatId
- `create` — rejects if neither tax field is set
- `create` — calculates dueDate from paymentTermDays
- `payments.create` — records payment, updates status
- `payments.create` — partial payment sets PARTIAL
- `payments.create` — full payment sets PAID
- `payments.create` — discount calculation works
- `payments.cancel` — reverses payment, reopens balance
- `summary` — calculates correct totals

### Router Tests

**File:** `src/trpc/routers/__tests__/whSupplierInvoices-router.test.ts`

```ts
describe("warehouse.supplierInvoices", () => {
  it("list — requires wh_supplier_invoices.view", async () => { })
  it("list — requires warehouse module enabled", async () => { })
  it("create — validates supplier tax info", async () => { })
  it("payments.create — records and updates status", async () => { })
})
```

### E2E Tests

**File:** `src/e2e-browser/45-wh-supplier-invoices.spec.ts`

```ts
test.describe("UC-WH-06: Supplier Invoices", () => {
  test("create a supplier invoice linked to PO", async ({ page }) => {
    // Navigate to /warehouse/supplier-invoices
    // Click "New" → select supplier, link PO, enter amounts
    // Submit → verify in list
  })

  test("record payment on supplier invoice", async ({ page }) => {
    // Open invoice → click "Record Payment"
    // Enter amount, select Bank
    // Submit → verify status updated
  })

  test("supplier without tax number cannot have invoice", async ({ page }) => {
    // Try to create invoice for supplier without tax number
    // Verify validation error
  })
})
```

---

## Acceptance Criteria

- [ ] `WhSupplierInvoice` and `WhSupplierPayment` models created with migration
- [ ] Invoice creation validates supplier has taxNumber or vatId
- [ ] Invoice linked to purchase order (optional)
- [ ] Payment terms with due date calculation
- [ ] Discount (Skonto) with two tiers
- [ ] Partial payment support
- [ ] Payment status tracking: OPEN → PARTIAL → PAID
- [ ] Payment cancellation/reversal
- [ ] Summary with total open, overdue, paid amounts
- [ ] Supplier detail page shows "Invoices" tab
- [ ] All procedures gated by `requireModule("warehouse")` and `wh_supplier_invoices.*` permissions
- [ ] Cross-tenant isolation verified
