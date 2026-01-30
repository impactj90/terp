package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrShiftAssignmentNotFound = errors.New("shift assignment not found")

type ShiftAssignmentRepository struct {
	db *DB
}

func NewShiftAssignmentRepository(db *DB) *ShiftAssignmentRepository {
	return &ShiftAssignmentRepository{db: db}
}

func (r *ShiftAssignmentRepository) Create(ctx context.Context, a *model.ShiftAssignment) error {
	return r.db.GORM.WithContext(ctx).Create(a).Error
}

func (r *ShiftAssignmentRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.ShiftAssignment, error) {
	var a model.ShiftAssignment
	err := r.db.GORM.WithContext(ctx).
		Preload("Employee").
		Preload("Shift").
		First(&a, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrShiftAssignmentNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get shift assignment: %w", err)
	}
	return &a, nil
}

func (r *ShiftAssignmentRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.ShiftAssignment, error) {
	var assignments []model.ShiftAssignment
	err := r.db.GORM.WithContext(ctx).
		Preload("Employee").
		Preload("Shift").
		Where("tenant_id = ?", tenantID).
		Order("created_at DESC").
		Find(&assignments).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list shift assignments: %w", err)
	}
	return assignments, nil
}

func (r *ShiftAssignmentRepository) Update(ctx context.Context, a *model.ShiftAssignment) error {
	return r.db.GORM.WithContext(ctx).Save(a).Error
}

func (r *ShiftAssignmentRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.ShiftAssignment{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete shift assignment: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrShiftAssignmentNotFound
	}
	return nil
}
