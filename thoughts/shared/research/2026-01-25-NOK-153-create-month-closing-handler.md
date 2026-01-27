# Research: NOK-153 - Create Month Closing Handler

**Date**: 2026-01-25
**Ticket**: NOK-153 (TICKET-090)
**Type**: Handler
**Effort**: S
**Sprint**: 22 - Monthly Evaluation

## 1. Objective

Create HTTP endpoints for month closing operations and monthly summaries at:
- `GET /api/v1/employees/{id}/months/{year}/{month}` - Get month summary
- `GET /api/v1/employees/{id}/months/{year}` - Get year overview
- `POST /api/v1/employees/{id}/months/{year}/{month}/close` - Close month
- `POST /api/v1/employees/{id}/months/{year}/{month}/reopen` - Reopen month
- `POST /api/v1/employees/{id}/months/{year}/{month}/recalculate` - Trigger recalculation

## 2. Dependencies

### 2.1 Monthly Evaluation Service (TICKET-087)

The MonthlyEvalService is already implemented at:
- `/home/tolga/projects/terp/apps/api/internal/service/monthlyeval.go`

Key service methods available:
```go
type MonthlyEvalService struct {
    // ...
}

func (s *MonthlyEvalService) GetMonthSummary(ctx context.Context, employeeID uuid.UUID, year, month int) (*MonthSummary, error)
func (s *MonthlyEvalService) RecalculateMonth(ctx context.Context, employeeID uuid.UUID, year, month int) error
func (s *MonthlyEvalService) CloseMonth(ctx context.Context, employeeID uuid.UUID, year, month int, closedBy uuid.UUID) error
func (s *MonthlyEvalService) ReopenMonth(ctx context.Context, employeeID uuid.UUID, year, month int, reopenedBy uuid.UUID) error
func (s *MonthlyEvalService) GetYearOverview(ctx context.Context, employeeID uuid.UUID, year int) ([]MonthSummary, error)
```

### 2.2 Service MonthSummary Type

```go
// From /home/tolga/projects/terp/apps/api/internal/service/monthlyeval.go
type MonthSummary struct {
    EmployeeID uuid.UUID
    Year       int
    Month      int

    // Time totals (minutes)
    TotalGrossTime  int
    TotalNetTime    int
    TotalTargetTime int
    TotalOvertime   int
    TotalUndertime  int
    TotalBreakTime  int

    // Flextime tracking (minutes)
    FlextimeStart     int
    FlextimeChange    int
    FlextimeEnd       int
    FlextimeCarryover int

    // Absence summary
    VacationTaken    decimal.Decimal
    SickDays         int
    OtherAbsenceDays int

    // Work summary
    WorkDays       int
    DaysWithErrors int

    // Status
    IsClosed   bool
    ClosedAt   *time.Time
    ClosedBy   *uuid.UUID
    ReopenedAt *time.Time
    ReopenedBy *uuid.UUID

    // Warnings from calculation
    Warnings []string
}
```

### 2.3 Service Errors

```go
// From /home/tolga/projects/terp/apps/api/internal/service/monthlyeval.go
var (
    ErrMonthNotClosed          = errors.New("month is not closed")
    ErrInvalidMonth            = errors.New("invalid month")
    ErrInvalidYearMonth        = errors.New("invalid year or month")
    ErrMonthlyValueNotFound    = errors.New("monthly value not found")
    ErrEmployeeNotFoundForEval = errors.New("employee not found")
)

// From /home/tolga/projects/terp/apps/api/internal/service/booking.go (shared)
var ErrMonthClosed = errors.New("month is closed")
```

## 3. Existing Handler Patterns

### 3.1 Handler Structure Pattern

All handlers follow this pattern (from `/home/tolga/projects/terp/apps/api/internal/handler/`):

```go
// Handler struct with service dependency
type XxxHandler struct {
    xxxService *service.XxxService
}

// Constructor
func NewXxxHandler(xxxService *service.XxxService) *XxxHandler {
    return &XxxHandler{xxxService: xxxService}
}
```

### 3.2 Request Parsing Patterns

#### Path Parameters (chi router)
```go
// From employee.go, vacation.go, booking.go
idStr := chi.URLParam(r, "id")
id, err := uuid.Parse(idStr)
if err != nil {
    respondError(w, http.StatusBadRequest, "Invalid employee ID")
    return
}

// Date from path
dateStr := chi.URLParam(r, "date")
date, err := time.Parse("2006-01-02", dateStr)
```

