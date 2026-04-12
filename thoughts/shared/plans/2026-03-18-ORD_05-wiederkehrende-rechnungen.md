---
ticket: ORD_05
title: Wiederkehrende Rechnungen (Recurring Invoices)
date: 2026-03-18
status: draft
---

# ORD_05 Implementation Plan: Wiederkehrende Rechnungen (Recurring Invoices)

## Overview

Implement recurring invoices for maintenance contracts (Wartungsvertraege). A recurring invoice is a template that generates actual INVOICE-type BillingDocuments at configurable intervals. Supports manual and automatic (cron) generation.

---

## Phase 1: Database Schema

### 1.1 Supabase Migration

**Create:** `supabase/migrations/20260101000103_create_billing_recurring_invoices.sql`

```sql
-- ORD_05: Billing Recurring Invoices (Wiederkehrende Rechnungen)

CREATE TYPE billing_recurring_interval AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY');

CREATE TABLE billing_recurring_invoices (
    id                UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name              TEXT            NOT NULL,
    address_id        UUID            NOT NULL REFERENCES crm_addresses(id),
    contact_id        UUID            REFERENCES crm_contacts(id) ON DELETE SET NULL,
    interval          billing_recurring_interval NOT NULL,
    start_date        TIMESTAMPTZ     NOT NULL,
    end_date          TIMESTAMPTZ,
    next_due_date     TIMESTAMPTZ     NOT NULL,
    last_generated_at TIMESTAMPTZ,
    auto_generate     BOOLEAN         NOT NULL DEFAULT FALSE,
    is_active         BOOLEAN         NOT NULL DEFAULT TRUE,

    -- Invoice template fields
    delivery_type     TEXT,
    delivery_terms    TEXT,
    payment_term_days INTEGER,
    discount_percent  DOUBLE PRECISION,
    discount_days     INTEGER,
    notes             TEXT,
    internal_notes    TEXT,

    -- Position template (JSONB array)
    position_template JSONB           NOT NULL,

    -- Audit
    created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by_id     UUID
);

CREATE INDEX idx_billing_recurring_invoices_tenant_active ON billing_recurring_invoices(tenant_id, is_active);
CREATE INDEX idx_billing_recurring_invoices_tenant_due ON billing_recurring_invoices(tenant_id, next_due_date);

CREATE TRIGGER set_billing_recurring_invoices_updated_at
  BEFORE UPDATE ON billing_recurring_invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

Follow the exact pattern from `20260101000102_create_billing_price_lists.sql`.

### 1.2 Prisma Schema Updates

**Modify:** `prisma/schema.prisma`

**1.2a** Add `BillingRecurringInterval` enum after the existing billing enums (after `BillingPriceType` enum, around line 605):

```prisma
enum BillingRecurringInterval {
  MONTHLY
  QUARTERLY
  SEMI_ANNUALLY
  ANNUALLY

  @@map("billing_recurring_interval")
}
```

**1.2b** Add `BillingRecurringInvoice` model after `BillingPriceList` model (after line ~860):

```prisma
// -----------------------------------------------------------------------------
// BillingRecurringInvoice
// -----------------------------------------------------------------------------
// Migration: 000103
//
// Template for recurring invoice generation. Stores invoice header + positions
// as JSONB. On each generation cycle, creates a BillingDocument of type INVOICE.
model BillingRecurringInvoice {
  id              String                   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String                   @map("tenant_id") @db.Uuid
  name            String
  addressId       String                   @map("address_id") @db.Uuid
  contactId       String?                  @map("contact_id") @db.Uuid
  interval        BillingRecurringInterval
  startDate       DateTime                 @map("start_date") @db.Timestamptz(6)
  endDate         DateTime?                @map("end_date") @db.Timestamptz(6)
  nextDueDate     DateTime                 @map("next_due_date") @db.Timestamptz(6)
  lastGeneratedAt DateTime?                @map("last_generated_at") @db.Timestamptz(6)
  autoGenerate    Boolean                  @default(false) @map("auto_generate")
  isActive        Boolean                  @default(true) @map("is_active")

  // Invoice template fields
  deliveryType    String?                  @map("delivery_type")
  deliveryTerms   String?                  @map("delivery_terms")
  paymentTermDays Int?                     @map("payment_term_days")
  discountPercent Float?                   @map("discount_percent")
  discountDays    Int?                     @map("discount_days")
  notes           String?
  internalNotes   String?                  @map("internal_notes")

  // Position template as JSONB array
  positionTemplate Json                    @map("position_template") @db.JsonB

  // Audit
  createdAt       DateTime                 @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime                 @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById     String?                  @map("created_by_id") @db.Uuid

  // Relations
  tenant  Tenant      @relation(fields: [tenantId], references: [id])
  address CrmAddress  @relation(fields: [addressId], references: [id])
  contact CrmContact? @relation(fields: [contactId], references: [id], onDelete: SetNull)

  @@index([tenantId, isActive])
  @@index([tenantId, nextDueDate])
  @@map("billing_recurring_invoices")
}
```

**1.2c** Add relation to `Tenant` model (after `billingPriceLists` line 187):

```prisma
  billingRecurringInvoices    BillingRecurringInvoice[]
```

**1.2d** Add relation to `CrmAddress` model (after `billingServiceCases` line 306):

```prisma
  billingRecurringInvoices    BillingRecurringInvoice[]
```

**1.2e** Add relation to `CrmContact` model (after `billingServiceCases` line 344):

```prisma
  billingRecurringInvoices    BillingRecurringInvoice[]
```

### 1.3 Verification

```bash
pnpm db:start                    # Ensure Supabase is running
pnpm supabase migration up       # Apply migration
pnpm db:generate                 # Regenerate Prisma client
pnpm typecheck                   # Verify schema compiles
```

---

## Phase 2: Permissions

### 2.1 Permission Catalog

**Modify:** `src/lib/auth/permission-catalog.ts`

Add 3 new permissions after the `billing_price_lists.manage` entry (line 268), before the closing `]`:

```ts
  // Billing Recurring Invoices
  p("billing_recurring.view", "billing_recurring", "view", "View recurring invoices"),
  p("billing_recurring.manage", "billing_recurring", "manage", "Manage recurring invoice templates"),
  p("billing_recurring.generate", "billing_recurring", "generate", "Generate invoices from recurring templates"),
```

Also update the comment at line 43 from `All 83 permissions` to `All 86 permissions`.

### 2.2 Verification

```bash
pnpm typecheck
```

---

## Phase 3: Service + Repository Layer

### 3.1 Repository

**Create:** `src/lib/services/billing-recurring-invoice-repository.ts`

Follow the pattern from `billing-price-list-repository.ts`:

```ts
import type { PrismaClient, BillingRecurringInterval } from "@/generated/prisma/client"

