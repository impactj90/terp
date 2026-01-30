package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrAccessProfileNotFound = errors.New("access profile not found")

type AccessProfileRepository struct {
	db *DB
}

func NewAccessProfileRepository(db *DB) *AccessProfileRepository {
	return &AccessProfileRepository{db: db}
}

func (r *AccessProfileRepository) Create(ctx context.Context, ap *model.AccessProfile) error {
	return r.db.GORM.WithContext(ctx).Create(ap).Error
}

func (r *AccessProfileRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.AccessProfile, error) {
	var ap model.AccessProfile
	err := r.db.GORM.WithContext(ctx).First(&ap, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAccessProfileNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get access profile: %w", err)
	}
	return &ap, nil
}

func (r *AccessProfileRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.AccessProfile, error) {
	var ap model.AccessProfile
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&ap).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAccessProfileNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get access profile by code: %w", err)
	}
	return &ap, nil
}

func (r *AccessProfileRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.AccessProfile, error) {
	var profiles []model.AccessProfile
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("code ASC").
		Find(&profiles).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list access profiles: %w", err)
	}
	return profiles, nil
}

func (r *AccessProfileRepository) Update(ctx context.Context, ap *model.AccessProfile) error {
	return r.db.GORM.WithContext(ctx).Save(ap).Error
}

func (r *AccessProfileRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.AccessProfile{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete access profile: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrAccessProfileNotFound
	}
	return nil
}

func (r *AccessProfileRepository) HasAssignments(ctx context.Context, accessProfileID uuid.UUID) (bool, error) {
	var count int64
	err := r.db.GORM.WithContext(ctx).
		Model(&model.EmployeeAccessAssignment{}).
		Where("access_profile_id = ?", accessProfileID).
		Count(&count).Error
	if err != nil {
		return false, fmt.Errorf("failed to check access profile usage: %w", err)
	}
	return count > 0, nil
}
