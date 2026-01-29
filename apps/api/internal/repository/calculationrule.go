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
	ErrCalculationRuleNotFound = errors.New("calculation rule not found")
)

// CalculationRuleRepository handles calculation rule data access.
type CalculationRuleRepository struct {
	db *DB
}

// NewCalculationRuleRepository creates a new calculation rule repository.
func NewCalculationRuleRepository(db *DB) *CalculationRuleRepository {
	return &CalculationRuleRepository{db: db}
}

// Create creates a new calculation rule.
func (r *CalculationRuleRepository) Create(ctx context.Context, rule *model.CalculationRule) error {
	return r.db.GORM.WithContext(ctx).
		Select("TenantID", "Code", "Name", "Description", "AccountID", "Value", "Factor", "IsActive").
		Create(rule).Error
}

// GetByID retrieves a calculation rule by ID.
func (r *CalculationRuleRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.CalculationRule, error) {
	var rule model.CalculationRule
	err := r.db.GORM.WithContext(ctx).
		First(&rule, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrCalculationRuleNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get calculation rule: %w", err)
	}
	return &rule, nil
}

// GetByCode retrieves a calculation rule by code within a tenant.
func (r *CalculationRuleRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.CalculationRule, error) {
	var rule model.CalculationRule
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&rule).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrCalculationRuleNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get calculation rule by code: %w", err)
	}
	return &rule, nil
}

// Update updates a calculation rule.
func (r *CalculationRuleRepository) Update(ctx context.Context, rule *model.CalculationRule) error {
	return r.db.GORM.WithContext(ctx).Save(rule).Error
}

// Delete deletes a calculation rule by ID.
func (r *CalculationRuleRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.CalculationRule{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete calculation rule: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrCalculationRuleNotFound
	}
	return nil
}

// List retrieves all calculation rules for a tenant.
func (r *CalculationRuleRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.CalculationRule, error) {
	var rules []model.CalculationRule
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("code ASC").
		Find(&rules).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list calculation rules: %w", err)
	}
	return rules, nil
}

// ListActive retrieves all active calculation rules for a tenant.
func (r *CalculationRuleRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.CalculationRule, error) {
	var rules []model.CalculationRule
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND is_active = ?", tenantID, true).
		Order("code ASC").
		Find(&rules).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list active calculation rules: %w", err)
	}
	return rules, nil
}

// CountAbsenceTypeUsages counts how many absence types reference this rule.
func (r *CalculationRuleRepository) CountAbsenceTypeUsages(ctx context.Context, ruleID uuid.UUID) (int64, error) {
	var count int64
	err := r.db.GORM.WithContext(ctx).
		Model(&model.AbsenceType{}).
		Where("calculation_rule_id = ?", ruleID).
		Count(&count).Error
	if err != nil {
		return 0, fmt.Errorf("failed to count absence type usages: %w", err)
	}
	return count, nil
}
