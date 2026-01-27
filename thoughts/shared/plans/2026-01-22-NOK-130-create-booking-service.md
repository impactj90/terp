# NOK-130: Create Booking Service Implementation Plan

## Overview

Create the Booking Service with CRUD operations, validation, and recalculation triggering. The service will follow established codebase patterns: private repository interfaces, package-level error variables, and input structs for Create/Update operations.

## Current State Analysis

### Existing Components (All Implemented)

| Component | Location | Status |
|-----------|----------|--------|
| Booking Model | `apps/api/internal/model/booking.go` | DONE |
| Booking Repository | `apps/api/internal/repository/booking.go` | DONE |
| RecalcService | `apps/api/internal/service/recalc.go` | DONE |
| BookingType Repository | `apps/api/internal/repository/bookingtype.go` | DONE |

### Key Discoveries

1. **Repository method naming**: The repository uses `GetByEmployeeAndDate(tenantID, employeeID, date)` - requires tenantID parameter (`apps/api/internal/repository/booking.go:150`)
2. **Time values**: Stored as minutes from midnight (0-1439) in `OriginalTime`, `EditedTime`, `CalculatedTime` fields
3. **RecalcService interface**: `TriggerRecalc(ctx, tenantID, employeeID, date)` returns `*RecalcResult, error`
4. **Monthly Value Repository**: NOT yet implemented (TICKET-086) - month closure validation must be stubbed

## Desired End State

A fully functional `BookingService` that:
- Provides CRUD operations for bookings with proper validation
- Triggers recalculation after any create/update/delete operation
- Validates booking time values (0-1439 range)
- Validates booking type exists and belongs to tenant
- Stubs month closure check (ready for future integration)
- Has comprehensive unit tests with mocked dependencies

### Verification

1. All tests pass: `cd apps/api && go test -v ./internal/service/...`
2. No lint errors: `make lint`
3. Service integrates properly with existing repository and RecalcService

## What We're NOT Doing

- **Month closure validation** (TICKET-086 not implemented - stub only)
- **Booking overlap detection** - Per ZMI manual Section 21.1, bookings are paired during calculation, not at creation. Multiple bookings per day (come/go pairs, breaks) are the expected normal case. `ErrBookingOverlap` is defined for future use but not enforced.
- API handlers (separate ticket)
- Integration tests with real database

## Design Decisions Based on ZMI Reference

From `thoughts/shared/reference/zmi-calculataion-manual-reference.md`:

1. **Booking pairing**: Done during daily calculation, not at booking creation (Section 21.1)
2. **Three-value system**: Original (immutable), Edited (user-modifiable), Calculated (after tolerance/rounding) - already implemented in the model
3. **Multiple bookings per day**: Normal and expected for A1/A2 (come/go), P1/P2 (break), D1/D2 (work errand) pairs

## Implementation Approach

Single phase implementation:
1. Define error variables and private interfaces
2. Create input structs
3. Implement service struct and constructor
4. Implement all CRUD methods with validation and recalc triggering
5. Write comprehensive unit tests

## Phase 1: Implement Booking Service

### Overview

Create `apps/api/internal/service/booking.go` and `apps/api/internal/service/booking_test.go` with full CRUD functionality.

### Changes Required

#### 1. Create Service File

**File**: `apps/api/internal/service/booking.go`

