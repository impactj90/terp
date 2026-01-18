# TICKET-041: Create Day Plan Handler

**Type**: Handler
**Effort**: M
**Sprint**: 6 - Day Plans
**Dependencies**: TICKET-040

## Description

Create the DayPlan HTTP handler with CRUD and copy endpoints.

## Files to Create

- `apps/api/internal/handler/dayplan.go`

## Implementation

```go
package handler

import (
    "encoding/json"
    "net/http"

    "github.com/go-chi/chi/v5"
    "github.com/google/uuid"

    "terp/apps/api/internal/middleware"
    "terp/apps/api/internal/model"
    "terp/apps/api/internal/service"
)

type DayPlanHandler struct {
    service service.DayPlanService
}

func NewDayPlanHandler(s service.DayPlanService) *DayPlanHandler {
    return &DayPlanHandler{service: s}
}

type CreateDayPlanRequest struct {
    Code         string          `json:"code"`
    Name         string          `json:"name"`
    Description  string          `json:"description,omitempty"`
    PlanType     model.PlanType  `json:"plan_type"`
    ComeFrom     *int            `json:"come_from,omitempty"`
    ComeTo       *int            `json:"come_to,omitempty"`
    GoFrom       *int            `json:"go_from,omitempty"`
    GoTo         *int            `json:"go_to,omitempty"`
    CoreStart    *int            `json:"core_start,omitempty"`
    CoreEnd      *int            `json:"core_end,omitempty"`
    RegularHours int             `json:"regular_hours"`
    // Tolerance and rounding settings...
}

type CopyDayPlanRequest struct {
    NewCode string `json:"new_code"`
    NewName string `json:"new_name"`
}

type AddBreakRequest struct {
    BreakType        model.BreakType `json:"break_type"`
    StartTime        *int            `json:"start_time,omitempty"`
    EndTime          *int            `json:"end_time,omitempty"`
    Duration         int             `json:"duration"`
    AfterWorkMinutes *int            `json:"after_work_minutes,omitempty"`
    AutoDeduct       bool            `json:"auto_deduct"`
    IsPaid           bool            `json:"is_paid"`
}

type AddBonusRequest struct {
    AccountID       uuid.UUID             `json:"account_id"`
    TimeFrom        int                   `json:"time_from"`
    TimeTo          int                   `json:"time_to"`
    CalculationType model.CalculationType `json:"calculation_type"`
    ValueMinutes    int                   `json:"value_minutes"`
    MinWorkMinutes  *int                  `json:"min_work_minutes,omitempty"`
    AppliesOnHoliday bool                 `json:"applies_on_holiday"`
}

// List handles GET /api/v1/day-plans
func (h *DayPlanHandler) List(w http.ResponseWriter, r *http.Request) {
    tenantID, ok := middleware.TenantFromContext(r.Context())
    if !ok {
        http.Error(w, "tenant required", http.StatusBadRequest)
        return
    }

    plans, err := h.service.List(r.Context(), tenantID)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    respondJSON(w, http.StatusOK, plans)
}

// Get handles GET /api/v1/day-plans/{id}
func (h *DayPlanHandler) Get(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    id, err := uuid.Parse(idStr)
    if err != nil {
        http.Error(w, "invalid day plan id", http.StatusBadRequest)
        return
    }

    plan, err := h.service.GetDetails(r.Context(), id)
    if err != nil {
        http.Error(w, err.Error(), http.StatusNotFound)
        return
    }

    respondJSON(w, http.StatusOK, plan)
}

// Create handles POST /api/v1/day-plans
func (h *DayPlanHandler) Create(w http.ResponseWriter, r *http.Request) {
    tenantID, ok := middleware.TenantFromContext(r.Context())
    if !ok {
        http.Error(w, "tenant required", http.StatusBadRequest)
        return
    }

    var req CreateDayPlanRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request body", http.StatusBadRequest)
        return
    }

    input := service.CreateDayPlanInput{
        TenantID:     tenantID,
        Code:         req.Code,
        Name:         req.Name,
        Description:  req.Description,
        PlanType:     req.PlanType,
        ComeFrom:     req.ComeFrom,
        ComeTo:       req.ComeTo,
        GoFrom:       req.GoFrom,
        GoTo:         req.GoTo,
        CoreStart:    req.CoreStart,
        CoreEnd:      req.CoreEnd,
        RegularHours: req.RegularHours,
    }

    plan, err := h.service.Create(r.Context(), input)
    if err != nil {
        status := http.StatusInternalServerError
        if err == service.ErrDayPlanCodeExists {
            status = http.StatusConflict
        }
        http.Error(w, err.Error(), status)
        return
    }

    respondJSON(w, http.StatusCreated, plan)
}

// Copy handles POST /api/v1/day-plans/{id}/copy
func (h *DayPlanHandler) Copy(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    id, err := uuid.Parse(idStr)
    if err != nil {
        http.Error(w, "invalid day plan id", http.StatusBadRequest)
        return
    }

    var req CopyDayPlanRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request body", http.StatusBadRequest)
        return
    }

    plan, err := h.service.Copy(r.Context(), id, req.NewCode, req.NewName)
    if err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    respondJSON(w, http.StatusCreated, plan)
}

// AddBreak handles POST /api/v1/day-plans/{id}/breaks
func (h *DayPlanHandler) AddBreak(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    planID, err := uuid.Parse(idStr)
    if err != nil {
        http.Error(w, "invalid day plan id", http.StatusBadRequest)
        return
    }

    var req AddBreakRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request body", http.StatusBadRequest)
        return
    }

    b := &model.DayPlanBreak{
        BreakType:        req.BreakType,
        StartTime:        req.StartTime,
        EndTime:          req.EndTime,
        Duration:         req.Duration,
        AfterWorkMinutes: req.AfterWorkMinutes,
        AutoDeduct:       req.AutoDeduct,
        IsPaid:           req.IsPaid,
    }

    if err := h.service.AddBreak(r.Context(), planID, b); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    respondJSON(w, http.StatusCreated, b)
}

// Additional handlers for Update, Delete, DeleteBreak, AddBonus, DeleteBonus...
```

