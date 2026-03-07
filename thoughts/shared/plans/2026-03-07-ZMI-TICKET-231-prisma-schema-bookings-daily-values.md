# ZMI-TICKET-231: Prisma Schema -- Bookings, Daily Values, Daily Account Values -- Implementation Plan

## Overview

Add three new Prisma models (`Booking`, `DailyValue`, `DailyAccountValue`) to the schema, add back-reference relation arrays to six existing models (`Tenant`, `Employee`, `BookingType`, `BookingReason`, `Account`, `DayPlan`), update the `RawTerminalBooking` model with a proper Prisma relation to the new `Booking` model, regenerate the Prisma client, and replace raw SQL queries in four tRPC routers (`systemSettings`, `bookingTypes`, `correctionAssistant`, `reports`) with type-safe Prisma calls.

## Current State Analysis

### Booking -- Missing from Prisma
The `bookings` table exists in the database (created by migration `000022`, extended by migration `000078` which added `booking_reason_id`, `is_auto_generated`, `original_booking_id`). The Go backend has a complete implementation (model at `apps/api/internal/model/booking.go`, repository, service, handler). However, there is **no corresponding Prisma model**, which forces multiple tRPC routers to use raw SQL:

1. **SystemSettings router** (`apps/web/src/server/routers/systemSettings.ts`) -- `buildBookingsQuery()` (line 177-195) builds raw SQL for count/delete on `bookings` table; used by `cleanupDeleteBookings` and `cleanupDeleteBookingData` procedures
2. **BookingTypes router** (`apps/web/src/server/routers/bookingTypes.ts`, line 419-421) -- raw SQL `SELECT COUNT(*)::int as count FROM bookings WHERE booking_type_id = $1` to check usage before deletion

### DailyValue -- Missing from Prisma
The `daily_values` table exists (created by migration `000024`, extended by `000034` which added `status`). The Go backend has model at `apps/api/internal/model/dailyvalue.go`. No Prisma model exists, forcing raw SQL in:

1. **SystemSettings router** -- `buildDailyValuesQuery()` (line 199-220) builds raw SQL for count/delete on `daily_values`. **Known bug**: references column `date` instead of actual column `value_date` (line 208)
2. **CorrectionAssistant router** (`apps/web/src/server/routers/correctionAssistant.ts`, line 411-427) -- raw SQL join query on `daily_values`
3. **Reports router** (`apps/web/src/server/routers/reports.ts`, line 890-904) -- raw SQL join query on `daily_values`

### DailyAccountValue -- Missing from Prisma
The `daily_account_values` table exists (created by migration `000079`). The Go backend has model at `apps/api/internal/model/daily_account_value.go`. No Prisma model exists. No tRPC routers currently query this table, but the model is needed for completeness and future use.

### RawTerminalBooking -- Needs Relation Update
The `RawTerminalBooking` model (line 2447) has `processedBookingId String? @map("processed_booking_id") @db.Uuid` as a bare UUID with comment: "processedBookingId is NOT a Prisma relation because Booking model doesn't exist yet". Once Booking is added, this should gain a proper Prisma relation.

### Key Discoveries

**Critical: Ticket schema does NOT match the actual database.** The ticket's proposed Prisma models contain fields that DO NOT exist in the database and are missing fields that DO exist. The Prisma schema header explicitly states: "This schema is READ-ONLY against the existing PostgreSQL database. DO NOT run `prisma db push` or `prisma migrate dev`." Therefore, the Prisma models must match the actual DB columns exactly, NOT the ticket's proposed schema.

Specific discrepancies (full details in research document):

