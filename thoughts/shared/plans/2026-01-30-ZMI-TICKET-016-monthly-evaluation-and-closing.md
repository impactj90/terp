# ZMI-TICKET-016: Monthly Evaluation, Closing, and Flextime Carryover - Implementation Plan

## Overview

Deliver full ZMI monthly evaluation logic including monthly aggregation of daily values, credit type evaluation (no evaluation, complete carryover, after threshold, no carryover), cap application (monthly cap, positive/negative balance caps, annual floor), month closing/reopening with audit trail, and flextime carryover chain. The feature is exposed via RESTful API endpoints and documented in the OpenAPI spec.

## Current State Analysis

The research phase (`thoughts/shared/research/2026-01-30-ZMI-TICKET-016-monthly-evaluation-and-closing.md`) reveals that the core implementation is **already in place** across all layers. Specifically:

### What Already Exists

| Layer | File | Status |
|---|---|---|
| Database migration | `db/migrations/000028_create_monthly_values.up.sql` | Complete |
| Domain model | `apps/api/internal/model/monthlyvalue.go` | Complete |
| Tariff config | `apps/api/internal/model/tariff.go` (flextime fields + CreditType) | Complete |
| Calculation engine | `apps/api/internal/calculation/monthly.go` | Complete |
| Calculation tests | `apps/api/internal/calculation/monthly_test.go` (806 lines, 10 groups) | Complete |
| Service (eval) | `apps/api/internal/service/monthlyeval.go` (459 lines) | Complete |
| Service (calc) | `apps/api/internal/service/monthlycalc.go` (204 lines) | Complete |
| Service tests (eval) | `apps/api/internal/service/monthlyeval_test.go` (781 lines) | Complete |
| Service tests (calc) | `apps/api/internal/service/monthlycalc_test.go` (429 lines) | Complete |
| Repository | `apps/api/internal/repository/monthlyvalue.go` (200 lines) | Complete |
| Handler | `apps/api/internal/handler/monthlyeval.go` (509 lines) | Has bug |
| Route registration | `apps/api/internal/handler/routes.go` (lines 552-581) | Complete |
| DI wiring | `apps/api/cmd/server/main.go` (lines 181-187, 348) | Complete |
| OpenAPI paths | `api/paths/monthly-values.yaml` | Exists but misaligned |
| OpenAPI schemas | `api/schemas/monthly-values.yaml` | Exists but misaligned |
| OpenAPI eval templates | `api/paths/monthly-evaluations.yaml`, `api/schemas/monthly-evaluations.yaml` | Complete |
| Warning codes | `apps/api/internal/calculation/errors.go` (lines 42-45) | Complete |

### Key Discoveries

1. **Handler bug** (`apps/api/internal/handler/monthlyeval.go` lines 51-122): The `GetMonthSummary` method calls `ensureEmployeeScope()` six times redundantly. Only one call is necessary.

2. **OpenAPI spec vs implementation gap**: The OpenAPI schema (`api/schemas/monthly-values.yaml`) defines fields that do not match the Go model:
   - `status` enum (open/calculated/closed/exported) vs boolean `is_closed` in model
   - `target_minutes` vs `total_target_time` naming
   - `working_days` vs `work_days` naming
   - `account_balances` JSON object not in Go model
   - `calculated_at` timestamp not in Go model
   - `holiday_days` count not in Go model
   - Missing flextime fields (`flextime_start`, `flextime_change`, `flextime_end`, `flextime_carryover`)
   - Missing absence detail fields (`vacation_taken`, `sick_days`, `other_absence_days`)

3. **No generated models**: The handler uses `map[string]interface{}` for responses (via `summaryToResponse()`) rather than generated OpenAPI models from `gen/models/`.

4. **Dual route pattern**: OpenAPI spec defines `/monthly-values/...` endpoints but Go handler implements `/employees/{id}/months/...` employee-nested routes. The Go routes are the correct pattern; the OpenAPI paths file should document the employee-nested routes.

5. **Flextime carryover chain is correct**: `RecalculateMonth` -> `prevMonth.FlextimeEnd` -> `PreviousCarryover` -> `FlextimeStart` -> calculation -> `FlextimeEnd` -> `FlextimeCarryover = FlextimeEnd` -> next month reads this.

