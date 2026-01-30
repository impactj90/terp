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
	ErrBookingNotFound = errors.New("booking not found")
)

// BookingFilter defines filter criteria for listing bookings.
type BookingFilter struct {
	TenantID           uuid.UUID
	EmployeeID         *uuid.UUID
	DepartmentID       *uuid.UUID
	BookingTypeID      *uuid.UUID
	StartDate          *time.Time
	EndDate            *time.Time
	Direction          *model.BookingDirection // filter by booking type direction
	Source             *model.BookingSource
	HasPair            *bool // nil = all, true = only paired, false = only unpaired
	ScopeType          model.DataScopeType
	ScopeDepartmentIDs []uuid.UUID
	ScopeEmployeeIDs   []uuid.UUID
	Offset             int
	Limit              int
}

// BookingRepository handles booking data access.
type BookingRepository struct {
	db *DB
}

// NewBookingRepository creates a new booking repository.
func NewBookingRepository(db *DB) *BookingRepository {
	return &BookingRepository{db: db}
}

// Create creates a new booking.
func (r *BookingRepository) Create(ctx context.Context, booking *model.Booking) error {
	return r.db.GORM.WithContext(ctx).Create(booking).Error
}

// GetByID retrieves a booking by ID.
func (r *BookingRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Booking, error) {
	var booking model.Booking
	err := r.db.GORM.WithContext(ctx).
		First(&booking, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrBookingNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get booking: %w", err)
	}
	return &booking, nil
}

// GetWithDetails retrieves a booking with related data preloaded.
func (r *BookingRepository) GetWithDetails(ctx context.Context, id uuid.UUID) (*model.Booking, error) {
	var booking model.Booking
	err := r.db.GORM.WithContext(ctx).
		Preload("Employee").
		Preload("BookingType").
		Preload("Pair").
		Where("id = ?", id).
		First(&booking).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrBookingNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get booking with details: %w", err)
	}
	return &booking, nil
}

// Update updates a booking.
func (r *BookingRepository) Update(ctx context.Context, booking *model.Booking) error {
	return r.db.GORM.WithContext(ctx).Save(booking).Error
}

// Delete deletes a booking by ID.
func (r *BookingRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.Booking{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete booking: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrBookingNotFound
	}
	return nil
}

// List retrieves bookings with filtering and pagination.
func (r *BookingRepository) List(ctx context.Context, filter BookingFilter) ([]model.Booking, int64, error) {
	var bookings []model.Booking
	var total int64

	query := r.db.GORM.WithContext(ctx).Model(&model.Booking{}).Where("tenant_id = ?", filter.TenantID)

	if filter.EmployeeID != nil {
		query = query.Where("employee_id = ?", *filter.EmployeeID)
	}
	if filter.DepartmentID != nil {
		query = query.Joins("JOIN employees AS emp_dept ON emp_dept.id = bookings.employee_id").
			Where("emp_dept.department_id = ?", *filter.DepartmentID)
	}
	if filter.BookingTypeID != nil {
		query = query.Where("booking_type_id = ?", *filter.BookingTypeID)
	}
	switch filter.ScopeType {
	case model.DataScopeDepartment:
		if len(filter.ScopeDepartmentIDs) == 0 {
			query = query.Where("1 = 0")
		} else {
			query = query.Joins("JOIN employees ON employees.id = bookings.employee_id").
				Where("employees.department_id IN ?", filter.ScopeDepartmentIDs)
		}
	case model.DataScopeEmployee:
		if len(filter.ScopeEmployeeIDs) == 0 {
			query = query.Where("1 = 0")
		} else {
			query = query.Where("employee_id IN ?", filter.ScopeEmployeeIDs)
		}
	}
	if filter.StartDate != nil {
		query = query.Where("booking_date >= ?", *filter.StartDate)
	}
	if filter.EndDate != nil {
		query = query.Where("booking_date <= ?", *filter.EndDate)
	}
	if filter.Direction != nil {
		query = query.Joins("JOIN booking_types ON booking_types.id = bookings.booking_type_id").
			Where("booking_types.direction = ?", *filter.Direction)
	}
	if filter.Source != nil {
		query = query.Where("source = ?", *filter.Source)
	}
	if filter.HasPair != nil {
		if *filter.HasPair {
			query = query.Where("pair_id IS NOT NULL")
		} else {
			query = query.Where("pair_id IS NULL")
		}
	}

	// Count total
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to count bookings: %w", err)
	}

	// Apply pagination
	if filter.Limit > 0 {
		query = query.Limit(filter.Limit)
	}
	if filter.Offset > 0 {
		query = query.Offset(filter.Offset)
	}

	err := query.Preload("Employee").Preload("BookingType").Order("booking_date DESC, edited_time DESC").Find(&bookings).Error
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list bookings: %w", err)
	}
	return bookings, total, nil
}

