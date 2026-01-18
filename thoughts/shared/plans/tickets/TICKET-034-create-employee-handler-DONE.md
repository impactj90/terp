# TICKET-034: Create Employee Handler

**Type**: Handler
**Effort**: M
**Sprint**: 5 - Employees
**Dependencies**: TICKET-033

## Description

Create the Employee HTTP handler with CRUD and search endpoints.

## Files to Create

- `apps/api/internal/handler/employee.go`

## Implementation

```go
package handler

import (
    "encoding/json"
    "net/http"
    "strconv"
    "time"

    "github.com/go-chi/chi/v5"
    "github.com/google/uuid"

    "terp/apps/api/internal/middleware"
    "terp/apps/api/internal/repository"
    "terp/apps/api/internal/service"
)

type EmployeeHandler struct {
    service service.EmployeeService
}

func NewEmployeeHandler(s service.EmployeeService) *EmployeeHandler {
    return &EmployeeHandler{service: s}
}

type CreateEmployeeRequest struct {
    PersonnelNumber    string     `json:"personnel_number"`
    PIN                string     `json:"pin"`
    FirstName          string     `json:"first_name"`
    LastName           string     `json:"last_name"`
    Email              string     `json:"email,omitempty"`
    Phone              string     `json:"phone,omitempty"`
    EntryDate          string     `json:"entry_date"` // YYYY-MM-DD
    DepartmentID       *uuid.UUID `json:"department_id,omitempty"`
    CostCenterID       *uuid.UUID `json:"cost_center_id,omitempty"`
    EmploymentTypeID   *uuid.UUID `json:"employment_type_id,omitempty"`
    WeeklyHours        float64    `json:"weekly_hours,omitempty"`
    VacationDaysPerYear float64   `json:"vacation_days_per_year,omitempty"`
}

type UpdateEmployeeRequest struct {
    FirstName          *string    `json:"first_name,omitempty"`
    LastName           *string    `json:"last_name,omitempty"`
    Email              *string    `json:"email,omitempty"`
    Phone              *string    `json:"phone,omitempty"`
    ExitDate           *string    `json:"exit_date,omitempty"` // YYYY-MM-DD
    DepartmentID       *uuid.UUID `json:"department_id,omitempty"`
    CostCenterID       *uuid.UUID `json:"cost_center_id,omitempty"`
    EmploymentTypeID   *uuid.UUID `json:"employment_type_id,omitempty"`
    WeeklyHours        *float64   `json:"weekly_hours,omitempty"`
    VacationDaysPerYear *float64  `json:"vacation_days_per_year,omitempty"`
}

type ListResponse struct {
    Data  interface{} `json:"data"`
    Total int64       `json:"total"`
    Page  int         `json:"page"`
    Limit int         `json:"limit"`
}

// List handles GET /api/v1/employees
func (h *EmployeeHandler) List(w http.ResponseWriter, r *http.Request) {
    tenantID, ok := middleware.TenantFromContext(r.Context())
    if !ok {
        http.Error(w, "tenant required", http.StatusBadRequest)
        return
    }

    // Parse query params
    filter := repository.EmployeeFilter{
        TenantID: tenantID,
        Limit:    20,
        Offset:   0,
    }

    if q := r.URL.Query().Get("q"); q != "" {
        filter.SearchQuery = q
    }
    if dept := r.URL.Query().Get("department_id"); dept != "" {
        if id, err := uuid.Parse(dept); err == nil {
            filter.DepartmentID = &id
        }
    }
    if active := r.URL.Query().Get("active"); active != "" {
        isActive := active == "true"
        filter.IsActive = &isActive
    }
    if limit := r.URL.Query().Get("limit"); limit != "" {
        if l, err := strconv.Atoi(limit); err == nil && l > 0 && l <= 100 {
            filter.Limit = l
        }
    }
    if page := r.URL.Query().Get("page"); page != "" {
        if p, err := strconv.Atoi(page); err == nil && p > 0 {
            filter.Offset = (p - 1) * filter.Limit
        }
    }

    employees, total, err := h.service.List(r.Context(), filter)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    page := (filter.Offset / filter.Limit) + 1
    respondJSON(w, http.StatusOK, ListResponse{
        Data:  employees,
        Total: total,
        Page:  page,
        Limit: filter.Limit,
    })
}

// Get handles GET /api/v1/employees/{id}
func (h *EmployeeHandler) Get(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    id, err := uuid.Parse(idStr)
    if err != nil {
        http.Error(w, "invalid employee id", http.StatusBadRequest)
        return
    }

    emp, err := h.service.GetDetails(r.Context(), id)
    if err != nil {
        http.Error(w, err.Error(), http.StatusNotFound)
        return
    }

    respondJSON(w, http.StatusOK, emp)
}

// Create handles POST /api/v1/employees
func (h *EmployeeHandler) Create(w http.ResponseWriter, r *http.Request) {
    tenantID, ok := middleware.TenantFromContext(r.Context())
    if !ok {
        http.Error(w, "tenant required", http.StatusBadRequest)
        return
    }

    var req CreateEmployeeRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request body", http.StatusBadRequest)
        return
    }

    entryDate, err := time.Parse("2006-01-02", req.EntryDate)
    if err != nil {
        http.Error(w, "invalid entry_date format", http.StatusBadRequest)
        return
    }

    input := service.CreateEmployeeInput{
        TenantID:           tenantID,
        PersonnelNumber:    req.PersonnelNumber,
        PIN:                req.PIN,
        FirstName:          req.FirstName,
        LastName:           req.LastName,
        Email:              req.Email,
        Phone:              req.Phone,
        EntryDate:          entryDate,
        DepartmentID:       req.DepartmentID,
        CostCenterID:       req.CostCenterID,
        EmploymentTypeID:   req.EmploymentTypeID,
        WeeklyHours:        req.WeeklyHours,
        VacationDaysPerYear: req.VacationDaysPerYear,
    }

    emp, err := h.service.Create(r.Context(), input)
    if err != nil {
        status := http.StatusInternalServerError
        if err == service.ErrPersonnelNumberExists || err == service.ErrPINExists {
            status = http.StatusConflict
        }
        http.Error(w, err.Error(), status)
        return
    }

    respondJSON(w, http.StatusCreated, emp)
}

// Update handles PUT /api/v1/employees/{id}
func (h *EmployeeHandler) Update(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    id, err := uuid.Parse(idStr)
    if err != nil {
        http.Error(w, "invalid employee id", http.StatusBadRequest)
        return
    }

    var req UpdateEmployeeRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request body", http.StatusBadRequest)
        return
    }

    input := service.UpdateEmployeeInput{
        FirstName: req.FirstName,
        LastName:  req.LastName,
        Email:     req.Email,
        Phone:     req.Phone,
        // ... map other fields
    }

    if req.ExitDate != nil {
        exitDate, err := time.Parse("2006-01-02", *req.ExitDate)
        if err == nil {
            input.ExitDate = &exitDate
        }
    }

    emp, err := h.service.Update(r.Context(), id, input)
    if err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    respondJSON(w, http.StatusOK, emp)
}

// Delete handles DELETE /api/v1/employees/{id}
func (h *EmployeeHandler) Delete(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    id, err := uuid.Parse(idStr)
    if err != nil {
        http.Error(w, "invalid employee id", http.StatusBadRequest)
        return
    }

    if err := h.service.Deactivate(r.Context(), id); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    w.WriteHeader(http.StatusNoContent)
}

// Search handles GET /api/v1/employees/search
func (h *EmployeeHandler) Search(w http.ResponseWriter, r *http.Request) {
    tenantID, ok := middleware.TenantFromContext(r.Context())
    if !ok {
        http.Error(w, "tenant required", http.StatusBadRequest)
        return
    }

    q := r.URL.Query().Get("q")
    if q == "" {
        http.Error(w, "search query required", http.StatusBadRequest)
        return
    }

    employees, err := h.service.Search(r.Context(), tenantID, q)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    respondJSON(w, http.StatusOK, employees)
}
```

