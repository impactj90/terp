# TICKET-044: Create Week Plan Service + Handler

**Type**: Service/Handler
**Effort**: S
**Sprint**: 7 - Week Plans
**Dependencies**: TICKET-043

## Description

Create the WeekPlan service with validation and HTTP handler.

## Files to Create

- `apps/api/internal/service/weekplan.go`
- `apps/api/internal/handler/weekplan.go`

## Implementation

### Service

```go
package service

var (
    ErrWeekPlanNotFound   = errors.New("week plan not found")
    ErrWeekPlanCodeExists = errors.New("week plan code already exists")
    ErrInvalidDayPlan     = errors.New("invalid day plan reference")
)

type CreateWeekPlanInput struct {
    TenantID        uuid.UUID
    Code            string
    Name            string
    Description     string
    MondayPlanID    *uuid.UUID
    TuesdayPlanID   *uuid.UUID
    WednesdayPlanID *uuid.UUID
    ThursdayPlanID  *uuid.UUID
    FridayPlanID    *uuid.UUID
    SaturdayPlanID  *uuid.UUID
    SundayPlanID    *uuid.UUID
}

type WeekPlanService interface {
    Create(ctx context.Context, input CreateWeekPlanInput) (*model.WeekPlan, error)
    GetByID(ctx context.Context, id uuid.UUID) (*model.WeekPlan, error)
    GetDetails(ctx context.Context, id uuid.UUID) (*model.WeekPlan, error)
    Update(ctx context.Context, plan *model.WeekPlan) error
    Delete(ctx context.Context, id uuid.UUID) error
    List(ctx context.Context, tenantID uuid.UUID) ([]model.WeekPlan, error)
}

func (s *weekPlanService) Create(ctx context.Context, input CreateWeekPlanInput) (*model.WeekPlan, error) {
    // Check code uniqueness
    existing, _ := s.repo.GetByCode(ctx, input.TenantID, input.Code)
    if existing != nil {
        return nil, ErrWeekPlanCodeExists
    }

    // Validate all day plan IDs exist and belong to tenant
    dayPlanIDs := []*uuid.UUID{
        input.MondayPlanID, input.TuesdayPlanID, input.WednesdayPlanID,
        input.ThursdayPlanID, input.FridayPlanID, input.SaturdayPlanID,
        input.SundayPlanID,
    }
    for _, id := range dayPlanIDs {
        if id != nil {
            plan, err := s.dayPlanRepo.GetByID(ctx, *id)
            if err != nil || plan.TenantID != input.TenantID {
                return nil, ErrInvalidDayPlan
            }
        }
    }

    weekPlan := &model.WeekPlan{
        TenantID:        input.TenantID,
        Code:            input.Code,
        Name:            input.Name,
        Description:     input.Description,
        MondayPlanID:    input.MondayPlanID,
        TuesdayPlanID:   input.TuesdayPlanID,
        WednesdayPlanID: input.WednesdayPlanID,
        ThursdayPlanID:  input.ThursdayPlanID,
        FridayPlanID:    input.FridayPlanID,
        SaturdayPlanID:  input.SaturdayPlanID,
        SundayPlanID:    input.SundayPlanID,
        IsActive:        true,
    }

    if err := s.repo.Create(ctx, weekPlan); err != nil {
        return nil, err
    }

    return weekPlan, nil
}
```

### Handler

```go
// API Endpoints:
// GET /api/v1/week-plans - List
// POST /api/v1/week-plans - Create
// GET /api/v1/week-plans/{id} - Get with day plans
// PUT /api/v1/week-plans/{id} - Update
// DELETE /api/v1/week-plans/{id} - Delete
```

## Unit Tests

**File**: `apps/api/internal/handler/weekplan_test.go`

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

type MockWeekPlanService struct {
    mock.Mock
}

func (m *MockWeekPlanService) Create(ctx context.Context, input service.CreateWeekPlanInput) (*model.WeekPlan, error) {
    args := m.Called(ctx, input)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.WeekPlan), args.Error(1)
}

func (m *MockWeekPlanService) GetByID(ctx context.Context, id uuid.UUID) (*model.WeekPlan, error) {
    args := m.Called(ctx, id)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.WeekPlan), args.Error(1)
}

func (m *MockWeekPlanService) GetDetails(ctx context.Context, id uuid.UUID) (*model.WeekPlan, error) {
    args := m.Called(ctx, id)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.WeekPlan), args.Error(1)
}

func (m *MockWeekPlanService) Update(ctx context.Context, plan *model.WeekPlan) error {
    args := m.Called(ctx, plan)
    return args.Error(0)
}

func (m *MockWeekPlanService) Delete(ctx context.Context, id uuid.UUID) error {
    args := m.Called(ctx, id)
    return args.Error(0)
}

func (m *MockWeekPlanService) List(ctx context.Context, tenantID uuid.UUID) ([]model.WeekPlan, error) {
    args := m.Called(ctx, tenantID)
    return args.Get(0).([]model.WeekPlan), args.Error(1)
}

func TestWeekPlanHandler_Create_Success(t *testing.T) {
    mockSvc := new(MockWeekPlanService)
    h := NewWeekPlanHandler(mockSvc)

    tenantID := uuid.New()
    mondayPlanID := uuid.New()
    weekPlan := &model.WeekPlan{
        ID:           uuid.New(),
        TenantID:     tenantID,
        Code:         "WP01",
        Name:         "Standard Week",
        MondayPlanID: &mondayPlanID,
    }

    mockSvc.On("Create", mock.Anything, mock.MatchedBy(func(i service.CreateWeekPlanInput) bool {
        return i.Code == "WP01" && i.TenantID == tenantID
    })).Return(weekPlan, nil)

    body := `{"code":"WP01","name":"Standard Week","monday_plan_id":"` + mondayPlanID.String() + `"}`
    req := httptest.NewRequest("POST", "/week-plans", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusCreated, rr.Code)
    var result model.WeekPlan
    json.Unmarshal(rr.Body.Bytes(), &result)
    assert.Equal(t, "WP01", result.Code)
}

