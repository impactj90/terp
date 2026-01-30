package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrAccessZoneNotFound     = errors.New("access zone not found")
	ErrAccessZoneCodeRequired = errors.New("access zone code is required")
	ErrAccessZoneNameRequired = errors.New("access zone name is required")
	ErrAccessZoneCodeExists   = errors.New("access zone code already exists for this tenant")
)

// accessZoneRepository defines the interface for access zone data access.
type accessZoneRepository interface {
	Create(ctx context.Context, az *model.AccessZone) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.AccessZone, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.AccessZone, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.AccessZone, error)
	Update(ctx context.Context, az *model.AccessZone) error
	Delete(ctx context.Context, id uuid.UUID) error
}

type AccessZoneService struct {
	repo accessZoneRepository
}

func NewAccessZoneService(repo accessZoneRepository) *AccessZoneService {
	return &AccessZoneService{repo: repo}
}

// CreateAccessZoneInput represents the input for creating an access zone.
type CreateAccessZoneInput struct {
	TenantID    uuid.UUID
	Code        string
	Name        string
	Description string
	SortOrder   *int
}

// Create creates a new access zone with validation.
func (s *AccessZoneService) Create(ctx context.Context, input CreateAccessZoneInput) (*model.AccessZone, error) {
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrAccessZoneCodeRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrAccessZoneNameRequired
	}

	// Check uniqueness within tenant
	existing, err := s.repo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrAccessZoneCodeExists
	}

	az := &model.AccessZone{
		TenantID:    input.TenantID,
		Code:        code,
		Name:        name,
		Description: strings.TrimSpace(input.Description),
		IsActive:    true,
	}
	if input.SortOrder != nil {
		az.SortOrder = *input.SortOrder
	}

	if err := s.repo.Create(ctx, az); err != nil {
		return nil, err
	}
	return az, nil
}

// GetByID retrieves an access zone by ID.
func (s *AccessZoneService) GetByID(ctx context.Context, id uuid.UUID) (*model.AccessZone, error) {
	az, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrAccessZoneNotFound
	}
	return az, nil
}

// UpdateAccessZoneInput represents the input for updating an access zone.
type UpdateAccessZoneInput struct {
	Name        *string
	Description *string
	IsActive    *bool
	SortOrder   *int
}

// Update updates an access zone. Code cannot be changed.
func (s *AccessZoneService) Update(ctx context.Context, id uuid.UUID, input UpdateAccessZoneInput) (*model.AccessZone, error) {
	az, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrAccessZoneNotFound
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrAccessZoneNameRequired
		}
		az.Name = name
	}
	if input.Description != nil {
		az.Description = strings.TrimSpace(*input.Description)
	}
	if input.IsActive != nil {
		az.IsActive = *input.IsActive
	}
	if input.SortOrder != nil {
		az.SortOrder = *input.SortOrder
	}

	if err := s.repo.Update(ctx, az); err != nil {
		return nil, err
	}
	return az, nil
}

// Delete deletes an access zone by ID.
func (s *AccessZoneService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrAccessZoneNotFound
	}

	return s.repo.Delete(ctx, id)
}

// List retrieves all access zones for a tenant.
func (s *AccessZoneService) List(ctx context.Context, tenantID uuid.UUID) ([]model.AccessZone, error) {
	return s.repo.List(ctx, tenantID)
}
