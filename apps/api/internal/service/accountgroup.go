package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrAccountGroupNotFound     = errors.New("account group not found")
	ErrAccountGroupCodeRequired = errors.New("account group code is required")
	ErrAccountGroupNameRequired = errors.New("account group name is required")
	ErrAccountGroupCodeExists   = errors.New("account group code already exists for this tenant")
)

type accountGroupRepository interface {
	Create(ctx context.Context, g *model.AccountGroup) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.AccountGroup, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.AccountGroup, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.AccountGroup, error)
	Update(ctx context.Context, g *model.AccountGroup) error
	Delete(ctx context.Context, id uuid.UUID) error
}

type AccountGroupService struct {
	repo accountGroupRepository
}

func NewAccountGroupService(repo accountGroupRepository) *AccountGroupService {
	return &AccountGroupService{repo: repo}
}

func (s *AccountGroupService) List(ctx context.Context, tenantID uuid.UUID) ([]model.AccountGroup, error) {
	return s.repo.List(ctx, tenantID)
}

func (s *AccountGroupService) GetByID(ctx context.Context, id uuid.UUID) (*model.AccountGroup, error) {
	g, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrAccountGroupNotFound
	}
	return g, nil
}

type CreateAccountGroupInput struct {
	TenantID    uuid.UUID
	Code        string
	Name        string
	Description string
	SortOrder   int
}

func (s *AccountGroupService) Create(ctx context.Context, input CreateAccountGroupInput) (*model.AccountGroup, error) {
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrAccountGroupCodeRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrAccountGroupNameRequired
	}

	existing, err := s.repo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrAccountGroupCodeExists
	}

	desc := strings.TrimSpace(input.Description)
	var descPtr *string
	if desc != "" {
		descPtr = &desc
	}

	g := &model.AccountGroup{
		TenantID:    input.TenantID,
		Code:        code,
		Name:        name,
		Description: descPtr,
		SortOrder:   input.SortOrder,
		IsActive:    true,
	}
	if err := s.repo.Create(ctx, g); err != nil {
		return nil, err
	}
	return g, nil
}

type UpdateAccountGroupInput struct {
	Code        *string
	Name        *string
	Description *string
	SortOrder   *int
	IsActive    *bool
}

func (s *AccountGroupService) Update(ctx context.Context, id uuid.UUID, input UpdateAccountGroupInput) (*model.AccountGroup, error) {
	g, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrAccountGroupNotFound
	}

	if input.Code != nil {
		code := strings.TrimSpace(*input.Code)
		if code == "" {
			return nil, ErrAccountGroupCodeRequired
		}
		existing, err := s.repo.GetByCode(ctx, g.TenantID, code)
		if err == nil && existing != nil && existing.ID != id {
			return nil, ErrAccountGroupCodeExists
		}
		g.Code = code
	}
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrAccountGroupNameRequired
		}
		g.Name = name
	}
	if input.Description != nil {
		desc := strings.TrimSpace(*input.Description)
		if desc != "" {
			g.Description = &desc
		} else {
			g.Description = nil
		}
	}
	if input.SortOrder != nil {
		g.SortOrder = *input.SortOrder
	}
	if input.IsActive != nil {
		g.IsActive = *input.IsActive
	}

	if err := s.repo.Update(ctx, g); err != nil {
		return nil, err
	}
	return g, nil
}

func (s *AccountGroupService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrAccountGroupNotFound
	}
	return s.repo.Delete(ctx, id)
}
