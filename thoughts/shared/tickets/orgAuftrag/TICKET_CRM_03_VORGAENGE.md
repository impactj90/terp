# CRM_03 — Vorgänge / Anfragen

| Field | Value |
|-------|-------|
| **Module** | CRM |
| **Dependencies** | CRM_01 (Addresses, Contacts) |
| **Complexity** | M |
| **New Models** | `CrmInquiry` |

---

## Goal

Implement the "Vorgang" (inquiry/process) management system. A Vorgang is the overarching bracket for all customer activities — documents, correspondence, tasks, and service cases are linked to it. Includes automatic number generation, status workflow (Open → In Progress → Closed → Cancelled), and integration with the existing Terp order system for time tracking. Replaces ZMI orgAuftrag section 2.

---

## Prisma Models

### CrmInquiry

```prisma
enum CrmInquiryStatus {
  OPEN
  IN_PROGRESS
  CLOSED
  CANCELLED

  @@map("crm_inquiry_status")
}

model CrmInquiry {
  id              String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String           @map("tenant_id") @db.Uuid
  number          String           // Auto-generated via NumberSequence (key: "inquiry")
  title           String           // Vorgangsbezeichnung (Pflicht)
  addressId       String           @map("address_id") @db.Uuid
  contactId       String?          @map("contact_id") @db.Uuid
  status          CrmInquiryStatus @default(OPEN)
  effort          String?          // Dropdown: "low", "medium", "high" or custom
  creditRating    String?          @map("credit_rating") // Zahlungsfähigkeit
  notes           String?
  orderId         String?          @map("order_id") @db.Uuid // Link to existing Terp Order (time tracking)
  closedAt        DateTime?        @map("closed_at") @db.Timestamptz(6)
  closedById      String?          @map("closed_by_id") @db.Uuid
  closingReason   String?          @map("closing_reason") // Abschlussgrund
  closingRemarks  String?          @map("closing_remarks") // Abschlussbemerkung
  createdAt       DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById     String?          @map("created_by_id") @db.Uuid

  tenant          Tenant           @relation(fields: [tenantId], references: [id])
  address         CrmAddress       @relation(fields: [addressId], references: [id])
  contact         CrmContact?      @relation(fields: [contactId], references: [id], onDelete: SetNull)
  order           Order?           @relation(fields: [orderId], references: [id], onDelete: SetNull)
  correspondences CrmCorrespondence[]

  @@unique([tenantId, number])
  @@index([tenantId, status])
  @@index([tenantId, addressId])
  @@index([tenantId, orderId])
  @@map("crm_inquiries")
}
```

**Note:** The `orderId` links to the existing `Order` model used for time tracking. When an inquiry is created or progressed, a Terp order can be created so employees can book time against it.

---

## Permissions

Add to `permission-catalog.ts`:

```ts
p("crm_inquiries.view", "crm_inquiries", "view", "View CRM inquiries"),
p("crm_inquiries.create", "crm_inquiries", "create", "Create CRM inquiries"),
p("crm_inquiries.edit", "crm_inquiries", "edit", "Edit CRM inquiries"),
p("crm_inquiries.delete", "crm_inquiries", "delete", "Delete CRM inquiries"),
```

---

## tRPC Router

**File:** `src/trpc/routers/crm/inquiries.ts`

All procedures use `tenantProcedure.use(requireModule("crm"))`.

### Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `list` | query | `crm_inquiries.view` | `{ addressId?, search?, status?, page, pageSize }` | Paginated list with full-text search on title and number |
| `getById` | query | `crm_inquiries.view` | `{ id }` | Single inquiry with address, contact, linked correspondences |
| `create` | mutation | `crm_inquiries.create` | `{ title, addressId, contactId?, effort?, notes? }` | Auto-generates number via NumberSequence (key: "inquiry") |
| `update` | mutation | `crm_inquiries.edit` | `{ id, title?, contactId?, effort?, creditRating?, notes? }` | Partial update; only allowed when status ≠ CLOSED |
| `close` | mutation | `crm_inquiries.edit` | `{ id, closingReason?, closingRemarks?, closeLinkedOrder? }` | Sets status=CLOSED, closedAt, closedById. Optionally closes linked Terp order. |
| `cancel` | mutation | `crm_inquiries.edit` | `{ id, reason? }` | Sets status=CANCELLED |
| `reopen` | mutation | `crm_inquiries.edit` | `{ id }` | Reopens a closed/cancelled inquiry (sets status=IN_PROGRESS) |
| `linkOrder` | mutation | `crm_inquiries.edit` | `{ id, orderId }` | Links inquiry to an existing Terp order |
| `createOrder` | mutation | `crm_inquiries.edit` | `{ id, orderName?, activityGroupId? }` | Creates a new Terp order from the inquiry and links it |
| `delete` | mutation | `crm_inquiries.delete` | `{ id }` | Only if no documents, tasks, or correspondence are linked |

### Input Schemas

```ts
const createInput = z.object({
  title: z.string().min(1),
  addressId: z.string().uuid(),
  contactId: z.string().uuid().optional(),
  effort: z.string().optional(),
  notes: z.string().optional(),
})

const closeInput = z.object({
  id: z.string().uuid(),
  closingReason: z.string().optional(),
  closingRemarks: z.string().optional(),
  closeLinkedOrder: z.boolean().optional().default(false),
})
```

---

## Service Layer

