# AUDIT-005 Implementation Plan: Race Conditions — Billing Payment & Service Case Atomicity

## Plan Date: 2026-03-22

## Overview

Two fixes in two service files. Both follow the same pattern already established in the codebase: wrap read-validate-write sequences in `prisma.$transaction()`, re-read data inside the transaction, and keep audit logging outside the transaction.

---

## Fix 1: Non-Discount `createPayment` — Wrap in `$transaction`

### File: `src/lib/services/billing-payment-service.ts`

### Reference Pattern

The discount path at lines 341-396 is the exact template. It:
1. Opens `prisma.$transaction(async (tx) => { ... })`
2. Casts: `const txPrisma = tx as unknown as PrismaClient`
3. Re-reads the document inside the transaction with `txPrisma.billingDocument.findFirst(...)`
4. Re-computes `openAmount` inside the transaction
5. Validates inside the transaction
6. Creates payment(s) inside the transaction using `repo.createPayment(txPrisma, ...)`
7. Returns the created payment from the transaction
8. Logs audit **outside** the transaction using the outer `prisma`

### Changes

**What to change**: Lines 410-427 (the overpayment guard + payment creation for non-discount path).

**Current code (lines 410-427)**:
```typescript
  // 6. Validate amount does not exceed open amount (with tolerance)
  if (input.amount > openAmount + 0.01) {
    throw new BillingPaymentValidationError(
      `Payment amount (${input.amount}) exceeds open amount (${Math.round(openAmount * 100) / 100})`
    )
  }

  // 7. Create payment record
  const created = await repo.createPayment(prisma, {
    tenantId,
    documentId: input.documentId,
    date: input.date,
    amount: input.amount,
    type: input.type,
    isDiscount: false,
    notes: input.notes ?? null,
    createdById,
  })
```

**Replace with**:
```typescript
  // 6. Wrap validation + creation in transaction to prevent concurrent overpayment
  const created = await prisma.$transaction(async (tx) => {
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

    // Validate amount does not exceed open amount (with tolerance)
    if (input.amount > txOpen + 0.01) {
      throw new BillingPaymentValidationError(
        `Payment amount (${input.amount}) exceeds open amount (${Math.round(txOpen * 100) / 100})`
      )
    }

    // Create payment record
    return repo.createPayment(txPrisma, {
      tenantId,
      documentId: input.documentId,
      date: input.date,
      amount: input.amount,
      type: input.type,
      isDiscount: false,
      notes: input.notes ?? null,
      createdById,
    })
  })
```

**Audit logging (lines 429-436)**: No change needed. The audit log already uses the outer `prisma` and is outside the transaction block. The variable name `created` is preserved.

### What stays the same

- Lines 293-331: The initial document read + type/status validation outside the transaction stays. These are fast-fail checks that don't need transactional consistency (the overpayment guard is the one that does, and it's re-checked inside the transaction).
- Lines 332-407: The discount path is untouched.
- Lines 429-438: The audit log + return statement are untouched.

### Why keep the initial read outside the transaction

