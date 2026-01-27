# TICKET-128: Complete Day Change Implementation

**Type**: Calculation
**Effort**: M
**Sprint**: 16 - Daily Calculation Service
**Dependencies**: TICKET-070, TICKET-118 (DayChangeBehavior fields)
**Priority**: HIGH (completes TICKET-070 TODO)

## Description

Implement all 4 `DayChangeBehavior` modes for handling work shifts that cross midnight. This is essential for night shifts and employees who work across day boundaries.

## ZMI Reference

> "Tageswechsel: Behandlung von Schichten die über Mitternacht gehen." (Section 8.4)

> "Optionen: Keine Behandlung, Am Kommt-Tag, Am Geht-Tag, Automatisch vervollständigen"

Four modes:
1. **none**: No special handling (work split naturally at midnight)
2. **at_arrival**: All time credited to the arrival day
3. **at_departure**: All time credited to the departure day
4. **auto_complete**: Split at midnight with synthetic bookings

## Files to Create

- `apps/api/internal/calculation/daychange.go`
- `apps/api/internal/calculation/daychange_test.go`

## Implementation

```go
package calculation

import (
    "time"

    "github.com/google/uuid"
)

// DayChangeBehavior defines how overnight work is handled
// ZMI: Tageswechsel
type DayChangeBehavior string

const (
    // DayChangeNone - No special handling, work naturally splits at midnight
    DayChangeNone DayChangeBehavior = "none"

    // DayChangeAtArrival - All time credited to arrival day
    // ZMI: Am Kommt-Tag
    DayChangeAtArrival DayChangeBehavior = "at_arrival"

    // DayChangeAtDeparture - All time credited to departure day
    // ZMI: Am Geht-Tag
    DayChangeAtDeparture DayChangeBehavior = "at_departure"

    // DayChangeAutoComplete - Split at midnight with synthetic bookings
    // ZMI: Automatisch vervollständigen
    DayChangeAutoComplete DayChangeBehavior = "auto_complete"
)

// CrossMidnightShift represents a work shift that crosses midnight
type CrossMidnightShift struct {
    ArrivalDay     time.Time
    ArrivalTime    int // Minutes from midnight on arrival day
    DepartureDay   time.Time
    DepartureTime  int // Minutes from midnight on departure day
    OriginalPairID *uuid.UUID
}

// DayChangeResult contains the result of day change processing
type DayChangeResult struct {
    Day1Bookings []SyntheticBooking
    Day2Bookings []SyntheticBooking
    CreditDay    time.Time // Which day gets credit
    TotalMinutes int
    Day1Minutes  int
    Day2Minutes  int
    WasSplit     bool
}

// SyntheticBooking represents an auto-generated booking for day change
type SyntheticBooking struct {
    Time      int // Minutes from midnight
    Direction BookingDirection
    IsSynthetic bool
    Reason    string
}

// ProcessDayChange handles cross-midnight shifts according to behavior
// ZMI: Tageswechsel
func ProcessDayChange(
    shift CrossMidnightShift,
    behavior DayChangeBehavior,
) DayChangeResult {
    result := DayChangeResult{
        Day1Bookings: make([]SyntheticBooking, 0),
        Day2Bookings: make([]SyntheticBooking, 0),
    }

    // Calculate total work time
    // Minutes from arrival to midnight + minutes from midnight to departure
    minutesToMidnight := 1440 - shift.ArrivalTime // Minutes until midnight on day 1
    result.Day1Minutes = minutesToMidnight
    result.Day2Minutes = shift.DepartureTime
    result.TotalMinutes = minutesToMidnight + shift.DepartureTime

    switch behavior {
    case DayChangeNone:
        // Natural split - each day gets its portion
        result.CreditDay = shift.ArrivalDay // Primary day is arrival
        result.WasSplit = false

        // Day 1: Original arrival, no synthetic departure (open-ended)
        result.Day1Bookings = append(result.Day1Bookings, SyntheticBooking{
            Time:      shift.ArrivalTime,
            Direction: BookingDirectionIn,
        })

        // Day 2: No synthetic arrival (open-start), original departure
        result.Day2Bookings = append(result.Day2Bookings, SyntheticBooking{
            Time:      shift.DepartureTime,
            Direction: BookingDirectionOut,
        })

    case DayChangeAtArrival:
        // All time credited to arrival day
        // ZMI: Am Kommt-Tag
        result.CreditDay = shift.ArrivalDay
        result.WasSplit = false

        // Day 1: Full work time (arrival to departure treated as same day)
        result.Day1Bookings = append(result.Day1Bookings, SyntheticBooking{
            Time:      shift.ArrivalTime,
            Direction: BookingDirectionIn,
        })
        // Synthetic departure at "extended" time (arrival + total work)
        result.Day1Bookings = append(result.Day1Bookings, SyntheticBooking{
            Time:        shift.ArrivalTime + result.TotalMinutes,
            Direction:   BookingDirectionOut,
            IsSynthetic: true,
            Reason:      "day_change_at_arrival",
        })

        // Day 2: No bookings (all credited to day 1)
        result.Day2Minutes = 0

    case DayChangeAtDeparture:
        // All time credited to departure day
        // ZMI: Am Geht-Tag
        result.CreditDay = shift.DepartureDay
        result.WasSplit = false

        // Day 1: No credit (all goes to day 2)
        result.Day1Minutes = 0

        // Day 2: Full work time (synthetic early arrival)
        result.Day2Bookings = append(result.Day2Bookings, SyntheticBooking{
            Time:        shift.DepartureTime - result.TotalMinutes,
            Direction:   BookingDirectionIn,
            IsSynthetic: true,
            Reason:      "day_change_at_departure",
        })
        result.Day2Bookings = append(result.Day2Bookings, SyntheticBooking{
            Time:      shift.DepartureTime,
            Direction: BookingDirectionOut,
        })

    case DayChangeAutoComplete:
        // Split at midnight with synthetic bookings
        // ZMI: Automatisch vervollständigen
        result.CreditDay = shift.ArrivalDay // Primary credit day
        result.WasSplit = true

        // Day 1: Original arrival + synthetic midnight departure
        result.Day1Bookings = append(result.Day1Bookings, SyntheticBooking{
            Time:      shift.ArrivalTime,
            Direction: BookingDirectionIn,
        })
        result.Day1Bookings = append(result.Day1Bookings, SyntheticBooking{
            Time:        1439, // 23:59 (just before midnight)
            Direction:   BookingDirectionOut,
            IsSynthetic: true,
            Reason:      "auto_complete_midnight_out",
        })

        // Day 2: Synthetic midnight arrival + original departure
        result.Day2Bookings = append(result.Day2Bookings, SyntheticBooking{
            Time:        0, // 00:00 (midnight)
            Direction:   BookingDirectionIn,
            IsSynthetic: true,
            Reason:      "auto_complete_midnight_in",
        })
        result.Day2Bookings = append(result.Day2Bookings, SyntheticBooking{
            Time:      shift.DepartureTime,
            Direction: BookingDirectionOut,
        })
    }

    return result
}

// DetectCrossMidnightShift checks if bookings indicate a cross-midnight shift
func DetectCrossMidnightShift(
    day1Bookings []BookingInput,
    day2Bookings []BookingInput,
    day1Date time.Time,
) *CrossMidnightShift {
    // Check if day 1 has unpaired arrival (no departure)
    var lastArrival *BookingInput
    for i := len(day1Bookings) - 1; i >= 0; i-- {
        if day1Bookings[i].Direction == BookingDirectionIn {
            if !hasMatchingDeparture(day1Bookings, day1Bookings[i].Time) {
                lastArrival = &day1Bookings[i]
                break
            }
        }
    }

    if lastArrival == nil {
        return nil // No unpaired arrival
    }

    // Check if day 2 has unpaired departure (no arrival)
    var firstDeparture *BookingInput
    for i := 0; i < len(day2Bookings); i++ {
        if day2Bookings[i].Direction == BookingDirectionOut {
            if !hasMatchingArrival(day2Bookings, day2Bookings[i].Time) {
                firstDeparture = &day2Bookings[i]
                break
            }
        }
    }

    if firstDeparture == nil {
        return nil // No unpaired departure
    }

    return &CrossMidnightShift{
        ArrivalDay:     day1Date,
        ArrivalTime:    lastArrival.Time,
        DepartureDay:   day1Date.AddDate(0, 0, 1),
        DepartureTime:  firstDeparture.Time,
        OriginalPairID: lastArrival.PairID,
    }
}

// hasMatchingDeparture checks if an arrival has a matching departure
func hasMatchingDeparture(bookings []BookingInput, arrivalTime int) bool {
    for _, b := range bookings {
        if b.Direction == BookingDirectionOut && b.Time > arrivalTime {
            return true
        }
    }
    return false
}

// hasMatchingArrival checks if a departure has a matching arrival
func hasMatchingArrival(bookings []BookingInput, departureTime int) bool {
    for _, b := range bookings {
        if b.Direction == BookingDirectionIn && b.Time < departureTime {
            return true
        }
    }
    return false
}

// AdjustBookingsForDayChange modifies bookings based on day change behavior
// This is the main entry point for the daily calculation service
func AdjustBookingsForDayChange(
    currentDayBookings []BookingInput,
    nextDayBookings []BookingInput,
    currentDate time.Time,
    behavior DayChangeBehavior,
) (adjustedCurrent []BookingInput, adjustedNext []BookingInput, warning string) {
    // Detect cross-midnight shift
    shift := DetectCrossMidnightShift(currentDayBookings, nextDayBookings, currentDate)
    if shift == nil {
        return currentDayBookings, nextDayBookings, ""
    }

    // Process according to behavior
    result := ProcessDayChange(*shift, behavior)

    // Convert result back to BookingInput
    adjustedCurrent = make([]BookingInput, 0, len(currentDayBookings))
    adjustedNext = make([]BookingInput, 0, len(nextDayBookings))

    // Add non-overnight bookings from current day
    for _, b := range currentDayBookings {
        if b.Time != shift.ArrivalTime || b.Direction != BookingDirectionIn {
            adjustedCurrent = append(adjustedCurrent, b)
        }
    }

    // Add processed day 1 bookings
    for _, sb := range result.Day1Bookings {
        adjustedCurrent = append(adjustedCurrent, BookingInput{
            Time:      sb.Time,
            Direction: sb.Direction,
            Category:  BookingCategoryWork,
        })
    }

    // Add non-overnight bookings from next day
    for _, b := range nextDayBookings {
        if b.Time != shift.DepartureTime || b.Direction != BookingDirectionOut {
            adjustedNext = append(adjustedNext, b)
        }
    }

    // Add processed day 2 bookings
    for _, sb := range result.Day2Bookings {
        adjustedNext = append(adjustedNext, BookingInput{
            Time:      sb.Time,
            Direction: sb.Direction,
            Category:  BookingCategoryWork,
        })
    }

    if result.WasSplit {
        warning = "DAY_CHANGE_AUTO_COMPLETE"
    }

    return adjustedCurrent, adjustedNext, warning
}
```

