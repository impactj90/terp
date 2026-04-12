# Implementation Plan: Race Conditions and Atomicity Fixes

Date: 2026-03-21
Research: `thoughts/shared/research/2026-03-21-race-conditions-atomicity.md`

---

## Overview

Six fixes across four files. RC-001 is already fixed (no action). The remaining six issues need `$transaction` wrappers, atomic `updateMany` guards, or cron checkpoint patterns.

| ID     | File                                    | Fix Type                        | Risk  |
|--------|-----------------------------------------|---------------------------------|-------|
| RC-001 | absences-repository.ts                  | Already fixed                   | None  |
| RC-002 | billing-document-service.ts             | Wrap finalize in $transaction   | Low   |
| RC-003 | billing-document-service.ts             | Atomic updateMany status guard  | Low   |
| RC-004 | billing-document-service.ts             | Wrap addPosition in $transaction| Low   |
| RC-006 | billing-recurring-invoice-service.ts    | Add cron checkpoint pattern     | Low   |
| RC-007 | billing-payment-service.ts              | Wrap cancelPayment in $transaction | Low |
| AO-004 | billing-payment-service.ts              | Wrap discount createPayment in $transaction | Low |

---

## Phase 1: billing-document-service.ts (RC-002, RC-003, RC-004)

File: `src/lib/services/billing-document-service.ts`

### RC-002: Wrap `finalize()` in $transaction (lines 423-511)

**Problem**: Read-then-check-then-write between lines 434 and 473. Two concurrent requests can both see `status === "DRAFT"` and both finalize, potentially creating duplicate Orders for ORDER_CONFIRMATION documents.

**Current code** (lines 423-511):
```typescript
export async function finalize(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  finalizedById: string,
  orderParams?: { orderName: string; orderDescription?: string },
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new BillingDocumentNotFoundError()

  if (existing.status !== "DRAFT") {
    throw new BillingDocumentValidationError("Only DRAFT documents can be finalized")
  }

  if (!existing.positions || existing.positions.length === 0) {
    throw new BillingDocumentValidationError("Document must have at least one position before finalizing")
  }

  let orderId: string | undefined
  if (existing.type === "ORDER_CONFIRMATION" && orderParams?.orderName) {
    const customerName = (existing as unknown as { address?: { company?: string } }).address?.company
    const newOrder = await orderService.create(prisma, tenantId, { ... })
    orderId = newOrder.id
  }

  const updateData: Record<string, unknown> = {
    status: "PRINTED",
    printedAt: new Date(),
    printedById: finalizedById,
  }
  if (orderId) { updateData.orderId = orderId }

  const result = await repo.update(prisma, tenantId, id, updateData)

  // PDF + E-Invoice generation (best-effort, OUTSIDE transaction)
  // ... audit log ...
  return result
}
```

**New code**:
```typescript
export async function finalize(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  finalizedById: string,
  orderParams?: { orderName: string; orderDescription?: string },
  audit?: AuditContext
) {
  // Wrap status check + Order creation + status update in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const txPrisma = tx as unknown as PrismaClient

    const existing = await repo.findById(txPrisma, tenantId, id)
    if (!existing) throw new BillingDocumentNotFoundError()

    if (existing.status !== "DRAFT") {
      throw new BillingDocumentValidationError(
        "Only DRAFT documents can be finalized"
      )
    }

    if (!existing.positions || existing.positions.length === 0) {
      throw new BillingDocumentValidationError(
        "Document must have at least one position before finalizing"
      )
    }

    // For ORDER_CONFIRMATION: create a linked Terp Order for time tracking
    let orderId: string | undefined
    if (existing.type === "ORDER_CONFIRMATION" && orderParams?.orderName) {
      const customerName = (existing as unknown as { address?: { company?: string } }).address?.company
      const newOrder = await orderService.create(txPrisma, tenantId, {
        code: existing.number,
        name: orderParams.orderName,
        description: orderParams.orderDescription,
        customer: customerName || undefined,
        status: "active",
      })
      orderId = newOrder.id
    }

    const updateData: Record<string, unknown> = {
      status: "PRINTED",
      printedAt: new Date(),
      printedById: finalizedById,
    }
    if (orderId) {
      updateData.orderId = orderId
    }

    return repo.update(txPrisma, tenantId, id, updateData)
  })

  // Generate PDF on finalization (best-effort, OUTSIDE transaction)
  try {
    await pdfService.generateAndStorePdf(prisma, tenantId, id)
  } catch {
    console.error(`PDF generation failed for document ${id}`)
  }

  // Generate E-Invoice XML on finalization (after PDF)
  // Need to re-read document type since `existing` was inside the transaction scope
  if (result) {
    const docType = (result as unknown as { type?: string }).type
    if (docType === "INVOICE" || docType === "CREDIT_NOTE") {
      const config = await billingTenantConfigRepo.findByTenantId(prisma, tenantId)
      if (config?.eInvoiceEnabled) {
        try {
          await eInvoiceService.generateAndStoreEInvoice(prisma, tenantId, id)
        } catch (err) {
          console.error(`E-Invoice generation failed for document ${id}`, err)
        }
      }
    }
  }

  // Never throws -- audit failures must not block the actual operation
  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "finalize",
      entityType: "billing_document",
      entityId: id,
      entityName: (result as unknown as { number?: string })?.number || "DRAFT",
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return result
}
```

