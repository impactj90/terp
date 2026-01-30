package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

// Sentinel errors for employee tariff assignment operations.
var (
	ErrAssignmentNotFound         = errors.New("tariff assignment not found")
	ErrAssignmentOverlap          = errors.New("overlapping tariff assignment exists for this date range")
	ErrAssignmentInvalidDates     = errors.New("effective_to must be on or after effective_from")
	ErrAssignmentEmployeeNotFound = errors.New("employee not found")
	ErrAssignmentTariffNotFound   = errors.New("tariff not found")
	ErrAssignmentTariffRequired   = errors.New("tariff_id is required")
	ErrAssignmentDateRequired     = errors.New("effective_from is required")
)

// employeeTariffAssignmentRepository defines the interface for assignment data access.
type employeeTariffAssignmentRepository interface {
	Create(ctx context.Context, assignment *model.EmployeeTariffAssignment) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.EmployeeTariffAssignment, error)
	Update(ctx context.Context, assignment *model.EmployeeTariffAssignment) error
	Delete(ctx context.Context, id uuid.UUID) error
	ListByEmployee(ctx context.Context, employeeID uuid.UUID, activeOnly bool) ([]model.EmployeeTariffAssignment, error)
	GetEffectiveForDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.EmployeeTariffAssignment, error)
	HasOverlap(ctx context.Context, employeeID uuid.UUID, from time.Time, to *time.Time, excludeID *uuid.UUID) (bool, error)
}

// employeeRepositoryForAssignment defines the interface for employee lookup.
type employeeRepositoryForAssignment interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error)
}

// tariffRepositoryForAssignment defines the interface for tariff lookup.
type tariffRepositoryForAssignment interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.Tariff, error)
	GetWithDetails(ctx context.Context, id uuid.UUID) (*model.Tariff, error)
}

// EmployeeTariffAssignmentService handles business logic for tariff assignments.
type EmployeeTariffAssignmentService struct {
	assignmentRepo employeeTariffAssignmentRepository
	employeeRepo   employeeRepositoryForAssignment
	tariffRepo     tariffRepositoryForAssignment
}

// NewEmployeeTariffAssignmentService creates a new employee tariff assignment service.
func NewEmployeeTariffAssignmentService(
	assignmentRepo employeeTariffAssignmentRepository,
	employeeRepo employeeRepositoryForAssignment,
	tariffRepo tariffRepositoryForAssignment,
) *EmployeeTariffAssignmentService {
	return &EmployeeTariffAssignmentService{
		assignmentRepo: assignmentRepo,
		employeeRepo:   employeeRepo,
		tariffRepo:     tariffRepo,
	}
}

// CreateEmployeeTariffAssignmentInput represents the input for creating a tariff assignment.
type CreateEmployeeTariffAssignmentInput struct {
	TenantID          uuid.UUID
	EmployeeID        uuid.UUID
	TariffID          uuid.UUID
	EffectiveFrom     time.Time
	EffectiveTo       *time.Time
	OverwriteBehavior model.OverwriteBehavior
	Notes             string
}

// UpdateEmployeeTariffAssignmentInput represents the input for updating a tariff assignment.
type UpdateEmployeeTariffAssignmentInput struct {
	EffectiveFrom     *time.Time
	EffectiveTo       *time.Time
	ClearEffectiveTo  bool
	OverwriteBehavior *model.OverwriteBehavior
	Notes             *string
	IsActive          *bool
}

// EffectiveTariffResult represents the resolved effective tariff for an employee at a date.
type EffectiveTariffResult struct {
	EmployeeID uuid.UUID                       `json:"employee_id"`
	Date       time.Time                       `json:"date"`
	Source     string                          `json:"source"` // "assignment", "default", "none"
	Tariff     *model.Tariff                   `json:"tariff,omitempty"`
	Assignment *model.EmployeeTariffAssignment `json:"assignment,omitempty"`
}

// Create creates a new tariff assignment with validation.
func (s *EmployeeTariffAssignmentService) Create(ctx context.Context, input CreateEmployeeTariffAssignmentInput) (*model.EmployeeTariffAssignment, error) {
	// Validate required fields
	if input.TariffID == uuid.Nil {
		return nil, ErrAssignmentTariffRequired
	}
	if input.EffectiveFrom.IsZero() {
		return nil, ErrAssignmentDateRequired
	}

	// Validate date range
	if input.EffectiveTo != nil && input.EffectiveTo.Before(input.EffectiveFrom) {
		return nil, ErrAssignmentInvalidDates
	}

	// Verify employee exists
	_, err := s.employeeRepo.GetByID(ctx, input.EmployeeID)
	if err != nil {
		return nil, ErrAssignmentEmployeeNotFound
	}

	// Verify tariff exists
	_, err = s.tariffRepo.GetByID(ctx, input.TariffID)
	if err != nil {
		return nil, ErrAssignmentTariffNotFound
	}

	// Check for overlapping assignments
	hasOverlap, err := s.assignmentRepo.HasOverlap(ctx, input.EmployeeID, input.EffectiveFrom, input.EffectiveTo, nil)
	if err != nil {
		return nil, err
	}
	if hasOverlap {
		return nil, ErrAssignmentOverlap
	}

	// Default overwrite behavior
	overwriteBehavior := input.OverwriteBehavior
	if overwriteBehavior == "" {
		overwriteBehavior = model.OverwriteBehaviorPreserveManual
	}

	assignment := &model.EmployeeTariffAssignment{
		TenantID:          input.TenantID,
		EmployeeID:        input.EmployeeID,
		TariffID:          input.TariffID,
		EffectiveFrom:     input.EffectiveFrom,
		EffectiveTo:       input.EffectiveTo,
		OverwriteBehavior: overwriteBehavior,
		Notes:             input.Notes,
		IsActive:          true,
	}

	if err := s.assignmentRepo.Create(ctx, assignment); err != nil {
		return nil, err
	}

	// Re-fetch with preloaded relations
	return s.assignmentRepo.GetByID(ctx, assignment.ID)
}

