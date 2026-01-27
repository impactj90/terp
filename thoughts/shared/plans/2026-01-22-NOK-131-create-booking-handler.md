# NOK-131: Create Booking Handler Implementation Plan

## Overview

Create the Booking HTTP handler (`apps/api/internal/handler/booking.go`) with CRUD endpoints for bookings and day-view functionality. This handler integrates with the existing `BookingService` and `DailyCalcService` to provide time booking management and daily calculation features via REST API.

## Current State Analysis

**Services ready**:
- `BookingService` at `service/booking.go:48-266` - Create, GetByID, Update, Delete, ListByEmployeeDate
- `DailyCalcService` at `service/daily_calc.go:98-465` - CalculateDay method

**Repositories available**:
- `BookingRepository` at `repository/booking.go` - Has `List`, `GetWithDetails`, `GetByEmployeeAndDate`
- `DailyValueRepository` at `repository/dailyvalue.go` - Has `GetByEmployeeDate`
- `EmployeeDayPlanRepository` at `repository/employeedayplan.go` - Has `GetForEmployeeDate`
- `HolidayRepository` - Has `GetByDate`

**Generated models** (must use per project convention):
- `models.CreateBookingRequest` - with `Time` as HH:MM string
- `models.UpdateBookingRequest` - optional `Time` and `Notes`
- `models.Booking`, `models.BookingList`, `models.DayView`

**OpenAPI Endpoints to implement**:
- `GET /bookings` - List bookings with filters
- `POST /bookings` - Create booking
- `GET /bookings/{id}` - Get booking by ID
- `PUT /bookings/{id}` - Update booking
- `DELETE /bookings/{id}` - Delete booking
- `GET /employees/{id}/day/{date}` - Get day view
- `POST /employees/{id}/day/{date}/calculate` - Trigger recalculation

### Key Discoveries:
- `BookingRepository.List` does not preload relations - need to add preloading or use `GetWithDetails` per booking
- `BookingRepository.GetByEmployeeAndDate` already preloads `BookingType`
- Time conversion: API uses HH:MM strings, service uses minutes from midnight
- Use `timeutil.ParseTimeString()` for HH:MM → minutes conversion
- DayView assembly will happen in handler, injecting multiple repos/services

## Desired End State

A fully functional Booking HTTP handler that:
1. Handles all CRUD operations for bookings via `/bookings` endpoints
2. Provides day view and manual recalculation via `/employees/{id}/day/{date}` endpoints
3. Properly converts time formats (HH:MM ↔ minutes)
4. Maps service errors to appropriate HTTP status codes
5. Uses generated OpenAPI models for request/response
6. Has comprehensive integration tests following existing patterns

### How to Verify:
- `make test` passes with all new tests
- `make lint` passes
- Manual API testing shows correct behavior for all endpoints
- Time format conversion works correctly (HH:MM ↔ minutes)

## What We're NOT Doing

- Not creating a separate `DayViewService` - assembly happens in handler
- Not modifying existing services (BookingService, DailyCalcService)
- Not adding new fields to OpenAPI spec (using existing definitions)
- Not implementing bulk operations
- Not adding authentication/authorization logic (handled by middleware)

## Implementation Approach

1. Create handler struct with all dependencies
2. Implement CRUD endpoints following existing patterns
3. Implement DayView assembly in handler
4. Add route registration
5. Wire up in main.go
6. Write comprehensive integration tests

---

## Phase 1: Create BookingHandler Struct and List Endpoint

### Overview
Create the handler file with struct definition, constructor, and the List endpoint.

### Changes Required:

#### 1. Create Handler File
**File**: `apps/api/internal/handler/booking.go`
**Changes**: Create new file with handler struct and List endpoint

