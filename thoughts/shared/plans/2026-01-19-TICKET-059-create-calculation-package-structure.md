# TICKET-059: Create Calculation Package Structure - Implementation Plan

## Overview

Create a new `calculation` package at `apps/api/internal/calculation/` that handles pure time tracking calculations. This package will receive booking data and day plan configuration as input and produce daily value calculations as output, with no database or HTTP dependencies.

Additionally, extract time utilities to a shared `internal/timeutil` package for reuse across model and calculation packages.

## Current State Analysis

### Existing Time Helpers
Time utilities currently live in `model/booking.go:91-118`:
- `TimeToMinutes(t time.Time) int` - Converts time.Time to minutes from midnight
- `MinutesToString(minutes int) string` - Formats minutes as "HH:MM"
- `ParseTimeString(s string) (int, error)` - Parses "HH:MM" to minutes

These are already used by `model/dailyvalue.go` formatting methods.

### Related Domain Models
- **Booking** (`model/booking.go`) - Input data with pairing, time fields, direction
- **DayPlan** (`model/dayplan.go`) - Configuration with tolerance, rounding, breaks
- **DailyValue** (`model/dailyvalue.go`) - Output storage for calculated results

### Time Representation Convention
All time values use **minutes from midnight (0-1439)** or **duration in minutes**.

## Desired End State

After implementation:
1. A new `internal/timeutil` package with shared time conversion utilities
2. A new `internal/calculation` package with:
   - Input/output type definitions
   - Error code constants
   - Pairing logic for bookings
   - Rounding logic
   - Tolerance application logic
   - Break deduction logic
   - Main Calculator orchestrating all logic
3. Comprehensive tests for all calculation logic
4. Model package updated to import from timeutil

### Verification Commands
```bash
cd apps/api && go test -v -race ./internal/timeutil/...
cd apps/api && go test -v -race ./internal/calculation/...
cd apps/api && go test -v -race ./internal/model/...  # Ensure no regressions
make test  # All tests pass
make lint  # No linting errors
```

## What We're NOT Doing

- Database integration (repository methods)
- HTTP handlers or API endpoints
- Service layer orchestration
- Cross-midnight shift support beyond basic detection (complex multi-day spans are out of scope)
- Bonus calculation logic (separate future ticket)

## Implementation Approach

1. **Phase 1**: Extract time utilities to `internal/timeutil`
2. **Phase 2**: Create calculation package foundation (types, errors)
3. **Phase 3**: Implement pairing logic
4. **Phase 4**: Implement rounding logic
5. **Phase 5**: Implement tolerance logic
6. **Phase 6**: Implement break deduction logic
7. **Phase 7**: Implement main calculator and integration tests

---

## Phase 1: Extract Time Utilities to Shared Package

### Overview
Create `internal/timeutil` package and migrate time utilities from `model/booking.go`.

### Changes Required

#### 1. Create timeutil package
**File**: `apps/api/internal/timeutil/timeutil.go`

```go
// Package timeutil provides time conversion utilities for the Terp time tracking system.
// All time-of-day values are represented as minutes from midnight (0-1439).
// Durations are represented as minutes.
package timeutil

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// ErrInvalidTimeFormat indicates a time string is not in HH:MM format.
var ErrInvalidTimeFormat = errors.New("invalid time format: expected HH:MM")

// MinutesPerDay is the number of minutes in a day (1440).
const MinutesPerDay = 1440

// MaxMinutesFromMidnight is the maximum valid minutes from midnight (1439 = 23:59).
const MaxMinutesFromMidnight = 1439

// TimeToMinutes converts a time.Time to minutes from midnight.
func TimeToMinutes(t time.Time) int {
	return t.Hour()*60 + t.Minute()
}

// MinutesToString formats minutes as "HH:MM".
// For durations >= 24 hours, hours will exceed 23 (e.g., 1500 -> "25:00").
func MinutesToString(minutes int) string {
	if minutes < 0 {
		return "-" + MinutesToString(-minutes)
	}
	h := minutes / 60
	m := minutes % 60
	return fmt.Sprintf("%02d:%02d", h, m)
}

// ParseTimeString parses "HH:MM" format to minutes from midnight.
// Returns ErrInvalidTimeFormat for malformed input.
func ParseTimeString(s string) (int, error) {
	parts := strings.Split(s, ":")
	if len(parts) != 2 {
		return 0, ErrInvalidTimeFormat
	}
	h, err := strconv.Atoi(parts[0])
	if err != nil {
		return 0, ErrInvalidTimeFormat
	}
	m, err := strconv.Atoi(parts[1])
	if err != nil {
		return 0, ErrInvalidTimeFormat
	}
	if h < 0 || m < 0 || m > 59 {
		return 0, ErrInvalidTimeFormat
	}
	return h*60 + m, nil
}

// MinutesToTime creates a time.Time from minutes on a given date.
// The date's timezone is preserved.
func MinutesToTime(date time.Time, minutes int) time.Time {
	return time.Date(
		date.Year(),
		date.Month(),
		date.Day(),
		minutes/60,
		minutes%60,
		0, 0,
		date.Location(),
	)
}

// NormalizeCrossMidnight handles times that span midnight.
// If endMinutes < startMinutes, adds MinutesPerDay to endMinutes.
// Returns the normalized end minutes.
func NormalizeCrossMidnight(startMinutes, endMinutes int) int {
	if endMinutes < startMinutes {
		return endMinutes + MinutesPerDay
	}
	return endMinutes
}

// IsValidTimeOfDay checks if minutes represents a valid time of day (0-1439).
func IsValidTimeOfDay(minutes int) bool {
	return minutes >= 0 && minutes <= MaxMinutesFromMidnight
}
```

#### 2. Create timeutil tests
**File**: `apps/api/internal/timeutil/timeutil_test.go`

```go
package timeutil_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/timeutil"
)

func TestTimeToMinutes(t *testing.T) {
	tests := []struct {
		name     string
		time     time.Time
		expected int
	}{
		{"midnight", time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), 0},
		{"8am", time.Date(2026, 1, 1, 8, 0, 0, 0, time.UTC), 480},
		{"8:30am", time.Date(2026, 1, 1, 8, 30, 0, 0, time.UTC), 510},
		{"noon", time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC), 720},
		{"5pm", time.Date(2026, 1, 1, 17, 0, 0, 0, time.UTC), 1020},
		{"23:59", time.Date(2026, 1, 1, 23, 59, 0, 0, time.UTC), 1439},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := timeutil.TimeToMinutes(tt.time)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestMinutesToString(t *testing.T) {
	tests := []struct {
		name     string
		minutes  int
		expected string
	}{
		{"midnight", 0, "00:00"},
		{"8am", 480, "08:00"},
		{"8:05am", 485, "08:05"},
		{"noon", 720, "12:00"},
		{"5pm", 1020, "17:00"},
		{"23:59", 1439, "23:59"},
		{"over 24h", 1500, "25:00"},
		{"negative", -60, "-01:00"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := timeutil.MinutesToString(tt.minutes)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestParseTimeString(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		expected  int
		expectErr bool
	}{
		{"midnight", "00:00", 0, false},
		{"8am", "08:00", 480, false},
		{"8:05am", "08:05", 485, false},
		{"noon", "12:00", 720, false},
		{"5pm", "17:00", 1020, false},
		{"invalid format", "8:00:00", 0, true},
		{"invalid hour", "xx:00", 0, true},
		{"invalid minute", "08:xx", 0, true},
		{"negative minute", "08:-5", 0, true},
		{"minute > 59", "08:60", 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := timeutil.ParseTimeString(tt.input)
			if tt.expectErr {
				assert.Error(t, err)
			} else {
				require.NoError(t, err)
				assert.Equal(t, tt.expected, result)
			}
		})
	}
}

func TestMinutesToTime(t *testing.T) {
	date := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)

	tests := []struct {
		name     string
		minutes  int
		expected time.Time
	}{
		{"midnight", 0, time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)},
		{"8am", 480, time.Date(2026, 1, 15, 8, 0, 0, 0, time.UTC)},
		{"5:30pm", 1050, time.Date(2026, 1, 15, 17, 30, 0, 0, time.UTC)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := timeutil.MinutesToTime(date, tt.minutes)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestNormalizeCrossMidnight(t *testing.T) {
	tests := []struct {
		name     string
		start    int
		end      int
		expected int
	}{
		{"same day", 480, 1020, 1020},             // 08:00 - 17:00
		{"cross midnight", 1320, 120, 1560},       // 22:00 - 02:00 -> 22:00 - 26:00
		{"same time", 480, 480, 480},              // edge case
		{"end at midnight", 480, 0, 1440},         // 08:00 - 00:00
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := timeutil.NormalizeCrossMidnight(tt.start, tt.end)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestIsValidTimeOfDay(t *testing.T) {
	tests := []struct {
		name     string
		minutes  int
		expected bool
	}{
		{"midnight", 0, true},
		{"noon", 720, true},
		{"23:59", 1439, true},
		{"negative", -1, false},
		{"24:00", 1440, false},
		{"over 24h", 1500, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := timeutil.IsValidTimeOfDay(tt.minutes)
			assert.Equal(t, tt.expected, result)
		})
	}
}
```

