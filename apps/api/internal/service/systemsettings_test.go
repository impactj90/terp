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

// --- Mocks ---

type mockSystemSettingsRepo struct {
	mock.Mock
}

func (m *mockSystemSettingsRepo) GetByTenantID(ctx context.Context, tenantID uuid.UUID) (*model.SystemSettings, error) {
	args := m.Called(ctx, tenantID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.SystemSettings), args.Error(1)
}

func (m *mockSystemSettingsRepo) Create(ctx context.Context, settings *model.SystemSettings) error {
	args := m.Called(ctx, settings)
	return args.Error(0)
}

func (m *mockSystemSettingsRepo) Update(ctx context.Context, settings *model.SystemSettings) error {
	args := m.Called(ctx, settings)
	return args.Error(0)
}

func (m *mockSystemSettingsRepo) GetOrCreate(ctx context.Context, tenantID uuid.UUID) (*model.SystemSettings, error) {
	args := m.Called(ctx, tenantID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.SystemSettings), args.Error(1)
}

type mockSSBookingRepo struct {
	mock.Mock
}

func (m *mockSSBookingRepo) DeleteByDateRange(ctx context.Context, tenantID uuid.UUID, dateFrom, dateTo time.Time, employeeIDs []uuid.UUID) (int64, error) {
	args := m.Called(ctx, tenantID, dateFrom, dateTo, employeeIDs)
	return args.Get(0).(int64), args.Error(1)
}

func (m *mockSSBookingRepo) CountByDateRange(ctx context.Context, tenantID uuid.UUID, dateFrom, dateTo time.Time, employeeIDs []uuid.UUID) (int64, error) {
	args := m.Called(ctx, tenantID, dateFrom, dateTo, employeeIDs)
	return args.Get(0).(int64), args.Error(1)
}

type mockSSDailyValueRepo struct {
	mock.Mock
}

func (m *mockSSDailyValueRepo) DeleteByDateRange(ctx context.Context, tenantID uuid.UUID, dateFrom, dateTo time.Time, employeeIDs []uuid.UUID) (int64, error) {
	args := m.Called(ctx, tenantID, dateFrom, dateTo, employeeIDs)
	return args.Get(0).(int64), args.Error(1)
}

func (m *mockSSDailyValueRepo) CountByDateRange(ctx context.Context, tenantID uuid.UUID, dateFrom, dateTo time.Time, employeeIDs []uuid.UUID) (int64, error) {
	args := m.Called(ctx, tenantID, dateFrom, dateTo, employeeIDs)
	return args.Get(0).(int64), args.Error(1)
}

type mockSSEDPRepo struct {
	mock.Mock
}

func (m *mockSSEDPRepo) DeleteByDateRange(ctx context.Context, tenantID uuid.UUID, dateFrom, dateTo time.Time, employeeIDs []uuid.UUID) (int64, error) {
	args := m.Called(ctx, tenantID, dateFrom, dateTo, employeeIDs)
	return args.Get(0).(int64), args.Error(1)
}

type mockSSOrderRepo struct {
	mock.Mock
}

func (m *mockSSOrderRepo) BulkDelete(ctx context.Context, tenantID uuid.UUID, orderIDs []uuid.UUID) (int64, error) {
	args := m.Called(ctx, tenantID, orderIDs)
	return args.Get(0).(int64), args.Error(1)
}

func (m *mockSSOrderRepo) CountByIDs(ctx context.Context, tenantID uuid.UUID, orderIDs []uuid.UUID) (int64, error) {
	args := m.Called(ctx, tenantID, orderIDs)
	return args.Get(0).(int64), args.Error(1)
}

type mockSSRecalcService struct {
	mock.Mock
}

func (m *mockSSRecalcService) TriggerRecalcAll(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (*RecalcResult, error) {
	args := m.Called(ctx, tenantID, from, to)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*RecalcResult), args.Error(1)
}

func (m *mockSSRecalcService) TriggerRecalcBatch(ctx context.Context, tenantID uuid.UUID, employeeIDs []uuid.UUID, from, to time.Time) *RecalcResult {
	args := m.Called(ctx, tenantID, employeeIDs, from, to)
	return args.Get(0).(*RecalcResult)
}

// --- Helper ---

