# Research: ZMI-TICKET-235 - Calculate-Day Endpoint + Booking Create mit Recalc

Date: 2026-03-08

## 1. Existing tRPC Routers

### 1.1 Root Router (`apps/web/src/server/root.ts`)

All routers are merged in `createTRPCRouter({...})` at line 70-130. Currently 55+ routers registered. Key ones for this ticket:

| Router | Key | File |
|---|---|---|
| employees | `employees` | `apps/web/src/server/routers/employees.ts` |
| bookings | `bookings` | `apps/web/src/server/routers/bookings.ts` |
| employeeDayPlans | `employeeDayPlans` | `apps/web/src/server/routers/employeeDayPlans.ts` |

### 1.2 tRPC Architecture (`apps/web/src/server/trpc.ts`)

**Context type** (line 39-49):
```typescript
export type TRPCContext = {
  prisma: PrismaClient
  authToken: string | null
  user: ContextUser | null
  session: Session | null
  tenantId: string | null
}
```

**Procedure types** (lines 153-224):
- `publicProcedure` -- no auth
- `protectedProcedure` -- requires valid user + session
- `tenantProcedure` -- extends protectedProcedure, requires tenantId + validates user tenant access via `userTenants`

**Middleware exports** (`apps/web/src/server/index.ts`, line 11-16):
```typescript
export { requirePermission, requireSelfOrPermission, requireEmployeePermission, applyDataScope } from "./middleware/authorization"
```

### 1.3 Employees Router (`apps/web/src/server/routers/employees.ts`)

Currently has 6 procedures: `list`, `getById`, `create`, `update`, `delete`, `search`, `bulkAssignTariff`.

**No `dayView` or `calculateDay` procedures exist** -- these need to be added.

The router uses `tenantProcedure` + `requirePermission(EMPLOYEES_VIEW)` + `applyDataScope()` pattern.

### 1.4 Bookings Router (`apps/web/src/server/routers/bookings.ts`)

Has 5 procedures: `list`, `getById`, `create`, `update`, `delete`.

**All three mutation procedures have TODO comments for TICKET-235 recalculation:**
- Line 677: `// TODO: TICKET-235 -- trigger recalculation for the affected day` (create)
- Line 736: `// TODO: TICKET-235 -- trigger recalculation for the affected day` (update)
- Line 787: `// TODO: TICKET-235 -- trigger recalculation for the affected day` (delete)

### 1.5 Permission Constants

Permission IDs are generated deterministically from keys via UUID v5 (`apps/web/src/server/lib/permission-catalog.ts`).

Relevant permissions for this ticket:
- `time_tracking.view_own` -- used for self-access to day view
- `time_tracking.view_all` -- used for viewing any employee's day view
- `time_tracking.edit` -- used for bookings and calculateDay mutation

The bookings router already uses these (lines 36-39):
```typescript
const VIEW_OWN = permissionIdByKey("time_tracking.view_own")!
const VIEW_ALL = permissionIdByKey("time_tracking.view_all")!
const EDIT = permissionIdByKey("time_tracking.edit")!
const DELETE_BOOKINGS = permissionIdByKey("booking_overview.delete_bookings")!
```

### 1.6 Authorization Middleware (`apps/web/src/server/middleware/authorization.ts`)

**`requirePermission(...permissionIds: string[])`** (line 39-58):
Checks if user has ANY of the specified permissions (OR logic). Uses `hasAnyPermission()` which checks UserGroup permissions or admin role.

**`requireEmployeePermission(employeeIdGetter, ownPermission, allPermission)`** (line 118-159):
Handles "own vs all" access patterns. If user's employeeId matches target -> allows with either ownPermission or allPermission. If different employee -> requires allPermission only. Admin bypass built in.

**`applyDataScope()`** (line 186-201):
Reads `user.dataScopeType`, `dataScopeTenantIds`, `dataScopeDepartmentIds`, `dataScopeEmployeeIds` and adds `DataScope` to context.

---

## 2. DailyCalcService

### 2.1 TypeScript DailyCalcService (Already Exists)

**Location**: `apps/web/src/server/services/daily-calc.ts`
**Status**: Fully ported from Go, ~850 lines of service code

The service class exists and is fully functional:

```typescript
// apps/web/src/server/services/daily-calc.ts, line 94-95
export class DailyCalcService {
  constructor(private prisma: PrismaClient) {}
```

**Public methods:**

1. **`calculateDay(tenantId, employeeId, date): Promise<DailyValue | null>`** (line 107-223)
   - Main entry point, ported from Go CalculateDay()
   - Returns the calculated and persisted DailyValue, or null if calculation should be skipped

