package service

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrExtendedTravelRuleNotFound      = errors.New("extended travel rule not found")
	ErrExtendedTravelRuleSetIDRequired = errors.New("rule set ID is required")
)

// extendedTravelRuleRepository defines the interface for extended travel rule data access.
type extendedTravelRuleRepository interface {
	Create(ctx context.Context, rule *model.ExtendedTravelRule) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.ExtendedTravelRule, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.ExtendedTravelRule, error)
	ListByRuleSet(ctx context.Context, ruleSetID uuid.UUID) ([]model.ExtendedTravelRule, error)
	Update(ctx context.Context, rule *model.ExtendedTravelRule) error
	Delete(ctx context.Context, id uuid.UUID) error
}

type ExtendedTravelRuleService struct {
	repo extendedTravelRuleRepository
}

func NewExtendedTravelRuleService(repo extendedTravelRuleRepository) *ExtendedTravelRuleService {
	return &ExtendedTravelRuleService{repo: repo}
}

// CreateExtendedTravelRuleInput represents the input for creating an extended travel rule.
type CreateExtendedTravelRuleInput struct {
	TenantID               uuid.UUID
	RuleSetID              uuid.UUID
	ArrivalDayTaxFree      *float64
	ArrivalDayTaxable      *float64
	DepartureDayTaxFree    *float64
	DepartureDayTaxable    *float64
	IntermediateDayTaxFree *float64
	IntermediateDayTaxable *float64
	ThreeMonthEnabled      *bool
	ThreeMonthTaxFree      *float64
	ThreeMonthTaxable      *float64
	SortOrder              *int
}

// Create creates a new extended travel rule with validation.
func (s *ExtendedTravelRuleService) Create(ctx context.Context, input CreateExtendedTravelRuleInput) (*model.ExtendedTravelRule, error) {
	if input.RuleSetID == uuid.Nil {
		return nil, ErrExtendedTravelRuleSetIDRequired
	}

	rule := &model.ExtendedTravelRule{
		TenantID:               input.TenantID,
		RuleSetID:              input.RuleSetID,
		ArrivalDayTaxFree:      decimal.Zero,
		ArrivalDayTaxable:      decimal.Zero,
		DepartureDayTaxFree:    decimal.Zero,
		DepartureDayTaxable:    decimal.Zero,
		IntermediateDayTaxFree: decimal.Zero,
		IntermediateDayTaxable: decimal.Zero,
		ThreeMonthTaxFree:      decimal.Zero,
		ThreeMonthTaxable:      decimal.Zero,
		IsActive:               true,
	}

	if input.ArrivalDayTaxFree != nil {
		rule.ArrivalDayTaxFree = decimal.NewFromFloat(*input.ArrivalDayTaxFree)
	}
	if input.ArrivalDayTaxable != nil {
		rule.ArrivalDayTaxable = decimal.NewFromFloat(*input.ArrivalDayTaxable)
	}
	if input.DepartureDayTaxFree != nil {
		rule.DepartureDayTaxFree = decimal.NewFromFloat(*input.DepartureDayTaxFree)
	}
	if input.DepartureDayTaxable != nil {
		rule.DepartureDayTaxable = decimal.NewFromFloat(*input.DepartureDayTaxable)
	}
	if input.IntermediateDayTaxFree != nil {
		rule.IntermediateDayTaxFree = decimal.NewFromFloat(*input.IntermediateDayTaxFree)
	}
	if input.IntermediateDayTaxable != nil {
		rule.IntermediateDayTaxable = decimal.NewFromFloat(*input.IntermediateDayTaxable)
	}
	if input.ThreeMonthEnabled != nil {
		rule.ThreeMonthEnabled = *input.ThreeMonthEnabled
	}
	if input.ThreeMonthTaxFree != nil {
		rule.ThreeMonthTaxFree = decimal.NewFromFloat(*input.ThreeMonthTaxFree)
	}
	if input.ThreeMonthTaxable != nil {
		rule.ThreeMonthTaxable = decimal.NewFromFloat(*input.ThreeMonthTaxable)
	}
	if input.SortOrder != nil {
		rule.SortOrder = *input.SortOrder
	}

	if err := s.repo.Create(ctx, rule); err != nil {
		return nil, err
	}
	return rule, nil
}

// GetByID retrieves an extended travel rule by ID.
func (s *ExtendedTravelRuleService) GetByID(ctx context.Context, id uuid.UUID) (*model.ExtendedTravelRule, error) {
	rule, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrExtendedTravelRuleNotFound
	}
	return rule, nil
}

// UpdateExtendedTravelRuleInput represents the input for updating an extended travel rule.
type UpdateExtendedTravelRuleInput struct {
	ArrivalDayTaxFree      *float64
	ArrivalDayTaxable      *float64
	DepartureDayTaxFree    *float64
	DepartureDayTaxable    *float64
	IntermediateDayTaxFree *float64
	IntermediateDayTaxable *float64
	ThreeMonthEnabled      *bool
	ThreeMonthTaxFree      *float64
	ThreeMonthTaxable      *float64
	IsActive               *bool
	SortOrder              *int
}

// Update updates an extended travel rule.
func (s *ExtendedTravelRuleService) Update(ctx context.Context, id uuid.UUID, input UpdateExtendedTravelRuleInput) (*model.ExtendedTravelRule, error) {
	rule, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrExtendedTravelRuleNotFound
	}

	if input.ArrivalDayTaxFree != nil {
		rule.ArrivalDayTaxFree = decimal.NewFromFloat(*input.ArrivalDayTaxFree)
	}
	if input.ArrivalDayTaxable != nil {
		rule.ArrivalDayTaxable = decimal.NewFromFloat(*input.ArrivalDayTaxable)
	}
	if input.DepartureDayTaxFree != nil {
		rule.DepartureDayTaxFree = decimal.NewFromFloat(*input.DepartureDayTaxFree)
	}
	if input.DepartureDayTaxable != nil {
		rule.DepartureDayTaxable = decimal.NewFromFloat(*input.DepartureDayTaxable)
	}
	if input.IntermediateDayTaxFree != nil {
		rule.IntermediateDayTaxFree = decimal.NewFromFloat(*input.IntermediateDayTaxFree)
	}
	if input.IntermediateDayTaxable != nil {
		rule.IntermediateDayTaxable = decimal.NewFromFloat(*input.IntermediateDayTaxable)
	}
	if input.ThreeMonthEnabled != nil {
		rule.ThreeMonthEnabled = *input.ThreeMonthEnabled
	}
	if input.ThreeMonthTaxFree != nil {
		rule.ThreeMonthTaxFree = decimal.NewFromFloat(*input.ThreeMonthTaxFree)
	}
	if input.ThreeMonthTaxable != nil {
		rule.ThreeMonthTaxable = decimal.NewFromFloat(*input.ThreeMonthTaxable)
	}
	if input.IsActive != nil {
		rule.IsActive = *input.IsActive
	}
	if input.SortOrder != nil {
		rule.SortOrder = *input.SortOrder
	}

	if err := s.repo.Update(ctx, rule); err != nil {
		return nil, err
	}
	return rule, nil
}

// Delete deletes an extended travel rule by ID.
func (s *ExtendedTravelRuleService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrExtendedTravelRuleNotFound
	}

	return s.repo.Delete(ctx, id)
}

// List retrieves all extended travel rules for a tenant.
func (s *ExtendedTravelRuleService) List(ctx context.Context, tenantID uuid.UUID) ([]model.ExtendedTravelRule, error) {
	return s.repo.List(ctx, tenantID)
}
