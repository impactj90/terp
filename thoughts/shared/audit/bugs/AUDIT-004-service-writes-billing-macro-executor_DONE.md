# AUDIT-004 — Service-level writes bypass repo: billing-einvoice + macro-executor

| Field               | Value                                                                |
| ------------------- | -------------------------------------------------------------------- |
| **Priority**        | P1                                                                    |
| **Category**        | Tenant Isolation                                                      |
| **Severity**        | HIGH                                                                  |
| **Audit Source**    | Fresh codebase scan 2026-03-23                                        |
| **Estimated Scope** | 2 service files, 5 write operations                                   |

---

## Problem

Two service files make direct Prisma write calls that bypass existing tenant-scoped repository methods. In `billing-document-einvoice-service.ts`, a `BillingDocument.update` uses `where: { id }` without tenantId, even though `billing-document-repository.update()` exists and is fully tenant-scoped. In `macro-executor.ts`, two `macroExecution.update` calls bypass the tenant-scoped `macros-repository.updateExecution()`, and two `macroAssignment.updateMany` calls lack tenantId in their where clause (no bulk repo method exists for these).

## Root Cause

```ts
// ❌ billing-document-einvoice-service.ts line 428
// billing-document-repository.update() exists and uses updateMany({ where: { id, tenantId } })
// but the einvoice service calls Prisma directly:
await prisma.billingDocument.update({
  where: { id: documentId },       // repo method NOT called!
  data: { eInvoiceXmlUrl: xmlStoragePath },
})

// ❌ macro-executor.ts lines 177, 189
// macros-repository.updateExecution() exists and uses tenantScopedUpdate
// but the executor calls Prisma directly:
await this.prisma.macroExecution.update({
  where: { id: execution.id },     // repo method NOT called!
  data: { completedAt: new Date(), status: "failed", ... },
})

// ❌ macro-executor.ts lines 87, 126
// No bulk repo method exists — direct Prisma call without tenantId:
await this.prisma.macroAssignment.updateMany({
  where: { id: { in: successfulWeeklyIds } },  // tenantId missing!
  data: { lastExecutedAt: new Date(), lastExecutedDate: date },
})
```

## Required Fix

### Fix 1: billing-document-einvoice-service.ts — use the existing repo

Replace the direct `prisma.billingDocument.update()` with a call to the existing tenant-scoped `billing-document-repository.update()`:

```ts
// ✅ Required pattern — call existing tenant-scoped repo method
import * as billingDocRepo from "@/lib/services/billing-document-repository"

await billingDocRepo.update(prisma, tenantId, documentId, {
  eInvoiceXmlUrl: xmlStoragePath,
})
```

The repo's `update()` uses `updateMany({ where: { id, tenantId } })` internally, ensuring tenant isolation.

### Fix 2: macro-executor.ts execution updates — use the existing repo

Replace the two direct `prisma.macroExecution.update()` calls with `macros-repository.updateExecution()`:

```ts
// ✅ Required pattern — call existing tenant-scoped repo method
import * as macrosRepo from "@/lib/services/macros-repository"

// Catch block (line 177):
await macrosRepo.updateExecution(this.prisma, macro.tenantId, execution.id, {
  completedAt: new Date(),
  status: "failed",
  result: {},
  errorMessage: String(err),
})

// Success path (line 189):
await macrosRepo.updateExecution(this.prisma, macro.tenantId, execution.id, {
  completedAt: new Date(),
  status: actionResult.error ? "failed" : "completed",
  result: (actionResult.result as object) ?? {},
  errorMessage: actionResult.error ?? null,
})
```

### Fix 3: macro-executor.ts assignment bulk updates — add tenantId inline

No bulk repo method exists for updating assignments by ID list. Add `tenantId` to the where clause:

