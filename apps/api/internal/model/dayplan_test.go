package model

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestDayPlan_GetEffectiveRegularHours(t *testing.T) {
	tests := []struct {
		name                  string
		dayPlan               DayPlan
		isAbsenceDay          bool
		employeeTargetMinutes *int
		expected              int
	}{
		{
			name:         "standard regular hours",
			dayPlan:      DayPlan{RegularHours: 480},
			isAbsenceDay: false,
			expected:     480,
		},
		{
			name:         "absence day with regular_hours_2",
			dayPlan:      DayPlan{RegularHours: 480, RegularHours2: intPtr(240)},
			isAbsenceDay: true,
			expected:     240,
		},
		{
			name:         "absence day without regular_hours_2 falls back to regular",
			dayPlan:      DayPlan{RegularHours: 480},
			isAbsenceDay: true,
			expected:     480,
		},
		{
			name:                  "from_employee_master with value",
			dayPlan:               DayPlan{RegularHours: 480, FromEmployeeMaster: true},
			isAbsenceDay:          false,
			employeeTargetMinutes: intPtr(450),
			expected:              450,
		},
		{
			name:                  "from_employee_master without value falls back",
			dayPlan:               DayPlan{RegularHours: 480, FromEmployeeMaster: true},
			isAbsenceDay:          false,
			employeeTargetMinutes: nil,
			expected:              480,
		},
		{
			name:                  "from_employee_master takes priority over absence day",
			dayPlan:               DayPlan{RegularHours: 480, RegularHours2: intPtr(240), FromEmployeeMaster: true},
			isAbsenceDay:          true,
			employeeTargetMinutes: intPtr(450),
			expected:              450,
		},
		{
			name:                  "from_employee_master false ignores employee value",
			dayPlan:               DayPlan{RegularHours: 480, FromEmployeeMaster: false},
			isAbsenceDay:          false,
			employeeTargetMinutes: intPtr(450),
			expected:              480,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.dayPlan.GetEffectiveRegularHours(tt.isAbsenceDay, tt.employeeTargetMinutes)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestDayPlan_GetHolidayCredit(t *testing.T) {
	dp := DayPlan{
		HolidayCreditCat1: intPtr(480),
		HolidayCreditCat2: intPtr(240),
		HolidayCreditCat3: intPtr(360),
	}

	tests := []struct {
		name     string
		category int
		expected int
	}{
		{"category 1 full holiday", 1, 480},
		{"category 2 half holiday", 2, 240},
		{"category 3 custom", 3, 360},
		{"category 0 invalid", 0, 0},
		{"category 4 invalid", 4, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := dp.GetHolidayCredit(tt.category)
			assert.Equal(t, tt.expected, result)
		})
	}

	// Test with nil values
	t.Run("nil category returns 0", func(t *testing.T) {
		emptyDP := DayPlan{}
		assert.Equal(t, 0, emptyDP.GetHolidayCredit(1))
		assert.Equal(t, 0, emptyDP.GetHolidayCredit(2))
		assert.Equal(t, 0, emptyDP.GetHolidayCredit(3))
	})
}

func TestDayPlan_HasShiftDetection(t *testing.T) {
	tests := []struct {
		name     string
		dayPlan  DayPlan
		expected bool
	}{
		{
			name:     "no shift detection",
			dayPlan:  DayPlan{},
			expected: false,
		},
		{
			name:     "arrive_from set",
			dayPlan:  DayPlan{ShiftDetectArriveFrom: intPtr(360)},
			expected: true,
		},
		{
			name:     "arrive_to set",
			dayPlan:  DayPlan{ShiftDetectArriveTo: intPtr(540)},
			expected: true,
		},
		{
			name:     "depart_from set",
			dayPlan:  DayPlan{ShiftDetectDepartFrom: intPtr(900)},
			expected: true,
		},
		{
			name:     "depart_to set",
			dayPlan:  DayPlan{ShiftDetectDepartTo: intPtr(1080)},
			expected: true,
		},
		{
			name: "all set",
			dayPlan: DayPlan{
				ShiftDetectArriveFrom: intPtr(360),
				ShiftDetectArriveTo:   intPtr(540),
				ShiftDetectDepartFrom: intPtr(900),
				ShiftDetectDepartTo:   intPtr(1080),
			},
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.dayPlan.HasShiftDetection()
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestDayPlan_GetAlternativePlanIDs(t *testing.T) {
	id1 := uuid.New()
	id2 := uuid.New()
	id3 := uuid.New()

	tests := []struct {
		name     string
		dayPlan  DayPlan
		expected []uuid.UUID
	}{
		{
			name:     "no alternatives",
			dayPlan:  DayPlan{},
			expected: []uuid.UUID{},
		},
		{
			name:     "one alternative",
			dayPlan:  DayPlan{ShiftAltPlan1: &id1},
			expected: []uuid.UUID{id1},
		},
		{
			name: "three alternatives",
			dayPlan: DayPlan{
				ShiftAltPlan1: &id1,
				ShiftAltPlan2: &id2,
				ShiftAltPlan3: &id3,
			},
			expected: []uuid.UUID{id1, id2, id3},
		},
		{
			name: "sparse alternatives (1 and 3 set, 2 nil)",
			dayPlan: DayPlan{
				ShiftAltPlan1: &id1,
				ShiftAltPlan3: &id3,
			},
			expected: []uuid.UUID{id1, id3},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.dayPlan.GetAlternativePlanIDs()
			assert.Equal(t, tt.expected, result)
		})
	}
}

// Helper function for creating int pointers in tests
func intPtr(v int) *int {
	return &v
}
