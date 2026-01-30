package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrLocalTravelRuleNotFound = errors.New("local travel rule not found")

type LocalTravelRuleRepository struct {
	db *DB
}

func NewLocalTravelRuleRepository(db *DB) *LocalTravelRuleRepository {
	return &LocalTravelRuleRepository{db: db}
}

func (r *LocalTravelRuleRepository) Create(ctx context.Context, rule *model.LocalTravelRule) error {
	return r.db.GORM.WithContext(ctx).Create(rule).Error
}

func (r *LocalTravelRuleRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.LocalTravelRule, error) {
	var rule model.LocalTravelRule
	err := r.db.GORM.WithContext(ctx).First(&rule, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrLocalTravelRuleNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get local travel rule: %w", err)
	}
	return &rule, nil
}

func (r *LocalTravelRuleRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.LocalTravelRule, error) {
	var rules []model.LocalTravelRule
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("sort_order ASC").
		Find(&rules).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list local travel rules: %w", err)
	}
	return rules, nil
}

func (r *LocalTravelRuleRepository) ListByRuleSet(ctx context.Context, ruleSetID uuid.UUID) ([]model.LocalTravelRule, error) {
	var rules []model.LocalTravelRule
	err := r.db.GORM.WithContext(ctx).
		Where("rule_set_id = ?", ruleSetID).
		Order("sort_order ASC, min_distance_km ASC").
		Find(&rules).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list local travel rules by rule set: %w", err)
	}
	return rules, nil
}

func (r *LocalTravelRuleRepository) Update(ctx context.Context, rule *model.LocalTravelRule) error {
	return r.db.GORM.WithContext(ctx).Save(rule).Error
}

func (r *LocalTravelRuleRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.LocalTravelRule{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete local travel rule: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrLocalTravelRuleNotFound
	}
	return nil
}
