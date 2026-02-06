package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

// Monthly evaluation template service errors.
var (
	ErrMonthlyEvalTemplateNotFound = errors.New("monthly evaluation template not found")
	ErrCannotDeleteDefaultTemplate = errors.New("cannot delete default evaluation template")
)

type monthlyEvalTemplateRepo interface {
	List(ctx context.Context, tenantID uuid.UUID, isActive *bool) ([]model.MonthlyEvaluationTemplate, error)
	GetByID(ctx context.Context, id uuid.UUID) (*model.MonthlyEvaluationTemplate, error)
	GetDefault(ctx context.Context, tenantID uuid.UUID) (*model.MonthlyEvaluationTemplate, error)
	Create(ctx context.Context, t *model.MonthlyEvaluationTemplate) error
	Update(ctx context.Context, t *model.MonthlyEvaluationTemplate) error
	Delete(ctx context.Context, id uuid.UUID) error
	ClearDefault(ctx context.Context, tenantID uuid.UUID) error
}

// MonthlyEvalTemplateService handles monthly evaluation template business logic.
type MonthlyEvalTemplateService struct {
	repo monthlyEvalTemplateRepo
}

// NewMonthlyEvalTemplateService creates a new MonthlyEvalTemplateService.
func NewMonthlyEvalTemplateService(repo monthlyEvalTemplateRepo) *MonthlyEvalTemplateService {
	return &MonthlyEvalTemplateService{repo: repo}
}

// List returns all evaluation templates for a tenant.
func (s *MonthlyEvalTemplateService) List(ctx context.Context, tenantID uuid.UUID, isActive *bool) ([]model.MonthlyEvaluationTemplate, error) {
	return s.repo.List(ctx, tenantID, isActive)
}

// GetByID returns an evaluation template by ID.
func (s *MonthlyEvalTemplateService) GetByID(ctx context.Context, id uuid.UUID) (*model.MonthlyEvaluationTemplate, error) {
	t, err := s.repo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrMonthlyEvalTemplateNotFound) {
			return nil, ErrMonthlyEvalTemplateNotFound
		}
		return nil, fmt.Errorf("failed to get evaluation template: %w", err)
	}
	return t, nil
}

// GetDefault returns the default evaluation template for a tenant.
func (s *MonthlyEvalTemplateService) GetDefault(ctx context.Context, tenantID uuid.UUID) (*model.MonthlyEvaluationTemplate, error) {
	t, err := s.repo.GetDefault(ctx, tenantID)
	if err != nil {
		if errors.Is(err, repository.ErrMonthlyEvalTemplateNotFound) {
			return nil, ErrMonthlyEvalTemplateNotFound
		}
		return nil, fmt.Errorf("failed to get default evaluation template: %w", err)
	}
	return t, nil
}

// CreateMonthlyEvalTemplateInput represents input for creating an evaluation template.
type CreateMonthlyEvalTemplateInput struct {
	TenantID             uuid.UUID
	Name                 string
	Description          string
	FlextimeCapPositive  int
	FlextimeCapNegative  int
	OvertimeThreshold    int
	MaxCarryoverVacation decimal.Decimal
	IsDefault            bool
	IsActive             bool
}

// Create creates a new evaluation template.
func (s *MonthlyEvalTemplateService) Create(ctx context.Context, input CreateMonthlyEvalTemplateInput) (*model.MonthlyEvaluationTemplate, error) {
	// If this is set as default, clear existing defaults
	if input.IsDefault {
		if err := s.repo.ClearDefault(ctx, input.TenantID); err != nil {
			return nil, fmt.Errorf("failed to clear default: %w", err)
		}
	}

	t := &model.MonthlyEvaluationTemplate{
		TenantID:             input.TenantID,
		Name:                 input.Name,
		Description:          input.Description,
		FlextimeCapPositive:  input.FlextimeCapPositive,
		FlextimeCapNegative:  input.FlextimeCapNegative,
		OvertimeThreshold:    input.OvertimeThreshold,
		MaxCarryoverVacation: input.MaxCarryoverVacation,
		IsDefault:            input.IsDefault,
		IsActive:             input.IsActive,
	}

	if err := s.repo.Create(ctx, t); err != nil {
		return nil, fmt.Errorf("failed to create evaluation template: %w", err)
	}

	return t, nil
}

