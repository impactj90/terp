# ZMI-TICKET-006: Day Plan Advanced Rules — Implementation Plan

## Overview

Wire all remaining day plan fields into the daily calculation service so that target hours resolution, no-booking behaviors, holiday credit categories, and round-all-bookings work exactly as specified in the ZMI manual.

## Current State Analysis

The model layer (`model/dayplan.go`) already has all required fields and helper methods (`GetEffectiveRegularHours`, `GetHolidayCredit`). The calculation engine handles breaks, tolerance, capping, core time, and day change correctly. The gaps are in the *wiring* between the day plan model and the daily calculation service.

### Key Discoveries:
- `buildCalcInput()` at `service/daily_calc.go:859` uses `dp.RegularHours` directly instead of `GetEffectiveRegularHours()`
- The service defines its own `NoBookingBehavior` constants (`credit_target`, `credit_zero`, `skip`, `use_absence`) that don't match the model's ZMI enum (`deduct_target`, `vocational_school`, `adopt_target`, `target_with_order`) — `service/daily_calc.go:37-45` vs `model/dayplan.go:32-38`
- `DailyCalcConfig` at `service/daily_calc.go:50-53` uses hardcoded defaults instead of reading from the day plan
- Holiday credit fallback at `service/daily_calc.go:308-318` credits `target/target÷2/0` when not configured, but the spec says credit 0
- `RoundAllBookings` flag exists on model but is not in `DayPlanInput` (`calculation/types.go:92-118`) and `processBookings()` at `calculator.go:121` rounds ALL work bookings unconditionally

## Desired End State

After implementation:
1. `CalculateDay()` resolves target hours using the priority chain: employee master → absence day alternative (RegularHours2) → RegularHours
2. No-booking behavior is read from the day plan and handles all 5 ZMI modes using the model enum values
3. Holiday credit uses the day plan's configured category values with no fallback (0 if not configured)
4. Rounding is applied only to first-in/last-out by default, and to all bookings only when `RoundAllBookings=true`
5. The `DailyCalcConfig` struct and service-level `NoBookingBehavior` type are removed

### Verification:
- All existing tests still pass after refactoring
- New tests cover target hours resolution, no-booking behaviors, holiday credit without fallback, and round-all-bookings
- `make test` and `make lint` pass

## What We're NOT Doing

- **Rounding relative to plan start** — Depends on ZMI-TICKET-023 (system settings). Deferred. TODO added to `service/daily_calc.go`.
- **Vacation deduction integration** — Handled by the absence service flow, not daily calc. TODO added.
- **Vocational school absence creation** — The `vocational_school` no-booking behavior requires creating absence days automatically. We implement the branch and mark it as a TODO pending absence workflow integration.
- **Target with order booking** — The `target_with_order` behavior requires an order/cost center booking module. We implement the branch and mark it as a TODO.

## Implementation Approach

The changes are layered bottom-up: first extend the service's dependency interfaces, then wire the model data through to the calculation, then update each business rule, and finally add tests.

---

## Phase 1: Extend DailyCalcService Dependencies

### Overview
Add `employeeLookup` and `absenceDayLookup` interfaces to the daily calc service so it can resolve employee target hours and check absence status.

### Changes Required:

#### 1. Add interfaces and update constructor
**File**: `apps/api/internal/service/daily_calc.go`
**Changes**: Add two new interface types and update `DailyCalcService` struct + constructor.

```go
// employeeLookup provides employee data for daily calculation.
type employeeLookup interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error)
}

// absenceDayLookup checks for absence days during daily calculation.
type absenceDayLookup interface {
	GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.AbsenceDay, error)
}
```

Update `DailyCalcService` struct to add two fields:

```go
type DailyCalcService struct {
	bookingRepo     bookingRepository
	empDayPlanRepo  employeeDayPlanRepository
	dayPlanRepo     dayPlanLookup
	dailyValueRepo  dailyValueRepository
	holidayRepo     holidayLookup
	employeeRepo    employeeLookup       // NEW
	absenceDayRepo  absenceDayLookup     // NEW
	calc            *calculation.Calculator
	notificationSvc *NotificationService
}
```

