# tRPC Routers: Holidays, Cost Centers, Employment Types, Locations - Implementation Plan

## Overview

Implement four tRPC routers for master data entities (Holidays, Cost Centers, Employment Types, Locations) by porting business logic from the Go backend into TypeScript tRPC procedures. This includes CRUD operations for all four entities, plus holiday-specific Generate and Copy functionality. Frontend hooks will be migrated from the old `useApiQuery`/`useApiMutation` pattern to the tRPC pattern.

## Current State Analysis

- **Prisma models**: All four models exist in `apps/web/prisma/schema.prisma` (Holiday line 271, CostCenter line 177, Location line 204, EmploymentType line 238).
- **Go business logic**: Complete services exist for all four entities in `apps/api/internal/service/`.
- **Permission catalog**: `holidays.manage` (line 112) and `locations.manage` (line 207) exist in `apps/web/src/server/lib/permission-catalog.ts`. `cost_centers.manage` and `employment_types.manage` do **not** exist and must be added.
- **tRPC infrastructure**: Fully operational with `tenantProcedure`, `requirePermission`, and `createCallerFactory` in `apps/web/src/server/trpc.ts`.
- **Root router**: 8 routers currently registered in `apps/web/src/server/root.ts` -- 4 new ones to add.
- **Frontend hooks**: Currently use old `useApiQuery`/`useApiMutation` pattern in `apps/web/src/hooks/api/use-{holidays,cost-centers,employment-types,locations}.ts`.
- **Existing router patterns**: Departments (`apps/web/src/server/routers/departments.ts`, 542 lines) and Teams (`apps/web/src/server/routers/teams.ts`, 763 lines) serve as direct templates.

### Key Discoveries:
- Go cost center and employment type handlers have **no permission middleware** (`apps/api/internal/handler/routes.go` lines 108-115 and 119-126), but we should add permissions for consistency with the tRPC pattern.
- The Go permission catalog also lacks `cost_centers.manage` and `employment_types.manage` -- these permissions are genuinely new.
- EmploymentType has a **nullable `tenantId`** (`String?` in Prisma), unlike the other three models. The router should scope queries to `tenantId` via `tenantProcedure` but also handle this gracefully.
- EmploymentType has **no unique constraint** on `[tenantId, code]` in Prisma schema -- code uniqueness must be enforced via queries (same approach as Go).
- Holiday has a `holidayCategory` integer (1-3) and `departmentId` (bare UUID, no FK).
- Holiday `Generate` requires porting the Easter algorithm and German state holiday definitions from `apps/api/internal/holiday/calendar.go` (167 lines).
- Holiday `Copy` requires porting year-to-year copy logic from `apps/api/internal/service/holiday.go` (lines 208-286).
- Holiday recalc trigger logic is **out of scope** per ticket (TICKET-234 handles holiday references in daily calculation).
- EmploymentType has `weeklyHoursDefault` as `Decimal(5,2)` in Prisma, which maps to the Prisma `Decimal` type. The tRPC schema should accept a number and convert appropriately.

## Desired End State

After completing this plan:
1. Four new tRPC routers (`holidays`, `costCenters`, `employmentTypes`, `locations`) are registered in the root router.
2. All CRUD operations work through tRPC, matching Go business logic behavior.
3. Holiday Generate produces correct German state holidays for any year/state combination.
4. Holiday Copy copies holidays between years with category override support.
5. Two new permissions (`cost_centers.manage`, `employment_types.manage`) are in the catalog.
6. Frontend hooks use tRPC instead of REST.
7. All routers have comprehensive test coverage.
8. `make lint` and existing tests pass.

**Verification**: Run `cd apps/web && npx vitest run src/server/__tests__/` to verify all router tests pass. Run `cd apps/web && npx tsc --noEmit` to verify type checking. The four new routers should be callable via the tRPC client.

## What We're NOT Doing

