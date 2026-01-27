# NOK-148: Create Surcharge Calculation Logic Implementation Plan

## Overview

Implement surcharge (Zuschlag) calculation for time periods like night shifts and holidays. Surcharges fill designated accounts for time worked within specific time windows per ZMI specification.

## Current State Analysis

### Existing Infrastructure
- **Calculation Package**: `apps/api/internal/calculation/` contains the established pattern for time calculations
- **Overlap Function**: `CalculateOverlap()` in `breaks.go:80-93` already handles time window overlap calculations
- **DayPlanBonus Model**: Exists at `model/dayplan.go:239-259` with time windows but lacks `applies_on_workday` flag
- **DayPlan.Bonuses Relationship**: GORM relationship already configured for preloading bonuses
- **Holiday Model**: Uses `IsHalfDay` boolean (not ZMI category 1/2/3 system yet - planned for TICKET-124/130)

### Key Discoveries
- `CalculateOverlap(start1, end1, start2, end2 int) int` at `breaks.go:80-93` - reusable for surcharges
- `BookingPair` struct at `types.go:120-126` contains work periods with `InBooking.Time` and `OutBooking.Time`
- `DailyCalcService.calculateWithBookings()` at `daily_calc.go:312-342` is the integration point
- ZMI requirement: Surcharges must be split at midnight - no overnight spans allowed

## Desired End State

A complete surcharge calculation system that:
1. Calculates time-based surcharges based on overlap between work periods and surcharge windows
2. Respects holiday vs workday applicability flags
3. Validates surcharge configurations (no overnight spans)
4. Provides helper to split overnight surcharges at midnight
5. Converts `DayPlanBonus` records to surcharge configs
6. Returns structured results suitable for posting to accounts

### Verification
- All unit tests pass: `cd apps/api && go test -v ./internal/calculation/... -run Surcharge`
- `make lint` passes
- `make test` passes

## What We're NOT Doing

1. **Database schema changes**: Using existing `day_plan_bonuses` table as-is
2. **Account posting integration**: Actual posting to accounts is handled by a separate ticket (TICKET-096)
3. **Holiday category migration**: TICKET-124/130 will add proper category fields to Holiday model
4. **DailyValue surcharge storage**: A separate migration ticket would add surcharge fields to daily_values
5. **API endpoints**: This ticket is pure calculation logic - no HTTP handlers

## Implementation Approach

Following the established calculation package pattern:
1. Create `surcharge.go` with pure functions for surcharge calculation
2. Create `surcharge_test.go` with comprehensive unit tests
3. Export `TimePeriod` type for representing work periods
4. Use existing `CalculateOverlap()` function from breaks.go
5. Follow ZMI spec exactly: split at midnight, holiday category filtering

---

## Phase 1: Core Types and Validation

### Overview
Define the surcharge configuration and result types, plus validation functions.

### Changes Required:

#### 1. Create surcharge.go with types
**File**: `apps/api/internal/calculation/surcharge.go`
**Changes**: Create new file with type definitions and validation

