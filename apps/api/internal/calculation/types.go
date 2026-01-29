package calculation

import (
	"time"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

// BookingDirection indicates whether a booking is an arrival or departure.
type BookingDirection string

const (
	// DirectionIn represents arrivals (COME, BREAK_END).
	DirectionIn BookingDirection = "in"
	// DirectionOut represents departures (GO, BREAK_START).
	DirectionOut BookingDirection = "out"
)

// BookingCategory categorizes bookings by their purpose.
type BookingCategory string

const (
	// CategoryWork represents work shift bookings (COME/GO).
	CategoryWork BookingCategory = "work"
	// CategoryBreak represents break bookings (BREAK_START/BREAK_END).
	CategoryBreak BookingCategory = "break"
)

// BookingInput represents a single booking for calculation.
type BookingInput struct {
	ID        uuid.UUID
	Time      int              // Minutes from midnight (0-1439)
	Direction BookingDirection // "in" or "out"
	Category  BookingCategory  // "work" or "break"
	PairID    *uuid.UUID       // ID of paired booking, if any
}

// BreakType defines how breaks are configured.
type BreakType string

const (
	// BreakTypeFixed is a break at a specific time window.
	BreakTypeFixed BreakType = "fixed"
	// BreakTypeVariable is a flexible break based on work duration.
	BreakTypeVariable BreakType = "variable"
	// BreakTypeMinimum is a mandatory break after a work threshold.
	BreakTypeMinimum BreakType = "minimum"
)

// BreakConfig defines a break rule from the day plan.
type BreakConfig struct {
	Type              BreakType
	StartTime         *int // For fixed breaks: window start (minutes from midnight)
	EndTime           *int // For fixed breaks: window end (minutes from midnight)
	Duration          int  // Break duration in minutes
	AfterWorkMinutes  *int // For minimum breaks: trigger threshold
	AutoDeduct        bool // Automatically deduct from work time
	IsPaid            bool // Break counts toward regular hours
	MinutesDifference bool // For minimum breaks: proportional deduction when near threshold
}

// RoundingType defines how times are rounded.
type RoundingType string

const (
	RoundingNone     RoundingType = "none"
	RoundingUp       RoundingType = "up"
	RoundingDown     RoundingType = "down"
	RoundingNearest  RoundingType = "nearest"
	RoundingAdd      RoundingType = "add"
	RoundingSubtract RoundingType = "subtract"
)

// RoundingConfig defines rounding rules.
type RoundingConfig struct {
	Type     RoundingType
	Interval int // Rounding interval in minutes for up/down/nearest modes
	AddValue int // Fixed value to add/subtract for add/subtract modes
}

// ToleranceConfig defines tolerance/grace period rules.
type ToleranceConfig struct {
	ComePlus  int // Grace period for late arrivals (minutes)
	ComeMinus int // Grace period for early arrivals (minutes)
	GoPlus    int // Grace period for late departures (minutes)
	GoMinus   int // Grace period for early departures (minutes)
}

// DayPlanInput contains all configuration needed for calculation.
type DayPlanInput struct {
	// Plan metadata
	PlanType model.PlanType

	// Time windows (minutes from midnight)
	ComeFrom  *int // Earliest allowed arrival
	ComeTo    *int // Latest allowed arrival
	GoFrom    *int // Earliest allowed departure
	GoTo      *int // Latest allowed departure
	CoreStart *int // Flextime core hours start
	CoreEnd   *int // Flextime core hours end

	// Target hours
	RegularHours int // Target work duration in minutes

	// Rules
	Tolerance      ToleranceConfig
	RoundingCome   *RoundingConfig
	RoundingGo     *RoundingConfig
	Breaks         []BreakConfig
	MinWorkTime    *int // Minimum work duration
	MaxNetWorkTime *int // Maximum credited work time

	// VariableWorkTime enables tolerance_come_minus for evaluation window capping
	// ZMI: variable Arbeitszeit
	VariableWorkTime bool

	// RoundAllBookings applies rounding to every in/out booking.
	// When false (default), only the first arrival and last departure are rounded.
	// ZMI: Alle Buchungen runden
	RoundAllBookings bool
}

// CalculationInput contains all data needed for a day's calculation.
type CalculationInput struct {
	EmployeeID uuid.UUID
	Date       time.Time
	Bookings   []BookingInput
	DayPlan    DayPlanInput
}

// BookingPair represents a paired in/out booking.
type BookingPair struct {
	InBooking  *BookingInput
	OutBooking *BookingInput
	Category   BookingCategory
	Duration   int // Calculated duration in minutes
}

// CalculationResult contains all calculated values for a day.
type CalculationResult struct {
	// Time calculations (all in minutes)
	GrossTime  int // Total time before breaks
	NetTime    int // Time after breaks
	TargetTime int // Expected work time from day plan
	Overtime   int // max(0, NetTime - TargetTime)
	Undertime  int // max(0, TargetTime - NetTime)
	BreakTime  int // Total break duration

	// Booking summary
	FirstCome    *int // First arrival (minutes from midnight)
	LastGo       *int // Last departure (minutes from midnight)
	BookingCount int

	// Calculated times per booking (for updating Booking.CalculatedTime)
	CalculatedTimes map[uuid.UUID]int

	// Pairing results
	Pairs          []BookingPair
	UnpairedInIDs  []uuid.UUID
	UnpairedOutIDs []uuid.UUID

	// Capping results
	CappedTime int           // Total minutes capped from all sources
	Capping    CappingResult // Detailed capping breakdown

	// Status
	HasError   bool
	ErrorCodes []string
	Warnings   []string
}
