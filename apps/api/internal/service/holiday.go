package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrHolidayNotFound      = errors.New("holiday not found")
	ErrHolidayDateRequired  = errors.New("holiday date is required")
	ErrHolidayNameRequired  = errors.New("holiday name is required")
	ErrHolidayAlreadyExists = errors.New("holiday already exists on this date")
)

// holidayRepository defines the interface for holiday data access.
type holidayRepository interface {
	Create(ctx context.Context, holiday *model.Holiday) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.Holiday, error)
	Update(ctx context.Context, holiday *model.Holiday) error
	Delete(ctx context.Context, id uuid.UUID) error
	GetByDate(ctx context.Context, tenantID uuid.UUID, date time.Time) (*model.Holiday, error)
	GetByDateRange(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]model.Holiday, error)
	ListByYear(ctx context.Context, tenantID uuid.UUID, year int) ([]model.Holiday, error)
}

type HolidayService struct {
	holidayRepo holidayRepository
}

func NewHolidayService(holidayRepo holidayRepository) *HolidayService {
	return &HolidayService{holidayRepo: holidayRepo}
}

// CreateHolidayInput represents the input for creating a holiday.
type CreateHolidayInput struct {
	TenantID     uuid.UUID
	HolidayDate  time.Time
	Name         string
	IsHalfDay    bool
	AppliesToAll bool
	DepartmentID *uuid.UUID
}

// Create creates a new holiday with validation.
func (s *HolidayService) Create(ctx context.Context, input CreateHolidayInput) (*model.Holiday, error) {
	// Validate required fields
	if input.HolidayDate.IsZero() {
		return nil, ErrHolidayDateRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrHolidayNameRequired
	}

	// Check for existing holiday on the same date for this tenant
	existing, err := s.holidayRepo.GetByDate(ctx, input.TenantID, input.HolidayDate)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, ErrHolidayAlreadyExists
	}

	holiday := &model.Holiday{
		TenantID:     input.TenantID,
		HolidayDate:  input.HolidayDate,
		Name:         name,
		IsHalfDay:    input.IsHalfDay,
		AppliesToAll: input.AppliesToAll,
		DepartmentID: input.DepartmentID,
	}

	if err := s.holidayRepo.Create(ctx, holiday); err != nil {
		return nil, err
	}

	return holiday, nil
}

// GetByID retrieves a holiday by ID.
func (s *HolidayService) GetByID(ctx context.Context, id uuid.UUID) (*model.Holiday, error) {
	holiday, err := s.holidayRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrHolidayNotFound
	}
	return holiday, nil
}

// UpdateHolidayInput represents the input for updating a holiday.
type UpdateHolidayInput struct {
	HolidayDate  *time.Time
	Name         *string
	IsHalfDay    *bool
	AppliesToAll *bool
	DepartmentID *uuid.UUID
}

// Update updates a holiday.
func (s *HolidayService) Update(ctx context.Context, id uuid.UUID, input UpdateHolidayInput) (*model.Holiday, error) {
	holiday, err := s.holidayRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrHolidayNotFound
	}

	if input.HolidayDate != nil {
		holiday.HolidayDate = *input.HolidayDate
	}
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrHolidayNameRequired
		}
		holiday.Name = name
	}
	if input.IsHalfDay != nil {
		holiday.IsHalfDay = *input.IsHalfDay
	}
	if input.AppliesToAll != nil {
		holiday.AppliesToAll = *input.AppliesToAll
	}
	if input.DepartmentID != nil {
		holiday.DepartmentID = input.DepartmentID
	}

	if err := s.holidayRepo.Update(ctx, holiday); err != nil {
		return nil, err
	}

	return holiday, nil
}

// Delete deletes a holiday by ID.
func (s *HolidayService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.holidayRepo.GetByID(ctx, id)
	if err != nil {
		return ErrHolidayNotFound
	}
	return s.holidayRepo.Delete(ctx, id)
}

// ListByYear retrieves all holidays for a tenant in a specific year.
func (s *HolidayService) ListByYear(ctx context.Context, tenantID uuid.UUID, year int) ([]model.Holiday, error) {
	return s.holidayRepo.ListByYear(ctx, tenantID, year)
}

// ListByDateRange retrieves holidays within a date range for a tenant.
func (s *HolidayService) ListByDateRange(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]model.Holiday, error) {
	return s.holidayRepo.GetByDateRange(ctx, tenantID, from, to)
}

// GetByDate retrieves a holiday for a specific date.
func (s *HolidayService) GetByDate(ctx context.Context, tenantID uuid.UUID, date time.Time) (*model.Holiday, error) {
	return s.holidayRepo.GetByDate(ctx, tenantID, date)
}
