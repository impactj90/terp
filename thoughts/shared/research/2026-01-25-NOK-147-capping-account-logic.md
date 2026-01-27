# Research: NOK-147 - TICKET-120: Create Capping Account Logic

**Date**: 2026-01-25
**Ticket**: NOK-147

## Summary

This document researches the existing codebase to understand how to implement Kappungskonto (capping account) logic that tracks time cut off when an employee arrives before the evaluation window or exceeds maximum net work time.

---

## 1. ZMI Reference Manual Analysis

### 1.1 Kappungskonto - Capping Account (Section 8.6)

From `thoughts/shared/reference/zmi-calculataion-manual-reference.md` (pages 49-50):

**Definition**:
> "Das Kappungskonto zahlt die Zeit, die dem/der Mitarbeiter/-in abgeschnitten wurde, wenn er/sie vor dem Bewertungsrahmen eines Tages kommt."

Translation: The capping account counts the time that was cut off from the employee when they arrive before the evaluation frame of a day.

**Example**:
> "Im Tagesplan wurde bei Kommen von 07:00 Uhr eingestellt, der/die Mitarbeiter/-in kommt aber um 6:45 Uhr, dann stehen auf diesem Konto 15 Minuten."

Translation: In the day plan, 'Kommen von' was set to 07:00, but the employee arrives at 6:45, then 15 minutes are on this account.

### 1.2 Max. Netto-Arbeitszeit - Maximum Net Work Time (Section 8.5)

From the ZMI manual (page 50):

> "Wenn im Feld Max. Netto-Arbeitszeit ein Wert eingetragen ist, z.B. 10 Stunden, ist die Tagessumme entsprechend begrenzt. Arbeitet der/die Mitarbeiter/-in langer, werden die Stunden, die uber dem Wert liegen, gekappt."

Translation: If a value is entered in the 'Max. Netto-Arbeitszeit' field (e.g., 10 hours), the daily total is limited accordingly. If the employee works longer, the hours above the value are capped.

**Derived Logic**:
```
if (MaxNetWorkTime > 0 && netTime > MaxNetWorkTime) {
    cappedTime = netTime - MaxNetWorkTime
    netTime = MaxNetWorkTime
    // cappedTime goes to Kappungskonto if configured
}
```

### 1.3 Tolerance and Capping Interaction (Section 6)

From the ZMI manual (pages 43-44):

**Tolerance Kommen minus (Gleitzeit)**:
> "Bei einem Gleitzeitplan besteht mit der Toleranz die Moglichkeit, Buchungen um die eingestellten Uhrzeiten um Kommen von und Gehen bis nach vorne oder hinten zu offnen."

Translation: With a flextime plan, tolerance provides the possibility to extend bookings around the set times for 'Kommen von' and 'Gehen bis' forwards or backwards.

**Variable Arbeitszeit Flag (Festarbeitszeit)**:
> "Die Toleranz Kommen (-) wird nur dann berucksichtigt, wenn der Haken variable Arbeitszeit gesetzt wurde."

Translation: The 'Toleranz Kommen (-)' is only considered when the checkbox 'variable Arbeitszeit' is set.

### 1.4 Time Window Crediting Logic (Section 4)

From the ZMI manual (page 41):

> "Im genannten Fall wird erst ab 06:00 Uhr morgens die Zeit angerechnet. D.h. bucht der/die Mitarbeiter/-in vor 06:00 Uhr Kommen, wird die Tages-Ist-Zeit von 06:00 Uhr an gerechnet. Es sei denn, uber das Feld Toleranz Kommen minus ist ein weiteres Zeitfenster eingerichtet."

Translation: Time is only credited from 06:00 in the morning. If the employee books arrival before 06:00, the daily actual time is calculated from 06:00. Unless an additional time window is set up via the 'Toleranz Kommen minus' field.

**Derived Window Capping Logic**:
```
if (bookingTime < KommenVon) {
    if (ToleranzKommenMinus > 0) {
        creditFrom = KommenVon - ToleranzKommenMinus
        if (bookingTime < creditFrom) {
            cappedTime = creditFrom - bookingTime
            adjustedTime = creditFrom
        } else {
            adjustedTime = bookingTime
            cappedTime = 0
        }
    } else {
        cappedTime = KommenVon - bookingTime
        adjustedTime = KommenVon
    }
    markCoreTimeViolation()
}
```

