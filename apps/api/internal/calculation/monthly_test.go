package calculation_test

import (
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"

	"github.com/tolga/terp/internal/calculation"
)

// --- Group 1: Daily Value Aggregation ---

func TestCalculateMonth_Aggregation_BasicSums(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 500, NetTime: 470, TargetTime: 480, Overtime: 0, Undertime: 10, BreakTime: 30},
			{Date: "2025-01-02", GrossTime: 540, NetTime: 510, TargetTime: 480, Overtime: 30, Undertime: 0, BreakTime: 30},
			{Date: "2025-01-03", GrossTime: 480, NetTime: 450, TargetTime: 480, Overtime: 0, Undertime: 30, BreakTime: 30},
		},
		PreviousCarryover: 60,
	}

	output := calculation.CalculateMonth(input)

	assert.Equal(t, 1520, output.TotalGrossTime)
	assert.Equal(t, 1430, output.TotalNetTime)
	assert.Equal(t, 1440, output.TotalTargetTime)
	assert.Equal(t, 30, output.TotalOvertime)
	assert.Equal(t, 40, output.TotalUndertime)
	assert.Equal(t, 90, output.TotalBreakTime)
	assert.Equal(t, 3, output.WorkDays)
	assert.Equal(t, 0, output.DaysWithErrors)
}

func TestCalculateMonth_Aggregation_EmptyDays(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues:       []calculation.DailyValueInput{},
		PreviousCarryover: 100,
	}

	output := calculation.CalculateMonth(input)

	assert.Equal(t, 0, output.TotalGrossTime)
	assert.Equal(t, 0, output.TotalNetTime)
	assert.Equal(t, 0, output.TotalTargetTime)
	assert.Equal(t, 0, output.TotalOvertime)
	assert.Equal(t, 0, output.TotalUndertime)
	assert.Equal(t, 0, output.TotalBreakTime)
	assert.Equal(t, 0, output.WorkDays)
	assert.Equal(t, 0, output.DaysWithErrors)
	assert.Equal(t, 100, output.FlextimeStart)
	assert.Equal(t, 0, output.FlextimeChange)
	assert.Equal(t, 100, output.FlextimeRaw)
	assert.Equal(t, 0, output.FlextimeCredited)
	assert.Equal(t, 100, output.FlextimeEnd)
}

func TestCalculateMonth_Aggregation_SingleDay(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 510, NetTime: 480, TargetTime: 480, Overtime: 0, Undertime: 0, BreakTime: 30},
		},
	}

	output := calculation.CalculateMonth(input)

	assert.Equal(t, 510, output.TotalGrossTime)
	assert.Equal(t, 480, output.TotalNetTime)
	assert.Equal(t, 480, output.TotalTargetTime)
	assert.Equal(t, 0, output.TotalOvertime)
	assert.Equal(t, 0, output.TotalUndertime)
	assert.Equal(t, 30, output.TotalBreakTime)
	assert.Equal(t, 1, output.WorkDays)
}

func TestCalculateMonth_WorkDays_OnlyGrossTime(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 480, NetTime: 0},
		},
	}

	output := calculation.CalculateMonth(input)
	assert.Equal(t, 1, output.WorkDays)
}

func TestCalculateMonth_WorkDays_OnlyNetTime(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 0, NetTime: 480},
		},
	}

	output := calculation.CalculateMonth(input)
	assert.Equal(t, 1, output.WorkDays)
}

func TestCalculateMonth_WorkDays_ZeroTimeNotCounted(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 0, NetTime: 0, TargetTime: 480},
		},
	}

	output := calculation.CalculateMonth(input)
	assert.Equal(t, 0, output.WorkDays)
}

func TestCalculateMonth_DaysWithErrors(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 480, NetTime: 450, HasError: true},
			{Date: "2025-01-02", GrossTime: 480, NetTime: 450, HasError: false},
			{Date: "2025-01-03", GrossTime: 480, NetTime: 450, HasError: true},
		},
	}

	output := calculation.CalculateMonth(input)
	assert.Equal(t, 2, output.DaysWithErrors)
	assert.Equal(t, 3, output.WorkDays)
}

