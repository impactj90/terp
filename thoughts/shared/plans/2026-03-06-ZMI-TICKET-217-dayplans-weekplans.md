# tRPC Routers: DayPlans (with Breaks, Bonuses, Copy) and WeekPlans - Implementation Plan

## Overview

Implement two tRPC routers for DayPlans and WeekPlans by porting business logic from the Go backend into TypeScript tRPC procedures. DayPlans are the most complex entity ported so far due to sub-entity CRUD (Breaks and Bonuses) and the Copy operation. WeekPlans reference DayPlans via 7 nullable FK columns (Monday through Sunday). This includes adding Prisma models (DayPlan, DayPlanBreak, DayPlanBonus, WeekPlan), building CRUD routers with sub-entity procedures, migrating two frontend hooks from the old `useApiQuery`/`useApiMutation` pattern to tRPC, and creating comprehensive test coverage.

## Current State Analysis

- **Prisma models**: NONE of the four entity types exist in the Prisma schema yet. All four models (`DayPlan`, `DayPlanBreak`, `DayPlanBonus`, `WeekPlan`) need to be added to `apps/web/prisma/schema.prisma`.
- **Database tables**: All tables already exist via SQL migrations: `day_plans` (000015 + 000030 + 000079), `day_plan_breaks` (000016 + 000030), `day_plan_bonuses` (000017), `week_plans` (000018).
- **Go business logic**: Complete service implementations exist: `apps/api/internal/service/dayplan.go` (685 lines -- CRUD + Breaks + Bonuses + Copy) and `apps/api/internal/service/weekplan.go` (257 lines).
- **Permission catalog**: `day_plans.manage` (line 100) and `week_plans.manage` (line 101) already exist in `apps/web/src/server/lib/permission-catalog.ts`. The ticket mentions `day_plans.read`/`day_plans.write` but these do NOT exist in the catalog. All existing tRPC routers use a single `.manage` permission. We follow the established pattern.
- **tRPC infrastructure**: Fully operational with `tenantProcedure`, `requirePermission`, and `createCallerFactory`.
- **Root router**: 25 routers currently registered in `apps/web/src/server/root.ts` -- 2 new ones to add.
- **Frontend hooks**: Two hooks exist using old `useApiQuery`/`useApiMutation` pattern: `use-day-plans.ts` (180 lines, 10 exported hooks) and `use-week-plans.ts` (91 lines, 5 exported hooks).
- **Account model**: Already exists in Prisma (`apps/web/prisma/schema.prisma:345-376`), needed for `DayPlanBonus.accountId` and `DayPlan.netAccountId`/`DayPlan.capAccountId` relations.

### Key Discoveries:
- `day_plans` table has approximately 46 columns across three migrations (000015 base, 000030 ZMI fields, 000079 net/cap accounts). This is by far the largest entity in the Prisma schema.
- `DayPlan` has 6 self-referential nullable FK columns (`shift_alt_plan_1` through `shift_alt_plan_6`) for shift detection alternative plans. These reference `day_plans(id)` without `ON DELETE` specified (defaults to NO ACTION).
- The Go `Copy` method (`apps/api/internal/service/dayplan.go`) copies a day plan including all breaks and bonuses with new code/name. This is the first tRPC router that needs a copy mutation.
- Sub-entity CRUD (Breaks, Bonuses) is the first occurrence in tRPC routers. The Go handler exposes Add and Delete for both (no Update endpoint). The tRPC procedures become flat: `dayPlans.createBreak`, `dayPlans.deleteBreak`, `dayPlans.createBonus`, `dayPlans.deleteBonus`.
- Reserved day plan codes: `U`, `K`, `S` (checked case-insensitive in Go via `isReservedDayPlanCode`).
- Flextime normalization: when `planType` is `flextime`, the Go service zeros out `toleranceComePlus`, `toleranceGoMinus`, and `variableWorkTime`.
- Break validation depends on `breakType`: `fixed` requires `startTime` and `endTime` (startTime < endTime); `minimum` requires `afterWorkMinutes`; `variable` has no time requirements. All types require `duration > 0`.
- Bonus validation: `timeFrom < timeTo`, `valueMinutes > 0`.
- WeekPlan completeness rule (ZMI Section 11.2): all 7 day plan IDs must be non-nil. Cross-entity validation requires querying `DayPlan` within WeekPlan mutations.
- `DayPlan.vacationDeduction` is `DECIMAL(5,2)` in PostgreSQL, maps to `Prisma.Decimal`.

## Desired End State

After completing this plan:
1. Four new Prisma models (`DayPlan`, `DayPlanBreak`, `DayPlanBonus`, `WeekPlan`) exist in `schema.prisma` with proper relations and indexes.
2. The `Tenant` model has relation fields for `DayPlan` and `WeekPlan`.
3. The `Account` model has reverse relation fields for `DayPlanBonus`, `DayPlan` (net), `DayPlan` (cap).
4. Two new tRPC routers (`dayPlans`, `weekPlans`) are registered in the root router.
5. The `dayPlans` router supports full CRUD plus sub-entity operations (createBreak, deleteBreak, createBonus, deleteBonus) and a copy mutation.
6. The `weekPlans` router supports CRUD with cross-entity day plan validation.
7. Frontend hooks use tRPC instead of REST (2 hooks migrated).
8. Both routers have comprehensive test coverage.
9. `npx tsc --noEmit` and all tests pass.

**Verification**: Run `cd apps/web && npx vitest run src/server/__tests__/` to verify all router tests pass. Run `cd apps/web && npx tsc --noEmit` to verify type checking. Run `cd apps/web && npx prisma generate` to regenerate the Prisma client after schema changes.

## What We're NOT Doing

- **Database migrations**: All tables already exist. We only update the Prisma schema to match existing tables.
- **Employee Day Plans**: Deferred to ZMI-TICKET-228, ZMI-TICKET-229.
- **Tariff assignment of DayPlans**: Deferred to ZMI-TICKET-219.
- **Update Break / Update Bonus**: The Go handler only exposes Add and Delete for breaks/bonuses (no update endpoint). The ticket also only lists createBreak/deleteBreak/createBonus/deleteBonus. We match the existing Go API surface.
- **UI page components**: Only the hook layer is migrated; page components remain unchanged.
- **Go endpoint removal**: Go REST endpoints stay in place during migration.
- **New permissions**: The ticket mentions `day_plans.read`/`day_plans.write` but these do not exist in the catalog. We use `day_plans.manage` for all dayPlan procedures and `week_plans.manage` for all weekPlan procedures, matching the Go backend.

## Implementation Approach

