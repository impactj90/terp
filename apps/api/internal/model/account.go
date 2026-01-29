package model

import (
	"time"

	"github.com/google/uuid"
)

type AccountType string

const (
	AccountTypeBonus AccountType = "bonus"
	AccountTypeDay   AccountType = "day"
	AccountTypeMonth AccountType = "month"
)

type DisplayFormat string

const (
	DisplayFormatDecimal DisplayFormat = "decimal"
	DisplayFormatHHMM    DisplayFormat = "hh_mm"
)

type AccountUnit string

const (
	AccountUnitMinutes AccountUnit = "minutes"
	AccountUnitHours   AccountUnit = "hours"
	AccountUnitDays    AccountUnit = "days"
)

type Account struct {
	ID                uuid.UUID     `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID          *uuid.UUID    `gorm:"type:uuid;index" json:"tenant_id,omitempty"` // NULL for system
	Code              string        `gorm:"type:varchar(50);not null" json:"code"`
	Name              string        `gorm:"type:varchar(255);not null" json:"name"`
	Description       *string       `gorm:"type:text" json:"description,omitempty"`
	AccountType       AccountType   `gorm:"type:varchar(20);not null" json:"account_type"`
	Unit              AccountUnit   `gorm:"type:varchar(20);not null;default:'minutes'" json:"unit"`
	DisplayFormat     DisplayFormat `gorm:"type:varchar(20);not null;default:'decimal'" json:"display_format"`
	BonusFactor       *float64      `gorm:"type:numeric(5,2)" json:"bonus_factor,omitempty"`
	AccountGroupID    *uuid.UUID    `gorm:"type:uuid;index" json:"account_group_id,omitempty"`
	YearCarryover     bool          `gorm:"default:true" json:"year_carryover"`
	IsPayrollRelevant bool          `gorm:"default:false" json:"is_payroll_relevant"`
	PayrollCode       *string       `gorm:"type:varchar(50)" json:"payroll_code,omitempty"`
	SortOrder         int           `gorm:"default:0" json:"sort_order"`
	UsageCount        int           `gorm:"-" json:"usage_count"`
	IsSystem          bool          `json:"is_system"`
	IsActive          bool          `json:"is_active"`
	CreatedAt         time.Time     `gorm:"default:now()" json:"created_at"`
	UpdatedAt         time.Time     `gorm:"default:now()" json:"updated_at"`
}

// AccountUsageDayPlan represents a day plan that references an account.
type AccountUsageDayPlan struct {
	ID   uuid.UUID `json:"id"`
	Code string    `json:"code"`
	Name string    `json:"name"`
}

func (Account) TableName() string {
	return "accounts"
}
