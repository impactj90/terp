package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
)

// EmployeeCappingExceptionHandler handles employee capping exception HTTP requests.
type EmployeeCappingExceptionHandler struct {
	svc          *service.EmployeeCappingExceptionService
	auditService *service.AuditLogService
}

// NewEmployeeCappingExceptionHandler creates a new EmployeeCappingExceptionHandler.
func NewEmployeeCappingExceptionHandler(svc *service.EmployeeCappingExceptionService) *EmployeeCappingExceptionHandler {
	return &EmployeeCappingExceptionHandler{svc: svc}
}

// SetAuditService sets the audit log service for this handler.
func (h *EmployeeCappingExceptionHandler) SetAuditService(s *service.AuditLogService) {
	h.auditService = s
}

// List handles GET /employee-capping-exceptions
func (h *EmployeeCappingExceptionHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	filters := repository.EmployeeCappingExceptionFilters{}

	if empID := r.URL.Query().Get("employee_id"); empID != "" {
		parsed, err := uuid.Parse(empID)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid employee_id")
			return
		}
		filters.EmployeeID = &parsed
	}

	if ruleID := r.URL.Query().Get("capping_rule_id"); ruleID != "" {
		parsed, err := uuid.Parse(ruleID)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid capping_rule_id")
			return
		}
		filters.CappingRuleID = &parsed
	}

	if yearStr := r.URL.Query().Get("year"); yearStr != "" {
		year, err := strconv.Atoi(yearStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid year")
			return
		}
		filters.Year = &year
	}

	exceptions, err := h.svc.List(r.Context(), tenantID, filters)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list employee capping exceptions")
		return
	}

	respondJSON(w, http.StatusOK, employeeCappingExceptionListToResponse(exceptions))
}

// Get handles GET /employee-capping-exceptions/{id}
func (h *EmployeeCappingExceptionHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid exception ID")
		return
	}

	exc, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		handleEmployeeCappingExceptionError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, employeeCappingExceptionToResponse(exc))
}

// Create handles POST /employee-capping-exceptions
func (h *EmployeeCappingExceptionHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateEmployeeCappingExceptionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	employeeID, err := uuid.Parse(req.EmployeeID.String())
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee_id")
		return
	}
	cappingRuleID, err := uuid.Parse(req.CappingRuleID.String())
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid capping_rule_id")
		return
	}

	input := service.CreateEmployeeCappingExceptionInput{
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		CappingRuleID: cappingRuleID,
		ExemptionType: *req.ExemptionType,
	}

	if req.RetainDays != 0 {
		input.RetainDays = &req.RetainDays
	}
	if req.Year != 0 {
		year := int(req.Year)
		input.Year = &year
	}
	if req.Notes != "" {
		input.Notes = &req.Notes
	}

	exc, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleEmployeeCappingExceptionError(w, err)
		return
	}

	// Audit log
	if h.auditService != nil {
		if tid, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tid,
				Action:     model.AuditActionCreate,
				EntityType: "employee_capping_exception",
				EntityID:   exc.ID,
			})
		}
	}

	respondJSON(w, http.StatusCreated, employeeCappingExceptionToResponse(exc))
}

// Update handles PATCH /employee-capping-exceptions/{id}
func (h *EmployeeCappingExceptionHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid exception ID")
		return
	}

	var req models.UpdateEmployeeCappingExceptionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	input := service.UpdateEmployeeCappingExceptionInput{}
	if req.ExemptionType != "" {
		input.ExemptionType = &req.ExemptionType
	}
	if req.RetainDays != 0 {
		input.RetainDays = &req.RetainDays
	}
	if req.Year != 0 {
		year := int(req.Year)
		input.Year = &year
	}
	if req.Notes != "" {
		input.Notes = &req.Notes
	}
	input.IsActive = &req.IsActive

	exc, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleEmployeeCappingExceptionError(w, err)
		return
	}

	// Audit log
	if h.auditService != nil {
		if tid, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tid,
				Action:     model.AuditActionUpdate,
				EntityType: "employee_capping_exception",
				EntityID:   exc.ID,
			})
		}
	}

	respondJSON(w, http.StatusOK, employeeCappingExceptionToResponse(exc))
}

// Delete handles DELETE /employee-capping-exceptions/{id}
func (h *EmployeeCappingExceptionHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid exception ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleEmployeeCappingExceptionError(w, err)
		return
	}

	// Audit log
	if h.auditService != nil {
		if tid, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tid,
				Action:     model.AuditActionDelete,
				EntityType: "employee_capping_exception",
				EntityID:   id,
			})
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

// employeeCappingExceptionToResponse converts internal model to API response.
func employeeCappingExceptionToResponse(exc *model.EmployeeCappingException) *models.EmployeeCappingException {
	id := strfmt.UUID(exc.ID.String())
	tenantID := strfmt.UUID(exc.TenantID.String())
	employeeID := strfmt.UUID(exc.EmployeeID.String())
	cappingRuleID := strfmt.UUID(exc.CappingRuleID.String())
	exemptionType := string(exc.ExemptionType)

	resp := &models.EmployeeCappingException{
		ID:            &id,
		TenantID:      &tenantID,
		EmployeeID:    &employeeID,
		CappingRuleID: &cappingRuleID,
		ExemptionType: &exemptionType,
		IsActive:      exc.IsActive,
		CreatedAt:     strfmt.DateTime(exc.CreatedAt),
		UpdatedAt:     strfmt.DateTime(exc.UpdatedAt),
	}

	if exc.RetainDays != nil {
		rd, _ := exc.RetainDays.Float64()
		resp.RetainDays = &rd
	}
	if exc.Year != nil {
		year := int64(*exc.Year)
		resp.Year = &year
	}
	if exc.Notes != nil {
		resp.Notes = exc.Notes
	}

	return resp
}

// employeeCappingExceptionListToResponse converts a list to API response.
func employeeCappingExceptionListToResponse(exceptions []model.EmployeeCappingException) models.EmployeeCappingExceptionList {
	data := make([]*models.EmployeeCappingException, 0, len(exceptions))
	for i := range exceptions {
		data = append(data, employeeCappingExceptionToResponse(&exceptions[i]))
	}
	return models.EmployeeCappingExceptionList{Data: data}
}

// handleEmployeeCappingExceptionError maps service errors to HTTP responses.
func handleEmployeeCappingExceptionError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrEmployeeCappingExceptionNotFound:
		respondError(w, http.StatusNotFound, "Employee capping exception not found")
	case service.ErrEmployeeCappingExceptionDuplicate:
		respondError(w, http.StatusConflict, "Exception already exists for this employee/rule/year combination")
	case service.ErrEmployeeCappingExceptionTypeReq:
		respondError(w, http.StatusBadRequest, "Exemption type is required")
	case service.ErrEmployeeCappingExceptionTypeInv:
		respondError(w, http.StatusBadRequest, "Exemption type must be full or partial")
	case service.ErrEmployeeCappingExceptionRetainReq:
		respondError(w, http.StatusBadRequest, "retain_days is required for partial exemptions")
	case service.ErrEmployeeCappingExceptionRetainNeg:
		respondError(w, http.StatusBadRequest, "retain_days must not be negative")
	case service.ErrEmployeeCappingExceptionEmployeeReq:
		respondError(w, http.StatusBadRequest, "employee_id is required")
	case service.ErrEmployeeCappingExceptionRuleReq:
		respondError(w, http.StatusBadRequest, "capping_rule_id is required")
	case service.ErrVacationCappingRuleNotFound:
		respondError(w, http.StatusNotFound, "Capping rule not found")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
