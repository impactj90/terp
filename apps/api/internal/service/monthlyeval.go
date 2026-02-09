package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/internal/calculation"
	"github.com/tolga/terp/internal/model"
)

// Monthly evaluation service errors.
// Note: ErrMonthClosed is defined in booking.go and shared across services.
var (
	ErrMonthNotClosed          = errors.New("month is not closed")
	ErrInvalidMonth            = errors.New("invalid month")
	ErrInvalidYearMonth        = errors.New("invalid year or month")
	ErrMonthlyValueNotFound    = errors.New("monthly value not found")
	ErrEmployeeNotFoundForEval = errors.New("employee not found")
)

// monthlyValueRepoForMonthlyEval defines the interface for monthly value data access.
type monthlyValueRepoForMonthlyEval interface {
	GetByEmployeeMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error)
	GetPreviousMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error)
	Upsert(ctx context.Context, mv *model.MonthlyValue) error
	ListByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) ([]model.MonthlyValue, error)
	CloseMonth(ctx context.Context, employeeID uuid.UUID, year, month int, closedBy uuid.UUID) error
	ReopenMonth(ctx context.Context, employeeID uuid.UUID, year, month int, reopenedBy uuid.UUID) error
}

// dailyValueRepoForMonthlyEval defines the interface for daily value aggregation.
type dailyValueRepoForMonthlyEval interface {
	GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.DailyValue, error)
}

// absenceDayRepoForMonthlyEval defines the interface for absence counting.
type absenceDayRepoForMonthlyEval interface {
	GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.AbsenceDay, error)
}

// employeeRepoForMonthlyEval defines the interface for employee data.
type employeeRepoForMonthlyEval interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error)
}

// tariffRepoForMonthlyEval defines the interface for tariff data access.
type tariffRepoForMonthlyEval interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.Tariff, error)
}

// MonthSummary represents monthly aggregation results for an employee.
type MonthSummary struct {
	EmployeeID uuid.UUID
	Year       int
	Month      int

	// Time totals (minutes)
	TotalGrossTime  int
	TotalNetTime    int
	TotalTargetTime int
	TotalOvertime   int
	TotalUndertime  int
	TotalBreakTime  int

	// Flextime tracking (minutes)
	FlextimeStart     int
	FlextimeChange    int
	FlextimeEnd       int
	FlextimeCarryover int

	// Absence summary
	VacationTaken    decimal.Decimal
	SickDays         int
	OtherAbsenceDays int

	// Work summary
	WorkDays       int
	DaysWithErrors int

	// Status
	IsClosed   bool
	ClosedAt   *time.Time
	ClosedBy   *uuid.UUID
	ReopenedAt *time.Time
	ReopenedBy *uuid.UUID

	// Warnings from calculation
	Warnings []string
}

// MonthlyEvalService handles monthly evaluation business logic.
type MonthlyEvalService struct {
	monthlyValueRepo monthlyValueRepoForMonthlyEval
	dailyValueRepo   dailyValueRepoForMonthlyEval
	absenceDayRepo   absenceDayRepoForMonthlyEval
	employeeRepo     employeeRepoForMonthlyEval
	tariffRepo       tariffRepoForMonthlyEval
}

// NewMonthlyEvalService creates a new MonthlyEvalService instance.
func NewMonthlyEvalService(
	monthlyValueRepo monthlyValueRepoForMonthlyEval,
	dailyValueRepo dailyValueRepoForMonthlyEval,
	absenceDayRepo absenceDayRepoForMonthlyEval,
	employeeRepo employeeRepoForMonthlyEval,
	tariffRepo tariffRepoForMonthlyEval,
) *MonthlyEvalService {
	return &MonthlyEvalService{
		monthlyValueRepo: monthlyValueRepo,
		dailyValueRepo:   dailyValueRepo,
		absenceDayRepo:   absenceDayRepo,
		employeeRepo:     employeeRepo,
		tariffRepo:       tariffRepo,
	}
}

// validateYearMonth validates year and month parameters.
func validateYearMonth(year, month int) error {
	if year < 1900 || year > 2200 {
		return ErrInvalidYearMonth
	}
	if month < 1 || month > 12 {
		return ErrInvalidMonth
	}
	return nil
}

// monthDateRange returns the first and last day of a month.
func monthDateRange(year, month int) (time.Time, time.Time) {
	from := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
	to := from.AddDate(0, 1, -1) // Last day of month
	return from, to
}