#### Query Parameters
```go
// From vacation.go - optional year parameter
year := time.Now().Year()
if yearStr := r.URL.Query().Get("year"); yearStr != "" {
    parsedYear, err := strconv.Atoi(yearStr)
    if err != nil {
        respondError(w, http.StatusBadRequest, "Invalid year parameter")
        return
    }
    year = parsedYear
}
```

#### Tenant Context
```go
// All handlers requiring tenant context
tenantID, ok := middleware.TenantFromContext(r.Context())
if !ok {
    respondError(w, http.StatusUnauthorized, "Tenant required")
    return
}
```

#### User Context (for closedBy/reopenedBy)
```go
// From /home/tolga/projects/terp/apps/api/internal/auth/context.go
user, ok := auth.UserFromContext(r.Context())
if !ok {
    respondError(w, http.StatusUnauthorized, "User required")
    return
}
userID := user.ID
```

### 3.3 Response Patterns

```go
// Success with data
respondJSON(w, http.StatusOK, response)

// Created
respondJSON(w, http.StatusCreated, response)

// No content (DELETE operations)
w.WriteHeader(http.StatusNoContent)

// Error responses
respondError(w, http.StatusBadRequest, "Invalid request")
respondError(w, http.StatusNotFound, "Resource not found")
respondError(w, http.StatusForbidden, "Month is closed")
respondError(w, http.StatusInternalServerError, "Failed to process")
```

### 3.4 Error Mapping Pattern

```go
// From booking.go
switch err {
case service.ErrMonthClosed:
    respondError(w, http.StatusForbidden, "Month is closed")
case service.ErrInvalidBookingTime:
    respondError(w, http.StatusBadRequest, "Invalid booking time")
default:
    respondError(w, http.StatusInternalServerError, "Failed to create booking")
}
```

## 4. Route Registration Pattern

### 4.1 routes.go Structure

From `/home/tolga/projects/terp/apps/api/internal/handler/routes.go`:

```go
// Example: Nested employee routes (similar pattern needed)
func RegisterBookingRoutes(r chi.Router, h *BookingHandler) {
    // ... booking routes ...

    // Day view routes (nested under employees)
    r.Route("/employees/{id}/day/{date}", func(r chi.Router) {
        r.Get("/", h.GetDayView)
        r.Post("/calculate", h.Calculate)
    })
}

// Example: VacationRoutes
func RegisterVacationRoutes(r chi.Router, h *VacationHandler) {
    r.Get("/employees/{id}/vacation-balance", h.GetBalance)
}
```

### 4.2 main.go Integration

From `/home/tolga/projects/terp/apps/api/cmd/server/main.go`:

```go
// Service initialization
monthlyValueRepo := repository.NewMonthlyValueRepository(db)
monthlyEvalService := service.NewMonthlyEvalService(monthlyValueRepo, dailyValueRepo, absenceDayRepo, employeeRepo)
_ = monthlyEvalService // TODO: Wire to MonthlyEvalHandler (separate ticket)

// Route registration pattern (tenant-scoped routes)
r.Group(func(r chi.Router) {
    r.Use(tenantMiddleware.RequireTenant)
    // ... other routes ...
    handler.RegisterVacationRoutes(r, vacationHandler)
})
```

## 5. OpenAPI Spec Patterns

### 5.1 Existing Monthly-Related Specs

The project already has monthly-related OpenAPI specs:
- `/home/tolga/projects/terp/api/paths/monthly-values.yaml` - CRUD + close/reopen
- `/home/tolga/projects/terp/api/paths/monthly-evaluations.yaml` - Evaluation templates

**Note**: The existing spec uses `/monthly-values/{id}/close` pattern (by ID). The ticket requires `/employees/{id}/months/{year}/{month}/close` pattern (by employee + year + month).

### 5.2 Schema Comparison

