# Research: ZMI-TICKET-218 - Absence Types tRPC Router

**Date:** 2026-03-06
**Ticket:** ZMI-TICKET-218
**Dependencies:** ZMI-TICKET-216 (CalculationRule, AbsenceTypeGroup), ZMI-TICKET-210 (tenantProcedure)

---

## 1. Existing Go Backend Implementation

### 1.1 Model: `apps/api/internal/model/absencetype.go`

The `AbsenceType` struct has these fields:

| Field                | Go Type            | DB Column               | Notes                                      |
|----------------------|--------------------|-------------------------|---------------------------------------------|
| ID                   | uuid.UUID          | id                      | PK, gen_random_uuid()                       |
| TenantID             | *uuid.UUID         | tenant_id               | NULL for system types                       |
| CreatedAt            | time.Time          | created_at              |                                             |
| UpdatedAt            | time.Time          | updated_at              |                                             |
| Code                 | string             | code                    | VARCHAR(10), NOT NULL                       |
| Name                 | string             | name                    | VARCHAR(100), NOT NULL                      |
| Description          | *string            | description             | TEXT, nullable                              |
| Category             | AbsenceCategory    | category                | VARCHAR(20), enum: vacation/illness/special/unpaid |
| Portion              | AbsencePortion     | portion                 | INT, 0=none, 1=full, 2=half                |
| HolidayCode          | *string            | holiday_code            | VARCHAR(10), nullable                       |
| Priority             | int                | priority                | INT, default 0                              |
| DeductsVacation      | bool               | deducts_vacation        | default false                               |
| RequiresApproval     | bool               | requires_approval       | default true                                |
| RequiresDocument     | bool               | requires_document       | default false                               |
| Color                | string             | color                   | VARCHAR(7), default '#808080'               |
| SortOrder            | int                | sort_order              | INT, default 0                              |
| IsSystem             | bool               | is_system               | default false                               |
| IsActive             | bool               | is_active               | default true                                |
| AbsenceTypeGroupID   | *uuid.UUID         | absence_type_group_id   | FK -> absence_type_groups(id) ON DELETE SET NULL |
| CalculationRuleID    | *uuid.UUID         | calculation_rule_id     | FK -> calculation_rules(id) ON DELETE SET NULL   |

Additional constants:
- `AbsenceCategory` enum: `vacation`, `illness`, `special`, `unpaid`
- `AbsencePortion` enum: 0 (none), 1 (full), 2 (half)

Helper methods on model: `CreditMultiplier()`, `CalculateCredit()`, `GetEffectiveCode()`, `IsVacationType()`, `IsIllnessType()`.

### 1.2 Repository: `apps/api/internal/repository/absencetype.go`

Methods:
- `Create(ctx, *AbsenceType) error`
- `GetByID(ctx, uuid) (*AbsenceType, error)` -- returns `ErrAbsenceTypeNotFound` on 404
- `GetByCode(ctx, tenantID, code) (*AbsenceType, error)` -- prefers tenant-specific over system types
- `Update(ctx, *AbsenceType) error`
- `Delete(ctx, uuid) error` -- hard delete, returns `ErrAbsenceTypeNotFound` if 0 rows affected
- `List(ctx, tenantID, includeSystem) ([]AbsenceType, error)` -- filters `is_active = true`, orders by `sort_order ASC, code ASC`
- `ListByCategory(ctx, tenantID, category) ([]AbsenceType, error)`
- `Upsert(ctx, *AbsenceType) error` -- used for dev seeding

### 1.3 Service: `apps/api/internal/service/absence.go`

AbsenceType-related methods on `AbsenceService`:
- `ListTypes(ctx, tenantID)` -- calls `repo.List(ctx, tenantID, true)` (includes system)
- `GetTypeByID(ctx, tenantID, id)` -- verifies tenant access (system types accessible to all)
- `CreateType(ctx, *AbsenceType)` -- validates code prefix, checks code uniqueness, forces `IsSystem=false`
- `UpdateType(ctx, *AbsenceType)` -- blocks system type modification, verifies ownership
- `DeleteType(ctx, tenantID, id)` -- blocks system type deletion, verifies ownership

