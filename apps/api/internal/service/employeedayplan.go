package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrEmployeeDayPlanNotFound = errors.New("employee day plan not found")
	ErrEDPEmployeeReq          = errors.New("employee_id is required")
	ErrEDPPlanDateReq          = errors.New("plan_date is required")
	ErrEDPSourceReq            = errors.New("source is required")
	ErrEDPInvalidSource        = errors.New("invalid source (must be 'tariff', 'manual', or 'holiday')")
	ErrEDPInvalidDayPlan       = errors.New("invalid day plan reference")
	ErrEDPInvalidEmployee      = errors.New("invalid employee reference")
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

type EmployeeDayPlanService struct {
	edpRepo      edpRepository
	employeeRepo employeeRepositoryForEDP
	dayPlanRepo  dayPlanRepositoryForEDP
}

func NewEmployeeDayPlanService(
	edpRepo edpRepository,
	employeeRepo employeeRepositoryForEDP,
	dayPlanRepo dayPlanRepositoryForEDP,
) *EmployeeDayPlanService {
	return &EmployeeDayPlanService{
		edpRepo:      edpRepo,
		employeeRepo: employeeRepo,
		dayPlanRepo:  dayPlanRepo,
	}
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
	Source         *string
	Notes          *string
	ClearDayPlanID bool
}

// Update updates an employee day plan.
func (s *EmployeeDayPlanService) Update(ctx context.Context, id uuid.UUID, tenantID uuid.UUID, input UpdateEmployeeDayPlanInput) (*model.EmployeeDayPlan, error) {
	plan, err := s.edpRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrEmployeeDayPlanNotFound
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

// BulkCreateInput represents a single entry in a bulk create request.
type BulkCreateEntry struct {
	EmployeeID uuid.UUID
	PlanDate   time.Time
	DayPlanID  *uuid.UUID
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

		// Validate day plan if provided
		if entry.DayPlanID != nil {
			dp, err := s.dayPlanRepo.GetByID(ctx, *entry.DayPlanID)
			if err != nil || dp.TenantID != input.TenantID {
				return nil, ErrEDPInvalidDayPlan
			}
		}

		plans = append(plans, model.EmployeeDayPlan{
			TenantID:   input.TenantID,
			EmployeeID: entry.EmployeeID,
			PlanDate:   entry.PlanDate,
			DayPlanID:  entry.DayPlanID,
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
