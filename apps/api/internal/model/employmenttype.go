package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type EmploymentType struct {
	ID                 uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID           uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Code               string          `gorm:"type:varchar(50);not null" json:"code"`
	Name               string          `gorm:"type:varchar(255);not null" json:"name"`
	DefaultWeeklyHours decimal.Decimal `gorm:"column:weekly_hours_default;type:decimal(5,2);default:40.00" json:"default_weekly_hours"`
	IsActive            bool            `json:"is_active"`
	VacationCalcGroupID *uuid.UUID     `gorm:"type:uuid" json:"vacation_calc_group_id,omitempty"`
	CreatedAt           time.Time      `gorm:"default:now()" json:"created_at"`
	UpdatedAt           time.Time      `gorm:"default:now()" json:"updated_at"`

	// Relations
	VacationCalcGroup *VacationCalculationGroup `gorm:"foreignKey:VacationCalcGroupID" json:"vacation_calc_group,omitempty"`
}

func (EmploymentType) TableName() string {
	return "employment_types"
}
