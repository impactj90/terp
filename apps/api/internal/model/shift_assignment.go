package model

import (
	"time"

	"github.com/google/uuid"
)

// ShiftAssignment links an employee to a shift for a date range (placeholder).
type ShiftAssignment struct {
	ID         uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID   uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
	EmployeeID uuid.UUID  `gorm:"type:uuid;not null;index" json:"employee_id"`
	ShiftID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"shift_id"`
	ValidFrom  *time.Time `gorm:"type:date" json:"valid_from,omitempty"`
	ValidTo    *time.Time `gorm:"type:date" json:"valid_to,omitempty"`
	Notes      string     `gorm:"type:text" json:"notes,omitempty"`
	IsActive   bool       `gorm:"default:true" json:"is_active"`
	CreatedAt  time.Time  `gorm:"default:now()" json:"created_at"`
	UpdatedAt  time.Time  `gorm:"default:now()" json:"updated_at"`

	// Relations
	Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
	Shift    *Shift    `gorm:"foreignKey:ShiftID" json:"shift,omitempty"`
}

func (ShiftAssignment) TableName() string {
	return "shift_assignments"
}