// --- Group 2: CreditType NoEvaluation ---

func TestCalculateMonth_CreditTypeNoEvaluation_Overtime(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 510, NetTime: 510, TargetTime: 480, Overtime: 30, Undertime: 0},
		},
		PreviousCarryover: 100,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType: calculation.CreditTypeNoEvaluation,
		},
	}

	output := calculation.CalculateMonth(input)

	assert.Equal(t, 100, output.FlextimeStart)
	assert.Equal(t, 30, output.FlextimeChange)
	assert.Equal(t, 130, output.FlextimeRaw)
	assert.Equal(t, 30, output.FlextimeCredited)
	assert.Equal(t, 130, output.FlextimeEnd)
	assert.Equal(t, 0, output.FlextimeForfeited)
}

func TestCalculateMonth_CreditTypeNoEvaluation_Undertime(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 450, NetTime: 450, TargetTime: 480, Overtime: 0, Undertime: 30},
		},
		PreviousCarryover: 100,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType: calculation.CreditTypeNoEvaluation,
		},
	}

	output := calculation.CalculateMonth(input)

	assert.Equal(t, -30, output.FlextimeChange)
	assert.Equal(t, 70, output.FlextimeRaw)
	assert.Equal(t, -30, output.FlextimeCredited)
	assert.Equal(t, 70, output.FlextimeEnd)
	assert.Equal(t, 0, output.FlextimeForfeited)
}

func TestCalculateMonth_CreditTypeNoEvaluation_Mixed(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 510, NetTime: 510, TargetTime: 480, Overtime: 30, Undertime: 0},
			{Date: "2025-01-02", GrossTime: 440, NetTime: 440, TargetTime: 480, Overtime: 0, Undertime: 40},
		},
		PreviousCarryover: 50,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType: calculation.CreditTypeNoEvaluation,
		},
	}

	output := calculation.CalculateMonth(input)

	assert.Equal(t, -10, output.FlextimeChange) // 30 - 40
	assert.Equal(t, 40, output.FlextimeRaw)     // 50 + (-10)
	assert.Equal(t, -10, output.FlextimeCredited)
	assert.Equal(t, 40, output.FlextimeEnd)
	assert.Equal(t, 0, output.FlextimeForfeited)
}

// --- Group 3: CreditType CompleteCarryover ---

func TestCalculateMonth_CompleteCarryover_NoCaps(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 540, NetTime: 540, TargetTime: 480, Overtime: 60, Undertime: 0},
		},
		PreviousCarryover: 100,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType: calculation.CreditTypeCompleteCarryover,
		},
	}

	output := calculation.CalculateMonth(input)

	assert.Equal(t, 60, output.FlextimeCredited)
	assert.Equal(t, 160, output.FlextimeEnd)
	assert.Equal(t, 0, output.FlextimeForfeited)
	assert.Empty(t, output.Warnings)
}

func TestCalculateMonth_CompleteCarryover_MonthlyCap(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 600, NetTime: 600, TargetTime: 480, Overtime: 120, Undertime: 0},
		},
		PreviousCarryover: 0,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType:          calculation.CreditTypeCompleteCarryover,
			MaxFlextimePerMonth: intPtr(60),
		},
	}

	output := calculation.CalculateMonth(input)

	assert.Equal(t, 60, output.FlextimeCredited)
	assert.Equal(t, 60, output.FlextimeEnd)
	assert.Equal(t, 60, output.FlextimeForfeited)
	assert.Contains(t, output.Warnings, calculation.WarnCodeMonthlyCap)
}

