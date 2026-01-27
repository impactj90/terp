# Research: NOK-137 - Create Absence Handler

## 1. Existing Handler Patterns

### Handler Structure (from `apps/api/internal/handler/booking.go`)

Handlers follow this pattern:
- A struct holding service and repository dependencies
- A constructor function `NewXHandler(...) *XHandler`
- Methods per HTTP endpoint with signature `(w http.ResponseWriter, r *http.Request)`
- A model-to-response converter method

```go
// BookingHandler handles booking-related HTTP requests.
type BookingHandler struct {
    bookingService   *service.BookingService
    dailyCalcService *service.DailyCalcService
    bookingRepo      *repository.BookingRepository
    // ...
}

func NewBookingHandler(...) *BookingHandler {
    return &BookingHandler{...}
}
```

### Route Registration (from `apps/api/internal/handler/routes.go`)

Each handler has a `RegisterXRoutes` function in `routes.go`:

```go
func RegisterBookingRoutes(r chi.Router, h *BookingHandler) {
    r.Route("/bookings", func(r chi.Router) {
        r.Get("/", h.List)
        r.Post("/", h.Create)
        r.Get("/{id}", h.GetByID)
        r.Put("/{id}", h.Update)
        r.Delete("/{id}", h.Delete)
    })

    // Nested under employees
    r.Route("/employees/{id}/day/{date}", func(r chi.Router) {
        r.Get("/", h.GetDayView)
        r.Post("/calculate", h.Calculate)
    })
}
```

### Request Parsing Patterns

**Tenant Context** (line 52 of booking.go):
```go
tenantID, ok := middleware.TenantFromContext(r.Context())
if !ok {
    respondError(w, http.StatusUnauthorized, "Tenant required")
    return
}
```

**URL Path Params** (line 268):
```go
idStr := chi.URLParam(r, "id")
id, err := uuid.Parse(idStr)
if err != nil {
    respondError(w, http.StatusBadRequest, "Invalid booking ID")
    return
}
```

**Query Parameters** (lines 65-104):
```go
if from := r.URL.Query().Get("from"); from != "" {
    t, err := time.Parse("2006-01-02", from)
    if err != nil {
        respondError(w, http.StatusBadRequest, "Invalid from date format, expected YYYY-MM-DD")
        return
    }
    filter.StartDate = &t
}
```

**JSON Body Decoding with Validation** (lines 207-216):
```go
var req models.CreateBookingRequest
if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
    respondError(w, http.StatusBadRequest, "Invalid request body")
    return
}
if err := req.Validate(nil); err != nil {
    respondError(w, http.StatusBadRequest, err.Error())
    return
}
```

### Response Formatting (from `apps/api/internal/handler/response.go`)

```go
func respondJSON(w http.ResponseWriter, status int, data any) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    _ = json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, message string) {
    respondJSON(w, status, map[string]any{
        "error":   http.StatusText(status),
        "message": message,
        "status":  status,
    })
}
```

### Error Handling Pattern

Service errors are mapped to HTTP status codes via switch:
```go
err = h.bookingService.Delete(r.Context(), id)
if err != nil {
    switch err {
    case service.ErrBookingNotFound:
        respondError(w, http.StatusNotFound, "Booking not found")
    case service.ErrMonthClosed:
        respondError(w, http.StatusForbidden, "Month is closed")
    default:
        respondError(w, http.StatusInternalServerError, "Failed to delete booking")
    }
    return
}
```

### Delete Response Pattern

Delete returns 204 No Content:
```go
w.WriteHeader(http.StatusNoContent)
```

---

## 2. Absence Service Interface

**File**: `apps/api/internal/service/absence.go`

### Available Methods

| Method | Parameters | Return |
|--------|-----------|--------|
| `GetByID` | `ctx context.Context, id uuid.UUID` | `*model.AbsenceDay, error` |
| `ListByEmployee` | `ctx context.Context, employeeID uuid.UUID` | `[]model.AbsenceDay, error` |
| `GetByEmployeeDateRange` | `ctx context.Context, employeeID uuid.UUID, from, to time.Time` | `[]model.AbsenceDay, error` |
| `Delete` | `ctx context.Context, id uuid.UUID` | `error` |
| `DeleteRange` | `ctx context.Context, tenantID, employeeID uuid.UUID, from, to time.Time` | `error` |
| `CreateRange` | `ctx context.Context, input CreateAbsenceRangeInput` | `*CreateAbsenceRangeResult, error` |

