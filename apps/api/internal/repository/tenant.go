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
	ErrTenantNotFound = errors.New("tenant not found")
)

// TenantRepository handles tenant data access.
type TenantRepository struct {
	db *DB
}

// NewTenantRepository creates a new tenant repository.
func NewTenantRepository(db *DB) *TenantRepository {
	return &TenantRepository{db: db}
}

// Create creates a new tenant.
func (r *TenantRepository) Create(ctx context.Context, tenant *model.Tenant) error {
	return r.db.GORM.WithContext(ctx).Create(tenant).Error
}

// GetByID retrieves a tenant by ID.
func (r *TenantRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Tenant, error) {
	var tenant model.Tenant
	err := r.db.GORM.WithContext(ctx).
		First(&tenant, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrTenantNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get tenant: %w", err)
	}
	return &tenant, nil
}

// GetBySlug retrieves a tenant by slug.
func (r *TenantRepository) GetBySlug(ctx context.Context, slug string) (*model.Tenant, error) {
	var tenant model.Tenant
	err := r.db.GORM.WithContext(ctx).
		First(&tenant, "slug = ?", slug).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrTenantNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get tenant: %w", err)
	}
	return &tenant, nil
}

// Update updates a tenant.
func (r *TenantRepository) Update(ctx context.Context, tenant *model.Tenant) error {
	return r.db.GORM.WithContext(ctx).Save(tenant).Error
}

// List retrieves tenants with optional active-only filtering.
func (r *TenantRepository) List(ctx context.Context, activeOnly bool) ([]model.Tenant, error) {
	query := r.db.GORM.WithContext(ctx)
	if activeOnly {
		query = query.Where("is_active = ?", true)
	}

	var tenants []model.Tenant
	if err := query.Find(&tenants).Error; err != nil {
		return nil, fmt.Errorf("failed to list tenants: %w", err)
	}
	return tenants, nil
}

// Delete deletes a tenant by ID.
func (r *TenantRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.Tenant{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete tenant: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrTenantNotFound
	}
	return nil
}

// Upsert creates or updates a tenant.
func (r *TenantRepository) Upsert(ctx context.Context, tenant *model.Tenant) error {
	return r.db.GORM.WithContext(ctx).Save(tenant).Error
}
