# ZMI-TICKET-037: Vacation Deduction Uses Day Plan Urlaubsbewertung - Implementation Plan

## Overview

When a vacation absence is approved, the system should look up the effective day plan for that date and use its `vacation_deduction` field to determine how much to deduct from the vacation balance, instead of using the raw absence duration. The formula is: `deduction = day_plan.vacation_deduction * absence.duration`. If no day plan exists for the date, default to `1.0 * duration`.

## Current State Analysis

1. **VacationDeduction field exists** on `DayPlan` model (`decimal.Decimal`, default 1.00, column `vacation_deduction DECIMAL(5,2)`). Added in migration `000030`. **Not used anywhere.**

2. **`VacationService.RecalculateTaken()`** sums raw `duration` values via `CountByTypeInRange()` (SQL `SUM(duration)`). Does not consider the day plan.

3. **`AbsenceService.Approve()`** sets status to approved and triggers daily recalculation but does **not** update `VacationBalance.Taken`.

4. **No Cancel method** exists in `AbsenceService`. The `AbsenceStatusCancelled` constant exists but nothing transitions to it.

5. **`VacationBalanceRepository.IncrementTaken()`** exists and is tested but never called. Built in anticipation of per-event deduction.

6. **`VacationService` has no `EmployeeDayPlanRepository` dependency** and cannot look up day plans.

7. There is a TODO comment in `daily_calc.go` (line 135) acknowledging this integration is needed.

### Key Discoveries:
- `apps/api/internal/model/dayplan.go:104` -- `VacationDeduction decimal.Decimal` field on DayPlan
- `apps/api/internal/service/daily_calc.go:135-138` -- TODO comment for this ticket
- `apps/api/internal/service/vacation.go:354-396` -- `RecalculateTaken` uses raw SUM
- `apps/api/internal/service/absence.go:160-186` -- `Approve` does not update vacation balance
- `apps/api/internal/repository/absenceday.go:191-207` -- `CountByTypeInRange` does raw SUM
- `apps/api/internal/repository/vacationbalance.go:91-104` -- `IncrementTaken` exists, unused
- `apps/api/internal/repository/employeedayplan.go:69-85` -- `GetForEmployeeDate` preloads DayPlan

## Desired End State

After implementation:
- When a vacation absence is approved, `VacationBalance.Taken` is recalculated using day-plan-weighted deductions.
- Each approved absence day's deduction = `day_plan.vacation_deduction * absence.duration`.
- If no day plan exists for a date, the default deduction is `1.0 * duration`.
- Cancelling an approved absence triggers recalculation, effectively reversing the deduction.
- Deleting an approved absence triggers recalculation.
- `RecalculateTaken()` is idempotent and self-correcting (full recalculation from source data).

### Verification:
- `cd apps/api && go test -v -run TestVacation ./internal/service/...` passes with weighted deduction tests
- `cd apps/api && go test -v -run TestAbsence ./internal/service/...` passes with approve/cancel vacation tests
- `make test` passes with no regressions
- `make lint` passes

## What We're NOT Doing

- No database migrations -- the `vacation_deduction` column already exists.
- No OpenAPI spec changes -- no new endpoints needed.
- No handler changes -- existing approve/reject/delete endpoints trigger the new logic automatically.
- No changes to entitlement calculation -- that is handled by separate tickets.
- No changes to how daily calc credits absence time -- that is the time credit (Regelarbeitszeit), not vacation balance deduction.

## Implementation Approach

We use the **idempotent recalculation approach**: modify `VacationService.RecalculateTaken()` to compute weighted deductions by looking up day plans for each absence date. Then trigger this recalculation from the absence lifecycle methods (approve, cancel, delete).

This approach is preferred over incremental `IncrementTaken` because:
- It is self-correcting: any drift is fixed on the next recalculation.
- It handles edge cases (day plan changes, absence edits) without tracking deltas.
- It follows the existing pattern of full recalculation (like `DailyCalcService.CalculateDay`).

---

## Phase 1: Repository Layer - Add Individual Absence Day Query

### Overview
Add a new repository method that returns individual approved absence day records (instead of a SUM) so the service can look up day plans per date.

### Changes Required:

#### 1. AbsenceDayRepository - Add ListApprovedByTypeInRange
**File**: `apps/api/internal/repository/absenceday.go`
**Changes**: Add new method after `CountByTypeInRange` (after line ~207)

```go
// ListApprovedByTypeInRange returns individual approved absence days for an employee
// of a specific type within a date range. Unlike CountByTypeInRange which returns a SUM,
// this returns individual records so callers can compute weighted deductions per date.
func (r *AbsenceDayRepository) ListApprovedByTypeInRange(ctx context.Context, employeeID, typeID uuid.UUID, from, to time.Time) ([]model.AbsenceDay, error) {
	var days []model.AbsenceDay
	err := r.db.GORM.WithContext(ctx).
		Where("employee_id = ? AND absence_type_id = ? AND absence_date >= ? AND absence_date <= ? AND status = ?",
			employeeID, typeID, from, to, model.AbsenceStatusApproved).
		Order("absence_date ASC").
		Find(&days).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list approved absence days by type: %w", err)
	}
	return days, nil
}
```

