package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrEmployeeDayPlanNotFound = errors.New("employee day plan not found")
)

// EmployeeDayPlanRepository handles employee day plan data access.
type EmployeeDayPlanRepository struct {
	db *DB
}

// NewEmployeeDayPlanRepository creates a new employee day plan repository.
func NewEmployeeDayPlanRepository(db *DB) *EmployeeDayPlanRepository {
	return &EmployeeDayPlanRepository{db: db}
}

// Create creates a new employee day plan.
func (r *EmployeeDayPlanRepository) Create(ctx context.Context, plan *model.EmployeeDayPlan) error {
	return r.db.GORM.WithContext(ctx).Create(plan).Error
}

// GetByID retrieves an employee day plan by ID.
func (r *EmployeeDayPlanRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.EmployeeDayPlan, error) {
	var plan model.EmployeeDayPlan
	err := r.db.GORM.WithContext(ctx).
		First(&plan, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEmployeeDayPlanNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get employee day plan: %w", err)
	}
	return &plan, nil
}

// Update updates an employee day plan.
func (r *EmployeeDayPlanRepository) Update(ctx context.Context, plan *model.EmployeeDayPlan) error {
	return r.db.GORM.WithContext(ctx).Save(plan).Error
}

// Delete deletes an employee day plan by ID.
func (r *EmployeeDayPlanRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.EmployeeDayPlan{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete employee day plan: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrEmployeeDayPlanNotFound
	}
	return nil
}

// GetForEmployeeDate retrieves the day plan for an employee on a specific date.
// Returns nil, nil if no plan exists for that date.
func (r *EmployeeDayPlanRepository) GetForEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.EmployeeDayPlan, error) {
	var plan model.EmployeeDayPlan
	err := r.db.GORM.WithContext(ctx).
		Preload("DayPlan").
		Preload("DayPlan.Breaks").
		Preload("DayPlan.Bonuses").
		Where("employee_id = ? AND plan_date = ?", employeeID, date).
		First(&plan).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get employee day plan: %w", err)
	}
	return &plan, nil
}

// GetForEmployeeDateRange retrieves all day plans for an employee within a date range.
func (r *EmployeeDayPlanRepository) GetForEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.EmployeeDayPlan, error) {
	var plans []model.EmployeeDayPlan
	err := r.db.GORM.WithContext(ctx).
		Preload("DayPlan").
		Preload("DayPlan.Breaks").
		Preload("DayPlan.Bonuses").
		Where("employee_id = ? AND plan_date >= ? AND plan_date <= ?", employeeID, from, to).
		Order("plan_date ASC").
		Find(&plans).Error

	if err != nil {
		return nil, fmt.Errorf("failed to get employee day plans for range: %w", err)
	}
	return plans, nil
}

// Upsert creates or updates an employee day plan based on employee_id + plan_date.
func (r *EmployeeDayPlanRepository) Upsert(ctx context.Context, plan *model.EmployeeDayPlan) error {
	return r.db.GORM.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "employee_id"}, {Name: "plan_date"}},
			DoUpdates: clause.AssignmentColumns([]string{"day_plan_id", "source", "notes", "updated_at"}),
		}).
		Create(plan).Error
}

// BulkCreate creates or updates multiple employee day plans efficiently.
func (r *EmployeeDayPlanRepository) BulkCreate(ctx context.Context, plans []model.EmployeeDayPlan) error {
	if len(plans) == 0 {
		return nil
	}
	return r.db.GORM.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "employee_id"}, {Name: "plan_date"}},
			DoUpdates: clause.AssignmentColumns([]string{"day_plan_id", "source", "notes", "updated_at"}),
		}).
		CreateInBatches(plans, 100).Error
}

// DeleteRange deletes all employee day plans for an employee within a date range.
func (r *EmployeeDayPlanRepository) DeleteRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error {
	result := r.db.GORM.WithContext(ctx).
		Where("employee_id = ? AND plan_date >= ? AND plan_date <= ?", employeeID, from, to).
		Delete(&model.EmployeeDayPlan{})

	if result.Error != nil {
		return fmt.Errorf("failed to delete employee day plans: %w", result.Error)
	}
	return nil
}