Update `NewDailyCalcService` to accept these two new parameters:

```go
func NewDailyCalcService(
	bookingRepo bookingRepository,
	empDayPlanRepo employeeDayPlanRepository,
	dayPlanRepo dayPlanLookup,
	dailyValueRepo dailyValueRepository,
	holidayRepo holidayLookup,
	employeeRepo employeeLookup,
	absenceDayRepo absenceDayLookup,
) *DailyCalcService {
	return &DailyCalcService{
		bookingRepo:    bookingRepo,
		empDayPlanRepo: empDayPlanRepo,
		dayPlanRepo:    dayPlanRepo,
		dailyValueRepo: dailyValueRepo,
		holidayRepo:    holidayRepo,
		employeeRepo:   employeeRepo,
		absenceDayRepo: absenceDayRepo,
		calc:           calculation.NewCalculator(),
	}
}
```

#### 2. Wire in main.go
**File**: `apps/api/cmd/server/main.go`
**Changes**: Pass `employeeRepo` and `absenceDayRepo` to `NewDailyCalcService`. Both are already instantiated in main.go.

```go
dailyCalcService := service.NewDailyCalcService(
	bookingRepo, empDayPlanRepo, dayPlanRepo, dailyValueRepo, holidayRepo,
	employeeRepo,    // NEW
	absenceDayRepo,  // NEW
)
```

#### 3. Update test helper
**File**: `apps/api/internal/service/daily_calc_test.go`
**Changes**: Add mock types for the new interfaces. Update `newTestService` to accept and pass them.

```go
// mockEmployeeLookup implements employeeLookup for testing.
type mockEmployeeLookup struct {
	mock.Mock
}

func (m *mockEmployeeLookup) GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.Employee), args.Error(1)
}

// mockAbsenceDayLookup implements absenceDayLookup for testing.
type mockAbsenceDayLookup struct {
	mock.Mock
}

func (m *mockAbsenceDayLookup) GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.AbsenceDay, error) {
	args := m.Called(ctx, employeeID, date)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.AbsenceDay), args.Error(1)
}
```

Update `newTestService`:

```go
func newTestService(
	bookingRepo *mockBookingRepository,
	empDayPlanRepo *mockEmployeeDayPlanRepository,
	dayPlanRepo *mockDayPlanRepository,
	dailyValueRepo *mockDailyValueRepository,
	holidayRepo *mockHolidayLookup,
	employeeRepo *mockEmployeeLookup,
	absenceDayRepo *mockAbsenceDayLookup,
) *DailyCalcService {
	if dayPlanRepo == nil {
		dayPlanRepo = new(mockDayPlanRepository)
	}
	if employeeRepo == nil {
		employeeRepo = new(mockEmployeeLookup)
	}
	if absenceDayRepo == nil {
		absenceDayRepo = new(mockAbsenceDayLookup)
	}
	if dailyValueRepo != nil {
		dailyValueRepo.On("GetByEmployeeDate", mock.Anything, mock.Anything, mock.Anything).Return(nil, nil)
	}
	return NewDailyCalcService(bookingRepo, empDayPlanRepo, dayPlanRepo, dailyValueRepo, holidayRepo, employeeRepo, absenceDayRepo)
}
```

Update ALL existing calls to `newTestService` to pass `nil, nil` for the two new parameters.

### Success Criteria:

#### Automated Verification:
- [x] All existing tests pass: `cd apps/api && go test ./internal/service/...`
- [x] Code compiles: `cd apps/api && go build ./...`
- [x] Linting passes: `make lint` (new unparam warnings expected until Phase 6 adds non-nil callers)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 2: Target Hours Resolution

### Overview
Wire `GetEffectiveRegularHours()` into the daily calculation so that target hours respect the priority chain: employee master → absence day alternative → standard.

