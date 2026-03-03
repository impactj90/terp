# ZMI-TICKET-204: Prisma Schema Org Tables — Implementation Plan

## Overview

Extend the existing Prisma schema at `apps/web/prisma/schema.prisma` with 9 organization models: Department, Team, TeamMember, CostCenter, Location, EmploymentType, Holiday, Account, AccountGroup. These models must match the **actual PostgreSQL database** (not the ticket's proposed schema, which has significant discrepancies). The schema is read-only against the existing DB; no migrations are created.

## Current State

- **Prisma schema**: `apps/web/prisma/schema.prisma` contains 4 models (User, Tenant, UserGroup, UserTenant) from TICKET-200
- **Generator**: `prisma-client` with output to `../src/generated/prisma` (Prisma 7.x)
- **Conventions established**: camelCase fields with `@map("snake_case")`, `@db.Uuid`, `@db.VarChar(N)`, `@db.Timestamptz(6)`, `@default(dbgenerated("gen_random_uuid()"))`, block comments documenting migration numbers, `@@index` with explicit `map:` names, `@@unique` with explicit `map:` names
- **9 target tables**: All exist in PostgreSQL via SQL migrations with Go/GORM model counterparts
- **Employee model**: Does NOT exist in Prisma (planned for TICKET-205). Three org models reference Employee via FK

## Desired End State

1. `apps/web/prisma/schema.prisma` with 13 models total (4 existing + 9 new)
2. `prisma generate` succeeds and generates TypeScript types for all 13 models
3. All new models match actual DB columns exactly (no `deleted_at`, no `sort_order` on Department, etc.)
4. Employee FK columns modeled as bare `String?` (or `String`) without relation — same pattern as `User.employeeId`
5. Zero modifications to existing database data or schema
6. Existing tests and typecheck continue to pass

## What We Are NOT Doing

- Running `prisma db push` or `prisma migrate dev`
- Adding `deleted_at` fields (none of these tables have them)
- Adding `sort_order` to Department (does not exist in DB)
- Defining the `Employee` model (TICKET-205)
- Defining the `VacationCalculationGroup` model (out of scope for this ticket)
- Deleting Go model files (the ticket says "replaced" but this just means Prisma models are the new source of truth for TypeScript; Go models remain for the Go backend)
- Creating new SQL migrations
- Adding Prisma enums for string-type columns (Account enums are stored as VARCHAR in DB; we use `String` in Prisma, same pattern as `User.role`)

## Ticket Schema vs. Actual DB — Key Corrections

The ticket's proposed Prisma schema has significant discrepancies from the actual database. The implementation must follow the **actual DB**, not the ticket. Key corrections:

| Issue | Ticket Says | Actual DB / Correction |
|-------|-------------|----------------------|
| Department.sort_order | `Int @default(0)` | Does not exist in DB. Omit. |
| Department.deleted_at | `DateTime?` | Does not exist in DB. Omit. |
| Department.code | `String?` | NOT NULL in DB (`VARCHAR(50) NOT NULL`). Use `String`. |
| Department.description | Missing | Exists in DB (`TEXT`). Add. |
| Department.manager_employee_id | Missing | Exists in DB (`UUID`, FK to employees). Add as bare `String?`. |
| Team.department_id | Missing | Exists in DB (`UUID`, FK to departments). Add. |
| Team.leader_employee_id | Missing | Exists in DB (`UUID`, FK to employees). Add as bare `String?`. |
| Team.deleted_at | `DateTime?` | Does not exist. Omit. |
| TeamMember.id | `String @id @default(uuid())` | Does not exist. Uses composite PK `(team_id, employee_id)`. Use `@@id`. |
| CostCenter.description | Missing | Exists in DB (`TEXT`). Add. |
| CostCenter.deleted_at | `DateTime?` | Does not exist. Omit. |
| Location.code | `String?` | NOT NULL in DB (`VARCHAR(20) NOT NULL`). Use `String`. |
| Location.description, city, country, timezone | Missing | All exist in DB. Add. |
| Location.deleted_at | `DateTime?` | Does not exist. Omit. |
| EmploymentType.tenant_id | `String @db.Uuid` | Nullable in DB (migration 000088). Use `String?`. |
| EmploymentType.code | `String?` | NOT NULL in DB. Use `String`. |
| EmploymentType.weekly_hours_default | Missing | Exists in DB (`DECIMAL(5,2) DEFAULT 40.00`). Add. |
| EmploymentType.vacation_calc_group_id | Missing | Exists in DB (`UUID`, FK). Add as bare `String?`. |
| EmploymentType.deleted_at | `DateTime?` | Does not exist. Omit. |
| Holiday.date, half_day, state, year | Various | None exist. Actual: `holiday_date DATE`, `holiday_category INT`, `applies_to_all BOOLEAN`, `department_id UUID`. |
| Holiday.deleted_at | `DateTime?` | Does not exist. Omit. |
| Account.tenant_id | `String @db.Uuid` | Nullable in DB. Use `String?`. |
| Account.unit | `String?` | NOT NULL in DB with default 'minutes'. Use `String`. |
| Account.is_payroll_relevant, payroll_code, sort_order, year_carryover, display_format, bonus_factor | Missing | All exist in DB. Add all. |
| Account.deleted_at | `DateTime?` | Does not exist. Omit. |
| AccountGroup.code | `String?` | NOT NULL in DB. Use `String`. |
| AccountGroup.description | Missing | Exists in DB (`TEXT`). Add. |
| AccountGroup.is_active | Missing | Exists in DB (`BOOLEAN DEFAULT true`). Add. |
| AccountGroup.deleted_at | `DateTime?` | Does not exist. Omit. |

## Employee FK Strategy

Three models reference the `employees` table which is not yet in Prisma (TICKET-205):
- `departments.manager_employee_id` -> FK to employees(id) ON DELETE SET NULL
- `teams.leader_employee_id` -> FK to employees(id) ON DELETE SET NULL
- `team_members.employee_id` -> FK to employees(id) ON DELETE CASCADE

**Strategy**: Model these as bare UUID string fields (`String?` for nullable, `String` for non-nullable) WITHOUT Prisma relation annotations. This is the same pattern used for `User.employeeId` in the existing schema. When TICKET-205 adds the Employee model, the relations will be added at that time.

Similarly, `employment_types.vacation_calc_group_id` references `vacation_calculation_groups(id)` which is also not in Prisma yet. Model as bare `String?`.

## VacationCalculationGroup FK Strategy

The `employment_types.vacation_calc_group_id` FK references `vacation_calculation_groups(id)`. Since VacationCalculationGroup is not in scope for this ticket, model the FK as a bare `String?` field without a relation annotation.

---

## Phase 1: Add the 6 Simple Models (No Cross-References)

### Overview
Add CostCenter, Location, EmploymentType, Holiday, Account, and AccountGroup to the Prisma schema. These are "simple" because they either have no cross-references to other new models, or only reference Tenant (already in the schema). Account references AccountGroup, so AccountGroup must come first or be in the same phase.

### Files to Modify
- `apps/web/prisma/schema.prisma`

### Changes

Append the following 6 model blocks after the existing `UserTenant` model in `schema.prisma`. Each model must follow the conventions established in TICKET-200.

#### 1.1 CostCenter Model

```prisma
// -----------------------------------------------------------------------------
// CostCenter
// -----------------------------------------------------------------------------
// Migrations: 000004
//
// Trigger: update_updated_at_column() auto-sets updated_at on UPDATE
model CostCenter {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String    @map("tenant_id") @db.Uuid
  code        String    @db.VarChar(50)
  name        String    @db.VarChar(255)
  description String?   @db.Text
  isActive    Boolean   @default(true) @map("is_active")
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  // Indexes
  @@unique([tenantId, code], map: "cost_centers_tenant_id_code_key")
  @@index([tenantId], map: "idx_cost_centers_tenant")
  @@index([tenantId, isActive], map: "idx_cost_centers_active")
  @@map("cost_centers")
}
```

**Column mapping from migration 000004**:
- `id UUID PK DEFAULT gen_random_uuid()` -> `id String @id @default(dbgenerated(...))`
- `tenant_id UUID NOT NULL FK tenants(id) CASCADE` -> `tenantId String` with relation + onDelete
- `code VARCHAR(50) NOT NULL` -> `code String @db.VarChar(50)`
- `name VARCHAR(255) NOT NULL` -> `name String @db.VarChar(255)`
- `description TEXT` (nullable) -> `description String? @db.Text`
- `is_active BOOLEAN DEFAULT true` -> `isActive Boolean @default(true)` (DEFAULT true without NOT NULL, but cost_centers migration doesn't specify NOT NULL explicitly; however the Go model uses `bool` non-pointer and existing rows all have values. We use `Boolean` to match Go model pattern. The DB implicitly allows NULL but in practice no NULLs exist.)
- `created_at TIMESTAMPTZ DEFAULT NOW()` -> `createdAt DateTime @default(now())`
- `updated_at TIMESTAMPTZ DEFAULT NOW()` -> `updatedAt DateTime @default(now()) @updatedAt`

#### 1.2 Location Model

```prisma
// -----------------------------------------------------------------------------
// Location
// -----------------------------------------------------------------------------
// Migrations: 000082
//
// Note: No ON DELETE clause on tenant_id FK (defaults to NO ACTION).
model Location {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String    @map("tenant_id") @db.Uuid
  code        String    @db.VarChar(20)
  name        String    @db.VarChar(255)
  description String    @default("") @db.Text
  address     String    @default("") @db.Text
  city        String    @default("") @db.VarChar(255)
  country     String    @default("") @db.VarChar(100)
  timezone    String    @default("") @db.VarChar(100)
  isActive    Boolean   @default(true) @map("is_active")
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant Tenant @relation(fields: [tenantId], references: [id])

  // Indexes
  @@unique([tenantId, code], map: "locations_tenant_id_code_key")
  @@index([tenantId], map: "idx_locations_tenant_id")
  @@map("locations")
}
```

**Key notes**:
- Migration 000082 uses `NOT NULL` on `is_active`, `created_at`, `updated_at` and explicit `DEFAULT` on description/address/city/country/timezone. All string fields with `DEFAULT ''` are modeled as non-nullable `String @default("")`.
- The FK on `tenant_id` has no `ON DELETE` clause in migration 000082, so we omit `onDelete` on the relation (Prisma default is NoAction which matches PostgreSQL's default NO ACTION / RESTRICT behavior).

#### 1.3 EmploymentType Model

```prisma
// -----------------------------------------------------------------------------
// EmploymentType
// -----------------------------------------------------------------------------
// Migrations: 000005, 000049, 000088
//
// COALESCE-based unique index (cannot be modeled in Prisma):
//   idx_employment_types_tenant_code: UNIQUE ON (COALESCE(tenant_id, '00000000-...'), code)
// This constraint is enforced at the DB level only.
//
// tenant_id is nullable: NULL = system-wide type visible to all tenants.
// System types seeded: VZ, TZ, MINI, AZUBI, WERK, PRAKT
model EmploymentType {
  id                  String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId            String?   @map("tenant_id") @db.Uuid
  code                String    @db.VarChar(50)
  name                String    @db.VarChar(255)
  weeklyHoursDefault  Decimal   @default(40.00) @map("weekly_hours_default") @db.Decimal(5, 2)
  isActive            Boolean   @default(true) @map("is_active")
  vacationCalcGroupId String?   @map("vacation_calc_group_id") @db.Uuid
  createdAt           DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant Tenant? @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  // Note: vacationCalcGroupId FK references vacation_calculation_groups(id) ON DELETE SET NULL.
  // VacationCalculationGroup model is not yet in Prisma. Relation will be added when it is.

  // Indexes
  @@index([tenantId], map: "idx_employment_types_tenant")
  @@index([vacationCalcGroupId], map: "idx_employment_types_vacation_calc_group")
  @@map("employment_types")
}
```

**Key notes**:
- `tenant_id` is nullable since migration 000088 (`ALTER COLUMN tenant_id DROP NOT NULL`)
- `weekly_hours_default` uses `Decimal` type with `@db.Decimal(5, 2)` to match `DECIMAL(5,2)`
- COALESCE unique index cannot be modeled in Prisma (same pattern as UserGroup)
- `vacation_calc_group_id` is a bare `String?` without relation (VacationCalculationGroup not in Prisma)
- Original unique constraint `UNIQUE(tenant_id, code)` was dropped in migration 000088 and replaced with the COALESCE index — so we do NOT add `@@unique([tenantId, code])` (it would be wrong for NULL tenant_id rows)

#### 1.4 Holiday Model

```prisma
// -----------------------------------------------------------------------------
// Holiday
// -----------------------------------------------------------------------------
// Migrations: 000003, 000038
//
// CHECK constraint (enforced at DB level only):
//   holidays_category_check: holiday_category IN (1, 2, 3)
//
// Note: department_id has no FK constraint in the DB (just a UUID column).
// Trigger: update_holidays_updated_at BEFORE UPDATE
model Holiday {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String    @map("tenant_id") @db.Uuid
  holidayDate     DateTime  @map("holiday_date") @db.Date
  name            String    @db.VarChar(255)
  holidayCategory Int       @default(1) @map("holiday_category") @db.Integer
  appliesToAll    Boolean   @default(true) @map("applies_to_all")
  departmentId    String?   @map("department_id") @db.Uuid
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  // Note: departmentId is a bare UUID without FK constraint in the DB.
  // A Prisma relation to Department is intentionally omitted (no FK exists).

  // Indexes
  @@unique([tenantId, holidayDate], map: "holidays_tenant_id_holiday_date_key")
  @@index([tenantId, holidayDate], map: "idx_holidays_tenant_date")
  @@index([holidayDate], map: "idx_holidays_date_range")
  @@map("holidays")
}
```

**Key notes**:
- `holiday_date` is `DATE` type -> `DateTime @db.Date`
- `holiday_category` replaced `is_half_day` in migration 000038. Values 1/2/3, CHECK enforced at DB
- The ticket's proposed `date`, `half_day`, `state`, `year` fields are all wrong. The actual columns are `holiday_date`, `holiday_category`, `applies_to_all`, `department_id`
- `department_id` has no FK constraint in the DB (it is just a UUID column) — so we do NOT add a relation to Department. It is a bare `String?`.

#### 1.5 AccountGroup Model

AccountGroup must be defined BEFORE Account because Account references it.

```prisma
// -----------------------------------------------------------------------------
// AccountGroup
// -----------------------------------------------------------------------------
// Migrations: 000043
//
// Trigger: update_account_groups_updated_at BEFORE UPDATE
model AccountGroup {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String    @map("tenant_id") @db.Uuid
  code        String    @db.VarChar(50)
  name        String    @db.VarChar(255)
  description String?   @db.Text
  isActive    Boolean   @default(true) @map("is_active")
  sortOrder   Int       @default(0) @map("sort_order") @db.Integer
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant   Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  accounts Account[]

  // Indexes
  @@unique([tenantId, code], map: "account_groups_tenant_id_code_key")
  @@index([tenantId], map: "idx_account_groups_tenant")
  @@map("account_groups")
}
```

#### 1.6 Account Model

```prisma
// -----------------------------------------------------------------------------
// Account
// -----------------------------------------------------------------------------
// Migrations: 000006, 000033, 000043
//
// CHECK constraints (enforced at DB level only):
//   - account_type IN ('bonus', 'day', 'month')
//   - unit IN ('minutes', 'hours', 'days')
//   - display_format IN ('decimal', 'hh_mm')
//
// tenant_id is nullable: NULL = system account (FLEX, OT, VAC).
// System accounts seeded in migration 000006.
model Account {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String?   @map("tenant_id") @db.Uuid
  code              String    @db.VarChar(50)
  name              String    @db.VarChar(255)
  accountType       String    @map("account_type") @db.VarChar(20)
  unit              String    @default("minutes") @db.VarChar(20)
  isSystem          Boolean   @default(false) @map("is_system")
  isActive          Boolean   @default(true) @map("is_active")
  description       String?   @db.Text
  isPayrollRelevant Boolean   @default(false) @map("is_payroll_relevant")
  payrollCode       String?   @map("payroll_code") @db.VarChar(50)
  sortOrder         Int       @default(0) @map("sort_order") @db.Integer
  yearCarryover     Boolean   @default(true) @map("year_carryover")
  accountGroupId    String?   @map("account_group_id") @db.Uuid
  displayFormat     String    @default("decimal") @map("display_format") @db.VarChar(20)
  bonusFactor       Decimal?  @map("bonus_factor") @db.Decimal(5, 2)
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant       Tenant?       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  accountGroup AccountGroup? @relation(fields: [accountGroupId], references: [id], onDelete: SetNull)

  // Indexes
  @@unique([tenantId, code], map: "accounts_tenant_id_code_key")
  @@index([tenantId], map: "idx_accounts_tenant")
  @@index([accountGroupId], map: "idx_accounts_group")
  @@map("accounts")
}
```

**Key notes**:
- `tenant_id` is nullable (NULL = system account)
- `bonus_factor` uses `Decimal?` with `@db.Decimal(5, 2)` to match `NUMERIC(5,2)`
- `account_type` values are 'bonus', 'day', 'month' (migrated from 'tracking'/'balance' in 000043)
- `account_group_id` FK with `onDelete: SetNull` matches `ON DELETE SET NULL` from migration 000043
- Column ordering follows the migration evolution: original columns from 000006 first, then 000033 additions, then 000043 additions

### Tenant Model Update

The Tenant model needs reverse relation fields added for the new models. Add these relation arrays to the existing Tenant model:

```prisma
  // In existing Tenant model, add these to the Relations section:
  costCenters     CostCenter[]
  locations       Location[]
  employmentTypes EmploymentType[]
  holidays        Holiday[]
  accountGroups   AccountGroup[]
  accounts        Account[]
```

### Phase 1 Verification

```bash
cd apps/web && npx prisma validate
```

Should output "The schema is valid" without errors. This verifies:
- All field types are valid Prisma types
- All `@map` and `@@map` annotations are syntactically correct
- All `@default` values are valid
- All relation fields have matching counterparts
- All `@@unique` and `@@index` annotations are syntactically correct

---

## Phase 2: Add Department Model (Self-Referencing)

### Overview
Add the Department model with its self-referential parent/children relationship. This requires special attention because Prisma's self-relation syntax uses a named relation.

### Files to Modify
- `apps/web/prisma/schema.prisma`

### Changes

#### 2.1 Department Model

```prisma
// -----------------------------------------------------------------------------
// Department
// -----------------------------------------------------------------------------
// Migrations: 000009, 000014
//
// Self-referential tree via parent_id.
// manager_employee_id FK references employees(id) ON DELETE SET NULL.
// Employee model not yet in Prisma (TICKET-205); modeled as bare UUID.
model Department {
  id                String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String       @map("tenant_id") @db.Uuid
  parentId          String?      @map("parent_id") @db.Uuid
  code              String       @db.VarChar(50)
  name              String       @db.VarChar(255)
  description       String?      @db.Text
  managerEmployeeId String?      @map("manager_employee_id") @db.Uuid
  isActive          Boolean      @default(true) @map("is_active")
  createdAt         DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime     @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant   Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  parent   Department?  @relation("DepartmentTree", fields: [parentId], references: [id], onDelete: SetNull)
  children Department[] @relation("DepartmentTree")
  teams    Team[]
  // Note: managerEmployeeId FK references employees(id) ON DELETE SET NULL.
  // Employee model not yet in Prisma (TICKET-205). Relation will be added then.

  // Indexes
  @@unique([tenantId, code], map: "departments_tenant_id_code_key")
  @@index([tenantId], map: "idx_departments_tenant")
  @@index([parentId], map: "idx_departments_parent")
  @@index([tenantId, isActive], map: "idx_departments_active")
  @@map("departments")
}
```

**Key notes**:
- Self-reference uses named relation `"DepartmentTree"` for both `parent` and `children`
- `onDelete: SetNull` on parent relation matches `ON DELETE SET NULL` from migration 000009
- `managerEmployeeId` is a bare `String?` without relation (Employee not in Prisma yet)
- `teams Team[]` is the reverse relation for Team.departmentId (added in Phase 3)

#### 2.2 Tenant Model Update

Add department reverse relation to Tenant:

```prisma
  // In existing Tenant model Relations section:
  departments Department[]
```

### Phase 2 Verification

```bash
cd apps/web && npx prisma validate
```

Should succeed. The self-reference `"DepartmentTree"` relation should validate correctly.

---

## Phase 3: Add Team and TeamMember Models

### Overview
Add Team and TeamMember models. Team references Department (added in Phase 2) and Tenant. TeamMember has a composite primary key and references Team. Both reference Employee via bare UUID fields.

### Files to Modify
- `apps/web/prisma/schema.prisma`

### Changes

#### 3.1 Team Model

```prisma
// -----------------------------------------------------------------------------
// Team
// -----------------------------------------------------------------------------
// Migrations: 000010, 000014
//
// leader_employee_id FK references employees(id) ON DELETE SET NULL.
// Employee model not yet in Prisma (TICKET-205); modeled as bare UUID.
model Team {
  id               String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId         String       @map("tenant_id") @db.Uuid
  departmentId     String?      @map("department_id") @db.Uuid
  name             String       @db.VarChar(255)
  description      String?      @db.Text
  leaderEmployeeId String?      @map("leader_employee_id") @db.Uuid
  isActive         Boolean      @default(true) @map("is_active")
  createdAt        DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime     @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant     Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  department Department?  @relation(fields: [departmentId], references: [id], onDelete: SetNull)
  members    TeamMember[]
  // Note: leaderEmployeeId FK references employees(id) ON DELETE SET NULL.
  // Employee model not yet in Prisma (TICKET-205). Relation will be added then.

  // Indexes
  @@unique([tenantId, name], map: "teams_tenant_id_name_key")
  @@index([tenantId], map: "idx_teams_tenant")
  @@index([departmentId], map: "idx_teams_department")
  @@map("teams")
}
```

#### 3.2 TeamMember Model

```prisma
// -----------------------------------------------------------------------------
// TeamMember
// -----------------------------------------------------------------------------
// Migration: 000010, 000014
//
// Composite primary key: (team_id, employee_id). No surrogate id column.
// employee_id FK references employees(id) ON DELETE CASCADE.
// Employee model not yet in Prisma (TICKET-205); modeled as bare UUID.
//
// Role values: 'member' (default), 'lead', 'deputy'
model TeamMember {
  teamId     String   @map("team_id") @db.Uuid
  employeeId String   @map("employee_id") @db.Uuid
  joinedAt   DateTime @default(now()) @map("joined_at") @db.Timestamptz(6)
  role       String   @default("member") @db.VarChar(50)

  // Relations
  team Team @relation(fields: [teamId], references: [id], onDelete: Cascade)
  // Note: employeeId FK references employees(id) ON DELETE CASCADE.
  // Employee model not yet in Prisma (TICKET-205). Relation will be added then.

  // Composite primary key
  @@id([teamId, employeeId])

  // Indexes
  @@index([employeeId], map: "idx_team_members_employee")
  @@map("team_members")
}
```

**Key notes**:
- `@@id([teamId, employeeId])` — composite PK, no surrogate `id`. The ticket was wrong to add an `id` field.
- `role` defaults to `'member'` matching the DB default
- `employeeId` is non-nullable (`NOT NULL` in migration) — modeled as `String` (not `String?`)
- `onDelete: Cascade` on team relation matches `ON DELETE CASCADE` from migration 000010
- No `updatedAt` column exists on `team_members` (only `joined_at`)

#### 3.3 Tenant Model Update

Add team reverse relation to Tenant:

```prisma
  // In existing Tenant model Relations section:
  teams Team[]
```

### Phase 3 Verification

```bash
cd apps/web && npx prisma validate
```

Should succeed. Verify that:
- Team -> Department relation works (cross-model reference)
- TeamMember composite PK is valid
- Team -> TeamMember reverse relation works

---

## Phase 4: Generate Prisma Client and Verify Types

### Overview
Run `prisma generate` to produce updated TypeScript types for all 13 models. Verify types compile and are importable.

### Files Affected
- `apps/web/src/generated/prisma/` (auto-generated, will be updated)

### Steps

#### 4.1 Generate Prisma Client

```bash
cd apps/web && npx prisma generate
```

**Expected output**: Successful generation with no errors. New model files should appear in `apps/web/src/generated/prisma/models/` for each of the 9 new models.

#### 4.2 Verify TypeScript Compilation

```bash
cd apps/web && pnpm typecheck
```

**Expected**: Exit 0, no type errors. The existing test helpers in `apps/web/src/server/__tests__/helpers.ts` import from `@/generated/prisma/client` and must continue to compile.

#### 4.3 Verify Existing Tests Still Pass

```bash
cd apps/web && pnpm vitest run
```

**Expected**: All existing tests pass. The existing tests use mock Prisma clients and import types from `@/generated/prisma/client`. The addition of new models should not break any existing imports.

### Phase 4 Verification

All three commands above should succeed. Additionally, verify the generated files:

```bash
ls apps/web/src/generated/prisma/models/
```

Should list: `User.ts`, `Tenant.ts`, `UserGroup.ts`, `UserTenant.ts`, `CostCenter.ts`, `Location.ts`, `EmploymentType.ts`, `Holiday.ts`, `AccountGroup.ts`, `Account.ts`, `Department.ts`, `Team.ts`, `TeamMember.ts`

---

## Phase 5: Manual DB Verification (Optional, Requires Running DB)

### Overview
If the development database is running, verify that the Prisma schema matches the actual database by reading data.

### Steps

#### 5.1 Cross-check with prisma db pull

```bash
cd apps/web && npx prisma db pull --print 2>/dev/null | head -200
```

Compare the introspected schema for the 9 target tables against our hand-written models. Key things to check:
- Column names and types match
- Nullable/non-nullable matches
- Primary keys match (especially TeamMember composite PK)
- Foreign keys match

**Note**: The `db pull` output will include ALL tables in the database (87+ migrations), not just the 9 target tables.

#### 5.2 Verify Data Reads (Manual)

```bash
cd apps/web && npx tsx -e "
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './src/generated/prisma/client.js';
const adapter = new PrismaPg({ connectionString: 'postgres://dev:dev@localhost:5432/terp' });
const prisma = new PrismaClient({ adapter });
async function main() {
  console.log('Departments:', await prisma.department.count());
  console.log('Teams:', await prisma.team.count());
  console.log('TeamMembers:', await prisma.teamMember.count());
  console.log('CostCenters:', await prisma.costCenter.count());
  console.log('Locations:', await prisma.location.count());
  console.log('EmploymentTypes:', await prisma.employmentType.count());
  console.log('Holidays:', await prisma.holiday.count());
  console.log('Accounts:', await prisma.account.count());
  console.log('AccountGroups:', await prisma.accountGroup.count());
  await prisma.\$disconnect();
}
main().catch(console.error);
"
```

**Expected**: Prints counts without errors, confirming all column mappings are correct.

#### 5.3 Verify Self-Reference Works

```bash
cd apps/web && npx tsx -e "
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './src/generated/prisma/client.js';
const adapter = new PrismaPg({ connectionString: 'postgres://dev:dev@localhost:5432/terp' });
const prisma = new PrismaClient({ adapter });
async function main() {
  const deptWithChildren = await prisma.department.findFirst({
    where: { parentId: null },
    include: { children: true }
  });
  console.log('Root department:', deptWithChildren?.name, 'children:', deptWithChildren?.children?.length ?? 0);
  await prisma.\$disconnect();
}
main().catch(console.error);
"
```

#### 5.4 Verify Account -> AccountGroup Relation

```bash
cd apps/web && npx tsx -e "
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './src/generated/prisma/client.js';
const adapter = new PrismaPg({ connectionString: 'postgres://dev:dev@localhost:5432/terp' });
const prisma = new PrismaClient({ adapter });
async function main() {
  const accountWithGroup = await prisma.account.findFirst({
    where: { accountGroupId: { not: null } },
    include: { accountGroup: true }
  });
  console.log('Account:', accountWithGroup?.name, 'Group:', accountWithGroup?.accountGroup?.name ?? 'none');
  await prisma.\$disconnect();
}
main().catch(console.error);
"
```

### Phase 5 Verification

All manual verification scripts should execute without errors. If any column mapping is wrong, Prisma will throw a runtime error with a descriptive message about the column mismatch.

---

## Complete Schema File Outline

After all phases, the final `apps/web/prisma/schema.prisma` will contain:

```
// Header comment (READ-ONLY)
generator client { ... }
datasource db { ... }

// Existing models (TICKET-200):
model User { ... }          // ~35 fields
model Tenant { ... }        // ~15 fields + new reverse relations
model UserGroup { ... }     // ~11 fields
model UserTenant { ... }    // ~4 fields, composite PK

// New models (TICKET-204):
model CostCenter { ... }    // ~8 fields
model Location { ... }      // ~12 fields
model EmploymentType { ... } // ~9 fields
model Holiday { ... }       // ~9 fields
model AccountGroup { ... }  // ~9 fields
model Account { ... }       // ~18 fields
model Department { ... }    // ~10 fields, self-reference
model Team { ... }          // ~9 fields
model TeamMember { ... }    // ~4 fields, composite PK
```

**Total**: 13 models.

---

## File Summary

### Files to Modify
| File | Change |
|------|--------|
| `apps/web/prisma/schema.prisma` | Add 9 new models; add reverse relation fields to Tenant model |

### Files Auto-Generated (by `prisma generate`)
| File | Change |
|------|--------|
| `apps/web/src/generated/prisma/client.ts` | Updated with new model types |
| `apps/web/src/generated/prisma/models.ts` | Updated with new model exports |
| `apps/web/src/generated/prisma/models/*.ts` | 9 new model type files |

### Files NOT Modified
- No Go files modified or deleted
- No SQL migrations created
- No existing TypeScript source files modified (only auto-generated files change)
- No database data modified

---

## Test Strategy

### Existing Tests (Must Continue to Pass)
- `apps/web/src/server/__tests__/trpc.test.ts` — imports Prisma types for mock context
- `apps/web/src/server/__tests__/authorization.test.ts` — imports UserGroup type
- `apps/web/src/server/__tests__/permission-helpers.test.ts` — imports UserGroup type
- `apps/web/src/server/__tests__/procedures.test.ts` — imports mock context
- `apps/web/src/server/__tests__/helpers.ts` — mock factories using Prisma types

These tests import from `@/generated/prisma/client` and use only User, Tenant, UserGroup, UserTenant types. Adding new models should NOT break these imports.

### New Tests (Not Required for This Ticket)
The ticket mentions unit tests for reading data, but the existing test infrastructure uses **mock** Prisma clients (no actual DB connections in tests). Writing tests that actually read from the DB would require:
1. A test DB setup (not yet established for the web app)
2. Test data seeding

This is out of scope for TICKET-204. The verification scripts in Phase 5 serve as manual integration tests. When tRPC routers are added (TICKET-211, 212, 213), proper tests with DB access will be established.

However, if the team wants to add a lightweight type-level test to ensure the generated types are correct, a simple type assertion test could be added:

```typescript
// apps/web/src/server/__tests__/prisma-types.test.ts (OPTIONAL)
import type {
  Department, Team, TeamMember, CostCenter, Location,
  EmploymentType, Holiday, Account, AccountGroup
} from "@/generated/prisma/client"

describe("Prisma org model types", () => {
  it("Department type has expected fields", () => {
    const dept = {} as Department
    // Type-level assertions — these fail at compile time, not runtime
    const _id: string = dept.id
    const _tenantId: string = dept.tenantId
    const _parentId: string | null = dept.parentId
    const _code: string = dept.code
    const _name: string = dept.name
    const _managerEmployeeId: string | null = dept.managerEmployeeId
    const _isActive: boolean = dept.isActive
    expect(true).toBe(true) // Placeholder — real test is compile-time
  })

  it("TeamMember has composite key fields", () => {
    const tm = {} as TeamMember
    const _teamId: string = tm.teamId
    const _employeeId: string = tm.employeeId
    const _role: string = tm.role
    expect(true).toBe(true)
  })

  it("Account has all DB fields", () => {
    const acc = {} as Account
    const _tenantId: string | null = acc.tenantId
    const _accountType: string = acc.accountType
    const _displayFormat: string = acc.displayFormat
    const _sortOrder: number = acc.sortOrder
    const _yearCarryover: boolean = acc.yearCarryover
    const _isPayrollRelevant: boolean = acc.isPayrollRelevant
    expect(true).toBe(true)
  })
})
```

This is optional and can be deferred to TICKET-211+.

---

## Unique Constraint Name Convention

The existing TICKET-200 models use the PostgreSQL auto-generated constraint names (e.g., `"idx_users_tenant_email"` for index map names). For `@@unique` constraints on the new models, the auto-generated names from `CREATE TABLE ... UNIQUE(col1, col2)` follow the PostgreSQL pattern: `{table}_{col1}_{col2}_key`. We use these names in the `map:` parameter:

- `cost_centers_tenant_id_code_key`
- `locations_tenant_id_code_key`
- `holidays_tenant_id_holiday_date_key`
- `account_groups_tenant_id_code_key`
- `accounts_tenant_id_code_key`
- `departments_tenant_id_code_key`
- `teams_tenant_id_name_key`

**IMPORTANT**: These names should be verified against the actual database. If the auto-generated name differs, adjust accordingly. Run `\d+ table_name` in psql to check constraint names if unsure.

---

## Dependency on TICKET-205 (Employee)

When TICKET-205 adds the Employee model to Prisma, the following changes will be needed in the TICKET-204 models:

1. **Department**: Add `manager Employee? @relation("DepartmentManager", fields: [managerEmployeeId], references: [id], onDelete: SetNull)`
2. **Team**: Add `leader Employee? @relation("TeamLeader", fields: [leaderEmployeeId], references: [id], onDelete: SetNull)`
3. **TeamMember**: Add `employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)`

These are forward-looking notes, not changes to make in this ticket.

---

## Acceptance Criteria Checklist

| Criteria | Phase | How Verified |
|----------|-------|-------------|
| All 9 models defined in Prisma SDL | Phase 1-3 | `prisma validate` |
| Self-reference for Department (parent/children) works | Phase 2 | `prisma validate` + Phase 5.3 manual test |
| Team <-> TeamMember <-> Employee relations correct | Phase 3 | `prisma validate` (Employee bare UUID, relation deferred to TICKET-205) |
| Account <-> AccountGroup relation correct | Phase 1 | `prisma validate` + Phase 5.4 manual test |
| `prisma generate` succeeds | Phase 4 | `prisma generate` exit 0 |
| Existing DB data not changed | All | No `prisma db push`, no migrations, read-only schema |
| TypeScript types available for all models | Phase 4 | `pnpm typecheck` exit 0 |
