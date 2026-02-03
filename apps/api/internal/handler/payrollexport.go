package handler

import (
	"encoding/json"
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

// PayrollExportHandler handles payroll export HTTP requests.
type PayrollExportHandler struct {
	svc *service.PayrollExportService
}

// NewPayrollExportHandler creates a new PayrollExportHandler.
func NewPayrollExportHandler(svc *service.PayrollExportService) *PayrollExportHandler {
	return &PayrollExportHandler{svc: svc}
}

// List handles GET /payroll-exports
func (h *PayrollExportHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	filter := service.PayrollExportListFilter{
		TenantID: tenantID,
	}

	if yearStr := r.URL.Query().Get("year"); yearStr != "" {
		y, err := strconv.Atoi(yearStr)
		if err == nil {
			filter.Year = &y
		}
	}
	if monthStr := r.URL.Query().Get("month"); monthStr != "" {
		m, err := strconv.Atoi(monthStr)
		if err == nil {
			filter.Month = &m
		}
	}
	if status := r.URL.Query().Get("status"); status != "" {
		filter.Status = &status
	}
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		l, err := strconv.Atoi(limitStr)
		if err == nil {
			filter.Limit = l
		}
	}
	if cursor := r.URL.Query().Get("cursor"); cursor != "" {
		parsed, err := uuid.Parse(cursor)
		if err == nil {
			filter.Cursor = &parsed
		}
	}

	exports, hasMore, err := h.svc.List(r.Context(), filter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list payroll exports")
		return
	}

	data := make([]*models.PayrollExport, 0, len(exports))
	for i := range exports {
		data = append(data, payrollExportToResponse(&exports[i]))
	}

	// Build cursor for pagination
	nextCursor := ""
	if hasMore && len(exports) > 0 {
		nextCursor = exports[len(exports)-1].ID.String()
	}

	respondJSON(w, http.StatusOK, models.PayrollExportList{
		Data: data,
		Meta: &models.PaginationMeta{
			HasMore:    hasMore,
			NextCursor: nextCursor,
		},
	})
}

// Get handles GET /payroll-exports/{id}
func (h *PayrollExportHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid export ID")
		return
	}

	pe, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		handlePayrollExportError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, payrollExportToResponse(pe))
}

// Generate handles POST /payroll-exports
func (h *PayrollExportHandler) Generate(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.GeneratePayrollExportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.GeneratePayrollExportInput{
		TenantID: tenantID,
		Year:     int(*req.Year),
		Month:    int(*req.Month),
		Format:   *req.Format,
	}
	if req.ExportType != nil {
		input.ExportType = *req.ExportType
	}

	// Parse export_interface_id
	if req.ExportInterfaceID != "" {
		parsed, err := uuid.Parse(req.ExportInterfaceID.String())
		if err == nil {
			input.ExportInterfaceID = &parsed
		}
	}

	// Parse parameters
	if req.Parameters != nil {
		for _, eid := range req.Parameters.EmployeeIds {
			parsed, err := uuid.Parse(eid.String())
			if err == nil {
				input.EmployeeIDs = append(input.EmployeeIDs, parsed)
			}
		}
		for _, did := range req.Parameters.DepartmentIds {
			parsed, err := uuid.Parse(did.String())
			if err == nil {
				input.DepartmentIDs = append(input.DepartmentIDs, parsed)
			}
		}
		for _, aid := range req.Parameters.IncludeAccounts {
			parsed, err := uuid.Parse(aid.String())
			if err == nil {
				input.IncludeAccounts = append(input.IncludeAccounts, parsed)
			}
		}
	}

	// Get current user
	if u, ok := auth.UserFromContext(r.Context()); ok {
		input.CreatedBy = &u.ID
	}

	pe, err := h.svc.Generate(r.Context(), input)
	if err != nil {
		handlePayrollExportError(w, err)
		return
	}

	respondJSON(w, http.StatusAccepted, payrollExportToResponse(pe))
}

