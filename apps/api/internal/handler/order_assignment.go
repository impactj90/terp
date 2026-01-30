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

// OrderAssignmentHandler handles order assignment HTTP requests.
type OrderAssignmentHandler struct {
	assignmentService *service.OrderAssignmentService
}

// NewOrderAssignmentHandler creates a new OrderAssignmentHandler.
func NewOrderAssignmentHandler(assignmentService *service.OrderAssignmentService) *OrderAssignmentHandler {
	return &OrderAssignmentHandler{assignmentService: assignmentService}
}

func (h *OrderAssignmentHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	orderIDStr := r.URL.Query().Get("order_id")
	employeeIDStr := r.URL.Query().Get("employee_id")

	var assignments interface{}
	var err error

	if orderIDStr != "" {
		orderID, parseErr := uuid.Parse(orderIDStr)
		if parseErr != nil {
			respondError(w, http.StatusBadRequest, "Invalid order_id")
			return
		}
		assignments, err = h.assignmentService.ListByOrder(r.Context(), orderID)
	} else if employeeIDStr != "" {
		employeeID, parseErr := uuid.Parse(employeeIDStr)
		if parseErr != nil {
			respondError(w, http.StatusBadRequest, "Invalid employee_id")
			return
		}
		assignments, err = h.assignmentService.ListByEmployee(r.Context(), employeeID)
	} else {
		assignments, err = h.assignmentService.List(r.Context(), tenantID)
	}

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list order assignments")
		return
	}
	respondJSON(w, http.StatusOK, assignments)
}

func (h *OrderAssignmentHandler) ListByOrder(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	orderID, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid order ID")
		return
	}

	assignments, err := h.assignmentService.ListByOrder(r.Context(), orderID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list order assignments")
		return
	}
	respondJSON(w, http.StatusOK, assignments)
}

func (h *OrderAssignmentHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid assignment ID")
		return
	}

	a, err := h.assignmentService.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Order assignment not found")
		return
	}

	respondJSON(w, http.StatusOK, a)
}

func (h *OrderAssignmentHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateOrderAssignmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateOrderAssignmentInput{
		TenantID:   tenantID,
		OrderID:    uuid.MustParse(req.OrderID.String()),
		EmployeeID: uuid.MustParse(req.EmployeeID.String()),
		Role:       req.Role,
	}

	if !time.Time(req.ValidFrom).IsZero() {
		vf := req.ValidFrom.String()
		input.ValidFrom = &vf
	}
	if !time.Time(req.ValidTo).IsZero() {
		vt := req.ValidTo.String()
		input.ValidTo = &vt
	}

	a, err := h.assignmentService.Create(r.Context(), input)
	if err != nil {
		if err == service.ErrOrderAssignmentExists {
			respondError(w, http.StatusConflict, "Assignment already exists for this employee, order, and role")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to create order assignment")
		return
	}

	respondJSON(w, http.StatusCreated, a)
}

func (h *OrderAssignmentHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid assignment ID")
		return
	}

	var req models.UpdateOrderAssignmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateOrderAssignmentInput{}
	if req.Role != "" {
		input.Role = &req.Role
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

	a, err := h.assignmentService.Update(r.Context(), id, input)
	if err != nil {
		if err == service.ErrOrderAssignmentNotFound {
			respondError(w, http.StatusNotFound, "Order assignment not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to update order assignment")
		return
	}

	respondJSON(w, http.StatusOK, a)
}

func (h *OrderAssignmentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid assignment ID")
		return
	}

	if err := h.assignmentService.Delete(r.Context(), id); err != nil {
		if err == service.ErrOrderAssignmentNotFound {
			respondError(w, http.StatusNotFound, "Order assignment not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to delete order assignment")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
