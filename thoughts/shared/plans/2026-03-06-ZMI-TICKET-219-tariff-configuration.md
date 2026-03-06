# Implementation Plan: ZMI-TICKET-219 -- Tariff Configuration

**Date:** 2026-03-06
**Ticket:** ZMI-TICKET-219
**Complexity:** High (757-line Go service, 4 DB tables, sub-entities, rhythm logic)
**Estimated Phases:** 4

---

## Overview

Implement a tRPC `tariffs` router replacing the Go backend tariff endpoints. This involves:
1. Adding 4 Prisma models (Tariff, TariffBreak, TariffWeekPlan, TariffDayPlan) and updating 2 existing models (Employee, EmployeeTariffAssignment)
2. Creating a tRPC router with CRUD + sub-entity (breaks) + rhythm management
3. Migrating frontend hooks from REST to tRPC
4. Writing comprehensive tests

The Tariff entity is notably complex due to:
- Three rhythm types (`weekly`, `rolling_weekly`, `x_days`) each requiring different sub-entity management
- Vacation, flextime, and target hours configuration
- Break sub-entities within each tariff
- FK validation for WeekPlan, DayPlan references
- Delete protection when tariff is assigned to employees

---

## Phase 1: Prisma Schema Changes

### 1.1 Add Tariff Model

**File:** `/home/tolga/projects/terp/apps/web/prisma/schema.prisma`
**Location:** After the WeekPlan model (after line 1303, end of file)

Add the `Tariff` model mapping to the existing `tariffs` table. All columns are derived from migrations 000019, 000029, 000031, and 000051:

```prisma
// -----------------------------------------------------------------------------
// Tariff
// -----------------------------------------------------------------------------
// Migrations: 000019, 000029, 000031, 000051
//
// CHECK constraints (enforced at DB level only):
//   - chk_vacation_basis: vacation_basis IN ('calendar_year', 'entry_date')
//   - chk_credit_type: credit_type IN ('no_evaluation', 'complete', 'after_threshold', 'no_carryover')
//   - chk_work_days_per_week: work_days_per_week IS NULL OR (work_days_per_week >= 1 AND work_days_per_week <= 7)
//   - chk_rhythm_type: rhythm_type IN ('weekly', 'rolling_weekly', 'x_days')
//   - chk_cycle_days: cycle_days IS NULL OR (cycle_days >= 1 AND cycle_days <= 365)
//
// Trigger: update_updated_at_column() auto-sets updated_at on UPDATE
model Tariff {
  id                         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId                   String    @map("tenant_id") @db.Uuid
  code                       String    @db.VarChar(20)
  name                       String    @db.VarChar(255)
  description                String?   @db.Text
  weekPlanId                 String?   @map("week_plan_id") @db.Uuid
  validFrom                  DateTime? @map("valid_from") @db.Date
  validTo                    DateTime? @map("valid_to") @db.Date
  isActive                   Boolean   @default(true) @map("is_active")

  // Vacation fields (migration 000029)
  annualVacationDays         Decimal?  @map("annual_vacation_days") @db.Decimal(5, 2)
  workDaysPerWeek            Int?      @default(5) @map("work_days_per_week")
  vacationBasis              String?   @default("calendar_year") @map("vacation_basis") @db.VarChar(20)

  // Target hours fields (migration 000029)
  dailyTargetHours           Decimal?  @map("daily_target_hours") @db.Decimal(5, 2)
  weeklyTargetHours          Decimal?  @map("weekly_target_hours") @db.Decimal(5, 2)
  monthlyTargetHours         Decimal?  @map("monthly_target_hours") @db.Decimal(6, 2)
  annualTargetHours          Decimal?  @map("annual_target_hours") @db.Decimal(7, 2)

  // Flextime fields (migration 000029)
  maxFlextimePerMonth        Int?      @map("max_flextime_per_month")
  upperLimitAnnual           Int?      @map("upper_limit_annual")
  lowerLimitAnnual           Int?      @map("lower_limit_annual")
  flextimeThreshold          Int?      @map("flextime_threshold")
  creditType                 String?   @default("no_evaluation") @map("credit_type") @db.VarChar(20)

  // Rhythm fields (migration 000031)
  rhythmType                 String?   @default("weekly") @map("rhythm_type") @db.VarChar(20)
  cycleDays                  Int?      @map("cycle_days")
  rhythmStartDate            DateTime? @map("rhythm_start_date") @db.Date

  // Vacation capping (migration 000051)
  vacationCappingRuleGroupId String?   @map("vacation_capping_rule_group_id") @db.Uuid

  createdAt                  DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt                  DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant          Tenant              @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  weekPlan        WeekPlan?           @relation(fields: [weekPlanId], references: [id], onDelete: SetNull)
  breaks          TariffBreak[]
  tariffWeekPlans TariffWeekPlan[]
  tariffDayPlans  TariffDayPlan[]
  employees       Employee[]
  tariffAssignments EmployeeTariffAssignment[]

  // Indexes
  @@unique([tenantId, code], map: "tariffs_tenant_id_code_key")
  @@index([tenantId], map: "idx_tariffs_tenant")
  @@index([weekPlanId], map: "idx_tariffs_week_plan")
  @@index([vacationCappingRuleGroupId], map: "idx_tariffs_vacation_capping_rule_group")
  @@map("tariffs")
}
```

