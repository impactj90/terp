---
date: 2026-03-03T12:00:00+01:00
researcher: claude
git_commit: feca590a
branch: staging
repository: terp
topic: "ZMI-TICKET-204: Prisma Schema Org Tables — Current Codebase State"
tags: [research, codebase, prisma, migration, departments, teams, cost-centers, locations, employment-types, holidays, accounts, account-groups]
status: complete
last_updated: 2026-03-03
last_updated_by: claude
---

# Research: ZMI-TICKET-204 — Prisma Schema Org Tables

**Date**: 2026-03-03
**Git Commit**: feca590a
**Branch**: staging
**Repository**: terp

## Research Question

Document the current state of the organization tables (departments, teams, team_members, cost_centers, locations, employment_types, holidays, accounts, account_groups) across Go models, SQL migrations, and the existing Prisma setup -- as context for adding these models to the Prisma schema in ZMI-TICKET-204.

## Summary

The Prisma schema at `apps/web/prisma/schema.prisma` currently contains 4 models (User, Tenant, UserGroup, UserTenant) established in ZMI-TICKET-200. The 9 organization tables targeted by TICKET-204 all exist in the PostgreSQL database via SQL migrations and have corresponding Go/GORM model structs. The Employee model does NOT exist in Prisma yet (planned for TICKET-205) and is referenced by Department (manager_employee_id), Team (leader_employee_id), and TeamMember (employee_id). The Prisma schema uses a read-only pattern against the existing DB -- no `prisma db push` or `prisma migrate dev` is used.

## Detailed Findings

### 1. Current Prisma Schema

**File**: `apps/web/prisma/schema.prisma`

The schema contains:
- A header comment marking it as READ-ONLY against the existing PostgreSQL database
- `generator client` with `provider = "prisma-client"` and output to `../src/generated/prisma`
- `datasource db` with `provider = "postgresql"` (no direct URL in schema; uses `DATABASE_URL` env var)
- 4 models: `User`, `Tenant`, `UserGroup`, `UserTenant`
- No enum definitions

**Conventions established in TICKET-200**:
- camelCase field names with `@map("snake_case_column")` for DB column mapping
- `@@map("table_name")` for table name mapping
- `@db.Uuid` type annotation on UUID columns
- `@db.VarChar(N)` and `@db.Text` for string column types
- `@db.Timestamptz(6)` for timestamp columns
- `@db.JsonB` for JSON columns
- `@default(dbgenerated("gen_random_uuid()"))` for UUID primary keys (matching actual DB default)
- `@default(now())` for created_at, `@updatedAt` for updated_at
- Block comments above each model documenting migration numbers, CHECK constraints, and DB-only features (partial indexes, triggers) that cannot be modeled in Prisma
- `@@index` with explicit `map:` names matching existing DB index names
- `@@unique` with explicit `map:` for existing unique constraints
- Relations declared with explicit `fields` and `references`

**Generated output**: `apps/web/src/generated/prisma/` contains `client.ts`, `models.ts`, `enums.ts`, `browser.ts`, `commonInputTypes.ts`, and per-model files in `models/` subdirectory. Currently generates types for User, Tenant, UserGroup, UserTenant only.

### 2. Existing Go Models

#### `department.go` (42 lines)
- **Struct fields**: ID, TenantID, ParentID (*uuid), Code, Name, Description, ManagerEmployeeID (*uuid), IsActive, CreatedAt, UpdatedAt
- **Relations**: Parent (*Department), Children ([]Department), Manager (*Employee)
- **Methods**: TableName(), IsRoot(), GetPath() (placeholder)
- **Key**: Self-referential tree via ParentID; manager is an Employee FK

#### `team.go` (52 lines)
- **Struct fields (Team)**: ID, TenantID, DepartmentID (*uuid), Name, Description, LeaderEmployeeID (*uuid), IsActive, MemberCount (computed, gorm:"-"), CreatedAt, UpdatedAt
- **Relations**: Department (*Department), Leader (*Employee), Members ([]TeamMember)
- **Struct fields (TeamMember)**: TeamID, EmployeeID (composite PK), JoinedAt, Role (TeamMemberRole)
- **TeamMemberRole enum**: "member", "lead", "deputy"
- **Methods**: Team.TableName(), TeamMember.TableName()

#### `costcenter.go` (22 lines)
- **Struct fields**: ID, TenantID, Code, Name, Description, IsActive, CreatedAt, UpdatedAt
- **Methods**: TableName()