func TestCalculateMonth_CompleteCarryover_PositiveCap(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 540, NetTime: 540, TargetTime: 480, Overtime: 60, Undertime: 0},
		},
		PreviousCarryover: 150,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType:          calculation.CreditTypeCompleteCarryover,
			FlextimeCapPositive: intPtr(200),
		},
	}

	output := calculation.CalculateMonth(input)

	// Without cap: 150 + 60 = 210, but capped at 200
	assert.Equal(t, 60, output.FlextimeCredited)
	assert.Equal(t, 200, output.FlextimeEnd)
	assert.Equal(t, 10, output.FlextimeForfeited)
	assert.Contains(t, output.Warnings, calculation.WarnCodeFlextimeCapped)
}

func TestCalculateMonth_CompleteCarryover_NegativeCap(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 400, NetTime: 400, TargetTime: 480, Overtime: 0, Undertime: 80},
		},
		PreviousCarryover: -50,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType:          calculation.CreditTypeCompleteCarryover,
			FlextimeCapNegative: intPtr(100),
		},
	}

	output := calculation.CalculateMonth(input)

	// Without cap: -50 + (-80) = -130, but capped at -100
	assert.Equal(t, -80, output.FlextimeCredited)
	assert.Equal(t, -100, output.FlextimeEnd)
	assert.Contains(t, output.Warnings, calculation.WarnCodeFlextimeCapped)
}

func TestCalculateMonth_CompleteCarryover_BothCaps(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 600, NetTime: 600, TargetTime: 480, Overtime: 120, Undertime: 0},
		},
		PreviousCarryover: 150,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType:          calculation.CreditTypeCompleteCarryover,
			FlextimeCapPositive: intPtr(200),
			FlextimeCapNegative: intPtr(100),
		},
	}

	output := calculation.CalculateMonth(input)

	// 150 + 120 = 270, capped at 200
	assert.Equal(t, 120, output.FlextimeCredited)
	assert.Equal(t, 200, output.FlextimeEnd)
	assert.Equal(t, 70, output.FlextimeForfeited) // 270 - 200
	assert.Contains(t, output.Warnings, calculation.WarnCodeFlextimeCapped)
}

func TestCalculateMonth_CompleteCarryover_Undertime(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 420, NetTime: 420, TargetTime: 480, Overtime: 0, Undertime: 60},
		},
		PreviousCarryover: 200,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType:          calculation.CreditTypeCompleteCarryover,
			FlextimeCapPositive: intPtr(300),
		},
	}

	output := calculation.CalculateMonth(input)

	assert.Equal(t, -60, output.FlextimeCredited)
	assert.Equal(t, 140, output.FlextimeEnd) // 200 + (-60)
	assert.Equal(t, 0, output.FlextimeForfeited)
	assert.Empty(t, output.Warnings)
}

// --- Group 4: CreditType AfterThreshold ---

func TestCalculateMonth_AfterThreshold_AboveThreshold(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 540, NetTime: 540, TargetTime: 480, Overtime: 60, Undertime: 0},
		},
		PreviousCarryover: 100,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType:        calculation.CreditTypeAfterThreshold,
			FlextimeThreshold: intPtr(20),
		},
	}

	output := calculation.CalculateMonth(input)

	assert.Equal(t, 40, output.FlextimeCredited)  // 60 - 20
	assert.Equal(t, 20, output.FlextimeForfeited) // threshold amount
	assert.Equal(t, 140, output.FlextimeEnd)      // 100 + 40
}

func TestCalculateMonth_AfterThreshold_AtThreshold(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 500, NetTime: 500, TargetTime: 480, Overtime: 20, Undertime: 0},
		},
		PreviousCarryover: 100,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType:        calculation.CreditTypeAfterThreshold,
			FlextimeThreshold: intPtr(20),
		},
	}

	output := calculation.CalculateMonth(input)

	// At threshold: 20 == 20, so FlextimeChange (20) > 0 but <= threshold
	assert.Equal(t, 0, output.FlextimeCredited)
	assert.Equal(t, 20, output.FlextimeForfeited)
	assert.Equal(t, 100, output.FlextimeEnd) // unchanged
	assert.Contains(t, output.Warnings, calculation.WarnCodeBelowThreshold)
}

