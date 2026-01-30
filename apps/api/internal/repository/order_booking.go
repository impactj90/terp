package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrOrderBookingNotFound = errors.New("order booking not found")
)

// OrderBookingListOptions defines filter options for listing order bookings.
type OrderBookingListOptions struct {
	EmployeeID *uuid.UUID
	OrderID    *uuid.UUID
	DateFrom   *time.Time
	DateTo     *time.Time
}

// OrderBookingRepository handles order booking data access.
type OrderBookingRepository struct {
	db *DB
}

// NewOrderBookingRepository creates a new order booking repository.
func NewOrderBookingRepository(db *DB) *OrderBookingRepository {
	return &OrderBookingRepository{db: db}
}

// Create creates a new order booking.
func (r *OrderBookingRepository) Create(ctx context.Context, ob *model.OrderBooking) error {
	return r.db.GORM.WithContext(ctx).
		Select("TenantID", "EmployeeID", "OrderID", "ActivityID", "BookingDate", "TimeMinutes", "Description", "Source", "CreatedBy", "UpdatedBy").
		Create(ob).Error
}

// GetByID retrieves an order booking by ID.
func (r *OrderBookingRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.OrderBooking, error) {
	var ob model.OrderBooking
	err := r.db.GORM.WithContext(ctx).
		Preload("Employee").
		Preload("Order").
		Preload("Activity").
		First(&ob, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrOrderBookingNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get order booking: %w", err)
	}
	return &ob, nil
}

// Update updates an order booking.
func (r *OrderBookingRepository) Update(ctx context.Context, ob *model.OrderBooking) error {
	return r.db.GORM.WithContext(ctx).Save(ob).Error
}

// Delete deletes an order booking by ID.
func (r *OrderBookingRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.OrderBooking{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete order booking: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrOrderBookingNotFound
	}
	return nil
}

// List retrieves order bookings for a tenant with optional filters.
func (r *OrderBookingRepository) List(ctx context.Context, tenantID uuid.UUID, opts OrderBookingListOptions) ([]model.OrderBooking, error) {
	var bookings []model.OrderBooking
	q := r.db.GORM.WithContext(ctx).
		Preload("Employee").
		Preload("Order").
		Preload("Activity").
		Where("tenant_id = ?", tenantID)

	if opts.EmployeeID != nil {
		q = q.Where("employee_id = ?", *opts.EmployeeID)
	}
	if opts.OrderID != nil {
		q = q.Where("order_id = ?", *opts.OrderID)
	}
	if opts.DateFrom != nil {
		q = q.Where("booking_date >= ?", *opts.DateFrom)
	}
	if opts.DateTo != nil {
		q = q.Where("booking_date <= ?", *opts.DateTo)
	}

	err := q.Order("booking_date DESC, created_at DESC").
		Find(&bookings).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list order bookings: %w", err)
	}
	return bookings, nil
}

// DeleteByEmployeeAndDate deletes all order bookings for an employee on a date with a specific source.
func (r *OrderBookingRepository) DeleteByEmployeeAndDate(ctx context.Context, employeeID uuid.UUID, date time.Time, source model.OrderBookingSource) error {
	return r.db.GORM.WithContext(ctx).
		Where("employee_id = ? AND booking_date = ? AND source = ?", employeeID, date, source).
		Delete(&model.OrderBooking{}).Error
}
