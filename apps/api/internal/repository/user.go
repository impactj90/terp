package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrUserNotFound = errors.New("user not found")
)

// UserRepository handles user data access.
type UserRepository struct {
	db *DB
}

// NewUserRepository creates a new user repository.
func NewUserRepository(db *DB) *UserRepository {
	return &UserRepository{db: db}
}

// Create creates a new user.
func (r *UserRepository) Create(ctx context.Context, user *model.User) error {
	return r.db.GORM.WithContext(ctx).Create(user).Error
}

// GetByID retrieves a user by ID.
func (r *UserRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.User, error) {
	var user model.User
	err := r.db.GORM.WithContext(ctx).
		First(&user, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}
	return &user, nil
}

// GetByEmail retrieves a user by email within a tenant.
func (r *UserRepository) GetByEmail(ctx context.Context, tenantID uuid.UUID, email string) (*model.User, error) {
	var user model.User
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND email = ?", tenantID, email).
		First(&user).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}
	return &user, nil
}

// FindByEmail retrieves a user by email without tenant filter (uses global unique constraint).
func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*model.User, error) {
	var user model.User
	err := r.db.GORM.WithContext(ctx).
		Where("email = ?", email).
		First(&user).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to find user by email: %w", err)
	}
	return &user, nil
}

// GetByEmployeeID retrieves a user by employee ID within a tenant.
func (r *UserRepository) GetByEmployeeID(ctx context.Context, tenantID, employeeID uuid.UUID) (*model.User, error) {
	var user model.User
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND employee_id = ?", tenantID, employeeID).
		First(&user).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user by employee id: %w", err)
	}
	return &user, nil
}

// Update updates a user.
func (r *UserRepository) Update(ctx context.Context, user *model.User) error {
	return r.db.GORM.WithContext(ctx).Save(user).Error
}

// UpdateRoleByGroup updates the role for all users in a group.
func (r *UserRepository) UpdateRoleByGroup(ctx context.Context, groupID uuid.UUID, role model.UserRole) error {
	return r.db.GORM.WithContext(ctx).
		Model(&model.User{}).
		Where("user_group_id = ?", groupID).
		Update("role", role).
		Error
}

// ListUsersParams defines parameters for listing users.
type ListUsersParams struct {
	Query  string
	Limit  int
	Cursor *uuid.UUID // Last seen ID for cursor pagination
}

// List retrieves users with filtering and pagination.
func (r *UserRepository) List(ctx context.Context, params ListUsersParams) ([]model.User, error) {
	query := r.db.GORM.WithContext(ctx).
		Order("display_name ASC")

	if params.Query != "" {
		searchPattern := "%" + params.Query + "%"
		query = query.Where("display_name ILIKE ? OR email ILIKE ?", searchPattern, searchPattern)
	}

	if params.Cursor != nil {
		query = query.Where("id > ?", *params.Cursor)
	}

	if params.Limit > 0 {
		query = query.Limit(params.Limit)
	}

	var users []model.User
	if err := query.Find(&users).Error; err != nil {
		return nil, fmt.Errorf("failed to list users: %w", err)
	}
	return users, nil
}

// Count returns the total count of users matching filters.
func (r *UserRepository) Count(ctx context.Context, params ListUsersParams) (int64, error) {
	query := r.db.GORM.WithContext(ctx).Model(&model.User{})

	if params.Query != "" {
		searchPattern := "%" + params.Query + "%"
		query = query.Where("display_name ILIKE ? OR email ILIKE ?", searchPattern, searchPattern)
	}

	var count int64
	if err := query.Count(&count).Error; err != nil {
		return 0, fmt.Errorf("failed to count users: %w", err)
	}
	return count, nil
}

// Delete deletes a user.
func (r *UserRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.User{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete user: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrUserNotFound
	}
	return nil
}

// Upsert creates a user if not exists, or updates if exists.
func (r *UserRepository) Upsert(ctx context.Context, user *model.User) error {
	return r.db.GORM.WithContext(ctx).
		Where("id = ?", user.ID).
		Assign(user).
		FirstOrCreate(user).Error
}

// GetByUsername retrieves a user by username within a tenant.
func (r *UserRepository) GetByUsername(ctx context.Context, tenantID uuid.UUID, username string) (*model.User, error) {
	var user model.User
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND username = ?", tenantID, username).
		First(&user).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user by username: %w", err)
	}
	return &user, nil
}

// ListByTenant retrieves all users for a tenant.
func (r *UserRepository) ListByTenant(ctx context.Context, tenantID uuid.UUID, includeInactive bool) ([]model.User, error) {
	var users []model.User
	query := r.db.GORM.WithContext(ctx).Preload("UserGroup").Where("tenant_id = ?", tenantID)
	if !includeInactive {
		query = query.Where("is_active = ?", true)
	}
	if err := query.Find(&users).Error; err != nil {
		return nil, fmt.Errorf("failed to list users by tenant: %w", err)
	}
	return users, nil
}

// GetWithRelations retrieves a user with all related entities preloaded.
func (r *UserRepository) GetWithRelations(ctx context.Context, id uuid.UUID) (*model.User, error) {
	var user model.User
	err := r.db.GORM.WithContext(ctx).
		Preload("Tenant").
		Preload("UserGroup").
		Preload("Employee").
		First(&user, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user with relations: %w", err)
	}
	return &user, nil
}
