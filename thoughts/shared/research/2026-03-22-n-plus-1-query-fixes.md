# N+1 Query Pattern Fixes — Research

**Date:** 2026-03-22
**Files analyzed:** 5 service files, 3 repository files, 1 Prisma schema

## Summary

Five N+1 query patterns identified across cron jobs and batch operations. Combined, these produce up to **5N+ sequential DB writes** per batch invocation (where N = number of employees or assignments). The three audit-log patterns alone account for most of the overhead and share the same fix shape: replace sequential `auditLog.log()` calls with a single `prisma.auditLog.createMany()`.

| # | File | Pattern | Queries per batch | Severity |
|---|------|---------|-------------------|----------|
| 1 | employees-service.ts:828-841 | Sequential `auditLog.log()` in bulk tariff assign | N writes | Medium |
| 2 | absences-service.ts:483-497 | Sequential `auditLog.log()` per created absence | N writes | Medium |
| 3 | vacation-service.ts:698-704 | `calculateCappedCarryover` → `resolveTariff` per employee (1-2 queries each) | 1-2N reads | High (cron) |
| 4 | macro-executor.ts:72-110 | Individual `macroAssignment.update` after each execution | N writes | Medium-High (cron) |
| 5 | vacation-service.ts:706-776 | Sequential upsert + audit per employee in `initializeBatch` | 3N writes | High (cron) |

---

## 1. employees-service.ts:828-841 — Bulk Tariff Assign Audit Logs

### Current Code

```typescript
// File: src/lib/services/employees-service.ts lines 827-842
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

### Why It's N+1

Each iteration calls `auditLog.log()` which calls `repo.create()` → `prisma.auditLog.create()`. For a bulk operation on 50 employees, this produces 50 sequential INSERT statements. The business update itself already uses `prisma.employee.updateMany()` (line 821), so the audit trail is the only remaining sequential bottleneck.

### Proposed Fix

Replace the loop with a single `prisma.auditLog.createMany()`:

```typescript
if (validIds.length > 0) {
  const auditData = validIds.map(employeeId => {
    const emp = empMap.get(employeeId)!;
    return {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "employee",
      entityId: employeeId,
      entityName: `${emp.firstName} ${emp.lastName} (${emp.personnelNumber})`,
      changes: undefined,
      metadata: { bulk: true, tariffId: tariffValue } as Prisma.InputJsonValue,
      ipAddress: audit.ipAddress ?? null,
      userAgent: audit.userAgent ?? null,
    };
  });
  await prisma.auditLog.createMany({ data: auditData })
    .catch(err => console.error('[AuditLog] Bulk write failed:', err));
}
```

### Risks / Edge Cases

- **All-or-nothing**: `createMany` is atomic — if one row fails (e.g., FK constraint on userId), all fail. This is acceptable because audit logs should never have FK issues in practice (tenantId/userId come from context). The current code already swallows errors, so partial failure semantics don't change.
- **Prisma `createMany` with JSON**: Prisma supports `Json` fields in `createMany`. Metadata values must be cast to `Prisma.InputJsonValue`.
- **`changes` field**: Currently passes `null`, which maps to `undefined` in createMany (Prisma treats `undefined` as "don't set" and uses the DB default, which is `NULL` for nullable columns). Explicitly pass `null` or use `Prisma.DbNull`.
- **`entityName` construction**: The current code does `emp.firstName + emp.lastName + personnelNumber` — this is computed from the already-fetched `empMap`, so no additional queries needed.

---

## 2. absences-service.ts:483-497 — Absence Creation Audit Logs

### Current Code

```typescript
// File: src/lib/services/absences-service.ts lines 482-497
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

### Why It's N+1

Creating a 2-week absence (10 working days) generates 10 sequential audit log INSERTs. The absence days themselves are already batch-created via `repo.createMany()` at line 428, but the audit trail is sequential.

### Proposed Fix

