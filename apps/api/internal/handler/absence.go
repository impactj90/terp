package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

// AbsenceHandler handles absence-related HTTP requests.
type AbsenceHandler struct {
	absenceService *service.AbsenceService
}

// NewAbsenceHandler creates a new AbsenceHandler instance.
func NewAbsenceHandler(absenceService *service.AbsenceService) *AbsenceHandler {
	return &AbsenceHandler{
		absenceService: absenceService,
	}
}

// ListTypes handles GET /absence-types
func (h *AbsenceHandler) ListTypes(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	types, err := h.absenceService.ListTypes(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list absence types")
		return
	}

	response := models.AbsenceTypeList{
		Data: make([]*models.AbsenceType, 0, len(types)),
	}
	for i := range types {
		response.Data = append(response.Data, h.absenceTypeToResponse(&types[i]))
	}

	respondJSON(w, http.StatusOK, response)
}

// ListByEmployee handles GET /employees/{id}/absences
func (h *AbsenceHandler) ListByEmployee(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}
	_ = tenantID // used for auth context only; queries filter by employeeID

	// Parse employee ID
	employeeIDStr := chi.URLParam(r, "id")
	employeeID, err := uuid.Parse(employeeIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	// Check for date range filters
	var absences []model.AbsenceDay

	fromStr := r.URL.Query().Get("from")
	toStr := r.URL.Query().Get("to")

	if fromStr != "" && toStr != "" {
		from, parseErr := time.Parse("2006-01-02", fromStr)
		if parseErr != nil {
			respondError(w, http.StatusBadRequest, "Invalid from date format, expected YYYY-MM-DD")
			return
		}
		to, parseErr := time.Parse("2006-01-02", toStr)
		if parseErr != nil {
			respondError(w, http.StatusBadRequest, "Invalid to date format, expected YYYY-MM-DD")
			return
		}
		var svcErr error
		absences, svcErr = h.absenceService.GetByEmployeeDateRange(r.Context(), employeeID, from, to)
		if svcErr != nil {
			if svcErr == service.ErrInvalidAbsenceDates {
				respondError(w, http.StatusBadRequest, "Invalid date range: from must be before or equal to to")
				return
			}
			respondError(w, http.StatusInternalServerError, "Failed to list absences")
			return
		}
	} else {
		var svcErr error
		absences, svcErr = h.absenceService.ListByEmployee(r.Context(), employeeID)
		if svcErr != nil {
			respondError(w, http.StatusInternalServerError, "Failed to list absences")
			return
		}
	}

	response := models.AbsenceList{
		Data: make([]*models.Absence, 0, len(absences)),
	}
	for i := range absences {
		response.Data = append(response.Data, h.absenceDayToResponse(&absences[i]))
	}

	respondJSON(w, http.StatusOK, response)
}

// CreateRange handles POST /employees/{id}/absences
func (h *AbsenceHandler) CreateRange(w http.ResponseWriter, r *http.Request) {
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

	// Parse request body
	var req models.CreateAbsenceRangeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Parse absence type ID
	absenceTypeID, err := uuid.Parse(req.AbsenceTypeID.String())
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid absence_type_id")
		return
	}

	// Build service input
	input := service.CreateAbsenceRangeInput{
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		AbsenceTypeID: absenceTypeID,
		FromDate:      time.Time(*req.From),
		ToDate:        time.Time(*req.To),
		Duration:      decimal.NewFromFloat(*req.Duration),
		Status:        model.AbsenceStatusApproved, // Admin-created absences are auto-approved
	}

	// Optional notes
	if req.Notes != "" {
		input.Notes = &req.Notes
	}

	result, svcErr := h.absenceService.CreateRange(r.Context(), input)
	if svcErr != nil {
		switch svcErr {
		case service.ErrInvalidAbsenceType:
			respondError(w, http.StatusBadRequest, "Invalid absence type")
		case service.ErrAbsenceTypeInactive:
			respondError(w, http.StatusBadRequest, "Absence type is inactive")
		case service.ErrInvalidAbsenceDates:
			respondError(w, http.StatusBadRequest, "Invalid date range: from must be before or equal to to")
		case service.ErrNoAbsenceDaysCreated:
			respondError(w, http.StatusBadRequest, "No valid absence days in range (all dates skipped)")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to create absences")
		}
		return
	}

	// Return created absences
	response := models.AbsenceList{
		Data: make([]*models.Absence, 0, len(result.CreatedDays)),
	}
	for i := range result.CreatedDays {
		response.Data = append(response.Data, h.absenceDayToResponse(&result.CreatedDays[i]))
	}

	respondJSON(w, http.StatusCreated, response)
}

