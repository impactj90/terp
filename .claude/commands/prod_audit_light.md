---
name: terp-audit
description: >
  Use this skill for ALL production readiness audits on the Terp codebase.
  Triggers whenever the user wants to audit, review, or check code quality,
  security, performance, or correctness across any part of the Terp application
  (core, CRM, billing, warehouse, HR, time-tracking, payroll, absences, shifts,
  schedules, bookings, notifications, access control, or any new module).
  Also triggers for phrases like: "audit this", "check for bugs", "production check",
  "security review", "find issues", "is this safe to deploy", "run the audit",
  "check tenant isolation", "check race conditions", "check N+1", "check cache",
  or after any /full_workflow implementation before merging.
  This skill encodes all 6 audit categories from the Terp production audit framework
  and must be used any time code correctness or production safety is evaluated.
---

# Terp — Production Audit Skill

## When to Audit

| Trigger                                                | Audit Categories to Run             |
| ------------------------------------------------------ | ----------------------------------- |
| New repository function (`update`, `delete`, `create`) | Tenant Isolation                    |
| New mutation hook                                      | Cache Invalidation + Error Handling |
| Billing / payment flow                                 | Race Conditions + Atomicity         |
| New tRPC router procedure                              | Input Validation + Tenant Isolation |
| Cron job added or modified                             | Cron Idempotency                    |
| Bulk operation (loop over records)                     | N+1 Queries                         |
| New Prisma model                                       | Missing Indexes                     |
| End of a feature module (e.g. WH_01–WH_08 complete)    | Full audit — all 6 categories       |
| Any PR touching `*-repository.ts`                      | Tenant Isolation (mandatory)        |
| Any PR touching `src/hooks/use-*.ts`                   | Cache Invalidation + Error Handling |

---

## Audit Category 1: Tenant Isolation

**The most critical category. Every DB write must be scoped to tenantId at the database layer.**

### What to check

1. Every `repository.update()` — does the Prisma `where` clause include `tenantId`?
2. Every `repository.delete()` — same check
3. Every `findUnique` / `findFirst` — does it include `tenantId`?
4. Raw SQL (`$queryRaw`, `$queryRawUnsafe`) — does it include `tenant_id` filter?
5. Count queries (`count()`) — does it include `tenantId`?
6. Position/line-item queries — do they join through parent to verify tenant?
7. Cross-model references (e.g. `findUserGroupById`) — is tenant scope verified?

### Pattern to flag (CRITICAL)

```ts
// ❌ CRITICAL GAP — tenantId ignored at DB layer
await prisma.model.update({
  where: { id }, // ← only id, no tenantId
  data,
});

// ✅ CORRECT
const { count } = await prisma.model.updateMany({
  where: { id, tenantId },
  data,
});
if (count === 0) throw new NotFoundError("Not found or access denied");
```

### Audit output format

```
TENANT ISOLATION AUDIT
─────────────────────
File:Line          | Issue                        | Severity
-------------------|------------------------------|----------
users-repo.ts:120  | update() without tenantId    | CRITICAL
crm-repo.ts:244    | countContacts no tenantId    | HIGH
daily-calc.ts:141  | $queryRaw no tenant_id       | HIGH
```

---

## Audit Category 2: Race Conditions & Atomicity

**Financial data and status transitions must be atomic. Read-then-write is a bug.**

### What to check

1. Status transitions — is there a read-then-write gap (TOCTOU)?
2. Multi-step financial operations — are they wrapped in `$transaction`?
3. Sort order assignment — is MAX computed inside a transaction?
4. Payment operations — are main payment + Skonto in one transaction?
5. Cron jobs — is there an idempotency checkpoint?

### Patterns to flag

```ts
// ❌ TOCTOU — concurrent requests can both pass this check
const record = await repo.findById(tenantId, id)
if (record.status !== 'DRAFT') throw new Error(...)
await repo.update(id, { status: 'ORDERED' })  // ← gap here

// ✅ CORRECT — atomic status guard
const { count } = await prisma.model.updateMany({
  where: { id, tenantId, status: 'DRAFT' },
  data: { status: 'ORDERED' },
})
if (count === 0) throw new Error('Not in DRAFT or not found')

// ❌ Multi-step without transaction
await createOrder(...)
await updateDocumentStatus(...)  // ← can fail leaving data inconsistent

// ✅ CORRECT
await prisma.$transaction(async (tx) => {
  await tx.billingOrder.create({ ... })
  await tx.billingDocument.update({ ... })
})
```

