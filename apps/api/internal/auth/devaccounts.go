package auth

import "github.com/google/uuid"

// DevAccount represents a tenant-specific account for dev mode seeding.
type DevAccount struct {
	ID          uuid.UUID
	Code        string
	Name        string
	AccountType string // "bonus", "tracking", "balance"
	Unit        string // "minutes", "hours", "days"
}

// DevAccounts contains 6 tenant-specific accounts.
// UUID range: 1101-1106
//
// These are seeded alongside the 3 system accounts from migration (FLEX, OT, VAC).
var DevAccounts = []DevAccount{
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000001101"),
		Code:        "NIGHT",
		Name:        "Night Shift Bonus",
		AccountType: "bonus",
		Unit:        "minutes",
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000001102"),
		Code:        "SAT",
		Name:        "Saturday Bonus",
		AccountType: "bonus",
		Unit:        "minutes",
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000001103"),
		Code:        "SUN",
		Name:        "Sunday/Holiday Bonus",
		AccountType: "bonus",
		Unit:        "minutes",
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000001104"),
		Code:        "ONCALL",
		Name:        "On-Call Duty",
		AccountType: "tracking",
		Unit:        "minutes",
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000001105"),
		Code:        "TRAVEL",
		Name:        "Travel Time",
		AccountType: "tracking",
		Unit:        "minutes",
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000001106"),
		Code:        "SICK",
		Name:        "Sick Leave Balance",
		AccountType: "balance",
		Unit:        "days",
	},
}

// GetDevAccounts returns all dev accounts.
func GetDevAccounts() []DevAccount {
	return DevAccounts
}
