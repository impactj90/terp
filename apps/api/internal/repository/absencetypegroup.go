package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrAbsenceTypeGroupNotFound = errors.New("absence type group not found")

type AbsenceTypeGroupRepository struct {
	db *DB
}

func NewAbsenceTypeGroupRepository(db *DB) *AbsenceTypeGroupRepository {
	return &AbsenceTypeGroupRepository{db: db}
}

func (r *AbsenceTypeGroupRepository) Create(ctx context.Context, g *model.AbsenceTypeGroup) error {
	return r.db.GORM.WithContext(ctx).Create(g).Error
}

func (r *AbsenceTypeGroupRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceTypeGroup, error) {
	var g model.AbsenceTypeGroup
	err := r.db.GORM.WithContext(ctx).First(&g, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAbsenceTypeGroupNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get absence type group: %w", err)
	}
	return &g, nil
}

func (r *AbsenceTypeGroupRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.AbsenceTypeGroup, error) {
	var g model.AbsenceTypeGroup
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&g).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAbsenceTypeGroupNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get absence type group by code: %w", err)
	}
	return &g, nil
}

func (r *AbsenceTypeGroupRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.AbsenceTypeGroup, error) {
	var groups []model.AbsenceTypeGroup
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("code ASC").
		Find(&groups).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list absence type groups: %w", err)
	}
	return groups, nil
}

func (r *AbsenceTypeGroupRepository) Update(ctx context.Context, g *model.AbsenceTypeGroup) error {
	return r.db.GORM.WithContext(ctx).Save(g).Error
}

func (r *AbsenceTypeGroupRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.AbsenceTypeGroup{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete absence type group: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrAbsenceTypeGroupNotFound
	}
	return nil
}
