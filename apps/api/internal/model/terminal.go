package model

import (
	"time"

	"github.com/google/uuid"
)

// ImportBatchStatus represents the status of an import batch.
type ImportBatchStatus string

const (
	ImportBatchStatusPending    ImportBatchStatus = "pending"
	ImportBatchStatusProcessing ImportBatchStatus = "processing"
	ImportBatchStatusCompleted  ImportBatchStatus = "completed"
	ImportBatchStatusFailed     ImportBatchStatus = "failed"
)

// RawBookingStatus represents the processing status of a raw terminal booking.
type RawBookingStatus string

const (
	RawBookingStatusPending   RawBookingStatus = "pending"
	RawBookingStatusProcessed RawBookingStatus = "processed"
	RawBookingStatusFailed    RawBookingStatus = "failed"
	RawBookingStatusSkipped   RawBookingStatus = "skipped"
)

// ImportBatch tracks a terminal import batch for idempotent processing.
type ImportBatch struct {
	ID              uuid.UUID         `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID        uuid.UUID         `gorm:"type:uuid;not null;index" json:"tenant_id"`
	BatchReference  string            `gorm:"type:varchar(255);not null" json:"batch_reference"`
	Source          string            `gorm:"type:varchar(50);not null;default:'terminal'" json:"source"`
	TerminalID      *string           `gorm:"type:varchar(100)" json:"terminal_id,omitempty"`
	Status          ImportBatchStatus `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
	RecordsTotal    int               `gorm:"default:0" json:"records_total"`
	RecordsImported int               `gorm:"default:0" json:"records_imported"`
	RecordsFailed   int               `gorm:"default:0" json:"records_failed"`
	ErrorMessage    *string           `gorm:"type:text" json:"error_message,omitempty"`
	StartedAt       *time.Time        `gorm:"type:timestamptz" json:"started_at,omitempty"`
	CompletedAt     *time.Time        `gorm:"type:timestamptz" json:"completed_at,omitempty"`
	CreatedAt       time.Time         `gorm:"type:timestamptz;default:now()" json:"created_at"`
	UpdatedAt       time.Time         `gorm:"type:timestamptz;default:now()" json:"updated_at"`

	// Relations
	RawBookings []RawTerminalBooking `gorm:"foreignKey:ImportBatchID" json:"raw_bookings,omitempty"`
}

// TableName returns the database table name.
func (ImportBatch) TableName() string { return "import_batches" }

// RawTerminalBooking stores immutable raw booking data from a terminal.
type RawTerminalBooking struct {
	ID                 uuid.UUID        `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID           uuid.UUID        `gorm:"type:uuid;not null;index" json:"tenant_id"`
	ImportBatchID      uuid.UUID        `gorm:"type:uuid;not null;index" json:"import_batch_id"`
	TerminalID         string           `gorm:"type:varchar(100);not null" json:"terminal_id"`
	EmployeePIN        string           `gorm:"type:varchar(20);not null" json:"employee_pin"`
	EmployeeID         *uuid.UUID       `gorm:"type:uuid" json:"employee_id,omitempty"`
	RawTimestamp       time.Time        `gorm:"type:timestamptz;not null" json:"raw_timestamp"`
	RawBookingCode     string           `gorm:"type:varchar(20);not null" json:"raw_booking_code"`
	BookingDate        time.Time        `gorm:"type:date;not null" json:"booking_date"`
	BookingTypeID      *uuid.UUID       `gorm:"type:uuid" json:"booking_type_id,omitempty"`
	ProcessedBookingID *uuid.UUID       `gorm:"type:uuid" json:"processed_booking_id,omitempty"`
	Status             RawBookingStatus `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
	ErrorMessage       *string          `gorm:"type:text" json:"error_message,omitempty"`
	CreatedAt          time.Time        `gorm:"type:timestamptz;default:now()" json:"created_at"`
	UpdatedAt          time.Time        `gorm:"type:timestamptz;default:now()" json:"updated_at"`

	// Relations
	Employee    *Employee    `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
	BookingType *BookingType `gorm:"foreignKey:BookingTypeID" json:"booking_type,omitempty"`
	ImportBatch *ImportBatch `gorm:"foreignKey:ImportBatchID" json:"import_batch,omitempty"`
}

// TableName returns the database table name.
func (RawTerminalBooking) TableName() string { return "raw_terminal_bookings" }
