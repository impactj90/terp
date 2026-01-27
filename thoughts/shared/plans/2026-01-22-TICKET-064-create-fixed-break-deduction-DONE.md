# TICKET-064: Fixed Break Deduction Implementation Plan

## Overview

Implement complete break deduction logic according to ZMI specifications. This includes:
1. **Fixed breaks (Pause 1-3)**: Always deducted based on overlap with a time window, regardless of manual bookings
2. **Variable breaks (Pause 4)**: Only deducted if employee booked NO breaks that day
3. **Minimum breaks (Mindestpause)**: Deducted after work threshold, with optional proportional deduction via `MinutesDifference` flag

Currently, the `CalculateBreakDeduction` function doesn't properly distinguish between these break types and ignores the `StartTime`/`EndTime` fields on `BreakConfig`.

## Current State Analysis

### Existing Implementation
- `CalculateBreakDeduction(recordedBreakTime, grossWorkTime, breakConfigs)` in `breaks.go:11-55`
- `BreakConfig` has `StartTime` and `EndTime` fields (`*int`, minutes from midnight) but they are NOT used
- `calculateRequiredBreak()` treats Fixed, Variable, and Minimum breaks almost identically
- No `MinutesDifference` field exists for proportional minimum break deduction

### Key Discoveries
- `BreakConfig` struct already has: `StartTime`, `EndTime`, `Duration`, `AfterWorkMinutes` (`types.go:51-59`)
- `BookingPair` stores `*BookingInput` pointers where `BookingInput.Time` is minutes from midnight (`types.go:115-121`)
- The `intPtr()` helper is defined in `tolerance_test.go:172-174` for tests
- Test patterns use black-box testing (`package calculation_test`) with `testify/assert`

## Desired End State

After implementation:
1. `BreakConfig` has new `MinutesDifference` field for proportional minimum break deduction
2. Fixed breaks with `StartTime`/`EndTime` deduct based on work overlap (always, regardless of manual bookings)
3. Variable breaks only apply when `recordedBreakTime == 0`
4. Minimum breaks use `AfterWorkMinutes` threshold with optional proportional deduction

### ZMI Break Type Behaviors (from Manual section 3.4.4.3)

| Break Type | German | Behavior |
|------------|--------|----------|
| Fixed (Pause 1-3) | fest | ALWAYS deducted if work overlaps the time window (StartTime to EndTime). Ignores manual bookings. |
| Variable (Pause 4) | variabel | Only deducted if employee booked NO break that day (`recordedBreakTime == 0`) |
| Minimum | Mindestpause | Deducted when work exceeds `AfterWorkMinutes` threshold. If `MinutesDifference=true`, proportional deduction applies. |

### Verification
- All existing break tests continue to pass (backward compatibility)
- New tests verify each break type's distinct behavior
- `make test` passes
- `make lint` passes

## What We're NOT Doing

- NOT changing the `BreakDeductionResult` struct (existing `{DeductedMinutes, Warnings}` is sufficient)
- NOT changing the `BookingPair` struct (extract times from pointers inline)

## Implementation Approach

1. Add `MinutesDifference` field to `BreakConfig` in `types.go`
2. Add `CalculateOverlap()` helper function for time window overlap calculation
3. Add `DeductFixedBreak()` function that iterates through work pairs and calculates overlap
4. Add `calculateMinimumBreak()` function with proportional deduction logic
5. Rewrite `CalculateBreakDeduction` to dispatch by break type with correct logic
6. Update `calculator.go` call site to pass `result.Pairs`
7. Add comprehensive tests for all break types

---

## Phase 1: Add MinutesDifference Field to BreakConfig

### Overview
Add the `MinutesDifference` field to `BreakConfig` for proportional minimum break deduction.

### Changes Required:

#### 1. Update `BreakConfig` struct
**File**: `apps/api/internal/calculation/types.go`

