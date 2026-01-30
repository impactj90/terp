package calculation

// RoundTime applies rounding to a time value based on configuration.
// Returns the original time if config is nil or has RoundingNone type.
//
// For interval-based rounding (up/down/nearest), Interval must be > 0.
// For add/subtract rounding, AddValue is used (Interval is ignored).
//
// When config.AnchorTime is set, interval-based rounding (up/down/nearest)
// uses a grid anchored at the anchor time instead of midnight (00:00).
// This implements the "Abgleich relativ zur Kommt-/Gehtzeit" feature (ZMI Section 7.8).
// Example: anchor=07:03, interval=5 -> grid is 6:58, 7:03, 7:08, 7:13...
func RoundTime(minutes int, config *RoundingConfig) int {
	if config == nil || config.Type == RoundingNone {
		return minutes
	}

	switch config.Type {
	case RoundingUp:
		if config.Interval <= 0 {
			return minutes
		}
		return roundUpAnchored(minutes, config.Interval, config.AnchorTime)
	case RoundingDown:
		if config.Interval <= 0 {
			return minutes
		}
		return roundDownAnchored(minutes, config.Interval, config.AnchorTime)
	case RoundingNearest:
		if config.Interval <= 0 {
			return minutes
		}
		return roundNearestAnchored(minutes, config.Interval, config.AnchorTime)
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

// Anchored rounding: shifts the time relative to the anchor point,
// rounds using standard interval logic, then shifts back.
// This creates a rounding grid centered on the anchor time.
// Example: anchor=423 (07:03), interval=5
//   Grid: ...418, 423, 428, 433...
//   Time 420 -> offset=-3 -> roundUp(-3,5)=0 -> result=423
//   Time 425 -> offset=2  -> roundUp(2,5)=5  -> result=428

func roundUpAnchored(minutes, interval int, anchor *int) int {
	if anchor == nil {
		return roundUp(minutes, interval)
	}
	offset := minutes - *anchor
	rounded := roundUpOffset(offset, interval)
	return *anchor + rounded
}

func roundDownAnchored(minutes, interval int, anchor *int) int {
	if anchor == nil {
		return roundDown(minutes, interval)
	}
	offset := minutes - *anchor
	rounded := roundDownOffset(offset, interval)
	return *anchor + rounded
}

func roundNearestAnchored(minutes, interval int, anchor *int) int {
	if anchor == nil {
		return roundNearest(minutes, interval)
	}
	offset := minutes - *anchor
	rounded := roundNearestOffset(offset, interval)
	return *anchor + rounded
}

// roundUpOffset rounds up supporting negative offsets (Go's % can be negative).
func roundUpOffset(offset, interval int) int {
	if offset == 0 {
		return 0
	}
	remainder := offset % interval
	if remainder == 0 {
		return offset
	}
	if remainder > 0 {
		return offset + (interval - remainder)
	}
	// remainder < 0: e.g., offset=-3, interval=5, remainder=-3 -> result=0
	return offset - remainder
}

// roundDownOffset rounds down supporting negative offsets.
func roundDownOffset(offset, interval int) int {
	if offset == 0 {
		return 0
	}
	remainder := offset % interval
	if remainder == 0 {
		return offset
	}
	if remainder > 0 {
		return offset - remainder
	}
	// remainder < 0: e.g., offset=-3, interval=5, remainder=-3 -> result=-5
	return offset - (interval + remainder)
}

// roundNearestOffset rounds to the nearest interval point, supporting negative offsets.
// For "nearest" semantics we always round toward the closest grid point:
//   - Small remainder (abs <= half interval): round toward zero
//   - Large remainder (abs > half interval): round away from zero
func roundNearestOffset(offset, interval int) int {
	remainder := offset % interval
	absRemainder := remainder
	if absRemainder < 0 {
		absRemainder = -absRemainder
	}
	if absRemainder <= interval/2 {
		// Round toward zero (closest grid point for small remainders)
		if offset >= 0 {
			return roundDownOffset(offset, interval)
		}
		return roundUpOffset(offset, interval)
	}
	// Round away from zero (closest grid point for large remainders)
	if offset >= 0 {
		return roundUpOffset(offset, interval)
	}
	return roundDownOffset(offset, interval)
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
