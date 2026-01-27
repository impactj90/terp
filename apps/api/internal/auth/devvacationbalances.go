package auth

import "github.com/google/uuid"

// DevVacationBalance represents a vacation balance for dev mode seeding.
type DevVacationBalance struct {
	ID          uuid.UUID
	EmployeeID  uuid.UUID
	Year        int
	Entitlement float64
	Carryover   float64
	Adjustments float64
	Taken       float64
}

// DevVacationBalances contains 2026 vacation balances for all 5 employees.
// UUID range: 16000-16004
//
// | Employee | Entitlement | Carryover | Adj | Taken | Available |
// |----------|-------------|-----------|-----|-------|-----------|
// | Admin    | 30.0        | 3.0       | 0.0 | 3.0   | 30.0      |
// | User     | 28.0        | 5.0       | 0.0 | 0.0   | 33.0      |
// | Maria    | 15.0        | 2.0       | 0.0 | 0.0   | 17.0      |
// | Thomas   | 30.0        | 0.0       | 0.0 | 0.0   | 30.0      |
// | Anna     | 32.0        | 4.0       | 0.0 | 0.5   | 35.5      |
var DevVacationBalances = []DevVacationBalance{
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000016000"),
		EmployeeID:  DevEmployeeAdminID,
		Year:        2026,
		Entitlement: 30.0,
		Carryover:   3.0,
		Adjustments: 0.0,
		Taken:       3.0, // 3 approved vacation days (Jan 26-28)
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000016001"),
		EmployeeID:  DevEmployeeUserID,
		Year:        2026,
		Entitlement: 28.0,
		Carryover:   5.0,
		Adjustments: 0.0,
		Taken:       0.0, // Sick day is pending, K doesn't deduct vacation anyway
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000016002"),
		EmployeeID:  DevEmployeeMariaID,
		Year:        2026,
		Entitlement: 15.0,
		Carryover:   2.0,
		Adjustments: 0.0,
		Taken:       0.0, // Vacation is pending, not yet deducted
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000016003"),
		EmployeeID:  DevEmployeeThomasID,
		Year:        2026,
		Entitlement: 30.0,
		Carryover:   0.0,
		Adjustments: 0.0,
		Taken:       0.0, // KK doesn't deduct vacation
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000016004"),
		EmployeeID:  DevEmployeeAnnaID,
		Year:        2026,
		Entitlement: 32.0,
		Carryover:   4.0,
		Adjustments: 0.0,
		Taken:       0.5, // Half-day approved vacation (Jan 27)
	},
}

// GetDevVacationBalances returns all dev vacation balances.
func GetDevVacationBalances() []DevVacationBalance {
	return DevVacationBalances
}
