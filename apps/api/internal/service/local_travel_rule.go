package service

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrLocalTravelRuleNotFound      = errors.New("local travel rule not found")
	ErrLocalTravelRuleSetIDRequired = errors.New("rule set ID is required")
)

// localTravelRuleRepository defines the interface for local travel rule data access.
type localTravelRuleRepository interface {
	Create(ctx context.Context, rule *model.LocalTravelRule) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.LocalTravelRule, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.LocalTravelRule, error)
	ListByRuleSet(ctx context.Context, ruleSetID uuid.UUID) ([]model.LocalTravelRule, error)
	Update(ctx context.Context, rule *model.LocalTravelRule) error
	Delete(ctx context.Context, id uuid.UUID) error
}

type LocalTravelRuleService struct {
	repo localTravelRuleRepository
}

func NewLocalTravelRuleService(repo localTravelRuleRepository) *LocalTravelRuleService {
	return &LocalTravelRuleService{repo: repo}
}

// CreateLocalTravelRuleInput represents the input for creating a local travel rule.
type CreateLocalTravelRuleInput struct {
	TenantID           uuid.UUID
	RuleSetID          uuid.UUID
	MinDistanceKm      *float64
	MaxDistanceKm      *float64
	MinDurationMinutes *int64
	MaxDurationMinutes *int64
	TaxFreeAmount      *float64
	TaxableAmount      *float64
	SortOrder          *int
}

// Create creates a new local travel rule with validation.
func (s *LocalTravelRuleService) Create(ctx context.Context, input CreateLocalTravelRuleInput) (*model.LocalTravelRule, error) {
	if input.RuleSetID == uuid.Nil {
		return nil, ErrLocalTravelRuleSetIDRequired
	}

	rule := &model.LocalTravelRule{
		TenantID:      input.TenantID,
		RuleSetID:     input.RuleSetID,
		MinDistanceKm: decimal.Zero,
		TaxFreeAmount: decimal.Zero,
		TaxableAmount: decimal.Zero,
		IsActive:      true,
	}

	if input.MinDistanceKm != nil {
		rule.MinDistanceKm = decimal.NewFromFloat(*input.MinDistanceKm)
	}
	if input.MaxDistanceKm != nil {
		d := decimal.NewFromFloat(*input.MaxDistanceKm)
		rule.MaxDistanceKm = &d
	}
	if input.MinDurationMinutes != nil {
		rule.MinDurationMinutes = int(*input.MinDurationMinutes)
	}
	if input.MaxDurationMinutes != nil {
		v := int(*input.MaxDurationMinutes)
		rule.MaxDurationMinutes = &v
	}
	if input.TaxFreeAmount != nil {
		rule.TaxFreeAmount = decimal.NewFromFloat(*input.TaxFreeAmount)
	}
	if input.TaxableAmount != nil {
		rule.TaxableAmount = decimal.NewFromFloat(*input.TaxableAmount)
	}
	if input.SortOrder != nil {
		rule.SortOrder = *input.SortOrder
	}

	if err := s.repo.Create(ctx, rule); err != nil {
		return nil, err
	}
	return rule, nil
}

// GetByID retrieves a local travel rule by ID.
func (s *LocalTravelRuleService) GetByID(ctx context.Context, id uuid.UUID) (*model.LocalTravelRule, error) {
	rule, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrLocalTravelRuleNotFound
	}
	return rule, nil
}

// UpdateLocalTravelRuleInput represents the input for updating a local travel rule.
type UpdateLocalTravelRuleInput struct {
	MinDistanceKm      *float64
	MaxDistanceKm      *float64
	MinDurationMinutes *int64
	MaxDurationMinutes *int64
	TaxFreeAmount      *float64
	TaxableAmount      *float64
	IsActive           *bool
	SortOrder          *int
}

// Update updates a local travel rule.
func (s *LocalTravelRuleService) Update(ctx context.Context, id uuid.UUID, input UpdateLocalTravelRuleInput) (*model.LocalTravelRule, error) {
	rule, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrLocalTravelRuleNotFound
	}

	if input.MinDistanceKm != nil {
		rule.MinDistanceKm = decimal.NewFromFloat(*input.MinDistanceKm)
	}
	if input.MaxDistanceKm != nil {
		d := decimal.NewFromFloat(*input.MaxDistanceKm)
		rule.MaxDistanceKm = &d
	}
	if input.MinDurationMinutes != nil {
		rule.MinDurationMinutes = int(*input.MinDurationMinutes)
	}
	if input.MaxDurationMinutes != nil {
		v := int(*input.MaxDurationMinutes)
		rule.MaxDurationMinutes = &v
	}
	if input.TaxFreeAmount != nil {
		rule.TaxFreeAmount = decimal.NewFromFloat(*input.TaxFreeAmount)
	}
	if input.TaxableAmount != nil {
		rule.TaxableAmount = decimal.NewFromFloat(*input.TaxableAmount)
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

// Delete deletes a local travel rule by ID.
func (s *LocalTravelRuleService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrLocalTravelRuleNotFound
	}

	return s.repo.Delete(ctx, id)
}

// List retrieves all local travel rules for a tenant.
func (s *LocalTravelRuleService) List(ctx context.Context, tenantID uuid.UUID) ([]model.LocalTravelRule, error) {
	return s.repo.List(ctx, tenantID)
}
