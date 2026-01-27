# Implementation Plan: NOK-140 - Create Vacation Service

**Date**: 2026-01-24
**Ticket**: NOK-140 (TICKET-083)
**Research**: thoughts/shared/research/2026-01-24-NOK-140-create-vacation-service.md

## Overview

Create the VacationService that provides vacation balance management, year initialization with pro-rated entitlement calculation, vacation-taken recalculation from approved absences, balance adjustments, and year-to-year carryover with maximum enforcement.

**Pattern**: Follows the BookingService/AbsenceService pattern (concrete struct, private dependency interfaces, testify/mock tests).

## Files to Create/Modify

| Action | File |
|--------|------|
| Create | `apps/api/internal/service/vacation.go` |
| Create | `apps/api/internal/service/vacation_test.go` |
| Modify | `apps/api/cmd/server/main.go` (wire VacationService) |

## Design Decisions

1. **Concrete struct pattern** (like BookingService/AbsenceService), not exported interface
2. **Private dependency interfaces** defined in the service file for each repository needed
3. **Sensible defaults** for missing tariff/employee fields (StandardWeeklyHours=40, VacationBasis=calendar_year, no SpecialCalcs, no BirthDate/disability)
4. **Max carryover as constructor parameter** (`defaultMaxCarryover decimal.Decimal`) since the config source is not yet available; a value of 0 means unlimited
5. **RecalculateTaken** uses `DeductsVacation` flag on AbsenceType to identify which absence types reduce the vacation balance (more flexible than filtering by category alone)
6. **GetBalance** returns the model directly (which already has `Total()` and `Available()` helper methods)
7. **TenantID is required** for absence type lookups; retrieved from the employee record
8. **InitializeYear is idempotent** -- uses `Upsert` so calling it multiple times recalculates entitlement without creating duplicates
9. **CarryoverFromPreviousYear** gets the previous year's `Available()` and applies `calculation.CalculateCarryover`; sets the `Carryover` field on the current year's balance (creating it if needed)
10. **AdjustBalance** accumulates: adds the adjustment to the existing `Adjustments` field, does not replace it

---

## Phase 1: Create Service File - Structure, Errors, Interfaces, Constructor

### Step 1.1: Create `apps/api/internal/service/vacation.go`

```go
package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/internal/calculation"
	"github.com/tolga/terp/internal/model"
)

// Vacation service errors.
var (
	ErrVacationBalanceNotFound = errors.New("vacation balance not found")
	ErrInvalidYear             = errors.New("invalid year")
	ErrEmployeeNotFound        = errors.New("employee not found")
)

// vacationBalanceRepoForVacation defines the interface for vacation balance data access.
type vacationBalanceRepoForVacation interface {
	GetByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error)
	Upsert(ctx context.Context, balance *model.VacationBalance) error
	UpdateTaken(ctx context.Context, employeeID uuid.UUID, year int, taken decimal.Decimal) error
}

// absenceDayRepoForVacation defines the interface for absence day counting.
type absenceDayRepoForVacation interface {
	CountByTypeInRange(ctx context.Context, employeeID, typeID uuid.UUID, from, to time.Time) (decimal.Decimal, error)
}

// absenceTypeRepoForVacation defines the interface for absence type lookups.
type absenceTypeRepoForVacation interface {
	List(ctx context.Context, tenantID uuid.UUID, includeSystem bool) ([]model.AbsenceType, error)
}

// employeeRepoForVacation defines the interface for employee data.
type employeeRepoForVacation interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error)
}

// VacationService handles vacation balance business logic.
type VacationService struct {
	vacationBalanceRepo vacationBalanceRepoForVacation
	absenceDayRepo      absenceDayRepoForVacation
	absenceTypeRepo     absenceTypeRepoForVacation
	employeeRepo        employeeRepoForVacation
	defaultMaxCarryover decimal.Decimal // 0 = unlimited
}

// NewVacationService creates a new VacationService instance.
func NewVacationService(
	vacationBalanceRepo vacationBalanceRepoForVacation,
	absenceDayRepo absenceDayRepoForVacation,
	absenceTypeRepo absenceTypeRepoForVacation,
	employeeRepo employeeRepoForVacation,
	defaultMaxCarryover decimal.Decimal,
) *VacationService {
	return &VacationService{
		vacationBalanceRepo: vacationBalanceRepo,
		absenceDayRepo:      absenceDayRepo,
		absenceTypeRepo:     absenceTypeRepo,
		employeeRepo:        employeeRepo,
		defaultMaxCarryover: defaultMaxCarryover,
	}
}
```

### Verification
```bash
cd apps/api && go build ./...
```

---

## Phase 2: Implement GetBalance

### Step 2.1: GetBalance Method

Retrieves the vacation balance for an employee and year. Returns `ErrVacationBalanceNotFound` if no balance record exists. The returned `model.VacationBalance` has `Total()` and `Available()` helpers for derived values.