**Files:**
- `src/lib/services/crm-inquiry-service.ts`
- `src/lib/services/crm-inquiry-repository.ts`

### Key Logic

- `create` — Auto-generates inquiry number via NumberSequence (key: `"inquiry"`). Validates addressId belongs to tenant.
- `close` — Sets `status=CLOSED`, `closedAt=now()`, `closedById=currentUser`. If `closeLinkedOrder=true` and an `orderId` exists, updates the linked Order status.
- `update` — Rejects if status is CLOSED (immutable after closing, per ZMI behavior).
- `createOrder` — Creates a new `Order` record with the inquiry title as order name, links it to the inquiry via `orderId`.
- `delete` — Validates no linked `BillingDocument`, `CrmCorrespondence`, or `CrmTask` records exist. Returns error if linked records found.

---

## UI Components

### Page Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/crm/inquiries` | `CrmInquiriesPage` | Global inquiry list with search, status filter |
| `/crm/inquiries/[id]` | `CrmInquiryDetailPage` | Inquiry detail with tabs |

### Component Files

All in `src/components/crm/`:

| Component | Description |
|-----------|-------------|
| `inquiry-list.tsx` | Data table with columns: Number, Title, Customer, Status, Created. Toolbar: search, status filter, address filter. |
| `inquiry-form-sheet.tsx` | Sheet form for create/edit. Address autocomplete, title, effort dropdown, notes. |
| `inquiry-detail.tsx` | Detail view with tabs: Overview, Correspondence, Documents (ORD_01), Tasks (CRM_04) |
| `inquiry-close-dialog.tsx` | Dialog for closing inquiry: closing reason (dropdown), remarks text, checkbox "close linked order" |
| `inquiry-status-badge.tsx` | Visual status badges with colors |
| `inquiry-link-order-dialog.tsx` | Dialog to link/create Terp order from inquiry |

### Integration with Address Detail

The address detail page (CRM_01) shows an "Inquiries" tab listing all inquiries for that address with a "New Inquiry" button.

---

## Hooks

**File:** `src/hooks/use-crm-inquiries.ts`

```ts
export function useCrmInquiries(filters) {
  return useQuery(trpc.crm.inquiries.list.queryOptions(filters))
}

export function useCrmInquiry(id: string) {
  return useQuery(trpc.crm.inquiries.getById.queryOptions({ id }))
}

export function useCreateCrmInquiry() { /* ... */ }
export function useCloseCrmInquiry() { /* ... */ }
export function useCrmInquiryCreateOrder() {
  return useMutation({
    ...trpc.crm.inquiries.createOrder.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.crm.inquiries.list.queryKey() })
    },
  })
}
```

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/crm-inquiry-service.test.ts`

- `create` — generates inquiry number via NumberSequence
- `create` — rejects if addressId belongs to different tenant
- `close` — sets status, closedAt, closedById
- `close` — optionally closes linked Terp order
- `close` — rejects if already closed
- `update` — rejects update when status is CLOSED
- `reopen` — changes status from CLOSED to IN_PROGRESS
- `createOrder` — creates Order and links it to inquiry
- `delete` — rejects if correspondence entries exist
- `delete` — rejects if documents are linked

### Router Tests

**File:** `src/trpc/routers/__tests__/crmInquiries-router.test.ts`

```ts
describe("crm.inquiries", () => {
  it("list — requires crm_inquiries.view permission", async () => { })
  it("list — requires CRM module enabled", async () => { })
  it("create — assigns auto-generated number", async () => { })
  it("close — sets closedAt and status", async () => { })
  it("close — rejects double-close", async () => { })
  it("update — rejects when closed", async () => { })
  it("createOrder — creates linked Terp order", async () => { })
})
```

### E2E Tests

**File:** `src/e2e-browser/22-crm-inquiries.spec.ts`

```ts
test.describe("UC-CRM-03: Inquiries", () => {
  test("create an inquiry for a customer", async ({ page }) => {
    // Navigate to /crm/inquiries
    // Click "New Inquiry"
    // Select customer address, fill title
    // Submit → verify in list with auto number
  })

  test("close an inquiry with reason", async ({ page }) => {
    // Open inquiry → click "Close"
    // Enter closing reason, remarks
    // Submit → verify status badge shows "Closed"
    // Verify editing is disabled
  })

  test("create Terp order from inquiry", async ({ page }) => {
    // Open inquiry → click "Create Order"
    // Fill order details
    // Submit → verify order link shown on inquiry
  })

  test("search inquiries globally", async ({ page }) => {
    // Navigate to /crm/inquiries
    // Type in search → verify filtered results
  })
})
```

---

## Acceptance Criteria

- [x] `CrmInquiry` model created with migration
- [x] Inquiry number auto-generated via NumberSequence (key: "inquiry")
- [x] CRUD operations fully functional
- [x] Status workflow: OPEN → IN_PROGRESS → CLOSED (with closingReason, closingRemarks)
- [x] Closed inquiries are immutable (update rejected)
- [x] Cancel and reopen supported
- [x] Link to existing Terp Order works
- [x] Create new Terp Order from inquiry works
- [x] Global inquiry list at `/crm/inquiries` with search and status filter
- [x] Inquiry tab on address detail page (CRM_01)
- [x] Correspondence entries can be linked to inquiry via `inquiryId` (CRM_02)
- [x] Delete only works if no linked records exist
- [x] All procedures gated by `requireModule("crm")` and `crm_inquiries.*` permissions
- [x] Cross-tenant isolation verified
