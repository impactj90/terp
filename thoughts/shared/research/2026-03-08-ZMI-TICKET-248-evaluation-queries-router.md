# Research: ZMI-TICKET-248 -- Evaluation Queries Router

Date: 2026-03-08

## 1. Go Business Logic Analysis

### 1.1 EvaluationService (`apps/api/internal/service/evaluation.go`, 564 lines)

**Dependencies:**
- `dailyValueRepo *repository.DailyValueRepository`
- `bookingRepo *repository.BookingRepository`
- `auditLogRepo *repository.AuditLogRepository`

**No mutation logic** -- all 5 methods are read-only queries returning paginated lists.

**Service methods:**

1. **ListDailyValues** (lines 56-95):
   - Input: `EvalDailyValueFilter` -- TenantID, From, To (required dates), EmployeeID?, DepartmentID?, HasErrors?, IncludeNoBookings, ScopeType, ScopeDepartmentIDs, ScopeEmployeeIDs, Limit, Page
   - Calls `dailyValueRepo.ListAll(ctx, tenantID, opts)` with `DailyValueListOptions`
   - Maps results via `mapDailyValueToEval()` -> `models.EvaluationDailyValue`
   - Returns `models.EvaluationDailyValueList` with Data + PaginationMeta (limit, total)
   - **Key mapping fields:** id, employeeId, date, status, targetMinutes, grossMinutes, netMinutes, breakMinutes, overtimeMinutes, undertimeMinutes, balanceMinutes (computed: overtime - undertime), bookingCount, hasErrors, firstCome (string HH:MM), lastGo (string HH:MM), employee summary

2. **ListBookings** (lines 153-194):
   - Input: `EvalBookingFilter` -- TenantID, From, To, EmployeeID?, DepartmentID?, BookingTypeID?, Source?, Direction?, ScopeType, ScopeDepartmentIDs, ScopeEmployeeIDs, Limit, Page
   - Calls `bookingRepo.List(ctx, filter)` returning `([]model.Booking, int64, error)`
   - Maps via `mapBookingToEval()` -> `models.EvaluationBooking`
   - Returns `models.EvaluationBookingList` with Data + PaginationMeta
   - **Key mapping fields:** id, employeeId, bookingDate, bookingTypeId, originalTime, editedTime, calculatedTime?, timeString, source, pairId?, terminalId?, notes?, createdAt, employee summary, bookingType summary

3. **ListTerminalBookings** (lines 256-296):
   - Input: `EvalTerminalBookingFilter` -- TenantID, From, To, EmployeeID?, DepartmentID?, ScopeType, ScopeDepartmentIDs, ScopeEmployeeIDs, Limit, Page
   - Calls `bookingRepo.List()` with Source forced to `model.BookingSourceTerminal`
   - Maps via `mapTerminalBookingToEval()` -> `models.EvaluationTerminalBooking`
   - **Key difference from regular bookings:** includes wasEdited (bool), originalTimeString, editedTimeString (HH:MM formatted)
   - Returns `models.EvaluationTerminalBookingList`

4. **ListLogs** (lines 354-392):
   - Input: `EvalLogFilter` -- TenantID, From, To, EmployeeID?, DepartmentID?, EntityType?, Action?, UserID?, Limit, Page
   - **Important:** adjusts `to` to end-of-day: `f.To.Add(23h59m59s)`
   - Calls `auditLogRepo.List(ctx, filter)` returning `([]model.AuditLog, int64, error)`
   - Maps via `mapAuditLogToLogEntry()` -> `models.EvaluationLogEntry`
   - **Key mapping fields:** id, action, entityType, entityId, entityName?, changes (JSON unmarshalled to any), performedAt, userId?, user summary
   - Returns `models.EvaluationLogEntryList`

