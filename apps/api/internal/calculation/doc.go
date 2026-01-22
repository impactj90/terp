// Package calculation provides pure time tracking calculations for the Terp system.
//
// This package handles the core business logic for calculating daily work values
// from booking data and day plan configurations. It has no database or HTTP
// dependencies - it operates purely on input structs and produces output structs.
//
// # Data Flow
//
// Input:
//   - []BookingInput: Clock-in/out events with times and types
//   - DayPlanInput: Work schedule configuration (tolerance, rounding, breaks)
//
// Output:
//   - CalculationResult: Calculated times, errors, and warnings
//
// # Time Representation
//
// All times are represented as minutes from midnight (0-1439 for same-day times).
// For cross-midnight shifts, end times may exceed 1439 (e.g., 02:00 next day = 1560).
// Durations are also in minutes.
//
// # Usage
//
//	calc := calculation.NewCalculator()
//	result := calc.Calculate(ctx, input)
//	if result.HasError {
//	    // Handle errors
//	}
//	// Use result.GrossTime, result.NetTime, etc.
package calculation
