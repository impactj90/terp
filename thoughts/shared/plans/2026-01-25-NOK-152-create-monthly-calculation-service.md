# Implementation Plan: NOK-152 - Create Monthly Calculation Service

**Date**: 2026-01-25
**Ticket**: NOK-152 (TICKET-088)
**Research**: thoughts/shared/research/2026-01-25-NOK-152-create-monthly-calculation-service.md

## Overview

Create the MonthlyCalcService that provides batch processing and cascading recalculation capabilities for monthly values. This service wraps MonthlyEvalService and adds:
- Batch calculation for multiple employees
- Cascading recalculation from a starting month through current month
- Result tracking with error aggregation

**Pattern**: Follows the RecalcService pattern (batch processing with continue-on-error, result aggregation).

## Files to Create/Modify

| Action | File |
|--------|------|
| Create | `apps/api/internal/service/monthlycalc.go` |
| Create | `apps/api/internal/service/monthlycalc_test.go` |
| Modify | `apps/api/cmd/server/main.go` (wire MonthlyCalcService) |

## Design Decisions

1. **Wrapper pattern** - MonthlyCalcService wraps MonthlyEvalService for single-month operations
2. **RecalcService pattern for batch** - Uses `MonthlyCalcResult` struct similar to `RecalcResult`
3. **Continue on errors** - Batch and cascade operations continue processing on individual failures
4. **CalculateMonth returns `*model.MonthlyValue`** - Per ticket spec, different from RecalculateMonth which returns error
5. **RecalculateFromMonth stops at current month** - Does not calculate future months
6. **Closed months handling** - RecalculateFromMonth skips closed months silently and continues cascade
7. **Year boundary handling** - Cascade properly handles December->January transitions
8. **Private interfaces** - monthlyEvalServiceForCalc interface for dependency injection

---

## Phase 1: Create Service File - Structure, Types, Constructor

### Step 1.1: Create `apps/api/internal/service/monthlycalc.go`

```go
package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

// Monthly calculation service errors.
var (
	ErrFutureMonth = errors.New("cannot calculate future month")
)

// monthlyEvalServiceForCalc defines the interface for monthly evaluation operations.
type monthlyEvalServiceForCalc interface {
	RecalculateMonth(ctx context.Context, employeeID uuid.UUID, year, month int) error
	GetMonthSummary(ctx context.Context, employeeID uuid.UUID, year, month int) (*MonthSummary, error)
}

// monthlyValueRepoForCalc defines the interface for monthly value lookup.
type monthlyValueRepoForCalc interface {
	GetByEmployeeMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error)
}

// MonthlyCalcError represents a single monthly calculation failure.
type MonthlyCalcError struct {
	EmployeeID uuid.UUID
	Year       int
	Month      int
	Error      string
}

// MonthlyCalcResult contains the outcome of a monthly calculation operation.
type MonthlyCalcResult struct {
	ProcessedMonths int
	SkippedMonths   int // Months skipped due to being closed
	FailedMonths    int
	Errors          []MonthlyCalcError
}

// MonthlyCalcService handles batch and cascading monthly calculations.
type MonthlyCalcService struct {
	evalService      monthlyEvalServiceForCalc
	monthlyValueRepo monthlyValueRepoForCalc
}

// NewMonthlyCalcService creates a new MonthlyCalcService instance.
func NewMonthlyCalcService(
	evalService monthlyEvalServiceForCalc,
	monthlyValueRepo monthlyValueRepoForCalc,
) *MonthlyCalcService {
	return &MonthlyCalcService{
		evalService:      evalService,
		monthlyValueRepo: monthlyValueRepo,
	}
}
```

### Verification
```bash
cd apps/api && go build ./...
```

---

## Phase 2: Implement CalculateMonth

### Step 2.1: CalculateMonth Method

Calculates a single month and returns the resulting MonthlyValue. This method triggers recalculation via MonthlyEvalService and then retrieves the result.

