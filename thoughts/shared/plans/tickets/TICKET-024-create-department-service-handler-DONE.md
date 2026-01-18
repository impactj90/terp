# TICKET-024: Create Department Service + Handler

**Type**: Service/Handler
**Effort**: M
**Sprint**: 4 - Organization Structure
**Dependencies**: TICKET-023

## Description

Create the Department service with validation and HTTP handler.

## Files to Create

- `apps/api/internal/service/department.go`
- `apps/api/internal/handler/department.go`

## Implementation

### Service

```go
package service

import (
    "context"
    "errors"

    "github.com/google/uuid"

    "terp/apps/api/internal/model"
    "terp/apps/api/internal/repository"
)

var (
    ErrDepartmentNotFound      = errors.New("department not found")
    ErrDepartmentCodeExists    = errors.New("department code already exists")
    ErrCircularReference       = errors.New("circular reference detected")
    ErrCannotDeleteWithChildren = errors.New("cannot delete department with children")
)

type DepartmentService interface {
    Create(ctx context.Context, tenantID uuid.UUID, code, name string, parentID *uuid.UUID) (*model.Department, error)
    GetByID(ctx context.Context, id uuid.UUID) (*model.Department, error)
    Update(ctx context.Context, dept *model.Department) error
    Delete(ctx context.Context, id uuid.UUID) error
    List(ctx context.Context, tenantID uuid.UUID) ([]model.Department, error)
    GetHierarchy(ctx context.Context, tenantID uuid.UUID) ([]DepartmentNode, error)
}

type DepartmentNode struct {
    Department model.Department   `json:"department"`
    Children   []DepartmentNode   `json:"children,omitempty"`
}

type departmentService struct {
    repo repository.DepartmentRepository
}

func (s *departmentService) Create(ctx context.Context, tenantID uuid.UUID, code, name string, parentID *uuid.UUID) (*model.Department, error) {
    // Check code uniqueness
    existing, _ := s.repo.GetByCode(ctx, tenantID, code)
    if existing != nil {
        return nil, ErrDepartmentCodeExists
    }

    // Validate parent exists if provided
    if parentID != nil {
        parent, err := s.repo.GetByID(ctx, *parentID)
        if err != nil || parent.TenantID != tenantID {
            return nil, ErrDepartmentNotFound
        }
    }

    dept := &model.Department{
        TenantID: tenantID,
        Code:     code,
        Name:     name,
        ParentID: parentID,
        IsActive: true,
    }

    if err := s.repo.Create(ctx, dept); err != nil {
        return nil, err
    }

    return dept, nil
}

func (s *departmentService) Update(ctx context.Context, dept *model.Department) error {
    // Check for circular reference if parent changed
    if dept.ParentID != nil && *dept.ParentID == dept.ID {
        return ErrCircularReference
    }
    // TODO: Check full ancestry for circular references
    return s.repo.Update(ctx, dept)
}

func (s *departmentService) Delete(ctx context.Context, id uuid.UUID) error {
    children, _ := s.repo.GetChildren(ctx, id)
    if len(children) > 0 {
        return ErrCannotDeleteWithChildren
    }
    return s.repo.Delete(ctx, id)
}

func (s *departmentService) GetHierarchy(ctx context.Context, tenantID uuid.UUID) ([]DepartmentNode, error) {
    depts, err := s.repo.GetHierarchy(ctx, tenantID)
    if err != nil {
        return nil, err
    }
    return buildTree(depts), nil
}

func buildTree(depts []model.Department) []DepartmentNode {
    // Build tree from flat list
    nodeMap := make(map[uuid.UUID]*DepartmentNode)
    var roots []DepartmentNode

    for _, d := range depts {
        node := DepartmentNode{Department: d}
        nodeMap[d.ID] = &node
    }

    for _, d := range depts {
        node := nodeMap[d.ID]
        if d.ParentID == nil {
            roots = append(roots, *node)
        } else if parent, ok := nodeMap[*d.ParentID]; ok {
            parent.Children = append(parent.Children, *node)
        }
    }

    return roots
}
```

### Handler

```go
package handler

type DepartmentHandler struct {
    service service.DepartmentService
}

// GET /api/v1/departments - list flat or tree
// POST /api/v1/departments - create
// GET /api/v1/departments/{id} - get with children
// PUT /api/v1/departments/{id} - update
// DELETE /api/v1/departments/{id} - delete (fails if has children)
// GET /api/v1/departments/tree - get full hierarchy as tree
```

## Acceptance Criteria

- [x] `make test` passes
- [x] `make lint` passes
- [x] Cannot create department with duplicate code
- [x] Cannot set parent to self (circular reference)
- [x] Cannot delete department with children
- [x] Tree structure returns nested hierarchy
