# ZMI-TICKET-226 Implementation Plan: Travel Allowance Rules tRPC Routers

## Overview

Port Go business logic for Travel Allowance Rule Sets (CRUD), Extended Travel Rules (CRUD), Local Travel Rules (CRUD), and Travel Allowance Preview (calculation engine) to tRPC routers. Add Prisma models for 3 new tables (`travel_allowance_rule_sets`, `local_travel_rules`, `extended_travel_rules`), create 4 tRPC router files, register them in `root.ts`, create new frontend hooks for all 4 domains, port the Go calculation logic to TypeScript, and write unit tests.

**Go files being replaced:**
- `apps/api/internal/service/travel_allowance_rule_set.go` (189 lines)
- `apps/api/internal/handler/travel_allowance_rule_set.go` (216 lines)
- `apps/api/internal/repository/travel_allowance_rule_set.go` (79 lines)
- `apps/api/internal/service/extended_travel_rule.go` (193 lines)
- `apps/api/internal/handler/extended_travel_rule.go` (248 lines)
- `apps/api/internal/repository/extended_travel_rule.go` (77 lines)
- `apps/api/internal/service/local_travel_rule.go` (168 lines)
- `apps/api/internal/handler/local_travel_rule.go` (236 lines)
- `apps/api/internal/repository/local_travel_rule.go` (77 lines)
- `apps/api/internal/service/travel_allowance_preview.go` (245 lines)
- `apps/api/internal/handler/travel_allowance_preview.go` (129 lines)
- `apps/api/internal/calculation/travel_allowance.go` (260 lines -- ported to TypeScript utility)

---

## Current State Analysis

### What exists:
- Full Go backend (handler/service/repository) for all 4 entity groups
- Database tables: `travel_allowance_rule_sets`, `local_travel_rules`, `extended_travel_rules` (migration 000075)
- Go calculation package: `apps/api/internal/calculation/travel_allowance.go` (pure functions for local rule matching and extended day breakdown)
- Permissions in catalog: `travel_allowance.manage` (`apps/web/src/server/lib/permission-catalog.ts:195-198`)
- OpenAPI specs: `api/paths/travel-allowance.yaml` (367 lines), `api/schemas/travel-allowance.yaml` (466 lines)
- Generated Go models (15 files in `apps/api/gen/models/`)
- Auto-generated TypeScript types in `apps/web/src/lib/api/types.ts`
- No existing tests for any travel allowance domain (handler, service, repository, or calculation)
- No frontend hooks, pages, or components for travel allowance

### What's missing:
- Prisma models: `TravelAllowanceRuleSet`, `LocalTravelRule`, `ExtendedTravelRule`
- Supabase migration for the 3 tables (they exist in Go migrations but not Supabase)
- tRPC routers: `travelAllowanceRuleSets`, `extendedTravelRules`, `localTravelRules`, `travelAllowancePreview`
- TypeScript calculation utility for local and extended travel allowance
- Frontend hooks for all 4 domains (none exist)

### Key Discoveries:
- The calculation package (`apps/api/internal/calculation/travel_allowance.go`) is pure logic with no HTTP/DB dependencies. It must be ported to TypeScript and called directly from the preview router.
- The `travel_allowance_rule_sets` table has `calculation_basis` (enum: "per_day", "per_booking") and `distance_rule` (enum: "longest", "shortest", "first", "last") fields. These are stored as VARCHAR(20) in the DB and will be typed as `z.enum()` in the tRPC schemas.
- `local_travel_rules` and `extended_travel_rules` use `NUMERIC(10,2)` for monetary and distance fields. Prisma models these as `Decimal`. The tRPC schemas will use `z.number()` and convert at the Prisma layer using `Number()`.
- The `valid_from` and `valid_to` fields on rule sets are nullable `DATE` columns (not datetime). Prisma will model them as `DateTime?` with `@db.Date`.
- The `code` field on rule sets is immutable after creation (enforced by the service layer -- not in the update input).
- Both `local_travel_rules` and `extended_travel_rules` have `rule_set_id` FK with CASCADE DELETE. Deleting a rule set cascades to all its rules.
- The preview service reuses the same three repositories as the CRUD services (instantiated once in main.go).
- The ticket references `requirePermission("travel_allowance.*")` with a wildcard. The current Go implementation and permission catalog use a single `travel_allowance.manage` permission. We will use the **existing** `travel_allowance.manage` permission.
- The ticket mentions `travelAllowancePreview.preview` as a query, but the Go implementation uses POST. Since the preview accepts complex input (rule_set_id, trip_type, distance_km, duration_minutes, start_date, end_date, three_month_active), we will implement it as a **query** per the ticket specification.
- The `ListByRuleSet` repository method is used only by the preview service. In the tRPC migration, both `extendedTravelRules.list` and `localTravelRules.list` will accept an optional `ruleSetId` filter parameter, which also serves the preview's needs directly via Prisma queries.
- The `MaxDistanceKm` and `MaxDurationMinutes` fields on local travel rules are nullable -- they represent unbounded upper ranges.
- The local travel calculation uses "first match wins" -- rules are pre-sorted by `sort_order ASC, min_distance_km ASC`.

---

## Desired End State

After this plan is complete:
1. Three new Prisma models exist and are usable: `TravelAllowanceRuleSet`, `LocalTravelRule`, `ExtendedTravelRule`
2. Four tRPC routers handle all CRUD + preview logic that was in Go
3. TypeScript calculation utility ports the Go calculation logic for local and extended travel
4. New frontend hooks exist for all 4 domains
5. All unit tests pass for the four routers and the calculation utility

