package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// ExtendedTravelRule represents an extended travel (Fernmontage) rule with
// arrival/departure/intermediate day rates and three-month rule (ZMI manual 10.14.2).
type ExtendedTravelRule struct {
	ID                     uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID               uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
	RuleSetID              uuid.UUID       `gorm:"type:uuid;not null" json:"rule_set_id"`
	ArrivalDayTaxFree      decimal.Decimal `gorm:"type:numeric(10,2);default:0" json:"arrival_day_tax_free"`
	ArrivalDayTaxable      decimal.Decimal `gorm:"type:numeric(10,2);default:0" json:"arrival_day_taxable"`
	DepartureDayTaxFree    decimal.Decimal `gorm:"type:numeric(10,2);default:0" json:"departure_day_tax_free"`
	DepartureDayTaxable    decimal.Decimal `gorm:"type:numeric(10,2);default:0" json:"departure_day_taxable"`
	IntermediateDayTaxFree decimal.Decimal `gorm:"type:numeric(10,2);default:0" json:"intermediate_day_tax_free"`
	IntermediateDayTaxable decimal.Decimal `gorm:"type:numeric(10,2);default:0" json:"intermediate_day_taxable"`
	ThreeMonthEnabled      bool            `gorm:"default:false" json:"three_month_enabled"`
	ThreeMonthTaxFree      decimal.Decimal `gorm:"type:numeric(10,2);default:0" json:"three_month_tax_free"`
	ThreeMonthTaxable      decimal.Decimal `gorm:"type:numeric(10,2);default:0" json:"three_month_taxable"`
	IsActive               bool            `gorm:"default:true" json:"is_active"`
	SortOrder              int             `gorm:"default:0" json:"sort_order"`
	CreatedAt              time.Time       `gorm:"default:now()" json:"created_at"`
	UpdatedAt              time.Time       `gorm:"default:now()" json:"updated_at"`

	// Associations
	RuleSet *TravelAllowanceRuleSet `gorm:"foreignKey:RuleSetID" json:"rule_set,omitempty"`
}

func (ExtendedTravelRule) TableName() string {
	return "extended_travel_rules"
}