### Service Error Constants

```go
var (
    ErrAbsenceNotFound      = errors.New("absence not found")
    ErrInvalidAbsenceType   = errors.New("invalid absence type")
    ErrAbsenceTypeInactive  = errors.New("absence type is inactive")
    ErrAbsenceAlreadyExists = errors.New("absence already exists on date")
    ErrInvalidAbsenceDates  = errors.New("from date must be before or equal to to date")
    ErrNoAbsenceDaysCreated = errors.New("no valid absence days in range (all dates skipped)")
)
```

### CreateAbsenceRangeInput

```go
type CreateAbsenceRangeInput struct {
    TenantID      uuid.UUID
    EmployeeID    uuid.UUID
    AbsenceTypeID uuid.UUID
    FromDate      time.Time
    ToDate        time.Time
    Duration      decimal.Decimal      // 1.00 = full day, 0.50 = half day
    HalfDayPeriod *model.HalfDayPeriod // Required when Duration = 0.5
    Status        model.AbsenceStatus  // Typically "pending" or "approved" for admin
    Notes         *string
    CreatedBy     *uuid.UUID
}
```

### CreateAbsenceRangeResult

```go
type CreateAbsenceRangeResult struct {
    CreatedDays  []model.AbsenceDay
    SkippedDates []time.Time
}
```

---

## 3. Absence Type Repository (for List Absence Types endpoint)

**File**: `apps/api/internal/repository/absencetype.go`

The handler will need direct access to the `AbsenceTypeRepository` for listing types since the AbsenceService only uses the type repo for validation (GetByID).

```go
func (r *AbsenceTypeRepository) List(ctx context.Context, tenantID uuid.UUID, includeSystem bool) ([]model.AbsenceType, error)
```

- `includeSystem: true` returns both tenant-specific and system types (TenantID IS NULL)
- Results are ordered by `sort_order ASC, code ASC`
- Only returns active types (`is_active = true`)

---

## 4. OpenAPI Spec Endpoints

### GET /absence-types (from `api/paths/absence-types.yaml`)

- **Query params**: `active` (boolean), `category` (enum)
- **Response**: `AbsenceTypeList` (200)
- Lists all absence types including system types

### GET /employees/{id}/absences (from `api/paths/employees.yaml`)

- **Path param**: `id` (uuid) - employee ID
- **Query params**: `from` (date), `to` (date)
- **Response**: `AbsenceList` (200)
- Lists absences for a specific employee with optional date range

### POST /employees/{id}/absences (from `api/paths/employees.yaml`)

- **Path param**: `id` (uuid) - employee ID
- **Body**: `CreateAbsenceRangeRequest`
- **Response**: `AbsenceList` (201) - the created absences
- Creates absences for a date range

### DELETE /absences/{id} (from `api/paths/absences.yaml`)

- **Path param**: `id` (uuid) - absence ID
- **Response**: 204 No Content
- Deletes a single absence day and triggers recalculation

---

## 5. Generated Models

### `models.Absence` (`apps/api/gen/models/absence.go`)

```go
type Absence struct {
    AbsenceDate   *strfmt.Date     `json:"absence_date"`
    AbsenceType   struct{ AbsenceTypeSummary } `json:"absence_type,omitempty"`
    AbsenceTypeID *strfmt.UUID     `json:"absence_type_id"`
    ApprovedAt    *strfmt.DateTime `json:"approved_at,omitempty"`
    ApprovedBy    *strfmt.UUID     `json:"approved_by,omitempty"`
    CreatedAt     strfmt.DateTime  `json:"created_at,omitempty"`
    CreatedBy     *strfmt.UUID     `json:"created_by,omitempty"`
    Duration      *float64         `json:"duration"`
    Employee      struct{ EmployeeSummary } `json:"employee,omitempty"`
    EmployeeID    *strfmt.UUID     `json:"employee_id"`
    ID            *strfmt.UUID     `json:"id"`
    Notes         *string          `json:"notes,omitempty"`
    Status        string           `json:"status,omitempty"`
    TenantID      *strfmt.UUID     `json:"tenant_id"`
    UpdatedAt     strfmt.DateTime  `json:"updated_at,omitempty"`
}
```

### `models.AbsenceList` (`apps/api/gen/models/absence_list.go`)

```go
type AbsenceList struct {
    Data []*Absence `json:"data"`
}
```

### `models.AbsenceType` (`apps/api/gen/models/absence_type.go`)