```go
// CalculateMonth calculates monthly values for a single employee and month.
// Returns the calculated MonthlyValue or an error.
// Returns ErrMonthClosed if the month is closed (via MonthlyEvalService).
// Returns ErrFutureMonth if attempting to calculate a month after the current month.
func (s *MonthlyCalcService) CalculateMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error) {
	// Validate not future month
	now := time.Now()
	if year > now.Year() || (year == now.Year() && month > int(now.Month())) {
		return nil, ErrFutureMonth
	}

	// Delegate to eval service for actual calculation
	err := s.evalService.RecalculateMonth(ctx, employeeID, year, month)
	if err != nil {
		return nil, err
	}

	// Retrieve the calculated value
	mv, err := s.monthlyValueRepo.GetByEmployeeMonth(ctx, employeeID, year, month)
	if err != nil {
		return nil, err
	}

	return mv, nil
}
```

### Verification
```bash
cd apps/api && go build ./...
```

---

## Phase 3: Implement CalculateMonthBatch

### Step 3.1: CalculateMonthBatch Method

Calculates the same month for multiple employees, continuing on individual failures.

```go
// CalculateMonthBatch calculates monthly values for multiple employees for the same month.
// Continues processing on individual errors and aggregates results.
func (s *MonthlyCalcService) CalculateMonthBatch(ctx context.Context, employeeIDs []uuid.UUID, year, month int) *MonthlyCalcResult {
	result := &MonthlyCalcResult{
		Errors: make([]MonthlyCalcError, 0),
	}

	// Validate not future month
	now := time.Now()
	if year > now.Year() || (year == now.Year() && month > int(now.Month())) {
		// All employees fail with same error
		for _, empID := range employeeIDs {
			result.FailedMonths++
			result.Errors = append(result.Errors, MonthlyCalcError{
				EmployeeID: empID,
				Year:       year,
				Month:      month,
				Error:      ErrFutureMonth.Error(),
			})
		}
		return result
	}

	for _, empID := range employeeIDs {
		err := s.evalService.RecalculateMonth(ctx, empID, year, month)
		if err != nil {
			if errors.Is(err, ErrMonthClosed) {
				result.SkippedMonths++
			} else {
				result.FailedMonths++
				result.Errors = append(result.Errors, MonthlyCalcError{
					EmployeeID: empID,
					Year:       year,
					Month:      month,
					Error:      err.Error(),
				})
			}
			continue
		}
		result.ProcessedMonths++
	}

	return result
}
```

### Verification
```bash
cd apps/api && go build ./...
```

---

## Phase 4: Implement RecalculateFromMonth

### Step 4.1: RecalculateFromMonth Method

Recalculates from a starting month through the current month, maintaining the flextime carryover chain.

```go
// RecalculateFromMonth recalculates monthly values starting from a given month
// through the current month. This is used when a change in an earlier month
// affects the flextime carryover chain for subsequent months.
//
// Behavior:
// - Skips closed months silently (continues with next month)
// - Stops at the current month (does not calculate future months)
// - Properly handles year boundaries (December -> January)
// - Returns aggregated results for all processed months
func (s *MonthlyCalcService) RecalculateFromMonth(ctx context.Context, employeeID uuid.UUID, startYear, startMonth int) *MonthlyCalcResult {
	result := &MonthlyCalcResult{
		Errors: make([]MonthlyCalcError, 0),
	}

	currentYear, currentMonth := startYear, startMonth
	now := time.Now()

	for {
		// Stop if we've passed the current month
		if currentYear > now.Year() || (currentYear == now.Year() && currentMonth > int(now.Month())) {
			break
		}

		// Attempt recalculation
		err := s.evalService.RecalculateMonth(ctx, employeeID, currentYear, currentMonth)
		if err != nil {
			if errors.Is(err, ErrMonthClosed) {
				// Skip closed months and continue cascade
				result.SkippedMonths++
			} else {
				result.FailedMonths++
				result.Errors = append(result.Errors, MonthlyCalcError{
					EmployeeID: employeeID,
					Year:       currentYear,
					Month:      currentMonth,
					Error:      err.Error(),
				})
				// Continue cascade even on failure to process remaining months
			}
		} else {
			result.ProcessedMonths++
		}

		// Move to next month
		currentMonth++
		if currentMonth > 12 {
			currentMonth = 1
			currentYear++
		}
	}

	return result
}
```

