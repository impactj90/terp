# Implementation Plan: NOK-153 - Create Month Closing Handler

**Ticket**: NOK-153 / TICKET-090
**Date**: 2026-01-25
**Status**: Ready for implementation

## Summary

Create the MonthlyEval HTTP handler with endpoints for month summaries, year overview, closing/reopening months, and triggering recalculation. This handler integrates with the existing `MonthlyEvalService` to provide monthly evaluation management via REST API.

## Files to Create
- `apps/api/internal/handler/monthlyeval.go`
- `apps/api/internal/handler/monthlyeval_test.go`

## Files to Modify
- `apps/api/internal/handler/routes.go` (add `RegisterMonthlyEvalRoutes`)
- `apps/api/cmd/server/main.go` (wire handler, register routes)

## Current State Analysis

**Service ready**:
- `MonthlyEvalService` at `service/monthlyeval.go:90-403` - GetMonthSummary, GetYearOverview, RecalculateMonth, CloseMonth, ReopenMonth

**Service methods available**:
```go
func (s *MonthlyEvalService) GetMonthSummary(ctx context.Context, employeeID uuid.UUID, year, month int) (*MonthSummary, error)
func (s *MonthlyEvalService) GetYearOverview(ctx context.Context, employeeID uuid.UUID, year int) ([]MonthSummary, error)
func (s *MonthlyEvalService) RecalculateMonth(ctx context.Context, employeeID uuid.UUID, year, month int) error
func (s *MonthlyEvalService) CloseMonth(ctx context.Context, employeeID uuid.UUID, year, month int, closedBy uuid.UUID) error
func (s *MonthlyEvalService) ReopenMonth(ctx context.Context, employeeID uuid.UUID, year, month int, reopenedBy uuid.UUID) error
```

**Service errors to handle**:
```go
var (
    ErrMonthClosed             = errors.New("month is closed")          // shared with booking.go
    ErrMonthNotClosed          = errors.New("month is not closed")
    ErrInvalidMonth            = errors.New("invalid month")
    ErrInvalidYearMonth        = errors.New("invalid year or month")
    ErrMonthlyValueNotFound    = errors.New("monthly value not found")
    ErrEmployeeNotFoundForEval = errors.New("employee not found")
)
```

**Generated models available**:
- `models.MonthlyValue` - Full monthly value with all fields
- `models.MonthlyValueList` - List wrapper for monthly values

**main.go status**:
- Line 122-123: `monthlyEvalService` initialized but not wired to handler (has `// TODO` comment)

## Endpoints to Implement

| Method          | HTTP   | Path                                              | Service Method      |
|-----------------|--------|---------------------------------------------------|---------------------|
| GetMonthSummary | GET    | /employees/{id}/months/{year}/{month}             | GetMonthSummary     |
| GetYearOverview | GET    | /employees/{id}/months/{year}                     | GetYearOverview     |
| CloseMonth      | POST   | /employees/{id}/months/{year}/{month}/close       | CloseMonth          |
| ReopenMonth     | POST   | /employees/{id}/months/{year}/{month}/reopen      | ReopenMonth         |
| Recalculate     | POST   | /employees/{id}/months/{year}/{month}/recalculate | RecalculateMonth    |

## Error Mapping

| Service Error               | HTTP Status | Message                      |
|---------------------------|-------------|------------------------------|
| ErrMonthClosed            | 403         | "Month is closed"            |
| ErrMonthNotClosed         | 400         | "Month is not closed"        |
| ErrInvalidMonth           | 400         | "Invalid month"              |
| ErrInvalidYearMonth       | 400         | "Invalid year or month"      |
| ErrMonthlyValueNotFound   | 404         | "Monthly value not found"    |
| ErrEmployeeNotFoundForEval| 404         | "Employee not found"         |
| default                   | 500         | "Failed to <operation>"      |

---

## Phase 1: Create Handler Implementation

### File: `apps/api/internal/handler/monthlyeval.go`