6. **Close/Reopen state machine is correct**: Upsert deliberately excludes close/reopen fields from `DoUpdates`, preventing recalculation from overwriting close status.

## Desired End State

After this plan is complete:

1. The OpenAPI spec accurately documents the employee-nested monthly endpoints (`/employees/{id}/months/...`) with correct field names matching the Go model
2. Generated models exist in `gen/models/` for monthly value request/response types
3. The handler bug (6x duplicated `ensureEmployeeScope`) is fixed
4. All existing tests continue to pass
5. The handler uses generated models instead of `map[string]interface{}` for type safety
6. The OpenAPI bundled file is regenerated and up to date

### Verification:
- `make test` passes with zero failures
- `make swagger-bundle` completes without errors
- `make generate` produces updated models
- `make lint` passes
- Handler responds with correct JSON field names matching OpenAPI spec

## What We're NOT Doing

- **Not changing the core calculation logic** - `calculation/monthly.go` is complete and correct
- **Not changing the service layer logic** - `service/monthlyeval.go` and `service/monthlycalc.go` are complete
- **Not changing the repository layer** - `repository/monthlyvalue.go` is complete
- **Not changing the database migration** - `000028_create_monthly_values` is complete
- **Not changing route registration or DI wiring** - Already correct
- **Not adding new database tables** - The `monthly_values` table is sufficient
- **Not adding the `/monthly-values/...` flat route family** - The employee-nested routes are the correct pattern
- **Not modifying the MonthlyEvaluation template endpoints** - Those are a separate concern (configuration templates)
- **Not changing the Tariff model flextime fields** - Already correct

## Implementation Approach

Since the core implementation is already complete, this plan focuses on:
1. Fixing the handler bug
2. Aligning the OpenAPI spec with the actual implementation
3. Generating typed models from the aligned spec
4. Updating the handler to use generated models
5. Verification across all layers

---

## Phase 1: Fix Handler Bug

### Overview
Fix the duplicated `ensureEmployeeScope()` calls in `GetMonthSummary`.

### Changes Required

#### 1. Fix GetMonthSummary Handler
**File**: `apps/api/internal/handler/monthlyeval.go`
**Changes**: Remove the 5 redundant `ensureEmployeeScope()` calls (lines 63-122), keeping only the first call (lines 51-62).

The method should look like this after the fix:

```go
func (h *MonthlyEvalHandler) GetMonthSummary(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}
	_ = tenantID

	// Parse employee ID
	employeeIDStr := chi.URLParam(r, "id")
	employeeID, err := uuid.Parse(employeeIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}
	if err := h.ensureEmployeeScope(r.Context(), employeeID); err != nil {
		if errors.Is(err, service.ErrEmployeeNotFound) {
			respondError(w, http.StatusNotFound, "Employee not found")
			return
		}
		if errors.Is(err, errMonthlyEvalScopeDenied) {
			respondError(w, http.StatusForbidden, "Permission denied")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to verify access")
		return
	}

	// Parse year
	yearStr := chi.URLParam(r, "year")
	year, err := strconv.Atoi(yearStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid year")
		return
	}

	// Parse month
	monthStr := chi.URLParam(r, "month")
	month, err := strconv.Atoi(monthStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid month")
		return
	}

	summary, err := h.monthlyEvalService.GetMonthSummary(r.Context(), employeeID, year, month)
	if err != nil {
		h.handleServiceError(w, err, "get month summary")
		return
	}

	respondJSON(w, http.StatusOK, h.summaryToResponse(summary))
}
```

### Success Criteria

#### Automated Verification:
- [ ] Tests pass: `cd apps/api && go test ./internal/handler/... -count=1`
- [ ] Build succeeds: `cd apps/api && go build ./...`
- [ ] Lint passes: `cd apps/api && go vet ./internal/handler/...`

#### Manual Verification:
- [ ] Confirmed exactly one `ensureEmployeeScope()` call remains in `GetMonthSummary`
- [ ] All other handler methods unchanged

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 2: Align OpenAPI Spec with Implementation

### Overview
Update the OpenAPI schemas and paths files to accurately document the employee-nested monthly endpoints with field names matching the Go model. Add the employee-nested path endpoints to the spec since those are the routes the handler actually serves.

### Changes Required

#### 1. Update Monthly Values Schema
**File**: `api/schemas/monthly-values.yaml`
**Changes**: Rewrite `MonthlyValue` schema to match the Go model field names and include all flextime/absence fields. Replace field names to align with the handler's `summaryToResponse()` output.

