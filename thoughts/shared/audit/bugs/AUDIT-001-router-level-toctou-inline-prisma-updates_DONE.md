# AUDIT-001 — Router-level TOCTOU: Routers bypass service/repo layer with inline Prisma calls

| Field               | Value                                                                |
| ------------------- | -------------------------------------------------------------------- |
| **Priority**        | P0                                                                    |
| **Category**        | Tenant Isolation                                                      |
| **Severity**        | CRITICAL                                                              |
| **Audit Source**    | Fresh codebase scan 2026-03-23                                        |
| **Estimated Scope** | 8 router files + 2 service files (dataScope additions), 15 Prisma operations |

---

## Problem

Eight tRPC routers duplicate service/repository logic and make direct Prisma `.update()` / `.delete()` calls using `where: { id }` without `tenantId`. The corresponding service and repository methods already exist and are fully tenant-scoped (using `tenantScopedUpdate` / `deleteMany({ where: { id, tenantId } })`). The routers should delegate to the service layer instead of reimplementing the logic inline.

## Root Cause

These routers were written with inline Prisma calls before the service+repository pattern was established. When the repos were later fixed with `tenantScopedUpdate`, the router-level duplicates were missed:

```ts
// ❌ Current pattern — router duplicates service logic and bypasses tenant-scoped repo
const existing = await ctx.prisma.model.findFirst({ where: { id: input.id, tenantId } })
if (!existing) throw new TRPCError({ code: "NOT_FOUND" })
// ... build data (duplicated from service) ...
await ctx.prisma.model.update({ where: { id: input.id }, data })  // tenantId NOT in where
```

## Required Fix

Replace inline Prisma calls with service method calls. The fix has three tiers based on what the service layer already supports:

### Tier 1 — Straight swap (5 routers, 9 operations)

These routers are **complete duplicates** of existing service methods. Replace the inline code with a service call, passing audit context:

```ts
// ✅ Required pattern — delegate to service
const result = await service.update(ctx.prisma, tenantId, input.id, data, {
  userId: ctx.user!.id,
  ipAddress: ctx.ipAddress,
  userAgent: ctx.userAgent,
})
```

**Routers in this tier:**
- `tripRecords.ts` — update + delete → `trip-record-service.update()` / `.remove()`
- `extendedTravelRules.ts` — update + delete → `extended-travel-rule-service.update()` / `.remove()`
- `exportInterfaces.ts` — update + delete → `export-interface-service.update()` / `.remove()`
- `correctionAssistant.ts` — update → `correction-assistant-service.updateMessage()`
- `vehicles.ts` — update + delete → `vehicle-service.update()` / `.remove()`

### Tier 2 — Service needs `dataScope` parameter (2 routers, 4 operations)

These routers add a `checkRelatedEmployeeDataScope()` call that the service doesn't have. Fix by adding `dataScope` as an optional parameter to the service methods, then delegate:

```ts
// ✅ Required pattern — add dataScope to service, then delegate
// In the service:
export async function update(prisma, tenantId, id, data, opts?: { audit?: AuditContext, dataScope?: DataScope }) {
  const existing = await repo.findById(prisma, tenantId, id, { include: { employee: { select: { departmentId: true } } } })
  if (!existing) throw new NotFoundError()
  if (opts?.dataScope) checkRelatedEmployeeDataScope(opts.dataScope, existing, "EntityName")
  // ... rest of update
}
```

**Routers in this tier:**
- `orderBookings.ts` — update + delete → `order-booking-service.update()` / `.remove()` (add `dataScope`)
- `employeeTariffAssignments.ts` — update + delete → `employee-tariff-assignment-service.update()` / `.remove()` (add `dataScope`)

### Tier 3 — Service needs transaction wrapper (2 routers, overlaps with Tier 2)

These routers wrap operations in `$transaction` that the service does not. Fix by adding transaction boundaries to the service methods:

**Routers in this tier:**
- `weekPlans.ts` — update wraps `weekPlan.update` + completeness re-check in `$transaction`. Service (`week-plan-service.update()`) does them sequentially. Fix: wrap service's update + completeness check in `$transaction`.
- `employeeTariffAssignments.ts` — update wraps `hasOverlap` + `update` in `$transaction`. Service does them sequentially. Fix: wrap service's overlap check + update in `$transaction`.

## Affected Files

### Router files (replace inline Prisma with service calls)

| File | Line(s) | Specific Issue | Tier |
| ---- | ------- | -------------- | ---- |
| `src/trpc/routers/tripRecords.ts` | 414 | `.update({ where: { id } })` — duplicates `trip-record-service.update()` | 1 |
| `src/trpc/routers/tripRecords.ts` | 488 | `.delete({ where: { id } })` — duplicates `trip-record-service.remove()` | 1 |
| `src/trpc/routers/extendedTravelRules.ts` | 340 | `.update({ where: { id } })` — duplicates `extended-travel-rule-service.update()` | 1 |
| `src/trpc/routers/extendedTravelRules.ts` | 409 | `.delete({ where: { id } })` — duplicates `extended-travel-rule-service.remove()` | 1 |
| `src/trpc/routers/exportInterfaces.ts` | 332 | `.update({ where: { id } })` — duplicates `export-interface-service.update()` | 1 |
| `src/trpc/routers/exportInterfaces.ts` | 407 | `.delete({ where: { id } })` — duplicates `export-interface-service.remove()` | 1 |
| `src/trpc/routers/correctionAssistant.ts` | 322 | `.update({ where: { id } })` — duplicates `correction-assistant-service.updateMessage()` | 1 |
| `src/trpc/routers/vehicles.ts` | 264 | `.update({ where: { id } })` — duplicates `vehicle-service.update()` | 1 |
| `src/trpc/routers/vehicles.ts` | 329 | `.delete({ where: { id } })` — duplicates `vehicle-service.remove()` | 1 |
| `src/trpc/routers/orderBookings.ts` | 522 | `.update({ where: { id } })` — service missing `dataScope` check | 2 |
| `src/trpc/routers/orderBookings.ts` | 599 | `.delete({ where: { id } })` — service missing `dataScope` check | 2 |
| `src/trpc/routers/weekPlans.ts` | 479 | `.update({ where: { id } })` in `$transaction` — service lacks tx wrapper | 3 |
| `src/trpc/routers/weekPlans.ts` | 567 | `.delete({ where: { id } })` — duplicates `week-plan-service.remove()` | 1 |
| `src/trpc/routers/employeeTariffAssignments.ts` | 457 | `.update({ where: { id } })` in `$transaction` — service missing `dataScope` + tx | 2+3 |
| `src/trpc/routers/employeeTariffAssignments.ts` | 523 | `.delete({ where: { id } })` — service missing `dataScope` check | 2 |

