# Implementation Plan: NOK-150 - Add Rounding Add/Subtract Modes

**Date**: 2026-01-25
**Ticket**: NOK-150 (TICKET-122)
**Research**: thoughts/shared/research/2026-01-25-NOK-150-add-rounding-add-subtract-modes.md
**Status**: COMPLETED (2026-01-25)

---

## Overview

Add support for "Wert addieren" (add value) and "Wert subtrahieren" (subtract value) rounding modes to the calculation package. These modes allow adding or subtracting a fixed number of minutes from booking times, typically used to compensate for:
- Walk time from terminal to workplace (add to arrival)
- Shower time after shift (subtract from departure)

Per ZMI Section 7.5: "Bei dieser Einstellung wird der eingestellte Wert auf die Buchung addiert oder subtrahiert."

---

## Files to Modify

| File | Change |
|------|--------|
| `apps/api/internal/model/dayplan.go` | Add `RoundingAdd` and `RoundingSubtract` constants |
| `apps/api/internal/calculation/types.go` | Add constants + `AddValue` field to `RoundingConfig` |
| `apps/api/internal/calculation/rounding.go` | Add add/subtract cases to `RoundTime()` |
| `apps/api/internal/calculation/rounding_test.go` | Add test cases for add/subtract modes |
| `apps/api/internal/service/daily_calc.go` | Map `RoundingComeAddValue` and `RoundingGoAddValue` to calculation input |

---

## Dependencies (Verified)

| Dependency | Status | Notes |
|---|---|---|
| Rounding logic implementation | DONE | `calculation/rounding.go` exists with up/down/nearest |
| RoundingConfig struct | DONE | `calculation/types.go` lines 72-76 |
| Model RoundingType | DONE | `model/dayplan.go` lines 17-24 |
| Model add value fields | DONE | `model/dayplan.go` lines 93-94 |
| Database add value columns | DONE | Migration 000030 added columns |

---

## ZMI Reference

From Section 7.5, Pages 44-45 of the ZMI calculation manual:

> **Wert addieren und Wert subtrahieren**: "Bei dieser Einstellung wird der eingestellte Wert auf die Buchung addiert oder subtrahiert. Zum Beispiel bei 10 Minuten addieren: 05:55 wird 06:05, 07:32 wird 07:42"

> "Diese Einstellung wird benötigt, wenn die Mitarbeitenden einen langen Weg vom Zeiterfassungsterminal zu ihrem Arbeitsplatz haben oder nach der Schicht noch duschen mussen und diese Zeit soll nicht berucksichtigt werden."

**Use Cases**:
- **Add to arrival**: Walk time from terminal to workplace (employee starts working later than booking)
- **Subtract from departure**: Shower time after shift (employee stops working earlier than booking)

---

## Phase 1: Add RoundingType Constants to Model

**File**: `apps/api/internal/model/dayplan.go`

### 1.1 Update RoundingType Enum

Current (lines 17-24):
```go
type RoundingType string

const (
    RoundingNone    RoundingType = "none"
    RoundingUp      RoundingType = "up"
    RoundingDown    RoundingType = "down"
    RoundingNearest RoundingType = "nearest"
)
```

Update to:
```go
type RoundingType string

const (
    RoundingNone     RoundingType = "none"
    RoundingUp       RoundingType = "up"
    RoundingDown     RoundingType = "down"
    RoundingNearest  RoundingType = "nearest"
    RoundingAdd      RoundingType = "add"
    RoundingSubtract RoundingType = "subtract"
)
```

### 1.2 Verification

- [ ] File compiles: `cd apps/api && go build ./internal/model/`
- [ ] No import changes needed

---

## Phase 2: Update Calculation Types

**File**: `apps/api/internal/calculation/types.go`

### 2.1 Update RoundingType Enum

Current (lines 62-70):
```go
type RoundingType string

const (
    RoundingNone    RoundingType = "none"
    RoundingUp      RoundingType = "up"
    RoundingDown    RoundingType = "down"
    RoundingNearest RoundingType = "nearest"
)
```

Update to:
```go
type RoundingType string

const (
    RoundingNone     RoundingType = "none"
    RoundingUp       RoundingType = "up"
    RoundingDown     RoundingType = "down"
    RoundingNearest  RoundingType = "nearest"
    RoundingAdd      RoundingType = "add"
    RoundingSubtract RoundingType = "subtract"
)
```

### 2.2 Update RoundingConfig Struct

Current (lines 72-76):
```go
type RoundingConfig struct {
    Type     RoundingType
    Interval int // Rounding interval in minutes (e.g., 5, 15)
}
```

