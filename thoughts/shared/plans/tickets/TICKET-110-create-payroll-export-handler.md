# TICKET-110: Create Payroll Export Handler

**Type**: Handler
**Effort**: S
**Sprint**: 27 - Payroll Export
**Dependencies**: TICKET-109

## Description

Create HTTP handlers for payroll export operations.

## Files to Create

- `apps/api/internal/handler/payroll_export.go`

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

    "github.com/go-chi/chi/v5"
    "github.com/google/uuid"

    "terp/apps/api/internal/model"
    "terp/apps/api/internal/service"
)

type PayrollExportHandler struct {
    payrollSvc service.PayrollExportService
}

func NewPayrollExportHandler(payrollSvc service.PayrollExportService) *PayrollExportHandler {
    return &PayrollExportHandler{payrollSvc: payrollSvc}
}

func (h *PayrollExportHandler) Routes() chi.Router {
    r := chi.NewRouter()

    r.Post("/", h.CreateExport)
    r.Get("/", h.ListExports)
    r.Get("/{id}", h.GetExport)
    r.Post("/{id}/process", h.ProcessExport)
    r.Get("/{id}/download", h.DownloadExport)

    return r
}

type CreateExportRequest struct {
    Year         int    `json:"year"`
    Month        int    `json:"month"`
    ExportFormat string `json:"export_format"`
}

type ExportResponse struct {
    ID           string  `json:"id"`
    Year         int     `json:"year"`
    Month        int     `json:"month"`
    ExportFormat string  `json:"export_format"`
    Status       string  `json:"status"`
    ErrorMessage string  `json:"error_message,omitempty"`
    FilePath     string  `json:"file_path,omitempty"`
    FileSize     int     `json:"file_size,omitempty"`
    RecordCount  int     `json:"record_count,omitempty"`
    CreatedAt    string  `json:"created_at"`
    CompletedAt  *string `json:"completed_at,omitempty"`
}

func (h *PayrollExportHandler) CreateExport(w http.ResponseWriter, r *http.Request) {
    var req CreateExportRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        respondError(w, http.StatusBadRequest, "invalid request body")
        return
    }

    // Validate
    if req.Year < 2000 || req.Year > 2100 {
        respondError(w, http.StatusBadRequest, "invalid year")
        return
    }
    if req.Month < 1 || req.Month > 12 {
        respondError(w, http.StatusBadRequest, "invalid month")
        return
    }

    tenantID := getTenantIDFromContext(r.Context())
    userID := getUserIDFromContext(r.Context())

    export, err := h.payrollSvc.CreateExport(
        r.Context(),
        tenantID,
        req.Year,
        req.Month,
        model.ExportFormat(req.ExportFormat),
        userID,
    )
    if err != nil {
        if err == service.ErrExportAlreadyExists {
            respondError(w, http.StatusConflict, "export already exists for this period")
            return
        }
        respondError(w, http.StatusBadRequest, err.Error())
        return
    }

    respondJSON(w, http.StatusCreated, toExportResponse(export))
}

func (h *PayrollExportHandler) ListExports(w http.ResponseWriter, r *http.Request) {
    tenantID := getTenantIDFromContext(r.Context())

    limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
    if limit <= 0 || limit > 100 {
        limit = 50
    }
    offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

    exports, total, err := h.payrollSvc.ListExports(r.Context(), tenantID, limit, offset)
    if err != nil {
        respondError(w, http.StatusInternalServerError, err.Error())
        return
    }

    response := make([]ExportResponse, len(exports))
    for i, exp := range exports {
        response[i] = *toExportResponse(&exp)
    }

    respondJSON(w, http.StatusOK, map[string]interface{}{
        "data":   response,
        "total":  total,
        "limit":  limit,
        "offset": offset,
    })
}

func (h *PayrollExportHandler) GetExport(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    if err != nil {
        respondError(w, http.StatusBadRequest, "invalid ID")
        return
    }

    export, err := h.payrollSvc.GetExport(r.Context(), id)
    if err != nil {
        respondError(w, http.StatusNotFound, "export not found")
        return
    }

    respondJSON(w, http.StatusOK, toExportResponse(export))
}

