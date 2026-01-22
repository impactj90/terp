package calculation

import (
	"sort"

	"github.com/google/uuid"
	"github.com/tolga/terp/internal/timeutil"
)

// PairingResult contains the results of pairing bookings.
type PairingResult struct {
	Pairs          []BookingPair
	UnpairedInIDs  []uuid.UUID
	UnpairedOutIDs []uuid.UUID
	Warnings       []string
}

// PairBookings pairs in/out bookings by category and calculates durations.
// Bookings with existing PairIDs are paired together.
// Unpaired bookings are matched chronologically within their category.
func PairBookings(bookings []BookingInput) PairingResult {
	result := PairingResult{
		Pairs:          make([]BookingPair, 0),
		UnpairedInIDs:  make([]uuid.UUID, 0),
		UnpairedOutIDs: make([]uuid.UUID, 0),
		Warnings:       make([]string, 0),
	}

	if len(bookings) == 0 {
		return result
	}

	// Separate by category
	workBookings := filterByCategory(bookings, CategoryWork)
	breakBookings := filterByCategory(bookings, CategoryBreak)

	// Pair work bookings
	workPairs, workUnpairedIn, workUnpairedOut, workWarnings := pairByCategory(workBookings, CategoryWork)
	result.Pairs = append(result.Pairs, workPairs...)
	result.UnpairedInIDs = append(result.UnpairedInIDs, workUnpairedIn...)
	result.UnpairedOutIDs = append(result.UnpairedOutIDs, workUnpairedOut...)
	result.Warnings = append(result.Warnings, workWarnings...)

	// Pair break bookings
	breakPairs, breakUnpairedIn, breakUnpairedOut, breakWarnings := pairByCategory(breakBookings, CategoryBreak)
	result.Pairs = append(result.Pairs, breakPairs...)
	result.UnpairedInIDs = append(result.UnpairedInIDs, breakUnpairedIn...)
	result.UnpairedOutIDs = append(result.UnpairedOutIDs, breakUnpairedOut...)
	result.Warnings = append(result.Warnings, breakWarnings...)

	return result
}

func filterByCategory(bookings []BookingInput, category BookingCategory) []BookingInput {
	var filtered []BookingInput
	for _, b := range bookings {
		if b.Category == category {
			filtered = append(filtered, b)
		}
	}
	return filtered
}

func pairByCategory(bookings []BookingInput, category BookingCategory) (
	pairs []BookingPair, unpairedIn, unpairedOut []uuid.UUID, warnings []string,
) {
	pairs = make([]BookingPair, 0)
	warnings = make([]string, 0)

	// Build maps by direction
	inBookings := make(map[uuid.UUID]*BookingInput)
	outBookings := make(map[uuid.UUID]*BookingInput)
	var inList, outList []*BookingInput

	for i := range bookings {
		b := &bookings[i]
		if b.Direction == DirectionIn {
			inBookings[b.ID] = b
			inList = append(inList, b)
		} else {
			outBookings[b.ID] = b
			outList = append(outList, b)
		}
	}

	// Sort by time for chronological pairing
	sort.Slice(inList, func(i, j int) bool { return inList[i].Time < inList[j].Time })
	sort.Slice(outList, func(i, j int) bool { return outList[i].Time < outList[j].Time })

	// Track which bookings have been paired
	pairedIn := make(map[uuid.UUID]bool)
	pairedOut := make(map[uuid.UUID]bool)

	// First pass: pair by existing PairID
	for _, in := range inList {
		if in.PairID != nil {
			if out, ok := outBookings[*in.PairID]; ok {
				pair := createPairForCategory(in, out, category)
				if isCrossMidnight(pair) {
					warnings = append(warnings, WarnCodeCrossMidnight)
				}
				pairs = append(pairs, pair)
				pairedIn[in.ID] = true
				pairedOut[out.ID] = true
			}
		}
	}

	// For work bookings: pair IN (arrive) → OUT (leave)
	// For break bookings: pair OUT (start break) → IN (end break)
	if category == CategoryWork {
		// Second pass: pair unpaired IN with subsequent OUT
		outIdx := 0
		for _, in := range inList {
			if pairedIn[in.ID] {
				continue
			}
			// Find next unpaired out booking after this in
			for outIdx < len(outList) && (pairedOut[outList[outIdx].ID] || outList[outIdx].Time < in.Time) {
				outIdx++
			}
			if outIdx < len(outList) && !pairedOut[outList[outIdx].ID] {
				out := outList[outIdx]
				pair := createPairForCategory(in, out, category)
				pairs = append(pairs, pair)
				pairedIn[in.ID] = true
				pairedOut[out.ID] = true
				outIdx++
			}
		}

		// Third pass: handle cross-midnight scenarios for work
		for _, in := range inList {
			if pairedIn[in.ID] {
				continue
			}
			for _, out := range outList {
				if pairedOut[out.ID] {
					continue
				}
				// Cross-midnight: IN time > OUT time
				if out.Time < in.Time {
					pair := createPairForCategory(in, out, category)
					warnings = append(warnings, WarnCodeCrossMidnight)
					pairs = append(pairs, pair)
					pairedIn[in.ID] = true
					pairedOut[out.ID] = true
					break
				}
			}
		}
	} else {
		// Break bookings: pair OUT (start break) → IN (end break)
		inIdx := 0
		for _, out := range outList {
			if pairedOut[out.ID] {
				continue
			}
			// Find next unpaired in booking after this out
			for inIdx < len(inList) && (pairedIn[inList[inIdx].ID] || inList[inIdx].Time < out.Time) {
				inIdx++
			}
			if inIdx < len(inList) && !pairedIn[inList[inIdx].ID] {
				in := inList[inIdx]
				pair := createPairForCategory(in, out, category)
				pairs = append(pairs, pair)
				pairedIn[in.ID] = true
				pairedOut[out.ID] = true
				inIdx++
			}
		}
	}

	// Collect unpaired
	for _, in := range inList {
		if !pairedIn[in.ID] {
			unpairedIn = append(unpairedIn, in.ID)
		}
	}
	for _, out := range outList {
		if !pairedOut[out.ID] {
			unpairedOut = append(unpairedOut, out.ID)
		}
	}

	return pairs, unpairedIn, unpairedOut, warnings
}

