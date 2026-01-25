package calculation_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/tolga/terp/internal/calculation"
)

// intPtr is already defined in tolerance_test.go

// mockDayPlanLoader implements DayPlanLoader for testing
type mockDayPlanLoader struct {
	plans map[uuid.UUID]*calculation.ShiftDetectionInput
}

func newMockLoader() *mockDayPlanLoader {
	return &mockDayPlanLoader{
		plans: make(map[uuid.UUID]*calculation.ShiftDetectionInput),
	}
}

func (m *mockDayPlanLoader) LoadShiftDetectionInput(id uuid.UUID) *calculation.ShiftDetectionInput {
	return m.plans[id]
}

func (m *mockDayPlanLoader) addPlan(input *calculation.ShiftDetectionInput) {
	m.plans[input.PlanID] = input
}

// ============================================================================
// Group 1: No Shift Detection Configured
// ============================================================================

func TestDetectShift_NilAssignedPlan(t *testing.T) {
	detector := calculation.NewShiftDetector(nil)
	result := detector.DetectShift(nil, intPtr(420), intPtr(1020))

	assert.Equal(t, uuid.Nil, result.MatchedPlanID)
	assert.Equal(t, "", result.MatchedPlanCode)
	assert.True(t, result.IsOriginalPlan)
	assert.Equal(t, calculation.ShiftMatchNone, result.MatchedBy)
	assert.False(t, result.HasError)
}

func TestDetectShift_NoWindowsConfigured(t *testing.T) {
	planID := uuid.New()
	assignedPlan := &calculation.ShiftDetectionInput{
		PlanID:   planID,
		PlanCode: "NORMAL",
	}

	detector := calculation.NewShiftDetector(nil)
	result := detector.DetectShift(assignedPlan, intPtr(420), intPtr(1020))

	assert.Equal(t, planID, result.MatchedPlanID)
	assert.Equal(t, "NORMAL", result.MatchedPlanCode)
	assert.True(t, result.IsOriginalPlan)
	assert.Equal(t, calculation.ShiftMatchNone, result.MatchedBy)
	assert.False(t, result.HasError)
}

func TestDetectShift_NoBookingTimes(t *testing.T) {
	planID := uuid.New()
	assignedPlan := &calculation.ShiftDetectionInput{
		PlanID:     planID,
		PlanCode:   "EARLY",
		ArriveFrom: intPtr(360),
		ArriveTo:   intPtr(480),
	}

	detector := calculation.NewShiftDetector(nil)
	result := detector.DetectShift(assignedPlan, nil, nil)

	assert.Equal(t, planID, result.MatchedPlanID)
	assert.Equal(t, "EARLY", result.MatchedPlanCode)
	assert.True(t, result.IsOriginalPlan)
	assert.Equal(t, calculation.ShiftMatchNone, result.MatchedBy)
	assert.False(t, result.HasError)
}

// ============================================================================
// Group 2: Arrival Window Only
// ============================================================================

func TestDetectShift_ArrivalWindow(t *testing.T) {
	planID := uuid.New()
	assignedPlan := &calculation.ShiftDetectionInput{
		PlanID:     planID,
		PlanCode:   "EARLY",
		ArriveFrom: intPtr(360), // 06:00
		ArriveTo:   intPtr(480), // 08:00
	}

	tests := []struct {
		name          string
		firstArrival  *int
		lastDeparture *int
		wantMatch     bool
		wantMatchType calculation.ShiftMatchType
	}{
		{"within window", intPtr(420), intPtr(1020), true, calculation.ShiftMatchArrival},
		{"at from boundary", intPtr(360), intPtr(1020), true, calculation.ShiftMatchArrival},
		{"at to boundary", intPtr(480), intPtr(1020), true, calculation.ShiftMatchArrival},
		{"too early", intPtr(350), intPtr(1020), false, calculation.ShiftMatchNone},
		{"too late", intPtr(490), intPtr(1020), false, calculation.ShiftMatchNone},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			detector := calculation.NewShiftDetector(nil)
			result := detector.DetectShift(assignedPlan, tt.firstArrival, tt.lastDeparture)

			if tt.wantMatch {
				assert.Equal(t, planID, result.MatchedPlanID)
				assert.True(t, result.IsOriginalPlan)
				assert.False(t, result.HasError)
			} else {
				assert.True(t, result.HasError)
				assert.Equal(t, calculation.ErrCodeNoMatchingShift, result.ErrorCode)
			}
			assert.Equal(t, tt.wantMatchType, result.MatchedBy)
		})
	}
}