### Changes Required:

#### 1. Add target hours resolution helper
**File**: `apps/api/internal/service/daily_calc.go`
**Changes**: Add a method to resolve effective target hours.

```go
// resolveTargetHours resolves the effective target hours for a day using the ZMI priority chain:
// 1. Employee master (DailyTargetHours) if day plan has FromEmployeeMaster=true
// 2. RegularHours2 if the day is an absence day
// 3. RegularHours (default)
func (s *DailyCalcService) resolveTargetHours(ctx context.Context, employeeID uuid.UUID, date time.Time, dp *model.DayPlan) int {
	if dp == nil {
		return 0
	}

	// Get employee target minutes (convert from decimal hours to int minutes)
	var employeeTargetMinutes *int
	if dp.FromEmployeeMaster {
		emp, err := s.employeeRepo.GetByID(ctx, employeeID)
		if err == nil && emp != nil && emp.DailyTargetHours != nil {
			minutes := int(emp.DailyTargetHours.InexactFloat64() * 60)
			employeeTargetMinutes = &minutes
		}
	}

	// Check if it's an absence day
	isAbsenceDay := false
	absence, err := s.absenceDayRepo.GetByEmployeeDate(ctx, employeeID, date)
	if err == nil && absence != nil && absence.IsApproved() {
		isAbsenceDay = true
	}

	return dp.GetEffectiveRegularHours(isAbsenceDay, employeeTargetMinutes)
}
```

#### 2. Update buildCalcInput()
**File**: `apps/api/internal/service/daily_calc.go`
**Changes**: Replace `dp.RegularHours` with resolved target hours. Change `buildCalcInput` signature to accept `ctx` and use `resolveTargetHours`.

```go
func (s *DailyCalcService) buildCalcInput(
	ctx context.Context,  // NEW parameter
	employeeID uuid.UUID,
	date time.Time,
	empDayPlan *model.EmployeeDayPlan,
	bookings []model.Booking,
) calculation.CalculationInput {
	// ... existing code ...

	if empDayPlan != nil && empDayPlan.DayPlan != nil {
		dp := empDayPlan.DayPlan

		// Resolve target hours using ZMI priority chain
		regularHours := s.resolveTargetHours(ctx, employeeID, date, dp)

		// ... existing tolerance/rounding code ...

		input.DayPlan = calculation.DayPlanInput{
			// ... existing fields ...
			RegularHours: regularHours,  // was dp.RegularHours
			// ... rest of fields ...
		}
	}
	// ... rest of function ...
}
```

Update the call site in `calculateWithBookings()` (line 792) to pass `ctx`:

```go
input := s.buildCalcInput(ctx, employeeID, date, empDayPlan, bookings)
```

#### 3. Update handleNoBookings() target time
**File**: `apps/api/internal/service/daily_calc.go`
**Changes**: Use resolved target hours instead of `dp.RegularHours`.

```go
func (s *DailyCalcService) handleNoBookings(
	ctx context.Context,
	employeeID uuid.UUID,
	date time.Time,
	empDayPlan *model.EmployeeDayPlan,
) (*model.DailyValue, error) {
	targetTime := 0
	if empDayPlan != nil && empDayPlan.DayPlan != nil {
		targetTime = s.resolveTargetHours(ctx, employeeID, date, empDayPlan.DayPlan)
	}
	// ... rest uses targetTime ...
```

#### 4. Update handleHolidayCredit() target time
**File**: `apps/api/internal/service/daily_calc.go`
**Changes**: Use resolved target hours.

```go
func (s *DailyCalcService) handleHolidayCredit(
	ctx context.Context,  // NEW parameter
	employeeID uuid.UUID,
	date time.Time,
	empDayPlan *model.EmployeeDayPlan,
	holidayCategory int,
) *model.DailyValue {
	// ...
	targetTime := 0
	if empDayPlan != nil && empDayPlan.DayPlan != nil {
		targetTime = s.resolveTargetHours(ctx, employeeID, date, empDayPlan.DayPlan)
	}
	dv.TargetTime = targetTime
	// ...
```

