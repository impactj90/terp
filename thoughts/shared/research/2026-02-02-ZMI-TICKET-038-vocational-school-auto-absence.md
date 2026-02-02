# Research: ZMI-TICKET-038 -- Auto-create Vocational School Absence on No Bookings

## 1. Current Implementation State

### Vocational School Case in handleNoBookings (lines 490-503)

File: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go`

The `handleNoBookings` method already has a `case model.NoBookingVocationalSchool:` branch (line 490). Currently it:
- Credits target time (NetTime = TargetTime, GrossTime = TargetTime)
- Emits warnings: `VOCATIONAL_SCHOOL` and `ABSENCE_CREATION_NOT_IMPLEMENTED`
- Does NOT create an absence day

```go
// lines 490-503
case model.NoBookingVocationalSchool:
    // ZMI: Berufsschule -- auto-create absence for past dates
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
```

### Existing Test (lines 722-750)

File: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc_test.go`

```go
func TestHandleNoBookings_VocationalSchool(t *testing.T) {
    // ...
    result, err := svc.handleNoBookings(ctx, employeeID, date, empDayPlan)
    require.NoError(t, err)
    require.NotNil(t, result)
    assert.Equal(t, 480, result.TargetTime)
    assert.Equal(t, 480, result.NetTime)
    assert.Equal(t, 480, result.GrossTime)
    assert.Contains(t, []string(result.Warnings), "VOCATIONAL_SCHOOL")
}
```

This test will need updating to verify absence creation and removal of the `ABSENCE_CREATION_NOT_IMPLEMENTED` warning.

---

## 2. Absence Type "SB" (Berufsschule)

### Migration Seed (production)

File: `/home/tolga/projects/terp/db/migrations/000025_create_absence_types.up.sql` (line 73)

```sql
(NULL::uuid, 'SB', 'Berufsschule', 'special', 1, false, true, '#64B5F6', 22),
```

Key attributes:
- Code: `SB`
- Category: `special`
- Portion: `1` (full Regelarbeitszeit credit)
- DeductsVacation: `false`
- IsSystem: `true`
- TenantID: `NULL` (system-level)

### Dev Seed (DISCREPANCY)

File: `/home/tolga/projects/terp/apps/api/internal/auth/devabsencetypes.go` (lines 91-101)

```go
{
    ID:              uuid.MustParse("00000000-0000-0000-0000-000000000307"),
    Code:            "BS",        // <-- DISCREPANCY: uses "BS" not "SB"
    Name:            "Berufsschule",
    Category:        "special",
    Portion:         1,
    DeductsVacation: false,
    Color:           "#3b82f6",
    SortOrder:       21,
},
```

**IMPORTANT**: The dev seed uses code `"BS"` while the migration seeds `"SB"`. The ticket specifies `"SB"`. The code should look up by the migration code `"SB"`. The dev seed discrepancy (`"BS"` vs `"SB"`) should be noted as a side fix or documented concern.

### AbsenceType Model

File: `/home/tolga/projects/terp/apps/api/internal/model/absencetype.go`

Key methods:
- `CreditMultiplier()` (line 81): Returns 1.0 for Portion=1 (full)
- `CalculateCredit(regelarbeitszeit int)` (line 96): Returns regelarbeitszeit * CreditMultiplier

### AbsenceType Repository -- GetByCode

File: `/home/tolga/projects/terp/apps/api/internal/repository/absencetype.go` (line 46)

```go
func (r *AbsenceTypeRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.AbsenceType, error) {
    var at model.AbsenceType
    err := r.db.GORM.WithContext(ctx).
        Where("(tenant_id = ? OR tenant_id IS NULL) AND code = ?", tenantID, code).
        Order("tenant_id DESC NULLS LAST").
        First(&at).Error
    // ...
}
```

This method finds an absence type by code, preferring tenant-specific over system types. This is the method to use for looking up "SB".

---

