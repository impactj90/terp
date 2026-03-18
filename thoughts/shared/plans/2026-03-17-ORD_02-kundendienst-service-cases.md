# Implementation Plan: ORD_02 Kundendienst/Serviceaufträge
Date: 2026-03-17
Ticket: ORD_02

## Overview

Implement service case management (Kundendienst) within the billing module. Service cases represent maintenance, repair, or on-site jobs for customers. They follow a workflow from creation through completion, with the ability to generate an invoice and create a Terp Order for time tracking. This extends the existing billing module infrastructure (ORD_01).

**Model:** `BillingServiceCase`
**Route:** `/orders/service-cases`
**NumberSequence key:** `service_case` (prefix `KD-`)
**Status workflow:** OPEN -> IN_PROGRESS -> CLOSED -> INVOICED

## Dependencies

- **ORD_01 (BillingDocument)** — createInvoice creates a BillingDocument of type INVOICE
- **CRM_01 (Addresses)** — address linkage
- **CRM_03 (Inquiries)** — optional inquiry linkage
- **Order system** — createOrder creates a Terp Order for time tracking
- **NumberSequence** — auto-generated case numbers

## Phase 1: Database & Schema

### Files

| File | Action |
|------|--------|
| `supabase/migrations/20260101000100_create_billing_service_cases.sql` | CREATE |
| `prisma/schema.prisma` | MODIFY |

### Implementation Details

#### Migration: `20260101000100_create_billing_service_cases.sql`

Follow the exact pattern from `20260101000099_create_billing_documents.sql`:

```sql
-- ORD_02: Billing Service Cases (Kundendienst)

CREATE TYPE billing_service_case_status AS ENUM (
  'OPEN',
  'IN_PROGRESS',
  'CLOSED',
  'INVOICED'
);

CREATE TABLE billing_service_cases (
    id                    UUID                           PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID                           NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    number                VARCHAR(50)                    NOT NULL,
    title                 VARCHAR(255)                   NOT NULL,
    address_id            UUID                           NOT NULL REFERENCES crm_addresses(id),
    contact_id            UUID                           REFERENCES crm_contacts(id) ON DELETE SET NULL,
    inquiry_id            UUID                           REFERENCES crm_inquiries(id) ON DELETE SET NULL,
    status                billing_service_case_status    NOT NULL DEFAULT 'OPEN',
    reported_at           TIMESTAMPTZ                    NOT NULL DEFAULT NOW(),
    customer_notified_cost BOOLEAN                       NOT NULL DEFAULT false,
    assigned_to_id        UUID                           REFERENCES employees(id) ON DELETE SET NULL,
    description           TEXT,
    closing_reason        TEXT,
    closed_at             TIMESTAMPTZ,
    closed_by_id          UUID,
    order_id              UUID                           REFERENCES orders(id) ON DELETE SET NULL,
    invoice_document_id   UUID                           REFERENCES billing_documents(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ                    NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ                    NOT NULL DEFAULT NOW(),
    created_by_id         UUID
);

-- Unique constraint: number per tenant
ALTER TABLE billing_service_cases
  ADD CONSTRAINT uq_billing_service_cases_tenant_number UNIQUE (tenant_id, number);

-- Indexes
CREATE INDEX idx_billing_service_cases_tenant_status ON billing_service_cases(tenant_id, status);
CREATE INDEX idx_billing_service_cases_tenant_address ON billing_service_cases(tenant_id, address_id);
CREATE INDEX idx_billing_service_cases_tenant_assigned ON billing_service_cases(tenant_id, assigned_to_id);

-- Trigger for updated_at
CREATE TRIGGER set_billing_service_cases_updated_at
  BEFORE UPDATE ON billing_service_cases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

#### Prisma Schema: `prisma/schema.prisma`

**1. Add enum after existing billing enums (after line ~434, after `BillingPriceType`):**

```prisma
enum BillingServiceCaseStatus {
  OPEN
  IN_PROGRESS
  CLOSED
  INVOICED

