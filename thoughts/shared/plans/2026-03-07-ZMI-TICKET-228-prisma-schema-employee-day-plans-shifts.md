# ZMI-TICKET-228: Prisma Schema -- Employee Day Plans & Shifts -- Implementation Plan

## Overview

Add the `EmployeeDayPlan` model to the Prisma schema, add back-reference relation arrays to existing models (`Employee`, `DayPlan`, `Shift`, `Tenant`), regenerate the Prisma client, and replace raw SQL queries in the `shifts` and `systemSettings` tRPC routers with type-safe Prisma calls. The `Shift` and `ShiftAssignment` models already exist in the Prisma schema (added in ZMI-TICKET-222) and require no changes beyond adding the new `employeeDayPlans` back-reference to `Shift`.

## Current State Analysis

### EmployeeDayPlan -- Missing from Prisma
The `employee_day_plans` table exists in the database (created by migration `000023`, extended by migration `000083` which added `shift_id`). The Go backend has a complete implementation (model, repository, service, handler). However, the table has **no corresponding Prisma model**, which forces two tRPC routers to use raw SQL:

1. **Shifts router** (`apps/web/src/server/routers/shifts.ts`, line 357-362) -- uses `$queryRawUnsafe` to check if a shift is in use by `employee_day_plans` before deletion
2. **SystemSettings router** (`apps/web/src/server/routers/systemSettings.ts`, line 222-237) -- uses `$executeRawUnsafe` to delete from `employee_day_plans` during the "delete booking data" cleanup operation

### Shift & ShiftAssignment -- Already in Prisma
Both models already exist in the Prisma schema (lines 1869-1925) with correct structure. No schema changes needed for these two models themselves.

### Key Discoveries:
- The **ticket's proposed schema** includes fields that DO NOT exist in the database (`is_work_day`, `start_time`, `end_time`, `planned_hours`, `break_minutes`). The Prisma model must match the actual DB columns exactly, per the schema header comment: "This schema is READ-ONLY against the existing PostgreSQL database." (`apps/web/prisma/schema.prisma`, line 2-3)
- The ticket proposes a field named `date`, but the actual database column is `plan_date` (`db/migrations/000023_create_employee_day_plans.up.sql`, line 9)
- The `systemSettings.ts` `buildEdpQuery` function (line 228) references column `date` instead of `plan_date` -- this is a **pre-existing bug** that should be noted but is out of scope for this ticket (the raw SQL will be replaced with Prisma calls anyway)
- The `source` column in the database is `VARCHAR(20) DEFAULT 'tariff'`, with enum values: `tariff`, `manual`, `holiday` (from `apps/api/internal/model/employeedayplan.go`)
- Back-references are needed on four existing models: `Tenant` (line 83), `Employee` (line 527), `DayPlan` (line 1147), `Shift` (line 1869)
- The Prisma schema uses section header comments with migration numbers (e.g., `// Migration: 000076`), camelCase field names with `@map()` for snake_case DB columns, and `@db.Uuid` for UUID fields
- The `employee_day_plans` table has a UNIQUE constraint on `(employee_id, plan_date)` and four indexes

## Desired End State

1. `EmployeeDayPlan` model exists in the Prisma schema matching the actual database columns exactly
2. Back-reference arrays (`employeeDayPlans EmployeeDayPlan[]`) added to `Tenant`, `Employee`, `DayPlan`, and `Shift` models
3. `prisma generate` succeeds, producing updated TypeScript types
4. The `shifts.ts` router `delete` procedure uses `ctx.prisma.employeeDayPlan.count(...)` instead of `$queryRawUnsafe`
5. The `systemSettings.ts` router `cleanupDeleteBookingData` procedure uses `ctx.prisma.employeeDayPlan.deleteMany(...)` instead of `$executeRawUnsafe`, fixing the column name bug (`date` vs `plan_date`) in the process

**Verification**: `npx prisma validate` and `npx prisma generate` pass. `npx tsc --noEmit` passes. The two tRPC routers compile without raw SQL for employee_day_plans.

## What We're NOT Doing

