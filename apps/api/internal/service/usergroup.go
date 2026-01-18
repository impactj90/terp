package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrUserGroupNotFound       = errors.New("user group not found")
	ErrUserGroupNameRequired   = errors.New("user group name is required")
	ErrUserGroupNameExists     = errors.New("user group with this name already exists")
	ErrCannotDeleteSystemGroup = errors.New("cannot delete system group")
	ErrCannotModifySystemGroup = errors.New("cannot modify system group")
)

// userGroupRepository defines the interface for user group data access.
type userGroupRepository interface {
	Create(ctx context.Context, ug *model.UserGroup) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.UserGroup, error)
	GetByName(ctx context.Context, tenantID uuid.UUID, name string) (*model.UserGroup, error)
	Update(ctx context.Context, ug *model.UserGroup) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, tenantID uuid.UUID) ([]model.UserGroup, error)
}

type UserGroupService struct {
	userGroupRepo userGroupRepository
}

func NewUserGroupService(userGroupRepo userGroupRepository) *UserGroupService {
	return &UserGroupService{userGroupRepo: userGroupRepo}
}

// CreateUserGroupInput represents the input for creating a user group.
type CreateUserGroupInput struct {
	TenantID    uuid.UUID
	Name        string
	Description string
	Permissions []string
	IsAdmin     bool
}

// Create creates a new user group with validation.
func (s *UserGroupService) Create(ctx context.Context, input CreateUserGroupInput) (*model.UserGroup, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrUserGroupNameRequired
	}

	// Check if name already exists for this tenant
	existing, err := s.userGroupRepo.GetByName(ctx, input.TenantID, name)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, ErrUserGroupNameExists
	}

	// Convert permissions to JSON
	permissionsJSON, err := permissionsToJSON(input.Permissions)
	if err != nil {
		return nil, err
	}

	ug := &model.UserGroup{
		TenantID:    input.TenantID,
		Name:        name,
		Description: strings.TrimSpace(input.Description),
		Permissions: permissionsJSON,
		IsAdmin:     input.IsAdmin,
		IsSystem:    false,
	}

	if err := s.userGroupRepo.Create(ctx, ug); err != nil {
		return nil, err
	}

	return ug, nil
}

// GetByID retrieves a user group by ID.
func (s *UserGroupService) GetByID(ctx context.Context, id uuid.UUID) (*model.UserGroup, error) {
	ug, err := s.userGroupRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrUserGroupNotFound
	}
	return ug, nil
}

// UpdateUserGroupInput represents the input for updating a user group.
type UpdateUserGroupInput struct {
	Name        *string
	Description *string
	Permissions *[]string
	IsAdmin     *bool
}

// Update updates a user group.
func (s *UserGroupService) Update(ctx context.Context, id uuid.UUID, input UpdateUserGroupInput) (*model.UserGroup, error) {
	ug, err := s.userGroupRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrUserGroupNotFound
	}

	// System groups cannot be modified
	if ug.IsSystem {
		return nil, ErrCannotModifySystemGroup
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrUserGroupNameRequired
		}
		// Check if new name conflicts with existing group
		if name != ug.Name {
			existing, err := s.userGroupRepo.GetByName(ctx, ug.TenantID, name)
			if err != nil {
				return nil, err
			}
			if existing != nil {
				return nil, ErrUserGroupNameExists
			}
		}
		ug.Name = name
	}

	if input.Description != nil {
		ug.Description = strings.TrimSpace(*input.Description)
	}

	if input.Permissions != nil {
		permissionsJSON, err := permissionsToJSON(*input.Permissions)
		if err != nil {
			return nil, err
		}
		ug.Permissions = permissionsJSON
	}

	if input.IsAdmin != nil {
		ug.IsAdmin = *input.IsAdmin
	}

	if err := s.userGroupRepo.Update(ctx, ug); err != nil {
		return nil, err
	}

	return ug, nil
}

// Delete deletes a user group by ID.
func (s *UserGroupService) Delete(ctx context.Context, id uuid.UUID) error {
	ug, err := s.userGroupRepo.GetByID(ctx, id)
	if err != nil {
		return ErrUserGroupNotFound
	}

	// System groups cannot be deleted
	if ug.IsSystem {
		return ErrCannotDeleteSystemGroup
	}

	return s.userGroupRepo.Delete(ctx, id)
}

// List retrieves all user groups for a tenant.
func (s *UserGroupService) List(ctx context.Context, tenantID uuid.UUID) ([]model.UserGroup, error) {
	return s.userGroupRepo.List(ctx, tenantID)
}

// GetByName retrieves a user group by name for a tenant.
func (s *UserGroupService) GetByName(ctx context.Context, tenantID uuid.UUID, name string) (*model.UserGroup, error) {
	return s.userGroupRepo.GetByName(ctx, tenantID, name)
}

// permissionsToJSON converts a slice of permission strings to JSON.
func permissionsToJSON(permissions []string) ([]byte, error) {
	if len(permissions) == 0 {
		return []byte("[]"), nil
	}
	return json.Marshal(permissions)
}
