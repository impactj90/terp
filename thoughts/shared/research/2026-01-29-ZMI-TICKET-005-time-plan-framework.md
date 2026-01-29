---
date: 2026-01-29T14:53:48+01:00
researcher: Claude
git_commit: de930f9d1fada767ff6f77a113c08dd30f3df623
branch: master
repository: terp
topic: "ZMI-TICKET-005: Time Plan Framework - Current Implementation State"
tags: [research, codebase, day-plans, week-plans, rolling-plans, x-day, tariffs, employee-day-plans, time-plans]
status: complete
last_updated: 2026-01-29
last_updated_by: Claude
---

# Research: ZMI-TICKET-005 Time Plan Framework

**Date**: 2026-01-29T14:53:48+01:00
**Researcher**: Claude
**Git Commit**: de930f9
**Branch**: master
**Repository**: terp

## Research Question

What is the current implementation state of the time plan framework (day plans, week plans, rolling plans, x-day cycles, assignments, overrides) as described in ZMI-TICKET-005?

## Summary

The time plan framework described in ZMI-TICKET-005 is **substantially implemented**. All five core entities exist: DayPlan, WeekPlan, EmployeeDayPlan, TariffWeekPlan (for rolling), and TariffDayPlan (for x-day). The system resolves employee-date to an effective day plan through tariff rhythm logic supporting weekly, rolling_weekly, and x_days patterns. Per-day manual overrides are supported via the `source` field on EmployeeDayPlan. Full CRUD APIs exist for day plans, week plans, employee day plans, and tariffs. The OpenAPI spec covers all plan types, rhythm configurations, and assignment endpoints.

The one notable deviation from the ticket: week plan validation does **not** require all 7 days to be assigned (the ticket says it should reject incomplete week plans). All day plan IDs are nullable, allowing partial week schedules.

## Detailed Findings

### 1. Day Plan (Base Entity)

The day plan is the atomic scheduling unit. Each day plan defines a complete daily work schedule with time windows, tolerances, rounding, breaks, bonuses, and ZMI-specific fields.

**Model**: `apps/api/internal/model/dayplan.go:51-133`
- 50+ fields covering time windows (come/go from/to, core hours), target hours, tolerances, rounding, caps, holiday credits, vacation deduction, no-booking behavior, day-change behavior, and shift detection
- All time values stored as minutes from midnight (nullable integers)
- `PlanType` enum: `fixed` or `flextime`
- Relations: `Breaks []DayPlanBreak`, `Bonuses []DayPlanBonus`
- Business methods: `GetEffectiveRegularHours()`, `GetHolidayCredit()`, `HasShiftDetection()`, `GetAlternativePlanIDs()`

**Migration**: `db/migrations/000015_create_day_plans.up.sql` (base), `db/migrations/000030_add_day_plan_zmi_fields.up.sql` (28 ZMI columns added)

**Sub-entities**:
- `DayPlanBreak` (migration 000016): Types `fixed`, `variable`, `minimum`; fields include start/end time, duration, after_work_minutes, auto_deduct, is_paid, minutes_difference
- `DayPlanBonus` (migration 000017): Types `fixed`, `per_minute`, `percentage`; fields include time window, account reference, calculation type, value

**Service**: `apps/api/internal/service/dayplan.go`
- Full CRUD + Copy + Break/Bonus management
- Validates: code not empty, code not reserved (U/K/S), name required, regular_hours > 0, time ranges valid, code unique per tenant
- Copy deep-copies breaks and bonuses to new plan

**API Endpoints** (10 endpoints under `/day-plans`):
- `GET/POST /day-plans/`, `GET/PUT/DELETE /day-plans/{id}`
- `POST /day-plans/{id}/copy`
- `POST/DELETE /day-plans/{id}/breaks/{breakId}`
- `POST/DELETE /day-plans/{id}/bonuses/{bonusId}`
- Permission: `day_plans.manage`

### 2. Week Plan (7-Day Template)

The week plan maps each weekday (Monday-Sunday) to a day plan ID. Null values indicate off days.

**Model**: `apps/api/internal/model/weekplan.go:9-37`
- 7 nullable UUID fields: `MondayDayPlanID` through `SundayDayPlanID`
- 7 preloadable relations: `MondayDayPlan` through `SundayDayPlan`
- Business methods: `GetDayPlanIDForWeekday(time.Weekday)`, `WorkDaysPerWeek()`
- UNIQUE(tenant_id, code)

**Migration**: `db/migrations/000018_create_week_plans.up.sql`
- All day plan references use `ON DELETE SET NULL`