- **Holiday recalc triggers**: The Go service triggers `TriggerRecalcAll` and `RecalculateFromMonthBatch` after holiday mutations. This is deferred to TICKET-234.
- **Holiday Upsert / dev seed**: `UpsertDevHoliday` is a dev-only helper and not part of this router.
- **UI changes**: Frontend page components remain unchanged; only the hook layer is migrated.
- **Go endpoint removal**: The Go REST endpoints stay in place during the migration period.
- **EmploymentType global (null-tenant) records**: The tRPC router will only manage tenant-scoped employment types. Null-tenant records are a legacy concern.
- **Database schema changes**: No Prisma migrations needed; all models already exist.

## Implementation Approach

Follow the established pattern from the departments/teams tRPC migration (ZMI-TICKET-211). Build all four routers in order of complexity: Cost Centers (simplest), Employment Types, Locations, then Holidays (most complex due to Generate/Copy). Each phase produces working, tested code.

The holiday calendar generation algorithm will be ported as a pure TypeScript module in `apps/web/src/server/lib/holiday-calendar.ts`, following the Go implementation in `apps/api/internal/holiday/calendar.go`.

---

## Phase 1: Permission Catalog + Cost Centers Router

### Overview
Add the two missing permissions to the catalog, then implement the simplest CRUD router (Cost Centers) as the baseline.

### Changes Required:

#### 1. Permission Catalog Updates
**File**: `apps/web/src/server/lib/permission-catalog.ts`
**Changes**: Add `cost_centers.manage` and `employment_types.manage` permissions.

Insert after `locations.manage` (line 207):
```typescript
p("cost_centers.manage", "cost_centers", "manage", "Manage cost centers"),
p("employment_types.manage", "employment_types", "manage", "Manage employment types"),
```

Update the JSDoc comment at line 43 to reflect the new permission count (46 -> 48).

#### 2. Cost Centers Router
**File**: `apps/web/src/server/routers/costCenters.ts` (new file)
**Changes**: Full CRUD router following the departments pattern.

**Procedures:**
- `costCenters.list` (query) -- returns `{ data: CostCenter[] }` filtered by optional `isActive`. Orders by `code ASC`.
- `costCenters.getById` (query) -- returns single CostCenter or throws `NOT_FOUND`.
- `costCenters.create` (mutation) -- validates code/name non-empty after trim, checks code uniqueness per tenant, sets `isActive: true` default.
- `costCenters.update` (mutation) -- partial update for code, name, description, isActive. Checks code uniqueness if changed.
- `costCenters.delete` (mutation) -- checks for assigned employees before deletion, returns `{ success: boolean }`.

**Output schema:**
```typescript
const costCenterOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
```

**Permission**: `cost_centers.manage` for all procedures.

**Key validation logic** (from `apps/api/internal/service/costcenter.go`):
- Create: trim code/name, reject empty, check code uniqueness via `findFirst({ where: { tenantId, code } })`
- Update: partial update, trim code/name if provided, reject empty, check code uniqueness if changed via `findFirst({ where: { tenantId, code, NOT: { id } } })`
- Delete: check `employee.count({ where: { costCenterId: id } })` before deletion

#### 3. Root Router Registration
**File**: `apps/web/src/server/root.ts`
**Changes**: Import and register `costCentersRouter`.

```typescript
import { costCentersRouter } from "./routers/costCenters"
// ...
costCenters: costCentersRouter,
```

#### 4. Cost Centers Test File
**File**: `apps/web/src/server/__tests__/cost-centers-router.test.ts` (new file)
**Changes**: Tests following the departments test pattern.

**Test cases:**
- `costCenters.list`: returns data, filters by isActive, returns empty array
- `costCenters.getById`: found, NOT_FOUND
- `costCenters.create`: success, trims whitespace, rejects empty code/name, rejects duplicate code (CONFLICT), sets isActive true
- `costCenters.update`: success, rejects empty code/name, rejects duplicate code, allows same code, NOT_FOUND
- `costCenters.delete`: success, NOT_FOUND, rejects when employees assigned

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `cd apps/web && npx tsc --noEmit`
- [ ] Cost centers router tests pass: `cd apps/web && npx vitest run src/server/__tests__/cost-centers-router.test.ts`
- [ ] Existing tests still pass: `cd apps/web && npx vitest run src/server/__tests__/departments-router.test.ts`
- [ ] Linting passes: `cd apps/web && npx eslint src/server/routers/costCenters.ts`