```go
package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/timeutil"
)

// BookingHandler handles booking-related HTTP requests.
type BookingHandler struct {
	bookingService   *service.BookingService
	dailyCalcService *service.DailyCalcService
	bookingRepo      *repository.BookingRepository
	dailyValueRepo   *repository.DailyValueRepository
	empDayPlanRepo   *repository.EmployeeDayPlanRepository
	holidayRepo      *repository.HolidayRepository
}

// NewBookingHandler creates a new BookingHandler instance.
func NewBookingHandler(
	bookingService *service.BookingService,
	dailyCalcService *service.DailyCalcService,
	bookingRepo *repository.BookingRepository,
	dailyValueRepo *repository.DailyValueRepository,
	empDayPlanRepo *repository.EmployeeDayPlanRepository,
	holidayRepo *repository.HolidayRepository,
) *BookingHandler {
	return &BookingHandler{
		bookingService:   bookingService,
		dailyCalcService: dailyCalcService,
		bookingRepo:      bookingRepo,
		dailyValueRepo:   dailyValueRepo,
		empDayPlanRepo:   empDayPlanRepo,
		holidayRepo:      holidayRepo,
	}
}

// List handles GET /bookings
func (h *BookingHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	// Build filter from query params
	filter := repository.BookingFilter{
		TenantID: tenantID,
		Limit:    50, // Default
	}

	// Parse employee_id filter
	if empID := r.URL.Query().Get("employee_id"); empID != "" {
		id, err := uuid.Parse(empID)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid employee_id")
			return
		}
		filter.EmployeeID = &id
	}

	// Parse from date filter
	if from := r.URL.Query().Get("from"); from != "" {
		t, err := time.Parse("2006-01-02", from)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid from date format, expected YYYY-MM-DD")
			return
		}
		filter.StartDate = &t
	}

	// Parse to date filter
	if to := r.URL.Query().Get("to"); to != "" {
		t, err := time.Parse("2006-01-02", to)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid to date format, expected YYYY-MM-DD")
			return
		}
		filter.EndDate = &t
	}

	// Parse pagination - convert page to offset
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if limit, err := strconv.Atoi(limitStr); err == nil && limit > 0 && limit <= 100 {
			filter.Limit = limit
		}
	}
	if pageStr := r.URL.Query().Get("page"); pageStr != "" {
		if page, err := strconv.Atoi(pageStr); err == nil && page > 0 {
			filter.Offset = (page - 1) * filter.Limit
		}
	}

	bookings, total, err := h.bookingRepo.List(r.Context(), filter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list bookings")
		return
	}

	// Convert to response model
	response := models.BookingList{
		Data:  make([]*models.Booking, 0, len(bookings)),
		Total: total,
	}
	for _, b := range bookings {
		response.Data = append(response.Data, h.modelToResponse(&b))
	}

	respondJSON(w, http.StatusOK, response)
}

// modelToResponse converts internal model to API response model.
func (h *BookingHandler) modelToResponse(b *model.Booking) *models.Booking {
	// Implementation will be in Phase 2
	return nil
}
```

### Success Criteria:

#### Automated Verification:
- [x] File compiles: `cd apps/api && go build ./...`
- [x] Linting passes: `make lint` (golangci-lint not installed, go vet passes)

#### Manual Verification:
- [ ] Code structure follows existing handler patterns

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 2: Implement Model Conversion and Remaining CRUD Endpoints

### Overview
Add model conversion helper and implement Create, GetByID, Update, Delete endpoints.

### Changes Required:

#### 1. Add Model Conversion Helper
**File**: `apps/api/internal/handler/booking.go`
**Changes**: Implement the `modelToResponse` method