#### `location.go` (28 lines)
- **Struct fields**: ID, TenantID, Code, Name, Description, Address, City, Country, Timezone, IsActive, CreatedAt, UpdatedAt
- **Methods**: TableName()

#### `employmenttype.go` (27 lines)
- **Struct fields**: ID, TenantID (*uuid, nullable), Code, Name, DefaultWeeklyHours (decimal.Decimal, column: weekly_hours_default), IsActive, VacationCalcGroupID (*uuid), CreatedAt, UpdatedAt
- **Relations**: VacationCalcGroup (*VacationCalculationGroup)
- **Methods**: TableName()
- **Key**: TenantID is nullable (NULL = system-wide type visible to all tenants)

#### `holiday.go` (23 lines)
- **Struct fields**: ID, TenantID, HolidayDate (time.Time, type:date), Name, Category (int, column: holiday_category, default:1), AppliesToAll (bool), DepartmentID (*uuid), CreatedAt, UpdatedAt
- **Methods**: TableName()
- **Key**: No is_half_day column (removed in migration 000038, replaced by holiday_category with CHECK constraint 1/2/3)

#### `account.go` (63 lines)
- **Struct fields**: ID, TenantID (*uuid, nullable), Code, Name, Description (*string), AccountType (AccountType enum), Unit (AccountUnit enum), DisplayFormat (DisplayFormat enum), BonusFactor (*float64), AccountGroupID (*uuid), YearCarryover (bool), IsPayrollRelevant (bool), PayrollCode (*string), SortOrder (int), UsageCount (computed, gorm:"-"), IsSystem (bool), IsActive (bool), CreatedAt, UpdatedAt
- **AccountType enum**: "bonus", "day", "month"
- **AccountUnit enum**: "minutes", "hours", "days"
- **DisplayFormat enum**: "decimal", "hh_mm"
- **Related struct**: AccountUsageDayPlan (ID, Code, Name) -- display-only
- **Methods**: TableName()
- **Key**: TenantID is nullable (NULL = system account)

#### `accountgroup.go` (24 lines)
- **Struct fields**: ID, TenantID, Code, Name, Description (*string), SortOrder (int), IsActive (bool), CreatedAt, UpdatedAt
- **Methods**: TableName()

### 3. Database Migrations

#### departments table
| Migration | Operation |
|-----------|-----------|
| `000009_create_departments` | CREATE TABLE: id, tenant_id (FK tenants, CASCADE), parent_id (FK departments, SET NULL), code VARCHAR(50), name VARCHAR(255), description TEXT, manager_employee_id UUID (no FK yet), is_active, timestamps. UNIQUE(tenant_id, code). Indexes: idx_departments_tenant, idx_departments_parent, idx_departments_active(tenant_id, is_active) |
| `000014_link_users_employees` | ADD CONSTRAINT fk_departments_manager FK(manager_employee_id) REFERENCES employees(id) ON DELETE SET NULL |

**Actual DB columns**: id, tenant_id, parent_id, code, name, description, manager_employee_id, is_active, created_at, updated_at

#### teams / team_members tables
| Migration | Operation |
|-----------|-----------|
| `000010_create_teams` | CREATE TABLE teams: id, tenant_id (FK tenants, CASCADE), department_id (FK departments, SET NULL), name VARCHAR(255), description TEXT, leader_employee_id UUID (no FK yet), is_active, timestamps. UNIQUE(tenant_id, name). CREATE TABLE team_members: team_id (FK teams, CASCADE), employee_id UUID (no FK yet), joined_at, role VARCHAR(50) DEFAULT 'member'. PRIMARY KEY (team_id, employee_id). Indexes: idx_teams_tenant, idx_teams_department, idx_team_members_employee |
| `000014_link_users_employees` | ADD CONSTRAINT fk_teams_leader FK(leader_employee_id) REFERENCES employees(id) ON DELETE SET NULL. ADD CONSTRAINT fk_team_members_employee FK(employee_id) REFERENCES employees(id) ON DELETE CASCADE |

**Actual teams columns**: id, tenant_id, department_id, name, description, leader_employee_id, is_active, created_at, updated_at
**Actual team_members columns**: team_id, employee_id, joined_at, role

#### cost_centers table
| Migration | Operation |
|-----------|-----------|
| `000004_create_cost_centers` | CREATE TABLE: id, tenant_id (FK tenants, CASCADE), code VARCHAR(50), name VARCHAR(255), description TEXT, is_active, timestamps. UNIQUE(tenant_id, code). Indexes: idx_cost_centers_tenant, idx_cost_centers_active(tenant_id, is_active) |