// GetByEmployeeAndDate retrieves all bookings for an employee on a specific date.
func (r *BookingRepository) GetByEmployeeAndDate(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) ([]model.Booking, error) {
	var bookings []model.Booking
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND employee_id = ? AND booking_date = ?", tenantID, employeeID, date).
		Preload("BookingType").
		Order("edited_time ASC").
		Find(&bookings).Error

	if err != nil {
		return nil, fmt.Errorf("failed to get bookings by employee and date: %w", err)
	}
	return bookings, nil
}

// GetByEmployeeAndDateRange retrieves all bookings for an employee within a date range.
func (r *BookingRepository) GetByEmployeeAndDateRange(
	ctx context.Context,
	tenantID, employeeID uuid.UUID,
	startDate, endDate time.Time,
) ([]model.Booking, error) {
	var bookings []model.Booking
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND employee_id = ? AND booking_date >= ? AND booking_date <= ?", tenantID, employeeID, startDate, endDate).
		Preload("BookingType").
		Order("booking_date ASC, edited_time ASC").
		Find(&bookings).Error

	if err != nil {
		return nil, fmt.Errorf("failed to get bookings by employee and date range: %w", err)
	}
	return bookings, nil
}

// GetByDateRange retrieves all bookings within a date range for a tenant.
func (r *BookingRepository) GetByDateRange(ctx context.Context, tenantID uuid.UUID, startDate, endDate time.Time) ([]model.Booking, error) {
	var bookings []model.Booking
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND booking_date >= ? AND booking_date <= ?", tenantID, startDate, endDate).
		Order("employee_id ASC, booking_date ASC, edited_time ASC").
		Find(&bookings).Error

	if err != nil {
		return nil, fmt.Errorf("failed to get bookings by date range: %w", err)
	}
	return bookings, nil
}

// GetUnpaired retrieves unpaired bookings of a specific direction for an employee on a date.
func (r *BookingRepository) GetUnpaired(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time, direction model.BookingDirection) ([]model.Booking, error) {
	var bookings []model.Booking
	err := r.db.GORM.WithContext(ctx).
		Joins("JOIN booking_types ON booking_types.id = bookings.booking_type_id").
		Where("bookings.tenant_id = ? AND bookings.employee_id = ? AND bookings.booking_date = ?", tenantID, employeeID, date).
		Where("booking_types.direction = ?", direction).
		Where("bookings.pair_id IS NULL").
		Order("bookings.edited_time ASC").
		Find(&bookings).Error

	if err != nil {
		return nil, fmt.Errorf("failed to get unpaired bookings: %w", err)
	}
	return bookings, nil
}

// SetPair links two bookings as a pair.
func (r *BookingRepository) SetPair(ctx context.Context, bookingID1, bookingID2 uuid.UUID) error {
	pairID := uuid.New()
	return r.db.GORM.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Update first booking
		result := tx.Model(&model.Booking{}).Where("id = ?", bookingID1).Update("pair_id", pairID)
		if result.Error != nil {
			return fmt.Errorf("failed to update first booking pair: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			return ErrBookingNotFound
		}

		// Update second booking
		result = tx.Model(&model.Booking{}).Where("id = ?", bookingID2).Update("pair_id", pairID)
		if result.Error != nil {
			return fmt.Errorf("failed to update second booking pair: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			return ErrBookingNotFound
		}

		return nil
	})
}

// ClearPair removes the pair link from bookings sharing the same pair_id.
func (r *BookingRepository) ClearPair(ctx context.Context, pairID uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).
		Model(&model.Booking{}).
		Where("pair_id = ?", pairID).
		Update("pair_id", nil)

	if result.Error != nil {
		return fmt.Errorf("failed to clear pair: %w", result.Error)
	}
	return nil
}

// UpdateCalculatedTimes bulk updates calculated_time for multiple bookings within a transaction.
func (r *BookingRepository) UpdateCalculatedTimes(ctx context.Context, updates map[uuid.UUID]int) error {
	if len(updates) == 0 {
		return nil
	}

	return r.db.GORM.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for bookingID, calculatedTime := range updates {
			result := tx.Model(&model.Booking{}).
				Where("id = ?", bookingID).
				Update("calculated_time", calculatedTime)

			if result.Error != nil {
				return fmt.Errorf("failed to update calculated time for booking %s: %w", bookingID, result.Error)
			}
			if result.RowsAffected == 0 {
				return fmt.Errorf("booking %s: %w", bookingID, ErrBookingNotFound)
			}
		}
		return nil
	})
}

// ClearCalculatedTime removes calculated_time for a booking.
func (r *BookingRepository) ClearCalculatedTime(ctx context.Context, bookingID uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).
		Model(&model.Booking{}).
		Where("id = ?", bookingID).
		Update("calculated_time", nil)

	if result.Error != nil {
		return fmt.Errorf("failed to clear calculated time: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrBookingNotFound
	}
	return nil
}

// Upsert creates or updates a booking by ID.
func (r *BookingRepository) Upsert(ctx context.Context, booking *model.Booking) error {
	return r.db.GORM.WithContext(ctx).Save(booking).Error
}
