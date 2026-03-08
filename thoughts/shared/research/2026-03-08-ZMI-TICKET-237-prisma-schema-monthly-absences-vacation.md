# Research: ZMI-TICKET-237 -- Prisma Schema: monthly_values, absences, vacation_balances

**Date**: 2026-03-08
**Branch**: staging
**Repository**: terp

## Research Question

Document the current state of the monthly_values, absence_days, and vacation_balances tables across Go models, SQL migrations, existing Prisma schema, and tRPC/frontend usage -- as context for adding the AbsenceDay model to the Prisma schema and verifying the existing MonthlyValue and VacationBalance models in ZMI-TICKET-237.

## Summary

The Prisma schema at `apps/web/prisma/schema.prisma` (2908 lines) already contains **MonthlyValue** (line 2374) and **VacationBalance** (line 1722) models. It does **NOT** contain an **AbsenceDay** model. The `absence_days` table exists in the database (migration 000026) and is accessed via raw SQL (`$queryRaw` / `$executeRaw`) in at least 3 tRPC routers/services: `daily-calc.ts`, `reports.ts`, and `absenceTypes.ts`. The Go backend has full model/repository/service/handler implementations for all three entities.

**Key finding -- ticket schema vs. actual DB/Prisma**:
- The ticket proposes a significantly different schema for MonthlyValue (simplified with `status`, `planned_hours`, `actual_hours`, `overtime_hours`, `absence_days`, `vacation_days`, `sick_days`, `account_values Json?`) compared to the existing Prisma model and DB table which use detailed minute-based integer fields (`total_gross_time`, `total_net_time`, `total_target_time`, `total_overtime`, `total_undertime`, `total_break_time`, flextime fields, `is_closed` boolean, etc.).
- The ticket proposes a different VacationBalance schema (with `carried_over`, `used`, `planned`, `remaining`, `expires_at`) compared to the existing Prisma model and DB which use `carryover`, `taken`, `adjustments`, `carryover_expires_at` (no `planned` or `remaining` columns).
- The ticket proposes an AbsenceDay schema with `hours`, `is_half_day`, `notes`, `approved_at`, `approved_by`, `rejected_at`, `rejected_by`, `rejection_reason`, `absence_range_id` -- the actual DB table uses `duration DECIMAL(3,2)`, `half_day_period VARCHAR(10)`, `status`, `approved_by`, `approved_at`, `rejection_reason`, `notes`, `created_by` (no `hours`, `is_half_day`, `rejected_at`, `rejected_by`, or `absence_range_id` columns).

## Detailed Findings

### 1. Existing Prisma Models

#### MonthlyValue (already in Prisma -- line 2374)

**File**: `apps/web/prisma/schema.prisma`, lines 2374-2412

```prisma
model MonthlyValue {
  id               String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId         String    @map("tenant_id") @db.Uuid
  employeeId       String    @map("employee_id") @db.Uuid
  year             Int
  month            Int
  totalGrossTime   Int       @default(0) @map("total_gross_time")
  totalNetTime     Int       @default(0) @map("total_net_time")
  totalTargetTime  Int       @default(0) @map("total_target_time")
  totalOvertime    Int       @default(0) @map("total_overtime")
  totalUndertime   Int       @default(0) @map("total_undertime")
  totalBreakTime   Int       @default(0) @map("total_break_time")
  flextimeStart    Int       @default(0) @map("flextime_start")
  flextimeChange   Int       @default(0) @map("flextime_change")
  flextimeEnd      Int       @default(0) @map("flextime_end")
  flextimeCarryover Int      @default(0) @map("flextime_carryover")
  vacationTaken    Decimal   @default(0) @map("vacation_taken") @db.Decimal(5, 2)
  sickDays         Int       @default(0) @map("sick_days")
  otherAbsenceDays Int       @default(0) @map("other_absence_days")
  workDays         Int       @default(0) @map("work_days")
  daysWithErrors   Int       @default(0) @map("days_with_errors")
  isClosed         Boolean   @default(false) @map("is_closed")
  closedAt         DateTime? @map("closed_at") @db.Timestamptz(6)
  closedBy         String?   @map("closed_by") @db.Uuid
  reopenedAt       DateTime? @map("reopened_at") @db.Timestamptz(6)
  reopenedBy       String?   @map("reopened_by") @db.Uuid
  createdAt        DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  @@unique([employeeId, year, month])
  @@index([tenantId], map: "idx_mv_tenant")
  @@index([employeeId], map: "idx_mv_employee")
  @@map("monthly_values")
}
```

