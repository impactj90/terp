# AUDIT-002 — MonthlyCalcService: Optional tenantId allows cross-tenant data access

| Field               | Value                                                                |
| ------------------- | -------------------------------------------------------------------- |
| **Priority**        | P0                                                                    |
| **Category**        | Tenant Isolation                                                      |
| **Severity**        | CRITICAL                                                              |
| **Audit Source**    | Fresh codebase scan 2026-03-23                                        |
| **Estimated Scope** | 2 service files, ~14 read queries + 3 write operations                |

---

## Problem

`MonthlyCalcService` accepts `tenantId` as an **optional** constructor parameter. When omitted, all internal Prisma queries run without any tenant filter — meaning employee data, daily values, absence days, tariffs, and monthly values from ANY tenant can be read and written. Six call sites in `monthly-values-service.ts` create `MonthlyCalcService` without passing `tenantId`, making every downstream query cross-tenant capable.

## Root Cause

The constructor uses `tenantId?: string` (optional), and internal queries use a conditional spread `...(this.tenantId ? { tenantId: this.tenantId } : {})` which evaluates to an empty object when tenantId is undefined — effectively removing the tenant filter:

```ts
// ❌ Current pattern in monthly-calc.ts
export class MonthlyCalcService {
  constructor(private prisma: PrismaClient, private tenantId?: string) {}  // optional!

  // Every internal query uses this pattern:
  await this.prisma.employee.findMany({
    where: {
      id: { in: employeeIds },
      ...(this.tenantId ? { tenantId: this.tenantId } : {}),  // NO-OP when undefined
    },
  })
}

// ❌ Current callers in monthly-values-service.ts (6 sites):
const calc = new MonthlyCalcService(prisma)  // tenantId omitted!
```

## Required Fix

1. Make `tenantId` a **required** constructor parameter
2. Remove conditional spreads — use `tenantId` directly in all where clauses
3. Update all callers to pass `tenantId`
4. Add `tenantId` to the 3 `updateMany` calls on MonthlyValue

```ts
// ✅ Required pattern — monthly-calc.ts
export class MonthlyCalcService {
  constructor(private prisma: PrismaClient, private tenantId: string) {}  // required!

  // All queries use tenantId directly:
  await this.prisma.employee.findMany({
    where: { id: { in: employeeIds }, tenantId: this.tenantId },
  })
}

// ✅ Required callers — monthly-values-service.ts:
const calc = new MonthlyCalcService(prisma, tenantId)  // tenantId always passed
```

For the write operations:
```ts
// ✅ Required pattern — updateMany with tenantId
await this.prisma.monthlyValue.updateMany({
  where: { employeeId, year, month, isClosed: false, tenantId: this.tenantId },
  data: { ... },
})
```

## Affected Files

| File | Line(s) | Specific Issue |
| ---- | ------- | -------------- |
| `src/lib/services/monthly-calc.ts` | 54 | Constructor: `tenantId?: string` — optional parameter |
| `src/lib/services/monthly-calc.ts` | 127-131 | `employee.findMany` — conditional tenantId spread |
| `src/lib/services/monthly-calc.ts` | 288-289 | `employee.findFirst` — conditional tenantId spread |
| `src/lib/services/monthly-calc.ts` | 304 | `tariff.findUnique` — no tenantId at all |
| `src/lib/services/monthly-calc.ts` | 308-313 | `dailyValue.findMany` — conditional tenantId spread |
| `src/lib/services/monthly-calc.ts` | 314-319 | `absenceDay.findMany` — conditional tenantId spread |
| `src/lib/services/monthly-calc.ts` | 339 | `monthlyValue.updateMany` — no tenantId in where |
| `src/lib/services/monthly-calc.ts` | 383 | `monthlyValue.updateMany` — no tenantId in where |
| `src/lib/services/monthly-calc.ts` | 416 | `monthlyValue.updateMany` — no tenantId in where |
| `src/lib/services/monthly-calc.ts` | 448-451 | `monthlyValue.findMany` — conditional tenantId spread |
| `src/lib/services/monthly-calc.ts` | 467-472 | `dailyValue.findMany` — conditional tenantId spread |
| `src/lib/services/monthly-calc.ts` | 547-548 | `employee.findFirst` — conditional tenantId spread |
| `src/lib/services/monthly-calc.ts` | 557-562 | `dailyValue.findMany` — conditional tenantId spread |
| `src/lib/services/monthly-calc.ts` | 563-568 | `absenceDay.findMany` — conditional tenantId spread |
| `src/lib/services/monthly-calc.ts` | 571 | `tariff.findUnique` — no tenantId at all |
| `src/lib/services/monthly-values-service.ts` | 43 | `new MonthlyCalcService(prisma)` — tenantId omitted |
| `src/lib/services/monthly-values-service.ts` | 52 | `new MonthlyCalcService(prisma)` — tenantId omitted |
| `src/lib/services/monthly-values-service.ts` | 206 | `new MonthlyCalcService(prisma)` — tenantId omitted |
| `src/lib/services/monthly-values-service.ts` | 268 | `new MonthlyCalcService(prisma)` — tenantId omitted |
| `src/lib/services/monthly-values-service.ts` | 329 | `new MonthlyCalcService(prisma)` — tenantId omitted |
| `src/lib/services/monthly-values-service.ts` | 457 | `new MonthlyCalcService(prisma)` — tenantId omitted |

## Verification

### Automated

- [ ] `pnpm test` — all existing tests pass
- [ ] `pnpm typecheck` — no new type errors (making param required will surface any callers that omit it)
- [ ] `pnpm lint` — no lint errors
- [ ] `pnpm vitest run src/trpc/routers/__tests__/monthlyValues-router.test.ts` (if exists)

### Manual

- [ ] Verify that all 6 callers in `monthly-values-service.ts` have `tenantId` available in their scope
- [ ] Verify the 2 callers that already pass tenantId (`employees-service.ts:898`, `recalc.ts:34`) still compile
- [ ] Test monthly value calculation for a single employee — verify results unchanged
- [ ] Test monthly close/reopen operations — verify they only affect the correct tenant's records

## What NOT to Change

- Do NOT change the calculation logic itself — only add tenant scoping to queries
- Do NOT change function signatures of the public methods (`calculate`, `closeMonth`, `reopenMonth`, etc.) beyond what's needed to thread tenantId
- Do NOT touch `employees-service.ts` or `recalc.ts` — they already pass tenantId correctly
- Do NOT add tenantId to `tariff.findUnique({ where: { id } })` since findUnique requires the PK only — change to `findFirst({ where: { id, tenantId } })` instead

## Notes for Implementation Agent

- The `tenantId` is available in all 6 `monthly-values-service.ts` call sites — verify by checking each function's parameters. These service functions are called from tRPC routers that inject `tenantId` from context.
- The `tariff.findUnique({ where: { id } })` calls (lines 304, 571) cannot have tenantId added to `findUnique` (Prisma requires unique fields only). Change these to `findFirst({ where: { id, tenantId } })`.
- After making `tenantId` required, TypeScript will flag any remaining callers that don't pass it — use `pnpm typecheck` to find them all.
- Remove ALL conditional spread patterns `...(this.tenantId ? { tenantId: this.tenantId } : {})` and replace with direct `tenantId: this.tenantId`.
- The Tariff model has an optional `tenantId` (`String?`) — using `findFirst({ where: { id, tenantId } })` will correctly exclude system tariffs (tenantId=null), which is the desired behavior for tenant-scoped calculations.
