# Research: ZMI-TICKET-037 - Vacation Deduction Uses Day Plan Urlaubsbewertung

Date: 2026-01-31

## 1. DayPlan Model and VacationDeduction Field

**File**: `/home/tolga/projects/terp/apps/api/internal/model/dayplan.go`

The `DayPlan` struct contains the `VacationDeduction` field:

```go
// ZMI: Urlaubsbewertung - vacation deduction value (1.0 = one day)
VacationDeduction decimal.Decimal `gorm:"type:decimal(5,2);default:1.00" json:"vacation_deduction"`
```

- Type: `decimal.Decimal` (shopspring/decimal)
- Database column: `vacation_deduction DECIMAL(5,2) DEFAULT 1.00`
- Default value: `1.00`
- Added in migration `000030_add_day_plan_zmi_fields.up.sql`

There is a TODO comment in `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go` (line 135-138):

```go
// TODO(ZMI-TICKET-006): Verify vacation deduction integration.
// The VacationDeduction field on the day plan should be used by the absence
// service when deducting vacation balance. Verify this integration when
// absence workflow tickets are implemented.
```

This confirms that the VacationDeduction field exists but is **not yet used** in any vacation deduction logic.

## 2. VacationBalance Model and Taken Field

**File**: `/home/tolga/projects/terp/apps/api/internal/model/vacationbalance.go`

```go
type VacationBalance struct {
    ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID   uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    EmployeeID uuid.UUID `gorm:"type:uuid;not null;index" json:"employee_id"`
    Year       int       `gorm:"type:int;not null" json:"year"`

    Entitlement decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"entitlement"`
    Carryover   decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"carryover"`
    Adjustments decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"adjustments"`
    Taken       decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0" json:"taken"`

    CarryoverExpiresAt *time.Time `gorm:"type:date" json:"carryover_expires_at,omitempty"`

    CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

    Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}
```

Helper methods:
- `Total() decimal.Decimal` -- returns `Entitlement + Carryover + Adjustments`
- `Available() decimal.Decimal` -- returns `Total() - Taken`

**Database migration** (`000027_create_vacation_balances.up.sql`):
- Column: `taken DECIMAL(5,2) NOT NULL DEFAULT 0`
- Unique constraint: `idx_vacation_balances_employee_year ON vacation_balances(employee_id, year)`

## 3. Absence Lifecycle

### AbsenceDay Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/absenceday.go`

Statuses:
```go
const (
    AbsenceStatusPending   AbsenceStatus = "pending"
    AbsenceStatusApproved  AbsenceStatus = "approved"
    AbsenceStatusRejected  AbsenceStatus = "rejected"
    AbsenceStatusCancelled AbsenceStatus = "cancelled"
)
```

Key fields:
- `Duration decimal.Decimal` -- 1.00 for full day, 0.50 for half day
- `HalfDayPeriod *HalfDayPeriod` -- "morning" or "afternoon" when duration = 0.5
- `Status AbsenceStatus` -- pending/approved/rejected/cancelled
- `AbsenceTypeID uuid.UUID` -- links to absence type
- `AbsenceDate time.Time` -- the date of absence

Helper methods:
- `IsFullDay() bool`
- `IsHalfDay() bool`
- `IsApproved() bool`
- `IsCancelled() bool`
- `CalculateCredit(regelarbeitszeit int) int` -- computes time credit from absence type portion

### AbsenceType Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/absencetype.go`

Key fields relevant to vacation:
- `DeductsVacation bool` -- flag indicating this absence type deducts from vacation balance
- `Category AbsenceCategory` -- "vacation", "illness", "special", "unpaid"
- `Portion AbsencePortion` -- 0 (none), 1 (full), 2 (half) -- determines time credit multiplier
- `Priority int` -- higher wins when holiday + absence overlap

### Absence Service

**File**: `/home/tolga/projects/terp/apps/api/internal/service/absence.go`

**CreateRange** (lines 305-399):
- Validates absence type (exists, active, tenant-accessible)
- Fetches employee day plans for the range
- Iterates dates, skipping weekends and off-days (no plan or DayPlanID == nil)
- Skips dates with existing absences
- Creates absence day records in batch
- Triggers recalculation via `recalcSvc.TriggerRecalcRange()`
- No vacation balance update logic

**Approve** (lines 160-186):
- Verifies absence is in "pending" status
- Sets status to "approved", approved_by, approved_at
- Triggers recalculation via `recalcSvc.TriggerRecalc()`
- Sends notification
- **Does NOT update VacationBalance.Taken**

