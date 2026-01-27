---
date: 2026-01-22T16:53:33+01:00
researcher: Claude Code
git_commit: 9192b323908c8d2a506df6571e054ae8b72a8b30
branch: master
repository: terp
topic: "TICKET-070: Create Daily Calculation Service"
tags: [research, codebase, daily-calculation, service, zmi, time-tracking]
status: complete
last_updated: 2026-01-22
last_updated_by: Claude Code
---

# Research: NOK-128 / TICKET-070 - Create Daily Calculation Service

**Date**: 2026-01-22T16:53:33+01:00
**Researcher**: Claude Code
**Git Commit**: 9192b323908c8d2a506df6571e054ae8b72a8b30
**Branch**: master
**Repository**: terp

## Research Question

What existing components, models, repositories, and patterns exist in the codebase to support the implementation of the Daily Calculation Service (TICKET-070)?

## Summary

The Daily Calculation Service (TICKET-070) orchestrates daily time calculations by integrating several existing components:

1. **Calculator Package** (`apps/api/internal/calculation/`): A complete, pure-function calculation engine implementing a 10-step pipeline for processing bookings, applying tolerance/rounding, pairing, break deduction, and overtime calculation.

2. **Repository Layer**: All required repositories exist - BookingRepository, EmployeeDayPlanRepository, DailyValueRepository, HolidayRepository. The AbsenceDay/AbsenceType repositories are NOT YET IMPLEMENTED (blocked by TICKET-074/075/076).

3. **Model Layer**: DailyValue, Booking, BookingType, EmployeeDayPlan, DayPlan, Holiday models all exist with complete field sets matching the plan requirements.

4. **Configuration Storage**: Tenant.Settings field exists as JSONB but has no parsing logic implemented - the service will need to implement settings parsing for ZMI configuration (HolidayCreditCategory, NoBookingBehavior, DayChangeBehavior).

5. **Blockers**: Absence-related functionality is blocked until TICKET-074/075/076 complete the AbsenceType and AbsenceDay models/repositories.

## Detailed Findings

### 1. Daily Calculator (TICKET-068 Dependency)

**Location**: `apps/api/internal/calculation/`

The calculation package is a complete, pure-function calculation engine with no database dependencies.

#### Core Structure

**Calculator** (`calculator.go:8-13`):
```go
type Calculator struct{}

func NewCalculator() *Calculator {
    return &Calculator{}
}
```

**Calculate Method** (`calculator.go:16`):
```go
func (c *Calculator) Calculate(input CalculationInput) CalculationResult
```

#### 10-Step Calculation Pipeline (`calculator.go:16-101`)

| Step | Line | Operation |
|------|------|-----------|
| 0 | 17-23 | Initialize result with TargetTime and BookingCount |
| 1 | 25-30 | Handle empty bookings (add NO_BOOKINGS error) |
| 2 | 33 | Process bookings (apply tolerance and rounding) |
| 3 | 36-48 | Pair bookings (work and break categories) |
| 4 | 51-52 | Find first come and last go times |
| 5 | 55 | Validate time windows (come/go) |
| 6 | 58-64 | Validate core hours (flextime) |
| 7 | 67 | Calculate gross time from work pairs |
| 8 | 70-78 | Calculate break deduction |
| 9 | 81-87 | Calculate net time (apply max cap) |
| 10 | 90-92 | Validate minimum work time |
| 11 | 95 | Calculate overtime/undertime |

#### Input/Output Types

**CalculationInput** (`types.go:108-114`):
- `EmployeeID uuid.UUID`
- `Date time.Time`
- `Bookings []BookingInput`
- `DayPlan DayPlanInput`

**CalculationResult** (`types.go:124-151`):
- Time values: `GrossTime`, `NetTime`, `TargetTime`, `Overtime`, `Undertime`, `BreakTime`
- Summary: `FirstCome`, `LastGo`, `BookingCount`
- Calculated: `CalculatedTimes map[uuid.UUID]int`
- Pairing: `Pairs []BookingPair`, `UnpairedInIDs`, `UnpairedOutIDs`
- Status: `HasError bool`, `ErrorCodes []string`, `Warnings []string`

