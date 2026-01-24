package calculation

import (
	"time"

	"github.com/shopspring/decimal"
)

// VacationBasis defines how the vacation year is determined.
type VacationBasis string

const (
	// VacationBasisCalendarYear uses Jan 1 - Dec 31 as the vacation year.
	VacationBasisCalendarYear VacationBasis = "calendar_year"
	// VacationBasisEntryDate uses the employee's hire anniversary as the vacation year.
	VacationBasisEntryDate VacationBasis = "entry_date"
)

// SpecialCalcType defines the type of special vacation calculation (Sonderberechnung).
type SpecialCalcType string

const (
	// SpecialCalcAge adds bonus days based on employee age.
	SpecialCalcAge SpecialCalcType = "age"
	// SpecialCalcTenure adds bonus days based on years of service (Betriebszugehorigkeit).
	SpecialCalcTenure SpecialCalcType = "tenure"
	// SpecialCalcDisability adds bonus days for employees with disability (Behinderung).
	SpecialCalcDisability SpecialCalcType = "disability"
)

// VacationSpecialCalc defines a single special vacation calculation rule.
type VacationSpecialCalc struct {
	Type      SpecialCalcType
	Threshold int             // Age in years (age), tenure in years (tenure), ignored for disability
	BonusDays decimal.Decimal // Additional vacation days to add
}

// VacationCalcInput contains all data needed for vacation entitlement calculation.
type VacationCalcInput struct {
	// Employee data
	BirthDate     time.Time
	EntryDate     time.Time
	ExitDate      *time.Time
	WeeklyHours   decimal.Decimal
	HasDisability bool

	// Configuration (from tariff)
	BaseVacationDays    decimal.Decimal // Jahresurlaub
	StandardWeeklyHours decimal.Decimal // Full-time weekly hours (e.g., 40)
	Basis               VacationBasis   // calendar_year or entry_date
	SpecialCalcs        []VacationSpecialCalc

	// Calculation context
	Year          int
	ReferenceDate time.Time // Date to evaluate age/tenure at
}

// VacationCalcOutput contains the results of vacation entitlement calculation.
type VacationCalcOutput struct {
	BaseEntitlement     decimal.Decimal
	ProRatedEntitlement decimal.Decimal
	PartTimeAdjustment  decimal.Decimal

	AgeBonus       decimal.Decimal
	TenureBonus    decimal.Decimal
	DisabilityBonus decimal.Decimal

	TotalEntitlement decimal.Decimal

	MonthsEmployed int
	AgeAtReference int
	TenureYears    int
}

// CalculateVacation computes the vacation entitlement for an employee based on
// their employment data and tariff configuration. It applies pro-rating,
// part-time adjustment, and special calculation bonuses (age, tenure, disability).
func CalculateVacation(input VacationCalcInput) VacationCalcOutput {
	var output VacationCalcOutput

	// Step 1 - Reference Metrics
	output.AgeAtReference = calculateAge(input.BirthDate, input.ReferenceDate)
	output.TenureYears = calculateTenure(input.EntryDate, input.ReferenceDate)

	// Step 2 - Months Employed
	output.MonthsEmployed = calculateMonthsEmployedInYear(input.EntryDate, input.ExitDate, input.Year, input.Basis)

	// Step 3 - Pro-Rate by Months
	output.BaseEntitlement = input.BaseVacationDays
	if output.MonthsEmployed < 12 {
		monthFactor := decimal.NewFromInt(int64(output.MonthsEmployed)).Div(decimal.NewFromInt(12))
		output.ProRatedEntitlement = input.BaseVacationDays.Mul(monthFactor)
	} else {
		output.ProRatedEntitlement = input.BaseVacationDays
	}

	// Step 4 - Part-Time Adjustment
	if input.StandardWeeklyHours.IsPositive() {
		partTimeFactor := input.WeeklyHours.Div(input.StandardWeeklyHours)
		output.PartTimeAdjustment = output.ProRatedEntitlement.Mul(partTimeFactor)
	} else {
		output.PartTimeAdjustment = output.ProRatedEntitlement
	}

	// Step 5 - Special Calculations (Bonuses)
	for _, sc := range input.SpecialCalcs {
		switch sc.Type {
		case SpecialCalcAge:
			if output.AgeAtReference >= sc.Threshold {
				output.AgeBonus = output.AgeBonus.Add(sc.BonusDays)
			}
		case SpecialCalcTenure:
			if output.TenureYears >= sc.Threshold {
				output.TenureBonus = output.TenureBonus.Add(sc.BonusDays)
			}
		case SpecialCalcDisability:
			if input.HasDisability {
				output.DisabilityBonus = output.DisabilityBonus.Add(sc.BonusDays)
			}
		}
	}

	// Step 6 - Total
	output.TotalEntitlement = output.PartTimeAdjustment.
		Add(output.AgeBonus).
		Add(output.TenureBonus).
		Add(output.DisabilityBonus)

	// Step 7 - Rounding
	output.TotalEntitlement = roundToHalfDay(output.TotalEntitlement)

	return output
}

