package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrAbsenceTypeGroupNotFound     = errors.New("absence type group not found")
	ErrAbsenceTypeGroupCodeRequired = errors.New("absence type group code is required")
	ErrAbsenceTypeGroupNameRequired = errors.New("absence type group name is required")
	ErrAbsenceTypeGroupCodeExists   = errors.New("absence type group code already exists for this tenant")
)

type absenceTypeGroupRepository interface {
	Create(ctx context.Context, g *model.AbsenceTypeGroup) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceTypeGroup, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.AbsenceTypeGroup, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.AbsenceTypeGroup, error)
	Update(ctx context.Context, g *model.AbsenceTypeGroup) error
	Delete(ctx context.Context, id uuid.UUID) error
}

type AbsenceTypeGroupService struct {
	repo absenceTypeGroupRepository
}

func NewAbsenceTypeGroupService(repo absenceTypeGroupRepository) *AbsenceTypeGroupService {
	return &AbsenceTypeGroupService{repo: repo}
}

func (s *AbsenceTypeGroupService) List(ctx context.Context, tenantID uuid.UUID) ([]model.AbsenceTypeGroup, error) {
	return s.repo.List(ctx, tenantID)
}

func (s *AbsenceTypeGroupService) GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceTypeGroup, error) {
	g, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrAbsenceTypeGroupNotFound
	}
	return g, nil
}

type CreateAbsenceTypeGroupInput struct {
	TenantID    uuid.UUID
	Code        string
	Name        string
	Description string
}

func (s *AbsenceTypeGroupService) Create(ctx context.Context, input CreateAbsenceTypeGroupInput) (*model.AbsenceTypeGroup, error) {
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrAbsenceTypeGroupCodeRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrAbsenceTypeGroupNameRequired
	}

	existing, err := s.repo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrAbsenceTypeGroupCodeExists
	}

	desc := strings.TrimSpace(input.Description)
	var descPtr *string
	if desc != "" {
		descPtr = &desc
	}

	g := &model.AbsenceTypeGroup{
		TenantID:    input.TenantID,
		Code:        code,
		Name:        name,
		Description: descPtr,
		IsActive:    true,
	}
	if err := s.repo.Create(ctx, g); err != nil {
		return nil, err
	}
	return g, nil
}

type UpdateAbsenceTypeGroupInput struct {
	Code        *string
	Name        *string
	Description *string
	IsActive    *bool
}

func (s *AbsenceTypeGroupService) Update(ctx context.Context, id uuid.UUID, input UpdateAbsenceTypeGroupInput) (*model.AbsenceTypeGroup, error) {
	g, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrAbsenceTypeGroupNotFound
	}

	if input.Code != nil {
		code := strings.TrimSpace(*input.Code)
		if code == "" {
			return nil, ErrAbsenceTypeGroupCodeRequired
		}
		existing, err := s.repo.GetByCode(ctx, g.TenantID, code)
		if err == nil && existing != nil && existing.ID != id {
			return nil, ErrAbsenceTypeGroupCodeExists
		}
		g.Code = code
	}
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrAbsenceTypeGroupNameRequired
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
	if input.IsActive != nil {
		g.IsActive = *input.IsActive
	}

	if err := s.repo.Update(ctx, g); err != nil {
		return nil, err
	}
	return g, nil
}

func (s *AbsenceTypeGroupService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrAbsenceTypeGroupNotFound
	}
	return s.repo.Delete(ctx, id)
}