**Actual DB columns**: id, tenant_id, code, name, description, is_active, created_at, updated_at

#### locations table
| Migration | Operation |
|-----------|-----------|
| `000082_create_locations` | CREATE TABLE: id, tenant_id (FK tenants, no CASCADE), code VARCHAR(20), name VARCHAR(255), description TEXT DEFAULT '', address TEXT DEFAULT '', city VARCHAR(255) DEFAULT '', country VARCHAR(100) DEFAULT '', timezone VARCHAR(100) DEFAULT '', is_active BOOLEAN NOT NULL DEFAULT true, timestamps NOT NULL. UNIQUE(tenant_id, code). Index: idx_locations_tenant_id |

**Actual DB columns**: id, tenant_id, code, name, description, address, city, country, timezone, is_active, created_at, updated_at

#### employment_types table
| Migration | Operation |
|-----------|-----------|
| `000005_create_employment_types` | CREATE TABLE: id, tenant_id (FK tenants, CASCADE, NOT NULL), code VARCHAR(50), name VARCHAR(255), weekly_hours_default DECIMAL(5,2) DEFAULT 40.00, is_active, timestamps. UNIQUE(tenant_id, code). Index: idx_employment_types_tenant |
| `000049_create_vacation_calculation_groups` | ADD COLUMN vacation_calc_group_id UUID REFERENCES vacation_calculation_groups(id) ON DELETE SET NULL. Index: idx_employment_types_vacation_calc_group |
| `000088_employment_types_nullable_tenant_and_defaults` | ALTER tenant_id DROP NOT NULL. Drop old unique constraint. CREATE UNIQUE INDEX idx_employment_types_tenant_code ON (COALESCE(tenant_id, '00000000-...'), code). Seed 6 system types (VZ, TZ, MINI, AZUBI, WERK, PRAKT) with tenant_id=NULL |

**Actual DB columns**: id, tenant_id (nullable), code, name, weekly_hours_default, is_active, vacation_calc_group_id, created_at, updated_at
**COALESCE unique index**: Cannot be modeled in Prisma (same pattern as UserGroup)

#### holidays table
| Migration | Operation |
|-----------|-----------|
| `000003_create_holidays` | CREATE TABLE: id, tenant_id (FK tenants, CASCADE), holiday_date DATE, name VARCHAR(255), is_half_day BOOLEAN DEFAULT false, applies_to_all BOOLEAN DEFAULT true, department_id UUID, timestamps. UNIQUE(tenant_id, holiday_date). Indexes: idx_holidays_tenant_date, idx_holidays_date_range. Trigger: update_holidays_updated_at |
| `000038_add_holiday_category` | ADD COLUMN holiday_category INT NOT NULL DEFAULT 1. Backfill from is_half_day. ADD CONSTRAINT holidays_category_check CHECK (holiday_category IN (1, 2, 3)). DROP COLUMN is_half_day |

**Actual DB columns**: id, tenant_id, holiday_date, name, holiday_category, applies_to_all, department_id, created_at, updated_at
**CHECK constraint**: holiday_category IN (1, 2, 3) -- enforced at DB level only

#### accounts table
| Migration | Operation |
|-----------|-----------|
| `000006_create_accounts` | CREATE TABLE: id, tenant_id (FK tenants, CASCADE, nullable), code VARCHAR(50), name VARCHAR(255), account_type VARCHAR(20), unit VARCHAR(20) DEFAULT 'minutes', is_system BOOLEAN DEFAULT false, is_active, timestamps. UNIQUE(tenant_id, code). Index: idx_accounts_tenant. Seed 3 system accounts (FLEX, OT, VAC) with tenant_id=NULL |
| `000033_add_account_fields` | ADD COLUMNS: description TEXT, is_payroll_relevant BOOLEAN DEFAULT false, payroll_code VARCHAR(50), sort_order INT DEFAULT 0, year_carryover BOOLEAN DEFAULT true |
| `000043_account_groups_and_fields` | ADD COLUMNS: account_group_id UUID (FK account_groups, SET NULL), display_format VARCHAR(20) NOT NULL DEFAULT 'decimal', bonus_factor NUMERIC(5,2). Index: idx_accounts_group. UPDATE account_type values: 'tracking' -> 'day', 'balance' -> 'month' |