#### 3. Update model/booking.go
**File**: `apps/api/internal/model/booking.go`

Update imports and replace local functions with timeutil calls:

```go
import (
	// ... existing imports ...
	"github.com/tolga/terp/internal/timeutil"
)

// TimeString returns the edited time as HH:MM string
func (b *Booking) TimeString() string {
	return timeutil.MinutesToString(b.EditedTime)
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
```

### Success Criteria

#### Automated Verification:
- [ ] Tests pass: `cd apps/api && go test -v -race ./internal/timeutil/...`
- [ ] Model tests still pass: `cd apps/api && go test -v -race ./internal/model/...`
- [ ] No linting errors: `make lint`

#### Manual Verification:
- [ ] Verify package documentation appears correctly with `go doc github.com/tolga/terp/internal/timeutil`

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 2.

---

## Phase 2: Create Calculation Package Foundation

### Overview
Set up the calculation package structure with types, error codes, and documentation.

### Changes Required

#### 1. Create package documentation
**File**: `apps/api/internal/calculation/doc.go`

```go
// Package calculation provides pure time tracking calculations for the Terp system.
//
// This package handles the core business logic for calculating daily work values
// from booking data and day plan configurations. It has no database or HTTP
// dependencies - it operates purely on input structs and produces output structs.
//
// # Data Flow
//
// Input:
//   - []BookingInput: Clock-in/out events with times and types
//   - DayPlanInput: Work schedule configuration (tolerance, rounding, breaks)
//
// Output:
//   - CalculationResult: Calculated times, errors, and warnings
//
// # Time Representation
//
// All times are represented as minutes from midnight (0-1439 for same-day times).
// For cross-midnight shifts, end times may exceed 1439 (e.g., 02:00 next day = 1560).
// Durations are also in minutes.
//
// # Usage
//
//	calc := calculation.NewCalculator()
//	result := calc.Calculate(ctx, input)
//	if result.HasError {
//	    // Handle errors
//	}
//	// Use result.GrossTime, result.NetTime, etc.
package calculation
```

#### 2. Create types
**File**: `apps/api/internal/calculation/types.go`

```go
package calculation

import (
	"time"

	"github.com/google/uuid"
)

// BookingDirection indicates whether a booking is an arrival or departure.
type BookingDirection string

const (
	// DirectionIn represents arrivals (COME, BREAK_END).
	DirectionIn BookingDirection = "in"
	// DirectionOut represents departures (GO, BREAK_START).
	DirectionOut BookingDirection = "out"
)

// BookingCategory categorizes bookings by their purpose.
type BookingCategory string

const (
	// CategoryWork represents work shift bookings (COME/GO).
	CategoryWork BookingCategory = "work"
	// CategoryBreak represents break bookings (BREAK_START/BREAK_END).
	CategoryBreak BookingCategory = "break"
)

// BookingInput represents a single booking for calculation.
type BookingInput struct {
	ID        uuid.UUID
	Time      int              // Minutes from midnight (0-1439)
	Direction BookingDirection // "in" or "out"
	Category  BookingCategory  // "work" or "break"
	PairID    *uuid.UUID       // ID of paired booking, if any
}

// BreakType defines how breaks are configured.
type BreakType string

const (
	// BreakTypeFixed is a break at a specific time window.
	BreakTypeFixed BreakType = "fixed"
	// BreakTypeVariable is a flexible break based on work duration.
	BreakTypeVariable BreakType = "variable"
	// BreakTypeMinimum is a mandatory break after a work threshold.
	BreakTypeMinimum BreakType = "minimum"
)

// BreakConfig defines a break rule from the day plan.
type BreakConfig struct {
	Type             BreakType
	StartTime        *int // For fixed breaks: start time (minutes from midnight)
	EndTime          *int // For fixed breaks: end time (minutes from midnight)
	Duration         int  // Break duration in minutes
	AfterWorkMinutes *int // For variable/minimum: trigger after X work minutes
	AutoDeduct       bool // Automatically deduct from work time
	IsPaid           bool // Break counts toward regular hours
}

// RoundingType defines how times are rounded.
type RoundingType string

const (
	RoundingNone    RoundingType = "none"
	RoundingUp      RoundingType = "up"
	RoundingDown    RoundingType = "down"
	RoundingNearest RoundingType = "nearest"
)

// RoundingConfig defines rounding rules.
type RoundingConfig struct {
	Type     RoundingType
	Interval int // Rounding interval in minutes (e.g., 5, 15)
}

// ToleranceConfig defines tolerance/grace period rules.
type ToleranceConfig struct {
	ComePlus  int // Grace period for late arrivals (minutes)
	ComeMinus int // Grace period for early arrivals (minutes)
	GoPlus    int // Grace period for late departures (minutes)
	GoMinus   int // Grace period for early departures (minutes)
}

// DayPlanInput contains all configuration needed for calculation.
type DayPlanInput struct {
	// Time windows (minutes from midnight)
	ComeFrom  *int // Earliest allowed arrival
	ComeTo    *int // Latest allowed arrival
	GoFrom    *int // Earliest allowed departure
	GoTo      *int // Latest allowed departure
	CoreStart *int // Flextime core hours start
	CoreEnd   *int // Flextime core hours end

	// Target hours
	RegularHours int // Target work duration in minutes

	// Rules
	Tolerance      ToleranceConfig
	RoundingCome   *RoundingConfig
	RoundingGo     *RoundingConfig
	Breaks         []BreakConfig
	MinWorkTime    *int // Minimum work duration
	MaxNetWorkTime *int // Maximum credited work time
}

// CalculationInput contains all data needed for a day's calculation.
type CalculationInput struct {
	EmployeeID uuid.UUID
	Date       time.Time
	Bookings   []BookingInput
	DayPlan    DayPlanInput
}

// BookingPair represents a paired in/out booking.
type BookingPair struct {
	InBooking  *BookingInput
	OutBooking *BookingInput
	Category   BookingCategory
	Duration   int // Calculated duration in minutes
}

// CalculationResult contains all calculated values for a day.
type CalculationResult struct {
	// Time calculations (all in minutes)
	GrossTime  int // Total time before breaks
	NetTime    int // Time after breaks
	TargetTime int // Expected work time from day plan
	Overtime   int // max(0, NetTime - TargetTime)
	Undertime  int // max(0, TargetTime - NetTime)
	BreakTime  int // Total break duration

	// Booking summary
	FirstCome    *int // First arrival (minutes from midnight)
	LastGo       *int // Last departure (minutes from midnight)
	BookingCount int

	// Calculated times per booking (for updating Booking.CalculatedTime)
	CalculatedTimes map[uuid.UUID]int

	// Pairing results
	Pairs          []BookingPair
	UnpairedInIDs  []uuid.UUID
	UnpairedOutIDs []uuid.UUID

	// Status
	HasError   bool
	ErrorCodes []string
	Warnings   []string
}
```

#### 3. Create error codes
**File**: `apps/api/internal/calculation/errors.go`

```go
package calculation

// Error codes for calculation problems.
const (
	// Pairing errors
	ErrCodeMissingCome     = "MISSING_COME"      // No arrival booking found
	ErrCodeMissingGo       = "MISSING_GO"        // No departure booking found
	ErrCodeUnpairedBooking = "UNPAIRED_BOOKING"  // Booking without matching pair

	// Time window errors
	ErrCodeEarlyCome = "EARLY_COME" // Arrival before allowed window
	ErrCodeLateCome  = "LATE_COME"  // Arrival after allowed window
	ErrCodeEarlyGo   = "EARLY_GO"   // Departure before allowed window
	ErrCodeLateGo    = "LATE_GO"    // Departure after allowed window

	// Core hours errors
	ErrCodeMissedCoreStart = "MISSED_CORE_START" // Arrived after core hours start
	ErrCodeMissedCoreEnd   = "MISSED_CORE_END"   // Left before core hours end

	// Work time errors
	ErrCodeBelowMinWorkTime = "BELOW_MIN_WORK_TIME" // Worked less than minimum
	ErrCodeNoBookings       = "NO_BOOKINGS"         // No bookings for the day

	// Data errors
	ErrCodeInvalidTime     = "INVALID_TIME"      // Time value out of range
	ErrCodeDuplicateInTime = "DUPLICATE_IN_TIME" // Multiple arrivals at same time
)

// Warning codes for non-critical issues.
const (
	WarnCodeCrossMidnight    = "CROSS_MIDNIGHT"     // Shift spans midnight
	WarnCodeMaxTimeReached   = "MAX_TIME_REACHED"   // NetTime capped at max
	WarnCodeManualBreak      = "MANUAL_BREAK"       // Break bookings exist, auto-deduct skipped
	WarnCodeNoBreakRecorded  = "NO_BREAK_RECORDED"  // No break bookings but break required
	WarnCodeShortBreak       = "SHORT_BREAK"        // Recorded break shorter than required
	WarnCodeAutoBreakApplied = "AUTO_BREAK_APPLIED" // Break auto-deducted
)

// IsError returns true if the code represents an error (vs warning).
func IsError(code string) bool {
	switch code {
	case ErrCodeMissingCome, ErrCodeMissingGo, ErrCodeUnpairedBooking,
		ErrCodeEarlyCome, ErrCodeLateCome, ErrCodeEarlyGo, ErrCodeLateGo,
		ErrCodeMissedCoreStart, ErrCodeMissedCoreEnd,
		ErrCodeBelowMinWorkTime, ErrCodeNoBookings,
		ErrCodeInvalidTime, ErrCodeDuplicateInTime:
		return true
	default:
		return false
	}
}
```

