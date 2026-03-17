# ORD_02 — Kundendienst / Serviceaufträge

| Field | Value |
|-------|-------|
| **Module** | Billing |
| **Dependencies** | CRM_01 (Addresses), CRM_03 (Inquiries), ORD_01 (Documents) |
| **Complexity** | M |
| **New Models** | `BillingServiceCase` |

---

## Goal

Implement service case management (Kundendienst). Service cases are maintenance, repair, or on-site jobs for customers. They follow a workflow from creation through completion, with the ability to generate an invoice at the end. Integrates with CRM addresses, inquiries, and the Terp order system for time tracking. Replaces ZMI orgAuftrag section 3.

---

## Prisma Models

### BillingServiceCase

```prisma
enum BillingServiceCaseStatus {
  OPEN
  IN_PROGRESS
  CLOSED
  INVOICED

  @@map("billing_service_case_status")
}

model BillingServiceCase {
  id                String                    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String                    @map("tenant_id") @db.Uuid
  number            String                    // Auto-generated via NumberSequence (key: "service_case")
  title             String                    // Bezeichnung (Pflicht)
  addressId         String                    @map("address_id") @db.Uuid
  contactId         String?                   @map("contact_id") @db.Uuid
  inquiryId         String?                   @map("inquiry_id") @db.Uuid  // Linked Anfrage (CRM_03)
  status            BillingServiceCaseStatus   @default(OPEN)
  reportedAt        DateTime                  @default(now()) @map("reported_at") @db.Timestamptz(6) // Gemeldet-am
  customerNotifiedCost Boolean               @default(false) @map("customer_notified_cost") // Auf Kosten hingewiesen
  assignedToId      String?                   @map("assigned_to_id") @db.Uuid // Zuständiger Mitarbeiter
  description       String?                   // Detailbeschreibung / Memo
  closingReason     String?                   @map("closing_reason") // Abschlussgrund
  closedAt          DateTime?                 @map("closed_at") @db.Timestamptz(6)
  closedById        String?                   @map("closed_by_id") @db.Uuid
  orderId           String?                   @map("order_id") @db.Uuid   // Linked Terp Order (time tracking)
  invoiceDocumentId String?                   @map("invoice_document_id") @db.Uuid // Generated invoice (ORD_01)
  createdAt         DateTime                  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime                  @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById       String?                   @map("created_by_id") @db.Uuid

  tenant           Tenant           @relation(fields: [tenantId], references: [id])
  address          CrmAddress       @relation(fields: [addressId], references: [id])
  contact          CrmContact?      @relation(fields: [contactId], references: [id], onDelete: SetNull)
  inquiry          CrmInquiry?      @relation(fields: [inquiryId], references: [id], onDelete: SetNull)
  assignedTo       Employee?        @relation(fields: [assignedToId], references: [id], onDelete: SetNull)
  order            Order?           @relation(fields: [orderId], references: [id], onDelete: SetNull)
  invoiceDocument  BillingDocument? @relation(fields: [invoiceDocumentId], references: [id], onDelete: SetNull)

  @@unique([tenantId, number])
  @@index([tenantId, status])
  @@index([tenantId, addressId])
  @@index([tenantId, assignedToId])
  @@map("billing_service_cases")
}
```

---

## Permissions

Add to `permission-catalog.ts`:

```ts
p("billing_service_cases.view", "billing_service_cases", "view", "View service cases"),
p("billing_service_cases.create", "billing_service_cases", "create", "Create service cases"),
p("billing_service_cases.edit", "billing_service_cases", "edit", "Edit service cases"),
p("billing_service_cases.delete", "billing_service_cases", "delete", "Delete service cases"),
```

---

## tRPC Router

**File:** `src/trpc/routers/billing/serviceCases.ts`

All procedures use `tenantProcedure.use(requireModule("billing"))`.

### Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `list` | query | `billing_service_cases.view` | `{ addressId?, status?, assignedToId?, search?, page, pageSize }` | Paginated list |
| `getById` | query | `billing_service_cases.view` | `{ id }` | Full detail with address, contact, order link |
| `create` | mutation | `billing_service_cases.create` | `{ title, addressId, contactId?, inquiryId?, description?, assignedToId?, customerNotifiedCost? }` | Auto-generates number |
| `update` | mutation | `billing_service_cases.edit` | `{ id, ...fields }` | Only when status ≠ CLOSED/INVOICED |
| `close` | mutation | `billing_service_cases.edit` | `{ id, closingReason }` | Sets CLOSED, closedAt, closedById. Immutable after. |
| `createInvoice` | mutation | `billing_service_cases.edit` | `{ id, positions: [...] }` | Creates INVOICE BillingDocument from service case. Sets status=INVOICED. |
| `createOrder` | mutation | `billing_service_cases.edit` | `{ id, orderName?, activityGroupId? }` | Creates Terp Order for time tracking |
| `delete` | mutation | `billing_service_cases.delete` | `{ id }` | Only OPEN/IN_PROGRESS, no linked invoice |

### Service Case Workflow