### Verification
```bash
cd apps/api && go build ./...
```

---

## Phase 5: Implement RecalculateFromMonthBatch

### Step 5.1: RecalculateFromMonthBatch Method

Batch version of RecalculateFromMonth for multiple employees.

```go
// RecalculateFromMonthBatch recalculates from a starting month for multiple employees.
// Aggregates results from all employees.
func (s *MonthlyCalcService) RecalculateFromMonthBatch(ctx context.Context, employeeIDs []uuid.UUID, startYear, startMonth int) *MonthlyCalcResult {
	result := &MonthlyCalcResult{
		Errors: make([]MonthlyCalcError, 0),
	}

	for _, empID := range employeeIDs {
		empResult := s.RecalculateFromMonth(ctx, empID, startYear, startMonth)
		result.ProcessedMonths += empResult.ProcessedMonths
		result.SkippedMonths += empResult.SkippedMonths
		result.FailedMonths += empResult.FailedMonths
		result.Errors = append(result.Errors, empResult.Errors...)
	}

	return result
}
```

### Verification
```bash
cd apps/api && go build ./...
```

---

## Phase 6: Write Unit Tests

**File**: `apps/api/internal/service/monthlycalc_test.go`

### Step 6.1: Mock Definitions and Test Helper

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
)

// --- Mock implementations ---

type mockMonthlyEvalServiceForCalc struct {
	mock.Mock
}

func (m *mockMonthlyEvalServiceForCalc) RecalculateMonth(ctx context.Context, employeeID uuid.UUID, year, month int) error {
	args := m.Called(ctx, employeeID, year, month)
	return args.Error(0)
}

func (m *mockMonthlyEvalServiceForCalc) GetMonthSummary(ctx context.Context, employeeID uuid.UUID, year, month int) (*MonthSummary, error) {
	args := m.Called(ctx, employeeID, year, month)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*MonthSummary), args.Error(1)
}

type mockMonthlyValueRepoForCalc struct {
	mock.Mock
}

func (m *mockMonthlyValueRepoForCalc) GetByEmployeeMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error) {
	args := m.Called(ctx, employeeID, year, month)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.MonthlyValue), args.Error(1)
}

// --- Test helper ---

func newTestMonthlyCalcService() (
	*MonthlyCalcService,
	*mockMonthlyEvalServiceForCalc,
	*mockMonthlyValueRepoForCalc,
) {
	evalService := new(mockMonthlyEvalServiceForCalc)
	monthlyValueRepo := new(mockMonthlyValueRepoForCalc)

	svc := NewMonthlyCalcService(evalService, monthlyValueRepo)
	return svc, evalService, monthlyValueRepo
}
```

### Step 6.2: CalculateMonth Tests

```go
func TestMonthlyCalcService_CalculateMonth_Success(t *testing.T) {
	ctx := context.Background()
	svc, evalService, monthlyValueRepo := newTestMonthlyCalcService()

	employeeID := uuid.New()
	// Use a past month to avoid future month error
	year, month := 2025, 12

	evalService.On("RecalculateMonth", ctx, employeeID, year, month).Return(nil)

	expected := &model.MonthlyValue{
		EmployeeID:  employeeID,
		Year:        year,
		Month:       month,
		TotalNetTime: 9600,
		FlextimeEnd: 120,
	}
	monthlyValueRepo.On("GetByEmployeeMonth", ctx, employeeID, year, month).Return(expected, nil)

	result, err := svc.CalculateMonth(ctx, employeeID, year, month)

	require.NoError(t, err)
	assert.Equal(t, employeeID, result.EmployeeID)
	assert.Equal(t, 9600, result.TotalNetTime)
	assert.Equal(t, 120, result.FlextimeEnd)
	evalService.AssertExpectations(t)
	monthlyValueRepo.AssertExpectations(t)
}

func TestMonthlyCalcService_CalculateMonth_FutureMonth(t *testing.T) {
	ctx := context.Background()
	svc, _, _ := newTestMonthlyCalcService()

	employeeID := uuid.New()
	// Use a future month
	futureYear := time.Now().Year() + 1

	_, err := svc.CalculateMonth(ctx, employeeID, futureYear, 1)

	assert.ErrorIs(t, err, ErrFutureMonth)
}