```go
package calculation

import (
	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

// TimePeriod represents a work period in minutes from midnight.
// Used for surcharge calculations where we need simple start/end times.
type TimePeriod struct {
	Start int // Minutes from midnight (0-1439)
	End   int // Minutes from midnight (0-1440)
}

// SurchargeConfig defines when and how surcharges are applied.
// ZMI: Zuschläge - must be split at midnight (no overnight spans allowed).
type SurchargeConfig struct {
	AccountID         uuid.UUID // Target account for surcharge minutes
	AccountCode       string    // Account code for identification
	TimeFrom          int       // Window start: minutes from midnight (0-1439)
	TimeTo            int       // Window end: minutes from midnight (0-1440, must be > TimeFrom)
	AppliesOnHoliday  bool      // If true, applies on holidays
	AppliesOnWorkday  bool      // If true, applies on regular workdays
	HolidayCategories []int     // Which holiday categories (1, 2, 3) - empty = all
}

// SurchargeResult contains calculated surcharge for one config.
type SurchargeResult struct {
	AccountID   uuid.UUID `json:"account_id"`
	AccountCode string    `json:"account_code"`
	Minutes     int       `json:"minutes"`
}

// SurchargeCalculationResult contains all surcharges for a day.
type SurchargeCalculationResult struct {
	Surcharges   []SurchargeResult `json:"surcharges"`
	TotalMinutes int               `json:"total_minutes"`
}

// ValidateSurchargeConfig validates a surcharge configuration.
// ZMI: "Die Zuschläge müssen bis 00:00 Uhr bzw. ab 00:00 Uhr eingetragen werden"
func ValidateSurchargeConfig(config SurchargeConfig) []string {
	var errors []string

	// Time bounds check
	if config.TimeFrom < 0 || config.TimeFrom >= 1440 {
		errors = append(errors, "time_from must be between 0 and 1439")
	}
	if config.TimeTo <= 0 || config.TimeTo > 1440 {
		errors = append(errors, "time_to must be between 1 and 1440")
	}

	// Order check - no overnight spans allowed
	if config.TimeFrom >= config.TimeTo {
		errors = append(errors, "time_from must be less than time_to (no overnight spans - split at midnight)")
	}

	return errors
}
```

### Success Criteria:

#### Automated Verification:
- [ ] File compiles without errors: `cd apps/api && go build ./internal/calculation/`
- [ ] Types are importable from other packages

#### Manual Verification:
- [ ] Review type definitions match ZMI specification

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 2.

---

## Phase 2: Surcharge Applicability Logic

### Overview
Implement logic to determine if a surcharge applies based on day type and holiday category.

### Changes Required:

#### 1. Add surchargeApplies function
**File**: `apps/api/internal/calculation/surcharge.go`
**Changes**: Add function after type definitions

```go
// surchargeApplies checks if a surcharge config applies to this day.
// ZMI: Holiday surcharges only on holidays, night surcharges only on workdays.
func surchargeApplies(config SurchargeConfig, isHoliday bool, holidayCategory int) bool {
	if isHoliday {
		// Check if surcharge applies on holidays
		if !config.AppliesOnHoliday {
			return false
		}
		// Check holiday category filter
		if len(config.HolidayCategories) > 0 {
			found := false
			for _, cat := range config.HolidayCategories {
				if cat == holidayCategory {
					found = true
					break
				}
			}
			if !found {
				return false
			}
		}
		return true
	}
	// Regular workday
	return config.AppliesOnWorkday
}
```

### Success Criteria:

#### Automated Verification:
- [ ] File compiles: `cd apps/api && go build ./internal/calculation/`

#### Manual Verification:
- [ ] Logic matches ZMI spec: holiday surcharges only on holidays, night surcharges only on workdays

**Implementation Note**: Proceed to Phase 3.

---

## Phase 3: Main Calculation Function

### Overview
Implement the main `CalculateSurcharges` function that iterates over work periods and surcharge configs.

### Changes Required:

#### 1. Add CalculateSurcharges function
**File**: `apps/api/internal/calculation/surcharge.go`
**Changes**: Add main calculation function

```go
// CalculateSurcharges calculates all surcharges for a day's work periods.
// ZMI: Zuschläge calculation - fills accounts based on work within time windows.
//
// Parameters:
//   - workPeriods: Work periods in minutes from midnight
//   - configs: Surcharge configurations from day plan bonuses
//   - isHoliday: Whether this day is a holiday
//   - holidayCategory: Holiday category (1, 2, 3) if applicable, 0 if not a holiday
//
// Returns surcharge results for each applicable config with total minutes.
func CalculateSurcharges(
	workPeriods []TimePeriod,
	configs []SurchargeConfig,
	isHoliday bool,
	holidayCategory int,
) SurchargeCalculationResult {
	result := SurchargeCalculationResult{
		Surcharges: make([]SurchargeResult, 0),
	}

	for _, config := range configs {
		// Check if this surcharge applies today
		if !surchargeApplies(config, isHoliday, holidayCategory) {
			continue
		}

		// Calculate overlap between work periods and surcharge window
		totalMinutes := 0
		for _, period := range workPeriods {
			overlap := CalculateOverlap(
				period.Start, period.End,
				config.TimeFrom, config.TimeTo,
			)
			totalMinutes += overlap
		}

		if totalMinutes > 0 {
			result.Surcharges = append(result.Surcharges, SurchargeResult{
				AccountID:   config.AccountID,
				AccountCode: config.AccountCode,
				Minutes:     totalMinutes,
			})
			result.TotalMinutes += totalMinutes
		}
	}

	return result
}
```

