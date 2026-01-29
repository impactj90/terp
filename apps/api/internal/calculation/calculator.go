package calculation

import (
	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
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

	// Step 1: Apply rounding, tolerance, and window capping to bookings
	processedBookings, validationBookings, windowCappingItems := c.processBookings(input.Bookings, input.DayPlan, &result)

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

	// Step 3: Calculate first come / last go from uncapped times
	result.FirstCome = FindFirstCome(validationBookings)
	result.LastGo = FindLastGo(validationBookings)

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
	// First calculate uncapped net time for capping tracking
	uncappedNet := result.GrossTime - result.BreakTime
	if uncappedNet < 0 {
		uncappedNet = 0
	}

	// Apply max net time cap
	result.NetTime, _ = ApplyCapping(uncappedNet, input.DayPlan.MaxNetWorkTime)
	if result.NetTime != uncappedNet {
		result.Warnings = append(result.Warnings, WarnCodeMaxTimeReached)
	}

	// Step 8a: Calculate and aggregate capping
	cappingItems := make([]*CappedTime, 0, len(windowCappingItems)+1)
	cappingItems = append(cappingItems, windowCappingItems...)

	// Max net time capping
	maxNetCap := CalculateMaxNetTimeCapping(uncappedNet, input.DayPlan.MaxNetWorkTime)
	cappingItems = append(cappingItems, maxNetCap)

	// Aggregate
	result.Capping = AggregateCapping(cappingItems...)
	result.CappedTime = result.Capping.TotalCapped

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
) ([]BookingInput, []BookingInput, []*CappedTime) {
	processed := make([]BookingInput, len(bookings))
	validation := make([]BookingInput, len(bookings))
	cappingItems := make([]*CappedTime, 0)

	allowEarlyTolerance := dayPlan.VariableWorkTime || dayPlan.PlanType == model.PlanTypeFlextime

	// Identify first-in and last-out work booking indices for rounding scope
	firstInIdx := -1
	lastOutIdx := -1
	if !dayPlan.RoundAllBookings {
		for i, b := range bookings {
			if b.Category != CategoryWork {
				continue
			}
			if b.Direction == DirectionIn && firstInIdx == -1 {
				firstInIdx = i
			}
			if b.Direction == DirectionOut {
				lastOutIdx = i
			}
		}
	}

	for i, b := range bookings {
		processed[i] = b
		validation[i] = b
		calculatedTime := b.Time

		if b.Category == CategoryWork {
			if b.Direction == DirectionIn {
				// Apply come tolerance using Kommen von
				calculatedTime = ApplyComeTolerance(b.Time, dayPlan.ComeFrom, dayPlan.Tolerance)
				// Apply come rounding (only first-in unless RoundAllBookings)
				if dayPlan.RoundAllBookings || i == firstInIdx {
					calculatedTime = RoundComeTime(calculatedTime, dayPlan.RoundingCome)
				}
			} else {
				// Apply go tolerance using Gehen bis (fallback to Gehen von)
				expectedGo := dayPlan.GoTo
				if expectedGo == nil {
					expectedGo = dayPlan.GoFrom
				}
				calculatedTime = ApplyGoTolerance(b.Time, expectedGo, dayPlan.Tolerance)
				// Apply go rounding (only last-out unless RoundAllBookings)
				if dayPlan.RoundAllBookings || i == lastOutIdx {
					calculatedTime = RoundGoTime(calculatedTime, dayPlan.RoundingGo)
				}
			}
		}

		// Preserve pre-capped time for validation
		validation[i].Time = calculatedTime

		// Apply evaluation window capping for work bookings
		cappedTime := calculatedTime
		if b.Category == CategoryWork {
			var capped int
			if b.Direction == DirectionIn {
				cappedTime, capped = ApplyWindowCapping(
					calculatedTime,
					dayPlan.ComeFrom,
					dayPlan.GoTo,
					dayPlan.Tolerance.ComeMinus,
					dayPlan.Tolerance.GoPlus,
					true,
					allowEarlyTolerance,
				)
				if capped > 0 {
					cappingItems = append(cappingItems, &CappedTime{
						Minutes: capped,
						Source:  CappingSourceEarlyArrival,
						Reason:  "Arrival before evaluation window",
					})
				}
			} else {
				cappedTime, capped = ApplyWindowCapping(
					calculatedTime,
					dayPlan.ComeFrom,
					dayPlan.GoTo,
					dayPlan.Tolerance.ComeMinus,
					dayPlan.Tolerance.GoPlus,
					false,
					allowEarlyTolerance,
				)
				if capped > 0 {
					cappingItems = append(cappingItems, &CappedTime{
						Minutes: capped,
						Source:  CappingSourceLateLeave,
						Reason:  "Departure after evaluation window",
					})
				}
			}
		}

		processed[i].Time = cappedTime
		result.CalculatedTimes[b.ID] = cappedTime
	}

	return processed, validation, cappingItems
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
