# TICKET-118: Add Missing Day Plan ZMI Fields

**Type**: Migration + Model Update
**Effort**: M
**Sprint**: 16 - Daily Calculation Service
**Dependencies**: TICKET-035, TICKET-038, TICKET-123, TICKET-124, TICKET-125
**Migration Number**: 000030 (renumbered from 000025 to avoid collision with TICKET-074)

## Migration Sequence Note

> **IMPORTANT**: This migration was renumbered from 000025 to 000030 to avoid collision with TICKET-074 (absence_types).
>
> Correct migration sequence:
> - 000025: absence_types (TICKET-074)
> - 000026: absence_days (TICKET-076)
> - 000027: add_employee_zmi_fields (TICKET-123)
> - 000028: add_holiday_zmi_fields (TICKET-124)
> - 000029: add_tariff_zmi_fields (TICKET-125)
> - 000030: add_day_plan_zmi_fields (THIS TICKET)

## Description

Add missing ZMI-compliant fields to the day_plans table and model, including Regelarbeitszeit 2, holiday credit settings, vacation deduction, no-booking behavior, day change handling, and shift detection.

## ZMI Reference

> "Die Regelarbeitszeit 2 kann gefüllt werden, wenn an diesem Tag eine andere Regelarbeitszeit bei hinterlegten Fehltagen gültig sein soll."

> "Der Haken Aus Personalstamm holen wird gesetzt, wenn ZMI Time die Regelarbeitszeit aus dem Personalstamm holen soll."

> "Alle Buchungen runden - Standardmäßig ist diese Funktion deaktiviert: Dann wird lediglich die erste Kommt-Buchung und die letzte Geht-Buchung gerundet."

> "Wert addieren und Wert subtrahieren - Bei dieser Einstellung wird der eingestellte Wert auf die Buchung addiert oder subtrahiert."

## Files to Modify

- `db/migrations/000030_add_day_plan_zmi_fields.up.sql` (NEW)
- `db/migrations/000030_add_day_plan_zmi_fields.down.sql` (NEW)
- `apps/api/internal/model/dayplan.go` (UPDATE)

## Implementation

### Up Migration

```sql
-- Add ZMI-compliant fields to day_plans
ALTER TABLE day_plans
    -- Regelarbeitszeit 2: Alternative target for absence days
    ADD COLUMN regular_hours_2 INT,

    -- Aus Personalstamm holen: Get target from employee master
    ADD COLUMN from_employee_master BOOLEAN NOT NULL DEFAULT FALSE,

    -- variable Arbeitszeit: Enables Toleranz Kommen - for FAZ
    ADD COLUMN variable_work_time BOOLEAN NOT NULL DEFAULT FALSE,

    -- Alle Buchungen runden: Round all bookings vs just first IN/last OUT
    ADD COLUMN round_all_bookings BOOLEAN NOT NULL DEFAULT FALSE,

    -- Rounding add/subtract values (ZMI: Wert addieren/subtrahieren)
    ADD COLUMN rounding_come_add_value INT,
    ADD COLUMN rounding_go_add_value INT,

    -- Holiday credit settings (ZMI: Zeitgutschrift an Feiertagen)
    -- Category determines which credit applies: 1=full, 2=half, 3=custom
    ADD COLUMN holiday_credit_cat1 INT, -- Minutes to credit for category 1 holiday
    ADD COLUMN holiday_credit_cat2 INT, -- Minutes to credit for category 2 holiday
    ADD COLUMN holiday_credit_cat3 INT, -- Minutes to credit for category 3 holiday

    -- Vacation deduction (ZMI: Urlaubsbewertung)
    -- Value to deduct from vacation account (usually 1.0 for days, or hours)
    ADD COLUMN vacation_deduction DECIMAL(5,2) DEFAULT 1.00,

    -- No booking behavior (ZMI: Tage ohne Buchungen)
    -- 'error', 'deduct_target', 'vocational_school', 'adopt_target', 'target_with_order'
    ADD COLUMN no_booking_behavior VARCHAR(30) DEFAULT 'error',

    -- Day change behavior (ZMI: Tageswechsel)
    -- 'none', 'at_arrival', 'at_departure', 'auto_complete'
    ADD COLUMN day_change_behavior VARCHAR(30) DEFAULT 'none',

    -- Shift detection: Arrival window
    ADD COLUMN shift_detect_arrive_from INT,
    ADD COLUMN shift_detect_arrive_to INT,

    -- Shift detection: Departure window
    ADD COLUMN shift_detect_depart_from INT,
    ADD COLUMN shift_detect_depart_to INT,

    -- Shift detection: Alternative day plan IDs (up to 6)
    ADD COLUMN shift_alt_plan_1 UUID REFERENCES day_plans(id),
    ADD COLUMN shift_alt_plan_2 UUID REFERENCES day_plans(id),
    ADD COLUMN shift_alt_plan_3 UUID REFERENCES day_plans(id),
    ADD COLUMN shift_alt_plan_4 UUID REFERENCES day_plans(id),
    ADD COLUMN shift_alt_plan_5 UUID REFERENCES day_plans(id),
    ADD COLUMN shift_alt_plan_6 UUID REFERENCES day_plans(id);

-- Add MinutesDifference flag to day_plan_breaks
ALTER TABLE day_plan_breaks
    ADD COLUMN minutes_difference BOOLEAN NOT NULL DEFAULT FALSE;

-- Add rounding type enum values for add/subtract
COMMENT ON COLUMN day_plans.rounding_come_add_value IS 'ZMI: Wert addieren/subtrahieren for arrivals (positive=add, negative=subtract)';
COMMENT ON COLUMN day_plans.rounding_go_add_value IS 'ZMI: Wert addieren/subtrahieren for departures (positive=add, negative=subtract)';
COMMENT ON COLUMN day_plans.no_booking_behavior IS 'ZMI: Tage ohne Buchungen behavior';
COMMENT ON COLUMN day_plans.day_change_behavior IS 'ZMI: Tageswechsel handling for overnight work';
COMMENT ON COLUMN day_plan_breaks.minutes_difference IS 'ZMI: Minuten Differenz - proportional break deduction';
```