// GetByID retrieves a tariff assignment by ID.
func (s *EmployeeTariffAssignmentService) GetByID(ctx context.Context, id uuid.UUID) (*model.EmployeeTariffAssignment, error) {
	assignment, err := s.assignmentRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrAssignmentNotFound
	}
	return assignment, nil
}

// Update updates a tariff assignment.
func (s *EmployeeTariffAssignmentService) Update(ctx context.Context, assignmentID uuid.UUID, tenantID uuid.UUID, input UpdateEmployeeTariffAssignmentInput) (*model.EmployeeTariffAssignment, error) {
	// Fetch existing assignment
	assignment, err := s.assignmentRepo.GetByID(ctx, assignmentID)
	if err != nil {
		return nil, ErrAssignmentNotFound
	}

	// Verify tenant matches
	if assignment.TenantID != tenantID {
		return nil, ErrAssignmentNotFound
	}

	// Apply partial updates
	datesChanged := false

	if input.EffectiveFrom != nil {
		assignment.EffectiveFrom = *input.EffectiveFrom
		datesChanged = true
	}

	if input.ClearEffectiveTo {
		assignment.EffectiveTo = nil
		datesChanged = true
	} else if input.EffectiveTo != nil {
		assignment.EffectiveTo = input.EffectiveTo
		datesChanged = true
	}

	if input.OverwriteBehavior != nil {
		assignment.OverwriteBehavior = *input.OverwriteBehavior
	}

	if input.Notes != nil {
		assignment.Notes = *input.Notes
	}

	if input.IsActive != nil {
		assignment.IsActive = *input.IsActive
	}

	// Validate dates if changed
	if assignment.EffectiveTo != nil && assignment.EffectiveTo.Before(assignment.EffectiveFrom) {
		return nil, ErrAssignmentInvalidDates
	}

	// Check for overlapping assignments if dates changed
	if datesChanged {
		hasOverlap, err := s.assignmentRepo.HasOverlap(ctx, assignment.EmployeeID, assignment.EffectiveFrom, assignment.EffectiveTo, &assignmentID)
		if err != nil {
			return nil, err
		}
		if hasOverlap {
			return nil, ErrAssignmentOverlap
		}
	}

	if err := s.assignmentRepo.Update(ctx, assignment); err != nil {
		return nil, err
	}

	// Re-fetch with preloaded relations
	return s.assignmentRepo.GetByID(ctx, assignment.ID)
}

// Delete deletes a tariff assignment.
func (s *EmployeeTariffAssignmentService) Delete(ctx context.Context, id uuid.UUID) error {
	// Verify assignment exists
	_, err := s.assignmentRepo.GetByID(ctx, id)
	if err != nil {
		return ErrAssignmentNotFound
	}
	return s.assignmentRepo.Delete(ctx, id)
}

// ListByEmployee retrieves all tariff assignments for an employee.
func (s *EmployeeTariffAssignmentService) ListByEmployee(ctx context.Context, employeeID uuid.UUID, activeOnly bool) ([]model.EmployeeTariffAssignment, error) {
	return s.assignmentRepo.ListByEmployee(ctx, employeeID, activeOnly)
}

// GetEffectiveTariff resolves which tariff applies to an employee at a given date.
// Resolution order: (1) active assignment covering the date, (2) employee default tariff_id, (3) none.
func (s *EmployeeTariffAssignmentService) GetEffectiveTariff(ctx context.Context, employeeID uuid.UUID, date time.Time) (*EffectiveTariffResult, error) {
	result := &EffectiveTariffResult{
		EmployeeID: employeeID,
		Date:       date,
	}

	// Step 1: Try to find an active assignment covering the date
	assignment, err := s.assignmentRepo.GetEffectiveForDate(ctx, employeeID, date)
	if err != nil {
		return nil, err
	}
	if assignment != nil {
		result.Source = "assignment"
		result.Tariff = assignment.Tariff
		result.Assignment = assignment
		return result, nil
	}

	// Step 2: Fall back to employee's default tariff_id
	employee, err := s.employeeRepo.GetByID(ctx, employeeID)
	if err != nil {
		return nil, ErrAssignmentEmployeeNotFound
	}

	if employee.TariffID != nil {
		tariff, err := s.tariffRepo.GetWithDetails(ctx, *employee.TariffID)
		if err != nil {
			return nil, err
		}
		result.Source = "default"
		result.Tariff = tariff
		return result, nil
	}

	// Step 3: No tariff
	result.Source = "none"
	return result, nil
}
