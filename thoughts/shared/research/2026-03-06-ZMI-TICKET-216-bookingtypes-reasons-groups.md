---
date: 2026-03-06T10:00:00+01:00
researcher: Claude
git_commit: 61a43e503962338d2ba9f5e8260ab49471cafdfc
branch: staging
repository: terp
topic: "tRPC routers for BookingTypes, BookingReasons, BookingTypeGroups, AbsenceTypeGroups, and CalculationRules"
tags: [research, codebase, trpc, booking-types, booking-reasons, booking-type-groups, absence-type-groups, calculation-rules, prisma]
status: complete
last_updated: 2026-03-06
last_updated_by: Claude
---

# Research: tRPC Routers for BookingTypes, BookingReasons, BookingTypeGroups, AbsenceTypeGroups, CalculationRules

**Date**: 2026-03-06T10:00:00+01:00
**Researcher**: Claude
**Git Commit**: 61a43e503962338d2ba9f5e8260ab49471cafdfc
**Branch**: staging
**Repository**: terp

## Research Question

What existing patterns, models, permissions, Go business logic, database schema, and frontend hooks exist for implementing tRPC routers for BookingTypes, BookingReasons, BookingTypeGroups, AbsenceTypeGroups, and CalculationRules? How do the existing tRPC routers (ZMI-TICKET-215) handle similar patterns?

## Summary

All five entity types have complete Go backend implementations (handler + service + repository + model layers), SQL migrations, and database tables. The Prisma schema does NOT yet include models for any of these five entities -- they need to be added. Four frontend hooks exist using the old `useApiQuery`/`useApiMutation` pattern (booking-types, booking-type-groups, absence-type-groups, calculation-rules); there is no frontend hook for booking-reasons yet. The permission catalog already contains `booking_types.manage` (used for bookingTypes, bookingReasons, AND bookingTypeGroups) and `absence_types.manage` (used for absenceTypeGroups and calculationRules). No separate `booking_reasons.*` or `calculation_rules.*` permissions exist.

## Detailed Findings

### 1. Permission Mapping (from Go routes.go)

The Go routes file (`apps/api/internal/handler/routes.go`) reveals the actual permission mapping:

| Entity | Go Permission Key | Permission Exists in Catalog |
|--------|------------------|------------------------------|
| BookingTypes | `booking_types.manage` | Yes (line 105 of permission-catalog.ts) |
| BookingReasons | `booking_types.manage` | Yes (same permission) |
| BookingTypeGroups | `booking_types.manage` | Yes (same permission) |
| AbsenceTypeGroups | `absence_types.manage` | Yes (line 107 of permission-catalog.ts) |
| CalculationRules | `absence_types.manage` | Yes (same permission) |

The ticket specifies `booking_types.read`/`booking_types.write` and `booking_reasons.*` and `calculation_rules.*` as separate permissions, but these do NOT exist in the permission catalog. The Go backend uses a single `booking_types.manage` for all three booking-related entities and `absence_types.manage` for both absence-type-groups and calculation-rules.

### 2. Go Domain Models

#### BookingType (`apps/api/internal/model/bookingtype.go`, 55 lines)
- **Table**: `booking_types`
- **Fields**: `ID`, `TenantID` (nullable UUID -- NULL for system types), `Code`, `Name`, `Description`, `Direction` (enum: "in"/"out"), `Category` (enum: "work"/"break"/"business_trip"/"other"), `AccountID` (nullable UUID), `RequiresReason` (bool), `UsageCount` (computed, not stored), `IsSystem` (bool), `IsActive` (bool), `CreatedAt`, `UpdatedAt`
- **Key trait**: `TenantID` is a pointer (`*uuid.UUID`) because system types have NULL tenant_id
- **Enums**: `BookingDirection` ("in", "out"), `BookingCategory` ("work", "break", "business_trip", "other")

#### BookingReason (`apps/api/internal/model/bookingreason.go`, 43 lines)
- **Table**: `booking_reasons`
- **Fields**: `ID`, `TenantID` (required UUID), `BookingTypeID` (required UUID), `Code`, `Label`, `IsActive`, `SortOrder`, `ReferenceTime` (nullable string, enum: "plan_start"/"plan_end"/"booking_time"), `OffsetMinutes` (nullable int), `AdjustmentBookingTypeID` (nullable UUID), `CreatedAt`, `UpdatedAt`
- **Unique constraint**: `(tenant_id, booking_type_id, code)`