### Down Migration

```sql
ALTER TABLE day_plans
    DROP COLUMN IF EXISTS regular_hours_2,
    DROP COLUMN IF EXISTS from_employee_master,
    DROP COLUMN IF EXISTS variable_work_time,
    DROP COLUMN IF EXISTS round_all_bookings,
    DROP COLUMN IF EXISTS rounding_come_add_value,
    DROP COLUMN IF EXISTS rounding_go_add_value,
    DROP COLUMN IF EXISTS holiday_credit_cat1,
    DROP COLUMN IF EXISTS holiday_credit_cat2,
    DROP COLUMN IF EXISTS holiday_credit_cat3,
    DROP COLUMN IF EXISTS vacation_deduction,
    DROP COLUMN IF EXISTS no_booking_behavior,
    DROP COLUMN IF EXISTS day_change_behavior,
    DROP COLUMN IF EXISTS shift_detect_arrive_from,
    DROP COLUMN IF EXISTS shift_detect_arrive_to,
    DROP COLUMN IF EXISTS shift_detect_depart_from,
    DROP COLUMN IF EXISTS shift_detect_depart_to,
    DROP COLUMN IF EXISTS shift_alt_plan_1,
    DROP COLUMN IF EXISTS shift_alt_plan_2,
    DROP COLUMN IF EXISTS shift_alt_plan_3,
    DROP COLUMN IF EXISTS shift_alt_plan_4,
    DROP COLUMN IF EXISTS shift_alt_plan_5,
    DROP COLUMN IF EXISTS shift_alt_plan_6;

ALTER TABLE day_plan_breaks
    DROP COLUMN IF EXISTS minutes_difference;
```

### Model Updates

