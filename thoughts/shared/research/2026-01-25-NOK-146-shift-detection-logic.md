# Research: NOK-146 - TICKET-119: Create Shift Detection Logic

**Date**: 2026-01-25
**Ticket**: NOK-146

## Summary

This document researches the existing codebase to understand how to implement automatic shift detection based on arrival/departure times. When an employee's booking does not fall within the expected time window of their assigned day plan, the system should search alternative day plans to find a matching shift.

---

## 1. ZMI Reference Manual Analysis

### 1.1 Core Shift Detection Concept (Section 10)

From `thoughts/shared/reference/zmi-calculataion-manual-reference.md` (pages 48-49):

**Arrival-Based Detection (Automatische Schichterkennung Kommen)**:
> "Wenn hier in von und bis eine Uhrzeit eingetragen wird, pruft das Programm, ob die Kommt-Buchung in diesem Bereich liegt. Wenn ja, ist der aktuelle Tagesplan gultig. Wenn nicht, sucht ZMI Time in den alternativen Tagesplanen, ob ein passender Tagesplan zugewiesen ist."

Translation: When arrival from/to times are configured, the program checks if the arrival booking falls within this range. If yes, the current day plan is valid. If not, ZMI Time searches the alternative day plans for a matching plan.

**Departure-Based Detection (Automatische Schichterkennung Gehen)**:
> "Verhalt sich genauso wie bei Kommen, nur wird hier die Geht-Buchung gepruft."

Translation: Behaves the same as arrival detection, but checks the departure booking.

**Both Windows Check**:
> "Es ist moglich, in einem Tagesplan auch beide Buchungen zu prufen."

Translation: It is possible to check both arrival and departure bookings in one day plan.

**Alternative Day Plans (Alternative Tagesplane)**:
> "Es konnen bis zu sechs verschiedene Tagesplane als Alternativen hinterlegt werden, indem man deren Tagesplanklrzel eintragt."

Translation: Up to six different day plans can be stored as alternatives by entering their day plan codes.

**No Match Found Error**:
> "Fur den Fall, dass kein passender Tagesplan gefunden wird, erzeugt ZMI Time eine Meldung im Korrekturassistent: 'Kein passender Zeitplan gefunden'."

Translation: If no matching day plan is found, ZMI Time generates a message in the correction assistant: "No matching time plan found".

### 1.2 Derived Logic from Manual

```
func detectShift(booking, dayPlan):
    // Check if arrival is in window
    if dayPlan.ShiftDetection.ArrivalEnabled:
        if booking.Direction == DirectionIn:
            if booking.Time >= dayPlan.ShiftDetection.ArrivalFrom &&
               booking.Time <= dayPlan.ShiftDetection.ArrivalTo:
                return dayPlan  // Current plan matches

    // Check if departure is in window
    if dayPlan.ShiftDetection.DepartureEnabled:
        if booking.Direction == DirectionOut:
            if booking.Time >= dayPlan.ShiftDetection.DepartureFrom &&
               booking.Time <= dayPlan.ShiftDetection.DepartureTo:
                return dayPlan  // Current plan matches

    // Search alternatives (up to 6)
    for _, altPlanID := range dayPlan.ShiftDetection.Alternatives:
        altPlan := loadDayPlan(altPlanID)
        if matchesShiftWindow(booking, altPlan):
            return altPlan

    // No match
    createCorrectionError("Kein passender Zeitplan gefunden")
    return dayPlan  // Keep original
```

---

## 2. Existing DayPlan Model Analysis

### 2.1 Location

`/home/tolga/projects/terp/apps/api/internal/model/dayplan.go`

### 2.2 Shift Detection Fields (Lines 110-122)

The DayPlan model already has all necessary fields for shift detection:

```go
// ZMI: Schichterkennung - shift detection windows (minutes from midnight)
ShiftDetectArriveFrom *int `gorm:"type:int" json:"shift_detect_arrive_from,omitempty"`
ShiftDetectArriveTo   *int `gorm:"type:int" json:"shift_detect_arrive_to,omitempty"`
ShiftDetectDepartFrom *int `gorm:"type:int" json:"shift_detect_depart_from,omitempty"`
ShiftDetectDepartTo   *int `gorm:"type:int" json:"shift_detect_depart_to,omitempty"`

// ZMI: Alternative day plans for shift detection (up to 6)
ShiftAltPlan1 *uuid.UUID `gorm:"column:shift_alt_plan_1;type:uuid" json:"shift_alt_plan_1,omitempty"`
ShiftAltPlan2 *uuid.UUID `gorm:"column:shift_alt_plan_2;type:uuid" json:"shift_alt_plan_2,omitempty"`
ShiftAltPlan3 *uuid.UUID `gorm:"column:shift_alt_plan_3;type:uuid" json:"shift_alt_plan_3,omitempty"`
ShiftAltPlan4 *uuid.UUID `gorm:"column:shift_alt_plan_4;type:uuid" json:"shift_alt_plan_4,omitempty"`
ShiftAltPlan5 *uuid.UUID `gorm:"column:shift_alt_plan_5;type:uuid" json:"shift_alt_plan_5,omitempty"`
ShiftAltPlan6 *uuid.UUID `gorm:"column:shift_alt_plan_6;type:uuid" json:"shift_alt_plan_6,omitempty"`
```

