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
	ErrMonthlyEvalTemplateNotFound = errors.New("monthly evaluation template not found")
)

// MonthlyEvalTemplateRepository handles monthly evaluation template data access.
type MonthlyEvalTemplateRepository struct {
	db *DB
}

// NewMonthlyEvalTemplateRepository creates a new MonthlyEvalTemplateRepository.
func NewMonthlyEvalTemplateRepository(db *DB) *MonthlyEvalTemplateRepository {
	return &MonthlyEvalTemplateRepository{db: db}
}

// List returns all evaluation templates for a tenant, optionally filtered by active status.
func (r *MonthlyEvalTemplateRepository) List(ctx context.Context, tenantID uuid.UUID, isActive *bool) ([]model.MonthlyEvaluationTemplate, error) {
	q := r.db.GORM.WithContext(ctx).Where("tenant_id = ?", tenantID)
	if isActive != nil {
		q = q.Where("is_active = ?", *isActive)
	}

	var templates []model.MonthlyEvaluationTemplate
	err := q.Order("name ASC").Find(&templates).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list monthly evaluation templates: %w", err)
	}
	return templates, nil
}

// GetByID retrieves an evaluation template by ID.
func (r *MonthlyEvalTemplateRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.MonthlyEvaluationTemplate, error) {
	var t model.MonthlyEvaluationTemplate
	err := r.db.GORM.WithContext(ctx).First(&t, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrMonthlyEvalTemplateNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get monthly evaluation template: %w", err)
	}
	return &t, nil
}

// GetDefault retrieves the default evaluation template for a tenant.
func (r *MonthlyEvalTemplateRepository) GetDefault(ctx context.Context, tenantID uuid.UUID) (*model.MonthlyEvaluationTemplate, error) {
	var t model.MonthlyEvaluationTemplate
	err := r.db.GORM.WithContext(ctx).Where("tenant_id = ? AND is_default = true", tenantID).First(&t).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrMonthlyEvalTemplateNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get default monthly evaluation template: %w", err)
	}
	return &t, nil
}

// Create creates a new evaluation template.
func (r *MonthlyEvalTemplateRepository) Create(ctx context.Context, t *model.MonthlyEvaluationTemplate) error {
	return r.db.GORM.WithContext(ctx).Create(t).Error
}

// Update updates an existing evaluation template.
func (r *MonthlyEvalTemplateRepository) Update(ctx context.Context, t *model.MonthlyEvaluationTemplate) error {
	return r.db.GORM.WithContext(ctx).Save(t).Error
}

// Delete deletes an evaluation template by ID.
func (r *MonthlyEvalTemplateRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.MonthlyEvaluationTemplate{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete monthly evaluation template: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrMonthlyEvalTemplateNotFound
	}
	return nil
}

// ClearDefault removes the default flag from all templates for a tenant.
func (r *MonthlyEvalTemplateRepository) ClearDefault(ctx context.Context, tenantID uuid.UUID) error {
	return r.db.GORM.WithContext(ctx).
		Model(&model.MonthlyEvaluationTemplate{}).
		Where("tenant_id = ? AND is_default = true", tenantID).
		Update("is_default", false).Error
}
