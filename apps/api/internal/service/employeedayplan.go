package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

var (
	ErrEmployeeDayPlanNotFound = errors.New("employee day plan not found")
	ErrEDPEmployeeReq          = errors.New("employee_id is required")
	ErrEDPPlanDateReq          = errors.New("plan_date is required")
	ErrEDPSourceReq            = errors.New("source is required")
	ErrEDPInvalidSource        = errors.New("invalid source (must be 'tariff', 'manual', or 'holiday')")
	ErrEDPInvalidDayPlan       = errors.New("invalid day plan reference")
	ErrEDPInvalidEmployee      = errors.New("invalid employee reference")
	ErrEDPInvalidShift         = errors.New("invalid shift reference")
	ErrEDPDateRangeReq         = errors.New("from and to dates are required")
	ErrEDPDateRangeInvalid     = errors.New("from date must not be after to date")
)

// edpRepository defines the interface for employee day plan data access.
type edpRepository interface {
	Create(ctx context.Context, plan *model.EmployeeDayPlan) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.EmployeeDayPlan, error)
	Update(ctx context.Context, plan *model.EmployeeDayPlan) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, tenantID uuid.UUID, employeeID *uuid.UUID, from, to time.Time) ([]model.EmployeeDayPlan, error)
	BulkCreate(ctx context.Context, plans []model.EmployeeDayPlan) error
	DeleteRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error
}

// employeeRepositoryForEDP defines the interface for employee lookup (used for validation).
type employeeRepositoryForEDP interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error)
}

// dayPlanRepositoryForEDP defines the interface for day plan lookup (used for validation).
type dayPlanRepositoryForEDP interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.DayPlan, error)
}

// shiftRepositoryForEDP defines the interface for shift lookup (used for validation).
type shiftRepositoryForEDP interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.Shift, error)
}

// tariffRepositoryForEDP defines the interface for tariff lookup (used for day plan generation).
type tariffRepositoryForEDP interface {
	GetWithDetails(ctx context.Context, id uuid.UUID) (*model.Tariff, error)
}

// employeeListRepositoryForEDP defines the interface for listing employees (used for bulk generation).
type employeeListRepositoryForEDP interface {
	List(ctx context.Context, filter repository.EmployeeFilter) ([]model.Employee, int64, error)
}

type EmployeeDayPlanService struct {
	edpRepo          edpRepository
	employeeRepo     employeeRepositoryForEDP
	dayPlanRepo      dayPlanRepositoryForEDP
	shiftRepo        shiftRepositoryForEDP
	tariffRepo       tariffRepositoryForEDP
	employeeListRepo employeeListRepositoryForEDP
}

func NewEmployeeDayPlanService(
	edpRepo edpRepository,
	employeeRepo employeeRepositoryForEDP,
	dayPlanRepo dayPlanRepositoryForEDP,
	shiftRepo shiftRepositoryForEDP,
) *EmployeeDayPlanService {
	return &EmployeeDayPlanService{
		edpRepo:      edpRepo,
		employeeRepo: employeeRepo,
		dayPlanRepo:  dayPlanRepo,
		shiftRepo:    shiftRepo,
	}
}

// SetTariffRepo sets the tariff repository (required for GenerateFromTariff).
func (s *EmployeeDayPlanService) SetTariffRepo(repo tariffRepositoryForEDP) {
	s.tariffRepo = repo
}

// SetEmployeeListRepo sets the employee list repository (required for GenerateFromTariff).
func (s *EmployeeDayPlanService) SetEmployeeListRepo(repo employeeListRepositoryForEDP) {
	s.employeeListRepo = repo
}

// ListInput represents the input for listing employee day plans.
type ListEmployeeDayPlansInput struct {
	TenantID   uuid.UUID
	EmployeeID *uuid.UUID
	From       time.Time
	To         time.Time
}

