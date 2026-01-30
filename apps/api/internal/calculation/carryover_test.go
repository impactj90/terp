package calculation_test

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"

	"github.com/tolga/terp/internal/calculation"
)

func TestCalculateCarryoverWithCapping_NoRules(t *testing.T) {
	input := calculation.CarryoverInput{
		AvailableDays: decimal.NewFromFloat(15.0),
		Year:          2025,
		ReferenceDate: time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
	}

	result := calculation.CalculateCarryoverWithCapping(input)

	assert.True(t, decimal.NewFromFloat(15.0).Equal(result.CappedCarryover), "no rules: carryover should equal available")
	assert.True(t, decimal.Zero.Equal(result.ForfeitedDays), "no rules: nothing forfeited")
	assert.Empty(t, result.RulesApplied)
	assert.False(t, result.HasException)
}

func TestCalculateCarryoverWithCapping_ZeroAvailable(t *testing.T) {
	input := calculation.CarryoverInput{
		AvailableDays: decimal.Zero,
		Year:          2025,
		ReferenceDate: time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		CappingRules: []calculation.CappingRuleInput{
			{RuleID: "rule-1", RuleName: "Year End Cap", RuleType: "year_end", CapValue: decimal.NewFromFloat(10.0)},
		},
	}

	result := calculation.CalculateCarryoverWithCapping(input)

	assert.True(t, decimal.Zero.Equal(result.CappedCarryover), "zero available: carryover should be 0")
	assert.True(t, decimal.Zero.Equal(result.ForfeitedDays), "zero available: nothing forfeited")
}

func TestCalculateCarryoverWithCapping_NegativeAvailable(t *testing.T) {
	input := calculation.CarryoverInput{
		AvailableDays: decimal.NewFromFloat(-5.0),
		Year:          2025,
		ReferenceDate: time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		CappingRules: []calculation.CappingRuleInput{
			{RuleID: "rule-1", RuleName: "Year End Cap", RuleType: "year_end", CapValue: decimal.NewFromFloat(10.0)},
		},
	}

	result := calculation.CalculateCarryoverWithCapping(input)

	assert.True(t, decimal.Zero.Equal(result.CappedCarryover), "negative available: carryover should be 0")
}

func TestCalculateCarryoverWithCapping_YearEndRule(t *testing.T) {
	tests := []struct {
		name              string
		availableDays     float64
		capValue          float64
		expectedCarryover float64
		expectedForfeited float64
		expectedApplied   bool
	}{
		{
			name:              "carryover exceeds cap",
			availableDays:     20.0,
			capValue:          10.0,
			expectedCarryover: 10.0,
			expectedForfeited: 10.0,
			expectedApplied:   true,
		},
		{
			name:              "carryover equals cap",
			availableDays:     10.0,
			capValue:          10.0,
			expectedCarryover: 10.0,
			expectedForfeited: 0.0,
			expectedApplied:   false,
		},
		{
			name:              "carryover below cap",
			availableDays:     5.0,
			capValue:          10.0,
			expectedCarryover: 5.0,
			expectedForfeited: 0.0,
			expectedApplied:   false,
		},
		{
			name:              "cap value zero forfeits all",
			availableDays:     15.0,
			capValue:          0.0,
			expectedCarryover: 0.0,
			expectedForfeited: 15.0,
			expectedApplied:   true,
		},
		{
			name:              "fractional days",
			availableDays:     12.5,
			capValue:          10.0,
			expectedCarryover: 10.0,
			expectedForfeited: 2.5,
			expectedApplied:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			input := calculation.CarryoverInput{
				AvailableDays: decimal.NewFromFloat(tt.availableDays),
				Year:          2025,
				ReferenceDate: time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
				CappingRules: []calculation.CappingRuleInput{
					{
						RuleID:   "rule-1",
						RuleName: "Year End Cap",
						RuleType: "year_end",
						CapValue: decimal.NewFromFloat(tt.capValue),
					},
				},
			}

			result := calculation.CalculateCarryoverWithCapping(input)

			assert.True(t, decimal.NewFromFloat(tt.expectedCarryover).Equal(result.CappedCarryover),
				"expected carryover %v, got %v", tt.expectedCarryover, result.CappedCarryover)
			assert.True(t, decimal.NewFromFloat(tt.expectedForfeited).Equal(result.ForfeitedDays),
				"expected forfeited %v, got %v", tt.expectedForfeited, result.ForfeitedDays)
			assert.Len(t, result.RulesApplied, 1)
			assert.Equal(t, tt.expectedApplied, result.RulesApplied[0].Applied)
		})
	}
}

