# TICKET-049: Create Tariff Handler

**Type**: Handler
**Effort**: S
**Sprint**: 8 - Tariffs
**Dependencies**: TICKET-048

## Description

Create the Tariff HTTP handler with CRUD and apply endpoints.

## Files to Create

- `apps/api/internal/handler/tariff.go`

## Implementation

```go
package handler

type TariffHandler struct {
    service service.TariffService
}

func NewTariffHandler(s service.TariffService) *TariffHandler {
    return &TariffHandler{service: s}
}

type CreateTariffRequest struct {
    ValidFrom  string              `json:"valid_from"`  // YYYY-MM-DD
    ValidTo    *string             `json:"valid_to,omitempty"`
    TariffType model.TariffType    `json:"tariff_type"`
    WeekPlanID *uuid.UUID          `json:"week_plan_id,omitempty"`
    RhythmDays *int                `json:"rhythm_days,omitempty"`
    DayPlans   []DayPlanAssignment `json:"day_plans,omitempty"`
}

type DayPlanAssignment struct {
    DayIndex  int        `json:"day_index"`
    DayPlanID *uuid.UUID `json:"day_plan_id,omitempty"`
}

type ApplyTariffRequest struct {
    From string `json:"from"` // YYYY-MM-DD
    To   string `json:"to"`   // YYYY-MM-DD
}

// ListByEmployee handles GET /api/v1/employees/{id}/tariffs
func (h *TariffHandler) ListByEmployee(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    employeeID, err := uuid.Parse(idStr)
    if err != nil {
        http.Error(w, "invalid employee id", http.StatusBadRequest)
        return
    }

    tariffs, err := h.service.ListByEmployee(r.Context(), employeeID)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    respondJSON(w, http.StatusOK, tariffs)
}

// Create handles POST /api/v1/employees/{id}/tariffs
func (h *TariffHandler) Create(w http.ResponseWriter, r *http.Request) {
    tenantID, ok := middleware.TenantFromContext(r.Context())
    if !ok {
        http.Error(w, "tenant required", http.StatusBadRequest)
        return
    }

    idStr := chi.URLParam(r, "id")
    employeeID, err := uuid.Parse(idStr)
    if err != nil {
        http.Error(w, "invalid employee id", http.StatusBadRequest)
        return
    }

    var req CreateTariffRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request body", http.StatusBadRequest)
        return
    }

    validFrom, err := time.Parse("2006-01-02", req.ValidFrom)
    if err != nil {
        http.Error(w, "invalid valid_from date", http.StatusBadRequest)
        return
    }

    input := service.CreateTariffInput{
        TenantID:   tenantID,
        EmployeeID: employeeID,
        ValidFrom:  validFrom,
        TariffType: req.TariffType,
        WeekPlanID: req.WeekPlanID,
        RhythmDays: req.RhythmDays,
    }

    if req.ValidTo != nil {
        validTo, err := time.Parse("2006-01-02", *req.ValidTo)
        if err == nil {
            input.ValidTo = &validTo
        }
    }

    for _, dp := range req.DayPlans {
        input.DayPlans = append(input.DayPlans, service.TariffDayPlanInput{
            DayIndex:  dp.DayIndex,
            DayPlanID: dp.DayPlanID,
        })
    }

    tariff, err := h.service.Create(r.Context(), input)
    if err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    respondJSON(w, http.StatusCreated, tariff)
}

// Apply handles POST /api/v1/employees/{id}/tariffs/{tariffId}/apply
func (h *TariffHandler) Apply(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    employeeID, err := uuid.Parse(idStr)
    if err != nil {
        http.Error(w, "invalid employee id", http.StatusBadRequest)
        return
    }

    var req ApplyTariffRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request body", http.StatusBadRequest)
        return
    }

    from, err := time.Parse("2006-01-02", req.From)
    if err != nil {
        http.Error(w, "invalid from date", http.StatusBadRequest)
        return
    }
    to, err := time.Parse("2006-01-02", req.To)
    if err != nil {
        http.Error(w, "invalid to date", http.StatusBadRequest)
        return
    }

    if err := h.service.ApplyTariffToRange(r.Context(), employeeID, from, to); err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]string{"status": "applied"})
}
```

## API Endpoints

- `GET /api/v1/employees/{id}/tariffs` - List employee's tariffs
- `POST /api/v1/employees/{id}/tariffs` - Create new tariff
- `GET /api/v1/employees/{id}/tariffs/current` - Get current tariff
- `POST /api/v1/employees/{id}/tariffs/{tariffId}/apply` - Apply tariff to date range

## Unit Tests

**File**: `apps/api/internal/handler/tariff_test.go`