```go
package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/service"
)

// MonthlyEvalHandler handles monthly evaluation HTTP requests.
type MonthlyEvalHandler struct {
	monthlyEvalService *service.MonthlyEvalService
}

// NewMonthlyEvalHandler creates a new MonthlyEvalHandler instance.
func NewMonthlyEvalHandler(monthlyEvalService *service.MonthlyEvalService) *MonthlyEvalHandler {
	return &MonthlyEvalHandler{
		monthlyEvalService: monthlyEvalService,
	}
}

// GetMonthSummary handles GET /employees/{id}/months/{year}/{month}
func (h *MonthlyEvalHandler) GetMonthSummary(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}
	_ = tenantID // used for auth context

	// Parse employee ID
	employeeIDStr := chi.URLParam(r, "id")
	employeeID, err := uuid.Parse(employeeIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	// Parse year
	yearStr := chi.URLParam(r, "year")
	year, err := strconv.Atoi(yearStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid year")
		return
	}

	// Parse month
	monthStr := chi.URLParam(r, "month")
	month, err := strconv.Atoi(monthStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid month")
		return
	}

	summary, err := h.monthlyEvalService.GetMonthSummary(r.Context(), employeeID, year, month)
	if err != nil {
		h.handleServiceError(w, err, "get month summary")
		return
	}

	respondJSON(w, http.StatusOK, h.summaryToResponse(summary))
}

// GetYearOverview handles GET /employees/{id}/months/{year}
func (h *MonthlyEvalHandler) GetYearOverview(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}
	_ = tenantID // used for auth context

	// Parse employee ID
	employeeIDStr := chi.URLParam(r, "id")
	employeeID, err := uuid.Parse(employeeIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	// Parse year
	yearStr := chi.URLParam(r, "year")
	year, err := strconv.Atoi(yearStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid year")
		return
	}

	summaries, err := h.monthlyEvalService.GetYearOverview(r.Context(), employeeID, year)
	if err != nil {
		h.handleServiceError(w, err, "get year overview")
		return
	}

	response := make([]map[string]interface{}, 0, len(summaries))
	for i := range summaries {
		response = append(response, h.summaryToResponse(&summaries[i]))
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"year": year,
		"data": response,
	})
}

// CloseMonth handles POST /employees/{id}/months/{year}/{month}/close
func (h *MonthlyEvalHandler) CloseMonth(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}
	_ = tenantID // used for auth context

	// Get user for closedBy
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "User required")
		return
	}

	// Parse employee ID
	employeeIDStr := chi.URLParam(r, "id")
	employeeID, err := uuid.Parse(employeeIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	// Parse year
	yearStr := chi.URLParam(r, "year")
	year, err := strconv.Atoi(yearStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid year")
		return
	}

	// Parse month
	monthStr := chi.URLParam(r, "month")
	month, err := strconv.Atoi(monthStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid month")
		return
	}

	err = h.monthlyEvalService.CloseMonth(r.Context(), employeeID, year, month, user.ID)
	if err != nil {
		h.handleServiceError(w, err, "close month")
		return
	}

	// Return updated summary
	summary, err := h.monthlyEvalService.GetMonthSummary(r.Context(), employeeID, year, month)
	if err != nil {
		h.handleServiceError(w, err, "get month summary")
		return
	}

	respondJSON(w, http.StatusOK, h.summaryToResponse(summary))
}

// ReopenMonth handles POST /employees/{id}/months/{year}/{month}/reopen
func (h *MonthlyEvalHandler) ReopenMonth(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}
	_ = tenantID // used for auth context

	// Get user for reopenedBy
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "User required")
		return
	}

	// Parse employee ID
	employeeIDStr := chi.URLParam(r, "id")
	employeeID, err := uuid.Parse(employeeIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	// Parse year
	yearStr := chi.URLParam(r, "year")
	year, err := strconv.Atoi(yearStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid year")
		return
	}

	// Parse month
	monthStr := chi.URLParam(r, "month")
	month, err := strconv.Atoi(monthStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid month")
		return
	}

	err = h.monthlyEvalService.ReopenMonth(r.Context(), employeeID, year, month, user.ID)
	if err != nil {
		h.handleServiceError(w, err, "reopen month")
		return
	}

	// Return updated summary
	summary, err := h.monthlyEvalService.GetMonthSummary(r.Context(), employeeID, year, month)
	if err != nil {
		h.handleServiceError(w, err, "get month summary")
		return
	}

	respondJSON(w, http.StatusOK, h.summaryToResponse(summary))
}

// Recalculate handles POST /employees/{id}/months/{year}/{month}/recalculate
func (h *MonthlyEvalHandler) Recalculate(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}
	_ = tenantID // used for auth context

	// Parse employee ID
	employeeIDStr := chi.URLParam(r, "id")
	employeeID, err := uuid.Parse(employeeIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	// Parse year
	yearStr := chi.URLParam(r, "year")
	year, err := strconv.Atoi(yearStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid year")
		return
	}

	// Parse month
	monthStr := chi.URLParam(r, "month")
	month, err := strconv.Atoi(monthStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid month")
		return
	}

	err = h.monthlyEvalService.RecalculateMonth(r.Context(), employeeID, year, month)
	if err != nil {
		h.handleServiceError(w, err, "recalculate month")
		return
	}

	// Return updated summary
	summary, err := h.monthlyEvalService.GetMonthSummary(r.Context(), employeeID, year, month)
	if err != nil {
		h.handleServiceError(w, err, "get month summary")
		return
	}

	respondJSON(w, http.StatusOK, h.summaryToResponse(summary))
}

// handleServiceError maps service errors to HTTP responses.
func (h *MonthlyEvalHandler) handleServiceError(w http.ResponseWriter, err error, operation string) {
	switch err {
	case service.ErrMonthClosed:
		respondError(w, http.StatusForbidden, "Month is closed")
	case service.ErrMonthNotClosed:
		respondError(w, http.StatusBadRequest, "Month is not closed")
	case service.ErrInvalidMonth:
		respondError(w, http.StatusBadRequest, "Invalid month")
	case service.ErrInvalidYearMonth:
		respondError(w, http.StatusBadRequest, "Invalid year or month")
	case service.ErrMonthlyValueNotFound:
		respondError(w, http.StatusNotFound, "Monthly value not found")
	case service.ErrEmployeeNotFoundForEval:
		respondError(w, http.StatusNotFound, "Employee not found")
	default:
		respondError(w, http.StatusInternalServerError, "Failed to "+operation)
	}
}

// summaryToResponse converts service.MonthSummary to API response map.
func (h *MonthlyEvalHandler) summaryToResponse(s *service.MonthSummary) map[string]interface{} {
	response := map[string]interface{}{
		"employee_id":       s.EmployeeID.String(),
		"year":              s.Year,
		"month":             s.Month,
		"total_gross_time":  s.TotalGrossTime,
		"total_net_time":    s.TotalNetTime,
		"total_target_time": s.TotalTargetTime,
		"total_overtime":    s.TotalOvertime,
		"total_undertime":   s.TotalUndertime,
		"total_break_time":  s.TotalBreakTime,
		"flextime_start":    s.FlextimeStart,
		"flextime_change":   s.FlextimeChange,
		"flextime_end":      s.FlextimeEnd,
		"flextime_carryover": s.FlextimeCarryover,
		"vacation_taken":    s.VacationTaken.InexactFloat64(),
		"sick_days":         s.SickDays,
		"other_absence_days": s.OtherAbsenceDays,
		"work_days":         s.WorkDays,
		"days_with_errors":  s.DaysWithErrors,
		"is_closed":         s.IsClosed,
		"warnings":          s.Warnings,
	}

	// Optional fields
	if s.ClosedAt != nil {
		response["closed_at"] = strfmt.DateTime(*s.ClosedAt)
	}
	if s.ClosedBy != nil {
		response["closed_by"] = s.ClosedBy.String()
	}
	if s.ReopenedAt != nil {
		response["reopened_at"] = strfmt.DateTime(*s.ReopenedAt)
	}
	if s.ReopenedBy != nil {
		response["reopened_by"] = s.ReopenedBy.String()
	}

	return response
}
```