### Service files (add missing `dataScope` / transaction support)

| File | Change Needed |
| ---- | ------------- |
| `src/lib/services/order-booking-service.ts` | Add optional `dataScope` param to `update()` and `remove()`. Fetch employee relation, call `checkRelatedEmployeeDataScope`. |
| `src/lib/services/employee-tariff-assignment-service.ts` | Add optional `dataScope` param to `update()` and `remove()`. Fetch employee relation, call `checkRelatedEmployeeDataScope`. Wrap overlap check + update in `$transaction`. |
| `src/lib/services/week-plan-service.ts` | Wrap update + completeness re-check in `$transaction`. |

## Verification

### Automated

- [ ] `pnpm test` — all existing tests pass
- [ ] `pnpm typecheck` — no new type errors
- [ ] `pnpm lint` — no lint errors
- [ ] `pnpm vitest run src/trpc/routers/__tests__/orderBookings-router.test.ts`
- [ ] `pnpm vitest run src/trpc/routers/__tests__/tripRecords-router.test.ts`
- [ ] `pnpm vitest run src/trpc/routers/__tests__/extendedTravelRules-router.test.ts`
- [ ] `pnpm vitest run src/trpc/routers/__tests__/vehicles-router.test.ts`
- [ ] `pnpm vitest run src/trpc/routers/__tests__/weekPlans-router.test.ts`
- [ ] `pnpm vitest run src/trpc/routers/__tests__/employeeTariffAssignments-router.test.ts`
- [ ] `pnpm vitest run src/trpc/routers/__tests__/exportInterfaces-router.test.ts`

### Manual

- [ ] Verify update operations return the same shape as before (some routers apply Decimal conversions on the response)
- [ ] Verify delete operations return `{ success: true }` as before
- [ ] Verify `dataScope` filtering works for orderBookings and employeeTariffAssignments (test with a user whose data scope is limited to a specific department)
- [ ] Verify weekPlans update + completeness check is atomic (update a week plan while simultaneously modifying it — should not produce an inconsistent state)

## What NOT to Change

- Do NOT modify the `tenants.ts` router (lines 490, 561) — the Tenant model has no `tenantId` column and is protected by `assertUserHasTenantAccess`
- Do NOT touch `terminalBookings.ts` (lines 312, 328) — ImportBatch updates are on self-created records within the same transaction
- Do NOT change the repository methods — they are already correctly tenant-scoped
- Do NOT change router input validation or output schemas — only replace the inline Prisma calls with service calls
- Do NOT add new repository methods — the existing ones are sufficient

## Notes for Implementation Agent

### Tier 1 (straight swap) implementation pattern:

1. Import the service module in the router (e.g., `import * as tripRecordService from "@/lib/services/trip-record-service"`)
2. Replace the inline findFirst + build data + update/delete block with a single service call
3. The service methods accept an optional `audit` parameter — pass `{ userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }` to preserve audit logging
4. Check if the router applies any post-processing on the result (e.g., `decToNumReq()` Decimal conversions in `extendedTravelRules.ts`) — keep that in the router
5. Verify the service method's return type matches what the router's `.output()` schema expects

### Tier 2 (dataScope) implementation pattern:

1. Read the router's `checkRelatedEmployeeDataScope` call to understand what data it checks
2. Add an optional `dataScope?: DataScope` parameter to the service's update/remove methods
3. In the service, after the initial findById, if `dataScope` is provided, fetch the employee relation and call `checkRelatedEmployeeDataScope`
4. Import `checkRelatedEmployeeDataScope` and `DataScope` from `@/lib/auth/middleware` (verify the exact import path)
5. The router passes `dataScope` from `ctx.dataScope` (set by the `.use(applyDataScope())` middleware)

### Tier 3 (transaction) implementation pattern:

1. For `week-plan-service.ts`: wrap the `repo.update()` + `repo.findByIdWithInclude()` + completeness check in `prisma.$transaction(async (tx) => { ... })`, passing `tx` to repo calls
2. For `employee-tariff-assignment-service.ts`: wrap `repo.hasOverlap()` + `repo.update()` in `prisma.$transaction(async (tx) => { ... })`
3. Verify that the repo methods accept a Prisma transaction client (`tx`) in place of `prisma` — they should, since `PrismaClient` and transaction clients share the same interface

### General notes:

- Start with Tier 1 (5 routers) — these are mechanical swaps with no service changes needed
- Then do Tier 2+3 — these require service changes but the pattern is consistent across all affected files
- The `tenantId` is available in all routers via `ctx.tenantId` (or sometimes just `tenantId` destructured from context)
- After replacing inline code, the router handlers should become significantly shorter — just input validation + service call + output mapping
- Some routers have a try/catch with `handleServiceError(err)` — keep that wrapper, just replace what's inside the try block
