package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrTravelAllowanceRuleSetNotFound = errors.New("travel allowance rule set not found")

type TravelAllowanceRuleSetRepository struct {
	db *DB
}

func NewTravelAllowanceRuleSetRepository(db *DB) *TravelAllowanceRuleSetRepository {
	return &TravelAllowanceRuleSetRepository{db: db}
}

func (r *TravelAllowanceRuleSetRepository) Create(ctx context.Context, rs *model.TravelAllowanceRuleSet) error {
	return r.db.GORM.WithContext(ctx).Create(rs).Error
}

func (r *TravelAllowanceRuleSetRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.TravelAllowanceRuleSet, error) {
	var rs model.TravelAllowanceRuleSet
	err := r.db.GORM.WithContext(ctx).First(&rs, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrTravelAllowanceRuleSetNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get travel allowance rule set: %w", err)
	}
	return &rs, nil
}

func (r *TravelAllowanceRuleSetRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.TravelAllowanceRuleSet, error) {
	var rs model.TravelAllowanceRuleSet
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&rs).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrTravelAllowanceRuleSetNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get travel allowance rule set by code: %w", err)
	}
	return &rs, nil
}

func (r *TravelAllowanceRuleSetRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.TravelAllowanceRuleSet, error) {
	var ruleSets []model.TravelAllowanceRuleSet
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("sort_order ASC, code ASC").
		Find(&ruleSets).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list travel allowance rule sets: %w", err)
	}
	return ruleSets, nil
}

func (r *TravelAllowanceRuleSetRepository) Update(ctx context.Context, rs *model.TravelAllowanceRuleSet) error {
	return r.db.GORM.WithContext(ctx).Save(rs).Error
}

func (r *TravelAllowanceRuleSetRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.TravelAllowanceRuleSet{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete travel allowance rule set: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrTravelAllowanceRuleSetNotFound
	}
	return nil
}