**Reject** (lines 191-217):
- Verifies absence is in "pending" status
- Sets status to "rejected"
- Triggers recalculation
- Sends notification
- **Does NOT update VacationBalance.Taken**

**Delete** (lines 220-241):
- Deletes the absence day record
- Triggers recalculation
- **Does NOT update VacationBalance.Taken**

**Update** (lines 252-282):
- Only allows updates to pending absences
- Can change duration, half_day_period, notes
- Triggers recalculation

**No Cancel method exists** -- there is no `Cancel()` method in the absence service. Statuses include `AbsenceStatusCancelled`, but no code transitions to it currently.

### Absence Handler

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/absence.go`

Route registrations in `/home/tolga/projects/terp/apps/api/internal/handler/routes.go`:
- `POST /absences/{id}/approve` -> `h.Approve`
- `POST /absences/{id}/reject` -> `h.Reject`
- `DELETE /absences/{id}` -> `h.Delete`
- `PATCH /absences/{id}` -> `h.UpdateAbsence`
- `POST /employees/{id}/absences` -> `h.CreateRange`

The handler calls `h.absenceService.Approve()` which returns the updated absence. No vacation balance logic in the handler.

## 4. Personal Calendar / Effective Day Plan Lookup

### EmployeeDayPlan Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/employeedayplan.go`

```go
type EmployeeDayPlan struct {
    ID         uuid.UUID             `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    TenantID   uuid.UUID
    EmployeeID uuid.UUID
    PlanDate   time.Time             `gorm:"type:date;not null"`
    DayPlanID  *uuid.UUID            `gorm:"type:uuid"` // nil = off day
    Source     EmployeeDayPlanSource // "tariff", "manual", "holiday"
    Notes      string
    DayPlan    *DayPlan              `gorm:"foreignKey:DayPlanID"`
}
```

### EmployeeDayPlan Repository

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/employeedayplan.go`

Key methods for resolving the effective day plan:

```go
// GetForEmployeeDate retrieves the day plan for an employee on a specific date.
// Returns nil, nil if no plan exists for that date.
// Preloads DayPlan, DayPlan.Breaks, DayPlan.Bonuses
func (r *EmployeeDayPlanRepository) GetForEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.EmployeeDayPlan, error)

// GetForEmployeeDateRange retrieves all day plans for an employee within a date range.
// Preloads DayPlan, DayPlan.Breaks, DayPlan.Bonuses
func (r *EmployeeDayPlanRepository) GetForEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.EmployeeDayPlan, error)
```

Both methods preload the full DayPlan relation (including Breaks and Bonuses), so calling `GetForEmployeeDate()` gives access to `empDayPlan.DayPlan.VacationDeduction`.

The daily calc service uses `GetForEmployeeDate()` to look up the effective plan for a specific date. The absence service uses `GetForEmployeeDateRange()` during range creation to filter working days.

## 5. Existing Vacation Deduction Logic

### VacationService.RecalculateTaken

**File**: `/home/tolga/projects/terp/apps/api/internal/service/vacation.go` (lines 354-396)

```go
func (s *VacationService) RecalculateTaken(ctx context.Context, employeeID uuid.UUID, year int) error {
    // 1. Get employee for tenant ID
    // 2. Get all absence types where DeductsVacation = true
    // 3. For each type, sum approved durations via CountByTypeInRange
    // 4. Update VacationBalance.Taken with the total
}
```

This method sums `SUM(duration)` of approved absences with `DeductsVacation=true` for the year. It uses `CountByTypeInRange` which does a raw SQL `SUM(duration)` query.

**This is the current vacation deduction logic. It does NOT use VacationDeduction from the day plan.** Each approved day counts as its raw duration (1.0 or 0.5) regardless of the day plan's vacation_deduction value.

### VacationBalanceRepository.IncrementTaken

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/vacationbalance.go` (lines 91-104)

```go
func (r *VacationBalanceRepository) IncrementTaken(ctx context.Context, employeeID uuid.UUID, year int, amount decimal.Decimal) error {
    result := r.db.GORM.WithContext(ctx).
        Model(&model.VacationBalance{}).
        Where("employee_id = ? AND year = ?", employeeID, year).
        Update("taken", gorm.Expr("taken + ?", amount))
    // ...
}
```

This method atomically increments the `taken` field by an amount. It exists but is **not called anywhere** in the current codebase. It was likely added in anticipation of per-absence deduction (which is what this ticket requires).

### VacationBalanceRepository.UpdateTaken

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/vacationbalance.go` (lines 76-89)

