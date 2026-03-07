# Research: ZMI-TICKET-229 -- Employee Day Plans Router

Date: 2026-03-07
Ticket: ZMI-TICKET-229 -- Employee Day Plans Router (Bulk, Generate from Tariff)

---

## 1. Existing Go Implementation

### 1.1 Service Layer (`apps/api/internal/service/employeedayplan.go` -- 568 lines)

**Dependencies (repository interfaces):**
- `edpRepository` -- CRUD + BulkCreate + DeleteRange for EmployeeDayPlan
- `employeeRepositoryForEDP` -- GetByID for employee validation
- `dayPlanRepositoryForEDP` -- GetByID for day plan validation
- `shiftRepositoryForEDP` -- GetByID for shift validation (also auto-populates day_plan_id from shift)
- `tariffRepositoryForEDP` -- GetWithDetails for tariff (needed for GenerateFromTariff)
- `employeeListRepositoryForEDP` -- List employees with filter (needed for GenerateFromTariff)

**Error constants:**
- `ErrEmployeeDayPlanNotFound`
- `ErrEDPEmployeeReq` -- employee_id required
- `ErrEDPPlanDateReq` -- plan_date required
- `ErrEDPSourceReq` -- source required
- `ErrEDPInvalidSource` -- must be 'tariff', 'manual', or 'holiday'
- `ErrEDPInvalidDayPlan` -- invalid day plan reference
- `ErrEDPInvalidEmployee` -- invalid employee reference
- `ErrEDPInvalidShift` -- invalid shift reference
- `ErrEDPDateRangeReq` -- from and to dates required
- `ErrEDPDateRangeInvalid` -- from must not be after to
- `ErrGenerateRepoNotConfigured` -- tariff/employee repos not set

**Methods:**

1. **`List(ctx, ListEmployeeDayPlansInput) -> ([]EmployeeDayPlan, error)`**
   - Input: TenantID, EmployeeID (optional), From, To (required)
   - Validates date range is non-empty and from <= to

2. **`GetByID(ctx, uuid) -> (*EmployeeDayPlan, error)`**
   - Simple lookup, returns ErrEmployeeDayPlanNotFound on failure

3. **`Create(ctx, CreateEmployeeDayPlanInput) -> (*EmployeeDayPlan, error)`**
   - Validates: employee_id required, plan_date required, source required and valid
   - Validates employee exists and belongs to tenant
   - If ShiftID provided: validates shift exists, auto-populates DayPlanID from shift.DayPlanID if not explicitly set
   - If DayPlanID provided: validates day plan exists and belongs to tenant
   - Source is a required field with enum: 'tariff', 'manual', 'holiday'

4. **`Update(ctx, id, tenantID, UpdateEmployeeDayPlanInput) -> (*EmployeeDayPlan, error)`**
   - Supports ClearShiftID / ClearDayPlanID booleans for explicit null-setting
   - Same auto-populate logic: if shift set and day_plan not explicitly set, copies from shift
   - Source validation if provided

5. **`Delete(ctx, uuid) -> error`**
   - Checks existence first, then deletes

6. **`BulkCreate(ctx, BulkCreateInput) -> ([]EmployeeDayPlan, error)`**
   - Input: TenantID + []BulkCreateEntry (EmployeeID, PlanDate, DayPlanID?, ShiftID?, Source, Notes)
   - Validates every entry: employee, shift, day plan, source
   - Same auto-populate logic for shift->dayPlan
   - Calls repository BulkCreate (upsert on employee_id + plan_date)

7. **`DeleteRange(ctx, DeleteRangeInput) -> error`**
   - Input: EmployeeID, TenantID, From, To
   - Validates employee_id required, dates required and from <= to
   - Validates employee exists and belongs to tenant

8. **`GenerateFromTariff(ctx, GenerateFromTariffInput) -> (*GenerateFromTariffResult, error)`**
   - Input: TenantID, EmployeeIDs (optional -- empty means all active with tariff), From, To, OverwriteTariffSource
   - Logic:
     1. Get employees to process (specific IDs or all active for tenant)
     2. For each employee:
        a. Skip if no tariffId on employee
        b. Fetch tariff with full details (GetWithDetails)
        c. Calculate sync window: constrained by employee entry/exit date and tariff validity
        d. Get existing plans in range
        e. Build skip map: dates with source != 'tariff' are skipped (manual/holiday preserved)
        f. Iterate each day in window, call `tariff.GetDayPlanIDForDate(date)` to resolve day plan
        g. Create EmployeeDayPlan with source='tariff' for each resolved day
        h. BulkCreate (upsert) the plans
   - Result: { EmployeesProcessed, PlansCreated, PlansUpdated, EmployeesSkipped }

