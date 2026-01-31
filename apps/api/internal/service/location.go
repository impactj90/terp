package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

// Location service errors.
var (
	ErrLocationNotFound     = errors.New("location not found")
	ErrLocationCodeConflict = errors.New("location code already exists")
)

type locationRepo interface {
	List(ctx context.Context, tenantID uuid.UUID, isActive *bool) ([]model.Location, error)
	GetByID(ctx context.Context, id uuid.UUID) (*model.Location, error)
	Create(ctx context.Context, loc *model.Location) error
	Update(ctx context.Context, loc *model.Location) error
	Delete(ctx context.Context, id uuid.UUID) error
}

// LocationService handles location business logic.
type LocationService struct {
	repo locationRepo
}

// NewLocationService creates a new LocationService.
func NewLocationService(repo locationRepo) *LocationService {
	return &LocationService{repo: repo}
}

// List returns all locations for a tenant, optionally filtered by active status.
func (s *LocationService) List(ctx context.Context, tenantID uuid.UUID, isActive *bool) ([]model.Location, error) {
	return s.repo.List(ctx, tenantID, isActive)
}

// GetByID returns a location by ID.
func (s *LocationService) GetByID(ctx context.Context, id uuid.UUID) (*model.Location, error) {
	loc, err := s.repo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrLocationNotFound) {
			return nil, ErrLocationNotFound
		}
		return nil, fmt.Errorf("failed to get location: %w", err)
	}
	return loc, nil
}

// CreateLocationInput represents input for creating a location.
type CreateLocationInput struct {
	TenantID    uuid.UUID
	Code        string
	Name        string
	Description string
	Address     string
	City        string
	Country     string
	Timezone    string
}

// Create creates a new location.
func (s *LocationService) Create(ctx context.Context, input CreateLocationInput) (*model.Location, error) {
	loc := &model.Location{
		TenantID:    input.TenantID,
		Code:        input.Code,
		Name:        input.Name,
		Description: input.Description,
		Address:     input.Address,
		City:        input.City,
		Country:     input.Country,
		Timezone:    input.Timezone,
		IsActive:    true,
	}

	if err := s.repo.Create(ctx, loc); err != nil {
		if errors.Is(err, repository.ErrLocationCodeConflict) {
			return nil, ErrLocationCodeConflict
		}
		return nil, fmt.Errorf("failed to create location: %w", err)
	}

	return loc, nil
}

// UpdateLocationInput represents input for updating a location.
type UpdateLocationInput struct {
	Code        *string
	Name        *string
	Description *string
	Address     *string
	City        *string
	Country     *string
	Timezone    *string
	IsActive    *bool
}

// Update updates an existing location.
func (s *LocationService) Update(ctx context.Context, id uuid.UUID, input UpdateLocationInput) (*model.Location, error) {
	loc, err := s.repo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrLocationNotFound) {
			return nil, ErrLocationNotFound
		}
		return nil, fmt.Errorf("failed to get location: %w", err)
	}

	if input.Code != nil {
		loc.Code = *input.Code
	}
	if input.Name != nil {
		loc.Name = *input.Name
	}
	if input.Description != nil {
		loc.Description = *input.Description
	}
	if input.Address != nil {
		loc.Address = *input.Address
	}
	if input.City != nil {
		loc.City = *input.City
	}
	if input.Country != nil {
		loc.Country = *input.Country
	}
	if input.Timezone != nil {
		loc.Timezone = *input.Timezone
	}
	if input.IsActive != nil {
		loc.IsActive = *input.IsActive
	}

	if err := s.repo.Update(ctx, loc); err != nil {
		if errors.Is(err, repository.ErrLocationCodeConflict) {
			return nil, ErrLocationCodeConflict
		}
		return nil, fmt.Errorf("failed to update location: %w", err)
	}

	return loc, nil
}

// Delete deletes a location by ID.
func (s *LocationService) Delete(ctx context.Context, id uuid.UUID) error {
	if err := s.repo.Delete(ctx, id); err != nil {
		if errors.Is(err, repository.ErrLocationNotFound) {
			return ErrLocationNotFound
		}
		return fmt.Errorf("failed to delete location: %w", err)
	}
	return nil
}
