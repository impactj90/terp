package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// BreakType is defined in dayplan.go

// VacationBasis determines how vacation year is calculated
// ZMI: Urlaubsberechnung Basis
type VacationBasis string

const (
	// VacationBasisCalendarYear - Jan 1 to Dec 31
	VacationBasisCalendarYear VacationBasis = "calendar_year"

	// VacationBasisEntryDate - Anniversary-based (hire date)
	VacationBasisEntryDate VacationBasis = "entry_date"
)

// CreditType determines how flextime is credited at month end
// ZMI: Art der Gutschrift
type CreditType string

const (
	// CreditTypeNoEvaluation - 1:1 transfer to next month
	// ZMI: Keine Bewertung
	CreditTypeNoEvaluation CreditType = "no_evaluation"

	// CreditTypeComplete - Full transfer with limits applied
	// ZMI: Gleitzeitübertrag komplett
	CreditTypeComplete CreditType = "complete_carryover"

	// CreditTypeAfterThreshold - Only credit above threshold
	// ZMI: Gleitzeitübertrag nach Schwelle
	CreditTypeAfterThreshold CreditType = "after_threshold"

	// CreditTypeNoCarryover - Reset to 0 at month end
	// ZMI: Kein Übertrag
	CreditTypeNoCarryover CreditType = "no_carryover"
)

// RhythmType determines how time plans repeat
// ZMI: Zeitplan-Modell
type RhythmType string

const (
	// RhythmTypeWeekly - Single week plan, same every week (default)
	RhythmTypeWeekly RhythmType = "weekly"

	// RhythmTypeRollingWeekly - Multiple week plans rotating in sequence
	// ZMI: Rollierende Wochenpläne
	RhythmTypeRollingWeekly RhythmType = "rolling_weekly"

	// RhythmTypeXDays - Custom day cycle (not tied to weekdays)
	// ZMI: Zeitplan nach X-Tagen
	RhythmTypeXDays RhythmType = "x_days"
)

