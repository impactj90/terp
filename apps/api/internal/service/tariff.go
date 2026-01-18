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
	ErrTariffNotFound      = errors.New("tariff not found")
	ErrTariffCodeExists    = errors.New("tariff code already exists")
	ErrTariffCodeReq       = errors.New("tariff code is required")
	ErrTariffNameReq       = errors.New("tariff name is required")
	ErrInvalidWeekPlan     = errors.New("invalid week plan reference")
	ErrTariffBreakNotFound = errors.New("tariff break not found")
	ErrInvalidBreakType    = errors.New("invalid break type")
	ErrBreakDurationReq    = errors.New("break duration is required")
)

// tariffRepository defines the interface for tariff data access.
type tariffRepository interface {
	Create(ctx context.Context, tariff *model.Tariff) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.Tariff, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.Tariff, error)
	GetWithDetails(ctx context.Context, id uuid.UUID) (*model.Tariff, error)
	Update(ctx context.Context, tariff *model.Tariff) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, tenantID uuid.UUID) ([]model.Tariff, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.Tariff, error)
	CreateBreak(ctx context.Context, tariffBreak *model.TariffBreak) error
	GetBreakByID(ctx context.Context, id uuid.UUID) (*model.TariffBreak, error)
	DeleteBreak(ctx context.Context, id uuid.UUID) error
	ListBreaks(ctx context.Context, tariffID uuid.UUID) ([]model.TariffBreak, error)
}

// weekPlanRepositoryForTariff defines the interface for week plan lookup (used for validation).
type weekPlanRepositoryForTariff interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.WeekPlan, error)
}

type TariffService struct {
	tariffRepo   tariffRepository
	weekPlanRepo weekPlanRepositoryForTariff
}

func NewTariffService(tariffRepo tariffRepository, weekPlanRepo weekPlanRepositoryForTariff) *TariffService {
	return &TariffService{
		tariffRepo:   tariffRepo,
		weekPlanRepo: weekPlanRepo,
	}
}

// CreateTariffInput represents the input for creating a tariff.
type CreateTariffInput struct {
	TenantID    uuid.UUID
	Code        string
	Name        string
	Description *string
	WeekPlanID  *uuid.UUID
	ValidFrom   *time.Time
	ValidTo     *time.Time
}

// Create creates a new tariff with validation.
func (s *TariffService) Create(ctx context.Context, input CreateTariffInput) (*model.Tariff, error) {
	// Validate required fields
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrTariffCodeReq
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrTariffNameReq
	}

	// Check code uniqueness
	existing, err := s.tariffRepo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrTariffCodeExists
	}

	// Validate week plan if provided
	if input.WeekPlanID != nil {
		plan, err := s.weekPlanRepo.GetByID(ctx, *input.WeekPlanID)
		if err != nil || plan.TenantID != input.TenantID {
			return nil, ErrInvalidWeekPlan
		}
	}

	tariff := &model.Tariff{
		TenantID:    input.TenantID,
		Code:        code,
		Name:        name,
		Description: input.Description,
		WeekPlanID:  input.WeekPlanID,
		ValidFrom:   input.ValidFrom,
		ValidTo:     input.ValidTo,
		IsActive:    true,
	}

	if err := s.tariffRepo.Create(ctx, tariff); err != nil {
		return nil, err
	}

	return tariff, nil
}

// GetByID retrieves a tariff by ID.
func (s *TariffService) GetByID(ctx context.Context, id uuid.UUID) (*model.Tariff, error) {
	tariff, err := s.tariffRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrTariffNotFound
	}
	return tariff, nil
}

// GetDetails retrieves a tariff with week plan and breaks preloaded.
func (s *TariffService) GetDetails(ctx context.Context, id uuid.UUID) (*model.Tariff, error) {
	tariff, err := s.tariffRepo.GetWithDetails(ctx, id)
	if err != nil {
		return nil, ErrTariffNotFound
	}
	return tariff, nil
}

// UpdateTariffInput represents the input for updating a tariff.
type UpdateTariffInput struct {
	Name           *string
	Description    *string
	WeekPlanID     *uuid.UUID
	ValidFrom      *time.Time
	ValidTo        *time.Time
	IsActive       *bool
	ClearWeekPlan  bool
	ClearValidFrom bool
	ClearValidTo   bool
}

