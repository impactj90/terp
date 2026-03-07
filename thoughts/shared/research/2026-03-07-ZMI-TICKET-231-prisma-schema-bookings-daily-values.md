# Research: ZMI-TICKET-231 -- Prisma Schema: bookings, daily_values, daily_account_values

**Date**: 2026-03-07
**Branch**: staging
**Repository**: terp

## Research Question

Document the current state of the bookings, daily_values, and daily_account_values tables across Go models, SQL migrations, existing Prisma schema, and tRPC router usage -- as context for adding the Booking, DailyValue, and DailyAccountValue models to the Prisma schema in ZMI-TICKET-231.

## Summary

The Prisma schema at `apps/web/prisma/schema.prisma` (2726 lines, ~60+ models) does NOT contain Booking, DailyValue, or DailyAccountValue models. The `RawTerminalBooking` model (line 2447) explicitly notes "Booking model is not yet in Prisma" with `processedBookingId` stored as a bare UUID. Multiple tRPC routers (`systemSettings`, `correctionAssistant`, `reports`, `bookingTypes`) use `$queryRawUnsafe` / `$executeRawUnsafe` to access these tables. The Go backend has full model/repository/service/handler implementations for all three entities. The database tables are defined across migrations 000022 (bookings), 000024+000034 (daily_values), 000078 (bookings ALTER), and 000079 (daily_account_values).

**Critical discrepancies between ticket schema and actual DB**:
- Ticket's Booking model uses `time String?` / `end_time String?` / `duration_minutes Int?` / `is_pair_start Boolean` / `is_pair_end Boolean` / `is_deleted Boolean` / `deleted_at DateTime?` -- NONE of these columns exist in the DB. Actual DB uses `original_time INT` / `edited_time INT` / `calculated_time INT` and has no soft-delete columns.
- Ticket's DailyValue model uses `planned_hours Decimal?` / `actual_hours Decimal?` / `overtime_hours Decimal?` / `break_minutes Int?` / `first_booking String?` / `last_booking String?` / `absence_type_id String?` / `absence_hours Decimal?` / `approved_at DateTime?` / `approved_by String?` -- NONE match the actual DB columns. Actual DB uses `gross_time INT` / `net_time INT` / `target_time INT` / `overtime INT` / `undertime INT` / `break_time INT` / `first_come INT` / `last_go INT` etc.
- Ticket's DailyAccountValue model uses `daily_value_id String` / `value Decimal` / `unit String?` -- the actual DB has no `daily_value_id` column; instead it uses `tenant_id` / `employee_id` / `value_date` / `value_minutes INT` / `source VARCHAR(20)` / `day_plan_id UUID`.

## Detailed Findings

### 1. Current Prisma Schema -- No Booking/DailyValue/DailyAccountValue Models

**File**: `apps/web/prisma/schema.prisma` (2726 lines)

The schema contains ~60+ models but NONE for:
- `Booking` (table `bookings`)
- `DailyValue` (table `daily_values`)
- `DailyAccountValue` (table `daily_account_values`)

**Explicit "not yet" comment** in `RawTerminalBooking` model (line 2444-2469):
```prisma
// processed_booking_id is a plain UUID without Prisma relation because the
// Booking model is not yet in Prisma.
model RawTerminalBooking {
  // ...
  processedBookingId String?   @map("processed_booking_id") @db.Uuid
  // Note: processedBookingId is NOT a Prisma relation because Booking model doesn't exist yet
}
```

### 2. Database Migrations

#### Table: `bookings`

| Migration | Operation |
|-----------|-----------|
| `000022_create_bookings.up.sql` | CREATE TABLE with: id (UUID PK), tenant_id (FK tenants CASCADE), employee_id (FK employees CASCADE), booking_date (DATE NOT NULL), booking_type_id (FK booking_types NOT NULL), original_time (INT NOT NULL), edited_time (INT NOT NULL), calculated_time (INT nullable), pair_id (UUID nullable), source (VARCHAR(20) DEFAULT 'web'), terminal_id (UUID nullable), notes (TEXT), created_at (TIMESTAMPTZ), updated_at (TIMESTAMPTZ), created_by (UUID), updated_by (UUID). Indexes: idx_bookings_tenant, idx_bookings_employee_date, idx_bookings_date, idx_bookings_pair (partial). |
| `000078_booking_reason_adjustments.up.sql` | ALTER TABLE ADD COLUMNS: booking_reason_id (FK booking_reasons SET NULL), is_auto_generated (BOOLEAN DEFAULT false), original_booking_id (FK bookings CASCADE). Partial indexes: idx_bookings_reason, idx_bookings_auto_gen, idx_bookings_original. |

