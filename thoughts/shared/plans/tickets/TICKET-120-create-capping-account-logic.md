# TICKET-120: Create Capping Account Logic

**Type**: Calculation
**Effort**: S
**Sprint**: 16 - Daily Calculation Service
**Dependencies**: TICKET-068, TICKET-126 (capping rules system)

## Integration Notes

> - **Destination account**: Capped time can be tracked in a dedicated capping account (Kappungskonto)
> - **Account posting**: Capped minutes should be posted to the capping account via account value service
> - **Capping rules**: TICKET-126 defines when year-end/mid-year capping occurs; this ticket handles daily capping

## Description

Implement the Kappungskonto (capping account) that tracks time cut off when an employee arrives before the evaluation window or exceeds maximum net work time.

## ZMI Reference

> "Das Kappungskonto zählt die Zeit, die dem/der Mitarbeiter/-in abgeschnitten wurde, wenn er/sie vor dem Bewertungsrahmen eines Tages kommt."

> "Beispiel: Im Tagesplan wurde bei Kommen von 07:00 Uhr eingestellt, der/die Mitarbeiter/-in kommt aber um 6:45 Uhr, dann stehen auf diesem Konto 15 Minuten."

> "Wenn im Feld Max. Netto-Arbeitszeit ein Wert eingetragen ist, z.B. 10 Stunden, ist die Tagessumme entsprechend begrenzt. Arbeitet der/die Mitarbeiter/-in länger, werden die Stunden, die über dem Wert liegen, gekappt."

## Files to Create

- `apps/api/internal/calculation/capping.go`
- `apps/api/internal/calculation/capping_test.go`

## Implementation

```go
package calculation

// CappingSource identifies where capped time came from
type CappingSource string

const (
    CappingSourceEarlyArrival CappingSource = "early_arrival"  // Before KommenVon
    CappingSourceLateLeave    CappingSource = "late_leave"     // After GehenBis
    CappingSourceMaxNetTime   CappingSource = "max_net_time"   // Exceeds MaxNetWorkTime
    CappingSourceTolerance    CappingSource = "tolerance"      // Outside tolerance window
)

// CappedTime represents time that was cut off from an employee's calculation
type CappedTime struct {
    Minutes int           `json:"minutes"`
    Source  CappingSource `json:"source"`
    Reason  string        `json:"reason"`
}

// CappingResult contains all capped time for a calculation
type CappingResult struct {
    Items      []CappedTime `json:"items"`
    TotalMinutes int        `json:"total_minutes"`
}

// CalculateEarlyArrivalCapping calculates time capped for arriving before window
// ZMI: Kappungskonto for early arrivals
func CalculateEarlyArrivalCapping(
    arrivalTime int,       // Actual arrival in minutes from midnight
    windowStart int,       // KommenVon in minutes from midnight
    toleranceMinus int,    // Toleranz Kommen - in minutes
    variableWorkTime bool, // variable Arbeitszeit flag
) *CappedTime {
    // Tolerance only applies if variable work time is enabled (for FAZ)
    // or always applies for GLZ
    effectiveStart := windowStart
    if toleranceMinus > 0 && variableWorkTime {
        effectiveStart = windowStart - toleranceMinus
    }

    // If arrival is before effective start, cap the difference
    if arrivalTime < effectiveStart {
        cappedMinutes := effectiveStart - arrivalTime
        return &CappedTime{
            Minutes: cappedMinutes,
            Source:  CappingSourceEarlyArrival,
            Reason:  "Arrived before evaluation window start",
        }
    }

    return nil
}

// CalculateLateLeaveCappping calculates time capped for leaving after window
// This is less common but may be needed for certain configurations
func CalculateLateLeaveCappping(
    departureTime int,     // Actual departure in minutes from midnight
    windowEnd int,         // GehenBis in minutes from midnight
    tolerancePlus int,     // Toleranz Gehen + in minutes
) *CappedTime {
    // Only cap if there's a hard window end configured
    // (Usually time after GehenBis is just counted normally until max net time)
    effectiveEnd := windowEnd + tolerancePlus

    if departureTime > effectiveEnd {
        cappedMinutes := departureTime - effectiveEnd
        return &CappedTime{
            Minutes: cappedMinutes,
            Source:  CappingSourceLateLeave,
            Reason:  "Left after evaluation window end",
        }
    }

    return nil
}

// CalculateMaxNetTimeCapping calculates time capped for exceeding daily maximum
// ZMI: Max. Netto-Arbeitszeit
func CalculateMaxNetTimeCapping(
    netWorkTime int,       // Calculated net work time
    maxNetWorkTime int,    // Maximum allowed (0 = unlimited)
) *CappedTime {
    if maxNetWorkTime <= 0 {
        return nil // No limit configured
    }

    if netWorkTime > maxNetWorkTime {
        cappedMinutes := netWorkTime - maxNetWorkTime
        return &CappedTime{
            Minutes: cappedMinutes,
            Source:  CappingSourceMaxNetTime,
            Reason:  "Exceeded maximum net work time",
        }
    }

    return nil
}

// AggregateCappping combines all capping calculations for a day
func AggregateCapping(items ...*CappedTime) CappingResult {
    result := CappingResult{
        Items: make([]CappedTime, 0),
    }

    for _, item := range items {
        if item != nil && item.Minutes > 0 {
            result.Items = append(result.Items, *item)
            result.TotalMinutes += item.Minutes
        }
    }

    return result
}

// ApplyCapping applies capping to net work time and returns adjusted value
func ApplyCapping(netWorkTime int, maxNetWorkTime int) (adjustedNetTime int, cappedMinutes int) {
    if maxNetWorkTime <= 0 || netWorkTime <= maxNetWorkTime {
        return netWorkTime, 0
    }

    return maxNetWorkTime, netWorkTime - maxNetWorkTime
}

// ApplyWindowCapping adjusts booking time to window boundaries
// Returns the adjusted time and any capped minutes
func ApplyWindowCapping(
    bookingTime int,
    windowStart int,
    windowEnd int,
    toleranceMinus int,
    tolerancePlus int,
    isArrival bool,
) (adjustedTime int, cappedMinutes int) {
    effectiveStart := windowStart - toleranceMinus
    effectiveEnd := windowEnd + tolerancePlus

    if isArrival {
        if bookingTime < effectiveStart {
            return effectiveStart, effectiveStart - bookingTime
        }
    } else {
        if bookingTime > effectiveEnd {
            return effectiveEnd, bookingTime - effectiveEnd
        }
    }

    return bookingTime, 0
}
```