```go
// GetBalance retrieves the vacation balance for an employee and year.
// Returns ErrVacationBalanceNotFound if no balance has been initialized.
func (s *VacationService) GetBalance(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error) {
	if year < 1900 || year > 2200 {
		return nil, ErrInvalidYear
	}

	balance, err := s.vacationBalanceRepo.GetByEmployeeYear(ctx, employeeID, year)
	if err != nil {
		return nil, err
	}
	if balance == nil {
		return nil, ErrVacationBalanceNotFound
	}

	return balance, nil
}
```

### Verification
```bash
cd apps/api && go build ./...
```

---

## Phase 3: Implement InitializeYear

### Step 3.1: InitializeYear Method

Calculates the pro-rated vacation entitlement for an employee in a given year using the `calculation.CalculateVacation` function, then upserts the balance record. Uses sensible defaults for fields not yet available on the employee/tariff models (BirthDate, StandardWeeklyHours, VacationBasis, SpecialCalcs).

```go
// InitializeYear calculates and stores the vacation entitlement for a year.
// Uses the employee's VacationDaysPerYear, WeeklyHours, EntryDate, and ExitDate
// to compute pro-rated and part-time adjusted entitlement.
// This is idempotent: calling multiple times recalculates the entitlement.
func (s *VacationService) InitializeYear(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error) {
	if year < 1900 || year > 2200 {
		return nil, ErrInvalidYear
	}

	// Get employee data
	employee, err := s.employeeRepo.GetByID(ctx, employeeID)
	if err != nil {
		return nil, ErrEmployeeNotFound
	}

	// Build calculation input with available fields and sensible defaults
	input := calculation.VacationCalcInput{
		EntryDate:           employee.EntryDate,
		ExitDate:            employee.ExitDate,
		WeeklyHours:         employee.WeeklyHours,
		BaseVacationDays:    employee.VacationDaysPerYear,
		StandardWeeklyHours: decimal.NewFromInt(40), // Default until tariff ZMI fields available
		Basis:               calculation.VacationBasisCalendarYear,
		Year:                year,
		ReferenceDate:       time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC),
		// BirthDate, HasDisability, SpecialCalcs: zero values (no bonuses applied)
	}

	// Calculate entitlement
	output := calculation.CalculateVacation(input)

	// Get existing balance to preserve carryover, adjustments, and taken
	existing, err := s.vacationBalanceRepo.GetByEmployeeYear(ctx, employeeID, year)
	if err != nil {
		return nil, err
	}

	var balance model.VacationBalance
	if existing != nil {
		balance = *existing
		balance.Entitlement = output.TotalEntitlement
	} else {
		balance = model.VacationBalance{
			TenantID:    employee.TenantID,
			EmployeeID:  employeeID,
			Year:        year,
			Entitlement: output.TotalEntitlement,
		}
	}

	// Upsert the balance
	if err := s.vacationBalanceRepo.Upsert(ctx, &balance); err != nil {
		return nil, err
	}

	return &balance, nil
}
```

### Verification
```bash
cd apps/api && go build ./...
```

---

## Phase 4: Implement RecalculateTaken

### Step 4.1: RecalculateTaken Method

Recalculates the total vacation days taken by summing approved absence days from all absence types that have `DeductsVacation = true`. Uses the full year date range (Jan 1 - Dec 31) for the given year.

```go
// RecalculateTaken recalculates the vacation days taken for an employee in a year.
// It sums approved absence days from all absence types where DeductsVacation = true.
func (s *VacationService) RecalculateTaken(ctx context.Context, employeeID uuid.UUID, year int) error {
	if year < 1900 || year > 2200 {
		return ErrInvalidYear
	}

	// Get employee for tenant ID
	employee, err := s.employeeRepo.GetByID(ctx, employeeID)
	if err != nil {
		return ErrEmployeeNotFound
	}

	// Get all absence types that deduct vacation
	allTypes, err := s.absenceTypeRepo.List(ctx, employee.TenantID, true)
	if err != nil {
		return err
	}

	// Filter to types that deduct vacation
	var vacationTypes []model.AbsenceType
	for _, at := range allTypes {
		if at.DeductsVacation {
			vacationTypes = append(vacationTypes, at)
		}
	}

	// Sum vacation days taken across all vacation-deducting types for the year
	yearStart := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
	yearEnd := time.Date(year, 12, 31, 0, 0, 0, 0, time.UTC)

	totalTaken := decimal.Zero
	for _, vt := range vacationTypes {
		count, err := s.absenceDayRepo.CountByTypeInRange(ctx, employeeID, vt.ID, yearStart, yearEnd)
		if err != nil {
			return err
		}
		totalTaken = totalTaken.Add(count)
	}

	// Update the taken value
	return s.vacationBalanceRepo.UpdateTaken(ctx, employeeID, year, totalTaken)
}
```

### Verification
```bash
cd apps/api && go build ./...
```

---

## Phase 5: Implement AdjustBalance

### Step 5.1: AdjustBalance Method

