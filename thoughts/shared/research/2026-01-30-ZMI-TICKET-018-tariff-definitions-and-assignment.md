# Research: ZMI-TICKET-018 - Tariff Definitions and Assignment

**Date**: 2026-01-30
**Ticket**: ZMI-TICKET-018
**Purpose**: Document existing codebase inventory for tariff definitions and assignment implementation.

---

## Summary

The tariff system is already substantially implemented in the codebase. A full CRUD exists for tariff definitions, including:
- Database tables and migrations for tariffs, tariff breaks, tariff week plans (rolling), and tariff day plans (x-days)
- GORM model with vacation fields, target hours, flextime evaluation, rhythm settings, and capping rule group FK
- Repository with full CRUD, break management, and rhythm-specific replace/delete methods
- Service layer with validation for all ZMI fields, rhythm-specific logic, and input structs
- Handler layer using generated OpenAPI models for request/response
- OpenAPI spec with complete schemas for Tariff, CreateTariffRequest, UpdateTariffRequest, TariffBreak, TariffWeekPlan, TariffDayPlan
- Tests at both handler and service levels (unit + integration with DB)

Employee-tariff assignment also exists:
- Employee model has `TariffID *uuid.UUID` FK
- Employee service has `syncEmployeeDayPlansForTariff()` that syncs employee day plans from tariff rhythm
- BulkAssignTariff endpoint (`PATCH /employees/bulk-tariff`) for mass assignment
- Employee update handles tariff change (clears old, syncs new)
- Test coverage for tariff sync preserving manual plans

What is **not yet implemented** (per the ticket requirements):
- Tariff assignment with date range and overwrite behavior (currently a single FK on employee, no effective date range)
- Preview effective tariff for employee at a date
- Macro assignments (weekly/monthly) and execution day

---

## Existing Code Inventory

### 1. Models

#### `apps/api/internal/model/tariff.go`
- **Tariff** struct with:
  - Core: `ID`, `TenantID`, `Code`, `Name`, `Description`, `WeekPlanID`, `ValidFrom`, `ValidTo`, `IsActive`
  - Vacation: `AnnualVacationDays`, `WorkDaysPerWeek`, `VacationBasis` (enum: `calendar_year`, `entry_date`)
  - Target Hours: `DailyTargetHours`, `WeeklyTargetHours`, `MonthlyTargetHours`, `AnnualTargetHours`
  - Rhythm: `RhythmType` (enum: `weekly`, `rolling_weekly`, `x_days`), `CycleDays`, `RhythmStartDate`
  - Flextime: `MaxFlextimePerMonth`, `UpperLimitAnnual`, `LowerLimitAnnual`, `FlextimeThreshold`, `CreditType` (enum: `no_evaluation`, `complete_carryover`, `after_threshold`, `no_carryover`)
  - Capping: `VacationCappingRuleGroupID`
  - Relations: `WeekPlan`, `Breaks`, `TariffWeekPlans`, `TariffDayPlans`, `VacationCappingRuleGroup`
  - Helper methods: `GetAnnualVacationDays()`, `GetWorkDaysPerWeek()`, `GetVacationBasis()`, `IsCalendarYearBasis()`, `IsEntryDateBasis()`, `GetCreditType()`, `CalculateProRatedVacation()`, `GetVacationYearStart()`, `GetVacationYearEnd()`, `GetDailyTargetMinutes()`, `GetWeeklyTargetMinutes()`, `GetRhythmType()`, `GetDayPlanIDForDate()`, `GetWeekPlanForDate()`
- **TariffBreak** struct: break rules for tariff
- **TariffWeekPlan** struct: ordered week plans for rolling_weekly rhythm (has `SequenceOrder`)
- **TariffDayPlan** struct: day plans for x_days rhythm (has `DayPosition`)

