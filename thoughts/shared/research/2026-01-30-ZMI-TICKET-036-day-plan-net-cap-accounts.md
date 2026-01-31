# Research: ZMI-TICKET-036 Day Plan Net/Cap Accounts (Tagesnetto/Kappungskonto)

Date: 2026-01-30
Ticket: ZMI-TICKET-036

## 1. Current Day Plan Model

### Internal Model (`apps/api/internal/model/dayplan.go`)

The `DayPlan` struct has these fields:

```go
type DayPlan struct {
    ID          uuid.UUID
    TenantID    uuid.UUID
    Code        string
    Name        string
    Description *string
    PlanType    PlanType  // "fixed" | "flextime"

    // Time windows (minutes from midnight)
    ComeFrom  *int
    ComeTo    *int
    GoFrom    *int
    GoTo      *int
    CoreStart *int
    CoreEnd   *int

    // Target hours
    RegularHours      int
    RegularHours2     *int
    FromEmployeeMaster bool

    // Tolerances
    ToleranceComePlus  int
    ToleranceComeMinus int
    ToleranceGoPlus    int
    ToleranceGoMinus   int

    // Rounding
    RoundingComeType     *RoundingType
    RoundingComeInterval *int
    RoundingGoType       *RoundingType
    RoundingGoInterval   *int
    RoundAllBookings     bool
    RoundingComeAddValue *int
    RoundingGoAddValue   *int

    // Caps
    MinWorkTime    *int
    MaxNetWorkTime *int

    // Other ZMI fields
    VariableWorkTime  bool
    HolidayCreditCat1 *int
    HolidayCreditCat2 *int
    HolidayCreditCat3 *int
    VacationDeduction decimal.Decimal
    NoBookingBehavior NoBookingBehavior
    DayChangeBehavior DayChangeBehavior

    // Shift detection
    ShiftDetectArriveFrom *int
    ShiftDetectArriveTo   *int
    ShiftDetectDepartFrom *int
    ShiftDetectDepartTo   *int
    ShiftAltPlan1-6       *uuid.UUID

    IsActive  bool
    CreatedAt time.Time
    UpdatedAt time.Time

    // Relations
    Breaks  []DayPlanBreak
    Bonuses []DayPlanBonus
}
```

Table name: `day_plans`

Helper methods:
- `GetEffectiveRegularHours(isAbsenceDay bool, employeeTargetMinutes *int) int` - priority chain for target hours
- `GetHolidayCredit(category int) int` - holiday credit by category
- `HasShiftDetection() bool` - checks if shift detection is configured
- `GetAlternativePlanIDs() []uuid.UUID` - returns configured alternative plan IDs

There are NO `net_account_id` or `cap_account_id` fields on the model currently.

### DayPlanBreak Sub-Model

```go
type DayPlanBreak struct {
    ID               uuid.UUID
    DayPlanID        uuid.UUID
    BreakType        BreakType  // "fixed" | "variable" | "minimum"
    StartTime        *int
    EndTime          *int
    Duration         int
    AfterWorkMinutes *int
    AutoDeduct       bool
    IsPaid           bool
    MinutesDifference bool
    SortOrder         int
}
```
Table name: `day_plan_breaks`

### DayPlanBonus Sub-Model

```go
type DayPlanBonus struct {
    ID               uuid.UUID
    DayPlanID        uuid.UUID
    AccountID        uuid.UUID  // FK to accounts table
    TimeFrom         int
    TimeTo           int
    CalculationType  CalculationType  // "fixed" | "per_minute" | "percentage"
    ValueMinutes     int
    MinWorkMinutes   *int
    AppliesOnHoliday bool
    SortOrder        int

    Account *Account  // FK relation
}
```
Table name: `day_plan_bonuses`

The DayPlanBonus already has an `AccountID` (uuid.UUID FK) that references the accounts table. This is the existing pattern for associating a day plan with an account.

## 2. Day Plan Handler (`apps/api/internal/handler/dayplan.go`)

The handler struct:
```go
type DayPlanHandler struct {
    dayPlanService *service.DayPlanService
}
```