### Success Criteria

#### Automated Verification:
- [ ] Package compiles: `cd apps/api && go build ./internal/calculation/...`
- [ ] No linting errors: `make lint`

#### Manual Verification:
- [ ] Package documentation displays correctly: `go doc github.com/tolga/terp/internal/calculation`

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 3.

---

## Phase 3: Implement Pairing Logic

### Overview
Implement logic to pair in/out bookings and calculate durations.

### Changes Required

#### 1. Create pairing logic
**File**: `apps/api/internal/calculation/pairing.go`

```go
package calculation

import (
	"sort"

	"github.com/google/uuid"
	"github.com/tolga/terp/internal/timeutil"
)

// PairingResult contains the results of pairing bookings.
type PairingResult struct {
	Pairs          []BookingPair
	UnpairedInIDs  []uuid.UUID
	UnpairedOutIDs []uuid.UUID
	Warnings       []string
}

// PairBookings pairs in/out bookings by category and calculates durations.
// Bookings with existing PairIDs are paired together.
// Unpaired bookings are matched chronologically within their category.
func PairBookings(bookings []BookingInput) PairingResult {
	result := PairingResult{
		Pairs:          make([]BookingPair, 0),
		UnpairedInIDs:  make([]uuid.UUID, 0),
		UnpairedOutIDs: make([]uuid.UUID, 0),
		Warnings:       make([]string, 0),
	}

	if len(bookings) == 0 {
		return result
	}

	// Separate by category
	workBookings := filterByCategory(bookings, CategoryWork)
	breakBookings := filterByCategory(bookings, CategoryBreak)

	// Pair work bookings
	workPairs, workUnpairedIn, workUnpairedOut, workWarnings := pairByCategory(workBookings, CategoryWork)
	result.Pairs = append(result.Pairs, workPairs...)
	result.UnpairedInIDs = append(result.UnpairedInIDs, workUnpairedIn...)
	result.UnpairedOutIDs = append(result.UnpairedOutIDs, workUnpairedOut...)
	result.Warnings = append(result.Warnings, workWarnings...)

	// Pair break bookings
	breakPairs, breakUnpairedIn, breakUnpairedOut, breakWarnings := pairByCategory(breakBookings, CategoryBreak)
	result.Pairs = append(result.Pairs, breakPairs...)
	result.UnpairedInIDs = append(result.UnpairedInIDs, breakUnpairedIn...)
	result.UnpairedOutIDs = append(result.UnpairedOutIDs, breakUnpairedOut...)
	result.Warnings = append(result.Warnings, breakWarnings...)

	return result
}

func filterByCategory(bookings []BookingInput, category BookingCategory) []BookingInput {
	var filtered []BookingInput
	for _, b := range bookings {
		if b.Category == category {
			filtered = append(filtered, b)
		}
	}
	return filtered
}

func pairByCategory(bookings []BookingInput, category BookingCategory) (
	pairs []BookingPair, unpairedIn, unpairedOut []uuid.UUID, warnings []string,
) {
	pairs = make([]BookingPair, 0)
	warnings = make([]string, 0)

	// Build maps by direction
	inBookings := make(map[uuid.UUID]*BookingInput)
	outBookings := make(map[uuid.UUID]*BookingInput)
	var inList, outList []*BookingInput

	for i := range bookings {
		b := &bookings[i]
		if b.Direction == DirectionIn {
			inBookings[b.ID] = b
			inList = append(inList, b)
		} else {
			outBookings[b.ID] = b
			outList = append(outList, b)
		}
	}

	// Sort by time for chronological pairing
	sort.Slice(inList, func(i, j int) bool { return inList[i].Time < inList[j].Time })
	sort.Slice(outList, func(i, j int) bool { return outList[i].Time < outList[j].Time })

	// Track which bookings have been paired
	pairedIn := make(map[uuid.UUID]bool)
	pairedOut := make(map[uuid.UUID]bool)

	// First pass: pair by existing PairID
	for _, in := range inList {
		if in.PairID != nil {
			if out, ok := outBookings[*in.PairID]; ok {
				pair := createPair(in, out, category)
				if pair.InBooking.Time > pair.OutBooking.Time {
					warnings = append(warnings, WarnCodeCrossMidnight)
				}
				pairs = append(pairs, pair)
				pairedIn[in.ID] = true
				pairedOut[out.ID] = true
			}
		}
	}

	// Second pass: pair unpaired bookings chronologically
	outIdx := 0
	for _, in := range inList {
		if pairedIn[in.ID] {
			continue
		}
		// Find next unpaired out booking after this in
		for outIdx < len(outList) && (pairedOut[outList[outIdx].ID] || outList[outIdx].Time < in.Time) {
			outIdx++
		}
		if outIdx < len(outList) && !pairedOut[outList[outIdx].ID] {
			out := outList[outIdx]
			pair := createPair(in, out, category)
			if pair.InBooking.Time > pair.OutBooking.Time {
				warnings = append(warnings, WarnCodeCrossMidnight)
			}
			pairs = append(pairs, pair)
			pairedIn[in.ID] = true
			pairedOut[out.ID] = true
			outIdx++
		}
	}

	// Collect unpaired
	for _, in := range inList {
		if !pairedIn[in.ID] {
			unpairedIn = append(unpairedIn, in.ID)
		}
	}
	for _, out := range outList {
		if !pairedOut[out.ID] {
			unpairedOut = append(unpairedOut, out.ID)
		}
	}

	return pairs, unpairedIn, unpairedOut, warnings
}

func createPair(in, out *BookingInput, category BookingCategory) BookingPair {
	endTime := timeutil.NormalizeCrossMidnight(in.Time, out.Time)
	return BookingPair{
		InBooking:  in,
		OutBooking: out,
		Category:   category,
		Duration:   endTime - in.Time,
	}
}

// CalculateGrossTime sums the duration of all work pairs.
func CalculateGrossTime(pairs []BookingPair) int {
	total := 0
	for _, p := range pairs {
		if p.Category == CategoryWork {
			total += p.Duration
		}
	}
	return total
}

// CalculateBreakTime sums the duration of all break pairs.
func CalculateBreakTime(pairs []BookingPair) int {
	total := 0
	for _, p := range pairs {
		if p.Category == CategoryBreak {
			total += p.Duration
		}
	}
	return total
}

// FindFirstCome returns the earliest arrival time, or nil if no arrivals.
func FindFirstCome(bookings []BookingInput) *int {
	var first *int
	for _, b := range bookings {
		if b.Direction == DirectionIn && b.Category == CategoryWork {
			if first == nil || b.Time < *first {
				t := b.Time
				first = &t
			}
		}
	}
	return first
}

// FindLastGo returns the latest departure time, or nil if no departures.
func FindLastGo(bookings []BookingInput) *int {
	var last *int
	for _, b := range bookings {
		if b.Direction == DirectionOut && b.Category == CategoryWork {
			if last == nil || b.Time > *last {
				t := b.Time
				last = &t
			}
		}
	}
	return last
}
```

#### 2. Create pairing tests
**File**: `apps/api/internal/calculation/pairing_test.go`

