---
date: 2026-03-03T15:00:00+01:00
researcher: claude
git_commit: 6432848d
branch: staging
repository: terp
topic: "ZMI-TICKET-205: Prisma Schema Employee — Current Codebase State"
tags: [research, codebase, prisma, migration, employee, employee-contact, employee-card, employee-tariff-assignment]
status: complete
last_updated: 2026-03-03
last_updated_by: claude
---

# Research: ZMI-TICKET-205 — Prisma Schema Employee

**Date**: 2026-03-03
**Git Commit**: 6432848d
**Branch**: staging
**Repository**: terp

## Research Question

Document the current state of the employee tables (employees, employee_contacts, employee_cards, employee_tariff_assignments) across Go models, SQL migrations, existing Prisma schema, and related models -- as context for adding the Employee model and sub-entities to the Prisma schema in ZMI-TICKET-205.

## Summary

The Prisma schema at `apps/web/prisma/schema.prisma` currently contains 13 models (User, Tenant, UserGroup, UserTenant, CostCenter, Location, EmploymentType, Holiday, AccountGroup, Account, Department, Team, TeamMember) established in ZMI-TICKET-200 and ZMI-TICKET-204. The Employee model does NOT exist in Prisma yet. Three existing Prisma models (Department, Team, TeamMember) have `employeeId`/`managerEmployeeId`/`leaderEmployeeId` columns modeled as bare UUIDs with comments explicitly noting "Employee model not yet in Prisma (TICKET-205). Relation will be added then." The User model has an `employeeId` field that references employees(id) via FK in the database. The Go Employee model has 40+ fields across the base migration and two ALTER TABLE migrations. The `employee_contacts` table has an additional `contact_kind_id` FK added in migration 000069. The `employee_cards` table has a `tenant_id` column and a composite unique constraint on (tenant_id, card_number). The `employee_tariff_assignments` table has an `overwrite_behavior` VARCHAR(20) column with CHECK constraint not present in the ticket's proposed schema.

## Detailed Findings

### 1. Current Prisma Schema

**File**: `apps/web/prisma/schema.prisma` (454 lines)

**Current models** (13 total):
1. User (lines 28-63)
2. Tenant (lines 75-110)
3. UserGroup (lines 123-143)
4. UserTenant (lines 152-165)
5. CostCenter (lines 173-191)
6. Location (lines 199-220)
7. EmploymentType (lines 233-253)
8. Holiday (lines 265-286)
9. AccountGroup (lines 294-313)
10. Account (lines 327-356)
11. Department (lines 366-392)
12. Team (lines 401-424)
13. TeamMember (lines 436-453)

**Established conventions**:
- camelCase field names with `@map("snake_case_column")` for DB column mapping
- `@@map("table_name")` for table name mapping
- `@db.Uuid` type annotation on all UUID columns
- `@db.VarChar(N)` and `@db.Text` for string column types
- `@db.Timestamptz(6)` for timestamp columns
- `@db.Decimal(precision, scale)` for decimal columns (see CostCenter: none; EmploymentType: `@db.Decimal(5, 2)`)
- `@db.JsonB` for JSON columns
- `@db.Date` for date-only columns (see Holiday.holidayDate)
- `@db.Integer` for integer columns (see Holiday.holidayCategory, AccountGroup.sortOrder)
- `@default(dbgenerated("gen_random_uuid()"))` for UUID primary keys
- `@default(now())` for created_at; combined `@default(now()) @updatedAt` for updated_at
- Block comments above each model documenting migration numbers, CHECK constraints, triggers, and DB-only features (partial indexes, COALESCE indexes) that cannot be modeled in Prisma
- `@@index` with explicit `map:` names matching existing DB index names
- `@@unique` with explicit `map:` names for existing unique constraints
- Relations declared with explicit `fields` and `references`, including `onDelete` behavior
- Boolean fields: `Boolean` with `@default(true)` or `@default(false)`
- Nullable fields: use `?` suffix (e.g., `String?`, `DateTime?`)

**Header comment** (lines 1-4):
```
// Prisma Schema for Terp — Core Foundation (ZMI-TICKET-200)
// This schema is READ-ONLY against the existing PostgreSQL database.
// DO NOT run `prisma db push` or `prisma migrate dev`.
// Schema changes are managed via SQL migrations in db/migrations/.
```

