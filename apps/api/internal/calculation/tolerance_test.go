package calculation_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/tolga/terp/internal/calculation"
)

func TestApplyComeTolerance_NilExpected(t *testing.T) {
	tolerance := calculation.ToleranceConfig{ComePlus: 5, ComeMinus: 5}
	result := calculation.ApplyComeTolerance(485, nil, tolerance)
	assert.Equal(t, 485, result)
}

func TestApplyComeTolerance_LateArrival(t *testing.T) {
	expected := 480 // 08:00
	tolerance := calculation.ToleranceConfig{ComePlus: 5, ComeMinus: 5}

	tests := []struct {
		name     string
		actual   int
		expected int
	}{
		{"within tolerance", 483, 480},      // 08:03 -> 08:00
		{"at tolerance boundary", 485, 480}, // 08:05 -> 08:00
		{"beyond tolerance", 486, 486},      // 08:06 -> 08:06
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.ApplyComeTolerance(tt.actual, &expected, tolerance)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestApplyComeTolerance_EarlyArrival(t *testing.T) {
	expected := 480 // 08:00
	tolerance := calculation.ToleranceConfig{ComePlus: 5, ComeMinus: 10}

	tests := []struct {
		name     string
		actual   int
		expected int
	}{
		{"within tolerance", 475, 480},      // 07:55 -> 08:00
		{"at tolerance boundary", 470, 480}, // 07:50 -> 08:00
		{"beyond tolerance", 469, 469},      // 07:49 -> 07:49
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.ApplyComeTolerance(tt.actual, &expected, tolerance)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestApplyGoTolerance_NilExpected(t *testing.T) {
	tolerance := calculation.ToleranceConfig{GoPlus: 5, GoMinus: 5}
	result := calculation.ApplyGoTolerance(1020, nil, tolerance)
	assert.Equal(t, 1020, result)
}

func TestApplyGoTolerance_EarlyDeparture(t *testing.T) {
	expected := 1020 // 17:00
	tolerance := calculation.ToleranceConfig{GoPlus: 5, GoMinus: 5}

	tests := []struct {
		name     string
		actual   int
		expected int
	}{
		{"within tolerance", 1017, 1020},      // 16:57 -> 17:00
		{"at tolerance boundary", 1015, 1020}, // 16:55 -> 17:00
		{"beyond tolerance", 1014, 1014},      // 16:54 -> 16:54
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.ApplyGoTolerance(tt.actual, &expected, tolerance)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestApplyGoTolerance_LateDeparture(t *testing.T) {
	expected := 1020 // 17:00
	tolerance := calculation.ToleranceConfig{GoPlus: 10, GoMinus: 5}

	tests := []struct {
		name     string
		actual   int
		expected int
	}{
		{"within tolerance", 1025, 1020},      // 17:05 -> 17:00
		{"at tolerance boundary", 1030, 1020}, // 17:10 -> 17:00
		{"beyond tolerance", 1031, 1031},      // 17:11 -> 17:11
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.ApplyGoTolerance(tt.actual, &expected, tolerance)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestValidateTimeWindow(t *testing.T) {
	from := 480 // 08:00
	to := 510   // 08:30

	tests := []struct {
		name     string
		actual   int
		expected []string
	}{
		{"within window", 490, nil},
		{"at from boundary", 480, nil},
		{"at to boundary", 510, nil},
		{"too early", 470, []string{"EARLY"}},
		{"too late", 520, []string{"LATE"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.ValidateTimeWindow(tt.actual, &from, &to, "EARLY", "LATE")
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestValidateTimeWindow_NilBoundaries(t *testing.T) {
	result := calculation.ValidateTimeWindow(490, nil, nil, "EARLY", "LATE")
	assert.Empty(t, result)
}

func TestValidateCoreHours(t *testing.T) {
	coreStart := 540 // 09:00
	coreEnd := 960   // 16:00

	tests := []struct {
		name      string
		firstCome *int
		lastGo    *int
		expected  []string
	}{
		{"covers core hours", intPtr(480), intPtr(1020), nil},
		{"exact core hours", intPtr(540), intPtr(960), nil},
		{"missed start", intPtr(600), intPtr(1020), []string{calculation.ErrCodeMissedCoreStart}},
		{"missed end", intPtr(480), intPtr(900), []string{calculation.ErrCodeMissedCoreEnd}},
		{"missed both", intPtr(600), intPtr(900), []string{calculation.ErrCodeMissedCoreStart, calculation.ErrCodeMissedCoreEnd}},
		{"nil firstCome", nil, intPtr(1020), []string{calculation.ErrCodeMissedCoreStart}},
		{"nil lastGo", intPtr(480), nil, []string{calculation.ErrCodeMissedCoreEnd}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.ValidateCoreHours(tt.firstCome, tt.lastGo, &coreStart, &coreEnd)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestValidateCoreHours_NoCoreHours(t *testing.T) {
	result := calculation.ValidateCoreHours(intPtr(480), intPtr(1020), nil, nil)
	assert.Empty(t, result)
}

func intPtr(v int) *int {
	return &v
}
