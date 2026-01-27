# Research: NOK-145 - Add Missing Day Plan ZMI Fields

**Date**: 2026-01-24
**Ticket**: NOK-145 (TICKET-118)
**Type**: Migration + Model Update

---

## 1. Current Day Plans Table Structure

**Migration**: `db/migrations/000015_create_day_plans.up.sql`

Current columns:
- `id` UUID PK
- `tenant_id` UUID NOT NULL (FK tenants)
- `code` VARCHAR(20) NOT NULL
- `name` VARCHAR(255) NOT NULL
- `description` TEXT
- `plan_type` VARCHAR(20) NOT NULL DEFAULT 'fixed' ('fixed', 'flextime')
- `come_from` INT (minutes from midnight)
- `come_to` INT
- `go_from` INT
- `go_to` INT
- `core_start` INT
- `core_end` INT
- `regular_hours` INT NOT NULL DEFAULT 480
- `tolerance_come_plus` INT DEFAULT 0
- `tolerance_come_minus` INT DEFAULT 0
- `tolerance_go_plus` INT DEFAULT 0
- `tolerance_go_minus` INT DEFAULT 0
- `rounding_come_type` VARCHAR(20)
- `rounding_come_interval` INT
- `rounding_go_type` VARCHAR(20)
- `rounding_go_interval` INT
- `min_work_time` INT
- `max_net_work_time` INT
- `is_active` BOOLEAN DEFAULT true
- `created_at` TIMESTAMPTZ
- `updated_at` TIMESTAMPTZ
- UNIQUE(tenant_id, code)

Indexes: `idx_day_plans_tenant`, `idx_day_plans_active`

---

## 2. Current DayPlan Model

**File**: `apps/api/internal/model/dayplan.go`

The model contains:
- Type definitions: `PlanType` (fixed, flextime), `RoundingType` (none, up, down, nearest)
- Struct fields matching the DB columns exactly
- Relations: `Breaks []DayPlanBreak`, `Bonuses []DayPlanBonus`
- No helper methods on DayPlan currently (only `TableName()`)

Related structs in same file:
- `DayPlanBreak` - break types (fixed, variable, minimum) with time windows, duration, thresholds
- `DayPlanBonus` - surcharge/bonus rules with accounts, time windows, calculation types

---

## 3. Migration Patterns

### Latest Migration Number
Current latest: **000028** (`create_monthly_values`)

### ALTER Migration Pattern (from 000008_alter_users_multitenancy)

**Up migration:**
```sql
ALTER TABLE table_name
    ADD COLUMN IF NOT EXISTS column_name TYPE,
    ADD COLUMN IF NOT EXISTS column_name TYPE DEFAULT value;

CREATE INDEX IF NOT EXISTS idx_name ON table(columns);
```

**Down migration:**
```sql
DROP INDEX IF EXISTS idx_name;

ALTER TABLE table_name
    DROP COLUMN IF EXISTS column_name,
    DROP COLUMN IF EXISTS column_name;
```

### Migration Number Determination
The ticket plan specifies migration 000030 based on this sequence:
- 000025: absence_types (exists)
- 000026: absence_days (exists)
- 000027: vacation_balances (exists)
- 000028: monthly_values (exists)
- 000029: reserved for add_tariff_zmi_fields or add_employee/holiday_zmi_fields (does NOT exist yet)
- 000030: add_day_plan_zmi_fields (this ticket)

Since 000029 does not exist, this migration should use **000029** as its number to avoid gaps, UNLESS dependencies (TICKET-123/124/125) must be implemented first. Per the ticket dependencies, TICKET-123 (employee ZMI fields), TICKET-124 (holiday ZMI fields), and TICKET-125 (tariff ZMI fields) are listed as dependencies. However, none of those migrations exist yet and the ticket description states migration 000030. Given that the migration only adds columns to day_plans and day_plan_breaks (self-referencing FK to day_plans for shift_alt_plan columns), it has no actual hard dependency on those other migrations. The correct approach is to use **000029** as the next available number.

---

## 4. Helper Method Patterns in Other Models

Models use receiver methods with clear patterns:

```go
// Boolean checks
func (edp *EmployeeDayPlan) IsOffDay() bool { ... }
func (c *EmployeeCard) IsValid() bool { ... }
func (bt *BookingType) IsInbound() bool { ... }
func (at *AbsenceType) IsVacationType() bool { ... }

// Calculated values
func (e *Employee) FullName() string { ... }
func (dv *DailyValue) Balance() int { ... }
func (mv *MonthlyValue) Balance() int { ... }
func (at *AbsenceType) CreditMultiplier() float64 { ... }

// Formatted strings
func (dv *DailyValue) FormatGrossTime() string { ... }
func (b *Booking) TimeString() string { ... }

// Lookup/getter methods
func (wp *WeekPlan) GetDayPlanIDForWeekday(weekday time.Weekday) *uuid.UUID { ... }
func (at *AbsenceType) GetEffectiveCode(isHoliday bool) string { ... }
func (at *AbsenceType) CalculateCredit(regelarbeitszeit int) int { ... }
```