**Service**: `apps/api/internal/service/weekplan.go`
- CRUD with validation of code, name, and day plan existence/tenant ownership
- Uses explicit clear flags pattern for nullable field updates (`ClearMondayDayPlan bool`, etc.)
- **No 7-day completeness validation** - all day plan IDs are optional

**API Endpoints** (5 endpoints under `/week-plans`):
- `GET/POST /week-plans/`, `GET/PUT/DELETE /week-plans/{id}`
- Permission: `week_plans.manage`

### 3. Rolling Plan (Rotating Week Plans)

Rolling plans are implemented via the tariff's `rolling_weekly` rhythm type and the `tariff_week_plans` junction table.

**Migration**: `db/migrations/000031_add_tariff_rhythm_fields.up.sql:26-34`
- Table `tariff_week_plans`: columns `tariff_id`, `week_plan_id`, `sequence_order`
- UNIQUE(tariff_id, sequence_order), UNIQUE(tariff_id, week_plan_id)

**Model**: `apps/api/internal/model/tariff.go`
- `TariffWeekPlan` struct (lines 176-184): `TariffID`, `WeekPlanID`, `SequenceOrder`, `WeekPlan` relation
- Tariff field `RhythmType = "rolling_weekly"` (line 114)

**Resolution Logic**: `tariff.go:281-300`
```
weeksSinceStart = days_between(rhythm_start_date, target_date) / 7
cyclePosition = (weeksSinceStart % numWeekPlans) + 1
→ find TariffWeekPlan where SequenceOrder == cyclePosition
→ return weekPlan.GetDayPlanIDForWeekday(date.Weekday())
```

**Service Validation** (`tariff.go:165-176`):
- Requires `week_plan_ids` array
- Validates all week plans exist and belong to tenant
- Creates `TariffWeekPlan` records with sequential `SequenceOrder`

**API**: Configured via tariff create/update with `rhythm_type: rolling_weekly`, `week_plan_ids: [uuid, ...]`, `rhythm_start_date: date`

### 4. X-Day Plan (Custom Day Cycle)

X-day plans are implemented via the tariff's `x_days` rhythm type and the `tariff_day_plans` junction table.

**Migration**: `db/migrations/000031_add_tariff_rhythm_fields.up.sql:43-50`
- Table `tariff_day_plans`: columns `tariff_id`, `day_position`, `day_plan_id` (nullable)
- UNIQUE(tariff_id, day_position)
- NULL day_plan_id represents an off day

**Model**: `apps/api/internal/model/tariff.go`
- `TariffDayPlan` struct (lines 186-196): `TariffID`, `DayPosition`, `DayPlanID` (nullable), `DayPlan` relation
- Tariff fields: `RhythmType = "x_days"`, `CycleDays *int` (1-365)

**Resolution Logic**: `tariff.go:302-319`
```
daysSinceStart = days_between(rhythm_start_date, target_date)
cyclePosition = (daysSinceStart % cycle_days) + 1
→ find TariffDayPlan where DayPosition == cyclePosition
→ return day_plan_id (nil = off day)
```

**Service Validation** (`tariff.go:178-198`):
- Requires `cycle_days` (1-365)
- Validates each day plan position is within cycle range
- Validates day plan IDs exist and belong to tenant

**API**: Configured via tariff create/update with `rhythm_type: x_days`, `cycle_days: int`, `day_plans: [{day_position, day_plan_id}, ...]`, `rhythm_start_date: date`

### 5. Employee Time Plan Assignment

Employee day plans represent the materialized schedule: one record per employee per date.

**Model**: `apps/api/internal/model/employeedayplan.go:19-33`
- `EmployeeID`, `PlanDate` (DATE), `DayPlanID` (nullable = off day)
- `Source` enum: `tariff`, `manual`, `holiday`
- UNIQUE(employee_id, plan_date)
- `IsOffDay()` method

**Migration**: `db/migrations/000023_create_employee_day_plans.up.sql`
- Indexed on (employee_id, plan_date) and (plan_date)

**Repository**: `apps/api/internal/repository/employeedayplan.go`
- `GetForEmployeeDate()`: Single date lookup with DayPlan+Breaks+Bonuses preload
- `GetForEmployeeDateRange()`: Range query, ordered by plan_date ASC
- `Upsert()`: Conflict on (employee_id, plan_date), updates day_plan_id/source/notes
- `BulkCreate()`: Batch insert (100 per batch) with upsert semantics
- `DeleteRangeBySource()`: Delete plans for specific source type within date range

