# Wire Tariff Evaluation Rules into Monthly Calculation

## Overview

The monthly evaluation service (`monthlyeval.go`) passes `EvaluationRules: nil` when calling `calculation.CalculateMonth()`, meaning flextime is always transferred 1:1 without any caps, thresholds, or credit type logic. The tariff model already has all ZMI flextime fields, and the calculation layer already implements all 4 credit types. This plan wires them together.

## Current State Analysis

**What exists:**
- `model.Tariff` has fields: `CreditType`, `MaxFlextimePerMonth`, `UpperLimitAnnual`, `LowerLimitAnnual`, `FlextimeThreshold` (`model/tariff.go:127-148`)
- `model.Employee` has `TariffID *uuid.UUID` with GORM relation to `Tariff` (`model/employee.go:25,38`)
- `calculation.CalculateMonth()` accepts `*MonthlyEvaluationInput` and applies all 4 credit types (`calculation/monthly.go:89-133`)
- `calculation.applyCreditType()` fully implements: no_evaluation, complete_carryover, after_threshold, no_carryover (`calculation/monthly.go:136-219`)
- `MonthlyEvalService.RecalculateMonth()` fetches the employee already (`monthlyeval.go:187`) but never fetches the tariff

**The gap (line 274):**
```go
EvaluationRules: nil, // No evaluation rules until tariff ZMI fields available
```

**CreditType string mismatch:**
- Model: `"complete"` (`model/tariff.go:35`)
- Calculation: `"complete_carryover"` (`calculation/monthly.go:12`)
- ZMI manual says "Gleitzeitübertrag komplett" = complete carryover. The calculation layer is correct.

### Key Discoveries:
- `MonthlyEvalService` has no tariff repo injected (`monthlyeval.go:91-96`)
- `RecalculateMonth` already fetches employee at line 187 — `employee.TariffID` is available
- `TariffRepository.GetByID()` exists at `repository/tariff.go:35`
- Tests use mock interfaces, so adding a new mock is straightforward (pattern in `monthlyeval_test.go:87-97`)
- Constructor wired in `cmd/server/main.go:123`

## Desired End State

When `RecalculateMonth` runs:
1. It fetches the employee's tariff via `employee.TariffID`
2. Extracts the ZMI flextime fields into `calculation.MonthlyEvaluationInput`
3. Passes them to `CalculateMonth`, which applies the correct credit type rules
4. Monthly values reflect capped/threshold/no-carryover behavior as configured in the tariff

**Verification:** Existing tests continue to pass (employees without tariffs get `nil` rules = no evaluation, same as before). New tests verify that tariff rules are applied.

## What We're NOT Doing

- Not changing the calculation logic itself (already correct and tested)
- Not adding UI for tariff evaluation fields (already exists in tariff management page)
- Not adding OpenAPI spec changes (no new endpoints)
- Not touching the daily calculation pipeline

## Implementation Approach

Minimal wiring change: add tariff repo to `MonthlyEvalService`, fetch tariff in `RecalculateMonth`, build `MonthlyEvaluationInput`, fix the CreditType mismatch.

## Phase 1: Fix CreditType String Mismatch

### Overview
Align the model layer's CreditType value to match the calculation layer and ZMI manual.

### Changes Required:

#### 1. Update model CreditType constant
**File**: `apps/api/internal/model/tariff.go`
**Changes**: Change `CreditTypeComplete` value from `"complete"` to `"complete_carryover"`

```go
// Before:
CreditTypeComplete CreditType = "complete"

// After:
CreditTypeComplete CreditType = "complete_carryover"
```

#### 2. Add database migration
**Migration**: `db/migrations/NNNNNN_fix_credit_type_complete_value.up.sql`
**Changes**: Update any existing tariff rows that have `credit_type = 'complete'` to `'complete_carryover'`

```sql
UPDATE tariffs SET credit_type = 'complete_carryover' WHERE credit_type = 'complete';
```

Down migration:
```sql
UPDATE tariffs SET credit_type = 'complete' WHERE credit_type = 'complete_carryover';
```

### Success Criteria:

#### Automated Verification:
- [x] Migration applies cleanly: `make migrate-up`
- [x] Tests pass: `cd apps/api && go test ./internal/model/... ./internal/calculation/...`
- [x] No compile errors

---

## Phase 2: Wire Tariff Repo into MonthlyEvalService

### Overview
Add tariff repository dependency and fetch tariff during recalculation.

### Changes Required:

