package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

// dailyCalcServiceForRecalc defines the interface for daily calculation operations.
type dailyCalcServiceForRecalc interface {
	CalculateDay(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error)
	RecalculateRange(ctx context.Context, tenantID, employeeID uuid.UUID, from, to time.Time) (int, error)
}

// employeeRepositoryForRecalc defines the interface for employee lookup.
type employeeRepositoryForRecalc interface {
	List(ctx context.Context, filter repository.EmployeeFilter) ([]model.Employee, int64, error)
}

// RecalcError represents a single recalculation failure.
type RecalcError struct {
	EmployeeID uuid.UUID
	Date       time.Time
	Error      string
}

// RecalcResult contains the outcome of a recalculation operation.
type RecalcResult struct {
	ProcessedDays int
	FailedDays    int
	Errors        []RecalcError
}

// monthlyCalcForRecalc defines the interface for monthly calculation after daily recalc.
type monthlyCalcForRecalc interface {
	CalculateMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error)
}

// RecalcService triggers recalculation for employees.
type RecalcService struct {
	dailyCalc    dailyCalcServiceForRecalc
	employeeRepo employeeRepositoryForRecalc
	monthlyCalc  monthlyCalcForRecalc
}

// NewRecalcService creates a new RecalcService instance.
func NewRecalcService(
	dailyCalc dailyCalcServiceForRecalc,
	employeeRepo employeeRepositoryForRecalc,
) *RecalcService {
	return &RecalcService{
		dailyCalc:    dailyCalc,
		employeeRepo: employeeRepo,
	}
}

// SetMonthlyCalcService sets the monthly calculation service for automatic
// monthly recalculation after daily values change.
func (s *RecalcService) SetMonthlyCalcService(monthlyCalc monthlyCalcForRecalc) {
	s.monthlyCalc = monthlyCalc
}

// TriggerRecalc recalculates a single day for one employee.
// After daily calculation, also recalculates the affected month so that
// monthly evaluation values (flextime balance, totals) stay in sync.
func (s *RecalcService) TriggerRecalc(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*RecalcResult, error) {
	_, err := s.dailyCalc.CalculateDay(ctx, tenantID, employeeID, date)
	if err != nil {
		return &RecalcResult{
			ProcessedDays: 0,
			FailedDays:    1,
			Errors: []RecalcError{
				{EmployeeID: employeeID, Date: date, Error: err.Error()},
			},
		}, err
	}

	// Recalculate the affected month so monthly values reflect the daily change
	if s.monthlyCalc != nil {
		_, _ = s.monthlyCalc.CalculateMonth(ctx, employeeID, date.Year(), int(date.Month()))
	}

	return &RecalcResult{ProcessedDays: 1, FailedDays: 0}, nil
}

// TriggerRecalcRange recalculates a date range for one employee.
func (s *RecalcService) TriggerRecalcRange(ctx context.Context, tenantID, employeeID uuid.UUID, from, to time.Time) (*RecalcResult, error) {
	count, err := s.dailyCalc.RecalculateRange(ctx, tenantID, employeeID, from, to)
	if err != nil {
		// Calculate which day failed based on count
		failedDate := from.AddDate(0, 0, count)
		totalDays := int(to.Sub(from).Hours()/24) + 1
		return &RecalcResult{
			ProcessedDays: count,
			FailedDays:    totalDays - count,
			Errors: []RecalcError{
				{EmployeeID: employeeID, Date: failedDate, Error: err.Error()},
			},
		}, err
	}
	return &RecalcResult{ProcessedDays: count, FailedDays: 0}, nil
}

// TriggerRecalcBatch recalculates a date range for multiple employees.
// Continues processing on individual errors.
func (s *RecalcService) TriggerRecalcBatch(ctx context.Context, tenantID uuid.UUID, employeeIDs []uuid.UUID, from, to time.Time) *RecalcResult {
	result := &RecalcResult{}

	for _, empID := range employeeIDs {
		empResult, err := s.TriggerRecalcRange(ctx, tenantID, empID, from, to)
		result.ProcessedDays += empResult.ProcessedDays
		result.FailedDays += empResult.FailedDays
		if err != nil {
			result.Errors = append(result.Errors, empResult.Errors...)
		}
	}

	return result
}

// TriggerRecalcAll recalculates a date range for all active employees in a tenant.
func (s *RecalcService) TriggerRecalcAll(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (*RecalcResult, error) {
	// Get all active employees
	isActive := true
	filter := repository.EmployeeFilter{
		TenantID: tenantID,
		IsActive: &isActive,
	}

	employees, _, err := s.employeeRepo.List(ctx, filter)
	if err != nil {
		return nil, err
	}

	// Extract employee IDs
	employeeIDs := make([]uuid.UUID, len(employees))
	for i, emp := range employees {
		employeeIDs[i] = emp.ID
	}

	return s.TriggerRecalcBatch(ctx, tenantID, employeeIDs, from, to), nil
}
