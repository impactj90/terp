package model

import (
	"time"

	"github.com/google/uuid"
)

// VacationCalculationGroup defines a vacation calculation group (Berechnungsgruppe).
// Groups combine a basis (calendar year or entry date) with a set of special calculations.
// ZMI manual section 19.1.
type VacationCalculationGroup struct {
	ID          uuid.UUID     `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    uuid.UUID     `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Code        string        `gorm:"type:varchar(50);not null" json:"code"`
	Name        string        `gorm:"type:varchar(255);not null" json:"name"`
	Description *string       `gorm:"type:text" json:"description,omitempty"`
	Basis       VacationBasis `gorm:"type:varchar(20);not null;default:'calendar_year'" json:"basis"`
	IsActive    bool          `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time     `gorm:"default:now()" json:"created_at"`
	UpdatedAt   time.Time     `gorm:"default:now()" json:"updated_at"`

	// Relations
	Tenant              *Tenant                      `gorm:"foreignKey:TenantID" json:"tenant,omitempty"`
	SpecialCalculations []VacationSpecialCalculation `gorm:"many2many:vacation_calc_group_special_calcs;foreignKey:ID;joinForeignKey:GroupID;References:ID;joinReferences:SpecialCalculationID" json:"special_calculations,omitempty"`
}

func (VacationCalculationGroup) TableName() string {
	return "vacation_calculation_groups"
}

// VacationCalcGroupSpecialCalc is the junction table linking groups to special calculations.
type VacationCalcGroupSpecialCalc struct {
	ID                   uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	GroupID              uuid.UUID `gorm:"type:uuid;not null" json:"group_id"`
	SpecialCalculationID uuid.UUID `gorm:"type:uuid;not null" json:"special_calculation_id"`
	CreatedAt            time.Time `gorm:"default:now()" json:"created_at"`
}

func (VacationCalcGroupSpecialCalc) TableName() string {
	return "vacation_calc_group_special_calcs"
}