- NOT creating the Employee Day Plans tRPC router (that is ZMI-TICKET-229)
- NOT adding database migrations (the table already exists with all needed columns)
- NOT adding fields that don't exist in the database (`is_work_day`, `start_time`, `end_time`, `planned_hours`, `break_minutes`)
- NOT modifying the Go backend files
- NOT changing any frontend hooks (no EDP frontend hooks use tRPC yet)
- NOT modifying the Shift or ShiftAssignment Prisma models (they already exist correctly)

## Implementation Approach

This is a small, focused change following the established pattern from ZMI-TICKET-222 through ZMI-TICKET-227:
1. Add the Prisma model matching the actual database schema
2. Add back-reference arrays to related models
3. Regenerate the Prisma client
4. Replace raw SQL with type-safe Prisma calls in two existing routers

Split into two phases: Prisma schema changes (Phase 1) and raw SQL replacement (Phase 2).

---

## Phase 1: Prisma Schema Addition

### Overview
Add the `EmployeeDayPlan` model to the Prisma schema and add back-reference relation arrays to `Tenant`, `Employee`, `DayPlan`, and `Shift`. Run `npx prisma generate` to regenerate the Prisma client.

### Changes Required:

#### 1. Add back-reference to Tenant model
**File**: `apps/web/prisma/schema.prisma`
**Location**: Tenant model relations section (after line 141, after `shiftAssignments`)

Add after the `shiftAssignments` line:
```prisma
  employeeDayPlans            EmployeeDayPlan[]
```

#### 2. Add back-reference to Employee model
**File**: `apps/web/prisma/schema.prisma`
**Location**: Employee model relations section (after line 609, after `shiftAssignments`)

Add after the `shiftAssignments` line:
```prisma
  employeeDayPlans EmployeeDayPlan[]
```

#### 3. Add back-reference to DayPlan model
**File**: `apps/web/prisma/schema.prisma`
**Location**: DayPlan model relations section (after line 1235, after `shifts`)

Add after the `shifts` line:
```prisma
  employeeDayPlans EmployeeDayPlan[]
```

#### 4. Add back-reference to Shift model
**File**: `apps/web/prisma/schema.prisma`
**Location**: Shift model relations section (after line 1886, after `shiftAssignments`)

Add after the `shiftAssignments` line:
```prisma
  employeeDayPlans EmployeeDayPlan[]
```

#### 5. Add EmployeeDayPlan model
**File**: `apps/web/prisma/schema.prisma`
**Location**: After the `ShiftAssignment` model (after line 1925), before the `Macro` model

Insert the following model block:

```prisma
// -----------------------------------------------------------------------------
// EmployeeDayPlan
// -----------------------------------------------------------------------------
// Migrations: 000023, 000083
//
// Stores assigned day plans per employee per date.
// day_plan_id NULL represents an off day (no work scheduled).
// source values: 'tariff', 'manual', 'holiday'
//
// CHECK constraints (enforced at DB level only):
//   - UNIQUE(employee_id, plan_date)
model EmployeeDayPlan {
  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId   String    @map("tenant_id") @db.Uuid
  employeeId String    @map("employee_id") @db.Uuid
  planDate   DateTime  @map("plan_date") @db.Date
  dayPlanId  String?   @map("day_plan_id") @db.Uuid
  shiftId    String?   @map("shift_id") @db.Uuid
  source     String?   @default("tariff") @db.VarChar(20)
  notes      String?   @db.Text
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt  DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant   Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  dayPlan  DayPlan?  @relation(fields: [dayPlanId], references: [id], onDelete: SetNull)
  shift    Shift?    @relation(fields: [shiftId], references: [id], onDelete: SetNull)

  // Constraints & indexes
  @@unique([employeeId, planDate])
  @@index([tenantId], map: "idx_employee_day_plans_tenant")
  @@index([employeeId, planDate], map: "idx_employee_day_plans_employee_date")
  @@index([planDate], map: "idx_employee_day_plans_date")
  @@index([shiftId], map: "idx_employee_day_plans_shift")
  @@map("employee_day_plans")
}
```

#### 6. Generate Prisma Client
Run from `apps/web/`:
```bash
cd apps/web && npx prisma generate
```