```go
// Add to model/dayplan.go

// NoBookingBehavior defines what happens on days without bookings
// ZMI: Tage ohne Buchungen
type NoBookingBehavior string

const (
    NoBookingError           NoBookingBehavior = "error"            // Show error in correction assistant
    NoBookingDeductTarget    NoBookingBehavior = "deduct_target"    // Deduct Regelarbeitszeit
    NoBookingVocationalSchool NoBookingBehavior = "vocational_school" // Auto-insert vocational school
    NoBookingAdoptTarget     NoBookingBehavior = "adopt_target"     // Credit Regelarbeitszeit as work
    NoBookingTargetWithOrder NoBookingBehavior = "target_with_order" // Credit to default project
)

// DayChangeBehavior defines how overnight work is handled
// ZMI: Tageswechsel
type DayChangeBehavior string

const (
    DayChangeNone        DayChangeBehavior = "none"         // No overnight work expected
    DayChangeAtArrival   DayChangeBehavior = "at_arrival"   // Credit to arrival day
    DayChangeAtDeparture DayChangeBehavior = "at_departure" // Credit to departure day
    DayChangeAutoComplete DayChangeBehavior = "auto_complete" // Split at midnight
)

// Add fields to DayPlan struct:

// Alternative target hours for absence days (ZMI: Regelarbeitszeit 2)
RegularHours2 *int `gorm:"type:int" json:"regular_hours_2,omitempty"`

// Get target from employee master (ZMI: Aus Personalstamm holen)
FromEmployeeMaster bool `gorm:"default:false" json:"from_employee_master"`

// Enables Toleranz Kommen - for FAZ (ZMI: variable Arbeitszeit)
VariableWorkTime bool `gorm:"default:false" json:"variable_work_time"`

// Round all bookings vs just first IN/last OUT (ZMI: Alle Buchungen runden)
RoundAllBookings bool `gorm:"default:false" json:"round_all_bookings"`

// Add/subtract values for rounding (ZMI: Wert addieren/subtrahieren)
RoundingComeAddValue *int `gorm:"type:int" json:"rounding_come_add_value,omitempty"`
RoundingGoAddValue   *int `gorm:"type:int" json:"rounding_go_add_value,omitempty"`

// Holiday credit settings (ZMI: Zeitgutschrift an Feiertagen)
HolidayCreditCat1 *int `gorm:"type:int" json:"holiday_credit_cat1,omitempty"`
HolidayCreditCat2 *int `gorm:"type:int" json:"holiday_credit_cat2,omitempty"`
HolidayCreditCat3 *int `gorm:"type:int" json:"holiday_credit_cat3,omitempty"`

// Vacation deduction value (ZMI: Urlaubsbewertung)
VacationDeduction *float64 `gorm:"type:decimal(5,2);default:1.00" json:"vacation_deduction,omitempty"`

// Days without bookings behavior (ZMI: Tage ohne Buchungen)
NoBookingBehavior NoBookingBehavior `gorm:"type:varchar(30);default:'error'" json:"no_booking_behavior"`

// Day change behavior for overnight work (ZMI: Tageswechsel)
DayChangeBehavior DayChangeBehavior `gorm:"type:varchar(30);default:'none'" json:"day_change_behavior"`

// Shift detection windows (ZMI: Schichterkennung)
ShiftDetectArriveFrom *int `gorm:"type:int" json:"shift_detect_arrive_from,omitempty"`
ShiftDetectArriveTo   *int `gorm:"type:int" json:"shift_detect_arrive_to,omitempty"`
ShiftDetectDepartFrom *int `gorm:"type:int" json:"shift_detect_depart_from,omitempty"`
ShiftDetectDepartTo   *int `gorm:"type:int" json:"shift_detect_depart_to,omitempty"`

// Alternative day plans for shift detection (up to 6)
ShiftAltPlan1 *uuid.UUID `gorm:"type:uuid" json:"shift_alt_plan_1,omitempty"`
ShiftAltPlan2 *uuid.UUID `gorm:"type:uuid" json:"shift_alt_plan_2,omitempty"`
ShiftAltPlan3 *uuid.UUID `gorm:"type:uuid" json:"shift_alt_plan_3,omitempty"`
ShiftAltPlan4 *uuid.UUID `gorm:"type:uuid" json:"shift_alt_plan_4,omitempty"`
ShiftAltPlan5 *uuid.UUID `gorm:"type:uuid" json:"shift_alt_plan_5,omitempty"`
ShiftAltPlan6 *uuid.UUID `gorm:"type:uuid" json:"shift_alt_plan_6,omitempty"`

// Add to DayPlanBreak struct:
// ZMI: Minuten Differenz - proportional break deduction
MinutesDifference bool `gorm:"default:false" json:"minutes_difference"`
```

### Helper Methods

```go
// GetEffectiveRegularHours returns the appropriate target hours
// considering absence days and employee master settings
func (dp *DayPlan) GetEffectiveRegularHours(isAbsenceDay bool, employeeTargetMinutes *int) int {
    // If from employee master, use that value
    if dp.FromEmployeeMaster && employeeTargetMinutes != nil {
        return *employeeTargetMinutes
    }

    // On absence days, use Regelarbeitszeit 2 if set
    if isAbsenceDay && dp.RegularHours2 != nil {
        return *dp.RegularHours2
    }

    return dp.RegularHours
}

// GetHolidayCredit returns the credit for a holiday category
func (dp *DayPlan) GetHolidayCredit(category int) int {
    switch category {
    case 1:
        if dp.HolidayCreditCat1 != nil {
            return *dp.HolidayCreditCat1
        }
        return dp.RegularHours // Default: full target hours
    case 2:
        if dp.HolidayCreditCat2 != nil {
            return *dp.HolidayCreditCat2
        }
        return dp.RegularHours / 2 // Default: half target hours
    case 3:
        if dp.HolidayCreditCat3 != nil {
            return *dp.HolidayCreditCat3
        }
        return 0 // Default: no credit
    default:
        return 0
    }
}

// HasShiftDetection returns true if shift detection is configured
func (dp *DayPlan) HasShiftDetection() bool {
    return (dp.ShiftDetectArriveFrom != nil && dp.ShiftDetectArriveTo != nil) ||
           (dp.ShiftDetectDepartFrom != nil && dp.ShiftDetectDepartTo != nil)
}

// GetAlternativePlanIDs returns all configured alternative plan IDs
func (dp *DayPlan) GetAlternativePlanIDs() []uuid.UUID {
    var ids []uuid.UUID
    for _, id := range []*uuid.UUID{
        dp.ShiftAltPlan1, dp.ShiftAltPlan2, dp.ShiftAltPlan3,
        dp.ShiftAltPlan4, dp.ShiftAltPlan5, dp.ShiftAltPlan6,
    } {
        if id != nil {
            ids = append(ids, *id)
        }
    }
    return ids
}
```

