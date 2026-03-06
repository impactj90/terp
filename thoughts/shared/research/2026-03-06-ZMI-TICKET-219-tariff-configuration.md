# Research: ZMI-TICKET-219 -- Tariff Configuration

**Date:** 2026-03-06
**Ticket:** ZMI-TICKET-219
**Status:** Research complete

---

## 1. Go Tariff Implementation (Source of Truth)

### 1.1 Model Layer (`apps/api/internal/model/tariff.go` -- 417 lines)

Four GORM structs map to four DB tables:

**`Tariff`** (table: `tariffs`)
- Core fields: `ID`, `TenantID`, `Code` (varchar 20), `Name` (varchar 255), `Description` (text, nullable), `IsActive` (bool, default true)
- Week plan FK: `WeekPlanID` (uuid, nullable) -- single week plan for `weekly` rhythm
- Validity: `ValidFrom`, `ValidTo` (date, nullable)
- Vacation fields: `AnnualVacationDays` (decimal 5,2), `WorkDaysPerWeek` (int, default 5), `VacationBasis` (enum: `calendar_year` | `entry_date`), `VacationCappingRuleGroupID` (uuid FK, nullable)
- Target hours: `DailyTargetHours`, `WeeklyTargetHours` (decimal 5,2), `MonthlyTargetHours` (decimal 6,2), `AnnualTargetHours` (decimal 7,2) -- all nullable
- Rhythm: `RhythmType` (enum: `weekly` | `rolling_weekly` | `x_days`, default `weekly`), `CycleDays` (int, nullable, 1-365), `RhythmStartDate` (date, nullable)
- Flextime: `MaxFlextimePerMonth`, `UpperLimitAnnual`, `LowerLimitAnnual`, `FlextimeThreshold` (all int, nullable), `CreditType` (enum: `no_evaluation` | `complete_carryover` | `after_threshold` | `no_carryover`, default `no_evaluation`)
- Relations: `WeekPlan`, `Breaks[]`, `TariffWeekPlans[]`, `TariffDayPlans[]`, `VacationCappingRuleGroup`
- Helper methods: `GetAnnualVacationDays()`, `GetWorkDaysPerWeek()`, `GetVacationBasis()`, `CalculateProRatedVacation()`, `GetVacationYearStart/End()`, `GetDailyTargetMinutes()`, `GetWeeklyTargetMinutes()`, `GetRhythmType()`, `GetDayPlanIDForDate()`, `GetWeekPlanForDate()`

**`TariffBreak`** (table: `tariff_breaks`)
- `ID`, `TariffID`, `BreakType` (enum: `fixed` | `variable` | `minimum`), `AfterWorkMinutes` (int, nullable), `Duration` (int, required), `IsPaid` (bool), `SortOrder` (int), `CreatedAt`, `UpdatedAt`

**`TariffWeekPlan`** (table: `tariff_week_plans`)
- `ID`, `TariffID`, `WeekPlanID`, `SequenceOrder` (int, 1-based), `CreatedAt`
- Relation: `WeekPlan`
- Used for `rolling_weekly` rhythm -- ordered list of week plans that rotate

**`TariffDayPlan`** (table: `tariff_day_plans`)
- `ID`, `TariffID`, `DayPosition` (int, 1-based), `DayPlanID` (uuid, nullable -- NULL = off day), `CreatedAt`
- Relation: `DayPlan`
- Used for `x_days` rhythm -- day plan per cycle position

### 1.2 Repository Layer (`apps/api/internal/repository/tariff.go` -- 316 lines)

Repository methods (all use GORM):

