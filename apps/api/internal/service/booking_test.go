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

// Mock implementations

type mockBookingRepositoryForService struct {
	mock.Mock
}

func (m *mockBookingRepositoryForService) Create(ctx context.Context, booking *model.Booking) error {
	args := m.Called(ctx, booking)
	return args.Error(0)
}

func (m *mockBookingRepositoryForService) GetByID(ctx context.Context, id uuid.UUID) (*model.Booking, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.Booking), args.Error(1)
}

func (m *mockBookingRepositoryForService) Update(ctx context.Context, booking *model.Booking) error {
	args := m.Called(ctx, booking)
	return args.Error(0)
}

func (m *mockBookingRepositoryForService) Delete(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func (m *mockBookingRepositoryForService) GetByEmployeeAndDate(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) ([]model.Booking, error) {
	args := m.Called(ctx, tenantID, employeeID, date)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.Booking), args.Error(1)
}

func (m *mockBookingRepositoryForService) GetByDateRange(ctx context.Context, tenantID uuid.UUID, startDate, endDate time.Time) ([]model.Booking, error) {
	args := m.Called(ctx, tenantID, startDate, endDate)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.Booking), args.Error(1)
}

type mockBookingTypeRepositoryForService struct {
	mock.Mock
}

func (m *mockBookingTypeRepositoryForService) GetByID(ctx context.Context, id uuid.UUID) (*model.BookingType, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.BookingType), args.Error(1)
}

type mockRecalcServiceForBooking struct {
	mock.Mock
}

func (m *mockRecalcServiceForBooking) TriggerRecalc(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*RecalcResult, error) {
	args := m.Called(ctx, tenantID, employeeID, date)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*RecalcResult), args.Error(1)
}

type mockMonthlyValueLookupForBooking struct {
	mock.Mock
}

func (m *mockMonthlyValueLookupForBooking) IsMonthClosed(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (bool, error) {
	args := m.Called(ctx, tenantID, employeeID, date)
	return args.Bool(0), args.Error(1)
}

// Helper to create a test service with mocks
func newTestBookingService() (*BookingService, *mockBookingRepositoryForService, *mockBookingTypeRepositoryForService, *mockRecalcServiceForBooking, *mockMonthlyValueLookupForBooking) {
	bookingRepo := new(mockBookingRepositoryForService)
	bookingTypeRepo := new(mockBookingTypeRepositoryForService)
	recalcSvc := new(mockRecalcServiceForBooking)
	monthlyValueRepo := new(mockMonthlyValueLookupForBooking)

	svc := NewBookingService(bookingRepo, bookingTypeRepo, recalcSvc, monthlyValueRepo)
	return svc, bookingRepo, bookingTypeRepo, recalcSvc, monthlyValueRepo
}

// Tests

func TestBookingService_Create_Success(t *testing.T) {
	ctx := context.Background()
	svc, bookingRepo, bookingTypeRepo, recalcSvc, monthlyValueRepo := newTestBookingService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	bookingTypeID := uuid.New()
	date := time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC)

	input := CreateBookingInput{
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		BookingTypeID: bookingTypeID,
		BookingDate:   date,
		OriginalTime:  480, // 08:00
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
		Notes:         "Morning arrival",
	}

	// Mock expectations
	monthlyValueRepo.On("IsMonthClosed", ctx, tenantID, employeeID, date).Return(false, nil)
	bookingTypeRepo.On("GetByID", ctx, bookingTypeID).Return(&model.BookingType{
		ID:       bookingTypeID,
		TenantID: &tenantID,
		IsActive: true,
	}, nil)
	bookingRepo.On("Create", ctx, mock.MatchedBy(func(b *model.Booking) bool {
		return b.TenantID == tenantID && b.EmployeeID == employeeID && b.OriginalTime == 480
	})).Return(nil)
	recalcSvc.On("TriggerRecalc", ctx, tenantID, employeeID, date).Return(&RecalcResult{ProcessedDays: 1}, nil)

	result, err := svc.Create(ctx, input)

	require.NoError(t, err)
	assert.Equal(t, tenantID, result.TenantID)
	assert.Equal(t, employeeID, result.EmployeeID)
	assert.Equal(t, 480, result.OriginalTime)
	assert.Equal(t, "Morning arrival", result.Notes)
	bookingRepo.AssertExpectations(t)
	bookingTypeRepo.AssertExpectations(t)
	recalcSvc.AssertExpectations(t)
}