Validation via `ValidateAbsenceType()`:
- Portion must be 0, 1, or 2
- Code prefix must match category: U for vacation, K for illness, S for special, U for unpaid
- Code must be non-empty

**Important:** The Go service does NOT check if absence_days reference the type before deletion. The ticket requires this check for the tRPC version.

### 1.4 Handler: `apps/api/internal/handler/absence.go`

HTTP endpoints for AbsenceType CRUD:
- `GET /absence-types` -> `ListTypes` (no auth for read)
- `GET /absence-types/{id}` -> `GetType` (no auth for read)
- `POST /absence-types` -> `CreateType` (requires `absence_types.manage`)
- `PATCH /absence-types/{id}` -> `UpdateType` (requires `absence_types.manage`)
- `DELETE /absence-types/{id}` -> `DeleteType` (requires `absence_types.manage`)

Route registration is in `apps/api/internal/handler/routes.go` lines 514-535. Read operations (`GET`) do NOT require `absence_types.manage` permission in the Go handler.

### 1.5 Generated OpenAPI Models: `apps/api/gen/models/absence_type.go`

The generated `models.AbsenceType` struct includes fields like `AffectsVacationBalance`, `IsPaid`, `Portion`, `HolidayCode`, `Priority`, `RequiresDocument`, `SortOrder`, `AbsenceTypeGroupID`, `CalculationRuleID`. Category enum includes: vacation, sick, personal, unpaid, holiday, other.

---

## 2. Database Schema

### 2.1 `absence_types` Table (migration 000025)

```sql
CREATE TABLE absence_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(10) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(20) NOT NULL,
    portion INT NOT NULL DEFAULT 1,
    holiday_code VARCHAR(10),
    priority INT NOT NULL DEFAULT 0,
    deducts_vacation BOOLEAN DEFAULT false,
    requires_approval BOOLEAN DEFAULT true,
    requires_document BOOLEAN DEFAULT false,
    color VARCHAR(7) DEFAULT '#808080',
    sort_order INT DEFAULT 0,
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Unique index: `COALESCE(tenant_id, '00000000-...')` + `code`.
Trigger: `update_absence_types_updated_at` auto-sets `updated_at`.

### 2.2 FK additions (migrations 000042, 000047)

- Migration 000042 added `absence_type_group_id UUID REFERENCES absence_type_groups(id) ON DELETE SET NULL`
- Migration 000047 added `calculation_rule_id UUID REFERENCES calculation_rules(id) ON DELETE SET NULL`

### 2.3 `absence_days` Table (migration 000026)

References `absence_types`:
```sql
absence_type_id UUID NOT NULL REFERENCES absence_types(id)
```

This is the FK that needs to be checked in the delete procedure (ticket requirement: "Delete must check if AbsenceType is in use").

### 2.4 System Seed Data (migration 000025, 000085)

10 system absence types are seeded with `is_system = true` and `tenant_id = NULL`:
- U (Urlaub), UH (Urlaub halber Tag) -- vacation
- K (Krankheit), KH, KK -- illness
- S (Sonderurlaub), SH, SB, SD -- special
- UU (Unbezahlter Urlaub) -- unpaid

---

## 3. Prisma Schema Status

### 3.1 AbsenceType Model -- NOT YET IN PRISMA

The `AbsenceType` model does **not** exist in `apps/web/prisma/schema.prisma`. Both `AbsenceTypeGroup` and `CalculationRule` have comments noting this:

```prisma
// Note: absence_types.absence_type_group_id FK references this table.
// AbsenceType model not yet in Prisma. Relation will be added when it is.
```

**This means the AbsenceType Prisma model must be added as part of this ticket.**

### 3.2 AbsenceTypeGroup Model (exists in Prisma, line 985)

```prisma
model AbsenceTypeGroup {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String    @map("tenant_id") @db.Uuid
  code        String    @db.VarChar(50)
  name        String    @db.VarChar(255)
  description String?   @db.Text
  isActive    Boolean   @default(true) @map("is_active")
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  tenant      Tenant    @relation(...)
  @@map("absence_type_groups")
}
```

### 3.3 CalculationRule Model (exists in Prisma, line 1014)

```prisma
model CalculationRule {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String    @map("tenant_id") @db.Uuid
  code        String    @db.VarChar(50)
  name        String    @db.VarChar(255)
  description String?   @db.Text
  accountId   String?   @map("account_id") @db.Uuid
  value       Int       @default(0)
  factor      Decimal   @default(1.00) @db.Decimal(5,2)
  isActive    Boolean   @default(true) @map("is_active")
  ...
  @@map("calculation_rules")
}
```

### 3.4 AbsenceDay Model -- NOT IN PRISMA

The `absence_days` table is not modeled in Prisma. The "in use" check for delete will need to use raw SQL (`$queryRawUnsafe`) similar to how `calculationRules.delete` checks `absence_types`.

---

## 4. Existing tRPC Patterns

### 4.1 Router Structure (from AbsenceTypeGroups, CalculationRules)

All CRUD routers follow the same pattern:
```typescript
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