  @@map("billing_service_case_status")
}
```

**2. Add model after `BillingDocumentPosition` (after line ~700):**

```prisma
// -----------------------------------------------------------------------------
// BillingServiceCase
// -----------------------------------------------------------------------------
// Migration: 000100
//
// Service case (Kundendienst) for maintenance, repair, or on-site jobs.
// Workflow: OPEN -> IN_PROGRESS -> CLOSED -> INVOICED
model BillingServiceCase {
  id                  String                     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId            String                     @map("tenant_id") @db.Uuid
  number              String                     @db.VarChar(50)
  title               String                     @db.VarChar(255)
  addressId           String                     @map("address_id") @db.Uuid
  contactId           String?                    @map("contact_id") @db.Uuid
  inquiryId           String?                    @map("inquiry_id") @db.Uuid
  status              BillingServiceCaseStatus   @default(OPEN)
  reportedAt          DateTime                   @default(now()) @map("reported_at") @db.Timestamptz(6)
  customerNotifiedCost Boolean                   @default(false) @map("customer_notified_cost")
  assignedToId        String?                    @map("assigned_to_id") @db.Uuid
  description         String?
  closingReason       String?                    @map("closing_reason")
  closedAt            DateTime?                  @map("closed_at") @db.Timestamptz(6)
  closedById          String?                    @map("closed_by_id") @db.Uuid
  orderId             String?                    @map("order_id") @db.Uuid
  invoiceDocumentId   String?                    @map("invoice_document_id") @db.Uuid
  createdAt           DateTime                   @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime                   @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById         String?                    @map("created_by_id") @db.Uuid

  tenant           Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
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

**3. Add reverse relation arrays to existing models:**

- `Tenant` model (after `billingDocuments BillingDocument[]` at ~line 184): add `billingServiceCases BillingServiceCase[]`
- `CrmAddress` model (after `billingDocumentsInvoice` at ~line 302): add `billingServiceCases BillingServiceCase[]`
- `CrmContact` model (after `billingDocuments BillingDocument[]` at ~line 338): add `billingServiceCases BillingServiceCase[]`
- `CrmInquiry` model (after `billingDocuments BillingDocument[]` at ~line 507): add `billingServiceCases BillingServiceCase[]`
- `Employee` model (in relations section): add `assignedServiceCases BillingServiceCase[]`
- `Order` model (after `billingDocuments BillingDocument[]` at ~line 1460): add `billingServiceCases BillingServiceCase[]`
- `BillingDocument` model (after `positions` at ~line 653): add `billingServiceCases BillingServiceCase[]`

### Verification

```bash
pnpm db:start                    # Ensure Supabase is running
supabase migration up --local    # Apply migration
pnpm db:generate                 # Regenerate Prisma client
pnpm typecheck                   # Confirm no new type errors from schema changes
```

---

## Phase 2: Permissions & NumberSequence

### Files

| File | Action |
|------|--------|
| `src/lib/auth/permission-catalog.ts` | MODIFY |
| `src/lib/services/number-sequence-service.ts` | MODIFY |

### Implementation Details

#### Permission Catalog: `src/lib/auth/permission-catalog.ts`

Add 4 permissions after the `billing_documents.finalize` entry (after line 253):

```ts
  // Billing Service Cases
  p("billing_service_cases.view", "billing_service_cases", "view", "View service cases"),
  p("billing_service_cases.create", "billing_service_cases", "create", "Create service cases"),
  p("billing_service_cases.edit", "billing_service_cases", "edit", "Edit service cases"),
  p("billing_service_cases.delete", "billing_service_cases", "delete", "Delete service cases"),
```

Update the comment at top — change `53 permissions` to `57 permissions`.

#### NumberSequence: `src/lib/services/number-sequence-service.ts`

Add to `DEFAULT_PREFIXES` (after `credit_note: "G-"` at ~line 40):

```ts
  // Billing service cases
  service_case: "KD-",
```

### Verification

```bash
pnpm typecheck
# Manually verify: node -e "const { permissionIdByKey } = require('./src/lib/auth/permission-catalog'); console.log(permissionIdByKey('billing_service_cases.view'))"
```

---

## Phase 3: Repository

### Files

| File | Action |
|------|--------|
| `src/lib/services/billing-service-case-repository.ts` | CREATE |

### Implementation Details

Follow the exact pattern from `src/lib/services/billing-document-repository.ts`. All functions take `prisma: PrismaClient` and `tenantId: string` as first arguments.

```ts
import type { PrismaClient, BillingServiceCaseStatus } from "@/generated/prisma/client"

// --- Includes (shared across find operations) ---
const DETAIL_INCLUDE = {
  address: true,
  contact: true,
  inquiry: { select: { id: true, number: true, title: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
  order: { select: { id: true, code: true, name: true } },
  invoiceDocument: { select: { id: true, number: true, type: true, status: true } },
}

const LIST_INCLUDE = {
  address: true,
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
}
```

**Functions to implement:**

1. **`findMany(prisma, tenantId, params)`** — Paginated list with filters: `status?`, `addressId?`, `assignedToId?`, `search?`, `page`, `pageSize`. Search on `number`, `title`, `description`. Returns `{ items, total }` using `Promise.all([findMany, count])`. Use `LIST_INCLUDE`. Order by `createdAt: "desc"`.

2. **`findById(prisma, tenantId, id)`** — Single lookup with `DETAIL_INCLUDE`. Use `findFirst` with `{ id, tenantId }`.

3. **`create(prisma, data)`** — Create with full data object. Include `DETAIL_INCLUDE` on return.

4. **`update(prisma, tenantId, id, data)`** — Use `updateMany` + re-fetch pattern (same as billing-document-repository). Returns updated record with `DETAIL_INCLUDE`.

5. **`remove(prisma, tenantId, id)`** — `deleteMany` pattern. Returns `boolean` (count > 0).

### Verification

```bash
pnpm typecheck
```

---

## Phase 4: Service

### Files

| File | Action |
|------|--------|
| `src/lib/services/billing-service-case-service.ts` | CREATE |

### Implementation Details

Follow `billing-document-service.ts` pattern exactly. Import repo, numberSeqService, orderService, and billingDocService.

```ts
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./billing-service-case-repository"
import * as numberSeqService from "./number-sequence-service"
import * as orderService from "./order-service"
import * as billingDocService from "./billing-document-service"
```

#### Error Classes

```ts
export class BillingServiceCaseNotFoundError extends Error {
  constructor(message = "Service case not found") {
    super(message); this.name = "BillingServiceCaseNotFoundError"
  }
}
export class BillingServiceCaseValidationError extends Error {
  constructor(message: string) {
    super(message); this.name = "BillingServiceCaseValidationError"
  }
}
export class BillingServiceCaseConflictError extends Error {
  constructor(message: string) {
    super(message); this.name = "BillingServiceCaseConflictError"
  }
}
```

These follow the naming convention recognized by `handleServiceError` in `src/trpc/errors.ts` (line 17: `NotFoundError`, line 27: `ValidationError`, line 40: `ConflictError`).

#### Service Functions

1. **`list(prisma, tenantId, params)`** — Delegates to `repo.findMany`. Params: `{ status?, addressId?, assignedToId?, search?, page, pageSize }`.

2. **`getById(prisma, tenantId, id)`** — Calls `repo.findById`. Throws `BillingServiceCaseNotFoundError` if null.

3. **`create(prisma, tenantId, input, createdById)`** — Input: `{ title, addressId, contactId?, inquiryId?, description?, assignedToId?, customerNotifiedCost?, reportedAt? }`.
   - Validate address belongs to tenant: `prisma.crmAddress.findFirst({ where: { id: input.addressId, tenantId } })`. Throw validation error if null.
   - Validate contact belongs to address if provided.
   - Validate inquiry belongs to tenant if provided.
   - Generate number: `await numberSeqService.getNextNumber(prisma, tenantId, "service_case")`
   - Initial status: `OPEN`
   - If `assignedToId` is provided at creation, set status to `IN_PROGRESS`
   - Call `repo.create(prisma, { tenantId, number, title, addressId, ... })`.

4. **`update(prisma, tenantId, input)`** — Input: `{ id, title?, contactId?, description?, assignedToId?, customerNotifiedCost? }`.
   - Fetch existing, throw NotFound if null.
   - Assert status is OPEN or IN_PROGRESS (reject CLOSED/INVOICED).
   - Build partial data object (same pattern as billing-document-service `update`).
   - Auto-transition: if current status is OPEN and any meaningful update occurs, set status to IN_PROGRESS.
   - Call `repo.update`.

5. **`close(prisma, tenantId, id, closingReason, closedById)`**
   - Fetch existing, throw NotFound.
   - Assert status is OPEN or IN_PROGRESS. Throw validation error if CLOSED/INVOICED.
   - Set: `status: "CLOSED"`, `closingReason`, `closedAt: new Date()`, `closedById`.
   - Call `repo.update`.

6. **`createInvoice(prisma, tenantId, id, positions, createdById)`** — `positions` is an array of `{ description, quantity?, unit?, unitPrice?, flatCosts?, vatRate? }`.
   - Fetch existing, throw NotFound.
   - Assert status is CLOSED. Throw validation error otherwise.
   - Assert no existing invoiceDocumentId (prevent duplicate invoice).
   - Create BillingDocument of type INVOICE: call `billingDocService.create(prisma, tenantId, { type: "INVOICE", addressId: existing.addressId, contactId: existing.contactId }, createdById)`.
   - Add positions to the invoice: loop through positions array, call `billingDocService.addPosition(prisma, tenantId, { documentId: invoice.id, type: "FREE", ...pos })`.
   - Update service case: `repo.update(prisma, tenantId, id, { invoiceDocumentId: invoice.id, status: "INVOICED" })`.
   - Return the updated service case.

7. **`createOrder(prisma, tenantId, id, params, createdById)`** — `params`: `{ orderName?, orderDescription? }`.
   - Fetch existing, throw NotFound.
   - Assert status is OPEN or IN_PROGRESS.
   - Assert no existing orderId (prevent duplicate order).
   - Get address for customer name.
   - Create Order: `orderService.create(prisma, tenantId, { code: existing.number, name: params.orderName || existing.title, description: params.orderDescription, customer: address.company || undefined, status: "active" })`.
   - Update service case: `repo.update(prisma, tenantId, id, { orderId: newOrder.id })`.
   - Return updated service case.

8. **`remove(prisma, tenantId, id)`**
   - Fetch existing, throw NotFound.
   - Assert status is OPEN or IN_PROGRESS.
   - Assert no linked invoice (`invoiceDocumentId` is null).
   - Call `repo.remove`. Throw NotFound if false.

### Verification

```bash
pnpm typecheck
```

---

## Phase 5: tRPC Router

### Files

| File | Action |
|------|--------|
| `src/trpc/routers/billing/serviceCases.ts` | CREATE |
| `src/trpc/routers/billing/index.ts` | MODIFY |

### Implementation Details

#### Router: `src/trpc/routers/billing/serviceCases.ts`

Follow the exact pattern from `src/trpc/routers/billing/documents.ts`:

```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as serviceCaseService from "@/lib/services/billing-service-case-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const SC_VIEW = permissionIdByKey("billing_service_cases.view")!
const SC_CREATE = permissionIdByKey("billing_service_cases.create")!
const SC_EDIT = permissionIdByKey("billing_service_cases.edit")!
const SC_DELETE = permissionIdByKey("billing_service_cases.delete")!

// --- Base procedure with module guard ---
const billingProcedure = tenantProcedure.use(requireModule("billing"))

// --- Input Schemas ---
const serviceCaseStatusEnum = z.enum(["OPEN", "IN_PROGRESS", "CLOSED", "INVOICED"])

const listInput = z.object({
  status: serviceCaseStatusEnum.optional(),
  addressId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

const createInput = z.object({
  title: z.string().min(1).max(255),
  addressId: z.string().uuid(),
  contactId: z.string().uuid().optional(),
  inquiryId: z.string().uuid().optional(),
  description: z.string().optional(),
  assignedToId: z.string().uuid().optional(),
  customerNotifiedCost: z.boolean().optional(),
  reportedAt: z.coerce.date().optional(),
})

const updateInput = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
  contactId: z.string().uuid().nullable().optional(),
  description: z.string().nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  customerNotifiedCost: z.boolean().optional(),
})

const idInput = z.object({ id: z.string().uuid() })

const closeInput = z.object({
  id: z.string().uuid(),
  closingReason: z.string().min(1),
})

const createInvoiceInput = z.object({
  id: z.string().uuid(),
  positions: z.array(z.object({
    description: z.string(),
    quantity: z.number().optional(),
    unit: z.string().optional(),
    unitPrice: z.number().optional(),
    flatCosts: z.number().optional(),
    vatRate: z.number().optional(),
  })).min(1),
})

const createOrderInput = z.object({
  id: z.string().uuid(),
  orderName: z.string().optional(),
  orderDescription: z.string().optional(),
})
```

**Procedures:**

| Procedure | Type | Permission | Description |
|-----------|------|-----------|-------------|
| `list` | query | SC_VIEW | Paginated list. `try { return await serviceCaseService.list(ctx.prisma as unknown as PrismaClient, ctx.tenantId!, input) } catch (err) { handleServiceError(err) }` |
| `getById` | query | SC_VIEW | Single detail. |
| `create` | mutation | SC_CREATE | Auto-generates number. Passes `ctx.user!.id` as createdById. |
| `update` | mutation | SC_EDIT | Partial update, rejects CLOSED/INVOICED. |
| `close` | mutation | SC_EDIT | Sets CLOSED with reason. Passes `ctx.user!.id` as closedById. |
| `createInvoice` | mutation | SC_EDIT | Creates INVOICE BillingDocument. Passes `ctx.user!.id`. |
| `createOrder` | mutation | SC_EDIT | Creates Terp Order for time tracking. |
| `delete` | mutation | SC_DELETE | Only OPEN/IN_PROGRESS without linked invoice. Returns `{ success: true }`. |

Every procedure body follows the exact try/catch pattern:
```ts
async ({ ctx, input }) => {
  try {
    return await serviceCaseService.methodName(
      ctx.prisma as unknown as PrismaClient,
      ctx.tenantId!,
      ...args
    )
  } catch (err) {
    handleServiceError(err)
  }
}
```

Export as `billingServiceCasesRouter`.

#### Billing Index: `src/trpc/routers/billing/index.ts`

Modify to add the new router:

```ts
import { createTRPCRouter } from "@/trpc/init"
import { billingDocumentsRouter } from "./documents"
import { billingServiceCasesRouter } from "./serviceCases"

export const billingRouter = createTRPCRouter({
  documents: billingDocumentsRouter,
  serviceCases: billingServiceCasesRouter,
})
```

Update the comment at top to mention both documents and serviceCases.

### Verification

```bash
pnpm typecheck
```

---

## Phase 6: Unit & Integration Tests

### Files

| File | Action |
|------|--------|
| `src/lib/services/__tests__/billing-service-case-service.test.ts` | CREATE |
| `src/trpc/routers/__tests__/billingServiceCases-router.test.ts` | CREATE |

### Implementation Details

#### Unit Tests: `src/lib/services/__tests__/billing-service-case-service.test.ts`

Follow pattern from `billing-document-service.test.ts` exactly:

**Constants:**
```ts
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ADDRESS_ID = "b0000000-0000-4000-b000-000000000001"
const CASE_ID = "d0000000-0000-4000-a000-000000000010"
const ORDER_ID = "f0000000-0000-4000-a000-000000000001"
const INVOICE_ID = "d0000000-0000-4000-a000-000000000020"
const EMPLOYEE_ID = "e0000000-0000-4000-a000-000000000001"
```

**Mock objects:** `mockAddress`, `mockServiceCase` (status OPEN), `mockClosedCase`, `mockInvoicedCase`.

**`createMockPrisma(overrides)`:** Same factory pattern, with:
- `crmAddress: { findFirst: vi.fn() }`
- `crmContact: { findFirst: vi.fn() }`
- `billingServiceCase: { findMany, count, findFirst, create, updateMany, deleteMany }`
- `numberSequence: { upsert: vi.fn() }`
- `billingDocument: { findFirst, create }` (for createInvoice)
- `billingDocumentPosition: { findFirst, create, findMany }` (for createInvoice)
- `order: { findFirst, create }` (for createOrder — but since we call through orderService, mock accordingly)

**Test describe blocks:**

1. `describe("create")`:
   - `it("creates with auto-generated number")` — mock numberSequence.upsert to return `{ prefix: "KD-", nextValue: 2 }`, verify result.number is "KD-1"
   - `it("initial status is OPEN")` — verify status field
   - `it("sets status to IN_PROGRESS when assignedToId provided")` — verify auto-transition
   - `it("rejects if address not in tenant")` — mock address findFirst as null, expect throw
   - `it("rejects if contact not found for address")` — mock contact findFirst as null

2. `describe("update")`:
   - `it("updates OPEN service case fields")` — happy path
   - `it("auto-transitions OPEN to IN_PROGRESS on update")` — verify status change
   - `it("rejects when status is CLOSED")` — expect throw
   - `it("rejects when status is INVOICED")` — expect throw

3. `describe("close")`:
   - `it("sets CLOSED, closedAt, closingReason")` — verify updateMany called with correct data
   - `it("rejects if already CLOSED")` — expect throw
   - `it("rejects if already INVOICED")` — expect throw

4. `describe("createInvoice")`:
   - `it("creates BillingDocument of type INVOICE")` — mock billingDocument.create, verify type is INVOICE
   - `it("links invoice to service case")` — verify updateMany sets invoiceDocumentId
   - `it("sets status to INVOICED")` — verify status in update
   - `it("rejects if status is not CLOSED")` — test with OPEN and IN_PROGRESS
   - `it("rejects if invoice already exists")` — test with existing invoiceDocumentId

5. `describe("createOrder")`:
   - `it("creates Terp Order and links")` — mock order create, verify orderId set
   - `it("rejects if order already linked")` — test with existing orderId

6. `describe("remove")`:
   - `it("deletes OPEN service case")` — happy path
   - `it("rejects when CLOSED")` — expect throw
   - `it("rejects when has linked invoice")` — expect throw

#### Router Tests: `src/trpc/routers/__tests__/billingServiceCases-router.test.ts`

Follow pattern from `billingDocuments-router.test.ts` exactly:

```ts
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { billingServiceCasesRouter } from "../billing/serviceCases"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// Mock the db module used by requireModule middleware
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "billing" }),
    },
  },
}))
```

**Permission constants:**
```ts
const SC_VIEW = permissionIdByKey("billing_service_cases.view")!
const SC_CREATE = permissionIdByKey("billing_service_cases.create")!
const SC_EDIT = permissionIdByKey("billing_service_cases.edit")!
const SC_DELETE = permissionIdByKey("billing_service_cases.delete")!
const ALL_PERMS = [SC_VIEW, SC_CREATE, SC_EDIT, SC_DELETE]
```

**Helper functions:** `createTestContext(prisma, permissions)`, `createNoPermContext(prisma)`, `withModuleMock(prisma)` — same as billingDocuments router tests.

**Test describe blocks:**

1. `describe("billing.serviceCases.list")`:
   - `it("returns paginated list")` — mock billingServiceCase findMany/count
   - `it("requires billing_service_cases.view permission")` — no perms, expect throw "Insufficient permissions"
   - `it("filters by status")` — verify findMany where clause

2. `describe("billing.serviceCases.getById")`:
   - `it("returns service case with relations")` — mock findFirst
   - `it("throws NOT_FOUND for missing case")` — mock null

3. `describe("billing.serviceCases.create")`:
   - `it("creates with auto-generated number")` — mock address, numberSequence, create
   - `it("requires billing_service_cases.create permission")` — expect throw

4. `describe("billing.serviceCases.close")`:
   - `it("sets status and closing reason")` — verify updateMany data
   - `it("requires billing_service_cases.edit permission")` — expect throw

5. `describe("billing.serviceCases.createInvoice")`:
   - `it("creates linked invoice document")` — full mock chain
   - `it("requires billing_service_cases.edit permission")` — expect throw

6. `describe("billing.serviceCases.delete")`:
   - `it("deletes OPEN service case")` — mock happy path
   - `it("requires billing_service_cases.delete permission")` — expect throw

### Verification

```bash
pnpm vitest run src/lib/services/__tests__/billing-service-case-service.test.ts
pnpm vitest run src/trpc/routers/__tests__/billingServiceCases-router.test.ts
```

---

## Phase 7: Hooks

### Files

| File | Action |
|------|--------|
| `src/hooks/use-billing-service-cases.ts` | CREATE |
| `src/hooks/index.ts` | MODIFY |

### Implementation Details

#### Hooks: `src/hooks/use-billing-service-cases.ts`

Follow `use-billing-documents.ts` pattern exactly:

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
```

**Hooks to implement:**

1. **`useBillingServiceCases(options)`** — options: `{ enabled?, status?, addressId?, assignedToId?, search?, page?, pageSize? }`. Uses `trpc.billing.serviceCases.list.queryOptions(...)`.

2. **`useBillingServiceCase(id, enabled)`** — Uses `trpc.billing.serviceCases.getById.queryOptions({ id }, { enabled: enabled && !!id })`.

3. **`useCreateBillingServiceCase()`** — Mutation. OnSuccess: invalidate `list` queryKey.

4. **`useUpdateBillingServiceCase()`** — Mutation. OnSuccess: invalidate `list` and `getById` queryKeys.

5. **`useCloseBillingServiceCase()`** — Mutation. OnSuccess: invalidate `list` and `getById`.

6. **`useCreateInvoiceFromServiceCase()`** — Mutation. OnSuccess: invalidate `list` and `getById`.

7. **`useCreateOrderFromServiceCase()`** — Mutation. OnSuccess: invalidate `list` and `getById`.

8. **`useDeleteBillingServiceCase()`** — Mutation. OnSuccess: invalidate `list`.

#### Hooks Index: `src/hooks/index.ts`

Add after the Billing Documents export block (after line ~743):

```ts
// Billing Service Cases
export {
  useBillingServiceCases,
  useBillingServiceCase,
  useCreateBillingServiceCase,
  useUpdateBillingServiceCase,
  useCloseBillingServiceCase,
  useCreateInvoiceFromServiceCase,
  useCreateOrderFromServiceCase,
  useDeleteBillingServiceCase,
} from './use-billing-service-cases'
```

### Verification

```bash
pnpm typecheck
```

---

## Phase 8: UI Components

### Files

| File | Action |
|------|--------|
| `src/components/billing/service-case-status-badge.tsx` | CREATE |
| `src/components/billing/service-case-list.tsx` | CREATE |
| `src/components/billing/service-case-form-sheet.tsx` | CREATE |
| `src/components/billing/service-case-detail.tsx` | CREATE |
| `src/components/billing/service-case-close-dialog.tsx` | CREATE |
| `src/components/billing/service-case-invoice-dialog.tsx` | CREATE |
| `src/app/[locale]/(dashboard)/orders/service-cases/page.tsx` | CREATE |
| `src/app/[locale]/(dashboard)/orders/service-cases/[id]/page.tsx` | CREATE |
| `src/components/layout/sidebar/sidebar-nav-config.ts` | MODIFY |
| `messages/de.json` | MODIFY |
| `messages/en.json` | MODIFY |

### Implementation Details

#### `service-case-status-badge.tsx`

Follow `document-status-badge.tsx` pattern:

```tsx
'use client'
import { Badge } from '@/components/ui/badge'

const STATUS_CONFIG: Record<string, { label: string; variant: string }> = {
  OPEN: { label: 'Offen', variant: 'bg-gray-100 text-gray-800' },
  IN_PROGRESS: { label: 'In Bearbeitung', variant: 'bg-blue-100 text-blue-800' },
  CLOSED: { label: 'Abgeschlossen', variant: 'bg-green-100 text-green-800' },
  INVOICED: { label: 'Abgerechnet', variant: 'bg-purple-100 text-purple-800' },
}

export function ServiceCaseStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, variant: 'bg-gray-100 text-gray-800' }
  return <Badge variant="outline" className={config.variant}>{config.label}</Badge>
}
```

#### `service-case-list.tsx`

Follow `document-list.tsx` pattern. Key differences:
- Title: "Kundendienst"
- Columns: Nummer, Titel, Kunde, Zuständig, Status, Gemeldet am
- Filters: status dropdown (OPEN/IN_PROGRESS/CLOSED/INVOICED), search field, assigned-to filter
- "Neuer Serviceauftrag" button opens form sheet (not navigating to /new)
- Row click navigates to `/orders/service-cases/${id}`
- Uses `useBillingServiceCases` hook
- Uses `ServiceCaseStatusBadge`
- Form sheet rendered inline, controlled by `useState`

#### `service-case-form-sheet.tsx`

Follow `inquiry-form-sheet.tsx` pattern:
- Sheet with side="right", className="w-full sm:max-w-lg flex flex-col overflow-hidden"
- `isEdit` prop toggles between create/edit modes
- Fields:
  - **Titel** (text input, required)
  - **Kundenadresse** (combobox/select from useCrmAddresses, required)
  - **Kontaktperson** (select from address contacts, optional)
  - **Anfrage** (select from useCrmInquiries, optional)
  - **Beschreibung** (textarea, optional)
  - **Zuständiger Mitarbeiter** (select from useEmployees, optional)
  - **Auf Kosten hingewiesen** (checkbox, optional)
  - **Gemeldet am** (date picker, default today)
- Footer: Cancel + Save buttons
- `useEffect` to reset form when `open` changes
- On create: call `useCreateBillingServiceCase().mutateAsync()`
- On edit: call `useUpdateBillingServiceCase().mutateAsync()`

#### `service-case-detail.tsx`

Follow `document-detail.tsx` pattern. Takes `id: string` prop.

**Header:** Back button + Title + Number badge + Status badge

**Action Bar (conditional on status):**
- OPEN/IN_PROGRESS: "Bearbeiten", "Auftrag erstellen" (if no orderId), "Abschließen", "Löschen"
- CLOSED: "Rechnung erstellen" (if no invoiceDocumentId)
- INVOICED: No actions (read-only)

**Content (using Tabs):**
- **Tab "Übersicht"**: Cards showing:
  - Adresse (company, street, city), Kontaktperson
  - Details: Gemeldet am, Auf Kosten hingewiesen, Beschreibung
  - Zuständiger Mitarbeiter
  - Verknüpfter Auftrag (link to order if orderId set)
  - Verknüpfte Rechnung (link to invoice document if invoiceDocumentId set)
  - Verknüpfte Anfrage (link to inquiry if inquiryId set)
- **Tab "Verlauf"** (optional — can be added later)

**Immutable notice:** Alert banner when status is CLOSED or INVOICED.

**Dialogs:** Close dialog and Invoice dialog rendered at bottom, controlled by state.

#### `service-case-close-dialog.tsx`

Follow `inquiry-close-dialog.tsx` pattern:
- Dialog with title "Serviceauftrag abschließen"
- Description text explaining finality
- Closing reason textarea (required)
- Cancel/Confirm buttons
- On confirm: call `useCloseBillingServiceCase().mutateAsync({ id, closingReason })`

#### `service-case-invoice-dialog.tsx`

Custom dialog for creating invoice:
- Dialog with title "Rechnung erstellen"
- Description: "Erstellt eine Rechnung aus diesem Serviceauftrag"
- Dynamic position list:
  - Each position has: description (text), quantity (number), unit (text), unitPrice (number), vatRate (number)
  - "Position hinzufügen" button to add rows
  - Delete button per row
- Footer: Cancel / "Rechnung erstellen" button
- On confirm: call `useCreateInvoiceFromServiceCase().mutateAsync({ id, positions })` then navigate to the invoice document

#### Page Routes

**`src/app/[locale]/(dashboard)/orders/service-cases/page.tsx`:**
```tsx
import { ServiceCaseList } from "@/components/billing/service-case-list"

