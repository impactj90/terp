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

type mockAbsenceDayRepositoryForService struct {
	mock.Mock
}

func (m *mockAbsenceDayRepositoryForService) Create(ctx context.Context, ad *model.AbsenceDay) error {
	args := m.Called(ctx, ad)
	return args.Error(0)
}

func (m *mockAbsenceDayRepositoryForService) CreateRange(ctx context.Context, days []model.AbsenceDay) error {
	args := m.Called(ctx, days)
	return args.Error(0)
}

func (m *mockAbsenceDayRepositoryForService) GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceDay, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.AbsenceDay), args.Error(1)
}

func (m *mockAbsenceDayRepositoryForService) GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.AbsenceDay, error) {
	args := m.Called(ctx, employeeID, date)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.AbsenceDay), args.Error(1)
}

func (m *mockAbsenceDayRepositoryForService) GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.AbsenceDay, error) {
	args := m.Called(ctx, employeeID, from, to)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.AbsenceDay), args.Error(1)
}

func (m *mockAbsenceDayRepositoryForService) ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.AbsenceDay, error) {
	args := m.Called(ctx, employeeID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.AbsenceDay), args.Error(1)
}

func (m *mockAbsenceDayRepositoryForService) Delete(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func (m *mockAbsenceDayRepositoryForService) DeleteRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error {
	args := m.Called(ctx, employeeID, from, to)
	return args.Error(0)
}

type mockAbsenceTypeRepositoryForService struct {
	mock.Mock
}

func (m *mockAbsenceTypeRepositoryForService) GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceType, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.AbsenceType), args.Error(1)
}

func (m *mockAbsenceTypeRepositoryForService) List(ctx context.Context, tenantID uuid.UUID, includeSystem bool) ([]model.AbsenceType, error) {
	args := m.Called(ctx, tenantID, includeSystem)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.AbsenceType), args.Error(1)
}

type mockHolidayRepositoryForAbsence struct {
	mock.Mock
}

func (m *mockHolidayRepositoryForAbsence) GetByDateRange(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]model.Holiday, error) {
	args := m.Called(ctx, tenantID, from, to)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.Holiday), args.Error(1)
}

type mockEmpDayPlanRepositoryForAbsence struct {
	mock.Mock
}

func (m *mockEmpDayPlanRepositoryForAbsence) GetForEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.EmployeeDayPlan, error) {
	args := m.Called(ctx, employeeID, from, to)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.EmployeeDayPlan), args.Error(1)
}

type mockRecalcServiceForAbsence struct {
	mock.Mock
}

func (m *mockRecalcServiceForAbsence) TriggerRecalc(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*RecalcResult, error) {
	args := m.Called(ctx, tenantID, employeeID, date)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*RecalcResult), args.Error(1)
}

func (m *mockRecalcServiceForAbsence) TriggerRecalcRange(ctx context.Context, tenantID, employeeID uuid.UUID, from, to time.Time) (*RecalcResult, error) {
	args := m.Called(ctx, tenantID, employeeID, from, to)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*RecalcResult), args.Error(1)
}

// --- Test helper ---

func newTestAbsenceService() (
	*AbsenceService,
	*mockAbsenceDayRepositoryForService,
	*mockAbsenceTypeRepositoryForService,
	*mockHolidayRepositoryForAbsence,
	*mockEmpDayPlanRepositoryForAbsence,
	*mockRecalcServiceForAbsence,
) {
	absenceDayRepo := new(mockAbsenceDayRepositoryForService)
	absenceTypeRepo := new(mockAbsenceTypeRepositoryForService)
	holidayRepo := new(mockHolidayRepositoryForAbsence)
	empDayPlanRepo := new(mockEmpDayPlanRepositoryForAbsence)
	recalcSvc := new(mockRecalcServiceForAbsence)

	svc := NewAbsenceService(absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcSvc)
	return svc, absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcSvc
}

// --- GetByID Tests ---

func TestAbsenceService_GetByID_Success(t *testing.T) {
	ctx := context.Background()
	svc, absenceDayRepo, _, _, _, _ := newTestAbsenceService()

	id := uuid.New()
	expected := &model.AbsenceDay{ID: id, TenantID: uuid.New(), EmployeeID: uuid.New()}

	absenceDayRepo.On("GetByID", ctx, id).Return(expected, nil)

	result, err := svc.GetByID(ctx, id)

	require.NoError(t, err)
	assert.Equal(t, id, result.ID)
	absenceDayRepo.AssertExpectations(t)
}