**Actual DB columns**: id, tenant_id (nullable), code, name, account_type, unit, is_system, is_active, description, is_payroll_relevant, payroll_code, sort_order, year_carryover, account_group_id, display_format, bonus_factor, created_at, updated_at

#### account_groups table
| Migration | Operation |
|-----------|-----------|
| `000043_account_groups_and_fields` | CREATE TABLE: id, tenant_id (FK tenants, CASCADE), code VARCHAR(50), name VARCHAR(255), description TEXT, is_active, sort_order INT DEFAULT 0, timestamps. UNIQUE(tenant_id, code). Index: idx_account_groups_tenant. Trigger: update_account_groups_updated_at |

**Actual DB columns**: id, tenant_id, code, name, description, is_active, sort_order, created_at, updated_at

### 4. Prisma Configuration

**Schema file**: `apps/web/prisma/schema.prisma`
**Generator**: `prisma-client` (Prisma 7.x), output to `../src/generated/prisma`
**Datasource**: `postgresql`, connection via `DATABASE_URL` env var
**Dev DB URL**: `postgres://dev:dev@localhost:5432/terp` (from `.env.example`)

**Package.json scripts** (`apps/web/package.json`):
- `db:generate`: `prisma generate`
- `db:pull`: `prisma db pull`
- `db:studio`: `prisma studio`
- `postinstall`: `prisma generate` (auto-runs on `pnpm install`)

**Dependencies**:
- `prisma`: `^7.4.2` (devDependencies)
- `@prisma/client`: `^7.4.2` (dependencies)
- `@prisma/adapter-pg`: `^7.4.2` (dependencies, PrismaPg driver adapter for Prisma 7)
- `pg`: `^8.19.0` (dependencies, PostgreSQL client)

**Prisma Client singleton**: `apps/web/src/lib/db/prisma.ts`
- Uses `PrismaPg` adapter with `process.env.DATABASE_URL`
- Singleton pattern for dev hot-reload safety
- Exported via `apps/web/src/lib/db/index.ts`
- Injected into tRPC context via `apps/web/src/server/trpc.ts` as `ctx.prisma`

### 5. Employee Model Status

**In Prisma**: The Employee model does NOT exist in the Prisma schema. It is planned for ZMI-TICKET-205.

**In Go**: `apps/api/internal/model/employee.go` defines a comprehensive Employee struct (86 lines) with 40+ fields including FKs to Department, CostCenter, EmploymentType, Tariff, and various group entities.

**Impact on TICKET-204**: Three of the org models reference Employee:
- `departments.manager_employee_id` -> FK to employees(id) ON DELETE SET NULL
- `teams.leader_employee_id` -> FK to employees(id) ON DELETE SET NULL
- `team_members.employee_id` -> FK to employees(id) ON DELETE CASCADE

Since Employee does not yet exist in Prisma, the ticket's proposed schema includes `Employee` in the relation annotations (`employees Employee[]`, `employee Employee @relation(...)`, `manager Employee @relation(...)`). These relation declarations will require the Employee model to exist in the schema for `prisma generate` to succeed.

### 6. Ticket's Proposed Schema vs. Actual DB Schema -- Discrepancies

