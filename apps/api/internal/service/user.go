package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

var (
	ErrUserNotFound           = errors.New("user not found")
	ErrPermissionDenied       = errors.New("permission denied")
	ErrInvalidCredentials     = errors.New("invalid credentials")
	ErrUserInactive           = errors.New("user inactive")
	ErrUserLocked             = errors.New("user locked")
	ErrPasswordNotSet         = errors.New("password not set")
	ErrPasswordRequired       = errors.New("password required")
	ErrInvalidCurrentPassword = errors.New("invalid current password")
	ErrInvalidDataScopeType   = errors.New("invalid data scope type")
)

// userTenantRepo defines the interface for user-tenant association data access.
type userTenantRepoForUser interface {
	AddUserToTenant(ctx context.Context, userID, tenantID uuid.UUID, role string) error
}

type UserService struct {
	userRepo        *repository.UserRepository
	userGroupRepo   userGroupLookupRepository
	notificationSvc *NotificationService
	userTenantRepo  userTenantRepoForUser
}

type userGroupLookupRepository interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.UserGroup, error)
}

type CreateUserInput struct {
	TenantID               *uuid.UUID
	Email                  string
	Username               *string
	DisplayName            string
	UserGroupID            *uuid.UUID
	EmployeeID             *uuid.UUID
	Password               *string
	SSOID                  *string
	IsActive               *bool
	IsLocked               *bool
	DataScopeType          *model.DataScopeType
	DataScopeTenantIDs     []string
	DataScopeDepartmentIDs []string
	DataScopeEmployeeIDs   []string
}

type ChangePasswordInput struct {
	RequesterID        uuid.UUID
	TargetID           uuid.UUID
	RequesterRole      string
	RequesterCanManage bool
	CurrentPassword    string
	NewPassword        string
}

func NewUserService(userRepo *repository.UserRepository, userGroupRepo userGroupLookupRepository) *UserService {
	return &UserService{userRepo: userRepo, userGroupRepo: userGroupRepo}
}

// SetNotificationService sets the notification service for user events.
func (s *UserService) SetNotificationService(notificationSvc *NotificationService) {
	s.notificationSvc = notificationSvc
}

// SetUserTenantRepo sets the user-tenant repository for auto-adding tenant access.
func (s *UserService) SetUserTenantRepo(repo userTenantRepoForUser) {
	s.userTenantRepo = repo
}

func normalizeScopeType(scope *model.DataScopeType) (model.DataScopeType, error) {
	if scope == nil || *scope == "" {
		return model.DataScopeAll, nil
	}
	switch *scope {
	case model.DataScopeAll, model.DataScopeTenant, model.DataScopeDepartment, model.DataScopeEmployee:
		return *scope, nil
	default:
		return "", ErrInvalidDataScopeType
	}
}

func hashPassword(password string) (string, error) {
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("failed to hash password: %w", err)
	}
	return string(hashed), nil
}

// GetByID retrieves a user by ID.
func (s *UserService) GetByID(ctx context.Context, id uuid.UUID) (*model.User, error) {
	user, err := s.userRepo.GetByID(ctx, id)
	if errors.Is(err, repository.ErrUserNotFound) {
		return nil, ErrUserNotFound
	}
	return user, err
}

// GetWithRelations retrieves a user with related entities.
func (s *UserService) GetWithRelations(ctx context.Context, id uuid.UUID) (*model.User, error) {
	user, err := s.userRepo.GetWithRelations(ctx, id)
	if errors.Is(err, repository.ErrUserNotFound) {
		return nil, ErrUserNotFound
	}
	return user, err
}

// GetByEmail retrieves a user by email within a tenant.
func (s *UserService) GetByEmail(ctx context.Context, tenantID uuid.UUID, email string) (*model.User, error) {
	user, err := s.userRepo.GetByEmail(ctx, tenantID, email)
	if errors.Is(err, repository.ErrUserNotFound) {
		return nil, ErrUserNotFound
	}
	return user, err
}

