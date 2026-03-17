# Implementation Plan: CRM_03 Vorgänge / Inquiries (Inquiry Management)

Date: 2026-03-17

**Ticket:** `thoughts/shared/tickets/orgAuftrag/TICKET_CRM_03_VORGAENGE.md`
**Research:** `thoughts/shared/research/2026-03-17-CRM_03-vorgaenge.md`

---

## Overview

Implement the "Vorgang" (inquiry/process) management system for the CRM module. A Vorgang is the overarching bracket for all customer activities — correspondence, documents, tasks, and service cases are linked to it. Features include automatic number generation via NumberSequence (key: `"inquiry"`, prefix `"V-"`), a status workflow (OPEN → IN_PROGRESS → CLOSED → CANCELLED), immutability after closing, integration with the existing Terp Order system for time tracking, and a global inquiry list page at `/crm/inquiries` plus an inquiry tab on each address detail page.

**Total new files:** 16
**Total modified files:** 12

---

## Prerequisites

- CRM_01 (Addresses, Contacts) is implemented and merged
- CRM_02 (Correspondence) is implemented and merged
- The `crm_correspondences` table already has an `inquiry_id UUID` column (no FK constraint yet)
- The address detail page already has a placeholder "Anfragen" tab (line 293–299 of `page.tsx`)
- The NumberSequence service already supports auto-creation via upsert

---

## Phase 1: SQL Migration

### File to create: `supabase/migrations/20260101000097_create_crm_inquiries.sql`

```sql
-- CRM_03: Inquiry / Vorgang Management

CREATE TYPE crm_inquiry_status AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED', 'CANCELLED');

CREATE TABLE crm_inquiries (
    id               UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID              NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    number           VARCHAR(50)       NOT NULL,
    title            VARCHAR(255)      NOT NULL,
    address_id       UUID              NOT NULL REFERENCES crm_addresses(id) ON DELETE CASCADE,
    contact_id       UUID              REFERENCES crm_contacts(id) ON DELETE SET NULL,
    status           crm_inquiry_status NOT NULL DEFAULT 'OPEN',
    effort           VARCHAR(20),
    credit_rating    VARCHAR(50),
    notes            TEXT,
    order_id         UUID              REFERENCES orders(id) ON DELETE SET NULL,
    closed_at        TIMESTAMPTZ,
    closed_by_id     UUID,
    closing_reason   TEXT,
    closing_remarks  TEXT,
    created_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    created_by_id    UUID,

    CONSTRAINT uq_crm_inquiries_tenant_number UNIQUE (tenant_id, number)
);

CREATE INDEX idx_crm_inquiries_tenant_status ON crm_inquiries(tenant_id, status);
CREATE INDEX idx_crm_inquiries_tenant_address ON crm_inquiries(tenant_id, address_id);
CREATE INDEX idx_crm_inquiries_tenant_order ON crm_inquiries(tenant_id, order_id);

-- Add FK from crm_correspondences.inquiry_id to crm_inquiries.id
ALTER TABLE crm_correspondences
  ADD CONSTRAINT fk_crm_correspondences_inquiry
  FOREIGN KEY (inquiry_id) REFERENCES crm_inquiries(id) ON DELETE SET NULL;
```

### Verification

- [ ] SQL is syntactically valid (review manually)
- [ ] Migration file naming follows convention: `20260101000097_create_crm_inquiries.sql`
- [ ] FK from `crm_correspondences.inquiry_id` to `crm_inquiries.id` is added

### Dependencies

- None (first phase)

---

## Phase 2: Prisma Schema (Model, Enum, Relations)

### File to modify: `prisma/schema.prisma`

#### 2A. Add `CrmInquiryStatus` enum

Place after the existing `CrmCorrespondenceDirection` enum (before the CrmCorrespondence model, around line 360):

```prisma
enum CrmInquiryStatus {
  OPEN
  IN_PROGRESS
  CLOSED
  CANCELLED

  @@map("crm_inquiry_status")
}
```

#### 2B. Add `CrmInquiry` model

Place after the `CrmCorrespondence` model (after line 392), before the `UserGroup` section:

```prisma
// -----------------------------------------------------------------------------
// CrmInquiry
// -----------------------------------------------------------------------------
// Migration: 000097
//
// Inquiry / Vorgang — the overarching bracket for customer activities.
// Status workflow: OPEN → IN_PROGRESS → CLOSED / CANCELLED
// Closed inquiries are immutable.
model CrmInquiry {
  id             String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId       String           @map("tenant_id") @db.Uuid
  number         String           @db.VarChar(50)
  title          String           @db.VarChar(255)
  addressId      String           @map("address_id") @db.Uuid
  contactId      String?          @map("contact_id") @db.Uuid
  status         CrmInquiryStatus @default(OPEN)
  effort         String?          @db.VarChar(20)
  creditRating   String?          @map("credit_rating") @db.VarChar(50)
  notes          String?          @db.Text
  orderId        String?          @map("order_id") @db.Uuid
  closedAt       DateTime?        @map("closed_at") @db.Timestamptz(6)
  closedById     String?          @map("closed_by_id") @db.Uuid
  closingReason  String?          @map("closing_reason") @db.Text
  closingRemarks String?          @map("closing_remarks") @db.Text
  createdAt      DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById    String?          @map("created_by_id") @db.Uuid

  tenant          Tenant              @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  address         CrmAddress          @relation(fields: [addressId], references: [id], onDelete: Cascade)
  contact         CrmContact?         @relation(fields: [contactId], references: [id], onDelete: SetNull)
  order           Order?              @relation(fields: [orderId], references: [id], onDelete: SetNull)
  correspondences CrmCorrespondence[]

  @@unique([tenantId, number], map: "uq_crm_inquiries_tenant_number")
  @@index([tenantId, status])
  @@index([tenantId, addressId])
  @@index([tenantId, orderId])
  @@map("crm_inquiries")
}
```

#### 2C. Add reverse relations on existing models

**On `CrmAddress` model** (line ~294, after `correspondences CrmCorrespondence[]`):
```prisma
  inquiries       CrmInquiry[]
```

**On `CrmContact` model** (line ~327, after `correspondences CrmCorrespondence[]`):
```prisma
  inquiries       CrmInquiry[]
```

**On `CrmCorrespondence` model** (line ~386, after the `contact` relation):
```prisma
  inquiry CrmInquiry? @relation(fields: [inquiryId], references: [id], onDelete: SetNull)
```

**On `Order` model** (line ~1152, after `orderBookings OrderBooking[]`):
```prisma
  crmInquiries    CrmInquiry[]
```

**On `Tenant` model** (line ~181, after `crmCorrespondences CrmCorrespondence[]`):
```prisma
  crmInquiries                CrmInquiry[]
```

#### 2D. Regenerate Prisma Client

Run: `pnpm db:generate`

### Verification

- [ ] `pnpm db:generate` completes without errors
- [ ] `pnpm typecheck` shows no new type errors related to CrmInquiry
- [ ] All reverse relations compile (CrmAddress, CrmContact, CrmCorrespondence, Order, Tenant)

### Dependencies