// GetMonthSummary retrieves the monthly summary for an employee.
// If no persisted monthly value exists, it calculates one on-the-fly from daily values.
func (s *MonthlyEvalService) GetMonthSummary(ctx context.Context, employeeID uuid.UUID, year, month int) (*MonthSummary, error) {
	if err := validateYearMonth(year, month); err != nil {
		return nil, err
	}

	mv, err := s.monthlyValueRepo.GetByEmployeeMonth(ctx, employeeID, year, month)
	if err != nil {
		return nil, err
	}
	if mv != nil {
		return monthlyValueToSummary(mv), nil
	}

	// No persisted record — calculate on-the-fly from daily values
	return s.calculateMonthSummary(ctx, employeeID, year, month)
}

// calculateMonthSummary builds a MonthSummary from daily values without persisting.
func (s *MonthlyEvalService) calculateMonthSummary(ctx context.Context, employeeID uuid.UUID, year, month int) (*MonthSummary, error) {
	employee, err := s.employeeRepo.GetByID(ctx, employeeID)
	if err != nil {
		return nil, ErrEmployeeNotFoundForEval
	}

	from, to := monthDateRange(year, month)

	prevMonth, err := s.monthlyValueRepo.GetPreviousMonth(ctx, employeeID, year, month)
	if err != nil {
		return nil, err
	}
	previousCarryover := 0
	if prevMonth != nil {
		previousCarryover = prevMonth.FlextimeEnd
	}

	dailyValues, err := s.dailyValueRepo.GetByEmployeeDateRange(ctx, employeeID, from, to)
	if err != nil {
		return nil, err
	}

	absences, err := s.absenceDayRepo.GetByEmployeeDateRange(ctx, employeeID, from, to)
	if err != nil {
		return nil, err
	}

	var tariff *model.Tariff
	if employee.TariffID != nil {
		tariff, err = s.tariffRepo.GetByID(ctx, *employee.TariffID)
		if err != nil {
			tariff = nil
		}
	}

	calcInput := s.buildMonthlyCalcInput(dailyValues, absences, previousCarryover, tariff)
	calcOutput := calculation.CalculateMonth(calcInput)
	built := s.buildMonthlyValue(employee.TenantID, employeeID, year, month, calcOutput, previousCarryover)

	return monthlyValueToSummary(built), nil
}

// monthlyValueToSummary converts model.MonthlyValue to MonthSummary.
func monthlyValueToSummary(mv *model.MonthlyValue) *MonthSummary {
	return &MonthSummary{
		EmployeeID:        mv.EmployeeID,
		Year:              mv.Year,
		Month:             mv.Month,
		TotalGrossTime:    mv.TotalGrossTime,
		TotalNetTime:      mv.TotalNetTime,
		TotalTargetTime:   mv.TotalTargetTime,
		TotalOvertime:     mv.TotalOvertime,
		TotalUndertime:    mv.TotalUndertime,
		TotalBreakTime:    mv.TotalBreakTime,
		FlextimeStart:     mv.FlextimeStart,
		FlextimeChange:    mv.FlextimeChange,
		FlextimeEnd:       mv.FlextimeEnd,
		FlextimeCarryover: mv.FlextimeCarryover,
		VacationTaken:     mv.VacationTaken,
		SickDays:          mv.SickDays,
		OtherAbsenceDays:  mv.OtherAbsenceDays,
		WorkDays:          mv.WorkDays,
		DaysWithErrors:    mv.DaysWithErrors,
		IsClosed:          mv.IsClosed,
		ClosedAt:          mv.ClosedAt,
		ClosedBy:          mv.ClosedBy,
		ReopenedAt:        mv.ReopenedAt,
		ReopenedBy:        mv.ReopenedBy,
		Warnings:          []string{},
	}
}

