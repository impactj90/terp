package calculation

import (
	"github.com/google/uuid"
)

// Calculator performs time tracking calculations.
type Calculator struct{}

// NewCalculator creates a new Calculator instance.
func NewCalculator() *Calculator {
	return &Calculator{}
}

// Calculate performs a full day calculation and returns the result.
func (c *Calculator) Calculate(input CalculationInput) CalculationResult {
	result := CalculationResult{
		TargetTime:      input.DayPlan.RegularHours,
		BookingCount:    len(input.Bookings),
		CalculatedTimes: make(map[uuid.UUID]int),
		ErrorCodes:      make([]string, 0),
		Warnings:        make([]string, 0),
	}

	// Handle empty bookings
	if len(input.Bookings) == 0 {
		result.HasError = true
		result.ErrorCodes = append(result.ErrorCodes, ErrCodeNoBookings)
		return result
	}

	// Step 1: Apply rounding and tolerance to bookings
	processedBookings := c.processBookings(input.Bookings, input.DayPlan, &result)

	// Step 2: Pair bookings
	pairingResult := PairBookings(processedBookings)
	result.Pairs = pairingResult.Pairs
	result.UnpairedInIDs = pairingResult.UnpairedInIDs
	result.UnpairedOutIDs = pairingResult.UnpairedOutIDs
	result.Warnings = append(result.Warnings, pairingResult.Warnings...)

	// Add errors for unpaired bookings
	if len(result.UnpairedInIDs) > 0 {
		result.ErrorCodes = append(result.ErrorCodes, ErrCodeMissingGo)
	}
	if len(result.UnpairedOutIDs) > 0 {
		result.ErrorCodes = append(result.ErrorCodes, ErrCodeMissingCome)
	}

	// Step 3: Calculate first come / last go
	result.FirstCome = FindFirstCome(processedBookings)
	result.LastGo = FindLastGo(processedBookings)

	// Step 4: Validate time windows
	c.validateTimeWindows(&result, input.DayPlan)

	// Step 5: Validate core hours
	coreErrors := ValidateCoreHours(
		result.FirstCome,
		result.LastGo,
		input.DayPlan.CoreStart,
		input.DayPlan.CoreEnd,
	)
	result.ErrorCodes = append(result.ErrorCodes, coreErrors...)

	// Step 6: Calculate gross time
	result.GrossTime = CalculateGrossTime(result.Pairs)

	// Step 7: Calculate break deduction
	recordedBreakTime := CalculateBreakTime(result.Pairs)
	breakResult := CalculateBreakDeduction(
		result.Pairs,
		recordedBreakTime,
		result.GrossTime,
		input.DayPlan.Breaks,
	)
	result.BreakTime = breakResult.DeductedMinutes
	result.Warnings = append(result.Warnings, breakResult.Warnings...)

	// Step 8: Calculate net time
	netTime, netWarnings := CalculateNetTime(
		result.GrossTime,
		result.BreakTime,
		input.DayPlan.MaxNetWorkTime,
	)
	result.NetTime = netTime
	result.Warnings = append(result.Warnings, netWarnings...)

	// Step 9: Validate minimum work time
	if input.DayPlan.MinWorkTime != nil && result.NetTime < *input.DayPlan.MinWorkTime {
		result.ErrorCodes = append(result.ErrorCodes, ErrCodeBelowMinWorkTime)
	}

	// Step 10: Calculate overtime/undertime
	result.Overtime, result.Undertime = CalculateOvertimeUndertime(result.NetTime, result.TargetTime)

	// Set error flag if any errors
	result.HasError = len(result.ErrorCodes) > 0

	return result
}

func (c *Calculator) processBookings(
	bookings []BookingInput,
	dayPlan DayPlanInput,
	result *CalculationResult,
) []BookingInput {
	processed := make([]BookingInput, len(bookings))

	for i, b := range bookings {
		processed[i] = b
		calculatedTime := b.Time

		if b.Category == CategoryWork {
			if b.Direction == DirectionIn {
				// Apply come tolerance
				calculatedTime = ApplyComeTolerance(b.Time, dayPlan.ComeTo, dayPlan.Tolerance)
				// Apply come rounding
				calculatedTime = RoundComeTime(calculatedTime, dayPlan.RoundingCome)
			} else {
				// Apply go tolerance
				calculatedTime = ApplyGoTolerance(b.Time, dayPlan.GoFrom, dayPlan.Tolerance)
				// Apply go rounding
				calculatedTime = RoundGoTime(calculatedTime, dayPlan.RoundingGo)
			}
		}

		processed[i].Time = calculatedTime
		result.CalculatedTimes[b.ID] = calculatedTime
	}

	return processed
}

func (c *Calculator) validateTimeWindows(result *CalculationResult, dayPlan DayPlanInput) {
	if result.FirstCome != nil {
		comeErrors := ValidateTimeWindow(
			*result.FirstCome,
			dayPlan.ComeFrom,
			dayPlan.ComeTo,
			ErrCodeEarlyCome,
			ErrCodeLateCome,
		)
		result.ErrorCodes = append(result.ErrorCodes, comeErrors...)
	}

	if result.LastGo != nil {
		goErrors := ValidateTimeWindow(
			*result.LastGo,
			dayPlan.GoFrom,
			dayPlan.GoTo,
			ErrCodeEarlyGo,
			ErrCodeLateGo,
		)
		result.ErrorCodes = append(result.ErrorCodes, goErrors...)
	}
}
