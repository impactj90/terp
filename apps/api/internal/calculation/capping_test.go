package calculation_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/tolga/terp/internal/calculation"
)

func TestCalculateEarlyArrivalCapping(t *testing.T) {
	tests := []struct {
		name             string
		arrivalTime      int
		windowStart      *int
		toleranceMinus   int
		variableWorkTime bool
		expectedCapped   *int // nil means no capping
	}{
		{
			name:           "nil window start - no capping",
			arrivalTime:    400,
			windowStart:    nil,
			toleranceMinus: 0,
			expectedCapped: nil,
		},
		{
			name:           "within window - no capping",
			arrivalTime:    420, // 07:00
			windowStart:    intPtr(420),
			toleranceMinus: 0,
			expectedCapped: nil,
		},
		{
			name:           "after window start - no capping",
			arrivalTime:    435, // 07:15
			windowStart:    intPtr(420),
			toleranceMinus: 0,
			expectedCapped: nil,
		},
		{
			name:             "before window, no tolerance - capped",
			arrivalTime:      405,         // 06:45
			windowStart:      intPtr(420), // 07:00
			toleranceMinus:   0,
			variableWorkTime: false,
			expectedCapped:   intPtr(15),
		},
		{
			name:             "before window, tolerance applies (variable work time) - no capping",
			arrivalTime:      405,         // 06:45
			windowStart:      intPtr(420), // 07:00
			toleranceMinus:   30,
			variableWorkTime: true,
			expectedCapped:   nil, // 06:45 >= 06:30 (07:00 - 30)
		},
		{
			name:             "before tolerance window (variable work time) - capped",
			arrivalTime:      375,         // 06:15
			windowStart:      intPtr(420), // 07:00
			toleranceMinus:   30,
			variableWorkTime: true,
			expectedCapped:   intPtr(15), // 06:15 to 06:30 = 15 min capped
		},
		{
			name:             "before window, tolerance NOT applied (fixed work time) - capped",
			arrivalTime:      405,         // 06:45
			windowStart:      intPtr(420), // 07:00
			toleranceMinus:   30,
			variableWorkTime: false,
			expectedCapped:   intPtr(15), // tolerance ignored when not variable
		},
		{
			name:             "exactly at effective window start - no capping",
			arrivalTime:      390,         // 06:30
			windowStart:      intPtr(420), // 07:00
			toleranceMinus:   30,
			variableWorkTime: true,
			expectedCapped:   nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.CalculateEarlyArrivalCapping(
				tt.arrivalTime,
				tt.windowStart,
				tt.toleranceMinus,
				tt.variableWorkTime,
			)

			if tt.expectedCapped == nil {
				assert.Nil(t, result)
			} else {
				assert.NotNil(t, result)
				assert.Equal(t, *tt.expectedCapped, result.Minutes)
				assert.Equal(t, calculation.CappingSourceEarlyArrival, result.Source)
			}
		})
	}
}

func TestCalculateLateDepatureCapping(t *testing.T) {
	tests := []struct {
		name           string
		departureTime  int
		windowEnd      *int
		tolerancePlus  int
		expectedCapped *int
	}{
		{
			name:           "nil window end - no capping",
			departureTime:  1080, // 18:00
			windowEnd:      nil,
			tolerancePlus:  0,
			expectedCapped: nil,
		},
		{
			name:           "within window - no capping",
			departureTime:  1020, // 17:00
			windowEnd:      intPtr(1020),
			tolerancePlus:  0,
			expectedCapped: nil,
		},
		{
			name:           "before window end - no capping",
			departureTime:  1000, // 16:40
			windowEnd:      intPtr(1020),
			tolerancePlus:  0,
			expectedCapped: nil,
		},
		{
			name:           "after window end, no tolerance - capped",
			departureTime:  1050,         // 17:30
			windowEnd:      intPtr(1020), // 17:00
			tolerancePlus:  0,
			expectedCapped: intPtr(30),
		},
		{
			name:           "after window, within tolerance - no capping",
			departureTime:  1035,         // 17:15
			windowEnd:      intPtr(1020), // 17:00
			tolerancePlus:  30,
			expectedCapped: nil,
		},
		{
			name:           "after tolerance window - capped",
			departureTime:  1065,         // 17:45
			windowEnd:      intPtr(1020), // 17:00
			tolerancePlus:  30,
			expectedCapped: intPtr(15), // 17:45 - 17:30 = 15 min capped
		},
		{
			name:           "exactly at effective window end - no capping",
			departureTime:  1050,         // 17:30
			windowEnd:      intPtr(1020), // 17:00
			tolerancePlus:  30,
			expectedCapped: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.CalculateLateDepatureCapping(
				tt.departureTime,
				tt.windowEnd,
				tt.tolerancePlus,
			)

			if tt.expectedCapped == nil {
				assert.Nil(t, result)
			} else {
				assert.NotNil(t, result)
				assert.Equal(t, *tt.expectedCapped, result.Minutes)
				assert.Equal(t, calculation.CappingSourceLateLeave, result.Source)
			}
		})
	}
}