5. **ListWorkflowHistory** (lines 445-498):
   - Input: `EvalWorkflowFilter` -- TenantID, From, To, EmployeeID?, DepartmentID?, EntityType?, Action?, Limit, Page
   - **Important:** adjusts `to` to end-of-day: `f.To.Add(23h59m59s)`
   - **Default entity type filter (when not specified):** `["absence", "monthly_value"]`
   - **Default action filter (when not specified):** `["create", "approve", "reject", "close", "reopen"]`
   - These defaults filter audit logs to only workflow-relevant entries
   - Uses same `auditLogRepo.List()` but with EntityTypes[] and Actions[] array filters
   - Maps via `mapAuditLogToWorkflowEntry()` -> `models.EvaluationWorkflowEntry`
   - **Key mapping fields:** id, action, entityType, entityId, entityName?, performedAt, userId?, user summary, metadata (JSON unmarshalled to any)
   - Returns `models.EvaluationWorkflowEntryList`

### 1.2 Shared Mapper Functions (lines 534-564)

- `mapEmployeeToSummary()` -- id, personnelNumber, firstName, lastName, isActive
- `mapBookingTypeToSummary()` -- id, code, name, direction
- `mapUserToSummary()` -- id, displayName

### 1.3 EvaluationHandler (`apps/api/internal/handler/evaluation.go`, 331 lines)

**Endpoints:**
- `GET /evaluations/daily-values` -> `ListDailyValues`
- `GET /evaluations/bookings` -> `ListBookings`
- `GET /evaluations/terminal-bookings` -> `ListTerminalBookings`
- `GET /evaluations/logs` -> `ListLogs`
- `GET /evaluations/workflow-history` -> `ListWorkflowHistory`

**Common patterns in all handlers:**
1. Extract tenantID from middleware context
2. Parse date range (from/to) -- required for all endpoints, format YYYY-MM-DD
3. Call `scopeFromContext(r.Context())` for data scope
4. Parse optional UUID filters (employee_id, department_id, etc.)
5. Parse pagination (limit default=50, page default=1)
6. Call service method, return JSON

**Date parsing validation (lines 249-272):**
- Both `from` and `to` are required query parameters
- Format: `YYYY-MM-DD` (parsed via `time.Parse("2006-01-02", ...)`)
- `to` must not be before `from`

### 1.4 Route Registration (`apps/api/internal/handler/routes.go`, lines 1030-1049)

All 5 evaluation endpoints use the same permission: **`reports.view`**

```go
permViewReports := permissions.ID("reports.view").String()
r.Route("/evaluations", func(r chi.Router) {
    r.With(authz.RequirePermission(permViewReports)).Get("/daily-values", h.ListDailyValues)
    r.With(authz.RequirePermission(permViewReports)).Get("/bookings", h.ListBookings)
    r.With(authz.RequirePermission(permViewReports)).Get("/terminal-bookings", h.ListTerminalBookings)
    r.With(authz.RequirePermission(permViewReports)).Get("/logs", h.ListLogs)
    r.With(authz.RequirePermission(permViewReports)).Get("/workflow-history", h.ListWorkflowHistory)
})
```

## 2. Existing tRPC Patterns

### 2.1 Router Structure

All routers follow this pattern (see `apps/web/src/server/routers/*.ts`):
1. Import `z` from zod, `TRPCError` from `@trpc/server`
2. Import `createTRPCRouter`, `tenantProcedure` from `../trpc`
3. Import authorization middleware (`requirePermission`, `applyDataScope`, etc.)
4. Import `permissionIdByKey` from `../lib/permission-catalog`
5. Define permission constants at module level
6. Define Zod schemas (input + output)
7. Export the router created via `createTRPCRouter({...})`

### 2.2 Registration in Root Router

File: `apps/web/src/server/root.ts`

New router needs to be:
1. Imported: `import { evaluationsRouter } from "./routers/evaluations"`
2. Registered: `evaluations: evaluationsRouter,` in `createTRPCRouter({...})`

### 2.3 Procedure Pattern

