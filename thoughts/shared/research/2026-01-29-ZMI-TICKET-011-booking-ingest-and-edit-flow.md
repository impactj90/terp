# Research: ZMI-TICKET-011 - Booking Ingest, Edit, and Calculated Values

**Date**: 2026-01-29
**Ticket**: ZMI-TICKET-011
**Status**: Research complete

---

## 1. Ticket Summary

ZMI-TICKET-011 requires a complete booking flow: ingest from terminals, store original and edited times, calculate derived times, maintain pairing integrity, and log edits.

Key requirements:
- Booking data model with original (immutable), edited (user-modifiable), and calculated (derived) time fields
- Booking audit logs capturing who/when/old-new values on edits
- Business rules: original immutable, edited defaults to original, calculated derived from day plan, pairing rules (come/go, break), cross-midnight logic
- API endpoints: Create, Update edited time, Delete, List by employee/date range, Retrieve booking logs, Trigger day/month calculation
- Dependencies: Booking types (ZMI-TICKET-010), Day plans (ZMI-TICKET-006), User management (ZMI-TICKET-003), Audit logging (ZMI-TICKET-034)

---

## 2. Existing Codebase State

### 2.1 Booking Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/booking.go`

The Booking model already exists with the data model described in the ticket:

```go
type Booking struct {
    ID            uuid.UUID
    TenantID      uuid.UUID
    EmployeeID    uuid.UUID
    BookingDate   time.Time
    BookingTypeID uuid.UUID

    // Time values (minutes from midnight)
    OriginalTime   int
    EditedTime     int
    CalculatedTime *int

    // Pairing
    PairID *uuid.UUID

    // Metadata
    Source     BookingSource  // "web", "terminal", "api", "import", "correction"
    TerminalID *uuid.UUID
    Notes      string

    CreatedAt time.Time
    UpdatedAt time.Time
    CreatedBy *uuid.UUID
    UpdatedBy *uuid.UUID

    // Relations
    Employee    *Employee
    BookingType *BookingType
    Pair        *Booking
}
```

Helper methods exist:
- `TimeString()` - returns edited time as HH:MM string (line 56)
- `EffectiveTime()` - returns calculated_time if set, else edited_time (line 61)
- `IsEdited()` - returns true if edited_time differs from original_time (line 69)
- `MinutesToTime()` - converts minutes from midnight to time.Time (line 74)

Deprecated functions delegate to `timeutil` package: `TimeToMinutes`, `MinutesToString`, `ParseTimeString`.

`BookingSource` enum values: `web`, `terminal`, `api`, `import`, `correction`.

### 2.2 Booking Database Migration

**File**: `/home/tolga/projects/terp/db/migrations/000022_create_bookings.up.sql`

The bookings table exists with all required columns:
- `id`, `tenant_id`, `employee_id`, `booking_date`, `booking_type_id`
- `original_time` (INT, NOT NULL), `edited_time` (INT, NOT NULL), `calculated_time` (INT, nullable)
- `pair_id` (UUID, nullable), `source` (VARCHAR(20), default 'web'), `terminal_id`, `notes`
- `created_at`, `updated_at`, `created_by`, `updated_by`

Indexes:
- `idx_bookings_tenant` on `tenant_id`
- `idx_bookings_employee_date` on `(employee_id, booking_date)`
- `idx_bookings_date` on `booking_date`
- `idx_bookings_pair` partial index on `pair_id WHERE pair_id IS NOT NULL`

