package model

import (
	"time"

	"github.com/google/uuid"
)

// CorrectionSeverity represents the severity of a correction message.
type CorrectionSeverity string

const (
	CorrectionSeverityError CorrectionSeverity = "error"
	CorrectionSeverityHint  CorrectionSeverity = "hint"
)

// CorrectionMessage represents an entry in the error/hint message catalog.
type CorrectionMessage struct {
	ID          uuid.UUID          `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    uuid.UUID          `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Code        string             `gorm:"type:varchar(50);not null" json:"code"`
	DefaultText string             `gorm:"type:text;not null" json:"default_text"`
	CustomText  *string            `gorm:"type:text" json:"custom_text,omitempty"`
	Severity    CorrectionSeverity `gorm:"type:varchar(10);not null;default:'error'" json:"severity"`
	Description *string            `gorm:"type:text" json:"description,omitempty"`
	IsActive    bool               `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time          `gorm:"default:now()" json:"created_at"`
	UpdatedAt   time.Time          `gorm:"default:now()" json:"updated_at"`
}

func (CorrectionMessage) TableName() string {
	return "correction_messages"
}

// EffectiveText returns custom_text if set, otherwise default_text.
func (cm *CorrectionMessage) EffectiveText() string {
	if cm.CustomText != nil && *cm.CustomText != "" {
		return *cm.CustomText
	}
	return cm.DefaultText
}

// CorrectionMessageFilter defines filter criteria for listing correction messages.
type CorrectionMessageFilter struct {
	Severity *CorrectionSeverity
	IsActive *bool
	Code     *string
}

// CorrectionAssistantFilter defines filter criteria for the correction assistant query.
type CorrectionAssistantFilter struct {
	From         *time.Time
	To           *time.Time
	EmployeeID   *uuid.UUID
	DepartmentID *uuid.UUID
	Severity     *CorrectionSeverity
	ErrorCode    *string
	Limit        int
	Offset       int
}

// CorrectionAssistantItem represents one employee-date entry in the correction assistant view.
type CorrectionAssistantItem struct {
	DailyValueID   uuid.UUID
	EmployeeID     uuid.UUID
	EmployeeName   string
	DepartmentID   *uuid.UUID
	DepartmentName *string
	ValueDate      time.Time
	Errors         []CorrectionAssistantError
}

// CorrectionAssistantError represents a single error/hint within a correction assistant item.
type CorrectionAssistantError struct {
	Code      string
	Severity  string
	Message   string
	ErrorType string
}
