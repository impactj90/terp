# TICKET-005: Create Tenant Handler

**Type**: Handler
**Effort**: S
**Sprint**: 1 - Multi-Tenant Foundation
**Dependencies**: TICKET-004

## Description

Create the Tenant HTTP handler with REST endpoints.

## Files to Create

- `apps/api/internal/handler/tenant.go`

## Implementation

```go
package handler

import (
    "encoding/json"
    "net/http"

    "github.com/go-chi/chi/v5"
    "github.com/google/uuid"

    "terp/apps/api/internal/service"
)

type TenantHandler struct {
    service service.TenantService
}

func NewTenantHandler(s service.TenantService) *TenantHandler {
    return &TenantHandler{service: s}
}

type CreateTenantRequest struct {
    Name string `json:"name"`
    Slug string `json:"slug"`
}

type UpdateTenantRequest struct {
    Name     string `json:"name"`
    IsActive *bool  `json:"is_active,omitempty"`
}

func (h *TenantHandler) List(w http.ResponseWriter, r *http.Request) {
    activeOnly := r.URL.Query().Get("active") == "true"

    tenants, err := h.service.List(r.Context(), activeOnly)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    respondJSON(w, http.StatusOK, tenants)
}

func (h *TenantHandler) Get(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    id, err := uuid.Parse(idStr)
    if err != nil {
        http.Error(w, "invalid tenant id", http.StatusBadRequest)
        return
    }

    tenant, err := h.service.GetByID(r.Context(), id)
    if err != nil {
        http.Error(w, err.Error(), http.StatusNotFound)
        return
    }

    respondJSON(w, http.StatusOK, tenant)
}

func (h *TenantHandler) Create(w http.ResponseWriter, r *http.Request) {
    var req CreateTenantRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request body", http.StatusBadRequest)
        return
    }

    tenant, err := h.service.Create(r.Context(), req.Name, req.Slug)
    if err != nil {
        status := http.StatusInternalServerError
        if err == service.ErrTenantSlugExists || err == service.ErrInvalidTenantSlug {
            status = http.StatusBadRequest
        }
        http.Error(w, err.Error(), status)
        return
    }

    respondJSON(w, http.StatusCreated, tenant)
}

func (h *TenantHandler) Update(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    id, err := uuid.Parse(idStr)
    if err != nil {
        http.Error(w, "invalid tenant id", http.StatusBadRequest)
        return
    }

    tenant, err := h.service.GetByID(r.Context(), id)
    if err != nil {
        http.Error(w, err.Error(), http.StatusNotFound)
        return
    }

    var req UpdateTenantRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request body", http.StatusBadRequest)
        return
    }

    if req.Name != "" {
        tenant.Name = req.Name
    }
    if req.IsActive != nil {
        tenant.IsActive = *req.IsActive
    }

    if err := h.service.Update(r.Context(), tenant); err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    respondJSON(w, http.StatusOK, tenant)
}

func (h *TenantHandler) Delete(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    id, err := uuid.Parse(idStr)
    if err != nil {
        http.Error(w, "invalid tenant id", http.StatusBadRequest)
        return
    }

    if err := h.service.Delete(r.Context(), id); err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    w.WriteHeader(http.StatusNoContent)
}

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(data)
}
```

## Unit Tests

**File**: `apps/api/internal/handler/tenant_test.go`

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

type MockTenantService struct {
    mock.Mock
}

func (m *MockTenantService) Create(ctx context.Context, name, slug string) (*model.Tenant, error) {
    args := m.Called(ctx, name, slug)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.Tenant), args.Error(1)
}

func (m *MockTenantService) GetByID(ctx context.Context, id uuid.UUID) (*model.Tenant, error) {
    args := m.Called(ctx, id)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.Tenant), args.Error(1)
}

func (m *MockTenantService) GetBySlug(ctx context.Context, slug string) (*model.Tenant, error) {
    args := m.Called(ctx, slug)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.Tenant), args.Error(1)
}

