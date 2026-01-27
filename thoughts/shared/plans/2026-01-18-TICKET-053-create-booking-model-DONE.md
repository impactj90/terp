# TICKET-053: Create Booking Model - Implementation Plan

## Overview

Create the Booking model with GORM struct, relationships to Employee/BookingType, and helper methods for time manipulation. This is a single-file implementation following existing model patterns.

## Current State Analysis

- Migration exists: `db/migrations/000022_create_bookings.up.sql` (TICKET-052 completed)
- BookingType model exists: `apps/api/internal/model/bookingtype.go`
- Employee model exists: `apps/api/internal/model/employee.go`
- No Booking model exists yet

### Key Discoveries:
- Model patterns follow inline fields (no BaseModel embedding) - `apps/api/internal/model/employee.go:11-40`
- Enum pattern uses custom string type with constants - `apps/api/internal/model/bookingtype.go:9-14`
- TableName uses value receiver - `apps/api/internal/model/bookingtype.go:29-31`
- Helper methods use pointer receiver - `apps/api/internal/model/employee.go:46-57`

## Desired End State

A complete `apps/api/internal/model/booking.go` file containing:
1. `BookingSource` enum type with 5 constants
2. `Booking` struct with all fields matching migration schema
3. Relationships to Employee, BookingType, and self-referential Pair
4. `TableName()` method
5. Helper methods: `TimeString()`, `EffectiveTime()`, `IsEdited()`, `MinutesToTime()`
6. Package-level helper functions: `TimeToMinutes()`, `MinutesToString()`, `ParseTimeString()`

### Verification:
- Code compiles without errors
- `make lint` passes
- All helper functions work correctly

## What We're NOT Doing

- Repository layer (separate ticket)
- Service layer (separate ticket)
- Handler/API endpoints (separate ticket)
- Tests (separate ticket)

## Implementation Approach

Single phase - create the model file with all components as specified in the ticket.

## Phase 1: Create Booking Model

### Overview
Create `apps/api/internal/model/booking.go` with the Booking struct, enum, methods, and helper functions.

### Changes Required:

#### 1. Create Model File
**File**: `apps/api/internal/model/booking.go`
**Action**: Create new file

```go
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
```

### Success Criteria:

#### Automated Verification:
- [x] File compiles: `cd apps/api && go build ./...`
- [x] Linting passes: `make lint` (tools not installed, used `go vet` which passed)
- [x] Format check: `make fmt` (tools not installed, used `gofmt -d` which showed no changes needed)

#### Manual Verification:
- [x] Review that struct fields match migration schema
- [x] Verify GORM tags follow existing patterns
- [x] Confirm helper methods have correct logic

**Implementation Note**: This is a single-phase implementation. After automated verification passes, the task is complete.

---

## Testing Strategy

### Unit Tests (Future Ticket):
- `TimeString()` formats minutes correctly (e.g., 510 -> "08:30")
- `EffectiveTime()` returns calculated_time when set, edited_time otherwise
- `IsEdited()` returns true when edited_time != original_time
- `MinutesToTime()` creates correct time.Time
- `TimeToMinutes()` extracts minutes correctly
- `MinutesToString()` formats correctly
- `ParseTimeString()` parses valid strings and returns errors for invalid

### Edge Cases:
- Midnight (0 minutes)
- End of day (1439 minutes = 23:59)
- Invalid time strings (no colon, non-numeric)

## References

- Original ticket: `thoughts/shared/plans/tickets/TICKET-053-create-booking-model.md`
- Research: `thoughts/shared/research/2026-01-18-TICKET-053-create-booking-model.md`
- Migration: `db/migrations/000022_create_bookings.up.sql`
- Similar model: `apps/api/internal/model/bookingtype.go`
