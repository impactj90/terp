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

type BookingReasonHandler struct {
	svc *service.BookingReasonService
}

func NewBookingReasonHandler(svc *service.BookingReasonService) *BookingReasonHandler {
	return &BookingReasonHandler{svc: svc}
}

func (h *BookingReasonHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	// Check for booking_type_id filter
	if btIDStr := r.URL.Query().Get("booking_type_id"); btIDStr != "" {
		btID, err := uuid.Parse(btIDStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid booking_type_id")
			return
		}
		reasons, err := h.svc.ListByBookingType(r.Context(), tenantID, btID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to list booking reasons")
			return
		}
		respondJSON(w, http.StatusOK, bookingReasonListToResponse(reasons))
		return
	}

	reasons, err := h.svc.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list booking reasons")
		return
	}
	respondJSON(w, http.StatusOK, bookingReasonListToResponse(reasons))
}

func (h *BookingReasonHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid booking reason ID")
		return
	}

	br, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Booking reason not found")
		return
	}

	respondJSON(w, http.StatusOK, bookingReasonToResponse(br))
}

func (h *BookingReasonHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateBookingReasonRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	btID, err := uuid.Parse(req.BookingTypeID.String())
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid booking type ID")
		return
	}

	input := service.CreateBookingReasonInput{
		TenantID:      tenantID,
		BookingTypeID: btID,
		Code:          *req.Code,
		Label:         *req.Label,
	}
	if req.SortOrder != 0 {
		so := int(req.SortOrder)
		input.SortOrder = &so
	}

	br, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleBookingReasonError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, bookingReasonToResponse(br))
}

func (h *BookingReasonHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid booking reason ID")
		return
	}

	var req models.UpdateBookingReasonRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateBookingReasonInput{}
	if req.Label != "" {
		input.Label = &req.Label
	}
	input.IsActive = &req.IsActive
	if req.SortOrder != 0 {
		so := int(req.SortOrder)
		input.SortOrder = &so
	}

	br, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleBookingReasonError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, bookingReasonToResponse(br))
}

func (h *BookingReasonHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid booking reason ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleBookingReasonError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func bookingReasonToResponse(br *model.BookingReason) *models.BookingReason {
	id := strfmt.UUID(br.ID.String())
	tenantID := strfmt.UUID(br.TenantID.String())
	btID := strfmt.UUID(br.BookingTypeID.String())

	return &models.BookingReason{
		ID:            &id,
		TenantID:      &tenantID,
		BookingTypeID: &btID,
		Code:          &br.Code,
		Label:         &br.Label,
		IsActive:      br.IsActive,
		SortOrder:     int64(br.SortOrder),
		CreatedAt:     strfmt.DateTime(br.CreatedAt),
		UpdatedAt:     strfmt.DateTime(br.UpdatedAt),
	}
}

func bookingReasonListToResponse(reasons []model.BookingReason) models.BookingReasonList {
	data := make([]*models.BookingReason, 0, len(reasons))
	for i := range reasons {
		data = append(data, bookingReasonToResponse(&reasons[i]))
	}
	return models.BookingReasonList{Data: data}
}

func handleBookingReasonError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrBookingReasonNotFound:
		respondError(w, http.StatusNotFound, "Booking reason not found")
	case service.ErrBookingReasonCodeReq:
		respondError(w, http.StatusBadRequest, "Booking reason code is required")
	case service.ErrBookingReasonLabelReq:
		respondError(w, http.StatusBadRequest, "Booking reason label is required")
	case service.ErrBookingReasonCodeExists:
		respondError(w, http.StatusConflict, "A booking reason with this code already exists for this booking type")
	case service.ErrBookingReasonTypeIDReq:
		respondError(w, http.StatusBadRequest, "Booking type ID is required")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
