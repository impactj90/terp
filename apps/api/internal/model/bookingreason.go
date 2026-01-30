package model

import (
	"time"

	"github.com/google/uuid"
)

// ReferenceTime enum constants
const (
	ReferenceTimePlanStart   = "plan_start"
	ReferenceTimePlanEnd     = "plan_end"
	ReferenceTimeBookingTime = "booking_time"
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

	// Adjustment configuration (ZMI: Buchen mit Grund)
	ReferenceTime           *string    `gorm:"type:varchar(20)" json:"reference_time,omitempty"`
	OffsetMinutes           *int       `gorm:"type:int" json:"offset_minutes,omitempty"`
	AdjustmentBookingTypeID *uuid.UUID `gorm:"type:uuid" json:"adjustment_booking_type_id,omitempty"`

	CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`
}

func (BookingReason) TableName() string {
	return "booking_reasons"
}

// HasAdjustment returns true if this reason is configured to create derived bookings.
func (br *BookingReason) HasAdjustment() bool {
	return br.ReferenceTime != nil && br.OffsetMinutes != nil
}