func TestDetectShift_ArrivalWindow_NilDeparture(t *testing.T) {
	planID := uuid.New()
	assignedPlan := &calculation.ShiftDetectionInput{
		PlanID:     planID,
		PlanCode:   "EARLY",
		ArriveFrom: intPtr(360),
		ArriveTo:   intPtr(480),
	}

	detector := calculation.NewShiftDetector(nil)
	result := detector.DetectShift(assignedPlan, intPtr(420), nil)

	assert.Equal(t, planID, result.MatchedPlanID)
	assert.True(t, result.IsOriginalPlan)
	assert.Equal(t, calculation.ShiftMatchArrival, result.MatchedBy)
	assert.False(t, result.HasError)
}

// ============================================================================
// Group 3: Departure Window Only
// ============================================================================

func TestDetectShift_DepartureWindow(t *testing.T) {
	planID := uuid.New()
	assignedPlan := &calculation.ShiftDetectionInput{
		PlanID:     planID,
		PlanCode:   "LATE",
		DepartFrom: intPtr(960),  // 16:00
		DepartTo:   intPtr(1080), // 18:00
	}

	tests := []struct {
		name          string
		firstArrival  *int
		lastDeparture *int
		wantMatch     bool
		wantMatchType calculation.ShiftMatchType
	}{
		{"within window", intPtr(480), intPtr(1020), true, calculation.ShiftMatchDeparture},
		{"at from boundary", intPtr(480), intPtr(960), true, calculation.ShiftMatchDeparture},
		{"at to boundary", intPtr(480), intPtr(1080), true, calculation.ShiftMatchDeparture},
		{"too early", intPtr(480), intPtr(950), false, calculation.ShiftMatchNone},
		{"too late", intPtr(480), intPtr(1090), false, calculation.ShiftMatchNone},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			detector := calculation.NewShiftDetector(nil)
			result := detector.DetectShift(assignedPlan, tt.firstArrival, tt.lastDeparture)

			if tt.wantMatch {
				assert.Equal(t, planID, result.MatchedPlanID)
				assert.True(t, result.IsOriginalPlan)
				assert.False(t, result.HasError)
			} else {
				assert.True(t, result.HasError)
				assert.Equal(t, calculation.ErrCodeNoMatchingShift, result.ErrorCode)
			}
			assert.Equal(t, tt.wantMatchType, result.MatchedBy)
		})
	}
}

func TestDetectShift_DepartureWindow_NilArrival(t *testing.T) {
	planID := uuid.New()
	assignedPlan := &calculation.ShiftDetectionInput{
		PlanID:     planID,
		PlanCode:   "LATE",
		DepartFrom: intPtr(960),
		DepartTo:   intPtr(1080),
	}

	detector := calculation.NewShiftDetector(nil)
	result := detector.DetectShift(assignedPlan, nil, intPtr(1020))

	assert.Equal(t, planID, result.MatchedPlanID)
	assert.True(t, result.IsOriginalPlan)
	assert.Equal(t, calculation.ShiftMatchDeparture, result.MatchedBy)
	assert.False(t, result.HasError)
}

// ============================================================================
// Group 4: Both Windows Configured
// ============================================================================

func TestDetectShift_BothWindows(t *testing.T) {
	planID := uuid.New()
	assignedPlan := &calculation.ShiftDetectionInput{
		PlanID:     planID,
		PlanCode:   "BOTH",
		ArriveFrom: intPtr(360),  // 06:00
		ArriveTo:   intPtr(480),  // 08:00
		DepartFrom: intPtr(960),  // 16:00
		DepartTo:   intPtr(1080), // 18:00
	}

	tests := []struct {
		name          string
		firstArrival  *int
		lastDeparture *int
		wantMatch     bool
		wantMatchType calculation.ShiftMatchType
	}{
		{"both match", intPtr(420), intPtr(1020), true, calculation.ShiftMatchBoth},
		{"arrival only matches", intPtr(420), intPtr(900), false, calculation.ShiftMatchNone},
		{"departure only matches", intPtr(500), intPtr(1020), false, calculation.ShiftMatchNone},
		{"neither matches", intPtr(500), intPtr(900), false, calculation.ShiftMatchNone},
		{"at both boundaries", intPtr(360), intPtr(1080), true, calculation.ShiftMatchBoth},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			detector := calculation.NewShiftDetector(nil)
			result := detector.DetectShift(assignedPlan, tt.firstArrival, tt.lastDeparture)

			if tt.wantMatch {
				assert.Equal(t, planID, result.MatchedPlanID)
				assert.True(t, result.IsOriginalPlan)
				assert.False(t, result.HasError)
			} else {
				assert.True(t, result.HasError)
				assert.Equal(t, calculation.ErrCodeNoMatchingShift, result.ErrorCode)
			}
			assert.Equal(t, tt.wantMatchType, result.MatchedBy)
		})
	}
}