type Tariff struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Code        string     `gorm:"type:varchar(20);not null" json:"code"`
	Name        string     `gorm:"type:varchar(255);not null" json:"name"`
	Description *string    `gorm:"type:text" json:"description,omitempty"`
	WeekPlanID  *uuid.UUID `gorm:"type:uuid" json:"week_plan_id,omitempty"`
	ValidFrom   *time.Time `gorm:"type:date" json:"valid_from,omitempty"`
	ValidTo     *time.Time `gorm:"type:date" json:"valid_to,omitempty"`
	IsActive    bool       `gorm:"default:true" json:"is_active"`

	// =====================================================
	// ZMI VACATION FIELDS (Section 14)
	// =====================================================

	// Base annual vacation days for this tariff
	// ZMI: Jahresurlaub
	AnnualVacationDays *decimal.Decimal `gorm:"type:decimal(5,2)" json:"annual_vacation_days,omitempty"`

	// Work days per week (for vacation pro-rating)
	// ZMI: AT pro Woche (Arbeitstage pro Woche)
	WorkDaysPerWeek *int `gorm:"default:5" json:"work_days_per_week,omitempty"`

	// Vacation calculation basis
	// ZMI: Urlaubsberechnung Basis
	VacationBasis VacationBasis `gorm:"type:varchar(20);default:'calendar_year'" json:"vacation_basis"`

	// =====================================================
	// ZMI TARGET HOURS FIELDS (Section 14)
	// =====================================================

	// Daily target hours
	// ZMI: Tagessollstunden
	DailyTargetHours *decimal.Decimal `gorm:"type:decimal(5,2)" json:"daily_target_hours,omitempty"`

	// Weekly target hours
	// ZMI: Wochensollstunden
	WeeklyTargetHours *decimal.Decimal `gorm:"type:decimal(5,2)" json:"weekly_target_hours,omitempty"`

	// Monthly target hours
	// ZMI: Monatssollstunden
	MonthlyTargetHours *decimal.Decimal `gorm:"type:decimal(6,2)" json:"monthly_target_hours,omitempty"`

	// Annual target hours
	// ZMI: Jahressollstunden
	AnnualTargetHours *decimal.Decimal `gorm:"type:decimal(7,2)" json:"annual_target_hours,omitempty"`

	// =====================================================
	// ZMI RHYTHM FIELDS (Section 14.4-14.5)
	// =====================================================

	// RhythmType determines how time plans repeat
	// ZMI: Zeitplan-Modell
	RhythmType RhythmType `gorm:"type:varchar(20);default:'weekly'" json:"rhythm_type"`

	// CycleDays is the number of days in the cycle for x_days rhythm
	// ZMI: Tage im Zyklus
	CycleDays *int `gorm:"type:int" json:"cycle_days,omitempty"`

	// RhythmStartDate is when the rhythm/cycle starts (for calculating current position)
	// ZMI: Rhythmus-Startdatum
	RhythmStartDate *time.Time `gorm:"type:date" json:"rhythm_start_date,omitempty"`

	// =====================================================
	// ZMI FLEXTIME/MONTHLY EVALUATION FIELDS (Section 5)
	// =====================================================

	// Maximum monthly flextime credit (in minutes)
	// ZMI: Maximale Gleitzeit im Monat
	MaxFlextimePerMonth *int `gorm:"type:int" json:"max_flextime_per_month,omitempty"`

	// Upper limit for annual flextime account (in minutes)
	// ZMI: Obergrenze Jahreszeitkonto
	UpperLimitAnnual *int `gorm:"type:int" json:"upper_limit_annual,omitempty"`

	// Lower limit for annual flextime account (in minutes, can be negative)
	// ZMI: Untergrenze Jahreszeitkonto
	LowerLimitAnnual *int `gorm:"type:int" json:"lower_limit_annual,omitempty"`

	// Minimum overtime threshold to qualify for flextime credit (in minutes)
	// ZMI: Gleitzeitschwelle
	FlextimeThreshold *int `gorm:"type:int" json:"flextime_threshold,omitempty"`

	// How flextime is credited at month end
	// ZMI: Art der Gutschrift
	CreditType CreditType `gorm:"type:varchar(20);default:'no_evaluation'" json:"credit_type"`

	// =====================================================
	// TIMESTAMPS
	// =====================================================

	CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

	// Relations
	WeekPlan        *WeekPlan          `gorm:"foreignKey:WeekPlanID" json:"week_plan,omitempty"`
	Breaks          []TariffBreak      `gorm:"foreignKey:TariffID" json:"breaks,omitempty"`
	TariffWeekPlans []TariffWeekPlan   `gorm:"foreignKey:TariffID" json:"tariff_week_plans,omitempty"`
	TariffDayPlans  []TariffDayPlan    `gorm:"foreignKey:TariffID" json:"tariff_day_plans,omitempty"`
}

// =====================================================
// HELPER METHODS
// =====================================================

// GetAnnualVacationDays returns the base vacation days, with fallback to 30
func (t *Tariff) GetAnnualVacationDays() decimal.Decimal {
	if t.AnnualVacationDays != nil {
		return *t.AnnualVacationDays
	}
	return decimal.NewFromInt(30) // Default 30 days
}

// GetWorkDaysPerWeek returns work days per week, with fallback to 5
func (t *Tariff) GetWorkDaysPerWeek() int {
	if t.WorkDaysPerWeek != nil {
		return *t.WorkDaysPerWeek
	}
	return 5 // Default 5 days
}

// GetVacationBasis returns the vacation basis, with default calendar_year
func (t *Tariff) GetVacationBasis() VacationBasis {
	if t.VacationBasis == "" {
		return VacationBasisCalendarYear
	}
	return t.VacationBasis
}

// IsCalendarYearBasis returns true if vacation uses calendar year
func (t *Tariff) IsCalendarYearBasis() bool {
	return t.GetVacationBasis() == VacationBasisCalendarYear
}

// IsEntryDateBasis returns true if vacation uses entry date (anniversary)
func (t *Tariff) IsEntryDateBasis() bool {
	return t.GetVacationBasis() == VacationBasisEntryDate
}

