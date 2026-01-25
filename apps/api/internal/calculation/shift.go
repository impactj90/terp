package calculation

import (
	"github.com/google/uuid"
)

// ShiftMatchType indicates how a shift was matched.
type ShiftMatchType string

const (
	// ShiftMatchNone means no shift detection was configured or no match found.
	ShiftMatchNone ShiftMatchType = "none"
	// ShiftMatchArrival means the shift matched by arrival time window.
	ShiftMatchArrival ShiftMatchType = "arrival"
	// ShiftMatchDeparture means the shift matched by departure time window.
	ShiftMatchDeparture ShiftMatchType = "departure"
	// ShiftMatchBoth means the shift matched by both arrival and departure windows.
	ShiftMatchBoth ShiftMatchType = "both"
)

// ShiftDetectionInput contains the configuration for shift detection from a day plan.
type ShiftDetectionInput struct {
	PlanID   uuid.UUID
	PlanCode string

	// Arrival window (minutes from midnight)
	ArriveFrom *int
	ArriveTo   *int

	// Departure window (minutes from midnight)
	DepartFrom *int
	DepartTo   *int

	// Alternative plan IDs (up to 6)
	AlternativePlanIDs []uuid.UUID
}

// ShiftDetectionResult contains the outcome of shift detection.
type ShiftDetectionResult struct {
	// MatchedPlanID is the ID of the matched day plan.
	MatchedPlanID uuid.UUID
	// MatchedPlanCode is the code of the matched day plan.
	MatchedPlanCode string
	// IsOriginalPlan is true if the original assigned plan was used.
	IsOriginalPlan bool
	// MatchedBy indicates which time window(s) matched.
	MatchedBy ShiftMatchType
	// HasError is true if no matching plan was found.
	HasError bool
	// ErrorCode is set when HasError is true.
	ErrorCode string
}

// DayPlanLoader provides day plan lookup capability for shift detection.
// This interface allows the shift detector to be independent of the repository layer.
type DayPlanLoader interface {
	// LoadShiftDetectionInput loads shift detection configuration for a day plan.
	// Returns nil if the plan is not found.
	LoadShiftDetectionInput(id uuid.UUID) *ShiftDetectionInput
}

// ShiftDetector performs automatic shift detection based on booking times.
type ShiftDetector struct {
	loader DayPlanLoader
}

// NewShiftDetector creates a new shift detector with the given day plan loader.
func NewShiftDetector(loader DayPlanLoader) *ShiftDetector {
	return &ShiftDetector{loader: loader}
}

// isInTimeWindow checks if a time falls within the given window.
// Returns false if either boundary is nil.
func isInTimeWindow(time int, from, to *int) bool {
	if from == nil || to == nil {
		return false
	}
	return time >= *from && time <= *to
}

// hasArrivalWindow returns true if arrival shift detection is configured.
func hasArrivalWindow(input *ShiftDetectionInput) bool {
	return input.ArriveFrom != nil && input.ArriveTo != nil
}

// hasDepartureWindow returns true if departure shift detection is configured.
func hasDepartureWindow(input *ShiftDetectionInput) bool {
	return input.DepartFrom != nil && input.DepartTo != nil
}

// matchesPlan checks if the booking times match the given plan's shift detection windows.
// Returns the match type if successful, ShiftMatchNone otherwise.
func matchesPlan(input *ShiftDetectionInput, firstArrival, lastDeparture *int) ShiftMatchType {
	hasArrival := hasArrivalWindow(input)
	hasDeparture := hasDepartureWindow(input)

	// No shift detection configured
	if !hasArrival && !hasDeparture {
		return ShiftMatchNone
	}

	arrivalMatches := false
	departureMatches := false

	// Check arrival window if configured
	if hasArrival && firstArrival != nil {
		arrivalMatches = isInTimeWindow(*firstArrival, input.ArriveFrom, input.ArriveTo)
	}

	// Check departure window if configured
	if hasDeparture && lastDeparture != nil {
		departureMatches = isInTimeWindow(*lastDeparture, input.DepartFrom, input.DepartTo)
	}

	// Determine match type based on what was configured and what matched
	if hasArrival && hasDeparture {
		// Both windows configured - both must match
		if arrivalMatches && departureMatches {
			return ShiftMatchBoth
		}
		return ShiftMatchNone
	}

	if hasArrival {
		if arrivalMatches {
			return ShiftMatchArrival
		}
		return ShiftMatchNone
	}

	if hasDeparture {
		if departureMatches {
			return ShiftMatchDeparture
		}
		return ShiftMatchNone
	}

	return ShiftMatchNone
}