Update to:
```go
// RoundingConfig defines rounding rules.
type RoundingConfig struct {
    Type     RoundingType
    Interval int // Rounding interval in minutes for up/down/nearest modes
    AddValue int // Fixed value to add/subtract for add/subtract modes
}
```

### 2.3 Verification

- [ ] File compiles: `cd apps/api && go build ./internal/calculation/`
- [ ] Existing tests still pass: `cd apps/api && go test ./internal/calculation/...`

---

## Phase 3: Implement Add/Subtract Rounding Functions

**File**: `apps/api/internal/calculation/rounding.go`

### 3.1 Add Helper Functions

Add after the existing `roundNearest` function (after line 40):

```go
// roundAdd adds a fixed value to the time.
// Used for walk time compensation (arrive later than booked).
func roundAdd(minutes, value int) int {
    return minutes + value
}

// roundSubtract subtracts a fixed value from the time.
// Used for shower time deduction (leave earlier than booked).
// Result is clamped to 0 minimum.
func roundSubtract(minutes, value int) int {
    result := minutes - value
    if result < 0 {
        return 0
    }
    return result
}
```

### 3.2 Update RoundTime Function

Current `RoundTime` function (lines 3-20):
```go
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
```

Update to:
```go
// RoundTime applies rounding to a time value based on configuration.
// Returns the original time if config is nil or has RoundingNone type.
//
// For interval-based rounding (up/down/nearest), Interval must be > 0.
// For add/subtract rounding, AddValue is used (Interval is ignored).
func RoundTime(minutes int, config *RoundingConfig) int {
    if config == nil || config.Type == RoundingNone {
        return minutes
    }

    switch config.Type {
    case RoundingUp:
        if config.Interval <= 0 {
            return minutes
        }
        return roundUp(minutes, config.Interval)
    case RoundingDown:
        if config.Interval <= 0 {
            return minutes
        }
        return roundDown(minutes, config.Interval)
    case RoundingNearest:
        if config.Interval <= 0 {
            return minutes
        }
        return roundNearest(minutes, config.Interval)
    case RoundingAdd:
        if config.AddValue <= 0 {
            return minutes
        }
        return roundAdd(minutes, config.AddValue)
    case RoundingSubtract:
        if config.AddValue <= 0 {
            return minutes
        }
        return roundSubtract(minutes, config.AddValue)
    default:
        return minutes
    }
}
```

### 3.3 Full Updated File

The complete `rounding.go` file should be:

```go
package calculation

// RoundTime applies rounding to a time value based on configuration.
// Returns the original time if config is nil or has RoundingNone type.
//
// For interval-based rounding (up/down/nearest), Interval must be > 0.
// For add/subtract rounding, AddValue is used (Interval is ignored).
func RoundTime(minutes int, config *RoundingConfig) int {
    if config == nil || config.Type == RoundingNone {
        return minutes
    }

    switch config.Type {
    case RoundingUp:
        if config.Interval <= 0 {
            return minutes
        }
        return roundUp(minutes, config.Interval)
    case RoundingDown:
        if config.Interval <= 0 {
            return minutes
        }
        return roundDown(minutes, config.Interval)
    case RoundingNearest:
        if config.Interval <= 0 {
            return minutes
        }
        return roundNearest(minutes, config.Interval)
    case RoundingAdd:
        if config.AddValue <= 0 {
            return minutes
        }
        return roundAdd(minutes, config.AddValue)
    case RoundingSubtract:
        if config.AddValue <= 0 {
            return minutes
        }
        return roundSubtract(minutes, config.AddValue)
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
    if remainder <= interval/2 {
        return roundDown(minutes, interval)
    }
    return roundUp(minutes, interval)
}

// roundAdd adds a fixed value to the time.
// Used for walk time compensation (arrive later than booked).
func roundAdd(minutes, value int) int {
    return minutes + value
}

// roundSubtract subtracts a fixed value from the time.
// Used for shower time deduction (leave earlier than booked).
// Result is clamped to 0 minimum.
func roundSubtract(minutes, value int) int {
    result := minutes - value
    if result < 0 {
        return 0
    }
    return result
}

// RoundComeTime applies rounding to an arrival time.
func RoundComeTime(minutes int, config *RoundingConfig) int {
    return RoundTime(minutes, config)
}

// RoundGoTime applies rounding to a departure time.
func RoundGoTime(minutes int, config *RoundingConfig) int {
    return RoundTime(minutes, config)
}
```

### 3.4 Verification

