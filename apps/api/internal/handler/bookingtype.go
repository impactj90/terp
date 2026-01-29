package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

type BookingTypeHandler struct {
	bookingTypeService *service.BookingTypeService
}

func NewBookingTypeHandler(bookingTypeService *service.BookingTypeService) *BookingTypeHandler {
	return &BookingTypeHandler{bookingTypeService: bookingTypeService}
}

func (h *BookingTypeHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	// Parse filter parameters
	filter := service.ListFilter{}

	if activeStr := r.URL.Query().Get("active"); activeStr == "true" {
		active := true
		filter.ActiveOnly = &active
	}

	if directionStr := r.URL.Query().Get("direction"); directionStr != "" {
		switch directionStr {
		case "in":
			dir := model.BookingDirectionIn
			filter.Direction = &dir
		case "out":
			dir := model.BookingDirectionOut
			filter.Direction = &dir
		}
	}

	types, err := h.bookingTypeService.List(r.Context(), tenantID, filter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list booking types")
		return
	}

	// Handle nil slice for consistent JSON output
	if types == nil {
		types = []model.BookingType{}
	}

	respondJSON(w, http.StatusOK, map[string]any{"data": types})
}

func (h *BookingTypeHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid booking type ID")
		return
	}

	bt, err := h.bookingTypeService.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Booking type not found")
		return
	}

	respondJSON(w, http.StatusOK, bt)
}

func (h *BookingTypeHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateBookingTypeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateBookingTypeInput{
		TenantID:  tenantID,
		Code:      *req.Code,
		Name:      *req.Name,
		Direction: *req.Direction,
		Category:  req.Category,
	}

	// Handle optional fields
	if req.Description != "" {
		input.Description = &req.Description
	}
	if req.AccountID != nil {
		parsed, err := uuid.Parse(req.AccountID.String())
		if err == nil {
			input.AccountID = &parsed
		}
	}
	if req.RequiresReason {
		v := true
		input.RequiresReason = &v
	}

	bt, err := h.bookingTypeService.Create(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrBookingTypeCodeReq:
			respondError(w, http.StatusBadRequest, "Booking type code is required")
		case service.ErrBookingTypeNameReq:
			respondError(w, http.StatusBadRequest, "Booking type name is required")
		case service.ErrBookingTypeDirectionReq:
			respondError(w, http.StatusBadRequest, "Booking type direction is required")
		case service.ErrInvalidDirection:
			respondError(w, http.StatusBadRequest, "Invalid direction (must be 'in' or 'out')")
		case service.ErrInvalidCategory:
			respondError(w, http.StatusBadRequest, "Invalid category (must be 'work', 'break', 'business_trip', or 'other')")
		case service.ErrBookingTypeCodeExists:
			respondError(w, http.StatusConflict, "A booking type with this code already exists")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to create booking type")
		}
		return
	}

	respondJSON(w, http.StatusCreated, bt)
}

func (h *BookingTypeHandler) Update(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid booking type ID")
		return
	}

	var req models.UpdateBookingTypeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Convert to service input - only set fields that were provided
	input := service.UpdateBookingTypeInput{}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	// IsActive needs special handling - we always pass it since it's a boolean
	input.IsActive = &req.IsActive
	if req.Category != "" {
		input.Category = &req.Category
	}
	if req.AccountID != nil {
		parsed, err := uuid.Parse(req.AccountID.String())
		if err == nil {
			input.AccountID = &parsed
		}
	}
	input.RequiresReason = &req.RequiresReason

	bt, err := h.bookingTypeService.Update(r.Context(), id, tenantID, input)
	if err != nil {
		switch err {
		case service.ErrBookingTypeNotFound:
			respondError(w, http.StatusNotFound, "Booking type not found")
		case service.ErrBookingTypeNameReq:
			respondError(w, http.StatusBadRequest, "Booking type name cannot be empty")
		case service.ErrCannotModifySystemType:
			respondError(w, http.StatusForbidden, "Cannot modify system booking types")
		case service.ErrInvalidCategory:
			respondError(w, http.StatusBadRequest, "Invalid category (must be 'work', 'break', 'business_trip', or 'other')")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to update booking type")
		}
		return
	}

	respondJSON(w, http.StatusOK, bt)
}

func (h *BookingTypeHandler) Delete(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid booking type ID")
		return
	}

	if err := h.bookingTypeService.Delete(r.Context(), id, tenantID); err != nil {
		switch err {
		case service.ErrBookingTypeNotFound:
			respondError(w, http.StatusNotFound, "Booking type not found")
		case service.ErrCannotDeleteSystemType:
			respondError(w, http.StatusForbidden, "Cannot delete system booking types")
		case service.ErrCannotDeleteTypeInUse:
			respondError(w, http.StatusConflict, "Cannot delete booking type in use")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to delete booking type")
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
