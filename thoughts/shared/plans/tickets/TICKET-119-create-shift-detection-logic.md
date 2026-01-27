# TICKET-119: Create Shift Detection Logic

**Type**: Calculation
**Effort**: M
**Sprint**: 16 - Daily Calculation Service
**Dependencies**: TICKET-118, TICKET-068

## Integration Notes

> - **When to run**: Shift detection runs during daily calculation, after bookings are loaded but before calculation
> - **How it updates**: When a shift is detected, the result updates the EmployeeDayPlan record with the matched day plan
> - **Integration point**: Call `ShiftDetector.DetectShift()` from daily calculation service before building calculation input

## Description

Implement automatic shift detection based on arrival/departure times. When an employee's booking doesn't fall within the expected time window of their assigned day plan, search alternative day plans to find a matching shift.

## ZMI Reference

> "Automatische Schichterkennung Kommen: Wenn hier in von und bis eine Uhrzeit eingetragen wird, prüft das Programm, ob die Kommt-Buchung in diesem Bereich liegt. Wenn ja, ist der aktuelle Tagesplan gültig. Wenn nicht, sucht ZMI Time in den alternativen Tagesplänen, ob ein passender Tagesplan zugewiesen ist."

> "Alternative Tagespläne: Es können bis zu sechs verschiedene Tagespläne als Alternativen hinterlegt werden."

> "Für den Fall, dass kein passender Tagesplan gefunden wird, erzeugt ZMI Time eine Meldung im Korrekturassistent: «Kein passender Zeitplan gefunden»."

## Files to Create

- `apps/api/internal/calculation/shift.go`
- `apps/api/internal/calculation/shift_test.go`

## Implementation

