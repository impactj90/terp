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

type AccessZoneHandler struct {
	svc *service.AccessZoneService
}

func NewAccessZoneHandler(svc *service.AccessZoneService) *AccessZoneHandler {
	return &AccessZoneHandler{svc: svc}
}

func (h *AccessZoneHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	zones, err := h.svc.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list access zones")
		return
	}
	respondJSON(w, http.StatusOK, accessZoneListToResponse(zones))
}

func (h *AccessZoneHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid access zone ID")
		return
	}

	az, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Access zone not found")
		return
	}

	respondJSON(w, http.StatusOK, accessZoneToResponse(az))
}

func (h *AccessZoneHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateAccessZoneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateAccessZoneInput{
		TenantID:    tenantID,
		Code:        *req.Code,
		Name:        *req.Name,
		Description: req.Description,
	}
	if req.SortOrder != 0 {
		so := int(req.SortOrder)
		input.SortOrder = &so
	}

	az, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleAccessZoneError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, accessZoneToResponse(az))
}

func (h *AccessZoneHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid access zone ID")
		return
	}

	var req models.UpdateAccessZoneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateAccessZoneInput{}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	input.IsActive = &req.IsActive
	if req.SortOrder != 0 {
		so := int(req.SortOrder)
		input.SortOrder = &so
	}

	az, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleAccessZoneError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, accessZoneToResponse(az))
}

func (h *AccessZoneHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid access zone ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleAccessZoneError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func accessZoneToResponse(az *model.AccessZone) *models.AccessZone {
	id := strfmt.UUID(az.ID.String())
	tenantID := strfmt.UUID(az.TenantID.String())

	return &models.AccessZone{
		ID:          &id,
		TenantID:    &tenantID,
		Code:        &az.Code,
		Name:        &az.Name,
		Description: &az.Description,
		IsActive:    az.IsActive,
		SortOrder:   int64(az.SortOrder),
		CreatedAt:   strfmt.DateTime(az.CreatedAt),
		UpdatedAt:   strfmt.DateTime(az.UpdatedAt),
	}
}

func accessZoneListToResponse(zones []model.AccessZone) models.AccessZoneList {
	data := make([]*models.AccessZone, 0, len(zones))
	for i := range zones {
		data = append(data, accessZoneToResponse(&zones[i]))
	}
	return models.AccessZoneList{Data: data}
}

func handleAccessZoneError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrAccessZoneNotFound:
		respondError(w, http.StatusNotFound, "Access zone not found")
	case service.ErrAccessZoneCodeRequired:
		respondError(w, http.StatusBadRequest, "Access zone code is required")
	case service.ErrAccessZoneNameRequired:
		respondError(w, http.StatusBadRequest, "Access zone name is required")
	case service.ErrAccessZoneCodeExists:
		respondError(w, http.StatusConflict, "An access zone with this code already exists")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
