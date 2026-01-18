# TICKET-095: Create Correction Handler

**Type**: Handler
**Effort**: S
**Sprint**: 23 - Corrections
**Dependencies**: TICKET-094

## Description

Create HTTP handlers for correction CRUD operations.

## Files to Create

- `apps/api/internal/handler/correction.go`

## Implementation

```go
package handler

import (
    "encoding/json"
    "net/http"
    "time"

    "github.com/go-chi/chi/v5"
    "github.com/google/uuid"

    "terp/apps/api/internal/model"
    "terp/apps/api/internal/service"
)

type CorrectionHandler struct {
    correctionSvc service.CorrectionService
}

func NewCorrectionHandler(correctionSvc service.CorrectionService) *CorrectionHandler {
    return &CorrectionHandler{correctionSvc: correctionSvc}
}

func (h *CorrectionHandler) Routes() chi.Router {
    r := chi.NewRouter()

    r.Post("/", h.Create)
    r.Get("/{id}", h.GetByID)
    r.Put("/{id}", h.Update)
    r.Delete("/{id}", h.Delete)
    r.Get("/employee/{employeeId}", h.ListByEmployee)
    r.Post("/{id}/approve", h.Approve)

    return r
}

type CreateCorrectionRequest struct {
    EmployeeID     string `json:"employee_id"`
    ValueDate      string `json:"value_date"`
    CorrectionType string `json:"correction_type"`
    Amount         int    `json:"amount"`
    Reason         string `json:"reason"`
}

type CorrectionResponse struct {
    ID             string  `json:"id"`
    EmployeeID     string  `json:"employee_id"`
    ValueDate      string  `json:"value_date"`
    CorrectionType string  `json:"correction_type"`
    Amount         int     `json:"amount"`
    Reason         string  `json:"reason"`
    ApprovedBy     *string `json:"approved_by,omitempty"`
    ApprovedAt     *string `json:"approved_at,omitempty"`
    CreatedBy      string  `json:"created_by"`
    CreatedAt      string  `json:"created_at"`
}

func (h *CorrectionHandler) Create(w http.ResponseWriter, r *http.Request) {
    var req CreateCorrectionRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        respondError(w, http.StatusBadRequest, "invalid request body")
        return
    }

    employeeID, err := uuid.Parse(req.EmployeeID)
    if err != nil {
        respondError(w, http.StatusBadRequest, "invalid employee ID")
        return
    }

    valueDate, err := time.Parse("2006-01-02", req.ValueDate)
    if err != nil {
        respondError(w, http.StatusBadRequest, "invalid date format")
        return
    }

    tenantID := getTenantIDFromContext(r.Context())
    userID := getUserIDFromContext(r.Context())

    correction := &model.Correction{
        TenantID:       tenantID,
        EmployeeID:     employeeID,
        ValueDate:      valueDate,
        CorrectionType: model.CorrectionType(req.CorrectionType),
        Amount:         req.Amount,
        Reason:         req.Reason,
        CreatedBy:      userID,
    }

    if err := h.correctionSvc.Create(r.Context(), correction); err != nil {
        respondError(w, http.StatusBadRequest, err.Error())
        return
    }

    respondJSON(w, http.StatusCreated, toCorrectionResponse(correction))
}

func (h *CorrectionHandler) GetByID(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    if err != nil {
        respondError(w, http.StatusBadRequest, "invalid ID")
        return
    }

    correction, err := h.correctionSvc.GetByID(r.Context(), id)
    if err != nil {
        if err == service.ErrCorrectionNotFound {
            respondError(w, http.StatusNotFound, "correction not found")
            return
        }
        respondError(w, http.StatusInternalServerError, err.Error())
        return
    }

    respondJSON(w, http.StatusOK, toCorrectionResponse(correction))
}

func (h *CorrectionHandler) Update(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    if err != nil {
        respondError(w, http.StatusBadRequest, "invalid ID")
        return
    }

    var req CreateCorrectionRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        respondError(w, http.StatusBadRequest, "invalid request body")
        return
    }

    correction, err := h.correctionSvc.GetByID(r.Context(), id)
    if err != nil {
        respondError(w, http.StatusNotFound, "correction not found")
        return
    }

    correction.CorrectionType = model.CorrectionType(req.CorrectionType)
    correction.Amount = req.Amount
    correction.Reason = req.Reason

    if err := h.correctionSvc.Update(r.Context(), correction); err != nil {
        respondError(w, http.StatusBadRequest, err.Error())
        return
    }

    respondJSON(w, http.StatusOK, toCorrectionResponse(correction))
}

func (h *CorrectionHandler) Delete(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    if err != nil {
        respondError(w, http.StatusBadRequest, "invalid ID")
        return
    }

    if err := h.correctionSvc.Delete(r.Context(), id); err != nil {
        if err == service.ErrCorrectionNotFound {
            respondError(w, http.StatusNotFound, "correction not found")
            return
        }
        respondError(w, http.StatusInternalServerError, err.Error())
        return
    }

    w.WriteHeader(http.StatusNoContent)
}

func (h *CorrectionHandler) ListByEmployee(w http.ResponseWriter, r *http.Request) {
    employeeID, err := uuid.Parse(chi.URLParam(r, "employeeId"))
    if err != nil {
        respondError(w, http.StatusBadRequest, "invalid employee ID")
        return
    }

    from, _ := time.Parse("2006-01-02", r.URL.Query().Get("from"))
    to, _ := time.Parse("2006-01-02", r.URL.Query().Get("to"))

    if from.IsZero() {
        from = time.Now().AddDate(0, -1, 0)
    }
    if to.IsZero() {
        to = time.Now()
    }

    corrections, err := h.correctionSvc.ListByEmployee(r.Context(), employeeID, from, to)
    if err != nil {
        respondError(w, http.StatusInternalServerError, err.Error())
        return
    }

    response := make([]CorrectionResponse, len(corrections))
    for i, c := range corrections {
        response[i] = *toCorrectionResponse(&c)
    }

    respondJSON(w, http.StatusOK, response)
}

func (h *CorrectionHandler) Approve(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    if err != nil {
        respondError(w, http.StatusBadRequest, "invalid ID")
        return
    }

    userID := getUserIDFromContext(r.Context())

    if err := h.correctionSvc.Approve(r.Context(), id, userID); err != nil {
        respondError(w, http.StatusBadRequest, err.Error())
        return
    }

    respondJSON(w, http.StatusOK, map[string]string{"status": "approved"})
}

func toCorrectionResponse(c *model.Correction) *CorrectionResponse {
    resp := &CorrectionResponse{
        ID:             c.ID.String(),
        EmployeeID:     c.EmployeeID.String(),
        ValueDate:      c.ValueDate.Format("2006-01-02"),
        CorrectionType: string(c.CorrectionType),
        Amount:         c.Amount,
        Reason:         c.Reason,
        CreatedBy:      c.CreatedBy.String(),
        CreatedAt:      c.CreatedAt.Format(time.RFC3339),
    }
    if c.ApprovedBy != nil {
        s := c.ApprovedBy.String()
        resp.ApprovedBy = &s
    }
    if c.ApprovedAt != nil {
        s := c.ApprovedAt.Format(time.RFC3339)
        resp.ApprovedAt = &s
    }
    return resp
}
```

