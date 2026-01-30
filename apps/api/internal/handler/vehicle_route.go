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

type VehicleRouteHandler struct {
	svc *service.VehicleRouteService
}

func NewVehicleRouteHandler(svc *service.VehicleRouteService) *VehicleRouteHandler {
	return &VehicleRouteHandler{svc: svc}
}

func (h *VehicleRouteHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	routes, err := h.svc.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list vehicle routes")
		return
	}
	respondJSON(w, http.StatusOK, vehicleRouteListToResponse(routes))
}

func (h *VehicleRouteHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid vehicle route ID")
		return
	}

	vr, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Vehicle route not found")
		return
	}

	respondJSON(w, http.StatusOK, vehicleRouteToResponse(vr))
}

func (h *VehicleRouteHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateVehicleRouteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateVehicleRouteInput{
		TenantID:    tenantID,
		Code:        *req.Code,
		Name:        *req.Name,
		Description: req.Description,
	}
	if req.DistanceKm != 0 {
		dk := req.DistanceKm
		input.DistanceKm = &dk
	}
	if req.SortOrder != 0 {
		so := int(req.SortOrder)
		input.SortOrder = &so
	}

	vr, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleVehicleRouteError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, vehicleRouteToResponse(vr))
}

func (h *VehicleRouteHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid vehicle route ID")
		return
	}

	var req models.UpdateVehicleRouteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateVehicleRouteInput{}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	if req.DistanceKm != 0 {
		dk := req.DistanceKm
		input.DistanceKm = &dk
	}
	input.IsActive = &req.IsActive
	if req.SortOrder != 0 {
		so := int(req.SortOrder)
		input.SortOrder = &so
	}

	vr, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleVehicleRouteError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, vehicleRouteToResponse(vr))
}

func (h *VehicleRouteHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid vehicle route ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleVehicleRouteError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func vehicleRouteToResponse(vr *model.VehicleRoute) *models.VehicleRoute {
	id := strfmt.UUID(vr.ID.String())
	tenantID := strfmt.UUID(vr.TenantID.String())
	distKm, _ := vr.DistanceKm.Float64()

	return &models.VehicleRoute{
		ID:          &id,
		TenantID:    &tenantID,
		Code:        &vr.Code,
		Name:        &vr.Name,
		Description: &vr.Description,
		DistanceKm:  &distKm,
		IsActive:    vr.IsActive,
		SortOrder:   int64(vr.SortOrder),
		CreatedAt:   strfmt.DateTime(vr.CreatedAt),
		UpdatedAt:   strfmt.DateTime(vr.UpdatedAt),
	}
}

func vehicleRouteListToResponse(routes []model.VehicleRoute) models.VehicleRouteList {
	data := make([]*models.VehicleRoute, 0, len(routes))
	for i := range routes {
		data = append(data, vehicleRouteToResponse(&routes[i]))
	}
	return models.VehicleRouteList{Data: data}
}

func handleVehicleRouteError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrVehicleRouteNotFound:
		respondError(w, http.StatusNotFound, "Vehicle route not found")
	case service.ErrVehicleRouteCodeRequired:
		respondError(w, http.StatusBadRequest, "Vehicle route code is required")
	case service.ErrVehicleRouteNameRequired:
		respondError(w, http.StatusBadRequest, "Vehicle route name is required")
	case service.ErrVehicleRouteCodeExists:
		respondError(w, http.StatusConflict, "A vehicle route with this code already exists")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