func TestDetectShift_BothWindows_NilArrival(t *testing.T) {
	planID := uuid.New()
	assignedPlan := &calculation.ShiftDetectionInput{
		PlanID:     planID,
		PlanCode:   "BOTH",
		ArriveFrom: intPtr(360),
		ArriveTo:   intPtr(480),
		DepartFrom: intPtr(960),
		DepartTo:   intPtr(1080),
	}

	detector := calculation.NewShiftDetector(nil)
	result := detector.DetectShift(assignedPlan, nil, intPtr(1020))

	// Both windows configured but arrival is nil - cannot match both
	assert.True(t, result.HasError)
	assert.Equal(t, calculation.ErrCodeNoMatchingShift, result.ErrorCode)
	assert.Equal(t, calculation.ShiftMatchNone, result.MatchedBy)
}

func TestDetectShift_BothWindows_NilDeparture(t *testing.T) {
	planID := uuid.New()
	assignedPlan := &calculation.ShiftDetectionInput{
		PlanID:     planID,
		PlanCode:   "BOTH",
		ArriveFrom: intPtr(360),
		ArriveTo:   intPtr(480),
		DepartFrom: intPtr(960),
		DepartTo:   intPtr(1080),
	}

	detector := calculation.NewShiftDetector(nil)
	result := detector.DetectShift(assignedPlan, intPtr(420), nil)

	// Both windows configured but departure is nil - cannot match both
	assert.True(t, result.HasError)
	assert.Equal(t, calculation.ErrCodeNoMatchingShift, result.ErrorCode)
	assert.Equal(t, calculation.ShiftMatchNone, result.MatchedBy)
}

// ============================================================================
// Group 5: Alternative Plan Search
// ============================================================================

func TestDetectShift_AlternativePlan_FirstMatches(t *testing.T) {
	originalID := uuid.New()
	altID1 := uuid.New()

	assignedPlan := &calculation.ShiftDetectionInput{
		PlanID:             originalID,
		PlanCode:           "EARLY",
		ArriveFrom:         intPtr(360), // 06:00
		ArriveTo:           intPtr(420), // 07:00
		AlternativePlanIDs: []uuid.UUID{altID1},
	}

	altPlan1 := &calculation.ShiftDetectionInput{
		PlanID:     altID1,
		PlanCode:   "LATE",
		ArriveFrom: intPtr(480), // 08:00
		ArriveTo:   intPtr(540), // 09:00
	}

	loader := newMockLoader()
	loader.addPlan(altPlan1)

	detector := calculation.NewShiftDetector(loader)
	result := detector.DetectShift(assignedPlan, intPtr(500), intPtr(1020))

	assert.Equal(t, altID1, result.MatchedPlanID)
	assert.Equal(t, "LATE", result.MatchedPlanCode)
	assert.False(t, result.IsOriginalPlan)
	assert.Equal(t, calculation.ShiftMatchArrival, result.MatchedBy)
	assert.False(t, result.HasError)
}