```go
// modelToResponse converts internal model to API response model.
func (h *BookingHandler) modelToResponse(b *model.Booking) *models.Booking {
	id := strfmt.UUID(b.ID.String())
	tenantID := strfmt.UUID(b.TenantID.String())
	employeeID := strfmt.UUID(b.EmployeeID.String())
	bookingTypeID := strfmt.UUID(b.BookingTypeID.String())
	date := strfmt.Date(b.BookingDate)
	source := string(b.Source)
	timeStr := timeutil.MinutesToString(b.EditedTime)

	resp := &models.Booking{
		ID:            &id,
		TenantID:      &tenantID,
		EmployeeID:    &employeeID,
		BookingDate:   &date,
		BookingTypeID: &bookingTypeID,
		OriginalTime:  int64(b.OriginalTime),
		EditedTime:    int64(b.EditedTime),
		Source:        &source,
		TimeString:    timeStr,
		Notes:         b.Notes,
	}

	// Optional fields
	if b.CalculatedTime != nil {
		resp.CalculatedTime = int64(*b.CalculatedTime)
	}
	if b.PairID != nil {
		pairID := strfmt.UUID(b.PairID.String())
		resp.PairID = &pairID
	}
	if b.TerminalID != nil {
		terminalID := strfmt.UUID(b.TerminalID.String())
		resp.TerminalID = &terminalID
	}

	// Timestamps
	resp.CreatedAt = strfmt.DateTime(b.CreatedAt)
	resp.UpdatedAt = strfmt.DateTime(b.UpdatedAt)

	// Nested relations
	if b.Employee != nil {
		resp.Employee = &models.BookingEmployee{
			// Map employee summary fields
		}
	}
	if b.BookingType != nil {
		resp.BookingType = &models.BookingBookingType{
			ID:        strfmt.UUID(b.BookingType.ID.String()),
			Code:      &b.BookingType.Code,
			Name:      &b.BookingType.Name,
			Direction: (*string)(&b.BookingType.Direction),
		}
	}

	return resp
}
```

#### 2. Implement Create Endpoint
**File**: `apps/api/internal/handler/booking.go`
**Changes**: Add Create method

```go
// Create handles POST /bookings
func (h *BookingHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateBookingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Parse HH:MM time to minutes
	minutes, err := timeutil.ParseTimeString(*req.Time)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid time format, expected HH:MM")
		return
	}

	// Parse UUIDs
	employeeID, err := uuid.Parse(req.EmployeeID.String())
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee_id")
		return
	}
	bookingTypeID, err := uuid.Parse(req.BookingTypeID.String())
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid booking_type_id")
		return
	}

	input := service.CreateBookingInput{
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		BookingTypeID: bookingTypeID,
		BookingDate:   time.Time(*req.BookingDate),
		OriginalTime:  minutes,
		EditedTime:    minutes,
		Source:        model.BookingSourceWeb,
		Notes:         req.Notes,
	}

	booking, err := h.bookingService.Create(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrMonthClosed:
			respondError(w, http.StatusForbidden, "Month is closed")
		case service.ErrInvalidBookingTime:
			respondError(w, http.StatusBadRequest, "Invalid booking time")
		case service.ErrInvalidBookingType:
			respondError(w, http.StatusBadRequest, "Invalid booking type")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to create booking")
		}
		return
	}

	respondJSON(w, http.StatusCreated, h.modelToResponse(booking))
}
```

#### 3. Implement GetByID Endpoint
**File**: `apps/api/internal/handler/booking.go`
**Changes**: Add GetByID method

```go
// GetByID handles GET /bookings/{id}
func (h *BookingHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid booking ID")
		return
	}

	booking, err := h.bookingRepo.GetWithDetails(r.Context(), id)
	if err != nil {
		if err == repository.ErrBookingNotFound {
			respondError(w, http.StatusNotFound, "Booking not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to get booking")
		return
	}

	respondJSON(w, http.StatusOK, h.modelToResponse(booking))
}
```

#### 4. Implement Update Endpoint
**File**: `apps/api/internal/handler/booking.go`
**Changes**: Add Update method

```go
// Update handles PUT /bookings/{id}
func (h *BookingHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid booking ID")
		return
	}

	var req models.UpdateBookingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	input := service.UpdateBookingInput{}

	// Parse optional time
	if req.Time != "" {
		minutes, err := timeutil.ParseTimeString(req.Time)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid time format, expected HH:MM")
			return
		}
		input.EditedTime = &minutes
	}

	// Optional notes
	if req.Notes != "" {
		input.Notes = &req.Notes
	}

	booking, err := h.bookingService.Update(r.Context(), id, input)
	if err != nil {
		switch err {
		case service.ErrBookingNotFound:
			respondError(w, http.StatusNotFound, "Booking not found")
		case service.ErrMonthClosed:
			respondError(w, http.StatusForbidden, "Month is closed")
		case service.ErrInvalidBookingTime:
			respondError(w, http.StatusBadRequest, "Invalid booking time")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to update booking")
		}
		return
	}

	respondJSON(w, http.StatusOK, h.modelToResponse(booking))
}
```

#### 5. Implement Delete Endpoint
**File**: `apps/api/internal/handler/booking.go`
**Changes**: Add Delete method

