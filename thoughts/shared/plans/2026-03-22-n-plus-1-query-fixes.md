# N+1 Query Pattern Fixes — Implementation Plan

**Date:** 2026-03-22
**Research:** `thoughts/shared/research/2026-03-22-n-plus-1-query-fixes.md`
**Branch:** `staging`

## Overview / Summary

Five N+1 query patterns across cron jobs and batch operations produce up to 5N sequential DB writes per invocation. The fix is organized into three phases:

1. **Phase 1** — Add `createBulk`/`logBulk` to audit-logs repo/service (foundation)
2. **Phase 2** — Batch audit log writes in employees-service, absences-service, and vacation-service (patterns #1, #2, #5a)
3. **Phase 3** — Batch macro assignment updates and pre-fetch prevYear tariffs (patterns #4, #3)

**Estimated reduction:** From 5N sequential writes/reads to ~N+5 (macro executions remain inherently sequential, but their post-execution tracking is batched).

---

## Phase 1: Audit Logs Bulk Infrastructure

**Goal:** Add `createBulk()` to `audit-logs-repository.ts` and `logBulk()` to `audit-logs-service.ts`. This is the shared foundation for patterns #1, #2, and #5.

### Files to modify

| File | Change |
|------|--------|
| `src/lib/services/audit-logs-repository.ts` | Add `createBulk()` function |
| `src/lib/services/audit-logs-service.ts` | Add `logBulk()` function |

### 1a. audit-logs-repository.ts — Add `createBulk()`

**Location:** After the existing `create()` function (after line 112).

**Add:**
```typescript
export async function createBulk(
  prisma: PrismaClient,
  data: AuditLogCreateInput[]
) {
  return prisma.auditLog.createMany({
    data: data.map((d) => ({
      tenantId: d.tenantId,
      userId: d.userId,
      action: d.action,
      entityType: d.entityType,
      entityId: d.entityId,
      entityName: d.entityName ?? null,
      changes: (d.changes as Prisma.InputJsonValue) ?? undefined,
      metadata: (d.metadata as Prisma.InputJsonValue) ?? undefined,
      ipAddress: d.ipAddress ?? null,
      userAgent: d.userAgent ?? null,
    })),
  })
}
```

**Notes:**
- Reuses the existing `AuditLogCreateInput` interface (lines 81-92) — no new types needed.
- The `Prisma` import already exists on line 6: `import type { PrismaClient, Prisma } from "@/generated/prisma/client"`.
- `changes` and `metadata` use `Prisma.InputJsonValue` cast, matching the existing `create()` function (lines 106-107).

### 1b. audit-logs-service.ts — Add `logBulk()`

**Location:** After the existing `log()` function (after line 182).

**Add:**
```typescript
/**
 * Write multiple audit log entries in a single batch. Fire-and-forget — never throws.
 *
 * Uses prisma.auditLog.createMany() for a single INSERT statement
 * instead of N sequential creates.
 */
export async function logBulk(
  prisma: PrismaClient,
  data: AuditLogCreateInput[]
): Promise<void> {
  if (data.length === 0) return
  try {
    await repo.createBulk(prisma, data)
  } catch (err) {
    console.error("[AuditLog] Failed to write bulk audit logs:", err, {
      count: data.length,
      entityType: data[0]?.entityType,
    })
  }
}
```

**Notes:**
- Follows the same fire-and-forget pattern as `log()` — catches all errors, never throws.
- Short-circuits on empty array to avoid unnecessary DB call.
- Logs `count` and `entityType` for debugging (matches the existing error logging pattern).

### Phase 1 Verification

1. `pnpm typecheck` — confirm no type errors from the new functions.
2. `pnpm test` — confirm no regressions (these are additive functions, nothing calls them yet).
3. Manually verify: the `Prisma` type import already exists in `audit-logs-repository.ts` (line 6).

---

## Phase 2: Batch Audit Log Writes (Patterns #1, #2, #5a)

**Goal:** Replace sequential `auditLog.log()` loops with single `auditLog.logBulk()` calls in three locations.

### Files to modify

| File | Change |
|------|--------|
| `src/lib/services/employees-service.ts` | Replace lines 828-842 |
| `src/lib/services/absences-service.ts` | Replace lines 483-497 |
| `src/lib/services/vacation-service.ts` | Collect audit entries in loop, write after loop |

### 2a. employees-service.ts — Pattern #1: Bulk Tariff Assign Audit Logs

**Location:** Lines 827-842

**Before (current code):**
```typescript
    // Never throws — audit failures must not block the actual operation
    for (const employeeId of validIds) {
      const emp = empMap.get(employeeId)!;
      await auditLog.log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "update",
        entityType: "employee",
        entityId: employeeId,
        entityName: `${emp.firstName} ${emp.lastName} (${emp.personnelNumber})`,
        changes: null,
        metadata: { bulk: true, tariffId: tariffValue },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      }).catch(err => console.error('[AuditLog] Failed:', err));
    }
```

**After (replacement):**
```typescript
    // Never throws — audit failures must not block the actual operation
    await auditLog.logBulk(prisma, validIds.map(employeeId => {
      const emp = empMap.get(employeeId)!;
      return {
        tenantId,
        userId: audit.userId,
        action: "update",
        entityType: "employee",
        entityId: employeeId,
        entityName: `${emp.firstName} ${emp.lastName} (${emp.personnelNumber})`,
        changes: null,
        metadata: { bulk: true, tariffId: tariffValue },
        ipAddress: audit.ipAddress ?? null,
        userAgent: audit.userAgent ?? null,
      };
    }));
```

**Edge cases:**
- `empMap.get(employeeId)!` is safe because `empMap` is built from the same `validIds` at line 797-809.
- `logBulk` handles empty arrays internally, but `validIds.length > 0` is already guarded at line 820.
- The existing `.catch()` on each `log()` call is replaced by the internal try/catch in `logBulk()`.
- `ipAddress` and `userAgent` need `?? null` to satisfy the `AuditLogCreateInput` type (the existing `log()` call accepted `undefined` because it passed through to `create()` which did `?? null` internally).

**Import change:** Add `logBulk` usage — no new import needed since `auditLog` is already imported as `import * as auditLog from "./audit-logs-service"` (verify this import exists).

### 2b. absences-service.ts — Pattern #2: Absence Creation Audit Logs

**Location:** Lines 482-497

**Before (current code):**
```typescript
  // Never throws — audit failures must not block the actual operation
  if (audit && createdAbsences.length > 0) {
    for (const created of createdAbsences) {
      await auditLog.log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "create",
        entityType: "absence_day",
        entityId: (created as unknown as Record<string, unknown>).id as string,
        entityName: null,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      }).catch(err => console.error('[AuditLog] Failed:', err));
    }
  }
```

**After (replacement):**
```typescript
  // Never throws — audit failures must not block the actual operation
  if (audit && createdAbsences.length > 0) {
    await auditLog.logBulk(prisma, createdAbsences.map(created => ({
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "absence_day",
      entityId: (created as unknown as Record<string, unknown>).id as string,
      entityName: null,
      ipAddress: audit.ipAddress ?? null,
      userAgent: audit.userAgent ?? null,
    })));
  }
```

**Edge cases:**
- `entityId` extraction: The `(created as unknown as Record<string, unknown>).id as string` pattern is preserved exactly as-is. The `createdAbsences` come from a re-fetch at line 434, so IDs are guaranteed.
- `changes` field is omitted (not passed), which maps to `undefined` in the `AuditLogCreateInput` — the `createBulk` function handles this with `?? undefined` for the JSON field.
- Typical scale: 1-20 absence days per request. Low cardinality but still worth batching.

### 2c. vacation-service.ts — Pattern #5a: initializeBatch Audit Logs

**Location:** Lines 690-782 (the `for (const employee of employees)` loop)

This is more involved because the audit data depends on the upsert result (`batchBalance.id`) inside the loop. We collect audit entries in an array and write once after the loop.

**Before (lines 762-776 inside the loop):**
```typescript
      // Never throws — audit failures must not block the actual operation
      if (audit) {
        await auditLog.log(prisma, {
          tenantId,
          userId: audit.userId,
          action: "create",
          entityType: ENTITY_TYPE,
          entityId: (batchBalance as unknown as Record<string, unknown>).id as string,
          entityName: `${input.year}`,
          changes: null,
          metadata: { batch: true },
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent,
        }).catch(err => console.error('[AuditLog] Failed:', err));
      }
```

**After — Step 1: Declare array before the loop (before line 690):**
```typescript
  const auditEntries: AuditLogCreateInput[] = []
```

This requires adding an import for `AuditLogCreateInput`:
```typescript
import type { AuditLogCreateInput } from "./audit-logs-service"
```
(Verify `AuditLogCreateInput` is re-exported from `audit-logs-service.ts` — yes, it is at line 12.)

**After — Step 2: Replace lines 762-776 inside the loop:**
```typescript
      if (audit) {
        auditEntries.push({
          tenantId,
          userId: audit.userId,
          action: "create",
          entityType: ENTITY_TYPE,
          entityId: (batchBalance as unknown as Record<string, unknown>).id as string,
          entityName: `${input.year}`,
          metadata: { batch: true },
          ipAddress: audit.ipAddress ?? null,
          userAgent: audit.userAgent ?? null,
        })
      }
```

**After — Step 3: Add bulk write after the loop (after line 782, before the return):**
```typescript
  // Batch write all collected audit entries
  if (audit && auditEntries.length > 0) {
    await auditLog.logBulk(prisma, auditEntries)
  }
```

**Edge cases:**
- Employees that throw in the try/catch block won't have audit entries (the `push` happens after the upsert succeeds). This matches current behavior where the `log()` call is skipped on error.
- `entityId` still depends on each upsert result — the array collects after each successful upsert.
- The `changes: null` field is omitted from the push data — `createBulk` treats undefined `changes` as DB NULL, which is the same as passing `null`.

### Phase 2 Verification

1. `pnpm typecheck` — confirm no type errors.
2. `pnpm vitest run src/trpc/routers/__tests__/employees-router.test.ts` — existing `bulkAssignTariff` tests pass. Note: these tests mock Prisma and don't assert on audit log writes, so they should pass unchanged.
3. `pnpm vitest run src/trpc/routers/__tests__/absences.test.ts` — existing tests pass.
4. `pnpm test` — full suite passes.
5. Manual review: confirm `logBulk` is called with correct data shape in each location.

---

## Phase 3: Macro Batch Updates and Vacation Tariff Pre-fetch (Patterns #4, #3)

### Files to modify

| File | Change |
|------|--------|
| `src/lib/services/macro-executor.ts` | Collect successful IDs, batch `updateMany` after each section |
| `src/lib/services/vacation-service.ts` | Add prevYear tariff pre-fetch + capping pre-fetch, pass to `calculateCappedCarryover` |

### 3a. macro-executor.ts — Pattern #4: Batch Assignment Updates

**Location:** Lines 65-122 (the `executeDueMacros` method)

**Strategy:** Collect successful assignment IDs during the loop, then batch-update `lastExecutedAt`/`lastExecutedDate` with a single `updateMany` after each section (weekly/monthly).

**Before (weekly section, lines 65-87):**
```typescript
    for (const macro of weeklyMacros) {
      for (const assignment of macro.assignments) {
        if (!assignment.isActive) continue
        if (assignment.lastExecutedDate?.toISOString().slice(0, 10) === todayStr) continue
        if (assignment.executionDay === weekday) {
          try {
            await this.executeSingleMacro(macro, "scheduled", assignment.id)
            await this.prisma.macroAssignment.update({
              where: { id: assignment.id },
              data: { lastExecutedAt: new Date(), lastExecutedDate: date },
            })
            executed++
          } catch (err) {
            failed++
            errors.push({
              macroId: macro.id,
              assignmentId: assignment.id,
              error: err instanceof Error ? err.message : String(err),
            })
          }
        }
      }
    }
```

**After (weekly section):**
```typescript
    const successfulWeeklyIds: string[] = []
    for (const macro of weeklyMacros) {
      for (const assignment of macro.assignments) {
        if (!assignment.isActive) continue
        if (assignment.lastExecutedDate?.toISOString().slice(0, 10) === todayStr) continue
        if (assignment.executionDay === weekday) {
          try {
            await this.executeSingleMacro(macro, "scheduled", assignment.id)
            successfulWeeklyIds.push(assignment.id)
            executed++
          } catch (err) {
            failed++
            errors.push({
              macroId: macro.id,
              assignmentId: assignment.id,
              error: err instanceof Error ? err.message : String(err),
            })
          }
        }
      }
    }
    if (successfulWeeklyIds.length > 0) {
      await this.prisma.macroAssignment.updateMany({
        where: { id: { in: successfulWeeklyIds } },
        data: { lastExecutedAt: new Date(), lastExecutedDate: date },
      })
    }
```

**Before (monthly section, lines 95-122):**
```typescript
    for (const macro of monthlyMacros) {
      for (const assignment of macro.assignments) {
        if (!assignment.isActive) continue
        if (assignment.lastExecutedDate?.toISOString().slice(0, 10) === todayStr) continue
        // Monthly day fallback: if configured day exceeds month length, use last day
        let effectiveDay = assignment.executionDay
        if (effectiveDay > lastDayOfMonth) {
          effectiveDay = lastDayOfMonth
        }
        if (effectiveDay === dayOfMonth) {
          try {
            await this.executeSingleMacro(macro, "scheduled", assignment.id)
            await this.prisma.macroAssignment.update({
              where: { id: assignment.id },
              data: { lastExecutedAt: new Date(), lastExecutedDate: date },
            })
            executed++
          } catch (err) {
            failed++
            errors.push({
              macroId: macro.id,
              assignmentId: assignment.id,
              error: err instanceof Error ? err.message : String(err),
            })
          }
        }
      }
    }
```

**After (monthly section):**
```typescript
    const successfulMonthlyIds: string[] = []
    for (const macro of monthlyMacros) {
      for (const assignment of macro.assignments) {
        if (!assignment.isActive) continue
        if (assignment.lastExecutedDate?.toISOString().slice(0, 10) === todayStr) continue
        let effectiveDay = assignment.executionDay
        if (effectiveDay > lastDayOfMonth) {
          effectiveDay = lastDayOfMonth
        }
        if (effectiveDay === dayOfMonth) {
          try {
            await this.executeSingleMacro(macro, "scheduled", assignment.id)
            successfulMonthlyIds.push(assignment.id)
            executed++
          } catch (err) {
            failed++
            errors.push({
              macroId: macro.id,
              assignmentId: assignment.id,
              error: err instanceof Error ? err.message : String(err),
            })
          }
        }
      }
    }
    if (successfulMonthlyIds.length > 0) {
      await this.prisma.macroAssignment.updateMany({
        where: { id: { in: successfulMonthlyIds } },
        data: { lastExecutedAt: new Date(), lastExecutedDate: date },
      })
    }
```

**Edge cases:**
- **Crash between execution and batch update:** If the process crashes after executing macros but before the batch `updateMany`, macros would re-execute on the next cron run. This is the same risk as the current code (crash between `executeSingleMacro` and individual `update`). The `lastExecutedDate` guard at line 68 already handles idempotency for same-day re-runs.
- **Timestamp precision:** The current code creates a new `Date()` per assignment. The batch uses a single `Date()` for all. This is acceptable — `lastExecutedAt` is a tracking timestamp, not business-critical.
- **`updateMany` sets same data for all rows:** Since `lastExecutedAt` and `lastExecutedDate` are the same for all (same cron run, same date), this is correct.
- **executeSingleMacro must remain sequential:** Each macro execution may have side effects (creates execution records, runs actions). Only the post-execution timestamp updates are batched.

### 3b. vacation-service.ts — Pattern #3: Pre-fetch Previous Year Tariffs

**Location:** `initializeBatch()` function, between the existing pre-fetch block (lines 642-685) and the employee loop (line 690).

**Strategy:** Add a separate batch pre-fetch for prevYear tariff assignments, capping groups, and capping exceptions. Pass the pre-resolved tariff to `calculateCappedCarryover` via a new optional parameter.

**Step 1: Add prevYear tariff pre-fetch (insert after line 685, before line 687):**

```typescript
  // Pre-fetch tariff assignments for PREVIOUS year (for carryover calculation)
  // The current year tariff pre-fetch above uses tariffRefDate = end of input.year.
  // Carryover needs tariffs as of end of (input.year - 1), which may differ.
  let prevYearTariffMap = new Map<string, typeof fallbackTariffs[number]>()
  let cappingGroupMap = new Map<string, Awaited<ReturnType<typeof repo.findCappingGroupWithRules>> & {}>()
  let exceptionsByEmployee = new Map<string, Awaited<ReturnType<typeof repo.findCappingExceptions>>>()

  if (input.carryover && input.year >= 1901) {
    let prevRefDate = new Date(Date.UTC(input.year - 1, 11, 31))
    if (prevRefDate > now) prevRefDate = now

    const prevAssignments = await prisma.employeeTariffAssignment.findMany({
      where: {
        employeeId: { in: empIds },
        isActive: true,
        effectiveFrom: { lte: prevRefDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: prevRefDate } }],
      },
      include: { tariff: true },
      orderBy: { effectiveFrom: "desc" },
    })
    for (const ta of prevAssignments) {
      if (!prevYearTariffMap.has(ta.employeeId) && ta.tariff) {
        prevYearTariffMap.set(ta.employeeId, ta.tariff)
      }
    }
    // Add fallback tariffs for employees without prevYear assignments
    for (const emp of employees) {
      if (!prevYearTariffMap.has(emp.id) && emp.tariffId) {
        const fb = fallbackTariffMap.get(emp.tariffId)
        if (fb) prevYearTariffMap.set(emp.id, fb)
      }
    }

    // Pre-fetch capping groups (usually 1-3 per tenant)
    const uniqueCappingGroupIds = [
      ...new Set(
        [...prevYearTariffMap.values()]
          .map((t) => t.vacationCappingRuleGroupId)
          .filter((id): id is string => !!id)
      ),
    ]
    if (uniqueCappingGroupIds.length > 0) {
      const cappingGroups = await prisma.vacationCappingRuleGroup.findMany({
        where: { id: { in: uniqueCappingGroupIds }, tenantId },
        include: {
          cappingRuleLinks: {
            include: { cappingRule: true },
          },
        },
      })
      for (const g of cappingGroups) {
        cappingGroupMap.set(g.id, g)
      }
    }

    // Pre-fetch all capping exceptions for all employees in prevYear
    const allExceptions = await prisma.employeeCappingException.findMany({
      where: {
        employeeId: { in: empIds },
        employee: { tenantId },
        isActive: true,
        OR: [{ year: input.year - 1 }, { year: null }],
      },
    })
    for (const exc of allExceptions) {
      const list = exceptionsByEmployee.get(exc.employeeId) ?? []
      list.push(exc)
      exceptionsByEmployee.set(exc.employeeId, list)
    }
  }
```

**Step 2: Modify `calculateCappedCarryover` signature (line 64):**

**Before:**
```typescript
async function calculateCappedCarryover(
  prisma: PrismaClient,
  tenantId: string,
  employee: { id: string; tariffId: string | null },
  prevYear: number,
  available: number,
  defaultMaxCarryover: number = 0
): Promise<number> {
```

**After:**
```typescript
async function calculateCappedCarryover(
  prisma: PrismaClient,
  tenantId: string,
  employee: { id: string; tariffId: string | null },
  prevYear: number,
  available: number,
  defaultMaxCarryover: number = 0,
  prefetched?: {
    tariff?: typeof import("@/generated/prisma/client").Prisma.TariffGetPayload<{}> | null
    cappingGroup?: Awaited<ReturnType<typeof repo.findCappingGroupWithRules>> | null
    exceptions?: Awaited<ReturnType<typeof repo.findCappingExceptions>>
  }
): Promise<number> {
```

**Note on typing:** The exact types will depend on what Prisma generates. In practice, we should use the inferred types from the existing repo functions. The simplest approach is to use a generic shape or `any` for the prefetched parameter and let TypeScript infer. A cleaner alternative:

```typescript
  prefetched?: {
    tariff?: { vacationCappingRuleGroupId: string | null; [key: string]: unknown } | null
    cappingGroup?: Awaited<ReturnType<typeof repo.findCappingGroupWithRules>> | null
    exceptions?: Awaited<ReturnType<typeof repo.findCappingExceptions>>
  }
```

**Step 3: Modify `calculateCappedCarryover` body (lines 72-127):**

**Before (lines 72-73):**
```typescript
  // Resolve tariff for previous year
  const tariff = await resolveTariff(prisma, employee, prevYear, tenantId)
```

**After:**
```typescript
  // Resolve tariff for previous year (use pre-fetched if available)
  const tariff = prefetched?.tariff !== undefined
    ? prefetched.tariff
    : await resolveTariff(prisma, employee, prevYear, tenantId)
```

**Before (lines 76-81):**
```typescript
  if (tariff?.vacationCappingRuleGroupId) {
    const cappingGroup = await repo.findCappingGroupWithRules(
      prisma,
      tenantId,
      tariff.vacationCappingRuleGroupId
    )
```

**After:**
```typescript
  if (tariff?.vacationCappingRuleGroupId) {
    const cappingGroup = prefetched?.cappingGroup !== undefined
      ? prefetched.cappingGroup
      : await repo.findCappingGroupWithRules(
          prisma,
          tenantId,
          tariff.vacationCappingRuleGroupId
        )
```

**Before (lines 96-101):**
```typescript
      // Load employee exceptions
      const exceptions = await repo.findCappingExceptions(
        prisma,
        tenantId,
        employee.id,
        prevYear
      )
```

**After:**
```typescript
      // Load employee exceptions (use pre-fetched if available)
      const exceptions = prefetched?.exceptions !== undefined
        ? prefetched.exceptions
        : await repo.findCappingExceptions(
            prisma,
            tenantId,
            employee.id,
            prevYear
          )
```

**Step 4: Update the call site in the employee loop (line 698-704):**

**Before:**
```typescript
            const carryoverAmount = await calculateCappedCarryover(
              prisma,
              tenantId,
              employee,
              input.year - 1,
              available
            )
```

**After:**
```typescript
            const prevTariff = prevYearTariffMap.get(employee.id) ?? null
            const prevCappingGroup = prevTariff?.vacationCappingRuleGroupId
              ? cappingGroupMap.get(prevTariff.vacationCappingRuleGroupId) ?? null
              : null
            const prevExceptions = exceptionsByEmployee.get(employee.id) ?? []

            const carryoverAmount = await calculateCappedCarryover(
              prisma,
              tenantId,
              employee,
              input.year - 1,
              available,
              0,
              {
                tariff: prevTariff,
                cappingGroup: prevCappingGroup,
                exceptions: prevExceptions,
              }
            )
```

**Backward compatibility:** The single-employee `carryoverFromPreviousYear` function (around line 508) also calls `calculateCappedCarryover` without the `prefetched` parameter. Since it's optional with `undefined` default, this call continues to work unchanged — it falls back to individual DB queries, which is fine for single-employee operations.

### Phase 3 Verification

1. `pnpm typecheck` — confirm no type errors, especially around the `prefetched` parameter types.
2. `pnpm vitest run src/app/api/cron/execute-macros/__tests__/route.test.ts` — existing cron route tests pass (they mock `MacroExecutor` entirely).
3. `pnpm vitest run src/trpc/routers/__tests__/vacation-router.test.ts` — existing vacation tests pass.
4. `pnpm vitest run src/trpc/routers/__tests__/vacation-service.test.ts` — existing vacation service tests pass.
5. `pnpm test` — full suite passes.

---

## Success Criteria

| Criterion | How to verify |
|-----------|---------------|
| All 5 N+1 patterns eliminated | Code review: no sequential `auditLog.log()` in loops, no per-assignment `macroAssignment.update()`, no per-employee `resolveTariff` in batch |
| `pnpm typecheck` passes | Run typecheck (baseline ~1463 pre-existing errors — count must not increase) |
| `pnpm test` passes | Full test suite green |
| `pnpm lint` passes | No new lint errors |
| Backward compatibility | Single-employee `carryoverFromPreviousYear` still works without pre-fetched data |
| Fire-and-forget semantics preserved | `logBulk()` never throws; callers don't need `.catch()` |

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **`createMany` is all-or-nothing** | If one audit row fails (e.g., FK constraint), all audit rows for that batch fail | Acceptable: audit logs should never have FK issues (tenantId/userId come from validated context). The existing code already swallows errors per-row, so partial failure semantics don't meaningfully change. |
| **Prisma JSON field in `createMany`** | `metadata` and `changes` fields must be cast to `Prisma.InputJsonValue` | Already handled in the `createBulk` implementation — same pattern as existing `create()`. |
| **Macro re-execution on crash** | If process crashes after executing macros but before batch `updateMany`, macros re-execute on next cron run | Same risk as current code. `executeSingleMacro` is idempotent (creates new execution record each time). The `lastExecutedDate` guard already prevents same-day duplicates. |
| **PrevYear tariff pre-fetch: incorrect tariff for edge cases** | Employee changed tariffs mid-year; the pre-fetch using `prevRefDate = end of prevYear` may pick a different tariff than expected | The pre-fetch uses the exact same logic as `resolveTariff` (most recent assignment with `effectiveFrom <= refDate` and `effectiveTo >= refDate || null`). The only difference is batch vs. individual fetch. Edge case correctness is preserved. |
| **Large batch size for `createMany`** | If 500+ employees, the single INSERT may be large | PostgreSQL handles multi-row INSERTs well up to ~10K rows. Terp tenants typically have 50-300 employees. Not a concern. |
| **Type complexity in `prefetched` parameter** | Inferred Prisma types can be verbose | Use `Awaited<ReturnType<typeof repo.X>>` pattern for clean typing. If types become unwieldy during implementation, simplify to explicit interface. |
| **Missing test coverage for batch audit** | No existing tests assert on audit log creation in `bulkAssignTariff`, absence creation, or `initializeBatch` | Low risk: the audit log path is fire-and-forget. The behavioral change (N writes -> 1 write) is transparent to callers. Consider adding a unit test for `logBulk` itself as a follow-up. |

---

## Implementation Order Summary

1. **Phase 1** (foundation): `audit-logs-repository.ts` + `audit-logs-service.ts` — add `createBulk()` / `logBulk()`
2. **Phase 2** (easy wins): `employees-service.ts` + `absences-service.ts` + `vacation-service.ts` audit loop
3. **Phase 3** (more involved): `macro-executor.ts` batch updates + `vacation-service.ts` prevYear pre-fetch

Each phase is independently deployable and testable. Phase 2 depends on Phase 1. Phase 3 is independent of Phase 2 (the macro fix doesn't touch audit logs).

## Deferred Work (Phase B from research)

The sequential `upsertBalanceCarryoverSimple` and `upsertBalanceEntitlementSimple` calls in `initializeBatch` (pattern #5b) are intentionally deferred. Prisma does not support batch upserts natively — batching these would require raw SQL `INSERT ... ON CONFLICT DO UPDATE` with multiple rows. The risk/benefit ratio is low: individual upserts are ~1ms each, and the audit log batching (pattern #5a) already eliminates the larger overhead. Consider this as a follow-up if profiling shows it matters.
