---
date: 2026-03-06T16:00:00+01:00
researcher: Claude
branch: staging
repository: terp
topic: "tRPC routers for Day Plans (with Breaks and Bonuses) and Week Plans"
tags: [research, codebase, trpc, day-plans, week-plans, breaks, bonuses, prisma]
status: complete
last_updated: 2026-03-06
last_updated_by: Claude
---

# Research: tRPC Routers for Day Plans + Week Plans

**Date**: 2026-03-06T16:00:00+01:00
**Researcher**: Claude
**Branch**: staging
**Repository**: terp

## Research Question

What existing patterns, models, permissions, Go business logic, database schema, and frontend hooks exist for implementing tRPC routers for Day Plans (with Breaks and Bonuses) and Week Plans?

## Summary

Day Plans and Week Plans have complete Go backend implementations (handler + service + repository + model layers), SQL migrations, and database tables. The permission catalog already contains `day_plans.manage` and `week_plans.manage`. The Prisma schema does NOT yet include models for `DayPlan`, `DayPlanBreak`, `DayPlanBonus`, or `WeekPlan` -- they need to be added. Frontend hooks exist using the old `useApiQuery`/`useApiMutation` pattern. Day Plans are the most complex entity ported so far due to sub-entities (Breaks and Bonuses) and the Copy operation. Week Plans reference Day Plans via 7 nullable FK columns (Monday through Sunday).

## Detailed Findings

### 1. Go Backend: Day Plans

**Model** (`apps/api/internal/model/dayplan.go`, 267 lines):

The `DayPlan` struct has many fields representing ZMI time plan configuration:

- **Core fields**: `ID`, `TenantID`, `Code`, `Name`, `Description`, `PlanType` (enum: `fixed`, `flextime`), `IsActive`, `CreatedAt`, `UpdatedAt`
- **Time windows** (minutes from midnight): `ComeFrom`, `ComeTo`, `GoFrom`, `GoTo`, `CoreStart`, `CoreEnd` -- all nullable `*int`
- **Target hours**: `RegularHours` (int, default 480), `RegularHours2` (nullable, alternative for absence days), `FromEmployeeMaster` (bool)
- **Tolerance settings**: `ToleranceComePlus`, `ToleranceComeMinus`, `ToleranceGoPlus`, `ToleranceGoMinus` -- all `int`
- **Rounding settings**: `RoundingComeType`, `RoundingComeInterval`, `RoundingGoType`, `RoundingGoInterval` -- nullable
- **Caps**: `MinWorkTime`, `MaxNetWorkTime` -- nullable `*int`
- **Variable work time**: `VariableWorkTime` (bool)
- **Rounding extras**: `RoundAllBookings` (bool), `RoundingComeAddValue`, `RoundingGoAddValue` -- nullable
- **Holiday credits**: `HolidayCreditCat1`, `HolidayCreditCat2`, `HolidayCreditCat3` -- nullable `*int`
- **Vacation deduction**: `VacationDeduction` (Decimal, default 1.00)
- **No-booking behavior**: `NoBookingBehavior` (enum: `error`, `deduct_target`, `vocational_school`, `adopt_target`, `target_with_order`)
- **Day change behavior**: `DayChangeBehavior` (enum: `none`, `at_arrival`, `at_departure`, `auto_complete`)
- **Shift detection**: `ShiftDetectArriveFrom/To`, `ShiftDetectDepartFrom/To` -- nullable `*int`
- **Shift alt plans**: `ShiftAltPlan1` through `ShiftAltPlan6` -- nullable `*uuid.UUID`
- **Account references**: `NetAccountID`, `CapAccountID` -- nullable `*uuid.UUID`
- **Relations**: `Breaks []DayPlanBreak`, `Bonuses []DayPlanBonus`
- **Table**: `day_plans`

**Enums defined in the model file**:

| Type | Values |
|------|--------|
| `PlanType` | `fixed`, `flextime` |
| `RoundingType` | `none`, `up`, `down`, `nearest`, `add`, `subtract` |
| `NoBookingBehavior` | `error`, `deduct_target`, `vocational_school`, `adopt_target`, `target_with_order` |
| `DayChangeBehavior` | `none`, `at_arrival`, `at_departure`, `auto_complete` |
| `BreakType` | `fixed`, `variable`, `minimum` |
| `CalculationType` | `fixed`, `per_minute`, `percentage` |

