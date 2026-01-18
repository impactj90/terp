# TICKET-091: Create Month Closing Handler

**Type**: Handler
**Effort**: M
**Sprint**: 22 - Monthly Calculation
**Dependencies**: TICKET-090

## Description

Create HTTP handlers for month closing operations.

## Files to Create

- `apps/api/internal/handler/monthly.go`

## Implementation

```go
package handler

import (
    "net/http"
    "strconv"

    "github.com/go-chi/chi/v5"
    "github.com/google/uuid"

    "terp/apps/api/internal/service"
)

type MonthlyHandler struct {
    monthlyCalcSvc service.MonthlyCalcService
}

func NewMonthlyHandler(monthlyCalcSvc service.MonthlyCalcService) *MonthlyHandler {
    return &MonthlyHandler{monthlyCalcSvc: monthlyCalcSvc}
}

func (h *MonthlyHandler) Routes() chi.Router {
    r := chi.NewRouter()

    r.Get("/{employeeId}/{year}/{month}", h.GetMonthlyValue)
    r.Post("/{employeeId}/{year}/{month}/calculate", h.CalculateMonth)
    r.Post("/{employeeId}/{year}/{month}/close", h.CloseMonth)
    r.Post("/{employeeId}/{year}/{month}/reopen", h.ReopenMonth)
    r.Post("/batch-close/{year}/{month}", h.BatchCloseMonth)

    return r
}

type MonthlyValueResponse struct {
    ID               string  `json:"id"`
    EmployeeID       string  `json:"employee_id"`
    Year             int     `json:"year"`
    Month            int     `json:"month"`
    TotalGrossTime   int     `json:"total_gross_time"`
    TotalNetTime     int     `json:"total_net_time"`
    TotalTargetTime  int     `json:"total_target_time"`
    TotalOvertime    int     `json:"total_overtime"`
    TotalUndertime   int     `json:"total_undertime"`
    FlextimeStart    int     `json:"flextime_start"`
    FlextimeChange   int     `json:"flextime_change"`
    FlextimeEnd      int     `json:"flextime_end"`
    FlextimeCarryover int    `json:"flextime_carryover"`
    VacationTaken    string  `json:"vacation_taken"`
    SickDays         int     `json:"sick_days"`
    WorkDays         int     `json:"work_days"`
    DaysWithErrors   int     `json:"days_with_errors"`
    IsClosed         bool    `json:"is_closed"`
    ClosedAt         *string `json:"closed_at,omitempty"`
}

func (h *MonthlyHandler) GetMonthlyValue(w http.ResponseWriter, r *http.Request) {
    employeeID, err := uuid.Parse(chi.URLParam(r, "employeeId"))
    if err != nil {
        respondError(w, http.StatusBadRequest, "invalid employee ID")
        return
    }

    year, _ := strconv.Atoi(chi.URLParam(r, "year"))
    month, _ := strconv.Atoi(chi.URLParam(r, "month"))

    // Get or calculate
    value, err := h.monthlyCalcSvc.CalculateMonth(r.Context(), employeeID, year, month)
    if err != nil {
        respondError(w, http.StatusInternalServerError, err.Error())
        return
    }

    respondJSON(w, http.StatusOK, toMonthlyResponse(value))
}

func (h *MonthlyHandler) CalculateMonth(w http.ResponseWriter, r *http.Request) {
    employeeID, err := uuid.Parse(chi.URLParam(r, "employeeId"))
    if err != nil {
        respondError(w, http.StatusBadRequest, "invalid employee ID")
        return
    }

    year, _ := strconv.Atoi(chi.URLParam(r, "year"))
    month, _ := strconv.Atoi(chi.URLParam(r, "month"))

    value, err := h.monthlyCalcSvc.RecalculateMonth(r.Context(), employeeID, year, month)
    if err != nil {
        respondError(w, http.StatusInternalServerError, err.Error())
        return
    }

    respondJSON(w, http.StatusOK, toMonthlyResponse(value))
}

func (h *MonthlyHandler) CloseMonth(w http.ResponseWriter, r *http.Request) {
    employeeID, err := uuid.Parse(chi.URLParam(r, "employeeId"))
    if err != nil {
        respondError(w, http.StatusBadRequest, "invalid employee ID")
        return
    }

    year, _ := strconv.Atoi(chi.URLParam(r, "year"))
    month, _ := strconv.Atoi(chi.URLParam(r, "month"))

    userID := getUserIDFromContext(r.Context())

    if err := h.monthlyCalcSvc.CloseMonth(r.Context(), employeeID, year, month, userID); err != nil {
        respondError(w, http.StatusBadRequest, err.Error())
        return
    }

    respondJSON(w, http.StatusOK, map[string]string{"status": "closed"})
}

func (h *MonthlyHandler) ReopenMonth(w http.ResponseWriter, r *http.Request) {
    employeeID, err := uuid.Parse(chi.URLParam(r, "employeeId"))
    if err != nil {
        respondError(w, http.StatusBadRequest, "invalid employee ID")
        return
    }

    year, _ := strconv.Atoi(chi.URLParam(r, "year"))
    month, _ := strconv.Atoi(chi.URLParam(r, "month"))

    userID := getUserIDFromContext(r.Context())

    if err := h.monthlyCalcSvc.ReopenMonth(r.Context(), employeeID, year, month, userID); err != nil {
        respondError(w, http.StatusBadRequest, err.Error())
        return
    }

    respondJSON(w, http.StatusOK, map[string]string{"status": "reopened"})
}

type BatchCloseRequest struct {
    TenantID string `json:"tenant_id"`
}

func (h *MonthlyHandler) BatchCloseMonth(w http.ResponseWriter, r *http.Request) {
    year, _ := strconv.Atoi(chi.URLParam(r, "year"))
    month, _ := strconv.Atoi(chi.URLParam(r, "month"))

    tenantID := getTenantIDFromContext(r.Context())
    userID := getUserIDFromContext(r.Context())

    count, err := h.monthlyCalcSvc.BatchCloseMonth(r.Context(), tenantID, year, month, userID)
    if err != nil {
        respondError(w, http.StatusInternalServerError, err.Error())
        return
    }

    respondJSON(w, http.StatusOK, map[string]interface{}{
        "status":         "completed",
        "employees_closed": count,
    })
}
```

