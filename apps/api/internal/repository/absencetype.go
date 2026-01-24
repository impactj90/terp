package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrAbsenceTypeNotFound = errors.New("absence type not found")

// AbsenceTypeRepository handles absence type data access.
type AbsenceTypeRepository struct {
	db *DB
}

// NewAbsenceTypeRepository creates a new absence type repository.
func NewAbsenceTypeRepository(db *DB) *AbsenceTypeRepository {
	return &AbsenceTypeRepository{db: db}
}

// Create creates a new absence type.
func (r *AbsenceTypeRepository) Create(ctx context.Context, at *model.AbsenceType) error {
	return r.db.GORM.WithContext(ctx).Create(at).Error
}

// GetByID retrieves an absence type by ID.
func (r *AbsenceTypeRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceType, error) {
	var at model.AbsenceType
	err := r.db.GORM.WithContext(ctx).First(&at, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAbsenceTypeNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get absence type: %w", err)
	}
	return &at, nil
}

// GetByCode retrieves an absence type by code for a tenant.
// Prefers tenant-specific types over system types when both exist.
func (r *AbsenceTypeRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.AbsenceType, error) {
	var at model.AbsenceType
	err := r.db.GORM.WithContext(ctx).
		Where("(tenant_id = ? OR tenant_id IS NULL) AND code = ?", tenantID, code).
		Order("tenant_id DESC NULLS LAST").
		First(&at).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAbsenceTypeNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get absence type by code: %w", err)
	}
	return &at, nil
}

// Update updates an absence type.
func (r *AbsenceTypeRepository) Update(ctx context.Context, at *model.AbsenceType) error {
	return r.db.GORM.WithContext(ctx).Save(at).Error
}

// Delete deletes an absence type by ID.
func (r *AbsenceTypeRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.AbsenceType{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete absence type: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrAbsenceTypeNotFound
	}
	return nil
}

// List retrieves absence types for a tenant with optional system type inclusion.
func (r *AbsenceTypeRepository) List(ctx context.Context, tenantID uuid.UUID, includeSystem bool) ([]model.AbsenceType, error) {
	var types []model.AbsenceType
	query := r.db.GORM.WithContext(ctx).Where("is_active = ?", true)

	if includeSystem {
		query = query.Where("tenant_id = ? OR tenant_id IS NULL", tenantID)
	} else {
		query = query.Where("tenant_id = ?", tenantID)
	}

	err := query.Order("sort_order ASC, code ASC").Find(&types).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list absence types: %w", err)
	}
	return types, nil
}

// ListByCategory retrieves active absence types for a tenant filtered by category.
func (r *AbsenceTypeRepository) ListByCategory(ctx context.Context, tenantID uuid.UUID, category model.AbsenceCategory) ([]model.AbsenceType, error) {
	var types []model.AbsenceType
	err := r.db.GORM.WithContext(ctx).
		Where("(tenant_id = ? OR tenant_id IS NULL) AND category = ? AND is_active = ?", tenantID, category, true).
		Order("sort_order ASC, code ASC").
		Find(&types).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list absence types by category: %w", err)
	}
	return types, nil
}