func newTestSystemSettingsService() (*SystemSettingsService, *mockSystemSettingsRepo, *mockSSBookingRepo, *mockSSDailyValueRepo, *mockSSEDPRepo, *mockSSOrderRepo, *mockSSRecalcService) {
	settingsRepo := &mockSystemSettingsRepo{}
	bookingRepo := &mockSSBookingRepo{}
	dailyValueRepo := &mockSSDailyValueRepo{}
	edpRepo := &mockSSEDPRepo{}
	orderRepo := &mockSSOrderRepo{}
	recalcSvc := &mockSSRecalcService{}

	svc := NewSystemSettingsService(settingsRepo, bookingRepo, dailyValueRepo, edpRepo, orderRepo, recalcSvc)
	return svc, settingsRepo, bookingRepo, dailyValueRepo, edpRepo, orderRepo, recalcSvc
}

func defaultSettings(tenantID uuid.UUID) *model.SystemSettings {
	return &model.SystemSettings{
		ID:                       uuid.New(),
		TenantID:                 tenantID,
		RoundingRelativeToPlan:   false,
		ErrorListEnabled:         true,
		BirthdayWindowDaysBefore: 7,
		BirthdayWindowDaysAfter:  7,
		ServerAliveNotifyAdmins:  true,
	}
}

// --- Tests: Get ---

func TestSystemSettingsService_Get(t *testing.T) {
	svc, settingsRepo, _, _, _, _, _ := newTestSystemSettingsService()
	ctx := context.Background()
	tenantID := uuid.New()
	expected := defaultSettings(tenantID)

	settingsRepo.On("GetOrCreate", ctx, tenantID).Return(expected, nil)

	result, err := svc.Get(ctx, tenantID)
	require.NoError(t, err)
	assert.Equal(t, expected.ID, result.ID)
	assert.Equal(t, tenantID, result.TenantID)
	settingsRepo.AssertExpectations(t)
}

func TestSystemSettingsService_Get_Error(t *testing.T) {
	svc, settingsRepo, _, _, _, _, _ := newTestSystemSettingsService()
	ctx := context.Background()
	tenantID := uuid.New()

	settingsRepo.On("GetOrCreate", ctx, tenantID).Return(nil, errors.New("db error"))

	result, err := svc.Get(ctx, tenantID)
	assert.Error(t, err)
	assert.Nil(t, result)
}

// --- Tests: IsRoundingRelativeToPlan ---

func TestSystemSettingsService_IsRoundingRelativeToPlan_True(t *testing.T) {
	svc, settingsRepo, _, _, _, _, _ := newTestSystemSettingsService()
	ctx := context.Background()
	tenantID := uuid.New()
	settings := defaultSettings(tenantID)
	settings.RoundingRelativeToPlan = true

	settingsRepo.On("GetOrCreate", ctx, tenantID).Return(settings, nil)

	result, err := svc.IsRoundingRelativeToPlan(ctx, tenantID)
	require.NoError(t, err)
	assert.True(t, result)
}

func TestSystemSettingsService_IsRoundingRelativeToPlan_False(t *testing.T) {
	svc, settingsRepo, _, _, _, _, _ := newTestSystemSettingsService()
	ctx := context.Background()
	tenantID := uuid.New()
	settings := defaultSettings(tenantID)

	settingsRepo.On("GetOrCreate", ctx, tenantID).Return(settings, nil)

	result, err := svc.IsRoundingRelativeToPlan(ctx, tenantID)
	require.NoError(t, err)
	assert.False(t, result)
}

// --- Tests: Update ---

func TestSystemSettingsService_Update_Success(t *testing.T) {
	svc, settingsRepo, _, _, _, _, _ := newTestSystemSettingsService()
	ctx := context.Background()
	tenantID := uuid.New()
	settings := defaultSettings(tenantID)

	settingsRepo.On("GetOrCreate", ctx, tenantID).Return(settings, nil)
	settingsRepo.On("Update", ctx, settings).Return(nil)

	rtp := true
	input := UpdateSystemSettingsInput{
		RoundingRelativeToPlan: &rtp,
	}

	result, err := svc.Update(ctx, tenantID, input)
	require.NoError(t, err)
	assert.True(t, result.RoundingRelativeToPlan)
	settingsRepo.AssertExpectations(t)
}