#### `apps/api/internal/model/employee.go`
- **Employee** struct has:
  - `TariffID *uuid.UUID` FK linking to tariff
  - Tariff-override fields: `PartTimePercent`, `DisabilityFlag`, `DailyTargetHours`, `WeeklyTargetHours`, `MonthlyTargetHours`, `AnnualTargetHours`, `WorkDaysPerWeek`
  - Relation: `Tariff *Tariff`

#### Related Models
- `model/weekplan.go` - WeekPlan with day plan IDs per weekday
- `model/dayplan.go` - DayPlan with plan type, breaks, bonuses
- `model/employeedayplan.go` - EmployeeDayPlan personal calendar (has `Source` field: `tariff`, `manual`, `import`)
- `model/vacationcappingrulegroup.go` - VacationCappingRuleGroup linked from tariff
- `model/vacationbalance.go` - VacationBalance per employee
- `model/monthlyvalue.go` - MonthlyValue for monthly evaluation
- `model/dailyvalue.go` - DailyValue for daily calculations

### 2. Database Migrations

Tariff-related migrations in `db/migrations/`:

| Number | File | Content |
|--------|------|---------|
| 000019 | `create_tariffs.up.sql` | Base tariffs table (id, tenant_id, code, name, description, week_plan_id, valid_from, valid_to, is_active) with UNIQUE(tenant_id, code) |
| 000020 | `create_tariff_breaks.up.sql` | Tariff breaks table (break_type, after_work_minutes, duration, is_paid, sort_order) |
| 000029 | `add_tariff_zmi_fields.up.sql` | Vacation fields (annual_vacation_days, work_days_per_week, vacation_basis), target hours (daily/weekly/monthly/annual), flextime fields (max_flextime_per_month, upper/lower_limit_annual, flextime_threshold, credit_type) with CHECK constraints |
| 000031 | `add_tariff_rhythm_fields.up.sql` | Rhythm fields (rhythm_type, cycle_days, rhythm_start_date), tariff_week_plans table, tariff_day_plans table, employees.tariff_id FK |
| 000032 | `fix_credit_type_complete_value.up.sql` | Data fix: rename 'complete' to 'complete_carryover' |
| 000051 | `create_vacation_capping_rule_groups.up.sql` | Adds `vacation_capping_rule_group_id` FK to tariffs |

Latest migration number: **000052** (create_employee_capping_exceptions)

### 3. Repository

#### `apps/api/internal/repository/tariff.go`
- `TariffRepository` struct with `*DB`
- Methods:
  - `Create`, `GetByID`, `GetByCode`, `GetWithDetails` (preloads WeekPlan, Breaks, TariffWeekPlans.WeekPlan, TariffDayPlans.DayPlan)
  - `Update`, `Upsert`, `Delete`
  - `List`, `ListActive` (both preload all relations, ordered by code ASC)
  - `CreateBreak`, `GetBreakByID`, `DeleteBreak`, `ListBreaks`
  - `ReplaceTariffWeekPlans` (transaction: delete all + create new)
  - `DeleteTariffWeekPlans`
  - `ReplaceTariffDayPlans` (transaction: delete all + create new)
  - `DeleteTariffDayPlans`
- Error sentinels: `ErrTariffNotFound`, `ErrTariffBreakNotFound`

### 4. Service

#### `apps/api/internal/service/tariff.go`
- `TariffService` struct with `tariffRepo`, `weekPlanRepo`, `dayPlanRepo` interfaces
- Interfaces: `tariffRepository`, `weekPlanRepositoryForTariff`, `dayPlanRepositoryForTariff`
- Input structs: `CreateTariffInput`, `TariffDayPlanInput`
- Methods: `Create`, `Update` (implied), `GetDetails`, `List`, `ListActive`, `Delete`, `CreateBreak`, `DeleteBreak`
- Validation: code/name required, code uniqueness, rhythm-type-specific validation, vacation basis, credit type, work days per week
- Error sentinels: 13+ defined errors for various validation failures

