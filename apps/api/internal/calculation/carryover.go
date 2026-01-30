package calculation

import (
	"time"

	"github.com/shopspring/decimal"
)

// CappingRuleInput represents a single capping rule for carryover calculation.
type CappingRuleInput struct {
	RuleID      string
	RuleName    string
	RuleType    string // "year_end" or "mid_year"
	CutoffMonth int
	CutoffDay   int
	CapValue    decimal.Decimal
}

// CappingExceptionInput represents an employee exception from capping.
type CappingExceptionInput struct {
	CappingRuleID string
	ExemptionType string // "full" or "partial"
	RetainDays    *decimal.Decimal
}

// CarryoverInput contains all data for calculating vacation carryover.
type CarryoverInput struct {
	AvailableDays decimal.Decimal // Remaining vacation days at year end
	Year          int             // The year ending (carryover goes TO year+1)
	ReferenceDate time.Time       // Date to evaluate mid-year rules against

	CappingRules []CappingRuleInput
	Exceptions   []CappingExceptionInput
}

// CappingRuleResult captures the outcome of one capping rule's application.
type CappingRuleResult struct {
	RuleID          string
	RuleName        string
	RuleType        string
	CapValue        decimal.Decimal
	Applied         bool // Did this rule actually reduce the carryover?
	ExceptionActive bool // Was this rule overridden by an exception?
}

// CarryoverOutput contains the results of carryover calculation.
type CarryoverOutput struct {
	AvailableDays   decimal.Decimal
	CappedCarryover decimal.Decimal
	ForfeitedDays   decimal.Decimal
	RulesApplied    []CappingRuleResult
	HasException    bool
}

// CalculateCarryoverWithCapping computes vacation carryover applying capping rules
// and employee exceptions. Rules are applied in order: year_end first, then mid_year.
//
// Year-end rules (Kappung zum Jahresende):
//   - Applied at the year boundary (Dec 31 / Dec 31 of cutoff date)
//   - Caps the total carryover to CapValue
//
// Mid-year rules (Kappung wahrend des Jahres):
//   - Applied when reference date is after the cutoff date in the NEXT year
//   - Forfeits remaining prior-year carryover exceeding CapValue
//   - Example: cutoff March 31 means carryover from 2025 is forfeited if not used by March 31, 2026
//
// Exception handling:
//   - "full" exception: the employee is completely exempt from this rule
//   - "partial" exception: the employee retains up to RetainDays despite the cap
func CalculateCarryoverWithCapping(input CarryoverInput) CarryoverOutput {
	output := CarryoverOutput{
		AvailableDays:   input.AvailableDays,
		CappedCarryover: input.AvailableDays,
		RulesApplied:    make([]CappingRuleResult, 0, len(input.CappingRules)),
	}

	if input.AvailableDays.LessThanOrEqual(decimal.Zero) {
		output.CappedCarryover = decimal.Zero
		output.ForfeitedDays = decimal.Zero
		return output
	}

	// Build exception lookup by rule ID
	exceptionMap := make(map[string]CappingExceptionInput)
	for _, exc := range input.Exceptions {
		exceptionMap[exc.CappingRuleID] = exc
	}

	currentCarryover := input.AvailableDays

	for _, rule := range input.CappingRules {
		result := CappingRuleResult{
			RuleID:   rule.RuleID,
			RuleName: rule.RuleName,
			RuleType: rule.RuleType,
			CapValue: rule.CapValue,
		}

		// Check for employee exception
		if exc, ok := exceptionMap[rule.RuleID]; ok {
			result.ExceptionActive = true
			output.HasException = true

			if exc.ExemptionType == "full" {
				// Full exemption: rule does not apply at all
				result.Applied = false
				output.RulesApplied = append(output.RulesApplied, result)
				continue
			}

			// Partial exemption: use RetainDays as the effective cap
			if exc.RetainDays != nil && exc.RetainDays.GreaterThan(rule.CapValue) {
				effectiveCap := *exc.RetainDays
				if currentCarryover.GreaterThan(effectiveCap) {
					currentCarryover = effectiveCap
					result.Applied = true
				}
				output.RulesApplied = append(output.RulesApplied, result)
				continue
			}
		}

		// Apply the rule based on type
		switch rule.RuleType {
		case "year_end":
			if rule.CapValue.IsZero() {
				// Cap value of 0 means forfeit all
				currentCarryover = decimal.Zero
				result.Applied = true
			} else if currentCarryover.GreaterThan(rule.CapValue) {
				currentCarryover = rule.CapValue
				result.Applied = true
			}

		case "mid_year":
			// Mid-year rule applies if the reference date is after the cutoff date in the next year
			cutoffDate := time.Date(input.Year+1, time.Month(rule.CutoffMonth), rule.CutoffDay, 0, 0, 0, 0, time.UTC)
			if input.ReferenceDate.After(cutoffDate) {
				if rule.CapValue.IsZero() {
					currentCarryover = decimal.Zero
					result.Applied = true
				} else if currentCarryover.GreaterThan(rule.CapValue) {
					currentCarryover = rule.CapValue
					result.Applied = true
				}
			}
		}

		output.RulesApplied = append(output.RulesApplied, result)
	}

	// Ensure non-negative
	if currentCarryover.LessThan(decimal.Zero) {
		currentCarryover = decimal.Zero
	}

	output.CappedCarryover = currentCarryover
	output.ForfeitedDays = input.AvailableDays.Sub(currentCarryover)
	if output.ForfeitedDays.LessThan(decimal.Zero) {
		output.ForfeitedDays = decimal.Zero
	}

	return output
}