Change from:
```go
type BreakConfig struct {
	Type             BreakType
	StartTime        *int // For fixed breaks: start time (minutes from midnight)
	EndTime          *int // For fixed breaks: end time (minutes from midnight)
	Duration         int  // Break duration in minutes
	AfterWorkMinutes *int // For variable/minimum: trigger after X work minutes
	AutoDeduct       bool // Automatically deduct from work time
	IsPaid           bool // Break counts toward regular hours
}
```

To:
```go
type BreakConfig struct {
	Type              BreakType
	StartTime         *int // For fixed breaks: window start (minutes from midnight)
	EndTime           *int // For fixed breaks: window end (minutes from midnight)
	Duration          int  // Break duration in minutes
	AfterWorkMinutes  *int // For minimum breaks: trigger threshold
	AutoDeduct        bool // Automatically deduct from work time
	IsPaid            bool // Break counts toward regular hours
	MinutesDifference bool // For minimum breaks: proportional deduction when near threshold
}
```

### Success Criteria:

#### Automated Verification:
- [x] Code compiles: `cd apps/api && go build ./...`
- [x] All existing tests pass: `make test`
- [x] Linting passes: `make lint`

---

## Phase 2: Add Helper Functions

### Overview
Add helper functions for overlap calculation and minimum break deduction.

### Changes Required:

#### 1. Add `CalculateOverlap` function
**File**: `apps/api/internal/calculation/breaks.go`
**Location**: After `calculateRequiredBreak` function (around line 98)

```go
// CalculateOverlap returns the overlap in minutes between two time ranges.
// Returns 0 if there is no overlap.
func CalculateOverlap(start1, end1, start2, end2 int) int {
	overlapStart := start1
	if start2 > overlapStart {
		overlapStart = start2
	}
	overlapEnd := end1
	if end2 < overlapEnd {
		overlapEnd = end2
	}
	if overlapEnd > overlapStart {
		return overlapEnd - overlapStart
	}
	return 0
}
```

#### 2. Add `DeductFixedBreak` function
**File**: `apps/api/internal/calculation/breaks.go`

```go
// DeductFixedBreak calculates the break deduction for a fixed break based on
// overlap with work periods. Fixed breaks are ALWAYS deducted if work overlaps
// the break window, regardless of manual bookings.
// Returns the minutes to deduct (capped at configured Duration).
func DeductFixedBreak(pairs []BookingPair, cfg BreakConfig) int {
	// Fixed breaks require StartTime and EndTime
	if cfg.StartTime == nil || cfg.EndTime == nil {
		return 0
	}

	breakStart := *cfg.StartTime
	breakEnd := *cfg.EndTime
	totalOverlap := 0

	for _, pair := range pairs {
		// Only consider work pairs
		if pair.Category != CategoryWork {
			continue
		}
		// Skip incomplete pairs
		if pair.InBooking == nil || pair.OutBooking == nil {
			continue
		}

		workStart := pair.InBooking.Time
		workEnd := pair.OutBooking.Time

		overlap := CalculateOverlap(workStart, workEnd, breakStart, breakEnd)
		totalOverlap += overlap
	}

	// Deduct the lesser of configured duration or actual overlap
	if totalOverlap > cfg.Duration {
		return cfg.Duration
	}
	return totalOverlap
}
```

#### 3. Add `calculateMinimumBreak` function
**File**: `apps/api/internal/calculation/breaks.go`

```go
// calculateMinimumBreak calculates the deduction for a minimum break.
// If MinutesDifference is true, applies proportional deduction based on
// how much work time exceeds the threshold.
// Example: 30min break after 5h threshold, employee works 5:10 -> only 10min deducted.
func calculateMinimumBreak(grossWorkTime int, cfg BreakConfig) int {
	if cfg.AfterWorkMinutes == nil {
		return 0
	}

	threshold := *cfg.AfterWorkMinutes
	if grossWorkTime < threshold {
		return 0
	}

	if cfg.MinutesDifference {
		// Proportional deduction: only deduct the overtime beyond threshold
		overtime := grossWorkTime - threshold
		if overtime >= cfg.Duration {
			return cfg.Duration
		}
		return overtime
	}

	// Full deduction when threshold is met
	return cfg.Duration
}
```

