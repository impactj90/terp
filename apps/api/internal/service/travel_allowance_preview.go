package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/internal/calculation"
	"github.com/tolga/terp/internal/model"
)

var (
	ErrTravelPreviewRuleSetNotFound   = errors.New("rule set not found for travel allowance preview")
	ErrTravelPreviewRuleSetIDRequired = errors.New("rule set ID is required for preview")
	ErrTravelPreviewTripTypeRequired  = errors.New("trip type is required (local or extended)")
	ErrTravelPreviewInvalidTripType   = errors.New("trip type must be 'local' or 'extended'")
	ErrTravelPreviewDistanceRequired  = errors.New("distance is required for local travel preview")
	ErrTravelPreviewDurationRequired  = errors.New("duration is required for local travel preview")
	ErrTravelPreviewDatesRequired     = errors.New("start_date and end_date are required for extended travel preview")
	ErrTravelPreviewNoMatchingRule    = errors.New("no matching local travel rule found for given distance and duration")
	ErrTravelPreviewNoExtendedRule    = errors.New("no active extended travel rule found for this rule set")
)

// previewRuleSetRepository defines the interface for rule set lookup.
type previewRuleSetRepository interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.TravelAllowanceRuleSet, error)
}

// previewLocalRuleRepository defines the interface for local rule lookup.
type previewLocalRuleRepository interface {
	ListByRuleSet(ctx context.Context, ruleSetID uuid.UUID) ([]model.LocalTravelRule, error)
}

// previewExtendedRuleRepository defines the interface for extended rule lookup.
type previewExtendedRuleRepository interface {
	ListByRuleSet(ctx context.Context, ruleSetID uuid.UUID) ([]model.ExtendedTravelRule, error)
}

// TravelAllowancePreviewService handles travel allowance preview calculations.
type TravelAllowancePreviewService struct {
	ruleSetRepo      previewRuleSetRepository
	localRuleRepo    previewLocalRuleRepository
	extendedRuleRepo previewExtendedRuleRepository
}

// NewTravelAllowancePreviewService creates a new TravelAllowancePreviewService.
func NewTravelAllowancePreviewService(
	ruleSetRepo previewRuleSetRepository,
	localRuleRepo previewLocalRuleRepository,
	extendedRuleRepo previewExtendedRuleRepository,
) *TravelAllowancePreviewService {
	return &TravelAllowancePreviewService{
		ruleSetRepo:      ruleSetRepo,
		localRuleRepo:    localRuleRepo,
		extendedRuleRepo: extendedRuleRepo,
	}
}

// TravelAllowancePreviewInput holds input for a travel allowance preview.
type TravelAllowancePreviewInput struct {
	RuleSetID        uuid.UUID
	TripType         string // "local" or "extended"
	DistanceKm       float64
	DurationMinutes  int
	StartDate        time.Time
	EndDate          time.Time
	ThreeMonthActive bool
}

// TravelAllowancePreviewResult holds the preview result.
type TravelAllowancePreviewResult struct {
	TripType       string
	RuleSetID      uuid.UUID
	RuleSetName    string
	TaxFreeTotal   decimal.Decimal
	TaxableTotal   decimal.Decimal
	TotalAllowance decimal.Decimal
	Breakdown      []TravelAllowanceBreakdownItem
}

// TravelAllowanceBreakdownItem describes a single line in the breakdown.
type TravelAllowanceBreakdownItem struct {
	Description     string
	Days            int
	TaxFreeAmount   decimal.Decimal
	TaxableAmount   decimal.Decimal
	TaxFreeSubtotal decimal.Decimal
	TaxableSubtotal decimal.Decimal
}

// Preview calculates a travel allowance preview.
func (s *TravelAllowancePreviewService) Preview(ctx context.Context, input TravelAllowancePreviewInput) (*TravelAllowancePreviewResult, error) {
	// Validate input
	if input.RuleSetID == uuid.Nil {
		return nil, ErrTravelPreviewRuleSetIDRequired
	}
	if input.TripType == "" {
		return nil, ErrTravelPreviewTripTypeRequired
	}
	if input.TripType != "local" && input.TripType != "extended" {
		return nil, ErrTravelPreviewInvalidTripType
	}

	// Fetch rule set
	ruleSet, err := s.ruleSetRepo.GetByID(ctx, input.RuleSetID)
	if err != nil {
		return nil, ErrTravelPreviewRuleSetNotFound
	}

	if input.TripType == "local" {
		return s.previewLocal(ctx, input, ruleSet)
	}
	return s.previewExtended(ctx, input, ruleSet)
}

