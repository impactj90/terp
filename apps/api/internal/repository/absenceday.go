package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrAbsenceDayNotFound = errors.New("absence day not found")

// AbsenceDayRepository handles absence day data access.
type AbsenceDayRepository struct {
	db *DB
}

// NewAbsenceDayRepository creates a new absence day repository.
func NewAbsenceDayRepository(db *DB) *AbsenceDayRepository {
	return &AbsenceDayRepository{db: db}
}

// Create creates a new absence day.
func (r *AbsenceDayRepository) Create(ctx context.Context, ad *model.AbsenceDay) error {
	return r.db.GORM.WithContext(ctx).Create(ad).Error
}

// CreateRange creates multiple absence days in a batch.
func (r *AbsenceDayRepository) CreateRange(ctx context.Context, days []model.AbsenceDay) error {
	if len(days) == 0 {
		return nil
	}
	return r.db.GORM.WithContext(ctx).CreateInBatches(days, 100).Error
}

// GetByID retrieves an absence day by ID with AbsenceType preloaded.
func (r *AbsenceDayRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceDay, error) {
	var ad model.AbsenceDay
	err := r.db.GORM.WithContext(ctx).
		Preload("AbsenceType").
		First(&ad, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAbsenceDayNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get absence day: %w", err)
	}
	return &ad, nil
}

// GetByEmployeeDate retrieves the absence day for an employee on a specific date.
// Returns nil, nil if no record exists (not an error - checking for absences is normal).
// Only returns non-cancelled absences (matching the unique constraint).
func (r *AbsenceDayRepository) GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.AbsenceDay, error) {
	var ad model.AbsenceDay
	err := r.db.GORM.WithContext(ctx).
		Preload("AbsenceType").
		Where("employee_id = ? AND absence_date = ? AND status != ?", employeeID, date, model.AbsenceStatusCancelled).
		First(&ad).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get absence day: %w", err)
	}
	return &ad, nil
}

// GetByEmployeeDateRange retrieves all absence days for an employee within a date range.
// Returns all statuses (for UI display). Use CountByTypeInRange for calculation-only queries.
func (r *AbsenceDayRepository) GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.AbsenceDay, error) {
	var days []model.AbsenceDay
	err := r.db.GORM.WithContext(ctx).
		Preload("AbsenceType").
		Where("employee_id = ? AND absence_date >= ? AND absence_date <= ?", employeeID, from, to).
		Order("absence_date ASC").
		Find(&days).Error

	if err != nil {
		return nil, fmt.Errorf("failed to get absence days for range: %w", err)
	}
	return days, nil
}

// ListByEmployee retrieves all absence days for an employee, ordered by date descending.
func (r *AbsenceDayRepository) ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.AbsenceDay, error) {
	var days []model.AbsenceDay
	err := r.db.GORM.WithContext(ctx).
		Preload("AbsenceType").
		Where("employee_id = ?", employeeID).
		Order("absence_date DESC").
		Find(&days).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list absence days for employee: %w", err)
	}
	return days, nil
}

// Update updates an absence day.
func (r *AbsenceDayRepository) Update(ctx context.Context, ad *model.AbsenceDay) error {
	return r.db.GORM.WithContext(ctx).Save(ad).Error
}

// Delete deletes an absence day by ID.
func (r *AbsenceDayRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.AbsenceDay{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete absence day: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrAbsenceDayNotFound
	}
	return nil
}

// DeleteRange deletes all absence days for an employee within a date range.
func (r *AbsenceDayRepository) DeleteRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error {
	result := r.db.GORM.WithContext(ctx).
		Where("employee_id = ? AND absence_date >= ? AND absence_date <= ?", employeeID, from, to).
		Delete(&model.AbsenceDay{})

	if result.Error != nil {
		return fmt.Errorf("failed to delete absence days: %w", result.Error)
	}
	return nil
}

// CountByTypeInRange sums the duration of approved absences for an employee
// of a specific type within a date range. Returns decimal (e.g. 1.5 for full + half day).
// Only counts status = 'approved'.
func (r *AbsenceDayRepository) CountByTypeInRange(ctx context.Context, employeeID, typeID uuid.UUID, from, to time.Time) (decimal.Decimal, error) {
	var result decimal.Decimal
	err := r.db.GORM.WithContext(ctx).
		Model(&model.AbsenceDay{}).
		Select("COALESCE(SUM(duration), 0)").
		Where("employee_id = ? AND absence_type_id = ? AND absence_date >= ? AND absence_date <= ? AND status = ?",
			employeeID, typeID, from, to, model.AbsenceStatusApproved).
		Scan(&result).Error

	if err != nil {
		return decimal.Zero, fmt.Errorf("failed to count absence days by type: %w", err)
	}
	return result, nil
}