```go
type AbsenceType struct {
    AffectsVacationBalance bool            `json:"affects_vacation_balance,omitempty"`
    Category               *string         `json:"category"`
    Code                   *string         `json:"code"`
    Color                  string          `json:"color,omitempty"`
    CreatedAt              strfmt.DateTime `json:"created_at,omitempty"`
    Description            *string         `json:"description,omitempty"`
    ID                     *strfmt.UUID    `json:"id"`
    IsActive               bool            `json:"is_active,omitempty"`
    IsPaid                 bool            `json:"is_paid,omitempty"`
    IsSystem               bool            `json:"is_system,omitempty"`
    Name                   *string         `json:"name"`
    RequiresApproval       bool            `json:"requires_approval,omitempty"`
    TenantID               *strfmt.UUID    `json:"tenant_id,omitempty"`
    UpdatedAt              strfmt.DateTime `json:"updated_at,omitempty"`
}
```

### `models.AbsenceTypeList` (`apps/api/gen/models/absence_type_list.go`)

```go
type AbsenceTypeList struct {
    Data []*AbsenceType `json:"data"`
}
```

### `models.AbsenceTypeSummary` (`apps/api/gen/models/absence_type_summary.go`)

```go
type AbsenceTypeSummary struct {
    Category *string      `json:"category"`
    Code     *string      `json:"code"`
    Color    string       `json:"color,omitempty"`
    ID       *strfmt.UUID `json:"id"`
    Name     *string      `json:"name"`
}
```

### `models.CreateAbsenceRangeRequest` (`apps/api/gen/models/create_absence_range_request.go`)

```go
type CreateAbsenceRangeRequest struct {
    AbsenceTypeID *strfmt.UUID `json:"absence_type_id"`  // Required
    Duration      *float64     `json:"duration"`          // Required
    From          *strfmt.Date `json:"from"`              // Required
    Notes         string       `json:"notes,omitempty"`
    To            *strfmt.Date `json:"to"`                // Required
}
```

Has built-in `Validate(formats strfmt.Registry) error` method.

---

## 6. Internal Domain Models

### `model.AbsenceDay` (`apps/api/internal/model/absenceday.go`)

```go
type AbsenceDay struct {
    ID            uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    TenantID      uuid.UUID       `gorm:"type:uuid;not null;index"`
    EmployeeID    uuid.UUID       `gorm:"type:uuid;not null;index"`
    CreatedAt     time.Time
    UpdatedAt     time.Time
    AbsenceDate   time.Time       `gorm:"type:date;not null"`
    AbsenceTypeID uuid.UUID       `gorm:"type:uuid;not null"`
    Duration      decimal.Decimal `gorm:"type:decimal(3,2);not null;default:1.00"`
    HalfDayPeriod *HalfDayPeriod
    Status        AbsenceStatus   `gorm:"type:varchar(20);not null;default:'pending'"`
    ApprovedBy    *uuid.UUID
    ApprovedAt    *time.Time
    RejectionReason *string
    Notes         *string
    CreatedBy     *uuid.UUID
    Employee      *Employee       `gorm:"foreignKey:EmployeeID"`
    AbsenceType   *AbsenceType    `gorm:"foreignKey:AbsenceTypeID"`
}
```

### `model.AbsenceType` (`apps/api/internal/model/absencetype.go`)

```go
type AbsenceType struct {
    ID               uuid.UUID
    TenantID         *uuid.UUID
    CreatedAt        time.Time
    UpdatedAt        time.Time
    Code             string
    Name             string
    Description      *string
    Category         AbsenceCategory
    Portion          AbsencePortion
    HolidayCode      *string
    Priority         int
    DeductsVacation  bool
    RequiresApproval bool
    RequiresDocument bool
    Color            string
    SortOrder        int
    IsSystem         bool
    IsActive         bool
}
```

**Note**: The internal `AbsenceType` model has fields that don't directly map to the generated API model (e.g., `Portion`, `HolidayCode`, `Priority`, `DeductsVacation`, `RequiresDocument`, `SortOrder`). The API model uses `AffectsVacationBalance` and `IsPaid` which are conceptually different. The conversion will need to map:
- `model.AbsenceType.DeductsVacation` -> `models.AbsenceType.AffectsVacationBalance`
- `model.AbsenceType.RequiresApproval` -> `models.AbsenceType.RequiresApproval`
- The `IsPaid` field is in the API model but not directly in the internal model (compute from Portion != None)
- Category enum values differ slightly: internal uses `vacation`, `illness`, `special`, `unpaid`; API uses `vacation`, `sick`, `personal`, `unpaid`, `holiday`, `other`