func TestDetectShift_AlternativePlan_SecondMatches(t *testing.T) {
	originalID := uuid.New()
	altID1 := uuid.New()
	altID2 := uuid.New()

	assignedPlan := &calculation.ShiftDetectionInput{
		PlanID:             originalID,
		PlanCode:           "EARLY",
		ArriveFrom:         intPtr(360), // 06:00
		ArriveTo:           intPtr(420), // 07:00
		AlternativePlanIDs: []uuid.UUID{altID1, altID2},
	}

	altPlan1 := &calculation.ShiftDetectionInput{
		PlanID:     altID1,
		PlanCode:   "MID",
		ArriveFrom: intPtr(420), // 07:00
		ArriveTo:   intPtr(480), // 08:00
	}

	altPlan2 := &calculation.ShiftDetectionInput{
		PlanID:     altID2,
		PlanCode:   "LATE",
		ArriveFrom: intPtr(480), // 08:00
		ArriveTo:   intPtr(540), // 09:00
	}

	loader := newMockLoader()
	loader.addPlan(altPlan1)
	loader.addPlan(altPlan2)

	detector := calculation.NewShiftDetector(loader)
	result := detector.DetectShift(assignedPlan, intPtr(500), intPtr(1020))

	assert.Equal(t, altID2, result.MatchedPlanID)
	assert.Equal(t, "LATE", result.MatchedPlanCode)
	assert.False(t, result.IsOriginalPlan)
	assert.Equal(t, calculation.ShiftMatchArrival, result.MatchedBy)
	assert.False(t, result.HasError)
}

func TestDetectShift_AlternativePlan_SixthMatches(t *testing.T) {
	originalID := uuid.New()
	altIDs := make([]uuid.UUID, 6)
	for i := range altIDs {
		altIDs[i] = uuid.New()
	}

	assignedPlan := &calculation.ShiftDetectionInput{
		PlanID:             originalID,
		PlanCode:           "ORIGINAL",
		ArriveFrom:         intPtr(360), // 06:00
		ArriveTo:           intPtr(420), // 07:00
		AlternativePlanIDs: altIDs,
	}

	loader := newMockLoader()

	// Add all alternative plans, but only the 6th one matches
	for i := 0; i < 6; i++ {
		var from, to int
		if i == 5 { // 6th plan matches
			from = 540 // 09:00
			to = 600   // 10:00
		} else {
			from = 0
			to = 60
		}
		loader.addPlan(&calculation.ShiftDetectionInput{
			PlanID:     altIDs[i],
			PlanCode:   "ALT" + string(rune('1'+i)),
			ArriveFrom: intPtr(from),
			ArriveTo:   intPtr(to),
		})
	}

	detector := calculation.NewShiftDetector(loader)
	result := detector.DetectShift(assignedPlan, intPtr(570), intPtr(1020))

	assert.Equal(t, altIDs[5], result.MatchedPlanID)
	assert.Equal(t, "ALT6", result.MatchedPlanCode)
	assert.False(t, result.IsOriginalPlan)
	assert.False(t, result.HasError)
}

func TestDetectShift_AlternativePlan_NoneMatch(t *testing.T) {
	originalID := uuid.New()
	altID1 := uuid.New()
	altID2 := uuid.New()

	assignedPlan := &calculation.ShiftDetectionInput{
		PlanID:             originalID,
		PlanCode:           "ORIGINAL",
		ArriveFrom:         intPtr(360), // 06:00
		ArriveTo:           intPtr(420), // 07:00
		AlternativePlanIDs: []uuid.UUID{altID1, altID2},
	}

	altPlan1 := &calculation.ShiftDetectionInput{
		PlanID:     altID1,
		PlanCode:   "ALT1",
		ArriveFrom: intPtr(420), // 07:00
		ArriveTo:   intPtr(480), // 08:00
	}

	altPlan2 := &calculation.ShiftDetectionInput{
		PlanID:     altID2,
		PlanCode:   "ALT2",
		ArriveFrom: intPtr(480), // 08:00
		ArriveTo:   intPtr(540), // 09:00
	}

	loader := newMockLoader()
	loader.addPlan(altPlan1)
	loader.addPlan(altPlan2)

	detector := calculation.NewShiftDetector(loader)
	// Arrival at 10:00 - doesn't match any plan
	result := detector.DetectShift(assignedPlan, intPtr(600), intPtr(1020))

	assert.Equal(t, originalID, result.MatchedPlanID)
	assert.Equal(t, "ORIGINAL", result.MatchedPlanCode)
	assert.True(t, result.IsOriginalPlan)
	assert.True(t, result.HasError)
	assert.Equal(t, calculation.ErrCodeNoMatchingShift, result.ErrorCode)
}