## API Endpoints

- `GET /api/v1/day-plans` - List all day plans
- `POST /api/v1/day-plans` - Create day plan
- `GET /api/v1/day-plans/{id}` - Get day plan with breaks/bonuses
- `PUT /api/v1/day-plans/{id}` - Update day plan
- `DELETE /api/v1/day-plans/{id}` - Delete day plan
- `POST /api/v1/day-plans/{id}/copy` - Copy day plan
- `POST /api/v1/day-plans/{id}/breaks` - Add break
- `DELETE /api/v1/day-plans/{id}/breaks/{breakId}` - Delete break
- `POST /api/v1/day-plans/{id}/bonuses` - Add bonus
- `DELETE /api/v1/day-plans/{id}/bonuses/{bonusId}` - Delete bonus

## Unit Tests

**File**: `apps/api/internal/handler/dayplan_test.go`

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

    "terp/apps/api/internal/model"
    "terp/apps/api/internal/service"
)

type MockDayPlanService struct {
    mock.Mock
}

func (m *MockDayPlanService) List(ctx context.Context, tenantID uuid.UUID) ([]model.DayPlan, error) {
    args := m.Called(ctx, tenantID)
    return args.Get(0).([]model.DayPlan), args.Error(1)
}

func (m *MockDayPlanService) GetDetails(ctx context.Context, id uuid.UUID) (*model.DayPlan, error) {
    args := m.Called(ctx, id)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.DayPlan), args.Error(1)
}

func (m *MockDayPlanService) Create(ctx context.Context, input service.CreateDayPlanInput) (*model.DayPlan, error) {
    args := m.Called(ctx, input)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.DayPlan), args.Error(1)
}

