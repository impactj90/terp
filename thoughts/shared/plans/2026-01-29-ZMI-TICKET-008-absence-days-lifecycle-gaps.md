# ZMI-TICKET-008: Absence Days Lifecycle — Gap Closure Plan

## Overview

Close the remaining gaps in the absence day system to fully satisfy ZMI-TICKET-008. The absence day lifecycle (CRUD, range operations, approval workflow, daily calculation integration, vacation balance) is substantially implemented. Three gaps remain:

1. **Holiday conflict resolution** — Absences are always skipped on holidays, but ZMI spec requires priority-based resolution
2. **Audit log completeness** — Approve/reject/update operations not logged to `audit_logs`
3. **PATCH endpoint** — Defined in OpenAPI but not implemented

## Current State Analysis

The absence system spans 6 core files with ~1800 lines of code:
- `model/absenceday.go` (111 lines), `model/absencetype.go` (113 lines)
- `repository/absenceday.go` (207 lines)
- `service/absence.go` (622 lines)
- `handler/absence.go` (902 lines)
- `handler/routes.go:477-521` (route registration)

### Key Discoveries:
- `shouldSkipDate()` at `service/absence.go:456-487` unconditionally skips holidays (line 472)
- `AbsenceType.Priority` (int) and `HolidayCode` (*string) fields exist but are never used in conflict resolution
- `AbsenceType.GetEffectiveCode(isHoliday)` at `model/absencetype.go:96-102` exists but is never called
- `CalculateDay()` at `service/daily_calc.go:132-193` handles holidays at line 161-163 but has no absence+holiday overlap logic
- `AuditActionApprove` and `AuditActionReject` constants exist at `model/auditlog.go:16-17` but are unused
- `UpdateAbsenceRequest` schema defined at `api/schemas/absences.yaml:124-138` and PATCH route at `api/paths/absences.yaml:71-97`
- No `Update` service method for absence days exists (only status transitions via approve/reject)

## Desired End State

1. Absences **can be created on holidays** — `shouldSkipDate()` no longer blocks holidays
2. `CalculateDay()` resolves holiday+absence overlap using `AbsenceType.Priority` vs holiday category
3. All absence lifecycle operations (create, update, approve, reject, delete) write `audit_logs` entries
4. `PATCH /absences/{id}` updates duration and notes, with audit logging
5. Tests cover all new behaviors

### Verification:
- `make test` passes with new unit tests for priority resolution, audit logging, and PATCH handler
- `make lint` passes
- `make swagger-bundle && make generate` succeeds with any spec changes
- Manual: create absence on holiday date, verify priority resolution in daily calc

## What We're NOT Doing

- **ZMI-TICKET-013 (Absence Calculation Rules)**: The `value * factor` account computation system is a separate ticket
- **VacationDeduction integration**: The `DayPlan.VacationDeduction` field integration belongs to ZMI-TICKET-013. The current simple duration sum in `VacationService.RecalculateTaken()` is correct for the default case (deduction=1.0)
- **GET /absences/{id} handler**: Not yet implemented but not in this ticket's scope (can be added trivially)
- **Frontend changes**: No UI work in this ticket

## Implementation Approach

Three independent phases that can be reviewed/merged separately. Phase 1 is the most complex (business logic change); Phases 2 and 3 are mechanical additions following existing patterns.

---

## Phase 1: Holiday Conflict Resolution

### Overview
Allow absences to be created on holidays. When both a holiday and an approved absence exist for the same date, use the absence type's `Priority` field to determine which credit calculation applies in daily calculation.

### ZMI Specification (Manual Section 18.2, Page 160)

> "Die Priorität gibt vor, welche Berechnung zum Tragen kommt, falls zusätzlich zum Feiertag ein Fehltag eingetragen ist."
> — *"The priority determines which calculation takes effect if an absence day is entered in addition to a holiday."*

Priority resolution logic:
- **Absence priority > 0**: Absence credit takes effect (vacation is deducted, absence code used)
- **Absence priority == 0** (default): Holiday credit takes effect (no vacation deduction, holiday treatment)
- `GetEffectiveCode(isHoliday)` returns `HolidayCode` when on a holiday, for reporting

### Changes Required:

#### 1. Remove holiday skip from absence creation
**File**: `apps/api/internal/service/absence.go`

**Change at lines 471-474**: Remove the holiday skip from `shouldSkipDate()`. Instead, return the holiday info so callers know the date is a holiday (useful for response metadata).

```go
// shouldSkipDate determines whether to skip creating an absence on this date.
// Skips: weekends, off-days (no plan or DayPlanID == nil).
// Does NOT skip holidays — absences are allowed on holidays per ZMI spec.
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

	// NOTE: Holidays are NOT skipped. Per ZMI spec (Section 18.2),
	// absences may be created on holidays. Priority-based resolution
	// happens in daily calculation (CalculateDay).

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
```