func TestCalculateMonth_AfterThreshold_BelowThreshold(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 490, NetTime: 490, TargetTime: 480, Overtime: 10, Undertime: 0},
		},
		PreviousCarryover: 100,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType:        calculation.CreditTypeAfterThreshold,
			FlextimeThreshold: intPtr(30),
		},
	}

	output := calculation.CalculateMonth(input)

	assert.Equal(t, 0, output.FlextimeCredited)
	assert.Equal(t, 10, output.FlextimeForfeited)
	assert.Equal(t, 100, output.FlextimeEnd)
	assert.Contains(t, output.Warnings, calculation.WarnCodeBelowThreshold)
}

func TestCalculateMonth_AfterThreshold_Undertime(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 440, NetTime: 440, TargetTime: 480, Overtime: 0, Undertime: 40},
		},
		PreviousCarryover: 100,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType:        calculation.CreditTypeAfterThreshold,
			FlextimeThreshold: intPtr(20),
		},
	}

	output := calculation.CalculateMonth(input)

	// Undertime: fully deducted regardless of threshold
	assert.Equal(t, -40, output.FlextimeCredited)
	assert.Equal(t, 0, output.FlextimeForfeited)
	assert.Equal(t, 60, output.FlextimeEnd) // 100 + (-40)
}

func TestCalculateMonth_AfterThreshold_NilThreshold(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 540, NetTime: 540, TargetTime: 480, Overtime: 60, Undertime: 0},
		},
		PreviousCarryover: 50,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType:        calculation.CreditTypeAfterThreshold,
			FlextimeThreshold: nil, // defaults to 0
		},
	}

	output := calculation.CalculateMonth(input)

	// Nil threshold defaults to 0, so all overtime is above threshold
	assert.Equal(t, 60, output.FlextimeCredited)
	assert.Equal(t, 0, output.FlextimeForfeited)
	assert.Equal(t, 110, output.FlextimeEnd)
}

func TestCalculateMonth_AfterThreshold_WithCaps(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 600, NetTime: 600, TargetTime: 480, Overtime: 120, Undertime: 0},
		},
		PreviousCarryover: 180,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType:          calculation.CreditTypeAfterThreshold,
			FlextimeThreshold:   intPtr(20),
			FlextimeCapPositive: intPtr(200),
		},
	}

	output := calculation.CalculateMonth(input)

	// FlextimeChange = 120, threshold = 20, credited = 100, forfeited from threshold = 20
	// FlextimeEnd = 180 + 100 = 280, capped at 200, additional forfeited = 80
	assert.Equal(t, 100, output.FlextimeCredited)
	assert.Equal(t, 200, output.FlextimeEnd)
	assert.Equal(t, 100, output.FlextimeForfeited) // 20 (threshold) + 80 (cap)
	assert.Contains(t, output.Warnings, calculation.WarnCodeFlextimeCapped)
}

// --- Group 5: CreditType NoCarryover ---

func TestCalculateMonth_NoCarryover_Overtime(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 540, NetTime: 540, TargetTime: 480, Overtime: 60, Undertime: 0},
		},
		PreviousCarryover: 100,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType: calculation.CreditTypeNoCarryover,
		},
	}

	output := calculation.CalculateMonth(input)

	assert.Equal(t, 0, output.FlextimeCredited)
	assert.Equal(t, 0, output.FlextimeEnd)
	assert.Equal(t, 60, output.FlextimeForfeited)
	assert.Contains(t, output.Warnings, calculation.WarnCodeNoCarryover)
}

func TestCalculateMonth_NoCarryover_Undertime(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 440, NetTime: 440, TargetTime: 480, Overtime: 0, Undertime: 40},
		},
		PreviousCarryover: 100,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType: calculation.CreditTypeNoCarryover,
		},
	}

	output := calculation.CalculateMonth(input)

	assert.Equal(t, 0, output.FlextimeCredited)
	assert.Equal(t, 0, output.FlextimeEnd)
	assert.Equal(t, -40, output.FlextimeForfeited) // Undertime change
	assert.Contains(t, output.Warnings, calculation.WarnCodeNoCarryover)
}