**DayPlanBreak** struct:
- Fields: `ID`, `DayPlanID`, `BreakType` (enum), `StartTime` (*int), `EndTime` (*int), `Duration` (int), `AfterWorkMinutes` (*int), `AutoDeduct` (bool, default true), `IsPaid` (bool, default false), `MinutesDifference` (bool, default false), `SortOrder` (int), `CreatedAt`, `UpdatedAt`
- Table: `day_plan_breaks`

**DayPlanBonus** struct:
- Fields: `ID`, `DayPlanID`, `AccountID` (uuid, required), `TimeFrom` (int), `TimeTo` (int), `CalculationType` (enum), `ValueMinutes` (int), `MinWorkMinutes` (*int), `AppliesOnHoliday` (bool), `SortOrder` (int), `CreatedAt`, `UpdatedAt`
- Relation: `Account *Account` (belongs-to)
- Table: `day_plan_bonuses`

**Service** (`apps/api/internal/service/dayplan.go`, 685 lines):

Methods:
- `Create(ctx, CreateDayPlanInput)` -- validates code (required, not reserved), name (required), regularHours (> 0), time ranges; checks code uniqueness; normalizes flextime fields; defaults PlanType to `fixed`
- `GetByID(ctx, id)` -- simple lookup
- `GetDetails(ctx, id)` -- preloads Breaks and Bonuses
- `GetByCode(ctx, tenantID, code)` -- lookup by tenant + code
- `Update(ctx, id, UpdateDayPlanInput)` -- partial update with pointer fields; normalizes flextime; validates time ranges after update
- `Delete(ctx, id)` -- verifies existence then deletes
- `List(ctx, tenantID)` -- all day plans for tenant
- `ListActive(ctx, tenantID)` -- active only
- `ListByPlanType(ctx, tenantID, planType)` -- filter by plan type
- `Copy(ctx, id, newCode, newName)` -- copies day plan with all breaks and bonuses; validates new code/name; checks code uniqueness
- `AddBreak(ctx, planID, CreateBreakInput)` -- validates break config by type (fixed needs start/end, minimum needs afterWorkMinutes); validates duration > 0
- `UpdateBreak(ctx, breakID, CreateBreakInput)` -- full update of break
- `DeleteBreak(ctx, breakID)` -- verifies existence then deletes
- `AddBonus(ctx, planID, CreateBonusInput)` -- validates timeFrom < timeTo, valueMinutes > 0
- `UpdateBonus(ctx, bonusID, CreateBonusInput)` -- full update of bonus
- `DeleteBonus(ctx, bonusID)` -- verifies existence then deletes

**Reserved day plan codes**: `U`, `K`, `S` (checked case-insensitive via `isReservedDayPlanCode`)

**Flextime normalization** (`normalizeFlextimeFields`): When PlanType is `flextime`, zeros out `ToleranceComePlus`, `ToleranceGoMinus`, and `VariableWorkTime`.

**Break validation logic** (`validateBreak`):
- `fixed`: requires `StartTime` and `EndTime`, and `StartTime < EndTime`
- `minimum`: requires `AfterWorkMinutes`
- `variable`: no specific time requirements
- All: `Duration > 0`

**Error constants**:
- `ErrDayPlanNotFound`, `ErrDayPlanCodeRequired`, `ErrDayPlanNameRequired`, `ErrDayPlanCodeExists`, `ErrDayPlanCodeReserved`, `ErrInvalidTimeRange`, `ErrInvalidBreakConfig`, `ErrDayPlanBreakNotFound`, `ErrDayPlanBonusNotFound`, `ErrInvalidRegularHours`

**Handler** (`apps/api/internal/handler/dayplan.go`, 559 lines):

