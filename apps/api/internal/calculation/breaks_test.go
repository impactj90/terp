package calculation_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/tolga/terp/internal/calculation"
)

func TestCalculateBreakDeduction_NoConfigs(t *testing.T) {
	result := calculation.CalculateBreakDeduction(nil, 30, 480, nil)
	assert.Equal(t, 30, result.DeductedMinutes)
	assert.Empty(t, result.Warnings)
}

func TestCalculateBreakDeduction_ManualBreakRecorded(t *testing.T) {
	configs := []calculation.BreakConfig{
		{
			Type:             calculation.BreakTypeMinimum,
			Duration:         30,
			AfterWorkMinutes: intPtr(300), // 5 hours threshold
			AutoDeduct:       true,
		},
	}

	// Manual break + minimum auto-deduct: 45 + 30 = 75
	result := calculation.CalculateBreakDeduction(nil, 45, 480, configs)

	assert.Equal(t, 75, result.DeductedMinutes)
	assert.Contains(t, result.Warnings, calculation.WarnCodeManualBreak)
}

func TestCalculateBreakDeduction_ManualBreakShort(t *testing.T) {
	configs := []calculation.BreakConfig{
		{
			Type:             calculation.BreakTypeMinimum,
			Duration:         30,
			AfterWorkMinutes: intPtr(300), // 5 hours threshold
			AutoDeduct:       true,
		},
	}

	// Manual break + minimum auto-deduct: 20 + 30 = 50
	result := calculation.CalculateBreakDeduction(nil, 20, 480, configs)

	assert.Equal(t, 50, result.DeductedMinutes)
	assert.Contains(t, result.Warnings, calculation.WarnCodeManualBreak)
}

func TestCalculateBreakDeduction_AutoDeduct(t *testing.T) {
	configs := []calculation.BreakConfig{
		{
			Type:             calculation.BreakTypeMinimum,
			Duration:         30,
			AfterWorkMinutes: intPtr(300), // 5 hours threshold
			AutoDeduct:       true,
		},
	}

	result := calculation.CalculateBreakDeduction(nil, 0, 480, configs)

	assert.Equal(t, 30, result.DeductedMinutes)
	assert.Contains(t, result.Warnings, calculation.WarnCodeAutoBreakApplied)
	assert.Contains(t, result.Warnings, calculation.WarnCodeNoBreakRecorded)
}

func TestCalculateBreakDeduction_MultipleBreaks(t *testing.T) {
	// Work 08:00-17:00 (480-1020)
	pairs := []calculation.BookingPair{
		{
			InBooking:  &calculation.BookingInput{Time: 480},
			OutBooking: &calculation.BookingInput{Time: 1020},
			Category:   calculation.CategoryWork,
		},
	}
	configs := []calculation.BreakConfig{
		{
			Type:      calculation.BreakTypeFixed,
			StartTime: intPtr(720),
			EndTime:   intPtr(750),
			Duration:  30,
		},
		{Type: calculation.BreakTypeVariable, Duration: 15, AutoDeduct: true},
	}

	// Fixed: 30 min (overlap) + Variable: 15 min (no manual breaks) = 45
	result := calculation.CalculateBreakDeduction(pairs, 0, 480, configs)

	assert.Equal(t, 45, result.DeductedMinutes)
}

func TestCalculateBreakDeduction_WorkThreshold(t *testing.T) {
	threshold := 360 // 6 hours
	configs := []calculation.BreakConfig{
		{
			Type:             calculation.BreakTypeMinimum,
			Duration:         30,
			AfterWorkMinutes: &threshold,
			AutoDeduct:       true,
		},
	}

	// Short work day - break not triggered
	result := calculation.CalculateBreakDeduction(nil, 0, 300, configs)
	assert.Equal(t, 0, result.DeductedMinutes)

	// Long work day - break triggered
	result = calculation.CalculateBreakDeduction(nil, 0, 400, configs)
	assert.Equal(t, 30, result.DeductedMinutes)
}

