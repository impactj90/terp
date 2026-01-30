package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
)

// --- Mock implementations ---

type mockMonthlyEvalServiceForCalc struct {
	mock.Mock
}

func (m *mockMonthlyEvalServiceForCalc) RecalculateMonth(ctx context.Context, employeeID uuid.UUID, year, month int) error {
	args := m.Called(ctx, employeeID, year, month)
	return args.Error(0)
}

func (m *mockMonthlyEvalServiceForCalc) GetMonthSummary(ctx context.Context, employeeID uuid.UUID, year, month int) (*MonthSummary, error) {
	args := m.Called(ctx, employeeID, year, month)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*MonthSummary), args.Error(1)
}

type mockMonthlyValueRepoForCalc struct {
	mock.Mock
}

func (m *mockMonthlyValueRepoForCalc) GetByEmployeeMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error) {
	args := m.Called(ctx, employeeID, year, month)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.MonthlyValue), args.Error(1)
}

// --- Test helper ---

func newTestMonthlyCalcService() (
	*MonthlyCalcService,
	*mockMonthlyEvalServiceForCalc,
	*mockMonthlyValueRepoForCalc,
) {
	evalService := new(mockMonthlyEvalServiceForCalc)
	monthlyValueRepo := new(mockMonthlyValueRepoForCalc)

	svc := NewMonthlyCalcService(evalService, monthlyValueRepo)
	return svc, evalService, monthlyValueRepo
}

// --- CalculateMonth Tests ---

func TestMonthlyCalcService_CalculateMonth_Success(t *testing.T) {
	ctx := context.Background()
	svc, evalService, monthlyValueRepo := newTestMonthlyCalcService()

	employeeID := uuid.New()
	// Use a past month to avoid future month error
	year, month := 2025, 12

	evalService.On("RecalculateMonth", ctx, employeeID, year, month).Return(nil)

	expected := &model.MonthlyValue{
		EmployeeID:   employeeID,
		Year:         year,
		Month:        month,
		TotalNetTime: 9600,
		FlextimeEnd:  120,
	}
	monthlyValueRepo.On("GetByEmployeeMonth", ctx, employeeID, year, month).Return(expected, nil)

	result, err := svc.CalculateMonth(ctx, employeeID, year, month)

	require.NoError(t, err)
	assert.Equal(t, employeeID, result.EmployeeID)
	assert.Equal(t, 9600, result.TotalNetTime)
	assert.Equal(t, 120, result.FlextimeEnd)
	evalService.AssertExpectations(t)
	monthlyValueRepo.AssertExpectations(t)
}

func TestMonthlyCalcService_CalculateMonth_FutureMonth(t *testing.T) {
	ctx := context.Background()
	svc, _, _ := newTestMonthlyCalcService()

	employeeID := uuid.New()
	// Use a future month
	futureYear := time.Now().Year() + 1

	_, err := svc.CalculateMonth(ctx, employeeID, futureYear, 1)

	assert.ErrorIs(t, err, ErrFutureMonth)
}

func TestMonthlyCalcService_CalculateMonth_MonthClosed(t *testing.T) {
	ctx := context.Background()
	svc, evalService, _ := newTestMonthlyCalcService()

	employeeID := uuid.New()
	year, month := 2025, 11

	evalService.On("RecalculateMonth", ctx, employeeID, year, month).Return(ErrMonthClosed)

	_, err := svc.CalculateMonth(ctx, employeeID, year, month)

	assert.ErrorIs(t, err, ErrMonthClosed)
}