9. **`getTariffSyncWindow(emp, tariff, inputFrom, inputTo) -> (start, end, ok)`**
   - Constrains input date range by:
     - Employee entry date (start >= entryDate)
     - Employee exit date (end <= exitDate)
     - Tariff validity (start >= validFrom, end <= validTo)
   - Returns false if window is invalid (start > end)

### 1.2 Handler Layer (`apps/api/internal/handler/employeedayplan.go` -- 398 lines)

**Endpoints:**
- `List` -- GET, parses from/to/employee_id query params, date format YYYY-MM-DD
- `Get` -- GET with :id URL param
- `Create` -- POST, decodes `models.CreateEmployeeDayPlanRequest`
- `Update` -- PUT with :id URL param, decodes `models.UpdateEmployeeDayPlanRequest`
- `Delete` -- DELETE with :id URL param
- `BulkCreate` -- POST, decodes `models.BulkCreateEmployeeDayPlanRequest`, returns `{ created: count }`
- `DeleteRange` -- POST, decodes `models.DeleteRangeRequest`, returns `{ deleted: true }`
- `GenerateFromTariff` -- POST, decodes `models.GenerateFromTariffRequest`
  - Defaults: from=today, to=today+3months, overwriteTariffSource=true
  - Returns `{ employees_processed, plans_created, plans_updated, employees_skipped }`

**Error handling:** centralized `handleEDPError` maps service errors to HTTP status codes.

### 1.3 Repository Layer (`apps/api/internal/repository/employeedayplan.go` -- 192 lines)

**Methods:**
- `Create(ctx, *EmployeeDayPlan)` -- standard GORM create
- `GetByID(ctx, uuid)` -- Preloads Shift
- `Update(ctx, *EmployeeDayPlan)` -- GORM Save
- `Delete(ctx, uuid)` -- hard delete, checks RowsAffected
- `GetForEmployeeDate(ctx, employeeID, date)` -- preloads DayPlan, DayPlan.Breaks, DayPlan.Bonuses, DayPlan.Bonuses.Account, Shift
- `GetForEmployeeDateRange(ctx, employeeID, from, to)` -- same preloads, ordered by plan_date ASC
- `List(ctx, tenantID, *employeeID, from, to)` -- preloads DayPlan + Shift, ordered by employee_id ASC, plan_date ASC
- `Upsert(ctx, *EmployeeDayPlan)` -- ON CONFLICT (employee_id, plan_date) DO UPDATE day_plan_id, shift_id, source, notes, updated_at
- `BulkCreate(ctx, []EmployeeDayPlan)` -- same upsert logic, CreateInBatches(100)
- `DeleteRange(ctx, employeeID, from, to)` -- delete where employee_id + plan_date range
- `DeleteByDateRange(ctx, tenantID, dateFrom, dateTo, []employeeIDs)` -- bulk delete with optional employee filter
- `DeleteRangeBySource(ctx, employeeID, from, to, source)` -- delete with source filter

---

## 2. Prisma Schema for EmployeeDayPlan

**File:** `apps/web/prisma/schema.prisma` (lines 1942-1967)

```prisma
model EmployeeDayPlan {
  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId   String    @map("tenant_id") @db.Uuid
  employeeId String    @map("employee_id") @db.Uuid
  planDate   DateTime  @map("plan_date") @db.Date
  dayPlanId  String?   @map("day_plan_id") @db.Uuid
  shiftId    String?   @map("shift_id") @db.Uuid
  source     String?   @default("tariff") @db.VarChar(20)
  notes      String?   @db.Text
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt  DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant   Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  dayPlan  DayPlan?  @relation(fields: [dayPlanId], references: [id], onDelete: SetNull)
  shift    Shift?    @relation(fields: [shiftId], references: [id], onDelete: SetNull)

  @@unique([employeeId, planDate])
  @@index([tenantId], map: "idx_employee_day_plans_tenant")
  @@index([employeeId, planDate], map: "idx_employee_day_plans_employee_date")
  @@index([planDate], map: "idx_employee_day_plans_date")
  @@index([shiftId], map: "idx_employee_day_plans_shift")
  @@map("employee_day_plans")
}
```

