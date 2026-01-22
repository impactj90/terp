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
