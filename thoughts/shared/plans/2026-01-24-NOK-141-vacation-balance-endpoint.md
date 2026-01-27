# Implementation Plan: NOK-141 - Vacation Balance Endpoint

**Date**: 2026-01-24
**Ticket**: NOK-141 (TICKET-084: Create Vacation Balance Endpoint)
**Type**: Handler | Effort: S

---

## Summary

Create a `VacationHandler` with a `GET /employees/{id}/vacation-balance` endpoint that retrieves vacation balance for an employee by year. The endpoint parses the employee UUID from the path, an optional year from query params (defaulting to current year), calls `VacationService.GetBalance`, and returns the response using the generated `models.VacationBalance` struct.

---

## Phase 1: Create VacationHandler

**File**: `apps/api/internal/handler/vacation.go` (NEW)

### 1.1 Handler Struct and Constructor

```go
package handler

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

// VacationHandler handles vacation-related HTTP requests.
type VacationHandler struct {
    vacationService *service.VacationService
}

// NewVacationHandler creates a new VacationHandler instance.
func NewVacationHandler(vacationService *service.VacationService) *VacationHandler {
    return &VacationHandler{
        vacationService: vacationService,
    }
}
```

### 1.2 GetBalance Method

Implements `GET /employees/{id}/vacation-balance`

Logic:
1. Extract tenant from context (required for auth)
2. Parse `id` path param as UUID
3. Parse optional `year` query param (default: `time.Now().Year()`)
4. Call `s.vacationService.GetBalance(ctx, employeeID, year)`
5. Handle errors:
   - `service.ErrInvalidYear` -> 400 Bad Request
   - `service.ErrVacationBalanceNotFound` -> 404 Not Found
   - other -> 500 Internal Server Error
6. Convert model to response using `balanceToResponse`
7. Return 200 with JSON response

```go
// GetBalance handles GET /employees/{id}/vacation-balance
func (h *VacationHandler) GetBalance(w http.ResponseWriter, r *http.Request) {
    tenantID, ok := middleware.TenantFromContext(r.Context())
    if !ok {
        respondError(w, http.StatusUnauthorized, "Tenant required")
        return
    }
    _ = tenantID // used for auth context

    // Parse employee ID from path
    employeeIDStr := chi.URLParam(r, "id")
    employeeID, err := uuid.Parse(employeeIDStr)
    if err != nil {
        respondError(w, http.StatusBadRequest, "Invalid employee ID")
        return
    }

    // Parse optional year query param (default: current year)
    year := time.Now().Year()
    if yearStr := r.URL.Query().Get("year"); yearStr != "" {
        parsedYear, err := strconv.Atoi(yearStr)
        if err != nil {
            respondError(w, http.StatusBadRequest, "Invalid year parameter")
            return
        }
        year = parsedYear
    }

    // Call service
    balance, err := h.vacationService.GetBalance(r.Context(), employeeID, year)
    if err != nil {
        switch err {
        case service.ErrInvalidYear:
            respondError(w, http.StatusBadRequest, "Invalid year")
        case service.ErrVacationBalanceNotFound:
            respondError(w, http.StatusNotFound, "Vacation balance not found")
        default:
            respondError(w, http.StatusInternalServerError, "Failed to get vacation balance")
        }
        return
    }

    respondJSON(w, http.StatusOK, h.balanceToResponse(balance))
}
```

### 1.3 Model Conversion Helper

Maps internal `model.VacationBalance` to generated `models.VacationBalance`:

- `Entitlement` -> `BaseEntitlement` (float64)
- `Carryover` -> `CarryoverFromPrevious` (float64)
- `Adjustments` -> `ManualAdjustment` (float64)
- `Taken` -> `UsedDays` (float64)
- `Total()` -> `TotalEntitlement` (float64)
- `Available()` -> `RemainingDays` (float64)
- `AdditionalEntitlement`, `PlannedDays` -> 0 (not tracked separately)
- `CarryoverExpiresAt`, `CarryoverToNext` -> nil (not tracked in current model)

```go
// balanceToResponse converts internal VacationBalance to API response model.
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

### Verification

- File compiles: `cd apps/api && go build ./internal/handler/`
- No import cycles

---

## Phase 2: Register Routes

### 2.1 Add Route Registration Function

**File**: `apps/api/internal/handler/routes.go` (MODIFY)

Add at the end of the file:

```go
// RegisterVacationRoutes registers vacation routes.
func RegisterVacationRoutes(r chi.Router, h *VacationHandler) {
    r.Get("/employees/{id}/vacation-balance", h.GetBalance)
}
```

This follows the pattern used by `RegisterAbsenceRoutes` which registers employee-nested routes directly on the router.

### Verification

- File compiles: `cd apps/api && go build ./internal/handler/`

---

## Phase 3: Wire in main.go

**File**: `apps/api/cmd/server/main.go` (MODIFY)

### 3.1 Replace the TODO placeholder

Change:
```go
vacationService := service.NewVacationService(vacationBalanceRepo, absenceDayRepo, absenceTypeRepo, employeeRepo, decimal.Zero)
_ = vacationService // TODO: Wire to VacationHandler (separate ticket)
```

To:
```go
vacationService := service.NewVacationService(vacationBalanceRepo, absenceDayRepo, absenceTypeRepo, employeeRepo, decimal.Zero)
vacationHandler := handler.NewVacationHandler(vacationService)
```

### 3.2 Register routes in tenant-scoped group

Add after `handler.RegisterAbsenceRoutes(r, absenceHandler)` (line 204):

```go
handler.RegisterVacationRoutes(r, vacationHandler)
```

### Verification

- Application compiles: `cd apps/api && go build ./cmd/server/`
- Application starts: `make dev` and check logs
- Endpoint responds: `curl -H "X-Tenant-ID: ..." http://localhost:8080/api/v1/employees/{id}/vacation-balance`

