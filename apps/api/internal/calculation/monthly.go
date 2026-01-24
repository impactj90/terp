package calculation

import "github.com/shopspring/decimal"

// CreditType defines how overtime is credited to the flextime account (Art der Gutschrift).
type CreditType string

const (
	// CreditTypeNoEvaluation transfers overtime/undertime directly 1:1 with no limits.
	CreditTypeNoEvaluation CreditType = "no_evaluation"
	// CreditTypeCompleteCarryover transfers overtime with monthly and balance caps.
	CreditTypeCompleteCarryover CreditType = "complete_carryover"
	// CreditTypeAfterThreshold only credits overtime exceeding the threshold.
	CreditTypeAfterThreshold CreditType = "after_threshold"
	// CreditTypeNoCarryover resets the flextime balance to zero each month.
	CreditTypeNoCarryover CreditType = "no_carryover"
)

// MonthlyCalcInput contains all data needed for monthly aggregation calculation.
type MonthlyCalcInput struct {
	DailyValues       []DailyValueInput       // Daily values for the month
	PreviousCarryover int                     // Flextime balance from previous month (minutes)
	EvaluationRules   *MonthlyEvaluationInput // ZMI rules (nil = no evaluation)
	AbsenceSummary    AbsenceSummaryInput     // Pre-computed absence counts
}

// DailyValueInput represents a simplified daily value for monthly aggregation.
type DailyValueInput struct {
	Date       string // YYYY-MM-DD reference
	GrossTime  int    // Minutes
	NetTime    int    // Minutes
	TargetTime int    // Minutes
	Overtime   int    // Minutes (positive)
	Undertime  int    // Minutes (positive, to subtract)
	BreakTime  int    // Minutes
	HasError   bool
}

// MonthlyEvaluationInput contains ZMI monthly evaluation rules.
type MonthlyEvaluationInput struct {
	CreditType          CreditType // Which of the 4 credit types
	FlextimeThreshold   *int       // Threshold for after_threshold mode
	MaxFlextimePerMonth *int       // Monthly credit cap
	FlextimeCapPositive *int       // Upper balance limit
	FlextimeCapNegative *int       // Lower balance limit (stored as positive value)
	AnnualFloorBalance  *int       // Year-end annual floor
}

// AbsenceSummaryInput contains pre-computed absence data.
type AbsenceSummaryInput struct {
	VacationDays     decimal.Decimal
	SickDays         int
	OtherAbsenceDays int
}

// MonthlyCalcOutput contains the results of monthly aggregation calculation.
type MonthlyCalcOutput struct {
	// Aggregated totals (all in minutes)
	TotalGrossTime  int
	TotalNetTime    int
	TotalTargetTime int
	TotalOvertime   int
	TotalUndertime  int
	TotalBreakTime  int

	// Flextime tracking (all in minutes)
	FlextimeStart     int // PreviousCarryover
	FlextimeChange    int // TotalOvertime - TotalUndertime
	FlextimeRaw       int // FlextimeStart + FlextimeChange
	FlextimeCredited  int // Amount actually credited after rules
	FlextimeForfeited int // Amount forfeited due to rules
	FlextimeEnd       int // Final balance after all rules

	// Work summary
	WorkDays       int
	DaysWithErrors int

	// Absence copy
	VacationTaken    decimal.Decimal
	SickDays         int
	OtherAbsenceDays int

	// Warnings
	Warnings []string
}

// CalculateMonth aggregates daily values into monthly totals and applies
// ZMI-compliant credit type rules for flextime carryover.
func CalculateMonth(input MonthlyCalcInput) MonthlyCalcOutput {
	var output MonthlyCalcOutput

	// Step 1: Initialize
	output.FlextimeStart = input.PreviousCarryover
	output.VacationTaken = input.AbsenceSummary.VacationDays
	output.SickDays = input.AbsenceSummary.SickDays
	output.OtherAbsenceDays = input.AbsenceSummary.OtherAbsenceDays
	output.Warnings = make([]string, 0)

	// Step 2: Aggregate daily values
	for _, dv := range input.DailyValues {
		output.TotalGrossTime += dv.GrossTime
		output.TotalNetTime += dv.NetTime
		output.TotalTargetTime += dv.TargetTime
		output.TotalOvertime += dv.Overtime
		output.TotalUndertime += dv.Undertime
		output.TotalBreakTime += dv.BreakTime

		if dv.GrossTime > 0 || dv.NetTime > 0 {
			output.WorkDays++
		}
		if dv.HasError {
			output.DaysWithErrors++
		}
	}

	// Step 3: Calculate flextime change
	output.FlextimeChange = output.TotalOvertime - output.TotalUndertime

	// Step 4: Calculate raw flextime
	output.FlextimeRaw = output.FlextimeStart + output.FlextimeChange

	// Step 5: Apply credit type rules
	if input.EvaluationRules != nil {
		output = applyCreditType(output, *input.EvaluationRules)
	} else {
		// No evaluation: direct transfer
		output.FlextimeCredited = output.FlextimeChange
		output.FlextimeEnd = output.FlextimeRaw
		output.FlextimeForfeited = 0
	}

	return output
}