Endpoints:
- `List` -- supports `?active=true` and `?plan_type=<value>` query filters
- `Get` -- returns day plan with details (breaks + bonuses preloaded)
- `Create` -- uses `models.CreateDayPlanRequest`, handles optional fields with zero-value checks
- `Update` -- uses `models.UpdateDayPlanRequest`, partial update
- `Delete` -- returns 204 No Content
- `Copy` -- uses `models.CopyDayPlanRequest` with `new_code` and `new_name`
- `AddBreak` -- uses `models.CreateDayPlanBreakRequest`
- `DeleteBreak` -- takes `breakId` URL param
- `AddBonus` -- uses `models.CreateDayPlanBonusRequest`
- `DeleteBonus` -- takes `bonusId` URL param

**Repository** (`apps/api/internal/repository/dayplan.go`, 227 lines):

Methods: `Create`, `GetByID`, `GetByCode`, `GetWithDetails` (preloads Breaks sorted by sort_order ASC, Bonuses sorted by sort_order ASC, Bonuses.Account), `Update`, `Upsert`, `Delete`, `List` (ordered by code ASC), `ListActive`, `ListByPlanType`, `AddBreak`, `UpdateBreak`, `DeleteBreak`, `GetBreak`, `AddBonus`, `UpdateBonus`, `DeleteBonus`, `GetBonus`

### 2. Go Backend: Week Plans

**Model** (`apps/api/internal/model/weekplan.go`, 90 lines):

- **Fields**: `ID`, `TenantID`, `Code`, `Name`, `Description` (*string), 7 nullable day plan IDs (`MondayDayPlanID` through `SundayDayPlanID`), `IsActive`, `CreatedAt`, `UpdatedAt`
- **Relations**: 7 belongs-to relations to `DayPlan` (`MondayDayPlan` through `SundayDayPlan`)
- **Table**: `week_plans`
- **Helper methods**: `GetDayPlanIDForWeekday(weekday)`, `WorkDaysPerWeek()` (counts non-nil day plan IDs)

**Service** (`apps/api/internal/service/weekplan.go`, 257 lines):

Methods:
- `Create(ctx, CreateWeekPlanInput)` -- validates code (required), name (required); checks code uniqueness; validates all 7 day plan IDs exist and belong to tenant; enforces all 7 days must have plans assigned (ZMI Section 11.2)
- `GetByID(ctx, id)` -- simple lookup
- `GetDetails(ctx, id)` -- preloads all 7 day plan relations
- `Update(ctx, id, UpdateWeekPlanInput)` -- partial update; validates day plan IDs; supports clearing day plans via `ClearXDayPlan` bool flags; enforces completeness after update
- `Delete(ctx, id)` -- verifies existence then deletes
- `List(ctx, tenantID)` -- all week plans for tenant
- `ListActive(ctx, tenantID)` -- active only

**Error constants**:
- `ErrWeekPlanNotFound`, `ErrWeekPlanCodeExists`, `ErrInvalidDayPlan`, `ErrWeekPlanCodeReq`, `ErrWeekPlanNameReq`, `ErrWeekPlanIncomplete`

**Key business rule**: All 7 day plan IDs must be non-nil (week plan must be complete). This is validated in both Create and Update.

**Handler** (`apps/api/internal/handler/weekplan.go`, 243 lines):

Endpoints:
- `List` -- supports `?active=true` query filter
- `Get` -- returns week plan with all 7 day plans preloaded
- `Create` -- uses `models.CreateWeekPlanRequest`
- `Update` -- uses `models.UpdateWeekPlanRequest`
- `Delete` -- returns 204 No Content

**Repository** (`apps/api/internal/repository/weekplan.go`, 153 lines):

Methods: `Create`, `GetByID`, `GetByCode`, `GetWithDayPlans` (preloads all 7 day plans), `Update`, `Upsert`, `Delete`, `List` (preloads all 7 day plans, ordered by code ASC), `ListActive` (same preloads, filtered)

### 3. Database Migrations

**`000015_create_day_plans.up.sql`**: Creates `day_plans` table with core fields (time windows, target hours, tolerance, rounding, caps). Unique constraint: `UNIQUE(tenant_id, code)`. Indexes: `idx_day_plans_tenant`, `idx_day_plans_active`.