The schema should define these fields to match the handler's JSON response:
- `employee_id` (uuid)
- `year` (integer)
- `month` (integer)
- `total_gross_time` (integer, minutes)
- `total_net_time` (integer, minutes)
- `total_target_time` (integer, minutes)
- `total_overtime` (integer, minutes)
- `total_undertime` (integer, minutes)
- `total_break_time` (integer, minutes)
- `flextime_start` (integer, minutes)
- `flextime_change` (integer, minutes)
- `flextime_end` (integer, minutes)
- `flextime_carryover` (integer, minutes)
- `vacation_taken` (number, decimal)
- `sick_days` (integer)
- `other_absence_days` (integer)
- `work_days` (integer)
- `days_with_errors` (integer)
- `is_closed` (boolean)
- `closed_at` (date-time, nullable)
- `closed_by` (uuid, nullable)
- `reopened_at` (date-time, nullable)
- `reopened_by` (uuid, nullable)
- `warnings` (array of strings)

Add `MonthSummaryResponse` as the response wrapper that the handler returns.

Add `YearOverviewResponse` for the year overview endpoint response:
- `year` (integer)
- `data` (array of MonthSummaryResponse)

Add `DailyBreakdownResponse` for the daily breakdown endpoint response:
- `data` (array of DailyValueSummary)

Keep existing `CloseMonthRequest` and `ReopenMonthRequest` schemas.
Keep existing `MonthlyValueList` schema.
Keep existing `MonthlyEvaluation` schema (for cumulative/running totals).

#### 2. Add Employee-Nested Monthly Paths
**File**: `api/paths/employee-monthly.yaml` (new file)
**Changes**: Define the employee-nested endpoints that the handler actually serves:

```yaml
# Employee Monthly Value endpoints
/employees/{id}/months/{year}:
  get:
    tags:
      - Monthly Values
    summary: Get year overview
    description: Returns all monthly summaries for an employee in a given year
    operationId: getYearOverview
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
        description: Employee ID
      - name: year
        in: path
        required: true
        type: integer
    responses:
      200:
        description: Year overview with monthly summaries
        schema:
          $ref: '../schemas/monthly-values.yaml#/YearOverviewResponse'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'

/employees/{id}/months/{year}/{month}:
  get:
    tags:
      - Monthly Values
    summary: Get month summary
    description: |
      Returns the monthly summary for an employee including time totals,
      flextime balance, absence summary, closing status, and warnings.
    operationId: getMonthSummary
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
      - name: year
        in: path
        required: true
        type: integer
      - name: month
        in: path
        required: true
        type: integer
        minimum: 1
        maximum: 12
    responses:
      200:
        description: Monthly summary
        schema:
          $ref: '../schemas/monthly-values.yaml#/MonthSummaryResponse'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'

/employees/{id}/months/{year}/{month}/days:
  get:
    tags:
      - Monthly Values
    summary: Get daily breakdown
    description: Returns the daily values for a specific month
    operationId: getDailyBreakdown
    # ...

/employees/{id}/months/{year}/{month}/close:
  post:
    tags:
      - Monthly Values
    summary: Close month
    description: |
      Closes the month, preventing further modifications and recalculations.
      Requires the month to have been calculated (monthly value exists).
    operationId: closeEmployeeMonth
    # ...

/employees/{id}/months/{year}/{month}/reopen:
  post:
    tags:
      - Monthly Values
    summary: Reopen month
    description: |
      Reopens a closed month, allowing modifications and recalculations.
      Creates an audit trail with reopened_at and reopened_by.
    operationId: reopenEmployeeMonth
    # ...

/employees/{id}/months/{year}/{month}/recalculate:
  post:
    tags:
      - Monthly Values
    summary: Recalculate month
    description: |
      Recalculates the monthly aggregation from daily values.
      Applies credit type rules from the employee's tariff configuration.
      Returns error if the month is closed.
    operationId: recalculateEmployeeMonth
    # ...
```

#### 3. Register New Paths in OpenAPI Main File
**File**: `api/openapi.yaml`
**Changes**: Add path references for the employee-nested monthly endpoints:

