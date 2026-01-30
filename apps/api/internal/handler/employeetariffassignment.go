package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

// EmployeeTariffAssignmentHandler handles HTTP requests for employee tariff assignments.
type EmployeeTariffAssignmentHandler struct {
	assignmentService *service.EmployeeTariffAssignmentService
}

// NewEmployeeTariffAssignmentHandler creates a new employee tariff assignment handler.
func NewEmployeeTariffAssignmentHandler(assignmentService *service.EmployeeTariffAssignmentService) *EmployeeTariffAssignmentHandler {
	return &EmployeeTariffAssignmentHandler{assignmentService: assignmentService}
}

// List lists all tariff assignments for an employee.
func (h *EmployeeTariffAssignmentHandler) List(w http.ResponseWriter, r *http.Request) {
	employeeIDStr := chi.URLParam(r, "id")
	employeeID, err := uuid.Parse(employeeIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	activeOnly := r.URL.Query().Get("active") == "true"

	assignments, err := h.assignmentService.ListByEmployee(r.Context(), employeeID, activeOnly)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list tariff assignments")
		return
	}

	if assignments == nil {
		assignments = []model.EmployeeTariffAssignment{}
	}

	respondJSON(w, http.StatusOK, map[string]any{"data": assignments})
}

// Create creates a new tariff assignment for an employee.
func (h *EmployeeTariffAssignmentHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	employeeIDStr := chi.URLParam(r, "id")
	employeeID, err := uuid.Parse(employeeIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	var req models.CreateEmployeeTariffAssignmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateEmployeeTariffAssignmentInput{
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		TariffID:      uuid.MustParse(req.TariffID.String()),
		EffectiveFrom: time.Time(*req.EffectiveFrom),
	}

	if !time.Time(req.EffectiveTo).IsZero() {
		t := time.Time(req.EffectiveTo)
		input.EffectiveTo = &t
	}

	if req.OverwriteBehavior != nil && *req.OverwriteBehavior != "" {
		input.OverwriteBehavior = model.OverwriteBehavior(*req.OverwriteBehavior)
	}

	if req.Notes != "" {
		input.Notes = req.Notes
	}

	assignment, err := h.assignmentService.Create(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrAssignmentTariffRequired:
			respondError(w, http.StatusBadRequest, "tariff_id is required")
		case service.ErrAssignmentDateRequired:
			respondError(w, http.StatusBadRequest, "effective_from is required")
		case service.ErrAssignmentInvalidDates:
			respondError(w, http.StatusBadRequest, "effective_to must be on or after effective_from")
		case service.ErrAssignmentEmployeeNotFound:
			respondError(w, http.StatusNotFound, "Employee not found")
		case service.ErrAssignmentTariffNotFound:
			respondError(w, http.StatusBadRequest, "Tariff not found")
		case service.ErrAssignmentOverlap:
			respondError(w, http.StatusConflict, "Overlapping tariff assignment exists for this date range")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to create tariff assignment")
		}
		return
	}

	respondJSON(w, http.StatusCreated, assignment)
}

// Get retrieves a tariff assignment by ID.
func (h *EmployeeTariffAssignmentHandler) Get(w http.ResponseWriter, r *http.Request) {
	assignmentIDStr := chi.URLParam(r, "assignmentId")
	assignmentID, err := uuid.Parse(assignmentIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid assignment ID")
		return
	}

	assignment, err := h.assignmentService.GetByID(r.Context(), assignmentID)
	if err != nil {
		respondError(w, http.StatusNotFound, "Tariff assignment not found")
		return
	}

	respondJSON(w, http.StatusOK, assignment)
}

// Update updates a tariff assignment.
func (h *EmployeeTariffAssignmentHandler) Update(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	assignmentIDStr := chi.URLParam(r, "assignmentId")
	assignmentID, err := uuid.Parse(assignmentIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid assignment ID")
		return
	}

	var req models.UpdateEmployeeTariffAssignmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateEmployeeTariffAssignmentInput{}

	if !time.Time(req.EffectiveFrom).IsZero() {
		t := time.Time(req.EffectiveFrom)
		input.EffectiveFrom = &t
	}

	if !time.Time(req.EffectiveTo).IsZero() {
		t := time.Time(req.EffectiveTo)
		input.EffectiveTo = &t
	}

	if req.OverwriteBehavior != "" {
		ob := model.OverwriteBehavior(req.OverwriteBehavior)
		input.OverwriteBehavior = &ob
	}

	// Notes is always settable (even to empty string)
	if req.Notes != "" {
		input.Notes = &req.Notes
	}

	// IsActive: pass through (needs raw JSON check for explicit false)
	input.IsActive = &req.IsActive

	assignment, err := h.assignmentService.Update(r.Context(), assignmentID, tenantID, input)
	if err != nil {
		switch err {
		case service.ErrAssignmentNotFound:
			respondError(w, http.StatusNotFound, "Tariff assignment not found")
		case service.ErrAssignmentInvalidDates:
			respondError(w, http.StatusBadRequest, "effective_to must be on or after effective_from")
		case service.ErrAssignmentOverlap:
			respondError(w, http.StatusConflict, "Overlapping tariff assignment exists for this date range")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to update tariff assignment")
		}
		return
	}

	respondJSON(w, http.StatusOK, assignment)
}

// Delete deletes a tariff assignment.
func (h *EmployeeTariffAssignmentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	assignmentIDStr := chi.URLParam(r, "assignmentId")
	assignmentID, err := uuid.Parse(assignmentIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid assignment ID")
		return
	}

	if err := h.assignmentService.Delete(r.Context(), assignmentID); err != nil {
		switch err {
		case service.ErrAssignmentNotFound:
			respondError(w, http.StatusNotFound, "Tariff assignment not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to delete tariff assignment")
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GetEffectiveTariff resolves which tariff applies to an employee at a given date.
func (h *EmployeeTariffAssignmentHandler) GetEffectiveTariff(w http.ResponseWriter, r *http.Request) {
	employeeIDStr := chi.URLParam(r, "id")
	employeeID, err := uuid.Parse(employeeIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	dateStr := r.URL.Query().Get("date")
	if dateStr == "" {
		respondError(w, http.StatusBadRequest, "date query parameter is required")
		return
	}

	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid date format. Use YYYY-MM-DD")
		return
	}

	result, err := h.assignmentService.GetEffectiveTariff(r.Context(), employeeID, date)
	if err != nil {
		switch err {
		case service.ErrAssignmentEmployeeNotFound:
			respondError(w, http.StatusNotFound, "Employee not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to resolve effective tariff")
		}
		return
	}

	respondJSON(w, http.StatusOK, result)
}