func TestAbsenceService_GetByID_NotFound(t *testing.T) {
	ctx := context.Background()
	svc, absenceDayRepo, _, _, _, _ := newTestAbsenceService()

	id := uuid.New()
	absenceDayRepo.On("GetByID", ctx, id).Return(nil, errors.New("not found"))

	_, err := svc.GetByID(ctx, id)

	assert.ErrorIs(t, err, ErrAbsenceNotFound)
}

// --- Delete Tests ---

func TestAbsenceService_Delete_Success(t *testing.T) {
	ctx := context.Background()
	svc, absenceDayRepo, _, _, _, recalcSvc := newTestAbsenceService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	id := uuid.New()
	date := time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC)

	existing := &model.AbsenceDay{
		ID:          id,
		TenantID:    tenantID,
		EmployeeID:  employeeID,
		AbsenceDate: date,
	}

	absenceDayRepo.On("GetByID", ctx, id).Return(existing, nil)
	absenceDayRepo.On("Delete", ctx, id).Return(nil)
	recalcSvc.On("TriggerRecalc", ctx, tenantID, employeeID, date).Return(&RecalcResult{ProcessedDays: 1}, nil)

	err := svc.Delete(ctx, id)

	require.NoError(t, err)
	absenceDayRepo.AssertExpectations(t)
	recalcSvc.AssertExpectations(t)
}

func TestAbsenceService_Delete_NotFound(t *testing.T) {
	ctx := context.Background()
	svc, absenceDayRepo, _, _, _, _ := newTestAbsenceService()

	id := uuid.New()
	absenceDayRepo.On("GetByID", ctx, id).Return(nil, errors.New("not found"))

	err := svc.Delete(ctx, id)

	assert.ErrorIs(t, err, ErrAbsenceNotFound)
}

// --- DeleteRange Tests ---

func TestAbsenceService_DeleteRange_Success(t *testing.T) {
	ctx := context.Background()
	svc, absenceDayRepo, _, _, _, recalcSvc := newTestAbsenceService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	from := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 24, 0, 0, 0, 0, time.UTC)

	absenceDayRepo.On("DeleteRange", ctx, employeeID, from, to).Return(nil)
	recalcSvc.On("TriggerRecalcRange", ctx, tenantID, employeeID, from, to).Return(&RecalcResult{ProcessedDays: 5}, nil)

	err := svc.DeleteRange(ctx, tenantID, employeeID, from, to)

	require.NoError(t, err)
	absenceDayRepo.AssertExpectations(t)
	recalcSvc.AssertExpectations(t)
}

func TestAbsenceService_DeleteRange_InvalidDates(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _, _ := newTestAbsenceService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	from := time.Date(2026, 1, 24, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC) // Before from

	err := svc.DeleteRange(ctx, tenantID, employeeID, from, to)

	assert.ErrorIs(t, err, ErrInvalidAbsenceDates)
}

// --- ListByEmployee Tests ---

func TestAbsenceService_ListByEmployee_Success(t *testing.T) {
	ctx := context.Background()
	svc, absenceDayRepo, _, _, _, _ := newTestAbsenceService()

	employeeID := uuid.New()
	expected := []model.AbsenceDay{
		{ID: uuid.New(), EmployeeID: employeeID},
		{ID: uuid.New(), EmployeeID: employeeID},
	}

	absenceDayRepo.On("ListByEmployee", ctx, employeeID).Return(expected, nil)

	result, err := svc.ListByEmployee(ctx, employeeID)

	require.NoError(t, err)
	assert.Len(t, result, 2)
}

// --- GetByEmployeeDateRange Tests ---

func TestAbsenceService_GetByEmployeeDateRange_Success(t *testing.T) {
	ctx := context.Background()
	svc, absenceDayRepo, _, _, _, _ := newTestAbsenceService()

	employeeID := uuid.New()
	from := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 24, 0, 0, 0, 0, time.UTC)
	expected := []model.AbsenceDay{{ID: uuid.New()}}

	absenceDayRepo.On("GetByEmployeeDateRange", ctx, employeeID, from, to).Return(expected, nil)

	result, err := svc.GetByEmployeeDateRange(ctx, employeeID, from, to)

	require.NoError(t, err)
	assert.Len(t, result, 1)
}