func TestBookingService_Create_SystemBookingType(t *testing.T) {
	ctx := context.Background()
	svc, bookingRepo, bookingTypeRepo, recalcSvc, monthlyValueRepo := newTestBookingService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	systemBookingTypeID := uuid.New()
	date := time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC)

	input := CreateBookingInput{
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		BookingTypeID: systemBookingTypeID,
		BookingDate:   date,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceTerminal,
	}

	// System booking type has nil TenantID
	monthlyValueRepo.On("IsMonthClosed", ctx, tenantID, employeeID, date).Return(false, nil)
	bookingTypeRepo.On("GetByID", ctx, systemBookingTypeID).Return(&model.BookingType{
		ID:       systemBookingTypeID,
		TenantID: nil, // System type
		IsSystem: true,
		IsActive: true,
	}, nil)
	bookingRepo.On("Create", ctx, mock.Anything).Return(nil)
	recalcSvc.On("TriggerRecalc", ctx, tenantID, employeeID, date).Return(&RecalcResult{}, nil)

	result, err := svc.Create(ctx, input)

	require.NoError(t, err)
	assert.NotNil(t, result)
}

func TestBookingService_Create_InvalidTime(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _ := newTestBookingService()

	tests := []struct {
		name         string
		originalTime int
		editedTime   int
	}{
		{"negative original time", -1, 480},
		{"negative edited time", 480, -1},
		{"original time > 1439", 1440, 480},
		{"edited time > 1439", 480, 1500},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			input := CreateBookingInput{
				TenantID:      uuid.New(),
				EmployeeID:    uuid.New(),
				BookingTypeID: uuid.New(),
				BookingDate:   time.Now(),
				OriginalTime:  tt.originalTime,
				EditedTime:    tt.editedTime,
				Source:        model.BookingSourceWeb,
			}

			_, err := svc.Create(ctx, input)

			assert.ErrorIs(t, err, ErrInvalidBookingTime)
		})
	}
}

func TestBookingService_Create_InvalidBookingType(t *testing.T) {
	ctx := context.Background()
	svc, _, bookingTypeRepo, _, monthlyValueRepo := newTestBookingService()

	tenantID := uuid.New()
	otherTenantID := uuid.New()
	employeeID := uuid.New()
	bookingTypeID := uuid.New()
	date := time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC)

	input := CreateBookingInput{
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		BookingTypeID: bookingTypeID,
		BookingDate:   date,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}

	monthlyValueRepo.On("IsMonthClosed", ctx, tenantID, employeeID, date).Return(false, nil)
	// Booking type belongs to different tenant
	bookingTypeRepo.On("GetByID", ctx, bookingTypeID).Return(&model.BookingType{
		ID:       bookingTypeID,
		TenantID: &otherTenantID, // Different tenant
	}, nil)

	_, err := svc.Create(ctx, input)

	assert.ErrorIs(t, err, ErrInvalidBookingType)
}

func TestBookingService_Create_BookingTypeNotFound(t *testing.T) {
	ctx := context.Background()
	svc, _, bookingTypeRepo, _, monthlyValueRepo := newTestBookingService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	bookingTypeID := uuid.New()
	date := time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC)

	input := CreateBookingInput{
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		BookingTypeID: bookingTypeID,
		BookingDate:   date,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}

	monthlyValueRepo.On("IsMonthClosed", ctx, tenantID, employeeID, date).Return(false, nil)
	bookingTypeRepo.On("GetByID", ctx, bookingTypeID).Return(nil, errors.New("not found"))

	_, err := svc.Create(ctx, input)

	assert.ErrorIs(t, err, ErrInvalidBookingType)
}

func TestBookingService_Create_MonthClosed(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, monthlyValueRepo := newTestBookingService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	date := time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC)

	input := CreateBookingInput{
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		BookingTypeID: uuid.New(),
		BookingDate:   date,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}

	monthlyValueRepo.On("IsMonthClosed", ctx, tenantID, employeeID, date).Return(true, nil)

	_, err := svc.Create(ctx, input)

	assert.ErrorIs(t, err, ErrMonthClosed)
}

func TestBookingService_Create_MonthlyValueRepoNil(t *testing.T) {
	ctx := context.Background()
	bookingRepo := new(mockBookingRepositoryForService)
	bookingTypeRepo := new(mockBookingTypeRepositoryForService)
	recalcSvc := new(mockRecalcServiceForBooking)

	// Create service without monthly value repo (nil)
	svc := NewBookingService(bookingRepo, bookingTypeRepo, recalcSvc, nil)

	tenantID := uuid.New()
	employeeID := uuid.New()
	bookingTypeID := uuid.New()
	date := time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC)

	input := CreateBookingInput{
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		BookingTypeID: bookingTypeID,
		BookingDate:   date,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}

	bookingTypeRepo.On("GetByID", ctx, bookingTypeID).Return(&model.BookingType{
		ID:       bookingTypeID,
		TenantID: &tenantID,
	}, nil)
	bookingRepo.On("Create", ctx, mock.Anything).Return(nil)
	recalcSvc.On("TriggerRecalc", ctx, tenantID, employeeID, date).Return(&RecalcResult{}, nil)

	// Should succeed without month closure check
	result, err := svc.Create(ctx, input)

	require.NoError(t, err)
	assert.NotNil(t, result)
}