### Success Criteria:

#### Automated Verification:
- [ ] File compiles: `cd apps/api && go build ./internal/calculation/`

#### Manual Verification:
- [ ] Function uses existing `CalculateOverlap` from breaks.go

**Implementation Note**: Proceed to Phase 4.

---

## Phase 4: Helper Functions

### Overview
Add helper functions for splitting overnight surcharges and extracting work periods from booking pairs.

### Changes Required:

#### 1. Add SplitOvernightSurcharge function
**File**: `apps/api/internal/calculation/surcharge.go`
**Changes**: Add helper to split overnight configs at midnight

```go
// SplitOvernightSurcharge splits an overnight surcharge config into two valid configs.
// ZMI: Surcharges must not span midnight. 22:00-06:00 becomes [22:00-00:00, 00:00-06:00].
// If config is already valid (no overnight), returns as-is.
func SplitOvernightSurcharge(config SurchargeConfig) []SurchargeConfig {
	// If already valid (no overnight), return as-is
	if config.TimeFrom < config.TimeTo {
		return []SurchargeConfig{config}
	}

	// Split at midnight
	eveningConfig := SurchargeConfig{
		AccountID:         config.AccountID,
		AccountCode:       config.AccountCode,
		TimeFrom:          config.TimeFrom,
		TimeTo:            1440, // Midnight
		AppliesOnHoliday:  config.AppliesOnHoliday,
		AppliesOnWorkday:  config.AppliesOnWorkday,
		HolidayCategories: config.HolidayCategories,
	}

	morningConfig := SurchargeConfig{
		AccountID:         config.AccountID,
		AccountCode:       config.AccountCode,
		TimeFrom:          0, // Midnight
		TimeTo:            config.TimeTo,
		AppliesOnHoliday:  config.AppliesOnHoliday,
		AppliesOnWorkday:  config.AppliesOnWorkday,
		HolidayCategories: config.HolidayCategories,
	}

	return []SurchargeConfig{eveningConfig, morningConfig}
}

// ExtractWorkPeriods extracts TimePeriod slices from BookingPairs.
// Only includes complete work pairs (both in and out bookings present).
func ExtractWorkPeriods(pairs []BookingPair) []TimePeriod {
	periods := make([]TimePeriod, 0, len(pairs))

	for _, pair := range pairs {
		// Only consider work pairs
		if pair.Category != CategoryWork {
			continue
		}
		// Skip incomplete pairs
		if pair.InBooking == nil || pair.OutBooking == nil {
			continue
		}

		periods = append(periods, TimePeriod{
			Start: pair.InBooking.Time,
			End:   pair.OutBooking.Time,
		})
	}

	return periods
}
```

### Success Criteria:

#### Automated Verification:
- [ ] File compiles: `cd apps/api && go build ./internal/calculation/`

#### Manual Verification:
- [ ] SplitOvernightSurcharge correctly handles overnight spans

**Implementation Note**: Proceed to Phase 5.

---

## Phase 5: DayPlanBonus Conversion

### Overview
Add function to convert DayPlanBonus model records to SurchargeConfig.

### Changes Required:

#### 1. Add ConvertBonusesToSurchargeConfigs function
**File**: `apps/api/internal/calculation/surcharge.go`
**Changes**: Add conversion function

```go
// ConvertBonusesToSurchargeConfigs converts DayPlanBonus records to SurchargeConfig.
// Maps AppliesOnHoliday to both holiday and workday flags:
// - AppliesOnHoliday=true: holiday only (AppliesOnWorkday=false)
// - AppliesOnHoliday=false: workday only (AppliesOnWorkday=true, AppliesOnHoliday=false)
//
// Note: HolidayCategories is left empty (applies to all categories) since
// DayPlanBonus doesn't have category filtering. This will be enhanced when
// TICKET-124/130 adds category support.
func ConvertBonusesToSurchargeConfigs(bonuses []model.DayPlanBonus) []SurchargeConfig {
	configs := make([]SurchargeConfig, 0, len(bonuses))

	for _, bonus := range bonuses {
		config := SurchargeConfig{
			AccountID:        bonus.AccountID,
			TimeFrom:         bonus.TimeFrom,
			TimeTo:           bonus.TimeTo,
			AppliesOnHoliday: bonus.AppliesOnHoliday,
			AppliesOnWorkday: !bonus.AppliesOnHoliday, // Inverse: holiday=workday-only, not-holiday=holiday-only
		}

		if bonus.Account != nil {
			config.AccountCode = bonus.Account.Code
		}

		configs = append(configs, config)
	}

	return configs
}

// GetHolidayCategoryFromFlag converts the current Holiday.IsHalfDay boolean
// to a ZMI-style holiday category.
// Returns: 1 for full holiday, 2 for half holiday.
// Note: This is a compatibility shim until TICKET-124/130 adds proper Category field.
func GetHolidayCategoryFromFlag(isHalfDay bool) int {
	if isHalfDay {
		return 2 // Half holiday
	}
	return 1 // Full holiday
}
```

### Success Criteria:

#### Automated Verification:
- [ ] File compiles: `cd apps/api && go build ./internal/calculation/`
- [ ] No import cycle errors

#### Manual Verification:
- [ ] Conversion logic correctly maps AppliesOnHoliday flag

**Implementation Note**: Proceed to Phase 6.

---

## Phase 6: Unit Tests - Basic Scenarios

### Overview
Create unit tests for core surcharge calculation scenarios.

### Changes Required:

#### 1. Create surcharge_test.go
**File**: `apps/api/internal/calculation/surcharge_test.go`
**Changes**: Create test file with basic test cases

