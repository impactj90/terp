package handler

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

// MonthlyEvalHandler handles monthly evaluation HTTP requests.
type MonthlyEvalHandler struct {
	monthlyEvalService *service.MonthlyEvalService
	employeeService    *service.EmployeeService
}

var errMonthlyEvalScopeDenied = errors.New("employee access denied by scope")

// NewMonthlyEvalHandler creates a new MonthlyEvalHandler instance.
func NewMonthlyEvalHandler(monthlyEvalService *service.MonthlyEvalService, employeeService *service.EmployeeService) *MonthlyEvalHandler {
	return &MonthlyEvalHandler{
		monthlyEvalService: monthlyEvalService,
		employeeService:    employeeService,
	}
}

// GetMonthSummary handles GET /employees/{id}/months/{year}/{month}
func (h *MonthlyEvalHandler) GetMonthSummary(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}
	_ = tenantID // used for auth context

	// Parse employee ID
	employeeIDStr := chi.URLParam(r, "id")
	employeeID, err := uuid.Parse(employeeIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}
	if err := h.ensureEmployeeScope(r.Context(), employeeID); err != nil {
		if errors.Is(err, service.ErrEmployeeNotFound) {
			respondError(w, http.StatusNotFound, "Employee not found")
			return
		}
		if errors.Is(err, errMonthlyEvalScopeDenied) {
			respondError(w, http.StatusForbidden, "Permission denied")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to verify access")
		return
	}

	// Parse year
	yearStr := chi.URLParam(r, "year")
	year, err := strconv.Atoi(yearStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid year")
		return
	}

	// Parse month
	monthStr := chi.URLParam(r, "month")
	month, err := strconv.Atoi(monthStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid month")
		return
	}

	summary, err := h.monthlyEvalService.GetMonthSummary(r.Context(), employeeID, year, month)
	if err != nil {
		h.handleServiceError(w, err, "get month summary")
		return
	}

	respondJSON(w, http.StatusOK, h.summaryToResponse(summary))
}

// GetYearOverview handles GET /employees/{id}/months/{year}
func (h *MonthlyEvalHandler) GetYearOverview(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}
	_ = tenantID // used for auth context

	// Parse employee ID
	employeeIDStr := chi.URLParam(r, "id")
	employeeID, err := uuid.Parse(employeeIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	// Parse year
	yearStr := chi.URLParam(r, "year")
	year, err := strconv.Atoi(yearStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid year")
		return
	}

	summaries, err := h.monthlyEvalService.GetYearOverview(r.Context(), employeeID, year)
	if err != nil {
		h.handleServiceError(w, err, "get year overview")
		return
	}

	data := make([]*models.MonthSummaryResponse, 0, len(summaries))
	for i := range summaries {
		data = append(data, h.summaryToResponse(&summaries[i]))
	}

	respondJSON(w, http.StatusOK, &models.YearOverviewResponse{
		Year: int64(year),
		Data: data,
	})
}

// CloseMonth handles POST /employees/{id}/months/{year}/{month}/close
func (h *MonthlyEvalHandler) CloseMonth(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}
	_ = tenantID // used for auth context

	// Get user for closedBy
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "User required")
		return
	}

	// Parse employee ID
	employeeIDStr := chi.URLParam(r, "id")
	employeeID, err := uuid.Parse(employeeIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	// Parse year
	yearStr := chi.URLParam(r, "year")
	year, err := strconv.Atoi(yearStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid year")
		return
	}

	// Parse month
	monthStr := chi.URLParam(r, "month")
	month, err := strconv.Atoi(monthStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid month")
		return
	}

	err = h.monthlyEvalService.CloseMonth(r.Context(), employeeID, year, month, user.ID)
	if err != nil {
		h.handleServiceError(w, err, "close month")
		return
	}

	// Return updated summary
	summary, err := h.monthlyEvalService.GetMonthSummary(r.Context(), employeeID, year, month)
	if err != nil {
		h.handleServiceError(w, err, "get month summary")
		return
	}

	respondJSON(w, http.StatusOK, h.summaryToResponse(summary))
}

