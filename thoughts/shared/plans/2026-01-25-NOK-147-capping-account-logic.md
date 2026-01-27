# Implementation Plan: NOK-147 - TICKET-120: Create Capping Account Logic

**Date**: 2026-01-25
**Ticket**: NOK-147
**Based on Research**: `thoughts/shared/research/2026-01-25-NOK-147-capping-account-logic.md`

---

## Overview

Implement capping account logic (Kappungskonto) that tracks time cut off when:
1. An employee arrives before the evaluation window start (minus tolerance if applicable)
2. An employee exceeds the maximum net work time

This follows ZMI specification where capped time is tracked separately from the reduced time calculation.

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/api/internal/calculation/capping.go` | Capping logic implementation |
| `apps/api/internal/calculation/capping_test.go` | Unit tests |

---

## Phase 1: Define Types

### 1.1 Add CappingSource Enum

**File**: `apps/api/internal/calculation/capping.go`

```go
package calculation

// CappingSource indicates the source of capped time.
type CappingSource string

const (
	// CappingSourceEarlyArrival means time was capped due to arrival before evaluation window.
	CappingSourceEarlyArrival CappingSource = "early_arrival"
	// CappingSourceLateLeave means time was capped due to departure after evaluation window.
	CappingSourceLateLeave CappingSource = "late_leave"
	// CappingSourceMaxNetTime means time was capped due to exceeding maximum net work time.
	CappingSourceMaxNetTime CappingSource = "max_net_time"
)
```

### 1.2 Add CappedTime Struct

```go
// CappedTime represents a single instance of time being capped.
type CappedTime struct {
	Minutes int           // Amount of time capped in minutes
	Source  CappingSource // Why the time was capped
	Reason  string        // Human-readable explanation
}
```

### 1.3 Add CappingResult Struct

```go
// CappingResult contains the aggregated capping information for a day.
type CappingResult struct {
	TotalCapped int          // Total minutes capped from all sources
	Items       []CappedTime // Individual capping items with details
}
```

### 1.4 Verification

- [ ] File compiles: `cd apps/api && go build ./internal/calculation/`
- [ ] Types are exported and accessible

---

## Phase 2: Implement Early Arrival Capping

### 2.1 CalculateEarlyArrivalCapping Function

**Purpose**: Determine if arrival time is before the evaluation window and calculate capped minutes.

**Logic**:
1. If `windowStart` (ComeFrom) is nil, no capping
2. Calculate effective window start:
   - If `variableWorkTime` is true: `effectiveStart = windowStart - toleranceMinus`
   - If `variableWorkTime` is false: `effectiveStart = windowStart`
3. If `arrivalTime < effectiveStart`: capped = effectiveStart - arrivalTime
4. Return CappedTime with source and reason

```go
// CalculateEarlyArrivalCapping determines if arrival is before the evaluation window.
// Returns nil if no capping occurred.
//
// Parameters:
//   - arrivalTime: Actual arrival time in minutes from midnight
//   - windowStart: Evaluation window start (ComeFrom) in minutes from midnight, nil if not set
//   - toleranceMinus: ToleranceComeMinus value in minutes
//   - variableWorkTime: Whether VariableWorkTime flag is set (extends window by tolerance)
func CalculateEarlyArrivalCapping(
	arrivalTime int,
	windowStart *int,
	toleranceMinus int,
	variableWorkTime bool,
) *CappedTime {
	if windowStart == nil {
		return nil
	}

	// Calculate effective window start
	effectiveStart := *windowStart
	if variableWorkTime && toleranceMinus > 0 {
		effectiveStart = *windowStart - toleranceMinus
	}

	// Check if arrival is before effective window start
	if arrivalTime < effectiveStart {
		cappedMinutes := effectiveStart - arrivalTime
		return &CappedTime{
			Minutes: cappedMinutes,
			Source:  CappingSourceEarlyArrival,
			Reason:  "Arrival before evaluation window",
		}
	}

	return nil
}
```

### 2.2 Test Cases for Early Arrival Capping

**File**: `apps/api/internal/calculation/capping_test.go`

```go
package calculation_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/tolga/terp/internal/calculation"
)