---

## 2. Existing Calculation Package Analysis

### 2.1 Package Location

`/home/tolga/projects/terp/apps/api/internal/calculation/`

### 2.2 Current Package Structure

| File | Purpose |
|------|---------|
| `doc.go` | Package documentation |
| `types.go` | Core types (BookingInput, DayPlanInput, CalculationResult) |
| `errors.go` | Error and warning code constants |
| `calculator.go` | Main Calculator struct with Calculate() method |
| `pairing.go` | Booking pairing logic |
| `tolerance.go` | Tolerance application functions |
| `rounding.go` | Time rounding functions |
| `breaks.go` | Break deduction and net time calculations |
| `monthly.go` | Monthly aggregation logic |
| `vacation.go` | Vacation calculation logic |
| `shift.go` | Shift detection logic |

### 2.3 Existing CalculationResult (types.go lines 124-151)

```go
type CalculationResult struct {
    // Time calculations (all in minutes)
    GrossTime  int // Total time before breaks
    NetTime    int // Time after breaks
    TargetTime int // Expected work time from day plan
    Overtime   int // max(0, NetTime - TargetTime)
    Undertime  int // max(0, TargetTime - NetTime)
    BreakTime  int // Total break duration

    // Booking summary
    FirstCome    *int
    LastGo       *int
    BookingCount int

    // Calculated times per booking
    CalculatedTimes map[uuid.UUID]int

    // Pairing results
    Pairs          []BookingPair
    UnpairedInIDs  []uuid.UUID
    UnpairedOutIDs []uuid.UUID

    // Status
    HasError   bool
    ErrorCodes []string
    Warnings   []string
}
```

**Note**: CalculationResult does NOT currently track capped time. A new field will be needed.

### 2.4 DayPlanInput Structure (types.go lines 86-106)

```go
type DayPlanInput struct {
    // Time windows (minutes from midnight)
    ComeFrom  *int // Earliest allowed arrival
    ComeTo    *int // Latest allowed arrival
    GoFrom    *int // Earliest allowed departure
    GoTo      *int // Latest allowed departure
    CoreStart *int // Flextime core hours start
    CoreEnd   *int // Flextime core hours end

    // Target hours
    RegularHours int // Target work duration in minutes

    // Rules
    Tolerance      ToleranceConfig
    RoundingCome   *RoundingConfig
    RoundingGo     *RoundingConfig
    Breaks         []BreakConfig
    MinWorkTime    *int // Minimum work duration
    MaxNetWorkTime *int // Maximum credited work time
}
```

**Note**: `ComeFrom` defines the evaluation window start. Currently, `MaxNetWorkTime` is used in `CalculateNetTime()` but the capped amount is not tracked.

### 2.5 ToleranceConfig (types.go lines 78-84)

```go
type ToleranceConfig struct {
    ComePlus  int // Grace period for late arrivals (minutes)
    ComeMinus int // Grace period for early arrivals (minutes)
    GoPlus    int // Grace period for late departures (minutes)
    GoMinus   int // Grace period for early departures (minutes)
}
```

---

## 3. Current Tolerance Implementation

### 3.1 ApplyComeTolerance (tolerance.go lines 5-27)

```go
func ApplyComeTolerance(actualTime int, expectedTime *int, tolerance ToleranceConfig) int {
    if expectedTime == nil {
        return actualTime
    }
    exp := *expectedTime

    // Late arrival: check tolerance plus
    if actualTime > exp {
        if actualTime <= exp+tolerance.ComePlus {
            return exp
        }
    }

    // Early arrival: check tolerance minus
    if actualTime < exp {
        if actualTime >= exp-tolerance.ComeMinus {
            return exp
        }
    }

    return actualTime
}
```

**Key Observation**: Current tolerance normalizes times WITHIN the tolerance window but does NOT track capped time for arrivals BEFORE the window.

### 3.2 Tolerance Usage in Calculator (calculator.go lines 103-133)

```go
func (c *Calculator) processBookings(
    bookings []BookingInput,
    dayPlan DayPlanInput,
    result *CalculationResult,
) []BookingInput {
    // ...
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
    // ...
}
```

**Key Observation**: Tolerance is applied against `ComeTo` and `GoFrom` but NOT against `ComeFrom` (the evaluation window start). This is where capping logic differs from tolerance logic.

