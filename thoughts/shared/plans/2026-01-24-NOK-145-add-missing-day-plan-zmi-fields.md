# Implementation Plan: NOK-145 - Add Missing Day Plan ZMI Fields

**Date**: 2026-01-24
**Ticket**: NOK-145 (TICKET-118)
**Type**: Migration + Model Update + Helper Methods + Tests
**Research**: `thoughts/shared/research/2026-01-24-NOK-145-add-missing-day-plan-zmi-fields.md`

---

## Overview

Add missing ZMI fields to the `day_plans` and `day_plan_breaks` tables. These fields are needed for:
- Alternative target hours for absence days (Regelarbeitszeit 2)
- Employee master target hours lookup (Aus Personalstamm holen)
- Variable work time flag (variable Arbeitszeit)
- Extended rounding settings (round all bookings, add/subtract values)
- Holiday credits by category (Zeitgutschrift an Feiertagen)
- Vacation deduction values (Urlaubsbewertung)
- No-booking behavior (Tage ohne Buchungen)
- Day change behavior (Tageswechsel)
- Shift detection windows and alternative plans (Schichterkennung)
- Minutes difference flag for breaks (Minuten Differenz)

---

## Phase 1: Migration

**Files to create:**
- `/home/tolga/projects/terp/db/migrations/000029_add_day_plan_zmi_fields.up.sql`
- `/home/tolga/projects/terp/db/migrations/000029_add_day_plan_zmi_fields.down.sql`

### Up Migration

```sql
-- Add ZMI fields to day_plans
ALTER TABLE day_plans
    -- Alternative target hours for absence days (Regelarbeitszeit 2)
    ADD COLUMN IF NOT EXISTS regular_hours_2 INT,
    -- Get target from employee master (Aus Personalstamm holen)
    ADD COLUMN IF NOT EXISTS from_employee_master BOOLEAN DEFAULT FALSE,
    -- Variable work time flag - enables tolerance_come_minus for FAZ plans
    ADD COLUMN IF NOT EXISTS variable_work_time BOOLEAN DEFAULT FALSE,
    -- Round all bookings, not just first come / last go
    ADD COLUMN IF NOT EXISTS round_all_bookings BOOLEAN DEFAULT FALSE,
    -- Add/subtract minutes for rounding (Wert addieren/subtrahieren)
    ADD COLUMN IF NOT EXISTS rounding_come_add_value INT,
    ADD COLUMN IF NOT EXISTS rounding_go_add_value INT,
    -- Holiday time credits by category (Zeitgutschrift an Feiertagen)
    ADD COLUMN IF NOT EXISTS holiday_credit_cat1 INT,
    ADD COLUMN IF NOT EXISTS holiday_credit_cat2 INT,
    ADD COLUMN IF NOT EXISTS holiday_credit_cat3 INT,
    -- Vacation deduction value (Urlaubsbewertung) - 1.0 = one day, or hours
    ADD COLUMN IF NOT EXISTS vacation_deduction DECIMAL(5,2) DEFAULT 1.00,
    -- No-booking behavior (Tage ohne Buchungen)
    ADD COLUMN IF NOT EXISTS no_booking_behavior VARCHAR(30) DEFAULT 'error',
    -- Day change behavior (Tageswechsel)
    ADD COLUMN IF NOT EXISTS day_change_behavior VARCHAR(30) DEFAULT 'none',
    -- Shift detection windows (Schichterkennung)
    ADD COLUMN IF NOT EXISTS shift_detect_arrive_from INT,
    ADD COLUMN IF NOT EXISTS shift_detect_arrive_to INT,
    ADD COLUMN IF NOT EXISTS shift_detect_depart_from INT,
    ADD COLUMN IF NOT EXISTS shift_detect_depart_to INT,
    -- Alternative day plans for shift detection (up to 6)
    ADD COLUMN IF NOT EXISTS shift_alt_plan_1 UUID REFERENCES day_plans(id),
    ADD COLUMN IF NOT EXISTS shift_alt_plan_2 UUID REFERENCES day_plans(id),
    ADD COLUMN IF NOT EXISTS shift_alt_plan_3 UUID REFERENCES day_plans(id),
    ADD COLUMN IF NOT EXISTS shift_alt_plan_4 UUID REFERENCES day_plans(id),
    ADD COLUMN IF NOT EXISTS shift_alt_plan_5 UUID REFERENCES day_plans(id),
    ADD COLUMN IF NOT EXISTS shift_alt_plan_6 UUID REFERENCES day_plans(id);

-- Add minutes_difference to day_plan_breaks (Minuten Differenz)
ALTER TABLE day_plan_breaks
    ADD COLUMN IF NOT EXISTS minutes_difference BOOLEAN DEFAULT FALSE;
```

