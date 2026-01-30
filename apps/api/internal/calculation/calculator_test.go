package calculation_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/calculation"
)

func TestCalculator_EmptyBookings(t *testing.T) {
	calc := calculation.NewCalculator()
	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings:   nil,
		DayPlan:    calculation.DayPlanInput{RegularHours: 480},
	}

	result := calc.Calculate(input)

	assert.True(t, result.HasError)
	assert.Contains(t, result.ErrorCodes, calculation.ErrCodeNoBookings)
}

func TestCalculator_SimpleWorkDay(t *testing.T) {
	calc := calculation.NewCalculator()
	comeID, goID := uuid.New(), uuid.New()

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: comeID, Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
			{ID: goID, Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
		},
		DayPlan: calculation.DayPlanInput{RegularHours: 480},
	}

	result := calc.Calculate(input)

	assert.False(t, result.HasError)
	assert.Equal(t, 540, result.GrossTime) // 9 hours
	assert.Equal(t, 540, result.NetTime)   // No breaks
	assert.Equal(t, 480, result.TargetTime)
	assert.Equal(t, 60, result.Overtime)
	assert.Equal(t, 0, result.Undertime)
	assert.Equal(t, 2, result.BookingCount)
	require.NotNil(t, result.FirstCome)
	assert.Equal(t, 480, *result.FirstCome)
	require.NotNil(t, result.LastGo)
	assert.Equal(t, 1020, *result.LastGo)
}

func TestCalculator_WithBreaks(t *testing.T) {
	calc := calculation.NewCalculator()

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
			{ID: uuid.New(), Time: 720, Direction: calculation.DirectionOut, Category: calculation.CategoryBreak},
			{ID: uuid.New(), Time: 750, Direction: calculation.DirectionIn, Category: calculation.CategoryBreak},
			{ID: uuid.New(), Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
		},
		DayPlan: calculation.DayPlanInput{RegularHours: 480},
	}

	result := calc.Calculate(input)

	assert.False(t, result.HasError)
	assert.Equal(t, 540, result.GrossTime) // 9 hours (08:00-17:00)
	assert.Equal(t, 30, result.BreakTime)  // 30 min break
	assert.Equal(t, 510, result.NetTime)   // 8.5 hours
	assert.Equal(t, 30, result.Overtime)   // 30 min overtime
}

func TestCalculator_WithAutoDeductBreak(t *testing.T) {
	calc := calculation.NewCalculator()
	threshold := 300 // 5 hours

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
			{ID: uuid.New(), Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			Breaks: []calculation.BreakConfig{
				{Type: calculation.BreakTypeMinimum, Duration: 30, AfterWorkMinutes: &threshold, AutoDeduct: true},
			},
		},
	}

	result := calc.Calculate(input)

	assert.False(t, result.HasError)
	assert.Equal(t, 540, result.GrossTime)
	assert.Equal(t, 30, result.BreakTime)
	assert.Equal(t, 510, result.NetTime)
	assert.Contains(t, result.Warnings, calculation.WarnCodeAutoBreakApplied)
}

func TestCalculator_WithRounding(t *testing.T) {
	calc := calculation.NewCalculator()
	comeID, goID := uuid.New(), uuid.New()

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: comeID, Time: 483, Direction: calculation.DirectionIn, Category: calculation.CategoryWork}, // 08:03
			{ID: goID, Time: 1017, Direction: calculation.DirectionOut, Category: calculation.CategoryWork}, // 16:57
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			RoundingCome: &calculation.RoundingConfig{Type: calculation.RoundingUp, Interval: 15},
			RoundingGo:   &calculation.RoundingConfig{Type: calculation.RoundingDown, Interval: 15},
		},
	}

	result := calc.Calculate(input)

	// Come 08:03 rounds up to 08:15 (495)
	// Go 16:57 rounds down to 16:45 (1005)
	// Duration: 1005 - 495 = 510 minutes
	assert.Equal(t, 510, result.GrossTime)
	assert.Equal(t, 495, result.CalculatedTimes[comeID])
	assert.Equal(t, 1005, result.CalculatedTimes[goID])
}

