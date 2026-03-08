# ZMI-TICKET-237: Prisma Schema -- MonthlyValue, AbsenceDay, VacationBalance -- Implementation Plan

## Overview

Add the missing `AbsenceDay` Prisma model to the schema, add back-reference relation arrays to three existing models (`Tenant`, `Employee`, `AbsenceType`), regenerate the Prisma client, and replace the raw SQL query in the `absenceTypes.ts` router with a type-safe Prisma call.

The `MonthlyValue` and `VacationBalance` models already exist in the Prisma schema and match the database exactly. No changes are needed for them.

## Current State Analysis

### MonthlyValue -- Already in Prisma (line 2374)
The `MonthlyValue` model already exists in the Prisma schema at line 2374 with all 22 columns matching the database exactly. It has proper relations to `Tenant` and `Employee`, with reverse relation arrays on both parent models (`Tenant.monthlyValues` at line 153, `Employee.monthlyValues` at line 619). **No changes needed.**

### VacationBalance -- Already in Prisma (line 1722)
The `VacationBalance` model already exists in the Prisma schema at line 1722 with all 10 columns matching the database exactly. It has proper relations to `Tenant` and `Employee`, with reverse relation arrays on both parent models (`Tenant.vacationBalances` at line 136, `Employee.vacationBalances` at line 613). **No changes needed.**

### AbsenceDay -- Missing from Prisma
The `absence_days` table exists in the database (created by migration `000026`). The Go backend has a complete implementation (model at `apps/api/internal/model/absenceday.go`, repository, service, handler). However, there is **no corresponding Prisma model**, which forces the `absenceTypes.ts` tRPC router to use raw SQL:

1. **AbsenceTypes router** (`apps/web/src/server/routers/absenceTypes.ts`, lines 468-472) -- raw SQL `SELECT COUNT(*)::int as count FROM absence_days WHERE absence_type_id = $1` to check usage before deletion

Additionally, several services use raw SQL for `absence_days`:
- **daily-calc.ts** (line 353, 937) -- SELECT and INSERT queries (these are complex queries that may remain as raw SQL for now)
- **reports.ts** (line 948) -- SELECT with joins to `absence_types` and `employees`

### Key Discovery -- Ticket Schema Does NOT Match the Actual Database

**Critical**: The ticket's proposed Prisma models contain fields that DO NOT exist in the database and are missing fields that DO exist. The Prisma schema header explicitly states: "This schema is READ-ONLY against the existing PostgreSQL database. DO NOT run `prisma db push` or `prisma migrate dev`." Therefore, the Prisma models must match the actual DB columns exactly, NOT the ticket's proposed schema.

Specific discrepancies for AbsenceDay:

| Ticket proposes | Actual DB column | Status |
|---|---|---|
| `date DateTime @db.Date` | `absence_date DATE` | Different name |
| `hours Decimal?` | N/A | Does not exist in DB |
| `is_half_day Boolean` | N/A | Does not exist (DB uses `half_day_period VARCHAR(10)`) |
| N/A | `duration DECIMAL(3,2) DEFAULT 1.00` | Missing from ticket |
| N/A | `half_day_period VARCHAR(10)` | Missing from ticket |
| N/A | `status VARCHAR(20) DEFAULT 'pending'` | Missing from ticket |
| `approved_at DateTime?` | `approved_at TIMESTAMPTZ` | Matches |
| `approved_by String?` | `approved_by UUID REFERENCES users(id)` | Matches |
| `rejected_at DateTime?` | N/A | Does not exist in DB |
| `rejected_by String?` | N/A | Does not exist in DB |
| `rejection_reason String?` | `rejection_reason TEXT` | Matches |
| N/A | `notes TEXT` | Missing from ticket |
| N/A | `created_by UUID REFERENCES users(id)` | Missing from ticket |
| `absence_range_id String?` | N/A | Does not exist in DB |
| `deleted_at DateTime?` | N/A | Does not exist in DB |

The MonthlyValue and VacationBalance ticket schemas are also wrong, but since those models already exist in Prisma matching the real DB, this is moot.

### Partial Indexes
The following partial index exists in the DB but CANNOT be modeled in Prisma. It will be documented as a comment in the model header, matching established convention:
- `idx_absence_days_unique` UNIQUE ON (employee_id, absence_date) WHERE status != 'cancelled'

