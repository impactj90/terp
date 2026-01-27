# Implementation Plan: NOK-136 - Create Absence Service

**Date**: 2026-01-24
**Ticket**: NOK-136 (TICKET-078)
**Research**: thoughts/shared/research/2026-01-24-NOK-136-create-absence-service.md

## Overview

Create the AbsenceService that orchestrates absence range creation with date-skipping logic (weekends, holidays, off-days), validates absence types, checks for existing absences, and triggers recalculation after mutations.

**Pattern**: Follows the BookingService pattern (concrete struct, private dependency interfaces, synchronous recalc, testify/mock tests).

## Files to Create/Modify

| Action | File |
|--------|------|
| Modify | `apps/api/internal/repository/absenceday.go` (add `ListByEmployee`) |
| Create | `apps/api/internal/service/absence.go` |
| Create | `apps/api/internal/service/absence_test.go` |
| Modify | `apps/api/cmd/server/main.go` (wire AbsenceService) |

## Design Decisions

1. **Concrete struct pattern** (like BookingService), not interface-based
2. **Private dependency interfaces** defined in the service file
3. **Synchronous recalc** calls with ignored errors (`_, _ = s.recalcSvc.TriggerRecalc(...)`)
4. **Batch lookups** for holidays and day plans within the range (efficient, not day-by-day)
5. **Always skip** weekends, holidays, and off-days during CreateRange (not configurable flags -- matches ZMI behavior where absences are only meaningful on working days)
6. **Skip existing absences** rather than error -- when creating a week of absences, one existing day should not block the whole operation. Return skipped dates in the result.
7. **ListByEmployee** added to repository since it is missing and required by the ticket spec
8. **TenantID in input** required for holiday lookups and recalc
9. **Status in input** allows both `pending` (normal employee request) and `approved` (admin override)
10. **Validate absence type** is active and accessible by tenant (system types have nil TenantID)

---

## Phase 1: Add Missing Repository Method

### Step 1.1: Add `ListByEmployee` to AbsenceDayRepository

**File**: `apps/api/internal/repository/absenceday.go`

Add this method after `GetByEmployeeDateRange`:

```go
// ListByEmployee retrieves all absence days for an employee, ordered by date descending.
func (r *AbsenceDayRepository) ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.AbsenceDay, error) {
	var days []model.AbsenceDay
	err := r.db.GORM.WithContext(ctx).
		Preload("AbsenceType").
		Where("employee_id = ?", employeeID).
		Order("absence_date DESC").
		Find(&days).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list absence days for employee: %w", err)
	}
	return days, nil
}
```

### Verification
```bash
cd apps/api && go build ./...
```

---

## Phase 2: Create Service File - Structure, Errors, Interfaces, Constructor

### Step 2.1: Create `apps/api/internal/service/absence.go`

```go
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
```

### Step 2.2: Define Input and Result Types

```go
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
```

### Verification
```bash
cd apps/api && go build ./...
```

---

## Phase 3: Implement Simple CRUD Methods

### Step 3.1: GetByID

```go
// GetByID retrieves an absence day by ID.
func (s *AbsenceService) GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceDay, error) {
	ad, err := s.absenceDayRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrAbsenceNotFound
	}
	return ad, nil
}
```

### Step 3.2: ListByEmployee

```go
// ListByEmployee retrieves all absence days for an employee.
func (s *AbsenceService) ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.AbsenceDay, error) {
	return s.absenceDayRepo.ListByEmployee(ctx, employeeID)
}
```

### Step 3.3: GetByEmployeeDateRange

```go
// GetByEmployeeDateRange retrieves absence days for an employee within a date range.
func (s *AbsenceService) GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.AbsenceDay, error) {
	if from.After(to) {
		return nil, ErrInvalidAbsenceDates
	}
	return s.absenceDayRepo.GetByEmployeeDateRange(ctx, employeeID, from, to)
}
```

### Step 3.4: Delete (single day) with recalc

```go
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
```

### Step 3.5: DeleteRange with recalc

```go
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
```

### Verification
```bash
cd apps/api && go build ./...
```

---

## Phase 4: Implement CreateRange (Complex Method)

This is the most complex method. It:
1. Validates input dates (from <= to)
2. Validates absence type exists, is active, and is accessible by tenant
3. Batch-fetches holidays and day plans for the entire range
4. Iterates each date in the range, skipping weekends, holidays, off-days, and existing absences
5. Builds AbsenceDay records for valid dates
6. Batch-creates all records via `CreateRange`
7. Triggers recalculation for the full range

### Step 4.1: Helper Types and Functions

```go
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
```

### Step 4.2: CreateRange Method

```go
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
```

### Verification
```bash
cd apps/api && go build ./...
```

---

## Phase 5: Write Unit Tests

**File**: `apps/api/internal/service/absence_test.go`

### Step 5.1: Mock Definitions and Helper

