# Implementation Plan: NOK-151 - Create Monthly Evaluation Service

**Date**: 2026-01-25
**Ticket**: NOK-151 (TICKET-087)
**Research**: thoughts/shared/research/2026-01-25-NOK-151-create-monthly-evaluation-service.md

## Overview

Create the MonthlyEvalService that aggregates daily values into monthly totals, manages flextime running balance across months, handles month closing/reopening, and provides year overview.

**Pattern**: Follows the VacationService/AbsenceService pattern (concrete struct, private dependency interfaces, testify/mock tests).

## Files to Create/Modify

| Action | File |
|--------|------|
| Create | `apps/api/internal/service/monthlyeval.go` |
| Create | `apps/api/internal/service/monthlyeval_test.go` |
| Modify | `apps/api/cmd/server/main.go` (wire MonthlyEvalService) |

## Design Decisions

1. **Concrete struct pattern** (like VacationService/AbsenceService), not exported interface
2. **Private dependency interfaces** defined in the service file for each repository needed
3. **MonthSummary as return type** - a service-level type that mirrors model.MonthlyValue with additional Warnings field
4. **GetMonthSummary returns existing data only** - does NOT auto-calculate; returns `ErrMonthlyValueNotFound` if no record exists
5. **RecalculateMonth checks closed status** - returns `ErrMonthClosed` if month is closed
6. **TenantID retrieved from employee** - service methods accept employeeID, look up employee for TenantID
7. **DailyValueSum repository method** - uses the existing `SumForMonth` method for efficient SQL aggregation
8. **Absence summary computation** - sums absence days by category using `GetByEmployeeDateRange`
9. **Evaluation rules default to nil** - no credit type evaluation until tariff/employee ZMI fields are available (future ticket)
10. **FlextimeCarryover set from previous month** - uses `GetPreviousMonth` for flextime chain
11. **Year validation** - 1900-2200 range (consistent with VacationService)
12. **Month validation** - 1-12 range

---

## Phase 1: Create Service File - Structure, Errors, Interfaces, Types, Constructor

### Step 1.1: Create `apps/api/internal/service/monthlyeval.go`

```go
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
var (
	ErrMonthClosed           = errors.New("month is closed")
	ErrMonthNotClosed        = errors.New("month is not closed")
	ErrInvalidMonth          = errors.New("invalid month")
	ErrInvalidYearMonth      = errors.New("invalid year or month")
	ErrMonthlyValueNotFound  = errors.New("monthly value not found")
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
}

// NewMonthlyEvalService creates a new MonthlyEvalService instance.
func NewMonthlyEvalService(
	monthlyValueRepo monthlyValueRepoForMonthlyEval,
	dailyValueRepo dailyValueRepoForMonthlyEval,
	absenceDayRepo absenceDayRepoForMonthlyEval,
	employeeRepo employeeRepoForMonthlyEval,
) *MonthlyEvalService {
	return &MonthlyEvalService{
		monthlyValueRepo: monthlyValueRepo,
		dailyValueRepo:   dailyValueRepo,
		absenceDayRepo:   absenceDayRepo,
		employeeRepo:     employeeRepo,
	}
}
```

### Step 1.2: Add Validation Helpers

```go
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
```

### Verification
```bash
cd apps/api && go build ./...
```

---

## Phase 2: Implement GetMonthSummary

### Step 2.1: GetMonthSummary Method

Retrieves the monthly summary for an employee. Returns `ErrMonthlyValueNotFound` if no record exists. Does NOT auto-calculate; use `RecalculateMonth` to generate data.

```go
// GetMonthSummary retrieves the monthly summary for an employee.
// Returns ErrMonthlyValueNotFound if no monthly value has been calculated.
func (s *MonthlyEvalService) GetMonthSummary(ctx context.Context, employeeID uuid.UUID, year, month int) (*MonthSummary, error) {
	if err := validateYearMonth(year, month); err != nil {
		return nil, err
	}

	mv, err := s.monthlyValueRepo.GetByEmployeeMonth(ctx, employeeID, year, month)
	if err != nil {
		return nil, err
	}
	if mv == nil {
		return nil, ErrMonthlyValueNotFound
	}

	return monthlyValueToSummary(mv), nil
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
```