func TestMonthlyCalcService_CalculateMonth_MonthClosed(t *testing.T) {
	ctx := context.Background()
	svc, evalService, _ := newTestMonthlyCalcService()

	employeeID := uuid.New()
	year, month := 2025, 11

	evalService.On("RecalculateMonth", ctx, employeeID, year, month).Return(ErrMonthClosed)

	_, err := svc.CalculateMonth(ctx, employeeID, year, month)

	assert.ErrorIs(t, err, ErrMonthClosed)
}

func TestMonthlyCalcService_CalculateMonth_CurrentMonth(t *testing.T) {
	ctx := context.Background()
	svc, evalService, monthlyValueRepo := newTestMonthlyCalcService()

	employeeID := uuid.New()
	now := time.Now()
	year, month := now.Year(), int(now.Month())

	evalService.On("RecalculateMonth", ctx, employeeID, year, month).Return(nil)

	expected := &model.MonthlyValue{
		EmployeeID: employeeID,
		Year:       year,
		Month:      month,
	}
	monthlyValueRepo.On("GetByEmployeeMonth", ctx, employeeID, year, month).Return(expected, nil)

	result, err := svc.CalculateMonth(ctx, employeeID, year, month)

	require.NoError(t, err)
	assert.Equal(t, year, result.Year)
	assert.Equal(t, month, result.Month)
}
```

### Step 6.3: CalculateMonthBatch Tests

```go
func TestMonthlyCalcService_CalculateMonthBatch_Success(t *testing.T) {
	ctx := context.Background()
	svc, evalService, _ := newTestMonthlyCalcService()

	emp1 := uuid.New()
	emp2 := uuid.New()
	emp3 := uuid.New()
	year, month := 2025, 11

	evalService.On("RecalculateMonth", ctx, emp1, year, month).Return(nil)
	evalService.On("RecalculateMonth", ctx, emp2, year, month).Return(nil)
	evalService.On("RecalculateMonth", ctx, emp3, year, month).Return(nil)

	result := svc.CalculateMonthBatch(ctx, []uuid.UUID{emp1, emp2, emp3}, year, month)

	assert.Equal(t, 3, result.ProcessedMonths)
	assert.Equal(t, 0, result.FailedMonths)
	assert.Equal(t, 0, result.SkippedMonths)
	assert.Empty(t, result.Errors)
	evalService.AssertExpectations(t)
}

func TestMonthlyCalcService_CalculateMonthBatch_WithFailures(t *testing.T) {
	ctx := context.Background()
	svc, evalService, _ := newTestMonthlyCalcService()

	emp1 := uuid.New()
	emp2 := uuid.New()
	emp3 := uuid.New()
	year, month := 2025, 11

	evalService.On("RecalculateMonth", ctx, emp1, year, month).Return(nil)
	evalService.On("RecalculateMonth", ctx, emp2, year, month).Return(errors.New("employee not found"))
	evalService.On("RecalculateMonth", ctx, emp3, year, month).Return(nil)

	result := svc.CalculateMonthBatch(ctx, []uuid.UUID{emp1, emp2, emp3}, year, month)

	assert.Equal(t, 2, result.ProcessedMonths)
	assert.Equal(t, 1, result.FailedMonths)
	assert.Equal(t, 0, result.SkippedMonths)
	assert.Len(t, result.Errors, 1)
	assert.Equal(t, emp2, result.Errors[0].EmployeeID)
}

func TestMonthlyCalcService_CalculateMonthBatch_WithClosedMonths(t *testing.T) {
	ctx := context.Background()
	svc, evalService, _ := newTestMonthlyCalcService()

	emp1 := uuid.New()
	emp2 := uuid.New()
	year, month := 2025, 11

	evalService.On("RecalculateMonth", ctx, emp1, year, month).Return(nil)
	evalService.On("RecalculateMonth", ctx, emp2, year, month).Return(ErrMonthClosed)

	result := svc.CalculateMonthBatch(ctx, []uuid.UUID{emp1, emp2}, year, month)

	assert.Equal(t, 1, result.ProcessedMonths)
	assert.Equal(t, 0, result.FailedMonths)
	assert.Equal(t, 1, result.SkippedMonths)
	assert.Empty(t, result.Errors)
}

