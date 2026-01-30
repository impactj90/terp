package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/service"
)

// VacationCarryoverHandler handles vacation carryover preview HTTP requests.
type VacationCarryoverHandler struct {
	svc *service.VacationCarryoverService
}

// NewVacationCarryoverHandler creates a new VacationCarryoverHandler.
func NewVacationCarryoverHandler(svc *service.VacationCarryoverService) *VacationCarryoverHandler {
	return &VacationCarryoverHandler{svc: svc}
}

// PreviewCarryover handles POST /vacation-carryover/preview
func (h *VacationCarryoverHandler) PreviewCarryover(w http.ResponseWriter, r *http.Request) {
	var req models.VacationCarryoverPreviewRequest
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
		respondError(w, http.StatusBadRequest, "Invalid employee_id")
		return
	}

	result, err := h.svc.PreviewCarryover(r.Context(), employeeID, int(*req.Year))
	if err != nil {
		handleCarryoverPreviewError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, carryoverPreviewToResponse(result))
}

// carryoverPreviewToResponse converts internal result to API response.
func carryoverPreviewToResponse(result *service.CarryoverPreviewResult) *models.VacationCarryoverPreview {
	availableDays, _ := result.AvailableDays.Float64()
	cappedCarryover, _ := result.CappedCarryover.Float64()
	forfeitedDays, _ := result.ForfeitedDays.Float64()

	resp := &models.VacationCarryoverPreview{
		EmployeeID:      strfmt.UUID(result.EmployeeID.String()),
		Year:            int64(result.Year),
		AvailableDays:   availableDays,
		CappedCarryover: cappedCarryover,
		ForfeitedDays:   forfeitedDays,
		HasException:    result.HasException,
		RulesApplied:    make([]*models.CappingRuleApplication, 0, len(result.RulesApplied)),
	}

	for _, ra := range result.RulesApplied {
		capValue, _ := ra.CapValue.Float64()
		resp.RulesApplied = append(resp.RulesApplied, &models.CappingRuleApplication{
			RuleID:          strfmt.UUID(ra.RuleID.String()),
			RuleName:        ra.RuleName,
			RuleType:        ra.RuleType,
			CapValue:        capValue,
			Applied:         ra.Applied,
			ExceptionActive: ra.ExceptionActive,
		})
	}

	return resp
}

// handleCarryoverPreviewError maps service errors to HTTP responses.
func handleCarryoverPreviewError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrCarryoverPreviewEmployeeNotFound:
		respondError(w, http.StatusNotFound, "Employee not found")
	case service.ErrCarryoverPreviewTariffNotFound:
		respondError(w, http.StatusNotFound, "Employee has no tariff assigned")
	case service.ErrCarryoverPreviewNoCappingGroup:
		respondError(w, http.StatusNotFound, "Tariff has no capping rule group assigned")
	case service.ErrCarryoverPreviewYearRequired:
		respondError(w, http.StatusBadRequest, "Year is required")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