### 2.3 Booking Repository

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/booking.go`

`BookingRepository` is fully implemented with these methods:
- `Create(ctx, *model.Booking)` (line 46)
- `GetByID(ctx, uuid.UUID)` (line 51)
- `GetWithDetails(ctx, uuid.UUID)` - preloads Employee, BookingType, Pair (line 66)
- `Update(ctx, *model.Booking)` (line 85)
- `Delete(ctx, uuid.UUID)` (line 90)
- `List(ctx, BookingFilter)` - supports TenantID, EmployeeID, StartDate, EndDate, Direction, Source, HasPair, Scope filters, pagination (line 102)
- `GetByEmployeeAndDate(ctx, tenantID, employeeID, date)` (line 168)
- `GetByEmployeeAndDateRange(ctx, tenantID, employeeID, start, end)` (line 183)
- `GetByDateRange(ctx, tenantID, start, end)` (line 202)
- `GetUnpaired(ctx, tenantID, employeeID, date, direction)` (line 216)
- `SetPair(ctx, bookingID1, bookingID2)` (line 233)
- `ClearPair(ctx, pairID)` (line 259)
- `UpdateCalculatedTimes(ctx, map[uuid.UUID]int)` - bulk transaction (line 272)
- `ClearCalculatedTime(ctx, bookingID)` (line 295)
- `Upsert(ctx, *model.Booking)` (line 311)

`BookingFilter` struct supports filtering by:
- `TenantID`, `EmployeeID`, `StartDate`, `EndDate`
- `Direction` (booking type direction)
- `Source` (booking source)
- `HasPair` (nullable bool)
- Scope-based filtering: `ScopeType`, `ScopeDepartmentIDs`, `ScopeEmployeeIDs`
- Pagination: `Offset`, `Limit`

### 2.4 Booking Service

**File**: `/home/tolga/projects/terp/apps/api/internal/service/booking.go`

`BookingService` is implemented with these operations:

- `Create(ctx, CreateBookingInput)` (line 92) - Validates time (0-1439), checks month not closed, validates booking type + tenant access, creates booking, triggers recalculation
- `GetByID(ctx, uuid.UUID)` (line 143)
- `Update(ctx, id, UpdateBookingInput)` (line 152) - Gets existing, checks month not closed, applies EditedTime and Notes updates, clears CalculatedTime when edited_time changes, triggers recalculation
- `Delete(ctx, uuid.UUID)` (line 192) - Gets existing, checks month not closed, deletes, triggers recalculation
- `ListByEmployeeDate(ctx, tenantID, employeeID, date)` (line 221)
- `ListByEmployeeDateRange(ctx, tenantID, employeeID, from, to)` (line 226)

Input types:
```go
type CreateBookingInput struct {
    TenantID, EmployeeID, BookingTypeID uuid.UUID
    BookingDate time.Time
    OriginalTime, EditedTime int
    Source model.BookingSource
    TerminalID *uuid.UUID
    Notes string
    CreatedBy *uuid.UUID
}

type UpdateBookingInput struct {
    EditedTime *int
    Notes      *string
    UpdatedBy  *uuid.UUID
}
```

Error definitions:
- `ErrBookingNotFound`
- `ErrMonthClosed`
- `ErrInvalidBookingTime`
- `ErrBookingOverlap`
- `ErrInvalidBookingType`

The service uses interface-based dependencies:
- `bookingRepositoryForService` (Create, GetByID, Update, Delete, GetByEmployeeAndDate, GetByDateRange)
- `bookingTypeRepositoryForService` (GetByID)
- `recalcServiceForBooking` (TriggerRecalc)
- `monthlyValueLookupForBooking` (IsMonthClosed) - currently nil until TICKET-086

### 2.5 Booking Handler

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/booking.go`

`BookingHandler` is fully implemented with these HTTP handlers:

- `List(w, r)` - GET /bookings with filtering (line 62)
- `Create(w, r)` - POST /bookings (line 236)
- `GetByID(w, r)` - GET /bookings/{id} (line 324)
- `Update(w, r)` - PUT /bookings/{id} (line 362)
- `Delete(w, r)` - DELETE /bookings/{id} (line 448)
- `GetDayView(w, r)` - GET /employees/{id}/day/{date} (line 509)
- `Calculate(w, r)` - POST /employees/{id}/day/{date}/calculate (line 645)

Handler dependencies:
```go
type BookingHandler struct {
    bookingService   *service.BookingService
    dailyCalcService *service.DailyCalcService
    employeeService  *service.EmployeeService
    bookingRepo      *repository.BookingRepository
    dailyValueRepo   *repository.DailyValueRepository
    empDayPlanRepo   *repository.EmployeeDayPlanRepository
    holidayRepo      *repository.HolidayRepository
    auditService     *service.AuditLogService
}
```

The handler uses `gen/models` types for request/response:
- `models.CreateBookingRequest` for Create
- `models.UpdateBookingRequest` for Update
- `models.Booking` for response
- `models.BookingList` for list response
- `models.DayView` for day view response

