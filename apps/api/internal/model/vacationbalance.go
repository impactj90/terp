package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type VacationBalance struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID   uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	EmployeeID uuid.UUID `gorm:"type:uuid;not null;index" json:"employee_id"`
	Year       int       `gorm:"type:int;not null" json:"year"`

	Entitlement decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"entitlement"`
	Carryover   decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"carryover"`
	Adjustments decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"adjustments"`
	Taken       decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"taken"`

	CarryoverExpiresAt *time.Time `gorm:"type:date" json:"carryover_expires_at,omitempty"`

	CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

	Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}

func (VacationBalance) TableName() string {
	return "vacation_balances"
}

func (vb *VacationBalance) Total() decimal.Decimal {
	return vb.Entitlement.Add(vb.Carryover).Add(vb.Adjustments)
}

func (vb *VacationBalance) Available() decimal.Decimal {
	return vb.Total().Sub(vb.Taken)
}