func TestAbsenceService_GetByEmployeeDateRange_InvalidDates(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _, _ := newTestAbsenceService()

	employeeID := uuid.New()
	from := time.Date(2026, 1, 24, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)

	_, err := svc.GetByEmployeeDateRange(ctx, employeeID, from, to)

	assert.ErrorIs(t, err, ErrInvalidAbsenceDates)
}

// --- CreateRange Tests ---

func TestAbsenceService_CreateRange_Success_WeekdaysOnly(t *testing.T) {
	// Week: Mon Jan 26 to Fri Jan 30 (5 weekdays, no weekends)
	ctx := context.Background()
	svc, absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcSvc := newTestAbsenceService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	absenceTypeID := uuid.New()
	from := time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC) // Monday
	to := time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC)   // Friday

	// Setup mocks
	absenceTypeRepo.On("GetByID", ctx, absenceTypeID).Return(&model.AbsenceType{
		ID:       absenceTypeID,
		TenantID: &tenantID,
		IsActive: true,
	}, nil)
	holidayRepo.On("GetByDateRange", ctx, tenantID, from, to).Return([]model.Holiday{}, nil)

	// All 5 weekdays have day plans assigned
	somePlanID := uuid.New()
	empDayPlanRepo.On("GetForEmployeeDateRange", ctx, employeeID, from, to).Return([]model.EmployeeDayPlan{
		{PlanDate: time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 27, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 29, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
	}, nil)

	// No existing absences on any date
	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, mock.AnythingOfType("time.Time")).Return(nil, nil)

	// Expect CreateRange with 5 days
	absenceDayRepo.On("CreateRange", ctx, mock.MatchedBy(func(days []model.AbsenceDay) bool {
		return len(days) == 5
	})).Return(nil)

	recalcSvc.On("TriggerRecalcRange", ctx, tenantID, employeeID, from, to).Return(&RecalcResult{ProcessedDays: 5}, nil)

	input := CreateAbsenceRangeInput{
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		AbsenceTypeID: absenceTypeID,
		FromDate:      from,
		ToDate:        to,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusPending,
	}

	result, err := svc.CreateRange(ctx, input)

	require.NoError(t, err)
	assert.Len(t, result.CreatedDays, 5)
	assert.Empty(t, result.SkippedDates)
	absenceDayRepo.AssertExpectations(t)
	recalcSvc.AssertExpectations(t)
}

func TestAbsenceService_CreateRange_SkipsWeekends(t *testing.T) {
	// Mon Jan 26 to Sun Feb 1 (7 calendar days, expect 5 created, 2 skipped)
	ctx := context.Background()
	svc, absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcSvc := newTestAbsenceService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	absenceTypeID := uuid.New()
	from := time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC) // Monday
	to := time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)    // Sunday

	absenceTypeRepo.On("GetByID", ctx, absenceTypeID).Return(&model.AbsenceType{
		ID: absenceTypeID, TenantID: &tenantID, IsActive: true,
	}, nil)
	holidayRepo.On("GetByDateRange", ctx, tenantID, from, to).Return([]model.Holiday{}, nil)

	// Day plans for Mon-Fri only (weekends won't be looked up since they're skipped first)
	somePlanID := uuid.New()
	empDayPlanRepo.On("GetForEmployeeDateRange", ctx, employeeID, from, to).Return([]model.EmployeeDayPlan{
		{PlanDate: time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 27, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 29, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
	}, nil)

	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, mock.AnythingOfType("time.Time")).Return(nil, nil)
	absenceDayRepo.On("CreateRange", ctx, mock.MatchedBy(func(days []model.AbsenceDay) bool {
		return len(days) == 5
	})).Return(nil)
	recalcSvc.On("TriggerRecalcRange", ctx, tenantID, employeeID, from, to).Return(&RecalcResult{}, nil)

	input := CreateAbsenceRangeInput{
		TenantID: tenantID, EmployeeID: employeeID, AbsenceTypeID: absenceTypeID,
		FromDate: from, ToDate: to,
		Duration: decimal.NewFromInt(1), Status: model.AbsenceStatusPending,
	}

	result, err := svc.CreateRange(ctx, input)

	require.NoError(t, err)
	assert.Len(t, result.CreatedDays, 5)
	assert.Len(t, result.SkippedDates, 2) // Saturday + Sunday
}