Methods:
- `List(w, r)` - GET /day-plans (filters: active, plan_type)
- `Get(w, r)` - GET /day-plans/{id} (calls GetDetails for breaks+bonuses)
- `Create(w, r)` - POST /day-plans (uses `models.CreateDayPlanRequest` from generated code)
- `Update(w, r)` - PUT /day-plans/{id} (uses `models.UpdateDayPlanRequest` from generated code)
- `Delete(w, r)` - DELETE /day-plans/{id}
- `Copy(w, r)` - POST /day-plans/{id}/copy
- `AddBreak(w, r)` - POST /day-plans/{id}/breaks
- `DeleteBreak(w, r)` - DELETE /day-plans/{id}/breaks/{breakId}
- `AddBonus(w, r)` - POST /day-plans/{id}/bonuses
- `DeleteBonus(w, r)` - DELETE /day-plans/{id}/bonuses/{bonusId}

The handler uses generated models from `gen/models` for request validation, then converts to service input structs. The Create handler maps optional fields from the request (checking for zero values) to pointer fields on the service input.

Route registration in `routes.go`:
```go
func RegisterDayPlanRoutes(r chi.Router, h *DayPlanHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("day_plans.manage").String()
    r.Route("/day-plans", func(r chi.Router) {
        // ... CRUD + breaks + bonuses
    })
}
```

## 3. Day Plan Service (`apps/api/internal/service/dayplan.go`)

Service struct:
```go
type DayPlanService struct {
    dayPlanRepo dayPlanRepository
}
```

Input structs for Create/Update:
```go
type CreateDayPlanInput struct {
    TenantID             uuid.UUID
    Code                 string
    Name                 string
    Description          *string
    PlanType             model.PlanType
    ComeFrom, ComeTo, GoFrom, GoTo, CoreStart, CoreEnd *int
    RegularHours         int
    ToleranceComePlus    int
    ToleranceComeMinus   int
    ToleranceGoPlus      int
    ToleranceGoMinus     int
    RoundingComeType     *model.RoundingType
    RoundingComeInterval *int
    RoundingGoType       *model.RoundingType
    RoundingGoInterval   *int
    MinWorkTime          *int
    MaxNetWorkTime       *int
}

type UpdateDayPlanInput struct {
    // All fields as pointers for partial update
    Name, Description  *string
    PlanType           *model.PlanType
    // ... all time/tolerance/rounding/cap fields as *int / *model.RoundingType
    IsActive           *bool
}
```

IMPORTANT: The `CreateDayPlanInput` and `UpdateDayPlanInput` structs do NOT include all ZMI fields that exist on the model. For example, the following model fields are NOT in the service input structs:
- `RegularHours2`, `FromEmployeeMaster`, `VariableWorkTime`
- `RoundAllBookings`, `RoundingComeAddValue`, `RoundingGoAddValue`
- `HolidayCreditCat1/2/3`, `VacationDeduction`
- `NoBookingBehavior`, `DayChangeBehavior`
- `ShiftDetectArriveFrom/To`, `ShiftDetectDepartFrom/To`
- `ShiftAltPlan1-6`

These ZMI fields appear to be set through direct model manipulation (e.g., dev seeding) rather than through the service input structs.

The Copy method explicitly copies all model fields including breaks and bonuses.

Bonus/Break input structs:
```go
type CreateBonusInput struct {
    AccountID        uuid.UUID
    TimeFrom, TimeTo int
    CalculationType  model.CalculationType
    ValueMinutes     int
    MinWorkMinutes   *int
    AppliesOnHoliday bool
    SortOrder        int
}
```

## 4. Day Plan Repository (`apps/api/internal/repository/dayplan.go`)

Repository struct:
```go
type DayPlanRepository struct {
    db *DB
}
```

Methods:
- `Create(ctx, plan)` - Uses explicit Select for columns
- `GetByID(ctx, id)` - Simple First query
- `GetByCode(ctx, tenantID, code)` - Lookup by tenant+code
- `GetWithDetails(ctx, id)` - Preloads Breaks (sorted), Bonuses (sorted), and Bonuses.Account
- `Update(ctx, plan)` - Uses GORM Save
- `Upsert(ctx, plan)` - FirstOrCreate with Assign
- `Delete(ctx, id)` - cascade delete
- `List(ctx, tenantID)` - ordered by code
- `ListActive(ctx, tenantID)`
- `ListByPlanType(ctx, tenantID, planType)`
- Break CRUD: `AddBreak`, `UpdateBreak`, `DeleteBreak`, `GetBreak`
- Bonus CRUD: `AddBonus`, `UpdateBonus`, `DeleteBonus`, `GetBonus`

