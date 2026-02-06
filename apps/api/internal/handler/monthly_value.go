package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
)

// MonthlyValueHandler handles flat monthly value routes.
type MonthlyValueHandler struct {
	monthlyValueService *service.MonthlyValueService
	monthlyCalcService  *service.MonthlyCalcService
	employeeService     *service.EmployeeService
}

// NewMonthlyValueHandler creates a new MonthlyValueHandler.
func NewMonthlyValueHandler(
	monthlyValueService *service.MonthlyValueService,
	monthlyCalcService *service.MonthlyCalcService,
	employeeService *service.EmployeeService,
) *MonthlyValueHandler {
	return &MonthlyValueHandler{
		monthlyValueService: monthlyValueService,
		monthlyCalcService:  monthlyCalcService,
		employeeService:     employeeService,
	}
}

// List handles GET /monthly-values
func (h *MonthlyValueHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	filter := repository.MonthlyValueFilter{
		TenantID: tenantID,
	}

	if empIDStr := r.URL.Query().Get("employee_id"); empIDStr != "" {
		empID, err := uuid.Parse(empIDStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid employee_id")
			return
		}
		filter.EmployeeID = &empID
	}

	if yearStr := r.URL.Query().Get("year"); yearStr != "" {
		year, err := strconv.Atoi(yearStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid year")
			return
		}
		filter.Year = &year
	}

	if monthStr := r.URL.Query().Get("month"); monthStr != "" {
		month, err := strconv.Atoi(monthStr)
		if err != nil || month < 1 || month > 12 {
			respondError(w, http.StatusBadRequest, "Invalid month")
			return
		}
		filter.Month = &month
	}

	if statusStr := r.URL.Query().Get("status"); statusStr != "" {
		switch statusStr {
		case "closed":
			closed := true
			filter.IsClosed = &closed
		case "open", "calculated":
			open := false
			filter.IsClosed = &open
		}
	}

	if deptIDStr := r.URL.Query().Get("department_id"); deptIDStr != "" {
		deptID, err := uuid.Parse(deptIDStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid department_id")
			return
		}
		filter.DepartmentID = &deptID
	}

	values, err := h.monthlyValueService.List(r.Context(), filter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list monthly values")
		return
	}

	data := make([]*models.MonthlyValue, 0, len(values))
	for i := range values {
		data = append(data, h.monthlyValueToResponse(&values[i]))
	}

	respondJSON(w, http.StatusOK, &models.MonthlyValueList{Data: data})
}

// Get handles GET /monthly-values/{id}
func (h *MonthlyValueHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid monthly value ID")
		return
	}

	mv, err := h.monthlyValueService.GetByID(r.Context(), id)
	if err != nil {
		if err == service.ErrMonthlyValueNotFound {
			respondError(w, http.StatusNotFound, "Monthly value not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to get monthly value")
		return
	}

	respondJSON(w, http.StatusOK, h.monthlyValueToResponse(mv))
}

// Close handles POST /monthly-values/{id}/close
func (h *MonthlyValueHandler) Close(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "User required")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid monthly value ID")
		return
	}

	mv, err := h.monthlyValueService.Close(r.Context(), id, user.ID)
	if err != nil {
		switch err {
		case service.ErrMonthlyValueNotFound:
			respondError(w, http.StatusNotFound, "Monthly value not found")
		case service.ErrMonthlyValueAlreadyClosed:
			respondError(w, http.StatusBadRequest, "Month is already closed")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to close month")
		}
		return
	}

	respondJSON(w, http.StatusOK, h.monthlyValueToResponse(mv))
}

// Reopen handles POST /monthly-values/{id}/reopen
func (h *MonthlyValueHandler) Reopen(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "User required")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid monthly value ID")
		return
	}

	mv, err := h.monthlyValueService.Reopen(r.Context(), id, user.ID)
	if err != nil {
		switch err {
		case service.ErrMonthlyValueNotFound:
			respondError(w, http.StatusNotFound, "Monthly value not found")
		case service.ErrMonthlyValueNotClosed:
			respondError(w, http.StatusBadRequest, "Month is not closed")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to reopen month")
		}
		return
	}

	respondJSON(w, http.StatusOK, h.monthlyValueToResponse(mv))
}