func TestAbsenceService_CreateRange_SkipsHolidays(t *testing.T) {
	// Mon-Fri, with Wednesday as holiday -> 4 created, 1 skipped
	ctx := context.Background()
	svc, absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcSvc := newTestAbsenceService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	absenceTypeID := uuid.New()
	from := time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC) // Monday
	to := time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC)   // Friday
	wednesday := time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC)

	absenceTypeRepo.On("GetByID", ctx, absenceTypeID).Return(&model.AbsenceType{
		ID: absenceTypeID, TenantID: &tenantID, IsActive: true,
	}, nil)
	holidayRepo.On("GetByDateRange", ctx, tenantID, from, to).Return([]model.Holiday{
		{HolidayDate: wednesday, Name: "Holiday"},
	}, nil)

	somePlanID := uuid.New()
	empDayPlanRepo.On("GetForEmployeeDateRange", ctx, employeeID, from, to).Return([]model.EmployeeDayPlan{
		{PlanDate: time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 27, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: wednesday, DayPlanID: &somePlanID}, // Has plan but is holiday
		{PlanDate: time.Date(2026, 1, 29, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
	}, nil)

	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, mock.AnythingOfType("time.Time")).Return(nil, nil)
	absenceDayRepo.On("CreateRange", ctx, mock.MatchedBy(func(days []model.AbsenceDay) bool {
		return len(days) == 4
	})).Return(nil)
	recalcSvc.On("TriggerRecalcRange", ctx, tenantID, employeeID, from, to).Return(&RecalcResult{}, nil)

	input := CreateAbsenceRangeInput{
		TenantID: tenantID, EmployeeID: employeeID, AbsenceTypeID: absenceTypeID,
		FromDate: from, ToDate: to,
		Duration: decimal.NewFromInt(1), Status: model.AbsenceStatusPending,
	}

	result, err := svc.CreateRange(ctx, input)

	require.NoError(t, err)
	assert.Len(t, result.CreatedDays, 4)
	assert.Len(t, result.SkippedDates, 1)
	assert.Equal(t, wednesday, result.SkippedDates[0])
}

func TestAbsenceService_CreateRange_SkipsOffDays(t *testing.T) {
	// Mon-Fri, Tuesday has DayPlanID=nil (explicit off), Thursday missing (no plan)
	// Expected: 3 created (Mon, Wed, Fri), 2 skipped
	ctx := context.Background()
	svc, absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcSvc := newTestAbsenceService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	absenceTypeID := uuid.New()
	from := time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC)

	absenceTypeRepo.On("GetByID", ctx, absenceTypeID).Return(&model.AbsenceType{
		ID: absenceTypeID, TenantID: &tenantID, IsActive: true,
	}, nil)
	holidayRepo.On("GetByDateRange", ctx, tenantID, from, to).Return([]model.Holiday{}, nil)

	somePlanID := uuid.New()
	empDayPlanRepo.On("GetForEmployeeDateRange", ctx, employeeID, from, to).Return([]model.EmployeeDayPlan{
		{PlanDate: time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID}, // Mon: work
		{PlanDate: time.Date(2026, 1, 27, 0, 0, 0, 0, time.UTC), DayPlanID: nil},         // Tue: off (explicit)
		{PlanDate: time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID}, // Wed: work
		// Thu (Jan 29): no plan record at all = off day
		{PlanDate: time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID}, // Fri: work
	}, nil)

	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, mock.AnythingOfType("time.Time")).Return(nil, nil)
	absenceDayRepo.On("CreateRange", ctx, mock.MatchedBy(func(days []model.AbsenceDay) bool {
		return len(days) == 3
	})).Return(nil)
	recalcSvc.On("TriggerRecalcRange", ctx, tenantID, employeeID, from, to).Return(&RecalcResult{}, nil)

	input := CreateAbsenceRangeInput{
		TenantID: tenantID, EmployeeID: employeeID, AbsenceTypeID: absenceTypeID,
		FromDate: from, ToDate: to,
		Duration: decimal.NewFromInt(1), Status: model.AbsenceStatusPending,
	}

	result, err := svc.CreateRange(ctx, input)

	require.NoError(t, err)
	assert.Len(t, result.CreatedDays, 3)
	assert.Len(t, result.SkippedDates, 2) // Tue + Thu
}

