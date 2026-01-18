# TICKET-073: Create Booking Handler

**Type**: Handler
**Effort**: M
**Sprint**: 17 - Booking Service & Handler
**Dependencies**: TICKET-072

## Description

Create the Booking HTTP handler with CRUD and day view endpoints.

## Files to Create

- `apps/api/internal/handler/booking.go`

## Implementation

```go
package handler

import (
    "encoding/json"
    "net/http"
    "time"

    "github.com/go-chi/chi/v5"
    "github.com/google/uuid"

    "terp/apps/api/internal/middleware"
    "terp/apps/api/internal/model"
    "terp/apps/api/internal/service"
)

type BookingHandler struct {
    service     service.BookingService
    calcService service.DailyCalcService
}

func NewBookingHandler(s service.BookingService, cs service.DailyCalcService) *BookingHandler {
    return &BookingHandler{service: s, calcService: cs}
}

type CreateBookingRequest struct {
    EmployeeID    uuid.UUID `json:"employee_id"`
    BookingDate   string    `json:"booking_date"` // YYYY-MM-DD
    BookingTypeID uuid.UUID `json:"booking_type_id"`
    Time          string    `json:"time"` // HH:MM
    Notes         string    `json:"notes,omitempty"`
}

type UpdateBookingRequest struct {
    Time  *string `json:"time,omitempty"` // HH:MM
    Notes *string `json:"notes,omitempty"`
}

// List handles GET /api/v1/bookings
func (h *BookingHandler) List(w http.ResponseWriter, r *http.Request) {
    tenantID, ok := middleware.TenantFromContext(r.Context())
    if !ok {
        http.Error(w, "tenant required", http.StatusBadRequest)
        return
    }

    filter := repository.BookingFilter{
        TenantID: tenantID,
    }

    if empID := r.URL.Query().Get("employee_id"); empID != "" {
        id, err := uuid.Parse(empID)
        if err == nil {
            filter.EmployeeID = &id
        }
    }
    if from := r.URL.Query().Get("from"); from != "" {
        if t, err := time.Parse("2006-01-02", from); err == nil {
            filter.DateFrom = &t
        }
    }
    if to := r.URL.Query().Get("to"); to != "" {
        if t, err := time.Parse("2006-01-02", to); err == nil {
            filter.DateTo = &t
        }
    }

    // Pagination...

    bookings, total, err := h.service.List(r.Context(), filter)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    respondJSON(w, http.StatusOK, map[string]interface{}{
        "data":  bookings,
        "total": total,
    })
}

// Create handles POST /api/v1/bookings
func (h *BookingHandler) Create(w http.ResponseWriter, r *http.Request) {
    tenantID, ok := middleware.TenantFromContext(r.Context())
    if !ok {
        http.Error(w, "tenant required", http.StatusBadRequest)
        return
    }

    var req CreateBookingRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request body", http.StatusBadRequest)
        return
    }

    bookingDate, err := time.Parse("2006-01-02", req.BookingDate)
    if err != nil {
        http.Error(w, "invalid booking_date format", http.StatusBadRequest)
        return
    }

    timeMinutes, err := parseTimeString(req.Time)
    if err != nil {
        http.Error(w, "invalid time format (use HH:MM)", http.StatusBadRequest)
        return
    }

    input := service.CreateBookingInput{
        TenantID:      tenantID,
        EmployeeID:    req.EmployeeID,
        BookingDate:   bookingDate,
        BookingTypeID: req.BookingTypeID,
        Time:          timeMinutes,
        Source:        model.BookingSourceWeb,
        Notes:         req.Notes,
    }

    booking, err := h.service.Create(r.Context(), input)
    if err != nil {
        status := http.StatusInternalServerError
        if err == service.ErrInvalidBookingTime {
            status = http.StatusBadRequest
        } else if err == service.ErrMonthClosed {
            status = http.StatusForbidden
        }
        http.Error(w, err.Error(), status)
        return
    }

    respondJSON(w, http.StatusCreated, booking)
}

// Update handles PUT /api/v1/bookings/{id}
func (h *BookingHandler) Update(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    id, err := uuid.Parse(idStr)
    if err != nil {
        http.Error(w, "invalid booking id", http.StatusBadRequest)
        return
    }

    var req UpdateBookingRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request body", http.StatusBadRequest)
        return
    }

    input := service.UpdateBookingInput{}
    if req.Time != nil {
        timeMinutes, err := parseTimeString(*req.Time)
        if err != nil {
            http.Error(w, "invalid time format", http.StatusBadRequest)
            return
        }
        input.Time = &timeMinutes
    }
    input.Notes = req.Notes

    booking, err := h.service.Update(r.Context(), id, input)
    if err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    respondJSON(w, http.StatusOK, booking)
}

// Delete handles DELETE /api/v1/bookings/{id}
func (h *BookingHandler) Delete(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    id, err := uuid.Parse(idStr)
    if err != nil {
        http.Error(w, "invalid booking id", http.StatusBadRequest)
        return
    }

    if err := h.service.Delete(r.Context(), id); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    w.WriteHeader(http.StatusNoContent)
}

// GetDayView handles GET /api/v1/employees/{id}/day/{date}
func (h *BookingHandler) GetDayView(w http.ResponseWriter, r *http.Request) {
    empIDStr := chi.URLParam(r, "id")
    employeeID, err := uuid.Parse(empIDStr)
    if err != nil {
        http.Error(w, "invalid employee id", http.StatusBadRequest)
        return
    }

    dateStr := chi.URLParam(r, "date")
    date, err := time.Parse("2006-01-02", dateStr)
    if err != nil {
        http.Error(w, "invalid date format", http.StatusBadRequest)
        return
    }

    view, err := h.service.GetDayView(r.Context(), employeeID, date)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    respondJSON(w, http.StatusOK, view)
}

// Calculate handles POST /api/v1/employees/{id}/day/{date}/calculate
func (h *BookingHandler) Calculate(w http.ResponseWriter, r *http.Request) {
    empIDStr := chi.URLParam(r, "id")
    employeeID, err := uuid.Parse(empIDStr)
    if err != nil {
        http.Error(w, "invalid employee id", http.StatusBadRequest)
        return
    }

    dateStr := chi.URLParam(r, "date")
    date, err := time.Parse("2006-01-02", dateStr)
    if err != nil {
        http.Error(w, "invalid date format", http.StatusBadRequest)
        return
    }

    dailyValue, err := h.calcService.CalculateDay(r.Context(), employeeID, date)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    respondJSON(w, http.StatusOK, dailyValue)
}

func parseTimeString(s string) (int, error) {
    // Implementation in model/booking.go
    return model.ParseTimeString(s)
}
```