func TestMonthlyCalcService_CalculateMonthBatch_FutureMonth(t *testing.T) {
	ctx := context.Background()
	svc, _, _ := newTestMonthlyCalcService()

	emp1 := uuid.New()
	emp2 := uuid.New()
	futureYear := time.Now().Year() + 1

	result := svc.CalculateMonthBatch(ctx, []uuid.UUID{emp1, emp2}, futureYear, 1)

	assert.Equal(t, 0, result.ProcessedMonths)
	assert.Equal(t, 2, result.FailedMonths)
	assert.Len(t, result.Errors, 2)
}
```

### Step 6.4: RecalculateFromMonth Tests

```go
func TestMonthlyCalcService_RecalculateFromMonth_Success(t *testing.T) {
	ctx := context.Background()
	svc, evalService, _ := newTestMonthlyCalcService()

	employeeID := uuid.New()
	// Start from November 2025, should process through current month
	now := time.Now()

	// Calculate expected months to process
	startYear, startMonth := 2025, 11
	expectedMonths := 0
	y, m := startYear, startMonth
	for {
		if y > now.Year() || (y == now.Year() && m > int(now.Month())) {
			break
		}
		evalService.On("RecalculateMonth", ctx, employeeID, y, m).Return(nil)
		expectedMonths++
		m++
		if m > 12 {
			m = 1
			y++
		}
	}

	result := svc.RecalculateFromMonth(ctx, employeeID, startYear, startMonth)

	assert.Equal(t, expectedMonths, result.ProcessedMonths)
	assert.Equal(t, 0, result.FailedMonths)
	assert.Equal(t, 0, result.SkippedMonths)
	evalService.AssertExpectations(t)
}

func TestMonthlyCalcService_RecalculateFromMonth_SkipsClosedMonths(t *testing.T) {
	ctx := context.Background()
	svc, evalService, _ := newTestMonthlyCalcService()

	employeeID := uuid.New()
	// Start from Oct 2025
	startYear, startMonth := 2025, 10

	// Oct succeeds, Nov is closed, Dec succeeds
	evalService.On("RecalculateMonth", ctx, employeeID, 2025, 10).Return(nil)
	evalService.On("RecalculateMonth", ctx, employeeID, 2025, 11).Return(ErrMonthClosed)
	evalService.On("RecalculateMonth", ctx, employeeID, 2025, 12).Return(nil)
	// Continue for remaining months up to current
	now := time.Now()
	y, m := 2026, 1
	for {
		if y > now.Year() || (y == now.Year() && m > int(now.Month())) {
			break
		}
		evalService.On("RecalculateMonth", ctx, employeeID, y, m).Return(nil)
		m++
		if m > 12 {
			m = 1
			y++
		}
	}

	result := svc.RecalculateFromMonth(ctx, employeeID, startYear, startMonth)

	assert.Equal(t, 1, result.SkippedMonths) // November skipped
	assert.True(t, result.ProcessedMonths >= 2) // At least Oct and Dec
	assert.Equal(t, 0, result.FailedMonths)
	assert.Empty(t, result.Errors)
}

func TestMonthlyCalcService_RecalculateFromMonth_ContinuesOnError(t *testing.T) {
	ctx := context.Background()
	svc, evalService, _ := newTestMonthlyCalcService()

	employeeID := uuid.New()
	startYear, startMonth := 2025, 10

	// Oct fails, Nov succeeds, Dec succeeds
	evalService.On("RecalculateMonth", ctx, employeeID, 2025, 10).Return(errors.New("db error"))
	evalService.On("RecalculateMonth", ctx, employeeID, 2025, 11).Return(nil)
	evalService.On("RecalculateMonth", ctx, employeeID, 2025, 12).Return(nil)
	// Continue for remaining months
	now := time.Now()
	y, m := 2026, 1
	for {
		if y > now.Year() || (y == now.Year() && m > int(now.Month())) {
			break
		}
		evalService.On("RecalculateMonth", ctx, employeeID, y, m).Return(nil)
		m++
		if m > 12 {
			m = 1
			y++
		}
	}

	result := svc.RecalculateFromMonth(ctx, employeeID, startYear, startMonth)

	assert.Equal(t, 1, result.FailedMonths) // October failed
	assert.True(t, result.ProcessedMonths >= 2) // Nov and Dec succeeded
	assert.Len(t, result.Errors, 1)
	assert.Equal(t, 2025, result.Errors[0].Year)
	assert.Equal(t, 10, result.Errors[0].Month)
}

