package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrDayPlanNotFound      = errors.New("day plan not found")
	ErrDayPlanCodeRequired  = errors.New("day plan code is required")
	ErrDayPlanNameRequired  = errors.New("day plan name is required")
	ErrDayPlanCodeExists    = errors.New("day plan code already exists")
	ErrInvalidTimeRange     = errors.New("invalid time range")
	ErrInvalidBreakConfig   = errors.New("invalid break configuration")
	ErrDayPlanBreakNotFound = errors.New("day plan break not found")
	ErrDayPlanBonusNotFound = errors.New("day plan bonus not found")
	ErrInvalidRegularHours  = errors.New("regular hours must be positive")
)

// dayPlanRepository defines the interface for day plan data access.
type dayPlanRepository interface {
	Create(ctx context.Context, plan *model.DayPlan) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.DayPlan, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.DayPlan, error)
	GetWithDetails(ctx context.Context, id uuid.UUID) (*model.DayPlan, error)
	Update(ctx context.Context, plan *model.DayPlan) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, tenantID uuid.UUID) ([]model.DayPlan, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.DayPlan, error)
	ListByPlanType(ctx context.Context, tenantID uuid.UUID, planType model.PlanType) ([]model.DayPlan, error)
	AddBreak(ctx context.Context, b *model.DayPlanBreak) error
	UpdateBreak(ctx context.Context, b *model.DayPlanBreak) error
	DeleteBreak(ctx context.Context, breakID uuid.UUID) error
	GetBreak(ctx context.Context, breakID uuid.UUID) (*model.DayPlanBreak, error)
	AddBonus(ctx context.Context, b *model.DayPlanBonus) error
	UpdateBonus(ctx context.Context, b *model.DayPlanBonus) error
	DeleteBonus(ctx context.Context, bonusID uuid.UUID) error
	GetBonus(ctx context.Context, bonusID uuid.UUID) (*model.DayPlanBonus, error)
}

type DayPlanService struct {
	dayPlanRepo dayPlanRepository
}

func NewDayPlanService(dayPlanRepo dayPlanRepository) *DayPlanService {
	return &DayPlanService{dayPlanRepo: dayPlanRepo}
}

// CreateDayPlanInput represents the input for creating a day plan.
type CreateDayPlanInput struct {
	TenantID             uuid.UUID
	Code                 string
	Name                 string
	Description          *string
	PlanType             model.PlanType
	ComeFrom             *int
	ComeTo               *int
	GoFrom               *int
	GoTo                 *int
	CoreStart            *int
	CoreEnd              *int
	RegularHours         int
	ToleranceComePlus    int
	ToleranceComeMinus   int
	ToleranceGoPlus      int
	ToleranceGoMinus     int
	RoundingComeType     *model.RoundingType
	RoundingComeInterval *int
	RoundingGoType       *model.RoundingType
	RoundingGoInterval   *int
	MinWorkTime          *int
	MaxNetWorkTime       *int
}

// Create creates a new day plan with validation.
func (s *DayPlanService) Create(ctx context.Context, input CreateDayPlanInput) (*model.DayPlan, error) {
	// Validate required fields
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrDayPlanCodeRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrDayPlanNameRequired
	}
	if input.RegularHours <= 0 {
		return nil, ErrInvalidRegularHours
	}

	// Validate time ranges
	if err := s.validateTimeRanges(input.ComeFrom, input.ComeTo, input.GoFrom, input.GoTo, input.CoreStart, input.CoreEnd); err != nil {
		return nil, err
	}

	// Check for existing day plan with same code for this tenant
	existing, err := s.dayPlanRepo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrDayPlanCodeExists
	}

	// Default plan type
	planType := input.PlanType
	if planType == "" {
		planType = model.PlanTypeFixed
	}

	plan := &model.DayPlan{
		TenantID:             input.TenantID,
		Code:                 code,
		Name:                 name,
		Description:          input.Description,
		PlanType:             planType,
		ComeFrom:             input.ComeFrom,
		ComeTo:               input.ComeTo,
		GoFrom:               input.GoFrom,
		GoTo:                 input.GoTo,
		CoreStart:            input.CoreStart,
		CoreEnd:              input.CoreEnd,
		RegularHours:         input.RegularHours,
		ToleranceComePlus:    input.ToleranceComePlus,
		ToleranceComeMinus:   input.ToleranceComeMinus,
		ToleranceGoPlus:      input.ToleranceGoPlus,
		ToleranceGoMinus:     input.ToleranceGoMinus,
		RoundingComeType:     input.RoundingComeType,
		RoundingComeInterval: input.RoundingComeInterval,
		RoundingGoType:       input.RoundingGoType,
		RoundingGoInterval:   input.RoundingGoInterval,
		MinWorkTime:          input.MinWorkTime,
		MaxNetWorkTime:       input.MaxNetWorkTime,
		IsActive:             true,
	}

	if err := s.dayPlanRepo.Create(ctx, plan); err != nil {
		return nil, err
	}

	return plan, nil
}