## Unit Tests

**File**: `apps/api/internal/handler/correction_test.go`

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
    "github.com/stretchr/testify/require"

    "terp/apps/api/internal/model"
    "terp/apps/api/internal/service"
)

type MockCorrectionService struct {
    mock.Mock
}

func (m *MockCorrectionService) Create(ctx context.Context, correction *model.Correction) error {
    args := m.Called(ctx, correction)
    return args.Error(0)
}

func (m *MockCorrectionService) GetByID(ctx context.Context, id uuid.UUID) (*model.Correction, error) {
    args := m.Called(ctx, id)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.Correction), args.Error(1)
}

func (m *MockCorrectionService) Update(ctx context.Context, correction *model.Correction) error {
    args := m.Called(ctx, correction)
    return args.Error(0)
}

func (m *MockCorrectionService) Delete(ctx context.Context, id uuid.UUID) error {
    args := m.Called(ctx, id)
    return args.Error(0)
}

func (m *MockCorrectionService) ListByEmployee(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.Correction, error) {
    args := m.Called(ctx, employeeID, from, to)
    return args.Get(0).([]model.Correction), args.Error(1)
}

func (m *MockCorrectionService) Approve(ctx context.Context, id, userID uuid.UUID) error {
    args := m.Called(ctx, id, userID)
    return args.Error(0)
}

