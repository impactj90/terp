package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrContactKindNotFound     = errors.New("contact kind not found")
	ErrContactKindCodeRequired = errors.New("contact kind code is required")
	ErrContactKindLabelReq     = errors.New("contact kind label is required")
	ErrContactKindCodeExists   = errors.New("contact kind code already exists for this tenant")
	ErrContactKindTypeIDReq    = errors.New("contact type ID is required")
	ErrContactKindTypeNotFound = errors.New("contact type not found for this kind")
)

// contactKindRepository defines the interface for contact kind data access.
type contactKindRepository interface {
	Create(ctx context.Context, ck *model.ContactKind) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.ContactKind, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.ContactKind, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.ContactKind, error)
	ListByContactType(ctx context.Context, tenantID uuid.UUID, contactTypeID uuid.UUID) ([]model.ContactKind, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.ContactKind, error)
	Update(ctx context.Context, ck *model.ContactKind) error
	Delete(ctx context.Context, id uuid.UUID) error
}

type ContactKindService struct {
	repo       contactKindRepository
	typeRepo   contactTypeRepository
}

func NewContactKindService(repo contactKindRepository, typeRepo contactTypeRepository) *ContactKindService {
	return &ContactKindService{repo: repo, typeRepo: typeRepo}
}

// CreateContactKindInput represents the input for creating a contact kind.
type CreateContactKindInput struct {
	TenantID      uuid.UUID
	ContactTypeID uuid.UUID
	Code          string
	Label         string
	SortOrder     *int
}

// Create creates a new contact kind with validation.
func (s *ContactKindService) Create(ctx context.Context, input CreateContactKindInput) (*model.ContactKind, error) {
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrContactKindCodeRequired
	}
	label := strings.TrimSpace(input.Label)
	if label == "" {
		return nil, ErrContactKindLabelReq
	}
	if input.ContactTypeID == uuid.Nil {
		return nil, ErrContactKindTypeIDReq
	}

	// Verify contact type exists
	_, err := s.typeRepo.GetByID(ctx, input.ContactTypeID)
	if err != nil {
		return nil, ErrContactKindTypeNotFound
	}

	// Check uniqueness within tenant
	existing, err := s.repo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrContactKindCodeExists
	}

	ck := &model.ContactKind{
		TenantID:      input.TenantID,
		ContactTypeID: input.ContactTypeID,
		Code:          code,
		Label:         label,
		IsActive:      true,
	}
	if input.SortOrder != nil {
		ck.SortOrder = *input.SortOrder
	}

	if err := s.repo.Create(ctx, ck); err != nil {
		return nil, err
	}
	return ck, nil
}

// GetByID retrieves a contact kind by ID.
func (s *ContactKindService) GetByID(ctx context.Context, id uuid.UUID) (*model.ContactKind, error) {
	ck, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrContactKindNotFound
	}
	return ck, nil
}

// UpdateContactKindInput represents the input for updating a contact kind.
type UpdateContactKindInput struct {
	Label     *string
	IsActive  *bool
	SortOrder *int
}

// Update updates a contact kind. Code and contact_type_id cannot be changed.
func (s *ContactKindService) Update(ctx context.Context, id uuid.UUID, input UpdateContactKindInput) (*model.ContactKind, error) {
	ck, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrContactKindNotFound
	}

	if input.Label != nil {
		label := strings.TrimSpace(*input.Label)
		if label == "" {
			return nil, ErrContactKindLabelReq
		}
		ck.Label = label
	}
	if input.IsActive != nil {
		ck.IsActive = *input.IsActive
	}
	if input.SortOrder != nil {
		ck.SortOrder = *input.SortOrder
	}

	if err := s.repo.Update(ctx, ck); err != nil {
		return nil, err
	}
	return ck, nil
}

// Delete deletes a contact kind by ID.
func (s *ContactKindService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrContactKindNotFound
	}
	return s.repo.Delete(ctx, id)
}

// List retrieves all contact kinds for a tenant.
func (s *ContactKindService) List(ctx context.Context, tenantID uuid.UUID) ([]model.ContactKind, error) {
	return s.repo.List(ctx, tenantID)
}

// ListByContactType retrieves contact kinds for a specific contact type.
func (s *ContactKindService) ListByContactType(ctx context.Context, tenantID uuid.UUID, contactTypeID uuid.UUID) ([]model.ContactKind, error) {
	return s.repo.ListByContactType(ctx, tenantID, contactTypeID)
}

// ListActive retrieves active contact kinds for a tenant.
func (s *ContactKindService) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.ContactKind, error) {
	return s.repo.ListActive(ctx, tenantID)
}