Adds a manual adjustment to the vacation balance. The adjustment is accumulated (added to existing `Adjustments` value), not replaced. This allows for positive corrections (bonus days) and negative corrections (deductions).

```go
// AdjustBalance adds a manual adjustment to the vacation balance.
// The adjustment is accumulated (added to existing Adjustments), not replaced.
// A positive value adds days; a negative value deducts days.
func (s *VacationService) AdjustBalance(ctx context.Context, employeeID uuid.UUID, year int, adjustment decimal.Decimal, notes string) error {
	if year < 1900 || year > 2200 {
		return ErrInvalidYear
	}

	// Get existing balance
	balance, err := s.vacationBalanceRepo.GetByEmployeeYear(ctx, employeeID, year)
	if err != nil {
		return err
	}
	if balance == nil {
		return ErrVacationBalanceNotFound
	}

	// Accumulate adjustment
	balance.Adjustments = balance.Adjustments.Add(adjustment)

	// Upsert with updated adjustments
	return s.vacationBalanceRepo.Upsert(ctx, balance)
}
```

**Note**: The `notes` parameter is accepted for audit logging purposes. A full audit trail implementation is pending future tickets. The parameter is kept in the signature to match the ticket interface and avoid a breaking change later.

### Verification
```bash
cd apps/api && go build ./...
```

---

## Phase 6: Implement CarryoverFromPreviousYear

### Step 6.1: CarryoverFromPreviousYear Method

Carries over remaining vacation from the previous year, respecting the maximum carryover limit. The `year` parameter is the TARGET year (the year receiving the carryover). It reads the previous year's `Available()` balance and applies `calculation.CalculateCarryover` with the configured maximum.

```go
// CarryoverFromPreviousYear carries over remaining vacation from the previous year.
// The year parameter is the TARGET year (receiving the carryover).
// Respects the configured defaultMaxCarryover (0 = unlimited).
func (s *VacationService) CarryoverFromPreviousYear(ctx context.Context, employeeID uuid.UUID, year int) error {
	if year < 1901 || year > 2200 {
		return ErrInvalidYear
	}

	// Get employee for tenant ID
	employee, err := s.employeeRepo.GetByID(ctx, employeeID)
	if err != nil {
		return ErrEmployeeNotFound
	}

	// Get previous year's balance
	prevBalance, err := s.vacationBalanceRepo.GetByEmployeeYear(ctx, employeeID, year-1)
	if err != nil {
		return err
	}
	if prevBalance == nil {
		// No previous year balance - nothing to carry over
		return nil
	}

	// Calculate carryover amount (capped by max)
	available := prevBalance.Available()
	carryover := calculation.CalculateCarryover(available, s.defaultMaxCarryover)

	if carryover.IsZero() {
		return nil
	}

	// Get or create current year balance
	currentBalance, err := s.vacationBalanceRepo.GetByEmployeeYear(ctx, employeeID, year)
	if err != nil {
		return err
	}
	if currentBalance == nil {
		currentBalance = &model.VacationBalance{
			TenantID:   employee.TenantID,
			EmployeeID: employeeID,
			Year:       year,
		}
	}

	// Set carryover (replaces, not accumulates -- carryover is a one-time year-start operation)
	currentBalance.Carryover = carryover

	return s.vacationBalanceRepo.Upsert(ctx, currentBalance)
}
```

### Verification
```bash
cd apps/api && go build ./...
```

---

## Phase 7: Write Unit Tests

**File**: `apps/api/internal/service/vacation_test.go`

### Step 7.1: Mock Definitions and Test Helper

```go
package service

import (
	"context"
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

type mockVacationBalanceRepoForVacation struct {
	mock.Mock
}

func (m *mockVacationBalanceRepoForVacation) GetByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error) {
	args := m.Called(ctx, employeeID, year)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.VacationBalance), args.Error(1)
}

func (m *mockVacationBalanceRepoForVacation) Upsert(ctx context.Context, balance *model.VacationBalance) error {
	args := m.Called(ctx, balance)
	return args.Error(0)
}

func (m *mockVacationBalanceRepoForVacation) UpdateTaken(ctx context.Context, employeeID uuid.UUID, year int, taken decimal.Decimal) error {
	args := m.Called(ctx, employeeID, year, taken)
	return args.Error(0)
}

type mockAbsenceDayRepoForVacation struct {
	mock.Mock
}

func (m *mockAbsenceDayRepoForVacation) CountByTypeInRange(ctx context.Context, employeeID, typeID uuid.UUID, from, to time.Time) (decimal.Decimal, error) {
	args := m.Called(ctx, employeeID, typeID, from, to)
	return args.Get(0).(decimal.Decimal), args.Error(1)
}

type mockAbsenceTypeRepoForVacation struct {
	mock.Mock
}

func (m *mockAbsenceTypeRepoForVacation) List(ctx context.Context, tenantID uuid.UUID, includeSystem bool) ([]model.AbsenceType, error) {
	args := m.Called(ctx, tenantID, includeSystem)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.AbsenceType), args.Error(1)
}

type mockEmployeeRepoForVacation struct {
	mock.Mock
}

func (m *mockEmployeeRepoForVacation) GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.Employee), args.Error(1)
}

// --- Test helper ---

func newTestVacationService(maxCarryover decimal.Decimal) (
	*VacationService,
	*mockVacationBalanceRepoForVacation,
	*mockAbsenceDayRepoForVacation,
	*mockAbsenceTypeRepoForVacation,
	*mockEmployeeRepoForVacation,
) {
	vacBalanceRepo := new(mockVacationBalanceRepoForVacation)
	absenceDayRepo := new(mockAbsenceDayRepoForVacation)
	absenceTypeRepo := new(mockAbsenceTypeRepoForVacation)
	employeeRepo := new(mockEmployeeRepoForVacation)

	svc := NewVacationService(vacBalanceRepo, absenceDayRepo, absenceTypeRepo, employeeRepo, maxCarryover)
	return svc, vacBalanceRepo, absenceDayRepo, absenceTypeRepo, employeeRepo
}
```