func TestCalculateMaxNetTimeCapping(t *testing.T) {
	tests := []struct {
		name           string
		netWorkTime    int
		maxNetWorkTime *int
		expectedCapped *int
	}{
		{
			name:           "nil max - no capping",
			netWorkTime:    660,
			maxNetWorkTime: nil,
			expectedCapped: nil,
		},
		{
			name:           "under max - no capping",
			netWorkTime:    540,         // 9 hours
			maxNetWorkTime: intPtr(600), // 10 hours
			expectedCapped: nil,
		},
		{
			name:           "at max - no capping",
			netWorkTime:    600, // 10 hours
			maxNetWorkTime: intPtr(600),
			expectedCapped: nil,
		},
		{
			name:           "over max - capped",
			netWorkTime:    660,         // 11 hours
			maxNetWorkTime: intPtr(600), // 10 hours
			expectedCapped: intPtr(60),  // 1 hour capped
		},
		{
			name:           "significantly over max - capped",
			netWorkTime:    720,         // 12 hours
			maxNetWorkTime: intPtr(480), // 8 hours
			expectedCapped: intPtr(240), // 4 hours capped
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.CalculateMaxNetTimeCapping(tt.netWorkTime, tt.maxNetWorkTime)

			if tt.expectedCapped == nil {
				assert.Nil(t, result)
			} else {
				assert.NotNil(t, result)
				assert.Equal(t, *tt.expectedCapped, result.Minutes)
				assert.Equal(t, calculation.CappingSourceMaxNetTime, result.Source)
			}
		})
	}
}

func TestAggregateCapping(t *testing.T) {
	tests := []struct {
		name          string
		items         []*calculation.CappedTime
		expectedTotal int
		expectedCount int
	}{
		{
			name:          "no items",
			items:         []*calculation.CappedTime{},
			expectedTotal: 0,
			expectedCount: 0,
		},
		{
			name:          "all nil items",
			items:         []*calculation.CappedTime{nil, nil, nil},
			expectedTotal: 0,
			expectedCount: 0,
		},
		{
			name: "single item",
			items: []*calculation.CappedTime{
				{Minutes: 15, Source: calculation.CappingSourceEarlyArrival},
			},
			expectedTotal: 15,
			expectedCount: 1,
		},
		{
			name: "multiple items",
			items: []*calculation.CappedTime{
				{Minutes: 15, Source: calculation.CappingSourceEarlyArrival},
				{Minutes: 30, Source: calculation.CappingSourceMaxNetTime},
			},
			expectedTotal: 45,
			expectedCount: 2,
		},
		{
			name: "mixed nil and valid items",
			items: []*calculation.CappedTime{
				nil,
				{Minutes: 20, Source: calculation.CappingSourceEarlyArrival},
				nil,
				{Minutes: 10, Source: calculation.CappingSourceLateLeave},
			},
			expectedTotal: 30,
			expectedCount: 2,
		},
		{
			name: "zero minutes item - ignored",
			items: []*calculation.CappedTime{
				{Minutes: 0, Source: calculation.CappingSourceEarlyArrival},
				{Minutes: 15, Source: calculation.CappingSourceMaxNetTime},
			},
			expectedTotal: 15,
			expectedCount: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculation.AggregateCapping(tt.items...)
			assert.Equal(t, tt.expectedTotal, result.TotalCapped)
			assert.Len(t, result.Items, tt.expectedCount)
		})
	}
}

func TestApplyCapping(t *testing.T) {
	tests := []struct {
		name           string
		netWorkTime    int
		maxNetWorkTime *int
		expectedNet    int
		expectedCapped int
	}{
		{
			name:           "nil max",
			netWorkTime:    600,
			maxNetWorkTime: nil,
			expectedNet:    600,
			expectedCapped: 0,
		},
		{
			name:           "under max",
			netWorkTime:    540,
			maxNetWorkTime: intPtr(600),
			expectedNet:    540,
			expectedCapped: 0,
		},
		{
			name:           "at max",
			netWorkTime:    600,
			maxNetWorkTime: intPtr(600),
			expectedNet:    600,
			expectedCapped: 0,
		},
		{
			name:           "over max",
			netWorkTime:    660,
			maxNetWorkTime: intPtr(600),
			expectedNet:    600,
			expectedCapped: 60,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			adjustedNet, capped := calculation.ApplyCapping(tt.netWorkTime, tt.maxNetWorkTime)
			assert.Equal(t, tt.expectedNet, adjustedNet)
			assert.Equal(t, tt.expectedCapped, capped)
		})
	}
}

