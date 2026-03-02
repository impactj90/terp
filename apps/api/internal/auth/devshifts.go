package auth

import "github.com/google/uuid"

// DevShift represents a predefined development shift definition.
type DevShift struct {
	ID            uuid.UUID
	Code          string
	Name          string
	Description   string
	DayPlanID     *uuid.UUID
	Color         string
	Qualification string
	SortOrder     int
}

// Day plan IDs for cross-referencing
var (
	dayPlanStd8H  = uuid.MustParse("00000000-0000-0000-0000-000000000502") // STD-8H
	dayPlanPart4H = uuid.MustParse("00000000-0000-0000-0000-000000000503") // PART-4H
	dayPlanFlex8H = uuid.MustParse("00000000-0000-0000-0000-000000000504") // FLEX-8H
	dayPlanFri6H  = uuid.MustParse("00000000-0000-0000-0000-000000000505") // FRI-6H
)

// DevShifts contains predefined shift definitions for development mode.
// Using deterministic UUIDs (range 18xxx) for consistency across restarts.
var DevShifts = []DevShift{
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000018001"),
		Code:        "FS",
		Name:        "Frühschicht",
		Description: "Frühschicht 06:00–14:00",
		DayPlanID:   &dayPlanStd8H,
		Color:       "#f59e0b",
		SortOrder:   1,
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000018002"),
		Code:        "SS",
		Name:        "Spätschicht",
		Description: "Spätschicht 14:00–22:00",
		DayPlanID:   &dayPlanStd8H,
		Color:       "#8b5cf6",
		SortOrder:   2,
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000018003"),
		Code:        "NS",
		Name:        "Nachtschicht",
		Description: "Nachtschicht 22:00–06:00",
		DayPlanID:   &dayPlanStd8H,
		Color:       "#1e3a5f",
		SortOrder:   3,
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000018004"),
		Code:        "TD",
		Name:        "Tagdienst",
		Description: "Regulärer Tagdienst 08:00–17:00",
		DayPlanID:   &dayPlanStd8H,
		Color:       "#22c55e",
		SortOrder:   4,
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000018005"),
		Code:        "TZ",
		Name:        "Teilzeit",
		Description: "Teilzeitschicht 08:00–12:00",
		DayPlanID:   &dayPlanPart4H,
		Color:       "#06b6d4",
		SortOrder:   5,
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000018006"),
		Code:        "GL",
		Name:        "Gleitzeit",
		Description: "Gleitzeitschicht mit flexiblen Kernzeiten",
		DayPlanID:   &dayPlanFlex8H,
		Color:       "#3b82f6",
		SortOrder:   6,
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000018007"),
		Code:        "BD",
		Name:        "Bereitschaftsdienst",
		Description: "Bereitschaftsdienst / Rufbereitschaft",
		Color:       "#ef4444",
		SortOrder:   7,
	},
	{
		ID:        uuid.MustParse("00000000-0000-0000-0000-000000018008"),
		Code:      "FR",
		Name:      "Frei",
		Description: "Freier Tag / kein Dienst",
		Color:     "#6b7280",
		SortOrder: 8,
	},
}

// GetDevShifts returns all dev shift definitions.
func GetDevShifts() []DevShift {
	return DevShifts
}
