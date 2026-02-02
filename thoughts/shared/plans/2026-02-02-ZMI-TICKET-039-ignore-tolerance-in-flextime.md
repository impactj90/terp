# ZMI-TICKET-039: Ignore Tolerance/Variable Work Time in Flextime Plans

## Overview

Enforce the ZMI reference manual rule (Section 6.2) that `tolerance_come_plus`, `tolerance_go_minus`, and `variable_work_time` have no meaning for flextime day plans. The calculation-time override already exists but is untested. This plan adds service-layer normalization, fixes a missing handler mapping for `variable_work_time`, updates OpenAPI documentation, and adds comprehensive tests.

## Current State Analysis

### What Already Exists (Confirmed)

1. **Calculation-time override in `buildCalcInput`** (`apps/api/internal/service/daily_calc.go` lines 1033-1044):
   ```go
   switch dp.PlanType {
   case model.PlanTypeFlextime:
       tolerance.ComePlus = 0
       tolerance.GoMinus = 0
       variableWorkTime = false
   case model.PlanTypeFixed:
       if !dp.VariableWorkTime {
           tolerance.ComeMinus = 0
       }
   }
   ```
   This correctly zeroes out the three fields before passing to the calculator. **However, this code has zero test coverage.**

2. **Capping awareness in calculator** (`apps/api/internal/calculation/calculator.go` line 130):
   ```go
   allowEarlyTolerance := dayPlan.VariableWorkTime || dayPlan.PlanType == model.PlanTypeFlextime
   ```
   Flextime plans always allow early arrivals regardless of `VariableWorkTime`.

3. **Fixed-plan Come- gating** (`daily_calc.go` line 1041): `ComeMinus` is zeroed for fixed plans when `VariableWorkTime` is false, matching ZMI Section 6.3.

### What Does Not Exist (Confirmed)

1. **No service-layer normalization**: `DayPlanService.Create()` and `DayPlanService.Update()` store whatever the client sends. Non-zero `ToleranceComePlus`, `ToleranceGoMinus`, or `VariableWorkTime=true` can persist in the DB for flextime plans.

2. **`VariableWorkTime` is missing from handler mapping**: The generated model `CreateDayPlanRequest.VariableWorkTime` and `UpdateDayPlanRequest.VariableWorkTime` exist, but the handler (`apps/api/internal/handler/dayplan.go`) never maps them to the service input structs. The field is also absent from `CreateDayPlanInput` and `UpdateDayPlanInput` in `apps/api/internal/service/dayplan.go`. This means `VariableWorkTime` cannot be set via the API at all -- it always defaults to `false`.

3. **No OpenAPI documentation** about flextime field restrictions. The `variable_work_time` description says "Enable tolerance_come_minus for fixed working time plans" but doesn't mention it's ignored for flextime.

4. **No tests** for:
   - `buildCalcInput` flextime tolerance override
   - Calculator behavior with flextime + non-zero ComePlus/GoMinus
   - Service normalization of tolerance fields

### Key Discoveries

- `DayPlanInput.VariableWorkTime` in the calculation layer (`apps/api/internal/calculation/types.go:118`) is correctly documented
- The `ApplyWindowCapping` function uses `variableWorkTime` param (line 180 of capping.go) but for flextime, `buildCalcInput` already forces it to false before passing to the calculator
- The `processBookings` method in `calculator.go` independently checks `dayPlan.PlanType == model.PlanTypeFlextime` for `allowEarlyTolerance` (line 130), providing a second safety net

## Desired End State

After implementation:

1. **Service layer**: Creating or updating a day plan with `plan_type=flextime` silently normalizes `tolerance_come_plus`, `tolerance_go_minus` to 0 and `variable_work_time` to false before storing in the database.
2. **Handler layer**: `variable_work_time` is properly mapped from the API request to the service input (fixing the existing gap).
3. **Calculation layer**: The existing `buildCalcInput` override remains as a defense-in-depth guard, now with full test coverage.
4. **OpenAPI spec**: Field descriptions clearly state which tolerance fields are ignored for flextime.
5. **Tests**: Comprehensive unit tests cover normalization, calculation override, and end-to-end flextime behavior.

### Verification of End State

- A flextime plan created with `tolerance_come_plus=5, tolerance_go_minus=5, variable_work_time=true` should be stored as `tolerance_come_plus=0, tolerance_go_minus=0, variable_work_time=false`.
- A calculation for a flextime plan with DB values of `tolerance_come_plus=5` (from before this fix) should still produce the same result as `tolerance_come_plus=0` (defense-in-depth).
- All existing tests continue to pass.

