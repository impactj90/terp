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
	ErrGroupNotFound = errors.New("group not found")
)

// GroupRepository is a generic repository for employee/workflow/activity groups.
// It uses a type parameter to support all three group types with identical schemas.
type GroupRepository[T model.EmployeeGroup | model.WorkflowGroup | model.ActivityGroup] struct {
	db *DB
}

// NewEmployeeGroupRepository creates a repository for employee groups.
func NewEmployeeGroupRepository(db *DB) *GroupRepository[model.EmployeeGroup] {
	return &GroupRepository[model.EmployeeGroup]{db: db}
}

// NewWorkflowGroupRepository creates a repository for workflow groups.
func NewWorkflowGroupRepository(db *DB) *GroupRepository[model.WorkflowGroup] {
	return &GroupRepository[model.WorkflowGroup]{db: db}
}

// NewActivityGroupRepository creates a repository for activity groups.
func NewActivityGroupRepository(db *DB) *GroupRepository[model.ActivityGroup] {
	return &GroupRepository[model.ActivityGroup]{db: db}
}

// Create creates a new group.
func (r *GroupRepository[T]) Create(ctx context.Context, group *T) error {
	return r.db.GORM.WithContext(ctx).Create(group).Error
}

// GetByID retrieves a group by ID.
func (r *GroupRepository[T]) GetByID(ctx context.Context, id uuid.UUID) (*T, error) {
	var group T
	err := r.db.GORM.WithContext(ctx).
		First(&group, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrGroupNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get group: %w", err)
	}
	return &group, nil
}

// GetByCode retrieves a group by tenant ID and code.
func (r *GroupRepository[T]) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*T, error) {
	var group T
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&group).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrGroupNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get group by code: %w", err)
	}
	return &group, nil
}

// Update updates a group.
func (r *GroupRepository[T]) Update(ctx context.Context, group *T) error {
	return r.db.GORM.WithContext(ctx).Save(group).Error
}

// Delete deletes a group by ID.
func (r *GroupRepository[T]) Delete(ctx context.Context, id uuid.UUID) error {
	var group T
	result := r.db.GORM.WithContext(ctx).Delete(&group, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete group: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrGroupNotFound
	}
	return nil
}

// List retrieves all groups for a tenant.
func (r *GroupRepository[T]) List(ctx context.Context, tenantID uuid.UUID) ([]T, error) {
	var groups []T
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("code ASC").
		Find(&groups).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list groups: %w", err)
	}
	return groups, nil
}

// ListActive retrieves all active groups for a tenant.
func (r *GroupRepository[T]) ListActive(ctx context.Context, tenantID uuid.UUID) ([]T, error) {
	var groups []T
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND is_active = ?", tenantID, true).
		Order("code ASC").
		Find(&groups).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list active groups: %w", err)
	}
	return groups, nil
}
