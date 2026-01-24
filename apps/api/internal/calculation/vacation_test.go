package calculation_test

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"

	"github.com/tolga/terp/internal/calculation"
)

func decimalFromFloat(f float64) decimal.Decimal {
	return decimal.NewFromFloat(f)
}

func dateOf(year int, month time.Month, day int) time.Time {
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

func timePtr(t time.Time) *time.Time {
	return &t
}

func TestCalculateVacation_BasicFullYear(t *testing.T) {
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1990, time.January, 1),
		EntryDate:           dateOf(2020, time.January, 1),
		WeeklyHours:         decimalFromFloat(40),
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisCalendarYear,
		Year:                2025,
		ReferenceDate:       dateOf(2025, time.January, 1),
	}

	output := calculation.CalculateVacation(input)

	assert.True(t, decimalFromFloat(30).Equal(output.BaseEntitlement), "BaseEntitlement should be 30")
	assert.True(t, decimalFromFloat(30).Equal(output.ProRatedEntitlement), "ProRatedEntitlement should be 30")
	assert.True(t, decimalFromFloat(30).Equal(output.PartTimeAdjustment), "PartTimeAdjustment should be 30")
	assert.True(t, decimalFromFloat(30).Equal(output.TotalEntitlement), "TotalEntitlement should be 30")
	assert.Equal(t, 12, output.MonthsEmployed)
}

func TestCalculateVacation_PartTime50Percent(t *testing.T) {
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1990, time.January, 1),
		EntryDate:           dateOf(2020, time.January, 1),
		WeeklyHours:         decimalFromFloat(20),
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisCalendarYear,
		Year:                2025,
		ReferenceDate:       dateOf(2025, time.January, 1),
	}

	output := calculation.CalculateVacation(input)

	assert.True(t, decimalFromFloat(15).Equal(output.PartTimeAdjustment), "PartTimeAdjustment should be 15")
	assert.True(t, decimalFromFloat(15).Equal(output.TotalEntitlement), "TotalEntitlement should be 15")
}

func TestCalculateVacation_PartTime75Percent(t *testing.T) {
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1990, time.January, 1),
		EntryDate:           dateOf(2020, time.January, 1),
		WeeklyHours:         decimalFromFloat(30),
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisCalendarYear,
		Year:                2025,
		ReferenceDate:       dateOf(2025, time.January, 1),
	}

	output := calculation.CalculateVacation(input)

	assert.True(t, decimalFromFloat(22.5).Equal(output.PartTimeAdjustment), "PartTimeAdjustment should be 22.5")
	assert.True(t, decimalFromFloat(22.5).Equal(output.TotalEntitlement), "TotalEntitlement should be 22.5")
}

func TestCalculateVacation_ProRatedMidYearEntry(t *testing.T) {
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1990, time.January, 1),
		EntryDate:           dateOf(2025, time.July, 1),
		WeeklyHours:         decimalFromFloat(40),
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisCalendarYear,
		Year:                2025,
		ReferenceDate:       dateOf(2025, time.July, 1),
	}

	output := calculation.CalculateVacation(input)

	assert.Equal(t, 6, output.MonthsEmployed)
	assert.True(t, decimalFromFloat(15).Equal(output.ProRatedEntitlement), "ProRatedEntitlement should be 15")
	assert.True(t, decimalFromFloat(15).Equal(output.TotalEntitlement), "TotalEntitlement should be 15")
}

func TestCalculateVacation_ProRatedMidYearExit(t *testing.T) {
	exitDate := dateOf(2025, time.March, 31)
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1990, time.January, 1),
		EntryDate:           dateOf(2020, time.January, 1),
		ExitDate:            &exitDate,
		WeeklyHours:         decimalFromFloat(40),
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisCalendarYear,
		Year:                2025,
		ReferenceDate:       dateOf(2025, time.January, 1),
	}

	output := calculation.CalculateVacation(input)

	assert.Equal(t, 3, output.MonthsEmployed)
	assert.True(t, decimalFromFloat(7.5).Equal(output.ProRatedEntitlement), "ProRatedEntitlement should be 7.5")
	assert.True(t, decimalFromFloat(7.5).Equal(output.TotalEntitlement), "TotalEntitlement should be 7.5")
}

