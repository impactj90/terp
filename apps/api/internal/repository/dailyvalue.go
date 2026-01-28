package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrDailyValueNotFound = errors.New("daily value not found")
)

// DailyValueSum holds aggregated monthly totals.
type DailyValueSum struct {
	TotalGrossTime  int `gorm:"column:total_gross_time"`
	TotalNetTime    int `gorm:"column:total_net_time"`
	TotalTargetTime int `gorm:"column:total_target_time"`
	TotalOvertime   int `gorm:"column:total_overtime"`
	TotalUndertime  int `gorm:"column:total_undertime"`
	TotalBreakTime  int `gorm:"column:total_break_time"`
	TotalDays       int `gorm:"column:total_days"`
	DaysWithErrors  int `gorm:"column:days_with_errors"`
}

// DailyValueRepository handles daily value data access.
type DailyValueRepository struct {
	db *DB
}

// NewDailyValueRepository creates a new daily value repository.
func NewDailyValueRepository(db *DB) *DailyValueRepository {
	return &DailyValueRepository{db: db}
}

// Create creates a new daily value.
func (r *DailyValueRepository) Create(ctx context.Context, dv *model.DailyValue) error {
	normalizeDailyValueStatus(dv)
	return r.db.GORM.WithContext(ctx).Create(dv).Error
}

// GetByID retrieves a daily value by ID.
func (r *DailyValueRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.DailyValue, error) {
	var dv model.DailyValue
	err := r.db.GORM.WithContext(ctx).
		First(&dv, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrDailyValueNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get daily value: %w", err)
	}
	return &dv, nil
}

// Update updates a daily value.
func (r *DailyValueRepository) Update(ctx context.Context, dv *model.DailyValue) error {
	normalizeDailyValueStatus(dv)
	return r.db.GORM.WithContext(ctx).Save(dv).Error
}

// Delete deletes a daily value by ID.
func (r *DailyValueRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.DailyValue{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete daily value: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrDailyValueNotFound
	}
	return nil
}

// GetByEmployeeDate retrieves the daily value for an employee on a specific date.
// Returns nil, nil if no record exists for that date.
func (r *DailyValueRepository) GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error) {
	var dv model.DailyValue
	err := r.db.GORM.WithContext(ctx).
		Where("employee_id = ? AND value_date = ?", employeeID, date).
		First(&dv).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get daily value: %w", err)
	}
	return &dv, nil
}

// GetByEmployeeDateRange retrieves all daily values for an employee within a date range.
func (r *DailyValueRepository) GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.DailyValue, error) {
	var values []model.DailyValue
	err := r.db.GORM.WithContext(ctx).
		Where("employee_id = ? AND value_date >= ? AND value_date <= ?", employeeID, from, to).
		Order("value_date ASC").
		Find(&values).Error

	if err != nil {
		return nil, fmt.Errorf("failed to get daily values for range: %w", err)
	}
	return values, nil
}

// ListAll returns daily values matching optional filters for a tenant.
// Preloads Employee relation for display purposes.
func (r *DailyValueRepository) ListAll(ctx context.Context, tenantID uuid.UUID, opts model.DailyValueListOptions) ([]model.DailyValue, error) {
	var values []model.DailyValue
	q := r.db.GORM.WithContext(ctx).
		Preload("Employee").
		Where("tenant_id = ?", tenantID)

	if opts.EmployeeID != nil {
		q = q.Where("employee_id = ?", *opts.EmployeeID)
	}
	if opts.Status != nil {
		q = q.Where("status = ?", *opts.Status)
	}
	if opts.From != nil {
		q = q.Where("value_date >= ?", *opts.From)
	}
	if opts.To != nil {
		q = q.Where("value_date <= ?", *opts.To)
	}
	if opts.HasErrors != nil {
		q = q.Where("has_error = ?", *opts.HasErrors)
	}

	err := q.Order("value_date ASC").Find(&values).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list daily values: %w", err)
	}
	return values, nil
}

// Upsert creates or updates a daily value based on employee_id + value_date.
func (r *DailyValueRepository) Upsert(ctx context.Context, dv *model.DailyValue) error {
	normalizeDailyValueStatus(dv)
	return r.db.GORM.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "employee_id"}, {Name: "value_date"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"gross_time", "net_time", "target_time", "overtime", "undertime", "break_time",
				"has_error", "error_codes", "warnings", "status",
				"first_come", "last_go", "booking_count",
				"calculated_at", "calculation_version", "updated_at",
			}),
		}).
		Create(dv).Error
}

// BulkUpsert creates or updates multiple daily values efficiently.
func (r *DailyValueRepository) BulkUpsert(ctx context.Context, values []model.DailyValue) error {
	if len(values) == 0 {
		return nil
	}
	for i := range values {
		normalizeDailyValueStatus(&values[i])
	}
	return r.db.GORM.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "employee_id"}, {Name: "value_date"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"gross_time", "net_time", "target_time", "overtime", "undertime", "break_time",
				"has_error", "error_codes", "warnings", "status",
				"first_come", "last_go", "booking_count",
				"calculated_at", "calculation_version", "updated_at",
			}),
		}).
		CreateInBatches(values, 100).Error
}

func normalizeDailyValueStatus(dv *model.DailyValue) {
	if dv == nil {
		return
	}
	if dv.Status == "" {
		if dv.HasError {
			dv.Status = model.DailyValueStatusError
		} else {
			dv.Status = model.DailyValueStatusCalculated
		}
	}
}

// GetWithErrors retrieves daily values with errors for a tenant within a date range.
// Results are preloaded with Employee relation.
func (r *DailyValueRepository) GetWithErrors(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]model.DailyValue, error) {
	var values []model.DailyValue
	err := r.db.GORM.WithContext(ctx).
		Preload("Employee").
		Where("tenant_id = ? AND has_error = true AND value_date >= ? AND value_date <= ?", tenantID, from, to).
		Order("value_date DESC").
		Find(&values).Error

	if err != nil {
		return nil, fmt.Errorf("failed to get daily values with errors: %w", err)
	}
	return values, nil
}

// SumForMonth calculates aggregated totals for an employee for a specific month.
func (r *DailyValueRepository) SumForMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*DailyValueSum, error) {
	var sum DailyValueSum
	err := r.db.GORM.WithContext(ctx).
		Model(&model.DailyValue{}).
		Select(`
			COALESCE(SUM(gross_time), 0) as total_gross_time,
			COALESCE(SUM(net_time), 0) as total_net_time,
			COALESCE(SUM(target_time), 0) as total_target_time,
			COALESCE(SUM(overtime), 0) as total_overtime,
			COALESCE(SUM(undertime), 0) as total_undertime,
			COALESCE(SUM(break_time), 0) as total_break_time,
			COUNT(*) as total_days,
			COUNT(*) FILTER (WHERE has_error = true) as days_with_errors
		`).
		Where("employee_id = ? AND EXTRACT(YEAR FROM value_date) = ? AND EXTRACT(MONTH FROM value_date) = ?",
			employeeID, year, month).
		Scan(&sum).Error

	if err != nil {
		return nil, fmt.Errorf("failed to sum daily values for month: %w", err)
	}
	return &sum, nil
}

// DeleteRange deletes all daily values for an employee within a date range.
func (r *DailyValueRepository) DeleteRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error {
	result := r.db.GORM.WithContext(ctx).
		Where("employee_id = ? AND value_date >= ? AND value_date <= ?", employeeID, from, to).
		Delete(&model.DailyValue{})

	if result.Error != nil {
		return fmt.Errorf("failed to delete daily values: %w", result.Error)
	}
	return nil
}
