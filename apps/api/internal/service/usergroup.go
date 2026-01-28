package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/permissions"
)

var (
	ErrUserGroupNotFound       = errors.New("user group not found")
	ErrUserGroupNameRequired   = errors.New("user group name is required")
	ErrUserGroupNameExists     = errors.New("user group with this name already exists")
	ErrUserGroupCodeRequired   = errors.New("user group code is required")
	ErrUserGroupCodeExists     = errors.New("user group code already exists for this tenant")
	ErrCannotDeleteSystemGroup = errors.New("cannot delete system group")
	ErrCannotModifySystemGroup = errors.New("cannot modify system group")
	ErrInvalidPermissionID     = errors.New("invalid permission id")
)

// userGroupRepositoryForService defines the interface for user group data access.
type userGroupRepositoryForService interface {
	Create(ctx context.Context, ug *model.UserGroup) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.UserGroup, error)
	GetByName(ctx context.Context, tenantID uuid.UUID, name string) (*model.UserGroup, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.UserGroup, error)
	Update(ctx context.Context, ug *model.UserGroup) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, tenantID uuid.UUID) ([]model.UserGroup, error)
	ListByActive(ctx context.Context, tenantID uuid.UUID, isActive bool) ([]model.UserGroup, error)
}

type userRepository interface {
	UpdateRoleByGroup(ctx context.Context, groupID uuid.UUID, role model.UserRole) error
}

type UserGroupService struct {
	userGroupRepo userGroupRepositoryForService
	userRepo      userRepository
}

func NewUserGroupService(userGroupRepo userGroupRepositoryForService, userRepo userRepository) *UserGroupService {
	return &UserGroupService{userGroupRepo: userGroupRepo, userRepo: userRepo}
}

// CreateUserGroupInput represents the input for creating a user group.
type CreateUserGroupInput struct {
	TenantID    uuid.UUID
	Name        string
	Code        string
	Description string
	Permissions []string
	IsAdmin     bool
	IsActive    bool
}

// Create creates a new user group with validation.
func (s *UserGroupService) Create(ctx context.Context, input CreateUserGroupInput) (*model.UserGroup, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrUserGroupNameRequired
	}

	code := strings.ToUpper(strings.TrimSpace(input.Code))
	if code == "" {
		code = strings.ToUpper(strings.TrimSpace(input.Name))
	}
	if code == "" {
		return nil, ErrUserGroupCodeRequired
	}

	// Check if name already exists for this tenant
	existing, err := s.userGroupRepo.GetByName(ctx, input.TenantID, name)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, ErrUserGroupNameExists
	}

	existing, err = s.userGroupRepo.GetByCode(ctx, input.TenantID, code)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, ErrUserGroupCodeExists
	}

	// Convert permissions to JSON
	if err := validatePermissionIDs(input.Permissions); err != nil {
		return nil, err
	}
	permissionsJSON, err := permissionsToJSON(input.Permissions)
	if err != nil {
		return nil, err
	}

	isActive := input.IsActive
	if !input.IsActive {
		isActive = true
	}

	ug := &model.UserGroup{
		TenantID:    input.TenantID,
		Name:        name,
		Code:        code,
		Description: strings.TrimSpace(input.Description),
		Permissions: permissionsJSON,
		IsAdmin:     input.IsAdmin,
		IsSystem:    false,
		IsActive:    isActive,
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
	Code        *string
	Description *string
	Permissions *[]string
	IsAdmin     *bool
	IsActive    *bool
}

// Update updates a user group.
func (s *UserGroupService) Update(ctx context.Context, id uuid.UUID, input UpdateUserGroupInput) (*model.UserGroup, error) {
	ug, err := s.userGroupRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrUserGroupNotFound
	}

	previousIsAdmin := ug.IsAdmin

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

	if input.Code != nil {
		code := strings.ToUpper(strings.TrimSpace(*input.Code))
		if code == "" {
			return nil, ErrUserGroupCodeRequired
		}
		if code != ug.Code {
			existing, err := s.userGroupRepo.GetByCode(ctx, ug.TenantID, code)
			if err != nil {
				return nil, err
			}
			if existing != nil {
				return nil, ErrUserGroupCodeExists
			}
		}
		ug.Code = code
	}

	if input.Description != nil {
		ug.Description = strings.TrimSpace(*input.Description)
	}

	if input.Permissions != nil {
		if err := validatePermissionIDs(*input.Permissions); err != nil {
			return nil, err
		}
		permissionsJSON, err := permissionsToJSON(*input.Permissions)
		if err != nil {
			return nil, err
		}
		ug.Permissions = permissionsJSON
	}

	if input.IsAdmin != nil {
		ug.IsAdmin = *input.IsAdmin
	}

	if input.IsActive != nil {
		ug.IsActive = *input.IsActive
	}

	if err := s.userGroupRepo.Update(ctx, ug); err != nil {
		return nil, err
	}

	if s.userRepo != nil && input.IsAdmin != nil && previousIsAdmin != ug.IsAdmin {
		role := model.RoleUser
		if ug.IsAdmin {
			role = model.RoleAdmin
		}
		if err := s.userRepo.UpdateRoleByGroup(ctx, ug.ID, role); err != nil {
			return nil, err
		}
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
func (s *UserGroupService) List(ctx context.Context, tenantID uuid.UUID, active *bool) ([]model.UserGroup, error) {
	if active != nil {
		return s.userGroupRepo.ListByActive(ctx, tenantID, *active)
	}
	return s.userGroupRepo.List(ctx, tenantID)
}

// GetByName retrieves a user group by name for a tenant.
func (s *UserGroupService) GetByName(ctx context.Context, tenantID uuid.UUID, name string) (*model.UserGroup, error) {
	return s.userGroupRepo.GetByName(ctx, tenantID, name)
}

// GetByCode retrieves a user group by code for a tenant.
func (s *UserGroupService) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.UserGroup, error) {
	return s.userGroupRepo.GetByCode(ctx, tenantID, code)
}

// permissionsToJSON converts a slice of permission strings to JSON.
func permissionsToJSON(permissions []string) ([]byte, error) {
	if len(permissions) == 0 {
		return []byte("[]"), nil
	}
	return json.Marshal(permissions)
}

func validatePermissionIDs(ids []string) error {
	for _, id := range ids {
		if _, ok := permissions.Lookup(id); !ok {
			return ErrInvalidPermissionID
		}
	}
	return nil
}