func TestSystemSettingsService_Update_InvalidBirthdayWindow(t *testing.T) {
	svc, settingsRepo, _, _, _, _, _ := newTestSystemSettingsService()
	ctx := context.Background()
	tenantID := uuid.New()
	settings := defaultSettings(tenantID)

	settingsRepo.On("GetOrCreate", ctx, tenantID).Return(settings, nil)

	tests := []struct {
		name  string
		value int
	}{
		{"negative before", -1},
		{"too large before", 91},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			v := tt.value
			input := UpdateSystemSettingsInput{
				BirthdayWindowDaysBefore: &v,
			}
			_, err := svc.Update(ctx, tenantID, input)
			assert.ErrorIs(t, err, ErrInvalidBirthdayWindow)
		})
	}
}

func TestSystemSettingsService_Update_InvalidServerAliveTime(t *testing.T) {
	svc, settingsRepo, _, _, _, _, _ := newTestSystemSettingsService()
	ctx := context.Background()
	tenantID := uuid.New()
	settings := defaultSettings(tenantID)

	settingsRepo.On("GetOrCreate", ctx, tenantID).Return(settings, nil)

	tests := []struct {
		name  string
		value int
	}{
		{"negative", -1},
		{"too large", 1440},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			v := tt.value
			input := UpdateSystemSettingsInput{
				ServerAliveExpectedCompletionTime: &v,
			}
			_, err := svc.Update(ctx, tenantID, input)
			assert.ErrorIs(t, err, ErrInvalidServerAliveTime)
		})
	}
}

func TestSystemSettingsService_Update_InvalidServerAliveThreshold(t *testing.T) {
	svc, settingsRepo, _, _, _, _, _ := newTestSystemSettingsService()
	ctx := context.Background()
	tenantID := uuid.New()
	settings := defaultSettings(tenantID)

	settingsRepo.On("GetOrCreate", ctx, tenantID).Return(settings, nil)

	v := 0
	input := UpdateSystemSettingsInput{
		ServerAliveThresholdMinutes: &v,
	}
	_, err := svc.Update(ctx, tenantID, input)
	assert.ErrorIs(t, err, ErrInvalidServerAliveThreshold)
}

func TestSystemSettingsService_Update_ValidBirthdayWindow(t *testing.T) {
	svc, settingsRepo, _, _, _, _, _ := newTestSystemSettingsService()
	ctx := context.Background()
	tenantID := uuid.New()
	settings := defaultSettings(tenantID)

	settingsRepo.On("GetOrCreate", ctx, tenantID).Return(settings, nil)
	settingsRepo.On("Update", ctx, settings).Return(nil)

	before := 14
	after := 30
	input := UpdateSystemSettingsInput{
		BirthdayWindowDaysBefore: &before,
		BirthdayWindowDaysAfter:  &after,
	}

	result, err := svc.Update(ctx, tenantID, input)
	require.NoError(t, err)
	assert.Equal(t, 14, result.BirthdayWindowDaysBefore)
	assert.Equal(t, 30, result.BirthdayWindowDaysAfter)
}

// --- Tests: DeleteBookings ---

func TestSystemSettingsService_DeleteBookings_Preview(t *testing.T) {
	svc, _, bookingRepo, _, _, _, _ := newTestSystemSettingsService()
	ctx := context.Background()
	tenantID := uuid.New()
	dateFrom := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	dateTo := time.Date(2025, 1, 31, 0, 0, 0, 0, time.UTC)

	bookingRepo.On("CountByDateRange", ctx, tenantID, dateFrom, dateTo, []uuid.UUID(nil)).Return(int64(42), nil)

	result, err := svc.DeleteBookings(ctx, tenantID, CleanupDateRangeInput{
		DateFrom: dateFrom,
		DateTo:   dateTo,
		Confirm:  false,
	})
	require.NoError(t, err)
	assert.True(t, result.Preview)
	assert.Equal(t, int64(42), result.AffectedCount)
	assert.Equal(t, "delete_bookings", result.Operation)
}

func TestSystemSettingsService_DeleteBookings_Execute(t *testing.T) {
	svc, _, bookingRepo, _, _, _, _ := newTestSystemSettingsService()
	ctx := context.Background()
	tenantID := uuid.New()
	dateFrom := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	dateTo := time.Date(2025, 1, 31, 0, 0, 0, 0, time.UTC)

	bookingRepo.On("DeleteByDateRange", ctx, tenantID, dateFrom, dateTo, []uuid.UUID(nil)).Return(int64(42), nil)

	result, err := svc.DeleteBookings(ctx, tenantID, CleanupDateRangeInput{
		DateFrom: dateFrom,
		DateTo:   dateTo,
		Confirm:  true,
	})
	require.NoError(t, err)
	assert.False(t, result.Preview)
	assert.Equal(t, int64(42), result.AffectedCount)
}

