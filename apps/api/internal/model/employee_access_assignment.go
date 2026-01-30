package model

import (
	"time"

	"github.com/google/uuid"
)

// EmployeeAccessAssignment links employees to access profiles (placeholder).
type EmployeeAccessAssignment struct {
	ID              uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID        uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
	EmployeeID      uuid.UUID  `gorm:"type:uuid;not null;index" json:"employee_id"`
	AccessProfileID uuid.UUID  `gorm:"type:uuid;not null;index" json:"access_profile_id"`
	ValidFrom       *time.Time `gorm:"type:date" json:"valid_from,omitempty"`
	ValidTo         *time.Time `gorm:"type:date" json:"valid_to,omitempty"`
	IsActive        bool       `gorm:"default:true" json:"is_active"`
	CreatedAt       time.Time  `gorm:"default:now()" json:"created_at"`
	UpdatedAt       time.Time  `gorm:"default:now()" json:"updated_at"`

	// Relations
	Employee      *Employee      `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
	AccessProfile *AccessProfile `gorm:"foreignKey:AccessProfileID" json:"access_profile,omitempty"`
}

func (EmployeeAccessAssignment) TableName() string {
	return "employee_access_assignments"
}