```go
package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
)

// --- Mock implementations ---

type mockAbsenceDayRepositoryForService struct {
	mock.Mock
}

func (m *mockAbsenceDayRepositoryForService) Create(ctx context.Context, ad *model.AbsenceDay) error {
	args := m.Called(ctx, ad)
	return args.Error(0)
}

func (m *mockAbsenceDayRepositoryForService) CreateRange(ctx context.Context, days []model.AbsenceDay) error {
	args := m.Called(ctx, days)
	return args.Error(0)
}

func (m *mockAbsenceDayRepositoryForService) GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceDay, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.AbsenceDay), args.Error(1)
}

func (m *mockAbsenceDayRepositoryForService) GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.AbsenceDay, error) {
	args := m.Called(ctx, employeeID, date)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.AbsenceDay), args.Error(1)
}

func (m *mockAbsenceDayRepositoryForService) GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.AbsenceDay, error) {
	args := m.Called(ctx, employeeID, from, to)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.AbsenceDay), args.Error(1)
}

func (m *mockAbsenceDayRepositoryForService) ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.AbsenceDay, error) {
	args := m.Called(ctx, employeeID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.AbsenceDay), args.Error(1)
}

func (m *mockAbsenceDayRepositoryForService) Delete(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func (m *mockAbsenceDayRepositoryForService) DeleteRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error {
	args := m.Called(ctx, employeeID, from, to)
	return args.Error(0)
}

type mockAbsenceTypeRepositoryForService struct {
	mock.Mock
}

func (m *mockAbsenceTypeRepositoryForService) GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceType, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.AbsenceType), args.Error(1)
}

type mockHolidayRepositoryForAbsence struct {
	mock.Mock
}

func (m *mockHolidayRepositoryForAbsence) GetByDateRange(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]model.Holiday, error) {
	args := m.Called(ctx, tenantID, from, to)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.Holiday), args.Error(1)
}

type mockEmpDayPlanRepositoryForAbsence struct {
	mock.Mock
}

func (m *mockEmpDayPlanRepositoryForAbsence) GetForEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.EmployeeDayPlan, error) {
	args := m.Called(ctx, employeeID, from, to)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.EmployeeDayPlan), args.Error(1)
}

type mockRecalcServiceForAbsence struct {
	mock.Mock
}

func (m *mockRecalcServiceForAbsence) TriggerRecalc(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*RecalcResult, error) {
	args := m.Called(ctx, tenantID, employeeID, date)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*RecalcResult), args.Error(1)
}

func (m *mockRecalcServiceForAbsence) TriggerRecalcRange(ctx context.Context, tenantID, employeeID uuid.UUID, from, to time.Time) (*RecalcResult, error) {
	args := m.Called(ctx, tenantID, employeeID, from, to)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*RecalcResult), args.Error(1)
}

// --- Test helper ---

func newTestAbsenceService() (
	*AbsenceService,
	*mockAbsenceDayRepositoryForService,
	*mockAbsenceTypeRepositoryForService,
	*mockHolidayRepositoryForAbsence,
	*mockEmpDayPlanRepositoryForAbsence,
	*mockRecalcServiceForAbsence,
) {
	absenceDayRepo := new(mockAbsenceDayRepositoryForService)
	absenceTypeRepo := new(mockAbsenceTypeRepositoryForService)
	holidayRepo := new(mockHolidayRepositoryForAbsence)
	empDayPlanRepo := new(mockEmpDayPlanRepositoryForAbsence)
	recalcSvc := new(mockRecalcServiceForAbsence)

	svc := NewAbsenceService(absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcSvc)
	return svc, absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcSvc
}
```

### Step 5.2: Test Cases

#### GetByID Tests

```go
func TestAbsenceService_GetByID_Success(t *testing.T) {
	ctx := context.Background()
	svc, absenceDayRepo, _, _, _, _ := newTestAbsenceService()

	id := uuid.New()
	expected := &model.AbsenceDay{ID: id, TenantID: uuid.New(), EmployeeID: uuid.New()}

	absenceDayRepo.On("GetByID", ctx, id).Return(expected, nil)

	result, err := svc.GetByID(ctx, id)

	require.NoError(t, err)
	assert.Equal(t, id, result.ID)
	absenceDayRepo.AssertExpectations(t)
}

func TestAbsenceService_GetByID_NotFound(t *testing.T) {
	ctx := context.Background()
	svc, absenceDayRepo, _, _, _, _ := newTestAbsenceService()

	id := uuid.New()
	absenceDayRepo.On("GetByID", ctx, id).Return(nil, errors.New("not found"))

	_, err := svc.GetByID(ctx, id)

	assert.ErrorIs(t, err, ErrAbsenceNotFound)
}
```

#### Delete Tests