#### 2. Vacation Service Interface - Extend absenceDayRepoForVacation
**File**: `apps/api/internal/service/vacation.go`
**Changes**: Add new method to the `absenceDayRepoForVacation` interface (lines 29-31)

```go
// absenceDayRepoForVacation defines the interface for absence day counting.
type absenceDayRepoForVacation interface {
	CountByTypeInRange(ctx context.Context, employeeID, typeID uuid.UUID, from, to time.Time) (decimal.Decimal, error)
	ListApprovedByTypeInRange(ctx context.Context, employeeID, typeID uuid.UUID, from, to time.Time) ([]model.AbsenceDay, error)
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] Existing tests pass: `cd apps/api && go test ./internal/repository/... ./internal/service/...`

**Implementation Note**: After completing this phase, proceed to Phase 2.

---

## Phase 2: VacationService - Weighted RecalculateTaken

### Overview
Add an `empDayPlanRepo` dependency to `VacationService` and modify `RecalculateTaken()` to compute day-plan-weighted deductions instead of raw duration sums.

### Changes Required:

#### 1. Add empDayPlanRepo Interface and Dependency
**File**: `apps/api/internal/service/vacation.go`
**Changes**: Add new interface and field to VacationService struct

Add interface definition (after line ~61, near the other interface definitions):
```go
// empDayPlanRepoForVacation provides day plan lookup for vacation deduction weighting.
type empDayPlanRepoForVacation interface {
	GetForEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.EmployeeDayPlan, error)
}
```

Add field to `VacationService` struct (line ~85):
```go
type VacationService struct {
	vacationBalanceRepo   vacationBalanceRepoForVacation
	absenceDayRepo        absenceDayRepoForVacation
	absenceTypeRepo       absenceTypeRepoForVacation
	employeeRepo          employeeRepoForVacation
	tenantRepo            tenantRepoForVacation
	tariffRepo            tariffRepoForVacation
	employmentTypeRepo    employmentTypeRepoForVacation
	vacationCalcGroupRepo vacationCalcGroupRepoForVacation
	empDayPlanRepo        empDayPlanRepoForVacation // NEW
	defaultMaxCarryover   decimal.Decimal
}
```

Add setter method (after `NewVacationService`, following the pattern used by `DailyCalcService.SetSettingsLookup`):
```go
// SetEmpDayPlanRepo sets the employee day plan repository for vacation deduction weighting.
func (s *VacationService) SetEmpDayPlanRepo(repo empDayPlanRepoForVacation) {
	s.empDayPlanRepo = repo
}
```

#### 2. Modify RecalculateTaken to Use Weighted Deductions
**File**: `apps/api/internal/service/vacation.go`
**Changes**: Replace the loop body in `RecalculateTaken` (lines 381-392) to use individual records and day plan lookup

Replace the current implementation (from `// Sum vacation days taken...` to the end of the function) with:

```go
// Sum weighted vacation deductions across all vacation-deducting types for the year
yearStart := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
yearEnd := time.Date(year, 12, 31, 0, 0, 0, 0, time.UTC)

// Batch-fetch day plans for the year to avoid N+1 queries
dayPlanMap := make(map[time.Time]decimal.Decimal) // date -> vacation_deduction
if s.empDayPlanRepo != nil {
	plans, err := s.empDayPlanRepo.GetForEmployeeDateRange(ctx, employeeID, yearStart, yearEnd)
	if err == nil {
		for _, edp := range plans {
			date := time.Date(edp.PlanDate.Year(), edp.PlanDate.Month(), edp.PlanDate.Day(), 0, 0, 0, 0, time.UTC)
			if edp.DayPlan != nil {
				dayPlanMap[date] = edp.DayPlan.VacationDeduction
			}
		}
	}
}

totalTaken := decimal.Zero
defaultDeduction := decimal.NewFromInt(1) // default when no day plan

for _, vt := range vacationTypes {
	days, err := s.absenceDayRepo.ListApprovedByTypeInRange(ctx, employeeID, vt.ID, yearStart, yearEnd)
	if err != nil {
		return err
	}
	for _, day := range days {
		date := time.Date(day.AbsenceDate.Year(), day.AbsenceDate.Month(), day.AbsenceDate.Day(), 0, 0, 0, 0, time.UTC)
		vacDeduction := defaultDeduction
		if vd, ok := dayPlanMap[date]; ok {
			vacDeduction = vd
		}
		// deduction = vacation_deduction * duration
		totalTaken = totalTaken.Add(vacDeduction.Mul(day.Duration))
	}
}

// Update the taken value
return s.vacationBalanceRepo.UpdateTaken(ctx, employeeID, year, totalTaken)
```

#### 3. Wire empDayPlanRepo in main.go
**File**: `apps/api/cmd/server/main.go`
**Changes**: Add one line after the `vacationService := service.NewVacationService(...)` call (around line ~169)

After the `vacationService` construction, add:
```go
vacationService.SetEmpDayPlanRepo(empDayPlanRepo)
```

#### 4. Remove TODO Comment in daily_calc.go
**File**: `apps/api/internal/service/daily_calc.go`
**Changes**: Remove the TODO comment block (lines 135-138)

Remove:
```go
// TODO(ZMI-TICKET-006): Verify vacation deduction integration.
// The VacationDeduction field on the day plan should be used by the absence
// service when deducting vacation balance. Verify this integration when
// absence workflow tickets are implemented.
```