```typescript
if (audit && createdAbsences.length > 0) {
  const auditData = createdAbsences.map(created => ({
    tenantId,
    userId: audit.userId,
    action: "create",
    entityType: "absence_day",
    entityId: (created as unknown as Record<string, unknown>).id as string,
    entityName: null as string | null,
    ipAddress: audit.ipAddress ?? null,
    userAgent: audit.userAgent ?? null,
  }));
  await prisma.auditLog.createMany({ data: auditData })
    .catch(err => console.error('[AuditLog] Bulk write failed:', err));
}
```

### Risks / Edge Cases

- **`entityId` extraction**: Uses the same `(created as unknown as Record<string, unknown>).id as string` pattern. The `createdAbsences` come from a re-fetch query (`repo.findCreatedAbsences` at line 434), so IDs are guaranteed to exist.
- **No `changes` or `metadata`**: Both are `null`/absent, simplifying the `createMany` data.
- **Typical scale**: Absences are usually 1-20 days per request. Low cardinality, but still worth batching.

---

## 3. vacation-service.ts:698-704 — calculateCappedCarryover Bypassing Pre-Fetched Maps

### Current Code

```typescript
// File: src/lib/services/vacation-service.ts lines 698-704
const carryoverAmount = await calculateCappedCarryover(
  prisma,
  tenantId,
  employee,
  input.year - 1,
  available
)
```

Where `calculateCappedCarryover` (lines 64-127) does:

```typescript
async function calculateCappedCarryover(
  prisma: PrismaClient,
  tenantId: string,
  employee: { id: string; tariffId: string | null },
  prevYear: number,
  available: number,
  defaultMaxCarryover: number = 0
): Promise<number> {
  // Resolve tariff for previous year — 1-2 DB queries per call
  const tariff = await resolveTariff(prisma, employee, prevYear, tenantId)

  // If tariff has capping rule group, use advanced capping — 1-2 more queries
  if (tariff?.vacationCappingRuleGroupId) {
    const cappingGroup = await repo.findCappingGroupWithRules(...)
    if (cappingGroup) {
      const exceptions = await repo.findCappingExceptions(...)
      // ... pure calculation ...
    }
  }
  return calculateCarryover(available, defaultMaxCarryover)
}
```

And `resolveTariff` (vacation-helpers.ts lines 59-103) does:

```typescript
export async function resolveTariff(prisma, employee, year, tenantId) {
  // Query 1: employeeTariffAssignment.findFirst
  const assignment = await prisma.employeeTariffAssignment.findFirst({
    where: { employeeId: employee.id, isActive: true, effectiveFrom: { lte: refDate }, ... },
    include: { tariff: true },
    orderBy: { effectiveFrom: "desc" },
  })
  if (assignment?.tariff) return assignment.tariff

  // Query 2 (fallback): tariff.findFirst
  if (employee.tariffId) {
    const tariff = await prisma.tariff.findFirst({ where: { id: employee.tariffId, tenantId } })
    if (tariff) return tariff
  }
  return null
}
```

### Why It's N+1

The `initializeBatch` function already pre-fetches tariff assignments (lines 642-668) and fallback tariffs (lines 672-685) for the **current year** (`input.year`). But `calculateCappedCarryover` calls `resolveTariff` for `input.year - 1` (prevYear), bypassing those pre-fetched maps entirely. This generates 1-2 queries per employee just for tariff resolution, plus 1-2 more for capping group/exceptions.

**Key observation:** The tariff assignment lookup uses a `refDate` based on the year. For prevYear, the refDate would be `Date.UTC(prevYear, 11, 31)` (end of previous year). The batch pre-fetch uses `input.year` refDate. These are different dates, so the pre-fetched data may not be correct for carryover resolution.

### Proposed Fix

Add a **separate batch pre-fetch for prevYear tariff assignments** before the employee loop:

```typescript
// Pre-fetch tariff assignments for PREVIOUS year (for carryover)
let prevYearTariffMap = new Map<string, Tariff>()
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
  // Also add fallback tariffs for employees without assignments
  for (const emp of employees) {
    if (!prevYearTariffMap.has(emp.id) && emp.tariffId) {
      const fb = fallbackTariffMap.get(emp.tariffId)
      if (fb) prevYearTariffMap.set(emp.id, fb)
    }
  }
}
```