**Complete bookings column list in DB** (19 columns):
id, tenant_id, employee_id, booking_date, booking_type_id, original_time, edited_time, calculated_time, pair_id, source, terminal_id, notes, created_at, updated_at, created_by, updated_by, booking_reason_id, is_auto_generated, original_booking_id

**No update trigger** exists on the bookings table.

#### Table: `daily_values`

| Migration | Operation |
|-----------|-----------|
| `000024_create_daily_values.up.sql` | CREATE TABLE with: id (UUID PK), tenant_id (FK tenants CASCADE), employee_id (FK employees CASCADE), value_date (DATE NOT NULL), gross_time (INT DEFAULT 0), net_time (INT DEFAULT 0), target_time (INT DEFAULT 0), overtime (INT DEFAULT 0), undertime (INT DEFAULT 0), break_time (INT DEFAULT 0), has_error (BOOLEAN DEFAULT false), error_codes (TEXT[]), warnings (TEXT[]), first_come (INT nullable), last_go (INT nullable), booking_count (INT DEFAULT 0), calculated_at (TIMESTAMPTZ), calculation_version (INT DEFAULT 1), created_at (TIMESTAMPTZ), updated_at (TIMESTAMPTZ). UNIQUE(employee_id, value_date). Indexes: idx_daily_values_tenant, idx_daily_values_employee, idx_daily_values_date, idx_daily_values_lookup, idx_daily_values_errors (partial). |
| `000034_add_daily_values_status.up.sql` | ALTER TABLE ADD COLUMN status (VARCHAR(20) NOT NULL DEFAULT 'calculated'). Index: idx_daily_values_status. |

**Complete daily_values column list in DB** (21 columns):
id, tenant_id, employee_id, value_date, gross_time, net_time, target_time, overtime, undertime, break_time, has_error, error_codes, warnings, first_come, last_go, booking_count, calculated_at, calculation_version, created_at, updated_at, status

**No update trigger** exists on the daily_values table.

#### Table: `daily_account_values`

| Migration | Operation |
|-----------|-----------|
| `000079_add_day_plan_net_cap_accounts.up.sql` | CREATE TABLE with: id (UUID PK), tenant_id (FK tenants CASCADE), employee_id (FK employees CASCADE), account_id (FK accounts CASCADE), value_date (DATE NOT NULL), value_minutes (INT NOT NULL DEFAULT 0), source (VARCHAR(20) NOT NULL), day_plan_id (FK day_plans SET NULL), created_at (TIMESTAMPTZ), updated_at (TIMESTAMPTZ). UNIQUE(employee_id, value_date, account_id, source). Indexes: idx_daily_account_values_tenant, idx_daily_account_values_employee, idx_daily_account_values_account, idx_daily_account_values_date, idx_daily_account_values_lookup. |

**Complete daily_account_values column list in DB** (10 columns):
id, tenant_id, employee_id, account_id, value_date, value_minutes, source, day_plan_id, created_at, updated_at

**No update trigger** exists on the daily_account_values table.

### 3. Go Models

#### `apps/api/internal/model/booking.go` (101 lines)