### Success Criteria:

#### Automated Verification:
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] Existing tests pass: `cd apps/api && go test ./internal/service/...`
- [ ] Lint passes: `cd apps/api && golangci-lint run ./...`

**Implementation Note**: Existing tests for `RecalculateTaken` will need updates in Phase 4 (test phase). They may fail until mocks are updated. Proceed to Phase 3 after verifying compilation.

---

## Phase 3: AbsenceService - Trigger Vacation Recalculation

### Overview
Add a `vacationRecalculator` interface to `AbsenceService` and call it from `Approve()`, `Delete()`, and a new `Cancel()` method when the absence type deducts vacation.

### Changes Required:

#### 1. Add Vacation Recalculator Interface
**File**: `apps/api/internal/service/absence.go`
**Changes**: Add interface and field to AbsenceService

Add interface definition (after line ~71, near the other interface definitions):
```go
// vacationRecalculator defines the interface for triggering vacation balance recalculation.
type vacationRecalculator interface {
	RecalculateTaken(ctx context.Context, employeeID uuid.UUID, year int) error
}
```

Add field to `AbsenceService` struct:
```go
type AbsenceService struct {
	absenceDayRepo  absenceDayRepositoryForService
	absenceTypeRepo absenceTypeRepositoryForService
	holidayRepo     holidayRepositoryForAbsence
	empDayPlanRepo  empDayPlanRepositoryForAbsence
	recalcSvc       recalcServiceForAbsence
	notificationSvc *NotificationService
	vacationSvc     vacationRecalculator // NEW
}
```

Add setter method (after `SetNotificationService`, following the same pattern):
```go
// SetVacationService sets the vacation service for vacation balance recalculation on absence changes.
func (s *AbsenceService) SetVacationService(vacationSvc vacationRecalculator) {
	s.vacationSvc = vacationSvc
}
```

#### 2. Add Helper Method for Vacation Recalculation
**File**: `apps/api/internal/service/absence.go`
**Changes**: Add private helper method (near the bottom of the file, before the helper functions)

```go
// recalculateVacationIfNeeded triggers vacation balance recalculation when an absence
// with a vacation-deducting type changes status. This handles both approval (increasing taken)
// and cancellation/deletion (decreasing taken) via the idempotent RecalculateTaken method.
func (s *AbsenceService) recalculateVacationIfNeeded(ctx context.Context, ad *model.AbsenceDay) {
	if s.vacationSvc == nil {
		return
	}
	if ad.AbsenceType == nil {
		// Try to load absence type if not preloaded
		at, err := s.absenceTypeRepo.GetByID(ctx, ad.AbsenceTypeID)
		if err != nil {
			return
		}
		ad.AbsenceType = at
	}
	if !ad.AbsenceType.DeductsVacation {
		return
	}
	year := ad.AbsenceDate.Year()
	_ = s.vacationSvc.RecalculateTaken(ctx, ad.EmployeeID, year)
}
```

#### 3. Modify Approve to Trigger Vacation Recalculation
**File**: `apps/api/internal/service/absence.go`
**Changes**: Add vacation recalculation call in `Approve()` method, after the recalc trigger (line ~180)

After the existing line:
```go
_, _ = s.recalcSvc.TriggerRecalc(ctx, ad.TenantID, ad.EmployeeID, ad.AbsenceDate)
```

Add:
```go
// Recalculate vacation balance if this is a vacation-deducting absence type
s.recalculateVacationIfNeeded(ctx, ad)
```

#### 4. Modify Delete to Trigger Vacation Recalculation for Approved Absences
**File**: `apps/api/internal/service/absence.go`
**Changes**: In `Delete()` method, save the absence status and type info before deletion, then trigger recalc

The current `Delete()` saves `tenantID`, `employeeID`, `absenceDate` before deletion. We also need to save the full absence record (which includes AbsenceType since GetByID preloads it):

After `absenceDate := ad.AbsenceDate` (line ~230), add:
```go
wasApproved := ad.Status == model.AbsenceStatusApproved
```

After the existing recalc trigger line (`_, _ = s.recalcSvc.TriggerRecalc(...)`), add:
```go
// Recalculate vacation balance if the deleted absence was approved and deducted vacation
if wasApproved {
	s.recalculateVacationIfNeeded(ctx, ad)
}
```

#### 5. Add Cancel Method
**File**: `apps/api/internal/service/absence.go`
**Changes**: Add new `Cancel()` method (after the `Reject()` method, around line ~217)

```go
// Cancel transitions an approved absence to cancelled status.
// This reverses the absence effect: triggers daily recalculation and vacation balance recalculation.
func (s *AbsenceService) Cancel(ctx context.Context, id uuid.UUID) (*model.AbsenceDay, error) {
	ad, err := s.absenceDayRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrAbsenceNotFound
	}

	if ad.Status != model.AbsenceStatusApproved {
		return nil, ErrAbsenceNotApproved
	}

	ad.Status = model.AbsenceStatusCancelled

	if err := s.absenceDayRepo.Update(ctx, ad); err != nil {
		return nil, err
	}

	// Trigger recalculation for the affected date
	_, _ = s.recalcSvc.TriggerRecalc(ctx, ad.TenantID, ad.EmployeeID, ad.AbsenceDate)

	// Recalculate vacation balance (reverses the deduction)
	s.recalculateVacationIfNeeded(ctx, ad)

	// Notify employee about cancellation
	s.notifyAbsenceDecision(ctx, ad, model.AbsenceStatusCancelled)

	return ad, nil
}
```