- [ ] File compiles: `cd apps/api && go build ./internal/calculation/`
- [ ] Existing tests still pass: `cd apps/api && go test -v -run TestRoundTime ./internal/calculation/...`

---

## Phase 4: Add Unit Tests for Add/Subtract Modes

**File**: `apps/api/internal/calculation/rounding_test.go`

### 4.1 Add Test for RoundingAdd

Add after the existing tests:

```go
func TestRoundTime_RoundAdd(t *testing.T) {
    tests := []struct {
        name     string
        input    int
        addValue int
        expected int
    }{
        {"add 10 minutes to 05:55", 355, 10, 365},         // 05:55 -> 06:05
        {"add 10 minutes to 07:32", 452, 10, 462},         // 07:32 -> 07:42
        {"add 5 minutes to 08:00", 480, 5, 485},           // 08:00 -> 08:05
        {"add 15 minutes to midnight", 0, 15, 15},         // 00:00 -> 00:15
        {"add 30 minutes to 23:30", 1410, 30, 1440},       // 23:30 -> 24:00
        {"add 60 minutes to 23:30", 1410, 60, 1470},       // 23:30 -> 24:30 (allows overflow)
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            config := &calculation.RoundingConfig{Type: calculation.RoundingAdd, AddValue: tt.addValue}
            result := calculation.RoundTime(tt.input, config)
            assert.Equal(t, tt.expected, result)
        })
    }
}

func TestRoundTime_RoundAdd_ZeroValue(t *testing.T) {
    // AddValue of 0 should return original time
    config := &calculation.RoundingConfig{Type: calculation.RoundingAdd, AddValue: 0}
    result := calculation.RoundTime(480, config)
    assert.Equal(t, 480, result)
}

func TestRoundTime_RoundAdd_NegativeValue(t *testing.T) {
    // Negative AddValue should return original time (treated as invalid)
    config := &calculation.RoundingConfig{Type: calculation.RoundingAdd, AddValue: -10}
    result := calculation.RoundTime(480, config)
    assert.Equal(t, 480, result)
}
```

### 4.2 Add Test for RoundingSubtract

```go
func TestRoundTime_RoundSubtract(t *testing.T) {
    tests := []struct {
        name     string
        input    int
        addValue int
        expected int
    }{
        {"subtract 10 minutes from 16:10", 970, 10, 960},  // 16:10 -> 16:00
        {"subtract 10 minutes from 17:05", 1025, 10, 1015}, // 17:05 -> 16:55
        {"subtract 5 minutes from 08:05", 485, 5, 480},     // 08:05 -> 08:00
        {"subtract 15 minutes from 00:30", 30, 15, 15},     // 00:30 -> 00:15
        {"subtract 30 minutes from 00:20 clamps to 0", 20, 30, 0}, // 00:20 - 30 = -10, clamped to 0
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            config := &calculation.RoundingConfig{Type: calculation.RoundingSubtract, AddValue: tt.addValue}
            result := calculation.RoundTime(tt.input, config)
            assert.Equal(t, tt.expected, result)
        })
    }
}

func TestRoundTime_RoundSubtract_ZeroValue(t *testing.T) {
    // AddValue of 0 should return original time
    config := &calculation.RoundingConfig{Type: calculation.RoundingSubtract, AddValue: 0}
    result := calculation.RoundTime(480, config)
    assert.Equal(t, 480, result)
}

func TestRoundTime_RoundSubtract_NegativeValue(t *testing.T) {
    // Negative AddValue should return original time (treated as invalid)
    config := &calculation.RoundingConfig{Type: calculation.RoundingSubtract, AddValue: -10}
    result := calculation.RoundTime(480, config)
    assert.Equal(t, 480, result)
}

func TestRoundTime_RoundSubtract_ClampToZero(t *testing.T) {
    // Subtracting more than the time should clamp to 0
    tests := []struct {
        name     string
        input    int
        addValue int
        expected int
    }{
        {"subtract exactly equals time", 30, 30, 0},
        {"subtract more than time", 20, 50, 0},
        {"subtract from zero", 0, 10, 0},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            config := &calculation.RoundingConfig{Type: calculation.RoundingSubtract, AddValue: tt.addValue}
            result := calculation.RoundTime(tt.input, config)
            assert.Equal(t, tt.expected, result)
        })
    }
}
```

### 4.3 Add Tests for Combined Scenarios