#### 1. Add tariff repo interface to MonthlyEvalService
**File**: `apps/api/internal/service/monthlyeval.go`
**Changes**:

Add interface (after line 48):
```go
// tariffRepoForMonthlyEval defines the interface for tariff data access.
type tariffRepoForMonthlyEval interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.Tariff, error)
}
```

Add field to struct (line 95):
```go
type MonthlyEvalService struct {
	monthlyValueRepo monthlyValueRepoForMonthlyEval
	dailyValueRepo   dailyValueRepoForMonthlyEval
	absenceDayRepo   absenceDayRepoForMonthlyEval
	employeeRepo     employeeRepoForMonthlyEval
	tariffRepo       tariffRepoForMonthlyEval
}
```

Update constructor (line 99):
```go
func NewMonthlyEvalService(
	monthlyValueRepo monthlyValueRepoForMonthlyEval,
	dailyValueRepo dailyValueRepoForMonthlyEval,
	absenceDayRepo absenceDayRepoForMonthlyEval,
	employeeRepo employeeRepoForMonthlyEval,
	tariffRepo tariffRepoForMonthlyEval,
) *MonthlyEvalService {
	return &MonthlyEvalService{
		monthlyValueRepo: monthlyValueRepo,
		dailyValueRepo:   dailyValueRepo,
		absenceDayRepo:   absenceDayRepo,
		employeeRepo:     employeeRepo,
		tariffRepo:       tariffRepo,
	}
}
```

#### 2. Fetch tariff and build evaluation rules in RecalculateMonth
**File**: `apps/api/internal/service/monthlyeval.go`
**Changes**: After fetching the employee (line 187), fetch the tariff and pass to buildMonthlyCalcInput.

In `RecalculateMonth`, after employee fetch:
```go
// Fetch employee's tariff for evaluation rules
var tariff *model.Tariff
if employee.TariffID != nil {
	tariff, err = s.tariffRepo.GetByID(ctx, *employee.TariffID)
	if err != nil {
		// Log warning but don't fail — tariff might have been deleted
		tariff = nil
	}
}
```

Update `buildMonthlyCalcInput` call to pass tariff:
```go
calcInput := s.buildMonthlyCalcInput(dailyValues, absences, previousCarryover, tariff)
```

#### 3. Update buildMonthlyCalcInput to accept tariff and build rules
**File**: `apps/api/internal/service/monthlyeval.go`
**Changes**: Update signature and build `MonthlyEvaluationInput` from tariff fields.

```go
func (s *MonthlyEvalService) buildMonthlyCalcInput(
	dailyValues []model.DailyValue,
	absences []model.AbsenceDay,
	previousCarryover int,
	tariff *model.Tariff,
) calculation.MonthlyCalcInput {
	// ... existing daily value conversion ...

	// Build evaluation rules from tariff
	var evaluationRules *calculation.MonthlyEvaluationInput
	if tariff != nil {
		evaluationRules = buildEvaluationRules(tariff)
	}

	return calculation.MonthlyCalcInput{
		DailyValues:       dvInputs,
		PreviousCarryover: previousCarryover,
		EvaluationRules:   evaluationRules,
		AbsenceSummary:    absenceSummary,
	}
}
```

Add helper function:
```go
// buildEvaluationRules converts tariff ZMI fields to calculation evaluation input.
// Returns nil if the tariff uses no_evaluation (default), since nil means direct 1:1 transfer.
func buildEvaluationRules(tariff *model.Tariff) *calculation.MonthlyEvaluationInput {
	creditType := tariff.GetCreditType()

	// no_evaluation = direct transfer, same as nil rules
	if creditType == model.CreditTypeNoEvaluation {
		return nil
	}

	return &calculation.MonthlyEvaluationInput{
		CreditType:          calculation.CreditType(creditType),
		FlextimeThreshold:   tariff.FlextimeThreshold,
		MaxFlextimePerMonth: tariff.MaxFlextimePerMonth,
		FlextimeCapPositive: tariff.UpperLimitAnnual,
		FlextimeCapNegative: tariff.LowerLimitAnnual,
	}
}
```

Note: `calculation.CreditType(creditType)` works because both are `string` typedefs with the same values after Phase 1's fix.

#### 4. Update constructor call in main.go
**File**: `apps/api/cmd/server/main.go`
**Changes**: Pass tariffRepo to MonthlyEvalService constructor.