```go
func (r *VacationBalanceRepository) UpdateTaken(ctx context.Context, employeeID uuid.UUID, year int, taken decimal.Decimal) error
```

Sets the `taken` field to an absolute value. Called by `VacationService.RecalculateTaken()`.

### AbsenceDayRepository.CountByTypeInRange

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/absenceday.go` (lines 191-207)

```go
func (r *AbsenceDayRepository) CountByTypeInRange(ctx context.Context, employeeID, typeID uuid.UUID, from, to time.Time) (decimal.Decimal, error) {
    // SELECT COALESCE(SUM(duration), 0) FROM absence_days
    // WHERE employee_id=? AND absence_type_id=? AND absence_date >=? AND absence_date <=? AND status='approved'
}
```

Sums raw `duration` values. Does not consider day plan vacation_deduction.

## 6. Related Service, Repository, and Handler Code

### Service Layer

| Service | File | Relevance |
|---|---|---|
| AbsenceService | `apps/api/internal/service/absence.go` | Creates/approves/rejects/deletes absences; triggers recalc |
| VacationService | `apps/api/internal/service/vacation.go` | Manages vacation balance; has RecalculateTaken |
| DailyCalcService | `apps/api/internal/service/daily_calc.go` | Daily calculation; uses day plan; has TODO for vacation deduction |
| RecalcService | `apps/api/internal/service/recalc.go` | Triggers recalculation of daily values |

### Repository Layer

| Repository | File | Key Methods |
|---|---|---|
| AbsenceDayRepository | `apps/api/internal/repository/absenceday.go` | Create, GetByID, Update, Delete, CountByTypeInRange, GetByEmployeeDate |
| VacationBalanceRepository | `apps/api/internal/repository/vacationbalance.go` | GetByEmployeeYear, Upsert, UpdateTaken, IncrementTaken |
| EmployeeDayPlanRepository | `apps/api/internal/repository/employeedayplan.go` | GetForEmployeeDate, GetForEmployeeDateRange |

### Handler Layer

| Handler | File | Routes |
|---|---|---|
| AbsenceHandler | `apps/api/internal/handler/absence.go` | POST /absences/{id}/approve, POST /absences/{id}/reject, etc. |
| VacationHandler | (vacation handler file) | GET /employees/{id}/vacation-balance |

### Service Dependencies (Absence Service)

```go
type AbsenceService struct {
    absenceDayRepo  absenceDayRepositoryForService
    absenceTypeRepo absenceTypeRepositoryForService
    holidayRepo     holidayRepositoryForAbsence
    empDayPlanRepo  empDayPlanRepositoryForAbsence
    recalcSvc       recalcServiceForAbsence
    notificationSvc *NotificationService
}
```

The AbsenceService currently has no dependency on VacationService or VacationBalanceRepository. It also has `empDayPlanRepo` but only uses it via `GetForEmployeeDateRange` during absence creation (not during approval).

### Service Dependencies (Vacation Service)

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
    defaultMaxCarryover   decimal.Decimal
}
```

The VacationService has no dependency on EmployeeDayPlanRepository. It cannot currently look up day plans for a given date.

## 7. Database Schema for Relevant Tables

### day_plans

Created in `000015_create_day_plans.up.sql`, extended in `000030_add_day_plan_zmi_fields.up.sql`:

```sql
-- Key columns for this ticket:
vacation_deduction DECIMAL(5,2) DEFAULT 1.00
```

### vacation_balances

Created in `000027_create_vacation_balances.up.sql`, extended in `000052`:

```sql
CREATE TABLE vacation_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id),
    year INT NOT NULL,
    entitlement DECIMAL(5,2) NOT NULL DEFAULT 0,
    carryover DECIMAL(5,2) NOT NULL DEFAULT 0,
    adjustments DECIMAL(5,2) NOT NULL DEFAULT 0,
    taken DECIMAL(5,2) NOT NULL DEFAULT 0,
    carryover_expires_at DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- UNIQUE(employee_id, year)
```

### absence_days

Created in `000026_create_absence_days.up.sql`:

```sql
CREATE TABLE absence_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id),
    absence_date DATE NOT NULL,
    absence_type_id UUID NOT NULL REFERENCES absence_types(id),
    duration DECIMAL(3,2) NOT NULL DEFAULT 1.00,
    half_day_period VARCHAR(10),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- UNIQUE(employee_id, absence_date) WHERE status != 'cancelled'
```

