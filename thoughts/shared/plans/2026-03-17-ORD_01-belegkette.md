# Implementation Plan: ORD_01 Belegkette (Billing Document Chain)

**Date:** 2026-03-17
**Ticket:** `thoughts/shared/tickets/orgAuftrag/TICKET_ORD_01_BELEGKETTE.md`
**Research:** `thoughts/shared/research/2026-03-17-ORD_01-belegkette.md`

---

## Overview

Implement the complete billing document chain (Belegkette) — seven document types from Offer to Invoice/Credit Note — with positions, PDF generation, print workflow (immutability after print), and document forwarding (Fortfuehren). Integrates with CRM addresses, contacts, inquiries, and Terp orders.

**New Models:** `BillingDocument`, `BillingDocumentPosition`
**New Enums:** `BillingDocumentType`, `BillingDocumentStatus`, `BillingPositionType`, `BillingPriceType`

---

## Phase 1: Database & Models

### Step 1.1: Create Supabase Migration

**File:** `supabase/migrations/20260101000099_create_billing_documents.sql`

```sql
-- ORD_01: Billing Documents (Belegkette)

CREATE TYPE billing_document_type AS ENUM (
  'OFFER',
  'ORDER_CONFIRMATION',
  'DELIVERY_NOTE',
  'SERVICE_NOTE',
  'RETURN_DELIVERY',
  'INVOICE',
  'CREDIT_NOTE'
);

CREATE TYPE billing_document_status AS ENUM (
  'DRAFT',
  'PRINTED',
  'PARTIALLY_FORWARDED',
  'FORWARDED',
  'CANCELLED'
);

CREATE TYPE billing_position_type AS ENUM (
  'ARTICLE',
  'FREE',
  'TEXT',
  'PAGE_BREAK',
  'SUBTOTAL'
);

CREATE TYPE billing_price_type AS ENUM (
  'STANDARD',
  'ESTIMATE',
  'BY_EFFORT'
);

CREATE TABLE billing_documents (
    id                    UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID                    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    number                VARCHAR(50)             NOT NULL,
    type                  billing_document_type   NOT NULL,
    status                billing_document_status NOT NULL DEFAULT 'DRAFT',

    -- Customer / Address
    address_id            UUID                    NOT NULL REFERENCES crm_addresses(id),
    contact_id            UUID                    REFERENCES crm_contacts(id) ON DELETE SET NULL,
    delivery_address_id   UUID                    REFERENCES crm_addresses(id) ON DELETE SET NULL,
    invoice_address_id    UUID                    REFERENCES crm_addresses(id) ON DELETE SET NULL,

    -- Links
    inquiry_id            UUID                    REFERENCES crm_inquiries(id) ON DELETE SET NULL,
    order_id              UUID                    REFERENCES orders(id) ON DELETE SET NULL,
    parent_document_id    UUID                    REFERENCES billing_documents(id) ON DELETE SET NULL,

    -- Dates
    order_date            TIMESTAMPTZ,
    document_date         TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    delivery_date         TIMESTAMPTZ,

    -- Terms & Conditions
    delivery_type         TEXT,
    delivery_terms        TEXT,
    payment_term_days     INTEGER,
    discount_percent      DOUBLE PRECISION,
    discount_days         INTEGER,
    discount_percent_2    DOUBLE PRECISION,
    discount_days_2       INTEGER,
    shipping_cost_net     DOUBLE PRECISION,
    shipping_cost_vat_rate DOUBLE PRECISION,

    -- Totals (computed, stored)
    subtotal_net          DOUBLE PRECISION        NOT NULL DEFAULT 0,
    total_vat             DOUBLE PRECISION        NOT NULL DEFAULT 0,
    total_gross           DOUBLE PRECISION        NOT NULL DEFAULT 0,

    -- Notes
    notes                 TEXT,
    internal_notes        TEXT,

    -- Print state
    printed_at            TIMESTAMPTZ,
    printed_by_id         UUID,

    -- Audit
    created_at            TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    created_by_id         UUID
);

-- Unique constraint: number per tenant
ALTER TABLE billing_documents
  ADD CONSTRAINT uq_billing_documents_tenant_number UNIQUE (tenant_id, number);

-- Indexes
CREATE INDEX idx_billing_documents_tenant_type ON billing_documents(tenant_id, type);
CREATE INDEX idx_billing_documents_tenant_status ON billing_documents(tenant_id, status);
CREATE INDEX idx_billing_documents_tenant_address ON billing_documents(tenant_id, address_id);
CREATE INDEX idx_billing_documents_tenant_inquiry ON billing_documents(tenant_id, inquiry_id);
CREATE INDEX idx_billing_documents_tenant_parent ON billing_documents(tenant_id, parent_document_id);
CREATE INDEX idx_billing_documents_tenant_date ON billing_documents(tenant_id, document_date);

-- Trigger for updated_at
CREATE TRIGGER set_billing_documents_updated_at
  BEFORE UPDATE ON billing_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Positions table
CREATE TABLE billing_document_positions (
    id                UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id       UUID                  NOT NULL REFERENCES billing_documents(id) ON DELETE CASCADE,
    sort_order        INTEGER               NOT NULL,
    type              billing_position_type NOT NULL DEFAULT 'FREE',
    article_id        UUID,
    article_number    VARCHAR(50),
    description       TEXT,
    quantity          DOUBLE PRECISION,
    unit              VARCHAR(20),
    unit_price        DOUBLE PRECISION,
    flat_costs        DOUBLE PRECISION,
    total_price       DOUBLE PRECISION,
    price_type        billing_price_type,
    vat_rate          DOUBLE PRECISION,
    delivery_date     TIMESTAMPTZ,
    confirmed_date    TIMESTAMPTZ,
    created_at        TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_billing_positions_document_sort ON billing_document_positions(document_id, sort_order);

-- Trigger for updated_at
CREATE TRIGGER set_billing_document_positions_updated_at
  BEFORE UPDATE ON billing_document_positions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### Step 1.2: Update Prisma Schema

**File:** `prisma/schema.prisma`

#### 1.2a: Add enums (after existing CRM enums, around line 262)

```prisma
// --- Billing Document Enums ---

enum BillingDocumentType {
  OFFER
  ORDER_CONFIRMATION
  DELIVERY_NOTE
  SERVICE_NOTE
  RETURN_DELIVERY
  INVOICE
  CREDIT_NOTE

  @@map("billing_document_type")
}

enum BillingDocumentStatus {
  DRAFT
  PRINTED
  PARTIALLY_FORWARDED
  FORWARDED
  CANCELLED

  @@map("billing_document_status")
}

enum BillingPositionType {
  ARTICLE
  FREE
  TEXT
  PAGE_BREAK
  SUBTOTAL

  @@map("billing_position_type")
}

enum BillingPriceType {
  STANDARD
  ESTIMATE
  BY_EFFORT

  @@map("billing_price_type")
}
```

#### 1.2b: Add BillingDocument model (after CrmTask model, end of CRM section)

```prisma
// -----------------------------------------------------------------------------
// BillingDocument
// -----------------------------------------------------------------------------
// Migration: 000099
//
// Commercial document in the billing chain (Belegkette).
// Types: Offer, Order Confirmation, Delivery Note, Service Note,
//        Return Delivery, Invoice, Credit Note.
// Status workflow: DRAFT -> PRINTED -> FORWARDED (CANCELLED at any point).
model BillingDocument {
  id                  String                 @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId            String                 @map("tenant_id") @db.Uuid
  number              String                 @db.VarChar(50)
  type                BillingDocumentType
  status              BillingDocumentStatus  @default(DRAFT)

  // Customer / Address
  addressId           String                 @map("address_id") @db.Uuid
  contactId           String?                @map("contact_id") @db.Uuid
  deliveryAddressId   String?                @map("delivery_address_id") @db.Uuid
  invoiceAddressId    String?                @map("invoice_address_id") @db.Uuid

  // Links
  inquiryId           String?                @map("inquiry_id") @db.Uuid
  orderId             String?                @map("order_id") @db.Uuid
  parentDocumentId    String?                @map("parent_document_id") @db.Uuid

  // Dates
  orderDate           DateTime?              @map("order_date") @db.Timestamptz(6)
  documentDate        DateTime               @default(now()) @map("document_date") @db.Timestamptz(6)
  deliveryDate        DateTime?              @map("delivery_date") @db.Timestamptz(6)

  // Terms & Conditions
  deliveryType        String?                @map("delivery_type")
  deliveryTerms       String?                @map("delivery_terms")
  paymentTermDays     Int?                   @map("payment_term_days")
  discountPercent     Float?                 @map("discount_percent")
  discountDays        Int?                   @map("discount_days")
  discountPercent2    Float?                 @map("discount_percent_2")
  discountDays2       Int?                   @map("discount_days_2")
  shippingCostNet     Float?                 @map("shipping_cost_net")
  shippingCostVatRate Float?                 @map("shipping_cost_vat_rate")

  // Totals (computed, stored for performance)
  subtotalNet         Float                  @default(0) @map("subtotal_net")
  totalVat            Float                  @default(0) @map("total_vat")
  totalGross          Float                  @default(0) @map("total_gross")

  // Notes
  notes               String?
  internalNotes       String?                @map("internal_notes")

  // Print state
  printedAt           DateTime?              @map("printed_at") @db.Timestamptz(6)
  printedById         String?                @map("printed_by_id") @db.Uuid

  // Audit
  createdAt           DateTime               @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime               @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById         String?                @map("created_by_id") @db.Uuid

  // Relations
  tenant           Tenant                    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  address          CrmAddress                @relation(fields: [addressId], references: [id])
  contact          CrmContact?               @relation(fields: [contactId], references: [id], onDelete: SetNull)
  deliveryAddress  CrmAddress?               @relation("DeliveryAddress", fields: [deliveryAddressId], references: [id], onDelete: SetNull)
  invoiceAddress   CrmAddress?               @relation("InvoiceAddress", fields: [invoiceAddressId], references: [id], onDelete: SetNull)
  inquiry          CrmInquiry?               @relation(fields: [inquiryId], references: [id], onDelete: SetNull)
  order            Order?                    @relation(fields: [orderId], references: [id], onDelete: SetNull)
  parentDocument   BillingDocument?          @relation("DocumentChain", fields: [parentDocumentId], references: [id], onDelete: SetNull)
  childDocuments   BillingDocument[]         @relation("DocumentChain")
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

// -----------------------------------------------------------------------------
// BillingDocumentPosition
// -----------------------------------------------------------------------------
// Migration: 000099
//
// Line item within a billing document. Types: Article, Free text, Text-only,
// Page break, Subtotal. Cascade-deleted with parent document.
model BillingDocumentPosition {
  id              String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  documentId      String              @map("document_id") @db.Uuid
  sortOrder       Int                 @map("sort_order")
  type            BillingPositionType @default(FREE)
  articleId       String?             @map("article_id") @db.Uuid
  articleNumber   String?             @map("article_number") @db.VarChar(50)
  description     String?
  quantity        Float?
  unit            String?             @db.VarChar(20)
  unitPrice       Float?              @map("unit_price")
  flatCosts       Float?              @map("flat_costs")
  totalPrice      Float?              @map("total_price")
  priceType       BillingPriceType?   @map("price_type")
  vatRate         Float?              @map("vat_rate")
  deliveryDate    DateTime?           @map("delivery_date") @db.Timestamptz(6)
  confirmedDate   DateTime?           @map("confirmed_date") @db.Timestamptz(6)
  createdAt       DateTime            @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime            @updatedAt @map("updated_at") @db.Timestamptz(6)

  document BillingDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@index([documentId, sortOrder])
  @@map("billing_document_positions")
}
```

#### 1.2c: Add reverse relations to existing models

**Tenant model** (around line 183, after `crmTasks CrmTask[]`):
```prisma
  billingDocuments            BillingDocument[]
```

**CrmAddress model** (around line 298, after `tasks CrmTask[]`):
```prisma
  billingDocuments         BillingDocument[]
  billingDocumentsDelivery BillingDocument[] @relation("DeliveryAddress")
  billingDocumentsInvoice  BillingDocument[] @relation("InvoiceAddress")
```

**CrmContact model** (around line 333, after `tasks CrmTask[]`):
```prisma
  billingDocuments BillingDocument[]
```

**CrmInquiry model** (around line 459, after `tasks CrmTask[]`):
```prisma
  billingDocuments BillingDocument[]
```

**Order model** (around line 1295, after `crmInquiries CrmInquiry[]`):
```prisma
  billingDocuments BillingDocument[]
```

### Step 1.3: Regenerate Prisma Client

```bash
pnpm db:generate
```

### Verification

```bash
# Migration should apply cleanly (if local DB is running):
# pnpm db:reset  OR apply the migration manually

# Prisma generate should succeed:
pnpm db:generate

# Typecheck should still pass (pre-existing errors only, no new errors):
pnpm typecheck 2>&1 | tail -5
```

---

## Phase 2: Permissions & Number Sequences

### Step 2.1: Add Permissions to Catalog

**File:** `src/lib/auth/permission-catalog.ts`

Add after the CRM Tasks section (line 246), before the closing `]`:

```typescript
  // Billing Documents
  p("billing_documents.view", "billing_documents", "view", "View billing documents"),
  p("billing_documents.create", "billing_documents", "create", "Create billing documents"),
  p("billing_documents.edit", "billing_documents", "edit", "Edit billing documents"),
  p("billing_documents.delete", "billing_documents", "delete", "Delete billing documents"),
  p("billing_documents.print", "billing_documents", "print", "Print/finalize billing documents"),
