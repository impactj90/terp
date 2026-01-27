---
date: 2026-01-22T10:16:07+01:00
researcher: Claude
git_commit: 9192b323908c8d2a506df6571e054ae8b72a8b30
branch: master
repository: terp
topic: "TICKET-060: Create Calculation Types - Codebase Research"
tags: [research, codebase, calculation, types, time-tracking]
status: complete
last_updated: 2026-01-22
last_updated_by: Claude
---

# Research: TICKET-060 - Create Calculation Types

**Date**: 2026-01-22T10:16:07+01:00
**Researcher**: Claude
**Git Commit**: 9192b323908c8d2a506df6571e054ae8b72a8b30
**Branch**: master
**Repository**: terp

## Research Question

What types already exist in the calculation package and related models that relate to TICKET-060's specified type definitions?

## Summary

TICKET-060 specifies creating input/output type definitions for the calculation engine at `apps/api/internal/calculation/types.go`. Research reveals that **the calculation package already exists** with a comprehensive type system defined in `apps/api/internal/calculation/types.go`. The existing types differ in structure from TICKET-060's specification but serve the same purpose. This document maps the ticket's proposed types to the existing implementation.

## Detailed Findings

### 1. Existing Calculation Package Structure

**Location**: `/home/tolga/projects/terp/apps/api/internal/calculation/`

The calculation package already contains:
- `types.go` - Type definitions (lines 1-151)
- `errors.go` - Error and warning codes (lines 1-51)
- `calculator.go` - Main calculation orchestration
- `pairing.go` - Booking pairing logic
- `breaks.go` - Break calculation logic
- `rounding.go` - Time rounding functions
- `tolerance.go` - Tolerance and validation functions

### 2. Type Comparison: TICKET-060 vs Existing Implementation

#### 2.1 Booking Input Types

**TICKET-060 Specifies** (`BookingInput`):
```go
type BookingInput struct {
    ID           uuid.UUID
    Category     string // "come", "go", "break_start", "break_end"
    OriginalTime int
    EditedTime   int
}
```

**Existing Implementation** (`types.go:30-36`):
```go
type BookingInput struct {
    ID        uuid.UUID
    Time      int              // Minutes from midnight
    Direction BookingDirection // "in" | "out"
    Category  BookingCategory  // "work" | "break"
    PairID    *uuid.UUID       // Optional existing pair
}
```

**Differences**:
- Existing uses `Direction` + `Category` enums instead of combined category string
- Existing has single `Time` field instead of separate `OriginalTime`/`EditedTime`
- Existing includes `PairID` for pre-paired bookings

#### 2.2 Day Plan Input Types

**TICKET-060 Specifies** (`DayPlanInput`):
```go
type DayPlanInput struct {
    ID           uuid.UUID
    PlanType     string
    RegularHours int
    ComeFrom     *int
    ComeTo       *int
    GoFrom       *int
    GoTo         *int
    CoreStart    *int
    CoreEnd      *int
    Tolerances   ToleranceConfig
    Rounding     RoundingConfig
    Breaks       []BreakConfig
    MinWorkTime    *int
    MaxNetWorkTime *int
}
```

**Existing Implementation** (`types.go:86-105`):
```go
type DayPlanInput struct {
    ComeFrom       *int
    ComeTo         *int
    GoFrom         *int
    GoTo           *int
    CoreStart      *int
    CoreEnd        *int
    RegularHours   int
    Tolerance      ToleranceConfig
    RoundingCome   *RoundingConfig
    RoundingGo     *RoundingConfig
    Breaks         []BreakConfig
    MinWorkTime    *int
    MaxNetWorkTime *int
}
```

**Differences**:
- Existing lacks `ID` and `PlanType` fields
- Existing has separate `RoundingCome`/`RoundingGo` instead of single `Rounding`
- Existing uses `Tolerance` (singular) instead of `Tolerances`

#### 2.3 Tolerance Config

**TICKET-060 Specifies**:
```go
type ToleranceConfig struct {
    ComePlus  int
    ComeMinus int
    GoPlus    int
    GoMinus   int
}
```

**Existing Implementation** (`types.go:78-83`):
```go
type ToleranceConfig struct {
    ComePlus  int
    ComeMinus int
    GoPlus    int
    GoMinus   int
}
```

**Status**: Identical

#### 2.4 Rounding Config

**TICKET-060 Specifies**:
```go
type RoundingConfig struct {
    ComeType     string
    ComeInterval int
    GoType       string
    GoInterval   int
}
```

**Existing Implementation** (`types.go:72-75`):
```go
type RoundingConfig struct {
    Type     RoundingType
    Interval int
}
```

**Differences**:
- Ticket has combined come/go rounding in one struct
- Existing uses separate `RoundingConfig` instances for come and go
- Existing uses `RoundingType` enum instead of string

#### 2.5 Break Config

