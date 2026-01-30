# Research: ZMI-TICKET-035 Booking Reason Time Adjustments

Date: 2026-01-30
Ticket: `thoughts/shared/tickets/ZMI-TICKET-035-booking-reason-adjustments.md`

---

## 1. Current State of Booking Reasons

### 1.1 Database Schema

The `booking_reasons` table was created in migration `000044_booking_type_enhancements.up.sql`:

**File**: `/home/tolga/projects/terp/db/migrations/000044_booking_type_enhancements.up.sql` (lines 23-43)

```sql
CREATE TABLE booking_reasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    booking_type_id UUID NOT NULL REFERENCES booking_types(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    label VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, booking_type_id, code)
);
```

Current columns:
- `id` (UUID PK)
- `tenant_id` (UUID FK to tenants)
- `booking_type_id` (UUID FK to booking_types)
- `code` (VARCHAR 50, unique per tenant+booking_type)
- `label` (VARCHAR 255)
- `is_active` (BOOLEAN, default true)
- `sort_order` (INT, default 0)
- `created_at`, `updated_at` (TIMESTAMPTZ)

**No adjustment-related columns exist** (no `reference_time`, `offset_minutes`, `adjustment_direction`).

The latest migration number is `000077` (macros). A new migration would be `000078`.

### 1.2 Go Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/bookingreason.go` (lines 1-24)

```go
type BookingReason struct {
    ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID      uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    BookingTypeID uuid.UUID `gorm:"type:uuid;not null;index" json:"booking_type_id"`
    Code          string    `gorm:"type:varchar(50);not null" json:"code"`
    Label         string    `gorm:"type:varchar(255);not null" json:"label"`
    IsActive      bool      `gorm:"default:true" json:"is_active"`
    SortOrder     int       `gorm:"default:0" json:"sort_order"`
    CreatedAt     time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt     time.Time `gorm:"default:now()" json:"updated_at"`
}
```

The model has no adjustment fields. No `ReferenceTime`, `OffsetMinutes`, or `AdjustmentDirection` fields exist.

### 1.3 Service Layer

**File**: `/home/tolga/projects/terp/apps/api/internal/service/bookingreason.go` (lines 1-147)

The `BookingReasonService` provides:
- `Create(ctx, CreateBookingReasonInput)` - validates code, label, booking_type_id; checks uniqueness
- `GetByID(ctx, id)` - retrieves by ID
- `Update(ctx, id, UpdateBookingReasonInput)` - updates label, is_active, sort_order
- `Delete(ctx, id)` - hard delete
- `List(ctx, tenantID)` - lists all reasons for tenant
- `ListByBookingType(ctx, tenantID, bookingTypeID)` - filters by booking type

`CreateBookingReasonInput` (line 41):
```go
type CreateBookingReasonInput struct {
    TenantID      uuid.UUID
    BookingTypeID uuid.UUID
    Code          string
    Label         string
    SortOrder     *int
}
```

`UpdateBookingReasonInput` (line 96):
```go
type UpdateBookingReasonInput struct {
    Label     *string
    IsActive  *bool
    SortOrder *int
}
```

Neither input struct has adjustment fields.

### 1.4 Repository

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/bookingreason.go`

Provides standard CRUD operations plus `GetByCode` and `ListByBookingType`. No adjustment-related queries exist.

### 1.5 Handler

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/bookingreason.go`

Standard REST handler mapping to service methods. No adjustment-related request/response handling.

### 1.6 Generated Models

**File**: `/home/tolga/projects/terp/apps/api/gen/models/booking_reason.go` (lines 20-62)

```go
type BookingReason struct {
    BookingTypeID *strfmt.UUID    `json:"booking_type_id"`
    Code          *string         `json:"code"`
    CreatedAt     strfmt.DateTime `json:"created_at,omitempty"`
    ID            *strfmt.UUID    `json:"id"`
    IsActive      bool            `json:"is_active,omitempty"`
    Label         *string         `json:"label"`
    SortOrder     int64           `json:"sort_order,omitempty"`
    TenantID      *strfmt.UUID    `json:"tenant_id"`
    UpdatedAt     strfmt.DateTime `json:"updated_at,omitempty"`
}
```