func TestSystemSettingsService_DeleteBookings_InvalidDateRange(t *testing.T) {
	svc, _, _, _, _, _, _ := newTestSystemSettingsService()
	ctx := context.Background()
	tenantID := uuid.New()

	_, err := svc.DeleteBookings(ctx, tenantID, CleanupDateRangeInput{
		DateFrom: time.Date(2025, 2, 1, 0, 0, 0, 0, time.UTC),
		DateTo:   time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		Confirm:  false,
	})
	assert.ErrorIs(t, err, ErrInvalidDateRange)
}

func TestSystemSettingsService_DeleteBookings_DateRangeTooLarge(t *testing.T) {
	svc, _, _, _, _, _, _ := newTestSystemSettingsService()
	ctx := context.Background()
	tenantID := uuid.New()

	_, err := svc.DeleteBookings(ctx, tenantID, CleanupDateRangeInput{
		DateFrom: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		DateTo:   time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC),
		Confirm:  false,
	})
	assert.ErrorIs(t, err, ErrDateRangeTooLarge)
}

// --- Tests: DeleteBookingData ---

func TestSystemSettingsService_DeleteBookingData_Preview(t *testing.T) {
	svc, _, bookingRepo, dailyValueRepo, _, _, _ := newTestSystemSettingsService()
	ctx := context.Background()
	tenantID := uuid.New()
	dateFrom := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	dateTo := time.Date(2025, 1, 31, 0, 0, 0, 0, time.UTC)

	bookingRepo.On("CountByDateRange", ctx, tenantID, dateFrom, dateTo, []uuid.UUID(nil)).Return(int64(10), nil)
	dailyValueRepo.On("CountByDateRange", ctx, tenantID, dateFrom, dateTo, []uuid.UUID(nil)).Return(int64(20), nil)

	result, err := svc.DeleteBookingData(ctx, tenantID, CleanupDateRangeInput{
		DateFrom: dateFrom,
		DateTo:   dateTo,
		Confirm:  false,
	})
	require.NoError(t, err)
	assert.True(t, result.Preview)
	assert.Equal(t, int64(30), result.AffectedCount)
	assert.Equal(t, "delete_booking_data", result.Operation)
}

func TestSystemSettingsService_DeleteBookingData_Execute(t *testing.T) {
	svc, _, bookingRepo, dailyValueRepo, edpRepo, _, _ := newTestSystemSettingsService()
	ctx := context.Background()
	tenantID := uuid.New()
	dateFrom := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	dateTo := time.Date(2025, 1, 31, 0, 0, 0, 0, time.UTC)

	bookingRepo.On("DeleteByDateRange", ctx, tenantID, dateFrom, dateTo, []uuid.UUID(nil)).Return(int64(10), nil)
	dailyValueRepo.On("DeleteByDateRange", ctx, tenantID, dateFrom, dateTo, []uuid.UUID(nil)).Return(int64(20), nil)
	edpRepo.On("DeleteByDateRange", ctx, tenantID, dateFrom, dateTo, []uuid.UUID(nil)).Return(int64(5), nil)

	result, err := svc.DeleteBookingData(ctx, tenantID, CleanupDateRangeInput{
		DateFrom: dateFrom,
		DateTo:   dateTo,
		Confirm:  true,
	})
	require.NoError(t, err)
	assert.False(t, result.Preview)
	assert.Equal(t, int64(35), result.AffectedCount)
	assert.Equal(t, int64(10), result.Details["bookings"])
	assert.Equal(t, int64(20), result.Details["daily_values"])
	assert.Equal(t, int64(5), result.Details["employee_day_plans"])
}

// --- Tests: ReReadBookings ---

func TestSystemSettingsService_ReReadBookings_Preview(t *testing.T) {
	svc, _, bookingRepo, _, _, _, _ := newTestSystemSettingsService()
	ctx := context.Background()
	tenantID := uuid.New()
	dateFrom := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	dateTo := time.Date(2025, 1, 31, 0, 0, 0, 0, time.UTC)

	bookingRepo.On("CountByDateRange", ctx, tenantID, dateFrom, dateTo, []uuid.UUID(nil)).Return(int64(100), nil)

	result, err := svc.ReReadBookings(ctx, tenantID, CleanupDateRangeInput{
		DateFrom: dateFrom,
		DateTo:   dateTo,
		Confirm:  false,
	})
	require.NoError(t, err)
	assert.True(t, result.Preview)
	assert.Equal(t, int64(100), result.AffectedCount)
}

