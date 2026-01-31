package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

// dailyAccountValueRepository defines the interface for daily account value data access.
type dailyAccountValueRepository interface {
	List(ctx context.Context, tenantID uuid.UUID, opts model.DailyAccountValueListOptions) ([]model.DailyAccountValue, error)
	GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) ([]model.DailyAccountValue, error)
	SumByAccountAndRange(ctx context.Context, employeeID, accountID uuid.UUID, from, to time.Time) (int, error)
	Upsert(ctx context.Context, dav *model.DailyAccountValue) error
	DeleteByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) error
}

// DailyAccountValueService handles business logic for daily account values.
type DailyAccountValueService struct {
	repo dailyAccountValueRepository
}

// NewDailyAccountValueService creates a new DailyAccountValueService.
func NewDailyAccountValueService(repo dailyAccountValueRepository) *DailyAccountValueService {
	return &DailyAccountValueService{repo: repo}
}

// List returns daily account values matching the given filters.
func (s *DailyAccountValueService) List(ctx context.Context, tenantID uuid.UUID, opts model.DailyAccountValueListOptions) ([]model.DailyAccountValue, error) {
	return s.repo.List(ctx, tenantID, opts)
}

// GetByEmployeeDate returns daily account values for an employee on a date.
func (s *DailyAccountValueService) GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) ([]model.DailyAccountValue, error) {
	return s.repo.GetByEmployeeDate(ctx, employeeID, date)
}

// SumByAccountAndRange returns the total minutes for an employee's account over a date range.
func (s *DailyAccountValueService) SumByAccountAndRange(ctx context.Context, employeeID, accountID uuid.UUID, from, to time.Time) (int, error) {
	return s.repo.SumByAccountAndRange(ctx, employeeID, accountID, from, to)
}
