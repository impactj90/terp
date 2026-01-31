package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

// MonthlyEvalTemplateHandler handles monthly evaluation template HTTP requests.
type MonthlyEvalTemplateHandler struct {
	service *service.MonthlyEvalTemplateService
}

// NewMonthlyEvalTemplateHandler creates a new MonthlyEvalTemplateHandler.
func NewMonthlyEvalTemplateHandler(service *service.MonthlyEvalTemplateService) *MonthlyEvalTemplateHandler {
	return &MonthlyEvalTemplateHandler{service: service}
}

// List handles GET /monthly-evaluations
func (h *MonthlyEvalTemplateHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var isActive *bool
	if activeStr := r.URL.Query().Get("is_active"); activeStr != "" {
		val, err := strconv.ParseBool(activeStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid is_active parameter")
			return
		}
		isActive = &val
	}

	templates, err := h.service.List(r.Context(), tenantID, isActive)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list monthly evaluations")
		return
	}

	items := make([]*models.MonthlyEvaluation, 0, len(templates))
	for i := range templates {
		items = append(items, monthlyEvalTemplateToResponse(&templates[i]))
	}

	respondJSON(w, http.StatusOK, &models.MonthlyEvaluationList{Items: items})
}

// Get handles GET /monthly-evaluations/{id}
func (h *MonthlyEvalTemplateHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid evaluation ID")
		return
	}

	t, err := h.service.GetByID(r.Context(), id)
	if err != nil {
		if err == service.ErrMonthlyEvalTemplateNotFound {
			respondError(w, http.StatusNotFound, "Monthly evaluation not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to get monthly evaluation")
		return
	}

	respondJSON(w, http.StatusOK, monthlyEvalTemplateToResponse(t))
}

// GetDefault handles GET /monthly-evaluations/default
func (h *MonthlyEvalTemplateHandler) GetDefault(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	t, err := h.service.GetDefault(r.Context(), tenantID)
	if err != nil {
		if err == service.ErrMonthlyEvalTemplateNotFound {
			respondError(w, http.StatusNotFound, "No default evaluation configured")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to get default evaluation")
		return
	}

	respondJSON(w, http.StatusOK, monthlyEvalTemplateToResponse(t))
}

// Create handles POST /monthly-evaluations
func (h *MonthlyEvalTemplateHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateMonthlyEvaluationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateMonthlyEvalTemplateInput{
		TenantID: tenantID,
		Name:     *req.Name,
		IsActive: true,
	}

	if req.Description != "" {
		input.Description = req.Description
	}
	if req.FlextimeCapPositive != nil {
		input.FlextimeCapPositive = int(*req.FlextimeCapPositive)
	}
	if req.FlextimeCapNegative != nil {
		input.FlextimeCapNegative = int(*req.FlextimeCapNegative)
	}
	if req.OvertimeThreshold != nil {
		input.OvertimeThreshold = int(*req.OvertimeThreshold)
	}
	if req.MaxCarryoverVacation != nil {
		input.MaxCarryoverVacation = decimal.NewFromFloat(*req.MaxCarryoverVacation)
	}
	if req.IsDefault != nil {
		input.IsDefault = *req.IsDefault
	}
	if req.IsActive != nil {
		input.IsActive = *req.IsActive
	}

	t, err := h.service.Create(r.Context(), input)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to create monthly evaluation")
		return
	}

	respondJSON(w, http.StatusCreated, monthlyEvalTemplateToResponse(t))
}

// Update handles PUT /monthly-evaluations/{id}
func (h *MonthlyEvalTemplateHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid evaluation ID")
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Failed to read request body")
		return
	}

	var req models.UpdateMonthlyEvaluationRequest
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

	input := service.UpdateMonthlyEvalTemplateInput{}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if _, ok := raw["description"]; ok {
		input.Description = &req.Description
	}
	if req.FlextimeCapPositive != nil {
		v := int(*req.FlextimeCapPositive)
		input.FlextimeCapPositive = &v
	}
	if req.FlextimeCapNegative != nil {
		v := int(*req.FlextimeCapNegative)
		input.FlextimeCapNegative = &v
	}
	if req.OvertimeThreshold != nil {
		v := int(*req.OvertimeThreshold)
		input.OvertimeThreshold = &v
	}
	if req.MaxCarryoverVacation != nil {
		v := decimal.NewFromFloat(*req.MaxCarryoverVacation)
		input.MaxCarryoverVacation = &v
	}
	if _, ok := raw["is_default"]; ok {
		input.IsDefault = &req.IsDefault
	}
	if _, ok := raw["is_active"]; ok {
		input.IsActive = &req.IsActive
	}

	t, err := h.service.Update(r.Context(), id, input)
	if err != nil {
		if err == service.ErrMonthlyEvalTemplateNotFound {
			respondError(w, http.StatusNotFound, "Monthly evaluation not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to update monthly evaluation")
		return
	}

	respondJSON(w, http.StatusOK, monthlyEvalTemplateToResponse(t))
}

// Delete handles DELETE /monthly-evaluations/{id}
func (h *MonthlyEvalTemplateHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid evaluation ID")
		return
	}

	if err := h.service.Delete(r.Context(), id); err != nil {
		if err == service.ErrMonthlyEvalTemplateNotFound {
			respondError(w, http.StatusNotFound, "Monthly evaluation not found")
			return
		}
		if err == service.ErrCannotDeleteDefaultTemplate {
			respondError(w, http.StatusConflict, "Cannot delete default evaluation")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to delete monthly evaluation")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// SetDefault handles POST /monthly-evaluations/{id}/set-default
func (h *MonthlyEvalTemplateHandler) SetDefault(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid evaluation ID")
		return
	}

	t, err := h.service.SetDefault(r.Context(), id)
	if err != nil {
		if err == service.ErrMonthlyEvalTemplateNotFound {
			respondError(w, http.StatusNotFound, "Monthly evaluation not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to set default evaluation")
		return
	}

	respondJSON(w, http.StatusOK, monthlyEvalTemplateToResponse(t))
}

// monthlyEvalTemplateToResponse converts an internal template to the API response model.
func monthlyEvalTemplateToResponse(t *model.MonthlyEvaluationTemplate) *models.MonthlyEvaluation {
	id := strfmt.UUID(t.ID.String())
	tenantID := strfmt.UUID(t.TenantID.String())
	name := t.Name
	isDefault := t.IsDefault
	isActive := t.IsActive
	maxCarryover, _ := t.MaxCarryoverVacation.Float64()

	return &models.MonthlyEvaluation{
		ID:                   &id,
		TenantID:             &tenantID,
		Name:                 &name,
		Description:          t.Description,
		FlextimeCapPositive:  int64(t.FlextimeCapPositive),
		FlextimeCapNegative:  int64(t.FlextimeCapNegative),
		OvertimeThreshold:    int64(t.OvertimeThreshold),
		MaxCarryoverVacation: maxCarryover,
		IsDefault:            &isDefault,
		IsActive:             &isActive,
		CreatedAt:            strfmt.DateTime(t.CreatedAt),
		UpdatedAt:            strfmt.DateTime(t.UpdatedAt),
	}
}