Build in phases ordered by dependency: first Prisma schema (prerequisite for all routers), then the dayPlans router (most complex, introduces sub-entity and copy patterns), then weekPlans router (depends on dayPlans for validation), then frontend hooks migration, and finally tests for both routers.

---

## Phase 1: Prisma Schema Updates

### Overview
Add four new Prisma models (`DayPlan`, `DayPlanBreak`, `DayPlanBonus`, `WeekPlan`) and update the `Tenant` and `Account` models with proper relation fields. This is the prerequisite for all subsequent phases.

### Changes Required:

#### 1. Add DayPlan Model
**File**: `apps/web/prisma/schema.prisma`
**Changes**: Add after the `CalculationRule` model section (end of file).

```prisma
// -----------------------------------------------------------------------------
// DayPlan
// -----------------------------------------------------------------------------
// Migrations: 000015, 000030, 000079
//
// CHECK constraints (enforced at DB level only):
//   - plan_type IN ('fixed', 'flextime')
//   - no_booking_behavior IN ('error', 'deduct_target', 'vocational_school', 'adopt_target', 'target_with_order')
//   - day_change_behavior IN ('none', 'at_arrival', 'at_departure', 'auto_complete')
//
// Self-referential FKs shift_alt_plan_1..6 cannot all be modeled as named Prisma relations
// without excessive verbosity. We model the columns but omit relation fields for alt plans.
//
// Trigger: update_updated_at_column() auto-sets updated_at on UPDATE
model DayPlan {
  id                    String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId              String    @map("tenant_id") @db.Uuid
  code                  String    @db.VarChar(20)
  name                  String    @db.VarChar(255)
  description           String?   @db.Text
  planType              String    @default("fixed") @map("plan_type") @db.VarChar(20)

  // Time windows (minutes from midnight)
  comeFrom              Int?      @map("come_from") @db.Integer
  comeTo                Int?      @map("come_to") @db.Integer
  goFrom                Int?      @map("go_from") @db.Integer
  goTo                  Int?      @map("go_to") @db.Integer
  coreStart             Int?      @map("core_start") @db.Integer
  coreEnd               Int?      @map("core_end") @db.Integer

  // Target hours
  regularHours          Int       @default(480) @map("regular_hours") @db.Integer
  regularHours2         Int?      @map("regular_hours_2") @db.Integer
  fromEmployeeMaster    Boolean   @default(false) @map("from_employee_master")

  // Tolerance settings
  toleranceComePlus     Int       @default(0) @map("tolerance_come_plus") @db.Integer
  toleranceComeMinus    Int       @default(0) @map("tolerance_come_minus") @db.Integer
  toleranceGoPlus       Int       @default(0) @map("tolerance_go_plus") @db.Integer
  toleranceGoMinus      Int       @default(0) @map("tolerance_go_minus") @db.Integer

  // Rounding settings
  roundingComeType      String?   @map("rounding_come_type") @db.VarChar(20)
  roundingComeInterval  Int?      @map("rounding_come_interval") @db.Integer
  roundingGoType        String?   @map("rounding_go_type") @db.VarChar(20)
  roundingGoInterval    Int?      @map("rounding_go_interval") @db.Integer

  // Caps
  minWorkTime           Int?      @map("min_work_time") @db.Integer
  maxNetWorkTime        Int?      @map("max_net_work_time") @db.Integer

  // Variable work time
  variableWorkTime      Boolean   @default(false) @map("variable_work_time")

  // Rounding extras
  roundAllBookings      Boolean   @default(false) @map("round_all_bookings")
  roundingComeAddValue  Int?      @map("rounding_come_add_value") @db.Integer
  roundingGoAddValue    Int?      @map("rounding_go_add_value") @db.Integer

  // Holiday credits (minutes)
  holidayCreditCat1     Int?      @map("holiday_credit_cat1") @db.Integer
  holidayCreditCat2     Int?      @map("holiday_credit_cat2") @db.Integer
  holidayCreditCat3     Int?      @map("holiday_credit_cat3") @db.Integer

  // Vacation deduction
  vacationDeduction     Decimal   @default(1.00) @map("vacation_deduction") @db.Decimal(5, 2)

  // No-booking behavior
  noBookingBehavior     String    @default("error") @map("no_booking_behavior") @db.VarChar(30)

  // Day change behavior
  dayChangeBehavior     String    @default("none") @map("day_change_behavior") @db.VarChar(30)

  // Shift detection windows (minutes from midnight)
  shiftDetectArriveFrom Int?      @map("shift_detect_arrive_from") @db.Integer
  shiftDetectArriveTo   Int?      @map("shift_detect_arrive_to") @db.Integer
  shiftDetectDepartFrom Int?      @map("shift_detect_depart_from") @db.Integer
  shiftDetectDepartTo   Int?      @map("shift_detect_depart_to") @db.Integer

  // Alternative day plans for shift detection (self-referential FKs)
  shiftAltPlan1         String?   @map("shift_alt_plan_1") @db.Uuid
  shiftAltPlan2         String?   @map("shift_alt_plan_2") @db.Uuid
  shiftAltPlan3         String?   @map("shift_alt_plan_3") @db.Uuid
  shiftAltPlan4         String?   @map("shift_alt_plan_4") @db.Uuid
  shiftAltPlan5         String?   @map("shift_alt_plan_5") @db.Uuid
  shiftAltPlan6         String?   @map("shift_alt_plan_6") @db.Uuid

  // Account references
  netAccountId          String?   @map("net_account_id") @db.Uuid
  capAccountId          String?   @map("cap_account_id") @db.Uuid

  isActive              Boolean   @default(true) @map("is_active")
  createdAt             DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt             DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant     Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  netAccount Account?       @relation("DayPlanNetAccount", fields: [netAccountId], references: [id], onDelete: SetNull)
  capAccount Account?       @relation("DayPlanCapAccount", fields: [capAccountId], references: [id], onDelete: SetNull)
  breaks     DayPlanBreak[]
  bonuses    DayPlanBonus[]

  // Indexes
  @@unique([tenantId, code], map: "day_plans_tenant_id_code_key")
  @@index([tenantId], map: "idx_day_plans_tenant")
  @@index([tenantId, isActive], map: "idx_day_plans_active")
  @@map("day_plans")
}
```

#### 2. Add DayPlanBreak Model
**File**: `apps/web/prisma/schema.prisma`