**Key points:**
- UNIQUE constraint on `[employeeId, planDate]` -- one plan per employee per date
- `source` is nullable with default 'tariff', valid values: 'tariff', 'manual', 'holiday'
- `dayPlanId` null = off day (no work scheduled)
- Relations: tenant (cascade delete), employee (cascade delete), dayPlan (set null on delete), shift (set null on delete)

---

## 3. Go Model (`apps/api/internal/model/employeedayplan.go`)

```go
type EmployeeDayPlanSource string
const (
    EmployeeDayPlanSourceTariff  EmployeeDayPlanSource = "tariff"
    EmployeeDayPlanSourceManual  EmployeeDayPlanSource = "manual"
    EmployeeDayPlanSourceHoliday EmployeeDayPlanSource = "holiday"
)

type EmployeeDayPlan struct {
    ID         uuid.UUID
    TenantID   uuid.UUID
    EmployeeID uuid.UUID
    PlanDate   time.Time        // date type
    DayPlanID  *uuid.UUID       // nullable
    Source     EmployeeDayPlanSource
    ShiftID    *uuid.UUID       // nullable
    Notes      string
    CreatedAt  time.Time
    UpdatedAt  time.Time
    // Relations
    Employee *Employee
    DayPlan  *DayPlan
    Shift    *Shift
}
```

---

## 4. Existing tRPC Router Patterns

### 4.1 Router Structure Pattern (from shifts.ts, tariffs.ts, exportInterfaces.ts)

All routers follow this structure:
```typescript
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// Permission constants
const PERM = permissionIdByKey("resource.action")!

// Output schemas (z.object)
// Input schemas (z.object)

export const myRouter = createTRPCRouter({
  list: tenantProcedure
    .use(requirePermission(PERM))
    .input(z.object({ ... }).optional())
    .output(z.object({ data: z.array(outputSchema) }))
    .query(async ({ ctx }) => { ... }),

  getById: tenantProcedure
    .use(requirePermission(PERM))
    .input(z.object({ id: z.string().uuid() }))
    .output(outputSchema)
    .query(async ({ ctx, input }) => { ... }),

  create: tenantProcedure
    .use(requirePermission(PERM))
    .input(createInputSchema)
    .output(outputSchema)
    .mutation(async ({ ctx, input }) => { ... }),

  update: tenantProcedure
    .use(requirePermission(PERM))
    .input(updateInputSchema)
    .output(outputSchema)
    .mutation(async ({ ctx, input }) => { ... }),

  delete: tenantProcedure
    .use(requirePermission(PERM))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => { ... }),
})
```

### 4.2 Key Patterns Observed

- **Tenant scoping:** All queries filter by `tenantId` from `ctx.tenantId!`
- **Permission check:** `.use(requirePermission(PERM_ID))` before procedure
- **Error handling:** `throw new TRPCError({ code: "NOT_FOUND" | "BAD_REQUEST" | "CONFLICT", message: "..." })`
- **FK validation:** Before create/update, check referenced entities exist in same tenant
- **Partial updates:** Build `data: Record<string, unknown>` incrementally for update
- **Transactions:** `ctx.prisma.$transaction(async (tx) => { ... })` for atomic operations
- **Output mapping:** Explicit field mapping from Prisma record to output shape

### 4.3 Root Router Registration (`apps/web/src/server/root.ts`)

Routers imported and registered in `appRouter = createTRPCRouter({ ... })`. New router must be:
1. Created in `apps/web/src/server/routers/employeeDayPlans.ts`
2. Imported in `root.ts`
3. Added to `appRouter` as `employeeDayPlans: employeeDayPlansRouter`

---

## 5. Tariff Configuration (needed for generateFromTariff)

### 5.1 Tariff Model Rhythm Logic (`apps/api/internal/model/tariff.go`)

**`GetDayPlanIDForDate(date) -> *uuid.UUID`** -- core logic for day plan resolution:

