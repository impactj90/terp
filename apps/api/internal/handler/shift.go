package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

type ShiftHandler struct {
	svc *service.ShiftService
}

func NewShiftHandler(svc *service.ShiftService) *ShiftHandler {
	return &ShiftHandler{svc: svc}
}

func (h *ShiftHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	shifts, err := h.svc.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list shifts")
		return
	}
	respondJSON(w, http.StatusOK, shiftListToResponse(shifts))
}

func (h *ShiftHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid shift ID")
		return
	}

	s, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Shift not found")
		return
	}

	respondJSON(w, http.StatusOK, shiftToResponse(s))
}

func (h *ShiftHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateShiftRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateShiftInput{
		TenantID:      tenantID,
		Code:          *req.Code,
		Name:          *req.Name,
		Description:   req.Description,
		Color:         req.Color,
		Qualification: req.Qualification,
	}

	if req.DayPlanID.String() != "" && req.DayPlanID.String() != "00000000-0000-0000-0000-000000000000" {
		dpID, err := uuid.Parse(req.DayPlanID.String())
		if err == nil {
			input.DayPlanID = &dpID
		}
	}
	if req.SortOrder != 0 {
		so := int(req.SortOrder)
		input.SortOrder = &so
	}

	s, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleShiftError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, shiftToResponse(s))
}

func (h *ShiftHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid shift ID")
		return
	}

	var req models.UpdateShiftRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateShiftInput{}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	if req.DayPlanID.String() != "" && req.DayPlanID.String() != "00000000-0000-0000-0000-000000000000" {
		dpID, err := uuid.Parse(req.DayPlanID.String())
		if err == nil {
			input.DayPlanID = &dpID
		}
	}
	if req.Color != "" {
		input.Color = &req.Color
	}
	if req.Qualification != "" {
		input.Qualification = &req.Qualification
	}
	input.IsActive = &req.IsActive
	if req.SortOrder != 0 {
		so := int(req.SortOrder)
		input.SortOrder = &so
	}

	s, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleShiftError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, shiftToResponse(s))
}

func (h *ShiftHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid shift ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleShiftError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func shiftToResponse(s *model.Shift) *models.Shift {
	id := strfmt.UUID(s.ID.String())
	tenantID := strfmt.UUID(s.TenantID.String())

	resp := &models.Shift{
		ID:            &id,
		TenantID:      &tenantID,
		Code:          &s.Code,
		Name:          &s.Name,
		Description:   &s.Description,
		Color:         &s.Color,
		Qualification: &s.Qualification,
		IsActive:      s.IsActive,
		SortOrder:     int64(s.SortOrder),
		CreatedAt:     strfmt.DateTime(s.CreatedAt),
		UpdatedAt:     strfmt.DateTime(s.UpdatedAt),
	}

	if s.DayPlanID != nil {
		dpID := strfmt.UUID(s.DayPlanID.String())
		resp.DayPlanID = &dpID
	}

	return resp
}

func shiftListToResponse(shifts []model.Shift) models.ShiftList {
	data := make([]*models.Shift, 0, len(shifts))
	for i := range shifts {
		data = append(data, shiftToResponse(&shifts[i]))
	}
	return models.ShiftList{Data: data}
}

func handleShiftError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrShiftNotFound:
		respondError(w, http.StatusNotFound, "Shift not found")
	case service.ErrShiftCodeRequired:
		respondError(w, http.StatusBadRequest, "Shift code is required")
	case service.ErrShiftNameRequired:
		respondError(w, http.StatusBadRequest, "Shift name is required")
	case service.ErrShiftCodeExists:
		respondError(w, http.StatusConflict, "A shift with this code already exists")
	case service.ErrShiftInUse:
		respondError(w, http.StatusConflict, "Shift is in use by shift assignments and cannot be deleted")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