```

Update the comment on line 43 from `All 48 permissions` to `All 53 permissions` (48 original + 16 CRM + 5 billing - 16 CRM that were already counted = 53 total). Actually, count the existing permissions carefully. The current array has permissions for: core (employees, time_tracking, booking_overview, absences, etc.) + CRM (4x4=16). Count them to get the exact number and update the comment.

### Step 2.2: Add Default Prefixes for Number Sequences

**File:** `src/lib/services/number-sequence-service.ts`

Add to the `DEFAULT_PREFIXES` map (around line 29):

```typescript
const DEFAULT_PREFIXES: Record<string, string> = {
  customer: "K-",
  supplier: "L-",
  inquiry: "V-",
  // Billing document types
  offer: "A-",
  order_confirmation: "AB-",
  delivery_note: "LS-",
  service_note: "LN-",
  return_delivery: "R-",
  invoice: "RE-",
  credit_note: "G-",
}
```

**Note:** Use `"LS-"` for delivery_note (Lieferschein) to avoid conflict with `"L-"` (supplier). Use `"LN-"` for service_note (Leistungsnachweis) to differentiate from delivery_note.

### Verification

```bash
pnpm typecheck 2>&1 | tail -5
```

---

## Phase 3: Service Layer

### Step 3.1: Create Repository

**File:** `src/lib/services/billing-document-repository.ts`

```typescript
import type { PrismaClient, BillingDocumentType, BillingDocumentStatus } from "@/generated/prisma/client"

// --- Document Repository ---

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    type?: BillingDocumentType
    status?: BillingDocumentStatus
    addressId?: string
    inquiryId?: string
    search?: string
    dateFrom?: Date
    dateTo?: Date
    page: number
    pageSize: number
  }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params.type) where.type = params.type
  if (params.status) where.status = params.status
  if (params.addressId) where.addressId = params.addressId
  if (params.inquiryId) where.inquiryId = params.inquiryId

  if (params.search) {
    const term = params.search.trim()
    if (term.length > 0) {
      where.OR = [
        { number: { contains: term, mode: "insensitive" } },
        { notes: { contains: term, mode: "insensitive" } },
      ]
    }
  }

  if (params.dateFrom || params.dateTo) {
    const dateFilter: Record<string, unknown> = {}
    if (params.dateFrom) dateFilter.gte = params.dateFrom
    if (params.dateTo) dateFilter.lte = params.dateTo
    where.documentDate = dateFilter
  }

  const [items, total] = await Promise.all([
    prisma.billingDocument.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        address: true,
        contact: true,
        parentDocument: { select: { id: true, number: true, type: true } },
      },
    }),
    prisma.billingDocument.count({ where }),
  ])

  return { items, total }
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.billingDocument.findFirst({
    where: { id, tenantId },
    include: {
      address: true,
      contact: true,
      deliveryAddress: true,
      invoiceAddress: true,
      inquiry: { select: { id: true, number: true, title: true } },
      order: { select: { id: true, code: true, name: true } },
      parentDocument: { select: { id: true, number: true, type: true } },
      childDocuments: { select: { id: true, number: true, type: true, status: true } },
      positions: { orderBy: { sortOrder: "asc" } },
    },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    number: string
    type: BillingDocumentType
    addressId: string
    contactId?: string | null
    deliveryAddressId?: string | null
    invoiceAddressId?: string | null
    inquiryId?: string | null
    orderId?: string | null
    parentDocumentId?: string | null
    orderDate?: Date | null
    documentDate?: Date
    deliveryDate?: Date | null
    deliveryType?: string | null
    deliveryTerms?: string | null
    paymentTermDays?: number | null
    discountPercent?: number | null
    discountDays?: number | null
    discountPercent2?: number | null
    discountDays2?: number | null
    shippingCostNet?: number | null
    shippingCostVatRate?: number | null
    notes?: string | null
    internalNotes?: string | null
    createdById?: string | null
  }
) {
  return prisma.billingDocument.create({
    data,
    include: {
      address: true,
      contact: true,
      positions: { orderBy: { sortOrder: "asc" } },
    },
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  await prisma.billingDocument.updateMany({
    where: { id, tenantId },
    data,
  })
  return prisma.billingDocument.findFirst({
    where: { id, tenantId },
    include: {
      address: true,
      contact: true,
      deliveryAddress: true,
      invoiceAddress: true,
      inquiry: { select: { id: true, number: true, title: true } },
      order: { select: { id: true, code: true, name: true } },
      parentDocument: { select: { id: true, number: true, type: true } },
      childDocuments: { select: { id: true, number: true, type: true, status: true } },
      positions: { orderBy: { sortOrder: "asc" } },
    },
  })
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
): Promise<boolean> {
  const { count } = await prisma.billingDocument.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

// --- Position Repository ---

export async function findPositions(
  prisma: PrismaClient,
  documentId: string
) {
  return prisma.billingDocumentPosition.findMany({
    where: { documentId },
    orderBy: { sortOrder: "asc" },
  })
}

export async function findPositionById(
  prisma: PrismaClient,
  id: string
) {
  return prisma.billingDocumentPosition.findFirst({
    where: { id },
    include: { document: { select: { id: true, tenantId: true, status: true } } },
  })
}

export async function createPosition(
  prisma: PrismaClient,
  data: {
    documentId: string
    sortOrder: number
    type: string
    articleId?: string | null
    articleNumber?: string | null
    description?: string | null
    quantity?: number | null
    unit?: string | null
    unitPrice?: number | null
    flatCosts?: number | null
    totalPrice?: number | null
    priceType?: string | null
    vatRate?: number | null
    deliveryDate?: Date | null
    confirmedDate?: Date | null
  }
) {
  return prisma.billingDocumentPosition.create({ data })
}

export async function updatePosition(
  prisma: PrismaClient,
  id: string,
  data: Record<string, unknown>
) {
  await prisma.billingDocumentPosition.updateMany({
    where: { id },
    data,
  })
  return prisma.billingDocumentPosition.findFirst({ where: { id } })
}

export async function deletePosition(
  prisma: PrismaClient,
  id: string
): Promise<boolean> {
  const { count } = await prisma.billingDocumentPosition.deleteMany({
    where: { id },
  })
  return count > 0
}

export async function getMaxSortOrder(
  prisma: PrismaClient,
  documentId: string
): Promise<number> {
  const result = await prisma.billingDocumentPosition.findFirst({
    where: { documentId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  })
  return result?.sortOrder ?? 0
}

export async function countChildDocuments(
  prisma: PrismaClient,
  tenantId: string,
  parentDocumentId: string
): Promise<number> {
  return prisma.billingDocument.count({
    where: { tenantId, parentDocumentId },
  })
}
```

### Step 3.2: Create Billing Document Service

**File:** `src/lib/services/billing-document-service.ts`

```typescript
import type { PrismaClient, BillingDocumentType, BillingDocumentStatus } from "@/generated/prisma/client"
import * as repo from "./billing-document-repository"
import * as numberSeqService from "./number-sequence-service"

// --- Error Classes ---

export class BillingDocumentNotFoundError extends Error {
  constructor(message = "Billing document not found") {
    super(message)
    this.name = "BillingDocumentNotFoundError"
  }
}

export class BillingDocumentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BillingDocumentValidationError"
  }
}

export class BillingDocumentConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BillingDocumentConflictError"
  }
}

// --- Constants ---

const NUMBER_SEQUENCE_KEYS: Record<BillingDocumentType, string> = {
  OFFER: "offer",
  ORDER_CONFIRMATION: "order_confirmation",
  DELIVERY_NOTE: "delivery_note",
  SERVICE_NOTE: "service_note",
  RETURN_DELIVERY: "return_delivery",
  INVOICE: "invoice",
  CREDIT_NOTE: "credit_note",
}