**Generated output**: `apps/web/src/generated/prisma/` contains:
- `client.ts` -- PrismaClient class with type exports for all 13 models
- `models.ts` -- Barrel export of all model types
- `models/` -- Per-model type files (User.ts, Tenant.ts, Department.ts, etc.)
- `enums.ts` -- Empty (no enums in schema)
- `browser.ts` -- Browser-safe exports
- `commonInputTypes.ts` -- Shared input types
- `internal/` -- Internal Prisma namespace and class files

### 2. Existing Go Employee Models

#### `apps/api/internal/model/employee.go` (157 lines)

**Employee struct** (lines 11-86, 46 data fields + 12 relation fields):

Core fields (migration 000011):
- `ID` uuid.UUID -- PK, gen_random_uuid()
- `TenantID` uuid.UUID -- NOT NULL, FK tenants
- `PersonnelNumber` string -- VARCHAR(50), NOT NULL
- `PIN` string -- VARCHAR(20), NOT NULL
- `FirstName` string -- VARCHAR(100), NOT NULL
- `LastName` string -- VARCHAR(100), NOT NULL
- `Email` string -- VARCHAR(255)
- `Phone` string -- VARCHAR(50)
- `EntryDate` time.Time -- DATE, NOT NULL
- `ExitDate` *time.Time -- DATE, nullable
- `DepartmentID` *uuid.UUID -- FK departments, SET NULL
- `CostCenterID` *uuid.UUID -- FK cost_centers, SET NULL
- `EmploymentTypeID` *uuid.UUID -- FK employment_types, SET NULL
- `WeeklyHours` decimal.Decimal -- DECIMAL(5,2), default 40.00
- `VacationDaysPerYear` decimal.Decimal -- DECIMAL(5,2), default 30.00
- `IsActive` bool -- default true
- `CreatedAt` time.Time
- `UpdatedAt` time.Time
- `DeletedAt` gorm.DeletedAt -- soft delete

Added by migration 000031:
- `TariffID` *uuid.UUID -- FK tariffs, SET NULL

Added by migration 000041 (extended personnel master data):
- `ExitReason` string -- VARCHAR(255)
- `Notes` string -- TEXT
- `AddressStreet` string -- VARCHAR(255)
- `AddressZip` string -- VARCHAR(20)
- `AddressCity` string -- VARCHAR(100)
- `AddressCountry` string -- VARCHAR(100)
- `BirthDate` *time.Time -- DATE
- `Gender` string -- VARCHAR(20), CHECK constraint
- `Nationality` string -- VARCHAR(100)
- `Religion` string -- VARCHAR(100)
- `MaritalStatus` string -- VARCHAR(50), CHECK constraint
- `BirthPlace` string -- VARCHAR(100)
- `BirthCountry` string -- VARCHAR(100)
- `RoomNumber` string -- VARCHAR(50)
- `PhotoURL` string -- VARCHAR(500)
- `EmployeeGroupID` *uuid.UUID -- FK employee_groups, SET NULL
- `WorkflowGroupID` *uuid.UUID -- FK workflow_groups, SET NULL
- `ActivityGroupID` *uuid.UUID -- FK activity_groups, SET NULL
- `PartTimePercent` *decimal.Decimal -- DECIMAL(5,2)
- `DisabilityFlag` bool -- default false
- `DailyTargetHours` *decimal.Decimal -- DECIMAL(5,2)
- `WeeklyTargetHours` *decimal.Decimal -- DECIMAL(5,2)
- `MonthlyTargetHours` *decimal.Decimal -- DECIMAL(7,2)
- `AnnualTargetHours` *decimal.Decimal -- DECIMAL(8,2)
- `WorkDaysPerWeek` *decimal.Decimal -- DECIMAL(3,1)
- `CalculationStartDate` *time.Time -- DATE

Added by migration 000058:
- `DefaultOrderID` *uuid.UUID -- FK orders, SET NULL
- `DefaultActivityID` *uuid.UUID -- FK activities, SET NULL

**Relations declared in Go**:
- `Tenant` *Tenant
- `Department` *Department
- `CostCenter` *CostCenter
- `EmploymentType` *EmploymentType
- `Tariff` *Tariff
- `EmployeeGroup` *EmployeeGroup
- `WorkflowGroup` *WorkflowGroup
- `ActivityGroup` *ActivityGroup
- `DefaultOrder` *Order
- `DefaultActivity` *Activity
- `Contacts` []EmployeeContact
- `Cards` []EmployeeCard
- `User` *User (via `foreignKey:EmployeeID`)

**Methods**:
- `TableName()` returns "employees"
- `FullName()` returns first + last name
- `IsEmployed()` returns true if no exit date or exit date in future

