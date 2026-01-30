package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrVehicleRouteNotFound = errors.New("vehicle route not found")

type VehicleRouteRepository struct {
	db *DB
}

func NewVehicleRouteRepository(db *DB) *VehicleRouteRepository {
	return &VehicleRouteRepository{db: db}
}

func (r *VehicleRouteRepository) Create(ctx context.Context, vr *model.VehicleRoute) error {
	return r.db.GORM.WithContext(ctx).Create(vr).Error
}

func (r *VehicleRouteRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.VehicleRoute, error) {
	var vr model.VehicleRoute
	err := r.db.GORM.WithContext(ctx).First(&vr, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrVehicleRouteNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get vehicle route: %w", err)
	}
	return &vr, nil
}

func (r *VehicleRouteRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.VehicleRoute, error) {
	var vr model.VehicleRoute
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&vr).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrVehicleRouteNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get vehicle route by code: %w", err)
	}
	return &vr, nil
}

func (r *VehicleRouteRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.VehicleRoute, error) {
	var routes []model.VehicleRoute
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("sort_order ASC, code ASC").
		Find(&routes).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list vehicle routes: %w", err)
	}
	return routes, nil
}

func (r *VehicleRouteRepository) Update(ctx context.Context, vr *model.VehicleRoute) error {
	return r.db.GORM.WithContext(ctx).Save(vr).Error
}

func (r *VehicleRouteRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.VehicleRoute{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete vehicle route: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrVehicleRouteNotFound
	}
	return nil
}
