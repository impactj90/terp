---
date: 2026-01-19T16:25:39+01:00
researcher: Claude
git_commit: 9192b323908c8d2a506df6571e054ae8b72a8b30
branch: master
repository: terp
topic: "TICKET-059: Create Calculation Package Structure"
tags: [research, codebase, calculation, time-tracking, booking, dayplan, dailyvalue]
status: complete
last_updated: 2026-01-19
last_updated_by: Claude
---

# Research: TICKET-059 - Create Calculation Package Structure

**Date**: 2026-01-19T16:25:39+01:00
**Researcher**: Claude
**Git Commit**: 9192b323908c8d2a506df6571e054ae8b72a8b30
**Branch**: master
**Repository**: terp

## Research Question

What existing patterns, models, and structures exist in the codebase that are relevant to creating a new `calculation` package for time tracking calculations?

## Summary

The codebase follows a clean 3-layer architecture (handler → service → repository) with consistent naming conventions. Package documentation exists in some packages but is inconsistent - no dedicated `doc.go` files exist. The relevant domain models for the calculation package are:

- **Booking**: Input data with pairing system, time fields, and direction-based types
- **DayPlan**: Configuration with tolerance, rounding, breaks, and target hours
- **DailyValue**: Output storage for calculated results (gross/net time, overtime, errors)

All time values use **minutes from midnight (0-1439)** or **duration in minutes** as the standard representation.

## Detailed Findings

### Package Structure Pattern

**Location**: `apps/api/internal/`

The codebase follows a strict 3-layer architecture:

```
apps/api/internal/
├── auth/          # JWT management, dev users (4 files)
├── config/        # Environment configuration (1 file)
├── handler/       # HTTP layer - request/response (39 files)
├── middleware/    # HTTP middleware (3 files)
├── model/         # GORM domain models (18 files)
├── repository/    # Data access layer (37 files)
├── service/       # Business logic layer (32 files)
└── testutil/      # Test utilities (1 file)
```

**Naming Convention**: For each domain entity, files are organized as:
- `model/{entity}.go` - GORM struct
- `repository/{entity}.go` + `repository/{entity}_test.go`
- `service/{entity}.go` + `service/{entity}_test.go`
- `handler/{entity}.go` + `handler/{entity}_test.go`

The new `calculation` package would be a **new top-level package** under `internal/`, distinct from the existing layers since it contains pure calculation logic (no HTTP, no database).

### Package Documentation Pattern

**Finding**: No dedicated `doc.go` files exist in the codebase.

Existing documentation uses single-line comments above the `package` declaration in regular `.go` files:

| Package | Location | Documentation |
|---------|----------|---------------|
| `main` | `cmd/server/main.go:1` | `// Package main is the entry point for the Terp API server.` |
| `handler` | `handler/auth.go:1` | `// Package handler handles all HTTP requests.` |
| `middleware` | `middleware/auth.go:1` | `// Package middleware provides HTTP middleware for JWT validation.` |
| `config` | `config/config.go:1` | `// Package config provides configuration loading and validation for the application.` |

**Undocumented packages**: `model`, `service`, `repository`, `auth`, `testutil`

**Pattern**: `// Package <name> <verb phrase describing purpose>.`

The ticket specifies creating `doc.go` with detailed multi-line documentation - this would be a **new pattern** introducing more comprehensive documentation.

### Booking Model (Calculation Input)

**Location**: `apps/api/internal/model/booking.go`

#### Core Fields for Calculations

```go
type Booking struct {
    EmployeeID     uuid.UUID     // Who made the booking
    BookingDate    time.Time     // Date of booking
    BookingTypeID  uuid.UUID     // Links to COME/GO/BREAK_START/BREAK_END

    // Time values (minutes from midnight: 0-1439)
    OriginalTime   int           // Initial recorded time
    EditedTime     int           // Manually corrected time
    CalculatedTime *int          // Time after tolerance/rounding rules

    // Pairing
    PairID *uuid.UUID            // Links to paired booking (bidirectional)
}
```

#### Pairing System