Then modify `calculateCappedCarryover` to accept an optional pre-resolved tariff:

```typescript
async function calculateCappedCarryover(
  prisma: PrismaClient,
  tenantId: string,
  employee: { id: string; tariffId: string | null },
  prevYear: number,
  available: number,
  defaultMaxCarryover: number = 0,
  preResolvedTariff?: Tariff | null  // new optional param
): Promise<number> {
  const tariff = preResolvedTariff !== undefined
    ? preResolvedTariff
    : await resolveTariff(prisma, employee, prevYear, tenantId)
  // ... rest unchanged ...
}
```

**Additionally:** The capping group and exceptions queries inside `calculateCappedCarryover` (lines 77-101) also fire per employee. These should also be batch-pre-fetched:

```typescript
// Pre-fetch capping groups (usually 1-3 per tenant)
const uniqueCappingGroupIds = [...new Set(
  [...prevYearTariffMap.values()]
    .map(t => t.vacationCappingRuleGroupId)
    .filter((id): id is string => !!id)
)]
const cappingGroups = uniqueCappingGroupIds.length > 0
  ? await prisma.vacationCappingRuleGroup.findMany({
      where: { id: { in: uniqueCappingGroupIds }, tenantId },
      include: { cappingRuleLinks: { include: { cappingRule: true } } },
    })
  : []
const cappingGroupMap = new Map(cappingGroups.map(g => [g.id, g]))

// Pre-fetch all capping exceptions for all employees in prevYear
const allExceptions = input.carryover
  ? await prisma.employeeCappingException.findMany({
      where: {
        employeeId: { in: empIds },
        employee: { tenantId },
        isActive: true,
        OR: [{ year: input.year - 1 }, { year: null }],
      },
    })
  : []
const exceptionsByEmployee = new Map<string, typeof allExceptions>()
for (const exc of allExceptions) {
  const list = exceptionsByEmployee.get(exc.employeeId) ?? []
  list.push(exc)
  exceptionsByEmployee.set(exc.employeeId, list)
}
```

### Risks / Edge Cases

- **Different year for tariff resolution**: The prevYear and current year may resolve to different tariffs if an employee changed tariffs between years. The separate pre-fetch correctly handles this by using `prevRefDate`.
- **Fallback tariffs**: The same fallback tariff map (from `employee.tariffId`) can be reused since tariff master data doesn't change by year — only the assignment relationship does.
- **Backwards compatibility**: The single-employee `carryoverFromPreviousYear` function (line 508) also calls `calculateCappedCarryover` without pre-fetched data. The optional parameter preserves this path.
- **Capping group count**: Typically only 1-3 capping groups per tenant, so the batch-fetch is very efficient.

---

## 4. macro-executor.ts:72-110 — Individual macroAssignment.update per Execution

### Current Code

```typescript
// File: src/lib/services/macro-executor.ts lines 65-122
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
        errors.push({ macroId: macro.id, assignmentId: assignment.id, error: ... })
      }
    }
  }
}
// ... identical pattern for monthlyMacros (lines 95-122) ...
```

### Why It's N+1

Each successful macro execution is followed by an individual `macroAssignment.update()`. With 150-200 assignments per tenant, this means 150-200 sequential UPDATE statements just for the `lastExecutedAt`/`lastExecutedDate` tracking. The `executeSingleMacro` itself also does 2-3 DB writes (create execution, run action, update execution), but those are inherently sequential per macro.

### Proposed Fix

**Cannot use simple `updateMany`** because `executeSingleMacro` can throw, and only successful assignments should be updated. The fix is to **collect successful assignment IDs and batch-update after each section**:

```typescript
// Weekly macros
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
        errors.push({ ... })
      }
    }
  }
}
// Batch update all successful weekly assignments
if (successfulWeeklyIds.length > 0) {
  await this.prisma.macroAssignment.updateMany({
    where: { id: { in: successfulWeeklyIds } },
    data: { lastExecutedAt: new Date(), lastExecutedDate: date },
  })
}
```

