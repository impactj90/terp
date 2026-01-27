# Implementation Plan: NOK-146 - Shift Detection Logic

> **Ticket**: NOK-146 / TICKET-119
> **Date**: 2026-01-25
> **Research**: thoughts/shared/research/2026-01-25-NOK-146-shift-detection-logic.md
> **Files to Create**:
> - `apps/api/internal/calculation/shift.go`
> - `apps/api/internal/calculation/shift_test.go`

---

## Overview

Implement automatic shift detection logic in the calculation package. When an employee's booking does not fall within the expected time window of their assigned day plan, the system searches alternative day plans to find a matching shift. This follows the ZMI "Schichterkennung" feature from Section 10 of the manual.

The implementation is a pure function with no database dependencies. A `DayPlanLoader` interface allows the caller (service layer) to provide day plan lookup capability.

---

## Dependencies (Verified)

| Dependency | Status | Notes |
|---|---|---|
| Calculation package structure | DONE | `apps/api/internal/calculation/` exists |
| DayPlan model with shift fields | DONE | `model/dayplan.go` lines 110-122 |
| `HasShiftDetection()` helper | DONE | `model/dayplan.go` lines 172-176 |
| `GetAlternativePlanIDs()` helper | DONE | `model/dayplan.go` lines 178-199 |
| `FindFirstCome()` function | DONE | `calculation/pairing.go` lines 243-255 |
| `FindLastGo()` function | DONE | `calculation/pairing.go` lines 257-269 |
| Error code pattern | DONE | `calculation/errors.go` |

---

## ZMI Reference

From Section 10, Pages 48-49 of the ZMI calculation manual:

- **Arrival Detection (Schichterkennung Kommen)**: When arrival from/to times are configured, check if the arrival booking falls within this range. If not, search alternative day plans.
- **Departure Detection (Schichterkennung Gehen)**: Same as arrival detection but checks the departure booking.
- **Both Windows Check**: It is possible to check both arrival and departure bookings in one day plan.
- **Alternative Day Plans**: Up to 6 different day plans can be stored as alternatives.
- **No Match Error**: If no matching day plan is found, generate error "Kein passender Zeitplan gefunden" (No matching time plan found).

---

## Phase 1: Define Types in `shift.go`

**File**: `apps/api/internal/calculation/shift.go`

### 1.1 ShiftMatchType Enum

```go
// ShiftMatchType indicates how a shift was matched.
type ShiftMatchType string

const (
    // ShiftMatchNone means no shift detection was configured or no match found.
    ShiftMatchNone ShiftMatchType = "none"
    // ShiftMatchArrival means the shift matched by arrival time window.
    ShiftMatchArrival ShiftMatchType = "arrival"
    // ShiftMatchDeparture means the shift matched by departure time window.
    ShiftMatchDeparture ShiftMatchType = "departure"
    // ShiftMatchBoth means the shift matched by both arrival and departure windows.
    ShiftMatchBoth ShiftMatchType = "both"
)
```

### 1.2 ShiftDetectionInput Struct

```go
// ShiftDetectionInput contains the configuration for shift detection from a day plan.
type ShiftDetectionInput struct {
    PlanID   uuid.UUID
    PlanCode string

    // Arrival window (minutes from midnight)
    ArriveFrom *int
    ArriveTo   *int

    // Departure window (minutes from midnight)
    DepartFrom *int
    DepartTo   *int

    // Alternative plan IDs (up to 6)
    AlternativePlanIDs []uuid.UUID
}
```

### 1.3 ShiftDetectionResult Struct

```go
// ShiftDetectionResult contains the outcome of shift detection.
type ShiftDetectionResult struct {
    // MatchedPlanID is the ID of the matched day plan.
    MatchedPlanID uuid.UUID
    // MatchedPlanCode is the code of the matched day plan.
    MatchedPlanCode string
    // IsOriginalPlan is true if the original assigned plan was used.
    IsOriginalPlan bool
    // MatchedBy indicates which time window(s) matched.
    MatchedBy ShiftMatchType
    // HasError is true if no matching plan was found.
    HasError bool
    // ErrorCode is set when HasError is true.
    ErrorCode string
}
```

### 1.4 DayPlanLoader Interface

```go
// DayPlanLoader provides day plan lookup capability for shift detection.
// This interface allows the shift detector to be independent of the repository layer.
type DayPlanLoader interface {
    // LoadShiftDetectionInput loads shift detection configuration for a day plan.
    // Returns nil if the plan is not found.
    LoadShiftDetectionInput(id uuid.UUID) *ShiftDetectionInput
}
```