**NOTE**: The Go model has NO `location_id` field. The ticket's proposed Prisma schema includes `location_id` but there is no column for this in any migration. This is a field that exists in the ticket requirements but NOT in the actual database.

#### `apps/api/internal/model/employeetariffassignment.go` (55 lines)

**EmployeeTariffAssignment struct** (lines 18-34):
- `ID` uuid.UUID -- PK
- `TenantID` uuid.UUID -- NOT NULL, FK tenants
- `EmployeeID` uuid.UUID -- NOT NULL, FK employees
- `TariffID` uuid.UUID -- NOT NULL, FK tariffs
- `EffectiveFrom` time.Time -- DATE, NOT NULL
- `EffectiveTo` *time.Time -- DATE, nullable
- `OverwriteBehavior` OverwriteBehavior -- VARCHAR(20), NOT NULL, default 'preserve_manual'
- `Notes` string -- TEXT
- `IsActive` bool -- default true
- `CreatedAt` time.Time
- `UpdatedAt` time.Time

**OverwriteBehavior enum** (lines 10-15):
- `"overwrite"` -- tariff overwrites manual edits
- `"preserve_manual"` -- tariff preserves manual edits

**Relations**: Employee, Tariff
**Methods**: `TableName()`, `ContainsDate(date time.Time) bool`

### 3. Org Table Models from TICKET-204 (Already in Prisma)

All the following models are already present in `apps/web/prisma/schema.prisma`:

#### Department (lines 366-392)
```prisma
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

  tenant   Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  parent   Department?  @relation("DepartmentTree", fields: [parentId], references: [id], onDelete: SetNull)
  children Department[] @relation("DepartmentTree")
  teams    Team[]
  // Note: managerEmployeeId FK references employees(id) ON DELETE SET NULL.
  // Employee model not yet in Prisma (TICKET-205). Relation will be added then.

  @@unique([tenantId, code], map: "departments_tenant_id_code_key")
  @@index([tenantId], map: "idx_departments_tenant")
  @@index([parentId], map: "idx_departments_parent")
  @@index([tenantId, isActive], map: "idx_departments_active")
  @@map("departments")
}
```

**Pending Employee relations**: `managerEmployeeId` is a bare UUID with no Prisma relation. Comment says relation will be added in TICKET-205.

#### Team (lines 401-424)
```prisma
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

  tenant     Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  department Department?  @relation(fields: [departmentId], references: [id], onDelete: SetNull)
  members    TeamMember[]
  // Note: leaderEmployeeId FK references employees(id) ON DELETE SET NULL.
  // Employee model not yet in Prisma (TICKET-205). Relation will be added then.

  @@unique([tenantId, name], map: "teams_tenant_id_name_key")
  @@index([tenantId], map: "idx_teams_tenant")
  @@index([departmentId], map: "idx_teams_department")
  @@map("teams")
}
```

**Pending Employee relations**: `leaderEmployeeId` is a bare UUID with no Prisma relation. Comment says relation will be added in TICKET-205.

#### TeamMember (lines 436-453)
```prisma
model TeamMember {
  teamId     String   @map("team_id") @db.Uuid
  employeeId String   @map("employee_id") @db.Uuid
  joinedAt   DateTime @default(now()) @map("joined_at") @db.Timestamptz(6)
  role       String   @default("member") @db.VarChar(50)

  team Team @relation(fields: [teamId], references: [id], onDelete: Cascade)
  // Note: employeeId FK references employees(id) ON DELETE CASCADE.
  // Employee model not yet in Prisma (TICKET-205). Relation will be added then.

  @@id([teamId, employeeId])
  @@index([employeeId], map: "idx_team_members_employee")
  @@map("team_members")
}
```

**Pending Employee relations**: `employeeId` is a bare UUID with no Prisma relation. Comment says relation will be added in TICKET-205.

#### CostCenter (lines 173-191)
- Has FK relation to Tenant. No existing Employee relations.
- Currently has no `employees Employee[]` reverse relation.

#### Location (lines 199-220)
- Has FK relation to Tenant. No existing Employee relations.
- Currently has no `employees Employee[]` reverse relation.

#### EmploymentType (lines 233-253)
- Has FK relation to Tenant (nullable). No existing Employee relations.
- Currently has no `employees Employee[]` reverse relation.

### 4. User Model — Employee Relation

**Current User model in Prisma** (lines 28-63):
```prisma
model User {
  // ... other fields ...
  employeeId             String?   @map("employee_id") @db.Uuid
  // ... other fields ...

  // Relations
  tenant      Tenant?      @relation(fields: [tenantId], references: [id])
  userGroup   UserGroup?   @relation(fields: [userGroupId], references: [id])
  userTenants UserTenant[]

  // ... indexes ...
  @@map("users")
}
```