// List retrieves employee day plans with required date range filter.
func (s *EmployeeDayPlanService) List(ctx context.Context, input ListEmployeeDayPlansInput) ([]model.EmployeeDayPlan, error) {
	if input.From.IsZero() || input.To.IsZero() {
		return nil, ErrEDPDateRangeReq
	}
	if input.From.After(input.To) {
		return nil, ErrEDPDateRangeInvalid
	}

	return s.edpRepo.List(ctx, input.TenantID, input.EmployeeID, input.From, input.To)
}

// GetByID retrieves an employee day plan by ID.
func (s *EmployeeDayPlanService) GetByID(ctx context.Context, id uuid.UUID) (*model.EmployeeDayPlan, error) {
	plan, err := s.edpRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrEmployeeDayPlanNotFound
	}
	return plan, nil
}

// CreateEmployeeDayPlanInput represents the input for creating an employee day plan.
type CreateEmployeeDayPlanInput struct {
	TenantID   uuid.UUID
	EmployeeID uuid.UUID
	PlanDate   time.Time
	DayPlanID  *uuid.UUID
	ShiftID    *uuid.UUID
	Source     string
	Notes      string
}

// Create creates a single employee day plan.
func (s *EmployeeDayPlanService) Create(ctx context.Context, input CreateEmployeeDayPlanInput) (*model.EmployeeDayPlan, error) {
	if input.EmployeeID == uuid.Nil {
		return nil, ErrEDPEmployeeReq
	}
	if input.PlanDate.IsZero() {
		return nil, ErrEDPPlanDateReq
	}

	source := model.EmployeeDayPlanSource(input.Source)
	if source == "" {
		return nil, ErrEDPSourceReq
	}
	if !isValidSource(source) {
		return nil, ErrEDPInvalidSource
	}

	// Validate employee exists and belongs to tenant
	emp, err := s.employeeRepo.GetByID(ctx, input.EmployeeID)
	if err != nil || emp.TenantID != input.TenantID {
		return nil, ErrEDPInvalidEmployee
	}

	// Validate shift if provided; auto-populate day_plan_id from shift
	if input.ShiftID != nil {
		shift, err := s.shiftRepo.GetByID(ctx, *input.ShiftID)
		if err != nil {
			return nil, ErrEDPInvalidShift
		}
		if input.DayPlanID == nil && shift.DayPlanID != nil {
			input.DayPlanID = shift.DayPlanID
		}
	}

	// Validate day plan if provided
	if input.DayPlanID != nil {
		dp, err := s.dayPlanRepo.GetByID(ctx, *input.DayPlanID)
		if err != nil || dp.TenantID != input.TenantID {
			return nil, ErrEDPInvalidDayPlan
		}
	}

	plan := &model.EmployeeDayPlan{
		TenantID:   input.TenantID,
		EmployeeID: input.EmployeeID,
		PlanDate:   input.PlanDate,
		DayPlanID:  input.DayPlanID,
		ShiftID:    input.ShiftID,
		Source:     source,
		Notes:      input.Notes,
	}

	if err := s.edpRepo.Create(ctx, plan); err != nil {
		return nil, err
	}
	return plan, nil
}

// UpdateEmployeeDayPlanInput represents the input for updating an employee day plan.
type UpdateEmployeeDayPlanInput struct {
	DayPlanID      *uuid.UUID
	ShiftID        *uuid.UUID
	Source         *string
	Notes          *string
	ClearDayPlanID bool
	ClearShiftID   bool
}

