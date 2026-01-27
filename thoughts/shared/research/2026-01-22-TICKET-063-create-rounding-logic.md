---
date: 2026-01-22T11:18:55+01:00
researcher: Claude
git_commit: 9192b323908c8d2a506df6571e054ae8b72a8b30
branch: master
repository: terp
topic: "TICKET-063: Create Rounding Logic"
tags: [research, codebase, calculation, rounding, time-tracking]
status: complete
last_updated: 2026-01-22
last_updated_by: Claude
---

# Research: TICKET-063 - Create Rounding Logic

**Date**: 2026-01-22T11:18:55+01:00
**Researcher**: Claude
**Git Commit**: 9192b323908c8d2a506df6571e054ae8b72a8b30
**Branch**: master
**Repository**: terp

## Research Question

Research the codebase to understand the existing implementation state for TICKET-063 (Create Rounding Logic), including the calculation package structure, existing types, rounding functions, and test patterns.

## Summary

The rounding logic specified in TICKET-063 is **already fully implemented** in the calculation package. The implementation differs from the ticket specification in API design (using typed enums and separate config pointers vs. string-based types and embedded struct), but provides equivalent functionality. The existing implementation follows established codebase patterns and integrates properly with the calculator orchestration.

## Detailed Findings

### 1. Existing Rounding Implementation

The rounding logic exists at `/home/tolga/projects/terp/apps/api/internal/calculation/rounding.go` (51 lines).

**Core Functions:**

```go
// RoundTime applies rounding to a time value based on configuration.
// Returns the original time if config is nil or has RoundingNone type.
func RoundTime(minutes int, config *RoundingConfig) int

// Internal helpers (unexported)
func roundUp(minutes, interval int) int
func roundDown(minutes, interval int) int
func roundNearest(minutes, interval int) int

// Convenience wrappers
func RoundComeTime(minutes int, config *RoundingConfig) int
func RoundGoTime(minutes int, config *RoundingConfig) int
```

**Key Implementation Details:**

- `RoundTime` (`rounding.go:5-20`): Entry point that handles nil config, RoundingNone, and zero/negative intervals by returning original value unchanged
- `roundUp` (`rounding.go:22-28`): Uses modulo to find remainder, adds difference to next interval; already-rounded values unchanged
- `roundDown` (`rounding.go:30-32`): Simple modulo subtraction
- `roundNearest` (`rounding.go:34-40`): Uses `interval/2` threshold to decide rounding direction

### 2. Type Definitions

**RoundingType Enum** (`types.go:61-69`):

```go
type RoundingType string

const (
    RoundingNone    RoundingType = "none"
    RoundingUp      RoundingType = "up"
    RoundingDown    RoundingType = "down"
    RoundingNearest RoundingType = "nearest"
)
```

**RoundingConfig Struct** (`types.go:71-75`):

```go
type RoundingConfig struct {
    Type     RoundingType
    Interval int // Rounding interval in minutes (e.g., 5, 15)
}
```

**DayPlanInput Integration** (`types.go:85-105`):

```go
type DayPlanInput struct {
    // ... time windows, target hours ...
    RoundingCome   *RoundingConfig  // Separate config for arrivals
    RoundingGo     *RoundingConfig  // Separate config for departures
    // ... tolerance, breaks, constraints ...
}
```

### 3. Integration with Calculator

The calculator applies rounding via `processBookings` in `/home/tolga/projects/terp/apps/api/internal/calculation/calculator.go:102-132`.

**Processing Flow:**

1. `Calculator.Calculate()` calls `processBookings()` at line 33
2. `processBookings()` iterates work category bookings (lines 109-130)
3. For arrivals (`DirectionIn`): applies tolerance first (`line 116`), then `RoundComeTime()` (`line 118`)
4. For departures (`DirectionOut`): applies tolerance first (`line 121`), then `RoundGoTime()` (`line 123`)
5. Calculated times stored in `result.CalculatedTimes` map keyed by booking ID

### 4. Existing Test Coverage

Tests exist at `/home/tolga/projects/terp/apps/api/internal/calculation/rounding_test.go` (117 lines).

**Test Functions:**

| Function | Coverage |
|----------|----------|
| `TestRoundTime_NilConfig` | Nil config returns original |
| `TestRoundTime_RoundingNone` | RoundingNone type returns original |
| `TestRoundTime_ZeroInterval` | Zero interval returns original |
| `TestRoundTime_RoundUp` | Table-driven: 5 cases (already rounded, needs rounding, one before, halfway, at boundary) |
| `TestRoundTime_RoundDown` | Table-driven: 4 cases (already rounded, needs rounding, one before, halfway) |
| `TestRoundTime_RoundNearest` | Table-driven: 5 cases (already rounded, round down, boundary, round up, near boundary) |
| `TestRoundTime_DifferentIntervals` | Table-driven: 5/10/30 minute intervals |

