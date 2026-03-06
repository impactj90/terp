# tRPC Routers: Groups, Activities, Orders, Order Assignments - Implementation Plan

## Overview

Implement four tRPC routers for Groups (3 types: employee, workflow, activity), Activities, Orders, and Order Assignments by porting business logic from the Go backend into TypeScript tRPC procedures. This includes adding the required Prisma models (which do not yet exist), building CRUD routers, and migrating frontend hooks from the old `useApiQuery`/`useApiMutation` pattern to tRPC. A new groups frontend hook will also be created.

## Current State Analysis

- **Prisma models**: NONE of the four entity types exist in the Prisma schema yet. The `Employee` model has bare FK columns (`employeeGroupId`, `workflowGroupId`, `activityGroupId`, `defaultOrderId`, `defaultActivityId`) with comments noting the target models are "not yet in Prisma" (`apps/web/prisma/schema.prisma:541-554`).
- **Database tables**: All tables already exist via SQL migrations: `employee_groups`, `workflow_groups`, `activity_groups` (migration 000041), `activities` (migration 000053), `orders` (migration 000055), `order_assignments` (migration 000056).
- **Go business logic**: Complete service implementations exist for all four entities in `apps/api/internal/service/`.
- **Permission catalog**: All four permissions already exist in `apps/web/src/server/lib/permission-catalog.ts`: `groups.manage` (line 125), `activities.manage` (line 138), `orders.manage` (line 143), `order_assignments.manage` (line 148). No new permissions needed.
- **tRPC infrastructure**: Fully operational with `tenantProcedure`, `requirePermission`, and `createCallerFactory`.
- **Root router**: 16 routers currently registered in `apps/web/src/server/root.ts` -- 4 new ones to add.
- **Frontend hooks**: Three hooks exist using old `useApiQuery`/`useApiMutation` pattern (`use-activities.ts`, `use-orders.ts`, `use-order-assignments.ts`). Groups hook does not exist and will be newly created.
- **CostCenter model**: Already exists in Prisma (`apps/web/prisma/schema.prisma:177-196`), needed for the Order -> CostCenter relation.

### Key Discoveries:
- The Go backend treats the three group types as separate tables with identical schemas. A generic repository (`GroupRepository[T]`) handles all three. The tRPC router should use a single `groups` router with a `type` input discriminator as specified in the ticket, mapping to the appropriate Prisma model per type.
- Order has a `CostCenter` belongs-to relation (`cost_center_id UUID FK`). The Go backend preloads `CostCenter` on `GetByID`, `List`, `ListActive`, and `ListByStatus`. The tRPC router should include `costCenter` in responses.
- OrderAssignment has both `Order` and `Employee` belongs-to relations. The Go backend preloads these. The tRPC router should include relevant relation data (at minimum employee name/id for `byOrder`, order code/name for `byEmployee`).
- Order has a `status` enum: `planned`, `active`, `completed`, `cancelled`. This is a VARCHAR CHECK constraint, not a PG enum.
- OrderAssignment has a `role` enum: `worker`, `leader`, `sales`. Same CHECK constraint pattern.
- OrderAssignment has a `UNIQUE(order_id, employee_id, role)` constraint -- uniqueness violations should be caught and returned as `CONFLICT`.
- The `Employee` model FK columns have indexes already created by migrations (`idx_employees_employee_group`, `idx_employees_workflow_group`, `idx_employees_activity_group`, `idx_employees_default_order`, `idx_employees_default_activity`) per `apps/web/prisma/schema.prisma:565-569`.
- Activity `Create` in Go defaults `isActive` to `true` with no `IsActive` in `CreateActivityInput`. The tRPC router should match this behavior.
- Order `Create` in Go defaults `status` to `active` and `isActive` to `true`. After creation, it re-fetches to get the preloaded `CostCenter`.

## Desired End State

After completing this plan:
1. Six new Prisma models (`EmployeeGroup`, `WorkflowGroup`, `ActivityGroup`, `Activity`, `Order`, `OrderAssignment`) exist in `schema.prisma` with proper relations.
2. The `Employee` model has Prisma relation fields for the five FK columns that currently only have comments.
3. Four new tRPC routers (`groups`, `activities`, `orders`, `orderAssignments`) are registered in the root router.
4. All CRUD operations work through tRPC, matching Go business logic behavior.
5. The `groups` router supports a `type` discriminator for the three group types.
6. The `orders` router includes `CostCenter` relation data in responses.
7. The `orderAssignments` router includes a `byOrder` procedure and relation data.
8. Frontend hooks use tRPC instead of REST (3 migrated, 1 new).
9. All routers have comprehensive test coverage.
10. `npx tsc --noEmit` and all tests pass.

**Verification**: Run `cd apps/web && npx vitest run src/server/__tests__/` to verify all router tests pass. Run `cd apps/web && npx tsc --noEmit` to verify type checking. Run `cd apps/web && npx prisma generate` to regenerate the Prisma client after schema changes.