## Unit Tests

**File**: `apps/api/internal/handler/monthly_test.go`

```go
package handler

import (
    "bytes"
    "context"
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "testing"

    "github.com/go-chi/chi/v5"
    "github.com/google/uuid"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/mock"
    "github.com/stretchr/testify/require"

    "terp/apps/api/internal/model"
    "terp/apps/api/internal/service"
)

type MockMonthlyCalcService struct {
    mock.Mock
}

func (m *MockMonthlyCalcService) CalculateMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error) {
    args := m.Called(ctx, employeeID, year, month)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.MonthlyValue), args.Error(1)
}

func (m *MockMonthlyCalcService) RecalculateMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error) {
    args := m.Called(ctx, employeeID, year, month)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.MonthlyValue), args.Error(1)
}

func (m *MockMonthlyCalcService) CloseMonth(ctx context.Context, employeeID uuid.UUID, year, month int, userID uuid.UUID) error {
    args := m.Called(ctx, employeeID, year, month, userID)
    return args.Error(0)
}

func (m *MockMonthlyCalcService) ReopenMonth(ctx context.Context, employeeID uuid.UUID, year, month int, userID uuid.UUID) error {
    args := m.Called(ctx, employeeID, year, month, userID)
    return args.Error(0)
}

func (m *MockMonthlyCalcService) BatchCloseMonth(ctx context.Context, tenantID uuid.UUID, year, month int, userID uuid.UUID) (int, error) {
    args := m.Called(ctx, tenantID, year, month, userID)
    return args.Int(0), args.Error(1)
}

func TestMonthlyHandler_GetMonthlyValue_Success(t *testing.T) {
    mockSvc := new(MockMonthlyCalcService)
    h := NewMonthlyHandler(mockSvc)

    employeeID := uuid.New()
    monthlyValue := &model.MonthlyValue{
        ID:              uuid.New(),
        EmployeeID:      employeeID,
        Year:            2024,
        Month:           1,
        TotalGrossTime:  160000,
        TotalNetTime:    152000,
    }

    mockSvc.On("CalculateMonth", mock.Anything, employeeID, 2024, 1).Return(monthlyValue, nil)

    req := httptest.NewRequest("GET", "/monthly/"+employeeID.String()+"/2024/1", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("employeeId", employeeID.String())
    rctx.URLParams.Add("year", "2024")
    rctx.URLParams.Add("month", "1")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.GetMonthlyValue(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestMonthlyHandler_GetMonthlyValue_InvalidEmployeeID(t *testing.T) {
    mockSvc := new(MockMonthlyCalcService)
    h := NewMonthlyHandler(mockSvc)

    req := httptest.NewRequest("GET", "/monthly/invalid/2024/1", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("employeeId", "invalid")
    rctx.URLParams.Add("year", "2024")
    rctx.URLParams.Add("month", "1")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.GetMonthlyValue(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestMonthlyHandler_CalculateMonth_Success(t *testing.T) {
    mockSvc := new(MockMonthlyCalcService)
    h := NewMonthlyHandler(mockSvc)

    employeeID := uuid.New()
    monthlyValue := &model.MonthlyValue{
        ID:              uuid.New(),
        EmployeeID:      employeeID,
        Year:            2024,
        Month:           1,
    }

    mockSvc.On("RecalculateMonth", mock.Anything, employeeID, 2024, 1).Return(monthlyValue, nil)

    req := httptest.NewRequest("POST", "/monthly/"+employeeID.String()+"/2024/1/calculate", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("employeeId", employeeID.String())
    rctx.URLParams.Add("year", "2024")
    rctx.URLParams.Add("month", "1")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.CalculateMonth(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestMonthlyHandler_CloseMonth_Success(t *testing.T) {
    mockSvc := new(MockMonthlyCalcService)
    h := NewMonthlyHandler(mockSvc)

    employeeID := uuid.New()
    userID := uuid.New()

    mockSvc.On("CloseMonth", mock.Anything, employeeID, 2024, 1, userID).Return(nil)

    req := httptest.NewRequest("POST", "/monthly/"+employeeID.String()+"/2024/1/close", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("employeeId", employeeID.String())
    rctx.URLParams.Add("year", "2024")
    rctx.URLParams.Add("month", "1")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    req = req.WithContext(context.WithValue(req.Context(), "user_id", userID))
    rr := httptest.NewRecorder()

    h.CloseMonth(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result map[string]string
    json.Unmarshal(rr.Body.Bytes(), &result)
    assert.Equal(t, "closed", result["status"])
}

func TestMonthlyHandler_CloseMonth_AlreadyClosed(t *testing.T) {
    mockSvc := new(MockMonthlyCalcService)
    h := NewMonthlyHandler(mockSvc)

    employeeID := uuid.New()
    userID := uuid.New()

    mockSvc.On("CloseMonth", mock.Anything, employeeID, 2024, 1, userID).Return(service.ErrMonthAlreadyClosed)

    req := httptest.NewRequest("POST", "/monthly/"+employeeID.String()+"/2024/1/close", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("employeeId", employeeID.String())
    rctx.URLParams.Add("year", "2024")
    rctx.URLParams.Add("month", "1")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    req = req.WithContext(context.WithValue(req.Context(), "user_id", userID))
    rr := httptest.NewRecorder()

    h.CloseMonth(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestMonthlyHandler_ReopenMonth_Success(t *testing.T) {
    mockSvc := new(MockMonthlyCalcService)
    h := NewMonthlyHandler(mockSvc)

    employeeID := uuid.New()
    userID := uuid.New()

    mockSvc.On("ReopenMonth", mock.Anything, employeeID, 2024, 1, userID).Return(nil)

    req := httptest.NewRequest("POST", "/monthly/"+employeeID.String()+"/2024/1/reopen", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("employeeId", employeeID.String())
    rctx.URLParams.Add("year", "2024")
    rctx.URLParams.Add("month", "1")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    req = req.WithContext(context.WithValue(req.Context(), "user_id", userID))
    rr := httptest.NewRecorder()

    h.ReopenMonth(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result map[string]string
    json.Unmarshal(rr.Body.Bytes(), &result)
    assert.Equal(t, "reopened", result["status"])
}

func TestMonthlyHandler_ReopenMonth_NotClosed(t *testing.T) {
    mockSvc := new(MockMonthlyCalcService)
    h := NewMonthlyHandler(mockSvc)

    employeeID := uuid.New()
    userID := uuid.New()

    mockSvc.On("ReopenMonth", mock.Anything, employeeID, 2024, 1, userID).Return(service.ErrMonthNotClosed)

    req := httptest.NewRequest("POST", "/monthly/"+employeeID.String()+"/2024/1/reopen", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("employeeId", employeeID.String())
    rctx.URLParams.Add("year", "2024")
    rctx.URLParams.Add("month", "1")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    req = req.WithContext(context.WithValue(req.Context(), "user_id", userID))
    rr := httptest.NewRecorder()

    h.ReopenMonth(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestMonthlyHandler_BatchCloseMonth_Success(t *testing.T) {
    mockSvc := new(MockMonthlyCalcService)
    h := NewMonthlyHandler(mockSvc)

    tenantID := uuid.New()
    userID := uuid.New()

    mockSvc.On("BatchCloseMonth", mock.Anything, tenantID, 2024, 1, userID).Return(15, nil)

    req := httptest.NewRequest("POST", "/monthly/batch-close/2024/1", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("year", "2024")
    rctx.URLParams.Add("month", "1")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    req = req.WithContext(context.WithValue(req.Context(), "user_id", userID))
    rr := httptest.NewRecorder()

    h.BatchCloseMonth(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result map[string]interface{}
    json.Unmarshal(rr.Body.Bytes(), &result)
    assert.Equal(t, "completed", result["status"])
    assert.Equal(t, float64(15), result["employees_closed"])
}

func TestMonthlyHandler_BatchCloseMonth_NoEmployees(t *testing.T) {
    mockSvc := new(MockMonthlyCalcService)
    h := NewMonthlyHandler(mockSvc)

    tenantID := uuid.New()
    userID := uuid.New()

    mockSvc.On("BatchCloseMonth", mock.Anything, tenantID, 2024, 1, userID).Return(0, nil)

    req := httptest.NewRequest("POST", "/monthly/batch-close/2024/1", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("year", "2024")
    rctx.URLParams.Add("month", "1")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    req = req.WithContext(context.WithValue(req.Context(), "user_id", userID))
    rr := httptest.NewRecorder()

    h.BatchCloseMonth(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result map[string]interface{}
    json.Unmarshal(rr.Body.Bytes(), &result)
    assert.Equal(t, float64(0), result["employees_closed"])
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] `make lint` passes
- [ ] GET returns calculated monthly value
- [ ] POST calculate forces recalculation
- [ ] POST close prevents modifications
- [ ] POST reopen allows editing
- [ ] Batch close processes all tenant employees
- [ ] Unit tests with mocked service
- [ ] Tests cover all HTTP methods and error cases