### Verification after Phase 1
```bash
cd apps/api && go build ./...
```

---

## Phase 2: Register Routes

### File: `apps/api/internal/handler/routes.go`

Add after `RegisterVacationRoutes` function (after line 237):

```go
// RegisterMonthlyEvalRoutes registers monthly evaluation routes.
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

### Verification after Phase 2
```bash
cd apps/api && go build ./...
```

---

## Phase 3: Wire Handler in main.go

### File: `apps/api/cmd/server/main.go`

**Change 1**: Replace line 123 (`_ = monthlyEvalService // TODO: Wire to MonthlyEvalHandler (separate ticket)`):

Replace:
```go
	_ = monthlyEvalService // TODO: Wire to MonthlyEvalHandler (separate ticket)
```

With:
```go
	monthlyEvalHandler := handler.NewMonthlyEvalHandler(monthlyEvalService)
```

**Change 2**: Add route registration inside the tenant-scoped routes group (after line 214, after `RegisterVacationRoutes`):

Add:
```go
				handler.RegisterMonthlyEvalRoutes(r, monthlyEvalHandler)
```

### Verification after Phase 3
```bash
cd apps/api && go build ./...
```

---

## Phase 4: Create Tests

### File: `apps/api/internal/handler/monthlyeval_test.go`

