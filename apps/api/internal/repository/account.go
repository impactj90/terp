package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrAccountNotFound = errors.New("account not found")
)

// AccountRepository handles account data access.
type AccountRepository struct {
	db *DB
}

// NewAccountRepository creates a new account repository.
func NewAccountRepository(db *DB) *AccountRepository {
	return &AccountRepository{db: db}
}

// Create creates a new account.
func (r *AccountRepository) Create(ctx context.Context, account *model.Account) error {
	return r.db.GORM.WithContext(ctx).
		Select("TenantID", "Code", "Name", "AccountType", "Unit", "IsSystem", "IsActive").
		Create(account).Error
}

// GetByID retrieves an account by ID.
func (r *AccountRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Account, error) {
	var account model.Account
	err := r.db.GORM.WithContext(ctx).
		First(&account, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAccountNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get account: %w", err)
	}
	return &account, nil
}

// GetByCode retrieves an account by code for a tenant.
// Pass nil for tenantID to find system accounts.
func (r *AccountRepository) GetByCode(ctx context.Context, tenantID *uuid.UUID, code string) (*model.Account, error) {
	var account model.Account
	query := r.db.GORM.WithContext(ctx).Where("code = ?", code)
	if tenantID != nil {
		query = query.Where("tenant_id = ?", *tenantID)
	} else {
		query = query.Where("tenant_id IS NULL")
	}
	err := query.First(&account).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAccountNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get account by code: %w", err)
	}
	return &account, nil
}

// Upsert creates or updates an account based on tenant_id + code.
func (r *AccountRepository) Upsert(ctx context.Context, account *model.Account) error {
	return r.db.GORM.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "tenant_id"}, {Name: "code"}},
			DoUpdates: clause.AssignmentColumns([]string{"name", "account_type", "unit", "is_active", "updated_at"}),
		}).
		Create(account).Error
}

// Update updates an account.
func (r *AccountRepository) Update(ctx context.Context, account *model.Account) error {
	return r.db.GORM.WithContext(ctx).Save(account).Error
}

// Delete deletes an account by ID.
func (r *AccountRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.Account{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete account: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrAccountNotFound
	}
	return nil
}

// List retrieves all accounts for a tenant (excluding system accounts).
func (r *AccountRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.Account, error) {
	var accounts []model.Account
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("code ASC").
		Find(&accounts).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list accounts: %w", err)
	}
	return accounts, nil
}

// ListWithSystem retrieves all accounts for a tenant including system accounts.
func (r *AccountRepository) ListWithSystem(ctx context.Context, tenantID uuid.UUID) ([]model.Account, error) {
	var accounts []model.Account
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? OR tenant_id IS NULL", tenantID).
		Order("is_system DESC, code ASC").
		Find(&accounts).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list accounts with system: %w", err)
	}
	return accounts, nil
}

// GetSystemAccounts retrieves all system accounts.
func (r *AccountRepository) GetSystemAccounts(ctx context.Context) ([]model.Account, error) {
	var accounts []model.Account
	err := r.db.GORM.WithContext(ctx).
		Where("is_system = ?", true).
		Order("code ASC").
		Find(&accounts).Error

	if err != nil {
		return nil, fmt.Errorf("failed to get system accounts: %w", err)
	}
	return accounts, nil
}

// ListActive retrieves all active accounts for a tenant.
func (r *AccountRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.Account, error) {
	var accounts []model.Account
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND is_active = ?", tenantID, true).
		Order("code ASC").
		Find(&accounts).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list active accounts: %w", err)
	}
	return accounts, nil
}
