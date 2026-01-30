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

type VehicleHandler struct {
	svc *service.VehicleService
}

func NewVehicleHandler(svc *service.VehicleService) *VehicleHandler {
	return &VehicleHandler{svc: svc}
}

func (h *VehicleHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	vehicles, err := h.svc.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list vehicles")
		return
	}
	respondJSON(w, http.StatusOK, vehicleListToResponse(vehicles))
}

func (h *VehicleHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid vehicle ID")
		return
	}

	v, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Vehicle not found")
		return
	}

	respondJSON(w, http.StatusOK, vehicleToResponse(v))
}

func (h *VehicleHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateVehicleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateVehicleInput{
		TenantID:     tenantID,
		Code:         *req.Code,
		Name:         *req.Name,
		Description:  req.Description,
		LicensePlate: req.LicensePlate,
	}
	if req.SortOrder != 0 {
		so := int(req.SortOrder)
		input.SortOrder = &so
	}

	v, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleVehicleError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, vehicleToResponse(v))
}

func (h *VehicleHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid vehicle ID")
		return
	}

	var req models.UpdateVehicleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateVehicleInput{}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	if req.LicensePlate != "" {
		input.LicensePlate = &req.LicensePlate
	}
	input.IsActive = &req.IsActive
	if req.SortOrder != 0 {
		so := int(req.SortOrder)
		input.SortOrder = &so
	}

	v, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleVehicleError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, vehicleToResponse(v))
}

func (h *VehicleHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid vehicle ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleVehicleError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func vehicleToResponse(v *model.Vehicle) *models.Vehicle {
	id := strfmt.UUID(v.ID.String())
	tenantID := strfmt.UUID(v.TenantID.String())

	return &models.Vehicle{
		ID:           &id,
		TenantID:     &tenantID,
		Code:         &v.Code,
		Name:         &v.Name,
		Description:  &v.Description,
		LicensePlate: &v.LicensePlate,
		IsActive:     v.IsActive,
		SortOrder:    int64(v.SortOrder),
		CreatedAt:    strfmt.DateTime(v.CreatedAt),
		UpdatedAt:    strfmt.DateTime(v.UpdatedAt),
	}
}

func vehicleListToResponse(vehicles []model.Vehicle) models.VehicleList {
	data := make([]*models.Vehicle, 0, len(vehicles))
	for i := range vehicles {
		data = append(data, vehicleToResponse(&vehicles[i]))
	}
	return models.VehicleList{Data: data}
}

func handleVehicleError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrVehicleNotFound:
		respondError(w, http.StatusNotFound, "Vehicle not found")
	case service.ErrVehicleCodeRequired:
		respondError(w, http.StatusBadRequest, "Vehicle code is required")
	case service.ErrVehicleNameRequired:
		respondError(w, http.StatusBadRequest, "Vehicle name is required")
	case service.ErrVehicleCodeExists:
		respondError(w, http.StatusConflict, "A vehicle with this code already exists")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
