package model

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type UserGroup struct {
	ID          uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    *uuid.UUID     `gorm:"type:uuid;index" json:"tenant_id,omitempty"`
	Name        string         `gorm:"type:varchar(100);not null" json:"name"`
	Code        string         `gorm:"type:varchar(50);not null" json:"code"`
	Description string         `gorm:"type:text" json:"description,omitempty"`
	Permissions datatypes.JSON `gorm:"type:jsonb;default:'[]'" json:"permissions"`
	IsAdmin     bool           `gorm:"default:false" json:"is_admin"`
	IsSystem    bool           `gorm:"default:false" json:"is_system"`
	IsActive    bool           `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time      `gorm:"default:now()" json:"created_at"`
	UpdatedAt   time.Time      `gorm:"default:now()" json:"updated_at"`
}

func (UserGroup) TableName() string {
	return "user_groups"
}

// HasPermission checks if the group has a specific permission.
func (ug *UserGroup) HasPermission(permission string) bool {
	if ug.IsAdmin {
		return true
	}
	var perms []string
	if err := json.Unmarshal(ug.Permissions, &perms); err != nil {
		return false
	}
	for _, p := range perms {
		if p == permission {
			return true
		}
	}
	return false
}