```yaml
  /employees/{id}/months/{year}:
    $ref: 'paths/employee-monthly.yaml#/~1employees~1{id}~1months~1{year}'
  /employees/{id}/months/{year}/{month}:
    $ref: 'paths/employee-monthly.yaml#/~1employees~1{id}~1months~1{year}~1{month}'
  /employees/{id}/months/{year}/{month}/days:
    $ref: 'paths/employee-monthly.yaml#/~1employees~1{id}~1months~1{year}~1{month}~1days'
  /employees/{id}/months/{year}/{month}/close:
    $ref: 'paths/employee-monthly.yaml#/~1employees~1{id}~1months~1{year}~1{month}~1close'
  /employees/{id}/months/{year}/{month}/reopen:
    $ref: 'paths/employee-monthly.yaml#/~1employees~1{id}~1months~1{year}~1{month}~1reopen'
  /employees/{id}/months/{year}/{month}/recalculate:
    $ref: 'paths/employee-monthly.yaml#/~1employees~1{id}~1months~1{year}~1{month}~1recalculate'
```

Also add schema definitions for any new schemas added:

```yaml
  MonthSummaryResponse:
    $ref: 'schemas/monthly-values.yaml#/MonthSummaryResponse'
  YearOverviewResponse:
    $ref: 'schemas/monthly-values.yaml#/YearOverviewResponse'
```

#### 4. Bundle the OpenAPI Spec
Run `make swagger-bundle` to produce the updated bundled file.

### Success Criteria

#### Automated Verification:
- [ ] Swagger bundle succeeds: `make swagger-bundle`
- [ ] No YAML syntax errors in path or schema files
- [ ] Bundled output at `api/openapi.bundled.yaml` is valid

#### Manual Verification:
- [ ] New paths file `api/paths/employee-monthly.yaml` documents all 6 handler endpoints
- [ ] Schema field names match handler's `summaryToResponse()` output exactly
- [ ] Credit type semantics documented in schema descriptions
- [ ] Cap field descriptions explain behavior

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 3: Generate Models from OpenAPI Spec

### Overview
Run the model generator to produce typed Go structs from the updated OpenAPI schema. These will be available in `apps/api/gen/models/`.

### Changes Required

#### 1. Generate Models
Run `make generate` to produce Go models from the updated OpenAPI spec.

Expected new generated files in `apps/api/gen/models/`:
- `month_summary_response.go` - Monthly summary response struct
- `year_overview_response.go` - Year overview response struct
- `close_month_request.go` - Close month request struct
- `reopen_month_request.go` - Reopen month request struct

#### 2. Copy Bundled Spec
After generation, copy the bundled spec to the server directory:
```bash
cp api/openapi.bundled.yaml apps/api/cmd/server/openapi.bundled.yaml
```

### Success Criteria

#### Automated Verification:
- [ ] Generate succeeds: `make generate`
- [ ] Generated files compile: `cd apps/api && go build ./gen/models/...`
- [ ] No import cycle errors

#### Manual Verification:
- [ ] Generated structs have correct field names and types matching the schema
- [ ] JSON tags on generated structs match the OpenAPI property names

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 4: Update Handler to Use Generated Models

### Overview
Replace the `map[string]interface{}` response construction in the handler with typed generated models for better type safety and spec compliance.

### Changes Required

#### 1. Update summaryToResponse
**File**: `apps/api/internal/handler/monthlyeval.go`
**Changes**: Update `summaryToResponse()` to return the generated `MonthSummaryResponse` struct instead of `map[string]interface{}`. This ensures the response exactly matches the OpenAPI schema.

If the generated model structure allows direct use, replace the method body to construct the generated model. If the generated model has different field types or naming, create a mapping function.

The key principle: the JSON output must remain identical to what `summaryToResponse()` currently produces, so existing API consumers are not broken.

#### 2. Update dailyValueToResponse
**File**: `apps/api/internal/handler/monthlyeval.go`
**Changes**: Similarly update `dailyValueToResponse()` if a generated model exists for daily value responses.

#### 3. Update GetYearOverview Response
**File**: `apps/api/internal/handler/monthlyeval.go`
**Changes**: Update `GetYearOverview` to use the generated `YearOverviewResponse` struct instead of manually constructing `map[string]interface{}{"year": year, "data": response}`.

### Success Criteria