```go
type Booking struct {
    ID            uuid.UUID    // PK
    TenantID      uuid.UUID    // FK tenants
    EmployeeID    uuid.UUID    // FK employees
    BookingDate   time.Time    // DATE
    BookingTypeID uuid.UUID    // FK booking_types
    OriginalTime   int         // INT NOT NULL (minutes from midnight)
    EditedTime     int         // INT NOT NULL (minutes from midnight)
    CalculatedTime *int        // INT nullable
    PairID        *uuid.UUID   // UUID nullable
    Source        BookingSource // VARCHAR(20) DEFAULT 'web'
    TerminalID    *uuid.UUID   // UUID nullable
    Notes         string       // TEXT
    BookingReasonID   *uuid.UUID  // FK booking_reasons (migration 000078)
    IsAutoGenerated   bool        // BOOLEAN DEFAULT false (migration 000078)
    OriginalBookingID *uuid.UUID  // FK bookings (migration 000078)
    CreatedAt     time.Time
    UpdatedAt     time.Time
    CreatedBy     *uuid.UUID
    UpdatedBy     *uuid.UUID
    // Relations
    Employee      *Employee
    BookingType   *BookingType
    Pair          *Booking
    BookingReason *BookingReason
}
```

BookingSource enum: `web`, `terminal`, `api`, `import`, `correction`, `derived`.

Helper methods: `TimeString()`, `EffectiveTime()`, `IsEdited()`, `MinutesToTime()`.

#### `apps/api/internal/model/dailyvalue.go` (113 lines)

```go
type DailyValue struct {
    ID         uuid.UUID        // PK
    TenantID   uuid.UUID        // FK tenants
    EmployeeID uuid.UUID        // FK employees
    ValueDate  time.Time        // DATE
    Status     DailyValueStatus // VARCHAR(20) DEFAULT 'calculated'
    GrossTime  int              // INT DEFAULT 0
    NetTime    int              // INT DEFAULT 0
    TargetTime int              // INT DEFAULT 0
    Overtime   int              // INT DEFAULT 0
    Undertime  int              // INT DEFAULT 0
    BreakTime  int              // INT DEFAULT 0
    HasError   bool             // BOOLEAN DEFAULT false
    ErrorCodes pq.StringArray   // TEXT[]
    Warnings   pq.StringArray   // TEXT[]
    FirstCome    *int           // INT nullable
    LastGo       *int           // INT nullable
    BookingCount int            // INT DEFAULT 0
    CalculatedAt       *time.Time
    CalculationVersion int     // INT DEFAULT 1
    CreatedAt time.Time
    UpdatedAt time.Time
    // Relations
    Employee *Employee
}
```

DailyValueStatus enum: `pending`, `calculated`, `error`, `approved`.

Helper methods: `Balance()`, `FormatGrossTime()`, `FormatNetTime()`, `FormatTargetTime()`, `FormatBalance()`, `HasBookings()`.

#### `apps/api/internal/model/daily_account_value.go` (50 lines)

```go
type DailyAccountValue struct {
    ID           uuid.UUID               // PK
    TenantID     uuid.UUID               // FK tenants
    EmployeeID   uuid.UUID               // FK employees
    AccountID    uuid.UUID               // FK accounts
    ValueDate    time.Time               // DATE
    ValueMinutes int                     // INT DEFAULT 0
    Source       DailyAccountValueSource // VARCHAR(20)
    DayPlanID    *uuid.UUID              // FK day_plans nullable
    CreatedAt    time.Time
    UpdatedAt    time.Time
    // Relations
    Account  *Account
    Employee *Employee
}
```

DailyAccountValueSource enum: `net_time`, `capped_time`, `surcharge`.

### 4. Ticket's Proposed Schema vs. Actual DB Schema -- Discrepancies

#### Booking Model Discrepancies

