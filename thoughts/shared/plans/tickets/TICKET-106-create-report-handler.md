# TICKET-106: Create Report Handler

**Type**: Handler
**Effort**: M
**Sprint**: 26 - Reports
**Dependencies**: TICKET-105

## Description

Create HTTP handlers for report operations.

## Files to Create

- `apps/api/internal/handler/report.go`

## Implementation

```go
package handler

import (
    "encoding/json"
    "io"
    "net/http"
    "os"
    "path/filepath"
    "strconv"
    "time"

    "github.com/go-chi/chi/v5"
    "github.com/google/uuid"

    "terp/apps/api/internal/model"
    "terp/apps/api/internal/service"
)

type ReportHandler struct {
    reportSvc service.ReportService
}

func NewReportHandler(reportSvc service.ReportService) *ReportHandler {
    return &ReportHandler{reportSvc: reportSvc}
}

func (h *ReportHandler) Routes() chi.Router {
    r := chi.NewRouter()

    // Templates
    r.Route("/templates", func(r chi.Router) {
        r.Post("/", h.CreateTemplate)
        r.Get("/", h.ListTemplates)
        r.Get("/{id}", h.GetTemplate)
        r.Put("/{id}", h.UpdateTemplate)
        r.Delete("/{id}", h.DeleteTemplate)
    })

    // Report runs
    r.Post("/run", h.RunReport)
    r.Get("/runs", h.ListRuns)
    r.Get("/runs/{id}", h.GetRun)
    r.Get("/runs/{id}/download", h.DownloadReport)

    return r
}

type CreateTemplateRequest struct {
    Name         string                 `json:"name"`
    Description  string                 `json:"description,omitempty"`
    ReportType   string                 `json:"report_type"`
    Config       map[string]interface{} `json:"config,omitempty"`
    Columns      []string               `json:"columns,omitempty"`
    OutputFormat string                 `json:"output_format"`
}

type RunReportRequest struct {
    TemplateID   *string                `json:"template_id,omitempty"`
    ReportType   string                 `json:"report_type"`
    Parameters   map[string]interface{} `json:"parameters,omitempty"`
    DateFrom     *string                `json:"date_from,omitempty"`
    DateTo       *string                `json:"date_to,omitempty"`
    OutputFormat string                 `json:"output_format"`
}

func (h *ReportHandler) CreateTemplate(w http.ResponseWriter, r *http.Request) {
    var req CreateTemplateRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        respondError(w, http.StatusBadRequest, "invalid request body")
        return
    }

    tenantID := getTenantIDFromContext(r.Context())
    userID := getUserIDFromContext(r.Context())

    configJSON, _ := json.Marshal(req.Config)
    columnsJSON, _ := json.Marshal(req.Columns)

    template := &model.ReportTemplate{
        TenantID:     tenantID,
        Name:         req.Name,
        Description:  req.Description,
        ReportType:   model.ReportType(req.ReportType),
        Config:       configJSON,
        Columns:      columnsJSON,
        OutputFormat: model.OutputFormat(req.OutputFormat),
        CreatedBy:    &userID,
    }

    if err := h.reportSvc.CreateTemplate(r.Context(), template); err != nil {
        respondError(w, http.StatusBadRequest, err.Error())
        return
    }

    respondJSON(w, http.StatusCreated, template)
}

func (h *ReportHandler) ListTemplates(w http.ResponseWriter, r *http.Request) {
    tenantID := getTenantIDFromContext(r.Context())

    templates, err := h.reportSvc.ListTemplates(r.Context(), tenantID)
    if err != nil {
        respondError(w, http.StatusInternalServerError, err.Error())
        return
    }

    respondJSON(w, http.StatusOK, templates)
}

func (h *ReportHandler) GetTemplate(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    if err != nil {
        respondError(w, http.StatusBadRequest, "invalid ID")
        return
    }

    template, err := h.reportSvc.GetTemplate(r.Context(), id)
    if err != nil {
        respondError(w, http.StatusNotFound, "template not found")
        return
    }

    respondJSON(w, http.StatusOK, template)
}

func (h *ReportHandler) UpdateTemplate(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    if err != nil {
        respondError(w, http.StatusBadRequest, "invalid ID")
        return
    }

    template, err := h.reportSvc.GetTemplate(r.Context(), id)
    if err != nil {
        respondError(w, http.StatusNotFound, "template not found")
        return
    }

    var req CreateTemplateRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        respondError(w, http.StatusBadRequest, "invalid request body")
        return
    }

    template.Name = req.Name
    template.Description = req.Description
    template.ReportType = model.ReportType(req.ReportType)
    template.OutputFormat = model.OutputFormat(req.OutputFormat)

    if err := h.reportSvc.UpdateTemplate(r.Context(), template); err != nil {
        respondError(w, http.StatusBadRequest, err.Error())
        return
    }

    respondJSON(w, http.StatusOK, template)
}

func (h *ReportHandler) DeleteTemplate(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    if err != nil {
        respondError(w, http.StatusBadRequest, "invalid ID")
        return
    }

    if err := h.reportSvc.DeleteTemplate(r.Context(), id); err != nil {
        respondError(w, http.StatusInternalServerError, err.Error())
        return
    }

    w.WriteHeader(http.StatusNoContent)
}

func (h *ReportHandler) RunReport(w http.ResponseWriter, r *http.Request) {
    var req RunReportRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        respondError(w, http.StatusBadRequest, "invalid request body")
        return
    }

    tenantID := getTenantIDFromContext(r.Context())
    userID := getUserIDFromContext(r.Context())

    params := service.ReportParams{
        TenantID:     tenantID,
        ReportType:   model.ReportType(req.ReportType),
        Parameters:   req.Parameters,
        OutputFormat: model.OutputFormat(req.OutputFormat),
        RunBy:        userID,
    }

    if req.TemplateID != nil {
        if id, err := uuid.Parse(*req.TemplateID); err == nil {
            params.TemplateID = &id
        }
    }

    if req.DateFrom != nil {
        if t, err := time.Parse("2006-01-02", *req.DateFrom); err == nil {
            params.DateFrom = &t
        }
    }
    if req.DateTo != nil {
        if t, err := time.Parse("2006-01-02", *req.DateTo); err == nil {
            params.DateTo = &t
        }
    }

    run, err := h.reportSvc.RunReport(r.Context(), params)
    if err != nil {
        respondError(w, http.StatusBadRequest, err.Error())
        return
    }

    respondJSON(w, http.StatusAccepted, run)
}

func (h *ReportHandler) ListRuns(w http.ResponseWriter, r *http.Request) {
    tenantID := getTenantIDFromContext(r.Context())

    limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
    if limit <= 0 || limit > 100 {
        limit = 50
    }
    offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

    runs, total, err := h.reportSvc.ListRuns(r.Context(), tenantID, limit, offset)
    if err != nil {
        respondError(w, http.StatusInternalServerError, err.Error())
        return
    }

    respondJSON(w, http.StatusOK, map[string]interface{}{
        "data":   runs,
        "total":  total,
        "limit":  limit,
        "offset": offset,
    })
}

func (h *ReportHandler) GetRun(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    if err != nil {
        respondError(w, http.StatusBadRequest, "invalid ID")
        return
    }

    run, err := h.reportSvc.GetRun(r.Context(), id)
    if err != nil {
        respondError(w, http.StatusNotFound, "report run not found")
        return
    }

    respondJSON(w, http.StatusOK, run)
}

func (h *ReportHandler) DownloadReport(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    if err != nil {
        respondError(w, http.StatusBadRequest, "invalid ID")
        return
    }

    filePath, err := h.reportSvc.DownloadReport(r.Context(), id)
    if err != nil {
        respondError(w, http.StatusBadRequest, err.Error())
        return
    }

    file, err := os.Open(filePath)
    if err != nil {
        respondError(w, http.StatusNotFound, "file not found")
        return
    }
    defer file.Close()

    // Set headers
    filename := filepath.Base(filePath)
    w.Header().Set("Content-Disposition", "attachment; filename="+filename)
    w.Header().Set("Content-Type", "application/octet-stream")

    io.Copy(w, file)
}
```

