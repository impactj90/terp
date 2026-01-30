package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrActivityNotFound     = errors.New("activity not found")
	ErrActivityCodeRequired = errors.New("activity code is required")
	ErrActivityNameRequired = errors.New("activity name is required")
	ErrActivityCodeExists   = errors.New("activity code already exists")
)

// activityRepository defines the interface for activity data access.
type activityRepository interface {
	Create(ctx context.Context, a *model.Activity) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.Activity, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.Activity, error)
	Update(ctx context.Context, a *model.Activity) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, tenantID uuid.UUID) ([]model.Activity, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.Activity, error)
}

// ActivityService provides business logic for activities.
type ActivityService struct {
	activityRepo activityRepository
}

// NewActivityService creates a new ActivityService.
func NewActivityService(activityRepo activityRepository) *ActivityService {
	return &ActivityService{activityRepo: activityRepo}
}

// CreateActivityInput represents the input for creating an activity.
type CreateActivityInput struct {
	TenantID    uuid.UUID
	Code        string
	Name        string
	Description string
}

// Create creates a new activity with validation.
func (s *ActivityService) Create(ctx context.Context, input CreateActivityInput) (*model.Activity, error) {
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrActivityCodeRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrActivityNameRequired
	}

	existing, err := s.activityRepo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrActivityCodeExists
	}

	a := &model.Activity{
		TenantID:    input.TenantID,
		Code:        code,
		Name:        name,
		Description: strings.TrimSpace(input.Description),
		IsActive:    true,
	}

	if err := s.activityRepo.Create(ctx, a); err != nil {
		return nil, err
	}

	return a, nil
}

// GetByID retrieves an activity by ID.
func (s *ActivityService) GetByID(ctx context.Context, id uuid.UUID) (*model.Activity, error) {
	a, err := s.activityRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrActivityNotFound
	}
	return a, nil
}

// UpdateActivityInput represents the input for updating an activity.
type UpdateActivityInput struct {
	Code        *string
	Name        *string
	Description *string
	IsActive    *bool
}

// Update updates an activity.
func (s *ActivityService) Update(ctx context.Context, id uuid.UUID, input UpdateActivityInput) (*model.Activity, error) {
	a, err := s.activityRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrActivityNotFound
	}

	if input.Code != nil {
		code := strings.TrimSpace(*input.Code)
		if code == "" {
			return nil, ErrActivityCodeRequired
		}
		if code != a.Code {
			existing, err := s.activityRepo.GetByCode(ctx, a.TenantID, code)
			if err == nil && existing != nil {
				return nil, ErrActivityCodeExists
			}
		}
		a.Code = code
	}
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrActivityNameRequired
		}
		a.Name = name
	}
	if input.Description != nil {
		a.Description = strings.TrimSpace(*input.Description)
	}
	if input.IsActive != nil {
		a.IsActive = *input.IsActive
	}

	if err := s.activityRepo.Update(ctx, a); err != nil {
		return nil, err
	}

	return a, nil
}

// Delete deletes an activity by ID.
func (s *ActivityService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.activityRepo.GetByID(ctx, id)
	if err != nil {
		return ErrActivityNotFound
	}
	return s.activityRepo.Delete(ctx, id)
}

// List retrieves all activities for a tenant.
func (s *ActivityService) List(ctx context.Context, tenantID uuid.UUID) ([]model.Activity, error) {
	return s.activityRepo.List(ctx, tenantID)
}

// ListActive retrieves all active activities for a tenant.
func (s *ActivityService) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.Activity, error) {
	return s.activityRepo.ListActive(ctx, tenantID)
}