### 2. DailyValue Repository (TICKET-058 Dependency)

**Location**: `apps/api/internal/repository/dailyvalue.go`

#### Model Structure (`model/dailyvalue.go:11-45`)

| Field | Type | Description |
|-------|------|-------------|
| ID, TenantID, EmployeeID | uuid.UUID | Identifiers |
| ValueDate | time.Time (date) | The calculation date |
| GrossTime, NetTime, TargetTime | int | Time values in minutes |
| Overtime, Undertime, BreakTime | int | Derived time values |
| HasError | bool | Error flag |
| ErrorCodes, Warnings | pq.StringArray | Status arrays |
| FirstCome, LastGo | *int | Booking summary (nullable) |
| BookingCount | int | Number of bookings |
| CalculatedAt | *time.Time | Calculation timestamp |
| CalculationVersion | int | Algorithm version |

#### Key Repository Methods

**Upsert** (`dailyvalue.go:110-123`):
- Creates or updates based on `(employee_id, value_date)` unique constraint
- Updates all calculation fields on conflict
- Preserves `created_at` timestamp

**GetByEmployeeDate** (`dailyvalue.go:79-94`):
- Returns `(nil, nil)` when not found (not an error)
- Query: `employee_id = ? AND value_date = ?`

**SumForMonth** (`dailyvalue.go:159-182`):
- Aggregates monthly totals for employee
- Returns `DailyValueSum` with totals and error day count

### 3. Booking Repository

**Location**: `apps/api/internal/repository/booking.go`

#### Model Structure (`model/booking.go:20-49`)

| Field | Type | Description |
|-------|------|-------------|
| OriginalTime, EditedTime | int | Minutes from midnight |
| CalculatedTime | *int | After tolerance/rounding (nullable) |
| PairID | *uuid.UUID | Links paired bookings |
| BookingTypeID | uuid.UUID | References booking_types |
| Source | BookingSource | Origin of booking |

#### Key Methods

**EffectiveTime()** (`booking.go:61-66`):
- Returns `CalculatedTime` if set, else `EditedTime`
- Used throughout calculation logic

**GetByEmployeeAndDate** (`repository/booking.go:150-162`):
- Preloads `BookingType`
- Orders by `edited_time ASC`

**UpdateCalculatedTimes** (`repository/booking.go:235-255`):
- Bulk updates calculated times from map
- Used after daily calculation to persist tolerance/rounding results

### 4. EmployeeDayPlan Repository

**Location**: `apps/api/internal/repository/employeedayplan.go`

#### Model Structure (`model/employeedayplan.go:19-32`)

| Field | Type | Description |
|-------|------|-------------|
| DayPlanID | *uuid.UUID | Nullable (null = off day) |
| Source | string | "tariff", "manual", or "holiday" |
| PlanDate | time.Time | The specific date |

**IsOffDay()** (`employeedayplan.go:40-43`): Returns true when `DayPlanID` is nil

#### Key Repository Method

**GetForEmployeeDate** (`repository/employeedayplan.go:67-85`):
- Preloads: `DayPlan`, `DayPlan.Breaks`, `DayPlan.Bonuses`
- Returns `(nil, nil)` when no plan exists
- Critical for time calculation

### 5. Holiday Repository

**Location**: `apps/api/internal/repository/holiday.go`

#### Model Structure (`model/holiday.go:9-19`)

| Field | Type | Description |
|-------|------|-------------|
| HolidayDate | time.Time | Date type |
| Name | string | Holiday name |
| IsHalfDay | bool | Half-day flag |
| AppliesToAll | bool | Department scope |
| DepartmentID | *uuid.UUID | Optional department |

#### Key Repository Method

**GetByDate** (`repository/holiday.go:84-99`):
- Returns `(nil, nil)` when no holiday exists (distinct from error)
- Query: `tenant_id = ? AND holiday_date = ?`

### 6. Absence Models and Repositories (NOT YET IMPLEMENTED)

**Status**: Planned but not implemented (TICKET-074, 075, 076)

#### Planned AbsenceType Model (TICKET-075)