// GetCreditType returns the credit type, with default no_evaluation
func (t *Tariff) GetCreditType() CreditType {
	if t.CreditType == "" {
		return CreditTypeNoEvaluation
	}
	return t.CreditType
}

// CalculateProRatedVacation calculates vacation for part-time employee
// workDaysActual: actual work days per week for the employee
func (t *Tariff) CalculateProRatedVacation(workDaysActual int) decimal.Decimal {
	baseDays := t.GetAnnualVacationDays()
	standardDays := t.GetWorkDaysPerWeek()

	if standardDays == 0 || workDaysActual >= standardDays {
		return baseDays
	}

	// Pro-rate: baseDays * (actual / standard)
	ratio := decimal.NewFromInt(int64(workDaysActual)).Div(decimal.NewFromInt(int64(standardDays)))
	return baseDays.Mul(ratio)
}

// GetVacationYearStart returns the start of the vacation year for a given date
func (t *Tariff) GetVacationYearStart(referenceDate time.Time, hireDate *time.Time) time.Time {
	if t.IsEntryDateBasis() && hireDate != nil {
		year := referenceDate.Year()
		anniversary := time.Date(year, hireDate.Month(), hireDate.Day(), 0, 0, 0, 0, time.UTC)
		if anniversary.After(referenceDate) {
			anniversary = anniversary.AddDate(-1, 0, 0)
		}
		return anniversary
	}
	return time.Date(referenceDate.Year(), 1, 1, 0, 0, 0, 0, time.UTC)
}

// GetVacationYearEnd returns the end of the vacation year for a given date
func (t *Tariff) GetVacationYearEnd(referenceDate time.Time, hireDate *time.Time) time.Time {
	start := t.GetVacationYearStart(referenceDate, hireDate)
	return start.AddDate(1, 0, -1)
}

// GetDailyTargetMinutes returns daily target in minutes
func (t *Tariff) GetDailyTargetMinutes() int {
	if t.DailyTargetHours != nil {
		return int(t.DailyTargetHours.Mul(decimal.NewFromInt(60)).IntPart())
	}
	return 0
}

// GetWeeklyTargetMinutes returns weekly target in minutes
func (t *Tariff) GetWeeklyTargetMinutes() int {
	if t.WeeklyTargetHours != nil {
		return int(t.WeeklyTargetHours.Mul(decimal.NewFromInt(60)).IntPart())
	}
	return 0
}

// GetRhythmType returns the rhythm type, with default weekly
func (t *Tariff) GetRhythmType() RhythmType {
	if t.RhythmType == "" {
		return RhythmTypeWeekly
	}
	return t.RhythmType
}

// GetDayPlanIDForDate returns the day plan ID for a specific date based on rhythm configuration.
// For weekly rhythm, uses the single week plan.
// For rolling_weekly rhythm, rotates through week plans based on weeks since start date.
// For x_days rhythm, cycles through day positions based on days since start date.
func (t *Tariff) GetDayPlanIDForDate(date time.Time) *uuid.UUID {
	switch t.GetRhythmType() {
	case RhythmTypeWeekly:
		// Simple: use single week plan
		if t.WeekPlan == nil {
			return nil
		}
		return t.WeekPlan.GetDayPlanIDForWeekday(date.Weekday())

	case RhythmTypeRollingWeekly:
		// Calculate which week in rotation
		if t.RhythmStartDate == nil || len(t.TariffWeekPlans) == 0 {
			return nil
		}
		weeksSinceStart := int(date.Sub(*t.RhythmStartDate).Hours() / (24 * 7))
		if weeksSinceStart < 0 {
			weeksSinceStart = 0 // Before start date, use first plan
		}
		cyclePosition := (weeksSinceStart % len(t.TariffWeekPlans)) + 1 // 1-based

		// Find week plan at this position
		for _, twp := range t.TariffWeekPlans {
			if twp.SequenceOrder == cyclePosition {
				if twp.WeekPlan != nil {
					return twp.WeekPlan.GetDayPlanIDForWeekday(date.Weekday())
				}
			}
		}
		return nil

	case RhythmTypeXDays:
		// Calculate position in day cycle
		if t.RhythmStartDate == nil || t.CycleDays == nil || *t.CycleDays == 0 {
			return nil
		}
		daysSinceStart := int(date.Sub(*t.RhythmStartDate).Hours() / 24)
		if daysSinceStart < 0 {
			daysSinceStart = 0
		}
		cyclePosition := (daysSinceStart % *t.CycleDays) + 1 // 1-based

		// Find day plan at this position
		for _, tdp := range t.TariffDayPlans {
			if tdp.DayPosition == cyclePosition {
				return tdp.DayPlanID
			}
		}
		return nil
	}

	return nil
}