func TestCalculator_WithTolerance(t *testing.T) {
	calc := calculation.NewCalculator()
	comeID, goID := uuid.New(), uuid.New()
	comeFrom := 480 // Expected arrival: 08:00
	goTo := 1020    // Expected departure: 17:00

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: comeID, Time: 483, Direction: calculation.DirectionIn, Category: calculation.CategoryWork}, // 08:03 (3 min late)
			{ID: goID, Time: 1017, Direction: calculation.DirectionOut, Category: calculation.CategoryWork}, // 16:57 (3 min early)
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			ComeFrom:     &comeFrom,
			GoTo:         &goTo,
			Tolerance: calculation.ToleranceConfig{
				ComePlus: 5, // 5 min grace for late arrival
				GoMinus:  5, // 5 min grace for early departure
			},
		},
	}

	result := calc.Calculate(input)

	// Come 08:03 within tolerance, treated as 08:00
	// Go 16:57 within tolerance, treated as 17:00
	// Duration: 1020 - 480 = 540 minutes
	assert.Equal(t, 540, result.GrossTime)
	assert.Equal(t, 480, result.CalculatedTimes[comeID])
	assert.Equal(t, 1020, result.CalculatedTimes[goID])
}

func TestCalculator_Tolerance_UsesComeFromAndGoTo(t *testing.T) {
	calc := calculation.NewCalculator()
	comeID, goID := uuid.New(), uuid.New()
	comeFrom := 450 // 07:30
	goFrom := 960   // 16:00 (should be ignored)
	goTo := 1050    // 17:30

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: comeID, Time: 453, Direction: calculation.DirectionIn, Category: calculation.CategoryWork}, // 07:33 (late by 3)
			{ID: goID, Time: 1047, Direction: calculation.DirectionOut, Category: calculation.CategoryWork}, // 17:27 (early by 3)
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			ComeFrom:     &comeFrom,
			GoFrom:       &goFrom,
			GoTo:         &goTo,
			Tolerance: calculation.ToleranceConfig{
				ComePlus: 5,
				GoMinus:  5,
			},
		},
	}

	result := calc.Calculate(input)

	// Arrival within tolerance should normalize to Kommen von (07:30)
	assert.Equal(t, 450, result.CalculatedTimes[comeID])
	// Departure within tolerance should normalize to Gehen bis (17:30)
	assert.Equal(t, 1050, result.CalculatedTimes[goID])
}

func TestCalculator_WindowCappingAdjustsGrossTime(t *testing.T) {
	calc := calculation.NewCalculator()
	comeID, goID := uuid.New(), uuid.New()
	comeFrom := 420 // 07:00
	goTo := 1020    // 17:00

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: comeID, Time: 405, Direction: calculation.DirectionIn, Category: calculation.CategoryWork}, // 06:45
			{ID: goID, Time: 1050, Direction: calculation.DirectionOut, Category: calculation.CategoryWork}, // 17:30
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			ComeFrom:     &comeFrom,
			GoTo:         &goTo,
		},
	}

	result := calc.Calculate(input)

	// Bookings capped to evaluation window: 07:00-17:00 = 600 min
	assert.Equal(t, 600, result.GrossTime)
	assert.Equal(t, 420, result.CalculatedTimes[comeID])
	assert.Equal(t, 1020, result.CalculatedTimes[goID])
	assert.Equal(t, 45, result.CappedTime) // 15 + 30
}

func TestCalculator_UnpairedBooking(t *testing.T) {
	calc := calculation.NewCalculator()
	comeID := uuid.New()

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: comeID, Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
		},
		DayPlan: calculation.DayPlanInput{RegularHours: 480},
	}

	result := calc.Calculate(input)

	assert.True(t, result.HasError)
	assert.Contains(t, result.ErrorCodes, calculation.ErrCodeMissingGo)
	assert.Equal(t, []uuid.UUID{comeID}, result.UnpairedInIDs)
}