```go
package calculation

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestCalculateSurcharges_NightShift(t *testing.T) {
	nightAccountID := uuid.New()

	// ZMI example: Night surcharge 22:00-00:00 (split at midnight)
	configs := []SurchargeConfig{
		{
			AccountID:        nightAccountID,
			AccountCode:      "NIGHT",
			TimeFrom:         1320, // 22:00
			TimeTo:           1440, // 00:00 (midnight)
			AppliesOnWorkday: true,
			AppliesOnHoliday: false,
		},
	}

	// Work period: 20:00 - 23:00 (3 hours)
	workPeriods := []TimePeriod{
		{Start: 1200, End: 1380}, // 20:00 - 23:00
	}

	result := CalculateSurcharges(workPeriods, configs, false, 0)

	assert.Len(t, result.Surcharges, 1)
	assert.Equal(t, nightAccountID, result.Surcharges[0].AccountID)
	assert.Equal(t, "NIGHT", result.Surcharges[0].AccountCode)
	assert.Equal(t, 60, result.Surcharges[0].Minutes) // 22:00-23:00 = 60 min
	assert.Equal(t, 60, result.TotalMinutes)
}

func TestCalculateSurcharges_HolidaySurcharge(t *testing.T) {
	holidayAccountID := uuid.New()

	// Holiday surcharge for all day
	configs := []SurchargeConfig{
		{
			AccountID:         holidayAccountID,
			AccountCode:       "HOLIDAY",
			TimeFrom:          0,
			TimeTo:            1440,
			AppliesOnWorkday:  false,
			AppliesOnHoliday:  true,
			HolidayCategories: []int{1, 2}, // Cat 1 and 2 only
		},
	}

	// Work period: 08:00 - 16:00 (8 hours)
	workPeriods := []TimePeriod{
		{Start: 480, End: 960},
	}

	// Category 1 holiday - should apply
	result := CalculateSurcharges(workPeriods, configs, true, 1)
	assert.Len(t, result.Surcharges, 1)
	assert.Equal(t, 480, result.Surcharges[0].Minutes)

	// Category 3 holiday - should NOT apply (not in categories)
	result = CalculateSurcharges(workPeriods, configs, true, 3)
	assert.Len(t, result.Surcharges, 0)

	// Normal workday - should NOT apply
	result = CalculateSurcharges(workPeriods, configs, false, 0)
	assert.Len(t, result.Surcharges, 0)
}

func TestCalculateSurcharges_NightNotOnHoliday(t *testing.T) {
	// ZMI: "Dieser Zuschlag ist aber nur an einem normalen Arbeitstag und nicht am Feiertag gültig"
	nightAccountID := uuid.New()

	configs := []SurchargeConfig{
		{
			AccountID:        nightAccountID,
			AccountCode:      "NIGHT",
			TimeFrom:         1320, // 22:00
			TimeTo:           1440, // 00:00
			AppliesOnWorkday: true,
			AppliesOnHoliday: false, // NOT on holidays
		},
	}

	workPeriods := []TimePeriod{
		{Start: 1200, End: 1380}, // 20:00 - 23:00
	}

	// Normal workday - should apply
	result := CalculateSurcharges(workPeriods, configs, false, 0)
	assert.Len(t, result.Surcharges, 1)
	assert.Equal(t, 60, result.Surcharges[0].Minutes)

	// Holiday - should NOT apply
	result = CalculateSurcharges(workPeriods, configs, true, 1)
	assert.Len(t, result.Surcharges, 0)
}

func TestCalculateSurcharges_MultiplePeriods(t *testing.T) {
	accountID := uuid.New()

	configs := []SurchargeConfig{
		{
			AccountID:        accountID,
			AccountCode:      "BONUS",
			TimeFrom:         360,  // 06:00
			TimeTo:           480,  // 08:00
			AppliesOnWorkday: true,
		},
	}

	// Multiple work periods - split shift
	workPeriods := []TimePeriod{
		{Start: 300, End: 420},  // 05:00 - 07:00 (overlap: 06:00-07:00 = 60 min)
		{Start: 450, End: 540},  // 07:30 - 09:00 (overlap: 07:30-08:00 = 30 min)
	}

	result := CalculateSurcharges(workPeriods, configs, false, 0)
	assert.Len(t, result.Surcharges, 1)
	assert.Equal(t, 90, result.Surcharges[0].Minutes) // 60 + 30 = 90
}

func TestCalculateSurcharges_NoWorkPeriods(t *testing.T) {
	configs := []SurchargeConfig{
		{
			AccountID:        uuid.New(),
			AccountCode:      "NIGHT",
			TimeFrom:         1320,
			TimeTo:           1440,
			AppliesOnWorkday: true,
		},
	}

	result := CalculateSurcharges([]TimePeriod{}, configs, false, 0)
	assert.Len(t, result.Surcharges, 0)
	assert.Equal(t, 0, result.TotalMinutes)
}

func TestCalculateSurcharges_NoOverlap(t *testing.T) {
	configs := []SurchargeConfig{
		{
			AccountID:        uuid.New(),
			AccountCode:      "NIGHT",
			TimeFrom:         1320, // 22:00
			TimeTo:           1440, // 00:00
			AppliesOnWorkday: true,
		},
	}

	// Work period: 08:00 - 16:00 (no overlap with night window)
	workPeriods := []TimePeriod{
		{Start: 480, End: 960},
	}

	result := CalculateSurcharges(workPeriods, configs, false, 0)
	assert.Len(t, result.Surcharges, 0)
}
```

