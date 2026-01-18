# TICKET-023: Create Department Repository

**Type**: Repository
**Effort**: S
**Sprint**: 4 - Organization Structure
**Dependencies**: TICKET-022

## Description

Create the Department repository with hierarchy query support.

## Files to Create

- `apps/api/internal/repository/department.go`

## Implementation

```go
package repository

import (
    "context"

    "github.com/google/uuid"
    "gorm.io/gorm"

    "terp/apps/api/internal/model"
)

type DepartmentRepository interface {
    Create(ctx context.Context, dept *model.Department) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.Department, error)
    GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.Department, error)
    Update(ctx context.Context, dept *model.Department) error
    Delete(ctx context.Context, id uuid.UUID) error
    List(ctx context.Context, tenantID uuid.UUID) ([]model.Department, error)
    ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.Department, error)
    GetChildren(ctx context.Context, departmentID uuid.UUID) ([]model.Department, error)
    GetRoots(ctx context.Context, tenantID uuid.UUID) ([]model.Department, error)
    GetWithChildren(ctx context.Context, id uuid.UUID) (*model.Department, error)
    GetHierarchy(ctx context.Context, tenantID uuid.UUID) ([]model.Department, error)
}

type departmentRepository struct {
    db *gorm.DB
}

func NewDepartmentRepository(db *gorm.DB) DepartmentRepository {
    return &departmentRepository{db: db}
}

func (r *departmentRepository) GetChildren(ctx context.Context, departmentID uuid.UUID) ([]model.Department, error) {
    var children []model.Department
    err := r.db.WithContext(ctx).
        Where("parent_id = ?", departmentID).
        Find(&children).Error
    return children, err
}

func (r *departmentRepository) GetRoots(ctx context.Context, tenantID uuid.UUID) ([]model.Department, error) {
    var roots []model.Department
    err := r.db.WithContext(ctx).
        Where("tenant_id = ? AND parent_id IS NULL", tenantID).
        Find(&roots).Error
    return roots, err
}

func (r *departmentRepository) GetWithChildren(ctx context.Context, id uuid.UUID) (*model.Department, error) {
    var dept model.Department
    err := r.db.WithContext(ctx).
        Preload("Children").
        Where("id = ?", id).
        First(&dept).Error
    return &dept, err
}

func (r *departmentRepository) GetHierarchy(ctx context.Context, tenantID uuid.UUID) ([]model.Department, error) {
    // Get all departments and build tree in memory
    // For large hierarchies, consider recursive CTE
    var depts []model.Department
    err := r.db.WithContext(ctx).
        Where("tenant_id = ?", tenantID).
        Order("parent_id NULLS FIRST, name ASC").
        Find(&depts).Error
    return depts, err
}

// Standard CRUD methods...
```

## Acceptance Criteria

- [x] `make test` passes
- [x] `make lint` passes
- [x] GetRoots returns departments with NULL parent_id
- [x] GetChildren returns direct children only
- [x] GetHierarchy returns all departments ordered for tree building