## What We're NOT Doing

- **Database migrations**: All tables already exist. We only update the Prisma schema to match existing tables.
- **Order Bookings**: Deferred to TICKET-250.
- **Group references in Macros**: Deferred to TICKET-222.
- **UI page components**: Only the hook layer is migrated; page components remain unchanged.
- **Go endpoint removal**: Go REST endpoints stay in place during migration.
- **Member management in groups**: The ticket mentions member_ids in group create/update, but the Go backend has no member management in the group service -- groups are simple lookup tables. Employees reference groups via FK columns on the Employee model. The tRPC router will NOT implement member management (employees are assigned to groups via the employee CRUD router, not the groups router).
- **Pagination for orders**: The ticket mentions paginated orders, but the Go backend `List` returns all orders without pagination. The tRPC router will match the Go behavior (return all, filter by isActive/status). Pagination can be added in a future ticket if needed.

## Implementation Approach

Build in phases ordered by dependency: first Prisma schema (prerequisite for all routers), then simpler routers (Groups, Activities) before complex ones (Orders, Order Assignments). Each phase produces working, tested code.

The groups router will use Prisma model delegation -- since the three group tables have identical schemas, the router can use a helper function that selects the correct Prisma delegate (`ctx.prisma.employeeGroup`, `ctx.prisma.workflowGroup`, or `ctx.prisma.activityGroup`) based on the input `type`.

---

## Phase 1: Prisma Schema Updates

### Overview
Add all six missing Prisma models and update the Employee model with proper relation fields. This is the prerequisite for all subsequent phases.

### Changes Required:

#### 1. Add EmployeeGroup, WorkflowGroup, ActivityGroup Models
**File**: `apps/web/prisma/schema.prisma`
**Changes**: Add three group models with identical schemas (matching migration 000041).

```prisma
// -----------------------------------------------------------------------------
// EmployeeGroup
// -----------------------------------------------------------------------------
// Migrations: 000041
model EmployeeGroup {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String    @map("tenant_id") @db.Uuid
  code        String    @db.VarChar(50)
  name        String    @db.VarChar(255)
  description String?   @db.Text
  isActive    Boolean   @default(true) @map("is_active")
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant    Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employees Employee[]

  @@unique([tenantId, code], map: "employee_groups_tenant_id_code_key")
  @@index([tenantId], map: "idx_employee_groups_tenant")
  @@map("employee_groups")
}

// -----------------------------------------------------------------------------
// WorkflowGroup
// -----------------------------------------------------------------------------
// Migrations: 000041
model WorkflowGroup {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String    @map("tenant_id") @db.Uuid
  code        String    @db.VarChar(50)
  name        String    @db.VarChar(255)
  description String?   @db.Text
  isActive    Boolean   @default(true) @map("is_active")
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant    Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employees Employee[]

  @@unique([tenantId, code], map: "workflow_groups_tenant_id_code_key")
  @@index([tenantId], map: "idx_workflow_groups_tenant")
  @@map("workflow_groups")
}

// -----------------------------------------------------------------------------
// ActivityGroup
// -----------------------------------------------------------------------------
// Migrations: 000041
model ActivityGroup {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String    @map("tenant_id") @db.Uuid
  code        String    @db.VarChar(50)
  name        String    @db.VarChar(255)
  description String?   @db.Text
  isActive    Boolean   @default(true) @map("is_active")
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant    Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employees Employee[]

  @@unique([tenantId, code], map: "activity_groups_tenant_id_code_key")
  @@index([tenantId], map: "idx_activity_groups_tenant")
  @@map("activity_groups")
}
```

#### 2. Add Activity Model
**File**: `apps/web/prisma/schema.prisma`
**Changes**: Add Activity model (matching migration 000053).

```prisma
// -----------------------------------------------------------------------------
// Activity
// -----------------------------------------------------------------------------
// Migrations: 000053
//
// Trigger: update_activities_updated_at auto-sets updated_at on UPDATE
model Activity {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String    @map("tenant_id") @db.Uuid
  code        String    @db.VarChar(50)
  name        String    @db.VarChar(255)
  description String?   @db.Text
  isActive    Boolean   @default(true) @map("is_active")
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant              Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  defaultForEmployees Employee[] @relation("EmployeeDefaultActivity")

  @@unique([tenantId, code], map: "activities_tenant_id_code_key")
  @@index([tenantId], map: "idx_activities_tenant")
  @@index([tenantId, isActive], map: "idx_activities_tenant_active")
  @@map("activities")
}
```

#### 3. Add Order Model
**File**: `apps/web/prisma/schema.prisma`
**Changes**: Add Order model (matching migration 000055).

