# Implementation Plan: ZMI-TICKET-038 -- Auto-create Vocational School Absence

## Summary

When a day plan has `no_booking_behavior == vocational_school` and the date is in the past with no bookings, auto-create an `AbsenceDay` with type "SB", duration 1.00, status approved. The implementation must be idempotent and must remove the `ABSENCE_CREATION_NOT_IMPLEMENTED` warning. No new API endpoints are needed.

## Phases

---

### Phase 1: Fix Dev Seed Discrepancy (BS -> SB)

**File**: `/home/tolga/projects/terp/apps/api/internal/auth/devabsencetypes.go`

The dev seed uses code `"BS"` (line 93) while the production migration uses `"SB"` (the correct code per the ticket). Fix the dev seed to match.

**Change at line 93**:
```go
// Before:
Code:            "BS",

// After:
Code:            "SB",
```

**Verification**: `make dev` should start without errors. Existing absence lookups by code "SB" will now work in dev mode.

---

### Phase 2: Add `absenceDayAutoCreator` Interface and Service Field

**File**: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go`

#### 2a. Add new interface (after line 58, after the existing `absenceDayLookup` interface)

Insert after line 58:
```go
// absenceDayAutoCreator creates absence days automatically during daily calculation.
type absenceDayAutoCreator interface {
	CreateAutoAbsenceByCode(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time, absenceTypeCode string) (*model.AbsenceDay, error)
}
```

#### 2b. Add field to DailyCalcService struct (after line 85, after `absenceDayRepo`)

Insert a new field after line 85 (`absenceDayRepo absenceDayLookup`):
```go
absenceDayCreator   absenceDayAutoCreator
```

The struct (lines 78-91) becomes:
```go
type DailyCalcService struct {
	bookingRepo         bookingRepository
	empDayPlanRepo      employeeDayPlanRepository
	dayPlanRepo         dayPlanLookup
	dailyValueRepo      dailyValueRepository
	holidayRepo         holidayLookup
	employeeRepo        employeeLookup
	absenceDayRepo      absenceDayLookup
	absenceDayCreator   absenceDayAutoCreator
	calc                *calculation.Calculator
	notificationSvc     *NotificationService
	orderBookingSvc     orderBookingCreator
	settingsLookup      settingsLookup
	dailyAccountValRepo dailyAccountValueWriter
}
```

#### 2c. Add setter method (after line 123, after `SetOrderBookingService`)

Insert after the `SetOrderBookingService` method:
```go
// SetAbsenceDayCreator sets the absence day creator for vocational school auto-absence creation.
func (s *DailyCalcService) SetAbsenceDayCreator(creator absenceDayAutoCreator) {
	s.absenceDayCreator = creator
}
```

**Verification**: `cd /home/tolga/projects/terp/apps/api && go build ./...` should succeed.

---

### Phase 3: Implement `CreateAutoAbsenceByCode` on AbsenceService

**File**: `/home/tolga/projects/terp/apps/api/internal/service/absence.go`

Add a new method to `AbsenceService`. Insert before the `normalizeDate` helper (line 586) or after the last public method.

```go
// CreateAutoAbsenceByCode creates an absence day automatically by looking up the absence type by code.
// Used by daily calculation for vocational school auto-absence creation.
// Idempotent: returns the existing absence if one already exists for the date.
func (s *AbsenceService) CreateAutoAbsenceByCode(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time, absenceTypeCode string) (*model.AbsenceDay, error) {
	// 1. Idempotency check: return existing absence if present
	existing, err := s.absenceDayRepo.GetByEmployeeDate(ctx, employeeID, date)
	if err != nil {
		return nil, fmt.Errorf("check existing absence: %w", err)
	}
	if existing != nil {
		return existing, nil
	}

	// 2. Look up absence type by code
	absenceType, err := s.absenceTypeRepo.GetByCode(ctx, tenantID, absenceTypeCode)
	if err != nil {
		return nil, fmt.Errorf("absence type %q not found: %w", absenceTypeCode, err)
	}

	// 3. Create the absence day with approved status
	now := time.Now()
	notes := "Auto-created by vocational school day plan"
	ad := &model.AbsenceDay{
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		AbsenceDate:   normalizeDate(date),
		AbsenceTypeID: absenceType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusApproved,
		ApprovedAt:    &now,
		Notes:         &notes,
	}

	if err := s.absenceDayRepo.Create(ctx, ad); err != nil {
		return nil, fmt.Errorf("create auto absence: %w", err)
	}

	ad.AbsenceType = absenceType
	return ad, nil
}
```

**Key design decisions**:
- Uses `GetByEmployeeDate` for idempotency (same repo method used everywhere; returns non-cancelled absences only)
- Uses `GetByCode` which prefers tenant-specific over system types
- Sets `Status = approved` and `ApprovedAt = now` (no manual approval needed)
- Sets `Duration = 1.00` (full day, matching SB Portion=1)
- No `CreatedBy` (system-generated, not user-initiated)
- Uses `normalizeDate` (already available in the same package at line 586)

**Verification**: `cd /home/tolga/projects/terp/apps/api && go build ./...` should succeed.

---

### Phase 4: Update `handleNoBookings` Vocational School Case

**File**: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go`

