# AUDIT-005: Race Conditions — Billing Payment & Service Case Atomicity

## Research Date: 2026-03-22

## Files Analyzed

| File | Path |
|------|------|
| Payment Service | `src/lib/services/billing-payment-service.ts` |
| Payment Repository | `src/lib/services/billing-payment-repository.ts` |
| Service Case Service | `src/lib/services/billing-service-case-service.ts` |
| Service Case Repository | `src/lib/services/billing-service-case-repository.ts` |
| Document Service | `src/lib/services/billing-document-service.ts` |
| Document Repository | `src/lib/services/billing-document-repository.ts` |
| Payment Router | `src/trpc/routers/billing/payments.ts` |
| Service Case Router | `src/trpc/routers/billing/serviceCases.ts` |
| Payment Tests (unit) | `src/lib/services/__tests__/billing-payment-service.test.ts` |
| Payment Tests (router) | `src/trpc/routers/__tests__/billingPayments-router.test.ts` |
| Service Case Tests (unit) | `src/lib/services/__tests__/billing-service-case-service.test.ts` |
| Service Case Tests (router) | `src/trpc/routers/__tests__/billingServiceCases-router.test.ts` |

---

## Issue 1: Non-Discount `createPayment` — No Transaction

### Location

`billing-payment-service.ts`, function `createPayment`, lines 279-438.

### Current Behavior

The non-discount payment path (when `input.isDiscount` is false/undefined) executes four sequential steps **without** a `$transaction`:

1. **Read document** (line 294): `prisma.billingDocument.findFirst(...)` — fetches the document with its active payments and credit notes.
2. **Compute open amount** (lines 324-330): Calculates `effectiveTotalGross` and `openAmount` from the fetched data.
3. **Validate amount** (line 411): Checks `input.amount > openAmount + 0.01` — the overpayment guard.
4. **Create payment** (line 418): `repo.createPayment(prisma, {...})` — persists the payment record.

All four steps use the outer `prisma` client, not a transaction client. There is a time gap between reading the document (step 1) and creating the payment (step 4) during which a concurrent request can also pass the overpayment guard.

### The Discount Path (Reference — Already Correct)

The discount path (lines 333-407) wraps its logic in `prisma.$transaction(async (tx) => {...})`:

1. Re-reads the document **inside** the transaction (line 345): `txPrisma.billingDocument.findFirst(...)`.
2. Re-computes `txOpen` inside the transaction (lines 357-362).
3. Guards `txOpen <= 0.01` inside the transaction (line 364).
4. Creates both the payment and the Skonto entry inside the transaction (lines 372-393).
5. The transaction client is obtained via `const txPrisma = tx as unknown as PrismaClient` (line 342).

This pattern ensures the read-compute-validate-write cycle is atomic.

### The `cancelPayment` Method (Reference — Already Correct)

`cancelPayment` (lines 441-504) also wraps all operations in `prisma.$transaction(async (tx) => {...})`, including finding the payment, validating status, cancelling, and cascading Skonto cancellation.

### What the Overpayment Guard Looks Like

```typescript
// Line 411 — outside any transaction
if (input.amount > openAmount + 0.01) {
  throw new BillingPaymentValidationError(
    `Payment amount (${input.amount}) exceeds open amount (...)`
  )
}
```

### Race Window

Two concurrent `createPayment` requests for the same document:

| Time | Request A | Request B |
|------|-----------|-----------|
| T1 | Reads document: openAmount = 500 | |
| T2 | | Reads document: openAmount = 500 |
| T3 | Validates: 500 <= 500 + 0.01 -> OK | |
| T4 | | Validates: 500 <= 500 + 0.01 -> OK |
| T5 | Creates payment: amount=500 | |
| T6 | | Creates payment: amount=500 |
| Result | Document is now overpaid by 500 | |

---

## Issue 2: `createInvoice` — No Transaction

### Location

`billing-service-case-service.ts`, function `createInvoice`, lines 238-300.

### Current Behavior

The `createInvoice` method executes four sequential steps **without** a `$transaction`:

1. **Read service case** (line 253): `repo.findById(prisma, tenantId, id)` — fetches the service case.
2. **Create billing document** (line 269): `billingDocService.create(prisma, tenantId, {...}, createdById, audit)` — creates an INVOICE document. Note: `billingDocService.create` **internally** uses a `$transaction` for number generation + document creation (billing-document-service.ts lines 244-290), but this inner transaction commits before the outer flow continues.
3. **Add positions in loop** (lines 282-293): Iterates `positions` array and calls `billingDocService.addPosition(prisma, tenantId, {...}, audit)` for each. Each `addPosition` call **internally** uses its own `$transaction` (billing-document-service.ts lines 817-853) for sort-order + create + recalculate.
4. **Update service case** (line 296): `repo.update(prisma, tenantId, id, { invoiceDocumentId: invoice.id, status: "INVOICED" })`.

Each sub-step is independently atomic, but the entire flow is not.

### Failure Scenarios

**Partial failure**: If step 3 or 4 throws (e.g., position creation fails, or the service case update fails), the billing document from step 2 is already committed to the database as an orphaned DRAFT invoice with some but not all positions.

**Concurrent invocation**: Two concurrent `createInvoice` calls for the same service case:

| Time | Request A | Request B |
|------|-----------|-----------|
| T1 | Reads case: status=CLOSED, invoiceDocumentId=null | |
| T2 | | Reads case: status=CLOSED, invoiceDocumentId=null |
| T3 | Both pass status check (line 256) and conflict check (line 262) | |
| T4 | Creates invoice doc INV-A | |
| T5 | | Creates invoice doc INV-B |
| T6 | Updates case: invoiceDocumentId=INV-A, status=INVOICED | |
| T7 | | Updates case: invoiceDocumentId=INV-B, status=INVOICED |
| Result | INV-A is orphaned; case links only to INV-B | |

