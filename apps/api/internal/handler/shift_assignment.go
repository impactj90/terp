package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

type ShiftAssignmentHandler struct {
	svc *service.ShiftAssignmentService
}

func NewShiftAssignmentHandler(svc *service.ShiftAssignmentService) *ShiftAssignmentHandler {
	return &ShiftAssignmentHandler{svc: svc}
}

func (h *ShiftAssignmentHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	assignments, err := h.svc.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list shift assignments")
		return
	}
	respondJSON(w, http.StatusOK, shiftAssignmentListToResponse(assignments))
}

func (h *ShiftAssignmentHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid shift assignment ID")
		return
	}

	a, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Shift assignment not found")
		return
	}

	respondJSON(w, http.StatusOK, shiftAssignmentToResponse(a))
}

func (h *ShiftAssignmentHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateShiftAssignmentRequest
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
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}
	shiftID, err := uuid.Parse(req.ShiftID.String())
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid shift ID")
		return
	}

	input := service.CreateShiftAssignmentInput{
		TenantID:   tenantID,
		EmployeeID: employeeID,
		ShiftID:    shiftID,
		Notes:      req.Notes,
	}

	if !time.Time(req.ValidFrom).IsZero() {
		vf := time.Time(req.ValidFrom)
		input.ValidFrom = &vf
	}
	if !time.Time(req.ValidTo).IsZero() {
		vt := time.Time(req.ValidTo)
		input.ValidTo = &vt
	}

	a, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleShiftAssignmentError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, shiftAssignmentToResponse(a))
}

func (h *ShiftAssignmentHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid shift assignment ID")
		return
	}

	var req models.UpdateShiftAssignmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateShiftAssignmentInput{}
	if !time.Time(req.ValidFrom).IsZero() {
		vf := time.Time(req.ValidFrom)
		input.ValidFrom = &vf
	}
	if !time.Time(req.ValidTo).IsZero() {
		vt := time.Time(req.ValidTo)
		input.ValidTo = &vt
	}
	if req.Notes != "" {
		input.Notes = &req.Notes
	}
	input.IsActive = &req.IsActive

	a, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleShiftAssignmentError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, shiftAssignmentToResponse(a))
}

func (h *ShiftAssignmentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid shift assignment ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleShiftAssignmentError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func shiftAssignmentToResponse(a *model.ShiftAssignment) *models.ShiftAssignment {
	id := strfmt.UUID(a.ID.String())
	tenantID := strfmt.UUID(a.TenantID.String())
	employeeID := strfmt.UUID(a.EmployeeID.String())
	shiftID := strfmt.UUID(a.ShiftID.String())

	resp := &models.ShiftAssignment{
		ID:         &id,
		TenantID:   &tenantID,
		EmployeeID: &employeeID,
		ShiftID:    &shiftID,
		Notes:      &a.Notes,
		IsActive:   a.IsActive,
		CreatedAt:  strfmt.DateTime(a.CreatedAt),
		UpdatedAt:  strfmt.DateTime(a.UpdatedAt),
	}

	if a.ValidFrom != nil {
		vf := strfmt.Date(*a.ValidFrom)
		resp.ValidFrom = &vf
	}
	if a.ValidTo != nil {
		vt := strfmt.Date(*a.ValidTo)
		resp.ValidTo = &vt
	}

	return resp
}

func shiftAssignmentListToResponse(assignments []model.ShiftAssignment) models.ShiftAssignmentList {
	data := make([]*models.ShiftAssignment, 0, len(assignments))
	for i := range assignments {
		data = append(data, shiftAssignmentToResponse(&assignments[i]))
	}
	return models.ShiftAssignmentList{Data: data}
}

func handleShiftAssignmentError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrShiftAssignmentNotFound:
		respondError(w, http.StatusNotFound, "Shift assignment not found")
	case service.ErrShiftAssignmentEmployeeRequired:
		respondError(w, http.StatusBadRequest, "Employee ID is required")
	case service.ErrShiftAssignmentShiftRequired:
		respondError(w, http.StatusBadRequest, "Shift ID is required")
	case service.ErrShiftAssignmentDateRangeInvalid:
		respondError(w, http.StatusBadRequest, "valid_from must be before or equal to valid_to")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