```go
package calculation_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/calculation"
)

func TestPairBookings_Empty(t *testing.T) {
	result := calculation.PairBookings(nil)
	assert.Empty(t, result.Pairs)
	assert.Empty(t, result.UnpairedInIDs)
	assert.Empty(t, result.UnpairedOutIDs)
}

func TestPairBookings_SinglePair(t *testing.T) {
	comeID := uuid.New()
	goID := uuid.New()

	bookings := []calculation.BookingInput{
		{ID: comeID, Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
		{ID: goID, Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
	}

	result := calculation.PairBookings(bookings)

	require.Len(t, result.Pairs, 1)
	assert.Equal(t, comeID, result.Pairs[0].InBooking.ID)
	assert.Equal(t, goID, result.Pairs[0].OutBooking.ID)
	assert.Equal(t, 540, result.Pairs[0].Duration) // 9 hours = 540 min
	assert.Empty(t, result.UnpairedInIDs)
	assert.Empty(t, result.UnpairedOutIDs)
}

func TestPairBookings_WithExistingPairID(t *testing.T) {
	comeID := uuid.New()
	goID := uuid.New()

	bookings := []calculation.BookingInput{
		{ID: comeID, Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork, PairID: &goID},
		{ID: goID, Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork, PairID: &comeID},
	}

	result := calculation.PairBookings(bookings)

	require.Len(t, result.Pairs, 1)
	assert.Equal(t, comeID, result.Pairs[0].InBooking.ID)
	assert.Equal(t, goID, result.Pairs[0].OutBooking.ID)
}

func TestPairBookings_MultiplePairs(t *testing.T) {
	// Morning shift + afternoon shift
	come1ID, go1ID := uuid.New(), uuid.New()
	come2ID, go2ID := uuid.New(), uuid.New()

	bookings := []calculation.BookingInput{
		{ID: come1ID, Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},   // 08:00
		{ID: go1ID, Time: 720, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},    // 12:00
		{ID: come2ID, Time: 780, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},   // 13:00
		{ID: go2ID, Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},   // 17:00
	}

	result := calculation.PairBookings(bookings)

	require.Len(t, result.Pairs, 2)
	assert.Equal(t, 240, result.Pairs[0].Duration) // 4 hours
	assert.Equal(t, 240, result.Pairs[1].Duration) // 4 hours
}

func TestPairBookings_WithBreaks(t *testing.T) {
	comeID, goID := uuid.New(), uuid.New()
	breakStartID, breakEndID := uuid.New(), uuid.New()

	bookings := []calculation.BookingInput{
		{ID: comeID, Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
		{ID: breakStartID, Time: 720, Direction: calculation.DirectionOut, Category: calculation.CategoryBreak},
		{ID: breakEndID, Time: 750, Direction: calculation.DirectionIn, Category: calculation.CategoryBreak},
		{ID: goID, Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
	}

	result := calculation.PairBookings(bookings)

	require.Len(t, result.Pairs, 2) // 1 work pair + 1 break pair

	var workPair, breakPair *calculation.BookingPair
	for i := range result.Pairs {
		if result.Pairs[i].Category == calculation.CategoryWork {
			workPair = &result.Pairs[i]
		} else {
			breakPair = &result.Pairs[i]
		}
	}

	require.NotNil(t, workPair)
	assert.Equal(t, 540, workPair.Duration) // 9 hours

	require.NotNil(t, breakPair)
	assert.Equal(t, 30, breakPair.Duration) // 30 min break
}

func TestPairBookings_Unpaired(t *testing.T) {
	comeID := uuid.New()

	bookings := []calculation.BookingInput{
		{ID: comeID, Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
	}

	result := calculation.PairBookings(bookings)

	assert.Empty(t, result.Pairs)
	assert.Equal(t, []uuid.UUID{comeID}, result.UnpairedInIDs)
	assert.Empty(t, result.UnpairedOutIDs)
}

func TestPairBookings_CrossMidnight(t *testing.T) {
	comeID, goID := uuid.New(), uuid.New()

	bookings := []calculation.BookingInput{
		{ID: comeID, Time: 1320, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},  // 22:00
		{ID: goID, Time: 120, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},    // 02:00 next day
	}

	result := calculation.PairBookings(bookings)

	require.Len(t, result.Pairs, 1)
	assert.Equal(t, 240, result.Pairs[0].Duration) // 4 hours (22:00 to 02:00)
	assert.Contains(t, result.Warnings, calculation.WarnCodeCrossMidnight)
}

func TestCalculateGrossTime(t *testing.T) {
	pairs := []calculation.BookingPair{
		{Category: calculation.CategoryWork, Duration: 240},
		{Category: calculation.CategoryWork, Duration: 240},
		{Category: calculation.CategoryBreak, Duration: 30}, // Should not be counted
	}

	gross := calculation.CalculateGrossTime(pairs)
	assert.Equal(t, 480, gross)
}

func TestCalculateBreakTime(t *testing.T) {
	pairs := []calculation.BookingPair{
		{Category: calculation.CategoryWork, Duration: 480},
		{Category: calculation.CategoryBreak, Duration: 30},
		{Category: calculation.CategoryBreak, Duration: 15},
	}

	breakTime := calculation.CalculateBreakTime(pairs)
	assert.Equal(t, 45, breakTime)
}

func TestFindFirstCome(t *testing.T) {
	bookings := []calculation.BookingInput{
		{Time: 500, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
		{Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
		{Time: 720, Direction: calculation.DirectionIn, Category: calculation.CategoryBreak}, // break, not work
		{Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
	}

	first := calculation.FindFirstCome(bookings)
	require.NotNil(t, first)
	assert.Equal(t, 480, *first)
}

func TestFindLastGo(t *testing.T) {
	bookings := []calculation.BookingInput{
		{Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
		{Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
		{Time: 1050, Direction: calculation.DirectionIn, Category: calculation.CategoryBreak}, // break end, not work
		{Time: 1080, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
	}

	last := calculation.FindLastGo(bookings)
	require.NotNil(t, last)
	assert.Equal(t, 1080, *last)
}
```

### Success Criteria

#### Automated Verification:
- [ ] Tests pass: `cd apps/api && go test -v -race ./internal/calculation/...`
- [ ] No linting errors: `make lint`

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 4.

---

## Phase 4: Implement Rounding Logic

### Overview
Implement time rounding based on day plan configuration.

### Changes Required

#### 1. Create rounding logic
**File**: `apps/api/internal/calculation/rounding.go`

```go
package calculation

// RoundTime applies rounding to a time value based on configuration.
// Returns the original time if config is nil or has RoundingNone type.
func RoundTime(minutes int, config *RoundingConfig) int {
	if config == nil || config.Type == RoundingNone || config.Interval <= 0 {
		return minutes
	}

	switch config.Type {
	case RoundingUp:
		return roundUp(minutes, config.Interval)
	case RoundingDown:
		return roundDown(minutes, config.Interval)
	case RoundingNearest:
		return roundNearest(minutes, config.Interval)
	default:
		return minutes
	}
}

func roundUp(minutes, interval int) int {
	remainder := minutes % interval
	if remainder == 0 {
		return minutes
	}
	return minutes + (interval - remainder)
}

func roundDown(minutes, interval int) int {
	return minutes - (minutes % interval)
}

func roundNearest(minutes, interval int) int {
	remainder := minutes % interval
	if remainder < interval/2 {
		return roundDown(minutes, interval)
	}
	return roundUp(minutes, interval)
}

// RoundComeTime applies rounding to an arrival time.
// For arrivals, rounding UP is employee-favorable (counts from later).
// For arrivals, rounding DOWN is employer-favorable (counts from earlier).
func RoundComeTime(minutes int, config *RoundingConfig) int {
	return RoundTime(minutes, config)
}

// RoundGoTime applies rounding to a departure time.
// For departures, rounding DOWN is employee-favorable (counts until earlier).
// For departures, rounding UP is employer-favorable (counts until later).
func RoundGoTime(minutes int, config *RoundingConfig) int {
	return RoundTime(minutes, config)
}
```

#### 2. Create rounding tests
**File**: `apps/api/internal/calculation/rounding_test.go`

```go
package calculation_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/tolga/terp/internal/calculation"
)

func TestRoundTime_NilConfig(t *testing.T) {
	result := calculation.RoundTime(487, nil)
	assert.Equal(t, 487, result)
}

func TestRoundTime_RoundingNone(t *testing.T) {
	config := &calculation.RoundingConfig{Type: calculation.RoundingNone, Interval: 15}
	result := calculation.RoundTime(487, config)
	assert.Equal(t, 487, result)
}

func TestRoundTime_ZeroInterval(t *testing.T) {
	config := &calculation.RoundingConfig{Type: calculation.RoundingUp, Interval: 0}
	result := calculation.RoundTime(487, config)
	assert.Equal(t, 487, result)
}

func TestRoundTime_RoundUp(t *testing.T) {
	config := &calculation.RoundingConfig{Type: calculation.RoundingUp, Interval: 15}

	tests := []struct {
		name     string
		input    int
		expected int
	}{
		{"already rounded", 480, 480},      // 08:00 -> 08:00
		{"needs rounding", 481, 495},       // 08:01 -> 08:15
		{"one minute before", 479, 480},    // 07:59 -> 08:00
		{"halfway", 487, 495},              // 08:07 -> 08:15
		{"just after boundary", 495, 495},  // 08:15 -> 08:15
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.RoundTime(tt.input, config)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestRoundTime_RoundDown(t *testing.T) {
	config := &calculation.RoundingConfig{Type: calculation.RoundingDown, Interval: 15}

	tests := []struct {
		name     string
		input    int
		expected int
	}{
		{"already rounded", 480, 480},     // 08:00 -> 08:00
		{"needs rounding", 481, 480},      // 08:01 -> 08:00
		{"one minute before", 494, 480},   // 08:14 -> 08:00
		{"halfway", 487, 480},             // 08:07 -> 08:00
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.RoundTime(tt.input, config)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestRoundTime_RoundNearest(t *testing.T) {
	config := &calculation.RoundingConfig{Type: calculation.RoundingNearest, Interval: 15}

	tests := []struct {
		name     string
		input    int
		expected int
	}{
		{"already rounded", 480, 480},      // 08:00 -> 08:00
		{"round down", 481, 480},           // 08:01 -> 08:00
		{"round down boundary", 487, 480},  // 08:07 -> 08:00
		{"round up", 488, 495},             // 08:08 -> 08:15
		{"round up near boundary", 494, 495}, // 08:14 -> 08:15
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.RoundTime(tt.input, config)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestRoundTime_DifferentIntervals(t *testing.T) {
	tests := []struct {
		name     string
		input    int
		interval int
		typ      calculation.RoundingType
		expected int
	}{
		{"5 min up", 482, 5, calculation.RoundingUp, 485},
		{"5 min down", 484, 5, calculation.RoundingDown, 480},
		{"10 min nearest", 486, 10, calculation.RoundingNearest, 490},
		{"30 min up", 491, 30, calculation.RoundingUp, 510},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config := &calculation.RoundingConfig{Type: tt.typ, Interval: tt.interval}
			result := calculation.RoundTime(tt.input, config)
			assert.Equal(t, tt.expected, result)
		})
	}
}
```