### FK Relationships in absence_days
- `tenant_id` -> `tenants(id) ON DELETE CASCADE`
- `employee_id` -> `employees(id) ON DELETE CASCADE`
- `absence_type_id` -> `absence_types(id)` -- NO explicit ON DELETE (defaults to NO ACTION/RESTRICT)
- `approved_by` -> `users(id)` -- NO explicit ON DELETE (bare UUID, audit field)
- `created_by` -> `users(id)` -- NO explicit ON DELETE (bare UUID, audit field)

## Desired End State

1. `AbsenceDay` model exists in the Prisma schema matching all 14 actual database columns exactly
2. Back-reference arrays added to: `Tenant`, `Employee`, `AbsenceType`
3. `prisma generate` succeeds, producing updated TypeScript types
4. The `absenceTypes.ts` router uses Prisma `count()` instead of raw SQL for absence day usage check

**Verification**: `npx prisma validate` and `npx prisma generate` pass. `npx tsc --noEmit` passes (pre-existing errors only, no new errors).

## What We're NOT Doing

- NOT modifying the existing `MonthlyValue` Prisma model (it already matches the DB)
- NOT modifying the existing `VacationBalance` Prisma model (it already matches the DB)
- NOT adding database migrations (the `absence_days` table already exists with all needed columns)
- NOT adding fields that don't exist in the database (see discrepancy table above)
- NOT modifying Go backend files
- NOT replacing raw SQL in `daily-calc.ts` or `reports.ts` (those complex queries with joins are out of scope for this ticket and would be addressed in dedicated absence/report router tickets)
- NOT creating absence CRUD routers (that is ZMI-TICKET-240)
- NOT creating vacation balance routers (that is ZMI-TICKET-242)

## Implementation Approach

This follows the established pattern from ZMI-TICKET-231 (Booking, DailyValue, DailyAccountValue):
1. Add Prisma model matching the actual database schema
2. Add back-reference arrays to related models
3. Regenerate the Prisma client
4. Replace raw SQL with type-safe Prisma call in existing router

Split into two phases: Prisma schema changes (Phase 1) and raw SQL replacement in absenceTypes router (Phase 2).

---

## Phase 1: Prisma Schema Addition

### Overview
Add the `AbsenceDay` model to the Prisma schema, add back-reference relation arrays to three existing models (`Tenant`, `Employee`, `AbsenceType`), and run `npx prisma generate`.

### Changes Required

#### 1. Add back-reference to Tenant model
**File**: `apps/web/prisma/schema.prisma`
**Location**: Tenant model relations section (after `dailyAccountValues DailyAccountValue[]`, currently line 166)

Add after `dailyAccountValues          DailyAccountValue[]`:
```prisma
  absenceDays                 AbsenceDay[]
```

#### 2. Add back-reference to Employee model
**File**: `apps/web/prisma/schema.prisma`
**Location**: Employee model relations section (after `dailyAccountValues   DailyAccountValue[]`, currently line 623)

Add after `dailyAccountValues   DailyAccountValue[]`:
```prisma
  absenceDays          AbsenceDay[]
```

#### 3. Add back-reference to AbsenceType model
**File**: `apps/web/prisma/schema.prisma`
**Location**: AbsenceType model relations section (after `calculationRule   CalculationRule?   ...`, currently line 1135)

Add after `calculationRule   CalculationRule?   @relation(fields: [calculationRuleId], references: [id], onDelete: SetNull)`:
```prisma
  absenceDays       AbsenceDay[]
```

#### 4. Add AbsenceDay model
**File**: `apps/web/prisma/schema.prisma`
**Location**: After the `DailyAccountValue` model (after line 2908, at end of file)

Insert the following model block:

```prisma

// -----------------------------------------------------------------------------
// AbsenceDay
// -----------------------------------------------------------------------------
// Migration: 000026
//
// Tracks employee absences per date, linked to absence_types for credit calculation.
// Duration: 1.00 = full day, 0.50 = half day.
// Status values: 'pending', 'approved', 'rejected', 'cancelled'
// Half-day period values: 'morning', 'afternoon'
//
// Partial unique index (cannot be modeled in Prisma, enforced at DB level):
//   - idx_absence_days_unique: UNIQUE ON (employee_id, absence_date) WHERE status != 'cancelled'
//
// approved_by and created_by are bare UUIDs without Prisma relations (audit fields,
// FK to users(id) with default NO ACTION).
//
// Trigger: update_absence_days_updated_at auto-sets updated_at on UPDATE
model AbsenceDay {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String    @map("tenant_id") @db.Uuid
  employeeId      String    @map("employee_id") @db.Uuid

  // The date and type of absence
  absenceDate     DateTime  @map("absence_date") @db.Date
  absenceTypeId   String    @map("absence_type_id") @db.Uuid

  // Duration: 1.00 = full day, 0.50 = half day
  duration        Decimal   @default(1.00) @db.Decimal(3, 2)

  // Half day specification (when duration = 0.5)
  halfDayPeriod   String?   @map("half_day_period") @db.VarChar(10)

  // Approval workflow
  status          String    @default("pending") @db.VarChar(20)
  approvedBy      String?   @map("approved_by") @db.Uuid
  approvedAt      DateTime? @map("approved_at") @db.Timestamptz(6)
  rejectionReason String?   @map("rejection_reason") @db.Text

  // Optional notes
  notes           String?   @db.Text

  // Audit
  createdBy       String?   @map("created_by") @db.Uuid

  // Timestamps
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant      Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee    Employee    @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  absenceType AbsenceType @relation(fields: [absenceTypeId], references: [id])

  // Indexes
  @@index([tenantId], map: "idx_absence_days_tenant")
  @@index([employeeId], map: "idx_absence_days_employee")
  @@index([absenceDate], map: "idx_absence_days_date")
  @@index([absenceTypeId], map: "idx_absence_days_type")
  @@index([status], map: "idx_absence_days_status")
  @@index([employeeId, absenceDate], map: "idx_absence_days_lookup")
  @@index([employeeId, absenceDate, status], map: "idx_absence_days_range")
  @@map("absence_days")
}
```

**Design notes**:
- `absenceTypeId` relation has no `onDelete` clause because the DB FK has no explicit ON DELETE (defaults to NO ACTION/RESTRICT). Prisma's default behavior matches this. The `absenceTypes.ts` router manually checks for usage before deletion.
- `approvedBy` and `createdBy` are bare UUIDs without Prisma relations. These are audit fields with FKs to `users(id)` but no explicit ON DELETE clause. Following the same pattern as `Booking.createdBy`, `Booking.updatedBy`, `MonthlyValue.closedBy`, and `MonthlyValue.reopenedBy`.
- `updatedAt` uses `@updatedAt` because the `absence_days` table has an `update_absence_days_updated_at` trigger that auto-sets `updated_at` on UPDATE. This matches how the existing `MonthlyValue` and `VacationBalance` models use `@updatedAt`.
- The partial unique index `idx_absence_days_unique` cannot be represented in Prisma and is documented in the header comment.
- `duration` uses `@db.Decimal(3, 2)` matching the actual DB column `DECIMAL(3,2)`.

#### 5. Generate Prisma Client
Run from `apps/web/`:
```bash
cd apps/web && npx prisma generate
```

### Success Criteria

#### Automated Verification:
- [ ] `cd apps/web && npx prisma validate` passes
- [ ] `cd apps/web && npx prisma generate` completes without errors
- [ ] `cd apps/web && npx tsc --noEmit` passes (pre-existing errors only, no new errors)
- [ ] Generated file exists: `apps/web/src/generated/prisma/models/AbsenceDay.ts`

#### Manual Verification:
- [ ] Prisma Studio shows the `AbsenceDay` model with correct columns matching the database
- [ ] Existing data in `absence_days` is visible and readable through Prisma Studio
- [ ] The `AbsenceType` model shows `absenceDays` as a relation array

#### DB Schema Verification (optional but recommended):
Run `npx prisma db pull --print` and compare the generated schema for `absence_days` against our model to verify column names, types, and constraints match.

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 2.

---

## Phase 2: Replace Raw SQL in absenceTypes Router

### Overview
Replace the raw SQL query that checks `absence_days` usage in the `absenceTypes.ts` tRPC router with a type-safe Prisma `count()` call.

### Changes Required

#### 1. AbsenceTypes Router -- Replace raw SQL in delete procedure
**File**: `apps/web/src/server/routers/absenceTypes.ts`

**Current code** (lines 468-472):
```typescript
// Check usage in absence_days table via raw SQL
const result = await ctx.prisma.$queryRawUnsafe<[{ count: number }]>(
  `SELECT COUNT(*)::int as count FROM absence_days WHERE absence_type_id = $1`,
  input.id
)
if (result[0] && result[0].count > 0) {
```