## Unit Tests

```go
package calculation

import (
    "testing"

    "github.com/stretchr/testify/assert"
)

func TestCalculateEarlyArrivalCapping(t *testing.T) {
    tests := []struct {
        name            string
        arrivalTime     int
        windowStart     int
        toleranceMinus  int
        variableWorkTime bool
        expectedCapped  int
    }{
        {
            name:           "ZMI example - 15 min early",
            arrivalTime:    405, // 06:45
            windowStart:    420, // 07:00
            toleranceMinus: 0,
            variableWorkTime: false,
            expectedCapped: 15,
        },
        {
            name:           "exactly at window start",
            arrivalTime:    420,
            windowStart:    420,
            toleranceMinus: 0,
            variableWorkTime: false,
            expectedCapped: 0,
        },
        {
            name:           "within tolerance - variable work",
            arrivalTime:    400, // 06:40
            windowStart:    420, // 07:00
            toleranceMinus: 30,  // 30 min tolerance
            variableWorkTime: true,
            expectedCapped: 0,   // 06:40 is within 06:30-07:00
        },
        {
            name:           "before tolerance - variable work",
            arrivalTime:    360, // 06:00
            windowStart:    420, // 07:00
            toleranceMinus: 30,  // tolerance back to 06:30
            variableWorkTime: true,
            expectedCapped: 30,  // 06:30 - 06:00 = 30 min capped
        },
        {
            name:           "tolerance ignored without variable work",
            arrivalTime:    400, // 06:40
            windowStart:    420, // 07:00
            toleranceMinus: 30,
            variableWorkTime: false, // Tolerance doesn't apply
            expectedCapped: 20,      // 07:00 - 06:40 = 20 min capped
        },
        {
            name:           "late arrival - no capping",
            arrivalTime:    480, // 08:00
            windowStart:    420, // 07:00
            expectedCapped: 0,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := CalculateEarlyArrivalCapping(
                tt.arrivalTime,
                tt.windowStart,
                tt.toleranceMinus,
                tt.variableWorkTime,
            )

            if tt.expectedCapped == 0 {
                assert.Nil(t, result)
            } else {
                assert.NotNil(t, result)
                assert.Equal(t, tt.expectedCapped, result.Minutes)
                assert.Equal(t, CappingSourceEarlyArrival, result.Source)
            }
        })
    }
}

func TestCalculateMaxNetTimeCapping(t *testing.T) {
    tests := []struct {
        name           string
        netWorkTime    int
        maxNetWorkTime int
        expectedCapped int
    }{
        {
            name:           "under limit",
            netWorkTime:    480,  // 8 hours
            maxNetWorkTime: 600,  // 10 hours
            expectedCapped: 0,
        },
        {
            name:           "at limit",
            netWorkTime:    600,
            maxNetWorkTime: 600,
            expectedCapped: 0,
        },
        {
            name:           "over limit",
            netWorkTime:    660,  // 11 hours
            maxNetWorkTime: 600,  // 10 hours
            expectedCapped: 60,   // 1 hour capped
        },
        {
            name:           "no limit configured",
            netWorkTime:    720,  // 12 hours
            maxNetWorkTime: 0,    // No limit
            expectedCapped: 0,
        },
        {
            name:           "significantly over limit",
            netWorkTime:    780,  // 13 hours
            maxNetWorkTime: 600,  // 10 hours
            expectedCapped: 180,  // 3 hours capped
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := CalculateMaxNetTimeCapping(tt.netWorkTime, tt.maxNetWorkTime)

            if tt.expectedCapped == 0 {
                assert.Nil(t, result)
            } else {
                assert.NotNil(t, result)
                assert.Equal(t, tt.expectedCapped, result.Minutes)
                assert.Equal(t, CappingSourceMaxNetTime, result.Source)
            }
        })
    }
}

func TestAggregateCapping(t *testing.T) {
    early := &CappedTime{Minutes: 15, Source: CappingSourceEarlyArrival}
    maxNet := &CappedTime{Minutes: 60, Source: CappingSourceMaxNetTime}

    result := AggregateCapping(early, nil, maxNet)

    assert.Len(t, result.Items, 2)
    assert.Equal(t, 75, result.TotalMinutes)
}

func TestApplyCapping(t *testing.T) {
    tests := []struct {
        name          string
        netWorkTime   int
        maxNetTime    int
        expectedNet   int
        expectedCapped int
    }{
        {"under limit", 480, 600, 480, 0},
        {"over limit", 660, 600, 600, 60},
        {"no limit", 720, 0, 720, 0},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            adjustedNet, capped := ApplyCapping(tt.netWorkTime, tt.maxNetTime)
            assert.Equal(t, tt.expectedNet, adjustedNet)
            assert.Equal(t, tt.expectedCapped, capped)
        })
    }
}

func TestApplyWindowCapping(t *testing.T) {
    tests := []struct {
        name           string
        bookingTime    int
        windowStart    int
        windowEnd      int
        toleranceMinus int
        tolerancePlus  int
        isArrival      bool
        expectedTime   int
        expectedCapped int
    }{
        {
            name:           "early arrival capped",
            bookingTime:    360, // 06:00
            windowStart:    420, // 07:00
            windowEnd:      960, // 16:00
            toleranceMinus: 30,
            isArrival:      true,
            expectedTime:   390, // 06:30 (window - tolerance)
            expectedCapped: 30,
        },
        {
            name:           "late departure capped",
            bookingTime:    1020, // 17:00
            windowStart:    420,  // 07:00
            windowEnd:      960,  // 16:00
            tolerancePlus:  15,
            isArrival:      false,
            expectedTime:   975,  // 16:15 (window + tolerance)
            expectedCapped: 45,
        },
        {
            name:           "within window",
            bookingTime:    540, // 09:00
            windowStart:    420, // 07:00
            windowEnd:      960, // 16:00
            isArrival:      true,
            expectedTime:   540,
            expectedCapped: 0,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            adjustedTime, capped := ApplyWindowCapping(
                tt.bookingTime,
                tt.windowStart,
                tt.windowEnd,
                tt.toleranceMinus,
                tt.tolerancePlus,
                tt.isArrival,
            )
            assert.Equal(t, tt.expectedTime, adjustedTime)
            assert.Equal(t, tt.expectedCapped, capped)
        })
    }
}
```

## ZMI Compliance

| ZMI Feature | Implementation |
|-------------|----------------|
| Kappungskonto early arrival | `CalculateEarlyArrivalCapping()` |
| Max. Netto-Arbeitszeit | `CalculateMaxNetTimeCapping()` |
| variable Arbeitszeit flag | Enables Toleranz Kommen - for FAZ |
| Time tracking | `CappedTime` struct with source |

## Acceptance Criteria

- [ ] Calculates capped time for early arrivals
- [ ] Respects tolerance settings
- [ ] variable Arbeitszeit controls tolerance application
- [ ] Calculates capped time for exceeding max net work time
- [ ] Aggregates multiple capping sources
- [ ] Tracks capping source and reason
- [ ] All unit tests pass
- [ ] `make test` passes
