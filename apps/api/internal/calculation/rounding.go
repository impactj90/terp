package calculation

// RoundTime applies rounding to a time value based on configuration.
// Returns the original time if config is nil or has RoundingNone type.
func RoundTime(minutes int, config *RoundingConfig) int {
	if config == nil || config.Type == RoundingNone || config.Interval <= 0 {
		return minutes
	}

	switch config.Type {
	case RoundingUp:
		return roundUp(minutes, config.Interval)
	case RoundingDown:
		return roundDown(minutes, config.Interval)
	case RoundingNearest:
		return roundNearest(minutes, config.Interval)
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

// RoundComeTime applies rounding to an arrival time.
func RoundComeTime(minutes int, config *RoundingConfig) int {
	return RoundTime(minutes, config)
}

// RoundGoTime applies rounding to a departure time.
func RoundGoTime(minutes int, config *RoundingConfig) int {
	return RoundTime(minutes, config)
}