Replace lines 490-503 (the entire `case model.NoBookingVocationalSchool:` block) with:

```go
	case model.NoBookingVocationalSchool:
		// ZMI: Berufsschule -- auto-create absence for past dates with no bookings
		warnings := pq.StringArray{"VOCATIONAL_SCHOOL"}

		// Only create absence for past dates (before today)
		today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
		if s.absenceDayCreator != nil && date.Before(today) {
			// Check if absence already exists (idempotency)
			existing, _ := s.absenceDayRepo.GetByEmployeeDate(ctx, employeeID, date)
			if existing == nil {
				_, createErr := s.absenceDayCreator.CreateAutoAbsenceByCode(
					ctx, empDayPlan.TenantID, employeeID, date, "SB",
				)
				if createErr != nil {
					warnings = append(warnings, "ABSENCE_CREATION_FAILED")
				} else {
					warnings = append(warnings, "ABSENCE_CREATED")
				}
			}
		} else if s.absenceDayCreator == nil {
			warnings = append(warnings, "ABSENCE_CREATION_NOT_CONFIGURED")
		}

		return &model.DailyValue{
			EmployeeID:   employeeID,
			ValueDate:    date,
			Status:       model.DailyValueStatusCalculated,
			TargetTime:   targetTime,
			NetTime:      targetTime,
			GrossTime:    targetTime,
			Warnings:     warnings,
			CalculatedAt: &now,
		}, nil
```

**Key design decisions**:
- `ABSENCE_CREATION_NOT_IMPLEMENTED` warning is removed (the whole point of this ticket)
- Uses `empDayPlan.TenantID` to get the tenant ID (verified: EmployeeDayPlan has TenantID at line 21 of the model)
- Past date check uses `date.Before(today)` where `today` is truncated to midnight UTC (daily calc operates on full dates)
- `now` is already declared at line 454 of `handleNoBookings`, so it is available
- Follows the `target_with_order` pattern (lines 505-542) for optional service nil-check and warning patterns
- When `absenceDayCreator` is nil, emits `ABSENCE_CREATION_NOT_CONFIGURED` (graceful degradation)
- When absence already exists, no warning is emitted (idempotent, clean)
- When creation fails, emits `ABSENCE_CREATION_FAILED` for observability
- When creation succeeds, emits `ABSENCE_CREATED` for observability
- The idempotency check in `handleNoBookings` avoids an unnecessary service call; `CreateAutoAbsenceByCode` also has its own idempotency check internally

**Recalculation note**: The vocational school case already credits `targetTime` (which equals `RegularHours` by default). Since SB has Portion=1, the absence credit will be the same value. If `RegularHours2` is configured and differs, the next recalculation (triggered externally or on next daily calc pass) will pick up the newly created absence via `resolveTargetHours` (line 139-160), which checks `absenceDayRepo.GetByEmployeeDate` and uses `GetEffectiveRegularHours(isAbsenceDay=true)`. The current pass returns the correct value for the common case, and subsequent recalculations handle the edge case.

**Verification**: `cd /home/tolga/projects/terp/apps/api && go build ./...` should succeed.

---

### Phase 5: Wire in main.go

**File**: `/home/tolga/projects/terp/apps/api/cmd/server/main.go`

Insert after line 152 (after `absenceService` creation, before `absenceHandler`):

```go
	// Wire absence day creator into daily calc for vocational school auto-absence
	dailyCalcService.SetAbsenceDayCreator(absenceService)
```

