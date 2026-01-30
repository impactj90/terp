package model

import (
	"time"

	"github.com/google/uuid"
)

// ExportInterface represents an export interface definition for payroll system integration.
type ExportInterface struct {
	ID              uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID        uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	InterfaceNumber int       `gorm:"type:int;not null" json:"interface_number"`
	Name            string    `gorm:"type:varchar(255);not null" json:"name"`
	MandantNumber   *string   `gorm:"type:varchar(50)" json:"mandant_number,omitempty"`
	ExportScript    *string   `gorm:"type:varchar(255)" json:"export_script,omitempty"`
	ExportPath      *string   `gorm:"type:varchar(500)" json:"export_path,omitempty"`
	OutputFilename  *string   `gorm:"type:varchar(255)" json:"output_filename,omitempty"`
	IsActive        bool      `gorm:"default:true" json:"is_active"`
	CreatedAt       time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt       time.Time `gorm:"default:now()" json:"updated_at"`

	// Relations
	Accounts []ExportInterfaceAccount `gorm:"foreignKey:ExportInterfaceID" json:"accounts,omitempty"`
}

// TableName returns the database table name.
func (ExportInterface) TableName() string {
	return "export_interfaces"
}

// ExportInterfaceAccount represents an account associated with an export interface.
type ExportInterfaceAccount struct {
	ID                uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	ExportInterfaceID uuid.UUID `gorm:"type:uuid;not null;index" json:"export_interface_id"`
	AccountID         uuid.UUID `gorm:"type:uuid;not null;index" json:"account_id"`
	SortOrder         int       `gorm:"default:0" json:"sort_order"`
	CreatedAt         time.Time `gorm:"default:now()" json:"created_at"`

	// Relations
	Account *Account `gorm:"foreignKey:AccountID" json:"account,omitempty"`
}

// TableName returns the database table name.
func (ExportInterfaceAccount) TableName() string {
	return "export_interface_accounts"
}
