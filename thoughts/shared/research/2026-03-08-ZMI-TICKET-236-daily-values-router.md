# Research: ZMI-TICKET-236 - Daily Values Router (List, Approve, Recalculate)

Date: 2026-03-08

## 1. Go Source Code Analysis

### 1.1 DailyValue Service (`apps/api/internal/service/dailyvalue.go`, 101 lines)

**Struct and dependencies:**
```go
type DailyValueService struct {
    repo            dailyValueRepositoryForService
    notificationSvc *NotificationService
}
```

**Interface required from repository:**
```go
type dailyValueRepositoryForService interface {
    GetByID(ctx context.Context, id uuid.UUID) (*model.DailyValue, error)
    ListAll(ctx context.Context, tenantID uuid.UUID, opts model.DailyValueListOptions) ([]model.DailyValue, error)
    Update(ctx context.Context, dv *model.DailyValue) error
}
```

**Methods:**
| Method | Signature | Logic |
|---|---|---|
| `ListAll` | `(ctx, tenantID, opts) -> ([]DailyValue, error)` | Delegates to `repo.ListAll` |
| `GetByID` | `(ctx, tenantID, id) -> (*DailyValue, error)` | Gets by ID, verifies `dv.TenantID == tenantID` |
| `Approve` | `(ctx, tenantID, id) -> (*DailyValue, error)` | Gets by ID, checks `!HasError && Status != Error && Status != Approved`, sets status to approved, calls `repo.Update`, then `notifyTimesheetApproved` |

**Approval validation rules:**
1. `dv.HasError || dv.Status == "error"` -> `ErrDailyValueHasErrors`
2. `dv.Status == "approved"` -> `ErrDailyValueNotApprovable`
3. On success: sets `dv.Status = "approved"`, calls `repo.Update(dv)`, sends notification

**Notification on approval** (`notifyTimesheetApproved`):
- Type: `approvals`
- Title: "Timesheet approved"
- Message: `"Your timesheet for {date} was approved."`
- Link: `/timesheet?view=day&date={date}`
- Created via `NotificationService.CreateForEmployee(ctx, tenantID, employeeID, input)`

**Error constants:**
```go
ErrDailyValueNotFound      = errors.New("daily value not found")
ErrDailyValueHasErrors     = errors.New("daily value has errors")
ErrDailyValueNotApprovable = errors.New("daily value is not approvable")
```

### 1.2 DailyValue Handler (`apps/api/internal/handler/dailyvalue.go`, 383 lines)

**Endpoints:**
| Method | Path | Handler | Permission |
|---|---|---|---|
| GET | `/daily-values` | `ListAll` | `time_tracking.view_all` |
| GET | `/daily-values/{id}` | `Get` | `time_tracking.view_all` |
| POST | `/daily-values/{id}/approve` | `Approve` | `time_tracking.approve` |
| POST | `/daily-values/recalculate` | `Recalculate` | `booking_overview.calculate_day` |

**ListAll handler logic:**
1. Gets `tenantID` from context
2. Gets `scope` from context via `scopeFromContext()`
3. Validates `scope.AllowsTenant(tenantID)`
4. Builds `DailyValueListOptions` with scope fields (`ScopeType`, `ScopeDepartmentIDs`, `ScopeEmployeeIDs`)
5. Parses optional query params: `employee_id`, `status`, `from`, `to`, `has_errors`
6. When `employee_id` is provided, calls `ensureEmployeeScope()` to verify access
7. Valid status values: `pending`, `calculated`, `error`, `approved`
8. Calls `dailyValueService.ListAll(ctx, tenantID, opts)`
9. Maps results using `dailyValueToResponse()`

**Get handler logic:**
1. Gets `tenantID`, parses `{id}` URL param
2. Calls `dailyValueService.GetByID(ctx, tenantID, id)`
3. Calls `ensureEmployeeScope(ctx, dv.EmployeeID)` for data scope check
4. Maps to response