func (m *MockDayPlanService) Update(ctx context.Context, plan *model.DayPlan) error {
    args := m.Called(ctx, plan)
    return args.Error(0)
}

func (m *MockDayPlanService) Delete(ctx context.Context, id uuid.UUID) error {
    args := m.Called(ctx, id)
    return args.Error(0)
}

func (m *MockDayPlanService) Copy(ctx context.Context, id uuid.UUID, newCode, newName string) (*model.DayPlan, error) {
    args := m.Called(ctx, id, newCode, newName)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.DayPlan), args.Error(1)
}

func (m *MockDayPlanService) AddBreak(ctx context.Context, planID uuid.UUID, b *model.DayPlanBreak) error {
    args := m.Called(ctx, planID, b)
    return args.Error(0)
}

func (m *MockDayPlanService) DeleteBreak(ctx context.Context, breakID uuid.UUID) error {
    args := m.Called(ctx, breakID)
    return args.Error(0)
}

func (m *MockDayPlanService) AddBonus(ctx context.Context, planID uuid.UUID, bonus *model.DayPlanBonus) error {
    args := m.Called(ctx, planID, bonus)
    return args.Error(0)
}

func (m *MockDayPlanService) DeleteBonus(ctx context.Context, bonusID uuid.UUID) error {
    args := m.Called(ctx, bonusID)
    return args.Error(0)
}

func TestDayPlanHandler_Create_Success(t *testing.T) {
    mockSvc := new(MockDayPlanService)
    h := NewDayPlanHandler(mockSvc)

    tenantID := uuid.New()
    plan := &model.DayPlan{
        ID:   uuid.New(),
        Code: "PLAN-001",
        Name: "Standard Day",
    }

    mockSvc.On("Create", mock.Anything, mock.MatchedBy(func(i service.CreateDayPlanInput) bool {
        return i.Code == "PLAN-001" && i.Name == "Standard Day"
    })).Return(plan, nil)

    body := `{"code":"PLAN-001","name":"Standard Day","plan_type":"FIXED","regular_hours":480}`
    req := httptest.NewRequest("POST", "/day-plans", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusCreated, rr.Code)
}