#### Manual Verification:
- [ ] Permission catalog has exactly 48 permissions
- [ ] Cost center CRUD works via tRPC playground/client

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Employment Types Router

### Overview
Implement the Employment Types router, which is similar to Cost Centers but with additional fields (`weeklyHoursDefault`, `vacationCalcGroupId`) and a nullable `tenantId`.

### Changes Required:

#### 1. Employment Types Router
**File**: `apps/web/src/server/routers/employmentTypes.ts` (new file)
**Changes**: Full CRUD router.

**Procedures:**
- `employmentTypes.list` (query) -- returns `{ data: EmploymentType[] }` filtered by optional `isActive`. Orders by `code ASC`. Scoped to `tenantId`.
- `employmentTypes.getById` (query) -- returns single record. Scoped to `tenantId`.
- `employmentTypes.create` (mutation) -- validates code/name, checks code uniqueness within tenant, includes `weeklyHoursDefault` (default 40.00) and optional `vacationCalcGroupId`.
- `employmentTypes.update` (mutation) -- partial update for all fields. `clearVacationCalcGroupId` boolean flag to explicitly null out the field (matching Go pattern from `apps/api/internal/service/employmenttype.go` line 109).
- `employmentTypes.delete` (mutation) -- checks for assigned employees before deletion.

**Output schema:**
```typescript
const employmentTypeOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  code: z.string(),
  name: z.string(),
  weeklyHoursDefault: z.number(),  // Prisma Decimal -> number
  isActive: z.boolean(),
  vacationCalcGroupId: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
```

**Special handling:**
- `tenantId` is nullable in Prisma but `tenantProcedure` provides a non-null `ctx.tenantId`. For queries: filter by `tenantId: ctx.tenantId`. For creates: set `tenantId: ctx.tenantId`.
- `weeklyHoursDefault` is `Decimal(5,2)` in Prisma. The mapper function should convert via `Number(record.weeklyHoursDefault)` for output. Input should accept `z.number()` and convert via `new Prisma.Decimal(input.weeklyHoursDefault)` for storage.
- Code uniqueness: enforce via `findFirst({ where: { tenantId, code } })` since there's no `@@unique` constraint in Prisma (matching Go logic at `apps/api/internal/service/employmenttype.go` lines 62-66).

**Permission**: `employment_types.manage` for all procedures.

#### 2. Root Router Registration
**File**: `apps/web/src/server/root.ts`
**Changes**: Import and register `employmentTypesRouter`.

#### 3. Employment Types Test File
**File**: `apps/web/src/server/__tests__/employment-types-router.test.ts` (new file)

**Test cases:**
- Same CRUD test categories as cost centers
- Additional: `weeklyHoursDefault` stored correctly (Decimal handling)
- Additional: `clearVacationCalcGroupId` nulls the field
- Additional: `vacationCalcGroupId` set and retrieved
- Additional: rejects when employees assigned (delete)

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `cd apps/web && npx tsc --noEmit`
- [ ] Employment types router tests pass: `cd apps/web && npx vitest run src/server/__tests__/employment-types-router.test.ts`
- [ ] All previous tests still pass: `cd apps/web && npx vitest run src/server/__tests__/`
- [ ] Linting passes: `cd apps/web && npx eslint src/server/routers/employmentTypes.ts`

#### Manual Verification:
- [ ] Employment type CRUD works via tRPC client
- [ ] Decimal values (weeklyHoursDefault) round-trip correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Locations Router

### Overview
Implement the Locations router, which has more fields than Cost Centers (address, city, country, timezone) but straightforward CRUD logic.

### Changes Required:

#### 1. Locations Router
**File**: `apps/web/src/server/routers/locations.ts` (new file)
**Changes**: Full CRUD router.

