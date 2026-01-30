package calculation

import (
	"fmt"
	"time"

	"github.com/shopspring/decimal"
)

// LocalTravelInput holds parameters for local travel allowance calculation.
type LocalTravelInput struct {
	DistanceKm      decimal.Decimal
	DurationMinutes int
	Rules           []LocalTravelRuleInput
}

// LocalTravelRuleInput represents a single local travel rule for matching.
type LocalTravelRuleInput struct {
	MinDistanceKm      decimal.Decimal
	MaxDistanceKm      *decimal.Decimal
	MinDurationMinutes int
	MaxDurationMinutes *int
	TaxFreeAmount      decimal.Decimal
	TaxableAmount      decimal.Decimal
}

// LocalTravelOutput contains the results of local travel allowance calculation.
type LocalTravelOutput struct {
	Matched        bool
	TaxFreeTotal   decimal.Decimal
	TaxableTotal   decimal.Decimal
	TotalAllowance decimal.Decimal
	MatchedRuleIdx int // index of the matched rule, -1 if none
}

// CalculateLocalTravelAllowance finds the first matching rule by distance/duration and returns the amounts.
// Rules are expected to be pre-sorted by the repository (sort_order ASC, min_distance_km ASC).
// The first rule where the distance and duration fall within the rule's range wins.
func CalculateLocalTravelAllowance(input LocalTravelInput) LocalTravelOutput {
	output := LocalTravelOutput{
		MatchedRuleIdx: -1,
		TaxFreeTotal:   decimal.Zero,
		TaxableTotal:   decimal.Zero,
		TotalAllowance: decimal.Zero,
	}

	for i, rule := range input.Rules {
		// Check distance range
		if input.DistanceKm.LessThan(rule.MinDistanceKm) {
			continue
		}
		if rule.MaxDistanceKm != nil && input.DistanceKm.GreaterThan(*rule.MaxDistanceKm) {
			continue
		}

		// Check duration range
		if input.DurationMinutes < rule.MinDurationMinutes {
			continue
		}
		if rule.MaxDurationMinutes != nil && input.DurationMinutes > *rule.MaxDurationMinutes {
			continue
		}

		// First matching rule wins
		output.Matched = true
		output.MatchedRuleIdx = i
		output.TaxFreeTotal = rule.TaxFreeAmount
		output.TaxableTotal = rule.TaxableAmount
		output.TotalAllowance = rule.TaxFreeAmount.Add(rule.TaxableAmount)
		return output
	}

	return output
}

// ExtendedTravelInput holds parameters for extended travel allowance calculation.
type ExtendedTravelInput struct {
	StartDate        time.Time
	EndDate          time.Time
	ThreeMonthActive bool
	Rule             ExtendedTravelRuleInput
}

// ExtendedTravelRuleInput represents an extended travel rule's rate configuration.
type ExtendedTravelRuleInput struct {
	ArrivalDayTaxFree      decimal.Decimal
	ArrivalDayTaxable      decimal.Decimal
	DepartureDayTaxFree    decimal.Decimal
	DepartureDayTaxable    decimal.Decimal
	IntermediateDayTaxFree decimal.Decimal
	IntermediateDayTaxable decimal.Decimal
	ThreeMonthEnabled      bool
	ThreeMonthTaxFree      decimal.Decimal
	ThreeMonthTaxable      decimal.Decimal
}

// ExtendedTravelOutput contains the results of extended travel allowance calculation.
type ExtendedTravelOutput struct {
	TotalDays        int
	ArrivalDays      int
	DepartureDays    int
	IntermediateDays int
	TaxFreeTotal     decimal.Decimal
	TaxableTotal     decimal.Decimal
	TotalAllowance   decimal.Decimal
	Breakdown        []ExtendedTravelBreakdownItem
}

// ExtendedTravelBreakdownItem describes a single line in the extended travel breakdown.
type ExtendedTravelBreakdownItem struct {
	Description     string
	Days            int
	TaxFreeAmount   decimal.Decimal
	TaxableAmount   decimal.Decimal
	TaxFreeSubtotal decimal.Decimal
	TaxableSubtotal decimal.Decimal
}