**Verification:** `cd apps/web && npx vitest run src/server/__tests__/travelAllowanceRuleSets-router.test.ts src/server/__tests__/localTravelRules-router.test.ts src/server/__tests__/extendedTravelRules-router.test.ts src/server/__tests__/travelAllowancePreview-router.test.ts src/lib/__tests__/travel-allowance-calculation.test.ts` passes. TypeScript compilation succeeds via `cd apps/web && npx tsc --noEmit`.

---

## What We're NOT Doing

- **Travel allowance calculation in daily values** -- deferred to TICKET-234
- **Permission restructuring** -- the ticket mentions `travel_allowance.*` wildcard but we use the existing `travel_allowance.manage` permission
- **Frontend pages/components** -- only hooks are created; pages will be built separately
- **Modifying the Go calculation package** -- it remains in Go for any Go-side consumers; we port a TypeScript equivalent
- **Pagination for rule set/rule lists** -- the Go implementation returns unpaginated lists (`{Data: [...]}`) and we maintain this pattern since rule sets and rules are small configuration data sets

---

## Implementation Approach

Follow the same pattern as ZMI-TICKET-224 and ZMI-TICKET-225:
1. Supabase migration to create tables
2. Prisma schema additions (3 new models + reverse relations on Tenant)
3. Prisma client regeneration
4. TypeScript calculation utility (ported from Go)
5. tRPC routers with business logic inline (Prisma replaces repository layer)
6. Root router registration
7. Frontend hook creation
8. Unit tests

Split into 5 phases to keep each phase testable.

---

## Phase 0: Prisma Schema + Supabase Migration

### Overview
Add the database tables to Supabase and define Prisma models for `TravelAllowanceRuleSet`, `LocalTravelRule`, and `ExtendedTravelRule`.

### Changes Required:

#### 1. Supabase Migration
**File**: `supabase/migrations/<timestamp>_add_travel_allowance_rules.sql`
**Action**: Create with `make db-migrate-new name=add_travel_allowance_rules`, then populate.

Content should replicate the DDL from `db/migrations/000075_create_travel_allowance.up.sql` (all 3 tables, indexes, triggers, and comments). All `CREATE TABLE` wrapped in `CREATE TABLE IF NOT EXISTS`. All indexes use `CREATE INDEX IF NOT EXISTS`. Triggers use `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`.

#### 2. Prisma Schema Additions
**File**: `apps/web/prisma/schema.prisma`
**Action**: Append 3 new models after the TripRecord model (after line 2521). Add reverse relation fields to Tenant model (after line 157, before the `// Indexes` comment).

**Model: TravelAllowanceRuleSet** (maps to `travel_allowance_rule_sets`)
```prisma
model TravelAllowanceRuleSet {
  id               String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId         String    @map("tenant_id") @db.Uuid
  code             String    @db.VarChar(50)
  name             String    @db.VarChar(255)
  description      String?   @db.Text
  validFrom        DateTime? @map("valid_from") @db.Date
  validTo          DateTime? @map("valid_to") @db.Date
  calculationBasis String    @default("per_day") @map("calculation_basis") @db.VarChar(20)
  distanceRule     String    @default("longest") @map("distance_rule") @db.VarChar(20)
  isActive         Boolean   @default(true) @map("is_active")
  sortOrder        Int       @default(0) @map("sort_order")
  createdAt        DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant             Tenant               @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  localTravelRules   LocalTravelRule[]
  extendedTravelRules ExtendedTravelRule[]

  // Indexes
  @@unique([tenantId, code])
  @@index([tenantId], map: "idx_travel_allowance_rule_sets_tenant")
  @@map("travel_allowance_rule_sets")
}
```

**Model: LocalTravelRule** (maps to `local_travel_rules`)
```prisma
model LocalTravelRule {
  id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId           String    @map("tenant_id") @db.Uuid
  ruleSetId          String    @map("rule_set_id") @db.Uuid
  minDistanceKm      Decimal   @default(0) @map("min_distance_km") @db.Decimal(10, 2)
  maxDistanceKm      Decimal?  @map("max_distance_km") @db.Decimal(10, 2)
  minDurationMinutes Int       @default(0) @map("min_duration_minutes")
  maxDurationMinutes Int?      @map("max_duration_minutes")
  taxFreeAmount      Decimal   @default(0) @map("tax_free_amount") @db.Decimal(10, 2)
  taxableAmount      Decimal   @default(0) @map("taxable_amount") @db.Decimal(10, 2)
  isActive           Boolean   @default(true) @map("is_active")
  sortOrder          Int       @default(0) @map("sort_order")
  createdAt          DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant  Tenant                  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  ruleSet TravelAllowanceRuleSet  @relation(fields: [ruleSetId], references: [id], onDelete: Cascade)

  // Indexes
  @@index([tenantId], map: "idx_local_travel_rules_tenant")
  @@index([ruleSetId], map: "idx_local_travel_rules_rule_set")
  @@map("local_travel_rules")
}
```