```go
package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

// Booking service errors.
var (
	ErrBookingNotFound    = errors.New("booking not found")
	ErrMonthClosed        = errors.New("cannot modify closed month")
	ErrInvalidBookingTime = errors.New("invalid booking time")
	ErrBookingOverlap     = errors.New("overlapping bookings exist")
	ErrInvalidBookingType = errors.New("invalid booking type")
)

// bookingRepositoryForService defines the interface for booking data access.
type bookingRepositoryForService interface {
	Create(ctx context.Context, booking *model.Booking) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.Booking, error)
	Update(ctx context.Context, booking *model.Booking) error
	Delete(ctx context.Context, id uuid.UUID) error
	GetByEmployeeAndDate(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) ([]model.Booking, error)
	GetByDateRange(ctx context.Context, tenantID uuid.UUID, startDate, endDate time.Time) ([]model.Booking, error)
}

// bookingTypeRepositoryForService defines the interface for booking type validation.
type bookingTypeRepositoryForService interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.BookingType, error)
}

// recalcServiceForBooking defines the interface for triggering recalculation.
type recalcServiceForBooking interface {
	TriggerRecalc(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*RecalcResult, error)
}

// monthlyValueLookupForBooking checks if a month is closed (optional dependency).
type monthlyValueLookupForBooking interface {
	IsMonthClosed(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (bool, error)
}

// BookingService handles booking business logic.
type BookingService struct {
	bookingRepo      bookingRepositoryForService
	bookingTypeRepo  bookingTypeRepositoryForService
	recalcSvc        recalcServiceForBooking
	monthlyValueRepo monthlyValueLookupForBooking // Optional - may be nil until TICKET-086
}

// NewBookingService creates a new BookingService instance.
func NewBookingService(
	bookingRepo bookingRepositoryForService,
	bookingTypeRepo bookingTypeRepositoryForService,
	recalcSvc recalcServiceForBooking,
	monthlyValueRepo monthlyValueLookupForBooking,
) *BookingService {
	return &BookingService{
		bookingRepo:      bookingRepo,
		bookingTypeRepo:  bookingTypeRepo,
		recalcSvc:        recalcSvc,
		monthlyValueRepo: monthlyValueRepo,
	}
}

// CreateBookingInput represents the input for creating a booking.
type CreateBookingInput struct {
	TenantID      uuid.UUID
	EmployeeID    uuid.UUID
	BookingTypeID uuid.UUID
	BookingDate   time.Time
	OriginalTime  int // Minutes from midnight (0-1439)
	EditedTime    int // Minutes from midnight (0-1439)
	Source        model.BookingSource
	TerminalID    *uuid.UUID
	Notes         string
	CreatedBy     *uuid.UUID
}

// UpdateBookingInput represents the input for updating a booking.
type UpdateBookingInput struct {
	EditedTime *int
	Notes      *string
	UpdatedBy  *uuid.UUID
}

// Create creates a new booking with validation and triggers recalculation.
func (s *BookingService) Create(ctx context.Context, input CreateBookingInput) (*model.Booking, error) {
	// Validate time values
	if err := s.validateTime(input.OriginalTime); err != nil {
		return nil, err
	}
	if err := s.validateTime(input.EditedTime); err != nil {
		return nil, err
	}

	// Check month not closed
	if err := s.checkMonthNotClosed(ctx, input.TenantID, input.EmployeeID, input.BookingDate); err != nil {
		return nil, err
	}

	// Validate booking type exists
	bt, err := s.bookingTypeRepo.GetByID(ctx, input.BookingTypeID)
	if err != nil {
		return nil, ErrInvalidBookingType
	}
	// Verify booking type is accessible by tenant (system types have nil TenantID)
	if bt.TenantID != nil && *bt.TenantID != input.TenantID {
		return nil, ErrInvalidBookingType
	}

	// Build model
	booking := &model.Booking{
		TenantID:      input.TenantID,
		EmployeeID:    input.EmployeeID,
		BookingTypeID: input.BookingTypeID,
		BookingDate:   input.BookingDate,
		OriginalTime:  input.OriginalTime,
		EditedTime:    input.EditedTime,
		Source:        input.Source,
		TerminalID:    input.TerminalID,
		Notes:         input.Notes,
		CreatedBy:     input.CreatedBy,
		UpdatedBy:     input.CreatedBy,
	}

	// Create booking
	if err := s.bookingRepo.Create(ctx, booking); err != nil {
		return nil, err
	}

	// Trigger recalculation for the affected date
	_, _ = s.recalcSvc.TriggerRecalc(ctx, input.TenantID, input.EmployeeID, input.BookingDate)

	return booking, nil
}

// GetByID retrieves a booking by ID.
func (s *BookingService) GetByID(ctx context.Context, id uuid.UUID) (*model.Booking, error) {
	booking, err := s.bookingRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrBookingNotFound
	}
	return booking, nil
}

// Update updates a booking and triggers recalculation.
func (s *BookingService) Update(ctx context.Context, id uuid.UUID, input UpdateBookingInput) (*model.Booking, error) {
	// Get existing booking
	booking, err := s.bookingRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrBookingNotFound
	}

	// Check month not closed
	if err := s.checkMonthNotClosed(ctx, booking.TenantID, booking.EmployeeID, booking.BookingDate); err != nil {
		return nil, err
	}

	// Apply updates
	if input.EditedTime != nil {
		if err := s.validateTime(*input.EditedTime); err != nil {
			return nil, err
		}
		booking.EditedTime = *input.EditedTime
		// Clear calculated time when edited time changes
		booking.CalculatedTime = nil
	}
	if input.Notes != nil {
		booking.Notes = *input.Notes
	}
	if input.UpdatedBy != nil {
		booking.UpdatedBy = input.UpdatedBy
	}

	// Save changes
	if err := s.bookingRepo.Update(ctx, booking); err != nil {
		return nil, err
	}

	// Trigger recalculation for the affected date
	_, _ = s.recalcSvc.TriggerRecalc(ctx, booking.TenantID, booking.EmployeeID, booking.BookingDate)

	return booking, nil
}

// Delete deletes a booking and triggers recalculation.
func (s *BookingService) Delete(ctx context.Context, id uuid.UUID) error {
	// Get existing booking to check ownership and get date for recalc
	booking, err := s.bookingRepo.GetByID(ctx, id)
	if err != nil {
		return ErrBookingNotFound
	}

	// Check month not closed
	if err := s.checkMonthNotClosed(ctx, booking.TenantID, booking.EmployeeID, booking.BookingDate); err != nil {
		return err
	}

	// Store values for recalc before deletion
	tenantID := booking.TenantID
	employeeID := booking.EmployeeID
	bookingDate := booking.BookingDate

	// Delete booking
	if err := s.bookingRepo.Delete(ctx, id); err != nil {
		return err
	}

	// Trigger recalculation for the affected date
	_, _ = s.recalcSvc.TriggerRecalc(ctx, tenantID, employeeID, bookingDate)

	return nil
}

// ListByEmployeeDate retrieves all bookings for an employee on a specific date.
func (s *BookingService) ListByEmployeeDate(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) ([]model.Booking, error) {
	return s.bookingRepo.GetByEmployeeAndDate(ctx, tenantID, employeeID, date)
}

// ListByEmployeeDateRange retrieves all bookings for an employee within a date range.
func (s *BookingService) ListByEmployeeDateRange(ctx context.Context, tenantID uuid.UUID, employeeID uuid.UUID, from, to time.Time) ([]model.Booking, error) {
	// GetByDateRange returns all bookings for tenant; filter by employee
	bookings, err := s.bookingRepo.GetByDateRange(ctx, tenantID, from, to)
	if err != nil {
		return nil, err
	}

	// Filter by employee
	var result []model.Booking
	for _, b := range bookings {
		if b.EmployeeID == employeeID {
			result = append(result, b)
		}
	}
	return result, nil
}

// validateTime checks if minutes from midnight is valid (0-1439).
func (s *BookingService) validateTime(minutes int) error {
	if minutes < 0 || minutes > 1439 {
		return ErrInvalidBookingTime
	}
	return nil
}

// checkMonthNotClosed verifies the month is not closed for modifications.
func (s *BookingService) checkMonthNotClosed(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) error {
	// Skip check if monthly value repo not yet implemented
	if s.monthlyValueRepo == nil {
		return nil
	}

	closed, err := s.monthlyValueRepo.IsMonthClosed(ctx, tenantID, employeeID, date)
	if err != nil {
		return err
	}
	if closed {
		return ErrMonthClosed
	}
	return nil
}
```