func TestMonthlyCalcService_CalculateMonth_CurrentMonth(t *testing.T) {
	ctx := context.Background()
	svc, evalService, monthlyValueRepo := newTestMonthlyCalcService()

	employeeID := uuid.New()
	now := time.Now()
	year, month := now.Year(), int(now.Month())

	evalService.On("RecalculateMonth", ctx, employeeID, year, month).Return(nil)

	expected := &model.MonthlyValue{
		EmployeeID: employeeID,
		Year:       year,
		Month:      month,
	}
	monthlyValueRepo.On("GetByEmployeeMonth", ctx, employeeID, year, month).Return(expected, nil)

	result, err := svc.CalculateMonth(ctx, employeeID, year, month)

	require.NoError(t, err)
	assert.Equal(t, year, result.Year)
	assert.Equal(t, month, result.Month)
}

// --- CalculateMonthBatch Tests ---

func TestMonthlyCalcService_CalculateMonthBatch_Success(t *testing.T) {
	ctx := context.Background()
	svc, evalService, _ := newTestMonthlyCalcService()

	emp1 := uuid.New()
	emp2 := uuid.New()
	emp3 := uuid.New()
	year, month := 2025, 11

	evalService.On("RecalculateMonth", ctx, emp1, year, month).Return(nil)
	evalService.On("RecalculateMonth", ctx, emp2, year, month).Return(nil)
	evalService.On("RecalculateMonth", ctx, emp3, year, month).Return(nil)

	result := svc.CalculateMonthBatch(ctx, []uuid.UUID{emp1, emp2, emp3}, year, month)

	assert.Equal(t, 3, result.ProcessedMonths)
	assert.Equal(t, 0, result.FailedMonths)
	assert.Equal(t, 0, result.SkippedMonths)
	assert.Empty(t, result.Errors)
	evalService.AssertExpectations(t)
}

func TestMonthlyCalcService_CalculateMonthBatch_WithFailures(t *testing.T) {
	ctx := context.Background()
	svc, evalService, _ := newTestMonthlyCalcService()

	emp1 := uuid.New()
	emp2 := uuid.New()
	emp3 := uuid.New()
	year, month := 2025, 11

	evalService.On("RecalculateMonth", ctx, emp1, year, month).Return(nil)
	evalService.On("RecalculateMonth", ctx, emp2, year, month).Return(errors.New("employee not found"))
	evalService.On("RecalculateMonth", ctx, emp3, year, month).Return(nil)

	result := svc.CalculateMonthBatch(ctx, []uuid.UUID{emp1, emp2, emp3}, year, month)

	assert.Equal(t, 2, result.ProcessedMonths)
	assert.Equal(t, 1, result.FailedMonths)
	assert.Equal(t, 0, result.SkippedMonths)
	assert.Len(t, result.Errors, 1)
	assert.Equal(t, emp2, result.Errors[0].EmployeeID)
}

func TestMonthlyCalcService_CalculateMonthBatch_WithClosedMonths(t *testing.T) {
	ctx := context.Background()
	svc, evalService, _ := newTestMonthlyCalcService()

	emp1 := uuid.New()
	emp2 := uuid.New()
	year, month := 2025, 11

	evalService.On("RecalculateMonth", ctx, emp1, year, month).Return(nil)
	evalService.On("RecalculateMonth", ctx, emp2, year, month).Return(ErrMonthClosed)

	result := svc.CalculateMonthBatch(ctx, []uuid.UUID{emp1, emp2}, year, month)

	assert.Equal(t, 1, result.ProcessedMonths)
	assert.Equal(t, 0, result.FailedMonths)
	assert.Equal(t, 1, result.SkippedMonths)
	assert.Empty(t, result.Errors)
}

func TestMonthlyCalcService_CalculateMonthBatch_FutureMonth(t *testing.T) {
	ctx := context.Background()
	svc, _, _ := newTestMonthlyCalcService()

	emp1 := uuid.New()
	emp2 := uuid.New()
	futureYear := time.Now().Year() + 1

	result := svc.CalculateMonthBatch(ctx, []uuid.UUID{emp1, emp2}, futureYear, 1)

	assert.Equal(t, 0, result.ProcessedMonths)
	assert.Equal(t, 2, result.FailedMonths)
	assert.Len(t, result.Errors, 2)
}