**Model: ExtendedTravelRule** (maps to `extended_travel_rules`)
```prisma
model ExtendedTravelRule {
  id                     String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId               String    @map("tenant_id") @db.Uuid
  ruleSetId              String    @map("rule_set_id") @db.Uuid
  arrivalDayTaxFree      Decimal   @default(0) @map("arrival_day_tax_free") @db.Decimal(10, 2)
  arrivalDayTaxable      Decimal   @default(0) @map("arrival_day_taxable") @db.Decimal(10, 2)
  departureDayTaxFree    Decimal   @default(0) @map("departure_day_tax_free") @db.Decimal(10, 2)
  departureDayTaxable    Decimal   @default(0) @map("departure_day_taxable") @db.Decimal(10, 2)
  intermediateDayTaxFree Decimal   @default(0) @map("intermediate_day_tax_free") @db.Decimal(10, 2)
  intermediateDayTaxable Decimal   @default(0) @map("intermediate_day_taxable") @db.Decimal(10, 2)
  threeMonthEnabled      Boolean   @default(false) @map("three_month_enabled")
  threeMonthTaxFree      Decimal   @default(0) @map("three_month_tax_free") @db.Decimal(10, 2)
  threeMonthTaxable      Decimal   @default(0) @map("three_month_taxable") @db.Decimal(10, 2)
  isActive               Boolean   @default(true) @map("is_active")
  sortOrder              Int       @default(0) @map("sort_order")
  createdAt              DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt              DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant  Tenant                  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  ruleSet TravelAllowanceRuleSet  @relation(fields: [ruleSetId], references: [id], onDelete: Cascade)

  // Indexes
  @@index([tenantId], map: "idx_extended_travel_rules_tenant")
  @@index([ruleSetId], map: "idx_extended_travel_rules_rule_set")
  @@map("extended_travel_rules")
}
```

**Reverse relations to add on existing Tenant model:**
On the Tenant model (around line 157, after `tripRecords TripRecord[]`), add:
```prisma
  travelAllowanceRuleSets     TravelAllowanceRuleSet[]
  localTravelRules            LocalTravelRule[]
  extendedTravelRules         ExtendedTravelRule[]
```

#### 3. Regenerate Prisma Client
Run `cd apps/web && npx prisma generate` to regenerate the client.

### Success Criteria:

#### Automated Verification:
- [x] Supabase migration applies: `cd /home/tolga/projects/terp && npx supabase db reset`
- [x] Prisma client generates without errors: `cd apps/web && npx prisma generate`
- [x] TypeScript compilation passes: `cd apps/web && npx tsc --noEmit` (pre-existing errors only, no new errors)

#### Manual Verification:
- [ ] Tables visible in Supabase Studio
- [ ] Prisma Studio shows the 3 new models

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 1.

---

## Phase 1: Travel Allowance Rule Sets tRPC Router

### Overview
Create the `travelAllowanceRuleSets` tRPC router with standard CRUD operations, porting business logic from `apps/api/internal/service/travel_allowance_rule_set.go`.

### Changes Required:

#### 1. Travel Allowance Rule Sets Router
**File**: `apps/web/src/server/routers/travelAllowanceRuleSets.ts` (new file)
**Changes**: Create tRPC router with 5 procedures

**Permission constants:**
```typescript
const TRAVEL_ALLOWANCE_MANAGE = permissionIdByKey("travel_allowance.manage")!
```

All procedures use `tenantProcedure` + `requirePermission(TRAVEL_ALLOWANCE_MANAGE)`.

**Procedures:**

1. **`list`** (query)
   - Input: `z.void().optional()`
   - Output: `{ data: TravelAllowanceRuleSet[] }`
   - Logic: `findMany({ tenantId })`, order by `[{ sortOrder: "asc" }, { code: "asc" }]`
   - Note: Matches Go's `List` which orders by `sort_order ASC, code ASC`

2. **`getById`** (query)
   - Input: `{ id: string (uuid) }`
   - Output: `TravelAllowanceRuleSet`
   - Logic: `findFirst({ id, tenantId })`, throw NOT_FOUND if missing

3. **`create`** (mutation)
   - Input: `{ code: string (min 1, max 50), name: string (min 1, max 255), description?: string, validFrom?: string (YYYY-MM-DD), validTo?: string (YYYY-MM-DD), calculationBasis?: enum("per_day", "per_booking"), distanceRule?: enum("longest", "shortest", "first", "last"), sortOrder?: number (int) }`
   - Output: `TravelAllowanceRuleSet`
   - Logic (port from Go `Create`):
     1. Trim and validate code non-empty -> BAD_REQUEST "Rule set code is required"
     2. Trim and validate name non-empty -> BAD_REQUEST "Rule set name is required"
     3. Check code uniqueness within tenant: `findFirst({ tenantId, code })` -> CONFLICT "Rule set code already exists"
     4. Parse validFrom/validTo strings to Date if provided
     5. Create with defaults: `calculationBasis: "per_day"`, `distanceRule: "longest"`, `isActive: true`, `sortOrder: 0`

4. **`update`** (mutation)
   - Input: `{ id: string (uuid), name?: string (min 1, max 255), description?: string (nullable), validFrom?: string (nullable, YYYY-MM-DD), validTo?: string (nullable, YYYY-MM-DD), calculationBasis?: enum("per_day", "per_booking"), distanceRule?: enum("longest", "shortest", "first", "last"), isActive?: boolean, sortOrder?: number (int) }`
   - Output: `TravelAllowanceRuleSet`
   - Logic:
     - Verify exists with tenant scope -> NOT_FOUND
     - Code is NOT updatable (not in input schema)
     - If name provided, trim and validate non-empty -> BAD_REQUEST "Rule set name is required"
     - Parse validFrom/validTo if provided (null clears the date)
     - Build partial update data object

5. **`delete`** (mutation)
   - Input: `{ id: string (uuid) }`
   - Output: `{ success: boolean }`
   - Logic:
     - Verify exists with tenant scope -> NOT_FOUND
     - Delete (cascade will remove associated local and extended rules)

**Output Schema:**
```typescript
const travelAllowanceRuleSetOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  validFrom: z.date().nullable(),
  validTo: z.date().nullable(),
  calculationBasis: z.string(),
  distanceRule: z.string(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
```

**Date handling note**: `validFrom` and `validTo` are `@db.Date` in Prisma. When creating/updating, accept string input in `YYYY-MM-DD` format and convert with `new Date(input.validFrom + "T00:00:00.000Z")`. When returning, Prisma returns a `Date` object, which is serialized by tRPC automatically.