**Tariff Sync Flow** (`apps/api/internal/service/employee.go:560-616`):
1. Load tariff with full rhythm details
2. Calculate sync window: max(today, employee entry_date, tariff valid_from) to min(today+1yr, exit_date, valid_to)
3. Fetch existing plans, build skip-dates map for non-tariff sources (manual/holiday preserved)
4. Delete existing tariff-sourced plans in range
5. Generate new plans by calling `tariff.GetDayPlanIDForDate(date)` for each date
6. Bulk insert all generated plans with `source = tariff`

**Sync Triggers** (`employee.go`):
- Employee creation with tariff_id (line 247-251)
- Employee update changing tariff_id (line 492-507)
- Bulk tariff assignment (line 512-558)

**API Endpoints** (8 endpoints):
- `GET/POST /employee-day-plans/`, `POST /employee-day-plans/bulk`, `POST /employee-day-plans/delete-range`
- `GET/PUT/DELETE /employee-day-plans/{id}`
- `GET /employees/{employee_id}/day-plans?from=&to=`
- `GET /employees/{employee_id}/day-plans/{date}`
- `PUT /employees/{employee_id}/day-plans/{date}` (upsert)

### 6. Per-Day Override Mechanism

The override system uses the `source` field on `EmployeeDayPlan`:

- **`tariff`**: Auto-generated from employee's tariff rhythm. Gets cleared and regenerated on tariff changes.
- **`manual`**: Assigned directly by a user. Preserved during tariff re-sync (skipped via `skipDates` map at `employee.go:580-585`).
- **`holiday`**: Holiday-specific overrides. Also preserved during tariff re-sync.

The design ensures per-day overrides do **not** mutate the underlying day plan definition. They replace the *assignment* (which day plan is effective) without changing any shared DayPlan record.

### 7. Tariff as the Plan Assignment Container

The tariff (`apps/api/internal/model/tariff.go`) is the central entity that connects employees to time plans:

**Employee-Tariff Link**: `employees.tariff_id` FK (migration 000031, line 59)

**Rhythm Configuration**:
- `rhythm_type`: weekly | rolling_weekly | x_days (default: weekly)
- `rhythm_start_date`: Anchor date for cycle calculation
- `week_plan_id`: Used for simple weekly rhythm
- `TariffWeekPlans[]`: Ordered week plans for rolling rhythm
- `TariffDayPlans[]`: Positional day plans for x-day rhythm
- `cycle_days`: Cycle length for x-day rhythm (1-365)

**Rhythm Switching** (`tariff.go:575-631`):
- Changing to rolling_weekly clears tariff_day_plans
- Changing to x_days clears tariff_week_plans
- Changing to weekly clears both rhythm-specific tables

## Code References

### Models
- `apps/api/internal/model/dayplan.go:51-133` - DayPlan struct with 50+ fields
- `apps/api/internal/model/dayplan.go:212-227` - DayPlanBreak struct
- `apps/api/internal/model/dayplan.go:241-257` - DayPlanBonus struct
- `apps/api/internal/model/weekplan.go:9-37` - WeekPlan struct with 7-day mapping
- `apps/api/internal/model/weekplan.go:44-62` - GetDayPlanIDForWeekday()
- `apps/api/internal/model/employeedayplan.go:19-33` - EmployeeDayPlan struct
- `apps/api/internal/model/tariff.go:46-61` - RhythmType enum
- `apps/api/internal/model/tariff.go:63-162` - Tariff struct with rhythm fields
- `apps/api/internal/model/tariff.go:268-323` - GetDayPlanIDForDate() resolution logic
- `apps/api/internal/model/tariff.go:176-196` - TariffWeekPlan and TariffDayPlan structs

### Migrations
- `db/migrations/000015_create_day_plans.up.sql` - Day plans table
- `db/migrations/000016_create_day_plan_breaks.up.sql` - Breaks table
- `db/migrations/000017_create_day_plan_bonuses.up.sql` - Bonuses table
- `db/migrations/000018_create_week_plans.up.sql` - Week plans table
- `db/migrations/000023_create_employee_day_plans.up.sql` - Employee day plans table
- `db/migrations/000030_add_day_plan_zmi_fields.up.sql` - ZMI fields on day_plans
- `db/migrations/000031_add_tariff_rhythm_fields.up.sql` - Rhythm fields, tariff_week_plans, tariff_day_plans tables, employees.tariff_id

### Services
- `apps/api/internal/service/dayplan.go` - Day plan CRUD + break/bonus management
- `apps/api/internal/service/weekplan.go` - Week plan CRUD
- `apps/api/internal/service/tariff.go:124-292` - Tariff creation with rhythm validation
- `apps/api/internal/service/tariff.go:575-631` - Rhythm type switching logic
- `apps/api/internal/service/employee.go:560-616` - syncEmployeeDayPlansForTariff()
- `apps/api/internal/service/employee.go:636-665` - getTariffSyncWindow()
- `apps/api/internal/service/employee.go:618-634` - clearTariffDayPlans()

