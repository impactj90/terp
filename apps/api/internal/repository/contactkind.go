package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrContactKindNotFound = errors.New("contact kind not found")

type ContactKindRepository struct {
	db *DB
}

func NewContactKindRepository(db *DB) *ContactKindRepository {
	return &ContactKindRepository{db: db}
}

func (r *ContactKindRepository) Create(ctx context.Context, ck *model.ContactKind) error {
	return r.db.GORM.WithContext(ctx).Create(ck).Error
}

func (r *ContactKindRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.ContactKind, error) {
	var ck model.ContactKind
	err := r.db.GORM.WithContext(ctx).First(&ck, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrContactKindNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get contact kind: %w", err)
	}
	return &ck, nil
}

func (r *ContactKindRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.ContactKind, error) {
	var ck model.ContactKind
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&ck).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrContactKindNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get contact kind by code: %w", err)
	}
	return &ck, nil
}

func (r *ContactKindRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.ContactKind, error) {
	var kinds []model.ContactKind
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("sort_order ASC, code ASC").
		Find(&kinds).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list contact kinds: %w", err)
	}
	return kinds, nil
}

func (r *ContactKindRepository) ListByContactType(ctx context.Context, tenantID uuid.UUID, contactTypeID uuid.UUID) ([]model.ContactKind, error) {
	var kinds []model.ContactKind
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND contact_type_id = ?", tenantID, contactTypeID).
		Order("sort_order ASC, code ASC").
		Find(&kinds).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list contact kinds by type: %w", err)
	}
	return kinds, nil
}

func (r *ContactKindRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.ContactKind, error) {
	var kinds []model.ContactKind
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND is_active = true", tenantID).
		Order("sort_order ASC, code ASC").
		Find(&kinds).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list active contact kinds: %w", err)
	}
	return kinds, nil
}

func (r *ContactKindRepository) Update(ctx context.Context, ck *model.ContactKind) error {
	return r.db.GORM.WithContext(ctx).Save(ck).Error
}

func (r *ContactKindRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.ContactKind{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete contact kind: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrContactKindNotFound
	}
	return nil
}
