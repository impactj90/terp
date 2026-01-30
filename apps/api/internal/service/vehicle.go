package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrVehicleNotFound     = errors.New("vehicle not found")
	ErrVehicleCodeRequired = errors.New("vehicle code is required")
	ErrVehicleNameRequired = errors.New("vehicle name is required")
	ErrVehicleCodeExists   = errors.New("vehicle code already exists for this tenant")
)

// vehicleRepository defines the interface for vehicle data access.
type vehicleRepository interface {
	Create(ctx context.Context, v *model.Vehicle) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.Vehicle, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.Vehicle, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.Vehicle, error)
	Update(ctx context.Context, v *model.Vehicle) error
	Delete(ctx context.Context, id uuid.UUID) error
}

type VehicleService struct {
	repo vehicleRepository
}

func NewVehicleService(repo vehicleRepository) *VehicleService {
	return &VehicleService{repo: repo}
}

// CreateVehicleInput represents the input for creating a vehicle.
type CreateVehicleInput struct {
	TenantID     uuid.UUID
	Code         string
	Name         string
	Description  string
	LicensePlate string
	SortOrder    *int
}

// Create creates a new vehicle with validation.
func (s *VehicleService) Create(ctx context.Context, input CreateVehicleInput) (*model.Vehicle, error) {
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrVehicleCodeRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrVehicleNameRequired
	}

	// Check uniqueness within tenant
	existing, err := s.repo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrVehicleCodeExists
	}

	v := &model.Vehicle{
		TenantID:     input.TenantID,
		Code:         code,
		Name:         name,
		Description:  strings.TrimSpace(input.Description),
		LicensePlate: strings.TrimSpace(input.LicensePlate),
		IsActive:     true,
	}
	if input.SortOrder != nil {
		v.SortOrder = *input.SortOrder
	}

	if err := s.repo.Create(ctx, v); err != nil {
		return nil, err
	}
	return v, nil
}

// GetByID retrieves a vehicle by ID.
func (s *VehicleService) GetByID(ctx context.Context, id uuid.UUID) (*model.Vehicle, error) {
	v, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrVehicleNotFound
	}
	return v, nil
}

// UpdateVehicleInput represents the input for updating a vehicle.
type UpdateVehicleInput struct {
	Name         *string
	Description  *string
	LicensePlate *string
	IsActive     *bool
	SortOrder    *int
}

// Update updates a vehicle. Code cannot be changed.
func (s *VehicleService) Update(ctx context.Context, id uuid.UUID, input UpdateVehicleInput) (*model.Vehicle, error) {
	v, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrVehicleNotFound
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrVehicleNameRequired
		}
		v.Name = name
	}
	if input.Description != nil {
		v.Description = strings.TrimSpace(*input.Description)
	}
	if input.LicensePlate != nil {
		v.LicensePlate = strings.TrimSpace(*input.LicensePlate)
	}
	if input.IsActive != nil {
		v.IsActive = *input.IsActive
	}
	if input.SortOrder != nil {
		v.SortOrder = *input.SortOrder
	}

	if err := s.repo.Update(ctx, v); err != nil {
		return nil, err
	}
	return v, nil
}

// Delete deletes a vehicle by ID.
func (s *VehicleService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrVehicleNotFound
	}

	return s.repo.Delete(ctx, id)
}

// List retrieves all vehicles for a tenant.
func (s *VehicleService) List(ctx context.Context, tenantID uuid.UUID) ([]model.Vehicle, error) {
	return s.repo.List(ctx, tenantID)
}
