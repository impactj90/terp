package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

// OrderHandler handles order HTTP requests.
type OrderHandler struct {
	orderService *service.OrderService
}

// NewOrderHandler creates a new OrderHandler.
func NewOrderHandler(orderService *service.OrderService) *OrderHandler {
	return &OrderHandler{orderService: orderService}
}

func (h *OrderHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	activeOnly := r.URL.Query().Get("active") == "true"
	status := r.URL.Query().Get("status")

	var orders interface{}
	var err error
	if status != "" {
		orders, err = h.orderService.ListByStatus(r.Context(), tenantID, model.OrderStatus(status))
	} else if activeOnly {
		orders, err = h.orderService.ListActive(r.Context(), tenantID)
	} else {
		orders, err = h.orderService.List(r.Context(), tenantID)
	}

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list orders")
		return
	}
	respondJSON(w, http.StatusOK, orders)
}

func (h *OrderHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid order ID")
		return
	}

	o, err := h.orderService.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Order not found")
		return
	}

	respondJSON(w, http.StatusOK, o)
}

func (h *OrderHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateOrderInput{
		TenantID:    tenantID,
		Code:        *req.Code,
		Name:        *req.Name,
		Description: req.Description,
		Status:      req.Status,
		Customer:    req.Customer,
	}

	if req.CostCenterID.String() != "" && req.CostCenterID.String() != "00000000-0000-0000-0000-000000000000" {
		ccID := uuid.MustParse(req.CostCenterID.String())
		input.CostCenterID = &ccID
	}

	if req.BillingRatePerHour != 0 {
		d := decimal.NewFromFloat(req.BillingRatePerHour)
		input.BillingRatePerHour = &d
	}

	if !time.Time(req.ValidFrom).IsZero() {
		vf := req.ValidFrom.String()
		input.ValidFrom = &vf
	}
	if !time.Time(req.ValidTo).IsZero() {
		vt := req.ValidTo.String()
		input.ValidTo = &vt
	}

	o, err := h.orderService.Create(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrOrderCodeRequired:
			respondError(w, http.StatusBadRequest, "Order code is required")
		case service.ErrOrderNameRequired:
			respondError(w, http.StatusBadRequest, "Order name is required")
		case service.ErrOrderCodeExists:
			respondError(w, http.StatusConflict, "An order with this code already exists")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to create order")
		}
		return
	}

	respondJSON(w, http.StatusCreated, o)
}

func (h *OrderHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid order ID")
		return
	}

	var req models.UpdateOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateOrderInput{}
	if req.Code != "" {
		input.Code = &req.Code
	}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	if req.Status != "" {
		input.Status = &req.Status
	}
	if req.Customer != "" {
		input.Customer = &req.Customer
	}
	if req.CostCenterID.String() != "" && req.CostCenterID.String() != "00000000-0000-0000-0000-000000000000" {
		ccID := uuid.MustParse(req.CostCenterID.String())
		input.CostCenterID = &ccID
	}
	if req.BillingRatePerHour != 0 {
		d := decimal.NewFromFloat(req.BillingRatePerHour)
		input.BillingRatePerHour = &d
	}
	if !time.Time(req.ValidFrom).IsZero() {
		vf := req.ValidFrom.String()
		input.ValidFrom = &vf
	}
	if !time.Time(req.ValidTo).IsZero() {
		vt := req.ValidTo.String()
		input.ValidTo = &vt
	}
	input.IsActive = &req.IsActive

	o, err := h.orderService.Update(r.Context(), id, input)
	if err != nil {
		switch err {
		case service.ErrOrderNotFound:
			respondError(w, http.StatusNotFound, "Order not found")
		case service.ErrOrderCodeRequired:
			respondError(w, http.StatusBadRequest, "Order code cannot be empty")
		case service.ErrOrderNameRequired:
			respondError(w, http.StatusBadRequest, "Order name cannot be empty")
		case service.ErrOrderCodeExists:
			respondError(w, http.StatusConflict, "An order with this code already exists")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to update order")
		}
		return
	}

	respondJSON(w, http.StatusOK, o)
}

func (h *OrderHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid order ID")
		return
	}

	if err := h.orderService.Delete(r.Context(), id); err != nil {
		if err == service.ErrOrderNotFound {
			respondError(w, http.StatusNotFound, "Order not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to delete order")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