**Procedures:**
- `locations.list` (query) -- returns `{ data: Location[] }` filtered by optional `isActive`. Orders by `code ASC`.
- `locations.getById` (query) -- returns single record or `NOT_FOUND`.
- `locations.create` (mutation) -- validates code/name non-empty after trim. Creates with `isActive: true`. Includes address, city, country, timezone (all strings, default empty).
- `locations.update` (mutation) -- partial update for all fields including address fields. Code uniqueness check if changed.
- `locations.delete` (mutation) -- returns `{ success: boolean }`.

**Output schema:**
```typescript
const locationOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  address: z.string(),
  city: z.string(),
  country: z.string(),
  timezone: z.string(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
```

**Key validation logic** (from `apps/api/internal/service/location.go`):
- Create: code/name required. Address fields default to empty string. Sets `isActive: true`.
- Update: partial update. Code uniqueness check if code changed.
- Delete: Prisma handles the `@@unique([tenantId, code])` constraint; code conflict errors should be caught and returned as `CONFLICT`.

**Permission**: `locations.manage` (already exists in catalog).

#### 2. Root Router Registration
**File**: `apps/web/src/server/root.ts`
**Changes**: Import and register `locationsRouter`.

#### 3. Locations Test File
**File**: `apps/web/src/server/__tests__/locations-router.test.ts` (new file)

**Test cases:**
- Standard CRUD test categories
- Additional: address fields stored and returned correctly
- Additional: default empty strings for address fields on create
- Additional: code uniqueness within tenant

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `cd apps/web && npx tsc --noEmit`
- [ ] Locations router tests pass: `cd apps/web && npx vitest run src/server/__tests__/locations-router.test.ts`
- [ ] All previous tests still pass: `cd apps/web && npx vitest run src/server/__tests__/`
- [ ] Linting passes: `cd apps/web && npx eslint src/server/routers/locations.ts`

#### Manual Verification:
- [ ] Location CRUD works via tRPC client
- [ ] All address fields persist correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Holiday Calendar Library

### Overview
Port the German state holiday generation algorithm from Go to TypeScript as a standalone library module, with its own unit tests. This is a prerequisite for the holidays router.

### Changes Required:

#### 1. Holiday Calendar Module
**File**: `apps/web/src/server/lib/holiday-calendar.ts` (new file)
**Changes**: Port `apps/api/internal/holiday/calendar.go` (167 lines) to TypeScript.

**Exports:**
```typescript
// German federal state codes
export type GermanState = "BW" | "BY" | "BE" | "BB" | "HB" | "HH" | "HE" | "MV" | "NI" | "NW" | "RP" | "SL" | "SN" | "ST" | "SH" | "TH"

export const GERMAN_STATES: GermanState[] = [...]

export interface HolidayDefinition {
  date: Date    // UTC midnight
  name: string
}

// Validate and parse state code (case-insensitive)
export function parseState(code: string): GermanState

// Generate holidays for a given year and state
export function generateHolidays(year: number, state: GermanState): HolidayDefinition[]

// Easter Sunday calculation (anonymous Gregorian algorithm)
export function easterSunday(year: number): Date
```

**Algorithm details** (from `apps/api/internal/holiday/calendar.go`):
- `easterSunday(year)`: Port the Gauss/Meeus algorithm (lines 140-156). Uses modular arithmetic with variables a through m.
- `repentanceDay(year)`: Step back from Nov 22 to find previous Wednesday (lines 158-166).
- `generateHolidays(year, state)`: 9 nationwide holidays + state-specific holidays (lines 55-137). Sort by date.

#### 2. Holiday Calendar Tests
**File**: `apps/web/src/server/__tests__/holiday-calendar.test.ts` (new file)