#### BookingTypeGroup (`apps/api/internal/model/bookingtypegroup.go`, 37 lines)
- **Table**: `booking_type_groups`
- **Fields**: `ID`, `TenantID`, `Code`, `Name`, `Description`, `IsActive`, `CreatedAt`, `UpdatedAt`
- **Unique constraint**: `(tenant_id, code)`

#### BookingTypeGroupMember (`apps/api/internal/model/bookingtypegroup.go`)
- **Table**: `booking_type_group_members`
- **Fields**: `ID`, `GroupID`, `BookingTypeID`, `SortOrder`, `CreatedAt`
- **Unique constraint**: `(group_id, booking_type_id)`
- **Relations**: belongs to BookingTypeGroup (via GroupID), belongs to BookingType (via BookingTypeID)

#### AbsenceTypeGroup (`apps/api/internal/model/absencetypegroup.go`, 24 lines)
- **Table**: `absence_type_groups`
- **Fields**: `ID`, `TenantID`, `Code`, `Name`, `Description`, `IsActive`, `CreatedAt`, `UpdatedAt`
- **Unique constraint**: `(tenant_id, code)`

#### CalculationRule (`apps/api/internal/model/calculationrule.go`, 46 lines)
- **Table**: `calculation_rules`
- **Fields**: `ID`, `TenantID`, `Code`, `Name`, `Description`, `AccountID` (nullable UUID), `Value` (int), `Factor` (float64, numeric(5,2)), `IsActive`, `CreatedAt`, `UpdatedAt`
- **Unique constraint**: `(tenant_id, code)`
- **Business method**: `Calculate(dailyTargetMinutes int) decimal.Decimal` -- if Value is 0, uses dailyTargetMinutes; result = effectiveValue * factor

### 3. Go Service Layer Business Logic

#### BookingTypeService (`apps/api/internal/service/bookingtype.go`, 262 lines)

**Create**:
- Validates: code (required, trimmed), name (required, trimmed), direction (required, must be "in" or "out")
- Validates category: defaults to "work", must be one of work/break/business_trip/other
- Checks code uniqueness within tenant (via `GetByCode` with tenant_id)
- Sets `IsSystem=false`, `IsActive=true`
- Handles optional `RequiresReason`

**Update**:
- Validates entity exists
- Blocks modification of system types (`IsSystem=true` -> `ErrCannotModifySystemType`)
- Verifies tenant ownership (`TenantID` must match)
- Supports partial update: Name, Description, IsActive, Category, AccountID (with ClearAccountID flag), RequiresReason

**Delete**:
- Validates entity exists
- Blocks deletion of system types
- Verifies tenant ownership
- Checks usage count (counts bookings referencing this type) -> `ErrCannotDeleteTypeInUse`

**List**:
- Supports filters: `ActiveOnly`, `Direction`
- Default: `ListWithSystem` (includes system types with usage count via subquery)
- `ListActive`: active types including system types
- `ListByDirection`: active types filtered by direction

#### BookingReasonService (`apps/api/internal/service/bookingreason.go`, 206 lines)

**Create**:
- Validates: code (required), label (required), bookingTypeID (required, non-nil)
- Checks code uniqueness within (tenant_id, booking_type_id)
- Validates adjustment config consistency: reference_time and offset_minutes must both be set or both be nil
- Validates reference_time enum: "plan_start", "plan_end", "booking_time"
- Sets `IsActive=true`

**Update**:
- Supports partial update: Label, IsActive, SortOrder, ReferenceTime, OffsetMinutes, AdjustmentBookingTypeID
- `ClearAdjustment` flag clears all three adjustment fields
- Re-validates adjustment config consistency after update

**Delete**:
- Validates entity exists, then deletes

**List**:
- `List(tenantID)`: all reasons for tenant, ordered by sort_order ASC, code ASC
- `ListByBookingType(tenantID, bookingTypeID)`: filtered by booking type

#### BookingTypeGroupService (`apps/api/internal/service/bookingtypegroup.go`, 174 lines)

**Create**:
- Validates: code (required), name (required)
- Checks code uniqueness within tenant
- Creates group, then optionally sets members (BookingTypeIDs)
- Members created as `BookingTypeGroupMember` with `SortOrder` = array index

