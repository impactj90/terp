package calculation

// RoundTime applies rounding to a time value based on configuration.
// Returns the original time if config is nil or has RoundingNone type.
//
// For interval-based rounding (up/down/nearest), Interval must be > 0.
// For add/subtract rounding, AddValue is used (Interval is ignored).
func RoundTime(minutes int, config *RoundingConfig) int {
	if config == nil || config.Type == RoundingNone {
		return minutes
	}

	switch config.Type {
	case RoundingUp:
		if config.Interval <= 0 {
			return minutes
		}
		return roundUp(minutes, config.Interval)
	case RoundingDown:
		if config.Interval <= 0 {
			return minutes
		}
		return roundDown(minutes, config.Interval)
	case RoundingNearest:
		if config.Interval <= 0 {
			return minutes
		}
		return roundNearest(minutes, config.Interval)
	case RoundingAdd:
		if config.AddValue <= 0 {
			return minutes
		}
		return roundAdd(minutes, config.AddValue)
	case RoundingSubtract:
		if config.AddValue <= 0 {
			return minutes
		}
		return roundSubtract(minutes, config.AddValue)
	default:
		return minutes
	}
}

func roundUp(minutes, interval int) int {
	remainder := minutes % interval
	if remainder == 0 {
		return minutes
	}
	return minutes + (interval - remainder)
}

func roundDown(minutes, interval int) int {
	return minutes - (minutes % interval)
}

func roundNearest(minutes, interval int) int {
	remainder := minutes % interval
	if remainder <= interval/2 {
		return roundDown(minutes, interval)
	}
	return roundUp(minutes, interval)
}

// roundAdd adds a fixed value to the time.
// Used for walk time compensation (arrive later than booked).
func roundAdd(minutes, value int) int {
	return minutes + value
}

// roundSubtract subtracts a fixed value from the time.
// Used for shower time deduction (leave earlier than booked).
// Result is clamped to 0 minimum.
func roundSubtract(minutes, value int) int {
	result := minutes - value
	if result < 0 {
		return 0
	}
	return result
}

// RoundComeTime applies rounding to an arrival time.
func RoundComeTime(minutes int, config *RoundingConfig) int {
	return RoundTime(minutes, config)
}

// RoundGoTime applies rounding to a departure time.
func RoundGoTime(minutes int, config *RoundingConfig) int {
	return RoundTime(minutes, config)
}