// GetWeekPlanForDate returns the week plan for a specific date based on rhythm configuration.
// For weekly and rolling_weekly rhythms, returns the appropriate week plan.
// For x_days rhythm, returns nil (no week plan concept).
func (t *Tariff) GetWeekPlanForDate(date time.Time) *WeekPlan {
	switch t.GetRhythmType() {
	case RhythmTypeWeekly:
		return t.WeekPlan

	case RhythmTypeRollingWeekly:
		if t.RhythmStartDate == nil || len(t.TariffWeekPlans) == 0 {
			return nil
		}
		weeksSinceStart := int(date.Sub(*t.RhythmStartDate).Hours() / (24 * 7))
		if weeksSinceStart < 0 {
			weeksSinceStart = 0
		}
		cyclePosition := (weeksSinceStart % len(t.TariffWeekPlans)) + 1

		for _, twp := range t.TariffWeekPlans {
			if twp.SequenceOrder == cyclePosition {
				return twp.WeekPlan
			}
		}
		return nil

	case RhythmTypeXDays:
		// X-days rhythm doesn't use week plans
		return nil
	}

	return nil
}

func (Tariff) TableName() string {
	return "tariffs"
}

type TariffBreak struct {
	ID               uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TariffID         uuid.UUID `gorm:"type:uuid;not null;index" json:"tariff_id"`
	BreakType        BreakType `gorm:"type:varchar(20);not null" json:"break_type"`
	AfterWorkMinutes *int      `gorm:"type:int" json:"after_work_minutes,omitempty"`
	Duration         int       `gorm:"type:int;not null" json:"duration"`
	IsPaid           bool      `gorm:"default:false" json:"is_paid"`
	SortOrder        int       `gorm:"default:0" json:"sort_order"`
	CreatedAt        time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt        time.Time `gorm:"default:now()" json:"updated_at"`
}

func (TariffBreak) TableName() string {
	return "tariff_breaks"
}

// TariffWeekPlan links week plans to tariffs for rolling_weekly rhythm
type TariffWeekPlan struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TariffID      uuid.UUID `gorm:"type:uuid;not null;index" json:"tariff_id"`
	WeekPlanID    uuid.UUID `gorm:"type:uuid;not null" json:"week_plan_id"`
	SequenceOrder int       `gorm:"type:int;not null" json:"sequence_order"` // 1-based position in rotation
	CreatedAt     time.Time `gorm:"default:now()" json:"created_at"`

	// Relations
	WeekPlan *WeekPlan `gorm:"foreignKey:WeekPlanID" json:"week_plan,omitempty"`
}

func (TariffWeekPlan) TableName() string {
	return "tariff_week_plans"
}

// TariffDayPlan assigns day plans to positions in x_days rhythm
type TariffDayPlan struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TariffID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"tariff_id"`
	DayPosition int        `gorm:"type:int;not null" json:"day_position"` // 1-based position in cycle
	DayPlanID   *uuid.UUID `gorm:"type:uuid" json:"day_plan_id,omitempty"` // NULL = off day
	CreatedAt   time.Time  `gorm:"default:now()" json:"created_at"`

	// Relations
	DayPlan *DayPlan `gorm:"foreignKey:DayPlanID" json:"day_plan,omitempty"`
}

func (TariffDayPlan) TableName() string {
	return "tariff_day_plans"
}
