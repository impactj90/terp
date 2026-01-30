package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/service"
)

// ActivityHandler handles activity HTTP requests.
type ActivityHandler struct {
	activityService *service.ActivityService
}

// NewActivityHandler creates a new ActivityHandler.
func NewActivityHandler(activityService *service.ActivityService) *ActivityHandler {
	return &ActivityHandler{activityService: activityService}
}

func (h *ActivityHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	activeOnly := r.URL.Query().Get("active") == "true"

	var activities interface{}
	var err error
	if activeOnly {
		activities, err = h.activityService.ListActive(r.Context(), tenantID)
	} else {
		activities, err = h.activityService.List(r.Context(), tenantID)
	}

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list activities")
		return
	}
	respondJSON(w, http.StatusOK, activities)
}

func (h *ActivityHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid activity ID")
		return
	}

	a, err := h.activityService.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Activity not found")
		return
	}

	respondJSON(w, http.StatusOK, a)
}

func (h *ActivityHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateActivityRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateActivityInput{
		TenantID:    tenantID,
		Code:        *req.Code,
		Name:        *req.Name,
		Description: req.Description,
	}

	a, err := h.activityService.Create(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrActivityCodeRequired:
			respondError(w, http.StatusBadRequest, "Activity code is required")
		case service.ErrActivityNameRequired:
			respondError(w, http.StatusBadRequest, "Activity name is required")
		case service.ErrActivityCodeExists:
			respondError(w, http.StatusConflict, "An activity with this code already exists")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to create activity")
		}
		return
	}

	respondJSON(w, http.StatusCreated, a)
}

func (h *ActivityHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid activity ID")
		return
	}

	var req models.UpdateActivityRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateActivityInput{}
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

	a, err := h.activityService.Update(r.Context(), id, input)
	if err != nil {
		switch err {
		case service.ErrActivityNotFound:
			respondError(w, http.StatusNotFound, "Activity not found")
		case service.ErrActivityCodeRequired:
			respondError(w, http.StatusBadRequest, "Activity code cannot be empty")
		case service.ErrActivityNameRequired:
			respondError(w, http.StatusBadRequest, "Activity name cannot be empty")
		case service.ErrActivityCodeExists:
			respondError(w, http.StatusConflict, "An activity with this code already exists")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to update activity")
		}
		return
	}

	respondJSON(w, http.StatusOK, a)
}

func (h *ActivityHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid activity ID")
		return
	}

	if err := h.activityService.Delete(r.Context(), id); err != nil {
		if err == service.ErrActivityNotFound {
			respondError(w, http.StatusNotFound, "Activity not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to delete activity")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
