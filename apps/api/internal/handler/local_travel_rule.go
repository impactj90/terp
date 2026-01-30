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

type LocalTravelRuleHandler struct {
	svc *service.LocalTravelRuleService
}

func NewLocalTravelRuleHandler(svc *service.LocalTravelRuleService) *LocalTravelRuleHandler {
	return &LocalTravelRuleHandler{svc: svc}
}

func (h *LocalTravelRuleHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	rules, err := h.svc.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list local travel rules")
		return
	}
	respondJSON(w, http.StatusOK, localTravelRuleListToResponse(rules))
}

func (h *LocalTravelRuleHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid local travel rule ID")
		return
	}

	rule, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Local travel rule not found")
		return
	}

	respondJSON(w, http.StatusOK, localTravelRuleToResponse(rule))
}

func (h *LocalTravelRuleHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateLocalTravelRuleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	ruleSetID, err := uuid.Parse(req.RuleSetID.String())
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid rule_set_id")
		return
	}

	input := service.CreateLocalTravelRuleInput{
		TenantID:  tenantID,
		RuleSetID: ruleSetID,
	}
	if req.MinDistanceKm != 0 {
		input.MinDistanceKm = &req.MinDistanceKm
	}
	if req.MaxDistanceKm != 0 {
		v := req.MaxDistanceKm
		input.MaxDistanceKm = &v
	}
	if req.MinDurationMinutes != 0 {
		v := req.MinDurationMinutes
		input.MinDurationMinutes = &v
	}
	if req.MaxDurationMinutes != 0 {
		v := req.MaxDurationMinutes
		input.MaxDurationMinutes = &v
	}
	if req.TaxFreeAmount != 0 {
		input.TaxFreeAmount = &req.TaxFreeAmount
	}
	if req.TaxableAmount != 0 {
		input.TaxableAmount = &req.TaxableAmount
	}
	if req.SortOrder != 0 {
		so := int(req.SortOrder)
		input.SortOrder = &so
	}

	rule, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleLocalTravelRuleError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, localTravelRuleToResponse(rule))
}

func (h *LocalTravelRuleHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid local travel rule ID")
		return
	}

	var req models.UpdateLocalTravelRuleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateLocalTravelRuleInput{}
	if req.MinDistanceKm != 0 {
		input.MinDistanceKm = &req.MinDistanceKm
	}
	if req.MaxDistanceKm != 0 {
		v := req.MaxDistanceKm
		input.MaxDistanceKm = &v
	}
	if req.MinDurationMinutes != 0 {
		v := req.MinDurationMinutes
		input.MinDurationMinutes = &v
	}
	if req.MaxDurationMinutes != 0 {
		v := req.MaxDurationMinutes
		input.MaxDurationMinutes = &v
	}
	if req.TaxFreeAmount != 0 {
		input.TaxFreeAmount = &req.TaxFreeAmount
	}
	if req.TaxableAmount != 0 {
		input.TaxableAmount = &req.TaxableAmount
	}
	input.IsActive = &req.IsActive
	if req.SortOrder != 0 {
		so := int(req.SortOrder)
		input.SortOrder = &so
	}

	rule, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleLocalTravelRuleError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, localTravelRuleToResponse(rule))
}

func (h *LocalTravelRuleHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid local travel rule ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleLocalTravelRuleError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func localTravelRuleToResponse(rule *model.LocalTravelRule) *models.LocalTravelRule {
	id := strfmt.UUID(rule.ID.String())
	tenantID := strfmt.UUID(rule.TenantID.String())
	ruleSetID := strfmt.UUID(rule.RuleSetID.String())
	minDistKm, _ := rule.MinDistanceKm.Float64()
	taxFree, _ := rule.TaxFreeAmount.Float64()
	taxable, _ := rule.TaxableAmount.Float64()

	resp := &models.LocalTravelRule{
		ID:                 &id,
		TenantID:           &tenantID,
		RuleSetID:          &ruleSetID,
		MinDistanceKm:      minDistKm,
		MinDurationMinutes: int64(rule.MinDurationMinutes),
		TaxFreeAmount:      taxFree,
		TaxableAmount:      taxable,
		IsActive:           rule.IsActive,
		SortOrder:          int64(rule.SortOrder),
		CreatedAt:          strfmt.DateTime(rule.CreatedAt),
		UpdatedAt:          strfmt.DateTime(rule.UpdatedAt),
	}
	if rule.MaxDistanceKm != nil {
		v, _ := rule.MaxDistanceKm.Float64()
		resp.MaxDistanceKm = &v
	}
	if rule.MaxDurationMinutes != nil {
		v := int64(*rule.MaxDurationMinutes)
		resp.MaxDurationMinutes = &v
	}
	return resp
}

func localTravelRuleListToResponse(rules []model.LocalTravelRule) models.LocalTravelRuleList {
	data := make([]*models.LocalTravelRule, 0, len(rules))
	for i := range rules {
		data = append(data, localTravelRuleToResponse(&rules[i]))
	}
	return models.LocalTravelRuleList{Data: data}
}

func handleLocalTravelRuleError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrLocalTravelRuleNotFound:
		respondError(w, http.StatusNotFound, "Local travel rule not found")
	case service.ErrLocalTravelRuleSetIDRequired:
		respondError(w, http.StatusBadRequest, "Rule set ID is required")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
