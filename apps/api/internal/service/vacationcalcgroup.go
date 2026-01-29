package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrVacationCalcGroupNotFound     = errors.New("vacation calculation group not found")
	ErrVacationCalcGroupCodeRequired = errors.New("vacation calculation group code is required")
	ErrVacationCalcGroupNameRequired = errors.New("vacation calculation group name is required")
	ErrVacationCalcGroupCodeExists   = errors.New("vacation calculation group code already exists")
	ErrVacationCalcGroupInUse        = errors.New("vacation calculation group is assigned to employment types")
	ErrVacationCalcGroupInvalidBasis = errors.New("basis must be calendar_year or entry_date")
	ErrSpecialCalcNotFound           = errors.New("one or more special calculation IDs not found")
)

// vacationCalcGroupRepository defines the interface for vacation calc group data access.
type vacationCalcGroupRepository interface {
	Create(ctx context.Context, group *model.VacationCalculationGroup) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.VacationCalculationGroup, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.VacationCalculationGroup, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCalculationGroup, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCalculationGroup, error)
	Update(ctx context.Context, group *model.VacationCalculationGroup) error
	Delete(ctx context.Context, id uuid.UUID) error
	CountEmploymentTypeUsages(ctx context.Context, groupID uuid.UUID) (int64, error)
	ReplaceSpecialCalculations(ctx context.Context, groupID uuid.UUID, specialCalcIDs []uuid.UUID) error
}

// CreateVacationCalcGroupInput represents the input for creating a calculation group.
type CreateVacationCalcGroupInput struct {
	TenantID              uuid.UUID
	Code                  string
	Name                  string
	Description           *string
	Basis                 string // "calendar_year" or "entry_date"
	SpecialCalculationIDs []uuid.UUID
}

// UpdateVacationCalcGroupInput represents the input for updating a calculation group.
type UpdateVacationCalcGroupInput struct {
	Name                  *string
	Description           *string
	Basis                 *string
	IsActive              *bool
	SpecialCalculationIDs *[]uuid.UUID // nil = don't change, non-nil = replace
}

// VacationCalcGroupService handles business logic for vacation calculation groups.
type VacationCalcGroupService struct {
	groupRepo       vacationCalcGroupRepository
	specialCalcRepo vacationSpecialCalcRepository
}

// NewVacationCalcGroupService creates a new VacationCalcGroupService.
func NewVacationCalcGroupService(
	groupRepo vacationCalcGroupRepository,
	specialCalcRepo vacationSpecialCalcRepository,
) *VacationCalcGroupService {
	return &VacationCalcGroupService{
		groupRepo:       groupRepo,
		specialCalcRepo: specialCalcRepo,
	}
}

func isValidBasis(basis string) bool {
	return basis == string(model.VacationBasisCalendarYear) || basis == string(model.VacationBasisEntryDate)
}

// Create creates a new vacation calculation group.
func (s *VacationCalcGroupService) Create(ctx context.Context, input CreateVacationCalcGroupInput) (*model.VacationCalculationGroup, error) {
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrVacationCalcGroupCodeRequired
	}

	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrVacationCalcGroupNameRequired
	}

	basis := input.Basis
	if basis == "" {
		basis = string(model.VacationBasisCalendarYear)
	}
	if !isValidBasis(basis) {
		return nil, ErrVacationCalcGroupInvalidBasis
	}

	// Check code uniqueness
	existing, err := s.groupRepo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrVacationCalcGroupCodeExists
	}

	// Validate special calculation IDs exist
	if len(input.SpecialCalculationIDs) > 0 {
		found, err := s.specialCalcRepo.ListByIDs(ctx, input.SpecialCalculationIDs)
		if err != nil {
			return nil, err
		}
		if len(found) != len(input.SpecialCalculationIDs) {
			return nil, ErrSpecialCalcNotFound
		}
	}

	group := &model.VacationCalculationGroup{
		TenantID:    input.TenantID,
		Code:        code,
		Name:        name,
		Description: input.Description,
		Basis:       model.VacationBasis(basis),
		IsActive:    true,
	}

	if err := s.groupRepo.Create(ctx, group); err != nil {
		return nil, err
	}

	// Link special calculations
	if len(input.SpecialCalculationIDs) > 0 {
		if err := s.groupRepo.ReplaceSpecialCalculations(ctx, group.ID, input.SpecialCalculationIDs); err != nil {
			return nil, err
		}
	}

	// Reload with preloaded relations
	return s.groupRepo.GetByID(ctx, group.ID)
}

// GetByID retrieves a vacation calculation group by ID.
func (s *VacationCalcGroupService) GetByID(ctx context.Context, id uuid.UUID) (*model.VacationCalculationGroup, error) {
	group, err := s.groupRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrVacationCalcGroupNotFound
	}
	return group, nil
}

// List retrieves all calculation groups for a tenant.
func (s *VacationCalcGroupService) List(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCalculationGroup, error) {
	return s.groupRepo.List(ctx, tenantID)
}

// ListActive retrieves only active calculation groups for a tenant.
func (s *VacationCalcGroupService) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCalculationGroup, error) {
	return s.groupRepo.ListActive(ctx, tenantID)
}

// Update updates a vacation calculation group.
func (s *VacationCalcGroupService) Update(ctx context.Context, id uuid.UUID, input UpdateVacationCalcGroupInput) (*model.VacationCalculationGroup, error) {
	group, err := s.groupRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrVacationCalcGroupNotFound
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrVacationCalcGroupNameRequired
		}
		group.Name = name
	}

	if input.Description != nil {
		group.Description = input.Description
	}

	if input.Basis != nil {
		if !isValidBasis(*input.Basis) {
			return nil, ErrVacationCalcGroupInvalidBasis
		}
		group.Basis = model.VacationBasis(*input.Basis)
	}

	if input.IsActive != nil {
		group.IsActive = *input.IsActive
	}

	// Replace special calculation links if provided
	if input.SpecialCalculationIDs != nil {
		ids := *input.SpecialCalculationIDs
		if len(ids) > 0 {
			found, err := s.specialCalcRepo.ListByIDs(ctx, ids)
			if err != nil {
				return nil, err
			}
			if len(found) != len(ids) {
				return nil, ErrSpecialCalcNotFound
			}
		}
		if err := s.groupRepo.ReplaceSpecialCalculations(ctx, group.ID, ids); err != nil {
			return nil, err
		}
	}

	if err := s.groupRepo.Update(ctx, group); err != nil {
		return nil, err
	}

	// Reload with preloaded relations
	return s.groupRepo.GetByID(ctx, group.ID)
}

// Delete deletes a vacation calculation group.
// Returns ErrVacationCalcGroupInUse if still assigned to employment types.
func (s *VacationCalcGroupService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.groupRepo.GetByID(ctx, id)
	if err != nil {
		return ErrVacationCalcGroupNotFound
	}

	count, err := s.groupRepo.CountEmploymentTypeUsages(ctx, id)
	if err != nil {
		return err
	}
	if count > 0 {
		return ErrVacationCalcGroupInUse
	}

	return s.groupRepo.Delete(ctx, id)
}
