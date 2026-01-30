package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// TripRecord represents an individual trip mileage log (placeholder).
type TripRecord struct {
	ID           uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID     uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
	VehicleID    uuid.UUID       `gorm:"type:uuid;not null" json:"vehicle_id"`
	RouteID      *uuid.UUID      `gorm:"type:uuid" json:"route_id,omitempty"`
	TripDate     time.Time       `gorm:"type:date;not null" json:"trip_date"`
	StartMileage decimal.Decimal `gorm:"type:numeric(10,1)" json:"start_mileage,omitempty"`
	EndMileage   decimal.Decimal `gorm:"type:numeric(10,1)" json:"end_mileage,omitempty"`
	DistanceKm   decimal.Decimal `gorm:"type:numeric(10,2)" json:"distance_km,omitempty"`
	Notes        string          `gorm:"type:text" json:"notes,omitempty"`
	CreatedAt    time.Time       `gorm:"default:now()" json:"created_at"`
	UpdatedAt    time.Time       `gorm:"default:now()" json:"updated_at"`

	// Associations (for preloading)
	Vehicle      *Vehicle      `gorm:"foreignKey:VehicleID" json:"vehicle,omitempty"`
	VehicleRoute *VehicleRoute `gorm:"foreignKey:RouteID" json:"route,omitempty"`
}

func (TripRecord) TableName() string {
	return "trip_records"
}