## API Endpoints

- `GET /api/v1/employees` - List with pagination, search, filters
- `POST /api/v1/employees` - Create new employee
- `GET /api/v1/employees/{id}` - Get employee details
- `PUT /api/v1/employees/{id}` - Update employee
- `DELETE /api/v1/employees/{id}` - Deactivate employee
- `GET /api/v1/employees/search?q=` - Quick search

## Unit Tests

**File**: `apps/api/internal/handler/employee_test.go`

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
    "terp/apps/api/internal/repository"
    "terp/apps/api/internal/service"
)

type MockEmployeeService struct {
    mock.Mock
}

func (m *MockEmployeeService) List(ctx context.Context, filter repository.EmployeeFilter) ([]model.Employee, int64, error) {
    args := m.Called(ctx, filter)
    return args.Get(0).([]model.Employee), args.Get(1).(int64), args.Error(2)
}

func (m *MockEmployeeService) GetDetails(ctx context.Context, id uuid.UUID) (*model.Employee, error) {
    args := m.Called(ctx, id)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.Employee), args.Error(1)
}

func (m *MockEmployeeService) Create(ctx context.Context, input service.CreateEmployeeInput) (*model.Employee, error) {
    args := m.Called(ctx, input)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.Employee), args.Error(1)
}

func (m *MockEmployeeService) Update(ctx context.Context, id uuid.UUID, input service.UpdateEmployeeInput) (*model.Employee, error) {
    args := m.Called(ctx, id, input)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.Employee), args.Error(1)
}