**TICKET-060 Specifies**:
```go
type BreakConfig struct {
    BreakType        string
    StartTime        *int
    EndTime          *int
    Duration         int
    AfterWorkMinutes *int
    AutoDeduct       bool
    IsPaid           bool
}
```

**Existing Implementation** (`types.go:51-59`):
```go
type BreakConfig struct {
    Type             BreakType
    StartTime        *int
    EndTime          *int
    Duration         int
    AfterWorkMinutes *int
    AutoDeduct       bool
    IsPaid           bool
}
```

**Differences**:
- Existing uses `Type` field name with `BreakType` enum instead of `BreakType` string field

#### 2.6 Daily Calculation Input

**TICKET-060 Specifies** (`DailyCalcInput`):
```go
type DailyCalcInput struct {
    Date      time.Time
    DayPlan   *DayPlanInput
    Bookings  []BookingInput
    Absence   *AbsenceInput
    IsHoliday bool
}
```

**Existing Implementation** (`types.go:108-113`):
```go
type CalculationInput struct {
    EmployeeID uuid.UUID
    Date       time.Time
    Bookings   []BookingInput
    DayPlan    *DayPlanInput
}
```

**Differences**:
- Existing uses name `CalculationInput` instead of `DailyCalcInput`
- Existing includes `EmployeeID` field
- Existing lacks `Absence` and `IsHoliday` fields

#### 2.7 Absence Types

**TICKET-060 Specifies**:
```go
type AbsenceInput struct {
    TypeCode     string
    CreditsHours bool
    Duration     float64
}

type AbsenceOutput struct {
    CreditedMinutes int
    TypeCode        string
}
```

**Existing Implementation**: Not present in calculation package

#### 2.8 Calculation Output

**TICKET-060 Specifies** (`DailyCalcOutput`):
```go
type DailyCalcOutput struct {
    GrossTime  int
    NetTime    int
    TargetTime int
    Overtime   int
    Undertime  int
    BreakTime  int
    FirstCome *int
    LastGo    *int
    PairedBookings []BookingPair
    HasError   bool
    ErrorCodes []string
    Warnings   []string
}
```

**Existing Implementation** (`types.go:124-150`):
```go
type CalculationResult struct {
    GrossTime    int
    NetTime      int
    TargetTime   int
    Overtime     int
    Undertime    int
    BreakTime    int
    FirstCome    *int
    LastGo       *int
    BookingCount int
    CalculatedTimes map[uuid.UUID]int
    Pairs           []BookingPair
    UnpairedInIDs   []uuid.UUID
    UnpairedOutIDs  []uuid.UUID
    HasError        bool
    ErrorCodes      []string
    Warnings        []string
}
```

**Differences**:
- Existing uses name `CalculationResult` instead of `DailyCalcOutput`
- Existing includes `BookingCount`, `CalculatedTimes`, `UnpairedInIDs`, `UnpairedOutIDs`
- Existing uses `Pairs` instead of `PairedBookings`

#### 2.9 Booking Pair

**TICKET-060 Specifies**:
```go
type BookingPair struct {
    StartBookingID uuid.UUID
    EndBookingID   uuid.UUID
    PairType       string
    StartTime      int
    EndTime        int
    Duration       int
}
```

**Existing Implementation** (`types.go:116-121`):
```go
type BookingPair struct {
    InBooking  BookingInput
    OutBooking BookingInput
    Category   BookingCategory
    Duration   int
}
```

**Differences**:
- Existing embeds full `BookingInput` objects instead of just IDs
- Existing uses `InBooking`/`OutBooking` instead of start/end naming
- Existing uses `Category` enum instead of `PairType` string
- Existing lacks separate `StartTime`/`EndTime` fields (available via embedded bookings)

### 3. Existing Enum Definitions

**BookingDirection** (`types.go:10-13`):
```go
type BookingDirection string
const (
    DirectionIn  BookingDirection = "in"
    DirectionOut BookingDirection = "out"
)
```

**BookingCategory** (`types.go:20-23`):
```go
type BookingCategory string
const (
    CategoryWork  BookingCategory = "work"
    CategoryBreak BookingCategory = "break"
)
```

**BreakType** (`types.go:39-43`):
```go
type BreakType string
const (
    BreakTypeFixed    BreakType = "fixed"
    BreakTypeVariable BreakType = "variable"
    BreakTypeMinimum  BreakType = "minimum"
)
```

**RoundingType** (`types.go:62-67`):
```go
type RoundingType string
const (
    RoundingNone    RoundingType = "none"
    RoundingUp      RoundingType = "up"
    RoundingDown    RoundingType = "down"
    RoundingNearest RoundingType = "nearest"
)
```

### 4. Error and Warning Codes

**File**: `apps/api/internal/calculation/errors.go`

