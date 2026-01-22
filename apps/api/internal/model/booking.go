package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/tolga/terp/internal/timeutil"
)

type BookingSource string

const (
	BookingSourceWeb        BookingSource = "web"
	BookingSourceTerminal   BookingSource = "terminal"
	BookingSourceAPI        BookingSource = "api"
	BookingSourceImport     BookingSource = "import"
	BookingSourceCorrection BookingSource = "correction"
)

type Booking struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID      uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	EmployeeID    uuid.UUID `gorm:"type:uuid;not null;index" json:"employee_id"`
	BookingDate   time.Time `gorm:"type:date;not null" json:"booking_date"`
	BookingTypeID uuid.UUID `gorm:"type:uuid;not null" json:"booking_type_id"`

	// Time values (minutes from midnight)
	OriginalTime   int  `gorm:"type:int;not null" json:"original_time"`
	EditedTime     int  `gorm:"type:int;not null" json:"edited_time"`
	CalculatedTime *int `gorm:"type:int" json:"calculated_time,omitempty"`

	// Pairing
	PairID *uuid.UUID `gorm:"type:uuid;index" json:"pair_id,omitempty"`

	// Metadata
	Source     BookingSource `gorm:"type:varchar(20);default:'web'" json:"source"`
	TerminalID *uuid.UUID    `gorm:"type:uuid" json:"terminal_id,omitempty"`
	Notes      string        `gorm:"type:text" json:"notes,omitempty"`

	CreatedAt time.Time  `gorm:"default:now()" json:"created_at"`
	UpdatedAt time.Time  `gorm:"default:now()" json:"updated_at"`
	CreatedBy *uuid.UUID `gorm:"type:uuid" json:"created_by,omitempty"`
	UpdatedBy *uuid.UUID `gorm:"type:uuid" json:"updated_by,omitempty"`

	// Relations
	Employee    *Employee    `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
	BookingType *BookingType `gorm:"foreignKey:BookingTypeID" json:"booking_type,omitempty"`
	Pair        *Booking     `gorm:"foreignKey:PairID" json:"pair,omitempty"`
}

func (Booking) TableName() string {
	return "bookings"
}

// TimeString returns the edited time as HH:MM string
func (b *Booking) TimeString() string {
	return timeutil.MinutesToString(b.EditedTime)
}

// EffectiveTime returns calculated_time if set, else edited_time
func (b *Booking) EffectiveTime() int {
	if b.CalculatedTime != nil {
		return *b.CalculatedTime
	}
	return b.EditedTime
}

// IsEdited returns true if edited_time differs from original_time
func (b *Booking) IsEdited() bool {
	return b.EditedTime != b.OriginalTime
}

// MinutesToTime converts minutes from midnight to time.Time on booking date
func (b *Booking) MinutesToTime(minutes int) time.Time {
	return timeutil.MinutesToTime(b.BookingDate, minutes)
}

// TimeToMinutes converts a time to minutes from midnight
// Deprecated: Use timeutil.TimeToMinutes instead
func TimeToMinutes(t time.Time) int {
	return timeutil.TimeToMinutes(t)
}

// MinutesToString formats minutes as HH:MM
// Deprecated: Use timeutil.MinutesToString instead
func MinutesToString(minutes int) string {
	return timeutil.MinutesToString(minutes)
}

// ParseTimeString parses HH:MM to minutes from midnight
// Deprecated: Use timeutil.ParseTimeString instead
func ParseTimeString(s string) (int, error) {
	return timeutil.ParseTimeString(s)
}