Reverse relations already exist on:
- `Tenant.monthlyValues MonthlyValue[]` (line 153)
- `Employee.monthlyValues MonthlyValue[]` (line 619)

#### VacationBalance (already in Prisma -- line 1722)

**File**: `apps/web/prisma/schema.prisma`, lines 1722-1744

```prisma
model VacationBalance {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String    @map("tenant_id") @db.Uuid
  employeeId        String    @map("employee_id") @db.Uuid
  year              Int
  entitlement       Decimal   @default(0) @db.Decimal(5, 2)
  carryover         Decimal   @default(0) @db.Decimal(5, 2)
  adjustments       Decimal   @default(0) @db.Decimal(5, 2)
  taken             Decimal   @default(0) @db.Decimal(5, 2)
  carryoverExpiresAt DateTime? @map("carryover_expires_at") @db.Date
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  @@unique([employeeId, year], map: "vacation_balances_employee_id_year_key")
  @@index([tenantId], map: "idx_vacation_balances_tenant")
  @@index([employeeId], map: "idx_vacation_balances_employee")
  @@map("vacation_balances")
}
```

Reverse relations already exist on:
- `Tenant.vacationBalances VacationBalance[]` (line 136)
- `Employee.vacationBalances VacationBalance[]` (line 613)

#### AbsenceDay (NOT in Prisma)

No `AbsenceDay` model exists in the Prisma schema. The `AbsenceType` model (line 1110) has NO reverse relation to `AbsenceDay`. The `Employee` model has NO `absenceDays` relation. The `Tenant` model has NO `absenceDays` relation.

### 2. Database Migrations

#### Table: `absence_days`

| Migration | Operation |
|-----------|-----------|
| `000026_create_absence_days.up.sql` | CREATE TABLE |

**Complete column list** (14 columns):
id (UUID PK), tenant_id (FK tenants CASCADE), employee_id (FK employees CASCADE), absence_date (DATE NOT NULL), absence_type_id (FK absence_types NOT NULL), duration (DECIMAL(3,2) NOT NULL DEFAULT 1.00), half_day_period (VARCHAR(10)), status (VARCHAR(20) NOT NULL DEFAULT 'pending'), approved_by (FK users SET NULL), approved_at (TIMESTAMPTZ), rejection_reason (TEXT), notes (TEXT), created_by (FK users), created_at (TIMESTAMPTZ), updated_at (TIMESTAMPTZ)

**Indexes**:
- `idx_absence_days_tenant` ON (tenant_id)
- `idx_absence_days_employee` ON (employee_id)
- `idx_absence_days_date` ON (absence_date)
- `idx_absence_days_type` ON (absence_type_id)
- `idx_absence_days_status` ON (status)
- `idx_absence_days_lookup` ON (employee_id, absence_date)
- `idx_absence_days_unique` UNIQUE ON (employee_id, absence_date) WHERE status != 'cancelled' (partial unique index, cannot be modeled in Prisma)
- `idx_absence_days_range` ON (employee_id, absence_date, status)

**Trigger**: `update_absence_days_updated_at` BEFORE UPDATE (auto-sets updated_at)

#### Table: `vacation_balances`

| Migration | Operation |
|-----------|-----------|
| `000027_create_vacation_balances.up.sql` | CREATE TABLE with id, tenant_id, employee_id, year, entitlement, carryover, adjustments, taken, created_at, updated_at |
| `000052_create_employee_capping_exceptions.up.sql` | ALTER TABLE ADD COLUMN carryover_expires_at (DATE) |