### Success Criteria:

#### Automated Verification:
- [ ] All tests pass: `cd apps/api && go test -v ./internal/calculation/... -run TestCalculateSurcharges`

#### Manual Verification:
- [ ] Tests cover ZMI-specified scenarios

**Implementation Note**: Proceed to Phase 7.

---

## Phase 7: Unit Tests - Validation and Helpers

### Overview
Add tests for validation, splitting overnight surcharges, and helper functions.

### Changes Required:

#### 1. Add validation and helper tests
**File**: `apps/api/internal/calculation/surcharge_test.go`
**Changes**: Add test functions

```go
func TestValidateSurchargeConfig(t *testing.T) {
	tests := []struct {
		name       string
		config     SurchargeConfig
		errorCount int
	}{
		{
			name: "valid config",
			config: SurchargeConfig{
				TimeFrom: 360,
				TimeTo:   480,
			},
			errorCount: 0,
		},
		{
			name: "valid full day",
			config: SurchargeConfig{
				TimeFrom: 0,
				TimeTo:   1440,
			},
			errorCount: 0,
		},
		{
			name: "overnight span - invalid",
			config: SurchargeConfig{
				TimeFrom: 1320, // 22:00
				TimeTo:   360,  // 06:00 - crosses midnight!
			},
			errorCount: 1,
		},
		{
			name: "time_from negative",
			config: SurchargeConfig{
				TimeFrom: -10,
				TimeTo:   360,
			},
			errorCount: 1,
		},
		{
			name: "time_from at boundary",
			config: SurchargeConfig{
				TimeFrom: 1440, // Invalid: 1440 is max for end, not start
				TimeTo:   1440,
			},
			errorCount: 2, // Both time_from invalid AND from >= to
		},
		{
			name: "time_to out of range",
			config: SurchargeConfig{
				TimeFrom: 360,
				TimeTo:   1500,
			},
			errorCount: 1,
		},
		{
			name: "time_to zero",
			config: SurchargeConfig{
				TimeFrom: 0,
				TimeTo:   0,
			},
			errorCount: 2, // time_to invalid AND from >= to
		},
		{
			name: "from equals to",
			config: SurchargeConfig{
				TimeFrom: 480,
				TimeTo:   480,
			},
			errorCount: 1,
		},
		{
			name: "from greater than to",
			config: SurchargeConfig{
				TimeFrom: 600,
				TimeTo:   480,
			},
			errorCount: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			errors := ValidateSurchargeConfig(tt.config)
			assert.Len(t, errors, tt.errorCount, "errors: %v", errors)
		})
	}
}

func TestSplitOvernightSurcharge(t *testing.T) {
	config := SurchargeConfig{
		AccountID:        uuid.New(),
		AccountCode:      "NIGHT",
		TimeFrom:         1320, // 22:00
		TimeTo:           360,  // 06:00 (overnight)
		AppliesOnWorkday: true,
		AppliesOnHoliday: false,
	}

	result := SplitOvernightSurcharge(config)

	assert.Len(t, result, 2)

	// Evening portion: 22:00 - 00:00
	assert.Equal(t, 1320, result[0].TimeFrom)
	assert.Equal(t, 1440, result[0].TimeTo)
	assert.Equal(t, config.AccountID, result[0].AccountID)
	assert.Equal(t, "NIGHT", result[0].AccountCode)
	assert.True(t, result[0].AppliesOnWorkday)
	assert.False(t, result[0].AppliesOnHoliday)

	// Morning portion: 00:00 - 06:00
	assert.Equal(t, 0, result[1].TimeFrom)
	assert.Equal(t, 360, result[1].TimeTo)
	assert.Equal(t, config.AccountID, result[1].AccountID)
}

func TestSplitOvernightSurcharge_AlreadyValid(t *testing.T) {
	config := SurchargeConfig{
		AccountID: uuid.New(),
		TimeFrom:  480,
		TimeTo:    600,
	}

	result := SplitOvernightSurcharge(config)

	assert.Len(t, result, 1)
	assert.Equal(t, config.TimeFrom, result[0].TimeFrom)
	assert.Equal(t, config.TimeTo, result[0].TimeTo)
}

func TestExtractWorkPeriods(t *testing.T) {
	inID := uuid.New()
	outID := uuid.New()

	pairs := []BookingPair{
		{
			InBooking:  &BookingInput{ID: inID, Time: 480, Direction: DirectionIn},
			OutBooking: &BookingInput{ID: outID, Time: 720, Direction: DirectionOut},
			Category:   CategoryWork,
			Duration:   240,
		},
		{
			InBooking:  &BookingInput{ID: uuid.New(), Time: 720, Direction: DirectionIn},
			OutBooking: &BookingInput{ID: uuid.New(), Time: 750, Direction: DirectionOut},
			Category:   CategoryBreak, // Should be excluded
			Duration:   30,
		},
		{
			InBooking:  &BookingInput{ID: uuid.New(), Time: 750, Direction: DirectionIn},
			OutBooking: &BookingInput{ID: uuid.New(), Time: 1020, Direction: DirectionOut},
			Category:   CategoryWork,
			Duration:   270,
		},
	}

	periods := ExtractWorkPeriods(pairs)

	assert.Len(t, periods, 2)
	assert.Equal(t, 480, periods[0].Start)
	assert.Equal(t, 720, periods[0].End)
	assert.Equal(t, 750, periods[1].Start)
	assert.Equal(t, 1020, periods[1].End)
}

func TestExtractWorkPeriods_IncompletePairs(t *testing.T) {
	pairs := []BookingPair{
		{
			InBooking: &BookingInput{ID: uuid.New(), Time: 480, Direction: DirectionIn},
			// Missing OutBooking
			Category: CategoryWork,
		},
		{
			// Missing InBooking
			OutBooking: &BookingInput{ID: uuid.New(), Time: 720, Direction: DirectionOut},
			Category:   CategoryWork,
		},
	}

	periods := ExtractWorkPeriods(pairs)

	assert.Len(t, periods, 0) // All incomplete pairs should be skipped
}

func TestGetHolidayCategoryFromFlag(t *testing.T) {
	// Full holiday (not half day)
	assert.Equal(t, 1, GetHolidayCategoryFromFlag(false))

	// Half holiday
	assert.Equal(t, 2, GetHolidayCategoryFromFlag(true))
}
```