### Success Criteria

#### Automated Verification:
- [ ] Tests pass: `cd apps/api && go test -v -race ./internal/calculation/...`
- [ ] No linting errors: `make lint`

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 5.

---

## Phase 5: Implement Tolerance Logic

### Overview
Implement tolerance/grace period application for arrivals and departures.

### Changes Required

#### 1. Create tolerance logic
**File**: `apps/api/internal/calculation/tolerance.go`

```go
package calculation

// ApplyComeTolerance adjusts an arrival time based on tolerance settings.
// If arrival is within tolerance window of the expected time, it's normalized.
//
// Example with ComeTo=480 (08:00) and TolerancePlus=5:
// - Arrive at 08:03 (483) -> Treated as 08:00 (480)
// - Arrive at 08:06 (486) -> Not adjusted, returns 486
func ApplyComeTolerance(actualTime int, expectedTime *int, tolerance ToleranceConfig) int {
	if expectedTime == nil {
		return actualTime
	}

	exp := *expectedTime

	// Late arrival: check tolerance plus
	if actualTime > exp {
		if actualTime <= exp+tolerance.ComePlus {
			return exp
		}
	}

	// Early arrival: check tolerance minus
	if actualTime < exp {
		if actualTime >= exp-tolerance.ComeMinus {
			return exp
		}
	}

	return actualTime
}

// ApplyGoTolerance adjusts a departure time based on tolerance settings.
// If departure is within tolerance window of the expected time, it's normalized.
//
// Example with GoFrom=1020 (17:00) and ToleranceMinus=5:
// - Leave at 16:57 (1017) -> Treated as 17:00 (1020)
// - Leave at 16:54 (1014) -> Not adjusted, returns 1014
func ApplyGoTolerance(actualTime int, expectedTime *int, tolerance ToleranceConfig) int {
	if expectedTime == nil {
		return actualTime
	}

	exp := *expectedTime

	// Early departure: check tolerance minus
	if actualTime < exp {
		if actualTime >= exp-tolerance.GoMinus {
			return exp
		}
	}

	// Late departure: check tolerance plus
	if actualTime > exp {
		if actualTime <= exp+tolerance.GoPlus {
			return exp
		}
	}

	return actualTime
}

// ValidateTimeWindow checks if a time is within an allowed window.
// Returns error codes if the time is outside the window.
func ValidateTimeWindow(actualTime int, from, to *int, earlyCode, lateCode string) []string {
	var errors []string

	if from != nil && actualTime < *from {
		errors = append(errors, earlyCode)
	}

	if to != nil && actualTime > *to {
		errors = append(errors, lateCode)
	}

	return errors
}

// ValidateCoreHours checks if presence covers required core hours.
// firstCome is the first arrival time, lastGo is the last departure time.
// Returns error codes if core hours are not covered.
func ValidateCoreHours(firstCome, lastGo *int, coreStart, coreEnd *int) []string {
	var errors []string

	if coreStart == nil || coreEnd == nil {
		return errors // No core hours defined
	}

	if firstCome == nil || *firstCome > *coreStart {
		errors = append(errors, ErrCodeMissedCoreStart)
	}

	if lastGo == nil || *lastGo < *coreEnd {
		errors = append(errors, ErrCodeMissedCoreEnd)
	}

	return errors
}
```

#### 2. Create tolerance tests
**File**: `apps/api/internal/calculation/tolerance_test.go`

```go
package calculation_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/tolga/terp/internal/calculation"
)

func TestApplyComeTolerance_NilExpected(t *testing.T) {
	tolerance := calculation.ToleranceConfig{ComePlus: 5, ComeMinus: 5}
	result := calculation.ApplyComeTolerance(485, nil, tolerance)
	assert.Equal(t, 485, result)
}

func TestApplyComeTolerance_LateArrival(t *testing.T) {
	expected := 480 // 08:00
	tolerance := calculation.ToleranceConfig{ComePlus: 5, ComeMinus: 5}

	tests := []struct {
		name     string
		actual   int
		expected int
	}{
		{"within tolerance", 483, 480},      // 08:03 -> 08:00
		{"at tolerance boundary", 485, 480}, // 08:05 -> 08:00
		{"beyond tolerance", 486, 486},      // 08:06 -> 08:06
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.ApplyComeTolerance(tt.actual, &expected, tolerance)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestApplyComeTolerance_EarlyArrival(t *testing.T) {
	expected := 480 // 08:00
	tolerance := calculation.ToleranceConfig{ComePlus: 5, ComeMinus: 10}

	tests := []struct {
		name     string
		actual   int
		expected int
	}{
		{"within tolerance", 475, 480},      // 07:55 -> 08:00
		{"at tolerance boundary", 470, 480}, // 07:50 -> 08:00
		{"beyond tolerance", 469, 469},      // 07:49 -> 07:49
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.ApplyComeTolerance(tt.actual, &expected, tolerance)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestApplyGoTolerance_NilExpected(t *testing.T) {
	tolerance := calculation.ToleranceConfig{GoPlus: 5, GoMinus: 5}
	result := calculation.ApplyGoTolerance(1020, nil, tolerance)
	assert.Equal(t, 1020, result)
}

func TestApplyGoTolerance_EarlyDeparture(t *testing.T) {
	expected := 1020 // 17:00
	tolerance := calculation.ToleranceConfig{GoPlus: 5, GoMinus: 5}

	tests := []struct {
		name     string
		actual   int
		expected int
	}{
		{"within tolerance", 1017, 1020},    // 16:57 -> 17:00
		{"at tolerance boundary", 1015, 1020}, // 16:55 -> 17:00
		{"beyond tolerance", 1014, 1014},    // 16:54 -> 16:54
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.ApplyGoTolerance(tt.actual, &expected, tolerance)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestApplyGoTolerance_LateDeparture(t *testing.T) {
	expected := 1020 // 17:00
	tolerance := calculation.ToleranceConfig{GoPlus: 10, GoMinus: 5}

	tests := []struct {
		name     string
		actual   int
		expected int
	}{
		{"within tolerance", 1025, 1020},    // 17:05 -> 17:00
		{"at tolerance boundary", 1030, 1020}, // 17:10 -> 17:00
		{"beyond tolerance", 1031, 1031},    // 17:11 -> 17:11
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.ApplyGoTolerance(tt.actual, &expected, tolerance)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestValidateTimeWindow(t *testing.T) {
	from := 480  // 08:00
	to := 510    // 08:30

	tests := []struct {
		name     string
		actual   int
		expected []string
	}{
		{"within window", 490, nil},
		{"at from boundary", 480, nil},
		{"at to boundary", 510, nil},
		{"too early", 470, []string{"EARLY"}},
		{"too late", 520, []string{"LATE"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.ValidateTimeWindow(tt.actual, &from, &to, "EARLY", "LATE")
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestValidateTimeWindow_NilBoundaries(t *testing.T) {
	result := calculation.ValidateTimeWindow(490, nil, nil, "EARLY", "LATE")
	assert.Empty(t, result)
}

func TestValidateCoreHours(t *testing.T) {
	coreStart := 540 // 09:00
	coreEnd := 960   // 16:00

	tests := []struct {
		name      string
		firstCome *int
		lastGo    *int
		expected  []string
	}{
		{"covers core hours", intPtr(480), intPtr(1020), nil},
		{"exact core hours", intPtr(540), intPtr(960), nil},
		{"missed start", intPtr(600), intPtr(1020), []string{calculation.ErrCodeMissedCoreStart}},
		{"missed end", intPtr(480), intPtr(900), []string{calculation.ErrCodeMissedCoreEnd}},
		{"missed both", intPtr(600), intPtr(900), []string{calculation.ErrCodeMissedCoreStart, calculation.ErrCodeMissedCoreEnd}},
		{"nil firstCome", nil, intPtr(1020), []string{calculation.ErrCodeMissedCoreStart}},
		{"nil lastGo", intPtr(480), nil, []string{calculation.ErrCodeMissedCoreEnd}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.ValidateCoreHours(tt.firstCome, tt.lastGo, &coreStart, &coreEnd)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestValidateCoreHours_NoCoreHours(t *testing.T) {
	result := calculation.ValidateCoreHours(intPtr(480), intPtr(1020), nil, nil)
	assert.Empty(t, result)
}

func intPtr(v int) *int {
	return &v
}
```

