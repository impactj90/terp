package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrDepartmentNotFound       = errors.New("department not found")
	ErrDepartmentCodeRequired   = errors.New("department code is required")
	ErrDepartmentNameRequired   = errors.New("department name is required")
	ErrDepartmentCodeExists     = errors.New("department code already exists")
	ErrCircularReference        = errors.New("circular reference detected")
	ErrCannotDeleteWithChildren = errors.New("cannot delete department with children")
	ErrParentNotFound           = errors.New("parent department not found")
)

// departmentRepository defines the interface for department data access.
type departmentRepository interface {
	Create(ctx context.Context, dept *model.Department) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.Department, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.Department, error)
	Update(ctx context.Context, dept *model.Department) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, tenantID uuid.UUID) ([]model.Department, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.Department, error)
	GetChildren(ctx context.Context, departmentID uuid.UUID) ([]model.Department, error)
	GetHierarchy(ctx context.Context, tenantID uuid.UUID) ([]model.Department, error)
}

type DepartmentService struct {
	departmentRepo departmentRepository
}

func NewDepartmentService(departmentRepo departmentRepository) *DepartmentService {
	return &DepartmentService{departmentRepo: departmentRepo}
}

// CreateDepartmentInput represents the input for creating a department.
type CreateDepartmentInput struct {
	TenantID          uuid.UUID
	Code              string
	Name              string
	Description       string
	ParentID          *uuid.UUID
	ManagerEmployeeID *uuid.UUID
}

// Create creates a new department with validation.
func (s *DepartmentService) Create(ctx context.Context, input CreateDepartmentInput) (*model.Department, error) {
	// Validate required fields
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrDepartmentCodeRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrDepartmentNameRequired
	}

	// Check for existing department with same code for this tenant
	existing, err := s.departmentRepo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrDepartmentCodeExists
	}

	// Validate parent exists if provided
	if input.ParentID != nil {
		parent, err := s.departmentRepo.GetByID(ctx, *input.ParentID)
		if err != nil {
			return nil, ErrParentNotFound
		}
		// Ensure parent belongs to the same tenant
		if parent.TenantID != input.TenantID {
			return nil, ErrParentNotFound
		}
	}

	dept := &model.Department{
		TenantID:          input.TenantID,
		Code:              code,
		Name:              name,
		Description:       strings.TrimSpace(input.Description),
		ParentID:          input.ParentID,
		ManagerEmployeeID: input.ManagerEmployeeID,
		IsActive:          true,
	}

	if err := s.departmentRepo.Create(ctx, dept); err != nil {
		return nil, err
	}

	return dept, nil
}

// GetByID retrieves a department by ID.
func (s *DepartmentService) GetByID(ctx context.Context, id uuid.UUID) (*model.Department, error) {
	dept, err := s.departmentRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrDepartmentNotFound
	}
	return dept, nil
}

// GetByCode retrieves a department by tenant ID and code.
func (s *DepartmentService) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.Department, error) {
	dept, err := s.departmentRepo.GetByCode(ctx, tenantID, code)
	if err != nil {
		return nil, ErrDepartmentNotFound
	}
	return dept, nil
}

// UpdateDepartmentInput represents the input for updating a department.
type UpdateDepartmentInput struct {
	Code              *string
	Name              *string
	Description       *string
	ParentID          *uuid.UUID
	ManagerEmployeeID *uuid.UUID
	IsActive          *bool
	ClearParentID     bool // If true, sets ParentID to nil
}