- **Booking**: Ticket proposes `time String?`, `end_time String?`, `duration_minutes Int?`, `is_pair_start Boolean`, `is_pair_end Boolean`, `is_deleted Boolean`, `deleted_at DateTime?` -- NONE exist in DB. Actual DB has `original_time INT`, `edited_time INT`, `calculated_time INT`, `is_auto_generated BOOLEAN`, `original_booking_id UUID`, `created_by UUID`, `updated_by UUID`. Ticket uses `date` for the column name, but actual DB column is `booking_date`.
- **DailyValue**: Ticket proposes `planned_hours Decimal?`, `actual_hours Decimal?`, `overtime_hours Decimal?`, `is_work_day`, `is_holiday`, etc. -- NONE exist in DB. Actual DB uses `gross_time INT`, `net_time INT`, `target_time INT`, `overtime INT`, `undertime INT`, `break_time INT`, `has_error BOOLEAN`, `error_codes TEXT[]`, `warnings TEXT[]`, `first_come INT`, `last_go INT`, `booking_count INT`, `calculated_at TIMESTAMPTZ`, `calculation_version INT`. Ticket uses `date`, actual DB uses `value_date`.
- **DailyAccountValue**: Ticket proposes `daily_value_id String`, `value Decimal`, `unit String?` -- NONE exist in DB. Actual DB has `tenant_id UUID`, `employee_id UUID`, `account_id UUID`, `value_date DATE`, `value_minutes INT`, `source VARCHAR(20)`, `day_plan_id UUID`. There is no FK to `daily_values`; the table is independently keyed by `(employee_id, value_date, account_id, source)`.

### Partial Indexes
The following partial indexes exist in the DB but CANNOT be modeled in Prisma. They will be documented as comments in the model headers, matching established convention:
- `idx_bookings_pair` ON bookings(pair_id) WHERE pair_id IS NOT NULL
- `idx_bookings_reason` ON bookings(booking_reason_id) WHERE booking_reason_id IS NOT NULL
- `idx_bookings_auto_gen` ON bookings(is_auto_generated) WHERE is_auto_generated = true
- `idx_bookings_original` ON bookings(original_booking_id) WHERE original_booking_id IS NOT NULL
- `idx_daily_values_errors` ON daily_values(employee_id, has_error) WHERE has_error = true

## Desired End State

1. `Booking` model exists in the Prisma schema matching all 19 actual database columns exactly
2. `DailyValue` model exists matching all 21 actual database columns exactly
3. `DailyAccountValue` model exists matching all 10 actual database columns exactly
4. Back-reference arrays added to: `Tenant`, `Employee`, `BookingType`, `BookingReason`, `Account`, `DayPlan`
5. `RawTerminalBooking.processedBookingId` has a proper Prisma relation to `Booking`
6. `prisma generate` succeeds, producing updated TypeScript types
7. The `systemSettings.ts` router uses Prisma calls for bookings + daily_values operations instead of raw SQL
8. The `bookingTypes.ts` router uses Prisma `count()` instead of raw SQL for booking usage check
9. The `correctionAssistant.ts` router uses Prisma instead of raw SQL for daily_values queries
10. The `reports.ts` router uses Prisma instead of raw SQL for daily_values queries

**Verification**: `npx prisma validate` and `npx prisma generate` pass. `npx tsc --noEmit` passes (pre-existing errors only, no new errors).

## What We're NOT Doing

- NOT creating booking CRUD routers (that is ZMI-TICKET-232)
- NOT creating daily values routers (that is ZMI-TICKET-236)
- NOT adding database migrations (all tables already exist with all needed columns)
- NOT adding fields that don't exist in the database (see discrepancy list above)
- NOT modifying Go backend files
- NOT modifying frontend hooks

## Implementation Approach

This follows the established pattern from ZMI-TICKET-205, ZMI-TICKET-222, ZMI-TICKET-227, and ZMI-TICKET-228:
1. Add Prisma models matching the actual database schema
2. Add back-reference arrays to related models
3. Update RawTerminalBooking with proper relation
4. Regenerate the Prisma client
5. Replace raw SQL with type-safe Prisma calls in existing routers

Split into three phases: Prisma schema changes (Phase 1), raw SQL replacement in systemSettings + bookingTypes (Phase 2), and raw SQL replacement in correctionAssistant + reports (Phase 3).

---

## Phase 1: Prisma Schema Addition

### Overview
Add three new models (`Booking`, `DailyValue`, `DailyAccountValue`) to the Prisma schema, add back-reference relation arrays to six existing models, update `RawTerminalBooking` with a proper relation, and run `npx prisma generate`.

### Changes Required

#### 1. Add back-references to Tenant model
**File**: `apps/web/prisma/schema.prisma`
**Location**: Tenant model relations section (after line 155, after `rawTerminalBookings`)

Add after `rawTerminalBookings RawTerminalBooking[]`:
```prisma
  bookings                    Booking[]
  dailyValues                 DailyValue[]
  dailyAccountValues          DailyAccountValue[]
```