Update the call site in `CalculateDay()` to pass `ctx`.

### Success Criteria:

#### Automated Verification:
- [x] All existing tests pass (update mock setups as needed): `cd apps/api && go test ./internal/service/...`
- [ ] New tests for target hours resolution pass (see Phase 6)
- [x] Code compiles: `cd apps/api && go build ./...`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 3: No-Booking Behavior Alignment

### Overview
Remove the service-level `NoBookingBehavior` type and `DailyCalcConfig` struct. Read no-booking behavior from the day plan model and implement the 5 ZMI behaviors.

### Changes Required:

#### 1. Remove service-level types
**File**: `apps/api/internal/service/daily_calc.go`
**Changes**: Delete the following (lines 17-62):
- `HolidayCreditCategory` type and constants (lines 17-33)
- `NoBookingBehavior` type and constants (lines 35-45)
- `DailyCalcConfig` struct (lines 47-53)
- `DefaultDailyCalcConfig()` function (lines 55-62)

#### 2. Rewrite handleNoBookings()
**File**: `apps/api/internal/service/daily_calc.go`
**Changes**: Read behavior from day plan, use model enum values.

```go
func (s *DailyCalcService) handleNoBookings(
	ctx context.Context,
	employeeID uuid.UUID,
	date time.Time,
	empDayPlan *model.EmployeeDayPlan,
) (*model.DailyValue, error) {
	now := time.Now()
	targetTime := 0
	behavior := model.NoBookingError // default
	if empDayPlan != nil && empDayPlan.DayPlan != nil {
		targetTime = s.resolveTargetHours(ctx, employeeID, date, empDayPlan.DayPlan)
		behavior = empDayPlan.DayPlan.NoBookingBehavior
	}

	switch behavior {
	case model.NoBookingAdoptTarget:
		// ZMI: Sollzeit übernehmen — credit target time as if worked
		return &model.DailyValue{
			EmployeeID:   employeeID,
			ValueDate:    date,
			Status:       model.DailyValueStatusCalculated,
			TargetTime:   targetTime,
			NetTime:      targetTime,
			GrossTime:    targetTime,
			Warnings:     pq.StringArray{"NO_BOOKINGS_CREDITED"},
			CalculatedAt: &now,
		}, nil

	case model.NoBookingDeductTarget:
		// ZMI: Sollzeit abziehen — subtract target (undertime = target, no bookings)
		return &model.DailyValue{
			EmployeeID:   employeeID,
			ValueDate:    date,
			Status:       model.DailyValueStatusCalculated,
			TargetTime:   targetTime,
			NetTime:      0,
			GrossTime:    0,
			Undertime:    targetTime,
			Warnings:     pq.StringArray{"NO_BOOKINGS_DEDUCTED"},
			CalculatedAt: &now,
		}, nil

	case model.NoBookingVocationalSchool:
		// ZMI: Berufsschule — auto-create absence for past dates
		// TODO: Create absence day of configured type when absence workflow is integrated
		// For now, credit target time (vocational school days count as worked)
		return &model.DailyValue{
			EmployeeID:   employeeID,
			ValueDate:    date,
			Status:       model.DailyValueStatusCalculated,
			TargetTime:   targetTime,
			NetTime:      targetTime,
			GrossTime:    targetTime,
			Warnings:     pq.StringArray{"VOCATIONAL_SCHOOL", "ABSENCE_CREATION_NOT_IMPLEMENTED"},
			CalculatedAt: &now,
		}, nil

	case model.NoBookingTargetWithOrder:
		// ZMI: Sollzeit mit Auftrag — credit target to default order
		// TODO: Create order booking entry when order module is available
		return &model.DailyValue{
			EmployeeID:   employeeID,
			ValueDate:    date,
			Status:       model.DailyValueStatusCalculated,
			TargetTime:   targetTime,
			NetTime:      targetTime,
			GrossTime:    targetTime,
			Warnings:     pq.StringArray{"NO_BOOKINGS_CREDITED", "ORDER_BOOKING_NOT_IMPLEMENTED"},
			CalculatedAt: &now,
		}, nil

	case model.NoBookingError:
		fallthrough
	default:
		// ZMI: Keine Auswertung — mark as error
		return &model.DailyValue{
			EmployeeID:   employeeID,
			ValueDate:    date,
			Status:       model.DailyValueStatusError,
			TargetTime:   targetTime,
			NetTime:      0,
			GrossTime:    0,
			Undertime:    targetTime,
			HasError:     true,
			ErrorCodes:   pq.StringArray{"NO_BOOKINGS"},
			CalculatedAt: &now,
		}, nil
	}
}
```