| Field | Type | ZMI Description |
|-------|------|-----------------|
| Code | string | Must start with U, K, or S |
| Portion | AbsencePortion | 0=None, 1=Full, 2=Half |
| HolidayCode | *string | Alternative code on holidays |
| Priority | int | Holiday overlap resolution |

**Planned Methods**:
- `CreditMultiplier() float64` - Returns 0.0, 1.0, or 0.5
- `CalculateCredit(regelarbeitszeit int) int` - Credit formula
- `GetEffectiveCode(isHoliday bool) string` - Holiday code handling

#### Planned AbsenceDay Model (TICKET-076)

| Field | Type | Description |
|-------|------|-------------|
| Duration | decimal(3,2) | Day portion (0.5 or 1.0) |
| HalfDayPeriod | *string | "morning" or "afternoon" |
| Status | string | Approval workflow |

**Planned Repository Methods**:
- `GetByEmployeeAndDate(ctx, employeeID, date)` - Core lookup
- `ListByDateRange(ctx, tenantID, from, to)` - Range query

### 7. Tenant Settings Configuration

**Location**: `apps/api/internal/model/tenant.go`

#### Current Implementation

**Settings Field** (`tenant.go:13`):
```go
Settings  datatypes.JSON `gorm:"type:jsonb;default:'{}'" json:"settings"`
```

**Status**: Field exists but NO parsing logic implemented anywhere in the codebase.

#### Required for DailyCalcService

The plan file (`TICKET-070-create-daily-calculation-service.md:518-537`) specifies:

```go
func (s *dailyCalcService) GetConfig(ctx context.Context, tenantID uuid.UUID) (*DailyCalcConfig, error) {
    tenant, err := s.tenantRepo.GetByID(ctx, tenantID)
    // ...
    if tenant.Settings != nil {
        // TODO: Implement settings parsing
    }
}
```

This will need to parse JSON into `DailyCalcConfig`:
- `HolidayCredit HolidayCreditCategory` (1=Target, 2=Average, 3=None)
- `NoBookingBehavior NoBookingBehavior` (error, credit_target, credit_zero, skip, use_absence)
- `DayChangeBehavior DayChangeBehavior` (to_first, to_second, split, by_shift)

### 8. DayPlan Model (for buildCalcInput)

**Location**: `apps/api/internal/model/dayplan.go`

#### Key Fields for Calculation

| Field | Line | Description |
|-------|------|-------------|
| RegularHours | 42 | Target work time in minutes |
| ComeFrom, ComeTo | 34-35 | Arrival window |
| GoFrom, GoTo | 36-37 | Departure window |
| CoreStart, CoreEnd | 38-39 | Flextime core hours |
| ToleranceComePlus/Minus | 45-46 | Arrival tolerance |
| ToleranceGoPlus/Minus | 47-48 | Departure tolerance |
| RoundingComeType/Interval | 51-52 | Arrival rounding |
| RoundingGoType/Interval | 53-54 | Departure rounding |
| MinWorkTime | 57 | Minimum required |
| MaxNetWorkTime | 58 | Maximum creditable |

#### Breaks Relation (`dayplan.go:65`)

`Breaks []DayPlanBreak` with fields (`dayplan.go:81-94`):
- `BreakType` - "fixed", "variable", "minimum"
- `StartTime`, `EndTime` - Break window
- `Duration`, `AfterWorkMinutes` - Break rules
- `AutoDeduct`, `IsPaid` - Flags

## Code References

### Existing Files (Complete)
- `apps/api/internal/calculation/calculator.go:16` - Main Calculate() method
- `apps/api/internal/calculation/types.go:108-151` - Input/Output types
- `apps/api/internal/calculation/pairing.go:21` - PairBookings() function
- `apps/api/internal/calculation/breaks.go:14` - CalculateBreakDeduction()
- `apps/api/internal/repository/dailyvalue.go:110` - Upsert() method
- `apps/api/internal/repository/booking.go:150` - GetByEmployeeAndDate()
- `apps/api/internal/repository/booking.go:235` - UpdateCalculatedTimes()
- `apps/api/internal/repository/employeedayplan.go:67` - GetForEmployeeDate()
- `apps/api/internal/repository/holiday.go:84` - GetByDate()
- `apps/api/internal/model/dailyvalue.go:11-45` - DailyValue model
- `apps/api/internal/model/booking.go:61` - EffectiveTime() method
- `apps/api/internal/model/dayplan.go:25-66` - DayPlan with breaks/bonuses
- `apps/api/internal/model/tenant.go:13` - Settings JSONB field