#### 2. Add back-references to Employee model
**File**: `apps/web/prisma/schema.prisma`
**Location**: Employee model relations section (after line 616, after `rawTerminalBookings`)

Add after `rawTerminalBookings  RawTerminalBooking[]`:
```prisma
  bookings             Booking[]
  dailyValues          DailyValue[]
  dailyAccountValues   DailyAccountValue[]
```

#### 3. Add back-reference to Account model
**File**: `apps/web/prisma/schema.prisma`
**Location**: Account model relations section (after line 416, after `exportInterfaceAccounts`)

Add after `exportInterfaceAccounts  ExportInterfaceAccount[]`:
```prisma
  dailyAccountValues         DailyAccountValue[]
```

#### 4. Add back-reference to BookingType model
**File**: `apps/web/prisma/schema.prisma`
**Location**: BookingType model relations section (after line 937, after `rawTerminalBookings`)

Add after `rawTerminalBookings RawTerminalBooking[]`:
```prisma
  bookings            Booking[]
```

#### 5. Add back-reference to BookingReason model
**File**: `apps/web/prisma/schema.prisma`
**Location**: BookingReason model relations section (after line 970, after the adjustment comment)

Add after the `// Self-relation to BookingType omitted...` comment:
```prisma
  bookings    Booking[]
```

#### 6. Add back-reference to DayPlan model
**File**: `apps/web/prisma/schema.prisma`
**Location**: DayPlan model relations section (after line 1238, after `employeeDayPlans`)

Add after `employeeDayPlans EmployeeDayPlan[]`:
```prisma
  dailyAccountValues DailyAccountValue[]
```

#### 7. Update RawTerminalBooking with Booking relation
**File**: `apps/web/prisma/schema.prisma`
**Location**: RawTerminalBooking model (line 2469)

Replace the comment:
```prisma
  // Note: processedBookingId is NOT a Prisma relation because Booking model doesn't exist yet
```

With a proper relation:
```prisma
  processedBooking Booking? @relation(fields: [processedBookingId], references: [id], onDelete: SetNull)
```

Also add the reverse relation to the new Booking model (see step 8 below).

#### 8. Add Booking model
**File**: `apps/web/prisma/schema.prisma`
**Location**: After the `CorrectionMessage` model (after line 2726, at end of file)

Insert the following model block:

```prisma

// -----------------------------------------------------------------------------
// Booking
// -----------------------------------------------------------------------------
// Migrations: 000022, 000078
//
// Stores time tracking events (clock-in/out, breaks) for employees.
// Time values are stored as minutes from midnight (0-1439).
// Example: 08:30 = 510, 17:00 = 1020
//
// source values: 'web', 'terminal', 'api', 'import', 'correction', 'derived'
//
// booking_type_id FK has NO explicit ON DELETE clause (defaults to NO ACTION).
// The bookingTypes router manually checks for usage before deletion.
//
// Partial indexes (cannot be modeled in Prisma, enforced at DB level):
//   - idx_bookings_pair: ON (pair_id) WHERE pair_id IS NOT NULL
//   - idx_bookings_reason: ON (booking_reason_id) WHERE booking_reason_id IS NOT NULL
//   - idx_bookings_auto_gen: ON (is_auto_generated) WHERE is_auto_generated = true
//   - idx_bookings_original: ON (original_booking_id) WHERE original_booking_id IS NOT NULL
//
// No update trigger on this table.
model Booking {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String    @map("tenant_id") @db.Uuid
  employeeId        String    @map("employee_id") @db.Uuid
  bookingDate       DateTime  @map("booking_date") @db.Date
  bookingTypeId     String    @map("booking_type_id") @db.Uuid

  // Time values (minutes from midnight, 0-1439)
  originalTime      Int       @map("original_time") @db.Integer
  editedTime        Int       @map("edited_time") @db.Integer
  calculatedTime    Int?      @map("calculated_time") @db.Integer

  // Pairing
  pairId            String?   @map("pair_id") @db.Uuid

  // Metadata
  source            String?   @default("web") @map("source") @db.VarChar(20)
  terminalId        String?   @map("terminal_id") @db.Uuid
  notes             String?   @db.Text

  // Booking reason and derived booking fields (migration 000078)
  bookingReasonId   String?   @map("booking_reason_id") @db.Uuid
  isAutoGenerated   Boolean   @default(false) @map("is_auto_generated")
  originalBookingId String?   @map("original_booking_id") @db.Uuid

  // Timestamps and audit
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime  @default(now()) @map("updated_at") @db.Timestamptz(6)
  createdBy         String?   @map("created_by") @db.Uuid
  updatedBy         String?   @map("updated_by") @db.Uuid

  // Relations
  tenant          Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee        Employee        @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  bookingType     BookingType     @relation(fields: [bookingTypeId], references: [id])
  bookingReason   BookingReason?  @relation(fields: [bookingReasonId], references: [id], onDelete: SetNull)
  originalBooking Booking?        @relation("DerivedBookings", fields: [originalBookingId], references: [id], onDelete: Cascade)
  derivedBookings Booking[]       @relation("DerivedBookings")
  rawTerminalBookings RawTerminalBooking[]

  // Indexes
  @@index([tenantId], map: "idx_bookings_tenant")
  @@index([employeeId, bookingDate], map: "idx_bookings_employee_date")
  @@index([bookingDate], map: "idx_bookings_date")
  @@map("bookings")
}
```