### 1.2 Add TariffBreak Model

```prisma
// -----------------------------------------------------------------------------
// TariffBreak
// -----------------------------------------------------------------------------
// Migration: 000020
model TariffBreak {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tariffId         String   @map("tariff_id") @db.Uuid
  breakType        String   @map("break_type") @db.VarChar(20)
  afterWorkMinutes Int?     @map("after_work_minutes")
  duration         Int
  isPaid           Boolean  @default(false) @map("is_paid")
  sortOrder        Int      @default(0) @map("sort_order")
  createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tariff Tariff @relation(fields: [tariffId], references: [id], onDelete: Cascade)

  // Indexes
  @@index([tariffId], map: "idx_tariff_breaks_tariff")
  @@map("tariff_breaks")
}
```

### 1.3 Add TariffWeekPlan Model

```prisma
// -----------------------------------------------------------------------------
// TariffWeekPlan
// -----------------------------------------------------------------------------
// Migration: 000031
// Used for rolling_weekly rhythm -- ordered list of week plans that rotate
model TariffWeekPlan {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tariffId      String   @map("tariff_id") @db.Uuid
  weekPlanId    String   @map("week_plan_id") @db.Uuid
  sequenceOrder Int      @map("sequence_order")
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  // Relations
  tariff   Tariff   @relation(fields: [tariffId], references: [id], onDelete: Cascade)
  weekPlan WeekPlan @relation(fields: [weekPlanId], references: [id], onDelete: Cascade)

  // Unique constraints (from migration)
  @@unique([tariffId, sequenceOrder])
  @@unique([tariffId, weekPlanId])
  @@index([tariffId], map: "idx_tariff_week_plans_tariff")
  @@map("tariff_week_plans")
}
```

### 1.4 Add TariffDayPlan Model

```prisma
// -----------------------------------------------------------------------------
// TariffDayPlan
// -----------------------------------------------------------------------------
// Migration: 000031
// Used for x_days rhythm -- day plan per position in cycle
model TariffDayPlan {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tariffId    String   @map("tariff_id") @db.Uuid
  dayPosition Int      @map("day_position")
  dayPlanId   String?  @map("day_plan_id") @db.Uuid
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  // Relations
  tariff  Tariff   @relation(fields: [tariffId], references: [id], onDelete: Cascade)
  dayPlan DayPlan? @relation(fields: [dayPlanId], references: [id], onDelete: SetNull)

  // Unique constraints (from migration)
  @@unique([tariffId, dayPosition])
  @@index([tariffId], map: "idx_tariff_day_plans_tariff")
  @@map("tariff_day_plans")
}
```

### 1.5 Update Employee Model

**File:** `/home/tolga/projects/terp/apps/web/prisma/schema.prisma`
**Location:** Employee model (line 487-579)

