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
	ErrVacationCalcGroupNotFound = errors.New("vacation calculation group not found")
)

// VacationCalcGroupRepository handles vacation calculation group data access.
type VacationCalcGroupRepository struct {
	db *DB
}

// NewVacationCalcGroupRepository creates a new VacationCalcGroupRepository.
func NewVacationCalcGroupRepository(db *DB) *VacationCalcGroupRepository {
	return &VacationCalcGroupRepository{db: db}
}

// Create creates a new calculation group.
func (r *VacationCalcGroupRepository) Create(ctx context.Context, group *model.VacationCalculationGroup) error {
	return r.db.GORM.WithContext(ctx).
		Select("TenantID", "Code", "Name", "Description", "Basis", "IsActive").
		Create(group).Error
}

// GetByID retrieves a group by ID, preloading SpecialCalculations.
func (r *VacationCalcGroupRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.VacationCalculationGroup, error) {
	var group model.VacationCalculationGroup
	err := r.db.GORM.WithContext(ctx).
		Preload("SpecialCalculations").
		First(&group, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrVacationCalcGroupNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get vacation calculation group: %w", err)
	}
	return &group, nil
}

// GetByCode retrieves a group by tenant + code.
func (r *VacationCalcGroupRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.VacationCalculationGroup, error) {
	var group model.VacationCalculationGroup
	err := r.db.GORM.WithContext(ctx).
		Preload("SpecialCalculations").
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&group).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrVacationCalcGroupNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get vacation calculation group by code: %w", err)
	}
	return &group, nil
}

// List retrieves all groups for a tenant, preloading SpecialCalculations.
func (r *VacationCalcGroupRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCalculationGroup, error) {
	var groups []model.VacationCalculationGroup
	err := r.db.GORM.WithContext(ctx).
		Preload("SpecialCalculations").
		Where("tenant_id = ?", tenantID).
		Order("code ASC").
		Find(&groups).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list vacation calculation groups: %w", err)
	}
	return groups, nil
}

// ListActive retrieves only active groups for a tenant.
func (r *VacationCalcGroupRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCalculationGroup, error) {
	var groups []model.VacationCalculationGroup
	err := r.db.GORM.WithContext(ctx).
		Preload("SpecialCalculations").
		Where("tenant_id = ? AND is_active = ?", tenantID, true).
		Order("code ASC").
		Find(&groups).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list active vacation calculation groups: %w", err)
	}
	return groups, nil
}

// Update saves changes to a group (excluding special calculation links).
func (r *VacationCalcGroupRepository) Update(ctx context.Context, group *model.VacationCalculationGroup) error {
	return r.db.GORM.WithContext(ctx).Save(group).Error
}

// Delete deletes a group by ID.
func (r *VacationCalcGroupRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.VacationCalculationGroup{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete vacation calculation group: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrVacationCalcGroupNotFound
	}
	return nil
}

// CountEmploymentTypeUsages counts how many employment types reference this group.
func (r *VacationCalcGroupRepository) CountEmploymentTypeUsages(ctx context.Context, groupID uuid.UUID) (int64, error) {
	var count int64
	err := r.db.GORM.WithContext(ctx).
		Model(&model.EmploymentType{}).
		Where("vacation_calc_group_id = ?", groupID).
		Count(&count).Error
	if err != nil {
		return 0, fmt.Errorf("failed to count employment type usages: %w", err)
	}
	return count, nil
}

// ReplaceSpecialCalculations replaces the group's special calculation links.
func (r *VacationCalcGroupRepository) ReplaceSpecialCalculations(ctx context.Context, groupID uuid.UUID, specialCalcIDs []uuid.UUID) error {
	return r.db.GORM.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Delete all existing junction entries for this group
		if err := tx.Where("group_id = ?", groupID).Delete(&model.VacationCalcGroupSpecialCalc{}).Error; err != nil {
			return fmt.Errorf("failed to delete existing special calc links: %w", err)
		}

		// Insert new junction entries
		for _, scID := range specialCalcIDs {
			link := model.VacationCalcGroupSpecialCalc{
				GroupID:              groupID,
				SpecialCalculationID: scID,
			}
			if err := tx.Create(&link).Error; err != nil {
				return fmt.Errorf("failed to create special calc link: %w", err)
			}
		}

		return nil
	})
}
