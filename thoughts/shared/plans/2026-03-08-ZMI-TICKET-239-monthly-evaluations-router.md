# Plan: ZMI-TICKET-239 -- Monthly Evaluations Router

**Date**: 2026-03-08
**Ticket**: ZMI-TICKET-239
**Branch**: staging
**Depends on**: ZMI-TICKET-238 (MonthlyCalcService), ZMI-TICKET-236 (dailyValues router pattern), ZMI-TICKET-203 (auth middleware)

---

## Overview

Build a `monthlyValues` tRPC router with 8 procedures, merging Go's `monthly_value.go` handler (6 flat endpoints) and `monthlyeval.go` handler (6 employee-scoped endpoints). Migrate two frontend hook files (`use-monthly-values.ts` and `use-admin-monthly-values.ts`) from legacy REST to tRPC. Add comprehensive tests.

**Files to create:**
- `apps/web/src/server/routers/monthlyValues.ts` -- tRPC router (8 procedures)
- `apps/web/src/server/routers/__tests__/monthlyValues.test.ts` -- Router unit tests

**Files to modify:**
- `apps/web/src/server/root.ts` -- Register new router
- `apps/web/src/hooks/api/use-monthly-values.ts` -- Migrate to tRPC
- `apps/web/src/hooks/api/use-admin-monthly-values.ts` -- Migrate to tRPC
- `apps/web/src/hooks/api/index.ts` -- Update exports

---

## Phase 1: tRPC Router -- Schema Definitions and Helper Functions

**Goal**: Create the router file with all Zod schemas, permission constants, data scope helpers, and mapper functions. No procedures yet -- just the foundation.

**File**: `apps/web/src/server/routers/monthlyValues.ts`

### 1.1 Imports

Follow the exact pattern from `apps/web/src/server/routers/dailyValues.ts` (lines 1-26):

```typescript
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { Decimal } from "@prisma/client/runtime/client"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import {
  requirePermission,
  requireEmployeePermission,
  applyDataScope,
  type DataScope,
} from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
import { MonthlyCalcService } from "../services/monthly-calc"
import type { MonthSummary } from "../services/monthly-calc.types"
```

### 1.2 Permission Constants

Resolve permission IDs at module level, matching Go route registration (`apps/api/internal/handler/routes.go:571-599,1641-1661`):

```typescript
const REPORTS_VIEW = permissionIdByKey("reports.view")!
const CALCULATE_MONTH = permissionIdByKey("booking_overview.calculate_month")!
const TIME_TRACKING_VIEW_OWN = permissionIdByKey("time_tracking.view_own")!
const TIME_TRACKING_VIEW_ALL = permissionIdByKey("time_tracking.view_all")!
```

**Permission mapping from Go to tRPC:**
| Procedure | Go Permission | tRPC Middleware |
|---|---|---|
| `forEmployee` | `reports.view` (in Go), employee-scoped | `requireEmployeePermission(TIME_TRACKING_VIEW_OWN, TIME_TRACKING_VIEW_ALL)` |
| `yearOverview` | `reports.view` (in Go), employee-scoped | `requireEmployeePermission(TIME_TRACKING_VIEW_OWN, TIME_TRACKING_VIEW_ALL)` |
| `list` | `reports.view` | `requirePermission(REPORTS_VIEW)` + `applyDataScope()` |
| `getById` | `reports.view` | `requirePermission(REPORTS_VIEW)` |
| `close` | `reports.view` | `requirePermission(REPORTS_VIEW)` |
| `reopen` | `reports.view` | `requirePermission(REPORTS_VIEW)` |
| `closeBatch` | `reports.view` | `requirePermission(REPORTS_VIEW)` |
| `recalculate` | `booking_overview.calculate_month` | `requirePermission(CALCULATE_MONTH)` |

**Note on forEmployee/yearOverview permissions**: The ticket says `requireEmployeePermission("monthly_values.read_own", "monthly_values.read")` but these permissions do not exist in the permission catalog (`apps/web/src/server/lib/permission-catalog.ts`). The Go routes use `reports.view`, but the `dailyValues.list` uses `requireEmployeePermission(time_tracking.view_own, time_tracking.view_all)` for per-employee data. Follow the dailyValues pattern since it is the closest existing analog and those permissions exist.

### 1.3 Output Schemas

**MonthSummary output schema** (for `forEmployee`, `yearOverview`):

```typescript
const monthSummaryOutputSchema = z.object({
  employeeId: z.string().uuid(),
  year: z.number().int(),
  month: z.number().int(),
  totalGrossTime: z.number().int(),
  totalNetTime: z.number().int(),
  totalTargetTime: z.number().int(),
  totalOvertime: z.number().int(),
  totalUndertime: z.number().int(),
  totalBreakTime: z.number().int(),
  flextimeStart: z.number().int(),
  flextimeChange: z.number().int(),
  flextimeEnd: z.number().int(),
  flextimeCarryover: z.number().int(),
  vacationTaken: z.number(), // Decimal serialized as number
  sickDays: z.number().int(),
  otherAbsenceDays: z.number().int(),
  workDays: z.number().int(),
  daysWithErrors: z.number().int(),
  isClosed: z.boolean(),
  closedAt: z.date().nullable(),
  closedBy: z.string().uuid().nullable(),
  reopenedAt: z.date().nullable(),
  reopenedBy: z.string().uuid().nullable(),
  warnings: z.array(z.string()),
})
```

**MonthlyValue output schema** (for `list`, `getById`, `close`, `reopen`):

```typescript
const employeeSummarySchema = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  personnelNumber: z.string(),
  isActive: z.boolean(),
  departmentId: z.string().uuid().nullable(),
}).nullable()

const monthlyValueOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  year: z.number().int(),
  month: z.number().int(),
  status: z.string(), // "calculated" or "closed"
  totalGrossTime: z.number().int(),
  totalNetTime: z.number().int(),
  totalTargetTime: z.number().int(),
  totalOvertime: z.number().int(),
  totalUndertime: z.number().int(),
  totalBreakTime: z.number().int(),
  balanceMinutes: z.number().int(), // computed: overtime - undertime
  flextimeStart: z.number().int(),
  flextimeChange: z.number().int(),
  flextimeEnd: z.number().int(),
  flextimeCarryover: z.number().int(),
  vacationTaken: z.number(),
  sickDays: z.number().int(),
  otherAbsenceDays: z.number().int(),
  workDays: z.number().int(),
  daysWithErrors: z.number().int(),
  closedAt: z.date().nullable(),
  closedBy: z.string().uuid().nullable(),
  reopenedAt: z.date().nullable(),
  reopenedBy: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  employee: employeeSummarySchema.optional(),
})
```

