package model

import (
	"time"

	"github.com/google/uuid"
)

// EmployeeDayPlanSource represents the origin of a day plan assignment.
type EmployeeDayPlanSource string

const (
	EmployeeDayPlanSourceTariff  EmployeeDayPlanSource = "tariff"
	EmployeeDayPlanSourceManual  EmployeeDayPlanSource = "manual"
	EmployeeDayPlanSourceHoliday EmployeeDayPlanSource = "holiday"
)

// EmployeeDayPlan represents an assigned day plan for an employee on a specific date.
type EmployeeDayPlan struct {
	ID         uuid.UUID             `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID   uuid.UUID             `gorm:"type:uuid;not null;index" json:"tenant_id"`
	EmployeeID uuid.UUID             `gorm:"type:uuid;not null;index" json:"employee_id"`
	PlanDate   time.Time             `gorm:"type:date;not null" json:"plan_date"`
	DayPlanID  *uuid.UUID            `gorm:"type:uuid" json:"day_plan_id,omitempty"`
	Source     EmployeeDayPlanSource `gorm:"type:varchar(20);default:'tariff'" json:"source"`
	Notes      string                `gorm:"type:text" json:"notes,omitempty"`
	CreatedAt  time.Time             `gorm:"default:now()" json:"created_at"`
	UpdatedAt  time.Time             `gorm:"default:now()" json:"updated_at"`

	// Relations
	Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
	DayPlan  *DayPlan  `gorm:"foreignKey:DayPlanID" json:"day_plan,omitempty"`
}

// TableName returns the database table name.
func (EmployeeDayPlan) TableName() string {
	return "employee_day_plans"
}

// IsOffDay returns true if no day plan is assigned (employee is off).
func (edp *EmployeeDayPlan) IsOffDay() bool {
	return edp.DayPlanID == nil
}
