---
date: 2026-01-22T11:13:14+01:00
researcher: Claude
git_commit: 9192b323908c8d2a506df6571e054ae8b72a8b30
branch: master
repository: impactj90/terp
topic: "TICKET-062: Create Tolerance Logic"
tags: [research, codebase, calculation, tolerance, time-tracking]
status: complete
last_updated: 2026-01-22
last_updated_by: Claude
---

# Research: TICKET-062 - Create Tolerance Logic

**Date**: 2026-01-22T11:13:14+01:00
**Researcher**: Claude
**Git Commit**: 9192b323908c8d2a506df6571e054ae8b72a8b30
**Branch**: master
**Repository**: impactj90/terp

## Research Question

Document the existing codebase state relevant to implementing tolerance application logic for come/go times as specified in TICKET-062.

## Summary

The tolerance logic specified in TICKET-062 **already exists** in the codebase at `apps/api/internal/calculation/tolerance.go`. The existing implementation provides `ApplyComeTolerance`, `ApplyGoTolerance`, `ValidateTimeWindow`, and `ValidateCoreHours` functions with comprehensive test coverage. The implementation differs slightly from the TICKET-062 specification in function signatures and does not include the higher-level wrapper functions (`ApplyTolerancesToPairs`) described in the ticket.

## Detailed Findings

### Existing Tolerance Implementation

**Location**: `apps/api/internal/calculation/tolerance.go`

#### Functions Currently Implemented

**1. ApplyComeTolerance** (lines 5-27)
```go
func ApplyComeTolerance(actualTime int, expectedTime *int, tolerance ToleranceConfig) int
```

- Adjusts arrival time based on tolerance settings
- Returns actual time if expectedTime is nil
- Late arrival: normalizes to expected if within `tolerance.ComePlus`
- Early arrival: normalizes to expected if within `tolerance.ComeMinus`

**2. ApplyGoTolerance** (lines 31-53)
```go
func ApplyGoTolerance(actualTime int, expectedTime *int, tolerance ToleranceConfig) int
```

- Adjusts departure time based on tolerance settings
- Returns actual time if expectedTime is nil
- Early departure: normalizes to expected if within `tolerance.GoMinus`
- Late departure: normalizes to expected if within `tolerance.GoPlus`

**3. ValidateTimeWindow** (lines 57-69)
```go
func ValidateTimeWindow(actualTime int, from, to *int, earlyCode, lateCode string) []string
```

- Checks if time is within allowed window
- Returns error codes if outside bounds

**4. ValidateCoreHours** (lines 73-89)
```go
func ValidateCoreHours(firstCome, lastGo *int, coreStart, coreEnd *int) []string
```

- Validates coverage of required core hours for flextime
- Returns error codes if core hours not covered

### Comparison: Existing vs TICKET-062 Specification

| Aspect | Existing Implementation | TICKET-062 Specification |
|--------|------------------------|--------------------------|
| ApplyTolerance | Not implemented as standalone | Specified as base function |
| ApplyComeTolerance | Uses `*int` for expectedTime, `ToleranceConfig` struct | Uses `*DayPlanInput` wrapper |
| ApplyGoTolerance | Uses `*int` for expectedTime, `ToleranceConfig` struct | Uses `*DayPlanInput` wrapper |
| ApplyTolerancesToPairs | **Not implemented** | Specified to apply to all work pairs |
| ValidateTimeWindow | Exists with generic error codes | Not in TICKET-062 scope |
| ValidateCoreHours | Exists | Not in TICKET-062 scope |

### ToleranceConfig Type

**Location**: `apps/api/internal/calculation/types.go:77-83`

```go
type ToleranceConfig struct {
    ComePlus  int // Grace period for late arrivals (minutes)
    ComeMinus int // Grace period for early arrivals (minutes)
    GoPlus    int // Grace period for late departures (minutes)
    GoMinus   int // Grace period for early departures (minutes)
}
```

### Existing Test Coverage

**Location**: `apps/api/internal/calculation/tolerance_test.go`

The test file contains comprehensive coverage:

| Test Function | Coverage |
|---------------|----------|
| TestApplyComeTolerance_NilExpected | Nil expected time returns actual |
| TestApplyComeTolerance_LateArrival | Within, at boundary, beyond tolerance |
| TestApplyComeTolerance_EarlyArrival | Within, at boundary, beyond tolerance |
| TestApplyGoTolerance_NilExpected | Nil expected time returns actual |
| TestApplyGoTolerance_EarlyDeparture | Within, at boundary, beyond tolerance |
| TestApplyGoTolerance_LateDeparture | Within, at boundary, beyond tolerance |
| TestValidateTimeWindow | Within, at boundaries, outside |
| TestValidateTimeWindow_NilBoundaries | Nil boundaries |
| TestValidateCoreHours | All combinations of presence/absence |
| TestValidateCoreHours_NoCoreHours | Nil core hours |

### Integration with Calculator

**Location**: `apps/api/internal/calculation/calculator.go:102-132`

The `processBookings` function applies tolerance in the calculation flow:

```go
func (c *Calculator) processBookings(input CalculationInput, result *CalculationResult) []BookingInput {
    // ... for each booking ...
    if b.Category == CategoryWork {
        if b.Direction == DirectionIn {
            t = ApplyComeTolerance(t, input.DayPlan.ComeFrom, input.DayPlan.Tolerance)
            t = RoundComeTime(t, input.DayPlan.RoundingCome)
        } else if b.Direction == DirectionOut {
            t = ApplyGoTolerance(t, input.DayPlan.GoTo, input.DayPlan.Tolerance)
            t = RoundGoTime(t, input.DayPlan.RoundingGo)
        }
    }
    // ...
}
```

### DayPlanInput Structure

**Location**: `apps/api/internal/calculation/types.go:85-105`

```go
type DayPlanInput struct {
    ComeFrom  *int
    ComeTo    *int
    GoFrom    *int
    GoTo      *int
    CoreStart *int
    CoreEnd   *int
    RegularHours int
    Tolerance      ToleranceConfig
    RoundingCome   *RoundingConfig
    RoundingGo     *RoundingConfig
    Breaks         []BreakConfig
    MinWorkTime    *int
    MaxNetWorkTime *int
}
```

### DayPlan Model (Database)

**Location**: `apps/api/internal/model/dayplan.go:44-48`

Tolerance values stored in database:

```go
ToleranceComePlus  int `gorm:"type:int;default:0" json:"tolerance_come_plus"`
ToleranceComeMinus int `gorm:"type:int;default:0" json:"tolerance_come_minus"`
ToleranceGoPlus    int `gorm:"type:int;default:0" json:"tolerance_go_plus"`
ToleranceGoMinus   int `gorm:"type:int;default:0" json:"tolerance_go_minus"`
```

### BookingPair Type

**Location**: `apps/api/internal/calculation/types.go:115-121`

```go
type BookingPair struct {
    InBooking  *BookingInput
    OutBooking *BookingInput
    Category   BookingCategory
    Duration   int
}
```

### Gap Analysis: What TICKET-062 Requires vs What Exists

**Already Implemented:**
- Core tolerance application logic (`ApplyComeTolerance`, `ApplyGoTolerance`)
- ToleranceConfig type definition
- Comprehensive unit tests for tolerance functions
- Integration with calculator flow

**Not Yet Implemented (from TICKET-062):**
- `ApplyTolerance` - standalone base function
- `ApplyTolerancesToPairs` - applies tolerance to all work pairs in a slice

### Time Representation Convention

All times in the calculation package are represented as **minutes from midnight (0-1439)**:

- 0 = midnight (00:00)
- 480 = 8:00 AM
- 1020 = 17:00
- 1439 = 23:59

Cross-midnight handling uses times > 1439 (e.g., 1560 = 02:00 next day).

## Code References

- `apps/api/internal/calculation/tolerance.go:5-27` - ApplyComeTolerance function
- `apps/api/internal/calculation/tolerance.go:31-53` - ApplyGoTolerance function
- `apps/api/internal/calculation/tolerance.go:57-69` - ValidateTimeWindow function
- `apps/api/internal/calculation/tolerance.go:73-89` - ValidateCoreHours function
- `apps/api/internal/calculation/types.go:77-83` - ToleranceConfig struct
- `apps/api/internal/calculation/types.go:85-105` - DayPlanInput struct
- `apps/api/internal/calculation/types.go:115-121` - BookingPair struct
- `apps/api/internal/calculation/calculator.go:102-132` - processBookings integration
- `apps/api/internal/calculation/tolerance_test.go` - Test coverage
- `apps/api/internal/model/dayplan.go:44-48` - Database tolerance fields

## Architecture Documentation

### Tolerance Application Flow

```
CalculationInput
    └── DayPlan.Tolerance (ToleranceConfig)
    └── Bookings ([]BookingInput)
            │
            ▼
    processBookings()
            │
            ├── Work IN booking  → ApplyComeTolerance() → RoundComeTime()
            │
            └── Work OUT booking → ApplyGoTolerance() → RoundGoTime()
            │
            ▼
    CalculationResult.CalculatedTimes (map[uuid.UUID]int)
```

### Processing Order

1. Tolerance is applied first (normalizes times within grace period)
2. Rounding is applied second (rounds to interval boundaries)
3. Results stored in CalculatedTimes map for each booking

## Related Research

- `thoughts/shared/research/2026-01-22-TICKET-060-create-calculation-types.md` - Type definitions
- `thoughts/shared/research/2026-01-22-TICKET-061-create-booking-pairing-logic.md` - Booking pairing
- `thoughts/shared/research/2026-01-19-TICKET-059-create-calculation-package-structure.md` - Package structure

## Open Questions

1. Should `ApplyTolerancesToPairs` be implemented as specified in TICKET-062, or is the current per-booking approach in `processBookings` sufficient?

2. Should `ApplyTolerance` be extracted as a standalone function, or is the current duplication in `ApplyComeTolerance`/`ApplyGoTolerance` acceptable?

3. The existing implementation passes `expectedTime` as a separate parameter, while TICKET-062 expects it to be extracted from `DayPlanInput` within the functions. Which approach is preferred?
