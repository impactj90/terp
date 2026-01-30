package auth

import (
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// Week plan IDs from devweekplans.go
var (
	WeekPlan40HID  = uuid.MustParse("00000000-0000-0000-0000-000000000601")
	WeekPlan38HID  = uuid.MustParse("00000000-0000-0000-0000-000000000602")
	WeekPlanFlexID = uuid.MustParse("00000000-0000-0000-0000-000000000603")
	WeekPlan20HID  = uuid.MustParse("00000000-0000-0000-0000-000000000604")
)

// DevTariff represents a tariff for dev mode seeding.
type DevTariff struct {
	ID          uuid.UUID
	Code        string
	Name        string
	Description string
	WeekPlanID  *uuid.UUID
	IsActive    bool

	// ZMI Vacation Fields
	AnnualVacationDays *decimal.Decimal
	WorkDaysPerWeek    *int
	VacationBasis      string // "calendar_year" or "entry_date"

	// ZMI Target Hours Fields
	DailyTargetHours   *decimal.Decimal
	WeeklyTargetHours  *decimal.Decimal
	MonthlyTargetHours *decimal.Decimal

	// ZMI Flextime Fields
	MaxFlextimePerMonth *int
	UpperLimitAnnual    *int
	LowerLimitAnnual    *int
	FlextimeThreshold   *int
	CreditType          string // "no_evaluation", "complete", "after_threshold", "no_carryover"

	// Rhythm Fields
	RhythmType string // "weekly", "rolling_weekly", "x_days"
}

// Helper to create decimal pointer
func decimalPtr(f float64) *decimal.Decimal {
	d := decimal.NewFromFloat(f)
	return &d
}

// DevTariffs contains default tariffs for dev mode seeding.
var DevTariffs = []DevTariff{
	// Standard 40-hour full-time tariff
	{
		ID:                  uuid.MustParse("00000000-0000-0000-0000-000000000701"),
		Code:                "TAR-40H",
		Name:                "Full-time 40h",
		Description:         "Standard full-time tariff with 40 hours per week, 30 vacation days",
		WeekPlanID:          &WeekPlan40HID,
		IsActive:            true,
		AnnualVacationDays:  decimalPtr(30),
		WorkDaysPerWeek:     intPtr(5),
		VacationBasis:       "calendar_year",
		DailyTargetHours:    decimalPtr(8),
		WeeklyTargetHours:   decimalPtr(40),
		MonthlyTargetHours:  decimalPtr(173.33),
		MaxFlextimePerMonth: intPtr(1200), // 20 hours
		UpperLimitAnnual:    intPtr(2400), // 40 hours
		LowerLimitAnnual:    intPtr(-600), // -10 hours
		FlextimeThreshold:   nil,
		CreditType:          "no_evaluation",
		RhythmType:          "weekly",
	},
	// 38-hour tariff with short Friday
	{
		ID:                  uuid.MustParse("00000000-0000-0000-0000-000000000702"),
		Code:                "TAR-38H",
		Name:                "Full-time 38h",
		Description:         "Full-time tariff with 38 hours per week (short Friday), 30 vacation days",
		WeekPlanID:          &WeekPlan38HID,
		IsActive:            true,
		AnnualVacationDays:  decimalPtr(30),
		WorkDaysPerWeek:     intPtr(5),
		VacationBasis:       "calendar_year",
		DailyTargetHours:    decimalPtr(7.6),
		WeeklyTargetHours:   decimalPtr(38),
		MonthlyTargetHours:  decimalPtr(164.67),
		MaxFlextimePerMonth: intPtr(1200),
		UpperLimitAnnual:    intPtr(2400),
		LowerLimitAnnual:    intPtr(-600),
		FlextimeThreshold:   nil,
		CreditType:          "no_evaluation",
		RhythmType:          "weekly",
	},
	// Flextime tariff
	{
		ID:                  uuid.MustParse("00000000-0000-0000-0000-000000000703"),
		Code:                "TAR-FLEX",
		Name:                "Flextime 40h",
		Description:         "Flextime tariff with flexible arrival/departure, 30 vacation days",
		WeekPlanID:          &WeekPlanFlexID,
		IsActive:            true,
		AnnualVacationDays:  decimalPtr(30),
		WorkDaysPerWeek:     intPtr(5),
		VacationBasis:       "calendar_year",
		DailyTargetHours:    decimalPtr(8),
		WeeklyTargetHours:   decimalPtr(40),
		MonthlyTargetHours:  decimalPtr(173.33),
		MaxFlextimePerMonth: intPtr(1800),  // 30 hours (more flexible)
		UpperLimitAnnual:    intPtr(3600),  // 60 hours
		LowerLimitAnnual:    intPtr(-1200), // -20 hours
		FlextimeThreshold:   intPtr(30),    // 30 min threshold
		CreditType:          "complete",
		RhythmType:          "weekly",
	},
	// Part-time 20-hour tariff
	{
		ID:                  uuid.MustParse("00000000-0000-0000-0000-000000000704"),
		Code:                "TAR-20H",
		Name:                "Part-time 20h",
		Description:         "Part-time tariff with 20 hours per week, 15 vacation days (pro-rated)",
		WeekPlanID:          &WeekPlan20HID,
		IsActive:            true,
		AnnualVacationDays:  decimalPtr(15), // Pro-rated from 30
		WorkDaysPerWeek:     intPtr(5),
		VacationBasis:       "calendar_year",
		DailyTargetHours:    decimalPtr(4),
		WeeklyTargetHours:   decimalPtr(20),
		MonthlyTargetHours:  decimalPtr(86.67),
		MaxFlextimePerMonth: intPtr(600),  // 10 hours
		UpperLimitAnnual:    intPtr(1200), // 20 hours
		LowerLimitAnnual:    intPtr(-300), // -5 hours
		FlextimeThreshold:   nil,
		CreditType:          "no_evaluation",
		RhythmType:          "weekly",
	},
	// Trainee/Apprentice tariff
	{
		ID:                  uuid.MustParse("00000000-0000-0000-0000-000000000705"),
		Code:                "TAR-AZUBI",
		Name:                "Apprentice",
		Description:         "Apprentice tariff with 40 hours per week, entry-date-based vacation",
		WeekPlanID:          &WeekPlan40HID,
		IsActive:            true,
		AnnualVacationDays:  decimalPtr(25),
		WorkDaysPerWeek:     intPtr(5),
		VacationBasis:       "entry_date", // Anniversary-based
		DailyTargetHours:    decimalPtr(8),
		WeeklyTargetHours:   decimalPtr(40),
		MonthlyTargetHours:  decimalPtr(173.33),
		MaxFlextimePerMonth: intPtr(600), // Less flexibility
		UpperLimitAnnual:    intPtr(1200),
		LowerLimitAnnual:    intPtr(-300),
		FlextimeThreshold:   nil,
		CreditType:          "no_carryover", // Reset monthly
		RhythmType:          "weekly",
	},
	// Management tariff (no flextime limits)
	{
		ID:                  uuid.MustParse("00000000-0000-0000-0000-000000000706"),
		Code:                "TAR-MGMT",
		Name:                "Management",
		Description:         "Management tariff without flextime tracking, 30 vacation days",
		WeekPlanID:          &WeekPlan40HID,
		IsActive:            true,
		AnnualVacationDays:  decimalPtr(30),
		WorkDaysPerWeek:     intPtr(5),
		VacationBasis:       "calendar_year",
		DailyTargetHours:    decimalPtr(8),
		WeeklyTargetHours:   decimalPtr(40),
		MonthlyTargetHours:  decimalPtr(173.33),
		MaxFlextimePerMonth: nil, // No limit
		UpperLimitAnnual:    nil, // No limit
		LowerLimitAnnual:    nil, // No limit
		FlextimeThreshold:   nil,
		CreditType:          "no_evaluation",
		RhythmType:          "weekly",
	},
}

// GetDevTariffs returns all dev tariffs.
func GetDevTariffs() []DevTariff {
	return DevTariffs
}