func TestCalculateVacation_AgeBonusApplied(t *testing.T) {
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1975, time.January, 1),
		EntryDate:           dateOf(2020, time.January, 1),
		WeeklyHours:         decimalFromFloat(40),
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisCalendarYear,
		Year:                2025,
		ReferenceDate:       dateOf(2025, time.June, 1),
		SpecialCalcs: []calculation.VacationSpecialCalc{
			{Type: calculation.SpecialCalcAge, Threshold: 50, BonusDays: decimalFromFloat(2)},
		},
	}

	output := calculation.CalculateVacation(input)

	assert.True(t, decimalFromFloat(2).Equal(output.AgeBonus), "AgeBonus should be 2")
	assert.True(t, decimalFromFloat(32).Equal(output.TotalEntitlement), "TotalEntitlement should be 32")
	assert.Equal(t, 50, output.AgeAtReference)
}

func TestCalculateVacation_AgeBonusBelowThreshold(t *testing.T) {
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1980, time.January, 1),
		EntryDate:           dateOf(2020, time.January, 1),
		WeeklyHours:         decimalFromFloat(40),
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisCalendarYear,
		Year:                2025,
		ReferenceDate:       dateOf(2025, time.June, 1),
		SpecialCalcs: []calculation.VacationSpecialCalc{
			{Type: calculation.SpecialCalcAge, Threshold: 50, BonusDays: decimalFromFloat(2)},
		},
	}

	output := calculation.CalculateVacation(input)

	assert.True(t, decimal.Zero.Equal(output.AgeBonus), "AgeBonus should be 0")
	assert.True(t, decimalFromFloat(30).Equal(output.TotalEntitlement), "TotalEntitlement should be 30")
	assert.Equal(t, 45, output.AgeAtReference)
}

func TestCalculateVacation_TenureBonusApplied(t *testing.T) {
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1990, time.January, 1),
		EntryDate:           dateOf(2015, time.January, 1),
		WeeklyHours:         decimalFromFloat(40),
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisCalendarYear,
		Year:                2025,
		ReferenceDate:       dateOf(2025, time.June, 1),
		SpecialCalcs: []calculation.VacationSpecialCalc{
			{Type: calculation.SpecialCalcTenure, Threshold: 5, BonusDays: decimalFromFloat(1)},
		},
	}

	output := calculation.CalculateVacation(input)

	assert.True(t, decimalFromFloat(1).Equal(output.TenureBonus), "TenureBonus should be 1")
	assert.True(t, decimalFromFloat(31).Equal(output.TotalEntitlement), "TotalEntitlement should be 31")
	assert.Equal(t, 10, output.TenureYears)
}

func TestCalculateVacation_DisabilityBonusApplied(t *testing.T) {
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1990, time.January, 1),
		EntryDate:           dateOf(2020, time.January, 1),
		WeeklyHours:         decimalFromFloat(40),
		HasDisability:       true,
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisCalendarYear,
		Year:                2025,
		ReferenceDate:       dateOf(2025, time.January, 1),
		SpecialCalcs: []calculation.VacationSpecialCalc{
			{Type: calculation.SpecialCalcDisability, BonusDays: decimalFromFloat(5)},
		},
	}

	output := calculation.CalculateVacation(input)

	assert.True(t, decimalFromFloat(5).Equal(output.DisabilityBonus), "DisabilityBonus should be 5")
	assert.True(t, decimalFromFloat(35).Equal(output.TotalEntitlement), "TotalEntitlement should be 35")
}

