package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrWeekPlanNotFound   = errors.New("week plan not found")
	ErrWeekPlanCodeExists = errors.New("week plan code already exists")
	ErrInvalidDayPlan     = errors.New("invalid day plan reference")
	ErrWeekPlanCodeReq    = errors.New("week plan code is required")
	ErrWeekPlanNameReq    = errors.New("week plan name is required")
	ErrWeekPlanIncomplete = errors.New("week plan must have a day plan assigned for all 7 days")
)

// weekPlanRepository defines the interface for week plan data access.
type weekPlanRepository interface {
	Create(ctx context.Context, plan *model.WeekPlan) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.WeekPlan, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.WeekPlan, error)
	GetWithDayPlans(ctx context.Context, id uuid.UUID) (*model.WeekPlan, error)
	Update(ctx context.Context, plan *model.WeekPlan) error
	Upsert(ctx context.Context, plan *model.WeekPlan) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, tenantID uuid.UUID) ([]model.WeekPlan, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.WeekPlan, error)
}

// dayPlanRepositoryForWeekPlan defines the interface for day plan lookup (used for validation).
type dayPlanRepositoryForWeekPlan interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.DayPlan, error)
}

type WeekPlanService struct {
	weekPlanRepo weekPlanRepository
	dayPlanRepo  dayPlanRepositoryForWeekPlan
}

func NewWeekPlanService(weekPlanRepo weekPlanRepository, dayPlanRepo dayPlanRepositoryForWeekPlan) *WeekPlanService {
	return &WeekPlanService{
		weekPlanRepo: weekPlanRepo,
		dayPlanRepo:  dayPlanRepo,
	}
}

// CreateWeekPlanInput represents the input for creating a week plan.
type CreateWeekPlanInput struct {
	TenantID           uuid.UUID
	Code               string
	Name               string
	Description        *string
	MondayDayPlanID    *uuid.UUID
	TuesdayDayPlanID   *uuid.UUID
	WednesdayDayPlanID *uuid.UUID
	ThursdayDayPlanID  *uuid.UUID
	FridayDayPlanID    *uuid.UUID
	SaturdayDayPlanID  *uuid.UUID
	SundayDayPlanID    *uuid.UUID
}

// Create creates a new week plan with validation.
func (s *WeekPlanService) Create(ctx context.Context, input CreateWeekPlanInput) (*model.WeekPlan, error) {
	// Validate required fields
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrWeekPlanCodeReq
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrWeekPlanNameReq
	}

	// Check code uniqueness
	existing, err := s.weekPlanRepo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrWeekPlanCodeExists
	}

	// Validate all day plan IDs exist and belong to tenant
	dayPlanIDs := []*uuid.UUID{
		input.MondayDayPlanID, input.TuesdayDayPlanID, input.WednesdayDayPlanID,
		input.ThursdayDayPlanID, input.FridayDayPlanID, input.SaturdayDayPlanID,
		input.SundayDayPlanID,
	}
	for _, id := range dayPlanIDs {
		if id != nil {
			plan, err := s.dayPlanRepo.GetByID(ctx, *id)
			if err != nil || plan.TenantID != input.TenantID {
				return nil, ErrInvalidDayPlan
			}
		}
	}

	// Validate all 7 days have day plans assigned (ZMI manual Section 11.2)
	if input.MondayDayPlanID == nil || input.TuesdayDayPlanID == nil ||
		input.WednesdayDayPlanID == nil || input.ThursdayDayPlanID == nil ||
		input.FridayDayPlanID == nil || input.SaturdayDayPlanID == nil ||
		input.SundayDayPlanID == nil {
		return nil, ErrWeekPlanIncomplete
	}

	weekPlan := &model.WeekPlan{
		TenantID:           input.TenantID,
		Code:               code,
		Name:               name,
		Description:        input.Description,
		MondayDayPlanID:    input.MondayDayPlanID,
		TuesdayDayPlanID:   input.TuesdayDayPlanID,
		WednesdayDayPlanID: input.WednesdayDayPlanID,
		ThursdayDayPlanID:  input.ThursdayDayPlanID,
		FridayDayPlanID:    input.FridayDayPlanID,
		SaturdayDayPlanID:  input.SaturdayDayPlanID,
		SundayDayPlanID:    input.SundayDayPlanID,
		IsActive:           true,
	}

	if err := s.weekPlanRepo.Create(ctx, weekPlan); err != nil {
		return nil, err
	}

	return weekPlan, nil
}

// GetByID retrieves a week plan by ID.
func (s *WeekPlanService) GetByID(ctx context.Context, id uuid.UUID) (*model.WeekPlan, error) {
	plan, err := s.weekPlanRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrWeekPlanNotFound
	}
	return plan, nil
}

