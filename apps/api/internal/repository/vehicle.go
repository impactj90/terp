package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrVehicleNotFound = errors.New("vehicle not found")

type VehicleRepository struct {
	db *DB
}

func NewVehicleRepository(db *DB) *VehicleRepository {
	return &VehicleRepository{db: db}
}

func (r *VehicleRepository) Create(ctx context.Context, v *model.Vehicle) error {
	return r.db.GORM.WithContext(ctx).Create(v).Error
}

func (r *VehicleRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Vehicle, error) {
	var v model.Vehicle
	err := r.db.GORM.WithContext(ctx).First(&v, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrVehicleNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get vehicle: %w", err)
	}
	return &v, nil
}

func (r *VehicleRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.Vehicle, error) {
	var v model.Vehicle
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&v).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrVehicleNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get vehicle by code: %w", err)
	}
	return &v, nil
}

func (r *VehicleRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.Vehicle, error) {
	var vehicles []model.Vehicle
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("sort_order ASC, code ASC").
		Find(&vehicles).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list vehicles: %w", err)
	}
	return vehicles, nil
}

func (r *VehicleRepository) Update(ctx context.Context, v *model.Vehicle) error {
	return r.db.GORM.WithContext(ctx).Save(v).Error
}

func (r *VehicleRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.Vehicle{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete vehicle: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrVehicleNotFound
	}
	return nil
}