- Phase 1 (migration must exist, though generation doesn't require running it)

---

## Phase 3: Permission Catalog

### File to modify: `src/lib/auth/permission-catalog.ts`

Add 4 permission entries after the CRM Correspondence block (after line 234, before the closing `]`):

```ts
  // CRM Inquiries
  p("crm_inquiries.view", "crm_inquiries", "view", "View CRM inquiries"),
  p("crm_inquiries.create", "crm_inquiries", "create", "Create CRM inquiries"),
  p("crm_inquiries.edit", "crm_inquiries", "edit", "Edit CRM inquiries"),
  p("crm_inquiries.delete", "crm_inquiries", "delete", "Delete CRM inquiries"),
```

### Verification

- [ ] `pnpm typecheck` passes
- [ ] `permissionIdByKey("crm_inquiries.view")` returns a valid UUID (test in REPL or unit test)
- [ ] All 4 keys resolve to unique UUIDs

### Dependencies

- None (independent, but logically after Phase 2)

---

## Phase 4: NumberSequence Integration

### File to modify: `src/lib/services/number-sequence-service.ts`

Add `inquiry` to the `DEFAULT_PREFIXES` map (line 29–32):

```ts
const DEFAULT_PREFIXES: Record<string, string> = {
  customer: "K-",
  supplier: "L-",
  inquiry: "V-",
}
```

### Verification

- [ ] `pnpm typecheck` passes
- [ ] The key `"inquiry"` with prefix `"V-"` is in the map

### Dependencies

- None

---

## Phase 5: Repository (Data Access Layer)

### File to create: `src/lib/services/crm-inquiry-repository.ts`

**Pattern:** Follow `crm-correspondence-repository.ts` exactly.

#### Functions

**`findMany(prisma, tenantId, params)`**

```ts
export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    addressId?: string
    search?: string
    status?: CrmInquiryStatus
    page: number
    pageSize: number
  }
): Promise<{ items: CrmInquiry[]; total: number }>
```

Build `where` clause:
- Always include `tenantId`
- If `addressId` provided: add to where
- If `status` provided: add to where
- If `search` provided: `OR: [{ title: { contains: search, mode: "insensitive" } }, { number: { contains: search, mode: "insensitive" } }]`

Use `Promise.all([findMany, count])` pattern. Include: `{ address: true, contact: true, order: true }`. OrderBy: `{ createdAt: "desc" }`.

**`findById(prisma, tenantId, id)`**

Use `prisma.crmInquiry.findFirst({ where: { id, tenantId }, include: { address: true, contact: true, order: true, correspondences: { include: { contact: true }, orderBy: { date: "desc" }, take: 10 } } })`.

**`create(prisma, data)`**

Use `prisma.crmInquiry.create({ data, include: { address: true, contact: true } })`.

**`update(prisma, tenantId, id, data)`**

Use `prisma.crmInquiry.updateMany({ where: { id, tenantId }, data })` then `findFirst` to return updated record with includes.

**`remove(prisma, tenantId, id)`**

Use `prisma.crmInquiry.deleteMany({ where: { id, tenantId } })` — return `count > 0`.

**`countLinkedRecords(prisma, tenantId, id)`**

Count `CrmCorrespondence` records linked via `inquiryId`. Returns `{ correspondences: number }`. Used by service to block deletion when linked records exist.

### Verification

- [ ] `pnpm typecheck` passes
- [ ] All functions export correctly

### Dependencies

- Phase 2 (Prisma schema must be generated)

---

## Phase 6: Service (Business Logic)

### File to create: `src/lib/services/crm-inquiry-service.ts`

**Pattern:** Follow `crm-correspondence-service.ts` exactly.

#### Error Classes

```ts
export class CrmInquiryNotFoundError extends Error {
  constructor(message = "CRM inquiry not found") {
    super(message)
    this.name = "CrmInquiryNotFoundError"
  }
}

export class CrmInquiryValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CrmInquiryValidationError"
  }
}

export class CrmInquiryConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CrmInquiryConflictError"
  }
}
```

#### Imports

```ts
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./crm-inquiry-repository"
import * as numberSeqService from "./number-sequence-service"
import * as orderService from "./order-service"
```

#### Functions

**`list(prisma, tenantId, params)`** — Thin wrapper around `repo.findMany()`.

**`getById(prisma, tenantId, id)`** — Calls `repo.findById()`, throws `CrmInquiryNotFoundError` if null.

**`create(prisma, tenantId, input, createdById)`**

1. Verify `addressId` belongs to tenant: `prisma.crmAddress.findFirst({ where: { id: input.addressId, tenantId } })`. Throw `CrmInquiryValidationError("Address not found in this tenant")` if null.
2. If `contactId` provided: verify contact belongs to the address: `prisma.crmContact.findFirst({ where: { id: input.contactId, addressId: input.addressId, tenantId } })`. Throw validation error if null.
3. Generate inquiry number: `const number = await numberSeqService.getNextNumber(prisma, tenantId, "inquiry")`
4. Call `repo.create(prisma, { tenantId, number, title: input.title, addressId: input.addressId, contactId: input.contactId, effort: input.effort, notes: input.notes, createdById })`.

**`update(prisma, tenantId, id, input)`**

1. Fetch existing: `repo.findById(prisma, tenantId, id)`. Throw `CrmInquiryNotFoundError` if null.
2. Check status: if `existing.status === "CLOSED"`, throw `CrmInquiryValidationError("Cannot update a closed inquiry")`.
3. If `contactId` changes and is provided, validate it belongs to the address.
4. Build partial data object from input fields (title, contactId, effort, creditRating, notes).
5. If any update field provided and status is OPEN, auto-transition to IN_PROGRESS: `data.status = "IN_PROGRESS"`.
6. Call `repo.update(prisma, tenantId, id, data)`.

**`close(prisma, tenantId, id, input, closedById)`**

1. Fetch existing, throw not-found if null.
2. If status is already CLOSED: throw `CrmInquiryConflictError("Inquiry is already closed")`.
3. Build update data: `{ status: "CLOSED", closedAt: new Date(), closedById, closingReason: input.closingReason, closingRemarks: input.closingRemarks }`.
4. Call `repo.update(prisma, tenantId, id, data)`.
5. If `input.closeLinkedOrder === true` and `existing.orderId` exists: call `orderService.update(prisma, tenantId, { id: existing.orderId, status: "completed" })` — wrap in try/catch, log warning on failure but don't fail the close.

**`cancel(prisma, tenantId, id, reason?)`**

1. Fetch existing, throw not-found if null.
2. If status is CLOSED or CANCELLED: throw `CrmInquiryValidationError("Cannot cancel an inquiry that is already closed or cancelled")`.
3. Update: `{ status: "CANCELLED", closingReason: reason }`.

**`reopen(prisma, tenantId, id)`**

1. Fetch existing, throw not-found if null.
2. If status is not CLOSED and not CANCELLED: throw `CrmInquiryValidationError("Can only reopen closed or cancelled inquiries")`.
3. Update: `{ status: "IN_PROGRESS", closedAt: null, closedById: null, closingReason: null, closingRemarks: null }`.

**`linkOrder(prisma, tenantId, id, orderId)`**

1. Fetch existing, throw not-found if null.
2. Verify order belongs to tenant: `prisma.order.findFirst({ where: { id: orderId, tenantId } })`. Throw validation error if null.
3. Update: `{ orderId }`.

**`createOrder(prisma, tenantId, id, input?, userId?)`**

1. Fetch existing inquiry with address included, throw not-found if null.
2. If `existing.orderId` already set: throw `CrmInquiryConflictError("Inquiry already has a linked order")`.
3. Generate order code: `"CRM-" + existing.number` (e.g., `"CRM-V-1"`).
4. Call `orderService.create(prisma, tenantId, { code, name: input?.orderName || existing.title, customer: existing.address.company })`.
5. Link the order: `repo.update(prisma, tenantId, id, { orderId: createdOrder.id })`.
6. If status is OPEN, auto-transition to IN_PROGRESS.
7. Return the updated inquiry.

**`remove(prisma, tenantId, id)`**

1. Check linked records via `repo.countLinkedRecords(prisma, tenantId, id)`.
2. If any linked correspondences > 0: throw `CrmInquiryValidationError("Cannot delete inquiry with linked correspondence entries. Remove the links first.")`.
3. Call `repo.remove(prisma, tenantId, id)`. Throw `CrmInquiryNotFoundError` if returns false.

### Verification

- [ ] `pnpm typecheck` passes
- [ ] Error class names follow convention (`*NotFoundError`, `*ValidationError`, `*ConflictError`)
- [ ] All functions follow `(prisma, tenantId, ...)` signature pattern
- [ ] NumberSequence integration uses key `"inquiry"`

### Dependencies

- Phase 4 (NumberSequence prefix must exist)
- Phase 5 (repository must exist)

---

## Phase 7: tRPC Router + Wire into CRM Router

### 7A. Create Router

**File to create:** `src/trpc/routers/crm/inquiries.ts`

**Pattern:** Follow `src/trpc/routers/crm/correspondence.ts` exactly.

```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as crmInquiryService from "@/lib/services/crm-inquiry-service"
import type { PrismaClient } from "@/generated/prisma/client"
```

**Permission constants:**

```ts
const INQ_VIEW = permissionIdByKey("crm_inquiries.view")!
const INQ_CREATE = permissionIdByKey("crm_inquiries.create")!
const INQ_EDIT = permissionIdByKey("crm_inquiries.edit")!
const INQ_DELETE = permissionIdByKey("crm_inquiries.delete")!
```

**Base procedure:**

```ts
const crmProcedure = tenantProcedure.use(requireModule("crm"))
```

**Input schemas:**

```ts
const listInput = z.object({
  addressId: z.string().uuid().optional(),
  search: z.string().optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "CLOSED", "CANCELLED"]).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

const createInput = z.object({
  title: z.string().min(1),
  addressId: z.string().uuid(),
  contactId: z.string().uuid().optional(),
  effort: z.string().optional(),
  notes: z.string().optional(),
})

const updateInput = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).optional(),
  contactId: z.string().uuid().nullable().optional(),
  effort: z.string().nullable().optional(),
  creditRating: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

const closeInput = z.object({
  id: z.string().uuid(),
  closingReason: z.string().optional(),
  closingRemarks: z.string().optional(),
  closeLinkedOrder: z.boolean().optional().default(false),
})

const cancelInput = z.object({
  id: z.string().uuid(),
  reason: z.string().optional(),
})

const idInput = z.object({ id: z.string().uuid() })

const linkOrderInput = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
})

const createOrderInput = z.object({
  id: z.string().uuid(),
  orderName: z.string().optional(),
})
```

**Procedures:**

| Procedure | Type | Permission | Notes |
|-----------|------|-----------|-------|
| `list` | query | `INQ_VIEW` | Paginated, filtered |
| `getById` | query | `INQ_VIEW` | Single inquiry with includes |
| `create` | mutation | `INQ_CREATE` | Auto-generates number |
| `update` | mutation | `INQ_EDIT` | Rejects if CLOSED |
| `close` | mutation | `INQ_EDIT` | Sets CLOSED + optional order close |
| `cancel` | mutation | `INQ_EDIT` | Sets CANCELLED |
| `reopen` | mutation | `INQ_EDIT` | Sets IN_PROGRESS |
| `linkOrder` | mutation | `INQ_EDIT` | Links existing order |
| `createOrder` | mutation | `INQ_EDIT` | Creates + links new order |
| `delete` | mutation | `INQ_DELETE` | Returns `{ success: true }` |

**Handler pattern** (same as correspondence):
```ts
try {
  return await crmInquiryService.method(ctx.prisma as unknown as PrismaClient, ctx.tenantId!, ...)
} catch (err) {
  handleServiceError(err)
}
```

- `create` passes `ctx.user!.id` as `createdById`
- `close` passes `ctx.user!.id` as `closedById`
- `delete` returns `{ success: true }`

### 7B. Wire into CRM Router

**File to modify:** `src/trpc/routers/crm/index.ts`

```ts
import { crmInquiriesRouter } from "./inquiries"

export const crmRouter = createTRPCRouter({
  addresses: crmAddressesRouter,
  correspondence: crmCorrespondenceRouter,
  inquiries: crmInquiriesRouter,
  numberSequences: numberSequencesRouter,
})
```

Update the doc comment to include `inquiries`.

### Verification

- [ ] `pnpm typecheck` passes
- [ ] All 10 procedures are accessible via `trpc.crm.inquiries.*`
- [ ] Module guard (`requireModule("crm")`) is on every procedure
- [ ] Permission guards use the correct permission IDs
- [ ] No changes needed to `_app.ts` (crmRouter is already registered there)

### Dependencies

- Phase 3 (permissions must exist)
- Phase 6 (service must exist)

---

## Phase 8: React Hooks

### File to create: `src/hooks/use-crm-inquiries.ts`

**Pattern:** Follow `src/hooks/use-crm-correspondence.ts` exactly.

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
```

**Hooks:**

| Hook | Type | Cache Invalidation |
|------|------|-------------------|
| `useCrmInquiries(filters)` | `useQuery` | — |
| `useCrmInquiryById(id, enabled?)` | `useQuery` | — |
| `useCreateCrmInquiry()` | `useMutation` | Invalidate `list` + `getById` |
| `useUpdateCrmInquiry()` | `useMutation` | Invalidate `list` + `getById` |
| `useCloseCrmInquiry()` | `useMutation` | Invalidate `list` + `getById` |
| `useCancelCrmInquiry()` | `useMutation` | Invalidate `list` + `getById` |
| `useReopenCrmInquiry()` | `useMutation` | Invalidate `list` + `getById` |
| `useLinkCrmInquiryOrder()` | `useMutation` | Invalidate `list` + `getById` |
| `useCreateCrmInquiryOrder()` | `useMutation` | Invalidate `list` + `getById` |
| `useDeleteCrmInquiry()` | `useMutation` | Invalidate `list` |

**`useCrmInquiries` options interface:**

```ts
interface UseCrmInquiriesOptions {
  enabled?: boolean
  addressId?: string
  search?: string
  status?: "OPEN" | "IN_PROGRESS" | "CLOSED" | "CANCELLED"
  page?: number
  pageSize?: number
}
```

### File to modify: `src/hooks/index.ts`

Add barrel exports after the CRM Correspondence block (after line 685):

```ts
// CRM Inquiries
export {
  useCrmInquiries,
  useCrmInquiryById,
  useCreateCrmInquiry,
  useUpdateCrmInquiry,
  useCloseCrmInquiry,
  useCancelCrmInquiry,
  useReopenCrmInquiry,
  useLinkCrmInquiryOrder,
  useCreateCrmInquiryOrder,
  useDeleteCrmInquiry,
} from './use-crm-inquiries'
```

### Verification

- [ ] `pnpm typecheck` passes
- [ ] All hooks export from `@/hooks`
- [ ] Query invalidation targets both `list` and `getById` queryKeys

### Dependencies

- Phase 7 (tRPC router must be wired)

---

## Phase 9: UI Components

All files in `src/components/crm/`. Use `'use client'` directive. Follow patterns from existing CRM components.

### 9A. Inquiry Status Badge

**File to create:** `src/components/crm/inquiry-status-badge.tsx`

Badge component rendering colored status:

| Status | Color/Variant | Icon | DE Label | EN Label |
|--------|-------------|------|----------|----------|
| `OPEN` | `default` (blue) | `CircleDot` | Offen | Open |
| `IN_PROGRESS` | `secondary` (amber/orange) | `Loader` | In Bearbeitung | In Progress |
| `CLOSED` | `outline` (green) | `CheckCircle` | Geschlossen | Closed |
| `CANCELLED` | `destructive` (red) | `XCircle` | Storniert | Cancelled |

**Pattern:** Follow `correspondence-type-badge.tsx` — map of config per value, render `Badge` with icon + translated label.

### 9B. Inquiry List

**File to create:** `src/components/crm/inquiry-list.tsx`

**Props:**
```ts
interface InquiryListProps {
  addressId?: string  // Optional — when embedded in address detail tab
}
```

**Features:**
- Header with title "Vorgänge" / "Inquiries" and "Neuer Vorgang" / "New Inquiry" button
- Search input (searches title + number)
- Status filter dropdown (All / Open / In Progress / Closed / Cancelled)
- Table columns: Nummer, Titel, Kunde (address company), Status (badge), Auftrag (linked order code or "—"), Erstellt am, Aktionen
- Pagination (page, pageSize=25)
- Empty state message
- Row actions menu: Anzeigen (navigate to detail), Bearbeiten, Schließen, Stornieren, Löschen
- When `addressId` is provided: filter list by that address, hide the "Kunde" column
- When no `addressId`: show all inquiries globally (for the `/crm/inquiries` page)

**Data source:** `useCrmInquiries({ addressId, ...filters })`

**State management:**
- `search`, `status`, `page` filter state
- `formOpen` / `editItem` for form sheet
- `deleteItem` for delete confirmation

### 9C. Inquiry Form Sheet

**File to create:** `src/components/crm/inquiry-form-sheet.tsx`

**Props:**
```ts
interface InquiryFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  addressId?: string  // Pre-selected when opened from address detail tab
  editItem?: CrmInquiry | null
}
```

**Form sections:**

1. **Grunddaten (Basic Data)**
   - Title: Text input (required)
   - Address: Address autocomplete/search (required, pre-filled if `addressId` prop given). Use `useCrmAddresses` hook to fetch options.
   - Contact: Select dropdown populated with contacts from selected address (optional). Refetches when address changes.
   - Effort: Select dropdown — "low" / "medium" / "high" (optional)

2. **Zusatzinfo (Additional Info)** (only shown in edit mode)
   - Credit Rating: Text input (optional)
   - Notes: Textarea (optional)

**On submit:**
- If `editItem`: call `useUpdateCrmInquiry().mutateAsync()`
- If new: call `useCreateCrmInquiry().mutateAsync()`
- Close sheet on success, show toast

### 9D. Inquiry Detail View

**File to create:** `src/components/crm/inquiry-detail.tsx`

This component is used on the `/crm/inquiries/[id]` detail page.

**Sections:**
1. **Header:** Title, Number badge, Status badge, action buttons (Edit, Close, Cancel, Reopen — contextual based on status)
2. **Overview card:** Address, Contact, Effort, Credit Rating, Notes, Created at/by, Closed at/by, Closing reason/remarks
3. **Linked Order card:** Order code + name with link, or "Link Order" / "Create Order" buttons
4. **Correspondence tab:** Reuse `CorrespondenceList` component filtered by `inquiryId`

### 9E. Inquiry Close Dialog

**File to create:** `src/components/crm/inquiry-close-dialog.tsx`

**Props:**
```ts
interface InquiryCloseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  inquiryId: string
  hasLinkedOrder: boolean
}
```

**Form fields:**
- Closing Reason: Select dropdown (e.g., "Auftrag erteilt", "Kein Bedarf", "Konkurrenz", "Sonstiges") — optional
- Closing Remarks: Textarea (optional)
- Close Linked Order: Checkbox (only visible when `hasLinkedOrder` is true)

**On submit:** `useCloseCrmInquiry().mutateAsync({ id, closingReason, closingRemarks, closeLinkedOrder })`

### 9F. Inquiry Link Order Dialog

**File to create:** `src/components/crm/inquiry-link-order-dialog.tsx`

**Props:**
```ts
interface InquiryLinkOrderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  inquiryId: string
  inquiryTitle: string
}
```

**Tabs within dialog:**
1. **Link Existing:** Search/select from existing orders. Use a simple select or combobox with orders from `trpc.orders.list`.
2. **Create New:** Order name input (defaults to inquiry title). Submit calls `useCreateCrmInquiryOrder()`.

### Verification

- [ ] `pnpm typecheck` passes
- [ ] All components use `'use client'` directive
- [ ] Components use `useTranslations('crmInquiries')` for i18n
- [ ] Status badge renders correctly for all 4 statuses
- [ ] Form sheet scrolls when content overflows
- [ ] Close dialog conditionally shows the linked order checkbox

### Dependencies

- Phase 8 (hooks must exist)

---

## Phase 10: Page Routes

### 10A. Global Inquiry List Page

**File to create:** `src/app/[locale]/(dashboard)/crm/inquiries/page.tsx`

```tsx
import { InquiryList } from "@/components/crm/inquiry-list"