**Update**:
- Supports partial update: Name, Description, IsActive
- If `BookingTypeIDs` is not nil, replaces all members (delete + re-insert)
- If `BookingTypeIDs` is nil, members unchanged

**Delete**:
- Validates entity exists, then deletes (members cascade via FK)

**List**: all groups for tenant
**ListMembers**: booking types in a group, ordered by sort_order

#### AbsenceTypeGroupService (`apps/api/internal/service/absencetypegroup.go`, 145 lines)

**Create**:
- Validates: code (required), name (required)
- Checks code uniqueness within tenant
- Description trimmed, converted to pointer if non-empty
- Sets `IsActive=true`

**Update**:
- Supports partial update: Code (with re-check uniqueness), Name, Description, IsActive
- Code update includes uniqueness check excluding current entity

**Delete**:
- Validates entity exists, then deletes

#### CalculationRuleService (`apps/api/internal/service/calculationrule.go`, 214 lines)

**Create**:
- Validates: code (required), name (required)
- Validates: value >= 0 (`ErrInvalidValue`)
- Factor defaults to 1.0 if 0, must be > 0 (`ErrInvalidFactor`)
- Checks code uniqueness within tenant
- Sets `IsActive=true`

**Update**:
- Supports partial update: Name, Description, AccountID (with ClearAccountID flag), Value (>= 0), Factor (>= 0), IsActive

**Delete**:
- Validates entity exists
- Checks absence type usage count (`CountAbsenceTypeUsages`) -> `ErrCalculationRuleInUse`

**List**: all rules for tenant; also `ListActive` for active-only

### 4. Go Repository Layer

#### BookingTypeRepository (`apps/api/internal/repository/bookingtype.go`, 179 lines)
- `GetByCode`: accepts `*uuid.UUID` for tenantID; if non-nil, checks `tenant_id = ? OR tenant_id IS NULL`
- `ListWithSystem`: uses subquery to count bookings per type, returns `usage_count` as computed column, orders by `is_system DESC, code ASC`
- `ListActive`: filters `(tenant_id = ? OR tenant_id IS NULL) AND is_active = true`
- `ListByDirection`: same + direction filter
- `CountUsage`: counts rows in `bookings` table referencing the type

#### BookingReasonRepository (`apps/api/internal/repository/bookingreason.go`, 91 lines)
- `GetByCode`: triple-key lookup (tenant_id, booking_type_id, code)
- `List`: ordered by `sort_order ASC, code ASC`

#### BookingTypeGroupRepository (`apps/api/internal/repository/bookingtypegroup.go`, 141 lines)
- `SetMembers`: deletes all existing members for group, then bulk-inserts new ones
- `ListMemberBookingTypes`: joins `booking_type_group_members` with `booking_types`, ordered by `sort_order ASC`

#### AbsenceTypeGroupRepository (`apps/api/internal/repository/absencetypegroup.go`, 79 lines)
- Standard CRUD, ordered by `code ASC`

#### CalculationRuleRepository (`apps/api/internal/repository/calculationrule.go`, 122 lines)
- `Create` uses `Select` to specify columns (avoids zero-value issue with `Factor`)
- `CountAbsenceTypeUsages`: counts `absence_types` where `calculation_rule_id = ?`

### 5. Database Schema (SQL Migrations)

#### booking_types (migration 000021 + 000044)
```sql
CREATE TABLE booking_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL for system types
    code VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    direction VARCHAR(10) NOT NULL, -- 'in' or 'out'
    category VARCHAR(30) NOT NULL DEFAULT 'work',
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    requires_reason BOOLEAN DEFAULT false,
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Unique: COALESCE(tenant_id, '00000000-...'), code
-- System seed: COME, GO, BREAK_START, BREAK_END
```

#### booking_reasons (migration 000044 + 000078)
```sql
CREATE TABLE booking_reasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    booking_type_id UUID NOT NULL REFERENCES booking_types(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    label VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    sort_order INT DEFAULT 0,
    reference_time VARCHAR(20),        -- added in 000078
    offset_minutes INT,                -- added in 000078
    adjustment_booking_type_id UUID,   -- added in 000078
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, booking_type_id, code)
);
```

#### booking_type_groups (migration 000044)
```sql
CREATE TABLE booking_type_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);
```