Audit logging is already integrated:
- Create: logs `AuditActionCreate` with EntityType "booking" (line 311)
- Update: logs `AuditActionUpdate` with EntityType "booking" (line 433)
- Delete: logs `AuditActionDelete` with EntityType "booking" (line 494)

Current audit logging does NOT include `Changes` data (before/after values). The `LogEntry` is called with only `TenantID`, `Action`, `EntityType`, and `EntityID`.

### 2.6 Booking Route Registration

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/routes.go` (lines 399-478)

```go
func RegisterBookingRoutes(r chi.Router, h *BookingHandler, authz *middleware.AuthorizationMiddleware) {
    // Permission IDs used
    viewOwn := "time_tracking.view_own"
    viewAll := "time_tracking.view_all"
    edit := "time_tracking.edit"
    permCalculateDay := "booking_overview.calculate_day"
    permDeleteBookings := "booking_overview.delete_bookings"

    r.Route("/bookings", ...) {
        GET /          -> h.List      (viewAll)
        POST /         -> h.Create    (edit + employee resolver)
        GET /{id}      -> h.GetByID   (employee resolver)
        PUT /{id}      -> h.Update    (edit + employee resolver)
        DELETE /{id}   -> h.Delete    (edit + deleteBookings + employee resolver)
    }

    r.Route("/employees/{id}/day/{date}", ...) {
        GET /          -> h.GetDayView   (employee permission)
        POST /calculate -> h.Calculate   (calculateDay + employee permission)
    }
}
```

Employee-scoped permission resolution is done via `bookingResolver` (fetches booking to get employeeID) and `bookingCreateResolver` (parses body for employeeID).

### 2.7 Main.go Wiring

**File**: `/home/tolga/projects/terp/apps/api/cmd/server/main.go`

Key wiring (extracted from grep):
```go
bookingTypeRepo := repository.NewBookingTypeRepository(db)
bookingRepo := repository.NewBookingRepository(db)
bookingTypeService := service.NewBookingTypeService(bookingTypeRepo)
dailyCalcService := service.NewDailyCalcService(bookingRepo, empDayPlanRepo, dayPlanRepo, dailyValueRepo, holidayRepo, employeeRepo, absenceDayRepo)
bookingService := service.NewBookingService(bookingRepo, bookingTypeRepo, recalcService, nil)

bookingHandler := handler.NewBookingHandler(
    bookingService,
    dailyCalcService,
    employeeService,
    bookingRepo,
    dailyValueRepo,
    empDayPlanRepo,
    holidayRepo,
)
bookingHandler.SetAuditService(auditLogService)

handler.RegisterBookingRoutes(r, bookingHandler, authzMiddleware)
```

---

## 3. Booking Type Implementation (ZMI-TICKET-010)

### 3.1 BookingType Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/bookingtype.go`

```go
type BookingType struct {
    ID             uuid.UUID
    TenantID       *uuid.UUID       // NULL for system types
    Code           string
    Name           string
    Description    *string
    Direction      BookingDirection  // "in" or "out"
    Category       BookingCategory   // "work", "break", "business_trip", "other"
    AccountID      *uuid.UUID       // linked account
    RequiresReason bool
    UsageCount     int              // not stored, computed
    IsSystem       bool
    IsActive       bool
    CreatedAt, UpdatedAt time.Time
}
```

Helper methods: `IsInbound()`, `IsOutbound()`.

Enums:
- `BookingDirection`: `in`, `out`
- `BookingCategory`: `work`, `break`, `business_trip`, `other`

### 3.2 BookingReason Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/bookingreason.go`

```go
type BookingReason struct {
    ID, TenantID, BookingTypeID uuid.UUID
    Code, Label string
    IsActive bool
    SortOrder int
    CreatedAt, UpdatedAt time.Time
}
```

### 3.3 BookingTypeGroup Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/bookingtypegroup.go`

Exists for grouping booking types.

### 3.4 Booking Type Migration

**File**: `/home/tolga/projects/terp/db/migrations/000021_create_booking_types.up.sql`

Creates `booking_types` table with all fields plus `booking_reasons` and `booking_type_groups` tables.