### Step 7.2: GetBalance Tests

```go
func TestVacationService_GetBalance_Success(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, _, _, _ := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	year := 2026
	expected := &model.VacationBalance{
		EmployeeID:  employeeID,
		Year:        year,
		Entitlement: decimal.NewFromInt(30),
		Carryover:   decimal.NewFromInt(5),
		Taken:       decimal.NewFromInt(10),
	}

	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, year).Return(expected, nil)

	result, err := svc.GetBalance(ctx, employeeID, year)

	require.NoError(t, err)
	assert.Equal(t, decimal.NewFromInt(30), result.Entitlement)
	assert.Equal(t, decimal.NewFromInt(5), result.Carryover)
	assert.Equal(t, decimal.NewFromInt(10), result.Taken)
	// Verify derived values
	assert.Equal(t, decimal.NewFromInt(35), result.Total())     // 30 + 5 + 0
	assert.Equal(t, decimal.NewFromInt(25), result.Available()) // 35 - 10
	vacBalanceRepo.AssertExpectations(t)
}

func TestVacationService_GetBalance_NotFound(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, _, _, _ := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2026).Return(nil, nil)

	_, err := svc.GetBalance(ctx, employeeID, 2026)

	assert.ErrorIs(t, err, ErrVacationBalanceNotFound)
}

func TestVacationService_GetBalance_InvalidYear(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _ := newTestVacationService(decimal.Zero)

	_, err := svc.GetBalance(ctx, uuid.New(), 1800)
	assert.ErrorIs(t, err, ErrInvalidYear)

	_, err = svc.GetBalance(ctx, uuid.New(), 2500)
	assert.ErrorIs(t, err, ErrInvalidYear)
}
```

### Step 7.3: InitializeYear Tests