func (s *DayPlanService) validateTimeRanges(comeFrom, comeTo, goFrom, goTo, coreStart, coreEnd *int) error {
	// Validate come_from < come_to if both set
	if comeFrom != nil && comeTo != nil {
		if *comeFrom >= *comeTo {
			return ErrInvalidTimeRange
		}
	}
	// Validate go_from < go_to if both set
	if goFrom != nil && goTo != nil {
		if *goFrom >= *goTo {
			return ErrInvalidTimeRange
		}
	}
	// Validate core_start < core_end if both set
	if coreStart != nil && coreEnd != nil {
		if *coreStart >= *coreEnd {
			return ErrInvalidTimeRange
		}
	}
	return nil
}

// GetByID retrieves a day plan by ID.
func (s *DayPlanService) GetByID(ctx context.Context, id uuid.UUID) (*model.DayPlan, error) {
	plan, err := s.dayPlanRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrDayPlanNotFound
	}
	return plan, nil
}

// GetDetails retrieves a day plan with breaks and bonuses.
func (s *DayPlanService) GetDetails(ctx context.Context, id uuid.UUID) (*model.DayPlan, error) {
	plan, err := s.dayPlanRepo.GetWithDetails(ctx, id)
	if err != nil {
		return nil, ErrDayPlanNotFound
	}
	return plan, nil
}

// GetByCode retrieves a day plan by tenant ID and code.
func (s *DayPlanService) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.DayPlan, error) {
	plan, err := s.dayPlanRepo.GetByCode(ctx, tenantID, code)
	if err != nil {
		return nil, ErrDayPlanNotFound
	}
	return plan, nil
}

// UpdateDayPlanInput represents the input for updating a day plan.
type UpdateDayPlanInput struct {
	Name                 *string
	Description          *string
	PlanType             *model.PlanType
	ComeFrom             *int
	ComeTo               *int
	GoFrom               *int
	GoTo                 *int
	CoreStart            *int
	CoreEnd              *int
	RegularHours         *int
	ToleranceComePlus    *int
	ToleranceComeMinus   *int
	ToleranceGoPlus      *int
	ToleranceGoMinus     *int
	RoundingComeType     *model.RoundingType
	RoundingComeInterval *int
	RoundingGoType       *model.RoundingType
	RoundingGoInterval   *int
	MinWorkTime          *int
	MaxNetWorkTime       *int
	IsActive             *bool
}