**Key changes**:
1. Lines 434-473 wrapped in `prisma.$transaction(async (tx) => { ... })`
2. All reads/writes inside the transaction use `txPrisma` (cast from `tx`)
3. PDF generation, E-Invoice generation, and audit log remain OUTSIDE the transaction
4. The `existing.type` check for E-Invoice now uses `result.type` since `existing` is scoped to the transaction closure. The `result` returned by `repo.update` includes the full document with type.

**Verification**:
- `pnpm typecheck` passes
- Existing billing document tests pass: `pnpm vitest run src/trpc/routers/__tests__/BillingDocument`
- Manual: finalize an ORDER_CONFIRMATION in the UI -- verify Order is created and document status is PRINTED

---

### RC-003: Atomic status guard for `cancel()` (lines 627-669)

**Problem**: Between reading status (line 634) and writing CANCELLED (line 650), a concurrent forward could change the document to FORWARDED, allowing an illegal cancel-after-forward.

**Current code** (lines 627-669):
```typescript
export async function cancel(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  reason?: string,
  audit?: AuditContext
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

  const updated = await repo.update(prisma, tenantId, id, data)

  // audit log ...
  return updated
}
```

**New code**:
```typescript
export async function cancel(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  reason?: string,
  audit?: AuditContext
) {
  // Atomic status guard: only cancel if not already CANCELLED or FORWARDED
  const data: Record<string, unknown> = { status: "CANCELLED" }
  if (reason) data.internalNotes = reason

  const { count } = await prisma.billingDocument.updateMany({
    where: {
      id,
      tenantId,
      status: { notIn: ["CANCELLED", "FORWARDED"] },
    },
    data,
  })

  if (count === 0) {
    // Distinguish not-found from wrong-status
    const existing = await prisma.billingDocument.findFirst({
      where: { id, tenantId },
      select: { status: true },
    })
    if (!existing) throw new BillingDocumentNotFoundError()
    if (existing.status === "CANCELLED") {
      throw new BillingDocumentConflictError("Document is already cancelled")
    }
    if (existing.status === "FORWARDED") {
      throw new BillingDocumentValidationError(
        "Cannot cancel a fully forwarded document"
      )
    }
    // Defensive: unexpected status that also blocks cancel
    throw new BillingDocumentConflictError(
      `Document status changed concurrently (current: ${existing.status})`
    )
  }

  // Fetch updated document for return value and audit
  const updated = await prisma.billingDocument.findFirst({
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

  // Never throws -- audit failures must not block the actual operation
  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "cancel",
      entityType: "billing_document",
      entityId: id,
      entityName: (updated as unknown as { number?: string })?.number || "DRAFT",
      changes: null,
      metadata: reason ? { reason } : undefined,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}
```

**Key changes**:
1. Replace read-then-check-then-write with a single atomic `updateMany` using `status: { notIn: ["CANCELLED", "FORWARDED"] }` as the guard
2. If `count === 0`, do a follow-up read to distinguish "not found" from "wrong status" for proper error messages
3. Fetch the updated document after the atomic update for the return value