```go
func TestVacationService_InitializeYear_FullYear(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, _, _, employeeRepo := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	tenantID := uuid.New()

	employee := &model.Employee{
		ID:                  employeeID,
		TenantID:            tenantID,
		EntryDate:           time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC), // Employed since 2020
		WeeklyHours:         decimal.NewFromInt(40),                        // Full-time
		VacationDaysPerYear: decimal.NewFromInt(30),
	}

	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)
	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2026).Return(nil, nil) // No existing balance
	vacBalanceRepo.On("Upsert", ctx, mock.MatchedBy(func(b *model.VacationBalance) bool {
		return b.EmployeeID == employeeID &&
			b.Year == 2026 &&
			b.TenantID == tenantID &&
			b.Entitlement.Equal(decimal.NewFromInt(30)) // Full year, full-time = 30
	})).Return(nil)

	result, err := svc.InitializeYear(ctx, employeeID, 2026)

	require.NoError(t, err)
	assert.Equal(t, decimal.NewFromInt(30), result.Entitlement)
	vacBalanceRepo.AssertExpectations(t)
	employeeRepo.AssertExpectations(t)
}

func TestVacationService_InitializeYear_PartYear(t *testing.T) {
	// Employee started July 1, 2026 -> 6 months -> 30 * 6/12 = 15 days
	ctx := context.Background()
	svc, vacBalanceRepo, _, _, employeeRepo := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	tenantID := uuid.New()

	employee := &model.Employee{
		ID:                  employeeID,
		TenantID:            tenantID,
		EntryDate:           time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC), // Started mid-year
		WeeklyHours:         decimal.NewFromInt(40),
		VacationDaysPerYear: decimal.NewFromInt(30),
	}

	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)
	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2026).Return(nil, nil)
	vacBalanceRepo.On("Upsert", ctx, mock.MatchedBy(func(b *model.VacationBalance) bool {
		// 6 months (Jul-Dec) -> 30 * 6/12 = 15.0
		return b.Entitlement.Equal(decimal.NewFromInt(15))
	})).Return(nil)

	result, err := svc.InitializeYear(ctx, employeeID, 2026)

	require.NoError(t, err)
	assert.Equal(t, decimal.NewFromInt(15), result.Entitlement)
}

func TestVacationService_InitializeYear_PartTime(t *testing.T) {
	// Employee works 20h/week out of 40h standard -> 30 * 20/40 = 15 days
	ctx := context.Background()
	svc, vacBalanceRepo, _, _, employeeRepo := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	tenantID := uuid.New()

	employee := &model.Employee{
		ID:                  employeeID,
		TenantID:            tenantID,
		EntryDate:           time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC),
		WeeklyHours:         decimal.NewFromInt(20), // Half-time
		VacationDaysPerYear: decimal.NewFromInt(30),
	}

	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)
	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2026).Return(nil, nil)
	vacBalanceRepo.On("Upsert", ctx, mock.MatchedBy(func(b *model.VacationBalance) bool {
		// Full year, part-time: 30 * (20/40) = 15.0
		return b.Entitlement.Equal(decimal.NewFromInt(15))
	})).Return(nil)

	result, err := svc.InitializeYear(ctx, employeeID, 2026)

	require.NoError(t, err)
	assert.Equal(t, decimal.NewFromInt(15), result.Entitlement)
}

func TestVacationService_InitializeYear_PreservesExistingFields(t *testing.T) {
	// When re-initializing, carryover/adjustments/taken should be preserved
	ctx := context.Background()
	svc, vacBalanceRepo, _, _, employeeRepo := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	tenantID := uuid.New()

	employee := &model.Employee{
		ID:                  employeeID,
		TenantID:            tenantID,
		EntryDate:           time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC),
		WeeklyHours:         decimal.NewFromInt(40),
		VacationDaysPerYear: decimal.NewFromInt(30),
	}

	existing := &model.VacationBalance{
		TenantID:    tenantID,
		EmployeeID:  employeeID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(25), // Old value
		Carryover:   decimal.NewFromInt(5),
		Adjustments: decimal.NewFromInt(2),
		Taken:       decimal.NewFromInt(10),
	}

	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)
	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2026).Return(existing, nil)
	vacBalanceRepo.On("Upsert", ctx, mock.MatchedBy(func(b *model.VacationBalance) bool {
		// Entitlement recalculated, but carryover/adjustments/taken preserved
		return b.Entitlement.Equal(decimal.NewFromInt(30)) &&
			b.Carryover.Equal(decimal.NewFromInt(5)) &&
			b.Adjustments.Equal(decimal.NewFromInt(2)) &&
			b.Taken.Equal(decimal.NewFromInt(10))
	})).Return(nil)

	result, err := svc.InitializeYear(ctx, employeeID, 2026)

	require.NoError(t, err)
	assert.Equal(t, decimal.NewFromInt(30), result.Entitlement)
	assert.Equal(t, decimal.NewFromInt(5), result.Carryover)
}

func TestVacationService_InitializeYear_EmployeeNotFound(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, employeeRepo := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	employeeRepo.On("GetByID", ctx, employeeID).Return(nil, errors.New("not found"))

	_, err := svc.InitializeYear(ctx, employeeID, 2026)

	assert.ErrorIs(t, err, ErrEmployeeNotFound)
}

func TestVacationService_InitializeYear_InvalidYear(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _ := newTestVacationService(decimal.Zero)

	_, err := svc.InitializeYear(ctx, uuid.New(), 0)
	assert.ErrorIs(t, err, ErrInvalidYear)
}
```

### Step 7.4: RecalculateTaken Tests

```go
func TestVacationService_RecalculateTaken_Success(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, absenceDayRepo, absenceTypeRepo, employeeRepo := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	tenantID := uuid.New()

	employee := &model.Employee{ID: employeeID, TenantID: tenantID}
	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)

	vacTypeID := uuid.New()
	specialTypeID := uuid.New()
	nonVacTypeID := uuid.New()

	absenceTypeRepo.On("List", ctx, tenantID, true).Return([]model.AbsenceType{
		{ID: vacTypeID, DeductsVacation: true},
		{ID: specialTypeID, DeductsVacation: true},
		{ID: nonVacTypeID, DeductsVacation: false}, // Illness - should not count
	}, nil)

	yearStart := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	yearEnd := time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC)

	absenceDayRepo.On("CountByTypeInRange", ctx, employeeID, vacTypeID, yearStart, yearEnd).
		Return(decimal.NewFromFloat(5.5), nil)
	absenceDayRepo.On("CountByTypeInRange", ctx, employeeID, specialTypeID, yearStart, yearEnd).
		Return(decimal.NewFromFloat(2.0), nil)

	// Total taken should be 5.5 + 2.0 = 7.5
	vacBalanceRepo.On("UpdateTaken", ctx, employeeID, 2026, decimal.NewFromFloat(7.5)).Return(nil)

	err := svc.RecalculateTaken(ctx, employeeID, 2026)

	require.NoError(t, err)
	vacBalanceRepo.AssertExpectations(t)
	absenceDayRepo.AssertExpectations(t)
}

func TestVacationService_RecalculateTaken_NoVacationTypes(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, _, absenceTypeRepo, employeeRepo := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	tenantID := uuid.New()

	employee := &model.Employee{ID: employeeID, TenantID: tenantID}
	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)

	// No types deduct vacation
	absenceTypeRepo.On("List", ctx, tenantID, true).Return([]model.AbsenceType{
		{ID: uuid.New(), DeductsVacation: false},
	}, nil)

	// Total taken should be 0
	vacBalanceRepo.On("UpdateTaken", ctx, employeeID, 2026, decimal.Zero).Return(nil)

	err := svc.RecalculateTaken(ctx, employeeID, 2026)

	require.NoError(t, err)
	vacBalanceRepo.AssertExpectations(t)
}

func TestVacationService_RecalculateTaken_EmployeeNotFound(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, employeeRepo := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	employeeRepo.On("GetByID", ctx, employeeID).Return(nil, errors.New("not found"))

	err := svc.RecalculateTaken(ctx, employeeID, 2026)

	assert.ErrorIs(t, err, ErrEmployeeNotFound)
}

func TestVacationService_RecalculateTaken_InvalidYear(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _ := newTestVacationService(decimal.Zero)

	err := svc.RecalculateTaken(ctx, uuid.New(), -1)
	assert.ErrorIs(t, err, ErrInvalidYear)
}
```