### 1.5 ShiftDetector Struct

```go
// ShiftDetector performs automatic shift detection based on booking times.
type ShiftDetector struct {
    loader DayPlanLoader
}

// NewShiftDetector creates a new shift detector with the given day plan loader.
func NewShiftDetector(loader DayPlanLoader) *ShiftDetector {
    return &ShiftDetector{loader: loader}
}
```

### Imports Required

```go
import (
    "github.com/google/uuid"
)
```

### Verification

- [ ] All types compile: `cd apps/api && go build ./internal/calculation/`
- [ ] Types follow existing conventions (string enums, pointer fields for optional values)
- [ ] `ShiftMatchType` uses same pattern as `BookingDirection` and `BreakType`
- [ ] No database imports (only `github.com/google/uuid`)

---

## Phase 2: Add Error Code to `errors.go`

**File**: `apps/api/internal/calculation/errors.go`

Add to the error codes section:

```go
// Shift detection errors
ErrCodeNoMatchingShift = "NO_MATCHING_SHIFT" // No day plan matched the booking times
```

Update `IsError()` function to include the new error code:

```go
func IsError(code string) bool {
    switch code {
    case ErrCodeMissingCome, ErrCodeMissingGo, ErrCodeUnpairedBooking,
        ErrCodeEarlyCome, ErrCodeLateCome, ErrCodeEarlyGo, ErrCodeLateGo,
        ErrCodeMissedCoreStart, ErrCodeMissedCoreEnd,
        ErrCodeBelowMinWorkTime, ErrCodeNoBookings,
        ErrCodeInvalidTime, ErrCodeDuplicateInTime,
        ErrCodeNoMatchingShift:  // <-- Add this
        return true
    default:
        return false
    }
}
```

### Verification

- [ ] Error code constant is accessible from test package
- [ ] `IsError()` returns true for `ErrCodeNoMatchingShift`

---

## Phase 3: Implement Helper Functions (unexported)

**File**: `apps/api/internal/calculation/shift.go`

### 3.1 `isInTimeWindow`

```go
// isInTimeWindow checks if a time falls within the given window.
// Returns false if either boundary is nil.
func isInTimeWindow(time int, from, to *int) bool {
    if from == nil || to == nil {
        return false
    }
    return time >= *from && time <= *to
}
```

### 3.2 `hasArrivalWindow`

```go
// hasArrivalWindow returns true if arrival shift detection is configured.
func hasArrivalWindow(input *ShiftDetectionInput) bool {
    return input.ArriveFrom != nil && input.ArriveTo != nil
}
```

### 3.3 `hasDepartureWindow`

```go
// hasDepartureWindow returns true if departure shift detection is configured.
func hasDepartureWindow(input *ShiftDetectionInput) bool {
    return input.DepartFrom != nil && input.DepartTo != nil
}
```

### 3.4 `matchesPlan`

```go
// matchesPlan checks if the booking times match the given plan's shift detection windows.
// Returns the match type if successful, ShiftMatchNone otherwise.
func matchesPlan(input *ShiftDetectionInput, firstArrival, lastDeparture *int) ShiftMatchType {
    hasArrival := hasArrivalWindow(input)
    hasDeparture := hasDepartureWindow(input)

    // No shift detection configured
    if !hasArrival && !hasDeparture {
        return ShiftMatchNone
    }

    arrivalMatches := false
    departureMatches := false

    // Check arrival window if configured
    if hasArrival && firstArrival != nil {
        arrivalMatches = isInTimeWindow(*firstArrival, input.ArriveFrom, input.ArriveTo)
    }

    // Check departure window if configured
    if hasDeparture && lastDeparture != nil {
        departureMatches = isInTimeWindow(*lastDeparture, input.DepartFrom, input.DepartTo)
    }

    // Determine match type based on what was configured and what matched
    if hasArrival && hasDeparture {
        // Both windows configured - both must match
        if arrivalMatches && departureMatches {
            return ShiftMatchBoth
        }
        return ShiftMatchNone
    }

    if hasArrival {
        if arrivalMatches {
            return ShiftMatchArrival
        }
        return ShiftMatchNone
    }

    if hasDeparture {
        if departureMatches {
            return ShiftMatchDeparture
        }
        return ShiftMatchNone
    }

    return ShiftMatchNone
}
```

### Verification