#### 4. Add tests for helper functions
**File**: `apps/api/internal/calculation/breaks_test.go`

```go
func TestCalculateOverlap(t *testing.T) {
	tests := []struct {
		name                       string
		start1, end1, start2, end2 int
		expected                   int
	}{
		{"full overlap - work spans break", 480, 1020, 720, 750, 30},
		{"partial overlap - early end", 480, 735, 720, 750, 15},
		{"partial overlap - late start", 730, 1020, 720, 750, 20},
		{"no overlap - work before break", 480, 700, 720, 750, 0},
		{"no overlap - work after break", 800, 1020, 720, 750, 0},
		{"exact match", 720, 750, 720, 750, 30},
		{"work inside break", 725, 740, 720, 750, 15},
		{"break inside work", 480, 1020, 720, 750, 30},
		{"adjacent - no overlap", 480, 720, 720, 750, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.CalculateOverlap(tt.start1, tt.end1, tt.start2, tt.end2)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestCalculateMinimumBreak(t *testing.T) {
	tests := []struct {
		name          string
		grossWorkTime int
		cfg           calculation.BreakConfig
		expected      int
	}{
		{
			name:          "below threshold - no deduction",
			grossWorkTime: 240, // 4 hours
			cfg: calculation.BreakConfig{
				Type:             calculation.BreakTypeMinimum,
				Duration:         30,
				AfterWorkMinutes: intPtr(300), // 5 hours
			},
			expected: 0,
		},
		{
			name:          "above threshold - full deduction",
			grossWorkTime: 360, // 6 hours
			cfg: calculation.BreakConfig{
				Type:             calculation.BreakTypeMinimum,
				Duration:         30,
				AfterWorkMinutes: intPtr(300), // 5 hours
			},
			expected: 30,
		},
		{
			name:          "exactly at threshold - full deduction",
			grossWorkTime: 300, // 5 hours
			cfg: calculation.BreakConfig{
				Type:             calculation.BreakTypeMinimum,
				Duration:         30,
				AfterWorkMinutes: intPtr(300), // 5 hours
			},
			expected: 30,
		},
		{
			name:          "MinutesDifference - proportional deduction",
			grossWorkTime: 310, // 5:10
			cfg: calculation.BreakConfig{
				Type:              calculation.BreakTypeMinimum,
				Duration:          30,
				AfterWorkMinutes:  intPtr(300), // 5 hours
				MinutesDifference: true,
			},
			expected: 10, // Only 10 minutes over threshold
		},
		{
			name:          "MinutesDifference - capped at duration",
			grossWorkTime: 360, // 6 hours
			cfg: calculation.BreakConfig{
				Type:              calculation.BreakTypeMinimum,
				Duration:          30,
				AfterWorkMinutes:  intPtr(300), // 5 hours
				MinutesDifference: true,
			},
			expected: 30, // Capped at Duration
		},
		{
			name:          "nil threshold - no deduction",
			grossWorkTime: 480,
			cfg: calculation.BreakConfig{
				Type:     calculation.BreakTypeMinimum,
				Duration: 30,
			},
			expected: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.CalculateMinimumBreak(tt.grossWorkTime, tt.cfg)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestDeductFixedBreak(t *testing.T) {
	tests := []struct {
		name     string
		pairs    []calculation.BookingPair
		cfg      calculation.BreakConfig
		expected int
	}{
		{
			name: "full overlap",
			pairs: []calculation.BookingPair{
				{
					InBooking:  &calculation.BookingInput{Time: 480},
					OutBooking: &calculation.BookingInput{Time: 1020},
					Category:   calculation.CategoryWork,
				},
			},
			cfg: calculation.BreakConfig{
				Type:      calculation.BreakTypeFixed,
				StartTime: intPtr(720),
				EndTime:   intPtr(750),
				Duration:  30,
			},
			expected: 30,
		},
		{
			name: "partial overlap",
			pairs: []calculation.BookingPair{
				{
					InBooking:  &calculation.BookingInput{Time: 480},
					OutBooking: &calculation.BookingInput{Time: 735},
					Category:   calculation.CategoryWork,
				},
			},
			cfg: calculation.BreakConfig{
				Type:      calculation.BreakTypeFixed,
				StartTime: intPtr(720),
				EndTime:   intPtr(750),
				Duration:  30,
			},
			expected: 15,
		},
		{
			name: "no overlap",
			pairs: []calculation.BookingPair{
				{
					InBooking:  &calculation.BookingInput{Time: 480},
					OutBooking: &calculation.BookingInput{Time: 690},
					Category:   calculation.CategoryWork,
				},
			},
			cfg: calculation.BreakConfig{
				Type:      calculation.BreakTypeFixed,
				StartTime: intPtr(720),
				EndTime:   intPtr(750),
				Duration:  30,
			},
			expected: 0,
		},
		{
			name: "break pairs ignored",
			pairs: []calculation.BookingPair{
				{
					InBooking:  &calculation.BookingInput{Time: 480},
					OutBooking: &calculation.BookingInput{Time: 1020},
					Category:   calculation.CategoryWork,
				},
				{
					InBooking:  &calculation.BookingInput{Time: 720},
					OutBooking: &calculation.BookingInput{Time: 750},
					Category:   calculation.CategoryBreak,
				},
			},
			cfg: calculation.BreakConfig{
				Type:      calculation.BreakTypeFixed,
				StartTime: intPtr(720),
				EndTime:   intPtr(750),
				Duration:  30,
			},
			expected: 30, // Only work pair considered
		},
		{
			name: "nil start time",
			pairs: []calculation.BookingPair{
				{
					InBooking:  &calculation.BookingInput{Time: 480},
					OutBooking: &calculation.BookingInput{Time: 1020},
					Category:   calculation.CategoryWork,
				},
			},
			cfg: calculation.BreakConfig{
				Type:     calculation.BreakTypeFixed,
				EndTime:  intPtr(750),
				Duration: 30,
			},
			expected: 0,
		},
		{
			name: "overlap exceeds duration - capped",
			pairs: []calculation.BookingPair{
				{
					InBooking:  &calculation.BookingInput{Time: 480},
					OutBooking: &calculation.BookingInput{Time: 1020},
					Category:   calculation.CategoryWork,
				},
			},
			cfg: calculation.BreakConfig{
				Type:      calculation.BreakTypeFixed,
				StartTime: intPtr(720),
				EndTime:   intPtr(780), // 60 min window
				Duration:  30,          // Only 30 min break
			},
			expected: 30, // Capped at Duration
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.DeductFixedBreak(tt.pairs, tt.cfg)
			assert.Equal(t, tt.expected, result)
		})
	}
}
```