**Changes:**
1. Replace the comment block at lines 558-559 with an actual relation:
   ```prisma
   tariff Tariff? @relation(fields: [tariffId], references: [id], onDelete: SetNull)
   ```
2. Remove the comment: `// Note: tariffId FK references tariffs(id) ON DELETE SET NULL.`
3. Remove the comment: `// Tariff model not yet in Prisma. Relation will be added when it is.`

### 1.6 Update EmployeeTariffAssignment Model

**File:** `/home/tolga/projects/terp/apps/web/prisma/schema.prisma`
**Location:** EmployeeTariffAssignment model (line 658-684)

**Changes:**
1. Replace the comment block at lines 674-675 with an actual relation:
   ```prisma
   tariff Tariff @relation(fields: [tariffId], references: [id], onDelete: Cascade)
   ```
2. Remove the comment: `// Note: tariffId FK references tariffs(id) ON DELETE CASCADE.`
3. Remove the comment: `// Tariff model not yet in Prisma. Relation will be added when it is.`

### 1.7 Add Back-References on WeekPlan Model

**File:** `/home/tolga/projects/terp/apps/web/prisma/schema.prisma`
**Location:** WeekPlan model (line 1272-1303)

Add reverse relations before the `@@` directives:
```prisma
  // Reverse relations for tariffs
  tariffs         Tariff[]           // Direct week plan FK on tariff
  tariffWeekPlans TariffWeekPlan[]   // Rolling weekly rhythm assignments
```

### 1.8 Add Back-Reference on DayPlan Model

**File:** `/home/tolga/projects/terp/apps/web/prisma/schema.prisma`
**Location:** DayPlan model (around line 1186, after `bonuses` relation)

Add reverse relation:
```prisma
  tariffDayPlans TariffDayPlan[]
```

### 1.9 Add Back-Reference on Tenant Model

**File:** `/home/tolga/projects/terp/apps/web/prisma/schema.prisma`
**Location:** Tenant model (look for reverse relations section)

Add:
```prisma
  tariffs Tariff[]
```

### Phase 1 Verification

```bash
cd /home/tolga/projects/terp/apps/web && npx prisma validate
cd /home/tolga/projects/terp/apps/web && npx prisma generate
```

- `prisma validate` must pass with no errors
- `prisma generate` must succeed, generating the TypeScript client with Tariff, TariffBreak, TariffWeekPlan, TariffDayPlan types
- Verify the generated client exports the new types

---

## Phase 2: tRPC Router Implementation

### 2.1 Create Router File

**File:** `/home/tolga/projects/terp/apps/web/src/server/routers/tariffs.ts`

Follow the established pattern from:
- `absenceTypes.ts` (CRUD + usage check on delete)
- `dayPlans.ts` (sub-entity management: createBreak, deleteBreak)
- `weekPlans.ts` (FK validation for day plans)

### 2.2 Router Structure

```
tariffs.list        - List tariffs (with optional isActive filter)
tariffs.getById     - Get tariff with all relations (breaks, tariffWeekPlans, tariffDayPlans)
tariffs.create      - Create tariff with full validation + rhythm sub-records
tariffs.update      - Partial update with nullable field clearing + rhythm sub-record updates
tariffs.delete      - Delete with EmployeeTariffAssignment usage check
tariffs.createBreak - Add break to tariff (sub-entity)
tariffs.deleteBreak - Remove break from tariff (sub-entity)
```

### 2.3 Detailed Implementation

#### Permission Constant

```typescript
const TARIFFS_MANAGE = permissionIdByKey("tariffs.manage")!
```

This permission exists at line 102 of `/home/tolga/projects/terp/apps/web/src/server/lib/permission-catalog.ts`.

#### Enum Constants

```typescript
const RHYTHM_TYPES = ["weekly", "rolling_weekly", "x_days"] as const
const VACATION_BASES = ["calendar_year", "entry_date"] as const
const CREDIT_TYPES = ["no_evaluation", "complete_carryover", "after_threshold", "no_carryover"] as const
const BREAK_TYPES = ["fixed", "variable", "minimum"] as const
```