// CalculateExtendedTravelAllowance computes the allowance for a multi-day trip.
//
// Day calculation (inclusive):
//   - Same day (1 day): 1 arrival day only
//   - 2 days: 1 arrival day + 1 departure day
//   - 3+ days: 1 arrival day + (N-2) intermediate days + 1 departure day
//
// Three-month rule: if ThreeMonthActive && Rule.ThreeMonthEnabled, intermediate days
// use the reduced three-month rates instead of regular intermediate rates.
func CalculateExtendedTravelAllowance(input ExtendedTravelInput) ExtendedTravelOutput {
	output := ExtendedTravelOutput{
		TaxFreeTotal:   decimal.Zero,
		TaxableTotal:   decimal.Zero,
		TotalAllowance: decimal.Zero,
		Breakdown:      make([]ExtendedTravelBreakdownItem, 0),
	}

	// Calculate total days (inclusive)
	totalDays := int(input.EndDate.Sub(input.StartDate).Hours()/24) + 1
	if totalDays < 1 {
		totalDays = 1
	}
	output.TotalDays = totalDays

	rule := input.Rule

	switch {
	case totalDays == 1:
		// Same day: treat as 1 arrival day
		output.ArrivalDays = 1
		output.DepartureDays = 0
		output.IntermediateDays = 0

		arrivalTaxFree := rule.ArrivalDayTaxFree
		arrivalTaxable := rule.ArrivalDayTaxable

		output.Breakdown = append(output.Breakdown, ExtendedTravelBreakdownItem{
			Description:     "Arrival day",
			Days:            1,
			TaxFreeAmount:   arrivalTaxFree,
			TaxableAmount:   arrivalTaxable,
			TaxFreeSubtotal: arrivalTaxFree,
			TaxableSubtotal: arrivalTaxable,
		})

		output.TaxFreeTotal = arrivalTaxFree
		output.TaxableTotal = arrivalTaxable

	case totalDays == 2:
		// 2 days: arrival + departure
		output.ArrivalDays = 1
		output.DepartureDays = 1
		output.IntermediateDays = 0

		output.Breakdown = append(output.Breakdown, ExtendedTravelBreakdownItem{
			Description:     "Arrival day",
			Days:            1,
			TaxFreeAmount:   rule.ArrivalDayTaxFree,
			TaxableAmount:   rule.ArrivalDayTaxable,
			TaxFreeSubtotal: rule.ArrivalDayTaxFree,
			TaxableSubtotal: rule.ArrivalDayTaxable,
		})
		output.Breakdown = append(output.Breakdown, ExtendedTravelBreakdownItem{
			Description:     "Departure day",
			Days:            1,
			TaxFreeAmount:   rule.DepartureDayTaxFree,
			TaxableAmount:   rule.DepartureDayTaxable,
			TaxFreeSubtotal: rule.DepartureDayTaxFree,
			TaxableSubtotal: rule.DepartureDayTaxable,
		})

		output.TaxFreeTotal = rule.ArrivalDayTaxFree.Add(rule.DepartureDayTaxFree)
		output.TaxableTotal = rule.ArrivalDayTaxable.Add(rule.DepartureDayTaxable)

	default:
		// 3+ days: arrival + intermediate + departure
		intermediateDays := totalDays - 2
		output.ArrivalDays = 1
		output.DepartureDays = 1
		output.IntermediateDays = intermediateDays

		// Arrival day
		output.Breakdown = append(output.Breakdown, ExtendedTravelBreakdownItem{
			Description:     "Arrival day",
			Days:            1,
			TaxFreeAmount:   rule.ArrivalDayTaxFree,
			TaxableAmount:   rule.ArrivalDayTaxable,
			TaxFreeSubtotal: rule.ArrivalDayTaxFree,
			TaxableSubtotal: rule.ArrivalDayTaxable,
		})

		// Intermediate days
		intDays := decimal.NewFromInt(int64(intermediateDays))
		var intTaxFree, intTaxable decimal.Decimal

		if input.ThreeMonthActive && rule.ThreeMonthEnabled {
			// Use reduced three-month rates
			intTaxFree = rule.ThreeMonthTaxFree
			intTaxable = rule.ThreeMonthTaxable
			output.Breakdown = append(output.Breakdown, ExtendedTravelBreakdownItem{
				Description:     fmt.Sprintf("Intermediate days (three-month rule) x%d", intermediateDays),
				Days:            intermediateDays,
				TaxFreeAmount:   intTaxFree,
				TaxableAmount:   intTaxable,
				TaxFreeSubtotal: intTaxFree.Mul(intDays),
				TaxableSubtotal: intTaxable.Mul(intDays),
			})
		} else {
			intTaxFree = rule.IntermediateDayTaxFree
			intTaxable = rule.IntermediateDayTaxable
			output.Breakdown = append(output.Breakdown, ExtendedTravelBreakdownItem{
				Description:     fmt.Sprintf("Intermediate days x%d", intermediateDays),
				Days:            intermediateDays,
				TaxFreeAmount:   intTaxFree,
				TaxableAmount:   intTaxable,
				TaxFreeSubtotal: intTaxFree.Mul(intDays),
				TaxableSubtotal: intTaxable.Mul(intDays),
			})
		}

		// Departure day
		output.Breakdown = append(output.Breakdown, ExtendedTravelBreakdownItem{
			Description:     "Departure day",
			Days:            1,
			TaxFreeAmount:   rule.DepartureDayTaxFree,
			TaxableAmount:   rule.DepartureDayTaxable,
			TaxFreeSubtotal: rule.DepartureDayTaxFree,
			TaxableSubtotal: rule.DepartureDayTaxable,
		})

		output.TaxFreeTotal = rule.ArrivalDayTaxFree.
			Add(intTaxFree.Mul(intDays)).
			Add(rule.DepartureDayTaxFree)
		output.TaxableTotal = rule.ArrivalDayTaxable.
			Add(intTaxable.Mul(intDays)).
			Add(rule.DepartureDayTaxable)
	}

	output.TotalAllowance = output.TaxFreeTotal.Add(output.TaxableTotal)

	return output
}