#### 2. Register in Root Router
**File**: `apps/web/src/server/root.ts`
**Changes**: Import `travelAllowanceRuleSetsRouter` and add `travelAllowanceRuleSets: travelAllowanceRuleSetsRouter` to `createTRPCRouter({...})`

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compilation passes: `cd apps/web && npx tsc --noEmit` (no new errors)
- [x] Unit tests pass: `cd apps/web && npx vitest run src/server/__tests__/travelAllowanceRuleSets-router.test.ts` (tests created in Phase 4)

#### Manual Verification:
- [ ] Rule set CRUD works via tRPC (test with tRPC DevTools or component)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Local Travel Rules + Extended Travel Rules tRPC Routers

### Overview
Create the `localTravelRules` and `extendedTravelRules` tRPC routers with CRUD operations, porting business logic from the respective Go service files. Both routers support an optional `ruleSetId` filter on the list endpoint.

### Changes Required:

#### 1. Local Travel Rules Router
**File**: `apps/web/src/server/routers/localTravelRules.ts` (new file)
**Changes**: Create tRPC router with 5 procedures

**Permission constants:**
```typescript
const TRAVEL_ALLOWANCE_MANAGE = permissionIdByKey("travel_allowance.manage")!
```

**Procedures:**

1. **`list`** (query)
   - Input: `{ ruleSetId?: string (uuid) }`
   - Output: `{ data: LocalTravelRule[] }`
   - Logic:
     - Build `where`: `{ tenantId }`, add `ruleSetId` if provided
     - `findMany`, order by `[{ sortOrder: "asc" }, { minDistanceKm: "asc" }]`
   - Note: Matches Go's `ListByRuleSet` ordering. The optional `ruleSetId` filter serves both the standalone list and the preview service's needs.

2. **`getById`** (query)
   - Input: `{ id: string (uuid) }`
   - Output: `LocalTravelRule`
   - Logic: `findFirst({ id, tenantId })`, throw NOT_FOUND

3. **`create`** (mutation)
   - Input: `{ ruleSetId: string (uuid, required), minDistanceKm?: number, maxDistanceKm?: number, minDurationMinutes?: number (int), maxDurationMinutes?: number (int), taxFreeAmount?: number, taxableAmount?: number, sortOrder?: number (int) }`
   - Output: `LocalTravelRule`
   - Logic (port from Go `Create`):
     1. Validate ruleSetId non-nil -> BAD_REQUEST "Rule set ID is required"
     2. Validate ruleSetId FK: `travelAllowanceRuleSet.findFirst({ id: ruleSetId, tenantId })` -> BAD_REQUEST "Rule set not found"
     3. Create with defaults: all decimal fields default to 0, `minDurationMinutes: 0`, `isActive: true`, `sortOrder: 0`
     4. Convert number inputs to Prisma Decimal where needed

4. **`update`** (mutation)
   - Input: `{ id: string (uuid), minDistanceKm?: number, maxDistanceKm?: number (nullable), minDurationMinutes?: number (int), maxDurationMinutes?: number (int, nullable), taxFreeAmount?: number, taxableAmount?: number, isActive?: boolean, sortOrder?: number (int) }`
   - Output: `LocalTravelRule`
   - Logic:
     - Verify exists with tenant scope -> NOT_FOUND
     - RuleSetID is NOT updatable
     - Build partial update data, handling nullable maxDistanceKm and maxDurationMinutes
     - Convert numbers to Prisma Decimal

5. **`delete`** (mutation)
   - Input: `{ id: string (uuid) }`
   - Output: `{ success: boolean }`
   - Logic: Verify exists with tenant scope, then delete

**Output Schema:**
```typescript
const localTravelRuleOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  ruleSetId: z.string().uuid(),
  minDistanceKm: z.number(),
  maxDistanceKm: z.number().nullable(),
  minDurationMinutes: z.number(),
  maxDurationMinutes: z.number().nullable(),
  taxFreeAmount: z.number(),
  taxableAmount: z.number(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
```

**Decimal conversion note**: Prisma returns `Decimal` objects for `NUMERIC` columns. Convert to `number` in the response mapping using `Number(record.minDistanceKm)`. This matches the pattern used in `vehicleRoutes.ts` and `tripRecords.ts`.

#### 2. Extended Travel Rules Router
**File**: `apps/web/src/server/routers/extendedTravelRules.ts` (new file)
**Changes**: Create tRPC router with 5 procedures

**Permission constants:**
```typescript
const TRAVEL_ALLOWANCE_MANAGE = permissionIdByKey("travel_allowance.manage")!
```

**Procedures:**

1. **`list`** (query)
   - Input: `{ ruleSetId?: string (uuid) }`
   - Output: `{ data: ExtendedTravelRule[] }`
   - Logic:
     - Build `where`: `{ tenantId }`, add `ruleSetId` if provided
     - `findMany`, order by `[{ sortOrder: "asc" }]`

2. **`getById`** (query)
   - Input: `{ id: string (uuid) }`
   - Output: `ExtendedTravelRule`
   - Logic: `findFirst({ id, tenantId })`, throw NOT_FOUND

3. **`create`** (mutation)
   - Input: `{ ruleSetId: string (uuid, required), arrivalDayTaxFree?: number, arrivalDayTaxable?: number, departureDayTaxFree?: number, departureDayTaxable?: number, intermediateDayTaxFree?: number, intermediateDayTaxable?: number, threeMonthEnabled?: boolean, threeMonthTaxFree?: number, threeMonthTaxable?: number, sortOrder?: number (int) }`
   - Output: `ExtendedTravelRule`
   - Logic (port from Go `Create`):
     1. Validate ruleSetId non-nil -> BAD_REQUEST "Rule set ID is required"
     2. Validate ruleSetId FK: `travelAllowanceRuleSet.findFirst({ id: ruleSetId, tenantId })` -> BAD_REQUEST "Rule set not found"
     3. Create with defaults: all decimal fields default to 0, `threeMonthEnabled: false`, `isActive: true`, `sortOrder: 0`