| Method | Description |
|--------|-------------|
| `Create(ctx, tariff)` | Creates tariff |
| `GetByID(ctx, id)` | Gets tariff by ID (no preloads) |
| `GetByCode(ctx, tenantID, code)` | Gets tariff by code within tenant |
| `GetWithDetails(ctx, id)` | Gets tariff with all relations preloaded (WeekPlan, Breaks ordered by sort_order, TariffWeekPlans ordered by sequence_order with WeekPlan, TariffDayPlans ordered by day_position with DayPlan) |
| `Update(ctx, tariff)` | Saves full tariff (GORM Save) |
| `Upsert(ctx, tariff)` | FirstOrCreate by ID |
| `Delete(ctx, id)` | Hard delete |
| `List(ctx, tenantID)` | List all tariffs for tenant with full preloads, ordered by code ASC |
| `ListActive(ctx, tenantID)` | Same as List but filtered by is_active=true |
| `CreateBreak(ctx, break)` | Creates tariff break |
| `GetBreakByID(ctx, id)` | Gets break by ID |
| `DeleteBreak(ctx, id)` | Hard deletes break |
| `ListBreaks(ctx, tariffID)` | Lists breaks for tariff, ordered by sort_order |
| `ReplaceTariffWeekPlans(ctx, tariffID, weekPlans)` | Deletes existing + creates new (in transaction) |
| `DeleteTariffWeekPlans(ctx, tariffID)` | Deletes all week plans for tariff |
| `ListTariffWeekPlans(ctx, tariffID)` | Lists week plans with WeekPlan preload |
| `ReplaceTariffDayPlans(ctx, tariffID, dayPlans)` | Deletes existing + creates new (in transaction) |
| `DeleteTariffDayPlans(ctx, tariffID)` | Deletes all day plans for tariff |
| `ListTariffDayPlans(ctx, tariffID)` | Lists day plans with DayPlan preload |

### 1.3 Service Layer (`apps/api/internal/service/tariff.go` -- 757 lines)

**Dependencies:** `tariffRepository`, `weekPlanRepositoryForTariff`, `dayPlanRepositoryForTariff`

**Error constants (14 total):**
- `ErrTariffNotFound`, `ErrTariffCodeExists`, `ErrTariffCodeReq`, `ErrTariffNameReq`
- `ErrInvalidWeekPlan`, `ErrTariffBreakNotFound`, `ErrInvalidBreakType`, `ErrBreakDurationReq`
- `ErrInvalidVacationBasis`, `ErrInvalidCreditType`, `ErrInvalidWorkDays`
- `ErrInvalidRhythmType`, `ErrInvalidCycleDays`, `ErrCycleDaysRequired`, `ErrWeekPlansRequired`
- `ErrInvalidDayPosition`, `ErrRhythmStartDateRequired`

**Service methods:**

**`Create(ctx, CreateTariffInput)` -> `(*Tariff, error)`**
1. Validates code (required, trimmed) and name (required, trimmed)
2. Checks code uniqueness within tenant via `GetByCode`
3. Defaults rhythm_type to `weekly` if empty
4. Validates rhythm type is one of 3 valid values
5. Rhythm-specific validation:
   - `weekly`: validates single week plan FK if provided (exists + same tenant)
   - `rolling_weekly`: requires `WeekPlanIDs` list (non-empty), requires `RhythmStartDate`, validates all week plan IDs (exist + same tenant)
   - `x_days`: requires `CycleDays` (1-365), requires `RhythmStartDate`, validates day plans (position within cycle_days, day plan exists + same tenant if non-null)
6. Validates vacation_basis, credit_type, work_days_per_week if provided
7. Creates tariff record
8. Creates rhythm-specific sub-records (TariffWeekPlans or TariffDayPlans)
9. Returns tariff with full details via `GetWithDetails`

**`Update(ctx, id, tenantID, UpdateTariffInput)` -> `(*Tariff, error)`**
1. Fetches existing tariff by ID (404 if not found)
2. Applies partial updates for all fields using `Clear*` flags for nullable fields
3. Validates rhythm type, cycle_days, week plan IDs, day plans as needed
4. Saves tariff
5. Updates rhythm sub-records (replace week plans, replace day plans)
6. Cleans up stale sub-records when rhythm type changes (e.g., switching from rolling_weekly to weekly clears TariffWeekPlans + TariffDayPlans)
7. Returns tariff with full details

**`Delete(ctx, id)` -> `error`**
- Checks existence, then hard deletes (no assignment check in Go -- ticket says it should check)

**`List(ctx, tenantID)` / `ListActive(ctx, tenantID)`**
- Delegates directly to repository

