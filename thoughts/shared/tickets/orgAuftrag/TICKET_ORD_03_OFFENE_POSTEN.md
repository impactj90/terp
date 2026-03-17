# ORD_03 — Offene Posten / Zahlungen

| Field | Value |
|-------|-------|
| **Module** | Billing |
| **Dependencies** | ORD_01 (Documents — specifically INVOICE and CREDIT_NOTE types) |
| **Complexity** | M |
| **New Models** | `BillingPayment` |
| **Status** | DONE |
| **Completed** | 2026-03-17 |

---

## Goal

Implement the open items (Offene Posten) and payment tracking system. When an invoice is printed (ORD_01), an open item is automatically created. Payments (cash or bank) are recorded against invoices, supporting partial payments and discount (Skonto). Credit notes reduce open balances. Replaces ZMI orgAuftrag section 5.

---

## Prisma Models

### BillingPayment

```prisma
enum BillingPaymentType {
  CASH    // Bar/Kasse
  BANK    // Banküberweisung

  @@map("billing_payment_type")
}

enum BillingPaymentStatus {
  ACTIVE
  CANCELLED

  @@map("billing_payment_status")
}

model BillingPayment {
  id            String                @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String                @map("tenant_id") @db.Uuid
  documentId    String                @map("document_id") @db.Uuid // Link to INVOICE BillingDocument
  date          DateTime              @db.Timestamptz(6)
  amount        Float                 // Payment amount
  type          BillingPaymentType
  status        BillingPaymentStatus  @default(ACTIVE)
  isDiscount    Boolean               @default(false) @map("is_discount") // Skonto
  notes         String?
  cancelledAt   DateTime?             @map("cancelled_at") @db.Timestamptz(6)
  cancelledById String?               @map("cancelled_by_id") @db.Uuid
  createdAt     DateTime              @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime              @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById   String?               @map("created_by_id") @db.Uuid

  tenant   Tenant          @relation(fields: [tenantId], references: [id])
  document BillingDocument  @relation(fields: [documentId], references: [id])

  @@index([tenantId, documentId])
  @@index([tenantId, date])
  @@map("billing_payments")
}
```

### Extensions to BillingDocument (ORD_01)

Add computed/virtual fields for open item tracking (no new columns needed — calculated from payments):

```
- paidAmount: Sum of active payments
- openAmount: totalGross - paidAmount
- paymentStatus: UNPAID | PARTIAL | PAID | OVERPAID
- dueDate: documentDate + paymentTermDays
- isOverdue: dueDate < now() AND paymentStatus ≠ PAID
```

---

## Permissions

Add to `permission-catalog.ts`:

```ts
p("billing_payments.view", "billing_payments", "view", "View payments and open items"),
p("billing_payments.create", "billing_payments", "create", "Record payments"),
p("billing_payments.cancel", "billing_payments", "cancel", "Cancel payments"),
```

---

## tRPC Router

**File:** `src/trpc/routers/billing/payments.ts`

All procedures use `tenantProcedure.use(requireModule("billing"))`.

### Open Items Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `openItems.list` | query | `billing_payments.view` | `{ addressId?, status?: "open"\|"partial"\|"paid"\|"overdue", search?, dateFrom?, dateTo?, page, pageSize }` | All invoices with payment status and open amounts |
| `openItems.getById` | query | `billing_payments.view` | `{ documentId }` | Single invoice with all payments, amounts, due date |
| `openItems.summary` | query | `billing_payments.view` | `{ addressId? }` | Summary: total open, total overdue, count by status |

### Payment Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `payments.create` | mutation | `billing_payments.create` | `{ documentId, date, amount, type, isDiscount?, notes? }` | Record a payment against an invoice |
| `payments.cancel` | mutation | `billing_payments.cancel` | `{ id, reason? }` | Cancel a payment (reverses it) |
| `payments.list` | query | `billing_payments.view` | `{ documentId }` | All payments for a specific invoice |

### Input Schemas

```ts
const openItemsListInput = z.object({
  addressId: z.string().uuid().optional(),
  status: z.enum(["open", "partial", "paid", "overdue"]).optional(),
  search: z.string().optional(),
  dateFrom: z.date().optional(),
  dateTo: z.date().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

const createPaymentInput = z.object({
  documentId: z.string().uuid(),
  date: z.date(),
  amount: z.number().positive(),
  type: z.enum(["CASH", "BANK"]),
  isDiscount: z.boolean().optional().default(false),
  notes: z.string().optional(),
})
```

---

## Service Layer

**Files:**
- `src/lib/services/billing-payment-service.ts`
- `src/lib/services/billing-payment-repository.ts`

### Key Logic

#### Open Item Creation (automatic)

When `billing-document-service.print()` is called on an INVOICE:
- The invoice automatically becomes an "open item"
- No separate model needed — an invoice with payments < totalGross is "open"

When a CREDIT_NOTE is printed:
- If linked to a parent invoice, reduce the invoice's effective totalGross

#### Payment Recording

```ts
export async function createPayment(prisma, tenantId, input, createdById) {
  // 1. Validate document exists, is an INVOICE, and belongs to tenant
  // 2. Validate document is PRINTED (only printed invoices can receive payments)
  // 3. Calculate current open amount (totalGross - sum of active payments)
  // 4. Validate payment amount ≤ open amount (unless overpayment allowed)
  // 5. If isDiscount: validate within discount period (discountDays from documentDate)
  //    - Apply discount: amount = openAmount * (1 - discountPercent/100)
  // 6. Create payment record
  // 7. Return updated open item status
}
```

#### Discount (Skonto) Calculation

Two discount tiers supported (from BillingDocument):
1. **Tier 1:** If payment within `discountDays` days → apply `discountPercent`%
2. **Tier 2:** If payment within `discountDays2` days → apply `discountPercent2`%
3. **Net:** If payment after both tiers → full amount

