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
	ErrTariffNotFound      = errors.New("tariff not found")
	ErrTariffBreakNotFound = errors.New("tariff break not found")
)

// TariffRepository handles tariff data access.
type TariffRepository struct {
	db *DB
}

// NewTariffRepository creates a new tariff repository.
func NewTariffRepository(db *DB) *TariffRepository {
	return &TariffRepository{db: db}
}

// Create creates a new tariff.
func (r *TariffRepository) Create(ctx context.Context, tariff *model.Tariff) error {
	return r.db.GORM.WithContext(ctx).Create(tariff).Error
}

// GetByID retrieves a tariff by ID.
func (r *TariffRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Tariff, error) {
	var tariff model.Tariff
	err := r.db.GORM.WithContext(ctx).
		First(&tariff, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrTariffNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get tariff: %w", err)
	}
	return &tariff, nil
}

// GetByCode retrieves a tariff by code for a tenant.
func (r *TariffRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.Tariff, error) {
	var tariff model.Tariff
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&tariff).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrTariffNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get tariff by code: %w", err)
	}
	return &tariff, nil
}

// GetWithDetails retrieves a tariff with week plan and breaks preloaded.
func (r *TariffRepository) GetWithDetails(ctx context.Context, id uuid.UUID) (*model.Tariff, error) {
	var tariff model.Tariff
	err := r.db.GORM.WithContext(ctx).
		Preload("WeekPlan").
		Preload("Breaks", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC")
		}).
		Where("id = ?", id).
		First(&tariff).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrTariffNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get tariff with details: %w", err)
	}
	return &tariff, nil
}

// Update updates a tariff.
func (r *TariffRepository) Update(ctx context.Context, tariff *model.Tariff) error {
	return r.db.GORM.WithContext(ctx).Save(tariff).Error
}

// Delete deletes a tariff by ID.
func (r *TariffRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.Tariff{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete tariff: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrTariffNotFound
	}
	return nil
}

// List retrieves all tariffs for a tenant.
func (r *TariffRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.Tariff, error) {
	var tariffs []model.Tariff
	err := r.db.GORM.WithContext(ctx).
		Preload("WeekPlan").
		Preload("Breaks", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC")
		}).
		Where("tenant_id = ?", tenantID).
		Order("code ASC").
		Find(&tariffs).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list tariffs: %w", err)
	}
	return tariffs, nil
}

// ListActive retrieves all active tariffs for a tenant.
func (r *TariffRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.Tariff, error) {
	var tariffs []model.Tariff
	err := r.db.GORM.WithContext(ctx).
		Preload("WeekPlan").
		Preload("Breaks", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC")
		}).
		Where("tenant_id = ? AND is_active = ?", tenantID, true).
		Order("code ASC").
		Find(&tariffs).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list active tariffs: %w", err)
	}
	return tariffs, nil
}

// CreateBreak creates a new break for a tariff.
func (r *TariffRepository) CreateBreak(ctx context.Context, tariffBreak *model.TariffBreak) error {
	return r.db.GORM.WithContext(ctx).Create(tariffBreak).Error
}

// GetBreakByID retrieves a tariff break by ID.
func (r *TariffRepository) GetBreakByID(ctx context.Context, id uuid.UUID) (*model.TariffBreak, error) {
	var tariffBreak model.TariffBreak
	err := r.db.GORM.WithContext(ctx).
		First(&tariffBreak, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrTariffBreakNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get tariff break: %w", err)
	}
	return &tariffBreak, nil
}

// DeleteBreak deletes a tariff break by ID.
func (r *TariffRepository) DeleteBreak(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.TariffBreak{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete tariff break: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrTariffBreakNotFound
	}
	return nil
}

// ListBreaks retrieves all breaks for a tariff.
func (r *TariffRepository) ListBreaks(ctx context.Context, tariffID uuid.UUID) ([]model.TariffBreak, error) {
	var breaks []model.TariffBreak
	err := r.db.GORM.WithContext(ctx).
		Where("tariff_id = ?", tariffID).
		Order("sort_order ASC").
		Find(&breaks).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list tariff breaks: %w", err)
	}
	return breaks, nil
}
