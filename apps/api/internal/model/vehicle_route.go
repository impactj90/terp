package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// VehicleRoute represents a defined travel route (placeholder).
type VehicleRoute struct {
	ID          uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Code        string          `gorm:"type:varchar(50);not null" json:"code"`
	Name        string          `gorm:"type:varchar(255);not null" json:"name"`
	Description string          `gorm:"type:text" json:"description,omitempty"`
	DistanceKm  decimal.Decimal `gorm:"type:numeric(10,2)" json:"distance_km,omitempty"`
	IsActive    bool            `gorm:"default:true" json:"is_active"`
	SortOrder   int             `gorm:"default:0" json:"sort_order"`
	CreatedAt   time.Time       `gorm:"default:now()" json:"created_at"`
	UpdatedAt   time.Time       `gorm:"default:now()" json:"updated_at"`
}

func (VehicleRoute) TableName() string {
	return "vehicle_routes"
}
