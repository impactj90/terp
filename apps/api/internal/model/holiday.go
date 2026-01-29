package model

import (
	"time"

	"github.com/google/uuid"
)

type Holiday struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID     uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
	HolidayDate  time.Time  `gorm:"type:date;not null" json:"holiday_date"`
	Name         string     `gorm:"type:varchar(255);not null" json:"name"`
	Category     int        `gorm:"column:holiday_category;type:int;not null;default:1" json:"category"`
	AppliesToAll bool       `json:"applies_to_all"`
	DepartmentID *uuid.UUID `gorm:"type:uuid" json:"department_id,omitempty"`
	CreatedAt    time.Time  `gorm:"default:now()" json:"created_at"`
	UpdatedAt    time.Time  `gorm:"default:now()" json:"updated_at"`
}

func (Holiday) TableName() string {
	return "holidays"
}