The proposed helper methods match this pattern well:
- `GetEffectiveRegularHours(isAbsenceDay bool, employeeTargetMinutes *int) int`
- `GetHolidayCredit(category int) int`
- `HasShiftDetection() bool`
- `GetAlternativePlanIDs() []uuid.UUID`

---

## 5. ZMI Reference - Relevant Field Definitions

From `thoughts/shared/reference/zmi-calculataion-manual-reference.md`:

### Regelarbeitszeit 2 (Section 3, Page 40)
> "Regelarbeitszeit 2 can be filled if a different regular working time should be valid on this day for stored absence days."

### Aus Personalstamm holen (Section 3, Page 40)
> "The checkbox 'Get from employee master' is set when ZMI Time should get the regular working time from the employee master data. This is useful when employees with different target times work according to the same day plan."

### Variable Arbeitszeit (Section 6.2, Page 43-44)
> "The 'Toleranz Kommen (-)' is only considered when the checkbox 'variable Arbeitszeit' is set."

Only applies to Festarbeitszeit (FAZ) plans. Enables the Toleranz Kommen minus field to function.

### Alle Buchungen runden (Section 7.6, Page 44-45)
> "By default, this function is disabled: Then only the first arrival booking and the last departure booking are rounded. If the checkbox is activated, ALL arrival and departure bookings are rounded."

### Wert addieren/subtrahieren (Section 7.5, Page 44-45)
> "With this setting, the set value is added to or subtracted from the booking. This setting is needed when employees have a long way from the time recording terminal to their workplace."

### Zeitgutschrift an Feiertagen (Section 8.1, Page 46)
> "You set which time the program should credit on holidays. Usually Category 1 is the full holiday and Category 2 is the half holiday."

3 categories: full, half, custom

### Urlaubsbewertung (Section 8.2, Page 46)
> "Enter the value that the program should deduct from the remaining vacation account. Normally 1 so one day is deducted. Alternatively an hour value for tracking in hours."

### Tage ohne Buchungen (Section 8.3, Page 46-47)
5 variants: No evaluation (error), Deduct target hours, Vocational school day, Adopt target hours, Target hours with default order

### Tageswechsel (Section 8.4, Page 47)
4 variants: No day change, Evaluate at arrival, Evaluate at departure, Auto-complete (split at midnight)

### Schichterkennung (Section 10, Page 48-49)
- Arrival-based detection: checks if booking is within arrival window
- Departure-based detection: same for departure
- Up to 6 alternative day plans
- If no match found: "No matching time plan found" error

### Minuten Differenz (Section 5.8, Page 42)
> "The checkbox 'Minuten Differenz' (applies to both minimum breaks!) means proportional break deduction when near threshold."

---

## 6. Existing Usage of DayPlan in Services/Handlers

### daily_calc.go (Service)
- **Line 56-72**: Explicitly notes `DailyCalcConfig` should come from DayPlan once NOK-145 adds the fields. Currently uses `DefaultDailyCalcConfig()`.
- **Line 125-126**: Comment: "Use defaults until NOK-145 adds ZMI fields to day_plans"
- **Line 344-405**: `buildCalcInput()` converts DayPlan fields to `calculation.DayPlanInput`. Will need updating to pass new fields.

### calculation/types.go
- `BreakConfig` already has `MinutesDifference bool` field (added previously)
- `DayPlanInput` will need new fields for: RoundAllBookings, RoundingComeAddValue, RoundingGoAddValue

### dayplan.go (Service)
- `CreateDayPlanInput` and `UpdateDayPlanInput` structs list all fields - will need new ZMI fields added
- `Copy()` method copies all fields - will need new ZMI fields added

### dayplan.go (Handler)
- Create/Update handlers map request body to service inputs - will need new fields mapped

### dayplan.go (Repository)
- `Create()` uses explicit `.Select()` listing all columns - will need new columns added

---

## 7. Employee Model - Target Hours for FromEmployeeMaster

The current Employee model (`apps/api/internal/model/employee.go`) has:
- `WeeklyHours decimal.Decimal` - default 40.00

It does **NOT** yet have a `DailyTargetMinutes` or `Tagessollstunden` field. This is expected from TICKET-123 (add_employee_zmi_fields). The `FromEmployeeMaster` feature on the day plan will look up this field from the employee/tariff.

The tariff model (`apps/api/internal/model/tariff.go`) may already have or will get daily target hours from TICKET-125.

---

## 8. Implementation Notes