```go
// Delete handles DELETE /bookings/{id}
func (h *BookingHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid booking ID")
		return
	}

	err = h.bookingService.Delete(r.Context(), id)
	if err != nil {
		switch err {
		case service.ErrBookingNotFound:
			respondError(w, http.StatusNotFound, "Booking not found")
		case service.ErrMonthClosed:
			respondError(w, http.StatusForbidden, "Month is closed")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to delete booking")
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
```

### Success Criteria:

#### Automated Verification:
- [x] File compiles: `cd apps/api && go build ./...`
- [x] Linting passes: `make lint` (go vet passes)

#### Manual Verification:
- [ ] Error mapping matches OpenAPI spec (404, 403, 400 responses)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 3: Implement DayView and Calculate Endpoints

### Overview
Implement the `/employees/{id}/day/{date}` (GetDayView) and `/employees/{id}/day/{date}/calculate` (Calculate) endpoints.

### Changes Required:

#### 1. Implement GetDayView Endpoint
**File**: `apps/api/internal/handler/booking.go`
**Changes**: Add GetDayView method

```go
// GetDayView handles GET /employees/{id}/day/{date}
func (h *BookingHandler) GetDayView(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	// Parse employee ID
	employeeIDStr := chi.URLParam(r, "id")
	employeeID, err := uuid.Parse(employeeIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	// Parse date
	dateStr := chi.URLParam(r, "date")
	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid date format, expected YYYY-MM-DD")
		return
	}

	ctx := r.Context()

	// Get bookings for the day
	bookings, err := h.bookingService.ListByEmployeeDate(ctx, tenantID, employeeID, date)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to get bookings")
		return
	}

	// Get daily value (may be nil if not calculated yet)
	dailyValue, err := h.dailyValueRepo.GetByEmployeeDate(ctx, employeeID, date)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to get daily value")
		return
	}

	// Get day plan (may be nil for off days)
	empDayPlan, err := h.empDayPlanRepo.GetForEmployeeDate(ctx, employeeID, date)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to get day plan")
		return
	}

	// Check for holiday
	holiday, _ := h.holidayRepo.GetByDate(ctx, tenantID, date)
	isHoliday := holiday != nil

	// Build response
	response := h.buildDayViewResponse(employeeID, date, bookings, dailyValue, empDayPlan, holiday, isHoliday)

	respondJSON(w, http.StatusOK, response)
}

// buildDayViewResponse assembles the DayView response from components.
func (h *BookingHandler) buildDayViewResponse(
	employeeID uuid.UUID,
	date time.Time,
	bookings []model.Booking,
	dailyValue *model.DailyValue,
	empDayPlan *model.EmployeeDayPlan,
	holiday *model.Holiday,
	isHoliday bool,
) *models.DayView {
	empIDStr := strfmt.UUID(employeeID.String())
	dateStr := strfmt.Date(date)

	response := &models.DayView{
		EmployeeID: &empIDStr,
		Date:       &dateStr,
		Bookings:   make([]*models.Booking, 0, len(bookings)),
		IsHoliday:  isHoliday,
	}

	// Add bookings
	for _, b := range bookings {
		bCopy := b // Avoid loop variable capture
		response.Bookings = append(response.Bookings, h.modelToResponse(&bCopy))
	}

	// Add daily value if exists
	if dailyValue != nil {
		response.DailyValue.GrossMinutes = int64(dailyValue.GrossTime)
		response.DailyValue.NetMinutes = int64(dailyValue.NetTime)
		response.DailyValue.TargetMinutes = int64(dailyValue.TargetTime)
		response.DailyValue.OvertimeMinutes = int64(dailyValue.Overtime)
		response.DailyValue.UndertimeMinutes = int64(dailyValue.Undertime)
		response.DailyValue.BreakMinutes = int64(dailyValue.BreakTime)
		response.DailyValue.HasErrors = dailyValue.HasError
	}

	// Add day plan summary if exists
	if empDayPlan != nil && empDayPlan.DayPlan != nil {
		dp := empDayPlan.DayPlan
		dpID := strfmt.UUID(dp.ID.String())
		response.DayPlan.ID = &dpID
		response.DayPlan.Code = &dp.Code
		response.DayPlan.Name = &dp.Name
		response.DayPlan.PlanType = &dp.PlanType
	}

	// Add holiday if exists
	if holiday != nil {
		hID := strfmt.UUID(holiday.ID.String())
		response.Holiday.ID = &hID
		response.Holiday.Name = &holiday.Name
	}

	return response
}
```