```go
func TestAbsenceService_Delete_Success(t *testing.T) {
	ctx := context.Background()
	svc, absenceDayRepo, _, _, _, recalcSvc := newTestAbsenceService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	id := uuid.New()
	date := time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC)

	existing := &model.AbsenceDay{
		ID:          id,
		TenantID:    tenantID,
		EmployeeID:  employeeID,
		AbsenceDate: date,
	}

	absenceDayRepo.On("GetByID", ctx, id).Return(existing, nil)
	absenceDayRepo.On("Delete", ctx, id).Return(nil)
	recalcSvc.On("TriggerRecalc", ctx, tenantID, employeeID, date).Return(&RecalcResult{ProcessedDays: 1}, nil)

	err := svc.Delete(ctx, id)

	require.NoError(t, err)
	absenceDayRepo.AssertExpectations(t)
	recalcSvc.AssertExpectations(t)
}

func TestAbsenceService_Delete_NotFound(t *testing.T) {
	ctx := context.Background()
	svc, absenceDayRepo, _, _, _, _ := newTestAbsenceService()

	id := uuid.New()
	absenceDayRepo.On("GetByID", ctx, id).Return(nil, errors.New("not found"))

	err := svc.Delete(ctx, id)

	assert.ErrorIs(t, err, ErrAbsenceNotFound)
}
```

#### DeleteRange Tests

```go
func TestAbsenceService_DeleteRange_Success(t *testing.T) {
	ctx := context.Background()
	svc, absenceDayRepo, _, _, _, recalcSvc := newTestAbsenceService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	from := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 24, 0, 0, 0, 0, time.UTC)

	absenceDayRepo.On("DeleteRange", ctx, employeeID, from, to).Return(nil)
	recalcSvc.On("TriggerRecalcRange", ctx, tenantID, employeeID, from, to).Return(&RecalcResult{ProcessedDays: 5}, nil)

	err := svc.DeleteRange(ctx, tenantID, employeeID, from, to)

	require.NoError(t, err)
	absenceDayRepo.AssertExpectations(t)
	recalcSvc.AssertExpectations(t)
}

func TestAbsenceService_DeleteRange_InvalidDates(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _, _ := newTestAbsenceService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	from := time.Date(2026, 1, 24, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC) // Before from

	err := svc.DeleteRange(ctx, tenantID, employeeID, from, to)

	assert.ErrorIs(t, err, ErrInvalidAbsenceDates)
}
```

#### ListByEmployee Tests

```go
func TestAbsenceService_ListByEmployee_Success(t *testing.T) {
	ctx := context.Background()
	svc, absenceDayRepo, _, _, _, _ := newTestAbsenceService()

	employeeID := uuid.New()
	expected := []model.AbsenceDay{
		{ID: uuid.New(), EmployeeID: employeeID},
		{ID: uuid.New(), EmployeeID: employeeID},
	}

	absenceDayRepo.On("ListByEmployee", ctx, employeeID).Return(expected, nil)

	result, err := svc.ListByEmployee(ctx, employeeID)

	require.NoError(t, err)
	assert.Len(t, result, 2)
}
```

#### GetByEmployeeDateRange Tests

```go
func TestAbsenceService_GetByEmployeeDateRange_Success(t *testing.T) {
	ctx := context.Background()
	svc, absenceDayRepo, _, _, _, _ := newTestAbsenceService()

	employeeID := uuid.New()
	from := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 24, 0, 0, 0, 0, time.UTC)
	expected := []model.AbsenceDay{{ID: uuid.New()}}

	absenceDayRepo.On("GetByEmployeeDateRange", ctx, employeeID, from, to).Return(expected, nil)

	result, err := svc.GetByEmployeeDateRange(ctx, employeeID, from, to)

	require.NoError(t, err)
	assert.Len(t, result, 1)
}

func TestAbsenceService_GetByEmployeeDateRange_InvalidDates(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _, _ := newTestAbsenceService()

	employeeID := uuid.New()
	from := time.Date(2026, 1, 24, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)

	_, err := svc.GetByEmployeeDateRange(ctx, employeeID, from, to)

	assert.ErrorIs(t, err, ErrInvalidAbsenceDates)
}
```

#### CreateRange Tests

