package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// AbsenceStatus represents the approval status of an absence day.
type AbsenceStatus string

const (
	AbsenceStatusPending   AbsenceStatus = "pending"
	AbsenceStatusApproved  AbsenceStatus = "approved"
	AbsenceStatusRejected  AbsenceStatus = "rejected"
	AbsenceStatusCancelled AbsenceStatus = "cancelled"
)

// HalfDayPeriod represents which half of the day an absence covers.
type HalfDayPeriod string

const (
	HalfDayPeriodMorning   HalfDayPeriod = "morning"
	HalfDayPeriodAfternoon HalfDayPeriod = "afternoon"
)

// AbsenceListOptions defines filters for listing absence days across all employees.
type AbsenceListOptions struct {
	EmployeeID    *uuid.UUID
	AbsenceTypeID *uuid.UUID
	Status        *AbsenceStatus
	From          *time.Time
	To            *time.Time
	ScopeType          DataScopeType
	ScopeDepartmentIDs []uuid.UUID
	ScopeEmployeeIDs   []uuid.UUID
}

// AbsenceDay represents an employee absence record for a specific date.
type AbsenceDay struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID   uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	EmployeeID uuid.UUID `gorm:"type:uuid;not null;index" json:"employee_id"`
	CreatedAt  time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt  time.Time `gorm:"default:now()" json:"updated_at"`

	// The date and type of absence
	AbsenceDate   time.Time `gorm:"type:date;not null" json:"absence_date"`
	AbsenceTypeID uuid.UUID `gorm:"type:uuid;not null" json:"absence_type_id"`

	// Duration: 1.00 = full day, 0.50 = half day
	Duration decimal.Decimal `gorm:"type:decimal(3,2);not null;default:1.00" json:"duration"`

	// Half day specification (when duration = 0.5)
	HalfDayPeriod *HalfDayPeriod `gorm:"type:varchar(10)" json:"half_day_period,omitempty"`

	// Approval workflow
	Status          AbsenceStatus `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
	ApprovedBy      *uuid.UUID    `gorm:"type:uuid" json:"approved_by,omitempty"`
	ApprovedAt      *time.Time    `gorm:"type:timestamptz" json:"approved_at,omitempty"`
	RejectionReason *string       `gorm:"type:text" json:"rejection_reason,omitempty"`

	// Optional notes
	Notes *string `gorm:"type:text" json:"notes,omitempty"`

	// Audit
	CreatedBy *uuid.UUID `gorm:"type:uuid" json:"created_by,omitempty"`

	// Relations
	Employee    *Employee    `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
	AbsenceType *AbsenceType `gorm:"foreignKey:AbsenceTypeID" json:"absence_type,omitempty"`
}

func (AbsenceDay) TableName() string {
	return "absence_days"
}

// IsFullDay returns true if this is a full day absence.
func (ad *AbsenceDay) IsFullDay() bool {
	return ad.Duration.Equal(decimal.NewFromInt(1))
}

// IsHalfDay returns true if this is a half day absence.
func (ad *AbsenceDay) IsHalfDay() bool {
	return ad.Duration.Equal(decimal.NewFromFloat(0.5))
}

// IsApproved returns true if the absence has been approved.
func (ad *AbsenceDay) IsApproved() bool {
	return ad.Status == AbsenceStatusApproved
}

// IsCancelled returns true if the absence has been cancelled.
func (ad *AbsenceDay) IsCancelled() bool {
	return ad.Status == AbsenceStatusCancelled
}

// CalculateCredit computes the time credit for this absence day.
// Formula: regelarbeitszeit * absenceType.CreditMultiplier() * duration
// Requires AbsenceType relation to be preloaded.
// Returns 0 if AbsenceType is not loaded.
func (ad *AbsenceDay) CalculateCredit(regelarbeitszeit int) int {
	if ad.AbsenceType == nil {
		return 0
	}
	multiplier := ad.AbsenceType.CreditMultiplier()
	duration := ad.Duration.InexactFloat64()
	return int(float64(regelarbeitszeit) * multiplier * duration)
}