4. **`update`** (mutation)
   - Input: `{ id: string (uuid), arrivalDayTaxFree?: number, arrivalDayTaxable?: number, departureDayTaxFree?: number, departureDayTaxable?: number, intermediateDayTaxFree?: number, intermediateDayTaxable?: number, threeMonthEnabled?: boolean, threeMonthTaxFree?: number, threeMonthTaxable?: number, isActive?: boolean, sortOrder?: number (int) }`
   - Output: `ExtendedTravelRule`
   - Logic:
     - Verify exists with tenant scope -> NOT_FOUND
     - RuleSetID is NOT updatable
     - Build partial update data

5. **`delete`** (mutation)
   - Input: `{ id: string (uuid) }`
   - Output: `{ success: boolean }`
   - Logic: Verify exists with tenant scope, then delete

**Output Schema:**
```typescript
const extendedTravelRuleOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  ruleSetId: z.string().uuid(),
  arrivalDayTaxFree: z.number(),
  arrivalDayTaxable: z.number(),
  departureDayTaxFree: z.number(),
  departureDayTaxable: z.number(),
  intermediateDayTaxFree: z.number(),
  intermediateDayTaxable: z.number(),
  threeMonthEnabled: z.boolean(),
  threeMonthTaxFree: z.number(),
  threeMonthTaxable: z.number(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
```

#### 3. Register in Root Router
**File**: `apps/web/src/server/root.ts`
**Changes**: Import `localTravelRulesRouter` and `extendedTravelRulesRouter`, add `localTravelRules: localTravelRulesRouter` and `extendedTravelRules: extendedTravelRulesRouter`

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compilation passes: `cd apps/web && npx tsc --noEmit`
- [x] Unit tests pass: `cd apps/web && npx vitest run src/server/__tests__/localTravelRules-router.test.ts src/server/__tests__/extendedTravelRules-router.test.ts`

#### Manual Verification:
- [ ] Local travel rule and extended travel rule CRUD works via tRPC

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Travel Allowance Calculation Utility + Preview tRPC Router

### Overview
Port the Go calculation logic (`apps/api/internal/calculation/travel_allowance.go`) to a TypeScript utility module, then create the `travelAllowancePreview` tRPC router that orchestrates rule fetching and calculation.

### Changes Required:

#### 1. TypeScript Calculation Utility
**File**: `apps/web/src/lib/calculation/travel-allowance.ts` (new file)
**Changes**: Port the Go calculation functions to TypeScript

This module contains pure functions with no Prisma or tRPC dependencies. Port from `apps/api/internal/calculation/travel_allowance.go` (260 lines).

**Types:**
```typescript
export interface LocalTravelRuleInput {
  minDistanceKm: number
  maxDistanceKm: number | null
  minDurationMinutes: number
  maxDurationMinutes: number | null
  taxFreeAmount: number
  taxableAmount: number
}

export interface LocalTravelInput {
  distanceKm: number
  durationMinutes: number
  rules: LocalTravelRuleInput[]
}

export interface LocalTravelOutput {
  matched: boolean
  taxFreeTotal: number
  taxableTotal: number
  totalAllowance: number
  matchedRuleIdx: number
}

export interface ExtendedTravelRuleInput {
  arrivalDayTaxFree: number
  arrivalDayTaxable: number
  departureDayTaxFree: number
  departureDayTaxable: number
  intermediateDayTaxFree: number
  intermediateDayTaxable: number
  threeMonthEnabled: boolean
  threeMonthTaxFree: number
  threeMonthTaxable: number
}

export interface ExtendedTravelInput {
  startDate: Date
  endDate: Date
  threeMonthActive: boolean
  rule: ExtendedTravelRuleInput
}

export interface ExtendedTravelBreakdownItem {
  description: string
  days: number
  taxFreeAmount: number
  taxableAmount: number
  taxFreeSubtotal: number
  taxableSubtotal: number
}

export interface ExtendedTravelOutput {
  totalDays: number
  arrivalDays: number
  departureDays: number
  intermediateDays: number
  taxFreeTotal: number
  taxableTotal: number
  totalAllowance: number
  breakdown: ExtendedTravelBreakdownItem[]
}
```

**Functions:**

1. **`calculateLocalTravelAllowance(input: LocalTravelInput): LocalTravelOutput`**
   - Port from Go's `CalculateLocalTravelAllowance`
   - Iterates rules in order; first rule where distance/duration falls within range wins
   - Uses plain number arithmetic (no Decimal library needed for client-side preview calculations)

2. **`calculateExtendedTravelAllowance(input: ExtendedTravelInput): ExtendedTravelOutput`**
   - Port from Go's `CalculateExtendedTravelAllowance`
   - Day calculation (inclusive): `totalDays = Math.floor((endDate - startDate) / (24*60*60*1000)) + 1`, minimum 1
   - Cases: 1 day = arrival only, 2 days = arrival + departure, 3+ days = arrival + intermediate + departure
   - Three-month rule: if `threeMonthActive && rule.threeMonthEnabled`, intermediate days use reduced rates
   - Builds breakdown items with descriptions matching Go output

**Note on precision**: The Go implementation uses `shopspring/decimal` for exact decimal arithmetic. For the TypeScript port, we use standard JavaScript `number` (IEEE 754 double-precision). For the monetary amounts in this domain (two decimal places, amounts under 1000), this provides sufficient precision. The values are configuration data (user-entered rates), not accumulated floating-point computations, so rounding errors are negligible.

