package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/calculation"
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
	totalInt64 := total
	response := models.BookingList{
		Data:  make([]*models.Booking, 0, len(bookings)),
		Total: &totalInt64,
	}
	for i := range bookings {
		response.Data = append(response.Data, h.modelToResponse(&bookings[i]))
	}

	respondJSON(w, http.StatusOK, response)
}

// modelToResponse converts internal model to API response model.
func (h *BookingHandler) modelToResponse(b *model.Booking) *models.Booking {
	id := strfmt.UUID(b.ID.String())
	tenantID := strfmt.UUID(b.TenantID.String())
	employeeID := strfmt.UUID(b.EmployeeID.String())
	bookingTypeID := strfmt.UUID(b.BookingTypeID.String())
	date := strfmt.Date(b.BookingDate)
	source := string(b.Source)
	timeStr := timeutil.MinutesToString(b.EditedTime)
	originalTime := int64(b.OriginalTime)
	editedTime := int64(b.EditedTime)

	resp := &models.Booking{
		ID:            &id,
		TenantID:      &tenantID,
		EmployeeID:    &employeeID,
		BookingDate:   &date,
		BookingTypeID: &bookingTypeID,
		OriginalTime:  &originalTime,
		EditedTime:    &editedTime,
		Source:        &source,
		TimeString:    timeStr,
		CreatedAt:     strfmt.DateTime(b.CreatedAt),
		UpdatedAt:     strfmt.DateTime(b.UpdatedAt),
	}

	// Optional notes
	if b.Notes != "" {
		resp.Notes = &b.Notes
	}

	// Optional calculated time
	if b.CalculatedTime != nil {
		calcTime := int64(*b.CalculatedTime)
		resp.CalculatedTime = &calcTime
	}

	// Optional pair ID
	if b.PairID != nil {
		pairID := strfmt.UUID(b.PairID.String())
		resp.PairID = &pairID
	}

	// Optional terminal ID
	if b.TerminalID != nil {
		terminalID := strfmt.UUID(b.TerminalID.String())
		resp.TerminalID = &terminalID
	}

	// Optional created by
	if b.CreatedBy != nil {
		createdBy := strfmt.UUID(b.CreatedBy.String())
		resp.CreatedBy = &createdBy
	}

	// Optional updated by
	if b.UpdatedBy != nil {
		updatedBy := strfmt.UUID(b.UpdatedBy.String())
		resp.UpdatedBy = &updatedBy
	}

	// Nested booking type relation
	if b.BookingType != nil {
		btID := strfmt.UUID(b.BookingType.ID.String())
		direction := string(b.BookingType.Direction)
		resp.BookingType.ID = &btID
		resp.BookingType.Code = &b.BookingType.Code
		resp.BookingType.Name = &b.BookingType.Name
		resp.BookingType.Direction = &direction
	}

	return resp
}

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
	for i := range bookings {
		response.Bookings = append(response.Bookings, h.modelToResponse(&bookings[i]))
	}

	// Add daily value if exists
	if dailyValue != nil {
		dvResp := h.dailyValueToResponse(dailyValue)
		if dvResp != nil {
			response.DailyValue = struct{ models.DailyValue }{DailyValue: *dvResp}
			response.Errors = dvResp.Errors
		}
	}

	// Add day plan summary if exists
	if empDayPlan != nil && empDayPlan.DayPlan != nil {
		dp := empDayPlan.DayPlan
		dpID := strfmt.UUID(dp.ID.String())
		planType := string(dp.PlanType)
		response.DayPlan.ID = &dpID
		response.DayPlan.Code = &dp.Code
		response.DayPlan.Name = &dp.Name
		response.DayPlan.PlanType = &planType
	}

	// Add holiday if exists
	if holiday != nil {
		hID := strfmt.UUID(holiday.ID.String())
		response.Holiday.ID = &hID
		response.Holiday.Name = &holiday.Name
	}

	return response
}

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
	tenantID := strfmt.UUID(dv.TenantID.String())
	empID := strfmt.UUID(dv.EmployeeID.String())
	date := strfmt.Date(dv.ValueDate)
	status := string(dv.Status)
	if status == "" {
		if dv.HasError {
			status = "error"
		} else {
			status = "calculated"
		}
	}

	return &models.DailyValue{
		ID:               &id,
		TenantID:         &tenantID,
		EmployeeID:       &empID,
		ValueDate:        &date,
		GrossMinutes:     int64(dv.GrossTime),
		NetMinutes:       int64(dv.NetTime),
		TargetMinutes:    int64(dv.TargetTime),
		OvertimeMinutes:  int64(dv.Overtime),
		UndertimeMinutes: int64(dv.Undertime),
		BreakMinutes:     int64(dv.BreakTime),
		BalanceMinutes:   int64(dv.Balance()),
		HasErrors:        dv.HasError,
		Status:           &status,
		Errors:           buildDailyErrors(dv),
	}
}