### Success Criteria:

#### Automated Verification:
- [x] `cd apps/web && npx prisma validate` passes
- [x] `cd apps/web && npx prisma generate` completes without errors
- [x] `cd apps/web && npx tsc --noEmit` passes (TypeScript compilation -- pre-existing frontend errors only, no new errors)

#### Manual Verification:
- [ ] Prisma Studio shows the `EmployeeDayPlan` model with correct columns matching the database
- [ ] Existing `employee_day_plans` data is visible and readable through Prisma Studio

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Replace Raw SQL with Prisma Calls

### Overview
Replace the raw SQL queries that access `employee_day_plans` in the `shifts` and `systemSettings` tRPC routers with type-safe Prisma client calls, now that the `EmployeeDayPlan` model exists.

### Changes Required:

#### 1. Shifts Router -- Replace raw SQL in delete procedure
**File**: `apps/web/src/server/routers/shifts.ts`

**Current code** (lines 356-363):
```typescript
// Check if shift is in use via employee_day_plans (not in Prisma schema)
const dayPlanResult = await ctx.prisma.$queryRawUnsafe<
  [{ count: bigint }]
>(
  `SELECT COUNT(*)::bigint as count FROM employee_day_plans WHERE shift_id = $1`,
  input.id
)
const inUseByDayPlans = Number(dayPlanResult[0].count) > 0
```

**Replace with**:
```typescript
// Check if shift is in use via employee_day_plans
const dayPlanCount = await ctx.prisma.employeeDayPlan.count({
  where: { shiftId: input.id },
})
const inUseByDayPlans = dayPlanCount > 0
```

Also update the comment on line 356 to remove "(not in Prisma schema)".

#### 2. SystemSettings Router -- Replace raw SQL in cleanup procedure
**File**: `apps/web/src/server/routers/systemSettings.ts`

**Current code** -- the `buildEdpQuery` function (lines 222-237):
```typescript
function buildEdpQuery(
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  employeeIds?: string[]
): [string, unknown[]] {
  let sql = `DELETE FROM employee_day_plans WHERE tenant_id = $1::uuid AND date BETWEEN $2::date AND $3::date`
  const params: unknown[] = [tenantId, dateFrom, dateTo]

  if (employeeIds && employeeIds.length > 0) {
    sql += ` AND employee_id = ANY($4::uuid[])`
    params.push(employeeIds)
  }

  return [sql, params]
}
```

Note: This function references column `date` which is INCORRECT -- the actual column name is `plan_date`. This is a pre-existing bug that will be fixed automatically by switching to Prisma.

**Replace the `buildEdpQuery` function** with a new helper that uses Prisma directly:

```typescript
/**
 * Deletes employee_day_plans for a tenant within a date range, with optional employee filter.
 * Uses Prisma model instead of raw SQL.
 */
async function deleteEmployeeDayPlans(
  prisma: PrismaClient,
  tenantId: string,
  dateFrom: string,
  dateTo: string,
  employeeIds?: string[]
): Promise<number> {
  const where: Record<string, unknown> = {
    tenantId,
    planDate: {
      gte: new Date(dateFrom),
      lte: new Date(dateTo),
    },
  }

  if (employeeIds && employeeIds.length > 0) {
    where.employeeId = { in: employeeIds }
  }

  const result = await prisma.employeeDayPlan.deleteMany({ where })
  return result.count
}
```

**Update the `cleanupDeleteBookingData` procedure** (execute mode, lines 467-479):

Replace the current code block:
```typescript
const [edpSql, edpParams] = buildEdpQuery(
  tenantId,
  input.dateFrom,
  input.dateTo,
  input.employeeIds
)
```
and
```typescript
ctx.prisma.$executeRawUnsafe(edpSql, ...edpParams),
```

With:
```typescript
deleteEmployeeDayPlans(
  ctx.prisma,
  tenantId,
  input.dateFrom,
  input.dateTo,
  input.employeeIds
),
```

The `Promise.all` call at lines 474-479 should be updated to include the `deleteEmployeeDayPlans` call instead of `ctx.prisma.$executeRawUnsafe(edpSql, ...edpParams)`. The destructured result `deletedEdps` remains unchanged.