**Error Codes** (lines 4-27):
- `ErrCodeMissingCome`, `ErrCodeMissingGo`, `ErrCodeUnpairedBooking`
- `ErrCodeEarlyCome`, `ErrCodeLateCome`, `ErrCodeEarlyGo`, `ErrCodeLateGo`
- `ErrCodeMissedCoreStart`, `ErrCodeMissedCoreEnd`
- `ErrCodeBelowMinWorkTime`, `ErrCodeNoBookings`
- `ErrCodeInvalidTime`, `ErrCodeDuplicateInTime`

**Warning Codes** (lines 30-37):
- `WarnCodeCrossMidnight`, `WarnCodeMaxTimeReached`
- `WarnCodeManualBreak`, `WarnCodeNoBreakRecorded`
- `WarnCodeShortBreak`, `WarnCodeAutoBreakApplied`

### 5. Time Handling Conventions

All time-of-day values use **minutes from midnight** (0-1439):
- Database columns: `INT` type
- Go types: `int` for required, `*int` for nullable
- Time utility: `apps/api/internal/timeutil/timeutil.go`

Key functions:
- `TimeToMinutes(t time.Time) int` - Convert to minutes
- `MinutesToString(minutes int) string` - Format as "HH:MM"
- `NormalizeCrossMidnight(start, end int) int` - Handle overnight shifts

### 6. Related Model Types

#### Booking Model (`apps/api/internal/model/booking.go:20-49`)
```go
type Booking struct {
    ID            uuid.UUID
    TenantID      uuid.UUID
    EmployeeID    uuid.UUID
    BookingDate   time.Time
    BookingTypeID uuid.UUID
    OriginalTime   int
    EditedTime     int
    CalculatedTime *int
    PairID        *uuid.UUID
    Source        BookingSource
    // ... audit fields
}
```

#### DayPlan Model (`apps/api/internal/model/dayplan.go`)
Contains all time windows, tolerances, rounding settings, and break configurations that map to `DayPlanInput`.

#### DailyValue Model (`apps/api/internal/model/dailyvalue.go:11-45`)
```go
type DailyValue struct {
    ID         uuid.UUID
    TenantID   uuid.UUID
    EmployeeID uuid.UUID
    ValueDate  time.Time
    GrossTime  int
    NetTime    int
    TargetTime int
    Overtime   int
    Undertime  int
    BreakTime  int
    HasError   bool
    ErrorCodes pq.StringArray
    Warnings   pq.StringArray
    FirstCome  *int
    LastGo     *int
    BookingCount int
    // ... timestamp fields
}
```

## Code References

- `apps/api/internal/calculation/types.go:1-151` - All existing calculation types
- `apps/api/internal/calculation/errors.go:1-51` - Error and warning codes
- `apps/api/internal/calculation/calculator.go:1-200` - Main calculation orchestration
- `apps/api/internal/timeutil/timeutil.go:1-87` - Time conversion utilities
- `apps/api/internal/model/booking.go:20-49` - Booking model
- `apps/api/internal/model/dayplan.go:26-66` - DayPlan model
- `apps/api/internal/model/dailyvalue.go:11-45` - DailyValue model

## Architecture Documentation

### Package Design Pattern
The calculation package follows a pure function design:
- No database or HTTP dependencies
- All functions accept input structs and return output structs
- Error codes accumulated rather than causing immediate failures

### Data Flow
```
BookingInput[] + DayPlanInput
    ↓
Calculator.Calculate()
    ↓
CalculationResult (with CalculatedTimes, Pairs, errors/warnings)
```

### Time Representation Convention
- **Time-of-day**: Minutes from midnight (0-1439) as `int` or `*int`
- **Duration**: Minutes as `int`
- **Date**: `time.Time` with `gorm:"type:date"`
- **Timestamp**: `time.Time` with `gorm:"type:timestamptz"`

## Related Research

- `/home/tolga/projects/terp/thoughts/shared/research/2026-01-19-TICKET-059-create-calculation-package-structure.md` - TICKET-059 research
- `/home/tolga/projects/terp/thoughts/shared/plans/2026-01-19-TICKET-059-create-calculation-package-structure.md` - TICKET-059 implementation plan

## Open Questions

1. **Absence Handling**: TICKET-060 specifies `AbsenceInput` and `AbsenceOutput` types that do not exist in the current calculation package. Should these be added?

2. **Holiday Flag**: TICKET-060 includes `IsHoliday bool` in `DailyCalcInput` which is not present in the existing `CalculationInput`. Should this be added?

3. **Type Alignment**: The ticket specifies different type names and structures than currently implemented. Should the implementation:
   - Update existing types to match the ticket specification?
   - Keep existing types as-is since the package is already functional?
   - Create a mapping layer between the two structures?

4. **BookingPair Structure**: The ticket specifies storing just IDs and times, while the existing implementation embeds full `BookingInput` objects. Which approach is preferred?
