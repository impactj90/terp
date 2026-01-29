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
	ErrVacationSpecialCalcNotFound = errors.New("vacation special calculation not found")
)

// VacationSpecialCalcRepository handles vacation special calculation data access.
type VacationSpecialCalcRepository struct {
	db *DB
}

// NewVacationSpecialCalcRepository creates a new VacationSpecialCalcRepository.
func NewVacationSpecialCalcRepository(db *DB) *VacationSpecialCalcRepository {
	return &VacationSpecialCalcRepository{db: db}
}

// Create creates a new special calculation.
func (r *VacationSpecialCalcRepository) Create(ctx context.Context, calc *model.VacationSpecialCalculation) error {
	return r.db.GORM.WithContext(ctx).
		Select("TenantID", "Type", "Threshold", "BonusDays", "Description", "IsActive").
		Create(calc).Error
}

// GetByID retrieves a special calculation by ID.
func (r *VacationSpecialCalcRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.VacationSpecialCalculation, error) {
	var calc model.VacationSpecialCalculation
	err := r.db.GORM.WithContext(ctx).
		First(&calc, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrVacationSpecialCalcNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get vacation special calculation: %w", err)
	}
	return &calc, nil
}

// List retrieves all special calculations for a tenant.
func (r *VacationSpecialCalcRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.VacationSpecialCalculation, error) {
	var calcs []model.VacationSpecialCalculation
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("type ASC, threshold ASC").
		Find(&calcs).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list vacation special calculations: %w", err)
	}
	return calcs, nil
}

// ListActive retrieves only active special calculations for a tenant.
func (r *VacationSpecialCalcRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.VacationSpecialCalculation, error) {
	var calcs []model.VacationSpecialCalculation
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND is_active = ?", tenantID, true).
		Order("type ASC, threshold ASC").
		Find(&calcs).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list active vacation special calculations: %w", err)
	}
	return calcs, nil
}

// ListByType retrieves special calculations of a specific type for a tenant.
func (r *VacationSpecialCalcRepository) ListByType(ctx context.Context, tenantID uuid.UUID, calcType string) ([]model.VacationSpecialCalculation, error) {
	var calcs []model.VacationSpecialCalculation
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND type = ?", tenantID, calcType).
		Order("threshold ASC").
		Find(&calcs).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list vacation special calculations by type: %w", err)
	}
	return calcs, nil
}

// ListByIDs retrieves special calculations by a slice of IDs.
func (r *VacationSpecialCalcRepository) ListByIDs(ctx context.Context, ids []uuid.UUID) ([]model.VacationSpecialCalculation, error) {
	if len(ids) == 0 {
		return []model.VacationSpecialCalculation{}, nil
	}
	var calcs []model.VacationSpecialCalculation
	err := r.db.GORM.WithContext(ctx).
		Where("id IN ?", ids).
		Find(&calcs).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list vacation special calculations by IDs: %w", err)
	}
	return calcs, nil
}

// Update saves changes to a special calculation.
func (r *VacationSpecialCalcRepository) Update(ctx context.Context, calc *model.VacationSpecialCalculation) error {
	return r.db.GORM.WithContext(ctx).Save(calc).Error
}

// Delete deletes a special calculation by ID.
func (r *VacationSpecialCalcRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.VacationSpecialCalculation{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete vacation special calculation: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrVacationSpecialCalcNotFound
	}
	return nil
}

// CountGroupUsages counts how many calculation groups reference this special calculation.
func (r *VacationSpecialCalcRepository) CountGroupUsages(ctx context.Context, specialCalcID uuid.UUID) (int64, error) {
	var count int64
	err := r.db.GORM.WithContext(ctx).
		Model(&model.VacationCalcGroupSpecialCalc{}).
		Where("special_calculation_id = ?", specialCalcID).
		Count(&count).Error
	if err != nil {
		return 0, fmt.Errorf("failed to count group usages: %w", err)
	}
	return count, nil
}

// ExistsByTypeAndThreshold checks if a special calc with the same tenant+type+threshold exists.
func (r *VacationSpecialCalcRepository) ExistsByTypeAndThreshold(ctx context.Context, tenantID uuid.UUID, calcType string, threshold int) (bool, error) {
	var count int64
	err := r.db.GORM.WithContext(ctx).
		Model(&model.VacationSpecialCalculation{}).
		Where("tenant_id = ? AND type = ? AND threshold = ?", tenantID, calcType, threshold).
		Count(&count).Error
	if err != nil {
		return false, fmt.Errorf("failed to check existence: %w", err)
	}
	return count > 0, nil
}
