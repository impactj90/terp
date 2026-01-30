package auth

import (
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

// DevDailyValue represents a predefined development daily value (calculated daily results).
type DevDailyValue struct {
	ID           uuid.UUID
	EmployeeID   uuid.UUID
	ValueDate    time.Time
	GrossTime    int // Minutes
	NetTime      int // Minutes
	TargetTime   int // Minutes (8h = 480)
	Overtime     int // Minutes
	Undertime    int // Minutes
	BreakTime    int // Minutes
	HasError     bool
	ErrorCodes   pq.StringArray
	Warnings     pq.StringArray
	FirstCome    *int // Minutes from midnight
	LastGo       *int // Minutes from midnight
	BookingCount int
}

// generateDevDailyValues creates daily values for employees in January 2026.
// Values match the booking data with calculated times.
func generateDevDailyValues() []DevDailyValue {
	var values []DevDailyValue

	// Time helpers (minutes)
	toMinutes := func(h, m int) int { return h*60 + m }

	// Admin Employee daily values
	adminEmpID := DevEmployeeAdminID
	targetTime := 480 // 8 hours

	adminDays := []struct {
		date       time.Time
		grossTime  int
		breakTime  int
		firstCome  int
		lastGo     int
		hasError   bool
		errorCodes []string
		warnings   []string
	}{
		// Week 1 (Jan 2-3)
		{time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), 30, toMinutes(8, 0), toMinutes(17, 0), false, nil, nil},
		{time.Date(2026, 1, 3, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), 45, toMinutes(8, 15), toMinutes(17, 15), false, nil, nil},
		// Week 2 (Jan 5-9)
		{time.Date(2026, 1, 5, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), 30, toMinutes(7, 45), toMinutes(16, 45), false, nil, nil},
		{time.Date(2026, 1, 6, 0, 0, 0, 0, time.UTC), toMinutes(9, 30), 30, toMinutes(8, 0), toMinutes(17, 30), false, nil, []string{"HIGH_OVERTIME"}}, // net=540, OT=60min
		{time.Date(2026, 1, 7, 0, 0, 0, 0, time.UTC), toMinutes(8, 30), 30, toMinutes(8, 30), toMinutes(17, 0), false, nil, nil},
		{time.Date(2026, 1, 8, 0, 0, 0, 0, time.UTC), toMinutes(8, 30), 30, toMinutes(8, 0), toMinutes(16, 30), false, nil, nil},
		{time.Date(2026, 1, 9, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), 30, toMinutes(8, 0), toMinutes(17, 0), false, nil, nil},
		// Week 3 (Jan 12-16)
		{time.Date(2026, 1, 12, 0, 0, 0, 0, time.UTC), toMinutes(9, 15), 30, toMinutes(8, 0), toMinutes(17, 15), false, nil, nil},
		{time.Date(2026, 1, 13, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), 30, toMinutes(7, 30), toMinutes(16, 30), false, nil, nil},
		{time.Date(2026, 1, 14, 0, 0, 0, 0, time.UTC), toMinutes(9, 15), 30, toMinutes(8, 15), toMinutes(17, 30), false, nil, nil},
		{time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), 30, toMinutes(8, 0), toMinutes(17, 0), false, nil, nil},
		{time.Date(2026, 1, 16, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), 30, toMinutes(8, 0), toMinutes(16, 0), false, nil, nil}, // Short Friday
		// Week 4 (Jan 19-23)
		{time.Date(2026, 1, 19, 0, 0, 0, 0, time.UTC), toMinutes(10, 0), 30, toMinutes(8, 0), toMinutes(18, 0), false, nil, []string{"APPROACHING_WORK_LIMIT", "HIGH_OVERTIME"}}, // gross=600 (10h), OT=90min
		{time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), 30, toMinutes(8, 0), toMinutes(17, 0), false, nil, nil},
		{time.Date(2026, 1, 21, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), 0, toMinutes(8, 0), toMinutes(17, 0), true, []string{"MISSING_BREAK"}, nil}, // Error day
		{time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), 30, toMinutes(8, 0), toMinutes(17, 0), false, nil, nil},
		{time.Date(2026, 1, 23, 0, 0, 0, 0, time.UTC), toMinutes(8, 30), 30, toMinutes(8, 0), toMinutes(16, 30), false, nil, nil},
	}

	baseID := 3000
	for i, day := range adminDays {
		netTime := day.grossTime - day.breakTime
		overtime := 0
		undertime := 0
		if netTime > targetTime {
			overtime = netTime - targetTime
		} else if netTime < targetTime {
			undertime = targetTime - netTime
		}

		bookingCount := 4 // clock in, out, break start, end
		if day.breakTime == 0 {
			bookingCount = 2 // only clock in, out
		}

		values = append(values, DevDailyValue{
			ID:           uuid.MustParse(uuidFromInt(baseID + i)),
			EmployeeID:   adminEmpID,
			ValueDate:    day.date,
			GrossTime:    day.grossTime,
			NetTime:      netTime,
			TargetTime:   targetTime,
			Overtime:     overtime,
			Undertime:    undertime,
			BreakTime:    day.breakTime,
			HasError:     day.hasError,
			ErrorCodes:   day.errorCodes,
			Warnings:     day.warnings,
			FirstCome:    intPtr(day.firstCome),
			LastGo:       intPtr(day.lastGo),
			BookingCount: bookingCount,
		})
	}

	// Regular User Employee daily values
	userEmpID := DevEmployeeUserID

	userDays := []struct {
		date       time.Time
		grossTime  int
		breakTime  int
		firstCome  int
		lastGo     int
		hasError   bool
		errorCodes []string
		warnings   []string
	}{
		// Week 1
		{time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), 30, toMinutes(9, 0), toMinutes(18, 0), false, nil, nil},
		{time.Date(2026, 1, 3, 0, 0, 0, 0, time.UTC), toMinutes(8, 30), 30, toMinutes(9, 15), toMinutes(17, 45), false, nil, nil},
		// Week 2
		{time.Date(2026, 1, 5, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), 30, toMinutes(8, 45), toMinutes(17, 45), false, nil, nil},
		{time.Date(2026, 1, 6, 0, 0, 0, 0, time.UTC), toMinutes(9, 30), 45, toMinutes(9, 0), toMinutes(18, 30), false, nil, nil}, // gross=570, but OT only 45min
		{time.Date(2026, 1, 7, 0, 0, 0, 0, time.UTC), toMinutes(8, 30), 30, toMinutes(9, 0), toMinutes(17, 30), false, nil, nil},
		{time.Date(2026, 1, 8, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), 30, toMinutes(9, 0), toMinutes(17, 0), false, nil, nil},
		{time.Date(2026, 1, 9, 0, 0, 0, 0, time.UTC), toMinutes(8, 30), 30, toMinutes(9, 0), toMinutes(17, 30), false, nil, nil},
		// Week 3
		{time.Date(2026, 1, 12, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), 30, toMinutes(9, 0), toMinutes(18, 0), false, nil, nil},
		{time.Date(2026, 1, 13, 0, 0, 0, 0, time.UTC), 0, 0, toMinutes(9, 0), 0, true, []string{"MISSING_CLOCK_OUT"}, nil}, // Error day - missing clock out
		{time.Date(2026, 1, 14, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), 30, toMinutes(9, 0), toMinutes(18, 0), false, nil, nil},
		{time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC), toMinutes(8, 30), 30, toMinutes(9, 0), toMinutes(17, 30), false, nil, nil},
		{time.Date(2026, 1, 16, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), 30, toMinutes(9, 0), toMinutes(16, 30), false, nil, nil},
		// Week 4
		{time.Date(2026, 1, 19, 0, 0, 0, 0, time.UTC), toMinutes(9, 30), 30, toMinutes(9, 0), toMinutes(18, 30), false, nil, []string{"HIGH_OVERTIME"}}, // net=540, OT=60min
		{time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC), toMinutes(8, 30), 30, toMinutes(9, 0), toMinutes(17, 30), false, nil, nil},
		{time.Date(2026, 1, 21, 0, 0, 0, 0, time.UTC), toMinutes(8, 30), 30, toMinutes(9, 0), toMinutes(17, 30), false, nil, nil},
		{time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC), toMinutes(8, 30), 30, toMinutes(9, 0), toMinutes(17, 30), false, nil, nil},
		{time.Date(2026, 1, 23, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), 30, toMinutes(9, 0), toMinutes(17, 0), false, nil, nil},
	}

	baseID = 4000
	for i, day := range userDays {
		netTime := day.grossTime - day.breakTime
		overtime := 0
		undertime := 0
		if netTime > targetTime {
			overtime = netTime - targetTime
		} else if netTime < targetTime && !day.hasError {
			undertime = targetTime - netTime
		}

		bookingCount := 4
		if day.breakTime == 0 {
			bookingCount = 2
		}
		if day.hasError && day.lastGo == 0 {
			bookingCount = 1 // Only clock in for missing clock out error
		}

		lastGoPtr := intPtr(day.lastGo)
		if day.lastGo == 0 {
			lastGoPtr = nil
		}

		values = append(values, DevDailyValue{
			ID:           uuid.MustParse(uuidFromInt(baseID + i)),
			EmployeeID:   userEmpID,
			ValueDate:    day.date,
			GrossTime:    day.grossTime,
			NetTime:      netTime,
			TargetTime:   targetTime,
			Overtime:     overtime,
			Undertime:    undertime,
			BreakTime:    day.breakTime,
			HasError:     day.hasError,
			ErrorCodes:   day.errorCodes,
			Warnings:     day.warnings,
			FirstCome:    intPtr(day.firstCome),
			LastGo:       lastGoPtr,
			BookingCount: bookingCount,
		})
	}

	// Maria Schmidt (part-time 20h/week, 4h/day target)
	mariaEmpID := DevEmployeeMariaID
	mariaTarget := 240 // 4 hours

	mariaDays := []struct {
		date      time.Time
		grossTime int
		breakTime int
		firstCome int
		lastGo    int
	}{
		// Week 1
		{time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC), toMinutes(4, 0), 0, toMinutes(9, 0), toMinutes(13, 0)},
		{time.Date(2026, 1, 3, 0, 0, 0, 0, time.UTC), toMinutes(4, 15), 0, toMinutes(9, 0), toMinutes(13, 15)},
		// Week 2
		{time.Date(2026, 1, 5, 0, 0, 0, 0, time.UTC), toMinutes(4, 0), 0, toMinutes(8, 45), toMinutes(12, 45)},
		{time.Date(2026, 1, 6, 0, 0, 0, 0, time.UTC), toMinutes(4, 0), 0, toMinutes(9, 0), toMinutes(13, 0)},
		{time.Date(2026, 1, 7, 0, 0, 0, 0, time.UTC), toMinutes(4, 0), 0, toMinutes(9, 15), toMinutes(13, 15)},
		{time.Date(2026, 1, 8, 0, 0, 0, 0, time.UTC), toMinutes(3, 45), 0, toMinutes(9, 0), toMinutes(12, 45)},
		{time.Date(2026, 1, 9, 0, 0, 0, 0, time.UTC), toMinutes(4, 0), 0, toMinutes(9, 0), toMinutes(13, 0)},
		// Week 3
		{time.Date(2026, 1, 12, 0, 0, 0, 0, time.UTC), toMinutes(4, 15), 0, toMinutes(8, 45), toMinutes(13, 0)},
		{time.Date(2026, 1, 13, 0, 0, 0, 0, time.UTC), toMinutes(4, 0), 0, toMinutes(9, 0), toMinutes(13, 0)},
		{time.Date(2026, 1, 14, 0, 0, 0, 0, time.UTC), toMinutes(4, 30), 0, toMinutes(9, 0), toMinutes(13, 30)},
		{time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC), toMinutes(4, 0), 0, toMinutes(9, 0), toMinutes(13, 0)},
		{time.Date(2026, 1, 16, 0, 0, 0, 0, time.UTC), toMinutes(3, 30), 0, toMinutes(9, 0), toMinutes(12, 30)}, // Short Friday
		// Week 4
		{time.Date(2026, 1, 19, 0, 0, 0, 0, time.UTC), toMinutes(4, 15), 0, toMinutes(9, 0), toMinutes(13, 15)},
		{time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC), toMinutes(4, 0), 0, toMinutes(9, 0), toMinutes(13, 0)},
		{time.Date(2026, 1, 21, 0, 0, 0, 0, time.UTC), toMinutes(4, 0), 0, toMinutes(9, 0), toMinutes(13, 0)},
		{time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC), toMinutes(4, 0), 0, toMinutes(9, 0), toMinutes(13, 0)},
		{time.Date(2026, 1, 23, 0, 0, 0, 0, time.UTC), toMinutes(4, 0), 0, toMinutes(9, 0), toMinutes(13, 0)},
	}

	baseID = 6500
	for i, day := range mariaDays {
		netTime := day.grossTime - day.breakTime
		overtime := 0
		undertime := 0
		if netTime > mariaTarget {
			overtime = netTime - mariaTarget
		} else if netTime < mariaTarget {
			undertime = mariaTarget - netTime
		}

		values = append(values, DevDailyValue{
			ID:           uuid.MustParse(uuidFromInt(baseID + i)),
			EmployeeID:   mariaEmpID,
			ValueDate:    day.date,
			GrossTime:    day.grossTime,
			NetTime:      netTime,
			TargetTime:   mariaTarget,
			Overtime:     overtime,
			Undertime:    undertime,
			BreakTime:    day.breakTime,
			HasError:     false,
			FirstCome:    intPtr(day.firstCome),
			LastGo:       intPtr(day.lastGo),
			BookingCount: 2, // Only clock in/out, no breaks
		})
	}

	// Thomas Müller (full-time 40h/week, 8h/day target, early starter)
	thomasEmpID := DevEmployeeThomasID

	thomasDays := []struct {
		date      time.Time
		grossTime int
		breakTime int
		firstCome int
		lastGo    int
		warnings  []string
	}{
		// Week 1
		{time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC), toMinutes(8, 30), 30, toMinutes(7, 30), toMinutes(16, 0), nil},
		{time.Date(2026, 1, 3, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), 30, toMinutes(7, 30), toMinutes(16, 30), nil},
		// Week 2
		{time.Date(2026, 1, 5, 0, 0, 0, 0, time.UTC), toMinutes(8, 45), 30, toMinutes(7, 15), toMinutes(16, 0), nil},
		{time.Date(2026, 1, 6, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), 30, toMinutes(7, 30), toMinutes(16, 30), nil},
		{time.Date(2026, 1, 7, 0, 0, 0, 0, time.UTC), toMinutes(8, 30), 30, toMinutes(7, 45), toMinutes(16, 15), nil},
		{time.Date(2026, 1, 8, 0, 0, 0, 0, time.UTC), toMinutes(8, 30), 30, toMinutes(7, 30), toMinutes(16, 0), nil},
		{time.Date(2026, 1, 9, 0, 0, 0, 0, time.UTC), toMinutes(8, 45), 30, toMinutes(7, 30), toMinutes(16, 15), nil},
		// Week 3
		{time.Date(2026, 1, 12, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), 30, toMinutes(7, 30), toMinutes(16, 30), nil},
		{time.Date(2026, 1, 13, 0, 0, 0, 0, time.UTC), toMinutes(8, 30), 30, toMinutes(7, 30), toMinutes(16, 0), nil},
		{time.Date(2026, 1, 14, 0, 0, 0, 0, time.UTC), toMinutes(8, 30), 30, toMinutes(7, 30), toMinutes(16, 0), nil},
		{time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), 30, toMinutes(7, 30), toMinutes(16, 30), nil},
		{time.Date(2026, 1, 16, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), 30, toMinutes(7, 30), toMinutes(15, 30), nil}, // Short Friday
		// Week 4
		{time.Date(2026, 1, 19, 0, 0, 0, 0, time.UTC), toMinutes(9, 30), 30, toMinutes(7, 30), toMinutes(17, 0), []string{"HIGH_OVERTIME"}}, // net=540, OT=60min
		{time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC), toMinutes(8, 30), 30, toMinutes(7, 30), toMinutes(16, 0), nil},
		{time.Date(2026, 1, 21, 0, 0, 0, 0, time.UTC), toMinutes(8, 45), 30, toMinutes(7, 30), toMinutes(16, 15), nil},
		{time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC), toMinutes(8, 30), 30, toMinutes(7, 30), toMinutes(16, 0), nil},
		{time.Date(2026, 1, 23, 0, 0, 0, 0, time.UTC), toMinutes(8, 15), 30, toMinutes(7, 30), toMinutes(15, 45), nil},
	}

	baseID = 7500
	for i, day := range thomasDays {
		netTime := day.grossTime - day.breakTime
		overtime := 0
		undertime := 0
		if netTime > targetTime {
			overtime = netTime - targetTime
		} else if netTime < targetTime {
			undertime = targetTime - netTime
		}

		values = append(values, DevDailyValue{
			ID:           uuid.MustParse(uuidFromInt(baseID + i)),
			EmployeeID:   thomasEmpID,
			ValueDate:    day.date,
			GrossTime:    day.grossTime,
			NetTime:      netTime,
			TargetTime:   targetTime,
			Overtime:     overtime,
			Undertime:    undertime,
			BreakTime:    day.breakTime,
			HasError:     false,
			Warnings:     day.warnings,
			FirstCome:    intPtr(day.firstCome),
			LastGo:       intPtr(day.lastGo),
			BookingCount: 4,
		})
	}

	// Anna Weber (35h/week, 7h/day target)
	annaEmpID := DevEmployeeAnnaID
	annaTarget := 420 // 7 hours

	annaDays := []struct {
		date      time.Time
		grossTime int
		breakTime int
		firstCome int
		lastGo    int
	}{
		// Week 1
		{time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), 30, toMinutes(8, 0), toMinutes(15, 30)},
		{time.Date(2026, 1, 3, 0, 0, 0, 0, time.UTC), toMinutes(7, 45), 30, toMinutes(8, 0), toMinutes(15, 45)},
		// Week 2
		{time.Date(2026, 1, 5, 0, 0, 0, 0, time.UTC), toMinutes(7, 45), 30, toMinutes(7, 45), toMinutes(15, 30)},
		{time.Date(2026, 1, 6, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), 30, toMinutes(8, 0), toMinutes(15, 30)},
		{time.Date(2026, 1, 7, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), 30, toMinutes(8, 0), toMinutes(15, 30)},
		{time.Date(2026, 1, 8, 0, 0, 0, 0, time.UTC), toMinutes(7, 15), 30, toMinutes(8, 15), toMinutes(15, 30)},
		{time.Date(2026, 1, 9, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), 30, toMinutes(8, 0), toMinutes(15, 30)},
		// Week 3
		{time.Date(2026, 1, 12, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), 30, toMinutes(8, 0), toMinutes(16, 0)},
		{time.Date(2026, 1, 13, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), 30, toMinutes(8, 0), toMinutes(15, 30)},
		{time.Date(2026, 1, 14, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), 30, toMinutes(8, 0), toMinutes(15, 30)},
		{time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), 30, toMinutes(8, 0), toMinutes(15, 30)},
		{time.Date(2026, 1, 16, 0, 0, 0, 0, time.UTC), toMinutes(7, 0), 30, toMinutes(8, 0), toMinutes(15, 0)}, // Short Friday
		// Week 4
		{time.Date(2026, 1, 19, 0, 0, 0, 0, time.UTC), toMinutes(7, 45), 30, toMinutes(8, 0), toMinutes(15, 45)},
		{time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), 30, toMinutes(8, 0), toMinutes(15, 30)},
		{time.Date(2026, 1, 21, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), 30, toMinutes(8, 0), toMinutes(15, 30)},
		{time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC), toMinutes(7, 45), 30, toMinutes(8, 0), toMinutes(15, 45)},
		{time.Date(2026, 1, 23, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), 30, toMinutes(8, 0), toMinutes(15, 30)},
	}

	baseID = 8500
	for i, day := range annaDays {
		netTime := day.grossTime - day.breakTime
		overtime := 0
		undertime := 0
		if netTime > annaTarget {
			overtime = netTime - annaTarget
		} else if netTime < annaTarget {
			undertime = annaTarget - netTime
		}

		values = append(values, DevDailyValue{
			ID:           uuid.MustParse(uuidFromInt(baseID + i)),
			EmployeeID:   annaEmpID,
			ValueDate:    day.date,
			GrossTime:    day.grossTime,
			NetTime:      netTime,
			TargetTime:   annaTarget,
			Overtime:     overtime,
			Undertime:    undertime,
			BreakTime:    day.breakTime,
			HasError:     false,
			FirstCome:    intPtr(day.firstCome),
			LastGo:       intPtr(day.lastGo),
			BookingCount: 4,
		})
	}

	return values
}

// GetDevDailyValues returns all dev daily values.
func GetDevDailyValues() []DevDailyValue {
	return generateDevDailyValues()
}