Same pattern for monthly macros.

### Risks / Edge Cases

- **Crash between execution and batch update**: If the process crashes after executing macros but before the batch update, the `lastExecutedDate` won't be set. On next cron run, those macros would execute again. However, `executeSingleMacro` is idempotent in effect (it creates a new execution record each time), and the `lastExecutedDate` guard at line 68 already handles this — so double-execution is the same risk as the current code (which would also re-execute if it crashed between `executeSingleMacro` and the individual `update`).
- **Timestamp precision**: The current code creates a new `Date()` per assignment. The batch update uses a single `Date()` for all. This is acceptable — the `lastExecutedAt` is a tracking timestamp, not a business-critical value.
- **`updateMany` limitation**: `updateMany` sets the same data for all matched rows. Since `lastExecutedAt` and `lastExecutedDate` are the same for all (same cron run, same date), this is fine.
- **executeSingleMacro must remain sequential**: Each macro execution may have side effects. The executions themselves cannot be parallelized. Only the post-execution timestamp updates are batched.

---

## 5. vacation-service.ts:706-776 — initializeBatch Sequential Upserts + Audit

### Current Code

```typescript
// File: src/lib/services/vacation-service.ts lines 690-782
for (const employee of employees) {
  try {
    // a. Carryover (if requested) — 1 upsert per employee
    if (input.carryover && input.year >= 1901) {
      // ... (covered in pattern #3 above) ...
      if (carryoverAmount > 0) {
        await repo.upsertBalanceCarryoverSimple(prisma, tenantId, employee.id, input.year, carryoverAmount)
      }
    }

    // b. Calculate entitlement (pure, no DB) then upsert — 1 upsert per employee
    const batchBalance = await repo.upsertBalanceEntitlementSimple(
      prisma, tenantId, employee.id, input.year, result.totalEntitlement
    )

    // c. Audit log — 1 INSERT per employee
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

    createdCount++
  } catch {
    // Skip employees with errors, continue with next
  }
}
```

### Why It's N+1

For N employees, this produces:
- Up to N `upsertBalanceCarryoverSimple` calls (carryover upserts)
- N `upsertBalanceEntitlementSimple` calls (entitlement upserts)
- N `auditLog.log` calls (audit INSERTs)

Total: up to **3N** sequential DB writes.

### Proposed Fix

**Phase A — Batch audit logs (easy):**

Collect audit data in the loop, write once after:

```typescript
const auditEntries: Array<{...}> = []

for (const employee of employees) {
  try {
    // ... upserts remain sequential (see note below) ...

    if (audit) {
      auditEntries.push({
        tenantId,
        userId: audit.userId,
        action: "create",
        entityType: ENTITY_TYPE,
        entityId: (batchBalance as unknown as Record<string, unknown>).id as string,
        entityName: `${input.year}`,
        metadata: { batch: true } as Prisma.InputJsonValue,
        ipAddress: audit.ipAddress ?? null,
        userAgent: audit.userAgent ?? null,
      })
    }
    createdCount++
  } catch { /* skip */ }
}

// Batch write audit logs
if (auditEntries.length > 0) {
  await prisma.auditLog.createMany({ data: auditEntries })
    .catch(err => console.error('[AuditLog] Bulk write failed:', err));
}
```

**Phase B — Batch upserts (harder, deferred):**

The upserts use `prisma.vacationBalance.upsert()` which cannot be batched with Prisma's `createMany` (createMany doesn't support upsert semantics). Options:
1. Use raw SQL `INSERT ... ON CONFLICT DO UPDATE` with multiple rows
2. Use `prisma.$transaction` with multiple upserts (still sequential but with connection reuse)
3. Leave as-is — upserts are inherently per-row operations in Prisma

**Recommendation**: Fix audit logs (Phase A) in this PR. The upserts are harder to batch without raw SQL and the risk/benefit is lower (upserts are fast, ~1ms each). Consider Phase B as a follow-up if profiling shows it matters.

### Risks / Edge Cases