### Verification
```bash
cd apps/api && go build ./...
```

---

## Phase 3: Implement RecalculateMonth

### Step 3.1: RecalculateMonth Method

Recalculates monthly aggregation from daily values and absences. Returns error if month is closed.

```go
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

	// Build calculation input
	calcInput := s.buildMonthlyCalcInput(dailyValues, absences, previousCarryover)

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
```

### Step 3.2: Helper Methods for Calculation

```go
// buildMonthlyCalcInput converts daily values and absences to calculation input.
func (s *MonthlyEvalService) buildMonthlyCalcInput(
	dailyValues []model.DailyValue,
	absences []model.AbsenceDay,
	previousCarryover int,
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

	return calculation.MonthlyCalcInput{
		DailyValues:       dvInputs,
		PreviousCarryover: previousCarryover,
		EvaluationRules:   nil, // No evaluation rules until tariff ZMI fields available
		AbsenceSummary:    absenceSummary,
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
			// For illness, duration is typically 1 or 0.5
			summary.SickDays += int(ad.Duration.IntPart())
			if ad.Duration.Sub(decimal.NewFromInt(int64(summary.SickDays))).GreaterThan(decimal.Zero) {
				// Handle half days
				summary.SickDays++
			}
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
	previousCarryover int,
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
```

### Verification
```bash
cd apps/api && go build ./...
```

---

## Phase 4: Implement CloseMonth and ReopenMonth

### Step 4.1: CloseMonth Method

```go
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
```

### Step 4.2: ReopenMonth Method

```go
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
```

### Verification
```bash
cd apps/api && go build ./...
```

---

## Phase 5: Implement GetYearOverview

### Step 5.1: GetYearOverview Method

```go
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
```

### Verification
```bash
cd apps/api && go build ./...
```

---

## Phase 6: Write Unit Tests

**File**: `apps/api/internal/service/monthlyeval_test.go`

### Step 6.1: Mock Definitions and Test Helper

```go
package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
)

// --- Mock implementations ---

type mockMonthlyValueRepoForMonthlyEval struct {
	mock.Mock
}

func (m *mockMonthlyValueRepoForMonthlyEval) GetByEmployeeMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error) {
	args := m.Called(ctx, employeeID, year, month)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.MonthlyValue), args.Error(1)
}

func (m *mockMonthlyValueRepoForMonthlyEval) GetPreviousMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error) {
	args := m.Called(ctx, employeeID, year, month)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.MonthlyValue), args.Error(1)
}

func (m *mockMonthlyValueRepoForMonthlyEval) Upsert(ctx context.Context, mv *model.MonthlyValue) error {
	args := m.Called(ctx, mv)
	return args.Error(0)
}

func (m *mockMonthlyValueRepoForMonthlyEval) ListByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) ([]model.MonthlyValue, error) {
	args := m.Called(ctx, employeeID, year)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.MonthlyValue), args.Error(1)
}

func (m *mockMonthlyValueRepoForMonthlyEval) CloseMonth(ctx context.Context, employeeID uuid.UUID, year, month int, closedBy uuid.UUID) error {
	args := m.Called(ctx, employeeID, year, month, closedBy)
	return args.Error(0)
}

func (m *mockMonthlyValueRepoForMonthlyEval) ReopenMonth(ctx context.Context, employeeID uuid.UUID, year, month int, reopenedBy uuid.UUID) error {
	args := m.Called(ctx, employeeID, year, month, reopenedBy)
	return args.Error(0)
}

type mockDailyValueRepoForMonthlyEval struct {
	mock.Mock
}

func (m *mockDailyValueRepoForMonthlyEval) GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.DailyValue, error) {
	args := m.Called(ctx, employeeID, from, to)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.DailyValue), args.Error(1)
}

type mockAbsenceDayRepoForMonthlyEval struct {
	mock.Mock
}

func (m *mockAbsenceDayRepoForMonthlyEval) GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.AbsenceDay, error) {
	args := m.Called(ctx, employeeID, from, to)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.AbsenceDay), args.Error(1)
}

type mockEmployeeRepoForMonthlyEval struct {
	mock.Mock
}

func (m *mockEmployeeRepoForMonthlyEval) GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.Employee), args.Error(1)
}

// --- Test helper ---

func newTestMonthlyEvalService() (
	*MonthlyEvalService,
	*mockMonthlyValueRepoForMonthlyEval,
	*mockDailyValueRepoForMonthlyEval,
	*mockAbsenceDayRepoForMonthlyEval,
	*mockEmployeeRepoForMonthlyEval,
) {
	monthlyValueRepo := new(mockMonthlyValueRepoForMonthlyEval)
	dailyValueRepo := new(mockDailyValueRepoForMonthlyEval)
	absenceDayRepo := new(mockAbsenceDayRepoForMonthlyEval)
	employeeRepo := new(mockEmployeeRepoForMonthlyEval)

	svc := NewMonthlyEvalService(monthlyValueRepo, dailyValueRepo, absenceDayRepo, employeeRepo)
	return svc, monthlyValueRepo, dailyValueRepo, absenceDayRepo, employeeRepo
}
```

