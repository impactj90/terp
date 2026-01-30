package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrExtendedTravelRuleNotFound = errors.New("extended travel rule not found")

type ExtendedTravelRuleRepository struct {
	db *DB
}

func NewExtendedTravelRuleRepository(db *DB) *ExtendedTravelRuleRepository {
	return &ExtendedTravelRuleRepository{db: db}
}

func (r *ExtendedTravelRuleRepository) Create(ctx context.Context, rule *model.ExtendedTravelRule) error {
	return r.db.GORM.WithContext(ctx).Create(rule).Error
}

func (r *ExtendedTravelRuleRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.ExtendedTravelRule, error) {
	var rule model.ExtendedTravelRule
	err := r.db.GORM.WithContext(ctx).First(&rule, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrExtendedTravelRuleNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get extended travel rule: %w", err)
	}
	return &rule, nil
}

func (r *ExtendedTravelRuleRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.ExtendedTravelRule, error) {
	var rules []model.ExtendedTravelRule
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("sort_order ASC").
		Find(&rules).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list extended travel rules: %w", err)
	}
	return rules, nil
}

func (r *ExtendedTravelRuleRepository) ListByRuleSet(ctx context.Context, ruleSetID uuid.UUID) ([]model.ExtendedTravelRule, error) {
	var rules []model.ExtendedTravelRule
	err := r.db.GORM.WithContext(ctx).
		Where("rule_set_id = ?", ruleSetID).
		Order("sort_order ASC").
		Find(&rules).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list extended travel rules by rule set: %w", err)
	}
	return rules, nil
}

func (r *ExtendedTravelRuleRepository) Update(ctx context.Context, rule *model.ExtendedTravelRule) error {
	return r.db.GORM.WithContext(ctx).Save(rule).Error
}

func (r *ExtendedTravelRuleRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.ExtendedTravelRule{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete extended travel rule: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrExtendedTravelRuleNotFound
	}
	return nil
}
