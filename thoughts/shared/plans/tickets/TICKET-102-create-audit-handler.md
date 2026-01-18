# TICKET-102: Create Audit Handler

**Type**: Handler
**Effort**: S
**Sprint**: 25 - Audit Log
**Dependencies**: TICKET-101

## Description

Create HTTP handlers for viewing audit logs.

## Files to Create

- `apps/api/internal/handler/audit.go`

## Implementation

```go
package handler

import (
    "net/http"
    "strconv"
    "time"

    "github.com/go-chi/chi/v5"
    "github.com/google/uuid"

    "terp/apps/api/internal/model"
    "terp/apps/api/internal/repository"
    "terp/apps/api/internal/service"
)

type AuditHandler struct {
    auditSvc service.AuditService
}

func NewAuditHandler(auditSvc service.AuditService) *AuditHandler {
    return &AuditHandler{auditSvc: auditSvc}
}

func (h *AuditHandler) Routes() chi.Router {
    r := chi.NewRouter()

    r.Get("/", h.List)
    r.Get("/entity/{entityType}/{entityId}", h.GetEntityHistory)

    return r
}

type AuditLogResponse struct {
    ID         string          `json:"id"`
    EntityType string          `json:"entity_type"`
    EntityID   string          `json:"entity_id"`
    Action     string          `json:"action"`
    OldValues  interface{}     `json:"old_values,omitempty"`
    NewValues  interface{}     `json:"new_values,omitempty"`
    UserID     *string         `json:"user_id,omitempty"`
    UserEmail  string          `json:"user_email,omitempty"`
    IPAddress  string          `json:"ip_address,omitempty"`
    Reason     string          `json:"reason,omitempty"`
    CreatedAt  string          `json:"created_at"`
}

type AuditListResponse struct {
    Data  []AuditLogResponse `json:"data"`
    Total int64              `json:"total"`
    Limit int                `json:"limit"`
    Offset int               `json:"offset"`
}

func (h *AuditHandler) List(w http.ResponseWriter, r *http.Request) {
    tenantID := getTenantIDFromContext(r.Context())

    // Parse query parameters
    limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
    if limit <= 0 || limit > 100 {
        limit = 50
    }
    offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

    filter := repository.AuditLogFilter{
        TenantID: &tenantID,
    }

    // Optional filters
    if entityType := r.URL.Query().Get("entity_type"); entityType != "" {
        filter.EntityType = &entityType
    }
    if entityID := r.URL.Query().Get("entity_id"); entityID != "" {
        if id, err := uuid.Parse(entityID); err == nil {
            filter.EntityID = &id
        }
    }
    if action := r.URL.Query().Get("action"); action != "" {
        a := model.AuditAction(action)
        filter.Action = &a
    }
    if userID := r.URL.Query().Get("user_id"); userID != "" {
        if id, err := uuid.Parse(userID); err == nil {
            filter.UserID = &id
        }
    }
    if from := r.URL.Query().Get("from"); from != "" {
        if t, err := time.Parse(time.RFC3339, from); err == nil {
            filter.From = &t
        }
    }
    if to := r.URL.Query().Get("to"); to != "" {
        if t, err := time.Parse(time.RFC3339, to); err == nil {
            filter.To = &t
        }
    }

    logs, total, err := h.auditSvc.Search(r.Context(), filter, limit, offset)
    if err != nil {
        respondError(w, http.StatusInternalServerError, err.Error())
        return
    }

    response := AuditListResponse{
        Data:   make([]AuditLogResponse, len(logs)),
        Total:  total,
        Limit:  limit,
        Offset: offset,
    }

    for i, log := range logs {
        response.Data[i] = toAuditResponse(&log)
    }

    respondJSON(w, http.StatusOK, response)
}

func (h *AuditHandler) GetEntityHistory(w http.ResponseWriter, r *http.Request) {
    entityType := chi.URLParam(r, "entityType")
    entityID, err := uuid.Parse(chi.URLParam(r, "entityId"))
    if err != nil {
        respondError(w, http.StatusBadRequest, "invalid entity ID")
        return
    }

    logs, err := h.auditSvc.GetEntityHistory(r.Context(), entityType, entityID)
    if err != nil {
        respondError(w, http.StatusInternalServerError, err.Error())
        return
    }

    response := make([]AuditLogResponse, len(logs))
    for i, log := range logs {
        response[i] = toAuditResponse(&log)
    }

    respondJSON(w, http.StatusOK, response)
}

func toAuditResponse(log *model.AuditLog) AuditLogResponse {
    resp := AuditLogResponse{
        ID:         log.ID.String(),
        EntityType: log.EntityType,
        EntityID:   log.EntityID.String(),
        Action:     string(log.Action),
        UserEmail:  log.UserEmail,
        IPAddress:  log.IPAddress,
        Reason:     log.Reason,
        CreatedAt:  log.CreatedAt.Format(time.RFC3339),
    }

    if log.UserID != nil {
        s := log.UserID.String()
        resp.UserID = &s
    }

    // Parse JSON fields
    if len(log.OldValues) > 0 {
        var v interface{}
        if err := json.Unmarshal(log.OldValues, &v); err == nil {
            resp.OldValues = v
        }
    }
    if len(log.NewValues) > 0 {
        var v interface{}
        if err := json.Unmarshal(log.NewValues, &v); err == nil {
            resp.NewValues = v
        }
    }

    return resp
}
```

