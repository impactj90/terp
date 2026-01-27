# NOK-129: Create Recalculation Trigger Service Implementation Plan

## Overview

Create a RecalcService that triggers time recalculation when bookings, absences, or configuration changes. The service wraps DailyCalcService to provide single-day, date-range, batch, and tenant-wide recalculation capabilities.

## Current State Analysis

### Existing Infrastructure

1. **DailyCalcService** (`apps/api/internal/service/daily_calc.go:97-120`):
   - `CalculateDay(ctx, tenantID, employeeID, date)` - Single day calculation
   - `RecalculateRange(ctx, tenantID, employeeID, from, to)` - Date range for single employee
   - Returns `(*model.DailyValue, error)` and `(int, error)` respectively

2. **Employee Repository** (`apps/api/internal/repository/employee.go:128-166`):
   - `List(ctx, filter)` returns `([]model.Employee, int64, error)`
   - `EmployeeFilter` supports `TenantID`, `IsActive *bool`, pagination

3. **Service Patterns**:
   - Local interface definitions for dependencies (e.g., `dayPlanRepositoryForWeekPlan`)
   - Concrete service types (not interfaces) returned from constructors
   - Mock-based unit tests using testify

### Key Discoveries

- DailyCalcService requires `tenantID` as explicit parameter (not from context)
- RecalculateRange uses fail-fast pattern (returns on first error)
- No async infrastructure exists - defer async to future ticket

## Desired End State

