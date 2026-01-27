---
date: 2026-01-22T11:27:21+01:00
researcher: tolga
git_commit: 9192b323908c8d2a506df6571e054ae8b72a8b30
branch: master
repository: terp
topic: "TICKET-064: Create Fixed Break Deduction"
tags: [research, codebase, calculation, breaks, fixed-break]
status: complete
last_updated: 2026-01-22
last_updated_by: tolga
last_updated_note: "Added ZMI manual analysis and implementation decisions"
---

# Research: TICKET-064 - Create Fixed Break Deduction

**Date**: 2026-01-22T11:27:21+01:00
**Researcher**: tolga
**Git Commit**: 9192b323908c8d2a506df6571e054ae8b72a8b30
**Branch**: master
**Repository**: terp

## Research Question

What exists in the codebase for implementing TICKET-064 (fixed break deduction logic), and how do the existing types and functions compare to what the ticket proposes?

## Summary

The calculation package at `apps/api/internal/calculation/` already contains break deduction logic in `breaks.go` and `breaks_test.go`. The existing implementation differs significantly from what TICKET-064 proposes:

| Aspect | Existing Implementation | TICKET-064 Proposal |
|--------|------------------------|---------------------|
| Main function | `CalculateBreakDeduction(recordedBreakTime, grossWorkTime, breakConfigs)` | `DeductFixedBreaks(workPairs []BookingPair, breaks []BreakConfig)` |
| Input | Gross work time (int) | BookingPair slices with StartTime/EndTime |
| Fixed break logic | Adds duration if threshold met | Calculates overlap with break window |
| Result type | `BreakDeductionResult{DeductedMinutes, Warnings}` | `BreakDeductionResult{NetTime, TotalBreakTime, BreakDetails}` |
| Overlap check | Not implemented | Uses `calculateOverlap()` function |

## Detailed Findings

### Existing breaks.go Implementation

**Path**: `apps/api/internal/calculation/breaks.go`

#### BreakDeductionResult Type (lines 3-7)

```go
type BreakDeductionResult struct {
    DeductedMinutes int      // Total minutes to deduct
    Warnings        []string // Any warnings generated
}
```

#### CalculateBreakDeduction Function (lines 9-55)

The main break deduction function takes:
- `recordedBreakTime int` - Total break minutes from manual bookings
- `grossWorkTime int` - Total gross work time
- `breakConfigs []BreakConfig` - Break rules from day plan

Logic flow:
1. If no break configs, returns recorded break time
2. Calculates required break via `calculateRequiredBreak()`
3. If manual breaks recorded: uses recorded time, adds warnings if short
4. If no manual breaks: applies auto-deduct rules

#### calculateRequiredBreak Function (lines 62-98)

Internal helper that processes break configs:
- For `BreakTypeFixed`: Adds duration to `autoDeductTotal` and `minDuration` if work meets threshold
- For `BreakTypeVariable`: Same as fixed
- For `BreakTypeMinimum`: Uses max duration for minimum requirement

**Note**: This function does NOT check if work time overlaps with the fixed break window (StartTime/EndTime fields). It only checks the `AfterWorkMinutes` threshold.

#### Additional Functions (lines 100-126)

- `CalculateNetTime(grossTime, breakTime, maxNetWorkTime)` - Computes net work time minus breaks
- `CalculateOvertimeUndertime(netTime, targetTime)` - Computes overtime/undertime

### Existing BreakConfig Type

**Path**: `apps/api/internal/calculation/types.go:50-59`

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

The `StartTime` and `EndTime` fields exist but are not currently used by the break deduction logic.

### Existing BookingPair Type

**Path**: `apps/api/internal/calculation/types.go:115-121`

```go
type BookingPair struct {
    InBooking  *BookingInput
    OutBooking *BookingInput
    Category   BookingCategory
    Duration   int // Calculated duration in minutes
}
```

The existing `BookingPair` uses `*BookingInput` pointers, not primitive `StartTime`/`EndTime` int fields like the ticket proposes.

### Existing Test File

**Path**: `apps/api/internal/calculation/breaks_test.go`

Contains 6 test functions covering:
- No configs scenario
- Manual break recorded
- Manual break too short
- Auto-deduct without manual breaks
- Multiple break configs
- Work threshold triggering

Tests use table-driven pattern with `testify/assert`. Uses `intPtr()` helper function (not defined in this file, but used).

### TICKET-064 Proposed Types

The ticket proposes different structures:

```go
// Proposed BreakDeductionResult (differs from existing)
type BreakDeductionResult struct {
    NetTime       int
    TotalBreakTime int
    BreakDetails  []BreakDetail
}

// Proposed new type (does not exist)
type BreakDetail struct {
    Type     string
    Duration int
    Reason   string
}
```

### TICKET-064 Proposed Functions

```go
// Does not exist - uses BookingPair with StartTime/EndTime fields
func DeductFixedBreaks(workPairs []BookingPair, breaks []BreakConfig) BreakDeductionResult

// Does not exist - calculates time window overlap
func calculateOverlap(start1, end1, start2, end2 int) int

// Do not exist (Go 1.21+ has built-in min/max)
func min(a, b int) int
func max(a, b int) int
```