## Unit Tests

```go
package calculation

import (
    "testing"
    "time"

    "github.com/stretchr/testify/assert"
)

func TestProcessDayChange_None(t *testing.T) {
    shift := CrossMidnightShift{
        ArrivalDay:    time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC),
        ArrivalTime:   1320, // 22:00
        DepartureDay:  time.Date(2024, 1, 16, 0, 0, 0, 0, time.UTC),
        DepartureTime: 360, // 06:00
    }

    result := ProcessDayChange(shift, DayChangeNone)

    assert.Equal(t, 120, result.Day1Minutes)  // 22:00-00:00 = 120 min
    assert.Equal(t, 360, result.Day2Minutes)  // 00:00-06:00 = 360 min
    assert.Equal(t, 480, result.TotalMinutes) // 8 hours
    assert.False(t, result.WasSplit)
}

func TestProcessDayChange_AtArrival(t *testing.T) {
    shift := CrossMidnightShift{
        ArrivalDay:    time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC),
        ArrivalTime:   1320, // 22:00
        DepartureDay:  time.Date(2024, 1, 16, 0, 0, 0, 0, time.UTC),
        DepartureTime: 360, // 06:00
    }

    result := ProcessDayChange(shift, DayChangeAtArrival)

    // All time credited to day 1
    assert.Equal(t, shift.ArrivalDay, result.CreditDay)
    assert.Equal(t, 0, result.Day2Minutes) // Day 2 gets no credit

    // Day 1 should have synthetic departure
    assert.Len(t, result.Day1Bookings, 2)
    assert.Equal(t, 1320, result.Day1Bookings[0].Time) // Original arrival
    assert.Equal(t, 1800, result.Day1Bookings[1].Time) // 22:00 + 480 = 30:00 (1800)
    assert.True(t, result.Day1Bookings[1].IsSynthetic)
}

func TestProcessDayChange_AtDeparture(t *testing.T) {
    shift := CrossMidnightShift{
        ArrivalDay:    time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC),
        ArrivalTime:   1320, // 22:00
        DepartureDay:  time.Date(2024, 1, 16, 0, 0, 0, 0, time.UTC),
        DepartureTime: 360, // 06:00
    }

    result := ProcessDayChange(shift, DayChangeAtDeparture)

    // All time credited to day 2
    assert.Equal(t, shift.DepartureDay, result.CreditDay)
    assert.Equal(t, 0, result.Day1Minutes) // Day 1 gets no credit

    // Day 2 should have synthetic arrival
    assert.Len(t, result.Day2Bookings, 2)
    assert.Equal(t, -120, result.Day2Bookings[0].Time) // 06:00 - 480 = -02:00 (-120)
    assert.True(t, result.Day2Bookings[0].IsSynthetic)
    assert.Equal(t, 360, result.Day2Bookings[1].Time) // Original departure
}

func TestProcessDayChange_AutoComplete(t *testing.T) {
    shift := CrossMidnightShift{
        ArrivalDay:    time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC),
        ArrivalTime:   1320, // 22:00
        DepartureDay:  time.Date(2024, 1, 16, 0, 0, 0, 0, time.UTC),
        DepartureTime: 360, // 06:00
    }

    result := ProcessDayChange(shift, DayChangeAutoComplete)

    assert.True(t, result.WasSplit)
    assert.Equal(t, 120, result.Day1Minutes)
    assert.Equal(t, 360, result.Day2Minutes)

    // Day 1: arrival + synthetic midnight departure
    assert.Len(t, result.Day1Bookings, 2)
    assert.Equal(t, 1320, result.Day1Bookings[0].Time)     // 22:00
    assert.Equal(t, 1439, result.Day1Bookings[1].Time)     // 23:59
    assert.True(t, result.Day1Bookings[1].IsSynthetic)

    // Day 2: synthetic midnight arrival + departure
    assert.Len(t, result.Day2Bookings, 2)
    assert.Equal(t, 0, result.Day2Bookings[0].Time)        // 00:00
    assert.True(t, result.Day2Bookings[0].IsSynthetic)
    assert.Equal(t, 360, result.Day2Bookings[1].Time)      // 06:00
}

func TestDetectCrossMidnightShift(t *testing.T) {
    day1Date := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)

    tests := []struct {
        name         string
        day1Bookings []BookingInput
        day2Bookings []BookingInput
        expectShift  bool
        arrivalTime  int
        departTime   int
    }{
        {
            name: "cross midnight detected",
            day1Bookings: []BookingInput{
                {Time: 480, Direction: BookingDirectionIn},
                {Time: 720, Direction: BookingDirectionOut},
                {Time: 1320, Direction: BookingDirectionIn}, // Unpaired
            },
            day2Bookings: []BookingInput{
                {Time: 360, Direction: BookingDirectionOut}, // Unpaired
            },
            expectShift: true,
            arrivalTime: 1320,
            departTime:  360,
        },
        {
            name: "no cross midnight - all paired",
            day1Bookings: []BookingInput{
                {Time: 480, Direction: BookingDirectionIn},
                {Time: 960, Direction: BookingDirectionOut},
            },
            day2Bookings: []BookingInput{
                {Time: 480, Direction: BookingDirectionIn},
                {Time: 960, Direction: BookingDirectionOut},
            },
            expectShift: false,
        },
        {
            name: "no day2 bookings",
            day1Bookings: []BookingInput{
                {Time: 1320, Direction: BookingDirectionIn},
            },
            day2Bookings: []BookingInput{},
            expectShift:  false,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            shift := DetectCrossMidnightShift(tt.day1Bookings, tt.day2Bookings, day1Date)

            if tt.expectShift {
                assert.NotNil(t, shift)
                assert.Equal(t, tt.arrivalTime, shift.ArrivalTime)
                assert.Equal(t, tt.departTime, shift.DepartureTime)
            } else {
                assert.Nil(t, shift)
            }
        })
    }
}

func TestAdjustBookingsForDayChange(t *testing.T) {
    currentDate := time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC)

    currentBookings := []BookingInput{
        {Time: 1320, Direction: BookingDirectionIn, Category: BookingCategoryWork},
    }
    nextBookings := []BookingInput{
        {Time: 360, Direction: BookingDirectionOut, Category: BookingCategoryWork},
    }

    adjusted1, adjusted2, warning := AdjustBookingsForDayChange(
        currentBookings, nextBookings, currentDate, DayChangeAutoComplete,
    )

    assert.Equal(t, "DAY_CHANGE_AUTO_COMPLETE", warning)
    assert.Len(t, adjusted1, 2) // arrival + synthetic midnight out
    assert.Len(t, adjusted2, 2) // synthetic midnight in + departure
}
```