### Success Criteria

#### Automated Verification:
- [ ] Tests pass: `cd apps/api && go test -v -race ./internal/calculation/...`
- [ ] No linting errors: `make lint`

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 6.

---

## Phase 6: Implement Break Deduction Logic

### Overview
Implement break time deduction based on day plan break configurations.

### Changes Required

#### 1. Create break logic
**File**: `apps/api/internal/calculation/breaks.go`

```go
package calculation

// BreakDeductionResult contains the result of break calculations.
type BreakDeductionResult struct {
	DeductedMinutes int      // Total minutes to deduct
	Warnings        []string // Any warnings generated
}

// CalculateBreakDeduction determines how much break time to deduct.
// It considers:
// - Recorded break bookings (manual breaks)
// - Auto-deduct break configurations
// - Minimum break requirements
func CalculateBreakDeduction(
	recordedBreakTime int,
	grossWorkTime int,
	breakConfigs []BreakConfig,
) BreakDeductionResult {
	result := BreakDeductionResult{
		Warnings: make([]string, 0),
	}

	if len(breakConfigs) == 0 {
		// No break rules, use recorded breaks
		result.DeductedMinutes = recordedBreakTime
		return result
	}

	// Calculate required breaks from configs
	requiredBreak := calculateRequiredBreak(grossWorkTime, breakConfigs)

	// If manual breaks were recorded
	if recordedBreakTime > 0 {
		result.Warnings = append(result.Warnings, WarnCodeManualBreak)

		// Check if recorded break meets requirements
		if recordedBreakTime < requiredBreak.minDuration {
			result.Warnings = append(result.Warnings, WarnCodeShortBreak)
		}

		// Use recorded break time (don't auto-deduct if manual breaks exist)
		result.DeductedMinutes = recordedBreakTime
		return result
	}

	// No manual breaks - apply auto-deduct rules
	if requiredBreak.autoDeductTotal > 0 {
		result.DeductedMinutes = requiredBreak.autoDeductTotal
		result.Warnings = append(result.Warnings, WarnCodeAutoBreakApplied)
	}

	// Check if break is required but not recorded
	if requiredBreak.minDuration > 0 && recordedBreakTime == 0 {
		result.Warnings = append(result.Warnings, WarnCodeNoBreakRecorded)
	}

	return result
}

type requiredBreakInfo struct {
	minDuration     int // Minimum required break duration
	autoDeductTotal int // Total to auto-deduct if no manual breaks
}

func calculateRequiredBreak(grossWorkTime int, configs []BreakConfig) requiredBreakInfo {
	info := requiredBreakInfo{}

	for _, bc := range configs {
		// Check if this break rule applies based on work duration
		if bc.AfterWorkMinutes != nil && grossWorkTime < *bc.AfterWorkMinutes {
			continue // Not enough work time to trigger this break
		}

		switch bc.Type {
		case BreakTypeFixed:
			// Fixed breaks always apply if within work period
			if bc.AutoDeduct {
				info.autoDeductTotal += bc.Duration
			}
			info.minDuration += bc.Duration

		case BreakTypeVariable:
			// Variable breaks depend on work duration
			if bc.AutoDeduct {
				info.autoDeductTotal += bc.Duration
			}
			info.minDuration += bc.Duration

		case BreakTypeMinimum:
			// Minimum break required after threshold
			if bc.AutoDeduct {
				info.autoDeductTotal += bc.Duration
			}
			if bc.Duration > info.minDuration {
				info.minDuration = bc.Duration
			}
		}
	}

	return info
}

// CalculateNetTime computes net work time from gross time minus breaks.
// Applies MaxNetWorkTime cap if configured.
func CalculateNetTime(grossTime, breakTime int, maxNetWorkTime *int) (netTime int, warnings []string) {
	warnings = make([]string, 0)
	netTime = grossTime - breakTime

	if netTime < 0 {
		netTime = 0
	}

	if maxNetWorkTime != nil && netTime > *maxNetWorkTime {
		netTime = *maxNetWorkTime
		warnings = append(warnings, WarnCodeMaxTimeReached)
	}

	return netTime, warnings
}

// CalculateOvertimeUndertime computes overtime and undertime from net time and target.
func CalculateOvertimeUndertime(netTime, targetTime int) (overtime, undertime int) {
	diff := netTime - targetTime

	if diff > 0 {
		return diff, 0
	}
	return 0, -diff
}
```

#### 2. Create break tests
**File**: `apps/api/internal/calculation/breaks_test.go`

```go
package calculation_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/tolga/terp/internal/calculation"
)

func TestCalculateBreakDeduction_NoConfigs(t *testing.T) {
	result := calculation.CalculateBreakDeduction(30, 480, nil)
	assert.Equal(t, 30, result.DeductedMinutes)
	assert.Empty(t, result.Warnings)
}

func TestCalculateBreakDeduction_ManualBreakRecorded(t *testing.T) {
	configs := []calculation.BreakConfig{
		{Type: calculation.BreakTypeMinimum, Duration: 30, AutoDeduct: true},
	}

	result := calculation.CalculateBreakDeduction(45, 480, configs)

	assert.Equal(t, 45, result.DeductedMinutes)
	assert.Contains(t, result.Warnings, calculation.WarnCodeManualBreak)
}

func TestCalculateBreakDeduction_ManualBreakShort(t *testing.T) {
	configs := []calculation.BreakConfig{
		{Type: calculation.BreakTypeMinimum, Duration: 30, AutoDeduct: true},
	}

	result := calculation.CalculateBreakDeduction(20, 480, configs)

	assert.Equal(t, 20, result.DeductedMinutes)
	assert.Contains(t, result.Warnings, calculation.WarnCodeManualBreak)
	assert.Contains(t, result.Warnings, calculation.WarnCodeShortBreak)
}

func TestCalculateBreakDeduction_AutoDeduct(t *testing.T) {
	configs := []calculation.BreakConfig{
		{Type: calculation.BreakTypeMinimum, Duration: 30, AutoDeduct: true},
	}

	result := calculation.CalculateBreakDeduction(0, 480, configs)

	assert.Equal(t, 30, result.DeductedMinutes)
	assert.Contains(t, result.Warnings, calculation.WarnCodeAutoBreakApplied)
	assert.Contains(t, result.Warnings, calculation.WarnCodeNoBreakRecorded)
}

func TestCalculateBreakDeduction_MultipleBreaks(t *testing.T) {
	configs := []calculation.BreakConfig{
		{Type: calculation.BreakTypeFixed, Duration: 30, AutoDeduct: true},
		{Type: calculation.BreakTypeVariable, Duration: 15, AutoDeduct: true},
	}

	result := calculation.CalculateBreakDeduction(0, 480, configs)

	assert.Equal(t, 45, result.DeductedMinutes)
}

func TestCalculateBreakDeduction_WorkThreshold(t *testing.T) {
	threshold := 360 // 6 hours
	configs := []calculation.BreakConfig{
		{
			Type:             calculation.BreakTypeMinimum,
			Duration:         30,
			AfterWorkMinutes: &threshold,
			AutoDeduct:       true,
		},
	}

	// Short work day - break not triggered
	result := calculation.CalculateBreakDeduction(0, 300, configs)
	assert.Equal(t, 0, result.DeductedMinutes)

	// Long work day - break triggered
	result = calculation.CalculateBreakDeduction(0, 400, configs)
	assert.Equal(t, 30, result.DeductedMinutes)
}

func TestCalculateNetTime(t *testing.T) {
	tests := []struct {
		name        string
		gross       int
		breakTime   int
		maxNet      *int
		expectedNet int
		hasWarning  bool
	}{
		{"basic", 480, 30, nil, 450, false},
		{"no break", 480, 0, nil, 480, false},
		{"negative result", 30, 60, nil, 0, false},
		{"at max", 480, 0, intPtr(480), 480, false},
		{"capped by max", 540, 0, intPtr(480), 480, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			netTime, warnings := calculation.CalculateNetTime(tt.gross, tt.breakTime, tt.maxNet)
			assert.Equal(t, tt.expectedNet, netTime)
			if tt.hasWarning {
				assert.Contains(t, warnings, calculation.WarnCodeMaxTimeReached)
			} else {
				assert.Empty(t, warnings)
			}
		})
	}
}

func TestCalculateOvertimeUndertime(t *testing.T) {
	tests := []struct {
		name          string
		netTime       int
		targetTime    int
		expOvertime   int
		expUndertime  int
	}{
		{"exact match", 480, 480, 0, 0},
		{"overtime", 540, 480, 60, 0},
		{"undertime", 420, 480, 0, 60},
		{"zero net", 0, 480, 0, 480},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			overtime, undertime := calculation.CalculateOvertimeUndertime(tt.netTime, tt.targetTime)
			assert.Equal(t, tt.expOvertime, overtime)
			assert.Equal(t, tt.expUndertime, undertime)
		})
	}
}
```