```prisma
// -----------------------------------------------------------------------------
// Order
// -----------------------------------------------------------------------------
// Migrations: 000055
//
// CHECK constraints (enforced at DB level only):
//   status IN ('planned', 'active', 'completed', 'cancelled')
//
// Trigger: update_orders_updated_at auto-sets updated_at on UPDATE
model Order {
  id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId           String    @map("tenant_id") @db.Uuid
  code               String    @db.VarChar(50)
  name               String    @db.VarChar(255)
  description        String?   @db.Text
  status             String    @default("active") @db.VarChar(20)
  customer           String?   @db.VarChar(255)
  costCenterId       String?   @map("cost_center_id") @db.Uuid
  billingRatePerHour Decimal?  @map("billing_rate_per_hour") @db.Decimal(10, 2)
  validFrom          DateTime? @map("valid_from") @db.Date
  validTo            DateTime? @map("valid_to") @db.Date
  isActive           Boolean   @default(true) @map("is_active")
  createdAt          DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant              Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  costCenter          CostCenter?       @relation(fields: [costCenterId], references: [id], onDelete: SetNull)
  assignments         OrderAssignment[]
  defaultForEmployees Employee[]        @relation("EmployeeDefaultOrder")

  @@unique([tenantId, code], map: "orders_tenant_id_code_key")
  @@index([tenantId], map: "idx_orders_tenant")
  @@index([tenantId, isActive], map: "idx_orders_tenant_active")
  @@index([tenantId, status], map: "idx_orders_tenant_status")
  @@index([costCenterId], map: "idx_orders_cost_center")
  @@map("orders")
}
```

#### 4. Add OrderAssignment Model
**File**: `apps/web/prisma/schema.prisma`
**Changes**: Add OrderAssignment model (matching migration 000056).

```prisma
// -----------------------------------------------------------------------------
// OrderAssignment
// -----------------------------------------------------------------------------
// Migrations: 000056
//
// CHECK constraints (enforced at DB level only):
//   role IN ('worker', 'leader', 'sales')
//
// Trigger: update_order_assignments_updated_at auto-sets updated_at on UPDATE
model OrderAssignment {
  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId   String    @map("tenant_id") @db.Uuid
  orderId    String    @map("order_id") @db.Uuid
  employeeId String    @map("employee_id") @db.Uuid
  role       String    @default("worker") @db.VarChar(20)
  validFrom  DateTime? @map("valid_from") @db.Date
  validTo    DateTime? @map("valid_to") @db.Date
  isActive   Boolean   @default(true) @map("is_active")
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt  DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  order    Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  @@unique([orderId, employeeId, role], map: "order_assignments_order_id_employee_id_role_key")
  @@index([tenantId], map: "idx_order_assignments_tenant")
  @@index([orderId], map: "idx_order_assignments_order")
  @@index([employeeId], map: "idx_order_assignments_employee")
  @@index([employeeId, isActive], map: "idx_order_assignments_employee_active")
  @@map("order_assignments")
}
```

#### 5. Update Employee Model Relations
**File**: `apps/web/prisma/schema.prisma`
**Changes**: Replace the FK-only comments on the Employee model (lines 541-554) with actual Prisma relation fields.

Add relation fields to the Employee model:
```prisma
  // Relations to group/order models (added in this phase)
  employeeGroup    EmployeeGroup?    @relation(fields: [employeeGroupId], references: [id], onDelete: SetNull)
  workflowGroup    WorkflowGroup?    @relation(fields: [workflowGroupId], references: [id], onDelete: SetNull)
  activityGroup    ActivityGroup?    @relation(fields: [activityGroupId], references: [id], onDelete: SetNull)
  defaultOrder     Order?            @relation("EmployeeDefaultOrder", fields: [defaultOrderId], references: [id], onDelete: SetNull)
  defaultActivity  Activity?         @relation("EmployeeDefaultActivity", fields: [defaultActivityId], references: [id], onDelete: SetNull)
  orderAssignments OrderAssignment[]
```

Remove the comments that said "not yet in Prisma" for these five FK columns (lines 541-554).

#### 6. Update Tenant Model
**File**: `apps/web/prisma/schema.prisma`
**Changes**: Add reverse relation fields to the Tenant model for the new models.

Add to the Tenant model's relations section:
```prisma
  employeeGroups   EmployeeGroup[]
  workflowGroups   WorkflowGroup[]
  activityGroups   ActivityGroup[]
  activities       Activity[]
  orders           Order[]
  orderAssignments OrderAssignment[]
```

#### 7. Update CostCenter Model
**File**: `apps/web/prisma/schema.prisma`
**Changes**: Add reverse relation for Order -> CostCenter.

Add to CostCenter relations:
```prisma
  orders Order[]
```

#### 8. Regenerate Prisma Client
Run `cd apps/web && npx prisma generate` to regenerate the client with the new models.

### Success Criteria:

#### Automated Verification:
- [x] Prisma client generates without errors: `cd apps/web && npx prisma generate`
- [x] Type checking passes: `cd apps/web && npx tsc --noEmit`
- [x] Existing tests still pass: `cd apps/web && npx vitest run src/server/__tests__/`
- [x] Prisma schema validates: `cd apps/web && npx prisma validate`

#### Manual Verification:
- [ ] Prisma Studio can browse the new models (if DB is running): `cd apps/web && npx prisma studio`
- [ ] Employee model shows proper relations to groups, orders, and activities

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Groups Router

### Overview
Implement the `groups` tRPC router handling all three group types (employee, workflow, activity) through a single router with a `type` discriminator input.

### Changes Required:

#### 1. Groups Router
**File**: `apps/web/src/server/routers/groups.ts` (new file)
**Changes**: Full CRUD router with type-based dispatch to three Prisma models.

**Design decision**: Use a helper function that returns the correct Prisma delegate based on the `type` input:

```typescript
type GroupType = "employee" | "workflow" | "activity"

function getGroupDelegate(prisma: PrismaClient, type: GroupType) {
  switch (type) {
    case "employee": return prisma.employeeGroup
    case "workflow": return prisma.workflowGroup
    case "activity": return prisma.activityGroup
  }
}
```

**Procedures:**
- `groups.list` (query) -- Input: `{ type: GroupType, isActive?: boolean }`. Returns `{ data: Group[] }` ordered by `code ASC`. Permission: `groups.manage`.
- `groups.getById` (query) -- Input: `{ type: GroupType, id: string }`. Returns single Group or `NOT_FOUND`. Permission: `groups.manage`.
- `groups.create` (mutation) -- Input: `{ type: GroupType, code: string, name: string, description?: string, isActive?: boolean }`. Validates code/name non-empty after trim, checks code uniqueness per tenant within the specific group type table. Defaults `isActive: true`. Permission: `groups.manage`.
- `groups.update` (mutation) -- Input: `{ type: GroupType, id: string, code?: string, name?: string, description?: string | null, isActive?: boolean }`. Partial update. Code uniqueness check if changed. Permission: `groups.manage`.
- `groups.delete` (mutation) -- Input: `{ type: GroupType, id: string }`. Check for assigned employees before deletion (e.g., for employee groups: `employee.count({ where: { employeeGroupId: id } })`). Returns `{ success: boolean }`. Permission: `groups.manage`.

**Output schema:**
```typescript
const groupOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
```

**Key validation logic** (from `apps/api/internal/service/group.go`):
- Create: trim code/name, reject empty, check code uniqueness via `findFirst({ where: { tenantId, code } })` on the type-specific table
- Update: fetch existing, partial update, trim code/name if provided, reject empty, check code uniqueness if changed via `findFirst({ where: { tenantId, code, NOT: { id } } })`
- Delete: check employee count referencing this group before deletion

**Employee FK column per group type:**
- `employee` -> `employeeGroupId`
- `workflow` -> `workflowGroupId`
- `activity` -> `activityGroupId`

#### 2. Root Router Registration
**File**: `apps/web/src/server/root.ts`
**Changes**: Import and register `groupsRouter`.

```typescript
import { groupsRouter } from "./routers/groups"
// ...
groups: groupsRouter,
```

#### 3. Groups Router Test File
**File**: `apps/web/src/server/__tests__/groups-router.test.ts` (new file)

**Test cases:**
- `groups.list`: returns data for each type, filters by isActive, returns empty array
- `groups.getById`: found for each type, NOT_FOUND
- `groups.create`: success, trims whitespace, rejects empty code, rejects empty name, rejects duplicate code (CONFLICT), sets isActive true by default
- `groups.update`: success, partial update, rejects empty code/name, rejects duplicate code, allows same code, NOT_FOUND
- `groups.delete`: success, NOT_FOUND, rejects when employees assigned

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `cd apps/web && npx tsc --noEmit`
- [x] Groups router tests pass: `cd apps/web && npx vitest run src/server/__tests__/groups-router.test.ts`
- [x] Existing tests still pass: `cd apps/web && npx vitest run src/server/__tests__/`

#### Manual Verification:
- [ ] Group CRUD works via tRPC client for all three types
- [ ] Delete is rejected when employees are assigned to the group

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Activities Router

### Overview
Implement the `activities` tRPC router with standard CRUD operations.

### Changes Required:

#### 1. Activities Router
**File**: `apps/web/src/server/routers/activities.ts` (new file)
**Changes**: Full CRUD router following the costCenters pattern.

