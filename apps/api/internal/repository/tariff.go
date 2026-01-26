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

// GetWithDetails retrieves a tariff with week plan, breaks, and rhythm data preloaded.
func (r *TariffRepository) GetWithDetails(ctx context.Context, id uuid.UUID) (*model.Tariff, error) {
	var tariff model.Tariff
	err := r.db.GORM.WithContext(ctx).
		Preload("WeekPlan").
		Preload("Breaks", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC")
		}).
		Preload("TariffWeekPlans", func(db *gorm.DB) *gorm.DB {
			return db.Order("sequence_order ASC")
		}).
		Preload("TariffWeekPlans.WeekPlan").
		Preload("TariffDayPlans", func(db *gorm.DB) *gorm.DB {
			return db.Order("day_position ASC")
		}).
		Preload("TariffDayPlans.DayPlan").
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

// Upsert creates or updates a tariff by ID.
func (r *TariffRepository) Upsert(ctx context.Context, tariff *model.Tariff) error {
	return r.db.GORM.WithContext(ctx).
		Where("id = ?", tariff.ID).
		Assign(tariff).
		FirstOrCreate(tariff).Error
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
		Preload("TariffWeekPlans", func(db *gorm.DB) *gorm.DB {
			return db.Order("sequence_order ASC")
		}).
		Preload("TariffWeekPlans.WeekPlan").
		Preload("TariffDayPlans", func(db *gorm.DB) *gorm.DB {
			return db.Order("day_position ASC")
		}).
		Preload("TariffDayPlans.DayPlan").
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
		Preload("TariffWeekPlans", func(db *gorm.DB) *gorm.DB {
			return db.Order("sequence_order ASC")
		}).
		Preload("TariffWeekPlans.WeekPlan").
		Preload("TariffDayPlans", func(db *gorm.DB) *gorm.DB {
			return db.Order("day_position ASC")
		}).
		Preload("TariffDayPlans.DayPlan").
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

// =====================================================
// TARIFF WEEK PLANS (for rolling_weekly rhythm)
// =====================================================

// ReplaceTariffWeekPlans replaces all week plans for a tariff.
// This deletes existing week plans and creates new ones in a transaction.
func (r *TariffRepository) ReplaceTariffWeekPlans(ctx context.Context, tariffID uuid.UUID, weekPlans []model.TariffWeekPlan) error {
	return r.db.GORM.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Delete existing week plans
		if err := tx.Where("tariff_id = ?", tariffID).Delete(&model.TariffWeekPlan{}).Error; err != nil {
			return fmt.Errorf("failed to delete existing tariff week plans: %w", err)
		}

		// Create new week plans
		if len(weekPlans) > 0 {
			for i := range weekPlans {
				weekPlans[i].TariffID = tariffID
			}
			if err := tx.Create(&weekPlans).Error; err != nil {
				return fmt.Errorf("failed to create tariff week plans: %w", err)
			}
		}

		return nil
	})
}

// DeleteTariffWeekPlans deletes all week plans for a tariff.
func (r *TariffRepository) DeleteTariffWeekPlans(ctx context.Context, tariffID uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Where("tariff_id = ?", tariffID).Delete(&model.TariffWeekPlan{})
	if result.Error != nil {
		return fmt.Errorf("failed to delete tariff week plans: %w", result.Error)
	}
	return nil
}

// ListTariffWeekPlans retrieves all week plans for a tariff.
func (r *TariffRepository) ListTariffWeekPlans(ctx context.Context, tariffID uuid.UUID) ([]model.TariffWeekPlan, error) {
	var weekPlans []model.TariffWeekPlan
	err := r.db.GORM.WithContext(ctx).
		Preload("WeekPlan").
		Where("tariff_id = ?", tariffID).
		Order("sequence_order ASC").
		Find(&weekPlans).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list tariff week plans: %w", err)
	}
	return weekPlans, nil
}

// =====================================================
// TARIFF DAY PLANS (for x_days rhythm)
// =====================================================

// ReplaceTariffDayPlans replaces all day plans for a tariff.
// This deletes existing day plans and creates new ones in a transaction.
func (r *TariffRepository) ReplaceTariffDayPlans(ctx context.Context, tariffID uuid.UUID, dayPlans []model.TariffDayPlan) error {
	return r.db.GORM.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Delete existing day plans
		if err := tx.Where("tariff_id = ?", tariffID).Delete(&model.TariffDayPlan{}).Error; err != nil {
			return fmt.Errorf("failed to delete existing tariff day plans: %w", err)
		}

		// Create new day plans
		if len(dayPlans) > 0 {
			for i := range dayPlans {
				dayPlans[i].TariffID = tariffID
			}
			if err := tx.Create(&dayPlans).Error; err != nil {
				return fmt.Errorf("failed to create tariff day plans: %w", err)
			}
		}

		return nil
	})
}

// DeleteTariffDayPlans deletes all day plans for a tariff.
func (r *TariffRepository) DeleteTariffDayPlans(ctx context.Context, tariffID uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Where("tariff_id = ?", tariffID).Delete(&model.TariffDayPlan{})
	if result.Error != nil {
		return fmt.Errorf("failed to delete tariff day plans: %w", result.Error)
	}
	return nil
}

// ListTariffDayPlans retrieves all day plans for a tariff.
func (r *TariffRepository) ListTariffDayPlans(ctx context.Context, tariffID uuid.UUID) ([]model.TariffDayPlan, error) {
	var dayPlans []model.TariffDayPlan
	err := r.db.GORM.WithContext(ctx).
		Preload("DayPlan").
		Where("tariff_id = ?", tariffID).
		Order("day_position ASC").
		Find(&dayPlans).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list tariff day plans: %w", err)
	}
	return dayPlans, nil
}