#### `apps/api/internal/service/employee.go`
- Employee tariff-related interfaces:
  - `employeeTariffRepository` with `GetWithDetails`
  - `employeeTariffDayPlanRepository` with `GetForEmployeeDateRange`, `BulkCreate`, `DeleteRangeBySource`
- `EmployeeService` struct includes tariff and day plan repos
- `BulkAssignTariffInput` struct: `TenantID`, `EmployeeIDs`, `Filter`, `TariffID`, `ClearTariff`
- Methods:
  - `BulkAssignTariff()` - assigns tariff to multiple employees
  - `syncEmployeeDayPlansForTariff()` - syncs employee day plans from tariff rhythm, preserving manual plans
  - `clearTariffDayPlans()` - removes tariff-sourced day plans
  - `getTariffSyncWindow()` - determines date range for sync (max of today/entry_date/valid_from to min of +1yr/exit_date/valid_to)

### 5. Handler

#### `apps/api/internal/handler/tariff.go`
- `TariffHandler` struct with `*service.TariffService`
- Methods: `List`, `Get`, `Create`, `Update`, `Delete`, `CreateBreak`, `DeleteBreak`
- Uses generated models: `models.CreateTariffRequest` for create
- Pattern: decode JSON body, extract tenant from context, call service, respond with JSON

#### `apps/api/internal/handler/employee.go`
- `BulkAssignTariff` handler method on EmployeeHandler
- Registered at `PATCH /employees/bulk-tariff`

### 6. Route Registration

In `apps/api/internal/handler/routes.go`:
```go
func RegisterTariffRoutes(r chi.Router, h *TariffHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("tariffs.manage").String()
    r.Route("/tariffs", func(r chi.Router) {
        // GET /, POST /, GET /{id}, PUT /{id}, DELETE /{id}
        // POST /{id}/breaks, DELETE /{id}/breaks/{breakId}
    })
}
```

### 7. OpenAPI Spec

#### `api/paths/tariffs.yaml`
Endpoints:
- `GET /tariffs` - List tariffs (query param: `active`)
- `POST /tariffs` - Create tariff
- `GET /tariffs/{id}` - Get tariff by ID
- `PUT /tariffs/{id}` - Update tariff
- `DELETE /tariffs/{id}` - Delete tariff
- `POST /tariffs/{id}/breaks` - Add break to tariff
- `DELETE /tariffs/{id}/breaks/{breakId}` - Delete break

#### `api/schemas/tariffs.yaml`
Schemas defined:
- `Tariff` - Full response model with all fields, relations, enums
- `TariffSummary` - Minimal (id, code, name)
- `TariffBreak` - Break definition
- `TariffWeekPlan` - Week plan in rotation
- `TariffDayPlan` - Day plan in x-days cycle
- `TariffDayPlanInput` - Input for day plan assignment
- `CreateTariffRequest` - All fields for creation (rhythm, vacation, target hours, flextime)
- `UpdateTariffRequest` - Partial update fields
- `CreateTariffBreakRequest` - Break creation
- `TariffList` - List wrapper with `data` array

#### `api/paths/employees.yaml` (tariff-related)
- `PATCH /employees/bulk-tariff` - Bulk tariff assignment

### 8. Generated Models

In `apps/api/gen/models/`:
- `tariff.go` - Tariff response model
- `tariff_list.go` - TariffList wrapper
- `tariff_break.go` - TariffBreak model
- `create_tariff_request.go` - CreateTariffRequest with full validation (enums, min/max, format checks)
- `create_tariff_request_day_plans_items.go` - Nested day plan input
- `update_tariff_request.go` - UpdateTariffRequest
- `bulk_tariff_assignment_request.go` - BulkTariffAssignmentRequest
- `bulk_tariff_assignment_response.go` - BulkTariffAssignmentResponse

### 9. Tests

#### `apps/api/internal/service/tariff_test.go`
- Test helper: `createTestTenantForTariffService`, `createTestWeekPlanForTariffService`
- Tests: `Create_Success`, `Create_WithWeekPlan`, `Create_WithDescription`, `Create_WithValidityDates`
- Pattern: `testutil.SetupTestDB(t)` -> create repos -> create service -> call methods -> assert