#### booking_type_group_members (migration 000044)
```sql
CREATE TABLE booking_type_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES booking_type_groups(id) ON DELETE CASCADE,
    booking_type_id UUID NOT NULL REFERENCES booking_types(id) ON DELETE CASCADE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, booking_type_id)
);
```

#### absence_type_groups (migration 000042)
```sql
CREATE TABLE absence_type_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);
-- Also adds absence_type_group_id FK to absence_types table
```

#### calculation_rules (migration 000046)
```sql
CREATE TABLE calculation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    value INT NOT NULL DEFAULT 0,
    factor NUMERIC(5,2) NOT NULL DEFAULT 1.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);
```

### 6. Prisma Schema Status

The Prisma schema (`apps/web/prisma/schema.prisma`) does NOT currently include models for:
- `BookingType`
- `BookingReason`
- `BookingTypeGroup`
- `BookingTypeGroupMember`
- `AbsenceTypeGroup`
- `CalculationRule`

These all need to be added. The `Tenant` model needs relations added for these entities. The `Account` model exists in Prisma and can be referenced by BookingType and CalculationRule.

Key Prisma modeling considerations:
- `BookingType.tenantId` is NULLABLE (system types have NULL tenant). In Prisma: `tenantId String? @map("tenant_id") @db.Uuid`
- The COALESCE-based unique index on booking_types cannot be modeled in Prisma (same pattern as UserGroup, EmploymentType)
- `BookingReason` has a triple-column unique constraint: `@@unique([tenantId, bookingTypeId, code])`
- `BookingTypeGroupMember` has a composite unique: `@@unique([groupId, bookingTypeId])`
- `CalculationRule.factor` maps to `Decimal(5,2)` in Prisma

### 7. Existing tRPC Router Patterns (Reference)

The established tRPC router pattern from ZMI-TICKET-215 follows this structure:

```typescript
// 1. Permission constants at top
const PERM = permissionIdByKey("entity.manage")!

// 2. Output schema (z.object)
const outputSchema = z.object({ ... })

// 3. Input schemas (create + update)
const createInputSchema = z.object({ ... })
const updateInputSchema = z.object({ id: z.string().uuid(), ...optional fields })

// 4. Helper mapper function
function mapToOutput(record: PrismaType): OutputType { ... }

// 5. Router with procedures
export const entityRouter = createTRPCRouter({
  list: tenantProcedure.use(requirePermission(PERM))
    .input(z.object({...}).optional())
    .output(z.object({ data: z.array(outputSchema) }))
    .query(async ({ ctx, input }) => { ... }),
  getById: tenantProcedure.use(requirePermission(PERM))
    .input(z.object({ id: z.string().uuid() }))
    .output(outputSchema)
    .query(async ({ ctx, input }) => { ... }),
  create: tenantProcedure.use(requirePermission(PERM))
    .input(createInputSchema)
    .output(outputSchema)
    .mutation(async ({ ctx, input }) => { ... }),
  update: tenantProcedure.use(requirePermission(PERM))
    .input(updateInputSchema)
    .output(outputSchema)
    .mutation(async ({ ctx, input }) => { ... }),
  delete: tenantProcedure.use(requirePermission(PERM))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => { ... }),
})
```

Key patterns:
- All procedures use `tenantProcedure` (requires auth + tenant)
- `.use(requirePermission(...))` for authorization
- `ctx.tenantId!` for tenant scoping
- `ctx.prisma.entity.findMany/findFirst/create/update/delete` for DB access
- Trim + validate code/name in create/update
- Check code uniqueness via `findFirst({ where: { tenantId, code } })`
- Update uses `findFirst` to verify existence + tenant ownership, then builds `data` object from defined input fields
- Delete verifies existence, optionally checks usage, then hard deletes
- Delete returns `{ success: true }`

### 8. Existing tRPC Frontend Hook Pattern (Reference)

The migrated hooks from ZMI-TICKET-215 use this pattern:

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useEntities(options = {}) {
  const trpc = useTRPC()
  return useQuery(trpc.entities.list.queryOptions(input, { enabled }))
}

export function useEntity(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(trpc.entities.getById.queryOptions({ id }, { enabled: enabled && !!id }))
}

