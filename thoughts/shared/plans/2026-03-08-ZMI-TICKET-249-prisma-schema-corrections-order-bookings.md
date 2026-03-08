# ZMI-TICKET-249: Prisma Schema -- Corrections, Order Bookings -- Implementation Plan

## Overview

Add two new Prisma models (`Correction`, `OrderBooking`) to the schema, add back-reference relation arrays to five existing models (`Tenant`, `Employee`, `Account`, `Order`, `Activity`), regenerate the Prisma client, and replace raw SQL queries in the `daily-calc.ts` service with type-safe Prisma calls.

## Current State Analysis

### Correction -- Missing from Prisma
The `corrections` table exists in the database (created by migration `000080`). The Go backend has a complete implementation (model at `apps/api/internal/model/correction.go`). There is **no corresponding Prisma model**.

No tRPC routers currently query the `corrections` table via raw SQL. The model is needed for completeness and the upcoming TICKET-250 corrections router.

### OrderBooking -- Missing from Prisma
The `order_bookings` table exists in the database (created by migration `000057`). The Go backend has a complete implementation (model at `apps/api/internal/model/order_booking.go`). There is **no corresponding Prisma model**, which forces raw SQL in:

1. **DailyCalcService** (`apps/web/src/server/services/daily-calc.ts`, lines 851-868) -- raw SQL `DELETE FROM order_bookings` and `INSERT INTO order_bookings` for auto order booking creation during daily calculation. **Contains a bug**: the INSERT references column `value_minutes` but the actual DB column is `time_minutes`.

### Key Discoveries

**Critical: Ticket schema does NOT match the actual database.** The ticket's proposed Prisma models contain fields that DO NOT exist in the database and are missing fields that DO exist. The Prisma schema header explicitly states: "This schema is READ-ONLY against the existing PostgreSQL database." Therefore, the Prisma models must match the actual DB columns exactly, NOT the ticket's proposed schema.

Specific discrepancies (full details in research document):

- **Correction**: Ticket proposes `original_value Decimal?`, `corrected_value Decimal?`, `type String?`, `applied_at DateTime?`, `applied_by String?` -- NONE exist in DB. Ticket uses `date` but actual column is `correction_date`. Ticket uses status values "pending, applied, reverted" but DB CHECK constraint uses "pending, approved, rejected". Missing from ticket: `value_minutes INTEGER`, `reason TEXT`, `created_by UUID`, `correction_type VARCHAR(50)`. The `approved_by`/`approved_at` columns exist in DB but ticket renames them to `applied_by`/`applied_at`.
- **OrderBooking**: Ticket proposes `booking_id String?`, `hours Decimal`, `deleted_at DateTime?` -- NONE exist in DB. Ticket uses `date` but actual column is `booking_date`. Actual DB has `time_minutes INT` not `hours Decimal`. Missing from ticket: `source VARCHAR(20)`, `activity_id UUID`, `created_by UUID`, `updated_by UUID`.

### Raw SQL Bug in daily-calc.ts
The `daily-calc.ts` service (line 861) uses raw SQL that references column `value_minutes` in the INSERT statement, but the actual DB column is `time_minutes`. This will cause a runtime error. Replacing the raw SQL with Prisma calls will fix this automatically.

## Desired End State

1. `Correction` model exists in the Prisma schema matching all 13 actual database columns exactly
2. `OrderBooking` model exists matching all 12 actual database columns exactly
3. Back-reference arrays added to: `Tenant`, `Employee`, `Account`, `Order`, `Activity`
4. `prisma generate` succeeds, producing updated TypeScript types
5. The `daily-calc.ts` service uses Prisma calls for `order_bookings` operations instead of raw SQL
6. The `value_minutes` bug is resolved (Prisma uses the correct `time_minutes` column)

**Verification**: `npx prisma validate` and `npx prisma generate` pass. `npx tsc --noEmit` passes (pre-existing errors only, no new errors).