func TestCalculator_TimeWindowViolation(t *testing.T) {
	calc := calculation.NewCalculator()
	comeFrom := 480 // Earliest arrival: 08:00
	comeTo := 510   // Latest arrival: 08:30

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 540, Direction: calculation.DirectionIn, Category: calculation.CategoryWork}, // 09:00 (late!)
			{ID: uuid.New(), Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			ComeFrom:     &comeFrom,
			ComeTo:       &comeTo,
		},
	}

	result := calc.Calculate(input)

	assert.True(t, result.HasError)
	assert.Contains(t, result.ErrorCodes, calculation.ErrCodeLateCome)
}

func TestCalculator_CoreHoursViolation(t *testing.T) {
	calc := calculation.NewCalculator()
	coreStart := 540 // Core starts: 09:00
	coreEnd := 960   // Core ends: 16:00

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 600, Direction: calculation.DirectionIn, Category: calculation.CategoryWork}, // 10:00 (missed core start!)
			{ID: uuid.New(), Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			CoreStart:    &coreStart,
			CoreEnd:      &coreEnd,
		},
	}

	result := calc.Calculate(input)

	assert.True(t, result.HasError)
	assert.Contains(t, result.ErrorCodes, calculation.ErrCodeMissedCoreStart)
}

func TestCalculator_MaxNetWorkTime(t *testing.T) {
	calc := calculation.NewCalculator()
	maxNet := 480 // Max 8 hours

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 420, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},   // 07:00
			{ID: uuid.New(), Time: 1080, Direction: calculation.DirectionOut, Category: calculation.CategoryWork}, // 18:00 (11 hours!)
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours:   480,
			MaxNetWorkTime: &maxNet,
		},
	}

	result := calc.Calculate(input)

	assert.Equal(t, 660, result.GrossTime) // 11 hours
	assert.Equal(t, 480, result.NetTime)   // Capped at 8 hours
	assert.Contains(t, result.Warnings, calculation.WarnCodeMaxTimeReached)
}

func TestCalculator_MinWorkTime(t *testing.T) {
	calc := calculation.NewCalculator()
	minWork := 240 // Minimum 4 hours

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
			{ID: uuid.New(), Time: 600, Direction: calculation.DirectionOut, Category: calculation.CategoryWork}, // Only 2 hours
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			MinWorkTime:  &minWork,
		},
	}

	result := calc.Calculate(input)

	assert.True(t, result.HasError)
	assert.Contains(t, result.ErrorCodes, calculation.ErrCodeBelowMinWorkTime)
}

func TestCalculator_CrossMidnight(t *testing.T) {
	calc := calculation.NewCalculator()

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 1320, Direction: calculation.DirectionIn, Category: calculation.CategoryWork}, // 22:00
			{ID: uuid.New(), Time: 120, Direction: calculation.DirectionOut, Category: calculation.CategoryWork}, // 02:00 next day
		},
		DayPlan: calculation.DayPlanInput{RegularHours: 480},
	}

	result := calc.Calculate(input)

	assert.Equal(t, 240, result.GrossTime) // 4 hours
	assert.Contains(t, result.Warnings, calculation.WarnCodeCrossMidnight)
}