### Success Criteria:

#### Automated Verification:
- [x] Tests pass: `cd apps/api && go test -v -run "TestCalculateOverlap|TestCalculateMinimumBreak|TestDeductFixedBreak" ./internal/calculation/...`
- [x] All existing tests pass: `make test`
- [x] Linting passes: `make lint`

---

## Phase 3: Rewrite CalculateBreakDeduction

### Overview
Rewrite `CalculateBreakDeduction` to properly dispatch by break type with correct ZMI logic.

### Changes Required:

#### 1. Update `CalculateBreakDeduction` signature and logic
**File**: `apps/api/internal/calculation/breaks.go`

Replace the entire function with:

```go
// CalculateBreakDeduction determines how much break time to deduct.
// It handles three break types differently per ZMI specification:
// - Fixed: ALWAYS deducted based on overlap with time window
// - Variable: Only deducted if no manual breaks recorded
// - Minimum: Deducted after work threshold, with optional proportional deduction
func CalculateBreakDeduction(
	pairs []BookingPair,
	recordedBreakTime int,
	grossWorkTime int,
	breakConfigs []BreakConfig,
) BreakDeductionResult {
	result := BreakDeductionResult{
		Warnings: make([]string, 0),
	}

	if len(breakConfigs) == 0 {
		// No break rules, use recorded breaks
		result.DeductedMinutes = recordedBreakTime
		return result
	}

	var totalDeduction int

	for _, cfg := range breakConfigs {
		switch cfg.Type {
		case BreakTypeFixed:
			// Fixed breaks: Overlap with time window, ALWAYS deducted
			// Ignores manual bookings per ZMI spec
			totalDeduction += DeductFixedBreak(pairs, cfg)

		case BreakTypeVariable:
			// Variable breaks: Only if no manual break was recorded
			if recordedBreakTime == 0 && cfg.AutoDeduct {
				if cfg.AfterWorkMinutes == nil || grossWorkTime >= *cfg.AfterWorkMinutes {
					totalDeduction += cfg.Duration
					result.Warnings = append(result.Warnings, WarnCodeAutoBreakApplied)
				}
			}

		case BreakTypeMinimum:
			// Minimum breaks: After threshold, with optional proportional deduction
			if cfg.AutoDeduct {
				deduction := calculateMinimumBreak(grossWorkTime, cfg)
				if deduction > 0 {
					totalDeduction += deduction
					if recordedBreakTime == 0 {
						result.Warnings = append(result.Warnings, WarnCodeAutoBreakApplied)
					}
				}
			}
		}
	}

	// Add warning if manual breaks were recorded
	if recordedBreakTime > 0 {
		result.Warnings = append(result.Warnings, WarnCodeManualBreak)
		// Include recorded break time in total (in addition to fixed breaks)
		totalDeduction += recordedBreakTime
	}

	// Add warning if no breaks recorded but breaks are configured
	if recordedBreakTime == 0 && totalDeduction > 0 {
		result.Warnings = append(result.Warnings, WarnCodeNoBreakRecorded)
	}

	result.DeductedMinutes = totalDeduction
	return result
}
```