```prisma
// -----------------------------------------------------------------------------
// DayPlanBreak
// -----------------------------------------------------------------------------
// Migrations: 000016, 000030
//
// CHECK constraints (enforced at DB level only):
//   - break_type IN ('fixed', 'variable', 'minimum')
model DayPlanBreak {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  dayPlanId         String    @map("day_plan_id") @db.Uuid
  breakType         String    @map("break_type") @db.VarChar(20)
  startTime         Int?      @map("start_time") @db.Integer
  endTime           Int?      @map("end_time") @db.Integer
  duration          Int       @db.Integer
  afterWorkMinutes  Int?      @map("after_work_minutes") @db.Integer
  autoDeduct        Boolean   @default(true) @map("auto_deduct")
  isPaid            Boolean   @default(false) @map("is_paid")
  minutesDifference Boolean   @default(false) @map("minutes_difference")
  sortOrder         Int       @default(0) @map("sort_order") @db.Integer
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  dayPlan DayPlan @relation(fields: [dayPlanId], references: [id], onDelete: Cascade)

  // Indexes
  @@index([dayPlanId], map: "idx_day_plan_breaks_plan")
  @@map("day_plan_breaks")
}
```

#### 3. Add DayPlanBonus Model
**File**: `apps/web/prisma/schema.prisma`

```prisma
// -----------------------------------------------------------------------------
// DayPlanBonus
// -----------------------------------------------------------------------------
// Migration: 000017
//
// CHECK constraints (enforced at DB level only):
//   - calculation_type IN ('fixed', 'per_minute', 'percentage')
model DayPlanBonus {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  dayPlanId         String    @map("day_plan_id") @db.Uuid
  accountId         String    @map("account_id") @db.Uuid
  timeFrom          Int       @map("time_from") @db.Integer
  timeTo            Int       @map("time_to") @db.Integer
  calculationType   String    @map("calculation_type") @db.VarChar(20)
  valueMinutes      Int       @map("value_minutes") @db.Integer
  minWorkMinutes    Int?      @map("min_work_minutes") @db.Integer
  appliesOnHoliday  Boolean   @default(false) @map("applies_on_holiday")
  sortOrder         Int       @default(0) @map("sort_order") @db.Integer
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  dayPlan DayPlan @relation(fields: [dayPlanId], references: [id], onDelete: Cascade)
  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  // Indexes
  @@index([dayPlanId], map: "idx_day_plan_bonuses_plan")
  @@index([accountId], map: "idx_day_plan_bonuses_account")
  @@map("day_plan_bonuses")
}
```

#### 4. Add WeekPlan Model
**File**: `apps/web/prisma/schema.prisma`

```prisma
// -----------------------------------------------------------------------------
// WeekPlan
// -----------------------------------------------------------------------------
// Migration: 000018
//
// 7 nullable FK columns referencing day_plans(id) ON DELETE SET NULL.
// Note: Prisma requires named relations when multiple FKs reference the same model.
model WeekPlan {
  id                    String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId              String    @map("tenant_id") @db.Uuid
  code                  String    @db.VarChar(20)
  name                  String    @db.VarChar(255)
  description           String?   @db.Text
  mondayDayPlanId       String?   @map("monday_day_plan_id") @db.Uuid
  tuesdayDayPlanId      String?   @map("tuesday_day_plan_id") @db.Uuid
  wednesdayDayPlanId    String?   @map("wednesday_day_plan_id") @db.Uuid
  thursdayDayPlanId     String?   @map("thursday_day_plan_id") @db.Uuid
  fridayDayPlanId       String?   @map("friday_day_plan_id") @db.Uuid
  saturdayDayPlanId     String?   @map("saturday_day_plan_id") @db.Uuid
  sundayDayPlanId       String?   @map("sunday_day_plan_id") @db.Uuid
  isActive              Boolean   @default(true) @map("is_active")
  createdAt             DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt             DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  mondayDayPlan   DayPlan? @relation("WeekPlanMonday", fields: [mondayDayPlanId], references: [id], onDelete: SetNull)
  tuesdayDayPlan  DayPlan? @relation("WeekPlanTuesday", fields: [tuesdayDayPlanId], references: [id], onDelete: SetNull)
  wednesdayDayPlan DayPlan? @relation("WeekPlanWednesday", fields: [wednesdayDayPlanId], references: [id], onDelete: SetNull)
  thursdayDayPlan DayPlan? @relation("WeekPlanThursday", fields: [thursdayDayPlanId], references: [id], onDelete: SetNull)
  fridayDayPlan   DayPlan? @relation("WeekPlanFriday", fields: [fridayDayPlanId], references: [id], onDelete: SetNull)
  saturdayDayPlan DayPlan? @relation("WeekPlanSaturday", fields: [saturdayDayPlanId], references: [id], onDelete: SetNull)
  sundayDayPlan   DayPlan? @relation("WeekPlanSunday", fields: [sundayDayPlanId], references: [id], onDelete: SetNull)

  // Indexes
  @@unique([tenantId, code], map: "week_plans_tenant_id_code_key")
  @@index([tenantId], map: "idx_week_plans_tenant")
  @@map("week_plans")
}
```

#### 5. Update DayPlan Model with Reverse Relations for WeekPlan
**File**: `apps/web/prisma/schema.prisma`
**Changes**: Add reverse relation fields to the `DayPlan` model (after `bonuses` relation):

```prisma
  // Reverse relations for WeekPlan
  weekPlanMondays     WeekPlan[] @relation("WeekPlanMonday")
  weekPlanTuesdays    WeekPlan[] @relation("WeekPlanTuesday")
  weekPlanWednesdays  WeekPlan[] @relation("WeekPlanWednesday")
  weekPlanThursdays   WeekPlan[] @relation("WeekPlanThursday")
  weekPlanFridays     WeekPlan[] @relation("WeekPlanFriday")
  weekPlanSaturdays   WeekPlan[] @relation("WeekPlanSaturday")
  weekPlanSundays     WeekPlan[] @relation("WeekPlanSunday")
```

#### 6. Update Tenant Model Relations
**File**: `apps/web/prisma/schema.prisma`
**Changes**: Add relation fields to the `Tenant` model (in the relations section, after `calculationRules`):

```prisma
  dayPlans                  DayPlan[]
  weekPlans                 WeekPlan[]
```

#### 7. Update Account Model Relations
**File**: `apps/web/prisma/schema.prisma`
**Changes**: Add reverse relation fields to the `Account` model (after existing `calculationRules` relation):

```prisma
  dayPlanBonuses     DayPlanBonus[]
  dayPlanNetAccounts DayPlan[] @relation("DayPlanNetAccount")
  dayPlanCapAccounts DayPlan[] @relation("DayPlanCapAccount")
```

### Success Criteria:

#### Automated Verification:
- [x] Prisma schema validates: `cd apps/web && npx prisma validate`
- [x] Prisma client generates successfully: `cd apps/web && npx prisma generate`
- [x] Type checking passes: `cd apps/web && npx tsc --noEmit`