## Unit Tests

**File**: `apps/api/internal/handler/report_test.go`

```go
package handler

import (
    "bytes"
    "context"
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "os"
    "path/filepath"
    "testing"

    "github.com/go-chi/chi/v5"
    "github.com/google/uuid"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/mock"
    "github.com/stretchr/testify/require"

    "terp/apps/api/internal/model"
    "terp/apps/api/internal/service"
)

type MockReportService struct {
    mock.Mock
}

func (m *MockReportService) CreateTemplate(ctx context.Context, template *model.ReportTemplate) error {
    args := m.Called(ctx, template)
    return args.Error(0)
}

func (m *MockReportService) GetTemplate(ctx context.Context, id uuid.UUID) (*model.ReportTemplate, error) {
    args := m.Called(ctx, id)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.ReportTemplate), args.Error(1)
}

func (m *MockReportService) ListTemplates(ctx context.Context, tenantID uuid.UUID) ([]model.ReportTemplate, error) {
    args := m.Called(ctx, tenantID)
    return args.Get(0).([]model.ReportTemplate), args.Error(1)
}

func (m *MockReportService) UpdateTemplate(ctx context.Context, template *model.ReportTemplate) error {
    args := m.Called(ctx, template)
    return args.Error(0)
}

func (m *MockReportService) DeleteTemplate(ctx context.Context, id uuid.UUID) error {
    args := m.Called(ctx, id)
    return args.Error(0)
}

func (m *MockReportService) RunReport(ctx context.Context, params service.ReportParams) (*model.ReportRun, error) {
    args := m.Called(ctx, params)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.ReportRun), args.Error(1)
}

func (m *MockReportService) GetRun(ctx context.Context, id uuid.UUID) (*model.ReportRun, error) {
    args := m.Called(ctx, id)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.ReportRun), args.Error(1)
}

func (m *MockReportService) ListRuns(ctx context.Context, tenantID uuid.UUID, limit, offset int) ([]model.ReportRun, int64, error) {
    args := m.Called(ctx, tenantID, limit, offset)
    return args.Get(0).([]model.ReportRun), args.Get(1).(int64), args.Error(2)
}

func (m *MockReportService) DownloadReport(ctx context.Context, id uuid.UUID) (string, error) {
    args := m.Called(ctx, id)
    return args.String(0), args.Error(1)
}

func TestReportHandler_CreateTemplate_Success(t *testing.T) {
    mockSvc := new(MockReportService)
    h := NewReportHandler(mockSvc)

    tenantID := uuid.New()
    userID := uuid.New()

    mockSvc.On("CreateTemplate", mock.Anything, mock.MatchedBy(func(tmpl *model.ReportTemplate) bool {
        return tmpl.Name == "Monthly Hours Report" && tmpl.TenantID == tenantID
    })).Return(nil)

    body := `{"name":"Monthly Hours Report","report_type":"MONTHLY_HOURS","output_format":"CSV"}`
    req := httptest.NewRequest("POST", "/reports/templates", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    req = req.WithContext(context.WithValue(req.Context(), "user_id", userID))
    rr := httptest.NewRecorder()

    h.CreateTemplate(rr, req)

    assert.Equal(t, http.StatusCreated, rr.Code)
}

func TestReportHandler_CreateTemplate_InvalidBody(t *testing.T) {
    mockSvc := new(MockReportService)
    h := NewReportHandler(mockSvc)

    req := httptest.NewRequest("POST", "/reports/templates", bytes.NewBufferString("invalid"))
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    req = req.WithContext(context.WithValue(req.Context(), "user_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.CreateTemplate(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestReportHandler_ListTemplates_Success(t *testing.T) {
    mockSvc := new(MockReportService)
    h := NewReportHandler(mockSvc)

    tenantID := uuid.New()
    templates := []model.ReportTemplate{
        {ID: uuid.New(), Name: "Template 1", TenantID: tenantID},
        {ID: uuid.New(), Name: "Template 2", TenantID: tenantID},
    }

    mockSvc.On("ListTemplates", mock.Anything, tenantID).Return(templates, nil)

    req := httptest.NewRequest("GET", "/reports/templates", nil)
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    rr := httptest.NewRecorder()

    h.ListTemplates(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result []model.ReportTemplate
    json.Unmarshal(rr.Body.Bytes(), &result)
    assert.Len(t, result, 2)
}

func TestReportHandler_GetTemplate_Success(t *testing.T) {
    mockSvc := new(MockReportService)
    h := NewReportHandler(mockSvc)

    id := uuid.New()
    template := &model.ReportTemplate{
        ID:   id,
        Name: "Monthly Hours Report",
    }

    mockSvc.On("GetTemplate", mock.Anything, id).Return(template, nil)

    req := httptest.NewRequest("GET", "/reports/templates/"+id.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.GetTemplate(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestReportHandler_GetTemplate_InvalidID(t *testing.T) {
    mockSvc := new(MockReportService)
    h := NewReportHandler(mockSvc)

    req := httptest.NewRequest("GET", "/reports/templates/invalid", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.GetTemplate(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestReportHandler_GetTemplate_NotFound(t *testing.T) {
    mockSvc := new(MockReportService)
    h := NewReportHandler(mockSvc)

    id := uuid.New()
    mockSvc.On("GetTemplate", mock.Anything, id).Return(nil, service.ErrReportTemplateNotFound)

    req := httptest.NewRequest("GET", "/reports/templates/"+id.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.GetTemplate(rr, req)

    assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestReportHandler_UpdateTemplate_Success(t *testing.T) {
    mockSvc := new(MockReportService)
    h := NewReportHandler(mockSvc)

    id := uuid.New()
    template := &model.ReportTemplate{
        ID:   id,
        Name: "Old Name",
    }

    mockSvc.On("GetTemplate", mock.Anything, id).Return(template, nil)
    mockSvc.On("UpdateTemplate", mock.Anything, mock.Anything).Return(nil)

    body := `{"name":"Updated Name","report_type":"MONTHLY_HOURS","output_format":"PDF"}`
    req := httptest.NewRequest("PUT", "/reports/templates/"+id.String(), bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.UpdateTemplate(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestReportHandler_DeleteTemplate_Success(t *testing.T) {
    mockSvc := new(MockReportService)
    h := NewReportHandler(mockSvc)

    id := uuid.New()
    mockSvc.On("DeleteTemplate", mock.Anything, id).Return(nil)

    req := httptest.NewRequest("DELETE", "/reports/templates/"+id.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.DeleteTemplate(rr, req)

    assert.Equal(t, http.StatusNoContent, rr.Code)
}

func TestReportHandler_RunReport_Success(t *testing.T) {
    mockSvc := new(MockReportService)
    h := NewReportHandler(mockSvc)

    tenantID := uuid.New()
    userID := uuid.New()
    run := &model.ReportRun{
        ID:     uuid.New(),
        Status: model.ReportStatusPending,
    }

    mockSvc.On("RunReport", mock.Anything, mock.MatchedBy(func(params service.ReportParams) bool {
        return params.TenantID == tenantID && params.ReportType == model.ReportTypeMonthlyHours
    })).Return(run, nil)

    body := `{"report_type":"MONTHLY_HOURS","output_format":"CSV","date_from":"2024-01-01","date_to":"2024-01-31"}`
    req := httptest.NewRequest("POST", "/reports/run", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    req = req.WithContext(context.WithValue(req.Context(), "user_id", userID))
    rr := httptest.NewRecorder()

    h.RunReport(rr, req)

    assert.Equal(t, http.StatusAccepted, rr.Code)
}

func TestReportHandler_RunReport_InvalidBody(t *testing.T) {
    mockSvc := new(MockReportService)
    h := NewReportHandler(mockSvc)

    req := httptest.NewRequest("POST", "/reports/run", bytes.NewBufferString("invalid"))
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    req = req.WithContext(context.WithValue(req.Context(), "user_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.RunReport(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestReportHandler_ListRuns_Success(t *testing.T) {
    mockSvc := new(MockReportService)
    h := NewReportHandler(mockSvc)

    tenantID := uuid.New()
    runs := []model.ReportRun{
        {ID: uuid.New(), TenantID: tenantID, Status: model.ReportStatusCompleted},
        {ID: uuid.New(), TenantID: tenantID, Status: model.ReportStatusPending},
    }

    mockSvc.On("ListRuns", mock.Anything, tenantID, 50, 0).Return(runs, int64(2), nil)

    req := httptest.NewRequest("GET", "/reports/runs", nil)
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    rr := httptest.NewRecorder()

    h.ListRuns(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result map[string]interface{}
    json.Unmarshal(rr.Body.Bytes(), &result)
    assert.Equal(t, float64(2), result["total"])
}

func TestReportHandler_ListRuns_WithPagination(t *testing.T) {
    mockSvc := new(MockReportService)
    h := NewReportHandler(mockSvc)

    tenantID := uuid.New()
    runs := []model.ReportRun{}

    mockSvc.On("ListRuns", mock.Anything, tenantID, 25, 50).Return(runs, int64(100), nil)

    req := httptest.NewRequest("GET", "/reports/runs?limit=25&offset=50", nil)
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    rr := httptest.NewRecorder()

    h.ListRuns(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestReportHandler_GetRun_Success(t *testing.T) {
    mockSvc := new(MockReportService)
    h := NewReportHandler(mockSvc)

    id := uuid.New()
    run := &model.ReportRun{
        ID:     id,
        Status: model.ReportStatusCompleted,
    }

    mockSvc.On("GetRun", mock.Anything, id).Return(run, nil)

    req := httptest.NewRequest("GET", "/reports/runs/"+id.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.GetRun(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestReportHandler_GetRun_NotFound(t *testing.T) {
    mockSvc := new(MockReportService)
    h := NewReportHandler(mockSvc)

    id := uuid.New()
    mockSvc.On("GetRun", mock.Anything, id).Return(nil, service.ErrReportRunNotFound)

    req := httptest.NewRequest("GET", "/reports/runs/"+id.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.GetRun(rr, req)

    assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestReportHandler_DownloadReport_Success(t *testing.T) {
    mockSvc := new(MockReportService)
    h := NewReportHandler(mockSvc)

    // Create a temporary test file
    tmpDir := t.TempDir()
    testFile := filepath.Join(tmpDir, "test-report.csv")
    os.WriteFile(testFile, []byte("test,data\n1,2"), 0644)

    id := uuid.New()
    mockSvc.On("DownloadReport", mock.Anything, id).Return(testFile, nil)

    req := httptest.NewRequest("GET", "/reports/runs/"+id.String()+"/download", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.DownloadReport(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    assert.Contains(t, rr.Header().Get("Content-Disposition"), "attachment")
}

func TestReportHandler_DownloadReport_FileNotFound(t *testing.T) {
    mockSvc := new(MockReportService)
    h := NewReportHandler(mockSvc)

    id := uuid.New()
    mockSvc.On("DownloadReport", mock.Anything, id).Return("/nonexistent/file.csv", nil)

    req := httptest.NewRequest("GET", "/reports/runs/"+id.String()+"/download", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.DownloadReport(rr, req)

    assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestReportHandler_DownloadReport_InvalidID(t *testing.T) {
    mockSvc := new(MockReportService)
    h := NewReportHandler(mockSvc)

    req := httptest.NewRequest("GET", "/reports/runs/invalid/download", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.DownloadReport(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] `make lint` passes
- [ ] POST template creates new template
- [ ] POST run creates pending report
- [ ] GET runs lists with pagination
- [ ] GET download returns file
- [ ] Unit tests with mocked service
- [ ] Tests cover all HTTP methods and error cases