// Update updates a day plan.
func (s *DayPlanService) Update(ctx context.Context, id uuid.UUID, input UpdateDayPlanInput) (*model.DayPlan, error) {
	plan, err := s.dayPlanRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrDayPlanNotFound
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrDayPlanNameRequired
		}
		plan.Name = name
	}
	if input.Description != nil {
		plan.Description = input.Description
	}
	if input.PlanType != nil {
		plan.PlanType = *input.PlanType
	}
	if input.ComeFrom != nil {
		plan.ComeFrom = input.ComeFrom
	}
	if input.ComeTo != nil {
		plan.ComeTo = input.ComeTo
	}
	if input.GoFrom != nil {
		plan.GoFrom = input.GoFrom
	}
	if input.GoTo != nil {
		plan.GoTo = input.GoTo
	}
	if input.CoreStart != nil {
		plan.CoreStart = input.CoreStart
	}
	if input.CoreEnd != nil {
		plan.CoreEnd = input.CoreEnd
	}
	if input.RegularHours != nil {
		if *input.RegularHours <= 0 {
			return nil, ErrInvalidRegularHours
		}
		plan.RegularHours = *input.RegularHours
	}
	if input.ToleranceComePlus != nil {
		plan.ToleranceComePlus = *input.ToleranceComePlus
	}
	if input.ToleranceComeMinus != nil {
		plan.ToleranceComeMinus = *input.ToleranceComeMinus
	}
	if input.ToleranceGoPlus != nil {
		plan.ToleranceGoPlus = *input.ToleranceGoPlus
	}
	if input.ToleranceGoMinus != nil {
		plan.ToleranceGoMinus = *input.ToleranceGoMinus
	}
	if input.RoundingComeType != nil {
		plan.RoundingComeType = input.RoundingComeType
	}
	if input.RoundingComeInterval != nil {
		plan.RoundingComeInterval = input.RoundingComeInterval
	}
	if input.RoundingGoType != nil {
		plan.RoundingGoType = input.RoundingGoType
	}
	if input.RoundingGoInterval != nil {
		plan.RoundingGoInterval = input.RoundingGoInterval
	}
	if input.MinWorkTime != nil {
		plan.MinWorkTime = input.MinWorkTime
	}
	if input.MaxNetWorkTime != nil {
		plan.MaxNetWorkTime = input.MaxNetWorkTime
	}
	if input.IsActive != nil {
		plan.IsActive = *input.IsActive
	}

	// Validate time ranges after update
	if err := s.validateTimeRanges(plan.ComeFrom, plan.ComeTo, plan.GoFrom, plan.GoTo, plan.CoreStart, plan.CoreEnd); err != nil {
		return nil, err
	}

	if err := s.dayPlanRepo.Update(ctx, plan); err != nil {
		return nil, err
	}

	return plan, nil
}

// Delete deletes a day plan by ID.
func (s *DayPlanService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.dayPlanRepo.GetByID(ctx, id)
	if err != nil {
		return ErrDayPlanNotFound
	}
	return s.dayPlanRepo.Delete(ctx, id)
}

// List retrieves all day plans for a tenant.
func (s *DayPlanService) List(ctx context.Context, tenantID uuid.UUID) ([]model.DayPlan, error) {
	return s.dayPlanRepo.List(ctx, tenantID)
}

// ListActive retrieves all active day plans for a tenant.
func (s *DayPlanService) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.DayPlan, error) {
	return s.dayPlanRepo.ListActive(ctx, tenantID)
}

// ListByPlanType retrieves day plans of a specific type for a tenant.
func (s *DayPlanService) ListByPlanType(ctx context.Context, tenantID uuid.UUID, planType model.PlanType) ([]model.DayPlan, error) {
	return s.dayPlanRepo.ListByPlanType(ctx, tenantID, planType)
}