#### Manual Verification:
- [ ] Verify all four new models appear in the generated Prisma client types
- [ ] Verify Tenant model has two new relation fields
- [ ] Verify Account model has three new reverse relation fields

**Implementation Note**: After completing this phase and all automated verification passes, proceed directly to Phase 2. No manual testing needed for schema-only changes.

---

## Phase 2: tRPC dayPlans Router

### Overview
Implement the `dayPlans` tRPC router with full CRUD plus sub-entity operations (Breaks, Bonuses) and the Copy mutation. This is the most complex router in the codebase due to the ~46-field entity, sub-entity management, copy logic, reserved code checking, flextime normalization, and break/bonus validation.

### Changes Required:

#### 1. DayPlans Router
**File**: `apps/web/src/server/routers/dayPlans.ts` (new file)
**Pattern**: Follow `apps/web/src/server/routers/orders.ts` for structure, extended with sub-entity procedures.

**Permission**: `day_plans.manage` (via `permissionIdByKey("day_plans.manage")`)

**Imports**:
```typescript
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
```

**Enums as const arrays** (for Zod validation):
```typescript
const PLAN_TYPES = ["fixed", "flextime"] as const
const ROUNDING_TYPES = ["none", "up", "down", "nearest", "add", "subtract"] as const
const NO_BOOKING_BEHAVIORS = ["error", "deduct_target", "vocational_school", "adopt_target", "target_with_order"] as const
const DAY_CHANGE_BEHAVIORS = ["none", "at_arrival", "at_departure", "auto_complete"] as const
const BREAK_TYPES = ["fixed", "variable", "minimum"] as const
const CALCULATION_TYPES = ["fixed", "per_minute", "percentage"] as const
const RESERVED_CODES = ["U", "K", "S"]
```

**Output schemas**:

```typescript
const dayPlanBreakOutputSchema = z.object({
  id: z.string().uuid(),
  dayPlanId: z.string().uuid(),
  breakType: z.string(),
  startTime: z.number().nullable(),
  endTime: z.number().nullable(),
  duration: z.number(),
  afterWorkMinutes: z.number().nullable(),
  autoDeduct: z.boolean(),
  isPaid: z.boolean(),
  minutesDifference: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const dayPlanBonusOutputSchema = z.object({
  id: z.string().uuid(),
  dayPlanId: z.string().uuid(),
  accountId: z.string().uuid(),
  timeFrom: z.number(),
  timeTo: z.number(),
  calculationType: z.string(),
  valueMinutes: z.number(),
  minWorkMinutes: z.number().nullable(),
  appliesOnHoliday: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const dayPlanOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  planType: z.string(),
  comeFrom: z.number().nullable(),
  comeTo: z.number().nullable(),
  goFrom: z.number().nullable(),
  goTo: z.number().nullable(),
  coreStart: z.number().nullable(),
  coreEnd: z.number().nullable(),
  regularHours: z.number(),
  regularHours2: z.number().nullable(),
  fromEmployeeMaster: z.boolean(),
  toleranceComePlus: z.number(),
  toleranceComeMinus: z.number(),
  toleranceGoPlus: z.number(),
  toleranceGoMinus: z.number(),
  roundingComeType: z.string().nullable(),
  roundingComeInterval: z.number().nullable(),
  roundingGoType: z.string().nullable(),
  roundingGoInterval: z.number().nullable(),
  minWorkTime: z.number().nullable(),
  maxNetWorkTime: z.number().nullable(),
  variableWorkTime: z.boolean(),
  roundAllBookings: z.boolean(),
  roundingComeAddValue: z.number().nullable(),
  roundingGoAddValue: z.number().nullable(),
  holidayCreditCat1: z.number().nullable(),
  holidayCreditCat2: z.number().nullable(),
  holidayCreditCat3: z.number().nullable(),
  vacationDeduction: z.number(),
  noBookingBehavior: z.string(),
  dayChangeBehavior: z.string(),
  shiftDetectArriveFrom: z.number().nullable(),
  shiftDetectArriveTo: z.number().nullable(),
  shiftDetectDepartFrom: z.number().nullable(),
  shiftDetectDepartTo: z.number().nullable(),
  shiftAltPlan1: z.string().uuid().nullable(),
  shiftAltPlan2: z.string().uuid().nullable(),
  shiftAltPlan3: z.string().uuid().nullable(),
  shiftAltPlan4: z.string().uuid().nullable(),
  shiftAltPlan5: z.string().uuid().nullable(),
  shiftAltPlan6: z.string().uuid().nullable(),
  netAccountId: z.string().uuid().nullable(),
  capAccountId: z.string().uuid().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  breaks: z.array(dayPlanBreakOutputSchema).optional(),
  bonuses: z.array(dayPlanBonusOutputSchema).optional(),
})
```

**Note on `getById` output**: The `getById` procedure returns day plan with breaks and bonuses included. The `list` procedure returns day plans without sub-entities (no include). The output schema uses `.optional()` on `breaks` and `bonuses` to accommodate both cases. A separate `dayPlanDetailOutputSchema` could also be used, but `.optional()` is simpler and consistent with how the Go handler returns different shapes for list vs detail.

**Prisma include for detail views**:
```typescript
const dayPlanDetailInclude = {
  breaks: { orderBy: { sortOrder: "asc" as const } },
  bonuses: { orderBy: { sortOrder: "asc" as const } },
} as const
```

**Mapper function**:
Maps Prisma records to output shape. Must convert `vacationDeduction` from `Prisma.Decimal` to `number`. Handles optional `breaks` and `bonuses` arrays.

**Helper functions**:

1. `isReservedCode(code: string): boolean` -- case-insensitive check against `RESERVED_CODES`
2. `normalizeFlextimeFields(data: Record<string, unknown>, planType: string)` -- when planType is "flextime", sets `toleranceComePlus: 0`, `toleranceGoMinus: 0`, `variableWorkTime: false`
3. `validateBreak(breakType: string, startTime, endTime, duration, afterWorkMinutes)` -- validates break config per type (see research)
4. `validateBonus(timeFrom: number, timeTo: number, valueMinutes: number)` -- validates timeFrom < timeTo, valueMinutes > 0

**Procedures (12 total)**:

1. **`list`** (query): Optional input `{ isActive?: boolean, planType?: string }`. Query: `findMany({ where: { tenantId, ...filters }, orderBy: { code: "asc" } })`. No include (no breaks/bonuses in list). Returns `{ data: DayPlan[] }`.