```go
// Before:
monthlyEvalService := service.NewMonthlyEvalService(monthlyValueRepo, dailyValueRepo, absenceDayRepo, employeeRepo)

// After:
monthlyEvalService := service.NewMonthlyEvalService(monthlyValueRepo, dailyValueRepo, absenceDayRepo, employeeRepo, tariffRepo)
```

### Success Criteria:

#### Automated Verification:
- [x] Code compiles: `cd apps/api && go build ./...`
- [x] All existing tests pass: `make test`

---

## Phase 3: Update Tests

### Overview
Update existing test mocks and add new tests for tariff evaluation rules.

### Changes Required:

#### 1. Add mock tariff repo to test file
**File**: `apps/api/internal/service/monthlyeval_test.go`
**Changes**: Add mock and update test helper.

```go
type mockTariffRepoForMonthlyEval struct {
	mock.Mock
}

func (m *mockTariffRepoForMonthlyEval) GetByID(ctx context.Context, id uuid.UUID) (*model.Tariff, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.Tariff), args.Error(1)
}
```

Update `newTestMonthlyEvalService` to include tariff repo:
```go
func newTestMonthlyEvalService() (
	*MonthlyEvalService,
	*mockMonthlyValueRepoForMonthlyEval,
	*mockDailyValueRepoForMonthlyEval,
	*mockAbsenceDayRepoForMonthlyEval,
	*mockEmployeeRepoForMonthlyEval,
	*mockTariffRepoForMonthlyEval,
) {
	// ...
	tariffRepo := new(mockTariffRepoForMonthlyEval)
	svc := NewMonthlyEvalService(monthlyValueRepo, dailyValueRepo, absenceDayRepo, employeeRepo, tariffRepo)
	return svc, monthlyValueRepo, dailyValueRepo, absenceDayRepo, employeeRepo, tariffRepo
}
```

#### 2. Update all existing test functions
All existing tests that call `newTestMonthlyEvalService()` need to destructure the 6th return value. Tests that use `RecalculateMonth` with employees that have no `TariffID` should continue working without mock expectations on tariffRepo (since `employee.TariffID == nil` means no fetch).

#### 3. Add new test: RecalculateMonth with complete_carryover tariff
Test that when an employee has a tariff with `CreditType=complete_carryover` and `MaxFlextimePerMonth=120` (2 hours), overtime exceeding the cap is forfeited.

#### 4. Add new test: RecalculateMonth with after_threshold tariff
Test that when an employee has a tariff with `CreditType=after_threshold` and `FlextimeThreshold=60`, only overtime above the threshold is credited.

#### 5. Add new test: RecalculateMonth with no_carryover tariff
Test that flextime resets to 0.

#### 6. Add new test: RecalculateMonth with tariff not found (deleted)
Test that if `tariffRepo.GetByID` returns error, the service gracefully falls back to nil rules (no evaluation).

### Success Criteria:

#### Automated Verification:
- [x] All tests pass: `make test`
- [x] Test coverage includes all credit type paths

#### Manual Verification:
- [ ] Create a tariff with `credit_type=complete_carryover` and `max_flextime_per_month=120`
- [ ] Assign it to an employee
- [ ] Trigger month recalculation
- [ ] Verify flextime is capped at 120 minutes in the monthly value

## Testing Strategy

### Unit Tests:
- Existing tests: Employee without TariffID → nil rules → same behavior as before (backward compatible)
- New test: complete_carryover with monthly cap → verify FlextimeForfeited > 0
- New test: after_threshold → verify only excess above threshold credited
- New test: no_carryover → verify FlextimeEnd = 0
- New test: tariff fetch error → graceful fallback to nil rules

### Edge Cases:
- Employee with TariffID but tariff has `credit_type = 'no_evaluation'` → buildEvaluationRules returns nil → same as no tariff
- Employee with TariffID pointing to deleted tariff → GetByID returns error → nil rules fallback
- Tariff with nil optional fields (e.g., no monthly cap set) → passed as nil to calculation, which handles nil correctly

## References

- ZMI Manual Section 12.3: Credit Types (Art der Gutschrift) — `thoughts/shared/reference/zmi-calculation-manual-reference.md:1294-1312`
- Monthly calculation logic: `apps/api/internal/calculation/monthly.go:89-250`
- Monthly eval service: `apps/api/internal/service/monthlyeval.go:179-245`
- Tariff model ZMI fields: `apps/api/internal/model/tariff.go:127-148`
- Constructor wiring: `apps/api/cmd/server/main.go:123`