**Design notes**:
- `bookingTypeId` relation has no `onDelete` clause because the DB FK has no explicit ON DELETE (defaults to NO ACTION / RESTRICT). Prisma's default behavior matches this.
- `pairId` is a bare UUID without a Prisma self-relation. The `pair_id` column links paired bookings (COME/GO) but the FK in the migration is just a plain column with a partial index -- there is no explicit FK REFERENCES constraint in migration `000022`. Adding a self-relation would be complex (nullable self-FK with ambiguity) and is not needed for current tRPC usage.
- `updatedAt` does NOT use `@updatedAt` because there is no update trigger on the bookings table. The Go backend manages this field explicitly.
- `createdBy` and `updatedBy` are bare UUIDs without relations (audit fields, no FK constraints in DB).
- `terminalId` is a bare UUID without a relation (no FK constraint in DB migration).
- Self-referential `originalBooking`/`derivedBookings` uses named relation `"DerivedBookings"` to disambiguate.

#### 9. Add DailyValue model
**File**: `apps/web/prisma/schema.prisma`
**Location**: After the new Booking model

```prisma

// -----------------------------------------------------------------------------
// DailyValue
// -----------------------------------------------------------------------------
// Migrations: 000024, 000034
//
// Stores calculated daily time tracking results for employees.
// All time values are in minutes.
// status values: 'pending', 'calculated', 'error', 'approved'
// error_codes / warnings: PostgreSQL TEXT[] arrays with codes like
//   MISSING_COME, MISSING_GO, OVERLAPPING_BOOKINGS, etc.
//
// Partial index (cannot be modeled in Prisma, enforced at DB level):
//   - idx_daily_values_errors: ON (employee_id, has_error) WHERE has_error = true
//
// No update trigger on this table.
model DailyValue {
  id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId           String    @map("tenant_id") @db.Uuid
  employeeId         String    @map("employee_id") @db.Uuid
  valueDate          DateTime  @map("value_date") @db.Date

  // Approval status (migration 000034)
  status             String    @default("calculated") @db.VarChar(20)

  // Core time values (all in minutes)
  grossTime          Int       @default(0) @map("gross_time") @db.Integer
  netTime            Int       @default(0) @map("net_time") @db.Integer
  targetTime         Int       @default(0) @map("target_time") @db.Integer
  overtime           Int       @default(0) @db.Integer
  undertime          Int       @default(0) @db.Integer
  breakTime          Int       @default(0) @map("break_time") @db.Integer

  // Error status
  hasError           Boolean   @default(false) @map("has_error")
  errorCodes         String[]  @map("error_codes")
  warnings           String[]

  // Booking summary (times as minutes from midnight 0-1439)
  firstCome          Int?      @map("first_come") @db.Integer
  lastGo             Int?      @map("last_go") @db.Integer
  bookingCount       Int       @default(0) @map("booking_count") @db.Integer

  // Calculation tracking
  calculatedAt       DateTime? @map("calculated_at") @db.Timestamptz(6)
  calculationVersion Int       @default(1) @map("calculation_version") @db.Integer

  // Timestamps
  createdAt          DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime  @default(now()) @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  // Constraints & indexes
  @@unique([employeeId, valueDate])
  @@index([tenantId], map: "idx_daily_values_tenant")
  @@index([employeeId], map: "idx_daily_values_employee")
  @@index([valueDate], map: "idx_daily_values_date")
  @@index([employeeId, valueDate], map: "idx_daily_values_lookup")
  @@index([status], map: "idx_daily_values_status")
  @@map("daily_values")
}
```