1. **`weekly` rhythm:** Uses single `WeekPlan` -> `GetDayPlanIDForWeekday(date.Weekday())`
2. **`rolling_weekly` rhythm:** Calculates weeks since `RhythmStartDate`, cycles through `TariffWeekPlans` by `SequenceOrder`, uses matching WeekPlan's `GetDayPlanIDForWeekday()`
3. **`x_days` rhythm:** Calculates days since `RhythmStartDate`, cycles through positions (1-based) mod `CycleDays`, finds matching `TariffDayPlan.DayPlanID`

### 5.2 WeekPlan Model (`apps/api/internal/model/weekplan.go`)

**`GetDayPlanIDForWeekday(weekday) -> *uuid.UUID`** maps Go's time.Weekday to the 7 nullable day plan ID columns (Monday through Sunday).

### 5.3 Prisma Models for Tariff Resolution

**Tariff** (schema lines 1374-1431):
- `rhythmType` -- 'weekly' | 'rolling_weekly' | 'x_days'
- `weekPlanId` -- direct FK for weekly rhythm
- `cycleDays` -- number of days for x_days rhythm
- `rhythmStartDate` -- starting date for calculating cycle position
- Relations: `weekPlan`, `tariffWeekPlans[]`, `tariffDayPlans[]`

**TariffWeekPlan** (schema lines 1461-1477):
- Links tariffs to week plans for rolling_weekly rhythm
- `sequenceOrder` -- 1-based position in rotation
- `@@unique([tariffId, sequenceOrder])`, `@@unique([tariffId, weekPlanId])`

**TariffDayPlan** (schema lines 1484-1499):
- Assigns day plans to positions for x_days rhythm
- `dayPosition` -- 1-based position in cycle
- `dayPlanId` -- nullable (null = off day)
- `@@unique([tariffId, dayPosition])`

**WeekPlan** (schema lines 1324-1359):
- 7 nullable day plan FK columns: `mondayDayPlanId` through `sundayDayPlanId`
- Named relations to DayPlan for each day

### 5.4 Tariff tRPC Router (`apps/web/src/server/routers/tariffs.ts`)

The tariffs router already exists with full CRUD, break management, and rhythm sub-record handling. The `getById` procedure includes `tariffDetailInclude` which loads:
- `weekPlan` (summary)
- `breaks` (ordered by sortOrder)
- `tariffWeekPlans` (with weekPlan summary, ordered by sequenceOrder)
- `tariffDayPlans` (with dayPlan summary, ordered by dayPosition)

This tariff detail data is what the generateFromTariff logic needs to resolve day plans per date.

---

## 6. Employee Model (Tariff Reference)

The Employee model has a `tariffId` field (nullable UUID) that directly references the assigned tariff. This is used by `GenerateFromTariff` to find each employee's active tariff:

```prisma
// In Employee model (schema line 550)
tariffId  String?   @map("tariff_id") @db.Uuid
tariff    Tariff?   @relation(fields: [tariffId], references: [id], onDelete: SetNull)
```

Also relevant for the sync window calculation:
- `entryDate` -- employee start date (constrains generation window start)
- `exitDate` -- employee end date, nullable (constrains generation window end)
- `isActive` -- filter for "all active employees" mode

---

## 7. Frontend Hooks (`apps/web/src/hooks/api/use-employee-day-plans.ts`)

Existing hooks that need migration to tRPC:

| Hook | Current Implementation | tRPC Target |
|------|----------------------|-------------|
| `useEmployeeDayPlans(options)` | `useApiQuery('/employee-day-plans', ...)` | `trpc.employeeDayPlans.list` |
| `useEmployeeDayPlansForEmployee(empId, from, to)` | `useApiQuery('/employees/{employee_id}/day-plans', ...)` | `trpc.employeeDayPlans.forEmployee` |
| `useCreateEmployeeDayPlan()` | `useApiMutation('/employee-day-plans', 'post')` | `trpc.employeeDayPlans.create` |
| `useUpdateEmployeeDayPlan()` | `useApiMutation('/employee-day-plans/{id}', 'put')` | `trpc.employeeDayPlans.update` |
| `useBulkCreateEmployeeDayPlans()` | `useApiMutation('/employee-day-plans/bulk', 'post')` | `trpc.employeeDayPlans.bulkCreate` |
| `useDeleteEmployeeDayPlanRange()` | `useApiMutation('/employee-day-plans/delete-range', 'post')` | `trpc.employeeDayPlans.deleteRange` |
| `useDeleteEmployeeDayPlan()` | `useApiMutation('/employee-day-plans/{id}', 'delete')` | `trpc.employeeDayPlans.delete` |
| `useGenerateFromTariff()` | Custom `useMutation` with raw `fetch` | `trpc.employeeDayPlans.generateFromTariff` |

