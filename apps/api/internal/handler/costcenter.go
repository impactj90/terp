package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

type CostCenterHandler struct {
	costCenterService *service.CostCenterService
}

func NewCostCenterHandler(costCenterService *service.CostCenterService) *CostCenterHandler {
	return &CostCenterHandler{costCenterService: costCenterService}
}

func (h *CostCenterHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	// Check for active_only filter
	activeOnly := r.URL.Query().Get("active_only") == "true"

	var costCenters []model.CostCenter
	var err error
	if activeOnly {
		costCenters, err = h.costCenterService.ListActive(r.Context(), tenantID)
	} else {
		costCenters, err = h.costCenterService.List(r.Context(), tenantID)
	}

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list cost centers")
		return
	}
	respondJSON(w, http.StatusOK, costCenters)
}

func (h *CostCenterHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid cost center ID")
		return
	}

	cc, err := h.costCenterService.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Cost center not found")
		return
	}

	respondJSON(w, http.StatusOK, cc)
}

func (h *CostCenterHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateCostCenterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate using generated validation
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateCostCenterInput{
		TenantID:    tenantID,
		Code:        *req.Code,
		Name:        *req.Name,
		Description: req.Description,
		IsActive:    true, // Default to active for new cost centers
	}

	cc, err := h.costCenterService.Create(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrCostCenterCodeRequired:
			respondError(w, http.StatusBadRequest, "Cost center code is required")
		case service.ErrCostCenterNameRequired:
			respondError(w, http.StatusBadRequest, "Cost center name is required")
		case service.ErrCostCenterCodeExists:
			respondError(w, http.StatusBadRequest, "A cost center with this code already exists")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to create cost center")
		}
		return
	}

	respondJSON(w, http.StatusCreated, cc)
}

func (h *CostCenterHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid cost center ID")
		return
	}

	var req models.UpdateCostCenterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate using generated validation
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Convert to service input - only set fields that were provided
	input := service.UpdateCostCenterInput{}
	if req.Code != "" {
		input.Code = &req.Code
	}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	// Note: IsActive cannot be reliably detected as "provided" vs "default false"
	// with the current OpenAPI spec design. Consider using x-nullable in spec.
	input.IsActive = &req.IsActive

	cc, err := h.costCenterService.Update(r.Context(), id, input)
	if err != nil {
		switch err {
		case service.ErrCostCenterNotFound:
			respondError(w, http.StatusNotFound, "Cost center not found")
		case service.ErrCostCenterCodeRequired:
			respondError(w, http.StatusBadRequest, "Cost center code cannot be empty")
		case service.ErrCostCenterNameRequired:
			respondError(w, http.StatusBadRequest, "Cost center name cannot be empty")
		case service.ErrCostCenterCodeExists:
			respondError(w, http.StatusBadRequest, "A cost center with this code already exists")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to update cost center")
		}
		return
	}

	respondJSON(w, http.StatusOK, cc)
}

func (h *CostCenterHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid cost center ID")
		return
	}

	if err := h.costCenterService.Delete(r.Context(), id); err != nil {
		if err == service.ErrCostCenterNotFound {
			respondError(w, http.StatusNotFound, "Cost center not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to delete cost center")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