#### 2. Travel Allowance Preview Router
**File**: `apps/web/src/server/routers/travelAllowancePreview.ts` (new file)
**Changes**: Create tRPC router with 1 procedure

**Permission constants:**
```typescript
const TRAVEL_ALLOWANCE_MANAGE = permissionIdByKey("travel_allowance.manage")!
```

**Procedures:**

1. **`preview`** (query)
   - Input:
     ```typescript
     z.object({
       ruleSetId: z.string().uuid(),
       tripType: z.enum(["local", "extended"]),
       distanceKm: z.number().optional().default(0),
       durationMinutes: z.number().int().optional().default(0),
       startDate: z.string().optional(), // YYYY-MM-DD
       endDate: z.string().optional(),   // YYYY-MM-DD
       threeMonthActive: z.boolean().optional().default(false),
     })
     ```
   - Output:
     ```typescript
     z.object({
       tripType: z.string(),
       ruleSetId: z.string().uuid(),
       ruleSetName: z.string(),
       taxFreeTotal: z.number(),
       taxableTotal: z.number(),
       totalAllowance: z.number(),
       breakdown: z.array(z.object({
         description: z.string(),
         days: z.number(),
         taxFreeAmount: z.number(),
         taxableAmount: z.number(),
         taxFreeSubtotal: z.number(),
         taxableSubtotal: z.number(),
       })),
     })
     ```
   - Logic (port from Go `Preview` / `previewLocal` / `previewExtended`):
     1. Fetch rule set by ID: `travelAllowanceRuleSet.findFirst({ id: ruleSetId, tenantId })` -> NOT_FOUND "Rule set not found"
     2. If `tripType === "local"`:
        a. Validate `distanceKm > 0 || durationMinutes > 0` -> BAD_REQUEST "Distance or duration is required for local travel preview"
        b. Fetch local rules: `localTravelRule.findMany({ ruleSetId, isActive: true })`, order by `[{ sortOrder: "asc" }, { minDistanceKm: "asc" }]`
        c. Build `LocalTravelInput` from rules (convert Prisma Decimals to numbers)
        d. Call `calculateLocalTravelAllowance(input)`
        e. If not matched -> BAD_REQUEST "No matching local travel rule found"
        f. Return result with single breakdown item "Local travel allowance"
     3. If `tripType === "extended"`:
        a. Validate `startDate` and `endDate` provided and parseable -> BAD_REQUEST "Start date and end date are required for extended travel preview"
        b. Fetch extended rules: `extendedTravelRule.findMany({ ruleSetId, isActive: true })`, order by `[{ sortOrder: "asc" }]`
        c. Take first active rule -> BAD_REQUEST "No active extended travel rule found for this rule set"
        d. Build `ExtendedTravelInput` (convert Prisma Decimals to numbers)
        e. Call `calculateExtendedTravelAllowance(input)`
        f. Return result with breakdown items

#### 3. Register in Root Router
**File**: `apps/web/src/server/root.ts`
**Changes**: Import `travelAllowancePreviewRouter` and add `travelAllowancePreview: travelAllowancePreviewRouter`

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compilation passes: `cd apps/web && npx tsc --noEmit`
- [x] Calculation utility tests pass: `cd apps/web && npx vitest run src/lib/__tests__/travel-allowance-calculation.test.ts`
- [x] Preview router tests pass: `cd apps/web && npx vitest run src/server/__tests__/travelAllowancePreview-router.test.ts`

#### Manual Verification:
- [ ] Preview returns correct local travel calculation (matching rule found, correct amounts)
- [ ] Preview returns correct extended travel breakdown (arrival/intermediate/departure days)
- [ ] Three-month rule applies correctly when enabled

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Frontend Hooks + Unit Tests

### Overview
Create frontend hooks for all 4 travel allowance domains and write comprehensive unit tests for all routers and the calculation utility.

### Changes Required:

#### 1. Travel Allowance Rule Sets Hook
**File**: `apps/web/src/hooks/api/use-travel-allowance-rule-sets.ts` (new file)
**Changes**: Create tRPC-based hooks following `use-shift-planning.ts` pattern.

Hooks:
- `useTravelAllowanceRuleSets(options)` -- `trpc.travelAllowanceRuleSets.list.queryOptions`
- `useTravelAllowanceRuleSet(id)` -- `trpc.travelAllowanceRuleSets.getById.queryOptions`
- `useCreateTravelAllowanceRuleSet()` -- `trpc.travelAllowanceRuleSets.create.mutationOptions` + invalidate list
- `useUpdateTravelAllowanceRuleSet()` -- `trpc.travelAllowanceRuleSets.update.mutationOptions` + invalidate list
- `useDeleteTravelAllowanceRuleSet()` -- `trpc.travelAllowanceRuleSets.delete.mutationOptions` + invalidate list

#### 2. Local Travel Rules Hook
**File**: `apps/web/src/hooks/api/use-local-travel-rules.ts` (new file)
**Changes**: Create tRPC-based hooks.

Hooks:
- `useLocalTravelRules(options)` -- `trpc.localTravelRules.list.queryOptions({ ruleSetId? })`, invalidation includes ruleSetId
- `useLocalTravelRule(id)` -- `trpc.localTravelRules.getById.queryOptions`
- `useCreateLocalTravelRule()` -- `trpc.localTravelRules.create.mutationOptions` + invalidate list
- `useUpdateLocalTravelRule()` -- `trpc.localTravelRules.update.mutationOptions` + invalidate list
- `useDeleteLocalTravelRule()` -- `trpc.localTravelRules.delete.mutationOptions` + invalidate list