func TestCalculateNetTime(t *testing.T) {
	tests := []struct {
		name        string
		gross       int
		breakTime   int
		maxNet      *int
		expectedNet int
		hasWarning  bool
	}{
		{"basic", 480, 30, nil, 450, false},
		{"no break", 480, 0, nil, 480, false},
		{"negative result", 30, 60, nil, 0, false},
		{"at max", 480, 0, intPtr(480), 480, false},
		{"capped by max", 540, 0, intPtr(480), 480, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			netTime, warnings := calculation.CalculateNetTime(tt.gross, tt.breakTime, tt.maxNet)
			assert.Equal(t, tt.expectedNet, netTime)
			if tt.hasWarning {
				assert.Contains(t, warnings, calculation.WarnCodeMaxTimeReached)
			} else {
				assert.Empty(t, warnings)
			}
		})
	}
}

func TestCalculateOvertimeUndertime(t *testing.T) {
	tests := []struct {
		name         string
		netTime      int
		targetTime   int
		expOvertime  int
		expUndertime int
	}{
		{"exact match", 480, 480, 0, 0},
		{"overtime", 540, 480, 60, 0},
		{"undertime", 420, 480, 0, 60},
		{"zero net", 0, 480, 0, 480},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			overtime, undertime := calculation.CalculateOvertimeUndertime(tt.netTime, tt.targetTime)
			assert.Equal(t, tt.expOvertime, overtime)
			assert.Equal(t, tt.expUndertime, undertime)
		})
	}
}

