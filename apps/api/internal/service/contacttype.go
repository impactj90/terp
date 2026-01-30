package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

// Allowed data_type values for contact types.
var validDataTypes = map[string]bool{
	"text":  true,
	"email": true,
	"phone": true,
	"url":   true,
}

var (
	ErrContactTypeNotFound     = errors.New("contact type not found")
	ErrContactTypeCodeRequired = errors.New("contact type code is required")
	ErrContactTypeNameRequired = errors.New("contact type name is required")
	ErrContactTypeCodeExists   = errors.New("contact type code already exists for this tenant")
	ErrContactTypeInvalidData  = errors.New("invalid data type: must be text, email, phone, or url")
	ErrContactTypeInUse        = errors.New("contact type is in use by contact kinds and cannot be deleted")
	ErrContactTypeDataTypeReq  = errors.New("contact type data_type is required")
)

// contactTypeRepository defines the interface for contact type data access.
type contactTypeRepository interface {
	Create(ctx context.Context, ct *model.ContactType) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.ContactType, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.ContactType, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.ContactType, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.ContactType, error)
	Update(ctx context.Context, ct *model.ContactType) error
	Delete(ctx context.Context, id uuid.UUID) error
	HasKinds(ctx context.Context, contactTypeID uuid.UUID) (bool, error)
}

type ContactTypeService struct {
	repo contactTypeRepository
}

func NewContactTypeService(repo contactTypeRepository) *ContactTypeService {
	return &ContactTypeService{repo: repo}
}

// CreateContactTypeInput represents the input for creating a contact type.
type CreateContactTypeInput struct {
	TenantID    uuid.UUID
	Code        string
	Name        string
	DataType    string
	Description string
	SortOrder   *int
}

// Create creates a new contact type with validation.
func (s *ContactTypeService) Create(ctx context.Context, input CreateContactTypeInput) (*model.ContactType, error) {
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrContactTypeCodeRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrContactTypeNameRequired
	}
	dataType := strings.TrimSpace(input.DataType)
	if dataType == "" {
		return nil, ErrContactTypeDataTypeReq
	}
	if !validDataTypes[dataType] {
		return nil, ErrContactTypeInvalidData
	}

	// Check uniqueness within tenant
	existing, err := s.repo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrContactTypeCodeExists
	}

	ct := &model.ContactType{
		TenantID:    input.TenantID,
		Code:        code,
		Name:        name,
		DataType:    dataType,
		Description: strings.TrimSpace(input.Description),
		IsActive:    true,
	}
	if input.SortOrder != nil {
		ct.SortOrder = *input.SortOrder
	}

	if err := s.repo.Create(ctx, ct); err != nil {
		return nil, err
	}
	return ct, nil
}

// GetByID retrieves a contact type by ID.
func (s *ContactTypeService) GetByID(ctx context.Context, id uuid.UUID) (*model.ContactType, error) {
	ct, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrContactTypeNotFound
	}
	return ct, nil
}

// UpdateContactTypeInput represents the input for updating a contact type.
type UpdateContactTypeInput struct {
	Name        *string
	Description *string
	IsActive    *bool
	SortOrder   *int
}

// Update updates a contact type. Code and data_type cannot be changed.
func (s *ContactTypeService) Update(ctx context.Context, id uuid.UUID, input UpdateContactTypeInput) (*model.ContactType, error) {
	ct, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrContactTypeNotFound
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrContactTypeNameRequired
		}
		ct.Name = name
	}
	if input.Description != nil {
		ct.Description = strings.TrimSpace(*input.Description)
	}
	if input.IsActive != nil {
		ct.IsActive = *input.IsActive
	}
	if input.SortOrder != nil {
		ct.SortOrder = *input.SortOrder
	}

	if err := s.repo.Update(ctx, ct); err != nil {
		return nil, err
	}
	return ct, nil
}

// Delete deletes a contact type by ID. Fails if contact kinds reference it.
func (s *ContactTypeService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrContactTypeNotFound
	}

	hasKinds, err := s.repo.HasKinds(ctx, id)
	if err != nil {
		return err
	}
	if hasKinds {
		return ErrContactTypeInUse
	}

	return s.repo.Delete(ctx, id)
}

// List retrieves all contact types for a tenant.
func (s *ContactTypeService) List(ctx context.Context, tenantID uuid.UUID) ([]model.ContactType, error) {
	return s.repo.List(ctx, tenantID)
}

// ListActive retrieves active contact types for a tenant.
func (s *ContactTypeService) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.ContactType, error) {
	return s.repo.ListActive(ctx, tenantID)
}