Add the new error variable (near the other error definitions at the top of the file):
```go
ErrAbsenceNotApproved = errors.New("absence is not in approved status")
```

#### 6. Update notifyAbsenceDecision to Handle Cancellation
**File**: `apps/api/internal/service/absence.go`
**Changes**: Add cancellation case in `notifyAbsenceDecision()` (around line ~442-453)

Add a new case before the `return` in the if/else chain:
```go
} else if status == model.AbsenceStatusCancelled {
	title = "Absence cancelled"
	message = fmt.Sprintf("%s on %s was cancelled.", absenceTypeName, dateLabel)
```

#### 7. Add Cancel Handler Endpoint
**File**: `apps/api/internal/handler/absence.go`
**Changes**: Add `Cancel` handler method (after the `Reject` method)

```go
// Cancel handles POST /absences/{id}/cancel
func (h *AbsenceHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid absence ID")
		return
	}

	if _, err := h.ensureAbsenceScope(r.Context(), id); err != nil {
		if errors.Is(err, service.ErrAbsenceNotFound) {
			respondError(w, http.StatusNotFound, "Absence not found")
			return
		}
		if errors.Is(err, service.ErrEmployeeNotFound) {
			respondError(w, http.StatusNotFound, "Employee not found")
			return
		}
		if errors.Is(err, errAbsenceScopeDenied) {
			respondError(w, http.StatusForbidden, "Permission denied")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to verify access")
		return
	}

	ad, svcErr := h.absenceService.Cancel(r.Context(), id)
	if svcErr != nil {
		switch svcErr {
		case service.ErrAbsenceNotFound:
			respondError(w, http.StatusNotFound, "Absence not found")
		case service.ErrAbsenceNotApproved:
			respondError(w, http.StatusBadRequest, "Absence is not in approved status")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to cancel absence")
		}
		return
	}

	// Audit log
	if h.auditService != nil {
		if tenantID, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tenantID,
				Action:     model.AuditActionUpdate,
				EntityType: "absence",
				EntityID:   id,
			})
		}
	}

	respondJSON(w, http.StatusOK, h.absenceDayToResponse(ad))
}
```

#### 8. Register Cancel Route
**File**: `apps/api/internal/handler/routes.go`
**Changes**: Add cancel route in `RegisterAbsenceRoutes` (near the existing approve/reject routes)

Find the existing absence route registrations. After the line for `POST /absences/{id}/reject`, add:
```go
r.Post("/absences/{id}/cancel", absenceHandler.Cancel)
```

#### 9. Wire VacationService into AbsenceService in main.go
**File**: `apps/api/cmd/server/main.go`
**Changes**: After the `absenceService` is created and the vacationService is created, wire them together

Find the line `absenceService.SetNotificationService(notificationService)` (around line ~410) and add after it:
```go
absenceService.SetVacationService(vacationService)
```

### Success Criteria:

#### Automated Verification:
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] Lint passes: `cd apps/api && golangci-lint run ./...`

**Implementation Note**: Compilation should succeed. Tests will be updated in Phase 4. Proceed to Phase 4.

---

## Phase 4: Tests

### Overview
Update existing tests and add new tests covering the weighted vacation deduction logic, absence approval with vacation recalculation, and absence cancellation.

### Changes Required:

#### 1. Update Vacation Service Test Mocks
**File**: `apps/api/internal/service/vacation_test.go`
**Changes**: Update `mockAbsenceDayRepoForVacation` to implement the new `ListApprovedByTypeInRange` method, and add a new `mockEmpDayPlanRepoForVacation` mock

Add to `mockAbsenceDayRepoForVacation`:
```go
func (m *mockAbsenceDayRepoForVacation) ListApprovedByTypeInRange(ctx context.Context, employeeID, typeID uuid.UUID, from, to time.Time) ([]model.AbsenceDay, error) {
	args := m.Called(ctx, employeeID, typeID, from, to)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.AbsenceDay), args.Error(1)
}
```

Add new mock for empDayPlanRepo:
```go
type mockEmpDayPlanRepoForVacation struct {
	mock.Mock
}

func (m *mockEmpDayPlanRepoForVacation) GetForEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.EmployeeDayPlan, error) {
	args := m.Called(ctx, employeeID, from, to)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.EmployeeDayPlan), args.Error(1)
}
```