#### 3. Update CalculateDay() call sites
**File**: `apps/api/internal/service/daily_calc.go`
**Changes**: Remove `config` variable and `config` parameter from `handleNoBookings` and `handleHolidayCredit`.

In `CalculateDay()`:
- Delete: `config := DefaultDailyCalcConfig()`
- Change: `s.handleHolidayCredit(employeeID, date, empDayPlan, holidayCategory, config)` → `s.handleHolidayCredit(ctx, employeeID, date, empDayPlan, holidayCategory)`
- Change: `s.handleNoBookings(ctx, employeeID, date, empDayPlan, config)` → `s.handleNoBookings(ctx, employeeID, date, empDayPlan)`

### Success Criteria:

#### Automated Verification:
- [x] All existing tests updated and pass: `cd apps/api && go test ./internal/service/...`
- [x] Code compiles: `cd apps/api && go build ./...`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 4: Holiday Credit Strict Compliance

### Overview
Remove the fallback defaults from `handleHolidayCredit()`. When a day plan doesn't configure a credit value for a holiday category, credit 0 (per ZMI spec).

### Changes Required:

#### 1. Simplify handleHolidayCredit()
**File**: `apps/api/internal/service/daily_calc.go`
**Changes**: Remove the fallback switch block. Use `GetHolidayCredit()` return directly.

```go
func (s *DailyCalcService) handleHolidayCredit(
	ctx context.Context,
	employeeID uuid.UUID,
	date time.Time,
	empDayPlan *model.EmployeeDayPlan,
	holidayCategory int,
) *model.DailyValue {
	now := time.Now()
	dv := &model.DailyValue{
		EmployeeID:   employeeID,
		ValueDate:    date,
		Status:       model.DailyValueStatusCalculated,
		CalculatedAt: &now,
		Warnings:     pq.StringArray{"HOLIDAY"},
	}

	targetTime := 0
	if empDayPlan != nil && empDayPlan.DayPlan != nil {
		targetTime = s.resolveTargetHours(ctx, employeeID, date, empDayPlan.DayPlan)
	}
	dv.TargetTime = targetTime

	// ZMI: Use day plan credit for the holiday category.
	// If not configured, credit 0 (per ZMI spec).
	credit := 0
	if empDayPlan != nil && empDayPlan.DayPlan != nil && holidayCategory > 0 {
		credit = empDayPlan.DayPlan.GetHolidayCredit(holidayCategory)
	}

	dv.NetTime = credit
	dv.GrossTime = credit
	if credit < targetTime {
		dv.Undertime = targetTime - credit
	}

	return dv
}
```

Key changes:
- Removed the `config *DailyCalcConfig` parameter
- Removed the `category` variable and the `if category == 0 { category = int(config.HolidayCredit) }` fallback
- Removed the entire `if credit == 0 { switch category { ... } }` fallback block
- Use `holidayCategory` directly (the actual category from the holiday record)

### Success Criteria:

#### Automated Verification:
- [x] All existing tests updated and pass: `cd apps/api && go test ./internal/service/...`
- [x] Code compiles: `cd apps/api && go build ./...`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 5: Round All Bookings

