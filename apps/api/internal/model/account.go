package model

import (
	"time"

	"github.com/google/uuid"
)

type AccountType string

const (
	AccountTypeBonus    AccountType = "bonus"
	AccountTypeTracking AccountType = "tracking"
	AccountTypeBalance  AccountType = "balance"
)

type AccountUnit string

const (
	AccountUnitMinutes AccountUnit = "minutes"
	AccountUnitHours   AccountUnit = "hours"
	AccountUnitDays    AccountUnit = "days"
)

type Account struct {
	ID          uuid.UUID   `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    *uuid.UUID  `gorm:"type:uuid;index" json:"tenant_id,omitempty"` // NULL for system
	Code        string      `gorm:"type:varchar(50);not null" json:"code"`
	Name        string      `gorm:"type:varchar(255);not null" json:"name"`
	AccountType AccountType `gorm:"type:varchar(20);not null" json:"account_type"`
	Unit        AccountUnit `gorm:"type:varchar(20);not null;default:'minutes'" json:"unit"`
	IsSystem    bool        `json:"is_system"`
	IsActive    bool        `json:"is_active"`
	CreatedAt   time.Time   `gorm:"default:now()" json:"created_at"`
	UpdatedAt   time.Time   `gorm:"default:now()" json:"updated_at"`
}

func (Account) TableName() string {
	return "accounts"
}