2. **`getById`** (query): Input `{ id }`. Query: `findFirst({ where: { id, tenantId }, include: dayPlanDetailInclude })`. Returns day plan with breaks and bonuses. Throws `NOT_FOUND` if null.

3. **`create`** (mutation): Input includes all DayPlan fields. Validates:
   - Code required, trimmed, non-empty after trim
   - Code not reserved (case-insensitive check against U, K, S)
   - Name required, trimmed, non-empty after trim
   - `regularHours > 0`
   - Time range validations (if comeFrom and comeTo both set, comeFrom < comeTo; same for goFrom/goTo, coreStart/coreEnd)
   - Code uniqueness within tenant
   - Apply flextime normalization
   - Defaults: `planType: "fixed"`, `isActive: true`, `regularHours: 480`, all tolerance to 0

4. **`update`** (mutation): Partial update. Validates same rules where applicable. If code changes, check uniqueness (exclude self). If planType changes to flextime, normalize. Re-fetch with detail include for response.

5. **`delete`** (mutation): Verify existence + tenant. Check if any week plans reference this day plan via raw SQL: `SELECT COUNT(*)::int as count FROM week_plans WHERE monday_day_plan_id = $1 OR tuesday_day_plan_id = $1 OR wednesday_day_plan_id = $1 OR thursday_day_plan_id = $1 OR friday_day_plan_id = $1 OR saturday_day_plan_id = $1 OR sunday_day_plan_id = $1`. If count > 0, throw `BAD_REQUEST: "Cannot delete day plan that is referenced by week plans"`. Hard delete (breaks and bonuses cascade via FK).

6. **`copy`** (mutation): Input `{ id, newCode, newName }`. Validates newCode (required, trimmed, not reserved, unique). Validates newName (required, trimmed). Fetches original with detail include. Creates new DayPlan with all fields copied (except id, code, name, timestamps). Creates breaks and bonuses records for the copy (strip IDs, set new dayPlanId). Returns new day plan with detail include.

7. **`createBreak`** (mutation): Input `{ dayPlanId, breakType, startTime?, endTime?, duration, afterWorkMinutes?, autoDeduct?, isPaid?, minutesDifference?, sortOrder? }`. Verify parent day plan exists and belongs to tenant. Validate break config via `validateBreak`. Create break record. Return break.

8. **`deleteBreak`** (mutation): Input `{ dayPlanId, breakId }`. Verify parent day plan exists and belongs to tenant. Verify break exists and belongs to the day plan. Delete break. Return `{ success: true }`.

9. **`createBonus`** (mutation): Input `{ dayPlanId, accountId, timeFrom, timeTo, calculationType, valueMinutes, minWorkMinutes?, appliesOnHoliday?, sortOrder? }`. Verify parent day plan exists and belongs to tenant. Validate bonus via `validateBonus`. Create bonus record. Return bonus.

10. **`deleteBonus`** (mutation): Input `{ dayPlanId, bonusId }`. Verify parent day plan exists and belongs to tenant. Verify bonus exists and belongs to the day plan. Delete bonus. Return `{ success: true }`.

**Create input schema** (key fields):
```typescript
const createDayPlanInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  planType: z.enum(PLAN_TYPES).optional(),
  comeFrom: z.number().int().optional(),
  comeTo: z.number().int().optional(),
  goFrom: z.number().int().optional(),
  goTo: z.number().int().optional(),
  coreStart: z.number().int().optional(),
  coreEnd: z.number().int().optional(),
  regularHours: z.number().int().optional(),
  regularHours2: z.number().int().optional(),
  fromEmployeeMaster: z.boolean().optional(),
  toleranceComePlus: z.number().int().optional(),
  toleranceComeMinus: z.number().int().optional(),
  toleranceGoPlus: z.number().int().optional(),
  toleranceGoMinus: z.number().int().optional(),
  variableWorkTime: z.boolean().optional(),
  roundingComeType: z.enum(ROUNDING_TYPES).optional(),
  roundingComeInterval: z.number().int().optional(),
  roundingGoType: z.enum(ROUNDING_TYPES).optional(),
  roundingGoInterval: z.number().int().optional(),
  minWorkTime: z.number().int().optional(),
  maxNetWorkTime: z.number().int().optional(),
  roundAllBookings: z.boolean().optional(),
  roundingComeAddValue: z.number().int().optional(),
  roundingGoAddValue: z.number().int().optional(),
  holidayCreditCat1: z.number().int().optional(),
  holidayCreditCat2: z.number().int().optional(),
  holidayCreditCat3: z.number().int().optional(),
  vacationDeduction: z.number().optional(),
  noBookingBehavior: z.enum(NO_BOOKING_BEHAVIORS).optional(),
  dayChangeBehavior: z.enum(DAY_CHANGE_BEHAVIORS).optional(),
  shiftDetectArriveFrom: z.number().int().optional(),
  shiftDetectArriveTo: z.number().int().optional(),
  shiftDetectDepartFrom: z.number().int().optional(),
  shiftDetectDepartTo: z.number().int().optional(),
  shiftAltPlan1: z.string().uuid().optional(),
  shiftAltPlan2: z.string().uuid().optional(),
  shiftAltPlan3: z.string().uuid().optional(),
  shiftAltPlan4: z.string().uuid().optional(),
  shiftAltPlan5: z.string().uuid().optional(),
  shiftAltPlan6: z.string().uuid().optional(),
  netAccountId: z.string().uuid().optional(),
  capAccountId: z.string().uuid().optional(),
})
```

**Update input schema**: Same fields as create (all optional except `id`), plus `isActive: z.boolean().optional()`. Fields that can be set to null use `.nullable().optional()`.

**Copy input schema**:
```typescript
const copyDayPlanInputSchema = z.object({
  id: z.string().uuid(),
  newCode: z.string().min(1, "New code is required"),
  newName: z.string().min(1, "New name is required"),
})
```

**Break input schema**:
```typescript
const createBreakInputSchema = z.object({
  dayPlanId: z.string().uuid(),
  breakType: z.enum(BREAK_TYPES),
  startTime: z.number().int().optional(),
  endTime: z.number().int().optional(),
  duration: z.number().int().min(1, "Duration must be positive"),
  afterWorkMinutes: z.number().int().optional(),
  autoDeduct: z.boolean().optional(),
  isPaid: z.boolean().optional(),
  minutesDifference: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})
```

**Delete break input schema**:
```typescript
const deleteBreakInputSchema = z.object({
  dayPlanId: z.string().uuid(),
  breakId: z.string().uuid(),
})
```