// ReopenMonth handles POST /employees/{id}/months/{year}/{month}/reopen
func (h *MonthlyEvalHandler) ReopenMonth(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}
	_ = tenantID // used for auth context

	// Get user for reopenedBy
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "User required")
		return
	}

	// Parse employee ID
	employeeIDStr := chi.URLParam(r, "id")
	employeeID, err := uuid.Parse(employeeIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	// Parse year
	yearStr := chi.URLParam(r, "year")
	year, err := strconv.Atoi(yearStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid year")
		return
	}

	// Parse month
	monthStr := chi.URLParam(r, "month")
	month, err := strconv.Atoi(monthStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid month")
		return
	}

	err = h.monthlyEvalService.ReopenMonth(r.Context(), employeeID, year, month, user.ID)
	if err != nil {
		h.handleServiceError(w, err, "reopen month")
		return
	}

	// Return updated summary
	summary, err := h.monthlyEvalService.GetMonthSummary(r.Context(), employeeID, year, month)
	if err != nil {
		h.handleServiceError(w, err, "get month summary")
		return
	}

	respondJSON(w, http.StatusOK, h.summaryToResponse(summary))
}

// GetDailyBreakdown handles GET /employees/{id}/months/{year}/{month}/days
func (h *MonthlyEvalHandler) GetDailyBreakdown(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}
	_ = tenantID // used for auth context

	// Parse employee ID
	employeeIDStr := chi.URLParam(r, "id")
	employeeID, err := uuid.Parse(employeeIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	// Parse year
	yearStr := chi.URLParam(r, "year")
	year, err := strconv.Atoi(yearStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid year")
		return
	}

	// Parse month
	monthStr := chi.URLParam(r, "month")
	month, err := strconv.Atoi(monthStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid month")
		return
	}

	dailyValues, err := h.monthlyEvalService.GetDailyBreakdown(r.Context(), employeeID, year, month)
	if err != nil {
		h.handleServiceError(w, err, "get daily breakdown")
		return
	}

	data := make([]*models.DailyBreakdownItem, 0, len(dailyValues))
	for _, dv := range dailyValues {
		data = append(data, h.dailyValueToResponse(&dv))
	}

	respondJSON(w, http.StatusOK, &models.DailyBreakdownResponse{
		Data: data,
	})
}

// Recalculate handles POST /employees/{id}/months/{year}/{month}/recalculate
func (h *MonthlyEvalHandler) Recalculate(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}
	_ = tenantID // used for auth context

	// Parse employee ID
	employeeIDStr := chi.URLParam(r, "id")
	employeeID, err := uuid.Parse(employeeIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	// Parse year
	yearStr := chi.URLParam(r, "year")
	year, err := strconv.Atoi(yearStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid year")
		return
	}

	// Parse month
	monthStr := chi.URLParam(r, "month")
	month, err := strconv.Atoi(monthStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid month")
		return
	}

	err = h.monthlyEvalService.RecalculateMonth(r.Context(), employeeID, year, month)
	if err != nil {
		h.handleServiceError(w, err, "recalculate month")
		return
	}

	// Return updated summary
	summary, err := h.monthlyEvalService.GetMonthSummary(r.Context(), employeeID, year, month)
	if err != nil {
		h.handleServiceError(w, err, "get month summary")
		return
	}

	respondJSON(w, http.StatusOK, h.summaryToResponse(summary))
}

// handleServiceError maps service errors to HTTP responses.
func (h *MonthlyEvalHandler) handleServiceError(w http.ResponseWriter, err error, operation string) {
	switch err {
	case service.ErrMonthClosed:
		respondError(w, http.StatusForbidden, "Month is closed")
	case service.ErrMonthNotClosed:
		respondError(w, http.StatusBadRequest, "Month is not closed")
	case service.ErrInvalidMonth:
		respondError(w, http.StatusBadRequest, "Invalid month")
	case service.ErrInvalidYearMonth:
		respondError(w, http.StatusBadRequest, "Invalid year or month")
	case service.ErrMonthlyValueNotFound:
		respondError(w, http.StatusNotFound, "Monthly value not found")
	case service.ErrEmployeeNotFoundForEval:
		respondError(w, http.StatusNotFound, "Employee not found")
	default:
		respondError(w, http.StatusInternalServerError, "Failed to "+operation)
	}
}