func (s *TravelAllowancePreviewService) previewLocal(ctx context.Context, input TravelAllowancePreviewInput, ruleSet *model.TravelAllowanceRuleSet) (*TravelAllowancePreviewResult, error) {
	if input.DistanceKm <= 0 && input.DurationMinutes <= 0 {
		return nil, ErrTravelPreviewDistanceRequired
	}

	// Fetch local rules for this rule set
	rules, err := s.localRuleRepo.ListByRuleSet(ctx, input.RuleSetID)
	if err != nil {
		return nil, err
	}

	// Build calculation input
	calcRules := make([]calculation.LocalTravelRuleInput, 0, len(rules))
	for _, r := range rules {
		if !r.IsActive {
			continue
		}
		calcRules = append(calcRules, calculation.LocalTravelRuleInput{
			MinDistanceKm:      r.MinDistanceKm,
			MaxDistanceKm:      r.MaxDistanceKm,
			MinDurationMinutes: r.MinDurationMinutes,
			MaxDurationMinutes: r.MaxDurationMinutes,
			TaxFreeAmount:      r.TaxFreeAmount,
			TaxableAmount:      r.TaxableAmount,
		})
	}

	calcInput := calculation.LocalTravelInput{
		DistanceKm:      decimal.NewFromFloat(input.DistanceKm),
		DurationMinutes: input.DurationMinutes,
		Rules:           calcRules,
	}

	calcOutput := calculation.CalculateLocalTravelAllowance(calcInput)

	if !calcOutput.Matched {
		return nil, ErrTravelPreviewNoMatchingRule
	}

	result := &TravelAllowancePreviewResult{
		TripType:       "local",
		RuleSetID:      ruleSet.ID,
		RuleSetName:    ruleSet.Name,
		TaxFreeTotal:   calcOutput.TaxFreeTotal,
		TaxableTotal:   calcOutput.TaxableTotal,
		TotalAllowance: calcOutput.TotalAllowance,
		Breakdown: []TravelAllowanceBreakdownItem{
			{
				Description:     "Local travel allowance",
				Days:            1,
				TaxFreeAmount:   calcOutput.TaxFreeTotal,
				TaxableAmount:   calcOutput.TaxableTotal,
				TaxFreeSubtotal: calcOutput.TaxFreeTotal,
				TaxableSubtotal: calcOutput.TaxableTotal,
			},
		},
	}

	return result, nil
}

func (s *TravelAllowancePreviewService) previewExtended(ctx context.Context, input TravelAllowancePreviewInput, ruleSet *model.TravelAllowanceRuleSet) (*TravelAllowancePreviewResult, error) {
	if input.StartDate.IsZero() || input.EndDate.IsZero() {
		return nil, ErrTravelPreviewDatesRequired
	}

	// Fetch extended rules for this rule set
	rules, err := s.extendedRuleRepo.ListByRuleSet(ctx, input.RuleSetID)
	if err != nil {
		return nil, err
	}

	// Find first active rule
	var activeRule *model.ExtendedTravelRule
	for i := range rules {
		if rules[i].IsActive {
			activeRule = &rules[i]
			break
		}
	}
	if activeRule == nil {
		return nil, ErrTravelPreviewNoExtendedRule
	}

	calcInput := calculation.ExtendedTravelInput{
		StartDate:        input.StartDate,
		EndDate:          input.EndDate,
		ThreeMonthActive: input.ThreeMonthActive,
		Rule: calculation.ExtendedTravelRuleInput{
			ArrivalDayTaxFree:      activeRule.ArrivalDayTaxFree,
			ArrivalDayTaxable:      activeRule.ArrivalDayTaxable,
			DepartureDayTaxFree:    activeRule.DepartureDayTaxFree,
			DepartureDayTaxable:    activeRule.DepartureDayTaxable,
			IntermediateDayTaxFree: activeRule.IntermediateDayTaxFree,
			IntermediateDayTaxable: activeRule.IntermediateDayTaxable,
			ThreeMonthEnabled:      activeRule.ThreeMonthEnabled,
			ThreeMonthTaxFree:      activeRule.ThreeMonthTaxFree,
			ThreeMonthTaxable:      activeRule.ThreeMonthTaxable,
		},
	}

	calcOutput := calculation.CalculateExtendedTravelAllowance(calcInput)

	breakdown := make([]TravelAllowanceBreakdownItem, 0, len(calcOutput.Breakdown))
	for _, item := range calcOutput.Breakdown {
		breakdown = append(breakdown, TravelAllowanceBreakdownItem{
			Description:     item.Description,
			Days:            item.Days,
			TaxFreeAmount:   item.TaxFreeAmount,
			TaxableAmount:   item.TaxableAmount,
			TaxFreeSubtotal: item.TaxFreeSubtotal,
			TaxableSubtotal: item.TaxableSubtotal,
		})
	}

	result := &TravelAllowancePreviewResult{
		TripType:       "extended",
		RuleSetID:      ruleSet.ID,
		RuleSetName:    ruleSet.Name,
		TaxFreeTotal:   calcOutput.TaxFreeTotal,
		TaxableTotal:   calcOutput.TaxableTotal,
		TotalAllowance: calcOutput.TotalAllowance,
		Breakdown:      breakdown,
	}

	return result, nil
}
