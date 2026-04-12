# AUDIT-005 — Read operations missing tenantId in vacation-helpers + bookings-repository

| Field               | Value                                                                |
| ------------------- | -------------------------------------------------------------------- |
| **Priority**        | P1                                                                    |
| **Category**        | Tenant Isolation                                                      |
| **Severity**        | HIGH                                                                  |
| **Audit Source**    | Fresh codebase scan 2026-03-23                                        |
| **Estimated Scope** | 2 service files, 2 queries + caller updates                           |

---

## Problem

Two exported functions perform Prisma read queries without tenant scoping on models that have a `tenantId` field. In `vacation-helpers.ts`, the `resolveTariff` function has `tenantId` as a parameter and uses it for some queries but omits it from the `EmployeeTariffAssignment` lookup. In `bookings-repository.ts`, the `findEmployeeDayPlan` function doesn't accept `tenantId` at all, leaving it impossible for callers to scope the query. Both functions are exported and available to any caller, creating a surface for cross-tenant data leaks if called with an employee from a different tenant.

## Root Cause

```ts
// ❌ Current pattern — vacation-helpers.ts line 74
// tenantId IS a parameter of resolveTariff() but NOT used here:
const assignment = await prisma.employeeTariffAssignment.findFirst({
  where: { employeeId: employee.id, isActive: true, effectiveFrom: { lte: referenceDate } },
  // EmployeeTariffAssignment has tenantId — not used!
  orderBy: { effectiveFrom: "desc" },
})

// ❌ Current pattern — bookings-repository.ts line 237-246
// tenantId not even in the function signature:
export async function findEmployeeDayPlan(
  prisma: PrismaClient,
  employeeId: string,    // no tenantId parameter!
  planDate: Date
) {
  return prisma.employeeDayPlan.findFirst({
    where: { employeeId, planDate },   // EmployeeDayPlan has tenantId — not used!
    include: { dayPlan: true },
  })
}
```

## Required Fix

### vacation-helpers.ts

```ts
// ✅ Required pattern — add tenantId to the where clause
const assignment = await prisma.employeeTariffAssignment.findFirst({
  where: {
    employeeId: employee.id,
    isActive: true,
    effectiveFrom: { lte: referenceDate },
    tenantId,  // ADD THIS
  },
  orderBy: { effectiveFrom: "desc" },
})
```

### bookings-repository.ts

```ts
// ✅ Required pattern — add tenantId to function signature and where clause
export async function findEmployeeDayPlan(
  prisma: PrismaClient,
  tenantId: string,       // ADD THIS
  employeeId: string,
  planDate: Date
) {
  return prisma.employeeDayPlan.findFirst({
    where: { employeeId, planDate, tenantId },  // ADD tenantId
    include: { dayPlan: true },
  })
}
```

## Affected Files

| File | Line(s) | Specific Issue |
| ---- | ------- | -------------- |
| `src/lib/services/vacation-helpers.ts` | 74 | `employeeTariffAssignment.findFirst` — tenantId available as parameter but not used in where |
| `src/lib/services/bookings-repository.ts` | 237-246 | `findEmployeeDayPlan` — function signature lacks tenantId; `employeeDayPlan.findFirst` without tenant scope |

### Caller Sites to Update

| Caller File | Line(s) | Change Needed |
| ----------- | ------- | ------------- |
| `src/lib/services/bookings-service.ts` | 163, 173 | Pass `tenantId` to `findEmployeeDayPlan` — verify tenantId is available in `resolveReferenceTime` scope |

## Verification

### Automated

- [ ] `pnpm test` — all existing tests pass
- [ ] `pnpm typecheck` — no new type errors (adding required param will flag any callers that miss it)
- [ ] `pnpm lint` — no lint errors
- [ ] `pnpm vitest run src/trpc/routers/__tests__/bookings-router.test.ts`
- [ ] `pnpm vitest run src/trpc/routers/__tests__/absences-router.test.ts` (vacation-helpers is used by absence flows)
- [ ] `pnpm vitest run src/trpc/routers/__tests__/vacationBalances-router.test.ts`

### Manual

- [ ] Test vacation balance calculation — verify tariff assignment is resolved correctly with the added tenant filter
- [ ] Test derived booking creation (the flow that calls `findEmployeeDayPlan`) — verify reference time resolution still works
- [ ] Verify that system-level tariff assignments (if any have tenantId=null) are correctly excluded by the tenant filter

## What NOT to Change

- Do NOT change `resolveTariff`'s function signature — `tenantId` is already a parameter
- Do NOT change the other queries in `vacation-helpers.ts` that already use `tenantId` correctly (tariff lookup, vacation calculation group lookup)
- Do NOT refactor `bookings-service.ts` beyond passing the tenantId parameter to the updated function
- Do NOT touch other `findFirst`/`findMany` calls in `bookings-repository.ts` that are already correctly scoped

## Notes for Implementation Agent

- For `vacation-helpers.ts`, this is a one-line fix — add `tenantId` to the existing where clause at line 74. The `tenantId` variable is already in scope from the function parameter (verify the exact parameter name).
- For `bookings-repository.ts`, the function signature change will break callers at compile time. Use `pnpm typecheck` to find all callers. Currently only `bookings-service.ts` calls this function (lines 163, 173 in `resolveReferenceTime`).
- In `bookings-service.ts`, verify that `tenantId` is available in the `resolveReferenceTime` function's scope — it may be passed as a parameter or available from the service context.
- The `EmployeeTariffAssignment` model has required `tenantId` — adding it to the where clause is straightforward.
- The `EmployeeDayPlan` model has required `tenantId` — adding it to the where clause is straightforward.