```ts
// ✅ Required pattern — add tenantId to existing updateMany
await this.prisma.macroAssignment.updateMany({
  where: { id: { in: successfulWeeklyIds }, tenantId },
  data: { lastExecutedAt: new Date(), lastExecutedDate: date },
})
```

## Affected Files

| File | Line(s) | Specific Issue | Fix Approach |
| ---- | ------- | -------------- | ------------ |
| `src/lib/services/billing-document-einvoice-service.ts` | 428 | Direct `billingDocument.update` — repo `update()` exists and is tenant-scoped | Call `billingDocRepo.update()` |
| `src/lib/services/macro-executor.ts` | 177-184 | Direct `macroExecution.update` in catch block — repo `updateExecution()` exists | Call `macrosRepo.updateExecution()` |
| `src/lib/services/macro-executor.ts` | 189-197 | Direct `macroExecution.update` on success — repo `updateExecution()` exists | Call `macrosRepo.updateExecution()` |
| `src/lib/services/macro-executor.ts` | 87-90 | `macroAssignment.updateMany` without tenantId — no bulk repo method | Add `tenantId` to where clause |
| `src/lib/services/macro-executor.ts` | 126-129 | `macroAssignment.updateMany` without tenantId — no bulk repo method | Add `tenantId` to where clause |

## Verification

### Automated

- [ ] `pnpm test` — all existing tests pass
- [ ] `pnpm typecheck` — no new type errors
- [ ] `pnpm lint` — no lint errors
- [ ] `pnpm vitest run src/trpc/routers/__tests__/billingDocuments-router.test.ts`
- [ ] `pnpm vitest run src/trpc/routers/__tests__/macros-router.test.ts`

### Manual

- [ ] Test e-invoice generation flow — verify `eInvoiceXmlUrl` is still saved on the document
- [ ] Test macro execution (weekly/monthly cron) — verify execution records are updated correctly
- [ ] Verify the catch block in `executeSingleMacro` still re-throws after updating the execution record
- [ ] Verify `macrosRepo.updateExecution()` data shape matches what the executor passes — check if the repo's typed `data` parameter includes all required fields (`completedAt`, `status`, `result`, `errorMessage`)

## What NOT to Change

- Do NOT create a new bulk repo method for `macroAssignment.updateMany` — just add tenantId inline. A bulk method would be over-engineering for 2 call sites.
- Do NOT change the e-invoice generation logic — only replace the Prisma call with the repo call
- Do NOT change the `macroExecution.create` call (line 154) — it already sets `tenantId: macro.tenantId`
- Do NOT modify `billing-document-repository.ts` or `macros-repository.ts` — they are already correctly tenant-scoped

## Notes for Implementation Agent

- **billing-document-einvoice-service.ts**: The `tenantId` is a parameter of the enclosing function `generateAndStoreEInvoice`. Verify the exact parameter name before using it. The repo's `update()` method signature is `update(prisma, tenantId, id, data)` — verify by reading `billing-document-repository.ts`.
- **macro-executor.ts execution updates**: The repo's `updateExecution()` has a typed `data` parameter: `{ completedAt: Date, status: string, result: object, errorMessage: string | null }`. The executor's catch block (line 177) does NOT pass `result` — you'll need to add `result: {}` to match the repo's type. Verify the exact signature by reading `macros-repository.ts` before implementing.
- **macro-executor.ts assignment updates**: The `tenantId` is the first parameter of `executeDueMacros()` (line 40). Just add it to the `where` clause on lines 87-90 and 126-129.
- **Error propagation**: In the catch block (line 175-186), after calling `macrosRepo.updateExecution()`, the `throw err` on line 185 must still execute. `updateExecution` uses `tenantScopedUpdate` which can throw `TenantScopedNotFoundError` if the record isn't found — this is fine because the execution was just created on line 154. But verify this won't mask the original error.
- The `MacroExecutor` class constructor takes only `prisma: PrismaClient`. You'll need to import the repo module at the top of the file — the repo functions are standalone exports, not methods on a class.
