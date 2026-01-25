package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

// Monthly calculation service errors.
var (
	ErrFutureMonth = errors.New("cannot calculate future month")
)

// monthlyEvalServiceForCalc defines the interface for monthly evaluation operations.
type monthlyEvalServiceForCalc interface {
	RecalculateMonth(ctx context.Context, employeeID uuid.UUID, year, month int) error
	GetMonthSummary(ctx context.Context, employeeID uuid.UUID, year, month int) (*MonthSummary, error)
}

// monthlyValueRepoForCalc defines the interface for monthly value lookup.
type monthlyValueRepoForCalc interface {
	GetByEmployeeMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error)
}

// MonthlyCalcError represents a single monthly calculation failure.
type MonthlyCalcError struct {
	EmployeeID uuid.UUID
	Year       int
	Month      int
	Error      string
}

// MonthlyCalcResult contains the outcome of a monthly calculation operation.
type MonthlyCalcResult struct {
	ProcessedMonths int
	SkippedMonths   int // Months skipped due to being closed
	FailedMonths    int
	Errors          []MonthlyCalcError
}

// MonthlyCalcService handles batch and cascading monthly calculations.
type MonthlyCalcService struct {
	evalService      monthlyEvalServiceForCalc
	monthlyValueRepo monthlyValueRepoForCalc
}

// NewMonthlyCalcService creates a new MonthlyCalcService instance.
func NewMonthlyCalcService(
	evalService monthlyEvalServiceForCalc,
	monthlyValueRepo monthlyValueRepoForCalc,
) *MonthlyCalcService {
	return &MonthlyCalcService{
		evalService:      evalService,
		monthlyValueRepo: monthlyValueRepo,
	}
}

// CalculateMonth calculates monthly values for a single employee and month.
// Returns the calculated MonthlyValue or an error.
// Returns ErrMonthClosed if the month is closed (via MonthlyEvalService).
// Returns ErrFutureMonth if attempting to calculate a month after the current month.
func (s *MonthlyCalcService) CalculateMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error) {
	// Validate not future month
	now := time.Now()
	if year > now.Year() || (year == now.Year() && month > int(now.Month())) {
		return nil, ErrFutureMonth
	}

	// Delegate to eval service for actual calculation
	err := s.evalService.RecalculateMonth(ctx, employeeID, year, month)
	if err != nil {
		return nil, err
	}

	// Retrieve the calculated value
	mv, err := s.monthlyValueRepo.GetByEmployeeMonth(ctx, employeeID, year, month)
	if err != nil {
		return nil, err
	}

	return mv, nil
}

// CalculateMonthBatch calculates monthly values for multiple employees for the same month.
// Continues processing on individual errors and aggregates results.
func (s *MonthlyCalcService) CalculateMonthBatch(ctx context.Context, employeeIDs []uuid.UUID, year, month int) *MonthlyCalcResult {
	result := &MonthlyCalcResult{
		Errors: make([]MonthlyCalcError, 0),
	}

	// Validate not future month
	now := time.Now()
	if year > now.Year() || (year == now.Year() && month > int(now.Month())) {
		// All employees fail with same error
		for _, empID := range employeeIDs {
			result.FailedMonths++
			result.Errors = append(result.Errors, MonthlyCalcError{
				EmployeeID: empID,
				Year:       year,
				Month:      month,
				Error:      ErrFutureMonth.Error(),
			})
		}
		return result
	}

	for _, empID := range employeeIDs {
		err := s.evalService.RecalculateMonth(ctx, empID, year, month)
		if err != nil {
			if errors.Is(err, ErrMonthClosed) {
				result.SkippedMonths++
			} else {
				result.FailedMonths++
				result.Errors = append(result.Errors, MonthlyCalcError{
					EmployeeID: empID,
					Year:       year,
					Month:      month,
					Error:      err.Error(),
				})
			}
			continue
		}
		result.ProcessedMonths++
	}

	return result
}

// RecalculateFromMonth recalculates monthly values starting from a given month
// through the current month. This is used when a change in an earlier month
// affects the flextime carryover chain for subsequent months.
//
// Behavior:
// - Skips closed months silently (continues with next month)
// - Stops at the current month (does not calculate future months)
// - Properly handles year boundaries (December -> January)
// - Returns aggregated results for all processed months
func (s *MonthlyCalcService) RecalculateFromMonth(ctx context.Context, employeeID uuid.UUID, startYear, startMonth int) *MonthlyCalcResult {
	result := &MonthlyCalcResult{
		Errors: make([]MonthlyCalcError, 0),
	}

	currentYear, currentMonth := startYear, startMonth
	now := time.Now()

	for {
		// Stop if we've passed the current month
		if currentYear > now.Year() || (currentYear == now.Year() && currentMonth > int(now.Month())) {
			break
		}

		// Attempt recalculation
		err := s.evalService.RecalculateMonth(ctx, employeeID, currentYear, currentMonth)
		if err != nil {
			if errors.Is(err, ErrMonthClosed) {
				// Skip closed months and continue cascade
				result.SkippedMonths++
			} else {
				result.FailedMonths++
				result.Errors = append(result.Errors, MonthlyCalcError{
					EmployeeID: employeeID,
					Year:       currentYear,
					Month:      currentMonth,
					Error:      err.Error(),
				})
				// Continue cascade even on failure to process remaining months
			}
		} else {
			result.ProcessedMonths++
		}

		// Move to next month
		currentMonth++
		if currentMonth > 12 {
			currentMonth = 1
			currentYear++
		}
	}

	return result
}

// RecalculateFromMonthBatch recalculates from a starting month for multiple employees.
// Aggregates results from all employees.
func (s *MonthlyCalcService) RecalculateFromMonthBatch(ctx context.Context, employeeIDs []uuid.UUID, startYear, startMonth int) *MonthlyCalcResult {
	result := &MonthlyCalcResult{
		Errors: make([]MonthlyCalcError, 0),
	}

	for _, empID := range employeeIDs {
		empResult := s.RecalculateFromMonth(ctx, empID, startYear, startMonth)
		result.ProcessedMonths += empResult.ProcessedMonths
		result.SkippedMonths += empResult.SkippedMonths
		result.FailedMonths += empResult.FailedMonths
		result.Errors = append(result.Errors, empResult.Errors...)
	}

	return result
}
