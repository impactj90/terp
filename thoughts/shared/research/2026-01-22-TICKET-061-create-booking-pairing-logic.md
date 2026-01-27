---
date: 2026-01-22T10:31:14+01:00
researcher: tolga
git_commit: 9192b323908c8d2a506df6571e054ae8b72a8b30
branch: master
repository: terp
topic: "TICKET-061: Create Booking Pairing Logic"
tags: [research, codebase, calculation, pairing, bookings]
status: complete
last_updated: 2026-01-22
last_updated_by: tolga
---

# Research: TICKET-061 - Create Booking Pairing Logic

**Date**: 2026-01-22T10:31:14+01:00
**Researcher**: tolga
**Git Commit**: 9192b323908c8d2a506df6571e054ae8b72a8b30
**Branch**: master
**Repository**: terp

## Research Question

Research the codebase context for implementing TICKET-061: Create Booking Pairing Logic, which implements matching come/go and break_start/break_end bookings.

## Summary

**The booking pairing logic has already been implemented.** The files `apps/api/internal/calculation/pairing.go` and `apps/api/internal/calculation/pairing_test.go` already exist with comprehensive implementation. The existing implementation differs from the ticket specification in its design approach but achieves the same functional goals.

### Key Differences from Ticket Specification

| Aspect | Ticket Spec | Existing Implementation |
|--------|-------------|------------------------|
| Category values | "come", "go", "break_start", "break_end" | Direction ("in"/"out") + Category ("work"/"break") |
| Return type | `([]BookingPair, []string)` | `PairingResult` struct |
| Error handling | String array of error codes | `UnpairedInIDs`, `UnpairedOutIDs`, `Warnings` |
| Pairing approach | `pairSequential` function | Three-pass algorithm in `pairByCategory` |

## Detailed Findings

### Existing Calculation Package Structure

The calculation package at `apps/api/internal/calculation/` contains 13 files:

**Core Files:**
- `doc.go` - Package documentation
- `types.go` - Type definitions (BookingInput, BookingPair, etc.)
- `errors.go` - Error and warning codes
- `calculator.go` - Main calculation orchestrator

**Logic Files:**
- `pairing.go` - Booking pairing logic (already implemented)
- `tolerance.go` - Tolerance/grace period logic
- `rounding.go` - Time rounding logic
- `breaks.go` - Break calculation logic

**Test Files:**
- `pairing_test.go`, `tolerance_test.go`, `rounding_test.go`, `breaks_test.go`, `calculator_test.go`

### BookingInput Type

**Location**: `apps/api/internal/calculation/types.go:29-36`

```go
type BookingInput struct {
    ID        uuid.UUID
    Time      int              // Minutes from midnight (0-1439)
    Direction BookingDirection // "in" or "out"
    Category  BookingCategory  // "work" or "break"
    PairID    *uuid.UUID       // ID of paired booking, if any
}
```

**Key differences from ticket:**
- Uses `Direction` ("in"/"out") instead of separate "come"/"go" categories
- Uses `Category` ("work"/"break") to distinguish work vs break bookings
- Work bookings: `Direction: "in"` = COME, `Direction: "out"` = GO
- Break bookings: `Direction: "out"` = BREAK_START, `Direction: "in"` = BREAK_END

### BookingPair Type

**Location**: `apps/api/internal/calculation/types.go:115-121`

```go
type BookingPair struct {
    InBooking  *BookingInput
    OutBooking *BookingInput
    Category   BookingCategory
    Duration   int // Calculated duration in minutes
}
```

**Key differences from ticket:**
- Contains full `BookingInput` pointers instead of just IDs
- Has `Category` field to distinguish work vs break pairs
- No separate `PairType` field - uses `Category` instead

### Existing PairBookings Implementation

**Location**: `apps/api/internal/calculation/pairing.go:18-52`

```go
func PairBookings(bookings []BookingInput) PairingResult
```

**Return type** (`pairing.go:10-16`):
```go
type PairingResult struct {
    Pairs          []BookingPair
    UnpairedInIDs  []uuid.UUID
    UnpairedOutIDs []uuid.UUID
    Warnings       []string
}
```

**Algorithm** (`pairByCategory` at lines 64-186):
1. **First Pass**: Pair by existing PairID (pre-paired bookings)
2. **Second Pass**: Pair unpaired IN with subsequent OUT chronologically (for work)
3. **Third Pass**: Handle cross-midnight scenarios where OUT time < IN time
4. **Break Pairing**: Pairs OUT (break start) → IN (break end) chronologically