### High-risk areas to always check

- `billing-document-service.ts` — finalize, cancel, addPosition
- `billing-payment-service.ts` — createPayment, cancelPayment, discount payment
- `billing-recurring-invoice-service.ts` — generateDue cron
- Any service with status workflow (DRAFT → ORDERED → RECEIVED etc.)

### Audit output format

```
RACE CONDITIONS AUDIT
─────────────────────
ID     | File:Line                        | Issue                          | Severity
-------|----------------------------------|--------------------------------|----------
RC-001 | absences-repository.ts:308       | TOCTOU on status update        | HIGH
RC-002 | billing-document-service.ts:434  | finalize not in $transaction   | HIGH
AO-004 | billing-payment-service.ts:343   | discount creates 2 records     | HIGH
       |                                  | without $transaction           |
```

---

## Audit Category 3: Input Validation

**Every tRPC input schema must have explicit bounds. Update schemas must match create schemas.**

### What to check

1. String inputs — do they have `.max()`? (255 for names, 500 for text fields)
2. Numeric inputs — do they have `.min()` AND `.max()`? Never unbounded
3. `limit` / `pageSize` parameters — `.int().min(1).max(500)`
4. `year` / `month` — `.int().min(2000).max(2100)` or similar
5. `distanceKm`, quantities, amounts — always bounded
6. Update schemas — do they have the same constraints as create schemas?
7. `$queryRawUnsafe` — flag every instance, replace with `$queryRaw` tagged template
8. `z.any()` in output schemas — replace with `z.unknown()`
9. Read-only procedures defined as `.mutation()` — should be `.query()`

### Patterns to flag

```ts
// ❌ Unbounded inputs
z.object({
  search: z.string(), // ← no .max()
  limit: z.number(), // ← no .min()/.max()/.int()
  distanceKm: z.number(), // ← no bounds
  year: z.number(), // ← no bounds
});

// ✅ CORRECT
z.object({
  search: z.string().max(255),
  limit: z.number().int().min(1).max(500),
  distanceKm: z.number().min(0).max(100000),
  year: z.number().int().min(2000).max(2100),
});

// ❌ Update schema missing constraints that create has
const createSchema = z.object({
  valueMinutes: z.number().min(-10080).max(10080),
});
const updateSchema = z.object({ valueMinutes: z.number() }); // ← missing range!

// ❌ Never use $queryRawUnsafe
await prisma.$queryRawUnsafe(`SELECT * FROM ...`);

// ✅ Always use tagged template
await prisma.$queryRaw`SELECT * FROM ... WHERE tenant_id = ${tenantId}`;
```

### Audit output format

```
INPUT VALIDATION AUDIT
──────────────────────
File:Line                  | Issue                              | Severity
---------------------------|------------------------------------|---------
corrections.ts:100         | update schema missing .max(10080)  | HIGH
users.ts:190               | search string no .max()            | MEDIUM
travelAllowance.ts:49      | distanceKm unbounded               | LOW
reports-repository.ts:317  | $queryRawUnsafe — use $queryRaw    | HIGH
```

---

## Audit Category 4: Cache Invalidation

**After every mutation: ask what lists or detail views could show stale data.**

### What to check

For every mutation hook in `src/hooks/use-*.ts`:

1. Does `onSuccess` invalidate ALL affected query keys?
2. Payment mutations → invalidate document list + document detail
3. Template mutations → invalidate `listByType` + `getDefault`
4. Delete mutations → invalidate child resource lists (orphan prevention)
5. Schedule execution → invalidate time data (use `useTimeDataInvalidation()`)
6. Any mutation that affects a `getById` — does it invalidate that `getById`?

### Checklist per mutation type