**Test cases:**
- `easterSunday`: known dates (2024: Mar 31, 2025: Apr 20, 2026: Apr 5, 2027: Mar 28)
- `generateHolidays` for Bayern (BY): 13 holidays (9 nationwide + Heilige Drei Koenige + Fronleichnam + Mariae Himmelfahrt + Allerheiligen)
- `generateHolidays` for Berlin (BE): 11 holidays (9 nationwide + Internationaler Frauentag + no Reformationstag)
- `generateHolidays` for Sachsen (SN): 12 holidays (9 nationwide + Reformationstag + Buss- und Bettag)
- `generateHolidays` for Brandenburg (BB): 12 holidays (9 nationwide + Ostersonntag + Pfingstsonntag + Reformationstag)
- `parseState`: valid codes (case-insensitive), rejects invalid codes
- Year validation: rejects years < 1900 or > 2200
- Sorting: results sorted by date ascending
- `repentanceDay`: correct Wednesday before Nov 23 for various years

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `cd apps/web && npx tsc --noEmit`
- [ ] Holiday calendar tests pass: `cd apps/web && npx vitest run src/server/__tests__/holiday-calendar.test.ts`
- [ ] Easter dates match known reference values
- [ ] Bayern 2026 generates exactly 13 holidays
- [ ] Linting passes: `cd apps/web && npx eslint src/server/lib/holiday-calendar.ts`

#### Manual Verification:
- [ ] Compare generated holiday lists against reference (Go output or official sources) for 2-3 states/years

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Holidays Router

### Overview
Implement the full holidays router with CRUD operations plus Generate and Copy procedures.

### Changes Required:

#### 1. Holidays Router
**File**: `apps/web/src/server/routers/holidays.ts` (new file)
**Changes**: Full CRUD + Generate + Copy router. This is the most complex router.

**Procedures:**

**`holidays.list` (query):**
- Input: `{ year?: number, from?: string, to?: string, departmentId?: string }`
- Output: `{ data: Holiday[] }`
- Logic: If `year` provided, filter `holidayDate` within that year. If `from`/`to` provided, filter by date range. Optional `departmentId` filter.
- Orders by `holidayDate ASC`.

**`holidays.getById` (query):**
- Input: `{ id: string }`
- Output: single Holiday or `NOT_FOUND`

**`holidays.create` (mutation):**
- Input: `{ holidayDate: string, name: string, holidayCategory: number, appliesToAll?: boolean, departmentId?: string }`
- Validation: date non-zero (must parse), name non-empty after trim, category 1-3, date uniqueness per tenant
- Output: Holiday

**`holidays.update` (mutation):**
- Input: `{ id: string, holidayDate?: string, name?: string, holidayCategory?: number, appliesToAll?: boolean, departmentId?: string | null }`
- Validation: if name provided, non-empty after trim; if category provided, 1-3; if date changed, check uniqueness
- Output: Holiday

**`holidays.delete` (mutation):**
- Input: `{ id: string }`
- Output: `{ success: boolean }`

**`holidays.generate` (mutation):**
- Input: `{ year: number, state: string, skipExisting?: boolean }`
- Validation: year 1900-2200, state valid German state
- Logic (from `apps/api/internal/service/holiday.go` lines 152-205):
  1. Call `generateHolidays(year, parseState(state))` from the calendar library
  2. Load existing holidays for the year: `findMany({ where: { tenantId, holidayDate: { gte: Jan 1, lt: Jan 1 next year } } })`
  3. Build `existingByDate` set (keyed by ISO date string)
  4. For each definition: if `skipExisting` and date exists, skip. Otherwise create with `category: 1`, `appliesToAll: true`.
- Output: `{ created: Holiday[] }`

**`holidays.copy` (mutation):**
- Input: `{ sourceYear: number, targetYear: number, categoryOverrides?: Array<{ month: number, day: number, category: number }>, skipExisting?: boolean }`
- Validation: years 1900-2200, sourceYear !== targetYear, override categories 1-3
- Logic (from `apps/api/internal/service/holiday.go` lines 208-286):
  1. Build category override map keyed by `"MM-DD"`
  2. Load source year holidays
  3. Reject if source is empty (no holidays found)
  4. Load target year existing holidays, build `existingByDate` set
  5. For each source holiday: adjust year via `dateWithYear()` (skip invalid dates like Feb 29 in non-leap year), apply category override, skip if exists and `skipExisting`
  6. Preserve: name, appliesToAll, departmentId from source
- Output: `{ copied: Holiday[] }`

