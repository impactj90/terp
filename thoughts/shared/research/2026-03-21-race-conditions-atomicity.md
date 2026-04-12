# Research: Race Conditions and Atomicity Issues
Date: 2026-03-21

## Summary

Seven issues across four service files involve race conditions (TOCTOU patterns where a read-then-check-then-write sequence can be interleaved by concurrent requests) and atomicity gaps (multi-step operations that can leave the system in an inconsistent state if one step fails mid-way). Three of the seven issues have already been partially or fully addressed (RC-001 already has `updateIfStatus` in the repository, and is used by approve/reject/cancel). The remaining issues need $transaction wrappers or checkpoint patterns.

| ID     | File                                  | Issue Type         | Status          |
|--------|---------------------------------------|--------------------|-----------------|
| RC-001 | absences-repository.ts:301-317        | TOCTOU (fixed)     | Already fixed   |
| RC-002 | billing-document-service.ts:423-511   | Missing $transaction | Needs fix       |
| RC-003 | billing-document-service.ts:627-669   | Missing $transaction | Needs fix       |
| RC-004 | billing-document-service.ts:765-831   | Sort order race    | Needs fix       |
| RC-006 | billing-recurring-invoice-service.ts:429-468 | Missing cron checkpoint | Needs fix |
| RC-007 | billing-payment-service.ts:409-465    | Missing $transaction | Needs fix       |
| AO-004 | billing-payment-service.ts:333-376    | Missing $transaction | Needs fix       |

---

## Issue Analysis

### RC-001: Absences Repository TOCTOU
- **File**: `src/lib/services/absences-repository.ts`
- **Lines**: 301-317
- **Current code**:
```typescript
export async function updateIfStatus(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  expectedStatus: string,
  data: Record<string, unknown>
) {
  const { count } = await prisma.absenceDay.updateMany({
    where: { id, tenantId, status: expectedStatus },
    data,
  })
  if (count === 0) return null
  return prisma.absenceDay.findFirst({
    where: { id, tenantId },
    include: absenceDayListInclude,
  })
}
```
- **Assessment**: This issue is **already fixed**. The repository already implements the atomic `updateMany` pattern with a `status` guard in the `where` clause. The service layer (`absences-service.ts`) calls `updateIfStatus` at lines 645, 745, and 826 for approve, reject, and cancel operations respectively. The original TOCTOU (findFirst + update) was replaced by this `updateMany({ where: { id, tenantId, status } })` + count > 0 check pattern.
- **No action needed.**

---

### RC-002: Billing Document Finalize - Missing $transaction
- **File**: `src/lib/services/billing-document-service.ts`
- **Lines**: 423-511 (the `finalize` function)
- **Current code**:
```typescript
export async function finalize(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  finalizedById: string,
  orderParams?: { orderName: string; orderDescription?: string },
  audit?: AuditContext
) {
  // Step 1: Read document (line 434)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new BillingDocumentNotFoundError()

  // Step 2: Check status (line 437)
  if (existing.status !== "DRAFT") {
    throw new BillingDocumentValidationError("Only DRAFT documents can be finalized")
  }

  // Step 3: Optionally create Order (lines 452-461)
  let orderId: string | undefined
  if (existing.type === "ORDER_CONFIRMATION" && orderParams?.orderName) {
    const newOrder = await orderService.create(prisma, tenantId, { ... })
    orderId = newOrder.id
  }

  // Step 4: Update status to PRINTED (line 473)
  const result = await repo.update(prisma, tenantId, id, {
    status: "PRINTED",
    printedAt: new Date(),
    printedById: finalizedById,
    ...(orderId ? { orderId } : {}),
  })
  // ... PDF generation, E-Invoice, audit log
}
```
- **Problem**: Between Step 1 (reading status) and Step 4 (writing new status), another request could concurrently finalize the same document. This would result in:
  1. **Double finalization**: Two concurrent requests both see `status === "DRAFT"`, both proceed, potentially creating two Orders (for ORDER_CONFIRMATION type), and both succeed in setting `PRINTED`.
  2. **Orphaned Order**: If the second request wins the update race, the first request's Order becomes orphaned (never linked to the document).
  3. **Duplicate sequence numbers**: Not an issue here since the number is already assigned at creation time.
