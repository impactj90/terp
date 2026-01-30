package model

import (
	"time"

	"github.com/google/uuid"
)

type OrderBookingSource string

const (
	OrderBookingSourceManual OrderBookingSource = "manual"
	OrderBookingSourceAuto   OrderBookingSource = "auto"
	OrderBookingSourceImport OrderBookingSource = "import"
)

type OrderBooking struct {
	ID          uuid.UUID          `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    uuid.UUID          `gorm:"type:uuid;not null;index" json:"tenant_id"`
	EmployeeID  uuid.UUID          `gorm:"type:uuid;not null;index" json:"employee_id"`
	OrderID     uuid.UUID          `gorm:"type:uuid;not null;index" json:"order_id"`
	ActivityID  *uuid.UUID         `gorm:"type:uuid;index" json:"activity_id,omitempty"`
	BookingDate time.Time          `gorm:"type:date;not null" json:"booking_date"`
	TimeMinutes int                `gorm:"type:int;not null" json:"time_minutes"`
	Description string             `gorm:"type:text" json:"description,omitempty"`
	Source      OrderBookingSource `gorm:"type:varchar(20);not null;default:'manual'" json:"source"`
	CreatedAt   time.Time          `gorm:"default:now()" json:"created_at"`
	UpdatedAt   time.Time          `gorm:"default:now()" json:"updated_at"`
	CreatedBy   *uuid.UUID         `gorm:"type:uuid" json:"created_by,omitempty"`
	UpdatedBy   *uuid.UUID         `gorm:"type:uuid" json:"updated_by,omitempty"`

	// Relations
	Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
	Order    *Order    `gorm:"foreignKey:OrderID" json:"order,omitempty"`
	Activity *Activity `gorm:"foreignKey:ActivityID" json:"activity,omitempty"`
}

func (OrderBooking) TableName() string {
	return "order_bookings"
}