### Overview
Add the `RoundAllBookings` flag to the calculation input and modify `processBookings()` to only round first-in and last-out when the flag is false (the default).

### Changes Required:

#### 1. Add field to DayPlanInput
**File**: `apps/api/internal/calculation/types.go`
**Changes**: Add `RoundAllBookings` to `DayPlanInput`.

```go
type DayPlanInput struct {
	// ... existing fields ...

	// RoundAllBookings applies rounding to every in/out booking.
	// When false (default), only the first arrival and last departure are rounded.
	// ZMI: Alle Buchungen runden
	RoundAllBookings bool
}
```

#### 2. Wire from buildCalcInput()
**File**: `apps/api/internal/service/daily_calc.go`
**Changes**: Set `RoundAllBookings` in the `DayPlanInput` construction within `buildCalcInput()`.

```go
input.DayPlan = calculation.DayPlanInput{
	// ... existing fields ...
	RoundAllBookings: dp.RoundAllBookings,  // NEW
}
```

#### 3. Modify processBookings()
**File**: `apps/api/internal/calculation/calculator.go`
**Changes**: Pre-identify first-in and last-out booking indices. Only apply rounding to those bookings when `RoundAllBookings` is false.

```go
func (c *Calculator) processBookings(
	bookings []BookingInput,
	dayPlan DayPlanInput,
	result *CalculationResult,
) ([]BookingInput, []BookingInput, []*CappedTime) {
	processed := make([]BookingInput, len(bookings))
	validation := make([]BookingInput, len(bookings))
	cappingItems := make([]*CappedTime, 0)

	allowEarlyTolerance := dayPlan.VariableWorkTime || dayPlan.PlanType == model.PlanTypeFlextime

	// Identify first-in and last-out work booking indices for rounding scope
	firstInIdx := -1
	lastOutIdx := -1
	if !dayPlan.RoundAllBookings {
		for i, b := range bookings {
			if b.Category != CategoryWork {
				continue
			}
			if b.Direction == DirectionIn && firstInIdx == -1 {
				firstInIdx = i
			}
			if b.Direction == DirectionOut {
				lastOutIdx = i
			}
		}
	}

	for i, b := range bookings {
		processed[i] = b
		validation[i] = b
		calculatedTime := b.Time

		if b.Category == CategoryWork {
			if b.Direction == DirectionIn {
				// Apply come tolerance
				calculatedTime = ApplyComeTolerance(b.Time, dayPlan.ComeFrom, dayPlan.Tolerance)
				// Apply come rounding (conditionally)
				if dayPlan.RoundAllBookings || i == firstInIdx {
					calculatedTime = RoundComeTime(calculatedTime, dayPlan.RoundingCome)
				}
			} else {
				// Apply go tolerance
				expectedGo := dayPlan.GoTo
				if expectedGo == nil {
					expectedGo = dayPlan.GoFrom
				}
				calculatedTime = ApplyGoTolerance(b.Time, expectedGo, dayPlan.Tolerance)
				// Apply go rounding (conditionally)
				if dayPlan.RoundAllBookings || i == lastOutIdx {
					calculatedTime = RoundGoTime(calculatedTime, dayPlan.RoundingGo)
				}
			}
		}

		// ... rest of loop (validation, capping) unchanged ...
	}

	return processed, validation, cappingItems
}
```

### Success Criteria:

#### Automated Verification:
- [x] All existing rounding tests still pass: `cd apps/api && go test ./internal/calculation/...`
- [ ] New tests for round-all-bookings pass (see Phase 6)
- [x] Code compiles: `cd apps/api && go build ./...`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 6: Tests

### Overview
Add unit tests for all new behaviors and update existing tests for the changed interfaces.

### Changes Required:

#### 1. Target hours resolution tests
**File**: `apps/api/internal/service/daily_calc_test.go`
**Changes**: Add tests for the target hours priority chain.

