package timeutil_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/timeutil"
)

func TestTimeToMinutes(t *testing.T) {
	tests := []struct {
		name     string
		time     time.Time
		expected int
	}{
		{"midnight", time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), 0},
		{"8am", time.Date(2026, 1, 1, 8, 0, 0, 0, time.UTC), 480},
		{"8:30am", time.Date(2026, 1, 1, 8, 30, 0, 0, time.UTC), 510},
		{"noon", time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC), 720},
		{"5pm", time.Date(2026, 1, 1, 17, 0, 0, 0, time.UTC), 1020},
		{"23:59", time.Date(2026, 1, 1, 23, 59, 0, 0, time.UTC), 1439},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := timeutil.TimeToMinutes(tt.time)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestMinutesToString(t *testing.T) {
	tests := []struct {
		name     string
		minutes  int
		expected string
	}{
		{"midnight", 0, "00:00"},
		{"8am", 480, "08:00"},
		{"8:05am", 485, "08:05"},
		{"noon", 720, "12:00"},
		{"5pm", 1020, "17:00"},
		{"23:59", 1439, "23:59"},
		{"over 24h", 1500, "25:00"},
		{"negative", -60, "-01:00"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := timeutil.MinutesToString(tt.minutes)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestParseTimeString(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		expected  int
		expectErr bool
	}{
		{"midnight", "00:00", 0, false},
		{"8am", "08:00", 480, false},
		{"8:05am", "08:05", 485, false},
		{"noon", "12:00", 720, false},
		{"5pm", "17:00", 1020, false},
		{"invalid format", "8:00:00", 0, true},
		{"invalid hour", "xx:00", 0, true},
		{"invalid minute", "08:xx", 0, true},
		{"negative minute", "08:-5", 0, true},
		{"minute > 59", "08:60", 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := timeutil.ParseTimeString(tt.input)
			if tt.expectErr {
				assert.Error(t, err)
			} else {
				require.NoError(t, err)
				assert.Equal(t, tt.expected, result)
			}
		})
	}
}

func TestMinutesToTime(t *testing.T) {
	date := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)

	tests := []struct {
		name     string
		minutes  int
		expected time.Time
	}{
		{"midnight", 0, time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)},
		{"8am", 480, time.Date(2026, 1, 15, 8, 0, 0, 0, time.UTC)},
		{"5:30pm", 1050, time.Date(2026, 1, 15, 17, 30, 0, 0, time.UTC)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := timeutil.MinutesToTime(date, tt.minutes)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestNormalizeCrossMidnight(t *testing.T) {
	tests := []struct {
		name     string
		start    int
		end      int
		expected int
	}{
		{"same day", 480, 1020, 1020},       // 08:00 - 17:00
		{"cross midnight", 1320, 120, 1560}, // 22:00 - 02:00 -> 22:00 - 26:00
		{"same time", 480, 480, 480},        // edge case
		{"end at midnight", 480, 0, 1440},   // 08:00 - 00:00
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := timeutil.NormalizeCrossMidnight(tt.start, tt.end)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestIsValidTimeOfDay(t *testing.T) {
	tests := []struct {
		name     string
		minutes  int
		expected bool
	}{
		{"midnight", 0, true},
		{"noon", 720, true},
		{"23:59", 1439, true},
		{"negative", -1, false},
		{"24:00", 1440, false},
		{"over 24h", 1500, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := timeutil.IsValidTimeOfDay(tt.minutes)
			assert.Equal(t, tt.expected, result)
		})
	}
}
