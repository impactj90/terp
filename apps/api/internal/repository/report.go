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
	ErrReportNotFound = errors.New("report not found")
)

// ReportFilter defines filter criteria for listing reports.
type ReportFilter struct {
	TenantID   uuid.UUID
	ReportType *string
	Status     *string
	Limit      int
	Cursor     *uuid.UUID
}

// ReportRepository handles report data access.
type ReportRepository struct {
	db *DB
}

// NewReportRepository creates a new ReportRepository.
func NewReportRepository(db *DB) *ReportRepository {
	return &ReportRepository{db: db}
}

// Create creates a new report record.
func (r *ReportRepository) Create(ctx context.Context, report *model.Report) error {
	return r.db.GORM.WithContext(ctx).Create(report).Error
}

// GetByID retrieves a report by ID.
func (r *ReportRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Report, error) {
	var report model.Report
	err := r.db.GORM.WithContext(ctx).
		First(&report, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrReportNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get report: %w", err)
	}
	return &report, nil
}

// Update saves changes to a report.
func (r *ReportRepository) Update(ctx context.Context, report *model.Report) error {
	return r.db.GORM.WithContext(ctx).Save(report).Error
}

// Delete deletes a report by ID.
func (r *ReportRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.Report{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete report: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrReportNotFound
	}
	return nil
}

// List retrieves reports with filters and cursor-based pagination.
func (r *ReportRepository) List(ctx context.Context, filter ReportFilter) ([]model.Report, error) {
	query := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", filter.TenantID)

	if filter.ReportType != nil {
		query = query.Where("report_type = ?", *filter.ReportType)
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

	var reports []model.Report
	err := query.
		Order("requested_at DESC").
		Limit(limit + 1).
		Find(&reports).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list reports: %w", err)
	}
	return reports, nil
}