**Helper functions to port:**
- `dateWithYear(year, date)`: Create new date with different year, return null for invalid dates (from `apps/api/internal/service/holiday.go` lines 425-433)
- `normalizeDate(d)`: Strip time, keep date at midnight UTC

**Output schema:**
```typescript
const holidayOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  holidayDate: z.date(),
  name: z.string(),
  holidayCategory: z.number().int().min(1).max(3),
  appliesToAll: z.boolean(),
  departmentId: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
```

**Permission**: `holidays.manage` (already exists in catalog) for all procedures.

#### 2. Root Router Registration
**File**: `apps/web/src/server/root.ts`
**Changes**: Import and register `holidaysRouter`.

#### 3. Holidays Router Test File
**File**: `apps/web/src/server/__tests__/holidays-router.test.ts` (new file)

**Test cases:**
- `holidays.list`: returns data, filters by year, filters by date range, returns empty
- `holidays.getById`: found, NOT_FOUND
- `holidays.create`: success, trim name, reject empty name, reject invalid category (0, 4), reject duplicate date (CONFLICT), sets defaults
- `holidays.update`: success, partial update, reject empty name, reject invalid category, NOT_FOUND
- `holidays.delete`: success, NOT_FOUND
- `holidays.generate`: generates holidays for BY 2026 (13 holidays), skips existing when flag set, rejects invalid year, rejects invalid state
- `holidays.copy`: copies holidays, applies category overrides, skips Feb 29 in non-leap year, skips existing when flag set, rejects same year, rejects empty source year

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `cd apps/web && npx tsc --noEmit`
- [ ] Holidays router tests pass: `cd apps/web && npx vitest run src/server/__tests__/holidays-router.test.ts`
- [ ] All previous tests still pass: `cd apps/web && npx vitest run src/server/__tests__/`
- [ ] Linting passes: `cd apps/web && npx eslint src/server/routers/holidays.ts`

#### Manual Verification:
- [ ] Holiday CRUD, Generate, and Copy work via tRPC client
- [ ] Generated holidays match Go output for the same year/state
- [ ] Copy correctly handles year transitions

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 6: Frontend Hook Migration

### Overview
Migrate all four frontend hook files from the old `useApiQuery`/`useApiMutation` pattern to the tRPC pattern, following the established pattern in `apps/web/src/hooks/api/use-departments.ts`.

### Changes Required:

#### 1. Cost Centers Hooks
**File**: `apps/web/src/hooks/api/use-cost-centers.ts` (rewrite)
**Changes**: Replace old pattern with tRPC pattern.

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useCostCenters(options: { enabled?: boolean; isActive?: boolean } = {}) {
  const { enabled = true, isActive } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.costCenters.list.queryOptions({ isActive }, { enabled })
  )
}

export function useCostCenter(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.costCenters.getById.queryOptions({ id }, { enabled: enabled && !!id })
  )
}

export function useCreateCostCenter() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.costCenters.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.costCenters.list.queryKey() })
    },
  })
}

export function useUpdateCostCenter() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.costCenters.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.costCenters.list.queryKey() })
    },
  })
}

export function useDeleteCostCenter() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.costCenters.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.costCenters.list.queryKey() })
    },
  })
}
```

#### 2. Employment Types Hooks
**File**: `apps/web/src/hooks/api/use-employment-types.ts` (rewrite)
**Changes**: Same pattern as cost centers hooks.

#### 3. Locations Hooks
**File**: `apps/web/src/hooks/api/use-locations.ts` (rewrite)
**Changes**: Same pattern as cost centers hooks.

#### 4. Holidays Hooks
**File**: `apps/web/src/hooks/api/use-holidays.ts` (rewrite)
**Changes**: tRPC pattern with additional hooks for generate and copy.

```typescript
export function useHolidays(options: { year?: number; from?: string; to?: string; departmentId?: string; enabled?: boolean } = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.holidays.list.queryOptions(input, { enabled })
  )
}

export function useHoliday(id: string, enabled = true) { ... }
export function useCreateHoliday() { ... }
export function useUpdateHoliday() { ... }
export function useDeleteHoliday() { ... }