```go
package calculation

import (
    "github.com/google/uuid"

    "terp/apps/api/internal/model"
)

// ShiftDetectionResult contains the result of shift detection
type ShiftDetectionResult struct {
    MatchedPlanID    uuid.UUID
    MatchedPlanCode  string
    IsOriginalPlan   bool
    MatchedBy        ShiftMatchType // "arrival", "departure", "both"
    HasError         bool
    ErrorMessage     string
}

type ShiftMatchType string

const (
    ShiftMatchArrival   ShiftMatchType = "arrival"
    ShiftMatchDeparture ShiftMatchType = "departure"
    ShiftMatchBoth      ShiftMatchType = "both"
    ShiftMatchNone      ShiftMatchType = "none"
)

// ShiftDetector handles automatic shift detection
type ShiftDetector struct {
    dayPlanLoader DayPlanLoader
}

// DayPlanLoader loads day plans by ID
type DayPlanLoader interface {
    GetByID(id uuid.UUID) (*model.DayPlan, error)
}

func NewShiftDetector(loader DayPlanLoader) *ShiftDetector {
    return &ShiftDetector{dayPlanLoader: loader}
}

// DetectShift determines which day plan should be used based on booking times
// ZMI: Schichterkennung
func (sd *ShiftDetector) DetectShift(
    assignedPlan *model.DayPlan,
    firstArrival *int, // First arrival time in minutes from midnight
    lastDeparture *int, // Last departure time in minutes from midnight
) ShiftDetectionResult {
    // If no shift detection configured, use assigned plan
    if !assignedPlan.HasShiftDetection() {
        return ShiftDetectionResult{
            MatchedPlanID:   assignedPlan.ID,
            MatchedPlanCode: assignedPlan.Code,
            IsOriginalPlan:  true,
            MatchedBy:       ShiftMatchNone,
        }
    }

    // Check if assigned plan matches
    if sd.matchesPlan(assignedPlan, firstArrival, lastDeparture) {
        matchType := sd.determineMatchType(assignedPlan, firstArrival, lastDeparture)
        return ShiftDetectionResult{
            MatchedPlanID:   assignedPlan.ID,
            MatchedPlanCode: assignedPlan.Code,
            IsOriginalPlan:  true,
            MatchedBy:       matchType,
        }
    }

    // Search alternative plans
    for _, altID := range assignedPlan.GetAlternativePlanIDs() {
        altPlan, err := sd.dayPlanLoader.GetByID(altID)
        if err != nil {
            continue // Skip if can't load
        }

        if sd.matchesPlan(altPlan, firstArrival, lastDeparture) {
            matchType := sd.determineMatchType(altPlan, firstArrival, lastDeparture)
            return ShiftDetectionResult{
                MatchedPlanID:   altPlan.ID,
                MatchedPlanCode: altPlan.Code,
                IsOriginalPlan:  false,
                MatchedBy:       matchType,
            }
        }
    }

    // No matching plan found - ZMI error: "Kein passender Zeitplan gefunden"
    return ShiftDetectionResult{
        MatchedPlanID:   assignedPlan.ID,
        MatchedPlanCode: assignedPlan.Code,
        IsOriginalPlan:  true,
        MatchedBy:       ShiftMatchNone,
        HasError:        true,
        ErrorMessage:    "Kein passender Zeitplan gefunden",
    }
}

// matchesPlan checks if a plan matches the given booking times
func (sd *ShiftDetector) matchesPlan(plan *model.DayPlan, firstArrival, lastDeparture *int) bool {
    arrivalMatches := true
    departureMatches := true

    // Check arrival window
    if plan.ShiftDetectArriveFrom != nil && plan.ShiftDetectArriveTo != nil && firstArrival != nil {
        arrivalMatches = *firstArrival >= *plan.ShiftDetectArriveFrom &&
                        *firstArrival <= *plan.ShiftDetectArriveTo
    }

    // Check departure window
    if plan.ShiftDetectDepartFrom != nil && plan.ShiftDetectDepartTo != nil && lastDeparture != nil {
        departureMatches = *lastDeparture >= *plan.ShiftDetectDepartFrom &&
                          *lastDeparture <= *plan.ShiftDetectDepartTo
    }

    // ZMI: "Es ist möglich, in einem Tagesplan auch beide Buchungen zu prüfen."
    // Both must match if both windows are configured
    hasArrivalWindow := plan.ShiftDetectArriveFrom != nil && plan.ShiftDetectArriveTo != nil
    hasDepartureWindow := plan.ShiftDetectDepartFrom != nil && plan.ShiftDetectDepartTo != nil

    if hasArrivalWindow && hasDepartureWindow {
        return arrivalMatches && departureMatches
    }
    if hasArrivalWindow {
        return arrivalMatches
    }
    if hasDepartureWindow {
        return departureMatches
    }

    return false
}

// determineMatchType returns how the match was determined
func (sd *ShiftDetector) determineMatchType(plan *model.DayPlan, firstArrival, lastDeparture *int) ShiftMatchType {
    hasArrivalWindow := plan.ShiftDetectArriveFrom != nil && plan.ShiftDetectArriveTo != nil
    hasDepartureWindow := plan.ShiftDetectDepartFrom != nil && plan.ShiftDetectDepartTo != nil

    if hasArrivalWindow && hasDepartureWindow {
        return ShiftMatchBoth
    }
    if hasArrivalWindow {
        return ShiftMatchArrival
    }
    if hasDepartureWindow {
        return ShiftMatchDeparture
    }
    return ShiftMatchNone
}

// ValidateShiftDetectionConfig validates shift detection configuration
func ValidateShiftDetectionConfig(plan *model.DayPlan) []string {
    var errors []string

    // Arrival window validation
    if plan.ShiftDetectArriveFrom != nil && plan.ShiftDetectArriveTo != nil {
        if *plan.ShiftDetectArriveFrom >= *plan.ShiftDetectArriveTo {
            errors = append(errors, "shift_detect_arrive_from must be less than shift_detect_arrive_to")
        }
        if *plan.ShiftDetectArriveFrom < 0 || *plan.ShiftDetectArriveTo > 1440 {
            errors = append(errors, "shift detection arrival times must be between 0 and 1440")
        }
    } else if (plan.ShiftDetectArriveFrom != nil) != (plan.ShiftDetectArriveTo != nil) {
        errors = append(errors, "both shift_detect_arrive_from and shift_detect_arrive_to must be set")
    }

    // Departure window validation
    if plan.ShiftDetectDepartFrom != nil && plan.ShiftDetectDepartTo != nil {
        if *plan.ShiftDetectDepartFrom >= *plan.ShiftDetectDepartTo {
            errors = append(errors, "shift_detect_depart_from must be less than shift_detect_depart_to")
        }
        if *plan.ShiftDetectDepartFrom < 0 || *plan.ShiftDetectDepartTo > 1440 {
            errors = append(errors, "shift detection departure times must be between 0 and 1440")
        }
    } else if (plan.ShiftDetectDepartFrom != nil) != (plan.ShiftDetectDepartTo != nil) {
        errors = append(errors, "both shift_detect_depart_from and shift_detect_depart_to must be set")
    }

    return errors
}
```