**`CreateBreak(ctx, CreateTariffBreakInput)` -> `(*TariffBreak, error)`**
1. Validates tariff exists
2. Validates break_type is `fixed`, `variable`, or `minimum`
3. Validates duration > 0
4. Auto-calculates sort_order from existing break count
5. Creates and returns break

**`DeleteBreak(ctx, tariffID, breakID)` -> `error`**
1. Validates tariff exists
2. Validates break exists AND belongs to tariff
3. Deletes break

### 1.4 Handler Layer (`apps/api/internal/handler/tariff.go` -- 538 lines)

HTTP handlers using Chi router, `models.CreateTariffRequest` / `models.UpdateTariffRequest` from generated OpenAPI models.

**Routes** (from `routes.go` line 355-378):
```
GET    /tariffs              -> List    (tariffs.manage)
POST   /tariffs              -> Create  (tariffs.manage)
GET    /tariffs/{id}         -> Get     (tariffs.manage)
PUT    /tariffs/{id}         -> Update  (tariffs.manage)
DELETE /tariffs/{id}         -> Delete  (tariffs.manage)
POST   /tariffs/{id}/breaks  -> CreateBreak  (tariffs.manage)
DELETE /tariffs/{id}/breaks/{breakId} -> DeleteBreak (tariffs.manage)
```

All routes use the same `tariffs.manage` permission.

### 1.5 Tests (`apps/api/internal/service/tariff_test.go` -- 892 lines)

25 test functions covering:
- Create: success, with week plan, with description, with validity dates, empty code, empty name, duplicate code, invalid week plan, cross-tenant week plan
- GetByID: success, not found
- GetDetails: success with week plan + breaks preloaded, not found
- Update: success, add week plan, clear week plan, not found, empty name, invalid week plan
- Delete: success, not found
- List: returns all tariffs
- ListActive: filters inactive
- CreateBreak: success (with afterWorkMinutes), tariff not found, invalid break type, zero duration, sort order increment
- DeleteBreak: success, tariff not found, break not found, wrong tariff (cross-tariff break deletion blocked)
- Rhythm tests: rolling_weekly requires start date, rolling_weekly with start date succeeds, x_days requires start date, x_days with start date succeeds

---

## 2. Existing tRPC Router Patterns

### 2.1 Standard Structure (observed in absenceTypes, weekPlans, dayPlans, groups, etc.)

```typescript
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

const ENTITY_MANAGE = permissionIdByKey("entity.manage")!

// Output schema (Zod)
const outputSchema = z.object({ ... })

// Input schemas (Zod)
const createInputSchema = z.object({ ... })
const updateInputSchema = z.object({ id: z.string().uuid(), ...partialFields })

// Helper: mapToOutput function
function mapToOutput(record: { ... }): OutputType { ... }

// Router
export const entityRouter = createTRPCRouter({
  list: tenantProcedure
    .use(requirePermission(ENTITY_MANAGE))
    .input(z.object({ isActive?: z.boolean() }).optional())
    .output(z.object({ data: z.array(outputSchema) }))
    .query(async ({ ctx, input }) => { ... }),

  getById: tenantProcedure
    .use(requirePermission(ENTITY_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(outputSchema)
    .query(async ({ ctx, input }) => { ... }),

  create: tenantProcedure
    .use(requirePermission(ENTITY_MANAGE))
    .input(createInputSchema)
    .output(outputSchema)
    .mutation(async ({ ctx, input }) => { ... }),

  update: tenantProcedure
    .use(requirePermission(ENTITY_MANAGE))
    .input(updateInputSchema)
    .output(outputSchema)
    .mutation(async ({ ctx, input }) => { ... }),

  delete: tenantProcedure
    .use(requirePermission(ENTITY_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => { ... }),
})
```

### 2.2 Router Registration (`apps/web/src/server/root.ts`)

Routers are imported and added to `appRouter`:
```typescript
import { entityRouter } from "./routers/entity"
export const appRouter = createTRPCRouter({
  entity: entityRouter,
  // ...
})
```

Currently 28 routers registered. No `tariffs` router exists yet.

