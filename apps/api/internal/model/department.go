package model

import (
	"time"

	"github.com/google/uuid"
)

type Department struct {
	ID                uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID          uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
	ParentID          *uuid.UUID `gorm:"type:uuid;index" json:"parent_id,omitempty"`
	Code              string     `gorm:"type:varchar(50);not null" json:"code"`
	Name              string     `gorm:"type:varchar(255);not null" json:"name"`
	Description       string     `gorm:"type:text" json:"description,omitempty"`
	ManagerEmployeeID *uuid.UUID `gorm:"type:uuid" json:"manager_employee_id,omitempty"`
	IsActive          bool       `gorm:"default:true" json:"is_active"`
	CreatedAt         time.Time  `gorm:"default:now()" json:"created_at"`
	UpdatedAt         time.Time  `gorm:"default:now()" json:"updated_at"`

	// Relations
	Parent   *Department  `gorm:"foreignKey:ParentID" json:"parent,omitempty"`
	Children []Department `gorm:"foreignKey:ParentID" json:"children,omitempty"`
	Manager  *Employee    `gorm:"foreignKey:ManagerEmployeeID" json:"manager,omitempty"`
}

func (Department) TableName() string {
	return "departments"
}

// IsRoot returns true if department has no parent
func (d *Department) IsRoot() bool {
	return d.ParentID == nil
}

// GetPath returns the path from root to this department
func (d *Department) GetPath() []Department {
	// Implementation requires recursive query or preloading
	// This is a placeholder - actual implementation in service layer
	return nil
}