### 2.3 Existing Helper Methods (Lines 172-199)

The DayPlan model already has helper methods:

```go
// HasShiftDetection returns true if shift detection windows are configured.
func (dp *DayPlan) HasShiftDetection() bool {
    return dp.ShiftDetectArriveFrom != nil || dp.ShiftDetectArriveTo != nil ||
        dp.ShiftDetectDepartFrom != nil || dp.ShiftDetectDepartTo != nil
}

// GetAlternativePlanIDs returns all configured alternative day plan IDs for shift detection.
func (dp *DayPlan) GetAlternativePlanIDs() []uuid.UUID {
    ids := make([]uuid.UUID, 0, 6)
    if dp.ShiftAltPlan1 != nil {
        ids = append(ids, *dp.ShiftAltPlan1)
    }
    // ... repeated for ShiftAltPlan2-6
    return ids
}
```

### 2.4 Model Tests (Lines 109-205 of dayplan_test.go)

Tests already exist for `HasShiftDetection()` and `GetAlternativePlanIDs()`:

```go
func TestDayPlan_HasShiftDetection(t *testing.T) {
    tests := []struct {
        name     string
        dayPlan  DayPlan
        expected bool
    }{
        {"no shift detection", DayPlan{}, false},
        {"arrive_from set", DayPlan{ShiftDetectArriveFrom: intPtr(360)}, true},
        // ... more cases
    }
}

func TestDayPlan_GetAlternativePlanIDs(t *testing.T) {
    // Tests for returning correct alternative plan IDs
}
```

---

## 3. Existing Calculation Package Analysis

### 3.1 Location

`/home/tolga/projects/terp/apps/api/internal/calculation/`

### 3.2 Package Structure Pattern

Files in the calculation package:

| File | Purpose |
|------|---------|
| `doc.go` | Package documentation |
| `types.go` | Core types (BookingInput, DayPlanInput, CalculationResult) |
| `errors.go` | Error and warning code constants |
| `calculator.go` | Main Calculator struct with Calculate() method |
| `pairing.go` | Booking pairing logic |
| `tolerance.go` | Tolerance application functions |
| `rounding.go` | Time rounding functions |
| `breaks.go` | Break deduction calculations |
| `monthly.go` | Monthly aggregation logic |
| `vacation.go` | Vacation calculation logic |

### 3.3 Code Style Patterns

**Function Organization** (from `tolerance.go`):
- Exported functions with clear documentation
- Short, focused functions (e.g., `ApplyComeTolerance`, `ApplyGoTolerance`)
- Validation functions that return error slices (e.g., `ValidateTimeWindow`, `ValidateCoreHours`)

**Type Pattern** (from `types.go`):
- String-based enums with constants
- Input/Output structs with clear separation
- Config structs with optional pointer fields

Example enum pattern:
```go
type RoundingType string

const (
    RoundingNone    RoundingType = "none"
    RoundingUp      RoundingType = "up"
    RoundingDown    RoundingType = "down"
    RoundingNearest RoundingType = "nearest"
)
```

**Error Code Pattern** (from `errors.go`):
```go
const (
    ErrCodeMissingCome = "MISSING_COME"
    ErrCodeMissingGo   = "MISSING_GO"
    // ...
)
```

### 3.4 Calculator Pattern (from `calculator.go`)

The Calculator uses a step-by-step processing approach:
```go
func (c *Calculator) Calculate(input CalculationInput) CalculationResult {
    result := CalculationResult{/* init */}

    // Step 1: Apply rounding and tolerance
    processedBookings := c.processBookings(...)

    // Step 2: Pair bookings
    pairingResult := PairBookings(processedBookings)

    // Step 3: Calculate first come / last go
    result.FirstCome = FindFirstCome(processedBookings)
    result.LastGo = FindLastGo(processedBookings)

    // ... more steps
    return result
}
```

### 3.5 Helper Functions (from `pairing.go`)

Existing helpers that can be used:
```go
// FindFirstCome returns the earliest arrival time, or nil if no arrivals.
func FindFirstCome(bookings []BookingInput) *int

// FindLastGo returns the latest departure time, or nil if no departures.
func FindLastGo(bookings []BookingInput) *int
```

---

## 4. DayPlan Repository Analysis

### 4.1 Location

`/home/tolga/projects/terp/apps/api/internal/repository/dayplan.go`

### 4.2 Available Methods

```go
type DayPlanRepository struct {
    db *DB
}

// Key methods for shift detection:
func (r *DayPlanRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.DayPlan, error)
func (r *DayPlanRepository) GetWithDetails(ctx context.Context, id uuid.UUID) (*model.DayPlan, error)
```

### 4.3 Error Handling Pattern

```go
var ErrDayPlanNotFound = errors.New("day plan not found")

if errors.Is(err, gorm.ErrRecordNotFound) {
    return nil, ErrDayPlanNotFound
}
```

---

## 5. Test Pattern Analysis