**File**: `/home/tolga/projects/terp/db/migrations/000044_booking_type_enhancements.up.sql`

Adds `category` and `account_id` columns to booking_types, plus creates `booking_reasons` and `booking_type_groups` tables (with junction table `booking_type_group_members`).

### 3.5 Booking Type Handler/Service/Repository

All three layers exist:
- **Handler**: `/home/tolga/projects/terp/apps/api/internal/handler/bookingtype.go`
- **Service**: `/home/tolga/projects/terp/apps/api/internal/service/bookingtype.go`
- **Repository**: `/home/tolga/projects/terp/apps/api/internal/repository/bookingtype.go`

Same pattern applies for BookingReason and BookingTypeGroup.

### 3.6 Booking Type OpenAPI

**File**: `/home/tolga/projects/terp/api/schemas/booking-types.yaml`

Defines: `BookingType`, `BookingTypeSummary`, `CreateBookingTypeRequest`, `UpdateBookingTypeRequest`, `BookingTypeList`.

**File**: `/home/tolga/projects/terp/api/paths/bookings.yaml` and `/home/tolga/projects/terp/api/schemas/bookings.yaml`

Booking endpoints and schemas already defined in OpenAPI.

---

## 4. Day Plan Implementation (ZMI-TICKET-006)

### 4.1 DayPlan Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/dayplan.go`

The DayPlan model is fully implemented with:
- Plan type: `fixed`, `flextime`
- Time windows: `ComeFrom`, `ComeTo`, `GoFrom`, `GoTo`, `CoreStart`, `CoreEnd`
- Target hours: `RegularHours`, `RegularHours2` (absence day alternative), `FromEmployeeMaster`
- Tolerance: `ToleranceComePlus`, `ToleranceComeMinus`, `ToleranceGoPlus`, `ToleranceGoMinus`
- Rounding: `RoundingComeType`, `RoundingComeInterval`, `RoundingGoType`, `RoundingGoInterval`, `RoundAllBookings`, `RoundingComeAddValue`, `RoundingGoAddValue`
- Caps: `MinWorkTime`, `MaxNetWorkTime`
- Variable work time: `VariableWorkTime`
- Holiday credits: `HolidayCreditCat1/2/3`
- Vacation deduction: `VacationDeduction`
- No-booking behavior: `NoBookingBehavior` (error, deduct_target, vocational_school, adopt_target, target_with_order)
- Day change behavior: `DayChangeBehavior` (none, at_arrival, at_departure, auto_complete)
- Shift detection: `ShiftDetectArriveFrom/To`, `ShiftDetectDepartFrom/To`, `ShiftAltPlan1-6`
- Relations: `Breaks []DayPlanBreak`, `Bonuses []DayPlanBonus`

### 4.2 EmployeeDayPlan Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/employeedayplan.go`

Links employees to day plans by date. Contains `DayPlanID *uuid.UUID` (nullable for off days) and preloaded `DayPlan` relation.

---

## 5. Audit Logging Implementation

### 5.1 AuditLog Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/auditlog.go`

```go
type AuditLog struct {
    ID         uuid.UUID
    TenantID   uuid.UUID
    UserID     *uuid.UUID
    Action     AuditAction    // create, update, delete, approve, reject, close, reopen, export, import, login, logout
    EntityType string
    EntityID   uuid.UUID
    EntityName *string
    Changes    datatypes.JSON  // JSONB for before/after values
    Metadata   datatypes.JSON  // JSONB for additional context
    IPAddress  *string
    UserAgent  *string
    PerformedAt time.Time
    User *User // relation
}
```

### 5.2 AuditLog Service

**File**: `/home/tolga/projects/terp/apps/api/internal/service/auditlog.go`

```go
type LogEntry struct {
    TenantID   uuid.UUID
    Action     model.AuditAction
    EntityType string
    EntityID   uuid.UUID
    EntityName string
    Changes    any    // serialized to JSON
    Metadata   any    // serialized to JSON
}
```

The `Log(ctx, r, entry)` method:
- Extracts user from auth context
- Extracts IP and user agent from HTTP request
- Marshals Changes and Metadata to JSON
- Swallows errors (audit never blocks main flow)

