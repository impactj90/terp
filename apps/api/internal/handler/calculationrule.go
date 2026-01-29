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

// CalculationRuleHandler handles calculation rule HTTP requests.
type CalculationRuleHandler struct {
	svc          *service.CalculationRuleService
	auditService *service.AuditLogService
}

// NewCalculationRuleHandler creates a new CalculationRuleHandler.
func NewCalculationRuleHandler(svc *service.CalculationRuleService) *CalculationRuleHandler {
	return &CalculationRuleHandler{svc: svc}
}

// SetAuditService sets the audit log service for this handler.
func (h *CalculationRuleHandler) SetAuditService(s *service.AuditLogService) {
	h.auditService = s
}

// List handles GET /calculation-rules
func (h *CalculationRuleHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	activeOnly := r.URL.Query().Get("active_only") == "true"

	var rules []model.CalculationRule
	var err error

	if activeOnly {
		rules, err = h.svc.ListActive(r.Context(), tenantID)
	} else {
		rules, err = h.svc.List(r.Context(), tenantID)
	}

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list calculation rules")
		return
	}

	respondJSON(w, http.StatusOK, calculationRuleListToResponse(rules))
}

// Get handles GET /calculation-rules/{id}
func (h *CalculationRuleHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid calculation rule ID")
		return
	}

	rule, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Calculation rule not found")
		return
	}

	respondJSON(w, http.StatusOK, calculationRuleToResponse(rule))
}

// Create handles POST /calculation-rules
func (h *CalculationRuleHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateCalculationRuleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateCalculationRuleInput{
		TenantID: tenantID,
		Code:     *req.Code,
		Name:     *req.Name,
		Value:    int(req.Value),
	}

	// Optional description
	if req.Description != "" {
		input.Description = &req.Description
	}

	// Optional account_id
	if req.AccountID.String() != "" && req.AccountID.String() != "00000000-0000-0000-0000-000000000000" {
		accountID, parseErr := uuid.Parse(req.AccountID.String())
		if parseErr == nil {
			input.AccountID = &accountID
		}
	}

	// Optional factor (default 1.0 handled in service)
	if req.Factor != nil {
		input.Factor = *req.Factor
	}

	rule, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleCalculationRuleError(w, err)
		return
	}

	// Audit log
	if h.auditService != nil {
		if tid, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tid,
				Action:     model.AuditActionCreate,
				EntityType: "calculation_rule",
				EntityID:   rule.ID,
			})
		}
	}

	respondJSON(w, http.StatusCreated, calculationRuleToResponse(rule))
}

// Update handles PATCH /calculation-rules/{id}
func (h *CalculationRuleHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid calculation rule ID")
		return
	}

	var req models.UpdateCalculationRuleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateCalculationRuleInput{}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	if req.AccountID != nil {
		if req.AccountID.String() == "00000000-0000-0000-0000-000000000000" {
			input.ClearAccountID = true
		} else {
			accountID, parseErr := uuid.Parse(req.AccountID.String())
			if parseErr == nil {
				input.AccountID = &accountID
			}
		}
	}
	if req.Value != 0 {
		v := int(req.Value)
		input.Value = &v
	}
	if req.Factor != 0 {
		input.Factor = &req.Factor
	}
	// is_active can be false, so we always pass it when the field is present in JSON
	input.IsActive = &req.IsActive

	rule, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleCalculationRuleError(w, err)
		return
	}

	// Audit log
	if h.auditService != nil {
		if tid, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tid,
				Action:     model.AuditActionUpdate,
				EntityType: "calculation_rule",
				EntityID:   rule.ID,
			})
		}
	}

	respondJSON(w, http.StatusOK, calculationRuleToResponse(rule))
}

// Delete handles DELETE /calculation-rules/{id}
func (h *CalculationRuleHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid calculation rule ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleCalculationRuleError(w, err)
		return
	}

	// Audit log
	if h.auditService != nil {
		if tid, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tid,
				Action:     model.AuditActionDelete,
				EntityType: "calculation_rule",
				EntityID:   id,
			})
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

// calculationRuleToResponse converts internal model to API response model.
func calculationRuleToResponse(rule *model.CalculationRule) *models.CalculationRule {
	id := strfmt.UUID(rule.ID.String())
	tenantID := strfmt.UUID(rule.TenantID.String())
	value := int64(rule.Value)

	resp := &models.CalculationRule{
		ID:        &id,
		TenantID:  &tenantID,
		Code:      &rule.Code,
		Name:      &rule.Name,
		Value:     &value,
		Factor:    &rule.Factor,
		IsActive:  rule.IsActive,
		CreatedAt: strfmt.DateTime(rule.CreatedAt),
		UpdatedAt: strfmt.DateTime(rule.UpdatedAt),
	}

	if rule.Description != nil {
		resp.Description = rule.Description
	}

	if rule.AccountID != nil {
		accountID := strfmt.UUID(rule.AccountID.String())
		resp.AccountID = &accountID
	}

	return resp
}

// calculationRuleListToResponse converts a list of internal models to API response format.
func calculationRuleListToResponse(rules []model.CalculationRule) models.CalculationRuleList {
	data := make([]*models.CalculationRule, 0, len(rules))
	for i := range rules {
		data = append(data, calculationRuleToResponse(&rules[i]))
	}
	return models.CalculationRuleList{Data: data}
}

// handleCalculationRuleError maps service errors to HTTP responses.
func handleCalculationRuleError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrCalculationRuleNotFound:
		respondError(w, http.StatusNotFound, "Calculation rule not found")
	case service.ErrCalculationRuleCodeRequired:
		respondError(w, http.StatusBadRequest, "Calculation rule code is required")
	case service.ErrCalculationRuleNameRequired:
		respondError(w, http.StatusBadRequest, "Calculation rule name is required")
	case service.ErrCalculationRuleCodeExists:
		respondError(w, http.StatusConflict, "A calculation rule with this code already exists")
	case service.ErrCalculationRuleInUse:
		respondError(w, http.StatusConflict, "Calculation rule is still assigned to absence types")
	case service.ErrInvalidFactor:
		respondError(w, http.StatusBadRequest, "Factor must be greater than 0")
	case service.ErrInvalidValue:
		respondError(w, http.StatusBadRequest, "Value must be non-negative")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
