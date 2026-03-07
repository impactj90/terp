# Research: ZMI-TICKET-228 -- Prisma Schema: employee_day_plans, shifts

## 1. Executive Summary

This ticket adds the `EmployeeDayPlan` model to the Prisma schema. The `Shift` and `ShiftAssignment` models already exist in the Prisma schema (added in ZMI-TICKET-222). The `employee_day_plans` table exists in the database (migrations 000023 + 000083) and has a full Go backend (model, repository, service, handler), but it is NOT yet represented in the Prisma schema. The shifts tRPC router currently uses `$queryRawUnsafe` / `$executeRawUnsafe` to access `employee_day_plans` because the model is missing from Prisma.

## 2. Database Schema (Actual)

### Table: `employee_day_plans`

Created by migration `000023_create_employee_day_plans.up.sql`, extended by `000083_add_shift_id_to_employee_day_plans.up.sql`.

Actual columns in the database:
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `tenant_id` UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
- `employee_id` UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE
- `plan_date` DATE NOT NULL
- `day_plan_id` UUID REFERENCES day_plans(id) ON DELETE SET NULL
- `shift_id` UUID REFERENCES shifts(id) ON DELETE SET NULL (added in migration 000083)
- `source` VARCHAR(20) DEFAULT 'tariff'
- `notes` TEXT
- `created_at` TIMESTAMPTZ DEFAULT NOW()
- `updated_at` TIMESTAMPTZ DEFAULT NOW()
- UNIQUE(employee_id, plan_date)

Indexes:
- `idx_employee_day_plans_tenant` ON (tenant_id)
- `idx_employee_day_plans_employee_date` ON (employee_id, plan_date)
- `idx_employee_day_plans_date` ON (plan_date)
- `idx_employee_day_plans_shift` ON (shift_id)

Note: The database uses `plan_date` as the column name, NOT `date` as proposed in the ticket.

### Table: `shifts`

Created by migration `000076_create_shift_planning.up.sql`. Already in Prisma schema at line 1869.

### Table: `shift_assignments`

Created by migration `000076_create_shift_planning.up.sql`. Already in Prisma schema at line 1902.

## 3. Ticket Proposal vs. Actual Database -- Discrepancies

The ticket proposes several fields that DO NOT exist in the database:

| Ticket Field | DB Column | Status |
|---|---|---|
| `id` | `id` | EXISTS |
| `tenant_id` | `tenant_id` | EXISTS |
| `employee_id` | `employee_id` | EXISTS |
| `date` | `plan_date` | EXISTS but different name -- DB uses `plan_date` |
| `day_plan_id` | `day_plan_id` | EXISTS |
| `shift_id` | `shift_id` | EXISTS |
| `is_work_day` | -- | DOES NOT EXIST in DB |
| `start_time` | -- | DOES NOT EXIST in DB |
| `end_time` | -- | DOES NOT EXIST in DB |
| `planned_hours` | -- | DOES NOT EXIST in DB |
| `break_minutes` | -- | DOES NOT EXIST in DB |
| `notes` | `notes` | EXISTS |
| `source` | `source` | EXISTS |
| `created_at` | `created_at` | EXISTS |
| `updated_at` | `updated_at` | EXISTS |

The Prisma schema is READ-ONLY against the database. Per the header comment in `schema.prisma`: "DO NOT run `prisma db push` or `prisma migrate dev`. Schema changes are managed via SQL migrations in `db/migrations/`." The Prisma model must match the actual DB columns exactly.

## 4. Go Backend -- Existing Implementation

### Model: `apps/api/internal/model/employeedayplan.go` (45 lines)

```go
type EmployeeDayPlan struct {
    ID         uuid.UUID             // pk
    TenantID   uuid.UUID
    EmployeeID uuid.UUID
    PlanDate   time.Time             // maps to plan_date
    DayPlanID  *uuid.UUID
    Source     EmployeeDayPlanSource // "tariff", "manual", "holiday"
    ShiftID    *uuid.UUID
    Notes      string
    CreatedAt  time.Time
    UpdatedAt  time.Time

    // Relations
    Employee *Employee
    DayPlan  *DayPlan
    Shift    *Shift
}
```

Source enum values: `tariff`, `manual`, `holiday`.

Helper method: `IsOffDay()` -- returns true when `DayPlanID == nil`.