**Key observation**: The User model has an `employeeId` field (nullable UUID) but NO relation to Employee declared. There is no `employee Employee?` relation field.

**DB FK** (from migration `000014_link_users_employees.up.sql`):
```sql
ALTER TABLE users
    ADD CONSTRAINT fk_users_employee
    FOREIGN KEY (employee_id)
    REFERENCES employees(id)
    ON DELETE SET NULL;
```

**Go model relation** (from `employee.go` line 85):
```go
User *User `gorm:"foreignKey:EmployeeID" json:"user,omitempty"`
```
The Go Employee model owns the reverse side: `User` field with `foreignKey:EmployeeID` means the FK column is on the `users` table pointing to `employees.id`. This is a 1:1 optional relationship where User has `employee_id` FK.

**When adding Employee to Prisma**: The User model needs an `employee Employee? @relation(fields: [employeeId], references: [id])` relation added, and the Employee model needs a `user User?` reverse relation (without fields, since the FK is on User).

### 5. TeamMember Model — Employee Relation

The TeamMember model exists in Prisma (lines 436-453) with a composite primary key `@@id([teamId, employeeId])`. The `employeeId` field is currently a bare UUID with no relation declared. The comment notes that the relation will be added when the Employee model is added in TICKET-205.

**DB FK** (from migration `000014_link_users_employees.up.sql`):
```sql
ALTER TABLE team_members
    ADD CONSTRAINT fk_team_members_employee
    FOREIGN KEY (employee_id)
    REFERENCES employees(id)
    ON DELETE CASCADE;
```

**When adding Employee to Prisma**: TeamMember needs `employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)` and Employee needs `teamMemberships TeamMember[]`.

### 6. Database Migrations

#### employees table
| Migration | Operation |
|-----------|-----------|
| `000011_create_employees` | CREATE TABLE: id (UUID PK, gen_random_uuid()), tenant_id (FK tenants, CASCADE), personnel_number VARCHAR(50) NOT NULL, pin VARCHAR(20) NOT NULL, first_name VARCHAR(100) NOT NULL, last_name VARCHAR(100) NOT NULL, email VARCHAR(255), phone VARCHAR(50), entry_date DATE NOT NULL, exit_date DATE, department_id (FK departments, SET NULL), cost_center_id (FK cost_centers, SET NULL), employment_type_id (FK employment_types, SET NULL), weekly_hours DECIMAL(5,2) DEFAULT 40.00, vacation_days_per_year DECIMAL(5,2) DEFAULT 30.00, is_active BOOLEAN DEFAULT true, timestamps, deleted_at. UNIQUE(tenant_id, personnel_number), UNIQUE(tenant_id, pin). Indexes: idx_employees_tenant, idx_employees_department, idx_employees_active, idx_employees_deleted_at, idx_employees_name |
| `000031_add_tariff_rhythm_fields` | ADD COLUMN tariff_id UUID (FK tariffs, SET NULL). Index: idx_employees_tariff |
| `000041_extend_employee_master_data` | ADD COLUMNS: exit_reason, notes, address_street/zip/city/country, birth_date, gender, nationality, religion, marital_status, birth_place, birth_country, room_number, photo_url, employee_group_id (FK employee_groups, SET NULL), workflow_group_id (FK workflow_groups, SET NULL), activity_group_id (FK activity_groups, SET NULL), part_time_percent, disability_flag, daily_target_hours, weekly_target_hours, monthly_target_hours, annual_target_hours, work_days_per_week, calculation_start_date. CHECK constraints: chk_employee_gender, chk_employee_marital_status. Indexes: idx_employees_employee_group, idx_employees_workflow_group, idx_employees_activity_group |
| `000058_add_employee_default_order` | ADD COLUMNS: default_order_id (FK orders, SET NULL), default_activity_id (FK activities, SET NULL). Indexes: idx_employees_default_order, idx_employees_default_activity |

**Complete employees column list in DB** (46 columns):
id, tenant_id, personnel_number, pin, first_name, last_name, email, phone, entry_date, exit_date, department_id, cost_center_id, employment_type_id, weekly_hours, vacation_days_per_year, is_active, created_at, updated_at, deleted_at, tariff_id, exit_reason, notes, address_street, address_zip, address_city, address_country, birth_date, gender, nationality, religion, marital_status, birth_place, birth_country, room_number, photo_url, employee_group_id, workflow_group_id, activity_group_id, part_time_percent, disability_flag, daily_target_hours, weekly_target_hours, monthly_target_hours, annual_target_hours, work_days_per_week, calculation_start_date, default_order_id, default_activity_id

