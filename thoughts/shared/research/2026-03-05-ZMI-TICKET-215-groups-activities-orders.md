---
date: 2026-03-05T14:00:00+01:00
researcher: Claude
git_commit: 61a43e503962338d2ba9f5e8260ab49471cafdfc
branch: staging
repository: terp
topic: "tRPC routers for Groups (3 types), Activities, Orders, and Order Assignments"
tags: [research, codebase, trpc, groups, activities, orders, order-assignments, prisma]
status: complete
last_updated: 2026-03-05
last_updated_by: Claude
---

# Research: tRPC Routers for Groups, Activities, Orders, and Order Assignments

**Date**: 2026-03-05T14:00:00+01:00
**Researcher**: Claude
**Git Commit**: 61a43e503962338d2ba9f5e8260ab49471cafdfc
**Branch**: staging
**Repository**: terp

## Research Question

What existing patterns, models, permissions, Go business logic, database schema, OpenAPI specs, and frontend hooks exist for implementing tRPC routers for Groups (employee, workflow, activity), Activities, Orders, and Order Assignments?

## Summary

All four entity types have complete Go backend implementations (handler + service + repository + model layers), SQL migrations, OpenAPI specs, and database tables. The permission catalog already contains all required permissions: `groups.manage`, `activities.manage`, `orders.manage`, and `order_assignments.manage`. The Prisma schema does NOT yet include models for any of these four entities -- they need to be added. The Employee model in Prisma references group and order FKs (`employeeGroupId`, `workflowGroupId`, `activityGroupId`, `defaultOrderId`, `defaultActivityId`) but the target models are noted as "not yet in Prisma." Three frontend hooks exist (`use-activities.ts`, `use-orders.ts`, `use-order-assignments.ts`) using the old `useApiQuery`/`useApiMutation` pattern; the groups hook does not exist yet.

## Detailed Findings

### 1. Go Backend: Groups (3 Types)

The Go backend treats the three group types (employee, workflow, activity) as separate DB tables with identical schemas. A generic repository uses Go generics.

**Model** (`apps/api/internal/model/group.go`, 55 lines):
- Three separate structs: `EmployeeGroup`, `WorkflowGroup`, `ActivityGroup`
- All share identical fields: `ID`, `TenantID`, `Code`, `Name`, `Description`, `IsActive`, `CreatedAt`, `UpdatedAt`
- Table names: `employee_groups`, `workflow_groups`, `activity_groups`

**Repository** (`apps/api/internal/repository/group.go`, 119 lines):
- Uses Go generic type `GroupRepository[T model.EmployeeGroup | model.WorkflowGroup | model.ActivityGroup]`
- Factory functions: `NewEmployeeGroupRepository`, `NewWorkflowGroupRepository`, `NewActivityGroupRepository`
- Methods: `Create`, `GetByID`, `GetByCode`, `Update`, `Delete`, `List`, `ListActive`
- `List` orders by `code ASC`
- `ListActive` filters by `is_active = true`

**Service** (`apps/api/internal/service/group.go`, 338 lines):
- `GroupService` struct holds three separate repo interfaces (one per type)
- Each group type has five methods: `List`, `Get`, `Create`, `Update`, `Delete`
- `CreateGroupInput`: `TenantID`, `Code`, `Name`, `Description`, `IsActive`
- `UpdateGroupInput`: optional `Code`, `Name`, `Description`, `IsActive` (pointer fields)
- Validation: code required (trimmed), name required (trimmed), code uniqueness per tenant
- Error constants: `ErrGroupNotFound`, `ErrGroupCodeRequired`, `ErrGroupNameRequired`, `ErrGroupCodeExists`

**Handler** (`apps/api/internal/handler/group.go`, 345 lines):
- `GroupHandler` with separate methods per type (e.g., `ListEmployeeGroups`, `CreateWorkflowGroup`, etc.)
- Uses generated `models.CreateGroupRequest` and `models.UpdateGroupRequest` (shared across all 3 types)
- `buildUpdateGroupInput` helper converts request to service input
- `handleGroupError` maps service errors to HTTP status codes
- List returns `{ "data": [...] }` wrapper