After making these changes, remove the now-unused `buildEdpQuery` function entirely.

### Success Criteria:

#### Automated Verification:
- [x] `cd apps/web && npx tsc --noEmit` passes (TypeScript compilation -- pre-existing errors only, no new errors)
- [x] `cd apps/web && npm run lint` passes (or only pre-existing lint issues -- 25 pre-existing errors, none in our files)
- [x] No references to `$queryRawUnsafe` or `$executeRawUnsafe` for `employee_day_plans` remain in the codebase:
  ```bash
  grep -rn "employee_day_plans" apps/web/src/server/routers/
  ```
  should return zero results

#### Manual Verification:
- [ ] Shifts delete procedure still correctly prevents deletion of shifts in use by employee_day_plans
- [ ] SystemSettings cleanup "delete booking data" procedure correctly deletes employee_day_plans within the date range
- [ ] The `plan_date` column is correctly filtered (the pre-existing `date` bug is resolved)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:
No new unit tests required. The existing Go test suites validate the business logic for both employee day plans and shifts. The Prisma schema change is purely a type definition that is validated by `prisma validate` and `prisma generate`.

### Integration Tests:
- `npx prisma validate` confirms the schema is syntactically correct and internally consistent
- `npx prisma generate` confirms the schema compiles to a working Prisma client
- `npx tsc --noEmit` confirms all TypeScript code compiles with the new types

### Manual Testing Steps:
1. Open Prisma Studio and verify the `EmployeeDayPlan` model appears with all expected columns
2. Verify existing `employee_day_plans` data is readable through Prisma Studio
3. Test the shifts delete procedure: try deleting a shift that is referenced by an employee_day_plan -- should return error "Cannot delete shift that is in use"
4. Test the shifts delete procedure: delete a shift with no references -- should succeed
5. Test systemSettings cleanupDeleteBookingData in preview mode (confirm: false) -- verify counts are returned
6. Test systemSettings cleanupDeleteBookingData in execute mode (confirm: true) -- verify employee_day_plans are deleted for the correct date range

## Performance Considerations

- The Prisma `count()` call in the shifts router delete procedure is equivalent to the raw SQL `SELECT COUNT(*)` -- no performance difference. The `idx_employee_day_plans_shift` index supports this query.
- The Prisma `deleteMany()` call in the systemSettings cleanup is equivalent to the raw SQL `DELETE FROM` -- no performance difference. The `idx_employee_day_plans_tenant` and `idx_employee_day_plans_date` indexes support this query.
- Actually, the Prisma version may perform *better* in the systemSettings case because it correctly filters on `plan_date` instead of the non-existent `date` column (which would have caused a runtime SQL error).

## Migration Notes

- No database migrations needed -- the `employee_day_plans` table already exists with all required columns
- The Prisma schema changes are purely additive (one new model + four back-reference arrays)
- The Go backend remains fully functional -- both REST and tRPC endpoints coexist
- The raw SQL bug in `systemSettings.ts` (`date` instead of `plan_date`) will be automatically fixed by switching to Prisma calls

## References

- Research document: `thoughts/shared/research/2026-03-07-ZMI-TICKET-228-prisma-schema-employee-day-plans-shifts.md`
- Ticket: `thoughts/shared/tickets/ZMI-TICKET-228-prisma-schema-employee-day-plans-shifts.md`
- Prisma schema: `apps/web/prisma/schema.prisma`
- Shifts tRPC router: `apps/web/src/server/routers/shifts.ts`
- SystemSettings tRPC router: `apps/web/src/server/routers/systemSettings.ts`
- DB migration (create table): `db/migrations/000023_create_employee_day_plans.up.sql`
- DB migration (add shift_id): `db/migrations/000083_add_shift_id_to_employee_day_plans.up.sql`
- Go model (EDP): `apps/api/internal/model/employeedayplan.go`
- Go model (Shift): `apps/api/internal/model/shift.go`
- Similar plan: `thoughts/shared/plans/2026-03-07-ZMI-TICKET-227-monthly-eval-templates-correction-messages.md`
