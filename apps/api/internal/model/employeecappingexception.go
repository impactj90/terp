package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// ExemptionType defines the type of capping exception.
type ExemptionType string

const (
	ExemptionTypeFull    ExemptionType = "full"
	ExemptionTypePartial ExemptionType = "partial"
)

// EmployeeCappingException defines an individual employee exception from capping rules.
// ZMI manual section 20.3.
type EmployeeCappingException struct {
	ID            uuid.UUID        `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID      uuid.UUID        `gorm:"type:uuid;not null;index" json:"tenant_id"`
	EmployeeID    uuid.UUID        `gorm:"type:uuid;not null;index" json:"employee_id"`
	CappingRuleID uuid.UUID        `gorm:"type:uuid;not null;index" json:"capping_rule_id"`
	ExemptionType ExemptionType    `gorm:"type:varchar(20);not null" json:"exemption_type"`
	RetainDays    *decimal.Decimal `gorm:"type:decimal(5,2)" json:"retain_days,omitempty"`
	Year          *int             `gorm:"type:int" json:"year,omitempty"`
	Notes         *string          `gorm:"type:text" json:"notes,omitempty"`
	IsActive      bool             `gorm:"default:true" json:"is_active"`
	CreatedAt     time.Time        `gorm:"default:now()" json:"created_at"`
	UpdatedAt     time.Time        `gorm:"default:now()" json:"updated_at"`

	// Relations
	Employee    *Employee           `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
	CappingRule *VacationCappingRule `gorm:"foreignKey:CappingRuleID" json:"capping_rule,omitempty"`
}

func (EmployeeCappingException) TableName() string {
	return "employee_capping_exceptions"
}
