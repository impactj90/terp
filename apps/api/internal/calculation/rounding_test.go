package calculation_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/tolga/terp/internal/calculation"
)

func TestRoundTime_NilConfig(t *testing.T) {
	result := calculation.RoundTime(487, nil)
	assert.Equal(t, 487, result)
}

func TestRoundTime_RoundingNone(t *testing.T) {
	config := &calculation.RoundingConfig{Type: calculation.RoundingNone, Interval: 15}
	result := calculation.RoundTime(487, config)
	assert.Equal(t, 487, result)
}

func TestRoundTime_ZeroInterval(t *testing.T) {
	config := &calculation.RoundingConfig{Type: calculation.RoundingUp, Interval: 0}
	result := calculation.RoundTime(487, config)
	assert.Equal(t, 487, result)
}

func TestRoundTime_RoundUp(t *testing.T) {
	config := &calculation.RoundingConfig{Type: calculation.RoundingUp, Interval: 15}

	tests := []struct {
		name     string
		input    int
		expected int
	}{
		{"already rounded", 480, 480},     // 08:00 -> 08:00
		{"needs rounding", 481, 495},      // 08:01 -> 08:15
		{"one minute before", 479, 480},   // 07:59 -> 08:00
		{"halfway", 487, 495},             // 08:07 -> 08:15
		{"just after boundary", 495, 495}, // 08:15 -> 08:15
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.RoundTime(tt.input, config)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestRoundTime_RoundDown(t *testing.T) {
	config := &calculation.RoundingConfig{Type: calculation.RoundingDown, Interval: 15}

	tests := []struct {
		name     string
		input    int
		expected int
	}{
		{"already rounded", 480, 480},   // 08:00 -> 08:00
		{"needs rounding", 481, 480},    // 08:01 -> 08:00
		{"one minute before", 494, 480}, // 08:14 -> 08:00
		{"halfway", 487, 480},           // 08:07 -> 08:00
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.RoundTime(tt.input, config)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestRoundTime_RoundNearest(t *testing.T) {
	config := &calculation.RoundingConfig{Type: calculation.RoundingNearest, Interval: 15}

	tests := []struct {
		name     string
		input    int
		expected int
	}{
		{"already rounded", 480, 480},        // 08:00 -> 08:00
		{"round down", 481, 480},             // 08:01 -> 08:00
		{"round down boundary", 487, 480},    // 08:07 -> 08:00
		{"round up", 488, 495},               // 08:08 -> 08:15
		{"round up near boundary", 494, 495}, // 08:14 -> 08:15
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.RoundTime(tt.input, config)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestRoundTime_DifferentIntervals(t *testing.T) {
	tests := []struct {
		name     string
		input    int
		interval int
		typ      calculation.RoundingType
		expected int
	}{
		{"5 min up", 482, 5, calculation.RoundingUp, 485},
		{"5 min down", 484, 5, calculation.RoundingDown, 480},
		{"10 min nearest", 486, 10, calculation.RoundingNearest, 490},
		{"30 min up", 491, 30, calculation.RoundingUp, 510},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config := &calculation.RoundingConfig{Type: tt.typ, Interval: tt.interval}
			result := calculation.RoundTime(tt.input, config)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestRoundTime_RoundAdd(t *testing.T) {
	tests := []struct {
		name     string
		input    int
		addValue int
		expected int
	}{
		{"add 10 minutes to 05:55", 355, 10, 365},   // 05:55 -> 06:05
		{"add 10 minutes to 07:32", 452, 10, 462},   // 07:32 -> 07:42
		{"add 5 minutes to 08:00", 480, 5, 485},     // 08:00 -> 08:05
		{"add 15 minutes to midnight", 0, 15, 15},   // 00:00 -> 00:15
		{"add 30 minutes to 23:30", 1410, 30, 1440}, // 23:30 -> 24:00
		{"add 60 minutes to 23:30", 1410, 60, 1470}, // 23:30 -> 24:30 (allows overflow)
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config := &calculation.RoundingConfig{Type: calculation.RoundingAdd, AddValue: tt.addValue}
			result := calculation.RoundTime(tt.input, config)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestRoundTime_RoundAdd_ZeroValue(t *testing.T) {
	// AddValue of 0 should return original time
	config := &calculation.RoundingConfig{Type: calculation.RoundingAdd, AddValue: 0}
	result := calculation.RoundTime(480, config)
	assert.Equal(t, 480, result)
}

func TestRoundTime_RoundAdd_NegativeValue(t *testing.T) {
	// Negative AddValue should return original time (treated as invalid)
	config := &calculation.RoundingConfig{Type: calculation.RoundingAdd, AddValue: -10}
	result := calculation.RoundTime(480, config)
	assert.Equal(t, 480, result)
}

func TestRoundTime_RoundSubtract(t *testing.T) {
	tests := []struct {
		name     string
		input    int
		addValue int
		expected int
	}{
		{"subtract 10 minutes from 16:10", 970, 10, 960},          // 16:10 -> 16:00
		{"subtract 10 minutes from 17:05", 1025, 10, 1015},        // 17:05 -> 16:55
		{"subtract 5 minutes from 08:05", 485, 5, 480},            // 08:05 -> 08:00
		{"subtract 15 minutes from 00:30", 30, 15, 15},            // 00:30 -> 00:15
		{"subtract 30 minutes from 00:20 clamps to 0", 20, 30, 0}, // 00:20 - 30 = -10, clamped to 0
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config := &calculation.RoundingConfig{Type: calculation.RoundingSubtract, AddValue: tt.addValue}
			result := calculation.RoundTime(tt.input, config)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestRoundTime_RoundSubtract_ZeroValue(t *testing.T) {
	// AddValue of 0 should return original time
	config := &calculation.RoundingConfig{Type: calculation.RoundingSubtract, AddValue: 0}
	result := calculation.RoundTime(480, config)
	assert.Equal(t, 480, result)
}

func TestRoundTime_RoundSubtract_NegativeValue(t *testing.T) {
	// Negative AddValue should return original time (treated as invalid)
	config := &calculation.RoundingConfig{Type: calculation.RoundingSubtract, AddValue: -10}
	result := calculation.RoundTime(480, config)
	assert.Equal(t, 480, result)
}

func TestRoundTime_RoundSubtract_ClampToZero(t *testing.T) {
	// Subtracting more than the time should clamp to 0
	tests := []struct {
		name     string
		input    int
		addValue int
		expected int
	}{
		{"subtract exactly equals time", 30, 30, 0},
		{"subtract more than time", 20, 50, 0},
		{"subtract from zero", 0, 10, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config := &calculation.RoundingConfig{Type: calculation.RoundingSubtract, AddValue: tt.addValue}
			result := calculation.RoundTime(tt.input, config)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestRoundTime_AddSubtractIgnoresInterval(t *testing.T) {
	// For add/subtract types, Interval should be ignored
	tests := []struct {
		name     string
		typ      calculation.RoundingType
		input    int
		interval int
		addValue int
		expected int
	}{
		{"add ignores interval", calculation.RoundingAdd, 480, 15, 10, 490},
		{"subtract ignores interval", calculation.RoundingSubtract, 480, 15, 10, 470},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config := &calculation.RoundingConfig{
				Type:     tt.typ,
				Interval: tt.interval,
				AddValue: tt.addValue,
			}
			result := calculation.RoundTime(tt.input, config)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestRoundTime_IntervalIgnoresAddValue(t *testing.T) {
	// For interval types, AddValue should be ignored
	tests := []struct {
		name     string
		typ      calculation.RoundingType
		input    int
		interval int
		addValue int
		expected int
	}{
		{"up ignores addvalue", calculation.RoundingUp, 482, 5, 100, 485},
		{"down ignores addvalue", calculation.RoundingDown, 484, 5, 100, 480},
		{"nearest ignores addvalue", calculation.RoundingNearest, 483, 5, 100, 485},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config := &calculation.RoundingConfig{
				Type:     tt.typ,
				Interval: tt.interval,
				AddValue: tt.addValue,
			}
			result := calculation.RoundTime(tt.input, config)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// --- Anchored Rounding Tests (ZMI-TICKET-023: Relative-to-plan rounding) ---

func TestRoundTime_AnchoredRoundUp(t *testing.T) {
	// Anchor at 07:03 (423 min), interval=5
	// Grid: ...418, 423, 428, 433, 438...
	anchor := 423
	config := &calculation.RoundingConfig{
		Type:       calculation.RoundingUp,
		Interval:   5,
		AnchorTime: &anchor,
	}

	tests := []struct {
		name     string
		input    int
		expected int
	}{
		{"exactly on anchor", 423, 423},
		{"one above anchor", 424, 428},
		{"two below anchor", 421, 423},
		{"on grid point above", 428, 428},
		{"between grid points", 425, 428},
		{"far below anchor", 420, 423},
		{"well above anchor", 430, 433},
		{"at grid point below anchor", 418, 418},
		{"one below grid point", 417, 418},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.RoundTime(tt.input, config)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestRoundTime_AnchoredRoundDown(t *testing.T) {
	// Anchor at 07:03 (423 min), interval=5
	// Grid: ...418, 423, 428, 433...
	anchor := 423
	config := &calculation.RoundingConfig{
		Type:       calculation.RoundingDown,
		Interval:   5,
		AnchorTime: &anchor,
	}

	tests := []struct {
		name     string
		input    int
		expected int
	}{
		{"exactly on anchor", 423, 423},
		{"one above anchor", 424, 423},
		{"four above anchor", 427, 423},
		{"one below anchor", 422, 418},
		{"on grid point above", 428, 428},
		{"between grid points above", 430, 428},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.RoundTime(tt.input, config)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestRoundTime_AnchoredRoundNearest(t *testing.T) {
	// Anchor at 07:03 (423 min), interval=5
	// Grid: ...418, 423, 428, 433...
	anchor := 423
	config := &calculation.RoundingConfig{
		Type:       calculation.RoundingNearest,
		Interval:   5,
		AnchorTime: &anchor,
	}

	tests := []struct {
		name     string
		input    int
		expected int
	}{
		{"exactly on anchor", 423, 423},
		{"round down offset 1", 424, 423},
		{"round down offset 2", 425, 423},
		{"round up offset 3", 426, 428},
		{"round up offset 4", 427, 428},
		{"on grid point above", 428, 428},
		{"one below anchor", 422, 423},
		{"two below anchor", 421, 423},
		{"three below anchor", 420, 418},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.RoundTime(tt.input, config)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestRoundTime_AnchoredNilFallsBackToStandard(t *testing.T) {
	// When AnchorTime is nil, anchored rounding should fall back to standard
	config := &calculation.RoundingConfig{
		Type:       calculation.RoundingUp,
		Interval:   5,
		AnchorTime: nil,
	}
	result := calculation.RoundTime(482, config)
	assert.Equal(t, 485, result)
}

func TestRoundTime_AnchoredLargerInterval(t *testing.T) {
	// Anchor at 08:00 (480 min), interval=15
	// Grid: ...465, 480, 495, 510...
	anchor := 480
	config := &calculation.RoundingConfig{
		Type:       calculation.RoundingUp,
		Interval:   15,
		AnchorTime: &anchor,
	}

	tests := []struct {
		name     string
		input    int
		expected int
	}{
		{"exactly on anchor", 480, 480},
		{"1 min after", 481, 495},
		{"14 min after", 494, 495},
		{"1 min before anchor", 479, 480},
		{"14 min before anchor", 466, 480},
		{"on grid below", 465, 465},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.RoundTime(tt.input, config)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestRoundTime_AnchoredAddSubtractIgnoresAnchor(t *testing.T) {
	// Add/Subtract rounding should not be affected by AnchorTime
	anchor := 480
	configAdd := &calculation.RoundingConfig{
		Type:       calculation.RoundingAdd,
		AddValue:   10,
		AnchorTime: &anchor,
	}
	configSub := &calculation.RoundingConfig{
		Type:       calculation.RoundingSubtract,
		AddValue:   10,
		AnchorTime: &anchor,
	}

	assert.Equal(t, 490, calculation.RoundTime(480, configAdd))
	assert.Equal(t, 470, calculation.RoundTime(480, configSub))
}
