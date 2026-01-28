package model

import (
	"time"

	"github.com/google/uuid"
)

// NotificationType represents notification categories.
type NotificationType string

const (
	NotificationTypeApprovals NotificationType = "approvals"
	NotificationTypeErrors    NotificationType = "errors"
	NotificationTypeReminders NotificationType = "reminders"
	NotificationTypeSystem    NotificationType = "system"
)

// Notification represents a user notification.
type Notification struct {
	ID        uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID  uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
	UserID    uuid.UUID       `gorm:"type:uuid;not null;index" json:"user_id"`
	Type      NotificationType `gorm:"type:varchar(20);not null" json:"type"`
	Title     string          `gorm:"type:varchar(255);not null" json:"title"`
	Message   string          `gorm:"type:text;not null" json:"message"`
	Link      *string         `gorm:"type:text" json:"link,omitempty"`
	ReadAt    *time.Time      `gorm:"type:timestamptz" json:"read_at,omitempty"`
	CreatedAt time.Time       `gorm:"default:now()" json:"created_at"`
	UpdatedAt time.Time       `gorm:"default:now()" json:"updated_at"`
}

func (Notification) TableName() string {
	return "notifications"
}

// NotificationPreferences represents per-user notification settings.
type NotificationPreferences struct {
	ID               uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID         uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	UserID           uuid.UUID `gorm:"type:uuid;not null;index" json:"user_id"`
	ApprovalsEnabled bool      `gorm:"default:true" json:"approvals_enabled"`
	ErrorsEnabled    bool      `gorm:"default:true" json:"errors_enabled"`
	RemindersEnabled bool      `gorm:"default:true" json:"reminders_enabled"`
	SystemEnabled    bool      `gorm:"default:true" json:"system_enabled"`
	CreatedAt        time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt        time.Time `gorm:"default:now()" json:"updated_at"`
}

func (NotificationPreferences) TableName() string {
	return "notification_preferences"
}

// AllowsType returns true if notifications of the given type are enabled.
func (p *NotificationPreferences) AllowsType(notificationType NotificationType) bool {
	switch notificationType {
	case NotificationTypeApprovals:
		return p.ApprovalsEnabled
	case NotificationTypeErrors:
		return p.ErrorsEnabled
	case NotificationTypeReminders:
		return p.RemindersEnabled
	case NotificationTypeSystem:
		return p.SystemEnabled
	default:
		return true
	}
}
