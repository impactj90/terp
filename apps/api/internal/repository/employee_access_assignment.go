package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrEmployeeAccessAssignmentNotFound = errors.New("employee access assignment not found")

type EmployeeAccessAssignmentRepository struct {
	db *DB
}

func NewEmployeeAccessAssignmentRepository(db *DB) *EmployeeAccessAssignmentRepository {
	return &EmployeeAccessAssignmentRepository{db: db}
}

func (r *EmployeeAccessAssignmentRepository) Create(ctx context.Context, a *model.EmployeeAccessAssignment) error {
	return r.db.GORM.WithContext(ctx).Create(a).Error
}

func (r *EmployeeAccessAssignmentRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.EmployeeAccessAssignment, error) {
	var a model.EmployeeAccessAssignment
	err := r.db.GORM.WithContext(ctx).
		Preload("Employee").
		Preload("AccessProfile").
		First(&a, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEmployeeAccessAssignmentNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get employee access assignment: %w", err)
	}
	return &a, nil
}

func (r *EmployeeAccessAssignmentRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.EmployeeAccessAssignment, error) {
	var assignments []model.EmployeeAccessAssignment
	err := r.db.GORM.WithContext(ctx).
		Preload("Employee").
		Preload("AccessProfile").
		Where("tenant_id = ?", tenantID).
		Order("created_at DESC").
		Find(&assignments).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list employee access assignments: %w", err)
	}
	return assignments, nil
}

func (r *EmployeeAccessAssignmentRepository) Update(ctx context.Context, a *model.EmployeeAccessAssignment) error {
	return r.db.GORM.WithContext(ctx).Save(a).Error
}

func (r *EmployeeAccessAssignmentRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.EmployeeAccessAssignment{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete employee access assignment: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrEmployeeAccessAssignmentNotFound
	}
	return nil
}