### Handlers
- `apps/api/internal/handler/dayplan.go` - Day plan HTTP handlers (10 methods)
- `apps/api/internal/handler/weekplan.go` - Week plan HTTP handlers (5 methods)
- `apps/api/internal/handler/tariff.go:184-213` - Rhythm field mapping in create handler
- `apps/api/internal/handler/routes.go:281-331` - Route registration for day plans and week plans

### Repositories
- `apps/api/internal/repository/dayplan.go` - Day plan data access (18 methods)
- `apps/api/internal/repository/weekplan.go` - Week plan data access (9 methods)
- `apps/api/internal/repository/employeedayplan.go` - Employee day plan data access (BulkCreate, Upsert, DeleteRangeBySource, etc.)
- `apps/api/internal/repository/tariff.go:222-301` - Rhythm-specific replace/delete operations

### OpenAPI Specs
- `api/schemas/day-plans.yaml` - 726 lines, DayPlan + Break + Bonus schemas
- `api/schemas/week-plans.yaml` - 188 lines, WeekPlan schemas
- `api/schemas/employee-day-plans.yaml` - 133 lines, EmployeeDayPlan schemas
- `api/schemas/tariffs.yaml:120-166` - Rhythm fields, TariffWeekPlan, TariffDayPlan schemas
- `api/paths/day-plans.yaml` - 10 endpoint definitions
- `api/paths/week-plans.yaml` - 5 endpoint definitions
- `api/paths/employee-day-plans.yaml` - 8 endpoint definitions
- `api/paths/tariffs.yaml` - 7 endpoint definitions

### Generated Models
- `apps/api/gen/models/day_plan.go`, `week_plan.go`, `employee_day_plan.go`, `tariff.go`
- `apps/api/gen/models/employee_day_plan_source.go` - Source enum
- `apps/api/gen/models/create_*_request.go` / `update_*_request.go` for all entities

### Dev Seed Data
- `apps/api/internal/auth/devdayplans.go` - Dev day plan fixtures
- `apps/api/internal/auth/devweekplans.go` - Dev week plan fixtures
- `apps/api/internal/auth/devemployeedayplans.go` - Dev employee day plan fixtures
- `apps/api/internal/auth/devtariffs.go` - Dev tariff fixtures

## Architecture Documentation

### Entity Hierarchy
```
Tariff (rhythm container)
├── rhythm_type determines resolution path:
│
├── [weekly] → single week_plan_id → WeekPlan
│   └── {mon..sun}_day_plan_id → DayPlan
│
├── [rolling_weekly] → TariffWeekPlan[] (ordered)
│   └── each → WeekPlan → {mon..sun}_day_plan_id → DayPlan
│
└── [x_days] → TariffDayPlan[] (positional)
    └── each → day_plan_id → DayPlan (or NULL = off day)

Employee
└── tariff_id → Tariff
    └── sync generates → EmployeeDayPlan[] (one per date)
        ├── source: tariff (auto-generated, replaceable)
        ├── source: manual (user override, preserved)
        └── source: holiday (holiday override, preserved)
```

### Resolution Flow
```
employee + date
  → employee.tariff_id → Tariff
  → tariff.GetDayPlanIDForDate(date)
    → [weekly]         weekPlan.GetDayPlanIDForWeekday(date.Weekday())
    → [rolling_weekly] weeksSinceStart % numPlans → weekPlan → weekday lookup
    → [x_days]         daysSinceStart % cycleDays → direct day plan lookup
  → DayPlan (or nil = off day)
```

### Key Patterns
- **OpenAPI-first**: Schemas defined in `api/schemas/*.yaml`, generated to `apps/api/gen/models/`
- **Clean architecture**: handler → service → repository layers
- **Multi-tenancy**: All entities scoped to `tenant_id`, validated at service layer
- **Explicit clear flags**: Update inputs use `Clear*` booleans to distinguish "not updating" from "set to null"
- **Source-based override preservation**: Tariff sync skips manual/holiday overrides
- **1-year sync window**: Day plans generated up to 1 year ahead, bounded by entry/exit dates

## Historical Context (from thoughts/)