func TestDetectShift_AlternativePlan_PlanNotFound(t *testing.T) {
	originalID := uuid.New()
	altID1 := uuid.New() // This ID won't be in the loader

	assignedPlan := &calculation.ShiftDetectionInput{
		PlanID:             originalID,
		PlanCode:           "ORIGINAL",
		ArriveFrom:         intPtr(360), // 06:00
		ArriveTo:           intPtr(420), // 07:00
		AlternativePlanIDs: []uuid.UUID{altID1},
	}

	loader := newMockLoader() // Empty loader

	detector := calculation.NewShiftDetector(loader)
	result := detector.DetectShift(assignedPlan, intPtr(500), intPtr(1020))

	// Should fall back to original plan with error since alt plan not found
	assert.Equal(t, originalID, result.MatchedPlanID)
	assert.True(t, result.IsOriginalPlan)
	assert.True(t, result.HasError)
	assert.Equal(t, calculation.ErrCodeNoMatchingShift, result.ErrorCode)
}

func TestDetectShift_AlternativePlan_NilLoader(t *testing.T) {
	originalID := uuid.New()
	altID1 := uuid.New()

	assignedPlan := &calculation.ShiftDetectionInput{
		PlanID:             originalID,
		PlanCode:           "ORIGINAL",
		ArriveFrom:         intPtr(360), // 06:00
		ArriveTo:           intPtr(420), // 07:00
		AlternativePlanIDs: []uuid.UUID{altID1},
	}

	detector := calculation.NewShiftDetector(nil)
	result := detector.DetectShift(assignedPlan, intPtr(500), intPtr(1020))

	// Should fall back to original plan with error since no loader
	assert.Equal(t, originalID, result.MatchedPlanID)
	assert.True(t, result.IsOriginalPlan)
	assert.True(t, result.HasError)
	assert.Equal(t, calculation.ErrCodeNoMatchingShift, result.ErrorCode)
}

func TestDetectShift_AlternativePlan_EmptyAlternatives(t *testing.T) {
	originalID := uuid.New()

	assignedPlan := &calculation.ShiftDetectionInput{
		PlanID:             originalID,
		PlanCode:           "ORIGINAL",
		ArriveFrom:         intPtr(360),
		ArriveTo:           intPtr(420),
		AlternativePlanIDs: []uuid.UUID{}, // Empty
	}

	loader := newMockLoader()
	detector := calculation.NewShiftDetector(loader)
	result := detector.DetectShift(assignedPlan, intPtr(500), intPtr(1020))

	assert.Equal(t, originalID, result.MatchedPlanID)
	assert.True(t, result.IsOriginalPlan)
	assert.True(t, result.HasError)
	assert.Equal(t, calculation.ErrCodeNoMatchingShift, result.ErrorCode)
}

// ============================================================================
// Group 6: Error Handling
// ============================================================================

func TestDetectShift_NoMatch_ReturnsError(t *testing.T) {
	planID := uuid.New()
	assignedPlan := &calculation.ShiftDetectionInput{
		PlanID:     planID,
		PlanCode:   "EARLY",
		ArriveFrom: intPtr(360),
		ArriveTo:   intPtr(420),
	}

	detector := calculation.NewShiftDetector(nil)
	result := detector.DetectShift(assignedPlan, intPtr(500), intPtr(1020))

	assert.True(t, result.HasError)
}

func TestDetectShift_NoMatch_ReturnsOriginalPlan(t *testing.T) {
	planID := uuid.New()
	assignedPlan := &calculation.ShiftDetectionInput{
		PlanID:     planID,
		PlanCode:   "ORIGINAL",
		ArriveFrom: intPtr(360),
		ArriveTo:   intPtr(420),
	}

	detector := calculation.NewShiftDetector(nil)
	result := detector.DetectShift(assignedPlan, intPtr(500), intPtr(1020))

	assert.Equal(t, planID, result.MatchedPlanID)
	assert.Equal(t, "ORIGINAL", result.MatchedPlanCode)
	assert.True(t, result.IsOriginalPlan)
}

func TestDetectShift_NoMatch_ErrorCode(t *testing.T) {
	planID := uuid.New()
	assignedPlan := &calculation.ShiftDetectionInput{
		PlanID:     planID,
		PlanCode:   "EARLY",
		ArriveFrom: intPtr(360),
		ArriveTo:   intPtr(420),
	}

	detector := calculation.NewShiftDetector(nil)
	result := detector.DetectShift(assignedPlan, intPtr(500), intPtr(1020))

	assert.Equal(t, calculation.ErrCodeNoMatchingShift, result.ErrorCode)
	assert.True(t, calculation.IsError(result.ErrorCode))
}