```go
func TestAbsenceService_CreateRange_Success_WeekdaysOnly(t *testing.T) {
	// Week: Mon Jan 26 to Fri Jan 30 (5 weekdays, no weekends)
	ctx := context.Background()
	svc, absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcSvc := newTestAbsenceService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	absenceTypeID := uuid.New()
	from := time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC) // Monday
	to := time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC)   // Friday

	// Setup mocks
	absenceTypeRepo.On("GetByID", ctx, absenceTypeID).Return(&model.AbsenceType{
		ID:       absenceTypeID,
		TenantID: &tenantID,
		IsActive: true,
	}, nil)
	holidayRepo.On("GetByDateRange", ctx, tenantID, from, to).Return([]model.Holiday{}, nil)

	// All 5 weekdays have day plans assigned
	somePlanID := uuid.New()
	empDayPlanRepo.On("GetForEmployeeDateRange", ctx, employeeID, from, to).Return([]model.EmployeeDayPlan{
		{PlanDate: time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 27, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 29, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
	}, nil)

	// No existing absences on any date
	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, mock.AnythingOfType("time.Time")).Return(nil, nil)

	// Expect CreateRange with 5 days
	absenceDayRepo.On("CreateRange", ctx, mock.MatchedBy(func(days []model.AbsenceDay) bool {
		return len(days) == 5
	})).Return(nil)

	recalcSvc.On("TriggerRecalcRange", ctx, tenantID, employeeID, from, to).Return(&RecalcResult{ProcessedDays: 5}, nil)

	input := CreateAbsenceRangeInput{
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		AbsenceTypeID: absenceTypeID,
		FromDate:      from,
		ToDate:        to,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusPending,
	}

	result, err := svc.CreateRange(ctx, input)

	require.NoError(t, err)
	assert.Len(t, result.CreatedDays, 5)
	assert.Empty(t, result.SkippedDates)
	absenceDayRepo.AssertExpectations(t)
	recalcSvc.AssertExpectations(t)
}

func TestAbsenceService_CreateRange_SkipsWeekends(t *testing.T) {
	// Mon Jan 26 to Sun Feb 1 (7 calendar days, expect 5 created, 2 skipped)
	ctx := context.Background()
	svc, absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcSvc := newTestAbsenceService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	absenceTypeID := uuid.New()
	from := time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC) // Monday
	to := time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)    // Sunday

	absenceTypeRepo.On("GetByID", ctx, absenceTypeID).Return(&model.AbsenceType{
		ID: absenceTypeID, TenantID: &tenantID, IsActive: true,
	}, nil)
	holidayRepo.On("GetByDateRange", ctx, tenantID, from, to).Return([]model.Holiday{}, nil)

	// Day plans for Mon-Fri only (weekends won't be looked up since they're skipped first)
	somePlanID := uuid.New()
	empDayPlanRepo.On("GetForEmployeeDateRange", ctx, employeeID, from, to).Return([]model.EmployeeDayPlan{
		{PlanDate: time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 27, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 29, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
	}, nil)

	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, mock.AnythingOfType("time.Time")).Return(nil, nil)
	absenceDayRepo.On("CreateRange", ctx, mock.MatchedBy(func(days []model.AbsenceDay) bool {
		return len(days) == 5
	})).Return(nil)
	recalcSvc.On("TriggerRecalcRange", ctx, tenantID, employeeID, from, to).Return(&RecalcResult{}, nil)

	input := CreateAbsenceRangeInput{
		TenantID: tenantID, EmployeeID: employeeID, AbsenceTypeID: absenceTypeID,
		FromDate: from, ToDate: to,
		Duration: decimal.NewFromInt(1), Status: model.AbsenceStatusPending,
	}

	result, err := svc.CreateRange(ctx, input)

	require.NoError(t, err)
	assert.Len(t, result.CreatedDays, 5)
	assert.Len(t, result.SkippedDates, 2) // Saturday + Sunday
}

func TestAbsenceService_CreateRange_SkipsHolidays(t *testing.T) {
	// Mon-Fri, with Wednesday as holiday -> 4 created, 1 skipped
	ctx := context.Background()
	svc, absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcSvc := newTestAbsenceService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	absenceTypeID := uuid.New()
	from := time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC) // Monday
	to := time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC)   // Friday
	wednesday := time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC)

	absenceTypeRepo.On("GetByID", ctx, absenceTypeID).Return(&model.AbsenceType{
		ID: absenceTypeID, TenantID: &tenantID, IsActive: true,
	}, nil)
	holidayRepo.On("GetByDateRange", ctx, tenantID, from, to).Return([]model.Holiday{
		{HolidayDate: wednesday, Name: "Holiday"},
	}, nil)

	somePlanID := uuid.New()
	empDayPlanRepo.On("GetForEmployeeDateRange", ctx, employeeID, from, to).Return([]model.EmployeeDayPlan{
		{PlanDate: time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 27, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: wednesday, DayPlanID: &somePlanID}, // Has plan but is holiday
		{PlanDate: time.Date(2026, 1, 29, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
	}, nil)

	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, mock.AnythingOfType("time.Time")).Return(nil, nil)
	absenceDayRepo.On("CreateRange", ctx, mock.MatchedBy(func(days []model.AbsenceDay) bool {
		return len(days) == 4
	})).Return(nil)
	recalcSvc.On("TriggerRecalcRange", ctx, tenantID, employeeID, from, to).Return(&RecalcResult{}, nil)

	input := CreateAbsenceRangeInput{
		TenantID: tenantID, EmployeeID: employeeID, AbsenceTypeID: absenceTypeID,
		FromDate: from, ToDate: to,
		Duration: decimal.NewFromInt(1), Status: model.AbsenceStatusPending,
	}

	result, err := svc.CreateRange(ctx, input)

	require.NoError(t, err)
	assert.Len(t, result.CreatedDays, 4)
	assert.Len(t, result.SkippedDates, 1)
	assert.Equal(t, wednesday, result.SkippedDates[0])
}

func TestAbsenceService_CreateRange_SkipsOffDays(t *testing.T) {
	// Mon-Fri, Tuesday has DayPlanID=nil (explicit off), Thursday missing (no plan)
	// Expected: 3 created (Mon, Wed, Fri), 2 skipped
	ctx := context.Background()
	svc, absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcSvc := newTestAbsenceService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	absenceTypeID := uuid.New()
	from := time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC)

	absenceTypeRepo.On("GetByID", ctx, absenceTypeID).Return(&model.AbsenceType{
		ID: absenceTypeID, TenantID: &tenantID, IsActive: true,
	}, nil)
	holidayRepo.On("GetByDateRange", ctx, tenantID, from, to).Return([]model.Holiday{}, nil)

	somePlanID := uuid.New()
	empDayPlanRepo.On("GetForEmployeeDateRange", ctx, employeeID, from, to).Return([]model.EmployeeDayPlan{
		{PlanDate: time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID}, // Mon: work
		{PlanDate: time.Date(2026, 1, 27, 0, 0, 0, 0, time.UTC), DayPlanID: nil},          // Tue: off (explicit)
		{PlanDate: time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID}, // Wed: work
		// Thu (Jan 29): no plan record at all = off day
		{PlanDate: time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID}, // Fri: work
	}, nil)

	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, mock.AnythingOfType("time.Time")).Return(nil, nil)
	absenceDayRepo.On("CreateRange", ctx, mock.MatchedBy(func(days []model.AbsenceDay) bool {
		return len(days) == 3
	})).Return(nil)
	recalcSvc.On("TriggerRecalcRange", ctx, tenantID, employeeID, from, to).Return(&RecalcResult{}, nil)

	input := CreateAbsenceRangeInput{
		TenantID: tenantID, EmployeeID: employeeID, AbsenceTypeID: absenceTypeID,
		FromDate: from, ToDate: to,
		Duration: decimal.NewFromInt(1), Status: model.AbsenceStatusPending,
	}

	result, err := svc.CreateRange(ctx, input)

	require.NoError(t, err)
	assert.Len(t, result.CreatedDays, 3)
	assert.Len(t, result.SkippedDates, 2) // Tue + Thu
}

func TestAbsenceService_CreateRange_SkipsExistingAbsences(t *testing.T) {
	// Mon-Fri, Wednesday already has an absence -> 4 created, 1 skipped
	ctx := context.Background()
	svc, absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcSvc := newTestAbsenceService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	absenceTypeID := uuid.New()
	from := time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC)
	wednesday := time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC)

	absenceTypeRepo.On("GetByID", ctx, absenceTypeID).Return(&model.AbsenceType{
		ID: absenceTypeID, TenantID: &tenantID, IsActive: true,
	}, nil)
	holidayRepo.On("GetByDateRange", ctx, tenantID, from, to).Return([]model.Holiday{}, nil)

	somePlanID := uuid.New()
	empDayPlanRepo.On("GetForEmployeeDateRange", ctx, employeeID, from, to).Return([]model.EmployeeDayPlan{
		{PlanDate: time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 27, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: wednesday, DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 29, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
		{PlanDate: time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC), DayPlanID: &somePlanID},
	}, nil)

	// Wednesday has existing absence
	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, wednesday).Return(&model.AbsenceDay{ID: uuid.New()}, nil)
	// All other days: no existing absence
	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, mock.MatchedBy(func(d time.Time) bool {
		return !d.Equal(wednesday)
	})).Return(nil, nil)

	absenceDayRepo.On("CreateRange", ctx, mock.MatchedBy(func(days []model.AbsenceDay) bool {
		return len(days) == 4
	})).Return(nil)
	recalcSvc.On("TriggerRecalcRange", ctx, tenantID, employeeID, from, to).Return(&RecalcResult{}, nil)

	input := CreateAbsenceRangeInput{
		TenantID: tenantID, EmployeeID: employeeID, AbsenceTypeID: absenceTypeID,
		FromDate: from, ToDate: to,
		Duration: decimal.NewFromInt(1), Status: model.AbsenceStatusPending,
	}

	result, err := svc.CreateRange(ctx, input)

	require.NoError(t, err)
	assert.Len(t, result.CreatedDays, 4)
	assert.Len(t, result.SkippedDates, 1)
}

func TestAbsenceService_CreateRange_InvalidDates(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _, _ := newTestAbsenceService()

	input := CreateAbsenceRangeInput{
		TenantID:      uuid.New(),
		EmployeeID:    uuid.New(),
		AbsenceTypeID: uuid.New(),
		FromDate:      time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC),
		ToDate:        time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC), // Before from
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusPending,
	}

	_, err := svc.CreateRange(ctx, input)

	assert.ErrorIs(t, err, ErrInvalidAbsenceDates)
}

func TestAbsenceService_CreateRange_InvalidAbsenceType(t *testing.T) {
	ctx := context.Background()
	svc, _, absenceTypeRepo, _, _, _ := newTestAbsenceService()

	absenceTypeID := uuid.New()
	absenceTypeRepo.On("GetByID", ctx, absenceTypeID).Return(nil, errors.New("not found"))

	input := CreateAbsenceRangeInput{
		TenantID:      uuid.New(),
		EmployeeID:    uuid.New(),
		AbsenceTypeID: absenceTypeID,
		FromDate:      time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC),
		ToDate:        time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC),
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusPending,
	}

	_, err := svc.CreateRange(ctx, input)

	assert.ErrorIs(t, err, ErrInvalidAbsenceType)
}

func TestAbsenceService_CreateRange_InactiveAbsenceType(t *testing.T) {
	ctx := context.Background()
	svc, _, absenceTypeRepo, _, _, _ := newTestAbsenceService()

	tenantID := uuid.New()
	absenceTypeID := uuid.New()
	absenceTypeRepo.On("GetByID", ctx, absenceTypeID).Return(&model.AbsenceType{
		ID: absenceTypeID, TenantID: &tenantID, IsActive: false,
	}, nil)

	input := CreateAbsenceRangeInput{
		TenantID:      tenantID,
		EmployeeID:    uuid.New(),
		AbsenceTypeID: absenceTypeID,
		FromDate:      time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC),
		ToDate:        time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC),
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusPending,
	}

	_, err := svc.CreateRange(ctx, input)

	assert.ErrorIs(t, err, ErrAbsenceTypeInactive)
}

func TestAbsenceService_CreateRange_WrongTenantAbsenceType(t *testing.T) {
	ctx := context.Background()
	svc, _, absenceTypeRepo, _, _, _ := newTestAbsenceService()

	tenantID := uuid.New()
	otherTenantID := uuid.New()
	absenceTypeID := uuid.New()
	absenceTypeRepo.On("GetByID", ctx, absenceTypeID).Return(&model.AbsenceType{
		ID: absenceTypeID, TenantID: &otherTenantID, IsActive: true,
	}, nil)

	input := CreateAbsenceRangeInput{
		TenantID:      tenantID,
		EmployeeID:    uuid.New(),
		AbsenceTypeID: absenceTypeID,
		FromDate:      time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC),
		ToDate:        time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC),
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusPending,
	}

	_, err := svc.CreateRange(ctx, input)

	assert.ErrorIs(t, err, ErrInvalidAbsenceType)
}

func TestAbsenceService_CreateRange_SystemAbsenceType(t *testing.T) {
	// System types (nil TenantID) are accessible by all tenants
	ctx := context.Background()
	svc, absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcSvc := newTestAbsenceService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	absenceTypeID := uuid.New()
	from := time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC) // Single day

	absenceTypeRepo.On("GetByID", ctx, absenceTypeID).Return(&model.AbsenceType{
		ID: absenceTypeID, TenantID: nil, IsActive: true, IsSystem: true,
	}, nil)
	holidayRepo.On("GetByDateRange", ctx, tenantID, from, to).Return([]model.Holiday{}, nil)

	somePlanID := uuid.New()
	empDayPlanRepo.On("GetForEmployeeDateRange", ctx, employeeID, from, to).Return([]model.EmployeeDayPlan{
		{PlanDate: from, DayPlanID: &somePlanID},
	}, nil)
	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, from).Return(nil, nil)
	absenceDayRepo.On("CreateRange", ctx, mock.MatchedBy(func(days []model.AbsenceDay) bool {
		return len(days) == 1
	})).Return(nil)
	recalcSvc.On("TriggerRecalcRange", ctx, tenantID, employeeID, from, to).Return(&RecalcResult{}, nil)

	input := CreateAbsenceRangeInput{
		TenantID: tenantID, EmployeeID: employeeID, AbsenceTypeID: absenceTypeID,
		FromDate: from, ToDate: to,
		Duration: decimal.NewFromInt(1), Status: model.AbsenceStatusApproved,
	}

	result, err := svc.CreateRange(ctx, input)

	require.NoError(t, err)
	assert.Len(t, result.CreatedDays, 1)
}

func TestAbsenceService_CreateRange_AllDatesSkipped(t *testing.T) {
	// Weekend-only range: Sat Jan 31 to Sun Feb 1
	ctx := context.Background()
	svc, _, absenceTypeRepo, holidayRepo, empDayPlanRepo, _ := newTestAbsenceService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	absenceTypeID := uuid.New()
	from := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC) // Saturday
	to := time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)    // Sunday

	absenceTypeRepo.On("GetByID", ctx, absenceTypeID).Return(&model.AbsenceType{
		ID: absenceTypeID, TenantID: &tenantID, IsActive: true,
	}, nil)
	holidayRepo.On("GetByDateRange", ctx, tenantID, from, to).Return([]model.Holiday{}, nil)
	empDayPlanRepo.On("GetForEmployeeDateRange", ctx, employeeID, from, to).Return([]model.EmployeeDayPlan{}, nil)

	input := CreateAbsenceRangeInput{
		TenantID: tenantID, EmployeeID: employeeID, AbsenceTypeID: absenceTypeID,
		FromDate: from, ToDate: to,
		Duration: decimal.NewFromInt(1), Status: model.AbsenceStatusPending,
	}

	_, err := svc.CreateRange(ctx, input)

	assert.ErrorIs(t, err, ErrNoAbsenceDaysCreated)
}

func TestAbsenceService_CreateRange_SingleDay(t *testing.T) {
	// FromDate == ToDate (single working day)
	ctx := context.Background()
	svc, absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcSvc := newTestAbsenceService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	absenceTypeID := uuid.New()
	date := time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC) // Monday

	absenceTypeRepo.On("GetByID", ctx, absenceTypeID).Return(&model.AbsenceType{
		ID: absenceTypeID, TenantID: &tenantID, IsActive: true,
	}, nil)
	holidayRepo.On("GetByDateRange", ctx, tenantID, date, date).Return([]model.Holiday{}, nil)

	somePlanID := uuid.New()
	empDayPlanRepo.On("GetForEmployeeDateRange", ctx, employeeID, date, date).Return([]model.EmployeeDayPlan{
		{PlanDate: date, DayPlanID: &somePlanID},
	}, nil)
	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, date).Return(nil, nil)
	absenceDayRepo.On("CreateRange", ctx, mock.MatchedBy(func(days []model.AbsenceDay) bool {
		return len(days) == 1 && days[0].AbsenceDate.Equal(date)
	})).Return(nil)
	recalcSvc.On("TriggerRecalcRange", ctx, tenantID, employeeID, date, date).Return(&RecalcResult{}, nil)

	input := CreateAbsenceRangeInput{
		TenantID: tenantID, EmployeeID: employeeID, AbsenceTypeID: absenceTypeID,
		FromDate: date, ToDate: date,
		Duration: decimal.NewFromInt(1), Status: model.AbsenceStatusPending,
	}

	result, err := svc.CreateRange(ctx, input)

	require.NoError(t, err)
	assert.Len(t, result.CreatedDays, 1)
	assert.Empty(t, result.SkippedDates)
}

func TestAbsenceService_CreateRange_HalfDay(t *testing.T) {
	// Verify Duration=0.5 and HalfDayPeriod are set correctly on created days
	ctx := context.Background()
	svc, absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcSvc := newTestAbsenceService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	absenceTypeID := uuid.New()
	date := time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC)
	halfDayPeriod := model.HalfDayPeriodMorning

	absenceTypeRepo.On("GetByID", ctx, absenceTypeID).Return(&model.AbsenceType{
		ID: absenceTypeID, TenantID: &tenantID, IsActive: true,
	}, nil)
	holidayRepo.On("GetByDateRange", ctx, tenantID, date, date).Return([]model.Holiday{}, nil)

	somePlanID := uuid.New()
	empDayPlanRepo.On("GetForEmployeeDateRange", ctx, employeeID, date, date).Return([]model.EmployeeDayPlan{
		{PlanDate: date, DayPlanID: &somePlanID},
	}, nil)
	absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, date).Return(nil, nil)
	absenceDayRepo.On("CreateRange", ctx, mock.MatchedBy(func(days []model.AbsenceDay) bool {
		if len(days) != 1 {
			return false
		}
		return days[0].Duration.Equal(decimal.NewFromFloat(0.5)) &&
			days[0].HalfDayPeriod != nil &&
			*days[0].HalfDayPeriod == model.HalfDayPeriodMorning
	})).Return(nil)
	recalcSvc.On("TriggerRecalcRange", ctx, tenantID, employeeID, date, date).Return(&RecalcResult{}, nil)

	input := CreateAbsenceRangeInput{
		TenantID: tenantID, EmployeeID: employeeID, AbsenceTypeID: absenceTypeID,
		FromDate: date, ToDate: date,
		Duration:      decimal.NewFromFloat(0.5),
		HalfDayPeriod: &halfDayPeriod,
		Status:        model.AbsenceStatusPending,
	}

	result, err := svc.CreateRange(ctx, input)

	require.NoError(t, err)
	assert.Len(t, result.CreatedDays, 1)
}
```