#### `apps/api/internal/handler/tariff_test.go`
- Test helper: `setupTariffHandler` (creates DB, repos, service, handler, tenant, week plan)
- Context helper: `withTariffTenantContext` (injects tenant into request context)
- Tests: `Create_Success`, `Create_WithWeekPlan`, `Create_InvalidBody`, `Create_MissingCode`
- Pattern: `httptest.NewRequest` -> set context -> `httptest.NewRecorder` -> call handler -> assert status + body

#### `apps/api/internal/service/employee_tariff_test.go`
- Test helpers: `createTestTenantForEmployeeTariffService`, `createTestDayPlanForEmployeeTariff`, `createTestWeekPlanForEmployeeTariff`, `createTestTariffForEmployeeTariff`
- Test: `TariffSyncPreservesManualPlans` - verifies that syncing tariff day plans preserves manually set plans
- Uses real DB via `testutil.SetupTestDB(t)` with transaction rollback

### 10. Main Server Wiring

In `apps/api/cmd/server/main.go`:
```go
tariffRepo := repository.NewTariffRepository(db)
employeeService := service.NewEmployeeService(employeeRepo, tariffRepo, empDayPlanRepo)
tariffService := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
tariffHandler := handler.NewTariffHandler(tariffService)
handler.RegisterTariffRoutes(r, tariffHandler, authzMiddleware)
```

The tariff repo is also injected into:
- `EmployeeService` (for tariff sync)
- `VacationService` (for vacation calculation)
- `VacationCarryoverService` (for capping)
- `MonthlyEvalService` (for monthly evaluation)

---

## Patterns to Follow

### Naming Conventions
- **Model files**: `snake_case.go` in `internal/model/` (e.g., `tariff.go`, `vacationcalcgroup.go`)
- **Handler files**: `snake_case.go` in `internal/handler/` matching model name
- **Service files**: `snake_case.go` in `internal/service/`
- **Repository files**: `snake_case.go` in `internal/repository/`
- **Migration files**: `000NNN_description.up.sql` and `.down.sql`
- **OpenAPI path files**: `kebab-case.yaml` in `api/paths/`
- **OpenAPI schema files**: `kebab-case.yaml` in `api/schemas/`
- **Test files**: `*_test.go` in same package

### Handler Pattern
1. Parse URL params and query params
2. Extract tenant from context via `middleware.TenantFromContext()`
3. Decode request body using generated models from `gen/models/`
4. Call service method with domain input struct
5. Map errors to HTTP status codes
6. Respond with `respondJSON()` or `respondError()`

### Service Pattern
1. Define repository interfaces (not concrete types)
2. Constructor `NewXxxService(repo interfaces...)`
3. Input structs (e.g., `CreateTariffInput`) separate from models
4. Validate input fields, return typed errors
5. Call repository methods
6. Return domain model structs

### Repository Pattern
1. Struct with `*DB` field (wrapper around `*gorm.DB`)
2. Constructor `NewXxxRepository(db *DB)`
3. Methods use `r.db.GORM.WithContext(ctx)` for all queries
4. Preload related entities in read methods
5. Return sentinel errors for not-found cases
6. Use transactions for multi-step operations

### Test Pattern
1. `testutil.SetupTestDB(t)` returns `*repository.DB` with transaction isolation
2. Create test helpers prefixed with `createTestXxxForYyyService`
3. Use `require.NoError()` for setup, `assert.Equal()` for assertions
4. Handler tests: `httptest.NewRequest` + `httptest.NewRecorder` + context injection
5. Service tests: direct service method calls with real DB

### OpenAPI Pattern
- Swagger 2.0 format
- Paths in `api/paths/domain.yaml`
- Schemas in `api/schemas/domain.yaml`
- Responses reference `api/responses/errors.yaml`
- List endpoints return wrapper with `data` or `items` array
- Enums for constrained string fields
- `x-nullable: true` for optional fields in responses
- `format: uuid` for UUID fields, `format: date` for dates

