package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/service"
)

// TravelAllowancePreviewHandler handles travel allowance preview HTTP requests.
type TravelAllowancePreviewHandler struct {
	svc *service.TravelAllowancePreviewService
}

// NewTravelAllowancePreviewHandler creates a new TravelAllowancePreviewHandler.
func NewTravelAllowancePreviewHandler(svc *service.TravelAllowancePreviewService) *TravelAllowancePreviewHandler {
	return &TravelAllowancePreviewHandler{svc: svc}
}

// Preview handles POST /travel-allowance/preview
func (h *TravelAllowancePreviewHandler) Preview(w http.ResponseWriter, r *http.Request) {
	var req models.TravelAllowancePreviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	ruleSetID, err := uuid.Parse(req.RuleSetID.String())
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid rule_set_id")
		return
	}

	input := service.TravelAllowancePreviewInput{
		RuleSetID: ruleSetID,
		TripType:  *req.TripType,
	}

	input.DistanceKm = req.DistanceKm
	input.DurationMinutes = int(req.DurationMinutes)

	if !time.Time(req.StartDate).IsZero() {
		input.StartDate = time.Time(req.StartDate)
	}
	if !time.Time(req.EndDate).IsZero() {
		input.EndDate = time.Time(req.EndDate)
	}
	if req.ThreeMonthActive != nil {
		input.ThreeMonthActive = *req.ThreeMonthActive
	}

	result, err := h.svc.Preview(r.Context(), input)
	if err != nil {
		handleTravelPreviewError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, travelPreviewToResponse(result))
}

// travelPreviewToResponse converts internal result to API response.
func travelPreviewToResponse(result *service.TravelAllowancePreviewResult) *models.TravelAllowancePreview {
	taxFreeTotal, _ := result.TaxFreeTotal.Float64()
	taxableTotal, _ := result.TaxableTotal.Float64()
	totalAllowance, _ := result.TotalAllowance.Float64()

	resp := &models.TravelAllowancePreview{
		TripType:       result.TripType,
		RuleSetID:      strfmt.UUID(result.RuleSetID.String()),
		RuleSetName:    result.RuleSetName,
		TaxFreeTotal:   taxFreeTotal,
		TaxableTotal:   taxableTotal,
		TotalAllowance: totalAllowance,
		Breakdown:      make([]*models.TravelAllowanceBreakdownItem, 0, len(result.Breakdown)),
	}

	for _, item := range result.Breakdown {
		taxFreeAmt, _ := item.TaxFreeAmount.Float64()
		taxableAmt, _ := item.TaxableAmount.Float64()
		taxFreeSub, _ := item.TaxFreeSubtotal.Float64()
		taxableSub, _ := item.TaxableSubtotal.Float64()

		resp.Breakdown = append(resp.Breakdown, &models.TravelAllowanceBreakdownItem{
			Description:     item.Description,
			Days:            int64(item.Days),
			TaxFreeAmount:   taxFreeAmt,
			TaxableAmount:   taxableAmt,
			TaxFreeSubtotal: taxFreeSub,
			TaxableSubtotal: taxableSub,
		})
	}

	return resp
}

// handleTravelPreviewError maps service errors to HTTP responses.
func handleTravelPreviewError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrTravelPreviewRuleSetNotFound:
		respondError(w, http.StatusNotFound, "Rule set not found")
	case service.ErrTravelPreviewRuleSetIDRequired:
		respondError(w, http.StatusBadRequest, "Rule set ID is required")
	case service.ErrTravelPreviewTripTypeRequired:
		respondError(w, http.StatusBadRequest, "Trip type is required")
	case service.ErrTravelPreviewInvalidTripType:
		respondError(w, http.StatusBadRequest, "Trip type must be 'local' or 'extended'")
	case service.ErrTravelPreviewDistanceRequired:
		respondError(w, http.StatusBadRequest, "Distance is required for local travel preview")
	case service.ErrTravelPreviewDurationRequired:
		respondError(w, http.StatusBadRequest, "Duration is required for local travel preview")
	case service.ErrTravelPreviewDatesRequired:
		respondError(w, http.StatusBadRequest, "Start date and end date are required for extended travel preview")
	case service.ErrTravelPreviewNoMatchingRule:
		respondError(w, http.StatusNotFound, "No matching rule found for given distance and duration")
	case service.ErrTravelPreviewNoExtendedRule:
		respondError(w, http.StatusNotFound, "No active extended travel rule found for this rule set")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