No adjustment fields in the generated model.

### 1.7 OpenAPI Schema

**File**: `/home/tolga/projects/terp/api/schemas/booking-reasons.yaml` (lines 1-81)

Defines `BookingReason`, `CreateBookingReasonRequest`, `UpdateBookingReasonRequest`, `BookingReasonList`.
No adjustment-related properties exist in any of these schemas.

### 1.8 OpenAPI Paths

**File**: `/home/tolga/projects/terp/api/paths/booking-reasons.yaml` (lines 1-111)

Standard CRUD endpoints:
- `GET /booking-reasons` with optional `booking_type_id` query filter
- `POST /booking-reasons`
- `GET /booking-reasons/{id}`
- `PATCH /booking-reasons/{id}`
- `DELETE /booking-reasons/{id}`

### 1.9 Route Registration

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/routes.go` (lines 672-690)

```go
func RegisterBookingReasonRoutes(r chi.Router, h *BookingReasonHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("booking_types.manage").String()
    r.Route("/booking-reasons", func(r chi.Router) { ... })
}
```

Uses `booking_types.manage` permission for all CRUD operations.

---

## 2. Current Booking Model and Creation Flow

### 2.1 Database Schema

**File**: `/home/tolga/projects/terp/db/migrations/000022_create_bookings.up.sql` (lines 1-42)

```sql
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    booking_date DATE NOT NULL,
    booking_type_id UUID NOT NULL REFERENCES booking_types(id),
    original_time INT NOT NULL,
    edited_time INT NOT NULL,
    calculated_time INT,
    pair_id UUID,
    source VARCHAR(20) DEFAULT 'web',
    terminal_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    updated_by UUID
);
```

There is **no `booking_reason_id`** column on the bookings table. Bookings currently have no link to reasons.

There is **no `is_auto_generated`** flag or **`original_booking_id`** column on the bookings table.

### 2.2 Go Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/booking.go` (lines 1-95)

```go
type Booking struct {
    ID            uuid.UUID     `gorm:"..." json:"id"`
    TenantID      uuid.UUID     `gorm:"..." json:"tenant_id"`
    EmployeeID    uuid.UUID     `gorm:"..." json:"employee_id"`
    BookingDate   time.Time     `gorm:"..." json:"booking_date"`
    BookingTypeID uuid.UUID     `gorm:"..." json:"booking_type_id"`
    OriginalTime   int          `gorm:"..." json:"original_time"`
    EditedTime     int          `gorm:"..." json:"edited_time"`
    CalculatedTime *int         `gorm:"..." json:"calculated_time,omitempty"`
    PairID         *uuid.UUID   `gorm:"..." json:"pair_id,omitempty"`
    Source         BookingSource `gorm:"..." json:"source"`
    TerminalID     *uuid.UUID   `gorm:"..." json:"terminal_id,omitempty"`
    Notes          string       `gorm:"..." json:"notes,omitempty"`
    CreatedAt      time.Time    `gorm:"..." json:"created_at"`
    UpdatedAt      time.Time    `gorm:"..." json:"updated_at"`
    CreatedBy      *uuid.UUID   `gorm:"..." json:"created_by,omitempty"`
    UpdatedBy      *uuid.UUID   `gorm:"..." json:"updated_by,omitempty"`
    // Relations
    Employee    *Employee    `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
    BookingType *BookingType `gorm:"foreignKey:BookingTypeID" json:"booking_type,omitempty"`
    Pair        *Booking     `gorm:"foreignKey:PairID" json:"pair,omitempty"`
}
```

Key methods:
- `EffectiveTime()` - returns `calculated_time` if set, else `edited_time` (line 61)
- `IsEdited()` - returns true if `edited_time != original_time` (line 69)
- `TimeString()` - returns HH:MM formatted time (line 56)

Booking source enum values (line 10-18):
- `web`, `terminal`, `api`, `import`, `correction`

### 2.3 Booking Type Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/bookingtype.go` (lines 1-54)