**Design notes**:
- `updatedAt` does NOT use `@updatedAt` because there is no update trigger on the daily_values table.
- `errorCodes` and `warnings` are `String[]` for PostgreSQL TEXT[] arrays (matching existing convention -- no explicit `@db.` annotation needed for text arrays).
- `overtime` and `undertime` do not need `@map()` because the camelCase and snake_case forms are identical for single-word names. Same for `warnings` and `status`.

#### 10. Add DailyAccountValue model
**File**: `apps/web/prisma/schema.prisma`
**Location**: After the new DailyValue model

```prisma

// -----------------------------------------------------------------------------
// DailyAccountValue
// -----------------------------------------------------------------------------
// Migration: 000079
//
// Daily account postings from calculation (net time, capped time, surcharge).
// source values: 'net_time', 'capped_time', 'surcharge'
//
// Note: This table has NO FK to daily_values. It is independently keyed by
// (employee_id, value_date, account_id, source).
//
// No update trigger on this table.
model DailyAccountValue {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String    @map("tenant_id") @db.Uuid
  employeeId   String    @map("employee_id") @db.Uuid
  accountId    String    @map("account_id") @db.Uuid
  valueDate    DateTime  @map("value_date") @db.Date
  valueMinutes Int       @default(0) @map("value_minutes") @db.Integer
  source       String    @db.VarChar(20)
  dayPlanId    String?   @map("day_plan_id") @db.Uuid

  // Timestamps
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt    DateTime  @default(now()) @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  account  Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  dayPlan  DayPlan? @relation(fields: [dayPlanId], references: [id], onDelete: SetNull)

  // Constraints & indexes
  @@unique([employeeId, valueDate, accountId, source])
  @@index([tenantId], map: "idx_daily_account_values_tenant")
  @@index([employeeId], map: "idx_daily_account_values_employee")
  @@index([accountId], map: "idx_daily_account_values_account")
  @@index([valueDate], map: "idx_daily_account_values_date")
  @@index([employeeId, valueDate], map: "idx_daily_account_values_lookup")
  @@map("daily_account_values")
}
```

**Design notes**:
- `updatedAt` does NOT use `@updatedAt` because there is no update trigger on this table.
- The ticket incorrectly proposed `daily_value_id` as a FK to `daily_values`. The actual DB has no such column. The table is independently keyed.

#### 11. Generate Prisma Client
Run from `apps/web/`:
```bash
cd apps/web && npx prisma generate
```

### Success Criteria

#### Automated Verification:
- [ ] `cd apps/web && npx prisma validate` passes
- [ ] `cd apps/web && npx prisma generate` completes without errors
- [ ] `cd apps/web && npx tsc --noEmit` passes (pre-existing errors only, no new errors)
- [ ] Generated files exist: `apps/web/src/generated/prisma/models/Booking.ts`, `DailyValue.ts`, `DailyAccountValue.ts`

#### Manual Verification:
- [ ] Prisma Studio shows the `Booking`, `DailyValue`, and `DailyAccountValue` models with correct columns matching the database
- [ ] Existing data is visible and readable through Prisma Studio for all three models
- [ ] The `RawTerminalBooking` model shows `processedBooking` as a proper relation

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Replace Raw SQL in systemSettings and bookingTypes Routers

### Overview
Replace raw SQL queries that access `bookings` and `daily_values` in the `systemSettings` and `bookingTypes` tRPC routers with type-safe Prisma client calls.

### Changes Required

#### 1. SystemSettings Router -- Replace buildBookingsQuery
**File**: `apps/web/src/server/routers/systemSettings.ts`

**Current code** (lines 177-195): `buildBookingsQuery()` function builds raw SQL strings.

