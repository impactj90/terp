package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrTariffNotFound          = errors.New("tariff not found")
	ErrTariffCodeExists        = errors.New("tariff code already exists")
	ErrTariffCodeReq           = errors.New("tariff code is required")
	ErrTariffNameReq           = errors.New("tariff name is required")
	ErrInvalidWeekPlan         = errors.New("invalid week plan reference")
	ErrTariffBreakNotFound     = errors.New("tariff break not found")
	ErrInvalidBreakType        = errors.New("invalid break type")
	ErrBreakDurationReq        = errors.New("break duration is required")
	ErrInvalidVacationBasis    = errors.New("invalid vacation basis (must be 'calendar_year' or 'entry_date')")
	ErrInvalidCreditType       = errors.New("invalid credit type (must be 'no_evaluation', 'complete', 'after_threshold', or 'no_carryover')")
	ErrInvalidWorkDays         = errors.New("work days per week must be between 1 and 7")
	ErrInvalidRhythmType       = errors.New("invalid rhythm type (must be 'weekly', 'rolling_weekly', or 'x_days')")
	ErrInvalidCycleDays        = errors.New("cycle days must be between 1 and 365")
	ErrCycleDaysRequired       = errors.New("cycle_days is required for x_days rhythm")
	ErrWeekPlansRequired       = errors.New("week_plan_ids are required for rolling_weekly rhythm")
	ErrInvalidDayPosition      = errors.New("day position must be between 1 and cycle_days")
	ErrRhythmStartDateRequired = errors.New("rhythm_start_date is required for rolling_weekly and x_days rhythms")
	// Note: ErrInvalidDayPlan is defined in weekplan.go
)

// tariffRepository defines the interface for tariff data access.
type tariffRepository interface {
	Create(ctx context.Context, tariff *model.Tariff) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.Tariff, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.Tariff, error)
	GetWithDetails(ctx context.Context, id uuid.UUID) (*model.Tariff, error)
	Update(ctx context.Context, tariff *model.Tariff) error
	Upsert(ctx context.Context, tariff *model.Tariff) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, tenantID uuid.UUID) ([]model.Tariff, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.Tariff, error)
	CreateBreak(ctx context.Context, tariffBreak *model.TariffBreak) error
	GetBreakByID(ctx context.Context, id uuid.UUID) (*model.TariffBreak, error)
	DeleteBreak(ctx context.Context, id uuid.UUID) error
	ListBreaks(ctx context.Context, tariffID uuid.UUID) ([]model.TariffBreak, error)
	// Rhythm-related methods
	ReplaceTariffWeekPlans(ctx context.Context, tariffID uuid.UUID, weekPlans []model.TariffWeekPlan) error
	DeleteTariffWeekPlans(ctx context.Context, tariffID uuid.UUID) error
	ReplaceTariffDayPlans(ctx context.Context, tariffID uuid.UUID, dayPlans []model.TariffDayPlan) error
	DeleteTariffDayPlans(ctx context.Context, tariffID uuid.UUID) error
}

// weekPlanRepositoryForTariff defines the interface for week plan lookup (used for validation).
type weekPlanRepositoryForTariff interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.WeekPlan, error)
}

// dayPlanRepositoryForTariff defines the interface for day plan lookup (used for validation).
type dayPlanRepositoryForTariff interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.DayPlan, error)
}

type TariffService struct {
	tariffRepo   tariffRepository
	weekPlanRepo weekPlanRepositoryForTariff
	dayPlanRepo  dayPlanRepositoryForTariff
}

func NewTariffService(tariffRepo tariffRepository, weekPlanRepo weekPlanRepositoryForTariff, dayPlanRepo dayPlanRepositoryForTariff) *TariffService {
	return &TariffService{
		tariffRepo:   tariffRepo,
		weekPlanRepo: weekPlanRepo,
		dayPlanRepo:  dayPlanRepo,
	}
}

