package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/internal/model"
)

// Absence service errors.
var (
	ErrAbsenceNotFound      = errors.New("absence not found")
	ErrInvalidAbsenceType   = errors.New("invalid absence type")
	ErrAbsenceTypeInactive  = errors.New("absence type is inactive")
	ErrAbsenceAlreadyExists = errors.New("absence already exists on date")
	ErrInvalidAbsenceDates  = errors.New("from date must be before or equal to to date")
	ErrNoAbsenceDaysCreated = errors.New("no valid absence days in range (all dates skipped)")
)

// absenceDayRepositoryForService defines the interface for absence day data access.
type absenceDayRepositoryForService interface {
	Create(ctx context.Context, ad *model.AbsenceDay) error
	CreateRange(ctx context.Context, days []model.AbsenceDay) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceDay, error)
	GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.AbsenceDay, error)
	GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.AbsenceDay, error)
	ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.AbsenceDay, error)
	Delete(ctx context.Context, id uuid.UUID) error
	DeleteRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error
}

// absenceTypeRepositoryForService defines the interface for absence type validation.
type absenceTypeRepositoryForService interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceType, error)
	List(ctx context.Context, tenantID uuid.UUID, includeSystem bool) ([]model.AbsenceType, error)
	Upsert(ctx context.Context, at *model.AbsenceType) error
}

// holidayRepositoryForAbsence defines the interface for holiday lookups.
type holidayRepositoryForAbsence interface {
	GetByDateRange(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]model.Holiday, error)
}

// empDayPlanRepositoryForAbsence defines the interface for employee day plan lookups.
type empDayPlanRepositoryForAbsence interface {
	GetForEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.EmployeeDayPlan, error)
}

// recalcServiceForAbsence defines the interface for triggering recalculation.
type recalcServiceForAbsence interface {
	TriggerRecalc(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*RecalcResult, error)
	TriggerRecalcRange(ctx context.Context, tenantID, employeeID uuid.UUID, from, to time.Time) (*RecalcResult, error)
}

// AbsenceService handles absence business logic.
type AbsenceService struct {
	absenceDayRepo  absenceDayRepositoryForService
	absenceTypeRepo absenceTypeRepositoryForService
	holidayRepo     holidayRepositoryForAbsence
	empDayPlanRepo  empDayPlanRepositoryForAbsence
	recalcSvc       recalcServiceForAbsence
}

// NewAbsenceService creates a new AbsenceService instance.
func NewAbsenceService(
	absenceDayRepo absenceDayRepositoryForService,
	absenceTypeRepo absenceTypeRepositoryForService,
	holidayRepo holidayRepositoryForAbsence,
	empDayPlanRepo empDayPlanRepositoryForAbsence,
	recalcSvc recalcServiceForAbsence,
) *AbsenceService {
	return &AbsenceService{
		absenceDayRepo:  absenceDayRepo,
		absenceTypeRepo: absenceTypeRepo,
		holidayRepo:     holidayRepo,
		empDayPlanRepo:  empDayPlanRepo,
		recalcSvc:       recalcSvc,
	}
}

// CreateAbsenceRangeInput represents the input for creating absences over a date range.
type CreateAbsenceRangeInput struct {
	TenantID      uuid.UUID
	EmployeeID    uuid.UUID
	AbsenceTypeID uuid.UUID
	FromDate      time.Time
	ToDate        time.Time
	Duration      decimal.Decimal      // 1.00 = full day, 0.50 = half day
	HalfDayPeriod *model.HalfDayPeriod // Required when Duration = 0.5
	Status        model.AbsenceStatus  // Typically "pending" or "approved" for admin
	Notes         *string
	CreatedBy     *uuid.UUID
}

// CreateAbsenceRangeResult contains the result of a range creation.
type CreateAbsenceRangeResult struct {
	CreatedDays  []model.AbsenceDay
	SkippedDates []time.Time // Dates skipped (weekends, holidays, off-days, existing absences)
}

// ListTypes retrieves all absence types for a tenant, including system types.
func (s *AbsenceService) ListTypes(ctx context.Context, tenantID uuid.UUID) ([]model.AbsenceType, error) {
	return s.absenceTypeRepo.List(ctx, tenantID, true)
}

