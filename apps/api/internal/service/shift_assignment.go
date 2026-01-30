package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrShiftAssignmentNotFound          = errors.New("shift assignment not found")
	ErrShiftAssignmentEmployeeRequired  = errors.New("employee ID is required")
	ErrShiftAssignmentShiftRequired     = errors.New("shift ID is required")
	ErrShiftAssignmentDateRangeInvalid  = errors.New("valid_from must be before or equal to valid_to")
)

// shiftAssignmentRepository defines the interface for shift assignment data access.
type shiftAssignmentRepository interface {
	Create(ctx context.Context, a *model.ShiftAssignment) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.ShiftAssignment, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.ShiftAssignment, error)
	Update(ctx context.Context, a *model.ShiftAssignment) error
	Delete(ctx context.Context, id uuid.UUID) error
}

type ShiftAssignmentService struct {
	repo shiftAssignmentRepository
}

func NewShiftAssignmentService(repo shiftAssignmentRepository) *ShiftAssignmentService {
	return &ShiftAssignmentService{repo: repo}
}

// CreateShiftAssignmentInput represents the input for creating a shift assignment.
type CreateShiftAssignmentInput struct {
	TenantID   uuid.UUID
	EmployeeID uuid.UUID
	ShiftID    uuid.UUID
	ValidFrom  *time.Time
	ValidTo    *time.Time
	Notes      string
}

// Create creates a new shift assignment with validation.
func (s *ShiftAssignmentService) Create(ctx context.Context, input CreateShiftAssignmentInput) (*model.ShiftAssignment, error) {
	if input.EmployeeID == uuid.Nil {
		return nil, ErrShiftAssignmentEmployeeRequired
	}
	if input.ShiftID == uuid.Nil {
		return nil, ErrShiftAssignmentShiftRequired
	}

	// Validate date range if both provided
	if input.ValidFrom != nil && input.ValidTo != nil {
		if input.ValidFrom.After(*input.ValidTo) {
			return nil, ErrShiftAssignmentDateRangeInvalid
		}
	}

	a := &model.ShiftAssignment{
		TenantID:   input.TenantID,
		EmployeeID: input.EmployeeID,
		ShiftID:    input.ShiftID,
		ValidFrom:  input.ValidFrom,
		ValidTo:    input.ValidTo,
		Notes:      strings.TrimSpace(input.Notes),
		IsActive:   true,
	}

	if err := s.repo.Create(ctx, a); err != nil {
		return nil, err
	}
	return a, nil
}

// GetByID retrieves a shift assignment by ID.
func (s *ShiftAssignmentService) GetByID(ctx context.Context, id uuid.UUID) (*model.ShiftAssignment, error) {
	a, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrShiftAssignmentNotFound
	}
	return a, nil
}

// UpdateShiftAssignmentInput represents the input for updating a shift assignment.
type UpdateShiftAssignmentInput struct {
	ValidFrom *time.Time
	ValidTo   *time.Time
	Notes     *string
	IsActive  *bool
}

// Update updates a shift assignment.
func (s *ShiftAssignmentService) Update(ctx context.Context, id uuid.UUID, input UpdateShiftAssignmentInput) (*model.ShiftAssignment, error) {
	a, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrShiftAssignmentNotFound
	}

	if input.ValidFrom != nil {
		a.ValidFrom = input.ValidFrom
	}
	if input.ValidTo != nil {
		a.ValidTo = input.ValidTo
	}
	if input.Notes != nil {
		a.Notes = strings.TrimSpace(*input.Notes)
	}
	if input.IsActive != nil {
		a.IsActive = *input.IsActive
	}

	// Re-validate date range after update
	if a.ValidFrom != nil && a.ValidTo != nil {
		if a.ValidFrom.After(*a.ValidTo) {
			return nil, ErrShiftAssignmentDateRangeInvalid
		}
	}

	if err := s.repo.Update(ctx, a); err != nil {
		return nil, err
	}
	return a, nil
}

// Delete deletes a shift assignment by ID.
func (s *ShiftAssignmentService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrShiftAssignmentNotFound
	}

	return s.repo.Delete(ctx, id)
}

// List retrieves all shift assignments for a tenant.
func (s *ShiftAssignmentService) List(ctx context.Context, tenantID uuid.UUID) ([]model.ShiftAssignment, error) {
	return s.repo.List(ctx, tenantID)
}