Note: `credit_type` uses `complete_carryover` (post migration 000032), not `complete`.

#### Output Schemas

**tariffBreakOutputSchema:**
- id (uuid), tariffId (uuid), breakType (string), afterWorkMinutes (number, nullable), duration (number), isPaid (boolean), sortOrder (number), createdAt (date), updatedAt (date)

**tariffWeekPlanOutputSchema:**
- id (uuid), tariffId (uuid), weekPlanId (uuid), sequenceOrder (number), createdAt (date)
- Include nested weekPlan summary: { id, code, name }

**tariffDayPlanOutputSchema:**
- id (uuid), tariffId (uuid), dayPosition (number), dayPlanId (uuid, nullable), createdAt (date)
- Include nested dayPlan summary: { id, code, name, planType } (nullable when dayPlanId is null)

**tariffOutputSchema:**
- All tariff fields from Prisma model
- weekPlan summary: { id, code, name } (nullable)
- breaks: array of tariffBreakOutputSchema (optional, included in getById)
- tariffWeekPlans: array of tariffWeekPlanOutputSchema (optional, included in getById)
- tariffDayPlans: array of tariffDayPlanOutputSchema (optional, included in getById)

#### Input Schemas

**createTariffInputSchema:**
- code: z.string().min(1).max(20) -- REQUIRED (present in DB, Go model, missing from ticket input)
- name: z.string().min(1).max(255) -- REQUIRED
- description: z.string().optional()
- weekPlanId: z.string().uuid().optional() -- for weekly rhythm
- validFrom: z.string().date().optional() (ISO date string, converted to Date)
- validTo: z.string().date().optional()
- isActive: z.boolean().optional().default(true)
- Vacation: annualVacationDays (number), workDaysPerWeek (int, 1-7), vacationBasis (enum), vacationCappingRuleGroupId (uuid) -- all optional
- Target hours: dailyTargetHours, weeklyTargetHours, monthlyTargetHours, annualTargetHours (number) -- all optional
- Flextime: maxFlextimePerMonth, upperLimitAnnual, lowerLimitAnnual, flextimeThreshold (int), creditType (enum) -- all optional
- Rhythm: rhythmType (enum, default "weekly"), cycleDays (int, 1-365), rhythmStartDate (date string)
- weekPlanIds: z.array(z.string().uuid()).optional() -- for rolling_weekly
- dayPlans: z.array(z.object({ dayPosition: z.number().int(), dayPlanId: z.string().uuid().nullable() })).optional() -- for x_days

**updateTariffInputSchema:**
- id: z.string().uuid() -- REQUIRED
- All fields from create, but `.nullable().optional()` for clearable fields
- Non-clearable fields use `.optional()` only
- Code is NOT updatable (immutable after creation, matching Go behavior)

**createBreakInputSchema:**
- tariffId: z.string().uuid()
- breakType: z.enum(BREAK_TYPES)
- afterWorkMinutes: z.number().int().optional()
- duration: z.number().int().min(1, "Duration must be positive")
- isPaid: z.boolean().optional()

**deleteBreakInputSchema:**
- tariffId: z.string().uuid()
- breakId: z.string().uuid()

#### Prisma Include Objects

```typescript
const tariffListInclude = {
  weekPlan: { select: { id: true, code: true, name: true } },
} as const

const tariffDetailInclude = {
  weekPlan: { select: { id: true, code: true, name: true } },
  breaks: { orderBy: { sortOrder: "asc" as const } },
  tariffWeekPlans: {
    orderBy: { sequenceOrder: "asc" as const },
    include: { weekPlan: { select: { id: true, code: true, name: true } } },
  },
  tariffDayPlans: {
    orderBy: { dayPosition: "asc" as const },
    include: { dayPlan: { select: { id: true, code: true, name: true, planType: true } } },
  },
} as const
```

#### Procedure: `tariffs.list`