**Complete column list** (10 columns):
id (UUID PK), tenant_id (FK tenants CASCADE), employee_id (FK employees CASCADE), year (INT NOT NULL), entitlement (DECIMAL(5,2) DEFAULT 0), carryover (DECIMAL(5,2) DEFAULT 0), adjustments (DECIMAL(5,2) DEFAULT 0), taken (DECIMAL(5,2) DEFAULT 0), created_at (TIMESTAMPTZ), updated_at (TIMESTAMPTZ), carryover_expires_at (DATE, added in migration 000052)

**Indexes**:
- `idx_vacation_balances_tenant` ON (tenant_id)
- `idx_vacation_balances_employee` ON (employee_id)
- `idx_vacation_balances_employee_year` UNIQUE ON (employee_id, year)

**Trigger**: `update_vacation_balances_updated_at` BEFORE UPDATE

#### Table: `monthly_values`

| Migration | Operation |
|-----------|-----------|
| `000028_create_monthly_values.up.sql` | CREATE TABLE with all columns |

**Complete column list** (22 columns):
id (UUID PK), tenant_id (FK tenants CASCADE), employee_id (FK employees CASCADE), year (INT NOT NULL), month (INT NOT NULL), total_gross_time (INT DEFAULT 0), total_net_time (INT DEFAULT 0), total_target_time (INT DEFAULT 0), total_overtime (INT DEFAULT 0), total_undertime (INT DEFAULT 0), total_break_time (INT DEFAULT 0), flextime_start (INT DEFAULT 0), flextime_change (INT DEFAULT 0), flextime_end (INT DEFAULT 0), flextime_carryover (INT DEFAULT 0), vacation_taken (DECIMAL(5,2) DEFAULT 0), sick_days (INT DEFAULT 0), other_absence_days (INT DEFAULT 0), work_days (INT DEFAULT 0), days_with_errors (INT DEFAULT 0), is_closed (BOOLEAN DEFAULT false), closed_at (TIMESTAMPTZ), closed_by (FK users SET NULL), reopened_at (TIMESTAMPTZ), reopened_by (FK users SET NULL), created_at (TIMESTAMPTZ), updated_at (TIMESTAMPTZ). UNIQUE(employee_id, year, month).

**Indexes**:
- `idx_monthly_values_tenant` ON (tenant_id)
- `idx_monthly_values_employee` ON (employee_id)
- `idx_monthly_values_lookup` ON (employee_id, year, month)
- `idx_monthly_values_period` ON (year, month)

**Trigger**: `update_monthly_values_updated_at` BEFORE UPDATE

### 3. Go Models

#### MonthlyValue (`apps/api/internal/model/monthlyvalue.go`, 75 lines)

```go
type MonthlyValue struct {
    ID         uuid.UUID
    TenantID   uuid.UUID
    EmployeeID uuid.UUID
    Year       int
    Month      int
    // Aggregated time totals (all in minutes)
    TotalGrossTime  int
    TotalNetTime    int
    TotalTargetTime int
    TotalOvertime   int
    TotalUndertime  int
    TotalBreakTime  int
    // Flextime balance (all in minutes)
    FlextimeStart     int
    FlextimeChange    int
    FlextimeEnd       int
    FlextimeCarryover int
    // Absence summary
    VacationTaken    decimal.Decimal  // decimal(5,2)
    SickDays         int
    OtherAbsenceDays int
    // Work summary
    WorkDays       int
    DaysWithErrors int
    // Month closing
    IsClosed   bool
    ClosedAt   *time.Time
    ClosedBy   *uuid.UUID
    ReopenedAt *time.Time
    ReopenedBy *uuid.UUID
    // Timestamps
    CreatedAt time.Time
    UpdatedAt time.Time
    // Relations
    Employee *Employee
}
```

Table name: `monthly_values`
Helper methods: `Balance()` (returns TotalOvertime - TotalUndertime), `FormatFlextimeEnd()`.

#### AbsenceDay (`apps/api/internal/model/absenceday.go`, 111 lines)

