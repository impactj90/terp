---
date: 2026-01-25T12:00:00+01:00
researcher: Claude
git_commit: da35dd0a2645fc1b294c95015f661ee8761c9fcf
branch: master
repository: impactj90/terp
topic: "TICKET-121: Create Surcharge Calculation Logic"
tags: [research, codebase, calculation, surcharge, zuschlag, time-tracking]
status: complete
last_updated: 2026-01-25
last_updated_by: Claude
---

# Research: TICKET-121 - Create Surcharge Calculation Logic

**Date**: 2026-01-25T12:00:00+01:00
**Researcher**: Claude
**Git Commit**: da35dd0a2645fc1b294c95015f661ee8761c9fcf
**Branch**: master
**Repository**: impactj90/terp

## Research Question

Research the codebase to understand existing structures and patterns for implementing surcharge (Zuschlag) calculation logic for time periods like night shifts and holidays.

## Summary

The codebase has a well-established calculation package with existing patterns for time-based calculations. The `DayPlanBonus` model and `day_plan_bonuses` table already exist and provide the foundation for surcharge configuration. The `CalculateOverlap` function in breaks.go provides the core algorithm needed for time window overlap calculations. The Holiday model uses `is_half_day` currently, with planned tickets (TICKET-124, TICKET-130) to add ZMI-compliant category fields.

## Detailed Findings

### 1. Calculation Package Structure

Location: `apps/api/internal/calculation/`

The calculation package contains:

| File | Purpose |
|------|---------|
| `types.go` | Core types: `BookingInput`, `BookingPair`, `CalculationResult`, `BreakConfig`, `RoundingConfig`, `ToleranceConfig`, `DayPlanInput` |
| `calculator.go` | Main `Calculator` struct with `Calculate()` method orchestrating all daily calculations |
| `pairing.go` | `PairBookings()` function and `BookingPair` handling |
| `breaks.go` | Break deduction logic including `CalculateOverlap()` - key function for surcharges |
| `capping.go` | Capping logic for early arrival, late departure, max net time |
| `tolerance.go` | Tolerance application for come/go times |
| `rounding.go` | Rounding logic for booking times |
| `errors.go` | Error codes and warning codes |
| `shift.go` | Shift detection logic |
| `monthly.go` | Monthly aggregation calculations |
| `vacation.go` | Vacation calculation logic |

**Key Type: `BookingPair`** (types.go:121-126)
```go
type BookingPair struct {
    InBooking  *BookingInput
    OutBooking *BookingInput
    Category   BookingCategory
    Duration   int // Calculated duration in minutes
}
```

### 2. Existing Overlap Calculation Function

Location: `apps/api/internal/calculation/breaks.go:80-93`

The `CalculateOverlap` function already exists and can be reused for surcharge calculations:

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

This function is used in `DeductFixedBreak()` to calculate overlap between work periods and break windows.

### 3. DayPlanBonus Model (Existing)

Location: `apps/api/internal/model/dayplan.go:239-259`

The `DayPlanBonus` model exists with time window support:

```go
type DayPlanBonus struct {
    ID               uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    DayPlanID        uuid.UUID       `gorm:"type:uuid;not null;index" json:"day_plan_id"`
    AccountID        uuid.UUID       `gorm:"type:uuid;not null;index" json:"account_id"`
    TimeFrom         int             `gorm:"type:int;not null" json:"time_from"`
    TimeTo           int             `gorm:"type:int;not null" json:"time_to"`
    CalculationType  CalculationType `gorm:"type:varchar(20);not null" json:"calculation_type"`
    ValueMinutes     int             `gorm:"type:int;not null" json:"value_minutes"`
    MinWorkMinutes   *int            `gorm:"type:int" json:"min_work_minutes,omitempty"`
    AppliesOnHoliday bool            `gorm:"default:false" json:"applies_on_holiday"`
    SortOrder        int             `gorm:"default:0" json:"sort_order"`

    // Relations
    Account *Account `gorm:"foreignKey:AccountID" json:"account,omitempty"`
}
```

**Calculation Types** (dayplan.go:231-237):
```go
const (
    CalculationFixed      CalculationType = "fixed"
    CalculationPerMinute  CalculationType = "per_minute"
    CalculationPercentage CalculationType = "percentage"
)
```

### 4. Day Plan Bonuses Migration