| Ticket Field | Actual DB Column | Status |
|---|---|---|
| `id` | `id` | EXISTS |
| `tenant_id` | `tenant_id` | EXISTS |
| `employee_id` | `employee_id` | EXISTS |
| `booking_type_id` | `booking_type_id` | EXISTS |
| `booking_reason_id` | `booking_reason_id` | EXISTS |
| `date DateTime @db.Date` | `booking_date DATE` | EXISTS but different name -- DB uses `booking_date` |
| `time String?` | -- | DOES NOT EXIST. DB has `original_time INT` (minutes from midnight) |
| `end_time String?` | -- | DOES NOT EXIST. No such column in DB |
| `duration_minutes Int?` | -- | DOES NOT EXIST. No such column in DB |
| `is_pair_start Boolean` | -- | DOES NOT EXIST. DB has `pair_id UUID` for pairing |
| `is_pair_end Boolean` | -- | DOES NOT EXIST |
| `pair_id String?` | `pair_id UUID` | EXISTS |
| `source String?` | `source VARCHAR(20) DEFAULT 'web'` | EXISTS |
| `terminal_id String?` | `terminal_id UUID` | EXISTS |
| `notes String?` | `notes TEXT` | EXISTS |
| `is_deleted Boolean` | -- | DOES NOT EXIST. No soft-delete on bookings |
| `deleted_at DateTime?` | -- | DOES NOT EXIST |
| -- | `original_time INT NOT NULL` | IN DB, NOT IN TICKET |
| -- | `edited_time INT NOT NULL` | IN DB, NOT IN TICKET |
| -- | `calculated_time INT` | IN DB, NOT IN TICKET |
| -- | `is_auto_generated BOOLEAN DEFAULT false` | IN DB, NOT IN TICKET |
| -- | `original_booking_id UUID (FK bookings)` | IN DB, NOT IN TICKET |
| -- | `created_by UUID` | IN DB, NOT IN TICKET |
| -- | `updated_by UUID` | IN DB, NOT IN TICKET |

#### DailyValue Model Discrepancies

| Ticket Field | Actual DB Column | Status |
|---|---|---|
| `id` | `id` | EXISTS |
| `tenant_id` | `tenant_id` | EXISTS |
| `employee_id` | `employee_id` | EXISTS |
| `date DateTime @db.Date` | `value_date DATE` | EXISTS but different name -- DB uses `value_date` |
| `status String @default("calculated")` | `status VARCHAR(20) DEFAULT 'calculated'` | EXISTS |
| `is_work_day Boolean` | -- | DOES NOT EXIST |
| `is_holiday Boolean` | -- | DOES NOT EXIST |
| `holiday_name String?` | -- | DOES NOT EXIST |
| `planned_hours Decimal?` | -- | DOES NOT EXIST. DB has `target_time INT` (minutes) |
| `actual_hours Decimal?` | -- | DOES NOT EXIST. DB has `net_time INT` (minutes) |
| `overtime_hours Decimal?` | -- | DOES NOT EXIST. DB has `overtime INT` (minutes) |
| `break_minutes Int?` | -- | DOES NOT EXIST. DB has `break_time INT` (minutes, different name) |
| `first_booking String?` | -- | DOES NOT EXIST. DB has `first_come INT` (minutes from midnight) |
| `last_booking String?` | -- | DOES NOT EXIST. DB has `last_go INT` (minutes from midnight) |
| `absence_type_id String?` | -- | DOES NOT EXIST |
| `absence_hours Decimal?` | -- | DOES NOT EXIST |
| `calculation_log Json?` | -- | DOES NOT EXIST |
| `approved_at DateTime?` | -- | DOES NOT EXIST |
| `approved_by String?` | -- | DOES NOT EXIST |
| -- | `gross_time INT DEFAULT 0` | IN DB, NOT IN TICKET |
| -- | `net_time INT DEFAULT 0` | IN DB, NOT IN TICKET |
| -- | `target_time INT DEFAULT 0` | IN DB, NOT IN TICKET |
| -- | `overtime INT DEFAULT 0` | IN DB, NOT IN TICKET |
| -- | `undertime INT DEFAULT 0` | IN DB, NOT IN TICKET |
| -- | `break_time INT DEFAULT 0` | IN DB, NOT IN TICKET |
| -- | `has_error BOOLEAN DEFAULT false` | IN DB, NOT IN TICKET |
| -- | `error_codes TEXT[]` | IN DB, NOT IN TICKET |
| -- | `warnings TEXT[]` | IN DB, NOT IN TICKET |
| -- | `first_come INT` | IN DB, NOT IN TICKET |
| -- | `last_go INT` | IN DB, NOT IN TICKET |
| -- | `booking_count INT DEFAULT 0` | IN DB, NOT IN TICKET |
| -- | `calculated_at TIMESTAMPTZ` | IN DB, NOT IN TICKET |
| -- | `calculation_version INT DEFAULT 1` | IN DB, NOT IN TICKET |