```go
type AbsenceStatus string  // "pending", "approved", "rejected", "cancelled"
type HalfDayPeriod string  // "morning", "afternoon"

type AbsenceDay struct {
    ID            uuid.UUID
    TenantID      uuid.UUID
    EmployeeID    uuid.UUID
    CreatedAt     time.Time
    UpdatedAt     time.Time
    AbsenceDate   time.Time        // DB type: date
    AbsenceTypeID uuid.UUID
    Duration      decimal.Decimal  // decimal(3,2), default 1.00
    HalfDayPeriod *HalfDayPeriod   // varchar(10)
    Status        AbsenceStatus    // varchar(20), default 'pending'
    ApprovedBy    *uuid.UUID
    ApprovedAt    *time.Time
    RejectionReason *string
    Notes         *string
    CreatedBy     *uuid.UUID
    // Relations
    Employee    *Employee
    AbsenceType *AbsenceType
}
```

Table name: `absence_days`
Helper methods: `IsFullDay()`, `IsHalfDay()`, `IsApproved()`, `IsCancelled()`, `CalculateCredit(regelarbeitszeit int)`.

Also defines `AbsenceListOptions` struct with filters for EmployeeID, AbsenceTypeID, Status, From, To, ScopeType, ScopeDepartmentIDs, ScopeEmployeeIDs.

#### VacationBalance (`apps/api/internal/model/vacationbalance.go`, 40 lines)

```go
type VacationBalance struct {
    ID                 uuid.UUID
    TenantID           uuid.UUID
    EmployeeID         uuid.UUID
    Year               int
    Entitlement        decimal.Decimal  // decimal(5,2)
    Carryover          decimal.Decimal  // decimal(5,2)
    Adjustments        decimal.Decimal  // decimal(5,2)
    Taken              decimal.Decimal  // decimal(5,2)
    CarryoverExpiresAt *time.Time       // date
    CreatedAt          time.Time
    UpdatedAt          time.Time
    Employee           *Employee
}
```

Table name: `vacation_balances`
Helper methods: `Total()` (Entitlement + Carryover + Adjustments), `Available()` (Total - Taken).

### 4. Go Backend Usage

#### Repository layer

| File | Entity |
|------|--------|
| `apps/api/internal/repository/monthlyvalue.go` | MonthlyValue CRUD |
| `apps/api/internal/repository/absenceday.go` | AbsenceDay CRUD |
| `apps/api/internal/repository/vacationbalance.go` | VacationBalance CRUD |

All three have corresponding test files (`*_test.go`).

#### Service layer

| File | Uses |
|------|------|
| `apps/api/internal/service/monthlyvalue.go` | MonthlyValue |
| `apps/api/internal/service/monthlycalc.go` | MonthlyValue |
| `apps/api/internal/service/monthlyeval.go` | MonthlyValue |
| `apps/api/internal/service/absence.go` | AbsenceDay |
| `apps/api/internal/service/daily_calc.go` | AbsenceDay |
| `apps/api/internal/service/vacationbalance.go` | VacationBalance |
| `apps/api/internal/service/vacation.go` | VacationBalance |
| `apps/api/internal/service/vacationcarryover.go` | VacationBalance |
| `apps/api/internal/service/recalc.go` | AbsenceDay |
| `apps/api/internal/service/payrollexport.go` | MonthlyValue |
| `apps/api/internal/service/report.go` | MonthlyValue, AbsenceDay |
| `apps/api/internal/service/booking_test.go` | AbsenceDay |

#### Handler layer

| File | Entities |
|------|----------|
| `apps/api/internal/handler/monthly_value.go` | MonthlyValue |
| `apps/api/internal/handler/monthlyeval.go` | MonthlyValue |
| `apps/api/internal/handler/absence.go` | AbsenceDay |
| `apps/api/internal/handler/vacation_balance.go` | VacationBalance |
| `apps/api/internal/handler/vacation.go` | VacationBalance |
| `apps/api/internal/handler/payrollexport.go` | MonthlyValue |