func TestBookingService_GetByID_Success(t *testing.T) {
	ctx := context.Background()
	svc, bookingRepo, _, _, _ := newTestBookingService()

	bookingID := uuid.New()
	expectedBooking := &model.Booking{
		ID:           bookingID,
		TenantID:     uuid.New(),
		OriginalTime: 480,
	}

	bookingRepo.On("GetByID", ctx, bookingID).Return(expectedBooking, nil)

	result, err := svc.GetByID(ctx, bookingID)

	require.NoError(t, err)
	assert.Equal(t, bookingID, result.ID)
	bookingRepo.AssertExpectations(t)
}

func TestBookingService_GetByID_NotFound(t *testing.T) {
	ctx := context.Background()
	svc, bookingRepo, _, _, _ := newTestBookingService()

	bookingID := uuid.New()
	bookingRepo.On("GetByID", ctx, bookingID).Return(nil, errors.New("not found"))

	_, err := svc.GetByID(ctx, bookingID)

	assert.ErrorIs(t, err, ErrBookingNotFound)
}

func TestBookingService_Update_Success(t *testing.T) {
	ctx := context.Background()
	svc, bookingRepo, _, recalcSvc, monthlyValueRepo := newTestBookingService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	bookingID := uuid.New()
	date := time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC)

	existingBooking := &model.Booking{
		ID:           bookingID,
		TenantID:     tenantID,
		EmployeeID:   employeeID,
		BookingDate:  date,
		OriginalTime: 480,
		EditedTime:   480,
	}

	newTime := 495 // 08:15
	newNotes := "Updated notes"
	input := UpdateBookingInput{
		EditedTime: &newTime,
		Notes:      &newNotes,
	}

	bookingRepo.On("GetByID", ctx, bookingID).Return(existingBooking, nil)
	monthlyValueRepo.On("IsMonthClosed", ctx, tenantID, employeeID, date).Return(false, nil)
	bookingRepo.On("Update", ctx, mock.MatchedBy(func(b *model.Booking) bool {
		return b.EditedTime == 495 && b.Notes == "Updated notes" && b.CalculatedTime == nil
	})).Return(nil)
	recalcSvc.On("TriggerRecalc", ctx, tenantID, employeeID, date).Return(&RecalcResult{}, nil)

	result, err := svc.Update(ctx, bookingID, input)

	require.NoError(t, err)
	assert.Equal(t, 495, result.EditedTime)
	assert.Equal(t, "Updated notes", result.Notes)
	assert.Nil(t, result.CalculatedTime)
	bookingRepo.AssertExpectations(t)
	recalcSvc.AssertExpectations(t)
}

func TestBookingService_Update_NotFound(t *testing.T) {
	ctx := context.Background()
	svc, bookingRepo, _, _, _ := newTestBookingService()

	bookingID := uuid.New()
	bookingRepo.On("GetByID", ctx, bookingID).Return(nil, errors.New("not found"))

	_, err := svc.Update(ctx, bookingID, UpdateBookingInput{})

	assert.ErrorIs(t, err, ErrBookingNotFound)
}

func TestBookingService_Update_InvalidTime(t *testing.T) {
	ctx := context.Background()
	svc, bookingRepo, _, _, monthlyValueRepo := newTestBookingService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	bookingID := uuid.New()
	date := time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC)

	existingBooking := &model.Booking{
		ID:          bookingID,
		TenantID:    tenantID,
		EmployeeID:  employeeID,
		BookingDate: date,
	}

	invalidTime := 1500
	input := UpdateBookingInput{EditedTime: &invalidTime}

	bookingRepo.On("GetByID", ctx, bookingID).Return(existingBooking, nil)
	monthlyValueRepo.On("IsMonthClosed", ctx, tenantID, employeeID, date).Return(false, nil)

	_, err := svc.Update(ctx, bookingID, input)

	assert.ErrorIs(t, err, ErrInvalidBookingTime)
}

func TestBookingService_Update_MonthClosed(t *testing.T) {
	ctx := context.Background()
	svc, bookingRepo, _, _, monthlyValueRepo := newTestBookingService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	bookingID := uuid.New()
	date := time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC)

	existingBooking := &model.Booking{
		ID:          bookingID,
		TenantID:    tenantID,
		EmployeeID:  employeeID,
		BookingDate: date,
	}

	bookingRepo.On("GetByID", ctx, bookingID).Return(existingBooking, nil)
	monthlyValueRepo.On("IsMonthClosed", ctx, tenantID, employeeID, date).Return(true, nil)

	_, err := svc.Update(ctx, bookingID, UpdateBookingInput{})

	assert.ErrorIs(t, err, ErrMonthClosed)
}

