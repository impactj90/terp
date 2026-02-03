package auth

import (
	"crypto/sha256"
	"time"

	"github.com/google/uuid"
)

// DevEmployeeDayPlan represents an employee day plan for dev mode seeding.
type DevEmployeeDayPlan struct {
	ID         uuid.UUID
	EmployeeID uuid.UUID
	PlanDate   time.Time
	DayPlanID  *uuid.UUID // nil = off day (weekend/holiday)
	Source     string     // "tariff" or "holiday"
}

// Employee→WeekPlan→DayPlan mapping for 2026.
// | Employee | WeekPlan | Mon-Thu       | Fri           | Sat-Sun |
// |----------|----------|---------------|---------------|---------|
// | Admin    | WEEK-40H | STD-8H (502)  | STD-8H (502)  | nil     |
// | User     | WEEK-FLEX| FLEX-8H (504) | FLEX-8H (504) | nil     |
// | Maria    | WEEK-20H | PART-4H (503) | PART-4H (503) | nil     |
// | Thomas   | WEEK-40H | STD-8H (502)  | STD-8H (502)  | nil     |
// | Anna     | WEEK-38H | STD-8H (502)  | FRI-6H (505)  | nil     |

type employeeWeekConfig struct {
	EmployeeID uuid.UUID
	MonThru    *uuid.UUID // Monday-Thursday day plan
	Friday     *uuid.UUID // Friday day plan
}

var devEmployeeWeekConfigs = []employeeWeekConfig{
	{DevEmployeeAdminID, &DayPlanSTD8HID, &DayPlanSTD8HID},
	{DevEmployeeUserID, &DayPlanFLEX8HID, &DayPlanFLEX8HID},
	{DevEmployeeMariaID, &DayPlanPART4HID, &DayPlanPART4HID},
	{DevEmployeeThomasID, &DayPlanSTD8HID, &DayPlanSTD8HID},
	{DevEmployeeAnnaID, &DayPlanSTD8HID, &DayPlanFRI6HID},
}

// devHolidayDates is built from DevHolidays for fast lookup.
var devHolidayDates map[time.Time]bool

func init() {
	devHolidayDates = make(map[time.Time]bool, len(DevHolidays))
	for _, h := range DevHolidays {
		devHolidayDates[h.HolidayDate] = true
	}
}

// deterministicUUID generates a stable UUID from a seed string using SHA-256.
// This ensures the same employee+date always produces the same UUID across restarts.
func deterministicUUID(seed string) uuid.UUID {
	hash := sha256.Sum256([]byte(seed))
	id, _ := uuid.FromBytes(hash[:16])
	// Set version 5 (SHA-based) and variant bits
	id[6] = (id[6] & 0x0f) | 0x50
	id[8] = (id[8] & 0x3f) | 0x80
	return id
}

// generateDevEmployeeDayPlans creates day plans for all 5 employees for the full year 2026.
func generateDevEmployeeDayPlans() []DevEmployeeDayPlan {
	startDate := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	endDate := time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC)

	plans := make([]DevEmployeeDayPlan, 0, 5*365)

	for _, cfg := range devEmployeeWeekConfigs {
		date := startDate
		for !date.After(endDate) {
			weekday := date.Weekday()

			id := deterministicUUID(cfg.EmployeeID.String() + date.Format("2006-01-02"))

			var dayPlanID *uuid.UUID
			source := "tariff"

			switch {
			case devHolidayDates[date]:
				dayPlanID = nil
				source = "holiday"
			case weekday == time.Saturday || weekday == time.Sunday:
				dayPlanID = nil
			case weekday == time.Friday:
				dayPlanID = cfg.Friday
			default:
				dayPlanID = cfg.MonThru
			}

			plans = append(plans, DevEmployeeDayPlan{
				ID:         id,
				EmployeeID: cfg.EmployeeID,
				PlanDate:   date,
				DayPlanID:  dayPlanID,
				Source:     source,
			})

			date = date.AddDate(0, 0, 1)
		}
	}

	return plans
}

// GetDevEmployeeDayPlans returns all dev employee day plans for 2026.
func GetDevEmployeeDayPlans() []DevEmployeeDayPlan {
	return generateDevEmployeeDayPlans()
}
