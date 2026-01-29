package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrGroupNotFound    = errors.New("group not found")
	ErrGroupCodeRequired = errors.New("group code is required")
	ErrGroupNameRequired = errors.New("group name is required")
	ErrGroupCodeExists   = errors.New("group code already exists for this tenant")
)

// groupRepo defines the interface for a single group type's data access.
type employeeGroupRepository interface {
	Create(ctx context.Context, group *model.EmployeeGroup) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.EmployeeGroup, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.EmployeeGroup, error)
	Update(ctx context.Context, group *model.EmployeeGroup) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, tenantID uuid.UUID) ([]model.EmployeeGroup, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.EmployeeGroup, error)
}

type workflowGroupRepository interface {
	Create(ctx context.Context, group *model.WorkflowGroup) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.WorkflowGroup, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.WorkflowGroup, error)
	Update(ctx context.Context, group *model.WorkflowGroup) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, tenantID uuid.UUID) ([]model.WorkflowGroup, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.WorkflowGroup, error)
}

type activityGroupRepository interface {
	Create(ctx context.Context, group *model.ActivityGroup) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.ActivityGroup, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.ActivityGroup, error)
	Update(ctx context.Context, group *model.ActivityGroup) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, tenantID uuid.UUID) ([]model.ActivityGroup, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.ActivityGroup, error)
}

// GroupService provides business logic for all group types.
type GroupService struct {
	employeeGroupRepo employeeGroupRepository
	workflowGroupRepo workflowGroupRepository
	activityGroupRepo activityGroupRepository
}

// NewGroupService creates a new GroupService.
func NewGroupService(
	employeeGroupRepo employeeGroupRepository,
	workflowGroupRepo workflowGroupRepository,
	activityGroupRepo activityGroupRepository,
) *GroupService {
	return &GroupService{
		employeeGroupRepo: employeeGroupRepo,
		workflowGroupRepo: workflowGroupRepo,
		activityGroupRepo: activityGroupRepo,
	}
}

// CreateGroupInput is the input for creating any group type.
type CreateGroupInput struct {
	TenantID    uuid.UUID
	Code        string
	Name        string
	Description string
	IsActive    bool
}

// UpdateGroupInput is the input for updating any group type.
type UpdateGroupInput struct {
	Code        *string
	Name        *string
	Description *string
	IsActive    *bool
}

// ---- Employee Group ----

func (s *GroupService) ListEmployeeGroups(ctx context.Context, tenantID uuid.UUID) ([]model.EmployeeGroup, error) {
	return s.employeeGroupRepo.List(ctx, tenantID)
}

func (s *GroupService) GetEmployeeGroup(ctx context.Context, id uuid.UUID) (*model.EmployeeGroup, error) {
	g, err := s.employeeGroupRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrGroupNotFound
	}
	return g, nil
}

func (s *GroupService) CreateEmployeeGroup(ctx context.Context, input CreateGroupInput) (*model.EmployeeGroup, error) {
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrGroupCodeRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrGroupNameRequired
	}
	existing, err := s.employeeGroupRepo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrGroupCodeExists
	}

	g := &model.EmployeeGroup{
		TenantID:    input.TenantID,
		Code:        code,
		Name:        name,
		Description: strings.TrimSpace(input.Description),
		IsActive:    input.IsActive,
	}
	if err := s.employeeGroupRepo.Create(ctx, g); err != nil {
		return nil, err
	}
	return g, nil
}

func (s *GroupService) UpdateEmployeeGroup(ctx context.Context, id uuid.UUID, input UpdateGroupInput) (*model.EmployeeGroup, error) {
	g, err := s.employeeGroupRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrGroupNotFound
	}
	if input.Code != nil {
		code := strings.TrimSpace(*input.Code)
		if code == "" {
			return nil, ErrGroupCodeRequired
		}
		existing, err := s.employeeGroupRepo.GetByCode(ctx, g.TenantID, code)
		if err == nil && existing != nil && existing.ID != id {
			return nil, ErrGroupCodeExists
		}
		g.Code = code
	}
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrGroupNameRequired
		}
		g.Name = name
	}
	if input.Description != nil {
		g.Description = strings.TrimSpace(*input.Description)
	}
	if input.IsActive != nil {
		g.IsActive = *input.IsActive
	}
	if err := s.employeeGroupRepo.Update(ctx, g); err != nil {
		return nil, err
	}
	return g, nil
}

func (s *GroupService) DeleteEmployeeGroup(ctx context.Context, id uuid.UUID) error {
	_, err := s.employeeGroupRepo.GetByID(ctx, id)
	if err != nil {
		return ErrGroupNotFound
	}
	return s.employeeGroupRepo.Delete(ctx, id)
}

