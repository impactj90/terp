package model

import (
	"time"

	"github.com/google/uuid"
)

// VacationCappingRuleGroup defines a group of vacation capping rules.
// Groups are assigned to tariffs to determine which capping rules apply.
type VacationCappingRuleGroup struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Code        string    `gorm:"type:varchar(50);not null" json:"code"`
	Name        string    `gorm:"type:varchar(255);not null" json:"name"`
	Description *string   `gorm:"type:text" json:"description,omitempty"`
	IsActive    bool      `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt   time.Time `gorm:"default:now()" json:"updated_at"`

	// Relations
	Tenant       *Tenant              `gorm:"foreignKey:TenantID" json:"tenant,omitempty"`
	CappingRules []VacationCappingRule `gorm:"many2many:vacation_capping_rule_group_rules;foreignKey:ID;joinForeignKey:GroupID;References:ID;joinReferences:CappingRuleID" json:"capping_rules,omitempty"`
}

func (VacationCappingRuleGroup) TableName() string {
	return "vacation_capping_rule_groups"
}

// VacationCappingRuleGroupRule is the junction table linking groups to capping rules.
type VacationCappingRuleGroupRule struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	GroupID       uuid.UUID `gorm:"type:uuid;not null" json:"group_id"`
	CappingRuleID uuid.UUID `gorm:"type:uuid;not null" json:"capping_rule_id"`
	CreatedAt     time.Time `gorm:"default:now()" json:"created_at"`
}

func (VacationCappingRuleGroupRule) TableName() string {
	return "vacation_capping_rule_group_rules"
}