**Approve handler logic:**
1. Gets `tenantID`, parses `{id}` URL param
2. Gets daily value via `GetByID` first
3. Calls `ensureEmployeeScope(ctx, existing.EmployeeID)` for data scope check
4. Calls `dailyValueService.Approve(ctx, tenantID, id)`
5. Error mapping: NotFound->404, HasErrors->400, NotApprovable->400

**Recalculate handler logic:**
1. Parses JSON body: `{ from, to, employee_id }`
2. Validates `from <= to`
3. If `employee_id` provided: calls `recalcService.TriggerRecalcRange(ctx, tenantID, empID, from, to)`
4. If no employee_id: calls `recalcService.TriggerRecalcAll(ctx, tenantID, from, to)`
5. Returns 202 with `{ message, affected_days }`

**ensureEmployeeScope helper:**
1. Gets employee via `employeeService.GetByID(ctx, employeeID)`
2. Gets scope via `scopeFromContext(ctx)`
3. Checks `scope.AllowsTenant(tenantID)` and `scope.AllowsEmployee(emp)`
4. Returns `errDailyValueScopeDenied` if denied

**Response mapping** (`dailyValueToResponse`):
Maps Go `model.DailyValue` to `models.DailyValue` (OpenAPI generated). Key fields:
- `id`, `tenant_id`, `employee_id`, `value_date`, `status`
- `gross_minutes`, `net_minutes`, `target_minutes`, `overtime_minutes`, `undertime_minutes`, `break_minutes`
- `balance_minutes` (computed: `overtime - undertime`)
- `has_errors`, `calculated_at`
- Nested `employee` object with `id`, `first_name`, `last_name`, `personnel_number`, `is_active`, `department_id`, `tariff_id`

### 1.3 DailyValue Repository (`apps/api/internal/repository/dailyvalue.go`, 299 lines)

**Methods:**
| Method | Description | Used by TICKET-236 |
|---|---|---|
| `Create` | Creates a new daily value | No (used by calc) |
| `GetByID` | Retrieves by UUID | Yes |
| `Update` | Saves (full update) | Yes (Approve) |
| `Delete` | Deletes by UUID | No |
| `GetByEmployeeDate` | Returns nil, nil if not found | No (used by calc) |
| `GetByEmployeeDateRange` | Employee + date range query | No |
| `ListAll` | Filtered list with scope, preloads Employee + Department | Yes |
| `Upsert` | On conflict (employee_id, value_date) | No (used by calc) |
| `BulkUpsert` | Batch upsert, batch size 100 | No |
| `GetWithErrors` | Tenant + date range + `has_error=true` | No |
| `SumForMonth` | Aggregate sums for employee/month | No |
| `DeleteByDateRange` | Bulk delete in range | No |
| `CountByDateRange` | Count in range | No |
| `DeleteRange` | Delete for employee in range | No |

**ListAll query details:**
```go
q := r.db.GORM.WithContext(ctx).
    Preload("Employee").
    Preload("Employee.Department").
    Where("tenant_id = ?", tenantID)
```
Filters: `employee_id`, `department_id` (via JOIN on employees), `status`, `from` (value_date >=), `to` (value_date <=), `has_error`.

Data scope filtering:
- `DataScopeDepartment`: JOIN employees, filter by `employees.department_id IN ?`
- `DataScopeEmployee`: filter by `employee_id IN ?`
- Empty scope arrays -> `WHERE 1 = 0` (no results)

Supports `Limit` and `Offset` for pagination. Orders by `value_date ASC`.

### 1.4 DailyAccountValue Service (`apps/api/internal/service/daily_account_value.go`, 44 lines)

**Interface:**
```go
type dailyAccountValueRepository interface {
    List(ctx, tenantID, opts) -> ([]DailyAccountValue, error)
    GetByEmployeeDate(ctx, employeeID, date) -> ([]DailyAccountValue, error)
    SumByAccountAndRange(ctx, employeeID, accountID, from, to) -> (int, error)
    Upsert(ctx, *DailyAccountValue) -> error
    DeleteByEmployeeDate(ctx, employeeID, date) -> error
}
```

