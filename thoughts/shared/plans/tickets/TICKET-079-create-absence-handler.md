# TICKET-079: Create Absence Handler

**Type**: Handler
**Effort**: S
**Sprint**: 19 - Absence Days
**Dependencies**: TICKET-078

## Description

Create the Absence HTTP handler.

## Files to Create

- `apps/api/internal/handler/absence.go`

## Implementation

```go
package handler

type AbsenceHandler struct {
    service     service.AbsenceService
    typeService service.AbsenceTypeService
}

type CreateAbsenceRangeRequest struct {
    AbsenceTypeID uuid.UUID `json:"absence_type_id"`
    From          string    `json:"from"`     // YYYY-MM-DD
    To            string    `json:"to"`       // YYYY-MM-DD
    Duration      float64   `json:"duration"` // 1.0 or 0.5
    Notes         string    `json:"notes,omitempty"`
}

// ListTypes handles GET /api/v1/absence-types
func (h *AbsenceHandler) ListTypes(w http.ResponseWriter, r *http.Request) {
    tenantID, _ := middleware.TenantFromContext(r.Context())
    types, err := h.typeService.ListWithSystem(r.Context(), tenantID)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    respondJSON(w, http.StatusOK, types)
}

// ListByEmployee handles GET /api/v1/employees/{id}/absences
func (h *AbsenceHandler) ListByEmployee(w http.ResponseWriter, r *http.Request) {
    empIDStr := chi.URLParam(r, "id")
    employeeID, err := uuid.Parse(empIDStr)
    if err != nil {
        http.Error(w, "invalid employee id", http.StatusBadRequest)
        return
    }

    // Optional date range filters
    var from, to time.Time
    if f := r.URL.Query().Get("from"); f != "" {
        from, _ = time.Parse("2006-01-02", f)
    }
    if t := r.URL.Query().Get("to"); t != "" {
        to, _ = time.Parse("2006-01-02", t)
    }

    var absences []model.AbsenceDay
    if !from.IsZero() && !to.IsZero() {
        absences, err = h.service.GetByEmployeeDateRange(r.Context(), employeeID, from, to)
    } else {
        absences, err = h.service.ListByEmployee(r.Context(), employeeID)
    }
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    respondJSON(w, http.StatusOK, absences)
}

// CreateRange handles POST /api/v1/employees/{id}/absences
func (h *AbsenceHandler) CreateRange(w http.ResponseWriter, r *http.Request) {
    tenantID, _ := middleware.TenantFromContext(r.Context())

    empIDStr := chi.URLParam(r, "id")
    employeeID, err := uuid.Parse(empIDStr)
    if err != nil {
        http.Error(w, "invalid employee id", http.StatusBadRequest)
        return
    }

    var req CreateAbsenceRangeRequest
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

    input := service.CreateAbsenceRangeInput{
        TenantID:      tenantID,
        EmployeeID:    employeeID,
        AbsenceTypeID: req.AbsenceTypeID,
        From:          from,
        To:            to,
        Duration:      req.Duration,
        Notes:         req.Notes,
    }

    absences, err := h.service.CreateRange(r.Context(), input)
    if err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    respondJSON(w, http.StatusCreated, absences)
}

// Delete handles DELETE /api/v1/absences/{id}
func (h *AbsenceHandler) Delete(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    id, err := uuid.Parse(idStr)
    if err != nil {
        http.Error(w, "invalid absence id", http.StatusBadRequest)
        return
    }

    if err := h.service.Delete(r.Context(), id); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    w.WriteHeader(http.StatusNoContent)
}
```

## API Endpoints

- `GET /api/v1/absence-types` - List absence types
- `GET /api/v1/employees/{id}/absences` - List employee absences
- `POST /api/v1/employees/{id}/absences` - Create absence range
- `DELETE /api/v1/absences/{id}` - Delete absence

## Unit Tests

**File**: `apps/api/internal/handler/absence_test.go`

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

type MockAbsenceService struct {
    mock.Mock
}

func (m *MockAbsenceService) ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.AbsenceDay, error) {
    args := m.Called(ctx, employeeID)
    return args.Get(0).([]model.AbsenceDay), args.Error(1)
}

func (m *MockAbsenceService) GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.AbsenceDay, error) {
    args := m.Called(ctx, employeeID, from, to)
    return args.Get(0).([]model.AbsenceDay), args.Error(1)
}

func (m *MockAbsenceService) CreateRange(ctx context.Context, input service.CreateAbsenceRangeInput) ([]model.AbsenceDay, error) {
    args := m.Called(ctx, input)
    return args.Get(0).([]model.AbsenceDay), args.Error(1)
}

func (m *MockAbsenceService) Delete(ctx context.Context, id uuid.UUID) error {
    args := m.Called(ctx, id)
    return args.Error(0)
}

type MockAbsenceTypeService struct {
    mock.Mock
}

func (m *MockAbsenceTypeService) ListWithSystem(ctx context.Context, tenantID uuid.UUID) ([]model.AbsenceType, error) {
    args := m.Called(ctx, tenantID)
    return args.Get(0).([]model.AbsenceType), args.Error(1)
}

