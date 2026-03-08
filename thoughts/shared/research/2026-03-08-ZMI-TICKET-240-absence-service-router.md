# Research: ZMI-TICKET-240 -- Absence Service + Router

**Date**: 2026-03-08
**Branch**: staging
**Repository**: terp

## Research Question

Document the Go absence service, handler, and repository code; existing tRPC router patterns; Prisma schema for absence_days, vacation_balances, absence_types tables; holiday service; frontend hooks in use-absences.ts; authorization middleware patterns; and recalc triggers needed to build the `absences` tRPC router with CRUD, range creation, and approval workflow.

## Summary

The Absence Router replaces the Go absence handler (1079 lines), service (760 lines), and repository (224 lines), plus the vacation handler (186 lines, partially -- `GetBalance` and `PreviewEntitlement`). The Go `AbsenceService` handles range creation (skipping weekends/off-days via day plan lookup), approval workflow (approve/reject/cancel with recalc + vacation balance update), and CRUD. The `absenceTypes` tRPC router already exists (487 lines, ZMI-TICKET-218). The `dailyValues` router (468 lines) and `monthlyValues` router (790 lines) are the closest analogs for structure, permission middleware, data scope filtering, and recalc trigger patterns. The Prisma `AbsenceDay` model exists (ZMI-TICKET-237). One frontend hook file needs migration: `use-absences.ts` (150 lines, 7 hooks using legacy REST via `useApiQuery`/`useApiMutation`). 16 frontend component files import from this hooks file.

---

## 1. Go Source Files to Replace

### 1.1 service/absence.go (760 lines)

**File**: `apps/api/internal/service/absence.go`

**Purpose**: Business logic for absence days and absence types.

**Dependencies (interfaces)**:
- `absenceDayRepositoryForService` -- CRUD + range operations on absence_days
- `absenceTypeRepositoryForService` -- Type validation (GetByID, GetByCode, List, etc.)
- `holidayRepositoryForAbsence` -- `GetByDateRange()` (NOTE: currently unused -- holidays no longer block absence creation per ZMI spec Section 18.2)
- `empDayPlanRepositoryForAbsence` -- `GetForEmployeeDateRange()` for skip-day logic
- `recalcServiceForAbsence` -- `TriggerRecalc()` and `TriggerRecalcRange()` for day recalculation
- `vacationRecalculator` -- `RecalculateTaken()` for vacation balance update after approval
- `notificationSvc` -- Optional notification service for absence events

**Key types**:
```
CreateAbsenceRangeInput {
  TenantID, EmployeeID, AbsenceTypeID uuid.UUID
  FromDate, ToDate                    time.Time
  Duration                            decimal.Decimal  // 1.00 or 0.50
  HalfDayPeriod                       *model.HalfDayPeriod  // "morning" or "afternoon"
  Status                              model.AbsenceStatus   // typically "pending"
  Notes                               *string
  CreatedBy                           *uuid.UUID
}

CreateAbsenceRangeResult {
  CreatedDays  []model.AbsenceDay
  SkippedDates []time.Time
}

UpdateAbsenceInput {
  Duration      *decimal.Decimal
  HalfDayPeriod *model.HalfDayPeriod
  Notes         *string
}
```

**Service methods (10 total)**:

1. **`GetByID(id)`** -- Fetches single absence day. Returns `ErrAbsenceNotFound` if missing.

2. **`ListByEmployee(employeeID)`** -- All absence days for employee. No filters.

3. **`GetByEmployeeDateRange(employeeID, from, to)`** -- Date-ranged employee absences. Validates from <= to.

4. **`ListAll(tenantID, opts)`** -- Tenant-wide filtered list. Uses `AbsenceListOptions` with data scope (ScopeType, ScopeDepartmentIDs, ScopeEmployeeIDs). Preloads Employee + AbsenceType.

5. **`CreateRange(input)`** -- Core range creation logic:
   - Validates date range (from <= to)
   - Validates absence type exists, is active, belongs to tenant (or is system type)
   - Batch-fetches day plans for employee over date range
   - Iterates day-by-day, calling `shouldSkipDate()` to skip weekends and off-days
   - Skips dates with existing absences (idempotent, not error)
   - Builds `[]AbsenceDay` records and batch-creates via `CreateRange()`
   - Triggers `TriggerRecalcRange()` after creation
   - If status == "pending", sends notification to scoped admins
   - Returns created days + skipped dates