func TestCalculateEarlyArrivalCapping(t *testing.T) {
	tests := []struct {
		name             string
		arrivalTime      int
		windowStart      *int
		toleranceMinus   int
		variableWorkTime bool
		expectedCapped   *int // nil means no capping
	}{
		{
			name:           "nil window start - no capping",
			arrivalTime:    400,
			windowStart:    nil,
			toleranceMinus: 0,
			expectedCapped: nil,
		},
		{
			name:           "within window - no capping",
			arrivalTime:    420, // 07:00
			windowStart:    intPtr(420),
			toleranceMinus: 0,
			expectedCapped: nil,
		},
		{
			name:           "after window start - no capping",
			arrivalTime:    435, // 07:15
			windowStart:    intPtr(420),
			toleranceMinus: 0,
			expectedCapped: nil,
		},
		{
			name:             "before window, no tolerance - capped",
			arrivalTime:      405, // 06:45
			windowStart:      intPtr(420), // 07:00
			toleranceMinus:   0,
			variableWorkTime: false,
			expectedCapped:   intPtr(15),
		},
		{
			name:             "before window, tolerance applies (variable work time) - no capping",
			arrivalTime:      405, // 06:45
			windowStart:      intPtr(420), // 07:00
			toleranceMinus:   30,
			variableWorkTime: true,
			expectedCapped:   nil, // 06:45 >= 06:30 (07:00 - 30)
		},
		{
			name:             "before tolerance window (variable work time) - capped",
			arrivalTime:      375, // 06:15
			windowStart:      intPtr(420), // 07:00
			toleranceMinus:   30,
			variableWorkTime: true,
			expectedCapped:   intPtr(15), // 06:15 to 06:30 = 15 min capped
		},
		{
			name:             "before window, tolerance NOT applied (fixed work time) - capped",
			arrivalTime:      405, // 06:45
			windowStart:      intPtr(420), // 07:00
			toleranceMinus:   30,
			variableWorkTime: false,
			expectedCapped:   intPtr(15), // tolerance ignored when not variable
		},
		{
			name:             "exactly at effective window start - no capping",
			arrivalTime:      390, // 06:30
			windowStart:      intPtr(420), // 07:00
			toleranceMinus:   30,
			variableWorkTime: true,
			expectedCapped:   nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.CalculateEarlyArrivalCapping(
				tt.arrivalTime,
				tt.windowStart,
				tt.toleranceMinus,
				tt.variableWorkTime,
			)

			if tt.expectedCapped == nil {
				assert.Nil(t, result)
			} else {
				assert.NotNil(t, result)
				assert.Equal(t, *tt.expectedCapped, result.Minutes)
				assert.Equal(t, calculation.CappingSourceEarlyArrival, result.Source)
			}
		})
	}
}