| Mutation                 | Must Invalidate                                        |
| ------------------------ | ------------------------------------------------------ |
| Create payment           | `billing.documents.list` + `billing.documents.getById` |
| Cancel payment           | `billing.documents.list` + `billing.documents.getById` |
| Set default template     | `listByType` + `getDefault`                            |
| Delete order             | `orderAssignments.list` + `orderBookings.list`         |
| Execute schedule         | `useTimeDataInvalidation()` + `employeeDayPlans.list`  |
| Delete address           | `crm.addresses.getById`                                |
| Update department        | `departments.getById`                                  |
| Delete user              | `users.getById`                                        |
| Update shift             | `shifts.getById`                                       |
| Update/delete price list | `priceLists.entriesForAddress`                         |

### Pattern to flag

```ts
// ❌ Missing invalidations
export function useCreateBillingPayment() {
  return useMutation({
    ...trpc.billing.payments.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.payments.queryKey(),
      });
      // ← document status is now stale! User sees wrong status for 5 minutes
    },
  });
}

// ✅ CORRECT
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: trpc.billing.payments.queryKey() });
  queryClient.invalidateQueries({
    queryKey: trpc.billing.documents.queryKey(),
  });
};
```

### Audit output format

```
CACHE INVALIDATION AUDIT
────────────────────────
Hook                          | Missing Invalidation              | Impact
------------------------------|-----------------------------------|--------
useCreateBillingPayment       | billing.documents.list+getById    | HIGH — stale status
useSetDefaultTemplate         | listByType, getDefault            | MEDIUM — wrong default
useDeleteOrder                | orderAssignments.list             | HIGH — orphaned data
```

---

## Audit Category 5: N+1 Query Patterns

**No sequential DB calls inside loops. Always batch.**

### What to check

1. Loops with `await prisma.*.create()` inside → replace with `createMany`
2. Loops with `await prisma.*.update()` inside → replace with `updateMany`
3. Functions called inside loops that make DB calls internally
4. Cron jobs processing N employees with N×DB calls each
5. `auditLog.log()` called in loops → batch with `auditLog.createMany`

### Pattern to flag

```ts
// ❌ N writes per operation
for (const employee of employees) {
  await prisma.auditLog.create({ data: { employeeId: employee.id, ... } })
}

// ✅ CORRECT — 1 write total
await prisma.auditLog.createMany({
  data: employees.map(e => ({ employeeId: e.id, ... }))
})

// ❌ N DB calls inside loop (hidden N+1)
for (const employee of employees) {
  const tariff = await resolveTariff(prisma, tenantId, employee.id) // ← DB call!
}

// ✅ CORRECT — pre-fetch map, then use in loop
const tariffMap = await buildTariffMap(prisma, tenantId, employeeIds)
for (const employee of employees) {
  const tariff = tariffMap.get(employee.id) // ← no DB call
}
```

### High-risk areas to always check

- `employees-service.ts` — bulk tariff assign
- `absences-service.ts` — range creation
- `vacation-service.ts` — calculateCappedCarryover, initializeBatch
- `macro-executor.ts` — macro assignment updates
- Any cron job processing all employees

### Audit output format

```
N+1 QUERY AUDIT
───────────────
File:Line                      | Pattern                          | Impact
-------------------------------|----------------------------------|--------
employees-service.ts:828       | auditLog.log() in loop           | HIGH — N writes
vacation-service.ts:698        | resolveTariff() per employee     | HIGH — 3N queries
macro-executor.ts:72           | assignment.update() per item     | HIGH — 150-200 writes
```

---

## Audit Category 6: Missing Indexes

**Every query hot path needs a compound index with tenantId as the first field.**

### What to check

1. New Prisma models — do they have `@@index([tenantId, status])`?
2. Hot-path queries — is `tenantId` the FIRST field in the index?
3. Period-based queries (payroll, reports) — is there `@@index([tenantId, year, month])`?
4. Booking/time-tracking queries — is there `@@index([tenantId, employeeId, date])`?
5. Relation-filtered lists — is there `@@index([tenantId, supplierId])` etc.?

### Standard index set for every new tenant-scoped model

```prisma
@@index([tenantId, status])       // Status-filtered lists
@@index([tenantId, createdAt])    // Chronological lists
@@index([tenantId, updatedAt])    // Recently modified lists
// Add relation indexes per model:
@@index([tenantId, employeeId])
@@index([tenantId, supplierId])
@@index([tenantId, customerId])
```

### Anti-pattern to flag