export function useCreateEntity() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.entities.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.entities.list.queryKey() })
    },
  })
}
// Similar for useUpdateEntity, useDeleteEntity
```

### 9. Existing Frontend Hooks (Old Pattern, to be migrated)

#### use-booking-types.ts (`apps/web/src/hooks/api/use-booking-types.ts`, 73 lines)
- Uses `useApiQuery('/booking-types', { params: { active, direction }, enabled })`
- `useBookingType(id)` -> `useApiQuery('/booking-types/{id}', { path: { id } })`
- Mutations: `useApiMutation('/booking-types', 'post', { invalidateKeys: [['/booking-types']] })`
- Exported in index.ts: `useBookingTypes`, `useBookingType`, `useCreateBookingType`, `useUpdateBookingType`, `useDeleteBookingType`

#### use-booking-type-groups.ts (`apps/web/src/hooks/api/use-booking-type-groups.ts`, 56 lines)
- Standard CRUD hooks using `useApiQuery`/`useApiMutation`
- Exported: `useBookingTypeGroups`, `useBookingTypeGroup`, `useCreateBookingTypeGroup`, `useUpdateBookingTypeGroup`, `useDeleteBookingTypeGroup`

#### use-absence-type-groups.ts (`apps/web/src/hooks/api/use-absence-type-groups.ts`, 56 lines)
- Standard CRUD hooks using `useApiQuery`/`useApiMutation`
- Exported: `useAbsenceTypeGroups`, `useAbsenceTypeGroup`, `useCreateAbsenceTypeGroup`, `useUpdateAbsenceTypeGroup`, `useDeleteAbsenceTypeGroup`

#### use-calculation-rules.ts (`apps/web/src/hooks/api/use-calculation-rules.ts`, 56 lines)
- Standard CRUD hooks using `useApiQuery`/`useApiMutation`
- Exported: `useCalculationRules`, `useCalculationRule`, `useCreateCalculationRule`, `useUpdateCalculationRule`, `useDeleteCalculationRule`

#### booking-reasons: No frontend hook exists yet (confirmed by ticket: "Hinweis: bookingReasons Frontend-Hook existiert noch nicht im Hook-Index")

### 10. Frontend Component Usage

Components using these hooks (need migration):
- `apps/web/src/app/[locale]/(dashboard)/admin/booking-types/page.tsx` -- uses booking types AND booking type groups hooks
- `apps/web/src/components/booking-types/booking-type-form-sheet.tsx`
- `apps/web/src/components/booking-type-groups/booking-type-group-form-sheet.tsx`
- `apps/web/src/components/evaluations/bookings-tab.tsx`
- `apps/web/src/components/dashboard/quick-actions.tsx`
- `apps/web/src/components/timesheet/booking-create-dialog.tsx`
- `apps/web/src/app/[locale]/(dashboard)/admin/absence-types/page.tsx` -- uses absence type groups hooks
- `apps/web/src/app/[locale]/(dashboard)/admin/calculation-rules/page.tsx`
- `apps/web/src/components/calculation-rules/calculation-rule-detail-sheet.tsx`

### 11. Root Router Registration

The root router (`apps/web/src/server/root.ts`) registers all sub-routers. Currently has 19 routers registered. The five new routers need to be added:

```typescript
export const appRouter = createTRPCRouter({
  // ... existing routers
  bookingTypes: bookingTypesRouter,
  bookingReasons: bookingReasonsRouter,
  bookingTypeGroups: bookingTypeGroupsRouter,
  absenceTypeGroups: absenceTypeGroupsRouter,
  calculationRules: calculationRulesRouter,
})
```

### 12. Special Considerations

#### BookingType: System Types
- System types have `tenant_id = NULL` and `is_system = true`
- They are seeded in migrations (COME, GO, BREAK_START, BREAK_END)
- Cannot be modified or deleted
- Must appear in list queries alongside tenant-specific types (`OR tenant_id IS NULL`)
- The `ListWithSystem` query includes a usage_count subquery from the bookings table

#### BookingType: Nullable TenantID
- Unlike most entities, `BookingType.tenantId` is nullable
- In Prisma, this means the Tenant relation is optional
- The COALESCE-based unique index for (tenant_id, code) cannot be modeled in Prisma -- same pattern as UserGroup and EmploymentType, where a comment notes this

#### BookingTypeGroup: Member Management
- Members are managed via a separate join table (`booking_type_group_members`)
- The `SetMembers` pattern: delete all existing members for the group, then bulk-insert new ones
- This is analogous to how `OrderAssignment` manages relationships, but simpler (no unique constraint violations to catch since it replaces all)
- The Go handler fetches members as part of every response (`bookingTypeGroupToResponse` calls `ListMembers`)

#### BookingReason: Adjustment Configuration
- The adjustment fields (`reference_time`, `offset_minutes`, `adjustment_booking_type_id`) are optional but interdependent
- `reference_time` and `offset_minutes` must both be set or both be nil
- `reference_time` must be one of: "plan_start", "plan_end", "booking_time"
- The `ClearAdjustment` flag in update clears all three fields

#### CalculationRule: Usage Check on Delete
- Before deleting, count references in `absence_types` table where `calculation_rule_id = ?`
- The `absence_types` table exists in the DB but is NOT yet in the Prisma schema
- The count query will need to use `$queryRaw` or the AbsenceType model once it's added to Prisma

### 13. Test Patterns (Reference)

The existing test pattern from ZMI-TICKET-215 (`apps/web/src/server/__tests__/orders-router.test.ts`):

```typescript
import { createCallerFactory } from "../trpc"
import { ordersRouter } from "../routers/orders"
import { createMockContext, createMockSession, createUserWithPermissions, createMockUserTenant } from "./helpers"

