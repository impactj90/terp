package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrCalculationRuleNotFound     = errors.New("calculation rule not found")
	ErrCalculationRuleCodeRequired = errors.New("calculation rule code is required")
	ErrCalculationRuleNameRequired = errors.New("calculation rule name is required")
	ErrCalculationRuleCodeExists   = errors.New("calculation rule code already exists")
	ErrCalculationRuleInUse        = errors.New("calculation rule is assigned to absence types")
	ErrCalculationRuleInactive     = errors.New("cannot assign inactive calculation rule to absence type")
	ErrInvalidFactor               = errors.New("factor must be greater than 0")
	ErrInvalidValue                = errors.New("value must be non-negative")
)

// calculationRuleRepository defines the interface for calculation rule data access.
type calculationRuleRepository interface {
	Create(ctx context.Context, rule *model.CalculationRule) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.CalculationRule, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.CalculationRule, error)
	Update(ctx context.Context, rule *model.CalculationRule) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, tenantID uuid.UUID) ([]model.CalculationRule, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.CalculationRule, error)
	CountAbsenceTypeUsages(ctx context.Context, ruleID uuid.UUID) (int64, error)
}

// CalculationRuleService handles business logic for calculation rules.
type CalculationRuleService struct {
	ruleRepo calculationRuleRepository
}

// NewCalculationRuleService creates a new CalculationRuleService.
func NewCalculationRuleService(ruleRepo calculationRuleRepository) *CalculationRuleService {
	return &CalculationRuleService{ruleRepo: ruleRepo}
}

// CreateCalculationRuleInput represents the input for creating a calculation rule.
type CreateCalculationRuleInput struct {
	TenantID    uuid.UUID
	Code        string
	Name        string
	Description *string
	AccountID   *uuid.UUID
	Value       int
	Factor      float64
}

// Create creates a new calculation rule with validation.
func (s *CalculationRuleService) Create(ctx context.Context, input CreateCalculationRuleInput) (*model.CalculationRule, error) {
	// Validate required fields
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrCalculationRuleCodeRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrCalculationRuleNameRequired
	}

	// Validate value is non-negative
	if input.Value < 0 {
		return nil, ErrInvalidValue
	}

	// Default factor to 1.0 if not set
	factor := input.Factor
	if factor == 0 {
		factor = 1.0
	}
	if factor < 0 {
		return nil, ErrInvalidFactor
	}

	// Check for existing rule with same code for this tenant
	existing, err := s.ruleRepo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrCalculationRuleCodeExists
	}

	rule := &model.CalculationRule{
		TenantID:    input.TenantID,
		Code:        code,
		Name:        name,
		Description: input.Description,
		AccountID:   input.AccountID,
		Value:       input.Value,
		Factor:      factor,
		IsActive:    true,
	}

	if err := s.ruleRepo.Create(ctx, rule); err != nil {
		return nil, err
	}

	return rule, nil
}

// GetByID retrieves a calculation rule by ID.
func (s *CalculationRuleService) GetByID(ctx context.Context, id uuid.UUID) (*model.CalculationRule, error) {
	rule, err := s.ruleRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrCalculationRuleNotFound
	}
	return rule, nil
}

// UpdateCalculationRuleInput represents the input for updating a calculation rule.
type UpdateCalculationRuleInput struct {
	Name        *string
	Description *string
	AccountID   *uuid.UUID
	Value       *int
	Factor      *float64
	IsActive    *bool
	// ClearAccountID signals that account_id should be set to NULL.
	ClearAccountID bool
}

// Update updates a calculation rule.
func (s *CalculationRuleService) Update(ctx context.Context, id uuid.UUID, input UpdateCalculationRuleInput) (*model.CalculationRule, error) {
	rule, err := s.ruleRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrCalculationRuleNotFound
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrCalculationRuleNameRequired
		}
		rule.Name = name
	}
	if input.Description != nil {
		rule.Description = input.Description
	}
	if input.ClearAccountID {
		rule.AccountID = nil
	} else if input.AccountID != nil {
		rule.AccountID = input.AccountID
	}
	if input.Value != nil {
		if *input.Value < 0 {
			return nil, ErrInvalidValue
		}
		rule.Value = *input.Value
	}
	if input.Factor != nil {
		if *input.Factor < 0 {
			return nil, ErrInvalidFactor
		}
		rule.Factor = *input.Factor
	}
	if input.IsActive != nil {
		rule.IsActive = *input.IsActive
	}

	if err := s.ruleRepo.Update(ctx, rule); err != nil {
		return nil, err
	}

	return rule, nil
}

// Delete deletes a calculation rule by ID.
// Returns ErrCalculationRuleInUse if the rule is still assigned to absence types.
func (s *CalculationRuleService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.ruleRepo.GetByID(ctx, id)
	if err != nil {
		return ErrCalculationRuleNotFound
	}

	// Check if rule is in use by any absence types
	count, err := s.ruleRepo.CountAbsenceTypeUsages(ctx, id)
	if err != nil {
		return err
	}
	if count > 0 {
		return ErrCalculationRuleInUse
	}

	return s.ruleRepo.Delete(ctx, id)
}

// List retrieves all calculation rules for a tenant.
func (s *CalculationRuleService) List(ctx context.Context, tenantID uuid.UUID) ([]model.CalculationRule, error) {
	return s.ruleRepo.List(ctx, tenantID)
}

// ListActive retrieves all active calculation rules for a tenant.
func (s *CalculationRuleService) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.CalculationRule, error) {
	return s.ruleRepo.ListActive(ctx, tenantID)
}

// ValidateRuleForAssignment checks that a rule can be assigned to an absence type.
// Returns ErrCalculationRuleInactive if the rule is inactive.
func (s *CalculationRuleService) ValidateRuleForAssignment(ctx context.Context, ruleID uuid.UUID) error {
	rule, err := s.ruleRepo.GetByID(ctx, ruleID)
	if err != nil {
		return ErrCalculationRuleNotFound
	}
	if !rule.IsActive {
		return ErrCalculationRuleInactive
	}
	return nil
}
