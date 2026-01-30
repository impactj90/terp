package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// LocalTravelRule represents a local travel (Nahmontage) rule with distance/duration
// ranges and tax-free/taxable amounts (ZMI manual 10.14.1).
type LocalTravelRule struct {
	ID                 uuid.UUID        `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID           uuid.UUID        `gorm:"type:uuid;not null;index" json:"tenant_id"`
	RuleSetID          uuid.UUID        `gorm:"type:uuid;not null" json:"rule_set_id"`
	MinDistanceKm      decimal.Decimal  `gorm:"type:numeric(10,2);default:0" json:"min_distance_km"`
	MaxDistanceKm      *decimal.Decimal `gorm:"type:numeric(10,2)" json:"max_distance_km,omitempty"`
	MinDurationMinutes int              `gorm:"default:0" json:"min_duration_minutes"`
	MaxDurationMinutes *int             `json:"max_duration_minutes,omitempty"`
	TaxFreeAmount      decimal.Decimal  `gorm:"type:numeric(10,2);default:0" json:"tax_free_amount"`
	TaxableAmount      decimal.Decimal  `gorm:"type:numeric(10,2);default:0" json:"taxable_amount"`
	IsActive           bool             `gorm:"default:true" json:"is_active"`
	SortOrder          int              `gorm:"default:0" json:"sort_order"`
	CreatedAt          time.Time        `gorm:"default:now()" json:"created_at"`
	UpdatedAt          time.Time        `gorm:"default:now()" json:"updated_at"`

	// Associations
	RuleSet *TravelAllowanceRuleSet `gorm:"foreignKey:RuleSetID" json:"rule_set,omitempty"`
}

func (LocalTravelRule) TableName() string {
	return "local_travel_rules"
}