// Authenticate verifies credentials and returns the user on success.
func (s *UserService) Authenticate(ctx context.Context, tenantID uuid.UUID, email, password string) (*model.User, error) {
	if password == "" {
		return nil, ErrInvalidCredentials
	}

	user, err := s.userRepo.GetByEmail(ctx, tenantID, email)
	if errors.Is(err, repository.ErrUserNotFound) {
		return nil, ErrInvalidCredentials
	}
	if err != nil {
		return nil, err
	}

	if !user.IsActive {
		return nil, ErrUserInactive
	}
	if user.IsLocked {
		return nil, ErrUserLocked
	}
	if user.PasswordHash == nil || *user.PasswordHash == "" {
		return nil, ErrInvalidCredentials
	}

	if err := bcrypt.CompareHashAndPassword([]byte(*user.PasswordHash), []byte(password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	return user, nil
}

// AuthenticateByEmail verifies credentials without requiring a tenant ID (uses global email lookup).
func (s *UserService) AuthenticateByEmail(ctx context.Context, email, password string) (*model.User, error) {
	if password == "" {
		return nil, ErrInvalidCredentials
	}

	user, err := s.userRepo.FindByEmail(ctx, email)
	if errors.Is(err, repository.ErrUserNotFound) {
		return nil, ErrInvalidCredentials
	}
	if err != nil {
		return nil, err
	}

	if !user.IsActive {
		return nil, ErrUserInactive
	}
	if user.IsLocked {
		return nil, ErrUserLocked
	}
	if user.PasswordHash == nil || *user.PasswordHash == "" {
		return nil, ErrInvalidCredentials
	}

	if err := bcrypt.CompareHashAndPassword([]byte(*user.PasswordHash), []byte(password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	return user, nil
}

// List retrieves users with filtering.
func (s *UserService) List(ctx context.Context, params repository.ListUsersParams) ([]model.User, int64, error) {
	users, err := s.userRepo.List(ctx, params)
	if err != nil {
		return nil, 0, err
	}

	count, err := s.userRepo.Count(ctx, params)
	if err != nil {
		return nil, 0, err
	}

	return users, count, nil
}

// Update updates a user (only own profile or admin).
func (s *UserService) Update(
	ctx context.Context,
	requesterID,
	targetID uuid.UUID,
	requesterRole string,
	requesterCanManage bool,
	updates map[string]any,
) (*model.User, error) {
	// Check permissions
	if requesterID != targetID && !requesterCanManage && requesterRole != string(model.RoleAdmin) {
		return nil, ErrPermissionDenied
	}

	user, err := s.userRepo.GetByID(ctx, targetID)
	if errors.Is(err, repository.ErrUserNotFound) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}

	requiresAdmin := false
	for _, field := range []string{
		"user_group_id",
		"is_active",
		"is_locked",
		"data_scope_type",
		"data_scope_tenant_ids",
		"data_scope_department_ids",
		"data_scope_employee_ids",
		"sso_id",
		"employee_id",
		"username",
	} {
		if _, ok := updates[field]; ok {
			requiresAdmin = true
			break
		}
	}
	if requiresAdmin && !requesterCanManage && requesterRole != string(model.RoleAdmin) {
		return nil, ErrPermissionDenied
	}

	// Apply allowed updates
	previousDisplayName := user.DisplayName
	if name, ok := updates["display_name"].(string); ok && name != "" {
		user.DisplayName = name
	}
	if avatarValue, ok := updates["avatar_url"]; ok {
		if avatarValue == nil {
			user.AvatarURL = nil
		} else if avatar, ok := avatarValue.(string); ok {
			user.AvatarURL = &avatar
		}
	}
	if groupValue, ok := updates["user_group_id"]; ok {
		if groupValue == nil {
			user.UserGroupID = nil
			user.Role = model.RoleUser
		} else if groupID, ok := groupValue.(uuid.UUID); ok {
			if s.userGroupRepo == nil {
				return nil, errors.New("user group repository not configured")
			}
			group, err := s.userGroupRepo.GetByID(ctx, groupID)
			if err != nil {
				return nil, ErrUserGroupNotFound
			}
			user.UserGroupID = &group.ID
			if group.IsAdmin {
				user.Role = model.RoleAdmin
			} else {
				user.Role = model.RoleUser
			}
		}
	}
	if username, ok := updates["username"].(string); ok {
		if username == "" {
			user.Username = nil
		} else {
			user.Username = &username
		}
	}
	if employeeValue, ok := updates["employee_id"]; ok {
		if employeeValue == nil {
			user.EmployeeID = nil
		} else if empID, ok := employeeValue.(uuid.UUID); ok {
			user.EmployeeID = &empID
		}
	}
	if isActive, ok := updates["is_active"].(bool); ok {
		user.IsActive = isActive
	}
	if isLocked, ok := updates["is_locked"].(bool); ok {
		user.IsLocked = isLocked
	}
	if ssoValue, ok := updates["sso_id"]; ok {
		if ssoValue == nil {
			user.SSOID = nil
		} else if ssoID, ok := ssoValue.(string); ok {
			user.SSOID = &ssoID
		}
	}
	if scopeValue, ok := updates["data_scope_type"].(string); ok {
		scopeType := model.DataScopeType(scopeValue)
		parsed, err := normalizeScopeType(&scopeType)
		if err != nil {
			return nil, err
		}
		user.DataScopeType = parsed
	}
	if tenantIDs, ok := updates["data_scope_tenant_ids"].([]string); ok {
		user.DataScopeTenantIDs = pq.StringArray(tenantIDs)
	}
	if deptIDs, ok := updates["data_scope_department_ids"].([]string); ok {
		user.DataScopeDepartmentIDs = pq.StringArray(deptIDs)
	}
	if employeeIDs, ok := updates["data_scope_employee_ids"].([]string); ok {
		user.DataScopeEmployeeIDs = pq.StringArray(employeeIDs)
	}

	if err := s.userRepo.Update(ctx, user); err != nil {
		return nil, err
	}

	if s.notificationSvc != nil && user.TenantID != nil && previousDisplayName != user.DisplayName {
		link := "/profile"
		_, _ = s.notificationSvc.Create(ctx, CreateNotificationInput{
			TenantID: *user.TenantID,
			UserID:   user.ID,
			Type:     model.NotificationTypeSystem,
			Title:    "Profile updated",
			Message:  "Your display name was updated.",
			Link:     &link,
		})
	}

	return user, nil
}

// Delete deletes a user (admin only).
func (s *UserService) Delete(
	ctx context.Context,
	requesterID,
	targetID uuid.UUID,
	requesterRole string,
	requesterCanManage bool,
) error {
	// Only admin can delete users
	if !requesterCanManage && requesterRole != string(model.RoleAdmin) {
		return ErrPermissionDenied
	}

	// Cannot delete yourself
	if requesterID == targetID {
		return ErrPermissionDenied
	}

	err := s.userRepo.Delete(ctx, targetID)
	if errors.Is(err, repository.ErrUserNotFound) {
		return ErrUserNotFound
	}
	return err
}

// UpsertDevUser ensures a dev user exists in the database.
func (s *UserService) UpsertDevUser(ctx context.Context, id uuid.UUID, tenantID uuid.UUID, email, displayName string, role model.UserRole) error {
	user := &model.User{
		TenantID:    &tenantID,
		Email:       email,
		DisplayName: displayName,
		Role:        role,
	}
	user.ID = id
	return s.userRepo.Upsert(ctx, user)
}

// CreateUser creates a new user with full configuration.
func (s *UserService) CreateUser(ctx context.Context, input CreateUserInput) (*model.User, error) {
	user := &model.User{
		Email:       input.Email,
		DisplayName: input.DisplayName,
		Role:        model.RoleUser,
		IsActive:    true,
		IsLocked:    false,
	}

	if input.TenantID != nil {
		user.TenantID = input.TenantID
	}
	if input.Username != nil && *input.Username != "" {
		user.Username = input.Username
	}
	if input.EmployeeID != nil {
		user.EmployeeID = input.EmployeeID
	}
	if input.SSOID != nil {
		if *input.SSOID == "" {
			user.SSOID = nil
		} else {
			user.SSOID = input.SSOID
		}
	}
	if input.IsActive != nil {
		user.IsActive = *input.IsActive
	}
	if input.IsLocked != nil {
		user.IsLocked = *input.IsLocked
	}

	scopeType, err := normalizeScopeType(input.DataScopeType)
	if err != nil {
		return nil, err
	}
	user.DataScopeType = scopeType
	if input.DataScopeTenantIDs != nil {
		user.DataScopeTenantIDs = pq.StringArray(input.DataScopeTenantIDs)
	}
	if input.DataScopeDepartmentIDs != nil {
		user.DataScopeDepartmentIDs = pq.StringArray(input.DataScopeDepartmentIDs)
	}
	if input.DataScopeEmployeeIDs != nil {
		user.DataScopeEmployeeIDs = pq.StringArray(input.DataScopeEmployeeIDs)
	}

	if input.Password != nil && *input.Password != "" {
		hashed, err := hashPassword(*input.Password)
		if err != nil {
			return nil, err
		}
		user.PasswordHash = &hashed
	}

	if input.UserGroupID != nil {
		if s.userGroupRepo == nil {
			return nil, errors.New("user group repository not configured")
		}
		group, err := s.userGroupRepo.GetByID(ctx, *input.UserGroupID)
		if err != nil {
			return nil, ErrUserGroupNotFound
		}
		user.UserGroupID = &group.ID
		if group.IsAdmin {
			user.Role = model.RoleAdmin
		}
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	// Auto-add user to tenant in user_tenants
	if s.userTenantRepo != nil && user.TenantID != nil {
		_ = s.userTenantRepo.AddUserToTenant(ctx, user.ID, *user.TenantID, "member")
	}

	return user, nil
}

// Create creates a new user.
func (s *UserService) Create(ctx context.Context, email, displayName string, role model.UserRole) (*model.User, error) {
	user := &model.User{
		Email:       email,
		DisplayName: displayName,
		Role:        role,
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	return user, nil
}

// ChangePassword updates a user's password.
func (s *UserService) ChangePassword(ctx context.Context, input ChangePasswordInput) error {
	if input.NewPassword == "" {
		return ErrPasswordRequired
	}

	if input.RequesterID != input.TargetID && !input.RequesterCanManage && input.RequesterRole != string(model.RoleAdmin) {
		return ErrPermissionDenied
	}

	user, err := s.userRepo.GetByID(ctx, input.TargetID)
	if errors.Is(err, repository.ErrUserNotFound) {
		return ErrUserNotFound
	}
	if err != nil {
		return err
	}

	if input.RequesterID == input.TargetID && input.RequesterRole != string(model.RoleAdmin) && !input.RequesterCanManage {
		if user.PasswordHash == nil || *user.PasswordHash == "" {
			return ErrPasswordNotSet
		}
		if err := bcrypt.CompareHashAndPassword([]byte(*user.PasswordHash), []byte(input.CurrentPassword)); err != nil {
			return ErrInvalidCurrentPassword
		}
	}

	hashed, err := hashPassword(input.NewPassword)
	if err != nil {
		return err
	}
	user.PasswordHash = &hashed

	return s.userRepo.Update(ctx, user)
}

// LinkUserToEmployee links a user to an employee record.
func (s *UserService) LinkUserToEmployee(ctx context.Context, userID, employeeID uuid.UUID) error {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return ErrUserNotFound
	}

	user.EmployeeID = &employeeID
	return s.userRepo.Update(ctx, user)
}