## What We're NOT Doing

- NOT creating corrections CRUD router (that is ZMI-TICKET-250)
- NOT creating order bookings CRUD router (future ticket)
- NOT adding database migrations (all tables already exist with all needed columns)
- NOT adding fields that don't exist in the database (see discrepancy list above)
- NOT modifying Go backend files
- NOT modifying frontend hooks

## Implementation Approach

This follows the established pattern from ZMI-TICKET-231, ZMI-TICKET-228, ZMI-TICKET-205:
1. Add Prisma models matching the actual database schema
2. Add back-reference arrays to related models
3. Regenerate the Prisma client
4. Replace raw SQL with type-safe Prisma calls in existing service

Split into two phases: Prisma schema changes (Phase 1) and raw SQL replacement in daily-calc.ts (Phase 2).

---

## Phase 1: Prisma Schema Addition

### Overview
Add two new models (`Correction`, `OrderBooking`) to the Prisma schema, add back-reference relation arrays to five existing models, and run `npx prisma generate`.

### Changes Required

#### 1. Add back-references to Tenant model
**File**: `apps/web/prisma/schema.prisma`
**Location**: Tenant model relations section (after line 170, after `scheduleExecutions`)

Add after `scheduleExecutions          ScheduleExecution[]`:
```prisma
  corrections                 Correction[]
  orderBookings               OrderBooking[]
```

Note: Insert alphabetically among the reverse relations. `corrections` goes after `costCenters` or at the end; `orderBookings` goes after `orders`. However, the established pattern in this schema is to append new reverse relations at the end of the list. Follow the append-at-end convention.

#### 2. Add back-references to Employee model
**File**: `apps/web/prisma/schema.prisma`
**Location**: Employee model relations section (after line 628, after `absenceDays`)

Add after `absenceDays          AbsenceDay[]`:
```prisma
  corrections          Correction[]
  orderBookings        OrderBooking[]
```

#### 3. Add back-reference to Account model
**File**: `apps/web/prisma/schema.prisma`
**Location**: Account model relations section (after line 424, after `dailyAccountValues`)

Add after `dailyAccountValues       DailyAccountValue[]`:
```prisma
  corrections                  Correction[]
```

#### 4. Add back-reference to Order model
**File**: `apps/web/prisma/schema.prisma`
**Location**: Order model relations section (after line 870, after `defaultForEmployees`)

Add after `defaultForEmployees Employee[]        @relation("EmployeeDefaultOrder")`:
```prisma
  orderBookings       OrderBooking[]
```

#### 5. Add back-reference to Activity model
**File**: `apps/web/prisma/schema.prisma`
**Location**: Activity model relations section (after line 833, after `defaultForEmployees`)

Add after `defaultForEmployees Employee[] @relation("EmployeeDefaultActivity")`:
```prisma
  orderBookings       OrderBooking[]
```

#### 6. Add Correction model
**File**: `apps/web/prisma/schema.prisma`
**Location**: After the `ScheduleTaskExecution` model (after line 3119, at end of file)

Insert the following model block:

```prisma

// -----------------------------------------------------------------------------
// Correction
// -----------------------------------------------------------------------------
// Migration: 000080
//
// Manual corrections to daily time values (time adjustments, balance adjustments,
// vacation adjustments, account adjustments).
//
// CHECK constraints (enforced at DB level only):
//   - correction_type IN ('time_adjustment', 'balance_adjustment', 'vacation_adjustment', 'account_adjustment')
//   - status IN ('pending', 'approved', 'rejected')
//
// approved_by and created_by are bare UUIDs without Prisma relations (audit fields,
// FK to users(id) with default NO ACTION).
//
// No update trigger on this table.
model Correction {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId       String    @map("tenant_id") @db.Uuid
  employeeId     String    @map("employee_id") @db.Uuid
  correctionDate DateTime  @map("correction_date") @db.Date
  correctionType String    @map("correction_type") @db.VarChar(50)
  accountId      String?   @map("account_id") @db.Uuid
  valueMinutes   Int       @map("value_minutes") @db.Integer
  reason         String    @default("") @db.Text
  status         String    @default("pending") @db.VarChar(20)
  approvedBy     String?   @map("approved_by") @db.Uuid
  approvedAt     DateTime? @map("approved_at") @db.Timestamptz(6)
  createdBy      String?   @map("created_by") @db.Uuid
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime  @default(now()) @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant   Tenant   @relation(fields: [tenantId], references: [id])
  employee Employee @relation(fields: [employeeId], references: [id])
  account  Account? @relation(fields: [accountId], references: [id])

  // Indexes
  @@index([tenantId], map: "idx_corrections_tenant_id")
  @@index([employeeId], map: "idx_corrections_employee_id")
  @@index([correctionDate], map: "idx_corrections_date")
  @@index([status], map: "idx_corrections_status")
  @@map("corrections")
}
```

**Design notes**:
- `tenantId` FK to `tenants(id)` has **no ON DELETE clause** in the migration (defaults to NO ACTION). Therefore the Prisma relation has no `onDelete` parameter — Prisma's default behavior matches this.
- `employeeId` FK to `employees(id)` also has **no ON DELETE clause** (NO ACTION). No `onDelete` parameter.
- `accountId` FK to `accounts(id)` is nullable and has **no ON DELETE clause** (NO ACTION). No `onDelete` parameter.
- `approvedBy` and `createdBy` are bare UUIDs without Prisma relations (audit fields referencing `users(id)` with NO ACTION), matching the AbsenceDay pattern.
- `updatedAt` does NOT use `@updatedAt` because there is no update trigger on this table.
- `reason` has `@default("")` matching the DB `DEFAULT ''`.
- Index map names match the exact DB index names from the migration.

#### 7. Add OrderBooking model
**File**: `apps/web/prisma/schema.prisma`
**Location**: After the new Correction model

```prisma

// -----------------------------------------------------------------------------
// OrderBooking
// -----------------------------------------------------------------------------
// Migration: 000057
//
// Time bookings against orders (Auftragszeit) for order-based time tracking.
//
// CHECK constraints (enforced at DB level only):
//   - source IN ('manual', 'auto', 'import')
//
// created_by and updated_by are bare UUIDs without FK constraints in DB.
//
// Trigger: update_order_bookings_updated_at auto-sets updated_at on UPDATE
model OrderBooking {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String    @map("tenant_id") @db.Uuid
  employeeId  String    @map("employee_id") @db.Uuid
  orderId     String    @map("order_id") @db.Uuid
  activityId  String?   @map("activity_id") @db.Uuid
  bookingDate DateTime  @map("booking_date") @db.Date
  timeMinutes Int       @map("time_minutes") @db.Integer
  description String?   @db.Text
  source      String    @default("manual") @db.VarChar(20)
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdBy   String?   @map("created_by") @db.Uuid
  updatedBy   String?   @map("updated_by") @db.Uuid

  // Relations
  tenant   Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  order    Order     @relation(fields: [orderId], references: [id], onDelete: Cascade)
  activity Activity? @relation(fields: [activityId], references: [id], onDelete: SetNull)

  // Indexes
  @@index([tenantId], map: "idx_order_bookings_tenant")
  @@index([employeeId], map: "idx_order_bookings_employee")
  @@index([orderId], map: "idx_order_bookings_order")
  @@index([activityId], map: "idx_order_bookings_activity")
  @@index([employeeId, bookingDate], map: "idx_order_bookings_employee_date")
  @@index([orderId, bookingDate], map: "idx_order_bookings_order_date")
  @@map("order_bookings")
}
```