- [ ] All helper functions are unexported (lowercase)
- [ ] Each function is pure with no side effects
- [ ] Edge cases handled (nil pointers, empty windows)

---

## Phase 4: Implement DetectShift Method

**File**: `apps/api/internal/calculation/shift.go`

### 4.1 Main DetectShift Method

```go
// DetectShift determines which day plan should be used based on booking times.
// It checks if the booking times match the assigned plan's shift detection windows.
// If not, it searches up to 6 alternative plans for a match.
//
// Parameters:
//   - assignedPlan: The shift detection input from the employee's assigned day plan
//   - firstArrival: First arrival time in minutes from midnight (from FindFirstCome)
//   - lastDeparture: Last departure time in minutes from midnight (from FindLastGo)
//
// Returns:
//   - ShiftDetectionResult with the matched plan or error if no match found
func (sd *ShiftDetector) DetectShift(
    assignedPlan *ShiftDetectionInput,
    firstArrival *int,
    lastDeparture *int,
) ShiftDetectionResult {
    // No assigned plan - return empty result
    if assignedPlan == nil {
        return ShiftDetectionResult{
            MatchedBy:      ShiftMatchNone,
            IsOriginalPlan: true,
        }
    }

    // No shift detection configured - use original plan
    if !hasArrivalWindow(assignedPlan) && !hasDepartureWindow(assignedPlan) {
        return ShiftDetectionResult{
            MatchedPlanID:   assignedPlan.PlanID,
            MatchedPlanCode: assignedPlan.PlanCode,
            IsOriginalPlan:  true,
            MatchedBy:       ShiftMatchNone,
        }
    }

    // No booking times to check - use original plan with no match
    if firstArrival == nil && lastDeparture == nil {
        return ShiftDetectionResult{
            MatchedPlanID:   assignedPlan.PlanID,
            MatchedPlanCode: assignedPlan.PlanCode,
            IsOriginalPlan:  true,
            MatchedBy:       ShiftMatchNone,
        }
    }

    // Check if assigned plan matches
    matchType := matchesPlan(assignedPlan, firstArrival, lastDeparture)
    if matchType != ShiftMatchNone {
        return ShiftDetectionResult{
            MatchedPlanID:   assignedPlan.PlanID,
            MatchedPlanCode: assignedPlan.PlanCode,
            IsOriginalPlan:  true,
            MatchedBy:       matchType,
        }
    }

    // Search alternative plans
    for _, altPlanID := range assignedPlan.AlternativePlanIDs {
        if sd.loader == nil {
            continue
        }

        altPlan := sd.loader.LoadShiftDetectionInput(altPlanID)
        if altPlan == nil {
            continue
        }

        matchType := matchesPlan(altPlan, firstArrival, lastDeparture)
        if matchType != ShiftMatchNone {
            return ShiftDetectionResult{
                MatchedPlanID:   altPlan.PlanID,
                MatchedPlanCode: altPlan.PlanCode,
                IsOriginalPlan:  false,
                MatchedBy:       matchType,
            }
        }
    }

    // No match found - return original plan with error
    return ShiftDetectionResult{
        MatchedPlanID:   assignedPlan.PlanID,
        MatchedPlanCode: assignedPlan.PlanCode,
        IsOriginalPlan:  true,
        MatchedBy:       ShiftMatchNone,
        HasError:        true,
        ErrorCode:       ErrCodeNoMatchingShift,
    }
}
```

### 4.2 Validation Function

```go
// ValidateShiftDetectionConfig validates shift detection configuration on a day plan.
// Returns a list of validation errors (empty if valid).
func ValidateShiftDetectionConfig(input *ShiftDetectionInput) []string {
    if input == nil {
        return nil
    }

    var errors []string

    // Validate arrival window
    if input.ArriveFrom != nil && input.ArriveTo != nil {
        if *input.ArriveFrom < 0 || *input.ArriveFrom > 1440 {
            errors = append(errors, "shift_detect_arrive_from must be between 0 and 1440")
        }
        if *input.ArriveTo < 0 || *input.ArriveTo > 1440 {
            errors = append(errors, "shift_detect_arrive_to must be between 0 and 1440")
        }
        if *input.ArriveFrom > *input.ArriveTo {
            errors = append(errors, "shift_detect_arrive_from must be <= shift_detect_arrive_to")
        }
    } else if (input.ArriveFrom != nil) != (input.ArriveTo != nil) {
        errors = append(errors, "both shift_detect_arrive_from and shift_detect_arrive_to must be set together")
    }

    // Validate departure window
    if input.DepartFrom != nil && input.DepartTo != nil {
        if *input.DepartFrom < 0 || *input.DepartFrom > 1440 {
            errors = append(errors, "shift_detect_depart_from must be between 0 and 1440")
        }
        if *input.DepartTo < 0 || *input.DepartTo > 1440 {
            errors = append(errors, "shift_detect_depart_to must be between 0 and 1440")
        }
        if *input.DepartFrom > *input.DepartTo {
            errors = append(errors, "shift_detect_depart_from must be <= shift_detect_depart_to")
        }
    } else if (input.DepartFrom != nil) != (input.DepartTo != nil) {
        errors = append(errors, "both shift_detect_depart_from and shift_detect_depart_to must be set together")
    }

    return errors
}
```

