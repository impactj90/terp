package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/service"
)

// MacroHandler handles HTTP requests for macros.
type MacroHandler struct {
	macroService *service.MacroService
}

// NewMacroHandler creates a new MacroHandler.
func NewMacroHandler(macroService *service.MacroService) *MacroHandler {
	return &MacroHandler{macroService: macroService}
}

// List returns all macros for the tenant.
func (h *MacroHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	macros, err := h.macroService.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list macros")
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{"data": macros})
}

// Get returns a single macro by ID.
func (h *MacroHandler) Get(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid macro ID")
		return
	}

	macro, err := h.macroService.GetByID(r.Context(), tenantID, id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Macro not found")
		return
	}

	respondJSON(w, http.StatusOK, macro)
}

// Create creates a new macro.
func (h *MacroHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req struct {
		Name         string          `json:"name"`
		Description  *string         `json:"description,omitempty"`
		MacroType    string          `json:"macro_type"`
		ActionType   string          `json:"action_type"`
		ActionParams json.RawMessage `json:"action_params,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	input := service.CreateMacroInput{
		TenantID:     tenantID,
		Name:         req.Name,
		Description:  req.Description,
		MacroType:    req.MacroType,
		ActionType:   req.ActionType,
		ActionParams: req.ActionParams,
	}

	macro, err := h.macroService.Create(r.Context(), input)
	if err != nil {
		handleMacroError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, macro)
}

// Update updates a macro.
func (h *MacroHandler) Update(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid macro ID")
		return
	}

	var req struct {
		Name         *string         `json:"name,omitempty"`
		Description  *string         `json:"description,omitempty"`
		MacroType    *string         `json:"macro_type,omitempty"`
		ActionType   *string         `json:"action_type,omitempty"`
		ActionParams json.RawMessage `json:"action_params,omitempty"`
		IsActive     *bool           `json:"is_active,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	input := service.UpdateMacroInput{
		Name:         req.Name,
		Description:  req.Description,
		MacroType:    req.MacroType,
		ActionType:   req.ActionType,
		ActionParams: req.ActionParams,
		IsActive:     req.IsActive,
	}

	macro, err := h.macroService.Update(r.Context(), tenantID, id, input)
	if err != nil {
		handleMacroError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, macro)
}

// Delete deletes a macro.
func (h *MacroHandler) Delete(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid macro ID")
		return
	}

	if err := h.macroService.Delete(r.Context(), tenantID, id); err != nil {
		handleMacroError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// --- Assignment endpoints ---

// ListAssignments returns all assignments for a macro.
func (h *MacroHandler) ListAssignments(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	macroID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid macro ID")
		return
	}

	assignments, err := h.macroService.ListAssignments(r.Context(), tenantID, macroID)
	if err != nil {
		handleMacroError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{"data": assignments})
}

// CreateAssignment creates a new assignment for a macro.
func (h *MacroHandler) CreateAssignment(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	macroID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid macro ID")
		return
	}

	var req struct {
		TariffID     *string `json:"tariff_id,omitempty"`
		EmployeeID   *string `json:"employee_id,omitempty"`
		ExecutionDay int     `json:"execution_day"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	input := service.CreateAssignmentInput{
		TenantID:     tenantID,
		MacroID:      macroID,
		ExecutionDay: req.ExecutionDay,
	}

	if req.TariffID != nil {
		id, err := uuid.Parse(*req.TariffID)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid tariff_id")
			return
		}
		input.TariffID = &id
	}

	if req.EmployeeID != nil {
		id, err := uuid.Parse(*req.EmployeeID)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid employee_id")
			return
		}
		input.EmployeeID = &id
	}

	assignment, err := h.macroService.CreateAssignment(r.Context(), input)
	if err != nil {
		handleMacroError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, assignment)
}

// UpdateAssignment updates a macro assignment.
func (h *MacroHandler) UpdateAssignment(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	macroID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid macro ID")
		return
	}

	assignmentID, err := uuid.Parse(chi.URLParam(r, "assignmentId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid assignment ID")
		return
	}

	var req struct {
		ExecutionDay *int  `json:"execution_day,omitempty"`
		IsActive     *bool `json:"is_active,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	input := service.UpdateAssignmentInput{
		ExecutionDay: req.ExecutionDay,
		IsActive:     req.IsActive,
	}

	assignment, err := h.macroService.UpdateAssignment(r.Context(), tenantID, macroID, assignmentID, input)
	if err != nil {
		handleMacroError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, assignment)
}

// DeleteAssignment deletes a macro assignment.
func (h *MacroHandler) DeleteAssignment(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	macroID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid macro ID")
		return
	}

	assignmentID, err := uuid.Parse(chi.URLParam(r, "assignmentId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid assignment ID")
		return
	}

	if err := h.macroService.DeleteAssignment(r.Context(), tenantID, macroID, assignmentID); err != nil {
		handleMacroError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// --- Execution endpoints ---

// TriggerExecution manually triggers a macro execution.
func (h *MacroHandler) TriggerExecution(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	macroID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid macro ID")
		return
	}

	// Get user ID from auth context if available
	var triggeredBy *uuid.UUID
	if user, ok := auth.UserFromContext(r.Context()); ok {
		triggeredBy = &user.ID
	}

	exec, err := h.macroService.TriggerExecution(r.Context(), tenantID, macroID, triggeredBy)
	if err != nil {
		handleMacroError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, exec)
}

// ListExecutions returns execution history for a macro.
func (h *MacroHandler) ListExecutions(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	macroID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid macro ID")
		return
	}

	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	executions, err := h.macroService.ListExecutions(r.Context(), tenantID, macroID, limit)
	if err != nil {
		handleMacroError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{"data": executions})
}

// GetExecution returns a single execution by ID.
func (h *MacroHandler) GetExecution(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid execution ID")
		return
	}

	exec, err := h.macroService.GetExecution(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Execution not found")
		return
	}

	respondJSON(w, http.StatusOK, exec)
}

// handleMacroError maps service errors to HTTP responses.
func handleMacroError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrMacroNotFound:
		respondError(w, http.StatusNotFound, "Macro not found")
	case service.ErrMacroNameExists:
		respondError(w, http.StatusConflict, "Macro name already exists")
	case service.ErrMacroNameReq:
		respondError(w, http.StatusBadRequest, "Macro name is required")
	case service.ErrInvalidMacroType:
		respondError(w, http.StatusBadRequest, "Invalid macro type (must be 'weekly' or 'monthly')")
	case service.ErrInvalidActionType:
		respondError(w, http.StatusBadRequest, "Invalid action type")
	case service.ErrMacroAssignmentNotFound:
		respondError(w, http.StatusNotFound, "Assignment not found")
	case service.ErrAssignmentTargetReq:
		respondError(w, http.StatusBadRequest, "Either tariff_id or employee_id is required")
	case service.ErrAssignmentTargetBoth:
		respondError(w, http.StatusBadRequest, "Only one of tariff_id or employee_id can be set")
	case service.ErrInvalidExecutionDay:
		respondError(w, http.StatusBadRequest, "Invalid execution day")
	case service.ErrMacroInactive:
		respondError(w, http.StatusBadRequest, "Macro is not active")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