func (m *MockEmployeeService) Deactivate(ctx context.Context, id uuid.UUID) error {
    args := m.Called(ctx, id)
    return args.Error(0)
}

func (m *MockEmployeeService) Search(ctx context.Context, tenantID uuid.UUID, query string) ([]model.Employee, error) {
    args := m.Called(ctx, tenantID, query)
    return args.Get(0).([]model.Employee), args.Error(1)
}

func TestEmployeeHandler_Create_Success(t *testing.T) {
    mockSvc := new(MockEmployeeService)
    h := NewEmployeeHandler(mockSvc)

    tenantID := uuid.New()
    employee := &model.Employee{
        ID:              uuid.New(),
        TenantID:        tenantID,
        PersonnelNumber: "E001",
        FirstName:       "John",
        LastName:        "Doe",
    }

    input := service.CreateEmployeeInput{
        TenantID:        tenantID,
        PersonnelNumber: "E001",
        PIN:             "1234",
        FirstName:       "John",
        LastName:        "Doe",
        EntryDate:       time.Now(),
    }

    mockSvc.On("Create", mock.Anything, mock.MatchedBy(func(i service.CreateEmployeeInput) bool {
        return i.PersonnelNumber == "E001" && i.FirstName == "John"
    })).Return(employee, nil)

    body := `{"personnel_number":"E001","pin":"1234","first_name":"John","last_name":"Doe","entry_date":"2024-01-01"}`
    req := httptest.NewRequest("POST", "/employees", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusCreated, rr.Code)
    var result model.Employee
    json.Unmarshal(rr.Body.Bytes(), &result)
    assert.Equal(t, "E001", result.PersonnelNumber)
}