func TestCalculateVacation_DisabilityBonusNotApplied(t *testing.T) {
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1990, time.January, 1),
		EntryDate:           dateOf(2020, time.January, 1),
		WeeklyHours:         decimalFromFloat(40),
		HasDisability:       false,
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisCalendarYear,
		Year:                2025,
		ReferenceDate:       dateOf(2025, time.January, 1),
		SpecialCalcs: []calculation.VacationSpecialCalc{
			{Type: calculation.SpecialCalcDisability, BonusDays: decimalFromFloat(5)},
		},
	}

	output := calculation.CalculateVacation(input)

	assert.True(t, decimal.Zero.Equal(output.DisabilityBonus), "DisabilityBonus should be 0")
	assert.True(t, decimalFromFloat(30).Equal(output.TotalEntitlement), "TotalEntitlement should be 30")
}

func TestCalculateVacation_AllBonusesCombined(t *testing.T) {
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1970, time.January, 1),
		EntryDate:           dateOf(2015, time.January, 1),
		WeeklyHours:         decimalFromFloat(40),
		HasDisability:       true,
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisCalendarYear,
		Year:                2025,
		ReferenceDate:       dateOf(2025, time.June, 1),
		SpecialCalcs: []calculation.VacationSpecialCalc{
			{Type: calculation.SpecialCalcAge, Threshold: 50, BonusDays: decimalFromFloat(2)},
			{Type: calculation.SpecialCalcTenure, Threshold: 5, BonusDays: decimalFromFloat(1)},
			{Type: calculation.SpecialCalcDisability, BonusDays: decimalFromFloat(5)},
		},
	}

	output := calculation.CalculateVacation(input)

	assert.True(t, decimalFromFloat(2).Equal(output.AgeBonus), "AgeBonus should be 2")
	assert.True(t, decimalFromFloat(1).Equal(output.TenureBonus), "TenureBonus should be 1")
	assert.True(t, decimalFromFloat(5).Equal(output.DisabilityBonus), "DisabilityBonus should be 5")
	assert.True(t, decimalFromFloat(38).Equal(output.TotalEntitlement), "TotalEntitlement should be 38")
	assert.Equal(t, 55, output.AgeAtReference)
	assert.Equal(t, 10, output.TenureYears)
}

func TestCalculateVacation_StackedTenureBonuses(t *testing.T) {
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1990, time.January, 1),
		EntryDate:           dateOf(2013, time.January, 1),
		WeeklyHours:         decimalFromFloat(40),
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisCalendarYear,
		Year:                2025,
		ReferenceDate:       dateOf(2025, time.June, 1),
		SpecialCalcs: []calculation.VacationSpecialCalc{
			{Type: calculation.SpecialCalcTenure, Threshold: 5, BonusDays: decimalFromFloat(1)},
			{Type: calculation.SpecialCalcTenure, Threshold: 10, BonusDays: decimalFromFloat(2)},
		},
	}

	output := calculation.CalculateVacation(input)

	assert.True(t, decimalFromFloat(3).Equal(output.TenureBonus), "TenureBonus should be 3 (1+2 stacked)")
	assert.True(t, decimalFromFloat(33).Equal(output.TotalEntitlement), "TotalEntitlement should be 33")
	assert.Equal(t, 12, output.TenureYears)
}

func TestCalculateVacation_EntryDateBasis(t *testing.T) {
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1990, time.January, 1),
		EntryDate:           dateOf(2024, time.March, 15),
		WeeklyHours:         decimalFromFloat(40),
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisEntryDate,
		Year:                2025,
		ReferenceDate:       dateOf(2025, time.June, 1),
	}

	output := calculation.CalculateVacation(input)

	assert.Equal(t, 12, output.MonthsEmployed)
	assert.True(t, decimalFromFloat(30).Equal(output.TotalEntitlement), "TotalEntitlement should be 30")
}

