package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

// DailyValue represents calculated daily time tracking results for an employee.
type DailyValue struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID   uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	EmployeeID uuid.UUID `gorm:"type:uuid;not null;index" json:"employee_id"`
	ValueDate  time.Time `gorm:"type:date;not null" json:"value_date"`

	// Approval status
	Status DailyValueStatus `gorm:"type:varchar(20);not null;default:'calculated'" json:"status"`

	// Core time values (all in minutes)
	GrossTime  int `gorm:"default:0" json:"gross_time"`
	NetTime    int `gorm:"default:0" json:"net_time"`
	TargetTime int `gorm:"default:0" json:"target_time"`
	Overtime   int `gorm:"default:0" json:"overtime"`
	Undertime  int `gorm:"default:0" json:"undertime"`
	BreakTime  int `gorm:"default:0" json:"break_time"`

	// Status
	HasError   bool           `gorm:"default:false" json:"has_error"`
	ErrorCodes pq.StringArray `gorm:"type:text[]" json:"error_codes,omitempty"`
	Warnings   pq.StringArray `gorm:"type:text[]" json:"warnings,omitempty"`

	// Booking summary (times as minutes from midnight 0-1439)
	FirstCome    *int `gorm:"type:int" json:"first_come,omitempty"`
	LastGo       *int `gorm:"type:int" json:"last_go,omitempty"`
	BookingCount int  `gorm:"default:0" json:"booking_count"`

	// Calculation tracking
	CalculatedAt       *time.Time `gorm:"type:timestamptz" json:"calculated_at,omitempty"`
	CalculationVersion int        `gorm:"default:1" json:"calculation_version"`

	// Timestamps
	CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

	// Relations
	Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}

// DailyValueStatus represents approval status for daily values.
type DailyValueStatus string

const (
	DailyValueStatusPending    DailyValueStatus = "pending"
	DailyValueStatusCalculated DailyValueStatus = "calculated"
	DailyValueStatusError      DailyValueStatus = "error"
	DailyValueStatusApproved   DailyValueStatus = "approved"
)

// DailyValueListOptions defines filters for listing daily values.
type DailyValueListOptions struct {
	EmployeeID         *uuid.UUID
	DepartmentID       *uuid.UUID
	Status             *DailyValueStatus
	From               *time.Time
	To                 *time.Time
	HasErrors          *bool
	ScopeType          DataScopeType
	ScopeDepartmentIDs []uuid.UUID
	ScopeEmployeeIDs   []uuid.UUID
	Limit              int
	Offset             int
}

// TableName returns the database table name.
func (DailyValue) TableName() string {
	return "daily_values"
}

// Balance returns the net time difference (overtime - undertime).
func (dv *DailyValue) Balance() int {
	return dv.Overtime - dv.Undertime
}

// FormatGrossTime returns gross time as HH:MM string.
func (dv *DailyValue) FormatGrossTime() string {
	return MinutesToString(dv.GrossTime)
}

// FormatNetTime returns net time as HH:MM string.
func (dv *DailyValue) FormatNetTime() string {
	return MinutesToString(dv.NetTime)
}

// FormatTargetTime returns target time as HH:MM string.
func (dv *DailyValue) FormatTargetTime() string {
	return MinutesToString(dv.TargetTime)
}

// FormatBalance returns balance as HH:MM string with sign.
func (dv *DailyValue) FormatBalance() string {
	balance := dv.Balance()
	if balance < 0 {
		return "-" + MinutesToString(-balance)
	}
	return MinutesToString(balance)
}

// HasBookings returns true if there are any bookings for this day.
func (dv *DailyValue) HasBookings() bool {
	return dv.BookingCount > 0
}