```go
package handler_test

import (
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

	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/handler"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

type monthlyEvalTestContext struct {
	handler          *handler.MonthlyEvalHandler
	service          *service.MonthlyEvalService
	monthlyValueRepo *repository.MonthlyValueRepository
	tenant           *model.Tenant
	employee         *model.Employee
	user             *auth.User
}

func setupMonthlyEvalHandler(t *testing.T) *monthlyEvalTestContext {
	db := testutil.SetupTestDB(t)
	tenantRepo := repository.NewTenantRepository(db)
	employeeRepo := repository.NewEmployeeRepository(db)
	monthlyValueRepo := repository.NewMonthlyValueRepository(db)
	dailyValueRepo := repository.NewDailyValueRepository(db)
	absenceDayRepo := repository.NewAbsenceDayRepository(db)

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
		LastName:        "Employee",
		PersonnelNumber: "TEST-001",
		PIN:             "1234",
		EntryDate:       time.Now().AddDate(-1, 0, 0),
		IsActive:        true,
	}
	require.NoError(t, employeeRepo.Create(ctx, employee))

	// Create service
	monthlyEvalService := service.NewMonthlyEvalService(monthlyValueRepo, dailyValueRepo, absenceDayRepo, employeeRepo)

	// Create handler
	h := handler.NewMonthlyEvalHandler(monthlyEvalService)

	// Create test user for close/reopen
	user := &auth.User{
		ID:          uuid.New(),
		Email:       "test@example.com",
		DisplayName: "Test User",
		Role:        "admin",
	}

	return &monthlyEvalTestContext{
		handler:          h,
		service:          monthlyEvalService,
		monthlyValueRepo: monthlyValueRepo,
		tenant:           tenant,
		employee:         employee,
		user:             user,
	}
}

func withMonthlyEvalTenantContext(r *http.Request, tenant *model.Tenant) *http.Request {
	ctx := context.WithValue(r.Context(), middleware.TenantContextKey, tenant.ID)
	return r.WithContext(ctx)
}

func withUserContext(r *http.Request, user *auth.User) *http.Request {
	ctx := auth.ContextWithUser(r.Context(), user)
	return r.WithContext(ctx)
}

// --- GetMonthSummary tests ---

func TestMonthlyEvalHandler_GetMonthSummary_NotFound(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)

	req := httptest.NewRequest("GET", "/employees/"+tc.employee.ID.String()+"/months/2026/1", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	rr := httptest.NewRecorder()

	tc.handler.GetMonthSummary(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestMonthlyEvalHandler_GetMonthSummary_InvalidMonth(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)

	req := httptest.NewRequest("GET", "/employees/"+tc.employee.ID.String()+"/months/2026/13", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "13")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	rr := httptest.NewRecorder()

	tc.handler.GetMonthSummary(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestMonthlyEvalHandler_GetMonthSummary_InvalidEmployeeID(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)

	req := httptest.NewRequest("GET", "/employees/invalid/months/2026/1", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	rr := httptest.NewRecorder()

	tc.handler.GetMonthSummary(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestMonthlyEvalHandler_GetMonthSummary_NoTenant(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)

	req := httptest.NewRequest("GET", "/employees/"+tc.employee.ID.String()+"/months/2026/1", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	tc.handler.GetMonthSummary(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestMonthlyEvalHandler_GetMonthSummary_Success(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)
	ctx := context.Background()

	// Create a monthly value directly
	mv := &model.MonthlyValue{
		TenantID:       tc.tenant.ID,
		EmployeeID:     tc.employee.ID,
		Year:           2026,
		Month:          1,
		TotalGrossTime: 9600,
		TotalNetTime:   9000,
		TotalTargetTime: 8800,
		WorkDays:       20,
	}
	require.NoError(t, tc.monthlyValueRepo.Upsert(ctx, mv))

	req := httptest.NewRequest("GET", "/employees/"+tc.employee.ID.String()+"/months/2026/1", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	rr := httptest.NewRecorder()

	tc.handler.GetMonthSummary(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var result map[string]interface{}
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, float64(2026), result["year"])
	assert.Equal(t, float64(1), result["month"])
	assert.Equal(t, float64(9600), result["total_gross_time"])
	assert.Equal(t, float64(9000), result["total_net_time"])
	assert.Equal(t, false, result["is_closed"])
}

// --- GetYearOverview tests ---

func TestMonthlyEvalHandler_GetYearOverview_Success(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)

	req := httptest.NewRequest("GET", "/employees/"+tc.employee.ID.String()+"/months/2026", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	rr := httptest.NewRecorder()

	tc.handler.GetYearOverview(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var result map[string]interface{}
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, float64(2026), result["year"])
	assert.NotNil(t, result["data"])
}

func TestMonthlyEvalHandler_GetYearOverview_InvalidYear(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)

	req := httptest.NewRequest("GET", "/employees/"+tc.employee.ID.String()+"/months/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	rr := httptest.NewRecorder()

	tc.handler.GetYearOverview(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestMonthlyEvalHandler_GetYearOverview_NoTenant(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)

	req := httptest.NewRequest("GET", "/employees/"+tc.employee.ID.String()+"/months/2026", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	tc.handler.GetYearOverview(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

// --- CloseMonth tests ---

func TestMonthlyEvalHandler_CloseMonth_NotFound(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)

	req := httptest.NewRequest("POST", "/employees/"+tc.employee.ID.String()+"/months/2026/1/close", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	req = withUserContext(req, tc.user)
	rr := httptest.NewRecorder()

	tc.handler.CloseMonth(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestMonthlyEvalHandler_CloseMonth_NoUser(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)

	req := httptest.NewRequest("POST", "/employees/"+tc.employee.ID.String()+"/months/2026/1/close", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	// No user context
	rr := httptest.NewRecorder()

	tc.handler.CloseMonth(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestMonthlyEvalHandler_CloseMonth_Success(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)
	ctx := context.Background()

	// Create a monthly value to close
	mv := &model.MonthlyValue{
		TenantID:   tc.tenant.ID,
		EmployeeID: tc.employee.ID,
		Year:       2026,
		Month:      1,
		WorkDays:   20,
	}
	require.NoError(t, tc.monthlyValueRepo.Upsert(ctx, mv))

	req := httptest.NewRequest("POST", "/employees/"+tc.employee.ID.String()+"/months/2026/1/close", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	req = withUserContext(req, tc.user)
	rr := httptest.NewRecorder()

	tc.handler.CloseMonth(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var result map[string]interface{}
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, true, result["is_closed"])
	assert.NotNil(t, result["closed_at"])
	assert.NotNil(t, result["closed_by"])
}

func TestMonthlyEvalHandler_CloseMonth_AlreadyClosed(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)
	ctx := context.Background()

	// Create an already closed monthly value
	mv := &model.MonthlyValue{
		TenantID:   tc.tenant.ID,
		EmployeeID: tc.employee.ID,
		Year:       2026,
		Month:      2,
		WorkDays:   20,
		IsClosed:   true,
	}
	require.NoError(t, tc.monthlyValueRepo.Upsert(ctx, mv))

	req := httptest.NewRequest("POST", "/employees/"+tc.employee.ID.String()+"/months/2026/2/close", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "2")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	req = withUserContext(req, tc.user)
	rr := httptest.NewRecorder()

	tc.handler.CloseMonth(rr, req)

	assert.Equal(t, http.StatusForbidden, rr.Code)
}

// --- ReopenMonth tests ---

func TestMonthlyEvalHandler_ReopenMonth_NotClosed(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)
	ctx := context.Background()

	// Create an open monthly value
	mv := &model.MonthlyValue{
		TenantID:   tc.tenant.ID,
		EmployeeID: tc.employee.ID,
		Year:       2026,
		Month:      3,
		WorkDays:   20,
		IsClosed:   false,
	}
	require.NoError(t, tc.monthlyValueRepo.Upsert(ctx, mv))

	req := httptest.NewRequest("POST", "/employees/"+tc.employee.ID.String()+"/months/2026/3/reopen", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "3")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	req = withUserContext(req, tc.user)
	rr := httptest.NewRecorder()

	tc.handler.ReopenMonth(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestMonthlyEvalHandler_ReopenMonth_Success(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)
	ctx := context.Background()

	// Create a closed monthly value
	closedAt := time.Now()
	mv := &model.MonthlyValue{
		TenantID:   tc.tenant.ID,
		EmployeeID: tc.employee.ID,
		Year:       2026,
		Month:      4,
		WorkDays:   20,
		IsClosed:   true,
		ClosedAt:   &closedAt,
		ClosedBy:   &tc.user.ID,
	}
	require.NoError(t, tc.monthlyValueRepo.Upsert(ctx, mv))

	req := httptest.NewRequest("POST", "/employees/"+tc.employee.ID.String()+"/months/2026/4/reopen", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "4")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	req = withUserContext(req, tc.user)
	rr := httptest.NewRecorder()

	tc.handler.ReopenMonth(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var result map[string]interface{}
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, false, result["is_closed"])
	assert.NotNil(t, result["reopened_at"])
	assert.NotNil(t, result["reopened_by"])
}

// --- Recalculate tests ---

func TestMonthlyEvalHandler_Recalculate_EmployeeNotFound(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)

	nonExistentID := uuid.New()
	req := httptest.NewRequest("POST", "/employees/"+nonExistentID.String()+"/months/2026/1/recalculate", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", nonExistentID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	rr := httptest.NewRecorder()

	tc.handler.Recalculate(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestMonthlyEvalHandler_Recalculate_MonthClosed(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)
	ctx := context.Background()

	// Create a closed monthly value
	closedAt := time.Now()
	mv := &model.MonthlyValue{
		TenantID:   tc.tenant.ID,
		EmployeeID: tc.employee.ID,
		Year:       2026,
		Month:      5,
		WorkDays:   20,
		IsClosed:   true,
		ClosedAt:   &closedAt,
		ClosedBy:   &tc.user.ID,
	}
	require.NoError(t, tc.monthlyValueRepo.Upsert(ctx, mv))

	req := httptest.NewRequest("POST", "/employees/"+tc.employee.ID.String()+"/months/2026/5/recalculate", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "5")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	rr := httptest.NewRecorder()

	tc.handler.Recalculate(rr, req)

	assert.Equal(t, http.StatusForbidden, rr.Code)
}

func TestMonthlyEvalHandler_Recalculate_Success(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)

	req := httptest.NewRequest("POST", "/employees/"+tc.employee.ID.String()+"/months/2026/6/recalculate", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "6")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	rr := httptest.NewRecorder()

	tc.handler.Recalculate(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var result map[string]interface{}
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, float64(2026), result["year"])
	assert.Equal(t, float64(6), result["month"])
}

func TestMonthlyEvalHandler_Recalculate_NoTenant(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)

	req := httptest.NewRequest("POST", "/employees/"+tc.employee.ID.String()+"/months/2026/6/recalculate", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "6")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	tc.handler.Recalculate(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}
```