#### Helper Function Tests

```go
func TestNormalizeDate(t *testing.T) {
	d := time.Date(2026, 1, 22, 14, 30, 45, 123, time.UTC)
	normalized := normalizeDate(d)

	assert.Equal(t, 2026, normalized.Year())
	assert.Equal(t, time.January, normalized.Month())
	assert.Equal(t, 22, normalized.Day())
	assert.Equal(t, 0, normalized.Hour())
	assert.Equal(t, 0, normalized.Minute())
	assert.Equal(t, 0, normalized.Second())
}

func TestBuildHolidaySet(t *testing.T) {
	holidays := []model.Holiday{
		{HolidayDate: time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC)},
		{HolidayDate: time.Date(2026, 1, 30, 12, 0, 0, 0, time.UTC)}, // time component should be stripped
	}

	set := buildHolidaySet(holidays)

	assert.True(t, set[time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC)])
	assert.True(t, set[time.Date(2026, 1, 30, 0, 0, 0, 0, time.UTC)])
	assert.False(t, set[time.Date(2026, 1, 29, 0, 0, 0, 0, time.UTC)])
}

func TestBuildDayPlanMap(t *testing.T) {
	planID := uuid.New()
	plans := []model.EmployeeDayPlan{
		{PlanDate: time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC), DayPlanID: &planID},
		{PlanDate: time.Date(2026, 1, 27, 0, 0, 0, 0, time.UTC), DayPlanID: nil},
	}

	m := buildDayPlanMap(plans)

	assert.NotNil(t, m[time.Date(2026, 1, 26, 0, 0, 0, 0, time.UTC)])
	assert.NotNil(t, m[time.Date(2026, 1, 27, 0, 0, 0, 0, time.UTC)])
	assert.Nil(t, m[time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC)]) // Not in map
}
```