## Integration with TICKET-070

The daily calculation service should use `AdjustBookingsForDayChange` before calculating:

```go
// In daily_calc_service.go calculateWithBookings method
// Check for cross-midnight shift
if config.DayChangeBehavior != DayChangeNone {
    nextDayBookings, _ := s.bookingRepo.GetByEmployeeAndDate(ctx, tenantID, employeeID, date.AddDate(0, 0, 1))
    adjustedBookings, _, warning := calculation.AdjustBookingsForDayChange(
        bookings, nextDayBookings, date, config.DayChangeBehavior,
    )
    if warning != "" {
        output.Warnings = append(output.Warnings, warning)
    }
    bookings = adjustedBookings
}
```

## ZMI Compliance

| ZMI Feature | Implementation |
|-------------|----------------|
| Keine Behandlung | `DayChangeNone` |
| Am Kommt-Tag | `DayChangeAtArrival` |
| Am Geht-Tag | `DayChangeAtDeparture` |
| Automatisch vervollständigen | `DayChangeAutoComplete` |
| Synthetic bookings | `SyntheticBooking` with IsSynthetic flag |

## Acceptance Criteria

- [ ] All 4 behavior modes implemented
- [ ] Cross-midnight shift detection works
- [ ] Synthetic bookings created for auto_complete mode
- [ ] Time correctly attributed based on mode
- [ ] Warning generated when shift is split
- [ ] Integrates with daily calculation service
- [ ] All unit tests pass
- [ ] `make test` passes
