package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

// Monthly value service errors.
var (
	ErrMonthlyValueAlreadyClosed = errors.New("monthly value is already closed")
	ErrMonthlyValueNotClosed     = errors.New("monthly value is not closed")
)

type monthlyValueRepoForService interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.MonthlyValue, error)
	ListAll(ctx context.Context, filter repository.MonthlyValueFilter) ([]model.MonthlyValue, error)
	CloseMonth(ctx context.Context, employeeID uuid.UUID, year, month int, closedBy uuid.UUID) error
	ReopenMonth(ctx context.Context, employeeID uuid.UUID, year, month int, reopenedBy uuid.UUID) error
}

// MonthlyValueService handles monthly value flat route operations.
type MonthlyValueService struct {
	repo monthlyValueRepoForService
}

// NewMonthlyValueService creates a new MonthlyValueService.
func NewMonthlyValueService(repo monthlyValueRepoForService) *MonthlyValueService {
	return &MonthlyValueService{repo: repo}
}

// List returns monthly values matching the given filter.
func (s *MonthlyValueService) List(ctx context.Context, filter repository.MonthlyValueFilter) ([]model.MonthlyValue, error) {
	return s.repo.ListAll(ctx, filter)
}

// GetByID returns a monthly value by ID.
func (s *MonthlyValueService) GetByID(ctx context.Context, id uuid.UUID) (*model.MonthlyValue, error) {
	mv, err := s.repo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrMonthlyValueNotFound) {
			return nil, ErrMonthlyValueNotFound
		}
		return nil, fmt.Errorf("failed to get monthly value: %w", err)
	}
	return mv, nil
}

// Close closes a monthly value by ID.
func (s *MonthlyValueService) Close(ctx context.Context, id, closedBy uuid.UUID) (*model.MonthlyValue, error) {
	mv, err := s.repo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrMonthlyValueNotFound) {
			return nil, ErrMonthlyValueNotFound
		}
		return nil, fmt.Errorf("failed to get monthly value: %w", err)
	}

	if mv.IsClosed {
		return nil, ErrMonthlyValueAlreadyClosed
	}

	if err := s.repo.CloseMonth(ctx, mv.EmployeeID, mv.Year, mv.Month, closedBy); err != nil {
		return nil, fmt.Errorf("failed to close month: %w", err)
	}

	return s.repo.GetByID(ctx, id)
}

// Reopen reopens a closed monthly value by ID.
func (s *MonthlyValueService) Reopen(ctx context.Context, id, reopenedBy uuid.UUID) (*model.MonthlyValue, error) {
	mv, err := s.repo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrMonthlyValueNotFound) {
			return nil, ErrMonthlyValueNotFound
		}
		return nil, fmt.Errorf("failed to get monthly value: %w", err)
	}

	if !mv.IsClosed {
		return nil, ErrMonthlyValueNotClosed
	}

	if err := s.repo.ReopenMonth(ctx, mv.EmployeeID, mv.Year, mv.Month, reopenedBy); err != nil {
		return nil, fmt.Errorf("failed to reopen month: %w", err)
	}

	return s.repo.GetByID(ctx, id)
}
