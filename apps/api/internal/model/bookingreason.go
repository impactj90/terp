package model

import (
	"time"

	"github.com/google/uuid"
)

// BookingReason represents a reason that can be selected when creating bookings.
type BookingReason struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID      uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	BookingTypeID uuid.UUID `gorm:"type:uuid;not null;index" json:"booking_type_id"`
	Code          string    `gorm:"type:varchar(50);not null" json:"code"`
	Label         string    `gorm:"type:varchar(255);not null" json:"label"`
	IsActive      bool      `gorm:"default:true" json:"is_active"`
	SortOrder     int       `gorm:"default:0" json:"sort_order"`
	CreatedAt     time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt     time.Time `gorm:"default:now()" json:"updated_at"`
}

func (BookingReason) TableName() string {
	return "booking_reasons"
}