2. **`calculateDateRange(tenantId, employeeId, fromDate, toDate): Promise<{count, values}>`** (line 231-257)
   - Iterates day-by-day calling calculateDay()
   - Returns count of processed days and array of DailyValue results

### 2.2 Supporting Files

- **Types**: `apps/web/src/server/services/daily-calc.types.ts` -- All TypeScript types, constants, and Prisma include types
- **Helpers**: `apps/web/src/server/services/daily-calc.helpers.ts` -- Pure functions (sameDate, bookingDirection, applyDayChangeBehavior, etc.)
- **Tests**: `apps/web/src/server/services/__tests__/daily-calc.test.ts` and `daily-calc.helpers.test.ts`

### 2.3 Calculation Engine (`apps/web/src/lib/calculation/`)

Fully ported pure math library. Key export:

```typescript
// apps/web/src/lib/calculation/calculator.ts, line 42
export function calculate(input: CalculationInput): CalculationResult
```

**Files:**
| File | Purpose |
|---|---|
| `calculator.ts` | Main orchestrator |
| `pairing.ts` | Booking pairing (IN/OUT) |
| `tolerance.ts` | Come/go tolerance application |
| `rounding.ts` | Time rounding |
| `breaks.ts` | Break deduction, overtime/undertime |
| `capping.ts` | Window capping, max net time capping |
| `surcharges.ts` | Surcharge/bonus calculation |
| `shift-detection.ts` | Shift auto-detection |
| `errors.ts` | Error/warning code constants |
| `types.ts` | All input/output type definitions |
| `time.ts` | Time normalization utilities |
| `index.ts` | Public API re-exports |

---

## 3. Bookings CRUD (ZMI-TICKET-232)

### 3.1 Bookings Router Structure (`apps/web/src/server/routers/bookings.ts`)

**Router**: `bookingsRouter` (line 460), exported from the file.

**Procedures:**

| Procedure | Type | Permission | Input | Description |
|---|---|---|---|---|
| `list` | query | `VIEW_ALL` + dataScope | page, pageSize, filters | Paginated list |
| `getById` | query | `VIEW_OWN` or `VIEW_ALL` + dataScope | id (uuid) | Single booking |
| `create` | mutation | `EDIT` + dataScope | employeeId, bookingTypeId, bookingDate, time (HH:MM), notes?, bookingReasonId? | Creates booking + derived |
| `update` | mutation | `EDIT` + dataScope | id, time?, notes? | Updates editedTime, clears calculatedTime |
| `delete` | mutation | `EDIT` + `DELETE_BOOKINGS` + dataScope | id (uuid) | Hard delete + derived in transaction |

### 3.2 Create Flow (lines 587-679)

1. `tenantProcedure.use(requirePermission(EDIT)).use(applyDataScope())`
2. Parse HH:MM time to minutes via `parseTimeString()`
3. Validate employee exists in tenant + data scope
4. Validate booking type exists + active
5. Validate booking reason if provided
6. `prisma.booking.create(...)` with source="web"
7. `createDerivedBookingIfNeeded(prisma, booking, userId)` -- best effort
8. **TODO: TICKET-235 -- trigger recalculation for the affected day** (line 677)
9. Return booking with includes

### 3.3 Update Flow (lines 691-739)

1. Fetch existing booking, check data scope
2. If time changed: parse, validate, set editedTime, clear calculatedTime
3. Update booking
4. **TODO: TICKET-235 -- trigger recalculation** (line 736)

### 3.4 Delete Flow (lines 750-791)

1. Fetch existing, check data scope
2. Transaction: delete derived bookings first, then delete booking
3. **TODO: TICKET-235 -- trigger recalculation** (line 787)

### 3.5 Booking Model (Prisma, schema.prisma:2757-2802)

```
Booking {
  id, tenantId, employeeId, bookingDate (@db.Date),
  bookingTypeId, originalTime, editedTime, calculatedTime?,
  pairId?, source?, terminalId?, notes?,
  bookingReasonId?, isAutoGenerated, originalBookingId?,
  createdAt, updatedAt, createdBy?, updatedBy?
}
```

Relations: tenant, employee, bookingType, bookingReason, originalBooking, derivedBookings

Index: `idx_bookings_employee_date` on [employeeId, bookingDate]

---

## 4. Go Source Code (Reference for Port)

### 4.1 Go Day-View Handler (`apps/api/internal/handler/booking.go`)

**`GetDayView`** (lines 564-643):
- Route: `GET /employees/{id}/day/{date}`
- Loads: bookings, dailyValue, empDayPlan, holiday
- Returns: `DayView` response with all components