### Comparison of Fixed Break Logic

**Existing Implementation** (`calculateRequiredBreak`):
- For `BreakTypeFixed`: Simply adds `Duration` to totals if `AfterWorkMinutes` threshold is met
- Does NOT check if work time overlaps with the break window

**TICKET-064 Proposal** (`DeductFixedBreaks`):
- Iterates through work pairs and break configs
- Uses `calculateOverlap()` to check if work spans the break window
- Only deducts if there's actual overlap
- Deducts `min(brk.Duration, overlap)` - the lesser of configured duration or actual overlap

### Calculator Integration

**Path**: `apps/api/internal/calculation/calculator.go:70-77`

The existing `Calculator.Calculate()` method calls break deduction at line 70:

```go
breakResult := CalculateBreakDeduction(
    CalculateBreakTime(result.Pairs),
    result.GrossTime,
    input.DayPlan.Breaks,
)
```

This passes:
- Recorded break time from paired break bookings
- Gross work time
- Break configs from day plan

## Code References

- `apps/api/internal/calculation/breaks.go:3-7` - BreakDeductionResult struct
- `apps/api/internal/calculation/breaks.go:11-55` - CalculateBreakDeduction function
- `apps/api/internal/calculation/breaks.go:62-98` - calculateRequiredBreak helper
- `apps/api/internal/calculation/breaks.go:102-116` - CalculateNetTime function
- `apps/api/internal/calculation/breaks.go:119-126` - CalculateOvertimeUndertime function
- `apps/api/internal/calculation/types.go:50-59` - BreakConfig struct
- `apps/api/internal/calculation/types.go:115-121` - BookingPair struct
- `apps/api/internal/calculation/calculator.go:70-77` - Break deduction call in Calculate()
- `apps/api/internal/calculation/breaks_test.go:11-133` - Existing break tests

## Architecture Documentation

### Current Break Deduction Flow

```
Calculator.Calculate()
    |
    v
CalculateBreakTime(pairs)  -->  Sum duration of break-category pairs
    |
    v
CalculateBreakDeduction(recordedBreakTime, grossTime, configs)
    |
    +-- No configs? Return recorded time
    |
    +-- calculateRequiredBreak(grossTime, configs)
    |       |
    |       +-- For each config: check AfterWorkMinutes threshold
    |       +-- Sum minDuration and autoDeductTotal
    |
    +-- If manual breaks: use recorded, check against minimum
    +-- If no manual breaks: use autoDeductTotal
    |
    v
result.BreakTime = breakResult.DeductedMinutes
```

### Test Patterns Used

- Black-box testing (`package calculation_test`)
- Table-driven tests with `testify/assert`
- `intPtr()` helper for pointer creation (defined in `tolerance_test.go:172-174`)
- Individual test functions, not subtests for simple scenarios
- Subtests (`t.Run`) for table-driven tests

## Related Research

- `thoughts/shared/research/2026-01-22-TICKET-060-create-calculation-types.md` - Types documentation
- `thoughts/shared/research/2026-01-22-TICKET-061-create-booking-pairing-logic.md` - Pairing logic
- `thoughts/shared/research/2026-01-22-TICKET-062-create-tolerance-logic.md` - Tolerance logic
- `thoughts/shared/research/2026-01-22-TICKET-063-create-rounding-logic.md` - Rounding logic
- `thoughts/shared/research/2026-01-19-TICKET-059-create-calculation-package-structure.md` - Package structure

## Open Questions

1. Should `DeductFixedBreaks` be added as a new function alongside existing `CalculateBreakDeduction`, or should the existing function be modified?
2. The ticket proposes `BookingPair` with `StartTime`/`EndTime` int fields, but existing type uses `*BookingInput` pointers. How should this be reconciled?
3. Should the existing `BreakDeductionResult` be extended or should a new type be created?
4. How does fixed break window overlap checking integrate with the existing calculator flow?

---

## Follow-up Research: ZMI Manual Analysis (2026-01-22)

Based on analysis of the ZMI manual (section 3.4.4.3 Pausen, page 42), the open questions have been resolved.

### Answers to Open Questions

#### Q1: Add alongside or replace?

**Answer: Add alongside, then integrate into the existing function.**

ZMI defines four distinct break types, each with different behavior:

| Break Type | German Term | Behavior |
|------------|-------------|----------|
| Pause 1-3 (fest) | Fixed | Always deducted regardless of manual bookings - has a time window |
| Pause 4 (variabel) | Variable | Only deducted if employee booked NO breaks that day |
| Mindestpause 1 nach | Minimum after threshold | Deducted when presence exceeds X hours |
| Mindestpause 2 nach | Minimum after threshold | Second tier, same logic |

The existing `CalculateBreakDeduction` should become an orchestrator that delegates to specialized functions by break type.

#### Q2: BookingPair type differences?

**Answer: Keep existing `BookingPair` type, extract times inline.**

Do NOT change the existing `BookingPair` struct. Instead, extract the time values from the pointer fields inside the new function:

```go
func deductFixedBreak(pairs []BookingPair, cfg BreakConfig) int {
    if cfg.StartTime == nil || cfg.EndTime == nil {
        return 0
    }

    breakStart := *cfg.StartTime
    breakEnd := *cfg.EndTime

    for _, pair := range pairs {
        if pair.Category != CategoryWork {
            continue
        }
        if pair.InBooking == nil || pair.OutBooking == nil {
            continue
        }

        workStart := pair.InBooking.Time
        workEnd := pair.OutBooking.Time

        overlap := calculateOverlap(workStart, workEnd, breakStart, breakEnd)
        // ...
    }
}
```

#### Q3: BreakDeductionResult type?

**Answer: Keep existing `BreakDeductionResult` type (no changes needed).**

The existing `{DeductedMinutes, Warnings}` structure is sufficient.

#### Q4: Calculator integration?

**Answer: Modify `CalculateBreakDeduction` signature to also receive `pairs`.**

Current call in `calculator.go`:
```go
breakResult := CalculateBreakDeduction(
    CalculateBreakTime(result.Pairs),
    result.GrossTime,
    input.DayPlan.Breaks,
)
```

Updated call:
```go
breakResult := CalculateBreakDeduction(
    result.Pairs,                      // NEW: Pass pairs for window overlap check
    CalculateBreakTime(result.Pairs),  // Recorded break time from manual bookings
    result.GrossTime,
    input.DayPlan.Breaks,
)
```

### ZMI Break Type Behaviors (from Manual)

From ZMI manual page 42:

1. **Pause 1-3 (fest)**: "Bei dieser Pause wird die angegebene Uhrzeit als Pause berechnet unabhängig davon, ob der/die Mitarbeiter/-in Pause gebucht hat oder nicht."
   - Fixed breaks are ALWAYS deducted, regardless of whether employee booked a break
   - The break has a time window (StartTime to EndTime)
   - Only deduct if work overlaps with that window

2. **Pause 4 (variabel)**: "Sie wird allerdings nicht berechnet, wenn der/die Mitarbeiter/-in an diesem Tag eine Pause gebucht hat."
   - Variable break is NOT deducted if employee booked ANY break that day
   - Check: `if recordedBreakTime == 0`

3. **Mindestpause nach**: "Wenn der/die Mitarbeiter/-in länger als die hier hinterlegte Zeit anwesend war, berechnet ZMI Time den Wert"
   - Minimum break triggers after presence exceeds threshold
   - This is the existing `AfterWorkMinutes` threshold logic

4. **Minuten Differenz**: Proportional deduction when near threshold
   - Example: 30min break after 5h, employee works 5:10 → only 10min deducted
   - Only applies to Mindestpause, not to fixed breaks

### Updated Break Deduction Flow

```
Calculator.Calculate()
    │
    ▼
Pair bookings into result.Pairs
    │
    ▼
Calculate result.GrossTime (sum of work pairs)
    │
    ▼
CalculateBreakDeduction(pairs, recordedBreakTime, grossTime, configs)
    │
    ├── For BreakTypeFixed: deductFixedBreak(pairs, cfg)
    │       └── calculateOverlap() for each work pair vs break window
    │
    ├── For BreakTypeVariable: check if recordedBreakTime == 0
    │
    └── For BreakTypeMinimum: check AfterWorkMinutes threshold
    │
    ▼
result.BreakTime = breakResult.DeductedMinutes
    │
    ▼
CalculateNetTime(grossTime, breakTime, maxNet)
```

### Implementation Checklist

1. [ ] Add `calculateOverlap(workStart, workEnd, breakStart, breakEnd int) int` helper function
2. [ ] Add `deductFixedBreak(pairs []BookingPair, cfg BreakConfig) int` function
3. [ ] Modify `CalculateBreakDeduction` signature to accept `pairs []BookingPair` as first parameter
4. [ ] Update `CalculateBreakDeduction` to dispatch by break type
5. [ ] Update `calculator.go` call site to pass `result.Pairs`
6. [ ] Add tests for:
   - Work fully spans break window → deduct full duration
   - Work partially overlaps break window → deduct overlap amount
   - Work does not overlap break window → deduct nothing
   - Multiple work pairs with break window
7. [ ] Keep existing `BreakDeductionResult` type (no changes needed)

### Test Cases to Add

```go
func TestDeductFixedBreak_FullOverlap(t *testing.T) {
    // Work: 08:00-17:00, Break window: 12:00-12:30
    // Expected: 30 minutes deducted
}

func TestDeductFixedBreak_PartialOverlap(t *testing.T) {
    // Work: 08:00-12:15, Break window: 12:00-12:30
    // Expected: 15 minutes deducted (only overlap)
}

func TestDeductFixedBreak_NoOverlap(t *testing.T) {
    // Work: 08:00-11:30, Break window: 12:00-12:30
    // Expected: 0 minutes deducted
}

func TestDeductFixedBreak_MultipleWorkPairs(t *testing.T) {
    // Work: 08:00-12:00 and 13:00-17:00, Break window: 12:00-13:00
    // Expected: 0 minutes (gap during break, no overlap)
}
```