### Step 7.5: AdjustBalance Tests

```go
func TestVacationService_AdjustBalance_Success(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, _, _, _ := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	existing := &model.VacationBalance{
		EmployeeID:  employeeID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(30),
		Adjustments: decimal.NewFromInt(2), // Already has 2 days adjustment
	}

	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2026).Return(existing, nil)
	vacBalanceRepo.On("Upsert", ctx, mock.MatchedBy(func(b *model.VacationBalance) bool {
		// Adjustments should be 2 + 3 = 5
		return b.Adjustments.Equal(decimal.NewFromInt(5))
	})).Return(nil)

	err := svc.AdjustBalance(ctx, employeeID, 2026, decimal.NewFromInt(3), "bonus days")

	require.NoError(t, err)
	vacBalanceRepo.AssertExpectations(t)
}

func TestVacationService_AdjustBalance_NegativeAdjustment(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, _, _, _ := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	existing := &model.VacationBalance{
		EmployeeID:  employeeID,
		Year:        2026,
		Adjustments: decimal.NewFromInt(5),
	}

	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2026).Return(existing, nil)
	vacBalanceRepo.On("Upsert", ctx, mock.MatchedBy(func(b *model.VacationBalance) bool {
		// 5 + (-2) = 3
		return b.Adjustments.Equal(decimal.NewFromInt(3))
	})).Return(nil)

	err := svc.AdjustBalance(ctx, employeeID, 2026, decimal.NewFromInt(-2), "correction")

	require.NoError(t, err)
}

func TestVacationService_AdjustBalance_NotFound(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, _, _, _ := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2026).Return(nil, nil)

	err := svc.AdjustBalance(ctx, employeeID, 2026, decimal.NewFromInt(1), "test")

	assert.ErrorIs(t, err, ErrVacationBalanceNotFound)
}

func TestVacationService_AdjustBalance_InvalidYear(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _ := newTestVacationService(decimal.Zero)

	err := svc.AdjustBalance(ctx, uuid.New(), 0, decimal.NewFromInt(1), "test")
	assert.ErrorIs(t, err, ErrInvalidYear)
}
```

### Step 7.6: CarryoverFromPreviousYear Tests