A `RecalcService` that:
1. Triggers single-day recalculation for one employee
2. Triggers date-range recalculation for one employee
3. Triggers batch recalculation for multiple employees over a date range
4. Triggers tenant-wide recalculation for all active employees
5. Returns `RecalcResult` with processed/failed counts and error details
6. Continues processing on individual errors (doesn't fail entire batch)

### Verification

```bash
cd apps/api && go test -v -run TestRecalc ./internal/service/...
make test
make lint
```

## What We're NOT Doing

- Async execution (deferred to future ticket per ZMI manual pattern)
- Automatic trigger integration (booking/absence services call RecalcService - separate concern)
- Rate limiting (not needed for MVP)
- Progress callbacks or streaming results
- Job queue infrastructure

## Implementation Approach

Create a new service file with:
1. Local interfaces for dependencies (DailyCalcService, EmployeeRepository)
2. Result struct for batch operation visibility
3. Methods that wrap DailyCalcService with batch/tenant-wide capabilities
4. Continue-on-error pattern for batch operations

---

## Phase 1: Create RecalcService with Result Types

### Overview
Create the service file with types, interfaces, constructor, and all methods.

### Changes Required:

#### 1. Create RecalcService
**File**: `apps/api/internal/service/recalc.go`

```go
package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

// dailyCalcServiceForRecalc defines the interface for daily calculation operations.
type dailyCalcServiceForRecalc interface {
	CalculateDay(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error)
	RecalculateRange(ctx context.Context, tenantID, employeeID uuid.UUID, from, to time.Time) (int, error)
}

// employeeRepositoryForRecalc defines the interface for employee lookup.
type employeeRepositoryForRecalc interface {
	List(ctx context.Context, filter repository.EmployeeFilter) ([]model.Employee, int64, error)
}

// RecalcError represents a single recalculation failure.
type RecalcError struct {
	EmployeeID uuid.UUID
	Date       time.Time
	Error      string
}

// RecalcResult contains the outcome of a recalculation operation.
type RecalcResult struct {
	ProcessedDays int
	FailedDays    int
	Errors        []RecalcError
}

// RecalcService triggers recalculation for employees.
type RecalcService struct {
	dailyCalc    dailyCalcServiceForRecalc
	employeeRepo employeeRepositoryForRecalc
}

// NewRecalcService creates a new RecalcService instance.
func NewRecalcService(
	dailyCalc dailyCalcServiceForRecalc,
	employeeRepo employeeRepositoryForRecalc,
) *RecalcService {
	return &RecalcService{
		dailyCalc:    dailyCalc,
		employeeRepo: employeeRepo,
	}
}

// TriggerRecalc recalculates a single day for one employee.
func (s *RecalcService) TriggerRecalc(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*RecalcResult, error) {
	_, err := s.dailyCalc.CalculateDay(ctx, tenantID, employeeID, date)
	if err != nil {
		return &RecalcResult{
			ProcessedDays: 0,
			FailedDays:    1,
			Errors: []RecalcError{
				{EmployeeID: employeeID, Date: date, Error: err.Error()},
			},
		}, err
	}
	return &RecalcResult{ProcessedDays: 1, FailedDays: 0}, nil
}

// TriggerRecalcRange recalculates a date range for one employee.
func (s *RecalcService) TriggerRecalcRange(ctx context.Context, tenantID, employeeID uuid.UUID, from, to time.Time) (*RecalcResult, error) {
	count, err := s.dailyCalc.RecalculateRange(ctx, tenantID, employeeID, from, to)
	if err != nil {
		// Calculate which day failed based on count
		failedDate := from.AddDate(0, 0, count)
		totalDays := int(to.Sub(from).Hours()/24) + 1
		return &RecalcResult{
			ProcessedDays: count,
			FailedDays:    totalDays - count,
			Errors: []RecalcError{
				{EmployeeID: employeeID, Date: failedDate, Error: err.Error()},
			},
		}, err
	}
	return &RecalcResult{ProcessedDays: count, FailedDays: 0}, nil
}

// TriggerRecalcBatch recalculates a date range for multiple employees.
// Continues processing on individual errors.
func (s *RecalcService) TriggerRecalcBatch(ctx context.Context, tenantID uuid.UUID, employeeIDs []uuid.UUID, from, to time.Time) *RecalcResult {
	result := &RecalcResult{}

	for _, empID := range employeeIDs {
		empResult, err := s.TriggerRecalcRange(ctx, tenantID, empID, from, to)
		result.ProcessedDays += empResult.ProcessedDays
		result.FailedDays += empResult.FailedDays
		if err != nil {
			result.Errors = append(result.Errors, empResult.Errors...)
		}
	}

	return result
}

// TriggerRecalcAll recalculates a date range for all active employees in a tenant.
func (s *RecalcService) TriggerRecalcAll(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (*RecalcResult, error) {
	// Get all active employees
	isActive := true
	filter := repository.EmployeeFilter{
		TenantID: tenantID,
		IsActive: &isActive,
	}

	employees, _, err := s.employeeRepo.List(ctx, filter)
	if err != nil {
		return nil, err
	}

	// Extract employee IDs
	employeeIDs := make([]uuid.UUID, len(employees))
	for i, emp := range employees {
		employeeIDs[i] = emp.ID
	}

	return s.TriggerRecalcBatch(ctx, tenantID, employeeIDs, from, to), nil
}
```

### Success Criteria:

#### Automated Verification:
- [x] File compiles: `cd apps/api && go build ./...`
- [x] No linting errors: `make lint` (golangci-lint not installed, build passes)

#### Manual Verification:
- [x] Review code follows codebase patterns

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 2.

---

## Phase 2: Create Unit Tests

### Overview
Create comprehensive unit tests using mock implementations.

### Changes Required:

#### 1. Create Test File
**File**: `apps/api/internal/service/recalc_test.go`

```go
package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

// mockDailyCalcServiceForRecalc implements dailyCalcServiceForRecalc for testing.
type mockDailyCalcServiceForRecalc struct {
	mock.Mock
}

func (m *mockDailyCalcServiceForRecalc) CalculateDay(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error) {
	args := m.Called(ctx, tenantID, employeeID, date)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.DailyValue), args.Error(1)
}

func (m *mockDailyCalcServiceForRecalc) RecalculateRange(ctx context.Context, tenantID, employeeID uuid.UUID, from, to time.Time) (int, error) {
	args := m.Called(ctx, tenantID, employeeID, from, to)
	return args.Int(0), args.Error(1)
}

// mockEmployeeRepositoryForRecalc implements employeeRepositoryForRecalc for testing.
type mockEmployeeRepositoryForRecalc struct {
	mock.Mock
}

func (m *mockEmployeeRepositoryForRecalc) List(ctx context.Context, filter repository.EmployeeFilter) ([]model.Employee, int64, error) {
	args := m.Called(ctx, filter)
	if args.Get(0) == nil {
		return nil, 0, args.Error(2)
	}
	return args.Get(0).([]model.Employee), args.Get(1).(int64), args.Error(2)
}

func TestRecalcService_TriggerRecalc_Success(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	employeeID := uuid.New()
	date := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)

	mockCalc := new(mockDailyCalcServiceForRecalc)
	mockEmpRepo := new(mockEmployeeRepositoryForRecalc)
	svc := NewRecalcService(mockCalc, mockEmpRepo)

	mockCalc.On("CalculateDay", ctx, tenantID, employeeID, date).Return(&model.DailyValue{}, nil)

	result, err := svc.TriggerRecalc(ctx, tenantID, employeeID, date)

	require.NoError(t, err)
	assert.Equal(t, 1, result.ProcessedDays)
	assert.Equal(t, 0, result.FailedDays)
	assert.Empty(t, result.Errors)
	mockCalc.AssertExpectations(t)
}

func TestRecalcService_TriggerRecalc_Error(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	employeeID := uuid.New()
	date := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)

	mockCalc := new(mockDailyCalcServiceForRecalc)
	mockEmpRepo := new(mockEmployeeRepositoryForRecalc)
	svc := NewRecalcService(mockCalc, mockEmpRepo)

	mockCalc.On("CalculateDay", ctx, tenantID, employeeID, date).Return(nil, errors.New("calculation failed"))

	result, err := svc.TriggerRecalc(ctx, tenantID, employeeID, date)

	require.Error(t, err)
	assert.Equal(t, 0, result.ProcessedDays)
	assert.Equal(t, 1, result.FailedDays)
	assert.Len(t, result.Errors, 1)
	assert.Equal(t, employeeID, result.Errors[0].EmployeeID)
	assert.Equal(t, "calculation failed", result.Errors[0].Error)
}

func TestRecalcService_TriggerRecalcRange_Success(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	employeeID := uuid.New()
	from := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 24, 0, 0, 0, 0, time.UTC) // 5 days

	mockCalc := new(mockDailyCalcServiceForRecalc)
	mockEmpRepo := new(mockEmployeeRepositoryForRecalc)
	svc := NewRecalcService(mockCalc, mockEmpRepo)

	mockCalc.On("RecalculateRange", ctx, tenantID, employeeID, from, to).Return(5, nil)

	result, err := svc.TriggerRecalcRange(ctx, tenantID, employeeID, from, to)

	require.NoError(t, err)
	assert.Equal(t, 5, result.ProcessedDays)
	assert.Equal(t, 0, result.FailedDays)
	assert.Empty(t, result.Errors)
	mockCalc.AssertExpectations(t)
}

func TestRecalcService_TriggerRecalcRange_PartialFailure(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	employeeID := uuid.New()
	from := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 24, 0, 0, 0, 0, time.UTC) // 5 days

	mockCalc := new(mockDailyCalcServiceForRecalc)
	mockEmpRepo := new(mockEmployeeRepositoryForRecalc)
	svc := NewRecalcService(mockCalc, mockEmpRepo)

	// Fails after processing 3 days
	mockCalc.On("RecalculateRange", ctx, tenantID, employeeID, from, to).Return(3, errors.New("db error"))

	result, err := svc.TriggerRecalcRange(ctx, tenantID, employeeID, from, to)

	require.Error(t, err)
	assert.Equal(t, 3, result.ProcessedDays)
	assert.Equal(t, 2, result.FailedDays) // 5 - 3 = 2 failed
	assert.Len(t, result.Errors, 1)
	// Failed date should be Jan 23 (from + 3 days)
	expectedFailedDate := from.AddDate(0, 0, 3)
	assert.Equal(t, expectedFailedDate, result.Errors[0].Date)
}

func TestRecalcService_TriggerRecalcBatch_AllSuccess(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	emp1 := uuid.New()
	emp2 := uuid.New()
	emp3 := uuid.New()
	from := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 21, 0, 0, 0, 0, time.UTC) // 2 days

	mockCalc := new(mockDailyCalcServiceForRecalc)
	mockEmpRepo := new(mockEmployeeRepositoryForRecalc)
	svc := NewRecalcService(mockCalc, mockEmpRepo)

	mockCalc.On("RecalculateRange", ctx, tenantID, emp1, from, to).Return(2, nil)
	mockCalc.On("RecalculateRange", ctx, tenantID, emp2, from, to).Return(2, nil)
	mockCalc.On("RecalculateRange", ctx, tenantID, emp3, from, to).Return(2, nil)

	result := svc.TriggerRecalcBatch(ctx, tenantID, []uuid.UUID{emp1, emp2, emp3}, from, to)

	assert.Equal(t, 6, result.ProcessedDays) // 3 employees * 2 days
	assert.Equal(t, 0, result.FailedDays)
	assert.Empty(t, result.Errors)
	mockCalc.AssertExpectations(t)
}

func TestRecalcService_TriggerRecalcBatch_ContinuesOnError(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	emp1 := uuid.New()
	emp2 := uuid.New()
	emp3 := uuid.New()
	from := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 21, 0, 0, 0, 0, time.UTC) // 2 days

	mockCalc := new(mockDailyCalcServiceForRecalc)
	mockEmpRepo := new(mockEmployeeRepositoryForRecalc)
	svc := NewRecalcService(mockCalc, mockEmpRepo)

	// First employee succeeds, second fails, third succeeds
	mockCalc.On("RecalculateRange", ctx, tenantID, emp1, from, to).Return(2, nil)
	mockCalc.On("RecalculateRange", ctx, tenantID, emp2, from, to).Return(0, errors.New("calculation error"))
	mockCalc.On("RecalculateRange", ctx, tenantID, emp3, from, to).Return(2, nil)

	result := svc.TriggerRecalcBatch(ctx, tenantID, []uuid.UUID{emp1, emp2, emp3}, from, to)

	assert.Equal(t, 4, result.ProcessedDays) // emp1: 2 + emp3: 2 = 4
	assert.Equal(t, 2, result.FailedDays)    // emp2: 2 days failed
	assert.Len(t, result.Errors, 1)
	assert.Equal(t, emp2, result.Errors[0].EmployeeID)
	mockCalc.AssertExpectations(t)
}

func TestRecalcService_TriggerRecalcBatch_EmptyList(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	from := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 21, 0, 0, 0, 0, time.UTC)

	mockCalc := new(mockDailyCalcServiceForRecalc)
	mockEmpRepo := new(mockEmployeeRepositoryForRecalc)
	svc := NewRecalcService(mockCalc, mockEmpRepo)

	result := svc.TriggerRecalcBatch(ctx, tenantID, []uuid.UUID{}, from, to)

	assert.Equal(t, 0, result.ProcessedDays)
	assert.Equal(t, 0, result.FailedDays)
	assert.Empty(t, result.Errors)
}

func TestRecalcService_TriggerRecalcAll_Success(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	emp1 := uuid.New()
	emp2 := uuid.New()
	from := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 21, 0, 0, 0, 0, time.UTC) // 2 days

	mockCalc := new(mockDailyCalcServiceForRecalc)
	mockEmpRepo := new(mockEmployeeRepositoryForRecalc)
	svc := NewRecalcService(mockCalc, mockEmpRepo)

	employees := []model.Employee{
		{ID: emp1},
		{ID: emp2},
	}

	isActive := true
	expectedFilter := repository.EmployeeFilter{
		TenantID: tenantID,
		IsActive: &isActive,
	}
	mockEmpRepo.On("List", ctx, expectedFilter).Return(employees, int64(2), nil)
	mockCalc.On("RecalculateRange", ctx, tenantID, emp1, from, to).Return(2, nil)
	mockCalc.On("RecalculateRange", ctx, tenantID, emp2, from, to).Return(2, nil)

	result, err := svc.TriggerRecalcAll(ctx, tenantID, from, to)

	require.NoError(t, err)
	assert.Equal(t, 4, result.ProcessedDays) // 2 employees * 2 days
	assert.Equal(t, 0, result.FailedDays)
	assert.Empty(t, result.Errors)
	mockEmpRepo.AssertExpectations(t)
	mockCalc.AssertExpectations(t)
}

func TestRecalcService_TriggerRecalcAll_EmployeeListError(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	from := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 21, 0, 0, 0, 0, time.UTC)

	mockCalc := new(mockDailyCalcServiceForRecalc)
	mockEmpRepo := new(mockEmployeeRepositoryForRecalc)
	svc := NewRecalcService(mockCalc, mockEmpRepo)

	isActive := true
	expectedFilter := repository.EmployeeFilter{
		TenantID: tenantID,
		IsActive: &isActive,
	}
	mockEmpRepo.On("List", ctx, expectedFilter).Return(nil, int64(0), errors.New("db error"))

	result, err := svc.TriggerRecalcAll(ctx, tenantID, from, to)

	require.Error(t, err)
	assert.Nil(t, result)
	assert.Equal(t, "db error", err.Error())
}

func TestRecalcService_TriggerRecalcAll_NoActiveEmployees(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	from := time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 21, 0, 0, 0, 0, time.UTC)

	mockCalc := new(mockDailyCalcServiceForRecalc)
	mockEmpRepo := new(mockEmployeeRepositoryForRecalc)
	svc := NewRecalcService(mockCalc, mockEmpRepo)

	isActive := true
	expectedFilter := repository.EmployeeFilter{
		TenantID: tenantID,
		IsActive: &isActive,
	}
	mockEmpRepo.On("List", ctx, expectedFilter).Return([]model.Employee{}, int64(0), nil)

	result, err := svc.TriggerRecalcAll(ctx, tenantID, from, to)

	require.NoError(t, err)
	assert.Equal(t, 0, result.ProcessedDays)
	assert.Equal(t, 0, result.FailedDays)
	assert.Empty(t, result.Errors)
}
```

### Success Criteria:

#### Automated Verification:
- [x] Tests compile: `cd apps/api && go test -c ./internal/service/...`
- [x] All tests pass: `cd apps/api && go test -v -run TestRecalc ./internal/service/...`
- [x] Full test suite passes: `make test`
- [x] No linting errors: `make lint` (golangci-lint not installed, build passes)

#### Manual Verification:
- [x] Review test coverage for all methods
- [x] Review edge cases are covered (empty list, partial failures)

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 3.

---

## Phase 3: Wire Service in Application Startup

### Overview
Register RecalcService in the application startup for future use.

### Changes Required:

#### 1. Add Service to Main
**File**: `apps/api/cmd/server/main.go`

Add after other service initializations (around line 96):

```go
// Add these lines after existing service initializations

// Initialize daily calc service (if not already done)
bookingRepo := repository.NewBookingRepository(db)
empDayPlanRepo := repository.NewEmployeeDayPlanRepository(db)
dailyValueRepo := repository.NewDailyValueRepository(db)
dailyCalcService := service.NewDailyCalcService(bookingRepo, empDayPlanRepo, dailyValueRepo, holidayRepo)

// Initialize recalc service
recalcService := service.NewRecalcService(dailyCalcService, employeeRepo)
_ = recalcService // Silence unused warning until handlers use it
```

### Success Criteria:

#### Automated Verification:
- [x] Application compiles: `cd apps/api && go build ./cmd/server`
- [x] Application starts: `make dev` (verify no startup errors)
- [x] Full test suite passes: `make test`
- [x] No linting errors: `make lint` (golangci-lint not installed, build passes)

#### Manual Verification:
- [x] Verify application starts without errors in logs

**Implementation Note**: After completing this phase and all automated verification passes, the ticket is complete.

---

## Testing Strategy

### Unit Tests:
- TriggerRecalc success/failure
- TriggerRecalcRange success/partial failure
- TriggerRecalcBatch success/continue-on-error/empty list
- TriggerRecalcAll success/employee list error/no employees

### Integration Tests:
- Not needed for this ticket (DailyCalcService already has integration tests)

### Manual Testing Steps:
1. Build and run the application
2. Verify no errors in startup logs
3. (Future: when handlers exist) Test recalculation via API

## Performance Considerations

- Batch operations process employees sequentially (no parallel processing)
- Each day is calculated independently (no cross-day transactions)
- Large tenant recalculations may take time - async deferred to future ticket

## References

- Research document: `thoughts/shared/research/2026-01-22-NOK-129-create-recalculation-trigger-service.md`
- Original ticket: `thoughts/shared/plans/tickets/TICKET-071-create-recalculation-trigger-service.md`
- DailyCalcService: `apps/api/internal/service/daily_calc.go`
- DailyCalcService tests: `apps/api/internal/service/daily_calc_test.go`
- ZMI manual reference: `thoughts/shared/reference/zmi-calculataion-manual-reference.md` (Section 21.2)