### Down Migration

```sql
-- Remove minutes_difference from day_plan_breaks
ALTER TABLE day_plan_breaks
    DROP COLUMN IF EXISTS minutes_difference;

-- Remove ZMI fields from day_plans
ALTER TABLE day_plans
    DROP COLUMN IF EXISTS shift_alt_plan_6,
    DROP COLUMN IF EXISTS shift_alt_plan_5,
    DROP COLUMN IF EXISTS shift_alt_plan_4,
    DROP COLUMN IF EXISTS shift_alt_plan_3,
    DROP COLUMN IF EXISTS shift_alt_plan_2,
    DROP COLUMN IF EXISTS shift_alt_plan_1,
    DROP COLUMN IF EXISTS shift_detect_depart_to,
    DROP COLUMN IF EXISTS shift_detect_depart_from,
    DROP COLUMN IF EXISTS shift_detect_arrive_to,
    DROP COLUMN IF EXISTS shift_detect_arrive_from,
    DROP COLUMN IF EXISTS day_change_behavior,
    DROP COLUMN IF EXISTS no_booking_behavior,
    DROP COLUMN IF EXISTS vacation_deduction,
    DROP COLUMN IF EXISTS holiday_credit_cat3,
    DROP COLUMN IF EXISTS holiday_credit_cat2,
    DROP COLUMN IF EXISTS holiday_credit_cat1,
    DROP COLUMN IF EXISTS rounding_go_add_value,
    DROP COLUMN IF EXISTS rounding_come_add_value,
    DROP COLUMN IF EXISTS round_all_bookings,
    DROP COLUMN IF EXISTS variable_work_time,
    DROP COLUMN IF EXISTS from_employee_master,
    DROP COLUMN IF EXISTS regular_hours_2;
```

### Verification

```bash
make migrate-up
make migrate-down
make migrate-up
```

---

## Phase 2: Model Update

**File to modify:** `/home/tolga/projects/terp/apps/api/internal/model/dayplan.go`

### 2a. Add New Type Definitions

Add after the existing `RoundingType` constants (after line 23):

```go
// NoBookingBehavior defines how to handle days without bookings.
// ZMI: Tage ohne Buchungen
type NoBookingBehavior string

const (
	NoBookingError           NoBookingBehavior = "error"
	NoBookingDeductTarget    NoBookingBehavior = "deduct_target"
	NoBookingVocationalSchool NoBookingBehavior = "vocational_school"
	NoBookingAdoptTarget     NoBookingBehavior = "adopt_target"
	NoBookingTargetWithOrder NoBookingBehavior = "target_with_order"
)

// DayChangeBehavior defines how to handle cross-midnight shifts.
// ZMI: Tageswechsel
type DayChangeBehavior string

const (
	DayChangeNone         DayChangeBehavior = "none"
	DayChangeAtArrival    DayChangeBehavior = "at_arrival"
	DayChangeAtDeparture  DayChangeBehavior = "at_departure"
	DayChangeAutoComplete DayChangeBehavior = "auto_complete"
)
```

### 2b. Add New Fields to DayPlan Struct

Add the following fields to the `DayPlan` struct. Insert after the `RegularHours` field (after line 42) and before the `// Tolerance settings` comment:

```go
	// ZMI: Regelarbeitszeit 2 - alternative target for absence days
	RegularHours2 *int `gorm:"type:int" json:"regular_hours_2,omitempty"`
	// ZMI: Aus Personalstamm holen - get target from employee master
	FromEmployeeMaster bool `gorm:"default:false" json:"from_employee_master"`
```

Add after the `MaxNetWorkTime` field (after line 58), before `IsActive`:

```go
	// ZMI: Variable Arbeitszeit - enables tolerance_come_minus for FAZ plans
	VariableWorkTime bool `gorm:"default:false" json:"variable_work_time"`

	// ZMI: Rounding extras
	RoundAllBookings    bool `gorm:"default:false" json:"round_all_bookings"`
	RoundingComeAddValue *int `gorm:"type:int" json:"rounding_come_add_value,omitempty"`
	RoundingGoAddValue   *int `gorm:"type:int" json:"rounding_go_add_value,omitempty"`

	// ZMI: Zeitgutschrift an Feiertagen - holiday time credits (minutes)
	HolidayCreditCat1 *int `gorm:"type:int" json:"holiday_credit_cat1,omitempty"`
	HolidayCreditCat2 *int `gorm:"type:int" json:"holiday_credit_cat2,omitempty"`
	HolidayCreditCat3 *int `gorm:"type:int" json:"holiday_credit_cat3,omitempty"`

	// ZMI: Urlaubsbewertung - vacation deduction value (1.0 = one day)
	VacationDeduction decimal.Decimal `gorm:"type:decimal(5,2);default:1.00" json:"vacation_deduction"`

	// ZMI: Tage ohne Buchungen - no-booking behavior
	NoBookingBehavior NoBookingBehavior `gorm:"type:varchar(30);default:'error'" json:"no_booking_behavior"`

	// ZMI: Tageswechsel - day change behavior
	DayChangeBehavior DayChangeBehavior `gorm:"type:varchar(30);default:'none'" json:"day_change_behavior"`

	// ZMI: Schichterkennung - shift detection windows (minutes from midnight)
	ShiftDetectArriveFrom *int `gorm:"type:int" json:"shift_detect_arrive_from,omitempty"`
	ShiftDetectArriveTo   *int `gorm:"type:int" json:"shift_detect_arrive_to,omitempty"`
	ShiftDetectDepartFrom *int `gorm:"type:int" json:"shift_detect_depart_from,omitempty"`
	ShiftDetectDepartTo   *int `gorm:"type:int" json:"shift_detect_depart_to,omitempty"`

	// ZMI: Alternative day plans for shift detection (up to 6)
	ShiftAltPlan1 *uuid.UUID `gorm:"type:uuid" json:"shift_alt_plan_1,omitempty"`
	ShiftAltPlan2 *uuid.UUID `gorm:"type:uuid" json:"shift_alt_plan_2,omitempty"`
	ShiftAltPlan3 *uuid.UUID `gorm:"type:uuid" json:"shift_alt_plan_3,omitempty"`
	ShiftAltPlan4 *uuid.UUID `gorm:"type:uuid" json:"shift_alt_plan_4,omitempty"`
	ShiftAltPlan5 *uuid.UUID `gorm:"type:uuid" json:"shift_alt_plan_5,omitempty"`
	ShiftAltPlan6 *uuid.UUID `gorm:"type:uuid" json:"shift_alt_plan_6,omitempty"`
```

### 2c. Add New Field to DayPlanBreak Struct

Add after the `IsPaid` field (after line 90), before `SortOrder`:

```go
	// ZMI: Minuten Differenz - proportional deduction when near threshold
	MinutesDifference bool `gorm:"default:false" json:"minutes_difference"`
```

### 2d. Update Import Statement

Add `"github.com/shopspring/decimal"` to the import block (the existing imports only have `"time"` and `"github.com/google/uuid"`).

### Verification