### Success Criteria

#### Automated Verification:
- [ ] Tests pass: `cd apps/api && go test -v -race ./internal/calculation/...`
- [ ] No linting errors: `make lint`

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 7.

---

## Phase 7: Implement Main Calculator

### Overview
Implement the main Calculator that orchestrates all logic and produces the final result.

### Changes Required

#### 1. Create calculator
**File**: `apps/api/internal/calculation/calculator.go`

```go
package calculation

import (
	"github.com/google/uuid"
)

// Calculator performs time tracking calculations.
type Calculator struct{}

// NewCalculator creates a new Calculator instance.
func NewCalculator() *Calculator {
	return &Calculator{}
}

// Calculate performs a full day calculation and returns the result.
func (c *Calculator) Calculate(input CalculationInput) CalculationResult {
	result := CalculationResult{
		TargetTime:      input.DayPlan.RegularHours,
		BookingCount:    len(input.Bookings),
		CalculatedTimes: make(map[uuid.UUID]int),
		ErrorCodes:      make([]string, 0),
		Warnings:        make([]string, 0),
	}

	// Handle empty bookings
	if len(input.Bookings) == 0 {
		result.HasError = true
		result.ErrorCodes = append(result.ErrorCodes, ErrCodeNoBookings)
		return result
	}

	// Step 1: Apply rounding and tolerance to bookings
	processedBookings := c.processBookings(input.Bookings, input.DayPlan, &result)

	// Step 2: Pair bookings
	pairingResult := PairBookings(processedBookings)
	result.Pairs = pairingResult.Pairs
	result.UnpairedInIDs = pairingResult.UnpairedInIDs
	result.UnpairedOutIDs = pairingResult.UnpairedOutIDs
	result.Warnings = append(result.Warnings, pairingResult.Warnings...)

	// Add errors for unpaired bookings
	if len(result.UnpairedInIDs) > 0 {
		result.ErrorCodes = append(result.ErrorCodes, ErrCodeMissingGo)
	}
	if len(result.UnpairedOutIDs) > 0 {
		result.ErrorCodes = append(result.ErrorCodes, ErrCodeMissingCome)
	}

	// Step 3: Calculate first come / last go
	result.FirstCome = FindFirstCome(processedBookings)
	result.LastGo = FindLastGo(processedBookings)

	// Step 4: Validate time windows
	c.validateTimeWindows(&result, input.DayPlan)

	// Step 5: Validate core hours
	coreErrors := ValidateCoreHours(
		result.FirstCome,
		result.LastGo,
		input.DayPlan.CoreStart,
		input.DayPlan.CoreEnd,
	)
	result.ErrorCodes = append(result.ErrorCodes, coreErrors...)

	// Step 6: Calculate gross time
	result.GrossTime = CalculateGrossTime(result.Pairs)

	// Step 7: Calculate break deduction
	recordedBreakTime := CalculateBreakTime(result.Pairs)
	breakResult := CalculateBreakDeduction(
		recordedBreakTime,
		result.GrossTime,
		input.DayPlan.Breaks,
	)
	result.BreakTime = breakResult.DeductedMinutes
	result.Warnings = append(result.Warnings, breakResult.Warnings...)

	// Step 8: Calculate net time
	netTime, netWarnings := CalculateNetTime(
		result.GrossTime,
		result.BreakTime,
		input.DayPlan.MaxNetWorkTime,
	)
	result.NetTime = netTime
	result.Warnings = append(result.Warnings, netWarnings...)

	// Step 9: Validate minimum work time
	if input.DayPlan.MinWorkTime != nil && result.NetTime < *input.DayPlan.MinWorkTime {
		result.ErrorCodes = append(result.ErrorCodes, ErrCodeBelowMinWorkTime)
	}

	// Step 10: Calculate overtime/undertime
	result.Overtime, result.Undertime = CalculateOvertimeUndertime(result.NetTime, result.TargetTime)

	// Set error flag if any errors
	result.HasError = len(result.ErrorCodes) > 0

	return result
}

func (c *Calculator) processBookings(
	bookings []BookingInput,
	dayPlan DayPlanInput,
	result *CalculationResult,
) []BookingInput {
	processed := make([]BookingInput, len(bookings))

	for i, b := range bookings {
		processed[i] = b
		calculatedTime := b.Time

		if b.Category == CategoryWork {
			if b.Direction == DirectionIn {
				// Apply come tolerance
				calculatedTime = ApplyComeTolerance(b.Time, dayPlan.ComeTo, dayPlan.Tolerance)
				// Apply come rounding
				calculatedTime = RoundComeTime(calculatedTime, dayPlan.RoundingCome)
			} else {
				// Apply go tolerance
				calculatedTime = ApplyGoTolerance(b.Time, dayPlan.GoFrom, dayPlan.Tolerance)
				// Apply go rounding
				calculatedTime = RoundGoTime(calculatedTime, dayPlan.RoundingGo)
			}
		}

		processed[i].Time = calculatedTime
		result.CalculatedTimes[b.ID] = calculatedTime
	}

	return processed
}

func (c *Calculator) validateTimeWindows(result *CalculationResult, dayPlan DayPlanInput) {
	if result.FirstCome != nil {
		comeErrors := ValidateTimeWindow(
			*result.FirstCome,
			dayPlan.ComeFrom,
			dayPlan.ComeTo,
			ErrCodeEarlyCome,
			ErrCodeLateCome,
		)
		result.ErrorCodes = append(result.ErrorCodes, comeErrors...)
	}

	if result.LastGo != nil {
		goErrors := ValidateTimeWindow(
			*result.LastGo,
			dayPlan.GoFrom,
			dayPlan.GoTo,
			ErrCodeEarlyGo,
			ErrCodeLateGo,
		)
		result.ErrorCodes = append(result.ErrorCodes, goErrors...)
	}
}
```

#### 2. Create calculator tests
**File**: `apps/api/internal/calculation/calculator_test.go`

