package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type PlanType string

const (
	PlanTypeFixed    PlanType = "fixed"
	PlanTypeFlextime PlanType = "flextime"
)

type RoundingType string

const (
	RoundingNone     RoundingType = "none"
	RoundingUp       RoundingType = "up"
	RoundingDown     RoundingType = "down"
	RoundingNearest  RoundingType = "nearest"
	RoundingAdd      RoundingType = "add"
	RoundingSubtract RoundingType = "subtract"
)

// NoBookingBehavior defines how to handle days without bookings.
// ZMI: Tage ohne Buchungen
type NoBookingBehavior string

const (
	NoBookingError            NoBookingBehavior = "error"
	NoBookingDeductTarget     NoBookingBehavior = "deduct_target"
	NoBookingVocationalSchool NoBookingBehavior = "vocational_school"
	NoBookingAdoptTarget      NoBookingBehavior = "adopt_target"
	NoBookingTargetWithOrder  NoBookingBehavior = "target_with_order"
)

// DayChangeBehavior defines how to handle cross-midnight shifts.
// ZMI: Tageswechsel
type DayChangeBehavior string

const (
	DayChangeNone         DayChangeBehavior = "none"
	DayChangeAtArrival    DayChangeBehavior = "at_arrival"
	DayChangeAtDeparture  DayChangeBehavior = "at_departure"
	DayChangeAutoComplete DayChangeBehavior = "auto_complete"
)