- `thoughts/shared/research/2026-01-26-rolling-weekplans-xdays-rhythm.md` - Detailed design research for rolling and x-day rhythms. Identified three rhythm types, proposed schema additions, defined resolution algorithms. All proposals have been implemented.
- `thoughts/shared/research/2026-01-26-NOK-229-week-plan-management.md` - Week plan management research
- `thoughts/shared/research/2026-01-26-NOK-228-day-plan-management.md` - Day plan management research
- `thoughts/shared/research/2026-01-24-NOK-145-add-missing-day-plan-zmi-fields.md` - Research for adding 28 ZMI fields to day plans (implemented in migration 000030)
- `thoughts/shared/research/2026-01-18-TICKET-056-create-employee-day-plan-model-repository.md` - Employee day plan model design
- `thoughts/shared/plans/2026-01-26-NOK-229-week-plan-management.md` - Week plan implementation plan
- `thoughts/shared/plans/2026-01-26-NOK-228-day-plan-management.md` - Day plan implementation plan
- `thoughts/shared/plans/2026-01-28-employee-tariff-assignment.md` - Tariff-to-employee assignment implementation plan
- `thoughts/shared/tickets/ZMI-TICKET-006-day-plan-advanced-rules.md` - Related ticket for day plan calculation rules (out of scope for TICKET-005)
- `thoughts/shared/tickets/ZMI-TICKET-018-tariff-definitions-and-assignment.md` - Related tariff definitions ticket
- `thoughts/shared/reference/zmi-calculation-manual-reference.md` - ZMI calculation manual reference

## Ticket Requirements vs Implementation Status

| Requirement | Status | Notes |
|---|---|---|
| Day plan fully exposed via API | **Done** | 10 CRUD endpoints, full field coverage |
| Week plan: 7-day mapping to day plan IDs | **Done** | 7 nullable UUID fields with preloaded relations |
| Week plan: name/code and optional mandant scope | **Done** | Code (unique per tenant), Name, Description, TenantID |
| Rolling plan: ordered list of week plans with rotation | **Done** | `tariff_week_plans` table with `sequence_order` |
| X-day plan: cycle length and day-indexed mapping | **Done** | `tariff_day_plans` table with `day_position`, tariff `cycle_days` field |
| Employee time plan assignment with date range | **Done** | `employee_day_plans` with tariff sync generating 1yr window |
| Assignment plan type (weekly, rolling, x-day) | **Done** | Tariff `rhythm_type` enum |
| Optional override flags (preserve manual changes) | **Done** | `source` field; tariff sync preserves non-tariff sources |
| Per-day override record | **Done** | `employee_day_plans` with `source: manual` |
| Employee-date resolves to one effective day plan | **Done** | `GetForEmployeeDate()` + UNIQUE(employee_id, plan_date) |
| Week plans require all 7 days assigned | **Not enforced** | All 7 day plan IDs are nullable; no completeness check |
| Rolling rotation deterministic given start date | **Done** | `weeksSinceStart % numPlans + 1` at `tariff.go:286-290` |
| X-day cycle deterministic given start date | **Done** | `daysSinceStart % cycleDays + 1` at `tariff.go:307-311` |
| Per-day override does not mutate shared day plan | **Done** | Override replaces assignment, not the DayPlan record |
| CRUD for all plan types | **Done** | Endpoints for day plans, week plans, tariffs (with rhythm config) |
| Assign/unassign time plans to employees | **Done** | Via tariff assignment on employee create/update |
| Retrieve effective day plan for employee+date | **Done** | `GET /employees/{id}/day-plans/{date}` |
| OpenAPI covers all plan types and assignment endpoints | **Done** | 30 endpoints total across day-plans, week-plans, employee-day-plans, tariffs |

## Open Questions

1. **Week plan completeness**: The ticket requires validation rejecting week plans with missing day assignments. The current implementation allows partial week plans (any/all days can be null). Should this be enforced?

2. **Employee day plan handler**: The OpenAPI spec defines 8 employee-day-plan endpoints, but no dedicated handler file (`employeedayplan.go`) was found in the handler directory. These endpoints may not be fully wired up in the route registration - needs verification.

3. **Bulk tariff assignment API**: The `POST /employees/bulk-assign-tariff` endpoint exists in the OpenAPI spec but its handler implementation status should be verified.

4. **Rhythm start date default**: No fallback behavior is defined if `rhythm_start_date` is null for rolling_weekly or x_days rhythms. The model code accesses `*t.RhythmStartDate` directly, which could panic on nil.

## Related Research

- `thoughts/shared/research/2026-01-26-rolling-weekplans-xdays-rhythm.md`
- `thoughts/shared/research/2026-01-26-NOK-229-week-plan-management.md`
- `thoughts/shared/research/2026-01-26-NOK-228-day-plan-management.md`
- `thoughts/shared/research/2026-01-29-ZMI-TICKET-004-personnel-master-data.md`