```
OPEN → IN_PROGRESS → CLOSED → (createInvoice) → INVOICED
```

- `OPEN` — Initial state after creation
- `IN_PROGRESS` — Auto-set when assignedTo is set or first update
- `CLOSED` — Closed with reason. After closing, the service case appears in the "Create Invoice" list.
- `INVOICED` — After invoice is created from the service case

---

## Service Layer

**Files:**
- `src/lib/services/billing-service-case-service.ts`
- `src/lib/services/billing-service-case-repository.ts`

### Key Logic

- `create` — Auto-generates number via NumberSequence (key: `"service_case"`). Status = OPEN.
- `close` — Sets status=CLOSED, records closingReason, closedAt, closedById. After closing, no further edits.
- `createInvoice` — In a transaction:
  1. Create a `BillingDocument` of type INVOICE linked to the service case's address
  2. Copy provided positions to the invoice
  3. Set `serviceCase.invoiceDocumentId = invoice.id`
  4. Set `serviceCase.status = INVOICED`
- `createOrder` — Creates Terp Order, links via `orderId`.
- Time tracking integration: If an `orderId` is set, employees can book time. The booked hours can be used to pre-fill invoice positions (hours × hourly rate).

---

## UI Components

### Page Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/orders/service-cases` | `BillingServiceCasesPage` | Service case list |
| `/orders/service-cases/[id]` | `BillingServiceCaseDetailPage` | Detail with actions |

### Component Files

All in `src/components/billing/`:

| Component | Description |
|-----------|-------------|
| `service-case-list.tsx` | Data table. Columns: Number, Title, Customer, Assigned To, Status, Reported Date. Toolbar: status filter, search, assigned-to filter. |
| `service-case-form-sheet.tsx` | Sheet form for create/edit. Address autocomplete, title, description, assign employee, customer notified checkbox. |
| `service-case-detail.tsx` | Detail view. Action bar: Close, Create Invoice, Create Order. Shows linked order and invoice. |
| `service-case-close-dialog.tsx` | Dialog for closing: closing reason dropdown/text. |
| `service-case-invoice-dialog.tsx` | Dialog for creating invoice: shows booked hours if order linked, allows adding positions, then creates invoice. |
| `service-case-status-badge.tsx` | Status badges |

### Integration with CRM

- Address detail page → "Service Cases" tab
- Inquiry detail page can link to service cases

---

## Hooks

**File:** `src/hooks/use-billing-service-cases.ts`

```ts
export function useBillingServiceCases(filters) {
  return useQuery(trpc.billing.serviceCases.list.queryOptions(filters))
}

export function useBillingServiceCase(id: string) {
  return useQuery(trpc.billing.serviceCases.getById.queryOptions({ id }))
}

export function useCreateBillingServiceCase() { /* ... */ }
export function useCloseBillingServiceCase() { /* ... */ }
export function useCreateInvoiceFromServiceCase() { /* ... */ }
```

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/billing-service-case-service.test.ts`

- `create` — generates number via NumberSequence
- `create` — initial status is OPEN
- `close` — sets CLOSED, closedAt, closingReason
- `close` — rejects if already closed
- `update` — rejects after CLOSED
- `createInvoice` — creates BillingDocument of type INVOICE
- `createInvoice` — links invoice to service case
- `createInvoice` — sets status to INVOICED
- `createOrder` — creates Terp Order and links

### Router Tests

**File:** `src/trpc/routers/__tests__/billingServiceCases-router.test.ts`

```ts
describe("billing.serviceCases", () => {
  it("list — requires billing_service_cases.view", async () => { })
  it("list — requires billing module enabled", async () => { })
  it("create — auto-generates number", async () => { })
  it("close — sets status and reason", async () => { })
  it("createInvoice — creates linked invoice document", async () => { })
})
```

### E2E Tests

**File:** `src/e2e-browser/31-billing-service-cases.spec.ts`

```ts
test.describe("UC-ORD-02: Service Cases", () => {
  test("create a service case for a customer", async ({ page }) => {
    // Navigate to /orders/service-cases
    // Click "New" → fill title, select customer, assign employee
    // Submit → verify in list
  })

  test("close service case and create invoice", async ({ page }) => {
    // Open service case → Close with reason
    // Click "Create Invoice" → add positions
    // Submit → verify status = INVOICED, invoice link visible
  })
})
```

---

## Acceptance Criteria

- [ ] `BillingServiceCase` model created with migration
- [ ] Number auto-generated via NumberSequence (key: "service_case")
- [ ] Status workflow: OPEN → IN_PROGRESS → CLOSED → INVOICED
- [ ] Closed service cases are immutable
- [ ] Create invoice from closed service case creates BillingDocument (ORD_01) of type INVOICE
- [ ] Invoice linked back to service case via `invoiceDocumentId`
- [ ] Create Terp Order for time tracking from service case
- [ ] Address detail page shows "Service Cases" tab
- [ ] All procedures gated by `requireModule("billing")` and `billing_service_cases.*` permissions
- [ ] Cross-tenant isolation verified