```go
type BookingType struct {
    ID             uuid.UUID        `...`
    TenantID       *uuid.UUID       `...`   // NULL for system types
    Code           string           `...`
    Name           string           `...`
    Description    *string          `...`
    Direction      BookingDirection `...`   // "in" or "out"
    Category       BookingCategory  `...`   // "work", "break", "business_trip", "other"
    AccountID      *uuid.UUID       `...`
    RequiresReason bool             `...`
    IsSystem       bool             `...`
    IsActive       bool             `...`
    ...
}
```

The `RequiresReason` field exists on `BookingType` but is not enforced in the booking creation service (no reason validation in `BookingService.Create`).

### 2.4 Booking Service - Creation Flow

**File**: `/home/tolga/projects/terp/apps/api/internal/service/booking.go` (lines 92-140)

The `Create` method flow:
1. Validate `OriginalTime` and `EditedTime` (minutes 0-1439)
2. Check month is not closed
3. Validate booking type exists and belongs to tenant
4. Build `model.Booking` from input
5. Call `bookingRepo.Create()`
6. Trigger recalculation via `recalcSvc.TriggerRecalc()`
7. Return the created booking

`CreateBookingInput` (line 71):
```go
type CreateBookingInput struct {
    TenantID      uuid.UUID
    EmployeeID    uuid.UUID
    BookingTypeID uuid.UUID
    BookingDate   time.Time
    OriginalTime  int
    EditedTime    int
    Source        model.BookingSource
    TerminalID    *uuid.UUID
    Notes         string
    CreatedBy     *uuid.UUID
}
```

There is **no booking reason ID** in the create input. The booking creation flow does not check `RequiresReason` on the booking type and does not handle reason-based adjustments.

### 2.5 Generated Models

**File**: `/home/tolga/projects/terp/apps/api/gen/models/booking.go` (lines 21-113)

The generated `Booking` struct has no `booking_reason_id`, `is_auto_generated`, or `original_booking_id` fields.

**File**: `/home/tolga/projects/terp/apps/api/gen/models/create_booking_request.go` (lines 20-44)

```go
type CreateBookingRequest struct {
    BookingDate   *strfmt.Date `json:"booking_date"`
    BookingTypeID *strfmt.UUID `json:"booking_type_id"`
    EmployeeID    *strfmt.UUID `json:"employee_id"`
    Notes         string       `json:"notes,omitempty"`
    Time          *string      `json:"time"`
}
```

No `booking_reason_id` field in the create request.

### 2.6 OpenAPI Schema

**File**: `/home/tolga/projects/terp/api/schemas/bookings.yaml` (lines 1-210)

The `Booking` schema has no reason, auto-generated, or original booking fields.
The `CreateBookingRequest` schema has no reason field.

---

## 3. Day Plan Model and Accessing Plan Start/End Times

### 3.1 DayPlan Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/dayplan.go` (lines 51-137)

The `DayPlan` struct contains time windows as minutes from midnight:
- `ComeFrom *int` - earliest allowed arrival (line 60)
- `ComeTo *int` - latest allowed arrival (line 61)
- `GoFrom *int` - earliest allowed departure (line 62)
- `GoTo *int` - latest allowed departure (line 63)
- `CoreStart *int` - core time start (line 64)
- `CoreEnd *int` - core time end (line 65)
- `RegularHours int` - target work time in minutes (line 68)

For the ticket's `plan_start` reference, `ComeFrom` represents the planned start.
For `plan_end`, `GoTo` represents the planned end.

However, the day plan does not have explicit "plan_start" and "plan_end" fields. The closest mappings are:
- `plan_start` -> `ComeFrom` (earliest arrival window)
- `plan_end` -> `GoTo` (latest departure window)

Alternatively, `ComeTo` (latest arrival) or `GoFrom` (earliest departure) could be used depending on interpretation.

### 3.2 EmployeeDayPlan Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/employeedayplan.go` (lines 1-43)

