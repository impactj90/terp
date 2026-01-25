package calculation

// CappingSource indicates the source of capped time.
type CappingSource string

const (
	// CappingSourceEarlyArrival means time was capped due to arrival before evaluation window.
	CappingSourceEarlyArrival CappingSource = "early_arrival"
	// CappingSourceLateLeave means time was capped due to departure after evaluation window.
	CappingSourceLateLeave CappingSource = "late_leave"
	// CappingSourceMaxNetTime means time was capped due to exceeding maximum net work time.
	CappingSourceMaxNetTime CappingSource = "max_net_time"
)

// CappedTime represents a single instance of time being capped.
type CappedTime struct {
	Minutes int           // Amount of time capped in minutes
	Source  CappingSource // Why the time was capped
	Reason  string        // Human-readable explanation
}

// CappingResult contains the aggregated capping information for a day.
type CappingResult struct {
	TotalCapped int          // Total minutes capped from all sources
	Items       []CappedTime // Individual capping items with details
}

// CalculateEarlyArrivalCapping determines if arrival is before the evaluation window.
// Returns nil if no capping occurred.
//
// Parameters:
//   - arrivalTime: Actual arrival time in minutes from midnight
//   - windowStart: Evaluation window start (ComeFrom) in minutes from midnight, nil if not set
//   - toleranceMinus: ToleranceComeMinus value in minutes
//   - variableWorkTime: Whether VariableWorkTime flag is set (extends window by tolerance)
func CalculateEarlyArrivalCapping(
	arrivalTime int,
	windowStart *int,
	toleranceMinus int,
	variableWorkTime bool,
) *CappedTime {
	if windowStart == nil {
		return nil
	}

	// Calculate effective window start
	effectiveStart := *windowStart
	if variableWorkTime && toleranceMinus > 0 {
		effectiveStart = *windowStart - toleranceMinus
	}

	// Check if arrival is before effective window start
	if arrivalTime < effectiveStart {
		cappedMinutes := effectiveStart - arrivalTime
		return &CappedTime{
			Minutes: cappedMinutes,
			Source:  CappingSourceEarlyArrival,
			Reason:  "Arrival before evaluation window",
		}
	}

	return nil
}

// CalculateLateDepatureCapping determines if departure is after the evaluation window.
// Returns nil if no capping occurred.
//
// Parameters:
//   - departureTime: Actual departure time in minutes from midnight
//   - windowEnd: Evaluation window end (GoTo) in minutes from midnight, nil if not set
//   - tolerancePlus: ToleranceGoPlus value in minutes (extends window after end)
func CalculateLateDepatureCapping(
	departureTime int,
	windowEnd *int,
	tolerancePlus int,
) *CappedTime {
	if windowEnd == nil {
		return nil
	}

	// Calculate effective window end
	effectiveEnd := *windowEnd + tolerancePlus

	// Check if departure is after effective window end
	if departureTime > effectiveEnd {
		cappedMinutes := departureTime - effectiveEnd
		return &CappedTime{
			Minutes: cappedMinutes,
			Source:  CappingSourceLateLeave,
			Reason:  "Departure after evaluation window",
		}
	}

	return nil
}

// CalculateMaxNetTimeCapping determines if net time exceeds the maximum.
// Returns nil if no capping occurred or maxNetWorkTime is nil.
//
// Parameters:
//   - netWorkTime: Calculated net work time in minutes
//   - maxNetWorkTime: Maximum allowed net work time in minutes, nil if not set
func CalculateMaxNetTimeCapping(netWorkTime int, maxNetWorkTime *int) *CappedTime {
	if maxNetWorkTime == nil {
		return nil
	}

	if netWorkTime > *maxNetWorkTime {
		cappedMinutes := netWorkTime - *maxNetWorkTime
		return &CappedTime{
			Minutes: cappedMinutes,
			Source:  CappingSourceMaxNetTime,
			Reason:  "Exceeded maximum net work time",
		}
	}

	return nil
}

// AggregateCapping combines multiple capped time items into a single result.
// Nil items are ignored.
func AggregateCapping(items ...*CappedTime) CappingResult {
	result := CappingResult{
		Items: make([]CappedTime, 0),
	}

	for _, item := range items {
		if item != nil && item.Minutes > 0 {
			result.Items = append(result.Items, *item)
			result.TotalCapped += item.Minutes
		}
	}

	return result
}

// ApplyCapping applies max net work time capping and returns the adjusted net time.
// This is a convenience wrapper that also returns the capped amount.
//
// Parameters:
//   - netWorkTime: Calculated net work time in minutes
//   - maxNetWorkTime: Maximum allowed net work time in minutes, nil if not set
//
// Returns:
//   - adjustedNet: The net time after capping (may be unchanged if no cap)
//   - capped: The amount of time that was capped (0 if no capping)
func ApplyCapping(netWorkTime int, maxNetWorkTime *int) (adjustedNet, capped int) {
	if maxNetWorkTime == nil {
		return netWorkTime, 0
	}

	if netWorkTime > *maxNetWorkTime {
		return *maxNetWorkTime, netWorkTime - *maxNetWorkTime
	}

	return netWorkTime, 0
}

// ApplyWindowCapping adjusts a booking time to fit within the evaluation window.
// Returns the adjusted time and the amount of time that was capped.
//
// Parameters:
//   - bookingTime: Actual booking time in minutes from midnight
//   - windowStart: Window start in minutes from midnight (nil = no start constraint)
//   - windowEnd: Window end in minutes from midnight (nil = no end constraint)
//   - toleranceMinus: Tolerance before window start (only applied if variableWorkTime for arrivals)
//   - tolerancePlus: Tolerance after window end
//   - isArrival: True if this is an arrival booking, false for departure
//   - variableWorkTime: Whether VariableWorkTime flag is set (for arrival tolerance)
//
// Returns:
//   - adjustedTime: The booking time after window capping
//   - capped: The amount of time that was capped (0 if no capping)
func ApplyWindowCapping(
	bookingTime int,
	windowStart *int,
	windowEnd *int,
	toleranceMinus int,
	tolerancePlus int,
	isArrival bool,
	variableWorkTime bool,
) (adjustedTime, capped int) {
	adjustedTime = bookingTime

	if isArrival && windowStart != nil {
		// Calculate effective window start
		effectiveStart := *windowStart
		if variableWorkTime && toleranceMinus > 0 {
			effectiveStart = *windowStart - toleranceMinus
		}

		// Cap early arrivals
		if bookingTime < effectiveStart {
			capped = effectiveStart - bookingTime
			adjustedTime = effectiveStart
		}
	}

	if !isArrival && windowEnd != nil {
		// Calculate effective window end
		effectiveEnd := *windowEnd + tolerancePlus

		// Cap late departures
		if bookingTime > effectiveEnd {
			capped = bookingTime - effectiveEnd
			adjustedTime = effectiveEnd
		}
	}

	return adjustedTime, capped
}
