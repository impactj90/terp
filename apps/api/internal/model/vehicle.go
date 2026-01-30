package model

import (
	"time"

	"github.com/google/uuid"
)

// Vehicle represents a registered vehicle for mileage tracking (placeholder).
type Vehicle struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID     uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Code         string    `gorm:"type:varchar(50);not null" json:"code"`
	Name         string    `gorm:"type:varchar(255);not null" json:"name"`
	Description  string    `gorm:"type:text" json:"description,omitempty"`
	LicensePlate string    `gorm:"type:varchar(20)" json:"license_plate,omitempty"`
	IsActive     bool      `gorm:"default:true" json:"is_active"`
	SortOrder    int       `gorm:"default:0" json:"sort_order"`
	CreatedAt    time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt    time.Time `gorm:"default:now()" json:"updated_at"`
}

func (Vehicle) TableName() string {
	return "vehicles"
}