func TestAbsenceService_CreateRange_SkipsExistingAbsences(t *testing.T) {
	// Mon-Fri, Wednesday already has an absence -> 4 created, 1 skipped
	ctx := context.Background()
	svc, absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcSvc := newTestAbsenceService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	absenceTypeID := uuid.New()
	from := time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC)
	wednesday := time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC)

	absenceTypeRepo.On("GetByID", ctx, absenceTypeID).Return(&model.AbsenceType{
		ID: absenceTypeID, TenantID: &tenantID, IsActive: true,
	}, nil)
	holidayRepo.On("GetByDateRange", ctx, tenantID, from, to).Return([]model.Holiday{}, nil)

	somePlanID := uuid.New()
	empDayPlanRepo.On("GetForEmployeeDateRange", ctx, employeeID, from, to).Return([]model.EmployeeDayPlan{
		{PlanDate: time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 27, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: wednesday, DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 29, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
	}, nil)

	// Wednesday has existing absence
	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, wednesday).Return(&model.AbsenceDay{ID: uuid.New()}, nil)
	// All other days: no existing absence
	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, mock.MatchedBy(func(d time.Time) bool {
		return !d.Equal(wednesday)
	})).Return(nil, nil)

	absenceDayRepo.On("CreateRange", ctx, mock.MatchedBy(func(days []model.AbsenceDay) bool {
		return len(days) == 4
	})).Return(nil)
	recalcSvc.On("TriggerRecalcRange", ctx, tenantID, employeeID, from, to).Return(&RecalcResult{}, nil)

	input := CreateAbsenceRangeInput{
		TenantID: tenantID, EmployeeID: employeeID, AbsenceTypeID: absenceTypeID,
		FromDate: from, ToDate: to,
		Duration: decimal.NewFromInt(1), Status: model.AbsenceStatusPending,
	}

	result, err := svc.CreateRange(ctx, input)

	require.NoError(t, err)
	assert.Len(t, result.CreatedDays, 4)
	assert.Len(t, result.SkippedDates, 1)
}

func TestAbsenceService_CreateRange_InvalidDates(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _, _ := newTestAbsenceService()

	input := CreateAbsenceRangeInput{
		TenantID:      uuid.New(),
		EmployeeID:    uuid.New(),
		AbsenceTypeID: uuid.New(),
		FromDate:      time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC),
		ToDate:        time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC), // Before from
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusPending,
	}

	_, err := svc.CreateRange(ctx, input)

	assert.ErrorIs(t, err, ErrInvalidAbsenceDates)
}

func TestAbsenceService_CreateRange_InvalidAbsenceType(t *testing.T) {
	ctx := context.Background()
	svc, _, absenceTypeRepo, _, _, _ := newTestAbsenceService()

	absenceTypeID := uuid.New()
	absenceTypeRepo.On("GetByID", ctx, absenceTypeID).Return(nil, errors.New("not found"))

	input := CreateAbsenceRangeInput{
		TenantID:      uuid.New(),
		EmployeeID:    uuid.New(),
		AbsenceTypeID: absenceTypeID,
		FromDate:      time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC),
		ToDate:        time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC),
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusPending,
	}

	_, err := svc.CreateRange(ctx, input)

	assert.ErrorIs(t, err, ErrInvalidAbsenceType)
}

func TestAbsenceService_CreateRange_InactiveAbsenceType(t *testing.T) {
	ctx := context.Background()
	svc, _, absenceTypeRepo, _, _, _ := newTestAbsenceService()

	tenantID := uuid.New()
	absenceTypeID := uuid.New()
	absenceTypeRepo.On("GetByID", ctx, absenceTypeID).Return(&model.AbsenceType{
		ID: absenceTypeID, TenantID: &tenantID, IsActive: false,
	}, nil)

	input := CreateAbsenceRangeInput{
		TenantID:      tenantID,
		EmployeeID:    uuid.New(),
		AbsenceTypeID: absenceTypeID,
		FromDate:      time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC),
		ToDate:        time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC),
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusPending,
	}

	_, err := svc.CreateRange(ctx, input)

	assert.ErrorIs(t, err, ErrAbsenceTypeInactive)
}

func TestAbsenceService_CreateRange_WrongTenantAbsenceType(t *testing.T) {
	ctx := context.Background()
	svc, _, absenceTypeRepo, _, _, _ := newTestAbsenceService()

	tenantID := uuid.New()
	otherTenantID := uuid.New()
	absenceTypeID := uuid.New()
	absenceTypeRepo.On("GetByID", ctx, absenceTypeID).Return(&model.AbsenceType{
		ID: absenceTypeID, TenantID: &otherTenantID, IsActive: true,
	}, nil)

	input := CreateAbsenceRangeInput{
		TenantID:      tenantID,
		EmployeeID:    uuid.New(),
		AbsenceTypeID: absenceTypeID,
		FromDate:      time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC),
		ToDate:        time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC),
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusPending,
	}

	_, err := svc.CreateRange(ctx, input)

	assert.ErrorIs(t, err, ErrInvalidAbsenceType)
}