#### 2. Remove old `calculateRequiredBreak` function
**File**: `apps/api/internal/calculation/breaks.go`

Delete the `requiredBreakInfo` struct and `calculateRequiredBreak` function (lines 57-98) as they are replaced by the new break type dispatch logic.

#### 3. Update calculator.go call site
**File**: `apps/api/internal/calculation/calculator.go`

Change lines 70-76 from:
```go
recordedBreakTime := CalculateBreakTime(result.Pairs)
breakResult := CalculateBreakDeduction(
	recordedBreakTime,
	result.GrossTime,
	input.DayPlan.Breaks,
)
```

To:
```go
recordedBreakTime := CalculateBreakTime(result.Pairs)
breakResult := CalculateBreakDeduction(
	result.Pairs,
	recordedBreakTime,
	result.GrossTime,
	input.DayPlan.Breaks,
)
```

#### 4. Update existing tests
**File**: `apps/api/internal/calculation/breaks_test.go`

Update all `CalculateBreakDeduction` test calls to include the `pairs` parameter:

```go
// Before:
result := calculation.CalculateBreakDeduction(30, 480, nil)

// After:
result := calculation.CalculateBreakDeduction(nil, 30, 480, nil)
```

Update each existing test function:
- `TestCalculateBreakDeduction_NoConfigs`
- `TestCalculateBreakDeduction_ManualBreakRecorded`
- `TestCalculateBreakDeduction_ManualBreakShort` (may need adjustment)
- `TestCalculateBreakDeduction_AutoDeduct`
- `TestCalculateBreakDeduction_MultipleBreaks`
- `TestCalculateBreakDeduction_WorkThreshold`

### Success Criteria:

#### Automated Verification:
- [x] All break tests pass: `cd apps/api && go test -v -run TestCalculateBreakDeduction ./internal/calculation/...`
- [x] Calculator tests pass: `cd apps/api && go test -v ./internal/calculation/...`
- [x] Full test suite passes: `make test`
- [x] Linting passes: `make lint`

---

## Phase 4: Add Integration Tests

### Overview
Add tests that verify the complete flow through `Calculator.Calculate()` with all break types.

### Changes Required:

#### 1. Add integration tests
**File**: `apps/api/internal/calculation/calculator_test.go`

