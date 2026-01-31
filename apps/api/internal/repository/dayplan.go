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
	ErrDayPlanNotFound      = errors.New("day plan not found")
	ErrDayPlanBreakNotFound = errors.New("day plan break not found")
	ErrDayPlanBonusNotFound = errors.New("day plan bonus not found")
)

// DayPlanRepository handles day plan data access.
type DayPlanRepository struct {
	db *DB
}

// NewDayPlanRepository creates a new day plan repository.
func NewDayPlanRepository(db *DB) *DayPlanRepository {
	return &DayPlanRepository{db: db}
}

// Create creates a new day plan.
func (r *DayPlanRepository) Create(ctx context.Context, plan *model.DayPlan) error {
	return r.db.GORM.WithContext(ctx).
		Select("TenantID", "Code", "Name", "Description", "PlanType", "ComeFrom", "ComeTo", "GoFrom", "GoTo", "CoreStart", "CoreEnd", "RegularHours", "ToleranceComePlus", "ToleranceComeMinus", "ToleranceGoPlus", "ToleranceGoMinus", "RoundingComeType", "RoundingComeInterval", "RoundingGoType", "RoundingGoInterval", "MinWorkTime", "MaxNetWorkTime", "NetAccountID", "CapAccountID", "IsActive").
		Create(plan).Error
}

// GetByID retrieves a day plan by ID.
func (r *DayPlanRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.DayPlan, error) {
	var plan model.DayPlan
	err := r.db.GORM.WithContext(ctx).
		First(&plan, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrDayPlanNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get day plan: %w", err)
	}
	return &plan, nil
}

// GetByCode retrieves a day plan by code for a tenant.
func (r *DayPlanRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.DayPlan, error) {
	var plan model.DayPlan
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&plan).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrDayPlanNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get day plan by code: %w", err)
	}
	return &plan, nil
}

// GetWithDetails retrieves a day plan with breaks and bonuses preloaded.
func (r *DayPlanRepository) GetWithDetails(ctx context.Context, id uuid.UUID) (*model.DayPlan, error) {
	var plan model.DayPlan
	err := r.db.GORM.WithContext(ctx).
		Preload("Breaks", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC")
		}).
		Preload("Bonuses", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC")
		}).
		Preload("Bonuses.Account").
		Where("id = ?", id).
		First(&plan).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrDayPlanNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get day plan with details: %w", err)
	}
	return &plan, nil
}

// Update updates a day plan.
func (r *DayPlanRepository) Update(ctx context.Context, plan *model.DayPlan) error {
	return r.db.GORM.WithContext(ctx).Save(plan).Error
}

// Upsert creates or updates a day plan by ID.
func (r *DayPlanRepository) Upsert(ctx context.Context, plan *model.DayPlan) error {
	return r.db.GORM.WithContext(ctx).
		Where("id = ?", plan.ID).
		Assign(plan).
		FirstOrCreate(plan).Error
}

// Delete deletes a day plan by ID (breaks and bonuses cascade-delete).
func (r *DayPlanRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.DayPlan{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete day plan: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrDayPlanNotFound
	}
	return nil
}

// List retrieves all day plans for a tenant.
func (r *DayPlanRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.DayPlan, error) {
	var plans []model.DayPlan
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("code ASC").
		Find(&plans).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list day plans: %w", err)
	}
	return plans, nil
}

// ListActive retrieves all active day plans for a tenant.
func (r *DayPlanRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.DayPlan, error) {
	var plans []model.DayPlan
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND is_active = ?", tenantID, true).
		Order("code ASC").
		Find(&plans).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list active day plans: %w", err)
	}
	return plans, nil
}

// ListByPlanType retrieves day plans of a specific type for a tenant.
func (r *DayPlanRepository) ListByPlanType(ctx context.Context, tenantID uuid.UUID, planType model.PlanType) ([]model.DayPlan, error) {
	var plans []model.DayPlan
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND plan_type = ?", tenantID, planType).
		Order("code ASC").
		Find(&plans).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list day plans by type: %w", err)
	}
	return plans, nil
}

// AddBreak adds a break to a day plan.
func (r *DayPlanRepository) AddBreak(ctx context.Context, b *model.DayPlanBreak) error {
	return r.db.GORM.WithContext(ctx).Create(b).Error
}

// UpdateBreak updates a day plan break.
func (r *DayPlanRepository) UpdateBreak(ctx context.Context, b *model.DayPlanBreak) error {
	return r.db.GORM.WithContext(ctx).Save(b).Error
}

// DeleteBreak deletes a day plan break.
func (r *DayPlanRepository) DeleteBreak(ctx context.Context, breakID uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.DayPlanBreak{}, "id = ?", breakID)
	if result.Error != nil {
		return fmt.Errorf("failed to delete break: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrDayPlanBreakNotFound
	}
	return nil
}

// GetBreak retrieves a day plan break by ID.
func (r *DayPlanRepository) GetBreak(ctx context.Context, breakID uuid.UUID) (*model.DayPlanBreak, error) {
	var b model.DayPlanBreak
	err := r.db.GORM.WithContext(ctx).First(&b, "id = ?", breakID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrDayPlanBreakNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get break: %w", err)
	}
	return &b, nil
}

// AddBonus adds a bonus to a day plan.
func (r *DayPlanRepository) AddBonus(ctx context.Context, b *model.DayPlanBonus) error {
	return r.db.GORM.WithContext(ctx).Create(b).Error
}

// UpdateBonus updates a day plan bonus.
func (r *DayPlanRepository) UpdateBonus(ctx context.Context, b *model.DayPlanBonus) error {
	return r.db.GORM.WithContext(ctx).Save(b).Error
}

// DeleteBonus deletes a day plan bonus.
func (r *DayPlanRepository) DeleteBonus(ctx context.Context, bonusID uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.DayPlanBonus{}, "id = ?", bonusID)
	if result.Error != nil {
		return fmt.Errorf("failed to delete bonus: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrDayPlanBonusNotFound
	}
	return nil
}

// GetBonus retrieves a day plan bonus by ID.
func (r *DayPlanRepository) GetBonus(ctx context.Context, bonusID uuid.UUID) (*model.DayPlanBonus, error) {
	var b model.DayPlanBonus
	err := r.db.GORM.WithContext(ctx).First(&b, "id = ?", bonusID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrDayPlanBonusNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get bonus: %w", err)
	}
	return &b, nil
}
