package service

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrOrderAssignmentNotFound = errors.New("order assignment not found")
	ErrOrderAssignmentExists   = errors.New("order assignment already exists for this employee, order, and role")
)

// orderAssignmentRepository defines the interface for order assignment data access.
type orderAssignmentRepository interface {
	Create(ctx context.Context, a *model.OrderAssignment) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.OrderAssignment, error)
	Update(ctx context.Context, a *model.OrderAssignment) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, tenantID uuid.UUID) ([]model.OrderAssignment, error)
	ListByOrder(ctx context.Context, orderID uuid.UUID) ([]model.OrderAssignment, error)
	ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.OrderAssignment, error)
}

// OrderAssignmentService provides business logic for order assignments.
type OrderAssignmentService struct {
	assignmentRepo orderAssignmentRepository
}

// NewOrderAssignmentService creates a new OrderAssignmentService.
func NewOrderAssignmentService(assignmentRepo orderAssignmentRepository) *OrderAssignmentService {
	return &OrderAssignmentService{assignmentRepo: assignmentRepo}
}

// CreateOrderAssignmentInput represents the input for creating an order assignment.
type CreateOrderAssignmentInput struct {
	TenantID   uuid.UUID
	OrderID    uuid.UUID
	EmployeeID uuid.UUID
	Role       string
	ValidFrom  *string
	ValidTo    *string
}

// Create creates a new order assignment with validation.
func (s *OrderAssignmentService) Create(ctx context.Context, input CreateOrderAssignmentInput) (*model.OrderAssignment, error) {
	role := model.OrderAssignmentRoleWorker
	if input.Role != "" {
		role = model.OrderAssignmentRole(input.Role)
	}

	a := &model.OrderAssignment{
		TenantID:   input.TenantID,
		OrderID:    input.OrderID,
		EmployeeID: input.EmployeeID,
		Role:       role,
		IsActive:   true,
	}

	if input.ValidFrom != nil {
		t, err := parseDate(*input.ValidFrom)
		if err == nil {
			a.ValidFrom = &t
		}
	}
	if input.ValidTo != nil {
		t, err := parseDate(*input.ValidTo)
		if err == nil {
			a.ValidTo = &t
		}
	}

	if err := s.assignmentRepo.Create(ctx, a); err != nil {
		return nil, err
	}

	return s.assignmentRepo.GetByID(ctx, a.ID)
}

// GetByID retrieves an order assignment by ID.
func (s *OrderAssignmentService) GetByID(ctx context.Context, id uuid.UUID) (*model.OrderAssignment, error) {
	a, err := s.assignmentRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrOrderAssignmentNotFound
	}
	return a, nil
}

// UpdateOrderAssignmentInput represents the input for updating an order assignment.
type UpdateOrderAssignmentInput struct {
	Role      *string
	ValidFrom *string
	ValidTo   *string
	IsActive  *bool
}

// Update updates an order assignment.
func (s *OrderAssignmentService) Update(ctx context.Context, id uuid.UUID, input UpdateOrderAssignmentInput) (*model.OrderAssignment, error) {
	a, err := s.assignmentRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrOrderAssignmentNotFound
	}

	if input.Role != nil {
		a.Role = model.OrderAssignmentRole(*input.Role)
	}
	if input.ValidFrom != nil {
		t, err := parseDate(*input.ValidFrom)
		if err == nil {
			a.ValidFrom = &t
		}
	}
	if input.ValidTo != nil {
		t, err := parseDate(*input.ValidTo)
		if err == nil {
			a.ValidTo = &t
		}
	}
	if input.IsActive != nil {
		a.IsActive = *input.IsActive
	}

	if err := s.assignmentRepo.Update(ctx, a); err != nil {
		return nil, err
	}

	return s.assignmentRepo.GetByID(ctx, a.ID)
}

// Delete deletes an order assignment by ID.
func (s *OrderAssignmentService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.assignmentRepo.GetByID(ctx, id)
	if err != nil {
		return ErrOrderAssignmentNotFound
	}
	return s.assignmentRepo.Delete(ctx, id)
}

// List retrieves all order assignments for a tenant.
func (s *OrderAssignmentService) List(ctx context.Context, tenantID uuid.UUID) ([]model.OrderAssignment, error) {
	return s.assignmentRepo.List(ctx, tenantID)
}

// ListByOrder retrieves all order assignments for a specific order.
func (s *OrderAssignmentService) ListByOrder(ctx context.Context, orderID uuid.UUID) ([]model.OrderAssignment, error) {
	return s.assignmentRepo.ListByOrder(ctx, orderID)
}

// ListByEmployee retrieves all order assignments for a specific employee.
func (s *OrderAssignmentService) ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.OrderAssignment, error) {
	return s.assignmentRepo.ListByEmployee(ctx, employeeID)
}