#### Automated Verification:
- [ ] Build succeeds: `cd apps/api && go build ./...`
- [ ] Tests pass: `cd apps/api && go test ./internal/handler/... -count=1`
- [ ] Lint passes: `cd apps/api && go vet ./...`

#### Manual Verification:
- [ ] JSON response format is identical to the previous `map[string]interface{}` output
- [ ] All optional/nullable fields (closed_at, closed_by, reopened_at, reopened_by) are correctly omitted when nil
- [ ] Warnings array is always present (empty array, never null)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 5: Verify Complete Test Coverage

### Overview
Verify all existing tests pass and confirm coverage of the ticket's test case pack. Add any missing edge case tests.

### Changes Required

#### 1. Run Existing Calculation Tests
**File**: `apps/api/internal/calculation/monthly_test.go`
**Action**: Verify all 10 test groups pass (806 lines).

Ticket test cases mapping:
- Test case 1 (complete carryover: overtime=600, monthly_cap=480 -> credited=480, forfeited=120): Covered by `TestCalculateMonth_CompleteCarryover_MonthlyCap` (uses overtime=120, cap=60, same logic)
- Test case 2 (after threshold: overtime=300, threshold=120 -> credited=180, forfeited=120): Covered by `TestCalculateMonth_AfterThreshold_AboveThreshold` (uses overtime=60, threshold=20, same logic)
- Test case 3 (close/reopen blocks/allows recalc): Covered in service tests

#### 2. Verify Ticket Test Case Pack Values
Add exact ticket test case values if not already covered with those specific numbers. These should be added to `apps/api/internal/calculation/monthly_test.go`:

```go
// --- Ticket Test Case Pack ---

func TestCalculateMonth_TicketCase1_CompleteCarryover(t *testing.T) {
	// Ticket: overtime=600min (10hrs), monthly_cap=480min (8hrs)
	// Expected: credited=480, forfeited=120
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 1080, NetTime: 1080, TargetTime: 480, Overtime: 600, Undertime: 0},
		},
		PreviousCarryover: 0,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType:          calculation.CreditTypeCompleteCarryover,
			MaxFlextimePerMonth: intPtr(480),
		},
	}

	output := calculation.CalculateMonth(input)

	assert.Equal(t, 480, output.FlextimeCredited)
	assert.Equal(t, 120, output.FlextimeForfeited)
	assert.Equal(t, 480, output.FlextimeEnd)
	assert.Contains(t, output.Warnings, calculation.WarnCodeMonthlyCap)
}

func TestCalculateMonth_TicketCase2_AfterThreshold(t *testing.T) {
	// Ticket: overtime=300min (5hrs), threshold=120min (2hrs)
	// Expected: credited=180, forfeited=120
	input := calculation.MonthlyCalcInput{
		DailyValues: []calculation.DailyValueInput{
			{Date: "2025-01-01", GrossTime: 780, NetTime: 780, TargetTime: 480, Overtime: 300, Undertime: 0},
		},
		PreviousCarryover: 0,
		EvaluationRules: &calculation.MonthlyEvaluationInput{
			CreditType:        calculation.CreditTypeAfterThreshold,
			FlextimeThreshold: intPtr(120),
		},
	}

	output := calculation.CalculateMonth(input)

	assert.Equal(t, 180, output.FlextimeCredited)
	assert.Equal(t, 120, output.FlextimeForfeited) // threshold amount
	assert.Equal(t, 180, output.FlextimeEnd)
}
```

#### 3. Verify Service Tests
**File**: `apps/api/internal/service/monthlyeval_test.go`
**Action**: Verify all tests pass. Confirm ticket test case 3 (close blocks recalc, reopen allows) is covered:
- `TestMonthlyEvalService_RecalculateMonth_MonthClosed` -- covers "close blocks recalc"
- `TestMonthlyEvalService_ReopenMonth_Success` -- covers "reopen allows recalc"
- `TestMonthlyEvalService_CloseMonth_Success` -- covers close operation

Add a combined close-then-recalculate-then-reopen-then-recalculate test if not already present:

```go
func TestMonthlyEvalService_CloseReopenRecalculate_TicketCase3(t *testing.T) {
	// Ticket: close month then recalc -> blocked; reopen then recalc -> allowed
	ctx := context.Background()
	svc, monthlyValueRepo, dailyValueRepo, absenceDayRepo, employeeRepo, _ := newTestMonthlyEvalService()

	tenantID := uuid.New()
	employeeID := uuid.New()
	closedBy := uuid.New()
	reopenedBy := uuid.New()

	employee := &model.Employee{ID: employeeID, TenantID: tenantID}
	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)

	// Step 1: Month is closed -> recalculate should fail
	closedMV := &model.MonthlyValue{
		EmployeeID: employeeID,
		Year:       2026,
		Month:      1,
		IsClosed:   true,
	}
	monthlyValueRepo.On("GetByEmployeeMonth", ctx, employeeID, 2026, 1).Return(closedMV, nil).Once()

	err := svc.RecalculateMonth(ctx, employeeID, 2026, 1)
	assert.ErrorIs(t, err, ErrMonthClosed)

	// Step 2: Reopen the month
	monthlyValueRepo.On("GetByEmployeeMonth", ctx, employeeID, 2026, 1).Return(closedMV, nil).Once()
	monthlyValueRepo.On("ReopenMonth", ctx, employeeID, 2026, 1, reopenedBy).Return(nil)

	err = svc.ReopenMonth(ctx, employeeID, 2026, 1, reopenedBy)
	require.NoError(t, err)

	// Step 3: Recalculate should now succeed (month is open)
	openMV := &model.MonthlyValue{
		EmployeeID: employeeID,
		Year:       2026,
		Month:      1,
		IsClosed:   false,
	}
	monthlyValueRepo.On("GetByEmployeeMonth", ctx, employeeID, 2026, 1).Return(openMV, nil).Once()
	monthlyValueRepo.On("GetPreviousMonth", ctx, employeeID, 2026, 1).Return(nil, nil)

	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)
	dailyValueRepo.On("GetByEmployeeDateRange", ctx, employeeID, from, to).Return([]model.DailyValue{}, nil)
	absenceDayRepo.On("GetByEmployeeDateRange", ctx, employeeID, from, to).Return([]model.AbsenceDay{}, nil)
	monthlyValueRepo.On("Upsert", ctx, mock.AnythingOfType("*model.MonthlyValue")).Return(nil)

	err = svc.RecalculateMonth(ctx, employeeID, 2026, 1)
	require.NoError(t, err)
}
```

#### 4. Run All Tests
Execute the full test suite to verify nothing is broken:

```bash
cd apps/api && go test -v -race ./internal/calculation/... ./internal/service/... ./internal/handler/...
```

### Success Criteria

#### Automated Verification:
- [ ] All calculation tests pass: `cd apps/api && go test -v ./internal/calculation/... -count=1`
- [ ] All service tests pass: `cd apps/api && go test -v ./internal/service/... -count=1`
- [ ] All handler tests pass: `cd apps/api && go test -v ./internal/handler/... -count=1`
- [ ] Race detector finds no issues: `cd apps/api && go test -race ./... -count=1`
- [ ] Full test suite: `make test`

#### Manual Verification:
- [ ] Ticket test case 1 (complete carryover with cap) verified with exact numbers
- [ ] Ticket test case 2 (after threshold) verified with exact numbers
- [ ] Ticket test case 3 (close/reopen/recalculate flow) verified end-to-end

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 6: Final Verification

### Overview
Run the complete build pipeline to ensure everything compiles, tests pass, and the OpenAPI spec is consistent.

### Changes Required

#### 1. Full Build Verification
Run the complete pipeline:

```bash
make swagger-bundle   # Bundle OpenAPI spec
make generate         # Generate models
make test             # Run all tests with race detection
make lint             # Run linter
```

#### 2. Verify Existing Integration Points

The monthly evaluation integrates with these other systems:
- **BookingService**: Uses `MonthlyValueRepository.IsMonthClosed()` to block bookings for closed months
- **HolidayService**: Uses `MonthlyCalcService` for cascading recalculations when holidays change
- **RecalcService**: Daily recalculations can trigger monthly recalculation

Verify these integrations compile and their tests pass.

### Success Criteria

#### Automated Verification:
- [ ] `make swagger-bundle` -- OpenAPI bundle succeeds
- [ ] `make generate` -- Model generation succeeds
- [ ] `make test` -- All tests pass with race detection
- [ ] `make lint` -- No lint errors
- [ ] `cd apps/api && go build ./cmd/server/...` -- Server binary builds