The relevant section (lines 150-153) becomes:
```go
	// Initialize AbsenceService
	absenceTypeRepo := repository.NewAbsenceTypeRepository(db)
	absenceService := service.NewAbsenceService(absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcService)
	dailyCalcService.SetAbsenceDayCreator(absenceService)
	absenceHandler := handler.NewAbsenceHandler(absenceService, employeeService)
```

**Why this location**: `absenceService` and `dailyCalcService` are both already created by this point. The setter pattern avoids circular dependency issues (dailyCalcService depends on the interface, not on AbsenceService directly).

**Verification**: `cd /home/tolga/projects/terp/apps/api && go build ./...` should succeed.

---

### Phase 6: Update Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc_test.go`

#### 6a. Add mock for `absenceDayAutoCreator`

Insert after the `mockAbsenceDayLookup` mock definition (after line 139):

```go
// mockAbsenceDayAutoCreator implements absenceDayAutoCreator for testing.
type mockAbsenceDayAutoCreator struct {
	mock.Mock
}

func (m *mockAbsenceDayAutoCreator) CreateAutoAbsenceByCode(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time, code string) (*model.AbsenceDay, error) {
	args := m.Called(ctx, tenantID, employeeID, date, code)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.AbsenceDay), args.Error(1)
}
```

#### 6b. Update existing test `TestHandleNoBookings_VocationalSchool` (lines 722-750)

Replace the entire function with a table-driven test covering all scenarios:

```go
func TestHandleNoBookings_VocationalSchool(t *testing.T) {
	tenantID := uuid.New()
	employeeID := uuid.New()
	pastDate := testDate(2025, 6, 15)       // Past date
	futureDate := testDate(2099, 6, 15)     // Future date
	absenceTypeID := uuid.New()

	sbAbsenceDay := &model.AbsenceDay{
		ID:            uuid.New(),
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		AbsenceDate:   pastDate,
		AbsenceTypeID: absenceTypeID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusApproved,
	}

	t.Run("past date creates absence", func(t *testing.T) {
		ctx := context.Background()

		absenceDayRepo := new(mockAbsenceDayLookup)
		absenceDayRepo.On("GetByEmployeeDate", mock.Anything, employeeID, pastDate).Return(nil, nil)

		creator := new(mockAbsenceDayAutoCreator)
		creator.On("CreateAutoAbsenceByCode", mock.Anything, tenantID, employeeID, pastDate, "SB").Return(sbAbsenceDay, nil)

		svc := &DailyCalcService{
			employeeRepo:      new(mockEmployeeLookup),
			absenceDayRepo:    absenceDayRepo,
			absenceDayCreator: creator,
		}

		dayPlan := createStandardDayPlan(tenantID)
		dayPlan.NoBookingBehavior = model.NoBookingVocationalSchool
		dayPlanID := dayPlan.ID
		empDayPlan := &model.EmployeeDayPlan{
			TenantID:  tenantID,
			DayPlanID: &dayPlanID,
			DayPlan:   dayPlan,
		}

		result, err := svc.handleNoBookings(ctx, employeeID, pastDate, empDayPlan)

		require.NoError(t, err)
		require.NotNil(t, result)
		assert.Equal(t, 480, result.TargetTime)
		assert.Equal(t, 480, result.NetTime)
		assert.Equal(t, 480, result.GrossTime)
		assert.Contains(t, []string(result.Warnings), "VOCATIONAL_SCHOOL")
		assert.Contains(t, []string(result.Warnings), "ABSENCE_CREATED")
		assert.NotContains(t, []string(result.Warnings), "ABSENCE_CREATION_NOT_IMPLEMENTED")
		creator.AssertExpectations(t)
	})

	t.Run("past date with existing absence is idempotent", func(t *testing.T) {
		ctx := context.Background()

		absenceDayRepo := new(mockAbsenceDayLookup)
		absenceDayRepo.On("GetByEmployeeDate", mock.Anything, employeeID, pastDate).Return(sbAbsenceDay, nil)

		creator := new(mockAbsenceDayAutoCreator)
		// CreateAutoAbsenceByCode should NOT be called

		svc := &DailyCalcService{
			employeeRepo:      new(mockEmployeeLookup),
			absenceDayRepo:    absenceDayRepo,
			absenceDayCreator: creator,
		}

		dayPlan := createStandardDayPlan(tenantID)
		dayPlan.NoBookingBehavior = model.NoBookingVocationalSchool
		dayPlanID := dayPlan.ID
		empDayPlan := &model.EmployeeDayPlan{
			TenantID:  tenantID,
			DayPlanID: &dayPlanID,
			DayPlan:   dayPlan,
		}

		result, err := svc.handleNoBookings(ctx, employeeID, pastDate, empDayPlan)

		require.NoError(t, err)
		require.NotNil(t, result)
		assert.Equal(t, 480, result.TargetTime)
		assert.Contains(t, []string(result.Warnings), "VOCATIONAL_SCHOOL")
		assert.NotContains(t, []string(result.Warnings), "ABSENCE_CREATED")
		assert.NotContains(t, []string(result.Warnings), "ABSENCE_CREATION_NOT_IMPLEMENTED")
		creator.AssertNotCalled(t, "CreateAutoAbsenceByCode", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)
	})

	t.Run("future date does not create absence", func(t *testing.T) {
		ctx := context.Background()

		absenceDayRepo := new(mockAbsenceDayLookup)
		absenceDayRepo.On("GetByEmployeeDate", mock.Anything, mock.Anything, mock.Anything).Return(nil, nil)

		creator := new(mockAbsenceDayAutoCreator)
		// CreateAutoAbsenceByCode should NOT be called

		svc := &DailyCalcService{
			employeeRepo:      new(mockEmployeeLookup),
			absenceDayRepo:    absenceDayRepo,
			absenceDayCreator: creator,
		}

		dayPlan := createStandardDayPlan(tenantID)
		dayPlan.NoBookingBehavior = model.NoBookingVocationalSchool
		dayPlanID := dayPlan.ID
		empDayPlan := &model.EmployeeDayPlan{
			TenantID:  tenantID,
			DayPlanID: &dayPlanID,
			DayPlan:   dayPlan,
		}

		result, err := svc.handleNoBookings(ctx, employeeID, futureDate, empDayPlan)

		require.NoError(t, err)
		require.NotNil(t, result)
		assert.Equal(t, 480, result.TargetTime)
		assert.Equal(t, 480, result.NetTime)
		assert.Equal(t, 480, result.GrossTime)
		assert.Contains(t, []string(result.Warnings), "VOCATIONAL_SCHOOL")
		assert.NotContains(t, []string(result.Warnings), "ABSENCE_CREATED")
		assert.NotContains(t, []string(result.Warnings), "ABSENCE_CREATION_NOT_IMPLEMENTED")
		creator.AssertNotCalled(t, "CreateAutoAbsenceByCode", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)
	})

	t.Run("nil creator emits not configured warning", func(t *testing.T) {
		ctx := context.Background()

		absenceDayRepo := new(mockAbsenceDayLookup)
		absenceDayRepo.On("GetByEmployeeDate", mock.Anything, mock.Anything, mock.Anything).Return(nil, nil)

		svc := &DailyCalcService{
			employeeRepo:      new(mockEmployeeLookup),
			absenceDayRepo:    absenceDayRepo,
			absenceDayCreator: nil, // not configured
		}

		dayPlan := createStandardDayPlan(tenantID)
		dayPlan.NoBookingBehavior = model.NoBookingVocationalSchool
		dayPlanID := dayPlan.ID
		empDayPlan := &model.EmployeeDayPlan{
			TenantID:  tenantID,
			DayPlanID: &dayPlanID,
			DayPlan:   dayPlan,
		}

		result, err := svc.handleNoBookings(ctx, employeeID, pastDate, empDayPlan)

		require.NoError(t, err)
		require.NotNil(t, result)
		assert.Equal(t, 480, result.TargetTime)
		assert.Contains(t, []string(result.Warnings), "VOCATIONAL_SCHOOL")
		assert.Contains(t, []string(result.Warnings), "ABSENCE_CREATION_NOT_CONFIGURED")
	})

	t.Run("creation failure emits warning but does not error", func(t *testing.T) {
		ctx := context.Background()

		absenceDayRepo := new(mockAbsenceDayLookup)
		absenceDayRepo.On("GetByEmployeeDate", mock.Anything, employeeID, pastDate).Return(nil, nil)

		creator := new(mockAbsenceDayAutoCreator)
		creator.On("CreateAutoAbsenceByCode", mock.Anything, tenantID, employeeID, pastDate, "SB").
			Return(nil, errors.New("db error"))

		svc := &DailyCalcService{
			employeeRepo:      new(mockEmployeeLookup),
			absenceDayRepo:    absenceDayRepo,
			absenceDayCreator: creator,
		}

		dayPlan := createStandardDayPlan(tenantID)
		dayPlan.NoBookingBehavior = model.NoBookingVocationalSchool
		dayPlanID := dayPlan.ID
		empDayPlan := &model.EmployeeDayPlan{
			TenantID:  tenantID,
			DayPlanID: &dayPlanID,
			DayPlan:   dayPlan,
		}

		result, err := svc.handleNoBookings(ctx, employeeID, pastDate, empDayPlan)

		require.NoError(t, err) // does not bubble up as error
		require.NotNil(t, result)
		assert.Equal(t, 480, result.TargetTime)
		assert.Equal(t, 480, result.NetTime)
		assert.Contains(t, []string(result.Warnings), "VOCATIONAL_SCHOOL")
		assert.Contains(t, []string(result.Warnings), "ABSENCE_CREATION_FAILED")
	})
}
```