## What We're NOT Doing

- **Database migration to clean existing data**: Existing flextime plans with non-zero values will continue to work correctly because `buildCalcInput` already overrides at calculation time. A data migration is not worth the risk.
- **Rejection instead of normalization**: We silently normalize rather than returning 400 errors. This is more forgiving for API clients and consistent with how the system already handles it at calculation time.
- **Database CHECK constraints**: Adding DB-level constraints would require a migration and could break existing data. The service-layer normalization is sufficient.
- **Frontend enforcement**: The ticket explicitly scopes this to server-side only.

## Implementation Approach

We use a normalization approach: silently zero out the three fields when `plan_type=flextime`. This is applied at the service layer (before DB write) and preserved as a guard at the calculation layer (before calculation). Both layers are tested.

The implementation proceeds in three phases:
1. Fix the handler/service input gap for `VariableWorkTime`, then add normalization logic
2. Write comprehensive tests
3. Update OpenAPI documentation

---

## Phase 1: Service-Layer Normalization + Handler Fix

### Overview

Add `VariableWorkTime` to service input structs, fix the handler to pass it, and add a normalization method that zeroes out flextime-irrelevant fields on Create, Update, and Copy.

### Changes Required

#### 1. Add VariableWorkTime to Service Input Structs

**File**: `apps/api/internal/service/dayplan.go`

Add `VariableWorkTime` field to `CreateDayPlanInput`:

```go
type CreateDayPlanInput struct {
    // ... existing fields ...
    ToleranceGoMinus   int
    VariableWorkTime   bool       // <-- ADD after ToleranceGoMinus
    RoundingComeType   *model.RoundingType
    // ... rest of fields ...
}
```

Add `VariableWorkTime` field to `UpdateDayPlanInput`:

```go
type UpdateDayPlanInput struct {
    // ... existing fields ...
    ToleranceGoMinus   *int
    VariableWorkTime   *bool      // <-- ADD after ToleranceGoMinus
    RoundingComeType   *model.RoundingType
    // ... rest of fields ...
}
```

#### 2. Add Normalization Method

**File**: `apps/api/internal/service/dayplan.go`

Add a new method that normalizes flextime-irrelevant fields on the model after all input has been applied:

```go
// normalizeFlextimeFields zeroes out tolerance and variable work time fields
// that have no meaning for flextime plans per ZMI Section 6.2.
func (s *DayPlanService) normalizeFlextimeFields(plan *model.DayPlan) {
    if plan.PlanType != model.PlanTypeFlextime {
        return
    }
    plan.ToleranceComePlus = 0
    plan.ToleranceGoMinus = 0
    plan.VariableWorkTime = false
}
```

#### 3. Call Normalization in Create

**File**: `apps/api/internal/service/dayplan.go` -- in `Create()` method

After the plan struct is built (around line 145) and before `s.dayPlanRepo.Create`:

```go
    plan := &model.DayPlan{
        // ... existing field assignments ...
        VariableWorkTime:     input.VariableWorkTime,  // <-- ADD this line
        // ... rest of existing fields ...
    }

    // ZMI Section 6.2: normalize fields that have no meaning for flextime
    s.normalizeFlextimeFields(plan)

    if err := s.dayPlanRepo.Create(ctx, plan); err != nil {
```

#### 4. Call Normalization in Update

**File**: `apps/api/internal/service/dayplan.go` -- in `Update()` method

Add handling for the new `VariableWorkTime` field (after the ToleranceGoMinus block, around line 287):

```go
    if input.VariableWorkTime != nil {
        plan.VariableWorkTime = *input.VariableWorkTime
    }
```

Then add normalization call before `validateTimeRanges` (around line 316):

```go
    // ZMI Section 6.2: normalize fields that have no meaning for flextime
    s.normalizeFlextimeFields(plan)

    // Validate time ranges after update
    if err := s.validateTimeRanges(plan.ComeFrom, plan.ComeTo, plan.GoFrom, plan.GoTo, plan.CoreStart, plan.CoreEnd); err != nil {
```

#### 5. Call Normalization in Copy

**File**: `apps/api/internal/service/dayplan.go` -- in `Copy()` method

After the newPlan struct is built (around line 405) and before `s.dayPlanRepo.Create`:

```go
    // ZMI Section 6.2: normalize fields that have no meaning for flextime
    s.normalizeFlextimeFields(newPlan)

    if err := s.dayPlanRepo.Create(ctx, newPlan); err != nil {
```

#### 6. Fix Handler to Pass VariableWorkTime

**File**: `apps/api/internal/handler/dayplan.go` -- in `Create()` method

Add `VariableWorkTime` to the input struct initialization (after `ToleranceGoMinus`, around line 97):

```go
    input := service.CreateDayPlanInput{
        // ... existing fields ...
        ToleranceGoMinus:   int(req.ToleranceGoMinus),
        VariableWorkTime:   req.VariableWorkTime,     // <-- ADD
    }
```

**File**: `apps/api/internal/handler/dayplan.go` -- in `Update()` method

Add `VariableWorkTime` mapping (after the ToleranceGoMinus block, around line 263):

```go
    // VariableWorkTime - always pass since it's a boolean
    input.VariableWorkTime = &req.VariableWorkTime
```

### Success Criteria

#### Automated Verification:
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] Existing tests pass: `cd apps/api && go test ./internal/service/... ./internal/calculation/...`
- [ ] Linting passes: `cd apps/api && golangci-lint run`

#### Manual Verification:
- [ ] None required for this phase (tested in Phase 2)

---

## Phase 2: Tests

### Overview

Add comprehensive tests covering three layers: (a) service normalization, (b) calculation-time override in `buildCalcInput`, and (c) calculator integration with flextime plans.

### Changes Required

#### 1. Service Normalization Tests

**File**: `apps/api/internal/service/dayplan_test.go`

Add these test functions:

```go
func TestDayPlanService_Create_FlextimeNormalizesTolerance(t *testing.T) {
    // Create a flextime plan with non-zero ComePlus, GoMinus, and VariableWorkTime=true
    // Assert: stored plan has ComePlus=0, GoMinus=0, VariableWorkTime=false
    // Assert: ToleranceComeMinus and ToleranceGoPlus are preserved (they ARE valid for flextime)
}

func TestDayPlanService_Create_FixedPreservesTolerance(t *testing.T) {
    // Create a fixed plan with non-zero ComePlus, GoMinus, and VariableWorkTime=true
    // Assert: all values preserved as-is (normalization only affects flextime)
}

func TestDayPlanService_Update_ChangeToFlextimeNormalizesTolerance(t *testing.T) {
    // Create a fixed plan with ComePlus=5, GoMinus=5, VariableWorkTime=true
    // Update plan_type to flextime
    // Assert: stored plan has ComePlus=0, GoMinus=0, VariableWorkTime=false
}

func TestDayPlanService_Update_FlextimeToleranceSetToNonZeroNormalized(t *testing.T) {
    // Create a flextime plan
    // Update with ToleranceComePlus=5
    // Assert: stored plan still has ComePlus=0 (normalized)
}

func TestDayPlanService_Copy_FlextimeNormalizesTolerance(t *testing.T) {
    // Create a flextime plan (which normalizes), but manually set DB values to non-zero
    // OR: create a fixed plan with tolerance, then copy, then update copy to flextime
    // Actually simpler: Create fixed plan with tolerance values, update to flextime,
    // verify normalization. Then copy and verify copy is also normalized.
}
```

Test setup pattern (follow existing convention from `dayplan_test.go`):

```go
func TestDayPlanService_Create_FlextimeNormalizesTolerance(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := repository.NewDayPlanRepository(db)
    svc := service.NewDayPlanService(repo)
    ctx := context.Background()

    tenant := createTestTenantForDayPlanService(t, db)

    comeFrom := 420
    goTo := 1020
    input := service.CreateDayPlanInput{
        TenantID:           tenant.ID,
        Code:               "FLEX-TOL",
        Name:               "Flextime With Tolerance",
        PlanType:           model.PlanTypeFlextime,
        ComeFrom:           &comeFrom,
        GoTo:               &goTo,
        RegularHours:       480,
        ToleranceComePlus:  5,
        ToleranceComeMinus: 10,
        ToleranceGoPlus:    10,
        ToleranceGoMinus:   5,
        VariableWorkTime:   true,
    }

    plan, err := svc.Create(ctx, input)
    require.NoError(t, err)

    // ZMI Section 6.2: These fields have no meaning for flextime
    assert.Equal(t, 0, plan.ToleranceComePlus, "ComePlus should be normalized to 0 for flextime")
    assert.Equal(t, 0, plan.ToleranceGoMinus, "GoMinus should be normalized to 0 for flextime")
    assert.False(t, plan.VariableWorkTime, "VariableWorkTime should be normalized to false for flextime")

    // These fields ARE valid for flextime and should be preserved
    assert.Equal(t, 10, plan.ToleranceComeMinus, "ComeMinus should be preserved for flextime")
    assert.Equal(t, 10, plan.ToleranceGoPlus, "GoPlus should be preserved for flextime")
}
```

