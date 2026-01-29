package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrAccountNotFound           = errors.New("account not found")
	ErrAccountCodeRequired       = errors.New("account code is required")
	ErrAccountNameRequired       = errors.New("account name is required")
	ErrAccountTypeRequired       = errors.New("account type is required")
	ErrAccountCodeExists         = errors.New("account code already exists")
	ErrCannotDeleteSystem        = errors.New("cannot delete system account")
	ErrCannotModifySystemCode    = errors.New("cannot modify system account code")
	ErrCannotModifySystemAccount = errors.New("cannot modify system account")
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
	ListFiltered(ctx context.Context, tenantID uuid.UUID, includeSystem bool, active *bool, accountType *model.AccountType, payrollRelevant *bool) ([]model.Account, error)
	ListDayPlansUsingAccount(ctx context.Context, tenantID uuid.UUID, accountID uuid.UUID) ([]model.AccountUsageDayPlan, error)
}

type AccountService struct {
	accountRepo accountRepository
}

func NewAccountService(accountRepo accountRepository) *AccountService {
	return &AccountService{accountRepo: accountRepo}
}

// CreateAccountInput represents the input for creating an account.
type CreateAccountInput struct {
	TenantID          uuid.UUID
	Code              string
	Name              string
	AccountType       model.AccountType
	Unit              model.AccountUnit
	DisplayFormat     model.DisplayFormat
	BonusFactor       *float64
	AccountGroupID    *uuid.UUID
	Description       *string
	IsPayrollRelevant bool
	PayrollCode       *string
	SortOrder         int
	YearCarryover     *bool
	IsActive          bool
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
	displayFormat := input.DisplayFormat
	if displayFormat == "" {
		displayFormat = model.DisplayFormatDecimal
	}
	yearCarryover := true
	if input.YearCarryover != nil {
		yearCarryover = *input.YearCarryover
	}

	// Check for existing account with same code for this tenant
	existing, err := s.accountRepo.GetByCode(ctx, &input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrAccountCodeExists
	}

	account := &model.Account{
		TenantID:          &input.TenantID,
		Code:              code,
		Name:              name,
		Description:       input.Description,
		AccountType:       input.AccountType,
		Unit:              unit,
		DisplayFormat:     displayFormat,
		BonusFactor:       input.BonusFactor,
		AccountGroupID:    input.AccountGroupID,
		YearCarryover:     yearCarryover,
		IsPayrollRelevant: input.IsPayrollRelevant,
		PayrollCode:       input.PayrollCode,
		SortOrder:         input.SortOrder,
		IsSystem:          false,
		IsActive:          input.IsActive,
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
	Name              *string
	Description       *string
	Unit              *model.AccountUnit
	DisplayFormat     *model.DisplayFormat
	BonusFactor       *float64
	AccountGroupID    *uuid.UUID
	YearCarryover     *bool
	IsPayrollRelevant *bool
	PayrollCode       *string
	SortOrder         *int
	IsActive          *bool
}

// Update updates an account.
func (s *AccountService) Update(ctx context.Context, id uuid.UUID, input UpdateAccountInput) (*model.Account, error) {
	account, err := s.accountRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrAccountNotFound
	}
	if account.IsSystem {
		return nil, ErrCannotModifySystemAccount
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
	if input.DisplayFormat != nil {
		account.DisplayFormat = *input.DisplayFormat
	}
	if input.BonusFactor != nil {
		account.BonusFactor = input.BonusFactor
	}
	if input.AccountGroupID != nil {
		account.AccountGroupID = input.AccountGroupID
	}
	if input.Description != nil {
		account.Description = input.Description
	}
	if input.YearCarryover != nil {
		account.YearCarryover = *input.YearCarryover
	}
	if input.IsPayrollRelevant != nil {
		account.IsPayrollRelevant = *input.IsPayrollRelevant
	}
	if input.PayrollCode != nil {
		account.PayrollCode = input.PayrollCode
	}
	if input.SortOrder != nil {
		account.SortOrder = *input.SortOrder
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

// ListFiltered retrieves accounts with optional filters.
func (s *AccountService) ListFiltered(ctx context.Context, tenantID uuid.UUID, includeSystem bool, active *bool, accountType *model.AccountType, payrollRelevant *bool) ([]model.Account, error) {
	return s.accountRepo.ListFiltered(ctx, tenantID, includeSystem, active, accountType, payrollRelevant)
}

// GetUsage returns day plans that reference the account.
func (s *AccountService) GetUsage(ctx context.Context, tenantID uuid.UUID, accountID uuid.UUID) ([]model.AccountUsageDayPlan, error) {
	return s.accountRepo.ListDayPlansUsingAccount(ctx, tenantID, accountID)
}
