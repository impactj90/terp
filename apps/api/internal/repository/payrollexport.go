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
	ErrPayrollExportNotFound = errors.New("payroll export not found")
)

// PayrollExportFilter defines filter criteria for listing payroll exports.
type PayrollExportFilter struct {
	TenantID uuid.UUID
	Year     *int
	Month    *int
	Status   *string
	Limit    int
	Cursor   *uuid.UUID
}

// PayrollExportRepository handles payroll export data access.
type PayrollExportRepository struct {
	db *DB
}

// NewPayrollExportRepository creates a new PayrollExportRepository.
func NewPayrollExportRepository(db *DB) *PayrollExportRepository {
	return &PayrollExportRepository{db: db}
}

// Create creates a new payroll export record.
func (r *PayrollExportRepository) Create(ctx context.Context, pe *model.PayrollExport) error {
	return r.db.GORM.WithContext(ctx).Create(pe).Error
}

// GetByID retrieves a payroll export by ID.
func (r *PayrollExportRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.PayrollExport, error) {
	var pe model.PayrollExport
	err := r.db.GORM.WithContext(ctx).
		First(&pe, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrPayrollExportNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get payroll export: %w", err)
	}
	return &pe, nil
}

// Update saves changes to a payroll export.
func (r *PayrollExportRepository) Update(ctx context.Context, pe *model.PayrollExport) error {
	return r.db.GORM.WithContext(ctx).Save(pe).Error
}

// Delete deletes a payroll export by ID.
func (r *PayrollExportRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.PayrollExport{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete payroll export: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrPayrollExportNotFound
	}
	return nil
}

// List retrieves payroll exports with filters and cursor-based pagination.
func (r *PayrollExportRepository) List(ctx context.Context, filter PayrollExportFilter) ([]model.PayrollExport, error) {
	query := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", filter.TenantID)

	if filter.Year != nil {
		query = query.Where("year = ?", *filter.Year)
	}
	if filter.Month != nil {
		query = query.Where("month = ?", *filter.Month)
	}
	if filter.Status != nil {
		query = query.Where("status = ?", *filter.Status)
	}
	if filter.Cursor != nil {
		query = query.Where("id < ?", *filter.Cursor)
	}

	limit := filter.Limit
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	var exports []model.PayrollExport
	err := query.
		Order("requested_at DESC").
		Limit(limit + 1).
		Find(&exports).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list payroll exports: %w", err)
	}
	return exports, nil
}

// CountByInterfaceID counts exports for a given interface.
func (r *PayrollExportRepository) CountByInterfaceID(ctx context.Context, interfaceID uuid.UUID) (int64, error) {
	var count int64
	err := r.db.GORM.WithContext(ctx).
		Model(&model.PayrollExport{}).
		Where("export_interface_id = ?", interfaceID).
		Count(&count).Error
	if err != nil {
		return 0, fmt.Errorf("failed to count exports by interface: %w", err)
	}
	return count, nil
}
