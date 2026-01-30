package model

import (
	"time"

	"github.com/google/uuid"
)

// EmployeeMessageRecipientStatus represents delivery status.
type EmployeeMessageRecipientStatus string

const (
	RecipientStatusPending EmployeeMessageRecipientStatus = "pending"
	RecipientStatusSent    EmployeeMessageRecipientStatus = "sent"
	RecipientStatusFailed  EmployeeMessageRecipientStatus = "failed"
)

// EmployeeMessage represents a message created by a user to be sent to employees.
type EmployeeMessage struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID  uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	SenderID  uuid.UUID `gorm:"type:uuid;not null" json:"sender_id"`
	Subject   string    `gorm:"type:varchar(255);not null" json:"subject"`
	Body      string    `gorm:"type:text;not null" json:"body"`
	CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

	// Relations
	Recipients []EmployeeMessageRecipient `gorm:"foreignKey:MessageID" json:"recipients,omitempty"`
}

func (EmployeeMessage) TableName() string { return "employee_messages" }

// EmployeeMessageRecipient represents a recipient of an employee message with delivery status.
type EmployeeMessageRecipient struct {
	ID           uuid.UUID                      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	MessageID    uuid.UUID                      `gorm:"type:uuid;not null;index" json:"message_id"`
	EmployeeID   uuid.UUID                      `gorm:"type:uuid;not null;index" json:"employee_id"`
	Status       EmployeeMessageRecipientStatus `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
	SentAt       *time.Time                     `gorm:"type:timestamptz" json:"sent_at,omitempty"`
	ErrorMessage *string                        `gorm:"type:text" json:"error_message,omitempty"`
	CreatedAt    time.Time                      `gorm:"default:now()" json:"created_at"`
	UpdatedAt    time.Time                      `gorm:"default:now()" json:"updated_at"`
}

func (EmployeeMessageRecipient) TableName() string { return "employee_message_recipients" }
