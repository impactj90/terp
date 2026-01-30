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
	ErrMacroNotFound           = errors.New("macro not found")
	ErrMacroNameConflict       = errors.New("macro name already exists for this tenant")
	ErrMacroAssignmentNotFound = errors.New("macro assignment not found")
	ErrMacroExecutionNotFound  = errors.New("macro execution not found")
)

// MacroRepository handles macro data access.
type MacroRepository struct {
	db *DB
}

// NewMacroRepository creates a new MacroRepository.
func NewMacroRepository(db *DB) *MacroRepository {
	return &MacroRepository{db: db}
}

// --- Macro CRUD ---

// Create creates a new macro.
func (r *MacroRepository) Create(ctx context.Context, m *model.Macro) error {
	return r.db.GORM.WithContext(ctx).Create(m).Error
}

// GetByID retrieves a macro by ID with assignments preloaded.
func (r *MacroRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Macro, error) {
	var m model.Macro
	err := r.db.GORM.WithContext(ctx).
		Preload("Assignments").
		First(&m, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrMacroNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get macro: %w", err)
	}
	return &m, nil
}

// GetByTenantAndID retrieves a macro scoped by tenant.
func (r *MacroRepository) GetByTenantAndID(ctx context.Context, tenantID, id uuid.UUID) (*model.Macro, error) {
	var m model.Macro
	err := r.db.GORM.WithContext(ctx).
		Preload("Assignments").
		Where("tenant_id = ?", tenantID).
		First(&m, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrMacroNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get macro: %w", err)
	}
	return &m, nil
}

// GetByName retrieves a macro by tenant + name.
func (r *MacroRepository) GetByName(ctx context.Context, tenantID uuid.UUID, name string) (*model.Macro, error) {
	var m model.Macro
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND name = ?", tenantID, name).
		First(&m).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrMacroNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get macro by name: %w", err)
	}
	return &m, nil
}

// List retrieves all macros for a tenant.
func (r *MacroRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.Macro, error) {
	var macros []model.Macro
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Preload("Assignments").
		Order("name ASC").
		Find(&macros).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list macros: %w", err)
	}
	return macros, nil
}

// ListActive retrieves all active macros for a tenant.
func (r *MacroRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.Macro, error) {
	var macros []model.Macro
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND is_active = ?", tenantID, true).
		Preload("Assignments", "is_active = ?", true).
		Order("name ASC").
		Find(&macros).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list active macros: %w", err)
	}
	return macros, nil
}

// ListActiveByType retrieves all active macros of a given type for a tenant.
func (r *MacroRepository) ListActiveByType(ctx context.Context, tenantID uuid.UUID, macroType model.MacroType) ([]model.Macro, error) {
	var macros []model.Macro
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND is_active = ? AND macro_type = ?", tenantID, true, macroType).
		Preload("Assignments", "is_active = ?", true).
		Order("name ASC").
		Find(&macros).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list active macros by type: %w", err)
	}
	return macros, nil
}

// Update saves changes to a macro.
func (r *MacroRepository) Update(ctx context.Context, m *model.Macro) error {
	return r.db.GORM.WithContext(ctx).Save(m).Error
}

// Delete deletes a macro by ID.
func (r *MacroRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.Macro{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete macro: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrMacroNotFound
	}
	return nil
}

// --- Assignment CRUD ---

// CreateAssignment creates a new macro assignment.
func (r *MacroRepository) CreateAssignment(ctx context.Context, a *model.MacroAssignment) error {
	return r.db.GORM.WithContext(ctx).Create(a).Error
}

// GetAssignmentByID retrieves an assignment by ID.
func (r *MacroRepository) GetAssignmentByID(ctx context.Context, id uuid.UUID) (*model.MacroAssignment, error) {
	var a model.MacroAssignment
	err := r.db.GORM.WithContext(ctx).
		Preload("Macro").
		First(&a, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrMacroAssignmentNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get macro assignment: %w", err)
	}
	return &a, nil
}

// ListAssignmentsByMacro retrieves all assignments for a macro.
func (r *MacroRepository) ListAssignmentsByMacro(ctx context.Context, macroID uuid.UUID) ([]model.MacroAssignment, error) {
	var assignments []model.MacroAssignment
	err := r.db.GORM.WithContext(ctx).
		Where("macro_id = ?", macroID).
		Order("created_at ASC").
		Find(&assignments).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list macro assignments: %w", err)
	}
	return assignments, nil
}

// ListAssignmentsByTariff retrieves all assignments for a tariff.
func (r *MacroRepository) ListAssignmentsByTariff(ctx context.Context, tariffID uuid.UUID) ([]model.MacroAssignment, error) {
	var assignments []model.MacroAssignment
	err := r.db.GORM.WithContext(ctx).
		Where("tariff_id = ?", tariffID).
		Preload("Macro").
		Order("created_at ASC").
		Find(&assignments).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list tariff macro assignments: %w", err)
	}
	return assignments, nil
}

// ListAssignmentsByEmployee retrieves all assignments for an employee.
func (r *MacroRepository) ListAssignmentsByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.MacroAssignment, error) {
	var assignments []model.MacroAssignment
	err := r.db.GORM.WithContext(ctx).
		Where("employee_id = ?", employeeID).
		Preload("Macro").
		Order("created_at ASC").
		Find(&assignments).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list employee macro assignments: %w", err)
	}
	return assignments, nil
}

// UpdateAssignment saves changes to an assignment.
func (r *MacroRepository) UpdateAssignment(ctx context.Context, a *model.MacroAssignment) error {
	return r.db.GORM.WithContext(ctx).Save(a).Error
}

// DeleteAssignment deletes an assignment by ID.
func (r *MacroRepository) DeleteAssignment(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.MacroAssignment{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete macro assignment: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrMacroAssignmentNotFound
	}
	return nil
}

// --- Execution methods ---

// CreateExecution creates a new execution record.
func (r *MacroRepository) CreateExecution(ctx context.Context, e *model.MacroExecution) error {
	return r.db.GORM.WithContext(ctx).Create(e).Error
}

// GetExecutionByID retrieves an execution by ID.
func (r *MacroRepository) GetExecutionByID(ctx context.Context, id uuid.UUID) (*model.MacroExecution, error) {
	var e model.MacroExecution
	err := r.db.GORM.WithContext(ctx).
		Preload("Macro").
		Preload("Assignment").
		First(&e, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrMacroExecutionNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get macro execution: %w", err)
	}
	return &e, nil
}

// ListExecutionsByMacro retrieves execution history for a macro.
func (r *MacroRepository) ListExecutionsByMacro(ctx context.Context, macroID uuid.UUID, limit int) ([]model.MacroExecution, error) {
	if limit <= 0 {
		limit = 20
	}
	var executions []model.MacroExecution
	err := r.db.GORM.WithContext(ctx).
		Where("macro_id = ?", macroID).
		Order("created_at DESC").
		Limit(limit).
		Find(&executions).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list macro executions: %w", err)
	}
	return executions, nil
}

// UpdateExecution saves changes to an execution.
func (r *MacroRepository) UpdateExecution(ctx context.Context, e *model.MacroExecution) error {
	return r.db.GORM.WithContext(ctx).Save(e).Error
}