## Unit Tests

```go
package calculation

import (
    "testing"

    "github.com/google/uuid"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"

    "terp/apps/api/internal/model"
)

type mockDayPlanLoader struct {
    plans map[uuid.UUID]*model.DayPlan
}

func (m *mockDayPlanLoader) GetByID(id uuid.UUID) (*model.DayPlan, error) {
    if plan, ok := m.plans[id]; ok {
        return plan, nil
    }
    return nil, nil
}

func TestShiftDetector_NoShiftDetection(t *testing.T) {
    loader := &mockDayPlanLoader{}
    detector := NewShiftDetector(loader)

    plan := &model.DayPlan{
        ID:   uuid.New(),
        Code: "NORMAL",
        // No shift detection configured
    }

    arrival := 480 // 08:00
    result := detector.DetectShift(plan, &arrival, nil)

    assert.Equal(t, plan.ID, result.MatchedPlanID)
    assert.True(t, result.IsOriginalPlan)
    assert.False(t, result.HasError)
}

func TestShiftDetector_ArrivalWindowMatch(t *testing.T) {
    loader := &mockDayPlanLoader{}
    detector := NewShiftDetector(loader)

    from := 360  // 06:00
    to := 540    // 09:00
    plan := &model.DayPlan{
        ID:                    uuid.New(),
        Code:                  "EARLY",
        ShiftDetectArriveFrom: &from,
        ShiftDetectArriveTo:   &to,
    }

    tests := []struct {
        name        string
        arrival     int
        shouldMatch bool
    }{
        {"within window", 420, true},    // 07:00
        {"at start", 360, true},         // 06:00
        {"at end", 540, true},           // 09:00
        {"before window", 300, false},   // 05:00
        {"after window", 600, false},    // 10:00
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := detector.DetectShift(plan, &tt.arrival, nil)
            if tt.shouldMatch {
                assert.True(t, result.IsOriginalPlan)
                assert.False(t, result.HasError)
            } else {
                assert.True(t, result.HasError)
                assert.Equal(t, "Kein passender Zeitplan gefunden", result.ErrorMessage)
            }
        })
    }
}

func TestShiftDetector_AlternativePlanMatch(t *testing.T) {
    earlyPlanID := uuid.New()
    latePlanID := uuid.New()

    earlyFrom := 360 // 06:00
    earlyTo := 480   // 08:00
    earlyPlan := &model.DayPlan{
        ID:                    earlyPlanID,
        Code:                  "EARLY",
        ShiftDetectArriveFrom: &earlyFrom,
        ShiftDetectArriveTo:   &earlyTo,
    }

    lateFrom := 720  // 12:00
    lateTo := 900    // 15:00
    latePlan := &model.DayPlan{
        ID:                    latePlanID,
        Code:                  "LATE",
        ShiftDetectArriveFrom: &lateFrom,
        ShiftDetectArriveTo:   &lateTo,
    }

    loader := &mockDayPlanLoader{
        plans: map[uuid.UUID]*model.DayPlan{
            earlyPlanID: earlyPlan,
            latePlanID:  latePlan,
        },
    }
    detector := NewShiftDetector(loader)

    // Main plan with alternatives
    mainFrom := 480 // 08:00
    mainTo := 600   // 10:00
    mainPlan := &model.DayPlan{
        ID:                    uuid.New(),
        Code:                  "MAIN",
        ShiftDetectArriveFrom: &mainFrom,
        ShiftDetectArriveTo:   &mainTo,
        ShiftAltPlan1:         &earlyPlanID,
        ShiftAltPlan2:         &latePlanID,
    }

    tests := []struct {
        name         string
        arrival      int
        expectedCode string
        isOriginal   bool
    }{
        {"matches main", 540, "MAIN", true},       // 09:00
        {"matches early", 420, "EARLY", false},    // 07:00
        {"matches late", 780, "LATE", false},      // 13:00
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := detector.DetectShift(mainPlan, &tt.arrival, nil)
            assert.Equal(t, tt.expectedCode, result.MatchedPlanCode)
            assert.Equal(t, tt.isOriginal, result.IsOriginalPlan)
            assert.False(t, result.HasError)
        })
    }
}

func TestShiftDetector_NoMatchFound(t *testing.T) {
    loader := &mockDayPlanLoader{}
    detector := NewShiftDetector(loader)

    from := 480 // 08:00
    to := 600   // 10:00
    plan := &model.DayPlan{
        ID:                    uuid.New(),
        Code:                  "MAIN",
        ShiftDetectArriveFrom: &from,
        ShiftDetectArriveTo:   &to,
    }

    arrival := 300 // 05:00 - before window, no alternatives
    result := detector.DetectShift(plan, &arrival, nil)

    assert.True(t, result.HasError)
    assert.Equal(t, "Kein passender Zeitplan gefunden", result.ErrorMessage)
    assert.True(t, result.IsOriginalPlan) // Falls back to original
}

func TestShiftDetector_BothWindowsRequired(t *testing.T) {
    loader := &mockDayPlanLoader{}
    detector := NewShiftDetector(loader)

    arrFrom := 360 // 06:00
    arrTo := 480   // 08:00
    depFrom := 840 // 14:00
    depTo := 1020  // 17:00

    plan := &model.DayPlan{
        ID:                    uuid.New(),
        Code:                  "FULLCHECK",
        ShiftDetectArriveFrom: &arrFrom,
        ShiftDetectArriveTo:   &arrTo,
        ShiftDetectDepartFrom: &depFrom,
        ShiftDetectDepartTo:   &depTo,
    }

    tests := []struct {
        name        string
        arrival     int
        departure   int
        shouldMatch bool
    }{
        {"both match", 420, 900, true},
        {"arrival only", 420, 600, false},
        {"departure only", 540, 900, false},
        {"neither match", 300, 600, false},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := detector.DetectShift(plan, &tt.arrival, &tt.departure)
            if tt.shouldMatch {
                assert.False(t, result.HasError)
                assert.Equal(t, ShiftMatchBoth, result.MatchedBy)
            } else {
                assert.True(t, result.HasError)
            }
        })
    }
}

func TestValidateShiftDetectionConfig(t *testing.T) {
    tests := []struct {
        name       string
        plan       *model.DayPlan
        errorCount int
    }{
        {
            name: "valid config",
            plan: &model.DayPlan{
                ShiftDetectArriveFrom: intPtr(360),
                ShiftDetectArriveTo:   intPtr(540),
            },
            errorCount: 0,
        },
        {
            name: "from >= to",
            plan: &model.DayPlan{
                ShiftDetectArriveFrom: intPtr(540),
                ShiftDetectArriveTo:   intPtr(360),
            },
            errorCount: 1,
        },
        {
            name: "only from set",
            plan: &model.DayPlan{
                ShiftDetectArriveFrom: intPtr(360),
            },
            errorCount: 1,
        },
        {
            name: "out of range",
            plan: &model.DayPlan{
                ShiftDetectArriveFrom: intPtr(-10),
                ShiftDetectArriveTo:   intPtr(1500),
            },
            errorCount: 1,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            errors := ValidateShiftDetectionConfig(tt.plan)
            assert.Len(t, errors, tt.errorCount)
        })
    }
}

func intPtr(i int) *int {
    return &i
}
```

## ZMI Compliance

| ZMI Feature | Implementation |
|-------------|----------------|
| Schichterkennung Kommen | Arrival window check |
| Schichterkennung Gehen | Departure window check |
| Alternative Tagespläne | Up to 6 alternative plans |
| Beide prüfen | Both windows required when configured |
| Error message | "Kein passender Zeitplan gefunden" |

## Acceptance Criteria

- [ ] Detects shift based on arrival time window
- [ ] Detects shift based on departure time window
- [ ] Supports both windows when configured
- [ ] Searches up to 6 alternative plans
- [ ] Returns error when no match found
- [ ] Falls back to original plan on error
- [ ] Config validation catches invalid windows
- [ ] All unit tests pass
- [ ] `make test` passes
