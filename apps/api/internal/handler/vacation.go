package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

// VacationHandler handles vacation-related HTTP requests.
type VacationHandler struct {
	vacationService *service.VacationService
}

// NewVacationHandler creates a new VacationHandler instance.
func NewVacationHandler(vacationService *service.VacationService) *VacationHandler {
	return &VacationHandler{
		vacationService: vacationService,
	}
}

// GetBalance handles GET /employees/{id}/vacation-balance
func (h *VacationHandler) GetBalance(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}
	_ = tenantID // used for auth context

	// Parse employee ID from path
	employeeIDStr := chi.URLParam(r, "id")
	employeeID, err := uuid.Parse(employeeIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	// Parse optional year query param (default: current year)
	year := time.Now().Year()
	if yearStr := r.URL.Query().Get("year"); yearStr != "" {
		parsedYear, err := strconv.Atoi(yearStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid year parameter")
			return
		}
		year = parsedYear
	}

	// Call service
	balance, err := h.vacationService.GetBalance(r.Context(), employeeID, year)
	if err != nil {
		switch err {
		case service.ErrInvalidYear:
			respondError(w, http.StatusBadRequest, "Invalid year")
		case service.ErrVacationBalanceNotFound:
			respondError(w, http.StatusNotFound, "Vacation balance not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to get vacation balance")
		}
		return
	}

	respondJSON(w, http.StatusOK, h.balanceToResponse(balance))
}

// balanceToResponse converts internal VacationBalance to API response model.
func (h *VacationHandler) balanceToResponse(vb *model.VacationBalance) *models.VacationBalance {
	id := strfmt.UUID(vb.ID.String())
	tenantID := strfmt.UUID(vb.TenantID.String())
	employeeID := strfmt.UUID(vb.EmployeeID.String())
	year := int64(vb.Year)

	return &models.VacationBalance{
		ID:                    &id,
		TenantID:              &tenantID,
		EmployeeID:            &employeeID,
		Year:                  &year,
		BaseEntitlement:       vb.Entitlement.InexactFloat64(),
		CarryoverFromPrevious: vb.Carryover.InexactFloat64(),
		ManualAdjustment:      vb.Adjustments.InexactFloat64(),
		UsedDays:              vb.Taken.InexactFloat64(),
		TotalEntitlement:      vb.Total().InexactFloat64(),
		RemainingDays:         vb.Available().InexactFloat64(),
		CreatedAt:             strfmt.DateTime(vb.CreatedAt),
		UpdatedAt:             strfmt.DateTime(vb.UpdatedAt),
	}
}