- **Fix approach**: Wrap Steps 1-4 in a `prisma.$transaction()`. Inside the transaction, use the read to check status, create Order if needed, and atomically update the document. Alternative: use `updateMany({ where: { id, tenantId, status: "DRAFT" } })` as an atomic status guard (like the absences pattern), but the Order creation makes a transaction more appropriate.
- **Note**: PDF generation and E-Invoice generation (lines 476-493) should remain OUTSIDE the transaction since they are best-effort side effects and may be slow.

---

### RC-003: Billing Document Cancel - Read-then-Write Race
- **File**: `src/lib/services/billing-document-service.ts`
- **Lines**: 627-669 (the `cancel` function)
- **Current code**:
```typescript
export async function cancel(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  reason?: string,
  audit?: AuditContext
) {
  // Step 1: Read document (line 634)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new BillingDocumentNotFoundError()

  // Step 2: Check status (lines 637-645)
  if (existing.status === "CANCELLED") {
    throw new BillingDocumentConflictError("Document is already cancelled")
  }
  if (existing.status === "FORWARDED") {
    throw new BillingDocumentValidationError("Cannot cancel a fully forwarded document")
  }

  // Step 3: Update to CANCELLED (line 650)
  const data: Record<string, unknown> = { status: "CANCELLED" }
  if (reason) data.internalNotes = reason
  const updated = await repo.update(prisma, tenantId, id, data)
}
```
- **Problem**: Between reading status (Step 1) and writing the new status (Step 3), concurrent requests could:
  1. **Double cancel**: Two requests both read `status !== "CANCELLED"`, both proceed to set `CANCELLED`. Functionally harmless but the second overwrites `internalNotes` (reason).
  2. **Cancel after forward**: Request A reads `status = "PRINTED"`, concurrently Request B forwards the document (status -> "FORWARDED"), then Request A proceeds to cancel what is now a forwarded document, violating the business rule.
- **Fix approach**: Use the atomic `updateMany` pattern with status guard:
  ```typescript
  const { count } = await prisma.billingDocument.updateMany({
    where: { id, tenantId, status: { notIn: ["CANCELLED", "FORWARDED"] } },
    data: { status: "CANCELLED", ...(reason ? { internalNotes: reason } : {}) },
  })
  if (count === 0) { /* re-read to distinguish not-found vs wrong-status */ }
  ```
  This avoids needing a full transaction since there is only one write operation. Alternatively, wrap in `$transaction` if we want to preserve the read-for-error-message pattern.

---

### RC-004: Billing Document addPosition - Sort Order Race
- **File**: `src/lib/services/billing-document-service.ts`
- **Lines**: 765-831 (the `addPosition` function)
- **Current code**:
```typescript
export async function addPosition(prisma, tenantId, input, audit) {
  // Step 1: Verify document exists and is DRAFT (line 786-788)
  const doc = await repo.findById(prisma, tenantId, input.documentId)
  if (!doc) throw new BillingDocumentNotFoundError()
  assertDraft(doc.status)

  // Step 2: Get next sort order (line 791)
  const maxSort = await repo.getMaxSortOrder(prisma, tenantId, input.documentId)

  // Step 3: Create position with sortOrder = maxSort + 1 (lines 796-812)
  const position = await repo.createPosition(prisma, {
    documentId: input.documentId,
    sortOrder: maxSort + 1,
    ...
  })

  // Step 4: Recalculate totals (line 815)
  await recalculateTotals(prisma, tenantId, input.documentId)
}
```
- **Problem**: `getMaxSortOrder` (repository line 270-281) uses `findFirst` with `orderBy: { sortOrder: "desc" }`. If two concurrent `addPosition` requests execute Step 2 at the same time, both get the same `maxSort` value and both create positions with the same `sortOrder`. This results in:
  1. **Duplicate sort order**: Two positions with the same `sortOrder`, making display order non-deterministic.
  2. **Not a data loss issue**, but violates the expected sequential ordering contract.