```go
func TestRoundTime_AddSubtractIgnoresInterval(t *testing.T) {
    // For add/subtract types, Interval should be ignored
    tests := []struct {
        name     string
        typ      calculation.RoundingType
        input    int
        interval int
        addValue int
        expected int
    }{
        {"add ignores interval", calculation.RoundingAdd, 480, 15, 10, 490},
        {"subtract ignores interval", calculation.RoundingSubtract, 480, 15, 10, 470},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            config := &calculation.RoundingConfig{
                Type:     tt.typ,
                Interval: tt.interval,
                AddValue: tt.addValue,
            }
            result := calculation.RoundTime(tt.input, config)
            assert.Equal(t, tt.expected, result)
        })
    }
}

func TestRoundTime_IntervalIgnoresAddValue(t *testing.T) {
    // For interval types, AddValue should be ignored
    tests := []struct {
        name     string
        typ      calculation.RoundingType
        input    int
        interval int
        addValue int
        expected int
    }{
        {"up ignores addvalue", calculation.RoundingUp, 482, 5, 100, 485},
        {"down ignores addvalue", calculation.RoundingDown, 484, 5, 100, 480},
        {"nearest ignores addvalue", calculation.RoundingNearest, 483, 5, 100, 485},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            config := &calculation.RoundingConfig{
                Type:     tt.typ,
                Interval: tt.interval,
                AddValue: tt.addValue,
            }
            result := calculation.RoundTime(tt.input, config)
            assert.Equal(t, tt.expected, result)
        })
    }
}
```

### 4.4 Verification

- [ ] All tests pass: `cd apps/api && go test -v -run TestRoundTime ./internal/calculation/...`
- [ ] Total test count increased from 7 functions to ~14 functions

---

## Phase 5: Update Service Layer Mapping

**File**: `apps/api/internal/service/daily_calc.go`

### 5.1 Update Rounding Config Mapping

Current mapping (lines 377-391):
```go
// Rounding - come
if dp.RoundingComeType != nil && dp.RoundingComeInterval != nil {
    input.DayPlan.RoundingCome = &calculation.RoundingConfig{
        Type:     calculation.RoundingType(*dp.RoundingComeType),
        Interval: *dp.RoundingComeInterval,
    }
}

// Rounding - go
if dp.RoundingGoType != nil && dp.RoundingGoInterval != nil {
    input.DayPlan.RoundingGo = &calculation.RoundingConfig{
        Type:     calculation.RoundingType(*dp.RoundingGoType),
        Interval: *dp.RoundingGoInterval,
    }
}
```

Update to:
```go
// Rounding - come
if dp.RoundingComeType != nil {
    roundingType := calculation.RoundingType(*dp.RoundingComeType)
    config := &calculation.RoundingConfig{
        Type: roundingType,
    }
    // For interval-based rounding, use interval
    if dp.RoundingComeInterval != nil {
        config.Interval = *dp.RoundingComeInterval
    }
    // For add/subtract rounding, use add value
    if dp.RoundingComeAddValue != nil {
        config.AddValue = *dp.RoundingComeAddValue
    }
    input.DayPlan.RoundingCome = config
}

// Rounding - go
if dp.RoundingGoType != nil {
    roundingType := calculation.RoundingType(*dp.RoundingGoType)
    config := &calculation.RoundingConfig{
        Type: roundingType,
    }
    // For interval-based rounding, use interval
    if dp.RoundingGoInterval != nil {
        config.Interval = *dp.RoundingGoInterval
    }
    // For add/subtract rounding, use add value
    if dp.RoundingGoAddValue != nil {
        config.AddValue = *dp.RoundingGoAddValue
    }
    input.DayPlan.RoundingGo = config
}
```

### 5.2 Verification

- [ ] File compiles: `cd apps/api && go build ./internal/service/`
- [ ] Service tests pass: `cd apps/api && go test ./internal/service/...`

---

## Phase 6: Final Verification

### 6.1 Run All Commands

```bash
# Build check for all packages
cd apps/api && go build ./...

# Run rounding tests
cd apps/api && go test -v -run TestRoundTime ./internal/calculation/...

# Run all calculation tests
cd apps/api && go test -v -race ./internal/calculation/...

# Run service tests
cd apps/api && go test -v ./internal/service/...

# Full test suite
make test

# Lint check
make lint

# Format check
make fmt
```

### 6.2 Acceptance Criteria Checklist