#### DailyAccountValue Model Discrepancies

| Ticket Field | Actual DB Column | Status |
|---|---|---|
| `id` | `id` | EXISTS |
| `daily_value_id String @db.Uuid` | -- | DOES NOT EXIST. No FK to daily_values table |
| `account_id String @db.Uuid` | `account_id UUID` | EXISTS |
| `value Decimal @db.Decimal(10,2)` | -- | DOES NOT EXIST. DB has `value_minutes INT` |
| `unit String?` | -- | DOES NOT EXIST |
| -- | `tenant_id UUID NOT NULL` | IN DB, NOT IN TICKET |
| -- | `employee_id UUID NOT NULL` | IN DB, NOT IN TICKET |
| -- | `value_date DATE NOT NULL` | IN DB, NOT IN TICKET |
| -- | `value_minutes INT NOT NULL DEFAULT 0` | IN DB, NOT IN TICKET |
| -- | `source VARCHAR(20) NOT NULL` | IN DB, NOT IN TICKET |
| -- | `day_plan_id UUID` | IN DB, NOT IN TICKET |

### 5. Existing Prisma Models That Need Back-Reference Arrays

When adding these three models, the following existing Prisma models need updates:

#### Employee Model (line 528)

Currently has no booking/daily_value relations. Needs:
- `bookings Booking[]`
- `dailyValues DailyValue[]`
- `dailyAccountValues DailyAccountValue[]`

#### BookingType Model (line 917)

Currently has: `bookingReasons BookingReason[]`, `groupMembers BookingTypeGroupMember[]`, `rawTerminalBookings RawTerminalBooking[]`.
Needs: `bookings Booking[]`

#### BookingReason Model (line 952)

Currently has: `tenant Tenant`, `bookingType BookingType`.
Needs: `bookings Booking[]`

#### Account Model (line 388)

Currently has: `bookingTypes BookingType[]`, `calculationRules CalculationRule[]`, `dayPlanBonuses DayPlanBonus[]`, `dayPlanNetAccounts DayPlan[]`, `dayPlanCapAccounts DayPlan[]`, `exportInterfaceAccounts ExportInterfaceAccount[]`.
Needs: `dailyAccountValues DailyAccountValue[]`

#### DayPlan Model (line ~1147)

Currently has: `shifts Shift[]`, `tariffDayPlans TariffDayPlan[]`, `employeeDayPlans EmployeeDayPlan[]`.
Needs: `dailyAccountValues DailyAccountValue[]`

#### Tenant Model (line 83)

Currently has many relation arrays (60+ lines of reverse relations).
Needs: `bookings Booking[]`, `dailyValues DailyValue[]`, `dailyAccountValues DailyAccountValue[]`

#### RawTerminalBooking Model (line 2447)

Has `processedBookingId String?` as a bare UUID with comment "Booking model doesn't exist yet".
When Booking is added, this can optionally gain a relation: `processedBooking Booking? @relation(fields: [processedBookingId], references: [id])`.

### 6. tRPC Routers Using Raw SQL for These Tables

These routers currently use `$queryRawUnsafe` / `$executeRawUnsafe` because the models are not in Prisma:

#### `apps/web/src/server/routers/systemSettings.ts`

- `buildBookingsQuery()` (line 180-195): Raw SQL on `bookings` table using `booking_date`.
- `buildDailyValuesQuery()` (line 200-217): Raw SQL on `daily_values` table. **Bug**: Uses `AND date BETWEEN` but actual column is `value_date`.
- `cleanupDeleteBookings` (line 346-395): Deletes bookings via raw SQL.
- `cleanupDeleteBookingData` (line 400-497): Deletes bookings + daily_values + employee_day_plans via raw SQL.
- `cleanupReReadBookings` (line 500+): Counts bookings via raw SQL.

#### `apps/web/src/server/routers/correctionAssistant.ts`

- Line 411-427: Raw SQL query on `daily_values` joined with `employees` and `departments`, filtering by `dv.has_error = true` and `dv.value_date` range.