```bash
cd /home/tolga/projects/terp/apps/api && go build ./...
```

---

## Phase 3: Helper Methods

**File to modify:** `/home/tolga/projects/terp/apps/api/internal/model/dayplan.go`

Add the following methods after the `TableName()` method for `DayPlan` (after line 71):

### 3a. GetEffectiveRegularHours

Returns the effective target hours for a given day, considering:
- If `FromEmployeeMaster` is true and `employeeTargetMinutes` is provided, use employee's target
- If `isAbsenceDay` is true and `RegularHours2` is set, use the alternative target
- Otherwise, use the standard `RegularHours`

```go
// GetEffectiveRegularHours returns the target minutes for a day.
// Priority: employee master > absence day alternative > standard regular hours.
func (dp *DayPlan) GetEffectiveRegularHours(isAbsenceDay bool, employeeTargetMinutes *int) int {
	// If configured to get from employee master and value is available, use it
	if dp.FromEmployeeMaster && employeeTargetMinutes != nil {
		return *employeeTargetMinutes
	}
	// If absence day and alternative target is configured, use it
	if isAbsenceDay && dp.RegularHours2 != nil {
		return *dp.RegularHours2
	}
	return dp.RegularHours
}
```

### 3b. GetHolidayCredit

Returns the holiday credit minutes for a given category (1, 2, or 3).

```go
// GetHolidayCredit returns the holiday time credit in minutes for the given category.
// Categories: 1 = full holiday, 2 = half holiday, 3 = custom.
// Returns 0 if the category is not configured.
func (dp *DayPlan) GetHolidayCredit(category int) int {
	switch category {
	case 1:
		if dp.HolidayCreditCat1 != nil {
			return *dp.HolidayCreditCat1
		}
	case 2:
		if dp.HolidayCreditCat2 != nil {
			return *dp.HolidayCreditCat2
		}
	case 3:
		if dp.HolidayCreditCat3 != nil {
			return *dp.HolidayCreditCat3
		}
	}
	return 0
}
```

### 3c. HasShiftDetection

Returns true if any shift detection window is configured.

```go
// HasShiftDetection returns true if shift detection windows are configured.
func (dp *DayPlan) HasShiftDetection() bool {
	return dp.ShiftDetectArriveFrom != nil || dp.ShiftDetectArriveTo != nil ||
		dp.ShiftDetectDepartFrom != nil || dp.ShiftDetectDepartTo != nil
}
```

### 3d. GetAlternativePlanIDs

Returns a slice of non-nil alternative plan UUIDs.

```go
// GetAlternativePlanIDs returns all configured alternative day plan IDs for shift detection.
func (dp *DayPlan) GetAlternativePlanIDs() []uuid.UUID {
	ids := make([]uuid.UUID, 0, 6)
	if dp.ShiftAltPlan1 != nil {
		ids = append(ids, *dp.ShiftAltPlan1)
	}
	if dp.ShiftAltPlan2 != nil {
		ids = append(ids, *dp.ShiftAltPlan2)
	}
	if dp.ShiftAltPlan3 != nil {
		ids = append(ids, *dp.ShiftAltPlan3)
	}
	if dp.ShiftAltPlan4 != nil {
		ids = append(ids, *dp.ShiftAltPlan4)
	}
	if dp.ShiftAltPlan5 != nil {
		ids = append(ids, *dp.ShiftAltPlan5)
	}
	if dp.ShiftAltPlan6 != nil {
		ids = append(ids, *dp.ShiftAltPlan6)
	}
	return ids
}
```

### Verification

```bash
cd /home/tolga/projects/terp/apps/api && go build ./...
```

---

## Phase 4: Tests

**File to create:** `/home/tolga/projects/terp/apps/api/internal/model/dayplan_test.go`

Note: There are currently no model-level test files in this project. This will be the first. The test file uses the standard `testing` package and `testify/assert` which is already a project dependency.

### Test Cases

