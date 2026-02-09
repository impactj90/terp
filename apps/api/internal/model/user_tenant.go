package model

import (
	"time"

	"github.com/google/uuid"
)

type UserTenant struct {
	UserID    uuid.UUID `gorm:"type:uuid;primaryKey" json:"user_id"`
	TenantID  uuid.UUID `gorm:"type:uuid;primaryKey" json:"tenant_id"`
	Role      string    `gorm:"type:varchar(50);not null;default:'member'" json:"role"`
	CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
}

func (UserTenant) TableName() string {
	return "user_tenants"
}