**Methods (only `List` is relevant for TICKET-236):**
| Method | Signature | Logic |
|---|---|---|
| `List` | `(ctx, tenantID, opts) -> ([]DailyAccountValue, error)` | Delegates to `repo.List` |
| `GetByEmployeeDate` | `(ctx, employeeID, date)` | Delegates to repo |
| `SumByAccountAndRange` | `(ctx, employeeID, accountID, from, to)` | Delegates to repo |

### 1.5 DailyAccountValue Handler (`apps/api/internal/handler/daily_account_value.go`, 88 lines)

**Endpoints:**
| Method | Path | Handler | Permission |
|---|---|---|---|
| GET | `/daily-account-values` | `List` | `accounts.manage` |

**List handler logic:**
1. Gets `tenantID` from context
2. Parses optional query params: `employee_id`, `account_id`, `from`, `to`, `source`
3. Valid source values: `net_time`, `capped_time`
4. Calls `svc.List(ctx, tenantID, opts)`
5. Returns `{ data: values }`

### 1.6 DailyAccountValue Repository (`apps/api/internal/repository/daily_account_value.go`, 149 lines)

**Methods:**
| Method | Description | Used by TICKET-236 |
|---|---|---|
| `Upsert` | On conflict (employee_id, value_date, account_id, source) | No (used by calc) |
| `GetByID` | Retrieves by UUID, preloads Account | No |
| `List` | Filtered list, preloads Account | Yes |
| `GetByEmployeeDate` | Employee + date, preloads Account | No (used by calc) |
| `DeleteByEmployeeDate` | Delete all for employee/date | No (used by calc) |
| `DeleteByEmployeeDateAndSource` | Delete by employee/date/source | No |
| `SumByAccountAndRange` | SUM(value_minutes) for employee/account/range | No |

**List query details:**
```go
q := r.db.GORM.WithContext(ctx).
    Preload("Account").
    Where("tenant_id = ?", tenantID)
```
Filters: `employee_id`, `account_id`, `from` (value_date >=), `to` (value_date <=), `source`.
Orders by `value_date ASC, source ASC`.

### 1.7 Go Domain Models

**DailyValue** (`apps/api/internal/model/dailyvalue.go`):
```go
type DailyValue struct {
    ID, TenantID, EmployeeID uuid.UUID
    ValueDate               time.Time  // date only
    Status                  DailyValueStatus  // "pending"|"calculated"|"error"|"approved"
    GrossTime, NetTime, TargetTime, Overtime, Undertime, BreakTime int // all minutes
    HasError                bool
    ErrorCodes              pq.StringArray  // text[]
    Warnings                pq.StringArray  // text[]
    FirstCome, LastGo       *int           // minutes from midnight (0-1439)
    BookingCount            int
    CalculatedAt            *time.Time
    CalculationVersion      int
    CreatedAt, UpdatedAt    time.Time
    Employee                *Employee  // relation
}
```

**Balance** computed: `func (dv *DailyValue) Balance() int { return dv.Overtime - dv.Undertime }`

**DailyValueListOptions:**
```go
type DailyValueListOptions struct {
    EmployeeID         *uuid.UUID
    DepartmentID       *uuid.UUID
    Status             *DailyValueStatus
    From               *time.Time
    To                 *time.Time
    HasErrors          *bool
    ScopeType          DataScopeType
    ScopeDepartmentIDs []uuid.UUID
    ScopeEmployeeIDs   []uuid.UUID
    Limit              int
    Offset             int
}
```

**DailyAccountValue** (`apps/api/internal/model/daily_account_value.go`):
```go
type DailyAccountValue struct {
    ID, TenantID, EmployeeID, AccountID uuid.UUID
    ValueDate                           time.Time
    ValueMinutes                        int
    Source                              DailyAccountValueSource  // "net_time"|"capped_time"|"surcharge"
    DayPlanID                           *uuid.UUID
    CreatedAt, UpdatedAt                time.Time
    Account                             *Account   // relation
    Employee                            *Employee  // relation
}
```

**DailyAccountValueSource constants:** `net_time`, `capped_time`, `surcharge`