func (h *PayrollExportHandler) ProcessExport(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    if err != nil {
        respondError(w, http.StatusBadRequest, "invalid ID")
        return
    }

    // Process async
    go h.payrollSvc.ProcessExport(r.Context(), id)

    respondJSON(w, http.StatusAccepted, map[string]string{
        "status":  "processing",
        "message": "Export processing started",
    })
}

func (h *PayrollExportHandler) DownloadExport(w http.ResponseWriter, r *http.Request) {
    id, err := uuid.Parse(chi.URLParam(r, "id"))
    if err != nil {
        respondError(w, http.StatusBadRequest, "invalid ID")
        return
    }

    filePath, err := h.payrollSvc.DownloadExport(r.Context(), id)
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

    filename := filepath.Base(filePath)
    w.Header().Set("Content-Disposition", "attachment; filename="+filename)
    w.Header().Set("Content-Type", "text/csv")

    io.Copy(w, file)
}

func toExportResponse(e *model.PayrollExport) *ExportResponse {
    resp := &ExportResponse{
        ID:           e.ID.String(),
        Year:         e.Year,
        Month:        e.Month,
        ExportFormat: string(e.ExportFormat),
        Status:       string(e.Status),
        ErrorMessage: e.ErrorMessage,
        FilePath:     e.FilePath,
        FileSize:     e.FileSize,
        RecordCount:  e.RecordCount,
        CreatedAt:    e.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
    }
    if e.CompletedAt != nil {
        s := e.CompletedAt.Format("2006-01-02T15:04:05Z07:00")
        resp.CompletedAt = &s
    }
    return resp
}
```

## Unit Tests

**File**: `apps/api/internal/handler/payroll_export_test.go`

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

type MockPayrollExportService struct {
    mock.Mock
}

func (m *MockPayrollExportService) CreateExport(ctx context.Context, tenantID uuid.UUID, year, month int, format model.ExportFormat, userID uuid.UUID) (*model.PayrollExport, error) {
    args := m.Called(ctx, tenantID, year, month, format, userID)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.PayrollExport), args.Error(1)
}

func (m *MockPayrollExportService) GetExport(ctx context.Context, id uuid.UUID) (*model.PayrollExport, error) {
    args := m.Called(ctx, id)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.PayrollExport), args.Error(1)
}

func (m *MockPayrollExportService) ListExports(ctx context.Context, tenantID uuid.UUID, limit, offset int) ([]model.PayrollExport, int64, error) {
    args := m.Called(ctx, tenantID, limit, offset)
    return args.Get(0).([]model.PayrollExport), args.Get(1).(int64), args.Error(2)
}

func (m *MockPayrollExportService) ProcessExport(ctx context.Context, id uuid.UUID) error {
    args := m.Called(ctx, id)
    return args.Error(0)
}

func (m *MockPayrollExportService) DownloadExport(ctx context.Context, id uuid.UUID) (string, error) {
    args := m.Called(ctx, id)
    return args.String(0), args.Error(1)
}

func TestPayrollExportHandler_CreateExport_Success(t *testing.T) {
    mockSvc := new(MockPayrollExportService)
    h := NewPayrollExportHandler(mockSvc)

    tenantID := uuid.New()
    userID := uuid.New()
    export := &model.PayrollExport{
        ID:           uuid.New(),
        TenantID:     tenantID,
        Year:         2024,
        Month:        1,
        ExportFormat: model.ExportFormatDATEV,
        Status:       model.ExportStatusPending,
    }

    mockSvc.On("CreateExport", mock.Anything, tenantID, 2024, 1, model.ExportFormatDATEV, userID).Return(export, nil)

    body := `{"year":2024,"month":1,"export_format":"DATEV"}`
    req := httptest.NewRequest("POST", "/payroll-exports", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    req = req.WithContext(context.WithValue(req.Context(), "user_id", userID))
    rr := httptest.NewRecorder()

    h.CreateExport(rr, req)

    assert.Equal(t, http.StatusCreated, rr.Code)
    var result ExportResponse
    json.Unmarshal(rr.Body.Bytes(), &result)
    assert.Equal(t, 2024, result.Year)
    assert.Equal(t, 1, result.Month)
}

func TestPayrollExportHandler_CreateExport_InvalidBody(t *testing.T) {
    mockSvc := new(MockPayrollExportService)
    h := NewPayrollExportHandler(mockSvc)

    req := httptest.NewRequest("POST", "/payroll-exports", bytes.NewBufferString("invalid"))
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    req = req.WithContext(context.WithValue(req.Context(), "user_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.CreateExport(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestPayrollExportHandler_CreateExport_InvalidYear(t *testing.T) {
    mockSvc := new(MockPayrollExportService)
    h := NewPayrollExportHandler(mockSvc)

    body := `{"year":1999,"month":1,"export_format":"DATEV"}`
    req := httptest.NewRequest("POST", "/payroll-exports", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    req = req.WithContext(context.WithValue(req.Context(), "user_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.CreateExport(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestPayrollExportHandler_CreateExport_InvalidMonth(t *testing.T) {
    mockSvc := new(MockPayrollExportService)
    h := NewPayrollExportHandler(mockSvc)

    body := `{"year":2024,"month":13,"export_format":"DATEV"}`
    req := httptest.NewRequest("POST", "/payroll-exports", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    req = req.WithContext(context.WithValue(req.Context(), "user_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.CreateExport(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestPayrollExportHandler_CreateExport_AlreadyExists(t *testing.T) {
    mockSvc := new(MockPayrollExportService)
    h := NewPayrollExportHandler(mockSvc)

    tenantID := uuid.New()
    userID := uuid.New()

    mockSvc.On("CreateExport", mock.Anything, tenantID, 2024, 1, model.ExportFormatDATEV, userID).Return(nil, service.ErrExportAlreadyExists)

    body := `{"year":2024,"month":1,"export_format":"DATEV"}`
    req := httptest.NewRequest("POST", "/payroll-exports", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    req = req.WithContext(context.WithValue(req.Context(), "user_id", userID))
    rr := httptest.NewRecorder()

    h.CreateExport(rr, req)

    assert.Equal(t, http.StatusConflict, rr.Code)
}

func TestPayrollExportHandler_ListExports_Success(t *testing.T) {
    mockSvc := new(MockPayrollExportService)
    h := NewPayrollExportHandler(mockSvc)

    tenantID := uuid.New()
    exports := []model.PayrollExport{
        {ID: uuid.New(), TenantID: tenantID, Year: 2024, Month: 1, Status: model.ExportStatusCompleted},
        {ID: uuid.New(), TenantID: tenantID, Year: 2024, Month: 2, Status: model.ExportStatusPending},
    }

    mockSvc.On("ListExports", mock.Anything, tenantID, 50, 0).Return(exports, int64(2), nil)

    req := httptest.NewRequest("GET", "/payroll-exports", nil)
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    rr := httptest.NewRecorder()

    h.ListExports(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result map[string]interface{}
    json.Unmarshal(rr.Body.Bytes(), &result)
    assert.Equal(t, float64(2), result["total"])
}

func TestPayrollExportHandler_ListExports_WithPagination(t *testing.T) {
    mockSvc := new(MockPayrollExportService)
    h := NewPayrollExportHandler(mockSvc)

    tenantID := uuid.New()
    exports := []model.PayrollExport{}

    mockSvc.On("ListExports", mock.Anything, tenantID, 25, 50).Return(exports, int64(100), nil)

    req := httptest.NewRequest("GET", "/payroll-exports?limit=25&offset=50", nil)
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    rr := httptest.NewRecorder()

    h.ListExports(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result map[string]interface{}
    json.Unmarshal(rr.Body.Bytes(), &result)
    assert.Equal(t, float64(25), result["limit"])
    assert.Equal(t, float64(50), result["offset"])
}

func TestPayrollExportHandler_GetExport_Success(t *testing.T) {
    mockSvc := new(MockPayrollExportService)
    h := NewPayrollExportHandler(mockSvc)

    id := uuid.New()
    export := &model.PayrollExport{
        ID:     id,
        Year:   2024,
        Month:  1,
        Status: model.ExportStatusCompleted,
    }

    mockSvc.On("GetExport", mock.Anything, id).Return(export, nil)

    req := httptest.NewRequest("GET", "/payroll-exports/"+id.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.GetExport(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestPayrollExportHandler_GetExport_InvalidID(t *testing.T) {
    mockSvc := new(MockPayrollExportService)
    h := NewPayrollExportHandler(mockSvc)

    req := httptest.NewRequest("GET", "/payroll-exports/invalid", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.GetExport(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestPayrollExportHandler_GetExport_NotFound(t *testing.T) {
    mockSvc := new(MockPayrollExportService)
    h := NewPayrollExportHandler(mockSvc)

    id := uuid.New()
    mockSvc.On("GetExport", mock.Anything, id).Return(nil, service.ErrExportNotFound)

    req := httptest.NewRequest("GET", "/payroll-exports/"+id.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.GetExport(rr, req)

    assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestPayrollExportHandler_ProcessExport_Success(t *testing.T) {
    mockSvc := new(MockPayrollExportService)
    h := NewPayrollExportHandler(mockSvc)

    id := uuid.New()
    mockSvc.On("ProcessExport", mock.Anything, id).Return(nil)

    req := httptest.NewRequest("POST", "/payroll-exports/"+id.String()+"/process", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.ProcessExport(rr, req)

    assert.Equal(t, http.StatusAccepted, rr.Code)
    var result map[string]string
    json.Unmarshal(rr.Body.Bytes(), &result)
    assert.Equal(t, "processing", result["status"])
}

func TestPayrollExportHandler_ProcessExport_InvalidID(t *testing.T) {
    mockSvc := new(MockPayrollExportService)
    h := NewPayrollExportHandler(mockSvc)

    req := httptest.NewRequest("POST", "/payroll-exports/invalid/process", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.ProcessExport(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestPayrollExportHandler_DownloadExport_Success(t *testing.T) {
    mockSvc := new(MockPayrollExportService)
    h := NewPayrollExportHandler(mockSvc)

    // Create a temporary test file
    tmpDir := t.TempDir()
    testFile := filepath.Join(tmpDir, "payroll-export-2024-01.csv")
    os.WriteFile(testFile, []byte("employee,hours,amount\nJohn,160,3200"), 0644)

    id := uuid.New()
    mockSvc.On("DownloadExport", mock.Anything, id).Return(testFile, nil)

    req := httptest.NewRequest("GET", "/payroll-exports/"+id.String()+"/download", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.DownloadExport(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    assert.Contains(t, rr.Header().Get("Content-Disposition"), "attachment")
    assert.Equal(t, "text/csv", rr.Header().Get("Content-Type"))
}

func TestPayrollExportHandler_DownloadExport_InvalidID(t *testing.T) {
    mockSvc := new(MockPayrollExportService)
    h := NewPayrollExportHandler(mockSvc)

    req := httptest.NewRequest("GET", "/payroll-exports/invalid/download", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.DownloadExport(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestPayrollExportHandler_DownloadExport_FileNotFound(t *testing.T) {
    mockSvc := new(MockPayrollExportService)
    h := NewPayrollExportHandler(mockSvc)

    id := uuid.New()
    mockSvc.On("DownloadExport", mock.Anything, id).Return("/nonexistent/file.csv", nil)

    req := httptest.NewRequest("GET", "/payroll-exports/"+id.String()+"/download", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.DownloadExport(rr, req)

    assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestPayrollExportHandler_DownloadExport_ServiceError(t *testing.T) {
    mockSvc := new(MockPayrollExportService)
    h := NewPayrollExportHandler(mockSvc)

    id := uuid.New()
    mockSvc.On("DownloadExport", mock.Anything, id).Return("", service.ErrExportNotCompleted)

    req := httptest.NewRequest("GET", "/payroll-exports/"+id.String()+"/download", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.DownloadExport(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] `make lint` passes
- [ ] POST creates new export
- [ ] POST process starts async processing
- [ ] GET download returns file with correct headers
- [ ] Conflict error for duplicate period
- [ ] Unit tests with mocked service
- [ ] Tests cover all HTTP methods and error cases
