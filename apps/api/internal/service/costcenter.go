package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrCostCenterNotFound     = errors.New("cost center not found")
	ErrCostCenterCodeRequired = errors.New("cost center code is required")
	ErrCostCenterNameRequired = errors.New("cost center name is required")
	ErrCostCenterCodeExists   = errors.New("cost center code already exists")
)

// costCenterRepository defines the interface for cost center data access.
type costCenterRepository interface {
	Create(ctx context.Context, cc *model.CostCenter) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.CostCenter, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.CostCenter, error)
	Update(ctx context.Context, cc *model.CostCenter) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, tenantID uuid.UUID) ([]model.CostCenter, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.CostCenter, error)
}

type CostCenterService struct {
	costCenterRepo costCenterRepository
}

func NewCostCenterService(costCenterRepo costCenterRepository) *CostCenterService {
	return &CostCenterService{costCenterRepo: costCenterRepo}
}

// CreateCostCenterInput represents the input for creating a cost center.
type CreateCostCenterInput struct {
	TenantID    uuid.UUID
	Code        string
	Name        string
	Description string
	IsActive    bool
}

// Create creates a new cost center with validation.
func (s *CostCenterService) Create(ctx context.Context, input CreateCostCenterInput) (*model.CostCenter, error) {
	// Validate required fields
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrCostCenterCodeRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrCostCenterNameRequired
	}

	// Check for existing cost center with same code for this tenant
	existing, err := s.costCenterRepo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrCostCenterCodeExists
	}

	cc := &model.CostCenter{
		TenantID:    input.TenantID,
		Code:        code,
		Name:        name,
		Description: strings.TrimSpace(input.Description),
		IsActive:    input.IsActive,
	}

	if err := s.costCenterRepo.Create(ctx, cc); err != nil {
		return nil, err
	}

	return cc, nil
}

// GetByID retrieves a cost center by ID.
func (s *CostCenterService) GetByID(ctx context.Context, id uuid.UUID) (*model.CostCenter, error) {
	cc, err := s.costCenterRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrCostCenterNotFound
	}
	return cc, nil
}

// GetByCode retrieves a cost center by tenant ID and code.
func (s *CostCenterService) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.CostCenter, error) {
	cc, err := s.costCenterRepo.GetByCode(ctx, tenantID, code)
	if err != nil {
		return nil, ErrCostCenterNotFound
	}
	return cc, nil
}

// UpdateCostCenterInput represents the input for updating a cost center.
type UpdateCostCenterInput struct {
	Code        *string
	Name        *string
	Description *string
	IsActive    *bool
}

// Update updates a cost center.
func (s *CostCenterService) Update(ctx context.Context, id uuid.UUID, input UpdateCostCenterInput) (*model.CostCenter, error) {
	cc, err := s.costCenterRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrCostCenterNotFound
	}

	if input.Code != nil {
		code := strings.TrimSpace(*input.Code)
		if code == "" {
			return nil, ErrCostCenterCodeRequired
		}
		// Check if the new code conflicts with another cost center
		if code != cc.Code {
			existing, err := s.costCenterRepo.GetByCode(ctx, cc.TenantID, code)
			if err == nil && existing != nil {
				return nil, ErrCostCenterCodeExists
			}
		}
		cc.Code = code
	}
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrCostCenterNameRequired
		}
		cc.Name = name
	}
	if input.Description != nil {
		cc.Description = strings.TrimSpace(*input.Description)
	}
	if input.IsActive != nil {
		cc.IsActive = *input.IsActive
	}

	if err := s.costCenterRepo.Update(ctx, cc); err != nil {
		return nil, err
	}

	return cc, nil
}

// Delete deletes a cost center by ID.
func (s *CostCenterService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.costCenterRepo.GetByID(ctx, id)
	if err != nil {
		return ErrCostCenterNotFound
	}
	return s.costCenterRepo.Delete(ctx, id)
}

// List retrieves all cost centers for a tenant.
func (s *CostCenterService) List(ctx context.Context, tenantID uuid.UUID) ([]model.CostCenter, error) {
	return s.costCenterRepo.List(ctx, tenantID)
}

// ListActive retrieves all active cost centers for a tenant.
func (s *CostCenterService) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.CostCenter, error) {
	return s.costCenterRepo.ListActive(ctx, tenantID)
}