export default function CrmInquiriesPage() {
  return (
    <div className="container mx-auto py-6">
      <InquiryList />
    </div>
  )
}
```

### 10B. Inquiry Detail Page

**File to create:** `src/app/[locale]/(dashboard)/crm/inquiries/[id]/page.tsx`

```tsx
import { InquiryDetail } from "@/components/crm/inquiry-detail"

export default function CrmInquiryDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="container mx-auto py-6">
      <InquiryDetail id={params.id} />
    </div>
  )
}
```

### 10C. Replace Inquiry Tab Placeholder on Address Detail Page

**File to modify:** `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx`

Replace (lines 293–299):
```tsx
<TabsContent value="inquiries" className="mt-6">
  <Card>
    <CardContent className="flex items-center justify-center py-16">
      <p className="text-muted-foreground">{t('comingSoon')} — CRM_03</p>
    </CardContent>
  </Card>
</TabsContent>
```

With:
```tsx
<TabsContent value="inquiries" className="mt-6">
  <InquiryList addressId={address.id} />
</TabsContent>
```

Add import:
```tsx
import { InquiryList } from "@/components/crm/inquiry-list"
```

### 10D. Add Sidebar Navigation Item

**File to modify:** `src/components/layout/sidebar/sidebar-nav-config.ts`

Add to the CRM section items array (after `crmAddresses`, line 285):

```ts
{
  titleKey: 'crmInquiries',
  href: '/crm/inquiries',
  icon: FileText,
  module: 'crm',
  permissions: ['crm_inquiries.view'],
},
```

Import `FileText` from `lucide-react` (add to existing import if not already present).

### Verification

- [ ] `/crm/inquiries` renders the global inquiry list
- [ ] `/crm/inquiries/[id]` renders the inquiry detail
- [ ] Address detail → Anfragen tab shows `InquiryList` (not placeholder)
- [ ] Sidebar shows "Vorgänge" / "Inquiries" under CRM section
- [ ] `pnpm typecheck` passes

### Dependencies

- Phase 9 (components must exist)

---

## Phase 11: i18n Messages

### 11A. German translations

**File to modify:** `messages/de.json`

Add sidebar nav key in the sidebar section (near line 106, after `"crmAddresses"`):
```json
"crmInquiries": "Vorgänge",
```

Add new top-level namespace `"crmInquiries"`:

```json
"crmInquiries": {
  "title": "Vorgänge",
  "newInquiry": "Neuer Vorgang",
  "createTitle": "Neuen Vorgang anlegen",
  "editTitle": "Vorgang bearbeiten",
  "detailTitle": "Vorgangsdetails",
  "searchPlaceholder": "Titel oder Nummer durchsuchen…",
  "number": "Nummer",
  "inquiryTitle": "Titel",
  "address": "Kunde / Lieferant",
  "contact": "Kontakt",
  "status": "Status",
  "statusAll": "Alle Status",
  "statusOpen": "Offen",
  "statusInProgress": "In Bearbeitung",
  "statusClosed": "Geschlossen",
  "statusCancelled": "Storniert",
  "effort": "Aufwand",
  "effortLow": "Gering",
  "effortMedium": "Mittel",
  "effortHigh": "Hoch",
  "creditRating": "Zahlungsfähigkeit",
  "notes": "Notizen",
  "linkedOrder": "Verknüpfter Auftrag",
  "noOrder": "Kein Auftrag verknüpft",
  "linkOrder": "Auftrag verknüpfen",
  "createOrder": "Auftrag anlegen",
  "orderName": "Auftragsbezeichnung",
  "createdAt": "Erstellt am",
  "closedAt": "Geschlossen am",
  "closedBy": "Geschlossen von",
  "closingReason": "Abschlussgrund",
  "closingReasons": {
    "orderPlaced": "Auftrag erteilt",
    "noNeed": "Kein Bedarf",
    "competition": "Konkurrenz",
    "other": "Sonstiges"
  },
  "closingRemarks": "Abschlussbemerkung",
  "closeTitle": "Vorgang schließen",
  "closeDescription": "Möchten Sie den Vorgang \"{title}\" schließen?",
  "closeLinkedOrder": "Verknüpften Auftrag ebenfalls schließen",
  "cancelTitle": "Vorgang stornieren",
  "cancelDescription": "Möchten Sie den Vorgang \"{title}\" stornieren?",
  "cancelReason": "Stornierungsgrund",
  "reopenTitle": "Vorgang wieder öffnen",
  "reopenDescription": "Möchten Sie den Vorgang \"{title}\" wieder öffnen?",
  "noEntries": "Noch keine Vorgänge vorhanden.",
  "deleteTitle": "Vorgang löschen",
  "deleteDescription": "Möchten Sie den Vorgang \"{title}\" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.",
  "deleteBlockedCorrespondence": "Dieser Vorgang kann nicht gelöscht werden, da noch Korrespondenzeinträge verknüpft sind.",
  "confirm": "Bestätigen",
  "cancel": "Abbrechen",
  "save": "Speichern",
  "create": "Anlegen",
  "close": "Schließen",
  "reopen": "Wieder öffnen",
  "actions": "Aktionen",
  "view": "Anzeigen",
  "edit": "Bearbeiten",
  "delete": "Löschen",
  "basicData": "Grunddaten",
  "additionalInfo": "Zusatzinformationen",
  "selectAddress": "Adresse auswählen…",
  "selectContact": "Kontakt auswählen…",
  "noContact": "Kein Kontakt",
  "selectEffort": "Aufwand wählen…",
  "correspondence": "Korrespondenz",
  "overview": "Übersicht",
  "linkExisting": "Bestehenden verknüpfen",
  "createNew": "Neu anlegen",
  "immutableNotice": "Dieser Vorgang ist geschlossen und kann nicht mehr bearbeitet werden."
}
```

### 11B. English translations

**File to modify:** `messages/en.json`

Add sidebar nav key (near line 106, after `"crmAddresses"`):
```json
"crmInquiries": "Inquiries",
```

Add new top-level namespace `"crmInquiries"`:

```json
"crmInquiries": {
  "title": "Inquiries",
  "newInquiry": "New Inquiry",
  "createTitle": "Create New Inquiry",
  "editTitle": "Edit Inquiry",
  "detailTitle": "Inquiry Details",
  "searchPlaceholder": "Search title or number…",
  "number": "Number",
  "inquiryTitle": "Title",
  "address": "Customer / Supplier",
  "contact": "Contact",
  "status": "Status",
  "statusAll": "All Statuses",
  "statusOpen": "Open",
  "statusInProgress": "In Progress",
  "statusClosed": "Closed",
  "statusCancelled": "Cancelled",
  "effort": "Effort",
  "effortLow": "Low",
  "effortMedium": "Medium",
  "effortHigh": "High",
  "creditRating": "Credit Rating",
  "notes": "Notes",
  "linkedOrder": "Linked Order",
  "noOrder": "No order linked",
  "linkOrder": "Link Order",
  "createOrder": "Create Order",
  "orderName": "Order Name",
  "createdAt": "Created At",
  "closedAt": "Closed At",
  "closedBy": "Closed By",
  "closingReason": "Closing Reason",
  "closingReasons": {
    "orderPlaced": "Order placed",
    "noNeed": "No need",
    "competition": "Lost to competition",
    "other": "Other"
  },
  "closingRemarks": "Closing Remarks",
  "closeTitle": "Close Inquiry",
  "closeDescription": "Do you want to close the inquiry \"{title}\"?",
  "closeLinkedOrder": "Also close linked order",
  "cancelTitle": "Cancel Inquiry",
  "cancelDescription": "Do you want to cancel the inquiry \"{title}\"?",
  "cancelReason": "Cancellation Reason",
  "reopenTitle": "Reopen Inquiry",
  "reopenDescription": "Do you want to reopen the inquiry \"{title}\"?",
  "noEntries": "No inquiries yet.",
  "deleteTitle": "Delete Inquiry",
  "deleteDescription": "Are you sure you want to delete the inquiry \"{title}\"? This action cannot be undone.",
  "deleteBlockedCorrespondence": "This inquiry cannot be deleted because it still has linked correspondence entries.",
  "confirm": "Confirm",
  "cancel": "Cancel",
  "save": "Save",
  "create": "Create",
  "close": "Close",
  "reopen": "Reopen",
  "actions": "Actions",
  "view": "View",
  "edit": "Edit",
  "delete": "Delete",
  "basicData": "Basic Data",
  "additionalInfo": "Additional Information",
  "selectAddress": "Select address…",
  "selectContact": "Select contact…",
  "noContact": "No contact",
  "selectEffort": "Select effort…",
  "correspondence": "Correspondence",
  "overview": "Overview",
  "linkExisting": "Link Existing",
  "createNew": "Create New",
  "immutableNotice": "This inquiry is closed and can no longer be edited."
}
```

### Verification

- [ ] No JSON syntax errors in `de.json` and `en.json`
- [ ] All component translation keys have corresponding entries
- [ ] Sidebar nav key `crmInquiries` is present in both files

### Dependencies

- None (can be done at any phase, but referenced by Phase 9 components)

---

## Phase 12: Seed Data

### File to modify: `supabase/seed.sql`

Add inquiry seed data after the correspondence insert block (after line 2017).

**UUID range:** `c5000000-0000-4000-a000-00000000000X`

```sql
-- Inquiry / Vorgang entries
INSERT INTO crm_inquiries (id, tenant_id, number, title, address_id, contact_id, status, effort, credit_rating, notes, created_at, updated_at, created_by_id)
VALUES
  -- Müller Maschinenbau GmbH (K-1) — 2 Vorgänge
  ('c5000000-0000-4000-a000-000000000001', '10000000-0000-0000-0000-000000000001', 'V-1', 'Großauftrag Frästeile 50 Stück', 'c1000000-0000-4000-a000-000000000001', 'c2000000-0000-4000-a000-000000000001', 'IN_PROGRESS', 'high', 'gut', 'Anfrage über Sonderkonditionen. Angebot mit 8% Mengenrabatt gesendet.', '2026-01-10 09:00:00+01', '2026-01-14 15:00:00+01', '00000000-0000-0000-0000-000000000001'),
  ('c5000000-0000-4000-a000-000000000002', '10000000-0000-0000-0000-000000000001', 'V-2', 'Einladung Hausmesse März 2026', 'c1000000-0000-4000-a000-000000000001', NULL, 'CLOSED', 'low', NULL, 'Einladung versendet per Post.', '2026-02-20 08:00:00+01', '2026-03-16 10:00:00+01', '00000000-0000-0000-0000-000000000001'),

  -- Schmidt & Partner KG (K-2) — 1 Vorgang
  ('c5000000-0000-4000-a000-000000000011', '10000000-0000-0000-0000-000000000001', 'V-3', 'Projekt Berlin-Mitte Auftragserteilung', 'c1000000-0000-4000-a000-000000000002', 'c2000000-0000-4000-a000-000000000003', 'CLOSED', 'high', 'sehr gut', 'Bestellung eingegangen. Lieferadresse abweichend.', '2026-01-28 16:00:00+01', '2026-02-19 10:00:00+01', '00000000-0000-0000-0000-000000000001'),

  -- Weber Elektrotechnik AG (K-3) — 1 Vorgang
  ('c5000000-0000-4000-a000-000000000021', '10000000-0000-0000-0000-000000000001', 'V-4', 'Erstanfrage Schaltschrankkomponenten', 'c1000000-0000-4000-a000-000000000003', NULL, 'OPEN', 'medium', NULL, 'Telefonische Erstanfrage. Katalog und Preisliste gesendet. Ansprechpartner wird noch benannt.', '2026-02-10 08:30:00+01', '2026-02-10 15:00:00+01', '00000000-0000-0000-0000-000000000001'),

  -- Bauer Logistik e.K. (K-4) — 1 Vorgang
  ('c5000000-0000-4000-a000-000000000031', '10000000-0000-0000-0000-000000000001', 'V-5', 'Regalsysteme Neubau Hamburg-Wilhelmsburg', 'c1000000-0000-4000-a000-000000000004', NULL, 'IN_PROGRESS', 'high', 'gut', 'Vor-Ort-Besichtigung durchgeführt. Angebot mit 3D-Zeichnung gesendet.', '2026-01-15 12:00:00+01', '2026-02-12 14:00:00+01', '00000000-0000-0000-0000-000000000001'),

  -- Fischer IT Solutions GmbH (K-5, inaktiv) — 1 Vorgang
  ('c5000000-0000-4000-a000-000000000041', '10000000-0000-0000-0000-000000000001', 'V-6', 'Reklamation Lieferverzug B-4711', 'c1000000-0000-4000-a000-000000000005', NULL, 'CANCELLED', 'medium', 'kritisch', 'Eskalation wegen 2 Wochen Lieferverzug. Storniert da Kunde abgesprungen.', '2025-11-05 14:00:00+01', '2025-11-10 09:00:00+01', '00000000-0000-0000-0000-000000000001'),

  -- Hoffmann Werkzeuge GmbH & Co. KG (K-6, BOTH) — 1 Vorgang
  ('c5000000-0000-4000-a000-000000000051', '10000000-0000-0000-0000-000000000001', 'V-7', 'Rahmenvertrag 2026 und Qualitätsproblem', 'c1000000-0000-4000-a000-000000000021', 'c2000000-0000-4000-a000-000000000005', 'IN_PROGRESS', 'high', 'sehr gut', 'Jahresgespräch positiv. Aber Qualitätsproblem bei letzter Lieferung — QS prüft.', '2026-01-25 09:00:00+01', '2026-02-16 08:30:00+01', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Set closed inquiry fields for V-2 and V-3
UPDATE crm_inquiries SET
  closed_at = '2026-03-16 10:00:00+01',
  closed_by_id = '00000000-0000-0000-0000-000000000001',
  closing_reason = 'Veranstaltung durchgeführt',
  closing_remarks = 'Hausmesse erfolgreich, 12 Teilnehmer.'
WHERE id = 'c5000000-0000-4000-a000-000000000002';

UPDATE crm_inquiries SET
  closed_at = '2026-02-19 10:00:00+01',
  closed_by_id = '00000000-0000-0000-0000-000000000001',
  closing_reason = 'Auftrag erteilt',
  closing_remarks = 'Bestellung bestätigt. Lieferung KW 8 per Spedition.'
WHERE id = 'c5000000-0000-4000-a000-000000000011';

-- Link some correspondence entries to inquiries (update existing seed data)
UPDATE crm_correspondences SET inquiry_id = 'c5000000-0000-4000-a000-000000000001'
WHERE id IN ('c4000000-0000-4000-a000-000000000001', 'c4000000-0000-4000-a000-000000000002');

UPDATE crm_correspondences SET inquiry_id = 'c5000000-0000-4000-a000-000000000011'
WHERE id IN ('c4000000-0000-4000-a000-000000000012', 'c4000000-0000-4000-a000-000000000013');

UPDATE crm_correspondences SET inquiry_id = 'c5000000-0000-4000-a000-000000000021'
WHERE id IN ('c4000000-0000-4000-a000-000000000021', 'c4000000-0000-4000-a000-000000000022', 'c4000000-0000-4000-a000-000000000023');

-- Update number sequence for inquiry to account for seeded data (V-1 through V-7)
INSERT INTO number_sequences (id, tenant_id, key, prefix, next_value, created_at, updated_at)
VALUES (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'inquiry', 'V-', 8, NOW(), NOW())
ON CONFLICT (tenant_id, key) DO UPDATE SET next_value = GREATEST(number_sequences.next_value, 8);
```

### Verification

- [ ] SQL is syntactically valid
- [ ] UUID range `c5000000-...` does not conflict with existing seeds
- [ ] Foreign keys reference valid address, contact, and user IDs
- [ ] All 4 statuses are represented in seed data
- [ ] Correspondence entries are linked to inquiries via UPDATE
- [ ] Number sequence set to 8 (next after V-7)

### Dependencies

- Phase 1 (migration must exist and run before seed)

---

## Phase 13: Unit Tests (Service Layer)

### File to create: `src/lib/services/__tests__/crm-inquiry-service.test.ts`

**Pattern:** Follow `crm-correspondence-service.test.ts` exactly.

**Constants:**
```ts
const TENANT_ID = "10000000-0000-0000-0000-000000000001"
const USER_ID = "00000000-0000-0000-0000-000000000001"
const ADDRESS_ID = "c1000000-0000-4000-a000-000000000001"
const CONTACT_ID = "c2000000-0000-4000-a000-000000000001"
const INQUIRY_ID = "c5000000-0000-4000-a000-000000000099"
const ORDER_ID = "ord00000-0000-4000-a000-000000000001"
```

**Test cases:**

```ts
describe("crm-inquiry-service", () => {
  describe("create", () => {
    it("creates inquiry with auto-generated number", async () => {
      // Mock: crmAddress.findFirst returns valid address
      // Mock: numberSequence.upsert returns seq with nextValue=2
      // Mock: crmInquiry.create returns created record
      // Assert: create called with number "V-1"
    })

    it("rejects if addressId belongs to different tenant", async () => {
      // Mock: crmAddress.findFirst returns null
      // Assert: throws CrmInquiryValidationError
    })

    it("rejects if contactId does not belong to address", async () => {
      // Mock: crmAddress.findFirst returns valid
      // Mock: crmContact.findFirst returns null
      // Assert: throws CrmInquiryValidationError
    })

    it("creates inquiry without optional contactId", async () => {
      // No contactId provided → no contact validation
      // Assert: creates successfully
    })
  })

  describe("getById", () => {
    it("returns inquiry when found", async () => { ... })
    it("throws CrmInquiryNotFoundError when not found", async () => { ... })
  })

  describe("update", () => {
    it("updates inquiry fields", async () => { ... })
    it("rejects update when status is CLOSED", async () => {
      // Mock: findFirst returns inquiry with status CLOSED
      // Assert: throws CrmInquiryValidationError("Cannot update a closed inquiry")
    })
  })

  describe("close", () => {
    it("sets status, closedAt, closedById, closingReason", async () => { ... })
    it("rejects if already closed", async () => {
      // Assert: throws CrmInquiryConflictError
    })
    it("optionally closes linked Terp order", async () => {
      // Mock: inquiry has orderId
      // Input: closeLinkedOrder=true
      // Assert: orderService.update called with status "completed"
    })
  })

  describe("cancel", () => {
    it("sets status to CANCELLED", async () => { ... })
    it("rejects if already closed", async () => { ... })
  })

  describe("reopen", () => {
    it("sets status from CLOSED to IN_PROGRESS", async () => { ... })
    it("clears closing fields", async () => { ... })
    it("rejects if not closed or cancelled", async () => { ... })
  })

  describe("createOrder", () => {
    it("creates order and links to inquiry", async () => {
      // Mock: inquiry without orderId
      // Assert: orderService.create called with code "CRM-V-1"
      // Assert: inquiry updated with orderId
    })
    it("rejects if inquiry already has linked order", async () => {
      // Assert: throws CrmInquiryConflictError
    })
  })

  describe("linkOrder", () => {
    it("links existing order to inquiry", async () => { ... })
    it("rejects if order not found in tenant", async () => { ... })
  })

  describe("remove", () => {
    it("deletes inquiry when no linked records", async () => { ... })
    it("rejects if correspondence entries are linked", async () => {
      // Mock: countLinkedRecords returns { correspondences: 3 }
      // Assert: throws CrmInquiryValidationError
    })
    it("throws not-found when inquiry does not exist", async () => { ... })
  })
})
```

### Verification

- [ ] `pnpm vitest run src/lib/services/__tests__/crm-inquiry-service.test.ts` passes
- [ ] All service validation paths are tested
- [ ] Error class types match expected handleServiceError mappings

### Dependencies

- Phase 6 (service must exist)

---

## Phase 14: Router Integration Tests

### File to create: `src/trpc/routers/__tests__/crmInquiries-router.test.ts`

**Pattern:** Follow `crmCorrespondence-router.test.ts` exactly.

**Required mocks:**
```ts
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
    },
  },
}))
```

**Permission constants:**
```ts
const INQ_VIEW = permissionIdByKey("crm_inquiries.view")!
const INQ_CREATE = permissionIdByKey("crm_inquiries.create")!
const INQ_EDIT = permissionIdByKey("crm_inquiries.edit")!
const INQ_DELETE = permissionIdByKey("crm_inquiries.delete")!
```

**Test cases:**

```ts
describe("crm.inquiries", () => {
  describe("list", () => {
    it("returns paginated list", async () => { ... })
    it("requires crm_inquiries.view permission", async () => { ... })
    it("requires CRM module enabled", async () => { ... })
    it("filters by status", async () => { ... })
    it("filters by addressId", async () => { ... })
    it("searches by title substring", async () => { ... })
  })

  describe("getById", () => {
    it("returns single inquiry with relations", async () => { ... })
    it("throws NOT_FOUND for missing inquiry", async () => { ... })
  })

  describe("create", () => {
    it("creates inquiry with auto-generated number", async () => { ... })
    it("requires crm_inquiries.create permission", async () => { ... })
    it("validates addressId belongs to tenant", async () => { ... })
  })

  describe("update", () => {
    it("updates existing inquiry", async () => { ... })
    it("requires crm_inquiries.edit permission", async () => { ... })
    it("rejects when closed", async () => { ... })
  })

  describe("close", () => {
    it("sets closedAt and status", async () => { ... })
    it("rejects double-close", async () => { ... })
  })

  describe("cancel", () => {
    it("sets status to CANCELLED", async () => { ... })
  })

  describe("reopen", () => {
    it("reopens closed inquiry", async () => { ... })
  })

  describe("createOrder", () => {
    it("creates linked Terp order", async () => { ... })
    it("requires crm_inquiries.edit permission", async () => { ... })
  })

  describe("linkOrder", () => {
    it("links existing order", async () => { ... })
  })

  describe("delete", () => {
    it("deletes inquiry and returns success", async () => { ... })
    it("requires crm_inquiries.delete permission", async () => { ... })
    it("rejects when linked records exist", async () => { ... })
  })
})
```

### Verification

- [ ] `pnpm vitest run src/trpc/routers/__tests__/crmInquiries-router.test.ts` passes
- [ ] Permission rejection tests pass for all procedures
- [ ] Module guard rejection test passes
- [ ] All 10 procedures are tested

### Dependencies

- Phase 7 (router must exist)
- Phase 3 (permissions must exist)

---

## Phase 15: E2E Browser Tests (Playwright)

### 15A. Update Global Cleanup

**File to modify:** `src/e2e-browser/global-setup.ts`

Add inquiry cleanup SQL **before** the correspondence cleanup (since correspondences may have FK to inquiries):

```sql
-- CRM inquiry records (spec 22)
-- First unlink correspondences from inquiries
UPDATE crm_correspondences SET inquiry_id = NULL WHERE inquiry_id IN (SELECT id FROM crm_inquiries WHERE title LIKE 'E2E%');
-- Delete inquiries
DELETE FROM crm_inquiries WHERE title LIKE 'E2E%';
```

Insert this before the existing line:
```sql
-- CRM correspondence records (spec 21)
DELETE FROM crm_correspondences WHERE address_id IN (SELECT id FROM crm_addresses WHERE company LIKE 'E2E%');
```

Also add to the number sequence reset section:
```sql
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'inquiry', 'V-', 100, NOW(), NOW())
```
Add this to the existing `INSERT INTO number_sequences ... ON CONFLICT` VALUES list.

### 15B. Update Address E2E Test

**File to modify:** `src/e2e-browser/20-crm-addresses.spec.ts`

Update the placeholder tab test (line 257–258). The "Anfragen" tab is no longer a placeholder — it now shows the InquiryList component. Change the assertion:

```ts
// Before:
await clickTab(page, "Anfragen");
await expect(page.getByText("In Vorbereitung")).toBeVisible();

