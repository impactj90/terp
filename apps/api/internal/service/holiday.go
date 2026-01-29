package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/holiday"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

var (
	ErrHolidayNotFound        = errors.New("holiday not found")
	ErrHolidayDateRequired    = errors.New("holiday date is required")
	ErrHolidayNameRequired    = errors.New("holiday name is required")
	ErrHolidayAlreadyExists   = errors.New("holiday already exists on this date")
	ErrHolidayCategoryInvalid = errors.New("holiday category is invalid")
	ErrHolidayYearInvalid     = errors.New("holiday year is invalid")
	ErrHolidayStateInvalid    = errors.New("holiday state is invalid")
	ErrHolidayCopySameYear    = errors.New("holiday copy source and target year must differ")
	ErrHolidayNoSourceYear    = errors.New("no holidays found for source year")
	ErrHolidayOverrideInvalid = errors.New("holiday category override is invalid")
)

// holidayRepository defines the interface for holiday data access.
type holidayRepository interface {
	Create(ctx context.Context, holiday *model.Holiday) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.Holiday, error)
	Update(ctx context.Context, holiday *model.Holiday) error
	Delete(ctx context.Context, id uuid.UUID) error
	GetByDate(ctx context.Context, tenantID uuid.UUID, date time.Time) (*model.Holiday, error)
	GetByDateRange(ctx context.Context, tenantID uuid.UUID, from, to time.Time, departmentID *uuid.UUID) ([]model.Holiday, error)
	ListByYear(ctx context.Context, tenantID uuid.UUID, year int, departmentID *uuid.UUID) ([]model.Holiday, error)
	Upsert(ctx context.Context, holiday *model.Holiday) error
}

type HolidayService struct {
	holidayRepo  holidayRepository
	recalcSvc    recalcServiceForHolidayRecalc
	monthlyCalc  monthlyCalcServiceForHolidayRecalc
	employeeRepo employeeRepositoryForHolidayRecalc
}

func NewHolidayService(holidayRepo holidayRepository) *HolidayService {
	return &HolidayService{holidayRepo: holidayRepo}
}

type employeeRepositoryForHolidayRecalc interface {
	List(ctx context.Context, filter repository.EmployeeFilter) ([]model.Employee, int64, error)
}