type DayPlan struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Code        string    `gorm:"type:varchar(20);not null" json:"code"`
	Name        string    `gorm:"type:varchar(255);not null" json:"name"`
	Description *string   `gorm:"type:text" json:"description,omitempty"`
	PlanType    PlanType  `gorm:"type:varchar(20);not null;default:'fixed'" json:"plan_type"`

	// Time windows (minutes from midnight)
	ComeFrom  *int `gorm:"type:int" json:"come_from,omitempty"`
	ComeTo    *int `gorm:"type:int" json:"come_to,omitempty"`
	GoFrom    *int `gorm:"type:int" json:"go_from,omitempty"`
	GoTo      *int `gorm:"type:int" json:"go_to,omitempty"`
	CoreStart *int `gorm:"type:int" json:"core_start,omitempty"`
	CoreEnd   *int `gorm:"type:int" json:"core_end,omitempty"`

	// Target hours
	RegularHours int `gorm:"type:int;not null;default:480" json:"regular_hours"`
	// ZMI: Regelarbeitszeit 2 - alternative target for absence days
	RegularHours2 *int `gorm:"column:regular_hours_2;type:int" json:"regular_hours_2,omitempty"`
	// ZMI: Aus Personalstamm holen - get target from employee master
	FromEmployeeMaster bool `gorm:"default:false" json:"from_employee_master"`

	// Tolerance settings
	ToleranceComePlus  int `gorm:"type:int;default:0" json:"tolerance_come_plus"`
	ToleranceComeMinus int `gorm:"type:int;default:0" json:"tolerance_come_minus"`
	ToleranceGoPlus    int `gorm:"type:int;default:0" json:"tolerance_go_plus"`
	ToleranceGoMinus   int `gorm:"type:int;default:0" json:"tolerance_go_minus"`

	// Rounding settings
	RoundingComeType     *RoundingType `gorm:"type:varchar(20)" json:"rounding_come_type,omitempty"`
	RoundingComeInterval *int          `gorm:"type:int" json:"rounding_come_interval,omitempty"`
	RoundingGoType       *RoundingType `gorm:"type:varchar(20)" json:"rounding_go_type,omitempty"`
	RoundingGoInterval   *int          `gorm:"type:int" json:"rounding_go_interval,omitempty"`

	// Caps
	MinWorkTime    *int `gorm:"type:int" json:"min_work_time,omitempty"`
	MaxNetWorkTime *int `gorm:"type:int" json:"max_net_work_time,omitempty"`

	// ZMI: Variable Arbeitszeit - enables tolerance_come_minus for FAZ plans
	VariableWorkTime bool `gorm:"default:false" json:"variable_work_time"`

	// ZMI: Rounding extras
	RoundAllBookings     bool `gorm:"default:false" json:"round_all_bookings"`
	RoundingComeAddValue *int `gorm:"type:int" json:"rounding_come_add_value,omitempty"`
	RoundingGoAddValue   *int `gorm:"type:int" json:"rounding_go_add_value,omitempty"`

	// ZMI: Zeitgutschrift an Feiertagen - holiday time credits (minutes)
	HolidayCreditCat1 *int `gorm:"type:int" json:"holiday_credit_cat1,omitempty"`
	HolidayCreditCat2 *int `gorm:"type:int" json:"holiday_credit_cat2,omitempty"`
	HolidayCreditCat3 *int `gorm:"type:int" json:"holiday_credit_cat3,omitempty"`

	// ZMI: Urlaubsbewertung - vacation deduction value (1.0 = one day)
	VacationDeduction decimal.Decimal `gorm:"type:decimal(5,2);default:1.00" json:"vacation_deduction"`

	// ZMI: Tage ohne Buchungen - no-booking behavior
	NoBookingBehavior NoBookingBehavior `gorm:"type:varchar(30);default:'error'" json:"no_booking_behavior"`

	// ZMI: Tageswechsel - day change behavior
	DayChangeBehavior DayChangeBehavior `gorm:"type:varchar(30);default:'none'" json:"day_change_behavior"`

	// ZMI: Schichterkennung - shift detection windows (minutes from midnight)
	ShiftDetectArriveFrom *int `gorm:"type:int" json:"shift_detect_arrive_from,omitempty"`
	ShiftDetectArriveTo   *int `gorm:"type:int" json:"shift_detect_arrive_to,omitempty"`
	ShiftDetectDepartFrom *int `gorm:"type:int" json:"shift_detect_depart_from,omitempty"`
	ShiftDetectDepartTo   *int `gorm:"type:int" json:"shift_detect_depart_to,omitempty"`

	// ZMI: Alternative day plans for shift detection (up to 6)
	ShiftAltPlan1 *uuid.UUID `gorm:"column:shift_alt_plan_1;type:uuid" json:"shift_alt_plan_1,omitempty"`
	ShiftAltPlan2 *uuid.UUID `gorm:"column:shift_alt_plan_2;type:uuid" json:"shift_alt_plan_2,omitempty"`
	ShiftAltPlan3 *uuid.UUID `gorm:"column:shift_alt_plan_3;type:uuid" json:"shift_alt_plan_3,omitempty"`
	ShiftAltPlan4 *uuid.UUID `gorm:"column:shift_alt_plan_4;type:uuid" json:"shift_alt_plan_4,omitempty"`
	ShiftAltPlan5 *uuid.UUID `gorm:"column:shift_alt_plan_5;type:uuid" json:"shift_alt_plan_5,omitempty"`
	ShiftAltPlan6 *uuid.UUID `gorm:"column:shift_alt_plan_6;type:uuid" json:"shift_alt_plan_6,omitempty"`

	// ZMI: Tagesnetto-Konto - account for posting daily net time
	NetAccountID *uuid.UUID `gorm:"column:net_account_id;type:uuid" json:"net_account_id,omitempty"`
	// ZMI: Kappungskonto - account for posting capped minutes
	CapAccountID *uuid.UUID `gorm:"column:cap_account_id;type:uuid" json:"cap_account_id,omitempty"`

	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

	// Relations
	Breaks  []DayPlanBreak `gorm:"foreignKey:DayPlanID" json:"breaks,omitempty"`
	Bonuses []DayPlanBonus `gorm:"foreignKey:DayPlanID" json:"bonuses,omitempty"`
}

func (DayPlan) TableName() string {
	return "day_plans"
}

// GetEffectiveRegularHours returns the target minutes for a day.
// Priority: employee master > absence day alternative > standard regular hours.
func (dp *DayPlan) GetEffectiveRegularHours(isAbsenceDay bool, employeeTargetMinutes *int) int {
	// If configured to get from employee master and value is available, use it
	if dp.FromEmployeeMaster && employeeTargetMinutes != nil {
		return *employeeTargetMinutes
	}
	// If absence day and alternative target is configured, use it
	if isAbsenceDay && dp.RegularHours2 != nil {
		return *dp.RegularHours2
	}
	return dp.RegularHours
}

// GetHolidayCredit returns the holiday time credit in minutes for the given category.
// Categories: 1 = full holiday, 2 = half holiday, 3 = custom.
// Returns 0 if the category is not configured.
func (dp *DayPlan) GetHolidayCredit(category int) int {
	switch category {
	case 1:
		if dp.HolidayCreditCat1 != nil {
			return *dp.HolidayCreditCat1
		}
	case 2:
		if dp.HolidayCreditCat2 != nil {
			return *dp.HolidayCreditCat2
		}
	case 3:
		if dp.HolidayCreditCat3 != nil {
			return *dp.HolidayCreditCat3
		}
	}
	return 0
}