### Verification
```bash
cd apps/api && go test -v -run TestAbsenceService ./internal/service/...
cd apps/api && go test -v -run TestNormalizeDate ./internal/service/...
cd apps/api && go test -v -run TestBuild ./internal/service/...
```

---

## Phase 6: Wire into main.go

**File**: `apps/api/cmd/server/main.go`

### Step 6.1: Add Repository Initialization

After `bookingRepo := repository.NewBookingRepository(db)` (line 99), add:

```go
absenceDayRepo := repository.NewAbsenceDayRepository(db)
absenceTypeRepo := repository.NewAbsenceTypeRepository(db)
```

### Step 6.2: Add Service Initialization

After `bookingService := service.NewBookingService(...)` (line 106), add:

```go
// Initialize AbsenceService
absenceService := service.NewAbsenceService(absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcService)
_ = absenceService // TODO: Wire to AbsenceHandler (separate ticket)
```

Note: `holidayRepo`, `empDayPlanRepo`, and `recalcService` are already initialized earlier in main.go (lines 70, 100, 103).

### Verification
```bash
cd apps/api && go build ./cmd/server/
```

---

## Phase 7: Final Verification

```bash
cd apps/api && go build ./...
cd apps/api && go test -v -run "TestAbsenceService|TestNormalizeDate|TestBuild" ./internal/service/...
cd apps/api && go vet ./...
```

