package model

import (
	"time"

	"github.com/google/uuid"
)

// DailyAccountValueSource defines the source of a daily account posting.
type DailyAccountValueSource string

const (
	DailyAccountValueSourceNetTime    DailyAccountValueSource = "net_time"
	DailyAccountValueSourceCappedTime DailyAccountValueSource = "capped_time"
)

// DailyAccountValue represents a daily account posting from calculation.
type DailyAccountValue struct {
	ID           uuid.UUID               `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID     uuid.UUID               `gorm:"type:uuid;not null;index" json:"tenant_id"`
	EmployeeID   uuid.UUID               `gorm:"type:uuid;not null;index" json:"employee_id"`
	AccountID    uuid.UUID               `gorm:"type:uuid;not null;index" json:"account_id"`
	ValueDate    time.Time               `gorm:"type:date;not null" json:"value_date"`
	ValueMinutes int                     `gorm:"default:0" json:"value_minutes"`
	Source       DailyAccountValueSource `gorm:"type:varchar(20);not null" json:"source"`
	DayPlanID    *uuid.UUID              `gorm:"type:uuid" json:"day_plan_id,omitempty"`

	CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

	// Relations
	Account  *Account  `gorm:"foreignKey:AccountID" json:"account,omitempty"`
	Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}

// TableName returns the database table name.
func (DailyAccountValue) TableName() string {
	return "daily_account_values"
}

// DailyAccountValueListOptions defines filters for listing daily account values.
type DailyAccountValueListOptions struct {
	EmployeeID *uuid.UUID
	AccountID  *uuid.UUID
	From       *time.Time
	To         *time.Time
	Source     *DailyAccountValueSource
}
