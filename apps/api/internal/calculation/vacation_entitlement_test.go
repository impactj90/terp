package calculation_test

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"

	"github.com/tolga/terp/internal/calculation"
)

// =============================================================
// ZMI-TICKET-014 Acceptance Test Pack
// =============================================================

// Test Case 1: Calendar year basis proration
// Input: entry 2026-03-01, annual=30
// Expected: prorated for Mar-Dec (10/12 of 30 = 25)
func TestEntitlement_CalendarYearBasisProration(t *testing.T) {
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1990, time.January, 1),
		EntryDate:           dateOf(2026, time.March, 1),
		WeeklyHours:         decimalFromFloat(40),
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisCalendarYear,
		Year:                2026,
		ReferenceDate:       dateOf(2026, time.January, 1),
	}

	output := calculation.CalculateVacation(input)

	// March through December = 10 months
	assert.Equal(t, 10, output.MonthsEmployed, "Should be employed 10 months (Mar-Dec)")
	assert.True(t, decimalFromFloat(30).Equal(output.BaseEntitlement), "Base entitlement should be 30")
	// 30 * 10/12 = 25 -- use InexactFloat64 to avoid decimal division precision
	assert.InDelta(t, 25.0, output.ProRatedEntitlement.InexactFloat64(), 0.01, "ProRated should be 25 (10/12 of 30)")
	assert.InDelta(t, 25.0, output.TotalEntitlement.InexactFloat64(), 0.01, "Total should be 25")
}

// Test Case 2: Entry date basis
// Input: entry 2026-03-01, basis=entry_date
// Expected: entitlement year runs 03-01 to 02-28/29, full 12 months if in second+ year
func TestEntitlement_EntryDateBasis_FullYear(t *testing.T) {
	// Employee hired 2024-03-01 and we calculate for 2026
	// Entry-date basis: period = 2026-03-01 to 2027-02-28
	// Employee has been employed since 2024, so full 12 months
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1990, time.January, 1),
		EntryDate:           dateOf(2024, time.March, 1),
		WeeklyHours:         decimalFromFloat(40),
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisEntryDate,
		Year:                2026,
		ReferenceDate:       dateOf(2026, time.March, 1), // Anniversary date in year 2026
	}

	output := calculation.CalculateVacation(input)

	assert.Equal(t, 12, output.MonthsEmployed, "Full 12 months for entry date basis in second+ year")
	assert.True(t, decimalFromFloat(30).Equal(output.TotalEntitlement), "Total should be 30")
}

// Test Case 2b: Entry date basis - first partial year
func TestEntitlement_EntryDateBasis_FirstYear(t *testing.T) {
	// Employee hired 2026-03-01 and we calculate for 2026
	// Entry-date basis: entry date IS in the year, so full period starts
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1990, time.January, 1),
		EntryDate:           dateOf(2026, time.March, 1),
		WeeklyHours:         decimalFromFloat(40),
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisEntryDate,
		Year:                2026,
		ReferenceDate:       dateOf(2026, time.March, 1),
	}

	output := calculation.CalculateVacation(input)

	// Entry date basis: period starts at entry date, so full 12 months
	assert.Equal(t, 12, output.MonthsEmployed, "Entry date basis: first year = 12 months")
	assert.True(t, decimalFromFloat(30).Equal(output.TotalEntitlement), "Total should be 30 for entry date basis")
}

// Test Case 3: Special calculation by age
// Input: age threshold 50 adds +2 days
// Expected: entitlement includes +2 if age >= 50
func TestEntitlement_SpecialCalcByAge(t *testing.T) {
	// Employee born 1976-01-15, reference 2026-01-01 -> age = 49 (birthday not yet)
	// Employee born 1976-01-15, reference 2026-06-01 -> age = 50 (birthday passed)
	t.Run("Age_Below_Threshold", func(t *testing.T) {
		input := calculation.VacationCalcInput{
			BirthDate:           dateOf(1976, time.June, 15),
			EntryDate:           dateOf(2020, time.January, 1),
			WeeklyHours:         decimalFromFloat(40),
			BaseVacationDays:    decimalFromFloat(30),
			StandardWeeklyHours: decimalFromFloat(40),
			Basis:               calculation.VacationBasisCalendarYear,
			Year:                2026,
			ReferenceDate:       dateOf(2026, time.January, 1),
			SpecialCalcs: []calculation.VacationSpecialCalc{
				{Type: calculation.SpecialCalcAge, Threshold: 50, BonusDays: decimalFromFloat(2)},
			},
		}

		output := calculation.CalculateVacation(input)

		assert.Equal(t, 49, output.AgeAtReference, "Age should be 49 (birthday in June not passed yet at Jan 1)")
		assert.True(t, decimal.Zero.Equal(output.AgeBonus), "No age bonus below threshold")
		assert.True(t, decimalFromFloat(30).Equal(output.TotalEntitlement), "Total should be 30")
	})

	t.Run("Age_At_Threshold", func(t *testing.T) {
		input := calculation.VacationCalcInput{
			BirthDate:           dateOf(1976, time.January, 1),
			EntryDate:           dateOf(2020, time.January, 1),
			WeeklyHours:         decimalFromFloat(40),
			BaseVacationDays:    decimalFromFloat(30),
			StandardWeeklyHours: decimalFromFloat(40),
			Basis:               calculation.VacationBasisCalendarYear,
			Year:                2026,
			ReferenceDate:       dateOf(2026, time.June, 1),
			SpecialCalcs: []calculation.VacationSpecialCalc{
				{Type: calculation.SpecialCalcAge, Threshold: 50, BonusDays: decimalFromFloat(2)},
			},
		}

		output := calculation.CalculateVacation(input)

		assert.Equal(t, 50, output.AgeAtReference, "Age should be 50")
		assert.True(t, decimalFromFloat(2).Equal(output.AgeBonus), "Age bonus should be 2")
		assert.True(t, decimalFromFloat(32).Equal(output.TotalEntitlement), "Total should be 32")
	})
}

