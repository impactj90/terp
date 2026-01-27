# Research: NOK-150 - Add Rounding Add/Subtract Modes

**Date**: 2026-01-25
**Ticket**: NOK-150 (TICKET-122)
**Type**: Calculation Enhancement
**Git Commit**: d52839ae1f2a2ab5b10cfb6791d81e161d65d75f

---

## 1. Research Question

Analyze the current state of rounding logic to understand what exists and what is needed to support add/subtract rounding modes (ZMI: "Wert addieren" / "Wert subtrahieren").

---

## 2. Current Database Schema

### Migration 000015 - Original Day Plans (rounding columns)

**File**: `/home/tolga/projects/terp/db/migrations/000015_create_day_plans.up.sql`

```sql
-- Rounding settings (interval-based only)
rounding_come_type VARCHAR(20),      -- 'none', 'up', 'down', 'nearest'
rounding_come_interval INT,          -- rounding interval in minutes
rounding_go_type VARCHAR(20),
rounding_go_interval INT,
```

### Migration 000030 - ZMI Fields (add/subtract columns)

**File**: `/home/tolga/projects/terp/db/migrations/000030_add_day_plan_zmi_fields.up.sql`

```sql
-- Add/subtract minutes for rounding (Wert addieren/subtrahieren)
ADD COLUMN IF NOT EXISTS rounding_come_add_value INT,
ADD COLUMN IF NOT EXISTS rounding_go_add_value INT,
```

**Summary**: Database schema supports both interval-based rounding (type + interval) and add/subtract values as separate columns. The add_value fields are designed to store the fixed minutes to add or subtract.

---

## 3. Current Model Layer

### File: `/home/tolga/projects/terp/apps/api/internal/model/dayplan.go`

**RoundingType Constants** (lines 17-24):

```go
type RoundingType string

const (
    RoundingNone    RoundingType = "none"
    RoundingUp      RoundingType = "up"
    RoundingDown    RoundingType = "down"
    RoundingNearest RoundingType = "nearest"
)
```

**Missing**: `RoundingAdd` and `RoundingSubtract` constants

**DayPlan Struct Fields** (lines 79-94):

```go
// Rounding settings
RoundingComeType     *RoundingType `gorm:"type:varchar(20)" json:"rounding_come_type,omitempty"`
RoundingComeInterval *int          `gorm:"type:int" json:"rounding_come_interval,omitempty"`
RoundingGoType       *RoundingType `gorm:"type:varchar(20)" json:"rounding_go_type,omitempty"`
RoundingGoInterval   *int          `gorm:"type:int" json:"rounding_go_interval,omitempty"`

// ...

// ZMI: Rounding extras
RoundAllBookings     bool `gorm:"default:false" json:"round_all_bookings"`
RoundingComeAddValue *int `gorm:"type:int" json:"rounding_come_add_value,omitempty"`
RoundingGoAddValue   *int `gorm:"type:int" json:"rounding_go_add_value,omitempty"`
```

**Observation**: The model has fields for storing add/subtract values, but the `RoundingType` enum lacks the "add" and "subtract" constants. Currently, these add_value fields would be used in conjunction with existing rounding types, not as standalone modes.

---

## 4. Current Calculation Layer

### RoundingType and RoundingConfig

**File**: `/home/tolga/projects/terp/apps/api/internal/calculation/types.go` (lines 62-76)

```go
type RoundingType string

const (
    RoundingNone    RoundingType = "none"
    RoundingUp      RoundingType = "up"
    RoundingDown    RoundingType = "down"
    RoundingNearest RoundingType = "nearest"
)

type RoundingConfig struct {
    Type     RoundingType
    Interval int // Rounding interval in minutes (e.g., 5, 15)
}
```

**Missing**:
- `RoundingAdd` and `RoundingSubtract` constants
- `AddValue` field in `RoundingConfig`

### Rounding Functions

**File**: `/home/tolga/projects/terp/apps/api/internal/calculation/rounding.go` (51 lines)

```go
func RoundTime(minutes int, config *RoundingConfig) int {
    if config == nil || config.Type == RoundingNone || config.Interval <= 0 {
        return minutes
    }

    switch config.Type {
    case RoundingUp:
        return roundUp(minutes, config.Interval)
    case RoundingDown:
        return roundDown(minutes, config.Interval)
    case RoundingNearest:
        return roundNearest(minutes, config.Interval)
    default:
        return minutes
    }
}

func roundUp(minutes, interval int) int {
    remainder := minutes % interval
    if remainder == 0 {
        return minutes
    }
    return minutes + (interval - remainder)
}

func roundDown(minutes, interval int) int {
    return minutes - (minutes % interval)
}

func roundNearest(minutes, interval int) int {
    remainder := minutes % interval
    if remainder <= interval/2 {
        return roundDown(minutes, interval)
    }
    return roundUp(minutes, interval)
}

func RoundComeTime(minutes int, config *RoundingConfig) int {
    return RoundTime(minutes, config)
}

func RoundGoTime(minutes int, config *RoundingConfig) int {
    return RoundTime(minutes, config)
}
```