### 5.3 AuditLog Repository

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/auditlog.go`

Provides `Create`, `List` (with filtering by TenantID, UserID, EntityType, EntityID, Action, From, To, pagination), `GetByID`.

### 5.4 AuditLog Handler

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/auditlog.go`

Provides `List` and `GetByID` endpoints.

### 5.5 Audit Log Migration

**File**: `/home/tolga/projects/terp/db/migrations/000040_create_audit_logs.up.sql`

Table exists with JSONB `changes` and `metadata` columns, appropriate indexes.

### 5.6 Current Audit Logging in Booking Handler

The booking handler currently logs:
- **Create**: `AuditActionCreate`, EntityType "booking", EntityID = booking.ID (no Changes)
- **Update**: `AuditActionUpdate`, EntityType "booking", EntityID = booking.ID (no Changes)
- **Delete**: `AuditActionDelete`, EntityType "booking", EntityID = id (no Changes)

The `Changes` field is NOT populated in any of the booking audit log calls. Other handlers (e.g., user handler at line 350 in user.go) do pass `Changes` with update data, but the booking handler does not.

---

## 6. Calculation Services

### 6.1 DailyCalcService

**File**: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go`

The `DailyCalcService` is the main calculation orchestrator:
- `CalculateDay(ctx, tenantID, employeeID, date)` (line 134) - Full daily calculation pipeline
- `RecalculateRange(ctx, tenantID, employeeID, from, to)` (line 1019) - Iterates dates

The calculation pipeline:
1. Check for holiday
2. Get employee day plan (nil = off day)
3. Load bookings for calculation (handles day change behavior via `loadBookingsForCalculation`)
4. Handle special cases: off day, holiday credit, no bookings
5. Normal calculation with bookings via `calculateWithBookings`
6. Persist DailyValue via `dailyValueRepo.Upsert`

Key internals:
- `loadBookingsForCalculation()` handles cross-midnight booking loading based on `DayChangeBehavior`
- `applyDayChangeBehavior()` implements at_arrival and at_departure logic
- `applyAutoCompleteDayChange()` implements auto_complete with synthetic booking creation
- `buildCalcInput()` converts model data to `calculation.CalculationInput`
- `resultToDailyValue()` converts `calculation.CalculationResult` to `model.DailyValue`
- `UpdateCalculatedTimes()` is called to persist calculated times back to bookings

The calculation uses bookings' `EffectiveTime()` which returns `calculated_time` if set, otherwise `edited_time`.

### 6.2 RecalcService

**File**: `/home/tolga/projects/terp/apps/api/internal/service/recalc.go`

Wraps DailyCalcService for triggered recalculation:
- `TriggerRecalc(ctx, tenantID, employeeID, date)` - single day
- `TriggerRecalcRange(ctx, tenantID, employeeID, from, to)` - date range
- `TriggerRecalcBatch(ctx, tenantID, employeeIDs, from, to)` - multiple employees
- `TriggerRecalcAll(ctx, tenantID, from, to)` - all active employees

### 6.3 MonthlyCalcService

**File**: `/home/tolga/projects/terp/apps/api/internal/service/monthlycalc.go`

- `CalculateMonth(ctx, employeeID, year, month)` - single employee/month
- `CalculateMonthBatch(ctx, employeeIDs, year, month)` - batch
- `RecalculateFromMonth(ctx, employeeID, startYear, startMonth)` - cascading from month to current
- `RecalculateFromMonthBatch(ctx, employeeIDs, startYear, startMonth)` - batch cascade

### 6.4 Calculation Package

**File**: `/home/tolga/projects/terp/apps/api/internal/calculation/types.go`

Contains `CalculationInput`, `CalculationResult`, `BookingInput`, `DayPlanInput`, `BreakConfig`, `RoundingConfig`, `ToleranceConfig`, `ShiftDetectionInput`, etc.

---

## 7. OpenAPI Spec

### 7.1 Booking Schemas

**File**: `/home/tolga/projects/terp/api/schemas/bookings.yaml`

Defines:
- `Booking` - response schema with all fields including original_time, edited_time, calculated_time, pair_id, source, time_string, booking_type summary
- `BookingSummary` - minimal version
- `CreateBookingRequest` - employee_id, booking_type_id, booking_date, time (HH:MM), notes
- `UpdateBookingRequest` - time (HH:MM), notes
- `BookingList` - data array + total + meta
- `DayView` - employee_id, date, bookings, daily_value, day_plan, holiday, errors
- `DailyValue` - all calculation result fields

### 7.2 Booking Paths

**File**: `/home/tolga/projects/terp/api/paths/bookings.yaml`

Defines paths for:
- `/bookings` - GET (list), POST (create)
- `/bookings/{id}` - GET (getById), PUT (update), DELETE (delete)
- `/employees/{id}/day/{date}` - GET (getDayView)
- `/employees/{id}/day/{date}/calculate` - POST (calculateDay)

### 7.3 Audit Log OpenAPI

**File**: `/home/tolga/projects/terp/api/paths/audit-logs.yaml`

General audit log list/detail endpoints. Supports filtering by entity_type ("booking"), entity_id, action, user_id, date range.

**File**: `/home/tolga/projects/terp/api/schemas/audit-logs.yaml`

`AuditLog` schema includes `changes` (JSON object with before/after), `metadata`.

---

## 8. Generated Models

### 8.1 Booking Generated Model

**File**: `/home/tolga/projects/terp/apps/api/gen/models/booking.go`

Generated from OpenAPI spec. Contains all fields matching the schema including validation. Source enum values: `web`, `terminal`, `api`, `import`, `correction`.

Other generated booking models exist:
- `gen/models/create_booking_request.go`
- `gen/models/update_booking_request.go`
- `gen/models/booking_list.go`
- `gen/models/day_view.go`

---

## 9. Test Patterns

### 9.1 Handler Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/booking_test.go`