### 5.1 Test Organization (from `tolerance_test.go`)

```go
package calculation_test

import (
    "testing"
    "github.com/stretchr/testify/assert"
    "github.com/tolga/terp/internal/calculation"
)

func TestApplyComeTolerance_LateArrival(t *testing.T) {
    expected := 480 // 08:00
    tolerance := calculation.ToleranceConfig{ComePlus: 5, ComeMinus: 5}

    tests := []struct {
        name     string
        actual   int
        expected int
    }{
        {"within tolerance", 483, 480},
        {"at tolerance boundary", 485, 480},
        {"beyond tolerance", 486, 486},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := calculation.ApplyComeTolerance(tt.actual, &expected, tolerance)
            assert.Equal(t, tt.expected, result)
        })
    }
}
```

### 5.2 Helper Functions

```go
func intPtr(v int) *int {
    return &v
}
```

---

## 6. Integration Points

### 6.1 Where Shift Detection Runs

From the ticket TICKET-119:
> "Shift detection runs during daily calculation, after bookings are loaded but before calculation"
> "When a shift is detected, the result updates the EmployeeDayPlan record with the matched day plan"
> "Integration point: Call `ShiftDetector.DetectShift()` from daily calculation service before building calculation input"

### 6.2 DayPlanLoader Interface Pattern

The ticket specifies an interface for loading day plans:
```go
// DayPlanLoader loads day plans by ID
type DayPlanLoader interface {
    GetByID(id uuid.UUID) (*model.DayPlan, error)
}
```

This follows the dependency injection pattern used elsewhere in the codebase.

---

## 7. Key Implementation Details

### 7.1 Files to Create

1. `apps/api/internal/calculation/shift.go` - Main implementation
2. `apps/api/internal/calculation/shift_test.go` - Unit tests

### 7.2 Types to Define

```go
type ShiftMatchType string

const (
    ShiftMatchArrival   ShiftMatchType = "arrival"
    ShiftMatchDeparture ShiftMatchType = "departure"
    ShiftMatchBoth      ShiftMatchType = "both"
    ShiftMatchNone      ShiftMatchType = "none"
)

type ShiftDetectionResult struct {
    MatchedPlanID    uuid.UUID
    MatchedPlanCode  string
    IsOriginalPlan   bool
    MatchedBy        ShiftMatchType
    HasError         bool
    ErrorMessage     string
}
```

### 7.3 Core Detection Logic

```go
func (sd *ShiftDetector) DetectShift(
    assignedPlan *model.DayPlan,
    firstArrival *int,
    lastDeparture *int,
) ShiftDetectionResult
```

Input parameters:
- `assignedPlan`: The day plan assigned to the employee for this day
- `firstArrival`: First arrival time in minutes from midnight (from `FindFirstCome`)
- `lastDeparture`: Last departure time in minutes from midnight (from `FindLastGo`)

### 7.4 Validation Function

```go
func ValidateShiftDetectionConfig(plan *model.DayPlan) []string
```

Validations needed:
- Arrival window: from < to, both set or neither
- Departure window: from < to, both set or neither
- Time range: 0-1440 minutes

### 7.5 Error Code to Add

Consider adding to `errors.go`:
```go
const ErrCodeNoMatchingShift = "NO_MATCHING_SHIFT"
```

---

## 8. Summary of Existing Assets

| Asset | Location | Status |
|-------|----------|--------|
| ShiftDetect fields in DayPlan | `model/dayplan.go` lines 110-122 | Ready to use |
| ShiftAltPlan1-6 fields | `model/dayplan.go` lines 117-122 | Ready to use |
| HasShiftDetection() method | `model/dayplan.go` lines 172-176 | Ready to use |
| GetAlternativePlanIDs() method | `model/dayplan.go` lines 178-199 | Ready to use |
| Model tests | `model/dayplan_test.go` lines 109-205 | Existing |
| FindFirstCome() | `calculation/pairing.go` lines 243-254 | Ready to use |
| FindLastGo() | `calculation/pairing.go` lines 257-268 | Ready to use |
| DayPlanRepository.GetByID() | `repository/dayplan.go` lines 37-49 | Ready to use |
| Error code pattern | `calculation/errors.go` | Pattern to follow |
| Test pattern | `calculation/tolerance_test.go` | Pattern to follow |

---

## 9. ZMI Compliance Mapping

| ZMI Feature | German | Implementation |
|-------------|--------|----------------|
| Arrival detection | Schichterkennung Kommen | Check ShiftDetectArriveFrom/To |
| Departure detection | Schichterkennung Gehen | Check ShiftDetectDepartFrom/To |
| Both windows | Beide pruefen | Both must match when configured |
| Alternative plans | Alternative Tagesplane | ShiftAltPlan1-6, up to 6 |
| No match error | Kein passender Zeitplan gefunden | Return error, fall back to original |

---

## 10. Dependencies

| Ticket | Description | Status |
|--------|-------------|--------|
| TICKET-118 | Add missing day plan ZMI fields | Completed |
| TICKET-068 | Create daily calculator | Completed |

The shift detection fields and helper methods already exist in the DayPlan model, so no migration is needed.
