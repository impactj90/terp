package calculation

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/tolga/terp/internal/model"
)

func TestCalculateSurcharges_NightShift(t *testing.T) {
	nightAccountID := uuid.New()

	// ZMI example: Night surcharge 22:00-00:00 (split at midnight)
	configs := []SurchargeConfig{
		{
			AccountID:        nightAccountID,
			AccountCode:      "NIGHT",
			TimeFrom:         1320, // 22:00
			TimeTo:           1440, // 00:00 (midnight)
			AppliesOnWorkday: true,
			AppliesOnHoliday: false,
		},
	}

	// Work period: 20:00 - 23:00 (3 hours)
	workPeriods := []TimePeriod{
		{Start: 1200, End: 1380}, // 20:00 - 23:00
	}

	result := CalculateSurcharges(workPeriods, configs, false, 0)

	assert.Len(t, result.Surcharges, 1)
	assert.Equal(t, nightAccountID, result.Surcharges[0].AccountID)
	assert.Equal(t, "NIGHT", result.Surcharges[0].AccountCode)
	assert.Equal(t, 60, result.Surcharges[0].Minutes) // 22:00-23:00 = 60 min
	assert.Equal(t, 60, result.TotalMinutes)
}

func TestCalculateSurcharges_HolidaySurcharge(t *testing.T) {
	holidayAccountID := uuid.New()

	// Holiday surcharge for all day
	configs := []SurchargeConfig{
		{
			AccountID:         holidayAccountID,
			AccountCode:       "HOLIDAY",
			TimeFrom:          0,
			TimeTo:            1440,
			AppliesOnWorkday:  false,
			AppliesOnHoliday:  true,
			HolidayCategories: []int{1, 2}, // Cat 1 and 2 only
		},
	}

	// Work period: 08:00 - 16:00 (8 hours)
	workPeriods := []TimePeriod{
		{Start: 480, End: 960},
	}

	// Category 1 holiday - should apply
	result := CalculateSurcharges(workPeriods, configs, true, 1)
	assert.Len(t, result.Surcharges, 1)
	assert.Equal(t, 480, result.Surcharges[0].Minutes)

	// Category 3 holiday - should NOT apply (not in categories)
	result = CalculateSurcharges(workPeriods, configs, true, 3)
	assert.Len(t, result.Surcharges, 0)

	// Normal workday - should NOT apply
	result = CalculateSurcharges(workPeriods, configs, false, 0)
	assert.Len(t, result.Surcharges, 0)
}

func TestCalculateSurcharges_NightNotOnHoliday(t *testing.T) {
	// ZMI: "Dieser Zuschlag ist aber nur an einem normalen Arbeitstag und nicht am Feiertag gültig"
	nightAccountID := uuid.New()

	configs := []SurchargeConfig{
		{
			AccountID:        nightAccountID,
			AccountCode:      "NIGHT",
			TimeFrom:         1320, // 22:00
			TimeTo:           1440, // 00:00
			AppliesOnWorkday: true,
			AppliesOnHoliday: false, // NOT on holidays
		},
	}

	workPeriods := []TimePeriod{
		{Start: 1200, End: 1380}, // 20:00 - 23:00
	}

	// Normal workday - should apply
	result := CalculateSurcharges(workPeriods, configs, false, 0)
	assert.Len(t, result.Surcharges, 1)
	assert.Equal(t, 60, result.Surcharges[0].Minutes)

	// Holiday - should NOT apply
	result = CalculateSurcharges(workPeriods, configs, true, 1)
	assert.Len(t, result.Surcharges, 0)
}

func TestCalculateSurcharges_MultiplePeriods(t *testing.T) {
	accountID := uuid.New()

	configs := []SurchargeConfig{
		{
			AccountID:        accountID,
			AccountCode:      "BONUS",
			TimeFrom:         360, // 06:00
			TimeTo:           480, // 08:00
			AppliesOnWorkday: true,
		},
	}

	// Multiple work periods - split shift
	workPeriods := []TimePeriod{
		{Start: 300, End: 420}, // 05:00 - 07:00 (overlap: 06:00-07:00 = 60 min)
		{Start: 450, End: 540}, // 07:30 - 09:00 (overlap: 07:30-08:00 = 30 min)
	}

	result := CalculateSurcharges(workPeriods, configs, false, 0)
	assert.Len(t, result.Surcharges, 1)
	assert.Equal(t, 90, result.Surcharges[0].Minutes) // 60 + 30 = 90
}