- **Self-referential**: `PairID` points to another Booking
- **Bidirectional**: Both bookings in a pair store each other's ID
- **Nullable**: Unpaired bookings have `PairID = nil`

#### BookingType Direction (`model/bookingtype.go:9-14`)

```go
type BookingDirection string
const (
    BookingDirectionIn  BookingDirection = "in"   // COME, BREAK_END
    BookingDirectionOut BookingDirection = "out"  // GO, BREAK_START
)
```

System booking types:
- `COME` (in) pairs with `GO` (out) - work shift
- `BREAK_START` (out) pairs with `BREAK_END` (in) - break period

#### Time Helper Methods (`booking.go:58-118`)

| Method | Purpose |
|--------|---------|
| `EffectiveTime()` | Returns `CalculatedTime` if set, else `EditedTime` |
| `TimeString()` | Converts `EditedTime` to "HH:MM" format |
| `MinutesToTime(int)` | Converts minutes to `time.Time` on booking date |
| `TimeToMinutes(time.Time)` | Converts `time.Time` to minutes from midnight |
| `MinutesToString(int)` | Formats any minutes as "HH:MM" |
| `ParseTimeString(string)` | Parses "HH:MM" to minutes |

### DayPlan Model (Configuration Input)

**Location**: `apps/api/internal/model/dayplan.go`

#### Time Windows (minutes from midnight)

```go
type DayPlan struct {
    // Allowed arrival window
    ComeFrom *int  // Earliest allowed arrival
    ComeTo   *int  // Latest allowed arrival

    // Allowed departure window
    GoFrom *int    // Earliest allowed departure
    GoTo   *int    // Latest allowed departure

    // Flextime core hours
    CoreStart *int
    CoreEnd   *int

    // Target
    RegularHours int  // Target work duration in minutes (default: 480 = 8h)
}
```

#### Tolerance Settings (`dayplan.go:44-48`)

```go
ToleranceComePlus  int  // Grace period for late arrivals (minutes)
ToleranceComeMinus int  // Grace period for early arrivals (minutes)
ToleranceGoPlus    int  // Grace period for late departures (minutes)
ToleranceGoMinus   int  // Grace period for early departures (minutes)
```

#### Rounding Configuration (`dayplan.go:50-54`)

```go
type RoundingType string
const (
    RoundingNone    RoundingType = "none"
    RoundingUp      RoundingType = "up"
    RoundingDown    RoundingType = "down"
    RoundingNearest RoundingType = "nearest"
)

// DayPlan fields
RoundingComeType     *RoundingType  // Arrival rounding type
RoundingComeInterval *int           // Arrival rounding interval (minutes)
RoundingGoType       *RoundingType  // Departure rounding type
RoundingGoInterval   *int           // Departure rounding interval (minutes)
```

#### Break Configuration (`dayplan.go:81-94`)

```go
type BreakType string
const (
    BreakTypeFixed    BreakType = "fixed"    // Break at specific time window
    BreakTypeVariable BreakType = "variable" // Flexible break timing
    BreakTypeMinimum  BreakType = "minimum"  // Mandatory after threshold
)

type DayPlanBreak struct {
    BreakType        BreakType
    StartTime        *int   // Break start (minutes from midnight)
    EndTime          *int   // Break end (minutes from midnight)
    Duration         int    // Break duration (minutes)
    AfterWorkMinutes *int   // Trigger after X minutes of work
    AutoDeduct       bool   // Automatically deduct from work time
    IsPaid           bool   // Break counts toward regular hours
}
```

#### Work Time Caps (`dayplan.go:56-58`)

```go
MinWorkTime   *int  // Minimum work duration (minutes)
MaxNetWorkTime *int  // Maximum net work time (minutes)
```

### DailyValue Model (Calculation Output)

**Location**: `apps/api/internal/model/dailyvalue.go`

#### Core Output Fields