6. **`Update(id, input)`** -- Partial update (duration, halfDayPeriod, notes). Only pending absences can be updated. Triggers recalc.

7. **`Delete(id)`** -- Deletes single absence. Triggers recalc. If was approved, triggers vacation recalc.

8. **`DeleteRange(tenantID, employeeID, from, to)`** -- Bulk delete in date range. Triggers recalc range.

9. **`Approve(id, approvedBy)`** -- Status pending -> approved. Sets approvedBy, approvedAt. Triggers recalc + vacation recalc. Sends notification to employee.

10. **`Reject(id, reason)`** -- Status pending -> rejected. Sets rejectionReason. Triggers recalc. Sends notification to employee.

11. **`Cancel(id)`** -- Status approved -> cancelled. Triggers recalc + vacation recalc.

**`shouldSkipDate(date, dayPlanMap)` logic**:
- Skip weekends (Saturday/Sunday)
- Skip if no day plan exists for the date (no_plan)
- Skip if day plan exists but DayPlanID is nil (off_day)
- Holidays are NOT skipped (per ZMI spec Section 18.2)

**Absence type CRUD** (already ported to `absenceTypes` tRPC router):
- ListTypes, GetTypeByID, CreateType, UpdateType, DeleteType
- ValidateAbsenceType (portion validation, code prefix per category)

### 1.2 handler/absence.go (1079 lines)

**File**: `apps/api/internal/handler/absence.go`

**Purpose**: HTTP handlers for absence endpoints.

**Handler struct**: `AbsenceHandler` with three dependencies:
- `absenceService *service.AbsenceService`
- `employeeService *service.EmployeeService`
- `auditService *service.AuditLogService`

**Endpoints (11 total, 6 are absence types already ported)**:

Absence day endpoints (5):
1. **`ListByEmployee`** -- `GET /employees/{id}/absences` -- Employee-scoped. Optional from/to date range. Uses `requireEmployeePermission("id", requestPerm, managePerm)`.
2. **`CreateRange`** -- `POST /employees/{id}/absences` -- Creates range. Always sets status = "pending". Uses `requireEmployeePermission("id", requestPerm, managePerm)`.
3. **`GetAbsence`** -- `GET /absences/{id}` -- By ID. Uses `requirePermission(managePerm)`.
4. **`UpdateAbsence`** -- `PATCH /absences/{id}` -- Updates pending absence. Uses `requirePermission(managePerm)`.
5. **`Delete`** -- `DELETE /absences/{id}` -- Deletes absence. Uses `requirePermission(managePerm)`.

Approval endpoints (3):
6. **`Approve`** -- `POST /absences/{id}/approve` -- Uses `requirePermission(approvePerm)`.
7. **`Reject`** -- `POST /absences/{id}/reject` -- Parses optional `{ reason }` body. Uses `requirePermission(approvePerm)`.
8. **`Cancel`** -- `POST /absences/{id}/cancel` -- Uses `requirePermission(approvePerm)`.

Admin list (1):
9. **`ListAll`** -- `GET /absences` -- Paginated with filters. Uses `requirePermission(managePerm)` + data scope.

**Data scope handling**: `ensureEmployeeScope()` checks employee against data scope. `ensureAbsenceScope()` fetches absence then checks employee scope. `ListAll` applies scope via `AbsenceListOptions`.

**Response mapping**: `absenceDayToResponse()` maps model to API response with nested employee and absenceType objects.

### 1.3 repository/absenceday.go (224 lines)

**File**: `apps/api/internal/repository/absenceday.go`

**Purpose**: GORM data access for absence_days table.

**Repository methods (11 total)**:
1. `Create(ad)` -- Single insert
2. `CreateRange(days)` -- Batch insert (CreateInBatches, batch=100)
3. `GetByID(id)` -- With AbsenceType preload
4. `GetByEmployeeDate(employeeID, date)` -- Returns nil/nil if not found (not error). Excludes cancelled absences (matches unique constraint).
5. `GetByEmployeeDateRange(employeeID, from, to)` -- All statuses, with AbsenceType preload. Date ASC.
6. `ListByEmployee(employeeID)` -- With AbsenceType preload. Date DESC.
7. `Update(ad)` -- Full save
8. `Delete(id)` -- Hard delete by ID
9. `DeleteRange(employeeID, from, to)` -- Bulk delete by date range
10. `ListAll(tenantID, opts)` -- Filtered list with Employee + AbsenceType preloads. Supports data scope via JOIN employees.
11. `Upsert(ad)` -- Save() for upsert
12. `ListApprovedByTypeInRange(employeeID, typeID, from, to)` -- For vacation balance calculation
13. `CountByTypeInRange(employeeID, typeID, from, to)` -- SUM(duration) for approved absences