**Note**: The existing test uses `testDate(2026, 1, 20)` which may or may not be in the past at test runtime. The updated test uses `testDate(2025, 6, 15)` for past and `testDate(2099, 6, 15)` for future to be deterministic.

**Note**: The test needs `"errors"` imported. Add it to the import block if not already present. Currently the test file imports are at lines 1-17 and do not include `"errors"`.

#### 6c. Add `CreateAutoAbsenceByCode` test in absence_test.go

**File**: `/home/tolga/projects/terp/apps/api/internal/service/absence_test.go`

Add test function at the end of the file:

```go
func TestCreateAutoAbsenceByCode(t *testing.T) {
	tenantID := uuid.New()
	employeeID := uuid.New()
	date := time.Date(2025, 6, 15, 0, 0, 0, 0, time.UTC)
	absenceTypeID := uuid.New()
	absenceType := &model.AbsenceType{
		ID:       absenceTypeID,
		Code:     "SB",
		Name:     "Berufsschule",
		Category: "special",
		Portion:  1,
	}

	t.Run("creates new absence", func(t *testing.T) {
		ctx := context.Background()

		absenceDayRepo := new(mockAbsenceDayRepositoryForService)
		absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, date).Return(nil, nil)
		absenceDayRepo.On("Create", ctx, mock.AnythingOfType("*model.AbsenceDay")).Return(nil)

		absenceTypeRepo := new(mockAbsenceTypeRepositoryForService)
		absenceTypeRepo.On("GetByCode", ctx, tenantID, "SB").Return(absenceType, nil)

		svc := NewAbsenceService(absenceDayRepo, absenceTypeRepo, nil, nil, nil)

		result, err := svc.CreateAutoAbsenceByCode(ctx, tenantID, employeeID, date, "SB")

		require.NoError(t, err)
		require.NotNil(t, result)
		assert.Equal(t, tenantID, result.TenantID)
		assert.Equal(t, employeeID, result.EmployeeID)
		assert.Equal(t, absenceTypeID, result.AbsenceTypeID)
		assert.True(t, result.Duration.Equal(decimal.NewFromInt(1)))
		assert.Equal(t, model.AbsenceStatusApproved, result.Status)
		assert.NotNil(t, result.ApprovedAt)
		assert.NotNil(t, result.Notes)
		assert.Equal(t, absenceType, result.AbsenceType)
		absenceDayRepo.AssertExpectations(t)
	})

	t.Run("returns existing absence idempotently", func(t *testing.T) {
		ctx := context.Background()

		existingAbsence := &model.AbsenceDay{
			ID:            uuid.New(),
			TenantID:      tenantID,
			EmployeeID:    employeeID,
			AbsenceDate:   date,
			AbsenceTypeID: absenceTypeID,
			Duration:      decimal.NewFromInt(1),
			Status:        model.AbsenceStatusApproved,
		}

		absenceDayRepo := new(mockAbsenceDayRepositoryForService)
		absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, date).Return(existingAbsence, nil)

		absenceTypeRepo := new(mockAbsenceTypeRepositoryForService)
		// GetByCode should NOT be called

		svc := NewAbsenceService(absenceDayRepo, absenceTypeRepo, nil, nil, nil)

		result, err := svc.CreateAutoAbsenceByCode(ctx, tenantID, employeeID, date, "SB")

		require.NoError(t, err)
		assert.Equal(t, existingAbsence.ID, result.ID)
		absenceTypeRepo.AssertNotCalled(t, "GetByCode", mock.Anything, mock.Anything, mock.Anything)
		absenceDayRepo.AssertNotCalled(t, "Create", mock.Anything, mock.Anything)
	})

	t.Run("returns error when absence type not found", func(t *testing.T) {
		ctx := context.Background()

		absenceDayRepo := new(mockAbsenceDayRepositoryForService)
		absenceDayRepo.On("GetByEmployeeDate", ctx, employeeID, date).Return(nil, nil)

		absenceTypeRepo := new(mockAbsenceTypeRepositoryForService)
		absenceTypeRepo.On("GetByCode", ctx, tenantID, "SB").Return(nil, errors.New("not found"))

		svc := NewAbsenceService(absenceDayRepo, absenceTypeRepo, nil, nil, nil)

		result, err := svc.CreateAutoAbsenceByCode(ctx, tenantID, employeeID, date, "SB")

		require.Error(t, err)
		assert.Nil(t, result)
		assert.Contains(t, err.Error(), "SB")
	})
}
```