### Verification

- [ ] `DetectShift` handles nil inputs gracefully
- [ ] Alternative plans searched in order (1-6)
- [ ] Error returned when no match found
- [ ] Original plan returned with error (fallback behavior per ZMI spec)

---

## Phase 5: Write Unit Tests

**File**: `apps/api/internal/calculation/shift_test.go`

### Package and Imports

```go
package calculation_test

import (
    "testing"

    "github.com/google/uuid"
    "github.com/stretchr/testify/assert"

    "github.com/tolga/terp/internal/calculation"
)
```

### Test Helpers

```go
func intPtr(v int) *int {
    return &v
}

// mockDayPlanLoader implements DayPlanLoader for testing
type mockDayPlanLoader struct {
    plans map[uuid.UUID]*calculation.ShiftDetectionInput
}

func newMockLoader() *mockDayPlanLoader {
    return &mockDayPlanLoader{
        plans: make(map[uuid.UUID]*calculation.ShiftDetectionInput),
    }
}

func (m *mockDayPlanLoader) LoadShiftDetectionInput(id uuid.UUID) *calculation.ShiftDetectionInput {
    return m.plans[id]
}

func (m *mockDayPlanLoader) addPlan(input *calculation.ShiftDetectionInput) {
    m.plans[input.PlanID] = input
}
```

### Test Cases by Group

#### Group 1: No Shift Detection Configured

| Test Name | Description |
|---|---|
| `TestDetectShift_NilAssignedPlan` | Nil assigned plan returns empty result |
| `TestDetectShift_NoWindowsConfigured` | No shift detection windows, use original plan |
| `TestDetectShift_NoBookingTimes` | No arrival/departure times, use original plan |

#### Group 2: Arrival Window Only

| Test Name | Description |
|---|---|
| `TestDetectShift_ArrivalMatch_WithinWindow` | Arrival within window, matches |
| `TestDetectShift_ArrivalMatch_AtFromBoundary` | Arrival at window start, matches |
| `TestDetectShift_ArrivalMatch_AtToBoundary` | Arrival at window end, matches |
| `TestDetectShift_ArrivalNoMatch_TooEarly` | Arrival before window, no match |
| `TestDetectShift_ArrivalNoMatch_TooLate` | Arrival after window, no match |

#### Group 3: Departure Window Only

| Test Name | Description |
|---|---|
| `TestDetectShift_DepartureMatch_WithinWindow` | Departure within window, matches |
| `TestDetectShift_DepartureMatch_AtFromBoundary` | Departure at window start, matches |
| `TestDetectShift_DepartureMatch_AtToBoundary` | Departure at window end, matches |
| `TestDetectShift_DepartureNoMatch_TooEarly` | Departure before window, no match |
| `TestDetectShift_DepartureNoMatch_TooLate` | Departure after window, no match |

#### Group 4: Both Windows Configured

| Test Name | Description |
|---|---|
| `TestDetectShift_BothWindows_BothMatch` | Both arrival and departure match |
| `TestDetectShift_BothWindows_ArrivalOnlyMatches` | Only arrival matches, no overall match |
| `TestDetectShift_BothWindows_DepartureOnlyMatches` | Only departure matches, no overall match |
| `TestDetectShift_BothWindows_NeitherMatches` | Neither matches |

#### Group 5: Alternative Plan Search

| Test Name | Description |
|---|---|
| `TestDetectShift_AlternativePlan_FirstMatches` | First alternative plan matches |
| `TestDetectShift_AlternativePlan_SecondMatches` | Second alternative plan matches |
| `TestDetectShift_AlternativePlan_LastMatches` | Sixth alternative plan matches |
| `TestDetectShift_AlternativePlan_NoneMatch` | No alternatives match, error returned |
| `TestDetectShift_AlternativePlan_PlanNotFound` | Alternative plan ID not found in loader |
| `TestDetectShift_AlternativePlan_NilLoader` | Nil loader, gracefully handles |