// CloseBatch handles POST /monthly-values/close-batch
func (h *MonthlyValueHandler) CloseBatch(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "User required")
		return
	}

	var req struct {
		Year         *int        `json:"year"`
		Month        *int        `json:"month"`
		EmployeeIDs  []uuid.UUID `json:"employee_ids"`
		DepartmentID *uuid.UUID  `json:"department_id"`
		Recalculate  *bool       `json:"recalculate"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.Year == nil || req.Month == nil {
		respondError(w, http.StatusBadRequest, "year and month are required")
		return
	}
	if *req.Month < 1 || *req.Month > 12 {
		respondError(w, http.StatusBadRequest, "Invalid month")
		return
	}

	// Determine which employees to close
	employeeIDs := req.EmployeeIDs
	if len(employeeIDs) == 0 {
		// Get employees from department or all active employees
		isActive := true
		empFilter := repository.EmployeeFilter{
			TenantID:     tenantID,
			IsActive:     &isActive,
			DepartmentID: req.DepartmentID,
		}
		employees, _, err := h.employeeService.List(r.Context(), empFilter)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to list employees")
			return
		}
		for _, emp := range employees {
			employeeIDs = append(employeeIDs, emp.ID)
		}
	}

	// Optionally recalculate before closing
	recalculate := true
	if req.Recalculate != nil {
		recalculate = *req.Recalculate
	}
	if recalculate && h.monthlyCalcService != nil {
		h.monthlyCalcService.CalculateMonthBatch(r.Context(), employeeIDs, *req.Year, *req.Month)
	}

	// Close each employee's month
	closedCount := 0
	skippedCount := 0
	type batchError struct {
		EmployeeID uuid.UUID `json:"employee_id"`
		Reason     string    `json:"reason"`
	}
	var errs []batchError

	// Get monthly values matching year/month for the employee list
	for _, empID := range employeeIDs {
		filter := repository.MonthlyValueFilter{
			TenantID:   tenantID,
			EmployeeID: &empID,
			Year:       req.Year,
			Month:      req.Month,
		}
		values, err := h.monthlyValueService.List(r.Context(), filter)
		if err != nil || len(values) == 0 {
			skippedCount++
			continue
		}

		mv := values[0]
		if mv.IsClosed {
			skippedCount++
			continue
		}

		_, err = h.monthlyValueService.Close(r.Context(), mv.ID, user.ID)
		if err != nil {
			errs = append(errs, batchError{EmployeeID: empID, Reason: err.Error()})
			continue
		}
		closedCount++
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"closed_count":  closedCount,
		"skipped_count": skippedCount,
		"error_count":   len(errs),
		"errors":        errs,
	})
}

// Recalculate handles POST /monthly-values/recalculate
func (h *MonthlyValueHandler) Recalculate(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req struct {
		Year       *int   `json:"year"`
		Month      *int   `json:"month"`
		EmployeeID string `json:"employee_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.Year == nil || req.Month == nil {
		respondError(w, http.StatusBadRequest, "year and month are required")
		return
	}
	if *req.Month < 1 || *req.Month > 12 {
		respondError(w, http.StatusBadRequest, "Invalid month")
		return
	}

	var employeeIDs []uuid.UUID
	if req.EmployeeID != "" {
		empID, err := uuid.Parse(req.EmployeeID)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid employee_id")
			return
		}
		employeeIDs = []uuid.UUID{empID}
	} else {
		isActive := true
		employees, _, err := h.employeeService.List(r.Context(), repository.EmployeeFilter{
			TenantID: tenantID,
			IsActive: &isActive,
		})
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to list employees")
			return
		}
		for _, emp := range employees {
			employeeIDs = append(employeeIDs, emp.ID)
		}
	}

	result := h.monthlyCalcService.CalculateMonthBatch(r.Context(), employeeIDs, *req.Year, *req.Month)

	respondJSON(w, http.StatusAccepted, map[string]interface{}{
		"message":            "Recalculation started",
		"affected_employees": result.ProcessedMonths,
	})
}

// monthlyValueToResponse converts internal MonthlyValue to API response model.
func (h *MonthlyValueHandler) monthlyValueToResponse(mv *model.MonthlyValue) *models.MonthlyValue {
	id := strfmt.UUID(mv.ID.String())
	tenantID := strfmt.UUID(mv.TenantID.String())
	employeeID := strfmt.UUID(mv.EmployeeID.String())
	year := int64(mv.Year)
	month := int64(mv.Month)

	status := "calculated"
	if mv.IsClosed {
		status = "closed"
	}

	resp := &models.MonthlyValue{
		ID:               &id,
		TenantID:         &tenantID,
		EmployeeID:       &employeeID,
		Year:             &year,
		Month:            &month,
		Status:           status,
		GrossMinutes:     int64(mv.TotalGrossTime),
		NetMinutes:       int64(mv.TotalNetTime),
		TargetMinutes:    int64(mv.TotalTargetTime),
		OvertimeMinutes:  int64(mv.TotalOvertime),
		UndertimeMinutes: int64(mv.TotalUndertime),
		BreakMinutes:     int64(mv.TotalBreakTime),
		BalanceMinutes:   int64(mv.Balance()),
		WorkedDays:       int64(mv.WorkDays),
		AbsenceDays:      float64(mv.SickDays + mv.OtherAbsenceDays),
		CreatedAt:        strfmt.DateTime(mv.CreatedAt),
		UpdatedAt:        strfmt.DateTime(mv.UpdatedAt),
	}

	if mv.ClosedAt != nil {
		dt := strfmt.DateTime(*mv.ClosedAt)
		resp.ClosedAt = &dt
	}
	if mv.ClosedBy != nil {
		uid := strfmt.UUID(mv.ClosedBy.String())
		resp.ClosedBy = &uid
	}

	return resp
}