// After:
// Anfragen tab is now implemented (CRM_03), so skip it
```

Remove the two lines testing the Anfragen placeholder. Only the "Belege" (Documents) tab remains as a placeholder test.

### 15C. Create E2E Test Spec

**File to create:** `src/e2e-browser/22-crm-inquiries.spec.ts`

**Pattern:** Follow `21-crm-correspondence.spec.ts`.

**Constants:**
```ts
const COMPANY = "E2E Vorgang GmbH"
const CONTACT_FIRST = "E2E Maria"
const CONTACT_LAST = "E2E Huber"
const INQUIRY_TITLE = "E2E Großprojekt Frästeile"
const INQUIRY_TITLE_2 = "E2E Anfrage Schaltschränke"
```

**Test cases:**

```ts
test.describe.serial("UC-CRM-03: Inquiries", () => {
  test("create address with contact for inquiry tests", async ({ page }) => {
    // Navigate to CRM addresses
    // Create a new address "E2E Vorgang GmbH" (type CUSTOMER)
    // Navigate to address detail
    // Create a contact (E2E Maria E2E Huber)
  })

  test("create an inquiry from address detail tab", async ({ page }) => {
    // Navigate to address detail → Tab "Anfragen"
    // Click "Neuer Vorgang"
    // Fill: title = INQUIRY_TITLE, contact = E2E Maria E2E Huber, effort = High
    // Submit → verify entry appears in list with auto-generated number (V-XXX)
    // Verify status badge shows "Offen"
  })

  test("create a second inquiry from global page", async ({ page }) => {
    // Navigate to /crm/inquiries
    // Click "Neuer Vorgang"
    // Select address: E2E Vorgang GmbH
    // Fill: title = INQUIRY_TITLE_2, effort = Medium
    // Submit → verify entry appears in global list
  })

  test("search inquiries by title", async ({ page }) => {
    // Navigate to /crm/inquiries
    // Type "E2E Großprojekt" in search field
    // Verify only the first inquiry is shown
    // Clear search
  })

  test("filter inquiries by status", async ({ page }) => {
    // Select "Offen" in status filter
    // Verify both E2E inquiries shown (both are OPEN)
    // Select "Geschlossen"
    // Verify no E2E inquiries shown
    // Clear filter
  })

  test("navigate to inquiry detail", async ({ page }) => {
    // From global list, click on INQUIRY_TITLE row → navigate to detail page
    // Verify title, number, status, address, contact displayed
  })

  test("edit inquiry details", async ({ page }) => {
    // From detail page, click Edit
    // Modify notes field
    // Submit → verify changes saved
    // Verify status transitions to "In Bearbeitung"
  })

  test("close inquiry with reason", async ({ page }) => {
    // From detail page, click "Schließen"
    // Enter closing reason: "Auftrag erteilt"
    // Enter closing remarks: "E2E Testabschluss"
    // Submit → verify status badge shows "Geschlossen"
    // Verify editing is disabled (immutable notice)
  })

  test("reopen closed inquiry", async ({ page }) => {
    // From detail page, click "Wieder öffnen"
    // Confirm → verify status changes to "In Bearbeitung"
  })

  test("cancel second inquiry", async ({ page }) => {
    // Navigate to global list, find INQUIRY_TITLE_2
    // Open detail → click "Stornieren"
    // Confirm → verify status badge shows "Storniert"
  })

  test("delete cancelled inquiry", async ({ page }) => {
    // From detail page of INQUIRY_TITLE_2, click "Löschen"
    // Confirm deletion
    // Verify redirected to list, entry removed
  })
})
```

### Verification

- [ ] `pnpm playwright test src/e2e-browser/22-crm-inquiries.spec.ts` passes
- [ ] Global cleanup deletes E2E inquiry records
- [ ] Tests are idempotent (can run repeatedly)
- [ ] Tests use serial execution order
- [ ] Address E2E test no longer fails on the removed Anfragen placeholder assertion
- [ ] All CRUD operations + status transitions verified via UI

### Dependencies

- Phase 10 (pages must exist)
- Phase 11 (i18n must exist)
- Phase 15A (cleanup must be updated first)

---

## File Summary

### New Files (16)

| # | File | Phase |
|---|------|-------|
| 1 | `supabase/migrations/20260101000097_create_crm_inquiries.sql` | 1 |
| 2 | `src/lib/services/crm-inquiry-repository.ts` | 5 |
| 3 | `src/lib/services/crm-inquiry-service.ts` | 6 |
| 4 | `src/trpc/routers/crm/inquiries.ts` | 7 |
| 5 | `src/hooks/use-crm-inquiries.ts` | 8 |
| 6 | `src/components/crm/inquiry-status-badge.tsx` | 9 |
| 7 | `src/components/crm/inquiry-list.tsx` | 9 |
| 8 | `src/components/crm/inquiry-form-sheet.tsx` | 9 |
| 9 | `src/components/crm/inquiry-detail.tsx` | 9 |
| 10 | `src/components/crm/inquiry-close-dialog.tsx` | 9 |
| 11 | `src/components/crm/inquiry-link-order-dialog.tsx` | 9 |
| 12 | `src/app/[locale]/(dashboard)/crm/inquiries/page.tsx` | 10 |
| 13 | `src/app/[locale]/(dashboard)/crm/inquiries/[id]/page.tsx` | 10 |
| 14 | `src/lib/services/__tests__/crm-inquiry-service.test.ts` | 13 |
| 15 | `src/trpc/routers/__tests__/crmInquiries-router.test.ts` | 14 |
| 16 | `src/e2e-browser/22-crm-inquiries.spec.ts` | 15 |

### Modified Files (12)

| # | File | Phase | Change |
|---|------|-------|--------|
| 1 | `prisma/schema.prisma` | 2 | Add enum, model, reverse relations on CrmAddress, CrmContact, CrmCorrespondence, Order, Tenant |
| 2 | `src/lib/auth/permission-catalog.ts` | 3 | Add 4 inquiry permissions |
| 3 | `src/lib/services/number-sequence-service.ts` | 4 | Add `inquiry: "V-"` to DEFAULT_PREFIXES |
| 4 | `src/trpc/routers/crm/index.ts` | 7 | Import + add `inquiries: crmInquiriesRouter` |
| 5 | `src/hooks/index.ts` | 8 | Add barrel exports for inquiry hooks |
| 6 | `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx` | 10 | Replace inquiry tab placeholder with `<InquiryList>` |
| 7 | `src/components/layout/sidebar/sidebar-nav-config.ts` | 10 | Add inquiries nav item to CRM section |
| 8 | `messages/de.json` | 11 | Add `crmInquiries` namespace + sidebar nav key |
| 9 | `messages/en.json` | 11 | Add `crmInquiries` namespace + sidebar nav key |
| 10 | `supabase/seed.sql` | 12 | Add inquiry seed data + link correspondences |
| 11 | `src/e2e-browser/global-setup.ts` | 15 | Add inquiry cleanup SQL |
| 12 | `src/e2e-browser/20-crm-addresses.spec.ts` | 15 | Remove Anfragen placeholder assertion |

---

## Execution Order & Dependencies Graph

```
Phase 1  (Migration SQL)
    ↓