#### 2. Add priority-based resolution in daily calculation
**File**: `apps/api/internal/service/daily_calc.go`

**Change at lines 155-180**: Modify the special case handling in `CalculateDay()` to handle the holiday+absence overlap. Currently, line 161 checks `isHoliday && len(bookings) == 0` and always applies holiday credit. Add absence priority check.

```go
	// 4. Handle special cases
	var dailyValue *model.DailyValue

	if empDayPlan == nil || empDayPlan.DayPlanID == nil {
		// Off day - no day plan assigned
		dailyValue = s.handleOffDay(employeeID, date, bookings)
	} else if isHoliday && len(bookings) == 0 {
		// Holiday without bookings - check for absence with priority override
		absence, _ := s.absenceDayRepo.GetByEmployeeDate(ctx, employeeID, date)
		if absence != nil && absence.IsApproved() && absence.AbsenceType != nil && absence.AbsenceType.Priority > 0 {
			// Absence has priority > 0: use absence credit instead of holiday credit
			dailyValue = s.handleAbsenceCredit(ctx, employeeID, date, empDayPlan, absence)
		} else {
			// No absence or absence priority == 0: use holiday credit (existing behavior)
			dailyValue = s.handleHolidayCredit(ctx, employeeID, date, empDayPlan, holidayCategory)
		}
	} else if len(bookings) == 0 {
		// No bookings, no holiday - apply no-booking behavior
		dailyValue, err = s.handleNoBookings(ctx, employeeID, date, empDayPlan)
		if err != nil {
			return nil, err
		}
		if dailyValue == nil {
			return nil, nil
		}
	} else {
		// Normal calculation with bookings
		dailyValue, err = s.calculateWithBookings(ctx, employeeID, date, empDayPlan, bookings, isHoliday)
		if err != nil {
			return nil, err
		}
	}
```

#### 3. Add `handleAbsenceCredit` method
**File**: `apps/api/internal/service/daily_calc.go`

Add after `handleHolidayCredit` (after line 311):

```go
// handleAbsenceCredit processes a day where an approved absence overrides a holiday via priority.
// Uses the absence type's portion to calculate credit instead of holiday credit.
func (s *DailyCalcService) handleAbsenceCredit(
	ctx context.Context,
	employeeID uuid.UUID,
	date time.Time,
	empDayPlan *model.EmployeeDayPlan,
	absence *model.AbsenceDay,
) *model.DailyValue {
	now := time.Now()
	dv := &model.DailyValue{
		EmployeeID:   employeeID,
		ValueDate:    date,
		Status:       model.DailyValueStatusCalculated,
		CalculatedAt: &now,
		Warnings:     pq.StringArray{"ABSENCE_ON_HOLIDAY"},
	}

	targetTime := 0
	if empDayPlan != nil && empDayPlan.DayPlan != nil {
		targetTime = s.resolveTargetHours(ctx, employeeID, date, empDayPlan.DayPlan)
	}
	dv.TargetTime = targetTime

	// Use absence credit calculation: regelarbeitszeit * portion * duration
	credit := absence.CalculateCredit(targetTime)
	dv.NetTime = credit
	dv.GrossTime = credit
	if credit < targetTime {
		dv.Undertime = targetTime - credit
	}

	return dv
}
```

#### 4. Ensure `GetByEmployeeDate` preloads AbsenceType
**File**: `apps/api/internal/repository/absenceday.go`

Verify that `GetByEmployeeDate` (line ~55) already preloads `AbsenceType`. If not, add `.Preload("AbsenceType")`. The method is used in `resolveTargetHours` and now also in `CalculateDay` for priority checking.

Check the existing code — from the research, line 63 already excludes cancelled and the method preloads `AbsenceType` via `GetByID`. Verify `GetByEmployeeDate` also does this.

### Tests:

#### Unit tests to add/modify in `apps/api/internal/service/absence_test.go`:

**Modify** `TestAbsenceService_CreateRange_SkipsHolidays` (line 464):
- Rename to `TestAbsenceService_CreateRange_AllowsHolidays`
- Change expectation: holidays should NOT be skipped; absence records should be created on holiday dates

**Add** new test:
```
TestAbsenceService_CreateRange_IncludesHolidays
  - Input: date range Mon-Fri where Wed is a holiday
  - Expected: 5 absence days created (including Wed)
```

#### Unit tests in `apps/api/internal/service/daily_calc_test.go`:

**Add** tests for priority-based resolution:
```
TestDailyCalc_HolidayWithAbsence_PriorityZero
  - Setup: Holiday Cat 1, Approved absence with Priority=0
  - Expected: Holiday credit applied (existing behavior)

TestDailyCalc_HolidayWithAbsence_PriorityPositive
  - Setup: Holiday Cat 1, Approved absence with Priority=1
  - Expected: Absence credit applied (portion-based)

TestDailyCalc_HolidayWithAbsence_PendingAbsence
  - Setup: Holiday Cat 1, Pending absence with Priority=1
  - Expected: Holiday credit applied (only approved absences override)

TestDailyCalc_HolidayWithAbsence_HalfDay
  - Setup: Holiday Cat 1, Approved half-day absence with Priority=1
  - Expected: Absence credit = targetTime * portion * 0.5
```

### Success Criteria:

#### Automated Verification:
- [x] All existing tests pass: `cd apps/api && go test ./internal/service/...`
- [x] New absence creation test allows holidays: `go test -v -run TestAbsenceService_CreateRange_IncludesHolidays ./internal/service/...`
- [x] New daily calc priority tests pass: `go test -v -run TestCalculateDay_HolidayWithAbsence ./internal/service/...`
- [x] Lint passes: `make lint` (no new issues introduced)

#### Manual Verification:
- [ ] Create absence on a holiday date via API — succeeds
- [ ] Daily calculation for that date resolves correctly based on priority
- [ ] Vacation balance updates correctly when absence priority > 0 on a holiday

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Audit Log Completeness

### Overview
Add audit log entries for approve, reject, and (Phase 3) update operations. The existing audit pattern logs at the handler layer after successful service calls.

### Changes Required:

#### 1. Add audit logging for Approve
**File**: `apps/api/internal/handler/absence.go`

**Insert after line 436** (after `respondJSON` in `Approve`):

```go
	// Audit log
	if h.auditService != nil {
		if tenantID, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tenantID,
				Action:     model.AuditActionApprove,
				EntityType: "absence",
				EntityID:   id,
			})
		}
	}

	respondJSON(w, http.StatusOK, h.absenceDayToResponse(ad))
```

Note: Move `respondJSON` after the audit log call (matching the Create handler pattern where audit is logged before response at lines 230-243).

#### 2. Add audit logging for Reject
**File**: `apps/api/internal/handler/absence.go`

**Insert before the `respondJSON` in `Reject`** (before line 486):

```go
	// Audit log
	if h.auditService != nil {
		if tenantID, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tenantID,
				Action:     model.AuditActionReject,
				EntityType: "absence",
				EntityID:   id,
			})
		}
	}

	respondJSON(w, http.StatusOK, h.absenceDayToResponse(ad))
```

### Success Criteria:

#### Automated Verification:
- [x] Build succeeds: `cd apps/api && go build ./...`
- [x] Existing tests pass: `cd apps/api && go test ./internal/handler/...`
- [x] Lint passes: `make lint` (no new issues introduced)

#### Manual Verification:
- [ ] Approve an absence → `audit_logs` record created with action=`approve`
- [ ] Reject an absence → `audit_logs` record created with action=`reject`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: PATCH /absences/{id} — Update Endpoint

### Overview
Implement the `PATCH /absences/{id}` endpoint defined in the OpenAPI spec. Allows updating `duration`, `notes`, and `half_day_period` on a pending absence. Status transitions remain through approve/reject endpoints.

### Changes Required:

#### 1. Add `Update` service method
**File**: `apps/api/internal/service/absence.go`

Add after the `Delete` method (after line 241). Add new input type and method:

```go
// UpdateAbsenceInput defines the input for updating an absence day.
type UpdateAbsenceInput struct {
	Duration      *decimal.Decimal
	HalfDayPeriod *model.HalfDayPeriod
	Notes         *string
}

// Update modifies a pending absence day's editable fields.
// Only pending absences can be updated (approved/rejected cannot).
func (s *AbsenceService) Update(ctx context.Context, id uuid.UUID, input UpdateAbsenceInput) (*model.AbsenceDay, error) {
	ad, err := s.absenceDayRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrAbsenceNotFound
	}

	// Only pending absences can be edited
	if ad.Status != model.AbsenceStatusPending {
		return nil, ErrAbsenceNotPending
	}

	// Apply updates
	if input.Duration != nil {
		ad.Duration = *input.Duration
	}
	if input.HalfDayPeriod != nil {
		ad.HalfDayPeriod = input.HalfDayPeriod
	}
	if input.Notes != nil {
		ad.Notes = input.Notes
	}

	if err := s.absenceDayRepo.Update(ctx, ad); err != nil {
		return nil, err
	}

	// Trigger recalculation in case duration changed
	_, _ = s.recalcSvc.TriggerRecalc(ctx, ad.TenantID, ad.EmployeeID, ad.AbsenceDate)

	return ad, nil
}
```