const FORWARDING_RULES: Record<BillingDocumentType, BillingDocumentType[]> = {
  OFFER: ["ORDER_CONFIRMATION"],
  ORDER_CONFIRMATION: ["DELIVERY_NOTE", "SERVICE_NOTE"],
  DELIVERY_NOTE: ["INVOICE"],
  SERVICE_NOTE: ["INVOICE"],
  RETURN_DELIVERY: ["CREDIT_NOTE"],
  INVOICE: [],
  CREDIT_NOTE: [],
}

// --- Helper: ensure document is DRAFT ---

function assertDraft(status: BillingDocumentStatus) {
  if (status !== "DRAFT") {
    throw new BillingDocumentValidationError(
      "Document can only be modified in DRAFT status"
    )
  }
}

// --- Helper: recalculate document totals ---

export async function recalculateTotals(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
) {
  const positions = await repo.findPositions(prisma, documentId)

  let subtotalNet = 0
  const vatMap = new Map<number, number>()

  for (const pos of positions) {
    if (pos.totalPrice != null) {
      subtotalNet += pos.totalPrice
      if (pos.vatRate != null && pos.vatRate > 0) {
        const vatAmount = pos.totalPrice * (pos.vatRate / 100)
        vatMap.set(pos.vatRate, (vatMap.get(pos.vatRate) ?? 0) + vatAmount)
      }
    }
  }

  let totalVat = 0
  for (const amount of vatMap.values()) {
    totalVat += amount
  }

  const totalGross = subtotalNet + totalVat

  // Round to 2 decimal places
  const data = {
    subtotalNet: Math.round(subtotalNet * 100) / 100,
    totalVat: Math.round(totalVat * 100) / 100,
    totalGross: Math.round(totalGross * 100) / 100,
  }

  await prisma.billingDocument.updateMany({
    where: { id: documentId, tenantId },
    data,
  })

  return data
}

// --- Helper: calculate position totalPrice ---

function calculatePositionTotal(
  quantity: number | null | undefined,
  unitPrice: number | null | undefined,
  flatCosts: number | null | undefined
): number | null {
  const qty = quantity ?? 0
  const price = unitPrice ?? 0
  const flat = flatCosts ?? 0

  if (qty === 0 && price === 0 && flat === 0) return null

  return Math.round((qty * price + flat) * 100) / 100
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    type?: BillingDocumentType
    status?: BillingDocumentStatus
    addressId?: string
    inquiryId?: string
    search?: string
    dateFrom?: Date
    dateTo?: Date
    page: number
    pageSize: number
  }
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const doc = await repo.findById(prisma, tenantId, id)
  if (!doc) throw new BillingDocumentNotFoundError()
  return doc
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    type: BillingDocumentType
    addressId: string
    contactId?: string
    deliveryAddressId?: string
    invoiceAddressId?: string
    inquiryId?: string
    orderId?: string
    orderDate?: Date
    documentDate?: Date
    deliveryDate?: Date
    deliveryType?: string
    deliveryTerms?: string
    paymentTermDays?: number
    discountPercent?: number
    discountDays?: number
    discountPercent2?: number
    discountDays2?: number
    shippingCostNet?: number
    shippingCostVatRate?: number
    notes?: string
    internalNotes?: string
  },
  createdById: string
) {
  // Validate address belongs to tenant
  const address = await prisma.crmAddress.findFirst({
    where: { id: input.addressId, tenantId },
  })
  if (!address) {
    throw new BillingDocumentValidationError("Address not found in this tenant")
  }

  // Validate contact belongs to address (if provided)
  if (input.contactId) {
    const contact = await prisma.crmContact.findFirst({
      where: { id: input.contactId, addressId: input.addressId, tenantId },
    })
    if (!contact) {
      throw new BillingDocumentValidationError("Contact not found for this address")
    }
  }

  // Validate delivery address (if provided)
  if (input.deliveryAddressId) {
    const deliveryAddr = await prisma.crmAddress.findFirst({
      where: { id: input.deliveryAddressId, tenantId },
    })
    if (!deliveryAddr) {
      throw new BillingDocumentValidationError("Delivery address not found in this tenant")
    }
  }

  // Validate invoice address (if provided)
  if (input.invoiceAddressId) {
    const invoiceAddr = await prisma.crmAddress.findFirst({
      where: { id: input.invoiceAddressId, tenantId },
    })
    if (!invoiceAddr) {
      throw new BillingDocumentValidationError("Invoice address not found in this tenant")
    }
  }

  // Generate number for document type
  const seqKey = NUMBER_SEQUENCE_KEYS[input.type]
  const number = await numberSeqService.getNextNumber(prisma, tenantId, seqKey)

  // Pre-fill payment terms from address defaults
  const paymentTermDays = input.paymentTermDays ?? address.paymentTermDays ?? null
  const discountPercent = input.discountPercent ?? address.discountPercent ?? null
  const discountDays = input.discountDays ?? address.discountDays ?? null

  return repo.create(prisma, {
    tenantId,
    number,
    type: input.type,
    addressId: input.addressId,
    contactId: input.contactId || null,
    deliveryAddressId: input.deliveryAddressId || null,
    invoiceAddressId: input.invoiceAddressId || null,
    inquiryId: input.inquiryId || null,
    orderId: input.orderId || null,
    orderDate: input.orderDate || null,
    documentDate: input.documentDate || new Date(),
    deliveryDate: input.deliveryDate || null,
    deliveryType: input.deliveryType || null,
    deliveryTerms: input.deliveryTerms || null,
    paymentTermDays,
    discountPercent,
    discountDays,
    discountPercent2: input.discountPercent2 ?? null,
    discountDays2: input.discountDays2 ?? null,
    shippingCostNet: input.shippingCostNet ?? null,
    shippingCostVatRate: input.shippingCostVatRate ?? null,
    notes: input.notes || null,
    internalNotes: input.internalNotes || null,
    createdById,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    contactId?: string | null
    deliveryAddressId?: string | null
    invoiceAddressId?: string | null
    orderDate?: Date | null
    documentDate?: Date
    deliveryDate?: Date | null
    deliveryType?: string | null
    deliveryTerms?: string | null
    paymentTermDays?: number | null
    discountPercent?: number | null
    discountDays?: number | null
    discountPercent2?: number | null
    discountDays2?: number | null
    shippingCostNet?: number | null
    shippingCostVatRate?: number | null
    notes?: string | null
    internalNotes?: string | null
  }
) {
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) throw new BillingDocumentNotFoundError()

  assertDraft(existing.status)

  const data: Record<string, unknown> = {}
  const fields = [
    "contactId", "deliveryAddressId", "invoiceAddressId",
    "orderDate", "documentDate", "deliveryDate",
    "deliveryType", "deliveryTerms",
    "paymentTermDays", "discountPercent", "discountDays",
    "discountPercent2", "discountDays2",
    "shippingCostNet", "shippingCostVatRate",
    "notes", "internalNotes",
  ] as const

  for (const field of fields) {
    if (input[field] !== undefined) {
      data[field] = input[field]
    }
  }

  if (Object.keys(data).length === 0) return existing

  return repo.update(prisma, tenantId, input.id, data)
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new BillingDocumentNotFoundError()

  assertDraft(existing.status)

  // Check for child documents
  const childCount = await repo.countChildDocuments(prisma, tenantId, id)
  if (childCount > 0) {
    throw new BillingDocumentValidationError(
      "Cannot delete document with forwarded child documents"
    )
  }

  const deleted = await repo.remove(prisma, tenantId, id)
  if (!deleted) throw new BillingDocumentNotFoundError()
}

export async function print(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  printedById: string
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new BillingDocumentNotFoundError()

  if (existing.status !== "DRAFT") {
    throw new BillingDocumentValidationError(
      "Only DRAFT documents can be printed"
    )
  }

  // Must have at least one position
  if (!existing.positions || existing.positions.length === 0) {
    throw new BillingDocumentValidationError(
      "Document must have at least one position before printing"
    )
  }

  return repo.update(prisma, tenantId, id, {
    status: "PRINTED",
    printedAt: new Date(),
    printedById,
  })
}

export async function forward(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  targetType: BillingDocumentType,
  createdById: string
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new BillingDocumentNotFoundError()

  // Must be printed to forward
  if (existing.status !== "PRINTED" && existing.status !== "PARTIALLY_FORWARDED") {
    throw new BillingDocumentValidationError(
      "Only PRINTED or PARTIALLY_FORWARDED documents can be forwarded"
    )
  }

  // Validate forwarding rule
  const allowedTargets = FORWARDING_RULES[existing.type]
  if (!allowedTargets.includes(targetType)) {
    throw new BillingDocumentValidationError(
      `Cannot forward ${existing.type} to ${targetType}. Allowed: ${allowedTargets.join(", ") || "none"}`
    )
  }

  // Generate number for target type
  const seqKey = NUMBER_SEQUENCE_KEYS[targetType]
  const number = await numberSeqService.getNextNumber(prisma, tenantId, seqKey)

  // Create child document inheriting header fields
  const newDoc = await repo.create(prisma, {
    tenantId,
    number,
    type: targetType,
    addressId: existing.addressId,
    contactId: existing.contactId,
    deliveryAddressId: existing.deliveryAddressId,
    invoiceAddressId: existing.invoiceAddressId,
    inquiryId: existing.inquiryId,
    orderId: existing.orderId,
    parentDocumentId: existing.id,
    orderDate: existing.orderDate,
    documentDate: new Date(),
    deliveryDate: existing.deliveryDate,
    deliveryType: existing.deliveryType,
    deliveryTerms: existing.deliveryTerms,
    paymentTermDays: existing.paymentTermDays,
    discountPercent: existing.discountPercent,
    discountDays: existing.discountDays,
    discountPercent2: existing.discountPercent2,
    discountDays2: existing.discountDays2,
    shippingCostNet: existing.shippingCostNet,
    shippingCostVatRate: existing.shippingCostVatRate,
    notes: existing.notes,
    internalNotes: existing.internalNotes,
    createdById,
  })

  // Copy positions
  if (existing.positions && existing.positions.length > 0) {
    for (const pos of existing.positions) {
      await repo.createPosition(prisma, {
        documentId: newDoc.id,
        sortOrder: pos.sortOrder,
        type: pos.type,
        articleId: pos.articleId,
        articleNumber: pos.articleNumber,
        description: pos.description,
        quantity: pos.quantity,
        unit: pos.unit,
        unitPrice: pos.unitPrice,
        flatCosts: pos.flatCosts,
        totalPrice: pos.totalPrice,
        priceType: pos.priceType,
        vatRate: pos.vatRate,
        deliveryDate: pos.deliveryDate,
        confirmedDate: pos.confirmedDate,
      })
    }
  }

  // Recalculate totals on new document
  await recalculateTotals(prisma, tenantId, newDoc.id)

  // Update source document status
  await repo.update(prisma, tenantId, existing.id, {
    status: "FORWARDED",
  })

  // Return the new document with positions
  return repo.findById(prisma, tenantId, newDoc.id)
}

