package model

import (
	"time"

	"github.com/google/uuid"
)

// OverwriteBehavior controls how tariff assignment affects manual day plan edits.
type OverwriteBehavior string

const (
	OverwriteBehaviorOverwrite      OverwriteBehavior = "overwrite"
	OverwriteBehaviorPreserveManual OverwriteBehavior = "preserve_manual"
)

// EmployeeTariffAssignment represents a date-ranged tariff assignment for an employee.
type EmployeeTariffAssignment struct {
	ID                uuid.UUID         `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID          uuid.UUID         `gorm:"type:uuid;not null;index" json:"tenant_id"`
	EmployeeID        uuid.UUID         `gorm:"type:uuid;not null;index" json:"employee_id"`
	TariffID          uuid.UUID         `gorm:"type:uuid;not null;index" json:"tariff_id"`
	EffectiveFrom     time.Time         `gorm:"type:date;not null" json:"effective_from"`
	EffectiveTo       *time.Time        `gorm:"type:date" json:"effective_to,omitempty"`
	OverwriteBehavior OverwriteBehavior `gorm:"type:varchar(20);not null;default:preserve_manual" json:"overwrite_behavior"`
	Notes             string            `gorm:"type:text" json:"notes,omitempty"`
	IsActive          bool              `gorm:"default:true" json:"is_active"`
	CreatedAt         time.Time         `gorm:"default:now()" json:"created_at"`
	UpdatedAt         time.Time         `gorm:"default:now()" json:"updated_at"`

	// Relations
	Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
	Tariff   *Tariff   `gorm:"foreignKey:TariffID" json:"tariff,omitempty"`
}

func (EmployeeTariffAssignment) TableName() string {
	return "employee_tariff_assignments"
}

// ContainsDate returns true if the given date falls within the assignment's effective period.
func (a *EmployeeTariffAssignment) ContainsDate(date time.Time) bool {
	d := date.Truncate(24 * time.Hour)
	from := a.EffectiveFrom.Truncate(24 * time.Hour)
	if d.Before(from) {
		return false
	}
	if a.EffectiveTo != nil {
		to := a.EffectiveTo.Truncate(24 * time.Hour)
		if d.After(to) {
			return false
		}
	}
	return true
}
