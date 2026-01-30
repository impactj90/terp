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
	ErrVacationCappingRuleNotFound     = errors.New("vacation capping rule not found")
	ErrVacationCappingRuleCodeRequired = errors.New("vacation capping rule code is required")
	ErrVacationCappingRuleNameRequired = errors.New("vacation capping rule name is required")
	ErrVacationCappingRuleTypeRequired = errors.New("vacation capping rule type is required")
	ErrVacationCappingRuleTypeInvalid  = errors.New("vacation capping rule type must be year_end or mid_year")
	ErrVacationCappingRuleCodeExists   = errors.New("vacation capping rule code already exists")
	ErrVacationCappingRuleInUse        = errors.New("vacation capping rule is assigned to groups")
	ErrVacationCappingRuleInvalidMonth = errors.New("cutoff month must be between 1 and 12")
	ErrVacationCappingRuleInvalidDay   = errors.New("cutoff day must be between 1 and 31")
	ErrVacationCappingRuleInvalidCap   = errors.New("cap value must not be negative")
)

// vacationCappingRuleRepository defines the interface for vacation capping rule data access.
type vacationCappingRuleRepository interface {
	Create(ctx context.Context, rule *model.VacationCappingRule) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.VacationCappingRule, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.VacationCappingRule, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCappingRule, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCappingRule, error)
	ListByType(ctx context.Context, tenantID uuid.UUID, ruleType string) ([]model.VacationCappingRule, error)
	ListByIDs(ctx context.Context, ids []uuid.UUID) ([]model.VacationCappingRule, error)
	Update(ctx context.Context, rule *model.VacationCappingRule) error
	Delete(ctx context.Context, id uuid.UUID) error
	CountGroupUsages(ctx context.Context, ruleID uuid.UUID) (int64, error)
}

// CreateVacationCappingRuleInput represents the input for creating a capping rule.
type CreateVacationCappingRuleInput struct {
	TenantID    uuid.UUID
	Code        string
	Name        string
	Description *string
	RuleType    string
	CutoffMonth int
	CutoffDay   int
	CapValue    float64
}

// UpdateVacationCappingRuleInput represents the input for updating a capping rule.
type UpdateVacationCappingRuleInput struct {
	Name        *string
	Description *string
	RuleType    *string
	CutoffMonth *int
	CutoffDay   *int
	CapValue    *float64
	IsActive    *bool
}

// VacationCappingRuleService handles business logic for vacation capping rules.
type VacationCappingRuleService struct {
	repo vacationCappingRuleRepository
}

// NewVacationCappingRuleService creates a new VacationCappingRuleService.
func NewVacationCappingRuleService(repo vacationCappingRuleRepository) *VacationCappingRuleService {
	return &VacationCappingRuleService{repo: repo}
}

// Create creates a new vacation capping rule with validation.
func (s *VacationCappingRuleService) Create(ctx context.Context, input CreateVacationCappingRuleInput) (*model.VacationCappingRule, error) {
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrVacationCappingRuleCodeRequired
	}

	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrVacationCappingRuleNameRequired
	}

	ruleType := strings.TrimSpace(input.RuleType)
	if ruleType == "" {
		return nil, ErrVacationCappingRuleTypeRequired
	}
	if !model.IsValidCappingRuleType(ruleType) {
		return nil, ErrVacationCappingRuleTypeInvalid
	}

	cutoffMonth := input.CutoffMonth
	if cutoffMonth == 0 {
		cutoffMonth = 12
	}
	if cutoffMonth < 1 || cutoffMonth > 12 {
		return nil, ErrVacationCappingRuleInvalidMonth
	}

	cutoffDay := input.CutoffDay
	if cutoffDay == 0 {
		cutoffDay = 31
	}
	if cutoffDay < 1 || cutoffDay > 31 {
		return nil, ErrVacationCappingRuleInvalidDay
	}

	if input.CapValue < 0 {
		return nil, ErrVacationCappingRuleInvalidCap
	}

	// Check code uniqueness
	existing, err := s.repo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrVacationCappingRuleCodeExists
	}

	rule := &model.VacationCappingRule{
		TenantID:    input.TenantID,
		Code:        code,
		Name:        name,
		Description: input.Description,
		RuleType:    model.CappingRuleType(ruleType),
		CutoffMonth: cutoffMonth,
		CutoffDay:   cutoffDay,
		CapValue:    decimal.NewFromFloat(input.CapValue),
		IsActive:    true,
	}

	if err := s.repo.Create(ctx, rule); err != nil {
		return nil, err
	}

	return rule, nil
}

// GetByID retrieves a vacation capping rule by ID.
func (s *VacationCappingRuleService) GetByID(ctx context.Context, id uuid.UUID) (*model.VacationCappingRule, error) {
	rule, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrVacationCappingRuleNotFound
	}
	return rule, nil
}

// List retrieves all capping rules for a tenant.
func (s *VacationCappingRuleService) List(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCappingRule, error) {
	return s.repo.List(ctx, tenantID)
}

// ListActive retrieves only active capping rules.
func (s *VacationCappingRuleService) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCappingRule, error) {
	return s.repo.ListActive(ctx, tenantID)
}

// ListByType retrieves capping rules filtered by type.
func (s *VacationCappingRuleService) ListByType(ctx context.Context, tenantID uuid.UUID, ruleType string) ([]model.VacationCappingRule, error) {
	return s.repo.ListByType(ctx, tenantID, ruleType)
}

// Update updates a vacation capping rule.
func (s *VacationCappingRuleService) Update(ctx context.Context, id uuid.UUID, input UpdateVacationCappingRuleInput) (*model.VacationCappingRule, error) {
	rule, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrVacationCappingRuleNotFound
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrVacationCappingRuleNameRequired
		}
		rule.Name = name
	}

	if input.Description != nil {
		rule.Description = input.Description
	}

	if input.RuleType != nil {
		if !model.IsValidCappingRuleType(*input.RuleType) {
			return nil, ErrVacationCappingRuleTypeInvalid
		}
		rule.RuleType = model.CappingRuleType(*input.RuleType)
	}

	if input.CutoffMonth != nil {
		if *input.CutoffMonth < 1 || *input.CutoffMonth > 12 {
			return nil, ErrVacationCappingRuleInvalidMonth
		}
		rule.CutoffMonth = *input.CutoffMonth
	}

	if input.CutoffDay != nil {
		if *input.CutoffDay < 1 || *input.CutoffDay > 31 {
			return nil, ErrVacationCappingRuleInvalidDay
		}
		rule.CutoffDay = *input.CutoffDay
	}

	if input.CapValue != nil {
		if *input.CapValue < 0 {
			return nil, ErrVacationCappingRuleInvalidCap
		}
		rule.CapValue = decimal.NewFromFloat(*input.CapValue)
	}

	if input.IsActive != nil {
		rule.IsActive = *input.IsActive
	}

	if err := s.repo.Update(ctx, rule); err != nil {
		return nil, err
	}

	return rule, nil
}

// Delete deletes a vacation capping rule.
// Returns ErrVacationCappingRuleInUse if still assigned to groups.
func (s *VacationCappingRuleService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrVacationCappingRuleNotFound
	}

	count, err := s.repo.CountGroupUsages(ctx, id)
	if err != nil {
		return err
	}
	if count > 0 {
		return ErrVacationCappingRuleInUse
	}

	return s.repo.Delete(ctx, id)
}