// GetByID retrieves an absence day by ID.
func (s *AbsenceService) GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceDay, error) {
	ad, err := s.absenceDayRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrAbsenceNotFound
	}
	return ad, nil
}

// ListByEmployee retrieves all absence days for an employee.
func (s *AbsenceService) ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.AbsenceDay, error) {
	return s.absenceDayRepo.ListByEmployee(ctx, employeeID)
}

// GetByEmployeeDateRange retrieves absence days for an employee within a date range.
func (s *AbsenceService) GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.AbsenceDay, error) {
	if from.After(to) {
		return nil, ErrInvalidAbsenceDates
	}
	return s.absenceDayRepo.GetByEmployeeDateRange(ctx, employeeID, from, to)
}

// Delete deletes a single absence day by ID and triggers recalculation.
func (s *AbsenceService) Delete(ctx context.Context, id uuid.UUID) error {
	// Get the absence to know the employee/date for recalc
	ad, err := s.absenceDayRepo.GetByID(ctx, id)
	if err != nil {
		return ErrAbsenceNotFound
	}

	// Store values for recalc before deletion
	tenantID := ad.TenantID
	employeeID := ad.EmployeeID
	absenceDate := ad.AbsenceDate

	// Delete the absence day
	if err := s.absenceDayRepo.Delete(ctx, id); err != nil {
		return err
	}

	// Trigger recalculation for the affected date
	_, _ = s.recalcSvc.TriggerRecalc(ctx, tenantID, employeeID, absenceDate)

	return nil
}

// DeleteRange deletes all absence days for an employee within a date range and triggers recalculation.
func (s *AbsenceService) DeleteRange(ctx context.Context, tenantID, employeeID uuid.UUID, from, to time.Time) error {
	if from.After(to) {
		return ErrInvalidAbsenceDates
	}

	// Delete all absence days in the range
	if err := s.absenceDayRepo.DeleteRange(ctx, employeeID, from, to); err != nil {
		return err
	}

	// Trigger recalculation for the affected range
	_, _ = s.recalcSvc.TriggerRecalcRange(ctx, tenantID, employeeID, from, to)

	return nil
}

// CreateRange creates absence days for a date range, skipping weekends, holidays, and off-days.
// Dates with existing absences are also skipped (not an error).
// Returns the created days and all skipped dates.
func (s *AbsenceService) CreateRange(ctx context.Context, input CreateAbsenceRangeInput) (*CreateAbsenceRangeResult, error) {
	// Validate date range
	if input.FromDate.After(input.ToDate) {
		return nil, ErrInvalidAbsenceDates
	}

	// Validate absence type exists and is active
	absenceType, err := s.absenceTypeRepo.GetByID(ctx, input.AbsenceTypeID)
	if err != nil {
		return nil, ErrInvalidAbsenceType
	}
	if !absenceType.IsActive {
		return nil, ErrAbsenceTypeInactive
	}
	// Validate absence type is accessible by tenant (system types have nil TenantID)
	if absenceType.TenantID != nil && *absenceType.TenantID != input.TenantID {
		return nil, ErrInvalidAbsenceType
	}

	// Batch-fetch holidays for the range
	holidays, err := s.holidayRepo.GetByDateRange(ctx, input.TenantID, input.FromDate, input.ToDate)
	if err != nil {
		return nil, err
	}
	holidaySet := buildHolidaySet(holidays)

	// Batch-fetch day plans for the range
	dayPlans, err := s.empDayPlanRepo.GetForEmployeeDateRange(ctx, input.EmployeeID, input.FromDate, input.ToDate)
	if err != nil {
		return nil, err
	}
	dayPlanMap := buildDayPlanMap(dayPlans)

	// Iterate through each date in the range
	var daysToCreate []model.AbsenceDay
	var skippedDates []time.Time

	current := normalizeDate(input.FromDate)
	toDate := normalizeDate(input.ToDate)
	for !current.After(toDate) {
		// Check if date should be skipped (weekend/holiday/off-day)
		skip, _ := s.shouldSkipDate(current, holidaySet, dayPlanMap)
		if skip {
			skippedDates = append(skippedDates, current)
			current = current.AddDate(0, 0, 1)
			continue
		}

		// Check if absence already exists on this date
		existing, err := s.absenceDayRepo.GetByEmployeeDate(ctx, input.EmployeeID, current)
		if err != nil {
			return nil, err
		}
		if existing != nil {
			skippedDates = append(skippedDates, current)
			current = current.AddDate(0, 0, 1)
			continue
		}

		// Build absence day record
		ad := model.AbsenceDay{
			TenantID:      input.TenantID,
			EmployeeID:    input.EmployeeID,
			AbsenceDate:   current,
			AbsenceTypeID: input.AbsenceTypeID,
			Duration:      input.Duration,
			HalfDayPeriod: input.HalfDayPeriod,
			Status:        input.Status,
			Notes:         input.Notes,
			CreatedBy:     input.CreatedBy,
		}
		daysToCreate = append(daysToCreate, ad)

		current = current.AddDate(0, 0, 1)
	}

	// Check that at least one day was created
	if len(daysToCreate) == 0 {
		return nil, ErrNoAbsenceDaysCreated
	}

	// Batch-create all absence days
	if err := s.absenceDayRepo.CreateRange(ctx, daysToCreate); err != nil {
		return nil, err
	}

	// Trigger recalculation for the affected range
	_, _ = s.recalcSvc.TriggerRecalcRange(ctx, input.TenantID, input.EmployeeID, input.FromDate, input.ToDate)

	return &CreateAbsenceRangeResult{
		CreatedDays:  daysToCreate,
		SkippedDates: skippedDates,
	}, nil
}

