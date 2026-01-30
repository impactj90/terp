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
	ErrSystemSettingsNotFound = errors.New("system settings not found")
)

// SystemSettingsRepository handles system settings data access.
type SystemSettingsRepository struct {
	db *DB
}

// NewSystemSettingsRepository creates a new system settings repository.
func NewSystemSettingsRepository(db *DB) *SystemSettingsRepository {
	return &SystemSettingsRepository{db: db}
}

// GetByTenantID retrieves system settings for a tenant.
func (r *SystemSettingsRepository) GetByTenantID(ctx context.Context, tenantID uuid.UUID) (*model.SystemSettings, error) {
	var settings model.SystemSettings
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		First(&settings).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrSystemSettingsNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get system settings: %w", err)
	}
	return &settings, nil
}

// Create creates a new system settings row.
func (r *SystemSettingsRepository) Create(ctx context.Context, settings *model.SystemSettings) error {
	return r.db.GORM.WithContext(ctx).Create(settings).Error
}

// Update updates existing system settings.
func (r *SystemSettingsRepository) Update(ctx context.Context, settings *model.SystemSettings) error {
	return r.db.GORM.WithContext(ctx).Save(settings).Error
}

// GetOrCreate retrieves existing settings or creates defaults for a tenant.
func (r *SystemSettingsRepository) GetOrCreate(ctx context.Context, tenantID uuid.UUID) (*model.SystemSettings, error) {
	settings, err := r.GetByTenantID(ctx, tenantID)
	if err == nil {
		return settings, nil
	}

	if !errors.Is(err, ErrSystemSettingsNotFound) {
		return nil, err
	}

	// Create default settings
	defaults := model.DefaultSettings(tenantID)
	if err := r.Create(ctx, defaults); err != nil {
		// Handle race condition: another request may have created the row
		existing, getErr := r.GetByTenantID(ctx, tenantID)
		if getErr == nil {
			return existing, nil
		}
		return nil, fmt.Errorf("failed to create default system settings: %w", err)
	}
	return defaults, nil
}