**DailyAccountValueListOptions:**
```go
type DailyAccountValueListOptions struct {
    EmployeeID *uuid.UUID
    AccountID  *uuid.UUID
    From       *time.Time
    To         *time.Time
    Source     *DailyAccountValueSource
}
```

## 2. Prisma Schema

### 2.1 DailyValue (`apps/web/prisma/schema.prisma`, line 2819-2866)

```prisma
model DailyValue {
  id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId           String    @map("tenant_id") @db.Uuid
  employeeId         String    @map("employee_id") @db.Uuid
  valueDate          DateTime  @map("value_date") @db.Date
  status             String    @default("calculated") @db.VarChar(20)
  grossTime          Int       @default(0) @map("gross_time")
  netTime            Int       @default(0) @map("net_time")
  targetTime         Int       @default(0) @map("target_time")
  overtime           Int       @default(0)
  undertime          Int       @default(0)
  breakTime          Int       @default(0) @map("break_time")
  hasError           Boolean   @default(false) @map("has_error")
  errorCodes         String[]  @map("error_codes")
  warnings           String[]
  firstCome          Int?      @map("first_come")
  lastGo             Int?      @map("last_go")
  bookingCount       Int       @default(0) @map("booking_count")
  calculatedAt       DateTime? @map("calculated_at") @db.Timestamptz(6)
  calculationVersion Int       @default(1) @map("calculation_version")
  createdAt          DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime  @default(now()) @map("updated_at") @db.Timestamptz(6)

  tenant   Tenant   @relation(...)
  employee Employee @relation(...)

  @@unique([employeeId, valueDate])
  @@index([tenantId])
  @@index([employeeId])
  @@index([valueDate])
  @@index([employeeId, valueDate])
  @@index([status])
  @@map("daily_values")
}
```

### 2.2 DailyAccountValue (`apps/web/prisma/schema.prisma`, line 2880-2908)

```prisma
model DailyAccountValue {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String    @map("tenant_id") @db.Uuid
  employeeId   String    @map("employee_id") @db.Uuid
  accountId    String    @map("account_id") @db.Uuid
  valueDate    DateTime  @map("value_date") @db.Date
  valueMinutes Int       @default(0) @map("value_minutes")
  source       String    @db.VarChar(20)
  dayPlanId    String?   @map("day_plan_id") @db.Uuid

  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt    DateTime  @default(now()) @map("updated_at") @db.Timestamptz(6)

  tenant   Tenant   @relation(...)
  employee Employee @relation(...)
  account  Account  @relation(...)
  dayPlan  DayPlan? @relation(...)

  @@unique([employeeId, valueDate, accountId, source])
  @@index([tenantId])
  @@index([employeeId])
  @@index([accountId])
  @@index([valueDate])
  @@index([employeeId, valueDate])
  @@map("daily_account_values")
}
```

**Note from schema comment:** "This table has NO FK to daily_values. It is independently keyed by (employee_id, value_date, account_id, source)."

### 2.3 Account model (related to DailyAccountValue)

Key fields used in DailyAccountValue list responses:
```prisma
model Account {
  id                String   @id @db.Uuid
  tenantId          String?  @map("tenant_id") @db.Uuid
  code              String   @db.VarChar(50)
  name              String   @db.VarChar(255)
  accountType       String   @map("account_type") @db.VarChar(20)
  unit              String   @default("minutes") @db.VarChar(20)
  isSystem          Boolean  @default(false) @map("is_system")
  isActive          Boolean  @default(true) @map("is_active")
  // ... more fields
}
```

## 3. Existing tRPC Router Patterns

### 3.1 Bookings Router (`apps/web/src/server/routers/bookings.ts`)

This is the primary reference pattern (from TICKET-232).

**Structure pattern:**
1. Permission constants at top using `permissionIdByKey()`
2. Output schemas using Zod (`bookingOutputSchema`, nested relation schemas)
3. Input schemas using Zod (with `.optional().default()` for pagination)
4. Prisma include objects as constants (`bookingListInclude`)
5. Helper functions (parsing, validation)
6. Data scope helper functions (`buildBookingDataScopeWhere`, `checkBookingDataScope`)
7. Router definition: `export const bookingsRouter = createTRPCRouter({...})`

