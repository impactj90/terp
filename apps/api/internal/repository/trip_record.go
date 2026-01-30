package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrTripRecordNotFound = errors.New("trip record not found")

type TripRecordRepository struct {
	db *DB
}

func NewTripRecordRepository(db *DB) *TripRecordRepository {
	return &TripRecordRepository{db: db}
}

func (r *TripRecordRepository) Create(ctx context.Context, tr *model.TripRecord) error {
	return r.db.GORM.WithContext(ctx).Create(tr).Error
}

func (r *TripRecordRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.TripRecord, error) {
	var tr model.TripRecord
	err := r.db.GORM.WithContext(ctx).First(&tr, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrTripRecordNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get trip record: %w", err)
	}
	return &tr, nil
}

func (r *TripRecordRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.TripRecord, error) {
	var records []model.TripRecord
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("trip_date DESC, created_at DESC").
		Find(&records).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list trip records: %w", err)
	}
	return records, nil
}

func (r *TripRecordRepository) ListByVehicle(ctx context.Context, tenantID uuid.UUID, vehicleID uuid.UUID) ([]model.TripRecord, error) {
	var records []model.TripRecord
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND vehicle_id = ?", tenantID, vehicleID).
		Order("trip_date DESC, created_at DESC").
		Find(&records).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list trip records by vehicle: %w", err)
	}
	return records, nil
}

func (r *TripRecordRepository) Update(ctx context.Context, tr *model.TripRecord) error {
	return r.db.GORM.WithContext(ctx).Save(tr).Error
}

func (r *TripRecordRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.TripRecord{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete trip record: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrTripRecordNotFound
	}
	return nil
}
