package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrContactTypeNotFound = errors.New("contact type not found")

type ContactTypeRepository struct {
	db *DB
}

func NewContactTypeRepository(db *DB) *ContactTypeRepository {
	return &ContactTypeRepository{db: db}
}

func (r *ContactTypeRepository) Create(ctx context.Context, ct *model.ContactType) error {
	return r.db.GORM.WithContext(ctx).Create(ct).Error
}

func (r *ContactTypeRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.ContactType, error) {
	var ct model.ContactType
	err := r.db.GORM.WithContext(ctx).First(&ct, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrContactTypeNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get contact type: %w", err)
	}
	return &ct, nil
}

func (r *ContactTypeRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.ContactType, error) {
	var ct model.ContactType
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&ct).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrContactTypeNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get contact type by code: %w", err)
	}
	return &ct, nil
}

func (r *ContactTypeRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.ContactType, error) {
	var types []model.ContactType
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("sort_order ASC, code ASC").
		Find(&types).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list contact types: %w", err)
	}
	return types, nil
}

func (r *ContactTypeRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.ContactType, error) {
	var types []model.ContactType
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND is_active = true", tenantID).
		Order("sort_order ASC, code ASC").
		Find(&types).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list active contact types: %w", err)
	}
	return types, nil
}

func (r *ContactTypeRepository) Update(ctx context.Context, ct *model.ContactType) error {
	return r.db.GORM.WithContext(ctx).Save(ct).Error
}

func (r *ContactTypeRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.ContactType{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete contact type: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrContactTypeNotFound
	}
	return nil
}

func (r *ContactTypeRepository) HasKinds(ctx context.Context, contactTypeID uuid.UUID) (bool, error) {
	var count int64
	err := r.db.GORM.WithContext(ctx).
		Model(&model.ContactKind{}).
		Where("contact_type_id = ?", contactTypeID).
		Count(&count).Error
	if err != nil {
		return false, fmt.Errorf("failed to check contact type usage: %w", err)
	}
	return count > 0, nil
}