```typescript
procedureName: tenantProcedure
    .use(requirePermission(PERM_ID))
    .use(applyDataScope())        // if data scope filtering needed
    .input(inputSchema)
    .output(outputSchema)
    .query(async ({ ctx, input }) => {
        const tenantId = ctx.tenantId!
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        // ... build Prisma where clause
        // ... execute query
        // ... map results
        return { items, total }
    })
```

### 2.4 Data Scope Pattern

Used in `dailyValues.ts` and `bookings.ts`:

```typescript
function buildDataScopeWhere(dataScope: DataScope): Record<string, unknown> | null {
    if (dataScope.type === "department") {
        return { employee: { departmentId: { in: dataScope.departmentIds } } }
    } else if (dataScope.type === "employee") {
        return { employeeId: { in: dataScope.employeeIds } }
    }
    return null // type === "all" or "tenant" -- no additional filtering
}
```

### 2.5 Pagination Pattern

Two patterns exist in the codebase:

**Pattern A (bookings, dailyValues):**
```typescript
output: z.object({ items: z.array(outputSchema), total: z.number() })
```

**Pattern B (terminalBookings):**
```typescript
output: z.object({
    data: z.array(outputSchema),
    meta: z.object({ total: z.number(), limit: z.number(), hasMore: z.boolean() })
})
```

The Go evaluation service uses `data` + `meta` pattern. The tRPC evaluations router should use whichever pattern best matches -- since these are evaluation-specific query endpoints, using the `items` + `total` pattern (A) is consistent with similar read-only routers.

## 3. Database Models / Prisma Schema

### 3.1 DailyValue (`daily_values` table, schema line 2825)

Key fields for evaluation queries:
- `id`, `tenantId`, `employeeId`, `valueDate` (Date)
- `status` (varchar 20: pending/calculated/error/approved)
- `grossTime`, `netTime`, `targetTime`, `overtime`, `undertime`, `breakTime` (all Int, minutes)
- `hasError` (Boolean), `errorCodes` (String[]), `warnings` (String[])
- `firstCome`, `lastGo` (Int?, minutes from midnight)
- `bookingCount` (Int)
- `calculatedAt` (DateTime?)
- Relations: `employee Employee`

### 3.2 Booking (`bookings` table, schema line 2763)

Key fields for evaluation queries:
- `id`, `tenantId`, `employeeId`, `bookingDate` (Date), `bookingTypeId`
- `originalTime`, `editedTime` (Int, minutes from midnight)
- `calculatedTime` (Int?)
- `pairId` (uuid?), `source` (varchar 20), `terminalId` (uuid?)
- `notes` (text?), `bookingReasonId` (uuid?), `isAutoGenerated` (boolean)
- Relations: `employee Employee`, `bookingType BookingType`, `bookingReason BookingReason?`

### 3.3 AuditLog (`audit_logs` table, schema line 1797)

Key fields for evaluation queries:
- `id`, `tenantId`, `userId` (uuid?)
- `action` (varchar 20), `entityType` (varchar 100), `entityId` (uuid)
- `entityName` (text?), `changes` (JsonB?), `metadata` (JsonB?)
- `ipAddress` (text?), `userAgent` (text?)
- `performedAt` (DateTime)
- Relations: `user User?`

### 3.4 Employee (relevant fields for summaries)

- `id`, `personnelNumber`, `firstName`, `lastName`, `isActive`, `departmentId`, `tariffId`

### 3.5 BookingType (relevant fields for summaries)

- `id`, `code`, `name`, `direction`

### 3.6 No WorkflowEvent table

The Go workflow history query is NOT backed by a separate `workflow_events` table. It queries `audit_logs` with specific entity type and action filters (see section 1.1 item 5). The tRPC implementation should follow the same approach: query `auditLog` Prisma model with appropriate filters.

## 4. Authorization / Data Scope Analysis

### 4.1 Permission Required

All 5 evaluation endpoints require: **`reports.view`**