The Create method uses explicit column selection:
```go
Select("TenantID", "Code", "Name", "Description", "PlanType",
       "ComeFrom", "ComeTo", "GoFrom", "GoTo", "CoreStart", "CoreEnd",
       "RegularHours", "ToleranceComePlus", "ToleranceComeMinus",
       "ToleranceGoPlus", "ToleranceGoMinus", "RoundingComeType",
       "RoundingComeInterval", "RoundingGoType", "RoundingGoInterval",
       "MinWorkTime", "MaxNetWorkTime", "IsActive")
```

This is relevant because new fields (e.g., `NetAccountID`, `CapAccountID`) would need to be added to this Select list, or the Create method would need to be updated.

## 5. Current Account Model (`apps/api/internal/model/account.go`)

```go
type Account struct {
    ID                uuid.UUID
    TenantID          *uuid.UUID  // NULL for system accounts
    Code              string
    Name              string
    Description       *string
    AccountType       AccountType   // "bonus" | "day" | "month"
    Unit              AccountUnit   // "minutes" | "hours" | "days"
    DisplayFormat     DisplayFormat // "decimal" | "hh_mm"
    BonusFactor       *float64
    AccountGroupID    *uuid.UUID
    YearCarryover     bool
    IsPayrollRelevant bool
    PayrollCode       *string
    SortOrder         int
    UsageCount        int  // gorm:"-" (computed, not a column)
    IsSystem          bool
    IsActive          bool
}
```
Table name: `accounts`

Account types:
- `bonus` - for bonuses (used by DayPlanBonus)
- `day` - for daily tracking/posting
- `month` - for monthly balances

The ticket specifies that `net_account_id` and `cap_account_id` should reference accounts with `account_type=day`.

### Account Repository

Located at `apps/api/internal/repository/account.go`. Key methods:
- Standard CRUD (Create, GetByID, GetByCode, Upsert, Update, Delete)
- `List(ctx, tenantID)` - tenant accounts only
- `ListWithSystem(ctx, tenantID)` - includes system accounts
- `ListFiltered(ctx, tenantID, includeSystem, active, accountType, payrollRelevant)` - filtered list with usage count subquery
- `ListDayPlansUsingAccount(ctx, tenantID, accountID)` - finds day plans that reference an account via bonuses

The `ListFiltered` method calculates `usage_count` by joining `day_plan_bonuses` to count how many day plans reference each account. If `net_account_id`/`cap_account_id` are added, this usage calculation would need to be expanded.

## 6. Daily Calculation Service (`apps/api/internal/service/daily_calc.go`)

### Service Structure

```go
type DailyCalcService struct {
    bookingRepo     bookingRepository
    empDayPlanRepo  employeeDayPlanRepository
    dayPlanRepo     dayPlanLookup
    dailyValueRepo  dailyValueRepository
    holidayRepo     holidayLookup
    employeeRepo    employeeLookup
    absenceDayRepo  absenceDayLookup
    calc            *calculation.Calculator
    notificationSvc *NotificationService
    orderBookingSvc orderBookingCreator
    settingsLookup  settingsLookup
}
```

### CalculateDay Flow

`CalculateDay(ctx, tenantID, employeeID, date)` returns `(*model.DailyValue, error)`:

1. Check for holiday
2. Get day plan via `empDayPlanRepo.GetForEmployeeDate(ctx, employeeID, date)`
3. Load bookings (with cross-midnight support)
4. Handle special cases:
   - **Off day** (no plan): Creates DailyValue with TargetTime=0, Warnings=["OFF_DAY"]
   - **Holiday without bookings**: Applies holiday credit
   - **No bookings**: Applies no-booking behavior (adopt_target, deduct_target, vocational_school, target_with_order, error)
   - **Normal calculation**: `calculateWithBookings(...)` runs the Calculator
5. Persist DailyValue via `dailyValueRepo.Upsert(ctx, dailyValue)`
6. Notify on newly detected errors