#### employee_contacts table
| Migration | Operation |
|-----------|-----------|
| `000012_create_employee_contacts` | CREATE TABLE: id (UUID PK), employee_id (FK employees, CASCADE), contact_type VARCHAR(50) NOT NULL, value VARCHAR(255) NOT NULL, label VARCHAR(100), is_primary BOOLEAN DEFAULT false, timestamps. Indexes: idx_employee_contacts_employee, idx_employee_contacts_type(employee_id, contact_type) |
| `000069_alter_employee_contacts_add_kind` | ADD COLUMN contact_kind_id UUID (FK contact_kinds, SET NULL). Index: idx_employee_contacts_kind |

**Complete employee_contacts column list in DB** (8 columns):
id, employee_id, contact_type, value, label, is_primary, created_at, updated_at, contact_kind_id

#### employee_cards table
| Migration | Operation |
|-----------|-----------|
| `000013_create_employee_cards` | CREATE TABLE: id (UUID PK), tenant_id (FK tenants, CASCADE), employee_id (FK employees, CASCADE), card_number VARCHAR(100) NOT NULL, card_type VARCHAR(50) DEFAULT 'rfid', valid_from DATE NOT NULL DEFAULT CURRENT_DATE, valid_to DATE, is_active BOOLEAN DEFAULT true, deactivated_at TIMESTAMPTZ, deactivation_reason VARCHAR(255), timestamps. UNIQUE(tenant_id, card_number). Indexes: idx_employee_cards_employee, idx_employee_cards_card(tenant_id, card_number), idx_employee_cards_active(tenant_id, is_active) |

**Complete employee_cards column list in DB** (11 columns):
id, tenant_id, employee_id, card_number, card_type, valid_from, valid_to, is_active, deactivated_at, deactivation_reason, created_at, updated_at

#### employee_tariff_assignments table
| Migration | Operation |
|-----------|-----------|
| `000054_create_employee_tariff_assignments` | CREATE TABLE: id (UUID PK), tenant_id (FK tenants, CASCADE), employee_id (FK employees, CASCADE), tariff_id (FK tariffs, CASCADE), effective_from DATE NOT NULL, effective_to DATE, overwrite_behavior VARCHAR(20) NOT NULL DEFAULT 'preserve_manual' CHECK (IN ('overwrite', 'preserve_manual')), notes TEXT, is_active BOOLEAN DEFAULT true, timestamps. Indexes: idx_eta_tenant, idx_eta_employee, idx_eta_tariff, idx_eta_employee_dates, idx_eta_effective_lookup. Trigger: update_employee_tariff_assignments_updated_at |

**Complete employee_tariff_assignments column list in DB** (10 columns):
id, tenant_id, employee_id, tariff_id, effective_from, effective_to, overwrite_behavior, notes, is_active, created_at, updated_at

### 7. Ticket's Proposed Schema vs. Actual DB Schema -- Discrepancies

