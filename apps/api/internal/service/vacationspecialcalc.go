package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrVacationSpecialCalcNotFound         = errors.New("vacation special calculation not found")
	ErrVacationSpecialCalcTypeRequired     = errors.New("vacation special calculation type is required")
	ErrVacationSpecialCalcTypeInvalid      = errors.New("vacation special calculation type must be age, tenure, or disability")
	ErrVacationSpecialCalcBonusRequired    = errors.New("bonus days must be positive")
	ErrVacationSpecialCalcDuplicate        = errors.New("a special calculation with this type and threshold already exists")
	ErrVacationSpecialCalcInUse            = errors.New("vacation special calculation is assigned to calculation groups")
	ErrVacationSpecialCalcInvalidThreshold = errors.New("threshold must be 0 for disability type and positive for age/tenure types")
)

// vacationSpecialCalcRepository defines the interface for vacation special calc data access.
type vacationSpecialCalcRepository interface {
	Create(ctx context.Context, calc *model.VacationSpecialCalculation) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.VacationSpecialCalculation, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.VacationSpecialCalculation, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.VacationSpecialCalculation, error)
	ListByType(ctx context.Context, tenantID uuid.UUID, calcType string) ([]model.VacationSpecialCalculation, error)
	ListByIDs(ctx context.Context, ids []uuid.UUID) ([]model.VacationSpecialCalculation, error)
	Update(ctx context.Context, calc *model.VacationSpecialCalculation) error
	Delete(ctx context.Context, id uuid.UUID) error
	CountGroupUsages(ctx context.Context, specialCalcID uuid.UUID) (int64, error)
	ExistsByTypeAndThreshold(ctx context.Context, tenantID uuid.UUID, calcType string, threshold int) (bool, error)
}

// CreateVacationSpecialCalcInput represents the input for creating a special calculation.
type CreateVacationSpecialCalcInput struct {
	TenantID    uuid.UUID
	Type        string
	Threshold   int
	BonusDays   float64
	Description *string
}

// UpdateVacationSpecialCalcInput represents the input for updating a special calculation.
type UpdateVacationSpecialCalcInput struct {
	Threshold   *int
	BonusDays   *float64
	Description *string
	IsActive    *bool
}

// VacationSpecialCalcService handles business logic for vacation special calculations.
type VacationSpecialCalcService struct {
	repo vacationSpecialCalcRepository
}

// NewVacationSpecialCalcService creates a new VacationSpecialCalcService.
func NewVacationSpecialCalcService(repo vacationSpecialCalcRepository) *VacationSpecialCalcService {
	return &VacationSpecialCalcService{repo: repo}
}

// Create creates a new vacation special calculation with validation.
func (s *VacationSpecialCalcService) Create(ctx context.Context, input CreateVacationSpecialCalcInput) (*model.VacationSpecialCalculation, error) {
	// Validate type
	calcType := strings.TrimSpace(input.Type)
	if calcType == "" {
		return nil, ErrVacationSpecialCalcTypeRequired
	}
	if !model.IsValidVacationSpecialCalcType(calcType) {
		return nil, ErrVacationSpecialCalcTypeInvalid
	}

	// Validate threshold: must be 0 for disability, positive for age/tenure
	if calcType == string(model.VacationSpecialCalcDisability) {
		if input.Threshold != 0 {
			return nil, ErrVacationSpecialCalcInvalidThreshold
		}
	} else {
		if input.Threshold < 0 {
			return nil, ErrVacationSpecialCalcInvalidThreshold
		}
	}

	// Validate bonus days
	if input.BonusDays <= 0 {
		return nil, ErrVacationSpecialCalcBonusRequired
	}

	// Check uniqueness
	exists, err := s.repo.ExistsByTypeAndThreshold(ctx, input.TenantID, calcType, input.Threshold)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ErrVacationSpecialCalcDuplicate
	}

	calc := &model.VacationSpecialCalculation{
		TenantID:    input.TenantID,
		Type:        model.VacationSpecialCalcType(calcType),
		Threshold:   input.Threshold,
		BonusDays:   decimal.NewFromFloat(input.BonusDays),
		Description: input.Description,
		IsActive:    true,
	}

	if err := s.repo.Create(ctx, calc); err != nil {
		return nil, err
	}

	return calc, nil
}

// GetByID retrieves a vacation special calculation by ID.
func (s *VacationSpecialCalcService) GetByID(ctx context.Context, id uuid.UUID) (*model.VacationSpecialCalculation, error) {
	calc, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrVacationSpecialCalcNotFound
	}
	return calc, nil
}

// List retrieves all special calculations for a tenant, with optional type filter.
func (s *VacationSpecialCalcService) List(ctx context.Context, tenantID uuid.UUID) ([]model.VacationSpecialCalculation, error) {
	return s.repo.List(ctx, tenantID)
}

// ListActive retrieves only active special calculations.
func (s *VacationSpecialCalcService) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.VacationSpecialCalculation, error) {
	return s.repo.ListActive(ctx, tenantID)
}

// ListByType retrieves special calculations filtered by type.
func (s *VacationSpecialCalcService) ListByType(ctx context.Context, tenantID uuid.UUID, calcType string) ([]model.VacationSpecialCalculation, error) {
	return s.repo.ListByType(ctx, tenantID, calcType)
}

// Update updates a vacation special calculation.
func (s *VacationSpecialCalcService) Update(ctx context.Context, id uuid.UUID, input UpdateVacationSpecialCalcInput) (*model.VacationSpecialCalculation, error) {
	calc, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrVacationSpecialCalcNotFound
	}

	if input.Threshold != nil {
		// Validate threshold for the existing type
		if string(calc.Type) == string(model.VacationSpecialCalcDisability) {
			if *input.Threshold != 0 {
				return nil, ErrVacationSpecialCalcInvalidThreshold
			}
		} else if *input.Threshold < 0 {
			return nil, ErrVacationSpecialCalcInvalidThreshold
		}
		calc.Threshold = *input.Threshold
	}

	if input.BonusDays != nil {
		if *input.BonusDays <= 0 {
			return nil, ErrVacationSpecialCalcBonusRequired
		}
		calc.BonusDays = decimal.NewFromFloat(*input.BonusDays)
	}

	if input.Description != nil {
		calc.Description = input.Description
	}

	if input.IsActive != nil {
		calc.IsActive = *input.IsActive
	}

	if err := s.repo.Update(ctx, calc); err != nil {
		return nil, err
	}

	return calc, nil
}

// Delete deletes a vacation special calculation.
// Returns ErrVacationSpecialCalcInUse if still assigned to groups.
func (s *VacationSpecialCalcService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrVacationSpecialCalcNotFound
	}

	count, err := s.repo.CountGroupUsages(ctx, id)
	if err != nil {
		return err
	}
	if count > 0 {
		return ErrVacationSpecialCalcInUse
	}

	return s.repo.Delete(ctx, id)
}