Location: `db/migrations/000017_create_day_plan_bonuses.up.sql`

```sql
CREATE TABLE day_plan_bonuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day_plan_id UUID NOT NULL REFERENCES day_plans(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    time_from INT NOT NULL,
    time_to INT NOT NULL,
    calculation_type VARCHAR(20) NOT NULL,
    value_minutes INT NOT NULL,
    min_work_minutes INT,
    applies_on_holiday BOOLEAN DEFAULT false,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Note**: The existing schema has `applies_on_holiday` but lacks `applies_on_workday` flag, which TICKET-121 proposes adding via `SurchargeConfig`.

### 5. Holiday Model

Location: `apps/api/internal/model/holiday.go`

Current Holiday model:
```go
type Holiday struct {
    ID           uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID     uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
    HolidayDate  time.Time  `gorm:"type:date;not null" json:"holiday_date"`
    Name         string     `gorm:"type:varchar(255);not null" json:"name"`
    IsHalfDay    bool       `json:"is_half_day"`
    AppliesToAll bool       `json:"applies_to_all"`
    DepartmentID *uuid.UUID `gorm:"type:uuid" json:"department_id,omitempty"`
}
```

**Current state**: Uses `is_half_day` boolean (simplified from ZMI's 1/2/3 category system)

**Planned additions** (TICKET-124, TICKET-130):
- `Category int` (1=full, 2=half, 3=custom)
- `AbsenceCode *string`
- `Priority int`

The DayPlan model already has `HolidayCreditCat1/2/3` fields for category-based time credits.

### 6. Account Model

Location: `apps/api/internal/model/account.go`

```go
type AccountType string

const (
    AccountTypeBonus    AccountType = "bonus"
    AccountTypeTracking AccountType = "tracking"
    AccountTypeBalance  AccountType = "balance"
)