### 1.4 handler/vacation.go (186 lines)

**File**: `apps/api/internal/handler/vacation.go`

**Purpose**: Vacation balance endpoint and entitlement preview.

**Endpoints**:
1. `GetBalance` -- `GET /employees/{id}/vacation-balance?year=YYYY` -- Already has `vacation` tRPC router for entitlementPreview and carryoverPreview.
2. `PreviewEntitlement` -- `POST /vacation-entitlement/preview` -- Already ported to `vacation` tRPC router.

**Note**: `GetBalance` is the remaining endpoint to port. It fetches `VacationBalance` by employee ID and year.

---

## 2. Go Model: AbsenceDay

**File**: `apps/api/internal/model/absenceday.go` (111 lines)

**Status constants**:
```
AbsenceStatusPending   = "pending"
AbsenceStatusApproved  = "approved"
AbsenceStatusRejected  = "rejected"
AbsenceStatusCancelled = "cancelled"
```

**HalfDayPeriod constants**:
```
HalfDayPeriodMorning   = "morning"
HalfDayPeriodAfternoon = "afternoon"
```

**AbsenceListOptions fields**:
```
EmployeeID, AbsenceTypeID  *uuid.UUID
Status                      *AbsenceStatus
From, To                    *time.Time
ScopeType                   DataScopeType
ScopeDepartmentIDs          []uuid.UUID
ScopeEmployeeIDs            []uuid.UUID
```

---

## 3. Prisma Schema

### 3.1 AbsenceDay (schema.prisma lines 2930-2975)

```prisma
model AbsenceDay {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String    @map("tenant_id") @db.Uuid
  employeeId      String    @map("employee_id") @db.Uuid
  absenceDate     DateTime  @map("absence_date") @db.Date
  absenceTypeId   String    @map("absence_type_id") @db.Uuid
  duration        Decimal   @default(1.00) @db.Decimal(3, 2)
  halfDayPeriod   String?   @map("half_day_period") @db.VarChar(10)
  status          String    @default("pending") @db.VarChar(20)
  approvedBy      String?   @map("approved_by") @db.Uuid
  approvedAt      DateTime? @map("approved_at") @db.Timestamptz(6)
  rejectionReason String?   @map("rejection_reason") @db.Text
  notes           String?   @db.Text
  createdBy       String?   @map("created_by") @db.Uuid
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant      Tenant      @relation(...)
  employee    Employee    @relation(...)
  absenceType AbsenceType @relation(...)

  @@index([tenantId])
  @@index([employeeId])
  @@index([absenceDate])
  @@index([absenceTypeId])
  @@index([status])
  @@index([employeeId, absenceDate])
  @@index([employeeId, absenceDate, status])
  @@map("absence_days")
}
```

**Key index**: `idx_absence_days_lookup` on `(employeeId, absenceDate)` for `GetByEmployeeDate`.

**Note**: No Prisma unique constraint on `(employeeId, absenceDate)` -- the DB has a partial unique index `WHERE status != 'cancelled'`.

### 3.2 VacationBalance (schema.prisma lines 1725-1747)

```prisma
model VacationBalance {
  id                 String    @id @db.Uuid
  tenantId           String    @map("tenant_id") @db.Uuid
  employeeId         String    @map("employee_id") @db.Uuid
  year               Int
  entitlement        Decimal   @default(0) @db.Decimal(5, 2)
  carryover          Decimal   @default(0) @db.Decimal(5, 2)
  adjustments        Decimal   @default(0) @db.Decimal(5, 2)
  taken              Decimal   @default(0) @db.Decimal(5, 2)
  carryoverExpiresAt DateTime? @db.Date
  createdAt          DateTime
  updatedAt          DateTime

  @@unique([employeeId, year])
  @@map("vacation_balances")
}
```