```go
type DayView struct {
    EmployeeID *string
    Date       *date
    Bookings   []*Booking
    DailyValue struct{ DailyValue }
    DayPlan    struct{ ID, Code, Name, PlanType }
    Holiday    struct{ ID, Name }
    IsHoliday  bool
    Errors     []*DailyError
}
```

Data loading calls:
1. `bookingService.ListByEmployeeDate(ctx, tenantID, employeeID, date)` -- bookings for the day
2. `dailyValueRepo.GetByEmployeeDate(ctx, employeeID, date)` -- may be nil
3. `empDayPlanRepo.GetForEmployeeDate(ctx, employeeID, date)` -- may be nil (off day)
4. `holidayRepo.GetByDate(ctx, tenantID, date)` -- holiday check

### 4.2 Go Calculate Handler (`apps/api/internal/handler/booking.go`)

**`Calculate`** (lines 700-740):
- Route: `POST /employees/{id}/day/{date}/calculate`
- Calls `dailyCalcService.CalculateDay(ctx, tenantID, employeeID, date)`
- Returns the DailyValue response (or null if skipped)

### 4.3 Go Booking Service Recalc Trigger (`apps/api/internal/service/booking.go`)

The Go BookingService has a `recalcSvc` dependency (line 63):
```go
type recalcServiceForBooking interface {
    TriggerRecalc(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*RecalcResult, error)
}
```

After each mutation (Create/Update/Delete), it calls:
```go
_, _ = s.recalcSvc.TriggerRecalc(ctx, input.TenantID, input.EmployeeID, input.BookingDate)
```

- **Create** (line 166): `TriggerRecalc` after booking creation + derived booking
- **Update** (line 215): `TriggerRecalc` after save
- **Delete** (line 248): `TriggerRecalc` after deletion (stores date before delete)

### 4.4 Go RecalcService (`apps/api/internal/service/recalc.go`)

**`TriggerRecalc`** (lines 70-88):
1. Calls `dailyCalc.CalculateDay(ctx, tenantID, employeeID, date)`
2. If monthlyCalc is set, also calls `monthlyCalc.CalculateMonth(ctx, employeeID, date.Year(), date.Month())`
3. Returns `RecalcResult{ProcessedDays: 1}`

The recalculation is synchronous (same request). Errors from recalc are silently ignored (`_, _ =` pattern) in the booking service.

---

## 5. Frontend Hooks

### 5.1 `use-employee-day.ts` (`apps/web/src/hooks/api/use-employee-day.ts`)

**`useEmployeeDayView(employeeId, date, options)`** (lines 20-34):
```typescript
return useApiQuery('/employees/{id}/day/{date}', {
  path: { id: employeeId, date },
  enabled: enabled && !!employeeId && !!date,
  staleTime: 30 * 1000,
})
```
Uses `useApiQuery` which calls the Go REST API via openapi-fetch. Needs migration to tRPC.

**`useCalculateDay()`** (lines 45-49):
```typescript
return useApiMutation('/employees/{id}/day/{date}/calculate', 'post', {
  invalidateKeys: [['/employees'], ['/bookings'], ['/daily-values']],
})
```
Uses `useApiMutation` with query invalidation. Needs migration to tRPC.

### 5.2 `use-team-day-views.ts` (`apps/web/src/hooks/api/use-team-day-views.ts`)

**`useTeamDayViews({employeeIds, date, enabled, staleTime, refetchInterval})`** (lines 27-59):
```typescript
const queries = useQueries({
  queries: employeeIds.map((employeeId) => ({
    queryKey: ['/employees/{id}/day/{date}', undefined, { id: employeeId, date }],
    queryFn: async () => {
      const { data, error } = await api.GET('/employees/{id}/day/{date}' as never, {
        params: { path: { id: employeeId, date } },
      } as never)
      if (error) throw error
      return { employeeId, ...(data as Record<string, unknown>) }
    },
    ...
  })),
})
```
Uses `useQueries` from react-query with parallel fetches. Each query calls the Go REST API directly via `api.GET`.

**Return shape:** `{ data, isLoading, isError, refetchAll }`

---

## 6. Database Models (Prisma Schema)

### 6.1 Booking (schema.prisma:2757-2802)

```
id, tenantId, employeeId, bookingDate (Date), bookingTypeId,
originalTime (Int), editedTime (Int), calculatedTime (Int?),
pairId?, source? (VarChar(20), default "web"), terminalId?, notes?,
bookingReasonId?, isAutoGenerated (Boolean, default false), originalBookingId?,
createdAt, updatedAt, createdBy?, updatedBy?
```