// CalculateCarryover determines how much vacation can be carried over to the next year.
// It applies the maximum carryover cap (Kappungsregeln). A maxCarryover of zero or
// negative means no limit is applied.
func CalculateCarryover(available, maxCarryover decimal.Decimal) decimal.Decimal {
	if available.LessThanOrEqual(decimal.Zero) {
		return decimal.Zero
	}
	if maxCarryover.IsPositive() && available.GreaterThan(maxCarryover) {
		return maxCarryover
	}
	return available
}

// CalculateVacationDeduction computes the vacation balance deduction for an absence.
// The deductionValue is typically 1.0 for day-based tracking (Urlaubsbewertung).
func CalculateVacationDeduction(deductionValue, durationDays decimal.Decimal) decimal.Decimal {
	return deductionValue.Mul(durationDays)
}

// calculateAge computes the age in full years at the reference date.
func calculateAge(birthDate, referenceDate time.Time) int {
	years := referenceDate.Year() - birthDate.Year()
	refMonth, refDay := referenceDate.Month(), referenceDate.Day()
	birthMonth, birthDay := birthDate.Month(), birthDate.Day()
	if refMonth < birthMonth || (refMonth == birthMonth && refDay < birthDay) {
		years--
	}
	if years < 0 {
		return 0
	}
	return years
}

// calculateTenure computes years of service at the reference date.
func calculateTenure(entryDate, referenceDate time.Time) int {
	if referenceDate.Before(entryDate) {
		return 0
	}
	years := referenceDate.Year() - entryDate.Year()
	refMonth, refDay := referenceDate.Month(), referenceDate.Day()
	entryMonth, entryDay := entryDate.Month(), entryDate.Day()
	if refMonth < entryMonth || (refMonth == entryMonth && refDay < entryDay) {
		years--
	}
	if years < 0 {
		return 0
	}
	return years
}

// calculateMonthsEmployedInYear computes how many months an employee was employed
// within the given year, based on the vacation basis type. Partial months count as
// full months per ZMI convention.
func calculateMonthsEmployedInYear(entryDate time.Time, exitDate *time.Time, year int, basis VacationBasis) int {
	var periodStart, periodEnd time.Time

	if basis == VacationBasisCalendarYear {
		periodStart = time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
		periodEnd = time.Date(year, 12, 31, 0, 0, 0, 0, time.UTC)
	} else {
		periodStart = time.Date(year, entryDate.Month(), entryDate.Day(), 0, 0, 0, 0, time.UTC)
		periodEnd = periodStart.AddDate(1, 0, -1)
	}

	effectiveStart := periodStart
	if entryDate.After(periodStart) {
		effectiveStart = entryDate
	}

	effectiveEnd := periodEnd
	if exitDate != nil && exitDate.Before(periodEnd) {
		effectiveEnd = *exitDate
	}

	if effectiveStart.After(effectiveEnd) {
		return 0
	}

	months := 0
	current := effectiveStart
	for !current.After(effectiveEnd) {
		months++
		current = current.AddDate(0, 1, 0)
	}

	if months > 12 {
		months = 12
	}

	return months
}

// roundToHalfDay rounds a decimal value to the nearest 0.5.
func roundToHalfDay(d decimal.Decimal) decimal.Decimal {
	two := decimal.NewFromInt(2)
	doubled := d.Mul(two)
	rounded := doubled.Round(0)
	return rounded.Div(two)
}
