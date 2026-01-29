package model

import (
	"time"

	"github.com/google/uuid"
)

type BookingDirection string

const (
	BookingDirectionIn  BookingDirection = "in"
	BookingDirectionOut BookingDirection = "out"
)

type BookingCategory string

const (
	BookingCategoryWork         BookingCategory = "work"
	BookingCategoryBreak        BookingCategory = "break"
	BookingCategoryBusinessTrip BookingCategory = "business_trip"
	BookingCategoryOther        BookingCategory = "other"
)

type BookingType struct {
	ID             uuid.UUID        `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID       *uuid.UUID       `gorm:"type:uuid;index" json:"tenant_id,omitempty"` // NULL for system types
	Code           string           `gorm:"type:varchar(20);not null" json:"code"`
	Name           string           `gorm:"type:varchar(255);not null" json:"name"`
	Description    *string          `gorm:"type:text" json:"description,omitempty"`
	Direction      BookingDirection `gorm:"type:varchar(10);not null" json:"direction"`
	Category       BookingCategory  `gorm:"type:varchar(30);not null;default:'work'" json:"category"`
	AccountID      *uuid.UUID       `gorm:"type:uuid;index" json:"account_id,omitempty"`
	RequiresReason bool             `gorm:"default:false" json:"requires_reason"`
	UsageCount     int              `gorm:"-" json:"usage_count"`
	IsSystem       bool             `gorm:"default:false" json:"is_system"`
	IsActive       bool             `gorm:"default:true" json:"is_active"`
	CreatedAt      time.Time        `gorm:"default:now()" json:"created_at"`
	UpdatedAt      time.Time        `gorm:"default:now()" json:"updated_at"`
}

func (BookingType) TableName() string {
	return "booking_types"
}

// IsInbound returns true if this is an inbound booking type (arrival)
func (bt *BookingType) IsInbound() bool {
	return bt.Direction == BookingDirectionIn
}

// IsOutbound returns true if this is an outbound booking type (departure)
func (bt *BookingType) IsOutbound() bool {
	return bt.Direction == BookingDirectionOut
}