func TestApplyWindowCapping(t *testing.T) {
	tests := []struct {
		name             string
		bookingTime      int
		windowStart      *int
		windowEnd        *int
		toleranceMinus   int
		tolerancePlus    int
		isArrival        bool
		variableWorkTime bool
		expectedTime     int
		expectedCapped   int
	}{
		{
			name:           "arrival within window",
			bookingTime:    450,
			windowStart:    intPtr(420),
			windowEnd:      nil,
			isArrival:      true,
			expectedTime:   450,
			expectedCapped: 0,
		},
		{
			name:             "arrival before window, no tolerance",
			bookingTime:      405,
			windowStart:      intPtr(420),
			windowEnd:        nil,
			toleranceMinus:   0,
			isArrival:        true,
			variableWorkTime: false,
			expectedTime:     420,
			expectedCapped:   15,
		},
		{
			name:             "arrival before window, with tolerance (variable)",
			bookingTime:      405,
			windowStart:      intPtr(420),
			windowEnd:        nil,
			toleranceMinus:   30,
			isArrival:        true,
			variableWorkTime: true,
			expectedTime:     405, // within tolerance window
			expectedCapped:   0,
		},
		{
			name:             "arrival before tolerance window (variable)",
			bookingTime:      375,
			windowStart:      intPtr(420),
			windowEnd:        nil,
			toleranceMinus:   30,
			isArrival:        true,
			variableWorkTime: true,
			expectedTime:     390, // adjusted to tolerance window start
			expectedCapped:   15,
		},
		{
			name:           "departure within window",
			bookingTime:    1000,
			windowStart:    nil,
			windowEnd:      intPtr(1020),
			isArrival:      false,
			expectedTime:   1000,
			expectedCapped: 0,
		},
		{
			name:           "departure after window, no tolerance",
			bookingTime:    1050,
			windowStart:    nil,
			windowEnd:      intPtr(1020),
			tolerancePlus:  0,
			isArrival:      false,
			expectedTime:   1020,
			expectedCapped: 30,
		},
		{
			name:           "departure after window, within tolerance",
			bookingTime:    1035,
			windowStart:    nil,
			windowEnd:      intPtr(1020),
			tolerancePlus:  30,
			isArrival:      false,
			expectedTime:   1035,
			expectedCapped: 0,
		},
		{
			name:           "departure after tolerance window",
			bookingTime:    1065,
			windowStart:    nil,
			windowEnd:      intPtr(1020),
			tolerancePlus:  30,
			isArrival:      false,
			expectedTime:   1050,
			expectedCapped: 15,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			adjustedTime, capped := calculation.ApplyWindowCapping(
				tt.bookingTime,
				tt.windowStart,
				tt.windowEnd,
				tt.toleranceMinus,
				tt.tolerancePlus,
				tt.isArrival,
				tt.variableWorkTime,
			)
			assert.Equal(t, tt.expectedTime, adjustedTime)
			assert.Equal(t, tt.expectedCapped, capped)
		})
	}
}

