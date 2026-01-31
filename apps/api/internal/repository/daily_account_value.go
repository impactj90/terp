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
	ErrDailyAccountValueNotFound = errors.New("daily account value not found")
)

// DailyAccountValueRepository handles daily account value data access.
type DailyAccountValueRepository struct {
	db *DB
}

// NewDailyAccountValueRepository creates a new DailyAccountValueRepository.
func NewDailyAccountValueRepository(db *DB) *DailyAccountValueRepository {
	return &DailyAccountValueRepository{db: db}
}

// Upsert creates or updates a daily account value based on the unique constraint
// (employee_id, value_date, account_id, source).
func (r *DailyAccountValueRepository) Upsert(ctx context.Context, dav *model.DailyAccountValue) error {
	return r.db.GORM.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{
				{Name: "employee_id"},
				{Name: "value_date"},
				{Name: "account_id"},
				{Name: "source"},
			},
			DoUpdates: clause.AssignmentColumns([]string{
				"value_minutes", "day_plan_id", "updated_at",
			}),
		}).
		Create(dav).Error
}

// GetByID retrieves a daily account value by ID.
func (r *DailyAccountValueRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.DailyAccountValue, error) {
	var dav model.DailyAccountValue
	err := r.db.GORM.WithContext(ctx).
		Preload("Account").
		First(&dav, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrDailyAccountValueNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get daily account value: %w", err)
	}
	return &dav, nil
}

// List returns daily account values matching optional filters for a tenant.
func (r *DailyAccountValueRepository) List(ctx context.Context, tenantID uuid.UUID, opts model.DailyAccountValueListOptions) ([]model.DailyAccountValue, error) {
	var values []model.DailyAccountValue
	q := r.db.GORM.WithContext(ctx).
		Preload("Account").
		Where("tenant_id = ?", tenantID)

	if opts.EmployeeID != nil {
		q = q.Where("employee_id = ?", *opts.EmployeeID)
	}
	if opts.AccountID != nil {
		q = q.Where("account_id = ?", *opts.AccountID)
	}
	if opts.From != nil {
		q = q.Where("value_date >= ?", *opts.From)
	}
	if opts.To != nil {
		q = q.Where("value_date <= ?", *opts.To)
	}
	if opts.Source != nil {
		q = q.Where("source = ?", *opts.Source)
	}

	err := q.Order("value_date ASC, source ASC").Find(&values).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list daily account values: %w", err)
	}
	return values, nil
}

// GetByEmployeeDate retrieves all daily account values for an employee on a specific date.
func (r *DailyAccountValueRepository) GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) ([]model.DailyAccountValue, error) {
	var values []model.DailyAccountValue
	err := r.db.GORM.WithContext(ctx).
		Preload("Account").
		Where("employee_id = ? AND value_date = ?", employeeID, date).
		Order("source ASC").
		Find(&values).Error

	if err != nil {
		return nil, fmt.Errorf("failed to get daily account values: %w", err)
	}
	return values, nil
}

// DeleteByEmployeeDate deletes all daily account values for an employee on a specific date.
func (r *DailyAccountValueRepository) DeleteByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) error {
	result := r.db.GORM.WithContext(ctx).
		Where("employee_id = ? AND value_date = ?", employeeID, date).
		Delete(&model.DailyAccountValue{})

	if result.Error != nil {
		return fmt.Errorf("failed to delete daily account values: %w", result.Error)
	}
	return nil
}

// SumByAccountAndRange sums daily account values for an employee, account, and date range.
func (r *DailyAccountValueRepository) SumByAccountAndRange(ctx context.Context, employeeID, accountID uuid.UUID, from, to time.Time) (int, error) {
	var result struct {
		Total int `gorm:"column:total"`
	}
	err := r.db.GORM.WithContext(ctx).
		Model(&model.DailyAccountValue{}).
		Select("COALESCE(SUM(value_minutes), 0) as total").
		Where("employee_id = ? AND account_id = ? AND value_date >= ? AND value_date <= ?",
			employeeID, accountID, from, to).
		Scan(&result).Error

	if err != nil {
		return 0, fmt.Errorf("failed to sum daily account values: %w", err)
	}
	return result.Total, nil
}
