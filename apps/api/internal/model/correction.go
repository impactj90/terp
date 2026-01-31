package model

import (
	"time"

	"github.com/google/uuid"
)

// Correction represents a manual correction to time records or account balances.
type Correction struct {
	ID             uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID       uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
	EmployeeID     uuid.UUID  `gorm:"type:uuid;not null;index" json:"employee_id"`
	CorrectionDate time.Time  `gorm:"type:date;not null" json:"correction_date"`
	CorrectionType string     `gorm:"type:varchar(50);not null" json:"correction_type"`
	AccountID      *uuid.UUID `gorm:"type:uuid" json:"account_id"`
	ValueMinutes   int        `gorm:"not null" json:"value_minutes"`
	Reason         string     `gorm:"type:text;not null;default:''" json:"reason"`
	Status         string     `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
	ApprovedBy     *uuid.UUID `gorm:"type:uuid" json:"approved_by"`
	ApprovedAt     *time.Time `json:"approved_at"`
	CreatedBy      *uuid.UUID `gorm:"type:uuid" json:"created_by"`
	CreatedAt      time.Time  `gorm:"default:now()" json:"created_at"`
	UpdatedAt      time.Time  `gorm:"default:now()" json:"updated_at"`
}

// TableName returns the database table name.
func (Correction) TableName() string {
	return "corrections"
}