```go
package model

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestDayPlan_GetEffectiveRegularHours(t *testing.T) {
	tests := []struct {
		name                  string
		dayPlan               DayPlan
		isAbsenceDay          bool
		employeeTargetMinutes *int
		expected              int
	}{
		{
			name:         "standard regular hours",
			dayPlan:      DayPlan{RegularHours: 480},
			isAbsenceDay: false,
			expected:     480,
		},
		{
			name:         "absence day with regular_hours_2",
			dayPlan:      DayPlan{RegularHours: 480, RegularHours2: intPtr(240)},
			isAbsenceDay: true,
			expected:     240,
		},
		{
			name:         "absence day without regular_hours_2 falls back to regular",
			dayPlan:      DayPlan{RegularHours: 480},
			isAbsenceDay: true,
			expected:     480,
		},
		{
			name:                  "from_employee_master with value",
			dayPlan:               DayPlan{RegularHours: 480, FromEmployeeMaster: true},
			isAbsenceDay:          false,
			employeeTargetMinutes: intPtr(450),
			expected:              450,
		},
		{
			name:                  "from_employee_master without value falls back",
			dayPlan:               DayPlan{RegularHours: 480, FromEmployeeMaster: true},
			isAbsenceDay:          false,
			employeeTargetMinutes: nil,
			expected:              480,
		},
		{
			name:                  "from_employee_master takes priority over absence day",
			dayPlan:               DayPlan{RegularHours: 480, RegularHours2: intPtr(240), FromEmployeeMaster: true},
			isAbsenceDay:          true,
			employeeTargetMinutes: intPtr(450),
			expected:              450,
		},
		{
			name:                  "from_employee_master false ignores employee value",
			dayPlan:               DayPlan{RegularHours: 480, FromEmployeeMaster: false},
			isAbsenceDay:          false,
			employeeTargetMinutes: intPtr(450),
			expected:              480,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.dayPlan.GetEffectiveRegularHours(tt.isAbsenceDay, tt.employeeTargetMinutes)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestDayPlan_GetHolidayCredit(t *testing.T) {
	dp := DayPlan{
		HolidayCreditCat1: intPtr(480),
		HolidayCreditCat2: intPtr(240),
		HolidayCreditCat3: intPtr(360),
	}

	tests := []struct {
		name     string
		category int
		expected int
	}{
		{"category 1 full holiday", 1, 480},
		{"category 2 half holiday", 2, 240},
		{"category 3 custom", 3, 360},
		{"category 0 invalid", 0, 0},
		{"category 4 invalid", 4, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := dp.GetHolidayCredit(tt.category)
			assert.Equal(t, tt.expected, result)
		})
	}

	// Test with nil values
	t.Run("nil category returns 0", func(t *testing.T) {
		emptyDP := DayPlan{}
		assert.Equal(t, 0, emptyDP.GetHolidayCredit(1))
		assert.Equal(t, 0, emptyDP.GetHolidayCredit(2))
		assert.Equal(t, 0, emptyDP.GetHolidayCredit(3))
	})
}

func TestDayPlan_HasShiftDetection(t *testing.T) {
	tests := []struct {
		name     string
		dayPlan  DayPlan
		expected bool
	}{
		{
			name:     "no shift detection",
			dayPlan:  DayPlan{},
			expected: false,
		},
		{
			name:     "arrive_from set",
			dayPlan:  DayPlan{ShiftDetectArriveFrom: intPtr(360)},
			expected: true,
		},
		{
			name:     "arrive_to set",
			dayPlan:  DayPlan{ShiftDetectArriveTo: intPtr(540)},
			expected: true,
		},
		{
			name:     "depart_from set",
			dayPlan:  DayPlan{ShiftDetectDepartFrom: intPtr(900)},
			expected: true,
		},
		{
			name:     "depart_to set",
			dayPlan:  DayPlan{ShiftDetectDepartTo: intPtr(1080)},
			expected: true,
		},
		{
			name: "all set",
			dayPlan: DayPlan{
				ShiftDetectArriveFrom: intPtr(360),
				ShiftDetectArriveTo:   intPtr(540),
				ShiftDetectDepartFrom: intPtr(900),
				ShiftDetectDepartTo:   intPtr(1080),
			},
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.dayPlan.HasShiftDetection()
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestDayPlan_GetAlternativePlanIDs(t *testing.T) {
	id1 := uuid.New()
	id2 := uuid.New()
	id3 := uuid.New()

	tests := []struct {
		name     string
		dayPlan  DayPlan
		expected []uuid.UUID
	}{
		{
			name:     "no alternatives",
			dayPlan:  DayPlan{},
			expected: []uuid.UUID{},
		},
		{
			name:     "one alternative",
			dayPlan:  DayPlan{ShiftAltPlan1: &id1},
			expected: []uuid.UUID{id1},
		},
		{
			name: "three alternatives",
			dayPlan: DayPlan{
				ShiftAltPlan1: &id1,
				ShiftAltPlan2: &id2,
				ShiftAltPlan3: &id3,
			},
			expected: []uuid.UUID{id1, id2, id3},
		},
		{
			name: "sparse alternatives (1 and 3 set, 2 nil)",
			dayPlan: DayPlan{
				ShiftAltPlan1: &id1,
				ShiftAltPlan3: &id3,
			},
			expected: []uuid.UUID{id1, id3},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.dayPlan.GetAlternativePlanIDs()
			assert.Equal(t, tt.expected, result)
		})
	}
}

// Helper function for creating int pointers in tests
func intPtr(v int) *int {
	return &v
}
```