func TestCalculateCarryoverWithCapping_MidYearRule(t *testing.T) {
	tests := []struct {
		name              string
		availableDays     float64
		capValue          float64
		cutoffMonth       int
		cutoffDay         int
		referenceDate     time.Time
		expectedCarryover float64
		expectedForfeited float64
		expectedApplied   bool
	}{
		{
			name:              "reference date before cutoff - rule not applied",
			availableDays:     20.0,
			capValue:          10.0,
			cutoffMonth:       3,
			cutoffDay:         31,
			referenceDate:     time.Date(2026, 2, 15, 0, 0, 0, 0, time.UTC),
			expectedCarryover: 20.0,
			expectedForfeited: 0.0,
			expectedApplied:   false,
		},
		{
			name:              "reference date on cutoff - rule not applied",
			availableDays:     20.0,
			capValue:          10.0,
			cutoffMonth:       3,
			cutoffDay:         31,
			referenceDate:     time.Date(2026, 3, 31, 0, 0, 0, 0, time.UTC),
			expectedCarryover: 20.0,
			expectedForfeited: 0.0,
			expectedApplied:   false,
		},
		{
			name:              "reference date after cutoff - rule applied, carryover capped",
			availableDays:     20.0,
			capValue:          10.0,
			cutoffMonth:       3,
			cutoffDay:         31,
			referenceDate:     time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC),
			expectedCarryover: 10.0,
			expectedForfeited: 10.0,
			expectedApplied:   true,
		},
		{
			name:              "reference date after cutoff but under cap - rule not applied",
			availableDays:     5.0,
			capValue:          10.0,
			cutoffMonth:       3,
			cutoffDay:         31,
			referenceDate:     time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC),
			expectedCarryover: 5.0,
			expectedForfeited: 0.0,
			expectedApplied:   false,
		},
		{
			name:              "mid-year cap zero forfeits all after cutoff",
			availableDays:     15.0,
			capValue:          0.0,
			cutoffMonth:       3,
			cutoffDay:         31,
			referenceDate:     time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC),
			expectedCarryover: 0.0,
			expectedForfeited: 15.0,
			expectedApplied:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			input := calculation.CarryoverInput{
				AvailableDays: decimal.NewFromFloat(tt.availableDays),
				Year:          2025,
				ReferenceDate: tt.referenceDate,
				CappingRules: []calculation.CappingRuleInput{
					{
						RuleID:      "rule-mid",
						RuleName:    "Mid Year Cap",
						RuleType:    "mid_year",
						CutoffMonth: tt.cutoffMonth,
						CutoffDay:   tt.cutoffDay,
						CapValue:    decimal.NewFromFloat(tt.capValue),
					},
				},
			}

			result := calculation.CalculateCarryoverWithCapping(input)

			assert.True(t, decimal.NewFromFloat(tt.expectedCarryover).Equal(result.CappedCarryover),
				"expected carryover %v, got %v", tt.expectedCarryover, result.CappedCarryover)
			assert.True(t, decimal.NewFromFloat(tt.expectedForfeited).Equal(result.ForfeitedDays),
				"expected forfeited %v, got %v", tt.expectedForfeited, result.ForfeitedDays)
			assert.Equal(t, tt.expectedApplied, result.RulesApplied[0].Applied)
		})
	}
}