**Procedures:**
- `activities.list` (query) -- Input: `{ isActive?: boolean }`. Returns `{ data: Activity[] }` ordered by `code ASC`. Permission: `activities.manage`.
- `activities.getById` (query) -- Input: `{ id: string }`. Returns single Activity or `NOT_FOUND`. Permission: `activities.manage`.
- `activities.create` (mutation) -- Input: `{ code: string, name: string, description?: string }`. Validates code/name non-empty after trim, checks code uniqueness per tenant. Defaults `isActive: true` (no `isActive` in create input, matching Go behavior). Permission: `activities.manage`.
- `activities.update` (mutation) -- Input: `{ id: string, code?: string, name?: string, description?: string | null, isActive?: boolean }`. Partial update. Code uniqueness check only when code actually changes (matching Go logic at `apps/api/internal/service/activity.go:109`). Permission: `activities.manage`.
- `activities.delete` (mutation) -- Input: `{ id: string }`. Check for employees with `defaultActivityId` referencing this activity before deletion. Returns `{ success: boolean }`. Permission: `activities.manage`.

**Output schema:**
```typescript
const activityOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
```

**Key validation logic** (from `apps/api/internal/service/activity.go`):
- Create: trim code/name/description, reject empty code/name, check code uniqueness, always set `isActive: true`
- Update: fetch existing, partial update, code uniqueness only checked when code value changes (`code !== existing.code`)
- Delete: check `employee.count({ where: { defaultActivityId: id } })` before deletion

#### 2. Root Router Registration
**File**: `apps/web/src/server/root.ts`
**Changes**: Import and register `activitiesRouter`.

#### 3. Activities Router Test File
**File**: `apps/web/src/server/__tests__/activities-router.test.ts` (new file)

**Test cases:**
- `activities.list`: returns data, filters by isActive, returns empty array
- `activities.getById`: found, NOT_FOUND
- `activities.create`: success, trims whitespace, rejects empty code, rejects empty name, rejects duplicate code (CONFLICT), always sets isActive true (no isActive input)
- `activities.update`: success, partial update, rejects empty code/name, rejects duplicate code, allows same code (no duplicate check), NOT_FOUND, can set isActive to false
- `activities.delete`: success, NOT_FOUND, rejects when employees have defaultActivityId

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `cd apps/web && npx tsc --noEmit`
- [x] Activities router tests pass: `cd apps/web && npx vitest run src/server/__tests__/activities-router.test.ts`
- [x] All previous tests still pass: `cd apps/web && npx vitest run src/server/__tests__/`

#### Manual Verification:
- [ ] Activity CRUD works via tRPC client
- [ ] Activity create always returns isActive: true

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Orders Router

### Overview
Implement the `orders` tRPC router with CRUD operations, including the CostCenter relation preload and status/isActive filtering.

### Changes Required:

#### 1. Orders Router
**File**: `apps/web/src/server/routers/orders.ts` (new file)
**Changes**: Full CRUD router with CostCenter relation handling.

**Procedures:**
- `orders.list` (query) -- Input: `{ isActive?: boolean, status?: string }`. Returns `{ data: Order[] }` ordered by `code ASC`. Includes `costCenter` in response. Permission: `orders.manage`.
- `orders.getById` (query) -- Input: `{ id: string }`. Returns single Order with `costCenter` included, or `NOT_FOUND`. Permission: `orders.manage`.
- `orders.create` (mutation) -- Input: `{ code: string, name: string, description?: string, status?: string, customer?: string, costCenterId?: string, billingRatePerHour?: number, validFrom?: string, validTo?: string }`. Validates code/name non-empty after trim, checks code uniqueness per tenant. Defaults: `status: "active"`, `isActive: true`. Re-fetches with CostCenter preload after creation (matching Go behavior). Permission: `orders.manage`.
- `orders.update` (mutation) -- Input: `{ id: string, code?: string, name?: string, description?: string | null, status?: string, customer?: string | null, costCenterId?: string | null, billingRatePerHour?: number | null, validFrom?: string | null, validTo?: string | null, isActive?: boolean }`. Partial update. Code uniqueness check if changed. Re-fetches with CostCenter preload after update. Permission: `orders.manage`.
- `orders.delete` (mutation) -- Input: `{ id: string }`. Returns `{ success: boolean }`. Note: OrderAssignments cascade-delete per DB FK, so no explicit check needed. Permission: `orders.manage`.

**Output schema:**
```typescript
const costCenterIncludeSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
}).nullable()

const orderOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  customer: z.string().nullable(),
  costCenterId: z.string().uuid().nullable(),
  costCenter: costCenterIncludeSchema,
  billingRatePerHour: z.number().nullable(),
  validFrom: z.date().nullable(),
  validTo: z.date().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
```

**Key validation logic** (from `apps/api/internal/service/order.go`):
- Create: trim code/name/description/customer, reject empty code/name, check code uniqueness, default status to `active`, parse date strings for validFrom/validTo, re-fetch after create to get CostCenter
- Update: fetch existing, partial update, code uniqueness if changed, status as OrderStatus enum value, handle nullable fields (costCenterId, billingRatePerHour, validFrom, validTo can be explicitly set to null), re-fetch after update
- `billingRatePerHour`: Input as `number`, stored as `Decimal(10,2)`. Convert via `new Prisma.Decimal(input.billingRatePerHour)` for storage, `Number(record.billingRatePerHour)` for output.
- `validFrom`/`validTo`: Input as ISO date string (`"2026-01-15"`), stored as `Date` in Prisma. Parse with `new Date(input.validFrom + "T00:00:00Z")`.