### Success Criteria:

#### Automated Verification:
- [ ] All tests pass: `cd apps/api && go test -v ./internal/calculation/... -run "TestValidate|TestSplit|TestExtract|TestGetHolidayCategory"`

#### Manual Verification:
- [ ] Edge cases are covered

**Implementation Note**: Proceed to Phase 8.

---

## Phase 8: Unit Tests - Conversion Function

### Overview
Add tests for DayPlanBonus to SurchargeConfig conversion.

### Changes Required:

#### 1. Add conversion tests
**File**: `apps/api/internal/calculation/surcharge_test.go`
**Changes**: Add test function

```go
func TestConvertBonusesToSurchargeConfigs(t *testing.T) {
	accountID := uuid.New()

	bonuses := []model.DayPlanBonus{
		{
			ID:               uuid.New(),
			AccountID:        accountID,
			TimeFrom:         1320, // 22:00
			TimeTo:           1440, // 00:00
			AppliesOnHoliday: false, // Workday only
			Account: &model.Account{
				ID:   accountID,
				Code: "NIGHT_BONUS",
			},
		},
		{
			ID:               uuid.New(),
			AccountID:        uuid.New(),
			TimeFrom:         0,
			TimeTo:           1440,
			AppliesOnHoliday: true, // Holiday only
			Account:          nil,  // No account preloaded
		},
	}

	configs := ConvertBonusesToSurchargeConfigs(bonuses)

	assert.Len(t, configs, 2)

	// First config: workday only (AppliesOnHoliday=false)
	assert.Equal(t, accountID, configs[0].AccountID)
	assert.Equal(t, "NIGHT_BONUS", configs[0].AccountCode)
	assert.Equal(t, 1320, configs[0].TimeFrom)
	assert.Equal(t, 1440, configs[0].TimeTo)
	assert.False(t, configs[0].AppliesOnHoliday)
	assert.True(t, configs[0].AppliesOnWorkday)

	// Second config: holiday only (AppliesOnHoliday=true)
	assert.True(t, configs[1].AppliesOnHoliday)
	assert.False(t, configs[1].AppliesOnWorkday)
	assert.Empty(t, configs[1].AccountCode) // No account preloaded
}

func TestConvertBonusesToSurchargeConfigs_Empty(t *testing.T) {
	configs := ConvertBonusesToSurchargeConfigs([]model.DayPlanBonus{})
	assert.Len(t, configs, 0)
	assert.NotNil(t, configs) // Should be empty slice, not nil
}
```