// --- RecalculateFromMonth Tests ---

func TestMonthlyCalcService_RecalculateFromMonth_Success(t *testing.T) {
	ctx := context.Background()
	svc, evalService, _ := newTestMonthlyCalcService()

	employeeID := uuid.New()
	// Start from November 2025, should process through current month
	now := time.Now()

	// Calculate expected months to process
	startYear, startMonth := 2025, 11
	expectedMonths := 0
	y, m := startYear, startMonth
	for {
		if y > now.Year() || (y == now.Year() && m > int(now.Month())) {
			break
		}
		evalService.On("RecalculateMonth", ctx, employeeID, y, m).Return(nil)
		expectedMonths++
		m++
		if m > 12 {
			m = 1
			y++
		}
	}

	result := svc.RecalculateFromMonth(ctx, employeeID, startYear, startMonth)

	assert.Equal(t, expectedMonths, result.ProcessedMonths)
	assert.Equal(t, 0, result.FailedMonths)
	assert.Equal(t, 0, result.SkippedMonths)
	evalService.AssertExpectations(t)
}

func TestMonthlyCalcService_RecalculateFromMonth_SkipsClosedMonths(t *testing.T) {
	ctx := context.Background()
	svc, evalService, _ := newTestMonthlyCalcService()

	employeeID := uuid.New()
	// Start from Oct 2025
	startYear, startMonth := 2025, 10

	// Oct succeeds, Nov is closed, Dec succeeds
	evalService.On("RecalculateMonth", ctx, employeeID, 2025, 10).Return(nil)
	evalService.On("RecalculateMonth", ctx, employeeID, 2025, 11).Return(ErrMonthClosed)
	evalService.On("RecalculateMonth", ctx, employeeID, 2025, 12).Return(nil)
	// Continue for remaining months up to current
	now := time.Now()
	y, m := 2026, 1
	for {
		if y > now.Year() || (y == now.Year() && m > int(now.Month())) {
			break
		}
		evalService.On("RecalculateMonth", ctx, employeeID, y, m).Return(nil)
		m++
		if m > 12 {
			m = 1
			y++
		}
	}

	result := svc.RecalculateFromMonth(ctx, employeeID, startYear, startMonth)

	assert.Equal(t, 1, result.SkippedMonths)    // November skipped
	assert.True(t, result.ProcessedMonths >= 2) // At least Oct and Dec
	assert.Equal(t, 0, result.FailedMonths)
	assert.Empty(t, result.Errors)
}

func TestMonthlyCalcService_RecalculateFromMonth_ContinuesOnError(t *testing.T) {
	ctx := context.Background()
	svc, evalService, _ := newTestMonthlyCalcService()

	employeeID := uuid.New()
	startYear, startMonth := 2025, 10

	// Oct fails, Nov succeeds, Dec succeeds
	evalService.On("RecalculateMonth", ctx, employeeID, 2025, 10).Return(errors.New("db error"))
	evalService.On("RecalculateMonth", ctx, employeeID, 2025, 11).Return(nil)
	evalService.On("RecalculateMonth", ctx, employeeID, 2025, 12).Return(nil)
	// Continue for remaining months
	now := time.Now()
	y, m := 2026, 1
	for {
		if y > now.Year() || (y == now.Year() && m > int(now.Month())) {
			break
		}
		evalService.On("RecalculateMonth", ctx, employeeID, y, m).Return(nil)
		m++
		if m > 12 {
			m = 1
			y++
		}
	}

	result := svc.RecalculateFromMonth(ctx, employeeID, startYear, startMonth)

	assert.Equal(t, 1, result.FailedMonths)     // October failed
	assert.True(t, result.ProcessedMonths >= 2) // Nov and Dec succeeded
	assert.Len(t, result.Errors, 1)
	assert.Equal(t, 2025, result.Errors[0].Year)
	assert.Equal(t, 10, result.Errors[0].Month)
}

