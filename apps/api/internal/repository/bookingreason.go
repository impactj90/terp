package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrBookingReasonNotFound = errors.New("booking reason not found")

type BookingReasonRepository struct {
	db *DB
}

func NewBookingReasonRepository(db *DB) *BookingReasonRepository {
	return &BookingReasonRepository{db: db}
}

func (r *BookingReasonRepository) Create(ctx context.Context, br *model.BookingReason) error {
	return r.db.GORM.WithContext(ctx).Create(br).Error
}

func (r *BookingReasonRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.BookingReason, error) {
	var br model.BookingReason
	err := r.db.GORM.WithContext(ctx).First(&br, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrBookingReasonNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get booking reason: %w", err)
	}
	return &br, nil
}

func (r *BookingReasonRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, bookingTypeID uuid.UUID, code string) (*model.BookingReason, error) {
	var br model.BookingReason
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND booking_type_id = ? AND code = ?", tenantID, bookingTypeID, code).
		First(&br).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrBookingReasonNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get booking reason by code: %w", err)
	}
	return &br, nil
}

func (r *BookingReasonRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.BookingReason, error) {
	var reasons []model.BookingReason
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("sort_order ASC, code ASC").
		Find(&reasons).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list booking reasons: %w", err)
	}
	return reasons, nil
}

func (r *BookingReasonRepository) ListByBookingType(ctx context.Context, tenantID uuid.UUID, bookingTypeID uuid.UUID) ([]model.BookingReason, error) {
	var reasons []model.BookingReason
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND booking_type_id = ?", tenantID, bookingTypeID).
		Order("sort_order ASC, code ASC").
		Find(&reasons).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list booking reasons by type: %w", err)
	}
	return reasons, nil
}

func (r *BookingReasonRepository) Update(ctx context.Context, br *model.BookingReason) error {
	return r.db.GORM.WithContext(ctx).Save(br).Error
}

func (r *BookingReasonRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.BookingReason{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete booking reason: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrBookingReasonNotFound
	}
	return nil
}
