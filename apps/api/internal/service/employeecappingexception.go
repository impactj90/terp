package service

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

var (
	ErrEmployeeCappingExceptionNotFound   = errors.New("employee capping exception not found")
	ErrEmployeeCappingExceptionDuplicate  = errors.New("exception already exists for this employee/rule/year combination")
	ErrEmployeeCappingExceptionTypeReq    = errors.New("exemption type is required")
	ErrEmployeeCappingExceptionTypeInv    = errors.New("exemption type must be full or partial")
	ErrEmployeeCappingExceptionRetainReq  = errors.New("retain_days is required for partial exemptions")
	ErrEmployeeCappingExceptionRetainNeg  = errors.New("retain_days must not be negative")
	ErrEmployeeCappingExceptionEmployeeReq = errors.New("employee_id is required")
	ErrEmployeeCappingExceptionRuleReq    = errors.New("capping_rule_id is required")
)

// employeeCappingExceptionRepository defines the interface.
type employeeCappingExceptionRepository interface {
	Create(ctx context.Context, exc *model.EmployeeCappingException) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.EmployeeCappingException, error)
	List(ctx context.Context, tenantID uuid.UUID, filters repository.EmployeeCappingExceptionFilters) ([]model.EmployeeCappingException, error)
	ListActiveByEmployee(ctx context.Context, employeeID uuid.UUID, year *int) ([]model.EmployeeCappingException, error)
	ExistsByEmployeeRuleYear(ctx context.Context, employeeID, cappingRuleID uuid.UUID, year *int) (bool, error)
	Update(ctx context.Context, exc *model.EmployeeCappingException) error
	Delete(ctx context.Context, id uuid.UUID) error
}

// CreateEmployeeCappingExceptionInput represents the input for creating a capping exception.
type CreateEmployeeCappingExceptionInput struct {
	TenantID      uuid.UUID
	EmployeeID    uuid.UUID
	CappingRuleID uuid.UUID
	ExemptionType string
	RetainDays    *float64
	Year          *int
	Notes         *string
}

// UpdateEmployeeCappingExceptionInput represents the input for updating a capping exception.
type UpdateEmployeeCappingExceptionInput struct {
	ExemptionType *string
	RetainDays    *float64
	Year          *int
	Notes         *string
	IsActive      *bool
}

// EmployeeCappingExceptionService handles business logic for employee capping exceptions.
type EmployeeCappingExceptionService struct {
	repo        employeeCappingExceptionRepository
	cappingRepo vacationCappingRuleRepository
}

// NewEmployeeCappingExceptionService creates a new EmployeeCappingExceptionService.
func NewEmployeeCappingExceptionService(repo employeeCappingExceptionRepository, cappingRepo vacationCappingRuleRepository) *EmployeeCappingExceptionService {
	return &EmployeeCappingExceptionService{repo: repo, cappingRepo: cappingRepo}
}

// Create creates a new employee capping exception.
func (s *EmployeeCappingExceptionService) Create(ctx context.Context, input CreateEmployeeCappingExceptionInput) (*model.EmployeeCappingException, error) {
	if input.EmployeeID == uuid.Nil {
		return nil, ErrEmployeeCappingExceptionEmployeeReq
	}
	if input.CappingRuleID == uuid.Nil {
		return nil, ErrEmployeeCappingExceptionRuleReq
	}

	exemptionType := input.ExemptionType
	if exemptionType == "" {
		return nil, ErrEmployeeCappingExceptionTypeReq
	}
	if exemptionType != string(model.ExemptionTypeFull) && exemptionType != string(model.ExemptionTypePartial) {
		return nil, ErrEmployeeCappingExceptionTypeInv
	}

	// Validate retain_days for partial exemptions
	if exemptionType == string(model.ExemptionTypePartial) {
		if input.RetainDays == nil {
			return nil, ErrEmployeeCappingExceptionRetainReq
		}
		if *input.RetainDays < 0 {
			return nil, ErrEmployeeCappingExceptionRetainNeg
		}
	}

	// Validate capping rule exists
	_, err := s.cappingRepo.GetByID(ctx, input.CappingRuleID)
	if err != nil {
		return nil, ErrVacationCappingRuleNotFound
	}

	// Check uniqueness
	exists, err := s.repo.ExistsByEmployeeRuleYear(ctx, input.EmployeeID, input.CappingRuleID, input.Year)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ErrEmployeeCappingExceptionDuplicate
	}

	exc := &model.EmployeeCappingException{
		TenantID:      input.TenantID,
		EmployeeID:    input.EmployeeID,
		CappingRuleID: input.CappingRuleID,
		ExemptionType: model.ExemptionType(exemptionType),
		Year:          input.Year,
		Notes:         input.Notes,
		IsActive:      true,
	}

	if input.RetainDays != nil {
		rd := decimal.NewFromFloat(*input.RetainDays)
		exc.RetainDays = &rd
	}

	if err := s.repo.Create(ctx, exc); err != nil {
		return nil, err
	}

	return exc, nil
}

// GetByID retrieves an employee capping exception by ID.
func (s *EmployeeCappingExceptionService) GetByID(ctx context.Context, id uuid.UUID) (*model.EmployeeCappingException, error) {
	exc, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrEmployeeCappingExceptionNotFound
	}
	return exc, nil
}

// List retrieves exceptions for a tenant with optional filters.
func (s *EmployeeCappingExceptionService) List(ctx context.Context, tenantID uuid.UUID, filters repository.EmployeeCappingExceptionFilters) ([]model.EmployeeCappingException, error) {
	return s.repo.List(ctx, tenantID, filters)
}

// Update updates an employee capping exception.
func (s *EmployeeCappingExceptionService) Update(ctx context.Context, id uuid.UUID, input UpdateEmployeeCappingExceptionInput) (*model.EmployeeCappingException, error) {
	exc, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrEmployeeCappingExceptionNotFound
	}

	if input.ExemptionType != nil {
		et := *input.ExemptionType
		if et != string(model.ExemptionTypeFull) && et != string(model.ExemptionTypePartial) {
			return nil, ErrEmployeeCappingExceptionTypeInv
		}
		exc.ExemptionType = model.ExemptionType(et)
	}

	if input.RetainDays != nil {
		if *input.RetainDays < 0 {
			return nil, ErrEmployeeCappingExceptionRetainNeg
		}
		rd := decimal.NewFromFloat(*input.RetainDays)
		exc.RetainDays = &rd
	}

	// Validate retain_days for partial exemptions after all updates
	if exc.ExemptionType == model.ExemptionTypePartial && exc.RetainDays == nil {
		return nil, ErrEmployeeCappingExceptionRetainReq
	}

	if input.Year != nil {
		exc.Year = input.Year
	}

	if input.Notes != nil {
		exc.Notes = input.Notes
	}

	if input.IsActive != nil {
		exc.IsActive = *input.IsActive
	}

	if err := s.repo.Update(ctx, exc); err != nil {
		return nil, err
	}

	return exc, nil
}

// Delete deletes an employee capping exception.
func (s *EmployeeCappingExceptionService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrEmployeeCappingExceptionNotFound
	}

	return s.repo.Delete(ctx, id)
}