| Field/Aspect | Ticket's Proposed Schema | Actual DB Schema | Discrepancy |
|-------------|------------------------|-------------------|-------------|
| **Employee.id** | `@id @default(uuid())` | PK DEFAULT gen_random_uuid() | Should use `@default(dbgenerated("gen_random_uuid()"))` per established convention |
| **Employee.title** | `String?` | Not in DB | Column does not exist in any migration |
| **Employee.date_of_birth** | `DateTime? @db.Date` | `birth_date DATE` | Different column name: ticket uses `date_of_birth`, DB uses `birth_date` |
| **Employee.mobile** | `String?` | Not in DB | Column does not exist |
| **Employee.street/zip_code/city/country** | `street`, `zip_code`, `city`, `country` | `address_street`, `address_zip`, `address_city`, `address_country` | Different column names (address_ prefix missing) |
| **Employee.location_id** | `String? @db.Uuid` | Not in DB | **No location_id column exists** on employees table |
| **Employee.weekly_hours** | `@db.Decimal(10,2)` | DECIMAL(5,2) | Precision mismatch: DB uses (5,2), ticket uses (10,2) |
| **Employee.daily_hours** | `@db.Decimal(10,2)` | `daily_target_hours DECIMAL(5,2)` | Different column name and precision |
| **Employee.vacation_days** | `@db.Decimal(10,2)` | `vacation_days_per_year DECIMAL(5,2)` | Different column name and precision |
| **Employee.vacation_days_previous** | `@db.Decimal(10,2)` | Not in DB | Column does not exist |
| **Employee.tax_id** | `String?` | Not in DB | Column does not exist |
| **Employee.social_security_number** | `String?` | Not in DB | Column does not exist |
| **Employee.health_insurance** | `String?` | Not in DB | Column does not exist |
| **Employee.bank_name** | `String?` | Not in DB | Column does not exist |
| **Employee.iban** | `String?` | Not in DB | Column does not exist |
| **Employee.bic** | `String?` | Not in DB | Column does not exist |
| **Employee.salary_type** | `String?` | Not in DB | Column does not exist |
| **Employee.salary_amount** | `@db.Decimal(10,2)` | Not in DB | Column does not exist |
| **Employee — missing fields** | Not in ticket | `pin VARCHAR(20) NOT NULL`, `tariff_id UUID`, `exit_reason VARCHAR(255)`, `religion VARCHAR(100)`, `marital_status VARCHAR(50)`, `birth_place VARCHAR(100)`, `birth_country VARCHAR(100)`, `room_number VARCHAR(50)`, `employee_group_id UUID`, `workflow_group_id UUID`, `activity_group_id UUID`, `part_time_percent DECIMAL(5,2)`, `disability_flag BOOLEAN`, `weekly_target_hours DECIMAL(5,2)`, `monthly_target_hours DECIMAL(7,2)`, `annual_target_hours DECIMAL(8,2)`, `work_days_per_week DECIMAL(3,1)`, `calculation_start_date DATE`, `default_order_id UUID`, `default_activity_id UUID` | 20 columns in DB not represented in ticket schema |
| **Employee.location** | `Location? @relation(...)` | No FK exists | Ticket declares a relation to Location but no FK column exists in DB |
| **Employee indexes** | Only `@@unique([tenant_id, personnel_number])` | 9 indexes total | Many indexes not declared in ticket schema |
| **EmployeeContact.type** | `String` (column `type`) | `contact_type VARCHAR(50)` | Different column name |
| **EmployeeContact — missing fields** | Not in ticket | `contact_kind_id UUID` | contact_kind_id FK added in migration 000069 |
| **EmployeeCard — missing fields** | Not in ticket | `tenant_id UUID NOT NULL`, `deactivated_at TIMESTAMPTZ`, `deactivation_reason VARCHAR(255)` | 3 columns in DB not in ticket schema |
| **EmployeeCard.valid_from** | `DateTime? @db.Date` (nullable) | `DATE NOT NULL DEFAULT CURRENT_DATE` | DB column is NOT NULL with default |
| **EmployeeCard.valid_until** | `valid_until` | `valid_to DATE` | Different column name: ticket uses `valid_until`, DB uses `valid_to` |
| **EmployeeCard unique constraint** | None declared | UNIQUE(tenant_id, card_number) | Missing unique constraint |
| **EmployeeTariffAssignment.valid_from** | `DateTime @db.Date` | `effective_from DATE NOT NULL` | Different column name |
| **EmployeeTariffAssignment.valid_until** | `DateTime? @db.Date` | `effective_to DATE` | Different column name |
| **EmployeeTariffAssignment — missing fields** | Not in ticket | `overwrite_behavior VARCHAR(20) NOT NULL DEFAULT 'preserve_manual'`, `notes TEXT` | 2 columns in DB not in ticket schema |

### 8. Prisma Generate Setup