// dailyValueToResponse converts model.DailyValue to generated API response model.
func (h *MonthlyEvalHandler) dailyValueToResponse(dv *model.DailyValue) *models.DailyBreakdownItem {
	item := &models.DailyBreakdownItem{
		ID:           strfmt.UUID(dv.ID.String()),
		EmployeeID:   strfmt.UUID(dv.EmployeeID.String()),
		ValueDate:    strfmt.Date(dv.ValueDate),
		GrossTime:    int64(dv.GrossTime),
		NetTime:      int64(dv.NetTime),
		TargetTime:   int64(dv.TargetTime),
		Overtime:     int64(dv.Overtime),
		Undertime:    int64(dv.Undertime),
		BreakTime:    int64(dv.BreakTime),
		HasError:     dv.HasError,
		ErrorCodes:   dv.ErrorCodes,
		Warnings:     dv.Warnings,
		BookingCount: int64(dv.BookingCount),
		FirstCome:    minutesToHHMM(dv.FirstCome),
		LastGo:       minutesToHHMM(dv.LastGo),
	}
	return item
}

// summaryToResponse converts service.MonthSummary to generated API response model.
func (h *MonthlyEvalHandler) summaryToResponse(s *service.MonthSummary) *models.MonthSummaryResponse {
	resp := &models.MonthSummaryResponse{
		EmployeeID:        strfmt.UUID(s.EmployeeID.String()),
		Year:              int64(s.Year),
		Month:             int64(s.Month),
		TotalGrossTime:    int64(s.TotalGrossTime),
		TotalNetTime:      int64(s.TotalNetTime),
		TotalTargetTime:   int64(s.TotalTargetTime),
		TotalOvertime:     int64(s.TotalOvertime),
		TotalUndertime:    int64(s.TotalUndertime),
		TotalBreakTime:    int64(s.TotalBreakTime),
		FlextimeStart:     int64(s.FlextimeStart),
		FlextimeChange:    int64(s.FlextimeChange),
		FlextimeEnd:       int64(s.FlextimeEnd),
		FlextimeCarryover: int64(s.FlextimeCarryover),
		VacationTaken:     s.VacationTaken.InexactFloat64(),
		SickDays:          int64(s.SickDays),
		OtherAbsenceDays:  int64(s.OtherAbsenceDays),
		WorkDays:          int64(s.WorkDays),
		DaysWithErrors:    int64(s.DaysWithErrors),
		IsClosed:          s.IsClosed,
		Warnings:          s.Warnings,
	}

	// Optional fields
	if s.ClosedAt != nil {
		dt := strfmt.DateTime(*s.ClosedAt)
		resp.ClosedAt = &dt
	}
	if s.ClosedBy != nil {
		uid := strfmt.UUID(s.ClosedBy.String())
		resp.ClosedBy = &uid
	}
	if s.ReopenedAt != nil {
		dt := strfmt.DateTime(*s.ReopenedAt)
		resp.ReopenedAt = &dt
	}
	if s.ReopenedBy != nil {
		uid := strfmt.UUID(s.ReopenedBy.String())
		resp.ReopenedBy = &uid
	}

	return resp
}

// minutesToHHMM converts a minutes-from-midnight value to HH:MM string.
// Returns nil if the input is nil.
func minutesToHHMM(minutes *int) *string {
	if minutes == nil {
		return nil
	}
	s := fmt.Sprintf("%02d:%02d", *minutes/60, *minutes%60)
	return &s
}

func (h *MonthlyEvalHandler) ensureEmployeeScope(ctx context.Context, employeeID uuid.UUID) error {
	emp, err := h.employeeService.GetByID(ctx, employeeID)
	if err != nil {
		return err
	}

	scope, err := scopeFromContext(ctx)
	if err != nil {
		return err
	}
	if tenantID, ok := middleware.TenantFromContext(ctx); ok {
		if !scope.AllowsTenant(tenantID) {
			return errMonthlyEvalScopeDenied
		}
	}
	if !scope.AllowsEmployee(emp) {
		return errMonthlyEvalScopeDenied
	}
	return nil
}
