package model

import (
	"time"

	"github.com/google/uuid"
)

// AbsenceCategory represents the category of absence.
type AbsenceCategory string

const (
	AbsenceCategoryVacation AbsenceCategory = "vacation"
	AbsenceCategoryIllness  AbsenceCategory = "illness"
	AbsenceCategorySpecial  AbsenceCategory = "special"
	AbsenceCategoryUnpaid   AbsenceCategory = "unpaid"
)

// AbsencePortion represents how much of Regelarbeitszeit to credit.
// ZMI: Anteil field (0=none, 1=full, 2=half)
type AbsencePortion int

const (
	AbsencePortionNone AbsencePortion = 0
	AbsencePortionFull AbsencePortion = 1
	AbsencePortionHalf AbsencePortion = 2
)

// AbsenceType represents an absence type definition.
type AbsenceType struct {
	ID        uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID  *uuid.UUID `gorm:"type:uuid;index" json:"tenant_id,omitempty"`
	CreatedAt time.Time  `gorm:"default:now()" json:"created_at"`
	UpdatedAt time.Time  `gorm:"default:now()" json:"updated_at"`

	// Identification
	Code        string          `gorm:"type:varchar(10);not null" json:"code"`
	Name        string          `gorm:"type:varchar(100);not null" json:"name"`
	Description *string         `gorm:"type:text" json:"description,omitempty"`
	Category    AbsenceCategory `gorm:"type:varchar(20);not null" json:"category"`

	// ZMI: Anteil - determines time credit
	Portion AbsencePortion `gorm:"type:int;not null;default:1" json:"portion"`

	// ZMI: Kürzel am Feiertag - alternative code on holidays
	HolidayCode *string `gorm:"type:varchar(10)" json:"holiday_code,omitempty"`

	// ZMI: Priorität - higher wins when holiday + absence overlap
	Priority int `gorm:"type:int;not null;default:0" json:"priority"`

	// Behavior flags
	DeductsVacation  bool `gorm:"default:false" json:"deducts_vacation"`
	RequiresApproval bool `gorm:"default:true" json:"requires_approval"`
	RequiresDocument bool `gorm:"default:false" json:"requires_document"`

	// Display
	Color     string `gorm:"type:varchar(7);default:'#808080'" json:"color"`
	SortOrder int    `gorm:"type:int;default:0" json:"sort_order"`

	// Status
	IsSystem bool `gorm:"default:false" json:"is_system"`
	IsActive bool `gorm:"default:true" json:"is_active"`

	// Group assignment
	AbsenceTypeGroupID *uuid.UUID        `gorm:"type:uuid" json:"absence_type_group_id,omitempty"`
	AbsenceTypeGroup   *AbsenceTypeGroup `gorm:"foreignKey:AbsenceTypeGroupID" json:"absence_type_group,omitempty"`

	// Calculation rule
	CalculationRuleID *uuid.UUID       `gorm:"type:uuid" json:"calculation_rule_id,omitempty"`
	CalculationRule   *CalculationRule `gorm:"foreignKey:CalculationRuleID" json:"calculation_rule,omitempty"`

	// Relations
	Tenant *Tenant `gorm:"foreignKey:TenantID" json:"tenant,omitempty"`
}

func (AbsenceType) TableName() string {
	return "absence_types"
}

// CreditMultiplier returns the multiplier for Regelarbeitszeit.
func (at *AbsenceType) CreditMultiplier() float64 {
	switch at.Portion {
	case AbsencePortionNone:
		return 0.0
	case AbsencePortionFull:
		return 1.0
	case AbsencePortionHalf:
		return 0.5
	default:
		return 1.0
	}
}

// CalculateCredit computes the time credit for an absence day.
// Formula: Regelarbeitszeit (minutes) * CreditMultiplier
func (at *AbsenceType) CalculateCredit(regelarbeitszeit int) int {
	return int(float64(regelarbeitszeit) * at.CreditMultiplier())
}

// GetEffectiveCode returns the holiday_code if on a holiday, otherwise the regular code.
func (at *AbsenceType) GetEffectiveCode(isHoliday bool) string {
	if isHoliday && at.HolidayCode != nil && *at.HolidayCode != "" {
		return *at.HolidayCode
	}
	return at.Code
}

// IsVacationType returns true if this is a vacation-related absence.
func (at *AbsenceType) IsVacationType() bool {
	return at.Category == AbsenceCategoryVacation
}

// IsIllnessType returns true if this is an illness-related absence.
func (at *AbsenceType) IsIllnessType() bool {
	return at.Category == AbsenceCategoryIllness
}