**Note on the include**: The `repo.update()` function (billing-document-repository.ts line 125) uses `updateMany` then `findFirst` with a specific include. Since we now call `updateMany` directly, we replicate the same include in the follow-up `findFirst`. Alternatively, we could call `repo.update()` but that would require a different approach since `repo.update` does not include a status guard. The cleanest approach is to inline the include here, or add a `findById` call on the repo which already has the correct include -- but `repo.findById` (line 54 of the repo) uses a different include set. For consistency with the existing `repo.update` return shape, we replicate its include.

**Simpler alternative**: Instead of inlining the include, we can keep the code simpler by still using `repo.findById` for the return value (which is what callers typically use):

```typescript
  // After the updateMany succeeds (count > 0):
  const updated = await repo.findById(prisma, tenantId, id)
```

This is the recommended approach since callers of `cancel()` use the standard document shape. The `repo.update` include is a superset but not needed specifically for cancel.

**Verification**:
- `pnpm typecheck` passes
- Existing tests pass
- Manual: cancel a DRAFT document, verify status changes to CANCELLED

---

### RC-004: Wrap `addPosition()` in $transaction (lines 765-831)

**Problem**: `getMaxSortOrder` (line 791) and `createPosition` (line 796) are not atomic. Two concurrent `addPosition` calls get the same `maxSort`, creating duplicate `sortOrder` values.

**Current code** (lines 765-831):
```typescript
export async function addPosition(prisma, tenantId, input, audit) {
  const doc = await repo.findById(prisma, tenantId, input.documentId)
  if (!doc) throw new BillingDocumentNotFoundError()
  assertDraft(doc.status)

  const maxSort = await repo.getMaxSortOrder(prisma, tenantId, input.documentId)
  const totalPrice = calculatePositionTotal(input.quantity, input.unitPrice, input.flatCosts)

  const position = await repo.createPosition(prisma, {
    documentId: input.documentId,
    sortOrder: maxSort + 1,
    // ... other fields
  })

  await recalculateTotals(prisma, tenantId, input.documentId)

  // audit log ...
  return position
}
```

**New code**:
```typescript
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
  },
  audit: AuditContext
) {
  // Calculate total price (pure computation, can stay outside transaction)
  const totalPrice = calculatePositionTotal(input.quantity, input.unitPrice, input.flatCosts)

  // Wrap read-sortOrder-create-recalculate in a transaction
  const { position, docNumber } = await prisma.$transaction(async (tx) => {
    const txPrisma = tx as unknown as PrismaClient

    // Verify document exists and is DRAFT
    const doc = await repo.findById(txPrisma, tenantId, input.documentId)
    if (!doc) throw new BillingDocumentNotFoundError()
    assertDraft(doc.status)

    // Get next sort order (atomic within this transaction)
    const maxSort = await repo.getMaxSortOrder(txPrisma, tenantId, input.documentId)

    const position = await repo.createPosition(txPrisma, {
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
    await recalculateTotals(txPrisma, tenantId, input.documentId)

    return {
      position,
      docNumber: (doc as unknown as { number?: string }).number || "DRAFT",
    }
  })

  // Never throws -- audit failures must not block the actual operation
  await auditLog.log(prisma, {
    tenantId,
    userId: audit.userId,
    action: "create",
    entityType: "billing_document_position",
    entityId: position.id,
    entityName: docNumber,
    changes: null,
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch(err => console.error('[AuditLog] Failed:', err))

  return position
}
```

**Key changes**:
1. Lines 786-815 wrapped in `prisma.$transaction(async (tx) => { ... })`
2. `getMaxSortOrder` + `createPosition` + `recalculateTotals` all use `txPrisma`
3. Audit log remains outside the transaction
4. `docNumber` is passed out of the transaction closure for the audit log

**Verification**:
- `pnpm typecheck` passes
- Existing tests pass
- Manual: add two positions rapidly to the same document -- verify sortOrder is sequential (1, 2, 3, ...) with no duplicates

---

## Phase 2: billing-payment-service.ts (RC-007, AO-004)

File: `src/lib/services/billing-payment-service.ts`

### AO-004: Wrap discount branch of `createPayment()` in $transaction (lines 332-376)

**Problem**: The discount payment creates two records (payment + Skonto entry) without a transaction. If the server crashes between lines 343 and 355, the payment exists without its Skonto counterpart, causing incorrect open amount calculations. Additionally, the `openAmount` read at line 330 is not atomic with the writes, allowing concurrent duplicate discount payments.

