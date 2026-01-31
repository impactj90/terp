package model

import (
	"time"

	"github.com/google/uuid"
)

// Location represents a work location (office, site, remote).
type Location struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Code        string    `gorm:"type:varchar(20);not null" json:"code"`
	Name        string    `gorm:"type:varchar(255);not null" json:"name"`
	Description string    `gorm:"type:text;default:''" json:"description"`
	Address     string    `gorm:"type:text;default:''" json:"address"`
	City        string    `gorm:"type:varchar(255);default:''" json:"city"`
	Country     string    `gorm:"type:varchar(100);default:''" json:"country"`
	Timezone    string    `gorm:"type:varchar(100);default:''" json:"timezone"`
	IsActive    bool      `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt   time.Time `gorm:"default:now()" json:"updated_at"`
}

// TableName returns the database table name.
func (Location) TableName() string {
	return "locations"
}