Unique constraint: none on booking (multi per employee/date expected)
Index: `[employeeId, bookingDate]`

### 6.2 DailyValue (schema.prisma:2819-2866)

```
id, tenantId, employeeId, valueDate (Date),
status (VarChar(20), default "calculated"),
grossTime, netTime, targetTime, overtime, undertime, breakTime (all Int, default 0),
hasError (Boolean, default false),
errorCodes (String[]), warnings (String[]),
firstCome (Int?), lastGo (Int?), bookingCount (Int, default 0),
calculatedAt (Timestamptz?), calculationVersion (Int, default 1),
createdAt, updatedAt
```

**Unique**: `[employeeId, valueDate]` -- used for upsert conflict key

### 6.3 DailyAccountValue (schema.prisma:2880-2908)

```
id, tenantId, employeeId, accountId, valueDate (Date),
valueMinutes (Int, default 0), source (VarChar(20)), dayPlanId?,
createdAt, updatedAt
```

**Unique**: `[employeeId, valueDate, accountId, source]`

### 6.4 EmployeeDayPlan (schema.prisma:1952-1977)

```
id, tenantId, employeeId, planDate (Date), dayPlanId?, shiftId?,
source? (VarChar(20), default "tariff"), notes?,
createdAt, updatedAt
```

**Unique**: `[employeeId, planDate]`
Relations: tenant, employee, dayPlan (DayPlan?), shift (Shift?)

### 6.5 DayPlan (schema.prisma:1158-1264)

```
id, tenantId, code, name, description?, planType (default "fixed"),
comeFrom?, comeTo?, goFrom?, goTo?, coreStart?, coreEnd?,
regularHours (default 480), regularHours2?, fromEmployeeMaster (default false),
toleranceComePlus, toleranceComeMinus, toleranceGoPlus, toleranceGoMinus (all default 0),
roundingComeType?, roundingComeInterval?, roundingGoType?, roundingGoInterval?,
minWorkTime?, maxNetWorkTime?,
variableWorkTime (default false), roundAllBookings (default false),
roundingComeAddValue?, roundingGoAddValue?,
holidayCreditCat1?, holidayCreditCat2?, holidayCreditCat3?,
vacationDeduction (Decimal(5,2), default 1.00),
noBookingBehavior (default "error"), dayChangeBehavior (default "none"),
shiftDetectArriveFrom?, shiftDetectArriveTo?, shiftDetectDepartFrom?, shiftDetectDepartTo?,
shiftAltPlan1-6?,
netAccountId?, capAccountId?,
isActive, createdAt, updatedAt
```

Relations: breaks (DayPlanBreak[]), bonuses (DayPlanBonus[])

### 6.6 Holiday (schema.prisma:329-350)

```
id, tenantId, holidayDate (Date), name, holidayCategory (Int, default 1),
appliesToAll (Boolean, default true), departmentId?,
createdAt, updatedAt
```

**Unique**: `[tenantId, holidayDate]`

### 6.7 Tariff (schema.prisma:1384-1441)

```
id, tenantId, code, name, description?, weekPlanId?,
validFrom?, validTo?, isActive,
annualVacationDays?, workDaysPerWeek?, vacationBasis?,
dailyTargetHours?, weeklyTargetHours?, monthlyTargetHours?, annualTargetHours?,
maxFlextimePerMonth?, upperLimitAnnual?, lowerLimitAnnual?, flextimeThreshold?, creditType?,
rhythmType?, cycleDays?, rhythmStartDate?,
vacationCappingRuleGroupId?,
createdAt, updatedAt
```

---

## 7. Existing Patterns

### 7.1 How tRPC Routers Handle Permission Checks

Pattern from bookings router (line 470-473):
```typescript
list: tenantProcedure
  .use(requirePermission(VIEW_ALL))
  .use(applyDataScope())
  .input(listInputSchema)
  .output(outputSchema)
  .query(async ({ ctx, input }) => { ... })
```

Pattern for "own or all" from bookings getById (line 548-549):
```typescript
getById: tenantProcedure
  .use(requirePermission(VIEW_OWN, VIEW_ALL))
  .use(applyDataScope())
```

Pattern for employee-specific permission check using `requireEmployeePermission` (from `apps/web/src/server/middleware/authorization.ts`, line 118-159):
```typescript
.use(requireEmployeePermission(
  (input) => (input as { employeeId: string }).employeeId,
  ownPermission,
  allPermission
))
```

### 7.2 How Data Scope Is Applied

After `applyDataScope()` middleware runs, `ctx.dataScope` is available:
```typescript
const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
```

DataScope types: `"all" | "tenant" | "department" | "employee"`

