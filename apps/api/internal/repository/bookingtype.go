package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrBookingTypeNotFound = errors.New("booking type not found")
)

// BookingTypeRepository handles booking type data access.
type BookingTypeRepository struct {
	db *DB
}

// NewBookingTypeRepository creates a new booking type repository.
func NewBookingTypeRepository(db *DB) *BookingTypeRepository {
	return &BookingTypeRepository{db: db}
}

// Create creates a new booking type.
func (r *BookingTypeRepository) Create(ctx context.Context, bt *model.BookingType) error {
	return r.db.GORM.WithContext(ctx).Create(bt).Error
}

// GetByID retrieves a booking type by ID.
func (r *BookingTypeRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.BookingType, error) {
	var bt model.BookingType
	err := r.db.GORM.WithContext(ctx).
		First(&bt, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrBookingTypeNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get booking type: %w", err)
	}
	return &bt, nil
}

// GetByCode retrieves a booking type by code for a tenant (or system types if tenantID is nil).
func (r *BookingTypeRepository) GetByCode(ctx context.Context, tenantID *uuid.UUID, code string) (*model.BookingType, error) {
	var bt model.BookingType
	query := r.db.GORM.WithContext(ctx).Where("code = ?", code)
	if tenantID != nil {
		query = query.Where("tenant_id = ? OR tenant_id IS NULL", *tenantID)
	} else {
		query = query.Where("tenant_id IS NULL")
	}
	err := query.First(&bt).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrBookingTypeNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get booking type by code: %w", err)
	}
	return &bt, nil
}

// Update updates a booking type.
func (r *BookingTypeRepository) Update(ctx context.Context, bt *model.BookingType) error {
	return r.db.GORM.WithContext(ctx).Save(bt).Error
}

// Delete deletes a booking type by ID.
func (r *BookingTypeRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.BookingType{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete booking type: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrBookingTypeNotFound
	}
	return nil
}

// List retrieves all booking types for a tenant (tenant-specific only, excludes system types).
func (r *BookingTypeRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.BookingType, error) {
	var types []model.BookingType
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("code ASC").
		Find(&types).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list booking types: %w", err)
	}
	return types, nil
}

// ListWithSystem retrieves all booking types for a tenant including system types.
func (r *BookingTypeRepository) ListWithSystem(ctx context.Context, tenantID uuid.UUID) ([]model.BookingType, error) {
	var types []model.BookingType
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? OR tenant_id IS NULL", tenantID).
		Where("is_active = ?", true).
		Order("is_system DESC, code ASC").
		Find(&types).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list booking types with system: %w", err)
	}
	return types, nil
}

// ListActive retrieves all active booking types for a tenant including system types.
func (r *BookingTypeRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.BookingType, error) {
	var types []model.BookingType
	err := r.db.GORM.WithContext(ctx).
		Where("(tenant_id = ? OR tenant_id IS NULL) AND is_active = ?", tenantID, true).
		Order("is_system DESC, code ASC").
		Find(&types).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list active booking types: %w", err)
	}
	return types, nil
}

// ListByDirection retrieves all active booking types for a tenant by direction.
func (r *BookingTypeRepository) ListByDirection(ctx context.Context, tenantID uuid.UUID, direction model.BookingDirection) ([]model.BookingType, error) {
	var types []model.BookingType
	err := r.db.GORM.WithContext(ctx).
		Where("(tenant_id = ? OR tenant_id IS NULL) AND is_active = ? AND direction = ?", tenantID, true, direction).
		Order("is_system DESC, code ASC").
		Find(&types).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list booking types by direction: %w", err)
	}
	return types, nil
}

// GetSystemTypes retrieves all system booking types.
func (r *BookingTypeRepository) GetSystemTypes(ctx context.Context) ([]model.BookingType, error) {
	var types []model.BookingType
	err := r.db.GORM.WithContext(ctx).
		Where("is_system = ?", true).
		Order("code ASC").
		Find(&types).Error

	if err != nil {
		return nil, fmt.Errorf("failed to get system booking types: %w", err)
	}
	return types, nil
}