// buildHolidaySet creates a set of holiday dates for O(1) lookup.
func buildHolidaySet(holidays []model.Holiday) map[time.Time]bool {
	set := make(map[time.Time]bool, len(holidays))
	for _, h := range holidays {
		date := normalizeDate(h.HolidayDate)
		set[date] = true
	}
	return set
}

// buildDayPlanMap creates a map from date to day plan for O(1) lookup.
func buildDayPlanMap(plans []model.EmployeeDayPlan) map[time.Time]*model.EmployeeDayPlan {
	m := make(map[time.Time]*model.EmployeeDayPlan, len(plans))
	for i := range plans {
		date := normalizeDate(plans[i].PlanDate)
		m[date] = &plans[i]
	}
	return m
}

// skipReason describes why a date was skipped during absence range creation.
type skipReason string

const (
	skipReasonWeekend  skipReason = "weekend"
	skipReasonHoliday  skipReason = "holiday"
	skipReasonOffDay   skipReason = "off_day"
	skipReasonNoPlan   skipReason = "no_plan"
	skipReasonExisting skipReason = "existing_absence"
)

// shouldSkipDate determines whether to skip creating an absence on this date.
// Always skips: weekends, holidays, off-days (no plan or DayPlanID == nil).
func (s *AbsenceService) shouldSkipDate(
	date time.Time,
	holidaySet map[time.Time]bool,
	dayPlanMap map[time.Time]*model.EmployeeDayPlan,
) (bool, skipReason) {
	normalized := normalizeDate(date)

	// Skip weekends
	weekday := normalized.Weekday()
	if weekday == time.Saturday || weekday == time.Sunday {
		return true, skipReasonWeekend
	}

	// Skip holidays
	if holidaySet[normalized] {
		return true, skipReasonHoliday
	}

	// Skip off-days: no plan record means no scheduled work
	plan, exists := dayPlanMap[normalized]
	if !exists {
		return true, skipReasonNoPlan
	}
	// Explicit off day: plan exists but DayPlanID is nil
	if plan.DayPlanID == nil {
		return true, skipReasonOffDay
	}

	return false, ""
}

// normalizeDate strips time components, keeping only the date at midnight UTC.
func normalizeDate(d time.Time) time.Time {
	return time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, time.UTC)
}

// UpsertDevAbsenceType ensures a dev absence type exists in the database as a system type.
func (s *AbsenceService) UpsertDevAbsenceType(ctx context.Context, at *model.AbsenceType) error {
	return s.absenceTypeRepo.Upsert(ctx, at)
}