// TariffDayPlanInput represents a day plan assignment for x_days rhythm.
type TariffDayPlanInput struct {
	DayPosition int        // 1-based position in cycle
	DayPlanID   *uuid.UUID // NULL = off day
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

	// ZMI Rhythm Fields
	RhythmType      model.RhythmType
	CycleDays       *int
	RhythmStartDate *time.Time
	WeekPlanIDs     []uuid.UUID          // For rolling_weekly: ordered list of week plan IDs
	DayPlans        []TariffDayPlanInput // For x_days: day plans per position

	// ZMI Vacation Fields
	AnnualVacationDays         *decimal.Decimal
	WorkDaysPerWeek            *int
	VacationBasis              model.VacationBasis
	VacationCappingRuleGroupID *uuid.UUID

	// ZMI Target Hours Fields
	DailyTargetHours   *decimal.Decimal
	WeeklyTargetHours  *decimal.Decimal
	MonthlyTargetHours *decimal.Decimal
	AnnualTargetHours  *decimal.Decimal

	// ZMI Flextime Fields
	MaxFlextimePerMonth *int
	UpperLimitAnnual    *int
	LowerLimitAnnual    *int
	FlextimeThreshold   *int
	CreditType          model.CreditType
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

	// Default rhythm type to weekly
	rhythmType := input.RhythmType
	if rhythmType == "" {
		rhythmType = model.RhythmTypeWeekly
	}

	// Validate rhythm type
	if rhythmType != model.RhythmTypeWeekly &&
		rhythmType != model.RhythmTypeRollingWeekly &&
		rhythmType != model.RhythmTypeXDays {
		return nil, ErrInvalidRhythmType
	}

	// Validate rhythm-specific fields
	switch rhythmType {
	case model.RhythmTypeWeekly:
		// For weekly rhythm, validate single week plan if provided
		if input.WeekPlanID != nil {
			plan, err := s.weekPlanRepo.GetByID(ctx, *input.WeekPlanID)
			if err != nil || plan.TenantID != input.TenantID {
				return nil, ErrInvalidWeekPlan
			}
		}

	case model.RhythmTypeRollingWeekly:
		// For rolling weekly, require week plan list
		if len(input.WeekPlanIDs) == 0 {
			return nil, ErrWeekPlansRequired
		}
		// Require rhythm_start_date
		if input.RhythmStartDate == nil {
			return nil, ErrRhythmStartDateRequired
		}
		// Validate all week plans
		for _, wpID := range input.WeekPlanIDs {
			plan, err := s.weekPlanRepo.GetByID(ctx, wpID)
			if err != nil || plan.TenantID != input.TenantID {
				return nil, ErrInvalidWeekPlan
			}
		}

	case model.RhythmTypeXDays:
		// For x_days, require cycle_days
		if input.CycleDays == nil {
			return nil, ErrCycleDaysRequired
		}
		// Require rhythm_start_date
		if input.RhythmStartDate == nil {
			return nil, ErrRhythmStartDateRequired
		}
		if *input.CycleDays < 1 || *input.CycleDays > 365 {
			return nil, ErrInvalidCycleDays
		}
		// Validate day plans
		for _, dp := range input.DayPlans {
			if dp.DayPosition < 1 || dp.DayPosition > *input.CycleDays {
				return nil, ErrInvalidDayPosition
			}
			if dp.DayPlanID != nil {
				plan, err := s.dayPlanRepo.GetByID(ctx, *dp.DayPlanID)
				if err != nil || plan.TenantID != input.TenantID {
					return nil, ErrInvalidDayPlan
				}
			}
		}
	}

	// Validate ZMI fields
	if input.VacationBasis != "" &&
		input.VacationBasis != model.VacationBasisCalendarYear &&
		input.VacationBasis != model.VacationBasisEntryDate {
		return nil, ErrInvalidVacationBasis
	}

	if input.CreditType != "" &&
		input.CreditType != model.CreditTypeNoEvaluation &&
		input.CreditType != model.CreditTypeComplete &&
		input.CreditType != model.CreditTypeAfterThreshold &&
		input.CreditType != model.CreditTypeNoCarryover {
		return nil, ErrInvalidCreditType
	}

	if input.WorkDaysPerWeek != nil && (*input.WorkDaysPerWeek < 1 || *input.WorkDaysPerWeek > 7) {
		return nil, ErrInvalidWorkDays
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

		// ZMI Rhythm Fields
		RhythmType:      rhythmType,
		CycleDays:       input.CycleDays,
		RhythmStartDate: input.RhythmStartDate,

		// ZMI Vacation Fields
		AnnualVacationDays:         input.AnnualVacationDays,
		WorkDaysPerWeek:            input.WorkDaysPerWeek,
		VacationBasis:              input.VacationBasis,
		VacationCappingRuleGroupID: input.VacationCappingRuleGroupID,

		// ZMI Target Hours Fields
		DailyTargetHours:   input.DailyTargetHours,
		WeeklyTargetHours:  input.WeeklyTargetHours,
		MonthlyTargetHours: input.MonthlyTargetHours,
		AnnualTargetHours:  input.AnnualTargetHours,

		// ZMI Flextime Fields
		MaxFlextimePerMonth: input.MaxFlextimePerMonth,
		UpperLimitAnnual:    input.UpperLimitAnnual,
		LowerLimitAnnual:    input.LowerLimitAnnual,
		FlextimeThreshold:   input.FlextimeThreshold,
		CreditType:          input.CreditType,
	}

	if err := s.tariffRepo.Create(ctx, tariff); err != nil {
		return nil, err
	}

	// Create rhythm-specific data
	switch rhythmType {
	case model.RhythmTypeRollingWeekly:
		if len(input.WeekPlanIDs) > 0 {
			weekPlans := make([]model.TariffWeekPlan, len(input.WeekPlanIDs))
			for i, wpID := range input.WeekPlanIDs {
				weekPlans[i] = model.TariffWeekPlan{
					TariffID:      tariff.ID,
					WeekPlanID:    wpID,
					SequenceOrder: i + 1, // 1-based
				}
			}
			if err := s.tariffRepo.ReplaceTariffWeekPlans(ctx, tariff.ID, weekPlans); err != nil {
				return nil, err
			}
		}

	case model.RhythmTypeXDays:
		if len(input.DayPlans) > 0 {
			dayPlans := make([]model.TariffDayPlan, len(input.DayPlans))
			for i, dp := range input.DayPlans {
				dayPlans[i] = model.TariffDayPlan{
					TariffID:    tariff.ID,
					DayPosition: dp.DayPosition,
					DayPlanID:   dp.DayPlanID,
				}
			}
			if err := s.tariffRepo.ReplaceTariffDayPlans(ctx, tariff.ID, dayPlans); err != nil {
				return nil, err
			}
		}
	}

	// Return tariff with details
	return s.tariffRepo.GetWithDetails(ctx, tariff.ID)
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

	// ZMI Rhythm Fields
	RhythmType           *model.RhythmType
	CycleDays            *int
	RhythmStartDate      *time.Time
	WeekPlanIDs          []uuid.UUID          // For rolling_weekly: ordered list of week plan IDs
	DayPlans             []TariffDayPlanInput // For x_days: day plans per position
	ClearCycleDays       bool
	ClearRhythmStartDate bool

	// ZMI Vacation Fields
	AnnualVacationDays              *decimal.Decimal
	WorkDaysPerWeek                 *int
	VacationBasis                   *model.VacationBasis
	VacationCappingRuleGroupID      *uuid.UUID
	ClearAnnualVacationDays         bool
	ClearVacationCappingRuleGroupID bool

	// ZMI Target Hours Fields
	DailyTargetHours        *decimal.Decimal
	WeeklyTargetHours       *decimal.Decimal
	MonthlyTargetHours      *decimal.Decimal
	AnnualTargetHours       *decimal.Decimal
	ClearDailyTargetHours   bool
	ClearWeeklyTargetHours  bool
	ClearMonthlyTargetHours bool
	ClearAnnualTargetHours  bool

	// ZMI Flextime Fields
	MaxFlextimePerMonth      *int
	UpperLimitAnnual         *int
	LowerLimitAnnual         *int
	FlextimeThreshold        *int
	CreditType               *model.CreditType
	ClearMaxFlextimePerMonth bool
	ClearUpperLimitAnnual    bool
	ClearLowerLimitAnnual    bool
	ClearFlextimeThreshold   bool
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

	// =====================================================
	// ZMI RHYTHM FIELDS
	// =====================================================

	// Determine the rhythm type to use for validation
	rhythmType := tariff.RhythmType
	if input.RhythmType != nil {
		rhythmType = *input.RhythmType
	}

	// Validate rhythm type if being updated
	if input.RhythmType != nil {
		if *input.RhythmType != model.RhythmTypeWeekly &&
			*input.RhythmType != model.RhythmTypeRollingWeekly &&
			*input.RhythmType != model.RhythmTypeXDays {
			return nil, ErrInvalidRhythmType
		}
		tariff.RhythmType = *input.RhythmType
	}

	// Handle cycle_days
	if input.ClearCycleDays {
		tariff.CycleDays = nil
	} else if input.CycleDays != nil {
		if *input.CycleDays < 1 || *input.CycleDays > 365 {
			return nil, ErrInvalidCycleDays
		}
		tariff.CycleDays = input.CycleDays
	}

	// Handle rhythm_start_date
	if input.ClearRhythmStartDate {
		tariff.RhythmStartDate = nil
	} else if input.RhythmStartDate != nil {
		tariff.RhythmStartDate = input.RhythmStartDate
	}

	// Validate rhythm-specific requirements
	switch rhythmType {
	case model.RhythmTypeRollingWeekly:
		// Validate week plan IDs if provided
		if len(input.WeekPlanIDs) > 0 {
			for _, wpID := range input.WeekPlanIDs {
				plan, err := s.weekPlanRepo.GetByID(ctx, wpID)
				if err != nil || plan.TenantID != tenantID {
					return nil, ErrInvalidWeekPlan
				}
			}
		}

	case model.RhythmTypeXDays:
		// Get effective cycle_days for validation
		cycleDays := tariff.CycleDays
		if input.CycleDays != nil {
			cycleDays = input.CycleDays
		}
		// Validate day plans if provided
		if len(input.DayPlans) > 0 && cycleDays != nil {
			for _, dp := range input.DayPlans {
				if dp.DayPosition < 1 || dp.DayPosition > *cycleDays {
					return nil, ErrInvalidDayPosition
				}
				if dp.DayPlanID != nil {
					plan, err := s.dayPlanRepo.GetByID(ctx, *dp.DayPlanID)
					if err != nil || plan.TenantID != tenantID {
						return nil, ErrInvalidDayPlan
					}
				}
			}
		}
	}

	// =====================================================
	// ZMI VACATION FIELDS
	// =====================================================

	if input.ClearAnnualVacationDays {
		tariff.AnnualVacationDays = nil
	} else if input.AnnualVacationDays != nil {
		tariff.AnnualVacationDays = input.AnnualVacationDays
	}

	if input.WorkDaysPerWeek != nil {
		if *input.WorkDaysPerWeek < 1 || *input.WorkDaysPerWeek > 7 {
			return nil, ErrInvalidWorkDays
		}
		tariff.WorkDaysPerWeek = input.WorkDaysPerWeek
	}

	if input.VacationBasis != nil {
		if *input.VacationBasis != model.VacationBasisCalendarYear &&
			*input.VacationBasis != model.VacationBasisEntryDate {
			return nil, ErrInvalidVacationBasis
		}
		tariff.VacationBasis = *input.VacationBasis
	}
	if input.ClearVacationCappingRuleGroupID {
		tariff.VacationCappingRuleGroupID = nil
	} else if input.VacationCappingRuleGroupID != nil {
		tariff.VacationCappingRuleGroupID = input.VacationCappingRuleGroupID
	}

	// =====================================================
	// ZMI TARGET HOURS FIELDS
	// =====================================================

	if input.ClearDailyTargetHours {
		tariff.DailyTargetHours = nil
	} else if input.DailyTargetHours != nil {
		tariff.DailyTargetHours = input.DailyTargetHours
	}

	if input.ClearWeeklyTargetHours {
		tariff.WeeklyTargetHours = nil
	} else if input.WeeklyTargetHours != nil {
		tariff.WeeklyTargetHours = input.WeeklyTargetHours
	}

	if input.ClearMonthlyTargetHours {
		tariff.MonthlyTargetHours = nil
	} else if input.MonthlyTargetHours != nil {
		tariff.MonthlyTargetHours = input.MonthlyTargetHours
	}

	if input.ClearAnnualTargetHours {
		tariff.AnnualTargetHours = nil
	} else if input.AnnualTargetHours != nil {
		tariff.AnnualTargetHours = input.AnnualTargetHours
	}

	// =====================================================
	// ZMI FLEXTIME FIELDS
	// =====================================================

	if input.ClearMaxFlextimePerMonth {
		tariff.MaxFlextimePerMonth = nil
	} else if input.MaxFlextimePerMonth != nil {
		tariff.MaxFlextimePerMonth = input.MaxFlextimePerMonth
	}

	if input.ClearUpperLimitAnnual {
		tariff.UpperLimitAnnual = nil
	} else if input.UpperLimitAnnual != nil {
		tariff.UpperLimitAnnual = input.UpperLimitAnnual
	}

	if input.ClearLowerLimitAnnual {
		tariff.LowerLimitAnnual = nil
	} else if input.LowerLimitAnnual != nil {
		tariff.LowerLimitAnnual = input.LowerLimitAnnual
	}

	if input.ClearFlextimeThreshold {
		tariff.FlextimeThreshold = nil
	} else if input.FlextimeThreshold != nil {
		tariff.FlextimeThreshold = input.FlextimeThreshold
	}

	if input.CreditType != nil {
		if *input.CreditType != model.CreditTypeNoEvaluation &&
			*input.CreditType != model.CreditTypeComplete &&
			*input.CreditType != model.CreditTypeAfterThreshold &&
			*input.CreditType != model.CreditTypeNoCarryover {
			return nil, ErrInvalidCreditType
		}
		tariff.CreditType = *input.CreditType
	}

	if err := s.tariffRepo.Update(ctx, tariff); err != nil {
		return nil, err
	}

	// Update rhythm-specific data
	switch rhythmType {
	case model.RhythmTypeRollingWeekly:
		// Update week plans if provided
		if len(input.WeekPlanIDs) > 0 {
			weekPlans := make([]model.TariffWeekPlan, len(input.WeekPlanIDs))
			for i, wpID := range input.WeekPlanIDs {
				weekPlans[i] = model.TariffWeekPlan{
					TariffID:      tariff.ID,
					WeekPlanID:    wpID,
					SequenceOrder: i + 1,
				}
			}
			if err := s.tariffRepo.ReplaceTariffWeekPlans(ctx, tariff.ID, weekPlans); err != nil {
				return nil, err
			}
		}
		// Clear day plans when switching to rolling_weekly
		if input.RhythmType != nil {
			if err := s.tariffRepo.DeleteTariffDayPlans(ctx, tariff.ID); err != nil {
				return nil, err
			}
		}

	case model.RhythmTypeXDays:
		// Update day plans if provided
		if len(input.DayPlans) > 0 {
			dayPlans := make([]model.TariffDayPlan, len(input.DayPlans))
			for i, dp := range input.DayPlans {
				dayPlans[i] = model.TariffDayPlan{
					TariffID:    tariff.ID,
					DayPosition: dp.DayPosition,
					DayPlanID:   dp.DayPlanID,
				}
			}
			if err := s.tariffRepo.ReplaceTariffDayPlans(ctx, tariff.ID, dayPlans); err != nil {
				return nil, err
			}
		}
		// Clear week plans when switching to x_days
		if input.RhythmType != nil {
			if err := s.tariffRepo.DeleteTariffWeekPlans(ctx, tariff.ID); err != nil {
				return nil, err
			}
		}

	case model.RhythmTypeWeekly:
		// Clear rhythm-specific data when switching back to weekly
		if input.RhythmType != nil {
			if err := s.tariffRepo.DeleteTariffWeekPlans(ctx, tariff.ID); err != nil {
				return nil, err
			}
			if err := s.tariffRepo.DeleteTariffDayPlans(ctx, tariff.ID); err != nil {
				return nil, err
			}
		}
	}

	// Return tariff with all details
	return s.tariffRepo.GetWithDetails(ctx, tariff.ID)
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

// UpsertDevTariff creates or updates a tariff for dev seeding (idempotent).
func (s *TariffService) UpsertDevTariff(ctx context.Context, tariff *model.Tariff) error {
	return s.tariffRepo.Upsert(ctx, tariff)
}