**`000016_create_day_plan_breaks.up.sql`**: Creates `day_plan_breaks` table. FK `day_plan_id REFERENCES day_plans(id) ON DELETE CASCADE`. Index: `idx_day_plan_breaks_plan`.

**`000017_create_day_plan_bonuses.up.sql`**: Creates `day_plan_bonuses` table. FK `day_plan_id REFERENCES day_plans(id) ON DELETE CASCADE`, FK `account_id REFERENCES accounts(id) ON DELETE CASCADE`. Indexes: `idx_day_plan_bonuses_plan`, `idx_day_plan_bonuses_account`.

**`000018_create_week_plans.up.sql`**: Creates `week_plans` table with 7 nullable FK columns to `day_plans(id) ON DELETE SET NULL`. Unique constraint: `UNIQUE(tenant_id, code)`. Index: `idx_week_plans_tenant`.

**`000030_add_day_plan_zmi_fields.up.sql`**: Adds extended fields to `day_plans` (regular_hours_2, from_employee_master, variable_work_time, round_all_bookings, rounding add values, holiday credits, vacation_deduction, no_booking_behavior, day_change_behavior, shift detection fields, shift alt plans 1-6). Also adds `minutes_difference BOOLEAN DEFAULT FALSE` to `day_plan_breaks`.

**`000079_add_day_plan_net_cap_accounts.up.sql`**: Adds `net_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL` and `cap_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL` to `day_plans`.

### 4. Prisma Schema Status

The Prisma schema at `apps/web/prisma/schema.prisma` (1034 lines) does NOT include models for:
- `DayPlan`
- `DayPlanBreak`
- `DayPlanBonus`
- `WeekPlan`

These four Prisma models need to be created. The `Account` model (line 345) already exists and will be referenced by `DayPlanBonus` (accountId FK) and `DayPlan` (netAccountId, capAccountId FKs).

The `Employee` model does NOT currently reference day plans or week plans directly (those are handled via tariff assignments and employee day plans, which are out of scope for this ticket).

### 5. Permission Catalog

Both permissions exist in `apps/web/src/server/lib/permission-catalog.ts`:

| Key | Description | Line |
|-----|-------------|------|
| `day_plans.manage` | "Manage day plans" | 100 |
| `week_plans.manage` | "Manage week plans" | 101 |

No new permissions need to be added. The ticket specifies using `day_plans.read` and `day_plans.write` for separate read/write on day plans, but the permission catalog only has `day_plans.manage`. All existing tRPC routers use the single `.manage` permission for both read and write operations.

### 6. Frontend Hooks (Old Pattern)

**`apps/web/src/hooks/api/use-day-plans.ts`** (180 lines):
- `useDayPlans({ active?, planType?, enabled? })` -- GET `/day-plans`
- `useDayPlan(id, enabled)` -- GET `/day-plans/{id}`
- `useCreateDayPlan()` -- POST `/day-plans`
- `useUpdateDayPlan()` -- PUT `/day-plans/{id}`
- `useDeleteDayPlan()` -- DELETE `/day-plans/{id}`
- `useCopyDayPlan()` -- POST `/day-plans/{id}/copy`
- `useCreateDayPlanBreak()` -- POST `/day-plans/{id}/breaks`
- `useDeleteDayPlanBreak()` -- DELETE `/day-plans/{id}/breaks/{breakId}`
- `useCreateDayPlanBonus()` -- POST `/day-plans/{id}/bonuses`
- `useDeleteDayPlanBonus()` -- DELETE `/day-plans/{id}/bonuses/{bonusId}`
- All invalidate `[['/day-plans']]`

**`apps/web/src/hooks/api/use-week-plans.ts`** (91 lines):
- `useWeekPlans({ active?, enabled? })` -- GET `/week-plans`
- `useWeekPlan(id, enabled)` -- GET `/week-plans/{id}`
- `useCreateWeekPlan()` -- POST `/week-plans`
- `useUpdateWeekPlan()` -- PUT `/week-plans/{id}`
- `useDeleteWeekPlan()` -- DELETE `/week-plans/{id}`
- All invalidate `[['/week-plans']]`

Both are exported from `apps/web/src/hooks/api/index.ts`.

### 7. tRPC Infrastructure and Patterns

