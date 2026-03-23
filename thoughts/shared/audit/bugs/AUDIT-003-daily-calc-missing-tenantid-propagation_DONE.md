# AUDIT-003 — DailyCalcService: Missing tenantId propagation to internal queries

| Field               | Value                                                                |
| ------------------- | -------------------------------------------------------------------- |
| **Priority**        | P0                                                                    |
| **Category**        | Tenant Isolation                                                      |
| **Severity**        | CRITICAL                                                              |
| **Audit Source**    | Fresh codebase scan 2026-03-23                                        |
| **Estimated Scope** | 2 service files, 9 read queries + 1 write operation                   |

---

## Problem

`DailyCalcService.calculateDay()` receives `tenantId` as a parameter but does not pass it to its private helper methods. Six internal `findFirst`/`findMany` queries in `daily-calc.ts` and three queries in `daily-calc.context.ts` execute without tenant filtering. Additionally, one `booking.update` call writes without tenantId in the where clause. If an `employeeId` belonging to a different tenant is passed, the calculation engine will silently load and process cross-tenant data.

## Root Cause

The `tenantId` parameter stops at `calculateDay()` and is not threaded into private methods like `loadEmployeeDayPlan`, `calculateTargetTime`, `applyNBRTargetWithOrder`, `preloadShiftDetectionPlans`, and `maybeNotifyError`. In `daily-calc.context.ts`, the `loadEmployeeCalcContext` function accepts `tenantId` and uses it for some queries but omits it from three others:

```ts
// ❌ Current pattern in daily-calc.ts — private methods don't receive tenantId
private async loadEmployeeDayPlan(employeeId: string, date: Date) {
  return this.prisma.employeeDayPlan.findFirst({
    where: { employeeId, planDate: date },  // no tenantId!
  })
}

// ❌ Current pattern in daily-calc.context.ts — tenantId available but not used
export async function loadEmployeeCalcContext(prisma, tenantId, employeeId, ...) {
  const dayPlans = await prisma.employeeDayPlan.findMany({
    where: { employeeId, planDate: ... },  // tenantId NOT used despite being a parameter!
  })
}
```

## Required Fix

Thread `tenantId` through all private methods and add it to every query where clause:

```ts
// ✅ Required pattern — daily-calc.ts
private async loadEmployeeDayPlan(tenantId: string, employeeId: string, date: Date) {
  return this.prisma.employeeDayPlan.findFirst({
    where: { employeeId, planDate: date, tenantId },
  })
}

// ✅ Required pattern — daily-calc.context.ts
const dayPlans = await prisma.employeeDayPlan.findMany({
  where: { employeeId, planDate: ..., tenantId },
})
```

For the booking write:
```ts
// ✅ Required pattern — use updateMany with tenantId
this.prisma.booking.updateMany({
  where: { id, tenantId },
  data: { calculatedTime: time },
})
```

## Affected Files

| File | Line(s) | Specific Issue |
| ---- | ------- | -------------- |
| `src/lib/services/daily-calc.ts` | 318 | `employeeDayPlan.findFirst({ where: { employeeId, planDate } })` — no tenantId |
| `src/lib/services/daily-calc.ts` | 379 | `employee.findFirst({ where: { id: employeeId } })` — no tenantId |
| `src/lib/services/daily-calc.ts` | 968 | `employee.findFirst({ where: { id: employeeId } })` — no tenantId |
| `src/lib/services/daily-calc.ts` | 1116 | `dayPlan.findFirst({ where: { id: result.matchedPlanId } })` — no tenantId |
| `src/lib/services/daily-calc.ts` | 1169 | `booking.update({ where: { id } })` — no tenantId in write |
| `src/lib/services/daily-calc.ts` | 1421 | `dayPlan.findFirst({ where: { id } })` — no tenantId |
| `src/lib/services/daily-calc.ts` | 1763 | `employee.findFirst({ where: { id: employeeId } })` — no tenantId |
| `src/lib/services/daily-calc.context.ts` | 122 | `employeeDayPlan.findMany({ where: { employeeId, planDate } })` — tenantId param exists but unused |
| `src/lib/services/daily-calc.context.ts` | 170 | `dailyValue.findMany({ where: { employeeId, valueDate } })` — tenantId param exists but unused |
| `src/lib/services/daily-calc.context.ts` | 179 | `employee.findFirst({ where: { id: employeeId } })` — tenantId param exists but unused |

## Verification

### Automated

- [ ] `pnpm test` — all existing tests pass
- [ ] `pnpm typecheck` — no new type errors
- [ ] `pnpm lint` — no lint errors
- [ ] `pnpm vitest run src/trpc/routers/__tests__/dailyValues-router.test.ts` (if exists)
- [ ] `pnpm vitest run src/trpc/routers/__tests__/bookings-router.test.ts`

### Manual

- [ ] Run daily calculation for a single employee and verify results match pre-fix output
- [ ] Verify that the booking.update (line 1169) inside `$transaction` still works correctly with `updateMany`
- [ ] Check that shift detection (lines 1116, 1421) still resolves day plans correctly with the added tenantId filter

## What NOT to Change

- Do NOT modify the calculation logic, formulas, or business rules — only add tenant scoping
- Do NOT change the public API of `calculateDay()` — tenantId is already a parameter
- Do NOT refactor the private methods into the repository layer — just thread tenantId through them
- Do NOT touch the raw SQL queries that already include tenant filtering (e.g., absence queries in daily-calc.context.ts)

## Notes for Implementation Agent

- `daily-calc.ts` is a large file (~1800 lines). Focus only on the listed line numbers — do not refactor surrounding code.
- The `tenantId` flows into `calculateDay()` as a parameter. You'll need to pass it into each private method that currently lacks it. Check the call chain: `calculateDay` → private methods → Prisma queries.
- For `daily-calc.context.ts`, the `tenantId` parameter is ALREADY in the function signature at line 108 — it just needs to be added to the 3 where clauses that omit it.
- The `booking.update` at line 1169 is inside a `$transaction` with multiple updates mapped from `result.calculatedTimes`. Change each `.update({ where: { id } })` to `.updateMany({ where: { id, tenantId } })`. Since the return value of individual updates is not used (they're batched in a transaction), `updateMany` is a drop-in replacement.
- The Employee model has required `tenantId` — adding it to `findFirst` queries is safe.
- The DayPlan model has required `tenantId` — the `findFirst({ where: { id } })` calls at lines 1116 and 1421 can simply add `tenantId` to the where clause.
- Verify the exact line numbers before editing — they may have shifted from prior commits.
