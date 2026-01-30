package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrVacationCappingRuleGroupNotFound     = errors.New("vacation capping rule group not found")
	ErrVacationCappingRuleGroupCodeRequired = errors.New("vacation capping rule group code is required")
	ErrVacationCappingRuleGroupNameRequired = errors.New("vacation capping rule group name is required")
	ErrVacationCappingRuleGroupCodeExists   = errors.New("vacation capping rule group code already exists")
	ErrVacationCappingRuleGroupInUse        = errors.New("vacation capping rule group is assigned to tariffs")
	ErrCappingRuleNotFound                  = errors.New("one or more capping rule IDs not found")
)

// vacationCappingRuleGroupRepository defines the interface for capping rule group data access.
type vacationCappingRuleGroupRepository interface {
	Create(ctx context.Context, group *model.VacationCappingRuleGroup) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.VacationCappingRuleGroup, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.VacationCappingRuleGroup, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCappingRuleGroup, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCappingRuleGroup, error)
	Update(ctx context.Context, group *model.VacationCappingRuleGroup) error
	Delete(ctx context.Context, id uuid.UUID) error
	CountTariffUsages(ctx context.Context, groupID uuid.UUID) (int64, error)
	ReplaceCappingRules(ctx context.Context, groupID uuid.UUID, cappingRuleIDs []uuid.UUID) error
}

// CreateVacationCappingRuleGroupInput represents the input for creating a capping rule group.
type CreateVacationCappingRuleGroupInput struct {
	TenantID       uuid.UUID
	Code           string
	Name           string
	Description    *string
	CappingRuleIDs []uuid.UUID
}

// UpdateVacationCappingRuleGroupInput represents the input for updating a capping rule group.
type UpdateVacationCappingRuleGroupInput struct {
	Name           *string
	Description    *string
	IsActive       *bool
	CappingRuleIDs *[]uuid.UUID // nil = don't change, non-nil = replace
}

// VacationCappingRuleGroupService handles business logic for capping rule groups.
type VacationCappingRuleGroupService struct {
	groupRepo   vacationCappingRuleGroupRepository
	cappingRepo vacationCappingRuleRepository
}

// NewVacationCappingRuleGroupService creates a new VacationCappingRuleGroupService.
func NewVacationCappingRuleGroupService(
	groupRepo vacationCappingRuleGroupRepository,
	cappingRepo vacationCappingRuleRepository,
) *VacationCappingRuleGroupService {
	return &VacationCappingRuleGroupService{
		groupRepo:   groupRepo,
		cappingRepo: cappingRepo,
	}
}

// Create creates a new vacation capping rule group.
func (s *VacationCappingRuleGroupService) Create(ctx context.Context, input CreateVacationCappingRuleGroupInput) (*model.VacationCappingRuleGroup, error) {
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrVacationCappingRuleGroupCodeRequired
	}

	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrVacationCappingRuleGroupNameRequired
	}

	// Check code uniqueness
	existing, err := s.groupRepo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrVacationCappingRuleGroupCodeExists
	}

	// Validate capping rule IDs exist
	if len(input.CappingRuleIDs) > 0 {
		found, err := s.cappingRepo.ListByIDs(ctx, input.CappingRuleIDs)
		if err != nil {
			return nil, err
		}
		if len(found) != len(input.CappingRuleIDs) {
			return nil, ErrCappingRuleNotFound
		}
	}

	group := &model.VacationCappingRuleGroup{
		TenantID:    input.TenantID,
		Code:        code,
		Name:        name,
		Description: input.Description,
		IsActive:    true,
	}

	if err := s.groupRepo.Create(ctx, group); err != nil {
		return nil, err
	}

	// Link capping rules
	if len(input.CappingRuleIDs) > 0 {
		if err := s.groupRepo.ReplaceCappingRules(ctx, group.ID, input.CappingRuleIDs); err != nil {
			return nil, err
		}
	}

	// Reload with preloaded relations
	return s.groupRepo.GetByID(ctx, group.ID)
}

// GetByID retrieves a vacation capping rule group by ID.
func (s *VacationCappingRuleGroupService) GetByID(ctx context.Context, id uuid.UUID) (*model.VacationCappingRuleGroup, error) {
	group, err := s.groupRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrVacationCappingRuleGroupNotFound
	}
	return group, nil
}

// List retrieves all capping rule groups for a tenant.
func (s *VacationCappingRuleGroupService) List(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCappingRuleGroup, error) {
	return s.groupRepo.List(ctx, tenantID)
}

// ListActive retrieves only active capping rule groups for a tenant.
func (s *VacationCappingRuleGroupService) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCappingRuleGroup, error) {
	return s.groupRepo.ListActive(ctx, tenantID)
}

// Update updates a vacation capping rule group.
func (s *VacationCappingRuleGroupService) Update(ctx context.Context, id uuid.UUID, input UpdateVacationCappingRuleGroupInput) (*model.VacationCappingRuleGroup, error) {
	group, err := s.groupRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrVacationCappingRuleGroupNotFound
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrVacationCappingRuleGroupNameRequired
		}
		group.Name = name
	}

	if input.Description != nil {
		group.Description = input.Description
	}

	if input.IsActive != nil {
		group.IsActive = *input.IsActive
	}

	// Replace capping rule links if provided
	if input.CappingRuleIDs != nil {
		ids := *input.CappingRuleIDs
		if len(ids) > 0 {
			found, err := s.cappingRepo.ListByIDs(ctx, ids)
			if err != nil {
				return nil, err
			}
			if len(found) != len(ids) {
				return nil, ErrCappingRuleNotFound
			}
		}
		if err := s.groupRepo.ReplaceCappingRules(ctx, group.ID, ids); err != nil {
			return nil, err
		}
	}

	if err := s.groupRepo.Update(ctx, group); err != nil {
		return nil, err
	}

	// Reload with preloaded relations
	return s.groupRepo.GetByID(ctx, group.ID)
}

// Delete deletes a vacation capping rule group.
// Returns ErrVacationCappingRuleGroupInUse if still assigned to tariffs.
func (s *VacationCappingRuleGroupService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.groupRepo.GetByID(ctx, id)
	if err != nil {
		return ErrVacationCappingRuleGroupNotFound
	}

	count, err := s.groupRepo.CountTariffUsages(ctx, id)
	if err != nil {
		return err
	}
	if count > 0 {
		return ErrVacationCappingRuleGroupInUse
	}

	return s.groupRepo.Delete(ctx, id)
}