- [x] `RoundingAdd` constant added to `model/dayplan.go`
- [x] `RoundingSubtract` constant added to `model/dayplan.go`
- [x] `RoundingAdd` constant added to `calculation/types.go`
- [x] `RoundingSubtract` constant added to `calculation/types.go`
- [x] `AddValue` field added to `RoundingConfig` struct
- [x] `roundAdd()` helper function implemented
- [x] `roundSubtract()` helper function implemented
- [x] `RoundTime()` updated to handle add/subtract cases
- [x] `roundSubtract()` clamps result to 0 minimum
- [x] Add/subtract modes ignore Interval field
- [x] Interval modes ignore AddValue field
- [x] Zero/negative AddValue returns original time
- [x] Service layer maps `RoundingComeAddValue` to calculation input
- [x] Service layer maps `RoundingGoAddValue` to calculation input
- [x] All existing rounding tests still pass
- [x] New add/subtract tests pass
- [x] `make test` passes
- [ ] `make lint` passes (golangci-lint not installed)

---

## File Changes Summary

### `apps/api/internal/model/dayplan.go`

```diff
 const (
     RoundingNone    RoundingType = "none"
     RoundingUp      RoundingType = "up"
     RoundingDown    RoundingType = "down"
     RoundingNearest RoundingType = "nearest"
+    RoundingAdd      RoundingType = "add"
+    RoundingSubtract RoundingType = "subtract"
 )
```

### `apps/api/internal/calculation/types.go`

```diff
 const (
     RoundingNone    RoundingType = "none"
     RoundingUp      RoundingType = "up"
     RoundingDown    RoundingType = "down"
     RoundingNearest RoundingType = "nearest"
+    RoundingAdd      RoundingType = "add"
+    RoundingSubtract RoundingType = "subtract"
 )

 type RoundingConfig struct {
     Type     RoundingType
     Interval int // Rounding interval in minutes (e.g., 5, 15)
+    AddValue int // Fixed value to add/subtract for add/subtract modes
 }
```

### `apps/api/internal/calculation/rounding.go`

- Update `RoundTime()` to handle `RoundingAdd` and `RoundingSubtract` cases
- Add `roundAdd()` helper function
- Add `roundSubtract()` helper function with clamp to 0

### `apps/api/internal/calculation/rounding_test.go`

- Add `TestRoundTime_RoundAdd` with multiple cases
- Add `TestRoundTime_RoundAdd_ZeroValue`
- Add `TestRoundTime_RoundAdd_NegativeValue`
- Add `TestRoundTime_RoundSubtract` with multiple cases
- Add `TestRoundTime_RoundSubtract_ZeroValue`
- Add `TestRoundTime_RoundSubtract_NegativeValue`
- Add `TestRoundTime_RoundSubtract_ClampToZero`
- Add `TestRoundTime_AddSubtractIgnoresInterval`
- Add `TestRoundTime_IntervalIgnoresAddValue`

### `apps/api/internal/service/daily_calc.go`

- Update rounding config mapping to include `AddValue` from model

---

## Implementation Notes

### Key Design Decisions

1. **Separate Fields**: The `AddValue` field is added to `RoundingConfig` alongside `Interval`. This matches the database schema design where add value is stored separately from interval.

2. **Mutual Exclusivity**: Add/subtract modes use `AddValue` and ignore `Interval`. Interval-based modes use `Interval` and ignore `AddValue`. The `Type` field determines which value is used.

3. **Zero Value Handling**: Zero or negative `AddValue` returns original time unchanged. This is consistent with how zero `Interval` is handled for interval-based rounding.

4. **Clamp to Zero**: The `roundSubtract()` function clamps results to 0 minimum. This prevents negative time values which would be invalid. While the ZMI manual doesn't explicitly address this, it's the safest behavior.

5. **Overflow Allowed**: The `roundAdd()` function allows values to exceed 1440 (midnight). This may be needed for cross-midnight scenarios. Validation should happen at a higher level if needed.

6. **Service Layer Logic**: The service layer always sets both `Interval` and `AddValue` if available. The `RoundTime()` function determines which to use based on `Type`.

### ZMI Compliance

| ZMI Feature | German Term | Implementation |
|---|---|---|
| Add value | Wert addieren | `RoundingAdd` type with `AddValue` |
| Subtract value | Wert subtrahieren | `RoundingSubtract` type with `AddValue` |
| Walk time compensation | Arbeitsweg | Add to arrival time |
| Shower time deduction | Duschen | Subtract from departure time |

---

## Estimated Implementation Time

| Phase | Estimated Time |
|-------|----------------|
| Phase 1: Model Constants | 5 min |
| Phase 2: Calculation Types | 5 min |
| Phase 3: Rounding Functions | 15 min |
| Phase 4: Unit Tests | 20 min |
| Phase 5: Service Mapping | 10 min |
| Phase 6: Final Verification | 10 min |
| **Total** | **~1 hour** |