Generated model at `/home/tolga/projects/terp/apps/api/gen/models/monthly_value.go`:
```go
type MonthlyValue struct {
    ID               *strfmt.UUID    `json:"id"`
    TenantID         *strfmt.UUID    `json:"tenant_id"`
    EmployeeID       *strfmt.UUID    `json:"employee_id"`
    Year             *int64          `json:"year"`
    Month            *int64          `json:"month"`
    Status           string          `json:"status,omitempty"` // open, calculated, closed, exported
    TargetMinutes    int64           `json:"target_minutes,omitempty"`
    GrossMinutes     int64           `json:"gross_minutes,omitempty"`
    BreakMinutes     int64           `json:"break_minutes,omitempty"`
    NetMinutes       int64           `json:"net_minutes,omitempty"`
    OvertimeMinutes  int64           `json:"overtime_minutes,omitempty"`
    UndertimeMinutes int64           `json:"undertime_minutes,omitempty"`
    BalanceMinutes   int64           `json:"balance_minutes,omitempty"`
    WorkingDays      int64           `json:"working_days,omitempty"`
    WorkedDays       int64           `json:"worked_days,omitempty"`
    AbsenceDays      float64         `json:"absence_days,omitempty"`
    HolidayDays      int64           `json:"holiday_days,omitempty"`
    ClosedAt         *strfmt.DateTime `json:"closed_at,omitempty"`
    ClosedBy         *strfmt.UUID    `json:"closed_by,omitempty"`
    // ...
}
```

### 5.3 Ticket Response Format

The ticket specifies:
```json
{
  "year": 2024,
  "month": 6,
  "total_gross_time": 9600,
  "total_net_time": 9000,
  "total_target_time": 8800,
  "flextime_start": 100,
  "flextime_change": 200,
  "flextime_end": 300,
  "vacation_taken": 2.5,
  "sick_days": 1,
  "work_days": 20,
  "is_closed": false
}
```

## 6. Test Patterns

### 6.1 Handler Test Setup Pattern

From `/home/tolga/projects/terp/apps/api/internal/handler/vacation_test.go`:

```go
type vacationTestContext struct {
    handler             *handler.VacationHandler
    vacationService     *service.VacationService
    vacationBalanceRepo *repository.VacationBalanceRepository
    tenant              *model.Tenant
    employee            *model.Employee
}

func setupVacationHandler(t *testing.T) *vacationTestContext {
    db := testutil.SetupTestDB(t)
    // Create repos, services, handler
    // Create test tenant and employee
    return &vacationTestContext{...}
}

func withVacationTenantContext(r *http.Request, tenant *model.Tenant) *http.Request {
    ctx := context.WithValue(r.Context(), middleware.TenantContextKey, tenant.ID)
    return r.WithContext(ctx)
}
```

### 6.2 Test Request Pattern

```go
req := httptest.NewRequest("GET", fmt.Sprintf("/employees/%s/vacation-balance?year=2026", tc.employee.ID.String()), nil)
rctx := chi.NewRouteContext()
rctx.URLParams.Add("id", tc.employee.ID.String())
req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
req = withVacationTenantContext(req, tc.tenant)
rr := httptest.NewRecorder()

tc.handler.GetBalance(rr, req)

assert.Equal(t, http.StatusOK, rr.Code)

var result map[string]interface{}
err := json.Unmarshal(rr.Body.Bytes(), &result)
require.NoError(t, err)
```

### 6.3 Service Mock Pattern

From `/home/tolga/projects/terp/apps/api/internal/service/monthlyeval_test.go`:

```go
type mockMonthlyValueRepoForMonthlyEval struct {
    mock.Mock
}

func (m *mockMonthlyValueRepoForMonthlyEval) GetByEmployeeMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error) {
    args := m.Called(ctx, employeeID, year, month)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.MonthlyValue), args.Error(1)
}
```

## 7. Implementation Checklist

### 7.1 Files to Create

1. `apps/api/internal/handler/monthlyeval.go`
2. `apps/api/internal/handler/monthlyeval_test.go`

### 7.2 Handler Methods Needed

| Method           | HTTP   | Path                                              | Service Method      |
|-----------------|--------|---------------------------------------------------|---------------------|
| GetMonthSummary | GET    | /employees/{id}/months/{year}/{month}             | GetMonthSummary     |
| GetYearOverview | GET    | /employees/{id}/months/{year}                     | GetYearOverview     |
| CloseMonth      | POST   | /employees/{id}/months/{year}/{month}/close       | CloseMonth          |
| ReopenMonth     | POST   | /employees/{id}/months/{year}/{month}/reopen      | ReopenMonth         |
| Recalculate     | POST   | /employees/{id}/months/{year}/{month}/recalculate | RecalculateMonth    |