**Route Registration** (`apps/api/internal/handler/routes.go`, lines 742-790):
- `RegisterGroupRoutes` uses internal `registerGroupCRUD` helper for DRY registration
- Three route prefixes: `/employee-groups`, `/workflow-groups`, `/activity-groups`
- All use permission `groups.manage`

### 2. Go Backend: Activities

**Model** (`apps/api/internal/model/activity.go`, 23 lines):
- Fields: `ID`, `TenantID`, `Code`, `Name`, `Description`, `IsActive`, `CreatedAt`, `UpdatedAt`
- Table: `activities`

**Repository** (`apps/api/internal/repository/activity.go`, 109 lines):
- Methods: `Create`, `GetByID`, `GetByCode`, `Update`, `Delete`, `List`, `ListActive`
- `Create` uses explicit `Select` for insert columns
- `List` orders by `code ASC`

**Service** (`apps/api/internal/service/activity.go`, 155 lines):
- `CreateActivityInput`: `TenantID`, `Code`, `Name`, `Description` (no `IsActive` -- defaults to `true`)
- `UpdateActivityInput`: optional `Code`, `Name`, `Description`, `IsActive`
- Validation: code required, name required, code uniqueness per tenant (only checks when changed in update)
- Methods: `Create`, `GetByID`, `Update`, `Delete`, `List`, `ListActive`

**Handler** (`apps/api/internal/handler/activity.go`, 178 lines):
- `List` supports `?active=true` query filter
- Uses generated `models.CreateActivityRequest` and `models.UpdateActivityRequest`

**Route Registration** (routes.go, lines 971-990):
- Route prefix: `/activities`
- Permission: `activities.manage`

### 3. Go Backend: Orders

**Model** (`apps/api/internal/model/order.go`, 43 lines):
- `OrderStatus` enum type: `planned`, `active`, `completed`, `cancelled`
- Fields: `ID`, `TenantID`, `Code`, `Name`, `Description`, `Status`, `Customer`, `CostCenterID` (nullable UUID), `BillingRatePerHour` (nullable Decimal), `ValidFrom`/`ValidTo` (nullable date), `IsActive`, `CreatedAt`, `UpdatedAt`
- Relations: `CostCenter` (belongs-to, FK `CostCenterID`), `Assignments` (has-many via `OrderID`)
- Table: `orders`

**Repository** (`apps/api/internal/repository/order.go`, 156 lines):
- Methods: `Create`, `GetByID`, `GetByCode`, `Update`, `Delete`, `List`, `ListActive`, `ListByStatus`, `BulkDelete`, `CountByIDs`
- `GetByID`, `List`, `ListActive`, `ListByStatus` all `Preload("CostCenter")`
- `Create` uses explicit `Select` for insert columns

**Service** (`apps/api/internal/service/order.go`, 220 lines):
- `CreateOrderInput`: `TenantID`, `Code`, `Name`, `Description`, `Status`, `Customer`, `CostCenterID`, `BillingRatePerHour`, `ValidFrom`, `ValidTo`
- `UpdateOrderInput`: all optional versions of create fields plus `IsActive`
- Uses `parseDate()` helper from `date_helpers.go` to parse "2006-01-02" date strings
- `Create` defaults status to `active`, returns re-fetched order (with preloaded CostCenter)
- `Update` also re-fetches after save

**Handler** (`apps/api/internal/handler/order.go`, 227 lines):
- `List` supports `?active=true` and `?status=<value>` query filters
- Handles Decimal conversion from `float64` to `decimal.Decimal`
- Handles UUID conversion for `CostCenterID`
- Handles date conversion for `ValidFrom`/`ValidTo`

**Route Registration** (routes.go, lines 992-1011):
- Route prefix: `/orders`
- Permission: `orders.manage`

### 4. Go Backend: Order Assignments

**Model** (`apps/api/internal/model/order_assignment.go`, 37 lines):
- `OrderAssignmentRole` enum: `worker`, `leader`, `sales`
- Fields: `ID`, `TenantID`, `OrderID`, `EmployeeID`, `Role`, `ValidFrom`/`ValidTo` (nullable date), `IsActive`, `CreatedAt`, `UpdatedAt`
- Relations: `Order` (belongs-to), `Employee` (belongs-to)
- Table: `order_assignments`

