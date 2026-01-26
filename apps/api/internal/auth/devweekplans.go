package auth

import "github.com/google/uuid"

// Day plan IDs from devdayplans.go
var (
	DayPlanFreeID   = uuid.MustParse("00000000-0000-0000-0000-000000000501")
	DayPlanSTD8HID  = uuid.MustParse("00000000-0000-0000-0000-000000000502")
	DayPlanPART4HID = uuid.MustParse("00000000-0000-0000-0000-000000000503")
	DayPlanFLEX8HID = uuid.MustParse("00000000-0000-0000-0000-000000000504")
	DayPlanFRI6HID  = uuid.MustParse("00000000-0000-0000-0000-000000000505")
)

// DevWeekPlan represents a week plan for dev mode seeding.
type DevWeekPlan struct {
	ID          uuid.UUID
	Code        string
	Name        string
	Description string
	Monday      uuid.UUID
	Tuesday     uuid.UUID
	Wednesday   uuid.UUID
	Thursday    uuid.UUID
	Friday      uuid.UUID
	Saturday    uuid.UUID
	Sunday      uuid.UUID
	IsActive    bool
}

// DevWeekPlans contains default week plans for dev mode seeding.
var DevWeekPlans = []DevWeekPlan{
	// Standard 40h week (Mon-Fri 8h, Sat-Sun free)
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000000601"),
		Code:        "WEEK-40H",
		Name:        "Standard 40h Week",
		Description: "Standard 5-day week, 8 hours per day (Mon-Fri)",
		Monday:      DayPlanSTD8HID,
		Tuesday:     DayPlanSTD8HID,
		Wednesday:   DayPlanSTD8HID,
		Thursday:    DayPlanSTD8HID,
		Friday:      DayPlanSTD8HID,
		Saturday:    DayPlanFreeID,
		Sunday:      DayPlanFreeID,
		IsActive:    true,
	},
	// Standard week with short Friday (38h)
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000000602"),
		Code:        "WEEK-38H",
		Name:        "Standard 38h Week",
		Description: "5-day week with short Friday (Mon-Thu 8h, Fri 6h)",
		Monday:      DayPlanSTD8HID,
		Tuesday:     DayPlanSTD8HID,
		Wednesday:   DayPlanSTD8HID,
		Thursday:    DayPlanSTD8HID,
		Friday:      DayPlanFRI6HID,
		Saturday:    DayPlanFreeID,
		Sunday:      DayPlanFreeID,
		IsActive:    true,
	},
	// Flextime 40h week
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000000603"),
		Code:        "WEEK-FLEX",
		Name:        "Flextime 40h Week",
		Description: "Flexible 5-day week, 8 hours per day (Mon-Fri)",
		Monday:      DayPlanFLEX8HID,
		Tuesday:     DayPlanFLEX8HID,
		Wednesday:   DayPlanFLEX8HID,
		Thursday:    DayPlanFLEX8HID,
		Friday:      DayPlanFLEX8HID,
		Saturday:    DayPlanFreeID,
		Sunday:      DayPlanFreeID,
		IsActive:    true,
	},
	// Part-time 20h week
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000000604"),
		Code:        "WEEK-20H",
		Name:        "Part-time 20h Week",
		Description: "Part-time 5-day week, 4 hours per day (Mon-Fri)",
		Monday:      DayPlanPART4HID,
		Tuesday:     DayPlanPART4HID,
		Wednesday:   DayPlanPART4HID,
		Thursday:    DayPlanPART4HID,
		Friday:      DayPlanPART4HID,
		Saturday:    DayPlanFreeID,
		Sunday:      DayPlanFreeID,
		IsActive:    true,
	},
}

// GetDevWeekPlans returns all dev week plans.
func GetDevWeekPlans() []DevWeekPlan {
	return DevWeekPlans
}