When recording a payment with `isDiscount=true`:
- Calculate applicable discount based on payment date vs document date
- Record the discount amount as a separate payment with `isDiscount=true`
- This closes the remaining balance

#### Payment Status Calculation

```ts
function getPaymentStatus(document, payments): "UNPAID" | "PARTIAL" | "PAID" | "OVERPAID" {
  const paidAmount = payments
    .filter(p => p.status === "ACTIVE")
    .reduce((sum, p) => sum + p.amount, 0)

  if (paidAmount === 0) return "UNPAID"
  if (paidAmount < document.totalGross) return "PARTIAL"
  if (paidAmount === document.totalGross) return "PAID"
  return "OVERPAID"
}
```

#### Overdue Detection

```ts
function isOverdue(document): boolean {
  if (!document.paymentTermDays) return false
  const dueDate = addDays(document.documentDate, document.paymentTermDays)
  return dueDate < new Date() && getPaymentStatus(...) !== "PAID"
}
```

---

## UI Components

### Page Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/orders/open-items` | `BillingOpenItemsPage` | Open items list with filters |
| `/orders/open-items/[documentId]` | `BillingOpenItemDetailPage` | Single invoice payment details |

### Component Files

All in `src/components/billing/`:

| Component | Description |
|-----------|-------------|
| `open-item-list.tsx` | Data table. Columns: Invoice Number, Customer, Invoice Date, Due Date, Total, Paid, Open, Status (badge). Toolbar: status filter (open/partial/paid/overdue), customer filter, date range. Highlight overdue rows. |
| `open-item-detail.tsx` | Shows invoice summary, payment history table, record payment form. |
| `payment-form-dialog.tsx` | Dialog for recording payment: date, amount (pre-filled with open amount), type (Cash/Bank), discount checkbox. Shows applicable discount tiers. |
| `payment-cancel-dialog.tsx` | Confirmation dialog to cancel a payment. |
| `payment-status-badge.tsx` | Color-coded status: green=paid, yellow=partial, red=overdue, gray=unpaid |
| `open-items-summary-card.tsx` | KPI card showing total open, overdue, paid this month |

---

## Hooks

**File:** `src/hooks/use-billing-payments.ts`

```ts
export function useBillingOpenItems(filters) {
  return useQuery(trpc.billing.payments.openItems.list.queryOptions(filters))
}

export function useBillingOpenItem(documentId: string) {
  return useQuery(trpc.billing.payments.openItems.getById.queryOptions({ documentId }))
}

export function useBillingOpenItemsSummary(addressId?: string) {
  return useQuery(trpc.billing.payments.openItems.summary.queryOptions({ addressId }))
}

export function useCreateBillingPayment() {
  return useMutation({
    ...trpc.billing.payments.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.payments.openItems.list.queryKey() })
    },
  })
}
```

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/billing-payment-service.test.ts`

- `createPayment` — records payment, reduces open amount
- `createPayment` — rejects if document is not INVOICE
- `createPayment` — rejects if document is not PRINTED
- `createPayment` — rejects if amount exceeds open amount
- `createPayment` — partial payment leaves status=PARTIAL
- `createPayment` — full payment sets status=PAID
- `createPayment` with discount — applies correct tier based on date
- `createPayment` with discount — records discount as separate entry
- `cancelPayment` — sets status=CANCELLED, reopens balance
- `openItems.list` — shows only invoices
- `openItems.list` — filters by overdue correctly
- `openItems.summary` — calculates total open and overdue amounts

### Router Tests

**File:** `src/trpc/routers/__tests__/billingPayments-router.test.ts`

```ts
describe("billing.payments", () => {
  it("openItems.list — requires billing_payments.view", async () => { })
  it("openItems.list — requires billing module enabled", async () => { })
  it("payments.create — records payment and updates status", async () => { })
  it("payments.create — rejects overpayment", async () => { })
  it("payments.cancel — restores open balance", async () => { })
})
```

### E2E Tests

**File:** `src/e2e-browser/32-billing-open-items.spec.ts`

```ts
test.describe("UC-ORD-03: Open Items / Payments", () => {
  test("view open items list", async ({ page }) => {
    // Navigate to /orders/open-items
    // Verify invoices shown with open amounts
  })

  test("record a full payment", async ({ page }) => {
    // Click on open item → "Record Payment"
    // Fill amount (pre-filled), select Bank
    // Submit → verify status changes to "Paid"
  })

  test("record a partial payment", async ({ page }) => {
    // Record payment with amount < open
    // Verify status = "Partial", remaining balance shown
  })

  test("apply discount (Skonto)", async ({ page }) => {
    // Check "Skonto" checkbox
    // Verify amount auto-adjusted based on discount tier
    // Submit → verify paid with discount recorded
  })

  test("cancel a payment", async ({ page }) => {
    // Open paid item → cancel last payment
    // Verify status reverts to open
  })
})
```

---

## Acceptance Criteria

- [ ] `BillingPayment` model created with migration
- [ ] Open items automatically tracked for all printed INVOICE documents
- [ ] Payment recording works (cash and bank)
- [ ] Partial payments supported — status reflects remaining balance
- [ ] Discount (Skonto) calculation with two tiers based on payment date
- [ ] Payment cancellation restores open balance
- [ ] Overdue detection based on payment terms
- [ ] Open items list with filters: status, customer, date range
- [ ] Summary card with total open, total overdue, count by status
- [ ] Credit notes reduce effective invoice balance when linked
- [ ] All procedures gated by `requireModule("billing")` and `billing_payments.*` permissions
- [ ] Cross-tenant isolation verified
- [ ] Pre-filled amount on payment form equals remaining open amount
