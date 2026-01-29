package model

import (
	"time"

	"github.com/google/uuid"
)

// BookingTypeGroup represents a group of booking types that controls terminal availability.
type BookingTypeGroup struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Code        string    `gorm:"type:varchar(50);not null" json:"code"`
	Name        string    `gorm:"type:varchar(255);not null" json:"name"`
	Description *string   `gorm:"type:text" json:"description,omitempty"`
	IsActive    bool      `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt   time.Time `gorm:"default:now()" json:"updated_at"`
}

func (BookingTypeGroup) TableName() string {
	return "booking_type_groups"
}

// BookingTypeGroupMember represents membership of a booking type in a group.
type BookingTypeGroupMember struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	GroupID       uuid.UUID `gorm:"type:uuid;not null;index" json:"group_id"`
	BookingTypeID uuid.UUID `gorm:"type:uuid;not null;index" json:"booking_type_id"`
	SortOrder     int       `gorm:"default:0" json:"sort_order"`
	CreatedAt     time.Time `gorm:"default:now()" json:"created_at"`
}

func (BookingTypeGroupMember) TableName() string {
	return "booking_type_group_members"
}
