package handler

import (
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

// DailyAccountValueHandler handles HTTP requests for daily account values.
type DailyAccountValueHandler struct {
	svc *service.DailyAccountValueService
}

// NewDailyAccountValueHandler creates a new handler.
func NewDailyAccountValueHandler(svc *service.DailyAccountValueService) *DailyAccountValueHandler {
	return &DailyAccountValueHandler{svc: svc}
}

// List returns daily account values with optional filters.
func (h *DailyAccountValueHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	opts := model.DailyAccountValueListOptions{}

	if employeeIDStr := r.URL.Query().Get("employee_id"); employeeIDStr != "" {
		id, err := uuid.Parse(employeeIDStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid employee_id")
			return
		}
		opts.EmployeeID = &id
	}

	if accountIDStr := r.URL.Query().Get("account_id"); accountIDStr != "" {
		id, err := uuid.Parse(accountIDStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid account_id")
			return
		}
		opts.AccountID = &id
	}

	if fromStr := r.URL.Query().Get("from"); fromStr != "" {
		t, err := time.Parse("2006-01-02", fromStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid from date")
			return
		}
		opts.From = &t
	}

	if toStr := r.URL.Query().Get("to"); toStr != "" {
		t, err := time.Parse("2006-01-02", toStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid to date")
			return
		}
		opts.To = &t
	}

	if sourceStr := r.URL.Query().Get("source"); sourceStr != "" {
		source := model.DailyAccountValueSource(sourceStr)
		if source != model.DailyAccountValueSourceNetTime && source != model.DailyAccountValueSourceCappedTime {
			respondError(w, http.StatusBadRequest, "Invalid source (must be net_time or capped_time)")
			return
		}
		opts.Source = &source
	}

	values, err := h.svc.List(r.Context(), tenantID, opts)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list daily account values")
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"data": values,
	})
}
