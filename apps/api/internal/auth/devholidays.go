package auth

import (
	"time"

	"github.com/google/uuid"
)

// DevHoliday represents a holiday for dev mode seeding.
type DevHoliday struct {
	ID           uuid.UUID
	HolidayDate  time.Time
	Name         string
	Category     int
	AppliesToAll bool
}

// DevHolidays contains Bavarian (Bayern) public holidays for 2026.
// Bavaria has the most public holidays of any German state.
// These are seeded during dev login to provide realistic test data.
var DevHolidays = []DevHoliday{
	// Nationwide holidays
	{
		ID:           uuid.MustParse("00000000-0000-0000-0000-000000000401"),
		HolidayDate:  time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		Name:         "Neujahr",
		Category:     1,
		AppliesToAll: true,
	},
	// Bavaria-specific
	{
		ID:           uuid.MustParse("00000000-0000-0000-0000-000000000402"),
		HolidayDate:  time.Date(2026, 1, 6, 0, 0, 0, 0, time.UTC),
		Name:         "Heilige Drei Könige",
		Category:     1,
		AppliesToAll: true,
	},
	// Easter 2026: Sunday April 5
	{
		ID:           uuid.MustParse("00000000-0000-0000-0000-000000000403"),
		HolidayDate:  time.Date(2026, 4, 3, 0, 0, 0, 0, time.UTC),
		Name:         "Karfreitag",
		Category:     1,
		AppliesToAll: true,
	},
	{
		ID:           uuid.MustParse("00000000-0000-0000-0000-000000000404"),
		HolidayDate:  time.Date(2026, 4, 6, 0, 0, 0, 0, time.UTC),
		Name:         "Ostermontag",
		Category:     1,
		AppliesToAll: true,
	},
	{
		ID:           uuid.MustParse("00000000-0000-0000-0000-000000000405"),
		HolidayDate:  time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC),
		Name:         "Tag der Arbeit",
		Category:     1,
		AppliesToAll: true,
	},
	// Christi Himmelfahrt: 39 days after Easter Sunday
	{
		ID:           uuid.MustParse("00000000-0000-0000-0000-000000000406"),
		HolidayDate:  time.Date(2026, 5, 14, 0, 0, 0, 0, time.UTC),
		Name:         "Christi Himmelfahrt",
		Category:     1,
		AppliesToAll: true,
	},
	// Pfingstmontag: 50 days after Easter Sunday
	{
		ID:           uuid.MustParse("00000000-0000-0000-0000-000000000407"),
		HolidayDate:  time.Date(2026, 5, 25, 0, 0, 0, 0, time.UTC),
		Name:         "Pfingstmontag",
		Category:     1,
		AppliesToAll: true,
	},
	// Fronleichnam: 60 days after Easter Sunday (Bavaria-specific)
	{
		ID:           uuid.MustParse("00000000-0000-0000-0000-000000000408"),
		HolidayDate:  time.Date(2026, 6, 4, 0, 0, 0, 0, time.UTC),
		Name:         "Fronleichnam",
		Category:     1,
		AppliesToAll: true,
	},
	// Mariä Himmelfahrt (Bavaria-specific, only in communities with Catholic majority)
	{
		ID:           uuid.MustParse("00000000-0000-0000-0000-000000000409"),
		HolidayDate:  time.Date(2026, 8, 15, 0, 0, 0, 0, time.UTC),
		Name:         "Mariä Himmelfahrt",
		Category:     1,
		AppliesToAll: true,
	},
	{
		ID:           uuid.MustParse("00000000-0000-0000-0000-000000000410"),
		HolidayDate:  time.Date(2026, 10, 3, 0, 0, 0, 0, time.UTC),
		Name:         "Tag der Deutschen Einheit",
		Category:     1,
		AppliesToAll: true,
	},
	// Allerheiligen (Bavaria-specific)
	{
		ID:           uuid.MustParse("00000000-0000-0000-0000-000000000411"),
		HolidayDate:  time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC),
		Name:         "Allerheiligen",
		Category:     1,
		AppliesToAll: true,
	},
	{
		ID:           uuid.MustParse("00000000-0000-0000-0000-000000000412"),
		HolidayDate:  time.Date(2026, 12, 25, 0, 0, 0, 0, time.UTC),
		Name:         "1. Weihnachtstag",
		Category:     1,
		AppliesToAll: true,
	},
	{
		ID:           uuid.MustParse("00000000-0000-0000-0000-000000000413"),
		HolidayDate:  time.Date(2026, 12, 26, 0, 0, 0, 0, time.UTC),
		Name:         "2. Weihnachtstag",
		Category:     1,
		AppliesToAll: true,
	},
}

// GetDevHolidays returns all dev holidays.
func GetDevHolidays() []DevHoliday {
	return DevHolidays
}