**Replace with** a Prisma-based helper:
```typescript
/**
 * Deletes or counts bookings for a tenant within a date range, with optional employee filter.
 */
async function deleteBookings(
  prisma: PrismaClient,
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  employeeIds?: string[]
): Promise<number> {
  const where: Prisma.BookingWhereInput = {
    tenantId,
    bookingDate: {
      gte: new Date(dateFrom),
      lte: new Date(dateTo),
    },
  }
  if (employeeIds && employeeIds.length > 0) {
    where.employeeId = { in: employeeIds }
  }
  const result = await prisma.booking.deleteMany({ where })
  return result.count
}

async function countBookings(
  prisma: PrismaClient,
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  employeeIds?: string[]
): Promise<number> {
  const where: Prisma.BookingWhereInput = {
    tenantId,
    bookingDate: {
      gte: new Date(dateFrom),
      lte: new Date(dateTo),
    },
  }
  if (employeeIds && employeeIds.length > 0) {
    where.employeeId = { in: employeeIds }
  }
  return prisma.booking.count({ where })
}
```

Remove the old `buildBookingsQuery` function entirely.

#### 2. SystemSettings Router -- Replace buildDailyValuesQuery
**File**: `apps/web/src/server/routers/systemSettings.ts`

**Current code** (lines 199-220): `buildDailyValuesQuery()` function builds raw SQL strings. **Contains a bug**: references column `date` instead of the actual `value_date` column.

**Replace with** Prisma-based helpers:
```typescript
/**
 * Deletes or counts daily_values for a tenant within a date range, with optional employee filter.
 * Fixes pre-existing bug: raw SQL referenced column 'date' but actual column is 'value_date'.
 */
async function deleteDailyValues(
  prisma: PrismaClient,
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  employeeIds?: string[]
): Promise<number> {
  const where: Prisma.DailyValueWhereInput = {
    tenantId,
    valueDate: {
      gte: new Date(dateFrom),
      lte: new Date(dateTo),
    },
  }
  if (employeeIds && employeeIds.length > 0) {
    where.employeeId = { in: employeeIds }
  }
  const result = await prisma.dailyValue.deleteMany({ where })
  return result.count
}

async function countDailyValues(
  prisma: PrismaClient,
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  employeeIds?: string[]
): Promise<number> {
  const where: Prisma.DailyValueWhereInput = {
    tenantId,
    valueDate: {
      gte: new Date(dateFrom),
      lte: new Date(dateTo),
    },
  }
  if (employeeIds && employeeIds.length > 0) {
    where.employeeId = { in: employeeIds }
  }
  return prisma.dailyValue.count({ where })
}
```

Remove the old `buildDailyValuesQuery` function entirely.

#### 3. SystemSettings Router -- Update cleanupDeleteBookings procedure
**File**: `apps/web/src/server/routers/systemSettings.ts`

Update the `cleanupDeleteBookings` procedure (lines 346-397) to use the new Prisma-based helpers:
- Preview mode: replace `$queryRawUnsafe` with `countBookings()`
- Execute mode: replace `$executeRawUnsafe` with `deleteBookings()`

#### 4. SystemSettings Router -- Update cleanupDeleteBookingData procedure
**File**: `apps/web/src/server/routers/systemSettings.ts`

Update the `cleanupDeleteBookingData` procedure (lines 400-497) to use the new Prisma-based helpers:
- Preview mode: replace `$queryRawUnsafe` calls with `countBookings()` and `countDailyValues()`
- Execute mode: replace `$executeRawUnsafe` calls with `deleteBookings()` and `deleteDailyValues()`

#### 5. SystemSettings Router -- Update cleanupReReadBookings procedure
**File**: `apps/web/src/server/routers/systemSettings.ts`

Update the `cleanupReReadBookings` procedure (lines 500+) to use `countBookings()` instead of `$queryRawUnsafe`.

#### 6. BookingTypes Router -- Replace raw SQL in delete procedure
**File**: `apps/web/src/server/routers/bookingTypes.ts`

**Current code** (lines 419-421):
```typescript
const result = await ctx.prisma.$queryRawUnsafe<[{ count: number }]>(
  `SELECT COUNT(*)::int as count FROM bookings WHERE booking_type_id = $1`,
  input.id
)
```

**Replace with**:
```typescript
const bookingCount = await ctx.prisma.booking.count({
  where: { bookingTypeId: input.id },
})
```

Update the subsequent check to use `bookingCount > 0` instead of `result[0].count > 0`.

### Success Criteria