## API Endpoints

- `GET /api/v1/bookings` - List with filters
- `POST /api/v1/bookings` - Create booking
- `GET /api/v1/bookings/{id}` - Get booking
- `PUT /api/v1/bookings/{id}` - Update booking
- `DELETE /api/v1/bookings/{id}` - Delete booking
- `GET /api/v1/employees/{id}/day/{date}` - Day view
- `POST /api/v1/employees/{id}/day/{date}/calculate` - Manual recalc

## Unit Tests

**File**: `apps/api/internal/handler/booking_test.go`

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

type MockBookingService struct {
    mock.Mock
}

func (m *MockBookingService) List(ctx context.Context, filter repository.BookingFilter) ([]model.Booking, int64, error) {
    args := m.Called(ctx, filter)
    return args.Get(0).([]model.Booking), args.Get(1).(int64), args.Error(2)
}

func (m *MockBookingService) Create(ctx context.Context, input service.CreateBookingInput) (*model.Booking, error) {
    args := m.Called(ctx, input)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.Booking), args.Error(1)
}

func (m *MockBookingService) Update(ctx context.Context, id uuid.UUID, input service.UpdateBookingInput) (*model.Booking, error) {
    args := m.Called(ctx, id, input)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.Booking), args.Error(1)
}

func (m *MockBookingService) Delete(ctx context.Context, id uuid.UUID) error {
    args := m.Called(ctx, id)
    return args.Error(0)
}

func (m *MockBookingService) GetDayView(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.DayView, error) {
    args := m.Called(ctx, employeeID, date)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.DayView), args.Error(1)
}

type MockDailyCalcService struct {
    mock.Mock
}

func (m *MockDailyCalcService) CalculateDay(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error) {
    args := m.Called(ctx, employeeID, date)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.DailyValue), args.Error(1)
}

func TestBookingHandler_Create_Success(t *testing.T) {
    mockSvc := new(MockBookingService)
    mockCalc := new(MockDailyCalcService)
    h := NewBookingHandler(mockSvc, mockCalc)

    tenantID := uuid.New()
    employeeID := uuid.New()
    booking := &model.Booking{
        ID:         uuid.New(),
        EmployeeID: employeeID,
    }

    mockSvc.On("Create", mock.Anything, mock.MatchedBy(func(i service.CreateBookingInput) bool {
        return i.EmployeeID == employeeID && i.TenantID == tenantID
    })).Return(booking, nil)

    body := `{"employee_id":"` + employeeID.String() + `","booking_date":"2024-01-01","booking_type_id":"` + uuid.New().String() + `","time":"08:00"}`
    req := httptest.NewRequest("POST", "/bookings", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusCreated, rr.Code)
}