### Verification

```bash
cd /home/tolga/projects/terp/apps/api && go test -v -run TestDayPlan ./internal/model/...
```

---

## Implementation Order

1. **Phase 1** - Create migration files (000029 up and down)
2. **Phase 2** - Update model (`dayplan.go`) with types, fields, and imports
3. **Phase 3** - Add helper methods to `dayplan.go`
4. **Phase 4** - Create test file and run tests

## Final Verification

```bash
# Build passes
cd /home/tolga/projects/terp/apps/api && go build ./...

# Tests pass
cd /home/tolga/projects/terp/apps/api && go test -v -run TestDayPlan ./internal/model/...

# All existing tests still pass
cd /home/tolga/projects/terp/apps/api && go test ./...

# Migration applies cleanly
make migrate-up

# Lint passes
make lint

# Format check
make fmt
```

---

## Downstream Impact (NOT in scope for this ticket)

After this migration is complete, follow-up tickets should update:

1. **`apps/api/internal/service/daily_calc.go`** - Remove `DefaultDailyCalcConfig()`, wire DayPlan ZMI fields into calculation. Also move/remove the `NoBookingBehavior` and `DayChangeBehavior` types from service since they now live in model.
2. **`apps/api/internal/service/dayplan.go`** - Add new fields to `CreateDayPlanInput`, `UpdateDayPlanInput`, and `Copy()` method.
3. **`apps/api/internal/handler/dayplan.go`** - Map new request body fields.
4. **`apps/api/internal/repository/dayplan.go`** - Add new columns to the explicit `.Select()` in `Create()`.
5. **`apps/api/internal/calculation/types.go`** - Add `RoundAllBookings`, `RoundingComeAddValue`, `RoundingGoAddValue` to `DayPlanInput`.
6. **`apps/api/internal/service/daily_calc.go` buildCalcInput** - Pass `MinutesDifference` from `DayPlanBreak` to `BreakConfig`.

---

## Success Criteria

- [ ] Migration 000029 applies and rolls back cleanly
- [ ] DayPlan model compiles with all 22 new fields
- [ ] DayPlanBreak model has `MinutesDifference` field
- [ ] `NoBookingBehavior` and `DayChangeBehavior` types defined in model package
- [ ] 4 helper methods compile and pass unit tests
- [ ] All existing tests continue to pass
- [ ] `go build ./...` succeeds
- [ ] `make lint` passes