### 1.4 Input Schemas

```typescript
// forEmployee
const forEmployeeInputSchema = z.object({
  employeeId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
})

// yearOverview
const yearOverviewInputSchema = z.object({
  employeeId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
})

// list (admin, paginated)
const listInputSchema = z.object({
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(50),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  status: z.enum(["open", "calculated", "closed"]).optional(),
  departmentId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
})

// getById, close, reopen
const byIdInputSchema = z.object({
  id: z.string().uuid(),
})

// closeBatch -- match Go handler behavior (used by frontend batch-close-dialog.tsx)
const closeBatchInputSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  employeeIds: z.array(z.string().uuid()).optional(),
  departmentId: z.string().uuid().optional(),
  recalculate: z.boolean().optional().default(true),
})

// recalculate
const recalculateInputSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  employeeId: z.string().uuid().optional(),
})
```

**Critical decision on closeBatch**: The ticket says `{ ids: string[] }` but the Go handler (`monthly_value.go:197-303`) accepts `{ year, month, employee_ids, department_id, recalculate }` and the frontend `batch-close-dialog.tsx` (line 77-95) sends exactly that shape. We MUST match the Go behavior to avoid breaking the existing frontend component.

### 1.5 Prisma Include for Admin List

```typescript
const monthlyValueListInclude = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      personnelNumber: true,
      isActive: true,
      departmentId: true,
    },
  },
} as const
```

### 1.6 Data Scope Helpers

Follow the exact pattern from `dailyValues.ts` (lines 118-163):

```typescript
function buildMonthlyValueDataScopeWhere(
  dataScope: DataScope
): Record<string, unknown> | null {
  if (dataScope.type === "department") {
    return { employee: { departmentId: { in: dataScope.departmentIds } } }
  } else if (dataScope.type === "employee") {
    return { employeeId: { in: dataScope.employeeIds } }
  }
  return null
}

function checkMonthlyValueDataScope(
  dataScope: DataScope,
  item: {
    employeeId: string
    employee?: { departmentId: string | null } | null
  }
): void {
  if (dataScope.type === "department") {
    if (
      !item.employee?.departmentId ||
      !dataScope.departmentIds.includes(item.employee.departmentId)
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Monthly value not within data scope",
      })
    }
  } else if (dataScope.type === "employee") {
    if (!dataScope.employeeIds.includes(item.employeeId)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Monthly value not within data scope",
      })
    }
  }
}
```

### 1.7 Mapper Functions

**mapMonthlyValueToOutput** -- converts Prisma `MonthlyValue` record to output schema shape. Mirrors Go `monthlyValueToResponse` at `handler/monthly_value.go:362-404`.

```typescript
function mapMonthlyValueToOutput(
  record: Record<string, unknown>
): z.infer<typeof monthlyValueOutputSchema> {
  const overtime = record.totalOvertime as number
  const undertime = record.totalUndertime as number
  const isClosed = record.isClosed as boolean

  const result: Record<string, unknown> = {
    id: record.id,
    tenantId: record.tenantId,
    employeeId: record.employeeId,
    year: record.year,
    month: record.month,
    status: isClosed ? "closed" : "calculated",
    totalGrossTime: record.totalGrossTime,
    totalNetTime: record.totalNetTime,
    totalTargetTime: record.totalTargetTime,
    totalOvertime: overtime,
    totalUndertime: undertime,
    totalBreakTime: record.totalBreakTime,
    balanceMinutes: overtime - undertime,
    flextimeStart: record.flextimeStart,
    flextimeChange: record.flextimeChange,
    flextimeEnd: record.flextimeEnd,
    flextimeCarryover: record.flextimeCarryover,
    vacationTaken: record.vacationTaken instanceof Decimal
      ? (record.vacationTaken as Decimal).toNumber()
      : Number(record.vacationTaken),
    sickDays: record.sickDays,
    otherAbsenceDays: record.otherAbsenceDays,
    workDays: record.workDays,
    daysWithErrors: record.daysWithErrors,
    closedAt: record.closedAt ?? null,
    closedBy: record.closedBy ?? null,
    reopenedAt: record.reopenedAt ?? null,
    reopenedBy: record.reopenedBy ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }

  // Include employee if present (from list include)
  const employee = record.employee as Record<string, unknown> | undefined | null
  if (employee !== undefined) {
    result.employee = employee
      ? {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          personnelNumber: employee.personnelNumber,
          isActive: employee.isActive,
          departmentId: employee.departmentId ?? null,
        }
      : null
  }

  return result as z.infer<typeof monthlyValueOutputSchema>
}
```

**mapMonthSummaryToOutput** -- converts `MonthSummary` (from service) to output schema shape. Handles Decimal serialization.

```typescript
function mapMonthSummaryToOutput(
  summary: MonthSummary
): z.infer<typeof monthSummaryOutputSchema> {
  return {
    ...summary,
    vacationTaken: summary.vacationTaken instanceof Decimal
      ? summary.vacationTaken.toNumber()
      : Number(summary.vacationTaken),
  }
}
```

### Verification

- [ ] File compiles with `npx tsc --noEmit apps/web/src/server/routers/monthlyValues.ts` (or full project build)
- [ ] All permission keys resolve to non-undefined IDs (check: `reports.view`, `booking_overview.calculate_month`, `time_tracking.view_own`, `time_tracking.view_all` all exist in `permission-catalog.ts`)
- [ ] Output schemas match all fields from Go response models and Prisma `MonthlyValue` model

---

## Phase 2: tRPC Router -- Query Procedures (forEmployee, yearOverview, list, getById)

**Goal**: Implement the 4 read-only query procedures.

