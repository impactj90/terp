package auth

import "github.com/google/uuid"

// DevDayPlan represents a day plan for dev mode seeding.
type DevDayPlan struct {
	ID           uuid.UUID
	Code         string
	Name         string
	Description  string
	PlanType     string // "fixed" or "flextime"
	ComeFrom     *int   // minutes from midnight
	ComeTo       *int   // minutes from midnight (flextime only)
	GoFrom       *int   // minutes from midnight (flextime only)
	GoTo         *int   // minutes from midnight
	RegularHours int    // target hours in minutes
	IsActive     bool
}

// Helper to create int pointer
func intPtr(i int) *int {
	return &i
}

// DevDayPlans contains default day plans for dev mode seeding.
// These provide basic templates that most organizations need.
var DevDayPlans = []DevDayPlan{
	// Free Day - for weekends and non-working days (required for week plans)
	{
		ID:           uuid.MustParse("00000000-0000-0000-0000-000000000501"),
		Code:         "FREE",
		Name:         "Free Day",
		Description:  "Non-working day (weekends, etc.)",
		PlanType:     "fixed",
		ComeFrom:     nil,
		GoTo:         nil,
		RegularHours: 0, // No target hours
		IsActive:     true,
	},
	// Standard 8-hour fixed workday
	{
		ID:           uuid.MustParse("00000000-0000-0000-0000-000000000502"),
		Code:         "STD-8H",
		Name:         "Standard 8h Day",
		Description:  "Standard 8-hour fixed workday (08:00-17:00)",
		PlanType:     "fixed",
		ComeFrom:     intPtr(480),  // 08:00
		GoTo:         intPtr(1020), // 17:00
		RegularHours: 480,          // 8 hours
		IsActive:     true,
	},
	// Part-time 4-hour day
	{
		ID:           uuid.MustParse("00000000-0000-0000-0000-000000000503"),
		Code:         "PART-4H",
		Name:         "Part-time 4h Day",
		Description:  "Part-time 4-hour day (08:00-12:00)",
		PlanType:     "fixed",
		ComeFrom:     intPtr(480), // 08:00
		GoTo:         intPtr(720), // 12:00
		RegularHours: 240,         // 4 hours
		IsActive:     true,
	},
	// Flextime 8-hour day
	{
		ID:           uuid.MustParse("00000000-0000-0000-0000-000000000504"),
		Code:         "FLEX-8H",
		Name:         "Flextime 8h Day",
		Description:  "Flexible 8-hour day (arrive 06:00-09:00, leave 15:00-19:00)",
		PlanType:     "flextime",
		ComeFrom:     intPtr(360),  // 06:00
		ComeTo:       intPtr(540),  // 09:00
		GoFrom:       intPtr(900),  // 15:00
		GoTo:         intPtr(1140), // 19:00
		RegularHours: 480,          // 8 hours
		IsActive:     true,
	},
	// Friday short day (common in Germany)
	{
		ID:           uuid.MustParse("00000000-0000-0000-0000-000000000505"),
		Code:         "FRI-6H",
		Name:         "Friday Short Day",
		Description:  "Shortened Friday (08:00-14:00)",
		PlanType:     "fixed",
		ComeFrom:     intPtr(480), // 08:00
		GoTo:         intPtr(840), // 14:00
		RegularHours: 360,         // 6 hours
		IsActive:     true,
	},
}

// GetDevDayPlans returns all dev day plans.
func GetDevDayPlans() []DevDayPlan {
	return DevDayPlans
}