func TestEmployeeHandler_Create_InvalidBody(t *testing.T) {
    mockSvc := new(MockEmployeeService)
    h := NewEmployeeHandler(mockSvc)

    req := httptest.NewRequest("POST", "/employees", bytes.NewBufferString("invalid"))
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestEmployeeHandler_Create_InvalidDateFormat(t *testing.T) {
    mockSvc := new(MockEmployeeService)
    h := NewEmployeeHandler(mockSvc)

    body := `{"personnel_number":"E001","pin":"1234","first_name":"John","last_name":"Doe","entry_date":"invalid"}`
    req := httptest.NewRequest("POST", "/employees", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestEmployeeHandler_Create_PersonnelNumberExists(t *testing.T) {
    mockSvc := new(MockEmployeeService)
    h := NewEmployeeHandler(mockSvc)

    mockSvc.On("Create", mock.Anything, mock.Anything).Return(nil, service.ErrPersonnelNumberExists)

    body := `{"personnel_number":"E001","pin":"1234","first_name":"John","last_name":"Doe","entry_date":"2024-01-01"}`
    req := httptest.NewRequest("POST", "/employees", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusConflict, rr.Code)
}

func TestEmployeeHandler_Create_PINExists(t *testing.T) {
    mockSvc := new(MockEmployeeService)
    h := NewEmployeeHandler(mockSvc)

    mockSvc.On("Create", mock.Anything, mock.Anything).Return(nil, service.ErrPINExists)

    body := `{"personnel_number":"E001","pin":"1234","first_name":"John","last_name":"Doe","entry_date":"2024-01-01"}`
    req := httptest.NewRequest("POST", "/employees", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusConflict, rr.Code)
}

func TestEmployeeHandler_Get_Success(t *testing.T) {
    mockSvc := new(MockEmployeeService)
    h := NewEmployeeHandler(mockSvc)

    id := uuid.New()
    employee := &model.Employee{ID: id, FirstName: "John", LastName: "Doe"}
    mockSvc.On("GetDetails", mock.Anything, id).Return(employee, nil)

    req := httptest.NewRequest("GET", "/employees/"+id.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Get(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestEmployeeHandler_Get_InvalidID(t *testing.T) {
    mockSvc := new(MockEmployeeService)
    h := NewEmployeeHandler(mockSvc)

    req := httptest.NewRequest("GET", "/employees/invalid", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Get(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestEmployeeHandler_Get_NotFound(t *testing.T) {
    mockSvc := new(MockEmployeeService)
    h := NewEmployeeHandler(mockSvc)

    id := uuid.New()
    mockSvc.On("GetDetails", mock.Anything, id).Return(nil, service.ErrEmployeeNotFound)

    req := httptest.NewRequest("GET", "/employees/"+id.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Get(rr, req)

    assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestEmployeeHandler_List_Success(t *testing.T) {
    mockSvc := new(MockEmployeeService)
    h := NewEmployeeHandler(mockSvc)

    tenantID := uuid.New()
    employees := []model.Employee{{FirstName: "John"}, {FirstName: "Jane"}}
    mockSvc.On("List", mock.Anything, mock.MatchedBy(func(f repository.EmployeeFilter) bool {
        return f.TenantID == tenantID
    })).Return(employees, int64(2), nil)

    req := httptest.NewRequest("GET", "/employees", nil)
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    rr := httptest.NewRecorder()

    h.List(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestEmployeeHandler_List_WithFilters(t *testing.T) {
    mockSvc := new(MockEmployeeService)
    h := NewEmployeeHandler(mockSvc)

    tenantID := uuid.New()
    deptID := uuid.New()
    employees := []model.Employee{{FirstName: "John"}}
    mockSvc.On("List", mock.Anything, mock.MatchedBy(func(f repository.EmployeeFilter) bool {
        return f.TenantID == tenantID && f.DepartmentID != nil && *f.DepartmentID == deptID
    })).Return(employees, int64(1), nil)

    req := httptest.NewRequest("GET", "/employees?department_id="+deptID.String()+"&active=true", nil)
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    rr := httptest.NewRecorder()

    h.List(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestEmployeeHandler_Update_Success(t *testing.T) {
    mockSvc := new(MockEmployeeService)
    h := NewEmployeeHandler(mockSvc)

    id := uuid.New()
    employee := &model.Employee{ID: id, FirstName: "John", LastName: "Smith"}
    mockSvc.On("Update", mock.Anything, id, mock.Anything).Return(employee, nil)

    body := `{"first_name":"John","last_name":"Smith"}`
    req := httptest.NewRequest("PUT", "/employees/"+id.String(), bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Update(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestEmployeeHandler_Update_InvalidID(t *testing.T) {
    mockSvc := new(MockEmployeeService)
    h := NewEmployeeHandler(mockSvc)

    body := `{"first_name":"John"}`
    req := httptest.NewRequest("PUT", "/employees/invalid", bytes.NewBufferString(body))
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Update(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestEmployeeHandler_Delete_Success(t *testing.T) {
    mockSvc := new(MockEmployeeService)
    h := NewEmployeeHandler(mockSvc)

    id := uuid.New()
    mockSvc.On("Deactivate", mock.Anything, id).Return(nil)

    req := httptest.NewRequest("DELETE", "/employees/"+id.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Delete(rr, req)

    assert.Equal(t, http.StatusNoContent, rr.Code)
}

func TestEmployeeHandler_Search_Success(t *testing.T) {
    mockSvc := new(MockEmployeeService)
    h := NewEmployeeHandler(mockSvc)

    tenantID := uuid.New()
    employees := []model.Employee{{FirstName: "John"}}
    mockSvc.On("Search", mock.Anything, tenantID, "john").Return(employees, nil)

    req := httptest.NewRequest("GET", "/employees/search?q=john", nil)
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    rr := httptest.NewRecorder()

    h.Search(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestEmployeeHandler_Search_MissingQuery(t *testing.T) {
    mockSvc := new(MockEmployeeService)
    h := NewEmployeeHandler(mockSvc)

    req := httptest.NewRequest("GET", "/employees/search", nil)
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.Search(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}
```

## Acceptance Criteria

- [x] `make test` passes
- [x] `make lint` passes
- [x] List with pagination works
- [x] Search by query string works
- [x] Filter by department and active status works
- [x] Create validates required fields
- [x] Delete soft-deletes (deactivates)
- [x] Unit tests with real database (following codebase pattern)
- [x] Tests cover all HTTP methods and error cases