// ============================================================================
// Group 7: Edge Cases
// ============================================================================

func TestDetectShift_MidnightBoundary(t *testing.T) {
	planID := uuid.New()
	assignedPlan := &calculation.ShiftDetectionInput{
		PlanID:     planID,
		PlanCode:   "NIGHT",
		ArriveFrom: intPtr(0),    // Midnight
		ArriveTo:   intPtr(60),   // 01:00
		DepartFrom: intPtr(1380), // 23:00
		DepartTo:   intPtr(1440), // 24:00 (end of day)
	}

	tests := []struct {
		name          string
		firstArrival  *int
		lastDeparture *int
		wantMatch     bool
	}{
		{"at midnight start", intPtr(0), intPtr(1440), true},
		{"at 01:00 and 23:00", intPtr(60), intPtr(1380), true},
		{"outside both windows", intPtr(120), intPtr(1200), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			detector := calculation.NewShiftDetector(nil)
			result := detector.DetectShift(assignedPlan, tt.firstArrival, tt.lastDeparture)

			if tt.wantMatch {
				assert.False(t, result.HasError)
				assert.Equal(t, calculation.ShiftMatchBoth, result.MatchedBy)
			} else {
				assert.True(t, result.HasError)
			}
		})
	}
}

func TestDetectShift_OriginalPlanMatchesFirst(t *testing.T) {
	// Even if alternatives would match, if original matches first, use original
	originalID := uuid.New()
	altID := uuid.New()

	assignedPlan := &calculation.ShiftDetectionInput{
		PlanID:             originalID,
		PlanCode:           "ORIGINAL",
		ArriveFrom:         intPtr(360),
		ArriveTo:           intPtr(540),
		AlternativePlanIDs: []uuid.UUID{altID},
	}

	altPlan := &calculation.ShiftDetectionInput{
		PlanID:     altID,
		PlanCode:   "ALT",
		ArriveFrom: intPtr(360),
		ArriveTo:   intPtr(540),
	}

	loader := newMockLoader()
	loader.addPlan(altPlan)

	detector := calculation.NewShiftDetector(loader)
	result := detector.DetectShift(assignedPlan, intPtr(420), intPtr(1020))

	// Should match original plan first
	assert.Equal(t, originalID, result.MatchedPlanID)
	assert.True(t, result.IsOriginalPlan)
	assert.False(t, result.HasError)
}

// ============================================================================
// Group 8: Validation Function
// ============================================================================

func TestValidateShiftDetectionConfig_NilInput(t *testing.T) {
	errors := calculation.ValidateShiftDetectionConfig(nil)
	assert.Nil(t, errors)
}

func TestValidateShiftDetectionConfig_Valid(t *testing.T) {
	input := &calculation.ShiftDetectionInput{
		PlanID:     uuid.New(),
		PlanCode:   "VALID",
		ArriveFrom: intPtr(360),
		ArriveTo:   intPtr(480),
		DepartFrom: intPtr(960),
		DepartTo:   intPtr(1080),
	}

	errors := calculation.ValidateShiftDetectionConfig(input)
	assert.Empty(t, errors)
}

func TestValidateShiftDetectionConfig_NoWindows(t *testing.T) {
	input := &calculation.ShiftDetectionInput{
		PlanID:   uuid.New(),
		PlanCode: "NOWIN",
	}

	errors := calculation.ValidateShiftDetectionConfig(input)
	assert.Empty(t, errors)
}

func TestValidateShiftDetectionConfig_ArrivalFromOnly(t *testing.T) {
	input := &calculation.ShiftDetectionInput{
		PlanID:     uuid.New(),
		PlanCode:   "INVALID",
		ArriveFrom: intPtr(360),
	}

	errors := calculation.ValidateShiftDetectionConfig(input)
	assert.Len(t, errors, 1)
	assert.Contains(t, errors[0], "shift_detect_arrive_from and shift_detect_arrive_to must be set together")
}

func TestValidateShiftDetectionConfig_ArrivalToOnly(t *testing.T) {
	input := &calculation.ShiftDetectionInput{
		PlanID:   uuid.New(),
		PlanCode: "INVALID",
		ArriveTo: intPtr(480),
	}

	errors := calculation.ValidateShiftDetectionConfig(input)
	assert.Len(t, errors, 1)
	assert.Contains(t, errors[0], "shift_detect_arrive_from and shift_detect_arrive_to must be set together")
}

