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
	ErrMonthlyValueNotFound = errors.New("monthly value not found")
)

// MonthlyValueRepository handles monthly value data access.
type MonthlyValueRepository struct {
	db *DB
}

// NewMonthlyValueRepository creates a new monthly value repository.
func NewMonthlyValueRepository(db *DB) *MonthlyValueRepository {
	return &MonthlyValueRepository{db: db}
}

// Create creates a new monthly value.
func (r *MonthlyValueRepository) Create(ctx context.Context, mv *model.MonthlyValue) error {
	return r.db.GORM.WithContext(ctx).Create(mv).Error
}

// GetByID retrieves a monthly value by ID.
func (r *MonthlyValueRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.MonthlyValue, error) {
	var mv model.MonthlyValue
	err := r.db.GORM.WithContext(ctx).
		First(&mv, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrMonthlyValueNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get monthly value: %w", err)
	}
	return &mv, nil
}

// Update updates a monthly value.
func (r *MonthlyValueRepository) Update(ctx context.Context, mv *model.MonthlyValue) error {
	return r.db.GORM.WithContext(ctx).Save(mv).Error
}

// Delete deletes a monthly value by ID.
func (r *MonthlyValueRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.MonthlyValue{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete monthly value: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrMonthlyValueNotFound
	}
	return nil
}

// GetByEmployeeMonth retrieves the monthly value for an employee for a specific year/month.
// Returns nil, nil if no record exists.
func (r *MonthlyValueRepository) GetByEmployeeMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error) {
	var mv model.MonthlyValue
	err := r.db.GORM.WithContext(ctx).
		Where("employee_id = ? AND year = ? AND month = ?", employeeID, year, month).
		First(&mv).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get monthly value: %w", err)
	}
	return &mv, nil
}

// GetPreviousMonth retrieves the monthly value for the month before the given year/month.
// Handles year boundary (e.g., for Jan 2026 returns Dec 2025).
// Returns nil, nil if no record exists.
func (r *MonthlyValueRepository) GetPreviousMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error) {
	prevYear, prevMonth := year, month-1
	if prevMonth < 1 {
		prevYear--
		prevMonth = 12
	}
	return r.GetByEmployeeMonth(ctx, employeeID, prevYear, prevMonth)
}

// Upsert creates or updates a monthly value based on employee_id + year + month.
func (r *MonthlyValueRepository) Upsert(ctx context.Context, mv *model.MonthlyValue) error {
	return r.db.GORM.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "employee_id"}, {Name: "year"}, {Name: "month"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"total_gross_time", "total_net_time", "total_target_time",
				"total_overtime", "total_undertime", "total_break_time",
				"flextime_start", "flextime_change", "flextime_end", "flextime_carryover",
				"vacation_taken", "sick_days", "other_absence_days",
				"work_days", "days_with_errors",
				"updated_at",
			}),
		}).
		Create(mv).Error
}

// MonthlyValueFilter provides filter options for listing monthly values.
type MonthlyValueFilter struct {
	TenantID     uuid.UUID
	EmployeeID   *uuid.UUID
	Year         *int
	Month        *int
	IsClosed     *bool
	DepartmentID *uuid.UUID
}

// ListAll returns monthly values matching the given filter.
func (r *MonthlyValueRepository) ListAll(ctx context.Context, filter MonthlyValueFilter) ([]model.MonthlyValue, error) {
	q := r.db.GORM.WithContext(ctx).
		Where("monthly_values.tenant_id = ?", filter.TenantID)

	if filter.EmployeeID != nil {
		q = q.Where("monthly_values.employee_id = ?", *filter.EmployeeID)
	}
	if filter.Year != nil {
		q = q.Where("monthly_values.year = ?", *filter.Year)
	}
	if filter.Month != nil {
		q = q.Where("monthly_values.month = ?", *filter.Month)
	}
	if filter.IsClosed != nil {
		q = q.Where("monthly_values.is_closed = ?", *filter.IsClosed)
	}
	if filter.DepartmentID != nil {
		q = q.Joins("JOIN employees ON employees.id = monthly_values.employee_id").
			Where(
				"(employees.department_id = ? OR employees.id IN (SELECT tm.employee_id FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE t.department_id = ?))",
				*filter.DepartmentID, *filter.DepartmentID,
			)
	}

	var values []model.MonthlyValue
	err := q.Order("monthly_values.year DESC, monthly_values.month DESC").Find(&values).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list monthly values: %w", err)
	}
	return values, nil
}

// ListByEmployee retrieves all monthly values for an employee ordered by year, month.
func (r *MonthlyValueRepository) ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.MonthlyValue, error) {
	var values []model.MonthlyValue
	err := r.db.GORM.WithContext(ctx).
		Where("employee_id = ?", employeeID).
		Order("year ASC, month ASC").
		Find(&values).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list monthly values: %w", err)
	}
	return values, nil
}

// ListByEmployeeYear retrieves monthly values for an employee for a specific year.
func (r *MonthlyValueRepository) ListByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) ([]model.MonthlyValue, error) {
	var values []model.MonthlyValue
	err := r.db.GORM.WithContext(ctx).
		Where("employee_id = ? AND year = ?", employeeID, year).
		Order("month ASC").
		Find(&values).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list monthly values for year: %w", err)
	}
	return values, nil
}

// IsMonthClosed checks if the month containing the given date is closed for an employee.
// Satisfies the monthlyValueLookupForBooking interface in BookingService.
func (r *MonthlyValueRepository) IsMonthClosed(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (bool, error) {
	var mv model.MonthlyValue
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND employee_id = ? AND year = ? AND month = ?",
			tenantID, employeeID, date.Year(), int(date.Month())).
		First(&mv).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("failed to check month closed: %w", err)
	}
	return mv.IsClosed, nil
}

// CloseMonth marks a monthly value as closed.
func (r *MonthlyValueRepository) CloseMonth(ctx context.Context, employeeID uuid.UUID, year, month int, closedBy uuid.UUID) error {
	now := time.Now()
	result := r.db.GORM.WithContext(ctx).
		Model(&model.MonthlyValue{}).
		Where("employee_id = ? AND year = ? AND month = ?", employeeID, year, month).
		Updates(map[string]interface{}{
			"is_closed": true,
			"closed_at": now,
			"closed_by": closedBy,
		})

	if result.Error != nil {
		return fmt.Errorf("failed to close month: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrMonthlyValueNotFound
	}
	return nil
}

// ReopenMonth marks a monthly value as reopened.
func (r *MonthlyValueRepository) ReopenMonth(ctx context.Context, employeeID uuid.UUID, year, month int, reopenedBy uuid.UUID) error {
	now := time.Now()
	result := r.db.GORM.WithContext(ctx).
		Model(&model.MonthlyValue{}).
		Where("employee_id = ? AND year = ? AND month = ?", employeeID, year, month).
		Updates(map[string]interface{}{
			"is_closed":   false,
			"reopened_at": now,
			"reopened_by": reopenedBy,
		})

	if result.Error != nil {
		return fmt.Errorf("failed to reopen month: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrMonthlyValueNotFound
	}
	return nil
}