// UpdateMonthlyEvalTemplateInput represents input for updating an evaluation template.
type UpdateMonthlyEvalTemplateInput struct {
	Name                 *string
	Description          *string
	FlextimeCapPositive  *int
	FlextimeCapNegative  *int
	OvertimeThreshold    *int
	MaxCarryoverVacation *decimal.Decimal
	IsDefault            *bool
	IsActive             *bool
}

// Update updates an existing evaluation template.
func (s *MonthlyEvalTemplateService) Update(ctx context.Context, id uuid.UUID, input UpdateMonthlyEvalTemplateInput) (*model.MonthlyEvaluationTemplate, error) {
	t, err := s.repo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrMonthlyEvalTemplateNotFound) {
			return nil, ErrMonthlyEvalTemplateNotFound
		}
		return nil, fmt.Errorf("failed to get evaluation template: %w", err)
	}

	if input.Name != nil {
		t.Name = *input.Name
	}
	if input.Description != nil {
		t.Description = *input.Description
	}
	if input.FlextimeCapPositive != nil {
		t.FlextimeCapPositive = *input.FlextimeCapPositive
	}
	if input.FlextimeCapNegative != nil {
		t.FlextimeCapNegative = *input.FlextimeCapNegative
	}
	if input.OvertimeThreshold != nil {
		t.OvertimeThreshold = *input.OvertimeThreshold
	}
	if input.MaxCarryoverVacation != nil {
		t.MaxCarryoverVacation = *input.MaxCarryoverVacation
	}
	if input.IsDefault != nil && *input.IsDefault && !t.IsDefault {
		if err := s.repo.ClearDefault(ctx, t.TenantID); err != nil {
			return nil, fmt.Errorf("failed to clear default: %w", err)
		}
		t.IsDefault = true
	}
	if input.IsDefault != nil && !*input.IsDefault {
		t.IsDefault = false
	}
	if input.IsActive != nil {
		t.IsActive = *input.IsActive
	}

	if err := s.repo.Update(ctx, t); err != nil {
		return nil, fmt.Errorf("failed to update evaluation template: %w", err)
	}

	return t, nil
}

// Delete deletes an evaluation template. Cannot delete the default template.
func (s *MonthlyEvalTemplateService) Delete(ctx context.Context, id uuid.UUID) error {
	t, err := s.repo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrMonthlyEvalTemplateNotFound) {
			return ErrMonthlyEvalTemplateNotFound
		}
		return fmt.Errorf("failed to get evaluation template: %w", err)
	}

	if t.IsDefault {
		return ErrCannotDeleteDefaultTemplate
	}

	if err := s.repo.Delete(ctx, id); err != nil {
		if errors.Is(err, repository.ErrMonthlyEvalTemplateNotFound) {
			return ErrMonthlyEvalTemplateNotFound
		}
		return fmt.Errorf("failed to delete evaluation template: %w", err)
	}
	return nil
}

// SetDefault sets an evaluation template as the default for its tenant.
func (s *MonthlyEvalTemplateService) SetDefault(ctx context.Context, id uuid.UUID) (*model.MonthlyEvaluationTemplate, error) {
	t, err := s.repo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrMonthlyEvalTemplateNotFound) {
			return nil, ErrMonthlyEvalTemplateNotFound
		}
		return nil, fmt.Errorf("failed to get evaluation template: %w", err)
	}

	if err := s.repo.ClearDefault(ctx, t.TenantID); err != nil {
		return nil, fmt.Errorf("failed to clear default: %w", err)
	}

	t.IsDefault = true
	if err := s.repo.Update(ctx, t); err != nil {
		return nil, fmt.Errorf("failed to set default: %w", err)
	}

	return t, nil
}