**Bonus input schema**:
```typescript
const createBonusInputSchema = z.object({
  dayPlanId: z.string().uuid(),
  accountId: z.string().uuid(),
  timeFrom: z.number().int(),
  timeTo: z.number().int(),
  calculationType: z.enum(CALCULATION_TYPES),
  valueMinutes: z.number().int().min(1, "Value minutes must be positive"),
  minWorkMinutes: z.number().int().optional(),
  appliesOnHoliday: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})
```

**Delete bonus input schema**:
```typescript
const deleteBonusInputSchema = z.object({
  dayPlanId: z.string().uuid(),
  bonusId: z.string().uuid(),
})
```

#### 2. Register in Root Router
**File**: `apps/web/src/server/root.ts`
**Changes**: Add import and register:
```typescript
import { dayPlansRouter } from "./routers/dayPlans"
// in appRouter:
dayPlans: dayPlansRouter,
```

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `cd apps/web && npx tsc --noEmit`
- [x] Router file exists and compiles without errors

#### Manual Verification:
- [ ] Verify all 12 procedures are defined (list, getById, create, update, delete, copy, createBreak, deleteBreak, createBonus, deleteBonus)
- [ ] Verify reserved code check is case-insensitive
- [ ] Verify flextime normalization is applied in both create and update
- [ ] Verify break validation matches Go logic (fixed needs start/end, minimum needs afterWorkMinutes, all need duration > 0)

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 3.

---

## Phase 3: tRPC weekPlans Router

### Overview
Implement the `weekPlans` tRPC router with CRUD operations. WeekPlans reference DayPlans via 7 nullable FK columns. Cross-entity validation ensures all referenced DayPlans exist and belong to the same tenant, and that all 7 days have plans assigned (ZMI Section 11.2).

### Changes Required:

#### 1. WeekPlans Router
**File**: `apps/web/src/server/routers/weekPlans.ts` (new file)
**Pattern**: Follow `apps/web/src/server/routers/orders.ts` for structure, with cross-entity validation.

**Permission**: `week_plans.manage` (via `permissionIdByKey("week_plans.manage")`)

**Output schema**:
```typescript
const dayPlanSummarySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  planType: z.string(),
}).nullable()

const weekPlanOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  mondayDayPlanId: z.string().uuid().nullable(),
  tuesdayDayPlanId: z.string().uuid().nullable(),
  wednesdayDayPlanId: z.string().uuid().nullable(),
  thursdayDayPlanId: z.string().uuid().nullable(),
  fridayDayPlanId: z.string().uuid().nullable(),
  saturdayDayPlanId: z.string().uuid().nullable(),
  sundayDayPlanId: z.string().uuid().nullable(),
  mondayDayPlan: dayPlanSummarySchema,
  tuesdayDayPlan: dayPlanSummarySchema,
  wednesdayDayPlan: dayPlanSummarySchema,
  thursdayDayPlan: dayPlanSummarySchema,
  fridayDayPlan: dayPlanSummarySchema,
  saturdayDayPlan: dayPlanSummarySchema,
  sundayDayPlan: dayPlanSummarySchema,
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
```

**Prisma include for day plan preloads**:
```typescript
const dayPlanSelect = {
  select: { id: true, code: true, name: true, planType: true },
} as const

const weekPlanInclude = {
  mondayDayPlan: dayPlanSelect,
  tuesdayDayPlan: dayPlanSelect,
  wednesdayDayPlan: dayPlanSelect,
  thursdayDayPlan: dayPlanSelect,
  fridayDayPlan: dayPlanSelect,
  saturdayDayPlan: dayPlanSelect,
  sundayDayPlan: dayPlanSelect,
} as const
```

**Helper function** -- `validateDayPlanIds`:
```typescript
async function validateDayPlanIds(
  prisma: TRPCContext["prisma"],
  tenantId: string,
  ids: (string | null | undefined)[]
): Promise<void> {
  for (const id of ids) {
    if (id) {
      const plan = await prisma.dayPlan.findFirst({
        where: { id, tenantId },
      })
      if (!plan) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid day plan reference",
        })
      }
    }
  }
}
```

**Procedures (5 total)**:

1. **`list`** (query): Optional input `{ isActive?: boolean }`. Query: `findMany({ where: { tenantId }, orderBy: { code: "asc" }, include: weekPlanInclude })`. Returns `{ data: WeekPlan[] }`.

2. **`getById`** (query): Input `{ id }`. Query: `findFirst({ where: { id, tenantId }, include: weekPlanInclude })`. Throws `NOT_FOUND` if null.

3. **`create`** (mutation): Input includes code, name, description, 7 day plan IDs. Validates:
   - Code required, trimmed, non-empty
   - Name required, trimmed, non-empty
   - Code uniqueness within tenant
   - All 7 day plan IDs must be provided (non-null) -- ZMI Section 11.2
   - Each day plan ID must reference an existing DayPlan in the same tenant
   - Defaults: `isActive: true`
   - Re-fetch with include for response

4. **`update`** (mutation): Partial update. If code changes, check uniqueness. If any day plan IDs are provided, validate them. After update, verify completeness (all 7 days must still have plans -- check the final state by reading the updated record). Re-fetch with include for response.

5. **`delete`** (mutation): Verify existence + tenant. Hard delete.

**Create input schema**:
```typescript
const createWeekPlanInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  mondayDayPlanId: z.string().uuid(),
  tuesdayDayPlanId: z.string().uuid(),
  wednesdayDayPlanId: z.string().uuid(),
  thursdayDayPlanId: z.string().uuid(),
  fridayDayPlanId: z.string().uuid(),
  saturdayDayPlanId: z.string().uuid(),
  sundayDayPlanId: z.string().uuid(),
})
```

**Update input schema**:
```typescript
const updateWeekPlanInputSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  mondayDayPlanId: z.string().uuid().nullable().optional(),
  tuesdayDayPlanId: z.string().uuid().nullable().optional(),
  wednesdayDayPlanId: z.string().uuid().nullable().optional(),
  thursdayDayPlanId: z.string().uuid().nullable().optional(),
  fridayDayPlanId: z.string().uuid().nullable().optional(),
  saturdayDayPlanId: z.string().uuid().nullable().optional(),
  sundayDayPlanId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
})
```

**Completeness check in update**:
After updating, re-fetch the record and verify all 7 day plan IDs are non-null. If any are null after the update, throw `BAD_REQUEST: "Week plan must have a day plan assigned for all 7 days"`.

#### 2. Register in Root Router
**File**: `apps/web/src/server/root.ts`
**Changes**: Add import and register:
```typescript
import { weekPlansRouter } from "./routers/weekPlans"
// in appRouter:
weekPlans: weekPlansRouter,
```

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `cd apps/web && npx tsc --noEmit`
- [x] Router file exists and compiles without errors

