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
	ErrCostCenterNotFound = errors.New("cost center not found")
)

// CostCenterRepository handles cost center data access.
type CostCenterRepository struct {
	db *DB
}

// NewCostCenterRepository creates a new cost center repository.
func NewCostCenterRepository(db *DB) *CostCenterRepository {
	return &CostCenterRepository{db: db}
}

// Create creates a new cost center.
func (r *CostCenterRepository) Create(ctx context.Context, cc *model.CostCenter) error {
	return r.db.GORM.WithContext(ctx).
		Select("TenantID", "Code", "Name", "Description", "IsActive").
		Create(cc).Error
}

// GetByID retrieves a cost center by ID.
func (r *CostCenterRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.CostCenter, error) {
	var cc model.CostCenter
	err := r.db.GORM.WithContext(ctx).
		First(&cc, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrCostCenterNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get cost center: %w", err)
	}
	return &cc, nil
}

// GetByCode retrieves a cost center by tenant ID and code.
func (r *CostCenterRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.CostCenter, error) {
	var cc model.CostCenter
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&cc).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrCostCenterNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get cost center by code: %w", err)
	}
	return &cc, nil
}

// Update updates a cost center.
func (r *CostCenterRepository) Update(ctx context.Context, cc *model.CostCenter) error {
	return r.db.GORM.WithContext(ctx).Save(cc).Error
}

// Delete deletes a cost center by ID.
func (r *CostCenterRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.CostCenter{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete cost center: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrCostCenterNotFound
	}
	return nil
}

// List retrieves all cost centers for a tenant.
func (r *CostCenterRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.CostCenter, error) {
	var costCenters []model.CostCenter
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("code ASC").
		Find(&costCenters).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list cost centers: %w", err)
	}
	return costCenters, nil
}

// ListActive retrieves all active cost centers for a tenant.
func (r *CostCenterRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.CostCenter, error) {
	var costCenters []model.CostCenter
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND is_active = ?", tenantID, true).
		Order("code ASC").
		Find(&costCenters).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list active cost centers: %w", err)
	}
	return costCenters, nil
}
