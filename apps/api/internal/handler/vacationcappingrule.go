package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

// VacationCappingRuleHandler handles vacation capping rule HTTP requests.
type VacationCappingRuleHandler struct {
	svc          *service.VacationCappingRuleService
	auditService *service.AuditLogService
}

// NewVacationCappingRuleHandler creates a new VacationCappingRuleHandler.
func NewVacationCappingRuleHandler(svc *service.VacationCappingRuleService) *VacationCappingRuleHandler {
	return &VacationCappingRuleHandler{svc: svc}
}

// SetAuditService sets the audit log service for this handler.
func (h *VacationCappingRuleHandler) SetAuditService(s *service.AuditLogService) {
	h.auditService = s
}

// List handles GET /vacation-capping-rules
func (h *VacationCappingRuleHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	activeOnly := r.URL.Query().Get("active_only") == "true"
	filterType := r.URL.Query().Get("rule_type")

	var rules []model.VacationCappingRule
	var err error

	if filterType != "" {
		rules, err = h.svc.ListByType(r.Context(), tenantID, filterType)
	} else if activeOnly {
		rules, err = h.svc.ListActive(r.Context(), tenantID)
	} else {
		rules, err = h.svc.List(r.Context(), tenantID)
	}

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list vacation capping rules")
		return
	}

	respondJSON(w, http.StatusOK, vacationCappingRuleListToResponse(rules))
}

// Get handles GET /vacation-capping-rules/{id}
func (h *VacationCappingRuleHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid capping rule ID")
		return
	}

	rule, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		handleVacationCappingRuleError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, vacationCappingRuleToResponse(rule))
}

// Create handles POST /vacation-capping-rules
func (h *VacationCappingRuleHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateVacationCappingRuleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateVacationCappingRuleInput{
		TenantID:    tenantID,
		Code:        *req.Code,
		Name:        *req.Name,
		RuleType:    *req.RuleType,
		CutoffMonth: int(req.CutoffMonth),
		CutoffDay:   int(req.CutoffDay),
		CapValue:    req.CapValue,
	}
	if req.Description != "" {
		input.Description = &req.Description
	}

	rule, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleVacationCappingRuleError(w, err)
		return
	}

	// Audit log
	if h.auditService != nil {
		if tid, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tid,
				Action:     model.AuditActionCreate,
				EntityType: "vacation_capping_rule",
				EntityID:   rule.ID,
			})
		}
	}

	respondJSON(w, http.StatusCreated, vacationCappingRuleToResponse(rule))
}

// Update handles PATCH /vacation-capping-rules/{id}
func (h *VacationCappingRuleHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid capping rule ID")
		return
	}

	var req models.UpdateVacationCappingRuleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	input := service.UpdateVacationCappingRuleInput{}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	if req.RuleType != "" {
		input.RuleType = &req.RuleType
	}
	if req.CutoffMonth != 0 {
		cm := int(req.CutoffMonth)
		input.CutoffMonth = &cm
	}
	if req.CutoffDay != 0 {
		cd := int(req.CutoffDay)
		input.CutoffDay = &cd
	}
	if req.CapValue != 0 {
		input.CapValue = &req.CapValue
	}
	input.IsActive = &req.IsActive

	rule, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleVacationCappingRuleError(w, err)
		return
	}

	// Audit log
	if h.auditService != nil {
		if tid, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tid,
				Action:     model.AuditActionUpdate,
				EntityType: "vacation_capping_rule",
				EntityID:   rule.ID,
			})
		}
	}

	respondJSON(w, http.StatusOK, vacationCappingRuleToResponse(rule))
}

// Delete handles DELETE /vacation-capping-rules/{id}
func (h *VacationCappingRuleHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid capping rule ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleVacationCappingRuleError(w, err)
		return
	}

	// Audit log
	if h.auditService != nil {
		if tid, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tid,
				Action:     model.AuditActionDelete,
				EntityType: "vacation_capping_rule",
				EntityID:   id,
			})
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

// vacationCappingRuleToResponse converts internal model to API response.
func vacationCappingRuleToResponse(rule *model.VacationCappingRule) *models.VacationCappingRule {
	id := strfmt.UUID(rule.ID.String())
	tenantID := strfmt.UUID(rule.TenantID.String())
	ruleType := string(rule.RuleType)
	cutoffMonth := int64(rule.CutoffMonth)
	cutoffDay := int64(rule.CutoffDay)
	capValue, _ := rule.CapValue.Float64()

	resp := &models.VacationCappingRule{
		ID:          &id,
		TenantID:    &tenantID,
		Code:        &rule.Code,
		Name:        &rule.Name,
		RuleType:    &ruleType,
		CutoffMonth: &cutoffMonth,
		CutoffDay:   &cutoffDay,
		CapValue:    &capValue,
		IsActive:    rule.IsActive,
		CreatedAt:   strfmt.DateTime(rule.CreatedAt),
		UpdatedAt:   strfmt.DateTime(rule.UpdatedAt),
	}

	if rule.Description != nil {
		resp.Description = rule.Description
	}

	return resp
}

// vacationCappingRuleListToResponse converts a list to API response.
func vacationCappingRuleListToResponse(rules []model.VacationCappingRule) models.VacationCappingRuleList {
	data := make([]*models.VacationCappingRule, 0, len(rules))
	for i := range rules {
		data = append(data, vacationCappingRuleToResponse(&rules[i]))
	}
	return models.VacationCappingRuleList{Data: data}
}

// handleVacationCappingRuleError maps service errors to HTTP responses.
func handleVacationCappingRuleError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrVacationCappingRuleNotFound:
		respondError(w, http.StatusNotFound, "Vacation capping rule not found")
	case service.ErrVacationCappingRuleCodeRequired:
		respondError(w, http.StatusBadRequest, "Code is required")
	case service.ErrVacationCappingRuleNameRequired:
		respondError(w, http.StatusBadRequest, "Name is required")
	case service.ErrVacationCappingRuleTypeRequired:
		respondError(w, http.StatusBadRequest, "Rule type is required")
	case service.ErrVacationCappingRuleTypeInvalid:
		respondError(w, http.StatusBadRequest, "Rule type must be year_end or mid_year")
	case service.ErrVacationCappingRuleCodeExists:
		respondError(w, http.StatusConflict, "A capping rule with this code already exists")
	case service.ErrVacationCappingRuleInUse:
		respondError(w, http.StatusConflict, "Capping rule is assigned to groups")
	case service.ErrVacationCappingRuleInvalidMonth:
		respondError(w, http.StatusBadRequest, "Cutoff month must be between 1 and 12")
	case service.ErrVacationCappingRuleInvalidDay:
		respondError(w, http.StatusBadRequest, "Cutoff day must be between 1 and 31")
	case service.ErrVacationCappingRuleInvalidCap:
		respondError(w, http.StatusBadRequest, "Cap value must not be negative")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