// Update updates an employee day plan.
func (s *EmployeeDayPlanService) Update(ctx context.Context, id uuid.UUID, tenantID uuid.UUID, input UpdateEmployeeDayPlanInput) (*model.EmployeeDayPlan, error) {
	plan, err := s.edpRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrEmployeeDayPlanNotFound
	}

	if input.ClearShiftID {
		plan.ShiftID = nil
	} else if input.ShiftID != nil {
		shift, err := s.shiftRepo.GetByID(ctx, *input.ShiftID)
		if err != nil {
			return nil, ErrEDPInvalidShift
		}
		plan.ShiftID = input.ShiftID
		// Auto-populate day_plan_id from shift if not explicitly set
		if input.DayPlanID == nil && !input.ClearDayPlanID && shift.DayPlanID != nil {
			plan.DayPlanID = shift.DayPlanID
		}
	}

	if input.ClearDayPlanID {
		plan.DayPlanID = nil
	} else if input.DayPlanID != nil {
		dp, err := s.dayPlanRepo.GetByID(ctx, *input.DayPlanID)
		if err != nil || dp.TenantID != tenantID {
			return nil, ErrEDPInvalidDayPlan
		}
		plan.DayPlanID = input.DayPlanID
	}

	if input.Source != nil {
		source := model.EmployeeDayPlanSource(*input.Source)
		if !isValidSource(source) {
			return nil, ErrEDPInvalidSource
		}
		plan.Source = source
	}

	if input.Notes != nil {
		plan.Notes = *input.Notes
	}

	if err := s.edpRepo.Update(ctx, plan); err != nil {
		return nil, err
	}
	return plan, nil
}

// Delete deletes an employee day plan.
func (s *EmployeeDayPlanService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.edpRepo.GetByID(ctx, id)
	if err != nil {
		return ErrEmployeeDayPlanNotFound
	}
	return s.edpRepo.Delete(ctx, id)
}

// BulkCreateEntry represents a single entry in a bulk create request.
type BulkCreateEntry struct {
	EmployeeID uuid.UUID
	PlanDate   time.Time
	DayPlanID  *uuid.UUID
	ShiftID    *uuid.UUID
	Source     string
	Notes      string
}

// BulkCreateInput represents the input for bulk creating employee day plans.
type BulkCreateInput struct {
	TenantID uuid.UUID
	Entries  []BulkCreateEntry
}

// BulkCreate creates multiple employee day plans (upsert on employee_id + plan_date).
func (s *EmployeeDayPlanService) BulkCreate(ctx context.Context, input BulkCreateInput) ([]model.EmployeeDayPlan, error) {
	if len(input.Entries) == 0 {
		return []model.EmployeeDayPlan{}, nil
	}

	// Validate all entries
	plans := make([]model.EmployeeDayPlan, 0, len(input.Entries))
	for _, entry := range input.Entries {
		if entry.EmployeeID == uuid.Nil {
			return nil, ErrEDPEmployeeReq
		}
		if entry.PlanDate.IsZero() {
			return nil, ErrEDPPlanDateReq
		}

		source := model.EmployeeDayPlanSource(entry.Source)
		if source == "" {
			return nil, ErrEDPSourceReq
		}
		if !isValidSource(source) {
			return nil, ErrEDPInvalidSource
		}

		// Validate employee
		emp, err := s.employeeRepo.GetByID(ctx, entry.EmployeeID)
		if err != nil || emp.TenantID != input.TenantID {
			return nil, ErrEDPInvalidEmployee
		}

		// Validate shift if provided; auto-populate day_plan_id from shift
		dayPlanID := entry.DayPlanID
		if entry.ShiftID != nil {
			shift, err := s.shiftRepo.GetByID(ctx, *entry.ShiftID)
			if err != nil {
				return nil, ErrEDPInvalidShift
			}
			if dayPlanID == nil && shift.DayPlanID != nil {
				dayPlanID = shift.DayPlanID
			}
		}

		// Validate day plan if provided
		if dayPlanID != nil {
			dp, err := s.dayPlanRepo.GetByID(ctx, *dayPlanID)
			if err != nil || dp.TenantID != input.TenantID {
				return nil, ErrEDPInvalidDayPlan
			}
		}

		plans = append(plans, model.EmployeeDayPlan{
			TenantID:   input.TenantID,
			EmployeeID: entry.EmployeeID,
			PlanDate:   entry.PlanDate,
			DayPlanID:  dayPlanID,
			ShiftID:    entry.ShiftID,
			Source:     source,
			Notes:      entry.Notes,
		})
	}

	if err := s.edpRepo.BulkCreate(ctx, plans); err != nil {
		return nil, err
	}
	return plans, nil
}