```prisma
// ❌ tenantId missing from index — full table scan on tenant filter
@@index([employeeId, bookingDate])

// ✅ CORRECT — tenantId first
@@index([tenantId, employeeId, bookingDate])
```

### Audit output format

```
MISSING INDEXES AUDIT
─────────────────────
Table         | Missing Index                              | Impact
--------------|--------------------------------------------|--------
Booking       | @@index([tenantId, employeeId, bookingDate])| HIGH — hot path
MonthlyValue  | @@index([tenantId, year, month])            | MEDIUM — reports
```

---

## Additional Checks

### Error Handling

Every mutation hook must define `onError`:

```ts
// ❌ No onError — errors silently swallowed or cause unhandled rejections
export function useDeleteEmployee() {
  return useMutation({
    ...trpc.employees.delete.mutationOptions(),
    onSuccess: () => { ... },
    // ← no onError!
  })
}

// ✅ CORRECT
onError: (error) => {
  toast.error(getErrorMessage(error))
},
```

Also check:

- Empty `catch` blocks that swallow errors silently
- `handleAction` without try/catch (unhandled promise rejections)
- `useUnreadCount` without polling fallback when SSE drops

### Cron Idempotency

Every cron job must have a `cronCheckpoint`:

- `execute-macros` — macros re-execute on retry without checkpoint
- `generate-day-plans` — full reprocessing on retry
- `calculate-days` — checkpoint must be saved atomically with `completeExecution`

---

## Audit Execution Guide

### Running a targeted audit (after a single PR)

Specify which categories are relevant based on what changed:

```
Run a production audit on the changes in [file/module].
Focus on: [Tenant Isolation | Race Conditions | Input Validation |
           Cache Invalidation | N+1 Queries | Missing Indexes]
Use the terp-audit skill audit format for the output.
```

### Running a full module audit (after completing a feature module)

```
Run a full production audit on all new files in src/trpc/routers/warehouse/,
src/lib/services/wh-*, and src/hooks/use-wh-*.
Cover all 6 categories: Tenant Isolation, Race Conditions, Input Validation,
Cache Invalidation, N+1 Queries, Missing Indexes.
Use the terp-audit skill audit format for the output.
```

### Audit report format (always use this structure)

```
● Production-Readiness Audit Report
  Scope: [files / module audited]
  Categories: [which of the 6 were checked]

  CRITICAL  [count] issues
  HIGH      [count] issues
  MEDIUM    [count] issues
  LOW       [count] issues

  [One table per category — only show categories with findings]

  Verdict: PASS / FAIL / PASS WITH WARNINGS
  [PASS = no CRITICAL or HIGH issues]
  [FAIL = any CRITICAL issue]
  [PASS WITH WARNINGS = only MEDIUM/LOW]
```

---

## Severity Definitions

| Severity | Definition                                                                      |
| -------- | ------------------------------------------------------------------------------- |
| CRITICAL | Data leak or corruption possible (cross-tenant access, financial inconsistency) |
| HIGH     | User-visible bug or significant performance problem in production               |
| MEDIUM   | Stale UI, missing validation, suboptimal but not breaking                       |
| LOW      | Code quality, minor inconsistency, future risk                                  |

---

## Quick Reference — The Most Common Bugs

| Pattern                        | Category           | Fix                                       |
| ------------------------------ | ------------------ | ----------------------------------------- |
| `update({ where: { id } })`    | Tenant Isolation   | `updateMany({ where: { id, tenantId } })` |
| Read-then-write status check   | Race Conditions    | `updateMany` with status in where         |
| `$queryRawUnsafe`              | Input Validation   | `$queryRaw` tagged template               |
| Missing `onError` in hook      | Error Handling     | Add `onError: (e) => toast.error(...)`    |
| `auditLog.create` in loop      | N+1                | `auditLog.createMany([...])`              |
| Payment without `$transaction` | Race Conditions    | Wrap in `$transaction`                    |
| `z.any()` in output schema     | Input Validation   | `z.unknown()`                             |
| Index without tenantId first   | Missing Indexes    | `@@index([tenantId, field])`              |
| `.mutation()` for read-only    | Input Validation   | Change to `.query()`                      |
| Missing cache invalidation     | Cache Invalidation | Add all affected `queryKey()`             |