### Step 6.2: GetMonthSummary Tests

```go
func TestMonthlyEvalService_GetMonthSummary_Success(t *testing.T) {
	ctx := context.Background()
	svc, monthlyValueRepo, _, _, _ := newTestMonthlyEvalService()

	employeeID := uuid.New()
	year, month := 2026, 1

	expected := &model.MonthlyValue{
		EmployeeID:      employeeID,
		Year:            year,
		Month:           month,
		TotalNetTime:    9600, // 160 hours = 9600 minutes
		TotalTargetTime: 9600,
		FlextimeEnd:     120, // 2 hours
	}

	monthlyValueRepo.On("GetByEmployeeMonth", ctx, employeeID, year, month).Return(expected, nil)

	result, err := svc.GetMonthSummary(ctx, employeeID, year, month)

	require.NoError(t, err)
	assert.Equal(t, employeeID, result.EmployeeID)
	assert.Equal(t, 9600, result.TotalNetTime)
	assert.Equal(t, 120, result.FlextimeEnd)
	monthlyValueRepo.AssertExpectations(t)
}

func TestMonthlyEvalService_GetMonthSummary_NotFound(t *testing.T) {
	ctx := context.Background()
	svc, monthlyValueRepo, _, _, _ := newTestMonthlyEvalService()

	employeeID := uuid.New()
	monthlyValueRepo.On("GetByEmployeeMonth", ctx, employeeID, 2026, 1).Return(nil, nil)

	_, err := svc.GetMonthSummary(ctx, employeeID, 2026, 1)

	assert.ErrorIs(t, err, ErrMonthlyValueNotFound)
}

func TestMonthlyEvalService_GetMonthSummary_InvalidYear(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _ := newTestMonthlyEvalService()

	_, err := svc.GetMonthSummary(ctx, uuid.New(), 1800, 1)
	assert.ErrorIs(t, err, ErrInvalidYearMonth)

	_, err = svc.GetMonthSummary(ctx, uuid.New(), 2500, 1)
	assert.ErrorIs(t, err, ErrInvalidYearMonth)
}

func TestMonthlyEvalService_GetMonthSummary_InvalidMonth(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _ := newTestMonthlyEvalService()

	_, err := svc.GetMonthSummary(ctx, uuid.New(), 2026, 0)
	assert.ErrorIs(t, err, ErrInvalidMonth)

	_, err = svc.GetMonthSummary(ctx, uuid.New(), 2026, 13)
	assert.ErrorIs(t, err, ErrInvalidMonth)
}
```

### Step 6.3: RecalculateMonth Tests