- **Audit entityId depends on upsert result**: The audit log needs the `id` from the upsert result. This means audit data must be collected inside the loop after each upsert completes. This is already accounted for in the proposed fix above.
- **Skipped employees**: Employees that throw in the try block won't have audit entries. The `catch {}` skips them, matching current behavior.
- **JSON metadata in createMany**: Same consideration as pattern #1 — cast to `Prisma.InputJsonValue`.

---

## Supporting Patterns Found in Codebase

### Existing `createMany` usage (for reference)

The codebase already uses `createMany` extensively:

| File | Model | Context |
|------|-------|---------|
| `absences-repository.ts:253` | `absenceDay.createMany` | Batch absence creation |
| `booking-type-group-repository.ts:82` | `bookingTypeGroupMember.createMany` | Group member batch |
| `terminal-booking-repository.ts:145` | `rawTerminalBooking.createMany` | Terminal booking ingest |
| `billing-document-repository.ts:234` | `billingDocumentPosition.createMany` | Invoice positions |
| `tariffs-repository.ts:105,120` | `tariffWeekPlan/DayPlan.createMany` | Tariff plan creation |
| `holiday-service.ts:317,413` | `holiday.createMany` | Holiday import |
| `crm-task-repository.ts:174` | `crmTaskAssignee.createMany` | Task assignees |

### Existing `updateMany` usage (for reference)

| File | Model | Context |
|------|-------|---------|
| `employees-service.ts:821` | `employee.updateMany` | Bulk tariff assign (same function as pattern #1) |
| `billing-document-service.ts:103,647` | `billingDocument.updateMany` | Status updates |
| `schedules-repository.ts:136,224` | `scheduleTask/Execution.updateMany` | Batch status |
| `crm-task-repository.ts:196,241` | `crmTask/Assignee.updateMany` | Task updates |

### How `auditLog.log()` works

**Call chain:** `auditLog.log()` (audit-logs-service.ts:168) → `repo.create()` (audit-logs-repository.ts:94) → `prisma.auditLog.create()`.

The `log()` function wraps the create in a try/catch that logs errors but never throws. Callers also add `.catch()` as defense-in-depth. This fire-and-forget pattern means switching to `createMany` preserves the same semantics.

### No existing `auditLog.createMany`

There is currently **zero** usage of `prisma.auditLog.createMany` in the codebase. All audit writes are single-row. This PR would introduce the first batch audit pattern.

**Recommendation**: Add a `createBulk` function to `audit-logs-repository.ts`:

```typescript
export async function createBulk(
  prisma: PrismaClient,
  data: AuditLogCreateInput[]
) {
  return prisma.auditLog.createMany({
    data: data.map(d => ({
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

And a corresponding `logBulk` in `audit-logs-service.ts`:

```typescript
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

---

## Implementation Order

1. **Add `createBulk` / `logBulk` to audit-logs repo/service** — foundation for patterns 1, 2, 5
2. **Fix #1: employees-service.ts** — simplest, self-contained
3. **Fix #2: absences-service.ts** — simple, same shape
4. **Fix #4: macro-executor.ts** — collect IDs, batch updateMany
5. **Fix #3+5: vacation-service.ts initializeBatch** — combined: pre-fetch prevYear tariffs + batch audit logs

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/services/audit-logs-repository.ts` | Add `createBulk()` |
| `src/lib/services/audit-logs-service.ts` | Add `logBulk()` |
| `src/lib/services/employees-service.ts` | Replace audit loop (lines 828-842) with `auditLog.logBulk()` |
| `src/lib/services/absences-service.ts` | Replace audit loop (lines 483-497) with `auditLog.logBulk()` |
| `src/lib/services/macro-executor.ts` | Collect successful IDs, batch `updateMany` after each section |
| `src/lib/services/vacation-service.ts` | (a) Add prevYear tariff pre-fetch, (b) pass pre-resolved tariff to `calculateCappedCarryover`, (c) batch audit logs |
| `src/lib/services/vacation-helpers.ts` | No changes needed (resolveTariff stays as-is for single-employee callers) |
