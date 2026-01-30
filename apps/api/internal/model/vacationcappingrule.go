package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// CappingRuleType defines the type of vacation capping rule.
type CappingRuleType string

const (
	CappingRuleTypeYearEnd CappingRuleType = "year_end"
	CappingRuleTypeMidYear CappingRuleType = "mid_year"
)

// ValidCappingRuleTypes lists all valid capping rule types.
var ValidCappingRuleTypes = []CappingRuleType{
	CappingRuleTypeYearEnd,
	CappingRuleTypeMidYear,
}

// IsValidCappingRuleType checks if a type string is valid.
func IsValidCappingRuleType(t string) bool {
	for _, valid := range ValidCappingRuleTypes {
		if string(valid) == t {
			return true
		}
	}
	return false
}

// VacationCappingRule defines a vacation capping rule (Kappungsregel).
// ZMI manual section 20.
type VacationCappingRule struct {
	ID          uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Code        string          `gorm:"type:varchar(50);not null" json:"code"`
	Name        string          `gorm:"type:varchar(255);not null" json:"name"`
	Description *string         `gorm:"type:text" json:"description,omitempty"`
	RuleType    CappingRuleType `gorm:"type:varchar(20);not null;column:rule_type" json:"rule_type"`
	CutoffMonth int             `gorm:"type:int;not null;default:12" json:"cutoff_month"`
	CutoffDay   int             `gorm:"type:int;not null;default:31" json:"cutoff_day"`
	CapValue    decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"cap_value"`
	IsActive    bool            `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time       `gorm:"default:now()" json:"created_at"`
	UpdatedAt   time.Time       `gorm:"default:now()" json:"updated_at"`

	// Relations
	Tenant *Tenant `gorm:"foreignKey:TenantID" json:"tenant,omitempty"`
}

func (VacationCappingRule) TableName() string {
	return "vacation_capping_rules"
}

// CutoffDate returns the cutoff date for a given year.
func (r *VacationCappingRule) CutoffDate(year int) time.Time {
	return time.Date(year, time.Month(r.CutoffMonth), r.CutoffDay, 0, 0, 0, 0, time.UTC)
}
