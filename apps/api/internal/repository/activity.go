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
	ErrActivityNotFound = errors.New("activity not found")
)

// ActivityRepository handles activity data access.
type ActivityRepository struct {
	db *DB
}

// NewActivityRepository creates a new activity repository.
func NewActivityRepository(db *DB) *ActivityRepository {
	return &ActivityRepository{db: db}
}

// Create creates a new activity.
func (r *ActivityRepository) Create(ctx context.Context, a *model.Activity) error {
	return r.db.GORM.WithContext(ctx).
		Select("TenantID", "Code", "Name", "Description", "IsActive").
		Create(a).Error
}

// GetByID retrieves an activity by ID.
func (r *ActivityRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Activity, error) {
	var a model.Activity
	err := r.db.GORM.WithContext(ctx).
		First(&a, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrActivityNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get activity: %w", err)
	}
	return &a, nil
}

// GetByCode retrieves an activity by tenant ID and code.
func (r *ActivityRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.Activity, error) {
	var a model.Activity
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&a).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrActivityNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get activity by code: %w", err)
	}
	return &a, nil
}

// Update updates an activity.
func (r *ActivityRepository) Update(ctx context.Context, a *model.Activity) error {
	return r.db.GORM.WithContext(ctx).Save(a).Error
}

// Delete deletes an activity by ID.
func (r *ActivityRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.Activity{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete activity: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrActivityNotFound
	}
	return nil
}

// List retrieves all activities for a tenant.
func (r *ActivityRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.Activity, error) {
	var activities []model.Activity
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("code ASC").
		Find(&activities).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list activities: %w", err)
	}
	return activities, nil
}

// ListActive retrieves all active activities for a tenant.
func (r *ActivityRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.Activity, error) {
	var activities []model.Activity
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND is_active = ?", tenantID, true).
		Order("code ASC").
		Find(&activities).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list active activities: %w", err)
	}
	return activities, nil
}
