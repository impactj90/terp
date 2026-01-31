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
		Select("TenantID", "Code", "Name", "Description", "AccountType", "Unit", "DisplayFormat", "BonusFactor", "AccountGroupID", "YearCarryover", "IsPayrollRelevant", "PayrollCode", "SortOrder", "IsSystem", "IsActive").
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
			Columns: []clause.Column{{Name: "tenant_id"}, {Name: "code"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"name",
				"description",
				"account_type",
				"unit",
				"display_format",
				"bonus_factor",
				"account_group_id",
				"year_carryover",
				"is_payroll_relevant",
				"payroll_code",
				"sort_order",
				"is_active",
				"updated_at",
			}),
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

// ListFiltered retrieves accounts with optional filters for system, active, and type.
// Usage count includes bonus references AND net/cap account references from day plans.
func (r *AccountRepository) ListFiltered(ctx context.Context, tenantID uuid.UUID, includeSystem bool, active *bool, accountType *model.AccountType, payrollRelevant *bool) ([]model.Account, error) {
	var accounts []model.Account
	// Count bonus references
	bonusUsage := r.db.GORM.WithContext(ctx).
		Table("day_plan_bonuses").
		Select("day_plan_bonuses.account_id AS account_id, COUNT(DISTINCT day_plan_bonuses.day_plan_id) AS usage_count").
		Joins("JOIN day_plans ON day_plans.id = day_plan_bonuses.day_plan_id").
		Where("day_plans.tenant_id = ?", tenantID).
		Group("day_plan_bonuses.account_id")
	// Count net/cap account references
	netCapUsage := r.db.GORM.WithContext(ctx).
		Raw(`SELECT account_id, COUNT(*) AS usage_count FROM (
			SELECT net_account_id AS account_id FROM day_plans WHERE tenant_id = ? AND net_account_id IS NOT NULL
			UNION ALL
			SELECT cap_account_id AS account_id FROM day_plans WHERE tenant_id = ? AND cap_account_id IS NOT NULL
		) sub GROUP BY account_id`, tenantID, tenantID)
	query := r.db.GORM.WithContext(ctx).
		Table("accounts").
		Select("accounts.*, COALESCE(bonus_usage.usage_count, 0) + COALESCE(netcap_usage.usage_count, 0) AS usage_count").
		Joins("LEFT JOIN (?) AS bonus_usage ON bonus_usage.account_id = accounts.id", bonusUsage).
		Joins("LEFT JOIN (?) AS netcap_usage ON netcap_usage.account_id = accounts.id", netCapUsage)
	if includeSystem {
		query = query.Where("tenant_id = ? OR tenant_id IS NULL", tenantID)
	} else {
		query = query.Where("tenant_id = ?", tenantID)
	}
	if active != nil {
		query = query.Where("is_active = ?", *active)
	}
	if accountType != nil && *accountType != "" {
		query = query.Where("account_type = ?", *accountType)
	}
	if payrollRelevant != nil {
		query = query.Where("is_payroll_relevant = ?", *payrollRelevant)
	}
	err := query.Order("is_system DESC, sort_order ASC, code ASC").Find(&accounts).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list accounts with filters: %w", err)
	}
	return accounts, nil
}

// ListDayPlansUsingAccount returns day plans that reference the account via bonuses or net/cap account fields.
func (r *AccountRepository) ListDayPlansUsingAccount(ctx context.Context, tenantID uuid.UUID, accountID uuid.UUID) ([]model.AccountUsageDayPlan, error) {
	var plans []model.AccountUsageDayPlan
	err := r.db.GORM.WithContext(ctx).
		Raw(`SELECT DISTINCT dp.id, dp.code, dp.name
		FROM day_plans dp
		WHERE dp.tenant_id = ?
		AND (
			dp.id IN (SELECT day_plan_id FROM day_plan_bonuses WHERE account_id = ?)
			OR dp.net_account_id = ?
			OR dp.cap_account_id = ?
		)
		ORDER BY dp.code ASC`, tenantID, accountID, accountID, accountID).
		Scan(&plans).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list day plans for account: %w", err)
	}
	return plans, nil
}