// GetDetails retrieves a week plan with all day plans preloaded.
func (s *WeekPlanService) GetDetails(ctx context.Context, id uuid.UUID) (*model.WeekPlan, error) {
	plan, err := s.weekPlanRepo.GetWithDayPlans(ctx, id)
	if err != nil {
		return nil, ErrWeekPlanNotFound
	}
	return plan, nil
}

// UpdateWeekPlanInput represents the input for updating a week plan.
type UpdateWeekPlanInput struct {
	Name               *string
	Description        *string
	MondayDayPlanID    *uuid.UUID
	TuesdayDayPlanID   *uuid.UUID
	WednesdayDayPlanID *uuid.UUID
	ThursdayDayPlanID  *uuid.UUID
	FridayDayPlanID    *uuid.UUID
	SaturdayDayPlanID  *uuid.UUID
	SundayDayPlanID    *uuid.UUID
	IsActive           *bool
	// Flags to track which day plans should be cleared (set to null)
	ClearMondayDayPlan    bool
	ClearTuesdayDayPlan   bool
	ClearWednesdayDayPlan bool
	ClearThursdayDayPlan  bool
	ClearFridayDayPlan    bool
	ClearSaturdayDayPlan  bool
	ClearSundayDayPlan    bool
}

// Update updates a week plan.
func (s *WeekPlanService) Update(ctx context.Context, id uuid.UUID, input UpdateWeekPlanInput) (*model.WeekPlan, error) {
	plan, err := s.weekPlanRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrWeekPlanNotFound
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrWeekPlanNameReq
		}
		plan.Name = name
	}
	if input.Description != nil {
		plan.Description = input.Description
	}

	// Handle day plan ID updates (validate before applying)
	dayPlanUpdates := []struct {
		id       *uuid.UUID
		clearFlg bool
		target   **uuid.UUID
	}{
		{input.MondayDayPlanID, input.ClearMondayDayPlan, &plan.MondayDayPlanID},
		{input.TuesdayDayPlanID, input.ClearTuesdayDayPlan, &plan.TuesdayDayPlanID},
		{input.WednesdayDayPlanID, input.ClearWednesdayDayPlan, &plan.WednesdayDayPlanID},
		{input.ThursdayDayPlanID, input.ClearThursdayDayPlan, &plan.ThursdayDayPlanID},
		{input.FridayDayPlanID, input.ClearFridayDayPlan, &plan.FridayDayPlanID},
		{input.SaturdayDayPlanID, input.ClearSaturdayDayPlan, &plan.SaturdayDayPlanID},
		{input.SundayDayPlanID, input.ClearSundayDayPlan, &plan.SundayDayPlanID},
	}

	for _, u := range dayPlanUpdates {
		if u.clearFlg {
			*u.target = nil
		} else if u.id != nil {
			// Validate day plan exists and belongs to tenant
			dayPlan, err := s.dayPlanRepo.GetByID(ctx, *u.id)
			if err != nil || dayPlan.TenantID != plan.TenantID {
				return nil, ErrInvalidDayPlan
			}
			*u.target = u.id
		}
	}

	if input.IsActive != nil {
		plan.IsActive = *input.IsActive
	}

	// Validate completeness after applying updates (ZMI manual Section 11.2)
	if plan.MondayDayPlanID == nil || plan.TuesdayDayPlanID == nil ||
		plan.WednesdayDayPlanID == nil || plan.ThursdayDayPlanID == nil ||
		plan.FridayDayPlanID == nil || plan.SaturdayDayPlanID == nil ||
		plan.SundayDayPlanID == nil {
		return nil, ErrWeekPlanIncomplete
	}

	if err := s.weekPlanRepo.Update(ctx, plan); err != nil {
		return nil, err
	}

	return plan, nil
}

// Delete deletes a week plan by ID.
func (s *WeekPlanService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.weekPlanRepo.GetByID(ctx, id)
	if err != nil {
		return ErrWeekPlanNotFound
	}
	return s.weekPlanRepo.Delete(ctx, id)
}

// List retrieves all week plans for a tenant.
func (s *WeekPlanService) List(ctx context.Context, tenantID uuid.UUID) ([]model.WeekPlan, error) {
	return s.weekPlanRepo.List(ctx, tenantID)
}

// ListActive retrieves all active week plans for a tenant.
func (s *WeekPlanService) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.WeekPlan, error) {
	return s.weekPlanRepo.ListActive(ctx, tenantID)
}

// UpsertDevWeekPlan creates or updates a week plan for dev seeding (idempotent).
func (s *WeekPlanService) UpsertDevWeekPlan(ctx context.Context, plan *model.WeekPlan) error {
	return s.weekPlanRepo.Upsert(ctx, plan)
}