// Test Case 4: Disability bonus
// Input: disability flag=true, bonus=5
// Expected: +5 days
func TestEntitlement_DisabilityBonus(t *testing.T) {
	t.Run("Disability_Enabled", func(t *testing.T) {
		input := calculation.VacationCalcInput{
			BirthDate:           dateOf(1990, time.January, 1),
			EntryDate:           dateOf(2020, time.January, 1),
			WeeklyHours:         decimalFromFloat(40),
			HasDisability:       true,
			BaseVacationDays:    decimalFromFloat(30),
			StandardWeeklyHours: decimalFromFloat(40),
			Basis:               calculation.VacationBasisCalendarYear,
			Year:                2026,
			ReferenceDate:       dateOf(2026, time.January, 1),
			SpecialCalcs: []calculation.VacationSpecialCalc{
				{Type: calculation.SpecialCalcDisability, BonusDays: decimalFromFloat(5)},
			},
		}

		output := calculation.CalculateVacation(input)

		assert.True(t, decimalFromFloat(5).Equal(output.DisabilityBonus), "Disability bonus should be 5")
		assert.True(t, decimalFromFloat(35).Equal(output.TotalEntitlement), "Total should be 35")
	})

	t.Run("Disability_Disabled", func(t *testing.T) {
		input := calculation.VacationCalcInput{
			BirthDate:           dateOf(1990, time.January, 1),
			EntryDate:           dateOf(2020, time.January, 1),
			WeeklyHours:         decimalFromFloat(40),
			HasDisability:       false,
			BaseVacationDays:    decimalFromFloat(30),
			StandardWeeklyHours: decimalFromFloat(40),
			Basis:               calculation.VacationBasisCalendarYear,
			Year:                2026,
			ReferenceDate:       dateOf(2026, time.January, 1),
			SpecialCalcs: []calculation.VacationSpecialCalc{
				{Type: calculation.SpecialCalcDisability, BonusDays: decimalFromFloat(5)},
			},
		}

		output := calculation.CalculateVacation(input)

		assert.True(t, decimal.Zero.Equal(output.DisabilityBonus), "No disability bonus without flag")
		assert.True(t, decimalFromFloat(30).Equal(output.TotalEntitlement), "Total should be 30")
	})
}

// Additional ticket tests: Part-time adjustment
func TestEntitlement_PartTimeAdjustment(t *testing.T) {
	// 30 base days, 20h/40h = 50%, expected 15 days
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1990, time.January, 1),
		EntryDate:           dateOf(2020, time.January, 1),
		WeeklyHours:         decimalFromFloat(20),
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisCalendarYear,
		Year:                2026,
		ReferenceDate:       dateOf(2026, time.January, 1),
	}

	output := calculation.CalculateVacation(input)

	assert.True(t, decimalFromFloat(30).Equal(output.BaseEntitlement), "Base should be 30")
	assert.True(t, decimalFromFloat(30).Equal(output.ProRatedEntitlement), "ProRated should be 30 (full year)")
	assert.True(t, decimalFromFloat(15).Equal(output.PartTimeAdjustment), "PartTime should be 15 (50%)")
	assert.True(t, decimalFromFloat(15).Equal(output.TotalEntitlement), "Total should be 15")
}

