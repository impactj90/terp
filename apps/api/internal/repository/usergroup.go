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
	ErrUserGroupNotFound       = errors.New("user group not found")
	ErrUserGroupNameExists     = errors.New("user group name already exists for this tenant")
	ErrCannotDeleteSystemGroup = errors.New("cannot delete system group")
)

// UserGroupRepository handles user group data access.
type UserGroupRepository struct {
	db *DB
}

// NewUserGroupRepository creates a new user group repository.
func NewUserGroupRepository(db *DB) *UserGroupRepository {
	return &UserGroupRepository{db: db}
}

// Create creates a new user group.
func (r *UserGroupRepository) Create(ctx context.Context, ug *model.UserGroup) error {
	return r.db.GORM.WithContext(ctx).Create(ug).Error
}

// GetByID retrieves a user group by ID.
func (r *UserGroupRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.UserGroup, error) {
	var ug model.UserGroup
	err := r.db.GORM.WithContext(ctx).
		First(&ug, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrUserGroupNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user group: %w", err)
	}
	return &ug, nil
}

// GetByName retrieves a user group by name for a tenant.
func (r *UserGroupRepository) GetByName(ctx context.Context, tenantID uuid.UUID, name string) (*model.UserGroup, error) {
	var ug model.UserGroup
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND name = ?", tenantID, name).
		First(&ug).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user group by name: %w", err)
	}
	return &ug, nil
}

// GetByCode retrieves a user group by code for a tenant.
func (r *UserGroupRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.UserGroup, error) {
	var ug model.UserGroup
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&ug).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user group by code: %w", err)
	}
	return &ug, nil
}

// Update updates a user group.
func (r *UserGroupRepository) Update(ctx context.Context, ug *model.UserGroup) error {
	return r.db.GORM.WithContext(ctx).Save(ug).Error
}

// Delete deletes a user group by ID.
func (r *UserGroupRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.UserGroup{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete user group: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrUserGroupNotFound
	}
	return nil
}

// List retrieves all user groups for a tenant.
func (r *UserGroupRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.UserGroup, error) {
	var groups []model.UserGroup
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("name ASC").
		Find(&groups).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list user groups: %w", err)
	}
	return groups, nil
}

// ListByActive retrieves user groups by active status for a tenant.
func (r *UserGroupRepository) ListByActive(ctx context.Context, tenantID uuid.UUID, isActive bool) ([]model.UserGroup, error) {
	var groups []model.UserGroup
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND is_active = ?", tenantID, isActive).
		Order("name ASC").
		Find(&groups).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list user groups by active status: %w", err)
	}
	return groups, nil
}
