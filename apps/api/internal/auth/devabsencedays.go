package auth

import (
	"time"

	"github.com/google/uuid"
)

// DevAbsenceDay represents an absence day for dev mode seeding.
type DevAbsenceDay struct {
	ID              uuid.UUID
	EmployeeID      uuid.UUID
	AbsenceDate     time.Time
	AbsenceTypeID   uuid.UUID
	Duration        float64 // 1.0 or 0.5
	HalfDayPeriod   *string // "morning" or "afternoon"
	Status          string  // "pending", "approved", "rejected"
	ApprovedBy      *uuid.UUID
	ApprovedAt      *time.Time
	RejectionReason *string
	Notes           *string
	CreatedBy       *uuid.UUID
}

// Absence type UUIDs from devabsencetypes.go
var (
	absenceTypeUrlaub    = uuid.MustParse("00000000-0000-0000-0000-000000000301") // U - Urlaub
	absenceTypeUrlaubH   = uuid.MustParse("00000000-0000-0000-0000-000000000302") // UH - Urlaub halb
	absenceTypeKrankheit = uuid.MustParse("00000000-0000-0000-0000-000000000303") // K - Krankheit
	absenceTypeKindKrank = uuid.MustParse("00000000-0000-0000-0000-000000000305") // KK - Kind krank
)

// Admin user ID for approvals
var devAdminUserID = uuid.MustParse("00000000-0000-0000-0000-000000000001")

func strPtr(s string) *string { return &s }

var approvedAt = time.Date(2026, 1, 24, 10, 0, 0, 0, time.UTC)

// DevAbsenceDays contains absence scenarios for the last week of January 2026.
// UUID range: 15000-15099
//
// Scenarios:
// - Pending tab: User sick (1), Maria vacation (2), Thomas vacation (1) = 4 entries
// - Approved tab: Admin vacation (3), Thomas child sick (1), Anna half-vacation (1) = 5 entries
// - Rejected tab: Anna sick (1) = 1 entry
var DevAbsenceDays = []DevAbsenceDay{
	// Admin: Jan 26-28 (Mon-Wed) — 3-day approved vacation block
	{
		ID:            uuid.MustParse("00000000-0000-0000-0000-000000015001"),
		EmployeeID:    DevEmployeeAdminID,
		AbsenceDate:   time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: absenceTypeUrlaub,
		Duration:      1.0,
		Status:        "approved",
		ApprovedBy:    &devAdminUserID,
		ApprovedAt:    &approvedAt,
	},
	{
		ID:            uuid.MustParse("00000000-0000-0000-0000-000000015002"),
		EmployeeID:    DevEmployeeAdminID,
		AbsenceDate:   time.Date(2026, 1, 27, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: absenceTypeUrlaub,
		Duration:      1.0,
		Status:        "approved",
		ApprovedBy:    &devAdminUserID,
		ApprovedAt:    &approvedAt,
	},
	{
		ID:            uuid.MustParse("00000000-0000-0000-0000-000000015003"),
		EmployeeID:    DevEmployeeAdminID,
		AbsenceDate:   time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: absenceTypeUrlaub,
		Duration:      1.0,
		Status:        "approved",
		ApprovedBy:    &devAdminUserID,
		ApprovedAt:    &approvedAt,
	},
	// User: Jan 29 (Thu) — pending sick day
	{
		ID:            uuid.MustParse("00000000-0000-0000-0000-000000015004"),
		EmployeeID:    DevEmployeeUserID,
		AbsenceDate:   time.Date(2026, 1, 29, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: absenceTypeKrankheit,
		Duration:      1.0,
		Status:        "pending",
	},
	// Maria: Jan 29-30 (Thu-Fri) — 2-day pending vacation
	{
		ID:            uuid.MustParse("00000000-0000-0000-0000-000000015005"),
		EmployeeID:    DevEmployeeMariaID,
		AbsenceDate:   time.Date(2026, 1, 29, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: absenceTypeUrlaub,
		Duration:      1.0,
		Status:        "pending",
	},
	{
		ID:            uuid.MustParse("00000000-0000-0000-0000-000000015006"),
		EmployeeID:    DevEmployeeMariaID,
		AbsenceDate:   time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: absenceTypeUrlaub,
		Duration:      1.0,
		Status:        "pending",
	},
	// Thomas: Jan 26 (Mon) — approved child sick care
	{
		ID:            uuid.MustParse("00000000-0000-0000-0000-000000015007"),
		EmployeeID:    DevEmployeeThomasID,
		AbsenceDate:   time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: absenceTypeKindKrank,
		Duration:      1.0,
		Status:        "approved",
		ApprovedBy:    &devAdminUserID,
		ApprovedAt:    &approvedAt,
	},
	// Thomas: Jan 30 (Fri) — pending vacation
	{
		ID:            uuid.MustParse("00000000-0000-0000-0000-000000015008"),
		EmployeeID:    DevEmployeeThomasID,
		AbsenceDate:   time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: absenceTypeUrlaub,
		Duration:      1.0,
		Status:        "pending",
	},
	// Anna: Jan 27 (Tue) — approved half-day vacation (afternoon)
	{
		ID:            uuid.MustParse("00000000-0000-0000-0000-000000015009"),
		EmployeeID:    DevEmployeeAnnaID,
		AbsenceDate:   time.Date(2026, 1, 27, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: absenceTypeUrlaubH,
		Duration:      0.5,
		HalfDayPeriod: strPtr("afternoon"),
		Status:        "approved",
		ApprovedBy:    &devAdminUserID,
		ApprovedAt:    &approvedAt,
	},
	// Anna: Jan 28 (Wed) — rejected sick day
	{
		ID:              uuid.MustParse("00000000-0000-0000-0000-000000015010"),
		EmployeeID:      DevEmployeeAnnaID,
		AbsenceDate:     time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID:   absenceTypeKrankheit,
		Duration:        1.0,
		Status:          "rejected",
		RejectionReason: strPtr("Insufficient staffing on this date"),
	},
}

// GetDevAbsenceDays returns all dev absence days.
func GetDevAbsenceDays() []DevAbsenceDay {
	return DevAbsenceDays
}