// applyCreditType implements the 4 ZMI credit types for flextime calculation.
func applyCreditType(output MonthlyCalcOutput, rules MonthlyEvaluationInput) MonthlyCalcOutput {
	switch rules.CreditType {
	case CreditTypeNoEvaluation:
		output.FlextimeCredited = output.FlextimeChange
		output.FlextimeEnd = output.FlextimeRaw
		output.FlextimeForfeited = 0

	case CreditTypeCompleteCarryover:
		credited := output.FlextimeChange

		// Apply monthly cap
		if rules.MaxFlextimePerMonth != nil && credited > *rules.MaxFlextimePerMonth {
			output.FlextimeForfeited = credited - *rules.MaxFlextimePerMonth
			credited = *rules.MaxFlextimePerMonth
			output.Warnings = append(output.Warnings, WarnCodeMonthlyCap)
		}

		output.FlextimeCredited = credited
		output.FlextimeEnd = output.FlextimeStart + credited

		// Apply positive/negative caps
		prevEnd := output.FlextimeEnd
		var forfeited int
		output.FlextimeEnd, forfeited = applyFlextimeCaps(output.FlextimeEnd, rules.FlextimeCapPositive, rules.FlextimeCapNegative)
		output.FlextimeForfeited += forfeited
		if output.FlextimeEnd != prevEnd {
			output.Warnings = append(output.Warnings, WarnCodeFlextimeCapped)
		}

	case CreditTypeAfterThreshold:
		threshold := 0
		if rules.FlextimeThreshold != nil {
			threshold = *rules.FlextimeThreshold
		}

		if output.FlextimeChange > threshold {
			// Above threshold: credit the excess
			output.FlextimeCredited = output.FlextimeChange - threshold
			output.FlextimeForfeited = threshold
		} else if output.FlextimeChange > 0 {
			// Positive but at or below threshold: forfeit all
			output.FlextimeCredited = 0
			output.FlextimeForfeited = output.FlextimeChange
			output.Warnings = append(output.Warnings, WarnCodeBelowThreshold)
		} else {
			// Undertime: fully deduct (no threshold applies to undertime)
			output.FlextimeCredited = output.FlextimeChange
			output.FlextimeForfeited = 0
		}

		// Apply monthly cap
		if rules.MaxFlextimePerMonth != nil && output.FlextimeCredited > *rules.MaxFlextimePerMonth {
			excess := output.FlextimeCredited - *rules.MaxFlextimePerMonth
			output.FlextimeForfeited += excess
			output.FlextimeCredited = *rules.MaxFlextimePerMonth
			output.Warnings = append(output.Warnings, WarnCodeMonthlyCap)
		}

		output.FlextimeEnd = output.FlextimeStart + output.FlextimeCredited

		// Apply positive/negative caps
		prevEnd := output.FlextimeEnd
		var forfeited int
		output.FlextimeEnd, forfeited = applyFlextimeCaps(output.FlextimeEnd, rules.FlextimeCapPositive, rules.FlextimeCapNegative)
		output.FlextimeForfeited += forfeited
		if output.FlextimeEnd != prevEnd {
			output.Warnings = append(output.Warnings, WarnCodeFlextimeCapped)
		}

	case CreditTypeNoCarryover:
		output.FlextimeCredited = 0
		output.FlextimeEnd = 0
		output.FlextimeForfeited = output.FlextimeChange
		output.Warnings = append(output.Warnings, WarnCodeNoCarryover)

	default:
		// Unknown credit type: default to no evaluation (direct transfer)
		output.FlextimeCredited = output.FlextimeChange
		output.FlextimeEnd = output.FlextimeRaw
		output.FlextimeForfeited = 0
	}

	return output
}

// applyFlextimeCaps applies positive and negative balance caps.
// Returns the capped value and additional forfeited amount.
func applyFlextimeCaps(flextime int, capPositive, capNegative *int) (int, int) {
	forfeited := 0

	if capPositive != nil && flextime > *capPositive {
		forfeited = flextime - *capPositive
		flextime = *capPositive
	}

	if capNegative != nil && flextime < -*capNegative {
		flextime = -*capNegative
	}

	return flextime, forfeited
}

// CalculateAnnualCarryover determines the year-end carryover with annual floor.
// If currentBalance is nil, returns 0. If annualFloor is set and the balance is
// below the negative floor, the floor is applied.
func CalculateAnnualCarryover(currentBalance, annualFloor *int) int {
	if currentBalance == nil {
		return 0
	}
	balance := *currentBalance
	if annualFloor != nil && balance < -*annualFloor {
		return -*annualFloor
	}
	return balance
}
