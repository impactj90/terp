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
	ErrEmployeeTariffAssignmentNotFound = errors.New("employee tariff assignment not found")
)

// EmployeeTariffAssignmentRepository handles employee tariff assignment data access.
type EmployeeTariffAssignmentRepository struct {
	db *DB
}

// NewEmployeeTariffAssignmentRepository creates a new employee tariff assignment repository.
func NewEmployeeTariffAssignmentRepository(db *DB) *EmployeeTariffAssignmentRepository {
	return &EmployeeTariffAssignmentRepository{db: db}
}

// Create creates a new employee tariff assignment.
func (r *EmployeeTariffAssignmentRepository) Create(ctx context.Context, assignment *model.EmployeeTariffAssignment) error {
	return r.db.GORM.WithContext(ctx).Create(assignment).Error
}

// GetByID retrieves an employee tariff assignment by ID.
func (r *EmployeeTariffAssignmentRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.EmployeeTariffAssignment, error) {
	var assignment model.EmployeeTariffAssignment
	err := r.db.GORM.WithContext(ctx).
		Preload("Tariff").
		First(&assignment, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEmployeeTariffAssignmentNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get employee tariff assignment: %w", err)
	}
	return &assignment, nil
}

// Update updates an employee tariff assignment.
func (r *EmployeeTariffAssignmentRepository) Update(ctx context.Context, assignment *model.EmployeeTariffAssignment) error {
	return r.db.GORM.WithContext(ctx).Save(assignment).Error
}

// Delete deletes an employee tariff assignment by ID (hard delete).
func (r *EmployeeTariffAssignmentRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.EmployeeTariffAssignment{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete employee tariff assignment: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrEmployeeTariffAssignmentNotFound
	}
	return nil
}

// ListByEmployee retrieves all tariff assignments for an employee.
func (r *EmployeeTariffAssignmentRepository) ListByEmployee(ctx context.Context, employeeID uuid.UUID, activeOnly bool) ([]model.EmployeeTariffAssignment, error) {
	var assignments []model.EmployeeTariffAssignment
	query := r.db.GORM.WithContext(ctx).
		Preload("Tariff").
		Where("employee_id = ?", employeeID)

	if activeOnly {
		query = query.Where("is_active = ?", true)
	}

	err := query.Order("effective_from ASC").Find(&assignments).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list employee tariff assignments: %w", err)
	}
	return assignments, nil
}

// GetEffectiveForDate retrieves the active assignment covering the given date for an employee.
// Returns nil, nil if no assignment covers the date (caller should fall back to default).
func (r *EmployeeTariffAssignmentRepository) GetEffectiveForDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.EmployeeTariffAssignment, error) {
	var assignment model.EmployeeTariffAssignment
	err := r.db.GORM.WithContext(ctx).
		Preload("Tariff").
		Preload("Tariff.Breaks", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC")
		}).
		Preload("Tariff.WeekPlan").
		Preload("Tariff.TariffWeekPlans", func(db *gorm.DB) *gorm.DB {
			return db.Order("sequence_order ASC")
		}).
		Preload("Tariff.TariffWeekPlans.WeekPlan").
		Preload("Tariff.TariffDayPlans", func(db *gorm.DB) *gorm.DB {
			return db.Order("day_position ASC")
		}).
		Preload("Tariff.TariffDayPlans.DayPlan").
		Where("employee_id = ? AND is_active = ? AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)",
			employeeID, true, date, date).
		Order("effective_from DESC").
		First(&assignment).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil // Not an error - caller falls back to default tariff
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get effective tariff assignment: %w", err)
	}
	return &assignment, nil
}

// GetEffectiveForDateBatch retrieves the active assignment covering the given date for multiple employees.
// Returns a map of employeeID → assignment (most recent effective_from wins per employee).
func (r *EmployeeTariffAssignmentRepository) GetEffectiveForDateBatch(ctx context.Context, employeeIDs []uuid.UUID, date time.Time) (map[uuid.UUID]*model.EmployeeTariffAssignment, error) {
	if len(employeeIDs) == 0 {
		return make(map[uuid.UUID]*model.EmployeeTariffAssignment), nil
	}

	var assignments []model.EmployeeTariffAssignment
	err := r.db.GORM.WithContext(ctx).
		Preload("Tariff").
		Where("employee_id IN ? AND is_active = ? AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)",
			employeeIDs, true, date, date).
		Order("effective_from DESC").
		Find(&assignments).Error
	if err != nil {
		return nil, fmt.Errorf("failed to batch fetch effective tariff assignments: %w", err)
	}

	result := make(map[uuid.UUID]*model.EmployeeTariffAssignment, len(assignments))
	for i := range assignments {
		a := &assignments[i]
		// First match per employee wins (ordered by effective_from DESC)
		if _, exists := result[a.EmployeeID]; !exists {
			result[a.EmployeeID] = a
		}
	}

	return result, nil
}

// HasOverlap checks if any active assignment overlaps the given date range for the employee.
// excludeID can be set to exclude a specific assignment (for update operations).
func (r *EmployeeTariffAssignmentRepository) HasOverlap(ctx context.Context, employeeID uuid.UUID, from time.Time, to *time.Time, excludeID *uuid.UUID) (bool, error) {
	query := r.db.GORM.WithContext(ctx).
		Model(&model.EmployeeTariffAssignment{}).
		Where("employee_id = ? AND is_active = ?", employeeID, true)

	// Overlap detection: A.start <= B.end AND A.end >= B.start
	// With NULL end dates treated as infinity
	if to != nil {
		query = query.Where("effective_from <= ?", *to)
	}
	// existing.effective_to IS NULL (open-ended) OR existing.effective_to >= new.from
	query = query.Where("(effective_to IS NULL OR effective_to >= ?)", from)

	if excludeID != nil {
		query = query.Where("id != ?", *excludeID)
	}

	var count int64
	err := query.Count(&count).Error
	if err != nil {
		return false, fmt.Errorf("failed to check overlap: %w", err)
	}
	return count > 0, nil
}