### 2.3 Permission Pattern

- `permissionIdByKey("tariffs.manage")` is already defined in the permission catalog (line 102)
- All tariff routes in Go use a single `tariffs.manage` permission
- tRPC routers use `.use(requirePermission(PERMISSION_ID))` on each procedure

### 2.4 Sub-entity Pattern (from dayPlans router)

The dayPlans router handles sub-entities (breaks, bonuses) within the same router:
```typescript
export const dayPlansRouter = createTRPCRouter({
  list: ...,
  getById: ...,
  create: ...,
  update: ...,
  delete: ...,
  createBreak: tenantProcedure
    .use(requirePermission(DAY_PLANS_MANAGE))
    .input(z.object({ dayPlanId: z.string().uuid(), ... }))
    .output(breakOutputSchema)
    .mutation(async ({ ctx, input }) => { ... }),
  deleteBreak: tenantProcedure
    .use(requirePermission(DAY_PLANS_MANAGE))
    .input(z.object({ dayPlanId: z.string().uuid(), breakId: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => { ... }),
})
```

### 2.5 Validation Patterns

- Code uniqueness: `prisma.entity.findFirst({ where: { tenantId, code } })` -- throw CONFLICT if exists
- Name trimming + empty check: throw BAD_REQUEST
- FK validation: `prisma.relatedEntity.findFirst({ where: { id, tenantId } })` -- throw BAD_REQUEST if not found
- Existence check: `findFirst({ where: { id, tenantId } })` -- throw NOT_FOUND
- Nullable field clearing: `if (input.field !== undefined) data.field = input.field` (null to clear)

### 2.6 Delete Patterns

Two patterns observed:
1. **Simple hard delete** (weekPlans, groups): Delete without usage check
2. **Usage check before delete** (absenceTypes): Check referencing records, throw BAD_REQUEST if in use

Ticket specifies tariff delete should check `EmployeeTariffAssignment` usage -- matching pattern 2.

---

## 3. Prisma Schema State

### 3.1 Tariff Models -- NOT YET IN PRISMA

The Prisma schema (`apps/web/prisma/schema.prisma`) does NOT contain any tariff models. There are two explicit comments noting this:

- Line 558-559 (Employee model): `"// Note: tariffId FK references tariffs(id) ON DELETE SET NULL. // Tariff model not yet in Prisma. Relation will be added when it is."`
- Line 674-675 (EmployeeTariffAssignment model): `"// Note: tariffId FK references tariffs(id) ON DELETE CASCADE. // Tariff model not yet in Prisma. Relation will be added when it is."`

### 3.2 DB Tables That Exist (from migrations)

The following tables exist in the database but have no Prisma model:
- `tariffs` (migration 000019, extended by 000029, 000031, 000051)
- `tariff_breaks` (migration 000020)
- `tariff_week_plans` (migration 000031)
- `tariff_day_plans` (migration 000031)

### 3.3 Related Models Already in Prisma

- **`WeekPlan`** (line 1272): Full model with 7 day plan FKs, tenant-scoped, code+name, isActive
- **`DayPlan`** (line 1100): Full model with all ZMI fields
- **`Employee`** (line 466): Has `tariffId` column (string, nullable) but no Prisma relation to Tariff
- **`EmployeeTariffAssignment`** (line 658): Has `tariffId` column (string) but no Prisma relation to Tariff
- **`Tenant`** (line 77): Has `employeeTariffAssignments` relation
- **`VacationCappingRuleGroup`**: NOT in Prisma schema (table exists from migration 000051)

### 3.4 Prisma Models Needed for TICKET-219

Must add to `schema.prisma`:
1. `Tariff` model with all columns from migrations 000019/000029/000031/000051
2. `TariffBreak` model from migration 000020
3. `TariffWeekPlan` model from migration 000031
4. `TariffDayPlan` model from migration 000031
5. Update `Employee` model to add `tariff` relation
6. Update `EmployeeTariffAssignment` to add `tariff` relation
7. Add back-references on `WeekPlan` (for tariff_week_plans FK)
8. Add back-references on `DayPlan` (for tariff_day_plans FK)