### 2.1 `forEmployee` Query

```typescript
forEmployee: tenantProcedure
  .use(
    requireEmployeePermission(
      (input) => (input as { employeeId: string }).employeeId,
      TIME_TRACKING_VIEW_OWN,
      TIME_TRACKING_VIEW_ALL
    )
  )
  .input(forEmployeeInputSchema)
  .output(monthSummaryOutputSchema)
  .query(async ({ ctx, input }) => {
    const { employeeId, year, month } = input
    const monthlyCalcService = new MonthlyCalcService(ctx.prisma)
    const summary = await monthlyCalcService.getMonthSummary(employeeId, year, month)
    return mapMonthSummaryToOutput(summary)
  }),
```

**Key behavior**: If no persisted `MonthlyValue` exists, the service calculates on-the-fly (does NOT persist). This matches Go `monthlyeval.go:GetMonthSummary`.

**Error handling**: The service throws `ERR_INVALID_MONTH`, `ERR_INVALID_YEAR_MONTH`, `ERR_EMPLOYEE_NOT_FOUND`. Map these to TRPCError:

```typescript
// Add a helper to map service errors to tRPC errors
function mapServiceError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err)
  switch (message) {
    case "monthly value not found":
      throw new TRPCError({ code: "NOT_FOUND", message: "Monthly value not found" })
    case "employee not found":
      throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" })
    case "cannot modify closed month":
      throw new TRPCError({ code: "BAD_REQUEST", message: "Month is closed" })
    case "month is not closed":
      throw new TRPCError({ code: "BAD_REQUEST", message: "Month is not closed" })
    case "invalid month":
      throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid month" })
    case "invalid year or month":
      throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid year or month" })
    case "cannot calculate future month":
      throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot calculate future month" })
    default:
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message })
  }
}
```

Use the error constants from `monthly-calc.types.ts` for the switch cases (import `ERR_*` constants and compare against them).

### 2.2 `yearOverview` Query

```typescript
yearOverview: tenantProcedure
  .use(
    requireEmployeePermission(
      (input) => (input as { employeeId: string }).employeeId,
      TIME_TRACKING_VIEW_OWN,
      TIME_TRACKING_VIEW_ALL
    )
  )
  .input(yearOverviewInputSchema)
  .output(z.array(monthSummaryOutputSchema))
  .query(async ({ ctx, input }) => {
    const { employeeId, year } = input
    const monthlyCalcService = new MonthlyCalcService(ctx.prisma)
    const summaries = await monthlyCalcService.getYearOverview(employeeId, year)
    return summaries.map(mapMonthSummaryToOutput)
  }),
```

### 2.3 `list` Query (Admin, Paginated)

This uses inline Prisma queries (not the service), matching the `dailyValues.listAll` pattern.

```typescript
list: tenantProcedure
  .use(requirePermission(REPORTS_VIEW))
  .use(applyDataScope())
  .input(listInputSchema)
  .output(z.object({
    items: z.array(monthlyValueOutputSchema),
    total: z.number(),
  }))
  .query(async ({ ctx, input }) => {
    const tenantId = ctx.tenantId!
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 50
    const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

    const where: Record<string, unknown> = {
      tenantId,
      year: input.year,
      month: input.month,
    }

    // Status filter (Go mapping: "closed" -> isClosed=true; "open"/"calculated" -> isClosed=false)
    if (input.status === "closed") {
      where.isClosed = true
    } else if (input.status === "open" || input.status === "calculated") {
      where.isClosed = false
    }

    // Employee filter
    if (input.employeeId) {
      where.employeeId = input.employeeId
    }

    // Department filter (via employee relation)
    if (input.departmentId) {
      where.employee = {
        ...((where.employee as Record<string, unknown>) || {}),
        departmentId: input.departmentId,
      }
    }

    // Apply data scope
    const scopeWhere = buildMonthlyValueDataScopeWhere(dataScope)
    if (scopeWhere) {
      if (scopeWhere.employee && where.employee) {
        where.employee = {
          ...((where.employee as Record<string, unknown>) || {}),
          ...((scopeWhere.employee as Record<string, unknown>) || {}),
        }
      } else {
        Object.assign(where, scopeWhere)
      }
    }

    const [items, total] = await Promise.all([
      ctx.prisma.monthlyValue.findMany({
        where,
        include: monthlyValueListInclude,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ year: "desc" }, { month: "desc" }],
      }),
      ctx.prisma.monthlyValue.count({ where }),
    ])

    return {
      items: items.map((item) =>
        mapMonthlyValueToOutput(item as unknown as Record<string, unknown>)
      ),
      total,
    }
  }),
```

**Note**: Order by `year DESC, month DESC` matches Go `repository/monthlyvalue.go` `ListAll` method.

### 2.4 `getById` Query

```typescript
getById: tenantProcedure
  .use(requirePermission(REPORTS_VIEW))
  .input(byIdInputSchema)
  .output(monthlyValueOutputSchema)
  .query(async ({ ctx, input }) => {
    const tenantId = ctx.tenantId!

    const mv = await ctx.prisma.monthlyValue.findFirst({
      where: { id: input.id, tenantId },
      include: monthlyValueListInclude,
    })

    if (!mv) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Monthly value not found",
      })
    }

    return mapMonthlyValueToOutput(mv as unknown as Record<string, unknown>)
  }),
```

### Verification

- [ ] `forEmployee` returns a single `MonthSummary` for the given employee/year/month
- [ ] `forEmployee` returns calculated-on-the-fly data when no persisted record exists
- [ ] `yearOverview` returns an array of `MonthSummary` objects (up to 12)
- [ ] `list` returns paginated results with `{ items, total }` shape
- [ ] `list` correctly filters by status, departmentId, employeeId
- [ ] `list` applies data scope filtering
- [ ] `getById` returns a single `MonthlyValue` or throws NOT_FOUND
- [ ] All permission checks are correct

---

## Phase 3: tRPC Router -- Mutation Procedures (close, reopen, closeBatch, recalculate)

**Goal**: Implement the 4 mutation procedures with full business logic.

### 3.1 `close` Mutation

