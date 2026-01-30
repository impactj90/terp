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

type EmployeeAccessAssignmentHandler struct {
	svc *service.EmployeeAccessAssignmentService
}

func NewEmployeeAccessAssignmentHandler(svc *service.EmployeeAccessAssignmentService) *EmployeeAccessAssignmentHandler {
	return &EmployeeAccessAssignmentHandler{svc: svc}
}

func (h *EmployeeAccessAssignmentHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	assignments, err := h.svc.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list employee access assignments")
		return
	}
	respondJSON(w, http.StatusOK, employeeAccessAssignmentListToResponse(assignments))
}

func (h *EmployeeAccessAssignmentHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee access assignment ID")
		return
	}

	a, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Employee access assignment not found")
		return
	}

	respondJSON(w, http.StatusOK, employeeAccessAssignmentToResponse(a))
}

func (h *EmployeeAccessAssignmentHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateEmployeeAccessAssignmentRequest
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
	accessProfileID, err := uuid.Parse(req.AccessProfileID.String())
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid access profile ID")
		return
	}

	input := service.CreateEmployeeAccessAssignmentInput{
		TenantID:        tenantID,
		EmployeeID:      employeeID,
		AccessProfileID: accessProfileID,
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
		handleEmployeeAccessAssignmentError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, employeeAccessAssignmentToResponse(a))
}

func (h *EmployeeAccessAssignmentHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee access assignment ID")
		return
	}

	var req models.UpdateEmployeeAccessAssignmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateEmployeeAccessAssignmentInput{}
	if !time.Time(req.ValidFrom).IsZero() {
		vf := time.Time(req.ValidFrom)
		input.ValidFrom = &vf
	}
	if !time.Time(req.ValidTo).IsZero() {
		vt := time.Time(req.ValidTo)
		input.ValidTo = &vt
	}
	input.IsActive = &req.IsActive

	a, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleEmployeeAccessAssignmentError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, employeeAccessAssignmentToResponse(a))
}

func (h *EmployeeAccessAssignmentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee access assignment ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleEmployeeAccessAssignmentError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func employeeAccessAssignmentToResponse(a *model.EmployeeAccessAssignment) *models.EmployeeAccessAssignment {
	id := strfmt.UUID(a.ID.String())
	tenantID := strfmt.UUID(a.TenantID.String())
	employeeID := strfmt.UUID(a.EmployeeID.String())
	accessProfileID := strfmt.UUID(a.AccessProfileID.String())

	resp := &models.EmployeeAccessAssignment{
		ID:              &id,
		TenantID:        &tenantID,
		EmployeeID:      &employeeID,
		AccessProfileID: &accessProfileID,
		IsActive:        a.IsActive,
		CreatedAt:       strfmt.DateTime(a.CreatedAt),
		UpdatedAt:       strfmt.DateTime(a.UpdatedAt),
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

func employeeAccessAssignmentListToResponse(assignments []model.EmployeeAccessAssignment) models.EmployeeAccessAssignmentList {
	data := make([]*models.EmployeeAccessAssignment, 0, len(assignments))
	for i := range assignments {
		data = append(data, employeeAccessAssignmentToResponse(&assignments[i]))
	}
	return models.EmployeeAccessAssignmentList{Data: data}
}

func handleEmployeeAccessAssignmentError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrEmployeeAccessAssignmentNotFound:
		respondError(w, http.StatusNotFound, "Employee access assignment not found")
	case service.ErrEmployeeAccessAssignmentEmployeeRequired:
		respondError(w, http.StatusBadRequest, "Employee ID is required")
	case service.ErrEmployeeAccessAssignmentProfileRequired:
		respondError(w, http.StatusBadRequest, "Access profile ID is required")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