**Configuration** in `apps/web/prisma/schema.prisma` (lines 6-13):
```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

**Package.json scripts** (`apps/web/package.json`):
- `db:generate`: `prisma generate`
- `db:pull`: `prisma db pull`
- `db:studio`: `prisma studio`
- `postinstall`: `prisma generate` (auto-runs on `pnpm install`)

**Dependencies** (`apps/web/package.json`):
- `prisma`: `^7.4.2` (devDependencies)
- `@prisma/client`: `^7.4.2` (dependencies)
- `@prisma/adapter-pg`: `^7.4.2` (dependencies, PrismaPg driver adapter for Prisma 7)
- `pg`: `^8.19.0` (dependencies, PostgreSQL client)

**Prisma Client singleton**: `apps/web/src/lib/db/prisma.ts`
- Uses `PrismaPg` adapter with `process.env.DATABASE_URL`
- Singleton pattern for dev hot-reload safety
- Exported via `apps/web/src/lib/db/index.ts`
- Injected into tRPC context

### 9. Existing Test Patterns

**No Prisma model tests exist**. There are no integration tests that query the database via PrismaClient.

Test files in `apps/web/src/server/__tests__/`:
- `trpc.test.ts` -- Tests health router with mock PrismaClient (`prisma: {} as TRPCContext["prisma"]`)
- `authorization.test.ts` -- Tests permission checking with mock UserGroup types from Prisma
- `permission-helpers.test.ts` -- Tests permission helper utilities
- `permission-catalog.test.ts` -- Tests permission catalog
- `procedures.test.ts` -- Tests procedure chains with mock context
- `helpers.ts` -- Shared mock factories using Prisma-generated types

**Test setup** (`apps/web/vitest.config.ts`):
```typescript
import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
```

All tests use mock Prisma clients, not real database connections. The pattern is:
```typescript
const mockPrisma = {
  $queryRaw: async () => [{ "?column?": 1 }],
} as unknown as TRPCContext["prisma"]
```

There are no test files specific to TICKET-204 org models. The test pattern for Prisma schema additions is: add models, run `prisma generate`, verify TypeScript compilation succeeds.

### 10. Migration Patterns — SQL vs. Prisma

**SQL migrations** are in `db/migrations/` and managed by golang-migrate. The Prisma schema is a READ-ONLY overlay that mirrors the SQL-managed tables. The workflow is:

1. SQL migrations define the actual database schema (source of truth)
2. Prisma schema is hand-written to match the DB schema
3. `prisma generate` produces TypeScript types from the Prisma schema
4. `prisma db push` and `prisma migrate dev` are explicitly prohibited

The Prisma schema does NOT drive migrations. It is purely a type-generation layer. New tables/columns are added via SQL migrations, then the Prisma schema is updated to match.

### 11. Foreign Key Relationships Involving employees (from migrations)

```
-- FK columns ON employees table:
employees.tenant_id             -> tenants(id)           ON DELETE CASCADE
employees.department_id         -> departments(id)       ON DELETE SET NULL
employees.cost_center_id        -> cost_centers(id)      ON DELETE SET NULL
employees.employment_type_id    -> employment_types(id)  ON DELETE SET NULL
employees.tariff_id             -> tariffs(id)           ON DELETE SET NULL
employees.employee_group_id     -> employee_groups(id)   ON DELETE SET NULL
employees.workflow_group_id     -> workflow_groups(id)    ON DELETE SET NULL
employees.activity_group_id     -> activity_groups(id)   ON DELETE SET NULL
employees.default_order_id      -> orders(id)            ON DELETE SET NULL
employees.default_activity_id   -> activities(id)        ON DELETE SET NULL

-- FK columns on OTHER tables pointing to employees:
users.employee_id               -> employees(id)         ON DELETE SET NULL
departments.manager_employee_id -> employees(id)         ON DELETE SET NULL
teams.leader_employee_id        -> employees(id)         ON DELETE SET NULL
team_members.employee_id        -> employees(id)         ON DELETE CASCADE

-- FK columns on sub-entity tables:
employee_contacts.employee_id   -> employees(id)         ON DELETE CASCADE
employee_contacts.contact_kind_id -> contact_kinds(id)   ON DELETE SET NULL
employee_cards.tenant_id        -> tenants(id)           ON DELETE CASCADE
employee_cards.employee_id      -> employees(id)         ON DELETE CASCADE
employee_tariff_assignments.tenant_id  -> tenants(id)    ON DELETE CASCADE
employee_tariff_assignments.employee_id -> employees(id) ON DELETE CASCADE
employee_tariff_assignments.tariff_id  -> tariffs(id)    ON DELETE CASCADE
```

### 12. DB CHECK Constraints on Employee Tables

```sql
-- employees table:
CHECK (gender IS NULL OR gender = '' OR gender IN ('male', 'female', 'diverse', 'not_specified'))
CHECK (marital_status IS NULL OR marital_status = '' OR marital_status IN ('single', 'married', 'divorced', 'widowed', 'registered_partnership', 'not_specified'))