Phase 2  (Prisma Schema + Generate)
    ↓
Phase 3  (Permission Catalog)          ← independent, logically after Phase 2
    |
Phase 4  (NumberSequence Prefix)       ← independent
    |
Phase 5  (Repository)                  ← depends on Phase 2
    ↓
Phase 6  (Service)                     ← depends on Phase 4 + Phase 5
    ↓
Phase 7  (Router + Wire)               ← depends on Phase 3 + Phase 6
    ↓
Phase 8  (Hooks)                       ← depends on Phase 7
    ↓
Phase 9  (UI Components)               ← depends on Phase 8
    ↓
Phase 10 (Pages + Address Tab + Sidebar) ← depends on Phase 9
    ↓
Phase 11 (i18n)                        ← independent, but needed by Phase 9 components
    |
Phase 12 (Seed Data)                   ← depends on Phase 1
    |
Phase 13 (Unit Tests)                  ← depends on Phase 6
    |
Phase 14 (Router Tests)                ← depends on Phase 7
    ↓
Phase 15 (E2E Tests)                   ← depends on Phase 10 + Phase 11
```

**Note:** Phases 3, 4, 11, and 12 can be done in parallel with other phases since they are mostly independent. Phases 13 and 14 (tests) can be developed in parallel with Phases 9–10 (UI) since they test the backend. However, E2E tests (Phase 15) require the full UI integration.

---

## Final Verification Checklist

After all phases are complete:

- [ ] `pnpm db:generate` succeeds
- [ ] `pnpm typecheck` passes (no new errors)
- [ ] `pnpm lint` passes
- [ ] `pnpm vitest run src/lib/services/__tests__/crm-inquiry-service.test.ts` passes
- [ ] `pnpm vitest run src/trpc/routers/__tests__/crmInquiries-router.test.ts` passes
- [ ] `pnpm playwright test src/e2e-browser/22-crm-inquiries.spec.ts` passes
- [ ] `pnpm playwright test src/e2e-browser/20-crm-addresses.spec.ts` passes (no regression)
- [ ] Address detail page → Anfragen tab shows InquiryList (no placeholder)
- [ ] Global `/crm/inquiries` page shows all inquiries
- [ ] `/crm/inquiries/[id]` detail page renders correctly
- [ ] Sidebar shows "Vorgänge" / "Inquiries" under CRM
- [ ] Create, read, update, close, cancel, reopen, delete all work through the UI
- [ ] Search and status filter work on both global and address-scoped views
- [ ] Link existing order works
- [ ] Create new order from inquiry works (code = "CRM-V-X")
- [ ] Close inquiry with "close linked order" checkbox works
- [ ] Closed inquiries are immutable (update rejected)
- [ ] Reopened inquiries become editable again
- [ ] Delete blocked when correspondence entries are linked
- [ ] Auto-generated inquiry number uses "V-" prefix
- [ ] Permission gates enforced (test without permission → access denied)
- [ ] Module guard enforced (CRM module disabled → forbidden)
- [ ] Cross-tenant isolation: inquiries from tenant A not visible to tenant B
- [ ] German and English translations complete
- [ ] Seed data creates 7 sample inquiries with linked correspondence