**Repository** (`apps/api/internal/repository/order_assignment.go`, 113 lines):
- Methods: `Create`, `GetByID`, `Update`, `Delete`, `List`, `ListByOrder`, `ListByEmployee`
- `GetByID` preloads both `Order` and `Employee`
- `List` preloads both, ordered by `created_at DESC`
- `ListByOrder` preloads `Employee`, ordered by `role ASC, created_at DESC`
- `ListByEmployee` preloads `Order`, ordered by `created_at DESC`

**Service** (`apps/api/internal/service/order_assignment.go`, 155 lines):
- `CreateOrderAssignmentInput`: `TenantID`, `OrderID`, `EmployeeID`, `Role`, `ValidFrom`, `ValidTo`
- `UpdateOrderAssignmentInput`: optional `Role`, `ValidFrom`, `ValidTo`, `IsActive`
- Defaults role to `worker` if empty
- `Create` and `Update` re-fetch after save (to get preloaded relations)
- Uses `parseDate()` for date string parsing

**Handler** (`apps/api/internal/handler/order_assignment.go`, 208 lines):
- `List` supports `?order_id=` and `?employee_id=` query filters
- `ListByOrder` is a separate endpoint via nested route `/orders/{id}/assignments`

**Route Registration** (routes.go, lines 1013-1050):
- Route prefix: `/order-assignments`
- Also nested route: `/orders/{id}/assignments`
- Permission: `order_assignments.manage`

### 5. Database Migrations

**Groups** (migration `000041_extend_employee_master_data.up.sql`):
- Creates `employee_groups`, `workflow_groups`, `activity_groups` tables
- All have: `id UUID PK`, `tenant_id UUID NOT NULL FK tenants(id) ON DELETE CASCADE`, `code VARCHAR(50)`, `name VARCHAR(255)`, `description TEXT`, `is_active BOOLEAN DEFAULT true`, `created_at`, `updated_at`
- All have `UNIQUE(tenant_id, code)`
- Adds FK columns to `employees`: `employee_group_id`, `workflow_group_id`, `activity_group_id` (all FK to respective tables ON DELETE SET NULL)

**Activities** (migration `000053_create_activities.up.sql`):
- `activities` table with same base pattern as groups
- Has `update_activities_updated_at` trigger
- Unique constraint: `UNIQUE(tenant_id, code)`

**Orders** (migration `000055_create_orders.up.sql`):
- `orders` table with: `status VARCHAR(20) CHECK (status IN ('planned', 'active', 'completed', 'cancelled'))`, `customer VARCHAR(255)`, `cost_center_id UUID FK cost_centers(id) ON DELETE SET NULL`, `billing_rate_per_hour DECIMAL(10,2)`, `valid_from DATE`, `valid_to DATE`
- Indexes: tenant, tenant+active, tenant+status, cost_center
- Unique constraint: `UNIQUE(tenant_id, code)`

**Order Assignments** (migration `000056_create_order_assignments.up.sql`):
- `order_assignments` table with: `order_id UUID FK orders(id) ON DELETE CASCADE`, `employee_id UUID FK employees(id) ON DELETE CASCADE`, `role VARCHAR(20) CHECK (role IN ('worker', 'leader', 'sales'))`, `valid_from DATE`, `valid_to DATE`
- Unique constraint: `UNIQUE(order_id, employee_id, role)`
- Indexes: tenant, order, employee, employee+active

### 6. Prisma Schema Status

The Prisma schema at `apps/web/prisma/schema.prisma` does NOT include models for:
- `EmployeeGroup` / `WorkflowGroup` / `ActivityGroup`
- `Activity`
- `Order`
- `OrderAssignment`

The `Employee` model references these via FK columns with comments noting they are "not yet in Prisma":
- `employeeGroupId` (line 507), `workflowGroupId` (line 508), `activityGroupId` (line 509)
- `defaultOrderId` (line 520), `defaultActivityId` (line 521)

These Prisma models need to be created, and the `Employee` model needs relation fields added.

### 7. Permission Catalog

All four permissions already exist in `apps/web/src/server/lib/permission-catalog.ts`:

| Key | Description | Line |
|-----|-------------|------|
| `groups.manage` | "Manage employee, workflow, and activity groups" | 125 |
| `activities.manage` | "Manage activities for orders" | 138 |
| `orders.manage` | "Manage orders" | 143 |
| `order_assignments.manage` | "Manage order assignments" | 148 |

