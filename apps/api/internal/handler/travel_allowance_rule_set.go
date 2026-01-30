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

type TravelAllowanceRuleSetHandler struct {
	svc *service.TravelAllowanceRuleSetService
}

func NewTravelAllowanceRuleSetHandler(svc *service.TravelAllowanceRuleSetService) *TravelAllowanceRuleSetHandler {
	return &TravelAllowanceRuleSetHandler{svc: svc}
}

func (h *TravelAllowanceRuleSetHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	ruleSets, err := h.svc.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list travel allowance rule sets")
		return
	}
	respondJSON(w, http.StatusOK, ruleSetListToResponse(ruleSets))
}

func (h *TravelAllowanceRuleSetHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid rule set ID")
		return
	}

	rs, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Travel allowance rule set not found")
		return
	}

	respondJSON(w, http.StatusOK, ruleSetToResponse(rs))
}

func (h *TravelAllowanceRuleSetHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateTravelAllowanceRuleSetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateTravelAllowanceRuleSetInput{
		TenantID:         tenantID,
		Code:             *req.Code,
		Name:             *req.Name,
		Description:      req.Description,
		CalculationBasis: req.CalculationBasis,
		DistanceRule:     req.DistanceRule,
	}
	if vf := req.ValidFrom.String(); vf != "" && vf != "0001-01-01" {
		input.ValidFrom = &vf
	}
	if vt := req.ValidTo.String(); vt != "" && vt != "0001-01-01" {
		input.ValidTo = &vt
	}
	if req.SortOrder != 0 {
		so := int(req.SortOrder)
		input.SortOrder = &so
	}

	rs, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleRuleSetError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, ruleSetToResponse(rs))
}

func (h *TravelAllowanceRuleSetHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid rule set ID")
		return
	}

	var req models.UpdateTravelAllowanceRuleSetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateTravelAllowanceRuleSetInput{}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	if req.CalculationBasis != "" {
		input.CalculationBasis = &req.CalculationBasis
	}
	if req.DistanceRule != "" {
		input.DistanceRule = &req.DistanceRule
	}
	if vf := req.ValidFrom.String(); vf != "" && vf != "0001-01-01" {
		input.ValidFrom = &vf
	}
	if vt := req.ValidTo.String(); vt != "" && vt != "0001-01-01" {
		input.ValidTo = &vt
	}
	input.IsActive = &req.IsActive
	if req.SortOrder != 0 {
		so := int(req.SortOrder)
		input.SortOrder = &so
	}

	rs, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleRuleSetError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, ruleSetToResponse(rs))
}

func (h *TravelAllowanceRuleSetHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid rule set ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleRuleSetError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func ruleSetToResponse(rs *model.TravelAllowanceRuleSet) *models.TravelAllowanceRuleSet {
	id := strfmt.UUID(rs.ID.String())
	tenantID := strfmt.UUID(rs.TenantID.String())

	resp := &models.TravelAllowanceRuleSet{
		ID:               &id,
		TenantID:         &tenantID,
		Code:             &rs.Code,
		Name:             &rs.Name,
		Description:      &rs.Description,
		CalculationBasis: rs.CalculationBasis,
		DistanceRule:     rs.DistanceRule,
		IsActive:         rs.IsActive,
		SortOrder:        int64(rs.SortOrder),
		CreatedAt:        strfmt.DateTime(rs.CreatedAt),
		UpdatedAt:        strfmt.DateTime(rs.UpdatedAt),
	}
	if rs.ValidFrom != nil {
		d := strfmt.Date(*rs.ValidFrom)
		resp.ValidFrom = &d
	}
	if rs.ValidTo != nil {
		d := strfmt.Date(*rs.ValidTo)
		resp.ValidTo = &d
	}
	return resp
}

func ruleSetListToResponse(ruleSets []model.TravelAllowanceRuleSet) models.TravelAllowanceRuleSetList {
	data := make([]*models.TravelAllowanceRuleSet, 0, len(ruleSets))
	for i := range ruleSets {
		data = append(data, ruleSetToResponse(&ruleSets[i]))
	}
	return models.TravelAllowanceRuleSetList{Data: data}
}

func handleRuleSetError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrTravelAllowanceRuleSetNotFound:
		respondError(w, http.StatusNotFound, "Travel allowance rule set not found")
	case service.ErrTravelAllowanceRuleSetCodeRequired:
		respondError(w, http.StatusBadRequest, "Rule set code is required")
	case service.ErrTravelAllowanceRuleSetNameRequired:
		respondError(w, http.StatusBadRequest, "Rule set name is required")
	case service.ErrTravelAllowanceRuleSetCodeExists:
		respondError(w, http.StatusConflict, "A rule set with this code already exists")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