func TestCalculateVacation_EntryDateBasisPartialYear(t *testing.T) {
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1990, time.January, 1),
		EntryDate:           dateOf(2025, time.March, 15),
		WeeklyHours:         decimalFromFloat(40),
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisEntryDate,
		Year:                2025,
		ReferenceDate:       dateOf(2025, time.June, 1),
	}

	output := calculation.CalculateVacation(input)

	// Entry date matches the period start for entry_date basis, so full 12 months
	assert.Equal(t, 12, output.MonthsEmployed)
	assert.True(t, decimalFromFloat(30).Equal(output.TotalEntitlement), "TotalEntitlement should be 30")
}

func TestCalculateVacation_RoundingToHalfDay(t *testing.T) {
	// 30 * (25/40) = 18.75 -> rounds to 19.0 (nearest 0.5)
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1990, time.January, 1),
		EntryDate:           dateOf(2020, time.January, 1),
		WeeklyHours:         decimalFromFloat(25),
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisCalendarYear,
		Year:                2025,
		ReferenceDate:       dateOf(2025, time.January, 1),
	}

	output := calculation.CalculateVacation(input)

	assert.True(t, decimalFromFloat(19).Equal(output.TotalEntitlement), "TotalEntitlement should be 19.0 (18.75 rounded to nearest 0.5)")
}

func TestCalculateVacation_RoundingDown(t *testing.T) {
	// 30 * (22/40) = 16.5 -> stays 16.5 (already a half-day value)
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1990, time.January, 1),
		EntryDate:           dateOf(2020, time.January, 1),
		WeeklyHours:         decimalFromFloat(22),
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisCalendarYear,
		Year:                2025,
		ReferenceDate:       dateOf(2025, time.January, 1),
	}

	output := calculation.CalculateVacation(input)

	assert.True(t, decimalFromFloat(16.5).Equal(output.TotalEntitlement), "TotalEntitlement should be 16.5")
}

func TestCalculateVacation_ZeroStandardHours(t *testing.T) {
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1990, time.January, 1),
		EntryDate:           dateOf(2020, time.January, 1),
		WeeklyHours:         decimalFromFloat(20),
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimal.Zero,
		Basis:               calculation.VacationBasisCalendarYear,
		Year:                2025,
		ReferenceDate:       dateOf(2025, time.January, 1),
	}

	output := calculation.CalculateVacation(input)

	// When standard hours is zero, no part-time adjustment is applied
	assert.True(t, decimalFromFloat(30).Equal(output.PartTimeAdjustment), "PartTimeAdjustment should equal ProRatedEntitlement when StandardWeeklyHours is 0")
	assert.True(t, decimalFromFloat(30).Equal(output.TotalEntitlement), "TotalEntitlement should be 30")
}

func TestCalculateVacation_NotYetEmployed(t *testing.T) {
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1990, time.January, 1),
		EntryDate:           dateOf(2026, time.June, 1),
		WeeklyHours:         decimalFromFloat(40),
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisCalendarYear,
		Year:                2025,
		ReferenceDate:       dateOf(2025, time.January, 1),
	}

	output := calculation.CalculateVacation(input)

	assert.Equal(t, 0, output.MonthsEmployed)
	assert.True(t, decimal.Zero.Equal(output.ProRatedEntitlement), "ProRatedEntitlement should be 0")
	assert.True(t, decimal.Zero.Equal(output.TotalEntitlement), "TotalEntitlement should be 0")
}

func TestCalculateVacation_ProRatedWithPartTime(t *testing.T) {
	// Mid-year entry (6 months) + part-time (50%)
	// 30 base days: pro-rated to 15, then part-time to 7.5
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1990, time.January, 1),
		EntryDate:           dateOf(2025, time.July, 1),
		WeeklyHours:         decimalFromFloat(20),
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisCalendarYear,
		Year:                2025,
		ReferenceDate:       dateOf(2025, time.July, 1),
	}

	output := calculation.CalculateVacation(input)

	assert.Equal(t, 6, output.MonthsEmployed)
	assert.True(t, decimalFromFloat(15).Equal(output.ProRatedEntitlement), "ProRatedEntitlement should be 15")
	assert.True(t, decimalFromFloat(7.5).Equal(output.PartTimeAdjustment), "PartTimeAdjustment should be 7.5")
	assert.True(t, decimalFromFloat(7.5).Equal(output.TotalEntitlement), "TotalEntitlement should be 7.5")
}