The initial read (lines 294-303) and validation checks (lines 305-321) serve as an early exit for obviously invalid requests (wrong document type, cancelled documents, non-existent documents). These don't need transactional protection because:
- If the document type or status changes between the initial check and the transaction, the transaction will still create the payment correctly (type/status don't affect payment creation logic).
- The critical invariant -- overpayment prevention -- is re-checked inside the transaction with fresh data.

This matches exactly how the discount path works: the initial read at line 294 is outside the discount transaction too.

---

## Fix 2: `createInvoice` — Wrap in `$transaction`

### File: `src/lib/services/billing-service-case-service.ts`

### Changes

**What to change**: Lines 253-299 (the entire createInvoice body after the function signature).

**Current code (lines 253-299)**:
```typescript
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new BillingServiceCaseNotFoundError()

  if (existing.status !== "CLOSED") {
    throw new BillingServiceCaseValidationError(
      "Invoice can only be created from a CLOSED service case"
    )
  }

  if (existing.invoiceDocumentId) {
    throw new BillingServiceCaseConflictError(
      "Service case already has a linked invoice"
    )
  }

  // Create BillingDocument of type INVOICE
  const invoice = await billingDocService.create(
    prisma,
    tenantId,
    {
      type: "INVOICE",
      addressId: existing.addressId,
      contactId: existing.contactId || undefined,
    },
    createdById,
    audit
  )

  // Add positions to the invoice
  for (const pos of positions) {
    await billingDocService.addPosition(prisma, tenantId, {
      documentId: invoice.id,
      type: "FREE",
      description: pos.description,
      quantity: pos.quantity,
      unit: pos.unit,
      unitPrice: pos.unitPrice,
      flatCosts: pos.flatCosts,
      vatRate: pos.vatRate,
    }, audit)
  }

  // Update service case
  return repo.update(prisma, tenantId, id, {
    invoiceDocumentId: invoice.id,
    status: "INVOICED",
  })
```

**Replace with**:
```typescript
  // Wrap read-create-link in transaction to prevent concurrent invoice creation
  // and ensure partial failures roll back (no orphaned documents)
  const updated = await prisma.$transaction(async (tx) => {
    const txPrisma = tx as unknown as PrismaClient

    const existing = await repo.findById(txPrisma, tenantId, id)
    if (!existing) throw new BillingServiceCaseNotFoundError()

    if (existing.status !== "CLOSED") {
      throw new BillingServiceCaseValidationError(
        "Invoice can only be created from a CLOSED service case"
      )
    }

    if (existing.invoiceDocumentId) {
      throw new BillingServiceCaseConflictError(
        "Service case already has a linked invoice"
      )
    }

    // Create BillingDocument of type INVOICE
    const invoice = await billingDocService.create(
      txPrisma,
      tenantId,
      {
        type: "INVOICE",
        addressId: existing.addressId,
        contactId: existing.contactId || undefined,
      },
      createdById,
      audit
    )

    // Add positions to the invoice
    for (const pos of positions) {
      await billingDocService.addPosition(txPrisma, tenantId, {
        documentId: invoice.id,
        type: "FREE",
        description: pos.description,
        quantity: pos.quantity,
        unit: pos.unit,
        unitPrice: pos.unitPrice,
        flatCosts: pos.flatCosts,
        vatRate: pos.vatRate,
      }, audit)
    }

    // Update service case
    return repo.update(txPrisma, tenantId, id, {
      invoiceDocumentId: invoice.id,
      status: "INVOICED",
    })
  })

  return updated
```

### How nested transactions work

When `billingDocService.create(txPrisma, ...)` is called with a transaction client, its internal `prisma.$transaction()` call (line 244 of billing-document-service.ts) becomes a **nested interactive transaction**. Prisma handles this by creating a **savepoint** within the outer transaction. The same applies to `billingDocService.addPosition(txPrisma, ...)` (line 817).

This means:
- If the inner transaction fails, only the savepoint rolls back (not the outer transaction, unless the error propagates).
- If the outer transaction fails, all inner savepoints are rolled back too.
- The inner transactions' audit logs (lines 292-303 and 855-866 in billing-document-service.ts) use the `prisma` argument they receive, which in this case is `txPrisma`. This means the audit logs are written **inside** the outer transaction. This is a behavior change but is actually safer: if the outer transaction rolls back, the audit logs for the intermediate operations (document creation, position additions) also roll back, preventing misleading audit entries for operations that didn't actually persist.

### Audit logging considerations

The `createInvoice` method does **not** have its own audit logging (unlike `create`, `update`, `close`, `createOrder`, `remove` which all log). The audit logging for the invoice and positions is handled internally by `billingDocService.create` and `billingDocService.addPosition`.

When called with `txPrisma`:
- `billingDocService.create` writes its audit log using `prisma` (which is now `txPrisma`) at line 293 of billing-document-service.ts. This audit log will be written inside the outer transaction.
- `billingDocService.addPosition` writes its audit log using `prisma` (which is now `txPrisma`) at line 856 of billing-document-service.ts. Same behavior.

**This is acceptable** because:
1. If the transaction succeeds, audit logs are committed along with the data -- correct behavior.
2. If the transaction fails, audit logs roll back too -- correct behavior (no misleading logs for failed operations).
3. The `.catch(err => console.error(...))` on the audit log calls will catch any audit-specific errors without aborting the transaction (the error is swallowed, not re-thrown).

---

## Summary of Changes

| File | Lines | Change |
|------|-------|--------|
| `billing-payment-service.ts` | 410-427 | Wrap overpayment guard + `createPayment` in `$transaction` with re-read |
| `billing-service-case-service.ts` | 253-299 | Wrap entire `createInvoice` body in `$transaction` |

### Lines NOT touched

| File | Lines | Reason |
|------|-------|--------|
| `billing-payment-service.ts` | 293-331 | Initial document read + type/status validation (fast-fail, matches discount pattern) |
| `billing-payment-service.ts` | 332-407 | Discount path (already correct) |
| `billing-payment-service.ts` | 429-438 | Audit log + return (unchanged, already outside transaction) |
| `billing-payment-service.ts` | 441-504 | `cancelPayment` (already correct) |
| `billing-document-service.ts` | all | Not touched (constraint from ticket) |
| `billing-payment-repository.ts` | all | Not touched (constraint from ticket) |
| `billing-service-case-repository.ts` | all | Not touched (constraint from ticket) |

---

## Verification Steps

### 1. Type check
```bash
pnpm typecheck
```
Verify no new type errors introduced. The `PrismaClient` cast pattern is already used throughout and will work.

### 2. Run existing tests
```bash
pnpm vitest run src/lib/services/__tests__/billing-payment-service.test.ts
pnpm vitest run src/lib/services/__tests__/billing-service-case-service.test.ts
pnpm vitest run src/trpc/routers/__tests__/billingPayments-router.test.ts
pnpm vitest run src/trpc/routers/__tests__/billingServiceCases-router.test.ts
```

The existing mock `$transaction` implementation in tests passes the mock prisma through to the callback:
```typescript
(prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
  (fnOrArr: unknown) => {
    if (typeof fnOrArr === "function") return (fnOrArr as (tx: unknown) => unknown)(prisma)
    return Promise.all(fnOrArr as unknown[])
  }
)
```
This means the mocked transaction passes the same mock object as `tx`, so `tx as unknown as PrismaClient` returns the same mock. All existing tests should continue to pass because:
- For `createPayment` tests: The re-read inside the transaction will use the same mock, returning the same document data. The overpayment guard will behave identically.
- For `createInvoice` tests: The `repo.findById` call now goes through `txPrisma` which is the same mock. The `billingDocService.create` and `addPosition` calls also receive the same mock.

### 3. Lint
```bash
pnpm lint
```

### 4. Manual verification checklist
- [ ] Create a non-discount payment on an invoice -- verify it succeeds
- [ ] Create a payment that exceeds the open amount -- verify the overpayment guard triggers
- [ ] Create a discount payment -- verify it still works (code unchanged)
- [ ] Cancel a payment -- verify it still works (code unchanged)
- [ ] Create an invoice from a CLOSED service case -- verify document + positions + status update
- [ ] Try to create an invoice from a non-CLOSED case -- verify rejection
- [ ] Try to create an invoice when one already exists -- verify rejection

---

## Implementation Order

1. **Fix 1**: `billing-payment-service.ts` -- wrap non-discount `createPayment` in `$transaction`
2. **Fix 2**: `billing-service-case-service.ts` -- wrap `createInvoice` in `$transaction`
3. Run all tests
4. Type check + lint