// RecalculateMonth recalculates monthly aggregation from daily values.
// Returns ErrMonthClosed if the month is already closed.
func (s *MonthlyEvalService) RecalculateMonth(ctx context.Context, employeeID uuid.UUID, year, month int) error {
	if err := validateYearMonth(year, month); err != nil {
		return err
	}

	// Get employee for tenant ID
	employee, err := s.employeeRepo.GetByID(ctx, employeeID)
	if err != nil {
		return ErrEmployeeNotFoundForEval
	}

	// Check if month is closed
	existing, err := s.monthlyValueRepo.GetByEmployeeMonth(ctx, employeeID, year, month)
	if err != nil {
		return err
	}
	if existing != nil && existing.IsClosed {
		return ErrMonthClosed
	}

	// Get date range for the month
	from, to := monthDateRange(year, month)

	// Get previous month for flextime carryover
	prevMonth, err := s.monthlyValueRepo.GetPreviousMonth(ctx, employeeID, year, month)
	if err != nil {
		return err
	}
	previousCarryover := 0
	if prevMonth != nil {
		previousCarryover = prevMonth.FlextimeEnd
	}

	// Get daily values for the month
	dailyValues, err := s.dailyValueRepo.GetByEmployeeDateRange(ctx, employeeID, from, to)
	if err != nil {
		return err
	}

	// Get absences for the month
	absences, err := s.absenceDayRepo.GetByEmployeeDateRange(ctx, employeeID, from, to)
	if err != nil {
		return err
	}

	// Fetch employee's tariff for evaluation rules
	var tariff *model.Tariff
	if employee.TariffID != nil {
		tariff, err = s.tariffRepo.GetByID(ctx, *employee.TariffID)
		if err != nil {
			// Log warning but don't fail — tariff might have been deleted
			tariff = nil
		}
	}

	// Build calculation input
	calcInput := s.buildMonthlyCalcInput(dailyValues, absences, previousCarryover, tariff)

	// Run calculation
	calcOutput := calculation.CalculateMonth(calcInput)

	// Build monthly value
	mv := s.buildMonthlyValue(employee.TenantID, employeeID, year, month, calcOutput, previousCarryover)

	// Preserve close status if record exists (reopened records keep their reopen timestamp)
	if existing != nil {
		mv.ID = existing.ID
		mv.CreatedAt = existing.CreatedAt
		mv.ReopenedAt = existing.ReopenedAt
		mv.ReopenedBy = existing.ReopenedBy
	}

	// Upsert the monthly value
	return s.monthlyValueRepo.Upsert(ctx, mv)
}

// buildMonthlyCalcInput converts daily values and absences to calculation input.
func (s *MonthlyEvalService) buildMonthlyCalcInput(
	dailyValues []model.DailyValue,
	absences []model.AbsenceDay,
	previousCarryover int,
	tariff *model.Tariff,
) calculation.MonthlyCalcInput {
	// Convert daily values
	dvInputs := make([]calculation.DailyValueInput, 0, len(dailyValues))
	for _, dv := range dailyValues {
		dvInputs = append(dvInputs, calculation.DailyValueInput{
			Date:       dv.ValueDate.Format("2006-01-02"),
			GrossTime:  dv.GrossTime,
			NetTime:    dv.NetTime,
			TargetTime: dv.TargetTime,
			Overtime:   dv.Overtime,
			Undertime:  dv.Undertime,
			BreakTime:  dv.BreakTime,
			HasError:   dv.HasError,
		})
	}

	// Build absence summary
	absenceSummary := s.buildAbsenceSummary(absences)

	// Build evaluation rules from tariff
	var evaluationRules *calculation.MonthlyEvaluationInput
	if tariff != nil {
		evaluationRules = buildEvaluationRules(tariff)
	}

	return calculation.MonthlyCalcInput{
		DailyValues:       dvInputs,
		PreviousCarryover: previousCarryover,
		EvaluationRules:   evaluationRules,
		AbsenceSummary:    absenceSummary,
	}
}

// buildEvaluationRules converts tariff ZMI fields to calculation evaluation input.
// Returns nil if the tariff uses no_evaluation (default), since nil means direct 1:1 transfer.
func buildEvaluationRules(tariff *model.Tariff) *calculation.MonthlyEvaluationInput {
	creditType := tariff.GetCreditType()

	// no_evaluation = direct transfer, same as nil rules
	if creditType == model.CreditTypeNoEvaluation {
		return nil
	}

	return &calculation.MonthlyEvaluationInput{
		CreditType:          calculation.CreditType(creditType),
		FlextimeThreshold:   tariff.FlextimeThreshold,
		MaxFlextimePerMonth: tariff.MaxFlextimePerMonth,
		FlextimeCapPositive: tariff.UpperLimitAnnual,
		FlextimeCapNegative: tariff.LowerLimitAnnual,
	}
}

// buildAbsenceSummary aggregates absences by category.
func (s *MonthlyEvalService) buildAbsenceSummary(absences []model.AbsenceDay) calculation.AbsenceSummaryInput {
	var summary calculation.AbsenceSummaryInput

	for _, ad := range absences {
		// Only count approved absences
		if ad.Status != model.AbsenceStatusApproved {
			continue
		}

		// Get category from preloaded AbsenceType
		if ad.AbsenceType == nil {
			continue
		}

		switch ad.AbsenceType.Category {
		case model.AbsenceCategoryVacation:
			summary.VacationDays = summary.VacationDays.Add(ad.Duration)
		case model.AbsenceCategoryIllness:
			// Count illness days (duration can be 1 or 0.5)
			summary.SickDays += int(ad.Duration.Ceil().IntPart())
		default:
			summary.OtherAbsenceDays++
		}
	}

	return summary
}