export default function BillingServiceCasesPage() {
  return <ServiceCaseList />
}
```

**`src/app/[locale]/(dashboard)/orders/service-cases/[id]/page.tsx`:**
```tsx
'use client'

import { useParams } from 'next/navigation'
import { ServiceCaseDetail } from "@/components/billing/service-case-detail"

export default function BillingServiceCaseDetailPage() {
  const params = useParams<{ id: string }>()
  return (
    <div className="container mx-auto py-6">
      <ServiceCaseDetail id={params.id} />
    </div>
  )
}
```

#### Sidebar Navigation: `src/components/layout/sidebar/sidebar-nav-config.ts`

Add import for `Wrench` icon at the top (from lucide-react).

Add new item to the `billingSection` items array (after the `billingDocuments` entry at line ~319):

```ts
{
  titleKey: 'billingServiceCases',
  href: '/orders/service-cases',
  icon: Wrench,
  module: 'billing',
  permissions: ['billing_service_cases.view'],
},
```

#### Translations

**`messages/de.json`** — In the `nav` section (after `"billingDocuments": "Belege"` at ~line 111):
```json
"billingServiceCases": "Kundendienst",
```

**`messages/en.json`** — In the `nav` section (after `"billingDocuments": "Documents"` at ~line 111):
```json
"billingServiceCases": "Service Cases",
```

### Verification

```bash
pnpm typecheck
pnpm dev  # Manual testing: navigate to /orders/service-cases, create a case, test workflow
```

---

## Phase 9: CRM Integration

### Files

| File | Action |
|------|--------|
| `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx` | MODIFY |
| `messages/de.json` | MODIFY |
| `messages/en.json` | MODIFY |

### Implementation Details

#### Address Detail Page

The address detail page currently has a "documents" tab that shows a placeholder "In Vorbereitung -- ORD_01" (line 304-309). Two changes:

1. **Replace the documents tab placeholder** with actual `BillingDocumentList` filtered by `addressId`:
```tsx
<TabsContent value="documents" className="mt-6">
  <BillingDocumentList addressId={address.id} />