#### 2. Calculator Integration Tests for Flextime Tolerance

**File**: `apps/api/internal/calculation/calculator_test.go`

Add these test functions:

```go
func TestCalculator_FlextimeIgnoresComePlusAndGoMinus(t *testing.T) {
    // This tests defense-in-depth: if the DB somehow has non-zero ComePlus/GoMinus
    // for a flextime plan (e.g., legacy data), the calculator should still produce
    // correct results because buildCalcInput zeroes them out.
    //
    // Test: Two calculations with identical bookings and flextime plan config.
    // One has ComePlus=5/GoMinus=5, the other has ComePlus=0/GoMinus=0.
    // Both should produce identical results.
    calc := calculation.NewCalculator()
    comeFrom := 480 // 08:00
    goTo := 1020    // 17:00

    // Bookings: arrive 3 min late, leave 3 min early
    bookings := []calculation.BookingInput{
        {ID: uuid.New(), Time: 483, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
        {ID: uuid.New(), Time: 1017, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
    }

    // Plan WITH tolerance values (as if DB has stale data)
    planWithTolerance := calculation.DayPlanInput{
        PlanType:     model.PlanTypeFlextime,
        RegularHours: 480,
        ComeFrom:     &comeFrom,
        GoTo:         &goTo,
        Tolerance: calculation.ToleranceConfig{
            ComePlus: 5,
            GoMinus:  5,
        },
    }

    // Plan WITHOUT tolerance values (correct state)
    planWithoutTolerance := calculation.DayPlanInput{
        PlanType:     model.PlanTypeFlextime,
        RegularHours: 480,
        ComeFrom:     &comeFrom,
        GoTo:         &goTo,
        Tolerance:    calculation.ToleranceConfig{},
    }

    resultWith := calc.Calculate(calculation.CalculationInput{
        EmployeeID: uuid.New(), Bookings: bookings, DayPlan: planWithTolerance,
    })
    resultWithout := calc.Calculate(calculation.CalculationInput{
        EmployeeID: uuid.New(), Bookings: bookings, DayPlan: planWithoutTolerance,
    })

    // Both should produce identical calculation
    assert.Equal(t, resultWithout.GrossTime, resultWith.GrossTime)
    assert.Equal(t, resultWithout.NetTime, resultWith.NetTime)
}

func TestCalculator_FlextimeVariableWorkTimeHasNoEffect(t *testing.T) {
    // Even if VariableWorkTime is true for a flextime plan,
    // behavior should be identical to VariableWorkTime=false
    // because flextime always allows early arrivals.
    calc := calculation.NewCalculator()
    comeFrom := 480 // 08:00
    goTo := 1020    // 17:00

    bookings := []calculation.BookingInput{
        {ID: uuid.New(), Time: 460, Direction: calculation.DirectionIn, Category: calculation.CategoryWork}, // 07:40 (early)
        {ID: uuid.New(), Time: 1000, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
    }

    planWithVWT := calculation.DayPlanInput{
        PlanType:         model.PlanTypeFlextime,
        RegularHours:     480,
        ComeFrom:         &comeFrom,
        GoTo:             &goTo,
        VariableWorkTime: true,
    }

    planWithoutVWT := calculation.DayPlanInput{
        PlanType:     model.PlanTypeFlextime,
        RegularHours: 480,
        ComeFrom:     &comeFrom,
        GoTo:         &goTo,
    }

    resultWith := calc.Calculate(calculation.CalculationInput{
        EmployeeID: uuid.New(), Bookings: bookings, DayPlan: planWithVWT,
    })
    resultWithout := calc.Calculate(calculation.CalculationInput{
        EmployeeID: uuid.New(), Bookings: bookings, DayPlan: planWithoutVWT,
    })

    assert.Equal(t, resultWithout.GrossTime, resultWith.GrossTime)
    assert.Equal(t, resultWithout.NetTime, resultWith.NetTime)
    assert.Equal(t, resultWithout.CappedTime, resultWith.CappedTime)
}
```

