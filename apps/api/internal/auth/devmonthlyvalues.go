package auth

import (
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// DevMonthlyValue represents a predefined development monthly value (monthly aggregates).
type DevMonthlyValue struct {
	ID               uuid.UUID
	EmployeeID       uuid.UUID
	Year             int
	Month            int
	TotalGrossTime   int // Minutes
	TotalNetTime     int // Minutes
	TotalTargetTime  int // Minutes
	TotalOvertime    int // Minutes
	TotalUndertime   int // Minutes
	TotalBreakTime   int // Minutes
	FlextimeStart    int // Minutes (carryover from previous month)
	FlextimeChange   int // Minutes (overtime - undertime for this month)
	FlextimeEnd      int // Minutes (start + change)
	VacationTaken    decimal.Decimal
	SickDays         int
	OtherAbsenceDays int
	WorkDays         int
	DaysWithErrors   int
	IsClosed         bool
}

// decemberFlextimeEnd maps employee IDs to their December 2025 flextime end balance.
// January 2026 FlextimeStart must match these values.
var decemberFlextimeEnd = map[uuid.UUID]int{
	DevEmployeeAdminID:  720, // +12:00
	DevEmployeeUserID:   120, // +2:00
	DevEmployeeMariaID:  60,  // +1:00
	DevEmployeeThomasID: 240, // +4:00
	DevEmployeeAnnaID:   180, // +3:00
}

// generateDevMonthlyValues creates monthly values for all employees.
// December 2025 values are historical (hardcoded, closed months).
// January 2026 values are computed from the daily values to ensure consistency.
func generateDevMonthlyValues() []DevMonthlyValue {
	var values []DevMonthlyValue

	// Historical December 2025 - closed months (no daily value backing)
	values = append(values, generateDecember2025Values()...)

	// January 2026 - computed from daily values
	values = append(values, computeJanuary2026FromDailyValues()...)

	return values
}

// generateDecember2025Values creates hardcoded historical December 2025 monthly values.
func generateDecember2025Values() []DevMonthlyValue {
	var values []DevMonthlyValue

	// Admin Employee - December 2025 (closed)
	values = append(values, DevMonthlyValue{
		ID:               uuid.MustParse(uuidFromInt(5000)),
		EmployeeID:       DevEmployeeAdminID,
		Year:             2025,
		Month:            12,
		TotalGrossTime:   10260,
		TotalNetTime:     9750,
		TotalTargetTime:  9600, // 20 days * 8h
		TotalOvertime:    150,
		TotalUndertime:   0,
		TotalBreakTime:   510,
		FlextimeStart:    570,
		FlextimeChange:   150,
		FlextimeEnd:      decemberFlextimeEnd[DevEmployeeAdminID],
		VacationTaken:    decimal.NewFromInt(2),
		SickDays:         0,
		OtherAbsenceDays: 0,
		WorkDays:         20,
		DaysWithErrors:   0,
		IsClosed:         true,
	})

	// Regular User Employee - December 2025 (closed)
	values = append(values, DevMonthlyValue{
		ID:               uuid.MustParse(uuidFromInt(5002)),
		EmployeeID:       DevEmployeeUserID,
		Year:             2025,
		Month:            12,
		TotalGrossTime:   10080,
		TotalNetTime:     9540,
		TotalTargetTime:  9600, // 20 days * 8h
		TotalOvertime:    0,
		TotalUndertime:   60,
		TotalBreakTime:   540,
		FlextimeStart:    180,
		FlextimeChange:   -60,
		FlextimeEnd:      decemberFlextimeEnd[DevEmployeeUserID],
		VacationTaken:    decimal.NewFromInt(1),
		SickDays:         1,
		OtherAbsenceDays: 0,
		WorkDays:         20,
		DaysWithErrors:   0,
		IsClosed:         true,
	})

	// Maria Schmidt - December 2025 (closed, part-time 4h/day)
	values = append(values, DevMonthlyValue{
		ID:               uuid.MustParse(uuidFromInt(5004)),
		EmployeeID:       DevEmployeeMariaID,
		Year:             2025,
		Month:            12,
		TotalGrossTime:   4920,
		TotalNetTime:     4920,  // No breaks for <6h shifts
		TotalTargetTime:  4800,  // 20 days * 4h
		TotalOvertime:    120,
		TotalUndertime:   0,
		TotalBreakTime:   0,
		FlextimeStart:    0,
		FlextimeChange:   60,
		FlextimeEnd:      decemberFlextimeEnd[DevEmployeeMariaID],
		VacationTaken:    decimal.NewFromInt(0),
		SickDays:         0,
		OtherAbsenceDays: 0,
		WorkDays:         20,
		DaysWithErrors:   0,
		IsClosed:         true,
	})

	// Thomas Müller - December 2025 (closed, full-time 8h/day)
	values = append(values, DevMonthlyValue{
		ID:               uuid.MustParse(uuidFromInt(5006)),
		EmployeeID:       DevEmployeeThomasID,
		Year:             2025,
		Month:            12,
		TotalGrossTime:   10200,
		TotalNetTime:     9600,
		TotalTargetTime:  9600, // 20 days * 8h
		TotalOvertime:    0,
		TotalUndertime:   0,
		TotalBreakTime:   600,
		FlextimeStart:    240,
		FlextimeChange:   0,
		FlextimeEnd:      decemberFlextimeEnd[DevEmployeeThomasID],
		VacationTaken:    decimal.NewFromInt(3),
		SickDays:         0,
		OtherAbsenceDays: 0,
		WorkDays:         20,
		DaysWithErrors:   0,
		IsClosed:         true,
	})

	// Anna Weber - December 2025 (closed, 7h/day)
	values = append(values, DevMonthlyValue{
		ID:               uuid.MustParse(uuidFromInt(5008)),
		EmployeeID:       DevEmployeeAnnaID,
		Year:             2025,
		Month:            12,
		TotalGrossTime:   9150,
		TotalNetTime:     8550,
		TotalTargetTime:  8400, // 20 days * 7h
		TotalOvertime:    150,
		TotalUndertime:   0,
		TotalBreakTime:   600,
		FlextimeStart:    30,
		FlextimeChange:   150,
		FlextimeEnd:      decemberFlextimeEnd[DevEmployeeAnnaID],
		VacationTaken:    decimal.NewFromInt(1),
		SickDays:         2,
		OtherAbsenceDays: 0,
		WorkDays:         20,
		DaysWithErrors:   0,
		IsClosed:         true,
	})

	return values
}

// computeJanuary2026FromDailyValues aggregates daily values into monthly totals.
// This ensures the monthly values always match the daily values exactly.
func computeJanuary2026FromDailyValues() []DevMonthlyValue {
	dailyValues := generateDevDailyValues()

	// Group daily values by employee
	byEmployee := map[uuid.UUID][]DevDailyValue{}
	for _, dv := range dailyValues {
		byEmployee[dv.EmployeeID] = append(byEmployee[dv.EmployeeID], dv)
	}

	// Ordered list of employees and their monthly value IDs
	employees := []struct {
		id    uuid.UUID
		mvID  int
	}{
		{DevEmployeeAdminID, 5001},
		{DevEmployeeUserID, 5003},
		{DevEmployeeMariaID, 5005},
		{DevEmployeeThomasID, 5007},
		{DevEmployeeAnnaID, 5009},
	}

	var results []DevMonthlyValue

	for _, emp := range employees {
		dvs := byEmployee[emp.id]
		if len(dvs) == 0 {
			continue
		}

		var totalGross, totalNet, totalTarget, totalOT, totalUT, totalBreak int
		var workDays, errDays int

		for _, dv := range dvs {
			totalGross += dv.GrossTime
			totalNet += dv.NetTime
			totalTarget += dv.TargetTime
			totalOT += dv.Overtime
			totalUT += dv.Undertime
			totalBreak += dv.BreakTime
			workDays++
			if dv.HasError {
				errDays++
			}
		}

		flextimeStart := decemberFlextimeEnd[emp.id]
		flextimeChange := totalOT - totalUT
		flextimeEnd := flextimeStart + flextimeChange

		results = append(results, DevMonthlyValue{
			ID:               uuid.MustParse(uuidFromInt(emp.mvID)),
			EmployeeID:       emp.id,
			Year:             2026,
			Month:            1,
			TotalGrossTime:   totalGross,
			TotalNetTime:     totalNet,
			TotalTargetTime:  totalTarget,
			TotalOvertime:    totalOT,
			TotalUndertime:   totalUT,
			TotalBreakTime:   totalBreak,
			FlextimeStart:    flextimeStart,
			FlextimeChange:   flextimeChange,
			FlextimeEnd:      flextimeEnd,
			VacationTaken:    decimal.NewFromInt(0), // No absence days seeded for January
			SickDays:         0,
			OtherAbsenceDays: 0,
			WorkDays:         workDays,
			DaysWithErrors:   errDays,
			IsClosed:         false,
		})
	}

	return results
}

// GetDevMonthlyValues returns all dev monthly values.
func GetDevMonthlyValues() []DevMonthlyValue {
	return generateDevMonthlyValues()
}