**List procedure pattern:**
```typescript
list: tenantProcedure
  .use(requirePermission(VIEW_ALL))
  .use(applyDataScope())
  .input(listInputSchema)
  .output(z.object({ items: z.array(outputSchema), total: z.number() }))
  .query(async ({ ctx, input }) => {
    const tenantId = ctx.tenantId!
    const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

    const where: Record<string, unknown> = { tenantId }
    // ... build where clause from input
    // ... apply data scope
    const scopeWhere = buildBookingDataScopeWhere(dataScope)
    if (scopeWhere) Object.assign(where, scopeWhere)

    const [items, total] = await Promise.all([
      ctx.prisma.booking.findMany({ where, include, skip, take, orderBy }),
      ctx.prisma.booking.count({ where }),
    ])
    return { items: items.map(mapToOutput), total }
  })
```

**Data scope WHERE clause pattern (for employee-owned entities):**
```typescript
function buildBookingDataScopeWhere(dataScope: DataScope): Record<string, unknown> | null {
  if (dataScope.type === "department") {
    return { employee: { departmentId: { in: dataScope.departmentIds } } }
  } else if (dataScope.type === "employee") {
    return { employeeId: { in: dataScope.employeeIds } }
  }
  return null
}
```

### 3.2 Employees Router (`apps/web/src/server/routers/employees.ts`)

**dayView procedure** (line 1420-1534) -- existing pattern for loading daily values:
```typescript
dayView: tenantProcedure
  .use(requireEmployeePermission(
    (input) => (input as { employeeId: string }).employeeId,
    TIME_TRACKING_VIEW_OWN,
    TIME_TRACKING_VIEW_ALL
  ))
  .use(applyDataScope())
  .input(dayViewInputSchema)  // { employeeId, date }
  .output(dayViewOutputSchema)
  .query(async ({ ctx, input }) => {
    // Loads: bookings, dailyValue (via findUnique), empDayPlan, holiday
    // dailyValue uses: prisma.dailyValue.findUnique({ where: { employeeId_valueDate } })
    // Maps errors via mapErrorCodesToErrors()
  })
```

**dayViewDailyValueSchema** output shape:
```typescript
z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  valueDate: z.date(),
  status: z.string(),
  grossTime: z.number().int(),
  netTime: z.number().int(),
  targetTime: z.number().int(),
  overtime: z.number().int(),
  undertime: z.number().int(),
  breakTime: z.number().int(),
  balanceMinutes: z.number().int(),
  hasError: z.boolean(),
  errorCodes: z.array(z.string()),
  warnings: z.array(z.string()),
  firstCome: z.number().int().nullable(),
  lastGo: z.number().int().nullable(),
  bookingCount: z.number().int(),
  calculatedAt: z.date().nullable(),
})
```

### 3.3 Root Router (`apps/web/src/server/root.ts`)

All routers are merged at `createTRPCRouter({...})` at line 70-130. Currently 55+ routers registered. New routers (`dailyValues`, `dailyAccountValues`) need to be added here.

## 4. Authorization Middleware

### 4.1 Available Middleware (`apps/web/src/server/middleware/authorization.ts`)

| Middleware | Usage | Description |
|---|---|---|
| `requirePermission(...permissionIds)` | `.use(requirePermission(PERM_ID))` | Checks if user has ANY of the specified permissions (OR logic) |
| `requireSelfOrPermission(getter, permId)` | `.use(requireSelfOrPermission(fn, PERM_ID))` | Self-access or permission check |
| `requireEmployeePermission(getter, ownPerm, allPerm)` | `.use(requireEmployeePermission(fn, OWN, ALL))` | Own vs all employee-scoped access |
| `applyDataScope()` | `.use(applyDataScope())` | Adds `DataScope` to context |

**DataScope type:**
```typescript
type DataScope = {
  type: "all" | "tenant" | "department" | "employee"
  tenantIds: string[]
  departmentIds: string[]
  employeeIds: string[]
}
```

