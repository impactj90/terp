package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// VacationSpecialCalcType defines the type of vacation special calculation.
type VacationSpecialCalcType string

const (
	VacationSpecialCalcAge        VacationSpecialCalcType = "age"
	VacationSpecialCalcTenure     VacationSpecialCalcType = "tenure"
	VacationSpecialCalcDisability VacationSpecialCalcType = "disability"
)

// ValidVacationSpecialCalcTypes lists all valid special calculation types.
var ValidVacationSpecialCalcTypes = []VacationSpecialCalcType{
	VacationSpecialCalcAge,
	VacationSpecialCalcTenure,
	VacationSpecialCalcDisability,
}

// IsValidVacationSpecialCalcType checks if a type string is valid.
func IsValidVacationSpecialCalcType(t string) bool {
	for _, valid := range ValidVacationSpecialCalcTypes {
		if string(valid) == t {
			return true
		}
	}
	return false
}

// VacationSpecialCalculation defines a special vacation calculation rule (Sonderberechnung).
// ZMI manual sections 19.2-19.4.
type VacationSpecialCalculation struct {
	ID          uuid.UUID               `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    uuid.UUID               `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Type        VacationSpecialCalcType  `gorm:"type:varchar(20);not null" json:"type"`
	Threshold   int                     `gorm:"type:int;not null;default:0" json:"threshold"`
	BonusDays   decimal.Decimal         `gorm:"type:decimal(5,2);not null" json:"bonus_days"`
	Description *string                 `gorm:"type:text" json:"description,omitempty"`
	IsActive    bool                    `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time               `gorm:"default:now()" json:"created_at"`
	UpdatedAt   time.Time               `gorm:"default:now()" json:"updated_at"`

	// Relations
	Tenant *Tenant `gorm:"foreignKey:TenantID" json:"tenant,omitempty"`
}

func (VacationSpecialCalculation) TableName() string {
	return "vacation_special_calculations"
}