### Model: `apps/api/internal/model/shift.go` (27 lines)

```go
type Shift struct {
    ID            uuid.UUID
    TenantID      uuid.UUID
    Code          string
    Name          string
    Description   string
    DayPlanID     *uuid.UUID
    Color         string
    Qualification string
    IsActive      bool
    SortOrder     int
    CreatedAt     time.Time
    UpdatedAt     time.Time
}
```

No relations defined, no back-references to EmployeeDayPlan or ShiftAssignment.

### Repository: `apps/api/internal/repository/employeedayplan.go`

Methods: `Create`, `GetByID` (preloads Shift), `Update`, `Delete`, `GetForEmployeeDate` (preloads DayPlan, DayPlan.Breaks, DayPlan.Bonuses, DayPlan.Bonuses.Account, Shift), `GetForEmployeeDateRange`, `List` (preloads DayPlan, Shift), `Upsert` (on conflict: employee_id, plan_date; updates day_plan_id, shift_id, source, notes, updated_at), `BulkCreate` (same upsert logic, batches of 100), `DeleteRange`, `DeleteByDateRange`, `DeleteRangeBySource`.

### Repository: `apps/api/internal/repository/shift.go`

Methods: `Create`, `GetByID`, `GetByCode`, `List`, `Update`, `Delete`, `Upsert` (for dev seeding), `HasAssignments` (checks employee_day_plans.shift_id).

### Service: `apps/api/internal/service/employeedayplan.go`

Full CRUD + BulkCreate + DeleteRange + GenerateFromTariff. Key behavior: when creating/updating with a ShiftID, the service auto-populates DayPlanID from the shift's DayPlanID if not explicitly provided.

### Service: `apps/api/internal/service/shift.go`

Full CRUD + UpsertDevShift. Delete checks HasAssignments (blocks deletion if referenced by employee_day_plans).

### Handler: `apps/api/internal/handler/employeedayplan.go`

HTTP handlers for all EDP operations. Uses generated models from `gen/models/`.

### Handler: `apps/api/internal/handler/shift.go`

HTTP handlers for CRUD. Uses generated models from `gen/models/`.

### Routes: `apps/api/internal/handler/routes.go`

- EDP routes at line 655: `/employee-day-plans` with permission `time_plans.manage`
- Shift routes at line 1517: `/shifts` with permission `shift_planning.manage`

## 5. Prisma Schema -- Current State

### Shift Model (already exists, line 1869)

```prisma
model Shift {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String    @map("tenant_id") @db.Uuid
  code          String    @db.VarChar(50)
  name          String    @db.VarChar(255)
  description   String?   @db.Text
  dayPlanId     String?   @map("day_plan_id") @db.Uuid
  color         String?   @db.VarChar(7)
  qualification String?   @db.Text
  isActive      Boolean   @default(true) @map("is_active")
  sortOrder     Int       @default(0) @map("sort_order")
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant           Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  dayPlan          DayPlan?          @relation(fields: [dayPlanId], references: [id], onDelete: SetNull)
  shiftAssignments ShiftAssignment[]

  @@unique([tenantId, code])
  @@index([tenantId], map: "idx_shifts_tenant")
  @@index([dayPlanId], map: "idx_shifts_day_plan")
  @@map("shifts")
}
```

### ShiftAssignment Model (already exists, line 1902)

```prisma
model ShiftAssignment {
  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId   String    @map("tenant_id") @db.Uuid
  employeeId String    @map("employee_id") @db.Uuid
  shiftId    String    @map("shift_id") @db.Uuid
  validFrom  DateTime? @map("valid_from") @db.Date
  validTo    DateTime? @map("valid_to") @db.Date
  notes      String?   @db.Text
  isActive   Boolean   @default(true) @map("is_active")
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt  DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  shift    Shift    @relation(fields: [shiftId], references: [id], onDelete: Cascade)

  @@index([tenantId], map: "idx_shift_assignments_tenant")
  @@index([employeeId], map: "idx_shift_assignments_employee")
  @@index([shiftId], map: "idx_shift_assignments_shift")
  @@index([validFrom, validTo], map: "idx_shift_assignments_dates")
  @@map("shift_assignments")
}
```

### EmployeeDayPlan -- DOES NOT EXIST in Prisma schema

