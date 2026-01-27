# Research: NOK-141 - Vacation Balance Endpoint

**Date**: 2026-01-24
**Ticket**: NOK-141 (TICKET-084: Create Vacation Balance Endpoint)
**Type**: Handler | Effort: S

---

## 1. OpenAPI Spec for the Endpoint

The endpoint is defined in `/home/tolga/projects/terp/api/paths/employees.yaml` (lines 455-480):

```yaml
/employees/{id}/vacation-balance:
  get:
    tags:
      - Employees
      - Vacation
    summary: Get employee vacation balance
    operationId: getEmployeeVacationBalance
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
      - name: year
        in: query
        type: integer
        description: Year (defaults to current year)
    responses:
      200:
        description: Vacation balance
        schema:
          $ref: '../schemas/vacation-balances.yaml#/VacationBalance'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
```

**Key points**:
- Path: `GET /employees/{id}/vacation-balance`
- Path param: `id` (uuid, required)
- Query param: `year` (integer, optional, defaults to current year)
- Response: Single `VacationBalance` object (not a list)
- Error responses: 401 (Unauthorized), 404 (NotFound)

---

## 2. Generated Response Model

File: `/home/tolga/projects/terp/apps/api/gen/models/vacation_balance.go`

```go
type VacationBalance struct {
    AdditionalEntitlement float64         `json:"additional_entitlement,omitempty"`
    BaseEntitlement       float64         `json:"base_entitlement,omitempty"`
    CarryoverExpiresAt    *strfmt.Date    `json:"carryover_expires_at,omitempty"`
    CarryoverFromPrevious float64         `json:"carryover_from_previous,omitempty"`
    CarryoverToNext       *float64        `json:"carryover_to_next,omitempty"`
    CreatedAt             strfmt.DateTime `json:"created_at,omitempty"`
    Employee              struct {
        EmployeeSummary
    } `json:"employee,omitempty"`
    EmployeeID       *strfmt.UUID    `json:"employee_id"`      // Required
    ID               *strfmt.UUID    `json:"id"`               // Required
    ManualAdjustment float64         `json:"manual_adjustment,omitempty"`
    PlannedDays      float64         `json:"planned_days,omitempty"`
    RemainingDays    float64         `json:"remaining_days,omitempty"`
    TenantID         *strfmt.UUID    `json:"tenant_id"`        // Required
    TotalEntitlement float64         `json:"total_entitlement,omitempty"`
    UpdatedAt        strfmt.DateTime `json:"updated_at,omitempty"`
    UsedDays         float64         `json:"used_days,omitempty"`
    Year             *int64          `json:"year"`             // Required
}
```

---

## 3. Internal VacationBalance Model

File: `/home/tolga/projects/terp/apps/api/internal/model/vacationbalance.go`

```go
type VacationBalance struct {
    ID         uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID   uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
    EmployeeID uuid.UUID       `gorm:"type:uuid;not null;index" json:"employee_id"`
    Year       int             `gorm:"type:int;not null" json:"year"`
    Entitlement decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"entitlement"`
    Carryover   decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"carryover"`
    Adjustments decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"adjustments"`
    Taken       decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"taken"`
    CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`
    Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}

func (vb *VacationBalance) Total() decimal.Decimal {
    return vb.Entitlement.Add(vb.Carryover).Add(vb.Adjustments)
}

func (vb *VacationBalance) Available() decimal.Decimal {
    return vb.Total().Sub(vb.Taken)
}
```

**Field mapping (internal -> generated)**:
- `Entitlement` -> `BaseEntitlement` (float64)
- `Carryover` -> `CarryoverFromPrevious` (float64)
- `Adjustments` -> `ManualAdjustment` (float64)
- `Taken` -> `UsedDays` (float64)
- `Total()` -> `TotalEntitlement` (float64)
- `Available()` -> `RemainingDays` (float64)
- `AdditionalEntitlement` -> 0 (not tracked separately in model)
- `PlannedDays` -> 0 (not tracked in current model)

---

## 4. VacationService.GetBalance Method

File: `/home/tolga/projects/terp/apps/api/internal/service/vacation.go`

```go
// VacationService handles vacation balance business logic.
type VacationService struct {
    vacationBalanceRepo vacationBalanceRepoForVacation
    absenceDayRepo      absenceDayRepoForVacation
    absenceTypeRepo     absenceTypeRepoForVacation
    employeeRepo        employeeRepoForVacation
    defaultMaxCarryover decimal.Decimal
}

func NewVacationService(
    vacationBalanceRepo vacationBalanceRepoForVacation,
    absenceDayRepo absenceDayRepoForVacation,
    absenceTypeRepo absenceTypeRepoForVacation,
    employeeRepo employeeRepoForVacation,
    defaultMaxCarryover decimal.Decimal,
) *VacationService

