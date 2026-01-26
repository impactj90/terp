package auth

import "github.com/google/uuid"

// DevAbsenceType represents a predefined development absence type.
type DevAbsenceType struct {
	ID              uuid.UUID `json:"id"`
	Code            string    `json:"code"`
	Name            string    `json:"name"`
	Description     string    `json:"description"`
	Category        string    `json:"category"` // vacation, illness, special, unpaid
	Portion         int       `json:"portion"`  // 0=none, 1=full, 2=half
	DeductsVacation bool      `json:"deducts_vacation"`
	Color           string    `json:"color"`
	SortOrder       int       `json:"sort_order"`
}

// DevAbsenceTypes contains predefined absence types for development mode.
// Using deterministic UUIDs for consistency across restarts.
// These are created as system-level types (tenant_id = NULL).
var DevAbsenceTypes = []DevAbsenceType{
	// Vacation types (U*)
	{
		ID:              uuid.MustParse("00000000-0000-0000-0000-000000000301"),
		Code:            "U",
		Name:            "Urlaub",
		Description:     "Regular vacation leave",
		Category:        "vacation",
		Portion:         1,
		DeductsVacation: true,
		Color:           "#22c55e",
		SortOrder:       1,
	},
	{
		ID:              uuid.MustParse("00000000-0000-0000-0000-000000000302"),
		Code:            "UH",
		Name:            "Urlaub (halber Tag)",
		Description:     "Half-day vacation leave",
		Category:        "vacation",
		Portion:         2,
		DeductsVacation: true,
		Color:           "#4ade80",
		SortOrder:       2,
	},
	// Illness types (K*)
	{
		ID:              uuid.MustParse("00000000-0000-0000-0000-000000000303"),
		Code:            "K",
		Name:            "Krankheit",
		Description:     "Sick leave",
		Category:        "illness",
		Portion:         1,
		DeductsVacation: false,
		Color:           "#ef4444",
		SortOrder:       10,
	},
	{
		ID:              uuid.MustParse("00000000-0000-0000-0000-000000000304"),
		Code:            "KH",
		Name:            "Krankheit (halber Tag)",
		Description:     "Half-day sick leave",
		Category:        "illness",
		Portion:         2,
		DeductsVacation: false,
		Color:           "#f87171",
		SortOrder:       11,
	},
	{
		ID:              uuid.MustParse("00000000-0000-0000-0000-000000000305"),
		Code:            "KK",
		Name:            "Krankheit Kind",
		Description:     "Sick leave for child care",
		Category:        "illness",
		Portion:         1,
		DeductsVacation: false,
		Color:           "#fb923c",
		SortOrder:       12,
	},
	// Special types (S*)
	{
		ID:              uuid.MustParse("00000000-0000-0000-0000-000000000306"),
		Code:            "SU",
		Name:            "Sonderurlaub",
		Description:     "Special leave (wedding, birth, bereavement)",
		Category:        "special",
		Portion:         1,
		DeductsVacation: false,
		Color:           "#8b5cf6",
		SortOrder:       20,
	},
	{
		ID:              uuid.MustParse("00000000-0000-0000-0000-000000000307"),
		Code:            "BS",
		Name:            "Berufsschule",
		Description:     "Vocational school",
		Category:        "special",
		Portion:         1,
		DeductsVacation: false,
		Color:           "#3b82f6",
		SortOrder:       21,
	},
	{
		ID:              uuid.MustParse("00000000-0000-0000-0000-000000000308"),
		Code:            "FT",
		Name:            "Fortbildung",
		Description:     "Training/education",
		Category:        "special",
		Portion:         1,
		DeductsVacation: false,
		Color:           "#06b6d4",
		SortOrder:       22,
	},
	{
		ID:              uuid.MustParse("00000000-0000-0000-0000-000000000309"),
		Code:            "DG",
		Name:            "Dienstgang",
		Description:     "Work errand/business trip",
		Category:        "special",
		Portion:         1,
		DeductsVacation: false,
		Color:           "#14b8a6",
		SortOrder:       23,
	},
	// Unpaid types
	{
		ID:              uuid.MustParse("00000000-0000-0000-0000-000000000310"),
		Code:            "UU",
		Name:            "Unbezahlter Urlaub",
		Description:     "Unpaid leave",
		Category:        "unpaid",
		Portion:         0,
		DeductsVacation: false,
		Color:           "#6b7280",
		SortOrder:       30,
	},
}

// GetDevAbsenceTypes returns all dev absence types.
func GetDevAbsenceTypes() []DevAbsenceType {
	return DevAbsenceTypes
}