```go
func TestMonthlyEvalService_RecalculateMonth_Success(t *testing.T) {
	ctx := context.Background()
	svc, monthlyValueRepo, dailyValueRepo, absenceDayRepo, employeeRepo := newTestMonthlyEvalService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	year, month := 2026, 1

	employee := &model.Employee{ID: employeeID, TenantID: tenantID}
	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)

	// No existing monthly value (not closed)
	monthlyValueRepo.On("GetByEmployeeMonth", ctx, employeeID, year, month).Return(nil, nil)

	// No previous month (first month)
	monthlyValueRepo.On("GetPreviousMonth", ctx, employeeID, year, month).Return(nil, nil)

	// Date range
	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)

	// Daily values: 5 work days, 8 hours each = 40 hours net, target also 40 hours
	dailyValues := []model.DailyValue{
		{EmployeeID: employeeID, ValueDate: time.Date(2026, 1, 6, 0, 0, 0, 0, time.UTC), GrossTime: 510, NetTime: 480, TargetTime: 480, BreakTime: 30},
		{EmployeeID: employeeID, ValueDate: time.Date(2026, 1, 7, 0, 0, 0, 0, time.UTC), GrossTime: 510, NetTime: 480, TargetTime: 480, BreakTime: 30},
		{EmployeeID: employeeID, ValueDate: time.Date(2026, 1, 8, 0, 0, 0, 0, time.UTC), GrossTime: 510, NetTime: 480, TargetTime: 480, BreakTime: 30},
		{EmployeeID: employeeID, ValueDate: time.Date(2026, 1, 9, 0, 0, 0, 0, time.UTC), GrossTime: 510, NetTime: 480, TargetTime: 480, BreakTime: 30},
		{EmployeeID: employeeID, ValueDate: time.Date(2026, 1, 10, 0, 0, 0, 0, time.UTC), GrossTime: 510, NetTime: 480, TargetTime: 480, BreakTime: 30},
	}
	dailyValueRepo.On("GetByEmployeeDateRange", ctx, employeeID, from, to).Return(dailyValues, nil)

	// No absences
	absenceDayRepo.On("GetByEmployeeDateRange", ctx, employeeID, from, to).Return([]model.AbsenceDay{}, nil)

	// Expect upsert
	monthlyValueRepo.On("Upsert", ctx, mock.MatchedBy(func(mv *model.MonthlyValue) bool {
		return mv.EmployeeID == employeeID &&
			mv.Year == year &&
			mv.Month == month &&
			mv.TotalNetTime == 2400 && // 5 * 480
			mv.TotalTargetTime == 2400 &&
			mv.WorkDays == 5
	})).Return(nil)

	err := svc.RecalculateMonth(ctx, employeeID, year, month)

	require.NoError(t, err)
	monthlyValueRepo.AssertExpectations(t)
	dailyValueRepo.AssertExpectations(t)
	absenceDayRepo.AssertExpectations(t)
	employeeRepo.AssertExpectations(t)
}

func TestMonthlyEvalService_RecalculateMonth_MonthClosed(t *testing.T) {
	ctx := context.Background()
	svc, monthlyValueRepo, _, _, employeeRepo := newTestMonthlyEvalService()

	employeeID := uuid.New()
	employee := &model.Employee{ID: employeeID, TenantID: uuid.New()}
	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)

	// Month is closed
	closedMV := &model.MonthlyValue{
		EmployeeID: employeeID,
		Year:       2026,
		Month:      1,
		IsClosed:   true,
	}
	monthlyValueRepo.On("GetByEmployeeMonth", ctx, employeeID, 2026, 1).Return(closedMV, nil)

	err := svc.RecalculateMonth(ctx, employeeID, 2026, 1)

	assert.ErrorIs(t, err, ErrMonthClosed)
}

func TestMonthlyEvalService_RecalculateMonth_WithPreviousCarryover(t *testing.T) {
	ctx := context.Background()
	svc, monthlyValueRepo, dailyValueRepo, absenceDayRepo, employeeRepo := newTestMonthlyEvalService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	year, month := 2026, 2 // February

	employee := &model.Employee{ID: employeeID, TenantID: tenantID}
	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)

	monthlyValueRepo.On("GetByEmployeeMonth", ctx, employeeID, year, month).Return(nil, nil)

	// Previous month has 60 minutes flextime
	prevMonth := &model.MonthlyValue{
		EmployeeID:  employeeID,
		Year:        2026,
		Month:       1,
		FlextimeEnd: 60,
	}
	monthlyValueRepo.On("GetPreviousMonth", ctx, employeeID, year, month).Return(prevMonth, nil)

	from := time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 2, 28, 0, 0, 0, 0, time.UTC)

	// One day with overtime
	dailyValues := []model.DailyValue{
		{EmployeeID: employeeID, ValueDate: time.Date(2026, 2, 2, 0, 0, 0, 0, time.UTC), GrossTime: 540, NetTime: 510, TargetTime: 480, Overtime: 30, BreakTime: 30},
	}
	dailyValueRepo.On("GetByEmployeeDateRange", ctx, employeeID, from, to).Return(dailyValues, nil)
	absenceDayRepo.On("GetByEmployeeDateRange", ctx, employeeID, from, to).Return([]model.AbsenceDay{}, nil)

	monthlyValueRepo.On("Upsert", ctx, mock.MatchedBy(func(mv *model.MonthlyValue) bool {
		// FlextimeStart should be previous month's end (60)
		return mv.FlextimeStart == 60 &&
			mv.FlextimeChange == 30 && // 30 min overtime
			mv.FlextimeEnd == 90       // 60 + 30
	})).Return(nil)

	err := svc.RecalculateMonth(ctx, employeeID, year, month)

	require.NoError(t, err)
	monthlyValueRepo.AssertExpectations(t)
}

func TestMonthlyEvalService_RecalculateMonth_EmployeeNotFound(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, employeeRepo := newTestMonthlyEvalService()

	employeeID := uuid.New()
	employeeRepo.On("GetByID", ctx, employeeID).Return(nil, errors.New("not found"))

	err := svc.RecalculateMonth(ctx, employeeID, 2026, 1)

	assert.ErrorIs(t, err, ErrEmployeeNotFoundForEval)
}

func TestMonthlyEvalService_RecalculateMonth_InvalidMonth(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _ := newTestMonthlyEvalService()

	err := svc.RecalculateMonth(ctx, uuid.New(), 2026, 0)
	assert.ErrorIs(t, err, ErrInvalidMonth)

	err = svc.RecalculateMonth(ctx, uuid.New(), 2026, 13)
	assert.ErrorIs(t, err, ErrInvalidMonth)
}
```

