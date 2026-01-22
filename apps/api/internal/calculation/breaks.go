package calculation

// BreakDeductionResult contains the result of break calculations.
type BreakDeductionResult struct {
	DeductedMinutes int      // Total minutes to deduct
	Warnings        []string // Any warnings generated
}

// CalculateBreakDeduction determines how much break time to deduct.
// It handles three break types differently per ZMI specification:
// - Fixed: ALWAYS deducted based on overlap with time window
// - Variable: Only deducted if no manual breaks recorded
// - Minimum: Deducted after work threshold, with optional proportional deduction
func CalculateBreakDeduction(
	pairs []BookingPair,
	recordedBreakTime int,
	grossWorkTime int,
	breakConfigs []BreakConfig,
) BreakDeductionResult {
	result := BreakDeductionResult{
		Warnings: make([]string, 0),
	}

	if len(breakConfigs) == 0 {
		// No break rules, use recorded breaks
		result.DeductedMinutes = recordedBreakTime
		return result
	}

	var totalDeduction int

	for _, cfg := range breakConfigs {
		switch cfg.Type {
		case BreakTypeFixed:
			// Fixed breaks: Overlap with time window, ALWAYS deducted
			// Ignores manual bookings per ZMI spec
			totalDeduction += DeductFixedBreak(pairs, cfg)

		case BreakTypeVariable:
			// Variable breaks: Only if no manual break was recorded
			if recordedBreakTime == 0 && cfg.AutoDeduct {
				if cfg.AfterWorkMinutes == nil || grossWorkTime >= *cfg.AfterWorkMinutes {
					totalDeduction += cfg.Duration
					result.Warnings = append(result.Warnings, WarnCodeAutoBreakApplied)
				}
			}

		case BreakTypeMinimum:
			// Minimum breaks: After threshold, with optional proportional deduction
			if cfg.AutoDeduct {
				deduction := CalculateMinimumBreak(grossWorkTime, cfg)
				if deduction > 0 {
					totalDeduction += deduction
					if recordedBreakTime == 0 {
						result.Warnings = append(result.Warnings, WarnCodeAutoBreakApplied)
					}
				}
			}
		}
	}

	// Add warning if manual breaks were recorded
	if recordedBreakTime > 0 {
		result.Warnings = append(result.Warnings, WarnCodeManualBreak)
		// Include recorded break time in total (in addition to fixed breaks)
		totalDeduction += recordedBreakTime
	}

	// Add warning if no breaks recorded but breaks are configured
	if recordedBreakTime == 0 && totalDeduction > 0 {
		result.Warnings = append(result.Warnings, WarnCodeNoBreakRecorded)
	}

	result.DeductedMinutes = totalDeduction
	return result
}

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

// DeductFixedBreak calculates the break deduction for a fixed break based on
// overlap with work periods. Fixed breaks are ALWAYS deducted if work overlaps
// the break window, regardless of manual bookings.
// Returns the minutes to deduct (capped at configured Duration).
func DeductFixedBreak(pairs []BookingPair, cfg BreakConfig) int {
	// Fixed breaks require StartTime and EndTime
	if cfg.StartTime == nil || cfg.EndTime == nil {
		return 0
	}

	breakStart := *cfg.StartTime
	breakEnd := *cfg.EndTime
	totalOverlap := 0

	for _, pair := range pairs {
		// Only consider work pairs
		if pair.Category != CategoryWork {
			continue
		}
		// Skip incomplete pairs
		if pair.InBooking == nil || pair.OutBooking == nil {
			continue
		}

		workStart := pair.InBooking.Time
		workEnd := pair.OutBooking.Time

		overlap := CalculateOverlap(workStart, workEnd, breakStart, breakEnd)
		totalOverlap += overlap
	}

	// Deduct the lesser of configured duration or actual overlap
	if totalOverlap > cfg.Duration {
		return cfg.Duration
	}
	return totalOverlap
}

// CalculateMinimumBreak calculates the deduction for a minimum break.
// If MinutesDifference is true, applies proportional deduction based on
// how much work time exceeds the threshold.
// Example: 30min break after 5h threshold, employee works 5:10 -> only 10min deducted.
func CalculateMinimumBreak(grossWorkTime int, cfg BreakConfig) int {
	if cfg.AfterWorkMinutes == nil {
		return 0
	}

	threshold := *cfg.AfterWorkMinutes
	if grossWorkTime < threshold {
		return 0
	}

	if cfg.MinutesDifference {
		// Proportional deduction: only deduct the overtime beyond threshold
		overtime := grossWorkTime - threshold
		if overtime >= cfg.Duration {
			return cfg.Duration
		}
		return overtime
	}

	// Full deduction when threshold is met
	return cfg.Duration
}

// CalculateNetTime computes net work time from gross time minus breaks.
// Applies MaxNetWorkTime cap if configured.
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

// CalculateOvertimeUndertime computes overtime and undertime from net time and target.
func CalculateOvertimeUndertime(netTime, targetTime int) (overtime, undertime int) {
	diff := netTime - targetTime

	if diff > 0 {
		return diff, 0
	}
	return 0, -diff
}
