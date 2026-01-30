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

// VacationCappingRuleGroupHandler handles vacation capping rule group HTTP requests.
type VacationCappingRuleGroupHandler struct {
	svc          *service.VacationCappingRuleGroupService
	auditService *service.AuditLogService
}

// NewVacationCappingRuleGroupHandler creates a new VacationCappingRuleGroupHandler.
func NewVacationCappingRuleGroupHandler(svc *service.VacationCappingRuleGroupService) *VacationCappingRuleGroupHandler {
	return &VacationCappingRuleGroupHandler{svc: svc}
}

// SetAuditService sets the audit log service for this handler.
func (h *VacationCappingRuleGroupHandler) SetAuditService(s *service.AuditLogService) {
	h.auditService = s
}

// List handles GET /vacation-capping-rule-groups
func (h *VacationCappingRuleGroupHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	activeOnly := r.URL.Query().Get("active_only") == "true"

	var groups []model.VacationCappingRuleGroup
	var err error

	if activeOnly {
		groups, err = h.svc.ListActive(r.Context(), tenantID)
	} else {
		groups, err = h.svc.List(r.Context(), tenantID)
	}

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list vacation capping rule groups")
		return
	}

	respondJSON(w, http.StatusOK, vacationCappingRuleGroupListToResponse(groups))
}

// Get handles GET /vacation-capping-rule-groups/{id}
func (h *VacationCappingRuleGroupHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid capping rule group ID")
		return
	}

	group, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		handleVacationCappingRuleGroupError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, vacationCappingRuleGroupToResponse(group))
}

// Create handles POST /vacation-capping-rule-groups
func (h *VacationCappingRuleGroupHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateVacationCappingRuleGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateVacationCappingRuleGroupInput{
		TenantID: tenantID,
		Code:     *req.Code,
		Name:     *req.Name,
	}
	if req.Description != "" {
		input.Description = &req.Description
	}

	// Parse capping_rule_ids
	for _, cid := range req.CappingRuleIds {
		parsed, err := uuid.Parse(cid.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid capping rule ID")
			return
		}
		input.CappingRuleIDs = append(input.CappingRuleIDs, parsed)
	}

	group, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleVacationCappingRuleGroupError(w, err)
		return
	}

	// Audit log
	if h.auditService != nil {
		if tid, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tid,
				Action:     model.AuditActionCreate,
				EntityType: "vacation_capping_rule_group",
				EntityID:   group.ID,
			})
		}
	}

	respondJSON(w, http.StatusCreated, vacationCappingRuleGroupToResponse(group))
}

// Update handles PATCH /vacation-capping-rule-groups/{id}
func (h *VacationCappingRuleGroupHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid capping rule group ID")
		return
	}

	var req models.UpdateVacationCappingRuleGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	input := service.UpdateVacationCappingRuleGroupInput{}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	input.IsActive = &req.IsActive

	// Parse capping_rule_ids if provided
	if req.CappingRuleIds != nil {
		ids := make([]uuid.UUID, 0, len(req.CappingRuleIds))
		for _, cid := range req.CappingRuleIds {
			parsed, parseErr := uuid.Parse(cid.String())
			if parseErr != nil {
				respondError(w, http.StatusBadRequest, "Invalid capping rule ID")
				return
			}
			ids = append(ids, parsed)
		}
		input.CappingRuleIDs = &ids
	}

	group, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleVacationCappingRuleGroupError(w, err)
		return
	}

	// Audit log
	if h.auditService != nil {
		if tid, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tid,
				Action:     model.AuditActionUpdate,
				EntityType: "vacation_capping_rule_group",
				EntityID:   group.ID,
			})
		}
	}

	respondJSON(w, http.StatusOK, vacationCappingRuleGroupToResponse(group))
}

// Delete handles DELETE /vacation-capping-rule-groups/{id}
func (h *VacationCappingRuleGroupHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid capping rule group ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleVacationCappingRuleGroupError(w, err)
		return
	}

	// Audit log
	if h.auditService != nil {
		if tid, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tid,
				Action:     model.AuditActionDelete,
				EntityType: "vacation_capping_rule_group",
				EntityID:   id,
			})
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

// vacationCappingRuleGroupToResponse converts internal model to API response.
func vacationCappingRuleGroupToResponse(g *model.VacationCappingRuleGroup) *models.VacationCappingRuleGroup {
	id := strfmt.UUID(g.ID.String())
	tenantID := strfmt.UUID(g.TenantID.String())

	resp := &models.VacationCappingRuleGroup{
		ID:        &id,
		TenantID:  &tenantID,
		Code:      &g.Code,
		Name:      &g.Name,
		IsActive:  g.IsActive,
		CreatedAt: strfmt.DateTime(g.CreatedAt),
		UpdatedAt: strfmt.DateTime(g.UpdatedAt),
	}

	if g.Description != nil {
		resp.Description = g.Description
	}

	// Map capping rules to summary
	resp.CappingRules = make([]*models.VacationCappingRuleSummary, 0, len(g.CappingRules))
	for _, cr := range g.CappingRules {
		crID := strfmt.UUID(cr.ID.String())
		crType := string(cr.RuleType)
		capValue, _ := cr.CapValue.Float64()
		resp.CappingRules = append(resp.CappingRules, &models.VacationCappingRuleSummary{
			ID:       &crID,
			Code:     &cr.Code,
			Name:     &cr.Name,
			RuleType: &crType,
			CapValue: &capValue,
		})
	}

	return resp
}

// vacationCappingRuleGroupListToResponse converts a list to API response.
func vacationCappingRuleGroupListToResponse(groups []model.VacationCappingRuleGroup) models.VacationCappingRuleGroupList {
	data := make([]*models.VacationCappingRuleGroup, 0, len(groups))
	for i := range groups {
		data = append(data, vacationCappingRuleGroupToResponse(&groups[i]))
	}
	return models.VacationCappingRuleGroupList{Data: data}
}

// handleVacationCappingRuleGroupError maps service errors to HTTP responses.
func handleVacationCappingRuleGroupError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrVacationCappingRuleGroupNotFound:
		respondError(w, http.StatusNotFound, "Vacation capping rule group not found")
	case service.ErrVacationCappingRuleGroupCodeRequired:
		respondError(w, http.StatusBadRequest, "Code is required")
	case service.ErrVacationCappingRuleGroupNameRequired:
		respondError(w, http.StatusBadRequest, "Name is required")
	case service.ErrVacationCappingRuleGroupCodeExists:
		respondError(w, http.StatusConflict, "A capping rule group with this code already exists")
	case service.ErrVacationCappingRuleGroupInUse:
		respondError(w, http.StatusConflict, "Capping rule group is assigned to tariffs")
	case service.ErrCappingRuleNotFound:
		respondError(w, http.StatusBadRequest, "One or more capping rule IDs not found")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