### Step 6.4: CloseMonth Tests

```go
func TestMonthlyEvalService_CloseMonth_Success(t *testing.T) {
	ctx := context.Background()
	svc, monthlyValueRepo, _, _, _ := newTestMonthlyEvalService()

	employeeID := uuid.New()
	closedBy := uuid.New()

	// Month exists and is not closed
	existing := &model.MonthlyValue{
		EmployeeID: employeeID,
		Year:       2026,
		Month:      1,
		IsClosed:   false,
	}
	monthlyValueRepo.On("GetByEmployeeMonth", ctx, employeeID, 2026, 1).Return(existing, nil)
	monthlyValueRepo.On("CloseMonth", ctx, employeeID, 2026, 1, closedBy).Return(nil)

	err := svc.CloseMonth(ctx, employeeID, 2026, 1, closedBy)

	require.NoError(t, err)
	monthlyValueRepo.AssertExpectations(t)
}

func TestMonthlyEvalService_CloseMonth_AlreadyClosed(t *testing.T) {
	ctx := context.Background()
	svc, monthlyValueRepo, _, _, _ := newTestMonthlyEvalService()

	employeeID := uuid.New()

	existing := &model.MonthlyValue{
		EmployeeID: employeeID,
		IsClosed:   true,
	}
	monthlyValueRepo.On("GetByEmployeeMonth", ctx, employeeID, 2026, 1).Return(existing, nil)

	err := svc.CloseMonth(ctx, employeeID, 2026, 1, uuid.New())

	assert.ErrorIs(t, err, ErrMonthClosed)
}

func TestMonthlyEvalService_CloseMonth_NotFound(t *testing.T) {
	ctx := context.Background()
	svc, monthlyValueRepo, _, _, _ := newTestMonthlyEvalService()

	employeeID := uuid.New()
	monthlyValueRepo.On("GetByEmployeeMonth", ctx, employeeID, 2026, 1).Return(nil, nil)

	err := svc.CloseMonth(ctx, employeeID, 2026, 1, uuid.New())

	assert.ErrorIs(t, err, ErrMonthlyValueNotFound)
}

func TestMonthlyEvalService_CloseMonth_InvalidMonth(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _ := newTestMonthlyEvalService()

	err := svc.CloseMonth(ctx, uuid.New(), 2026, 13, uuid.New())
	assert.ErrorIs(t, err, ErrInvalidMonth)
}
```