// Update updates a tariff.
func (s *TariffService) Update(ctx context.Context, id uuid.UUID, tenantID uuid.UUID, input UpdateTariffInput) (*model.Tariff, error) {
	tariff, err := s.tariffRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrTariffNotFound
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrTariffNameReq
		}
		tariff.Name = name
	}
	if input.Description != nil {
		tariff.Description = input.Description
	}

	// Handle week plan updates
	if input.ClearWeekPlan {
		tariff.WeekPlanID = nil
	} else if input.WeekPlanID != nil {
		// Validate week plan exists and belongs to tenant
		plan, err := s.weekPlanRepo.GetByID(ctx, *input.WeekPlanID)
		if err != nil || plan.TenantID != tenantID {
			return nil, ErrInvalidWeekPlan
		}
		tariff.WeekPlanID = input.WeekPlanID
	}

	// Handle date fields
	if input.ClearValidFrom {
		tariff.ValidFrom = nil
	} else if input.ValidFrom != nil {
		tariff.ValidFrom = input.ValidFrom
	}

	if input.ClearValidTo {
		tariff.ValidTo = nil
	} else if input.ValidTo != nil {
		tariff.ValidTo = input.ValidTo
	}

	if input.IsActive != nil {
		tariff.IsActive = *input.IsActive
	}

	if err := s.tariffRepo.Update(ctx, tariff); err != nil {
		return nil, err
	}

	return tariff, nil
}

// Delete deletes a tariff by ID.
func (s *TariffService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.tariffRepo.GetByID(ctx, id)
	if err != nil {
		return ErrTariffNotFound
	}
	return s.tariffRepo.Delete(ctx, id)
}

// List retrieves all tariffs for a tenant.
func (s *TariffService) List(ctx context.Context, tenantID uuid.UUID) ([]model.Tariff, error) {
	return s.tariffRepo.List(ctx, tenantID)
}

// ListActive retrieves all active tariffs for a tenant.
func (s *TariffService) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.Tariff, error) {
	return s.tariffRepo.ListActive(ctx, tenantID)
}

// CreateTariffBreakInput represents the input for creating a tariff break.
type CreateTariffBreakInput struct {
	TariffID         uuid.UUID
	BreakType        string
	AfterWorkMinutes *int
	Duration         int
	IsPaid           bool
}

// CreateBreak creates a new break for a tariff.
func (s *TariffService) CreateBreak(ctx context.Context, input CreateTariffBreakInput) (*model.TariffBreak, error) {
	// Validate tariff exists
	_, err := s.tariffRepo.GetByID(ctx, input.TariffID)
	if err != nil {
		return nil, ErrTariffNotFound
	}

	// Validate break type
	breakType := model.BreakType(input.BreakType)
	if breakType != model.BreakTypeFixed && breakType != model.BreakTypeVariable && breakType != model.BreakTypeMinimum {
		return nil, ErrInvalidBreakType
	}

	// Validate duration
	if input.Duration <= 0 {
		return nil, ErrBreakDurationReq
	}

	// Get current breaks to determine sort order
	breaks, err := s.tariffRepo.ListBreaks(ctx, input.TariffID)
	if err != nil {
		return nil, err
	}
	sortOrder := len(breaks)

	tariffBreak := &model.TariffBreak{
		TariffID:         input.TariffID,
		BreakType:        breakType,
		AfterWorkMinutes: input.AfterWorkMinutes,
		Duration:         input.Duration,
		IsPaid:           input.IsPaid,
		SortOrder:        sortOrder,
	}

	if err := s.tariffRepo.CreateBreak(ctx, tariffBreak); err != nil {
		return nil, err
	}

	return tariffBreak, nil
}

// GetBreakByID retrieves a tariff break by ID.
func (s *TariffService) GetBreakByID(ctx context.Context, id uuid.UUID) (*model.TariffBreak, error) {
	tariffBreak, err := s.tariffRepo.GetBreakByID(ctx, id)
	if err != nil {
		return nil, ErrTariffBreakNotFound
	}
	return tariffBreak, nil
}

// DeleteBreak deletes a tariff break by ID.
func (s *TariffService) DeleteBreak(ctx context.Context, tariffID, breakID uuid.UUID) error {
	// Verify tariff exists
	_, err := s.tariffRepo.GetByID(ctx, tariffID)
	if err != nil {
		return ErrTariffNotFound
	}

	// Verify break exists and belongs to tariff
	tariffBreak, err := s.tariffRepo.GetBreakByID(ctx, breakID)
	if err != nil {
		return ErrTariffBreakNotFound
	}
	if tariffBreak.TariffID != tariffID {
		return ErrTariffBreakNotFound
	}

	return s.tariffRepo.DeleteBreak(ctx, breakID)
}
