package calculation

// Error codes for calculation problems.
const (
	// Pairing errors
	ErrCodeMissingCome     = "MISSING_COME"     // No arrival booking found
	ErrCodeMissingGo       = "MISSING_GO"       // No departure booking found
	ErrCodeUnpairedBooking = "UNPAIRED_BOOKING" // Booking without matching pair

	// Time window errors
	ErrCodeEarlyCome = "EARLY_COME" // Arrival before allowed window
	ErrCodeLateCome  = "LATE_COME"  // Arrival after allowed window
	ErrCodeEarlyGo   = "EARLY_GO"   // Departure before allowed window
	ErrCodeLateGo    = "LATE_GO"    // Departure after allowed window

	// Core hours errors
	ErrCodeMissedCoreStart = "MISSED_CORE_START" // Arrived after core hours start
	ErrCodeMissedCoreEnd   = "MISSED_CORE_END"   // Left before core hours end

	// Work time errors
	ErrCodeBelowMinWorkTime = "BELOW_MIN_WORK_TIME" // Worked less than minimum
	ErrCodeNoBookings       = "NO_BOOKINGS"         // No bookings for the day

	// Data errors
	ErrCodeInvalidTime     = "INVALID_TIME"      // Time value out of range
	ErrCodeDuplicateInTime = "DUPLICATE_IN_TIME" // Multiple arrivals at same time
)

// Warning codes for non-critical issues.
const (
	WarnCodeCrossMidnight    = "CROSS_MIDNIGHT"     // Shift spans midnight
	WarnCodeMaxTimeReached   = "MAX_TIME_REACHED"   // NetTime capped at max
	WarnCodeManualBreak      = "MANUAL_BREAK"       // Break bookings exist, auto-deduct skipped
	WarnCodeNoBreakRecorded  = "NO_BREAK_RECORDED"  // No break bookings but break required
	WarnCodeShortBreak       = "SHORT_BREAK"        // Recorded break shorter than required
	WarnCodeAutoBreakApplied = "AUTO_BREAK_APPLIED" // Break auto-deducted
)

// IsError returns true if the code represents an error (vs warning).
func IsError(code string) bool {
	switch code {
	case ErrCodeMissingCome, ErrCodeMissingGo, ErrCodeUnpairedBooking,
		ErrCodeEarlyCome, ErrCodeLateCome, ErrCodeEarlyGo, ErrCodeLateGo,
		ErrCodeMissedCoreStart, ErrCodeMissedCoreEnd,
		ErrCodeBelowMinWorkTime, ErrCodeNoBookings,
		ErrCodeInvalidTime, ErrCodeDuplicateInTime:
		return true
	default:
		return false
	}
}