func TestBookingService_Delete_Success(t *testing.T) {
	ctx := context.Background()
	svc, bookingRepo, _, recalcSvc, monthlyValueRepo := newTestBookingService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	bookingID := uuid.New()
	date := time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC)

	existingBooking := &model.Booking{
		ID:          bookingID,
		TenantID:    tenantID,
		EmployeeID:  employeeID,
		BookingDate: date,
	}

	bookingRepo.On("GetByID", ctx, bookingID).Return(existingBooking, nil)
	monthlyValueRepo.On("IsMonthClosed", ctx, tenantID, employeeID, date).Return(false, nil)
	bookingRepo.On("Delete", ctx, bookingID).Return(nil)
	recalcSvc.On("TriggerRecalc", ctx, tenantID, employeeID, date).Return(&RecalcResult{}, nil)

	err := svc.Delete(ctx, bookingID)

	require.NoError(t, err)
	bookingRepo.AssertExpectations(t)
	recalcSvc.AssertExpectations(t)
}

func TestBookingService_Delete_NotFound(t *testing.T) {
	ctx := context.Background()
	svc, bookingRepo, _, _, _ := newTestBookingService()

	bookingID := uuid.New()
	bookingRepo.On("GetByID", ctx, bookingID).Return(nil, errors.New("not found"))

	err := svc.Delete(ctx, bookingID)

	assert.ErrorIs(t, err, ErrBookingNotFound)
}

func TestBookingService_Delete_MonthClosed(t *testing.T) {
	ctx := context.Background()
	svc, bookingRepo, _, _, monthlyValueRepo := newTestBookingService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	bookingID := uuid.New()
	date := time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC)

	existingBooking := &model.Booking{
		ID:          bookingID,
		TenantID:    tenantID,
		EmployeeID:  employeeID,
		BookingDate: date,
	}

	bookingRepo.On("GetByID", ctx, bookingID).Return(existingBooking, nil)
	monthlyValueRepo.On("IsMonthClosed", ctx, tenantID, employeeID, date).Return(true, nil)

	err := svc.Delete(ctx, bookingID)

	assert.ErrorIs(t, err, ErrMonthClosed)
}

func TestBookingService_ListByEmployeeDate_Success(t *testing.T) {
	ctx := context.Background()
	svc, bookingRepo, _, _, _ := newTestBookingService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	date := time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC)

	expectedBookings := []model.Booking{
		{ID: uuid.New(), EmployeeID: employeeID, OriginalTime: 480},
		{ID: uuid.New(), EmployeeID: employeeID, OriginalTime: 1020},
	}

	bookingRepo.On("GetByEmployeeAndDate", ctx, tenantID, employeeID, date).Return(expectedBookings, nil)

	result, err := svc.ListByEmployeeDate(ctx, tenantID, employeeID, date)

	require.NoError(t, err)
	assert.Len(t, result, 2)
	bookingRepo.AssertExpectations(t)
}

func TestBookingService_ListByEmployeeDateRange_Success(t *testing.T) {
	ctx := context.Background()
	svc, bookingRepo, _, _, _ := newTestBookingService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	otherEmployeeID := uuid.New()
	from := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC)

	// GetByDateRange returns bookings for all employees
	allBookings := []model.Booking{
		{ID: uuid.New(), EmployeeID: employeeID, OriginalTime: 480},
		{ID: uuid.New(), EmployeeID: otherEmployeeID, OriginalTime: 480}, // Different employee
		{ID: uuid.New(), EmployeeID: employeeID, OriginalTime: 1020},
	}

	bookingRepo.On("GetByDateRange", ctx, tenantID, from, to).Return(allBookings, nil)

	result, err := svc.ListByEmployeeDateRange(ctx, tenantID, employeeID, from, to)

	require.NoError(t, err)
	assert.Len(t, result, 2) // Only the employee's bookings
	for _, b := range result {
		assert.Equal(t, employeeID, b.EmployeeID)
	}
}

func TestBookingService_ValidateTime(t *testing.T) {
	svc := &BookingService{}

	tests := []struct {
		name    string
		minutes int
		wantErr bool
	}{
		{"valid 0", 0, false},
		{"valid 480 (08:00)", 480, false},
		{"valid 1439 (23:59)", 1439, false},
		{"invalid -1", -1, true},
		{"invalid 1440", 1440, true},
		{"invalid large", 2000, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := svc.validateTime(tt.minutes)
			if tt.wantErr {
				assert.ErrorIs(t, err, ErrInvalidBookingTime)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}
