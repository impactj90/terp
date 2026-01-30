package model

import (
	"time"

	"github.com/google/uuid"
)

// TravelAllowanceRuleSet represents a travel allowance (Ausloese) rule set container
// with validity period and calculation options (ZMI manual 10.14).
type TravelAllowanceRuleSet struct {
	ID               uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID         uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Code             string     `gorm:"type:varchar(50);not null" json:"code"`
	Name             string     `gorm:"type:varchar(255);not null" json:"name"`
	Description      string     `gorm:"type:text" json:"description,omitempty"`
	ValidFrom        *time.Time `gorm:"type:date" json:"valid_from,omitempty"`
	ValidTo          *time.Time `gorm:"type:date" json:"valid_to,omitempty"`
	CalculationBasis string     `gorm:"type:varchar(20);default:'per_day'" json:"calculation_basis"`
	DistanceRule     string     `gorm:"type:varchar(20);default:'longest'" json:"distance_rule"`
	IsActive         bool       `gorm:"default:true" json:"is_active"`
	SortOrder        int        `gorm:"default:0" json:"sort_order"`
	CreatedAt        time.Time  `gorm:"default:now()" json:"created_at"`
	UpdatedAt        time.Time  `gorm:"default:now()" json:"updated_at"`
}

func (TravelAllowanceRuleSet) TableName() string {
	return "travel_allowance_rule_sets"
}