**Verification**: `cd /home/tolga/projects/terp/apps/api && go test -v -run TestHandleNoBookings_VocationalSchool ./internal/service/...` and `cd /home/tolga/projects/terp/apps/api && go test -v -run TestCreateAutoAbsenceByCode ./internal/service/...`

---

### Phase 7: Run Full Test Suite

```bash
cd /home/tolga/projects/terp/apps/api && go test -race ./...
```

Verify no regressions across the entire test suite.

---

## File Change Summary

| # | File | Change Type | Description |
|---|------|------------|-------------|
| 1 | `apps/api/internal/auth/devabsencetypes.go` | Edit line 93 | Fix `"BS"` -> `"SB"` |
| 2 | `apps/api/internal/service/daily_calc.go` | Add after line 58 | New `absenceDayAutoCreator` interface |
| 3 | `apps/api/internal/service/daily_calc.go` | Add after line 85 | New `absenceDayCreator` field in struct |
| 4 | `apps/api/internal/service/daily_calc.go` | Add after line 123 | New `SetAbsenceDayCreator` setter |
| 5 | `apps/api/internal/service/daily_calc.go` | Replace lines 490-503 | Updated vocational school case |
| 6 | `apps/api/internal/service/absence.go` | Add before line 586 | New `CreateAutoAbsenceByCode` method |
| 7 | `apps/api/cmd/server/main.go` | Add after line 152 | Wire `SetAbsenceDayCreator(absenceService)` |
| 8 | `apps/api/internal/service/daily_calc_test.go` | Add after line 139 | New `mockAbsenceDayAutoCreator` mock |
| 9 | `apps/api/internal/service/daily_calc_test.go` | Add `"errors"` to imports | Import for test error creation |
| 10 | `apps/api/internal/service/daily_calc_test.go` | Replace lines 722-750 | Updated vocational school test (5 subtests) |
| 11 | `apps/api/internal/service/absence_test.go` | Append at end | New `TestCreateAutoAbsenceByCode` (3 subtests) |

## Warnings Behavior Summary

| Scenario | Warnings |
|----------|----------|
| Past date, no existing absence, creation succeeds | `VOCATIONAL_SCHOOL`, `ABSENCE_CREATED` |
| Past date, existing absence (idempotent) | `VOCATIONAL_SCHOOL` |
| Past date, creation fails | `VOCATIONAL_SCHOOL`, `ABSENCE_CREATION_FAILED` |
| Future/today date | `VOCATIONAL_SCHOOL` |
| `absenceDayCreator` is nil | `VOCATIONAL_SCHOOL`, `ABSENCE_CREATION_NOT_CONFIGURED` |

The `ABSENCE_CREATION_NOT_IMPLEMENTED` warning is fully removed.

## Architecture Notes

- **No circular dependency**: `DailyCalcService` depends on `absenceDayAutoCreator` interface (not AbsenceService concrete type). Go's implicit interface satisfaction means `AbsenceService` implements the interface without importing `DailyCalcService`.
- **Follows existing pattern**: The `SetAbsenceDayCreator` setter mirrors `SetOrderBookingService` (line 121-123) exactly.
- **Idempotency is double-checked**: Both `handleNoBookings` (outer check) and `CreateAutoAbsenceByCode` (inner check) verify no existing absence exists. The outer check avoids an unnecessary service call.
- **No new API endpoints**: All changes are internal service/calculation logic.