## 3. AbsenceDay Model and Repository

### AbsenceDay Model

File: `/home/tolga/projects/terp/apps/api/internal/model/absenceday.go`

Key fields:
- `TenantID`, `EmployeeID`, `AbsenceDate`, `AbsenceTypeID`
- `Duration` (decimal 1.00 = full day)
- `Status` (AbsenceStatus: pending/approved/rejected/cancelled)
- `ApprovedBy`, `ApprovedAt`
- `Notes`
- `CreatedBy`

Key methods:
- `IsApproved()` (line 90): Returns `Status == AbsenceStatusApproved`
- `CalculateCredit(regelarbeitszeit int)` (line 103): Uses AbsenceType.CreditMultiplier * duration

### AbsenceDay Repository

File: `/home/tolga/projects/terp/apps/api/internal/repository/absenceday.go`

Key methods needed for this ticket:
- `Create(ctx, *model.AbsenceDay) error` (line 29): Creates a new absence day
- `GetByEmployeeDate(ctx, employeeID, date) (*model.AbsenceDay, error)` (line 59): Returns nil/nil if none exists (non-cancelled only). This is the idempotency check.

---

## 4. Day Plan Model -- NoBookingBehavior

File: `/home/tolga/projects/terp/apps/api/internal/model/dayplan.go`

### Constants (lines 28-38)

```go
type NoBookingBehavior string

const (
    NoBookingError            NoBookingBehavior = "error"
    NoBookingDeductTarget     NoBookingBehavior = "deduct_target"
    NoBookingVocationalSchool NoBookingBehavior = "vocational_school"
    NoBookingAdoptTarget      NoBookingBehavior = "adopt_target"
    NoBookingTargetWithOrder  NoBookingBehavior = "target_with_order"
)
```

### DayPlan field (line 107)

```go
NoBookingBehavior NoBookingBehavior `gorm:"type:varchar(30);default:'error'" json:"no_booking_behavior"`
```

---

## 5. DailyCalcService Dependencies and Interfaces

File: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go`

### Current absenceDayLookup Interface (lines 55-58)

```go
type absenceDayLookup interface {
    GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.AbsenceDay, error)
}
```

This is a **read-only** interface. The implementation needs to **create** absence days, which requires expanding either:
1. This interface to add a `Create` method, or
2. Introducing a new interface (like `absenceDayCreator`)

### Pattern: orderBookingCreator (lines 60-64)

The `target_with_order` behavior uses an optional service injected via setter:

```go
type orderBookingCreator interface {
    CreateAutoBooking(ctx context.Context, tenantID, employeeID, orderID uuid.UUID, activityID *uuid.UUID, date time.Time, minutes int) (*model.OrderBooking, error)
    DeleteAutoBookingsByDate(ctx context.Context, employeeID uuid.UUID, date time.Time) error
}
```

Injected via:
```go
func (s *DailyCalcService) SetOrderBookingService(orderBookingSvc orderBookingCreator) {
    s.orderBookingSvc = orderBookingSvc
}
```

Wired in main.go (line 425):
```go
dailyCalcService.SetOrderBookingService(orderBookingService)
```

### DailyCalcService struct (lines 78-91)

```go
type DailyCalcService struct {
    bookingRepo         bookingRepository
    empDayPlanRepo      employeeDayPlanRepository
    dayPlanRepo         dayPlanLookup
    dailyValueRepo      dailyValueRepository
    holidayRepo         holidayLookup
    employeeRepo        employeeLookup
    absenceDayRepo      absenceDayLookup
    calc                *calculation.Calculator
    notificationSvc     *NotificationService
    orderBookingSvc     orderBookingCreator
    settingsLookup      settingsLookup
    dailyAccountValRepo dailyAccountValueWriter
}
```

---

## 6. Wiring in main.go

File: `/home/tolga/projects/terp/apps/api/cmd/server/main.go`

### Relevant lines (135-152)

```go
absenceDayRepo := repository.NewAbsenceDayRepository(db)
dailyCalcService := service.NewDailyCalcService(bookingRepo, empDayPlanRepo, dayPlanRepo, dailyValueRepo, holidayRepo, employeeRepo, absenceDayRepo)
dailyCalcService.SetDailyAccountValueRepo(dailyAccountValueRepo)
// ...
absenceTypeRepo := repository.NewAbsenceTypeRepository(db)
absenceService := service.NewAbsenceService(absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcService)
```

Key observation: `absenceTypeRepo` and `absenceDayRepo` are already instantiated and available in main.go scope.

---

## 7. CalculateDay Flow Interaction

File: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go` (lines 162-233)