export async function cancel(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  reason?: string
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new BillingDocumentNotFoundError()

  if (existing.status === "CANCELLED") {
    throw new BillingDocumentConflictError("Document is already cancelled")
  }

  if (existing.status === "FORWARDED") {
    throw new BillingDocumentValidationError(
      "Cannot cancel a fully forwarded document"
    )
  }

  const data: Record<string, unknown> = { status: "CANCELLED" }
  if (reason) data.internalNotes = reason

  return repo.update(prisma, tenantId, id, data)
}

export async function duplicate(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  createdById: string
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new BillingDocumentNotFoundError()

  // Generate new number for same type
  const seqKey = NUMBER_SEQUENCE_KEYS[existing.type]
  const number = await numberSeqService.getNextNumber(prisma, tenantId, seqKey)

  // Create copy as DRAFT
  const newDoc = await repo.create(prisma, {
    tenantId,
    number,
    type: existing.type,
    addressId: existing.addressId,
    contactId: existing.contactId,
    deliveryAddressId: existing.deliveryAddressId,
    invoiceAddressId: existing.invoiceAddressId,
    inquiryId: existing.inquiryId,
    orderId: existing.orderId,
    parentDocumentId: null,
    orderDate: existing.orderDate,
    documentDate: new Date(),
    deliveryDate: existing.deliveryDate,
    deliveryType: existing.deliveryType,
    deliveryTerms: existing.deliveryTerms,
    paymentTermDays: existing.paymentTermDays,
    discountPercent: existing.discountPercent,
    discountDays: existing.discountDays,
    discountPercent2: existing.discountPercent2,
    discountDays2: existing.discountDays2,
    shippingCostNet: existing.shippingCostNet,
    shippingCostVatRate: existing.shippingCostVatRate,
    notes: existing.notes,
    internalNotes: existing.internalNotes,
    createdById,
  })

  // Copy positions
  if (existing.positions && existing.positions.length > 0) {
    for (const pos of existing.positions) {
      await repo.createPosition(prisma, {
        documentId: newDoc.id,
        sortOrder: pos.sortOrder,
        type: pos.type,
        articleId: pos.articleId,
        articleNumber: pos.articleNumber,
        description: pos.description,
        quantity: pos.quantity,
        unit: pos.unit,
        unitPrice: pos.unitPrice,
        flatCosts: pos.flatCosts,
        totalPrice: pos.totalPrice,
        priceType: pos.priceType,
        vatRate: pos.vatRate,
        deliveryDate: pos.deliveryDate,
        confirmedDate: pos.confirmedDate,
      })
    }
  }

  // Recalculate totals
  await recalculateTotals(prisma, tenantId, newDoc.id)

  return repo.findById(prisma, tenantId, newDoc.id)
}

// --- Position Operations ---

export async function addPosition(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    documentId: string
    type: string
    articleId?: string
    articleNumber?: string
    description?: string
    quantity?: number
    unit?: string
    unitPrice?: number
    flatCosts?: number
    priceType?: string
    vatRate?: number
    deliveryDate?: Date
    confirmedDate?: Date
  }
) {
  // Verify document exists and is DRAFT
  const doc = await repo.findById(prisma, tenantId, input.documentId)
  if (!doc) throw new BillingDocumentNotFoundError()
  assertDraft(doc.status)

  // Get next sort order
  const maxSort = await repo.getMaxSortOrder(prisma, input.documentId)

  // Calculate total price
  const totalPrice = calculatePositionTotal(input.quantity, input.unitPrice, input.flatCosts)

  const position = await repo.createPosition(prisma, {
    documentId: input.documentId,
    sortOrder: maxSort + 1,
    type: input.type,
    articleId: input.articleId || null,
    articleNumber: input.articleNumber || null,
    description: input.description || null,
    quantity: input.quantity ?? null,
    unit: input.unit || null,
    unitPrice: input.unitPrice ?? null,
    flatCosts: input.flatCosts ?? null,
    totalPrice,
    priceType: input.priceType || null,
    vatRate: input.vatRate ?? null,
    deliveryDate: input.deliveryDate || null,
    confirmedDate: input.confirmedDate || null,
  })

  // Recalculate document totals
  await recalculateTotals(prisma, tenantId, input.documentId)

  return position
}

export async function updatePosition(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    description?: string
    quantity?: number
    unit?: string
    unitPrice?: number
    flatCosts?: number
    priceType?: string
    vatRate?: number
    deliveryDate?: Date | null
    confirmedDate?: Date | null
  }
) {
  // Find position and verify parent doc is DRAFT
  const pos = await repo.findPositionById(prisma, input.id)
  if (!pos) throw new BillingDocumentValidationError("Position not found")
  if (!pos.document) throw new BillingDocumentNotFoundError()
  if (pos.document.tenantId !== tenantId) throw new BillingDocumentNotFoundError()
  assertDraft(pos.document.status)

  const data: Record<string, unknown> = {}
  const fields = [
    "description", "quantity", "unit", "unitPrice", "flatCosts",
    "priceType", "vatRate", "deliveryDate", "confirmedDate",
  ] as const

  for (const field of fields) {
    if (input[field] !== undefined) {
      data[field] = input[field]
    }
  }

  // Recalculate totalPrice if relevant fields changed
  if (input.quantity !== undefined || input.unitPrice !== undefined || input.flatCosts !== undefined) {
    const qty = input.quantity ?? pos.quantity
    const price = input.unitPrice ?? pos.unitPrice
    const flat = input.flatCosts ?? pos.flatCosts
    data.totalPrice = calculatePositionTotal(qty, price, flat)
  }

  if (Object.keys(data).length === 0) return pos

  const updated = await repo.updatePosition(prisma, input.id, data)

  // Recalculate document totals
  await recalculateTotals(prisma, tenantId, pos.document.id)

  return updated
}

export async function deletePosition(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const pos = await repo.findPositionById(prisma, id)
  if (!pos) throw new BillingDocumentValidationError("Position not found")
  if (!pos.document) throw new BillingDocumentNotFoundError()
  if (pos.document.tenantId !== tenantId) throw new BillingDocumentNotFoundError()
  assertDraft(pos.document.status)

  const documentId = pos.document.id
  const deleted = await repo.deletePosition(prisma, id)
  if (!deleted) throw new BillingDocumentValidationError("Position not found")

  // Recalculate document totals
  await recalculateTotals(prisma, tenantId, documentId)
}

export async function reorderPositions(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string,
  positionIds: string[]
) {
  const doc = await repo.findById(prisma, tenantId, documentId)
  if (!doc) throw new BillingDocumentNotFoundError()
  assertDraft(doc.status)

  // Update sort order for each position
  for (let i = 0; i < positionIds.length; i++) {
    await repo.updatePosition(prisma, positionIds[i]!, { sortOrder: i + 1 })
  }

  return repo.findPositions(prisma, documentId)
}

export async function listPositions(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
) {
  // Verify document belongs to tenant
  const doc = await prisma.billingDocument.findFirst({
    where: { id: documentId, tenantId },
    select: { id: true },
  })
  if (!doc) throw new BillingDocumentNotFoundError()

  return repo.findPositions(prisma, documentId)
}
```

### Step 3.3: Create PDF Service (Stub)

**File:** `src/lib/services/billing-document-pdf-service.ts`

This is a stub — the actual PDF rendering can be built later. For now, it returns a placeholder response.

```typescript
import type { PrismaClient } from "@/generated/prisma/client"
import * as billingDocService from "./billing-document-service"

// --- Error Classes ---

export class BillingDocumentPdfError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BillingDocumentPdfError"
  }
}

/**
 * Generate a PDF preview for a billing document.
 * Returns a URL or base64 data. Stub implementation for now.
 */
export async function generatePdf(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
) {
  const doc = await billingDocService.getById(prisma, tenantId, documentId)

  // TODO: Implement actual PDF generation using @react-pdf/renderer or similar
  return {
    documentId: doc.id,
    documentNumber: doc.number,
    documentType: doc.type,
    pdfUrl: null as string | null,
    message: "PDF generation not yet implemented",
  }
}
```

### Verification

```bash
pnpm typecheck 2>&1 | tail -5
```

---

## Phase 4: tRPC Router

### Step 4.1: Create Billing Documents Router

**File:** `src/trpc/routers/billing/documents.ts`

```typescript
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as billingDocService from "@/lib/services/billing-document-service"
import * as billingPdfService from "@/lib/services/billing-document-pdf-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const BILLING_VIEW = permissionIdByKey("billing_documents.view")!
const BILLING_CREATE = permissionIdByKey("billing_documents.create")!
const BILLING_EDIT = permissionIdByKey("billing_documents.edit")!
const BILLING_DELETE = permissionIdByKey("billing_documents.delete")!
const BILLING_PRINT = permissionIdByKey("billing_documents.print")!

// --- Base procedure with module guard ---
const billingProcedure = tenantProcedure.use(requireModule("billing"))

// --- Input Schemas ---
const documentTypeEnum = z.enum([
  "OFFER", "ORDER_CONFIRMATION", "DELIVERY_NOTE",
  "SERVICE_NOTE", "RETURN_DELIVERY", "INVOICE", "CREDIT_NOTE",
])

const documentStatusEnum = z.enum([
  "DRAFT", "PRINTED", "PARTIALLY_FORWARDED", "FORWARDED", "CANCELLED",
])

const positionTypeEnum = z.enum(["ARTICLE", "FREE", "TEXT", "PAGE_BREAK", "SUBTOTAL"])
const priceTypeEnum = z.enum(["STANDARD", "ESTIMATE", "BY_EFFORT"])