### Step 6.5: ReopenMonth Tests

```go
func TestMonthlyEvalService_ReopenMonth_Success(t *testing.T) {
	ctx := context.Background()
	svc, monthlyValueRepo, _, _, _ := newTestMonthlyEvalService()

	employeeID := uuid.New()
	reopenedBy := uuid.New()

	// Month exists and is closed
	existing := &model.MonthlyValue{
		EmployeeID: employeeID,
		Year:       2026,
		Month:      1,
		IsClosed:   true,
	}
	monthlyValueRepo.On("GetByEmployeeMonth", ctx, employeeID, 2026, 1).Return(existing, nil)
	monthlyValueRepo.On("ReopenMonth", ctx, employeeID, 2026, 1, reopenedBy).Return(nil)

	err := svc.ReopenMonth(ctx, employeeID, 2026, 1, reopenedBy)

	require.NoError(t, err)
	monthlyValueRepo.AssertExpectations(t)
}

func TestMonthlyEvalService_ReopenMonth_NotClosed(t *testing.T) {
	ctx := context.Background()
	svc, monthlyValueRepo, _, _, _ := newTestMonthlyEvalService()

	employeeID := uuid.New()

	existing := &model.MonthlyValue{
		EmployeeID: employeeID,
		IsClosed:   false,
	}
	monthlyValueRepo.On("GetByEmployeeMonth", ctx, employeeID, 2026, 1).Return(existing, nil)

	err := svc.ReopenMonth(ctx, employeeID, 2026, 1, uuid.New())

	assert.ErrorIs(t, err, ErrMonthNotClosed)
}

func TestMonthlyEvalService_ReopenMonth_NotFound(t *testing.T) {
	ctx := context.Background()
	svc, monthlyValueRepo, _, _, _ := newTestMonthlyEvalService()

	employeeID := uuid.New()
	monthlyValueRepo.On("GetByEmployeeMonth", ctx, employeeID, 2026, 1).Return(nil, nil)

	err := svc.ReopenMonth(ctx, employeeID, 2026, 1, uuid.New())

	assert.ErrorIs(t, err, ErrMonthlyValueNotFound)
}
```

### Step 6.6: GetYearOverview Tests

```go
func TestMonthlyEvalService_GetYearOverview_Success(t *testing.T) {
	ctx := context.Background()
	svc, monthlyValueRepo, _, _, _ := newTestMonthlyEvalService()

	employeeID := uuid.New()
	year := 2026

	values := []model.MonthlyValue{
		{EmployeeID: employeeID, Year: year, Month: 1, TotalNetTime: 9600, FlextimeEnd: 60},
		{EmployeeID: employeeID, Year: year, Month: 2, TotalNetTime: 9120, FlextimeEnd: 30},
	}
	monthlyValueRepo.On("ListByEmployeeYear", ctx, employeeID, year).Return(values, nil)

	result, err := svc.GetYearOverview(ctx, employeeID, year)

	require.NoError(t, err)
	assert.Len(t, result, 2)
	assert.Equal(t, 1, result[0].Month)
	assert.Equal(t, 60, result[0].FlextimeEnd)
	assert.Equal(t, 2, result[1].Month)
	assert.Equal(t, 30, result[1].FlextimeEnd)
	monthlyValueRepo.AssertExpectations(t)
}

func TestMonthlyEvalService_GetYearOverview_Empty(t *testing.T) {
	ctx := context.Background()
	svc, monthlyValueRepo, _, _, _ := newTestMonthlyEvalService()

	employeeID := uuid.New()
	monthlyValueRepo.On("ListByEmployeeYear", ctx, employeeID, 2026).Return([]model.MonthlyValue{}, nil)

	result, err := svc.GetYearOverview(ctx, employeeID, 2026)

	require.NoError(t, err)
	assert.Empty(t, result)
}

func TestMonthlyEvalService_GetYearOverview_InvalidYear(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _ := newTestMonthlyEvalService()

	_, err := svc.GetYearOverview(ctx, uuid.New(), 1800)
	assert.ErrorIs(t, err, ErrInvalidYearMonth)
}
```

