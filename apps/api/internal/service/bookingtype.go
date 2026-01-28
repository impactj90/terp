package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrBookingTypeNotFound     = errors.New("booking type not found")
	ErrBookingTypeCodeExists   = errors.New("booking type code already exists")
	ErrBookingTypeCodeReq      = errors.New("booking type code is required")
	ErrBookingTypeNameReq      = errors.New("booking type name is required")
	ErrBookingTypeDirectionReq = errors.New("booking type direction is required")
	ErrInvalidDirection        = errors.New("invalid direction (must be 'in' or 'out')")
	ErrCannotModifySystemType  = errors.New("cannot modify system booking type")
	ErrCannotDeleteSystemType  = errors.New("cannot delete system booking type")
	ErrCannotDeleteTypeInUse   = errors.New("cannot delete booking type in use")
)

// bookingTypeRepository defines the interface for booking type data access.
type bookingTypeRepository interface {
	Create(ctx context.Context, bt *model.BookingType) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.BookingType, error)
	GetByCode(ctx context.Context, tenantID *uuid.UUID, code string) (*model.BookingType, error)
	Update(ctx context.Context, bt *model.BookingType) error
	Delete(ctx context.Context, id uuid.UUID) error
	CountUsage(ctx context.Context, tenantID uuid.UUID, bookingTypeID uuid.UUID) (int, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.BookingType, error)
	ListWithSystem(ctx context.Context, tenantID uuid.UUID) ([]model.BookingType, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.BookingType, error)
	ListByDirection(ctx context.Context, tenantID uuid.UUID, direction model.BookingDirection) ([]model.BookingType, error)
	GetSystemTypes(ctx context.Context) ([]model.BookingType, error)
	Upsert(ctx context.Context, bt *model.BookingType) error
}

type BookingTypeService struct {
	repo bookingTypeRepository
}

func NewBookingTypeService(repo bookingTypeRepository) *BookingTypeService {
	return &BookingTypeService{repo: repo}
}

// CreateBookingTypeInput represents the input for creating a booking type.
type CreateBookingTypeInput struct {
	TenantID    uuid.UUID
	Code        string
	Name        string
	Description *string
	Direction   string
}

// Create creates a new booking type with validation.
func (s *BookingTypeService) Create(ctx context.Context, input CreateBookingTypeInput) (*model.BookingType, error) {
	// Validate required fields
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrBookingTypeCodeReq
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrBookingTypeNameReq
	}
	direction := strings.TrimSpace(input.Direction)
	if direction == "" {
		return nil, ErrBookingTypeDirectionReq
	}

	// Validate direction
	if direction != string(model.BookingDirectionIn) && direction != string(model.BookingDirectionOut) {
		return nil, ErrInvalidDirection
	}

	// Check code uniqueness within tenant
	existing, err := s.repo.GetByCode(ctx, &input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrBookingTypeCodeExists
	}

	bt := &model.BookingType{
		TenantID:    &input.TenantID,
		Code:        code,
		Name:        name,
		Description: input.Description,
		Direction:   model.BookingDirection(direction),
		IsSystem:    false,
		IsActive:    true,
	}

	if err := s.repo.Create(ctx, bt); err != nil {
		return nil, err
	}

	return bt, nil
}

// GetByID retrieves a booking type by ID.
func (s *BookingTypeService) GetByID(ctx context.Context, id uuid.UUID) (*model.BookingType, error) {
	bt, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrBookingTypeNotFound
	}
	return bt, nil
}

// UpdateBookingTypeInput represents the input for updating a booking type.
type UpdateBookingTypeInput struct {
	Name        *string
	Description *string
	IsActive    *bool
}

// Update updates a booking type.
func (s *BookingTypeService) Update(ctx context.Context, id uuid.UUID, tenantID uuid.UUID, input UpdateBookingTypeInput) (*model.BookingType, error) {
	bt, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrBookingTypeNotFound
	}

	// Cannot modify system types
	if bt.IsSystem {
		return nil, ErrCannotModifySystemType
	}

	// Verify the booking type belongs to the tenant
	if bt.TenantID == nil || *bt.TenantID != tenantID {
		return nil, ErrBookingTypeNotFound
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrBookingTypeNameReq
		}
		bt.Name = name
	}
	if input.Description != nil {
		bt.Description = input.Description
	}
	if input.IsActive != nil {
		bt.IsActive = *input.IsActive
	}

	if err := s.repo.Update(ctx, bt); err != nil {
		return nil, err
	}

	return bt, nil
}

// Delete deletes a booking type by ID.
func (s *BookingTypeService) Delete(ctx context.Context, id uuid.UUID, tenantID uuid.UUID) error {
	bt, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrBookingTypeNotFound
	}

	// Cannot delete system types
	if bt.IsSystem {
		return ErrCannotDeleteSystemType
	}

	// Verify the booking type belongs to the tenant
	if bt.TenantID == nil || *bt.TenantID != tenantID {
		return ErrBookingTypeNotFound
	}

	usageCount, err := s.repo.CountUsage(ctx, tenantID, id)
	if err != nil {
		return err
	}
	if usageCount > 0 {
		return ErrCannotDeleteTypeInUse
	}

	return s.repo.Delete(ctx, id)
}

// ListFilter specifies filtering options for listing booking types.
type ListFilter struct {
	ActiveOnly *bool
	Direction  *model.BookingDirection
}

// List retrieves all booking types for a tenant including system types.
func (s *BookingTypeService) List(ctx context.Context, tenantID uuid.UUID, filter ListFilter) ([]model.BookingType, error) {
	// If filtering by direction
	if filter.Direction != nil {
		return s.repo.ListByDirection(ctx, tenantID, *filter.Direction)
	}

	// If filtering by active only
	if filter.ActiveOnly != nil && *filter.ActiveOnly {
		return s.repo.ListActive(ctx, tenantID)
	}

	// Return all including system types
	return s.repo.ListWithSystem(ctx, tenantID)
}

// GetSystemTypes retrieves all system booking types.
func (s *BookingTypeService) GetSystemTypes(ctx context.Context) ([]model.BookingType, error) {
	return s.repo.GetSystemTypes(ctx)
}

// UpsertDevBookingType ensures a dev booking type exists in the database as a system type.
func (s *BookingTypeService) UpsertDevBookingType(ctx context.Context, bt *model.BookingType) error {
	return s.repo.Upsert(ctx, bt)
}