## Unit Tests

```go
func TestDayPlan_GetEffectiveRegularHours(t *testing.T) {
    tests := []struct {
        name                  string
        regularHours          int
        regularHours2         *int
        fromEmployeeMaster    bool
        isAbsenceDay          bool
        employeeTargetMinutes *int
        expected              int
    }{
        {
            name:         "normal day uses regular hours",
            regularHours: 480,
            isAbsenceDay: false,
            expected:     480,
        },
        {
            name:          "absence day uses regular hours 2",
            regularHours:  480,
            regularHours2: intPtr(420),
            isAbsenceDay:  true,
            expected:      420,
        },
        {
            name:                  "from employee master overrides",
            regularHours:          480,
            fromEmployeeMaster:    true,
            employeeTargetMinutes: intPtr(450),
            isAbsenceDay:          false,
            expected:              450,
        },
        {
            name:         "absence day without regular hours 2 uses regular hours",
            regularHours: 480,
            isAbsenceDay: true,
            expected:     480,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            dp := &DayPlan{
                RegularHours:       tt.regularHours,
                RegularHours2:      tt.regularHours2,
                FromEmployeeMaster: tt.fromEmployeeMaster,
            }
            result := dp.GetEffectiveRegularHours(tt.isAbsenceDay, tt.employeeTargetMinutes)
            assert.Equal(t, tt.expected, result)
        })
    }
}

func TestDayPlan_GetHolidayCredit(t *testing.T) {
    tests := []struct {
        name     string
        cat1     *int
        cat2     *int
        cat3     *int
        regular  int
        category int
        expected int
    }{
        {"cat 1 default", nil, nil, nil, 480, 1, 480},
        {"cat 2 default", nil, nil, nil, 480, 2, 240},
        {"cat 3 default", nil, nil, nil, 480, 3, 0},
        {"cat 1 custom", intPtr(450), nil, nil, 480, 1, 450},
        {"cat 2 custom", nil, intPtr(200), nil, 480, 2, 200},
        {"cat 3 custom", nil, nil, intPtr(100), 480, 3, 100},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            dp := &DayPlan{
                RegularHours:      tt.regular,
                HolidayCreditCat1: tt.cat1,
                HolidayCreditCat2: tt.cat2,
                HolidayCreditCat3: tt.cat3,
            }
            result := dp.GetHolidayCredit(tt.category)
            assert.Equal(t, tt.expected, result)
        })
    }
}

func TestDayPlan_HasShiftDetection(t *testing.T) {
    tests := []struct {
        name     string
        arrFrom  *int
        arrTo    *int
        depFrom  *int
        depTo    *int
        expected bool
    }{
        {"no detection", nil, nil, nil, nil, false},
        {"arrival only", intPtr(360), intPtr(540), nil, nil, true},
        {"departure only", nil, nil, intPtr(840), intPtr(1080), true},
        {"both configured", intPtr(360), intPtr(540), intPtr(840), intPtr(1080), true},
        {"partial arrival", intPtr(360), nil, nil, nil, false},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            dp := &DayPlan{
                ShiftDetectArriveFrom: tt.arrFrom,
                ShiftDetectArriveTo:   tt.arrTo,
                ShiftDetectDepartFrom: tt.depFrom,
                ShiftDetectDepartTo:   tt.depTo,
            }
            assert.Equal(t, tt.expected, dp.HasShiftDetection())
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
| Regelarbeitszeit 2 | `RegularHours2` field |
| Aus Personalstamm holen | `FromEmployeeMaster` flag |
| variable Arbeitszeit | `VariableWorkTime` flag |
| Alle Buchungen runden | `RoundAllBookings` flag |
| Wert addieren/subtrahieren | `RoundingComeAddValue`, `RoundingGoAddValue` |
| Zeitgutschrift an Feiertagen | `HolidayCreditCat1/2/3` fields |
| Urlaubsbewertung | `VacationDeduction` field |
| Tage ohne Buchungen | `NoBookingBehavior` enum |
| Tageswechsel | `DayChangeBehavior` enum |
| Schichterkennung | Shift detection windows + alt plans |
| Minuten Differenz | `MinutesDifference` on breaks |

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] `make migrate-down` succeeds
- [ ] Model updated with all new fields
- [ ] Helper methods work correctly
- [ ] All unit tests pass
- [ ] `make test` passes