---

## 7. Route Registration in main.go

**File**: `apps/api/cmd/server/main.go`

The AbsenceService is already initialized (lines 109-112):
```go
// Initialize AbsenceService
absenceDayRepo := repository.NewAbsenceDayRepository(db)
absenceTypeRepo := repository.NewAbsenceTypeRepository(db)
absenceService := service.NewAbsenceService(absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcService)
_ = absenceService // TODO: Wire to AbsenceHandler (separate ticket)
```

The handler needs to be:
1. Created after line 112 (replacing the `_ = absenceService` line)
2. Registered in the tenant-scoped routes group (line 183-198)

---

## 8. Test Patterns

**File**: `apps/api/internal/handler/booking_test.go`

### Test Setup Pattern

Tests use real database integration tests (not mocks):
```go
func setupBookingHandler(t *testing.T) (*handler.BookingHandler, *service.BookingService, ...) {
    db := testutil.SetupTestDB(t)
    // Create repositories
    // Create test data (tenant, employee, etc.)
    // Create services
    // Create handler
    return h, svc, tenant, employee, bookingType
}
```

### Tenant Context Helper

```go
func withBookingTenantContext(r *http.Request, tenant *model.Tenant) *http.Request {
    ctx := context.WithValue(r.Context(), middleware.TenantContextKey, tenant.ID)
    return r.WithContext(ctx)
}
```

### Request Construction

```go
// POST with JSON body
body := map[string]interface{}{...}
bodyBytes, _ := json.Marshal(body)
req := httptest.NewRequest("POST", "/path", bytes.NewBuffer(bodyBytes))
req.Header.Set("Content-Type", "application/json")
req = withBookingTenantContext(req, tenant)
rr := httptest.NewRecorder()
h.Create(rr, req)
```

### Setting URL Path Params (chi route context)

```go
req := httptest.NewRequest("GET", "/bookings/"+id.String(), nil)
rctx := chi.NewRouteContext()
rctx.URLParams.Add("id", id.String())
req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
```

### Response Assertions

```go
assert.Equal(t, http.StatusOK, rr.Code)
var result map[string]interface{}
err := json.Unmarshal(rr.Body.Bytes(), &result)
require.NoError(t, err)
assert.NotEmpty(t, result["id"])
```

### Test Categories Needed

Based on the booking test pattern, these test categories are needed:
1. **ListAbsenceTypes**: success, no tenant
2. **ListEmployeeAbsences**: success, with date filters, invalid employee ID, no tenant
3. **CreateAbsenceRange**: success, invalid body, invalid employee ID, no tenant, service errors
4. **DeleteAbsence**: success, invalid ID, not found

---

## 9. Implementation Plan Summary

### Handler struct

```go
type AbsenceHandler struct {
    absenceService  *service.AbsenceService
    absenceTypeRepo *repository.AbsenceTypeRepository
}
```