func (m *MockTenantService) Update(ctx context.Context, tenant *model.Tenant) error {
    args := m.Called(ctx, tenant)
    return args.Error(0)
}

func (m *MockTenantService) List(ctx context.Context, activeOnly bool) ([]model.Tenant, error) {
    args := m.Called(ctx, activeOnly)
    return args.Get(0).([]model.Tenant), args.Error(1)
}

func (m *MockTenantService) Delete(ctx context.Context, id uuid.UUID) error {
    args := m.Called(ctx, id)
    return args.Error(0)
}

func TestTenantHandler_Create_Success(t *testing.T) {
    mockSvc := new(MockTenantService)
    h := NewTenantHandler(mockSvc)

    tenant := &model.Tenant{ID: uuid.New(), Name: "Test", Slug: "test"}
    mockSvc.On("Create", mock.Anything, "Test", "test").Return(tenant, nil)

    body := `{"name": "Test", "slug": "test"}`
    req := httptest.NewRequest("POST", "/tenants", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusCreated, rr.Code)
    var result model.Tenant
    json.Unmarshal(rr.Body.Bytes(), &result)
    assert.Equal(t, "Test", result.Name)
}

func TestTenantHandler_Create_InvalidBody(t *testing.T) {
    mockSvc := new(MockTenantService)
    h := NewTenantHandler(mockSvc)

    req := httptest.NewRequest("POST", "/tenants", bytes.NewBufferString("invalid"))
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTenantHandler_Create_SlugExists(t *testing.T) {
    mockSvc := new(MockTenantService)
    h := NewTenantHandler(mockSvc)

    mockSvc.On("Create", mock.Anything, "Test", "existing").Return(nil, service.ErrTenantSlugExists)

    body := `{"name": "Test", "slug": "existing"}`
    req := httptest.NewRequest("POST", "/tenants", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTenantHandler_Get_Success(t *testing.T) {
    mockSvc := new(MockTenantService)
    h := NewTenantHandler(mockSvc)

    id := uuid.New()
    tenant := &model.Tenant{ID: id, Name: "Test"}
    mockSvc.On("GetByID", mock.Anything, id).Return(tenant, nil)

    req := httptest.NewRequest("GET", "/tenants/"+id.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Get(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestTenantHandler_Get_InvalidID(t *testing.T) {
    mockSvc := new(MockTenantService)
    h := NewTenantHandler(mockSvc)

    req := httptest.NewRequest("GET", "/tenants/invalid", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Get(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTenantHandler_Get_NotFound(t *testing.T) {
    mockSvc := new(MockTenantService)
    h := NewTenantHandler(mockSvc)

    id := uuid.New()
    mockSvc.On("GetByID", mock.Anything, id).Return(nil, service.ErrTenantNotFound)

    req := httptest.NewRequest("GET", "/tenants/"+id.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Get(rr, req)

    assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestTenantHandler_List(t *testing.T) {
    mockSvc := new(MockTenantService)
    h := NewTenantHandler(mockSvc)

    tenants := []model.Tenant{{Name: "A"}, {Name: "B"}}
    mockSvc.On("List", mock.Anything, false).Return(tenants, nil)

    req := httptest.NewRequest("GET", "/tenants", nil)
    rr := httptest.NewRecorder()

    h.List(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestTenantHandler_Delete(t *testing.T) {
    mockSvc := new(MockTenantService)
    h := NewTenantHandler(mockSvc)

    id := uuid.New()
    mockSvc.On("Delete", mock.Anything, id).Return(nil)

    req := httptest.NewRequest("DELETE", "/tenants/"+id.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Delete(rr, req)

    assert.Equal(t, http.StatusNoContent, rr.Code)
}
```

## Acceptance Criteria

- [x] `make test` passes
- [x] `make lint` passes
- [x] List, Get, Create, Update, Delete methods implemented
- [x] JSON request/response handling
- [x] Proper HTTP status codes
- [x] Error handling for invalid IDs
- [x] Unit tests with mocked service
- [x] Tests cover all HTTP methods and error cases
