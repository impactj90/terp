package auth

import (
	"time"

	"github.com/google/uuid"
)

// DevBooking represents a predefined development booking (clock in/out entry).
type DevBooking struct {
	ID            uuid.UUID
	EmployeeID    uuid.UUID
	BookingTypeID uuid.UUID
	BookingDate   time.Time
	OriginalTime  int // Minutes from midnight
	EditedTime    int // Minutes from midnight
	Source        string
	PairID        *uuid.UUID
}

// Booking Type IDs from devbookingtypes.go
var (
	BookingTypeClockIn    = uuid.MustParse("00000000-0000-0000-0000-000000000201") // A1 Kommen
	BookingTypeClockOut   = uuid.MustParse("00000000-0000-0000-0000-000000000202") // A2 Gehen
	BookingTypeBreakStart = uuid.MustParse("00000000-0000-0000-0000-000000000203") // P1 Pause Beginn
	BookingTypeBreakEnd   = uuid.MustParse("00000000-0000-0000-0000-000000000204") // P2 Pause Ende
)

// Helper function to create a pair ID
func pairID(id string) *uuid.UUID {
	u := uuid.MustParse(id)
	return &u
}

// generateDevBookings creates bookings for employees in January 2026.
// This generates realistic time tracking data with variations.
func generateDevBookings() []DevBooking {
	var bookings []DevBooking

	// Time helpers (minutes from midnight)
	toMinutes := func(h, m int) int { return h*60 + m }

	// January 2026 workdays (Mon-Fri)
	// Week 1: Jan 1 (Wed) is holiday, Jan 2-3 (Thu-Fri)
	// Week 2: Jan 5-9 (Mon-Fri)
	// Week 3: Jan 12-16 (Mon-Fri)
	// Week 4: Jan 19-23 (Mon-Fri)

	// Admin Employee (00000000-0000-0000-0000-000000000011) - Full time, regular hours
	adminEmpID := DevEmployeeAdminID

	// Generate workdays for Admin in January 2026
	adminWorkDays := []struct {
		date       time.Time
		comeTime   int
		goTime     int
		breakStart int
		breakEnd   int
		hasError   bool
	}{
		// Week 1 (Jan 2-3 - Jan 1 is holiday)
		{time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(17, 0), toMinutes(12, 0), toMinutes(12, 30), false},
		{time.Date(2026, 1, 3, 0, 0, 0, 0, time.UTC), toMinutes(8, 15), toMinutes(17, 15), toMinutes(12, 0), toMinutes(12, 45), false},
		// Week 2 (Jan 5-9)
		{time.Date(2026, 1, 5, 0, 0, 0, 0, time.UTC), toMinutes(7, 45), toMinutes(16, 45), toMinutes(12, 0), toMinutes(12, 30), false},
		{time.Date(2026, 1, 6, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(17, 30), toMinutes(12, 15), toMinutes(12, 45), false},
		{time.Date(2026, 1, 7, 0, 0, 0, 0, time.UTC), toMinutes(8, 30), toMinutes(17, 0), toMinutes(12, 0), toMinutes(12, 30), false},
		{time.Date(2026, 1, 8, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(16, 30), toMinutes(12, 0), toMinutes(12, 30), false},
		{time.Date(2026, 1, 9, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(17, 0), toMinutes(12, 0), toMinutes(12, 30), false},
		// Week 3 (Jan 12-16)
		{time.Date(2026, 1, 12, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(17, 15), toMinutes(12, 0), toMinutes(12, 30), false},
		{time.Date(2026, 1, 13, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), toMinutes(16, 30), toMinutes(12, 0), toMinutes(12, 30), false},
		{time.Date(2026, 1, 14, 0, 0, 0, 0, time.UTC), toMinutes(8, 15), toMinutes(17, 30), toMinutes(12, 15), toMinutes(12, 45), false},
		{time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(17, 0), toMinutes(12, 0), toMinutes(12, 30), false},
		{time.Date(2026, 1, 16, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(16, 0), toMinutes(12, 0), toMinutes(12, 30), false}, // Short Friday
		// Week 4 (Jan 19-23)
		{time.Date(2026, 1, 19, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(18, 0), toMinutes(12, 0), toMinutes(12, 30), false}, // Long day
		{time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(17, 0), toMinutes(12, 0), toMinutes(12, 30), false},
		{time.Date(2026, 1, 21, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(17, 0), 0, 0, true}, // Missing break - ERROR
		{time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(17, 0), toMinutes(12, 0), toMinutes(12, 30), false},
		{time.Date(2026, 1, 23, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(16, 30), toMinutes(12, 0), toMinutes(12, 30), false},
	}

	baseID := 1000
	for i, day := range adminWorkDays {
		comePairID := pairID(uuidFromInt(baseID + i*10))
		breakPairID := pairID(uuidFromInt(baseID + i*10 + 1))

		// Clock in
		bookings = append(bookings, DevBooking{
			ID:            uuid.MustParse(uuidFromInt(baseID + i*10 + 2)),
			EmployeeID:    adminEmpID,
			BookingTypeID: BookingTypeClockIn,
			BookingDate:   day.date,
			OriginalTime:  day.comeTime,
			EditedTime:    day.comeTime,
			Source:        "terminal",
			PairID:        comePairID,
		})
		// Clock out
		bookings = append(bookings, DevBooking{
			ID:            uuid.MustParse(uuidFromInt(baseID + i*10 + 3)),
			EmployeeID:    adminEmpID,
			BookingTypeID: BookingTypeClockOut,
			BookingDate:   day.date,
			OriginalTime:  day.goTime,
			EditedTime:    day.goTime,
			Source:        "terminal",
			PairID:        comePairID,
		})

		// Break (if not error day)
		if day.breakStart > 0 && day.breakEnd > 0 {
			bookings = append(bookings, DevBooking{
				ID:            uuid.MustParse(uuidFromInt(baseID + i*10 + 4)),
				EmployeeID:    adminEmpID,
				BookingTypeID: BookingTypeBreakStart,
				BookingDate:   day.date,
				OriginalTime:  day.breakStart,
				EditedTime:    day.breakStart,
				Source:        "terminal",
				PairID:        breakPairID,
			})
			bookings = append(bookings, DevBooking{
				ID:            uuid.MustParse(uuidFromInt(baseID + i*10 + 5)),
				EmployeeID:    adminEmpID,
				BookingTypeID: BookingTypeBreakEnd,
				BookingDate:   day.date,
				OriginalTime:  day.breakEnd,
				EditedTime:    day.breakEnd,
				Source:        "terminal",
				PairID:        breakPairID,
			})
		}
	}

	// Regular User Employee (00000000-0000-0000-0000-000000000012) - Full time with some variation
	userEmpID := DevEmployeeUserID

	userWorkDays := []struct {
		date       time.Time
		comeTime   int
		goTime     int
		breakStart int
		breakEnd   int
		hasError   bool
	}{
		// Week 1
		{time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(18, 0), toMinutes(12, 30), toMinutes(13, 0), false},
		{time.Date(2026, 1, 3, 0, 0, 0, 0, time.UTC), toMinutes(9, 15), toMinutes(17, 45), toMinutes(12, 30), toMinutes(13, 0), false},
		// Week 2
		{time.Date(2026, 1, 5, 0, 0, 0, 0, time.UTC), toMinutes(8, 45), toMinutes(17, 45), toMinutes(12, 30), toMinutes(13, 0), false},
		{time.Date(2026, 1, 6, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(18, 30), toMinutes(12, 30), toMinutes(13, 15), false},
		{time.Date(2026, 1, 7, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(17, 30), toMinutes(12, 30), toMinutes(13, 0), false},
		{time.Date(2026, 1, 8, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(17, 0), toMinutes(12, 30), toMinutes(13, 0), false},
		{time.Date(2026, 1, 9, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(17, 30), toMinutes(12, 30), toMinutes(13, 0), false},
		// Week 3
		{time.Date(2026, 1, 12, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(18, 0), toMinutes(12, 30), toMinutes(13, 0), false},
		{time.Date(2026, 1, 13, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), 0, 0, 0, true}, // Missing clock out - ERROR
		{time.Date(2026, 1, 14, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(18, 0), toMinutes(12, 30), toMinutes(13, 0), false},
		{time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(17, 30), toMinutes(12, 30), toMinutes(13, 0), false},
		{time.Date(2026, 1, 16, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(16, 30), toMinutes(12, 30), toMinutes(13, 0), false},
		// Week 4
		{time.Date(2026, 1, 19, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(18, 30), toMinutes(12, 30), toMinutes(13, 0), false},
		{time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(17, 30), toMinutes(12, 30), toMinutes(13, 0), false},
		{time.Date(2026, 1, 21, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(17, 30), toMinutes(12, 30), toMinutes(13, 0), false},
		{time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(17, 30), toMinutes(12, 30), toMinutes(13, 0), false},
		{time.Date(2026, 1, 23, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(17, 0), toMinutes(12, 30), toMinutes(13, 0), false},
	}

	baseID = 2000
	for i, day := range userWorkDays {
		comePairID := pairID(uuidFromInt(baseID + i*10))
		breakPairID := pairID(uuidFromInt(baseID + i*10 + 1))

		// Clock in
		bookings = append(bookings, DevBooking{
			ID:            uuid.MustParse(uuidFromInt(baseID + i*10 + 2)),
			EmployeeID:    userEmpID,
			BookingTypeID: BookingTypeClockIn,
			BookingDate:   day.date,
			OriginalTime:  day.comeTime,
			EditedTime:    day.comeTime,
			Source:        "web",
			PairID:        comePairID,
		})

		// Clock out (if not error day with missing clock out)
		if day.goTime > 0 {
			bookings = append(bookings, DevBooking{
				ID:            uuid.MustParse(uuidFromInt(baseID + i*10 + 3)),
				EmployeeID:    userEmpID,
				BookingTypeID: BookingTypeClockOut,
				BookingDate:   day.date,
				OriginalTime:  day.goTime,
				EditedTime:    day.goTime,
				Source:        "web",
				PairID:        comePairID,
			})
		}

		// Break (if present)
		if day.breakStart > 0 && day.breakEnd > 0 {
			bookings = append(bookings, DevBooking{
				ID:            uuid.MustParse(uuidFromInt(baseID + i*10 + 4)),
				EmployeeID:    userEmpID,
				BookingTypeID: BookingTypeBreakStart,
				BookingDate:   day.date,
				OriginalTime:  day.breakStart,
				EditedTime:    day.breakStart,
				Source:        "web",
				PairID:        breakPairID,
			})
			bookings = append(bookings, DevBooking{
				ID:            uuid.MustParse(uuidFromInt(baseID + i*10 + 5)),
				EmployeeID:    userEmpID,
				BookingTypeID: BookingTypeBreakEnd,
				BookingDate:   day.date,
				OriginalTime:  day.breakEnd,
				EditedTime:    day.breakEnd,
				Source:        "web",
				PairID:        breakPairID,
			})
		}
	}

	// Maria Schmidt (part-time 20h/week, 4h/day, no break needed for <6h shift)
	mariaEmpID := DevEmployeeMariaID

	mariaWorkDays := []struct {
		date     time.Time
		comeTime int
		goTime   int
	}{
		// Week 1
		{time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(13, 0)},
		{time.Date(2026, 1, 3, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(13, 15)},
		// Week 2
		{time.Date(2026, 1, 5, 0, 0, 0, 0, time.UTC), toMinutes(8, 45), toMinutes(12, 45)},
		{time.Date(2026, 1, 6, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(13, 0)},
		{time.Date(2026, 1, 7, 0, 0, 0, 0, time.UTC), toMinutes(9, 15), toMinutes(13, 15)},
		{time.Date(2026, 1, 8, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(12, 45)},
		{time.Date(2026, 1, 9, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(13, 0)},
		// Week 3
		{time.Date(2026, 1, 12, 0, 0, 0, 0, time.UTC), toMinutes(8, 45), toMinutes(13, 0)},
		{time.Date(2026, 1, 13, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(13, 0)},
		{time.Date(2026, 1, 14, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(13, 30)},
		{time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(13, 0)},
		{time.Date(2026, 1, 16, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(12, 30)}, // Short Friday
		// Week 4
		{time.Date(2026, 1, 19, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(13, 15)},
		{time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(13, 0)},
		{time.Date(2026, 1, 21, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(13, 0)},
		{time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(13, 0)},
		{time.Date(2026, 1, 23, 0, 0, 0, 0, time.UTC), toMinutes(9, 0), toMinutes(13, 0)},
	}

	baseID = 6000
	for i, day := range mariaWorkDays {
		comePairID := pairID(uuidFromInt(baseID + i*10))

		bookings = append(bookings, DevBooking{
			ID:            uuid.MustParse(uuidFromInt(baseID + i*10 + 2)),
			EmployeeID:    mariaEmpID,
			BookingTypeID: BookingTypeClockIn,
			BookingDate:   day.date,
			OriginalTime:  day.comeTime,
			EditedTime:    day.comeTime,
			Source:        "terminal",
			PairID:        comePairID,
		})
		bookings = append(bookings, DevBooking{
			ID:            uuid.MustParse(uuidFromInt(baseID + i*10 + 3)),
			EmployeeID:    mariaEmpID,
			BookingTypeID: BookingTypeClockOut,
			BookingDate:   day.date,
			OriginalTime:  day.goTime,
			EditedTime:    day.goTime,
			Source:        "terminal",
			PairID:        comePairID,
		})
	}

	// Thomas Müller (full-time 40h/week, 8h/day, early starter)
	thomasEmpID := DevEmployeeThomasID

	thomasWorkDays := []struct {
		date       time.Time
		comeTime   int
		goTime     int
		breakStart int
		breakEnd   int
	}{
		// Week 1
		{time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), toMinutes(16, 0), toMinutes(12, 0), toMinutes(12, 30)},
		{time.Date(2026, 1, 3, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), toMinutes(16, 30), toMinutes(12, 0), toMinutes(12, 30)},
		// Week 2
		{time.Date(2026, 1, 5, 0, 0, 0, 0, time.UTC), toMinutes(7, 15), toMinutes(16, 0), toMinutes(12, 0), toMinutes(12, 30)},
		{time.Date(2026, 1, 6, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), toMinutes(16, 30), toMinutes(12, 0), toMinutes(12, 30)},
		{time.Date(2026, 1, 7, 0, 0, 0, 0, time.UTC), toMinutes(7, 45), toMinutes(16, 15), toMinutes(12, 0), toMinutes(12, 30)},
		{time.Date(2026, 1, 8, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), toMinutes(16, 0), toMinutes(12, 0), toMinutes(12, 30)},
		{time.Date(2026, 1, 9, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), toMinutes(16, 15), toMinutes(12, 0), toMinutes(12, 30)},
		// Week 3
		{time.Date(2026, 1, 12, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), toMinutes(16, 30), toMinutes(12, 0), toMinutes(12, 30)},
		{time.Date(2026, 1, 13, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), toMinutes(16, 0), toMinutes(12, 0), toMinutes(12, 30)},
		{time.Date(2026, 1, 14, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), toMinutes(16, 0), toMinutes(12, 0), toMinutes(12, 30)},
		{time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), toMinutes(16, 30), toMinutes(12, 0), toMinutes(12, 30)},
		{time.Date(2026, 1, 16, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), toMinutes(15, 30), toMinutes(12, 0), toMinutes(12, 30)}, // Short Friday
		// Week 4
		{time.Date(2026, 1, 19, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), toMinutes(17, 0), toMinutes(12, 0), toMinutes(12, 30)}, // Long day
		{time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), toMinutes(16, 0), toMinutes(12, 0), toMinutes(12, 30)},
		{time.Date(2026, 1, 21, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), toMinutes(16, 15), toMinutes(12, 0), toMinutes(12, 30)},
		{time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), toMinutes(16, 0), toMinutes(12, 0), toMinutes(12, 30)},
		{time.Date(2026, 1, 23, 0, 0, 0, 0, time.UTC), toMinutes(7, 30), toMinutes(15, 45), toMinutes(12, 0), toMinutes(12, 30)},
	}

	baseID = 7000
	for i, day := range thomasWorkDays {
		comePairID := pairID(uuidFromInt(baseID + i*10))
		breakPairID := pairID(uuidFromInt(baseID + i*10 + 1))

		bookings = append(bookings, DevBooking{
			ID:            uuid.MustParse(uuidFromInt(baseID + i*10 + 2)),
			EmployeeID:    thomasEmpID,
			BookingTypeID: BookingTypeClockIn,
			BookingDate:   day.date,
			OriginalTime:  day.comeTime,
			EditedTime:    day.comeTime,
			Source:        "terminal",
			PairID:        comePairID,
		})
		bookings = append(bookings, DevBooking{
			ID:            uuid.MustParse(uuidFromInt(baseID + i*10 + 3)),
			EmployeeID:    thomasEmpID,
			BookingTypeID: BookingTypeClockOut,
			BookingDate:   day.date,
			OriginalTime:  day.goTime,
			EditedTime:    day.goTime,
			Source:        "terminal",
			PairID:        comePairID,
		})
		bookings = append(bookings, DevBooking{
			ID:            uuid.MustParse(uuidFromInt(baseID + i*10 + 4)),
			EmployeeID:    thomasEmpID,
			BookingTypeID: BookingTypeBreakStart,
			BookingDate:   day.date,
			OriginalTime:  day.breakStart,
			EditedTime:    day.breakStart,
			Source:        "terminal",
			PairID:        breakPairID,
		})
		bookings = append(bookings, DevBooking{
			ID:            uuid.MustParse(uuidFromInt(baseID + i*10 + 5)),
			EmployeeID:    thomasEmpID,
			BookingTypeID: BookingTypeBreakEnd,
			BookingDate:   day.date,
			OriginalTime:  day.breakEnd,
			EditedTime:    day.breakEnd,
			Source:        "terminal",
			PairID:        breakPairID,
		})
	}

	// Anna Weber (35h/week, 7h/day)
	annaEmpID := DevEmployeeAnnaID

	annaWorkDays := []struct {
		date       time.Time
		comeTime   int
		goTime     int
		breakStart int
		breakEnd   int
	}{
		// Week 1
		{time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(15, 30), toMinutes(12, 0), toMinutes(12, 30)},
		{time.Date(2026, 1, 3, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(15, 45), toMinutes(12, 0), toMinutes(12, 30)},
		// Week 2
		{time.Date(2026, 1, 5, 0, 0, 0, 0, time.UTC), toMinutes(7, 45), toMinutes(15, 30), toMinutes(12, 0), toMinutes(12, 30)},
		{time.Date(2026, 1, 6, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(15, 30), toMinutes(12, 0), toMinutes(12, 30)},
		{time.Date(2026, 1, 7, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(15, 30), toMinutes(12, 0), toMinutes(12, 30)},
		{time.Date(2026, 1, 8, 0, 0, 0, 0, time.UTC), toMinutes(8, 15), toMinutes(15, 30), toMinutes(12, 0), toMinutes(12, 30)},
		{time.Date(2026, 1, 9, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(15, 30), toMinutes(12, 0), toMinutes(12, 30)},
		// Week 3
		{time.Date(2026, 1, 12, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(16, 0), toMinutes(12, 0), toMinutes(12, 30)},
		{time.Date(2026, 1, 13, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(15, 30), toMinutes(12, 0), toMinutes(12, 30)},
		{time.Date(2026, 1, 14, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(15, 30), toMinutes(12, 0), toMinutes(12, 30)},
		{time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(15, 30), toMinutes(12, 0), toMinutes(12, 30)},
		{time.Date(2026, 1, 16, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(15, 0), toMinutes(12, 0), toMinutes(12, 30)}, // Short Friday
		// Week 4
		{time.Date(2026, 1, 19, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(15, 45), toMinutes(12, 0), toMinutes(12, 30)},
		{time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(15, 30), toMinutes(12, 0), toMinutes(12, 30)},
		{time.Date(2026, 1, 21, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(15, 30), toMinutes(12, 0), toMinutes(12, 30)},
		{time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(15, 45), toMinutes(12, 0), toMinutes(12, 30)},
		{time.Date(2026, 1, 23, 0, 0, 0, 0, time.UTC), toMinutes(8, 0), toMinutes(15, 30), toMinutes(12, 0), toMinutes(12, 30)},
	}

	baseID = 8000
	for i, day := range annaWorkDays {
		comePairID := pairID(uuidFromInt(baseID + i*10))
		breakPairID := pairID(uuidFromInt(baseID + i*10 + 1))

		bookings = append(bookings, DevBooking{
			ID:            uuid.MustParse(uuidFromInt(baseID + i*10 + 2)),
			EmployeeID:    annaEmpID,
			BookingTypeID: BookingTypeClockIn,
			BookingDate:   day.date,
			OriginalTime:  day.comeTime,
			EditedTime:    day.comeTime,
			Source:        "terminal",
			PairID:        comePairID,
		})
		bookings = append(bookings, DevBooking{
			ID:            uuid.MustParse(uuidFromInt(baseID + i*10 + 3)),
			EmployeeID:    annaEmpID,
			BookingTypeID: BookingTypeClockOut,
			BookingDate:   day.date,
			OriginalTime:  day.goTime,
			EditedTime:    day.goTime,
			Source:        "terminal",
			PairID:        comePairID,
		})
		bookings = append(bookings, DevBooking{
			ID:            uuid.MustParse(uuidFromInt(baseID + i*10 + 4)),
			EmployeeID:    annaEmpID,
			BookingTypeID: BookingTypeBreakStart,
			BookingDate:   day.date,
			OriginalTime:  day.breakStart,
			EditedTime:    day.breakStart,
			Source:        "terminal",
			PairID:        breakPairID,
		})
		bookings = append(bookings, DevBooking{
			ID:            uuid.MustParse(uuidFromInt(baseID + i*10 + 5)),
			EmployeeID:    annaEmpID,
			BookingTypeID: BookingTypeBreakEnd,
			BookingDate:   day.date,
			OriginalTime:  day.breakEnd,
			EditedTime:    day.breakEnd,
			Source:        "terminal",
			PairID:        breakPairID,
		})
	}

	return bookings
}

// uuidFromInt creates a deterministic UUID from an integer for dev purposes.
func uuidFromInt(i int) string {
	return uuid.MustParse("00000000-0000-0000-0000-" + padInt(i)).String()
}

// padInt pads an integer to 12 digits for UUID suffix.
func padInt(i int) string {
	s := ""
	for j := 0; j < 12; j++ {
		s = "0" + s
	}
	is := ""
	for i > 0 {
		is = string(rune('0'+i%10)) + is
		i /= 10
	}
	if is == "" {
		is = "0"
	}
	return s[:12-len(is)] + is
}

// GetDevBookings returns all dev bookings.
func GetDevBookings() []DevBooking {
	return generateDevBookings()
}
