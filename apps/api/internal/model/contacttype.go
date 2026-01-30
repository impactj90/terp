package model

import (
	"time"

	"github.com/google/uuid"
)

// ContactType defines a data format for contact fields (email, phone, text, url).
type ContactType struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Code        string    `gorm:"type:varchar(50);not null" json:"code"`
	Name        string    `gorm:"type:varchar(255);not null" json:"name"`
	DataType    string    `gorm:"type:varchar(20);not null;default:'text'" json:"data_type"`
	Description string    `gorm:"type:text" json:"description,omitempty"`
	IsActive    bool      `gorm:"default:true" json:"is_active"`
	SortOrder   int       `gorm:"default:0" json:"sort_order"`
	CreatedAt   time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt   time.Time `gorm:"default:now()" json:"updated_at"`
}

func (ContactType) TableName() string {
	return "contact_types"
}

// ContactKind is a labeled instance of a ContactType for use in employee contacts.
type ContactKind struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID      uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	ContactTypeID uuid.UUID `gorm:"type:uuid;not null;index" json:"contact_type_id"`
	Code          string    `gorm:"type:varchar(50);not null" json:"code"`
	Label         string    `gorm:"type:varchar(255);not null" json:"label"`
	IsActive      bool      `gorm:"default:true" json:"is_active"`
	SortOrder     int       `gorm:"default:0" json:"sort_order"`
	CreatedAt     time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt     time.Time `gorm:"default:now()" json:"updated_at"`

	// Relations
	ContactType *ContactType `gorm:"foreignKey:ContactTypeID" json:"contact_type,omitempty"`
}

func (ContactKind) TableName() string {
	return "contact_kinds"
}
