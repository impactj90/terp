package auth

import (
	"time"

	"github.com/google/uuid"
)

// DevEmployee represents a predefined development employee.
type DevEmployee struct {
	ID              uuid.UUID `json:"id"`
	PersonnelNumber string    `json:"personnel_number"`
	PIN             string    `json:"pin"`
	FirstName       string    `json:"first_name"`
	LastName        string    `json:"last_name"`
	Email           string    `json:"email"`
	EntryDate       time.Time `json:"entry_date"`
	WeeklyHours     float64   `json:"weekly_hours"`
	VacationDays    float64   `json:"vacation_days"`
}

// DevEmployees contains predefined employees for development mode.
// Using deterministic UUIDs for consistency across restarts.
// The first two employees are linked to dev users (admin and user).
var DevEmployees = []DevEmployee{
	{
		// Linked to admin user (00000000-0000-0000-0000-000000000001)
		ID:              uuid.MustParse("00000000-0000-0000-0000-000000000011"),
		PersonnelNumber: "EMP001",
		PIN:             "1001",
		FirstName:       "Admin",
		LastName:        "User",
		Email:           "admin@dev.local",
		EntryDate:       time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC),
		WeeklyHours:     40.0,
		VacationDays:    30.0,
	},
	{
		// Linked to regular user (00000000-0000-0000-0000-000000000002)
		ID:              uuid.MustParse("00000000-0000-0000-0000-000000000012"),
		PersonnelNumber: "EMP002",
		PIN:             "1002",
		FirstName:       "Regular",
		LastName:        "User",
		Email:           "user@dev.local",
		EntryDate:       time.Date(2021, 3, 15, 0, 0, 0, 0, time.UTC),
		WeeklyHours:     40.0,
		VacationDays:    28.0,
	},
	{
		// Additional test employee - part time
		ID:              uuid.MustParse("00000000-0000-0000-0000-000000000013"),
		PersonnelNumber: "EMP003",
		PIN:             "1003",
		FirstName:       "Maria",
		LastName:        "Schmidt",
		Email:           "maria.schmidt@dev.local",
		EntryDate:       time.Date(2022, 6, 1, 0, 0, 0, 0, time.UTC),
		WeeklyHours:     20.0,
		VacationDays:    15.0,
	},
	{
		// Additional test employee - recent hire
		ID:              uuid.MustParse("00000000-0000-0000-0000-000000000014"),
		PersonnelNumber: "EMP004",
		PIN:             "1004",
		FirstName:       "Thomas",
		LastName:        "Müller",
		Email:           "thomas.mueller@dev.local",
		EntryDate:       time.Date(2024, 1, 15, 0, 0, 0, 0, time.UTC),
		WeeklyHours:     40.0,
		VacationDays:    30.0,
	},
	{
		// Additional test employee - senior
		ID:              uuid.MustParse("00000000-0000-0000-0000-000000000015"),
		PersonnelNumber: "EMP005",
		PIN:             "1005",
		FirstName:       "Anna",
		LastName:        "Weber",
		Email:           "anna.weber@dev.local",
		EntryDate:       time.Date(2015, 9, 1, 0, 0, 0, 0, time.UTC),
		WeeklyHours:     35.0,
		VacationDays:    32.0,
	},
}

// DevUserEmployeeMap maps dev user IDs to their corresponding employee IDs.
var DevUserEmployeeMap = map[uuid.UUID]uuid.UUID{
	uuid.MustParse("00000000-0000-0000-0000-000000000001"): uuid.MustParse("00000000-0000-0000-0000-000000000011"), // admin
	uuid.MustParse("00000000-0000-0000-0000-000000000002"): uuid.MustParse("00000000-0000-0000-0000-000000000012"), // user
}

// GetDevEmployees returns all predefined dev employees.
func GetDevEmployees() []DevEmployee {
	return DevEmployees
}

// GetDevEmployeeForUser returns the employee ID for a given dev user ID, if mapped.
func GetDevEmployeeForUser(userID uuid.UUID) (uuid.UUID, bool) {
	empID, ok := DevUserEmployeeMap[userID]
	return empID, ok
}
