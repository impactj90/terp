package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type AuditAction string

const (
	AuditActionCreate  AuditAction = "create"
	AuditActionUpdate  AuditAction = "update"
	AuditActionDelete  AuditAction = "delete"
	AuditActionApprove AuditAction = "approve"
	AuditActionReject  AuditAction = "reject"
	AuditActionClose   AuditAction = "close"
	AuditActionReopen  AuditAction = "reopen"
	AuditActionExport  AuditAction = "export"
	AuditActionImport  AuditAction = "import"
	AuditActionLogin   AuditAction = "login"
	AuditActionLogout  AuditAction = "logout"
	AuditActionCleanup AuditAction = "cleanup"
)

// AuditLog represents an audit trail entry.
type AuditLog struct {
	ID          uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    uuid.UUID      `gorm:"type:uuid;not null;index" json:"tenant_id"`
	UserID      *uuid.UUID     `gorm:"type:uuid" json:"user_id,omitempty"`
	Action      AuditAction    `gorm:"type:varchar(20);not null" json:"action"`
	EntityType  string         `gorm:"type:varchar(100);not null" json:"entity_type"`
	EntityID    uuid.UUID      `gorm:"type:uuid;not null" json:"entity_id"`
	EntityName  *string        `gorm:"type:text" json:"entity_name,omitempty"`
	Changes     datatypes.JSON `gorm:"type:jsonb" json:"changes,omitempty"`
	Metadata    datatypes.JSON `gorm:"type:jsonb" json:"metadata,omitempty"`
	IPAddress   *string        `gorm:"type:text" json:"ip_address,omitempty"`
	UserAgent   *string        `gorm:"type:text" json:"user_agent,omitempty"`
	PerformedAt time.Time      `gorm:"type:timestamptz;default:now()" json:"performed_at"`

	User *User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

func (AuditLog) TableName() string {
	return "audit_logs"
}