-- employee_tariff_assignments table:
CHECK (overwrite_behavior IN ('overwrite', 'preserve_manual'))
```

### 13. Unique Constraints and Indexes

| Table | Unique Constraints | Indexes |
|-------|-------------------|---------|
| employees | UNIQUE(tenant_id, personnel_number), UNIQUE(tenant_id, pin) | idx_employees_tenant, idx_employees_department, idx_employees_active(tenant_id, is_active), idx_employees_deleted_at, idx_employees_name(tenant_id, last_name, first_name), idx_employees_tariff, idx_employees_employee_group, idx_employees_workflow_group, idx_employees_activity_group, idx_employees_default_order, idx_employees_default_activity |
| employee_contacts | None | idx_employee_contacts_employee, idx_employee_contacts_type(employee_id, contact_type), idx_employee_contacts_kind |
| employee_cards | UNIQUE(tenant_id, card_number) | idx_employee_cards_employee, idx_employee_cards_card(tenant_id, card_number), idx_employee_cards_active(tenant_id, is_active) |
| employee_tariff_assignments | None | idx_eta_tenant, idx_eta_employee, idx_eta_tariff, idx_eta_employee_dates(employee_id, effective_from, effective_to), idx_eta_effective_lookup(employee_id, effective_from, effective_to, is_active) |

### 14. Models NOT in Prisma That Employee References

The following models referenced by Employee's FK columns do NOT yet exist in Prisma:

- **Tariff** -- referenced by `employees.tariff_id` and `employee_tariff_assignments.tariff_id`
- **EmployeeGroup** -- referenced by `employees.employee_group_id`
- **WorkflowGroup** -- referenced by `employees.workflow_group_id`
- **ActivityGroup** -- referenced by `employees.activity_group_id`
- **Order** -- referenced by `employees.default_order_id`
- **Activity** -- referenced by `employees.default_activity_id`
- **ContactKind** -- referenced by `employee_contacts.contact_kind_id`

These FK columns will need to be modeled as bare UUIDs (like `managerEmployeeId` in Department) with comments noting the relation will be added when those models are brought into Prisma.

### 15. Models Already in Prisma That Need Reverse Relations Added

When the Employee model is added, the following existing models need to be updated:

| Model | Current State | Change Needed |
|-------|--------------|---------------|
| **User** | `employeeId String? @map("employee_id") @db.Uuid` -- no relation | Add `employee Employee? @relation(fields: [employeeId], references: [id], onDelete: SetNull)` |
| **Department** | `managerEmployeeId String?` -- bare UUID with comment | Add `manager Employee? @relation("DepartmentManager", fields: [managerEmployeeId], references: [id], onDelete: SetNull)` |
| **Team** | `leaderEmployeeId String?` -- bare UUID with comment | Add `leader Employee? @relation("TeamLeader", fields: [leaderEmployeeId], references: [id], onDelete: SetNull)` |
| **TeamMember** | `employeeId String` -- bare UUID with comment | Add `employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)` |
| **CostCenter** | No employee reference | Add `employees Employee[]` reverse relation |
| **Location** | No employee reference | Only if `location_id` FK exists -- it does NOT exist in DB currently |
| **EmploymentType** | No employee reference | Add `employees Employee[]` reverse relation |
| **Tenant** | Has `users User[]` but no employees | Add `employees Employee[]` reverse relation |

## Code References

- `apps/web/prisma/schema.prisma` -- Current Prisma schema (13 models, 454 lines)
- `apps/web/src/generated/prisma/` -- Generated Prisma client and type files
- `apps/web/src/lib/db/prisma.ts` -- Prisma Client singleton with PrismaPg adapter
- `apps/web/package.json` -- Prisma scripts and dependencies
- `apps/web/vitest.config.ts` -- Test configuration
- `apps/web/src/server/__tests__/helpers.ts` -- Shared test mock factories
- `apps/api/internal/model/employee.go` -- Go Employee, EmployeeContact, EmployeeCard models (157 lines)
- `apps/api/internal/model/employeetariffassignment.go` -- Go EmployeeTariffAssignment model (55 lines)
- `db/migrations/000011_create_employees.up.sql` -- Base employees table creation
- `db/migrations/000012_create_employee_contacts.up.sql` -- employee_contacts table creation
- `db/migrations/000013_create_employee_cards.up.sql` -- employee_cards table creation
- `db/migrations/000014_link_users_employees.up.sql` -- FK constraints linking users, departments, teams to employees
- `db/migrations/000031_add_tariff_rhythm_fields.up.sql` -- Adds tariff_id to employees
- `db/migrations/000041_extend_employee_master_data.up.sql` -- Extended employee fields (20+ columns)
- `db/migrations/000054_create_employee_tariff_assignments.up.sql` -- employee_tariff_assignments table creation
- `db/migrations/000058_add_employee_default_order.up.sql` -- Adds default_order_id, default_activity_id
- `db/migrations/000068_create_contact_types.up.sql` -- contact_types and contact_kinds tables
- `db/migrations/000069_alter_employee_contacts_add_kind.up.sql` -- Adds contact_kind_id to employee_contacts