## Unit Tests

**File**: `apps/api/internal/handler/audit_test.go`

```go
package handler

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
    "github.com/stretchr/testify/mock"
    "github.com/stretchr/testify/require"

    "terp/apps/api/internal/model"
    "terp/apps/api/internal/repository"
    "terp/apps/api/internal/service"
)

type MockAuditService struct {
    mock.Mock
}

func (m *MockAuditService) Search(ctx context.Context, filter repository.AuditLogFilter, limit, offset int) ([]model.AuditLog, int64, error) {
    args := m.Called(ctx, filter, limit, offset)
    return args.Get(0).([]model.AuditLog), args.Get(1).(int64), args.Error(2)
}

func (m *MockAuditService) GetEntityHistory(ctx context.Context, entityType string, entityID uuid.UUID) ([]model.AuditLog, error) {
    args := m.Called(ctx, entityType, entityID)
    return args.Get(0).([]model.AuditLog), args.Error(1)
}

func (m *MockAuditService) Log(ctx context.Context, log *model.AuditLog) error {
    args := m.Called(ctx, log)
    return args.Error(0)
}

func TestAuditHandler_List_Success(t *testing.T) {
    mockSvc := new(MockAuditService)
    h := NewAuditHandler(mockSvc)

    tenantID := uuid.New()
    logs := []model.AuditLog{
        {
            ID:         uuid.New(),
            TenantID:   tenantID,
            EntityType: "employee",
            EntityID:   uuid.New(),
            Action:     model.AuditActionCreate,
            UserEmail:  "test@example.com",
        },
        {
            ID:         uuid.New(),
            TenantID:   tenantID,
            EntityType: "booking",
            EntityID:   uuid.New(),
            Action:     model.AuditActionUpdate,
            UserEmail:  "admin@example.com",
        },
    }

    mockSvc.On("Search", mock.Anything, mock.MatchedBy(func(f repository.AuditLogFilter) bool {
        return f.TenantID != nil && *f.TenantID == tenantID
    }), 50, 0).Return(logs, int64(2), nil)

    req := httptest.NewRequest("GET", "/audit", nil)
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    rr := httptest.NewRecorder()

    h.List(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result AuditListResponse
    json.Unmarshal(rr.Body.Bytes(), &result)
    assert.Len(t, result.Data, 2)
    assert.Equal(t, int64(2), result.Total)
}

func TestAuditHandler_List_WithFilters(t *testing.T) {
    mockSvc := new(MockAuditService)
    h := NewAuditHandler(mockSvc)

    tenantID := uuid.New()
    entityID := uuid.New()
    userID := uuid.New()
    logs := []model.AuditLog{
        {
            ID:         uuid.New(),
            TenantID:   tenantID,
            EntityType: "employee",
            EntityID:   entityID,
            Action:     model.AuditActionUpdate,
            UserID:     &userID,
            UserEmail:  "test@example.com",
        },
    }

    mockSvc.On("Search", mock.Anything, mock.MatchedBy(func(f repository.AuditLogFilter) bool {
        return f.EntityType != nil && *f.EntityType == "employee" &&
            f.EntityID != nil && *f.EntityID == entityID &&
            f.UserID != nil && *f.UserID == userID
    }), 50, 0).Return(logs, int64(1), nil)

    req := httptest.NewRequest("GET", "/audit?entity_type=employee&entity_id="+entityID.String()+"&user_id="+userID.String(), nil)
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    rr := httptest.NewRecorder()

    h.List(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result AuditListResponse
    json.Unmarshal(rr.Body.Bytes(), &result)
    assert.Len(t, result.Data, 1)
}

func TestAuditHandler_List_WithPagination(t *testing.T) {
    mockSvc := new(MockAuditService)
    h := NewAuditHandler(mockSvc)

    tenantID := uuid.New()
    logs := []model.AuditLog{
        {ID: uuid.New(), TenantID: tenantID, EntityType: "employee", EntityID: uuid.New(), Action: model.AuditActionCreate},
    }

    mockSvc.On("Search", mock.Anything, mock.Anything, 25, 50).Return(logs, int64(100), nil)

    req := httptest.NewRequest("GET", "/audit?limit=25&offset=50", nil)
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    rr := httptest.NewRecorder()

    h.List(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result AuditListResponse
    json.Unmarshal(rr.Body.Bytes(), &result)
    assert.Equal(t, 25, result.Limit)
    assert.Equal(t, 50, result.Offset)
    assert.Equal(t, int64(100), result.Total)
}

func TestAuditHandler_List_LimitMaxCap(t *testing.T) {
    mockSvc := new(MockAuditService)
    h := NewAuditHandler(mockSvc)

    tenantID := uuid.New()
    logs := []model.AuditLog{}

    mockSvc.On("Search", mock.Anything, mock.Anything, 50, 0).Return(logs, int64(0), nil)

    req := httptest.NewRequest("GET", "/audit?limit=200", nil)
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    rr := httptest.NewRecorder()

    h.List(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result AuditListResponse
    json.Unmarshal(rr.Body.Bytes(), &result)
    assert.Equal(t, 50, result.Limit) // capped at 100, defaulted to 50
}

func TestAuditHandler_List_WithDateRange(t *testing.T) {
    mockSvc := new(MockAuditService)
    h := NewAuditHandler(mockSvc)

    tenantID := uuid.New()
    logs := []model.AuditLog{}

    from := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
    to := time.Date(2024, 1, 31, 23, 59, 59, 0, time.UTC)

    mockSvc.On("Search", mock.Anything, mock.MatchedBy(func(f repository.AuditLogFilter) bool {
        return f.From != nil && f.To != nil &&
            f.From.Format("2006-01-02") == "2024-01-01" &&
            f.To.Format("2006-01-02") == "2024-01-31"
    }), 50, 0).Return(logs, int64(0), nil)

    req := httptest.NewRequest("GET", "/audit?from="+from.Format(time.RFC3339)+"&to="+to.Format(time.RFC3339), nil)
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    rr := httptest.NewRecorder()

    h.List(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestAuditHandler_GetEntityHistory_Success(t *testing.T) {
    mockSvc := new(MockAuditService)
    h := NewAuditHandler(mockSvc)

    entityID := uuid.New()
    logs := []model.AuditLog{
        {
            ID:         uuid.New(),
            EntityType: "employee",
            EntityID:   entityID,
            Action:     model.AuditActionCreate,
            UserEmail:  "test@example.com",
        },
        {
            ID:         uuid.New(),
            EntityType: "employee",
            EntityID:   entityID,
            Action:     model.AuditActionUpdate,
            UserEmail:  "admin@example.com",
        },
    }

    mockSvc.On("GetEntityHistory", mock.Anything, "employee", entityID).Return(logs, nil)

    req := httptest.NewRequest("GET", "/audit/entity/employee/"+entityID.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("entityType", "employee")
    rctx.URLParams.Add("entityId", entityID.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.GetEntityHistory(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result []AuditLogResponse
    json.Unmarshal(rr.Body.Bytes(), &result)
    assert.Len(t, result, 2)
    assert.Equal(t, "employee", result[0].EntityType)
}

func TestAuditHandler_GetEntityHistory_InvalidEntityID(t *testing.T) {
    mockSvc := new(MockAuditService)
    h := NewAuditHandler(mockSvc)

    req := httptest.NewRequest("GET", "/audit/entity/employee/invalid", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("entityType", "employee")
    rctx.URLParams.Add("entityId", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.GetEntityHistory(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestAuditHandler_GetEntityHistory_Empty(t *testing.T) {
    mockSvc := new(MockAuditService)
    h := NewAuditHandler(mockSvc)

    entityID := uuid.New()
    logs := []model.AuditLog{}

    mockSvc.On("GetEntityHistory", mock.Anything, "booking", entityID).Return(logs, nil)

    req := httptest.NewRequest("GET", "/audit/entity/booking/"+entityID.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("entityType", "booking")
    rctx.URLParams.Add("entityId", entityID.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.GetEntityHistory(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result []AuditLogResponse
    json.Unmarshal(rr.Body.Bytes(), &result)
    assert.Len(t, result, 0)
}

func TestAuditHandler_GetEntityHistory_WithOldAndNewValues(t *testing.T) {
    mockSvc := new(MockAuditService)
    h := NewAuditHandler(mockSvc)

    entityID := uuid.New()
    oldValues := []byte(`{"name":"Old Name","status":"active"}`)
    newValues := []byte(`{"name":"New Name","status":"inactive"}`)

    logs := []model.AuditLog{
        {
            ID:         uuid.New(),
            EntityType: "employee",
            EntityID:   entityID,
            Action:     model.AuditActionUpdate,
            OldValues:  oldValues,
            NewValues:  newValues,
            UserEmail:  "admin@example.com",
        },
    }

    mockSvc.On("GetEntityHistory", mock.Anything, "employee", entityID).Return(logs, nil)

    req := httptest.NewRequest("GET", "/audit/entity/employee/"+entityID.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("entityType", "employee")
    rctx.URLParams.Add("entityId", entityID.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.GetEntityHistory(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result []AuditLogResponse
    json.Unmarshal(rr.Body.Bytes(), &result)
    assert.Len(t, result, 1)
    assert.NotNil(t, result[0].OldValues)
    assert.NotNil(t, result[0].NewValues)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] `make lint` passes
- [ ] GET list returns paginated audit logs
- [ ] Filter by entity type, action, user, date range works
- [ ] GET entity history returns all changes for an entity
- [ ] Unit tests with mocked service
- [ ] Tests cover all HTTP methods and error cases