### calculateWithBookings

This method:
1. Runs shift detection if configured
2. Builds `calculation.CalculationInput` from day plan and bookings
3. Calls `s.calc.Calculate(input)` which returns `calculation.CalculationResult`
4. Converts result to `model.DailyValue` via `resultToDailyValue`
5. Updates booking calculated times

### resultToDailyValue

```go
func (s *DailyCalcService) resultToDailyValue(employeeID uuid.UUID, date time.Time, result calculation.CalculationResult) *model.DailyValue {
    return &model.DailyValue{
        EmployeeID:         employeeID,
        ValueDate:          date,
        Status:             statusFromError(result.HasError),
        GrossTime:          result.GrossTime,
        NetTime:            result.NetTime,
        TargetTime:         result.TargetTime,
        Overtime:           result.Overtime,
        Undertime:          result.Undertime,
        BreakTime:          result.BreakTime,
        HasError:           result.HasError,
        ErrorCodes:         result.ErrorCodes,
        Warnings:           result.Warnings,
        FirstCome:          result.FirstCome,
        LastGo:             result.LastGo,
        BookingCount:       result.BookingCount,
        CalculatedAt:       &now,
        CalculationVersion: 1,
    }
}
```

Currently, no account posting happens after daily calculation. The `CalculationResult` struct already contains `NetTime` and `CappedTime` fields.

### Recalculation

Located at `apps/api/internal/service/recalc.go`. The `RecalcService` delegates to `DailyCalcService`:

```go
type RecalcService struct {
    dailyCalc    dailyCalcServiceForRecalc
    employeeRepo employeeRepositoryForRecalc
}
```

Methods:
- `TriggerRecalc(ctx, tenantID, employeeID, date)` - single day
- `TriggerRecalcRange(ctx, tenantID, employeeID, from, to)` - date range
- `TriggerRecalcBatch(ctx, tenantID, employeeIDs, from, to)` - multiple employees
- `TriggerRecalcAll(ctx, tenantID, from, to)` - all active employees

Recalculation simply calls `CalculateDay` again, which uses `dailyValueRepo.Upsert()` (upsert on employee_id+value_date unique constraint), so existing values are replaced.

## 7. Calculation Engine (`apps/api/internal/calculation/`)

### CalculationResult (types.go)

```go
type CalculationResult struct {
    GrossTime  int
    NetTime    int
    TargetTime int
    Overtime   int
    Undertime  int
    BreakTime  int

    FirstCome    *int
    LastGo       *int
    BookingCount int

    CalculatedTimes map[uuid.UUID]int
    Pairs          []BookingPair
    UnpairedInIDs  []uuid.UUID
    UnpairedOutIDs []uuid.UUID

    CappedTime int           // Total minutes capped from all sources
    Capping    CappingResult // Detailed capping breakdown

    HasError   bool
    ErrorCodes []string
    Warnings   []string
}
```

Both `NetTime` and `CappedTime` are already computed by the calculator.

### Capping System (capping.go)

```go
type CappingSource string
const (
    CappingSourceEarlyArrival CappingSource = "early_arrival"
    CappingSourceLateLeave    CappingSource = "late_leave"
    CappingSourceMaxNetTime   CappingSource = "max_net_time"
)

type CappedTime struct {
    Minutes int
    Source  CappingSource
    Reason  string
}

type CappingResult struct {
    TotalCapped int
    Items       []CappedTime
}
```

Functions:
- `CalculateEarlyArrivalCapping(arrivalTime, windowStart, toleranceMinus, variableWorkTime)`
- `CalculateLateDepatureCapping(departureTime, windowEnd, tolerancePlus)`
- `CalculateMaxNetTimeCapping(netWorkTime, maxNetWorkTime)`
- `AggregateCapping(items ...*CappedTime) CappingResult`
- `ApplyCapping(netWorkTime, maxNetWorkTime) (adjustedNet, capped)`
- `ApplyWindowCapping(bookingTime, windowStart, windowEnd, toleranceMinus, tolerancePlus, isArrival, variableWorkTime)`

The capping system already computes detailed breakdown of capped minutes.

## 8. DailyValue Model (`apps/api/internal/model/dailyvalue.go`)