No new permissions need to be added.

### 8. tRPC Infrastructure and Patterns

The existing tRPC routers follow a consistent pattern established in previous tickets:

**Procedure Chain**: `tenantProcedure.use(requirePermission(PERM_ID)).input(schema).output(schema).query/mutation(handler)`

**Router Structure** (observed in all routers):
1. Permission constant: `const X_MANAGE = permissionIdByKey("x.manage")!`
2. Output Zod schema (mirrors Prisma model shape)
3. Input Zod schemas (create + update)
4. `mapXToOutput()` helper function
5. Router with procedures: `list`, `getById`, `create`, `update`, `delete`

**Root Router** (`apps/web/src/server/root.ts`): Currently has 15 routers registered. New routers for groups, activities, orders, and orderAssignments will be added here.

**Key Patterns from Existing Routers**:
- `costCenters.list` returns `{ data: CostCenter[] }` wrapper
- `employees.list` returns `{ items: Employee[], total: number }` with pagination
- `costCenters.delete` returns `{ success: boolean }`
- Uniqueness checks use `ctx.prisma.X.findFirst({ where: { tenantId, code, NOT: { id: input.id } } })`
- All mutations trim string inputs
- Tenant scoping: every query includes `tenantId` in WHERE clause

### 9. Frontend Hooks (Old Pattern)

Three hooks exist using `useApiQuery`/`useApiMutation` from `@/hooks`:

**`apps/web/src/hooks/api/use-activities.ts`** (57 lines):
- `useActivities({ active?, enabled? })` -- GET `/activities`
- `useActivity(id, enabled)` -- GET `/activities/{id}`
- `useCreateActivity()` -- POST `/activities`
- `useUpdateActivity()` -- PATCH `/activities/{id}`
- `useDeleteActivity()` -- DELETE `/activities/{id}`
- Invalidation: `[['/activities']]`

**`apps/web/src/hooks/api/use-orders.ts`** (58 lines):
- `useOrders({ active?, status?, enabled? })` -- GET `/orders`
- `useOrder(id, enabled)` -- GET `/orders/{id}`
- `useCreateOrder()` -- POST `/orders`
- `useUpdateOrder()` -- PATCH `/orders/{id}`
- `useDeleteOrder()` -- DELETE `/orders/{id}`
- Invalidation: `[['/orders']]`

**`apps/web/src/hooks/api/use-order-assignments.ts`** (74 lines):
- `useOrderAssignments({ orderId?, employeeId?, enabled? })` -- GET `/order-assignments`
- `useOrderAssignmentsByOrder(orderId, enabled)` -- GET `/orders/{id}/assignments`
- `useOrderAssignment(id, enabled)` -- GET `/order-assignments/{id}`
- `useCreateOrderAssignment()` -- POST `/order-assignments`
- `useUpdateOrderAssignment()` -- PATCH `/order-assignments/{id}`
- `useDeleteOrderAssignment()` -- DELETE `/order-assignments/{id}`
- Invalidation: `[['/order-assignments'], ['/orders']]`

**Groups hook does not exist** -- ticket notes it will be newly created.

### 10. OpenAPI Spec

**Groups** (`api/schemas/groups.yaml`, `api/paths/groups.yaml`):
- Three entity schemas: `EmployeeGroup`, `WorkflowGroup`, `ActivityGroup` (identical shapes)
- Shared request schemas: `CreateGroupRequest` (code, name required), `UpdateGroupRequest` (all optional)
- Three route sets: `/employee-groups`, `/workflow-groups`, `/activity-groups` (each with CRUD)

**Activities** (`api/schemas/activities.yaml`, `api/paths/activities.yaml`):
- Entity: `Activity` (id, tenant_id, code, name, description, is_active, timestamps)
- Requests: `CreateActivityRequest` (code, name required), `UpdateActivityRequest`
- Routes: `/activities` and `/activities/{id}` (CRUD)

**Orders** (`api/schemas/orders.yaml`, `api/paths/orders.yaml`):
- Entity: `Order` (adds status enum, customer, cost_center_id, billing_rate_per_hour, valid_from/to)
- Requests: `CreateOrderRequest`, `UpdateOrderRequest`
- Routes: `/orders` and `/orders/{id}` (CRUD)
- List supports `?active` and `?status` filters