// DetectShift determines which day plan should be used based on booking times.
// It checks if the booking times match the assigned plan's shift detection windows.
// If not, it searches up to 6 alternative plans for a match.
//
// Parameters:
//   - assignedPlan: The shift detection input from the employee's assigned day plan
//   - firstArrival: First arrival time in minutes from midnight (from FindFirstCome)
//   - lastDeparture: Last departure time in minutes from midnight (from FindLastGo)
//
// Returns:
//   - ShiftDetectionResult with the matched plan or error if no match found
func (sd *ShiftDetector) DetectShift(
	assignedPlan *ShiftDetectionInput,
	firstArrival *int,
	lastDeparture *int,
) ShiftDetectionResult {
	// No assigned plan - return empty result
	if assignedPlan == nil {
		return ShiftDetectionResult{
			MatchedBy:      ShiftMatchNone,
			IsOriginalPlan: true,
		}
	}

	// No shift detection configured - use original plan
	if !hasArrivalWindow(assignedPlan) && !hasDepartureWindow(assignedPlan) {
		return ShiftDetectionResult{
			MatchedPlanID:   assignedPlan.PlanID,
			MatchedPlanCode: assignedPlan.PlanCode,
			IsOriginalPlan:  true,
			MatchedBy:       ShiftMatchNone,
		}
	}

	// No booking times to check - use original plan with no match
	if firstArrival == nil && lastDeparture == nil {
		return ShiftDetectionResult{
			MatchedPlanID:   assignedPlan.PlanID,
			MatchedPlanCode: assignedPlan.PlanCode,
			IsOriginalPlan:  true,
			MatchedBy:       ShiftMatchNone,
		}
	}

	// Check if assigned plan matches
	matchType := matchesPlan(assignedPlan, firstArrival, lastDeparture)
	if matchType != ShiftMatchNone {
		return ShiftDetectionResult{
			MatchedPlanID:   assignedPlan.PlanID,
			MatchedPlanCode: assignedPlan.PlanCode,
			IsOriginalPlan:  true,
			MatchedBy:       matchType,
		}
	}

	// Search alternative plans
	for _, altPlanID := range assignedPlan.AlternativePlanIDs {
		if sd.loader == nil {
			continue
		}

		altPlan := sd.loader.LoadShiftDetectionInput(altPlanID)
		if altPlan == nil {
			continue
		}

		matchType := matchesPlan(altPlan, firstArrival, lastDeparture)
		if matchType != ShiftMatchNone {
			return ShiftDetectionResult{
				MatchedPlanID:   altPlan.PlanID,
				MatchedPlanCode: altPlan.PlanCode,
				IsOriginalPlan:  false,
				MatchedBy:       matchType,
			}
		}
	}

	// No match found - return original plan with error
	return ShiftDetectionResult{
		MatchedPlanID:   assignedPlan.PlanID,
		MatchedPlanCode: assignedPlan.PlanCode,
		IsOriginalPlan:  true,
		MatchedBy:       ShiftMatchNone,
		HasError:        true,
		ErrorCode:       ErrCodeNoMatchingShift,
	}
}

// ValidateShiftDetectionConfig validates shift detection configuration on a day plan.
// Returns a list of validation errors (empty if valid).
func ValidateShiftDetectionConfig(input *ShiftDetectionInput) []string {
	if input == nil {
		return nil
	}

	var errors []string

	// Validate arrival window
	if input.ArriveFrom != nil && input.ArriveTo != nil {
		if *input.ArriveFrom < 0 || *input.ArriveFrom > 1440 {
			errors = append(errors, "shift_detect_arrive_from must be between 0 and 1440")
		}
		if *input.ArriveTo < 0 || *input.ArriveTo > 1440 {
			errors = append(errors, "shift_detect_arrive_to must be between 0 and 1440")
		}
		if *input.ArriveFrom > *input.ArriveTo {
			errors = append(errors, "shift_detect_arrive_from must be <= shift_detect_arrive_to")
		}
	} else if (input.ArriveFrom != nil) != (input.ArriveTo != nil) {
		errors = append(errors, "both shift_detect_arrive_from and shift_detect_arrive_to must be set together")
	}

	// Validate departure window
	if input.DepartFrom != nil && input.DepartTo != nil {
		if *input.DepartFrom < 0 || *input.DepartFrom > 1440 {
			errors = append(errors, "shift_detect_depart_from must be between 0 and 1440")
		}
		if *input.DepartTo < 0 || *input.DepartTo > 1440 {
			errors = append(errors, "shift_detect_depart_to must be between 0 and 1440")
		}
		if *input.DepartFrom > *input.DepartTo {
			errors = append(errors, "shift_detect_depart_from must be <= shift_detect_depart_to")
		}
	} else if (input.DepartFrom != nil) != (input.DepartTo != nil) {
		errors = append(errors, "both shift_detect_depart_from and shift_detect_depart_to must be set together")
	}

	return errors
}
