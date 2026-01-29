package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type Tenant struct {
	ID   uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Name string    `gorm:"type:varchar(255);not null" json:"name"`
	Slug string    `gorm:"type:varchar(100);not null;uniqueIndex" json:"slug"`
	// Mandant master data fields
	AddressStreet         *string        `gorm:"type:varchar(255)" json:"address_street,omitempty"`
	AddressZip            *string        `gorm:"type:varchar(20)" json:"address_zip,omitempty"`
	AddressCity           *string        `gorm:"type:varchar(100)" json:"address_city,omitempty"`
	AddressCountry        *string        `gorm:"type:varchar(100)" json:"address_country,omitempty"`
	Phone                 *string        `gorm:"type:varchar(50)" json:"phone,omitempty"`
	Email                 *string        `gorm:"type:varchar(255)" json:"email,omitempty"`
	PayrollExportBasePath *string        `gorm:"type:text" json:"payroll_export_base_path,omitempty"`
	Notes                 *string        `gorm:"type:text" json:"notes,omitempty"`
	VacationBasis         VacationBasis  `gorm:"type:varchar(20);default:'calendar_year'" json:"vacation_basis"`
	Settings              datatypes.JSON `gorm:"type:jsonb;default:'{}'" json:"settings"`
	IsActive              bool           `gorm:"default:true" json:"is_active"`
	CreatedAt             time.Time      `gorm:"default:now()" json:"created_at"`
	UpdatedAt             time.Time      `gorm:"default:now()" json:"updated_at"`
}

func (Tenant) TableName() string {
	return "tenants"
}

// GetVacationBasis returns the vacation basis, defaulting to calendar_year.
func (t *Tenant) GetVacationBasis() VacationBasis {
	if t.VacationBasis == "" {
		return VacationBasisCalendarYear
	}
	return t.VacationBasis
}
