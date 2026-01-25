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

// --- GetMonthSummary Tests ---

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

// --- RecalculateMonth Tests ---

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
			mv.FlextimeEnd == 90 // 60 + 30
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

// --- CloseMonth Tests ---

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

// --- ReopenMonth Tests ---

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

// --- GetYearOverview Tests ---

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

// --- Helper Function Tests ---

func TestValidateYearMonth(t *testing.T) {
	tests := []struct {
		name    string
		year    int
		month   int
		wantErr error
	}{
		{"valid", 2026, 6, nil},
		{"year too low", 1800, 6, ErrInvalidYearMonth},
		{"year too high", 2500, 6, ErrInvalidYearMonth},
		{"month too low", 2026, 0, ErrInvalidMonth},
		{"month too high", 2026, 13, ErrInvalidMonth},
		{"edge case min year", 1900, 1, nil},
		{"edge case max year", 2200, 12, nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateYearMonth(tt.year, tt.month)
			if tt.wantErr != nil {
				assert.ErrorIs(t, err, tt.wantErr)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestMonthDateRange(t *testing.T) {
	tests := []struct {
		year      int
		month     int
		wantStart time.Time
		wantEnd   time.Time
	}{
		{2026, 1, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)},
		{2026, 2, time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC), time.Date(2026, 2, 28, 0, 0, 0, 0, time.UTC)},
		{2024, 2, time.Date(2024, 2, 1, 0, 0, 0, 0, time.UTC), time.Date(2024, 2, 29, 0, 0, 0, 0, time.UTC)}, // Leap year
		{2026, 12, time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC), time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC)},
	}

	for _, tt := range tests {
		t.Run(time.Month(tt.month).String(), func(t *testing.T) {
			from, to := monthDateRange(tt.year, tt.month)
			assert.Equal(t, tt.wantStart, from)
			assert.Equal(t, tt.wantEnd, to)
		})
	}
}

// --- Absence Summary Tests ---

func TestBuildAbsenceSummary(t *testing.T) {
	svc := &MonthlyEvalService{}

	vacationType := &model.AbsenceType{Category: model.AbsenceCategoryVacation}
	illnessType := &model.AbsenceType{Category: model.AbsenceCategoryIllness}
	specialType := &model.AbsenceType{Category: model.AbsenceCategorySpecial}

	absences := []model.AbsenceDay{
		{Status: model.AbsenceStatusApproved, Duration: decimal.NewFromInt(1), AbsenceType: vacationType},
		{Status: model.AbsenceStatusApproved, Duration: decimal.NewFromFloat(0.5), AbsenceType: vacationType},
		{Status: model.AbsenceStatusApproved, Duration: decimal.NewFromInt(1), AbsenceType: illnessType},
		{Status: model.AbsenceStatusApproved, Duration: decimal.NewFromFloat(0.5), AbsenceType: illnessType},
		{Status: model.AbsenceStatusApproved, Duration: decimal.NewFromInt(1), AbsenceType: specialType},
		{Status: model.AbsenceStatusPending, Duration: decimal.NewFromInt(1), AbsenceType: vacationType}, // Not counted
		{Status: model.AbsenceStatusApproved, Duration: decimal.NewFromInt(1), AbsenceType: nil},         // Not counted
	}

	result := svc.buildAbsenceSummary(absences)

	assert.True(t, result.VacationDays.Equal(decimal.NewFromFloat(1.5)))
	assert.Equal(t, 2, result.SickDays) // 1 full day + 0.5 day (ceil to 1)
	assert.Equal(t, 1, result.OtherAbsenceDays)
}
