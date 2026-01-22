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
	"github.com/tolga/terp/internal/repository"
)

// mockDailyCalcServiceForRecalc implements dailyCalcServiceForRecalc for testing.
type mockDailyCalcServiceForRecalc struct {
	mock.Mock
}

func (m *mockDailyCalcServiceForRecalc) CalculateDay(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error) {
	args := m.Called(ctx, tenantID, employeeID, date)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.DailyValue), args.Error(1)
}

func (m *mockDailyCalcServiceForRecalc) RecalculateRange(ctx context.Context, tenantID, employeeID uuid.UUID, from, to time.Time) (int, error) {
	args := m.Called(ctx, tenantID, employeeID, from, to)
	return args.Int(0), args.Error(1)
}

// mockEmployeeRepositoryForRecalc implements employeeRepositoryForRecalc for testing.
type mockEmployeeRepositoryForRecalc struct {
	mock.Mock
}

func (m *mockEmployeeRepositoryForRecalc) List(ctx context.Context, filter repository.EmployeeFilter) ([]model.Employee, int64, error) {
	args := m.Called(ctx, filter)
	if args.Get(0) == nil {
		return nil, 0, args.Error(2)
	}
	return args.Get(0).([]model.Employee), args.Get(1).(int64), args.Error(2)
}

func TestRecalcService_TriggerRecalc_Success(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	employeeID := uuid.New()
	date := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)

	mockCalc := new(mockDailyCalcServiceForRecalc)
	mockEmpRepo := new(mockEmployeeRepositoryForRecalc)
	svc := NewRecalcService(mockCalc, mockEmpRepo)

	mockCalc.On("CalculateDay", ctx, tenantID, employeeID, date).Return(&model.DailyValue{}, nil)

	result, err := svc.TriggerRecalc(ctx, tenantID, employeeID, date)

	require.NoError(t, err)
	assert.Equal(t, 1, result.ProcessedDays)
	assert.Equal(t, 0, result.FailedDays)
	assert.Empty(t, result.Errors)
	mockCalc.AssertExpectations(t)
}

func TestRecalcService_TriggerRecalc_Error(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	employeeID := uuid.New()
	date := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)

	mockCalc := new(mockDailyCalcServiceForRecalc)
	mockEmpRepo := new(mockEmployeeRepositoryForRecalc)
	svc := NewRecalcService(mockCalc, mockEmpRepo)

	mockCalc.On("CalculateDay", ctx, tenantID, employeeID, date).Return(nil, errors.New("calculation failed"))

	result, err := svc.TriggerRecalc(ctx, tenantID, employeeID, date)

	require.Error(t, err)
	assert.Equal(t, 0, result.ProcessedDays)
	assert.Equal(t, 1, result.FailedDays)
	assert.Len(t, result.Errors, 1)
	assert.Equal(t, employeeID, result.Errors[0].EmployeeID)
	assert.Equal(t, "calculation failed", result.Errors[0].Error)
}

func TestRecalcService_TriggerRecalcRange_Success(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	employeeID := uuid.New()
	from := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 24, 0, 0, 0, 0, time.UTC) // 5 days

	mockCalc := new(mockDailyCalcServiceForRecalc)
	mockEmpRepo := new(mockEmployeeRepositoryForRecalc)
	svc := NewRecalcService(mockCalc, mockEmpRepo)

	mockCalc.On("RecalculateRange", ctx, tenantID, employeeID, from, to).Return(5, nil)

	result, err := svc.TriggerRecalcRange(ctx, tenantID, employeeID, from, to)

	require.NoError(t, err)
	assert.Equal(t, 5, result.ProcessedDays)
	assert.Equal(t, 0, result.FailedDays)
	assert.Empty(t, result.Errors)
	mockCalc.AssertExpectations(t)
}

func TestRecalcService_TriggerRecalcRange_PartialFailure(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	employeeID := uuid.New()
	from := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 24, 0, 0, 0, 0, time.UTC) // 5 days

	mockCalc := new(mockDailyCalcServiceForRecalc)
	mockEmpRepo := new(mockEmployeeRepositoryForRecalc)
	svc := NewRecalcService(mockCalc, mockEmpRepo)

	// Fails after processing 3 days
	mockCalc.On("RecalculateRange", ctx, tenantID, employeeID, from, to).Return(3, errors.New("db error"))

	result, err := svc.TriggerRecalcRange(ctx, tenantID, employeeID, from, to)

	require.Error(t, err)
	assert.Equal(t, 3, result.ProcessedDays)
	assert.Equal(t, 2, result.FailedDays) // 5 - 3 = 2 failed
	assert.Len(t, result.Errors, 1)
	// Failed date should be Jan 23 (from + 3 days)
	expectedFailedDate := from.AddDate(0, 0, 3)
	assert.Equal(t, expectedFailedDate, result.Errors[0].Date)
}

func TestRecalcService_TriggerRecalcBatch_AllSuccess(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	emp1 := uuid.New()
	emp2 := uuid.New()
	emp3 := uuid.New()
	from := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 21, 0, 0, 0, 0, time.UTC) // 2 days

	mockCalc := new(mockDailyCalcServiceForRecalc)
	mockEmpRepo := new(mockEmployeeRepositoryForRecalc)
	svc := NewRecalcService(mockCalc, mockEmpRepo)

	mockCalc.On("RecalculateRange", ctx, tenantID, emp1, from, to).Return(2, nil)
	mockCalc.On("RecalculateRange", ctx, tenantID, emp2, from, to).Return(2, nil)
	mockCalc.On("RecalculateRange", ctx, tenantID, emp3, from, to).Return(2, nil)

	result := svc.TriggerRecalcBatch(ctx, tenantID, []uuid.UUID{emp1, emp2, emp3}, from, to)

	assert.Equal(t, 6, result.ProcessedDays) // 3 employees * 2 days
	assert.Equal(t, 0, result.FailedDays)
	assert.Empty(t, result.Errors)
	mockCalc.AssertExpectations(t)
}