func TestCalculateCarryover(t *testing.T) {
	tests := []struct {
		name         string
		available    float64
		maxCarryover float64
		expected     float64
	}{
		{"capped", 10, 5, 5},
		{"below cap", 3, 5, 3},
		{"no limit when max is zero", 10, 0, 10},
		{"negative available", -5, 10, 0},
		{"zero available", 0, 5, 0},
		{"negative max means no limit", 10, -1, 10},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.CalculateCarryover(
				decimalFromFloat(tt.available),
				decimalFromFloat(tt.maxCarryover),
			)
			assert.True(t, decimalFromFloat(tt.expected).Equal(result),
				"expected %v but got %v", tt.expected, result)
		})
	}
}

func TestCalculateVacationDeduction(t *testing.T) {
	tests := []struct {
		name           string
		deductionValue float64
		durationDays   float64
		expected       float64
	}{
		{"standard day-based", 1.0, 5, 5},
		{"half-day vacation", 1.0, 0.5, 0.5},
		{"hour-based tracking", 8.0, 2, 16},
		{"zero deduction value", 0, 5, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.CalculateVacationDeduction(
				decimalFromFloat(tt.deductionValue),
				decimalFromFloat(tt.durationDays),
			)
			assert.True(t, decimalFromFloat(tt.expected).Equal(result),
				"expected %v but got %v", tt.expected, result)
		})
	}
}

func TestCalculateVacation_LeapYearBirthday(t *testing.T) {
	// Born Feb 29 1976, reference March 1 2026
	// With month/day comparison: March > February, so birthday has passed
	// Age = 2026 - 1976 = 50
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1976, time.February, 29),
		EntryDate:           dateOf(2020, time.January, 1),
		WeeklyHours:         decimalFromFloat(40),
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisCalendarYear,
		Year:                2026,
		ReferenceDate:       dateOf(2026, time.March, 1),
		SpecialCalcs: []calculation.VacationSpecialCalc{
			{Type: calculation.SpecialCalcAge, Threshold: 50, BonusDays: decimalFromFloat(2)},
		},
	}

	output := calculation.CalculateVacation(input)

	assert.Equal(t, 50, output.AgeAtReference)
	assert.True(t, decimalFromFloat(2).Equal(output.AgeBonus), "AgeBonus should be 2 (age 50 >= threshold 50)")
	assert.True(t, decimalFromFloat(32).Equal(output.TotalEntitlement), "TotalEntitlement should be 32")
}

func TestCalculateVacation_ExactBirthdayMatch(t *testing.T) {
	// Born Jan 15 1975, reference Jan 15 2025 -> age = 50 (birthday has occurred)
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1975, time.January, 15),
		EntryDate:           dateOf(2020, time.January, 1),
		WeeklyHours:         decimalFromFloat(40),
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisCalendarYear,
		Year:                2025,
		ReferenceDate:       dateOf(2025, time.January, 15),
		SpecialCalcs: []calculation.VacationSpecialCalc{
			{Type: calculation.SpecialCalcAge, Threshold: 50, BonusDays: decimalFromFloat(2)},
		},
	}

	output := calculation.CalculateVacation(input)

	assert.Equal(t, 50, output.AgeAtReference)
	assert.True(t, decimalFromFloat(2).Equal(output.AgeBonus), "AgeBonus should be 2 (exact birthday match)")
	assert.True(t, decimalFromFloat(32).Equal(output.TotalEntitlement), "TotalEntitlement should be 32")
}