func TestCalculateMonth_NoCarryover_WithPreviousBalance(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 480, NetTime: 480, TargetTime: 480, Overtime: 0, Undertime: 0},
		},
		PreviousCarryover: 500,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType: calculation.CreditTypeNoCarryover,
		},
	}

	output := calculation.CalculateMonth(input)

	assert.Equal(t, 500, output.FlextimeStart)
	assert.Equal(t, 0, output.FlextimeCredited)
	assert.Equal(t, 0, output.FlextimeEnd) // Previous balance irrelevant
	assert.Equal(t, 0, output.FlextimeForfeited)
}

// --- Group 6: Edge Cases ---

func TestCalculateMonth_NilEvaluationRules(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 540, NetTime: 540, TargetTime: 480, Overtime: 60, Undertime: 0},
		},
		PreviousCarryover: 50,
		EvaluationRules:   nil,
	}

	output := calculation.CalculateMonth(input)

	// nil rules = no evaluation (direct transfer)
	assert.Equal(t, 60, output.FlextimeCredited)
	assert.Equal(t, 110, output.FlextimeEnd)
	assert.Equal(t, 0, output.FlextimeForfeited)
}

func TestCalculateMonth_UnknownCreditType(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 540, NetTime: 540, TargetTime: 480, Overtime: 60, Undertime: 0},
		},
		PreviousCarryover: 50,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType: calculation.CreditType("unknown_type"),
		},
	}

	output := calculation.CalculateMonth(input)

	// Unknown credit type defaults to no evaluation
	assert.Equal(t, 60, output.FlextimeCredited)
	assert.Equal(t, 110, output.FlextimeEnd)
	assert.Equal(t, 0, output.FlextimeForfeited)
}

func TestCalculateMonth_ZeroPreviousCarryover(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 540, NetTime: 540, TargetTime: 480, Overtime: 60, Undertime: 0},
		},
		PreviousCarryover: 0,
	}

	output := calculation.CalculateMonth(input)

	assert.Equal(t, 0, output.FlextimeStart)
	assert.Equal(t, 60, output.FlextimeEnd)
}

func TestCalculateMonth_NegativePreviousCarryover(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 540, NetTime: 540, TargetTime: 480, Overtime: 60, Undertime: 0},
		},
		PreviousCarryover: -30,
	}

	output := calculation.CalculateMonth(input)

	assert.Equal(t, -30, output.FlextimeStart)
	assert.Equal(t, 60, output.FlextimeChange)
	assert.Equal(t, 30, output.FlextimeRaw) // -30 + 60
	assert.Equal(t, 30, output.FlextimeEnd)
}

func TestCalculateMonth_LargePreviousCarryover(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 540, NetTime: 540, TargetTime: 480, Overtime: 60, Undertime: 0},
		},
		PreviousCarryover: 1000,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType:          calculation.CreditTypeCompleteCarryover,
			FlextimeCapPositive: intPtr(500),
		},
	}

	output := calculation.CalculateMonth(input)

	// 1000 + 60 = 1060, capped at 500
	assert.Equal(t, 60, output.FlextimeCredited)
	assert.Equal(t, 500, output.FlextimeEnd)
	assert.Equal(t, 560, output.FlextimeForfeited) // 1060 - 500
	assert.Contains(t, output.Warnings, calculation.WarnCodeFlextimeCapped)
}

// --- Group 7: Absence Summary ---

func TestCalculateMonth_AbsenceSummary_PassThrough(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{},
		AbsenceSummary: calculation.AbsenceSummaryInput{
			VacationDays:     decimal.NewFromInt(5),
			SickDays:         3,
			OtherAbsenceDays: 2,
		},
	}

	output := calculation.CalculateMonth(input)

	assert.True(t, decimal.NewFromInt(5).Equal(output.VacationTaken))
	assert.Equal(t, 3, output.SickDays)
	assert.Equal(t, 2, output.OtherAbsenceDays)
}

