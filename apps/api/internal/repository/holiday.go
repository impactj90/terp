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
	ErrHolidayNotFound = errors.New("holiday not found")
)

// HolidayRepository handles holiday data access.
type HolidayRepository struct {
	db *DB
}

// NewHolidayRepository creates a new holiday repository.
func NewHolidayRepository(db *DB) *HolidayRepository {
	return &HolidayRepository{db: db}
}

// Create creates a new holiday.
func (r *HolidayRepository) Create(ctx context.Context, holiday *model.Holiday) error {
	// Explicitly select fields including booleans to ensure zero values are inserted
	// rather than letting database defaults take over.
	return r.db.GORM.WithContext(ctx).
		Select("TenantID", "HolidayDate", "Name", "IsHalfDay", "AppliesToAll", "DepartmentID").
		Create(holiday).Error
}

// GetByID retrieves a holiday by ID.
func (r *HolidayRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Holiday, error) {
	var holiday model.Holiday
	err := r.db.GORM.WithContext(ctx).
		First(&holiday, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrHolidayNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get holiday: %w", err)
	}
	return &holiday, nil
}

// Update updates a holiday.
func (r *HolidayRepository) Update(ctx context.Context, holiday *model.Holiday) error {
	return r.db.GORM.WithContext(ctx).Save(holiday).Error
}

// Delete deletes a holiday by ID.
func (r *HolidayRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.Holiday{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete holiday: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrHolidayNotFound
	}
	return nil
}

// GetByDateRange retrieves holidays within a date range for a tenant.
func (r *HolidayRepository) GetByDateRange(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]model.Holiday, error) {
	var holidays []model.Holiday
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND holiday_date >= ? AND holiday_date <= ?", tenantID, from, to).
		Order("holiday_date ASC").
		Find(&holidays).Error

	if err != nil {
		return nil, fmt.Errorf("failed to get holidays by date range: %w", err)
	}
	return holidays, nil
}

// GetByDate retrieves a holiday for a specific date and tenant.
// Returns nil, nil if no holiday exists on that date.
func (r *HolidayRepository) GetByDate(ctx context.Context, tenantID uuid.UUID, date time.Time) (*model.Holiday, error) {
	var holiday model.Holiday
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND holiday_date = ?", tenantID, date).
		First(&holiday).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get holiday by date: %w", err)
	}
	return &holiday, nil
}

// ListByYear retrieves all holidays for a tenant in a specific year.
func (r *HolidayRepository) ListByYear(ctx context.Context, tenantID uuid.UUID, year int) ([]model.Holiday, error) {
	var holidays []model.Holiday
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND EXTRACT(YEAR FROM holiday_date) = ?", tenantID, year).
		Order("holiday_date ASC").
		Find(&holidays).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list holidays by year: %w", err)
	}
	return holidays, nil
}

// Upsert creates or updates a holiday by ID.
// Used for dev mode seeding of holidays.
func (r *HolidayRepository) Upsert(ctx context.Context, holiday *model.Holiday) error {
	return r.db.GORM.WithContext(ctx).
		Where("id = ?", holiday.ID).
		Assign(holiday).
		FirstOrCreate(holiday).Error
}