| Model | Ticket Schema | Actual DB Schema | Discrepancy |
|-------|--------------|-------------------|-------------|
| **Department** | id, tenant_id, name, code?, parent_id?, is_active, sort_order, created_at, updated_at, deleted_at | id, tenant_id, parent_id, code (NOT NULL), name, description, manager_employee_id, is_active, created_at, updated_at | Missing: description, manager_employee_id. Extra: sort_order (not in DB), deleted_at (not in DB). code should be non-nullable |
| **Team** | id, tenant_id, name, description?, is_active, created_at, updated_at, deleted_at | id, tenant_id, department_id, name, description, leader_employee_id, is_active, created_at, updated_at | Missing: department_id, leader_employee_id. Extra: deleted_at (not in DB) |
| **TeamMember** | id (UUID PK), team_id, employee_id, role?, joined_at | team_id, employee_id (composite PK), joined_at, role DEFAULT 'member' | Ticket adds surrogate `id` PK; actual DB uses composite PK (team_id, employee_id). No `id` column exists |
| **CostCenter** | id, tenant_id, name, code, is_active, created_at, updated_at, deleted_at | id, tenant_id, code, name, description, is_active, created_at, updated_at | Missing: description. Extra: deleted_at (not in DB) |
| **Location** | id, tenant_id, name, code?, address?, is_active, created_at, updated_at, deleted_at | id, tenant_id, code (NOT NULL), name, description, address, city, country, timezone, is_active, created_at, updated_at | Missing: description, city, country, timezone. code should be non-nullable. Extra: deleted_at (not in DB) |
| **EmploymentType** | id, tenant_id, name, code?, is_active, created_at, updated_at, deleted_at | id, tenant_id (nullable), code (NOT NULL), name, weekly_hours_default, is_active, vacation_calc_group_id, created_at, updated_at | Missing: weekly_hours_default, vacation_calc_group_id. tenant_id should be nullable. code should be non-nullable. Extra: deleted_at (not in DB) |
| **Holiday** | id, tenant_id, name, date (Date), half_day, state?, year, created_at, updated_at, deleted_at | id, tenant_id, holiday_date (DATE), name, holiday_category (INT, CHECK 1/2/3), applies_to_all, department_id, created_at, updated_at | Major differences: half_day does not exist (replaced by holiday_category INT). state/year do not exist. Missing: holiday_category, applies_to_all, department_id. Extra: deleted_at (not in DB) |
| **Account** | id, tenant_id, name, code, description?, account_type, unit?, is_system, is_active, account_group_id?, created_at, updated_at, deleted_at | id, tenant_id (nullable), code, name, account_type, unit (NOT NULL, default 'minutes'), is_system, is_active, description, is_payroll_relevant, payroll_code, sort_order, year_carryover, account_group_id, display_format, bonus_factor, created_at, updated_at | tenant_id should be nullable. Missing: is_payroll_relevant, payroll_code, sort_order, year_carryover, display_format, bonus_factor. unit should be non-nullable. Extra: deleted_at (not in DB) |
| **AccountGroup** | id, tenant_id, name, code?, sort_order, created_at, updated_at, deleted_at | id, tenant_id, code (NOT NULL), name, description, is_active, sort_order, created_at, updated_at | Missing: description, is_active. code should be non-nullable. Extra: deleted_at (not in DB) |

**Common pattern**: The ticket's proposed schema adds `deleted_at DateTime?` to every model, but none of these tables have a `deleted_at` column in the actual database. The existing core models (User has deleted_at, Tenant does not) show that soft delete is not universally applied.

### 7. Existing Tests for Prisma Models

**No direct Prisma model tests exist**. The test files in `apps/web/src/server/__tests__/` test tRPC procedures and authorization middleware, using mock Prisma clients:

- `trpc.test.ts`: Tests protectedProcedure and tenantProcedure with `prisma: {} as TRPCContext["prisma"]` mocks
- `authorization.test.ts`: Tests permission checking with mock UserGroup types from Prisma
- `permission-helpers.test.ts`: Tests permission helper utilities with mock UserGroup types
- `procedures.test.ts`: Tests procedure chains with mock context
- `helpers.ts`: Shared mock factories (`createMockUser`, `createMockContext`, `createMockUserGroup`, `createMockTenant`, `createMockUserTenant`) that use Prisma-generated types

The tests import types from `@/generated/prisma/client` but do not instantiate actual PrismaClient instances or query the database.

### 8. Unique Constraints and Indexes (from migrations)

| Table | Unique Constraint | Index(es) |
|-------|-------------------|-----------|
| departments | UNIQUE(tenant_id, code) | idx_departments_tenant, idx_departments_parent, idx_departments_active(tenant_id, is_active) |
| teams | UNIQUE(tenant_id, name) | idx_teams_tenant, idx_teams_department |
| team_members | PRIMARY KEY(team_id, employee_id) | idx_team_members_employee |
| cost_centers | UNIQUE(tenant_id, code) | idx_cost_centers_tenant, idx_cost_centers_active(tenant_id, is_active) |
| locations | UNIQUE(tenant_id, code) | idx_locations_tenant_id |
| employment_types | COALESCE unique index(COALESCE(tenant_id, '0...'), code) | idx_employment_types_tenant, idx_employment_types_vacation_calc_group |
| holidays | UNIQUE(tenant_id, holiday_date) | idx_holidays_tenant_date, idx_holidays_date_range |
| accounts | UNIQUE(tenant_id, code) | idx_accounts_tenant, idx_accounts_group |
| account_groups | UNIQUE(tenant_id, code) | idx_account_groups_tenant |

### 9. Foreign Key Relationships (from migrations)

