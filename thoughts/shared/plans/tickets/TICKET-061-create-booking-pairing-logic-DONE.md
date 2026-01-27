# TICKET-061: Create Booking Pairing Logic

**Type**: Calculation
**Effort**: M
**Sprint**: 13 - Calculation Engine - Booking Logic
**Dependencies**: TICKET-060

## Description

Implement booking pairing logic to match come/go and break start/end bookings.

## Files to Create

- `apps/api/internal/calculation/pairing.go`
- `apps/api/internal/calculation/pairing_test.go`

## Implementation

```go
package calculation

import (
    "sort"

    "github.com/google/uuid"
)

// PairBookings matches come/go and break_start/break_end bookings
// Returns paired bookings and error codes for unpaired ones
func PairBookings(bookings []BookingInput) ([]BookingPair, []string) {
    var pairs []BookingPair
    var errors []string

    // Separate by category
    comes := filterByCategory(bookings, "come")
    goes := filterByCategory(bookings, "go")
    breakStarts := filterByCategory(bookings, "break_start")
    breakEnds := filterByCategory(bookings, "break_end")

    // Sort all by time
    sortByTime(comes)
    sortByTime(goes)
    sortByTime(breakStarts)
    sortByTime(breakEnds)

    // Pair work bookings (come -> go)
    workPairs, workErrors := pairSequential(comes, goes, "work")
    pairs = append(pairs, workPairs...)
    errors = append(errors, workErrors...)

    // Pair break bookings (break_start -> break_end)
    breakPairs, breakErrors := pairSequential(breakStarts, breakEnds, "break")
    pairs = append(pairs, breakPairs...)
    errors = append(errors, breakErrors...)

    return pairs, errors
}

// pairSequential pairs start and end bookings sequentially
func pairSequential(starts, ends []BookingInput, pairType string) ([]BookingPair, []string) {
    var pairs []BookingPair
    var errors []string

    usedEnds := make(map[int]bool)

    for _, start := range starts {
        // Find the next end booking after this start
        paired := false
        for i, end := range ends {
            if usedEnds[i] {
                continue
            }
            if end.EditedTime > start.EditedTime {
                pairs = append(pairs, BookingPair{
                    StartBookingID: start.ID,
                    EndBookingID:   end.ID,
                    PairType:       pairType,
                    StartTime:      start.EditedTime,
                    EndTime:        end.EditedTime,
                    Duration:       end.EditedTime - start.EditedTime,
                })
                usedEnds[i] = true
                paired = true
                break
            }
        }
        if !paired {
            if pairType == "work" {
                errors = append(errors, "MISSING_GO")
            } else {
                errors = append(errors, "MISSING_BREAK_END")
            }
        }
    }

    // Check for unpaired ends
    for i, end := range ends {
        if !usedEnds[i] {
            if pairType == "work" {
                errors = append(errors, "MISSING_COME")
            } else {
                errors = append(errors, "MISSING_BREAK_START")
            }
            _ = end // Mark as unpaired
        }
    }

    return pairs, errors
}

func filterByCategory(bookings []BookingInput, category string) []BookingInput {
    var filtered []BookingInput
    for _, b := range bookings {
        if b.Category == category {
            filtered = append(filtered, b)
        }
    }
    return filtered
}

func sortByTime(bookings []BookingInput) {
    sort.Slice(bookings, func(i, j int) bool {
        return bookings[i].EditedTime < bookings[j].EditedTime
    })
}
```

## Unit Tests

**Test file**: `apps/api/internal/calculation/pairing_test.go`

Table-driven tests for all pairing functions using testify/assert:

```go
func TestPairBookings(t *testing.T) {
    tests := []struct {
        name          string
        bookings      []BookingInput
        expectedPairs int
        expectedErrs  []string
    }{
        {
            name: "normal day - single come/go pair",
            bookings: []BookingInput{
                {ID: uuid.New(), Category: "come", EditedTime: 480},  // 08:00
                {ID: uuid.New(), Category: "go", EditedTime: 1020},   // 17:00
            },
            expectedPairs: 1,
            expectedErrs:  []string{},
        },
        {
            name: "with break - work and break pairs",
            bookings: []BookingInput{
                {ID: uuid.New(), Category: "come", EditedTime: 480},
                {ID: uuid.New(), Category: "break_start", EditedTime: 720},
                {ID: uuid.New(), Category: "break_end", EditedTime: 750},
                {ID: uuid.New(), Category: "go", EditedTime: 1020},
            },
            expectedPairs: 2,
            expectedErrs:  []string{},
        },
        {
            name: "multiple come/go - employee left and returned",
            bookings: []BookingInput{
                {ID: uuid.New(), Category: "come", EditedTime: 480},
                {ID: uuid.New(), Category: "go", EditedTime: 720},
                {ID: uuid.New(), Category: "come", EditedTime: 780},
                {ID: uuid.New(), Category: "go", EditedTime: 1020},
            },
            expectedPairs: 2,
            expectedErrs:  []string{},
        },
        {
            name:          "empty input - no bookings",
            bookings:      []BookingInput{},
            expectedPairs: 0,
            expectedErrs:  []string{},
        },
        {
            name: "missing go - unpaired come",
            bookings: []BookingInput{
                {ID: uuid.New(), Category: "come", EditedTime: 480},
            },
            expectedPairs: 0,
            expectedErrs:  []string{"MISSING_GO"},
        },
        {
            name: "missing come - unpaired go",
            bookings: []BookingInput{
                {ID: uuid.New(), Category: "go", EditedTime: 1020},
            },
            expectedPairs: 0,
            expectedErrs:  []string{"MISSING_COME"},
        },
        {
            name: "missing break_end - unpaired break_start",
            bookings: []BookingInput{
                {ID: uuid.New(), Category: "come", EditedTime: 480},
                {ID: uuid.New(), Category: "break_start", EditedTime: 720},
                {ID: uuid.New(), Category: "go", EditedTime: 1020},
            },
            expectedPairs: 1,
            expectedErrs:  []string{"MISSING_BREAK_END"},
        },
        {
            name: "out of order bookings - should sort by time",
            bookings: []BookingInput{
                {ID: uuid.New(), Category: "go", EditedTime: 1020},
                {ID: uuid.New(), Category: "come", EditedTime: 480},
            },
            expectedPairs: 1,
            expectedErrs:  []string{},
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            pairs, errors := PairBookings(tt.bookings)
            assert.Equal(t, tt.expectedPairs, len(pairs))
            assert.Equal(t, len(tt.expectedErrs), len(errors))
            for _, expectedErr := range tt.expectedErrs {
                assert.Contains(t, errors, expectedErr)
            }
        })
    }
}
```

Edge cases covered:
- Empty input (no bookings)
- Single unpaired come/go/break bookings
- Out of order bookings (should be sorted by time)
- Multiple work pairs in same day
- Boundary values at midnight (0 minutes, 1439 minutes)

## Acceptance Criteria

- [ ] `make test` passes
- [ ] Unit tests for all pairing functions
- [ ] Tests cover edge cases and boundary values
- [ ] Pairs come/go bookings correctly
- [ ] Pairs break_start/break_end correctly
- [ ] Returns MISSING_GO for unpaired come
- [ ] Returns MISSING_COME for unpaired go
- [ ] Handles multiple come/go pairs in a day