The close procedure takes `{ id }` but the `MonthlyCalcService.closeMonth()` expects `(employeeId, year, month, closedBy)`. Must look up the record first.

```typescript
close: tenantProcedure
  .use(requirePermission(REPORTS_VIEW))
  .input(byIdInputSchema)
  .output(monthlyValueOutputSchema)
  .mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenantId!

    // 1. Look up the monthly value to get employeeId, year, month
    const mv = await ctx.prisma.monthlyValue.findFirst({
      where: { id: input.id, tenantId },
      include: monthlyValueListInclude,
    })
    if (!mv) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Monthly value not found" })
    }

    // 2. Close via service
    const monthlyCalcService = new MonthlyCalcService(ctx.prisma)
    try {
      await monthlyCalcService.closeMonth(mv.employeeId, mv.year, mv.month, ctx.user.id)
    } catch (err) {
      mapServiceError(err)
    }

    // 3. Re-fetch and return updated record
    const updated = await ctx.prisma.monthlyValue.findFirst({
      where: { id: input.id, tenantId },
      include: monthlyValueListInclude,
    })
    return mapMonthlyValueToOutput(updated as unknown as Record<string, unknown>)
  }),
```

### 3.2 `reopen` Mutation

Same pattern as close:

```typescript
reopen: tenantProcedure
  .use(requirePermission(REPORTS_VIEW))
  .input(byIdInputSchema)
  .output(monthlyValueOutputSchema)
  .mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenantId!

    const mv = await ctx.prisma.monthlyValue.findFirst({
      where: { id: input.id, tenantId },
      include: monthlyValueListInclude,
    })
    if (!mv) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Monthly value not found" })
    }

    const monthlyCalcService = new MonthlyCalcService(ctx.prisma)
    try {
      await monthlyCalcService.reopenMonth(mv.employeeId, mv.year, mv.month, ctx.user.id)
    } catch (err) {
      mapServiceError(err)
    }

    const updated = await ctx.prisma.monthlyValue.findFirst({
      where: { id: input.id, tenantId },
      include: monthlyValueListInclude,
    })
    return mapMonthlyValueToOutput(updated as unknown as Record<string, unknown>)
  }),
```

### 3.3 `closeBatch` Mutation

Complex mutation matching Go `monthly_value.go:197-303`. Must match the frontend `batch-close-dialog.tsx` shape.

```typescript
closeBatch: tenantProcedure
  .use(requirePermission(REPORTS_VIEW))
  .input(closeBatchInputSchema)
  .output(z.object({
    closedCount: z.number().int(),
    skippedCount: z.number().int(),
    errorCount: z.number().int(),
    errors: z.array(z.object({
      employeeId: z.string().uuid(),
      reason: z.string(),
    })),
  }))
  .mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenantId!
    const userId = ctx.user.id
    const { year, month, recalculate } = input

    // 1. Determine which employees to close
    let employeeIds = input.employeeIds ?? []
    if (employeeIds.length === 0) {
      // Get active employees (optionally filtered by department)
      const empWhere: Record<string, unknown> = {
        tenantId,
        isActive: true,
      }
      if (input.departmentId) {
        empWhere.departmentId = input.departmentId
      }
      const employees = await ctx.prisma.employee.findMany({
        where: empWhere,
        select: { id: true },
      })
      employeeIds = employees.map((e) => e.id)
    }

    // 2. Optionally recalculate before closing
    const monthlyCalcService = new MonthlyCalcService(ctx.prisma)
    if (recalculate) {
      await monthlyCalcService.calculateMonthBatch(employeeIds, year, month)
    }

    // 3. Close each employee's month
    let closedCount = 0
    let skippedCount = 0
    const errors: { employeeId: string; reason: string }[] = []

    for (const empId of employeeIds) {
      const mv = await ctx.prisma.monthlyValue.findUnique({
        where: {
          employeeId_year_month: { employeeId: empId, year, month },
        },
      })

      if (!mv) {
        skippedCount++
        continue
      }
      if (mv.isClosed) {
        skippedCount++
        continue
      }

      try {
        await monthlyCalcService.closeMonth(empId, year, month, userId)
        closedCount++
      } catch (err) {
        errors.push({
          employeeId: empId,
          reason: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return {
      closedCount,
      skippedCount,
      errorCount: errors.length,
      errors,
    }
  }),
```

### 3.4 `recalculate` Mutation

Matches Go `monthly_value.go:305-360`. Returns accepted status with affected count.

```typescript
recalculate: tenantProcedure
  .use(requirePermission(CALCULATE_MONTH))
  .input(recalculateInputSchema)
  .output(z.object({
    message: z.string(),
    affectedEmployees: z.number().int(),
  }))
  .mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenantId!
    const { year, month, employeeId } = input

    // Determine which employees to recalculate
    let employeeIds: string[]
    if (employeeId) {
      employeeIds = [employeeId]
    } else {
      const employees = await ctx.prisma.employee.findMany({
        where: { tenantId, isActive: true },
        select: { id: true },
      })
      employeeIds = employees.map((e) => e.id)
    }

    const monthlyCalcService = new MonthlyCalcService(ctx.prisma)
    const result = await monthlyCalcService.calculateMonthBatch(employeeIds, year, month)

    return {
      message: "Recalculation started",
      affectedEmployees: result.processedMonths,
    }
  }),
```

### Verification

- [ ] `close` returns updated monthly value with `status: "closed"` and `closedAt`/`closedBy` set
- [ ] `close` throws NOT_FOUND for non-existent ID, BAD_REQUEST for already-closed month
- [ ] `reopen` returns updated monthly value with `status: "calculated"` and `reopenedAt`/`reopenedBy` set
- [ ] `reopen` throws NOT_FOUND for non-existent ID, BAD_REQUEST for non-closed month
- [ ] `closeBatch` with `employeeIds` closes only those employees
- [ ] `closeBatch` without `employeeIds` but with `departmentId` closes department employees
- [ ] `closeBatch` with `recalculate: true` (default) recalculates before closing
- [ ] `closeBatch` skips already-closed and missing monthly values
- [ ] `recalculate` with `employeeId` recalculates only that employee
- [ ] `recalculate` without `employeeId` recalculates all active employees in tenant