// HasShiftDetection returns true if shift detection windows are configured.
func (dp *DayPlan) HasShiftDetection() bool {
	return dp.ShiftDetectArriveFrom != nil || dp.ShiftDetectArriveTo != nil ||
		dp.ShiftDetectDepartFrom != nil || dp.ShiftDetectDepartTo != nil
}

// GetAlternativePlanIDs returns all configured alternative day plan IDs for shift detection.
func (dp *DayPlan) GetAlternativePlanIDs() []uuid.UUID {
	ids := make([]uuid.UUID, 0, 6)
	if dp.ShiftAltPlan1 != nil {
		ids = append(ids, *dp.ShiftAltPlan1)
	}
	if dp.ShiftAltPlan2 != nil {
		ids = append(ids, *dp.ShiftAltPlan2)
	}
	if dp.ShiftAltPlan3 != nil {
		ids = append(ids, *dp.ShiftAltPlan3)
	}
	if dp.ShiftAltPlan4 != nil {
		ids = append(ids, *dp.ShiftAltPlan4)
	}
	if dp.ShiftAltPlan5 != nil {
		ids = append(ids, *dp.ShiftAltPlan5)
	}
	if dp.ShiftAltPlan6 != nil {
		ids = append(ids, *dp.ShiftAltPlan6)
	}
	return ids
}

type BreakType string

const (
	BreakTypeFixed    BreakType = "fixed"
	BreakTypeVariable BreakType = "variable"
	BreakTypeMinimum  BreakType = "minimum"
)

type DayPlanBreak struct {
	ID               uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	DayPlanID        uuid.UUID `gorm:"type:uuid;not null;index" json:"day_plan_id"`
	BreakType        BreakType `gorm:"type:varchar(20);not null" json:"break_type"`
	StartTime        *int      `gorm:"type:int" json:"start_time,omitempty"`
	EndTime          *int      `gorm:"type:int" json:"end_time,omitempty"`
	Duration         int       `gorm:"type:int;not null" json:"duration"`
	AfterWorkMinutes *int      `gorm:"type:int" json:"after_work_minutes,omitempty"`
	AutoDeduct       bool      `gorm:"default:true" json:"auto_deduct"`
	IsPaid           bool      `gorm:"default:false" json:"is_paid"`
	// ZMI: Minuten Differenz - proportional deduction when near threshold
	MinutesDifference bool      `gorm:"default:false" json:"minutes_difference"`
	SortOrder         int       `gorm:"default:0" json:"sort_order"`
	CreatedAt         time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt         time.Time `gorm:"default:now()" json:"updated_at"`
}

func (DayPlanBreak) TableName() string {
	return "day_plan_breaks"
}

type CalculationType string

const (
	CalculationFixed      CalculationType = "fixed"
	CalculationPerMinute  CalculationType = "per_minute"
	CalculationPercentage CalculationType = "percentage"
)

type DayPlanBonus struct {
	ID               uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	DayPlanID        uuid.UUID       `gorm:"type:uuid;not null;index" json:"day_plan_id"`
	AccountID        uuid.UUID       `gorm:"type:uuid;not null;index" json:"account_id"`
	TimeFrom         int             `gorm:"type:int;not null" json:"time_from"`
	TimeTo           int             `gorm:"type:int;not null" json:"time_to"`
	CalculationType  CalculationType `gorm:"type:varchar(20);not null" json:"calculation_type"`
	ValueMinutes     int             `gorm:"type:int;not null" json:"value_minutes"`
	MinWorkMinutes   *int            `gorm:"type:int" json:"min_work_minutes,omitempty"`
	AppliesOnHoliday bool            `gorm:"default:false" json:"applies_on_holiday"`
	SortOrder        int             `gorm:"default:0" json:"sort_order"`
	CreatedAt        time.Time       `gorm:"default:now()" json:"created_at"`
	UpdatedAt        time.Time       `gorm:"default:now()" json:"updated_at"`

	// Relations
	Account *Account `gorm:"foreignKey:AccountID" json:"account,omitempty"`
}

func (DayPlanBonus) TableName() string {
	return "day_plan_bonuses"
}