#### Manual Verification:
- [ ] Verify all 5 procedures are defined (list, getById, create, update, delete)
- [ ] Verify day plan validation requires all 7 days in create
- [ ] Verify completeness check in update prevents nulling out day plan IDs
- [ ] Verify cross-entity validation checks tenant ownership of referenced day plans

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 4.

---

## Phase 4: Frontend Hooks Migration

### Overview
Migrate two existing frontend hooks from the old `useApiQuery`/`useApiMutation` pattern to tRPC. The hook function names remain the same to avoid breaking existing component imports.

### Changes Required:

#### 1. Migrate `use-day-plans.ts`
**File**: `apps/web/src/hooks/api/use-day-plans.ts`
**Changes**: Replace `useApiQuery`/`useApiMutation` with tRPC hooks. All 10 exported hooks migrated.

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useDayPlans(options: {
  active?: boolean
  planType?: string
  enabled?: boolean
} = {}) {
  const { active, planType, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.dayPlans.list.queryOptions(
      { isActive: active, planType },
      { enabled }
    )
  )
}

export function useDayPlan(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.dayPlans.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useCreateDayPlan() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.dayPlans.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.list.queryKey(),
      })
    },
  })
}

export function useUpdateDayPlan() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.dayPlans.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.list.queryKey(),
      })
    },
  })
}

export function useDeleteDayPlan() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.dayPlans.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.list.queryKey(),
      })
    },
  })
}

export function useCopyDayPlan() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.dayPlans.copy.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.list.queryKey(),
      })
    },
  })
}

export function useCreateDayPlanBreak() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.dayPlans.createBreak.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.list.queryKey(),
      })
    },
  })
}

export function useDeleteDayPlanBreak() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.dayPlans.deleteBreak.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.list.queryKey(),
      })
    },
  })
}

export function useCreateDayPlanBonus() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.dayPlans.createBonus.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.list.queryKey(),
      })
    },
  })
}

export function useDeleteDayPlanBonus() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.dayPlans.deleteBonus.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.dayPlans.list.queryKey(),
      })
    },
  })
}
```

#### 2. Migrate `use-week-plans.ts`
**File**: `apps/web/src/hooks/api/use-week-plans.ts`
**Changes**: Replace `useApiQuery`/`useApiMutation` with tRPC hooks. All 5 exported hooks migrated.

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useWeekPlans(options: {
  active?: boolean
  enabled?: boolean
} = {}) {
  const { active, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.weekPlans.list.queryOptions(
      { isActive: active },
      { enabled }
    )
  )
}

export function useWeekPlan(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.weekPlans.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useCreateWeekPlan() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.weekPlans.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.weekPlans.list.queryKey(),
      })
    },
  })
}

export function useUpdateWeekPlan() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.weekPlans.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.weekPlans.list.queryKey(),
      })
    },
  })
}

export function useDeleteWeekPlan() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.weekPlans.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.weekPlans.list.queryKey(),
      })
    },
  })
}
```

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `cd apps/web && npx tsc --noEmit`
- [x] All hook files compile without import errors

#### Manual Verification:
- [ ] Exported hook names remain identical to preserve existing component imports
- [ ] `use-day-plans.ts` exports all 10 hooks
- [ ] `use-week-plans.ts` exports all 5 hooks

**Implementation Note**: After completing this phase, proceed to Phase 5.

---

## Phase 5: Tests

### Overview
Write comprehensive unit tests for both routers following the established pattern from `apps/web/src/server/__tests__/orders-router.test.ts`. The dayPlans tests are the most extensive due to sub-entity and copy operations.

### Changes Required:

#### 1. DayPlans Router Tests
**File**: `apps/web/src/server/__tests__/dayPlans-router.test.ts` (new file)

**Structure**: Import `createCallerFactory` from `../trpc`, `dayPlansRouter` from `../routers/dayPlans`, helpers from `./helpers`.

**Factory functions**:
- `makeDayPlan(overrides)` -- returns a mock DayPlan with all ~46 fields, sensible defaults, optional breaks/bonuses arrays
- `makeBreak(overrides)` -- returns a mock DayPlanBreak
- `makeBonus(overrides)` -- returns a mock DayPlanBonus
- `createTestContext(prisma)` -- wraps mock Prisma with `day_plans.manage` permission

**Test cases**:

**`dayPlans.list`**:
- Returns day plans for tenant; orders by code ASC
- Filters by isActive
- Filters by planType
- Returns empty array

**`dayPlans.getById`**:
- Returns day plan with breaks and bonuses
- Throws NOT_FOUND for missing day plan

**`dayPlans.create`**:
- Creates day plan with defaults (planType "fixed", regularHours 480, isActive true)
- Trims whitespace on code, name, description
- Rejects empty code
- Rejects empty name
- Rejects reserved code "U" (case-insensitive)
- Rejects reserved code "k" (lowercase)
- Rejects duplicate code (CONFLICT)
- Validates regularHours > 0
- Applies flextime normalization when planType is "flextime"
- Handles vacationDeduction as Decimal

**`dayPlans.update`**:
- Updates partial fields successfully
- Rejects empty code, empty name
- Rejects duplicate code
- Allows same code (no false conflict)
- Throws NOT_FOUND for missing day plan
- Applies flextime normalization on planType change
- Can set nullable fields to null

**`dayPlans.delete`**:
- Deletes day plan successfully
- Throws NOT_FOUND for missing day plan
- Rejects deletion when referenced by week plans

**`dayPlans.copy`**:
- Copies day plan with breaks and bonuses
- Trims and validates newCode, newName
- Rejects reserved newCode
- Rejects duplicate newCode
- Throws NOT_FOUND for missing source day plan

**`dayPlans.createBreak`**:
- Creates fixed break with start/end time
- Creates variable break (no time requirements)
- Creates minimum break with afterWorkMinutes
- Validates duration > 0
- Validates fixed break requires startTime and endTime
- Validates fixed break startTime < endTime
- Validates minimum break requires afterWorkMinutes
- Throws NOT_FOUND when parent day plan missing

**`dayPlans.deleteBreak`**:
- Deletes break successfully
- Throws NOT_FOUND when break missing
- Throws NOT_FOUND when parent day plan missing

**`dayPlans.createBonus`**:
- Creates bonus successfully
- Validates timeFrom < timeTo
- Validates valueMinutes > 0
- Throws NOT_FOUND when parent day plan missing

**`dayPlans.deleteBonus`**:
- Deletes bonus successfully
- Throws NOT_FOUND when bonus missing
- Throws NOT_FOUND when parent day plan missing