```go
func TestVacationService_CarryoverFromPreviousYear_Success(t *testing.T) {
	ctx := context.Background()
	maxCarryover := decimal.NewFromInt(10)
	svc, vacBalanceRepo, _, _, employeeRepo := newTestVacationService(maxCarryover)

	employeeID := uuid.New()
	tenantID := uuid.New()

	employee := &model.Employee{ID: employeeID, TenantID: tenantID}
	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)

	// Previous year: 30 entitlement - 22 taken = 8 available
	prevBalance := &model.VacationBalance{
		EmployeeID:  employeeID,
		Year:        2025,
		Entitlement: decimal.NewFromInt(30),
		Taken:       decimal.NewFromInt(22),
	}

	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2025).Return(prevBalance, nil)
	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2026).Return(nil, nil) // No current year balance yet
	vacBalanceRepo.On("Upsert", ctx, mock.MatchedBy(func(b *model.VacationBalance) bool {
		// 8 available, max 10 -> carryover = 8 (under max)
		return b.Year == 2026 &&
			b.EmployeeID == employeeID &&
			b.Carryover.Equal(decimal.NewFromInt(8))
	})).Return(nil)

	err := svc.CarryoverFromPreviousYear(ctx, employeeID, 2026)

	require.NoError(t, err)
	vacBalanceRepo.AssertExpectations(t)
}

func TestVacationService_CarryoverFromPreviousYear_CappedAtMax(t *testing.T) {
	ctx := context.Background()
	maxCarryover := decimal.NewFromInt(5)
	svc, vacBalanceRepo, _, _, employeeRepo := newTestVacationService(maxCarryover)

	employeeID := uuid.New()
	tenantID := uuid.New()

	employee := &model.Employee{ID: employeeID, TenantID: tenantID}
	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)

	// Previous year: 30 entitlement - 20 taken = 10 available
	prevBalance := &model.VacationBalance{
		EmployeeID:  employeeID,
		Year:        2025,
		Entitlement: decimal.NewFromInt(30),
		Taken:       decimal.NewFromInt(20),
	}

	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2025).Return(prevBalance, nil)
	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2026).Return(nil, nil)
	vacBalanceRepo.On("Upsert", ctx, mock.MatchedBy(func(b *model.VacationBalance) bool {
		// 10 available, max 5 -> carryover = 5 (capped)
		return b.Carryover.Equal(decimal.NewFromInt(5))
	})).Return(nil)

	err := svc.CarryoverFromPreviousYear(ctx, employeeID, 2026)

	require.NoError(t, err)
	vacBalanceRepo.AssertExpectations(t)
}

func TestVacationService_CarryoverFromPreviousYear_Unlimited(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, _, _, employeeRepo := newTestVacationService(decimal.Zero) // 0 = unlimited

	employeeID := uuid.New()
	tenantID := uuid.New()

	employee := &model.Employee{ID: employeeID, TenantID: tenantID}
	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)

	// Previous year: 30 entitlement - 10 taken = 20 available
	prevBalance := &model.VacationBalance{
		EmployeeID:  employeeID,
		Year:        2025,
		Entitlement: decimal.NewFromInt(30),
		Taken:       decimal.NewFromInt(10),
	}

	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2025).Return(prevBalance, nil)
	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2026).Return(nil, nil)
	vacBalanceRepo.On("Upsert", ctx, mock.MatchedBy(func(b *model.VacationBalance) bool {
		// 20 available, unlimited -> carryover = 20
		return b.Carryover.Equal(decimal.NewFromInt(20))
	})).Return(nil)

	err := svc.CarryoverFromPreviousYear(ctx, employeeID, 2026)

	require.NoError(t, err)
	vacBalanceRepo.AssertExpectations(t)
}

func TestVacationService_CarryoverFromPreviousYear_NoPreviousBalance(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, _, _, employeeRepo := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	employee := &model.Employee{ID: employeeID, TenantID: uuid.New()}
	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)

	// No previous year balance
	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2025).Return(nil, nil)

	err := svc.CarryoverFromPreviousYear(ctx, employeeID, 2026)

	require.NoError(t, err)
	// Verify Upsert was NOT called (no carryover to process)
	vacBalanceRepo.AssertNotCalled(t, "Upsert")
}

func TestVacationService_CarryoverFromPreviousYear_NegativeAvailable(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, _, _, employeeRepo := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	employee := &model.Employee{ID: employeeID, TenantID: uuid.New()}
	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)

	// Previous year: overbooked (taken > total)
	prevBalance := &model.VacationBalance{
		EmployeeID:  employeeID,
		Year:        2025,
		Entitlement: decimal.NewFromInt(30),
		Taken:       decimal.NewFromInt(35), // Overspent
	}

	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2025).Return(prevBalance, nil)

	err := svc.CarryoverFromPreviousYear(ctx, employeeID, 2026)

	require.NoError(t, err)
	// CalculateCarryover returns 0 for negative available; no Upsert expected
	vacBalanceRepo.AssertNotCalled(t, "Upsert")
}

func TestVacationService_CarryoverFromPreviousYear_UpdatesExisting(t *testing.T) {
	ctx := context.Background()
	maxCarryover := decimal.NewFromInt(10)
	svc, vacBalanceRepo, _, _, employeeRepo := newTestVacationService(maxCarryover)

	employeeID := uuid.New()
	tenantID := uuid.New()

	employee := &model.Employee{ID: employeeID, TenantID: tenantID}
	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)

	prevBalance := &model.VacationBalance{
		EmployeeID:  employeeID,
		Year:        2025,
		Entitlement: decimal.NewFromInt(30),
		Taken:       decimal.NewFromInt(25), // 5 available
	}

	// Current year balance already exists (e.g., InitializeYear was called)
	currentBalance := &model.VacationBalance{
		TenantID:    tenantID,
		EmployeeID:  employeeID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(30),
		Carryover:   decimal.NewFromInt(3), // Old carryover to be replaced
	}

	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2025).Return(prevBalance, nil)
	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2026).Return(currentBalance, nil)
	vacBalanceRepo.On("Upsert", ctx, mock.MatchedBy(func(b *model.VacationBalance) bool {
		// Carryover replaced with new value (5), not accumulated
		return b.Carryover.Equal(decimal.NewFromInt(5)) &&
			b.Entitlement.Equal(decimal.NewFromInt(30)) // Entitlement preserved
	})).Return(nil)

	err := svc.CarryoverFromPreviousYear(ctx, employeeID, 2026)

	require.NoError(t, err)
	vacBalanceRepo.AssertExpectations(t)
}

func TestVacationService_CarryoverFromPreviousYear_EmployeeNotFound(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, employeeRepo := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	employeeRepo.On("GetByID", ctx, employeeID).Return(nil, errors.New("not found"))

	err := svc.CarryoverFromPreviousYear(ctx, employeeID, 2026)

	assert.ErrorIs(t, err, ErrEmployeeNotFound)
}

func TestVacationService_CarryoverFromPreviousYear_InvalidYear(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _ := newTestVacationService(decimal.Zero)

	err := svc.CarryoverFromPreviousYear(ctx, uuid.New(), 1900) // min is 1901 for carryover
	assert.ErrorIs(t, err, ErrInvalidYear)
}
```