func TestRecalcService_TriggerRecalcBatch_ContinuesOnError(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	emp1 := uuid.New()
	emp2 := uuid.New()
	emp3 := uuid.New()
	from := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 21, 0, 0, 0, 0, time.UTC) // 2 days

	mockCalc := new(mockDailyCalcServiceForRecalc)
	mockEmpRepo := new(mockEmployeeRepositoryForRecalc)
	svc := NewRecalcService(mockCalc, mockEmpRepo)

	// First employee succeeds, second fails, third succeeds
	mockCalc.On("RecalculateRange", ctx, tenantID, emp1, from, to).Return(2, nil)
	mockCalc.On("RecalculateRange", ctx, tenantID, emp2, from, to).Return(0, errors.New("calculation error"))
	mockCalc.On("RecalculateRange", ctx, tenantID, emp3, from, to).Return(2, nil)

	result := svc.TriggerRecalcBatch(ctx, tenantID, []uuid.UUID{emp1, emp2, emp3}, from, to)

	assert.Equal(t, 4, result.ProcessedDays) // emp1: 2 + emp3: 2 = 4
	assert.Equal(t, 2, result.FailedDays)    // emp2: 2 days failed
	assert.Len(t, result.Errors, 1)
	assert.Equal(t, emp2, result.Errors[0].EmployeeID)
	mockCalc.AssertExpectations(t)
}

func TestRecalcService_TriggerRecalcBatch_EmptyList(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	from := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 21, 0, 0, 0, 0, time.UTC)

	mockCalc := new(mockDailyCalcServiceForRecalc)
	mockEmpRepo := new(mockEmployeeRepositoryForRecalc)
	svc := NewRecalcService(mockCalc, mockEmpRepo)

	result := svc.TriggerRecalcBatch(ctx, tenantID, []uuid.UUID{}, from, to)

	assert.Equal(t, 0, result.ProcessedDays)
	assert.Equal(t, 0, result.FailedDays)
	assert.Empty(t, result.Errors)
}

func TestRecalcService_TriggerRecalcAll_Success(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	emp1 := uuid.New()
	emp2 := uuid.New()
	from := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 21, 0, 0, 0, 0, time.UTC) // 2 days

	mockCalc := new(mockDailyCalcServiceForRecalc)
	mockEmpRepo := new(mockEmployeeRepositoryForRecalc)
	svc := NewRecalcService(mockCalc, mockEmpRepo)

	employees := []model.Employee{
		{ID: emp1},
		{ID: emp2},
	}

	isActive := true
	expectedFilter := repository.EmployeeFilter{
		TenantID: tenantID,
		IsActive: &isActive,
	}
	mockEmpRepo.On("List", ctx, expectedFilter).Return(employees, int64(2), nil)
	mockCalc.On("RecalculateRange", ctx, tenantID, emp1, from, to).Return(2, nil)
	mockCalc.On("RecalculateRange", ctx, tenantID, emp2, from, to).Return(2, nil)

	result, err := svc.TriggerRecalcAll(ctx, tenantID, from, to)

	require.NoError(t, err)
	assert.Equal(t, 4, result.ProcessedDays) // 2 employees * 2 days
	assert.Equal(t, 0, result.FailedDays)
	assert.Empty(t, result.Errors)
	mockEmpRepo.AssertExpectations(t)
	mockCalc.AssertExpectations(t)
}

func TestRecalcService_TriggerRecalcAll_EmployeeListError(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	from := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 21, 0, 0, 0, 0, time.UTC)

	mockCalc := new(mockDailyCalcServiceForRecalc)
	mockEmpRepo := new(mockEmployeeRepositoryForRecalc)
	svc := NewRecalcService(mockCalc, mockEmpRepo)

	isActive := true
	expectedFilter := repository.EmployeeFilter{
		TenantID: tenantID,
		IsActive: &isActive,
	}
	mockEmpRepo.On("List", ctx, expectedFilter).Return(nil, int64(0), errors.New("db error"))

	result, err := svc.TriggerRecalcAll(ctx, tenantID, from, to)

	require.Error(t, err)
	assert.Nil(t, result)
	assert.Equal(t, "db error", err.Error())
}

func TestRecalcService_TriggerRecalcAll_NoActiveEmployees(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	from := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 21, 0, 0, 0, 0, time.UTC)

	mockCalc := new(mockDailyCalcServiceForRecalc)
	mockEmpRepo := new(mockEmployeeRepositoryForRecalc)
	svc := NewRecalcService(mockCalc, mockEmpRepo)

	isActive := true
	expectedFilter := repository.EmployeeFilter{
		TenantID: tenantID,
		IsActive: &isActive,
	}
	mockEmpRepo.On("List", ctx, expectedFilter).Return([]model.Employee{}, int64(0), nil)

	result, err := svc.TriggerRecalcAll(ctx, tenantID, from, to)

	require.NoError(t, err)
	assert.Equal(t, 0, result.ProcessedDays)
	assert.Equal(t, 0, result.FailedDays)
	assert.Empty(t, result.Errors)
}