**Order Assignments** (`api/schemas/order-assignments.yaml`, `api/paths/order-assignments.yaml`):
- Entity: `OrderAssignment` (order_id, employee_id, role enum, valid_from/to)
- Role enum: `worker`, `leader`, `sales`
- Routes: `/order-assignments` and `/order-assignments/{id}` (CRUD)
- Nested route: `/orders/{id}/assignments` (list by order)
- List supports `?order_id` and `?employee_id` filters

### 11. Entity Relationships

```
Employee --FK--> EmployeeGroup (employee_group_id, ON DELETE SET NULL)
Employee --FK--> WorkflowGroup (workflow_group_id, ON DELETE SET NULL)
Employee --FK--> ActivityGroup (activity_group_id, ON DELETE SET NULL)
Employee --FK--> Order (default_order_id, ON DELETE SET NULL)
Employee --FK--> Activity (default_activity_id, ON DELETE SET NULL)

Order --FK--> CostCenter (cost_center_id, ON DELETE SET NULL)
Order <--FK-- OrderAssignment (order_id, ON DELETE CASCADE)
Employee <--FK-- OrderAssignment (employee_id, ON DELETE CASCADE)
OrderAssignment UNIQUE(order_id, employee_id, role)

OrderBooking --FK--> Order (order_id)
OrderBooking --FK--> Activity (activity_id, nullable)
OrderBooking --FK--> Employee (employee_id)
```

### 12. Test Patterns

Existing tests use vitest with mock Prisma. Example from cost-centers-router.test.ts:
- Import `createCallerFactory` from `../trpc`
- Create caller from individual router (not root): `createCallerFactory(costCentersRouter)`
- Use helpers from `./helpers.ts`: `createMockContext`, `createMockSession`, `createUserWithPermissions`, `createMockUserTenant`
- Mock Prisma methods with `vi.fn().mockResolvedValue()`
- Test structure: one `describe` per procedure, test happy path + error cases

## Code References

- `apps/api/internal/model/group.go` -- Go group models (3 types, identical schema)
- `apps/api/internal/model/activity.go` -- Go activity model
- `apps/api/internal/model/order.go` -- Go order model with status enum and CostCenter relation
- `apps/api/internal/model/order_assignment.go` -- Go order assignment model with role enum
- `apps/api/internal/service/group.go` -- Group business logic (338 lines)
- `apps/api/internal/service/activity.go` -- Activity business logic (155 lines)
- `apps/api/internal/service/order.go` -- Order business logic (220 lines)
- `apps/api/internal/service/order_assignment.go` -- Order assignment business logic (155 lines)
- `apps/api/internal/handler/group.go` -- Group HTTP handler (345 lines)
- `apps/api/internal/handler/activity.go` -- Activity HTTP handler (178 lines)
- `apps/api/internal/handler/order.go` -- Order HTTP handler (227 lines)
- `apps/api/internal/handler/order_assignment.go` -- Order assignment HTTP handler (208 lines)
- `apps/api/internal/repository/group.go` -- Generic group repository (119 lines)
- `apps/api/internal/repository/activity.go` -- Activity repository (109 lines)
- `apps/api/internal/repository/order.go` -- Order repository (156 lines)
- `apps/api/internal/repository/order_assignment.go` -- Order assignment repository (113 lines)
- `apps/api/internal/handler/routes.go:742-790` -- Group route registration
- `apps/api/internal/handler/routes.go:971-1050` -- Activity, Order, OrderAssignment route registration
- `db/migrations/000041_extend_employee_master_data.up.sql` -- Creates group tables + employee FK columns
- `db/migrations/000053_create_activities.up.sql` -- Creates activities table
- `db/migrations/000055_create_orders.up.sql` -- Creates orders table
- `db/migrations/000056_create_order_assignments.up.sql` -- Creates order_assignments table
- `apps/web/prisma/schema.prisma:507-554` -- Employee FK fields referencing groups/orders (not yet modeled)
- `apps/web/src/server/lib/permission-catalog.ts:125,138,143,148` -- Permission keys
- `apps/web/src/server/routers/costCenters.ts` -- Reference tRPC router pattern (340 lines)
- `apps/web/src/server/routers/employees.ts` -- Complex tRPC router with data scope (1269 lines)
- `apps/web/src/server/__tests__/helpers.ts` -- Shared test utilities
- `apps/web/src/server/__tests__/cost-centers-router.test.ts` -- Reference test pattern
- `apps/web/src/hooks/api/use-activities.ts` -- Frontend hook (old pattern, 57 lines)
- `apps/web/src/hooks/api/use-orders.ts` -- Frontend hook (old pattern, 58 lines)
- `apps/web/src/hooks/api/use-order-assignments.ts` -- Frontend hook (old pattern, 74 lines)
- `api/schemas/groups.yaml` -- OpenAPI group schemas
- `api/schemas/activities.yaml` -- OpenAPI activity schemas
- `api/schemas/orders.yaml` -- OpenAPI order schemas
- `api/schemas/order-assignments.yaml` -- OpenAPI order assignment schemas

