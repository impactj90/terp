package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

var (
	ErrOrderBookingNotFound         = errors.New("order booking not found")
	ErrOrderBookingOrderRequired    = errors.New("order ID is required")
	ErrOrderBookingEmployeeRequired = errors.New("employee ID is required")
	ErrOrderBookingDateRequired     = errors.New("booking date is required")
	ErrOrderBookingTimeRequired     = errors.New("time in minutes is required and must be positive")
)

// orderBookingRepository defines the interface for order booking data access.
type orderBookingRepository interface {
	Create(ctx context.Context, ob *model.OrderBooking) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.OrderBooking, error)
	Update(ctx context.Context, ob *model.OrderBooking) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, tenantID uuid.UUID, opts repository.OrderBookingListOptions) ([]model.OrderBooking, error)
	DeleteByEmployeeAndDate(ctx context.Context, employeeID uuid.UUID, date time.Time, source model.OrderBookingSource) error
}

// OrderBookingService provides business logic for order bookings.
type OrderBookingService struct {
	orderBookingRepo orderBookingRepository
}

// NewOrderBookingService creates a new OrderBookingService.
func NewOrderBookingService(orderBookingRepo orderBookingRepository) *OrderBookingService {
	return &OrderBookingService{orderBookingRepo: orderBookingRepo}
}

// CreateOrderBookingInput represents the input for creating an order booking.
type CreateOrderBookingInput struct {
	TenantID    uuid.UUID
	EmployeeID  uuid.UUID
	OrderID     uuid.UUID
	ActivityID  *uuid.UUID
	BookingDate string
	TimeMinutes int
	Description string
	Source      string
	CreatedBy   *uuid.UUID
}

// Create creates a new order booking with validation.
func (s *OrderBookingService) Create(ctx context.Context, input CreateOrderBookingInput) (*model.OrderBooking, error) {
	if input.OrderID == uuid.Nil {
		return nil, ErrOrderBookingOrderRequired
	}
	if input.EmployeeID == uuid.Nil {
		return nil, ErrOrderBookingEmployeeRequired
	}
	if input.BookingDate == "" {
		return nil, ErrOrderBookingDateRequired
	}
	if input.TimeMinutes <= 0 {
		return nil, ErrOrderBookingTimeRequired
	}

	bookingDate, err := parseDate(input.BookingDate)
	if err != nil {
		return nil, ErrOrderBookingDateRequired
	}

	source := model.OrderBookingSourceManual
	if input.Source != "" {
		source = model.OrderBookingSource(input.Source)
	}

	ob := &model.OrderBooking{
		TenantID:    input.TenantID,
		EmployeeID:  input.EmployeeID,
		OrderID:     input.OrderID,
		ActivityID:  input.ActivityID,
		BookingDate: bookingDate,
		TimeMinutes: input.TimeMinutes,
		Description: strings.TrimSpace(input.Description),
		Source:      source,
		CreatedBy:   input.CreatedBy,
		UpdatedBy:   input.CreatedBy,
	}

	if err := s.orderBookingRepo.Create(ctx, ob); err != nil {
		return nil, err
	}

	return s.orderBookingRepo.GetByID(ctx, ob.ID)
}

// GetByID retrieves an order booking by ID.
func (s *OrderBookingService) GetByID(ctx context.Context, id uuid.UUID) (*model.OrderBooking, error) {
	ob, err := s.orderBookingRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrOrderBookingNotFound
	}
	return ob, nil
}

// UpdateOrderBookingInput represents the input for updating an order booking.
type UpdateOrderBookingInput struct {
	OrderID     *uuid.UUID
	ActivityID  *uuid.UUID
	BookingDate *string
	TimeMinutes *int
	Description *string
	UpdatedBy   *uuid.UUID
}

// Update updates an order booking.
func (s *OrderBookingService) Update(ctx context.Context, id uuid.UUID, input UpdateOrderBookingInput) (*model.OrderBooking, error) {
	ob, err := s.orderBookingRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrOrderBookingNotFound
	}

	if input.OrderID != nil {
		ob.OrderID = *input.OrderID
	}
	if input.ActivityID != nil {
		ob.ActivityID = input.ActivityID
	}
	if input.BookingDate != nil {
		d, err := parseDate(*input.BookingDate)
		if err == nil {
			ob.BookingDate = d
		}
	}
	if input.TimeMinutes != nil {
		if *input.TimeMinutes <= 0 {
			return nil, ErrOrderBookingTimeRequired
		}
		ob.TimeMinutes = *input.TimeMinutes
	}
	if input.Description != nil {
		ob.Description = strings.TrimSpace(*input.Description)
	}
	if input.UpdatedBy != nil {
		ob.UpdatedBy = input.UpdatedBy
	}

	if err := s.orderBookingRepo.Update(ctx, ob); err != nil {
		return nil, err
	}

	return s.orderBookingRepo.GetByID(ctx, ob.ID)
}

// Delete deletes an order booking by ID.
func (s *OrderBookingService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.orderBookingRepo.GetByID(ctx, id)
	if err != nil {
		return ErrOrderBookingNotFound
	}
	return s.orderBookingRepo.Delete(ctx, id)
}

// ListOptions defines filter options for listing order bookings.
type OrderBookingListOptions struct {
	EmployeeID *uuid.UUID
	OrderID    *uuid.UUID
	DateFrom   *time.Time
	DateTo     *time.Time
}

// List retrieves order bookings for a tenant with optional filters.
func (s *OrderBookingService) List(ctx context.Context, tenantID uuid.UUID, opts OrderBookingListOptions) ([]model.OrderBooking, error) {
	return s.orderBookingRepo.List(ctx, tenantID, repository.OrderBookingListOptions{
		EmployeeID: opts.EmployeeID,
		OrderID:    opts.OrderID,
		DateFrom:   opts.DateFrom,
		DateTo:     opts.DateTo,
	})
}

// CreateAutoBooking creates an automatic order booking (used by daily calc for target_with_order).
func (s *OrderBookingService) CreateAutoBooking(ctx context.Context, tenantID, employeeID, orderID uuid.UUID, activityID *uuid.UUID, date time.Time, minutes int) (*model.OrderBooking, error) {
	ob := &model.OrderBooking{
		TenantID:    tenantID,
		EmployeeID:  employeeID,
		OrderID:     orderID,
		ActivityID:  activityID,
		BookingDate: date,
		TimeMinutes: minutes,
		Description: "Auto-generated from target_with_order",
		Source:      model.OrderBookingSourceAuto,
	}

	if err := s.orderBookingRepo.Create(ctx, ob); err != nil {
		return nil, err
	}

	return ob, nil
}

// DeleteAutoBookingsByDate deletes all auto-generated order bookings for an employee on a date.
func (s *OrderBookingService) DeleteAutoBookingsByDate(ctx context.Context, employeeID uuid.UUID, date time.Time) error {
	return s.orderBookingRepo.DeleteByEmployeeAndDate(ctx, employeeID, date, model.OrderBookingSourceAuto)
}