```go
package calculation_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/calculation"
)

func TestCalculator_EmptyBookings(t *testing.T) {
	calc := calculation.NewCalculator()
	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings:   nil,
		DayPlan:    calculation.DayPlanInput{RegularHours: 480},
	}

	result := calc.Calculate(input)

	assert.True(t, result.HasError)
	assert.Contains(t, result.ErrorCodes, calculation.ErrCodeNoBookings)
}

func TestCalculator_SimpleWorkDay(t *testing.T) {
	calc := calculation.NewCalculator()
	comeID, goID := uuid.New(), uuid.New()

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: comeID, Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
			{ID: goID, Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
		},
		DayPlan: calculation.DayPlanInput{RegularHours: 480},
	}

	result := calc.Calculate(input)

	assert.False(t, result.HasError)
	assert.Equal(t, 540, result.GrossTime)  // 9 hours
	assert.Equal(t, 540, result.NetTime)    // No breaks
	assert.Equal(t, 480, result.TargetTime)
	assert.Equal(t, 60, result.Overtime)
	assert.Equal(t, 0, result.Undertime)
	assert.Equal(t, 2, result.BookingCount)
	require.NotNil(t, result.FirstCome)
	assert.Equal(t, 480, *result.FirstCome)
	require.NotNil(t, result.LastGo)
	assert.Equal(t, 1020, *result.LastGo)
}

func TestCalculator_WithBreaks(t *testing.T) {
	calc := calculation.NewCalculator()

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
			{ID: uuid.New(), Time: 720, Direction: calculation.DirectionOut, Category: calculation.CategoryBreak},
			{ID: uuid.New(), Time: 750, Direction: calculation.DirectionIn, Category: calculation.CategoryBreak},
			{ID: uuid.New(), Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
		},
		DayPlan: calculation.DayPlanInput{RegularHours: 480},
	}

	result := calc.Calculate(input)

	assert.False(t, result.HasError)
	assert.Equal(t, 540, result.GrossTime)  // 9 hours (08:00-17:00)
	assert.Equal(t, 30, result.BreakTime)   // 30 min break
	assert.Equal(t, 510, result.NetTime)    // 8.5 hours
	assert.Equal(t, 30, result.Overtime)    // 30 min overtime
}

func TestCalculator_WithAutoDeductBreak(t *testing.T) {
	calc := calculation.NewCalculator()

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
			{ID: uuid.New(), Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			Breaks: []calculation.BreakConfig{
				{Type: calculation.BreakTypeMinimum, Duration: 30, AutoDeduct: true},
			},
		},
	}

	result := calc.Calculate(input)

	assert.False(t, result.HasError)
	assert.Equal(t, 540, result.GrossTime)
	assert.Equal(t, 30, result.BreakTime)
	assert.Equal(t, 510, result.NetTime)
	assert.Contains(t, result.Warnings, calculation.WarnCodeAutoBreakApplied)
}

func TestCalculator_WithRounding(t *testing.T) {
	calc := calculation.NewCalculator()
	comeID, goID := uuid.New(), uuid.New()

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: comeID, Time: 483, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},  // 08:03
			{ID: goID, Time: 1017, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},  // 16:57
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			RoundingCome: &calculation.RoundingConfig{Type: calculation.RoundingUp, Interval: 15},
			RoundingGo:   &calculation.RoundingConfig{Type: calculation.RoundingDown, Interval: 15},
		},
	}

	result := calc.Calculate(input)

	// Come 08:03 rounds up to 08:15 (495)
	// Go 16:57 rounds down to 16:45 (1005)
	// Duration: 1005 - 495 = 510 minutes
	assert.Equal(t, 510, result.GrossTime)
	assert.Equal(t, 495, result.CalculatedTimes[comeID])
	assert.Equal(t, 1005, result.CalculatedTimes[goID])
}

func TestCalculator_WithTolerance(t *testing.T) {
	calc := calculation.NewCalculator()
	comeID, goID := uuid.New(), uuid.New()
	comeTo := 480  // Expected arrival: 08:00
	goFrom := 1020 // Expected departure: 17:00

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: comeID, Time: 483, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},  // 08:03 (3 min late)
			{ID: goID, Time: 1017, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},  // 16:57 (3 min early)
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			ComeTo:       &comeTo,
			GoFrom:       &goFrom,
			Tolerance: calculation.ToleranceConfig{
				ComePlus: 5,  // 5 min grace for late arrival
				GoMinus:  5,  // 5 min grace for early departure
			},
		},
	}

	result := calc.Calculate(input)

	// Come 08:03 within tolerance, treated as 08:00
	// Go 16:57 within tolerance, treated as 17:00
	// Duration: 1020 - 480 = 540 minutes
	assert.Equal(t, 540, result.GrossTime)
	assert.Equal(t, 480, result.CalculatedTimes[comeID])
	assert.Equal(t, 1020, result.CalculatedTimes[goID])
}

func TestCalculator_UnpairedBooking(t *testing.T) {
	calc := calculation.NewCalculator()
	comeID := uuid.New()

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: comeID, Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
		},
		DayPlan: calculation.DayPlanInput{RegularHours: 480},
	}

	result := calc.Calculate(input)

	assert.True(t, result.HasError)
	assert.Contains(t, result.ErrorCodes, calculation.ErrCodeMissingGo)
	assert.Equal(t, []uuid.UUID{comeID}, result.UnpairedInIDs)
}

func TestCalculator_TimeWindowViolation(t *testing.T) {
	calc := calculation.NewCalculator()
	comeFrom := 480 // Earliest arrival: 08:00
	comeTo := 510   // Latest arrival: 08:30

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 540, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},  // 09:00 (late!)
			{ID: uuid.New(), Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			ComeFrom:     &comeFrom,
			ComeTo:       &comeTo,
		},
	}

	result := calc.Calculate(input)

	assert.True(t, result.HasError)
	assert.Contains(t, result.ErrorCodes, calculation.ErrCodeLateCome)
}

func TestCalculator_CoreHoursViolation(t *testing.T) {
	calc := calculation.NewCalculator()
	coreStart := 540 // Core starts: 09:00
	coreEnd := 960   // Core ends: 16:00

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 600, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},  // 10:00 (missed core start!)
			{ID: uuid.New(), Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			CoreStart:    &coreStart,
			CoreEnd:      &coreEnd,
		},
	}

	result := calc.Calculate(input)

	assert.True(t, result.HasError)
	assert.Contains(t, result.ErrorCodes, calculation.ErrCodeMissedCoreStart)
}

func TestCalculator_MaxNetWorkTime(t *testing.T) {
	calc := calculation.NewCalculator()
	maxNet := 480 // Max 8 hours

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 420, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},  // 07:00
			{ID: uuid.New(), Time: 1080, Direction: calculation.DirectionOut, Category: calculation.CategoryWork}, // 18:00 (11 hours!)
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours:   480,
			MaxNetWorkTime: &maxNet,
		},
	}

	result := calc.Calculate(input)

	assert.Equal(t, 660, result.GrossTime) // 11 hours
	assert.Equal(t, 480, result.NetTime)   // Capped at 8 hours
	assert.Contains(t, result.Warnings, calculation.WarnCodeMaxTimeReached)
}

func TestCalculator_MinWorkTime(t *testing.T) {
	calc := calculation.NewCalculator()
	minWork := 240 // Minimum 4 hours

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
			{ID: uuid.New(), Time: 600, Direction: calculation.DirectionOut, Category: calculation.CategoryWork}, // Only 2 hours
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			MinWorkTime:  &minWork,
		},
	}

	result := calc.Calculate(input)

	assert.True(t, result.HasError)
	assert.Contains(t, result.ErrorCodes, calculation.ErrCodeBelowMinWorkTime)
}

func TestCalculator_CrossMidnight(t *testing.T) {
	calc := calculation.NewCalculator()

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 1320, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},  // 22:00
			{ID: uuid.New(), Time: 120, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},  // 02:00 next day
		},
		DayPlan: calculation.DayPlanInput{RegularHours: 480},
	}

	result := calc.Calculate(input)

	assert.Equal(t, 240, result.GrossTime) // 4 hours
	assert.Contains(t, result.Warnings, calculation.WarnCodeCrossMidnight)
}

func TestCalculator_FullWorkDay(t *testing.T) {
	// Integration test: typical work day with all features
	calc := calculation.NewCalculator()
	threshold := 360 // 6 hours
	coreStart := 540 // 09:00
	coreEnd := 960   // 16:00
	comeFrom := 450  // 07:30
	comeTo := 540    // 09:00
	goFrom := 960    // 16:00
	goTo := 1080     // 18:00

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 478, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},   // 07:58
			{ID: uuid.New(), Time: 720, Direction: calculation.DirectionOut, Category: calculation.CategoryBreak}, // 12:00 break start
			{ID: uuid.New(), Time: 765, Direction: calculation.DirectionIn, Category: calculation.CategoryBreak},  // 12:45 break end
			{ID: uuid.New(), Time: 1022, Direction: calculation.DirectionOut, Category: calculation.CategoryWork}, // 17:02
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			ComeFrom:     &comeFrom,
			ComeTo:       &comeTo,
			GoFrom:       &goFrom,
			GoTo:         &goTo,
			CoreStart:    &coreStart,
			CoreEnd:      &coreEnd,
			Tolerance: calculation.ToleranceConfig{
				ComePlus:  5,
				ComeMinus: 5,
				GoPlus:    5,
				GoMinus:   5,
			},
			RoundingCome: &calculation.RoundingConfig{Type: calculation.RoundingNearest, Interval: 5},
			RoundingGo:   &calculation.RoundingConfig{Type: calculation.RoundingNearest, Interval: 5},
			Breaks: []calculation.BreakConfig{
				{
					Type:             calculation.BreakTypeMinimum,
					Duration:         30,
					AfterWorkMinutes: &threshold,
					AutoDeduct:       true,
				},
			},
		},
	}

	result := calc.Calculate(input)

	assert.False(t, result.HasError, "Expected no errors, got: %v", result.ErrorCodes)
	assert.Greater(t, result.GrossTime, 0)
	assert.Greater(t, result.NetTime, 0)
	assert.Equal(t, 45, result.BreakTime) // 45 min recorded break
}
```

### Success Criteria

#### Automated Verification:
- [ ] All tests pass: `cd apps/api && go test -v -race ./internal/calculation/...`
- [ ] All model tests pass: `cd apps/api && go test -v -race ./internal/model/...`
- [ ] Full test suite passes: `make test`
- [ ] No linting errors: `make lint`

#### Manual Verification:
- [ ] Package documentation is complete: `go doc github.com/tolga/terp/internal/calculation`
- [ ] Types are correctly defined and usable

**Implementation Note**: After completing this phase and all verification passes, the calculation package implementation is complete.

---

## Testing Strategy

### Unit Tests
Each file has corresponding `*_test.go` with:
- Edge case coverage (nil inputs, empty slices, boundary values)
- Table-driven tests where appropriate
- Clear test names describing scenario

### Test Coverage Areas
1. **timeutil**: All conversion functions, cross-midnight handling, validation
2. **pairing**: Empty input, single pair, multiple pairs, existing PairIDs, unpaired bookings, cross-midnight
3. **rounding**: All rounding types (none, up, down, nearest), various intervals
4. **tolerance**: Late/early arrivals and departures, within/beyond tolerance
5. **breaks**: Manual breaks, auto-deduct, thresholds, multiple break rules
6. **calculator**: Integration tests combining all features

### Running Tests
```bash
# All calculation tests with race detection
cd apps/api && go test -v -race ./internal/calculation/...

# Specific file
cd apps/api && go test -v -race ./internal/calculation/ -run TestPairBookings

# With coverage
cd apps/api && go test -v -race -cover ./internal/calculation/...
```

---

## References

- Research document: `thoughts/shared/research/2026-01-19-TICKET-059-create-calculation-package-structure.md`
- Booking model: `apps/api/internal/model/booking.go`
- DayPlan model: `apps/api/internal/model/dayplan.go`
- DailyValue model: `apps/api/internal/model/dailyvalue.go`
- BookingType model: `apps/api/internal/model/bookingtype.go`