---

## 4. Existing Net Time Capping (breaks.go)

### 4.1 CalculateNetTime (breaks.go lines 162-176)

```go
func CalculateNetTime(grossTime, breakTime int, maxNetWorkTime *int) (netTime int, warnings []string) {
    warnings = make([]string, 0)
    netTime = grossTime - breakTime

    if netTime < 0 {
        netTime = 0
    }

    if maxNetWorkTime != nil && netTime > *maxNetWorkTime {
        netTime = *maxNetWorkTime
        warnings = append(warnings, WarnCodeMaxTimeReached)
    }

    return netTime, warnings
}
```

**Key Observation**: When max net work time is exceeded, the function:
- Caps `netTime` at `maxNetWorkTime`
- Adds a warning `WarnCodeMaxTimeReached`
- Does NOT track the capped amount separately

### 4.2 Warning Code (errors.go line 35)

```go
WarnCodeMaxTimeReached = "MAX_TIME_REACHED" // NetTime capped at max
```

---

## 5. DayPlan Model Fields

### 5.1 Location

`/home/tolga/projects/terp/apps/api/internal/model/dayplan.go`

### 5.2 Relevant Fields (lines 57-89)

```go
// Time windows (minutes from midnight)
ComeFrom  *int `gorm:"type:int" json:"come_from,omitempty"`
ComeTo    *int `gorm:"type:int" json:"come_to,omitempty"`
GoFrom    *int `gorm:"type:int" json:"go_from,omitempty"`
GoTo      *int `gorm:"type:int" json:"go_to,omitempty"`

// Tolerance settings
ToleranceComePlus  int `gorm:"type:int;default:0" json:"tolerance_come_plus"`
ToleranceComeMinus int `gorm:"type:int;default:0" json:"tolerance_come_minus"`
ToleranceGoPlus    int `gorm:"type:int;default:0" json:"tolerance_go_plus"`
ToleranceGoMinus   int `gorm:"type:int;default:0" json:"tolerance_go_minus"`

// Caps
MaxNetWorkTime *int `gorm:"type:int" json:"max_net_work_time,omitempty"`

// ZMI: Variable Arbeitszeit - enables tolerance_come_minus for FAZ plans
VariableWorkTime bool `gorm:"default:false" json:"variable_work_time"`
```

### 5.3 Key Fields for Capping

| Field | Purpose in Capping |
|-------|-------------------|
| `ComeFrom` | Start of arrival evaluation window |
| `ComeTo` | End of arrival evaluation window |
| `GoFrom` | Start of departure evaluation window |
| `GoTo` | End of departure evaluation window |
| `ToleranceComeMinus` | Extension before ComeFrom (only with VariableWorkTime for FAZ) |
| `ToleranceGoPlus` | Extension after GoTo |
| `MaxNetWorkTime` | Maximum net time before capping |
| `VariableWorkTime` | Enables tolerance_come_minus for fixed working time |

---

## 6. DailyValue Model (Where Capped Time Should Be Stored)

### 6.1 Location

`/home/tolga/projects/terp/apps/api/internal/model/dailyvalue.go`

### 6.2 Current Fields (lines 11-44)

```go
type DailyValue struct {
    // Core time values (all in minutes)
    GrossTime  int `gorm:"default:0" json:"gross_time"`
    NetTime    int `gorm:"default:0" json:"net_time"`
    TargetTime int `gorm:"default:0" json:"target_time"`
    Overtime   int `gorm:"default:0" json:"overtime"`
    Undertime  int `gorm:"default:0" json:"undertime"`
    BreakTime  int `gorm:"default:0" json:"break_time"`

    // Status
    HasError   bool           `gorm:"default:false" json:"has_error"`
    ErrorCodes pq.StringArray `gorm:"type:text[]" json:"error_codes,omitempty"`
    Warnings   pq.StringArray `gorm:"type:text[]" json:"warnings,omitempty"`
    // ...
}
```

**Note**: DailyValue does NOT currently have a field for capped time. A new field will be needed.

---

## 7. Capping Sources Analysis

Based on ZMI documentation, there are multiple sources of capped time:

### 7.1 Early Arrival Capping

**When**: Employee arrives BEFORE `ComeFrom` (minus tolerance if applicable)