**Computed fields (in Go model, not DB columns)**:
- `Total() = entitlement + carryover + adjustments`
- `Available() = Total() - taken`

### 3.3 AbsenceType (schema.prisma lines 1112-1145)

Already documented in ZMI-TICKET-218. Key fields for this ticket:
- `deductsVacation` -- Boolean, determines if approved absences of this type reduce vacation balance
- `requiresApproval` -- Boolean, currently used by frontend but not enforced in Go service (all absences start as "pending")
- `category` -- "vacation", "illness", "special", "unpaid"
- `portion` -- 0 (none), 1 (full), 2 (half) -- affects time credit calculation

### 3.4 Holiday (schema.prisma lines 330-351)

```prisma
model Holiday {
  id              String   @db.Uuid
  tenantId        String   @db.Uuid
  holidayDate     DateTime @db.Date
  name            String
  holidayCategory Int      @default(1)
  appliesToAll    Boolean  @default(true)
  departmentId    String?  @db.Uuid

  @@unique([tenantId, holidayDate])
  @@map("holidays")
}
```

**Usage in absence creation**: Holidays are NOT checked during absence range creation (removed per ZMI spec). Priority resolution between holidays and absences happens in daily calculation (`CalculateDay`).

### 3.5 EmployeeDayPlan (schema.prisma lines 1955-1980)

```prisma
model EmployeeDayPlan {
  id         String    @db.Uuid
  tenantId   String    @db.Uuid
  employeeId String    @db.Uuid
  planDate   DateTime  @db.Date
  dayPlanId  String?   @db.Uuid    // null = off-day
  shiftId    String?   @db.Uuid
  source     String?   @default("tariff")

  @@unique([employeeId, planDate])
  @@map("employee_day_plans")
}
```

**Used by `shouldSkipDate()`**: If no EmployeeDayPlan exists for date -> skip. If exists but `dayPlanId` is null -> skip (off-day).

### 3.6 DayPlan.vacationDeduction (schema.prisma line 1212)

```prisma
vacationDeduction Decimal @default(1.00) @db.Decimal(5, 2)
```

**Used by vacation RecalculateTaken**: Each approved absence day's deduction = `dayPlan.vacationDeduction * absence.duration`. Defaults to 1.0 if no day plan exists.

---

## 4. Permission Constants

From `apps/web/src/server/lib/permission-catalog.ts`:

| Key | Description | Usage |
|-----|-------------|-------|
| `absences.request` | Request absences | Employee-scoped: own absences (list, create) |
| `absences.approve` | Approve absences | Approve/reject/cancel |
| `absences.manage` | Manage absences | Admin: list all, get by ID, update, delete |

**Go route registration** (`routes.go` lines 513-562):
```
/employees/{id}/absences  GET   -> requireEmployeePermission(id, requestPerm, managePerm)
/employees/{id}/absences  POST  -> requireEmployeePermission(id, requestPerm, managePerm)
/absences                 GET   -> requirePermission(managePerm)
/absences/{id}            GET   -> requirePermission(managePerm)
/absences/{id}            PATCH -> requirePermission(managePerm)
/absences/{id}            DELETE-> requirePermission(managePerm)
/absences/{id}/approve    POST  -> requirePermission(approvePerm)
/absences/{id}/reject     POST  -> requirePermission(approvePerm)
/absences/{id}/cancel     POST  -> requirePermission(approvePerm)
```

---

## 5. Authorization Middleware Patterns

**File**: `apps/web/src/server/middleware/authorization.ts`

Four middleware functions available:

1. **`requirePermission(...permissionIds)`** -- Checks user has ANY of the listed permissions. Used for admin-only endpoints.

2. **`requireEmployeePermission(getter, ownPerm, allPerm)`** -- If user's employeeId matches target: allows with ownPerm OR allPerm. If different employee: requires allPerm. Admin bypass. Used for "own vs all" patterns.

3. **`requireSelfOrPermission(getter, perm)`** -- Self-access by user ID, or requires perm.

4. **`applyDataScope()`** -- Adds `DataScope { type, tenantIds, departmentIds, employeeIds }` to context. Used with `buildXxxDataScopeWhere()` helper for Prisma queries.

**DataScope type**: `{ type: "all" | "tenant" | "department" | "employee", tenantIds: string[], departmentIds: string[], employeeIds: string[] }`

