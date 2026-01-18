# TICKET-060: Create Calculation Types

**Type**: Model
**Effort**: S
**Sprint**: 12 - Calculation Engine - Types
**Dependencies**: TICKET-059

## Description

Create input/output type definitions for the calculation engine.

## Files to Create

- `apps/api/internal/calculation/types.go`

## Implementation

```go
package calculation

import (
    "time"

    "github.com/google/uuid"
)

// DailyCalcInput contains all data needed to calculate a day
type DailyCalcInput struct {
    Date      time.Time
    DayPlan   *DayPlanInput   // nil if off day
    Bookings  []BookingInput
    Absence   *AbsenceInput   // nil if no absence
    IsHoliday bool
}

// DayPlanInput contains the day plan configuration
type DayPlanInput struct {
    ID           uuid.UUID
    PlanType     string // "fixed", "flextime"
    RegularHours int    // Target hours in minutes

    // Time windows (minutes from midnight)
    ComeFrom  *int
    ComeTo    *int
    GoFrom    *int
    GoTo      *int
    CoreStart *int
    CoreEnd   *int

    // Tolerance
    Tolerances ToleranceConfig

    // Rounding
    Rounding RoundingConfig

    // Breaks
    Breaks []BreakConfig

    // Caps
    MinWorkTime    *int
    MaxNetWorkTime *int
}

// ToleranceConfig defines tolerance settings
type ToleranceConfig struct {
    ComePlus  int // Late arrival tolerance
    ComeMinus int // Early arrival tolerance
    GoPlus    int // Late departure tolerance
    GoMinus   int // Early departure tolerance
}

// RoundingConfig defines rounding settings
type RoundingConfig struct {
    ComeType     string // "none", "up", "down", "nearest"
    ComeInterval int    // Rounding interval in minutes
    GoType       string
    GoInterval   int
}

// BreakConfig defines a break rule
type BreakConfig struct {
    BreakType        string // "fixed", "variable", "minimum"
    StartTime        *int   // For fixed breaks
    EndTime          *int
    Duration         int
    AfterWorkMinutes *int  // For minimum breaks
    AutoDeduct       bool
    IsPaid           bool
}

// BookingInput represents a single booking
type BookingInput struct {
    ID           uuid.UUID
    Category     string // "come", "go", "break_start", "break_end"
    OriginalTime int    // Minutes from midnight
    EditedTime   int
}

// AbsenceInput represents an absence on the day
type AbsenceInput struct {
    TypeCode     string // "U", "K", "S", etc.
    CreditsHours bool   // Whether to credit target hours
    Duration     float64 // 1.0 = full day, 0.5 = half day
}

// DailyCalcOutput contains calculated results
type DailyCalcOutput struct {
    // Core values (all in minutes)
    GrossTime  int
    NetTime    int
    TargetTime int
    Overtime   int
    Undertime  int
    BreakTime  int

    // Booking summary
    FirstCome *int
    LastGo    *int

    // Paired bookings with calculated times
    PairedBookings []BookingPair

    // Status
    HasError   bool
    ErrorCodes []string
    Warnings   []string
}

// BookingPair represents a paired set of bookings
type BookingPair struct {
    StartBookingID uuid.UUID
    EndBookingID   uuid.UUID
    PairType       string // "work", "break"
    StartTime      int    // After rules applied
    EndTime        int
    Duration       int
}

// AbsenceOutput represents credited time from absence
type AbsenceOutput struct {
    CreditedMinutes int
    TypeCode        string
}
```

## Unit Tests

**Test file**: `apps/api/internal/calculation/types_test.go`

No unit tests required for this ticket as it only defines types. Type validation will occur through compilation and usage in other calculation functions.

## Acceptance Criteria

- [ ] Compiles without errors
- [ ] `make lint` passes
- [ ] All input types have clear documentation
- [ ] Output contains all needed calculation results
- [ ] BookingPair tracks both original IDs and calculated times