The `useGenerateFromTariff` hook has custom query invalidation logic that invalidates:
- `/employee-day-plans`
- `/employees/{id}/day/*` patterns
- `/daily-values`
- Any query key starting with `employees`

---

## 8. Authorization / Permission

### 8.1 Permission for Employee Day Plans

The permission catalog (`apps/web/src/server/lib/permission-catalog.ts`, line 131-136) defines:

```typescript
p("time_plans.manage", "time_plans", "manage",
  "Manage employee day plans and time plan assignments")
```

This is the permission used for employee day plan management. The ticket mentions `employee_day_plans.read` and `employee_day_plans.write`, but the existing permission system uses `time_plans.manage` as the single permission covering this domain.

### 8.2 Authorization Middleware (`apps/web/src/server/middleware/authorization.ts`)

Available middleware functions:
- `requirePermission(...permissionIds)` -- checks user has ANY of the specified permissions (OR logic)
- `requireSelfOrPermission(userIdGetter, permissionId)` -- self-access OR permission
- `requireEmployeePermission(employeeIdGetter, ownPerm, allPerm)` -- own vs all employee-scoped access
- `applyDataScope()` -- adds DataScope to context for filtered queries

### 8.3 Procedure Types (`apps/web/src/server/trpc.ts`)

- `publicProcedure` -- no auth required
- `protectedProcedure` -- requires valid Supabase session + resolved user
- `tenantProcedure` -- extends protectedProcedure, requires X-Tenant-ID header, validates user has tenant access via userTenants

---

## 9. Existing Usage of EmployeeDayPlan in tRPC

### 9.1 systemSettings Router

The `systemSettings` router has a helper function `deleteEmployeeDayPlans` (lines 223-244) that uses Prisma to delete employee day plans within a date range, with optional employee filter. This shows the established pattern for Prisma-based EDP operations:

```typescript
async function deleteEmployeeDayPlans(
  prisma: PrismaClient,
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  employeeIds?: string[]
): Promise<number> {
  const where = {
    tenantId,
    planDate: { gte: new Date(dateFrom), lte: new Date(dateTo) },
  }
  if (employeeIds?.length) {
    where.employeeId = { in: employeeIds }
  }
  const result = await prisma.employeeDayPlan.deleteMany({ where })
  return result.count
}
```

### 9.2 shifts Router

The `shifts.delete` procedure checks if a shift is in use by `employeeDayPlan` before allowing deletion:

```typescript
const dayPlanCount = await ctx.prisma.employeeDayPlan.count({
  where: { shiftId: input.id },
})
```

---

## 10. Key Considerations for Implementation

### 10.1 Upsert Behavior

The Go BulkCreate uses `ON CONFLICT (employee_id, plan_date) DO UPDATE` (upsert semantics). In Prisma, this maps to `prisma.employeeDayPlan.upsert()` or raw SQL for bulk operations. Prisma's `createMany` does not support upsert natively. Options:
- Use `prisma.$transaction` with individual `upsert()` calls
- Use `prisma.$executeRaw` with ON CONFLICT clause
- Use `prisma.employeeDayPlan.createMany({ skipDuplicates: true })` (does NOT update existing)

### 10.2 GenerateFromTariff Day Plan Resolution

The Go implementation calls `tariff.GetDayPlanIDForDate(date)` which is a method on the Tariff model. In the tRPC implementation, this logic needs to be reimplemented in TypeScript. The logic requires:
- The tariff's `rhythmType`, `weekPlanId`, `rhythmStartDate`, `cycleDays`
- For weekly: the weekPlan with all 7 day plan ID columns
- For rolling_weekly: the tariffWeekPlans with their weekPlans
- For x_days: the tariffDayPlans

All this data is available through Prisma includes on the Tariff model.

### 10.3 Date Handling

The Go implementation uses `time.Time` for dates (truncated to midnight). In the tRPC router, dates come as ISO strings (`z.string().date()` or `z.string().datetime()`) and are converted to JavaScript `Date` objects. The Prisma `planDate` field is `@db.Date` type, so timezone handling is important -- dates should be treated as date-only values.
