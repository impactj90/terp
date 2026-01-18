package model

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
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
	hours := b.EditedTime / 60
	minutes := b.EditedTime % 60
	return fmt.Sprintf("%02d:%02d", hours, minutes)
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
	return time.Date(
		b.BookingDate.Year(),
		b.BookingDate.Month(),
		b.BookingDate.Day(),
		minutes/60,
		minutes%60,
		0, 0,
		b.BookingDate.Location(),
	)
}

// TimeToMinutes converts a time to minutes from midnight
func TimeToMinutes(t time.Time) int {
	return t.Hour()*60 + t.Minute()
}

// MinutesToString formats minutes as HH:MM
func MinutesToString(minutes int) string {
	h := minutes / 60
	m := minutes % 60
	return fmt.Sprintf("%02d:%02d", h, m)
}

// ParseTimeString parses HH:MM to minutes from midnight
func ParseTimeString(s string) (int, error) {
	parts := strings.Split(s, ":")
	if len(parts) != 2 {
		return 0, errors.New("invalid time format")
	}
	h, err := strconv.Atoi(parts[0])
	if err != nil {
		return 0, err
	}
	m, err := strconv.Atoi(parts[1])
	if err != nil {
		return 0, err
	}
	return h*60 + m, nil
}