## Architecture Documentation

### tRPC Router Registration Pattern

New routers are registered in `apps/web/src/server/root.ts` by:
1. Importing the router from `./routers/<name>`
2. Adding it to the `createTRPCRouter({...})` call with a camelCase key
3. The `AppRouter` type is auto-inferred

### Prisma Model Addition Pattern

New Prisma models follow the pattern established by existing models in `schema.prisma`:
1. Include migration reference comments
2. Map all columns using `@map()` for snake_case
3. Map table using `@@map()`
4. Add proper indexes with named maps
5. Add relation fields with `@relation()` decorators
6. Run `npx prisma generate` to regenerate client

### Permission Resolution Flow

`tenantProcedure` -> `requirePermission(permissionIdByKey("x.manage")!)` -> procedure logic. The permission ID is a deterministic UUID v5 derived from the key string.

### Frontend Hook Migration Pattern

Old pattern (`useApiQuery`/`useApiMutation`) is replaced with tRPC hooks:
- `useApiQuery('/path')` -> `useTRPC().routerName.procedureName.useQuery(input)`
- `useApiMutation('/path', 'post')` -> `useTRPC().routerName.procedureName.useMutation()`
- Invalidation handled via `queryClient.invalidateQueries`

## Historical Context (from thoughts/)

- `thoughts/shared/tickets/ZMI-TICKET-215-groups-activities-orders.md` -- Ticket definition for this work
- `thoughts/shared/research/2026-03-04-ZMI-TICKET-212-holidays-costcenters-employmenttypes-locations.md` -- Previous tRPC router research (similar pattern)
- `thoughts/shared/research/2026-03-05-ZMI-TICKET-214-employees-crud.md` -- Employee CRUD tRPC router research

## Related Research

- `thoughts/shared/research/2026-03-04-ZMI-TICKET-212-holidays-costcenters-employmenttypes-locations.md`
- `thoughts/shared/research/2026-03-05-ZMI-TICKET-214-employees-crud.md`
- `thoughts/shared/research/2026-03-03-ZMI-TICKET-205-prisma-schema-employee.md`
- `thoughts/shared/research/2026-03-03-ZMI-TICKET-210-tenants-users-usergroups.md`

## Open Questions

1. **Prisma model additions**: The `EmployeeGroup`, `WorkflowGroup`, `ActivityGroup`, `Activity`, `Order`, and `OrderAssignment` models need to be added to the Prisma schema. Once added, the `Employee` model's relation comments can be replaced with actual Prisma relations.

2. **Groups router design**: The ticket specifies a single `groups` router with a `type` discriminator (input `{ type: "employee" | "workflow" | "activity" }`). The Go backend uses separate endpoints per type. The tRPC router could either follow the ticket's unified design or create separate sub-routers per type. The ticket's design with `groups.list({ type })` is cleaner for the frontend.

3. **Order CostCenter relation**: The Order model has a `CostCenter` belongs-to relation. The tRPC router should decide whether `getById` and `list` responses include the `CostCenter` object (the Go backend preloads it). The `CostCenter` Prisma model already exists.

4. **OrderAssignment employee/order preloads**: The Go backend preloads `Employee` and `Order` relations on order assignments. The tRPC router needs to decide what relation data to include in responses.

5. **OrderAssignment `byOrder` procedure**: The ticket specifies a `byOrder` query (`orderAssignments.byOrder({ orderId })`). This maps to the Go backend's nested `/orders/{id}/assignments` endpoint and the `ListByOrder` handler method.