```go
func TestCalculateDay_TargetHoursFromEmployeeMaster(t *testing.T) {
	// Setup: day plan with FromEmployeeMaster=true, employee has DailyTargetHours=7.5
	// Expected: targetTime = 450 (7.5 * 60)
}

func TestCalculateDay_TargetHoursRegularHours2OnAbsenceDay(t *testing.T) {
	// Setup: day plan with RegularHours2=360, absence day exists for this date
	// Expected: targetTime = 360
}

func TestCalculateDay_TargetHoursFallsBackToRegularHours(t *testing.T) {
	// Setup: day plan with RegularHours=480, no employee override, not absence day
	// Expected: targetTime = 480
}

func TestCalculateDay_TargetHoursEmployeeMasterTakesPriority(t *testing.T) {
	// Setup: day plan with FromEmployeeMaster=true AND RegularHours2 set, absence day, employee has DailyTargetHours
	// Expected: employee master wins (priority 1 over priority 2)
}
```

#### 2. No-booking behavior tests
**File**: `apps/api/internal/service/daily_calc_test.go`
**Changes**: Add tests for each of the 5 ZMI no-booking behaviors.

```go
func TestHandleNoBookings_Error(t *testing.T) {
	// Setup: day plan with NoBookingBehavior="error"
	// Expected: status=error, error_codes=["NO_BOOKINGS"]
}

func TestHandleNoBookings_AdoptTarget(t *testing.T) {
	// Setup: day plan with NoBookingBehavior="adopt_target", RegularHours=480
	// Expected: net=480, gross=480, target=480, overtime=0, undertime=0
}

func TestHandleNoBookings_DeductTarget(t *testing.T) {
	// Setup: day plan with NoBookingBehavior="deduct_target", RegularHours=480
	// Expected: net=0, gross=0, target=480, undertime=480
}

func TestHandleNoBookings_VocationalSchool(t *testing.T) {
	// Setup: day plan with NoBookingBehavior="vocational_school"
	// Expected: net=target, warnings include "VOCATIONAL_SCHOOL"
}

func TestHandleNoBookings_TargetWithOrder(t *testing.T) {
	// Setup: day plan with NoBookingBehavior="target_with_order"
	// Expected: net=target, warnings include "ORDER_BOOKING_NOT_IMPLEMENTED"
}
```

#### 3. Holiday credit strict tests
**File**: `apps/api/internal/service/daily_calc_test.go`
**Changes**: Add tests verifying no fallback.

```go
func TestHandleHolidayCredit_CategoryConfigured(t *testing.T) {
	// Setup: day plan with HolidayCreditCat1=480, holiday category 1
	// Expected: net=480, gross=480
}

func TestHandleHolidayCredit_CategoryNotConfigured(t *testing.T) {
	// Setup: day plan with HolidayCreditCat1=nil, holiday category 1, RegularHours=480
	// Expected: net=0, gross=0 (NO fallback to target)
}

func TestHandleHolidayCredit_Category2Configured(t *testing.T) {
	// Setup: day plan with HolidayCreditCat2=240, holiday category 2
	// Expected: net=240
}

func TestHandleHolidayCredit_Category3Zero(t *testing.T) {
	// Setup: day plan with HolidayCreditCat3=nil, holiday category 3
	// Expected: net=0
}
```

#### 4. Round all bookings tests
**File**: `apps/api/internal/calculation/calculator_test.go`
**Changes**: Add tests for selective vs all-bookings rounding.

```go
func TestProcessBookings_RoundAllBookingsFalse(t *testing.T) {
	// Setup: 3 work bookings (in, out, in, out), RoundAllBookings=false, RoundingCome=up/15
	// Expected: only first in and last out are rounded
}

func TestProcessBookings_RoundAllBookingsTrue(t *testing.T) {
	// Setup: same bookings, RoundAllBookings=true, RoundingCome=up/15
	// Expected: all in/out bookings are rounded
}

func TestProcessBookings_RoundAllBookingsDefault(t *testing.T) {
	// Setup: default DayPlanInput (RoundAllBookings=false by default)
	// Expected: only first-in and last-out rounded (verify Go zero-value behavior is correct)
}
```