```go
type DailyValue struct {
    EmployeeID uuid.UUID
    ValueDate  time.Time  // DATE type, unique with EmployeeID

    // Time calculations (all in minutes)
    GrossTime  int   // Total work time before breaks
    NetTime    int   // Work time after breaks (GrossTime - BreakTime)
    TargetTime int   // Expected work time from day plan
    Overtime   int   // max(0, NetTime - TargetTime)
    Undertime  int   // max(0, TargetTime - NetTime)
    BreakTime  int   // Total break duration

    // Booking summary
    FirstCome    *int  // First arrival (minutes from midnight)
    LastGo       *int  // Last departure (minutes from midnight)
    BookingCount int   // Number of bookings

    // Error tracking
    HasError   bool            // Flag for calculation errors
    ErrorCodes pq.StringArray  // e.g., ["MISSING_COME", "MISSING_GO"]
    Warnings   pq.StringArray  // Non-critical warnings

    // Calculation metadata
    CalculatedAt       *time.Time
    CalculationVersion int  // Algorithm version (default: 1)
}
```

#### Helper Methods (`dailyvalue.go:47-84`)

| Method | Purpose |
|--------|---------|
| `Balance()` | Returns `Overtime - Undertime` |
| `FormatGrossTime()` | GrossTime as "HH:MM" |
| `FormatNetTime()` | NetTime as "HH:MM" |
| `FormatTargetTime()` | TargetTime as "HH:MM" |
| `FormatBalance()` | Balance as "HH:MM" with sign prefix |
| `HasBookings()` | Returns `BookingCount > 0` |

#### Repository Upsert Pattern (`repository/dailyvalue.go:111-123`)

The repository uses `ON CONFLICT (employee_id, value_date)` for idempotent updates, suggesting calculations can be re-run and results updated in place.

## Code References

### Models
- `apps/api/internal/model/booking.go` - Booking model with pairing and time fields
- `apps/api/internal/model/bookingtype.go:9-14` - BookingDirection enum
- `apps/api/internal/model/dayplan.go` - DayPlan with tolerance, rounding, breaks
- `apps/api/internal/model/dailyvalue.go` - Calculation output model

### Time Utilities
- `apps/api/internal/model/booking.go:65-71` - `EffectiveTime()` method
- `apps/api/internal/model/booking.go:91-101` - `TimeToMinutes()`, `MinutesToString()`
- `apps/api/internal/model/booking.go:103-118` - `ParseTimeString()`

### Database Migrations
- `db/migrations/000021_create_booking_types.up.sql:18-22` - System booking types
- `db/migrations/000022_create_bookings.up.sql` - Bookings table with pairing
- `db/migrations/000024_create_daily_values.up.sql` - Daily values output table

## Architecture Documentation

### Time Representation Convention

All time values in the codebase use one of two representations:
1. **Minutes from midnight** (0-1439): For clock times (BookingTime, FirstCome, LastGo)
2. **Duration in minutes**: For time spans (GrossTime, BreakTime, RegularHours)

### Data Flow for Calculations

```
Input:
  Booking[] (with BookingType direction)
  + DayPlan (tolerance, rounding, breaks, target)
  + EmployeeDayPlan (employee's assigned plan for date)

Processing (calculation package responsibilities):
  1. Pair bookings (A1↔A2, PA↔PE) by direction
  2. Apply tolerance rules
  3. Apply rounding rules
  4. Calculate gross time (sum of work pairs)
  5. Deduct breaks (fixed, variable, minimum)
  6. Calculate net time
  7. Apply caps (max_net_work_time)
  8. Calculate overtime/undertime vs target
  9. Generate errors/warnings

Output:
  DailyValue (stored via repository upsert)
```

### Existing Patterns to Follow

1. **Pure package**: No database, no HTTP - only input structs → output structs
2. **Minutes-based math**: All calculations use integer minutes
3. **Nullable pointers**: Use `*int` for optional time values
4. **Error arrays**: Use `pq.StringArray` for multiple error codes
5. **Upsert pattern**: Calculations can be idempotently re-run

## Related Research

- No prior research documents found for calculation-related topics

## Open Questions

1. Should the calculation package reuse `MinutesToString()` from `model/booking.go` or define its own utility functions?
2. How should the calculation package handle cross-midnight shifts (Go time < Come time)?
3. What error codes should be standardized for the calculation package?