**Pattern for admin list with data scope** (from dailyValues router):
```ts
listAll: tenantProcedure
  .use(requirePermission(VIEW_ALL_PERM))
  .use(applyDataScope())
  .input(...)
  .query(async ({ ctx }) => {
    const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
    const scopeWhere = buildDataScopeWhere(dataScope)
    // merge scopeWhere into Prisma where clause
  })
```

**Pattern for single-item data scope check** (from dailyValues router):
```ts
function checkDataScope(dataScope: DataScope, item: { employeeId, employee? }) {
  if (dataScope.type === "department") {
    if (!item.employee?.departmentId || !dataScope.departmentIds.includes(item.employee.departmentId)) {
      throw new TRPCError({ code: "FORBIDDEN" })
    }
  } else if (dataScope.type === "employee") {
    if (!dataScope.employeeIds.includes(item.employeeId)) {
      throw new TRPCError({ code: "FORBIDDEN" })
    }
  }
}
```

---

## 6. Recalculation Trigger Pattern

**File**: `apps/web/src/server/routers/bookings.ts` (lines 458-484)

Recalculation in the TypeScript codebase uses `DailyCalcService` directly:

```ts
import { DailyCalcService } from "../services/daily-calc"

async function triggerRecalc(prisma, tenantId, employeeId, date) {
  try {
    const service = new DailyCalcService(prisma)
    await service.calculateDay(tenantId, employeeId, date)
  } catch (error) {
    console.error(`Recalc failed ...`, error)
  }
}
```

**For range recalc**: `DailyCalcService.calculateDateRange(tenantId, employeeId, fromDate, toDate)` iterates day-by-day.

**Best effort**: Recalc errors are logged but do not fail the parent operation (matches Go pattern `_, _ = s.recalcSvc.TriggerRecalc(...)`).

---

## 7. Vacation Balance Recalculation

**File**: `apps/api/internal/service/vacation.go` (lines 425-493)

**`RecalculateTaken(employeeID, year)` algorithm**:
1. Get employee for tenant ID
2. Get all absence types for tenant where `deductsVacation == true`
3. Define year range: Jan 1 to Dec 31
4. Batch-fetch day plans for the year -> build `dayPlanMap[date] = vacationDeduction`
5. For each vacation-deducting type, fetch approved absence days in range
6. For each absence day: `totalTaken += dayPlan.vacationDeduction * absence.duration` (default 1.0 if no day plan)
7. Update `vacation_balances.taken` for employee/year

**When called** (from absence service):
- After `Approve()` -- recalculate for the absence date's year
- After `Cancel()` -- recalculate (absence removed from approved set)
- After `Delete()` -- only if the deleted absence was approved

**Prisma equivalent**: Needs to be a service function. Query `absenceDay` + `absenceType` + `employeeDayPlan` + `dayPlan` + update `vacationBalance`.

---

## 8. Existing tRPC Router Patterns

### 8.1 Router Structure Pattern

All routers follow this structure (from `dailyValues.ts`, `monthlyValues.ts`):

```ts
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission, requireEmployeePermission, applyDataScope, type DataScope } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// Permission constants
const PERM = permissionIdByKey("key")!

// Output/Input schemas (Zod)
// Prisma include objects
// Data scope helpers
// Mapper functions
// Router

export const xxxRouter = createTRPCRouter({ ... })
```

### 8.2 Registration in root.ts

**File**: `apps/web/src/server/root.ts`

Import and register in `appRouter`:
```ts
import { absencesRouter } from "./routers/absences"
// ...
export const appRouter = createTRPCRouter({
  absences: absencesRouter,
  // ...
})
```

Currently 64 routers registered. The `absences` router does not yet exist.

### 8.3 Decimal Handling

From `monthlyValues.ts`:
```ts
import { Decimal } from "@prisma/client/runtime/client"

vacationTaken: record.vacationTaken instanceof Decimal
  ? (record.vacationTaken as Decimal).toNumber()
  : Number(record.vacationTaken),
```

Prisma Decimal fields need explicit conversion to number for Zod output schemas.

---

## 9. Existing Frontend Hooks

### 9.1 use-absences.ts (150 lines, 7 hooks)

**File**: `apps/web/src/hooks/api/use-absences.ts`