The flow in `CalculateDay` is:
1. Check for holiday
2. Get day plan
3. Get bookings
4. Route to handler: off-day / holiday / no-bookings / with-bookings
5. Persist daily value
6. Post daily account values

For vocational school, the flow hits `handleNoBookings` at step 4 (line 203). The implementation needs to:

1. **In handleNoBookings, vocational_school case**: Check if date is in the past and no absence exists
2. **Create the absence day**: With type SB, duration 1.00, status approved
3. **Trigger recalculation**: After creating the absence, the daily calc should re-run so that `resolveTargetHours` picks up the newly created absence (which may use RegularHours2 if configured)

**Critical design question**: Should the recalculation happen within `handleNoBookings` or should it just create the absence and return, knowing that the absence will be picked up on the next calculation pass?

Looking at the flow: when `handleNoBookings` returns a `DailyValue`, that value is persisted immediately (step 5). If we create the absence inside `handleNoBookings` and then the current pass already credits the target time, that's equivalent to what happens after recalculation -- because the SB type has Portion=1 (full credit), which means `resolveTargetHours` would use RegularHours (or RegularHours2 if configured for absence days). For a standard day plan without RegularHours2, the result is identical.

However, the ticket says: "Recalculate the day after absence creation." This suggests a second pass is expected. The safest approach follows the `target_with_order` pattern: create the absence, credit target time in the current pass, and let any subsequent recalculation pick up the absence properly.

**Recommended approach**: Create the absence in `handleNoBookings`, return the credited daily value, and let the normal `CalculateDay` persist it. The next recalculation will naturally see the absence via `absenceDayRepo.GetByEmployeeDate` in `resolveTargetHours`. The initial calculation already credits target time, which is correct for SB (Portion=1). No explicit re-trigger is needed within the same call -- the ticket's "recalculate after creation" refers to the conceptual flow.

---

## 8. Implementation Plan

### 8.1 New Interface: absenceDayCreator

Follow the `orderBookingCreator` pattern:

```go
// absenceDayCreator defines the interface for auto absence day creation used by daily calc.
type absenceDayCreator interface {
    CreateAutoAbsence(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time, absenceTypeCode string) (*model.AbsenceDay, error)
    GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.AbsenceDay, error)
}
```

Or more simply, since we need both lookup and create, extend the existing lookup or add a new field.

**Better approach**: Add a new optional service field (like `orderBookingSvc`):

```go
// In DailyCalcService struct:
absenceDayCreator absenceDayAutoCreator

// New interface:
type absenceDayAutoCreator interface {
    CreateAutoAbsenceByCode(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time, absenceTypeCode string) (*model.AbsenceDay, error)
}

// Setter:
func (s *DailyCalcService) SetAbsenceDayCreator(creator absenceDayAutoCreator) {
    s.absenceDayCreator = creator
}
```

This method would:
1. Look up the absence type by code ("SB") using `absenceTypeRepo.GetByCode`
2. Check if absence already exists using `absenceDayRepo.GetByEmployeeDate` (idempotency)
3. Create the absence day with status=approved, duration=1.00

### 8.2 Implementation in AbsenceService

Add a `CreateAutoAbsenceByCode` method to `AbsenceService`:

```go
func (s *AbsenceService) CreateAutoAbsenceByCode(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time, absenceTypeCode string) (*model.AbsenceDay, error) {
    // 1. Check if absence already exists (idempotency)
    existing, err := s.absenceDayRepo.GetByEmployeeDate(ctx, employeeID, date)
    if err != nil {
        return nil, err
    }
    if existing != nil {
        return existing, nil  // Already exists, no-op
    }

    // 2. Look up absence type by code
    absenceType, err := s.absenceTypeRepo.GetByCode(ctx, tenantID, absenceTypeCode)
    if err != nil {
        return nil, fmt.Errorf("absence type %q not found: %w", absenceTypeCode, err)
    }

    // 3. Create the absence day
    now := time.Now()
    notes := "Auto-created by vocational school day plan"
    ad := &model.AbsenceDay{
        TenantID:      tenantID,
        EmployeeID:    employeeID,
        AbsenceDate:   date,
        AbsenceTypeID: absenceType.ID,
        Duration:      decimal.NewFromInt(1),
        Status:        model.AbsenceStatusApproved,
        ApprovedAt:    &now,
        Notes:         &notes,
    }

    if err := s.absenceDayRepo.Create(ctx, ad); err != nil {
        return nil, err
    }

    ad.AbsenceType = absenceType
    return ad, nil
}
```

### 8.3 Update handleNoBookings vocational_school Case

