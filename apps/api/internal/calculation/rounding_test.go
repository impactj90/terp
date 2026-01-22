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
