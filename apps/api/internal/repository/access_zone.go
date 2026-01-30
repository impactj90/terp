package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrAccessZoneNotFound = errors.New("access zone not found")

type AccessZoneRepository struct {
	db *DB
}

func NewAccessZoneRepository(db *DB) *AccessZoneRepository {
	return &AccessZoneRepository{db: db}
}

func (r *AccessZoneRepository) Create(ctx context.Context, az *model.AccessZone) error {
	return r.db.GORM.WithContext(ctx).Create(az).Error
}

func (r *AccessZoneRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.AccessZone, error) {
	var az model.AccessZone
	err := r.db.GORM.WithContext(ctx).First(&az, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAccessZoneNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get access zone: %w", err)
	}
	return &az, nil
}

func (r *AccessZoneRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.AccessZone, error) {
	var az model.AccessZone
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&az).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAccessZoneNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get access zone by code: %w", err)
	}
	return &az, nil
}

func (r *AccessZoneRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.AccessZone, error) {
	var zones []model.AccessZone
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("sort_order ASC, code ASC").
		Find(&zones).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list access zones: %w", err)
	}
	return zones, nil
}

func (r *AccessZoneRepository) Update(ctx context.Context, az *model.AccessZone) error {
	return r.db.GORM.WithContext(ctx).Save(az).Error
}

func (r *AccessZoneRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.AccessZone{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete access zone: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrAccessZoneNotFound
	}
	return nil
}