**Special mock patterns**:
- For `copy`: Mock `dayPlan.findFirst` (returns original with breaks/bonuses), `dayPlan.create` (returns copy), `dayPlanBreak.create` (for each break), `dayPlanBonus.create` (for each bonus), `dayPlan.findUniqueOrThrow` (returns copy with breaks/bonuses for response)
- For `delete` with week plan check: Mock `$queryRawUnsafe` to return `[{ count: 0 }]` for success or `[{ count: 1 }]` for rejection
- For `createBreak`/`deleteBreak`: Mock `dayPlan.findFirst` (parent verification) and `dayPlanBreak.create`/`dayPlanBreak.delete`
- For `createBonus`/`deleteBonus`: Mock `dayPlan.findFirst` (parent verification) and `dayPlanBonus.create`/`dayPlanBonus.delete`

#### 2. WeekPlans Router Tests
**File**: `apps/web/src/server/__tests__/weekPlans-router.test.ts` (new file)

**Factory functions**:
- `makeWeekPlan(overrides)` -- returns a mock WeekPlan with all 7 day plan summaries
- `makeDayPlanSummary(overrides)` -- returns `{ id, code, name, planType }`
- `createTestContext(prisma)` -- wraps mock Prisma with `week_plans.manage` permission

**Test cases**:

**`weekPlans.list`**:
- Returns week plans with day plan summaries
- Filters by isActive
- Returns empty array

**`weekPlans.getById`**:
- Returns week plan with 7 day plan relations
- Throws NOT_FOUND for missing week plan

**`weekPlans.create`**:
- Creates week plan with all 7 day plans
- Trims whitespace on code, name
- Rejects empty code, empty name
- Rejects duplicate code (CONFLICT)
- Validates all 7 day plan IDs reference existing day plans in same tenant
- Rejects when a referenced day plan does not exist (BAD_REQUEST)

**`weekPlans.update`**:
- Updates partial fields successfully
- Rejects duplicate code
- Allows same code
- Throws NOT_FOUND for missing week plan
- Verifies completeness after update (all 7 days must still have plans)
- Validates day plan IDs when changed

**`weekPlans.delete`**:
- Deletes week plan successfully
- Throws NOT_FOUND for missing week plan

**Special mock patterns**:
- For `create` and `update` with day plan validation: Mock `dayPlan.findFirst` to return a valid DayPlan for each of the 7 day plan IDs
- For completeness check in update: Mock the re-fetch after update to verify all 7 day plan IDs are non-null

### Success Criteria:

#### Automated Verification:
- [x] All new tests pass: `cd apps/web && npx vitest run src/server/__tests__/dayPlans-router.test.ts src/server/__tests__/weekPlans-router.test.ts`
- [x] All existing tests still pass: `cd apps/web && npx vitest run src/server/__tests__/`
- [x] Type checking passes: `cd apps/web && npx tsc --noEmit`

#### Manual Verification:
- [ ] Tests cover all 12 dayPlan procedures and all 5 weekPlan procedures
- [ ] Edge cases for reserved codes, flextime normalization, break validation, bonus validation, copy, and week plan completeness are all tested

**Implementation Note**: This is the final phase. After all verification passes, the ticket is complete.

---

## Testing Strategy

### Unit Tests:
- Both routers tested individually using `createCallerFactory` with mocked Prisma
- Each test file follows the `orders-router.test.ts` pattern
- Mock Prisma methods: `findMany`, `findFirst`, `findUniqueOrThrow`, `create`, `update`, `delete`, `$queryRawUnsafe` (for week plan reference check in delete)
- Test all CRUD operations + error cases (NOT_FOUND, BAD_REQUEST, CONFLICT)
- Test business logic: reserved codes, flextime normalization, break validation, bonus validation, copy with sub-entities, week plan completeness, cross-entity day plan validation

### Key Edge Cases:
- DayPlan: reserved codes (U, K, S case-insensitive); flextime normalization zeros tolerance fields; copy duplicates all breaks and bonuses; delete checks week plan references
- DayPlanBreak: fixed breaks need start/end, minimum breaks need afterWorkMinutes, all need duration > 0
- DayPlanBonus: timeFrom < timeTo, valueMinutes > 0
- WeekPlan: all 7 day plans required (create and update); each day plan must exist in same tenant; update must preserve completeness
- All entities: whitespace trimming; empty code/name rejection; code uniqueness checks

## Performance Considerations

- DayPlan list does NOT include breaks/bonuses (no relation preload). Only `getById` includes sub-entities. This keeps list queries fast even with many day plans.
- WeekPlan list always includes 7 day plan relations (select id, code, name, planType only -- minimal data). This matches Go behavior.
- Copy operation creates multiple records (1 day plan + N breaks + M bonuses). For typical day plans with 2-3 breaks and 0-2 bonuses, this is fast. No Prisma transaction needed since the operation is idempotent on failure (new code uniqueness prevents partial re-runs from creating duplicates).
- Week plan day plan validation makes up to 7 `findFirst` calls. These are indexed by primary key and are fast. Could be optimized with a single `findMany({ where: { id: { in: [...] }, tenantId } })` if performance becomes a concern, but 7 individual lookups is adequate for this admin operation.

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-217-dayplans-weekplans.md`
- Research document: `thoughts/shared/research/2026-03-06-ZMI-TICKET-217-dayplans-weekplans.md`
- Reference tRPC router (simple CRUD): `apps/web/src/server/routers/activities.ts`
- Reference tRPC router (with relations): `apps/web/src/server/routers/orders.ts`
- Reference tRPC router (with Decimal handling): `apps/web/src/server/routers/calculationRules.ts`
- Reference test pattern: `apps/web/src/server/__tests__/orders-router.test.ts`
- Reference migrated hook: `apps/web/src/hooks/api/use-activities.ts`
- Previous plan (same pattern): `thoughts/shared/plans/2026-03-06-ZMI-TICKET-216-bookingtypes-reasons-groups.md`
- Permission catalog: `apps/web/src/server/lib/permission-catalog.ts:100-101`
- Go models: `apps/api/internal/model/dayplan.go` (267 lines), `apps/api/internal/model/weekplan.go` (90 lines)
- Go services: `apps/api/internal/service/dayplan.go` (685 lines), `apps/api/internal/service/weekplan.go` (257 lines)
- Go handlers: `apps/api/internal/handler/dayplan.go` (559 lines), `apps/api/internal/handler/weekplan.go` (243 lines)
- SQL migrations: `db/migrations/000015`, `000016`, `000017`, `000018`, `000030`, `000079`