### Verification after Phase 4
```bash
cd apps/api && go build ./...
cd apps/api && go test -v -run TestMonthlyEvalHandler ./internal/handler/...
```

---

## Phase 5: Final Verification

Run all checks:

```bash
cd apps/api && make test
cd apps/api && make lint
```

---

## Success Criteria Checklist

- [ ] `apps/api/internal/handler/monthlyeval.go` created with MonthlyEvalHandler struct
- [ ] Handler has `GetMonthSummary`, `GetYearOverview`, `CloseMonth`, `ReopenMonth`, `Recalculate` methods
- [ ] `RegisterMonthlyEvalRoutes` added to `routes.go`
- [ ] Routes match ticket spec:
  - `GET /employees/{id}/months/{year}` - GetYearOverview
  - `GET /employees/{id}/months/{year}/{month}` - GetMonthSummary
  - `POST /employees/{id}/months/{year}/{month}/close` - CloseMonth
  - `POST /employees/{id}/months/{year}/{month}/reopen` - ReopenMonth
  - `POST /employees/{id}/months/{year}/{month}/recalculate` - Recalculate
- [ ] Handler wired in `main.go` (replaces `_ = monthlyEvalService` placeholder)
- [ ] Route registration added in tenant-scoped group
- [ ] `summaryToResponse` converts service.MonthSummary to JSON response
- [ ] Service errors mapped to correct HTTP status codes:
  - ErrMonthClosed -> 403
  - ErrMonthNotClosed -> 400
  - ErrInvalidMonth -> 400
  - ErrInvalidYearMonth -> 400
  - ErrMonthlyValueNotFound -> 404
  - ErrEmployeeNotFoundForEval -> 404
- [ ] CloseMonth and ReopenMonth use `auth.UserFromContext` for closedBy/reopenedBy
- [ ] Tests cover all endpoints and error cases
- [ ] `make test` passes
- [ ] `make lint` passes

## Notes

- The handler uses `auth.UserFromContext` for CloseMonth and ReopenMonth to get the user ID for closedBy/reopenedBy fields. This requires the auth middleware to be applied (which it is for tenant-scoped routes).
- The response uses a custom `map[string]interface{}` format matching the ticket requirements rather than the generated `models.MonthlyValue` since the service's `MonthSummary` has different field names.
- The `_ = tenantID` pattern is used to suppress unused variable warnings while still requiring tenant context for authorization.
- Year overview returns months in the order they were calculated (by repository), which should be chronological.

## References

- Research document: `thoughts/shared/research/2026-01-25-NOK-153-create-month-closing-handler.md`
- MonthlyEvalService: `apps/api/internal/service/monthlyeval.go:90-403`
- Existing handler patterns: `apps/api/internal/handler/vacation.go`, `apps/api/internal/handler/absence.go`
- Auth context: `apps/api/internal/auth/context.go`