### 5. Frontend/tRPC Usage of absence_days (Raw SQL)

The absence_days table is accessed via raw SQL in several places:

**`apps/web/src/server/services/daily-calc.ts`** (line 353, 937):
- Line 353: `SELECT ... FROM absence_days ad LEFT JOIN absence_types at ...` -- queries absence records for a specific employee and date during daily calculation
- Line 937: `INSERT INTO absence_days ...` -- creates auto-absence entries during daily calculation

**`apps/web/src/server/routers/reports.ts`** (line 948):
- `FROM absence_days ad` -- joins with absence data in report queries

**`apps/web/src/server/routers/absenceTypes.ts`** (lines 435, 468-470):
- Checks usage in `absence_days` table before allowing deletion of an absence type
- `SELECT COUNT(*)::int as count FROM absence_days WHERE absence_type_id = $1`

**`apps/web/src/server/services/daily-calc.helpers.ts`**, **`daily-calc.types.ts`**:
- References `AbsenceDay` type used in daily calculation helper functions

### 6. Frontend/tRPC Usage of MonthlyValue (via Prisma ORM)

The MonthlyValue model IS in Prisma and used via Prisma ORM queries. Files referencing it:

**Hook**: `apps/web/src/hooks/api/use-monthly-values.ts`
**Admin hook**: `apps/web/src/hooks/api/use-admin-monthly-values.ts`
**Page**: `apps/web/src/app/[locale]/(dashboard)/admin/monthly-values/page.tsx`
**Components**: `apps/web/src/components/monthly-values/` (data table, detail sheet, batch actions, toolbar, etc.)
**Reports router**: `apps/web/src/server/routers/reports.ts`
**Payroll exports router**: `apps/web/src/server/routers/payrollExports.ts`

### 7. Frontend/tRPC Usage of VacationBalance (via Prisma ORM)

The VacationBalance model IS in Prisma and used via Prisma ORM queries. Files referencing it:

**Hook**: `apps/web/src/hooks/api/use-vacation-balance.ts`
**Router**: `apps/web/src/server/routers/vacation.ts`
**Pages**: `apps/web/src/app/[locale]/(dashboard)/vacation/page.tsx`, `apps/web/src/app/[locale]/(dashboard)/admin/vacation-balances/page.tsx`
**Components**: `apps/web/src/components/vacation-balances/` (detail sheet, data table, toolbar, form sheet, initialize dialog), `apps/web/src/components/vacation/balance-breakdown.tsx`, `apps/web/src/components/dashboard/vacation-balance-card.tsx`, `apps/web/src/components/absences/vacation-balance-card.tsx`

### 8. Ticket Schema vs. Actual DB -- Discrepancies

#### MonthlyValue -- Ticket proposes replacing existing schema

The ticket proposes a simplified MonthlyValue:
- `status String @default("open")` -- DB has `is_closed Boolean`
- `work_days Int?` -- DB has `work_days INT DEFAULT 0` (NOT NULL equivalent via default)
- `planned_hours Decimal?` -- No such column in DB
- `actual_hours Decimal?` -- No such column in DB (DB uses `total_net_time INT` in minutes)
- `overtime_hours Decimal?` -- No such column (DB uses `total_overtime INT` in minutes)
- `absence_days Decimal?` -- No such column (DB has separate `sick_days`, `other_absence_days`, `vacation_taken`)
- `vacation_days Decimal?` -- No such column (DB uses `vacation_taken DECIMAL(5,2)`)
- `sick_days Decimal?` -- DB has `sick_days INT`
- `account_values Json?` -- No such column in DB
- Missing from ticket: all flextime fields (`flextime_start/change/end/carryover`), `total_gross_time`, `total_target_time`, `total_undertime`, `total_break_time`, `days_with_errors`, `reopened_at`, `reopened_by`

The existing Prisma MonthlyValue model already matches the DB schema exactly.

#### VacationBalance -- Ticket proposes different column names