func TestCorrectionHandler_Create_Success(t *testing.T) {
    mockSvc := new(MockCorrectionService)
    h := NewCorrectionHandler(mockSvc)

    tenantID := uuid.New()
    userID := uuid.New()
    employeeID := uuid.New()

    mockSvc.On("Create", mock.Anything, mock.MatchedBy(func(c *model.Correction) bool {
        return c.EmployeeID == employeeID && c.Amount == 3600
    })).Return(nil)

    body := `{"employee_id":"` + employeeID.String() + `","value_date":"2024-01-15","correction_type":"OVERTIME","amount":3600,"reason":"Manual adjustment"}`
    req := httptest.NewRequest("POST", "/corrections", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    req = req.WithContext(context.WithValue(req.Context(), "user_id", userID))
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusCreated, rr.Code)
}

func TestCorrectionHandler_Create_InvalidBody(t *testing.T) {
    mockSvc := new(MockCorrectionService)
    h := NewCorrectionHandler(mockSvc)

    req := httptest.NewRequest("POST", "/corrections", bytes.NewBufferString("invalid"))
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    req = req.WithContext(context.WithValue(req.Context(), "user_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestCorrectionHandler_Create_InvalidEmployeeID(t *testing.T) {
    mockSvc := new(MockCorrectionService)
    h := NewCorrectionHandler(mockSvc)

    body := `{"employee_id":"invalid","value_date":"2024-01-15","correction_type":"OVERTIME","amount":3600}`
    req := httptest.NewRequest("POST", "/corrections", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    req = req.WithContext(context.WithValue(req.Context(), "user_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestCorrectionHandler_Create_InvalidDateFormat(t *testing.T) {
    mockSvc := new(MockCorrectionService)
    h := NewCorrectionHandler(mockSvc)

    employeeID := uuid.New()
    body := `{"employee_id":"` + employeeID.String() + `","value_date":"invalid-date","correction_type":"OVERTIME","amount":3600}`
    req := httptest.NewRequest("POST", "/corrections", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    req = req.WithContext(context.WithValue(req.Context(), "user_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestCorrectionHandler_GetByID_Success(t *testing.T) {
    mockSvc := new(MockCorrectionService)
    h := NewCorrectionHandler(mockSvc)

    id := uuid.New()
    employeeID := uuid.New()
    userID := uuid.New()
    correction := &model.Correction{
        ID:             id,
        EmployeeID:     employeeID,
        CorrectionType: model.CorrectionTypeOvertime,
        Amount:         3600,
        CreatedBy:      userID,
    }

    mockSvc.On("GetByID", mock.Anything, id).Return(correction, nil)

    req := httptest.NewRequest("GET", "/corrections/"+id.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.GetByID(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestCorrectionHandler_GetByID_InvalidID(t *testing.T) {
    mockSvc := new(MockCorrectionService)
    h := NewCorrectionHandler(mockSvc)

    req := httptest.NewRequest("GET", "/corrections/invalid", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.GetByID(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestCorrectionHandler_GetByID_NotFound(t *testing.T) {
    mockSvc := new(MockCorrectionService)
    h := NewCorrectionHandler(mockSvc)

    id := uuid.New()
    mockSvc.On("GetByID", mock.Anything, id).Return(nil, service.ErrCorrectionNotFound)

    req := httptest.NewRequest("GET", "/corrections/"+id.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.GetByID(rr, req)

    assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestCorrectionHandler_Update_Success(t *testing.T) {
    mockSvc := new(MockCorrectionService)
    h := NewCorrectionHandler(mockSvc)

    id := uuid.New()
    employeeID := uuid.New()
    userID := uuid.New()
    correction := &model.Correction{
        ID:             id,
        EmployeeID:     employeeID,
        CorrectionType: model.CorrectionTypeOvertime,
        Amount:         3600,
        CreatedBy:      userID,
    }

    mockSvc.On("GetByID", mock.Anything, id).Return(correction, nil)
    mockSvc.On("Update", mock.Anything, mock.Anything).Return(nil)

    body := `{"employee_id":"` + employeeID.String() + `","value_date":"2024-01-15","correction_type":"OVERTIME","amount":7200,"reason":"Updated"}`
    req := httptest.NewRequest("PUT", "/corrections/"+id.String(), bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Update(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestCorrectionHandler_Update_InvalidID(t *testing.T) {
    mockSvc := new(MockCorrectionService)
    h := NewCorrectionHandler(mockSvc)

    body := `{"correction_type":"OVERTIME","amount":7200}`
    req := httptest.NewRequest("PUT", "/corrections/invalid", bytes.NewBufferString(body))
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Update(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestCorrectionHandler_Delete_Success(t *testing.T) {
    mockSvc := new(MockCorrectionService)
    h := NewCorrectionHandler(mockSvc)

    id := uuid.New()
    mockSvc.On("Delete", mock.Anything, id).Return(nil)

    req := httptest.NewRequest("DELETE", "/corrections/"+id.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Delete(rr, req)

    assert.Equal(t, http.StatusNoContent, rr.Code)
}

func TestCorrectionHandler_Delete_NotFound(t *testing.T) {
    mockSvc := new(MockCorrectionService)
    h := NewCorrectionHandler(mockSvc)

    id := uuid.New()
    mockSvc.On("Delete", mock.Anything, id).Return(service.ErrCorrectionNotFound)

    req := httptest.NewRequest("DELETE", "/corrections/"+id.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Delete(rr, req)

    assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestCorrectionHandler_ListByEmployee_Success(t *testing.T) {
    mockSvc := new(MockCorrectionService)
    h := NewCorrectionHandler(mockSvc)

    employeeID := uuid.New()
    corrections := []model.Correction{
        {ID: uuid.New(), EmployeeID: employeeID, Amount: 3600},
        {ID: uuid.New(), EmployeeID: employeeID, Amount: 7200},
    }

    mockSvc.On("ListByEmployee", mock.Anything, employeeID, mock.Anything, mock.Anything).Return(corrections, nil)

    req := httptest.NewRequest("GET", "/corrections/employee/"+employeeID.String()+"?from=2024-01-01&to=2024-01-31", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("employeeId", employeeID.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.ListByEmployee(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result []CorrectionResponse
    json.Unmarshal(rr.Body.Bytes(), &result)
    assert.Len(t, result, 2)
}

func TestCorrectionHandler_ListByEmployee_InvalidID(t *testing.T) {
    mockSvc := new(MockCorrectionService)
    h := NewCorrectionHandler(mockSvc)

    req := httptest.NewRequest("GET", "/corrections/employee/invalid", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("employeeId", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.ListByEmployee(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestCorrectionHandler_Approve_Success(t *testing.T) {
    mockSvc := new(MockCorrectionService)
    h := NewCorrectionHandler(mockSvc)

    id := uuid.New()
    userID := uuid.New()

    mockSvc.On("Approve", mock.Anything, id, userID).Return(nil)

    req := httptest.NewRequest("POST", "/corrections/"+id.String()+"/approve", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    req = req.WithContext(context.WithValue(req.Context(), "user_id", userID))
    rr := httptest.NewRecorder()

    h.Approve(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result map[string]string
    json.Unmarshal(rr.Body.Bytes(), &result)
    assert.Equal(t, "approved", result["status"])
}

func TestCorrectionHandler_Approve_InvalidID(t *testing.T) {
    mockSvc := new(MockCorrectionService)
    h := NewCorrectionHandler(mockSvc)

    req := httptest.NewRequest("POST", "/corrections/invalid/approve", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    req = req.WithContext(context.WithValue(req.Context(), "user_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.Approve(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestCorrectionHandler_Approve_AlreadyApproved(t *testing.T) {
    mockSvc := new(MockCorrectionService)
    h := NewCorrectionHandler(mockSvc)

    id := uuid.New()
    userID := uuid.New()

    mockSvc.On("Approve", mock.Anything, id, userID).Return(service.ErrCorrectionAlreadyApproved)

    req := httptest.NewRequest("POST", "/corrections/"+id.String()+"/approve", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    req = req.WithContext(context.WithValue(req.Context(), "user_id", userID))
    rr := httptest.NewRecorder()

    h.Approve(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] `make lint` passes
- [ ] POST creates correction
- [ ] GET returns correction by ID
- [ ] PUT updates unapproved correction
- [ ] DELETE removes correction
- [ ] POST approve marks as approved
- [ ] Unit tests with mocked service
- [ ] Tests cover all HTTP methods and error cases