func TestMonthlyCalcService_RecalculateFromMonth_YearBoundary(t *testing.T) {
	ctx := context.Background()
	svc, evalService, _ := newTestMonthlyCalcService()

	employeeID := uuid.New()
	// Start from December 2025
	startYear, startMonth := 2025, 12

	evalService.On("RecalculateMonth", ctx, employeeID, 2025, 12).Return(nil)
	// Continue into 2026
	now := time.Now()
	y, m := 2026, 1
	for {
		if y > now.Year() || (y == now.Year() && m > int(now.Month())) {
			break
		}
		evalService.On("RecalculateMonth", ctx, employeeID, y, m).Return(nil)
		m++
		if m > 12 {
			m = 1
			y++
		}
	}

	result := svc.RecalculateFromMonth(ctx, employeeID, startYear, startMonth)

	assert.True(t, result.ProcessedMonths >= 2) // At least Dec 2025 and Jan 2026
	assert.Equal(t, 0, result.FailedMonths)
	evalService.AssertExpectations(t)
}

func TestMonthlyCalcService_RecalculateFromMonth_CurrentMonth(t *testing.T) {
	ctx := context.Background()
	svc, evalService, _ := newTestMonthlyCalcService()

	employeeID := uuid.New()
	now := time.Now()
	year, month := now.Year(), int(now.Month())

	evalService.On("RecalculateMonth", ctx, employeeID, year, month).Return(nil)

	result := svc.RecalculateFromMonth(ctx, employeeID, year, month)

	assert.Equal(t, 1, result.ProcessedMonths)
	assert.Equal(t, 0, result.FailedMonths)
}

func TestMonthlyCalcService_RecalculateFromMonth_FutureMonth(t *testing.T) {
	ctx := context.Background()
	svc, _, _ := newTestMonthlyCalcService()

	employeeID := uuid.New()
	futureYear := time.Now().Year() + 1

	result := svc.RecalculateFromMonth(ctx, employeeID, futureYear, 1)

	// Should process nothing since starting from future
	assert.Equal(t, 0, result.ProcessedMonths)
	assert.Equal(t, 0, result.FailedMonths)
	assert.Empty(t, result.Errors)
}

// --- RecalculateFromMonthBatch Tests ---

func TestMonthlyCalcService_RecalculateFromMonthBatch_Success(t *testing.T) {
	ctx := context.Background()
	svc, evalService, _ := newTestMonthlyCalcService()

	emp1 := uuid.New()
	emp2 := uuid.New()
	now := time.Now()
	year, month := now.Year(), int(now.Month())

	evalService.On("RecalculateMonth", ctx, emp1, year, month).Return(nil)
	evalService.On("RecalculateMonth", ctx, emp2, year, month).Return(nil)

	result := svc.RecalculateFromMonthBatch(ctx, []uuid.UUID{emp1, emp2}, year, month)

	assert.Equal(t, 2, result.ProcessedMonths)
	assert.Equal(t, 0, result.FailedMonths)
}

func TestMonthlyCalcService_RecalculateFromMonthBatch_MixedResults(t *testing.T) {
	ctx := context.Background()
	svc, evalService, _ := newTestMonthlyCalcService()

	emp1 := uuid.New()
	emp2 := uuid.New()
	now := time.Now()
	year, month := now.Year(), int(now.Month())

	evalService.On("RecalculateMonth", ctx, emp1, year, month).Return(nil)
	evalService.On("RecalculateMonth", ctx, emp2, year, month).Return(ErrMonthClosed)

	result := svc.RecalculateFromMonthBatch(ctx, []uuid.UUID{emp1, emp2}, year, month)

	assert.Equal(t, 1, result.ProcessedMonths)
	assert.Equal(t, 1, result.SkippedMonths)
	assert.Equal(t, 0, result.FailedMonths)
}