#### 2. Create Test File

**File**: `apps/api/internal/service/booking_test.go`

```go
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
```

### Success Criteria

#### Automated Verification:
- [x] Tests pass: `cd apps/api && go test -v ./internal/service/booking_test.go`
- [x] All service tests pass: `cd apps/api && go test -v ./internal/service/...`
- [x] Linting passes: `make lint` (golangci-lint not installed; `go vet` passed)
- [x] Build succeeds: `cd apps/api && go build ./...`

#### Manual Verification:
- [ ] Review code follows established patterns (compare with `costcenter.go`, `recalc.go`)
- [ ] Verify error types match ticket requirements
- [ ] Confirm recalc is triggered after each mutating operation

---

## Testing Strategy

### Unit Tests (Covered in Phase 1)

1. **Create operations**:
   - Success with tenant-specific booking type
   - Success with system booking type (nil TenantID)
   - Invalid time values (negative, > 1439)
   - Invalid booking type (not found)
   - Invalid booking type (wrong tenant)
   - Month closed error
   - Monthly value repo nil (skips check)

2. **GetByID operations**:
   - Success
   - Not found

3. **Update operations**:
   - Success with time and notes update
   - Not found
   - Invalid time
   - Month closed error
   - Clears calculated time on edit

4. **Delete operations**:
   - Success
   - Not found
   - Month closed error
   - Recalc triggered after deletion

5. **List operations**:
   - ListByEmployeeDate returns correct bookings
   - ListByEmployeeDateRange filters by employee

### Edge Cases

- Time value 0 (midnight) is valid
- Time value 1439 (23:59) is valid
- System booking types (TenantID nil) accessible by all tenants

## Performance Considerations

- Recalc is triggered synchronously after each mutation
- For bulk imports, consider batching recalcs (future enhancement)
- ListByEmployeeDateRange filters in-memory after fetching; acceptable for typical date ranges

## Migration Notes

None required - service layer only, no schema changes.

## References

- Linear ticket: NOK-130
- Research: `thoughts/shared/research/2026-01-22-NOK-130-create-booking-service.md`
- RecalcService: `apps/api/internal/service/recalc.go`
- Booking Repository: `apps/api/internal/repository/booking.go`
- Pattern reference: `apps/api/internal/service/costcenter.go`