```typescript
const REPORTS_VIEW = permissionIdByKey("reports.view")!
```

### 4.2 Data Scope Filtering

The Go evaluation handlers apply data scope for daily values, bookings, and terminal bookings (via `scopeFromContext()`). The logs and workflow history queries do NOT apply data scope in the Go code -- they only filter by tenantId.

**For daily values and bookings:** Data scope is applied via employee relation:
- `department` scope: `{ employee: { departmentId: { in: dataScope.departmentIds } } }`
- `employee` scope: `{ employeeId: { in: dataScope.employeeIds } }`

**For logs and workflow history:** No data scope filtering -- admin-only view filtered by tenant.

### 4.3 Decision

- `evaluations.dailyValues`: `tenantProcedure.use(requirePermission(REPORTS_VIEW)).use(applyDataScope())`
- `evaluations.bookings`: `tenantProcedure.use(requirePermission(REPORTS_VIEW)).use(applyDataScope())`
- `evaluations.terminalBookings`: `tenantProcedure.use(requirePermission(REPORTS_VIEW)).use(applyDataScope())`
- `evaluations.logs`: `tenantProcedure.use(requirePermission(REPORTS_VIEW))` (no data scope)
- `evaluations.workflowHistory`: `tenantProcedure.use(requirePermission(REPORTS_VIEW))` (no data scope)

## 5. Frontend Hook Analysis

### 5.1 Current Hook (`apps/web/src/hooks/api/use-evaluations.ts`, 126 lines)

Uses old Go REST API via `useApiQuery`. Five hooks:

1. **useEvaluationDailyValues** -- params: from, to, employee_id?, department_id?, include_no_bookings?, has_errors?, limit?, page?
2. **useEvaluationBookings** -- params: from, to, employee_id?, department_id?, booking_type_id?, source?, direction?, limit?, page?
3. **useEvaluationTerminalBookings** -- params: from, to, employee_id?, department_id?, limit?, page?
4. **useEvaluationLogs** -- params: from, to, employee_id?, department_id?, entity_type?, action?, user_id?, limit?, page?
5. **useEvaluationWorkflowHistory** -- params: from, to, employee_id?, department_id?, entity_type?, action?, limit?, page?

All hooks have `enabled` flag that requires both `from` and `to` to be set.

### 5.2 Migration to tRPC

The hooks will be rewritten to use tRPC queries:
```typescript
api.evaluations.dailyValues.useQuery({ fromDate, toDate, employeeId, ... })
```

The `enabled` pattern maps to tRPC's `enabled` option in the query config.

## 6. Input/Output Schema Design

### 6.1 Shared Schemas (reusable across procedures)

```typescript
const employeeSummarySchema = z.object({
    id: z.string().uuid(),
    personnelNumber: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    isActive: z.boolean(),
}).nullable()

const bookingTypeSummarySchema = z.object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    direction: z.string(),
}).nullable()

const userSummarySchema = z.object({
    id: z.string().uuid(),
    displayName: z.string(),
}).nullable()
```

### 6.2 Daily Values

**Input:**
```typescript
z.object({
    fromDate: z.string().date(),             // YYYY-MM-DD, required
    toDate: z.string().date(),               // YYYY-MM-DD, required
    employeeId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional(),
    hasErrors: z.boolean().optional(),
    page: z.number().int().positive().optional().default(1),
    pageSize: z.number().int().min(1).max(100).optional().default(50),
})
```

**Output item:**
```typescript
z.object({
    id: z.string().uuid(),
    employeeId: z.string().uuid(),
    valueDate: z.date(),
    status: z.string(),
    targetMinutes: z.number().int(),
    grossMinutes: z.number().int(),
    netMinutes: z.number().int(),
    breakMinutes: z.number().int(),
    overtimeMinutes: z.number().int(),
    undertimeMinutes: z.number().int(),
    balanceMinutes: z.number().int(),     // computed: overtime - undertime
    bookingCount: z.number().int(),
    hasErrors: z.boolean(),
    firstCome: z.number().int().nullable(),
    lastGo: z.number().int().nullable(),
    employee: employeeSummarySchema.optional(),
})
```

