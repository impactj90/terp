package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

// LocationHandler handles location HTTP requests.
type LocationHandler struct {
	service *service.LocationService
}

// NewLocationHandler creates a new LocationHandler.
func NewLocationHandler(service *service.LocationService) *LocationHandler {
	return &LocationHandler{service: service}
}

// List handles GET /locations
func (h *LocationHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var isActive *bool
	if activeStr := r.URL.Query().Get("active"); activeStr != "" {
		val, err := strconv.ParseBool(activeStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid active parameter")
			return
		}
		isActive = &val
	}

	locations, err := h.service.List(r.Context(), tenantID, isActive)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list locations")
		return
	}

	data := make([]*models.Location, 0, len(locations))
	for i := range locations {
		data = append(data, locationToResponse(&locations[i]))
	}

	respondJSON(w, http.StatusOK, &models.LocationList{Data: data})
}

// Get handles GET /locations/{id}
func (h *LocationHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid location ID")
		return
	}

	loc, err := h.service.GetByID(r.Context(), id)
	if err != nil {
		if err == service.ErrLocationNotFound {
			respondError(w, http.StatusNotFound, "Location not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to get location")
		return
	}

	respondJSON(w, http.StatusOK, locationToResponse(loc))
}

// Create handles POST /locations
func (h *LocationHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateLocationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateLocationInput{
		TenantID:    tenantID,
		Code:        *req.Code,
		Name:        *req.Name,
		Description: req.Description,
		Address:     req.Address,
		City:        req.City,
		Country:     req.Country,
		Timezone:    req.Timezone,
	}

	loc, err := h.service.Create(r.Context(), input)
	if err != nil {
		if err == service.ErrLocationCodeConflict {
			respondError(w, http.StatusConflict, "Location code already exists")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to create location")
		return
	}

	respondJSON(w, http.StatusCreated, locationToResponse(loc))
}

// Update handles PATCH /locations/{id}
func (h *LocationHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid location ID")
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Failed to read request body")
		return
	}

	var req models.UpdateLocationRequest
	if err := json.Unmarshal(body, &req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Decode raw JSON to detect which fields were explicitly sent
	var raw map[string]json.RawMessage
	_ = json.Unmarshal(body, &raw)

	input := service.UpdateLocationInput{}
	if req.Code != "" {
		input.Code = &req.Code
	}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if _, ok := raw["description"]; ok {
		input.Description = &req.Description
	}
	if _, ok := raw["address"]; ok {
		input.Address = &req.Address
	}
	if _, ok := raw["city"]; ok {
		input.City = &req.City
	}
	if _, ok := raw["country"]; ok {
		input.Country = &req.Country
	}
	if _, ok := raw["timezone"]; ok {
		input.Timezone = &req.Timezone
	}
	if _, ok := raw["is_active"]; ok {
		input.IsActive = &req.IsActive
	}

	loc, err := h.service.Update(r.Context(), id, input)
	if err != nil {
		if err == service.ErrLocationNotFound {
			respondError(w, http.StatusNotFound, "Location not found")
			return
		}
		if err == service.ErrLocationCodeConflict {
			respondError(w, http.StatusConflict, "Location code already exists")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to update location")
		return
	}

	respondJSON(w, http.StatusOK, locationToResponse(loc))
}

// Delete handles DELETE /locations/{id}
func (h *LocationHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid location ID")
		return
	}

	if err := h.service.Delete(r.Context(), id); err != nil {
		if err == service.ErrLocationNotFound {
			respondError(w, http.StatusNotFound, "Location not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to delete location")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// locationToResponse converts an internal Location to the API response model.
func locationToResponse(loc *model.Location) *models.Location {
	id := strfmt.UUID(loc.ID.String())
	tenantID := strfmt.UUID(loc.TenantID.String())
	code := loc.Code
	name := loc.Name
	desc := loc.Description
	addr := loc.Address
	city := loc.City
	country := loc.Country

	return &models.Location{
		ID:          &id,
		TenantID:    &tenantID,
		Code:        &code,
		Name:        &name,
		Description: &desc,
		Address:     &addr,
		City:        &city,
		Country:     &country,
		Timezone:    loc.Timezone,
		IsActive:    loc.IsActive,
		CreatedAt:   strfmt.DateTime(loc.CreatedAt),
		UpdatedAt:   strfmt.DateTime(loc.UpdatedAt),
	}
}
