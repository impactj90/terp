package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrTravelAllowanceRuleSetNotFound     = errors.New("travel allowance rule set not found")
	ErrTravelAllowanceRuleSetCodeRequired = errors.New("travel allowance rule set code is required")
	ErrTravelAllowanceRuleSetNameRequired = errors.New("travel allowance rule set name is required")
	ErrTravelAllowanceRuleSetCodeExists   = errors.New("travel allowance rule set code already exists for this tenant")
)

// travelAllowanceRuleSetRepository defines the interface for travel allowance rule set data access.
type travelAllowanceRuleSetRepository interface {
	Create(ctx context.Context, rs *model.TravelAllowanceRuleSet) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.TravelAllowanceRuleSet, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.TravelAllowanceRuleSet, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.TravelAllowanceRuleSet, error)
	Update(ctx context.Context, rs *model.TravelAllowanceRuleSet) error
	Delete(ctx context.Context, id uuid.UUID) error
}

type TravelAllowanceRuleSetService struct {
	repo travelAllowanceRuleSetRepository
}

func NewTravelAllowanceRuleSetService(repo travelAllowanceRuleSetRepository) *TravelAllowanceRuleSetService {
	return &TravelAllowanceRuleSetService{repo: repo}
}

// CreateTravelAllowanceRuleSetInput represents the input for creating a rule set.
type CreateTravelAllowanceRuleSetInput struct {
	TenantID         uuid.UUID
	Code             string
	Name             string
	Description      string
	ValidFrom        *string
	ValidTo          *string
	CalculationBasis string
	DistanceRule     string
	SortOrder        *int
}

// Create creates a new travel allowance rule set with validation.
func (s *TravelAllowanceRuleSetService) Create(ctx context.Context, input CreateTravelAllowanceRuleSetInput) (*model.TravelAllowanceRuleSet, error) {
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrTravelAllowanceRuleSetCodeRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrTravelAllowanceRuleSetNameRequired
	}

	// Check uniqueness within tenant
	existing, err := s.repo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrTravelAllowanceRuleSetCodeExists
	}

	rs := &model.TravelAllowanceRuleSet{
		TenantID:         input.TenantID,
		Code:             code,
		Name:             name,
		Description:      strings.TrimSpace(input.Description),
		CalculationBasis: "per_day",
		DistanceRule:     "longest",
		IsActive:         true,
	}

	if input.CalculationBasis != "" {
		rs.CalculationBasis = input.CalculationBasis
	}
	if input.DistanceRule != "" {
		rs.DistanceRule = input.DistanceRule
	}
	if input.ValidFrom != nil {
		t, err := parseDate(*input.ValidFrom)
		if err == nil {
			rs.ValidFrom = &t
		}
	}
	if input.ValidTo != nil {
		t, err := parseDate(*input.ValidTo)
		if err == nil {
			rs.ValidTo = &t
		}
	}
	if input.SortOrder != nil {
		rs.SortOrder = *input.SortOrder
	}

	if err := s.repo.Create(ctx, rs); err != nil {
		return nil, err
	}
	return rs, nil
}

// GetByID retrieves a travel allowance rule set by ID.
func (s *TravelAllowanceRuleSetService) GetByID(ctx context.Context, id uuid.UUID) (*model.TravelAllowanceRuleSet, error) {
	rs, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrTravelAllowanceRuleSetNotFound
	}
	return rs, nil
}

// UpdateTravelAllowanceRuleSetInput represents the input for updating a rule set.
type UpdateTravelAllowanceRuleSetInput struct {
	Name             *string
	Description      *string
	ValidFrom        *string
	ValidTo          *string
	CalculationBasis *string
	DistanceRule     *string
	IsActive         *bool
	SortOrder        *int
}

// Update updates a travel allowance rule set. Code cannot be changed.
func (s *TravelAllowanceRuleSetService) Update(ctx context.Context, id uuid.UUID, input UpdateTravelAllowanceRuleSetInput) (*model.TravelAllowanceRuleSet, error) {
	rs, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrTravelAllowanceRuleSetNotFound
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrTravelAllowanceRuleSetNameRequired
		}
		rs.Name = name
	}
	if input.Description != nil {
		rs.Description = strings.TrimSpace(*input.Description)
	}
	if input.ValidFrom != nil {
		t, err := parseDate(*input.ValidFrom)
		if err == nil {
			rs.ValidFrom = &t
		}
	}
	if input.ValidTo != nil {
		t, err := parseDate(*input.ValidTo)
		if err == nil {
			rs.ValidTo = &t
		}
	}
	if input.CalculationBasis != nil {
		rs.CalculationBasis = *input.CalculationBasis
	}
	if input.DistanceRule != nil {
		rs.DistanceRule = *input.DistanceRule
	}
	if input.IsActive != nil {
		rs.IsActive = *input.IsActive
	}
	if input.SortOrder != nil {
		rs.SortOrder = *input.SortOrder
	}

	if err := s.repo.Update(ctx, rs); err != nil {
		return nil, err
	}
	return rs, nil
}

// Delete deletes a travel allowance rule set by ID.
func (s *TravelAllowanceRuleSetService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrTravelAllowanceRuleSetNotFound
	}

	return s.repo.Delete(ctx, id)
}

// List retrieves all travel allowance rule sets for a tenant.
func (s *TravelAllowanceRuleSetService) List(ctx context.Context, tenantID uuid.UUID) ([]model.TravelAllowanceRuleSet, error) {
	return s.repo.List(ctx, tenantID)
}