// Update updates a department.
func (s *DepartmentService) Update(ctx context.Context, id uuid.UUID, input UpdateDepartmentInput) (*model.Department, error) {
	dept, err := s.departmentRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrDepartmentNotFound
	}

	if input.Code != nil {
		code := strings.TrimSpace(*input.Code)
		if code == "" {
			return nil, ErrDepartmentCodeRequired
		}
		// Check if the new code conflicts with another department
		if code != dept.Code {
			existing, err := s.departmentRepo.GetByCode(ctx, dept.TenantID, code)
			if err == nil && existing != nil {
				return nil, ErrDepartmentCodeExists
			}
		}
		dept.Code = code
	}
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrDepartmentNameRequired
		}
		dept.Name = name
	}
	if input.Description != nil {
		dept.Description = strings.TrimSpace(*input.Description)
	}
	if input.ManagerEmployeeID != nil {
		dept.ManagerEmployeeID = input.ManagerEmployeeID
	}
	if input.IsActive != nil {
		dept.IsActive = *input.IsActive
	}

	// Handle parent ID changes
	if input.ClearParentID {
		dept.ParentID = nil
	} else if input.ParentID != nil {
		// Check for circular reference (self-reference)
		if *input.ParentID == dept.ID {
			return nil, ErrCircularReference
		}

		// Check that parent exists and belongs to same tenant
		parent, err := s.departmentRepo.GetByID(ctx, *input.ParentID)
		if err != nil {
			return nil, ErrParentNotFound
		}
		if parent.TenantID != dept.TenantID {
			return nil, ErrParentNotFound
		}

		// Check for deeper circular references
		if err := s.checkCircularReference(ctx, dept.ID, *input.ParentID); err != nil {
			return nil, err
		}

		dept.ParentID = input.ParentID
	}

	if err := s.departmentRepo.Update(ctx, dept); err != nil {
		return nil, err
	}

	return dept, nil
}

// checkCircularReference verifies that setting parentID as the parent of deptID
// would not create a circular reference.
func (s *DepartmentService) checkCircularReference(ctx context.Context, deptID, parentID uuid.UUID) error {
	visited := make(map[uuid.UUID]bool)
	visited[deptID] = true

	current := parentID
	for {
		if visited[current] {
			return ErrCircularReference
		}
		visited[current] = true

		parent, err := s.departmentRepo.GetByID(ctx, current)
		if err != nil {
			// Parent not found means we've reached the end of the chain
			break
		}
		if parent.ParentID == nil {
			// Reached root, no circular reference
			break
		}
		current = *parent.ParentID
	}
	return nil
}

// Delete deletes a department by ID.
func (s *DepartmentService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.departmentRepo.GetByID(ctx, id)
	if err != nil {
		return ErrDepartmentNotFound
	}

	// Check for children
	children, err := s.departmentRepo.GetChildren(ctx, id)
	if err != nil {
		return err
	}
	if len(children) > 0 {
		return ErrCannotDeleteWithChildren
	}

	return s.departmentRepo.Delete(ctx, id)
}

// List retrieves all departments for a tenant.
func (s *DepartmentService) List(ctx context.Context, tenantID uuid.UUID) ([]model.Department, error) {
	return s.departmentRepo.List(ctx, tenantID)
}

// ListActive retrieves all active departments for a tenant.
func (s *DepartmentService) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.Department, error) {
	return s.departmentRepo.ListActive(ctx, tenantID)
}

// DepartmentNode represents a department in a tree structure.
type DepartmentNode struct {
	Department model.Department `json:"department"`
	Children   []DepartmentNode `json:"children,omitempty"`
}

// GetHierarchy retrieves all departments for a tenant as a tree structure.
func (s *DepartmentService) GetHierarchy(ctx context.Context, tenantID uuid.UUID) ([]DepartmentNode, error) {
	depts, err := s.departmentRepo.GetHierarchy(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	return buildTree(depts), nil
}

// buildTree converts a flat list of departments into a tree structure.
func buildTree(depts []model.Department) []DepartmentNode {
	// Build map of ID to node pointer
	nodeMap := make(map[uuid.UUID]*DepartmentNode)
	for i := range depts {
		nodeMap[depts[i].ID] = &DepartmentNode{
			Department: depts[i],
			Children:   []DepartmentNode{},
		}
	}

	// Build tree by linking children to parents
	var roots []DepartmentNode
	for _, d := range depts {
		node := nodeMap[d.ID]
		if d.ParentID == nil {
			roots = append(roots, *node)
		} else if parent, ok := nodeMap[*d.ParentID]; ok {
			parent.Children = append(parent.Children, *node)
		}
	}

	// Update roots with their children from nodeMap
	for i := range roots {
		if node, ok := nodeMap[roots[i].Department.ID]; ok {
			roots[i].Children = node.Children
		}
	}

	return roots
}