func TestSystemSettingsService_ReReadBookings_ExecuteAll(t *testing.T) {
	svc, _, _, _, _, _, recalcSvc := newTestSystemSettingsService()
	ctx := context.Background()
	tenantID := uuid.New()
	dateFrom := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	dateTo := time.Date(2025, 1, 31, 0, 0, 0, 0, time.UTC)

	recalcSvc.On("TriggerRecalcAll", ctx, tenantID, dateFrom, dateTo).Return(&RecalcResult{
		ProcessedDays: 31,
		FailedDays:    0,
	}, nil)

	result, err := svc.ReReadBookings(ctx, tenantID, CleanupDateRangeInput{
		DateFrom: dateFrom,
		DateTo:   dateTo,
		Confirm:  true,
	})
	require.NoError(t, err)
	assert.False(t, result.Preview)
	assert.Equal(t, int64(31), result.AffectedCount)
	assert.Equal(t, "re_read_bookings", result.Operation)
}

func TestSystemSettingsService_ReReadBookings_ExecuteBatch(t *testing.T) {
	svc, _, _, _, _, _, recalcSvc := newTestSystemSettingsService()
	ctx := context.Background()
	tenantID := uuid.New()
	empIDs := []uuid.UUID{uuid.New(), uuid.New()}
	dateFrom := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	dateTo := time.Date(2025, 1, 31, 0, 0, 0, 0, time.UTC)

	recalcSvc.On("TriggerRecalcBatch", ctx, tenantID, empIDs, dateFrom, dateTo).Return(&RecalcResult{
		ProcessedDays: 62,
		FailedDays:    1,
	})

	result, err := svc.ReReadBookings(ctx, tenantID, CleanupDateRangeInput{
		DateFrom:    dateFrom,
		DateTo:      dateTo,
		EmployeeIDs: empIDs,
		Confirm:     true,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(62), result.AffectedCount)
}

// --- Tests: MarkDeleteOrders ---

func TestSystemSettingsService_MarkDeleteOrders_Preview(t *testing.T) {
	svc, _, _, _, _, orderRepo, _ := newTestSystemSettingsService()
	ctx := context.Background()
	tenantID := uuid.New()
	orderIDs := []uuid.UUID{uuid.New(), uuid.New()}

	orderRepo.On("CountByIDs", ctx, tenantID, orderIDs).Return(int64(2), nil)

	result, err := svc.MarkDeleteOrders(ctx, tenantID, CleanupOrdersInput{
		OrderIDs: orderIDs,
		Confirm:  false,
	})
	require.NoError(t, err)
	assert.True(t, result.Preview)
	assert.Equal(t, int64(2), result.AffectedCount)
	assert.Equal(t, "mark_delete_orders", result.Operation)
}

func TestSystemSettingsService_MarkDeleteOrders_Execute(t *testing.T) {
	svc, _, _, _, _, orderRepo, _ := newTestSystemSettingsService()
	ctx := context.Background()
	tenantID := uuid.New()
	orderIDs := []uuid.UUID{uuid.New(), uuid.New()}

	orderRepo.On("BulkDelete", ctx, tenantID, orderIDs).Return(int64(2), nil)

	result, err := svc.MarkDeleteOrders(ctx, tenantID, CleanupOrdersInput{
		OrderIDs: orderIDs,
		Confirm:  true,
	})
	require.NoError(t, err)
	assert.False(t, result.Preview)
	assert.Equal(t, int64(2), result.AffectedCount)
}

func TestSystemSettingsService_MarkDeleteOrders_NoOrderIDs(t *testing.T) {
	svc, _, _, _, _, _, _ := newTestSystemSettingsService()
	ctx := context.Background()
	tenantID := uuid.New()

	_, err := svc.MarkDeleteOrders(ctx, tenantID, CleanupOrdersInput{
		OrderIDs: []uuid.UUID{},
		Confirm:  false,
	})
	assert.ErrorIs(t, err, ErrCleanupNoOrderIDs)
}
