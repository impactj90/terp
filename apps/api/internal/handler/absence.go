package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

// AbsenceHandler handles absence-related HTTP requests.
type AbsenceHandler struct {
	absenceService  *service.AbsenceService
	employeeService *service.EmployeeService
	auditService    *service.AuditLogService
}

func (h *AbsenceHandler) SetAuditService(s *service.AuditLogService) { h.auditService = s }

var errAbsenceScopeDenied = errors.New("employee access denied by scope")

// NewAbsenceHandler creates a new AbsenceHandler instance.
func NewAbsenceHandler(absenceService *service.AbsenceService, employeeService *service.EmployeeService) *AbsenceHandler {
	return &AbsenceHandler{
		absenceService:  absenceService,
		employeeService: employeeService,
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

	if err := h.ensureEmployeeScope(r.Context(), employeeID); err != nil {
		if errors.Is(err, service.ErrEmployeeNotFound) {
			respondError(w, http.StatusNotFound, "Employee not found")
			return
		}
		if errors.Is(err, errAbsenceScopeDenied) {
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
		if errors.Is(err, errAbsenceScopeDenied) {
			respondError(w, http.StatusForbidden, "Permission denied")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to verify access")
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
		Status:        model.AbsenceStatusPending, // Always pending; approvals handled separately
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

	if h.auditService != nil {
		if tenantID, ok := middleware.TenantFromContext(r.Context()); ok {
			for i := range result.CreatedDays {
				h.auditService.Log(r.Context(), r, service.LogEntry{
					TenantID:   tenantID,
					Action:     model.AuditActionCreate,
					EntityType: "absence",
					EntityID:   result.CreatedDays[i].ID,
				})
			}
		}
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

	if _, err := h.ensureAbsenceScope(r.Context(), id); err != nil {
		if errors.Is(err, service.ErrAbsenceNotFound) {
			respondError(w, http.StatusNotFound, "Absence not found")
			return
		}
		if errors.Is(err, service.ErrEmployeeNotFound) {
			respondError(w, http.StatusNotFound, "Employee not found")
			return
		}
		if errors.Is(err, errAbsenceScopeDenied) {
			respondError(w, http.StatusForbidden, "Permission denied")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to verify access")
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

	if h.auditService != nil {
		if tenantID, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tenantID,
				Action:     model.AuditActionDelete,
				EntityType: "absence",
				EntityID:   id,
			})
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

// ListAll handles GET /absences with optional query filters.
func (h *AbsenceHandler) ListAll(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	scope, err := scopeFromContext(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to load access scope")
		return
	}
	if !scope.AllowsTenant(tenantID) {
		respondError(w, http.StatusForbidden, "Permission denied")
		return
	}

	var opts model.AbsenceListOptions
	opts.ScopeType = scope.Type
	opts.ScopeDepartmentIDs = scope.DepartmentIDs
	opts.ScopeEmployeeIDs = scope.EmployeeIDs

	// Parse optional query filters
	if empIDStr := r.URL.Query().Get("employee_id"); empIDStr != "" {
		empID, err := uuid.Parse(empIDStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid employee_id")
			return
		}
		if err := h.ensureEmployeeScope(r.Context(), empID); err != nil {
			if errors.Is(err, service.ErrEmployeeNotFound) {
				respondError(w, http.StatusNotFound, "Employee not found")
				return
			}
			if errors.Is(err, errAbsenceScopeDenied) {
				respondError(w, http.StatusForbidden, "Permission denied")
				return
			}
			respondError(w, http.StatusInternalServerError, "Failed to verify access")
			return
		}
		opts.EmployeeID = &empID
	}

	if typeIDStr := r.URL.Query().Get("absence_type_id"); typeIDStr != "" {
		typeID, err := uuid.Parse(typeIDStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid absence_type_id")
			return
		}
		opts.AbsenceTypeID = &typeID
	}

	if statusStr := r.URL.Query().Get("status"); statusStr != "" {
		status := model.AbsenceStatus(statusStr)
		opts.Status = &status
	}

	if fromStr := r.URL.Query().Get("from"); fromStr != "" {
		from, err := time.Parse("2006-01-02", fromStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid from date format, expected YYYY-MM-DD")
			return
		}
		opts.From = &from
	}

	if toStr := r.URL.Query().Get("to"); toStr != "" {
		to, err := time.Parse("2006-01-02", toStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid to date format, expected YYYY-MM-DD")
			return
		}
		opts.To = &to
	}

	absences, err := h.absenceService.ListAll(r.Context(), tenantID, opts)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list absences")
		return
	}

	response := models.AbsenceList{
		Data: make([]*models.Absence, 0, len(absences)),
	}
	for i := range absences {
		response.Data = append(response.Data, h.absenceDayToResponse(&absences[i]))
	}

	respondJSON(w, http.StatusOK, response)
}

// Approve handles POST /absences/{id}/approve
func (h *AbsenceHandler) Approve(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid absence ID")
		return
	}

	if _, err := h.ensureAbsenceScope(r.Context(), id); err != nil {
		if errors.Is(err, service.ErrAbsenceNotFound) {
			respondError(w, http.StatusNotFound, "Absence not found")
			return
		}
		if errors.Is(err, service.ErrEmployeeNotFound) {
			respondError(w, http.StatusNotFound, "Employee not found")
			return
		}
		if errors.Is(err, errAbsenceScopeDenied) {
			respondError(w, http.StatusForbidden, "Permission denied")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to verify access")
		return
	}

	// Get the authenticated user for approved_by
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	ad, svcErr := h.absenceService.Approve(r.Context(), id, user.ID)
	if svcErr != nil {
		switch svcErr {
		case service.ErrAbsenceNotFound:
			respondError(w, http.StatusNotFound, "Absence not found")
		case service.ErrAbsenceNotPending:
			respondError(w, http.StatusBadRequest, "Absence is not in pending status")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to approve absence")
		}
		return
	}

	respondJSON(w, http.StatusOK, h.absenceDayToResponse(ad))
}

// Reject handles POST /absences/{id}/reject
func (h *AbsenceHandler) Reject(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid absence ID")
		return
	}

	if _, err := h.ensureAbsenceScope(r.Context(), id); err != nil {
		if errors.Is(err, service.ErrAbsenceNotFound) {
			respondError(w, http.StatusNotFound, "Absence not found")
			return
		}
		if errors.Is(err, service.ErrEmployeeNotFound) {
			respondError(w, http.StatusNotFound, "Employee not found")
			return
		}
		if errors.Is(err, errAbsenceScopeDenied) {
			respondError(w, http.StatusForbidden, "Permission denied")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to verify access")
		return
	}

	// Parse optional rejection reason from body
	var body struct {
		Reason string `json:"reason"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&body)
	}

	ad, svcErr := h.absenceService.Reject(r.Context(), id, body.Reason)
	if svcErr != nil {
		switch svcErr {
		case service.ErrAbsenceNotFound:
			respondError(w, http.StatusNotFound, "Absence not found")
		case service.ErrAbsenceNotPending:
			respondError(w, http.StatusBadRequest, "Absence is not in pending status")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to reject absence")
		}
		return
	}

	respondJSON(w, http.StatusOK, h.absenceDayToResponse(ad))
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
		ID:              &id,
		TenantID:        &tenantID,
		EmployeeID:      &employeeID,
		AbsenceTypeID:   &absenceTypeID,
		AbsenceDate:     &date,
		Duration:        &duration,
		Status:          status,
		Notes:           ad.Notes,
		RejectionReason: ad.RejectionReason,
		CreatedAt:       strfmt.DateTime(ad.CreatedAt),
		UpdatedAt:       strfmt.DateTime(ad.UpdatedAt),
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

	// Nested employee relation
	if ad.Employee != nil {
		empID := strfmt.UUID(ad.Employee.ID.String())
		resp.Employee.ID = &empID
		resp.Employee.FirstName = &ad.Employee.FirstName
		resp.Employee.LastName = &ad.Employee.LastName
		resp.Employee.PersonnelNumber = &ad.Employee.PersonnelNumber
		resp.Employee.IsActive = ad.Employee.IsActive
		if ad.Employee.DepartmentID != nil {
			deptID := strfmt.UUID(ad.Employee.DepartmentID.String())
			resp.Employee.DepartmentID = &deptID
		}
		if ad.Employee.TariffID != nil {
			tariffID := strfmt.UUID(ad.Employee.TariffID.String())
			resp.Employee.TariffID = &tariffID
		}
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
		Portion:                int64(at.Portion),
		HolidayCode:            at.HolidayCode,
		Priority:               int64(at.Priority),
		SortOrder:              int64(at.SortOrder),
		RequiresDocument:       at.RequiresDocument,
		CreatedAt:              strfmt.DateTime(at.CreatedAt),
		UpdatedAt:              strfmt.DateTime(at.UpdatedAt),
	}

	// Optional tenant ID (nil for system types)
	if at.TenantID != nil {
		tenantID := strfmt.UUID(at.TenantID.String())
		resp.TenantID = &tenantID
	}

	// Optional group FK
	if at.AbsenceTypeGroupID != nil {
		groupID := strfmt.UUID(at.AbsenceTypeGroupID.String())
		resp.AbsenceTypeGroupID = &groupID
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

// mapAPICategory maps API category string to internal absence category.
func mapAPICategory(apiCategory string) model.AbsenceCategory {
	switch apiCategory {
	case "vacation":
		return model.AbsenceCategoryVacation
	case "sick":
		return model.AbsenceCategoryIllness
	case "personal":
		return model.AbsenceCategorySpecial
	case "unpaid":
		return model.AbsenceCategoryUnpaid
	default:
		return model.AbsenceCategorySpecial
	}
}

func (h *AbsenceHandler) ensureEmployeeScope(ctx context.Context, employeeID uuid.UUID) error {
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
			return errAbsenceScopeDenied
		}
	}
	if !scope.AllowsEmployee(emp) {
		return errAbsenceScopeDenied
	}
	return nil
}

func (h *AbsenceHandler) ensureAbsenceScope(ctx context.Context, absenceID uuid.UUID) (*model.AbsenceDay, error) {
	absence, err := h.absenceService.GetByID(ctx, absenceID)
	if err != nil {
		return nil, err
	}
	if err := h.ensureEmployeeScope(ctx, absence.EmployeeID); err != nil {
		return nil, err
	}
	return absence, nil
}

// GetType handles GET /absence-types/{id}
func (h *AbsenceHandler) GetType(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid absence type ID")
		return
	}

	at, err := h.absenceService.GetTypeByID(r.Context(), tenantID, id)
	if err != nil {
		switch err {
		case service.ErrAbsenceTypeNotFound:
			respondError(w, http.StatusNotFound, "Absence type not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to get absence type")
		}
		return
	}

	respondJSON(w, http.StatusOK, h.absenceTypeToResponse(at))
}

// CreateType handles POST /absence-types
func (h *AbsenceHandler) CreateType(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateAbsenceTypeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Map request to model
	at := &model.AbsenceType{
		TenantID:         &tenantID,
		Code:             *req.Code,
		Name:             *req.Name,
		Description:      &req.Description,
		Category:         mapAPICategory(*req.Category),
		Color:            req.Color,
		IsActive:         true,
		RequiresApproval: true, // default
	}

	// Optional fields
	if req.AffectsVacationBalance != nil {
		at.DeductsVacation = *req.AffectsVacationBalance
	}
	if req.RequiresApproval != nil {
		at.RequiresApproval = *req.RequiresApproval
	}
	if req.IsPaid != nil && *req.IsPaid {
		at.Portion = model.AbsencePortionFull
	}
	// New ZMI fields
	if req.Portion != nil {
		at.Portion = model.AbsencePortion(int(*req.Portion))
	}
	if req.HolidayCode != "" {
		at.HolidayCode = &req.HolidayCode
	}
	at.Priority = int(req.Priority)
	at.SortOrder = int(req.SortOrder)
	if req.RequiresDocument != nil {
		at.RequiresDocument = *req.RequiresDocument
	}
	if req.AbsenceTypeGroupID.String() != "" && req.AbsenceTypeGroupID.String() != "00000000-0000-0000-0000-000000000000" {
		gID, parseErr := uuid.Parse(req.AbsenceTypeGroupID.String())
		if parseErr == nil {
			at.AbsenceTypeGroupID = &gID
		}
	}
	if at.Color == "" {
		at.Color = "#808080"
	}

	created, err := h.absenceService.CreateType(r.Context(), at)
	if err != nil {
		switch {
		case err == service.ErrAbsenceCodeExists:
			respondError(w, http.StatusConflict, "Absence type code already exists")
		case errors.Is(err, service.ErrInvalidPortion) || errors.Is(err, service.ErrInvalidCodePrefix):
			respondError(w, http.StatusBadRequest, err.Error())
		default:
			respondError(w, http.StatusInternalServerError, "Failed to create absence type")
		}
		return
	}

	respondJSON(w, http.StatusCreated, h.absenceTypeToResponse(created))
}

// UpdateType handles PATCH /absence-types/{id}
func (h *AbsenceHandler) UpdateType(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid absence type ID")
		return
	}

	var req models.UpdateAbsenceTypeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Get existing to merge with updates
	existing, err := h.absenceService.GetTypeByID(r.Context(), tenantID, id)
	if err != nil {
		switch err {
		case service.ErrAbsenceTypeNotFound:
			respondError(w, http.StatusNotFound, "Absence type not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to get absence type")
		}
		return
	}

	// Apply updates
	if req.Name != "" {
		existing.Name = req.Name
	}
	if req.Description != "" {
		existing.Description = &req.Description
	}
	if req.Category != "" {
		existing.Category = mapAPICategory(req.Category)
	}
	if req.Color != "" {
		existing.Color = req.Color
	}
	existing.DeductsVacation = req.AffectsVacationBalance
	existing.RequiresApproval = req.RequiresApproval
	existing.IsActive = req.IsActive
	if req.IsPaid {
		existing.Portion = model.AbsencePortionFull
	} else {
		existing.Portion = model.AbsencePortionNone
	}
	// New ZMI fields
	if req.Portion != 0 {
		existing.Portion = model.AbsencePortion(int(req.Portion))
	}
	if req.HolidayCode != "" {
		existing.HolidayCode = &req.HolidayCode
	}
	existing.Priority = int(req.Priority)
	existing.SortOrder = int(req.SortOrder)
	existing.RequiresDocument = req.RequiresDocument
	if req.AbsenceTypeGroupID.String() != "" && req.AbsenceTypeGroupID.String() != "00000000-0000-0000-0000-000000000000" {
		gID, parseErr := uuid.Parse(req.AbsenceTypeGroupID.String())
		if parseErr == nil {
			existing.AbsenceTypeGroupID = &gID
		}
	}

	// Ensure tenant ID is set for update
	existing.TenantID = &tenantID

	updated, err := h.absenceService.UpdateType(r.Context(), existing)
	if err != nil {
		switch {
		case err == service.ErrAbsenceTypeNotFound:
			respondError(w, http.StatusNotFound, "Absence type not found")
		case err == service.ErrCannotModifySystem:
			respondError(w, http.StatusForbidden, "Cannot modify system absence type")
		case errors.Is(err, service.ErrInvalidPortion) || errors.Is(err, service.ErrInvalidCodePrefix):
			respondError(w, http.StatusBadRequest, err.Error())
		default:
			respondError(w, http.StatusInternalServerError, "Failed to update absence type")
		}
		return
	}

	respondJSON(w, http.StatusOK, h.absenceTypeToResponse(updated))
}

// DeleteType handles DELETE /absence-types/{id}
func (h *AbsenceHandler) DeleteType(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid absence type ID")
		return
	}

	err = h.absenceService.DeleteType(r.Context(), tenantID, id)
	if err != nil {
		switch err {
		case service.ErrAbsenceTypeNotFound:
			respondError(w, http.StatusNotFound, "Absence type not found")
		case service.ErrCannotModifySystem:
			respondError(w, http.StatusForbidden, "Cannot delete system absence type")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to delete absence type")
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