### Files to Create
- `apps/api/internal/service/daily_calc.go` - Service implementation
- `apps/api/internal/service/daily_calc_test.go` - Unit tests

### Blocked Dependencies (Not Yet Implemented)
- `apps/api/internal/model/absencetype.go` - Blocked by TICKET-075
- `apps/api/internal/model/absenceday.go` - Blocked by TICKET-076
- `apps/api/internal/repository/absencetype.go` - Blocked by TICKET-075
- `apps/api/internal/repository/absenceday.go` - Blocked by TICKET-076

## Architecture Documentation

### Service Layer Pattern

The codebase uses a clear service pattern where:
1. Services define interfaces (`DailyCalcService interface`)
2. Private structs implement the interface (`dailyCalcService struct`)
3. Constructor functions inject dependencies (`NewDailyCalcService(...)`)
4. Methods receive context as first parameter

### Repository Pattern

Repositories follow consistent patterns:
- Return `(nil, nil)` for "not found" on date-based queries (not an error)
- Return `ErrXxxNotFound` for ID-based queries when not found (is an error)
- Use GORM's `.Preload()` for eager loading relations
- Use `.WithContext(ctx)` for context propagation

### Calculation Data Flow

```
EmployeeDayPlan + DayPlan  →  DayPlanInput
Bookings                   →  []BookingInput
                           ↓
                   CalculationInput
                           ↓
              Calculator.Calculate()
                           ↓
               CalculationResult
                           ↓
        DailyValue + UpdateCalculatedTimes
```

### ZMI Configuration Mapping

| ZMI Concept | Go Type | Implementation |
|-------------|---------|----------------|
| Zeitgutschrift an Feiertagen | HolidayCreditCategory | 1=Target, 2=Average, 3=None |
| Tage ohne Buchungen | NoBookingBehavior | 5 options (error, credit_target, etc.) |
| Tageswechsel | DayChangeBehavior | 4 options (to_first, to_second, etc.) |
| Anteil | AbsencePortion | 0=None, 1=Full, 2=Half |
| Priorität | int | Higher wins in holiday vs absence |

## Blocked Features

Per the plan file notes (`TICKET-070-create-daily-calculation-service.md:10-13`):

1. **HolidayCreditAverage (Category 2)** - Blocked by TICKET-127
   - Requires historical average calculation from previous days

2. **DayChangeBehavior full implementation** - Blocked by TICKET-128
   - Currently only "to_first" behavior can be fully implemented

3. **Absence handling** - Blocked by TICKET-074/075/076
   - `handleAbsenceCredit()` requires AbsenceType.CalculateCredit()
   - `GetByEmployeeDate` requires AbsenceDayRepository

## Related Research

- `thoughts/shared/plans/tickets/TICKET-070-create-daily-calculation-service.md` - Implementation plan
- `thoughts/shared/plans/tickets/TICKET-068-create-daily-calculator-DONE.md` - Calculator implementation
- `thoughts/shared/plans/tickets/TICKET-058-create-daily-value-model-repository-DONE.md` - DailyValue implementation

## Open Questions

1. **Settings Parsing**: What JSON structure should `tenant.Settings` use for ZMI configuration?
   - Needs schema definition before implementation

2. **Absence Priority**: How should the service handle absence vs holiday when both exist but absence types are not yet implemented?
   - Current plan adds "ABSENCE_NOT_IMPLEMENTED" warning

3. **Day Change**: Should cross-midnight handling be deferred entirely to TICKET-128, or should basic "to_first" behavior be implemented now?
   - Plan shows basic implementation but with TODO for full logic

4. **Employee Repository**: The plan uses `employeeRepo` but doesn't show what methods are needed from it.
   - May need to verify if GetByID or other methods are required