func TestMonthlyCalcService_RecalculateFromMonth_YearBoundary(t *testing.T) {
	ctx := context.Background()
	svc, evalService, _ := newTestMonthlyCalcService()

	employeeID := uuid.New()
	// Start from December 2025
	startYear, startMonth := 2025, 12

	evalService.On("RecalculateMonth", ctx, employeeID, 2025, 12).Return(nil)
	// Continue into 2026
	now := time.Now()
	y, m := 2026, 1
	for {
		if y > now.Year() || (y == now.Year() && m > int(now.Month())) {
			break
		}
		evalService.On("RecalculateMonth", ctx, employeeID, y, m).Return(nil)
		m++
		if m > 12 {
			m = 1
			y++
		}
	}

	result := svc.RecalculateFromMonth(ctx, employeeID, startYear, startMonth)

	assert.True(t, result.ProcessedMonths >= 2) // At least Dec 2025 and Jan 2026
	assert.Equal(t, 0, result.FailedMonths)
	evalService.AssertExpectations(t)
}

func TestMonthlyCalcService_RecalculateFromMonth_CurrentMonth(t *testing.T) {
	ctx := context.Background()
	svc, evalService, _ := newTestMonthlyCalcService()

	employeeID := uuid.New()
	now := time.Now()
	year, month := now.Year(), int(now.Month())

	evalService.On("RecalculateMonth", ctx, employeeID, year, month).Return(nil)

	result := svc.RecalculateFromMonth(ctx, employeeID, year, month)

	assert.Equal(t, 1, result.ProcessedMonths)
	assert.Equal(t, 0, result.FailedMonths)
}

func TestMonthlyCalcService_RecalculateFromMonth_FutureMonth(t *testing.T) {
	ctx := context.Background()
	svc, _, _ := newTestMonthlyCalcService()

	employeeID := uuid.New()
	futureYear := time.Now().Year() + 1

	result := svc.RecalculateFromMonth(ctx, employeeID, futureYear, 1)

	// Should process nothing since starting from future
	assert.Equal(t, 0, result.ProcessedMonths)
	assert.Equal(t, 0, result.FailedMonths)
	assert.Empty(t, result.Errors)
}
```

### Step 6.5: RecalculateFromMonthBatch Tests

```go
func TestMonthlyCalcService_RecalculateFromMonthBatch_Success(t *testing.T) {
	ctx := context.Background()
	svc, evalService, _ := newTestMonthlyCalcService()

	emp1 := uuid.New()
	emp2 := uuid.New()
	now := time.Now()
	year, month := now.Year(), int(now.Month())

	evalService.On("RecalculateMonth", ctx, emp1, year, month).Return(nil)
	evalService.On("RecalculateMonth", ctx, emp2, year, month).Return(nil)

	result := svc.RecalculateFromMonthBatch(ctx, []uuid.UUID{emp1, emp2}, year, month)

	assert.Equal(t, 2, result.ProcessedMonths)
	assert.Equal(t, 0, result.FailedMonths)
}