#### 2. Root Router Registration
**File**: `apps/web/src/server/root.ts`
**Changes**: Import and register `ordersRouter`.

#### 3. Orders Router Test File
**File**: `apps/web/src/server/__tests__/orders-router.test.ts` (new file)

**Test cases:**
- `orders.list`: returns data with costCenter, filters by isActive, filters by status, returns empty
- `orders.getById`: found with costCenter, NOT_FOUND
- `orders.create`: success with default status "active", trims whitespace, rejects empty code/name, rejects duplicate code (CONFLICT), handles costCenterId, handles billingRatePerHour, handles validFrom/validTo dates
- `orders.update`: success, partial update, rejects empty code/name, rejects duplicate code, allows same code, NOT_FOUND, can update status, can null out costCenterId, can null out billingRatePerHour
- `orders.delete`: success, NOT_FOUND

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `cd apps/web && npx tsc --noEmit`
- [x] Orders router tests pass: `cd apps/web && npx vitest run src/server/__tests__/orders-router.test.ts`
- [x] All previous tests still pass: `cd apps/web && npx vitest run src/server/__tests__/`

#### Manual Verification:
- [ ] Order CRUD works via tRPC client
- [ ] CostCenter relation data included in responses
- [ ] Decimal billingRatePerHour round-trips correctly
- [ ] Date fields store and return correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Order Assignments Router

### Overview
Implement the `orderAssignments` tRPC router with CRUD operations plus the `byOrder` query that returns assignments with employee details for a specific order.

### Changes Required:

#### 1. Order Assignments Router
**File**: `apps/web/src/server/routers/orderAssignments.ts` (new file)
**Changes**: CRUD router with relation preloads and additional `byOrder` procedure.

**Procedures:**
- `orderAssignments.list` (query) -- Input: `{ orderId?: string, employeeId?: string }`. Returns `{ data: OrderAssignment[] }` ordered by `createdAt DESC`. Includes `order` (id, code, name) and `employee` (id, firstName, lastName, personnelNumber). Permission: `order_assignments.manage`.
- `orderAssignments.getById` (query) -- Input: `{ id: string }`. Returns single OrderAssignment with `order` and `employee` included, or `NOT_FOUND`. Permission: `order_assignments.manage`.
- `orderAssignments.byOrder` (query) -- Input: `{ orderId: string }`. Returns `{ data: OrderAssignment[] }` for the given order, ordered by `role ASC, createdAt DESC`. Includes `employee` details. Permission: `order_assignments.manage`.
- `orderAssignments.create` (mutation) -- Input: `{ orderId: string, employeeId: string, role?: string, validFrom?: string, validTo?: string }`. Defaults role to `"worker"`. Sets `isActive: true`. Re-fetches with relations after creation. Permission: `order_assignments.manage`. Catches unique constraint violation on `(orderId, employeeId, role)` and returns CONFLICT.
- `orderAssignments.update` (mutation) -- Input: `{ id: string, role?: string, validFrom?: string | null, validTo?: string | null, isActive?: boolean }`. Partial update. Re-fetches with relations. Permission: `order_assignments.manage`.
- `orderAssignments.delete` (mutation) -- Input: `{ id: string }`. Returns `{ success: boolean }`. Permission: `order_assignments.manage`.

**Output schema:**
```typescript
const orderIncludeSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
})

const employeeIncludeSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  personnelNumber: z.string(),
})

const orderAssignmentOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  orderId: z.string().uuid(),
  employeeId: z.string().uuid(),
  role: z.string(),
  validFrom: z.date().nullable(),
  validTo: z.date().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  order: orderIncludeSchema,
  employee: employeeIncludeSchema,
})
```

**Key validation logic** (from `apps/api/internal/service/order_assignment.go`):
- Create: default role to `"worker"` if empty, set `isActive: true`, parse date strings, re-fetch with preloads after create. Catch Prisma unique constraint error (`P2002`) on `(orderId, employeeId, role)` and throw CONFLICT.
- Update: fetch existing, partial update for role/validFrom/validTo/isActive, re-fetch with preloads after update
- `validFrom`/`validTo`: Same date parsing as Orders (`"2026-01-15"` -> `new Date("2026-01-15T00:00:00Z")`)

**Prisma include for preloads:**
```typescript
const assignmentInclude = {
  order: { select: { id: true, code: true, name: true } },
  employee: { select: { id: true, firstName: true, lastName: true, personnelNumber: true } },
}
```

#### 2. Root Router Registration
**File**: `apps/web/src/server/root.ts`
**Changes**: Import and register `orderAssignmentsRouter`.

