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
	ErrWeekPlanNotFound = errors.New("week plan not found")
)

// WeekPlanRepository handles week plan data access.
type WeekPlanRepository struct {
	db *DB
}

// NewWeekPlanRepository creates a new week plan repository.
func NewWeekPlanRepository(db *DB) *WeekPlanRepository {
	return &WeekPlanRepository{db: db}
}

// Create creates a new week plan.
func (r *WeekPlanRepository) Create(ctx context.Context, plan *model.WeekPlan) error {
	return r.db.GORM.WithContext(ctx).Create(plan).Error
}

// GetByID retrieves a week plan by ID.
func (r *WeekPlanRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.WeekPlan, error) {
	var plan model.WeekPlan
	err := r.db.GORM.WithContext(ctx).
		First(&plan, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrWeekPlanNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get week plan: %w", err)
	}
	return &plan, nil
}

// GetByCode retrieves a week plan by code for a tenant.
func (r *WeekPlanRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.WeekPlan, error) {
	var plan model.WeekPlan
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&plan).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrWeekPlanNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get week plan by code: %w", err)
	}
	return &plan, nil
}

// GetWithDayPlans retrieves a week plan with all day plans preloaded.
func (r *WeekPlanRepository) GetWithDayPlans(ctx context.Context, id uuid.UUID) (*model.WeekPlan, error) {
	var plan model.WeekPlan
	err := r.db.GORM.WithContext(ctx).
		Preload("MondayDayPlan").
		Preload("TuesdayDayPlan").
		Preload("WednesdayDayPlan").
		Preload("ThursdayDayPlan").
		Preload("FridayDayPlan").
		Preload("SaturdayDayPlan").
		Preload("SundayDayPlan").
		Where("id = ?", id).
		First(&plan).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrWeekPlanNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get week plan with day plans: %w", err)
	}
	return &plan, nil
}

// Update updates a week plan.
func (r *WeekPlanRepository) Update(ctx context.Context, plan *model.WeekPlan) error {
	return r.db.GORM.WithContext(ctx).Save(plan).Error
}

// Upsert creates or updates a week plan by ID.
func (r *WeekPlanRepository) Upsert(ctx context.Context, plan *model.WeekPlan) error {
	return r.db.GORM.WithContext(ctx).
		Where("id = ?", plan.ID).
		Assign(plan).
		FirstOrCreate(plan).Error
}

// Delete deletes a week plan by ID.
func (r *WeekPlanRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.WeekPlan{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete week plan: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrWeekPlanNotFound
	}
	return nil
}

// List retrieves all week plans for a tenant with day plan details.
func (r *WeekPlanRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.WeekPlan, error) {
	var plans []model.WeekPlan
	err := r.db.GORM.WithContext(ctx).
		Preload("MondayDayPlan").
		Preload("TuesdayDayPlan").
		Preload("WednesdayDayPlan").
		Preload("ThursdayDayPlan").
		Preload("FridayDayPlan").
		Preload("SaturdayDayPlan").
		Preload("SundayDayPlan").
		Where("tenant_id = ?", tenantID).
		Order("code ASC").
		Find(&plans).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list week plans: %w", err)
	}
	return plans, nil
}

// ListActive retrieves all active week plans for a tenant with day plan details.
func (r *WeekPlanRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.WeekPlan, error) {
	var plans []model.WeekPlan
	err := r.db.GORM.WithContext(ctx).
		Preload("MondayDayPlan").
		Preload("TuesdayDayPlan").
		Preload("WednesdayDayPlan").
		Preload("ThursdayDayPlan").
		Preload("FridayDayPlan").
		Preload("SaturdayDayPlan").
		Preload("SundayDayPlan").
		Where("tenant_id = ? AND is_active = ?", tenantID, true).
		Order("code ASC").
		Find(&plans).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list active week plans: %w", err)
	}
	return plans, nil
}