// Copy creates a copy of a day plan with new code and name.
func (s *DayPlanService) Copy(ctx context.Context, id uuid.UUID, newCode, newName string) (*model.DayPlan, error) {
	newCode = strings.TrimSpace(newCode)
	if newCode == "" {
		return nil, ErrDayPlanCodeRequired
	}
	newName = strings.TrimSpace(newName)
	if newName == "" {
		return nil, ErrDayPlanNameRequired
	}

	// Get original with details
	original, err := s.dayPlanRepo.GetWithDetails(ctx, id)
	if err != nil {
		return nil, ErrDayPlanNotFound
	}

	// Check new code uniqueness
	existing, _ := s.dayPlanRepo.GetByCode(ctx, original.TenantID, newCode)
	if existing != nil {
		return nil, ErrDayPlanCodeExists
	}

	// Create copy
	newPlan := &model.DayPlan{
		TenantID:             original.TenantID,
		Code:                 newCode,
		Name:                 newName,
		Description:          original.Description,
		PlanType:             original.PlanType,
		ComeFrom:             original.ComeFrom,
		ComeTo:               original.ComeTo,
		GoFrom:               original.GoFrom,
		GoTo:                 original.GoTo,
		CoreStart:            original.CoreStart,
		CoreEnd:              original.CoreEnd,
		RegularHours:         original.RegularHours,
		ToleranceComePlus:    original.ToleranceComePlus,
		ToleranceComeMinus:   original.ToleranceComeMinus,
		ToleranceGoPlus:      original.ToleranceGoPlus,
		ToleranceGoMinus:     original.ToleranceGoMinus,
		RoundingComeType:     original.RoundingComeType,
		RoundingComeInterval: original.RoundingComeInterval,
		RoundingGoType:       original.RoundingGoType,
		RoundingGoInterval:   original.RoundingGoInterval,
		MinWorkTime:          original.MinWorkTime,
		MaxNetWorkTime:       original.MaxNetWorkTime,
		IsActive:             true,
	}

	if err := s.dayPlanRepo.Create(ctx, newPlan); err != nil {
		return nil, err
	}

	// Copy breaks
	for _, b := range original.Breaks {
		newBreak := &model.DayPlanBreak{
			DayPlanID:        newPlan.ID,
			BreakType:        b.BreakType,
			StartTime:        b.StartTime,
			EndTime:          b.EndTime,
			Duration:         b.Duration,
			AfterWorkMinutes: b.AfterWorkMinutes,
			AutoDeduct:       b.AutoDeduct,
			IsPaid:           b.IsPaid,
			SortOrder:        b.SortOrder,
		}
		if err := s.dayPlanRepo.AddBreak(ctx, newBreak); err != nil {
			return nil, err
		}
	}

	// Copy bonuses
	for _, b := range original.Bonuses {
		newBonus := &model.DayPlanBonus{
			DayPlanID:        newPlan.ID,
			AccountID:        b.AccountID,
			TimeFrom:         b.TimeFrom,
			TimeTo:           b.TimeTo,
			CalculationType:  b.CalculationType,
			ValueMinutes:     b.ValueMinutes,
			MinWorkMinutes:   b.MinWorkMinutes,
			AppliesOnHoliday: b.AppliesOnHoliday,
			SortOrder:        b.SortOrder,
		}
		if err := s.dayPlanRepo.AddBonus(ctx, newBonus); err != nil {
			return nil, err
		}
	}

	return s.dayPlanRepo.GetWithDetails(ctx, newPlan.ID)
}

// CreateBreakInput represents the input for creating a break.
type CreateBreakInput struct {
	BreakType        model.BreakType
	StartTime        *int
	EndTime          *int
	Duration         int
	AfterWorkMinutes *int
	AutoDeduct       bool
	IsPaid           bool
	SortOrder        int
}

// AddBreak adds a break to a day plan.
func (s *DayPlanService) AddBreak(ctx context.Context, planID uuid.UUID, input CreateBreakInput) (*model.DayPlanBreak, error) {
	// Verify plan exists
	_, err := s.dayPlanRepo.GetByID(ctx, planID)
	if err != nil {
		return nil, ErrDayPlanNotFound
	}

	// Validate break config
	if err := s.validateBreak(input); err != nil {
		return nil, err
	}

	b := &model.DayPlanBreak{
		DayPlanID:        planID,
		BreakType:        input.BreakType,
		StartTime:        input.StartTime,
		EndTime:          input.EndTime,
		Duration:         input.Duration,
		AfterWorkMinutes: input.AfterWorkMinutes,
		AutoDeduct:       input.AutoDeduct,
		IsPaid:           input.IsPaid,
		SortOrder:        input.SortOrder,
	}

	if err := s.dayPlanRepo.AddBreak(ctx, b); err != nil {
		return nil, err
	}

	return b, nil
}

func (s *DayPlanService) validateBreak(input CreateBreakInput) error {
	switch input.BreakType {
	case model.BreakTypeFixed:
		if input.StartTime == nil || input.EndTime == nil {
			return ErrInvalidBreakConfig
		}
		if *input.StartTime >= *input.EndTime {
			return ErrInvalidTimeRange
		}
	case model.BreakTypeMinimum:
		if input.AfterWorkMinutes == nil {
			return ErrInvalidBreakConfig
		}
	case model.BreakTypeVariable:
		// Variable breaks don't require specific times
	default:
		return ErrInvalidBreakConfig
	}
	if input.Duration <= 0 {
		return ErrInvalidBreakConfig
	}
	return nil
}

