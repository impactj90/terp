package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

type EmploymentTypeHandler struct {
	employmentTypeService *service.EmploymentTypeService
}

func NewEmploymentTypeHandler(employmentTypeService *service.EmploymentTypeService) *EmploymentTypeHandler {
	return &EmploymentTypeHandler{employmentTypeService: employmentTypeService}
}

func (h *EmploymentTypeHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	// Check for active_only filter
	activeOnly := r.URL.Query().Get("active_only") == "true"

	var employmentTypes []model.EmploymentType
	var err error
	if activeOnly {
		employmentTypes, err = h.employmentTypeService.ListActive(r.Context(), tenantID)
	} else {
		employmentTypes, err = h.employmentTypeService.List(r.Context(), tenantID)
	}

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list employment types")
		return
	}
	respondJSON(w, http.StatusOK, employmentTypes)
}

func (h *EmploymentTypeHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employment type ID")
		return
	}

	et, err := h.employmentTypeService.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Employment type not found")
		return
	}

	respondJSON(w, http.StatusOK, et)
}

func (h *EmploymentTypeHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateEmploymentTypeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate using generated validation
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Convert float64 to decimal.Decimal, default to 40.0 if not provided
	weeklyHours := decimal.NewFromFloat(40.0)
	if req.DefaultWeeklyHours != 0 {
		weeklyHours = decimal.NewFromFloat(req.DefaultWeeklyHours)
	}

	input := service.CreateEmploymentTypeInput{
		TenantID:           tenantID,
		Code:               *req.Code,
		Name:               *req.Name,
		DefaultWeeklyHours: weeklyHours,
		IsActive:           true, // Default to active for new employment types
	}

	et, err := h.employmentTypeService.Create(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrEmploymentTypeCodeRequired:
			respondError(w, http.StatusBadRequest, "Employment type code is required")
		case service.ErrEmploymentTypeNameRequired:
			respondError(w, http.StatusBadRequest, "Employment type name is required")
		case service.ErrEmploymentTypeCodeExists:
			respondError(w, http.StatusBadRequest, "An employment type with this code already exists")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to create employment type")
		}
		return
	}

	respondJSON(w, http.StatusCreated, et)
}

func (h *EmploymentTypeHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employment type ID")
		return
	}

	var req models.UpdateEmploymentTypeRequest
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
	input := service.UpdateEmploymentTypeInput{}
	if req.Code != "" {
		input.Code = &req.Code
	}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.DefaultWeeklyHours != 0 {
		hours := decimal.NewFromFloat(req.DefaultWeeklyHours)
		input.DefaultWeeklyHours = &hours
	}
	// Note: IsActive cannot be reliably detected as "provided" vs "default false"
	// with the current OpenAPI spec design. Consider using x-nullable in spec.
	input.IsActive = &req.IsActive

	et, err := h.employmentTypeService.Update(r.Context(), id, input)
	if err != nil {
		switch err {
		case service.ErrEmploymentTypeNotFound:
			respondError(w, http.StatusNotFound, "Employment type not found")
		case service.ErrEmploymentTypeCodeRequired:
			respondError(w, http.StatusBadRequest, "Employment type code cannot be empty")
		case service.ErrEmploymentTypeNameRequired:
			respondError(w, http.StatusBadRequest, "Employment type name cannot be empty")
		case service.ErrEmploymentTypeCodeExists:
			respondError(w, http.StatusBadRequest, "An employment type with this code already exists")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to update employment type")
		}
		return
	}

	respondJSON(w, http.StatusOK, et)
}

func (h *EmploymentTypeHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employment type ID")
		return
	}

	if err := h.employmentTypeService.Delete(r.Context(), id); err != nil {
		if err == service.ErrEmploymentTypeNotFound {
			respondError(w, http.StatusNotFound, "Employment type not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to delete employment type")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