**Design notes**:
- `tenantId` FK has `ON DELETE CASCADE` in migration, so Prisma relation uses `onDelete: Cascade`.
- `employeeId` FK has `ON DELETE CASCADE` in migration, so `onDelete: Cascade`.
- `orderId` FK has `ON DELETE CASCADE` in migration, so `onDelete: Cascade`.
- `activityId` FK has `ON DELETE SET NULL` in migration, so `onDelete: SetNull`. Nullable.
- `updatedAt` uses `@updatedAt` because the table HAS an update trigger (`update_order_bookings_updated_at`).
- `createdBy` and `updatedBy` are bare UUIDs without FK constraints in the DB migration (no `REFERENCES` clause), so no Prisma relations.
- `createdAt` in the migration uses `DEFAULT NOW()` without `NOT NULL`. In Prisma we model it with `@default(now())` matching the actual DB behavior. The `@db.Timestamptz(6)` annotation is standard.
- Index map names match the exact DB index names from the migration.
- 6 indexes including two composite indexes match the migration exactly.

#### 8. Generate Prisma Client
Run from `apps/web/`:
```bash
cd apps/web && npx prisma generate
```

### Success Criteria

#### Automated Verification:
- [ ] `cd apps/web && npx prisma validate` passes
- [ ] `cd apps/web && npx prisma generate` completes without errors
- [ ] `cd apps/web && npx tsc --noEmit` passes (pre-existing errors only, no new errors)

#### Manual Verification:
- [ ] Prisma Studio shows the `Correction` and `OrderBooking` models with correct columns matching the database
- [ ] Existing data is visible and readable through Prisma Studio for both models

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Replace Raw SQL in daily-calc.ts

### Overview
Replace raw SQL queries that access `order_bookings` in the `daily-calc.ts` service with type-safe Prisma client calls. This also fixes the `value_minutes`/`time_minutes` column name bug.

### Changes Required

#### 1. DailyCalcService -- Replace raw SQL DELETE + INSERT
**File**: `apps/web/src/server/services/daily-calc.ts`

**Current code** (lines 850-868):
```typescript
// Delete any previous auto-bookings for this date
await this.prisma.$executeRaw`
  DELETE FROM order_bookings
  WHERE employee_id = ${employeeId}::uuid
    AND booking_date = ${date}::date
    AND source = 'auto'
`
// Create fresh auto order booking
await this.prisma.$executeRaw`
  INSERT INTO order_bookings (
    tenant_id, employee_id, order_id, activity_id,
    booking_date, value_minutes, source
  ) VALUES (
    ${emp.tenantId}::uuid, ${employeeId}::uuid,
    ${emp.defaultOrderId}::uuid,
    ${emp.defaultActivityId}::uuid,
    ${date}::date, ${targetTime}, 'auto'
  )
`
```

**Replace with** Prisma calls:
```typescript
// Delete any previous auto-bookings for this date
await this.prisma.orderBooking.deleteMany({
  where: {
    employeeId,
    bookingDate: new Date(date),
    source: "auto",
  },
})
// Create fresh auto order booking
await this.prisma.orderBooking.create({
  data: {
    tenantId: emp.tenantId,
    employeeId,
    orderId: emp.defaultOrderId,
    activityId: emp.defaultActivityId,
    bookingDate: new Date(date),
    timeMinutes: targetTime,
    source: "auto",
  },
})
```

**Bug fix**: The raw SQL referenced column `value_minutes` but the actual DB column is `time_minutes`. The Prisma model uses `timeMinutes` which maps to the correct `time_minutes` column, fixing this bug automatically.

### Success Criteria

#### Automated Verification:
- [ ] `cd apps/web && npx tsc --noEmit` passes (pre-existing errors only, no new errors)
- [ ] No references to `$executeRaw` for `order_bookings` remain in `daily-calc.ts`:
  ```bash
  grep -n "order_bookings" apps/web/src/server/services/daily-calc.ts
  ```
  should return zero results