#### Group 6: Error Handling

| Test Name | Description |
|---|---|
| `TestDetectShift_NoMatch_ReturnsError` | No match found returns error |
| `TestDetectShift_NoMatch_ReturnsOriginalPlan` | No match still returns original plan ID |
| `TestDetectShift_NoMatch_ErrorCode` | Error code is ErrCodeNoMatchingShift |

#### Group 7: Edge Cases

| Test Name | Description |
|---|---|
| `TestDetectShift_NilArrivalWithDepartureWindow` | Only departure, arrival is nil |
| `TestDetectShift_NilDepartureWithArrivalWindow` | Only arrival, departure is nil |
| `TestDetectShift_MidnightBoundary` | Times at 0 and 1440 |
| `TestDetectShift_EmptyAlternatives` | No alternative plans configured |

#### Group 8: Validation Function

| Test Name | Description |
|---|---|
| `TestValidateShiftDetectionConfig_NilInput` | Nil input returns nil errors |
| `TestValidateShiftDetectionConfig_Valid` | Valid config returns no errors |
| `TestValidateShiftDetectionConfig_ArrivalFromOnly` | Only arrive_from set, error |
| `TestValidateShiftDetectionConfig_ArrivalToOnly` | Only arrive_to set, error |
| `TestValidateShiftDetectionConfig_ArrivalFromGreaterThanTo` | arrive_from > arrive_to, error |
| `TestValidateShiftDetectionConfig_DepartFromOnly` | Only depart_from set, error |
| `TestValidateShiftDetectionConfig_DepartToOnly` | Only depart_to set, error |
| `TestValidateShiftDetectionConfig_DepartFromGreaterThanTo` | depart_from > depart_to, error |
| `TestValidateShiftDetectionConfig_InvalidTimeRange` | Time outside 0-1440, error |
| `TestValidateShiftDetectionConfig_MultipleErrors` | Multiple validation errors |

### Test Pattern

Use table-driven tests with `t.Run()`:

```go
func TestDetectShift_ArrivalWindow(t *testing.T) {
    planID := uuid.New()
    assignedPlan := &calculation.ShiftDetectionInput{
        PlanID:     planID,
        PlanCode:   "EARLY",
        ArriveFrom: intPtr(360),  // 06:00
        ArriveTo:   intPtr(480),  // 08:00
    }

    tests := []struct {
        name           string
        firstArrival   *int
        lastDeparture  *int
        wantMatch      bool
        wantMatchType  calculation.ShiftMatchType
    }{
        {"within window", intPtr(420), intPtr(1020), true, calculation.ShiftMatchArrival},
        {"at from boundary", intPtr(360), intPtr(1020), true, calculation.ShiftMatchArrival},
        {"at to boundary", intPtr(480), intPtr(1020), true, calculation.ShiftMatchArrival},
        {"too early", intPtr(350), intPtr(1020), false, calculation.ShiftMatchNone},
        {"too late", intPtr(490), intPtr(1020), false, calculation.ShiftMatchNone},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            detector := calculation.NewShiftDetector(nil)
            result := detector.DetectShift(assignedPlan, tt.firstArrival, tt.lastDeparture)

            if tt.wantMatch {
                assert.Equal(t, planID, result.MatchedPlanID)
                assert.True(t, result.IsOriginalPlan)
                assert.False(t, result.HasError)
            } else {
                assert.True(t, result.HasError)
                assert.Equal(t, calculation.ErrCodeNoMatchingShift, result.ErrorCode)
            }
            assert.Equal(t, tt.wantMatchType, result.MatchedBy)
        })
    }
}
```

### Verification

- [ ] `cd apps/api && go test -v -run TestDetectShift ./internal/calculation/...` passes
- [ ] `cd apps/api && go test -v -run TestValidateShiftDetectionConfig ./internal/calculation/...` passes
- [ ] All test names follow existing naming conventions
- [ ] Mock loader properly implements the interface

---

## Phase 6: Final Verification

### Commands

```bash
# Build check
cd apps/api && go build ./internal/calculation/

# Run shift detection tests
cd apps/api && go test -v -run TestDetectShift ./internal/calculation/...
cd apps/api && go test -v -run TestValidateShiftDetectionConfig ./internal/calculation/...

# Run all calculation tests
cd apps/api && go test -v -race ./internal/calculation/...

# Full test suite
make test

# Lint check
make lint

# Format check
make fmt
```

