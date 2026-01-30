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
	ErrVacationCappingRuleNotFound = errors.New("vacation capping rule not found")
)

// VacationCappingRuleRepository handles vacation capping rule data access.
type VacationCappingRuleRepository struct {
	db *DB
}

// NewVacationCappingRuleRepository creates a new VacationCappingRuleRepository.
func NewVacationCappingRuleRepository(db *DB) *VacationCappingRuleRepository {
	return &VacationCappingRuleRepository{db: db}
}

// Create creates a new capping rule.
func (r *VacationCappingRuleRepository) Create(ctx context.Context, rule *model.VacationCappingRule) error {
	return r.db.GORM.WithContext(ctx).
		Select("TenantID", "Code", "Name", "Description", "RuleType", "CutoffMonth", "CutoffDay", "CapValue", "IsActive").
		Create(rule).Error
}

// GetByID retrieves a capping rule by ID.
func (r *VacationCappingRuleRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.VacationCappingRule, error) {
	var rule model.VacationCappingRule
	err := r.db.GORM.WithContext(ctx).
		First(&rule, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrVacationCappingRuleNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get vacation capping rule: %w", err)
	}
	return &rule, nil
}

// GetByCode retrieves a capping rule by tenant + code.
func (r *VacationCappingRuleRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.VacationCappingRule, error) {
	var rule model.VacationCappingRule
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&rule).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrVacationCappingRuleNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get vacation capping rule by code: %w", err)
	}
	return &rule, nil
}

// List retrieves all capping rules for a tenant.
func (r *VacationCappingRuleRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCappingRule, error) {
	var rules []model.VacationCappingRule
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("code ASC").
		Find(&rules).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list vacation capping rules: %w", err)
	}
	return rules, nil
}

// ListActive retrieves only active capping rules for a tenant.
func (r *VacationCappingRuleRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCappingRule, error) {
	var rules []model.VacationCappingRule
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND is_active = ?", tenantID, true).
		Order("code ASC").
		Find(&rules).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list active vacation capping rules: %w", err)
	}
	return rules, nil
}

// ListByType retrieves capping rules filtered by type for a tenant.
func (r *VacationCappingRuleRepository) ListByType(ctx context.Context, tenantID uuid.UUID, ruleType string) ([]model.VacationCappingRule, error) {
	var rules []model.VacationCappingRule
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND rule_type = ?", tenantID, ruleType).
		Order("code ASC").
		Find(&rules).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list vacation capping rules by type: %w", err)
	}
	return rules, nil
}

// ListByIDs retrieves capping rules by a list of IDs.
func (r *VacationCappingRuleRepository) ListByIDs(ctx context.Context, ids []uuid.UUID) ([]model.VacationCappingRule, error) {
	var rules []model.VacationCappingRule
	err := r.db.GORM.WithContext(ctx).
		Where("id IN ?", ids).
		Find(&rules).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list vacation capping rules by IDs: %w", err)
	}
	return rules, nil
}

// Update saves changes to a capping rule.
func (r *VacationCappingRuleRepository) Update(ctx context.Context, rule *model.VacationCappingRule) error {
	return r.db.GORM.WithContext(ctx).Save(rule).Error
}

// Delete deletes a capping rule by ID.
func (r *VacationCappingRuleRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.VacationCappingRule{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete vacation capping rule: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrVacationCappingRuleNotFound
	}
	return nil
}

// CountGroupUsages counts how many capping rule groups reference this rule.
func (r *VacationCappingRuleRepository) CountGroupUsages(ctx context.Context, ruleID uuid.UUID) (int64, error) {
	var count int64
	err := r.db.GORM.WithContext(ctx).
		Model(&model.VacationCappingRuleGroupRule{}).
		Where("capping_rule_id = ?", ruleID).
		Count(&count).Error
	if err != nil {
		return 0, fmt.Errorf("failed to count group usages: %w", err)
	}
	return count, nil
}
