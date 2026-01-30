package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

// SystemSettings stores system-wide settings per tenant.
// ZMI-TICKET-023: Controls calculation behavior, cleanup tools, and monitoring.
type SystemSettings struct {
	ID       uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex" json:"tenant_id"`

	// Options: Rounding
	RoundingRelativeToPlan bool `gorm:"default:false" json:"rounding_relative_to_plan"`

	// Options: Error list
	ErrorListEnabled  bool           `gorm:"default:true" json:"error_list_enabled"`
	TrackedErrorCodes pq.StringArray `gorm:"type:text[];default:'{}'" json:"tracked_error_codes"`

	// Options: Order auto-fill
	AutoFillOrderEndBookings bool `gorm:"default:false" json:"auto_fill_order_end_bookings"`

	// Program start: Birthday list
	BirthdayWindowDaysBefore int `gorm:"default:7" json:"birthday_window_days_before"`
	BirthdayWindowDaysAfter  int `gorm:"default:7" json:"birthday_window_days_after"`

	// Program start: Follow-up entries
	FollowUpEntriesEnabled bool `gorm:"default:false" json:"follow_up_entries_enabled"`

	// Proxy settings (deferred)
	ProxyHost     *string `gorm:"type:varchar(255)" json:"proxy_host,omitempty"`
	ProxyPort     *int    `gorm:"type:int" json:"proxy_port,omitempty"`
	ProxyUsername *string `gorm:"type:varchar(255)" json:"proxy_username,omitempty"`
	ProxyPassword *string `gorm:"type:varchar(255)" json:"-"` // Never serialize
	ProxyEnabled  bool    `gorm:"default:false" json:"proxy_enabled"`

	// Server Alive
	ServerAliveEnabled                bool `gorm:"default:false" json:"server_alive_enabled"`
	ServerAliveExpectedCompletionTime *int `gorm:"type:int" json:"server_alive_expected_completion_time,omitempty"`
	ServerAliveThresholdMinutes       *int `gorm:"type:int;default:30" json:"server_alive_threshold_minutes,omitempty"`
	ServerAliveNotifyAdmins           bool `gorm:"default:true" json:"server_alive_notify_admins"`

	CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`
}

func (SystemSettings) TableName() string {
	return "system_settings"
}

// DefaultSettings returns a new SystemSettings with defaults for a given tenant.
func DefaultSettings(tenantID uuid.UUID) *SystemSettings {
	return &SystemSettings{
		TenantID:                 tenantID,
		RoundingRelativeToPlan:   false,
		ErrorListEnabled:         true,
		AutoFillOrderEndBookings: false,
		BirthdayWindowDaysBefore: 7,
		BirthdayWindowDaysAfter:  7,
		FollowUpEntriesEnabled:   false,
		ProxyEnabled:             false,
		ServerAliveEnabled:       false,
		ServerAliveNotifyAdmins:  true,
	}
}