#### Manual Verification:
- [ ] Daily calculation with an employee that has a `default_order_id` correctly creates order bookings
- [ ] The `time_minutes` column is now populated correctly (was previously broken due to `value_minutes` bug)

---

## Testing Strategy

### Unit Tests
No new unit test files are required for the Prisma schema addition itself. The Prisma schema is a type definition validated by `prisma validate` and `prisma generate`.

However, the existing `daily-calc.test.ts` test file (`apps/web/src/server/services/__tests__/daily-calc.test.ts`) may need its mock to be updated if the raw SQL replacements change the mock patterns. Check whether the existing mocks for `$executeRaw` need to become mocks for `orderBooking.deleteMany` and `orderBooking.create`.

### Integration Tests
- `npx prisma validate` confirms the schema is syntactically correct and internally consistent
- `npx prisma generate` confirms the schema compiles to a working Prisma client
- `npx tsc --noEmit` confirms all TypeScript code compiles with the new types and the raw SQL replacements are type-safe
- `pnpm vitest run` (if applicable) confirms existing tests still pass

### Verification Commands (run sequentially)
```bash
# Phase 1 verification
cd apps/web && npx prisma validate
cd apps/web && npx prisma generate
cd apps/web && npx tsc --noEmit

# Phase 2 verification
cd apps/web && npx tsc --noEmit
grep -n "order_bookings" apps/web/src/server/services/daily-calc.ts
```

## Performance Considerations

- All Prisma queries map to equivalent SQL. No performance regression expected.
- The `idx_order_bookings_employee_date` composite index supports the deleteMany query (filtering by `employee_id` and `booking_date`).
- The `idx_corrections_tenant_id`, `idx_corrections_employee_id`, `idx_corrections_date`, and `idx_corrections_status` indexes support all anticipated query patterns for the future corrections router.

## Migration Notes

- **No database migrations needed** -- both tables already exist with all required columns
- The Prisma schema changes are purely additive (two new models + back-reference arrays on five existing models)
- The Go backend remains fully functional -- both REST and tRPC endpoints coexist
- The raw SQL bug in `daily-calc.ts` (`value_minutes` instead of `time_minutes`) will be automatically fixed by switching to Prisma calls

## Files Modified

### Phase 1
- `apps/web/prisma/schema.prisma` -- Add Correction and OrderBooking models; add reverse relations to Tenant, Employee, Account, Order, Activity

### Phase 2
- `apps/web/src/server/services/daily-calc.ts` -- Replace raw SQL with Prisma calls for order_bookings

## Acceptance Criteria (from ticket)
- [x] Correction and OrderBooking models defined
- [x] Relations correct (to Tenant, Employee, Account, Order, Activity)
- [x] Indexes for performant queries (4 for Correction, 6 for OrderBooking)
- [x] `prisma generate` successful

## References

- Research document: `thoughts/shared/research/2026-03-08-ZMI-TICKET-249-prisma-schema-corrections-order-bookings.md`
- Ticket: `thoughts/shared/tickets/ZMI-TICKET-249-prisma-schema-corrections-order-bookings.md`
- Prisma schema: `apps/web/prisma/schema.prisma`
- Go Correction model: `apps/api/internal/model/correction.go`
- Go OrderBooking model: `apps/api/internal/model/order_booking.go`
- Migration (create corrections): `db/migrations/000080_create_corrections.up.sql`
- Migration (create order_bookings): `db/migrations/000057_create_order_bookings.up.sql`
- DailyCalcService: `apps/web/src/server/services/daily-calc.ts`
- Similar plan (TICKET-231): `thoughts/shared/plans/2026-03-07-ZMI-TICKET-231-prisma-schema-bookings-daily-values.md`
- Similar plan (TICKET-228): `thoughts/shared/plans/2026-03-07-ZMI-TICKET-228-prisma-schema-employee-day-plans-shifts.md`