</TabsContent>
```
Import `BillingDocumentList` from `@/components/billing/document-list`.

2. **Add a "Service Cases" tab** after the documents tab:
- Add `TabsTrigger` with value "serviceCases" and label from translations (`t('tabServiceCases')`)
- Add `TabsContent` with `ServiceCaseList` component filtered by `addressId`:
```tsx
<TabsTrigger value="serviceCases">{t('tabServiceCases')}</TabsTrigger>
...
<TabsContent value="serviceCases" className="mt-6">
  <ServiceCaseList addressId={address.id} />
</TabsContent>
```
Import `ServiceCaseList` from `@/components/billing/service-case-list`.

The `ServiceCaseList` component needs to accept an optional `addressId` prop (like `BillingDocumentList` does) and pass it to the `useBillingServiceCases` hook.

#### Translations

Add to `messages/de.json` in the `crmAddresses` section:
```json
"tabServiceCases": "Kundendienst"
```

Add to `messages/en.json` in the `crmAddresses` section:
```json
"tabServiceCases": "Service Cases"
```

### Verification

```bash
pnpm typecheck
pnpm dev  # Navigate to /crm/addresses/[id], verify documents tab works and service cases tab appears
```

---

## Phase 10: Browser E2E Tests

### Files

| File | Action |
|------|--------|
| `src/e2e-browser/31-billing-service-cases.spec.ts` | CREATE |

### Implementation Details

Follow `30-billing-documents.spec.ts` pattern exactly:

```ts
import { test, expect, type Page } from "@playwright/test";
import { navigateTo, waitForTableLoad } from "./helpers/nav";
import {
  fillInput,
  submitAndWaitForClose,
  waitForSheet,
  expectTableContains,
} from "./helpers/forms";