**Procedure Chain**: `tenantProcedure.use(requirePermission(PERM_ID)).input(schema).output(schema).query/mutation(handler)`

**Router Structure** (observed in all recently implemented routers):
1. Permission constant: `const X_MANAGE = permissionIdByKey("x.manage")!`
2. Output Zod schema (mirrors Prisma model shape)
3. Input Zod schemas (create + update)
4. `mapXToOutput()` helper function
5. Router with procedures: `list`, `getById`, `create`, `update`, `delete`

**Key patterns**:
- `list` returns `{ data: X[] }` wrapper
- `delete` returns `{ success: boolean }`
- Uniqueness checks use `ctx.prisma.X.findFirst({ where: { tenantId, code, NOT: { id } } })`
- All mutations trim string inputs
- Tenant scoping: every query includes `tenantId` in WHERE clause
- `getById` uses `findFirst` with `{ id, tenantId }` for tenant scoping
- Output schemas declare `z.date()` for timestamps (Prisma returns Date objects)

**Root Router** (`apps/web/src/server/root.ts`): Currently has 21 routers registered. New `dayPlans` and `weekPlans` routers will be added here.

### 8. Test Patterns

Existing tests use vitest with mock Prisma. Observed in `orders-router.test.ts`, `activities-router.test.ts`, `bookingTypes-router.test.ts`:

**Structure**:
- Import `createCallerFactory` from `../trpc` and router from `../routers/X`
- Import helpers: `createMockContext`, `createMockSession`, `createUserWithPermissions`, `createMockUserTenant`
- Create caller from individual router: `createCallerFactory(xRouter)`
- Define `makeX()` factory function that returns a mock record with all fields, accepting partial overrides
- Define `createTestContext(prisma)` helper wrapping mock Prisma methods with correct permission and tenant
- One `describe` per procedure with multiple `it` cases

**Mock Prisma pattern**:
```typescript
const mockPrisma = {
  entity: {
    findMany: vi.fn().mockResolvedValue([...]),
    findFirst: vi.fn().mockResolvedValue(entity),
    create: vi.fn().mockResolvedValue(entity),
    update: vi.fn().mockResolvedValue(entity),
    delete: vi.fn().mockResolvedValue(entity),
  },
}
const caller = createCaller(createTestContext(mockPrisma))
```

**Test cases typically include**:
- List returns items / empty array
- List applies filters
- GetById returns / throws NOT_FOUND
- Create trims whitespace / rejects empty code / rejects empty name / rejects duplicate code / creates with defaults
- Update partial fields / rejects empty name / throws NOT_FOUND / allows same code without false conflict
- Delete returns success / throws NOT_FOUND / checks referential integrity

### 9. Entity Relationships

```
DayPlan --has-many--> DayPlanBreak (day_plan_id FK, ON DELETE CASCADE)
DayPlan --has-many--> DayPlanBonus (day_plan_id FK, ON DELETE CASCADE)
DayPlanBonus --belongs-to--> Account (account_id FK, ON DELETE CASCADE)
DayPlan --optional--> Account (net_account_id FK, ON DELETE SET NULL)
DayPlan --optional--> Account (cap_account_id FK, ON DELETE SET NULL)
DayPlan --self-ref x6--> DayPlan (shift_alt_plan_1..6, FK to day_plans)

WeekPlan --optional x7--> DayPlan (monday_day_plan_id..sunday_day_plan_id, ON DELETE SET NULL)

Tenant --has-many--> DayPlan (tenant_id FK, ON DELETE CASCADE)
Tenant --has-many--> WeekPlan (tenant_id FK, ON DELETE CASCADE)
```

### 10. Ticket vs. Existing Patterns: Notable Differences

**1. Permission granularity**: The ticket specifies `day_plans.read` and `day_plans.write` as separate permissions. The permission catalog only has `day_plans.manage`. All existing tRPC routers use a single manage permission. The implementation should use `day_plans.manage` for all dayPlan procedures and `week_plans.manage` for all weekPlan procedures.