**Observation**: The rounding logic only handles interval-based rounding (up, down, nearest). There is no handling for add or subtract modes. The convenience wrappers `RoundComeTime` and `RoundGoTime` simply delegate to `RoundTime`.

---

## 5. Current Service Layer Integration

### File: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go`

**buildCalcInput function** (lines 377-391):

```go
// Rounding - come
if dp.RoundingComeType != nil && dp.RoundingComeInterval != nil {
    input.DayPlan.RoundingCome = &calculation.RoundingConfig{
        Type:     calculation.RoundingType(*dp.RoundingComeType),
        Interval: *dp.RoundingComeInterval,
    }
}

// Rounding - go
if dp.RoundingGoType != nil && dp.RoundingGoInterval != nil {
    input.DayPlan.RoundingGo = &calculation.RoundingConfig{
        Type:     calculation.RoundingType(*dp.RoundingGoType),
        Interval: *dp.RoundingGoInterval,
    }
}
```

**Not Passed**: The `RoundingComeAddValue` and `RoundingGoAddValue` fields from the model are not mapped to the calculation input.

---

## 6. Calculator Usage

### File: `/home/tolga/projects/terp/apps/api/internal/calculation/calculator.go`

**processBookings function** (lines 139-169):

```go
if b.Category == CategoryWork {
    if b.Direction == DirectionIn {
        // Apply come tolerance
        calculatedTime = ApplyComeTolerance(b.Time, dayPlan.ComeTo, dayPlan.Tolerance)
        // Apply come rounding
        calculatedTime = RoundComeTime(calculatedTime, dayPlan.RoundingCome)
    } else {
        // Apply go tolerance
        calculatedTime = ApplyGoTolerance(b.Time, dayPlan.GoFrom, dayPlan.Tolerance)
        // Apply go rounding
        calculatedTime = RoundGoTime(calculatedTime, dayPlan.RoundingGo)
    }
}
```

**Observation**: Rounding is applied after tolerance adjustment. The current flow handles interval-based rounding only.

---

## 7. Existing Test Coverage

**File**: `/home/tolga/projects/terp/apps/api/internal/calculation/rounding_test.go` (117 lines)

| Test Function | Coverage |
|---------------|----------|
| `TestRoundTime_NilConfig` | Nil config returns original |
| `TestRoundTime_RoundingNone` | RoundingNone returns original |
| `TestRoundTime_ZeroInterval` | Zero interval returns original |
| `TestRoundTime_RoundUp` | 5 cases for round up logic |
| `TestRoundTime_RoundDown` | 4 cases for round down logic |
| `TestRoundTime_RoundNearest` | 5 cases for mathematical rounding |
| `TestRoundTime_DifferentIntervals` | 5/10/30 minute intervals |

**Not Covered**: Add/subtract modes (do not exist yet)

---

## 8. DayPlanInput Structure

**File**: `/home/tolga/projects/terp/apps/api/internal/calculation/types.go` (lines 86-110)

```go
type DayPlanInput struct {
    // Time windows (minutes from midnight)
    ComeFrom  *int
    ComeTo    *int
    GoFrom    *int
    GoTo      *int
    CoreStart *int
    CoreEnd   *int

    // Target hours
    RegularHours int

    // Rules
    Tolerance      ToleranceConfig
    RoundingCome   *RoundingConfig
    RoundingGo     *RoundingConfig
    Breaks         []BreakConfig
    MinWorkTime    *int
    MaxNetWorkTime *int

    // VariableWorkTime enables tolerance_come_minus
    VariableWorkTime bool
}
```

**Missing Fields**:
- `RoundAllBookings bool` - for rounding all bookings vs first/last only
- `RoundingComeAddValue *int` - for add/subtract functionality
- `RoundingGoAddValue *int` - for add/subtract functionality

---

## 9. ZMI Reference

From `/home/tolga/projects/terp/thoughts/shared/reference/zmi-calculation-manual-reference.md` (Section 7.5):