func intPtr(v int) *int {
	return &v
}
```

### 2.3 Verification

- [ ] Tests pass: `cd apps/api && go test -v -run TestCalculateEarlyArrivalCapping ./internal/calculation/`

---

## Phase 3: Implement Late Departure Capping

### 3.1 CalculateLateDepatureCapping Function

**Purpose**: Determine if departure time is after the evaluation window end and calculate capped minutes.

```go
// CalculateLateDepatureCapping determines if departure is after the evaluation window.
// Returns nil if no capping occurred.
//
// Parameters:
//   - departureTime: Actual departure time in minutes from midnight
//   - windowEnd: Evaluation window end (GoTo) in minutes from midnight, nil if not set
//   - tolerancePlus: ToleranceGoPlus value in minutes (extends window after end)
func CalculateLateDepatureCapping(
	departureTime int,
	windowEnd *int,
	tolerancePlus int,
) *CappedTime {
	if windowEnd == nil {
		return nil
	}

	// Calculate effective window end
	effectiveEnd := *windowEnd + tolerancePlus

	// Check if departure is after effective window end
	if departureTime > effectiveEnd {
		cappedMinutes := departureTime - effectiveEnd
		return &CappedTime{
			Minutes: cappedMinutes,
			Source:  CappingSourceLateLeave,
			Reason:  "Departure after evaluation window",
		}
	}

	return nil
}
```

### 3.2 Test Cases for Late Departure Capping

```go
func TestCalculateLateDepatureCapping(t *testing.T) {
	tests := []struct {
		name           string
		departureTime  int
		windowEnd      *int
		tolerancePlus  int
		expectedCapped *int
	}{
		{
			name:           "nil window end - no capping",
			departureTime:  1080, // 18:00
			windowEnd:      nil,
			tolerancePlus:  0,
			expectedCapped: nil,
		},
		{
			name:           "within window - no capping",
			departureTime:  1020, // 17:00
			windowEnd:      intPtr(1020),
			tolerancePlus:  0,
			expectedCapped: nil,
		},
		{
			name:           "before window end - no capping",
			departureTime:  1000, // 16:40
			windowEnd:      intPtr(1020),
			tolerancePlus:  0,
			expectedCapped: nil,
		},
		{
			name:           "after window end, no tolerance - capped",
			departureTime:  1050, // 17:30
			windowEnd:      intPtr(1020), // 17:00
			tolerancePlus:  0,
			expectedCapped: intPtr(30),
		},
		{
			name:           "after window, within tolerance - no capping",
			departureTime:  1035, // 17:15
			windowEnd:      intPtr(1020), // 17:00
			tolerancePlus:  30,
			expectedCapped: nil,
		},
		{
			name:           "after tolerance window - capped",
			departureTime:  1065, // 17:45
			windowEnd:      intPtr(1020), // 17:00
			tolerancePlus:  30,
			expectedCapped: intPtr(15), // 17:45 - 17:30 = 15 min capped
		},
		{
			name:           "exactly at effective window end - no capping",
			departureTime:  1050, // 17:30
			windowEnd:      intPtr(1020), // 17:00
			tolerancePlus:  30,
			expectedCapped: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.CalculateLateDepatureCapping(
				tt.departureTime,
				tt.windowEnd,
				tt.tolerancePlus,
			)

			if tt.expectedCapped == nil {
				assert.Nil(t, result)
			} else {
				assert.NotNil(t, result)
				assert.Equal(t, *tt.expectedCapped, result.Minutes)
				assert.Equal(t, calculation.CappingSourceLateLeave, result.Source)
			}
		})
	}
}
```

### 3.3 Verification

- [ ] Tests pass: `cd apps/api && go test -v -run TestCalculateLateDepatureCapping ./internal/calculation/`

---

## Phase 4: Implement Max Net Time Capping

### 4.1 CalculateMaxNetTimeCapping Function

**Purpose**: Calculate capped time when net work time exceeds maximum.

```go
// CalculateMaxNetTimeCapping determines if net time exceeds the maximum.
// Returns nil if no capping occurred or maxNetWorkTime is nil.
//
// Parameters:
//   - netWorkTime: Calculated net work time in minutes
//   - maxNetWorkTime: Maximum allowed net work time in minutes, nil if not set
func CalculateMaxNetTimeCapping(netWorkTime int, maxNetWorkTime *int) *CappedTime {
	if maxNetWorkTime == nil {
		return nil
	}

	if netWorkTime > *maxNetWorkTime {
		cappedMinutes := netWorkTime - *maxNetWorkTime
		return &CappedTime{
			Minutes: cappedMinutes,
			Source:  CappingSourceMaxNetTime,
			Reason:  "Exceeded maximum net work time",
		}
	}

	return nil
}
```

### 4.2 Test Cases for Max Net Time Capping

```go
func TestCalculateMaxNetTimeCapping(t *testing.T) {
	tests := []struct {
		name           string
		netWorkTime    int
		maxNetWorkTime *int
		expectedCapped *int
	}{
		{
			name:           "nil max - no capping",
			netWorkTime:    660,
			maxNetWorkTime: nil,
			expectedCapped: nil,
		},
		{
			name:           "under max - no capping",
			netWorkTime:    540, // 9 hours
			maxNetWorkTime: intPtr(600), // 10 hours
			expectedCapped: nil,
		},
		{
			name:           "at max - no capping",
			netWorkTime:    600, // 10 hours
			maxNetWorkTime: intPtr(600),
			expectedCapped: nil,
		},
		{
			name:           "over max - capped",
			netWorkTime:    660, // 11 hours
			maxNetWorkTime: intPtr(600), // 10 hours
			expectedCapped: intPtr(60), // 1 hour capped
		},
		{
			name:           "significantly over max - capped",
			netWorkTime:    720, // 12 hours
			maxNetWorkTime: intPtr(480), // 8 hours
			expectedCapped: intPtr(240), // 4 hours capped
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.CalculateMaxNetTimeCapping(tt.netWorkTime, tt.maxNetWorkTime)

			if tt.expectedCapped == nil {
				assert.Nil(t, result)
			} else {
				assert.NotNil(t, result)
				assert.Equal(t, *tt.expectedCapped, result.Minutes)
				assert.Equal(t, calculation.CappingSourceMaxNetTime, result.Source)
			}
		})
	}
}
```

### 4.3 Verification

- [ ] Tests pass: `cd apps/api && go test -v -run TestCalculateMaxNetTimeCapping ./internal/calculation/`

---

## Phase 5: Implement Aggregation Functions

### 5.1 AggregateCapping Function

**Purpose**: Combine multiple capping results into a single CappingResult.

```go
// AggregateCapping combines multiple capped time items into a single result.
// Nil items are ignored.
func AggregateCapping(items ...*CappedTime) CappingResult {
	result := CappingResult{
		Items: make([]CappedTime, 0),
	}

	for _, item := range items {
		if item != nil && item.Minutes > 0 {
			result.Items = append(result.Items, *item)
			result.TotalCapped += item.Minutes
		}
	}

	return result
}
```

### 5.2 Test Cases for AggregateCapping

```go
func TestAggregateCapping(t *testing.T) {
	tests := []struct {
		name          string
		items         []*calculation.CappedTime
		expectedTotal int
		expectedCount int
	}{
		{
			name:          "no items",
			items:         []*calculation.CappedTime{},
			expectedTotal: 0,
			expectedCount: 0,
		},
		{
			name:          "all nil items",
			items:         []*calculation.CappedTime{nil, nil, nil},
			expectedTotal: 0,
			expectedCount: 0,
		},
		{
			name: "single item",
			items: []*calculation.CappedTime{
				{Minutes: 15, Source: calculation.CappingSourceEarlyArrival},
			},
			expectedTotal: 15,
			expectedCount: 1,
		},
		{
			name: "multiple items",
			items: []*calculation.CappedTime{
				{Minutes: 15, Source: calculation.CappingSourceEarlyArrival},
				{Minutes: 30, Source: calculation.CappingSourceMaxNetTime},
			},
			expectedTotal: 45,
			expectedCount: 2,
		},
		{
			name: "mixed nil and valid items",
			items: []*calculation.CappedTime{
				nil,
				{Minutes: 20, Source: calculation.CappingSourceEarlyArrival},
				nil,
				{Minutes: 10, Source: calculation.CappingSourceLateLeave},
			},
			expectedTotal: 30,
			expectedCount: 2,
		},
		{
			name: "zero minutes item - ignored",
			items: []*calculation.CappedTime{
				{Minutes: 0, Source: calculation.CappingSourceEarlyArrival},
				{Minutes: 15, Source: calculation.CappingSourceMaxNetTime},
			},
			expectedTotal: 15,
			expectedCount: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.AggregateCapping(tt.items...)
			assert.Equal(t, tt.expectedTotal, result.TotalCapped)
			assert.Len(t, result.Items, tt.expectedCount)
		})
	}
}
```

### 5.3 Verification

- [ ] Tests pass: `cd apps/api && go test -v -run TestAggregateCapping ./internal/calculation/`

---

## Phase 6: Implement Convenience Functions

### 6.1 ApplyCapping Function

**Purpose**: Apply max net time capping and return both adjusted value and capped amount.

```go
// ApplyCapping applies max net work time capping and returns the adjusted net time.
// This is a convenience wrapper that also returns the capped amount.
//
// Parameters:
//   - netWorkTime: Calculated net work time in minutes
//   - maxNetWorkTime: Maximum allowed net work time in minutes, nil if not set
//
// Returns:
//   - adjustedNet: The net time after capping (may be unchanged if no cap)
//   - capped: The amount of time that was capped (0 if no capping)
func ApplyCapping(netWorkTime int, maxNetWorkTime *int) (adjustedNet, capped int) {
	if maxNetWorkTime == nil {
		return netWorkTime, 0
	}

	if netWorkTime > *maxNetWorkTime {
		return *maxNetWorkTime, netWorkTime - *maxNetWorkTime
	}

	return netWorkTime, 0
}
```

### 6.2 ApplyWindowCapping Function

**Purpose**: Apply time window capping to a booking time and return adjusted time plus capped amount.

```go
// ApplyWindowCapping adjusts a booking time to fit within the evaluation window.
// Returns the adjusted time and the amount of time that was capped.
//
// Parameters:
//   - bookingTime: Actual booking time in minutes from midnight
//   - windowStart: Window start in minutes from midnight (nil = no start constraint)
//   - windowEnd: Window end in minutes from midnight (nil = no end constraint)
//   - toleranceMinus: Tolerance before window start (only applied if variableWorkTime for arrivals)
//   - tolerancePlus: Tolerance after window end
//   - isArrival: True if this is an arrival booking, false for departure
//   - variableWorkTime: Whether VariableWorkTime flag is set (for arrival tolerance)
//
// Returns:
//   - adjustedTime: The booking time after window capping
//   - capped: The amount of time that was capped (0 if no capping)
func ApplyWindowCapping(
	bookingTime int,
	windowStart *int,
	windowEnd *int,
	toleranceMinus int,
	tolerancePlus int,
	isArrival bool,
	variableWorkTime bool,
) (adjustedTime, capped int) {
	adjustedTime = bookingTime

	if isArrival && windowStart != nil {
		// Calculate effective window start
		effectiveStart := *windowStart
		if variableWorkTime && toleranceMinus > 0 {
			effectiveStart = *windowStart - toleranceMinus
		}

		// Cap early arrivals
		if bookingTime < effectiveStart {
			capped = effectiveStart - bookingTime
			adjustedTime = effectiveStart
		}
	}

	if !isArrival && windowEnd != nil {
		// Calculate effective window end
		effectiveEnd := *windowEnd + tolerancePlus

		// Cap late departures
		if bookingTime > effectiveEnd {
			capped = bookingTime - effectiveEnd
			adjustedTime = effectiveEnd
		}
	}

	return adjustedTime, capped
}
```

### 6.3 Test Cases for Convenience Functions

```go
func TestApplyCapping(t *testing.T) {
	tests := []struct {
		name           string
		netWorkTime    int
		maxNetWorkTime *int
		expectedNet    int
		expectedCapped int
	}{
		{
			name:           "nil max",
			netWorkTime:    600,
			maxNetWorkTime: nil,
			expectedNet:    600,
			expectedCapped: 0,
		},
		{
			name:           "under max",
			netWorkTime:    540,
			maxNetWorkTime: intPtr(600),
			expectedNet:    540,
			expectedCapped: 0,
		},
		{
			name:           "at max",
			netWorkTime:    600,
			maxNetWorkTime: intPtr(600),
			expectedNet:    600,
			expectedCapped: 0,
		},
		{
			name:           "over max",
			netWorkTime:    660,
			maxNetWorkTime: intPtr(600),
			expectedNet:    600,
			expectedCapped: 60,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			adjustedNet, capped := calculation.ApplyCapping(tt.netWorkTime, tt.maxNetWorkTime)
			assert.Equal(t, tt.expectedNet, adjustedNet)
			assert.Equal(t, tt.expectedCapped, capped)
		})
	}
}