- **Fix approach**: Wrap Steps 1-4 in a `$transaction`. Inside the transaction, compute `MAX(sortOrder) + 1` atomically. The Prisma `aggregate` API or a raw query can be used:
  ```typescript
  await prisma.$transaction(async (tx) => {
    const doc = await repo.findById(tx, tenantId, input.documentId)
    assertDraft(doc.status)
    const maxSort = await repo.getMaxSortOrder(tx, tenantId, input.documentId)
    await repo.createPosition(tx, { sortOrder: maxSort + 1, ... })
    await recalculateTotals(tx, tenantId, input.documentId)
  })
  ```
  The interactive transaction's serializable-read semantics prevent two concurrent transactions from reading the same max.

---

### RC-006: Recurring Invoice generateDue - Missing Cron Checkpoint
- **File**: `src/lib/services/billing-recurring-invoice-service.ts`
- **Lines**: 429-468 (the `generateDue` function)
- **Current code**:
```typescript
export async function generateDue(
  prisma: PrismaClient,
  today: Date = new Date()
) {
  // Step 1: Find all due templates (no checkpoint check!)
  const dueTemplates = await repo.findDue(prisma, today)

  const results = []
  let generated = 0, failed = 0

  // Step 2: Process each template sequentially
  for (const template of dueTemplates) {
    try {
      const invoice = await generate(prisma, template.tenantId, template.id, ...)
      generated++
      results.push({ tenantId: template.tenantId, recurringId: template.id, invoiceId: invoice?.id })
    } catch (err) {
      failed++
      results.push({ ... error ... })
    }
  }

  return { generated, failed, results }
}
```
- **Cron route** (`src/app/api/cron/recurring-invoices/route.ts`): Simply calls `generateDue(prisma)` with no checkpoint logic.
- **Problem**: If the Vercel Cron job times out at the 5-minute limit (e.g., 50 tenants with many recurring invoices), the next re-trigger will call `generateDue` again and re-process ALL templates, including those that were already successfully processed. The `generate()` function does advance `nextDueDate` inside a transaction, so templates that completed won't match `findDue` again. However:
  1. **Templates mid-flight at timeout**: If the cron times out between `generate()` calls, templates that haven't been processed yet will be retried -- this is correct. But there's no logging or visibility into which templates were already done.
  2. **No deduplication if cron fires twice**: Vercel Cron can occasionally double-fire. Two concurrent `generateDue` calls would both fetch the same due templates and both attempt `generate()` for each. The `generate` function's transaction prevents duplicate invoices (it checks `isActive` and `nextDueDate`), but the double-fire wastes resources and could create confusing error logs.