func TestCalculateSurcharges_NoWorkPeriods(t *testing.T) {
	configs := []SurchargeConfig{
		{
			AccountID:        uuid.New(),
			AccountCode:      "NIGHT",
			TimeFrom:         1320,
			TimeTo:           1440,
			AppliesOnWorkday: true,
		},
	}

	result := CalculateSurcharges([]TimePeriod{}, configs, false, 0)
	assert.Len(t, result.Surcharges, 0)
	assert.Equal(t, 0, result.TotalMinutes)
}

func TestCalculateSurcharges_NoOverlap(t *testing.T) {
	configs := []SurchargeConfig{
		{
			AccountID:        uuid.New(),
			AccountCode:      "NIGHT",
			TimeFrom:         1320, // 22:00
			TimeTo:           1440, // 00:00
			AppliesOnWorkday: true,
		},
	}

	// Work period: 08:00 - 16:00 (no overlap with night window)
	workPeriods := []TimePeriod{
		{Start: 480, End: 960},
	}

	result := CalculateSurcharges(workPeriods, configs, false, 0)
	assert.Len(t, result.Surcharges, 0)
}

func TestValidateSurchargeConfig(t *testing.T) {
	tests := []struct {
		name       string
		config     SurchargeConfig
		errorCount int
	}{
		{
			name: "valid config",
			config: SurchargeConfig{
				TimeFrom: 360,
				TimeTo:   480,
			},
			errorCount: 0,
		},
		{
			name: "valid full day",
			config: SurchargeConfig{
				TimeFrom: 0,
				TimeTo:   1440,
			},
			errorCount: 0,
		},
		{
			name: "overnight span - invalid",
			config: SurchargeConfig{
				TimeFrom: 1320, // 22:00
				TimeTo:   360,  // 06:00 - crosses midnight!
			},
			errorCount: 1,
		},
		{
			name: "time_from negative",
			config: SurchargeConfig{
				TimeFrom: -10,
				TimeTo:   360,
			},
			errorCount: 1,
		},
		{
			name: "time_from at boundary",
			config: SurchargeConfig{
				TimeFrom: 1440, // Invalid: 1440 is max for end, not start
				TimeTo:   1440,
			},
			errorCount: 2, // Both time_from invalid AND from >= to
		},
		{
			name: "time_to out of range",
			config: SurchargeConfig{
				TimeFrom: 360,
				TimeTo:   1500,
			},
			errorCount: 1,
		},
		{
			name: "time_to zero",
			config: SurchargeConfig{
				TimeFrom: 0,
				TimeTo:   0,
			},
			errorCount: 2, // time_to invalid AND from >= to
		},
		{
			name: "from equals to",
			config: SurchargeConfig{
				TimeFrom: 480,
				TimeTo:   480,
			},
			errorCount: 1,
		},
		{
			name: "from greater than to",
			config: SurchargeConfig{
				TimeFrom: 600,
				TimeTo:   480,
			},
			errorCount: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			errors := ValidateSurchargeConfig(tt.config)
			assert.Len(t, errors, tt.errorCount, "errors: %v", errors)
		})
	}
}

func TestSplitOvernightSurcharge(t *testing.T) {
	config := SurchargeConfig{
		AccountID:        uuid.New(),
		AccountCode:      "NIGHT",
		TimeFrom:         1320, // 22:00
		TimeTo:           360,  // 06:00 (overnight)
		AppliesOnWorkday: true,
		AppliesOnHoliday: false,
	}

	result := SplitOvernightSurcharge(config)

	assert.Len(t, result, 2)

	// Evening portion: 22:00 - 00:00
	assert.Equal(t, 1320, result[0].TimeFrom)
	assert.Equal(t, 1440, result[0].TimeTo)
	assert.Equal(t, config.AccountID, result[0].AccountID)
	assert.Equal(t, "NIGHT", result[0].AccountCode)
	assert.True(t, result[0].AppliesOnWorkday)
	assert.False(t, result[0].AppliesOnHoliday)

	// Morning portion: 00:00 - 06:00
	assert.Equal(t, 0, result[1].TimeFrom)
	assert.Equal(t, 360, result[1].TimeTo)
	assert.Equal(t, config.AccountID, result[1].AccountID)
}