```go
case model.NoBookingVocationalSchool:
    // ZMI: Berufsschule -- auto-create absence for past dates
    warnings := pq.StringArray{"VOCATIONAL_SCHOOL"}

    if s.absenceDayCreator != nil && date.Before(truncateToDay(time.Now())) {
        // Check if absence already exists
        existing, _ := s.absenceDayRepo.GetByEmployeeDate(ctx, employeeID, date)
        if existing == nil {
            _, err := s.absenceDayCreator.CreateAutoAbsenceByCode(ctx, tenantID, employeeID, date, "SB")
            if err != nil {
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

**Note**: The `tenantID` parameter is not currently available in `handleNoBookings`. It needs to be added to the method signature, or retrieved from the employee/day plan. Looking at `handleNoBookings` signature (line 448):

```go
func (s *DailyCalcService) handleNoBookings(
    ctx context.Context,
    employeeID uuid.UUID,
    date time.Time,
    empDayPlan *model.EmployeeDayPlan,
) (*model.DailyValue, error) {
```

The `tenantID` can be obtained from `empDayPlan.TenantID` since `empDayPlan` is always non-nil when we reach the vocational school case (the nil check happens before calling handleNoBookings).

### 8.4 Wire in main.go

```go
// After absenceService is created:
dailyCalcService.SetAbsenceDayCreator(absenceService)
```

### 8.5 Update Tests

Update `TestHandleNoBookings_VocationalSchool` and add new test cases:
1. Past date + no existing absence -> creates absence, removes ABSENCE_CREATION_NOT_IMPLEMENTED
2. Past date + existing absence -> no duplicate, no error
3. Future date -> no absence creation (still credits target)
4. absenceDayCreator is nil -> adds ABSENCE_CREATION_NOT_CONFIGURED warning

---

## 9. Test Patterns

File: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc_test.go`

### Mock Setup Pattern

```go
absenceDayRepo := new(mockAbsenceDayLookup)
absenceDayRepo.On("GetByEmployeeDate", mock.Anything, mock.Anything, mock.Anything).Return(nil, nil)
svc := &DailyCalcService{
    employeeRepo:   new(mockEmployeeLookup),
    absenceDayRepo: absenceDayRepo,
}
```

### For the new tests, a mock for absenceDayAutoCreator is needed:

```go
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

---

## 10. Critical Findings and Concerns

### 10.1 Absence Type Code Discrepancy

- **Migration** (production): Seeds `"SB"` as the Berufsschule code
- **Dev seed**: Uses `"BS"` as the code
- **Ticket**: References `"SB"`

The implementation should use `"SB"` (matching the migration). The dev seed `devabsencetypes.go` line 93 should also be corrected from `"BS"` to `"SB"` as part of this or a separate fix.

### 10.2 tenantID in handleNoBookings

The `handleNoBookings` method does not receive `tenantID` as a parameter. It is available on `empDayPlan.TenantID`. Use that instead of adding a new parameter.

### 10.3 "Past date" Check

The ticket says "date is in the past." Need to define what "past" means:
- `date.Before(time.Now())` -- before the current moment (timezone-sensitive)
- `date.Before(truncateToDay(time.Now()))` -- before today (date comparison only)

The latter is more appropriate since daily calculation operates on full dates. Use date-only comparison.

### 10.4 Recalculation After Absence Creation

The ticket says "Recalculate the day after absence creation." But since the vocational school case already credits full target time (same as what an SB absence with Portion=1 would produce), the recalculation within the same call would produce the same result. The recalculation is mainly important for:
- Using `RegularHours2` if configured (alternative target for absence days)
- Correct daily value metadata (e.g., absence-related warnings)

If `RegularHours2` is configured on the day plan AND differs from `RegularHours`, the recalculation would yield a different target. The safest approach: after creating the absence, recalculate the day by calling `CalculateDay` recursively. But this creates a risk of infinite recursion.

**Recommended approach**: After creating the absence, the next `CalculateDay` call on this date will:
1. See the absence via `absenceDayRepo.GetByEmployeeDate`
2. The `resolveTargetHours` method will use `RegularHours2` if configured
3. The `handleNoBookings` vocational school case will see the existing absence and skip creation (idempotent)

So the safest approach is: create the absence and return the daily value as-is for the current pass, and note that a recalculation may be needed separately. The daily calc can be triggered externally after the batch of creations.

### 10.5 Circular Dependency Risk

The `AbsenceService` depends on `recalcService` (which depends on `dailyCalcService`). If `dailyCalcService` depends on `AbsenceService`, there's a circular dependency. The solution is the interface-based approach: `dailyCalcService` depends on the `absenceDayAutoCreator` interface, not on `AbsenceService` directly. This works because Go interfaces are satisfied implicitly.

---

## 11. File Summary

| File | Purpose | Lines of Interest |
|------|---------|-------------------|
| `apps/api/internal/service/daily_calc.go` | Daily calculation service | L55-58 (absenceDayLookup), L78-91 (struct), L448-561 (handleNoBookings), L490-503 (vocational_school case) |
| `apps/api/internal/service/daily_calc_test.go` | Tests | L722-750 (vocational school test), L129-139 (mock absence repo), L150-167 (helper) |
| `apps/api/internal/model/dayplan.go` | Day plan model | L28-38 (NoBookingBehavior constants) |
| `apps/api/internal/model/absenceday.go` | AbsenceDay model | L41-73 (struct), L90-92 (IsApproved), L103-110 (CalculateCredit) |
| `apps/api/internal/model/absencetype.go` | AbsenceType model | L30-76 (struct), L81-98 (CreditMultiplier, CalculateCredit) |
| `apps/api/internal/repository/absenceday.go` | AbsenceDay repository | L29-31 (Create), L59-73 (GetByEmployeeDate) |
| `apps/api/internal/repository/absencetype.go` | AbsenceType repository | L46-59 (GetByCode) |
| `apps/api/internal/service/absence.go` | Absence service | L80-105 (struct/constructor), L363-457 (CreateRange) |
| `apps/api/cmd/server/main.go` | Wiring | L135-152 (daily calc + absence wiring), L425 (order booking setter pattern) |
| `db/migrations/000025_create_absence_types.up.sql` | SB seed | L73 (SB Berufsschule) |
| `apps/api/internal/auth/devabsencetypes.go` | Dev seed | L91-101 (BS code -- discrepancy) |