func TestCalculateCarryoverWithCapping_MultipleRules(t *testing.T) {
	// Year-end cap at 15, mid-year cap at 10 (cutoff March 31)
	// Available: 20 days, reference after cutoff
	input := calculation.CarryoverInput{
		AvailableDays: decimal.NewFromFloat(20.0),
		Year:          2025,
		ReferenceDate: time.Date(2026, 4, 15, 0, 0, 0, 0, time.UTC),
		CappingRules: []calculation.CappingRuleInput{
			{
				RuleID:   "rule-ye",
				RuleName: "Year End Cap 15",
				RuleType: "year_end",
				CapValue: decimal.NewFromFloat(15.0),
			},
			{
				RuleID:      "rule-my",
				RuleName:    "Mid Year Cap 10",
				RuleType:    "mid_year",
				CutoffMonth: 3,
				CutoffDay:   31,
				CapValue:    decimal.NewFromFloat(10.0),
			},
		},
	}

	result := calculation.CalculateCarryoverWithCapping(input)

	// Year-end applied first: 20 -> 15, then mid-year: 15 -> 10
	assert.True(t, decimal.NewFromFloat(10.0).Equal(result.CappedCarryover),
		"expected carryover 10, got %v", result.CappedCarryover)
	assert.True(t, decimal.NewFromFloat(10.0).Equal(result.ForfeitedDays),
		"expected forfeited 10, got %v", result.ForfeitedDays)
	assert.Len(t, result.RulesApplied, 2)
	assert.True(t, result.RulesApplied[0].Applied, "year_end rule should be applied")
	assert.True(t, result.RulesApplied[1].Applied, "mid_year rule should be applied")
}

func TestCalculateCarryoverWithCapping_FullException(t *testing.T) {
	input := calculation.CarryoverInput{
		AvailableDays: decimal.NewFromFloat(20.0),
		Year:          2025,
		ReferenceDate: time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		CappingRules: []calculation.CappingRuleInput{
			{
				RuleID:   "rule-1",
				RuleName: "Year End Cap",
				RuleType: "year_end",
				CapValue: decimal.NewFromFloat(10.0),
			},
		},
		Exceptions: []calculation.CappingExceptionInput{
			{
				CappingRuleID: "rule-1",
				ExemptionType: "full",
			},
		},
	}

	result := calculation.CalculateCarryoverWithCapping(input)

	assert.True(t, decimal.NewFromFloat(20.0).Equal(result.CappedCarryover),
		"full exception: carryover should remain at available days")
	assert.True(t, decimal.Zero.Equal(result.ForfeitedDays),
		"full exception: nothing forfeited")
	assert.True(t, result.HasException)
	assert.Len(t, result.RulesApplied, 1)
	assert.False(t, result.RulesApplied[0].Applied, "rule should not be applied due to full exception")
	assert.True(t, result.RulesApplied[0].ExceptionActive)
}

func TestCalculateCarryoverWithCapping_PartialException(t *testing.T) {
	retainDays := decimal.NewFromFloat(15.0)
	input := calculation.CarryoverInput{
		AvailableDays: decimal.NewFromFloat(20.0),
		Year:          2025,
		ReferenceDate: time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		CappingRules: []calculation.CappingRuleInput{
			{
				RuleID:   "rule-1",
				RuleName: "Year End Cap",
				RuleType: "year_end",
				CapValue: decimal.NewFromFloat(10.0),
			},
		},
		Exceptions: []calculation.CappingExceptionInput{
			{
				CappingRuleID: "rule-1",
				ExemptionType: "partial",
				RetainDays:    &retainDays,
			},
		},
	}

	result := calculation.CalculateCarryoverWithCapping(input)

	// Partial exception with RetainDays=15 > CapValue=10, so use 15 as effective cap
	// 20 > 15, so cap to 15
	assert.True(t, decimal.NewFromFloat(15.0).Equal(result.CappedCarryover),
		"partial exception: carryover should be capped to retain_days (15)")
	assert.True(t, decimal.NewFromFloat(5.0).Equal(result.ForfeitedDays),
		"partial exception: 5 days forfeited (20-15)")
	assert.True(t, result.HasException)
	assert.True(t, result.RulesApplied[0].Applied)
	assert.True(t, result.RulesApplied[0].ExceptionActive)
}