#### 3. Extended Travel Rules Hook
**File**: `apps/web/src/hooks/api/use-extended-travel-rules.ts` (new file)
**Changes**: Create tRPC-based hooks (same pattern as local travel rules).

Hooks:
- `useExtendedTravelRules(options)` -- `trpc.extendedTravelRules.list.queryOptions({ ruleSetId? })`
- `useExtendedTravelRule(id)` -- `trpc.extendedTravelRules.getById.queryOptions`
- `useCreateExtendedTravelRule()` -- `trpc.extendedTravelRules.create.mutationOptions` + invalidate list
- `useUpdateExtendedTravelRule()` -- `trpc.extendedTravelRules.update.mutationOptions` + invalidate list
- `useDeleteExtendedTravelRule()` -- `trpc.extendedTravelRules.delete.mutationOptions` + invalidate list

#### 4. Travel Allowance Preview Hook
**File**: `apps/web/src/hooks/api/use-travel-allowance-preview.ts` (new file)
**Changes**: Create tRPC-based hook.

Hooks:
- `useTravelAllowancePreview(input, options)` -- `trpc.travelAllowancePreview.preview.queryOptions({ ruleSetId, tripType, distanceKm, durationMinutes, startDate, endDate, threeMonthActive }, { enabled })`

#### 5. Hook Index Exports
**File**: `apps/web/src/hooks/api/index.ts`
**Changes**: Add re-exports for new hooks.

```typescript
// Travel Allowance Rule Sets
export {
  useTravelAllowanceRuleSets,
  useTravelAllowanceRuleSet,
  useCreateTravelAllowanceRuleSet,
  useUpdateTravelAllowanceRuleSet,
  useDeleteTravelAllowanceRuleSet,
} from './use-travel-allowance-rule-sets'

// Local Travel Rules
export {
  useLocalTravelRules,
  useLocalTravelRule,
  useCreateLocalTravelRule,
  useUpdateLocalTravelRule,
  useDeleteLocalTravelRule,
} from './use-local-travel-rules'

// Extended Travel Rules
export {
  useExtendedTravelRules,
  useExtendedTravelRule,
  useCreateExtendedTravelRule,
  useUpdateExtendedTravelRule,
  useDeleteExtendedTravelRule,
} from './use-extended-travel-rules'

// Travel Allowance Preview
export {
  useTravelAllowancePreview,
} from './use-travel-allowance-preview'
```

#### 6. Unit Tests -- Travel Allowance Calculation Utility
**File**: `apps/web/src/lib/__tests__/travel-allowance-calculation.test.ts` (new file)
**Changes**: Test the pure calculation functions.

Test cases for `calculateLocalTravelAllowance`:
- First matching rule wins (distance within range)
- Duration-only matching (distance = 0 but duration >= min)
- No match returns `matched: false`
- Unbounded max distance (maxDistanceKm = null)
- Unbounded max duration (maxDurationMinutes = null)
- Multiple rules -- first match wins even if later rule also matches
- Empty rules list returns no match

Test cases for `calculateExtendedTravelAllowance`:
- 1 day trip: 1 arrival day only
- 2 day trip: 1 arrival + 1 departure
- 3+ day trip: 1 arrival + N-2 intermediate + 1 departure (verify breakdown)
- Three-month rule active: intermediate days use reduced rates
- Three-month rule inactive: intermediate days use regular rates
- Same day (startDate === endDate): 1 day
- Verify breakdown descriptions match expected strings
- Verify totals equal sum of breakdown subtotals

#### 7. Unit Tests -- Travel Allowance Rule Sets Router
**File**: `apps/web/src/server/__tests__/travelAllowanceRuleSets-router.test.ts` (new file)
**Changes**: Follow `accessZones-router.test.ts` pattern.

Test cases:
- `list` -- returns tenant-scoped rule sets ordered by sortOrder/code
- `getById` -- returns rule set by ID, throws NOT_FOUND for missing
- `create` -- validates code required (empty after trim), name required, code uniqueness (CONFLICT), defaults calculationBasis/distanceRule/isActive/sortOrder, accepts validFrom/validTo dates
- `update` -- partial updates succeed, name validation, NOT_FOUND, code not updatable (not in schema), can clear validFrom/validTo to null
- `delete` -- deletes existing, NOT_FOUND for missing
- Permission: throws FORBIDDEN without `travel_allowance.manage`

#### 8. Unit Tests -- Local Travel Rules Router
**File**: `apps/web/src/server/__tests__/localTravelRules-router.test.ts` (new file)

Test cases:
- `list` -- returns tenant-scoped rules, supports ruleSetId filter
- `getById` -- returns rule, throws NOT_FOUND
- `create` -- validates ruleSetId required, ruleSetId FK exists, default values for decimal fields, handles nullable maxDistanceKm/maxDurationMinutes
- `update` -- partial updates, ruleSetId not updatable, can set maxDistanceKm/maxDurationMinutes to null, NOT_FOUND
- `delete` -- deletes existing, NOT_FOUND

#### 9. Unit Tests -- Extended Travel Rules Router
**File**: `apps/web/src/server/__tests__/extendedTravelRules-router.test.ts` (new file)

Test cases:
- `list` -- returns tenant-scoped rules, supports ruleSetId filter
- `getById` -- returns rule, throws NOT_FOUND
- `create` -- validates ruleSetId required, ruleSetId FK exists, default values for all 8 decimal fields + threeMonthEnabled
- `update` -- partial updates, NOT_FOUND
- `delete` -- deletes existing, NOT_FOUND

#### 10. Unit Tests -- Travel Allowance Preview Router
**File**: `apps/web/src/server/__tests__/travelAllowancePreview-router.test.ts` (new file)

