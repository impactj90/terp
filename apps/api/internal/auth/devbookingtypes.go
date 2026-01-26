package auth

import "github.com/google/uuid"

// DevBookingType represents a predefined development booking type.
type DevBookingType struct {
	ID          uuid.UUID `json:"id"`
	Code        string    `json:"code"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Direction   string    `json:"direction"` // "in" or "out"
	IsActive    bool      `json:"is_active"`
}

// DevBookingTypes contains predefined booking types for development mode.
// Using deterministic UUIDs for consistency across restarts.
// These are created as system-level types (tenant_id = NULL).
var DevBookingTypes = []DevBookingType{
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000000201"),
		Code:        "A1",
		Name:        "Kommen",
		Description: "Clock In - Start of work",
		Direction:   "in",
		IsActive:    true,
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000000202"),
		Code:        "A2",
		Name:        "Gehen",
		Description: "Clock Out - End of work",
		Direction:   "out",
		IsActive:    true,
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000000203"),
		Code:        "P1",
		Name:        "Pause Beginn",
		Description: "Break Start",
		Direction:   "out",
		IsActive:    true,
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000000204"),
		Code:        "P2",
		Name:        "Pause Ende",
		Description: "Break End",
		Direction:   "in",
		IsActive:    true,
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000000205"),
		Code:        "D1",
		Name:        "Dienstgang Beginn",
		Description: "Work Errand Start",
		Direction:   "out",
		IsActive:    true,
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000000206"),
		Code:        "D2",
		Name:        "Dienstgang Ende",
		Description: "Work Errand End",
		Direction:   "in",
		IsActive:    true,
	},
}

// GetDevBookingTypes returns all dev booking types.
func GetDevBookingTypes() []DevBookingType {
	return DevBookingTypes
}