// --- Includes ---
const LIST_INCLUDE = {
  address: { select: { id: true, number: true, company: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
}

const DETAIL_INCLUDE = {
  address: true,
  contact: true,
}

// --- Repository Functions ---

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    isActive?: boolean
    addressId?: string
    search?: string
    page: number
    pageSize: number
  }
) {
  const where: Record<string, unknown> = { tenantId }
  if (params.isActive !== undefined) where.isActive = params.isActive
  if (params.addressId) where.addressId = params.addressId
  if (params.search) {
    const term = params.search.trim()
    if (term.length > 0) {
      where.OR = [
        { name: { contains: term, mode: "insensitive" } },
        { notes: { contains: term, mode: "insensitive" } },
      ]
    }
  }

  const [items, total] = await Promise.all([
    prisma.billingRecurringInvoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: LIST_INCLUDE,
    }),
    prisma.billingRecurringInvoice.count({ where }),
  ])

  return { items, total }
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.billingRecurringInvoice.findFirst({
    where: { id, tenantId },
    include: DETAIL_INCLUDE,
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    name: string
    addressId: string
    contactId?: string | null
    interval: BillingRecurringInterval
    startDate: Date
    endDate?: Date | null
    nextDueDate: Date
    autoGenerate?: boolean
    deliveryType?: string | null
    deliveryTerms?: string | null
    paymentTermDays?: number | null
    discountPercent?: number | null
    discountDays?: number | null
    notes?: string | null
    internalNotes?: string | null
    positionTemplate: unknown  // JSON array
    createdById?: string | null
  }
) {
  return prisma.billingRecurringInvoice.create({
    data,
    include: DETAIL_INCLUDE,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  await prisma.billingRecurringInvoice.updateMany({
    where: { id, tenantId },
    data,
  })
  return prisma.billingRecurringInvoice.findFirst({
    where: { id, tenantId },
    include: DETAIL_INCLUDE,
  })
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const result = await prisma.billingRecurringInvoice.deleteMany({
    where: { id, tenantId },
  })
  return result.count > 0
}

export async function findDue(
  prisma: PrismaClient,
  today: Date
) {
  // Find all active templates across all tenants where nextDueDate <= today and autoGenerate=true
  return prisma.billingRecurringInvoice.findMany({
    where: {
      isActive: true,
      autoGenerate: true,
      nextDueDate: { lte: today },
    },
    include: DETAIL_INCLUDE,
  })
}

export async function findDueForTenant(
  prisma: PrismaClient,
  tenantId: string,
  today: Date
) {
  return prisma.billingRecurringInvoice.findMany({
    where: {
      tenantId,
      isActive: true,
      nextDueDate: { lte: today },
    },
    include: DETAIL_INCLUDE,
  })
}
```

### 3.2 Service

**Create:** `src/lib/services/billing-recurring-invoice-service.ts`

```ts
import type { PrismaClient, BillingRecurringInterval } from "@/generated/prisma/client"
import * as repo from "./billing-recurring-invoice-repository"
import * as billingDocService from "./billing-document-service"
import * as billingDocRepo from "./billing-document-repository"
import * as numberSeqService from "./number-sequence-service"

// --- Error Classes ---

export class BillingRecurringInvoiceNotFoundError extends Error {
  constructor(message = "Recurring invoice not found") {
    super(message); this.name = "BillingRecurringInvoiceNotFoundError"
  }
}

export class BillingRecurringInvoiceValidationError extends Error {
  constructor(message: string) {
    super(message); this.name = "BillingRecurringInvoiceValidationError"
  }
}

// --- Pure Helper: calculateNextDueDate (exported for unit testing) ---

export function calculateNextDueDate(
  current: Date,
  interval: BillingRecurringInterval
): Date {
  const next = new Date(current)
  switch (interval) {
    case "MONTHLY":
      next.setMonth(next.getMonth() + 1)
      break
    case "QUARTERLY":
      next.setMonth(next.getMonth() + 3)
      break
    case "SEMI_ANNUALLY":
      next.setMonth(next.getMonth() + 6)
      break
    case "ANNUALLY":
      next.setFullYear(next.getFullYear() + 1)
      break
  }
  return next
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
    isActive?: boolean
    addressId?: string
    search?: string
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
  const rec = await repo.findById(prisma, tenantId, id)
  if (!rec) throw new BillingRecurringInvoiceNotFoundError()
  return rec
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    name: string
    addressId: string
    contactId?: string
    interval: BillingRecurringInterval
    startDate: Date
    endDate?: Date
    autoGenerate?: boolean
    deliveryType?: string
    deliveryTerms?: string
    paymentTermDays?: number
    discountPercent?: number
    discountDays?: number
    notes?: string
    internalNotes?: string
    positionTemplate: Array<{
      type: string
      articleId?: string
      articleNumber?: string
      description?: string
      quantity?: number
      unit?: string
      unitPrice?: number
      flatCosts?: number
      vatRate?: number
    }>
  },
  createdById: string
) {
  // Validate address belongs to tenant
  const address = await prisma.crmAddress.findFirst({
    where: { id: input.addressId, tenantId },
  })
  if (!address) {
    throw new BillingRecurringInvoiceValidationError("Address not found in this tenant")
  }

  // Validate contact belongs to address (if provided)
  if (input.contactId) {
    const contact = await prisma.crmContact.findFirst({
      where: { id: input.contactId, addressId: input.addressId, tenantId },
    })
    if (!contact) {
      throw new BillingRecurringInvoiceValidationError("Contact not found for this address")
    }
  }

  // Validate positionTemplate is non-empty
  if (!input.positionTemplate || input.positionTemplate.length === 0) {
    throw new BillingRecurringInvoiceValidationError("Position template must have at least one entry")
  }

  // Validate endDate > startDate if provided
  if (input.endDate && input.endDate <= input.startDate) {
    throw new BillingRecurringInvoiceValidationError("End date must be after start date")
  }

  return repo.create(prisma, {
    tenantId,
    name: input.name,
    addressId: input.addressId,
    contactId: input.contactId || null,
    interval: input.interval,
    startDate: input.startDate,
    endDate: input.endDate || null,
    nextDueDate: input.startDate, // First due date = start date
    autoGenerate: input.autoGenerate ?? false,
    deliveryType: input.deliveryType || null,
    deliveryTerms: input.deliveryTerms || null,
    paymentTermDays: input.paymentTermDays ?? null,
    discountPercent: input.discountPercent ?? null,
    discountDays: input.discountDays ?? null,
    notes: input.notes || null,
    internalNotes: input.internalNotes || null,
    positionTemplate: input.positionTemplate as unknown as Record<string, unknown>,
    createdById,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    name?: string
    contactId?: string | null
    interval?: BillingRecurringInterval
    startDate?: Date
    endDate?: Date | null
    autoGenerate?: boolean
    deliveryType?: string | null
    deliveryTerms?: string | null
    paymentTermDays?: number | null
    discountPercent?: number | null
    discountDays?: number | null
    notes?: string | null
    internalNotes?: string | null
    positionTemplate?: Array<Record<string, unknown>>
  }
) {
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) throw new BillingRecurringInvoiceNotFoundError()

  const data: Record<string, unknown> = {}
  const fields = [
    "name", "contactId", "interval", "startDate", "endDate",
    "autoGenerate", "deliveryType", "deliveryTerms",
    "paymentTermDays", "discountPercent", "discountDays",
    "notes", "internalNotes", "positionTemplate",
  ] as const

  for (const field of fields) {
    if ((input as Record<string, unknown>)[field] !== undefined) {
      data[field] = (input as Record<string, unknown>)[field]
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
  if (!existing) throw new BillingRecurringInvoiceNotFoundError()

  const deleted = await repo.remove(prisma, tenantId, id)
  if (!deleted) throw new BillingRecurringInvoiceNotFoundError()
}

export async function activate(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new BillingRecurringInvoiceNotFoundError()
  return repo.update(prisma, tenantId, id, { isActive: true })
}

export async function deactivate(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new BillingRecurringInvoiceNotFoundError()
  return repo.update(prisma, tenantId, id, { isActive: false })
}

// --- Invoice Generation ---

export async function generate(
  prisma: PrismaClient,
  tenantId: string,
  recurringId: string,
  generatedById: string
) {
  // Transaction: load template, create invoice, create positions, update template
  return prisma.$transaction(async (tx: PrismaClient) => {
    const template = await repo.findById(tx, tenantId, recurringId)
    if (!template) throw new BillingRecurringInvoiceNotFoundError()

    if (!template.isActive) {
      throw new BillingRecurringInvoiceValidationError("Template is inactive")
    }

    // Check if endDate is reached
    if (template.endDate && template.nextDueDate > template.endDate) {
      // Deactivate and return null
      await repo.update(tx, tenantId, recurringId, { isActive: false })
      throw new BillingRecurringInvoiceValidationError(
        "Template end date has been reached. Template has been deactivated."
      )
    }

    // 1. Generate invoice number
    const number = await numberSeqService.getNextNumber(tx, tenantId, "invoice")

    // 2. Create BillingDocument of type INVOICE
    const invoiceDoc = await billingDocRepo.create(tx, {
      tenantId,
      number,
      type: "INVOICE",
      addressId: template.addressId,
      contactId: template.contactId,
      documentDate: template.nextDueDate,
      deliveryType: template.deliveryType,
      deliveryTerms: template.deliveryTerms,
      paymentTermDays: template.paymentTermDays,
      discountPercent: template.discountPercent,
      discountDays: template.discountDays,
      notes: template.notes,
      internalNotes: template.internalNotes,
      createdById: generatedById,
    })

    // 3. Create positions from positionTemplate
    const positions = template.positionTemplate as Array<{
      type?: string
      articleId?: string
      articleNumber?: string
      description?: string
      quantity?: number
      unit?: string
      unitPrice?: number
      flatCosts?: number
      vatRate?: number
    }>

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i]
      const totalPrice = calculatePositionTotal(pos.quantity, pos.unitPrice, pos.flatCosts)
      await billingDocRepo.createPosition(tx, {
        documentId: invoiceDoc.id,
        sortOrder: i + 1,
        type: (pos.type as "ARTICLE" | "FREE" | "TEXT") ?? "FREE",
        articleId: pos.articleId || null,
        articleNumber: pos.articleNumber || null,
        description: pos.description || null,
        quantity: pos.quantity ?? null,
        unit: pos.unit || null,
        unitPrice: pos.unitPrice ?? null,
        flatCosts: pos.flatCosts ?? null,
        totalPrice,
        vatRate: pos.vatRate ?? null,
      })
    }

    // 4. Recalculate totals
    await billingDocService.recalculateTotals(tx, tenantId, invoiceDoc.id)

    // 5. Advance nextDueDate
    const nextDue = calculateNextDueDate(template.nextDueDate, template.interval)

    // 6. Update template
    const updateData: Record<string, unknown> = {
      lastGeneratedAt: new Date(),
      nextDueDate: nextDue,
    }

    // If next due date exceeds endDate, deactivate
    if (template.endDate && nextDue > template.endDate) {
      updateData.isActive = false
    }

    await repo.update(tx, tenantId, recurringId, updateData)

    // 7. Return the created invoice
    return billingDocRepo.findById(tx, tenantId, invoiceDoc.id)
  })
}

// --- Batch Generation (for cron) ---

export async function generateDue(
  prisma: PrismaClient,
  today: Date = new Date()
): Promise<{
  generated: number
  failed: number
  results: Array<{ tenantId: string; recurringId: string; invoiceId?: string; error?: string }>
}> {
  const dueTemplates = await repo.findDue(prisma, today)

  const results: Array<{ tenantId: string; recurringId: string; invoiceId?: string; error?: string }> = []
  let generated = 0
  let failed = 0

  for (const template of dueTemplates) {
    try {
      const invoice = await generate(
        prisma,
        template.tenantId,
        template.id,
        template.createdById || "system"
      )
      generated++
      results.push({
        tenantId: template.tenantId,
        recurringId: template.id,
        invoiceId: invoice?.id,
      })
    } catch (err) {
      failed++
      results.push({
        tenantId: template.tenantId,
        recurringId: template.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { generated, failed, results }
}

// --- Preview ---

export async function preview(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const template = await repo.findById(prisma, tenantId, id)
  if (!template) throw new BillingRecurringInvoiceNotFoundError()

  // Build a preview of what the next invoice would look like
  const positions = template.positionTemplate as Array<{
    type?: string
    articleId?: string
    articleNumber?: string
    description?: string
    quantity?: number
    unit?: string
    unitPrice?: number
    flatCosts?: number
    vatRate?: number
  }>

  let subtotalNet = 0
  const vatMap = new Map<number, number>()
  const previewPositions = positions.map((pos, i) => {
    const totalPrice = calculatePositionTotal(pos.quantity, pos.unitPrice, pos.flatCosts)
    if (totalPrice != null) {
      subtotalNet += totalPrice
      if (pos.vatRate && pos.vatRate > 0) {
        const vatAmount = totalPrice * (pos.vatRate / 100)
        vatMap.set(pos.vatRate, (vatMap.get(pos.vatRate) ?? 0) + vatAmount)
      }
    }
    return { ...pos, sortOrder: i + 1, totalPrice }
  })

  let totalVat = 0
  for (const amount of vatMap.values()) totalVat += amount
  const totalGross = subtotalNet + totalVat

  return {
    template,
    nextInvoiceDate: template.nextDueDate,
    positions: previewPositions,
    subtotalNet: Math.round(subtotalNet * 100) / 100,
    totalVat: Math.round(totalVat * 100) / 100,
    totalGross: Math.round(totalGross * 100) / 100,
  }
}
```

**Key decisions:**
- `generate()` uses `prisma.$transaction()` to ensure atomicity
- Uses `billingDocRepo.create()` and `billingDocRepo.createPosition()` directly (not `billingDocService.create()`) to avoid double-validation of address and to pass the exact `documentDate` from the template's `nextDueDate`
- Uses `numberSeqService.getNextNumber()` with key `"invoice"` so generated invoices get standard `RE-` numbers
- Uses `billingDocService.recalculateTotals()` to compute document totals
- `generateDue()` finds all auto-generate templates across all tenants (for cron)
- Includes a `preview()` function for UI preview

### 3.3 Verification

```bash
pnpm typecheck
```

---

## Phase 4: tRPC Router

### 4.1 Recurring Invoices Router

**Create:** `src/trpc/routers/billing/recurringInvoices.ts`

Follow the exact pattern from `priceLists.ts`:

```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as recurringService from "@/lib/services/billing-recurring-invoice-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const REC_VIEW = permissionIdByKey("billing_recurring.view")!
const REC_MANAGE = permissionIdByKey("billing_recurring.manage")!
const REC_GENERATE = permissionIdByKey("billing_recurring.generate")!

// --- Base procedure with module guard ---
const billingProcedure = tenantProcedure.use(requireModule("billing"))

// --- Input Schemas ---
// Relaxed UUID regex (same as priceLists.ts)
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const uuid = z.string().regex(UUID_RE, "Invalid UUID")

const listInput = z.object({
  isActive: z.boolean().optional(),
  addressId: uuid.optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

const positionTemplateSchema = z.array(z.object({
  type: z.enum(["ARTICLE", "FREE", "TEXT"]),
  articleId: uuid.optional(),
  articleNumber: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  unitPrice: z.number().optional(),
  flatCosts: z.number().optional(),
  vatRate: z.number().optional(),
}))

const createInput = z.object({
  name: z.string().min(1),
  addressId: uuid,
  contactId: uuid.optional(),
  interval: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUALLY", "ANNUALLY"]),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  autoGenerate: z.boolean().optional(),
  deliveryType: z.string().optional(),
  deliveryTerms: z.string().optional(),
  paymentTermDays: z.number().int().optional(),
  discountPercent: z.number().optional(),
  discountDays: z.number().int().optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
  positionTemplate: positionTemplateSchema,
})

const updateInput = z.object({
  id: uuid,
  name: z.string().min(1).optional(),
  contactId: uuid.nullable().optional(),
  interval: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUALLY", "ANNUALLY"]).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().nullable().optional(),
  autoGenerate: z.boolean().optional(),
  deliveryType: z.string().nullable().optional(),
  deliveryTerms: z.string().nullable().optional(),
  paymentTermDays: z.number().int().nullable().optional(),
  discountPercent: z.number().nullable().optional(),
  discountDays: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
  positionTemplate: positionTemplateSchema.optional(),
})

const idInput = z.object({ id: uuid })

// --- Router ---
export const billingRecurringInvoicesRouter = createTRPCRouter({
  list: billingProcedure
    .use(requirePermission(REC_VIEW))
    .input(listInput)
    .query(async ({ ctx, input }) => {
      try {
        return await recurringService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: billingProcedure
    .use(requirePermission(REC_VIEW))
    .input(idInput)
    .query(async ({ ctx, input }) => {
      try {
        return await recurringService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: billingProcedure
    .use(requirePermission(REC_MANAGE))
    .input(createInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await recurringService.create(
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
    .use(requirePermission(REC_MANAGE))
    .input(updateInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await recurringService.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  delete: billingProcedure
    .use(requirePermission(REC_MANAGE))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        await recurringService.remove(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  activate: billingProcedure
    .use(requirePermission(REC_MANAGE))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await recurringService.activate(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  deactivate: billingProcedure
    .use(requirePermission(REC_MANAGE))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await recurringService.deactivate(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  generate: billingProcedure
    .use(requirePermission(REC_GENERATE))
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await recurringService.generate(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          ctx.user!.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  generateDue: billingProcedure
    .use(requirePermission(REC_GENERATE))
    .mutation(async ({ ctx }) => {
      try {
        return await recurringService.generateDue(
          ctx.prisma as unknown as PrismaClient
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  preview: billingProcedure
    .use(requirePermission(REC_VIEW))
    .input(idInput)
    .query(async ({ ctx, input }) => {
      try {
        return await recurringService.preview(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
```

### 4.2 Register in Billing Router Index

**Modify:** `src/trpc/routers/billing/index.ts`

Add import and registration:

```ts
import { billingRecurringInvoicesRouter } from "./recurringInvoices"

export const billingRouter = createTRPCRouter({
  documents: billingDocumentsRouter,
  serviceCases: billingServiceCasesRouter,
  payments: billingPaymentsRouter,
  priceLists: billingPriceListsRouter,
  recurringInvoices: billingRecurringInvoicesRouter,
})
```

Update the file's JSDoc comment to include `recurringInvoices` in the list.

No changes needed to `_app.ts` since the billing router already exports from `./billing`.

### 4.3 Verification

```bash
pnpm typecheck
```

---

## Phase 5: Cron Job

### 5.1 Cron Route

**Create:** `src/app/api/cron/recurring-invoices/route.ts`

Follow the pattern from `calculate-days/route.ts`:

```ts
/**
 * Vercel Cron Route: /api/cron/recurring-invoices
 *
 * Runs daily at 04:00 UTC (configured in vercel.json).
 * Generates invoices for all active recurring templates where
 * autoGenerate=true and nextDueDate <= today.
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import * as recurringService from "@/lib/services/billing-recurring-invoice-service"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 minutes

export async function GET(request: Request) {
  // 1. Validate CRON_SECRET
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  console.log("[recurring-invoices] Starting cron job")

  try {
    const result = await recurringService.generateDue(prisma)

    console.log(
      `[recurring-invoices] Complete: generated=${result.generated}, failed=${result.failed}`
    )

    return NextResponse.json({
      ok: true,
      generated: result.generated,
      failed: result.failed,
      results: result.results,
    })
  } catch (err) {
    console.error("[recurring-invoices] Fatal error:", err)
    return NextResponse.json(
      { error: "Internal server error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
```

### 5.2 Vercel Cron Configuration

**Modify:** `vercel.json`

Add a 5th cron entry:

```json
{
  "crons": [
    { "path": "/api/cron/calculate-days", "schedule": "0 2 * * *" },
    { "path": "/api/cron/calculate-months", "schedule": "0 3 2 * *" },
    { "path": "/api/cron/generate-day-plans", "schedule": "0 1 * * 0" },
    { "path": "/api/cron/execute-macros", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/recurring-invoices", "schedule": "0 4 * * *" }
  ]
}
```

Schedule: Daily at 04:00 UTC (after calculate-days at 02:00).

### 5.3 Verification

```bash
pnpm typecheck
```

---

## Phase 6: React Hooks

### 6.1 Hook File

**Create:** `src/hooks/use-billing-recurring.ts`

Follow the exact pattern from `use-billing-price-lists.ts`:

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Billing Recurring Invoice Hooks ====================

interface UseBillingRecurringInvoicesOptions {
  enabled?: boolean
  isActive?: boolean
  addressId?: string
  search?: string
  page?: number
  pageSize?: number
}

export function useBillingRecurringInvoices(options: UseBillingRecurringInvoicesOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.recurringInvoices.list.queryOptions(
      { isActive: input.isActive, addressId: input.addressId, search: input.search, page: input.page ?? 1, pageSize: input.pageSize ?? 25 },
      { enabled }
    )
  )
}

export function useBillingRecurringInvoice(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.recurringInvoices.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useBillingRecurringInvoicePreview(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.recurringInvoices.preview.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useCreateBillingRecurringInvoice() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.recurringInvoices.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.recurringInvoices.list.queryKey() })
    },
  })
}

export function useUpdateBillingRecurringInvoice() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.recurringInvoices.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.recurringInvoices.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.recurringInvoices.getById.queryKey() })
    },
  })
}

export function useDeleteBillingRecurringInvoice() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.recurringInvoices.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.recurringInvoices.list.queryKey() })
    },
  })
}

export function useActivateBillingRecurringInvoice() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.recurringInvoices.activate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.recurringInvoices.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.recurringInvoices.getById.queryKey() })
    },
  })
}

export function useDeactivateBillingRecurringInvoice() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.recurringInvoices.deactivate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.recurringInvoices.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.recurringInvoices.getById.queryKey() })
    },
  })
}

export function useGenerateRecurringInvoice() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.recurringInvoices.generate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.recurringInvoices.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.recurringInvoices.getById.queryKey() })
      // Also invalidate billing documents list since a new invoice was created
      queryClient.invalidateQueries({ queryKey: trpc.billing.documents.list.queryKey() })
    },
  })
}

export function useGenerateDueRecurringInvoices() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.recurringInvoices.generateDue.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.billing.recurringInvoices.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.billing.documents.list.queryKey() })
    },
  })
}
```

### 6.2 Barrel Export

**Modify:** `src/hooks/index.ts`

Add at the end (after the `use-billing-price-lists` export block, line 782):

```ts

// Billing Recurring Invoices
export {
  useBillingRecurringInvoices,
  useBillingRecurringInvoice,
  useBillingRecurringInvoicePreview,
  useCreateBillingRecurringInvoice,
  useUpdateBillingRecurringInvoice,
  useDeleteBillingRecurringInvoice,
  useActivateBillingRecurringInvoice,
  useDeactivateBillingRecurringInvoice,
  useGenerateRecurringInvoice,
  useGenerateDueRecurringInvoices,
} from './use-billing-recurring'
```

### 6.3 Verification

```bash
pnpm typecheck
```

---

## Phase 7: UI Components

### 7.1 Page Routes

**Create:** `src/app/[locale]/(dashboard)/orders/recurring/page.tsx`

```tsx
import { RecurringList } from "@/components/billing/recurring-list"
export default function BillingRecurringPage() {
  return <RecurringList />
}
```

**Create:** `src/app/[locale]/(dashboard)/orders/recurring/[id]/page.tsx`

```tsx
'use client'
import { useParams } from 'next/navigation'
import { RecurringDetail } from "@/components/billing/recurring-detail"
export default function BillingRecurringDetailPage() {
  const params = useParams<{ id: string }>()
  return (
    <div className="container mx-auto py-6">
      <RecurringDetail id={params.id} />
    </div>
  )
}
```

**Create:** `src/app/[locale]/(dashboard)/orders/recurring/new/page.tsx`

```tsx
import { RecurringForm } from "@/components/billing/recurring-form"
export default function BillingRecurringCreatePage() {
  return (
    <div className="container mx-auto py-6">
      <RecurringForm />
    </div>
  )
}
```

### 7.2 List Component

**Create:** `src/components/billing/recurring-list.tsx`

Structure (follow `price-list-list.tsx` pattern):
- Header: "Wiederkehrende Rechnungen" title + "Neue Vorlage" button (links to `/orders/recurring/new`) + "Alle faelligen generieren" button
- Filters: Search input, active filter dropdown
- Table columns: Name, Kunde (address.company), Intervall, Naechste Faelligkeit, Letzte Generierung, Aktiv badge
- Row click navigates to `/orders/recurring/[id]`
- Pagination

Key imports:
```tsx
import { useBillingRecurringInvoices, useGenerateDueRecurringInvoices } from '@/hooks'
```

Interval display mapping:
```ts
const INTERVAL_LABELS: Record<string, string> = {
  MONTHLY: "Monatlich",
  QUARTERLY: "Quartal",
  SEMI_ANNUALLY: "Halbjaehrlich",
  ANNUALLY: "Jaehrlich",
}
```

The "Alle faelligen generieren" button calls `useGenerateDueRecurringInvoices()` and shows a toast with results.

### 7.3 Form Component

**Create:** `src/components/billing/recurring-form.tsx`

Full-page form (like `document-form.tsx`, NOT a sheet -- recurring invoice templates are complex enough to warrant a full page):
- Card layout with sections
- Fields: Name, Customer (address autocomplete using existing CRM address hooks), Contact (optional), Interval (select), Start Date, End Date (optional), Auto-Generate checkbox
- Terms section: Delivery Type, Delivery Terms, Payment Term Days, Discount Percent, Discount Days
- Notes section: Notes, Internal Notes
- Position template section: Uses `<RecurringPositionEditor />`
- Save button calls `useCreateBillingRecurringInvoice()` or `useUpdateBillingRecurringInvoice()`
- On success, redirect to detail page

Props: `editId?: string` -- if provided, loads existing template for editing.

### 7.4 Detail Component

**Create:** `src/components/billing/recurring-detail.tsx`

Follow `document-detail.tsx` pattern:
- Header with back button, name, status badge (Active/Inactive)
- Action buttons: "Rechnung generieren" (generate), "Bearbeiten" (links to form with editId), "Aktivieren"/"Deaktivieren" toggle, "Loeschen"
- Info section with DetailRow components: Kunde, Kontakt, Intervall, Startdatum, Enddatum, Naechste Faelligkeit, Letzte Generierung, Auto-Generierung
- Tabs:
  - "Positionen" tab: Read-only preview of position template (table with Description, Menge, Einheit, Einzelpreis, MwSt, Gesamt)
  - "Vorschau" tab: Shows preview of next invoice using `useBillingRecurringInvoicePreview()`, including calculated totals
- Generate dialog confirmation before manual generation

Key imports:
```tsx
import {
  useBillingRecurringInvoice,
  useBillingRecurringInvoicePreview,
  useGenerateRecurringInvoice,
  useActivateBillingRecurringInvoice,
  useDeactivateBillingRecurringInvoice,
  useDeleteBillingRecurringInvoice,
} from '@/hooks'
```

### 7.5 Position Editor Component

**Create:** `src/components/billing/recurring-position-editor.tsx`

JSON-based position template editor:
- Table layout similar to `document-position-table.tsx` but simpler (no server persistence, just local state)
- Columns: Type (select: ARTICLE/FREE/TEXT), Description, Quantity, Unit, Unit Price, Flat Costs, VAT Rate (%), Total (calculated)
- Add/remove position buttons
- Position type select
- Each row is editable inline
- Total is auto-calculated: `quantity * unitPrice + flatCosts`
- State managed via parent form's state (controlled component)

Props:
```ts
interface RecurringPositionEditorProps {
  positions: PositionTemplate[]
  onChange: (positions: PositionTemplate[]) => void
}

interface PositionTemplate {
  type: "ARTICLE" | "FREE" | "TEXT"
  articleId?: string
  articleNumber?: string
  description?: string
  quantity?: number
  unit?: string
  unitPrice?: number
  flatCosts?: number
  vatRate?: number
}
```

### 7.6 Generate Dialog

**Create:** `src/components/billing/recurring-generate-dialog.tsx`

Confirmation dialog (using `ConfirmDialog` pattern from existing code or a custom AlertDialog):
- Shows template name and customer
- Shows next due date
- Shows position summary with totals
- "Generieren" button triggers `useGenerateRecurringInvoice()`
- On success, show toast and optionally navigate to the generated invoice

### 7.7 Navigation

**Modify:** `src/components/layout/sidebar/sidebar-nav-config.ts`

Add after the `billingPriceLists` item in the billing section (around line 340):

```ts
    {
      titleKey: 'billingRecurringInvoices',
      href: '/orders/recurring',
      icon: Repeat,
      module: 'billing',
      permissions: ['billing_recurring.view'],
    },
```

Note: `Repeat` icon is already imported at the top of the file (line 38).

### 7.8 Translation Keys

**Modify:** `messages/de.json`

In the nav section (after `"billingPriceLists": "Preislisten"`):
```json
"billingRecurringInvoices": "Wiederkehrende Rechnungen"
```

**Modify:** `messages/en.json`

In the nav section (after `"billingPriceLists": "Price Lists"`):
```json
"billingRecurringInvoices": "Recurring Invoices"
```

### 7.9 Verification

```bash
pnpm typecheck
pnpm lint
```

---

## Phase 8: Tests

### 8.1 Service Unit Tests

**Create:** `src/lib/services/__tests__/billing-recurring-invoice-service.test.ts`

Follow the pattern from `billing-price-list-service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import * as service from "../billing-recurring-invoice-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Constants ---
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const REC_ID = "d0000000-0000-4000-a000-000000000010"
const ADDRESS_ID = "b0000000-0000-4000-b000-000000000001"
const CONTACT_ID = "b0000000-0000-4000-b000-000000000002"
const DOC_ID = "e0000000-0000-4000-a000-000000000010"

const mockTemplate = {
  id: REC_ID,
  tenantId: TENANT_ID,
  name: "Wartungsvertrag Firma A",
  addressId: ADDRESS_ID,
  contactId: null,
  interval: "MONTHLY",
  startDate: new Date("2026-01-01"),
  endDate: null,
  nextDueDate: new Date("2026-03-01"),
  lastGeneratedAt: new Date("2026-02-01"),
  autoGenerate: true,
  isActive: true,
  deliveryType: null,
  deliveryTerms: null,
  paymentTermDays: 30,
  discountPercent: null,
  discountDays: null,
  notes: null,
  internalNotes: null,
  positionTemplate: [
    { type: "FREE", description: "Monatliche Wartung", quantity: 1, unit: "Stk", unitPrice: 500, vatRate: 19 },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: USER_ID,
  address: { id: ADDRESS_ID, company: "Firma A" },
  contact: null,
}

function createMockPrisma(overrides = {}) {
  return {
    billingRecurringInvoice: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(mockTemplate),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      ...overrides.billingRecurringInvoice,
    },
    crmAddress: {
      findFirst: vi.fn().mockResolvedValue({ id: ADDRESS_ID, tenantId: TENANT_ID }),
      ...overrides.crmAddress,
    },
    crmContact: {
      findFirst: vi.fn().mockResolvedValue(null),
      ...overrides.crmContact,
    },
    billingDocument: {
      create: vi.fn().mockResolvedValue({ id: DOC_ID }),
      findFirst: vi.fn().mockResolvedValue({ id: DOC_ID }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      ...overrides.billingDocument,
    },
    billingDocumentPosition: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      ...overrides.billingDocumentPosition,
    },
    numberSequence: {
      upsert: vi.fn().mockResolvedValue({ prefix: "RE-", nextValue: 2 }),
      ...overrides.numberSequence,
    },
    $transaction: vi.fn().mockImplementation(async (fn) => fn(createMockPrisma(overrides))),
  } as unknown as PrismaClient
}
```

**Test cases to implement:**

```ts
describe("billing-recurring-invoice-service", () => {
  describe("calculateNextDueDate", () => {
    it("advances MONTHLY by 1 month", () => {
      const result = service.calculateNextDueDate(new Date("2026-01-15"), "MONTHLY")
      expect(result.getMonth()).toBe(1) // February
      expect(result.getDate()).toBe(15)
    })

    it("advances QUARTERLY by 3 months", () => {
      const result = service.calculateNextDueDate(new Date("2026-01-01"), "QUARTERLY")
      expect(result.getMonth()).toBe(3) // April
    })

    it("advances SEMI_ANNUALLY by 6 months", () => {
      const result = service.calculateNextDueDate(new Date("2026-01-01"), "SEMI_ANNUALLY")
      expect(result.getMonth()).toBe(6) // July
    })

    it("advances ANNUALLY by 1 year", () => {
      const result = service.calculateNextDueDate(new Date("2026-01-01"), "ANNUALLY")
      expect(result.getFullYear()).toBe(2027)
    })
  })

  describe("list", () => {
    it("delegates to repository findMany", async () => { /* ... */ })
  })

  describe("getById", () => {
    it("returns template when found", async () => { /* ... */ })
    it("throws NotFoundError when not found", async () => { /* ... */ })
  })

  describe("create", () => {
    it("creates template with valid input", async () => { /* ... */ })
    it("throws validation error when address not in tenant", async () => { /* ... */ })
    it("throws validation error when positionTemplate is empty", async () => { /* ... */ })
    it("sets nextDueDate = startDate", async () => { /* ... */ })
  })

  describe("generate", () => {
    it("creates INVOICE document from template", async () => { /* ... */ })
    it("creates positions from positionTemplate", async () => { /* ... */ })
    it("advances nextDueDate correctly", async () => { /* ... */ })
    it("throws when template is inactive", async () => { /* ... */ })
    it("deactivates template when endDate reached", async () => { /* ... */ })
  })

  describe("generateDue", () => {
    it("processes all due templates with autoGenerate=true", async () => { /* ... */ })
    it("returns count of generated and failed", async () => { /* ... */ })
  })

  describe("activate / deactivate", () => {
    it("activate sets isActive=true", async () => { /* ... */ })
    it("deactivate sets isActive=false", async () => { /* ... */ })
    it("throws NotFoundError for non-existent id", async () => { /* ... */ })
  })
})
```

### 8.2 Router Tests

**Create:** `src/trpc/routers/__tests__/billingRecurring-router.test.ts`

Follow the exact pattern from `billingPriceLists-router.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { billingRecurringInvoicesRouter } from "../billing/recurringInvoices"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// Mock the db module for requireModule middleware
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "billing" }),
    },
  },
}))

const REC_VIEW = permissionIdByKey("billing_recurring.view")!
const REC_MANAGE = permissionIdByKey("billing_recurring.manage")!
const REC_GENERATE = permissionIdByKey("billing_recurring.generate")!
const ALL_PERMS = [REC_VIEW, REC_MANAGE, REC_GENERATE]

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const REC_ID = "d0000000-0000-4000-a000-000000000010"

const createCaller = createCallerFactory(billingRecurringInvoicesRouter)

const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "billing" }),
  },
}

function withModuleMock(prisma) {
  return { ...MODULE_MOCK, ...prisma }
}

function createTestContext(prisma, permissions = ALL_PERMS) {
  return createMockContext({
    prisma: withModuleMock(prisma),
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

function createNoPermContext(prisma) {
  return createTestContext(prisma, [])
}
```

**Test cases:**

```ts
describe("billing.recurringInvoices.list", () => {
  it("returns paginated list", async () => { /* ... */ })
  it("requires billing_recurring.view permission", async () => { /* ... */ })
  it("requires billing module enabled", async () => { /* ... */ })
})

describe("billing.recurringInvoices.create", () => {
  it("creates recurring template", async () => { /* ... */ })
  it("requires billing_recurring.manage permission", async () => { /* ... */ })
})

describe("billing.recurringInvoices.generate", () => {
  it("generates invoice from template", async () => { /* ... */ })
  it("requires billing_recurring.generate permission", async () => { /* ... */ })
})

describe("billing.recurringInvoices.generateDue", () => {
  it("processes all due templates", async () => { /* ... */ })
})

describe("billing.recurringInvoices.activate/deactivate", () => {
  it("toggles isActive", async () => { /* ... */ })
})
```

### 8.3 Browser E2E Tests

**Create:** `src/e2e-browser/34-billing-recurring.spec.ts`

Follow the exact pattern from `33-billing-price-lists.spec.ts`:

```ts
import { test, expect } from "@playwright/test"
import { navigateTo, waitForTableLoad } from "./helpers/nav"
import { fillInput, submitAndWaitForClose, waitForSheet, expectTableContains } from "./helpers/forms"

/**
 * UC-ORD-05: Wiederkehrende Rechnungen -- Praxisbeispiel 13.13.1
 * "Wiederkehrende Rechnung erstellen und Rechnung generieren"
 *
 * Follows TERP_HANDBUCH.md section 13.13.1 step-by-step.
 */

const COMPANY = "E2E Wiederkehrende GmbH"
const TEMPLATE_NAME = "Wartungsvertrag Monatlich"

test.describe.serial(
  "UC-ORD-05: Praxisbeispiel 13.13.1 -- Wiederkehrende Rechnung erstellen und generieren",
  () => {
    // -- Voraussetzung: Kundenadresse anlegen --
    test("Voraussetzung: Kundenadresse anlegen", async ({ page }) => {
      await navigateTo(page, "/crm/addresses")
      await page.getByRole("button", { name: "Neue Adresse" }).click()
      await waitForSheet(page)
      await fillInput(page, "company", COMPANY)
      await fillInput(page, "city", "Stuttgart")
      await submitAndWaitForClose(page)
      await waitForTableLoad(page)
      await expectTableContains(page, COMPANY)
    })

    // -- Schritt 1: Vorlage erstellen --
    test("Schritt 1: Wiederkehrende Rechnung anlegen", async ({ page }) => {
      await navigateTo(page, "/orders/recurring")
      await expect(
        page.getByRole("heading", { name: "Wiederkehrende Rechnungen" })
      ).toBeVisible({ timeout: 10000 })

      // Click "Neue Vorlage"
      await page.getByRole("link", { name: "Neue Vorlage" }).click()
      await page.waitForURL(/\/orders\/recurring\/new/, { timeout: 10000 })

      // Fill form fields
      await page.locator("#rec-name").fill(TEMPLATE_NAME)
      // Select customer (address autocomplete - use existing pattern)
      // ... fill address, interval, start date, positions
      // Submit
      // Verify redirect to detail or list
    })

    // -- Schritt 2: Rechnung manuell generieren --
    test("Schritt 2: Rechnung manuell generieren", async ({ page }) => {
      await navigateTo(page, "/orders/recurring")
      await waitForTableLoad(page)
      const row = page.locator("table tbody tr").filter({ hasText: TEMPLATE_NAME }).first()
      await row.click()
      await page.waitForURL(/\/orders\/recurring\/[0-9a-f-]+/, { timeout: 10000 })

      // Click "Rechnung generieren"
      await page.getByRole("button", { name: "Rechnung generieren" }).click()
      // Confirm in dialog
      // Verify toast / success message
      // Verify nextDueDate advanced
    })

    // -- Schritt 3: Vorlage deaktivieren --
    test("Schritt 3: Vorlage deaktivieren", async ({ page }) => {
      await navigateTo(page, "/orders/recurring")
      await waitForTableLoad(page)
      const row = page.locator("table tbody tr").filter({ hasText: TEMPLATE_NAME }).first()
      await row.click()
      await page.waitForURL(/\/orders\/recurring\/[0-9a-f-]+/, { timeout: 10000 })

      // Click deactivate
      await page.getByRole("button", { name: "Deaktivieren" }).click()
      // Verify status changes to Inactive
    })
  }
)
```

**Note:** The E2E test implementation will need to be adapted to the final UI. The key test actions are:
1. Create address prerequisite
2. Create recurring template with positions
3. Manually generate an invoice
4. Deactivate the template

### 8.4 Verification

```bash
pnpm vitest run src/lib/services/__tests__/billing-recurring-invoice-service.test.ts
pnpm vitest run src/trpc/routers/__tests__/billingRecurring-router.test.ts
# Browser tests require running dev server:
# pnpm playwright test src/e2e-browser/34-billing-recurring.spec.ts
```

---

## Phase 9: Handbook Documentation

### 9.1 Read Existing Handbook

Before writing, read `docs/TERP_HANDBUCH.md` around lines 5874-5876 to understand the exact insertion point (between end of section 13.12 and section 14 Glossar).

### 9.2 Table of Contents Update

**Modify:** `docs/TERP_HANDBUCH.md`

After line 58 (`- [13.12 Preislisten](#1312-preislisten)`), add:

```markdown
    - [13.13 Wiederkehrende Rechnungen](#1313-wiederkehrende-rechnungen)
```

### 9.3 New Section Content

Insert before `## 14. Glossar` (line 5876), after the `---` separator at line 5874:

```markdown
### 13.13 Wiederkehrende Rechnungen

**Was ist es?** Vorlagen fuer Rechnungen, die in regelmaessigen Abstaenden automatisch oder manuell erzeugt werden -- z. B. fuer Wartungsvertraege, Mietvertraege oder monatliche Dienstleistungspauschalen.

**Wozu dient es?** Statt jeden Monat (oder jedes Quartal, Halbjahr, Jahr) dieselbe Rechnung manuell anzulegen, definieren Sie einmal eine Vorlage mit Positionen und Intervall. Terp erzeugt daraus zur richtigen Zeit eine echte Rechnung (Beleg vom Typ *Rechnung*).

> Modul: **Billing** muss aktiviert sein

> Berechtigung: `billing_recurring.view` (Anzeigen), `billing_recurring.manage` (Verwalten), `billing_recurring.generate` (Rechnungen generieren)

[Pfad] Auftraege > Wiederkehrende Rechnungen

Sie sehen die Liste aller wiederkehrenden Rechnungsvorlagen des aktiven Mandanten.

| Spalte | Bedeutung |
|--------|-----------|
| **Name** | Bezeichnung der Vorlage (z. B. Vertragsreferenz) |
| **Kunde** | Zugeordnete Kundenadresse |
| **Intervall** | Monatlich, Quartal, Halbjaehrlich oder Jaehrlich |
| **Naechste Faelligkeit** | Datum, an dem die naechste Rechnung generiert wird |
| **Letzte Generierung** | Datum der letzten erzeugten Rechnung |
| **Aktiv** | Ob die Vorlage aktiv ist |

#### Vorlage erstellen

1. Klick auf **"Neue Vorlage"** (oben rechts) -- leitet weiter auf die Formularseite
2. Felder ausfuellen:
   - **Name**: Aussagekraeftiger Vorlagenname
   - **Kundenadresse**: Adresse auswaehlen (Autocomplete)
   - **Kontaktperson**: Optional
   - **Intervall**: Monatlich / Quartal / Halbjaehrlich / Jaehrlich
   - **Startdatum**: Datum der ersten Rechnung
   - **Enddatum**: Optionales Vertragsenddatum (leer = unbefristet)
   - **Automatisch generieren**: Wenn aktiviert, erzeugt der taegliche Cron-Job die Rechnungen automatisch
3. **Konditionen**: Zahlungsziel, Skonto, Lieferbedingungen -- werden in jede erzeugte Rechnung uebernommen
4. **Positionen**: Mindestens eine Position hinzufuegen (Beschreibung, Menge, Einzelpreis, MwSt-Satz)
5. Klick auf **"Speichern"**
6. Vorlage erscheint in der Liste

#### Rechnung manuell generieren

1. Vorlage in der Liste anklicken -- Detailseite oeffnet sich
2. Klick auf **"Rechnung generieren"**
3. Bestaetigungsdialog zeigt Vorschau (Kunde, Positionen, Summe)
4. Klick auf **"Generieren"**
5. Ergebnis:
   - Neue Rechnung (RE-Nummer) wird als Beleg vom Typ *Rechnung* angelegt
   - Positionen und Konditionen werden aus der Vorlage uebernommen
   - **Naechste Faelligkeit** rueckt um ein Intervall vor
   - **Letzte Generierung** wird aktualisiert

#### Automatische Generierung (Cron)

Wenn **"Automatisch generieren"** aktiviert ist, prueft ein taeglicher Hintergrundprozess (04:00 UTC), ob das Faelligkeitsdatum erreicht ist, und erzeugt die Rechnung automatisch.

#### Vorlage deaktivieren

1. Detailseite: Klick auf **"Deaktivieren"**
2. Vorlage wird nicht mehr fuer die automatische Generierung beruecksichtigt
3. Manuelle Generierung ist ebenfalls gesperrt
4. Ueber **"Aktivieren"** kann die Vorlage wieder eingeschaltet werden

#### Vertragsende

Wenn ein **Enddatum** gesetzt ist und die naechste Faelligkeit dieses Datum ueberschreitet, wird die Vorlage automatisch deaktiviert.

#### 13.13.1 Praxisbeispiel: Wiederkehrende Rechnung erstellen und Rechnung generieren

**Szenario:** Sie richten einen monatlichen Wartungsvertrag fuer einen Kunden ein, generieren die erste Rechnung manuell und pruefen das Ergebnis.

##### Schritt 1 -- Vorlage anlegen

1. [Pfad] Auftraege > Wiederkehrende Rechnungen
2. Klick auf **"Neue Vorlage"**
3. Formularseite oeffnet sich
4. **Name**: "Wartungsvertrag Monatlich"
5. **Kundenadresse**: "Mustermann GmbH" auswaehlen
6. **Intervall**: "Monatlich"
7. **Startdatum**: 01.04.2026
8. **Automatisch generieren**: Checkbox aktivieren
9. **Zahlungsziel**: 30 Tage
10. Position hinzufuegen:
    - **Typ**: Freitext
    - **Beschreibung**: "Monatliche Wartungspauschale"
    - **Menge**: 1
    - **Einheit**: "Stk"
    - **Einzelpreis**: 500,00
    - **MwSt**: 19%
11. Klick auf **"Speichern"**
12. Vorlage "Wartungsvertrag Monatlich" erscheint in der Liste mit naechster Faelligkeit 01.04.2026

##### Schritt 2 -- Rechnung manuell generieren

1. In der Liste: Klick auf **"Wartungsvertrag Monatlich"**
2. Detailseite oeffnet sich
3. Klick auf **"Rechnung generieren"**
4. Bestaetigungsdialog: Vorschau zeigt Mustermann GmbH, 1x Monatliche Wartungspauschale, Netto 500,00 EUR, MwSt 95,00 EUR, Brutto 595,00 EUR
5. Klick auf **"Generieren"**
6. Erfolgsmeldung: "Rechnung RE-1 wurde erstellt"
7. **Naechste Faelligkeit** ist jetzt 01.05.2026
8. **Letzte Generierung** zeigt das heutige Datum

##### Schritt 3 -- Erzeugte Rechnung pruefen

1. [Pfad] Auftraege > Belege
2. Rechnung **RE-1** (oder die aktuelle Nummer) ist sichtbar
3. Belegtyp: Rechnung, Kunde: Mustermann GmbH
4. Positionen-Tab zeigt: "Monatliche Wartungspauschale | 1 Stk | 500,00 EUR | 19% MwSt"
5. Summen: Netto 500,00 EUR, MwSt 95,00 EUR, Brutto 595,00 EUR

##### Ergebnis

Die wiederkehrende Rechnung ist vollstaendig eingerichtet:

- **Vorlage** "Wartungsvertrag Monatlich" ist aktiv mit automatischer Generierung
- **Erste Rechnung** RE-1 wurde manuell generiert und geprueft
- Ab Mai wird die naechste Rechnung automatisch durch den taeglichen Cron-Job erzeugt
- Bei Vertragsende setzen Sie ein Enddatum -- die Vorlage deaktiviert sich danach automatisch

**Tipp:** Sie koennen die Vorlage jederzeit bearbeiten, z. B. um den Preis anzupassen. Aenderungen gelten nur fuer zukuenftige Rechnungen -- bereits erzeugte Belege bleiben unveraendert.
```

### 9.4 Glossary Update

Add to the Glossar table (section 14, alphabetical order):

```markdown
| **Wiederkehrende Rechnung** | Vorlage fuer automatisch oder manuell erzeugte Rechnungen in regelmaessigen Intervallen (z. B. monatlich) | [Pfad] Auftraege > Wiederkehrende Rechnungen |
```

Insert alphabetically (after "Wochenplan" entry).

### 9.5 Appendix Update

Add to the Seitenubersicht table (after `/orders/price-lists/[id]` row, line 6027):

```markdown
| `/orders/recurring` | Auftraege -> Wiederkehrende Rechnungen | billing_recurring.view |
| `/orders/recurring/new` | Auftraege -> Wiederkehrende Rechnungen -> Neue Vorlage | billing_recurring.manage |
| `/orders/recurring/[id]` | Wiederkehrende Rechnungen -> Zeile anklicken | billing_recurring.view |
```

### 9.6 Verification

Read the handbook to confirm the section renders correctly and the TOC links resolve.

---

## Phase 10: Final Verification

Run all checks in sequence:

```bash
# 1. Type checking
pnpm typecheck

# 2. Linting
pnpm lint

# 3. Unit + router tests
pnpm test

# 4. Specific test files
pnpm vitest run src/lib/services/__tests__/billing-recurring-invoice-service.test.ts
pnpm vitest run src/trpc/routers/__tests__/billingRecurring-router.test.ts

# 5. Build
pnpm build
```

If any step fails, fix the issue and re-run from that step.

Browser E2E tests (requires running dev server):
```bash
pnpm dev &
pnpm playwright test src/e2e-browser/34-billing-recurring.spec.ts
```

---

## File Summary

### New Files (18)

| File | Phase |
|------|-------|
| `supabase/migrations/20260101000103_create_billing_recurring_invoices.sql` | 1 |
| `src/lib/services/billing-recurring-invoice-repository.ts` | 3 |
| `src/lib/services/billing-recurring-invoice-service.ts` | 3 |
| `src/trpc/routers/billing/recurringInvoices.ts` | 4 |
| `src/app/api/cron/recurring-invoices/route.ts` | 5 |
| `src/hooks/use-billing-recurring.ts` | 6 |
| `src/app/[locale]/(dashboard)/orders/recurring/page.tsx` | 7 |
| `src/app/[locale]/(dashboard)/orders/recurring/[id]/page.tsx` | 7 |
| `src/app/[locale]/(dashboard)/orders/recurring/new/page.tsx` | 7 |
| `src/components/billing/recurring-list.tsx` | 7 |
| `src/components/billing/recurring-form.tsx` | 7 |
| `src/components/billing/recurring-detail.tsx` | 7 |
| `src/components/billing/recurring-position-editor.tsx` | 7 |
| `src/components/billing/recurring-generate-dialog.tsx` | 7 |
| `src/lib/services/__tests__/billing-recurring-invoice-service.test.ts` | 8 |
| `src/trpc/routers/__tests__/billingRecurring-router.test.ts` | 8 |
| `src/e2e-browser/34-billing-recurring.spec.ts` | 8 |

### Modified Files (9)

| File | Phase | Change |
|------|-------|--------|
| `prisma/schema.prisma` | 1 | Add enum, model, relations on Tenant/CrmAddress/CrmContact |
| `src/lib/auth/permission-catalog.ts` | 2 | Add 3 permissions, update count comment |
| `src/trpc/routers/billing/index.ts` | 4 | Add recurringInvoices sub-router |
| `vercel.json` | 5 | Add cron entry |
| `src/hooks/index.ts` | 6 | Add barrel exports |
| `src/components/layout/sidebar/sidebar-nav-config.ts` | 7 | Add nav item |
| `messages/de.json` | 7 | Add translation key |
| `messages/en.json` | 7 | Add translation key |
| `docs/TERP_HANDBUCH.md` | 9 | Add section 13.13, TOC, glossary, appendix |

---

## Dependencies Between Phases

```
Phase 1 (Schema)
  |
  v
Phase 2 (Permissions) ----+
  |                        |
  v                        v
Phase 3 (Service/Repo)    Phase 7.7-7.8 (Nav/i18n)
  |
  v
Phase 4 (Router)
  |
  +---> Phase 5 (Cron)
  |
  v
Phase 6 (Hooks)
  |
  v
Phase 7 (UI Components)
  |
  v
Phase 8 (Tests)
  |
  v
Phase 9 (Handbook)
  |
  v
Phase 10 (Verification)
```

Phases 7.7-7.8 (sidebar nav, translations) can be done in parallel with Phases 3-6.
Phase 9 (Handbook) can be done at any point after Phase 7 is complete.