Pattern:
1. `setupBookingHandler(t)` - creates real DB (testutil.SetupTestDB), repos, services, handler
2. Uses `testutil.SetupTestDB(t)` for test database
3. Creates test data: tenant, employee, booking type
4. Uses `httptest.NewRequest` and `httptest.NewRecorder`
5. Chi route context set via `chi.NewRouteContext()` and `rctx.URLParams.Add()`
6. Tenant context set via `context.WithValue(r.Context(), middleware.TenantContextKey, tenant.ID)`
7. Uses `testify/assert` and `testify/require`

Existing test cases:
- TestBookingHandler_Create_Success, _InvalidBody, _InvalidTimeFormat, _NoTenant
- TestBookingHandler_GetByID_Success, _InvalidID, _NotFound
- TestBookingHandler_List_Success, _FilterByEmployee, _NoTenant
- TestBookingHandler_Update_Success, _InvalidID, _NotFound
- TestBookingHandler_Delete_Success, _InvalidID, _NotFound
- TestBookingHandler_GetDayView_Success, _InvalidEmployeeID, _InvalidDate, _NoTenant
- TestBookingHandler_Calculate_Success, _InvalidEmployeeID, _InvalidDate, _NoTenant

### 9.2 Service Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/service/booking_test.go`

Exists but not reviewed in detail. Uses the same real-DB pattern with service layer.

---

## 10. Migration Pattern

Latest migration number: **000044** (`000044_booking_type_enhancements`)

Migration naming convention: `{number}_{description}.up.sql` / `.down.sql`

Down migration pattern (from 000022): `DROP TABLE IF EXISTS bookings;`

---

## 11. Gap Analysis: What ZMI-TICKET-011 Requires vs What Exists

### 11.1 DATA MODEL - COMPLETE

The booking data model is fully implemented:
- Original time (immutable) -- EXISTS in `model.Booking.OriginalTime`
- Edited time (user-modifiable) -- EXISTS in `model.Booking.EditedTime`
- Calculated time (derived) -- EXISTS in `model.Booking.CalculatedTime`
- Booking type (direction/category) -- EXISTS via `BookingTypeID` + `BookingType` relation
- Pair ID -- EXISTS in `model.Booking.PairID`
- Source -- EXISTS in `model.Booking.Source`
- Notes -- EXISTS in `model.Booking.Notes`

### 11.2 BOOKING AUDIT LOGS - PARTIAL

The ticket requires "Booking logs for edits (who, when, old/new values)."