const PERM = permissionIdByKey("absence_types.manage")!

export const router = createTRPCRouter({
  list: tenantProcedure.use(requirePermission(PERM)).input(...).output(...).query(...),
  getById: tenantProcedure.use(requirePermission(PERM)).input(...).output(...).query(...),
  create: tenantProcedure.use(requirePermission(PERM)).input(...).output(...).mutation(...),
  update: tenantProcedure.use(requirePermission(PERM)).input(...).output(...).mutation(...),
  delete: tenantProcedure.use(requirePermission(PERM)).input(...).output(...).mutation(...),
})
```

Key patterns:
1. `tenantProcedure` provides authenticated user + validated tenant access via `ctx.tenantId`
2. `requirePermission()` middleware checks user's group permissions
3. Output schemas use `z.object(...)` with explicit field mapping
4. Input schemas use `z.object(...)` with `z.string().uuid()` for IDs
5. `mapToOutput()` helper converts Prisma records to output shape
6. `{ data: z.array(outputSchema) }` wrapper for list endpoints
7. Delete returns `{ success: boolean }`
8. NOT_FOUND errors use `throw new TRPCError({ code: "NOT_FOUND", ... })`
9. Uniqueness violations use `throw new TRPCError({ code: "CONFLICT", ... })`
10. "In use" checks use raw SQL: `ctx.prisma.$queryRawUnsafe<[{ count: number }]>(...)`

### 4.2 Root Router Registration: `apps/web/src/server/root.ts`

All routers are imported and registered in `appRouter`. Currently includes:
`absenceTypeGroups`, `calculationRules`, and 23 other routers.
The new `absenceTypes` router must be added here.

### 4.3 tRPC Context: `apps/web/src/server/trpc.ts`

- `TRPCContext` includes: `prisma`, `authToken`, `user`, `session`, `tenantId`
- `tenantProcedure` extends `protectedProcedure` with tenant validation via `userTenants`
- `ContextUser` includes `userGroup` (with permissions) and `userTenants`

---

## 5. Permission System

### 5.1 Existing Permissions

Only one permission exists for absence types: **`absence_types.manage`**.

There are NO `absence_types.read` or `absence_types.write` permissions in either:
- Go: `apps/api/internal/permissions/permissions.go` line 55
- TypeScript: `apps/web/src/server/lib/permission-catalog.ts` line 107

The ticket mentions `absence_types.read` and `absence_types.write` permissions, but these do not exist in the codebase. The Go handler applies `absence_types.manage` only for write operations (POST/PATCH/DELETE); read operations (GET list, GET by ID) have no permission check.

Both the `absenceTypeGroups` and `calculationRules` tRPC routers use `absence_types.manage` for ALL procedures including list and getById.

### 5.2 Permission Check Pattern

```typescript
const ABSENCE_TYPES_MANAGE = permissionIdByKey("absence_types.manage")!
// ...
list: tenantProcedure.use(requirePermission(ABSENCE_TYPES_MANAGE)).input(...)
```

---

## 6. Frontend Hooks

### 6.1 Current Hooks: `apps/web/src/hooks/api/use-absences.ts`

AbsenceType-related hooks (using the old Go API via `useApiQuery`/`useApiMutation`):
- `useAbsenceTypes(enabled)` -- `GET /absence-types`
- `useAbsenceType(id, enabled)` -- `GET /absence-types/{id}`
- `useCreateAbsenceType()` -- `POST /absence-types` with invalidation of `['/absence-types']`
- `useUpdateAbsenceType()` -- `PATCH /absence-types/{id}` with invalidation of `['/absence-types']`
- `useDeleteAbsenceType()` -- `DELETE /absence-types/{id}` with invalidation of `['/absence-types']`

### 6.2 tRPC Hook Pattern: `apps/web/src/hooks/api/use-absence-type-groups.ts`

Already-migrated hooks follow this pattern:
```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useAbsenceTypeGroups(options = {}) {
  const trpc = useTRPC()
  return useQuery(trpc.absenceTypeGroups.list.queryOptions({ ... }, { enabled }))
}

export function useCreateAbsenceTypeGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.absenceTypeGroups.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.absenceTypeGroups.list.queryKey(),
      })
    },
  })
}
```

### 6.3 Components Using AbsenceType Hooks

- `apps/web/src/app/[locale]/(dashboard)/admin/absence-types/page.tsx` -- uses `useAbsenceTypes`, `useDeleteAbsenceType`
- `apps/web/src/components/absence-types/absence-type-form-sheet.tsx` -- uses `useCreateAbsenceType`, `useUpdateAbsenceType`
- `apps/web/src/components/absence-types/absence-type-detail-sheet.tsx` -- uses `useAbsenceType`
- `apps/web/src/components/absences/absence-request-form.tsx` -- uses absence type hooks

### 6.4 Barrel Export: `apps/web/src/hooks/api/index.ts`

Lines 101-114 export from `./use-absences`:
```typescript
useAbsenceTypes, useAbsenceType, ... (and other absence hooks)
```

Lines 395-400 export from `./use-absence-type-groups`:
```typescript
useAbsenceTypeGroups, useAbsenceTypeGroup, ...
```

---

## 7. Test Patterns

### 7.1 tRPC Router Tests: `apps/web/src/server/__tests__/absenceTypeGroups-router.test.ts`

Pattern:
```typescript
import { createCallerFactory } from "../trpc"
import { absenceTypeGroupsRouter } from "../routers/absenceTypeGroups"
import { permissionIdByKey } from "../lib/permission-catalog"
import { createMockContext, createMockSession, createUserWithPermissions, createMockUserTenant } from "./helpers"

const createCaller = createCallerFactory(absenceTypeGroupsRouter)