Update `newTestVacationService` to return the new mock and wire it:
```go
func newTestVacationService(maxCarryover decimal.Decimal) (
	*VacationService,
	*mockVacationBalanceRepoForVacation,
	*mockAbsenceDayRepoForVacation,
	*mockAbsenceTypeRepoForVacation,
	*mockEmployeeRepoForVacation,
	*mockTenantRepoForVacation,
	*mockTariffRepoForVacation,
	*mockEmpDayPlanRepoForVacation,
) {
	vacBalanceRepo := new(mockVacationBalanceRepoForVacation)
	absenceDayRepo := new(mockAbsenceDayRepoForVacation)
	absenceTypeRepo := new(mockAbsenceTypeRepoForVacation)
	employeeRepo := new(mockEmployeeRepoForVacation)
	tenantRepo := new(mockTenantRepoForVacation)
	tariffRepo := new(mockTariffRepoForVacation)
	empDayPlanRepo := new(mockEmpDayPlanRepoForVacation)

	svc := NewVacationService(
		vacBalanceRepo,
		absenceDayRepo,
		absenceTypeRepo,
		employeeRepo,
		tenantRepo,
		tariffRepo,
		nil, // employmentTypeRepo
		nil, // vacationCalcGroupRepo
		maxCarryover,
	)
	svc.SetEmpDayPlanRepo(empDayPlanRepo)
	return svc, vacBalanceRepo, absenceDayRepo, absenceTypeRepo, employeeRepo, tenantRepo, tariffRepo, empDayPlanRepo
}
```

**Note**: All existing test functions that call `newTestVacationService` must be updated to accept the new 8th return value. In most cases, add `_` for the unused mock: e.g., `svc, vacBalanceRepo, _, _, _, _, _ := newTestVacationService(...)` becomes `svc, vacBalanceRepo, _, _, _, _, _, _ := newTestVacationService(...)`.

#### 2. Update Existing RecalculateTaken Test
**File**: `apps/api/internal/service/vacation_test.go`
**Changes**: Update `TestVacationService_RecalculateTaken_Success` to use the new weighted deduction logic

The existing test uses `CountByTypeInRange` which returns a SUM. The new logic uses `ListApprovedByTypeInRange` which returns individual records, plus day plan lookup.

Replace the test:
```go
func TestVacationService_RecalculateTaken_Success(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, absenceDayRepo, absenceTypeRepo, employeeRepo, _, _, empDayPlanRepo := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	tenantID := uuid.New()
	dayPlanID := uuid.New()

	employee := &model.Employee{ID: employeeID, TenantID: tenantID}
	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)

	vacTypeID := uuid.New()
	specialTypeID := uuid.New()
	nonVacTypeID := uuid.New()

	absenceTypeRepo.On("List", ctx, tenantID, true).Return([]model.AbsenceType{
		{ID: vacTypeID, DeductsVacation: true},
		{ID: specialTypeID, DeductsVacation: true},
		{ID: nonVacTypeID, DeductsVacation: false},
	}, nil)

	yearStart := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	yearEnd := time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC)

	jan10 := time.Date(2026, 1, 10, 0, 0, 0, 0, time.UTC)
	jan11 := time.Date(2026, 1, 11, 0, 0, 0, 0, time.UTC)
	feb5 := time.Date(2026, 2, 5, 0, 0, 0, 0, time.UTC)

	// Vacation type: 2 full days + 1 half day
	absenceDayRepo.On("ListApprovedByTypeInRange", ctx, employeeID, vacTypeID, yearStart, yearEnd).
		Return([]model.AbsenceDay{
			{AbsenceDate: jan10, Duration: decimal.NewFromInt(1)},
			{AbsenceDate: jan11, Duration: decimal.NewFromFloat(0.5)},
		}, nil)

	// Special type: 1 full day
	absenceDayRepo.On("ListApprovedByTypeInRange", ctx, employeeID, specialTypeID, yearStart, yearEnd).
		Return([]model.AbsenceDay{
			{AbsenceDate: feb5, Duration: decimal.NewFromInt(1)},
		}, nil)

	// Day plans: Jan 10 has vacation_deduction=0.75, Jan 11 has default 1.0, Feb 5 has 1.0
	empDayPlanRepo.On("GetForEmployeeDateRange", ctx, employeeID, yearStart, yearEnd).
		Return([]model.EmployeeDayPlan{
			{PlanDate: jan10, DayPlan: &model.DayPlan{ID: dayPlanID, VacationDeduction: decimal.NewFromFloat(0.75)}},
			{PlanDate: jan11, DayPlan: &model.DayPlan{ID: dayPlanID, VacationDeduction: decimal.NewFromInt(1)}},
			{PlanDate: feb5, DayPlan: &model.DayPlan{ID: dayPlanID, VacationDeduction: decimal.NewFromInt(1)}},
		}, nil)

	// Expected: 0.75*1.0 + 1.0*0.5 + 1.0*1.0 = 0.75 + 0.5 + 1.0 = 2.25
	vacBalanceRepo.On("UpdateTaken", ctx, employeeID, 2026, decimal.NewFromFloat(2.25)).Return(nil)

	err := svc.RecalculateTaken(ctx, employeeID, 2026)

	require.NoError(t, err)
	vacBalanceRepo.AssertExpectations(t)
	absenceDayRepo.AssertExpectations(t)
	empDayPlanRepo.AssertExpectations(t)
}
```

#### 3. Update NoVacationTypes Test
**File**: `apps/api/internal/service/vacation_test.go`
**Changes**: Update `TestVacationService_RecalculateTaken_NoVacationTypes` to add empDayPlanRepo expectation