func TestMonthlyCalcService_RecalculateFromMonthBatch_MixedResults(t *testing.T) {
	ctx := context.Background()
	svc, evalService, _ := newTestMonthlyCalcService()

	emp1 := uuid.New()
	emp2 := uuid.New()
	now := time.Now()
	year, month := now.Year(), int(now.Month())

	evalService.On("RecalculateMonth", ctx, emp1, year, month).Return(nil)
	evalService.On("RecalculateMonth", ctx, emp2, year, month).Return(ErrMonthClosed)

	result := svc.RecalculateFromMonthBatch(ctx, []uuid.UUID{emp1, emp2}, year, month)

	assert.Equal(t, 1, result.ProcessedMonths)
	assert.Equal(t, 1, result.SkippedMonths)
	assert.Equal(t, 0, result.FailedMonths)
}
```

### Verification
```bash
cd apps/api && go test -v -run TestMonthlyCalcService ./internal/service/...
```

---

## Phase 7: Wire into main.go

**File**: `apps/api/cmd/server/main.go`

### Step 7.1: Add MonthlyCalcService Initialization

After the MonthlyEvalService initialization, add:

```go
// Initialize MonthlyCalcService
monthlyCalcService := service.NewMonthlyCalcService(monthlyEvalService, monthlyValueRepo)
_ = monthlyCalcService // TODO: Wire to handlers (separate ticket for monthly endpoints)
```

**Note**: `monthlyEvalService` and `monthlyValueRepo` should already be initialized earlier in main.go from NOK-151.

### Verification
```bash
cd apps/api && go build ./cmd/server/
```

---

## Phase 8: Final Verification

```bash
cd apps/api && go build ./...
cd apps/api && go test -v -run TestMonthlyCalcService ./internal/service/...
cd apps/api && go vet ./...
make test
```

---

## Implementation Notes

### Pattern Alignment

The MonthlyCalcService follows the same patterns as RecalcService:
1. **Result struct** with processed/failed/skipped counts and error list
2. **Continue on errors** - batch and cascade operations don't stop on individual failures
3. **Private interfaces** for dependency injection
4. **Constructor** returns `*MonthlyCalcService` with all deps injected

### Flextime Carryover Chain

The cascading recalculation is critical for maintaining the flextime carryover chain:
- Changing a past month's value affects all subsequent months' `FlextimeStart`
- `RecalculateFromMonth` ensures the chain is properly recalculated
- MonthlyEvalService's `RecalculateMonth` already handles fetching previous month's `FlextimeEnd`

### Closed Month Handling

Design decision: Skip closed months silently during cascade.
- Rationale: Closed months represent finalized payroll periods
- Skipping allows the cascade to continue and update subsequent open months
- The `SkippedMonths` counter in results indicates how many were skipped

### Future Month Prevention

Both `CalculateMonth` and `CalculateMonthBatch` validate against future months:
- Returns `ErrFutureMonth` for single-month calculation
- All employees fail with same error in batch mode
- Cascade simply stops when reaching future months

### Service Composition

MonthlyCalcService wraps MonthlyEvalService rather than duplicating logic:
- `CalculateMonth` delegates to `RecalculateMonth` for actual calculation
- Then retrieves the result via repository for return value
- This keeps calculation logic centralized in MonthlyEvalService

---

## Success Criteria

- [x] `apps/api/internal/service/monthlycalc.go` compiles with all 4 methods implemented
- [x] `apps/api/internal/service/monthlycalc_test.go` has comprehensive unit tests
- [x] CalculateMonth returns `*model.MonthlyValue` after successful calculation
- [x] CalculateMonth returns `ErrFutureMonth` for future months
- [x] CalculateMonth returns `ErrMonthClosed` for closed months
- [x] CalculateMonthBatch processes multiple employees, continues on errors
- [x] CalculateMonthBatch tracks processed/failed/skipped counts
- [x] RecalculateFromMonth cascades from start month to current month
- [x] RecalculateFromMonth handles year boundaries correctly
- [x] RecalculateFromMonth skips closed months and continues
- [x] RecalculateFromMonth continues on errors
- [x] RecalculateFromMonthBatch aggregates results from multiple employees
- [x] All tests pass: `go test -v -run TestMonthlyCalcService ./internal/service/...`
- [x] Service wired in `main.go`
- [x] `go build ./...` succeeds
- [x] `go vet ./...` passes
- [x] `make test` passes

## Implementation Complete

**Date**: 2026-01-25
**Status**: COMPLETED

All phases implemented and verified:
1. Service file with structure, types, and constructor
2. CalculateMonth method
3. CalculateMonthBatch method
4. RecalculateFromMonth method
5. RecalculateFromMonthBatch method
6. Unit tests (16 test cases, all passing)
7. Wired into main.go
8. Final verification passed
