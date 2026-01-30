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

type ExtendedTravelRuleHandler struct {
	svc *service.ExtendedTravelRuleService
}

func NewExtendedTravelRuleHandler(svc *service.ExtendedTravelRuleService) *ExtendedTravelRuleHandler {
	return &ExtendedTravelRuleHandler{svc: svc}
}

func (h *ExtendedTravelRuleHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	rules, err := h.svc.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list extended travel rules")
		return
	}
	respondJSON(w, http.StatusOK, extendedTravelRuleListToResponse(rules))
}

func (h *ExtendedTravelRuleHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid extended travel rule ID")
		return
	}

	rule, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Extended travel rule not found")
		return
	}

	respondJSON(w, http.StatusOK, extendedTravelRuleToResponse(rule))
}

func (h *ExtendedTravelRuleHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateExtendedTravelRuleRequest
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

	input := service.CreateExtendedTravelRuleInput{
		TenantID:  tenantID,
		RuleSetID: ruleSetID,
	}
	if req.ArrivalDayTaxFree != 0 {
		input.ArrivalDayTaxFree = &req.ArrivalDayTaxFree
	}
	if req.ArrivalDayTaxable != 0 {
		input.ArrivalDayTaxable = &req.ArrivalDayTaxable
	}
	if req.DepartureDayTaxFree != 0 {
		input.DepartureDayTaxFree = &req.DepartureDayTaxFree
	}
	if req.DepartureDayTaxable != 0 {
		input.DepartureDayTaxable = &req.DepartureDayTaxable
	}
	if req.IntermediateDayTaxFree != 0 {
		input.IntermediateDayTaxFree = &req.IntermediateDayTaxFree
	}
	if req.IntermediateDayTaxable != 0 {
		input.IntermediateDayTaxable = &req.IntermediateDayTaxable
	}
	if req.ThreeMonthEnabled {
		input.ThreeMonthEnabled = &req.ThreeMonthEnabled
	}
	if req.ThreeMonthTaxFree != 0 {
		input.ThreeMonthTaxFree = &req.ThreeMonthTaxFree
	}
	if req.ThreeMonthTaxable != 0 {
		input.ThreeMonthTaxable = &req.ThreeMonthTaxable
	}
	if req.SortOrder != 0 {
		so := int(req.SortOrder)
		input.SortOrder = &so
	}

	rule, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleExtendedTravelRuleError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, extendedTravelRuleToResponse(rule))
}

func (h *ExtendedTravelRuleHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid extended travel rule ID")
		return
	}

	var req models.UpdateExtendedTravelRuleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateExtendedTravelRuleInput{}
	if req.ArrivalDayTaxFree != 0 {
		input.ArrivalDayTaxFree = &req.ArrivalDayTaxFree
	}
	if req.ArrivalDayTaxable != 0 {
		input.ArrivalDayTaxable = &req.ArrivalDayTaxable
	}
	if req.DepartureDayTaxFree != 0 {
		input.DepartureDayTaxFree = &req.DepartureDayTaxFree
	}
	if req.DepartureDayTaxable != 0 {
		input.DepartureDayTaxable = &req.DepartureDayTaxable
	}
	if req.IntermediateDayTaxFree != 0 {
		input.IntermediateDayTaxFree = &req.IntermediateDayTaxFree
	}
	if req.IntermediateDayTaxable != 0 {
		input.IntermediateDayTaxable = &req.IntermediateDayTaxable
	}
	input.ThreeMonthEnabled = &req.ThreeMonthEnabled
	if req.ThreeMonthTaxFree != 0 {
		input.ThreeMonthTaxFree = &req.ThreeMonthTaxFree
	}
	if req.ThreeMonthTaxable != 0 {
		input.ThreeMonthTaxable = &req.ThreeMonthTaxable
	}
	input.IsActive = &req.IsActive
	if req.SortOrder != 0 {
		so := int(req.SortOrder)
		input.SortOrder = &so
	}

	rule, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleExtendedTravelRuleError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, extendedTravelRuleToResponse(rule))
}

func (h *ExtendedTravelRuleHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid extended travel rule ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleExtendedTravelRuleError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func extendedTravelRuleToResponse(rule *model.ExtendedTravelRule) *models.ExtendedTravelRule {
	id := strfmt.UUID(rule.ID.String())
	tenantID := strfmt.UUID(rule.TenantID.String())
	ruleSetID := strfmt.UUID(rule.RuleSetID.String())

	arrTF, _ := rule.ArrivalDayTaxFree.Float64()
	arrTX, _ := rule.ArrivalDayTaxable.Float64()
	depTF, _ := rule.DepartureDayTaxFree.Float64()
	depTX, _ := rule.DepartureDayTaxable.Float64()
	intTF, _ := rule.IntermediateDayTaxFree.Float64()
	intTX, _ := rule.IntermediateDayTaxable.Float64()
	tmTF, _ := rule.ThreeMonthTaxFree.Float64()
	tmTX, _ := rule.ThreeMonthTaxable.Float64()

	return &models.ExtendedTravelRule{
		ID:                     &id,
		TenantID:               &tenantID,
		RuleSetID:              &ruleSetID,
		ArrivalDayTaxFree:      arrTF,
		ArrivalDayTaxable:      arrTX,
		DepartureDayTaxFree:    depTF,
		DepartureDayTaxable:    depTX,
		IntermediateDayTaxFree: intTF,
		IntermediateDayTaxable: intTX,
		ThreeMonthEnabled:      rule.ThreeMonthEnabled,
		ThreeMonthTaxFree:      tmTF,
		ThreeMonthTaxable:      tmTX,
		IsActive:               rule.IsActive,
		SortOrder:              int64(rule.SortOrder),
		CreatedAt:              strfmt.DateTime(rule.CreatedAt),
		UpdatedAt:              strfmt.DateTime(rule.UpdatedAt),
	}
}

func extendedTravelRuleListToResponse(rules []model.ExtendedTravelRule) models.ExtendedTravelRuleList {
	data := make([]*models.ExtendedTravelRule, 0, len(rules))
	for i := range rules {
		data = append(data, extendedTravelRuleToResponse(&rules[i]))
	}
	return models.ExtendedTravelRuleList{Data: data}
}

func handleExtendedTravelRuleError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrExtendedTravelRuleNotFound:
		respondError(w, http.StatusNotFound, "Extended travel rule not found")
	case service.ErrExtendedTravelRuleSetIDRequired:
		respondError(w, http.StatusBadRequest, "Rule set ID is required")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
