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
	ErrVacationCappingRuleGroupNotFound = errors.New("vacation capping rule group not found")
)

// VacationCappingRuleGroupRepository handles vacation capping rule group data access.
type VacationCappingRuleGroupRepository struct {
	db *DB
}

// NewVacationCappingRuleGroupRepository creates a new VacationCappingRuleGroupRepository.
func NewVacationCappingRuleGroupRepository(db *DB) *VacationCappingRuleGroupRepository {
	return &VacationCappingRuleGroupRepository{db: db}
}

// Create creates a new capping rule group.
func (r *VacationCappingRuleGroupRepository) Create(ctx context.Context, group *model.VacationCappingRuleGroup) error {
	return r.db.GORM.WithContext(ctx).
		Select("TenantID", "Code", "Name", "Description", "IsActive").
		Create(group).Error
}

// GetByID retrieves a group by ID, preloading CappingRules.
func (r *VacationCappingRuleGroupRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.VacationCappingRuleGroup, error) {
	var group model.VacationCappingRuleGroup
	err := r.db.GORM.WithContext(ctx).
		Preload("CappingRules").
		First(&group, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrVacationCappingRuleGroupNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get vacation capping rule group: %w", err)
	}
	return &group, nil
}

// GetByCode retrieves a group by tenant + code.
func (r *VacationCappingRuleGroupRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.VacationCappingRuleGroup, error) {
	var group model.VacationCappingRuleGroup
	err := r.db.GORM.WithContext(ctx).
		Preload("CappingRules").
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&group).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrVacationCappingRuleGroupNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get vacation capping rule group by code: %w", err)
	}
	return &group, nil
}

// List retrieves all groups for a tenant, preloading CappingRules.
func (r *VacationCappingRuleGroupRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCappingRuleGroup, error) {
	var groups []model.VacationCappingRuleGroup
	err := r.db.GORM.WithContext(ctx).
		Preload("CappingRules").
		Where("tenant_id = ?", tenantID).
		Order("code ASC").
		Find(&groups).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list vacation capping rule groups: %w", err)
	}
	return groups, nil
}

// ListActive retrieves only active groups for a tenant.
func (r *VacationCappingRuleGroupRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCappingRuleGroup, error) {
	var groups []model.VacationCappingRuleGroup
	err := r.db.GORM.WithContext(ctx).
		Preload("CappingRules").
		Where("tenant_id = ? AND is_active = ?", tenantID, true).
		Order("code ASC").
		Find(&groups).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list active vacation capping rule groups: %w", err)
	}
	return groups, nil
}

// Update saves changes to a group (excluding capping rule links).
func (r *VacationCappingRuleGroupRepository) Update(ctx context.Context, group *model.VacationCappingRuleGroup) error {
	return r.db.GORM.WithContext(ctx).Save(group).Error
}

// Delete deletes a group by ID.
func (r *VacationCappingRuleGroupRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.VacationCappingRuleGroup{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete vacation capping rule group: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrVacationCappingRuleGroupNotFound
	}
	return nil
}

// CountTariffUsages counts how many tariffs reference this group.
func (r *VacationCappingRuleGroupRepository) CountTariffUsages(ctx context.Context, groupID uuid.UUID) (int64, error) {
	var count int64
	err := r.db.GORM.WithContext(ctx).
		Model(&model.Tariff{}).
		Where("vacation_capping_rule_group_id = ?", groupID).
		Count(&count).Error
	if err != nil {
		return 0, fmt.Errorf("failed to count tariff usages: %w", err)
	}
	return count, nil
}

// ReplaceCappingRules replaces the group's capping rule links.
func (r *VacationCappingRuleGroupRepository) ReplaceCappingRules(ctx context.Context, groupID uuid.UUID, cappingRuleIDs []uuid.UUID) error {
	return r.db.GORM.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Delete all existing junction entries for this group
		if err := tx.Where("group_id = ?", groupID).Delete(&model.VacationCappingRuleGroupRule{}).Error; err != nil {
			return fmt.Errorf("failed to delete existing capping rule links: %w", err)
		}

		// Insert new junction entries
		for _, crID := range cappingRuleIDs {
			link := model.VacationCappingRuleGroupRule{
				GroupID:       groupID,
				CappingRuleID: crID,
			}
			if err := tx.Create(&link).Error; err != nil {
				return fmt.Errorf("failed to create capping rule link: %w", err)
			}
		}

		return nil
	})
}