**Current code** (lines 279-407, focusing on the discount branch 332-376):
```typescript
export async function createPayment(prisma, tenantId, input, createdById, audit?) {
  // 1. Validate document exists (line 294)
  const document = await prisma.billingDocument.findFirst({ ... })

  // 2-3. Validate type and status

  // 4. Calculate open amount (lines 324-330)
  const creditNoteReduction = ...
  const effectiveTotalGross = document.totalGross - creditNoteReduction
  const paidAmount = document.payments.reduce(...)
  const openAmount = effectiveTotalGross - paidAmount

  // 5. Handle discount (lines 332-376)
  if (input.isDiscount) {
    const discount = getApplicableDiscount(document, input.date)
    if (!discount) throw ...

    const discountAmount = Math.round(openAmount * (discount.percent / 100) * 100) / 100
    const paymentAmount = Math.round((openAmount - discountAmount) * 100) / 100

    // Create payment (line 343)
    const payment = await repo.createPayment(prisma, { amount: paymentAmount, ... })

    // Create Skonto entry (line 355)
    await repo.createPayment(prisma, { amount: discountAmount, isDiscount: true, ... })

    // audit ...
    return payment
  }

  // 6. Non-discount path (lines 378-406)
  // ...
}
```

**New code** for the discount branch (replace lines 332-376):
```typescript
  // 5. Handle discount payments
  if (input.isDiscount) {
    const discount = getApplicableDiscount(document, input.date)
    if (!discount) {
      throw new BillingPaymentValidationError("Discount period expired")
    }

    // Wrap both payment + Skonto creation in a transaction,
    // re-reading document inside to prevent concurrent overpayment
    const payment = await prisma.$transaction(async (tx) => {
      const txPrisma = tx as unknown as PrismaClient

      // Re-read document inside transaction for consistent openAmount
      const txDoc = await txPrisma.billingDocument.findFirst({
        where: { id: input.documentId, tenantId },
        include: {
          payments: { where: { status: "ACTIVE" } },
          childDocuments: {
            where: { type: "CREDIT_NOTE", status: { not: "CANCELLED" } },
            select: { totalGross: true },
          },
        },
      })
      if (!txDoc) throw new BillingPaymentValidationError("Document not found")

      const txCreditReduction = (txDoc.childDocuments ?? []).reduce(
        (sum, cn) => sum + cn.totalGross, 0
      )
      const txEffective = txDoc.totalGross - txCreditReduction
      const txPaid = txDoc.payments.reduce((sum, p) => sum + p.amount, 0)
      const txOpen = txEffective - txPaid

      if (txOpen <= 0.01) {
        throw new BillingPaymentValidationError("Document is already fully paid")
      }

      const discountAmount = Math.round(txOpen * (discount.percent / 100) * 100) / 100
      const paymentAmount = Math.round((txOpen - discountAmount) * 100) / 100

      // Create the actual payment
      const payment = await repo.createPayment(txPrisma, {
        tenantId,
        documentId: input.documentId,
        date: input.date,
        amount: paymentAmount,
        type: input.type,
        isDiscount: false,
        notes: input.notes ?? null,
        createdById,
      })

      // Create the discount entry
      await repo.createPayment(txPrisma, {
        tenantId,
        documentId: input.documentId,
        date: input.date,
        amount: discountAmount,
        type: input.type,
        isDiscount: true,
        notes: `Skonto ${discount.tier} (${discount.percent}%)`,
        createdById,
      })

      return payment
    })

    if (audit) {
      // Never throws -- audit failures must not block the actual operation
      await auditLog.log(prisma, {
        tenantId, userId: audit.userId, action: "create", entityType: "billing_payment",
        entityId: payment.id, entityName: null, changes: null,
        ipAddress: audit.ipAddress, userAgent: audit.userAgent,
      }).catch(err => console.error('[AuditLog] Failed:', err))
    }

    return payment
  }
```

**Key changes**:
1. Both `repo.createPayment` calls wrapped in `prisma.$transaction`
2. Document is re-read inside the transaction for a consistent `openAmount` snapshot, preventing concurrent overpayment
3. Audit log remains outside the transaction
4. The `discount` computation (tier/percent lookup) stays outside since it only depends on document dates, not mutable state. The actual amount calculation uses the transaction-scoped `txOpen`.