### Verification
```bash
cd apps/api && go test -v -run TestMonthlyEvalService ./internal/service/...
```

---

## Phase 7: Wire into main.go

**File**: `apps/api/cmd/server/main.go`

### Step 7.1: Add MonthlyEvalService Initialization

After the VacationService initialization, add:

```go
// Initialize MonthlyEvalService
monthlyValueRepo := repository.NewMonthlyValueRepository(db)
monthlyEvalService := service.NewMonthlyEvalService(monthlyValueRepo, dailyValueRepo, absenceDayRepo, employeeRepo)
_ = monthlyEvalService // TODO: Wire to MonthlyEvalHandler (separate ticket)
```

**Note**: `dailyValueRepo`, `absenceDayRepo`, and `employeeRepo` are already initialized earlier in main.go.

### Verification
```bash
cd apps/api && go build ./cmd/server/
```

---

## Phase 8: Final Verification

```bash
cd apps/api && go build ./...
cd apps/api && go test -v -run TestMonthlyEvalService ./internal/service/...
cd apps/api && go vet ./...
make test
```

---

## Implementation Notes

### Pattern Alignment

The MonthlyEvalService follows the same concrete-struct pattern as VacationService and AbsenceService:
1. **Concrete struct** exported (`MonthlyEvalService`) - not an interface
2. **Private interfaces** for each repository dependency (suffix `ForMonthlyEval`)
3. **Constructor** returns `*MonthlyEvalService` with all deps injected
4. **Package-level error sentinels** for typed error checking
5. **Uses pure calculation** from `calculation.CalculateMonth()`

### Flextime Carryover Chain

The flextime balance chains between months:
- `RecalculateMonth` fetches previous month's `FlextimeEnd` as `FlextimeStart`
- Calculation computes new `FlextimeEnd = FlextimeStart + FlextimeChange`
- `FlextimeCarryover` is set to `FlextimeEnd` for the next month to pick up

### Evaluation Rules - Future Work

Currently `EvaluationRules` is `nil` (no credit type evaluation). This means:
- Overtime/undertime transfers directly 1:1
- No monthly caps, thresholds, or balance limits applied

When tariff/employee ZMI fields become available via future tickets, the service should be updated to:
1. Load evaluation rules from tariff/employee
2. Pass `MonthlyEvaluationInput` to calculation
3. Respect the 4 credit types (no_evaluation, complete_carryover, after_threshold, no_carryover)

### Absence Summary Computation

The service computes absence counts by:
1. Fetching all absences in the date range
2. Filtering to `status = approved`
3. Categorizing by `AbsenceType.Category`
4. Summing durations for vacation (decimal), counting days for illness/other

### Month Close/Reopen

- **CloseMonth**: Prevents booking modifications and recalculation
- **ReopenMonth**: Allows modifications again, preserves reopen timestamp
- **BookingService**: Already checks `IsMonthClosed` before allowing mutations

---

## Success Criteria

- [x] `apps/api/internal/service/monthlyeval.go` compiles with all 5 methods implemented
- [x] `apps/api/internal/service/monthlyeval_test.go` has comprehensive unit tests
- [x] GetMonthSummary returns existing MonthlyValue as MonthSummary
- [x] RecalculateMonth aggregates daily values and absences correctly
- [x] RecalculateMonth chains flextime from previous month
- [x] RecalculateMonth returns error if month is closed
- [x] CloseMonth marks month as closed
- [x] ReopenMonth marks closed month as open
- [x] GetYearOverview returns all months for a year
- [x] All tests pass: `go test -v -run TestMonthlyEvalService ./internal/service/...`
- [x] Service wired in `main.go`
- [x] `go build ./...` succeeds
- [x] `go vet ./...` passes
- [x] `make test` passes

## Implementation Complete

**Completed**: 2026-01-25