### Migration Pattern
- Sequential numbering: `000NNN`
- Both `.up.sql` and `.down.sql` for each migration
- Next available number: `000053`
- Use `ALTER TABLE` for adding columns
- Add CHECK constraints, indexes, and COMMENTs
- Use `ON DELETE CASCADE` for child tables, `ON DELETE SET NULL` for optional FKs

---

## Dependencies and Prerequisites

### Already Satisfied
- Personnel master data (ZMI-TICKET-004): Employee model with `TariffID` FK exists
- Time plan framework (ZMI-TICKET-005): DayPlan, WeekPlan, EmployeeDayPlan models exist
- Tariff CRUD: Full create/read/update/delete with all ZMI fields already implemented
- Tariff breaks management: Create/delete break endpoints exist
- Rhythm settings: weekly, rolling_weekly, x_days all implemented in model and service
- Employee tariff sync: `syncEmployeeDayPlansForTariff()` exists and handles rhythm-based day plan generation
- Bulk tariff assignment: `PATCH /employees/bulk-tariff` endpoint exists
- Vacation fields on tariff: annual days, work days per week, basis all present
- Target hours on tariff: daily/weekly/monthly/annual all present
- Flextime evaluation on tariff: credit type, thresholds, caps all present
- Vacation capping integration: `VacationCappingRuleGroupID` FK on tariff exists

### Not Yet Implemented (Ticket Requirements Gap)
1. **Tariff assignment with date range**: Currently employee has a single `TariffID` FK. The ticket calls for effective date ranges (e.g., tariff A from Jan-Jun, tariff B from Jul onward). This would require a new `employee_tariff_assignments` join table with `employee_id`, `tariff_id`, `effective_from`, `effective_to`, and `overwrite_behavior`.
2. **Preview effective tariff for employee at date**: No endpoint exists for resolving which tariff applies to an employee at a given date. Currently it is just `employee.TariffID`.
3. **Macro assignments (weekly/monthly) and execution day**: Not present in the model or schema. The ticket mentions macro assignments and execution day settings -- these are not in the current tariff definition.

---

## Open Questions

1. **Date-range assignment model**: Should a new `employee_tariff_assignments` table be created, or should the existing single `TariffID` FK on employee be enhanced? The current model only supports one active tariff per employee. The ticket explicitly requires date-range support with tariff A active from Jan-Jun and tariff B from Jul onward.

2. **Overwrite behavior**: The ticket mentions "overwrite behavior for manual changes" in tariff assignment. Does this mean:
   - When assigning a new tariff, should manually edited employee day plans be overwritten?
   - The current `syncEmployeeDayPlansForTariff()` already preserves manual plans (skips dates where `Source != tariff`). Is this the correct behavior, or should there be an explicit overwrite flag?

3. **Macro assignments**: The ticket mentions "Macro assignments (weekly/monthly) and execution day." What are macros in the ZMI context? The reference manual Section 14.2 mentions macros for target hours but the specifics are unclear. Are these separate from the existing target hours fields?

4. **OpenAPI credit_type mismatch**: The OpenAPI spec and generated models use `"complete"` as the enum value for credit type, but the database migration 000032 renamed it to `"complete_carryover"`. The GORM model uses `CreditTypeComplete = "complete_carryover"`. This mismatch between the API contract and the database may need resolution.

5. **Historical calculation protection**: The ticket states "Changes should not retroactively affect historical calculations." The current implementation syncs day plans from today forward (not retroactively). Is additional protection needed, such as immutability of closed monthly evaluations?

6. **Effective tariff preview**: For the "Preview effective tariff for employee at date" endpoint, what should the response contain? Just the tariff definition, or the tariff merged with employee-level overrides (e.g., employee's `DailyTargetHours` overriding tariff's)?