func TestWeekPlanHandler_Create_InvalidBody(t *testing.T) {
    mockSvc := new(MockWeekPlanService)
    h := NewWeekPlanHandler(mockSvc)

    req := httptest.NewRequest("POST", "/week-plans", bytes.NewBufferString("invalid"))
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestWeekPlanHandler_Create_CodeExists(t *testing.T) {
    mockSvc := new(MockWeekPlanService)
    h := NewWeekPlanHandler(mockSvc)

    mockSvc.On("Create", mock.Anything, mock.Anything).Return(nil, service.ErrWeekPlanCodeExists)

    body := `{"code":"WP01","name":"Standard Week"}`
    req := httptest.NewRequest("POST", "/week-plans", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusConflict, rr.Code)
}

func TestWeekPlanHandler_Create_InvalidDayPlan(t *testing.T) {
    mockSvc := new(MockWeekPlanService)
    h := NewWeekPlanHandler(mockSvc)

    mockSvc.On("Create", mock.Anything, mock.Anything).Return(nil, service.ErrInvalidDayPlan)

    body := `{"code":"WP01","name":"Standard Week","monday_plan_id":"` + uuid.New().String() + `"}`
    req := httptest.NewRequest("POST", "/week-plans", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestWeekPlanHandler_GetByID_Success(t *testing.T) {
    mockSvc := new(MockWeekPlanService)
    h := NewWeekPlanHandler(mockSvc)

    id := uuid.New()
    weekPlan := &model.WeekPlan{ID: id, Code: "WP01", Name: "Standard Week"}
    mockSvc.On("GetDetails", mock.Anything, id).Return(weekPlan, nil)

    req := httptest.NewRequest("GET", "/week-plans/"+id.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.GetByID(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestWeekPlanHandler_GetByID_InvalidID(t *testing.T) {
    mockSvc := new(MockWeekPlanService)
    h := NewWeekPlanHandler(mockSvc)

    req := httptest.NewRequest("GET", "/week-plans/invalid", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.GetByID(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestWeekPlanHandler_GetByID_NotFound(t *testing.T) {
    mockSvc := new(MockWeekPlanService)
    h := NewWeekPlanHandler(mockSvc)

    id := uuid.New()
    mockSvc.On("GetDetails", mock.Anything, id).Return(nil, service.ErrWeekPlanNotFound)

    req := httptest.NewRequest("GET", "/week-plans/"+id.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.GetByID(rr, req)

    assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestWeekPlanHandler_List_Success(t *testing.T) {
    mockSvc := new(MockWeekPlanService)
    h := NewWeekPlanHandler(mockSvc)

    tenantID := uuid.New()
    weekPlans := []model.WeekPlan{
        {ID: uuid.New(), Code: "WP01", Name: "Standard Week"},
        {ID: uuid.New(), Code: "WP02", Name: "Alternative Week"},
    }
    mockSvc.On("List", mock.Anything, tenantID).Return(weekPlans, nil)

    req := httptest.NewRequest("GET", "/week-plans", nil)
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    rr := httptest.NewRecorder()

    h.List(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result []model.WeekPlan
    json.Unmarshal(rr.Body.Bytes(), &result)
    assert.Len(t, result, 2)
}

func TestWeekPlanHandler_Update_Success(t *testing.T) {
    mockSvc := new(MockWeekPlanService)
    h := NewWeekPlanHandler(mockSvc)

    id := uuid.New()
    weekPlan := &model.WeekPlan{ID: id, Code: "WP01", Name: "Updated Week"}
    mockSvc.On("GetByID", mock.Anything, id).Return(weekPlan, nil)
    mockSvc.On("Update", mock.Anything, mock.Anything).Return(nil)

    body := `{"name":"Updated Week","description":"Updated description"}`
    req := httptest.NewRequest("PUT", "/week-plans/"+id.String(), bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Update(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestWeekPlanHandler_Update_InvalidID(t *testing.T) {
    mockSvc := new(MockWeekPlanService)
    h := NewWeekPlanHandler(mockSvc)

    body := `{"name":"Updated"}`
    req := httptest.NewRequest("PUT", "/week-plans/invalid", bytes.NewBufferString(body))
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Update(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestWeekPlanHandler_Delete_Success(t *testing.T) {
    mockSvc := new(MockWeekPlanService)
    h := NewWeekPlanHandler(mockSvc)

    id := uuid.New()
    mockSvc.On("Delete", mock.Anything, id).Return(nil)

    req := httptest.NewRequest("DELETE", "/week-plans/"+id.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Delete(rr, req)

    assert.Equal(t, http.StatusNoContent, rr.Code)
}

func TestWeekPlanHandler_Delete_InvalidID(t *testing.T) {
    mockSvc := new(MockWeekPlanService)
    h := NewWeekPlanHandler(mockSvc)

    req := httptest.NewRequest("DELETE", "/week-plans/invalid", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Delete(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}
```

## Acceptance Criteria

- [x] `make test` passes
- [x] `make lint` passes
- [x] Validates all day plan IDs belong to tenant
- [x] Code uniqueness enforced
- [x] GetDetails returns week plan with populated day plans
- [x] Unit tests with real service (matching existing test patterns)
- [x] Tests cover all HTTP methods and error cases

## Implementation Notes

- Used real service + repository in tests (matching existing codebase patterns)
- Handler uses generated OpenAPI models for request parsing
- Added routes to main.go and routes.go