The model is completely missing. This is confirmed by:
- No `@@map("employee_day_plans")` in the schema
- The shifts router uses `$queryRawUnsafe` with raw SQL to query employee_day_plans (line 357-362 of `apps/web/src/server/routers/shifts.ts`)
- The systemSettings router uses `$executeRawUnsafe` to delete from employee_day_plans (line 228 of `apps/web/src/server/routers/systemSettings.ts`)

## 6. Related Models -- Back-References Needed

When adding EmployeeDayPlan to Prisma, the following existing models need back-reference arrays:

### Employee Model (line 527)

Currently has: `shiftAssignments ShiftAssignment[]` (line 609)
Needs to add: `employeeDayPlans EmployeeDayPlan[]`

### DayPlan Model (line 1147)

Currently has: `shifts Shift[]` (line 1235), `tariffDayPlans TariffDayPlan[]` (line 1234)
Needs to add: `employeeDayPlans EmployeeDayPlan[]`

### Shift Model (line 1869)

Currently has: `shiftAssignments ShiftAssignment[]` (line 1886)
Needs to add: `employeeDayPlans EmployeeDayPlan[]`

### Tenant Model (line 83)

Currently has many relation arrays (shifts line 140, shiftAssignments line 141).
Needs to add: `employeeDayPlans EmployeeDayPlan[]`

## 7. tRPC Router -- Current State

### Shifts Router (`apps/web/src/server/routers/shifts.ts`)

Already fully implemented with list, getById, create, update, delete procedures. Registered in root.ts as `shifts: shiftsRouter`.

Key finding: The delete procedure (line 338-383) checks employee_day_plans using raw SQL because the model is not in Prisma:
```typescript
const dayPlanResult = await ctx.prisma.$queryRawUnsafe<[{ count: bigint }]>(
  `SELECT COUNT(*)::bigint as count FROM employee_day_plans WHERE shift_id = $1`,
  input.id
)
```

Once EmployeeDayPlan is added to Prisma, this can be replaced with `ctx.prisma.employeeDayPlan.count(...)`.

### Employee Day Plans Router

Does NOT exist as a tRPC router. This is explicitly out of scope per the ticket ("Employee Day Plans Router (TICKET-229)").

### SystemSettings Router (`apps/web/src/server/routers/systemSettings.ts`)

Uses raw SQL to delete from employee_day_plans (line 228):
```typescript
let sql = `DELETE FROM employee_day_plans WHERE tenant_id = $1::uuid AND date BETWEEN $2::date AND $3::date`
```

Note: The raw SQL query references the column as `date` which is INCORRECT -- the actual column name is `plan_date`. This appears to be a bug.

## 8. Frontend Usage

### React Hooks (`apps/web/src/hooks/api/use-employee-day-plans.ts`)

Calls the Go API directly (not tRPC):
- `useEmployeeDayPlans` -- GET /employee-day-plans
- `useEmployeeDayPlansForEmployee` -- GET /employees/{employee_id}/day-plans
- `useCreateEmployeeDayPlan` -- POST /employee-day-plans
- `useUpdateEmployeeDayPlan` -- PUT /employee-day-plans/{id}
- `useBulkCreateEmployeeDayPlans` -- POST /employee-day-plans/bulk
- `useDeleteEmployeeDayPlanRange` -- POST /employee-day-plans/delete-range
- `useDeleteEmployeeDayPlan` -- DELETE /employee-day-plans/{id}
- `useGenerateFromTariff` -- POST /employee-day-plans/generate-from-tariff (direct fetch, not useApiMutation)

### Shift Planning Components

- `apps/web/src/components/shift-planning/shift-planning-board.tsx`
- `apps/web/src/components/shift-planning/shift-assignment-form-dialog.tsx`
- `apps/web/src/components/shift-planning/delete-range-dialog.tsx`
- `apps/web/src/components/shift-planning/bulk-assign-dialog.tsx`

## 9. OpenAPI Schema

Defined in `api/schemas/employee-day-plans.yaml`. Fields match the actual DB columns (id, tenant_id, employee_id, plan_date, day_plan_id, shift_id, source, notes, created_at, updated_at). Includes nested `day_plan` and `shift` objects.