type recalcServiceForHolidayRecalc interface {
	TriggerRecalcAll(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (*RecalcResult, error)
}

type monthlyCalcServiceForHolidayRecalc interface {
	RecalculateFromMonthBatch(ctx context.Context, employeeIDs []uuid.UUID, startYear, startMonth int) *MonthlyCalcResult
}

// SetRecalcServices wires recalculation dependencies for holiday changes.
func (s *HolidayService) SetRecalcServices(
	recalcSvc recalcServiceForHolidayRecalc,
	monthlyCalc monthlyCalcServiceForHolidayRecalc,
	employeeRepo employeeRepositoryForHolidayRecalc,
) {
	s.recalcSvc = recalcSvc
	s.monthlyCalc = monthlyCalc
	s.employeeRepo = employeeRepo
}

// CreateHolidayInput represents the input for creating a holiday.
type CreateHolidayInput struct {
	TenantID     uuid.UUID
	HolidayDate  time.Time
	Name         string
	Category     int
	AppliesToAll bool
	DepartmentID *uuid.UUID
}

// GenerateHolidayInput represents the input for generating holidays.
type GenerateHolidayInput struct {
	TenantID     uuid.UUID
	Year         int
	State        string
	SkipExisting bool
}

// HolidayCategoryOverride represents a category override for a specific month/day.
type HolidayCategoryOverride struct {
	Month    int
	Day      int
	Category int
}

// CopyHolidayInput represents the input for copying holidays from another year.
type CopyHolidayInput struct {
	TenantID          uuid.UUID
	SourceYear        int
	TargetYear        int
	CategoryOverrides []HolidayCategoryOverride
	SkipExisting      bool
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
	if input.Category < 1 || input.Category > 3 {
		return nil, ErrHolidayCategoryInvalid
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
		Category:     input.Category,
		AppliesToAll: input.AppliesToAll,
		DepartmentID: input.DepartmentID,
	}

	if err := s.holidayRepo.Create(ctx, holiday); err != nil {
		return nil, err
	}

	s.triggerRecalcIfNeeded(ctx, input.TenantID, []time.Time{holiday.HolidayDate})

	return holiday, nil
}

// GenerateForYearState generates holidays for the given year and state.
func (s *HolidayService) GenerateForYearState(ctx context.Context, input GenerateHolidayInput) ([]model.Holiday, error) {
	if input.Year < 1900 || input.Year > 2200 {
		return nil, ErrHolidayYearInvalid
	}

	state, err := holiday.ParseState(input.State)
	if err != nil {
		return nil, ErrHolidayStateInvalid
	}

	definitions, err := holiday.Generate(input.Year, state)
	if err != nil {
		return nil, ErrHolidayYearInvalid
	}

	existing, err := s.holidayRepo.ListByYear(ctx, input.TenantID, input.Year, nil)
	if err != nil {
		return nil, err
	}
	existingByDate := make(map[string]struct{}, len(existing))
	for _, h := range existing {
		existingByDate[dateKey(h.HolidayDate)] = struct{}{}
	}

	created := make([]model.Holiday, 0, len(definitions))
	createdDates := make([]time.Time, 0, len(definitions))
	for _, def := range definitions {
		key := dateKey(def.Date)
		if input.SkipExisting {
			if _, ok := existingByDate[key]; ok {
				continue
			}
		}

		holidayModel := model.Holiday{
			TenantID:     input.TenantID,
			HolidayDate:  normalizeDate(def.Date),
			Name:         def.Name,
			Category:     1,
			AppliesToAll: true,
		}
		if err := s.holidayRepo.Create(ctx, &holidayModel); err != nil {
			return nil, err
		}
		created = append(created, holidayModel)
		createdDates = append(createdDates, holidayModel.HolidayDate)
	}

	if len(createdDates) > 0 {
		s.triggerRecalcIfNeeded(ctx, input.TenantID, createdDates)
	}

	return created, nil
}

// CopyFromYear copies holidays from a source year to a target year.
func (s *HolidayService) CopyFromYear(ctx context.Context, input CopyHolidayInput) ([]model.Holiday, error) {
	if input.SourceYear < 1900 || input.SourceYear > 2200 {
		return nil, ErrHolidayYearInvalid
	}
	if input.TargetYear < 1900 || input.TargetYear > 2200 {
		return nil, ErrHolidayYearInvalid
	}
	if input.SourceYear == input.TargetYear {
		return nil, ErrHolidayCopySameYear
	}

	overrideMap := make(map[string]int, len(input.CategoryOverrides))
	for _, override := range input.CategoryOverrides {
		if override.Month < 1 || override.Month > 12 || override.Day < 1 || override.Day > 31 {
			return nil, ErrHolidayOverrideInvalid
		}
		if override.Category < 1 || override.Category > 3 {
			return nil, ErrHolidayCategoryInvalid
		}
		overrideMap[fmt.Sprintf("%02d-%02d", override.Month, override.Day)] = override.Category
	}

	source, err := s.holidayRepo.ListByYear(ctx, input.TenantID, input.SourceYear, nil)
	if err != nil {
		return nil, err
	}
	if len(source) == 0 {
		return nil, ErrHolidayNoSourceYear
	}

	existing, err := s.holidayRepo.ListByYear(ctx, input.TenantID, input.TargetYear, nil)
	if err != nil {
		return nil, err
	}
	existingByDate := make(map[string]struct{}, len(existing))
	for _, h := range existing {
		existingByDate[dateKey(h.HolidayDate)] = struct{}{}
	}

	created := make([]model.Holiday, 0, len(source))
	createdDates := make([]time.Time, 0, len(source))
	for _, src := range source {
		targetDate, ok := dateWithYear(input.TargetYear, src.HolidayDate)
		if !ok {
			continue
		}
		key := dateKey(targetDate)
		if input.SkipExisting {
			if _, ok := existingByDate[key]; ok {
				continue
			}
		}

		category := src.Category
		if override, ok := overrideMap[fmt.Sprintf("%02d-%02d", targetDate.Month(), targetDate.Day())]; ok {
			category = override
		}

		holidayModel := model.Holiday{
			TenantID:     input.TenantID,
			HolidayDate:  normalizeDate(targetDate),
			Name:         src.Name,
			Category:     category,
			AppliesToAll: src.AppliesToAll,
			DepartmentID: src.DepartmentID,
		}
		if err := s.holidayRepo.Create(ctx, &holidayModel); err != nil {
			return nil, err
		}
		created = append(created, holidayModel)
		createdDates = append(createdDates, holidayModel.HolidayDate)
	}

	if len(createdDates) > 0 {
		s.triggerRecalcIfNeeded(ctx, input.TenantID, createdDates)
	}

	return created, nil
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
	Category     *int
	AppliesToAll *bool
	DepartmentID *uuid.UUID
}

// Update updates a holiday.
func (s *HolidayService) Update(ctx context.Context, id uuid.UUID, input UpdateHolidayInput) (*model.Holiday, error) {
	holiday, err := s.holidayRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrHolidayNotFound
	}
	previousDate := holiday.HolidayDate
	previousCategory := holiday.Category

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
	if input.Category != nil {
		if *input.Category < 1 || *input.Category > 3 {
			return nil, ErrHolidayCategoryInvalid
		}
		holiday.Category = *input.Category
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

	affectedDates := []time.Time{}
	if input.HolidayDate != nil && !sameDate(previousDate, holiday.HolidayDate) {
		affectedDates = append(affectedDates, previousDate, holiday.HolidayDate)
	} else if input.Category != nil && previousCategory != holiday.Category {
		affectedDates = append(affectedDates, holiday.HolidayDate)
	}
	if len(affectedDates) > 0 {
		s.triggerRecalcIfNeeded(ctx, holiday.TenantID, affectedDates)
	}

	return holiday, nil
}

// Delete deletes a holiday by ID.
func (s *HolidayService) Delete(ctx context.Context, id uuid.UUID) error {
	holiday, err := s.holidayRepo.GetByID(ctx, id)
	if err != nil {
		return ErrHolidayNotFound
	}
	if err := s.holidayRepo.Delete(ctx, id); err != nil {
		return err
	}

	s.triggerRecalcIfNeeded(ctx, holiday.TenantID, []time.Time{holiday.HolidayDate})
	return nil
}

func (s *HolidayService) triggerRecalcIfNeeded(ctx context.Context, tenantID uuid.UUID, dates []time.Time) {
	if s.recalcSvc == nil && s.monthlyCalc == nil {
		return
	}

	today := normalizeDate(time.Now().UTC())
	pastDates := make([]time.Time, 0, len(dates))
	for _, d := range dates {
		nd := normalizeDate(d)
		if nd.Before(today) {
			pastDates = append(pastDates, nd)
		}
	}
	if len(pastDates) == 0 {
		return
	}

	from, to := pastDates[0], pastDates[0]
	for _, d := range pastDates[1:] {
		if d.Before(from) {
			from = d
		}
		if d.After(to) {
			to = d
		}
	}

	if s.recalcSvc != nil {
		_, _ = s.recalcSvc.TriggerRecalcAll(ctx, tenantID, from, to)
	}

	if s.monthlyCalc != nil && s.employeeRepo != nil {
		isActive := true
		filter := repository.EmployeeFilter{
			TenantID: tenantID,
			IsActive: &isActive,
		}
		employees, _, err := s.employeeRepo.List(ctx, filter)
		if err != nil {
			return
		}
		employeeIDs := make([]uuid.UUID, len(employees))
		for i, emp := range employees {
			employeeIDs[i] = emp.ID
		}
		if len(employeeIDs) == 0 {
			return
		}
		s.monthlyCalc.RecalculateFromMonthBatch(ctx, employeeIDs, from.Year(), int(from.Month()))
	}
}

func dateKey(date time.Time) string {
	return normalizeDate(date).Format("2006-01-02")
}

func dateWithYear(year int, date time.Time) (time.Time, bool) {
	month := date.Month()
	day := date.Day()
	target := time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
	if target.Month() != month || target.Day() != day {
		return time.Time{}, false
	}
	return target, true
}

// ListByYear retrieves all holidays for a tenant in a specific year.
func (s *HolidayService) ListByYear(ctx context.Context, tenantID uuid.UUID, year int, departmentID *uuid.UUID) ([]model.Holiday, error) {
	return s.holidayRepo.ListByYear(ctx, tenantID, year, departmentID)
}

// ListByDateRange retrieves holidays within a date range for a tenant.
func (s *HolidayService) ListByDateRange(ctx context.Context, tenantID uuid.UUID, from, to time.Time, departmentID *uuid.UUID) ([]model.Holiday, error) {
	return s.holidayRepo.GetByDateRange(ctx, tenantID, from, to, departmentID)
}

// GetByDate retrieves a holiday for a specific date.
func (s *HolidayService) GetByDate(ctx context.Context, tenantID uuid.UUID, date time.Time) (*model.Holiday, error) {
	return s.holidayRepo.GetByDate(ctx, tenantID, date)
}

// UpsertDevHoliday ensures a dev holiday exists in the database.
func (s *HolidayService) UpsertDevHoliday(ctx context.Context, holiday *model.Holiday) error {
	return s.holidayRepo.Upsert(ctx, holiday)
}