---

## Phase 4: Router Registration

**Goal**: Register the new router in `root.ts`.

### 4.1 Modify `apps/web/src/server/root.ts`

Add import (after the `dailyAccountValues` import at line 70):

```typescript
import { monthlyValuesRouter } from "./routers/monthlyValues"
```

Add to the `createTRPCRouter({...})` call (after `dailyAccountValues` entry at line 133):

```typescript
  monthlyValues: monthlyValuesRouter,
```

### Verification

- [ ] TypeScript compiles without errors
- [ ] `monthlyValues` key appears in the router registration
- [ ] No duplicate router keys

---

## Phase 5: Frontend Hook Migration -- use-monthly-values.ts

**Goal**: Migrate `apps/web/src/hooks/api/use-monthly-values.ts` from legacy REST (`fetch()`) to tRPC, following the exact pattern from `apps/web/src/hooks/api/use-daily-values.ts`.

### 5.1 Migration Pattern

The file currently uses raw `fetch()` calls to the Go API. Replace with tRPC hooks while maintaining the same exported hook names and `MonthSummary` interface (snake_case) for backward compatibility.

**Keep**: The `MonthSummary` interface and `addLegacyFields()` transform function (or rename to `transformToLegacyMonthSummary()`).

**Replace**: All `fetch()` calls with tRPC hook calls.

### 5.2 New Implementation

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// Keep the existing MonthSummary interface (snake_case) for backward compatibility
export interface MonthSummary {
  // ... (same as current, lines 34-73)
}

/**
 * Transform tRPC MonthSummary (camelCase) to legacy MonthSummary (snake_case).
 */
function transformToLegacyMonthSummary(
  ms: Record<string, unknown>
): MonthSummary {
  const overtime = (ms.totalOvertime as number) ?? 0
  const undertime = (ms.totalUndertime as number) ?? 0
  const balance = overtime - undertime
  const vacationTaken = Number(ms.vacationTaken ?? 0)
  const sickDays = (ms.sickDays as number) ?? 0
  const otherAbsenceDays = (ms.otherAbsenceDays as number) ?? 0

  return {
    employee_id: ms.employeeId as string,
    year: ms.year as number,
    month: ms.month as number,
    total_gross_time: ms.totalGrossTime as number,
    total_net_time: ms.totalNetTime as number,
    total_target_time: ms.totalTargetTime as number,
    total_overtime: overtime,
    total_undertime: undertime,
    total_break_time: ms.totalBreakTime as number,
    flextime_start: ms.flextimeStart as number,
    flextime_change: ms.flextimeChange as number,
    flextime_end: ms.flextimeEnd as number,
    flextime_carryover: ms.flextimeCarryover as number,
    vacation_taken: vacationTaken,
    sick_days: sickDays,
    other_absence_days: otherAbsenceDays,
    work_days: ms.workDays as number,
    days_with_errors: ms.daysWithErrors as number,
    is_closed: ms.isClosed as boolean,
    closed_at: ms.closedAt ? String(ms.closedAt) : undefined,
    closed_by: ms.closedBy as string | undefined,
    reopened_at: ms.reopenedAt ? String(ms.reopenedAt) : undefined,
    reopened_by: ms.reopenedBy as string | undefined,
    warnings: (ms.warnings as string[]) ?? [],
    // Legacy aliases
    id: `${ms.employeeId}-${ms.year}-${ms.month}`,
    target_minutes: ms.totalTargetTime as number,
    gross_minutes: ms.totalGrossTime as number,
    break_minutes: ms.totalBreakTime as number,
    net_minutes: ms.totalNetTime as number,
    balance_minutes: balance,
    working_days: ms.workDays as number,
    worked_days: ms.workDays as number,
    absence_days: vacationTaken + sickDays + otherAbsenceDays,
    holiday_days: 0,
    status: (ms.isClosed as boolean) ? "closed" : "open",
    account_balances: {
      flextime: (ms.flextimeEnd as number) ?? 0,
    },
  }
}
```

**Hooks**:

```typescript
export function useMonthlyValues(options: UseMonthlyValuesOptions = {}) {
  const { employeeId, year, month, enabled = true } = options
  const trpc = useTRPC()

  return useQuery({
    ...trpc.monthlyValues.forEmployee.queryOptions(
      { employeeId: employeeId!, year: year!, month: month! },
      { enabled: enabled && !!employeeId && !!year && !!month }
    ),
    select: (data) => ({
      data: [transformToLegacyMonthSummary(data as unknown as Record<string, unknown>)],
    }),
  })
}

export function useYearOverview(options: UseYearOverviewOptions = {}) {
  const { employeeId, year, enabled = true } = options
  const trpc = useTRPC()

  return useQuery({
    ...trpc.monthlyValues.yearOverview.queryOptions(
      { employeeId: employeeId!, year: year! },
      { enabled: enabled && !!employeeId && !!year }
    ),
    select: (data) => ({
      data: data.map((ms) =>
        transformToLegacyMonthSummary(ms as unknown as Record<string, unknown>)
      ),
    }),
  })
}