**Note on the PrismaClient cast**: The `tx as unknown as PrismaClient` pattern is the established pattern in this codebase (used in `forward()`, `duplicate()`, `create()`, `generate()`). The `repo.createPayment` function accepts `PrismaClient` as its first arg.

**Verification**:
- `pnpm typecheck` passes
- Existing payment tests pass: `pnpm vitest run src/trpc/routers/__tests__/BillingPayment`
- Manual: create a discount payment -- verify both the payment record and Skonto entry are created

---

### RC-007: Wrap `cancelPayment()` in $transaction (lines 409-465)

**Problem**: Cancelling the main payment (line 436) and cancelling associated Skonto entries (lines 441-453) are not atomic. Crash between these steps leaves Skonto entries ACTIVE while the main payment is CANCELLED, corrupting the open amount.

**Current code** (lines 409-465):
```typescript
export async function cancelPayment(prisma, tenantId, id, cancelledById, reason?, audit?) {
  const payment = await repo.findPaymentById(prisma, tenantId, id)
  if (!payment) throw new BillingPaymentNotFoundError()

  if (payment.status === "CANCELLED") {
    throw new BillingPaymentValidationError("Payment is already cancelled")
  }

  const notes = reason ? ... : payment.notes

  const result = await repo.cancelPayment(prisma, tenantId, id, cancelledById, notes)

  if (!payment.isDiscount) {
    const relatedSkonto = await prisma.billingPayment.findMany({
      where: { tenantId, documentId: payment.document.id, isDiscount: true, status: "ACTIVE", date: payment.date },
    })
    for (const skonto of relatedSkonto) {
      await repo.cancelPayment(prisma, tenantId, skonto.id, cancelledById, `Storniert mit Zahlung`)
    }
  }

  // audit ...
  return result
}
```

**New code**:
```typescript
export async function cancelPayment(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  cancelledById: string,
  reason?: string,
  audit?: AuditContext
) {
  // Wrap all cancellations (main payment + Skonto) in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const txPrisma = tx as unknown as PrismaClient

    // 1. Find payment
    const payment = await repo.findPaymentById(txPrisma, tenantId, id)
    if (!payment) {
      throw new BillingPaymentNotFoundError()
    }

    // 2. Validate not already cancelled
    if (payment.status === "CANCELLED") {
      throw new BillingPaymentValidationError("Payment is already cancelled")
    }

    // 3. Build notes
    const notes = reason
      ? payment.notes
        ? `${payment.notes} | Storniert: ${reason}`
        : `Storniert: ${reason}`
      : payment.notes

    // 4. Cancel the payment
    const result = await repo.cancelPayment(txPrisma, tenantId, id, cancelledById, notes)

    // 5. If this is a non-discount payment, also cancel associated Skonto entries
    if (!payment.isDiscount) {
      const relatedSkonto = await txPrisma.billingPayment.findMany({
        where: {
          tenantId,
          documentId: payment.document.id,
          isDiscount: true,
          status: "ACTIVE",
          date: payment.date,
        },
      })
      for (const skonto of relatedSkonto) {
        await repo.cancelPayment(txPrisma, tenantId, skonto.id, cancelledById, `Storniert mit Zahlung`)
      }
    }

    return result
  })

  if (audit) {
    // Never throws -- audit failures must not block the actual operation
    await auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: "delete", entityType: "billing_payment",
      entityId: id, entityName: null, changes: null,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return result
}
```

**Key changes**:
1. Lines 417-453 wrapped in `prisma.$transaction(async (tx) => { ... })`
2. All reads and writes use `txPrisma`
3. Audit log remains outside the transaction
4. If the main cancel succeeds but a Skonto cancel fails, the entire transaction rolls back -- no partial state

**Verification**:
- `pnpm typecheck` passes
- Existing payment tests pass
- Manual: cancel a payment that has associated Skonto entries -- verify both the main payment and Skonto entries are cancelled atomically

---

## Phase 3: billing-recurring-invoice-service.ts + cron route (RC-006)

### RC-006: Add cron checkpoint to `generateDue()` and the cron route

**Problem**: If the cron job times out mid-processing or Vercel double-fires, there is no checkpoint mechanism to skip already-processed templates. While `generate()` is internally atomic (it advances `nextDueDate` inside a transaction), there is no visibility into progress, and double-fire wastes resources.