func TestCalculateMonth_AbsenceSummary_HalfDayVacation(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{},
		AbsenceSummary: calculation.AbsenceSummaryInput{
			VacationDays: decimalFromFloat(2.5),
		},
	}

	output := calculation.CalculateMonth(input)

	assert.True(t, decimalFromFloat(2.5).Equal(output.VacationTaken))
}

// --- Group 8: Warnings ---

func TestCalculateMonth_Warnings_MonthlyCap(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 600, NetTime: 600, TargetTime: 480, Overtime: 120, Undertime: 0},
		},
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType:          calculation.CreditTypeCompleteCarryover,
			MaxFlextimePerMonth: intPtr(60),
		},
	}

	output := calculation.CalculateMonth(input)
	assert.Contains(t, output.Warnings, calculation.WarnCodeMonthlyCap)
}

func TestCalculateMonth_Warnings_FlextimeCapped(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 600, NetTime: 600, TargetTime: 480, Overtime: 120, Undertime: 0},
		},
		PreviousCarryover: 100,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType:          calculation.CreditTypeCompleteCarryover,
			FlextimeCapPositive: intPtr(150),
		},
	}

	output := calculation.CalculateMonth(input)
	assert.Contains(t, output.Warnings, calculation.WarnCodeFlextimeCapped)
}

func TestCalculateMonth_Warnings_BelowThreshold(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 490, NetTime: 490, TargetTime: 480, Overtime: 10, Undertime: 0},
		},
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType:        calculation.CreditTypeAfterThreshold,
			FlextimeThreshold: intPtr(30),
		},
	}

	output := calculation.CalculateMonth(input)
	assert.Contains(t, output.Warnings, calculation.WarnCodeBelowThreshold)
}

func TestCalculateMonth_Warnings_NoCarryover(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 540, NetTime: 540, TargetTime: 480, Overtime: 60, Undertime: 0},
		},
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType: calculation.CreditTypeNoCarryover,
		},
	}

	output := calculation.CalculateMonth(input)
	assert.Contains(t, output.Warnings, calculation.WarnCodeNoCarryover)
}

func TestCalculateMonth_Warnings_EmptyByDefault(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 480, NetTime: 480, TargetTime: 480, Overtime: 0, Undertime: 0},
		},
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType: calculation.CreditTypeCompleteCarryover,
		},
	}

	output := calculation.CalculateMonth(input)
	assert.Empty(t, output.Warnings)
}

// --- Group 9: CalculateAnnualCarryover ---

func TestCalculateAnnualCarryover_NilBalance(t *testing.T) {
	result := calculation.CalculateAnnualCarryover(nil, nil)
	assert.Equal(t, 0, result)
}

func TestCalculateAnnualCarryover_PositiveNoFloor(t *testing.T) {
	balance := 200
	result := calculation.CalculateAnnualCarryover(&balance, nil)
	assert.Equal(t, 200, result)
}

func TestCalculateAnnualCarryover_NegativeAboveFloor(t *testing.T) {
	balance := -50
	floor := 100
	result := calculation.CalculateAnnualCarryover(&balance, &floor)
	assert.Equal(t, -50, result) // -50 > -100, so no floor applied
}

func TestCalculateAnnualCarryover_NegativeBelowFloor(t *testing.T) {
	balance := -150
	floor := 100
	result := calculation.CalculateAnnualCarryover(&balance, &floor)
	assert.Equal(t, -100, result) // -150 < -100, so floor applied
}

func TestCalculateAnnualCarryover_NilFloor(t *testing.T) {
	balance := -500
	result := calculation.CalculateAnnualCarryover(&balance, nil)
	assert.Equal(t, -500, result)
}

// --- Group 10: applyFlextimeCaps (tested through CalculateMonth) ---