func TestAbsenceHandler_ListTypes_Success(t *testing.T) {
    mockSvc := new(MockAbsenceService)
    mockTypeSvc := new(MockAbsenceTypeService)
    h := &AbsenceHandler{service: mockSvc, typeService: mockTypeSvc}

    tenantID := uuid.New()
    types := []model.AbsenceType{{ID: uuid.New(), Name: "Vacation"}}
    mockTypeSvc.On("ListWithSystem", mock.Anything, tenantID).Return(types, nil)

    req := httptest.NewRequest("GET", "/absence-types", nil)
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    rr := httptest.NewRecorder()

    h.ListTypes(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestAbsenceHandler_ListByEmployee_Success(t *testing.T) {
    mockSvc := new(MockAbsenceService)
    mockTypeSvc := new(MockAbsenceTypeService)
    h := &AbsenceHandler{service: mockSvc, typeService: mockTypeSvc}

    employeeID := uuid.New()
    absences := []model.AbsenceDay{{ID: uuid.New(), EmployeeID: employeeID}}
    mockSvc.On("ListByEmployee", mock.Anything, employeeID).Return(absences, nil)

    req := httptest.NewRequest("GET", "/employees/"+employeeID.String()+"/absences", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", employeeID.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.ListByEmployee(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestAbsenceHandler_ListByEmployee_WithDateRange(t *testing.T) {
    mockSvc := new(MockAbsenceService)
    mockTypeSvc := new(MockAbsenceTypeService)
    h := &AbsenceHandler{service: mockSvc, typeService: mockTypeSvc}

    employeeID := uuid.New()
    from, _ := time.Parse("2006-01-02", "2024-01-01")
    to, _ := time.Parse("2006-01-02", "2024-01-31")
    absences := []model.AbsenceDay{{ID: uuid.New()}}
    mockSvc.On("GetByEmployeeDateRange", mock.Anything, employeeID, from, to).Return(absences, nil)

    req := httptest.NewRequest("GET", "/employees/"+employeeID.String()+"/absences?from=2024-01-01&to=2024-01-31", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", employeeID.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.ListByEmployee(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestAbsenceHandler_ListByEmployee_InvalidID(t *testing.T) {
    mockSvc := new(MockAbsenceService)
    mockTypeSvc := new(MockAbsenceTypeService)
    h := &AbsenceHandler{service: mockSvc, typeService: mockTypeSvc}

    req := httptest.NewRequest("GET", "/employees/invalid/absences", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.ListByEmployee(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestAbsenceHandler_CreateRange_Success(t *testing.T) {
    mockSvc := new(MockAbsenceService)
    mockTypeSvc := new(MockAbsenceTypeService)
    h := &AbsenceHandler{service: mockSvc, typeService: mockTypeSvc}

    tenantID := uuid.New()
    employeeID := uuid.New()
    absences := []model.AbsenceDay{{ID: uuid.New()}}
    mockSvc.On("CreateRange", mock.Anything, mock.MatchedBy(func(i service.CreateAbsenceRangeInput) bool {
        return i.EmployeeID == employeeID && i.TenantID == tenantID
    })).Return(absences, nil)

    body := `{"absence_type_id":"` + uuid.New().String() + `","from":"2024-01-01","to":"2024-01-05","duration":1.0}`
    req := httptest.NewRequest("POST", "/employees/"+employeeID.String()+"/absences", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", employeeID.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    rr := httptest.NewRecorder()

    h.CreateRange(rr, req)

    assert.Equal(t, http.StatusCreated, rr.Code)
}

func TestAbsenceHandler_CreateRange_InvalidDates(t *testing.T) {
    mockSvc := new(MockAbsenceService)
    mockTypeSvc := new(MockAbsenceTypeService)
    h := &AbsenceHandler{service: mockSvc, typeService: mockTypeSvc}

    employeeID := uuid.New()
    body := `{"absence_type_id":"` + uuid.New().String() + `","from":"invalid","to":"2024-01-05","duration":1.0}`
    req := httptest.NewRequest("POST", "/employees/"+employeeID.String()+"/absences", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", employeeID.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.CreateRange(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestAbsenceHandler_CreateRange_InvalidBody(t *testing.T) {
    mockSvc := new(MockAbsenceService)
    mockTypeSvc := new(MockAbsenceTypeService)
    h := &AbsenceHandler{service: mockSvc, typeService: mockTypeSvc}

    employeeID := uuid.New()
    req := httptest.NewRequest("POST", "/employees/"+employeeID.String()+"/absences", bytes.NewBufferString("invalid"))
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", employeeID.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.CreateRange(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestAbsenceHandler_Delete_Success(t *testing.T) {
    mockSvc := new(MockAbsenceService)
    mockTypeSvc := new(MockAbsenceTypeService)
    h := &AbsenceHandler{service: mockSvc, typeService: mockTypeSvc}

    id := uuid.New()
    mockSvc.On("Delete", mock.Anything, id).Return(nil)

    req := httptest.NewRequest("DELETE", "/absences/"+id.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Delete(rr, req)

    assert.Equal(t, http.StatusNoContent, rr.Code)
}

func TestAbsenceHandler_Delete_InvalidID(t *testing.T) {
    mockSvc := new(MockAbsenceService)
    mockTypeSvc := new(MockAbsenceTypeService)
    h := &AbsenceHandler{service: mockSvc, typeService: mockTypeSvc}

    req := httptest.NewRequest("DELETE", "/absences/invalid", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Delete(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] `make lint` passes
- [ ] List types includes system types
- [ ] Create range accepts date range
- [ ] Delete triggers recalculation
- [ ] Unit tests with mocked service
- [ ] Tests cover all HTTP methods and error cases