All hooks use legacy REST (`useApiQuery` / `useApiMutation`):

| Hook | HTTP | tRPC Equivalent |
|------|------|-----------------|
| `useAbsences(options)` | `GET /absences` | `absences.list` |
| `useEmployeeAbsences(employeeId, opts)` | `GET /employees/{id}/absences` | `absences.forEmployee` |
| `useAbsence(id)` | `GET /absences/{id}` | `absences.getById` |
| `useCreateAbsenceRange()` | `POST /employees/{id}/absences` | `absences.createRange` |
| `useUpdateAbsence()` | `PATCH /absences/{id}` | `absences.update` |
| `useDeleteAbsence()` | `DELETE /absences/{id}` | `absences.delete` |
| `useApproveAbsence()` | `POST /absences/{id}/approve` | `absences.approve` |
| `useRejectAbsence()` | `POST /absences/{id}/reject` | `absences.reject` |

**Note**: No `useCancel` hook exists in the current file. The cancel operation is referenced in `absence-cancel-dialog.tsx` but might be using `useUpdateAbsence`.

**Invalidation keys used**:
- `['/absences']`
- `['/employees/{id}/absences']`
- `['/employees/{id}/vacation-balance']`
- `['/vacation-balances']`

### 9.2 Frontend Components Using Absence Hooks (16 files)

| File | Hooks Used |
|------|-----------|
| `admin/approvals/page.tsx` | `useAbsences`, `useApproveAbsence`, `useRejectAbsence` |
| `absences/absence-request-form.tsx` | `useEmployeeAbsences`, `useCreateAbsenceRange` |
| `absences/absence-cancel-dialog.tsx` | Absence cancel |
| `absences/pending-requests.tsx` | Absence list display |
| `absences/absence-edit-form-sheet.tsx` | `useUpdateAbsence` |
| `absences/absence-calendar-view.tsx` | Absence display |
| `vacation/upcoming-vacation.tsx` | Absence display |
| `vacation/transaction-history.tsx` | Absence history |

---

## 10. AbsenceType Router (Already Exists)

**File**: `apps/web/src/server/routers/absenceTypes.ts` (487 lines)

Already implements:
- `absenceTypes.list` -- Returns tenant + system types with filters
- `absenceTypes.getById` -- Single type by ID
- `absenceTypes.create` -- With code prefix validation
- `absenceTypes.update` -- Partial update, blocks system types
- `absenceTypes.delete` -- Checks usage in absence_days before delete

This router is NOT being replaced. The new `absences` router is separate.

---

## 11. Notification Pattern

**From Go absence service**:

1. **Pending absence created** -> Notify scoped admins (users with `absences.approve` permission):
   - Type: `model.NotificationTypeReminders`
   - Title: "Absence approval required"
   - Message: "{TypeName} request for {dateLabel} is pending approval."
   - Link: "/admin/approvals"

2. **Absence approved** -> Notify employee:
   - Type: `model.NotificationTypeApprovals`
   - Title: "Absence approved"
   - Message: "{TypeName} on {dateLabel} was approved."
   - Link: "/absences"

3. **Absence rejected** -> Notify employee:
   - Type: `model.NotificationTypeApprovals`
   - Title: "Absence rejected"
   - Message: "{TypeName} on {dateLabel} was rejected. (Reason: {reason})"
   - Link: "/absences"

**TypeScript notification pattern** (from dailyValues router):
```ts
// Look up user_id for employee via user_tenants join
const userTenant = await ctx.prisma.$queryRaw<{ user_id: string }[]>`
  SELECT ut.user_id FROM user_tenants ut
  JOIN users u ON u.id = ut.user_id
  WHERE ut.tenant_id = ${tenantId}::uuid
    AND u.employee_id = ${employeeId}::uuid
  LIMIT 1
`
if (userTenant?.length > 0) {
  await ctx.prisma.notification.create({
    data: { tenantId, userId: userTenant[0].user_id, type: "approvals", title, message, link }
  })
}
```

---

## 12. Proposed tRPC Procedure Mapping