### 4.2 Permission IDs Needed

From Go route registration (`apps/api/internal/handler/routes.go`, lines 484-501):

| Permission Key | Usage | Available in catalog |
|---|---|---|
| `time_tracking.view_all` | ListAll, Get | Yes |
| `time_tracking.approve` | Approve | Yes |
| `booking_overview.calculate_day` | Recalculate | Yes |
| `time_tracking.view_own` | Employee-scoped list | Yes |
| `accounts.manage` | DailyAccountValue List | Yes |

All permissions exist in `apps/web/src/server/lib/permission-catalog.ts`.

### 4.3 Data Scope Pattern in DailyValue ListAll

The Go repository applies scope filtering as:
- `DataScopeDepartment`: JOIN employees, filter `employees.department_id IN ?`
- `DataScopeEmployee`: filter `employee_id IN ?`
- Empty scope arrays -> no results

In Prisma/tRPC, this translates to the same pattern used in bookings:
```typescript
if (dataScope.type === "department") {
  where.employee = { departmentId: { in: dataScope.departmentIds } }
} else if (dataScope.type === "employee") {
  where.employeeId = { in: dataScope.employeeIds }
}
```

## 5. Existing Frontend Hooks

### 5.1 `use-daily-values.ts` (`apps/web/src/hooks/api/use-daily-values.ts`)

**Current state:** Uses direct `fetch()` to Go API endpoints.

**Exported hooks:**

| Hook | Endpoint | Usage |
|---|---|---|
| `useDailyValues(options)` | `GET /employees/{id}/months/{year}/{month}/days` | Month view, week view |
| `useAllDailyValues(options)` | `GET /daily-values` | Admin approvals page |
| `useApproveDailyValue()` | `POST /daily-values/{id}/approve` | Admin approvals page |

**`useDailyValues` options:**
```typescript
interface UseDailyValuesOptions {
  employeeId?: string
  year?: number
  month?: number
  from?: string  // legacy compat
  to?: string    // legacy compat
  enabled?: boolean
}
```
Uses `useQuery` from `@tanstack/react-query`. Transforms response to add legacy field aliases (`date`, `target_minutes`, `gross_minutes`, etc.).

**`useAllDailyValues` options:**
```typescript
interface UseAllDailyValuesOptions {
  employeeId?: string
  from?: string
  to?: string
  status?: 'pending' | 'calculated' | 'error' | 'approved'
  hasErrors?: boolean
  enabled?: boolean
}
```
Uses `useApiQuery('/daily-values', { params })` -- a wrapper around the Go API.

**`useApproveDailyValue`:**
Uses `useApiMutation('/daily-values/{id}/approve', 'post')` with cache invalidation on `['/daily-values']`.

**Consumers:**
- `apps/web/src/components/timesheet/week-view.tsx` -- uses `useDailyValues`
- `apps/web/src/components/timesheet/month-view.tsx` -- uses `useDailyValues`
- `apps/web/src/app/[locale]/(dashboard)/timesheet/page.tsx` -- uses `useDailyValues`
- `apps/web/src/app/[locale]/(dashboard)/monthly-evaluation/page.tsx` -- uses `useDailyValues`
- `apps/web/src/app/[locale]/(dashboard)/admin/approvals/page.tsx` -- uses `useAllDailyValues`, `useApproveDailyValue`
- `apps/web/src/app/[locale]/(dashboard)/team-overview/page.tsx` -- uses `useTeamDailyValues`
- `apps/web/src/components/dashboard/hours-this-week-card.tsx` -- uses `useDailyValues`
- `apps/web/src/components/dashboard/pending-actions.tsx` -- uses `useDailyValues`

### 5.2 `use-team-daily-values.ts` (`apps/web/src/hooks/api/use-team-daily-values.ts`)

**Current state:** Uses `useQueries` from `@tanstack/react-query` with `api.GET('/daily-values')` per employee.

```typescript
interface UseTeamDailyValuesOptions {
  employeeIds: string[]
  from: string
  to: string
  enabled?: boolean
  staleTime?: number
}
```