const COMPANY = "E2E Kundendienst GmbH";
```

**Test suite:** `test.describe.serial("UC-ORD-02: Service Cases (Kundendienst)", () => { ... })`

**Tests (serial order):**

1. **"create address for service case tests"**
   - Navigate to `/crm/addresses`
   - Create new address with COMPANY name
   - Verify in table

2. **"navigate to service cases page"**
   - `navigateTo(page, "/orders/service-cases")`
   - Expect heading "Kundendienst" visible

3. **"create a service case"**
   - Click "Neuer Serviceauftrag" button
   - Wait for sheet
   - Fill title: "Heizungsreparatur"
   - Select customer address (COMPANY)
   - Submit and wait for close
   - Verify "KD-" appears in table

4. **"open service case detail"**
   - Click the row with "KD-" number
   - Wait for URL `/orders/service-cases/[id]`
   - Verify title "Heizungsreparatur" visible
   - Verify status "Offen" visible

5. **"close service case"**
   - Click "Abschließen" button
   - Dialog appears, fill closing reason: "Reparatur abgeschlossen"
   - Confirm
   - Verify status changes to "Abgeschlossen"

6. **"closed service case is immutable"**
   - Verify "Bearbeiten" button is not visible
   - Verify "Rechnung erstellen" button IS visible

7. **"create invoice from service case"**
   - Click "Rechnung erstellen"
   - Dialog appears
   - Add position: description "Reparaturarbeiten", quantity 2, unit "Std", unitPrice 85, vatRate 19
   - Click "Rechnung erstellen"
   - Verify status changes to "Abgerechnet"
   - Verify "Verknüpfte Rechnung" link is visible

8. **"verify service case in address detail"**
   - Navigate to `/crm/addresses`
   - Find and click COMPANY address
   - Click "Kundendienst" tab
   - Verify "KD-" and "Heizungsreparatur" appear

### Verification

```bash
pnpm exec playwright test src/e2e-browser/31-billing-service-cases.spec.ts --headed
```

---

## Phase 11: Handbook Documentation

### Files

| File | Action |
|------|--------|
| `docs/TERP_HANDBUCH.md` | MODIFY |

### Implementation Details

Add a new section **13.10 Kundendienst (Serviceaufträge)** between section 13.9 and section 14 (Glossar).

Also update the Glossar (section 14) and the Seitenübersicht (Anhang).

#### Section 13.10: Kundendienst (Serviceaufträge)

Insert after the `---` following section 13.9 (after line ~5285), before `## 14. Glossar`:

```markdown
### 13.10 Kundendienst (Serviceaufträge)

**Was ist es?** Der Kundendienst verwaltet Serviceaufträge -- Wartungs-, Reparatur- und Vor-Ort-Einsätze für Kunden. Jeder Serviceauftrag durchläuft einen Workflow von der Erstellung bis zur Rechnungsstellung.

**Wozu dient es?** Serviceaufträge erfassen, einem Mitarbeiter zuweisen, nach Abschluss eine Rechnung generieren und optional einen Terp-Auftrag für die Zeiterfassung erstellen.

> Modul: **Billing** muss aktiviert sein

> Berechtigung: `billing_service_cases.view`, `billing_service_cases.create`, `billing_service_cases.edit`, `billing_service_cases.delete`

Aufträge > Kundendienst

Sie sehen die Liste aller Serviceaufträge des aktiven Mandanten.

#### Serviceauftragsliste

Tabelle mit Spalten:

| Spalte | Beschreibung |
|--------|-------------|
| **Nummer** | Auto-generierte Nummer (z.B. KD-1, KD-42) |
| **Titel** | Bezeichnung des Serviceauftrags |
| **Kunde** | Firmenname der verknüpften Adresse |
| **Zuständig** | Zugewiesener Mitarbeiter |
| **Status** | Offen, In Bearbeitung, Abgeschlossen, Abgerechnet |
| **Gemeldet am** | Datum der Meldung |

**Filter:**
- **Status-Filter**: Dropdown mit Statuswerten
- **Suchfeld**: Suche nach Nummer, Titel, Beschreibung

#### Serviceauftrag anlegen

1. **"Neuer Serviceauftrag"** (Kundendienstliste, oben rechts)
2. Seitenformular öffnet sich
3. **Titel** eintragen (Pflicht)
4. **Kundenadresse** auswählen (Pflicht)
5. Optionale Felder:
   - **Kontaktperson**: Ansprechpartner aus der Adresse
   - **Anfrage**: Verknüpfung zu einer CRM-Anfrage
   - **Beschreibung**: Detailbeschreibung des Auftrags
   - **Zuständiger Mitarbeiter**: Mitarbeiter zuweisen
   - **Auf Kosten hingewiesen**: Checkbox
   - **Gemeldet am**: Datum (Standard = heute)
6. **"Speichern"**
7. ✅ Serviceauftrag wird mit Status **Offen** angelegt. Nummer wird automatisch vergeben (z.B. KD-1).

#### Serviceauftrag bearbeiten

Bearbeitung ist nur im Status **Offen** oder **In Bearbeitung** möglich.

1. Serviceauftrag in der Liste anklicken
2. Detailseite öffnet sich
3. **"Bearbeiten"** klicken
4. Felder anpassen (Titel, Beschreibung, Kontaktperson, Zuständigkeit, etc.)
5. **"Speichern"**
6. ✅ Status wechselt automatisch von **Offen** zu **In Bearbeitung** bei der ersten Bearbeitung

#### Serviceauftrag abschließen

1. Detailseite des Serviceauftrags: **"Abschließen"** klicken
2. Dialog öffnet sich: **Abschlussgrund** eingeben (Pflicht)
3. **"Abschließen"** bestätigen
4. ✅ Status wechselt zu **Abgeschlossen**
5. ✅ Nach dem Abschließen ist der Serviceauftrag nicht mehr bearbeitbar

#### Rechnung erstellen

Nach dem Abschließen kann aus dem Serviceauftrag eine Rechnung generiert werden:

1. Detailseite (Status: Abgeschlossen): **"Rechnung erstellen"** klicken
2. Dialog öffnet sich mit Positionsliste
3. Positionen hinzufügen:
   - **Beschreibung**: Text der Position
   - **Menge**: Anzahl
   - **Einheit**: Stk, Std, etc.
   - **Einzelpreis**: Preis netto
   - **MwSt %**: z.B. 19%
4. **"Rechnung erstellen"** klicken
5. ✅ Ein Beleg vom Typ **Rechnung** (RE-) wird automatisch erstellt
6. ✅ Die Rechnung ist mit dem Serviceauftrag verknüpft
7. ✅ Status wechselt zu **Abgerechnet**

💡 **Tipp:** Die erstellte Rechnung wird als Beleg im Belegmodul (Aufträge > Belege) angezeigt und kann dort abgeschlossen und weiterverarbeitet werden.

#### Auftrag für Zeiterfassung erstellen

Optional kann aus einem offenen Serviceauftrag ein Terp-Auftrag erstellt werden:

1. Detailseite (Status: Offen oder In Bearbeitung): **"Auftrag erstellen"** klicken
2. Dialog: Auftragsbezeichnung und Beschreibung eingeben
3. ✅ Ein Terp-Auftrag wird erstellt — Mitarbeiter können Zeit darauf buchen
4. ✅ Der Auftrag ist auf der Detailseite als "Verknüpfter Auftrag" sichtbar

#### Status-Workflow

| Status | Badge | Bedeutung | Erlaubte Aktionen |
|--------|-------|-----------|-------------------|
| **OPEN** (Offen) | grau | Neu angelegt | Bearbeiten, Auftrag erstellen, Abschließen, Löschen |
| **IN_PROGRESS** (In Bearbeitung) | blau | In Arbeit | Bearbeiten, Auftrag erstellen, Abschließen, Löschen |
| **CLOSED** (Abgeschlossen) | grün | Erledigt | Rechnung erstellen |
| **INVOICED** (Abgerechnet) | lila | Rechnung erstellt | (keine) |

#### CRM-Integration

- **Adressdetailseite**: Tab **"Kundendienst"** zeigt alle Serviceaufträge dieser Adresse
- **Anfragen**: Serviceaufträge können mit CRM-Anfragen verknüpft werden

#### 13.10.1 Praxisbeispiel: Heizungsreparatur bis Rechnung

**Szenario:** Ein Kunde meldet eine defekte Heizung. Sie erstellen einen Serviceauftrag, weisen einen Techniker zu, schließen nach der Reparatur ab und erstellen eine Rechnung.

##### Schritt 1 — Serviceauftrag anlegen

1. 📍 Aufträge > Kundendienst
2. Klick auf **"Neuer Serviceauftrag"** (oben rechts)
3. Seitenformular öffnet sich
4. **Titel**: "Heizungsreparatur" eintragen
5. **Kundenadresse**: Dropdown öffnen → "Mustermann GmbH" auswählen
6. **Beschreibung**: "Heizung im EG fällt regelmäßig aus. Vor-Ort-Termin erforderlich."
7. **Auf Kosten hingewiesen**: Checkbox aktivieren
8. Klick auf **"Speichern"**
9. ✅ Serviceauftrag **KD-1** wird als **Offen** angelegt und erscheint in der Liste

##### Schritt 2 — Mitarbeiter zuweisen und Auftrag erstellen

1. In der Kundendienstliste: Klick auf **KD-1**
2. Detailseite öffnet sich
3. Klick auf **"Bearbeiten"**
4. **Zuständiger Mitarbeiter**: "Max Müller" auswählen
5. **"Speichern"**
6. ✅ Status wechselt automatisch zu **In Bearbeitung**
7. Klick auf **"Auftrag erstellen"**
8. **Auftragsbezeichnung**: "Heizungsreparatur Mustermann" eintragen
9. Bestätigen
10. ✅ Ein Terp-Auftrag wird erstellt — Max Müller kann ab sofort Zeit darauf buchen
11. ✅ "Verknüpfter Auftrag" wird auf der Detailseite angezeigt

##### Schritt 3 — Serviceauftrag abschließen

Die Reparatur wurde durchgeführt.

1. Detailseite KD-1: Klick auf **"Abschließen"**
2. Dialog: **Abschlussgrund**: "Thermostat getauscht, Heizung funktioniert wieder."
3. Klick auf **"Abschließen"**
4. ✅ Status wechselt zu **Abgeschlossen**
5. ✅ Hinweis-Banner: "Dieser Serviceauftrag ist abgeschlossen."
6. ✅ Die Schaltfläche **"Rechnung erstellen"** erscheint

##### Schritt 4 — Rechnung erstellen

1. Klick auf **"Rechnung erstellen"**
2. Dialog "Rechnung erstellen" öffnet sich
3. Klick auf **"Position hinzufügen"** und ausfüllen:

| Beschreibung | Menge | Einheit | Einzelpreis | MwSt % |
|-------------|-------|---------|-------------|--------|
| Arbeitszeit Techniker | 2 | Std | 85,00 | 19 |
| Thermostat (Ersatzteil) | 1 | Stk | 45,00 | 19 |
| Anfahrtspauschale | — | — | — | 19 |

   Für die Anfahrtspauschale: **Pauschalkosten**: 35,00

4. Klick auf **"Rechnung erstellen"**
5. ✅ Beleg **RE-1** wird als Entwurf erstellt
6. ✅ KD-1 Status wechselt zu **Abgerechnet**
7. ✅ Verknüpfte Rechnung RE-1 wird auf der Detailseite angezeigt

##### Schritt 5 — Rechnung abschließen

1. 📍 Aufträge > Belege → RE-1 anklicken
2. Positionen prüfen (alle drei wurden übernommen)
3. Klick auf **"Abschließen"** → Bestätigen
4. ✅ RE-1 ist festgeschrieben — Rechnung kann an den Kunden versendet werden

##### Ergebnis

Der vollständige Workflow ist abgeschlossen:

**KD-1** (Serviceauftrag) → **Auftrag** (Zeiterfassung) → **RE-1** (Rechnung)

Alle Verknüpfungen sind auf der Detailseite von KD-1 nachvollziehbar: Kundenadresse, zuständiger Mitarbeiter, verknüpfter Auftrag, und die erstellte Rechnung.

💡 **Tipp:** Die Rechnung RE-1 kann auch in die reguläre Belegkette eingebunden werden — z.B. wenn Sie vorab ein Angebot erstellt haben, können Sie das Angebot und die Serviceauftrag-Rechnung unabhängig verwalten.
```