func TestCalculateMonth_Caps_NoCapsApplied(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 540, NetTime: 540, TargetTime: 480, Overtime: 60, Undertime: 0},
		},
		PreviousCarryover: 50,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType:          calculation.CreditTypeCompleteCarryover,
			FlextimeCapPositive: intPtr(200),
			FlextimeCapNegative: intPtr(100),
		},
	}

	output := calculation.CalculateMonth(input)

	// 50 + 60 = 110, within both caps
	assert.Equal(t, 110, output.FlextimeEnd)
	assert.Equal(t, 0, output.FlextimeForfeited)
	assert.Empty(t, output.Warnings)
}

func TestCalculateMonth_Caps_PositiveCapExceeded(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 600, NetTime: 600, TargetTime: 480, Overtime: 120, Undertime: 0},
		},
		PreviousCarryover: 150,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType:          calculation.CreditTypeCompleteCarryover,
			FlextimeCapPositive: intPtr(200),
		},
	}

	output := calculation.CalculateMonth(input)

	// 150 + 120 = 270, capped at 200
	assert.Equal(t, 200, output.FlextimeEnd)
	assert.Equal(t, 70, output.FlextimeForfeited)
	assert.Contains(t, output.Warnings, calculation.WarnCodeFlextimeCapped)
}

func TestCalculateMonth_Caps_NegativeCapExceeded(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 300, NetTime: 300, TargetTime: 480, Overtime: 0, Undertime: 180},
		},
		PreviousCarryover: -50,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType:          calculation.CreditTypeCompleteCarryover,
			FlextimeCapNegative: intPtr(100),
		},
	}

	output := calculation.CalculateMonth(input)

	// -50 + (-180) = -230, capped at -100
	assert.Equal(t, -100, output.FlextimeEnd)
	assert.Contains(t, output.Warnings, calculation.WarnCodeFlextimeCapped)
}

func TestCalculateMonth_Caps_BothCapsNil(t *testing.T) {
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 1000, NetTime: 1000, TargetTime: 480, Overtime: 520, Undertime: 0},
		},
		PreviousCarryover: 5000,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType: calculation.CreditTypeCompleteCarryover,
		},
	}

	output := calculation.CalculateMonth(input)

	// No caps at all: 5000 + 520 = 5520
	assert.Equal(t, 5520, output.FlextimeEnd)
	assert.Equal(t, 0, output.FlextimeForfeited)
	assert.Empty(t, output.Warnings)
}

// --- Ticket Test Case Pack ---

func TestCalculateMonth_TicketCase1_CompleteCarryover(t *testing.T) {
	// Ticket: overtime=600min (10hrs), monthly_cap=480min (8hrs)
	// Expected: credited=480, forfeited=120
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 1080, NetTime: 1080, TargetTime: 480, Overtime: 600, Undertime: 0},
		},
		PreviousCarryover: 0,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType:          calculation.CreditTypeCompleteCarryover,
			MaxFlextimePerMonth: intPtr(480),
		},
	}

	output := calculation.CalculateMonth(input)

	assert.Equal(t, 480, output.FlextimeCredited)
	assert.Equal(t, 120, output.FlextimeForfeited)
	assert.Equal(t, 480, output.FlextimeEnd)
	assert.Contains(t, output.Warnings, calculation.WarnCodeMonthlyCap)
}

func TestCalculateMonth_TicketCase2_AfterThreshold(t *testing.T) {
	// Ticket: overtime=300min (5hrs), threshold=120min (2hrs)
	// Expected: credited=180, forfeited=120
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 780, NetTime: 780, TargetTime: 480, Overtime: 300, Undertime: 0},
		},
		PreviousCarryover: 0,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType:        calculation.CreditTypeAfterThreshold,
			FlextimeThreshold: intPtr(120),
		},
	}

	output := calculation.CalculateMonth(input)

	assert.Equal(t, 180, output.FlextimeCredited)
	assert.Equal(t, 120, output.FlextimeForfeited) // threshold amount
	assert.Equal(t, 180, output.FlextimeEnd)
}