export function useGenerateHolidays() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.holidays.generate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.holidays.list.queryKey() })
    },
  })
}

export function useCopyHolidays() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.holidays.copy.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.holidays.list.queryKey() })
    },
  })
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `cd apps/web && npx tsc --noEmit`
- [ ] All router tests pass: `cd apps/web && npx vitest run src/server/__tests__/`
- [ ] Linting passes: `cd apps/web && npx eslint src/hooks/api/use-holidays.ts src/hooks/api/use-cost-centers.ts src/hooks/api/use-employment-types.ts src/hooks/api/use-locations.ts`
- [ ] No TypeScript errors in hook consumers (pages that import these hooks)

#### Manual Verification:
- [ ] Holiday management page works end-to-end (list, create, generate, copy, edit, delete)
- [ ] Cost center management page works end-to-end
- [ ] Employment type management page works end-to-end
- [ ] Location management page works end-to-end
- [ ] No regressions in other pages that use these hooks

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:
- **Holiday calendar** (`holiday-calendar.test.ts`): Easter algorithm, state holidays, repentance day, parseState
- **Cost centers router** (`cost-centers-router.test.ts`): CRUD with validation, uniqueness, employee constraint
- **Employment types router** (`employment-types-router.test.ts`): CRUD + Decimal handling + vacationCalcGroupId clearing
- **Locations router** (`locations-router.test.ts`): CRUD + address fields
- **Holidays router** (`holidays-router.test.ts`): CRUD + Generate + Copy with all edge cases

### Key Edge Cases:
- Holiday Generate: same holidays already exist (skipExisting true/false)
- Holiday Copy: Feb 29 source holiday to non-leap target year (should skip)
- Holiday Copy: category overrides applied correctly by MM-DD key
- EmploymentType: Decimal(5,2) round-trip for weeklyHoursDefault
- EmploymentType: clearVacationCalcGroupId flag
- CostCenter/EmploymentType delete: rejected when employees assigned
- All routers: tenant scoping (queries never leak cross-tenant data)

### Manual Testing Steps:
1. Start dev environment: `make dev`
2. Navigate to each management page in the UI
3. Verify CRUD operations work for all 4 entities
4. For holidays: generate holidays for Bayern 2026, verify list shows correct holidays
5. For holidays: copy holidays from 2026 to 2027, verify copied correctly
6. Verify no console errors or network failures

## Performance Considerations

- Holiday Generate creates up to ~13 holidays per call (one DB insert each). For large batches, consider using `createMany` instead of individual `create` calls. However, the Go implementation uses individual creates, so this matches existing behavior.
- Holiday list by year should use a date range filter (`gte`/`lt`) rather than extracting year from date, ensuring index usage.

## Migration Notes

- No database migrations needed. All Prisma models exist.
- Frontend hooks maintain the same public API (function names and parameter shapes are similar), so most page components should need minimal changes.
- The Go REST endpoints remain available during migration. Once all frontend consumers are verified to use tRPC, the Go endpoints can be deprecated in a future ticket.

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-212-holidays-costcenters-employmenttypes-locations.md`
- Research document: `thoughts/shared/research/2026-03-04-ZMI-TICKET-212-holidays-costcenters-employmenttypes-locations.md`
- Predecessor ticket (departments/teams): `thoughts/shared/plans/2026-03-03-ZMI-TICKET-211-departments-teams.md`
- Departments router (pattern reference): `apps/web/src/server/routers/departments.ts`
- Departments test (pattern reference): `apps/web/src/server/__tests__/departments-router.test.ts`
- Permission catalog: `apps/web/src/server/lib/permission-catalog.ts`
- Root router: `apps/web/src/server/root.ts`
- Go holiday service: `apps/api/internal/service/holiday.go`
- Go holiday calendar: `apps/api/internal/holiday/calendar.go`
- Go cost center service: `apps/api/internal/service/costcenter.go`
- Go employment type service: `apps/api/internal/service/employmenttype.go`
- Go location service: `apps/api/internal/service/location.go`
- Frontend hooks (tRPC pattern): `apps/web/src/hooks/api/use-departments.ts`
