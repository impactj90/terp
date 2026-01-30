package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrEmployeeAccessAssignmentNotFound        = errors.New("employee access assignment not found")
	ErrEmployeeAccessAssignmentEmployeeRequired = errors.New("employee ID is required")
	ErrEmployeeAccessAssignmentProfileRequired  = errors.New("access profile ID is required")
)

// employeeAccessAssignmentRepository defines the interface for employee access assignment data access.
type employeeAccessAssignmentRepository interface {
	Create(ctx context.Context, a *model.EmployeeAccessAssignment) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.EmployeeAccessAssignment, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.EmployeeAccessAssignment, error)
	Update(ctx context.Context, a *model.EmployeeAccessAssignment) error
	Delete(ctx context.Context, id uuid.UUID) error
}

type EmployeeAccessAssignmentService struct {
	repo employeeAccessAssignmentRepository
}

func NewEmployeeAccessAssignmentService(repo employeeAccessAssignmentRepository) *EmployeeAccessAssignmentService {
	return &EmployeeAccessAssignmentService{repo: repo}
}

// CreateEmployeeAccessAssignmentInput represents the input for creating an employee access assignment.
type CreateEmployeeAccessAssignmentInput struct {
	TenantID        uuid.UUID
	EmployeeID      uuid.UUID
	AccessProfileID uuid.UUID
	ValidFrom       *time.Time
	ValidTo         *time.Time
}

// Create creates a new employee access assignment with validation.
func (s *EmployeeAccessAssignmentService) Create(ctx context.Context, input CreateEmployeeAccessAssignmentInput) (*model.EmployeeAccessAssignment, error) {
	if input.EmployeeID == uuid.Nil {
		return nil, ErrEmployeeAccessAssignmentEmployeeRequired
	}
	if input.AccessProfileID == uuid.Nil {
		return nil, ErrEmployeeAccessAssignmentProfileRequired
	}

	a := &model.EmployeeAccessAssignment{
		TenantID:        input.TenantID,
		EmployeeID:      input.EmployeeID,
		AccessProfileID: input.AccessProfileID,
		ValidFrom:       input.ValidFrom,
		ValidTo:         input.ValidTo,
		IsActive:        true,
	}

	if err := s.repo.Create(ctx, a); err != nil {
		return nil, err
	}
	return a, nil
}

// GetByID retrieves an employee access assignment by ID.
func (s *EmployeeAccessAssignmentService) GetByID(ctx context.Context, id uuid.UUID) (*model.EmployeeAccessAssignment, error) {
	a, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrEmployeeAccessAssignmentNotFound
	}
	return a, nil
}

// UpdateEmployeeAccessAssignmentInput represents the input for updating an employee access assignment.
type UpdateEmployeeAccessAssignmentInput struct {
	ValidFrom *time.Time
	ValidTo   *time.Time
	IsActive  *bool
}

// Update updates an employee access assignment.
func (s *EmployeeAccessAssignmentService) Update(ctx context.Context, id uuid.UUID, input UpdateEmployeeAccessAssignmentInput) (*model.EmployeeAccessAssignment, error) {
	a, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrEmployeeAccessAssignmentNotFound
	}

	if input.ValidFrom != nil {
		a.ValidFrom = input.ValidFrom
	}
	if input.ValidTo != nil {
		a.ValidTo = input.ValidTo
	}
	if input.IsActive != nil {
		a.IsActive = *input.IsActive
	}

	if err := s.repo.Update(ctx, a); err != nil {
		return nil, err
	}
	return a, nil
}

// Delete deletes an employee access assignment by ID.
func (s *EmployeeAccessAssignmentService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrEmployeeAccessAssignmentNotFound
	}

	return s.repo.Delete(ctx, id)
}

// List retrieves all employee access assignments for a tenant.
func (s *EmployeeAccessAssignmentService) List(ctx context.Context, tenantID uuid.UUID) ([]model.EmployeeAccessAssignment, error) {
	return s.repo.List(ctx, tenantID)
}
