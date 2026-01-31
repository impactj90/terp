package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// MonthlyEvaluationTemplate represents an evaluation template for monthly reports.
type MonthlyEvaluationTemplate struct {
	ID                   uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID             uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Name                 string          `gorm:"type:varchar(100);not null" json:"name"`
	Description          string          `gorm:"type:text;default:''" json:"description"`
	FlextimeCapPositive  int             `gorm:"not null;default:0" json:"flextime_cap_positive"`
	FlextimeCapNegative  int             `gorm:"not null;default:0" json:"flextime_cap_negative"`
	OvertimeThreshold    int             `gorm:"not null;default:0" json:"overtime_threshold"`
	MaxCarryoverVacation decimal.Decimal `gorm:"type:numeric(10,2);not null;default:0" json:"max_carryover_vacation"`
	IsDefault            bool            `gorm:"not null;default:false" json:"is_default"`
	IsActive             bool            `gorm:"not null;default:true" json:"is_active"`
	CreatedAt            time.Time       `gorm:"default:now()" json:"created_at"`
	UpdatedAt            time.Time       `gorm:"default:now()" json:"updated_at"`
}

// TableName returns the database table name.
func (MonthlyEvaluationTemplate) TableName() string {
	return "monthly_evaluation_templates"
}