#### 3. Order Assignments Router Test File
**File**: `apps/web/src/server/__tests__/order-assignments-router.test.ts` (new file)

**Test cases:**
- `orderAssignments.list`: returns data with relations, filters by orderId, filters by employeeId, returns empty
- `orderAssignments.getById`: found with relations, NOT_FOUND
- `orderAssignments.byOrder`: returns assignments for order with employee details, empty when no assignments
- `orderAssignments.create`: success with default role "worker", explicit role, handles dates, re-fetches with relations, rejects duplicate (orderId, employeeId, role) with CONFLICT
- `orderAssignments.update`: success, partial update, NOT_FOUND
- `orderAssignments.delete`: success, NOT_FOUND

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `cd apps/web && npx tsc --noEmit`
- [x] Order assignments router tests pass: `cd apps/web && npx vitest run src/server/__tests__/order-assignments-router.test.ts`
- [x] All previous tests still pass: `cd apps/web && npx vitest run src/server/__tests__/`

#### Manual Verification:
- [ ] Order assignment CRUD works via tRPC client
- [ ] `byOrder` returns assignments with employee details
- [ ] Duplicate (orderId, employeeId, role) returns CONFLICT error
- [ ] Relation data (order code/name, employee name) displays correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 6: Frontend Hook Migration

### Overview
Migrate three existing frontend hook files from the old `useApiQuery`/`useApiMutation` pattern to tRPC, and create a new groups hook. Following the established pattern in `apps/web/src/hooks/api/use-departments.ts`.

### Changes Required:

#### 1. Groups Hook (New)
**File**: `apps/web/src/hooks/api/use-groups.ts` (new file)
**Changes**: Create new tRPC-based hooks for groups.

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

type GroupType = "employee" | "workflow" | "activity"

export function useGroups(options: { type: GroupType; isActive?: boolean; enabled?: boolean }) {
  const { type, isActive, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.groups.list.queryOptions({ type, isActive }, { enabled })
  )
}

export function useGroup(type: GroupType, id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.groups.getById.queryOptions({ type, id }, { enabled: enabled && !!id })
  )
}

export function useCreateGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.groups.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.groups.list.queryKey() })
    },
  })
}

export function useUpdateGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.groups.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.groups.list.queryKey() })
    },
  })
}

export function useDeleteGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.groups.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.groups.list.queryKey() })
    },
  })
}
```

#### 2. Activities Hook (Rewrite)
**File**: `apps/web/src/hooks/api/use-activities.ts` (rewrite)
**Changes**: Replace old pattern with tRPC pattern.

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useActivities(options: { isActive?: boolean; enabled?: boolean } = {}) {
  const { isActive, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.activities.list.queryOptions({ isActive }, { enabled })
  )
}

export function useActivity(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.activities.getById.queryOptions({ id }, { enabled: enabled && !!id })
  )
}

export function useCreateActivity() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.activities.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.activities.list.queryKey() })
    },
  })
}

export function useUpdateActivity() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.activities.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.activities.list.queryKey() })
    },
  })
}

export function useDeleteActivity() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.activities.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.activities.list.queryKey() })
    },
  })
}
```

#### 3. Orders Hook (Rewrite)
**File**: `apps/web/src/hooks/api/use-orders.ts` (rewrite)
**Changes**: Replace old pattern with tRPC pattern.

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useOrders(options: { isActive?: boolean; status?: string; enabled?: boolean } = {}) {
  const { isActive, status, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.orders.list.queryOptions({ isActive, status }, { enabled })
  )
}

export function useOrder(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.orders.getById.queryOptions({ id }, { enabled: enabled && !!id })
  )
}

export function useCreateOrder() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.orders.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.orders.list.queryKey() })
    },
  })
}

export function useUpdateOrder() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.orders.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.orders.list.queryKey() })
    },
  })
}

export function useDeleteOrder() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.orders.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.orders.list.queryKey() })
    },
  })
}
```

#### 4. Order Assignments Hook (Rewrite)
**File**: `apps/web/src/hooks/api/use-order-assignments.ts` (rewrite)
**Changes**: Replace old pattern with tRPC pattern. Add `byOrder` hook.

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useOrderAssignments(options: { orderId?: string; employeeId?: string; enabled?: boolean } = {}) {
  const { orderId, employeeId, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.orderAssignments.list.queryOptions({ orderId, employeeId }, { enabled })
  )
}

export function useOrderAssignmentsByOrder(orderId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.orderAssignments.byOrder.queryOptions({ orderId }, { enabled: enabled && !!orderId })
  )
}

export function useOrderAssignment(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.orderAssignments.getById.queryOptions({ id }, { enabled: enabled && !!id })
  )
}

export function useCreateOrderAssignment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.orderAssignments.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.orderAssignments.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.orderAssignments.byOrder.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.orders.list.queryKey() })
    },
  })
}

export function useUpdateOrderAssignment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.orderAssignments.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.orderAssignments.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.orderAssignments.byOrder.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.orders.list.queryKey() })
    },
  })
}

export function useDeleteOrderAssignment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.orderAssignments.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.orderAssignments.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.orderAssignments.byOrder.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.orders.list.queryKey() })
    },
  })
}
```

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `cd apps/web && npx tsc --noEmit`
- [x] All router tests pass: `cd apps/web && npx vitest run src/server/__tests__/`
- [x] No TypeScript errors in hook consumers (pages that import these hooks)