1. Uses `tenantProcedure` + `requirePermission(TARIFFS_MANAGE)`
2. Input: `{ isActive?: boolean }` (optional)
3. Query: `prisma.tariff.findMany({ where: { tenantId, ...(isActive filter) }, include: tariffListInclude, orderBy: { code: "asc" } })`
4. Output: `{ data: Tariff[] }` with weekPlan summary

#### Procedure: `tariffs.getById`

1. Uses `tenantProcedure` + `requirePermission(TARIFFS_MANAGE)`
2. Input: `{ id: uuid }`
3. Query: `prisma.tariff.findFirst({ where: { id, tenantId }, include: tariffDetailInclude })`
4. Throw NOT_FOUND if not found
5. Output: Full tariff with breaks, tariffWeekPlans (with weekPlan summary), tariffDayPlans (with dayPlan summary)

#### Procedure: `tariffs.create`

Port the Go service `Create` method (lines 126-303 of `apps/api/internal/service/tariff.go`):

1. Trim + validate code (required, non-empty after trim)
2. Trim + validate name (required, non-empty after trim)
3. Check code uniqueness: `prisma.tariff.findFirst({ where: { tenantId, code } })` -- throw CONFLICT if exists
4. Default rhythmType to "weekly" if not provided
5. Validate rhythmType is one of 3 valid values
6. **Rhythm-specific validation:**
   - `weekly`: If weekPlanId provided, validate it exists in same tenant via `prisma.weekPlan.findFirst({ where: { id, tenantId } })`
   - `rolling_weekly`: Require weekPlanIds (non-empty array), require rhythmStartDate, validate all week plan IDs exist in same tenant
   - `x_days`: Require cycleDays (1-365), require rhythmStartDate, validate all dayPlans positions are within 1..cycleDays, validate non-null dayPlanIds exist in same tenant
7. Validate vacationBasis, creditType, workDaysPerWeek if provided
8. Create tariff record via `prisma.tariff.create()`
9. Create rhythm sub-records:
   - `rolling_weekly`: Create TariffWeekPlan records with sequenceOrder (1-based)
   - `x_days`: Create TariffDayPlan records with dayPosition
   - Use `prisma.$transaction()` for atomicity
10. Return tariff with full details via separate query with `tariffDetailInclude`

#### Procedure: `tariffs.update`

Port the Go service `Update` method (lines 374-580 of `apps/api/internal/service/tariff.go`):

1. Verify tariff exists (tenant-scoped) -- throw NOT_FOUND
2. Build partial update data object
3. Handle name: trim + validate non-empty
4. Handle nullable fields: `null` value = clear, `undefined` = no change, value = set
   - This replaces the Go `Clear*` flag pattern. In tRPC, `input.field === null` means clear, `input.field === undefined` means unchanged.
5. Validate weekPlanId FK if being set
6. Validate rhythmType if being changed
7. Handle rhythm-specific validation (same as create)
8. Validate vacationBasis, creditType, workDaysPerWeek
9. Update tariff via `prisma.tariff.update()`
10. Update rhythm sub-records:
    - If rhythmType changed, clean up old sub-records:
      - Switching away from rolling_weekly: delete all TariffWeekPlans
      - Switching away from x_days: delete all TariffDayPlans
    - If weekPlanIds provided for rolling_weekly: delete all existing TariffWeekPlans, create new ones
    - If dayPlans provided for x_days: delete all existing TariffDayPlans, create new ones
    - Use `prisma.$transaction()` for atomicity
11. Return tariff with full details

#### Procedure: `tariffs.delete`

Port the Go service `Delete` method, enhanced with assignment check (ticket requirement):

1. Verify tariff exists (tenant-scoped) -- throw NOT_FOUND
2. **Check usage in EmployeeTariffAssignment:**
   ```typescript
   const assignmentCount = await ctx.prisma.employeeTariffAssignment.count({
     where: { tariffId: input.id },
   })
   if (assignmentCount > 0) {
     throw new TRPCError({
       code: "BAD_REQUEST",
       message: "Cannot delete tariff that is assigned to employees",
     })
   }
   ```