The handler needs both the `AbsenceService` (for CRUD operations) and the `AbsenceTypeRepository` directly (for listing types, since the service doesn't expose a list method for types).

### Route Registration Function

```go
func RegisterAbsenceRoutes(r chi.Router, h *AbsenceHandler) {
    // Absence types
    r.Get("/absence-types", h.ListTypes)

    // Employee absences (nested under employees)
    r.Get("/employees/{id}/absences", h.ListByEmployee)
    r.Post("/employees/{id}/absences", h.CreateRange)

    // Absence CRUD
    r.Delete("/absences/{id}", h.Delete)
}
```

### Model Conversion Functions Needed

1. `absenceDayToResponse(ad *model.AbsenceDay) *models.Absence` - converts internal model to API response
2. `absenceTypeToResponse(at *model.AbsenceType) *models.AbsenceType` - converts internal type to API response

### Key Mappings (model -> API response)

For `AbsenceDay` -> `models.Absence`:
- `ID` -> `strfmt.UUID`
- `TenantID` -> `strfmt.UUID`
- `EmployeeID` -> `strfmt.UUID`
- `AbsenceTypeID` -> `strfmt.UUID`
- `AbsenceDate` -> `strfmt.Date`
- `Duration` -> `*float64` (via `decimal.InexactFloat64()`)
- `Status` -> `string(ad.Status)`
- `Notes` -> `*string`
- `CreatedBy` -> `*strfmt.UUID`
- `ApprovedBy` -> `*strfmt.UUID`
- `ApprovedAt` -> `*strfmt.DateTime`
- `AbsenceType` relation -> `AbsenceTypeSummary` embedded struct

For `AbsenceType` -> `models.AbsenceType`:
- `ID` -> `strfmt.UUID`
- `TenantID` -> `*strfmt.UUID` (nil for system types)
- `Code` -> `*string`
- `Name` -> `*string`
- `Description` -> `*string`
- `Category` -> `*string` (cast from `AbsenceCategory`)
- `DeductsVacation` -> `AffectsVacationBalance`
- `RequiresApproval` -> `RequiresApproval`
- `Color` -> `string`
- `IsSystem` -> `bool`
- `IsActive` -> `bool`
- `IsPaid` -> compute from `Portion != AbsencePortionNone`
- `CreatedAt/UpdatedAt` -> `strfmt.DateTime`

### Error Mapping

| Service Error | HTTP Status | Message |
|---------------|-------------|---------|
| `ErrAbsenceNotFound` | 404 | "Absence not found" |
| `ErrInvalidAbsenceType` | 400 | "Invalid absence type" |
| `ErrAbsenceTypeInactive` | 400 | "Absence type is inactive" |
| `ErrInvalidAbsenceDates` | 400 | "Invalid date range" |
| `ErrNoAbsenceDaysCreated` | 400 | "No valid absence days in range" |
| default | 500 | "Failed to ..." |

### main.go Wiring

Replace line 112:
```go
_ = absenceService // TODO: Wire to AbsenceHandler (separate ticket)
```

With:
```go
absenceHandler := handler.NewAbsenceHandler(absenceService, absenceTypeRepo)
```

And add to tenant-scoped routes (after line 197):
```go
handler.RegisterAbsenceRoutes(r, absenceHandler)
```

---

## 10. Dependencies and Imports

### Handler file will need:

```go
import (
    "encoding/json"
    "net/http"
    "time"

    "github.com/go-chi/chi/v5"
    "github.com/go-openapi/strfmt"
    "github.com/google/uuid"

    "github.com/tolga/terp/gen/models"
    "github.com/tolga/terp/internal/middleware"
    "github.com/tolga/terp/internal/model"
    "github.com/tolga/terp/internal/repository"
    "github.com/tolga/terp/internal/service"
)
```

### Test file will need:

```go
import (
    "bytes"
    "context"
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "testing"
    "time"

    "github.com/go-chi/chi/v5"
    "github.com/google/uuid"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"

    "github.com/tolga/terp/internal/handler"
    "github.com/tolga/terp/internal/middleware"
    "github.com/tolga/terp/internal/model"
    "github.com/tolga/terp/internal/repository"
    "github.com/tolga/terp/internal/service"
    "github.com/tolga/terp/internal/testutil"
)
```

---

## 11. File Paths Summary

| Purpose | Path |
|---------|------|
| Handler to create | `apps/api/internal/handler/absence.go` |
| Test to create | `apps/api/internal/handler/absence_test.go` |
| Routes to modify | `apps/api/internal/handler/routes.go` (add RegisterAbsenceRoutes) |
| Main to modify | `apps/api/cmd/server/main.go` (wire handler, register routes) |
| Absence Service | `apps/api/internal/service/absence.go` |
| Absence Day Model | `apps/api/internal/model/absenceday.go` |
| Absence Type Model | `apps/api/internal/model/absencetype.go` |
| AbsenceDay Repo | `apps/api/internal/repository/absenceday.go` |
| AbsenceType Repo | `apps/api/internal/repository/absencetype.go` |
| Generated Absence | `apps/api/gen/models/absence.go` |
| Generated AbsenceList | `apps/api/gen/models/absence_list.go` |
| Generated AbsenceType | `apps/api/gen/models/absence_type.go` |
| Generated AbsenceTypeList | `apps/api/gen/models/absence_type_list.go` |
| Generated CreateRequest | `apps/api/gen/models/create_absence_range_request.go` |
| Response helpers | `apps/api/internal/handler/response.go` |
| Test utilities | `apps/api/internal/testutil/db.go` |
| Middleware | `apps/api/internal/middleware/tenant.go` |
| OpenAPI employees paths | `api/paths/employees.yaml` (lines 393-453) |
| OpenAPI absences paths | `api/paths/absences.yaml` |
| OpenAPI absence-types paths | `api/paths/absence-types.yaml` |