func TestBookingHandler_Create_InvalidBody(t *testing.T) {
    mockSvc := new(MockBookingService)
    mockCalc := new(MockDailyCalcService)
    h := NewBookingHandler(mockSvc, mockCalc)

    req := httptest.NewRequest("POST", "/bookings", bytes.NewBufferString("invalid"))
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestBookingHandler_Create_InvalidTimeFormat(t *testing.T) {
    mockSvc := new(MockBookingService)
    mockCalc := new(MockDailyCalcService)
    h := NewBookingHandler(mockSvc, mockCalc)

    employeeID := uuid.New()
    body := `{"employee_id":"` + employeeID.String() + `","booking_date":"2024-01-01","booking_type_id":"` + uuid.New().String() + `","time":"invalid"}`
    req := httptest.NewRequest("POST", "/bookings", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestBookingHandler_Create_MonthClosed(t *testing.T) {
    mockSvc := new(MockBookingService)
    mockCalc := new(MockDailyCalcService)
    h := NewBookingHandler(mockSvc, mockCalc)

    mockSvc.On("Create", mock.Anything, mock.Anything).Return(nil, service.ErrMonthClosed)

    employeeID := uuid.New()
    body := `{"employee_id":"` + employeeID.String() + `","booking_date":"2024-01-01","booking_type_id":"` + uuid.New().String() + `","time":"08:00"}`
    req := httptest.NewRequest("POST", "/bookings", bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", uuid.New()))
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusForbidden, rr.Code)
}

func TestBookingHandler_List_Success(t *testing.T) {
    mockSvc := new(MockBookingService)
    mockCalc := new(MockDailyCalcService)
    h := NewBookingHandler(mockSvc, mockCalc)

    tenantID := uuid.New()
    bookings := []model.Booking{{ID: uuid.New()}}
    mockSvc.On("List", mock.Anything, mock.MatchedBy(func(f repository.BookingFilter) bool {
        return f.TenantID == tenantID
    })).Return(bookings, int64(1), nil)

    req := httptest.NewRequest("GET", "/bookings", nil)
    req = req.WithContext(context.WithValue(req.Context(), "tenant_id", tenantID))
    rr := httptest.NewRecorder()

    h.List(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestBookingHandler_Update_Success(t *testing.T) {
    mockSvc := new(MockBookingService)
    mockCalc := new(MockDailyCalcService)
    h := NewBookingHandler(mockSvc, mockCalc)

    id := uuid.New()
    booking := &model.Booking{ID: id}
    mockSvc.On("Update", mock.Anything, id, mock.Anything).Return(booking, nil)

    body := `{"time":"09:00"}`
    req := httptest.NewRequest("PUT", "/bookings/"+id.String(), bytes.NewBufferString(body))
    req.Header.Set("Content-Type", "application/json")
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Update(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestBookingHandler_Delete_Success(t *testing.T) {
    mockSvc := new(MockBookingService)
    mockCalc := new(MockDailyCalcService)
    h := NewBookingHandler(mockSvc, mockCalc)

    id := uuid.New()
    mockSvc.On("Delete", mock.Anything, id).Return(nil)

    req := httptest.NewRequest("DELETE", "/bookings/"+id.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", id.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Delete(rr, req)

    assert.Equal(t, http.StatusNoContent, rr.Code)
}

func TestBookingHandler_GetDayView_Success(t *testing.T) {
    mockSvc := new(MockBookingService)
    mockCalc := new(MockDailyCalcService)
    h := NewBookingHandler(mockSvc, mockCalc)

    employeeID := uuid.New()
    date, _ := time.Parse("2006-01-02", "2024-01-01")
    dayView := &model.DayView{EmployeeID: employeeID, Date: date}
    mockSvc.On("GetDayView", mock.Anything, employeeID, date).Return(dayView, nil)

    req := httptest.NewRequest("GET", "/employees/"+employeeID.String()+"/day/2024-01-01", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", employeeID.String())
    rctx.URLParams.Add("date", "2024-01-01")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.GetDayView(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}

func TestBookingHandler_GetDayView_InvalidDate(t *testing.T) {
    mockSvc := new(MockBookingService)
    mockCalc := new(MockDailyCalcService)
    h := NewBookingHandler(mockSvc, mockCalc)

    employeeID := uuid.New()
    req := httptest.NewRequest("GET", "/employees/"+employeeID.String()+"/day/invalid", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", employeeID.String())
    rctx.URLParams.Add("date", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.GetDayView(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestBookingHandler_Calculate_Success(t *testing.T) {
    mockSvc := new(MockBookingService)
    mockCalc := new(MockDailyCalcService)
    h := NewBookingHandler(mockSvc, mockCalc)

    employeeID := uuid.New()
    date, _ := time.Parse("2006-01-02", "2024-01-01")
    dailyValue := &model.DailyValue{EmployeeID: employeeID}
    mockCalc.On("CalculateDay", mock.Anything, employeeID, date).Return(dailyValue, nil)

    req := httptest.NewRequest("POST", "/employees/"+employeeID.String()+"/day/2024-01-01/calculate", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", employeeID.String())
    rctx.URLParams.Add("date", "2024-01-01")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Calculate(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] `make lint` passes
- [ ] List with date range and employee filters
- [ ] Create accepts HH:MM time format
- [ ] GetDayView returns complete day info
- [ ] Calculate endpoint triggers manual recalculation
- [ ] Unit tests with mocked service
- [ ] Tests cover all HTTP methods and error cases