#### 2. Add `UpdateAbsence` handler
**File**: `apps/api/internal/handler/absence.go`

Add a new handler method. Follow the pattern of existing handlers (scope check, decode, call service, audit, respond):

```go
// UpdateAbsence handles PATCH /absences/{id}
func (h *AbsenceHandler) UpdateAbsence(w http.ResponseWriter, r *http.Request) {
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

	var req models.UpdateAbsenceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	input := service.UpdateAbsenceInput{}
	if req.Duration != nil {
		d := decimal.NewFromFloat(*req.Duration)
		input.Duration = &d
	}
	if req.Notes != nil {
		input.Notes = req.Notes
	}

	ad, svcErr := h.absenceService.Update(r.Context(), id, input)
	if svcErr != nil {
		switch svcErr {
		case service.ErrAbsenceNotFound:
			respondError(w, http.StatusNotFound, "Absence not found")
		case service.ErrAbsenceNotPending:
			respondError(w, http.StatusBadRequest, "Only pending absences can be updated")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to update absence")
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

#### 3. Register the route
**File**: `apps/api/internal/handler/routes.go`

**Insert at lines 509-519** (in the absence CRUD section), add PATCH alongside DELETE:

```go
	// Absence list and CRUD
	if authz == nil {
		r.Get("/absences", h.ListAll)
		r.Patch("/absences/{id}", h.UpdateAbsence)   // NEW
		r.Delete("/absences/{id}", h.Delete)
		r.Post("/absences/{id}/approve", h.Approve)
		r.Post("/absences/{id}/reject", h.Reject)
	} else {
		r.With(authz.RequirePermission(managePerm)).Get("/absences", h.ListAll)
		r.With(authz.RequirePermission(managePerm)).Patch("/absences/{id}", h.UpdateAbsence)  // NEW
		r.With(authz.RequirePermission(managePerm)).Delete("/absences/{id}", h.Delete)
		r.With(authz.RequirePermission(approvePerm)).Post("/absences/{id}/approve", h.Approve)
		r.With(authz.RequirePermission(approvePerm)).Post("/absences/{id}/reject", h.Reject)
	}
```

### Tests:

#### Service tests in `apps/api/internal/service/absence_test.go`:

```
TestAbsenceService_Update_Success
  - Input: Pending absence, update duration to 0.5
  - Expected: Duration updated, recalc triggered

TestAbsenceService_Update_NotPending
  - Input: Approved absence, update duration
  - Expected: ErrAbsenceNotPending

TestAbsenceService_Update_NotFound
  - Input: Non-existent ID
  - Expected: ErrAbsenceNotFound

TestAbsenceService_Update_NotesOnly
  - Input: Pending absence, update notes only
  - Expected: Notes updated, duration unchanged
```

### Success Criteria:

#### Automated Verification:
- [x] Build succeeds: `cd apps/api && go build ./...`
- [x] New service tests pass: `go test -v -run TestAbsenceService_Update ./internal/service/...`
- [x] All existing tests pass: `cd apps/api && go test ./...`
- [x] Lint passes: `make lint` (no new issues introduced)
- [x] OpenAPI bundle succeeds: `make swagger-bundle`

#### Manual Verification:
- [ ] `PATCH /absences/{id}` with duration change → absence updated, audit log created
- [ ] `PATCH /absences/{id}` on approved absence → 400 error
- [ ] Swagger UI shows the PATCH endpoint correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation.

---

## Testing Strategy

### Unit Tests:
- Phase 1: Holiday conflict resolution (shouldSkipDate, CalculateDay priority resolution)
- Phase 3: Absence update service method

### Integration Tests (future):
- Daily calculation uses effective absence code and credits on holiday overlap
- Monthly evaluation counts absence days correctly with holiday overlaps
- Vacation balance updates correctly when absence on holiday with priority > 0

### Manual Testing Steps:
1. Create absence range including a holiday date → absence created on holiday
2. Set absence type priority=1, approve absence → daily calc uses absence credit
3. Set absence type priority=0, approve absence → daily calc uses holiday credit
4. Approve absence → audit_logs record exists with action=approve
5. Reject absence → audit_logs record exists with action=reject
6. PATCH pending absence with new duration → updated successfully
7. PATCH approved absence → returns 400

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-008-absence-days-lifecycle.md`
- Research document: `thoughts/shared/research/2026-01-29-ZMI-TICKET-008-absence-days-lifecycle.md`
- ZMI manual reference: `thoughts/shared/reference/zmi-calculation-manual-reference.md` (Section 15, 18.2)
- Related ticket: `thoughts/shared/tickets/ZMI-TICKET-013-absence-calculation-rules.md` (deferred VacationDeduction integration)