```go
func TestVacationService_RecalculateTaken_NoVacationTypes(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, _, absenceTypeRepo, employeeRepo, _, _, empDayPlanRepo := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	tenantID := uuid.New()

	employee := &model.Employee{ID: employeeID, TenantID: tenantID}
	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)

	absenceTypeRepo.On("List", ctx, tenantID, true).Return([]model.AbsenceType{
		{ID: uuid.New(), DeductsVacation: false},
	}, nil)

	yearStart := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	yearEnd := time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC)
	empDayPlanRepo.On("GetForEmployeeDateRange", ctx, employeeID, yearStart, yearEnd).
		Return([]model.EmployeeDayPlan{}, nil)

	vacBalanceRepo.On("UpdateTaken", ctx, employeeID, 2026, decimal.Zero).Return(nil)

	err := svc.RecalculateTaken(ctx, employeeID, 2026)

	require.NoError(t, err)
	vacBalanceRepo.AssertExpectations(t)
}
```

#### 4. Add New Test: Weighted Deduction with No Day Plan (Fallback)
**File**: `apps/api/internal/service/vacation_test.go`
**Changes**: Add test for fallback behavior when no day plan exists

```go
func TestVacationService_RecalculateTaken_NoDayPlanFallback(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, absenceDayRepo, absenceTypeRepo, employeeRepo, _, _, empDayPlanRepo := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	tenantID := uuid.New()

	employee := &model.Employee{ID: employeeID, TenantID: tenantID}
	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)

	vacTypeID := uuid.New()
	absenceTypeRepo.On("List", ctx, tenantID, true).Return([]model.AbsenceType{
		{ID: vacTypeID, DeductsVacation: true},
	}, nil)

	yearStart := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	yearEnd := time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC)
	jan10 := time.Date(2026, 1, 10, 0, 0, 0, 0, time.UTC)

	absenceDayRepo.On("ListApprovedByTypeInRange", ctx, employeeID, vacTypeID, yearStart, yearEnd).
		Return([]model.AbsenceDay{
			{AbsenceDate: jan10, Duration: decimal.NewFromInt(1)},
		}, nil)

	// No day plans at all -> fallback to 1.0
	empDayPlanRepo.On("GetForEmployeeDateRange", ctx, employeeID, yearStart, yearEnd).
		Return([]model.EmployeeDayPlan{}, nil)

	// Expected: 1.0 * 1.0 = 1.0 (fallback)
	vacBalanceRepo.On("UpdateTaken", ctx, employeeID, 2026, decimal.NewFromInt(1)).Return(nil)

	err := svc.RecalculateTaken(ctx, employeeID, 2026)

	require.NoError(t, err)
	vacBalanceRepo.AssertExpectations(t)
}
```

#### 5. Add New Test: Half Day with Custom VacationDeduction
**File**: `apps/api/internal/service/vacation_test.go`
**Changes**: Add test for half-day absence with custom vacation_deduction

```go
func TestVacationService_RecalculateTaken_HalfDayCustomDeduction(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, absenceDayRepo, absenceTypeRepo, employeeRepo, _, _, empDayPlanRepo := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	tenantID := uuid.New()
	dayPlanID := uuid.New()

	employee := &model.Employee{ID: employeeID, TenantID: tenantID}
	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)

	vacTypeID := uuid.New()
	absenceTypeRepo.On("List", ctx, tenantID, true).Return([]model.AbsenceType{
		{ID: vacTypeID, DeductsVacation: true},
	}, nil)

	yearStart := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	yearEnd := time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC)
	jan10 := time.Date(2026, 1, 10, 0, 0, 0, 0, time.UTC)

	// Half day absence
	absenceDayRepo.On("ListApprovedByTypeInRange", ctx, employeeID, vacTypeID, yearStart, yearEnd).
		Return([]model.AbsenceDay{
			{AbsenceDate: jan10, Duration: decimal.NewFromFloat(0.5)},
		}, nil)

	// Day plan with vacation_deduction=0.8
	empDayPlanRepo.On("GetForEmployeeDateRange", ctx, employeeID, yearStart, yearEnd).
		Return([]model.EmployeeDayPlan{
			{PlanDate: jan10, DayPlan: &model.DayPlan{ID: dayPlanID, VacationDeduction: decimal.NewFromFloat(0.8)}},
		}, nil)

	// Expected: 0.8 * 0.5 = 0.4
	vacBalanceRepo.On("UpdateTaken", ctx, employeeID, 2026, decimal.NewFromFloat(0.4)).Return(nil)

	err := svc.RecalculateTaken(ctx, employeeID, 2026)

	require.NoError(t, err)
	vacBalanceRepo.AssertExpectations(t)
}
```

#### 6. Add Absence Service Approve Test with Vacation Recalculation
**File**: `apps/api/internal/service/absence_test.go`
**Changes**: Add tests for the Approve method, verifying vacation recalculation is triggered

Add a `mockVacationRecalculator` mock:
```go
type mockVacationRecalculator struct {
	mock.Mock
}

func (m *mockVacationRecalculator) RecalculateTaken(ctx context.Context, employeeID uuid.UUID, year int) error {
	args := m.Called(ctx, employeeID, year)
	return args.Error(0)
}
```