#### Manual Verification:
- [ ] Activities page works end-to-end with tRPC hooks
- [ ] Orders page works end-to-end with tRPC hooks
- [ ] Order assignments page works end-to-end with tRPC hooks
- [ ] Groups management works with new tRPC hooks
- [ ] No regressions in other pages

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:
- **Groups router** (`groups-router.test.ts`): CRUD with type discriminator for all three types, validation, uniqueness, employee constraint
- **Activities router** (`activities-router.test.ts`): CRUD with validation, uniqueness, no isActive in create input
- **Orders router** (`orders-router.test.ts`): CRUD with CostCenter preload, Decimal handling, date parsing, status filtering
- **Order assignments router** (`order-assignments-router.test.ts`): CRUD with relation preloads, byOrder query, unique constraint violation, role defaulting

### Key Edge Cases:
- Groups: same code allowed in different group types (employee_groups vs workflow_groups -- different tables)
- Groups: delete rejected per type when employees are assigned
- Activities: create always sets isActive true (no input field)
- Activities: code uniqueness check only on actual change during update
- Orders: billingRatePerHour Decimal round-trip (number -> Prisma Decimal -> number)
- Orders: validFrom/validTo date string parsing and null handling
- Orders: CostCenter preload even when costCenterId is null
- Orders: status default to "active" on create
- OrderAssignments: unique constraint on (orderId, employeeId, role)
- OrderAssignments: role default to "worker"
- OrderAssignments: byOrder returns only assignments for that order
- All routers: tenant scoping (queries never leak cross-tenant data)

### Manual Testing Steps:
1. Start dev environment: `make dev`
2. Verify group CRUD for all three types (employee, workflow, activity)
3. Verify activity CRUD with isActive filtering
4. Verify order CRUD with cost center selection, date fields, billing rate
5. Verify order assignment CRUD with employee/order selection
6. Verify byOrder query returns correct assignments
7. Verify no console errors or network failures

## Performance Considerations

- Order list includes CostCenter preload via Prisma `include`. For large datasets, this adds a join but is equivalent to what the Go backend does with GORM Preload.
- OrderAssignment list preloads both Order and Employee. For large result sets this adds two joins. Consider adding pagination in a future ticket if the assignment count grows large.
- Groups list is simple and fast since the tables are small lookup tables.

## Migration Notes

- No database migrations needed. All tables already exist via SQL migrations.
- The Prisma schema update is additive only (new models + new relation fields on Employee). No data changes.
- Frontend hooks maintain similar public API shapes. The hook function names and parameter shapes are close to the old pattern, so page components should need minimal changes (mainly switching from `data?.data` to `data?.data` which is the same, or adjusting parameter names like `active` -> `isActive`).
- The Go REST endpoints remain available during migration. Once all frontend consumers are verified to use tRPC, the Go endpoints can be deprecated in a future ticket.

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-215-groups-activities-orders.md`
- Research document: `thoughts/shared/research/2026-03-05-ZMI-TICKET-215-groups-activities-orders.md`
- Predecessor ticket (holidays/cost centers): `thoughts/shared/plans/2026-03-04-ZMI-TICKET-212-holidays-costcenters-employmenttypes-locations.md`
- Cost centers router (pattern reference): `apps/web/src/server/routers/costCenters.ts`
- Cost centers test (pattern reference): `apps/web/src/server/__tests__/cost-centers-router.test.ts`
- Test helpers: `apps/web/src/server/__tests__/helpers.ts`
- Permission catalog: `apps/web/src/server/lib/permission-catalog.ts`
- Root router: `apps/web/src/server/root.ts`
- Frontend hook pattern reference: `apps/web/src/hooks/api/use-departments.ts`
- Go group service: `apps/api/internal/service/group.go`
- Go activity service: `apps/api/internal/service/activity.go`
- Go order service: `apps/api/internal/service/order.go`
- Go order assignment service: `apps/api/internal/service/order_assignment.go`
- Prisma schema: `apps/web/prisma/schema.prisma`
- Group tables migration: `db/migrations/000041_extend_employee_master_data.up.sql`
- Activities migration: `db/migrations/000053_create_activities.up.sql`
- Orders migration: `db/migrations/000055_create_orders.up.sql`
- Order assignments migration: `db/migrations/000056_create_order_assignments.up.sql`