---

## 4. Frontend Hook Patterns

### 4.1 Current Tariff Hooks (`apps/web/src/hooks/api/use-tariffs.ts`)

Uses the old REST-based `useApiQuery` / `useApiMutation` pattern:
- `useTariffs({ active?, enabled? })` -> `GET /tariffs`
- `useTariff(id, enabled)` -> `GET /tariffs/{id}`
- `useCreateTariff()` -> `POST /tariffs`
- `useUpdateTariff()` -> `PUT /tariffs/{id}`
- `useDeleteTariff()` -> `DELETE /tariffs/{id}`
- `useCreateTariffBreak()` -> `POST /tariffs/{id}/breaks`
- `useDeleteTariffBreak()` -> `DELETE /tariffs/{id}/breaks/{breakId}`

### 4.2 Migrated tRPC Hook Pattern (from `apps/web/src/hooks/api/use-absence-types.ts`)

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useAbsenceTypes(options = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.absenceTypes.list.queryOptions(
      Object.keys(input).length > 0 ? input : undefined,
      { enabled }
    )
  )
}

export function useCreateAbsenceType() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.absenceTypes.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.absenceTypes.list.queryKey(),
      })
    },
  })
}
```

Key differences from REST hooks:
- Uses `useTRPC()` for procedure references
- Query hooks use `trpc.router.procedure.queryOptions()`
- Mutation hooks use `trpc.router.procedure.mutationOptions()`
- Cache invalidation uses `trpc.router.procedure.queryKey()`

---

## 5. WeekPlan / DayPlan Implementation Status

### 5.1 tRPC Routers (from ZMI-TICKET-217)

Both are fully implemented:

**`apps/web/src/server/routers/weekPlans.ts`** (506 lines)
- Procedures: `list`, `getById`, `create`, `update`, `delete`
- Permission: `week_plans.manage`
- Includes day plan summaries via `weekPlanInclude` (select id, code, name, planType for each day)
- Validates all 7 day plan IDs on create (all required, must exist in same tenant)
- Validates completeness after update (all 7 days must have plans)
- Code uniqueness within tenant

**`apps/web/src/server/routers/dayPlans.ts`** (large, 51.5KB output)
- Procedures: `list`, `getById`, `create`, `update`, `delete`, `copy`, `createBreak`, `deleteBreak`, `createBonus`, `deleteBonus`
- Permission: `day_plans.manage`
- Complex sub-entity management for breaks and bonuses

### 5.2 Tests

Both have test files:
- `apps/web/src/server/__tests__/weekPlans-router.test.ts`
- `apps/web/src/server/__tests__/dayPlans-router.test.ts`

---

## 6. Permission System

### 6.1 Permission Catalog

`tariffs.manage` permission already exists in `apps/web/src/server/lib/permission-catalog.ts` (line 102):
```typescript
p("tariffs.manage", "tariffs", "manage", "Manage tariffs"),
```

### 6.2 Usage Pattern

```typescript
const TARIFFS_MANAGE = permissionIdByKey("tariffs.manage")!

// Applied per procedure:
list: tenantProcedure
  .use(requirePermission(TARIFFS_MANAGE))
  .input(...)
  .query(...)
```

### 6.3 Go Route Permissions

All 7 tariff routes use the single `tariffs.manage` permission (verified in `handler/routes.go` lines 355-378).

---

## 7. Test Pattern for tRPC Routers

### 7.1 Standard Test Structure (from absenceTypes-router.test.ts)

```typescript
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "../trpc"
import { entityRouter } from "../routers/entity"
import { permissionIdByKey } from "../lib/permission-catalog"
import { createMockContext, createMockSession, createUserWithPermissions, createMockUserTenant } from "./helpers"