```go
package handler

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
    "github.com/stretchr/testify/mock"

    "terp/apps/api/internal/model"
    "terp/apps/api/internal/service"
)

type MockTariffService struct {
    mock.Mock
}

func (m *MockTariffService) ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.Tariff, error) {
    args := m.Called(ctx, employeeID)
    return args.Get(0).([]model.Tariff), args.Error(1)
}

func (m *MockTariffService) Create(ctx context.Context, input service.CreateTariffInput) (*model.Tariff, error) {
    args := m.Called(ctx, input)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.Tariff), args.Error(1)
}

func (m *MockTariffService) GetCurrent(ctx context.Context, employeeID uuid.UUID) (*model.Tariff, error) {
    args := m.Called(ctx, employeeID)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.Tariff), args.Error(1)
}

func (m *MockTariffService) ApplyTariffToRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error {
    args := m.Called(ctx, employeeID, from, to)
    return args.Error(0)
}

func TestTariffHandler_ListByEmployee_Success(t *testing.T) {
    mockSvc := new(MockTariffService)
    h := NewTariffHandler(mockSvc)

    employeeID := uuid.New()
    tariffs := []model.Tariff{{ID: uuid.New(), EmployeeID: employeeID}}
    mockSvc.On("ListByEmployee", mock.Anything, employeeID).Return(tariffs, nil)

    req := httptest.NewRequest("GET", "/employees/"+employeeID.String()+"/tariffs", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", employeeID.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.ListByEmployee(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestTariffHandler_ListByEmployee_InvalidID(t *testing.T) {
    mockSvc := new(MockTariffService)
    h := NewTariffHandler(mockSvc)

    req := httptest.NewRequest("GET", "/employees/invalid/tariffs", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.ListByEmployee(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTariffHandler_Create_Success(t *testing.T) {
    mockSvc := new(MockTariffService)
    h := NewTariffHandler(mockSvc)

    tenantID := uuid.New()
    employeeID := uuid.New()
    tariff := &model.Tariff{
        ID:         uuid.New(),
        EmployeeID: employeeID,
    }

    mockSvc.On("Create", mock.Anything, mock.MatchedBy(func(i service.CreateTariffInput) bool {
        return i.EmployeeID == employeeID && i.TenantID == tenantID
    })).Return(tariff, nil)

    body := `{"valid_from":"2024-01-01","tariff_type":"WEEK_PLAN"}`
    req := httptest.NewRequest("POST", "/employees/"+employeeID.String()+"/tariffs", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", employeeID.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusCreated, rr.Code)
}

func TestTariffHandler_Create_InvalidBody(t *testing.T) {
    mockSvc := new(MockTariffService)
    h := NewTariffHandler(mockSvc)

    employeeID := uuid.New()
    req := httptest.NewRequest("POST", "/employees/"+employeeID.String()+"/tariffs", bytes.NewBufferString("invalid"))
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", employeeID.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTariffHandler_Create_InvalidDateFormat(t *testing.T) {
    mockSvc := new(MockTariffService)
    h := NewTariffHandler(mockSvc)

    employeeID := uuid.New()
    body := `{"valid_from":"invalid-date","tariff_type":"WEEK_PLAN"}`
    req := httptest.NewRequest("POST", "/employees/"+employeeID.String()+"/tariffs", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", employeeID.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTariffHandler_Create_InvalidEmployeeID(t *testing.T) {
    mockSvc := new(MockTariffService)
    h := NewTariffHandler(mockSvc)

    body := `{"valid_from":"2024-01-01","tariff_type":"WEEK_PLAN"}`
    req := httptest.NewRequest("POST", "/employees/invalid/tariffs", bytes.NewBufferString(body))
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTariffHandler_Apply_Success(t *testing.T) {
    mockSvc := new(MockTariffService)
    h := NewTariffHandler(mockSvc)

    employeeID := uuid.New()
    from, _ := time.Parse("2006-01-02", "2024-01-01")
    to, _ := time.Parse("2006-01-02", "2024-01-31")
    mockSvc.On("ApplyTariffToRange", mock.Anything, employeeID, from, to).Return(nil)

    body := `{"from":"2024-01-01","to":"2024-01-31"}`
    req := httptest.NewRequest("POST", "/employees/"+employeeID.String()+"/tariffs/apply", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", employeeID.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Apply(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestTariffHandler_Apply_InvalidDates(t *testing.T) {
    mockSvc := new(MockTariffService)
    h := NewTariffHandler(mockSvc)

    employeeID := uuid.New()
    body := `{"from":"invalid","to":"2024-01-31"}`
    req := httptest.NewRequest("POST", "/employees/"+employeeID.String()+"/tariffs/apply", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", employeeID.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Apply(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTariffHandler_Apply_InvalidEmployeeID(t *testing.T) {
    mockSvc := new(MockTariffService)
    h := NewTariffHandler(mockSvc)

    body := `{"from":"2024-01-01","to":"2024-01-31"}`
    req := httptest.NewRequest("POST", "/employees/invalid/tariffs/apply", bytes.NewBufferString(body))
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Apply(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] `make lint` passes
- [ ] List by employee works
- [ ] Create validates tariff type configuration
- [ ] Apply generates employee_day_plans for date range
- [ ] Unit tests with mocked service
- [ ] Tests cover all HTTP methods and error cases
