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
	ErrDepartmentNotFound = errors.New("department not found")
)

// DepartmentRepository handles department data access.
type DepartmentRepository struct {
	db *DB
}

// NewDepartmentRepository creates a new department repository.
func NewDepartmentRepository(db *DB) *DepartmentRepository {
	return &DepartmentRepository{db: db}
}

// Create creates a new department.
func (r *DepartmentRepository) Create(ctx context.Context, dept *model.Department) error {
	return r.db.GORM.WithContext(ctx).
		Select("TenantID", "ParentID", "Code", "Name", "Description", "ManagerEmployeeID", "IsActive").
		Create(dept).Error
}

// GetByID retrieves a department by ID.
func (r *DepartmentRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Department, error) {
	var dept model.Department
	err := r.db.GORM.WithContext(ctx).
		First(&dept, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrDepartmentNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get department: %w", err)
	}
	return &dept, nil
}

// GetByCode retrieves a department by tenant ID and code.
func (r *DepartmentRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.Department, error) {
	var dept model.Department
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&dept).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrDepartmentNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get department by code: %w", err)
	}
	return &dept, nil
}

// Update updates a department.
func (r *DepartmentRepository) Update(ctx context.Context, dept *model.Department) error {
	return r.db.GORM.WithContext(ctx).Save(dept).Error
}

// Delete deletes a department by ID.
func (r *DepartmentRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.Department{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete department: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrDepartmentNotFound
	}
	return nil
}

// List retrieves all departments for a tenant.
func (r *DepartmentRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.Department, error) {
	var departments []model.Department
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("code ASC").
		Find(&departments).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list departments: %w", err)
	}
	return departments, nil
}

// ListActive retrieves all active departments for a tenant.
func (r *DepartmentRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.Department, error) {
	var departments []model.Department
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND is_active = ?", tenantID, true).
		Order("code ASC").
		Find(&departments).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list active departments: %w", err)
	}
	return departments, nil
}

// GetChildren retrieves direct children of a department.
func (r *DepartmentRepository) GetChildren(ctx context.Context, departmentID uuid.UUID) ([]model.Department, error) {
	var children []model.Department
	err := r.db.GORM.WithContext(ctx).
		Where("parent_id = ?", departmentID).
		Order("code ASC").
		Find(&children).Error

	if err != nil {
		return nil, fmt.Errorf("failed to get department children: %w", err)
	}
	return children, nil
}

// GetRoots retrieves all root departments (those with no parent) for a tenant.
func (r *DepartmentRepository) GetRoots(ctx context.Context, tenantID uuid.UUID) ([]model.Department, error) {
	var roots []model.Department
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND parent_id IS NULL", tenantID).
		Order("code ASC").
		Find(&roots).Error

	if err != nil {
		return nil, fmt.Errorf("failed to get root departments: %w", err)
	}
	return roots, nil
}

// GetWithChildren retrieves a department with its direct children preloaded.
func (r *DepartmentRepository) GetWithChildren(ctx context.Context, id uuid.UUID) (*model.Department, error) {
	var dept model.Department
	err := r.db.GORM.WithContext(ctx).
		Preload("Children").
		First(&dept, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrDepartmentNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get department with children: %w", err)
	}
	return &dept, nil
}

// GetHierarchy retrieves all departments for a tenant ordered for tree building.
// Departments are ordered with NULL parent_id first, then by name.
func (r *DepartmentRepository) GetHierarchy(ctx context.Context, tenantID uuid.UUID) ([]model.Department, error) {
	var departments []model.Department
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("parent_id NULLS FIRST, name ASC").
		Find(&departments).Error

	if err != nil {
		return nil, fmt.Errorf("failed to get department hierarchy: %w", err)
	}
	return departments, nil
}

// Upsert creates or updates a department by ID.
func (r *DepartmentRepository) Upsert(ctx context.Context, dept *model.Department) error {
	return r.db.GORM.WithContext(ctx).
		Where("id = ?", dept.ID).
		Assign(dept).
		FirstOrCreate(dept).Error
}