#### Manual Verification:
- [ ] Swagger UI at `/swagger/` in dev mode shows the updated monthly endpoints
- [ ] Employee-nested paths (`/employees/{id}/months/...`) appear in spec
- [ ] Credit type semantics are documented in the schema descriptions
- [ ] Cap fields are documented with behavior explanations
- [ ] Monthly cap, positive/negative balance caps, and annual floor described

---

## Testing Strategy

### Unit Tests (Calculation Layer)
**File**: `apps/api/internal/calculation/monthly_test.go`

Already comprehensive (806 lines, 10 groups, ~45 test functions). Coverage includes:
- Daily value aggregation (7 tests)
- All 4 credit types (19 tests total)
- Edge cases (5 tests)
- Absence summary pass-through (2 tests)
- All warning codes (5 tests)
- Annual carryover (5 tests)
- Flextime caps (4 tests)

**New tests to add**: Exact ticket test case values (2 tests).

### Service Tests
**File**: `apps/api/internal/service/monthlyeval_test.go` (781 lines)
**File**: `apps/api/internal/service/monthlycalc_test.go` (429 lines)

Already comprehensive. Coverage includes:
- GetMonthSummary: success, not found, invalid month/year
- RecalculateMonth: success, closed, with carryover, employee not found, with tariff rules
- CloseMonth: success, already closed, not found
- ReopenMonth: success, not closed, not found
- GetYearOverview: success, empty
- Tariff integration: complete carryover capped, after threshold, no carryover, tariff not found
- BuildEvaluationRules: all credit types
- BuildAbsenceSummary: mixed, approved-only, nil type handling
- MonthlyCalcService: single/batch, cascading, year boundary, future month, closed skipping

**New test to add**: Combined close-reopen-recalculate flow (1 test).

### Manual Testing Steps
1. Start the dev environment: `make dev`
2. Create an employee with a tariff that has `credit_type: "complete_carryover"` and `max_flextime_per_month: 480`
3. Create bookings for the employee that generate overtime
4. POST `/employees/{id}/months/{year}/{month}/recalculate` and verify the response includes capped credited amount and warnings
5. POST `/employees/{id}/months/{year}/{month}/close` and verify the month is marked as closed
6. POST `/employees/{id}/months/{year}/{month}/recalculate` and verify it returns 403 Forbidden
7. POST `/employees/{id}/months/{year}/{month}/reopen` and verify the month is reopened
8. POST `/employees/{id}/months/{year}/{month}/recalculate` and verify it succeeds after reopen

## Performance Considerations

- The `Upsert` operation uses PostgreSQL `ON CONFLICT` for atomic create-or-update, avoiding race conditions
- `RecalculateFromMonth` cascades sequentially through months (not parallelized) since each month depends on the previous month's `FlextimeEnd`
- The `(employee_id, year, month)` compound index ensures O(1) lookup for the most common query pattern
- The `(year, month)` index supports period-based batch operations

## Migration Notes

No new database migrations are needed. The existing migration `000028_create_monthly_values` already contains all required columns including:
- All time aggregation fields
- All flextime tracking fields
- Close/reopen audit fields
- Unique constraint on `(employee_id, year, month)` for upsert support
- Proper indexes for query patterns

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-016-monthly-evaluation-and-closing.md`
- Research document: `thoughts/shared/research/2026-01-30-ZMI-TICKET-016-monthly-evaluation-and-closing.md`
- ZMI Reference Manual Section 12: `thoughts/shared/reference/zmi-calculation-manual-reference.md` (lines 1285-1413)
- Calculation engine: `apps/api/internal/calculation/monthly.go`
- Service (eval): `apps/api/internal/service/monthlyeval.go`
- Service (calc): `apps/api/internal/service/monthlycalc.go`
- Repository: `apps/api/internal/repository/monthlyvalue.go`
- Handler: `apps/api/internal/handler/monthlyeval.go`
- Domain model: `apps/api/internal/model/monthlyvalue.go`
- Tariff model: `apps/api/internal/model/tariff.go`
- Database migration: `db/migrations/000028_create_monthly_values.up.sql`
- OpenAPI paths: `api/paths/monthly-values.yaml`
- OpenAPI schemas: `api/schemas/monthly-values.yaml`
- Route registration: `apps/api/internal/handler/routes.go` (lines 552-581)
- DI wiring: `apps/api/cmd/server/main.go` (lines 181-187, 348)
