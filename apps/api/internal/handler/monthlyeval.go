package handler

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

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

	response := make([]map[string]interface{}, 0, len(summaries))
	for i := range summaries {
		response = append(response, h.summaryToResponse(&summaries[i]))
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"year": year,
		"data": response,
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

	response := make([]map[string]interface{}, 0, len(dailyValues))
	for _, dv := range dailyValues {
		response = append(response, h.dailyValueToResponse(&dv))
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"data": response,
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

// dailyValueToResponse converts model.DailyValue to API response map.
func (h *MonthlyEvalHandler) dailyValueToResponse(dv *model.DailyValue) map[string]interface{} {
	response := map[string]interface{}{
		"id":            dv.ID.String(),
		"employee_id":   dv.EmployeeID.String(),
		"value_date":    dv.ValueDate.Format("2006-01-02"),
		"gross_time":    dv.GrossTime,
		"net_time":      dv.NetTime,
		"target_time":   dv.TargetTime,
		"overtime":      dv.Overtime,
		"undertime":     dv.Undertime,
		"break_time":    dv.BreakTime,
		"has_error":     dv.HasError,
		"error_codes":   dv.ErrorCodes,
		"warnings":      dv.Warnings,
		"booking_count": dv.BookingCount,
	}
	if dv.FirstCome != nil {
		response["first_come"] = *dv.FirstCome
	}
	if dv.LastGo != nil {
		response["last_go"] = *dv.LastGo
	}
	return response
}

// summaryToResponse converts service.MonthSummary to API response map.
func (h *MonthlyEvalHandler) summaryToResponse(s *service.MonthSummary) map[string]interface{} {
	response := map[string]interface{}{
		"employee_id":        s.EmployeeID.String(),
		"year":               s.Year,
		"month":              s.Month,
		"total_gross_time":   s.TotalGrossTime,
		"total_net_time":     s.TotalNetTime,
		"total_target_time":  s.TotalTargetTime,
		"total_overtime":     s.TotalOvertime,
		"total_undertime":    s.TotalUndertime,
		"total_break_time":   s.TotalBreakTime,
		"flextime_start":     s.FlextimeStart,
		"flextime_change":    s.FlextimeChange,
		"flextime_end":       s.FlextimeEnd,
		"flextime_carryover": s.FlextimeCarryover,
		"vacation_taken":     s.VacationTaken.InexactFloat64(),
		"sick_days":          s.SickDays,
		"other_absence_days": s.OtherAbsenceDays,
		"work_days":          s.WorkDays,
		"days_with_errors":   s.DaysWithErrors,
		"is_closed":          s.IsClosed,
		"warnings":           s.Warnings,
	}

	// Optional fields
	if s.ClosedAt != nil {
		response["closed_at"] = strfmt.DateTime(*s.ClosedAt)
	}
	if s.ClosedBy != nil {
		response["closed_by"] = s.ClosedBy.String()
	}
	if s.ReopenedAt != nil {
		response["reopened_at"] = strfmt.DateTime(*s.ReopenedAt)
	}
	if s.ReopenedBy != nil {
		response["reopened_by"] = s.ReopenedBy.String()
	}

	return response
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