const createCaller = createCallerFactory(ordersRouter)

function makeEntity(overrides = {}) { return { ...defaults, ...overrides } }

function createTestContext(prisma) {
  return createMockContext({
    prisma,
    authToken: "test-token",
    user: createUserWithPermissions([PERM_ID], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}
```

Tests mock Prisma methods (`findMany`, `findFirst`, `create`, `update`, `delete`, `count`) using `vi.fn()` and verify:
- Correct Prisma calls with expected arguments
- Response shape matches output schema
- Error cases (NOT_FOUND, BAD_REQUEST, CONFLICT)
- Permission enforcement

## Code References

- `apps/api/internal/model/bookingtype.go` - BookingType and BookingDirection/BookingCategory enums
- `apps/api/internal/model/bookingreason.go` - BookingReason with adjustment config
- `apps/api/internal/model/bookingtypegroup.go` - BookingTypeGroup and BookingTypeGroupMember
- `apps/api/internal/model/absencetypegroup.go` - AbsenceTypeGroup
- `apps/api/internal/model/calculationrule.go` - CalculationRule with Calculate method
- `apps/api/internal/service/bookingtype.go` - BookingType business logic (262 lines)
- `apps/api/internal/service/bookingreason.go` - BookingReason business logic (206 lines)
- `apps/api/internal/service/bookingtypegroup.go` - BookingTypeGroup business logic with member management (174 lines)
- `apps/api/internal/service/absencetypegroup.go` - AbsenceTypeGroup business logic (145 lines)
- `apps/api/internal/service/calculationrule.go` - CalculationRule business logic with usage check (214 lines)
- `apps/api/internal/handler/bookingtype.go` - HTTP handler (241 lines)
- `apps/api/internal/handler/bookingreason.go` - HTTP handler (254 lines)
- `apps/api/internal/handler/bookingtypegroup.go` - HTTP handler with member response (243 lines)
- `apps/api/internal/handler/absencetypegroup.go` - HTTP handler (179 lines)
- `apps/api/internal/handler/calculationrule.go` - HTTP handler with audit logging (294 lines)
- `apps/api/internal/repository/bookingtype.go` - Data access with system type support (179 lines)
- `apps/api/internal/repository/bookingreason.go` - Data access (91 lines)
- `apps/api/internal/repository/bookingtypegroup.go` - Data access with member management (141 lines)
- `apps/api/internal/repository/absencetypegroup.go` - Data access (79 lines)
- `apps/api/internal/repository/calculationrule.go` - Data access with usage count (122 lines)
- `apps/api/internal/handler/routes.go:380-398` - BookingType route registration with permissions
- `apps/api/internal/handler/routes.go:682-699` - AbsenceTypeGroup route registration
- `apps/api/internal/handler/routes.go:702-719` - BookingReason route registration
- `apps/api/internal/handler/routes.go:722-739` - BookingTypeGroup route registration
- `apps/api/internal/handler/routes.go:777-794` - CalculationRule route registration
- `apps/web/prisma/schema.prisma` - Current Prisma schema (no booking/absence/calc models yet)
- `apps/web/src/server/root.ts` - Root router (needs 5 new sub-routers)
- `apps/web/src/server/lib/permission-catalog.ts:105` - `booking_types.manage` permission
- `apps/web/src/server/lib/permission-catalog.ts:107` - `absence_types.manage` permission
- `apps/web/src/server/routers/orders.ts` - Reference tRPC router pattern
- `apps/web/src/server/routers/activities.ts` - Reference tRPC router pattern (simple)
- `apps/web/src/server/routers/orderAssignments.ts` - Reference for relation includes
- `apps/web/src/hooks/api/use-orders.ts` - Reference migrated hook pattern
- `apps/web/src/hooks/api/use-booking-types.ts` - Old hook to migrate
- `apps/web/src/hooks/api/use-booking-type-groups.ts` - Old hook to migrate
- `apps/web/src/hooks/api/use-absence-type-groups.ts` - Old hook to migrate
- `apps/web/src/hooks/api/use-calculation-rules.ts` - Old hook to migrate
- `apps/web/src/hooks/api/index.ts` - Hook barrel export (needs updates)
- `db/migrations/000021_create_booking_types.up.sql` - booking_types table + system seeds
- `db/migrations/000044_booking_type_enhancements.up.sql` - Added category, account_id, requires_reason + booking_reasons + booking_type_groups + members
- `db/migrations/000042_create_absence_type_groups.up.sql` - absence_type_groups table
- `db/migrations/000046_create_calculation_rules.up.sql` - calculation_rules table
- `db/migrations/000078_booking_reason_adjustments.up.sql` - Added adjustment fields to booking_reasons

## Architecture Documentation

### tRPC Procedure Pattern
All entity routers use `tenantProcedure` (auth + tenant required) with `.use(requirePermission(...))`. The permission ID is looked up via `permissionIdByKey()` which uses UUID v5 deterministic generation.

### Prisma Model Addition Pattern
New Prisma models follow the established pattern:
1. Add model to `schema.prisma` with `@map("table_name")` for snake_case tables
2. Use `@default(dbgenerated("gen_random_uuid()"))` for UUIDs
3. Use `@map("column_name")` for snake_case columns
4. Add relations both directions (parent and child)
5. Add `@@index` and `@@unique` matching DB indexes
6. Add comments referencing migration numbers
7. Run `npx prisma generate` to regenerate client

### Root Router Registration
Import the router from `./routers/filename` and add to `createTRPCRouter({})` in `apps/web/src/server/root.ts`.

### Frontend Hook Migration Pattern
Replace `useApiQuery`/`useApiMutation` with `useTRPC()` + `useQuery`/`useMutation` from `@tanstack/react-query`.

## Historical Context (from thoughts/)

- `thoughts/shared/research/2026-03-05-ZMI-TICKET-215-groups-activities-orders.md` - Previous ticket research showing the same pattern used for groups, activities, orders, and order assignments
- `thoughts/shared/tickets/ZMI-TICKET-216-bookingtypes-reasons-groups.md` - Ticket definition with all requirements

## Related Research

- `thoughts/shared/research/2026-03-05-ZMI-TICKET-215-groups-activities-orders.md` - Reference implementation for tRPC router + hook migration pattern
- `thoughts/shared/research/2026-03-05-ZMI-TICKET-214-employees-crud.md` - Employee CRUD tRPC routers

## Open Questions

1. **CalculationRule delete usage check**: The `absence_types` table exists in the DB but is not yet modeled in Prisma. The usage count query (`SELECT COUNT(*) FROM absence_types WHERE calculation_rule_id = ?`) will need to use `ctx.prisma.$queryRaw` or the model needs to be added to Prisma first. (ZMI-TICKET-218 is planned for absence types but is listed as a dependency OF calculation rules, not the reverse.)

2. **BookingType system types**: The Prisma query for listing with system types needs `WHERE tenant_id = ? OR tenant_id IS NULL`. The usage_count subquery from bookings table may also need raw SQL since the Booking model is not in Prisma.

3. **BookingReason booking_type_id filter**: The list endpoint supports optional filtering by `booking_type_id`. The ticket mentions only `list` with no explicit filter input -- need to preserve this filtering capability from the Go implementation.