The `repo.update` uses `updateMany` with `where: { id, tenantId }` (billing-service-case-repository.ts line 104), which does not check `status` or `invoiceDocumentId` — so the second update silently overwrites the first.

### How `billingDocService.create` and `billingDocService.addPosition` Accept Prisma Clients

Both functions accept `prisma: PrismaClient` as their first parameter:

- `create(prisma, tenantId, input, createdById, audit)` — billing-document-service.ts line 168
- `addPosition(prisma, tenantId, input, audit)` — billing-document-service.ts line 793

Since all repository functions and service functions accept `PrismaClient` as their first parameter, they can be called with a transaction client (`tx as unknown as PrismaClient`) — this is the same pattern already used in the discount payment path and in `billingDocService.create` internally.

---

## Repository Transaction Client Support

All repository functions across all three repositories accept `prisma: PrismaClient` as their first argument and use it for all database calls. This means they inherently support transaction clients — you pass `txPrisma` instead of `prisma`.

| Repository | Functions | Accepts PrismaClient |
|------------|-----------|---------------------|
| `billing-payment-repository.ts` | `createPayment`, `findPaymentById`, `cancelPayment`, etc. | Yes (line 73-98) |
| `billing-service-case-repository.ts` | `findById`, `create`, `update`, `remove` | Yes (lines 64-123) |
| `billing-document-repository.ts` | `create`, `createPosition`, `getMaxSortOrder`, `findPositions`, etc. | Yes (lines 83-281) |

The established pattern in this codebase for passing a transaction client is:

```typescript
const txPrisma = tx as unknown as PrismaClient
```

This pattern is used in:
- `billing-payment-service.ts` line 342 (discount path)
- `billing-payment-service.ts` line 451 (cancelPayment)
- `billing-document-service.ts` line 245 (create)
- `billing-document-service.ts` line 818 (addPosition)
- `billing-document-service.ts` line 436 (finalize)
- `billing-document-service.ts` line 531 (forward)
- `billing-document-service.ts` line 707 (duplicate)

---

## Audit Logging Placement

In both the discount payment path and `cancelPayment`, audit logging is performed **outside** the transaction (after the `$transaction` block resolves). The audit log calls use the outer `prisma` client, not `txPrisma`, and are wrapped in `.catch()` to ensure audit failures never block the operation.

This pattern is consistent across the codebase:
- `billing-payment-service.ts` lines 398-406 (discount audit)
- `billing-payment-service.ts` lines 494-501 (cancel audit)
- `billing-document-service.ts` lines 292-303 (create audit)
- `billing-document-service.ts` lines 855-866 (addPosition audit)

Note: `billingDocService.create` and `billingDocService.addPosition` each write their own audit logs internally. If `createInvoice` were wrapped in a transaction, these internal audit logs would need consideration — currently they log outside their respective internal transactions using the `prisma` argument they receive.

---

## Existing Tests

### `billing-payment-service.test.ts`

- **Unit tests** using mock Prisma client.
- The mock `$transaction` implementation simply calls the callback with the same mock prisma (line 22-28), meaning tests do not actually verify transaction isolation.
- Tests cover: `computePaymentStatus`, `computeDueDate`, `isOverdue`, `getApplicableDiscount`, `createPayment` (8 tests), `cancelPayment` (4 tests), `listOpenItems` (3 tests), `getOpenItemById` (2 tests), `getOpenItemsSummary` (2 tests).
- `createPayment` tests verify validation (document type, status, overpayment guard, credit note accounting) and the discount path (Skonto entry creation, expired discount rejection).
- **No concurrency/race-condition tests exist.**

### `billing-service-case-service.test.ts`

- **Unit tests** using mock Prisma client.
- Same mock `$transaction` pattern (lines 125-130).
- Tests cover: `create` (5 tests), `update` (4 tests), `close` (3 tests), `createInvoice` (4 tests), `createOrder` (3 tests), `remove` (3 tests).
- `createInvoice` tests verify: INVOICE document creation, linking invoice to service case + status transition, rejection if not CLOSED, rejection if invoice already exists.
- **No tests verify atomicity of the multi-step createInvoice flow.**
- **No tests verify behavior when a position addition fails mid-loop.**

### Router-Level Tests

- `billingPayments-router.test.ts`: 9 tests covering permission checks, basic CRUD.
- `billingServiceCases-router.test.ts`: 9 tests covering permission checks, basic CRUD, createInvoice happy path.
- No E2E browser tests exist for billing payments or service case invoice creation.

---

## Summary of Findings

| Concern | Non-Discount `createPayment` | `createInvoice` |
|---------|------------------------------|-----------------|
| Uses `$transaction`? | No | No |
| Read-then-write gap? | Yes — document read + openAmount compute outside transaction | Yes — service case read, then 2+ writes |
| Concurrent request risk? | Two payments can both pass overpayment guard | Two invoices can be created; one becomes orphaned |
| Partial failure risk? | No (single write) | Yes — invoice created but positions or case update can fail, leaving orphaned document |
| Reference pattern exists? | Yes — discount path in same function | Yes — `billingDocService.create`, `finalize`, `forward`, `duplicate` all use `$transaction` |
| Repositories support `tx`? | Yes — all accept `PrismaClient` | Yes — all accept `PrismaClient` |
| Existing test coverage for atomicity? | None | None |