export function useCloseMonth() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ employeeId, year, month }: CloseMonthParams) => {
      // Need to find the monthly value ID first (employee-scoped close)
      // The forEmployee endpoint returns a summary, not an ID.
      // Use the close-by-employee-month approach:
      // Look up the monthly value, then close by ID.
      // Alternative: call trpc directly via the utility.
      // For simplicity, we'll close by looking up the ID from the list.

      // Actually, the MonthlyCalcService.closeMonth() takes (employeeId, year, month, closedBy)
      // and we can't call the service directly from the frontend.
      // The router's close takes { id }.
      // The frontend needs a way to close by employee+year+month.

      // SOLUTION: We need to look up the MV first, then call close({ id }).
      // But this requires two round trips.
      // BETTER: Add a closeByEmployee procedure or make close accept either { id } or { employeeId, year, month }.
      // For now, do two calls to maintain backward compat.

      // WAIT -- let's re-read the Go endpoint: POST /employees/{id}/months/{year}/{month}/close
      // This accepts employeeId+year+month directly.
      // But our router close procedure only accepts { id }.
      // We should add a separate procedure or extend the close input.
    },
    // ...
  })
}
```

**Important Design Issue**: The employee-scoped close/reopen hooks (`useCloseMonth`, `useReopenMonth`, `useRecalculateMonth`) currently call `POST /employees/{id}/months/{year}/{month}/close` which takes `employeeId + year + month`. But the `monthlyValues.close` procedure only accepts `{ id }`.

**Solution**: Add a `closeByEmployee` mutation and `reopenByEmployee` mutation to the router (or extend `close` to accept both shapes). Looking at the research more carefully, the ticket says 8 procedures, so we should keep exactly 8. Instead, we handle this in the frontend hook: first look up the monthly value by employee+year+month (using `forEmployee`), then if the monthly value exists, look up its ID.

**Better solution**: Extend the `close` and `reopen` input schemas to also accept `{ employeeId, year, month }` as an alternative shape. Use a Zod union:

```typescript
const closeInputSchema = z.union([
  z.object({ id: z.string().uuid() }),
  z.object({
    employeeId: z.string().uuid(),
    year: z.number().int(),
    month: z.number().int(),
  }),
])
```

Then in the procedure, resolve the MonthlyValue either by ID or by employeeId+year+month. This avoids an extra round trip and keeps the hook migration clean.

**Update to Phase 3**: The `close` and `reopen` mutations should accept this union input schema. The procedure handler checks which shape it received:

```typescript
// In close/reopen mutation handler:
let mv: MonthlyValue | null
if ("id" in input) {
  mv = await ctx.prisma.monthlyValue.findFirst({
    where: { id: input.id, tenantId },
  })
} else {
  mv = await ctx.prisma.monthlyValue.findUnique({
    where: {
      employeeId_year_month: {
        employeeId: input.employeeId,
        year: input.year,
        month: input.month,
      },
    },
  })
}
```

**Updated hooks** (with union input):

```typescript
export function useCloseMonth() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  return useMutation({
    ...trpc.monthlyValues.close.mutationOptions(),
    mutationFn: ({ employeeId, year, month }: CloseMonthParams) => {
      // Use the trpc client to call close with employeeId+year+month
      // We need the actual trpc mutation caller here
      return (trpc.monthlyValues.close.mutationOptions() as { mutationFn: Function }).mutationFn({
        employeeId,
        year,
        month,
      })
    },
    onSuccess: (_, { employeeId, year, month }) => {
      queryClient.invalidateQueries({
        queryKey: trpc.monthlyValues.forEmployee.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.monthlyValues.yearOverview.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.monthlyValues.list.queryKey(),
      })
    },
  })
}
```

Actually, the cleaner approach following the `use-daily-values.ts` pattern is:

```typescript
export function useCloseMonth() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  return useMutation({
    ...trpc.monthlyValues.close.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.monthlyValues.forEmployee.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.monthlyValues.yearOverview.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.monthlyValues.list.queryKey() })
    },
  })
}
```

Then the component calls `closeMonth.mutate({ employeeId, year, month })` directly. This works because the close mutation now accepts this shape via the union input.

### 5.3 Complete Hooks List

| Export | tRPC Procedure | Notes |
|---|---|---|
| `useMonthlyValues(options)` | `monthlyValues.forEmployee` | Returns `{ data: [MonthSummary] }` via `select` transform |
| `useYearOverview(options)` | `monthlyValues.yearOverview` | Returns `{ data: MonthSummary[] }` via `select` transform |
| `useCloseMonth()` | `monthlyValues.close` | Input: `{ employeeId, year, month }` |
| `useReopenMonth()` | `monthlyValues.reopen` | Input: `{ employeeId, year, month }` |
| `useRecalculateMonth()` | `monthlyValues.recalculate` | Input: `{ employeeId, year, month }` |
| `MonthSummary` type | -- | Keep existing snake_case interface |

### 5.4 Remove Legacy Imports

Remove these from the file:
- `authStorage`, `tenantIdStorage` from `@/lib/api`
- `clientEnv` from `@/config/env`
- `apiRequest` function

Replace with:
- `useTRPC` from `@/trpc`
- `useQuery`, `useMutation`, `useQueryClient` from `@tanstack/react-query` (already imported)

### Verification

- [ ] All 5 hook exports still work with existing consumer components
- [ ] `useMonthlyValues` returns `{ data: [MonthSummary] }` shape (backward compat)
- [ ] `useYearOverview` returns `{ data: MonthSummary[] }` shape
- [ ] Legacy field aliases (`balance_minutes`, `status`, `absence_days`, etc.) are correctly computed
- [ ] Query invalidation works correctly after close/reopen/recalculate mutations
- [ ] No references to `clientEnv.apiUrl` or `fetch()` remain

---

## Phase 6: Frontend Hook Migration -- use-admin-monthly-values.ts

**Goal**: Migrate `apps/web/src/hooks/api/use-admin-monthly-values.ts` from legacy REST (`useApiQuery`/`useApiMutation`/`api`) to tRPC.

### 6.1 Migration

Replace all hooks with tRPC equivalents. The admin hooks need different snake_case transforms for the response since they return `MonthlyValue` (with `id`, `status`, etc.) not `MonthSummary`.

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
```

### 6.2 Hook Implementations

```typescript
export function useAdminMonthlyValues(options: UseAdminMonthlyValuesOptions = {}) {
  const { year, month, status, departmentId, employeeId, enabled = true } = options
  const trpc = useTRPC()

  return useQuery({
    ...trpc.monthlyValues.list.queryOptions(
      {
        year: year!,
        month: month!,
        status: status as "open" | "calculated" | "closed" | undefined,
        departmentId,
        employeeId,
      },
      { enabled: enabled && !!year && !!month }
    ),
  })
}

export function useMonthlyValueById(id: string | undefined) {
  const trpc = useTRPC()

  return useQuery({
    ...trpc.monthlyValues.getById.queryOptions(
      { id: id! },
      { enabled: !!id }
    ),
  })
}

export function useCloseMonthById() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  return useMutation({
    ...trpc.monthlyValues.close.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.monthlyValues.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.monthlyValues.getById.queryKey() })
    },
  })
}

export function useReopenMonthById() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  return useMutation({
    ...trpc.monthlyValues.reopen.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.monthlyValues.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.monthlyValues.getById.queryKey() })
    },
  })
}

export function useCloseMonthBatch() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  return useMutation({
    ...trpc.monthlyValues.closeBatch.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.monthlyValues.list.queryKey() })
    },
  })
}

export function useRecalculateMonthlyValues() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  return useMutation({
    ...trpc.monthlyValues.recalculate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.monthlyValues.list.queryKey() })
    },
  })
}
```