**Note**: These calculator-level tests verify the defense-in-depth behavior. The tolerance module (`tolerance.go`) itself is plan-type-agnostic and doesn't need new tests -- it correctly applies whatever values it receives. The zeroing happens in `buildCalcInput` (service layer) and the calculator's `processBookings` handles capping independently via `allowEarlyTolerance`.

#### 3. Tolerance Test for Fixed Plan Come- Gating (Coverage Gap)

**File**: `apps/api/internal/calculation/calculator_test.go`

Add a test that validates the fixed-plan `ComeMinus` gating behavior (currently only tested at the capping level, not at the tolerance level):

```go
func TestCalculator_FixedPlan_ComeMinus_RequiresVariableWorkTime(t *testing.T) {
    // For fixed plans, ComeMinus tolerance should only apply when
    // VariableWorkTime is enabled (ZMI Section 6.3).
    // Note: At the calculator level, buildCalcInput handles this.
    // But the calculator itself uses ComeMinus through the tolerance module,
    // which is plan-type-agnostic. This test confirms that when ComeMinus
    // is passed as 0 (as buildCalcInput would do for fixed without VWT),
    // early arrivals within what would be the ComeMinus range are NOT snapped.
    calc := calculation.NewCalculator()
    comeFrom := 480 // 08:00

    bookings := []calculation.BookingInput{
        {ID: uuid.New(), Time: 477, Direction: calculation.DirectionIn, Category: calculation.CategoryWork}, // 07:57
        {ID: uuid.New(), Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
    }

    // ComeMinus=0 means no early arrival tolerance
    plan := calculation.DayPlanInput{
        PlanType:     model.PlanTypeFixed,
        RegularHours: 480,
        ComeFrom:     &comeFrom,
        Tolerance:    calculation.ToleranceConfig{ComeMinus: 0},
    }

    result := calc.Calculate(calculation.CalculationInput{
        EmployeeID: uuid.New(), Bookings: bookings, DayPlan: plan,
    })

    // 07:57 should NOT snap to 08:00 (no ComeMinus tolerance)
    // Instead it's capped to 08:00 by evaluation window capping
    assert.Equal(t, 480, result.CalculatedTimes[bookings[0].ID])
}
```

### Success Criteria

#### Automated Verification:
- [ ] All existing tests pass: `cd apps/api && go test -race ./internal/service/... ./internal/calculation/...`
- [ ] New service tests pass: `cd apps/api && go test -v -run TestDayPlanService_Create_FlextimeNormalizes ./internal/service/...`
- [ ] New service tests pass: `cd apps/api && go test -v -run TestDayPlanService_Create_FixedPreserves ./internal/service/...`
- [ ] New service tests pass: `cd apps/api && go test -v -run TestDayPlanService_Update_ChangeToFlextime ./internal/service/...`
- [ ] New service tests pass: `cd apps/api && go test -v -run TestDayPlanService_Update_FlextimeTolerance ./internal/service/...`
- [ ] New calculator tests pass: `cd apps/api && go test -v -run TestCalculator_FlextimeIgnores ./internal/calculation/...`
- [ ] New calculator tests pass: `cd apps/api && go test -v -run TestCalculator_FlextimeVariable ./internal/calculation/...`
- [ ] Linting passes: `cd apps/api && golangci-lint run`

#### Manual Verification:
- [ ] None required for this phase

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to Phase 3.

---

## Phase 3: OpenAPI Documentation Updates

### Overview

Update the OpenAPI schema descriptions to document that `tolerance_come_plus`, `tolerance_go_minus`, and `variable_work_time` are ignored for flextime plans.

### Changes Required

#### 1. Update DayPlan Response Schema Descriptions

**File**: `api/schemas/day-plans.yaml`

Update the `DayPlan` schema properties:

```yaml
    tolerance_come_plus:
      type: integer
      description: "Tolerance for late arrival (minutes). Ignored for flextime plans (always treated as 0)."
      example: 0
    tolerance_go_minus:
      type: integer
      description: "Tolerance for early departure (minutes). Ignored for flextime plans (always treated as 0)."
      example: 0
    variable_work_time:
      type: boolean
      description: "Enable tolerance_come_minus for fixed working time plans. Has no effect for flextime plans (always treated as false)."
```

