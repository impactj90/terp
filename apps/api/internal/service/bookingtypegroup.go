package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrBookingTypeGroupNotFound    = errors.New("booking type group not found")
	ErrBookingTypeGroupCodeRequired = errors.New("booking type group code is required")
	ErrBookingTypeGroupNameRequired = errors.New("booking type group name is required")
	ErrBookingTypeGroupCodeExists  = errors.New("booking type group code already exists")
)

// bookingTypeGroupRepository defines the interface for booking type group data access.
type bookingTypeGroupRepository interface {
	Create(ctx context.Context, g *model.BookingTypeGroup) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.BookingTypeGroup, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.BookingTypeGroup, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.BookingTypeGroup, error)
	Update(ctx context.Context, g *model.BookingTypeGroup) error
	Delete(ctx context.Context, id uuid.UUID) error
	// Members
	SetMembers(ctx context.Context, groupID uuid.UUID, members []model.BookingTypeGroupMember) error
	ListMemberBookingTypes(ctx context.Context, groupID uuid.UUID) ([]model.BookingType, error)
}

type BookingTypeGroupService struct {
	repo bookingTypeGroupRepository
}

func NewBookingTypeGroupService(repo bookingTypeGroupRepository) *BookingTypeGroupService {
	return &BookingTypeGroupService{repo: repo}
}

// CreateBookingTypeGroupInput represents the input for creating a booking type group.
type CreateBookingTypeGroupInput struct {
	TenantID       uuid.UUID
	Code           string
	Name           string
	Description    *string
	BookingTypeIDs []uuid.UUID
}

// Create creates a new booking type group with validation.
func (s *BookingTypeGroupService) Create(ctx context.Context, input CreateBookingTypeGroupInput) (*model.BookingTypeGroup, error) {
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrBookingTypeGroupCodeRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrBookingTypeGroupNameRequired
	}

	// Check code uniqueness
	existing, err := s.repo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrBookingTypeGroupCodeExists
	}

	g := &model.BookingTypeGroup{
		TenantID:    input.TenantID,
		Code:        code,
		Name:        name,
		Description: input.Description,
		IsActive:    true,
	}

	if err := s.repo.Create(ctx, g); err != nil {
		return nil, err
	}

	// Set members if provided
	if len(input.BookingTypeIDs) > 0 {
		members := make([]model.BookingTypeGroupMember, len(input.BookingTypeIDs))
		for i, btID := range input.BookingTypeIDs {
			members[i] = model.BookingTypeGroupMember{
				GroupID:       g.ID,
				BookingTypeID: btID,
				SortOrder:     i,
			}
		}
		if err := s.repo.SetMembers(ctx, g.ID, members); err != nil {
			return nil, err
		}
	}

	return g, nil
}

// GetByID retrieves a booking type group by ID.
func (s *BookingTypeGroupService) GetByID(ctx context.Context, id uuid.UUID) (*model.BookingTypeGroup, error) {
	g, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrBookingTypeGroupNotFound
	}
	return g, nil
}

// UpdateBookingTypeGroupInput represents the input for updating a booking type group.
type UpdateBookingTypeGroupInput struct {
	Name           *string
	Description    *string
	IsActive       *bool
	BookingTypeIDs []uuid.UUID // nil = don't change; empty slice = clear all members
}

// Update updates a booking type group.
func (s *BookingTypeGroupService) Update(ctx context.Context, id uuid.UUID, input UpdateBookingTypeGroupInput) (*model.BookingTypeGroup, error) {
	g, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrBookingTypeGroupNotFound
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrBookingTypeGroupNameRequired
		}
		g.Name = name
	}
	if input.Description != nil {
		g.Description = input.Description
	}
	if input.IsActive != nil {
		g.IsActive = *input.IsActive
	}

	if err := s.repo.Update(ctx, g); err != nil {
		return nil, err
	}

	// Update members if provided
	if input.BookingTypeIDs != nil {
		members := make([]model.BookingTypeGroupMember, len(input.BookingTypeIDs))
		for i, btID := range input.BookingTypeIDs {
			members[i] = model.BookingTypeGroupMember{
				GroupID:       id,
				BookingTypeID: btID,
				SortOrder:     i,
			}
		}
		if err := s.repo.SetMembers(ctx, id, members); err != nil {
			return nil, err
		}
	}

	return g, nil
}

// Delete deletes a booking type group by ID.
func (s *BookingTypeGroupService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrBookingTypeGroupNotFound
	}
	return s.repo.Delete(ctx, id)
}

// List retrieves all booking type groups for a tenant.
func (s *BookingTypeGroupService) List(ctx context.Context, tenantID uuid.UUID) ([]model.BookingTypeGroup, error) {
	return s.repo.List(ctx, tenantID)
}

// ListMembers retrieves the booking types that belong to a group, ordered by sort_order.
func (s *BookingTypeGroupService) ListMembers(ctx context.Context, groupID uuid.UUID) ([]model.BookingType, error) {
	return s.repo.ListMemberBookingTypes(ctx, groupID)
}
