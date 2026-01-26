package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

var (
	ErrUserNotFound     = errors.New("user not found")
	ErrPermissionDenied = errors.New("permission denied")
)

type UserService struct {
	userRepo *repository.UserRepository
}

func NewUserService(userRepo *repository.UserRepository) *UserService {
	return &UserService{userRepo: userRepo}
}

// GetByID retrieves a user by ID.
func (s *UserService) GetByID(ctx context.Context, id uuid.UUID) (*model.User, error) {
	user, err := s.userRepo.GetByID(ctx, id)
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
func (s *UserService) Update(ctx context.Context, requesterID, targetID uuid.UUID, requesterRole string, updates map[string]any) (*model.User, error) {
	// Check permissions
	if requesterID != targetID && requesterRole != string(model.RoleAdmin) {
		return nil, ErrPermissionDenied
	}

	user, err := s.userRepo.GetByID(ctx, targetID)
	if errors.Is(err, repository.ErrUserNotFound) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}

	// Apply allowed updates
	if name, ok := updates["display_name"].(string); ok && name != "" {
		user.DisplayName = name
	}
	if avatar, ok := updates["avatar_url"].(string); ok {
		user.AvatarURL = &avatar
	}

	if err := s.userRepo.Update(ctx, user); err != nil {
		return nil, err
	}

	return user, nil
}

// Delete deletes a user (admin only).
func (s *UserService) Delete(ctx context.Context, requesterID, targetID uuid.UUID, requesterRole string) error {
	// Only admin can delete users
	if requesterRole != string(model.RoleAdmin) {
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
func (s *UserService) UpsertDevUser(ctx context.Context, id uuid.UUID, email, displayName string, role model.UserRole) error {
	user := &model.User{
		Email:       email,
		DisplayName: displayName,
		Role:        role,
	}
	user.ID = id
	return s.userRepo.Upsert(ctx, user)
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

// LinkUserToEmployee links a user to an employee record.
func (s *UserService) LinkUserToEmployee(ctx context.Context, userID, employeeID uuid.UUID) error {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return ErrUserNotFound
	}

	user.EmployeeID = &employeeID
	return s.userRepo.Update(ctx, user)
}
