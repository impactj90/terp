package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// CalculationRule defines how absence days affect time accounts.
// ZMI manual section 15.3: account_value = value * factor.
// Exception: if value = 0 then account_value = daily_target_time * factor.
type CalculationRule struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Code        string     `gorm:"type:varchar(50);not null" json:"code"`
	Name        string     `gorm:"type:varchar(255);not null" json:"name"`
	Description *string    `gorm:"type:text" json:"description,omitempty"`
	AccountID   *uuid.UUID `gorm:"type:uuid;index" json:"account_id,omitempty"`
	Value       int        `gorm:"type:int;not null;default:0" json:"value"`
	Factor      float64    `gorm:"type:numeric(5,2);not null;default:1.00" json:"factor"`
	IsActive    bool       `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time  `gorm:"default:now()" json:"created_at"`
	UpdatedAt   time.Time  `gorm:"default:now()" json:"updated_at"`

	// Relations
	Account *Account `gorm:"foreignKey:AccountID" json:"account,omitempty"`
	Tenant  *Tenant  `gorm:"foreignKey:TenantID" json:"tenant,omitempty"`
}

func (CalculationRule) TableName() string {
	return "calculation_rules"
}

// Calculate computes the account value based on the rule.
// If Value is 0, dailyTargetMinutes is used instead.
// Returns: resultMinutes = effectiveValue * factor
func (cr *CalculationRule) Calculate(dailyTargetMinutes int) decimal.Decimal {
	effectiveValue := cr.Value
	if effectiveValue == 0 {
		effectiveValue = dailyTargetMinutes
	}
	return decimal.NewFromInt(int64(effectiveValue)).
		Mul(decimal.NewFromFloat(cr.Factor))
}
