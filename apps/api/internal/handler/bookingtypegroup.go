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

type BookingTypeGroupHandler struct {
	svc *service.BookingTypeGroupService
}

func NewBookingTypeGroupHandler(svc *service.BookingTypeGroupService) *BookingTypeGroupHandler {
	return &BookingTypeGroupHandler{svc: svc}
}

func (h *BookingTypeGroupHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	groups, err := h.svc.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list booking type groups")
		return
	}

	data := make([]*models.BookingTypeGroup, 0, len(groups))
	for i := range groups {
		resp, err := h.bookingTypeGroupToResponse(r, &groups[i])
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to build response")
			return
		}
		data = append(data, resp)
	}

	respondJSON(w, http.StatusOK, models.BookingTypeGroupList{Data: data})
}

func (h *BookingTypeGroupHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid booking type group ID")
		return
	}

	g, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Booking type group not found")
		return
	}

	resp, err := h.bookingTypeGroupToResponse(r, g)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to build response")
		return
	}

	respondJSON(w, http.StatusOK, resp)
}

func (h *BookingTypeGroupHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateBookingTypeGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateBookingTypeGroupInput{
		TenantID: tenantID,
		Code:     *req.Code,
		Name:     *req.Name,
	}

	if req.Description != "" {
		input.Description = &req.Description
	}

	// Parse booking type IDs
	if len(req.BookingTypeIds) > 0 {
		input.BookingTypeIDs = make([]uuid.UUID, len(req.BookingTypeIds))
		for i, id := range req.BookingTypeIds {
			parsed, err := uuid.Parse(id.String())
			if err != nil {
				respondError(w, http.StatusBadRequest, "Invalid booking type ID in booking_type_ids")
				return
			}
			input.BookingTypeIDs[i] = parsed
		}
	}

	g, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleBookingTypeGroupError(w, err)
		return
	}

	resp, err := h.bookingTypeGroupToResponse(r, g)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to build response")
		return
	}

	respondJSON(w, http.StatusCreated, resp)
}

func (h *BookingTypeGroupHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid booking type group ID")
		return
	}

	var req models.UpdateBookingTypeGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateBookingTypeGroupInput{}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	input.IsActive = &req.IsActive

	// Parse booking type IDs if provided
	if req.BookingTypeIds != nil {
		btIDs := make([]uuid.UUID, len(req.BookingTypeIds))
		for i, id := range req.BookingTypeIds {
			parsed, err := uuid.Parse(id.String())
			if err != nil {
				respondError(w, http.StatusBadRequest, "Invalid booking type ID in booking_type_ids")
				return
			}
			btIDs[i] = parsed
		}
		input.BookingTypeIDs = btIDs
	}

	g, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleBookingTypeGroupError(w, err)
		return
	}

	resp, err := h.bookingTypeGroupToResponse(r, g)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to build response")
		return
	}

	respondJSON(w, http.StatusOK, resp)
}

func (h *BookingTypeGroupHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid booking type group ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleBookingTypeGroupError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *BookingTypeGroupHandler) bookingTypeGroupToResponse(r *http.Request, g *model.BookingTypeGroup) (*models.BookingTypeGroup, error) {
	id := strfmt.UUID(g.ID.String())
	tenantID := strfmt.UUID(g.TenantID.String())

	resp := &models.BookingTypeGroup{
		ID:        &id,
		TenantID:  tenantID,
		Code:      &g.Code,
		Name:      &g.Name,
		IsActive:  g.IsActive,
		CreatedAt: strfmt.DateTime(g.CreatedAt),
		UpdatedAt: strfmt.DateTime(g.UpdatedAt),
	}

	if g.Description != nil {
		resp.Description = g.Description
	}

	// Fetch member booking type IDs
	members, err := h.svc.ListMembers(r.Context(), g.ID)
	if err != nil {
		return nil, err
	}
	btIDs := make([]strfmt.UUID, len(members))
	for i, bt := range members {
		btIDs[i] = strfmt.UUID(bt.ID.String())
	}
	resp.BookingTypeIds = btIDs

	return resp, nil
}

func handleBookingTypeGroupError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrBookingTypeGroupNotFound:
		respondError(w, http.StatusNotFound, "Booking type group not found")
	case service.ErrBookingTypeGroupCodeRequired:
		respondError(w, http.StatusBadRequest, "Group code is required")
	case service.ErrBookingTypeGroupNameRequired:
		respondError(w, http.StatusBadRequest, "Group name is required")
	case service.ErrBookingTypeGroupCodeExists:
		respondError(w, http.StatusConflict, "A booking type group with this code already exists")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
