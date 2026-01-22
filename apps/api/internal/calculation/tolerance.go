package calculation

// ApplyComeTolerance adjusts an arrival time based on tolerance settings.
// If arrival is within tolerance window of the expected time, it's normalized.
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

// ApplyGoTolerance adjusts a departure time based on tolerance settings.
// If departure is within tolerance window of the expected time, it's normalized.
func ApplyGoTolerance(actualTime int, expectedTime *int, tolerance ToleranceConfig) int {
	if expectedTime == nil {
		return actualTime
	}

	exp := *expectedTime

	// Early departure: check tolerance minus
	if actualTime < exp {
		if actualTime >= exp-tolerance.GoMinus {
			return exp
		}
	}

	// Late departure: check tolerance plus
	if actualTime > exp {
		if actualTime <= exp+tolerance.GoPlus {
			return exp
		}
	}

	return actualTime
}

// ValidateTimeWindow checks if a time is within an allowed window.
// Returns error codes if the time is outside the window.
func ValidateTimeWindow(actualTime int, from, to *int, earlyCode, lateCode string) []string {
	var errors []string

	if from != nil && actualTime < *from {
		errors = append(errors, earlyCode)
	}

	if to != nil && actualTime > *to {
		errors = append(errors, lateCode)
	}

	return errors
}

// ValidateCoreHours checks if presence covers required core hours.
// Returns error codes if core hours are not covered.
func ValidateCoreHours(firstCome, lastGo *int, coreStart, coreEnd *int) []string {
	var errors []string

	if coreStart == nil || coreEnd == nil {
		return errors // No core hours defined
	}

	if firstCome == nil || *firstCome > *coreStart {
		errors = append(errors, ErrCodeMissedCoreStart)
	}

	if lastGo == nil || *lastGo < *coreEnd {
		errors = append(errors, ErrCodeMissedCoreEnd)
	}

	return errors
}