Fires parallel queries (one per employee) to `GET /daily-values?employee_id=X&from=Y&to=Z&limit=100`.

Returns:
```typescript
{
  data: TeamDailyValuesResult[]  // { employeeId, values }
  isLoading: boolean
  isError: boolean
  refetchAll: () => void
}
```

**Consumer:** `apps/web/src/app/[locale]/(dashboard)/team-overview/page.tsx`

### 5.3 DailyValue Interface (Frontend Type)

Defined in `use-daily-values.ts`:
```typescript
export interface DailyValue {
  id: string
  employee_id: string
  value_date: string
  target_time: number
  gross_time: number
  break_time: number
  net_time: number
  overtime: number
  undertime: number
  has_error: boolean
  error_codes: string[] | null
  warnings: string[] | null
  booking_count: number
  first_come?: number
  last_go?: number
  // Legacy field aliases
  date?: string
  target_minutes?: number | null
  // ... more legacy fields
  status?: string
  calculated_at?: string | null
}
```

## 6. Existing DailyValue Usage in tRPC Layer

### 6.1 Employees Router - dayView

The `dayView` procedure (employees router, line 1420) already queries daily values via Prisma:
```typescript
const dailyValue = await ctx.prisma.dailyValue.findUnique({
  where: { employeeId_valueDate: { employeeId, valueDate: date } },
})
```

### 6.2 Correction Assistant Router

The `correctionAssistant.listItems` procedure (line 399) queries daily values:
```typescript
const rows = await ctx.prisma.dailyValue.findMany({
  where: dvWhere,
  include: { employee: { select: { firstName, lastName, departmentId, department: { select: { name } } } } },
  orderBy: { valueDate: "desc" },
})
```

### 6.3 System Settings Router

The `systemSettings` router has `deleteDailyValues` and `countDailyValues` helper functions that use `prisma.dailyValue.deleteMany` and `prisma.dailyValue.count`.

### 6.4 DailyCalcService

The `DailyCalcService` (`apps/web/src/server/services/daily-calc.ts`) creates/updates daily values via:
```typescript
private async upsertDailyValue(input: DailyValueInput): Promise<DailyValue> {
  return this.prisma.dailyValue.upsert({
    where: { employeeId_valueDate: { employeeId, valueDate } },
    create: { ... },
    update: { ... },
  })
}
```

## 7. Notification Pattern for Approval

### 7.1 Go Implementation

In `service/dailyvalue.go`, after approval:
```go
func (s *DailyValueService) notifyTimesheetApproved(ctx context.Context, dv *model.DailyValue) {
    dateLabel := dv.ValueDate.Format("2006-01-02")
    link := fmt.Sprintf("/timesheet?view=day&date=%s", dateLabel)
    _, _ = s.notificationSvc.CreateForEmployee(ctx, dv.TenantID, dv.EmployeeID, CreateNotificationInput{
        Type:    model.NotificationTypeApprovals,
        Title:   "Timesheet approved",
        Message: fmt.Sprintf("Your timesheet for %s was approved.", dateLabel),
        Link:    &link,
    })
}
```

### 7.2 tRPC Notification Pattern

The `DailyCalcService` uses direct Prisma for notifications:
```typescript
await this.prisma.notification.create({
  data: {
    tenantId,
    userId,     // looked up via user_tenants JOIN users WHERE u.employee_id = employeeId
    type: "errors",
    title: "Timesheet error",
    message: `Calculation error detected on ${dateLabel}.`,
    link,
  },
})
```

The user ID lookup for employee-based notifications:
```typescript
const userTenant = await this.prisma.$queryRaw<{ user_id: string }[]>`
  SELECT ut.user_id
  FROM user_tenants ut
  JOIN users u ON u.id = ut.user_id
  WHERE ut.tenant_id = ${tenantId}::uuid
    AND u.employee_id = ${employeeId}::uuid
  LIMIT 1
`
```

## 8. Go Route Registration (Reference)

From `apps/api/internal/handler/routes.go`:

**DailyValue routes (lines 484-501):**
```go
func RegisterDailyValueRoutes(r chi.Router, h *DailyValueHandler, authz *middleware.AuthorizationMiddleware) {
    viewAll := permissions.ID("time_tracking.view_all").String()
    approve := permissions.ID("time_tracking.approve").String()
    permCalculateDay := permissions.ID("booking_overview.calculate_day").String()

    r.With(authz.RequirePermission(viewAll)).Get("/daily-values", h.ListAll)
    r.With(authz.RequirePermission(permCalculateDay)).Post("/daily-values/recalculate", h.Recalculate)
    r.With(authz.RequirePermission(viewAll)).Get("/daily-values/{id}", h.Get)
    r.With(authz.RequirePermission(approve)).Post("/daily-values/{id}/approve", h.Approve)
}
```

**DailyAccountValue routes (lines 503-511):**
```go
func RegisterDailyAccountValueRoutes(r chi.Router, h *DailyAccountValueHandler, authz *middleware.AuthorizationMiddleware) {
    permView := permissions.ID("accounts.manage").String()
    r.With(authz.RequirePermission(permView)).Get("/daily-account-values", h.List)
}
```

## 9. Data Scope Implementation Summary

**Go flow:**
1. `scopeFromContext(ctx)` returns `access.Scope` from request context
2. Scope has `Type`, `DepartmentIDs`, `EmployeeIDs`
3. Repository applies scope as additional WHERE clauses
4. Handler calls `ensureEmployeeScope()` for per-employee access checks

**tRPC flow:**
1. `applyDataScope()` middleware adds `DataScope` to tRPC context
2. Router procedure accesses: `(ctx as unknown as { dataScope: DataScope }).dataScope`
3. Helper function builds Prisma WHERE from scope
4. Applied via `Object.assign(where, scopeWhere)`

**Scope types and their meaning:**
- `"all"` / `"tenant"`: no additional filtering (full tenant access)
- `"department"`: filter by `employee.departmentId IN departmentIds`
- `"employee"`: filter by `employeeId IN employeeIds`

## 10. Ticket Scope vs Existing Code Delta

### 10.1 Ticket requires `dailyValues.list` (employee monthly)

The Go endpoint for this is `GET /employees/{id}/months/{year}/{month}/days` (handled in `employee.go`), not directly in `dailyvalue.go`. The ticket specifies input `{ employeeId, year, month }` with `requireEmployeePermission("daily_values.read_own", "daily_values.read")`.

**Note:** The permission keys `daily_values.read_own` and `daily_values.read` do NOT exist in the permission catalog. The Go code uses `time_tracking.view_own` and `time_tracking.view_all` for equivalent access. The ticket's permission names appear to be aspirational/proposed.

The `useDailyValues` hook currently hits `GET /employees/{id}/months/{year}/{month}/days`. This needs to be mapped to a new `dailyValues.list` procedure that queries by employee + year/month.

### 10.2 Ticket requires `dailyValues.listAll` (admin view)

Maps directly to Go `GET /daily-values` (handler `ListAll`). The `useAllDailyValues` hook currently calls this endpoint.

### 10.3 Ticket requires `dailyValues.approve`

Maps to Go `POST /daily-values/{id}/approve` (handler `Approve`). The `useApproveDailyValue` hook currently calls this.

### 10.4 Ticket requires `dailyAccountValues.list`

Maps to Go `GET /daily-account-values` (handler `List`). The ticket specifies input `{ dailyValueId }` but Go uses `employee_id`, `account_id`, `from`, `to`, `source` filters. There is NO `daily_value_id` field on the `daily_account_values` table -- the table has no FK to `daily_values`. Daily account values are linked by `(employee_id, value_date)`, not by daily value ID.

### 10.5 Recalculate endpoint

The Go handler uses `RecalcService` which is separate from `DailyCalcService`. The `DailyCalcService` (already ported in TICKET-234) handles single-day calculation. The `RecalcService` orchestrates multi-day/multi-employee recalculation. This may be out of scope per ticket ("Out of scope: Tagesberechnung (TICKET-234, 235)").