---

## Implementation Notes

### Pattern Deviations from TICKET-078 Plan

The TICKET-078 plan had several patterns that don't match the actual codebase. This implementation follows the BookingService pattern instead:

1. **Concrete struct** (not interface-based) for `AbsenceService`
2. **Private interfaces** for dependencies (not exported)
3. **Synchronous recalc** (not async `go func()`)
4. **Concrete repository** dependency (matches `AbsenceDayRepository` struct, accessed via private interface)
5. **`*string` for Notes** (nullable, matching the model)

### Date Handling

- All dates normalized to `time.Date(y, m, d, 0, 0, 0, 0, time.UTC)` for consistent map lookups
- Weekend detection uses Go's `time.Weekday()` (Saturday=6, Sunday=0)
- The `shouldSkipDate` helper is a method on the service for potential future extension

### Holiday + Absence Overlap

Per the ZMI reference (Section 18.2), when a holiday and absence overlap, priority resolution happens during daily calculation, not during absence creation. This service skips holidays because employees typically don't work on holidays, so creating an absence there is meaningless.

### RecalcService Usage

- **Single delete**: Uses `TriggerRecalc` for the one affected date
- **Range delete/create**: Uses `TriggerRecalcRange` for the full range (even if some dates were skipped, recalc handles empty dates gracefully)
- Recalc errors are intentionally ignored (matching BookingService pattern): `_, _ = s.recalcSvc.TriggerRecalc(...)`

### Skip Logic (Always On)

Unlike the earlier draft that had configurable skip flags, this version ALWAYS skips weekends, holidays, and off-days. This matches ZMI behavior: absences are only meaningful on working days. If a date is skipped, it appears in `SkippedDates` in the result (for UI feedback).

---

## Success Criteria

- [ ] `apps/api/internal/repository/absenceday.go` has `ListByEmployee` method
- [ ] `apps/api/internal/service/absence.go` compiles with all methods implemented
- [ ] `apps/api/internal/service/absence_test.go` has comprehensive unit tests
- [ ] All tests pass: `go test -v -run "TestAbsenceService|TestNormalizeDate|TestBuild" ./internal/service/...`
- [ ] Service wired in `main.go`
- [ ] `go build ./...` succeeds
- [ ] `go vet ./...` passes