Each router implements its own `buildDataScopeWhere()` and `checkDataScope()` functions.

### 7.3 How Mutations Trigger Side Effects

Currently, side effects are inline in the mutation body (not via events or hooks):

```typescript
// Bookings router create, line 662-674:
try {
  await createDerivedBookingIfNeeded(ctx.prisma, booking, ctx.user!.id)
} catch {
  console.error("Failed to create derived booking for booking", booking.id)
}
```

The Go backend uses a `recalcSvc.TriggerRecalc()` call after each mutation. The TS port should follow the same pattern: call `dailyCalcService.calculateDay()` inline after the mutation, with best-effort error handling.

### 7.4 Service Class Pattern

The `DailyCalcService` class (`apps/web/src/server/services/daily-calc.ts`) is a **new pattern** for this codebase. It takes a `PrismaClient` in its constructor:

```typescript
export class DailyCalcService {
  constructor(private prisma: PrismaClient) {}
}
```

To use from a tRPC router procedure:
```typescript
const service = new DailyCalcService(ctx.prisma)
await service.calculateDay(tenantId, employeeId, date)
```

This is the first service class in the TS codebase. All other routers put logic directly in procedure handlers.

---

## 8. Go DayView Response Structure

The Go handler builds this response at `apps/api/internal/handler/booking.go` lines 646-698:

```go
response := &models.DayView{
    EmployeeID: empIDStr,
    Date:       dateStr,
    Bookings:   []*Booking,      // All bookings for the day
    IsHoliday:  bool,
    DailyValue: struct{ DailyValue }, // May be nil
    DayPlan:    struct{ ID, Code, Name, PlanType }, // Summary from EmployeeDayPlan.DayPlan
    Holiday:    struct{ ID, Name }, // If holiday exists
    Errors:     []*DailyError,   // From DailyValue error codes
}
```

The DailyValue response includes (lines 743-777):
```go
DailyValue {
    ID, TenantID, EmployeeID, ValueDate,
    GrossMinutes, NetMinutes, TargetMinutes,
    OvertimeMinutes, UndertimeMinutes, BreakMinutes,
    BalanceMinutes, // = NetTime - TargetTime (calculated method)
    HasErrors, Status, Errors []*DailyError
}
```

DailyError structure (lines 779-821):
```go
DailyError {
    ID, DailyValueID, ErrorType, Message, Severity
}
```

Error types map from calculation error codes to UI categories:
- `MISSING_COME`, `MISSING_GO`, `NO_BOOKINGS` -> "missing_booking"
- `UNPAIRED_BOOKING` -> "unpaired_booking"
- `DUPLICATE_IN_TIME` -> "overlapping_bookings"
- `EARLY_COME`, `LATE_COME`, `MISSED_CORE_START`, etc. -> "core_time_violation"
- `BELOW_MIN_WORK_TIME` -> "below_min_hours"
- Break warnings -> "break_violation"
- `MAX_TIME_REACHED` -> "exceeds_max_hours"
- Others -> "invalid_sequence"

---

## 9. Summary of What Needs to Be Built

### 9.1 New tRPC Procedures

1. **`employees.dayView`** query -- Returns bookings, dailyValue, dayPlan, holiday for an employee on a date
2. **`employees.calculateDay`** mutation -- Triggers `DailyCalcService.calculateDay()`

### 9.2 Booking Recalc Integration

After each booking mutation (create/update/delete), call:
```typescript
const service = new DailyCalcService(ctx.prisma)
await service.calculateDay(tenantId, employeeId, bookingDate)
```

This replaces the three TODO comments in `apps/web/src/server/routers/bookings.ts` at lines 677, 736, and 787.

### 9.3 Frontend Hook Migration

1. `useEmployeeDayView` -> call `trpc.employees.dayView.useQuery()`
2. `useCalculateDay` -> call `trpc.employees.calculateDay.useMutation()`
3. `useTeamDayViews` -> call `trpc.employees.dayView.useQuery()` via `useQueries`

### 9.4 Key Dependencies (All Exist)

- DailyCalcService: `apps/web/src/server/services/daily-calc.ts` (fully ported)
- Calculation Engine: `apps/web/src/lib/calculation/` (fully ported)
- Bookings CRUD: `apps/web/src/server/routers/bookings.ts` (fully ported)
- Prisma models: Booking, DailyValue, DailyAccountValue, EmployeeDayPlan, DayPlan, Holiday (all exist)
- Authorization middleware: requirePermission, requireEmployeePermission, applyDataScope (all exist)
- Permission catalog: time_tracking.view_own, view_all, edit (all exist)