```go
func TestCalculator_FixedBreakDeduction(t *testing.T) {
	calc := calculation.NewCalculator()

	// Work: 08:00-17:00, Fixed break window: 12:00-12:30
	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Now(),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
			{ID: uuid.New(), Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			Breaks: []calculation.BreakConfig{
				{
					Type:      calculation.BreakTypeFixed,
					StartTime: intPtr(720),
					EndTime:   intPtr(750),
					Duration:  30,
				},
			},
		},
	}

	result := calc.Calculate(input)

	assert.Equal(t, 540, result.GrossTime)
	assert.Equal(t, 30, result.BreakTime)
	assert.Equal(t, 510, result.NetTime)
}

func TestCalculator_FixedBreakWithManualBreak(t *testing.T) {
	calc := calculation.NewCalculator()

	// Work: 08:00-17:00 with manual break 12:00-12:45
	// Fixed break: 12:00-12:30
	// Fixed break is ALWAYS deducted (30 min overlap)
	// Manual break is also counted (45 min)
	// Total: 30 + 45 = 75 min
	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Now(),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
			{ID: uuid.New(), Time: 720, Direction: calculation.DirectionOut, Category: calculation.CategoryBreak},
			{ID: uuid.New(), Time: 765, Direction: calculation.DirectionIn, Category: calculation.CategoryBreak},
			{ID: uuid.New(), Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			Breaks: []calculation.BreakConfig{
				{
					Type:      calculation.BreakTypeFixed,
					StartTime: intPtr(720),
					EndTime:   intPtr(750),
					Duration:  30,
				},
			},
		},
	}

	result := calc.Calculate(input)

	assert.Equal(t, 540, result.GrossTime)
	assert.Equal(t, 75, result.BreakTime)
	assert.Equal(t, 465, result.NetTime)
	assert.Contains(t, result.Warnings, calculation.WarnCodeManualBreak)
}

func TestCalculator_VariableBreakNoManualBreak(t *testing.T) {
	calc := calculation.NewCalculator()

	// Work: 08:00-17:00, no manual break
	// Variable break: 30 min after 5 hours
	// Employee worked 9 hours with no break -> variable break applies
	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Now(),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
			{ID: uuid.New(), Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			Breaks: []calculation.BreakConfig{
				{
					Type:             calculation.BreakTypeVariable,
					Duration:         30,
					AfterWorkMinutes: intPtr(300),
					AutoDeduct:       true,
				},
			},
		},
	}

	result := calc.Calculate(input)

	assert.Equal(t, 540, result.GrossTime)
	assert.Equal(t, 30, result.BreakTime)
	assert.Equal(t, 510, result.NetTime)
	assert.Contains(t, result.Warnings, calculation.WarnCodeAutoBreakApplied)
}

func TestCalculator_VariableBreakWithManualBreak(t *testing.T) {
	calc := calculation.NewCalculator()

	// Work: 08:00-17:00 with manual break 12:00-12:30
	// Variable break: 30 min after 5 hours
	// Employee booked a break -> variable break does NOT apply
	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Now(),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
			{ID: uuid.New(), Time: 720, Direction: calculation.DirectionOut, Category: calculation.CategoryBreak},
			{ID: uuid.New(), Time: 750, Direction: calculation.DirectionIn, Category: calculation.CategoryBreak},
			{ID: uuid.New(), Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			Breaks: []calculation.BreakConfig{
				{
					Type:             calculation.BreakTypeVariable,
					Duration:         30,
					AfterWorkMinutes: intPtr(300),
					AutoDeduct:       true,
				},
			},
		},
	}

	result := calc.Calculate(input)

	assert.Equal(t, 540, result.GrossTime)
	assert.Equal(t, 30, result.BreakTime) // Only manual break counted
	assert.Equal(t, 510, result.NetTime)
	assert.Contains(t, result.Warnings, calculation.WarnCodeManualBreak)
	assert.NotContains(t, result.Warnings, calculation.WarnCodeAutoBreakApplied)
}

func TestCalculator_MinimumBreakProportional(t *testing.T) {
	calc := calculation.NewCalculator()

	// Work: 08:00-13:10 (5 hours 10 min = 310 min)
	// Minimum break: 30 min after 5 hours with MinutesDifference
	// Only 10 min over threshold -> only 10 min deducted
	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Now(),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
			{ID: uuid.New(), Time: 790, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 300,
			Breaks: []calculation.BreakConfig{
				{
					Type:              calculation.BreakTypeMinimum,
					Duration:          30,
					AfterWorkMinutes:  intPtr(300),
					AutoDeduct:        true,
					MinutesDifference: true,
				},
			},
		},
	}

	result := calc.Calculate(input)

	assert.Equal(t, 310, result.GrossTime)
	assert.Equal(t, 10, result.BreakTime) // Proportional: only 10 min
	assert.Equal(t, 300, result.NetTime)
}

func TestCalculator_MinimumBreakFull(t *testing.T) {
	calc := calculation.NewCalculator()

	// Work: 08:00-17:00 (9 hours)
	// Minimum break: 30 min after 5 hours with MinutesDifference
	// 4 hours over threshold -> capped at 30 min
	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Now(),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
			{ID: uuid.New(), Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			Breaks: []calculation.BreakConfig{
				{
					Type:              calculation.BreakTypeMinimum,
					Duration:          30,
					AfterWorkMinutes:  intPtr(300),
					AutoDeduct:        true,
					MinutesDifference: true,
				},
			},
		},
	}

	result := calc.Calculate(input)

	assert.Equal(t, 540, result.GrossTime)
	assert.Equal(t, 30, result.BreakTime) // Capped at Duration
	assert.Equal(t, 510, result.NetTime)
}
```

