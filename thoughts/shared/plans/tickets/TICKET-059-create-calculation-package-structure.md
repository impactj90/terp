# TICKET-059: Create Calculation Package Structure

**Type**: Setup
**Effort**: XS
**Sprint**: 12 - Calculation Engine - Types
**Dependencies**: None

## Description

Create the calculation package structure with documentation.

## Files to Create

- `apps/api/internal/calculation/doc.go`

## Implementation

```go
// Package calculation contains pure calculation logic for time tracking.
//
// This package is designed to be:
// - Pure: No database access, no side effects
// - Testable: All inputs/outputs are explicit
// - Reusable: Can be used in different contexts (API, batch, import)
//
// The calculation flow for a day:
//   1. Pair bookings (A1↔A2, PA↔PE)
//   2. Apply tolerance rules
//   3. Apply rounding rules
//   4. Calculate gross time (sum of work pairs)
//   5. Deduct breaks (fixed, variable, minimum)
//   6. Calculate net time
//   7. Apply caps (max_net_work_time)
//   8. Calculate overtime/undertime vs target
//   9. Generate errors/warnings
//
// Time representation:
// All times are stored as minutes from midnight (0-1439).
// Example: 08:30 = 510, 17:00 = 1020
//
// Usage:
//
//     input := calculation.DailyCalcInput{
//         Date:     date,
//         DayPlan:  dayPlanInput,
//         Bookings: bookingInputs,
//     }
//     output := calculation.CalculateDay(input)
//
package calculation
```

## Directory Structure

```
apps/api/internal/calculation/
├── doc.go           # Package documentation
├── types.go         # Input/output type definitions
├── pairing.go       # Booking pairing logic
├── tolerance.go     # Tolerance application
├── rounding.go      # Rounding logic
├── breaks.go        # Break deduction
├── gross.go         # Gross time calculation
├── daily.go         # Main daily calculation
├── errors.go        # Error detection
└── *_test.go        # Tests for each file
```

## Unit Tests

**Test file**: `apps/api/internal/calculation/doc_test.go`

No unit tests required for this ticket as it only creates package structure and documentation. The package documentation will be validated through code review.

## Acceptance Criteria

- [ ] Directory created
- [ ] doc.go provides clear package documentation
- [ ] `make lint` passes
