package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrLocationNotFound     = errors.New("location not found")
	ErrLocationCodeConflict = errors.New("location code already exists")
)

// LocationRepository handles location data access.
type LocationRepository struct {
	db *DB
}

// NewLocationRepository creates a new LocationRepository.
func NewLocationRepository(db *DB) *LocationRepository {
	return &LocationRepository{db: db}
}

// List returns all locations for a tenant, optionally filtered by active status.
func (r *LocationRepository) List(ctx context.Context, tenantID uuid.UUID, isActive *bool) ([]model.Location, error) {
	q := r.db.GORM.WithContext(ctx).Where("tenant_id = ?", tenantID)
	if isActive != nil {
		q = q.Where("is_active = ?", *isActive)
	}

	var locations []model.Location
	err := q.Order("name ASC").Find(&locations).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list locations: %w", err)
	}
	return locations, nil
}

// GetByID retrieves a location by ID.
func (r *LocationRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Location, error) {
	var loc model.Location
	err := r.db.GORM.WithContext(ctx).First(&loc, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrLocationNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get location: %w", err)
	}
	return &loc, nil
}

// Create creates a new location.
func (r *LocationRepository) Create(ctx context.Context, loc *model.Location) error {
	err := r.db.GORM.WithContext(ctx).Create(loc).Error
	if err != nil && isDuplicateKey(err) {
		return ErrLocationCodeConflict
	}
	return err
}

// Update updates an existing location.
func (r *LocationRepository) Update(ctx context.Context, loc *model.Location) error {
	err := r.db.GORM.WithContext(ctx).Save(loc).Error
	if err != nil && isDuplicateKey(err) {
		return ErrLocationCodeConflict
	}
	return err
}

// Delete deletes a location by ID.
func (r *LocationRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.Location{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete location: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrLocationNotFound
	}
	return nil
}

func isDuplicateKey(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "duplicate key") || strings.Contains(msg, "unique constraint")
}