func TestSplitOvernightSurcharge_AlreadyValid(t *testing.T) {
	config := SurchargeConfig{
		AccountID: uuid.New(),
		TimeFrom:  480,
		TimeTo:    600,
	}

	result := SplitOvernightSurcharge(config)

	assert.Len(t, result, 1)
	assert.Equal(t, config.TimeFrom, result[0].TimeFrom)
	assert.Equal(t, config.TimeTo, result[0].TimeTo)
}

func TestExtractWorkPeriods(t *testing.T) {
	inID := uuid.New()
	outID := uuid.New()

	pairs := []BookingPair{
		{
			InBooking:  &BookingInput{ID: inID, Time: 480, Direction: DirectionIn},
			OutBooking: &BookingInput{ID: outID, Time: 720, Direction: DirectionOut},
			Category:   CategoryWork,
			Duration:   240,
		},
		{
			InBooking:  &BookingInput{ID: uuid.New(), Time: 720, Direction: DirectionIn},
			OutBooking: &BookingInput{ID: uuid.New(), Time: 750, Direction: DirectionOut},
			Category:   CategoryBreak, // Should be excluded
			Duration:   30,
		},
		{
			InBooking:  &BookingInput{ID: uuid.New(), Time: 750, Direction: DirectionIn},
			OutBooking: &BookingInput{ID: uuid.New(), Time: 1020, Direction: DirectionOut},
			Category:   CategoryWork,
			Duration:   270,
		},
	}

	periods := ExtractWorkPeriods(pairs)

	assert.Len(t, periods, 2)
	assert.Equal(t, 480, periods[0].Start)
	assert.Equal(t, 720, periods[0].End)
	assert.Equal(t, 750, periods[1].Start)
	assert.Equal(t, 1020, periods[1].End)
}

func TestExtractWorkPeriods_IncompletePairs(t *testing.T) {
	pairs := []BookingPair{
		{
			InBooking: &BookingInput{ID: uuid.New(), Time: 480, Direction: DirectionIn},
			// Missing OutBooking
			Category: CategoryWork,
		},
		{
			// Missing InBooking
			OutBooking: &BookingInput{ID: uuid.New(), Time: 720, Direction: DirectionOut},
			Category:   CategoryWork,
		},
	}

	periods := ExtractWorkPeriods(pairs)

	assert.Len(t, periods, 0) // All incomplete pairs should be skipped
}

func TestGetHolidayCategoryFromFlag(t *testing.T) {
	// Full holiday (not half day)
	assert.Equal(t, 1, GetHolidayCategoryFromFlag(false))

	// Half holiday
	assert.Equal(t, 2, GetHolidayCategoryFromFlag(true))
}

func TestConvertBonusesToSurchargeConfigs(t *testing.T) {
	accountID := uuid.New()

	bonuses := []model.DayPlanBonus{
		{
			ID:               uuid.New(),
			AccountID:        accountID,
			TimeFrom:         1320,  // 22:00
			TimeTo:           1440,  // 00:00
			AppliesOnHoliday: false, // Workday only
			Account: &model.Account{
				ID:   accountID,
				Code: "NIGHT_BONUS",
			},
		},
		{
			ID:               uuid.New(),
			AccountID:        uuid.New(),
			TimeFrom:         0,
			TimeTo:           1440,
			AppliesOnHoliday: true, // Holiday only
			Account:          nil,  // No account preloaded
		},
	}

	configs := ConvertBonusesToSurchargeConfigs(bonuses)

	assert.Len(t, configs, 2)

	// First config: workday only (AppliesOnHoliday=false)
	assert.Equal(t, accountID, configs[0].AccountID)
	assert.Equal(t, "NIGHT_BONUS", configs[0].AccountCode)
	assert.Equal(t, 1320, configs[0].TimeFrom)
	assert.Equal(t, 1440, configs[0].TimeTo)
	assert.False(t, configs[0].AppliesOnHoliday)
	assert.True(t, configs[0].AppliesOnWorkday)

	// Second config: holiday only (AppliesOnHoliday=true)
	assert.True(t, configs[1].AppliesOnHoliday)
	assert.False(t, configs[1].AppliesOnWorkday)
	assert.Empty(t, configs[1].AccountCode) // No account preloaded
}

func TestConvertBonusesToSurchargeConfigs_Empty(t *testing.T) {
	configs := ConvertBonusesToSurchargeConfigs([]model.DayPlanBonus{})
	assert.Len(t, configs, 0)
	assert.NotNil(t, configs) // Should be empty slice, not nil
}