func TestDayPlanHandler_Create_InvalidBody(t *testing.T) {
    mockSvc := new(MockDayPlanService)
    h := NewDayPlanHandler(mockSvc)

    req := httptest.NewRequest("POST", "/day-plans", bytes.NewBufferString("invalid"))
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDayPlanHandler_Create_CodeExists(t *testing.T) {
    mockSvc := new(MockDayPlanService)
    h := NewDayPlanHandler(mockSvc)

    mockSvc.On("Create", mock.Anything, mock.Anything).Return(nil, service.ErrDayPlanCodeExists)

    body := `{"code":"PLAN-001","name":"Standard Day","plan_type":"FIXED","regular_hours":480}`
    req := httptest.NewRequest("POST", "/day-plans", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusConflict, rr.Code)
}

func TestDayPlanHandler_Get_Success(t *testing.T) {
    mockSvc := new(MockDayPlanService)
    h := NewDayPlanHandler(mockSvc)

    id := uuid.New()
    plan := &model.DayPlan{ID: id, Code: "PLAN-001", Name: "Standard Day"}
    mockSvc.On("GetDetails", mock.Anything, id).Return(plan, nil)

    req := httptest.NewRequest("GET", "/day-plans/"+id.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Get(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestDayPlanHandler_Get_InvalidID(t *testing.T) {
    mockSvc := new(MockDayPlanService)
    h := NewDayPlanHandler(mockSvc)

    req := httptest.NewRequest("GET", "/day-plans/invalid", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Get(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDayPlanHandler_Get_NotFound(t *testing.T) {
    mockSvc := new(MockDayPlanService)
    h := NewDayPlanHandler(mockSvc)

    id := uuid.New()
    mockSvc.On("GetDetails", mock.Anything, id).Return(nil, service.ErrDayPlanNotFound)

    req := httptest.NewRequest("GET", "/day-plans/"+id.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Get(rr, req)

    assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestDayPlanHandler_List_Success(t *testing.T) {
    mockSvc := new(MockDayPlanService)
    h := NewDayPlanHandler(mockSvc)

    tenantID := uuid.New()
    plans := []model.DayPlan{{Code: "PLAN-001"}, {Code: "PLAN-002"}}
    mockSvc.On("List", mock.Anything, tenantID).Return(plans, nil)

    req := httptest.NewRequest("GET", "/day-plans", nil)
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    rr := httptest.NewRecorder()

    h.List(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestDayPlanHandler_Copy_Success(t *testing.T) {
    mockSvc := new(MockDayPlanService)
    h := NewDayPlanHandler(mockSvc)

    id := uuid.New()
    copiedPlan := &model.DayPlan{ID: uuid.New(), Code: "PLAN-002", Name: "Copy of Plan"}
    mockSvc.On("Copy", mock.Anything, id, "PLAN-002", "Copy of Plan").Return(copiedPlan, nil)

    body := `{"new_code":"PLAN-002","new_name":"Copy of Plan"}`
    req := httptest.NewRequest("POST", "/day-plans/"+id.String()+"/copy", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Copy(rr, req)

    assert.Equal(t, http.StatusCreated, rr.Code)
}

func TestDayPlanHandler_Copy_InvalidID(t *testing.T) {
    mockSvc := new(MockDayPlanService)
    h := NewDayPlanHandler(mockSvc)

    body := `{"new_code":"PLAN-002","new_name":"Copy"}`
    req := httptest.NewRequest("POST", "/day-plans/invalid/copy", bytes.NewBufferString(body))
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Copy(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDayPlanHandler_Copy_InvalidBody(t *testing.T) {
    mockSvc := new(MockDayPlanService)
    h := NewDayPlanHandler(mockSvc)

    id := uuid.New()
    req := httptest.NewRequest("POST", "/day-plans/"+id.String()+"/copy", bytes.NewBufferString("invalid"))
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Copy(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDayPlanHandler_AddBreak_Success(t *testing.T) {
    mockSvc := new(MockDayPlanService)
    h := NewDayPlanHandler(mockSvc)

    planID := uuid.New()
    mockSvc.On("AddBreak", mock.Anything, planID, mock.AnythingOfType("*model.DayPlanBreak")).Return(nil)

    body := `{"break_type":"FIXED","duration":30,"auto_deduct":true,"is_paid":true}`
    req := httptest.NewRequest("POST", "/day-plans/"+planID.String()+"/breaks", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", planID.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.AddBreak(rr, req)

    assert.Equal(t, http.StatusCreated, rr.Code)
}

func TestDayPlanHandler_AddBreak_InvalidBody(t *testing.T) {
    mockSvc := new(MockDayPlanService)
    h := NewDayPlanHandler(mockSvc)

    planID := uuid.New()
    req := httptest.NewRequest("POST", "/day-plans/"+planID.String()+"/breaks", bytes.NewBufferString("invalid"))
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", planID.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.AddBreak(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDayPlanHandler_AddBreak_InvalidPlanID(t *testing.T) {
    mockSvc := new(MockDayPlanService)
    h := NewDayPlanHandler(mockSvc)

    body := `{"break_type":"FIXED","duration":30}`
    req := httptest.NewRequest("POST", "/day-plans/invalid/breaks", bytes.NewBufferString(body))
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.AddBreak(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] `make lint` passes
- [ ] CRUD endpoints work correctly
- [ ] Copy endpoint duplicates plan with breaks/bonuses
- [ ] Break/bonus management endpoints work
- [ ] Unit tests with mocked service
- [ ] Tests cover all HTTP methods and error cases