3. Also check direct employee tariffId references:
   ```typescript
   const employeeCount = await ctx.prisma.employee.count({
     where: { tariffId: input.id },
   })
   if (employeeCount > 0) {
     throw new TRPCError({
       code: "BAD_REQUEST",
       message: "Cannot delete tariff that is assigned to employees",
     })
   }
   ```
4. Hard delete tariff (cascades to breaks, tariffWeekPlans, tariffDayPlans via DB FK)
5. Return `{ success: true }`

#### Procedure: `tariffs.createBreak`

Port the Go service `CreateBreak` method (lines 610-660):

1. Verify parent tariff exists (tenant-scoped) -- throw NOT_FOUND
2. Validate breakType is one of "fixed", "variable", "minimum"
3. Validate duration > 0
4. Auto-calculate sortOrder: count existing breaks + 1
   ```typescript
   const breakCount = await ctx.prisma.tariffBreak.count({ where: { tariffId: input.tariffId } })
   ```
5. Create break via `prisma.tariffBreak.create()`
6. Return the created break

#### Procedure: `tariffs.deleteBreak`

Port the Go service `DeleteBreak` method (lines 662-700):

1. Verify parent tariff exists (tenant-scoped) -- throw NOT_FOUND
2. Verify break exists AND belongs to the tariff:
   ```typescript
   const brk = await ctx.prisma.tariffBreak.findFirst({
     where: { id: input.breakId, tariffId: input.tariffId },
   })
   ```
3. Throw NOT_FOUND if break not found
4. Hard delete break
5. Return `{ success: true }`

### 2.4 Register Router

**File:** `/home/tolga/projects/terp/apps/web/src/server/root.ts`

Add import and register the router:
```typescript
import { tariffsRouter } from "./routers/tariffs"

// In appRouter:
tariffs: tariffsRouter,
```

### Phase 2 Verification

```bash
cd /home/tolga/projects/terp/apps/web && npx tsc --noEmit
```

- TypeScript compilation must pass with no errors
- Router must export `tariffsRouter`
- All Prisma queries must use correctly typed fields from the generated client

---

## Phase 3: Frontend Hooks Migration

### 3.1 Rewrite use-tariffs.ts

**File:** `/home/tolga/projects/terp/apps/web/src/hooks/api/use-tariffs.ts`

Replace the REST-based hooks with tRPC-based hooks, following the pattern from:
- `/home/tolga/projects/terp/apps/web/src/hooks/api/use-absence-types.ts`

**Hooks to implement:**

```typescript
// Query hooks
useTariffs({ isActive?, enabled? })        -> trpc.tariffs.list.queryOptions()
useTariff(id, enabled)                      -> trpc.tariffs.getById.queryOptions()

// Mutation hooks (all invalidate tariffs.list on success)
useCreateTariff()                           -> trpc.tariffs.create.mutationOptions()
useUpdateTariff()                           -> trpc.tariffs.update.mutationOptions()
useDeleteTariff()                           -> trpc.tariffs.delete.mutationOptions()
useCreateTariffBreak()                      -> trpc.tariffs.createBreak.mutationOptions()
useDeleteTariffBreak()                      -> trpc.tariffs.deleteBreak.mutationOptions()
```

**Key pattern (from use-absence-types.ts):**

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useTariffs(options: { isActive?: boolean; enabled?: boolean } = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.tariffs.list.queryOptions(
      Object.keys(input).length > 0 ? input : undefined,
      { enabled }
    )
  )
}