### Acceptance Criteria

- [ ] `ShiftMatchType` enum with 4 values: none, arrival, departure, both
- [ ] `ShiftDetectionInput` struct decoupled from model.DayPlan
- [ ] `ShiftDetectionResult` struct with match info and error handling
- [ ] `DayPlanLoader` interface for dependency injection
- [ ] `ShiftDetector` struct with `DetectShift` method
- [ ] Arrival window matching: checks if first arrival is within window
- [ ] Departure window matching: checks if last departure is within window
- [ ] Both windows: requires both to match when both configured
- [ ] Alternative plan search: searches up to 6 alternatives in order
- [ ] Error handling: returns `ErrCodeNoMatchingShift` when no match
- [ ] Fallback behavior: returns original plan ID even on error
- [ ] Config validation: `ValidateShiftDetectionConfig` function
- [ ] `make test` passes
- [ ] `make lint` passes

---

## File Structure Summary

### `apps/api/internal/calculation/shift.go`

```
package calculation

import (uuid)

// Types
ShiftMatchType, constants (none, arrival, departure, both)
ShiftDetectionInput struct
ShiftDetectionResult struct
DayPlanLoader interface
ShiftDetector struct

// Exported functions
NewShiftDetector(loader) *ShiftDetector
(*ShiftDetector) DetectShift(assignedPlan, firstArrival, lastDeparture) ShiftDetectionResult
ValidateShiftDetectionConfig(input) []string

// Unexported helpers
isInTimeWindow(time, from, to) bool
hasArrivalWindow(input) bool
hasDepartureWindow(input) bool
matchesPlan(input, firstArrival, lastDeparture) ShiftMatchType
```

### `apps/api/internal/calculation/shift_test.go`

```
package calculation_test

import (testing, uuid, testify/assert, calculation)

// Test helpers
intPtr(v) *int
mockDayPlanLoader struct
newMockLoader() *mockDayPlanLoader
(*mockDayPlanLoader) LoadShiftDetectionInput(id) *ShiftDetectionInput
(*mockDayPlanLoader) addPlan(input)

// Test functions (~30+ test cases)
TestDetectShift_NilAssignedPlan
TestDetectShift_NoWindowsConfigured
TestDetectShift_NoBookingTimes
TestDetectShift_ArrivalMatch_*
TestDetectShift_DepartureMatch_*
TestDetectShift_BothWindows_*
TestDetectShift_AlternativePlan_*
TestDetectShift_NoMatch_*
TestDetectShift_Edge_*
TestValidateShiftDetectionConfig_*
```

---

## Implementation Notes

1. **Pure function pattern**: The `ShiftDetector` follows the same pure function pattern as other calculation functions. The `DayPlanLoader` interface allows injection of the repository layer without creating a direct dependency.

2. **Error vs fallback**: Per ZMI spec, when no matching plan is found, the system should still use the original plan but generate an error. This allows the calculation to proceed while flagging the issue.

3. **Window semantics**: Both boundaries are inclusive (>= from and <= to). This matches the tolerance window behavior elsewhere in the codebase.

4. **Both windows requirement**: When both arrival and departure windows are configured, BOTH must match. This is explicit in the ZMI manual: "Es ist moglich, in einem Tagesplan auch beide Buchungen zu prufen."

5. **Alternative plan order**: Alternatives are searched in order (1-6). The first matching plan is used.

6. **Integration point**: The daily calculation service should call `ShiftDetector.DetectShift()` after loading bookings but before building `CalculationInput`. If a different plan is matched, update the `EmployeeDayPlan` record with the new plan ID.

7. **Cross-midnight shifts**: The shift detection windows do not handle cross-midnight scenarios. Times are assumed to be within 0-1440 minutes (same day). Cross-midnight shifts should use the DayChangeBehavior feature instead.

---

## ZMI Compliance Mapping

| ZMI Feature | German Term | Implementation |
|---|---|---|
| Arrival detection | Schichterkennung Kommen | `ArriveFrom`/`ArriveTo` window check |
| Departure detection | Schichterkennung Gehen | `DepartFrom`/`DepartTo` window check |
| Both windows | Beide pruefen | `ShiftMatchBoth` requires both |
| Alternative plans | Alternative Tagesplane | `AlternativePlanIDs` (up to 6) |
| No match error | Kein passender Zeitplan gefunden | `ErrCodeNoMatchingShift` |