#### Automated Verification:
- [ ] `cd apps/web && npx tsc --noEmit` passes (pre-existing errors only, no new errors)
- [ ] `cd apps/web && npm run lint` passes (or only pre-existing lint issues)
- [ ] No references to `$queryRawUnsafe` or `$executeRawUnsafe` for `bookings` or `daily_values` remain in `systemSettings.ts`:
  ```bash
  grep -n "bookings\|daily_values" apps/web/src/server/routers/systemSettings.ts
  ```
  should return zero raw SQL hits
- [ ] No references to `$queryRawUnsafe` for `bookings` remain in `bookingTypes.ts`:
  ```bash
  grep -n "queryRawUnsafe\|executeRawUnsafe" apps/web/src/server/routers/bookingTypes.ts
  ```
  should return zero results

#### Manual Verification:
- [ ] SystemSettings cleanupDeleteBookings: preview mode returns correct count, execute mode deletes bookings
- [ ] SystemSettings cleanupDeleteBookingData: preview mode returns correct counts for bookings + daily_values, execute mode deletes both
- [ ] SystemSettings cleanupReReadBookings: preview mode returns correct booking count
- [ ] BookingTypes delete: correctly prevents deletion when bookings reference the booking type
- [ ] The `value_date` bug is resolved (daily_values queries now work correctly through Prisma)

**Implementation Note**: After completing this phase and all verification passes, pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Replace Raw SQL in correctionAssistant and reports Routers

### Overview
Replace raw SQL join queries in the `correctionAssistant` and `reports` tRPC routers with type-safe Prisma calls using the new `DailyValue` model and its `employee` relation.

### Changes Required

#### 1. CorrectionAssistant Router -- Replace raw SQL daily_values query
**File**: `apps/web/src/server/routers/correctionAssistant.ts`

**Current code** (lines 411-427): Raw SQL join query:
```sql
SELECT dv.*, e.first_name, e.last_name, e.personnel_number, d.name as department_name
FROM daily_values dv
JOIN employees e ON dv.employee_id = e.id
LEFT JOIN departments d ON e.department_id = d.id
WHERE dv.tenant_id = $1 AND dv.has_error = true AND dv.value_date BETWEEN $2 AND $3
```

**Replace with** Prisma query using `include`:
```typescript
const dailyValues = await ctx.prisma.dailyValue.findMany({
  where: {
    tenantId,
    hasError: true,
    valueDate: {
      gte: new Date(dateFrom),
      lte: new Date(dateTo),
    },
  },
  include: {
    employee: {
      select: {
        firstName: true,
        lastName: true,
        personnelNumber: true,
        department: {
          select: { name: true },
        },
      },
    },
  },
  orderBy: { valueDate: 'asc' },
})
```

The result shape will differ from the raw SQL flat result. Map the Prisma result to match the expected interface in the router's response formatting.

#### 2. Reports Router -- Replace raw SQL daily_values query
**File**: `apps/web/src/server/routers/reports.ts`

**Current code** (lines 890-904): Raw SQL join query:
```sql
SELECT dv.value_date, dv.gross_time, dv.net_time, ...
FROM daily_values dv
JOIN employees e ON dv.employee_id = e.id
WHERE dv.tenant_id = $1 AND dv.employee_id = $2 AND dv.value_date BETWEEN $3 AND $4
```

**Replace with** Prisma query:
```typescript
const dailyValues = await ctx.prisma.dailyValue.findMany({
  where: {
    tenantId,
    employeeId,
    valueDate: {
      gte: new Date(dateFrom),
      lte: new Date(dateTo),
    },
  },
  include: {
    employee: {
      select: {
        firstName: true,
        lastName: true,
        personnelNumber: true,
      },
    },
  },
  orderBy: { valueDate: 'asc' },
})
```

Map the Prisma result to match the expected response format.

### Success Criteria

#### Automated Verification:
- [ ] `cd apps/web && npx tsc --noEmit` passes (pre-existing errors only, no new errors)
- [ ] `cd apps/web && npm run lint` passes (or only pre-existing lint issues)
- [ ] No references to `$queryRawUnsafe` or `$executeRawUnsafe` for `daily_values` remain in `correctionAssistant.ts` or `reports.ts`:
  ```bash
  grep -n "daily_values" apps/web/src/server/routers/correctionAssistant.ts apps/web/src/server/routers/reports.ts
  ```
  should return zero results

#### Manual Verification:
- [ ] CorrectionAssistant: error list shows daily values with errors, employee names, and department names
- [ ] Reports: daily values report shows correct time values for the requested employee and date range

---