- **Fix approach**: Add the same `cronCheckpoint` pattern used in `calculate-days/route.ts`:
  1. In the cron route, compute a `runKey` (e.g., today's date string).
  2. Before processing each template, check if a checkpoint exists for `(cronName="recurring_invoices", runKey, tenantId=template.tenantId)`.
  3. After successful generation, upsert a checkpoint record.
  4. Clean up old checkpoints (> 30 days).
  This matches the existing pattern at `src/app/api/cron/calculate-days/route.ts` lines 116-133 and 229-252.

---

### RC-007: Billing Payment cancelPayment - Missing $transaction
- **File**: `src/lib/services/billing-payment-service.ts`
- **Lines**: 409-465 (the `cancelPayment` function)
- **Current code**:
```typescript
export async function cancelPayment(prisma, tenantId, id, cancelledById, reason?, audit?) {
  // Step 1: Find payment (line 418)
  const payment = await repo.findPaymentById(prisma, tenantId, id)
  if (!payment) throw new BillingPaymentNotFoundError()

  // Step 2: Validate not already cancelled (line 424)
  if (payment.status === "CANCELLED") {
    throw new BillingPaymentValidationError("Payment is already cancelled")
  }

  // Step 3: Cancel the main payment (line 436)
  const result = await repo.cancelPayment(prisma, tenantId, id, cancelledById, notes)

  // Step 4: Find and cancel associated Skonto entries (lines 441-453)
  if (!payment.isDiscount) {
    const relatedSkonto = await prisma.billingPayment.findMany({
      where: { tenantId, documentId: payment.document.id, isDiscount: true, status: "ACTIVE", date: payment.date },
    })
    for (const skonto of relatedSkonto) {
      await repo.cancelPayment(prisma, tenantId, skonto.id, cancelledById, `Storniert mit Zahlung`)
    }
  }
}
```
- **Problem**: Steps 3 and 4 are not atomic. If the server crashes or the request times out after cancelling the main payment (Step 3) but before cancelling the Skonto entries (Step 4):
  1. **Inconsistent state**: The main payment is cancelled, but the associated Skonto discount entries remain `ACTIVE`. The open amount calculation will be wrong (it will show less owed than actual, since the discount entries still count as "paid").
  2. **Double cancel race**: Two concurrent cancel requests both pass the status check in Step 2, and both proceed. The `repo.cancelPayment` uses `updateMany` so both will succeed (idempotent), but the Skonto cancellation in Step 4 could be interleaved oddly.
- **Fix approach**: Wrap Steps 1-4 in a `prisma.$transaction()`. All cancellations (main payment + Skonto entries) happen atomically. Pattern matches `bookings-repository.ts:170` (`deleteWithDerived`).

---

### AO-004: Billing Payment createPayment (discount) - Missing $transaction
- **File**: `src/lib/services/billing-payment-service.ts`
- **Lines**: 333-376 (the discount branch inside `createPayment`)
- **Current code**:
```typescript
// Inside createPayment(), when input.isDiscount === true:

// Step 1: Calculate discount amount (lines 339-340)
const discountAmount = Math.round(openAmount * (discount.percent / 100) * 100) / 100
const paymentAmount = Math.round((openAmount - discountAmount) * 100) / 100

// Step 2: Create the actual payment record (lines 343-352)
const payment = await repo.createPayment(prisma, {
  tenantId, documentId: input.documentId, date: input.date,
  amount: paymentAmount, type: input.type, isDiscount: false,
  notes: input.notes ?? null, createdById,
})

// Step 3: Create the discount (Skonto) entry (lines 355-364)
await repo.createPayment(prisma, {
  tenantId, documentId: input.documentId, date: input.date,
  amount: discountAmount, type: input.type, isDiscount: true,
  notes: `Skonto ${discount.tier} (${discount.percent}%)`, createdById,
})
```
- **Problem**: Steps 2 and 3 create two logically linked records (payment + Skonto entry) without a transaction. If the server crashes after creating the payment (Step 2) but before creating the Skonto entry (Step 3):
  1. **Missing discount**: The payment exists at the reduced amount, but the corresponding Skonto entry is missing. The open amount will be wrong (remaining balance will be too high by the discount amount).
  2. **Concurrent payment race**: Additionally, the entire `createPayment` function reads `openAmount` from existing payments at the top (lines 324-330), then creates new records. Two concurrent discount payments could both read the same `openAmount` and both create payment + Skonto records, resulting in overpayment.
- **Fix approach**: Wrap the entire discount payment creation (Steps 2-3) in a `prisma.$transaction()`. For the concurrent race on openAmount, the transaction should also include the document read with payments to get a consistent snapshot.

---

## Existing Patterns

### Prisma $transaction Examples

**1. Interactive transaction: billing-document-service.ts `forward()`** (lines 521-607)
```typescript
const { newDoc, number } = await prisma.$transaction(async (tx) => {
  const txPrisma = tx as unknown as PrismaClient
  const existing = await repo.findById(txPrisma, tenantId, id)
  // ... validation, create child document, copy positions, update source status
  return { newDoc, number }
})
```
Pattern: Cast `tx as unknown as PrismaClient`, pass to repository functions, perform reads + writes atomically.

**2. Interactive transaction: bookings-repository.ts `deleteWithDerived()`** (lines 170-183)
```typescript
await prisma.$transaction(async (tx) => {
  await tx.booking.deleteMany({ where: { originalBookingId: id, tenantId } })
  const { count } = await tx.booking.deleteMany({ where: { id, tenantId } })
  if (count === 0) throw new Error("Booking not found")
})
```
Pattern: Multiple related deletes in a single atomic transaction.

**3. Batch transaction: daily-calc.ts `$transaction(updates)`** (line 1174)
```typescript
await this.prisma.$transaction(updates)  // Array of Prisma update operations
```
Pattern: Array of independent update operations executed atomically.

**4. Batch transaction: cron-execution-logger.ts `completeExecution()`** (lines 131-161)
```typescript
await this.prisma.$transaction([
  this.prisma.scheduleTaskExecution.update({ where: { id: taskExecutionId }, data: { ... } }),
  this.prisma.scheduleExecution.update({ where: { id: executionId }, data: { ... } }),
  this.prisma.schedule.update({ where: { id: scheduleId }, data: { lastRunAt: now } }),
])
```
Pattern: Multiple related updates as a batch transaction array.

### cronCheckpoint Pattern

**Location**: `src/app/api/cron/calculate-days/route.ts` (lines 116-252)

The pattern has four parts:

1. **Load completed checkpoints** before processing (lines 117-121):
```typescript
const runKey = `${fromStr}:${toStr}`
const completedCheckpoints = await prisma.cronCheckpoint.findMany({
  where: { cronName: TASK_TYPE, runKey },
  select: { tenantId: true },
})
const completedTenantIds = new Set(completedCheckpoints.map((c) => c.tenantId))
```

2. **Skip already-completed tenants** (lines 158-169):
```typescript
if (completedTenantIds.has(tenant.id)) {
  console.log(`[calculate-days] Tenant ${tenant.id}: checkpoint hit, skipping`)
  results.push({ tenantId: tenant.id, processedDays: 0, failedDays: 0, durationMs: 0, skipped: true })
  tenantsProcessed++
  continue
}
```

3. **Save checkpoint after success** (lines 229-252):
```typescript
await prisma.cronCheckpoint.upsert({
  where: { cronName_runKey_tenantId: { cronName: TASK_TYPE, runKey, tenantId: tenant.id } },
  create: { cronName: TASK_TYPE, runKey, tenantId: tenant.id, status: "completed", durationMs },
  update: { status: "completed", durationMs },
})
```

4. **Cleanup old checkpoints** (lines 130-133):
```typescript
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
await prisma.cronCheckpoint.deleteMany({
  where: { cronName: TASK_TYPE, createdAt: { lt: thirtyDaysAgo } },
})
```

**Database model**: `CronCheckpoint` in `prisma/schema.prisma` (line 4018) with unique constraint `@@unique([cronName, runKey, tenantId])`.

### updateMany Atomic Patterns

**Location**: `src/lib/services/absences-repository.ts` (lines 301-317)

The `updateIfStatus` function demonstrates the canonical pattern for atomic status transitions:
```typescript
const { count } = await prisma.absenceDay.updateMany({
  where: { id, tenantId, status: expectedStatus },
  data,
})
if (count === 0) return null
```
This eliminates TOCTOU by combining the status check and the update into a single atomic SQL `UPDATE ... WHERE id = ? AND status = ?` statement.

**Also used in**: `billing-document-repository.ts` `update()` (line 131) uses `updateMany` for tenant scoping but does NOT include a status guard -- it only scopes by `{ id, tenantId }`.

---

## Dependencies and Risks

### Dependencies
- **RC-002** (finalize): Depends on `order-service.ts` `create()`. If Order creation fails inside a transaction, the transaction rolls back correctly -- no orphaned Order.
- **RC-006** (cronCheckpoint): Depends on the existing `CronCheckpoint` model and `cronName_runKey_tenantId` unique constraint. No schema changes needed.
- **RC-007** and **AO-004**: The `billing-payment-repository.ts` `cancelPayment()` already uses `updateMany` internally, which is safe to call inside a `$transaction`.

### Risks
1. **Transaction timeout**: Prisma interactive transactions have a default timeout of 5 seconds. The `finalize` function (RC-002) should NOT include PDF generation inside the transaction (it is already outside, which is correct).
2. **Lock contention**: Wrapping more operations in transactions increases the window where rows are locked. For billing documents, this is acceptable since concurrent modifications to the same document are rare in practice.
3. **Error handling**: When using `updateMany` with status guards (RC-003), the function needs to distinguish between "not found" and "wrong status" for proper error messages. This requires a follow-up read if `count === 0`.
4. **RC-001 is already fixed**: The ticket description mentions `absences-repository.ts:308` as needing a fix, but the code already implements the atomic `updateIfStatus` pattern. The service layer uses it correctly.
5. **RC-006 scope**: The `generateDue` function processes templates across ALL tenants, not per-tenant like `calculate-days`. The checkpoint pattern needs to checkpoint per-template (not per-tenant) since multiple templates can exist per tenant. The `runKey` could be the date string, and the `tenantId` field could be repurposed as `templateId` -- or alternatively, checkpoint at the tenant level if we accept that all-or-nothing per tenant is acceptable.