```go
type EmployeeDayPlan struct {
    ID         uuid.UUID             `...`
    TenantID   uuid.UUID             `...`
    EmployeeID uuid.UUID             `...`
    PlanDate   time.Time             `...`
    DayPlanID  *uuid.UUID            `...`
    Source     EmployeeDayPlanSource `...` // "tariff", "manual", "holiday"
    Notes      string                `...`
    Employee   *Employee             `gorm:"foreignKey:EmployeeID"`
    DayPlan    *DayPlan              `gorm:"foreignKey:DayPlanID"`
}
```

`DayPlanID` is nullable -- a nil value means "off day" (`IsOffDay()` at line 41).

### 3.3 How Day Plans Are Accessed in Daily Calculation

**File**: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go` (lines 157-223)

In `CalculateDay`:
1. `empDayPlan, err := s.empDayPlanRepo.GetForEmployeeDate(ctx, employeeID, date)` (line 167)
2. If `empDayPlan == nil || empDayPlan.DayPlanID == nil` -> off day (line 181)
3. Otherwise `empDayPlan.DayPlan` contains the full `DayPlan` struct with time windows

The `employeeDayPlanRepository` interface (line 28):
```go
type employeeDayPlanRepository interface {
    GetForEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.EmployeeDayPlan, error)
}
```

The `dayPlanLookup` interface (line 33):
```go
type dayPlanLookup interface {
    GetByID(ctx context.Context, id uuid.UUID) (*model.DayPlan, error)
    GetWithDetails(ctx context.Context, id uuid.UUID) (*model.DayPlan, error)
}
```

### 3.4 How Day Plans Are Accessed in DayView Handler

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/booking.go` (lines 25-59)

The `BookingHandler` has `empDayPlanRepo *repository.EmployeeDayPlanRepository` (line 31). The `GetDayView` method (line 546) uses this to fetch the employee's assigned day plan for a given date.

---

## 4. Daily Calculation Flow

### 4.1 DailyCalcService

**File**: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go` (lines 71-106)

The service depends on:
- `bookingRepo` (bookingRepository) - fetches bookings
- `empDayPlanRepo` (employeeDayPlanRepository) - fetches day plans
- `dayPlanRepo` (dayPlanLookup) - shift detection lookups
- `dailyValueRepo` (dailyValueRepository) - persists DailyValue
- `holidayRepo` (holidayLookup) - holiday checks
- `employeeRepo` (employeeLookup) - employee data
- `absenceDayRepo` (absenceDayLookup) - absence checks
- `calc` (*calculation.Calculator) - the pure calculation engine
- `notificationSvc` - optional notification service
- `orderBookingSvc` (orderBookingCreator) - optional, for auto order bookings
- `settingsLookup` - system settings

### 4.2 CalculateDay Flow

**File**: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go` (lines 157-223)

1. Check for holiday
2. Get employee day plan
3. Load bookings (with adjacent day loading for day-change behavior)
4. Branch based on conditions:
   - Off day (no plan): `handleOffDay`
   - Holiday without bookings: `handleHolidayCredit` or `handleAbsenceCredit`
   - No bookings: `handleNoBookings` (behavior per day plan config)
   - Normal: `calculateWithBookings`
5. Persist DailyValue via `dailyValueRepo.Upsert`
6. Notify on errors

### 4.3 calculateWithBookings

**File**: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go` (lines 836-906)

1. Run shift detection if configured
2. Build `calculation.CalculationInput` from day plan + bookings
3. Run `s.calc.Calculate(input)` (pure calculation)
4. Apply shift detection errors
5. Convert result to `DailyValue`
6. Update booking calculated times in DB

### 4.4 RecalculateRange

**File**: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go` (lines 1078-1088)

Iterates day-by-day calling `CalculateDay`. The `RecalcService` (in `recalc.go`) orchestrates batch recalculation.

---

## 5. OpenAPI Spec Structure

### 5.1 Bookings

**Schema file**: `/home/tolga/projects/terp/api/schemas/bookings.yaml`
- `Booking` - full booking object (lines 1-104)
- `BookingSummary` - compact form (lines 106-123)
- `CreateBookingRequest` - create payload (lines 125-149)
- `UpdateBookingRequest` - update payload (lines 150-158)
- `BookingList` - paginated list (lines 160-172)
- `DayView` - day overview (lines 174-210)