```go
type DailyValue struct {
    ID         uuid.UUID
    TenantID   uuid.UUID
    EmployeeID uuid.UUID
    ValueDate  time.Time

    Status     DailyValueStatus  // "pending" | "calculated" | "error" | "approved"

    GrossTime  int
    NetTime    int
    TargetTime int
    Overtime   int
    Undertime  int
    BreakTime  int

    HasError   bool
    ErrorCodes pq.StringArray
    Warnings   pq.StringArray

    FirstCome    *int
    LastGo       *int
    BookingCount int

    CalculatedAt       *time.Time
    CalculationVersion int
}
```

Table name: `daily_values`
Unique constraint: `(employee_id, value_date)`

## 9. Existing Account Value Tracking

### OpenAPI Schema (`api/schemas/accounts.yaml`)

An `AccountValue` schema already exists in the OpenAPI spec:

```yaml
AccountValue:
  type: object
  required:
    - id
    - tenant_id
    - employee_id
    - account_id
    - value_date
    - value_minutes
  properties:
    id: { type: string, format: uuid }
    tenant_id: { type: string, format: uuid }
    employee_id: { type: string, format: uuid }
    account_id: { type: string, format: uuid }
    value_date: { type: string, format: date }
    value_minutes: { type: integer, example: 60 }
    source:
      type: string
      enum: [calculated, manual, correction, import]
    source_id: { type: string, format: uuid, x-nullable: true }
    created_at: { type: string, format: date-time }
    updated_at: { type: string, format: date-time }
    account: { allOf: [$ref: AccountSummary], x-nullable: true }
    employee: { allOf: [$ref: EmployeeSummary], x-nullable: true }
```

Also has `AccountValueList` wrapper.

### Database State

There is NO `account_values` table in any migration. The `AccountValue` schema exists in OpenAPI but has no corresponding:
- Migration (no `CREATE TABLE account_values`)
- Internal model (no `account_value.go` in model/)
- Repository (no `accountvalue.go` in repository/)
- Service (no service or handler for account values)

The ticket mentions `daily_account_values` as an alternative name. Neither table exists.

### Payroll Export Usage

The payroll export uses `AccountValues` as a computed map (`map[string]float64`), not a stored table. It is a field on `PayrollExportLine` for export output only.

## 10. OpenAPI Spec Structure for Day Plans

### Schema (`api/schemas/day-plans.yaml`)

Defines: `DayPlan`, `DayPlanSummary`, `DayPlanBreak`, `DayPlanBonus`, `CreateDayPlanRequest`, `UpdateDayPlanRequest`, `CopyDayPlanRequest`, `CreateDayPlanBreakRequest`, `CreateDayPlanBonusRequest`, `DayPlanList`.

Currently NO `net_account_id` or `cap_account_id` in any of these schemas.

### Paths (`api/paths/day-plans.yaml`)

Endpoints:
- `GET /day-plans` (listDayPlans) - filter by active, plan_type
- `POST /day-plans` (createDayPlan)
- `GET /day-plans/{id}` (getDayPlan) - returns with breaks and bonuses
- `PUT /day-plans/{id}` (updateDayPlan)
- `DELETE /day-plans/{id}` (deleteDayPlan)
- `POST /day-plans/{id}/copy` (copyDayPlan)
- `POST /day-plans/{id}/breaks` (createDayPlanBreak)
- `DELETE /day-plans/{id}/breaks/{breakId}` (deleteDayPlanBreak)
- `POST /day-plans/{id}/bonuses` (createDayPlanBonus)
- `DELETE /day-plans/{id}/bonuses/{bonusId}` (deleteDayPlanBonus)

### Account Schema (`api/schemas/accounts.yaml`)

Defines: `Account`, `AccountSummary`, `AccountValue`, `CreateAccountRequest`, `UpdateAccountRequest`, `AccountList`, `AccountValueList`, `AccountUsageDayPlan`, `AccountUsage`.

## 11. Migration Patterns

### Naming Convention
Files: `NNNNNN_description.{up,down}.sql` with 6-digit zero-padded sequential numbers.

### Latest Migration
The latest migration is `000078_booking_reason_adjustments`. The next migration would be `000079`.

### Relevant Existing Migrations