type Account struct {
    ID          uuid.UUID   `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    *uuid.UUID  `gorm:"type:uuid;index" json:"tenant_id,omitempty"`
    Code        string      `gorm:"type:varchar(50);not null" json:"code"`
    Name        string      `gorm:"type:varchar(255);not null" json:"name"`
    AccountType AccountType `gorm:"type:varchar(20);not null" json:"account_type"`
    Unit        AccountUnit `gorm:"type:varchar(20);not null;default:'minutes'" json:"unit"`
    IsSystem    bool        `json:"is_system"`
    IsActive    bool        `json:"is_active"`
}
```

Surcharge minutes would typically post to accounts of type `AccountTypeBonus`.

### 7. Daily Calculation Service

Location: `apps/api/internal/service/daily_calc.go`

The `DailyCalcService` orchestrates daily calculations:
1. Checks for holidays
2. Gets day plan from `EmployeeDayPlan`
3. Gets bookings
4. Handles special cases (off day, holiday credit, no bookings)
5. Calls `Calculator.Calculate()` for normal calculation
6. Persists results to `DailyValue`

**Integration point for surcharges**: After `Calculator.Calculate()` returns, surcharges would be calculated based on work pairs in the result and posted to designated accounts.

### 8. ZMI Reference - Zuschläge (Surcharges)

From `thoughts/shared/reference/zmi-calculataion-manual-reference.md` Section 9:

**Key rules**:
1. "Im Bereich Zuschläge können Konten hinterlegt werden, die zu bestimmten Uhrzeiten gefüllt werden."
2. "Der Feiertagszuschlag gilt für den ganzen Tag, wenn es sich um einen Feiertag der Kategorie 1 oder 2 handelt."
3. "Von 22:00 Uhr bis 06:00 Uhr wird ein Nachtzuschlag bezahlt. Dieser Zuschlag ist aber nur an einem normalen Arbeitstag und nicht am Feiertag gültig."
4. **CRITICAL**: "Die Zuschläge müssen bis 00:00 Uhr bzw. ab 00:00 Uhr eingetragen werden. Ein Eintrag von 22:00 Uhr bis 06:00 Uhr ist ungültig."

**Derived logic**:
```
// WRONG:
Surcharge{ Start: 22:00, End: 06:00 }  // INVALID!

// CORRECT:
Surcharge{ Start: 22:00, End: 00:00 }  // Evening portion
Surcharge{ Start: 00:00, End: 06:00 }  // Morning portion
```

### 9. CalculationResult Structure

Location: `apps/api/internal/calculation/types.go:128-159`

```go
type CalculationResult struct {
    GrossTime  int
    NetTime    int
    TargetTime int
    Overtime   int
    Undertime  int
    BreakTime  int
    FirstCome  *int
    LastGo     *int
    BookingCount int
    CalculatedTimes map[uuid.UUID]int
    Pairs          []BookingPair
    UnpairedInIDs  []uuid.UUID
    UnpairedOutIDs []uuid.UUID
    CappedTime int
    Capping    CappingResult
    HasError   bool
    ErrorCodes []string
    Warnings   []string
}
```

Surcharge calculations would use `Pairs` to access work periods for overlap calculation.

### 10. DayPlan Model - Bonuses Relationship

Location: `apps/api/internal/model/dayplan.go:130`

```go
type DayPlan struct {
    // ... fields ...
    Bonuses []DayPlanBonus `gorm:"foreignKey:DayPlanID" json:"bonuses,omitempty"`
}
```

The DayPlan model already has a relationship to DayPlanBonus, which can be loaded via GORM preloading.

## Code References

- `apps/api/internal/calculation/types.go:121-126` - BookingPair struct
- `apps/api/internal/calculation/breaks.go:80-93` - CalculateOverlap function (reusable)
- `apps/api/internal/calculation/breaks.go:99-131` - DeductFixedBreak (pattern for time window overlap)
- `apps/api/internal/model/dayplan.go:239-259` - DayPlanBonus model
- `apps/api/internal/model/dayplan.go:231-237` - CalculationType enum
- `apps/api/internal/model/account.go` - Account model
- `apps/api/internal/model/holiday.go` - Holiday model
- `apps/api/internal/service/daily_calc.go:312-342` - calculateWithBookings (integration point)
- `db/migrations/000017_create_day_plan_bonuses.up.sql` - Day plan bonuses table

## Architecture Documentation

### Calculation Flow Pattern

The existing calculation flow follows this pattern:
1. Load bookings and day plan configuration
2. Process bookings (tolerance, rounding)
3. Pair bookings into work/break pairs
4. Calculate gross time from work pairs
5. Calculate break deductions
6. Calculate net time
7. Calculate overtime/undertime
8. Return CalculationResult

Surcharge calculation would fit after step 3 (pairing) and use the work pairs to calculate overlap with surcharge time windows.

### Time Representation

All times in the calculation package use **minutes from midnight** (0-1439 for same day, up to 1440 for midnight exactly).

### Existing Patterns for Time Window Calculations

The `DeductFixedBreak` function in breaks.go demonstrates the pattern:
1. Iterate over work pairs
2. For each pair, calculate overlap with time window
3. Accumulate total overlap
4. Cap at configured maximum if needed

## Historical Context (from thoughts/)

- `thoughts/shared/plans/tickets/TICKET-121-create-surcharge-calculation-logic.md` - Detailed implementation plan with proposed types and unit tests
- `thoughts/shared/plans/tickets/TICKET-068-create-daily-calculator-DONE.md` - Daily calculator implementation (dependency)
- `thoughts/shared/plans/tickets/TICKET-037-create-day-plan-bonuses-migration-DONE.md` - Day plan bonuses migration (dependency)
- `thoughts/shared/reference/zmi-calculataion-manual-reference.md` - ZMI specification Section 9: Zuschläge

## Related Research

No existing research documents specifically about surcharge calculation were found. Related documents:
- `thoughts/shared/research/2026-01-22-TICKET-064-create-fixed-break-deduction.md` - Fixed break deduction (similar overlap logic)

## Open Questions

1. **Holiday Category**: The current Holiday model uses `is_half_day` boolean. TICKET-124/130 plan to add proper category support. Surcharge calculation should handle both current and future implementations.

2. **Missing WorkdayOnly Flag**: The existing `DayPlanBonus` has `applies_on_holiday` but lacks `applies_on_workday`. The proposed `SurchargeConfig` in TICKET-121 adds both flags. Consider whether to:
   - Add `applies_on_workday` column to existing table
   - Use logic where `!applies_on_holiday` implies workday-only

3. **HolidayCategories Filter**: The proposed `SurchargeConfig.HolidayCategories []int` is not in the current schema. May need schema extension or handle via separate junction table.

4. **Account Values Integration**: TICKET-121 mentions posting surcharge minutes to accounts via TICKET-096 (Account Values). This integration path needs verification.