### Success Criteria:

#### Automated Verification:
- [ ] All tests pass: `cd apps/api && go test -v ./internal/calculation/... -run TestConvertBonuses`

#### Manual Verification:
- [ ] Conversion logic correctly handles all fields

**Implementation Note**: Proceed to Phase 9.

---

## Phase 9: Integration and Final Verification

### Overview
Run full test suite and lint checks to ensure everything works together.

### Changes Required:

No new code changes. This phase is for verification.

### Success Criteria:

#### Automated Verification:
- [ ] All surcharge tests pass: `cd apps/api && go test -v ./internal/calculation/... -run Surcharge`
- [ ] All calculation package tests pass: `cd apps/api && go test -v ./internal/calculation/...`
- [ ] Lint passes: `make lint`
- [ ] Full test suite passes: `make test`

#### Manual Verification:
- [ ] Review the complete `surcharge.go` file for code quality
- [ ] Verify all ZMI requirements from the ticket are implemented:
  - [x] Calculates surcharges based on time windows
  - [x] Respects holiday vs workday flags
  - [x] Filters by holiday category when specified
  - [x] Validates configs (no overnight spans)
  - [x] Helper to split overnight surcharges
  - [x] Handles multiple work periods
  - [x] Converts DayPlanBonus to SurchargeConfig

**Implementation Note**: After all verification passes, the implementation is complete.

---

## Testing Strategy

### Unit Tests:
- Night shift surcharge calculation
- Holiday surcharge with category filtering
- Night surcharge exclusion on holidays (ZMI spec)
- Multiple work periods
- No work periods / no overlap scenarios
- Validation of surcharge configs
- Overnight surcharge splitting
- Work period extraction from booking pairs
- DayPlanBonus conversion

### Key Edge Cases:
- Work period exactly at surcharge boundary
- Work period spanning entire surcharge window
- Multiple surcharges applying to same work period
- Empty configs
- Invalid overnight spans

### Manual Testing Steps:
1. Verify calculation matches ZMI manual examples
2. Test with real day plan bonus configurations

## Performance Considerations

- O(n*m) complexity where n = work periods, m = surcharge configs
- Typical case: 2-4 work periods, 2-5 surcharge configs = negligible performance impact
- No database operations in calculation logic - pure functions

## References

- Original ticket: `thoughts/shared/plans/tickets/TICKET-121-create-surcharge-calculation-logic.md`
- Research document: `thoughts/shared/research/2026-01-25-NOK-148-create-surcharge-calculation-logic.md`
- ZMI reference: `thoughts/shared/reference/zmi-calculataion-manual-reference.md` Section 9: Zuschläge
- Existing overlap logic: `apps/api/internal/calculation/breaks.go:80-93`
- DayPlanBonus model: `apps/api/internal/model/dayplan.go:239-259`
