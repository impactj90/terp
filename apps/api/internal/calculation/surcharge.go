package calculation

import (
	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

// TimePeriod represents a work period in minutes from midnight.
// Used for surcharge calculations where we need simple start/end times.
type TimePeriod struct {
	Start int // Minutes from midnight (0-1439)
	End   int // Minutes from midnight (0-1440)
}

// SurchargeConfig defines when and how surcharges are applied.
// ZMI: Zuschläge - must be split at midnight (no overnight spans allowed).
type SurchargeConfig struct {
	AccountID         uuid.UUID // Target account for surcharge minutes
	AccountCode       string    // Account code for identification
	TimeFrom          int       // Window start: minutes from midnight (0-1439)
	TimeTo            int       // Window end: minutes from midnight (0-1440, must be > TimeFrom)
	AppliesOnHoliday  bool      // If true, applies on holidays
	AppliesOnWorkday  bool      // If true, applies on regular workdays
	HolidayCategories []int     // Which holiday categories (1, 2, 3) - empty = all
}

// SurchargeResult contains calculated surcharge for one config.
type SurchargeResult struct {
	AccountID   uuid.UUID `json:"account_id"`
	AccountCode string    `json:"account_code"`
	Minutes     int       `json:"minutes"`
}

// SurchargeCalculationResult contains all surcharges for a day.
type SurchargeCalculationResult struct {
	Surcharges   []SurchargeResult `json:"surcharges"`
	TotalMinutes int               `json:"total_minutes"`
}

// ValidateSurchargeConfig validates a surcharge configuration.
// ZMI: "Die Zuschläge müssen bis 00:00 Uhr bzw. ab 00:00 Uhr eingetragen werden"
func ValidateSurchargeConfig(config SurchargeConfig) []string {
	var errors []string

	// Time bounds check
	if config.TimeFrom < 0 || config.TimeFrom >= 1440 {
		errors = append(errors, "time_from must be between 0 and 1439")
	}
	if config.TimeTo <= 0 || config.TimeTo > 1440 {
		errors = append(errors, "time_to must be between 1 and 1440")
	}

	// Order check - no overnight spans allowed
	if config.TimeFrom >= config.TimeTo {
		errors = append(errors, "time_from must be less than time_to (no overnight spans - split at midnight)")
	}

	return errors
}

// surchargeApplies checks if a surcharge config applies to this day.
// ZMI: Holiday surcharges only on holidays, night surcharges only on workdays.
func surchargeApplies(config SurchargeConfig, isHoliday bool, holidayCategory int) bool {
	if isHoliday {
		// Check if surcharge applies on holidays
		if !config.AppliesOnHoliday {
			return false
		}
		// Check holiday category filter
		if len(config.HolidayCategories) > 0 {
			found := false
			for _, cat := range config.HolidayCategories {
				if cat == holidayCategory {
					found = true
					break
				}
			}
			if !found {
				return false
			}
		}
		return true
	}
	// Regular workday
	return config.AppliesOnWorkday
}

// CalculateSurcharges calculates all surcharges for a day's work periods.
// ZMI: Zuschläge calculation - fills accounts based on work within time windows.
//
// Parameters:
//   - workPeriods: Work periods in minutes from midnight
//   - configs: Surcharge configurations from day plan bonuses
//   - isHoliday: Whether this day is a holiday
//   - holidayCategory: Holiday category (1, 2, 3) if applicable, 0 if not a holiday
//
// Returns surcharge results for each applicable config with total minutes.
func CalculateSurcharges(
	workPeriods []TimePeriod,
	configs []SurchargeConfig,
	isHoliday bool,
	holidayCategory int,
) SurchargeCalculationResult {
	result := SurchargeCalculationResult{
		Surcharges: make([]SurchargeResult, 0),
	}

	for _, config := range configs {
		// Check if this surcharge applies today
		if !surchargeApplies(config, isHoliday, holidayCategory) {
			continue
		}

		// Calculate overlap between work periods and surcharge window
		totalMinutes := 0
		for _, period := range workPeriods {
			overlap := CalculateOverlap(
				period.Start, period.End,
				config.TimeFrom, config.TimeTo,
			)
			totalMinutes += overlap
		}

		if totalMinutes > 0 {
			result.Surcharges = append(result.Surcharges, SurchargeResult{
				AccountID:   config.AccountID,
				AccountCode: config.AccountCode,
				Minutes:     totalMinutes,
			})
			result.TotalMinutes += totalMinutes
		}
	}

	return result
}

// SplitOvernightSurcharge splits an overnight surcharge config into two valid configs.
// ZMI: Surcharges must not span midnight. 22:00-06:00 becomes [22:00-00:00, 00:00-06:00].
// If config is already valid (no overnight), returns as-is.
func SplitOvernightSurcharge(config SurchargeConfig) []SurchargeConfig {
	// If already valid (no overnight), return as-is
	if config.TimeFrom < config.TimeTo {
		return []SurchargeConfig{config}
	}

	// Split at midnight
	eveningConfig := SurchargeConfig{
		AccountID:         config.AccountID,
		AccountCode:       config.AccountCode,
		TimeFrom:          config.TimeFrom,
		TimeTo:            1440, // Midnight
		AppliesOnHoliday:  config.AppliesOnHoliday,
		AppliesOnWorkday:  config.AppliesOnWorkday,
		HolidayCategories: config.HolidayCategories,
	}

	morningConfig := SurchargeConfig{
		AccountID:         config.AccountID,
		AccountCode:       config.AccountCode,
		TimeFrom:          0, // Midnight
		TimeTo:            config.TimeTo,
		AppliesOnHoliday:  config.AppliesOnHoliday,
		AppliesOnWorkday:  config.AppliesOnWorkday,
		HolidayCategories: config.HolidayCategories,
	}

	return []SurchargeConfig{eveningConfig, morningConfig}
}

// ExtractWorkPeriods extracts TimePeriod slices from BookingPairs.
// Only includes complete work pairs (both in and out bookings present).
func ExtractWorkPeriods(pairs []BookingPair) []TimePeriod {
	periods := make([]TimePeriod, 0, len(pairs))

	for _, pair := range pairs {
		// Only consider work pairs
		if pair.Category != CategoryWork {
			continue
		}
		// Skip incomplete pairs
		if pair.InBooking == nil || pair.OutBooking == nil {
			continue
		}

		periods = append(periods, TimePeriod{
			Start: pair.InBooking.Time,
			End:   pair.OutBooking.Time,
		})
	}

	return periods
}

// ConvertBonusesToSurchargeConfigs converts DayPlanBonus records to SurchargeConfig.
// Maps AppliesOnHoliday to both holiday and workday flags:
// - AppliesOnHoliday=true: holiday only (AppliesOnWorkday=false)
// - AppliesOnHoliday=false: workday only (AppliesOnWorkday=true, AppliesOnHoliday=false)
//
// Note: HolidayCategories is left empty (applies to all categories) since
// DayPlanBonus doesn't have category filtering. This will be enhanced when
// TICKET-124/130 adds category support.
func ConvertBonusesToSurchargeConfigs(bonuses []model.DayPlanBonus) []SurchargeConfig {
	configs := make([]SurchargeConfig, 0, len(bonuses))

	for _, bonus := range bonuses {
		config := SurchargeConfig{
			AccountID:        bonus.AccountID,
			TimeFrom:         bonus.TimeFrom,
			TimeTo:           bonus.TimeTo,
			AppliesOnHoliday: bonus.AppliesOnHoliday,
			AppliesOnWorkday: !bonus.AppliesOnHoliday, // Inverse: holiday=workday-only, not-holiday=holiday-only
		}

		if bonus.Account != nil {
			config.AccountCode = bonus.Account.Code
		}

		configs = append(configs, config)
	}

	return configs
}

// GetHolidayCategoryFromFlag converts the current Holiday.IsHalfDay boolean
// to a ZMI-style holiday category.
// Returns: 1 for full holiday, 2 for half holiday.
// Note: This is a compatibility shim until TICKET-124/130 adds proper Category field.
func GetHolidayCategoryFromFlag(isHalfDay bool) int {
	if isHalfDay {
		return 2 // Half holiday
	}
	return 1 // Full holiday
}