// GetBalance retrieves the vacation balance for an employee and year.
// Returns ErrVacationBalanceNotFound if no balance has been initialized.
func (s *VacationService) GetBalance(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error) {
    if year < 1900 || year > 2200 {
        return nil, ErrInvalidYear
    }
    balance, err := s.vacationBalanceRepo.GetByEmployeeYear(ctx, employeeID, year)
    if err != nil {
        return nil, err
    }
    if balance == nil {
        return nil, ErrVacationBalanceNotFound
    }
    return balance, nil
}
```

**Service errors**:
```go
var (
    ErrVacationBalanceNotFound = errors.New("vacation balance not found")
    ErrInvalidYear             = errors.New("invalid year")
)
```

---

## 5. Handler Structure Pattern

File: `/home/tolga/projects/terp/apps/api/internal/handler/absence.go`

Handlers follow this pattern:

```go
package handler

// Handler struct with service dependency
type AbsenceHandler struct {
    absenceService *service.AbsenceService
}

// Constructor
func NewAbsenceHandler(absenceService *service.AbsenceService) *AbsenceHandler {
    return &AbsenceHandler{
        absenceService: absenceService,
    }
}
```

**Typical handler method pattern** (from ListByEmployee):
1. Extract tenant from context: `tenantID, ok := middleware.TenantFromContext(r.Context())`
2. Parse path params: `chi.URLParam(r, "id")` -> `uuid.Parse()`
3. Parse query params: `r.URL.Query().Get("year")` -> `strconv.Atoi()`
4. Call service method
5. Handle errors with switch statements
6. Convert internal model to generated response model
7. Call `respondJSON(w, status, response)`

**Response helpers** (from `/home/tolga/projects/terp/apps/api/internal/handler/response.go`):
```go
func respondJSON(w http.ResponseWriter, status int, data any)
func respondError(w http.ResponseWriter, status int, message string)
```

---

## 6. Query Parameter Parsing Pattern

From booking handler (`/home/tolga/projects/terp/apps/api/internal/handler/booking.go`):

```go
// Integer query param with strconv
if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
    if limit, err := strconv.Atoi(limitStr); err == nil && limit > 0 && limit <= 100 {
        filter.Limit = limit
    }
}
```

From absence handler for date query params:
```go
fromStr := r.URL.Query().Get("from")
if fromStr != "" {
    from, parseErr := time.Parse("2006-01-02", fromStr)
    if parseErr != nil {
        respondError(w, http.StatusBadRequest, "Invalid from date format, expected YYYY-MM-DD")
        return
    }
}
```

---

## 7. Route Registration Pattern

File: `/home/tolga/projects/terp/apps/api/internal/handler/routes.go`

Absence routes example (nested under employees):
```go
func RegisterAbsenceRoutes(r chi.Router, h *AbsenceHandler) {
    r.Get("/absence-types", h.ListTypes)
    r.Get("/employees/{id}/absences", h.ListByEmployee)
    r.Post("/employees/{id}/absences", h.CreateRange)
    r.Delete("/absences/{id}", h.Delete)
}
```

Booking routes with nested employee routes:
```go
func RegisterBookingRoutes(r chi.Router, h *BookingHandler) {
    r.Route("/bookings", func(r chi.Router) { ... })
    r.Route("/employees/{id}/day/{date}", func(r chi.Router) {
        r.Get("/", h.GetDayView)
        r.Post("/calculate", h.Calculate)
    })
}
```

**The vacation balance endpoint should be registered as:**
```go
r.Get("/employees/{id}/vacation-balance", h.GetBalance)
```

---

## 8. main.go Wiring (Current State)

File: `/home/tolga/projects/terp/apps/api/cmd/server/main.go`

The VacationService is already created but not wired to a handler:

```go
// Initialize VacationService
vacationBalanceRepo := repository.NewVacationBalanceRepository(db)
vacationService := service.NewVacationService(vacationBalanceRepo, absenceDayRepo, absenceTypeRepo, employeeRepo, decimal.Zero)
_ = vacationService // TODO: Wire to VacationHandler (separate ticket)
```

The new handler needs to:
1. Remove the `_ = vacationService` line
2. Create `vacationHandler := handler.NewVacationHandler(vacationService)`
3. Register routes: `handler.RegisterVacationRoutes(r, vacationHandler)` in the tenant-scoped group

---

## 9. Test Structure Pattern

File: `/home/tolga/projects/terp/apps/api/internal/handler/absence_test.go`

```go
package handler_test

// Test context struct
type absenceTestContext struct {
    handler        *handler.AbsenceHandler
    service        *service.AbsenceService
    absenceDayRepo *repository.AbsenceDayRepository
    tenant         *model.Tenant
    employee       *model.Employee
    absenceType    *model.AbsenceType
}