#### Glossar Additions

Add to the Glossar table (section 14) in alphabetical order:

```markdown
| **Kundendienst** | Serviceauftrag für Wartung, Reparatur oder Vor-Ort-Einsatz mit Status-Workflow und Rechnungserstellung | 📍 Aufträge → Kundendienst |
| **Serviceauftrag** | Einzelner Kundendienst-Eintrag mit Nummer (KD-), Status und optionaler Auftrags-/Rechnungsverknüpfung | 📍 Aufträge → Kundendienst → Detail |
```

#### Seitenübersicht Additions

Add to the route table (Anhang) after the billing documents entries:

```markdown
| `/orders/service-cases` | Aufträge → Kundendienst | billing_service_cases.view |
| `/orders/service-cases/[id]` | Kundendienstliste → Zeile anklicken | billing_service_cases.view |
```

### Verification

- Read through the new handbook section and verify every step is click-by-click reproducible
- Check that numbering (13.10, 13.10.1) doesn't conflict
- Verify Glossar entries are in alphabetical order
- Verify route table matches actual routes

---

## Success Criteria

- [ ] `BillingServiceCase` model created with migration `000100`
- [ ] Prisma schema updated with enum, model, and all reverse relations
- [ ] 4 permissions added to catalog: `billing_service_cases.{view,create,edit,delete}`
- [ ] NumberSequence key `service_case` with prefix `KD-` added
- [ ] Repository with `findMany`, `findById`, `create`, `update`, `remove`
- [ ] Service with `list`, `getById`, `create`, `update`, `close`, `createInvoice`, `createOrder`, `remove`
- [ ] tRPC router with 8 procedures, all gated by `requireModule("billing")` and appropriate permissions
- [ ] 8 React hooks wrapping tRPC calls
- [ ] Status workflow: OPEN -> IN_PROGRESS -> CLOSED -> INVOICED
- [ ] Closed service cases are immutable
- [ ] `createInvoice` generates BillingDocument of type INVOICE linked back to service case
- [ ] `createOrder` creates Terp Order for time tracking
- [ ] UI: list page, detail page, form sheet, close dialog, invoice dialog, status badge
- [ ] Navigation entry in sidebar under "Fakturierung" section
- [ ] CRM address detail page shows "Kundendienst" tab with filtered service cases
- [ ] CRM address detail "Belege" tab shows actual documents (replacing placeholder)
- [ ] Unit tests: 15+ test cases covering all service methods and error paths
- [ ] Router tests: 10+ test cases covering permissions and procedure behavior
- [ ] Browser E2E test: 8 serial tests covering create, close, invoice, CRM integration
- [ ] Handbook section 13.10 with Praxisbeispiel, Glossar entries, and route table entries
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm lint` passes
