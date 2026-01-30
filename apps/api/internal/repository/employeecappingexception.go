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
	ErrEmployeeCappingExceptionNotFound = errors.New("employee capping exception not found")
)

// EmployeeCappingExceptionRepository handles employee capping exception data access.
type EmployeeCappingExceptionRepository struct {
	db *DB
}

// NewEmployeeCappingExceptionRepository creates a new EmployeeCappingExceptionRepository.
func NewEmployeeCappingExceptionRepository(db *DB) *EmployeeCappingExceptionRepository {
	return &EmployeeCappingExceptionRepository{db: db}
}

// Create creates a new employee capping exception.
func (r *EmployeeCappingExceptionRepository) Create(ctx context.Context, exc *model.EmployeeCappingException) error {
	return r.db.GORM.WithContext(ctx).
		Select("TenantID", "EmployeeID", "CappingRuleID", "ExemptionType", "RetainDays", "Year", "Notes", "IsActive").
		Create(exc).Error
}

// GetByID retrieves an exception by ID.
func (r *EmployeeCappingExceptionRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.EmployeeCappingException, error) {
	var exc model.EmployeeCappingException
	err := r.db.GORM.WithContext(ctx).
		First(&exc, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEmployeeCappingExceptionNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get employee capping exception: %w", err)
	}
	return &exc, nil
}

// List retrieves exceptions for a tenant with optional filters.
func (r *EmployeeCappingExceptionRepository) List(ctx context.Context, tenantID uuid.UUID, filters EmployeeCappingExceptionFilters) ([]model.EmployeeCappingException, error) {
	var exceptions []model.EmployeeCappingException
	q := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID)

	if filters.EmployeeID != nil {
		q = q.Where("employee_id = ?", *filters.EmployeeID)
	}
	if filters.CappingRuleID != nil {
		q = q.Where("capping_rule_id = ?", *filters.CappingRuleID)
	}
	if filters.Year != nil {
		q = q.Where("year = ? OR year IS NULL", *filters.Year)
	}

	err := q.Order("created_at DESC").Find(&exceptions).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list employee capping exceptions: %w", err)
	}
	return exceptions, nil
}

// ListActiveByEmployee retrieves active exceptions for an employee, optionally filtered by year.
func (r *EmployeeCappingExceptionRepository) ListActiveByEmployee(ctx context.Context, employeeID uuid.UUID, year *int) ([]model.EmployeeCappingException, error) {
	var exceptions []model.EmployeeCappingException
	q := r.db.GORM.WithContext(ctx).
		Where("employee_id = ? AND is_active = ?", employeeID, true)

	if year != nil {
		q = q.Where("year = ? OR year IS NULL", *year)
	}

	err := q.Find(&exceptions).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list active employee capping exceptions: %w", err)
	}
	return exceptions, nil
}

// ExistsByEmployeeRuleYear checks if a duplicate exception exists.
func (r *EmployeeCappingExceptionRepository) ExistsByEmployeeRuleYear(ctx context.Context, employeeID, cappingRuleID uuid.UUID, year *int) (bool, error) {
	var count int64
	q := r.db.GORM.WithContext(ctx).
		Model(&model.EmployeeCappingException{}).
		Where("employee_id = ? AND capping_rule_id = ?", employeeID, cappingRuleID)

	if year != nil {
		q = q.Where("year = ?", *year)
	} else {
		q = q.Where("year IS NULL")
	}

	err := q.Count(&count).Error
	if err != nil {
		return false, fmt.Errorf("failed to check capping exception existence: %w", err)
	}
	return count > 0, nil
}

// Update saves changes to an exception.
func (r *EmployeeCappingExceptionRepository) Update(ctx context.Context, exc *model.EmployeeCappingException) error {
	return r.db.GORM.WithContext(ctx).Save(exc).Error
}

// Delete deletes an exception by ID.
func (r *EmployeeCappingExceptionRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.EmployeeCappingException{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete employee capping exception: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrEmployeeCappingExceptionNotFound
	}
	return nil
}

// EmployeeCappingExceptionFilters defines optional filters for listing exceptions.
type EmployeeCappingExceptionFilters struct {
	EmployeeID    *uuid.UUID
	CappingRuleID *uuid.UUID
	Year          *int
}
