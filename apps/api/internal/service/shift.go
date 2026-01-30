package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrShiftNotFound     = errors.New("shift not found")
	ErrShiftCodeRequired = errors.New("shift code is required")
	ErrShiftNameRequired = errors.New("shift name is required")
	ErrShiftCodeExists   = errors.New("shift code already exists for this tenant")
	ErrShiftInUse        = errors.New("shift is referenced by shift assignments and cannot be deleted")
)

// shiftRepository defines the interface for shift data access.
type shiftRepository interface {
	Create(ctx context.Context, s *model.Shift) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.Shift, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.Shift, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.Shift, error)
	Update(ctx context.Context, s *model.Shift) error
	Delete(ctx context.Context, id uuid.UUID) error
	HasAssignments(ctx context.Context, shiftID uuid.UUID) (bool, error)
}

type ShiftService struct {
	repo shiftRepository
}

func NewShiftService(repo shiftRepository) *ShiftService {
	return &ShiftService{repo: repo}
}

// CreateShiftInput represents the input for creating a shift.
type CreateShiftInput struct {
	TenantID      uuid.UUID
	Code          string
	Name          string
	Description   string
	DayPlanID     *uuid.UUID
	Color         string
	Qualification string
	SortOrder     *int
}

// Create creates a new shift with validation.
func (s *ShiftService) Create(ctx context.Context, input CreateShiftInput) (*model.Shift, error) {
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrShiftCodeRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrShiftNameRequired
	}

	// Check uniqueness within tenant
	existing, err := s.repo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrShiftCodeExists
	}

	shift := &model.Shift{
		TenantID:      input.TenantID,
		Code:          code,
		Name:          name,
		Description:   strings.TrimSpace(input.Description),
		DayPlanID:     input.DayPlanID,
		Color:         strings.TrimSpace(input.Color),
		Qualification: strings.TrimSpace(input.Qualification),
		IsActive:      true,
	}
	if input.SortOrder != nil {
		shift.SortOrder = *input.SortOrder
	}

	if err := s.repo.Create(ctx, shift); err != nil {
		return nil, err
	}
	return shift, nil
}

// GetByID retrieves a shift by ID.
func (s *ShiftService) GetByID(ctx context.Context, id uuid.UUID) (*model.Shift, error) {
	shift, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrShiftNotFound
	}
	return shift, nil
}

// UpdateShiftInput represents the input for updating a shift.
type UpdateShiftInput struct {
	Name          *string
	Description   *string
	DayPlanID     *uuid.UUID
	Color         *string
	Qualification *string
	IsActive      *bool
	SortOrder     *int
}

// Update updates a shift. Code cannot be changed.
func (s *ShiftService) Update(ctx context.Context, id uuid.UUID, input UpdateShiftInput) (*model.Shift, error) {
	shift, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrShiftNotFound
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrShiftNameRequired
		}
		shift.Name = name
	}
	if input.Description != nil {
		shift.Description = strings.TrimSpace(*input.Description)
	}
	if input.DayPlanID != nil {
		shift.DayPlanID = input.DayPlanID
	}
	if input.Color != nil {
		shift.Color = strings.TrimSpace(*input.Color)
	}
	if input.Qualification != nil {
		shift.Qualification = strings.TrimSpace(*input.Qualification)
	}
	if input.IsActive != nil {
		shift.IsActive = *input.IsActive
	}
	if input.SortOrder != nil {
		shift.SortOrder = *input.SortOrder
	}

	if err := s.repo.Update(ctx, shift); err != nil {
		return nil, err
	}
	return shift, nil
}

// Delete deletes a shift by ID. Fails if shift assignments reference it.
func (s *ShiftService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrShiftNotFound
	}

	hasAssignments, err := s.repo.HasAssignments(ctx, id)
	if err != nil {
		return err
	}
	if hasAssignments {
		return ErrShiftInUse
	}

	return s.repo.Delete(ctx, id)
}

// List retrieves all shifts for a tenant.
func (s *ShiftService) List(ctx context.Context, tenantID uuid.UUID) ([]model.Shift, error) {
	return s.repo.List(ctx, tenantID)
}
