package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/service"
)

// OrderBookingHandler handles order booking HTTP requests.
type OrderBookingHandler struct {
	orderBookingService *service.OrderBookingService
}

// NewOrderBookingHandler creates a new OrderBookingHandler.
func NewOrderBookingHandler(orderBookingService *service.OrderBookingService) *OrderBookingHandler {
	return &OrderBookingHandler{orderBookingService: orderBookingService}
}

func (h *OrderBookingHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	opts := service.OrderBookingListOptions{}

	if empIDStr := r.URL.Query().Get("employee_id"); empIDStr != "" {
		empID, err := uuid.Parse(empIDStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid employee_id")
			return
		}
		opts.EmployeeID = &empID
	}

	if orderIDStr := r.URL.Query().Get("order_id"); orderIDStr != "" {
		orderID, err := uuid.Parse(orderIDStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid order_id")
			return
		}
		opts.OrderID = &orderID
	}

	if dateFromStr := r.URL.Query().Get("date_from"); dateFromStr != "" {
		dateFrom, err := time.Parse("2006-01-02", dateFromStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid date_from format (expected YYYY-MM-DD)")
			return
		}
		opts.DateFrom = &dateFrom
	}

	if dateToStr := r.URL.Query().Get("date_to"); dateToStr != "" {
		dateTo, err := time.Parse("2006-01-02", dateToStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid date_to format (expected YYYY-MM-DD)")
			return
		}
		opts.DateTo = &dateTo
	}

	bookings, err := h.orderBookingService.List(r.Context(), tenantID, opts)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list order bookings")
		return
	}
	respondJSON(w, http.StatusOK, bookings)
}

func (h *OrderBookingHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid order booking ID")
		return
	}

	ob, err := h.orderBookingService.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Order booking not found")
		return
	}

	respondJSON(w, http.StatusOK, ob)
}

func (h *OrderBookingHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateOrderBookingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateOrderBookingInput{
		TenantID:    tenantID,
		EmployeeID:  uuid.MustParse(req.EmployeeID.String()),
		OrderID:     uuid.MustParse(req.OrderID.String()),
		BookingDate: req.BookingDate.String(),
		TimeMinutes: int(*req.TimeMinutes),
		Description: req.Description,
	}

	if req.ActivityID.String() != "" && req.ActivityID.String() != "00000000-0000-0000-0000-000000000000" {
		actID := uuid.MustParse(req.ActivityID.String())
		input.ActivityID = &actID
	}

	ob, err := h.orderBookingService.Create(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrOrderBookingOrderRequired:
			respondError(w, http.StatusBadRequest, "Order ID is required")
		case service.ErrOrderBookingEmployeeRequired:
			respondError(w, http.StatusBadRequest, "Employee ID is required")
		case service.ErrOrderBookingDateRequired:
			respondError(w, http.StatusBadRequest, "Booking date is required")
		case service.ErrOrderBookingTimeRequired:
			respondError(w, http.StatusBadRequest, "Time in minutes must be positive")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to create order booking")
		}
		return
	}

	respondJSON(w, http.StatusCreated, ob)
}

func (h *OrderBookingHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid order booking ID")
		return
	}

	var req models.UpdateOrderBookingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateOrderBookingInput{}
	if req.OrderID.String() != "" && req.OrderID.String() != "00000000-0000-0000-0000-000000000000" {
		orderID := uuid.MustParse(req.OrderID.String())
		input.OrderID = &orderID
	}
	if req.ActivityID.String() != "" && req.ActivityID.String() != "00000000-0000-0000-0000-000000000000" {
		actID := uuid.MustParse(req.ActivityID.String())
		input.ActivityID = &actID
	}
	if !time.Time(req.BookingDate).IsZero() {
		bd := req.BookingDate.String()
		input.BookingDate = &bd
	}
	if req.TimeMinutes != 0 {
		tm := int(req.TimeMinutes)
		input.TimeMinutes = &tm
	}
	if req.Description != "" {
		input.Description = &req.Description
	}

	ob, err := h.orderBookingService.Update(r.Context(), id, input)
	if err != nil {
		if err == service.ErrOrderBookingNotFound {
			respondError(w, http.StatusNotFound, "Order booking not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to update order booking")
		return
	}

	respondJSON(w, http.StatusOK, ob)
}

func (h *OrderBookingHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid order booking ID")
		return
	}

	if err := h.orderBookingService.Delete(r.Context(), id); err != nil {
		if err == service.ErrOrderBookingNotFound {
			respondError(w, http.StatusNotFound, "Order booking not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to delete order booking")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