func TestCalculator_FullWorkDay(t *testing.T) {
	// Integration test: typical work day with all features
	calc := calculation.NewCalculator()
	threshold := 360 // 6 hours
	coreStart := 540 // 09:00
	coreEnd := 960   // 16:00
	comeFrom := 450  // 07:30
	comeTo := 540    // 09:00
	goFrom := 960    // 16:00
	goTo := 1080     // 18:00

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 478, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},   // 07:58
			{ID: uuid.New(), Time: 720, Direction: calculation.DirectionOut, Category: calculation.CategoryBreak}, // 12:00 break start
			{ID: uuid.New(), Time: 765, Direction: calculation.DirectionIn, Category: calculation.CategoryBreak},  // 12:45 break end
			{ID: uuid.New(), Time: 1022, Direction: calculation.DirectionOut, Category: calculation.CategoryWork}, // 17:02
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			ComeFrom:     &comeFrom,
			ComeTo:       &comeTo,
			GoFrom:       &goFrom,
			GoTo:         &goTo,
			CoreStart:    &coreStart,
			CoreEnd:      &coreEnd,
			Tolerance: calculation.ToleranceConfig{
				ComePlus:  5,
				ComeMinus: 5,
				GoPlus:    5,
				GoMinus:   5,
			},
			RoundingCome: &calculation.RoundingConfig{Type: calculation.RoundingNearest, Interval: 5},
			RoundingGo:   &calculation.RoundingConfig{Type: calculation.RoundingNearest, Interval: 5},
			Breaks: []calculation.BreakConfig{
				{
					Type:             calculation.BreakTypeMinimum,
					Duration:         30,
					AfterWorkMinutes: &threshold,
					AutoDeduct:       true,
				},
			},
		},
	}

	result := calc.Calculate(input)

	assert.False(t, result.HasError, "Expected no errors, got: %v", result.ErrorCodes)
	assert.Greater(t, result.GrossTime, 0)
	assert.Greater(t, result.NetTime, 0)
	// With new ZMI spec: manual break (45) + minimum break (30) = 75
	assert.Equal(t, 75, result.BreakTime)
}

func TestCalculator_FixedBreakDeduction(t *testing.T) {
	calc := calculation.NewCalculator()

	// Work: 08:00-17:00, Fixed break window: 12:00-12:30
	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Now(),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
			{ID: uuid.New(), Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			Breaks: []calculation.BreakConfig{
				{
					Type:      calculation.BreakTypeFixed,
					StartTime: intPtr(720),
					EndTime:   intPtr(750),
					Duration:  30,
				},
			},
		},
	}

	result := calc.Calculate(input)

	assert.Equal(t, 540, result.GrossTime)
	assert.Equal(t, 30, result.BreakTime)
	assert.Equal(t, 510, result.NetTime)
}

func TestCalculator_FixedBreakWithManualBreak(t *testing.T) {
	calc := calculation.NewCalculator()

	// Work: 08:00-17:00 with manual break 12:00-12:45
	// Fixed break: 12:00-12:30
	// Fixed break is ALWAYS deducted (30 min overlap)
	// Manual break is also counted (45 min)
	// Total: 30 + 45 = 75 min
	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Now(),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
			{ID: uuid.New(), Time: 720, Direction: calculation.DirectionOut, Category: calculation.CategoryBreak},
			{ID: uuid.New(), Time: 765, Direction: calculation.DirectionIn, Category: calculation.CategoryBreak},
			{ID: uuid.New(), Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			Breaks: []calculation.BreakConfig{
				{
					Type:      calculation.BreakTypeFixed,
					StartTime: intPtr(720),
					EndTime:   intPtr(750),
					Duration:  30,
				},
			},
		},
	}

	result := calc.Calculate(input)

	assert.Equal(t, 540, result.GrossTime)
	assert.Equal(t, 75, result.BreakTime)
	assert.Equal(t, 465, result.NetTime)
	assert.Contains(t, result.Warnings, calculation.WarnCodeManualBreak)
}

func TestCalculator_VariableBreakNoManualBreak(t *testing.T) {
	calc := calculation.NewCalculator()

	// Work: 08:00-17:00, no manual break
	// Variable break: 30 min after 5 hours
	// Employee worked 9 hours with no break -> variable break applies
	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Now(),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
			{ID: uuid.New(), Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			Breaks: []calculation.BreakConfig{
				{
					Type:             calculation.BreakTypeVariable,
					Duration:         30,
					AfterWorkMinutes: intPtr(300),
					AutoDeduct:       true,
				},
			},
		},
	}

	result := calc.Calculate(input)

	assert.Equal(t, 540, result.GrossTime)
	assert.Equal(t, 30, result.BreakTime)
	assert.Equal(t, 510, result.NetTime)
	assert.Contains(t, result.Warnings, calculation.WarnCodeAutoBreakApplied)
}