#### 5. Update existing test calls
**File**: `apps/api/internal/service/daily_calc_test.go`
**Changes**: All existing calls to `newTestService` must be updated to include the two new `nil` mock parameters. All existing tests that used `config` must be updated since `DailyCalcConfig` is removed.

### Success Criteria:

#### Automated Verification:
- [ ] All tests pass: `cd apps/api && go test ./internal/...`
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] Linting passes: `make lint`
- [ ] Formatting is correct: `make fmt`

#### Manual Verification:
- [ ] Review test coverage for the changed functions
- [ ] Verify that the no-booking behavior warning messages are descriptive enough

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 7: TODO Annotations for Deferred Work

### Overview
Add explicit TODO comments referencing the deferred tickets.

### Changes Required:

#### 1. Rounding relative to plan start
**File**: `apps/api/internal/calculation/rounding.go`
**Changes**: Add TODO at the top of the file.

```go
// TODO(ZMI-TICKET-023): Add support for rounding relative to plan start time.
// When system settings enable relative rounding, the rounding grid should be
// anchored at the planned start time (e.g., ComeFrom) instead of absolute
// clock intervals (00:00). Requires system settings service from ZMI-TICKET-023.
```

#### 2. Vacation deduction integration
**File**: `apps/api/internal/service/daily_calc.go`
**Changes**: Add TODO near the resolveTargetHours function.

```go
// TODO(ZMI-TICKET-006): Verify vacation deduction integration.
// The VacationDeduction field on the day plan should be used by the absence
// service when deducting vacation balance. Verify this integration when
// absence workflow tickets are implemented.
```

#### 3. Vocational school and target-with-order
Already included as TODO comments in the handleNoBookings switch cases (see Phase 3).

### Success Criteria:

#### Automated Verification:
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] Full test suite passes: `make test`
- [ ] Linting passes: `make lint`

---

## Testing Strategy

### Unit Tests:
- Target hours resolution priority chain (4 tests)
- No-booking behaviors for all 5 ZMI modes (5 tests)
- Holiday credit with and without configured values (4 tests)
- Round-all-bookings flag behavior (3 tests)
- Existing tests updated for interface changes

### Integration Tests:
- No new integration tests in this ticket (behaviors are testable at unit level)

### Manual Testing Steps:
1. Create a day plan with `FromEmployeeMaster=true`, assign to employee with `DailyTargetHours`, verify calculation uses employee target
2. Create a day plan with each no-booking behavior, verify daily values for a day without bookings
3. Create a holiday with category 2, day plan with `HolidayCreditCat2=240`, verify credit is 240
4. Create a day plan with `RoundAllBookings=false`, multiple bookings, verify only first/last are rounded

## Performance Considerations

- Two additional DB queries per calculation: employee lookup and absence day check
- Employee lookup only fires when `FromEmployeeMaster=true` (most plans won't use this)
- Absence day lookup always fires but is a simple indexed query
- For batch recalculation (`RecalculateRange`), these queries are per-day. Caching could be added later if profiling shows impact.

## Migration Notes

No database migrations needed. All required fields already exist from migration 000030 and 000041.

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-006-day-plan-advanced-rules.md`
- Research: `thoughts/shared/research/2026-01-29-ZMI-TICKET-006-day-plan-advanced-rules.md`
- ZMI manual reference: `thoughts/shared/reference/zmi-calculation-manual-reference.md`
- Day plan model: `apps/api/internal/model/dayplan.go:51-133`
- Daily calc service: `apps/api/internal/service/daily_calc.go:131-943`
- Calculator: `apps/api/internal/calculation/calculator.go:18-204`
- Calculation types: `apps/api/internal/calculation/types.go:92-118`
- Employee model: `apps/api/internal/model/employee.go:55` (DailyTargetHours field)
- Absence day repo: `apps/api/internal/repository/absenceday.go:59-73` (GetByEmployeeDate)