### Step 7.7: Add Missing Import

The test file requires the `errors` package for `errors.New("not found")` in mock setup:

```go
import (
	"context"
	"errors"
	"testing"
	"time"
	// ...
)
```

### Verification
```bash
cd apps/api && go test -v -run TestVacationService ./internal/service/...
```

---

## Phase 8: Wire into main.go

**File**: `apps/api/cmd/server/main.go`

### Step 8.1: Add VacationService Initialization

After the AbsenceService initialization block (line 111), add:

```go
// Initialize VacationService
vacationBalanceRepo := repository.NewVacationBalanceRepository(db)
vacationService := service.NewVacationService(vacationBalanceRepo, absenceDayRepo, absenceTypeRepo, employeeRepo, decimal.Zero)
_ = vacationService // TODO: Wire to VacationHandler (separate ticket)
```

**Note**: `absenceDayRepo`, `absenceTypeRepo`, and `employeeRepo` are already initialized earlier in main.go. The `decimal.Zero` for maxCarryover means unlimited carryover until the configuration system is implemented.

### Step 8.2: Add import for decimal

If not already imported in main.go, add:
```go
"github.com/shopspring/decimal"
```

### Verification
```bash
cd apps/api && go build ./cmd/server/
```

---

## Phase 9: Final Verification

```bash
cd apps/api && go build ./...
cd apps/api && go test -v -run TestVacationService ./internal/service/...
cd apps/api && go vet ./...
make test
```

---

## Implementation Notes

### Pattern Alignment

The VacationService follows the same concrete-struct pattern as BookingService and AbsenceService:
1. **Concrete struct** exported (`VacationService`) - not an interface
2. **Private interfaces** for each repository dependency (suffix `ForVacation`)
3. **Constructor** returns `*VacationService` with all deps injected
4. **Package-level error sentinels** for typed error checking
5. **No recalc dependency** -- this service IS the vacation calculation orchestrator

### Fields Not Yet Available

The following fields are needed for full ZMI-compatible vacation calculation but are not yet on the Employee/Tariff models:
- `Employee.BirthDate` (for age bonuses)
- `Employee.HasDisability` (for disability bonus)
- `Tariff.StandardWeeklyHours` (full-time reference)
- `Tariff.VacationBasis` (calendar_year vs entry_date)
- `Tariff.SpecialCalcs` (bonus rules)

When these fields become available (via TICKET-123/TICKET-125/TICKET-129/TICKET-131), the `InitializeYear` method should be updated to read them from the employee/tariff instead of using defaults.

### Carryover Strategy

- `CarryoverFromPreviousYear` REPLACES the `Carryover` field (not accumulates). This matches ZMI behavior where year-start carryover is a one-time computed value.
- The `defaultMaxCarryover` is a constructor parameter (not per-employee). When per-employee or per-tariff configuration is available, the method signature should be extended.

### RecalculateTaken Strategy

- Uses `DeductsVacation` flag rather than just `Category == vacation` because special absence types (e.g., "special leave with vacation deduction") may also deduct from vacation balance.
- Sums approved days across ALL deducting types for the full calendar year.
- This should be called after any absence mutation (create/delete/status change) to keep the balance accurate.

---

## Success Criteria

- [ ] `apps/api/internal/service/vacation.go` compiles with all 5 methods implemented
- [ ] `apps/api/internal/service/vacation_test.go` has comprehensive unit tests for all methods
- [ ] GetBalance returns correct balance with Total() and Available() working
- [ ] InitializeYear calculates pro-rated and part-time adjusted entitlement
- [ ] RecalculateTaken sums vacation absences from all DeductsVacation types
- [ ] AdjustBalance accumulates adjustments correctly
- [ ] CarryoverFromPreviousYear respects maxCarryover limit
- [ ] All tests pass: `go test -v -run TestVacationService ./internal/service/...`
- [ ] Service wired in `main.go`
- [ ] `go build ./...` succeeds
- [ ] `go vet ./...` passes
- [ ] `make test` passes