func TestCalculator_VariableBreakWithManualBreak(t *testing.T) {
	calc := calculation.NewCalculator()

	// Work: 08:00-17:00 with manual break 12:00-12:30
	// Variable break: 30 min after 5 hours
	// Employee booked a break -> variable break does NOT apply
	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Now(),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
			{ID: uuid.New(), Time: 720, Direction: calculation.DirectionOut, Category: calculation.CategoryBreak},
			{ID: uuid.New(), Time: 750, Direction: calculation.DirectionIn, Category: calculation.CategoryBreak},
			{ID: uuid.New(), Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			Breaks: []calculation.BreakConfig{
				{
					Type:             calculation.BreakTypeVariable,
					Duration:         30,
					AfterWorkMinutes: intPtr(300),
					AutoDeduct:       true,
				},
			},
		},
	}

	result := calc.Calculate(input)

	assert.Equal(t, 540, result.GrossTime)
	assert.Equal(t, 30, result.BreakTime) // Only manual break counted
	assert.Equal(t, 510, result.NetTime)
	assert.Contains(t, result.Warnings, calculation.WarnCodeManualBreak)
	assert.NotContains(t, result.Warnings, calculation.WarnCodeAutoBreakApplied)
}

func TestCalculator_MinimumBreakProportional(t *testing.T) {
	calc := calculation.NewCalculator()

	// Work: 08:00-13:10 (5 hours 10 min = 310 min)
	// Minimum break: 30 min after 5 hours with MinutesDifference
	// Only 10 min over threshold -> only 10 min deducted
	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Now(),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
			{ID: uuid.New(), Time: 790, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 300,
			Breaks: []calculation.BreakConfig{
				{
					Type:              calculation.BreakTypeMinimum,
					Duration:          30,
					AfterWorkMinutes:  intPtr(300),
					AutoDeduct:        true,
					MinutesDifference: true,
				},
			},
		},
	}

	result := calc.Calculate(input)

	assert.Equal(t, 310, result.GrossTime)
	assert.Equal(t, 10, result.BreakTime) // Proportional: only 10 min
	assert.Equal(t, 300, result.NetTime)
}

func TestCalculator_MinimumBreakFull(t *testing.T) {
	calc := calculation.NewCalculator()

	// Work: 08:00-17:00 (9 hours)
	// Minimum break: 30 min after 5 hours with MinutesDifference
	// 4 hours over threshold -> capped at 30 min
	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Now(),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
			{ID: uuid.New(), Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			Breaks: []calculation.BreakConfig{
				{
					Type:              calculation.BreakTypeMinimum,
					Duration:          30,
					AfterWorkMinutes:  intPtr(300),
					AutoDeduct:        true,
					MinutesDifference: true,
				},
			},
		},
	}

	result := calc.Calculate(input)

	assert.Equal(t, 540, result.GrossTime)
	assert.Equal(t, 30, result.BreakTime) // Capped at Duration
	assert.Equal(t, 510, result.NetTime)
}

func TestCalculator_RoundAllBookingsFalse(t *testing.T) {
	// When RoundAllBookings=false (default), only first-in and last-out work bookings are rounded.
	calc := calculation.NewCalculator()
	in1 := uuid.New()
	out1 := uuid.New()
	in2 := uuid.New()
	out2 := uuid.New()

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: in1, Time: 483, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},    // 08:03
			{ID: out1, Time: 723, Direction: calculation.DirectionOut, Category: calculation.CategoryBreak}, // 12:03
			{ID: in2, Time: 753, Direction: calculation.DirectionIn, Category: calculation.CategoryBreak},   // 12:33
			{ID: out2, Time: 1017, Direction: calculation.DirectionOut, Category: calculation.CategoryWork}, // 16:57
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours:     480,
			RoundAllBookings: false,
			RoundingCome:     &calculation.RoundingConfig{Type: calculation.RoundingUp, Interval: 15},
			RoundingGo:       &calculation.RoundingConfig{Type: calculation.RoundingDown, Interval: 15},
		},
	}

	result := calc.Calculate(input)

	// First-in (08:03) rounded up to 08:15 = 495
	assert.Equal(t, 495, result.CalculatedTimes[in1])
	// Break out (12:03) NOT rounded (intermediate booking)
	assert.Equal(t, 723, result.CalculatedTimes[out1])
	// Break in (12:33) NOT rounded (intermediate booking)
	assert.Equal(t, 753, result.CalculatedTimes[in2])
	// Last-out (16:57) rounded down to 16:45 = 1005
	assert.Equal(t, 1005, result.CalculatedTimes[out2])
}