**2. Sub-entity operations**: This is the first tRPC router with sub-entity CRUD (breaks and bonuses on a day plan). No existing tRPC router has this pattern. The Go handler uses nested URL routes (`/day-plans/{id}/breaks`, `/day-plans/{id}/bonuses`). In tRPC, these become flat procedures: `dayPlans.createBreak`, `dayPlans.deleteBreak`, `dayPlans.createBonus`, `dayPlans.deleteBonus`.

**3. Copy operation**: This is the first tRPC router with a copy mutation. The Go `Copy` method creates a new day plan with a new code/name, then copies all breaks and bonuses from the original.

**4. Break update not in ticket**: The Go service has `UpdateBreak` and `UpdateBonus` methods, but the ticket only lists `createBreak`, `deleteBreak`, `createBonus`, `deleteBonus` (no update). The Go handler also only exposes Add and Delete for breaks/bonuses (no update endpoint). The tRPC router should match the ticket.

**5. Week plan completeness**: The Go service enforces that all 7 day plan IDs must be non-nil (ZMI Section 11.2). The ticket input shows day plan IDs as optional (`monday_day_plan_id?`), but the service validation rejects incomplete week plans.

### 11. DayPlan Field Count for Prisma Model

The `day_plans` table has a large number of columns across multiple migrations:

From migration 000015 (base): `id`, `tenant_id`, `code`, `name`, `description`, `plan_type`, `come_from`, `come_to`, `go_from`, `go_to`, `core_start`, `core_end`, `regular_hours`, `tolerance_come_plus`, `tolerance_come_minus`, `tolerance_go_plus`, `tolerance_go_minus`, `rounding_come_type`, `rounding_come_interval`, `rounding_go_type`, `rounding_go_interval`, `min_work_time`, `max_net_work_time`, `is_active`, `created_at`, `updated_at`

From migration 000030 (ZMI fields): `regular_hours_2`, `from_employee_master`, `variable_work_time`, `round_all_bookings`, `rounding_come_add_value`, `rounding_go_add_value`, `holiday_credit_cat1`, `holiday_credit_cat2`, `holiday_credit_cat3`, `vacation_deduction`, `no_booking_behavior`, `day_change_behavior`, `shift_detect_arrive_from`, `shift_detect_arrive_to`, `shift_detect_depart_from`, `shift_detect_depart_to`, `shift_alt_plan_1`..`shift_alt_plan_6`

From migration 000079 (accounts): `net_account_id`, `cap_account_id`

Total: approximately 46 columns on `day_plans`.

## Code References

### Go Backend
- `apps/api/internal/model/dayplan.go` -- DayPlan, DayPlanBreak, DayPlanBonus models + enums (267 lines)
- `apps/api/internal/model/weekplan.go` -- WeekPlan model (90 lines)
- `apps/api/internal/service/dayplan.go` -- DayPlan CRUD + Breaks + Bonuses + Copy logic (685 lines)
- `apps/api/internal/service/weekplan.go` -- WeekPlan CRUD + day plan validation logic (257 lines)
- `apps/api/internal/handler/dayplan.go` -- DayPlan HTTP handler with sub-entity endpoints (559 lines)
- `apps/api/internal/handler/weekplan.go` -- WeekPlan HTTP handler (243 lines)
- `apps/api/internal/repository/dayplan.go` -- DayPlan repository with break/bonus ops (227 lines)
- `apps/api/internal/repository/weekplan.go` -- WeekPlan repository with 7-day-plan preloads (153 lines)

### Database Migrations
- `db/migrations/000015_create_day_plans.up.sql` -- Base day_plans table
- `db/migrations/000016_create_day_plan_breaks.up.sql` -- day_plan_breaks table
- `db/migrations/000017_create_day_plan_bonuses.up.sql` -- day_plan_bonuses table
- `db/migrations/000018_create_week_plans.up.sql` -- week_plans table
- `db/migrations/000030_add_day_plan_zmi_fields.up.sql` -- Extended ZMI fields + minutes_difference on breaks
- `db/migrations/000079_add_day_plan_net_cap_accounts.up.sql` -- net_account_id, cap_account_id on day_plans