func buildDailyErrors(dv *model.DailyValue) []*models.DailyError {
	if dv == nil {
		return nil
	}

	errorCount := len(dv.ErrorCodes) + len(dv.Warnings)
	if errorCount == 0 {
		return nil
	}

	dailyValueID := strfmt.UUID(dv.ID.String())
	errors := make([]*models.DailyError, 0, errorCount)

	appendError := func(code string, severity string) {
		if code == "" {
			return
		}

		id := strfmt.UUID(uuid.NewString())
		errorType := mapDailyErrorType(code)
		message := code

		errors = append(errors, &models.DailyError{
			ID:           &id,
			DailyValueID: &dailyValueID,
			ErrorType:    &errorType,
			Message:      &message,
			Severity:     severity,
		})
	}

	for _, code := range dv.ErrorCodes {
		appendError(code, models.DailyErrorSeverityError)
	}
	for _, code := range dv.Warnings {
		appendError(code, models.DailyErrorSeverityWarning)
	}

	if len(errors) == 0 {
		return nil
	}

	return errors
}

func mapDailyErrorType(code string) string {
	switch code {
	case calculation.ErrCodeMissingCome,
		calculation.ErrCodeMissingGo,
		calculation.ErrCodeNoBookings:
		return models.DailyErrorErrorTypeMissingBooking
	case calculation.ErrCodeUnpairedBooking:
		return models.DailyErrorErrorTypeUnpairedBooking
	case calculation.ErrCodeDuplicateInTime:
		return models.DailyErrorErrorTypeOverlappingBookings
	case calculation.ErrCodeEarlyCome,
		calculation.ErrCodeLateCome,
		calculation.ErrCodeEarlyGo,
		calculation.ErrCodeLateGo,
		calculation.ErrCodeMissedCoreStart,
		calculation.ErrCodeMissedCoreEnd:
		return models.DailyErrorErrorTypeCoreTimeViolation
	case calculation.ErrCodeBelowMinWorkTime:
		return models.DailyErrorErrorTypeBelowMinHours
	case calculation.WarnCodeNoBreakRecorded,
		calculation.WarnCodeShortBreak,
		calculation.WarnCodeManualBreak,
		calculation.WarnCodeAutoBreakApplied:
		return models.DailyErrorErrorTypeBreakViolation
	case calculation.WarnCodeMaxTimeReached:
		return models.DailyErrorErrorTypeExceedsMaxHours
	case calculation.WarnCodeCrossMidnight,
		calculation.WarnCodeMonthlyCap,
		calculation.WarnCodeFlextimeCapped,
		calculation.WarnCodeBelowThreshold,
		calculation.WarnCodeNoCarryover,
		calculation.ErrCodeInvalidTime,
		calculation.ErrCodeNoMatchingShift:
		return models.DailyErrorErrorTypeInvalidSequence
	default:
		return models.DailyErrorErrorTypeInvalidSequence
	}
}