func TestCalculator_RoundAllBookingsTrue(t *testing.T) {
	// When RoundAllBookings=true, all work bookings are rounded.
	calc := calculation.NewCalculator()
	in1 := uuid.New()
	out1 := uuid.New()
	in2 := uuid.New()
	out2 := uuid.New()

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: in1, Time: 483, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},    // 08:03
			{ID: out1, Time: 723, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},  // 12:03 (work out, not break)
			{ID: in2, Time: 753, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},    // 12:33 (work in, not break)
			{ID: out2, Time: 1017, Direction: calculation.DirectionOut, Category: calculation.CategoryWork}, // 16:57
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours:     480,
			RoundAllBookings: true,
			RoundingCome:     &calculation.RoundingConfig{Type: calculation.RoundingUp, Interval: 15},
			RoundingGo:       &calculation.RoundingConfig{Type: calculation.RoundingDown, Interval: 15},
		},
	}

	result := calc.Calculate(input)

	// All in-bookings rounded up to nearest 15: 08:03 → 08:15 = 495
	assert.Equal(t, 495, result.CalculatedTimes[in1])
	// All out-bookings rounded down to nearest 15: 12:03 → 12:00 = 720
	assert.Equal(t, 720, result.CalculatedTimes[out1])
	// All in-bookings rounded up: 12:33 → 12:45 = 765
	assert.Equal(t, 765, result.CalculatedTimes[in2])
	// All out-bookings rounded down: 16:57 → 16:45 = 1005
	assert.Equal(t, 1005, result.CalculatedTimes[out2])
}

func TestCalculator_RoundAllBookingsDefault(t *testing.T) {
	// Default (zero value) for RoundAllBookings is false, so only first/last are rounded.
	calc := calculation.NewCalculator()
	in1 := uuid.New()
	out1 := uuid.New()
	in2 := uuid.New()
	out2 := uuid.New()

	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Date:       time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Bookings: []calculation.BookingInput{
			{ID: in1, Time: 487, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},    // 08:07
			{ID: out1, Time: 727, Direction: calculation.DirectionOut, Category: calculation.CategoryBreak}, // 12:07
			{ID: in2, Time: 757, Direction: calculation.DirectionIn, Category: calculation.CategoryBreak},   // 12:37
			{ID: out2, Time: 1013, Direction: calculation.DirectionOut, Category: calculation.CategoryWork}, // 16:53
		},
		DayPlan: calculation.DayPlanInput{
			RegularHours: 480,
			// RoundAllBookings not set - defaults to false
			RoundingCome: &calculation.RoundingConfig{Type: calculation.RoundingUp, Interval: 15},
			RoundingGo:   &calculation.RoundingConfig{Type: calculation.RoundingDown, Interval: 15},
		},
	}

	result := calc.Calculate(input)

	// First-in (08:07) rounded up to 08:15 = 495
	assert.Equal(t, 495, result.CalculatedTimes[in1])
	// Break out (12:07) NOT rounded
	assert.Equal(t, 727, result.CalculatedTimes[out1])
	// Break in (12:37) NOT rounded
	assert.Equal(t, 757, result.CalculatedTimes[in2])
	// Last-out (16:53) rounded down to 16:45 = 1005
	assert.Equal(t, 1005, result.CalculatedTimes[out2])
}
