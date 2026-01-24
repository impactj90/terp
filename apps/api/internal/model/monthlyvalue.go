package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// MonthlyValue represents monthly aggregation results for an employee.
type MonthlyValue struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID   uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	EmployeeID uuid.UUID `gorm:"type:uuid;not null;index" json:"employee_id"`

	// Period identification
	Year  int `gorm:"type:int;not null" json:"year"`
	Month int `gorm:"type:int;not null" json:"month"`

	// Aggregated time totals (all in minutes)
	TotalGrossTime  int `gorm:"default:0" json:"total_gross_time"`
	TotalNetTime    int `gorm:"default:0" json:"total_net_time"`
	TotalTargetTime int `gorm:"default:0" json:"total_target_time"`
	TotalOvertime   int `gorm:"default:0" json:"total_overtime"`
	TotalUndertime  int `gorm:"default:0" json:"total_undertime"`
	TotalBreakTime  int `gorm:"default:0" json:"total_break_time"`

	// Flextime balance (all in minutes)
	FlextimeStart     int `gorm:"default:0" json:"flextime_start"`
	FlextimeChange    int `gorm:"default:0" json:"flextime_change"`
	FlextimeEnd       int `gorm:"default:0" json:"flextime_end"`
	FlextimeCarryover int `gorm:"default:0" json:"flextime_carryover"`

	// Absence summary
	VacationTaken    decimal.Decimal `gorm:"type:decimal(5,2);default:0" json:"vacation_taken"`
	SickDays         int             `gorm:"default:0" json:"sick_days"`
	OtherAbsenceDays int             `gorm:"default:0" json:"other_absence_days"`

	// Work summary
	WorkDays       int `gorm:"default:0" json:"work_days"`
	DaysWithErrors int `gorm:"default:0" json:"days_with_errors"`

	// Month closing
	IsClosed   bool       `gorm:"default:false" json:"is_closed"`
	ClosedAt   *time.Time `gorm:"type:timestamptz" json:"closed_at,omitempty"`
	ClosedBy   *uuid.UUID `gorm:"type:uuid" json:"closed_by,omitempty"`
	ReopenedAt *time.Time `gorm:"type:timestamptz" json:"reopened_at,omitempty"`
	ReopenedBy *uuid.UUID `gorm:"type:uuid" json:"reopened_by,omitempty"`

	// Timestamps
	CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

	// Relations
	Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}

// TableName returns the database table name.
func (MonthlyValue) TableName() string {
	return "monthly_values"
}

// Balance returns the net flextime change (overtime - undertime).
func (mv *MonthlyValue) Balance() int {
	return mv.TotalOvertime - mv.TotalUndertime
}

// FormatFlextimeEnd returns the flextime end balance as HH:MM string with sign.
func (mv *MonthlyValue) FormatFlextimeEnd() string {
	if mv.FlextimeEnd < 0 {
		return "-" + MinutesToString(-mv.FlextimeEnd)
	}
	return MinutesToString(mv.FlextimeEnd)
}
