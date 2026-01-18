package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrAccountNotFound        = errors.New("account not found")
	ErrAccountCodeRequired    = errors.New("account code is required")
	ErrAccountNameRequired    = errors.New("account name is required")
	ErrAccountTypeRequired    = errors.New("account type is required")
	ErrAccountCodeExists      = errors.New("account code already exists")
	ErrCannotDeleteSystem     = errors.New("cannot delete system account")
	ErrCannotModifySystemCode = errors.New("cannot modify system account code")
)

// accountRepository defines the interface for account data access.
type accountRepository interface {
	Create(ctx context.Context, account *model.Account) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.Account, error)
	GetByCode(ctx context.Context, tenantID *uuid.UUID, code string) (*model.Account, error)
	Update(ctx context.Context, account *model.Account) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, tenantID uuid.UUID) ([]model.Account, error)
	ListWithSystem(ctx context.Context, tenantID uuid.UUID) ([]model.Account, error)
	GetSystemAccounts(ctx context.Context) ([]model.Account, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.Account, error)
}

type AccountService struct {
	accountRepo accountRepository
}

func NewAccountService(accountRepo accountRepository) *AccountService {
	return &AccountService{accountRepo: accountRepo}
}

// CreateAccountInput represents the input for creating an account.
type CreateAccountInput struct {
	TenantID    uuid.UUID
	Code        string
	Name        string
	AccountType model.AccountType
	Unit        model.AccountUnit
	IsActive    bool
}

// Create creates a new account with validation.
func (s *AccountService) Create(ctx context.Context, input CreateAccountInput) (*model.Account, error) {
	// Validate required fields
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrAccountCodeRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrAccountNameRequired
	}
	if input.AccountType == "" {
		return nil, ErrAccountTypeRequired
	}

	// Default unit to minutes if not specified
	unit := input.Unit
	if unit == "" {
		unit = model.AccountUnitMinutes
	}

	// Check for existing account with same code for this tenant
	existing, err := s.accountRepo.GetByCode(ctx, &input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrAccountCodeExists
	}

	account := &model.Account{
		TenantID:    &input.TenantID,
		Code:        code,
		Name:        name,
		AccountType: input.AccountType,
		Unit:        unit,
		IsSystem:    false,
		IsActive:    input.IsActive,
	}

	if err := s.accountRepo.Create(ctx, account); err != nil {
		return nil, err
	}

	return account, nil
}

// GetByID retrieves an account by ID.
func (s *AccountService) GetByID(ctx context.Context, id uuid.UUID) (*model.Account, error) {
	account, err := s.accountRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrAccountNotFound
	}
	return account, nil
}

// GetByCode retrieves an account by tenant ID and code.
func (s *AccountService) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.Account, error) {
	account, err := s.accountRepo.GetByCode(ctx, &tenantID, code)
	if err != nil {
		return nil, ErrAccountNotFound
	}
	return account, nil
}

// UpdateAccountInput represents the input for updating an account.
type UpdateAccountInput struct {
	Name     *string
	Unit     *model.AccountUnit
	IsActive *bool
}

// Update updates an account.
func (s *AccountService) Update(ctx context.Context, id uuid.UUID, input UpdateAccountInput) (*model.Account, error) {
	account, err := s.accountRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrAccountNotFound
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrAccountNameRequired
		}
		account.Name = name
	}
	if input.Unit != nil {
		account.Unit = *input.Unit
	}
	if input.IsActive != nil {
		account.IsActive = *input.IsActive
	}

	if err := s.accountRepo.Update(ctx, account); err != nil {
		return nil, err
	}

	return account, nil
}

// Delete deletes an account by ID.
func (s *AccountService) Delete(ctx context.Context, id uuid.UUID) error {
	account, err := s.accountRepo.GetByID(ctx, id)
	if err != nil {
		return ErrAccountNotFound
	}

	// Prevent deletion of system accounts
	if account.IsSystem {
		return ErrCannotDeleteSystem
	}

	return s.accountRepo.Delete(ctx, id)
}

// List retrieves all accounts for a tenant (excluding system accounts).
func (s *AccountService) List(ctx context.Context, tenantID uuid.UUID) ([]model.Account, error) {
	return s.accountRepo.List(ctx, tenantID)
}

// ListWithSystem retrieves all accounts for a tenant including system accounts.
func (s *AccountService) ListWithSystem(ctx context.Context, tenantID uuid.UUID) ([]model.Account, error) {
	return s.accountRepo.ListWithSystem(ctx, tenantID)
}

// GetSystemAccounts retrieves all system accounts.
func (s *AccountService) GetSystemAccounts(ctx context.Context) ([]model.Account, error) {
	return s.accountRepo.GetSystemAccounts(ctx)
}

// ListActive retrieves all active accounts for a tenant.
func (s *AccountService) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.Account, error) {
	return s.accountRepo.ListActive(ctx, tenantID)
}