Generated Go models in `apps/api/gen/models/`:
- `employee_day_plan.go`
- `employee_day_plan_source.go`
- `employee_day_plan_list.go`
- `create_employee_day_plan_request.go`
- `update_employee_day_plan_request.go`
- `bulk_create_employee_day_plan_request.go`

## 10. Dev Seeding

`apps/api/internal/auth/devemployeedayplans.go` generates day plans for 5 dev employees across all of 2026. Uses deterministic UUIDs based on SHA-256 of employee_id + date. Maps employees to week configs (Mon-Thu + Friday day plans), handles weekends (nil day plan) and holidays (source="holiday").

## 11. Daily Calculation Integration

`apps/api/internal/service/daily_calc.go` uses `employeeDayPlanRepository.GetForEmployeeDate()` to look up the employee's day plan for a given date during daily calculation. This is a critical dependency -- the EmployeeDayPlan determines which DayPlan rules apply for computing work time, breaks, bonuses, etc.

## 12. Prisma Schema Conventions (from existing models)

Based on analysis of the existing 2684-line schema:

- IDs: `@id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`
- Column mapping: camelCase in Prisma, snake_case with `@map()` for DB
- Timestamps: `@db.Timestamptz(6)`, updatedAt uses `@updatedAt`
- Table mapping: `@@map("table_name")`
- Each model has a section header comment with migration number
- Relations use `onDelete: Cascade` for tenant, `onDelete: SetNull` for optional FKs
- Indexes use explicit `map:` with the actual DB index name

## 13. Key Files

| File | Path | Relevance |
|---|---|---|
| Go model (EDP) | `apps/api/internal/model/employeedayplan.go` | 45 lines, ticket says "will be replaced" |
| Go model (Shift) | `apps/api/internal/model/shift.go` | 27 lines, ticket says "will be replaced" |
| Go repo (EDP) | `apps/api/internal/repository/employeedayplan.go` | Full CRUD + bulk + range ops |
| Go repo (Shift) | `apps/api/internal/repository/shift.go` | Full CRUD + HasAssignments |
| Go service (EDP) | `apps/api/internal/service/employeedayplan.go` | Business logic + GenerateFromTariff |
| Go service (Shift) | `apps/api/internal/service/shift.go` | Business logic |
| Go handler (EDP) | `apps/api/internal/handler/employeedayplan.go` | HTTP handlers |
| Go handler (Shift) | `apps/api/internal/handler/shift.go` | HTTP handlers |
| Prisma schema | `apps/web/prisma/schema.prisma` | Shift at line 1869, EDP missing |
| Migration (EDP create) | `db/migrations/000023_create_employee_day_plans.up.sql` | Original table |
| Migration (EDP shift_id) | `db/migrations/000083_add_shift_id_to_employee_day_plans.up.sql` | Added shift_id |
| Migration (Shift) | `db/migrations/000076_create_shift_planning.up.sql` | shifts + shift_assignments |
| tRPC Shifts | `apps/web/src/server/routers/shifts.ts` | Uses raw SQL for EDP check |
| tRPC SystemSettings | `apps/web/src/server/routers/systemSettings.ts` | Uses raw SQL to delete EDPs |
| tRPC Root | `apps/web/src/server/root.ts` | Router registry |
| OpenAPI schema | `api/schemas/employee-day-plans.yaml` | EDP API definition |
| Dev seeding | `apps/api/internal/auth/devemployeedayplans.go` | Dev EDP generation |
| Daily calc | `apps/api/internal/service/daily_calc.go` | Uses EDP for calculation |
| React hooks | `apps/web/src/hooks/api/use-employee-day-plans.ts` | Frontend API hooks |

## 14. Summary of What Needs to Happen

1. Add `EmployeeDayPlan` model to Prisma schema matching the ACTUAL database columns (id, tenant_id, employee_id, plan_date, day_plan_id, shift_id, source, notes, created_at, updated_at)
2. Add back-reference arrays to Employee, DayPlan, Shift, and Tenant models
3. Run `prisma generate` to produce updated TypeScript types
4. The Shift and ShiftAssignment models already exist in Prisma -- no changes needed for those

Critical note: The ticket's proposed schema includes fields (is_work_day, start_time, end_time, planned_hours, break_minutes) that do not exist in the database. The Prisma model must match the actual DB schema, not the ticket's proposed schema. The `date` field in the ticket maps to `plan_date` in the actual DB.