**Replace with**:
```typescript
// Check usage in absence_days table
const absenceDayCount = await ctx.prisma.absenceDay.count({
  where: { absenceTypeId: input.id },
})
if (absenceDayCount > 0) {
```

The error message and TRPCError on the next lines remain unchanged.

#### 2. Update absenceTypes Router Test
**File**: `apps/web/src/server/__tests__/absenceTypes-router.test.ts`

The test at line 541 ("blocks deletion when absence_days reference the type") currently mocks `$queryRawUnsafe`. Update to mock `absenceDay.count` instead. The exact changes depend on the test's mock structure, but the pattern is:
- Replace `$queryRawUnsafe` mock with `absenceDay: { count: vi.fn().mockResolvedValue(1) }`
- Update the assertion to verify `absenceDay.count` was called with the correct `where` clause

### Success Criteria

#### Automated Verification:
- [ ] `cd apps/web && npx tsc --noEmit` passes (pre-existing errors only, no new errors)
- [ ] `cd apps/web && npm run lint` passes (or only pre-existing lint issues)
- [ ] No references to `$queryRawUnsafe` for `absence_days` remain in `absenceTypes.ts`:
  ```bash
  grep -n "queryRawUnsafe\|absence_days" apps/web/src/server/routers/absenceTypes.ts
  ```
  should return zero raw SQL hits (comments are acceptable)
- [ ] Tests pass: `cd apps/web && npx vitest run --reporter=verbose apps/web/src/server/__tests__/absenceTypes-router.test.ts`

#### Manual Verification:
- [ ] Absence type deletion correctly blocks when absence days reference the type
- [ ] Absence type deletion succeeds when no absence days reference the type

---

## Testing Strategy

### Unit Tests
- Update the `absenceTypes-router.test.ts` test to use Prisma mock instead of raw SQL mock (Phase 2)
- No other new unit tests required for the Prisma schema addition

### Integration Tests
- `npx prisma validate` confirms the schema is syntactically correct and internally consistent
- `npx prisma generate` confirms the schema compiles to a working Prisma client
- `npx tsc --noEmit` confirms all TypeScript code compiles with the new types and the raw SQL replacement is type-safe

### Manual Testing Steps
1. Open Prisma Studio and verify `AbsenceDay` model appears with all expected columns
2. Verify existing `absence_days` data is readable through Prisma Studio
3. Verify `AbsenceType` shows `absenceDays` as a clickable relation array
4. Test absence type deletion prevention when absence days reference the type

## Migration Notes

- **No database migrations needed** -- the `absence_days` table already exists with all required columns (migration 000026)
- The Prisma schema changes are purely additive (one new model + back-reference arrays on three existing models)
- The Go backend remains fully functional -- both REST and tRPC endpoints coexist
- The existing raw SQL in `daily-calc.ts` and `reports.ts` is NOT being replaced in this ticket. Those are complex queries with joins that will be addressed when the dedicated absence and report routers are implemented (ZMI-TICKET-240, etc.)

## References

- Research document: `thoughts/shared/research/2026-03-08-ZMI-TICKET-237-prisma-schema-monthly-absences-vacation.md`
- Ticket: `thoughts/shared/tickets/ZMI-TICKET-237-prisma-schema-monthly-absences-vacation.md`
- Prisma schema: `apps/web/prisma/schema.prisma`
- Go AbsenceDay model: `apps/api/internal/model/absenceday.go`
- Go MonthlyValue model: `apps/api/internal/model/monthlyvalue.go`
- Go VacationBalance model: `apps/api/internal/model/vacationbalance.go`
- Migration (create absence_days): `db/migrations/000026_create_absence_days.up.sql`
- Migration (create vacation_balances): `db/migrations/000027_create_vacation_balances.up.sql`
- Migration (create monthly_values): `db/migrations/000028_create_monthly_values.up.sql`
- Migration (carryover_expires_at): `db/migrations/000052_create_employee_capping_exceptions.up.sql`
- AbsenceTypes tRPC router: `apps/web/src/server/routers/absenceTypes.ts`
- AbsenceTypes test: `apps/web/src/server/__tests__/absenceTypes-router.test.ts`
- Similar plan (TICKET-231): `thoughts/shared/plans/2026-03-07-ZMI-TICKET-231-prisma-schema-bookings-daily-values.md`