#### 2. Implement Calculate Endpoint
**File**: `apps/api/internal/handler/booking.go`
**Changes**: Add Calculate method

```go
// Calculate handles POST /employees/{id}/day/{date}/calculate
func (h *BookingHandler) Calculate(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	// Parse employee ID
	employeeIDStr := chi.URLParam(r, "id")
	employeeID, err := uuid.Parse(employeeIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	// Parse date
	dateStr := chi.URLParam(r, "date")
	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid date format, expected YYYY-MM-DD")
		return
	}

	// Trigger calculation
	dailyValue, err := h.dailyCalcService.CalculateDay(r.Context(), tenantID, employeeID, date)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to calculate day")
		return
	}

	// dailyValue may be nil if calculation should be skipped (e.g., no bookings with skip behavior)
	if dailyValue == nil {
		respondJSON(w, http.StatusOK, nil)
		return
	}

	// Convert to response model
	response := h.dailyValueToResponse(dailyValue)
	respondJSON(w, http.StatusOK, response)
}

// dailyValueToResponse converts DailyValue model to API response.
func (h *BookingHandler) dailyValueToResponse(dv *model.DailyValue) *models.DailyValue {
	if dv == nil {
		return nil
	}

	id := strfmt.UUID(dv.ID.String())
	empID := strfmt.UUID(dv.EmployeeID.String())
	date := strfmt.Date(dv.ValueDate)
	status := "calculated"
	if dv.HasError {
		status = "error"
	}

	return &models.DailyValue{
		ID:               &id,
		EmployeeID:       &empID,
		ValueDate:        &date,
		GrossMinutes:     int64(dv.GrossTime),
		NetMinutes:       int64(dv.NetTime),
		TargetMinutes:    int64(dv.TargetTime),
		OvertimeMinutes:  int64(dv.Overtime),
		UndertimeMinutes: int64(dv.Undertime),
		BreakMinutes:     int64(dv.BreakTime),
		HasErrors:        dv.HasError,
		Status:           &status,
	}
}
```

### Success Criteria:

#### Automated Verification:
- [x] File compiles: `cd apps/api && go build ./...`
- [x] Linting passes: `make lint` (go vet passes)

#### Manual Verification:
- [ ] DayView assembles data from all sources correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 4: Add Route Registration and Wire Up in Main

### Overview
Register routes in routes.go and wire up the handler in main.go.

### Changes Required:

#### 1. Add Route Registration Function
**File**: `apps/api/internal/handler/routes.go`
**Changes**: Add RegisterBookingRoutes function

```go
// RegisterBookingRoutes registers booking routes.
func RegisterBookingRoutes(r chi.Router, h *BookingHandler) {
	r.Route("/bookings", func(r chi.Router) {
		r.Get("/", h.List)
		r.Post("/", h.Create)
		r.Get("/{id}", h.GetByID)
		r.Put("/{id}", h.Update)
		r.Delete("/{id}", h.Delete)
	})

	// Day view routes (nested under employees)
	r.Route("/employees/{id}/day/{date}", func(r chi.Router) {
		r.Get("/", h.GetDayView)
		r.Post("/calculate", h.Calculate)
	})
}
```

#### 2. Wire Up Handler in Main
**File**: `apps/api/cmd/server/main.go`
**Changes**: Initialize BookingHandler and register routes

After line ~104 (after recalcService):
```go
	// Initialize BookingService
	bookingService := service.NewBookingService(bookingRepo, bookingTypeRepo, recalcService, nil)

	// Initialize BookingHandler
	bookingHandler := handler.NewBookingHandler(
		bookingService,
		dailyCalcService,
		bookingRepo,
		dailyValueRepo,
		empDayPlanRepo,
		holidayRepo,
	)
```