#### `apps/web/src/server/routers/reports.ts`

- Line 890-904: Raw SQL query on `daily_values` joined with `employees`, selecting `dv.value_date`, `dv.gross_time`, `dv.net_time`, etc.

#### `apps/web/src/server/routers/bookingTypes.ts`

- Line 419-421: Raw SQL count on `bookings WHERE booking_type_id = $1` for deletion check.

### 7. FK Relationships

```
-- bookings table FK columns:
bookings.tenant_id          -> tenants(id)         ON DELETE CASCADE
bookings.employee_id        -> employees(id)       ON DELETE CASCADE
bookings.booking_type_id    -> booking_types(id)   (no ON DELETE clause = NO ACTION)
bookings.pair_id            -> (self, nullable)
bookings.booking_reason_id  -> booking_reasons(id) ON DELETE SET NULL
bookings.original_booking_id -> bookings(id)       ON DELETE CASCADE

-- daily_values table FK columns:
daily_values.tenant_id      -> tenants(id)         ON DELETE CASCADE
daily_values.employee_id    -> employees(id)       ON DELETE CASCADE

-- daily_account_values table FK columns:
daily_account_values.tenant_id   -> tenants(id)    ON DELETE CASCADE
daily_account_values.employee_id -> employees(id)  ON DELETE CASCADE
daily_account_values.account_id  -> accounts(id)   ON DELETE CASCADE
daily_account_values.day_plan_id -> day_plans(id)   ON DELETE SET NULL
```

Note: `bookings.booking_type_id` FK has no explicit ON DELETE clause in the migration. The `bookingTypes` router (line 419-421) manually checks for usage before deletion.

### 8. Unique Constraints and Indexes

| Table | Unique Constraints | Indexes |
|-------|-------------------|---------|
| bookings | None | idx_bookings_tenant(tenant_id), idx_bookings_employee_date(employee_id, booking_date), idx_bookings_date(booking_date), idx_bookings_pair(pair_id) WHERE pair_id IS NOT NULL, idx_bookings_reason(booking_reason_id) WHERE booking_reason_id IS NOT NULL, idx_bookings_auto_gen(is_auto_generated) WHERE is_auto_generated = true, idx_bookings_original(original_booking_id) WHERE original_booking_id IS NOT NULL |
| daily_values | UNIQUE(employee_id, value_date) | idx_daily_values_tenant(tenant_id), idx_daily_values_employee(employee_id), idx_daily_values_date(value_date), idx_daily_values_lookup(employee_id, value_date), idx_daily_values_errors(employee_id, has_error) WHERE has_error = true, idx_daily_values_status(status) |
| daily_account_values | UNIQUE(employee_id, value_date, account_id, source) | idx_daily_account_values_tenant(tenant_id), idx_daily_account_values_employee(employee_id), idx_daily_account_values_account(account_id), idx_daily_account_values_date(value_date), idx_daily_account_values_lookup(employee_id, value_date) |

**Partial indexes note**: Prisma cannot model partial indexes (WHERE clauses). These will be documented as comments in the Prisma model, matching the established convention in the codebase.

### 9. Prisma Schema Conventions (from existing models)

Based on analysis of the 2726-line schema:

- IDs: `@id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`
- Column mapping: camelCase in Prisma, snake_case with `@map("column_name")` for DB
- Table mapping: `@@map("table_name")`
- Timestamps: `@db.Timestamptz(6)`, updatedAt uses `@default(now()) @updatedAt`
- Integer columns: `@db.Integer` type annotation
- Date columns: `@db.Date`
- Boolean columns: `Boolean` with `@default(true)` or `@default(false)`
- Nullable fields: use `?` suffix
- Section header comments with migration numbers, CHECK constraints, triggers, DB-only features
- `@@index` with explicit `map:` names matching existing DB index names
- `@@unique` with explicit `map:` names for existing unique constraints
- Relations use `onDelete: Cascade` for tenant FK, `onDelete: SetNull` for optional FKs
- Array types: `String[]` for PostgreSQL text[] arrays (no explicit `@db.` annotation needed)

