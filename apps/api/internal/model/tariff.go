package model

import (
	"time"

	"github.com/google/uuid"
)

// BreakType is defined in dayplan.go

type Tariff struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Code        string     `gorm:"type:varchar(20);not null" json:"code"`
	Name        string     `gorm:"type:varchar(255);not null" json:"name"`
	Description *string    `gorm:"type:text" json:"description,omitempty"`
	WeekPlanID  *uuid.UUID `gorm:"type:uuid" json:"week_plan_id,omitempty"`
	ValidFrom   *time.Time `gorm:"type:date" json:"valid_from,omitempty"`
	ValidTo     *time.Time `gorm:"type:date" json:"valid_to,omitempty"`
	IsActive    bool       `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time  `gorm:"default:now()" json:"created_at"`
	UpdatedAt   time.Time  `gorm:"default:now()" json:"updated_at"`

	// Relations
	WeekPlan *WeekPlan     `gorm:"foreignKey:WeekPlanID" json:"week_plan,omitempty"`
	Breaks   []TariffBreak `gorm:"foreignKey:TariffID" json:"breaks,omitempty"`
}

func (Tariff) TableName() string {
	return "tariffs"
}

type TariffBreak struct {
	ID               uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TariffID         uuid.UUID `gorm:"type:uuid;not null;index" json:"tariff_id"`
	BreakType        BreakType `gorm:"type:varchar(20);not null" json:"break_type"`
	AfterWorkMinutes *int      `gorm:"type:int" json:"after_work_minutes,omitempty"`
	Duration         int       `gorm:"type:int;not null" json:"duration"`
	IsPaid           bool      `gorm:"default:false" json:"is_paid"`
	SortOrder        int       `gorm:"default:0" json:"sort_order"`
	CreatedAt        time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt        time.Time `gorm:"default:now()" json:"updated_at"`
}

func (TariffBreak) TableName() string {
	return "tariff_breaks"
}