The ticket proposes:
- `carried_over Decimal` -- DB has `carryover`
- `used Decimal` -- DB has `taken`
- `planned Decimal @default(0)` -- No such column in DB
- `remaining Decimal @default(0)` -- No such column in DB
- `expires_at DateTime?` -- DB has `carryover_expires_at`
- `notes String?` -- No such column in DB
- Missing from ticket: `adjustments` column

The existing Prisma VacationBalance model already matches the DB schema exactly.

#### AbsenceDay -- Ticket proposes different schema from DB

The ticket proposes:
- `date DateTime @db.Date` -- DB has `absence_date DATE`
- `hours Decimal?` -- No such column in DB (DB uses `duration DECIMAL(3,2)`)
- `is_half_day Boolean` -- No such column in DB (DB uses `half_day_period VARCHAR(10)`)
- `approved_at DateTime?` -- Matches DB
- `approved_by String?` -- Matches DB
- `rejected_at DateTime?` -- No such column in DB
- `rejected_by String?` -- No such column in DB
- `rejection_reason String?` -- Matches DB
- `absence_range_id String?` -- No such column in DB
- `deleted_at DateTime?` -- No such column in DB
- Missing from ticket: `duration`, `half_day_period`, `created_by`

### 9. Prisma Setup and Conventions

**File**: `apps/web/prisma/schema.prisma`

**Generator**:
```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}
```

**Datasource**:
```prisma
datasource db {
  provider = "postgresql"
}
```

**Key conventions** (from existing models):
1. Schema is **read-only** against DB. Comments at top: "DO NOT run `prisma db push` or `prisma migrate dev`. Schema changes are managed via SQL migrations in db/migrations/."
2. IDs use `@default(dbgenerated("gen_random_uuid()"))` not `@default(uuid())`
3. Column mapping via `@map("snake_case")` for camelCase Prisma fields
4. Table mapping via `@@map("table_name")`
5. All UUIDs annotated with `@db.Uuid`
6. Timestamps use `@db.Timestamptz(6)` for `created_at`/`updated_at`
7. `updatedAt` gets `@updatedAt` annotation
8. Relations include `onDelete` clause matching DB FK constraints
9. Indexes include `map:` for named indexes matching existing DB index names
10. Each model has a section comment block documenting relevant migrations, CHECK constraints, partial indexes, and triggers
11. Partial unique indexes are documented in comments as "cannot be modeled in Prisma"
12. Reverse relations are added to parent models (Tenant, Employee, etc.)

### 10. AbsenceType Model (Relation Target)

**File**: `apps/web/prisma/schema.prisma`, lines 1110-1142

The AbsenceType model currently has NO reverse relation to AbsenceDay (since AbsenceDay doesn't exist in Prisma yet). When AbsenceDay is added, a reverse relation `absenceDays AbsenceDay[]` needs to be added to AbsenceType.

Fields on AbsenceType relevant to AbsenceDay:
- `id` (PK, UUID)
- `tenantId` (nullable -- system types have NULL tenant_id)
- `category` (VARCHAR(20))
- `portion` (INT, default 1)
- `deductsVacation` (Boolean)
- `requiresApproval` (Boolean)

### 11. Employee Model Reverse Relations (Current State)

The Employee model (line 532-640) already has:
- `monthlyValues MonthlyValue[]` (line 619)
- `vacationBalances VacationBalance[]` (line 613)
- NO `absenceDays` relation

When AbsenceDay is added, an `absenceDays AbsenceDay[]` reverse relation needs to be added to Employee.

### 12. Tenant Model Reverse Relations (Current State)

The Tenant model (line 83-172) already has:
- `monthlyValues MonthlyValue[]` (line 153)
- `vacationBalances VacationBalance[]` (line 136)
- NO `absenceDays` relation

When AbsenceDay is added, an `absenceDays AbsenceDay[]` reverse relation needs to be added to Tenant.

### 13. Generated Client Output

After `prisma generate`, models are output to `apps/web/src/generated/prisma/models/`:
- `MonthlyValue.ts` exists
- `VacationBalance.ts` exists
- `AbsenceDay.ts` does NOT exist (will be generated when model is added)