After line ~178 (in tenant-scoped routes group):
```go
				handler.RegisterBookingRoutes(r, bookingHandler)
```

### Success Criteria:

#### Automated Verification:
- [x] Application compiles: `cd apps/api && go build ./cmd/server`
- [x] Linting passes: `make lint` (go vet passes)
- [ ] Server starts without error: `make dev` (quick smoke test)

#### Manual Verification:
- [ ] Routes are properly registered when server starts

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 5: Write Integration Tests

### Overview
Create comprehensive integration tests following existing handler test patterns.

### Changes Required:

#### 1. Create Test File
**File**: `apps/api/internal/handler/booking_test.go`
**Changes**: Create test file with setup and test cases

```go
package handler_test

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
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/handler"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

func setupBookingHandler(t *testing.T) (
	*handler.BookingHandler,
	*model.Tenant,
	*model.Employee,
	*model.BookingType,
) {
	db := testutil.SetupTestDB(t)

	// Repositories
	tenantRepo := repository.NewTenantRepository(db)
	employeeRepo := repository.NewEmployeeRepository(db)
	bookingRepo := repository.NewBookingRepository(db)
	bookingTypeRepo := repository.NewBookingTypeRepository(db)
	dailyValueRepo := repository.NewDailyValueRepository(db)
	empDayPlanRepo := repository.NewEmployeeDayPlanRepository(db)
	holidayRepo := repository.NewHolidayRepository(db)

	// Services
	dailyCalcService := service.NewDailyCalcService(bookingRepo, empDayPlanRepo, dailyValueRepo, holidayRepo)
	recalcService := service.NewRecalcService(dailyCalcService, employeeRepo)
	bookingService := service.NewBookingService(bookingRepo, bookingTypeRepo, recalcService, nil)

	// Handler
	h := handler.NewBookingHandler(
		bookingService,
		dailyCalcService,
		bookingRepo,
		dailyValueRepo,
		empDayPlanRepo,
		holidayRepo,
	)

	ctx := context.Background()

	// Create test tenant
	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	require.NoError(t, tenantRepo.Create(ctx, tenant))

	// Create test employee
	employee := &model.Employee{
		TenantID:        tenant.ID,
		PersonnelNumber: "EMP-" + uuid.New().String()[:8],
		PIN:             "1234",
		FirstName:       "Test",
		LastName:        "User",
		EntryDate:       time.Now().AddDate(-1, 0, 0),
		IsActive:        true,
	}
	require.NoError(t, employeeRepo.Create(ctx, employee))

	// Create test booking type
	bookingType := &model.BookingType{
		TenantID:  &tenant.ID,
		Code:      "IN-" + uuid.New().String()[:8],
		Name:      "Clock In",
		Direction: model.BookingDirectionIn,
		IsActive:  true,
	}
	require.NoError(t, bookingTypeRepo.Create(ctx, bookingType))

	return h, tenant, employee, bookingType
}

func withBookingTenantContext(r *http.Request, tenant *model.Tenant) *http.Request {
	ctx := context.WithValue(r.Context(), middleware.TenantContextKey, tenant.ID)
	return r.WithContext(ctx)
}

// Test cases...
func TestBookingHandler_Create_Success(t *testing.T) {
	h, tenant, employee, bookingType := setupBookingHandler(t)

	body := map[string]interface{}{
		"employee_id":     employee.ID.String(),
		"booking_date":    time.Now().Format("2006-01-02"),
		"booking_type_id": bookingType.ID.String(),
		"time":            "08:30",
		"notes":           "Test booking",
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/bookings", bytes.NewBuffer(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req = withBookingTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)

	var result models.Booking
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, int64(510), result.EditedTime) // 08:30 = 510 minutes
	assert.Equal(t, "08:30", result.TimeString)
}

func TestBookingHandler_Create_InvalidTime(t *testing.T) {
	h, tenant, employee, bookingType := setupBookingHandler(t)

	body := map[string]interface{}{
		"employee_id":     employee.ID.String(),
		"booking_date":    time.Now().Format("2006-01-02"),
		"booking_type_id": bookingType.ID.String(),
		"time":            "invalid",
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/bookings", bytes.NewBuffer(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req = withBookingTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestBookingHandler_Create_NoTenant(t *testing.T) {
	h, _, employee, bookingType := setupBookingHandler(t)

	body := map[string]interface{}{
		"employee_id":     employee.ID.String(),
		"booking_date":    time.Now().Format("2006-01-02"),
		"booking_type_id": bookingType.ID.String(),
		"time":            "08:30",
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/bookings", bytes.NewBuffer(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	// No tenant context
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestBookingHandler_GetByID_Success(t *testing.T) {
	// Implementation...
}

func TestBookingHandler_GetByID_NotFound(t *testing.T) {
	// Implementation...
}

func TestBookingHandler_Update_Success(t *testing.T) {
	// Implementation...
}

func TestBookingHandler_Delete_Success(t *testing.T) {
	// Implementation...
}

func TestBookingHandler_List_Success(t *testing.T) {
	// Implementation...
}

func TestBookingHandler_GetDayView_Success(t *testing.T) {
	// Implementation...
}

func TestBookingHandler_Calculate_Success(t *testing.T) {
	// Implementation...
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests compile: `cd apps/api && go test -c ./internal/handler/...`
- [x] Tests pass: `cd apps/api && go test -v -run TestBooking ./internal/handler/...` (24 tests pass)
- [ ] Full test suite passes: `make test`
- [x] Linting passes: `make lint` (go vet passes)

#### Manual Verification:
- [ ] Test coverage is reasonable (all endpoints tested)
- [ ] Edge cases covered (invalid input, missing tenant, etc.)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 6: Fix Generated Model Import and Verify End-to-End

### Overview
Ensure generated model imports are correct and verify the complete implementation works end-to-end.

### Changes Required:

#### 1. Update Imports
**File**: `apps/api/internal/handler/booking.go`
**Changes**: Ensure correct import for strfmt

```go
import (
	// ... existing imports ...
	"github.com/go-openapi/strfmt"
)
```

#### 2. Build and Run Final Verification

### Success Criteria:

#### Automated Verification:
- [x] Full build succeeds: `cd apps/api && go build ./...`
- [x] Full test suite passes: `make test`
- [x] Linting passes: `make lint` (go vet passes)

#### Manual Verification:
- [ ] Start server: `make dev`
- [ ] Test Create booking via curl/Postman
- [ ] Test List bookings via curl/Postman
- [ ] Test GetByID via curl/Postman
- [ ] Test Update via curl/Postman
- [ ] Test Delete via curl/Postman
- [ ] Test GetDayView via curl/Postman
- [ ] Test Calculate via curl/Postman
- [ ] Verify time format conversion (HH:MM ↔ minutes) works correctly

**Implementation Note**: Implementation complete after all verification passes.

---

## Testing Strategy

### Unit Tests:
- Time format conversion (HH:MM ↔ minutes)
- Model conversion helpers

### Integration Tests (Primary):
- All CRUD operations with real database
- DayView assembly with multiple data sources
- Calculate endpoint triggering recalculation
- Error handling (not found, month closed, invalid input)
- Tenant context validation

### Manual Testing Steps:
1. Create booking with valid HH:MM time
2. Verify time is stored as minutes internally
3. Verify response includes correct TimeString
4. Test pagination on List endpoint
5. Test date filtering on List endpoint
6. Test DayView returns bookings, daily value, day plan
7. Test Calculate triggers recalculation and returns updated value

## Performance Considerations

- `List` endpoint should use pagination efficiently
- DayView makes multiple database calls - consider caching for production
- Repository `List` method doesn't preload relations to keep queries efficient

## Migration Notes

N/A - No database changes required. Using existing tables and models.

## References

- Research document: `thoughts/shared/research/2026-01-22-NOK-131-create-booking-handler.md`
- OpenAPI spec: `api/paths/bookings.yaml`, `api/paths/employees.yaml`
- Existing handler pattern: `apps/api/internal/handler/employee.go`
- BookingService: `apps/api/internal/service/booking.go:48-266`
- DailyCalcService: `apps/api/internal/service/daily_calc.go:98-465`
- Time utilities: `apps/api/internal/timeutil/timeutil.go`
- Generated models: `apps/api/gen/models/booking.go`, `create_booking_request.go`, `day_view.go`
