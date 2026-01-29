package handler

import (
	"encoding/json"
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

// PreviewEntitlement handles POST /vacation-entitlement/preview
func (h *VacationHandler) PreviewEntitlement(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.VacationEntitlementPreviewRequest
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

	input := service.PreviewEntitlementInput{
		EmployeeID: employeeID,
		Year:       int(*req.Year),
	}

	// Optional override
	if req.CalculationGroupID.String() != "" {
		groupID, parseErr := uuid.Parse(req.CalculationGroupID.String())
		if parseErr == nil && groupID != uuid.Nil {
			input.CalcGroupIDOverride = &groupID
		}
	}

	output, err := h.vacationService.PreviewEntitlement(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrInvalidYear:
			respondError(w, http.StatusBadRequest, "Invalid year")
		case service.ErrEmployeeNotFound:
			respondError(w, http.StatusNotFound, "Employee not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to compute entitlement preview")
		}
		return
	}

	respondJSON(w, http.StatusOK, h.previewToResponse(output))
}

// previewToResponse converts PreviewEntitlementOutput to the API response model.
func (h *VacationHandler) previewToResponse(out *service.PreviewEntitlementOutput) *models.VacationEntitlementPreview {
	empID := strfmt.UUID(out.EmployeeID.String())
	year := int64(out.Year)

	resp := &models.VacationEntitlementPreview{
		EmployeeID:          &empID,
		EmployeeName:        out.EmployeeName,
		Year:                &year,
		Basis:               out.Basis,
		BaseEntitlement:     out.CalcOutput.BaseEntitlement.InexactFloat64(),
		ProRatedEntitlement: out.CalcOutput.ProRatedEntitlement.InexactFloat64(),
		PartTimeAdjustment:  out.CalcOutput.PartTimeAdjustment.InexactFloat64(),
		AgeBonus:            out.CalcOutput.AgeBonus.InexactFloat64(),
		TenureBonus:         out.CalcOutput.TenureBonus.InexactFloat64(),
		DisabilityBonus:     out.CalcOutput.DisabilityBonus.InexactFloat64(),
		TotalEntitlement:    out.CalcOutput.TotalEntitlement.InexactFloat64(),
		MonthsEmployed:      int64(out.CalcOutput.MonthsEmployed),
		AgeAtReference:      int64(out.CalcOutput.AgeAtReference),
		TenureYears:         int64(out.CalcOutput.TenureYears),
		WeeklyHours:         out.WeeklyHours.InexactFloat64(),
		StandardWeeklyHours: out.StandardWeeklyHours.InexactFloat64(),
		PartTimeFactor:      out.PartTimeFactor.InexactFloat64(),
	}

	if out.CalcGroupID != nil {
		groupID := strfmt.UUID(out.CalcGroupID.String())
		resp.CalculationGroupID = &groupID
	}
	if out.CalcGroupName != nil {
		resp.CalculationGroupName = out.CalcGroupName
	}

	return resp
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
