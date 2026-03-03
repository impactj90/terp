# Implementation Plan: ZMI-TICKET-205 — Prisma Schema: Employee

## Overview

Extend the existing Prisma schema at `apps/web/prisma/schema.prisma` with 4 employee-related models: **Employee** (46 DB columns), **EmployeeContact** (8 columns), **EmployeeCard** (11 columns), and **EmployeeTariffAssignment** (10 columns). Additionally, update 5 existing models (User, Department, Team, TeamMember, Tenant) to add the bidirectional relations that were deferred from TICKET-204 with explicit comments saying "Relation will be added then."

The schema is read-only against the existing PostgreSQL database. No SQL migrations are created. All fields must match the **actual DB schema** (not the ticket's proposed schema, which has significant discrepancies).

## Current State

- **Prisma schema**: `apps/web/prisma/schema.prisma` contains 13 models from TICKET-200 and TICKET-204
- **Deferred relations**: Department (`managerEmployeeId`), Team (`leaderEmployeeId`), TeamMember (`employeeId`), and User (`employeeId`) all have bare UUID fields with comments: "Employee model not yet in Prisma (TICKET-205). Relation will be added then."
- **Employee tables**: 4 tables exist in PostgreSQL (employees, employee_contacts, employee_cards, employee_tariff_assignments) via migrations 000011-000014, 000031, 000041, 000054, 000058, 000069
- **Conventions established**: camelCase fields with `@map("snake_case")`, `@db.Uuid`, `@db.VarChar(N)`, `@db.Timestamptz(6)`, `@default(dbgenerated("gen_random_uuid()"))`, block comments documenting migration numbers and CHECK constraints, `@@index` with explicit `map:` names

## Desired End State

1. `apps/web/prisma/schema.prisma` with 17 models total (13 existing + 4 new)
2. All Employee FK columns on existing models (Department, Team, TeamMember, User) have proper Prisma relations instead of bare UUIDs with comments
3. Reverse relations added to Tenant, CostCenter, EmploymentType
4. `prisma generate` succeeds and produces TypeScript types for all 17 models
5. All models match actual DB columns exactly
6. Existing tests and typecheck continue to pass

## What We Are NOT Doing

- Running `prisma db push` or `prisma migrate dev`
- Adding columns that do NOT exist in the DB (e.g., `title`, `mobile`, `location_id`, `tax_id`, `social_security_number`, `health_insurance`, `bank_name`, `iban`, `bic`, `salary_type`, `salary_amount`, `vacation_days_previous`)
- Creating the `Location <-> Employee` relation (no `location_id` FK exists on the employees table)
- Defining models for tables not yet in Prisma: Tariff, EmployeeGroup, WorkflowGroup, ActivityGroup, Order, Activity, ContactKind (these FK columns are modeled as bare UUIDs with comments)
- Creating SQL migrations
- Deleting Go model files (Go models remain for the Go backend)
- Creating Prisma enums for string-type columns (gender, marital_status, overwrite_behavior are stored as VARCHAR with CHECK constraints)

## Ticket Schema vs. Actual DB — Key Corrections

The ticket's proposed Prisma schema has **significant discrepancies** from the actual database. The implementation MUST follow the **actual DB**. Key corrections:

| Issue | Ticket Says | Actual DB / Correction |
|-------|-------------|----------------------|
| Employee.id | `@default(uuid())` | DB uses `gen_random_uuid()`. Use `@default(dbgenerated("gen_random_uuid()"))` per convention. |
| Employee.title | `String?` | Does NOT exist in any migration. Omit. |
| Employee.date_of_birth | `DateTime? @db.Date` | DB column is `birth_date`. Use `birthDate` with `@map("birth_date")`. |
| Employee.mobile | `String?` | Does NOT exist in DB. Omit. |
| Employee.street/zip_code/city/country | `street`, `zip_code`, `city`, `country` | DB columns are `address_street`, `address_zip`, `address_city`, `address_country`. Use `addressStreet` etc. with correct `@map`. |
| Employee.location_id | `String? @db.Uuid` | Does NOT exist on employees table. No FK, no column. Omit entirely. |
| Employee.location relation | `Location? @relation(...)` | No FK exists. Omit. |
| Employee.weekly_hours | `Decimal? @db.Decimal(10,2)` | DB is `DECIMAL(5,2) DEFAULT 40.00`, NOT NULL (has default). Use `@db.Decimal(5,2)`. |
| Employee.daily_hours | `Decimal? @db.Decimal(10,2)` | DB column is `daily_target_hours DECIMAL(5,2)`. Use `dailyTargetHours` with `@map("daily_target_hours")`. |
| Employee.vacation_days | `Decimal? @db.Decimal(10,2)` | DB column is `vacation_days_per_year DECIMAL(5,2) DEFAULT 30.00`. Use `vacationDaysPerYear`. |
| Employee.vacation_days_previous | `Decimal?` | Does NOT exist in DB. Omit. |
| Employee.tax_id | `String?` | Does NOT exist. Omit. |
| Employee.social_security_number | `String?` | Does NOT exist. Omit. |
| Employee.health_insurance | `String?` | Does NOT exist. Omit. |
| Employee.bank_name/iban/bic | `String?` | Do NOT exist. Omit. |
| Employee.salary_type/salary_amount | `String?`/`Decimal?` | Do NOT exist. Omit. |
| Employee — 20 missing fields | Not in ticket | `pin`, `tariff_id`, `exit_reason`, `religion`, `marital_status`, `birth_place`, `birth_country`, `room_number`, `employee_group_id`, `workflow_group_id`, `activity_group_id`, `part_time_percent`, `disability_flag`, `weekly_target_hours`, `monthly_target_hours`, `annual_target_hours`, `work_days_per_week`, `calculation_start_date`, `default_order_id`, `default_activity_id`. All must be added. |
| Employee.entry_date | `DateTime? @db.Date` | DB is `DATE NOT NULL`. Use `DateTime @db.Date` (non-nullable). |
| Employee unique constraints | Only `[tenant_id, personnel_number]` | DB also has `UNIQUE(tenant_id, pin)`. Add both. |
| Employee indexes | 1 declared | 11 indexes total in DB. Add all. |
| EmployeeContact.type | `type String` | DB column is `contact_type VARCHAR(50)`. Use `contactType` with `@map("contact_type")`. |
| EmployeeContact.contact_kind_id | Not in ticket | Exists in DB (migration 000069). Add. |
| EmployeeCard.tenant_id | Not in ticket | Exists in DB (NOT NULL, FK). Add. |
| EmployeeCard.valid_from | `DateTime? @db.Date` | DB is `DATE NOT NULL DEFAULT CURRENT_DATE`. Use non-nullable with default. |
| EmployeeCard.valid_until | `valid_until DateTime? @db.Date` | DB column is `valid_to`. Use `validTo` with `@map("valid_to")`. |
| EmployeeCard.deactivated_at | Not in ticket | Exists in DB (`TIMESTAMPTZ`). Add. |
| EmployeeCard.deactivation_reason | Not in ticket | Exists in DB (`VARCHAR(255)`). Add. |
| EmployeeCard unique constraint | None declared | DB has `UNIQUE(tenant_id, card_number)`. Add. |
| EmployeeTariffAssignment.valid_from | `valid_from DateTime @db.Date` | DB column is `effective_from`. Use `effectiveFrom`. |
| EmployeeTariffAssignment.valid_until | `valid_until DateTime? @db.Date` | DB column is `effective_to`. Use `effectiveTo`. |
| EmployeeTariffAssignment.overwrite_behavior | Not in ticket | Exists in DB (`VARCHAR(20) NOT NULL DEFAULT 'preserve_manual'`). Add. |
| EmployeeTariffAssignment.notes | Not in ticket | Exists in DB (`TEXT`). Add. |

## FK Strategy for Models Not Yet in Prisma

Several Employee FK columns reference tables not yet in Prisma. These are modeled as bare UUID string fields WITHOUT relation annotations, with comments indicating future relation addition:

| FK Column | References | Strategy |
|-----------|-----------|----------|
| `employees.tariff_id` | `tariffs(id)` ON DELETE SET NULL | Bare `String?` with comment |
| `employees.employee_group_id` | `employee_groups(id)` ON DELETE SET NULL | Bare `String?` with comment |
| `employees.workflow_group_id` | `workflow_groups(id)` ON DELETE SET NULL | Bare `String?` with comment |
| `employees.activity_group_id` | `activity_groups(id)` ON DELETE SET NULL | Bare `String?` with comment |
| `employees.default_order_id` | `orders(id)` ON DELETE SET NULL | Bare `String?` with comment |
| `employees.default_activity_id` | `activities(id)` ON DELETE SET NULL | Bare `String?` with comment |
| `employee_contacts.contact_kind_id` | `contact_kinds(id)` ON DELETE SET NULL | Bare `String?` with comment |
| `employee_tariff_assignments.tariff_id` | `tariffs(id)` ON DELETE CASCADE | Bare `String` with comment |

## Relation Naming Strategy

Because Employee has multiple relations to the same model (e.g., multiple `Employee[] ` reverse relations on the same target), Prisma requires named relation disambiguation:

| Relation | Name | FK side | Reverse side |
|----------|------|---------|-------------|
| Department.managerEmployeeId -> Employee | `"DepartmentManager"` | Department has `manager` | Employee has `managedDepartments` |
| Department.employees (department_id) | `"EmployeeDepartment"` | Employee has `department` | Department has `employees` |
| Team.leaderEmployeeId -> Employee | `"TeamLeader"` | Team has `leader` | Employee has `ledTeams` |
| TeamMember.employeeId -> Employee | (no name needed, single relation) | TeamMember has `employee` | Employee has `teamMemberships` |
| User.employeeId -> Employee | (no name needed, single relation) | User has `employee` | Employee has `user` |

---

## Phase 1: Add the Employee Model

### Overview
Add the Employee model with all 46 DB columns, plus relation fields for models already in Prisma and bare UUID fields for models not yet in Prisma.

### File to Modify
- `apps/web/prisma/schema.prisma`

### Exact Model to Add

Append after the `TeamMember` model block (after line 453):

```prisma
// -----------------------------------------------------------------------------
// Employee
// -----------------------------------------------------------------------------
// Migrations: 000011, 000031, 000041, 000058
//
// CHECK constraints (enforced at DB level only):
//   - chk_employee_gender: gender IS NULL OR gender = '' OR gender IN ('male', 'female', 'diverse', 'not_specified')
//   - chk_employee_marital_status: marital_status IS NULL OR marital_status = '' OR marital_status IN ('single', 'married', 'divorced', 'widowed', 'registered_partnership', 'not_specified')
//
// Soft delete via deleted_at column.
// Trigger: update_updated_at_column() auto-sets updated_at on UPDATE
model Employee {
  id                   String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId             String    @map("tenant_id") @db.Uuid
  personnelNumber      String    @map("personnel_number") @db.VarChar(50)
  pin                  String    @db.VarChar(20)
  firstName            String    @map("first_name") @db.VarChar(100)
  lastName             String    @map("last_name") @db.VarChar(100)
  email                String?   @db.VarChar(255)
  phone                String?   @db.VarChar(50)
  entryDate            DateTime  @map("entry_date") @db.Date
  exitDate             DateTime? @map("exit_date") @db.Date
  departmentId         String?   @map("department_id") @db.Uuid
  costCenterId         String?   @map("cost_center_id") @db.Uuid
  employmentTypeId     String?   @map("employment_type_id") @db.Uuid
  weeklyHours          Decimal   @default(40.00) @map("weekly_hours") @db.Decimal(5, 2)
  vacationDaysPerYear  Decimal   @default(30.00) @map("vacation_days_per_year") @db.Decimal(5, 2)
  isActive             Boolean   @default(true) @map("is_active")
  createdAt            DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt            DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt            DateTime? @map("deleted_at") @db.Timestamptz(6)

  // Added by migration 000031
  tariffId             String?   @map("tariff_id") @db.Uuid

  // Extended personnel master data (migration 000041)
  exitReason           String?   @map("exit_reason") @db.VarChar(255)
  notes                String?   @db.Text
  addressStreet        String?   @map("address_street") @db.VarChar(255)
  addressZip           String?   @map("address_zip") @db.VarChar(20)
  addressCity          String?   @map("address_city") @db.VarChar(100)
  addressCountry       String?   @map("address_country") @db.VarChar(100)
  birthDate            DateTime? @map("birth_date") @db.Date
  gender               String?   @db.VarChar(20)
  nationality          String?   @db.VarChar(100)
  religion             String?   @db.VarChar(100)
  maritalStatus        String?   @map("marital_status") @db.VarChar(50)
  birthPlace           String?   @map("birth_place") @db.VarChar(100)
  birthCountry         String?   @map("birth_country") @db.VarChar(100)
  roomNumber           String?   @map("room_number") @db.VarChar(50)
  photoUrl             String?   @map("photo_url") @db.VarChar(500)
  employeeGroupId      String?   @map("employee_group_id") @db.Uuid
  workflowGroupId      String?   @map("workflow_group_id") @db.Uuid
  activityGroupId      String?   @map("activity_group_id") @db.Uuid
  partTimePercent      Decimal?  @map("part_time_percent") @db.Decimal(5, 2)
  disabilityFlag       Boolean   @default(false) @map("disability_flag")
  dailyTargetHours     Decimal?  @map("daily_target_hours") @db.Decimal(5, 2)
  weeklyTargetHours    Decimal?  @map("weekly_target_hours") @db.Decimal(5, 2)
  monthlyTargetHours   Decimal?  @map("monthly_target_hours") @db.Decimal(7, 2)
  annualTargetHours    Decimal?  @map("annual_target_hours") @db.Decimal(8, 2)
  workDaysPerWeek      Decimal?  @map("work_days_per_week") @db.Decimal(3, 1)
  calculationStartDate DateTime? @map("calculation_start_date") @db.Date

  // Added by migration 000058
  defaultOrderId       String?   @map("default_order_id") @db.Uuid
  defaultActivityId    String?   @map("default_activity_id") @db.Uuid

  // Relations to models already in Prisma
  tenant         Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  department     Department?     @relation("EmployeeDepartment", fields: [departmentId], references: [id], onDelete: SetNull)
  costCenter     CostCenter?     @relation(fields: [costCenterId], references: [id], onDelete: SetNull)
  employmentType EmploymentType? @relation(fields: [employmentTypeId], references: [id], onDelete: SetNull)

  // Reverse relations (FK on other tables pointing to employees)
  user               User?        @relation(fields: [], references: [])  // See note below
  managedDepartments Department[] @relation("DepartmentManager")
  ledTeams           Team[]       @relation("TeamLeader")
  teamMemberships    TeamMember[]
  contacts           EmployeeContact[]
  cards              EmployeeCard[]
  tariffAssignments  EmployeeTariffAssignment[]

  // Note: tariffId FK references tariffs(id) ON DELETE SET NULL.
  // Tariff model not yet in Prisma. Relation will be added when it is.
  //
  // Note: employeeGroupId FK references employee_groups(id) ON DELETE SET NULL.
  // EmployeeGroup model not yet in Prisma. Relation will be added when it is.
  //
  // Note: workflowGroupId FK references workflow_groups(id) ON DELETE SET NULL.
  // WorkflowGroup model not yet in Prisma. Relation will be added when it is.
  //
  // Note: activityGroupId FK references activity_groups(id) ON DELETE SET NULL.
  // ActivityGroup model not yet in Prisma. Relation will be added when it is.
  //
  // Note: defaultOrderId FK references orders(id) ON DELETE SET NULL.
  // Order model not yet in Prisma. Relation will be added when it is.
  //
  // Note: defaultActivityId FK references activities(id) ON DELETE SET NULL.
  // Activity model not yet in Prisma. Relation will be added when it is.

  // Indexes
  @@unique([tenantId, personnelNumber], map: "employees_tenant_id_personnel_number_key")
  @@unique([tenantId, pin], map: "employees_tenant_id_pin_key")
  @@index([tenantId], map: "idx_employees_tenant")
  @@index([departmentId], map: "idx_employees_department")
  @@index([tenantId, isActive], map: "idx_employees_active")
  @@index([deletedAt], map: "idx_employees_deleted_at")
  @@index([tenantId, lastName, firstName], map: "idx_employees_name")
  @@index([tariffId], map: "idx_employees_tariff")
  @@index([employeeGroupId], map: "idx_employees_employee_group")
  @@index([workflowGroupId], map: "idx_employees_workflow_group")
  @@index([activityGroupId], map: "idx_employees_activity_group")
  @@index([defaultOrderId], map: "idx_employees_default_order")
  @@index([defaultActivityId], map: "idx_employees_default_activity")
  @@map("employees")
}
```

**IMPORTANT NOTE on `user` reverse relation**: The User model has `employeeId` as a FK column pointing to `employees(id)`. In Prisma, the relation is declared on the User model side (User owns the FK), and Employee gets the implicit reverse side. The Employee model should have:
```prisma
user User?
```
(A bare reverse relation with no `fields`/`references` — Prisma infers this from the User side.)

The `User` model will be updated in Phase 3 to declare the forward relation.

### Steps

- [ ] Step 1: Add the Employee model block after line 453 (after TeamMember) in `apps/web/prisma/schema.prisma`, exactly as shown above (except the `user` relation — see Phase 3).
- [ ] Step 2: Verify the model has exactly 48 data fields (46 DB columns + 2 implicit Prisma fields `createdAt`/`updatedAt` which map to DB columns).

### Verification
- Count fields: 46 DB columns should produce 46 Prisma fields (id, tenantId, personnelNumber, pin, firstName, lastName, email, phone, entryDate, exitDate, departmentId, costCenterId, employmentTypeId, weeklyHours, vacationDaysPerYear, isActive, createdAt, updatedAt, deletedAt, tariffId, exitReason, notes, addressStreet, addressZip, addressCity, addressCountry, birthDate, gender, nationality, religion, maritalStatus, birthPlace, birthCountry, roomNumber, photoUrl, employeeGroupId, workflowGroupId, activityGroupId, partTimePercent, disabilityFlag, dailyTargetHours, weeklyTargetHours, monthlyTargetHours, annualTargetHours, workDaysPerWeek, calculationStartDate, defaultOrderId, defaultActivityId).

---

## Phase 2: Add the Sub-Entity Models

### Overview
Add EmployeeContact, EmployeeCard, and EmployeeTariffAssignment models.

### File to Modify
- `apps/web/prisma/schema.prisma`

### Exact Models to Add

Append after the Employee model block:

#### 2.1 EmployeeContact

```prisma
// -----------------------------------------------------------------------------
// EmployeeContact
// -----------------------------------------------------------------------------
// Migrations: 000012, 000069
//
// Trigger: update_updated_at_column() auto-sets updated_at on UPDATE
model EmployeeContact {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  employeeId    String   @map("employee_id") @db.Uuid
  contactType   String   @map("contact_type") @db.VarChar(50)
  value         String   @db.VarChar(255)
  label         String?  @db.VarChar(100)
  isPrimary     Boolean  @default(false) @map("is_primary")
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Added by migration 000069
  contactKindId String?  @map("contact_kind_id") @db.Uuid

  // Relations
  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  // Note: contactKindId FK references contact_kinds(id) ON DELETE SET NULL.
  // ContactKind model not yet in Prisma. Relation will be added when it is.

  // Indexes
  @@index([employeeId], map: "idx_employee_contacts_employee")
  @@index([employeeId, contactType], map: "idx_employee_contacts_type")
  @@index([contactKindId], map: "idx_employee_contacts_kind")
  @@map("employee_contacts")
}
```

#### 2.2 EmployeeCard

```prisma
// -----------------------------------------------------------------------------
// EmployeeCard
// -----------------------------------------------------------------------------
// Migration: 000013
//
// Trigger: update_updated_at_column() auto-sets updated_at on UPDATE
model EmployeeCard {
  id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId           String    @map("tenant_id") @db.Uuid
  employeeId         String    @map("employee_id") @db.Uuid
  cardNumber         String    @map("card_number") @db.VarChar(100)
  cardType           String    @default("rfid") @map("card_type") @db.VarChar(50)
  validFrom          DateTime  @default(dbgenerated("CURRENT_DATE")) @map("valid_from") @db.Date
  validTo            DateTime? @map("valid_to") @db.Date
  isActive           Boolean   @default(true) @map("is_active")
  deactivatedAt      DateTime? @map("deactivated_at") @db.Timestamptz(6)
  deactivationReason String?   @map("deactivation_reason") @db.VarChar(255)
  createdAt          DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  // Indexes
  @@unique([tenantId, cardNumber], map: "employee_cards_tenant_id_card_number_key")
  @@index([employeeId], map: "idx_employee_cards_employee")
  @@index([tenantId, cardNumber], map: "idx_employee_cards_card")
  @@index([tenantId, isActive], map: "idx_employee_cards_active")
  @@map("employee_cards")
}
```

#### 2.3 EmployeeTariffAssignment

```prisma
// -----------------------------------------------------------------------------
// EmployeeTariffAssignment
// -----------------------------------------------------------------------------
// Migration: 000054
//
// CHECK constraint (enforced at DB level only):
//   - overwrite_behavior IN ('overwrite', 'preserve_manual')
//
// Trigger: update_employee_tariff_assignments_updated_at BEFORE UPDATE
model EmployeeTariffAssignment {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String    @map("tenant_id") @db.Uuid
  employeeId        String    @map("employee_id") @db.Uuid
  tariffId          String    @map("tariff_id") @db.Uuid
  effectiveFrom     DateTime  @map("effective_from") @db.Date
  effectiveTo       DateTime? @map("effective_to") @db.Date
  overwriteBehavior String    @default("preserve_manual") @map("overwrite_behavior") @db.VarChar(20)
  notes             String?   @db.Text
  isActive          Boolean   @default(true) @map("is_active")
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  // Note: tariffId FK references tariffs(id) ON DELETE CASCADE.
  // Tariff model not yet in Prisma. Relation will be added when it is.

  // Indexes
  @@index([tenantId], map: "idx_eta_tenant")
  @@index([employeeId], map: "idx_eta_employee")
  @@index([tariffId], map: "idx_eta_tariff")
  @@index([employeeId, effectiveFrom, effectiveTo], map: "idx_eta_employee_dates")
  @@index([employeeId, effectiveFrom, effectiveTo, isActive], map: "idx_eta_effective_lookup")
  @@map("employee_tariff_assignments")
}
```

### Steps

- [ ] Step 1: Add the EmployeeContact model block after the Employee model.
- [ ] Step 2: Add the EmployeeCard model block after EmployeeContact.
- [ ] Step 3: Add the EmployeeTariffAssignment model block after EmployeeCard.

### Verification
- EmployeeContact: 9 data fields (matching 8 DB columns + contactKindId from migration 000069)
- EmployeeCard: 12 data fields (matching 11 DB columns + cardType default)
- EmployeeTariffAssignment: 11 data fields (matching 10 DB columns + overwriteBehavior)

---

## Phase 3: Update Existing Models with Employee Relations

### Overview
Update 5 existing models to replace bare UUID fields/comments with proper Prisma relation annotations, and add reverse relation arrays where needed. Also update the Tenant model to include reverse relations for the new sub-entities.

### File to Modify
- `apps/web/prisma/schema.prisma`

### 3.1 Update User Model

**Current** (lines 50-53):
```prisma
  // Relations
  tenant      Tenant?      @relation(fields: [tenantId], references: [id])
  userGroup   UserGroup?   @relation(fields: [userGroupId], references: [id])
  userTenants UserTenant[]
```

**Change to**:
```prisma
  // Relations
  tenant      Tenant?      @relation(fields: [tenantId], references: [id])
  userGroup   UserGroup?   @relation(fields: [userGroupId], references: [id])
  employee    Employee?    @relation(fields: [employeeId], references: [id], onDelete: SetNull)
  userTenants UserTenant[]
```

This adds the `employee` relation using the existing `employeeId` field. The FK has `ON DELETE SET NULL` per migration 000014.

### 3.2 Update Department Model

**Current** (lines 378-384):
```prisma
  // Relations
  tenant   Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  parent   Department?  @relation("DepartmentTree", fields: [parentId], references: [id], onDelete: SetNull)
  children Department[] @relation("DepartmentTree")
  teams    Team[]
  // Note: managerEmployeeId FK references employees(id) ON DELETE SET NULL.
  // Employee model not yet in Prisma (TICKET-205). Relation will be added then.
```

**Change to**:
```prisma
  // Relations
  tenant    Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  parent    Department?  @relation("DepartmentTree", fields: [parentId], references: [id], onDelete: SetNull)
  children  Department[] @relation("DepartmentTree")
  manager   Employee?    @relation("DepartmentManager", fields: [managerEmployeeId], references: [id], onDelete: SetNull)
  employees Employee[]   @relation("EmployeeDepartment")
  teams     Team[]
```

This replaces the comment with the actual `manager` relation and adds the `employees` reverse relation for `Employee.departmentId`.

### 3.3 Update Team Model

**Current** (lines 412-417):
```prisma
  // Relations
  tenant     Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  department Department?  @relation(fields: [departmentId], references: [id], onDelete: SetNull)
  members    TeamMember[]
  // Note: leaderEmployeeId FK references employees(id) ON DELETE SET NULL.
  // Employee model not yet in Prisma (TICKET-205). Relation will be added then.
```

**Change to**:
```prisma
  // Relations
  tenant     Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  department Department?  @relation(fields: [departmentId], references: [id], onDelete: SetNull)
  leader     Employee?    @relation("TeamLeader", fields: [leaderEmployeeId], references: [id], onDelete: SetNull)
  members    TeamMember[]
```

### 3.4 Update TeamMember Model

**Current** (lines 442-445):
```prisma
  // Relations
  team Team @relation(fields: [teamId], references: [id], onDelete: Cascade)
  // Note: employeeId FK references employees(id) ON DELETE CASCADE.
  // Employee model not yet in Prisma (TICKET-205). Relation will be added then.
```

**Change to**:
```prisma
  // Relations
  team     Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)
```

### 3.5 Update Tenant Model — Add Reverse Relations

**Current** (lines 93-104):
```prisma
  // Relations
  users           User[]
  userGroups      UserGroup[]
  userTenants     UserTenant[]
  costCenters     CostCenter[]
  locations       Location[]
  employmentTypes EmploymentType[]
  holidays        Holiday[]
  accountGroups   AccountGroup[]
  accounts        Account[]
  departments     Department[]
  teams           Team[]
```

**Change to**:
```prisma
  // Relations
  users                    User[]
  userGroups               UserGroup[]
  userTenants              UserTenant[]
  costCenters              CostCenter[]
  locations                Location[]
  employmentTypes          EmploymentType[]
  holidays                 Holiday[]
  accountGroups            AccountGroup[]
  accounts                 Account[]
  departments              Department[]
  teams                    Team[]
  employees                Employee[]
  employeeCards            EmployeeCard[]
  employeeTariffAssignments EmployeeTariffAssignment[]
```

### 3.6 Update CostCenter Model — Add Reverse Relation

**Current** (lines 183-184):
```prisma
  // Relations
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
```

**Change to**:
```prisma
  // Relations
  tenant    Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employees Employee[]
```

### 3.7 Update EmploymentType Model — Add Reverse Relation

**Current** (lines 244-247):
```prisma
  // Relations
  tenant Tenant? @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  // Note: vacationCalcGroupId FK references vacation_calculation_groups(id) ON DELETE SET NULL.
  // VacationCalculationGroup model is not yet in Prisma. Relation will be added when it is.
```

**Change to**:
```prisma
  // Relations
  tenant    Tenant?    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employees Employee[]
  // Note: vacationCalcGroupId FK references vacation_calculation_groups(id) ON DELETE SET NULL.
  // VacationCalculationGroup model is not yet in Prisma. Relation will be added when it is.
```

### Steps

- [ ] Step 1: Update User model — add `employee Employee? @relation(...)` to its Relations section.
- [ ] Step 2: Update Department model — replace the Employee comment with `manager Employee?` and `employees Employee[]` relations using named relation `"DepartmentManager"` and `"EmployeeDepartment"`.
- [ ] Step 3: Update Team model — replace the Employee comment with `leader Employee?` relation using named relation `"TeamLeader"`.
- [ ] Step 4: Update TeamMember model — replace the Employee comment with `employee Employee` relation.
- [ ] Step 5: Update Tenant model — add `employees Employee[]`, `employeeCards EmployeeCard[]`, `employeeTariffAssignments EmployeeTariffAssignment[]` to its Relations section.
- [ ] Step 6: Update CostCenter model — add `employees Employee[]` to its Relations section.
- [ ] Step 7: Update EmploymentType model — add `employees Employee[]` to its Relations section.

### Verification
- `prisma validate` should succeed after all changes
- Every relation should be bidirectional

---

## Phase 4: Update Header Comment

### Overview
Update the header comment to reflect TICKET-205.

### Change

**Current** (line 1):
```prisma
// Prisma Schema for Terp — Core Foundation (ZMI-TICKET-200)
```

**Change to**:
```prisma
// Prisma Schema for Terp — Core Foundation (ZMI-TICKET-200, ZMI-TICKET-204, ZMI-TICKET-205)
```

### Steps
- [ ] Step 1: Update the header comment on line 1.

---

## Phase 5: Run prisma generate

### Overview
Run `prisma generate` to produce updated TypeScript types for all 17 models.

### Steps

- [ ] Step 1: From `apps/web/`, run `npx prisma generate` (or `pnpm db:generate`).
- [ ] Step 2: Verify the generated output in `apps/web/src/generated/prisma/` includes new model files.

### Verification

```bash
cd apps/web && npx prisma generate
```

Expected output:
- No errors
- Generated files in `apps/web/src/generated/prisma/models/` include Employee.ts, EmployeeContact.ts, EmployeeCard.ts, EmployeeTariffAssignment.ts
- `apps/web/src/generated/prisma/client.ts` exports all 17 model types

```bash
# Verify generated model files exist
ls apps/web/src/generated/prisma/models/Employee.ts
ls apps/web/src/generated/prisma/models/EmployeeContact.ts
ls apps/web/src/generated/prisma/models/EmployeeCard.ts
ls apps/web/src/generated/prisma/models/EmployeeTariffAssignment.ts
```

---

## Phase 6: TypeScript Compilation Verification

### Overview
Verify existing TypeScript code still compiles after the schema change.

### Steps

- [ ] Step 1: Run `cd apps/web && npx tsc --noEmit` to verify no type errors.
- [ ] Step 2: Run `cd apps/web && pnpm test` to verify all existing tests pass.

### Verification

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 0 errors.

```bash
cd apps/web && pnpm test
```

Expected: All existing tests pass. No test files are expected to be modified since existing tests use mock PrismaClient objects.

---

## Phase 7: Test Plan

### Overview
No new integration tests are needed (existing pattern uses mock PrismaClient, not real DB connections). Verify types are correct by importing and using the generated types.

### Type Verification Test

Create `apps/web/src/server/__tests__/employee-types.test.ts`:

```typescript
/**
 * Type verification tests for Employee Prisma models (ZMI-TICKET-205).
 *
 * These tests verify that the generated Prisma types have the expected shape
 * and that the Employee model types are available for use in application code.
 */
import { describe, it, expect } from "vitest"
import type {
  Employee,
  EmployeeContact,
  EmployeeCard,
  EmployeeTariffAssignment,
} from "@/generated/prisma/client"

describe("Employee Prisma types", () => {
  it("Employee type has all expected fields", () => {
    // Verify the type exists and has correct shape by creating a type-safe object
    const employee: Employee = {
      id: "00000000-0000-0000-0000-000000000001",
      tenantId: "00000000-0000-0000-0000-000000000002",
      personnelNumber: "EMP-001",
      pin: "1234",
      firstName: "Max",
      lastName: "Mustermann",
      email: "max@example.com",
      phone: "+49123456789",
      entryDate: new Date("2024-01-01"),
      exitDate: null,
      departmentId: null,
      costCenterId: null,
      employmentTypeId: null,
      weeklyHours: new Prisma.Decimal("40.00"),
      vacationDaysPerYear: new Prisma.Decimal("30.00"),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      tariffId: null,
      exitReason: null,
      notes: null,
      addressStreet: null,
      addressZip: null,
      addressCity: null,
      addressCountry: null,
      birthDate: null,
      gender: null,
      nationality: null,
      religion: null,
      maritalStatus: null,
      birthPlace: null,
      birthCountry: null,
      roomNumber: null,
      photoUrl: null,
      employeeGroupId: null,
      workflowGroupId: null,
      activityGroupId: null,
      partTimePercent: null,
      disabilityFlag: false,
      dailyTargetHours: null,
      weeklyTargetHours: null,
      monthlyTargetHours: null,
      annualTargetHours: null,
      workDaysPerWeek: null,
      calculationStartDate: null,
      defaultOrderId: null,
      defaultActivityId: null,
    }
    expect(employee.id).toBeDefined()
    expect(employee.personnelNumber).toBe("EMP-001")
    expect(employee.pin).toBe("1234")
  })

  it("EmployeeContact type has all expected fields", () => {
    const contact: EmployeeContact = {
      id: "00000000-0000-0000-0000-000000000001",
      employeeId: "00000000-0000-0000-0000-000000000002",
      contactType: "email",
      value: "max@example.com",
      label: "Work",
      isPrimary: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      contactKindId: null,
    }
    expect(contact.contactType).toBe("email")
    expect(contact.contactKindId).toBeNull()
  })

  it("EmployeeCard type has all expected fields", () => {
    const card: EmployeeCard = {
      id: "00000000-0000-0000-0000-000000000001",
      tenantId: "00000000-0000-0000-0000-000000000002",
      employeeId: "00000000-0000-0000-0000-000000000003",
      cardNumber: "CARD-001",
      cardType: "rfid",
      validFrom: new Date("2024-01-01"),
      validTo: null,
      isActive: true,
      deactivatedAt: null,
      deactivationReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    expect(card.cardNumber).toBe("CARD-001")
    expect(card.tenantId).toBeDefined()
    expect(card.deactivatedAt).toBeNull()
  })

  it("EmployeeTariffAssignment type has all expected fields", () => {
    const assignment: EmployeeTariffAssignment = {
      id: "00000000-0000-0000-0000-000000000001",
      tenantId: "00000000-0000-0000-0000-000000000002",
      employeeId: "00000000-0000-0000-0000-000000000003",
      tariffId: "00000000-0000-0000-0000-000000000004",
      effectiveFrom: new Date("2024-01-01"),
      effectiveTo: null,
      overwriteBehavior: "preserve_manual",
      notes: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    expect(assignment.overwriteBehavior).toBe("preserve_manual")
    expect(assignment.effectiveFrom).toBeDefined()
  })
})
```

**Note**: This test may need adjustment based on whether `Prisma.Decimal` is importable and how the generated types handle `Decimal` fields. The test pattern should match the existing test style in `apps/web/src/server/__tests__/`. If Decimal handling causes issues, use a simpler type assertion approach.

### Steps

- [ ] Step 1: Create the type verification test file.
- [ ] Step 2: Run `cd apps/web && pnpm test` and verify all tests pass.

---

## Phase 8: Final Verification Checklist

### Steps

- [ ] Step 1: Verify `apps/web/prisma/schema.prisma` has exactly 17 `model` declarations.
- [ ] Step 2: Verify Employee model has all 46 DB columns as Prisma fields (count the data fields, excluding relation fields).
- [ ] Step 3: Verify EmployeeContact has 9 fields (8 original + contactKindId).
- [ ] Step 4: Verify EmployeeCard has 12 fields (all 11 DB columns + any defaults).
- [ ] Step 5: Verify EmployeeTariffAssignment has 11 fields (all 10 DB columns + overwriteBehavior).
- [ ] Step 6: Verify Department no longer has the "TICKET-205" comment — replaced with actual `manager` and `employees` relations.
- [ ] Step 7: Verify Team no longer has the "TICKET-205" comment — replaced with actual `leader` relation.
- [ ] Step 8: Verify TeamMember no longer has the "TICKET-205" comment — replaced with actual `employee` relation.
- [ ] Step 9: Verify User has `employee Employee?` relation.
- [ ] Step 10: Verify Tenant has `employees`, `employeeCards`, `employeeTariffAssignments` reverse relations.
- [ ] Step 11: Verify CostCenter has `employees Employee[]` reverse relation.
- [ ] Step 12: Verify EmploymentType has `employees Employee[]` reverse relation.
- [ ] Step 13: Verify `prisma generate` succeeds without errors.
- [ ] Step 14: Verify `npx tsc --noEmit` passes.
- [ ] Step 15: Verify `pnpm test` passes.
- [ ] Step 16: Run `grep -c "TICKET-205" apps/web/prisma/schema.prisma` — should return 0 (all "TICKET-205" comments should be removed and replaced with actual relations).

---

## Success Criteria

- [ ] Employee model defined with all 46 DB columns as Prisma fields
- [ ] EmployeeContact model defined with all 9 fields (including contactKindId from migration 000069)
- [ ] EmployeeCard model defined with all 12 fields (including tenantId, deactivatedAt, deactivationReason)
- [ ] EmployeeTariffAssignment model defined with all 11 fields (including overwriteBehavior, notes)
- [ ] Unique constraints: `[tenantId, personnelNumber]` and `[tenantId, pin]` on Employee; `[tenantId, cardNumber]` on EmployeeCard
- [ ] All 11 Employee indexes, 3 EmployeeContact indexes, 3 EmployeeCard indexes, 5 EmployeeTariffAssignment indexes declared with correct `map:` names
- [ ] Department.managerEmployeeId has proper `manager Employee?` relation (named "DepartmentManager")
- [ ] Department has `employees Employee[]` reverse relation (named "EmployeeDepartment")
- [ ] Team.leaderEmployeeId has proper `leader Employee?` relation (named "TeamLeader")
- [ ] TeamMember.employeeId has proper `employee Employee` relation
- [ ] User.employeeId has proper `employee Employee?` relation
- [ ] Tenant, CostCenter, EmploymentType all have `employees Employee[]` reverse relations
- [ ] Tenant also has `employeeCards EmployeeCard[]` and `employeeTariffAssignments EmployeeTariffAssignment[]`
- [ ] No "TICKET-205" placeholder comments remain in the schema
- [ ] `prisma generate` succeeds
- [ ] TypeScript compilation succeeds
- [ ] All existing tests pass
- [ ] No columns from the ticket that do NOT exist in the DB are included (title, mobile, location_id, tax_id, social_security_number, health_insurance, bank_name, iban, bic, salary_type, salary_amount, vacation_days_previous)
- [ ] No `location` relation on Employee (no FK exists in DB)

## Notes

### validFrom Default on EmployeeCard
The DB has `valid_from DATE NOT NULL DEFAULT CURRENT_DATE`. Prisma does not have a native `CURRENT_DATE` default. Use `@default(dbgenerated("CURRENT_DATE"))` to express this. If `prisma generate` rejects this syntax, fall back to just marking it as non-nullable without a Prisma-side default (the DB default will handle it at insert time), i.e., just `DateTime @map("valid_from") @db.Date` without `@default`.

### Decimal Fields
Prisma uses the `Decimal` type which maps to PostgreSQL's `DECIMAL`/`NUMERIC`. The generated TypeScript type is `Prisma.Decimal` from the Prisma namespace. The test file may need to import `Prisma` from the generated client to use `Prisma.Decimal`.

### User-Employee Relation Direction
In the database, the FK `employee_id` is on the `users` table pointing to `employees(id)`. In Prisma terms, User "owns" the relation (has the `fields`/`references`). Employee gets the implicit reverse side (`user User?` with no fields/references). This is a 1:1 optional relation.