// buildMonthlyValue creates a MonthlyValue from calculation output.
func (s *MonthlyEvalService) buildMonthlyValue(
	tenantID, employeeID uuid.UUID,
	year, month int,
	output calculation.MonthlyCalcOutput,
	_ int, // previousCarryover - not used, keeping for signature consistency
) *model.MonthlyValue {
	return &model.MonthlyValue{
		TenantID:          tenantID,
		EmployeeID:        employeeID,
		Year:              year,
		Month:             month,
		TotalGrossTime:    output.TotalGrossTime,
		TotalNetTime:      output.TotalNetTime,
		TotalTargetTime:   output.TotalTargetTime,
		TotalOvertime:     output.TotalOvertime,
		TotalUndertime:    output.TotalUndertime,
		TotalBreakTime:    output.TotalBreakTime,
		FlextimeStart:     output.FlextimeStart,
		FlextimeChange:    output.FlextimeChange,
		FlextimeEnd:       output.FlextimeEnd,
		FlextimeCarryover: output.FlextimeEnd, // Carryover for next month = this month's end balance
		VacationTaken:     output.VacationTaken,
		SickDays:          output.SickDays,
		OtherAbsenceDays:  output.OtherAbsenceDays,
		WorkDays:          output.WorkDays,
		DaysWithErrors:    output.DaysWithErrors,
	}
}

// CloseMonth marks a month as closed, preventing further modifications.
// The month must have been calculated (monthly value exists).
func (s *MonthlyEvalService) CloseMonth(ctx context.Context, employeeID uuid.UUID, year, month int, closedBy uuid.UUID) error {
	if err := validateYearMonth(year, month); err != nil {
		return err
	}

	// Check if monthly value exists
	existing, err := s.monthlyValueRepo.GetByEmployeeMonth(ctx, employeeID, year, month)
	if err != nil {
		return err
	}
	if existing == nil {
		return ErrMonthlyValueNotFound
	}

	// Check if already closed
	if existing.IsClosed {
		return ErrMonthClosed
	}

	return s.monthlyValueRepo.CloseMonth(ctx, employeeID, year, month, closedBy)
}

// ReopenMonth marks a closed month as open, allowing modifications.
func (s *MonthlyEvalService) ReopenMonth(ctx context.Context, employeeID uuid.UUID, year, month int, reopenedBy uuid.UUID) error {
	if err := validateYearMonth(year, month); err != nil {
		return err
	}

	// Check if monthly value exists
	existing, err := s.monthlyValueRepo.GetByEmployeeMonth(ctx, employeeID, year, month)
	if err != nil {
		return err
	}
	if existing == nil {
		return ErrMonthlyValueNotFound
	}

	// Check if actually closed
	if !existing.IsClosed {
		return ErrMonthNotClosed
	}

	return s.monthlyValueRepo.ReopenMonth(ctx, employeeID, year, month, reopenedBy)
}

// GetYearOverview retrieves all monthly summaries for an employee in a year.
// Returns empty slice if no months have been calculated.
func (s *MonthlyEvalService) GetYearOverview(ctx context.Context, employeeID uuid.UUID, year int) ([]MonthSummary, error) {
	if year < 1900 || year > 2200 {
		return nil, ErrInvalidYearMonth
	}

	values, err := s.monthlyValueRepo.ListByEmployeeYear(ctx, employeeID, year)
	if err != nil {
		return nil, err
	}

	summaries := make([]MonthSummary, 0, len(values))
	for i := range values {
		summaries = append(summaries, *monthlyValueToSummary(&values[i]))
	}

	return summaries, nil
}

// GetDailyBreakdown retrieves daily values for a specific month.
// Returns the daily values for the given employee, year, and month.
func (s *MonthlyEvalService) GetDailyBreakdown(ctx context.Context, employeeID uuid.UUID, year, month int) ([]model.DailyValue, error) {
	if err := validateYearMonth(year, month); err != nil {
		return nil, err
	}

	from, to := monthDateRange(year, month)
	return s.dailyValueRepo.GetByEmployeeDateRange(ctx, employeeID, from, to)
}