### Success Criteria:

#### Automated Verification:
- [x] Integration tests pass: `cd apps/api && go test -v -run "TestCalculator_FixedBreak|TestCalculator_VariableBreak|TestCalculator_MinimumBreak" ./internal/calculation/...`
- [x] Full test suite passes: `make test`
- [x] Linting passes: `make lint`

#### Manual Verification:
- [x] Code review confirms logic matches ZMI specification
- [x] Fixed breaks always deducted when work overlaps window
- [x] Variable breaks only apply when no manual break recorded
- [x] Minimum breaks with MinutesDifference show proportional deduction

---

## Testing Strategy

### Unit Tests:
- `TestCalculateOverlap` - All overlap scenarios
- `TestDeductFixedBreak` - Fixed break with various pair configurations
- `TestCalculateMinimumBreak` - Minimum break with/without MinutesDifference
- Updated `TestCalculateBreakDeduction_*` tests

### Integration Tests:
- `TestCalculator_FixedBreakDeduction` - Fixed break basic flow
- `TestCalculator_FixedBreakWithManualBreak` - Fixed + manual combination
- `TestCalculator_VariableBreakNoManualBreak` - Variable applies
- `TestCalculator_VariableBreakWithManualBreak` - Variable skipped
- `TestCalculator_MinimumBreakProportional` - MinutesDifference proportional
- `TestCalculator_MinimumBreakFull` - MinutesDifference capped

### Edge Cases:
- Work exactly matches break window
- Break window completely inside work period
- Multiple work pairs with partial overlaps
- Nil StartTime/EndTime on fixed break
- MinutesDifference with work exactly at threshold
- Multiple break types configured together

## Summary of Break Type Behaviors

| Break Type | When Deducted | Amount | Manual Break Effect |
|------------|---------------|--------|---------------------|
| Fixed | Always if work overlaps window | min(Duration, overlap) | No effect - always deducted |
| Variable | Only if `recordedBreakTime == 0` | Duration (if threshold met) | Skipped if any manual break |
| Minimum | After `AfterWorkMinutes` threshold | Duration or proportional | Still deducted (additive) |

## References

- Research document: `thoughts/shared/research/2026-01-22-TICKET-064-create-fixed-break-deduction.md`
- Existing breaks implementation: `apps/api/internal/calculation/breaks.go`
- Calculator flow: `apps/api/internal/calculation/calculator.go:70-77`
- ZMI manual section 3.4.4.3 (Pausen)