func TestAbsenceService_CreateRange_SystemAbsenceType(t *testing.T) {
	// System types (nil TenantID) are accessible by all tenants
	ctx := context.Background()
	svc, absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcSvc := newTestAbsenceService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	absenceTypeID := uuid.New()
	from := time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC) // Single day

	absenceTypeRepo.On("GetByID", ctx, absenceTypeID).Return(&model.AbsenceType{
		ID: absenceTypeID, TenantID: nil, IsActive: true, IsSystem: true,
	}, nil)
	holidayRepo.On("GetByDateRange", ctx, tenantID, from, to).Return([]model.Holiday{}, nil)

	somePlanID := uuid.New()
	empDayPlanRepo.On("GetForEmployeeDateRange", ctx, employeeID, from, to).Return([]model.EmployeeDayPlan{
		{PlanDate: from, DayPlanID: &somePlanID},
	}, nil)
	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, from).Return(nil, nil)
	absenceDayRepo.On("CreateRange", ctx, mock.MatchedBy(func(days []model.AbsenceDay) bool {
		return len(days) == 1
	})).Return(nil)
	recalcSvc.On("TriggerRecalcRange", ctx, tenantID, employeeID, from, to).Return(&RecalcResult{}, nil)

	input := CreateAbsenceRangeInput{
		TenantID: tenantID, EmployeeID: employeeID, AbsenceTypeID: absenceTypeID,
		FromDate: from, ToDate: to,
		Duration: decimal.NewFromInt(1), Status: model.AbsenceStatusApproved,
	}

	result, err := svc.CreateRange(ctx, input)

	require.NoError(t, err)
	assert.Len(t, result.CreatedDays, 1)
}

func TestAbsenceService_CreateRange_AllDatesSkipped(t *testing.T) {
	// Weekend-only range: Sat Jan 31 to Sun Feb 1
	ctx := context.Background()
	svc, _, absenceTypeRepo, holidayRepo, empDayPlanRepo, _ := newTestAbsenceService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	absenceTypeID := uuid.New()
	from := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC) // Saturday
	to := time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)    // Sunday

	absenceTypeRepo.On("GetByID", ctx, absenceTypeID).Return(&model.AbsenceType{
		ID: absenceTypeID, TenantID: &tenantID, IsActive: true,
	}, nil)
	holidayRepo.On("GetByDateRange", ctx, tenantID, from, to).Return([]model.Holiday{}, nil)
	empDayPlanRepo.On("GetForEmployeeDateRange", ctx, employeeID, from, to).Return([]model.EmployeeDayPlan{}, nil)

	input := CreateAbsenceRangeInput{
		TenantID: tenantID, EmployeeID: employeeID, AbsenceTypeID: absenceTypeID,
		FromDate: from, ToDate: to,
		Duration: decimal.NewFromInt(1), Status: model.AbsenceStatusPending,
	}

	_, err := svc.CreateRange(ctx, input)

	assert.ErrorIs(t, err, ErrNoAbsenceDaysCreated)
}

func TestAbsenceService_CreateRange_SingleDay(t *testing.T) {
	// FromDate == ToDate (single working day)
	ctx := context.Background()
	svc, absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcSvc := newTestAbsenceService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	absenceTypeID := uuid.New()
	date := time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC) // Monday

	absenceTypeRepo.On("GetByID", ctx, absenceTypeID).Return(&model.AbsenceType{
		ID: absenceTypeID, TenantID: &tenantID, IsActive: true,
	}, nil)
	holidayRepo.On("GetByDateRange", ctx, tenantID, date, date).Return([]model.Holiday{}, nil)

	somePlanID := uuid.New()
	empDayPlanRepo.On("GetForEmployeeDateRange", ctx, employeeID, date, date).Return([]model.EmployeeDayPlan{
		{PlanDate: date, DayPlanID: &somePlanID},
	}, nil)
	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, date).Return(nil, nil)
	absenceDayRepo.On("CreateRange", ctx, mock.MatchedBy(func(days []model.AbsenceDay) bool {
		return len(days) == 1 && days[0].AbsenceDate.Equal(date)
	})).Return(nil)
	recalcSvc.On("TriggerRecalcRange", ctx, tenantID, employeeID, date, date).Return(&RecalcResult{}, nil)

	input := CreateAbsenceRangeInput{
		TenantID: tenantID, EmployeeID: employeeID, AbsenceTypeID: absenceTypeID,
		FromDate: date, ToDate: date,
		Duration: decimal.NewFromInt(1), Status: model.AbsenceStatusPending,
	}

	result, err := svc.CreateRange(ctx, input)

	require.NoError(t, err)
	assert.Len(t, result.CreatedDays, 1)
	assert.Empty(t, result.SkippedDates)
}