func TestCalculator_WithCapping(t *testing.T) {
	tests := []struct {
		name           string
		bookings       []calculation.BookingInput
		dayPlan        calculation.DayPlanInput
		expectedCapped int
		expectedItems  int
	}{
		{
			name: "no capping - normal day",
			bookings: []calculation.BookingInput{
				{ID: uuid.New(), Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
				{ID: uuid.New(), Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
			},
			dayPlan: calculation.DayPlanInput{
				ComeFrom:     intPtr(420),
				ComeTo:       intPtr(540),
				GoFrom:       intPtr(960),
				GoTo:         intPtr(1080),
				RegularHours: 480,
			},
			expectedCapped: 0,
			expectedItems:  0,
		},
		{
			name: "early arrival capping",
			bookings: []calculation.BookingInput{
				{ID: uuid.New(), Time: 405, Direction: calculation.DirectionIn, Category: calculation.CategoryWork}, // 06:45
				{ID: uuid.New(), Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
			},
			dayPlan: calculation.DayPlanInput{
				ComeFrom:     intPtr(420), // 07:00
				ComeTo:       intPtr(540),
				RegularHours: 480,
			},
			expectedCapped: 15,
			expectedItems:  1,
		},
		{
			name: "late departure capping",
			bookings: []calculation.BookingInput{
				{ID: uuid.New(), Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
				{ID: uuid.New(), Time: 1080, Direction: calculation.DirectionOut, Category: calculation.CategoryWork}, // 18:00
			},
			dayPlan: calculation.DayPlanInput{
				ComeFrom:     intPtr(420),
				GoTo:         intPtr(1050), // 17:30
				RegularHours: 480,
			},
			expectedCapped: 30,
			expectedItems:  1,
		},
		{
			name: "max net time capping",
			bookings: []calculation.BookingInput{
				{ID: uuid.New(), Time: 420, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},   // 07:00
				{ID: uuid.New(), Time: 1140, Direction: calculation.DirectionOut, Category: calculation.CategoryWork}, // 19:00 (12h gross)
			},
			dayPlan: calculation.DayPlanInput{
				ComeFrom:       intPtr(420),
				GoTo:           intPtr(1200),
				RegularHours:   480,
				MaxNetWorkTime: intPtr(600), // 10h max
			},
			expectedCapped: 120, // 12h - 10h = 2h capped
			expectedItems:  1,
		},
		{
			name: "early arrival with variable work time - no capping within tolerance",
			bookings: []calculation.BookingInput{
				{ID: uuid.New(), Time: 405, Direction: calculation.DirectionIn, Category: calculation.CategoryWork}, // 06:45
				{ID: uuid.New(), Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
			},
			dayPlan: calculation.DayPlanInput{
				ComeFrom:         intPtr(420), // 07:00
				ComeTo:           intPtr(540),
				RegularHours:     480,
				VariableWorkTime: true,
				Tolerance: calculation.ToleranceConfig{
					ComeMinus: 30, // 30 min early tolerance
				},
			},
			expectedCapped: 0, // 06:45 is within 06:30-07:00 tolerance window
			expectedItems:  0,
		},
		{
			name: "early arrival with variable work time - capped beyond tolerance",
			bookings: []calculation.BookingInput{
				{ID: uuid.New(), Time: 375, Direction: calculation.DirectionIn, Category: calculation.CategoryWork}, // 06:15
				{ID: uuid.New(), Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
			},
			dayPlan: calculation.DayPlanInput{
				ComeFrom:         intPtr(420), // 07:00
				ComeTo:           intPtr(540),
				RegularHours:     480,
				VariableWorkTime: true,
				Tolerance: calculation.ToleranceConfig{
					ComeMinus: 30, // tolerance extends to 06:30
				},
			},
			expectedCapped: 15, // 06:15 is 15 min before 06:30
			expectedItems:  1,
		},
	}

	calc := calculation.NewCalculator()

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			input := calculation.CalculationInput{
				EmployeeID: uuid.New(),
				Bookings:   tt.bookings,
				DayPlan:    tt.dayPlan,
			}

			result := calc.Calculate(input)

			assert.Equal(t, tt.expectedCapped, result.CappedTime)
			assert.Len(t, result.Capping.Items, tt.expectedItems)
		})
	}
}

func TestCalculator_MultipleCappingSources(t *testing.T) {
	calc := calculation.NewCalculator()

	// Employee arrives early (before window), leaves late (after window), and works too many hours
	input := calculation.CalculationInput{
		EmployeeID: uuid.New(),
		Bookings: []calculation.BookingInput{
			{ID: uuid.New(), Time: 405, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},   // 06:45 (early)
			{ID: uuid.New(), Time: 1200, Direction: calculation.DirectionOut, Category: calculation.CategoryWork}, // 20:00 (late)
		},
		DayPlan: calculation.DayPlanInput{
			ComeFrom:       intPtr(420),  // 07:00
			GoTo:           intPtr(1140), // 19:00
			RegularHours:   480,
			MaxNetWorkTime: intPtr(600), // 10h max
		},
	}

	result := calc.Calculate(input)

	// Expected capping:
	// - Early arrival: 15 min (06:45 to 07:00)
	// - Late departure: 60 min (19:00 to 20:00)
	// - Max net time: gross = 795 (20:00-06:45), net capped at 600, so 795-600 = 195 min capped
	// But gross time calculation uses actual booking times, not window times
	// Gross = 1200 - 405 = 795 min
	// Net = 795 - 0 (no breaks) = 795, capped to 600, so 195 capped from max net time

	assert.Equal(t, 15+60+195, result.CappedTime)
	assert.Len(t, result.Capping.Items, 3)

	// Check we have all three sources
	sources := make(map[calculation.CappingSource]int)
	for _, item := range result.Capping.Items {
		sources[item.Source] = item.Minutes
	}

	assert.Equal(t, 15, sources[calculation.CappingSourceEarlyArrival])
	assert.Equal(t, 60, sources[calculation.CappingSourceLateLeave])
	assert.Equal(t, 195, sources[calculation.CappingSourceMaxNetTime])
}