// DeleteRangeInput represents the input for deleting employee day plans by date range.
type DeleteRangeInput struct {
	EmployeeID uuid.UUID
	TenantID   uuid.UUID
	From       time.Time
	To         time.Time
}

// DeleteRange deletes employee day plans for an employee within a date range.
func (s *EmployeeDayPlanService) DeleteRange(ctx context.Context, input DeleteRangeInput) error {
	if input.EmployeeID == uuid.Nil {
		return ErrEDPEmployeeReq
	}
	if input.From.IsZero() || input.To.IsZero() {
		return ErrEDPDateRangeReq
	}
	if input.From.After(input.To) {
		return ErrEDPDateRangeInvalid
	}

	// Validate employee exists and belongs to tenant
	emp, err := s.employeeRepo.GetByID(ctx, input.EmployeeID)
	if err != nil || emp.TenantID != input.TenantID {
		return ErrEDPInvalidEmployee
	}

	return s.edpRepo.DeleteRange(ctx, input.EmployeeID, input.From, input.To)
}

func isValidSource(source model.EmployeeDayPlanSource) bool {
	return source == model.EmployeeDayPlanSourceTariff ||
		source == model.EmployeeDayPlanSourceManual ||
		source == model.EmployeeDayPlanSourceHoliday
}

// GenerateFromTariffInput represents input for bulk day plan generation.
type GenerateFromTariffInput struct {
	TenantID              uuid.UUID
	EmployeeIDs           []uuid.UUID // empty = all active employees with tariff
	From                  time.Time
	To                    time.Time
	OverwriteTariffSource bool
}

// GenerateFromTariffResult represents the result of bulk generation.
type GenerateFromTariffResult struct {
	EmployeesProcessed int
	PlansCreated       int
	PlansUpdated       int
	EmployeesSkipped   int
}

var (
	ErrGenerateRepoNotConfigured = errors.New("tariff or employee list repository not configured")
)