// Delete handles DELETE /absences/{id}
func (h *AbsenceHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid absence ID")
		return
	}

	err = h.absenceService.Delete(r.Context(), id)
	if err != nil {
		switch err {
		case service.ErrAbsenceNotFound:
			respondError(w, http.StatusNotFound, "Absence not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to delete absence")
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// absenceDayToResponse converts internal model to API response model.
func (h *AbsenceHandler) absenceDayToResponse(ad *model.AbsenceDay) *models.Absence {
	id := strfmt.UUID(ad.ID.String())
	tenantID := strfmt.UUID(ad.TenantID.String())
	employeeID := strfmt.UUID(ad.EmployeeID.String())
	absenceTypeID := strfmt.UUID(ad.AbsenceTypeID.String())
	date := strfmt.Date(ad.AbsenceDate)
	duration := ad.Duration.InexactFloat64()
	status := string(ad.Status)

	resp := &models.Absence{
		ID:            &id,
		TenantID:      &tenantID,
		EmployeeID:    &employeeID,
		AbsenceTypeID: &absenceTypeID,
		AbsenceDate:   &date,
		Duration:      &duration,
		Status:        status,
		Notes:         ad.Notes,
		CreatedAt:     strfmt.DateTime(ad.CreatedAt),
		UpdatedAt:     strfmt.DateTime(ad.UpdatedAt),
	}

	// Optional created by
	if ad.CreatedBy != nil {
		createdBy := strfmt.UUID(ad.CreatedBy.String())
		resp.CreatedBy = &createdBy
	}

	// Optional approved by
	if ad.ApprovedBy != nil {
		approvedBy := strfmt.UUID(ad.ApprovedBy.String())
		resp.ApprovedBy = &approvedBy
	}

	// Optional approved at
	if ad.ApprovedAt != nil {
		approvedAt := strfmt.DateTime(*ad.ApprovedAt)
		resp.ApprovedAt = &approvedAt
	}

	// Nested absence type relation
	if ad.AbsenceType != nil {
		atID := strfmt.UUID(ad.AbsenceType.ID.String())
		category := mapAbsenceCategory(ad.AbsenceType.Category)
		resp.AbsenceType.ID = &atID
		resp.AbsenceType.Code = &ad.AbsenceType.Code
		resp.AbsenceType.Name = &ad.AbsenceType.Name
		resp.AbsenceType.Category = &category
		resp.AbsenceType.Color = ad.AbsenceType.Color
	}

	return resp
}

// absenceTypeToResponse converts internal absence type model to API response model.
func (h *AbsenceHandler) absenceTypeToResponse(at *model.AbsenceType) *models.AbsenceType {
	id := strfmt.UUID(at.ID.String())
	category := mapAbsenceCategory(at.Category)

	resp := &models.AbsenceType{
		ID:                     &id,
		Code:                   &at.Code,
		Name:                   &at.Name,
		Description:            at.Description,
		Category:               &category,
		Color:                  at.Color,
		IsActive:               at.IsActive,
		IsSystem:               at.IsSystem,
		IsPaid:                 at.Portion != model.AbsencePortionNone,
		AffectsVacationBalance: at.DeductsVacation,
		RequiresApproval:       at.RequiresApproval,
		CreatedAt:              strfmt.DateTime(at.CreatedAt),
		UpdatedAt:              strfmt.DateTime(at.UpdatedAt),
	}

	// Optional tenant ID (nil for system types)
	if at.TenantID != nil {
		tenantID := strfmt.UUID(at.TenantID.String())
		resp.TenantID = &tenantID
	}

	return resp
}

// mapAbsenceCategory maps internal absence category to API category string.
func mapAbsenceCategory(c model.AbsenceCategory) string {
	switch c {
	case model.AbsenceCategoryVacation:
		return "vacation"
	case model.AbsenceCategoryIllness:
		return "sick"
	case model.AbsenceCategorySpecial:
		return "personal"
	case model.AbsenceCategoryUnpaid:
		return "unpaid"
	default:
		return "other"
	}
}