function createTestContext(prisma) {
  return createMockContext({
    prisma: prisma as unknown as ...,
    authToken: "test-token",
    user: createUserWithPermissions([ABSENCE_TYPES_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}
```

Tests mock Prisma methods (`findMany`, `findFirst`, `create`, `update`, `delete`) using `vi.fn()`.

### 7.2 Test Helpers: `apps/web/src/server/__tests__/helpers.ts`

Available helpers:
- `createMockUser(overrides)` -- creates ContextUser
- `createMockSession()` -- creates Session
- `createMockContext(overrides)` -- creates TRPCContext
- `createMockUserGroup(overrides)` -- creates UserGroup
- `createAdminUser(overrides)` -- creates admin user
- `createUserWithPermissions(permissionIds, overrides)` -- creates user with specific permissions
- `createMockTenant(overrides)` -- creates Tenant
- `createMockUserTenant(userId, tenantId, tenant?)` -- creates UserTenant join record

---

## 8. Key Differences Between Ticket Requirements and Existing Code

### 8.1 Field Mapping (Ticket Prisma vs Existing DB)

The ticket's Prisma schema mentions these fields:
- `affects_vacation` -- corresponds to existing `deducts_vacation` column
- `is_half_day_allowed` -- does NOT exist in the current DB schema
- `deleted_at` -- does NOT exist; table uses hard deletes
- `color` -- exists
- `calculation_rule_id` -- exists (migration 000047)
- `absence_type_group_id` -- exists (migration 000042)

Fields in existing DB but NOT in ticket's Prisma schema:
- `category` (VARCHAR(20))
- `portion` (INT)
- `holiday_code` (VARCHAR(10))
- `priority` (INT)
- `deducts_vacation` (BOOLEAN)
- `requires_document` (BOOLEAN)
- `sort_order` (INT)
- `is_system` (BOOLEAN)

### 8.2 Permission Differences

Ticket specifies `absence_types.read` and `absence_types.write` -- neither exists. Only `absence_types.manage` exists.

### 8.3 Delete Check

Ticket requires checking if AbsenceType is in use (absences exist). The Go handler does NOT do this check. The tRPC implementation should add this check using raw SQL against the `absence_days` table, following the pattern from `calculationRules.delete`:
```typescript
const result = await ctx.prisma.$queryRawUnsafe<[{ count: number }]>(
  `SELECT COUNT(*)::int as count FROM absence_days WHERE absence_type_id = $1`,
  input.id
)
```

---

## 9. Summary of Files Involved

### Go Backend (being replaced):
- `apps/api/internal/model/absencetype.go` -- AbsenceType model
- `apps/api/internal/repository/absencetype.go` -- CRUD repository
- `apps/api/internal/service/absence.go` -- service methods (CreateType, UpdateType, DeleteType, ListTypes, GetTypeByID, ValidateAbsenceType)
- `apps/api/internal/handler/absence.go` -- HTTP handlers (ListTypes, GetType, CreateType, UpdateType, DeleteType)
- `apps/api/internal/handler/routes.go` -- route registration (lines 514-535)
- `apps/api/gen/models/absence_type.go` -- generated OpenAPI model

### Frontend (to be migrated):
- `apps/web/src/hooks/api/use-absences.ts` -- useAbsenceTypes, useAbsenceType, useCreateAbsenceType, useUpdateAbsenceType, useDeleteAbsenceType
- `apps/web/src/hooks/api/index.ts` -- barrel exports
- `apps/web/src/app/[locale]/(dashboard)/admin/absence-types/page.tsx` -- admin page
- `apps/web/src/components/absence-types/absence-type-form-sheet.tsx` -- create/edit form
- `apps/web/src/components/absence-types/absence-type-detail-sheet.tsx` -- detail view
- `apps/web/src/components/absences/absence-request-form.tsx` -- uses absence types

### New tRPC files needed:
- `apps/web/src/server/routers/absenceTypes.ts` -- new tRPC router
- `apps/web/src/server/__tests__/absenceTypes-router.test.ts` -- new tests
- `apps/web/prisma/schema.prisma` -- add AbsenceType model
- `apps/web/src/server/root.ts` -- register new router
- `apps/web/src/hooks/api/use-absence-types.ts` -- new tRPC-based hooks (replacing parts of use-absences.ts)

### Existing tRPC reference implementations:
- `apps/web/src/server/routers/absenceTypeGroups.ts` -- closest pattern (same permission)
- `apps/web/src/server/routers/calculationRules.ts` -- has "in use" delete check pattern
- `apps/web/src/server/routers/bookingTypes.ts` -- has "in use" delete check pattern
- `apps/web/src/hooks/api/use-absence-type-groups.ts` -- tRPC hook pattern
