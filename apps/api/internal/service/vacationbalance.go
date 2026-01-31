package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

// Vacation balance service errors.
var (
	ErrVacationBalanceAlreadyExists = errors.New("vacation balance already exists for this employee and year")
)

type vacationBalanceRepoForBalanceService interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.VacationBalance, error)
	GetByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error)
	Create(ctx context.Context, balance *model.VacationBalance) error
	Update(ctx context.Context, balance *model.VacationBalance) error
	ListAll(ctx context.Context, filter repository.VacationBalanceFilter) ([]model.VacationBalance, error)
}

// VacationBalanceService handles vacation balance CRUD operations.
type VacationBalanceService struct {
	repo vacationBalanceRepoForBalanceService
}

// NewVacationBalanceService creates a new VacationBalanceService.
func NewVacationBalanceService(repo vacationBalanceRepoForBalanceService) *VacationBalanceService {
	return &VacationBalanceService{repo: repo}
}

// List returns vacation balances matching the given filter.
func (s *VacationBalanceService) List(ctx context.Context, filter repository.VacationBalanceFilter) ([]model.VacationBalance, error) {
	return s.repo.ListAll(ctx, filter)
}

// GetByID returns a vacation balance by ID.
func (s *VacationBalanceService) GetByID(ctx context.Context, id uuid.UUID) (*model.VacationBalance, error) {
	vb, err := s.repo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrVacationBalanceNotFound) {
			return nil, ErrVacationBalanceNotFound
		}
		return nil, fmt.Errorf("failed to get vacation balance: %w", err)
	}
	return vb, nil
}

// CreateVacationBalanceInput represents input for creating a vacation balance.
type CreateVacationBalanceInput struct {
	TenantID           uuid.UUID
	EmployeeID         uuid.UUID
	Year               int
	Entitlement        decimal.Decimal
	Carryover          decimal.Decimal
	Adjustments        decimal.Decimal
	CarryoverExpiresAt *time.Time
}

// Create creates a new vacation balance. Returns ErrVacationBalanceAlreadyExists if one exists for the employee/year.
func (s *VacationBalanceService) Create(ctx context.Context, input CreateVacationBalanceInput) (*model.VacationBalance, error) {
	existing, _ := s.repo.GetByEmployeeYear(ctx, input.EmployeeID, input.Year)
	if existing != nil {
		return nil, ErrVacationBalanceAlreadyExists
	}

	balance := &model.VacationBalance{
		TenantID:           input.TenantID,
		EmployeeID:         input.EmployeeID,
		Year:               input.Year,
		Entitlement:        input.Entitlement,
		Carryover:          input.Carryover,
		Adjustments:        input.Adjustments,
		CarryoverExpiresAt: input.CarryoverExpiresAt,
	}

	if err := s.repo.Create(ctx, balance); err != nil {
		return nil, fmt.Errorf("failed to create vacation balance: %w", err)
	}

	return balance, nil
}

// UpdateVacationBalanceInput represents input for updating a vacation balance.
type UpdateVacationBalanceInput struct {
	Entitlement        *decimal.Decimal
	Carryover          *decimal.Decimal
	Adjustments        *decimal.Decimal
	CarryoverExpiresAt *time.Time
}

// Update updates an existing vacation balance.
func (s *VacationBalanceService) Update(ctx context.Context, id uuid.UUID, input UpdateVacationBalanceInput) (*model.VacationBalance, error) {
	vb, err := s.repo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrVacationBalanceNotFound) {
			return nil, ErrVacationBalanceNotFound
		}
		return nil, fmt.Errorf("failed to get vacation balance: %w", err)
	}

	if input.Entitlement != nil {
		vb.Entitlement = *input.Entitlement
	}
	if input.Carryover != nil {
		vb.Carryover = *input.Carryover
	}
	if input.Adjustments != nil {
		vb.Adjustments = *input.Adjustments
	}
	if input.CarryoverExpiresAt != nil {
		vb.CarryoverExpiresAt = input.CarryoverExpiresAt
	}

	if err := s.repo.Update(ctx, vb); err != nil {
		return nil, fmt.Errorf("failed to update vacation balance: %w", err)
	}

	return vb, nil
}