---

## Phase 4: Unit Tests

**File**: `apps/api/internal/handler/vacation_test.go` (NEW)

### 4.1 Test Context Struct and Setup

```go
package handler_test

type vacationTestContext struct {
    handler             *handler.VacationHandler
    vacationService     *service.VacationService
    vacationBalanceRepo *repository.VacationBalanceRepository
    tenant              *model.Tenant
    employee            *model.Employee
}

func setupVacationHandler(t *testing.T) *vacationTestContext {
    db := testutil.SetupTestDB(t)
    tenantRepo := repository.NewTenantRepository(db)
    employeeRepo := repository.NewEmployeeRepository(db)
    vacationBalanceRepo := repository.NewVacationBalanceRepository(db)
    absenceDayRepo := repository.NewAbsenceDayRepository(db)
    absenceTypeRepo := repository.NewAbsenceTypeRepository(db)

    ctx := context.Background()

    // Create test tenant
    tenant := &model.Tenant{
        Name:     "Test Tenant " + uuid.New().String()[:8],
        Slug:     "test-" + uuid.New().String()[:8],
        IsActive: true,
    }
    require.NoError(t, tenantRepo.Create(ctx, tenant))

    // Create test employee
    employee := &model.Employee{
        TenantID:        tenant.ID,
        FirstName:       "Test",
        LastName:        "Vacation",
        PersonnelNumber: "VAC-001",
        PIN:             "5678",
        EntryDate:       time.Now().AddDate(-1, 0, 0),
        IsActive:        true,
    }
    require.NoError(t, employeeRepo.Create(ctx, employee))

    // Create vacation service
    vacationService := service.NewVacationService(
        vacationBalanceRepo, absenceDayRepo, absenceTypeRepo, employeeRepo, decimal.Zero,
    )

    // Create handler
    h := handler.NewVacationHandler(vacationService)

    return &vacationTestContext{
        handler:             h,
        vacationService:     vacationService,
        vacationBalanceRepo: vacationBalanceRepo,
        tenant:              tenant,
        employee:            employee,
    }
}

func withVacationTenantContext(r *http.Request, tenant *model.Tenant) *http.Request {
    ctx := context.WithValue(r.Context(), middleware.TenantContextKey, tenant.ID)
    return r.WithContext(ctx)
}
```

### 4.2 Test Cases

#### Test 1: GetBalance_Success
- Setup: Create a VacationBalance record in DB for the employee and year 2026
- Request: `GET /employees/{id}/vacation-balance?year=2026` with valid tenant context and chi URL params
- Assert: 200 OK, response contains correct `employee_id`, `year`, `base_entitlement`, `total_entitlement`, `remaining_days`

#### Test 2: GetBalance_DefaultYear
- Setup: Create a VacationBalance record for the current year
- Request: `GET /employees/{id}/vacation-balance` (no year query param)
- Assert: 200 OK, response year matches current year

#### Test 3: GetBalance_InvalidEmployeeID
- Request: `GET /employees/invalid/vacation-balance` with id="invalid"
- Assert: 400 Bad Request

#### Test 4: GetBalance_InvalidYear
- Request: `GET /employees/{id}/vacation-balance?year=abc`
- Assert: 400 Bad Request

#### Test 5: GetBalance_NotFound
- Request: `GET /employees/{id}/vacation-balance?year=2020` (no balance exists for this year)
- Assert: 404 Not Found

#### Test 6: GetBalance_NoTenant
- Request: `GET /employees/{id}/vacation-balance` without tenant context
- Assert: 401 Unauthorized

### 4.3 Required Imports

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

### Verification

- Tests pass: `cd apps/api && go test -v -run TestVacationHandler ./internal/handler/...`
- All 6 tests pass

---

## Phase 5: Final Verification

### 5.1 Full Test Suite

```bash
cd apps/api && go test ./internal/handler/... -count=1
```

### 5.2 Lint

```bash
make lint
```

### 5.3 Build

```bash
cd apps/api && go build ./...
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `apps/api/internal/handler/vacation.go` | CREATE | VacationHandler struct, GetBalance method, balanceToResponse helper |
| `apps/api/internal/handler/routes.go` | MODIFY | Add RegisterVacationRoutes function |
| `apps/api/cmd/server/main.go` | MODIFY | Wire VacationHandler, register routes, remove TODO |
| `apps/api/internal/handler/vacation_test.go` | CREATE | 6 test cases for GetBalance endpoint |

## OpenAPI Spec

No changes needed. The endpoint is already defined in `api/paths/employees.yaml` (lines 455-480) and the `VacationBalance` schema already exists with generated Go model at `apps/api/gen/models/vacation_balance.go`.

---

## Notes

- The generated model has fields `AdditionalEntitlement`, `PlannedDays`, `CarryoverExpiresAt`, and `CarryoverToNext` that are not tracked in the internal model. These will be zero-valued/nil in the response, which is correct since they are `omitempty`.
- The endpoint requires tenant context (auth middleware) but does not use the tenant ID for the query itself -- the service queries by employee ID directly.
- The service performs year validation (1900-2200 range) and returns `ErrInvalidYear` for out-of-range values.
