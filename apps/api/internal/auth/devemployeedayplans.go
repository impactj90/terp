package auth

import (
	"fmt"
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

// Employee→WeekPlan→DayPlan mapping for January 2026.
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

// January 2026 holidays: Jan 1 (Neujahr), Jan 6 (Heilige Drei Könige)
var januaryHolidays = map[int]bool{
	1: true, // Neujahr
	6: true, // Heilige Drei Könige
}

// generateDevEmployeeDayPlans creates day plans for all 5 employees for January 2026.
// UUID range: 12000-12999, base per employee: Admin=12000, User=12100, Maria=12200, Thomas=12300, Anna=12400.
func generateDevEmployeeDayPlans() []DevEmployeeDayPlan {
	plans := make([]DevEmployeeDayPlan, 0, 5*31) // 5 employees × 31 days

	for empIdx, cfg := range devEmployeeWeekConfigs {
		baseID := 12000 + empIdx*100

		for day := 1; day <= 31; day++ {
			date := time.Date(2026, 1, day, 0, 0, 0, 0, time.UTC)
			weekday := date.Weekday()

			id := uuid.MustParse(fmt.Sprintf("00000000-0000-0000-0000-%012d", baseID+day))

			var dayPlanID *uuid.UUID
			source := "tariff"

			switch {
			case januaryHolidays[day]:
				// Holiday: off day
				dayPlanID = nil
				source = "holiday"
			case weekday == time.Saturday || weekday == time.Sunday:
				// Weekend: off day
				dayPlanID = nil
			case weekday == time.Friday:
				dayPlanID = cfg.Friday
			default:
				// Monday-Thursday
				dayPlanID = cfg.MonThru
			}

			plans = append(plans, DevEmployeeDayPlan{
				ID:         id,
				EmployeeID: cfg.EmployeeID,
				PlanDate:   date,
				DayPlanID:  dayPlanID,
				Source:     source,
			})
		}
	}

	return plans
}

// GetDevEmployeeDayPlans returns all dev employee day plans for January 2026.
func GetDevEmployeeDayPlans() []DevEmployeeDayPlan {
	return generateDevEmployeeDayPlans()
}