// GenerateFromTariff expands tariff week plans into employee day plans for the specified date range.
// Respects manual overrides (source='manual' or 'holiday'). Uses upsert - safe to call multiple times.
func (s *EmployeeDayPlanService) GenerateFromTariff(
	ctx context.Context,
	input GenerateFromTariffInput,
) (*GenerateFromTariffResult, error) {
	if s.tariffRepo == nil || s.employeeListRepo == nil {
		return nil, ErrGenerateRepoNotConfigured
	}

	result := &GenerateFromTariffResult{}

	// Get employees to process
	var employees []model.Employee
	if len(input.EmployeeIDs) > 0 {
		// Fetch specific employees
		for _, empID := range input.EmployeeIDs {
			emp, err := s.employeeRepo.GetByID(ctx, empID)
			if err != nil {
				log.Warn().Err(err).Str("employee_id", empID.String()).Msg("employee not found, skipping")
				result.EmployeesSkipped++
				continue
			}
			if emp.TenantID != input.TenantID {
				log.Warn().Str("employee_id", empID.String()).Msg("employee belongs to different tenant, skipping")
				result.EmployeesSkipped++
				continue
			}
			employees = append(employees, *emp)
		}
	} else {
		// Get all active employees for the tenant
		isActive := true
		filter := repository.EmployeeFilter{
			TenantID: input.TenantID,
			IsActive: &isActive,
		}
		emps, _, err := s.employeeListRepo.List(ctx, filter)
		if err != nil {
			return nil, err
		}
		employees = emps
	}

	// Process each employee
	for _, emp := range employees {
		// Get the effective tariff ID
		tariffID := emp.TariffID
		if tariffID == nil {
			log.Debug().Str("employee_id", emp.ID.String()).Msg("employee has no tariff, skipping")
			result.EmployeesSkipped++
			continue
		}

		// Fetch tariff with details
		tariff, err := s.tariffRepo.GetWithDetails(ctx, *tariffID)
		if err != nil {
			log.Warn().Err(err).Str("employee_id", emp.ID.String()).Str("tariff_id", tariffID.String()).Msg("failed to get tariff, skipping")
			result.EmployeesSkipped++
			continue
		}

		// Calculate sync window
		start, end, ok := s.getTariffSyncWindow(&emp, tariff, input.From, input.To)
		if !ok {
			log.Debug().Str("employee_id", emp.ID.String()).Msg("no valid sync window, skipping")
			result.EmployeesSkipped++
			continue
		}

		// Get existing plans in date range
		existingPlans, err := s.edpRepo.List(ctx, input.TenantID, &emp.ID, start, end)
		if err != nil {
			log.Warn().Err(err).Str("employee_id", emp.ID.String()).Msg("failed to get existing plans, skipping")
			result.EmployeesSkipped++
			continue
		}

		// Build skip map for non-tariff sources
		skipDates := make(map[string]struct{}, len(existingPlans))
		for _, plan := range existingPlans {
			if plan.Source != model.EmployeeDayPlanSourceTariff {
				skipDates[plan.PlanDate.Format("2006-01-02")] = struct{}{}
			}
		}

		// Generate plans for each day
		var plans []model.EmployeeDayPlan
		for date := start; !date.After(end); date = date.AddDate(0, 0, 1) {
			dateKey := date.Format("2006-01-02")
			if _, ok := skipDates[dateKey]; ok {
				continue // Skip dates with manual/holiday plans
			}

			dayPlanID := tariff.GetDayPlanIDForDate(date)
			if dayPlanID == nil {
				continue // No day plan for this date
			}

			plans = append(plans, model.EmployeeDayPlan{
				TenantID:   emp.TenantID,
				EmployeeID: emp.ID,
				PlanDate:   date,
				DayPlanID:  dayPlanID,
				Source:     model.EmployeeDayPlanSourceTariff,
			})
		}

		if len(plans) > 0 {
			if err := s.edpRepo.BulkCreate(ctx, plans); err != nil {
				log.Warn().Err(err).Str("employee_id", emp.ID.String()).Msg("failed to create plans, skipping")
				result.EmployeesSkipped++
				continue
			}
			result.PlansCreated += len(plans)
		}

		result.EmployeesProcessed++
	}

	log.Info().
		Str("tenant_id", input.TenantID.String()).
		Int("employees_processed", result.EmployeesProcessed).
		Int("plans_created", result.PlansCreated).
		Int("employees_skipped", result.EmployeesSkipped).
		Msg("completed day plan generation from tariff")

	return result, nil
}

// getTariffSyncWindow calculates the valid sync window based on employee, tariff, and input constraints.
func (s *EmployeeDayPlanService) getTariffSyncWindow(emp *model.Employee, tariff *model.Tariff, inputFrom, inputTo time.Time) (time.Time, time.Time, bool) {
	// Start with input range
	start := inputFrom
	end := inputTo

	// Constrain by employee entry date
	if emp.EntryDate.After(start) {
		start = emp.EntryDate
	}

	// Constrain by employee exit date
	if emp.ExitDate != nil && emp.ExitDate.Before(end) {
		end = *emp.ExitDate
	}

	// Constrain by tariff validity
	if tariff != nil && tariff.ValidFrom != nil {
		validFrom := tariff.ValidFrom.Truncate(24 * time.Hour)
		if validFrom.After(start) {
			start = validFrom
		}
	}
	if tariff != nil && tariff.ValidTo != nil {
		validTo := tariff.ValidTo.Truncate(24 * time.Hour)
		if validTo.Before(end) {
			end = validTo
		}
	}

	// Check if window is valid
	if start.After(end) {
		return start, end, false
	}

	return start, end, true
}
