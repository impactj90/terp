package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
)

// CorrectionHandler handles correction HTTP requests.
type CorrectionHandler struct {
	service *service.CorrectionService
}

// NewCorrectionHandler creates a new CorrectionHandler.
func NewCorrectionHandler(service *service.CorrectionService) *CorrectionHandler {
	return &CorrectionHandler{service: service}
}

// List handles GET /corrections
func (h *CorrectionHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	filter := repository.CorrectionFilter{
		TenantID: tenantID,
	}

	if empIDStr := r.URL.Query().Get("employee_id"); empIDStr != "" {
		empID, err := uuid.Parse(empIDStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid employee_id")
			return
		}
		filter.EmployeeID = &empID
	}

	if fromStr := r.URL.Query().Get("from"); fromStr != "" {
		t, err := time.Parse("2006-01-02", fromStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid from date")
			return
		}
		filter.From = &t
	}

	if toStr := r.URL.Query().Get("to"); toStr != "" {
		t, err := time.Parse("2006-01-02", toStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid to date")
			return
		}
		filter.To = &t
	}

	if ct := r.URL.Query().Get("correction_type"); ct != "" {
		filter.CorrectionType = &ct
	}

	if status := r.URL.Query().Get("status"); status != "" {
		filter.Status = &status
	}

	corrections, err := h.service.List(r.Context(), filter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list corrections")
		return
	}

	data := make([]*models.Correction, 0, len(corrections))
	for i := range corrections {
		data = append(data, correctionToResponse(&corrections[i]))
	}

	respondJSON(w, http.StatusOK, &models.CorrectionList{Data: data})
}

// Get handles GET /corrections/{id}
func (h *CorrectionHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid correction ID")
		return
	}

	c, err := h.service.GetByID(r.Context(), id)
	if err != nil {
		if err == service.ErrCorrectionNotFound {
			respondError(w, http.StatusNotFound, "Correction not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to get correction")
		return
	}

	respondJSON(w, http.StatusOK, correctionToResponse(c))
}

// Create handles POST /corrections
func (h *CorrectionHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateCorrectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	employeeID, err := uuid.Parse(req.EmployeeID.String())
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee_id")
		return
	}

	correctionDate := time.Time(*req.CorrectionDate)

	input := service.CreateCorrectionInput{
		TenantID:       tenantID,
		EmployeeID:     employeeID,
		CorrectionDate: correctionDate,
		CorrectionType: *req.CorrectionType,
		ValueMinutes:   int(*req.ValueMinutes),
		Reason:         *req.Reason,
	}

	if req.AccountID.String() != "" {
		accountID, err := uuid.Parse(req.AccountID.String())
		if err == nil {
			input.AccountID = &accountID
		}
	}

	// Extract user ID from auth context if available
	if user, ok := auth.UserFromContext(r.Context()); ok {
		input.CreatedBy = &user.ID
	}

	c, err := h.service.Create(r.Context(), input)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to create correction")
		return
	}

	respondJSON(w, http.StatusCreated, correctionToResponse(c))
}

// Update handles PATCH /corrections/{id}
func (h *CorrectionHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid correction ID")
		return
	}

	var req struct {
		ValueMinutes *int    `json:"value_minutes"`
		Reason       *string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	input := service.UpdateCorrectionInput{
		ValueMinutes: req.ValueMinutes,
		Reason:       req.Reason,
	}

	c, err := h.service.Update(r.Context(), id, input)
	if err != nil {
		if err == service.ErrCorrectionNotFound {
			respondError(w, http.StatusNotFound, "Correction not found")
			return
		}
		if err == service.ErrCorrectionNotPending {
			respondError(w, http.StatusBadRequest, "Can only update pending corrections")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to update correction")
		return
	}

	respondJSON(w, http.StatusOK, correctionToResponse(c))
}

// Delete handles DELETE /corrections/{id}
func (h *CorrectionHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid correction ID")
		return
	}

	if err := h.service.Delete(r.Context(), id); err != nil {
		if err == service.ErrCorrectionNotFound {
			respondError(w, http.StatusNotFound, "Correction not found")
			return
		}
		if err == service.ErrCorrectionIsApproved {
			respondError(w, http.StatusForbidden, "Cannot delete approved corrections")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to delete correction")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Approve handles POST /corrections/{id}/approve
func (h *CorrectionHandler) Approve(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid correction ID")
		return
	}

	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "User required")
		return
	}

	c, err := h.service.Approve(r.Context(), id, user.ID)
	if err != nil {
		if err == service.ErrCorrectionNotFound {
			respondError(w, http.StatusNotFound, "Correction not found")
			return
		}
		if err == service.ErrCorrectionNotPending {
			respondError(w, http.StatusBadRequest, "Correction is not in pending status")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to approve correction")
		return
	}

	respondJSON(w, http.StatusOK, correctionToResponse(c))
}

// Reject handles POST /corrections/{id}/reject
func (h *CorrectionHandler) Reject(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid correction ID")
		return
	}

	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "User required")
		return
	}

	c, err := h.service.Reject(r.Context(), id, user.ID)
	if err != nil {
		if err == service.ErrCorrectionNotFound {
			respondError(w, http.StatusNotFound, "Correction not found")
			return
		}
		if err == service.ErrCorrectionNotPending {
			respondError(w, http.StatusBadRequest, "Correction is not in pending status")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to reject correction")
		return
	}

	respondJSON(w, http.StatusOK, correctionToResponse(c))
}

// correctionToResponse converts an internal Correction to the API response model.
func correctionToResponse(c *model.Correction) *models.Correction {
	id := strfmt.UUID(c.ID.String())
	tenantID := strfmt.UUID(c.TenantID.String())
	employeeID := strfmt.UUID(c.EmployeeID.String())
	correctionDate := strfmt.Date(c.CorrectionDate)
	correctionType := c.CorrectionType
	valueMinutes := int64(c.ValueMinutes)

	resp := &models.Correction{
		ID:             &id,
		TenantID:       &tenantID,
		EmployeeID:     &employeeID,
		CorrectionDate: &correctionDate,
		CorrectionType: &correctionType,
		ValueMinutes:   &valueMinutes,
		Reason:         c.Reason,
		Status:         c.Status,
		CreatedAt:      strfmt.DateTime(c.CreatedAt),
		UpdatedAt:      strfmt.DateTime(c.UpdatedAt),
	}

	if c.AccountID != nil {
		accountID := strfmt.UUID(c.AccountID.String())
		resp.AccountID = &accountID
	}
	if c.ApprovedBy != nil {
		approvedBy := strfmt.UUID(c.ApprovedBy.String())
		resp.ApprovedBy = &approvedBy
	}
	if c.ApprovedAt != nil {
		approvedAt := strfmt.DateTime(*c.ApprovedAt)
		resp.ApprovedAt = &approvedAt
	}
	if c.CreatedBy != nil {
		createdBy := strfmt.UUID(c.CreatedBy.String())
		resp.CreatedBy = &createdBy
	}

	return resp
}