> **Wert addieren und Wert subtrahieren**: "Bei dieser Einstellung wird der eingestellte Wert auf die Buchung addiert oder subtrahiert. Zum Beispiel bei 10 Minuten addieren: 05:55 wird 06:05, 07:32 wird 07:42"

> "Diese Einstellung wird benötigt, wenn die Mitarbeitenden einen langen Weg vom Zeiterfassungsterminal zu ihrem Arbeitsplatz haben oder nach der Schicht noch duschen müssen und diese Zeit soll nicht berücksichtigt werden."

**Use Cases**:
- **Add to arrival**: Walk time from terminal to workplace (employee starts working later than booking)
- **Subtract from departure**: Shower time after shift (employee stops working earlier than booking)

---

## 10. Gap Analysis Summary

| Component | Interval Rounding | Add/Subtract |
|-----------|-------------------|--------------|
| Database Schema | Columns exist | Columns exist |
| Model (fields) | Fields exist | Fields exist |
| Model (type constants) | Exist | **Missing** |
| Calculation RoundingConfig | Type + Interval | **Missing AddValue** |
| Calculation RoundTime | Implemented | **Not implemented** |
| Service mapping | Mapped | **Not mapped** |
| Test coverage | Complete | **None** |

---

## 11. Implementation Approach Options

### Option A: Add as Separate Rounding Types (Per Ticket Spec)

Add `RoundingAdd` and `RoundingSubtract` as new `RoundingType` values:

```go
const (
    RoundingNone     RoundingType = "none"
    RoundingUp       RoundingType = "up"
    RoundingDown     RoundingType = "down"
    RoundingNearest  RoundingType = "nearest"
    RoundingAdd      RoundingType = "add"
    RoundingSubtract RoundingType = "subtract"
)
```

**Pros**: Clean type system, single rounding mode per direction
**Cons**: Cannot combine interval rounding with add/subtract

### Option B: Add Value as Separate Step (ZMI Original Design)

The database schema with separate `rounding_*_add_value` columns suggests ZMI allows combining interval rounding WITH add/subtract as a second step.

**Pros**: More flexible, matches ZMI capability
**Cons**: More complex, needs two-step application

---

## 12. Files to Modify (Per Ticket)

| File | Change |
|------|--------|
| `apps/api/internal/model/dayplan.go` | Add `RoundingAdd` and `RoundingSubtract` constants |
| `apps/api/internal/calculation/types.go` | Add constants + `AddValue` to `RoundingConfig` |
| `apps/api/internal/calculation/rounding.go` | Add add/subtract logic to `RoundTime()` |
| `apps/api/internal/calculation/rounding_test.go` | Add test cases for add/subtract modes |

---

## 13. Related Code References

- `/home/tolga/projects/terp/db/migrations/000015_create_day_plans.up.sql:29-32` - Original rounding columns
- `/home/tolga/projects/terp/db/migrations/000030_add_day_plan_zmi_fields.up.sql:11-13` - Add value columns
- `/home/tolga/projects/terp/apps/api/internal/model/dayplan.go:17-24` - Model RoundingType constants
- `/home/tolga/projects/terp/apps/api/internal/model/dayplan.go:79-94` - Model rounding fields
- `/home/tolga/projects/terp/apps/api/internal/calculation/types.go:62-76` - Calculation RoundingType and Config
- `/home/tolga/projects/terp/apps/api/internal/calculation/rounding.go:1-51` - Rounding implementation
- `/home/tolga/projects/terp/apps/api/internal/calculation/calculator.go:150-161` - Rounding application
- `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go:377-391` - Service mapping

---

## 14. Dependencies

| Dependency | Status |
|------------|--------|
| TICKET-063 (Rounding Logic) | Complete - interval rounding works |
| TICKET-118 / NOK-145 (Day Plan ZMI Fields) | Complete - `RoundingComeAddValue` and `RoundingGoAddValue` fields exist |

---

## 15. Key Decisions Needed

1. **Type vs. Value Approach**: Should add/subtract be separate `RoundingType` values (per ticket spec) or applied as a secondary step (per database design)?

2. **Combination Behavior**: Can a day plan have both interval rounding AND add/subtract, or is it mutually exclusive?

3. **Negative Value Handling**: What if subtract results in negative time? (Ticket spec suggests clamping to 0)

---

## 16. Open Questions

1. The database schema stores add_value separately from type. Does ZMI allow combining interval rounding with add/subtract? The ticket spec treats them as mutually exclusive rounding types.

2. Should `RoundAllBookings` flag also be added to `DayPlanInput` as part of this ticket or separate?