**Design decision**: The `generate()` function already prevents duplicate invoice creation because it reads `nextDueDate` inside a transaction and advances it atomically. So the checkpoint is primarily for:
1. Skipping already-done templates on timeout/retry (performance)
2. Preventing concurrent double-processing on double-fire
3. Providing visibility into cron progress

**Checkpoint scope**: Per-template (not per-tenant), since `findDue` returns individual templates across all tenants. Use `tenantId` field of `CronCheckpoint` to store the template ID (the model's unique constraint is `@@unique([cronName, runKey, tenantId])`, and the field is just a string identifier).

Actually, looking more carefully at the CronCheckpoint model and how `calculate-days` uses it: the `tenantId` field stores the actual tenant ID because the processing is per-tenant. For recurring invoices, processing is per-template, but multiple templates can exist per tenant. The correct approach is to adjust the `runKey` to include the template ID, keeping `tenantId` as the actual tenant ID.

**Files to modify**:
1. `src/lib/services/billing-recurring-invoice-service.ts` -- modify `generateDue()` to accept a checkpoint set and save checkpoints
2. `src/app/api/cron/recurring-invoices/route.ts` -- add checkpoint loading, passing, and cleanup

#### File 1: `src/app/api/cron/recurring-invoices/route.ts`

**Current code** (lines 1-49):
```typescript
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import * as recurringService from "@/lib/services/billing-recurring-invoice-service"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(request: Request) {
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

**New code**:
```typescript
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import * as recurringService from "@/lib/services/billing-recurring-invoice-service"

export const runtime = "nodejs"
export const maxDuration = 300

const CRON_NAME = "recurring_invoices"

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
    // 2. Build runKey from today's date
    const today = new Date()
    const runKey = today.toISOString().slice(0, 10)

    // 3. Load completed checkpoints for this run
    const completedCheckpoints = await prisma.cronCheckpoint.findMany({
      where: { cronName: CRON_NAME, runKey },
      select: { tenantId: true },
    })
    // tenantId stores "tenantId:templateId" composite key
    const completedKeys = new Set(completedCheckpoints.map((c) => c.tenantId))

    if (completedKeys.size > 0) {
      console.log(
        `[recurring-invoices] Checkpoint: ${completedKeys.size} templates already completed, will skip`
      )
    }

    // 4. Cleanup old checkpoints (> 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    await prisma.cronCheckpoint.deleteMany({
      where: { cronName: CRON_NAME, createdAt: { lt: thirtyDaysAgo } },
    })

    // 5. Run generation with checkpoint support
    const result = await recurringService.generateDue(prisma, today, {
      cronName: CRON_NAME,
      runKey,
      completedKeys,
    })

    console.log(
      `[recurring-invoices] Complete: generated=${result.generated}, failed=${result.failed}, skipped=${result.skipped}`
    )

    return NextResponse.json({
      ok: true,
      generated: result.generated,
      failed: result.failed,
      skipped: result.skipped,
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

#### File 2: `src/lib/services/billing-recurring-invoice-service.ts`

**Modify the `generateDue()` function** (lines 429-468).

**Current code**:
```typescript
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
      ) as { id: string } | null
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
```

**New code**:
```typescript
export async function generateDue(
  prisma: PrismaClient,
  today: Date = new Date(),
  checkpoint?: {
    cronName: string
    runKey: string
    completedKeys: Set<string>
  }
): Promise<{
  generated: number
  failed: number
  skipped: number
  results: Array<{ tenantId: string; recurringId: string; invoiceId?: string; error?: string; skipped?: boolean }>
}> {
  const dueTemplates = await repo.findDue(prisma, today)

  const results: Array<{ tenantId: string; recurringId: string; invoiceId?: string; error?: string; skipped?: boolean }> = []
  let generated = 0
  let failed = 0
  let skipped = 0

  for (const template of dueTemplates) {
    // Checkpoint: skip already-completed templates
    const checkpointKey = `${template.tenantId}:${template.id}`
    if (checkpoint?.completedKeys.has(checkpointKey)) {
      console.log(`[recurring-invoices] Template ${template.id}: checkpoint hit, skipping`)
      results.push({
        tenantId: template.tenantId,
        recurringId: template.id,
        skipped: true,
      })
      skipped++
      continue
    }

    try {
      const invoice = await generate(
        prisma,
        template.tenantId,
        template.id,
        template.createdById || "system"
      ) as { id: string } | null
      generated++
      results.push({
        tenantId: template.tenantId,
        recurringId: template.id,
        invoiceId: invoice?.id,
      })

      // Save checkpoint after successful generation
      if (checkpoint) {
        try {
          await prisma.cronCheckpoint.upsert({
            where: {
              cronName_runKey_tenantId: {
                cronName: checkpoint.cronName,
                runKey: checkpoint.runKey,
                tenantId: checkpointKey,
              },
            },
            create: {
              cronName: checkpoint.cronName,
              runKey: checkpoint.runKey,
              tenantId: checkpointKey,
              status: "completed",
            },
            update: { status: "completed" },
          })
        } catch (cpErr) {
          console.error(
            `[recurring-invoices] Failed to save checkpoint for template ${template.id}:`,
            cpErr,
          )
        }
      }
    } catch (err) {
      failed++
      results.push({
        tenantId: template.tenantId,
        recurringId: template.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { generated, failed, skipped, results }
}
```

**Key changes**:
1. `generateDue` accepts an optional `checkpoint` parameter with `cronName`, `runKey`, and `completedKeys`
2. Before processing each template, checks if `checkpointKey` (`tenantId:templateId`) is in the completed set
3. After successful generation, upserts a checkpoint record
4. Returns `skipped` count in addition to `generated` and `failed`
5. The function remains backward-compatible: when called without checkpoint (e.g., manual trigger), it behaves exactly as before

**Checkpoint key design**: We use `tenantId:templateId` as the `tenantId` field in `CronCheckpoint`. This is a pragmatic reuse of the existing model -- the `@@unique([cronName, runKey, tenantId])` constraint ensures uniqueness. The `calculate-days` route uses actual tenant IDs, but the field is just a `String` in the schema, so storing a composite key is safe.

**Verification**:
- `pnpm typecheck` passes
- Existing tests pass
- Manual: trigger the cron route twice -- second invocation should skip all templates
- Check `CronCheckpoint` table for `cronName = "recurring_invoices"` entries

---

## Phase 4: Verification (all fixes)

### Automated
```bash
pnpm typecheck
pnpm vitest run src/trpc/routers/__tests__/BillingDocument
pnpm vitest run src/trpc/routers/__tests__/BillingPayment
pnpm vitest run src/trpc/routers/__tests__/BillingRecurringInvoice
pnpm lint
```

### Manual smoke tests
1. **RC-002**: Create an ORDER_CONFIRMATION, add a position, finalize -- verify Order is created and status is PRINTED
2. **RC-003**: Cancel a PRINTED document -- verify status is CANCELLED; try to cancel again -- verify "already cancelled" error
3. **RC-004**: Rapidly add multiple positions to a document -- verify sortOrder is sequential
4. **RC-006**: Call `/api/cron/recurring-invoices` twice in quick succession -- second call should skip all completed templates
5. **RC-007**: Cancel a payment with Skonto -- verify both are cancelled
6. **AO-004**: Create a discount payment -- verify both payment and Skonto entry are created

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Transaction timeout (RC-002 finalize) | Low | Medium | PDF/E-Invoice generation kept outside transaction. Only read + Order create + status update inside (~1-2s max). Default Prisma timeout is 5s. |
| Lock contention on billing documents | Low | Low | Concurrent edits to the same billing document are rare in practice. Transactions are short-lived. |
| Breaking existing tests | Low | Medium | All changes preserve existing function signatures and return types. RC-003 slightly changes error flow but the same errors are thrown. |
| Checkpoint key collision (RC-006) | None | N/A | Composite key `tenantId:templateId` is globally unique since both are UUIDs. |
| RC-003 include mismatch | Low | Low | Using `repo.findById` for the return value, which matches what other callers expect. |
| Backward compatibility of `generateDue` | None | N/A | Checkpoint parameter is optional with default `undefined`. |

---

## Execution Order

1. **Phase 1** (billing-document-service.ts): RC-002, RC-003, RC-004 -- all in one file, no dependencies between them
2. **Phase 2** (billing-payment-service.ts): AO-004, RC-007 -- both in one file, independent of Phase 1
3. **Phase 3** (recurring-invoice-service.ts + cron route): RC-006 -- two files, independent of Phases 1-2
4. **Phase 4**: Run full verification suite

Phases 1-3 can be done in any order. Phase 4 must come last.