### 6.3 Bookings

**Input:**
```typescript
z.object({
    fromDate: z.string().date(),
    toDate: z.string().date(),
    employeeId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional(),
    bookingTypeId: z.string().uuid().optional(),
    source: z.enum(["web", "terminal", "api", "import", "correction", "derived"]).optional(),
    direction: z.enum(["in", "out"]).optional(),
    page: z.number().int().positive().optional().default(1),
    pageSize: z.number().int().min(1).max(100).optional().default(50),
})
```

**Output item:**
```typescript
z.object({
    id: z.string().uuid(),
    employeeId: z.string().uuid(),
    bookingDate: z.date(),
    bookingTypeId: z.string().uuid(),
    originalTime: z.number().int(),
    editedTime: z.number().int(),
    calculatedTime: z.number().int().nullable(),
    pairId: z.string().uuid().nullable(),
    terminalId: z.string().uuid().nullable(),
    source: z.string().nullable(),
    notes: z.string().nullable(),
    createdAt: z.date(),
    employee: employeeSummarySchema.optional(),
    bookingType: bookingTypeSummarySchema.optional(),
})
```

### 6.4 Terminal Bookings

**Input:**
```typescript
z.object({
    fromDate: z.string().date(),
    toDate: z.string().date(),
    employeeId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional(),
    page: z.number().int().positive().optional().default(1),
    pageSize: z.number().int().min(1).max(100).optional().default(50),
})
```

**Output item:**
Same as bookings output but with additional fields:
- `wasEdited: z.boolean()` -- `originalTime !== editedTime`
- `originalTimeString: z.string()` -- HH:MM format
- `editedTimeString: z.string()` -- HH:MM format

### 6.5 Logs

**Input:**
```typescript
z.object({
    fromDate: z.string().date(),
    toDate: z.string().date(),
    employeeId: z.string().uuid().optional(),
    entityType: z.string().optional(),
    action: z.string().optional(),
    userId: z.string().uuid().optional(),
    page: z.number().int().positive().optional().default(1),
    pageSize: z.number().int().min(1).max(100).optional().default(50),
})
```

**Output item:**
```typescript
z.object({
    id: z.string().uuid(),
    action: z.string(),
    entityType: z.string(),
    entityId: z.string().uuid(),
    entityName: z.string().nullable(),
    changes: z.unknown().nullable(),
    performedAt: z.date(),
    userId: z.string().uuid().nullable(),
    user: userSummarySchema.optional(),
})
```

### 6.6 Workflow History

**Input:**
```typescript
z.object({
    fromDate: z.string().date(),
    toDate: z.string().date(),
    employeeId: z.string().uuid().optional(),
    entityType: z.string().optional(),
    action: z.string().optional(),
    page: z.number().int().positive().optional().default(1),
    pageSize: z.number().int().min(1).max(100).optional().default(50),
})
```

**Output item:**
```typescript
z.object({
    id: z.string().uuid(),
    action: z.string(),
    entityType: z.string(),
    entityId: z.string().uuid(),
    entityName: z.string().nullable(),
    metadata: z.unknown().nullable(),
    performedAt: z.date(),
    userId: z.string().uuid().nullable(),
    user: userSummarySchema.optional(),
})
```

## 7. Implementation Details

### 7.1 Query Logic Notes

**Daily values -- department filtering via employee relation:**
```typescript
if (input.departmentId) {
    where.employee = { departmentId: input.departmentId }
}
```

**Bookings -- direction filter requires join through bookingType:**
```typescript
if (input.direction) {
    where.bookingType = { direction: input.direction }
}
```

**Terminal bookings -- hardcoded source filter:**
```typescript
where.source = "terminal"
```