**Test Pattern Used:**

```go
func TestRoundTime_RoundUp(t *testing.T) {
    config := &calculation.RoundingConfig{Type: calculation.RoundingUp, Interval: 15}

    tests := []struct {
        name     string
        input    int
        expected int
    }{
        {"already rounded", 480, 480},
        {"needs rounding", 481, 495},
        // ...
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := calculation.RoundTime(tt.input, config)
            assert.Equal(t, tt.expected, result)
        })
    }
}
```

### 5. Comparison: Ticket Specification vs Implementation

| Aspect | Ticket Specification | Current Implementation |
|--------|---------------------|----------------------|
| **Type system** | String-based (`"up"`, `"down"`, `"nearest"`, `"none"`) | Typed enum `RoundingType` |
| **Main function** | `ApplyRounding(time int, roundingType string, interval int)` | `RoundTime(minutes int, config *RoundingConfig)` |
| **Come/Go wrappers** | Take `*DayPlanInput`, access `dayPlan.Rounding.ComeType` | Take `*RoundingConfig` directly |
| **Config structure** | Single embedded `RoundingConfig{ComeType, GoType, ComeInterval, GoInterval}` | Separate `RoundingCome *RoundingConfig` and `RoundingGo *RoundingConfig` pointers |
| **Apply to pairs** | `ApplyRoundingToPairs(pairs []BookingPair, ...)` | Done in `processBookings()` before pairing |

**Functional Equivalence:**

Both approaches achieve the same result:
- Rounding rules applied to arrivals and departures independently
- "up", "down", "nearest", "none" rounding types supported
- Configurable intervals (5, 10, 15, 30 minutes)
- Edge cases handled (nil config, zero interval, already-rounded values)

### 6. Related Time Utilities

The calculation package uses `timeutil` for cross-midnight handling:

**Package:** `/home/tolga/projects/terp/apps/api/internal/timeutil/timeutil.go`

**Relevant Functions:**

- `NormalizeCrossMidnight(startMinutes, endMinutes int) int` - Adds 1440 if end < start
- `IsValidTimeOfDay(minutes int) bool` - Validates 0-1439 range
- `MinutesToString(minutes int) string` - Formats as "HH:MM"

### 7. Error and Warning Codes

No rounding-specific error codes exist. Rounding failures silently return the original value (defensive design).

## Code References

- `/home/tolga/projects/terp/apps/api/internal/calculation/rounding.go:5-50` - Main rounding functions
- `/home/tolga/projects/terp/apps/api/internal/calculation/types.go:61-75` - RoundingType and RoundingConfig
- `/home/tolga/projects/terp/apps/api/internal/calculation/types.go:85-105` - DayPlanInput with rounding configs
- `/home/tolga/projects/terp/apps/api/internal/calculation/calculator.go:102-132` - processBookings applies rounding
- `/home/tolga/projects/terp/apps/api/internal/calculation/calculator.go:116-123` - Tolerance then rounding application
- `/home/tolga/projects/terp/apps/api/internal/calculation/rounding_test.go:1-117` - Test coverage

## Architecture Documentation

**Calculation Pipeline:**

```
Bookings → processBookings → Pairing → Gross Time → Breaks → Net Time → Overtime/Undertime
              ↓
         For each work booking:
         1. Apply tolerance (normalize to expected if within grace period)
         2. Apply rounding (round to interval based on config)
         3. Store calculated time in CalculatedTimes map
```

**Design Decisions:**

1. **Typed enums over strings**: Uses `RoundingType` enum for type safety and IDE autocomplete
2. **Separate configs over embedded**: Allows different rounding rules for come vs. go (separate pointers can be nil independently)
3. **Process before pairing**: Rounding applied to individual bookings before they're paired, keeping duration calculation simple
4. **Defensive defaults**: Nil config, zero interval, or unknown type all return original value unchanged

## Related Research

- `/home/tolga/projects/terp/thoughts/shared/research/2026-01-22-TICKET-060-create-calculation-types.md` - Calculation type definitions
- `/home/tolga/projects/terp/thoughts/shared/research/2026-01-19-TICKET-059-create-calculation-package-structure.md` - Package organization

## Open Questions

None - the rounding logic is fully implemented and tested. The ticket can be marked as complete pending verification that the existing implementation meets business requirements despite API differences from the specification.