func TestCalculateOverlap(t *testing.T) {
	tests := []struct {
		name                       string
		start1, end1, start2, end2 int
		expected                   int
	}{
		{"full overlap - work spans break", 480, 1020, 720, 750, 30},
		{"partial overlap - early end", 480, 735, 720, 750, 15},
		{"partial overlap - late start", 730, 1020, 720, 750, 20},
		{"no overlap - work before break", 480, 700, 720, 750, 0},
		{"no overlap - work after break", 800, 1020, 720, 750, 0},
		{"exact match", 720, 750, 720, 750, 30},
		{"work inside break", 725, 740, 720, 750, 15},
		{"break inside work", 480, 1020, 720, 750, 30},
		{"adjacent - no overlap", 480, 720, 720, 750, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.CalculateOverlap(tt.start1, tt.end1, tt.start2, tt.end2)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestCalculateMinimumBreak(t *testing.T) {
	tests := []struct {
		name          string
		grossWorkTime int
		cfg           calculation.BreakConfig
		expected      int
	}{
		{
			name:          "below threshold - no deduction",
			grossWorkTime: 240, // 4 hours
			cfg: calculation.BreakConfig{
				Type:             calculation.BreakTypeMinimum,
				Duration:         30,
				AfterWorkMinutes: intPtr(300), // 5 hours
			},
			expected: 0,
		},
		{
			name:          "above threshold - full deduction",
			grossWorkTime: 360, // 6 hours
			cfg: calculation.BreakConfig{
				Type:             calculation.BreakTypeMinimum,
				Duration:         30,
				AfterWorkMinutes: intPtr(300), // 5 hours
			},
			expected: 30,
		},
		{
			name:          "exactly at threshold - full deduction",
			grossWorkTime: 300, // 5 hours
			cfg: calculation.BreakConfig{
				Type:             calculation.BreakTypeMinimum,
				Duration:         30,
				AfterWorkMinutes: intPtr(300), // 5 hours
			},
			expected: 30,
		},
		{
			name:          "MinutesDifference - proportional deduction",
			grossWorkTime: 310, // 5:10
			cfg: calculation.BreakConfig{
				Type:              calculation.BreakTypeMinimum,
				Duration:          30,
				AfterWorkMinutes:  intPtr(300), // 5 hours
				MinutesDifference: true,
			},
			expected: 10, // Only 10 minutes over threshold
		},
		{
			name:          "MinutesDifference - capped at duration",
			grossWorkTime: 360, // 6 hours
			cfg: calculation.BreakConfig{
				Type:              calculation.BreakTypeMinimum,
				Duration:          30,
				AfterWorkMinutes:  intPtr(300), // 5 hours
				MinutesDifference: true,
			},
			expected: 30, // Capped at Duration
		},
		{
			name:          "nil threshold - no deduction",
			grossWorkTime: 480,
			cfg: calculation.BreakConfig{
				Type:     calculation.BreakTypeMinimum,
				Duration: 30,
			},
			expected: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.CalculateMinimumBreak(tt.grossWorkTime, tt.cfg)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestDeductFixedBreak(t *testing.T) {
	tests := []struct {
		name     string
		pairs    []calculation.BookingPair
		cfg      calculation.BreakConfig
		expected int
	}{
		{
			name: "full overlap",
			pairs: []calculation.BookingPair{
				{
					InBooking:  &calculation.BookingInput{Time: 480},
					OutBooking: &calculation.BookingInput{Time: 1020},
					Category:   calculation.CategoryWork,
				},
			},
			cfg: calculation.BreakConfig{
				Type:      calculation.BreakTypeFixed,
				StartTime: intPtr(720),
				EndTime:   intPtr(750),
				Duration:  30,
			},
			expected: 30,
		},
		{
			name: "partial overlap",
			pairs: []calculation.BookingPair{
				{
					InBooking:  &calculation.BookingInput{Time: 480},
					OutBooking: &calculation.BookingInput{Time: 735},
					Category:   calculation.CategoryWork,
				},
			},
			cfg: calculation.BreakConfig{
				Type:      calculation.BreakTypeFixed,
				StartTime: intPtr(720),
				EndTime:   intPtr(750),
				Duration:  30,
			},
			expected: 15,
		},
		{
			name: "no overlap",
			pairs: []calculation.BookingPair{
				{
					InBooking:  &calculation.BookingInput{Time: 480},
					OutBooking: &calculation.BookingInput{Time: 690},
					Category:   calculation.CategoryWork,
				},
			},
			cfg: calculation.BreakConfig{
				Type:      calculation.BreakTypeFixed,
				StartTime: intPtr(720),
				EndTime:   intPtr(750),
				Duration:  30,
			},
			expected: 0,
		},
		{
			name: "break pairs ignored",
			pairs: []calculation.BookingPair{
				{
					InBooking:  &calculation.BookingInput{Time: 480},
					OutBooking: &calculation.BookingInput{Time: 1020},
					Category:   calculation.CategoryWork,
				},
				{
					InBooking:  &calculation.BookingInput{Time: 720},
					OutBooking: &calculation.BookingInput{Time: 750},
					Category:   calculation.CategoryBreak,
				},
			},
			cfg: calculation.BreakConfig{
				Type:      calculation.BreakTypeFixed,
				StartTime: intPtr(720),
				EndTime:   intPtr(750),
				Duration:  30,
			},
			expected: 30, // Only work pair considered
		},
		{
			name: "nil start time",
			pairs: []calculation.BookingPair{
				{
					InBooking:  &calculation.BookingInput{Time: 480},
					OutBooking: &calculation.BookingInput{Time: 1020},
					Category:   calculation.CategoryWork,
				},
			},
			cfg: calculation.BreakConfig{
				Type:     calculation.BreakTypeFixed,
				EndTime:  intPtr(750),
				Duration: 30,
			},
			expected: 0,
		},
		{
			name: "overlap exceeds duration - capped",
			pairs: []calculation.BookingPair{
				{
					InBooking:  &calculation.BookingInput{Time: 480},
					OutBooking: &calculation.BookingInput{Time: 1020},
					Category:   calculation.CategoryWork,
				},
			},
			cfg: calculation.BreakConfig{
				Type:      calculation.BreakTypeFixed,
				StartTime: intPtr(720),
				EndTime:   intPtr(780), // 60 min window
				Duration:  30,          // Only 30 min break
			},
			expected: 30, // Capped at Duration
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.DeductFixedBreak(tt.pairs, tt.cfg)
			assert.Equal(t, tt.expected, result)
		})
	}
}