**Logs -- end-of-day adjustment:**
The Go code adds 23h59m59s to the `to` date. In Prisma, set `to` to next day start or add time:
```typescript
const toEnd = new Date(input.toDate)
toEnd.setHours(23, 59, 59, 999)
```

**Workflow history -- default entity types and actions:**
```typescript
// When entityType not specified, filter to workflow-relevant entity types
const entityTypes = input.entityType ? [input.entityType] : ["absence", "monthly_value"]
// When action not specified, filter to workflow-relevant actions
const actions = input.action ? [input.action] : ["create", "approve", "reject", "close", "reopen"]

where.entityType = { in: entityTypes }
where.action = { in: actions }
```

### 7.2 Time String Conversion (for terminal bookings)

The Go code uses `timeutil.MinutesToString()` to convert minutes-from-midnight to "HH:MM" format. In TypeScript:
```typescript
function minutesToTimeString(minutes: number): string {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
}
```

### 7.3 Prisma Include Objects

**Daily values:**
```typescript
const evalDailyValueInclude = {
    employee: {
        select: { id: true, personnelNumber: true, firstName: true, lastName: true, isActive: true, departmentId: true }
    }
}
```

**Bookings / Terminal bookings:**
```typescript
const evalBookingInclude = {
    employee: {
        select: { id: true, personnelNumber: true, firstName: true, lastName: true, departmentId: true }
    },
    bookingType: {
        select: { id: true, code: true, name: true, direction: true }
    }
}
```

**Logs / Workflow history:**
```typescript
const evalLogInclude = {
    user: {
        select: { id: true, displayName: true }
    }
}
```

## 8. Files to Create/Modify

### New files:
1. `apps/web/src/server/routers/evaluations.ts` -- the main router (5 query procedures)

### Files to modify:
1. `apps/web/src/server/root.ts` -- add import and registration for `evaluationsRouter`
2. `apps/web/src/hooks/api/use-evaluations.ts` -- rewrite to use tRPC hooks

## 9. Gaps and Concerns

### 9.1 IncludeNoBookings filter
The Go `EvalDailyValueFilter` has an `IncludeNoBookings` field, but the `DailyValueListOptions` does not show this being used in the repo. The frontend hook sends it. Need to verify if this was ever implemented at the repo level -- if not, skip it in the tRPC port.

### 9.2 DepartmentID filter on logs/workflow
The Go `EvalLogFilter` and `EvalWorkflowFilter` have a `DepartmentID` field, but the `AuditLogFilter` in the repository does NOT have a `DepartmentID` field. The handler sets `filter.DepartmentID` but it is never used in the repo query. The frontend hook sends `department_id` for logs. This was likely a planned but unimplemented filter. Skip it in the tRPC port.

### 9.3 EmployeeID filter on logs/workflow
Similarly, the handler sets `EmployeeID` on log filters but the `AuditLogFilter` does not support employee filtering. Audit logs are entity-based, not employee-based. The frontend sends `employee_id` but it is not actually used. Accept the parameter for API compatibility but do not filter by it (or log a warning).

### 9.4 Data scope on logs
The Go handler does NOT call `scopeFromContext()` for logs or workflow history. These are admin-only views. The tRPC implementation should match this behavior (no `applyDataScope()` for logs/workflow).

### 9.5 Balance computation
The Go `mapDailyValueToEval` computes `balanceMinutes` as `dv.Balance()` which is `overtime - undertime`. This needs to be computed in the TypeScript mapper, not stored in Prisma.

### 9.6 No separate WorkflowEvent model
Workflow history reuses the `AuditLog` model with filtered entity types and actions. There is no separate Prisma model to create.

### 9.7 Pagination consistency
The Go response uses `data` + `meta` (with `limit` and `total`). The existing tRPC routers in this codebase use `items` + `total`. Use the `items` + `total` pattern to stay consistent with the rest of the tRPC codebase.