What exists:
- Generic audit log infrastructure (model, service, repository, handler, migration, OpenAPI) -- EXISTS
- Audit log entries created for booking create/update/delete -- EXISTS
- The `AuditLog.Changes` field supports JSONB before/after data -- EXISTS in schema

What is missing:
- **Booking audit log entries do NOT include `Changes` data (before/after values)**. The handler calls `auditService.Log()` without populating the `Changes` field. For updates, the old/new edited_time and notes should be captured.
- **No booking-specific audit log retrieval endpoint**. The ticket says "Retrieve booking logs" as a distinct endpoint. Currently, audit logs can only be filtered by entity_type="booking" via the general `/audit-logs?entity_type=booking` endpoint.

### 11.3 BUSINESS RULES - LARGELY COMPLETE

What exists:
- Original time immutability: The `BookingService.Update()` method only modifies `EditedTime` and `Notes` -- the `OriginalTime` field is never changed. The handler's Create method sets `OriginalTime = EditedTime = minutes` from the request. **EXISTS**.
- Edited time defaults to original: In `Create()`, `EditedTime` is set equal to the parsed time, which is also `OriginalTime`. **EXISTS**.
- Calculated time derived from day plan: `DailyCalcService.calculateWithBookings()` runs calculation and calls `bookingRepo.UpdateCalculatedTimes()`. **EXISTS**.
- Clearing calculated time on edit: `BookingService.Update()` sets `CalculatedTime = nil` when EditedTime changes. **EXISTS**.
- Pairing rules: The repository has `SetPair`, `ClearPair`, `GetUnpaired`. The calculation package uses `PairID` for booking pairing. **EXISTS** (pairing is done in calculation, not during ingest).
- Cross-midnight logic: Implemented in `daily_calc.go` via `DayChangeBehavior` (at_arrival, at_departure, auto_complete). **EXISTS**.
- Month close check: `BookingService` checks `checkMonthNotClosed()` before create/update/delete. **EXISTS**.
- Recalculation trigger: After every create/update/delete, `recalcSvc.TriggerRecalc()` is called. **EXISTS**.

### 11.4 API ENDPOINTS - LARGELY COMPLETE

What exists:
- Create booking (manual): POST /bookings -- **EXISTS**
- Update edited time: PUT /bookings/{id} -- **EXISTS**
- Delete booking: DELETE /bookings/{id} -- **EXISTS**
- List bookings by employee/date range: GET /bookings?employee_id=X&from=Y&to=Z -- **EXISTS**
- Trigger day calculation: POST /employees/{id}/day/{date}/calculate -- **EXISTS**
- Day view: GET /employees/{id}/day/{date} -- **EXISTS**

What is missing or incomplete:
- **Retrieve booking logs**: No dedicated endpoint. The ticket requires a specific endpoint for booking edit history. Currently, the only way is to use the general `/audit-logs?entity_type=booking&entity_id={id}` endpoint, but the Changes data is not populated.
- **Trigger month calculation endpoint**: The monthly evaluation routes exist at `/employees/{id}/months/{year}/{month}/recalculate` (in `routes.go` line 562), which handles month recalculation. **EXISTS** (via monthly eval handler).

### 11.5 OPENAPI SPEC - MOSTLY COMPLETE

What exists:
- Booking schema with all fields -- **EXISTS** in `api/schemas/bookings.yaml`
- Create/Update request schemas -- **EXISTS**
- List response schema -- **EXISTS**
- Day view schema -- **EXISTS**
- Audit log schema with changes/metadata -- **EXISTS**

What is missing:
- **No explicit documentation of original_time immutability in OpenAPI**. The schema has `original_time` as a required field but does not annotate it as read-only or immutable.
- **No booking-specific audit log endpoint in OpenAPI**. If a dedicated `/bookings/{id}/logs` endpoint is needed, it does not exist in the spec.

### 11.6 TEST COVERAGE - LARGELY COMPLETE

What exists:
- Handler tests for all CRUD operations and day view/calculate -- **EXISTS**
- Tests for invalid input, not found, no tenant scenarios -- **EXISTS**

What is missing:
- **No test for original_time immutability** (that update does not change original_time)
- **No test for audit log Changes data capture** (old/new values on edit)
- **No test for pairing behavior** at the service/handler level
- **No test for calculated time update** after day calculation
- **No test for cross-midnight booking behavior** at the handler level
- **No integration tests** for end-to-end recalculation flow