### Migration Number
Use **000029** as the next sequential migration number (000028 is the latest existing migration).

### New Type Definitions Needed
```go
type NoBookingBehavior string  // "error", "deduct_target", "vocational_school", "adopt_target", "target_with_order"
type DayChangeBehavior string  // "none", "at_arrival", "at_departure", "auto_complete"
```

Note: The `daily_calc.go` service already defines `NoBookingBehavior` and `DayChangeBehavior` types (with slightly different values). These should be moved to the model package or the model should use the service types. The ticket plan uses the model package, which is the correct location per architecture.

**Potential conflict**: The service defines:
- `NoBookingError`, `NoBookingCreditTarget`, `NoBookingCreditZero`, `NoBookingSkip`, `NoBookingUseAbsence`
- `DayChangeToFirst`, `DayChangeToSecond`, `DayChangeSplit`, `DayChangeByShift`

The ticket plan defines:
- `NoBookingError`, `NoBookingDeductTarget`, `NoBookingVocationalSchool`, `NoBookingAdoptTarget`, `NoBookingTargetWithOrder`
- `DayChangeNone`, `DayChangeAtArrival`, `DayChangeAtDeparture`, `DayChangeAutoComplete`

The ticket plan values more closely match the ZMI reference. When implementing, the service should be updated to use the model types.

### New Fields on DayPlan (22 fields)
1. `regular_hours_2` INT - alternative target for absence days
2. `from_employee_master` BOOLEAN DEFAULT FALSE
3. `variable_work_time` BOOLEAN DEFAULT FALSE
4. `round_all_bookings` BOOLEAN DEFAULT FALSE
5. `rounding_come_add_value` INT - add/subtract for arrivals
6. `rounding_go_add_value` INT - add/subtract for departures
7. `holiday_credit_cat1` INT - minutes for cat 1 holiday
8. `holiday_credit_cat2` INT - minutes for cat 2 holiday
9. `holiday_credit_cat3` INT - minutes for cat 3 holiday
10. `vacation_deduction` DECIMAL(5,2) DEFAULT 1.00
11. `no_booking_behavior` VARCHAR(30) DEFAULT 'error'
12. `day_change_behavior` VARCHAR(30) DEFAULT 'none'
13. `shift_detect_arrive_from` INT
14. `shift_detect_arrive_to` INT
15. `shift_detect_depart_from` INT
16. `shift_detect_depart_to` INT
17. `shift_alt_plan_1` UUID (FK day_plans)
18. `shift_alt_plan_2` UUID (FK day_plans)
19. `shift_alt_plan_3` UUID (FK day_plans)
20. `shift_alt_plan_4` UUID (FK day_plans)
21. `shift_alt_plan_5` UUID (FK day_plans)
22. `shift_alt_plan_6` UUID (FK day_plans)

### New Field on DayPlanBreak (1 field)
1. `minutes_difference` BOOLEAN DEFAULT FALSE

### Helper Methods (4 methods)
1. `GetEffectiveRegularHours(isAbsenceDay bool, employeeTargetMinutes *int) int`
2. `GetHolidayCredit(category int) int`
3. `HasShiftDetection() bool`
4. `GetAlternativePlanIDs() []uuid.UUID`

### Files to Create
- `db/migrations/000029_add_day_plan_zmi_fields.up.sql`
- `db/migrations/000029_add_day_plan_zmi_fields.down.sql`

### Files to Modify
- `apps/api/internal/model/dayplan.go` (add types, fields, and methods)

### Downstream Updates (NOT part of this ticket, but documented)
After this migration, the following should be updated in follow-up tickets:
- `apps/api/internal/service/daily_calc.go` - remove DefaultDailyCalcConfig, use DayPlan fields
- `apps/api/internal/service/dayplan.go` - add new fields to Create/Update inputs, Copy method
- `apps/api/internal/handler/dayplan.go` - add new fields to request mapping
- `apps/api/internal/repository/dayplan.go` - add new columns to Create Select list
- `apps/api/internal/calculation/types.go` - add RoundAllBookings, AddValue to DayPlanInput

---

## 9. Key Decisions

1. **Migration number**: 000029 (next available, not 000030 as ticket plan states since it was written before migrations 000025-000028 were created)
2. **NoBookingBehavior/DayChangeBehavior types**: Define in model package to follow architecture pattern (types belong in model, not service)
3. **Self-referencing FK**: The `shift_alt_plan_1..6` columns reference `day_plans(id)` - this is a self-referencing foreign key on the same table, which is valid in PostgreSQL
4. **MinutesDifference on DayPlanBreak**: The calculation package already supports this field in `BreakConfig` (added in TICKET-064), so this migration brings the DB/model in alignment
5. **Vacation deduction**: Uses `DECIMAL(5,2)` to support both day-based (1.0) and hour-based (8.0) tracking