// Setup function
func setupAbsenceHandler(t *testing.T) *absenceTestContext {
    db := testutil.SetupTestDB(t)
    // Create repos, tenants, employees, services, handler
    return &absenceTestContext{...}
}

// Tenant context helper
func withAbsenceTenantContext(r *http.Request, tenant *model.Tenant) *http.Request {
    ctx := context.WithValue(r.Context(), middleware.TenantContextKey, tenant.ID)
    return r.WithContext(ctx)
}

// Test with chi URL params
func TestAbsenceHandler_ListByEmployee_Success(t *testing.T) {
    tc := setupAbsenceHandler(t)
    req := httptest.NewRequest("GET", "/employees/"+tc.employee.ID.String()+"/absences", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", tc.employee.ID.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    req = withAbsenceTenantContext(req, tc.tenant)
    rr := httptest.NewRecorder()

    tc.handler.ListByEmployee(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result map[string]interface{}
    err := json.Unmarshal(rr.Body.Bytes(), &result)
    require.NoError(t, err)
}
```

**Test DB setup** (`/home/tolga/projects/terp/apps/api/internal/testutil/db.go`):
- Uses shared DB connection with transaction-per-test isolation
- Default URL: `postgres://dev:dev@localhost:5432/terp?sslmode=disable`
- Transactions are rolled back in Cleanup

**Key test imports:**
```go
import (
    "context"
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "testing"
    "time"

    "github.com/go-chi/chi/v5"
    "github.com/google/uuid"
    "github.com/shopspring/decimal"
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

## 10. Required Test Cases (Based on Patterns)

From the existing test patterns, the following tests should be created:

1. `TestVacationHandler_GetBalance_Success` - Valid employee ID, valid year
2. `TestVacationHandler_GetBalance_DefaultYear` - No year param, defaults to current
3. `TestVacationHandler_GetBalance_InvalidEmployeeID` - Non-UUID employee ID
4. `TestVacationHandler_GetBalance_InvalidYear` - Non-integer year param
5. `TestVacationHandler_GetBalance_NotFound` - No balance for employee/year
6. `TestVacationHandler_GetBalance_NoTenant` - Missing tenant context

---

## 11. Key Imports for Handler

```go
import (
    "net/http"
    "strconv"
    "time"

    "github.com/go-chi/chi/v5"
    "github.com/go-openapi/strfmt"
    "github.com/google/uuid"

    "github.com/tolga/terp/gen/models"
    "github.com/tolga/terp/internal/middleware"
    "github.com/tolga/terp/internal/model"
    "github.com/tolga/terp/internal/service"
)
```

---

## 12. Model Conversion Pattern

Based on absence handler's `absenceDayToResponse` pattern:

```go
func (h *VacationHandler) balanceToResponse(vb *model.VacationBalance) *models.VacationBalance {
    id := strfmt.UUID(vb.ID.String())
    tenantID := strfmt.UUID(vb.TenantID.String())
    employeeID := strfmt.UUID(vb.EmployeeID.String())
    year := int64(vb.Year)

    return &models.VacationBalance{
        ID:                    &id,
        TenantID:              &tenantID,
        EmployeeID:            &employeeID,
        Year:                  &year,
        BaseEntitlement:       vb.Entitlement.InexactFloat64(),
        CarryoverFromPrevious: vb.Carryover.InexactFloat64(),
        ManualAdjustment:      vb.Adjustments.InexactFloat64(),
        UsedDays:              vb.Taken.InexactFloat64(),
        TotalEntitlement:      vb.Total().InexactFloat64(),
        RemainingDays:         vb.Available().InexactFloat64(),
        CreatedAt:             strfmt.DateTime(vb.CreatedAt),
        UpdatedAt:             strfmt.DateTime(vb.UpdatedAt),
    }
}
```

---

## 13. Vacation Balance Repository Methods Available

File: `/home/tolga/projects/terp/apps/api/internal/repository/vacationbalance.go`

```go
func (r *VacationBalanceRepository) GetByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error)
func (r *VacationBalanceRepository) Upsert(ctx context.Context, balance *model.VacationBalance) error
func (r *VacationBalanceRepository) UpdateTaken(ctx context.Context, employeeID uuid.UUID, year int, taken decimal.Decimal) error
func (r *VacationBalanceRepository) ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.VacationBalance, error)
```

---

## Summary

The handler implementation requires:
1. **New file**: `apps/api/internal/handler/vacation.go` - VacationHandler struct + GetBalance method + balanceToResponse converter + RegisterVacationRoutes function
2. **New file**: `apps/api/internal/handler/vacation_test.go` - Tests following the absence_test.go pattern
3. **Modified file**: `apps/api/cmd/server/main.go` - Wire vacationService to VacationHandler and register routes