---

## 12. Key Code References Summary

| Component | File | Line | Status |
|-----------|------|------|--------|
| Booking model | `/home/tolga/projects/terp/apps/api/internal/model/booking.go` | 20-49 | Complete |
| Booking migration | `/home/tolga/projects/terp/db/migrations/000022_create_bookings.up.sql` | 1-42 | Complete |
| Booking repository | `/home/tolga/projects/terp/apps/api/internal/repository/booking.go` | 1-314 | Complete |
| Booking service | `/home/tolga/projects/terp/apps/api/internal/service/booking.go` | 1-267 | Complete |
| Booking handler | `/home/tolga/projects/terp/apps/api/internal/handler/booking.go` | 1-827 | Complete |
| Route registration | `/home/tolga/projects/terp/apps/api/internal/handler/routes.go` | 399-478 | Complete |
| Booking handler tests | `/home/tolga/projects/terp/apps/api/internal/handler/booking_test.go` | 1-595 | Complete |
| Booking OpenAPI schemas | `/home/tolga/projects/terp/api/schemas/bookings.yaml` | All | Complete |
| Booking OpenAPI paths | `/home/tolga/projects/terp/api/paths/bookings.yaml` | All | Complete |
| Generated booking model | `/home/tolga/projects/terp/apps/api/gen/models/booking.go` | 1-466 | Complete |
| Booking type model | `/home/tolga/projects/terp/apps/api/internal/model/bookingtype.go` | 1-55 | Complete |
| Booking reason model | `/home/tolga/projects/terp/apps/api/internal/model/bookingreason.go` | 1-25 | Complete |
| Audit log model | `/home/tolga/projects/terp/apps/api/internal/model/auditlog.go` | 1-47 | Complete |
| Audit log service | `/home/tolga/projects/terp/apps/api/internal/service/auditlog.go` | 1-89 | Complete |
| Daily calc service | `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go` | 1-1030 | Complete |
| Recalc service | `/home/tolga/projects/terp/apps/api/internal/service/recalc.go` | 1-127 | Complete |
| Monthly calc service | `/home/tolga/projects/terp/apps/api/internal/service/monthlycalc.go` | 1-204 | Complete |
| Day plan model | `/home/tolga/projects/terp/apps/api/internal/model/dayplan.go` | 1-262 | Complete |
| Main.go wiring | `/home/tolga/projects/terp/apps/api/cmd/server/main.go` | 83-299 | Complete |
| Timeutil package | `/home/tolga/projects/terp/apps/api/internal/timeutil/timeutil.go` | All | Complete |

---

## 13. Existing Booking Audit Log Calls (Detail)

In the booking handler, audit logs are created at three points:

**Create** (handler/booking.go, line 311-318):
```go
if h.auditService != nil {
    h.auditService.Log(r.Context(), r, service.LogEntry{
        TenantID:   tenantID,
        Action:     model.AuditActionCreate,
        EntityType: "booking",
        EntityID:   booking.ID,
    })
}
```

**Update** (handler/booking.go, line 433-442):
```go
if h.auditService != nil {
    if tenantID, ok := middleware.TenantFromContext(r.Context()); ok {
        h.auditService.Log(r.Context(), r, service.LogEntry{
            TenantID:   tenantID,
            Action:     model.AuditActionUpdate,
            EntityType: "booking",
            EntityID:   booking.ID,
        })
    }
}
```

**Delete** (handler/booking.go, line 494-503):
```go
if h.auditService != nil {
    if tenantID, ok := middleware.TenantFromContext(r.Context()); ok {
        h.auditService.Log(r.Context(), r, service.LogEntry{
            TenantID:   tenantID,
            Action:     model.AuditActionDelete,
            EntityType: "booking",
            EntityID:   id,
        })
    }
}
```

None of these calls include `Changes` or `EntityName` fields. The `LogEntry` struct supports both `Changes any` and `Metadata any`, but they are not used here.

---

## 14. Latest Migration Sequence

The latest migration is `000044_booking_type_enhancements`. Any new migrations for this ticket would start at `000045`.