// Combined scenario: mid-year entry + part-time + age bonus
func TestEntitlement_Combined_ProRation_PartTime_AgeBonus(t *testing.T) {
	// Entry July 1, 2026 (6 months); 20h/40h part-time; age 55 with age bonus +2
	// Base: 30 days
	// Pro-rated: 30 * 6/12 = 15
	// Part-time: 15 * 20/40 = 7.5
	// Age bonus: +2 (age >= 50)
	// Total: 7.5 + 2 = 9.5
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1971, time.January, 1), // age 55 at reference
		EntryDate:           dateOf(2026, time.July, 1),
		WeeklyHours:         decimalFromFloat(20),
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisCalendarYear,
		Year:                2026,
		ReferenceDate:       dateOf(2026, time.June, 1),
		SpecialCalcs: []calculation.VacationSpecialCalc{
			{Type: calculation.SpecialCalcAge, Threshold: 50, BonusDays: decimalFromFloat(2)},
		},
	}

	output := calculation.CalculateVacation(input)

	assert.Equal(t, 6, output.MonthsEmployed, "6 months employed")
	assert.Equal(t, 55, output.AgeAtReference, "Age 55")
	assert.True(t, decimalFromFloat(15).Equal(output.ProRatedEntitlement), "ProRated should be 15")
	assert.True(t, decimalFromFloat(7.5).Equal(output.PartTimeAdjustment), "PartTime should be 7.5")
	assert.True(t, decimalFromFloat(2).Equal(output.AgeBonus), "Age bonus should be 2")
	assert.True(t, decimalFromFloat(9.5).Equal(output.TotalEntitlement), "Total should be 9.5")
}

// Combined scenario: all bonuses + tenure stacking
func TestEntitlement_Combined_AllBonuses(t *testing.T) {
	// Full year, full time, age 55 (>= 50), tenure 12 years (>= 5 and >= 10), disability
	// Base: 30
	// Pro-rated: 30 (full year)
	// Part-time: 30 (full time)
	// Age bonus: +2
	// Tenure bonus: +1 (threshold 5) + +2 (threshold 10) = +3
	// Disability: +5
	// Total: 30 + 2 + 3 + 5 = 40
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1971, time.January, 1), // age 55
		EntryDate:           dateOf(2014, time.January, 1), // 12 years tenure
		WeeklyHours:         decimalFromFloat(40),
		HasDisability:       true,
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisCalendarYear,
		Year:                2026,
		ReferenceDate:       dateOf(2026, time.June, 1),
		SpecialCalcs: []calculation.VacationSpecialCalc{
			{Type: calculation.SpecialCalcAge, Threshold: 50, BonusDays: decimalFromFloat(2)},
			{Type: calculation.SpecialCalcTenure, Threshold: 5, BonusDays: decimalFromFloat(1)},
			{Type: calculation.SpecialCalcTenure, Threshold: 10, BonusDays: decimalFromFloat(2)},
			{Type: calculation.SpecialCalcDisability, BonusDays: decimalFromFloat(5)},
		},
	}

	output := calculation.CalculateVacation(input)

	assert.Equal(t, 12, output.MonthsEmployed, "Full year")
	assert.Equal(t, 55, output.AgeAtReference, "Age 55")
	assert.Equal(t, 12, output.TenureYears, "Tenure 12 years")
	assert.True(t, decimalFromFloat(2).Equal(output.AgeBonus), "Age bonus = 2")
	assert.True(t, decimalFromFloat(3).Equal(output.TenureBonus), "Tenure bonus = 3 (1+2 stacked)")
	assert.True(t, decimalFromFloat(5).Equal(output.DisabilityBonus), "Disability bonus = 5")
	assert.True(t, decimalFromFloat(40).Equal(output.TotalEntitlement), "Total = 40")
}

// Edge case: mid-year exit with entry date basis
func TestEntitlement_EntryDateBasis_MidYearExit(t *testing.T) {
	exitDate := dateOf(2026, time.September, 30)
	input := calculation.VacationCalcInput{
		BirthDate:           dateOf(1990, time.January, 1),
		EntryDate:           dateOf(2024, time.March, 1),
		ExitDate:            &exitDate,
		WeeklyHours:         decimalFromFloat(40),
		BaseVacationDays:    decimalFromFloat(30),
		StandardWeeklyHours: decimalFromFloat(40),
		Basis:               calculation.VacationBasisEntryDate,
		Year:                2026,
		ReferenceDate:       dateOf(2026, time.March, 1), // Anniversary
	}

	output := calculation.CalculateVacation(input)

	// Exit Sep 30, entry date basis year starts Mar 1.
	// Months employed in entry date year: Mar through Sep = 7 months
	assert.Equal(t, 7, output.MonthsEmployed, "7 months in entry date year until exit")
	// Pro-rated: 30 * 7/12 = 17.5
	// Use InexactFloat64 for comparison to avoid decimal precision mismatches
	assert.InDelta(t, 17.5, output.ProRatedEntitlement.InexactFloat64(), 0.01,
		"ProRated should be approximately 17.5 (30*7/12)")
}