Test cases:
- `preview` (local) -- fetches rule set, fetches active local rules, calculates correctly, returns single breakdown item
- `preview` (local) -- throws NOT_FOUND for invalid ruleSetId
- `preview` (local) -- throws BAD_REQUEST when distanceKm and durationMinutes both 0
- `preview` (local) -- throws BAD_REQUEST when no matching rule found
- `preview` (local) -- filters out inactive rules
- `preview` (extended) -- fetches rule set, fetches active extended rules, uses first active rule, calculates breakdown correctly for multi-day trip
- `preview` (extended) -- throws NOT_FOUND for invalid ruleSetId
- `preview` (extended) -- throws BAD_REQUEST when startDate or endDate missing
- `preview` (extended) -- throws BAD_REQUEST when no active extended rule found
- `preview` (extended) -- applies three-month rule when active and enabled
- Permission: throws FORBIDDEN without `travel_allowance.manage`

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compilation passes: `cd apps/web && npx tsc --noEmit`
- [x] All new unit tests pass: `cd apps/web && npx vitest run src/lib/__tests__/travel-allowance-calculation.test.ts src/server/__tests__/travelAllowanceRuleSets-router.test.ts src/server/__tests__/localTravelRules-router.test.ts src/server/__tests__/extendedTravelRules-router.test.ts src/server/__tests__/travelAllowancePreview-router.test.ts`
- [x] All existing tests still pass: `cd apps/web && npx vitest run`

#### Manual Verification:
- [ ] Hooks are importable from `@/hooks/api`
- [ ] No console errors when using hooks in a test component
- [ ] Preview hook returns correct calculation results

**Implementation Note**: After completing this phase and all automated verification passes, the ticket is complete.

---

## Testing Strategy

### Unit Tests:
- Mock Prisma methods via `ctx.prisma` (same pattern as `accessZones-router.test.ts`)
- Use `createCallerFactory(router)` for each router
- Test all validation rules ported from Go service layer
- Test permission enforcement (caller without permission should fail)
- Test tenant scoping (records from other tenants should not be accessible)
- Test calculation utility with pure function tests (no mocks needed)

### Key Edge Cases:
- Rule set code uniqueness across tenants (same code allowed in different tenants)
- Rule set deletion cascading to local and extended rules
- Local travel rule matching with unbounded ranges (null max distance/duration)
- Extended travel breakdown with exactly 1, 2, and 3+ days
- Three-month rule enabled vs disabled on extended travel
- Preview with no active rules returns appropriate error
- Preview filtering inactive rules from calculation input
- Valid date parsing for validFrom/validTo (YYYY-MM-DD format)
- Clearing nullable date fields (set to null on update)
- Decimal precision in monetary fields (two decimal places)

### Manual Testing Steps:
1. Create a travel allowance rule set with code/name/validity dates
2. Add local travel rules with distance/duration ranges and amounts
3. Add extended travel rules with arrival/departure/intermediate rates
4. Use the preview to calculate local travel for a given distance/duration
5. Use the preview to calculate extended travel for a date range
6. Verify three-month rule applies correctly
7. Delete a rule set and verify cascade deletion of child rules

---

## Performance Considerations

- Rule set and rule lists are simple `findMany` without pagination (small configuration data sets, typically <20 records per tenant).
- The preview endpoint executes 2-3 Prisma queries (1 for rule set, 1 for rules, optionally filtered by ruleSetId), all hitting indexed columns.
- The calculation logic is pure CPU arithmetic with no I/O, executing in microseconds.
- No N+1 query patterns. The preview fetches all rules in a single query and processes them in memory.

---

## Migration Notes

- The Go routes in `main.go` (lines 391-404 for service init, lines 585-588 for route registration) will continue to serve the old REST endpoints until they are explicitly removed. The tRPC routers operate independently.
- The Go calculation package (`apps/api/internal/calculation/travel_allowance.go`) remains unchanged. It is only used by the Go preview service, which is unaffected by the tRPC migration.
- The travel allowance domain is self-contained -- no other service or handler references these entities (confirmed in research). The tRPC migration has no cross-cutting impact.
- Frontend hooks are newly created (no existing hooks to migrate). The hook index will have new exports.

---

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-226-travel-allowance-rules.md`
- Research document: `thoughts/shared/research/2026-03-07-ZMI-TICKET-226-travel-allowance-rules.md`
- Previous plan (same series): `thoughts/shared/plans/2026-03-07-ZMI-TICKET-225-terminal-bookings-vehicles-trip-records.md`
- Exemplar tRPC router (CRUD): `apps/web/src/server/routers/shifts.ts`
- Exemplar tRPC router (complex): `apps/web/src/server/routers/terminalBookings.ts`
- Exemplar tRPC hook: `apps/web/src/hooks/api/use-shift-planning.ts`
- Exemplar test file: `apps/web/src/server/__tests__/accessZones-router.test.ts`
- Test helpers: `apps/web/src/server/__tests__/helpers.ts`
- Go rule set service: `apps/api/internal/service/travel_allowance_rule_set.go`
- Go extended travel service: `apps/api/internal/service/extended_travel_rule.go`
- Go local travel service: `apps/api/internal/service/local_travel_rule.go`
- Go preview service: `apps/api/internal/service/travel_allowance_preview.go`
- Go calculation package: `apps/api/internal/calculation/travel_allowance.go`
- DB migration: `db/migrations/000075_create_travel_allowance.up.sql`
- Prisma schema: `apps/web/prisma/schema.prisma` (new models append after line 2521)
- Root router: `apps/web/src/server/root.ts`
- tRPC setup: `apps/web/src/server/trpc.ts`
- Authorization middleware: `apps/web/src/server/middleware/authorization.ts`
- Permission catalog: `apps/web/src/server/lib/permission-catalog.ts`
- Hook index: `apps/web/src/hooks/api/index.ts`