// createPairForCategory creates a pair with duration calculated correctly for the category.
// For work: duration = OUT time - IN time (arrive to leave)
// For breaks: duration = IN time - OUT time (start break to end break)
func createPairForCategory(in, out *BookingInput, category BookingCategory) BookingPair {
	var duration int
	if category == CategoryWork {
		// Work: IN (arrive) to OUT (leave)
		endTime := timeutil.NormalizeCrossMidnight(in.Time, out.Time)
		duration = endTime - in.Time
	} else {
		// Break: OUT (start break) to IN (end break)
		endTime := timeutil.NormalizeCrossMidnight(out.Time, in.Time)
		duration = endTime - out.Time
	}
	return BookingPair{
		InBooking:  in,
		OutBooking: out,
		Category:   category,
		Duration:   duration,
	}
}

// isCrossMidnight checks if a pair spans midnight.
func isCrossMidnight(pair BookingPair) bool {
	if pair.Category == CategoryWork {
		// For work, cross-midnight means IN time > OUT time
		return pair.InBooking.Time > pair.OutBooking.Time
	}
	// For breaks, cross-midnight means OUT time > IN time
	return pair.OutBooking.Time > pair.InBooking.Time
}

// CalculateGrossTime sums the duration of all work pairs.
func CalculateGrossTime(pairs []BookingPair) int {
	total := 0
	for _, p := range pairs {
		if p.Category == CategoryWork {
			total += p.Duration
		}
	}
	return total
}

// CalculateBreakTime sums the duration of all break pairs.
func CalculateBreakTime(pairs []BookingPair) int {
	total := 0
	for _, p := range pairs {
		if p.Category == CategoryBreak {
			total += p.Duration
		}
	}
	return total
}

// FindFirstCome returns the earliest arrival time, or nil if no arrivals.
func FindFirstCome(bookings []BookingInput) *int {
	var first *int
	for _, b := range bookings {
		if b.Direction == DirectionIn && b.Category == CategoryWork {
			if first == nil || b.Time < *first {
				t := b.Time
				first = &t
			}
		}
	}
	return first
}

// FindLastGo returns the latest departure time, or nil if no departures.
func FindLastGo(bookings []BookingInput) *int {
	var last *int
	for _, b := range bookings {
		if b.Direction == DirectionOut && b.Category == CategoryWork {
			if last == nil || b.Time > *last {
				t := b.Time
				last = &t
			}
		}
	}
	return last
}