### 6.3 Frontend Component Compatibility

The `batch-close-dialog.tsx` currently calls `closeBatchMutation.mutateAsync({ body })` with `body: { year, month, recalculate, employee_ids, department_id }`. After migration, the call shape becomes `closeBatchMutation.mutateAsync({ year, month, recalculate, employeeIds, departmentId })` (camelCase, no `body` wrapper).

**The batch-close-dialog.tsx will need updating** (lines 77-99):
- Change `body.employee_ids` to `employeeIds` (camelCase)
- Change `body.department_id` to `departmentId` (camelCase)
- Remove the `body` wrapper and `as never` cast

Similarly, `recalculate-dialog.tsx` currently calls `recalculateMutation.mutateAsync({ body: { year, month } })`. After migration, it becomes `recalculateMutation.mutateAsync({ year, month })`.

**Components needing updates:**
1. `apps/web/src/components/monthly-values/batch-close-dialog.tsx` -- Update `closeBatchMutation.mutateAsync()` call shape
2. `apps/web/src/components/monthly-values/recalculate-dialog.tsx` -- Update `recalculateMutation.mutateAsync()` call shape
3. `apps/web/src/components/monthly-values/batch-reopen-dialog.tsx` -- Update `useReopenMonthById` call shape (if it wraps in `body`)

### 6.4 Remove Legacy Imports

Remove from the file:
- `useApiQuery`, `useApiMutation` from `@/hooks`
- `api` from `@/lib/api`
- `useMutation`, `useQueryClient` from `@tanstack/react-query` (keep -- still needed)

### 6.5 Update `hooks/api/index.ts`

The index file exports from both hook files. Keep all existing exports -- they should work with the new implementations since we maintain the same export names.

No changes needed to the export list in `index.ts` unless the `UseAdminMonthlyValuesOptions` interface changes.

### Verification

- [ ] `useAdminMonthlyValues` returns `{ items, total }` shape matching tRPC list output
- [ ] `useMonthlyValueById` returns a single monthly value object
- [ ] `useCloseMonthById` mutation works with `{ id }` input
- [ ] `useReopenMonthById` mutation works with `{ id }` input
- [ ] `useCloseMonthBatch` mutation works with `{ year, month, employeeIds?, departmentId?, recalculate? }` input
- [ ] `useRecalculateMonthlyValues` mutation works with `{ year, month, employeeId? }` input
- [ ] No references to `useApiQuery`, `useApiMutation`, or `api` remain
- [ ] Component compatibility verified (batch-close-dialog, recalculate-dialog)

---

## Phase 7: Frontend Component Updates

**Goal**: Update frontend components that call the migrated hooks with the new call shapes.

### 7.1 batch-close-dialog.tsx

**File**: `apps/web/src/components/monthly-values/batch-close-dialog.tsx`

Change the mutation call (around lines 77-99):

Before:
```typescript
const body: CloseBatchBody = { year, month, recalculate }
if (selectedEmployeeIds.length > 0) { body.employee_ids = selectedEmployeeIds }
else if (departmentId) { body.department_id = departmentId }
const data = await closeBatchMutation.mutateAsync({ body } as never)
```

After:
```typescript
const input = {
  year,
  month,
  recalculate,
  ...(selectedEmployeeIds.length > 0 ? { employeeIds: selectedEmployeeIds } : {}),
  ...(departmentId ? { departmentId } : {}),
}
const data = await closeBatchMutation.mutateAsync(input)
```

Also update the result type: Go returns `{ closed_count, skipped_count, error_count, errors }` (snake_case), tRPC returns `{ closedCount, skippedCount, errorCount, errors }` (camelCase). The `BatchCloseResult` interface in the component may need updating.

### 7.2 recalculate-dialog.tsx

**File**: `apps/web/src/components/monthly-values/recalculate-dialog.tsx`

Change the mutation call (around line 53):

Before:
```typescript
const result = await recalculateMutation.mutateAsync({ body: { year, month } })
setSuccessMessage(t('recalculate.success', { count: result.affected_employees ?? 0 }))
```

After:
```typescript
const result = await recalculateMutation.mutateAsync({ year, month })
setSuccessMessage(t('recalculate.success', { count: result.affectedEmployees ?? 0 }))
```

### 7.3 close-month-sheet.tsx and reopen-month-sheet.tsx

These components use `useCloseMonth` and `useReopenMonth` from `use-monthly-values.ts`. Their call shape is `{ employeeId, year, month }` which stays the same (since we handle this via the union input schema).

### 7.4 admin/monthly-values/page.tsx

This page uses `useAdminMonthlyValues`. The response shape changes from the REST response to `{ items, total }`. Check if the page accesses `.data` (legacy REST response) or `.items` (tRPC response).

Need to verify the component's data access pattern and update accordingly.

### Verification

- [ ] `batch-close-dialog.tsx` compiles and calls closeBatch with camelCase fields
- [ ] `recalculate-dialog.tsx` compiles and uses `affectedEmployees` (camelCase)
- [ ] `close-month-sheet.tsx` still works with `{ employeeId, year, month }` input
- [ ] `reopen-month-sheet.tsx` still works with `{ employeeId, year, month }` input
- [ ] `admin/monthly-values/page.tsx` correctly accesses list data shape
- [ ] TypeScript compiles with no errors across all modified components

---

## Phase 8: Router Unit Tests

**Goal**: Create comprehensive unit tests for the monthlyValues router, following the existing service test pattern (`apps/web/src/server/services/__tests__/monthly-calc.test.ts`).

**File**: `apps/web/src/server/routers/__tests__/monthlyValues.test.ts`

### 8.1 Test Structure

