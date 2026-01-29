package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrAccountGroupNotFound = errors.New("account group not found")

type AccountGroupRepository struct {
	db *DB
}

func NewAccountGroupRepository(db *DB) *AccountGroupRepository {
	return &AccountGroupRepository{db: db}
}

func (r *AccountGroupRepository) Create(ctx context.Context, g *model.AccountGroup) error {
	return r.db.GORM.WithContext(ctx).Create(g).Error
}

func (r *AccountGroupRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.AccountGroup, error) {
	var g model.AccountGroup
	err := r.db.GORM.WithContext(ctx).First(&g, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAccountGroupNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get account group: %w", err)
	}
	return &g, nil
}

func (r *AccountGroupRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.AccountGroup, error) {
	var g model.AccountGroup
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&g).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAccountGroupNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get account group by code: %w", err)
	}
	return &g, nil
}

func (r *AccountGroupRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.AccountGroup, error) {
	var groups []model.AccountGroup
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("sort_order ASC, code ASC").
		Find(&groups).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list account groups: %w", err)
	}
	return groups, nil
}

func (r *AccountGroupRepository) Update(ctx context.Context, g *model.AccountGroup) error {
	return r.db.GORM.WithContext(ctx).Save(g).Error
}

func (r *AccountGroupRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.AccountGroup{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete account group: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrAccountGroupNotFound
	}
	return nil
}