// UpdateBreak updates a day plan break.
func (s *DayPlanService) UpdateBreak(ctx context.Context, breakID uuid.UUID, input CreateBreakInput) (*model.DayPlanBreak, error) {
	b, err := s.dayPlanRepo.GetBreak(ctx, breakID)
	if err != nil {
		return nil, ErrDayPlanBreakNotFound
	}

	// Validate break config
	if err := s.validateBreak(input); err != nil {
		return nil, err
	}

	b.BreakType = input.BreakType
	b.StartTime = input.StartTime
	b.EndTime = input.EndTime
	b.Duration = input.Duration
	b.AfterWorkMinutes = input.AfterWorkMinutes
	b.AutoDeduct = input.AutoDeduct
	b.IsPaid = input.IsPaid
	b.SortOrder = input.SortOrder

	if err := s.dayPlanRepo.UpdateBreak(ctx, b); err != nil {
		return nil, err
	}

	return b, nil
}

// DeleteBreak deletes a day plan break.
func (s *DayPlanService) DeleteBreak(ctx context.Context, breakID uuid.UUID) error {
	_, err := s.dayPlanRepo.GetBreak(ctx, breakID)
	if err != nil {
		return ErrDayPlanBreakNotFound
	}
	return s.dayPlanRepo.DeleteBreak(ctx, breakID)
}

// CreateBonusInput represents the input for creating a bonus.
type CreateBonusInput struct {
	AccountID        uuid.UUID
	TimeFrom         int
	TimeTo           int
	CalculationType  model.CalculationType
	ValueMinutes     int
	MinWorkMinutes   *int
	AppliesOnHoliday bool
	SortOrder        int
}

// AddBonus adds a bonus to a day plan.
func (s *DayPlanService) AddBonus(ctx context.Context, planID uuid.UUID, input CreateBonusInput) (*model.DayPlanBonus, error) {
	// Verify plan exists
	_, err := s.dayPlanRepo.GetByID(ctx, planID)
	if err != nil {
		return nil, ErrDayPlanNotFound
	}

	// Validate bonus config
	if input.TimeFrom >= input.TimeTo {
		return nil, ErrInvalidTimeRange
	}
	if input.ValueMinutes <= 0 {
		return nil, ErrInvalidBreakConfig
	}

	b := &model.DayPlanBonus{
		DayPlanID:        planID,
		AccountID:        input.AccountID,
		TimeFrom:         input.TimeFrom,
		TimeTo:           input.TimeTo,
		CalculationType:  input.CalculationType,
		ValueMinutes:     input.ValueMinutes,
		MinWorkMinutes:   input.MinWorkMinutes,
		AppliesOnHoliday: input.AppliesOnHoliday,
		SortOrder:        input.SortOrder,
	}

	if err := s.dayPlanRepo.AddBonus(ctx, b); err != nil {
		return nil, err
	}

	return b, nil
}

// UpdateBonus updates a day plan bonus.
func (s *DayPlanService) UpdateBonus(ctx context.Context, bonusID uuid.UUID, input CreateBonusInput) (*model.DayPlanBonus, error) {
	b, err := s.dayPlanRepo.GetBonus(ctx, bonusID)
	if err != nil {
		return nil, ErrDayPlanBonusNotFound
	}

	// Validate bonus config
	if input.TimeFrom >= input.TimeTo {
		return nil, ErrInvalidTimeRange
	}
	if input.ValueMinutes <= 0 {
		return nil, ErrInvalidBreakConfig
	}

	b.AccountID = input.AccountID
	b.TimeFrom = input.TimeFrom
	b.TimeTo = input.TimeTo
	b.CalculationType = input.CalculationType
	b.ValueMinutes = input.ValueMinutes
	b.MinWorkMinutes = input.MinWorkMinutes
	b.AppliesOnHoliday = input.AppliesOnHoliday
	b.SortOrder = input.SortOrder

	if err := s.dayPlanRepo.UpdateBonus(ctx, b); err != nil {
		return nil, err
	}

	return b, nil
}

// DeleteBonus deletes a day plan bonus.
func (s *DayPlanService) DeleteBonus(ctx context.Context, bonusID uuid.UUID) error {
	_, err := s.dayPlanRepo.GetBonus(ctx, bonusID)
	if err != nil {
		return ErrDayPlanBonusNotFound
	}
	return s.dayPlanRepo.DeleteBonus(ctx, bonusID)
}
