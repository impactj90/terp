package repository

import (
	"context"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

// UserTenantRepository handles user-tenant association data access.
type UserTenantRepository struct {
	db *DB
}

// NewUserTenantRepository creates a new user-tenant repository.
func NewUserTenantRepository(db *DB) *UserTenantRepository {
	return &UserTenantRepository{db: db}
}

// UserHasAccess checks whether a user has access to a specific tenant.
func (r *UserTenantRepository) UserHasAccess(ctx context.Context, userID, tenantID uuid.UUID) (bool, error) {
	var count int64
	err := r.db.GORM.WithContext(ctx).
		Model(&model.UserTenant{}).
		Where("user_id = ? AND tenant_id = ?", userID, tenantID).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// ListTenantsForUser returns all tenants a user has access to.
func (r *UserTenantRepository) ListTenantsForUser(ctx context.Context, userID uuid.UUID) ([]model.Tenant, error) {
	var tenants []model.Tenant
	err := r.db.GORM.WithContext(ctx).
		Joins("JOIN user_tenants ON user_tenants.tenant_id = tenants.id").
		Where("user_tenants.user_id = ? AND tenants.is_active = true", userID).
		Find(&tenants).Error
	return tenants, err
}

// AddUserToTenant adds a user-tenant association (idempotent).
func (r *UserTenantRepository) AddUserToTenant(ctx context.Context, userID, tenantID uuid.UUID, role string) error {
	ut := model.UserTenant{
		UserID:   userID,
		TenantID: tenantID,
		Role:     role,
	}
	return r.db.GORM.WithContext(ctx).
		Where("user_id = ? AND tenant_id = ?", userID, tenantID).
		FirstOrCreate(&ut).Error
}