### employee_day_plans

Created in `000023_create_employee_day_plans.up.sql`:

```sql
CREATE TABLE employee_day_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id),
    plan_date DATE NOT NULL,
    day_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,
    source VARCHAR(20) DEFAULT 'tariff',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, plan_date)
);
```

## 8. Existing Tests

### Absence Service Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/service/absence_test.go`

Tests cover:
- `GetByID` (success, not found)
- `Delete` (success, not found) -- triggers recalc
- `DeleteRange` (success, invalid dates) -- triggers recalc range
- `ListByEmployee`
- `GetByEmployeeDateRange`
- `CreateRange` -- weekdays only, skips weekends, allows holidays, skips off-days, skips existing absences, invalid dates, invalid/inactive absence types, system types, all dates skipped, single day, half day
- `Update` -- duration, notes, rejects non-pending, not found
- Helper function tests: `normalizeDate`, `buildHolidaySet`, `buildDayPlanMap`

Mock structures defined:
- `mockAbsenceDayRepositoryForService`
- `mockAbsenceTypeRepositoryForService`
- `mockHolidayRepositoryForAbsence`
- `mockEmpDayPlanRepositoryForAbsence`
- `mockRecalcServiceForAbsence`

**No tests for Approve or Cancel.** The test file tests CreateRange, Delete, Update but does not have tests for the Approve and Reject methods.

### Vacation Service Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/service/vacation_test.go`

Tests cover:
- `GetBalance` (success, not found, invalid year)
- `InitializeYear` (full year, part year, part time, preserves existing fields, employee not found, invalid year)
- `RecalculateTaken` (success with multiple types, no vacation types, employee not found, invalid year)
- `AdjustBalance` (success, negative adjustment, not found, invalid year)
- `CarryoverFromPreviousYear` (success, capped, unlimited, no previous balance, negative available, updates existing, employee not found, invalid year)

Mock structures defined:
- `mockVacationBalanceRepoForVacation` -- GetByEmployeeYear, Upsert, UpdateTaken
- `mockAbsenceDayRepoForVacation` -- CountByTypeInRange
- `mockAbsenceTypeRepoForVacation` -- List
- `mockEmployeeRepoForVacation` -- GetByID
- `mockTenantRepoForVacation` -- GetByID
- `mockTariffRepoForVacation` -- GetByID

`RecalculateTaken` tests confirm the current behavior: it sums raw durations, not day-plan-weighted durations.

### VacationBalance Repository Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/vacationbalance_test.go`

Tests for `IncrementTaken`:
- `TestVacationBalanceRepository_IncrementTaken` -- increments taken by 1.5
- `TestVacationBalanceRepository_IncrementTaken_Multiple` -- sequential increments (1 + 0.5 + 2 = 3.5)
- `TestVacationBalanceRepository_IncrementTaken_NotFound` -- returns error for non-existent balance

### AbsenceDay Repository Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/absenceday_test.go`

Tests for `CountByTypeInRange`:
- `TestAbsenceDayRepository_CountByTypeInRange` -- sums duration for approved absences
- `TestAbsenceDayRepository_CountByTypeInRange_Empty` -- returns 0 when no absences

## Summary of Current State

1. **VacationDeduction field exists** on DayPlan model (`decimal.Decimal`, default 1.00) and in the database.

2. **VacationDeduction is NOT used anywhere** in the current codebase. There is an explicit TODO comment in `daily_calc.go` acknowledging this.

3. **Current vacation deduction logic** (`VacationService.RecalculateTaken`) sums raw `duration` values (1.0 or 0.5) from approved absence days. It does not consider the day plan's VacationDeduction value.

4. **The Approve method** in AbsenceService sets status to approved and triggers recalculation of daily values, but does not update VacationBalance.Taken.

5. **No Cancel method** exists in AbsenceService. The `AbsenceStatusCancelled` status constant exists but nothing transitions to it.

6. **IncrementTaken** repository method exists and is tested but is never called by any service code. It was built for per-event atomic increments.

7. **GetForEmployeeDate** in EmployeeDayPlanRepository preloads the full DayPlan relation, making VacationDeduction available for lookup.

8. **AbsenceService has empDayPlanRepo** dependency but only uses it during creation (GetForEmployeeDateRange). It does not use it during approval.

9. **VacationService has no EmployeeDayPlanRepository dependency** and cannot currently look up day plans.

10. **No tests exist** for the Approve/Reject flow in the absence service test file.