// Delete handles DELETE /payroll-exports/{id}
func (h *PayrollExportHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid export ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handlePayrollExportError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Download handles GET /payroll-exports/{id}/download
func (h *PayrollExportHandler) Download(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid export ID")
		return
	}

	content, contentType, filename, err := h.svc.GetDownloadContent(r.Context(), id)
	if err != nil {
		handlePayrollExportError(w, err)
		return
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	w.Header().Set("Content-Length", strconv.Itoa(len(content)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(content))
}

// Preview handles GET /payroll-exports/{id}/preview
func (h *PayrollExportHandler) Preview(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid export ID")
		return
	}

	lines, pe, err := h.svc.GetPreviewData(r.Context(), id)
	if err != nil {
		handlePayrollExportError(w, err)
		return
	}

	// Map to response
	respLines := make([]map[string]interface{}, 0, len(lines))
	for _, line := range lines {
		targetHrs, _ := line.TargetHours.Float64()
		workedHrs, _ := line.WorkedHours.Float64()
		overtimeHrs, _ := line.OvertimeHours.Float64()
		vacDays, _ := line.VacationDays.Float64()
		sickDays, _ := line.SickDays.Float64()
		otherDays, _ := line.OtherAbsenceDays.Float64()

		respLines = append(respLines, map[string]interface{}{
			"employee_id":        line.EmployeeID.String(),
			"personnel_number":   line.PersonnelNumber,
			"first_name":         line.FirstName,
			"last_name":          line.LastName,
			"department_code":    line.DepartmentCode,
			"cost_center_code":   line.CostCenterCode,
			"target_hours":       targetHrs,
			"worked_hours":       workedHrs,
			"overtime_hours":     overtimeHrs,
			"account_values":     line.AccountValues,
			"vacation_days":      vacDays,
			"sick_days":          sickDays,
			"other_absence_days": otherDays,
		})
	}

	totalHrs, _ := pe.TotalHours.Float64()
	totalOT, _ := pe.TotalOvertime.Float64()

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"lines": respLines,
		"summary": map[string]interface{}{
			"employee_count": pe.EmployeeCount,
			"total_hours":    totalHrs,
			"total_overtime": totalOT,
		},
	})
}

// --- Response mapping ---

func payrollExportToResponse(pe *model.PayrollExport) *models.PayrollExport {
	id := strfmt.UUID(pe.ID.String())
	tenantID := strfmt.UUID(pe.TenantID.String())
	year := int64(pe.Year)
	month := int64(pe.Month)
	status := string(pe.Status)
	totalHrs, _ := pe.TotalHours.Float64()
	totalOT, _ := pe.TotalOvertime.Float64()

	resp := &models.PayrollExport{
		ID:            &id,
		TenantID:      &tenantID,
		Year:          &year,
		Month:         &month,
		Status:        &status,
		ExportType:    string(pe.ExportType),
		Format:        string(pe.Format),
		EmployeeCount: int64(pe.EmployeeCount),
		TotalHours:    totalHrs,
		TotalOvertime: totalOT,
		RequestedAt:   strfmt.DateTime(pe.RequestedAt),
		CreatedAt:     strfmt.DateTime(pe.CreatedAt),
		UpdatedAt:     strfmt.DateTime(pe.UpdatedAt),
	}

	if pe.ExportInterfaceID != nil {
		eiID := strfmt.UUID(pe.ExportInterfaceID.String())
		resp.ExportInterfaceID = &eiID
	}
	if pe.FileSize != nil {
		fs := int64(*pe.FileSize)
		resp.FileSize = &fs
	}
	if pe.RowCount != nil {
		rc := int64(*pe.RowCount)
		resp.RowCount = &rc
	}
	if pe.ErrorMessage != nil {
		resp.ErrorMessage = pe.ErrorMessage
	}
	if pe.StartedAt != nil {
		s := strfmt.DateTime(*pe.StartedAt)
		resp.StartedAt = &s
	}
	if pe.CompletedAt != nil {
		c := strfmt.DateTime(*pe.CompletedAt)
		resp.CompletedAt = &c
	}
	if pe.CreatedBy != nil {
		cb := strfmt.UUID(pe.CreatedBy.String())
		resp.CreatedBy = &cb
	}

	return resp
}

func handlePayrollExportError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrPayrollExportNotFound:
		respondError(w, http.StatusNotFound, "Payroll export not found")
	case service.ErrPayrollExportYearRequired:
		respondError(w, http.StatusBadRequest, "Year is required")
	case service.ErrPayrollExportMonthInvalid:
		respondError(w, http.StatusBadRequest, "Month must be between 1 and 12")
	case service.ErrPayrollExportFormatInvalid:
		respondError(w, http.StatusBadRequest, "Format must be csv, xlsx, xml, or json")
	case service.ErrPayrollExportNotReady:
		respondError(w, http.StatusConflict, "Export is not ready (still generating or failed)")
	case service.ErrPayrollExportFailed:
		respondError(w, http.StatusInternalServerError, "Export generation failed")
	case service.ErrPayrollExportMonthNotClosed:
		respondError(w, http.StatusConflict, "Month is not closed for all employees in scope")
	case service.ErrPayrollExportFutureMonth:
		respondError(w, http.StatusBadRequest, "Cannot generate export for a future month")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