| tRPC Procedure | Go Handler | Permission | Notes |
|---------------|------------|------------|-------|
| `absences.list` | `ListAll` | `absences.manage` + dataScope | Paginated, filtered, admin view |
| `absences.forEmployee` | `ListByEmployee` | `absences.request` / `absences.manage` (own/all) | Employee-scoped with optional date range |
| `absences.getById` | `GetAbsence` | `absences.manage` + scope check | Single absence by ID |
| `absences.createRange` | `CreateRange` | `absences.request` / `absences.manage` (own/all) | Range creation with skip logic |
| `absences.update` | `UpdateAbsence` | `absences.manage` + scope check | Only pending, partial update |
| `absences.delete` | `Delete` | `absences.manage` + scope check | Only pending check in Go not enforced (any status) |
| `absences.approve` | `Approve` | `absences.approve` + scope check | Recalc + vacation balance |
| `absences.reject` | `Reject` | `absences.approve` + scope check | With optional reason |
| `absences.cancel` | `Cancel` | `absences.approve` + scope check | Approved -> cancelled, recalc + vacation |

---

## 13. Key Implementation Details

### 13.1 Range Creation Skip Logic

The `shouldSkipDate()` function needs ported to TypeScript:

```
For each date from fromDate to toDate:
  1. Skip weekends (Saturday = 6, Sunday = 0 in JS Date.getUTCDay())
  2. Fetch EmployeeDayPlan for date
     - No record exists -> skip (no_plan)
     - Record exists but dayPlanId is null -> skip (off_day)
  3. Check existing absence for (employeeId, date) where status != 'cancelled'
     - If exists -> skip (already has absence)
  4. Otherwise -> create AbsenceDay record
```

**Optimization**: Batch-fetch day plans for entire range upfront (single Prisma query). Check existing absences per-date individually (matching Go behavior) or batch-fetch existing absences for the range.

### 13.2 Vacation Balance Update After Approve/Cancel

Port of `VacationService.RecalculateTaken()`:

```
1. Get employee (for tenantId)
2. Get all AbsenceTypes where deductsVacation = true
3. Year range: Jan 1 to Dec 31 of absence date's year
4. Batch-fetch EmployeeDayPlans for year (include DayPlan for vacationDeduction)
5. For each vacation-deducting type:
   - Query approved absence days in range
   - For each day: totalTaken += dayPlan.vacationDeduction * absence.duration
6. Upsert VacationBalance.taken for employee/year
```

### 13.3 Absence Status Constraints

| Current Status | Allowed Transitions |
|---------------|-------------------|
| pending | -> approved, rejected (delete also allowed) |
| approved | -> cancelled |
| rejected | (terminal state) |
| cancelled | (terminal state) |

### 13.4 CreateRange Input Mapping

Frontend `absence-request-form.tsx` sends:
```ts
{
  absence_type_id: string (UUID)
  from: Date
  to: Date
  duration: number (1.0 or 0.5)
  notes: string
}
```

The tRPC input schema should match:
```ts
z.object({
  employeeId: z.string().uuid(),
  absenceTypeId: z.string().uuid(),
  fromDate: z.string().date(),  // YYYY-MM-DD
  toDate: z.string().date(),    // YYYY-MM-DD
  duration: z.number().min(0.5).max(1),
  halfDayPeriod: z.enum(["morning", "afternoon"]).optional(),
  notes: z.string().optional(),
})
```

---

## 14. File Inventory

### Go files being replaced (absence router scope only):

| File | Lines | Status |
|------|-------|--------|
| `apps/api/internal/service/absence.go` | 760 | Replace absence day methods only (type methods already in absenceTypes router) |
| `apps/api/internal/handler/absence.go` | 1079 | Replace absence day handlers only (type handlers already ported) |
| `apps/api/internal/repository/absenceday.go` | 224 | Replace entirely (Prisma handles data access) |
| `apps/api/internal/handler/vacation.go` | 186 | Replace `GetBalance` endpoint |

### New TypeScript files to create:

| File | Purpose |
|------|---------|
| `apps/web/src/server/routers/absences.ts` | tRPC router with 9 procedures |
| `apps/web/src/hooks/api/use-absences.ts` | Migrate 7 hooks from REST to tRPC |

### Files to modify:

| File | Change |
|------|--------|
| `apps/web/src/server/root.ts` | Add `absences: absencesRouter` |
| `apps/web/src/hooks/api/index.ts` | Update re-exports if hook signatures change |

### Frontend files consuming hooks (no changes needed if hook signatures preserved):

16 component files listed in Section 9.2.