// ---- Workflow Group ----

func (s *GroupService) ListWorkflowGroups(ctx context.Context, tenantID uuid.UUID) ([]model.WorkflowGroup, error) {
	return s.workflowGroupRepo.List(ctx, tenantID)
}

func (s *GroupService) GetWorkflowGroup(ctx context.Context, id uuid.UUID) (*model.WorkflowGroup, error) {
	g, err := s.workflowGroupRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrGroupNotFound
	}
	return g, nil
}

func (s *GroupService) CreateWorkflowGroup(ctx context.Context, input CreateGroupInput) (*model.WorkflowGroup, error) {
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrGroupCodeRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrGroupNameRequired
	}
	existing, err := s.workflowGroupRepo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrGroupCodeExists
	}

	g := &model.WorkflowGroup{
		TenantID:    input.TenantID,
		Code:        code,
		Name:        name,
		Description: strings.TrimSpace(input.Description),
		IsActive:    input.IsActive,
	}
	if err := s.workflowGroupRepo.Create(ctx, g); err != nil {
		return nil, err
	}
	return g, nil
}

func (s *GroupService) UpdateWorkflowGroup(ctx context.Context, id uuid.UUID, input UpdateGroupInput) (*model.WorkflowGroup, error) {
	g, err := s.workflowGroupRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrGroupNotFound
	}
	if input.Code != nil {
		code := strings.TrimSpace(*input.Code)
		if code == "" {
			return nil, ErrGroupCodeRequired
		}
		existing, err := s.workflowGroupRepo.GetByCode(ctx, g.TenantID, code)
		if err == nil && existing != nil && existing.ID != id {
			return nil, ErrGroupCodeExists
		}
		g.Code = code
	}
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrGroupNameRequired
		}
		g.Name = name
	}
	if input.Description != nil {
		g.Description = strings.TrimSpace(*input.Description)
	}
	if input.IsActive != nil {
		g.IsActive = *input.IsActive
	}
	if err := s.workflowGroupRepo.Update(ctx, g); err != nil {
		return nil, err
	}
	return g, nil
}

func (s *GroupService) DeleteWorkflowGroup(ctx context.Context, id uuid.UUID) error {
	_, err := s.workflowGroupRepo.GetByID(ctx, id)
	if err != nil {
		return ErrGroupNotFound
	}
	return s.workflowGroupRepo.Delete(ctx, id)
}

// ---- Activity Group ----

func (s *GroupService) ListActivityGroups(ctx context.Context, tenantID uuid.UUID) ([]model.ActivityGroup, error) {
	return s.activityGroupRepo.List(ctx, tenantID)
}

func (s *GroupService) GetActivityGroup(ctx context.Context, id uuid.UUID) (*model.ActivityGroup, error) {
	g, err := s.activityGroupRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrGroupNotFound
	}
	return g, nil
}

func (s *GroupService) CreateActivityGroup(ctx context.Context, input CreateGroupInput) (*model.ActivityGroup, error) {
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrGroupCodeRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrGroupNameRequired
	}
	existing, err := s.activityGroupRepo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrGroupCodeExists
	}

	g := &model.ActivityGroup{
		TenantID:    input.TenantID,
		Code:        code,
		Name:        name,
		Description: strings.TrimSpace(input.Description),
		IsActive:    input.IsActive,
	}
	if err := s.activityGroupRepo.Create(ctx, g); err != nil {
		return nil, err
	}
	return g, nil
}

func (s *GroupService) UpdateActivityGroup(ctx context.Context, id uuid.UUID, input UpdateGroupInput) (*model.ActivityGroup, error) {
	g, err := s.activityGroupRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrGroupNotFound
	}
	if input.Code != nil {
		code := strings.TrimSpace(*input.Code)
		if code == "" {
			return nil, ErrGroupCodeRequired
		}
		existing, err := s.activityGroupRepo.GetByCode(ctx, g.TenantID, code)
		if err == nil && existing != nil && existing.ID != id {
			return nil, ErrGroupCodeExists
		}
		g.Code = code
	}
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrGroupNameRequired
		}
		g.Name = name
	}
	if input.Description != nil {
		g.Description = strings.TrimSpace(*input.Description)
	}
	if input.IsActive != nil {
		g.IsActive = *input.IsActive
	}
	if err := s.activityGroupRepo.Update(ctx, g); err != nil {
		return nil, err
	}
	return g, nil
}

func (s *GroupService) DeleteActivityGroup(ctx context.Context, id uuid.UUID) error {
	_, err := s.activityGroupRepo.GetByID(ctx, id)
	if err != nil {
		return ErrGroupNotFound
	}
	return s.activityGroupRepo.Delete(ctx, id)
}
