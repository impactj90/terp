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
	ErrVehicleRouteNotFound     = errors.New("vehicle route not found")
	ErrVehicleRouteCodeRequired = errors.New("vehicle route code is required")
	ErrVehicleRouteNameRequired = errors.New("vehicle route name is required")
	ErrVehicleRouteCodeExists   = errors.New("vehicle route code already exists for this tenant")
)

// vehicleRouteRepository defines the interface for vehicle route data access.
type vehicleRouteRepository interface {
	Create(ctx context.Context, vr *model.VehicleRoute) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.VehicleRoute, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.VehicleRoute, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.VehicleRoute, error)
	Update(ctx context.Context, vr *model.VehicleRoute) error
	Delete(ctx context.Context, id uuid.UUID) error
}

type VehicleRouteService struct {
	repo vehicleRouteRepository
}

func NewVehicleRouteService(repo vehicleRouteRepository) *VehicleRouteService {
	return &VehicleRouteService{repo: repo}
}

// CreateVehicleRouteInput represents the input for creating a vehicle route.
type CreateVehicleRouteInput struct {
	TenantID    uuid.UUID
	Code        string
	Name        string
	Description string
	DistanceKm  *float64
	SortOrder   *int
}

// Create creates a new vehicle route with validation.
func (s *VehicleRouteService) Create(ctx context.Context, input CreateVehicleRouteInput) (*model.VehicleRoute, error) {
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrVehicleRouteCodeRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrVehicleRouteNameRequired
	}

	// Check uniqueness within tenant
	existing, err := s.repo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrVehicleRouteCodeExists
	}

	vr := &model.VehicleRoute{
		TenantID:    input.TenantID,
		Code:        code,
		Name:        name,
		Description: strings.TrimSpace(input.Description),
		IsActive:    true,
	}
	if input.DistanceKm != nil {
		vr.DistanceKm = decimal.NewFromFloat(*input.DistanceKm)
	}
	if input.SortOrder != nil {
		vr.SortOrder = *input.SortOrder
	}

	if err := s.repo.Create(ctx, vr); err != nil {
		return nil, err
	}
	return vr, nil
}

// GetByID retrieves a vehicle route by ID.
func (s *VehicleRouteService) GetByID(ctx context.Context, id uuid.UUID) (*model.VehicleRoute, error) {
	vr, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrVehicleRouteNotFound
	}
	return vr, nil
}

// UpdateVehicleRouteInput represents the input for updating a vehicle route.
type UpdateVehicleRouteInput struct {
	Name        *string
	Description *string
	DistanceKm  *float64
	IsActive    *bool
	SortOrder   *int
}

// Update updates a vehicle route. Code cannot be changed.
func (s *VehicleRouteService) Update(ctx context.Context, id uuid.UUID, input UpdateVehicleRouteInput) (*model.VehicleRoute, error) {
	vr, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrVehicleRouteNotFound
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrVehicleRouteNameRequired
		}
		vr.Name = name
	}
	if input.Description != nil {
		vr.Description = strings.TrimSpace(*input.Description)
	}
	if input.DistanceKm != nil {
		vr.DistanceKm = decimal.NewFromFloat(*input.DistanceKm)
	}
	if input.IsActive != nil {
		vr.IsActive = *input.IsActive
	}
	if input.SortOrder != nil {
		vr.SortOrder = *input.SortOrder
	}

	if err := s.repo.Update(ctx, vr); err != nil {
		return nil, err
	}
	return vr, nil
}

// Delete deletes a vehicle route by ID.
func (s *VehicleRouteService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrVehicleRouteNotFound
	}

	return s.repo.Delete(ctx, id)
}

// List retrieves all vehicle routes for a tenant.
func (s *VehicleRouteService) List(ctx context.Context, tenantID uuid.UUID) ([]model.VehicleRoute, error) {
	return s.repo.List(ctx, tenantID)
}