func TestValidateShiftDetectionConfig_ArrivalFromGreaterThanTo(t *testing.T) {
	input := &calculation.ShiftDetectionInput{
		PlanID:     uuid.New(),
		PlanCode:   "INVALID",
		ArriveFrom: intPtr(500),
		ArriveTo:   intPtr(400),
	}

	errors := calculation.ValidateShiftDetectionConfig(input)
	assert.Len(t, errors, 1)
	assert.Contains(t, errors[0], "shift_detect_arrive_from must be <= shift_detect_arrive_to")
}

func TestValidateShiftDetectionConfig_DepartFromOnly(t *testing.T) {
	input := &calculation.ShiftDetectionInput{
		PlanID:     uuid.New(),
		PlanCode:   "INVALID",
		DepartFrom: intPtr(960),
	}

	errors := calculation.ValidateShiftDetectionConfig(input)
	assert.Len(t, errors, 1)
	assert.Contains(t, errors[0], "shift_detect_depart_from and shift_detect_depart_to must be set together")
}

func TestValidateShiftDetectionConfig_DepartToOnly(t *testing.T) {
	input := &calculation.ShiftDetectionInput{
		PlanID:   uuid.New(),
		PlanCode: "INVALID",
		DepartTo: intPtr(1080),
	}

	errors := calculation.ValidateShiftDetectionConfig(input)
	assert.Len(t, errors, 1)
	assert.Contains(t, errors[0], "shift_detect_depart_from and shift_detect_depart_to must be set together")
}

func TestValidateShiftDetectionConfig_DepartFromGreaterThanTo(t *testing.T) {
	input := &calculation.ShiftDetectionInput{
		PlanID:     uuid.New(),
		PlanCode:   "INVALID",
		DepartFrom: intPtr(1100),
		DepartTo:   intPtr(1000),
	}

	errors := calculation.ValidateShiftDetectionConfig(input)
	assert.Len(t, errors, 1)
	assert.Contains(t, errors[0], "shift_detect_depart_from must be <= shift_detect_depart_to")
}

func TestValidateShiftDetectionConfig_InvalidTimeRange_Negative(t *testing.T) {
	input := &calculation.ShiftDetectionInput{
		PlanID:     uuid.New(),
		PlanCode:   "INVALID",
		ArriveFrom: intPtr(-10),
		ArriveTo:   intPtr(480),
	}

	errors := calculation.ValidateShiftDetectionConfig(input)
	assert.Len(t, errors, 1)
	assert.Contains(t, errors[0], "shift_detect_arrive_from must be between 0 and 1440")
}

func TestValidateShiftDetectionConfig_InvalidTimeRange_Over1440(t *testing.T) {
	input := &calculation.ShiftDetectionInput{
		PlanID:     uuid.New(),
		PlanCode:   "INVALID",
		DepartFrom: intPtr(960),
		DepartTo:   intPtr(1500),
	}

	errors := calculation.ValidateShiftDetectionConfig(input)
	assert.Len(t, errors, 1)
	assert.Contains(t, errors[0], "shift_detect_depart_to must be between 0 and 1440")
}

func TestValidateShiftDetectionConfig_MultipleErrors(t *testing.T) {
	input := &calculation.ShiftDetectionInput{
		PlanID:     uuid.New(),
		PlanCode:   "INVALID",
		ArriveFrom: intPtr(500),
		ArriveTo:   intPtr(400),  // From > To (1 error)
		DepartFrom: intPtr(-10),  // Invalid (1 error)
		DepartTo:   intPtr(1500), // Invalid (1 error)
		// Note: DepartFrom (-10) is NOT > DepartTo (1500), so no from>to error for depart
	}

	errors := calculation.ValidateShiftDetectionConfig(input)
	assert.Len(t, errors, 3)
}

func TestValidateShiftDetectionConfig_BoundaryValues(t *testing.T) {
	// 0 and 1440 should be valid
	input := &calculation.ShiftDetectionInput{
		PlanID:     uuid.New(),
		PlanCode:   "BOUNDARY",
		ArriveFrom: intPtr(0),
		ArriveTo:   intPtr(1440),
		DepartFrom: intPtr(0),
		DepartTo:   intPtr(1440),
	}

	errors := calculation.ValidateShiftDetectionConfig(input)
	assert.Empty(t, errors)
}
