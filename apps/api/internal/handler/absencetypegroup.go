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

type AbsenceTypeGroupHandler struct {
	svc *service.AbsenceTypeGroupService
}

func NewAbsenceTypeGroupHandler(svc *service.AbsenceTypeGroupService) *AbsenceTypeGroupHandler {
	return &AbsenceTypeGroupHandler{svc: svc}
}

func (h *AbsenceTypeGroupHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	groups, err := h.svc.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list absence type groups")
		return
	}

	data := make([]*models.AbsenceTypeGroup, 0, len(groups))
	for i := range groups {
		data = append(data, absenceTypeGroupToResponse(&groups[i]))
	}

	respondJSON(w, http.StatusOK, models.AbsenceTypeGroupList{Data: data})
}

func (h *AbsenceTypeGroupHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}

	g, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Absence type group not found")
		return
	}

	respondJSON(w, http.StatusOK, absenceTypeGroupToResponse(g))
}

func (h *AbsenceTypeGroupHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateAbsenceTypeGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateAbsenceTypeGroupInput{
		TenantID:    tenantID,
		Code:        *req.Code,
		Name:        *req.Name,
		Description: req.Description,
	}

	g, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleAbsenceTypeGroupError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, absenceTypeGroupToResponse(g))
}

func (h *AbsenceTypeGroupHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}

	var req models.UpdateAbsenceTypeGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateAbsenceTypeGroupInput{}
	if req.Code != "" {
		input.Code = &req.Code
	}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	input.IsActive = &req.IsActive

	g, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleAbsenceTypeGroupError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, absenceTypeGroupToResponse(g))
}

func (h *AbsenceTypeGroupHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleAbsenceTypeGroupError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func absenceTypeGroupToResponse(g *model.AbsenceTypeGroup) *models.AbsenceTypeGroup {
	id := strfmt.UUID(g.ID.String())
	tenantID := strfmt.UUID(g.TenantID.String())

	resp := &models.AbsenceTypeGroup{
		ID:          &id,
		TenantID:    tenantID,
		Code:        &g.Code,
		Name:        &g.Name,
		Description: g.Description,
		IsActive:    g.IsActive,
		CreatedAt:   strfmt.DateTime(g.CreatedAt),
		UpdatedAt:   strfmt.DateTime(g.UpdatedAt),
	}

	return resp
}

func handleAbsenceTypeGroupError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrAbsenceTypeGroupNotFound:
		respondError(w, http.StatusNotFound, "Absence type group not found")
	case service.ErrAbsenceTypeGroupCodeRequired:
		respondError(w, http.StatusBadRequest, "Group code is required")
	case service.ErrAbsenceTypeGroupNameRequired:
		respondError(w, http.StatusBadRequest, "Group name is required")
	case service.ErrAbsenceTypeGroupCodeExists:
		respondError(w, http.StatusConflict, "A group with this code already exists for this tenant")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