| Number | Name | Description |
|--------|------|-------------|
| 000006 | create_accounts | Initial accounts table with system accounts (FLEX, OT, VAC) |
| 000015 | create_day_plans | Initial day_plans table |
| 000016 | create_day_plan_breaks | Breaks sub-table |
| 000017 | create_day_plan_bonuses | Bonuses sub-table with account_id FK |
| 000024 | create_daily_values | Daily values table |
| 000028 | create_monthly_values | Monthly values table |
| 000030 | add_day_plan_zmi_fields | Added: regular_hours_2, from_employee_master, variable_work_time, round_all_bookings, rounding add values, holiday credits, vacation_deduction, no_booking_behavior, day_change_behavior, shift detection fields |
| 000033 | add_account_fields | Added: description, is_payroll_relevant, payroll_code, sort_order, year_carryover |
| 000043 | account_groups_and_fields | Created account_groups table; added account_group_id, display_format, bonus_factor to accounts; migrated account_type enum values |

### Pattern for Adding Columns
Migration 000030 pattern for adding columns to day_plans:
```sql
ALTER TABLE day_plans
    ADD COLUMN IF NOT EXISTS column_name TYPE DEFAULT value;
```

### Pattern for Creating Tables
Migration 000024 pattern:
```sql
CREATE TABLE table_name (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- columns...
    UNIQUE(constraint_columns)
);
CREATE INDEX idx_name ON table_name(columns);
```

## 12. Summary of Gaps for ZMI-TICKET-036

### What Needs to Be Created

1. **Migration (000079)**: Add `net_account_id` and `cap_account_id` nullable UUID columns to `day_plans` table with FK to `accounts(id)`. Create `daily_account_values` table.

2. **Internal Model**: Add `NetAccountID *uuid.UUID` and `CapAccountID *uuid.UUID` fields to `model.DayPlan`. Create new `model.DailyAccountValue` struct.

3. **OpenAPI Schema**: Add `net_account_id` and `cap_account_id` to `DayPlan`, `CreateDayPlanRequest`, and `UpdateDayPlanRequest` in `api/schemas/day-plans.yaml`.

4. **Generated Models**: Re-run `make generate` after OpenAPI changes to update `gen/models/`.

5. **Repository**: Update `DayPlanRepository.Create` column select list. Create `DailyAccountValueRepository` with CRUD and upsert methods.

6. **Service**: Update `CreateDayPlanInput` and `UpdateDayPlanInput` with new fields. Update `DayPlanService.Create` and `Update` to handle new fields. Update `DayPlanService.Copy` to copy new fields. Extend `DailyCalcService.CalculateDay` to post `NetTime` and `CappedTime` to accounts after calculation.

7. **Handler**: Update `DayPlanHandler.Create` and `Update` to map new fields from generated request models. Add endpoint for reading daily account values (or add to existing routes).

8. **Recalculation**: The `DailyCalcService.CalculateDay` already handles recalc by upserting. Account postings must also use upsert semantics (replace existing postings for same employee/date/account/source).

### Existing Patterns to Follow

- **Account FK on day plan**: Follow the `DayPlanBonus.AccountID` pattern (uuid.UUID FK to accounts)
- **Upsert semantics**: Follow `dailyValueRepo.Upsert` pattern for account value postings
- **Off-day handling**: `handleOffDay` returns DailyValue with TargetTime=0 and no bookings - should not post account values
- **OpenAPI**: Add fields to schema, run `make swagger-bundle` then `make generate`
- **Migration**: Use `000079_add_day_plan_net_cap_accounts.{up,down}.sql`

### Key Values Available from Calculator

- `CalculationResult.NetTime` (int, minutes) - net work time after breaks
- `CalculationResult.CappedTime` (int, minutes) - total minutes capped from all sources
- `CalculationResult.Capping.TotalCapped` (int, minutes) - same as CappedTime
- `CalculationResult.Capping.Items` ([]CappedTime) - breakdown by source

### Account Usage Tracking

The `AccountRepository.ListFiltered` method calculates `usage_count` by counting day_plan_bonuses references. When `net_account_id`/`cap_account_id` are added, this usage count query should be extended to also count day_plans that reference the account via these new fields. Similarly, `ListDayPlansUsingAccount` should be extended.