**Logic**:
```
effectiveWindowStart = ComeFrom
if (VariableWorkTime && ToleranceComeMinus > 0) {
    effectiveWindowStart = ComeFrom - ToleranceComeMinus
}

if (arrivalTime < effectiveWindowStart) {
    cappedMinutes = effectiveWindowStart - arrivalTime
    adjustedArrival = effectiveWindowStart
}
```

### 7.2 Late Departure Capping

**When**: Employee departs AFTER `GoTo` (plus tolerance if applicable)

**Logic**:
```
effectiveWindowEnd = GoTo
if (ToleranceGoPlus > 0) {
    effectiveWindowEnd = GoTo + ToleranceGoPlus
}

if (departureTime > effectiveWindowEnd) {
    cappedMinutes = departureTime - effectiveWindowEnd
    adjustedDeparture = effectiveWindowEnd
}
```

### 7.3 Max Net Work Time Capping

**When**: Calculated net time exceeds `MaxNetWorkTime`

**Logic** (already partially implemented):
```
if (MaxNetWorkTime != nil && netTime > *MaxNetWorkTime) {
    cappedMinutes = netTime - *MaxNetWorkTime
    netTime = *MaxNetWorkTime
}
```

---

## 8. Code Style Patterns to Follow

### 8.1 Enum Pattern (from types.go)

```go
type CappingSource string

const (
    CappingSourceEarlyArrival CappingSource = "early_arrival"
    CappingSourceLateLeave    CappingSource = "late_leave"
    CappingSourceMaxNetTime   CappingSource = "max_net_time"
)
```

### 8.2 Result Struct Pattern (from monthly.go)

```go
type CappedTime struct {
    Minutes int
    Source  CappingSource
    Reason  string
}

type CappingResult struct {
    TotalCapped int
    Items       []CappedTime
}
```

### 8.3 Pure Function Pattern (from tolerance.go)

Functions should be pure with clear inputs/outputs:
```go
func CalculateEarlyArrivalCapping(
    arrivalTime int,
    windowStart int,
    toleranceMinus int,
    variableWorkTime bool,
) *CappedTime
```

---

## 9. Integration Points

### 9.1 Calculator Integration (calculator.go)

Current calculator flow:
1. Process bookings (tolerance + rounding)
2. Pair bookings
3. Calculate first come / last go
4. Validate time windows
5. Validate core hours
6. Calculate gross time
7. Calculate break deduction
8. Calculate net time (already applies MaxNetWorkTime cap)
9. Calculate overtime/undertime

**Capping should be integrated at steps 1, 7-8**:
- Step 1: Apply window capping for early arrival / late departure
- Step 8: Track capped amount from MaxNetWorkTime

### 9.2 Service Layer

The DailyCalculationService would need to:
1. Pass window settings to Calculator
2. Store capped time in DailyValue

---

## 10. Key Implementation Details

### 10.1 Files to Create

1. `apps/api/internal/calculation/capping.go` - Capping logic
2. `apps/api/internal/calculation/capping_test.go` - Unit tests

### 10.2 Types to Define

```go
type CappingSource string

const (
    CappingSourceEarlyArrival CappingSource = "early_arrival"
    CappingSourceLateLeave    CappingSource = "late_leave"
    CappingSourceMaxNetTime   CappingSource = "max_net_time"
    CappingSourceTolerance    CappingSource = "tolerance"
)

type CappedTime struct {
    Minutes int
    Source  CappingSource
    Reason  string
}

type CappingResult struct {
    TotalCapped int
    Items       []CappedTime
}
```

### 10.3 Core Functions to Implement

```go
// CalculateEarlyArrivalCapping determines if arrival is before evaluation window
func CalculateEarlyArrivalCapping(
    arrivalTime int,
    windowStart int,
    toleranceMinus int,
    variableWorkTime bool,
) *CappedTime

// CalculateMaxNetTimeCapping determines if net time exceeds max
func CalculateMaxNetTimeCapping(netWorkTime, maxNetWorkTime int) *CappedTime

// AggregateCapping combines multiple capping results
func AggregateCapping(items ...*CappedTime) CappingResult

// ApplyCapping adjusts net work time and returns capped amount
func ApplyCapping(netWorkTime, maxNetWorkTime int) (adjustedNet, capped int)

// ApplyWindowCapping adjusts booking time and returns capped amount
func ApplyWindowCapping(
    bookingTime int,
    windowStart int,
    windowEnd int,
    toleranceMinus int,
    tolerancePlus int,
    isArrival bool,
) (adjustedTime, capped int)
```