### 7.3 Route Registration

Add to `routes.go`:
```go
func RegisterMonthlyEvalRoutes(r chi.Router, h *MonthlyEvalHandler) {
    r.Route("/employees/{id}/months", func(r chi.Router) {
        r.Get("/{year}", h.GetYearOverview)
        r.Route("/{year}/{month}", func(r chi.Router) {
            r.Get("/", h.GetMonthSummary)
            r.Post("/close", h.CloseMonth)
            r.Post("/reopen", h.ReopenMonth)
            r.Post("/recalculate", h.Recalculate)
        })
    })
}
```

### 7.4 main.go Updates

```go
// Already initialized (line 121-123):
monthlyEvalService := service.NewMonthlyEvalService(monthlyValueRepo, dailyValueRepo, absenceDayRepo, employeeRepo)

// Add handler initialization:
monthlyEvalHandler := handler.NewMonthlyEvalHandler(monthlyEvalService)

// Add route registration (in tenant-scoped group):
handler.RegisterMonthlyEvalRoutes(r, monthlyEvalHandler)
```

## 8. Response Mapping

### 8.1 MonthSummary to Response

Map service.MonthSummary to API response:

```go
func (h *MonthlyEvalHandler) summaryToResponse(s *service.MonthSummary) map[string]interface{} {
    return map[string]interface{}{
        "year":              s.Year,
        "month":             s.Month,
        "total_gross_time":  s.TotalGrossTime,
        "total_net_time":    s.TotalNetTime,
        "total_target_time": s.TotalTargetTime,
        "flextime_start":    s.FlextimeStart,
        "flextime_change":   s.FlextimeChange,
        "flextime_end":      s.FlextimeEnd,
        "vacation_taken":    s.VacationTaken.InexactFloat64(),
        "sick_days":         s.SickDays,
        "work_days":         s.WorkDays,
        "is_closed":         s.IsClosed,
        "closed_at":         s.ClosedAt,
        "closed_by":         s.ClosedBy,
        "reopened_at":       s.ReopenedAt,
        "reopened_by":       s.ReopenedBy,
        "days_with_errors":  s.DaysWithErrors,
    }
}
```

### 8.2 Year Overview Response

```go
// Array of MonthSummary responses
response := make([]map[string]interface{}, 0, len(summaries))
for _, s := range summaries {
    response = append(response, h.summaryToResponse(&s))
}
```

## 9. Error Mapping

| Service Error               | HTTP Status | Message                      |
|---------------------------|-------------|------------------------------|
| ErrMonthClosed            | 403         | "Month is closed"            |
| ErrMonthNotClosed         | 400         | "Month is not closed"        |
| ErrInvalidMonth           | 400         | "Invalid month"              |
| ErrInvalidYearMonth       | 400         | "Invalid year or month"      |
| ErrMonthlyValueNotFound   | 404         | "Monthly value not found"    |
| ErrEmployeeNotFoundForEval| 404         | "Employee not found"         |
| default                   | 500         | "Failed to <operation>"      |

## 10. OpenAPI Spec Consideration

The ticket specifies endpoints at `/employees/{id}/months/...` but the existing OpenAPI spec at `/api/paths/monthly-values.yaml` uses `/monthly-values/{id}/...`.

**Decision needed**: Either:
1. Add new paths to employees.yaml for the employee-centric endpoints
2. Use the existing monthly-values endpoints

The ticket explicitly requires the employee-centric pattern, so new path definitions may be needed in:
- `/home/tolga/projects/terp/api/paths/employees.yaml` (add monthly endpoints)

Or create a new file:
- `/home/tolga/projects/terp/api/paths/employee-months.yaml`

## 11. Summary

The handler implementation is straightforward given:
- MonthlyEvalService is fully implemented with all required methods
- Handler patterns are well-established in the codebase
- Test patterns with mocks are available
- main.go already has the service initialized (just needs handler wiring)

The main implementation tasks are:
1. Create MonthlyEvalHandler with 5 methods
2. Add response mapping from service.MonthSummary
3. Add error mapping for all service errors
4. Create route registration function
5. Wire handler in main.go
6. Write unit tests with mocked service
7. (Optional) Update OpenAPI spec for new employee-centric endpoints