func TestApplyWindowCapping(t *testing.T) {
	tests := []struct {
		name             string
		bookingTime      int
		windowStart      *int
		windowEnd        *int
		toleranceMinus   int
		tolerancePlus    int
		isArrival        bool
		variableWorkTime bool
		expectedTime     int
		expectedCapped   int
	}{
		{
			name:           "arrival within window",
			bookingTime:    450,
			windowStart:    intPtr(420),
			windowEnd:      nil,
			isArrival:      true,
			expectedTime:   450,
			expectedCapped: 0,
		},
		{
			name:             "arrival before window, no tolerance",
			bookingTime:      405,
			windowStart:      intPtr(420),
			windowEnd:        nil,
			toleranceMinus:   0,
			isArrival:        true,
			variableWorkTime: false,
			expectedTime:     420,
			expectedCapped:   15,
		},
		{
			name:             "arrival before window, with tolerance (variable)",
			bookingTime:      405,
			windowStart:      intPtr(420),
			windowEnd:        nil,
			toleranceMinus:   30,
			isArrival:        true,
			variableWorkTime: true,
			expectedTime:     405, // within tolerance window
			expectedCapped:   0,
		},
		{
			name:             "arrival before tolerance window (variable)",
			bookingTime:      375,
			windowStart:      intPtr(420),
			windowEnd:        nil,
			toleranceMinus:   30,
			isArrival:        true,
			variableWorkTime: true,
			expectedTime:     390, // adjusted to tolerance window start
			expectedCapped:   15,
		},
		{
			name:           "departure within window",
			bookingTime:    1000,
			windowStart:    nil,
			windowEnd:      intPtr(1020),
			isArrival:      false,
			expectedTime:   1000,
			expectedCapped: 0,
		},
		{
			name:           "departure after window, no tolerance",
			bookingTime:    1050,
			windowStart:    nil,
			windowEnd:      intPtr(1020),
			tolerancePlus:  0,
			isArrival:      false,
			expectedTime:   1020,
			expectedCapped: 30,
		},
		{
			name:           "departure after window, within tolerance",
			bookingTime:    1035,
			windowStart:    nil,
			windowEnd:      intPtr(1020),
			tolerancePlus:  30,
			isArrival:      false,
			expectedTime:   1035,
			expectedCapped: 0,
		},
		{
			name:           "departure after tolerance window",
			bookingTime:    1065,
			windowStart:    nil,
			windowEnd:      intPtr(1020),
			tolerancePlus:  30,
			isArrival:      false,
			expectedTime:   1050,
			expectedCapped: 15,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			adjustedTime, capped := calculation.ApplyWindowCapping(
				tt.bookingTime,
				tt.windowStart,
				tt.windowEnd,
				tt.toleranceMinus,
				tt.tolerancePlus,
				tt.isArrival,
				tt.variableWorkTime,
			)
			assert.Equal(t, tt.expectedTime, adjustedTime)
			assert.Equal(t, tt.expectedCapped, capped)
		})
	}
}
```

### 6.4 Verification

- [ ] Tests pass: `cd apps/api && go test -v -run TestApplyCapping ./internal/calculation/`
- [ ] Tests pass: `cd apps/api && go test -v -run TestApplyWindowCapping ./internal/calculation/`

---

## Phase 7: Update CalculationResult and DayPlanInput

### 7.1 Add VariableWorkTime to DayPlanInput

**File**: `apps/api/internal/calculation/types.go`

Add to `DayPlanInput` struct:

```go
type DayPlanInput struct {
	// ... existing fields ...

	// VariableWorkTime enables tolerance_come_minus for evaluation window
	// ZMI: variable Arbeitszeit
	VariableWorkTime bool
}
```

### 7.2 Add Capping Fields to CalculationResult

**File**: `apps/api/internal/calculation/types.go`

Add to `CalculationResult` struct:

```go
type CalculationResult struct {
	// ... existing fields ...

	// Capping results
	CappedTime int           // Total minutes capped
	Capping    CappingResult // Detailed capping breakdown
}
```

### 7.3 Verification

- [ ] File compiles: `cd apps/api && go build ./internal/calculation/`
- [ ] Existing tests still pass: `cd apps/api && go test ./internal/calculation/...`

---

## Phase 8: Integration with Calculator

### 8.1 Update Calculator.Calculate Method

**File**: `apps/api/internal/calculation/calculator.go`

The integration point is after net time calculation (Step 8). We need to:
1. Calculate window capping for early arrival (if FirstCome is before ComeFrom)
2. Calculate max net time capping (already happens in CalculateNetTime, but we need to track it)
3. Aggregate capping results

**Proposed changes**:

After Step 8 (Calculate net time), add:

```go
// Step 8a: Calculate capping
cappingItems := make([]*CappedTime, 0)

