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
	ErrExportInterfaceNotFound = errors.New("export interface not found")
)

// ExportInterfaceRepository handles export interface data access.
type ExportInterfaceRepository struct {
	db *DB
}

// NewExportInterfaceRepository creates a new ExportInterfaceRepository.
func NewExportInterfaceRepository(db *DB) *ExportInterfaceRepository {
	return &ExportInterfaceRepository{db: db}
}

// Create creates a new export interface.
func (r *ExportInterfaceRepository) Create(ctx context.Context, ei *model.ExportInterface) error {
	return r.db.GORM.WithContext(ctx).Create(ei).Error
}

// GetByID retrieves an export interface by ID with accounts preloaded.
func (r *ExportInterfaceRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.ExportInterface, error) {
	var ei model.ExportInterface
	err := r.db.GORM.WithContext(ctx).
		Preload("Accounts", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC")
		}).
		Preload("Accounts.Account").
		First(&ei, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrExportInterfaceNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get export interface: %w", err)
	}
	return &ei, nil
}

// GetByNumber retrieves an export interface by tenant + interface_number.
func (r *ExportInterfaceRepository) GetByNumber(ctx context.Context, tenantID uuid.UUID, number int) (*model.ExportInterface, error) {
	var ei model.ExportInterface
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND interface_number = ?", tenantID, number).
		First(&ei).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrExportInterfaceNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get export interface by number: %w", err)
	}
	return &ei, nil
}

// List retrieves all export interfaces for a tenant.
func (r *ExportInterfaceRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.ExportInterface, error) {
	var interfaces []model.ExportInterface
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Preload("Accounts", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC")
		}).
		Preload("Accounts.Account").
		Order("interface_number ASC").
		Find(&interfaces).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list export interfaces: %w", err)
	}
	return interfaces, nil
}

// ListActive retrieves only active export interfaces for a tenant.
func (r *ExportInterfaceRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.ExportInterface, error) {
	var interfaces []model.ExportInterface
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND is_active = ?", tenantID, true).
		Preload("Accounts", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC")
		}).
		Preload("Accounts.Account").
		Order("interface_number ASC").
		Find(&interfaces).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list active export interfaces: %w", err)
	}
	return interfaces, nil
}

// Update saves changes to an export interface.
func (r *ExportInterfaceRepository) Update(ctx context.Context, ei *model.ExportInterface) error {
	return r.db.GORM.WithContext(ctx).Save(ei).Error
}

// Delete deletes an export interface by ID.
func (r *ExportInterfaceRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.ExportInterface{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete export interface: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrExportInterfaceNotFound
	}
	return nil
}

// SetAccounts replaces all accounts for an interface.
func (r *ExportInterfaceRepository) SetAccounts(ctx context.Context, interfaceID uuid.UUID, accountIDs []uuid.UUID) ([]model.ExportInterfaceAccount, error) {
	tx := r.db.GORM.WithContext(ctx).Begin()

	// Delete existing accounts
	if err := tx.Where("export_interface_id = ?", interfaceID).
		Delete(&model.ExportInterfaceAccount{}).Error; err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("failed to delete existing accounts: %w", err)
	}

	// Insert new accounts
	accounts := make([]model.ExportInterfaceAccount, len(accountIDs))
	for i, accountID := range accountIDs {
		accounts[i] = model.ExportInterfaceAccount{
			ExportInterfaceID: interfaceID,
			AccountID:         accountID,
			SortOrder:         i,
		}
	}

	if len(accounts) > 0 {
		if err := tx.Create(&accounts).Error; err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("failed to set accounts: %w", err)
		}
	}

	if err := tx.Commit().Error; err != nil {
		return nil, fmt.Errorf("failed to commit account changes: %w", err)
	}

	// Reload with account details
	var result []model.ExportInterfaceAccount
	err := r.db.GORM.WithContext(ctx).
		Where("export_interface_id = ?", interfaceID).
		Preload("Account").
		Order("sort_order ASC").
		Find(&result).Error

	if err != nil {
		return nil, fmt.Errorf("failed to reload accounts: %w", err)
	}
	return result, nil
}

// ListAccounts retrieves all accounts for an export interface.
func (r *ExportInterfaceRepository) ListAccounts(ctx context.Context, interfaceID uuid.UUID) ([]model.ExportInterfaceAccount, error) {
	var accounts []model.ExportInterfaceAccount
	err := r.db.GORM.WithContext(ctx).
		Where("export_interface_id = ?", interfaceID).
		Preload("Account").
		Order("sort_order ASC").
		Find(&accounts).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list export interface accounts: %w", err)
	}
	return accounts, nil
}

// CountExportUsages counts how many payroll exports reference this interface.
func (r *ExportInterfaceRepository) CountExportUsages(ctx context.Context, interfaceID uuid.UUID) (int64, error) {
	var count int64
	err := r.db.GORM.WithContext(ctx).
		Table("payroll_exports").
		Where("export_interface_id = ?", interfaceID).
		Count(&count).Error
	if err != nil {
		return 0, fmt.Errorf("failed to count export usages: %w", err)
	}
	return count, nil
}