### Existing Error Codes

**Location**: `apps/api/internal/calculation/errors.go:4-27`

Pairing-related error codes:
- `ErrCodeMissingCome = "MISSING_COME"` - No arrival booking found
- `ErrCodeMissingGo = "MISSING_GO"` - No departure booking found
- `ErrCodeUnpairedBooking = "UNPAIRED_BOOKING"` - Booking without matching pair

Warning codes:
- `WarnCodeCrossMidnight = "CROSS_MIDNIGHT"` - Shift spans midnight

### Booking Model Mapping

**Location**: `apps/api/internal/model/booking.go`

The Booking model in the database uses a different structure:
- `BookingTypeID` references a `BookingType` which has a `Direction` field
- No direct `Category` field on Booking - category is inferred from BookingType
- Times stored as `OriginalTime`, `EditedTime`, and optional `CalculatedTime`

**Mapping from Booking to BookingInput** requires:
1. Looking up the `BookingType` to get the direction
2. Determining category based on BookingType (e.g., COME/GO = work, BREAK_START/BREAK_END = break)
3. Using `EditedTime` (or `EffectiveTime()`) for the Time field

### Time Utilities

**Location**: `apps/api/internal/timeutil/timeutil.go`

Key functions used by pairing logic:
- `NormalizeCrossMidnight(startMinutes, endMinutes int) int` - Handles cross-midnight calculations by adding 1440 to end time if it's before start time

### Test Patterns

**Location**: `apps/api/internal/calculation/pairing_test.go`

Tests use table-driven approach with testify/assert:
```go
func TestPairBookings_SinglePair(t *testing.T) {
    comeID := uuid.New()
    goID := uuid.New()

    bookings := []calculation.BookingInput{
        {ID: comeID, Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
        {ID: goID, Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
    }

    result := calculation.PairBookings(bookings)

    require.Len(t, result.Pairs, 1)
    assert.Equal(t, comeID, result.Pairs[0].InBooking.ID)
    assert.Equal(t, goID, result.Pairs[0].OutBooking.ID)
    assert.Equal(t, 540, result.Pairs[0].Duration)
}
```

## Code References

- Pairing implementation: `apps/api/internal/calculation/pairing.go:18-52`
- PairingResult type: `apps/api/internal/calculation/pairing.go:10-16`
- BookingInput type: `apps/api/internal/calculation/types.go:29-36`
- BookingPair type: `apps/api/internal/calculation/types.go:115-121`
- Error codes: `apps/api/internal/calculation/errors.go:4-27`
- Cross-midnight handling: `apps/api/internal/timeutil/timeutil.go:74-82`
- Pairing tests: `apps/api/internal/calculation/pairing_test.go`
- Booking model: `apps/api/internal/model/booking.go`
- BookingRepository: `apps/api/internal/repository/booking.go`

## Architecture Documentation

### Pairing Algorithm Design

The existing implementation uses a two-dimensional categorization:
1. **Direction**: "in" (arrival) vs "out" (departure)
2. **Category**: "work" vs "break"

This maps to the time tracking domain:
- COME = work + in
- GO = work + out
- BREAK_START = break + out
- BREAK_END = break + in

Note: Breaks use inverted direction semantics - starting a break is "out" (leaving work), ending a break is "in" (returning to work).

### Helper Functions in pairing.go

- `CalculateGrossTime(pairs []BookingPair) int` - Sums duration of work pairs
- `CalculateBreakTime(pairs []BookingPair) int` - Sums duration of break pairs
- `FindFirstCome(bookings []BookingInput) *int` - Finds earliest work arrival
- `FindLastGo(bookings []BookingInput) *int` - Finds latest work departure

## Related Research

- `thoughts/shared/research/2026-01-19-TICKET-059-create-calculation-package-structure.md`
- `thoughts/shared/plans/2026-01-19-TICKET-059-create-calculation-package-structure.md`

## Open Questions

1. **Ticket obsolete?** The pairing logic appears to be already implemented. The ticket may need to be marked as complete or the acceptance criteria verified against the existing implementation.

2. **Design alignment**: The existing implementation uses a different design (Direction+Category) than the ticket specified (come/go/break_start/break_end categories). If the existing design is intentional and tested, the ticket specification may need updating.

3. **Acceptance criteria verification**: The existing implementation should be checked against the ticket's acceptance criteria to confirm all requirements are met.
