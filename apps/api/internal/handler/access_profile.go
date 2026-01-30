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

type AccessProfileHandler struct {
	svc *service.AccessProfileService
}

func NewAccessProfileHandler(svc *service.AccessProfileService) *AccessProfileHandler {
	return &AccessProfileHandler{svc: svc}
}

func (h *AccessProfileHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	profiles, err := h.svc.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list access profiles")
		return
	}
	respondJSON(w, http.StatusOK, accessProfileListToResponse(profiles))
}

func (h *AccessProfileHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid access profile ID")
		return
	}

	ap, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Access profile not found")
		return
	}

	respondJSON(w, http.StatusOK, accessProfileToResponse(ap))
}

func (h *AccessProfileHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateAccessProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateAccessProfileInput{
		TenantID:    tenantID,
		Code:        *req.Code,
		Name:        *req.Name,
		Description: req.Description,
	}

	ap, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleAccessProfileError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, accessProfileToResponse(ap))
}

func (h *AccessProfileHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid access profile ID")
		return
	}

	var req models.UpdateAccessProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateAccessProfileInput{}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	input.IsActive = &req.IsActive

	ap, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleAccessProfileError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, accessProfileToResponse(ap))
}

func (h *AccessProfileHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid access profile ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleAccessProfileError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func accessProfileToResponse(ap *model.AccessProfile) *models.AccessProfile {
	id := strfmt.UUID(ap.ID.String())
	tenantID := strfmt.UUID(ap.TenantID.String())

	return &models.AccessProfile{
		ID:          &id,
		TenantID:    &tenantID,
		Code:        &ap.Code,
		Name:        &ap.Name,
		Description: &ap.Description,
		IsActive:    ap.IsActive,
		CreatedAt:   strfmt.DateTime(ap.CreatedAt),
		UpdatedAt:   strfmt.DateTime(ap.UpdatedAt),
	}
}

func accessProfileListToResponse(profiles []model.AccessProfile) models.AccessProfileList {
	data := make([]*models.AccessProfile, 0, len(profiles))
	for i := range profiles {
		data = append(data, accessProfileToResponse(&profiles[i]))
	}
	return models.AccessProfileList{Data: data}
}

func handleAccessProfileError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrAccessProfileNotFound:
		respondError(w, http.StatusNotFound, "Access profile not found")
	case service.ErrAccessProfileCodeRequired:
		respondError(w, http.StatusBadRequest, "Access profile code is required")
	case service.ErrAccessProfileNameRequired:
		respondError(w, http.StatusBadRequest, "Access profile name is required")
	case service.ErrAccessProfileCodeExists:
		respondError(w, http.StatusConflict, "An access profile with this code already exists")
	case service.ErrAccessProfileInUse:
		respondError(w, http.StatusConflict, "Access profile is in use by employee assignments and cannot be deleted")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