export function useCreateTariff() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.tariffs.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.tariffs.list.queryKey(),
      })
    },
  })
}
```

### Phase 3 Verification

```bash
cd /home/tolga/projects/terp/apps/web && npx tsc --noEmit
```

- TypeScript compilation must pass
- All 7 hooks must be exported
- No remaining references to `useApiQuery` or `useApiMutation` in the file
- Grep for any frontend files importing from `use-tariffs.ts` to verify they still work:
  ```bash
  grep -r "use-tariffs" apps/web/src/ --include="*.ts" --include="*.tsx"
  ```

---

## Phase 4: Test Implementation

### 4.1 Create Test File

**File:** `/home/tolga/projects/terp/apps/web/src/server/__tests__/tariffs-router.test.ts`

Follow the established test pattern from:
- `/home/tolga/projects/terp/apps/web/src/server/__tests__/absenceTypes-router.test.ts`

### 4.2 Test Structure

**Constants:**
```typescript
const TARIFFS_MANAGE = permissionIdByKey("tariffs.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const TARIFF_ID = "a0000000-0000-4000-a000-000000000700"
const WEEK_PLAN_ID = "a0000000-0000-4000-a000-000000000701"
const DAY_PLAN_ID = "a0000000-0000-4000-a000-000000000702"
const BREAK_ID = "a0000000-0000-4000-a000-000000000703"
```

**Helper: `makeTariff(overrides)`** -- Returns a mock tariff object with all fields populated with defaults.

**Helper: `makeTariffBreak(overrides)`** -- Returns a mock break object.

**Helper: `createTestContext(prisma)`** -- Creates mock context with TARIFFS_MANAGE permission.

### 4.3 Test Cases (ported from Go test file, 25+ tests)

**tariffs.list:**
1. Returns all tariffs for tenant, ordered by code
2. Filters by isActive when provided
3. Returns empty array when no tariffs exist

**tariffs.getById:**
1. Returns tariff with breaks and rhythm data (full detail)
2. Throws NOT_FOUND for non-existent tariff
3. Does not return tariff from different tenant

**tariffs.create:**
1. Creates tariff with required fields only (code + name)
2. Creates tariff with week plan (weekly rhythm)
3. Creates tariff with description
4. Creates tariff with validity dates
5. Creates tariff with vacation configuration
6. Creates tariff with target hours
7. Creates tariff with flextime configuration
8. Throws BAD_REQUEST for empty code
9. Throws BAD_REQUEST for empty name
10. Throws CONFLICT for duplicate code within tenant
11. Throws BAD_REQUEST for invalid week plan reference
12. Creates tariff with rolling_weekly rhythm + week plan IDs
13. Creates tariff with x_days rhythm + day plans
14. Throws BAD_REQUEST when rolling_weekly missing start date
15. Throws BAD_REQUEST when x_days missing cycle_days

**tariffs.update:**
1. Updates name successfully
2. Updates description (set and clear via null)
3. Adds week plan reference
4. Clears week plan reference (null)
5. Throws NOT_FOUND for non-existent tariff
6. Throws BAD_REQUEST for empty name

**tariffs.delete:**
1. Deletes tariff successfully
2. Throws NOT_FOUND for non-existent tariff
3. Throws BAD_REQUEST when tariff has employee assignments
4. Throws BAD_REQUEST when tariff is referenced by employees directly

**tariffs.createBreak:**
1. Creates break with all fields
2. Auto-calculates sortOrder
3. Throws NOT_FOUND when tariff not found
4. Throws BAD_REQUEST for zero duration (via schema validation)

**tariffs.deleteBreak:**
1. Deletes break successfully
2. Throws NOT_FOUND when tariff not found
3. Throws NOT_FOUND when break not found
4. Throws NOT_FOUND when break belongs to different tariff

### 4.4 Mock Prisma Setup

Each test creates a mock prisma object with the needed methods:

```typescript
const mockPrisma = {
  tariff: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  tariffBreak: {
    findFirst: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  tariffWeekPlan: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  tariffDayPlan: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  weekPlan: {
    findFirst: vi.fn(),
  },
  dayPlan: {
    findFirst: vi.fn(),
  },
  employeeTariffAssignment: {
    count: vi.fn(),
  },
  employee: {
    count: vi.fn(),
  },
  $transaction: vi.fn(),
}
```

### Phase 4 Verification

```bash
cd /home/tolga/projects/terp/apps/web && npx vitest run src/server/__tests__/tariffs-router.test.ts
```

- All tests must pass
- Minimum 25 test cases covering CRUD, sub-entities, validation, and rhythm logic
- Also run all existing tests to ensure no regressions:
  ```bash
  cd /home/tolga/projects/terp/apps/web && npx vitest run src/server/__tests__/
  ```

---

## File Summary

### Files to CREATE:
1. `/home/tolga/projects/terp/apps/web/src/server/routers/tariffs.ts` -- tRPC router (~500-700 lines)
2. `/home/tolga/projects/terp/apps/web/src/server/__tests__/tariffs-router.test.ts` -- Tests (~600-800 lines)

### Files to MODIFY:
1. `/home/tolga/projects/terp/apps/web/prisma/schema.prisma` -- Add 4 models, update 4 existing models
2. `/home/tolga/projects/terp/apps/web/src/server/root.ts` -- Register tariffs router (add import + entry)
3. `/home/tolga/projects/terp/apps/web/src/hooks/api/use-tariffs.ts` -- Rewrite from REST to tRPC hooks

### Files for REFERENCE only (not modified):
- `/home/tolga/projects/terp/apps/api/internal/service/tariff.go` -- Go service (source of business logic)
- `/home/tolga/projects/terp/apps/api/internal/model/tariff.go` -- Go model (source of field definitions)
- `/home/tolga/projects/terp/apps/api/internal/service/tariff_test.go` -- Go tests (source of test cases)
- `/home/tolga/projects/terp/apps/web/src/server/routers/absenceTypes.ts` -- Pattern: CRUD with usage check
- `/home/tolga/projects/terp/apps/web/src/server/routers/dayPlans.ts` -- Pattern: sub-entity management
- `/home/tolga/projects/terp/apps/web/src/server/routers/weekPlans.ts` -- Pattern: FK validation
- `/home/tolga/projects/terp/apps/web/src/hooks/api/use-absence-types.ts` -- Pattern: tRPC hooks
- `/home/tolga/projects/terp/db/migrations/000019_create_tariffs.up.sql` -- Migration reference
- `/home/tolga/projects/terp/db/migrations/000020_create_tariff_breaks.up.sql` -- Migration reference
- `/home/tolga/projects/terp/db/migrations/000029_add_tariff_zmi_fields.up.sql` -- Migration reference
- `/home/tolga/projects/terp/db/migrations/000031_add_tariff_rhythm_fields.up.sql` -- Migration reference
- `/home/tolga/projects/terp/db/migrations/000051_create_vacation_capping_rule_groups.up.sql` -- Migration reference

---

## Key Design Decisions

1. **DB-first Prisma models:** The Prisma models are mapped to existing DB tables from migrations. No new Prisma migration is needed -- just `prisma generate` to update the TypeScript client.

2. **credit_type values:** Use `complete_carryover` (not `complete`) to match the Go model post migration 000032. The DB CHECK constraint still allows `complete` but the canonical value is `complete_carryover`.

3. **Code field included:** The ticket's create input omits `code`, but it is required per the DB schema (NOT NULL, UNIQUE with tenant_id) and Go model. It must be included.

4. **Break schema matches Go/DB, not ticket:** The ticket suggests `start_time`/`end_time`/`duration_minutes`/`is_paid` for breaks. The actual DB schema (migration 000020) uses `break_type`/`after_work_minutes`/`duration`/`is_paid`/`sort_order`. We follow the DB schema.

5. **VacationCappingRuleGroup FK:** Stored as a string UUID FK without a full Prisma relation, since the VacationCappingRuleGroup model is not yet in Prisma. The FK column is modeled as `vacationCappingRuleGroupId String?` without a `@relation`.

6. **Nullable field clearing in update:** tRPC/Zod uses `.nullable().optional()` pattern. `undefined` = field not being updated, `null` = clear the field. This replaces the Go `Clear*` boolean flags.

7. **Delete checks both tables:** Unlike Go (which does no assignment check), the tRPC router checks both `EmployeeTariffAssignment` and `Employee.tariffId` before allowing deletion, as specified in the ticket.

8. **Transaction for rhythm sub-records:** When creating/updating rhythm sub-records (TariffWeekPlans, TariffDayPlans), use `prisma.$transaction()` to ensure atomicity of delete-all + create-new operations.