Add test:
```go
func TestAbsenceService_Approve_TriggersVacationRecalc(t *testing.T) {
	ctx := context.Background()
	absenceDayRepo := new(mockAbsenceDayRepositoryForService)
	absenceTypeRepo := new(mockAbsenceTypeRepositoryForService)
	recalcSvc := new(mockRecalcServiceForAbsence)
	vacationSvc := new(mockVacationRecalculator)

	svc := NewAbsenceService(absenceDayRepo, absenceTypeRepo, nil, nil, recalcSvc)
	svc.SetVacationService(vacationSvc)

	absenceID := uuid.New()
	employeeID := uuid.New()
	tenantID := uuid.New()
	typeID := uuid.New()
	approverID := uuid.New()
	date := time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC)

	ad := &model.AbsenceDay{
		ID:            absenceID,
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		AbsenceDate:   date,
		AbsenceTypeID: typeID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusPending,
		AbsenceType:   &model.AbsenceType{ID: typeID, DeductsVacation: true},
	}

	absenceDayRepo.On("GetByID", ctx, absenceID).Return(ad, nil)
	absenceDayRepo.On("Update", ctx, mock.Anything).Return(nil)
	recalcSvc.On("TriggerRecalc", ctx, tenantID, employeeID, date).Return(nil, nil)
	vacationSvc.On("RecalculateTaken", ctx, employeeID, 2026).Return(nil)

	result, err := svc.Approve(ctx, absenceID, approverID)

	require.NoError(t, err)
	assert.Equal(t, model.AbsenceStatusApproved, result.Status)
	vacationSvc.AssertCalled(t, "RecalculateTaken", ctx, employeeID, 2026)
}

func TestAbsenceService_Approve_NoVacationRecalcForNonVacationType(t *testing.T) {
	ctx := context.Background()
	absenceDayRepo := new(mockAbsenceDayRepositoryForService)
	absenceTypeRepo := new(mockAbsenceTypeRepositoryForService)
	recalcSvc := new(mockRecalcServiceForAbsence)
	vacationSvc := new(mockVacationRecalculator)

	svc := NewAbsenceService(absenceDayRepo, absenceTypeRepo, nil, nil, recalcSvc)
	svc.SetVacationService(vacationSvc)

	absenceID := uuid.New()
	employeeID := uuid.New()
	tenantID := uuid.New()
	typeID := uuid.New()
	approverID := uuid.New()
	date := time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC)

	ad := &model.AbsenceDay{
		ID:            absenceID,
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		AbsenceDate:   date,
		AbsenceTypeID: typeID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusPending,
		AbsenceType:   &model.AbsenceType{ID: typeID, DeductsVacation: false}, // Illness, not vacation
	}

	absenceDayRepo.On("GetByID", ctx, absenceID).Return(ad, nil)
	absenceDayRepo.On("Update", ctx, mock.Anything).Return(nil)
	recalcSvc.On("TriggerRecalc", ctx, tenantID, employeeID, date).Return(nil, nil)

	result, err := svc.Approve(ctx, absenceID, approverID)

	require.NoError(t, err)
	assert.Equal(t, model.AbsenceStatusApproved, result.Status)
	// RecalculateTaken should NOT be called for non-vacation types
	vacationSvc.AssertNotCalled(t, "RecalculateTaken")
}
```

#### 7. Add Absence Service Cancel Test
**File**: `apps/api/internal/service/absence_test.go`
**Changes**: Add tests for the new Cancel method

```go
func TestAbsenceService_Cancel_Success(t *testing.T) {
	ctx := context.Background()
	absenceDayRepo := new(mockAbsenceDayRepositoryForService)
	absenceTypeRepo := new(mockAbsenceTypeRepositoryForService)
	recalcSvc := new(mockRecalcServiceForAbsence)
	vacationSvc := new(mockVacationRecalculator)

	svc := NewAbsenceService(absenceDayRepo, absenceTypeRepo, nil, nil, recalcSvc)
	svc.SetVacationService(vacationSvc)

	absenceID := uuid.New()
	employeeID := uuid.New()
	tenantID := uuid.New()
	typeID := uuid.New()
	date := time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC)

	ad := &model.AbsenceDay{
		ID:            absenceID,
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		AbsenceDate:   date,
		AbsenceTypeID: typeID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusApproved,
		AbsenceType:   &model.AbsenceType{ID: typeID, DeductsVacation: true},
	}

	absenceDayRepo.On("GetByID", ctx, absenceID).Return(ad, nil)
	absenceDayRepo.On("Update", ctx, mock.Anything).Return(nil)
	recalcSvc.On("TriggerRecalc", ctx, tenantID, employeeID, date).Return(nil, nil)
	vacationSvc.On("RecalculateTaken", ctx, employeeID, 2026).Return(nil)

	result, err := svc.Cancel(ctx, absenceID)

	require.NoError(t, err)
	assert.Equal(t, model.AbsenceStatusCancelled, result.Status)
	vacationSvc.AssertCalled(t, "RecalculateTaken", ctx, employeeID, 2026)
}

func TestAbsenceService_Cancel_NotApproved(t *testing.T) {
	ctx := context.Background()
	absenceDayRepo := new(mockAbsenceDayRepositoryForService)
	recalcSvc := new(mockRecalcServiceForAbsence)

	svc := NewAbsenceService(absenceDayRepo, nil, nil, nil, recalcSvc)

	absenceID := uuid.New()
	ad := &model.AbsenceDay{
		ID:     absenceID,
		Status: model.AbsenceStatusPending,
	}

	absenceDayRepo.On("GetByID", ctx, absenceID).Return(ad, nil)

	_, err := svc.Cancel(ctx, absenceID)

	assert.ErrorIs(t, err, ErrAbsenceNotApproved)
}

func TestAbsenceService_Cancel_NotFound(t *testing.T) {
	ctx := context.Background()
	absenceDayRepo := new(mockAbsenceDayRepositoryForService)
	recalcSvc := new(mockRecalcServiceForAbsence)

	svc := NewAbsenceService(absenceDayRepo, nil, nil, nil, recalcSvc)

	absenceID := uuid.New()
	absenceDayRepo.On("GetByID", ctx, absenceID).Return(nil, errors.New("not found"))

	_, err := svc.Cancel(ctx, absenceID)

	assert.ErrorIs(t, err, ErrAbsenceNotFound)
}
```