// Early arrival capping
if result.FirstCome != nil {
	earlyArrivalCap := CalculateEarlyArrivalCapping(
		*result.FirstCome,
		dayPlan.ComeFrom,
		dayPlan.Tolerance.ComeMinus,
		dayPlan.VariableWorkTime,
	)
	cappingItems = append(cappingItems, earlyArrivalCap)
}

// Late departure capping
if result.LastGo != nil {
	lateDepatureCap := CalculateLateDepatureCapping(
		*result.LastGo,
		dayPlan.GoTo,
		dayPlan.Tolerance.GoPlus,
	)
	cappingItems = append(cappingItems, lateDepatureCap)
}

// Max net time capping (calculate from pre-capped net time)
// Note: CalculateNetTime already caps the value, we need to track the amount
if input.DayPlan.MaxNetWorkTime != nil && grossNetTime > *input.DayPlan.MaxNetWorkTime {
	// grossNetTime is gross - break, before max cap
	maxNetCap := CalculateMaxNetTimeCapping(grossNetTime, input.DayPlan.MaxNetWorkTime)
	cappingItems = append(cappingItems, maxNetCap)
}

// Aggregate capping results
result.Capping = AggregateCapping(cappingItems...)
result.CappedTime = result.Capping.TotalCapped
```

### 8.2 Refactor Net Time Calculation for Capping Tracking

To properly track max net time capping, we need access to the pre-capped net time. This requires a small refactor.

**Option A**: Calculate net time in two steps:
1. First calculate uncapped: `uncappedNet := grossTime - breakTime`
2. Then apply cap and track: `netTime, maxCapped := ApplyCapping(uncappedNet, maxNetWorkTime)`

This is cleaner and the preferred approach.

**Updated Step 8 in Calculator**:

```go
// Step 8: Calculate net time
uncappedNet := result.GrossTime - result.BreakTime
if uncappedNet < 0 {
	uncappedNet = 0
}