func TestAbsenceService_CreateRange_HalfDay(t *testing.T) {
	// Verify Duration=0.5 and HalfDayPeriod are set correctly on created days
	ctx := context.Background()
	svc, absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcSvc := newTestAbsenceService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	absenceTypeID := uuid.New()
	date := time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC)
	halfDayPeriod := model.HalfDayPeriodMorning

	absenceTypeRepo.On("GetByID", ctx, absenceTypeID).Return(&model.AbsenceType{
		ID: absenceTypeID, TenantID: &tenantID, IsActive: true,
	}, nil)
	holidayRepo.On("GetByDateRange", ctx, tenantID, date, date).Return([]model.Holiday{}, nil)

	somePlanID := uuid.New()
	empDayPlanRepo.On("GetForEmployeeDateRange", ctx, employeeID, date, date).Return([]model.EmployeeDayPlan{
		{PlanDate: date, DayPlanID: &somePlanID},
	}, nil)
	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, date).Return(nil, nil)
	absenceDayRepo.On("CreateRange", ctx, mock.MatchedBy(func(days []model.AbsenceDay) bool {
		if len(days) != 1 {
			return false
		}
		return days[0].Duration.Equal(decimal.NewFromFloat(0.5)) &&
			days[0].HalfDayPeriod != nil &&
			*days[0].HalfDayPeriod == model.HalfDayPeriodMorning
	})).Return(nil)
	recalcSvc.On("TriggerRecalcRange", ctx, tenantID, employeeID, date, date).Return(&RecalcResult{}, nil)

	input := CreateAbsenceRangeInput{
		TenantID: tenantID, EmployeeID: employeeID, AbsenceTypeID: absenceTypeID,
		FromDate: date, ToDate: date,
		Duration:      decimal.NewFromFloat(0.5),
		HalfDayPeriod: &halfDayPeriod,
		Status:        model.AbsenceStatusPending,
	}

	result, err := svc.CreateRange(ctx, input)

	require.NoError(t, err)
	assert.Len(t, result.CreatedDays, 1)
}

// --- Helper Function Tests ---

func TestNormalizeDate(t *testing.T) {
	d := time.Date(2026, 1, 22, 14, 30, 45, 123, time.UTC)
	normalized := normalizeDate(d)

	assert.Equal(t, 2026, normalized.Year())
	assert.Equal(t, time.January, normalized.Month())
	assert.Equal(t, 22, normalized.Day())
	assert.Equal(t, 0, normalized.Hour())
	assert.Equal(t, 0, normalized.Minute())
	assert.Equal(t, 0, normalized.Second())
}

func TestBuildHolidaySet(t *testing.T) {
	holidays := []model.Holiday{
		{HolidayDate: time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC)},
		{HolidayDate: time.Date(2026, 1, 30, 12, 0, 0, 0, time.UTC)}, // time component should be stripped
	}

	set := buildHolidaySet(holidays)

	assert.True(t, set[time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC)])
	assert.True(t, set[time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC)])
	assert.False(t, set[time.Date(2026, 1, 29, 0, 0, 0, 0, time.UTC)])
}

func TestBuildDayPlanMap(t *testing.T) {
	planID := uuid.New()
	plans := []model.EmployeeDayPlan{
		{PlanDate: time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC), DayPlanID: &planID},
		{PlanDate: time.Date(2026, 1, 27, 0, 0, 0, 0, time.UTC), DayPlanID: nil},
	}

	m := buildDayPlanMap(plans)

	assert.NotNil(t, m[time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC)])
	assert.NotNil(t, m[time.Date(2026, 1, 27, 0, 0, 0, 0, time.UTC)])
	assert.Nil(t, m[time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC)]) // Not in map
}
