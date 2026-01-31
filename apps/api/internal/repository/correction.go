package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrCorrectionNotFound = errors.New("correction not found")
)

// CorrectionFilter holds filter options for listing corrections.
type CorrectionFilter struct {
	TenantID       uuid.UUID
	EmployeeID     *uuid.UUID
	From           *time.Time
	To             *time.Time
	CorrectionType *string
	Status         *string
}

// CorrectionRepository handles correction data access.
type CorrectionRepository struct {
	db *DB
}

// NewCorrectionRepository creates a new CorrectionRepository.
func NewCorrectionRepository(db *DB) *CorrectionRepository {
	return &CorrectionRepository{db: db}
}

// List returns corrections matching the given filter.
func (r *CorrectionRepository) List(ctx context.Context, filter CorrectionFilter) ([]model.Correction, error) {
	q := r.db.GORM.WithContext(ctx).Where("tenant_id = ?", filter.TenantID)

	if filter.EmployeeID != nil {
		q = q.Where("employee_id = ?", *filter.EmployeeID)
	}
	if filter.From != nil {
		q = q.Where("correction_date >= ?", *filter.From)
	}
	if filter.To != nil {
		q = q.Where("correction_date <= ?", *filter.To)
	}
	if filter.CorrectionType != nil {
		q = q.Where("correction_type = ?", *filter.CorrectionType)
	}
	if filter.Status != nil {
		q = q.Where("status = ?", *filter.Status)
	}

	var corrections []model.Correction
	err := q.Order("correction_date DESC, created_at DESC").Find(&corrections).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list corrections: %w", err)
	}
	return corrections, nil
}

// GetByID retrieves a correction by ID.
func (r *CorrectionRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Correction, error) {
	var c model.Correction
	err := r.db.GORM.WithContext(ctx).First(&c, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrCorrectionNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get correction: %w", err)
	}
	return &c, nil
}

// Create creates a new correction.
func (r *CorrectionRepository) Create(ctx context.Context, c *model.Correction) error {
	return r.db.GORM.WithContext(ctx).Create(c).Error
}

// Update updates an existing correction.
func (r *CorrectionRepository) Update(ctx context.Context, c *model.Correction) error {
	return r.db.GORM.WithContext(ctx).Save(c).Error
}

// Delete deletes a correction by ID.
func (r *CorrectionRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.Correction{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete correction: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrCorrectionNotFound
	}
	return nil
}