const listInput = z.object({
  type: documentTypeEnum.optional(),
  status: documentStatusEnum.optional(),
  addressId: z.string().uuid().optional(),
  inquiryId: z.string().uuid().optional(),
  search: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

const createInput = z.object({
  type: documentTypeEnum,
  addressId: z.string().uuid(),
  contactId: z.string().uuid().optional(),
  deliveryAddressId: z.string().uuid().optional(),
  invoiceAddressId: z.string().uuid().optional(),
  inquiryId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  orderDate: z.coerce.date().optional(),
  documentDate: z.coerce.date().optional(),
  deliveryDate: z.coerce.date().optional(),
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

const updateInput = z.object({
  id: z.string().uuid(),
  contactId: z.string().uuid().nullable().optional(),
  deliveryAddressId: z.string().uuid().nullable().optional(),
  invoiceAddressId: z.string().uuid().nullable().optional(),
  orderDate: z.coerce.date().nullable().optional(),
  documentDate: z.coerce.date().optional(),
  deliveryDate: z.coerce.date().nullable().optional(),
  deliveryType: z.string().nullable().optional(),
  deliveryTerms: z.string().nullable().optional(),
  paymentTermDays: z.number().int().nullable().optional(),
  discountPercent: z.number().nullable().optional(),
  discountDays: z.number().int().nullable().optional(),
  discountPercent2: z.number().nullable().optional(),
  discountDays2: z.number().int().nullable().optional(),
  shippingCostNet: z.number().nullable().optional(),
  shippingCostVatRate: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
})

const idInput = z.object({ id: z.string().uuid() })

const forwardInput = z.object({
  id: z.string().uuid(),
  targetType: z.enum([
    "ORDER_CONFIRMATION", "DELIVERY_NOTE", "SERVICE_NOTE", "INVOICE", "CREDIT_NOTE",
  ]),
})

const cancelInput = z.object({
  id: z.string().uuid(),
  reason: z.string().optional(),
})

const addPositionInput = z.object({
  documentId: z.string().uuid(),
  type: positionTypeEnum,
  articleId: z.string().uuid().optional(),
  articleNumber: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  unitPrice: z.number().optional(),
  flatCosts: z.number().optional(),
  priceType: priceTypeEnum.optional(),
  vatRate: z.number().optional(),
  deliveryDate: z.coerce.date().optional(),
  confirmedDate: z.coerce.date().optional(),
})

const updatePositionInput = z.object({
  id: z.string().uuid(),
  description: z.string().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  unitPrice: z.number().optional(),
  flatCosts: z.number().optional(),
  priceType: priceTypeEnum.optional(),
  vatRate: z.number().optional(),
  deliveryDate: z.coerce.date().nullable().optional(),
  confirmedDate: z.coerce.date().nullable().optional(),
})

const reorderInput = z.object({
  documentId: z.string().uuid(),
  positionIds: z.array(z.string().uuid()),
})

// --- Router ---
export const billingDocumentsRouter = createTRPCRouter({
  // Document CRUD
  list: billingProcedure
    .use(requirePermission(BILLING_VIEW))
    .input(listInput)
    .query(async ({ ctx, input }) => {
      try {
        return await billingDocService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: billingProcedure
    .use(requirePermission(BILLING_VIEW))
    .input(idInput)
    .query(async ({ ctx, input }) => {
      try {
        return await billingDocService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: billingProcedure
    .use(requirePermission(BILLING_CREATE))
    .input(createInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await billingDocService.create(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          ctx.user!.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  update: billingProcedure
    .use(requirePermission(BILLING_EDIT))
    .input(updateInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await billingDocService.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  delete: billingProcedure
    .use(requirePermission(BILLING_DELETE))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        await billingDocService.remove(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // Workflow
  print: billingProcedure
    .use(requirePermission(BILLING_PRINT))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await billingDocService.print(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          ctx.user!.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  forward: billingProcedure
    .use(requirePermission(BILLING_CREATE))
    .input(forwardInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await billingDocService.forward(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          input.targetType as any,
          ctx.user!.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  cancel: billingProcedure
    .use(requirePermission(BILLING_EDIT))
    .input(cancelInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await billingDocService.cancel(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          input.reason
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  duplicate: billingProcedure
    .use(requirePermission(BILLING_CREATE))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await billingDocService.duplicate(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          ctx.user!.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  generatePdf: billingProcedure
    .use(requirePermission(BILLING_VIEW))
    .input(idInput)
    .query(async ({ ctx, input }) => {
      try {
        return await billingPdfService.generatePdf(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // Position sub-procedures
  positions: createTRPCRouter({
    list: billingProcedure
      .use(requirePermission(BILLING_VIEW))
      .input(z.object({ documentId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          return await billingDocService.listPositions(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.documentId
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    add: billingProcedure
      .use(requirePermission(BILLING_EDIT))
      .input(addPositionInput)
      .mutation(async ({ ctx, input }) => {
        try {
          return await billingDocService.addPosition(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    update: billingProcedure
      .use(requirePermission(BILLING_EDIT))
      .input(updatePositionInput)
      .mutation(async ({ ctx, input }) => {
        try {
          return await billingDocService.updatePosition(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    delete: billingProcedure
      .use(requirePermission(BILLING_EDIT))
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        try {
          await billingDocService.deletePosition(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.id
          )
          return { success: true }
        } catch (err) {
          handleServiceError(err)
        }
      }),

    reorder: billingProcedure
      .use(requirePermission(BILLING_EDIT))
      .input(reorderInput)
      .mutation(async ({ ctx, input }) => {
        try {
          return await billingDocService.reorderPositions(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.documentId,
            input.positionIds
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),
  }),
})
```

### Step 4.2: Create Billing Router Index

**File:** `src/trpc/routers/billing/index.ts`

```typescript
/**
 * Billing Router
 *
 * Merges billing sub-routers: documents.
 * All procedures are guarded by requireModule("billing").
 */
import { createTRPCRouter } from "@/trpc/init"
import { billingDocumentsRouter } from "./documents"

export const billingRouter = createTRPCRouter({
  documents: billingDocumentsRouter,
})
```

### Step 4.3: Register in Root Router

**File:** `src/trpc/routers/_app.ts`

Add import:
```typescript
import { billingRouter } from "./billing"
```

Add to `appRouter`:
```typescript
  billing: billingRouter,
```

Place it after the `crm: crmRouter,` line.

### Verification

```bash
pnpm typecheck 2>&1 | tail -10
```

---

## Phase 5: Frontend

### Step 5.1: Create React Hooks

**File:** `src/hooks/use-billing-documents.ts`

Follow the exact pattern from `src/hooks/use-crm-inquiries.ts`:

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Billing Document Hooks ====================

interface UseBillingDocumentsOptions {
  enabled?: boolean
  type?: "OFFER" | "ORDER_CONFIRMATION" | "DELIVERY_NOTE" | "SERVICE_NOTE" | "RETURN_DELIVERY" | "INVOICE" | "CREDIT_NOTE"
  status?: "DRAFT" | "PRINTED" | "PARTIALLY_FORWARDED" | "FORWARDED" | "CANCELLED"
  addressId?: string
  inquiryId?: string
  search?: string
  dateFrom?: Date
  dateTo?: Date
  page?: number
  pageSize?: number
}

export function useBillingDocuments(options: UseBillingDocumentsOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.documents.list.queryOptions(
      {
        type: input.type,
        status: input.status,
        addressId: input.addressId,
        inquiryId: input.inquiryId,
        search: input.search,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        page: input.page ?? 1,
        pageSize: input.pageSize ?? 25,
      },
      { enabled }
    )
  )
}

export function useBillingDocumentById(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.documents.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useCreateBillingDocument() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.list.queryKey(),
      })
    },
  })
}

export function useUpdateBillingDocument() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.getById.queryKey(),
      })
    },
  })
}

export function useDeleteBillingDocument() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.list.queryKey(),
      })
    },
  })
}

export function usePrintBillingDocument() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.print.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.getById.queryKey(),
      })
    },
  })
}

export function useForwardBillingDocument() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.forward.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.getById.queryKey(),
      })
    },
  })
}

export function useCancelBillingDocument() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.cancel.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.list.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.getById.queryKey(),
      })
    },
  })
}

export function useDuplicateBillingDocument() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.duplicate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.list.queryKey(),
      })
    },
  })
}

// ==================== Position Hooks ====================

export function useBillingPositions(documentId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.documents.positions.list.queryOptions(
      { documentId },
      { enabled: enabled && !!documentId }
    )
  )
}

export function useAddBillingPosition() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.positions.add.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.positions.list.queryKey(),
      })
    },
  })
}

export function useUpdateBillingPosition() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.positions.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.positions.list.queryKey(),
      })
    },
  })
}

export function useDeleteBillingPosition() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.positions.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.positions.list.queryKey(),
      })
    },
  })
}

export function useReorderBillingPositions() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.positions.reorder.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.getById.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.positions.list.queryKey(),
      })
    },
  })
}
```

### Step 5.2: Create UI Components

**Directory:** `src/components/billing/`

Create the following component files. Each follows existing CRM component patterns.

#### `src/components/billing/document-type-badge.tsx`
Small badge component mapping BillingDocumentType to color/label:
- OFFER: blue "Angebot"
- ORDER_CONFIRMATION: indigo "Auftragsbestätigung"
- DELIVERY_NOTE: green "Lieferschein"
- SERVICE_NOTE: teal "Leistungsschein"
- RETURN_DELIVERY: orange "Rücklieferung"
- INVOICE: purple "Rechnung"
- CREDIT_NOTE: pink "Gutschrift"

#### `src/components/billing/document-status-badge.tsx`
Status badge:
- DRAFT: gray "Entwurf"
- PRINTED: blue "Gedruckt"
- PARTIALLY_FORWARDED: yellow "Teilw. fortgeführt"
- FORWARDED: green "Fortgeführt"
- CANCELLED: red "Storniert"

#### `src/components/billing/document-totals-summary.tsx`
Display subtotalNet, totalVat (grouped by rate), totalGross in a summary card.

#### `src/components/billing/document-list.tsx`
Data table following `inquiry-list.tsx` pattern:
- Columns: Number, Type (badge), Customer (address.company), Date, Total (totalGross), Status (badge)
- Filters: type tabs (All + 7 types), status dropdown, date range, search input
- Row click navigates to `/orders/documents/[id]`
- "Neuer Beleg" button opens type selection then navigates to create page

#### `src/components/billing/document-form.tsx`
Full page form for create/edit (not a sheet — too complex for side panel):
- Header section: type (read-only on edit), customer address (search/select), contact, delivery address, invoice address
- Dates section: document date, order date, delivery date
- Terms section: delivery type, delivery terms, payment term days, discount fields, shipping costs
- Positions section: embedded `document-position-table.tsx`
- Notes section: notes, internal notes
- Footer: Save/Cancel buttons, totals summary

#### `src/components/billing/document-detail.tsx`
Detail view for non-DRAFT (printed/forwarded) documents:
- Header: back button, document number, type badge, status badge
- Action bar: Print (if DRAFT), Forward (if PRINTED), Cancel, Duplicate, PDF Preview
- Immutable notice (Alert) when status != DRAFT
- Tabs: Overview (header fields in cards), Positions (read-only table), Chain (parent/child links)
- Totals summary

#### `src/components/billing/document-position-table.tsx`
Editable table of positions (when DRAFT) / read-only (when not DRAFT):
- Columns: #, Type, Description, Qty, Unit, Unit Price, Flat Costs, Total, VAT%, Actions
- Add button with type dropdown (Article, Free, Text, Page Break, Subtotal)
- Inline editing for description, qty, unit price, flat costs, vat rate
- Drag handle for reorder (or up/down arrows)
- Delete button per row
- Running total at bottom

#### `src/components/billing/document-forward-dialog.tsx`
Dialog for forwarding:
- Shows current document type/number
- Radio buttons for allowed target types (from FORWARDING_RULES)
- Confirm button creates forwarded document
- On success, navigate to new document

#### `src/components/billing/document-print-dialog.tsx`
Confirmation dialog before printing:
- Warning: "Nach dem Drucken ist der Beleg unveränderbar"
- For ORDER_CONFIRMATION: optional fields for Terp Order creation (activity group, target hours)
- Confirm prints and locks the document

### Step 5.3: Create Page Routes

#### `src/app/[locale]/(dashboard)/orders/documents/page.tsx`

```tsx
import { BillingDocumentList } from "@/components/billing/document-list"

export default function BillingDocumentsPage() {
  return <BillingDocumentList />
}
```

#### `src/app/[locale]/(dashboard)/orders/documents/[id]/page.tsx`

```tsx
import { BillingDocumentDetail } from "@/components/billing/document-detail"

export default function BillingDocumentDetailPage({ params }: { params: { id: string } }) {
  return <BillingDocumentDetail id={params.id} />
}
```

#### `src/app/[locale]/(dashboard)/orders/documents/new/page.tsx`

```tsx
import { BillingDocumentForm } from "@/components/billing/document-form"

export default function BillingDocumentCreatePage() {
  return <BillingDocumentForm />
}
```

### Step 5.4: Add Navigation Link

Find the sidebar navigation configuration and add an entry for "Belege" under the Orders section, pointing to `/orders/documents`. This should be gated by `requireModule("billing")`.

### Verification

```bash
pnpm typecheck 2>&1 | tail -10
pnpm lint 2>&1 | tail -10
```

---

## Phase 6: Tests

### Step 6.1: Service Unit Tests

**File:** `src/lib/services/__tests__/billing-document-service.test.ts`

Follow the exact pattern from `src/lib/services/__tests__/crm-inquiry-service.test.ts`.

```typescript
import { describe, it, expect, vi } from "vitest"
import * as service from "../billing-document-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Constants ---
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ADDRESS_ID = "b0000000-0000-4000-b000-000000000001"
const CONTACT_ID = "c0000000-0000-4000-a000-000000000001"
const DOC_ID = "d0000000-0000-4000-a000-000000000001"
const POS_ID = "e0000000-0000-4000-a000-000000000001"

const mockAddress = {
  id: ADDRESS_ID,
  tenantId: TENANT_ID,
  company: "Test GmbH",
  paymentTermDays: 30,
  discountPercent: 2.0,
  discountDays: 10,
}

const mockDocument = {
  id: DOC_ID,
  tenantId: TENANT_ID,
  number: "A-1",
  type: "OFFER" as const,
  status: "DRAFT" as const,
  addressId: ADDRESS_ID,
  contactId: null,
  deliveryAddressId: null,
  invoiceAddressId: null,
  inquiryId: null,
  orderId: null,
  parentDocumentId: null,
  orderDate: null,
  documentDate: new Date(),
  deliveryDate: null,
  deliveryType: null,
  deliveryTerms: null,
  paymentTermDays: 30,
  discountPercent: 2.0,
  discountDays: 10,
  discountPercent2: null,
  discountDays2: null,
  shippingCostNet: null,
  shippingCostVatRate: null,
  subtotalNet: 0,
  totalVat: 0,
  totalGross: 0,
  notes: null,
  internalNotes: null,
  printedAt: null,
  printedById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: USER_ID,
  address: mockAddress,
  contact: null,
  deliveryAddress: null,
  invoiceAddress: null,
  inquiry: null,
  order: null,
  parentDocument: null,
  childDocuments: [],
  positions: [],
}

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    crmAddress: { findFirst: vi.fn() },
    crmContact: { findFirst: vi.fn() },
    billingDocument: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    billingDocumentPosition: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    numberSequence: { upsert: vi.fn() },
    ...overrides,
  } as unknown as PrismaClient
}
```

**Test cases to implement:**

```typescript
describe("billing-document-service", () => {
  describe("create", () => {
    it("creates with auto-generated number per document type")
    // Mock: address.findFirst returns mockAddress, numberSequence.upsert returns {prefix:"A-",nextValue:2}
    // Verify: billingDocument.create called with number "A-1", type "OFFER"

    it("populates payment terms from customer address defaults")
    // Mock: address returns {paymentTermDays:30, discountPercent:2, discountDays:10}
    // Verify: create called with those values

    it("rejects if address not in tenant")
    // Mock: address.findFirst returns null
    // Expect: throws "Address not found in this tenant"

    it("rejects if contact not found for address")
    // Mock: address found, contact.findFirst returns null
    // Expect: throws "Contact not found for this address"
  })

  describe("update", () => {
    it("updates draft document fields")
    // Mock: findFirst returns DRAFT doc, updateMany succeeds
    // Verify: data passed correctly

    it("rejects when status is not DRAFT")
    // Mock: findFirst returns PRINTED doc
    // Expect: throws "Document can only be modified in DRAFT status"
  })

  describe("print", () => {
    it("sets status to PRINTED and records printedAt/printedById")
    // Mock: DRAFT doc with positions
    // Verify: updateMany called with {status:"PRINTED", printedAt, printedById}

    it("rejects if not DRAFT")
    // Mock: PRINTED doc
    // Expect: throws "Only DRAFT documents can be printed"

    it("rejects if no positions")
    // Mock: DRAFT doc with empty positions
    // Expect: throws "must have at least one position"
  })

  describe("forward", () => {
    it("OFFER can forward to ORDER_CONFIRMATION")
    // Mock: PRINTED OFFER, create + copy positions
    // Verify: new doc type ORDER_CONFIRMATION, parent link set, source set to FORWARDED

    it("ORDER_CONFIRMATION can forward to DELIVERY_NOTE or SERVICE_NOTE")
    // Two sub-tests for each valid target

    it("DELIVERY_NOTE forwards to INVOICE")
    it("SERVICE_NOTE forwards to INVOICE")
    it("RETURN_DELIVERY forwards to CREDIT_NOTE")

    it("INVOICE cannot be forwarded (end of chain)")
    // Mock: PRINTED INVOICE
    // Expect: throws "Cannot forward INVOICE... Allowed: none"

    it("copies all positions to new document")
    // Verify createPosition called for each position

    it("sets parent document status to FORWARDED")
    // Verify updateMany on parent

    it("rejects if source status is not PRINTED")
    // Mock: DRAFT doc
    // Expect: throws "Only PRINTED or PARTIALLY_FORWARDED"
  })

  describe("cancel", () => {
    it("sets status to CANCELLED")
    it("rejects if already cancelled")
    it("rejects if fully forwarded")
  })

  describe("duplicate", () => {
    it("creates DRAFT copy with new number")
    it("copies positions")
  })

  describe("addPosition", () => {
    it("adds position with calculated totalPrice")
    // quantity=10, unitPrice=5 => totalPrice=50
    it("recalculates document totals")
    it("rejects if document is not DRAFT")
  })

  describe("updatePosition", () => {
    it("recalculates totalPrice on quantity/price change")
    it("recalculates document totals")
  })

  describe("deletePosition", () => {
    it("removes position and recalculates totals")
    it("rejects if document is not DRAFT")
  })

  describe("reorderPositions", () => {
    it("updates sortOrder for all positions")
  })

  describe("recalculateTotals", () => {
    it("sums position totals correctly")
    it("groups VAT by rate")
    it("calculates totalGross = subtotalNet + totalVat")
  })
})
```

### Step 6.2: Router Integration Tests

**File:** `src/trpc/routers/__tests__/billingDocuments-router.test.ts`

Follow the exact pattern from `src/trpc/routers/__tests__/crmInquiries-router.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { billingDocumentsRouter } from "../billing/documents"
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

const BILLING_VIEW = permissionIdByKey("billing_documents.view")!
const BILLING_CREATE = permissionIdByKey("billing_documents.create")!
const BILLING_EDIT = permissionIdByKey("billing_documents.edit")!
const BILLING_DELETE = permissionIdByKey("billing_documents.delete")!
const BILLING_PRINT = permissionIdByKey("billing_documents.print")!
const ALL_PERMS = [BILLING_VIEW, BILLING_CREATE, BILLING_EDIT, BILLING_DELETE, BILLING_PRINT]

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(billingDocumentsRouter)

const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "billing" }),
  },
}

function withModuleMock(prisma: Record<string, unknown>) {
  return { ...MODULE_MOCK, ...prisma }
}

function createTestContext(
  prisma: Record<string, unknown>,
  permissions: string[] = ALL_PERMS
) {
  return createMockContext({
    prisma: withModuleMock(prisma) as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

function createNoPermContext(prisma: Record<string, unknown>) {
  return createTestContext(prisma, [])
}
```

**Test cases to implement:**

```typescript
describe("billing.documents.list", () => {
  it("returns paginated list")
  it("requires billing_documents.view permission")
  it("requires billing module enabled")
  it("filters by type")
  it("filters by status")
  it("searches by number")
})

describe("billing.documents.getById", () => {
  it("returns document with positions")
  it("throws NOT_FOUND for missing document")
})

describe("billing.documents.create", () => {
  it("creates DRAFT document with auto number")
  it("requires billing_documents.create permission")
  it("validates address belongs to tenant")
})

describe("billing.documents.update", () => {
  it("updates draft document")
  it("rejects non-DRAFT")
  it("requires billing_documents.edit permission")
})

describe("billing.documents.delete", () => {
  it("deletes draft document")
  it("requires billing_documents.delete permission")
})

describe("billing.documents.print", () => {
  it("sets status to PRINTED")
  it("requires billing_documents.print permission")
  it("rejects non-DRAFT")
})

describe("billing.documents.forward", () => {
  it("creates child document with correct type")
  it("rejects invalid type transition")
  it("requires billing_documents.create permission")
})

describe("billing.documents.positions.add", () => {
  it("adds position and recalculates totals")
  it("requires billing_documents.edit permission")
})

describe("billing.documents.positions.reorder", () => {
  it("updates sort order")
})
```

### Step 6.3: Browser E2E Tests

**File:** `src/e2e-browser/30-billing-documents.spec.ts`

```typescript
import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad } from "./helpers/nav";
import {
  fillInput,
  selectOption,
  submitAndWaitForClose,
  waitForSheet,
  expectTableContains,
  clickTab,
} from "./helpers/forms";

// --- Constants ---
const COMPANY = "E2E Belegkette GmbH";
const CONTACT_FIRST = "E2E Klaus";
const CONTACT_LAST = "E2E Bauer";

test.describe.serial("UC-ORD-01: Document Chain (Belegkette)", () => {
  // Pre-condition: Create address with contact
  test("create address for billing tests", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await page.getByRole("button", { name: "Neue Adresse" }).click();
    await waitForSheet(page);
    await fillInput(page, "company", COMPANY);
    await fillInput(page, "city", "München");
    await submitAndWaitForClose(page);
    await waitForTableLoad(page);
    await expectTableContains(page, COMPANY);
  });

  test("create an offer with positions", async ({ page }) => {
    await navigateTo(page, "/orders/documents");
    // Click "Neuer Beleg" or similar
    // Select type "Angebot"
    // Select customer address
    // Add free-text position: description, qty=10, unitPrice=100, vatRate=19
    // Verify total calculated (1000 net, 190 vat, 1190 gross)
    // Save
    // Verify in list as DRAFT
  });

  test("print offer", async ({ page }) => {
    // Navigate to offer detail
    // Click "Drucken"
    // Confirm dialog
    // Verify status changes to PRINTED
    // Verify edit button disabled/hidden
  });

  test("forward offer to order confirmation", async ({ page }) => {
    // From printed offer, click "Fortführen"
    // Select "Auftragsbestätigung"
    // Confirm
    // Verify new AB document created
    // Verify positions copied
    // Verify parent document shows as FORWARDED
  });

  test("print AB and forward to delivery note", async ({ page }) => {
    // Print the AB
    // Forward to Lieferschein
    // Verify chain maintained
  });

  test("forward delivery note to invoice", async ({ page }) => {
    // Print delivery note
    // Forward to Rechnung
    // Verify invoice created with all positions
  });

  test("cannot edit printed document", async ({ page }) => {
    // Navigate to a printed document
    // Verify edit controls are disabled/not visible
  });

  test("cancel a draft document", async ({ page }) => {
    // Create a new offer
    // Click cancel
    // Verify status CANCELLED
  });

  test("duplicate a document", async ({ page }) => {
    // From any document, click Duplicate
    // Verify new DRAFT created with same positions
  });
});
```

### Step 6.4: Update Global Setup for E2E Cleanup

**File:** `src/e2e-browser/global-setup.ts`

Add to the CLEANUP_SQL string, before the CRM cleanup block:

```sql
-- Billing document records (spec 30)
DELETE FROM billing_document_positions WHERE document_id IN (SELECT id FROM billing_documents WHERE tenant_id = '10000000-0000-0000-0000-000000000001' AND number LIKE 'E2E%');
DELETE FROM billing_documents WHERE tenant_id = '10000000-0000-0000-0000-000000000001' AND number LIKE 'E2E%';
```

Also add number sequence resets:

```sql
-- Reset billing number sequences to safe values
INSERT INTO number_sequences (id, tenant_id, key, prefix, next_value, created_at, updated_at)
VALUES
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'offer', 'A-', 100, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'order_confirmation', 'AB-', 100, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'delivery_note', 'LS-', 100, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'service_note', 'LN-', 100, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'return_delivery', 'R-', 100, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'invoice', 'RE-', 100, NOW(), NOW()),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'credit_note', 'G-', 100, NOW(), NOW())
ON CONFLICT (tenant_id, key) DO UPDATE SET next_value = GREATEST(number_sequences.next_value, 100);
```

**Note:** The E2E tests may need to search for documents by company name rather than number prefix, since numbers are auto-generated. Alternatively, the cleanup can delete by address_id linked to `E2E%` company names. Adjust the cleanup SQL if needed:

```sql
DELETE FROM billing_document_positions WHERE document_id IN (
  SELECT bd.id FROM billing_documents bd
  JOIN crm_addresses ca ON bd.address_id = ca.id
  WHERE ca.company LIKE 'E2E%'
);
DELETE FROM billing_documents WHERE address_id IN (
  SELECT id FROM crm_addresses WHERE company LIKE 'E2E%'
);
```

### Verification

```bash
# Run service unit tests
pnpm vitest run src/lib/services/__tests__/billing-document-service.test.ts

# Run router integration tests
pnpm vitest run src/trpc/routers/__tests__/billingDocuments-router.test.ts

# Run all tests
pnpm test

# Run browser E2E tests (requires running dev server + Supabase)
# pnpm exec playwright test src/e2e-browser/30-billing-documents.spec.ts
```

---

## Phase 7: Handbook Documentation

### Step 7.1: Read Current Handbook End

The handbook currently ends with section 13 (Glossar) at line 4986. The billing section should be inserted as **section 13** ("Belege & Fakturierung"), and the current Glossar should be renumbered to **section 14**.

### Step 7.2: Update Table of Contents

Add after section 12 entries (around line 46):

```markdown
13. [Belege & Fakturierung](#13-belege--fakturierung)
    - [13.1 Belegtypen](#131-belegtypen)
    - [13.2 Belegliste](#132-belegliste)
    - [13.3 Beleg anlegen](#133-beleg-anlegen)
    - [13.4 Positionen verwalten](#134-positionen-verwalten)
    - [13.5 Beleg drucken (Festschreiben)](#135-beleg-drucken-festschreiben)
    - [13.6 Beleg fortführen (Belegkette)](#136-beleg-fortführen-belegkette)
    - [13.7 Beleg stornieren](#137-beleg-stornieren)
    - [13.8 Beleg duplizieren](#138-beleg-duplizieren)
    - [13.9 Praxisbeispiel: Angebot bis Rechnung](#139-praxisbeispiel-angebot-bis-rechnung)
14. [Glossar](#14-glossar)
```

### Step 7.3: Write Section Content

Insert before the Glossar section. Follow the exact formatting and style used in section 12 (CRM). All text in German, using "Sie" formal address. Include the emoji markers (this is an explicit part of the handbook format: use the marker convention defined in the handbook legend at the top).

#### Content Outline (German):

```markdown
---

## 13. Belege & Fakturierung

**Was ist es?** Das Belegmodul bildet die gesamte kaufmännische Belegkette ab — vom Angebot über Auftragsbestätigung und Lieferschein bis zur Rechnung und Gutschrift. Jeder Beleg enthält Positionen (Artikel, Freitext, Zwischensummen) mit automatischer Berechnung.

**Wozu dient es?** Angebote erstellen, Aufträge bestätigen, Lieferungen dokumentieren und Rechnungen generieren — alles in einem durchgängigen Workflow mit lückenloser Nachverfolgbarkeit der Belegkette.

⚠️ Modul: **Billing** muss aktiviert sein (📍 Administration → Module → "Billing" aktivieren)

⚠️ Berechtigung: `billing_documents.view`, `billing_documents.create`, `billing_documents.edit`, `billing_documents.delete`, `billing_documents.print`

📍 Aufträge → Belege

✅ Sie sehen die Belegliste mit allen Dokumenten des aktiven Mandanten.

### 13.1 Belegtypen

| Typ | Deutsch | Prefix | Beschreibung |
|-----|---------|--------|-------------|
| **OFFER** | Angebot | A- | Erstes Dokument in der Kette. Preisvorschlag an den Kunden. |
| **ORDER_CONFIRMATION** | Auftragsbestätigung | AB- | Bestätigung des Auftrags nach Angebotsakzeptanz. |
| **DELIVERY_NOTE** | Lieferschein | LS- | Begleitdokument für eine Warenlieferung. |
| **SERVICE_NOTE** | Leistungsschein | LN- | Nachweis erbrachter Dienstleistungen. |
| **RETURN_DELIVERY** | Rücklieferung | R- | Dokumentation einer Warenrücksendung. |
| **INVOICE** | Rechnung | RE- | Zahlungsaufforderung an den Kunden. Ende der Kette. |
| **CREDIT_NOTE** | Gutschrift | G- | Rückerstattung/Gutschrift an den Kunden. |

### Belegkette (Fortführungsregeln)

| Quellbeleg | Kann fortgeführt werden zu |
|-----------|--------------------------|
| Angebot → | Auftragsbestätigung |
| Auftragsbestätigung → | Lieferschein, Leistungsschein |
| Lieferschein → | Rechnung |
| Leistungsschein → | Rechnung |
| Rücklieferung → | Gutschrift |
| Rechnung | (Ende der Kette) |
| Gutschrift | (Ende der Kette) |

### 13.2 Belegliste

📍 Aufträge → Belege

Tabelle mit Spalten:

| Spalte | Beschreibung |
|--------|-------------|
| **Nummer** | Auto-generierte Belegnummer (z.B. A-1, RE-42) |
| **Typ** | Belegtyp als farbiges Badge |
| **Kunde** | Firmenname der verknüpften Adresse |
| **Datum** | Belegdatum |
| **Betrag** | Bruttosumme (totalGross) |
| **Status** | Entwurf, Gedruckt, Fortgeführt, Storniert |

**Filter:**
- **Typ-Tabs**: Alle, Angebot, AB, Lieferschein, etc.
- **Status-Filter**: Dropdown mit Statuswerten
- **Datumsbereich**: Von/Bis
- **Suchfeld**: Suche nach Belegnummer

### 13.3 Beleg anlegen

1. 📍 **"Neuer Beleg"** (Belegliste, oben rechts)
2. ✅ Formular öffnet sich
3. Belegtyp wählen (Angebot, AB, Lieferschein, etc.)
4. Kundenadresse auswählen (Pflicht)
5. Optionale Felder:
   - **Kontaktperson**: Ansprechpartner aus der Adresse
   - **Lieferadresse**: Abweichende Lieferanschrift
   - **Rechnungsadresse**: Abweichende Rechnungsanschrift
   - **Anfrage**: Verknüpfung zu einer CRM-Anfrage
   - **Belegdatum**: Standard = heute
   - **Auftragsdatum**: Datum der Beauftragung
   - **Liefertermin**: Gewünschtes Lieferdatum
   - **Lieferart / Lieferbedingungen**: Freitext
   - **Zahlungsziel**: Tage (wird aus Kundenadresse vorbelegt)
   - **Skonto %**: Skontosatz (wird aus Kundenadresse vorbelegt)
   - **Skonto Tage**: Skontofrist (wird aus Kundenadresse vorbelegt)
   - **Versandkosten netto**: Pauschalversandkosten
   - **Bemerkungen / Interne Notizen**: Freitext
6. 📍 **"Speichern"**
7. ✅ Beleg wird als **Entwurf** angelegt. Belegnummer wird automatisch vergeben.

💡 Zahlungsbedingungen werden automatisch aus den Stammdaten der Kundenadresse übernommen, können aber im Beleg überschrieben werden.

### 13.4 Positionen verwalten

Positionen werden direkt im Beleg bearbeitet (nur im Status **Entwurf**).

**Positionstypen:**

| Typ | Beschreibung |
|-----|-------------|
| **Artikel** | Position aus dem Artikelkatalog (mit Preis-Lookup) |
| **Freitext** | Freie Position mit Beschreibung und Preis |
| **Textzeile** | Nur Beschreibung, kein Preis (z.B. Hinweistext) |
| **Seitenumbruch** | Seitentrenner für den PDF-Druck |
| **Zwischensumme** | Zeigt die Summe aller vorangehenden Positionen |

##### Position hinzufügen

1. 📍 **"Position hinzufügen"** (im Positionsbereich des Belegs)
2. Positionstyp wählen
3. Felder ausfüllen:
   - **Beschreibung**: Text der Position
   - **Menge**: Anzahl
   - **Einheit**: Stk, Std, kg, etc.
   - **Einzelpreis**: Preis pro Einheit netto
   - **Pauschalkosten**: Einmalige Zusatzkosten
   - **MwSt-Satz**: z.B. 19%, 7%
   - **Preistyp**: Standard / Richtpreis / Nach Aufwand
4. ✅ **Positionssumme** = Menge × Einzelpreis + Pauschalkosten
5. ✅ **Belegsumme** wird automatisch aktualisiert

##### Positionen sortieren

Positionen können per Drag-and-Drop oder mit Pfeiltasten umsortiert werden.

##### Position löschen

📍 Löschsymbol (🗑) am Zeilenende → Bestätigung → Position wird entfernt und Summen neu berechnet.

### 13.5 Beleg drucken (Festschreiben)

1. 📍 **"Drucken"** (Belegdetail, Aktionsleiste)
2. ⚠️ Warnung: "Nach dem Drucken ist der Beleg unveränderbar."
3. ✅ Status wechselt von **Entwurf** → **Gedruckt**
4. ✅ `printedAt` und `printedById` werden gesetzt
5. ✅ Beleg und alle Positionen sind nun schreibgeschützt
6. ✅ Erlaubte Aktionen nach dem Druck: **Fortführen**, **Stornieren**, **Duplizieren**

⚠️ Berechtigung: `billing_documents.print` erforderlich

### 13.6 Beleg fortführen (Belegkette)

Das Fortführen erstellt einen neuen Beleg aus einem gedruckten Beleg — mit kopierten Positionen und einer Verknüpfung zum Quellbeleg.

1. 📍 **"Fortführen"** (nur bei Status Gedruckt)
2. ✅ Dialog zeigt erlaubte Zielbelegtypen
3. Zielbelegtyp auswählen
4. 📍 **"Fortführen"**
5. ✅ Neuer Beleg wird als **Entwurf** erstellt
6. ✅ Alle Positionen werden kopiert
7. ✅ Quellbeleg-Status wechselt zu **Fortgeführt**
8. ✅ Verknüpfung über `parentDocumentId` nachvollziehbar

💡 Die Belegkette ist auf der Detailseite jedes Belegs im Tab "Kette" sichtbar (Eltern- und Kind-Belege).

### 13.7 Beleg stornieren

1. 📍 **"Stornieren"** (Belegdetail, Aktionsleiste)
2. Optionaler Stornierungsgrund
3. ✅ Status wechselt zu **Storniert**
4. ⚠️ Nicht möglich bei Status **Fortgeführt** (alle Positionen wurden bereits übernommen)

### 13.8 Beleg duplizieren

1. 📍 **"Duplizieren"** (Belegdetail, Aktionsleiste)
2. ✅ Erstellt eine **Entwurf**-Kopie mit neuer Belegnummer
3. ✅ Alle Positionen werden kopiert
4. ✅ Kein `parentDocumentId` — eigenständiger Beleg

### Status-Workflow

| Status | Badge | Bedeutung | Erlaubte Aktionen |
|--------|-------|-----------|-------------------|
| **DRAFT** (Entwurf) | grau | In Bearbeitung | Bearbeiten, Positionen ändern, Drucken, Löschen |
| **PRINTED** (Gedruckt) | blau | Festgeschrieben | Fortführen, Stornieren, Duplizieren |
| **PARTIALLY_FORWARDED** | gelb | Teilweise fortgeführt | Fortführen, Stornieren, Duplizieren |
| **FORWARDED** (Fortgeführt) | grün | Vollständig fortgeführt | Duplizieren |
| **CANCELLED** (Storniert) | rot | Storniert | Duplizieren |

### 13.9 Praxisbeispiel: Angebot bis Rechnung

**Szenario:** Sie erstellen ein Angebot für einen Kunden, der Kunde nimmt an, Sie liefern und stellen eine Rechnung.

1. 📍 Aufträge → Belege → **"Neuer Beleg"**
2. Typ: **Angebot**, Kunde: "Mustermann GmbH"
3. Position hinzufügen: "Beratungsleistung", Menge: 10, Einheit: Std, Einzelpreis: 120,00 €, MwSt: 19%
4. Position hinzufügen: "Fahrtkosten", Pauschalkosten: 150,00 €, MwSt: 19%
5. 📍 **"Speichern"** → Angebot A-1 im Entwurf
6. 📍 **"Drucken"** → Angebot A-1 ist festgeschrieben

7. Kunde nimmt an → 📍 **"Fortführen"** → Auftragsbestätigung
8. ✅ AB-1 erstellt mit kopierten Positionen
9. 📍 AB-1 **"Drucken"** → AB-1 festgeschrieben

10. Lieferung erfolgt → 📍 AB-1 **"Fortführen"** → Lieferschein
11. ✅ LS-1 erstellt
12. 📍 LS-1 **"Drucken"**

13. 📍 LS-1 **"Fortführen"** → Rechnung
14. ✅ RE-1 erstellt mit allen Positionen
15. 📍 RE-1 **"Drucken"** → Rechnung festgeschrieben

✅ Belegkette vollständig: A-1 → AB-1 → LS-1 → RE-1
```

### Step 7.4: Update Glossar Number

Renumber section "13. Glossar" to "14. Glossar". Update the heading and all internal references.

### Step 7.5: Add Billing Glossar Entries

Add to the Glossar table:

```markdown
| **Beleg** | Kaufmännisches Dokument in der Belegkette (Angebot, AB, Lieferschein, Rechnung etc.) | 📍 Aufträge → Belege |
| **Belegkette** | Lückenlose Abfolge von Belegen: Angebot → AB → Lieferschein → Rechnung | 📍 Aufträge → Belege → Detail → Tab Kette |
| **Belegposition** | Einzelne Zeile in einem Beleg (Artikel, Freitext, Textzeile, Seitenumbruch, Zwischensumme) | 📍 Aufträge → Belege → Detail → Positionen |
| **Festschreiben** | Drucken eines Belegs, der dadurch unveränderbar wird (Status: Gedruckt) | 📍 Aufträge → Belege → Detail → "Drucken" |
| **Fortführen** | Erstellen eines Folgebelegs aus einem gedruckten Beleg mit Übernahme aller Positionen | 📍 Aufträge → Belege → Detail → "Fortführen" |
```

### Verification

- Read through the entire new section for consistency with handbook style
- Verify all navigation paths match actual routes
- Verify all field names match the implementation

---

## Summary: Files to Create

| # | File | Phase |
|---|------|-------|
| 1 | `supabase/migrations/20260101000099_create_billing_documents.sql` | 1 |
| 2 | `src/lib/services/billing-document-repository.ts` | 3 |
| 3 | `src/lib/services/billing-document-service.ts` | 3 |
| 4 | `src/lib/services/billing-document-pdf-service.ts` | 3 |
| 5 | `src/trpc/routers/billing/documents.ts` | 4 |
| 6 | `src/trpc/routers/billing/index.ts` | 4 |
| 7 | `src/hooks/use-billing-documents.ts` | 5 |
| 8 | `src/components/billing/document-type-badge.tsx` | 5 |
| 9 | `src/components/billing/document-status-badge.tsx` | 5 |
| 10 | `src/components/billing/document-totals-summary.tsx` | 5 |
| 11 | `src/components/billing/document-list.tsx` | 5 |
| 12 | `src/components/billing/document-form.tsx` | 5 |
| 13 | `src/components/billing/document-detail.tsx` | 5 |
| 14 | `src/components/billing/document-position-table.tsx` | 5 |
| 15 | `src/components/billing/document-forward-dialog.tsx` | 5 |
| 16 | `src/components/billing/document-print-dialog.tsx` | 5 |
| 17 | `src/app/[locale]/(dashboard)/orders/documents/page.tsx` | 5 |
| 18 | `src/app/[locale]/(dashboard)/orders/documents/[id]/page.tsx` | 5 |
| 19 | `src/app/[locale]/(dashboard)/orders/documents/new/page.tsx` | 5 |
| 20 | `src/lib/services/__tests__/billing-document-service.test.ts` | 6 |
| 21 | `src/trpc/routers/__tests__/billingDocuments-router.test.ts` | 6 |
| 22 | `src/e2e-browser/30-billing-documents.spec.ts` | 6 |

## Summary: Files to Modify

| # | File | Change | Phase |
|---|------|--------|-------|
| 1 | `prisma/schema.prisma` | Add 4 enums, 2 models, 5 reverse relations | 1 |
| 2 | `src/lib/auth/permission-catalog.ts` | Add 5 billing_documents permissions, update comment | 2 |
| 3 | `src/lib/services/number-sequence-service.ts` | Add 7 DEFAULT_PREFIXES entries | 2 |
| 4 | `src/trpc/routers/_app.ts` | Import & register billingRouter | 4 |
| 5 | `src/e2e-browser/global-setup.ts` | Add billing document cleanup SQL + number sequence resets | 6 |
| 6 | `docs/TERP_HANDBUCH.md` | Add section 13 (Belege), renumber Glossar to 14, add glossar entries | 7 |

## Verification Commands (Full Suite)

After all phases are complete:

```bash
# 1. Regenerate Prisma client
pnpm db:generate

# 2. Typecheck (no new errors beyond baseline)
pnpm typecheck 2>&1 | tail -10

# 3. Lint
pnpm lint

# 4. Unit tests
pnpm vitest run src/lib/services/__tests__/billing-document-service.test.ts

# 5. Router integration tests
pnpm vitest run src/trpc/routers/__tests__/billingDocuments-router.test.ts

# 6. All tests
pnpm test

# 7. Build
pnpm build

# 8. E2E browser tests (requires running dev server + Supabase)
# pnpm exec playwright test src/e2e-browser/30-billing-documents.spec.ts
```