**Paths file**: `/home/tolga/projects/terp/api/paths/bookings.yaml`
- `GET /bookings` - list with filters (lines 1-46)
- `POST /bookings` - create (lines 47-70)
- `GET /bookings/{id}` - get by ID (lines 72-92)
- `PUT /bookings/{id}` - update (lines 93-123)
- `DELETE /bookings/{id}` - delete (lines 124-145)
- `GET /bookings/{id}/logs` - audit logs (lines 147-180)

### 5.2 Booking Reasons

**Schema file**: `/home/tolga/projects/terp/api/schemas/booking-reasons.yaml`
- `BookingReason` - reason object (lines 1-37)
- `CreateBookingReasonRequest` - create payload (lines 39-58)
- `UpdateBookingReasonRequest` - update payload (lines 60-70)
- `BookingReasonList` - list wrapper (lines 72-81)

**Paths file**: `/home/tolga/projects/terp/api/paths/booking-reasons.yaml`
- `GET /booking-reasons` - list with optional `booking_type_id` filter
- `POST /booking-reasons` - create
- `GET /booking-reasons/{id}` - get
- `PATCH /booking-reasons/{id}` - update
- `DELETE /booking-reasons/{id}` - delete

### 5.3 Booking Types

**Schema file**: `/home/tolga/projects/terp/api/schemas/booking-types.yaml`
- `BookingType` - includes `requires_reason` boolean
- `BookingTypeSummary` - compact (id, code, name, direction)

---

## 6. Existing Patterns

### 6.1 Auto-Generated Records: OrderBooking Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/service/order_booking.go` (lines 186-209)

The `OrderBooking` system uses a `Source` field with value `"auto"` to identify auto-generated records:

```go
const OrderBookingSourceAuto OrderBookingSource = "auto"
```

The pattern for idempotent auto-generation:
1. `DeleteAutoBookingsByDate(ctx, employeeID, date)` - delete existing auto-generated records
2. `CreateAutoBooking(ctx, ...)` - create fresh auto-generated record

This delete-and-recreate pattern is used in daily calculation (`daily_calc.go` lines 441-454).

**File**: `/home/tolga/projects/terp/apps/api/internal/model/order_booking.go` (lines 9-15)

```go
type OrderBookingSource string
const (
    OrderBookingSourceManual OrderBookingSource = "manual"
    OrderBookingSourceAuto   OrderBookingSource = "auto"
    OrderBookingSourceImport OrderBookingSource = "import"
)
```

### 6.2 Auto-Complete Bookings in Day Change

**File**: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go` (lines 593-630)

The `ensureAutoCompleteBooking` method creates bookings with:
- `Source: model.BookingSourceCorrection`
- `Notes: "Auto-complete day change"`
- `OriginalTime: 0`, `EditedTime: 0`

Idempotency is achieved by checking if a matching booking already exists before creating:
```go
for _, b := range bookings {
    if b.Source != model.BookingSourceCorrection || b.Notes != autoCompleteNotes || b.EditedTime != 0 {
        continue
    }
    if b.BookingType != nil && b.BookingType.Direction == direction && b.BookingTypeID == bookingType.ID {
        return b, false, nil  // Already exists
    }
}
```

This approach uses a combination of `Source`, `Notes`, `EditedTime`, and `BookingTypeID` to identify auto-generated bookings rather than a dedicated flag.

### 6.3 Vacation Test Reference to "OriginalBooking"

**File**: `/home/tolga/projects/terp/apps/api/internal/service/vacation_test.go`

A grep found a match for `original_booking` or `DerivedBooking` in this file, but it refers to vacation-related test logic, not a booking-level field.

### 6.4 Source Enum Values on Bookings

The existing `BookingSource` enum values are: `web`, `terminal`, `api`, `import`, `correction`.

There is no `auto_generated` or `derived` source value currently.

---

## 7. Existing Tests

### 7.1 Booking Reason Service Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/service/bookingreason_test.go` (lines 1-335)