### Prisma Schema
- `apps/web/prisma/schema.prisma` -- DayPlan, DayPlanBreak, DayPlanBonus, WeekPlan models NOT yet present (need to be added)
- `apps/web/prisma/schema.prisma:345-376` -- Account model (referenced by DayPlanBonus and DayPlan)

### tRPC Infrastructure
- `apps/web/src/server/trpc.ts` -- tRPC context, procedures (publicProcedure, protectedProcedure, tenantProcedure)
- `apps/web/src/server/middleware/authorization.ts` -- requirePermission middleware
- `apps/web/src/server/lib/permission-catalog.ts:100-101` -- day_plans.manage, week_plans.manage permissions
- `apps/web/src/server/root.ts` -- Root router registration (21 routers currently)

### Existing tRPC Router References
- `apps/web/src/server/routers/orders.ts` -- Reference CRUD pattern with relation preloads (461 lines)
- `apps/web/src/server/routers/activities.ts` -- Reference simple CRUD pattern (342 lines)
- `apps/web/src/server/routers/bookingTypes.ts` -- Reference CRUD with system type logic (439 lines)
- `apps/web/src/server/routers/calculationRules.ts` -- Reference CRUD with Decimal handling (386 lines)
- `apps/web/src/server/routers/groups.ts` -- Reference multi-model CRUD pattern (415 lines)

### Existing Test References
- `apps/web/src/server/__tests__/orders-router.test.ts` -- Test pattern with relation preloads (499 lines)
- `apps/web/src/server/__tests__/activities-router.test.ts` -- Simple CRUD test pattern (385 lines)
- `apps/web/src/server/__tests__/bookingTypes-router.test.ts` -- Test pattern with system types (385 lines)
- `apps/web/src/server/__tests__/helpers.ts` -- Shared test utilities (createMockContext, createMockSession, createUserWithPermissions, createMockUserTenant)

### Frontend Hooks
- `apps/web/src/hooks/api/use-day-plans.ts` -- Old pattern hooks (180 lines, 10 exported hooks)
- `apps/web/src/hooks/api/use-week-plans.ts` -- Old pattern hooks (91 lines, 5 exported hooks)
- `apps/web/src/hooks/api/index.ts` -- Re-exports all hooks

### Related Research
- `thoughts/shared/research/2026-03-05-ZMI-TICKET-215-groups-activities-orders.md` -- Previous tRPC router research
- `thoughts/shared/research/2026-03-06-ZMI-TICKET-216-bookingtypes-reasons-groups.md` -- Booking types tRPC router research

## Architecture Documentation

### Prisma Model Addition Pattern

New Prisma models follow the pattern established in `schema.prisma`:
1. Include migration reference comments at the top
2. Map all columns using `@map("snake_case")`
3. Map table using `@@map("table_name")`
4. Add proper indexes with named maps
5. Add relation fields with `@relation()` decorators
6. Run `npx prisma generate` to regenerate client

### Sub-Entity tRPC Pattern (New for This Ticket)

No existing tRPC router has sub-entity CRUD. The dayPlans router will introduce this pattern:
- Sub-entity procedures are prefixed with entity name: `dayPlans.createBreak`, `dayPlans.deleteBreak`
- Input includes parent ID: `{ dayPlanId: z.string().uuid(), ... }`
- Parent existence is verified before sub-entity operations
- Sub-entity operations use separate Prisma models (DayPlanBreak, DayPlanBonus)

### Copy Operation Pattern (New for This Ticket)

No existing tRPC router has a copy mutation. The `dayPlans.copy` procedure will:
1. Fetch original with details (breaks + bonuses)
2. Validate new code/name
3. Create new DayPlan with copied fields
4. Create new DayPlanBreak records for each original break
5. Create new DayPlanBonus records for each original bonus
6. Return the new day plan with details

### Week Plan Day Plan Validation Pattern

The WeekPlan router needs cross-entity validation:
1. Each day plan ID must reference an existing DayPlan
2. Each referenced DayPlan must belong to the same tenant
3. All 7 days must have day plans assigned (no nulls allowed per ZMI Section 11.2)

This validation requires querying the DayPlan table within the WeekPlan mutation -- using `ctx.prisma.dayPlan.findFirst({ where: { id, tenantId } })` for each non-null day plan ID.
