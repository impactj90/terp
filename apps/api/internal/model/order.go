package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type OrderStatus string

const (
	OrderStatusPlanned   OrderStatus = "planned"
	OrderStatusActive    OrderStatus = "active"
	OrderStatusCompleted OrderStatus = "completed"
	OrderStatusCancelled OrderStatus = "cancelled"
)

type Order struct {
	ID                 uuid.UUID        `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID           uuid.UUID        `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Code               string           `gorm:"type:varchar(50);not null" json:"code"`
	Name               string           `gorm:"type:varchar(255);not null" json:"name"`
	Description        string           `gorm:"type:text" json:"description,omitempty"`
	Status             OrderStatus      `gorm:"type:varchar(20);not null;default:'active'" json:"status"`
	Customer           string           `gorm:"type:varchar(255)" json:"customer,omitempty"`
	CostCenterID       *uuid.UUID       `gorm:"type:uuid" json:"cost_center_id,omitempty"`
	BillingRatePerHour *decimal.Decimal `gorm:"type:decimal(10,2)" json:"billing_rate_per_hour,omitempty"`
	ValidFrom          *time.Time       `gorm:"type:date" json:"valid_from,omitempty"`
	ValidTo            *time.Time       `gorm:"type:date" json:"valid_to,omitempty"`
	IsActive           bool             `gorm:"default:true" json:"is_active"`
	CreatedAt          time.Time        `gorm:"default:now()" json:"created_at"`
	UpdatedAt          time.Time        `gorm:"default:now()" json:"updated_at"`

	// Relations
	CostCenter  *CostCenter       `gorm:"foreignKey:CostCenterID" json:"cost_center,omitempty"`
	Assignments []OrderAssignment `gorm:"foreignKey:OrderID" json:"assignments,omitempty"`
}

func (Order) TableName() string {
	return "orders"
}
