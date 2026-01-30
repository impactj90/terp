package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrAccessProfileNotFound     = errors.New("access profile not found")
	ErrAccessProfileCodeRequired = errors.New("access profile code is required")
	ErrAccessProfileNameRequired = errors.New("access profile name is required")
	ErrAccessProfileCodeExists   = errors.New("access profile code already exists for this tenant")
	ErrAccessProfileInUse        = errors.New("access profile is in use by employee assignments and cannot be deleted")
)

// accessProfileRepository defines the interface for access profile data access.
type accessProfileRepository interface {
	Create(ctx context.Context, ap *model.AccessProfile) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.AccessProfile, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.AccessProfile, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.AccessProfile, error)
	Update(ctx context.Context, ap *model.AccessProfile) error
	Delete(ctx context.Context, id uuid.UUID) error
	HasAssignments(ctx context.Context, accessProfileID uuid.UUID) (bool, error)
}

type AccessProfileService struct {
	repo accessProfileRepository
}

func NewAccessProfileService(repo accessProfileRepository) *AccessProfileService {
	return &AccessProfileService{repo: repo}
}

// CreateAccessProfileInput represents the input for creating an access profile.
type CreateAccessProfileInput struct {
	TenantID    uuid.UUID
	Code        string
	Name        string
	Description string
}

// Create creates a new access profile with validation.
func (s *AccessProfileService) Create(ctx context.Context, input CreateAccessProfileInput) (*model.AccessProfile, error) {
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrAccessProfileCodeRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrAccessProfileNameRequired
	}

	// Check uniqueness within tenant
	existing, err := s.repo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrAccessProfileCodeExists
	}

	ap := &model.AccessProfile{
		TenantID:    input.TenantID,
		Code:        code,
		Name:        name,
		Description: strings.TrimSpace(input.Description),
		IsActive:    true,
	}

	if err := s.repo.Create(ctx, ap); err != nil {
		return nil, err
	}
	return ap, nil
}

// GetByID retrieves an access profile by ID.
func (s *AccessProfileService) GetByID(ctx context.Context, id uuid.UUID) (*model.AccessProfile, error) {
	ap, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrAccessProfileNotFound
	}
	return ap, nil
}

// UpdateAccessProfileInput represents the input for updating an access profile.
type UpdateAccessProfileInput struct {
	Name        *string
	Description *string
	IsActive    *bool
}

// Update updates an access profile. Code cannot be changed.
func (s *AccessProfileService) Update(ctx context.Context, id uuid.UUID, input UpdateAccessProfileInput) (*model.AccessProfile, error) {
	ap, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrAccessProfileNotFound
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrAccessProfileNameRequired
		}
		ap.Name = name
	}
	if input.Description != nil {
		ap.Description = strings.TrimSpace(*input.Description)
	}
	if input.IsActive != nil {
		ap.IsActive = *input.IsActive
	}

	if err := s.repo.Update(ctx, ap); err != nil {
		return nil, err
	}
	return ap, nil
}

// Delete deletes an access profile by ID. Fails if employee assignments reference it.
func (s *AccessProfileService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrAccessProfileNotFound
	}

	hasAssignments, err := s.repo.HasAssignments(ctx, id)
	if err != nil {
		return err
	}
	if hasAssignments {
		return ErrAccessProfileInUse
	}

	return s.repo.Delete(ctx, id)
}

// List retrieves all access profiles for a tenant.
func (s *AccessProfileService) List(ctx context.Context, tenantID uuid.UUID) ([]model.AccessProfile, error) {
	return s.repo.List(ctx, tenantID)
}
