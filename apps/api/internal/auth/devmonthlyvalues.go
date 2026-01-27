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
// January-November 2025 values are generated with realistic data for year overview.
// December 2025 values are historical (hardcoded, closed months).
// January 2026 values are computed from the daily values to ensure consistency.
func generateDevMonthlyValues() []DevMonthlyValue {
	var values []DevMonthlyValue

	// Historical January-November 2025 - generated closed months for year overview
	values = append(values, generate2025JanToNovValues()...)

	// Historical December 2025 - closed months (no daily value backing)
	values = append(values, generateDecember2025Values()...)

	// January 2026 - computed from daily values
	values = append(values, computeJanuary2026FromDailyValues()...)

	return values
}

// monthParams defines per-month parameters for generating monthly values.
type monthParams struct {
	vacation float64
	sick     int
	other    int
	errors   int
	ftChange int // positive = overtime minutes, negative = undertime minutes
}

// empYearConfig defines a full year of monthly data for one employee.
type empYearConfig struct {
	id          uuid.UUID
	dailyTarget int // minutes
	breakPerDay int // minutes (0 for part-time <6h)
	baseID      int // base UUID offset
	months      [11]monthParams
}

// generate2025JanToNovValues creates monthly values for all employees, January to November 2025.
// These provide a full year of historical data for the year overview page.
// December 2025 is generated separately by generateDecember2025Values().
//
// Flextime chains are designed so each employee's November FlextimeEnd matches
// their December FlextimeStart (from decemberFlextimeEnd map):
//
//	Admin:  Jan start=0  → Nov end=570 → Dec start=570 ✓
//	User:   Jan start=0  → Nov end=180 → Dec start=180 ✓
//	Maria:  Jan start=0  → Nov end=0   → Dec start=0   ✓
//	Thomas: Jan start=0  → Nov end=240 → Dec start=240 ✓
//	Anna:   Jan start=0  → Nov end=30  → Dec start=30  ✓
func generate2025JanToNovValues() []DevMonthlyValue {
	// Available workdays per month in 2025 (Mon-Fri minus Bavarian holidays on weekdays).
	// Jan 1 2025 = Wednesday.
	// Holidays on weekdays: Jan 1 (Wed), Jan 6 (Mon), Apr 18 (Fri), Apr 21 (Mon),
	// May 1 (Thu), May 29 (Thu), Jun 9 (Mon), Jun 19 (Thu), Aug 15 (Fri),
	// Oct 3 (Fri), Dec 25 (Thu), Dec 26 (Fri). Nov 1 (Sat) = no impact.
	workDays := [11]int{
		21, // Jan: 23 weekdays - Neujahr (Wed 1st), Heilige Drei Könige (Mon 6th)
		20, // Feb: 20 weekdays
		23, // Mar: 23 weekdays
		20, // Apr: 22 weekdays - Karfreitag (Fri 18th), Ostermontag (Mon 21st)
		20, // May: 22 weekdays - Tag der Arbeit (Thu 1st), Christi Himmelfahrt (Thu 29th)
		19, // Jun: 21 weekdays - Pfingstmontag (Mon 9th), Fronleichnam (Thu 19th)
		23, // Jul: 23 weekdays
		20, // Aug: 21 weekdays - Mariä Himmelfahrt (Fri 15th)
		22, // Sep: 22 weekdays
		22, // Oct: 23 weekdays - Tag der Deutschen Einheit (Fri 3rd)
		21, // Nov: 21 weekdays (Allerheiligen = Sat 1st, no impact)
	}

	configs := []empYearConfig{
		// Admin Employee (40h/week, 8h/day) - consistent overtime builder, year-end push
		// Vacation: 27 of 30 days used (2 Feb, 5 Apr, 3 Jun, 5 Jul, 10 Aug, 2 Nov)
		// Sick: 5 days (2 Mar, 3 Oct)
		{
			id:          DevEmployeeAdminID,
			dailyTarget: 480,
			breakPerDay: 30,
			baseID:      10001,
			months: [11]monthParams{
				{0, 0, 0, 0, 60},  // Jan: clean start, moderate OT
				{2, 0, 0, 0, 45},  // Feb: 2 vacation days
				{0, 2, 0, 1, 30},  // Mar: 2 sick days, 1 error day
				{5, 0, 0, 0, 60},  // Apr: Easter week vacation
				{0, 0, 0, 0, 45},  // May: clean month
				{3, 0, 0, 0, 60},  // Jun: 3 vacation days
				{5, 0, 0, 0, 30},  // Jul: summer vacation start
				{10, 0, 0, 0, 45}, // Aug: main summer vacation
				{0, 0, 0, 1, 60},  // Sep: 1 error day
				{0, 3, 0, 0, 45},  // Oct: autumn illness
				{2, 0, 0, 0, 90},  // Nov: year-end push, 2 vacation
			},
		},
		// Regular User (40h/week, 8h/day) - mixed performance, some undertime months
		// Vacation: 25 of 28 days used (2 Mar, 3 May, 5 Jun, 10 Aug, 3 Sep, 2 Nov)
		// Sick: 6 days (3 Jan, 2 Jul, 1 Dec-existing)
		{
			id:          DevEmployeeUserID,
			dailyTarget: 480,
			breakPerDay: 30,
			baseID:      10101,
			months: [11]monthParams{
				{0, 3, 0, 0, 30},  // Jan: 3 sick days (winter illness)
				{0, 0, 0, 1, -15}, // Feb: 1 error day, slight undertime
				{2, 0, 0, 0, 30},  // Mar: 2 vacation days
				{0, 0, 0, 0, 15},  // Apr: clean month
				{3, 0, 0, 0, 30},  // May: 3 vacation (bridge days)
				{5, 0, 0, 0, -30}, // Jun: 5 vacation, undertime
				{0, 2, 0, 0, 45},  // Jul: 2 sick days
				{10, 0, 0, 1, 15}, // Aug: main summer vacation, 1 error
				{3, 0, 0, 0, 30},  // Sep: 3 vacation days
				{0, 0, 0, 0, 15},  // Oct: clean month
				{2, 0, 0, 0, 15},  // Nov: 2 vacation days
			},
		},
		// Maria Schmidt (20h/week, 4h/day, part-time) - very consistent, minimal flextime
		// Vacation: 12 of 15 days used (2 Apr, 5 Jul, 3 Aug, 2 Oct)
		// Sick: 1 day (Mar)
		// No breaks needed (<6h shifts)
		{
			id:          DevEmployeeMariaID,
			dailyTarget: 240,
			breakPerDay: 0,
			baseID:      10201,
			months: [11]monthParams{
				{0, 0, 0, 0, 15},  // Jan: slight OT
				{0, 0, 0, 0, -15}, // Feb: slight UT
				{0, 1, 0, 0, 15},  // Mar: 1 sick day
				{2, 0, 0, 0, -15}, // Apr: 2 vacation
				{0, 0, 0, 0, 15},  // May: slight OT
				{0, 0, 0, 0, -15}, // Jun: slight UT
				{5, 0, 0, 0, 15},  // Jul: summer vacation
				{3, 0, 0, 0, -15}, // Aug: more vacation
				{0, 0, 0, 0, 15},  // Sep: slight OT
				{2, 0, 0, 0, -15}, // Oct: 2 vacation
				{0, 0, 0, 0, 0},   // Nov: exactly on target
			},
		},
		// Thomas Müller (40h/week, 8h/day) - steady performer, gradual OT accumulation
		// Vacation: 25 of 30 days used (3 Mar, 5 May, 10 Aug, 5 Oct, 2 Nov)
		// Sick: 4 days (3 Feb, 1 Sep)
		{
			id:          DevEmployeeThomasID,
			dailyTarget: 480,
			breakPerDay: 30,
			baseID:      10301,
			months: [11]monthParams{
				{0, 0, 0, 0, 30},  // Jan: steady OT
				{0, 3, 0, 0, 15},  // Feb: 3 sick days (flu)
				{3, 0, 0, 0, 30},  // Mar: 3 vacation
				{0, 0, 0, 0, 15},  // Apr: clean month
				{5, 0, 0, 0, 30},  // May: 5 vacation (bridge days)
				{0, 0, 0, 0, 15},  // Jun: clean month
				{0, 0, 0, 0, 30},  // Jul: clean month
				{10, 0, 0, 0, 15}, // Aug: main summer vacation
				{0, 1, 0, 0, 15},  // Sep: 1 sick day
				{5, 0, 0, 0, 30},  // Oct: autumn vacation
				{2, 0, 0, 1, 15},  // Nov: 2 vacation, 1 error
			},
		},
		// Anna Weber (35h/week, 7h/day) - fluctuating flextime, some UT months
		// Vacation: 25 of 32 days used (3 Apr, 5 Jul, 10 Aug, 5 Sep, 2 Nov)
		// Sick: 5 days (2 Jan, 3 Oct)
		{
			id:          DevEmployeeAnnaID,
			dailyTarget: 420,
			breakPerDay: 30,
			baseID:      10401,
			months: [11]monthParams{
				{0, 2, 0, 0, 15},  // Jan: 2 sick days (winter)
				{0, 0, 0, 0, -30}, // Feb: undertime month
				{0, 0, 0, 0, 15},  // Mar: clean month
				{3, 0, 0, 0, 30},  // Apr: Easter vacation
				{0, 0, 0, 0, -15}, // May: slight UT
				{0, 0, 0, 1, 30},  // Jun: 1 error day
				{5, 0, 0, 0, -15}, // Jul: summer vacation
				{10, 0, 0, 0, 15}, // Aug: main summer vacation
				{5, 0, 0, 0, -30}, // Sep: vacation, undertime
				{0, 3, 0, 0, 15},  // Oct: autumn illness
				{2, 0, 0, 0, 0},   // Nov: 2 vacation, on target
			},
		},
	}

	var values []DevMonthlyValue

	for _, cfg := range configs {
		flextimeStart := 0 // Each employee starts the year at 0

		for m := 0; m < 11; m++ {
			mp := cfg.months[m]
			wd := workDays[m]
			targetTime := wd * cfg.dailyTarget

			overtime := 0
			undertime := 0
			if mp.ftChange >= 0 {
				overtime = mp.ftChange
			} else {
				undertime = -mp.ftChange
			}

			netTime := targetTime + overtime - undertime
			actualWorkDays := wd - int(mp.vacation) - mp.sick - mp.other
			if actualWorkDays < 0 {
				actualWorkDays = 0
			}
			breakTime := cfg.breakPerDay * actualWorkDays
			grossTime := netTime + breakTime
			flextimeEnd := flextimeStart + mp.ftChange

			values = append(values, DevMonthlyValue{
				ID:               uuid.MustParse(uuidFromInt(cfg.baseID + m)),
				EmployeeID:       cfg.id,
				Year:             2025,
				Month:            m + 1,
				TotalGrossTime:   grossTime,
				TotalNetTime:     netTime,
				TotalTargetTime:  targetTime,
				TotalOvertime:    overtime,
				TotalUndertime:   undertime,
				TotalBreakTime:   breakTime,
				FlextimeStart:    flextimeStart,
				FlextimeChange:   mp.ftChange,
				FlextimeEnd:      flextimeEnd,
				VacationTaken:    decimal.NewFromFloat(mp.vacation),
				SickDays:         mp.sick,
				OtherAbsenceDays: mp.other,
				WorkDays:         wd,
				DaysWithErrors:   mp.errors,
				IsClosed:         true,
			})

			flextimeStart = flextimeEnd
		}
	}

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
