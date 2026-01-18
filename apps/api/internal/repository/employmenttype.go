package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrEmploymentTypeNotFound = errors.New("employment type not found")
)

// EmploymentTypeRepository handles employment type data access.
type EmploymentTypeRepository struct {
	db *DB
}

// NewEmploymentTypeRepository creates a new employment type repository.
func NewEmploymentTypeRepository(db *DB) *EmploymentTypeRepository {
	return &EmploymentTypeRepository{db: db}
}

// Create creates a new employment type.
func (r *EmploymentTypeRepository) Create(ctx context.Context, et *model.EmploymentType) error {
	return r.db.GORM.WithContext(ctx).
		Select("TenantID", "Code", "Name", "DefaultWeeklyHours", "IsActive").
		Create(et).Error
}

// GetByID retrieves an employment type by ID.
func (r *EmploymentTypeRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.EmploymentType, error) {
	var et model.EmploymentType
	err := r.db.GORM.WithContext(ctx).
		First(&et, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEmploymentTypeNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get employment type: %w", err)
	}
	return &et, nil
}

// GetByCode retrieves an employment type by tenant ID and code.
func (r *EmploymentTypeRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.EmploymentType, error) {
	var et model.EmploymentType
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&et).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEmploymentTypeNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get employment type by code: %w", err)
	}
	return &et, nil
}

// Update updates an employment type.
func (r *EmploymentTypeRepository) Update(ctx context.Context, et *model.EmploymentType) error {
	return r.db.GORM.WithContext(ctx).Save(et).Error
}

// Delete deletes an employment type by ID.
func (r *EmploymentTypeRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.EmploymentType{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete employment type: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrEmploymentTypeNotFound
	}
	return nil
}

// List retrieves all employment types for a tenant.
func (r *EmploymentTypeRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.EmploymentType, error) {
	var employmentTypes []model.EmploymentType
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("code ASC").
		Find(&employmentTypes).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list employment types: %w", err)
	}
	return employmentTypes, nil
}

// ListActive retrieves all active employment types for a tenant.
func (r *EmploymentTypeRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.EmploymentType, error) {
	var employmentTypes []model.EmploymentType
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND is_active = ?", tenantID, true).
		Order("code ASC").
		Find(&employmentTypes).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list active employment types: %w", err)
	}
	return employmentTypes, nil
}