### Success Criteria:

#### Automated Verification:
- [ ] All tests pass: `cd apps/api && go test -v -run TestVacation ./internal/service/...`
- [ ] All tests pass: `cd apps/api && go test -v -run TestAbsence ./internal/service/...`
- [ ] Full test suite passes: `make test`
- [ ] Lint passes: `make lint`

**Implementation Note**: After completing this phase and all automated verification passes, the implementation is complete.

---

## Testing Strategy

### Unit Tests:

**Vacation Service (`vacation_test.go`)**:
- Weighted deduction with custom `vacation_deduction` values (0.75, 0.8, etc.)
- Fallback to 1.0 when no day plan exists for a date
- Half-day absence with custom deduction (0.8 * 0.5 = 0.4)
- Multiple absence types with different deductions
- No vacation types case (total = 0)
- Employee not found, invalid year (existing tests updated)

**Absence Service (`absence_test.go`)**:
- Approve triggers `RecalculateTaken` when `DeductsVacation=true`
- Approve does NOT trigger `RecalculateTaken` when `DeductsVacation=false`
- Cancel transitions approved -> cancelled and triggers `RecalculateTaken`
- Cancel rejects non-approved absence
- Cancel not found
- Delete of approved vacation absence triggers `RecalculateTaken`

### Key Edge Cases:
- Day plan exists but `DayPlanID` is nil (off day) -- should not happen for approved absences since absence creation skips off days, but if it does, falls back to default 1.0
- `vacation_deduction = 0` on the day plan (valid: no deduction for this day)
- `empDayPlanRepo` is nil (graceful fallback, all dates use default 1.0)
- Absence spans two years (each date gets its own year for `RecalculateTaken`)

## Performance Considerations

- **Batch day plan fetch**: `GetForEmployeeDateRange` fetches all day plans for the entire year in one query, avoiding N+1 lookups per absence date.
- **`ListApprovedByTypeInRange`** uses a simple WHERE query without joins. For employees with many absences, this is efficient (typically < 30 records per type per year).
- `RecalculateTaken` is called once per approval/cancellation/deletion event (not per individual day). For range operations, the caller could batch by year.

## Migration Notes

- **No database migration required** -- the `vacation_deduction` column already exists on `day_plans` with default 1.00.
- **Backward compatibility**: Existing data is unaffected. All existing day plans have `vacation_deduction = 1.00`, so `RecalculateTaken` will produce the same results as before for existing data.
- **Existing `CountByTypeInRange`** is kept (not removed) as it may be used elsewhere or useful for reporting. The interface retains both methods.

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-037-vacation-deduction-by-day-plan.md`
- Research: `thoughts/shared/research/2026-01-31-ZMI-TICKET-037-vacation-deduction-by-day-plan.md`
- DayPlan VacationDeduction field: `apps/api/internal/model/dayplan.go:104`
- VacationService RecalculateTaken: `apps/api/internal/service/vacation.go:354-396`
- AbsenceService Approve: `apps/api/internal/service/absence.go:160-186`
- TODO comment to remove: `apps/api/internal/service/daily_calc.go:135-138`

## File Change Summary

| File | Action | Description |
|---|---|---|
| `apps/api/internal/repository/absenceday.go` | Modify | Add `ListApprovedByTypeInRange` method |
| `apps/api/internal/service/vacation.go` | Modify | Add `empDayPlanRepoForVacation` interface, `empDayPlanRepo` field, `SetEmpDayPlanRepo` setter; rewrite `RecalculateTaken` for weighted deductions |
| `apps/api/internal/service/absence.go` | Modify | Add `vacationRecalculator` interface, `vacationSvc` field, `SetVacationService` setter, `recalculateVacationIfNeeded` helper, `Cancel` method, `ErrAbsenceNotApproved` error; update `Approve`, `Delete`, `notifyAbsenceDecision` |
| `apps/api/internal/handler/absence.go` | Modify | Add `Cancel` handler method |
| `apps/api/internal/handler/routes.go` | Modify | Add `POST /absences/{id}/cancel` route |
| `apps/api/cmd/server/main.go` | Modify | Wire `empDayPlanRepo` into `VacationService`, wire `vacationService` into `AbsenceService` |
| `apps/api/internal/service/daily_calc.go` | Modify | Remove TODO comment (lines 135-138) |
| `apps/api/internal/service/vacation_test.go` | Modify | Update mocks, update existing tests, add weighted deduction tests |
| `apps/api/internal/service/absence_test.go` | Modify | Add `mockVacationRecalculator`, add Approve/Cancel tests |