### 10.4 CalculationResult Extension

Add to CalculationResult:
```go
type CalculationResult struct {
    // ... existing fields ...

    // Capping results (new)
    CappedTime int           // Total minutes capped
    Capping    CappingResult // Detailed capping breakdown
}
```

---

## 11. Summary of Existing Assets

| Asset | Location | Status |
|-------|----------|--------|
| ComeFrom/ComeTo/GoFrom/GoTo | `model/dayplan.go` lines 57-61 | Ready to use |
| ToleranceComeMinus | `model/dayplan.go` line 74 | Ready to use |
| VariableWorkTime flag | `model/dayplan.go` line 89 | Ready to use |
| MaxNetWorkTime | `model/dayplan.go` line 86 | Ready to use |
| DayPlanInput with windows | `calculation/types.go` lines 88-94 | Ready to use |
| ToleranceConfig | `calculation/types.go` lines 78-84 | Ready to use |
| CalculateNetTime (partial cap) | `calculation/breaks.go` lines 162-176 | Needs extension |
| WarnCodeMaxTimeReached | `calculation/errors.go` line 35 | Ready to use |
| Calculator.processBookings | `calculation/calculator.go` lines 103-133 | Integration point |
| DailyValue model | `model/dailyvalue.go` | Needs CappedTime field |

---

## 12. ZMI Compliance Mapping

| ZMI Feature | German | Implementation |
|-------------|--------|----------------|
| Capping account | Kappungskonto | CappingResult struct |
| Early arrival capping | Vor Bewertungsrahmen | CalculateEarlyArrivalCapping() |
| Max net time capping | Max. Netto-Arbeitszeit | CalculateMaxNetTimeCapping() |
| Variable work time | variable Arbeitszeit | Check VariableWorkTime flag |
| Tolerance minus | Toleranz Kommen (-) | Apply before capping check |
| Evaluation window | Bewertungsrahmen | ComeFrom/ComeTo windows |

---

## 13. Test Cases Required

### 13.1 Early Arrival Capping Tests

| Scenario | ComeFrom | Tolerance | VariableWorkTime | Arrival | Expected Capped |
|----------|----------|-----------|------------------|---------|-----------------|
| Within window | 07:00 | 0 | false | 07:15 | 0 |
| At window start | 07:00 | 0 | false | 07:00 | 0 |
| Before window, no tolerance | 07:00 | 0 | false | 06:45 | 15 |
| Before window, with tolerance (FAZ) | 07:00 | 30 | true | 06:45 | 0 |
| Before tolerance window | 07:00 | 30 | true | 06:15 | 15 |
| Tolerance disabled for FAZ | 07:00 | 30 | false | 06:45 | 15 |

### 13.2 Max Net Time Capping Tests

| Scenario | MaxNetTime | NetTime | Expected Capped |
|----------|------------|---------|-----------------|
| Under limit | 600 | 540 | 0 |
| At limit | 600 | 600 | 0 |
| Over limit | 600 | 660 | 60 |
| No limit set | nil | 660 | 0 |

### 13.3 Aggregation Tests

| Items | Expected Total |
|-------|----------------|
| Early 15 + MaxNet 30 | 45 |
| No capping | 0 |

---

## 14. Dependencies

| Ticket | Description | Status |
|--------|-------------|--------|
| TICKET-068 | Create daily calculator | Completed |
| N/A | DailyValue model | Exists (needs field) |
| N/A | DayPlan model | Exists (has all fields) |

---

## 15. Open Questions

1. **CappedTime Storage**: Should we add a `CappedTime int` field to DailyValue, or store detailed breakdown in a separate table/JSON field?

2. **Late Departure**: The ZMI manual primarily discusses early arrival capping. Should late departure (after GoTo + tolerance) also be tracked?

3. **Core Time Violation**: The manual mentions marking core time violations when arriving before the window. Should capping also trigger a specific error code?

4. **Monthly Aggregation**: Should capped time be aggregated at the monthly level like other time values?

These questions may be clarified during implementation or by reviewing additional ZMI documentation.