// Apply max net time cap
result.NetTime, _ = ApplyCapping(uncappedNet, input.DayPlan.MaxNetWorkTime)
if result.NetTime != uncappedNet {
	result.Warnings = append(result.Warnings, WarnCodeMaxTimeReached)
}

// Step 8a: Calculate and aggregate capping
cappingItems := make([]*CappedTime, 0)

// Early arrival capping
if result.FirstCome != nil {
	earlyArrivalCap := CalculateEarlyArrivalCapping(
		*result.FirstCome,
		input.DayPlan.ComeFrom,
		input.DayPlan.Tolerance.ComeMinus,
		input.DayPlan.VariableWorkTime,
	)
	cappingItems = append(cappingItems, earlyArrivalCap)
}

// Late departure capping
if result.LastGo != nil {
	lateDepatureCap := CalculateLateDepatureCapping(
		*result.LastGo,
		input.DayPlan.GoTo,
		input.DayPlan.Tolerance.GoPlus,
	)
	cappingItems = append(cappingItems, lateDepatureCap)
}

// Max net time capping
maxNetCap := CalculateMaxNetTimeCapping(uncappedNet, input.DayPlan.MaxNetWorkTime)
cappingItems = append(cappingItems, maxNetCap)

// Aggregate
result.Capping = AggregateCapping(cappingItems...)
result.CappedTime = result.Capping.TotalCapped
```

### 8.3 Verification

- [ ] Calculator compiles: `cd apps/api && go build ./internal/calculation/`
- [ ] All calculation tests pass: `cd apps/api && go test ./internal/calculation/...`

---

## Phase 9: Integration Tests

### 9.1 Calculator Integration Tests

**File**: `apps/api/internal/calculation/capping_test.go`

Add integration tests that verify capping works correctly within the full Calculator flow.

```go
func TestCalculator_WithCapping(t *testing.T) {
	tests := []struct {
		name           string
		bookings       []calculation.BookingInput
		dayPlan        calculation.DayPlanInput
		expectedCapped int
		expectedItems  int
	}{
		{
			name: "no capping - normal day",
			bookings: []calculation.BookingInput{
				{ID: uuid.New(), Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
				{ID: uuid.New(), Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
			},
			dayPlan: calculation.DayPlanInput{
				ComeFrom:     intPtr(420),
				ComeTo:       intPtr(540),
				GoFrom:       intPtr(960),
				GoTo:         intPtr(1080),
				RegularHours: 480,
			},
			expectedCapped: 0,
			expectedItems:  0,
		},
		{
			name: "early arrival capping",
			bookings: []calculation.BookingInput{
				{ID: uuid.New(), Time: 405, Direction: calculation.DirectionIn, Category: calculation.CategoryWork}, // 06:45
				{ID: uuid.New(), Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
			},
			dayPlan: calculation.DayPlanInput{
				ComeFrom:     intPtr(420), // 07:00
				ComeTo:       intPtr(540),
				RegularHours: 480,
			},
			expectedCapped: 15,
			expectedItems:  1,
		},
		{
			name: "max net time capping",
			bookings: []calculation.BookingInput{
				{ID: uuid.New(), Time: 420, Direction: calculation.DirectionIn, Category: calculation.CategoryWork}, // 07:00
				{ID: uuid.New(), Time: 1140, Direction: calculation.DirectionOut, Category: calculation.CategoryWork}, // 19:00 (12h gross)
			},
			dayPlan: calculation.DayPlanInput{
				ComeFrom:       intPtr(420),
				GoTo:           intPtr(1200),
				RegularHours:   480,
				MaxNetWorkTime: intPtr(600), // 10h max
			},
			expectedCapped: 120, // 12h - 10h = 2h capped
			expectedItems:  1,
		},
		{
			name: "multiple capping sources",
			bookings: []calculation.BookingInput{
				{ID: uuid.New(), Time: 405, Direction: calculation.DirectionIn, Category: calculation.CategoryWork}, // 06:45 (early)
				{ID: uuid.New(), Time: 1200, Direction: calculation.DirectionOut, Category: calculation.CategoryWork}, // 20:00 (late)
			},
			dayPlan: calculation.DayPlanInput{
				ComeFrom:       intPtr(420), // 07:00
				GoTo:           intPtr(1140), // 19:00
				RegularHours:   480,
				MaxNetWorkTime: intPtr(600), // 10h max
			},
			expectedCapped: 15 + 60 + 75, // early + late + max (approx)
			expectedItems:  3,
		},
	}

	calc := calculation.NewCalculator()

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			input := calculation.CalculationInput{
				EmployeeID: uuid.New(),
				Bookings:   tt.bookings,
				DayPlan:    tt.dayPlan,
			}

			result := calc.Calculate(input)

			assert.Equal(t, tt.expectedCapped, result.CappedTime)
			assert.Len(t, result.Capping.Items, tt.expectedItems)
		})
	}
}
```

### 9.2 Verification

- [ ] Integration tests pass: `cd apps/api && go test -v -run TestCalculator_WithCapping ./internal/calculation/`

---

## Phase 10: Final Verification

### 10.1 Run Full Test Suite

```bash
cd apps/api && go test ./internal/calculation/...
```

### 10.2 Run make test

```bash
make test
```

### 10.3 Run make lint

```bash
make lint
```

### 10.4 Checklist

- [ ] `apps/api/internal/calculation/capping.go` created
- [ ] `apps/api/internal/calculation/capping_test.go` created
- [ ] CappingSource enum defined with early_arrival, late_leave, max_net_time
- [ ] CappedTime struct with Minutes, Source, Reason
- [ ] CappingResult struct with TotalCapped, Items
- [ ] CalculateEarlyArrivalCapping function implemented and tested
- [ ] CalculateLateDepatureCapping function implemented and tested
- [ ] CalculateMaxNetTimeCapping function implemented and tested
- [ ] AggregateCapping function implemented and tested
- [ ] ApplyCapping convenience function implemented and tested
- [ ] ApplyWindowCapping convenience function implemented and tested
- [ ] DayPlanInput updated with VariableWorkTime field
- [ ] CalculationResult updated with CappedTime and Capping fields
- [ ] Calculator.Calculate integrates capping logic
- [ ] All unit tests pass
- [ ] `make test` passes
- [ ] `make lint` passes

---

## Implementation Notes

### Open Questions Resolved

1. **CappedTime Storage**: We will add `CappedTime int` and `Capping CappingResult` fields to CalculationResult. The DailyValue model will need a corresponding field in a future ticket.

2. **Late Departure**: Yes, late departure (after GoTo + tolerance) should also be tracked for completeness.

3. **Core Time Violation**: Capping does NOT trigger error codes. The existing validation in `validateTimeWindows` already handles EARLY_COME/LATE_GO errors. Capping is about tracking how much time was cut off, not marking violations.

4. **Monthly Aggregation**: Capped time can be aggregated at the monthly level in a future ticket when needed.

### Key Design Decisions

1. **Pure Functions**: All capping functions are pure (no side effects) for easy testing and reasoning.

2. **Nil Safety**: All functions handle nil pointers gracefully.

3. **VariableWorkTime**: Only affects arrival tolerance (ToleranceComeMinus), not departure tolerance. This matches ZMI specification where "variable Arbeitszeit" specifically enables the early arrival tolerance window.

4. **Tolerance vs Capping**: Tolerance normalizes times within the window (existing logic). Capping tracks what was cut off outside the extended window.

5. **Integration Point**: Capping is calculated after net time calculation since MaxNetWorkTime capping depends on the calculated net time.

---

## Estimated Implementation Time

| Phase | Estimated Time |
|-------|----------------|
| Phase 1: Define Types | 10 min |
| Phase 2: Early Arrival Capping | 20 min |
| Phase 3: Late Departure Capping | 15 min |
| Phase 4: Max Net Time Capping | 10 min |
| Phase 5: Aggregation Functions | 15 min |
| Phase 6: Convenience Functions | 20 min |
| Phase 7: Update Types | 10 min |
| Phase 8: Calculator Integration | 30 min |
| Phase 9: Integration Tests | 20 min |
| Phase 10: Final Verification | 10 min |
| **Total** | **~2.5 hours** |