Integration tests using real database (`testutil.SetupTestDB`):
- `TestBookingReasonService_Create_Success`
- `TestBookingReasonService_Create_WithSortOrder`
- `TestBookingReasonService_Create_EmptyCode`
- `TestBookingReasonService_Create_EmptyLabel`
- `TestBookingReasonService_Create_MissingBookingTypeID`
- `TestBookingReasonService_Create_DuplicateCode`
- `TestBookingReasonService_GetByID`
- `TestBookingReasonService_GetByID_NotFound`
- `TestBookingReasonService_Update`
- `TestBookingReasonService_Update_EmptyLabel`
- `TestBookingReasonService_Delete`
- `TestBookingReasonService_Delete_NotFound`
- `TestBookingReasonService_List`
- `TestBookingReasonService_ListByBookingType`

### 7.2 Booking Service Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/service/booking_test.go` (lines 1-854)

Unit tests using mocks (testify mock):
- `TestBookingService_Create_Success`
- `TestBookingService_Create_SystemBookingType`
- `TestBookingService_Create_InvalidTime`
- `TestBookingService_Create_InvalidBookingType`
- `TestBookingService_Create_BookingTypeNotFound`
- `TestBookingService_Create_MonthClosed`
- `TestBookingService_Create_MonthlyValueRepoNil`
- `TestBookingService_GetByID_Success`
- `TestBookingService_GetByID_NotFound`
- `TestBookingService_Update_Success`
- `TestBookingService_Update_NotFound`
- `TestBookingService_Update_InvalidTime`
- `TestBookingService_Update_MonthClosed`
- `TestBookingService_Delete_Success`
- `TestBookingService_Delete_NotFound`
- `TestBookingService_Delete_MonthClosed`
- `TestBookingService_ListByEmployeeDate_Success`
- `TestBookingService_ListByEmployeeDateRange_Success`
- `TestBookingService_ValidateTime`
- `TestBookingService_Update_OriginalTimeNeverChanges`
- `TestBookingService_Update_CalculatedTimeClearedOnEditedTimeChange`
- `TestBookingService_Update_OnlyNotesNoTimeClear`
- `TestBookingModel_EffectiveTime_WithCalculatedTime`
- `TestBookingModel_EffectiveTime_WithoutCalculatedTime`
- `TestBookingModel_IsEdited`
- `TestBookingService_Create_SetsEditedTimeToOriginal`
- `TestBookingService_Delete_TriggersRecalc`

Mock interfaces defined in `booking_test.go`:
- `mockBookingRepositoryForService`
- `mockBookingTypeRepositoryForService`
- `mockRecalcServiceForBooking`
- `mockMonthlyValueLookupForBooking`

Test helper at line 96:
```go
func newTestBookingService() (*BookingService, *mockBookingRepositoryForService, *mockBookingTypeRepositoryForService, *mockRecalcServiceForBooking, *mockMonthlyValueLookupForBooking)
```

### 7.3 Terminal Service Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/service/terminal_test.go`

Tests for terminal import flow including idempotency of batch imports.

---

## 8. Gaps and Missing Prerequisites

### 8.1 No booking_reason_id on bookings table
The `bookings` table has no foreign key to `booking_reasons`. Bookings cannot currently be linked to a reason.

### 8.2 No adjustment fields on booking_reasons table
The `booking_reasons` table has no `reference_time`, `offset_minutes`, or `adjustment_direction` columns.

### 8.3 No auto-generated flag on bookings table
The `bookings` table has no `is_auto_generated` boolean or `original_booking_id` UUID column.

### 8.4 No reason in booking creation flow
`CreateBookingInput` (service) and `CreateBookingRequest` (OpenAPI) have no `booking_reason_id` field. The booking creation handler does not accept or process reasons.

### 8.5 No RequiresReason enforcement
Although `BookingType.RequiresReason` exists in the model, it is not enforced during booking creation (no check in `BookingService.Create`).

### 8.6 No derived booking creation logic
No service or function exists to compute derived booking times from reason adjustments.

### 8.7 Day plan access from booking service
The `BookingService` does not depend on `employeeDayPlanRepository` or `dayPlanLookup`. To compute derived bookings using plan-based reference times, the booking service would need access to day plan data. Currently only `DailyCalcService` accesses day plans.

