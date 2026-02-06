package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrEmploymentTypeNotFound     = errors.New("employment type not found")
	ErrEmploymentTypeCodeRequired = errors.New("employment type code is required")
	ErrEmploymentTypeNameRequired = errors.New("employment type name is required")
	ErrEmploymentTypeCodeExists   = errors.New("employment type code already exists")
)

// employmentTypeRepository defines the interface for employment type data access.
type employmentTypeRepository interface {
	Create(ctx context.Context, et *model.EmploymentType) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.EmploymentType, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.EmploymentType, error)
	Update(ctx context.Context, et *model.EmploymentType) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, tenantID uuid.UUID) ([]model.EmploymentType, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.EmploymentType, error)
}

type EmploymentTypeService struct {
	employmentTypeRepo employmentTypeRepository
}

func NewEmploymentTypeService(employmentTypeRepo employmentTypeRepository) *EmploymentTypeService {
	return &EmploymentTypeService{employmentTypeRepo: employmentTypeRepo}
}

// CreateEmploymentTypeInput represents the input for creating an employment type.
type CreateEmploymentTypeInput struct {
	TenantID            uuid.UUID
	Code                string
	Name                string
	DefaultWeeklyHours  decimal.Decimal
	IsActive            bool
	VacationCalcGroupID *uuid.UUID
}

// Create creates a new employment type with validation.
func (s *EmploymentTypeService) Create(ctx context.Context, input CreateEmploymentTypeInput) (*model.EmploymentType, error) {
	// Validate required fields
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrEmploymentTypeCodeRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrEmploymentTypeNameRequired
	}

	// Check for existing employment type with same code for this tenant
	existing, err := s.employmentTypeRepo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrEmploymentTypeCodeExists
	}

	et := &model.EmploymentType{
		TenantID:            input.TenantID,
		Code:                code,
		Name:                name,
		DefaultWeeklyHours:  input.DefaultWeeklyHours,
		IsActive:            input.IsActive,
		VacationCalcGroupID: input.VacationCalcGroupID,
	}

	if err := s.employmentTypeRepo.Create(ctx, et); err != nil {
		return nil, err
	}

	return et, nil
}

// GetByID retrieves an employment type by ID.
func (s *EmploymentTypeService) GetByID(ctx context.Context, id uuid.UUID) (*model.EmploymentType, error) {
	et, err := s.employmentTypeRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrEmploymentTypeNotFound
	}
	return et, nil
}

// GetByCode retrieves an employment type by tenant ID and code.
func (s *EmploymentTypeService) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.EmploymentType, error) {
	et, err := s.employmentTypeRepo.GetByCode(ctx, tenantID, code)
	if err != nil {
		return nil, ErrEmploymentTypeNotFound
	}
	return et, nil
}

// UpdateEmploymentTypeInput represents the input for updating an employment type.
type UpdateEmploymentTypeInput struct {
	Code                     *string
	Name                     *string
	DefaultWeeklyHours       *decimal.Decimal
	IsActive                 *bool
	VacationCalcGroupID      *uuid.UUID
	ClearVacationCalcGroupID bool
}

// Update updates an employment type.
func (s *EmploymentTypeService) Update(ctx context.Context, id uuid.UUID, input UpdateEmploymentTypeInput) (*model.EmploymentType, error) {
	et, err := s.employmentTypeRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrEmploymentTypeNotFound
	}

	if input.Code != nil {
		code := strings.TrimSpace(*input.Code)
		if code == "" {
			return nil, ErrEmploymentTypeCodeRequired
		}
		// Check if the new code conflicts with another employment type
		if code != et.Code {
			existing, err := s.employmentTypeRepo.GetByCode(ctx, et.TenantID, code)
			if err == nil && existing != nil {
				return nil, ErrEmploymentTypeCodeExists
			}
		}
		et.Code = code
	}
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrEmploymentTypeNameRequired
		}
		et.Name = name
	}
	if input.DefaultWeeklyHours != nil {
		et.DefaultWeeklyHours = *input.DefaultWeeklyHours
	}
	if input.IsActive != nil {
		et.IsActive = *input.IsActive
	}
	if input.ClearVacationCalcGroupID {
		et.VacationCalcGroupID = nil
	} else if input.VacationCalcGroupID != nil {
		et.VacationCalcGroupID = input.VacationCalcGroupID
	}

	if err := s.employmentTypeRepo.Update(ctx, et); err != nil {
		return nil, err
	}

	return et, nil
}

// Delete deletes an employment type by ID.
func (s *EmploymentTypeService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.employmentTypeRepo.GetByID(ctx, id)
	if err != nil {
		return ErrEmploymentTypeNotFound
	}
	return s.employmentTypeRepo.Delete(ctx, id)
}

// List retrieves all employment types for a tenant.
func (s *EmploymentTypeService) List(ctx context.Context, tenantID uuid.UUID) ([]model.EmploymentType, error) {
	return s.employmentTypeRepo.List(ctx, tenantID)
}

// ListActive retrieves all active employment types for a tenant.
func (s *EmploymentTypeService) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.EmploymentType, error) {
	return s.employmentTypeRepo.ListActive(ctx, tenantID)
}