const PERMISSION = permissionIdByKey("entity.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(entityRouter)

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ...,
    authToken: "test-token",
    user: createUserWithPermissions([PERMISSION], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// Tests use vi.fn() to mock Prisma methods
describe("entity.list", () => {
  it("returns items", async () => {
    const mockPrisma = { entity: { findMany: vi.fn().mockResolvedValue([...]) } }
    const ctx = createTestContext(mockPrisma)
    const caller = createCaller(ctx)
    const result = await caller.list()
    expect(result.data).toHaveLength(...)
  })
})
```

---

## 8. Key Gaps / Observations

1. **Prisma schema missing Tariff models entirely** -- Must add Tariff, TariffBreak, TariffWeekPlan, TariffDayPlan models before implementing the tRPC router
2. **VacationCappingRuleGroup not in Prisma** -- FK exists in DB but model not in schema; can be added as a string FK for now without full relation
3. **Go Delete does NOT check assignments** -- The ticket requires checking `EmployeeTariffAssignment` references before deletion; this is new logic not in Go
4. **Tariff has significantly more fields than ticket suggests** -- Ticket's Prisma schema proposal is simplified (e.g., uses `weekly_hours`/`daily_hours` instead of the actual `daily_target_hours`/`weekly_target_hours`/`monthly_target_hours`/`annual_target_hours`); the real DB schema from migrations is the source of truth
5. **BreakType in ticket vs Go differ** -- Ticket suggests `start_time`/`end_time`/`duration_minutes`/`is_paid` for breaks; Go model uses `break_type` (fixed/variable/minimum), `after_work_minutes`, `duration`, `is_paid`, `sort_order` -- Go model matches DB schema
6. **Tariff `Code` field** -- Present in Go model and DB but missing from ticket's create input; must be included
7. **`credit_type` value `complete` was migrated to `complete_carryover`** in migration 000032

---

## 9. File Inventory

### Go files (to be replaced by tRPC):
- `/home/tolga/projects/terp/apps/api/internal/model/tariff.go` (417 lines)
- `/home/tolga/projects/terp/apps/api/internal/service/tariff.go` (757 lines)
- `/home/tolga/projects/terp/apps/api/internal/service/tariff_test.go` (892 lines)
- `/home/tolga/projects/terp/apps/api/internal/handler/tariff.go` (538 lines)
- `/home/tolga/projects/terp/apps/api/internal/repository/tariff.go` (316 lines)

### Frontend files (to be migrated):
- `/home/tolga/projects/terp/apps/web/src/hooks/api/use-tariffs.ts` (126 lines)

### Reference tRPC routers (patterns to follow):
- `/home/tolga/projects/terp/apps/web/src/server/routers/absenceTypes.ts` (CRUD with usage check on delete)
- `/home/tolga/projects/terp/apps/web/src/server/routers/dayPlans.ts` (CRUD with sub-entities: breaks, bonuses)
- `/home/tolga/projects/terp/apps/web/src/server/routers/weekPlans.ts` (CRUD with day plan FK validation)

### Reference tRPC hook (migration pattern):
- `/home/tolga/projects/terp/apps/web/src/hooks/api/use-absence-types.ts` (tRPC-based hooks)

### Schema files:
- `/home/tolga/projects/terp/apps/web/prisma/schema.prisma` (Prisma schema -- needs Tariff models added)

### Infrastructure files:
- `/home/tolga/projects/terp/apps/web/src/server/root.ts` (router registration)
- `/home/tolga/projects/terp/apps/web/src/server/trpc.ts` (tRPC context + procedures)
- `/home/tolga/projects/terp/apps/web/src/server/middleware/authorization.ts` (permission middleware)
- `/home/tolga/projects/terp/apps/web/src/server/lib/permission-catalog.ts` (`tariffs.manage` at line 102)

### DB migration files:
- `/home/tolga/projects/terp/db/migrations/000019_create_tariffs.up.sql`
- `/home/tolga/projects/terp/db/migrations/000020_create_tariff_breaks.up.sql`
- `/home/tolga/projects/terp/db/migrations/000029_add_tariff_zmi_fields.up.sql`
- `/home/tolga/projects/terp/db/migrations/000031_add_tariff_rhythm_fields.up.sql`
- `/home/tolga/projects/terp/db/migrations/000032_fix_credit_type_complete_value.up.sql`
- `/home/tolga/projects/terp/db/migrations/000051_create_vacation_capping_rule_groups.up.sql`