---

## 9. Key File Location Summary

| Component | File | Key Lines |
|-----------|------|-----------|
| BookingReason model | `/home/tolga/projects/terp/apps/api/internal/model/bookingreason.go` | 10-20 |
| BookingReason service | `/home/tolga/projects/terp/apps/api/internal/service/bookingreason.go` | 1-147 |
| BookingReason handler | `/home/tolga/projects/terp/apps/api/internal/handler/bookingreason.go` | all |
| BookingReason repository | `/home/tolga/projects/terp/apps/api/internal/repository/bookingreason.go` | all |
| BookingReason tests | `/home/tolga/projects/terp/apps/api/internal/service/bookingreason_test.go` | 1-335 |
| Booking model | `/home/tolga/projects/terp/apps/api/internal/model/booking.go` | 20-48 |
| Booking service | `/home/tolga/projects/terp/apps/api/internal/service/booking.go` | 1-267 |
| Booking handler | `/home/tolga/projects/terp/apps/api/internal/handler/booking.go` | 1-60 (handler), 62-180 (List) |
| Booking repository | `/home/tolga/projects/terp/apps/api/internal/repository/booking.go` | all |
| Booking tests | `/home/tolga/projects/terp/apps/api/internal/service/booking_test.go` | 1-854 |
| BookingType model | `/home/tolga/projects/terp/apps/api/internal/model/bookingtype.go` | 25-44 |
| DayPlan model | `/home/tolga/projects/terp/apps/api/internal/model/dayplan.go` | 51-137 |
| EmployeeDayPlan model | `/home/tolga/projects/terp/apps/api/internal/model/employeedayplan.go` | 19-33 |
| DailyCalcService | `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go` | 71-106 (struct), 157-223 (CalculateDay) |
| RecalcService | `/home/tolga/projects/terp/apps/api/internal/service/recalc.go` | 1-127 |
| OrderBooking auto pattern | `/home/tolga/projects/terp/apps/api/internal/service/order_booking.go` | 186-209 |
| Auto-complete booking | `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go` | 593-630 |
| OpenAPI booking schema | `/home/tolga/projects/terp/api/schemas/bookings.yaml` | 1-210 |
| OpenAPI booking paths | `/home/tolga/projects/terp/api/paths/bookings.yaml` | 1-180 |
| OpenAPI reason schema | `/home/tolga/projects/terp/api/schemas/booking-reasons.yaml` | 1-81 |
| OpenAPI reason paths | `/home/tolga/projects/terp/api/paths/booking-reasons.yaml` | 1-111 |
| OpenAPI booking type schema | `/home/tolga/projects/terp/api/schemas/booking-types.yaml` | 1-160 |
| Gen BookingReason model | `/home/tolga/projects/terp/apps/api/gen/models/booking_reason.go` | 20-62 |
| Gen Booking model | `/home/tolga/projects/terp/apps/api/gen/models/booking.go` | 21-113 |
| Gen CreateBookingRequest | `/home/tolga/projects/terp/apps/api/gen/models/create_booking_request.go` | 20-44 |
| Gen CreateBookingReasonReq | `/home/tolga/projects/terp/apps/api/gen/models/create_booking_reason_request.go` | 20-41 |
| Migration: bookings table | `/home/tolga/projects/terp/db/migrations/000022_create_bookings.up.sql` | 1-42 |
| Migration: booking types | `/home/tolga/projects/terp/db/migrations/000021_create_booking_types.up.sql` | 1-32 |
| Migration: booking reasons | `/home/tolga/projects/terp/db/migrations/000044_booking_type_enhancements.up.sql` | 23-43 |
| Route registration | `/home/tolga/projects/terp/apps/api/internal/handler/routes.go` | 672-690 (reasons), 399-437 (bookings) |
| Main server wiring | `/home/tolga/projects/terp/apps/api/cmd/server/main.go` | 486-489 |
| Ticket definition | `/home/tolga/projects/terp/thoughts/shared/tickets/ZMI-TICKET-035-booking-reason-adjustments.md` | all |