#### 2. Update CreateDayPlanRequest Schema Descriptions

**File**: `api/schemas/day-plans.yaml`

Update the `CreateDayPlanRequest` schema properties:

```yaml
    tolerance_come_plus:
      type: integer
      description: "Tolerance for late arrival (minutes). Ignored and normalized to 0 for flextime plans."
    tolerance_go_minus:
      type: integer
      description: "Tolerance for early departure (minutes). Ignored and normalized to 0 for flextime plans."
    variable_work_time:
      type: boolean
      description: "Enable tolerance_come_minus for fixed plans. Ignored and normalized to false for flextime plans."
```

#### 3. Update UpdateDayPlanRequest Schema Descriptions

**File**: `api/schemas/day-plans.yaml`

Same description updates as CreateDayPlanRequest for:
- `tolerance_come_plus`
- `tolerance_go_minus`
- `variable_work_time`

#### 4. Regenerate Bundled Spec and Models

```bash
make swagger-bundle
make generate
```

### Success Criteria

#### Automated Verification:
- [ ] Bundle succeeds: `make swagger-bundle`
- [ ] Models regenerate: `make generate`
- [ ] Code compiles after regeneration: `cd apps/api && go build ./...`
- [ ] All tests still pass: `cd apps/api && go test -race ./...`

#### Manual Verification:
- [ ] Swagger UI at `/swagger/` shows updated field descriptions
- [ ] OpenAPI YAML is valid and parseable

---

## Testing Strategy

### Unit Tests (Phase 2)

| Test | File | Verifies |
|------|------|----------|
| `TestDayPlanService_Create_FlextimeNormalizesTolerance` | `service/dayplan_test.go` | Create normalizes ComePlus, GoMinus, VariableWorkTime for flextime |
| `TestDayPlanService_Create_FixedPreservesTolerance` | `service/dayplan_test.go` | Create does NOT normalize for fixed plans |
| `TestDayPlanService_Update_ChangeToFlextimeNormalizesTolerance` | `service/dayplan_test.go` | Changing plan_type to flextime triggers normalization |
| `TestDayPlanService_Update_FlextimeToleranceSetToNonZeroNormalized` | `service/dayplan_test.go` | Setting tolerance on existing flextime plan is normalized |
| `TestDayPlanService_Copy_FlextimeNormalizesTolerance` | `service/dayplan_test.go` | Copied flextime plans are normalized |

### Integration Tests (Phase 2)

| Test | File | Verifies |
|------|------|----------|
| `TestCalculator_FlextimeIgnoresComePlusAndGoMinus` | `calculation/calculator_test.go` | Flextime with/without tolerance produces identical results |
| `TestCalculator_FlextimeVariableWorkTimeHasNoEffect` | `calculation/calculator_test.go` | Flextime VariableWorkTime=true has no effect on calculation |
| `TestCalculator_FixedPlan_ComeMinus_RequiresVariableWorkTime` | `calculation/calculator_test.go` | Fixed plan ComeMinus only works with VariableWorkTime |

### Test Case Pack from Ticket

1. **Flextime tolerance ignored**: Input: flextime plan with `ComePlus=5, GoMinus=5`. Expected: same results as `ComePlus=0, GoMinus=0`. Covered by: `TestCalculator_FlextimeIgnoresComePlusAndGoMinus`.

2. **VariableWorkTime ignored**: Input: flextime plan with `VariableWorkTime=true`. Expected: same results as `VariableWorkTime=false`. Covered by: `TestCalculator_FlextimeVariableWorkTimeHasNoEffect`.

## Performance Considerations

None. The normalization is a simple field comparison + assignment that runs once per Create/Update/Copy operation. No additional DB queries or complex computations.

## Migration Notes

No database migration is needed. Existing flextime plans with non-zero tolerance values in the DB will:
- Continue to calculate correctly (due to `buildCalcInput` defense-in-depth)
- Be normalized on the next Update operation
- NOT be retroactively cleaned up (out of scope)

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-039-ignore-tolerance-in-flextime.md`
- Research document: `thoughts/shared/research/2026-02-02-ZMI-TICKET-039-ignore-tolerance-in-flextime.md`
- ZMI reference manual Section 6.2: `thoughts/shared/reference/zmi-calculation-manual-reference.md` (lines 472-490)
- ZMI reference manual Section 6.3: `thoughts/shared/reference/zmi-calculation-manual-reference.md` (line 552)