```
departments.tenant_id       -> tenants(id) ON DELETE CASCADE
departments.parent_id       -> departments(id) ON DELETE SET NULL
departments.manager_employee_id -> employees(id) ON DELETE SET NULL

teams.tenant_id             -> tenants(id) ON DELETE CASCADE
teams.department_id         -> departments(id) ON DELETE SET NULL
teams.leader_employee_id    -> employees(id) ON DELETE SET NULL

team_members.team_id        -> teams(id) ON DELETE CASCADE
team_members.employee_id    -> employees(id) ON DELETE CASCADE

cost_centers.tenant_id      -> tenants(id) ON DELETE CASCADE

locations.tenant_id         -> tenants(id) (no ON DELETE clause)

employment_types.tenant_id  -> tenants(id) ON DELETE CASCADE (nullable)
employment_types.vacation_calc_group_id -> vacation_calculation_groups(id) ON DELETE SET NULL

holidays.tenant_id          -> tenants(id) ON DELETE CASCADE
holidays.department_id      -> (no FK constraint in migrations, just UUID column)

accounts.tenant_id          -> tenants(id) ON DELETE CASCADE (nullable)
accounts.account_group_id   -> account_groups(id) ON DELETE SET NULL

account_groups.tenant_id    -> tenants(id) ON DELETE CASCADE
```

### 10. DB Triggers

- `holidays`: `update_holidays_updated_at` BEFORE UPDATE trigger
- `account_groups`: `update_account_groups_updated_at` BEFORE UPDATE trigger
- Other tables rely on GORM's auto-update behavior or the general `update_updated_at_column()` trigger (created in migration 000001)

## Code References

- `apps/web/prisma/schema.prisma` -- Current Prisma schema (4 models)
- `apps/web/src/generated/prisma/` -- Generated Prisma client and type files
- `apps/web/src/lib/db/prisma.ts` -- Prisma Client singleton with PrismaPg adapter
- `apps/web/src/server/trpc.ts` -- tRPC context with Prisma injection
- `apps/web/package.json` -- Prisma scripts (db:generate, db:pull, db:studio, postinstall)
- `apps/web/.env.example` -- DATABASE_URL configuration
- `apps/api/internal/model/department.go` -- Go Department model (42 lines)
- `apps/api/internal/model/team.go` -- Go Team + TeamMember models (52 lines)
- `apps/api/internal/model/costcenter.go` -- Go CostCenter model (22 lines)
- `apps/api/internal/model/location.go` -- Go Location model (28 lines)
- `apps/api/internal/model/employmenttype.go` -- Go EmploymentType model (27 lines)
- `apps/api/internal/model/holiday.go` -- Go Holiday model (23 lines)
- `apps/api/internal/model/account.go` -- Go Account model (63 lines)
- `apps/api/internal/model/accountgroup.go` -- Go AccountGroup model (24 lines)
- `apps/api/internal/model/employee.go` -- Go Employee model (86 lines, referenced by Dept/Team/TeamMember)
- `db/migrations/000003_create_holidays.up.sql` -- Holidays table creation
- `db/migrations/000004_create_cost_centers.up.sql` -- Cost centers table creation
- `db/migrations/000005_create_employment_types.up.sql` -- Employment types table creation
- `db/migrations/000006_create_accounts.up.sql` -- Accounts table creation + system account seeding
- `db/migrations/000009_create_departments.up.sql` -- Departments table creation
- `db/migrations/000010_create_teams.up.sql` -- Teams + team_members table creation
- `db/migrations/000014_link_users_employees.up.sql` -- Adds FK constraints for manager_employee_id, leader_employee_id, team_members.employee_id
- `db/migrations/000033_add_account_fields.up.sql` -- Adds description, payroll, sort_order, year_carryover to accounts
- `db/migrations/000038_add_holiday_category.up.sql` -- Replaces is_half_day with holiday_category (1/2/3)
- `db/migrations/000043_account_groups_and_fields.up.sql` -- Creates account_groups table, adds account_group_id/display_format/bonus_factor to accounts
- `db/migrations/000049_create_vacation_calculation_groups.up.sql` -- Creates vacation_calculation_groups table, adds vacation_calc_group_id to employment_types
- `db/migrations/000082_create_locations.up.sql` -- Locations table creation
- `db/migrations/000088_employment_types_nullable_tenant_and_defaults.up.sql` -- Makes employment_types.tenant_id nullable, seeds system types
- `thoughts/shared/research/2026-03-02-ZMI-TICKET-200-prisma-schema-core-foundation.md` -- TICKET-200 research showing Prisma conventions
- `thoughts/shared/tickets/ZMI-TICKET-204-prisma-schema-org-tabellen.md` -- This ticket's requirements