func TestCalculateCarryoverWithCapping_PartialExceptionBelowCap(t *testing.T) {
	// When RetainDays is less than or equal to CapValue, the standard rule applies
	retainDays := decimal.NewFromFloat(5.0)
	input := calculation.CarryoverInput{
		AvailableDays: decimal.NewFromFloat(20.0),
		Year:          2025,
		ReferenceDate: time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		CappingRules: []calculation.CappingRuleInput{
			{
				RuleID:   "rule-1",
				RuleName: "Year End Cap",
				RuleType: "year_end",
				CapValue: decimal.NewFromFloat(10.0),
			},
		},
		Exceptions: []calculation.CappingExceptionInput{
			{
				CappingRuleID: "rule-1",
				ExemptionType: "partial",
				RetainDays:    &retainDays,
			},
		},
	}

	result := calculation.CalculateCarryoverWithCapping(input)

	// RetainDays=5 <= CapValue=10, so the normal rule applies: cap to 10
	assert.True(t, decimal.NewFromFloat(10.0).Equal(result.CappedCarryover),
		"partial exception below cap: standard rule should apply, carryover=10")
	assert.True(t, decimal.NewFromFloat(10.0).Equal(result.ForfeitedDays),
		"partial exception below cap: 10 days forfeited (20-10)")
}

func TestCalculateCarryoverWithCapping_ExceptionOnlyAppliesMatchingRule(t *testing.T) {
	// Exception for rule-2 but not rule-1
	input := calculation.CarryoverInput{
		AvailableDays: decimal.NewFromFloat(20.0),
		Year:          2025,
		ReferenceDate: time.Date(2026, 4, 15, 0, 0, 0, 0, time.UTC),
		CappingRules: []calculation.CappingRuleInput{
			{
				RuleID:   "rule-1",
				RuleName: "Year End Cap",
				RuleType: "year_end",
				CapValue: decimal.NewFromFloat(15.0),
			},
			{
				RuleID:      "rule-2",
				RuleName:    "Mid Year Cap",
				RuleType:    "mid_year",
				CutoffMonth: 3,
				CutoffDay:   31,
				CapValue:    decimal.NewFromFloat(5.0),
			},
		},
		Exceptions: []calculation.CappingExceptionInput{
			{
				CappingRuleID: "rule-2",
				ExemptionType: "full",
			},
		},
	}

	result := calculation.CalculateCarryoverWithCapping(input)

	// Rule-1 applied: 20 -> 15
	// Rule-2 has full exception: skip
	assert.True(t, decimal.NewFromFloat(15.0).Equal(result.CappedCarryover),
		"exception on rule-2 only: carryover should be capped by rule-1 to 15")
	assert.True(t, decimal.NewFromFloat(5.0).Equal(result.ForfeitedDays))
	assert.True(t, result.HasException)
	assert.True(t, result.RulesApplied[0].Applied)
	assert.False(t, result.RulesApplied[0].ExceptionActive)
	assert.False(t, result.RulesApplied[1].Applied)
	assert.True(t, result.RulesApplied[1].ExceptionActive)
}

func TestCalculateCarryoverWithCapping_MidYearCutoffBeforeReference(t *testing.T) {
	// Cutoff is June 30. Reference is May 15. Rule should NOT apply.
	input := calculation.CarryoverInput{
		AvailableDays: decimal.NewFromFloat(20.0),
		Year:          2025,
		ReferenceDate: time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC),
		CappingRules: []calculation.CappingRuleInput{
			{
				RuleID:      "rule-mid",
				RuleName:    "Mid Year June",
				RuleType:    "mid_year",
				CutoffMonth: 6,
				CutoffDay:   30,
				CapValue:    decimal.NewFromFloat(10.0),
			},
		},
	}

	result := calculation.CalculateCarryoverWithCapping(input)

	assert.True(t, decimal.NewFromFloat(20.0).Equal(result.CappedCarryover),
		"mid-year cutoff not reached: carryover should remain unchanged")
	assert.False(t, result.RulesApplied[0].Applied)
}