## Testing Strategy

### Unit Tests
No new unit tests required for the Prisma schema addition. The existing Go test suites validate all business logic. The Prisma schema is a type definition validated by `prisma validate` and `prisma generate`.

### Integration Tests
- `npx prisma validate` confirms the schema is syntactically correct and internally consistent
- `npx prisma generate` confirms the schema compiles to a working Prisma client
- `npx tsc --noEmit` confirms all TypeScript code compiles with the new types and the raw SQL replacements are type-safe

### Manual Testing Steps
1. Open Prisma Studio and verify `Booking`, `DailyValue`, and `DailyAccountValue` models appear with all expected columns
2. Verify existing data is readable through Prisma Studio for all three models
3. Verify `RawTerminalBooking` shows `processedBooking` as a clickable relation
4. Test booking type deletion prevention when bookings reference the type
5. Test systemSettings cleanup procedures in both preview and execute modes
6. Test correctionAssistant error list with daily values
7. Test reports daily values query

## Performance Considerations

- All Prisma queries map to equivalent SQL. No performance regression expected.
- The `idx_bookings_employee_date`, `idx_bookings_tenant`, `idx_daily_values_lookup`, `idx_daily_values_tenant`, and `idx_daily_values_status` indexes support all the queries being converted.
- The systemSettings `buildDailyValuesQuery` bug (`date` instead of `value_date`) means the raw SQL was likely failing at runtime. Switching to Prisma fixes this automatically.

## Migration Notes

- **No database migrations needed** -- all three tables already exist with all required columns
- The Prisma schema changes are purely additive (three new models + back-reference arrays on six existing models + one relation update on RawTerminalBooking)
- The Go backend remains fully functional -- both REST and tRPC endpoints coexist
- The raw SQL bug in `systemSettings.ts` (`date` instead of `value_date`) will be automatically fixed by switching to Prisma calls

## Risk Assessment

- **Low risk**: Prisma model additions are purely additive and cannot break existing functionality
- **Medium risk**: Raw SQL replacements in Phase 2 and Phase 3 change runtime behavior. Each phase should be tested manually before proceeding.
- **Booking self-reference**: The `originalBooking`/`derivedBookings` self-relation uses a named relation `"DerivedBookings"` to avoid ambiguity. If Prisma validation fails on this, it can be simplified to bare UUID fields like `pairId`.
- **RawTerminalBooking relation**: Adding the `processedBooking` relation to `RawTerminalBooking` might cause issues if there are `processed_booking_id` values in the DB that don't match any `bookings.id`. Since the relation is optional (`Booking?`), Prisma should handle this gracefully, but verify in Prisma Studio.

## References

- Research document: `thoughts/shared/research/2026-03-07-ZMI-TICKET-231-prisma-schema-bookings-daily-values.md`
- Ticket: `thoughts/shared/tickets/ZMI-TICKET-231-prisma-schema-bookings-daily-values.md`
- Prisma schema: `apps/web/prisma/schema.prisma`
- Go Booking model: `apps/api/internal/model/booking.go`
- Go DailyValue model: `apps/api/internal/model/dailyvalue.go`
- Go DailyAccountValue model: `apps/api/internal/model/daily_account_value.go`
- Migration (create bookings): `db/migrations/000022_create_bookings.up.sql`
- Migration (create daily_values): `db/migrations/000024_create_daily_values.up.sql`
- Migration (daily_values status): `db/migrations/000034_add_daily_values_status.up.sql`
- Migration (booking reason adjustments): `db/migrations/000078_booking_reason_adjustments.up.sql`
- Migration (daily_account_values): `db/migrations/000079_add_day_plan_net_cap_accounts.up.sql`
- SystemSettings tRPC router: `apps/web/src/server/routers/systemSettings.ts`
- BookingTypes tRPC router: `apps/web/src/server/routers/bookingTypes.ts`
- CorrectionAssistant tRPC router: `apps/web/src/server/routers/correctionAssistant.ts`
- Reports tRPC router: `apps/web/src/server/routers/reports.ts`
- Similar plan (TICKET-228): `thoughts/shared/plans/2026-03-07-ZMI-TICKET-228-prisma-schema-employee-day-plans-shifts.md`
- Similar plan (TICKET-205): `thoughts/shared/plans/2026-03-03-ZMI-TICKET-205-prisma-schema-employee.md`