Use vitest with mock PrismaClient (same pattern as `monthly-calc.test.ts`).

Since there's no existing router test directory/pattern, we need to test the router through its handler logic. The best approach is to test via `createCaller` (server-side caller from `root.ts`), mocking the PrismaClient and context.

Alternative: Test the helper functions (mapper, data scope) as unit functions, and test the procedures via the caller factory.

### 8.2 Test Cases

**Mapper function tests:**
1. `mapMonthlyValueToOutput` correctly computes `status` ("calculated" vs "closed")
2. `mapMonthlyValueToOutput` correctly computes `balanceMinutes` (overtime - undertime)
3. `mapMonthlyValueToOutput` handles Decimal `vacationTaken` serialization
4. `mapMonthlyValueToOutput` includes employee when present
5. `mapMonthSummaryToOutput` correctly maps all fields

**Data scope helper tests:**
6. `buildMonthlyValueDataScopeWhere` returns null for "all" scope
7. `buildMonthlyValueDataScopeWhere` returns department filter for "department" scope
8. `buildMonthlyValueDataScopeWhere` returns employeeId filter for "employee" scope
9. `checkMonthlyValueDataScope` throws FORBIDDEN when out of scope
10. `checkMonthlyValueDataScope` passes silently when in scope

**Error mapping tests:**
11. `mapServiceError` maps each error constant to the correct TRPCError code

**Business logic tests (via mocked service calls):**
12. `close` mutation: looks up by ID, calls closeMonth, re-fetches
13. `close` mutation: looks up by employeeId+year+month when union input used
14. `close` mutation: NOT_FOUND when ID doesn't exist
15. `close` mutation: BAD_REQUEST when already closed
16. `reopen` mutation: looks up by ID, calls reopenMonth, re-fetches
17. `reopen` mutation: NOT_FOUND when ID doesn't exist
18. `reopen` mutation: BAD_REQUEST when not closed
19. `closeBatch` mutation: closes specified employees, skips already closed
20. `closeBatch` mutation: resolves employees from department when no IDs given
21. `closeBatch` mutation: recalculates before closing when flag is true
22. `recalculate` mutation: recalculates specific employee
23. `recalculate` mutation: recalculates all active employees when no ID given

### 8.3 Test Approach

Export the helper functions from the router file for direct testing:

```typescript
// At bottom of monthlyValues.ts:
export { mapMonthlyValueToOutput, mapMonthSummaryToOutput, buildMonthlyValueDataScopeWhere, checkMonthlyValueDataScope, mapServiceError }
// (Only for testing -- these are not part of the public API)
```

Or better: extract helpers to a separate `monthlyValues.helpers.ts` file and test that. But for simplicity, keep them in the router file and test via the exported router using `createCaller`.

### Verification

- [ ] All test cases pass
- [ ] Tests run with `npx vitest run apps/web/src/server/routers/__tests__/monthlyValues.test.ts`
- [ ] No flaky tests (all mocks are deterministic)

---

## Phase 9: Integration Verification

**Goal**: Full build check and manual verification of all components.

### 9.1 TypeScript Build Check

```bash
cd apps/web && npx tsc --noEmit
```

### 9.2 Full Test Suite

```bash
cd apps/web && npx vitest run
```

### 9.3 Manual Verification Checklist

- [ ] All 8 procedures defined in the router
- [ ] Router registered in `root.ts`
- [ ] `use-monthly-values.ts` has no REST/fetch calls
- [ ] `use-admin-monthly-values.ts` has no REST/fetch calls
- [ ] `hooks/api/index.ts` exports are correct
- [ ] All consumer components compile
- [ ] No circular dependencies introduced

### 9.4 Files Changed Summary

| File | Action | Lines (est.) |
|---|---|---|
| `apps/web/src/server/routers/monthlyValues.ts` | Create | ~550 |
| `apps/web/src/server/routers/__tests__/monthlyValues.test.ts` | Create | ~400 |
| `apps/web/src/server/root.ts` | Modify | +2 lines |
| `apps/web/src/hooks/api/use-monthly-values.ts` | Rewrite | ~180 |
| `apps/web/src/hooks/api/use-admin-monthly-values.ts` | Rewrite | ~90 |
| `apps/web/src/components/monthly-values/batch-close-dialog.tsx` | Modify | ~10 lines |
| `apps/web/src/components/monthly-values/recalculate-dialog.tsx` | Modify | ~5 lines |

### 9.5 Go Files Replaced

These Go files are functionally replaced by this implementation:
- `apps/api/internal/handler/monthly_value.go` (405 lines)
- `apps/api/internal/handler/monthlyeval.go` (461 lines)
- `apps/api/internal/service/monthlyvalue.go` (94 lines)
- `apps/api/internal/repository/monthlyvalue.go` (242 lines -- already inlined into MonthlyCalcService)

---

## Key Design Decisions

1. **closeBatch input**: Match Go handler shape `{ year, month, employeeIds?, departmentId?, recalculate? }` instead of ticket's simpler `{ ids }`, because the frontend already uses this shape.

2. **close/reopen union input**: Accept both `{ id }` and `{ employeeId, year, month }` via Zod union to support both admin (by ID) and employee (by employee+year+month) close/reopen flows without adding extra procedures.

3. **Permission mapping**: Use `time_tracking.view_own` / `time_tracking.view_all` for `forEmployee` and `yearOverview` (matching `dailyValues.list` pattern) since the ticket's `monthly_values.read_own` / `monthly_values.read` don't exist in the permission catalog.

4. **MonthSummary vs MonthlyValue output**: Two separate output schemas because the MonthSummary (from service) has warnings but no ID/status/timestamps, while the MonthlyValue (from Prisma) has ID/status/timestamps but no warnings. The `forEmployee`/`yearOverview` use MonthSummary, the admin procedures use MonthlyValue.

5. **Service instantiation per request**: `new MonthlyCalcService(ctx.prisma)` inside each procedure handler, matching the existing pattern in `employees.ts`.

6. **Legacy field transforms**: Frontend hooks maintain snake_case legacy interfaces with backward-compatible field aliases, matching the `use-daily-values.ts` migration pattern.
