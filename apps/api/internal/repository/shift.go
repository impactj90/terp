package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrShiftNotFound = errors.New("shift not found")

type ShiftRepository struct {
	db *DB
}

func NewShiftRepository(db *DB) *ShiftRepository {
	return &ShiftRepository{db: db}
}

func (r *ShiftRepository) Create(ctx context.Context, s *model.Shift) error {
	return r.db.GORM.WithContext(ctx).Create(s).Error
}

func (r *ShiftRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Shift, error) {
	var s model.Shift
	err := r.db.GORM.WithContext(ctx).First(&s, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrShiftNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get shift: %w", err)
	}
	return &s, nil
}

func (r *ShiftRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.Shift, error) {
	var s model.Shift
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&s).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrShiftNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get shift by code: %w", err)
	}
	return &s, nil
}

func (r *ShiftRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.Shift, error) {
	var shifts []model.Shift
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("sort_order ASC, code ASC").
		Find(&shifts).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list shifts: %w", err)
	}
	return shifts, nil
}

func (r *ShiftRepository) Update(ctx context.Context, s *model.Shift) error {
	return r.db.GORM.WithContext(ctx).Save(s).Error
}

func (r *ShiftRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.Shift{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete shift: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrShiftNotFound
	}
	return nil
}

// HasAssignments checks if a shift is referenced by any employee day plans.
func (r *ShiftRepository) HasAssignments(ctx context.Context, shiftID uuid.UUID) (bool, error) {
	var count int64
	err := r.db.GORM.WithContext(ctx).
		Model(&model.EmployeeDayPlan{}).
		Where("shift_id = ?", shiftID).
		Count(&count).Error
	if err != nil {
		return false, fmt.Errorf("failed to check shift assignments: %w", err)
	}
	return count > 0, nil
}