### 10. Prisma Generate Setup

**Schema location**: `apps/web/prisma/schema.prisma`

**Generator config** (lines 6-13):
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
- `postinstall`: `prisma generate` (auto-runs on `pnpm install`)

**Dependencies**: prisma 7.4.2, @prisma/client 7.4.2, @prisma/adapter-pg 7.4.2

**Generated output**: `apps/web/src/generated/prisma/` contains per-model TypeScript type files. Currently has `BookingType.ts`, `BookingReason.ts`, `BookingTypeGroup.ts`, `BookingTypeGroupMember.ts` but no `Booking.ts`, `DailyValue.ts`, or `DailyAccountValue.ts`.

### 11. Existing Test Patterns

No Prisma model tests exist for any of these tables. All tRPC router tests use mock PrismaClients. The test pattern for Prisma schema additions is: add models, run `prisma generate`, verify TypeScript compilation succeeds.

### 12. Known Bug in Existing Code

`apps/web/src/server/routers/systemSettings.ts` line 208:
```typescript
let sql = `${operation} FROM daily_values WHERE tenant_id = $1::uuid AND date BETWEEN $2::date AND $3::date`
```
The column is `value_date`, not `date`. This raw SQL query would fail at runtime. This bug exists in the current codebase and was previously noted in the TICKET-228 research for a similar issue with `employee_day_plans`.

## Code References

| File | Path | Relevance |
|---|---|---|
| Prisma schema | `apps/web/prisma/schema.prisma` | 2726 lines, missing all three models |
| Go Booking model | `apps/api/internal/model/booking.go` | 101 lines, source of truth for fields |
| Go DailyValue model | `apps/api/internal/model/dailyvalue.go` | 113 lines, source of truth for fields |
| Go DailyAccountValue model | `apps/api/internal/model/daily_account_value.go` | 50 lines, source of truth for fields |
| Go Booking repository | `apps/api/internal/repository/booking.go` | Full CRUD |
| Go DailyValue repository | `apps/api/internal/repository/dailyvalue.go` | Full CRUD + aggregation |
| Go DailyAccountValue repository | `apps/api/internal/repository/daily_account_value.go` | Upsert + CRUD |
| Go Account model | `apps/api/internal/model/account.go` | Referenced by DailyAccountValue |
| Go BookingType model | `apps/api/internal/model/bookingtype.go` | Referenced by Booking |
| Go BookingReason model | `apps/api/internal/model/bookingreason.go` | Referenced by Booking |
| Migration: create bookings | `db/migrations/000022_create_bookings.up.sql` | 42 lines |
| Migration: create daily_values | `db/migrations/000024_create_daily_values.up.sql` | 59 lines |
| Migration: daily_values status | `db/migrations/000034_add_daily_values_status.up.sql` | 15 lines |
| Migration: booking reason adjustments | `db/migrations/000078_booking_reason_adjustments.up.sql` | 30 lines |
| Migration: daily_account_values | `db/migrations/000079_add_day_plan_net_cap_accounts.up.sql` | 34 lines |
| tRPC systemSettings | `apps/web/src/server/routers/systemSettings.ts` | Raw SQL for bookings + daily_values |
| tRPC correctionAssistant | `apps/web/src/server/routers/correctionAssistant.ts` | Raw SQL for daily_values |
| tRPC reports | `apps/web/src/server/routers/reports.ts` | Raw SQL for daily_values |
| tRPC bookingTypes | `apps/web/src/server/routers/bookingTypes.ts` | Raw SQL for bookings count |
| Generated Prisma types | `apps/web/src/generated/prisma/models/` | Missing Booking/DailyValue/DailyAccountValue .ts |
| Package.json | `apps/web/package.json` | prisma generate scripts |
| Previous research (TICKET-205) | `thoughts/shared/research/2026-03-03-ZMI-TICKET-205-prisma-schema-employee.md` | Pattern for Prisma schema additions |
| Previous research (TICKET-228) | `thoughts/shared/research/2026-03-07-ZMI-TICKET-228-prisma-schema-employee-day-plans-shifts.md` | Pattern for Prisma schema additions |
