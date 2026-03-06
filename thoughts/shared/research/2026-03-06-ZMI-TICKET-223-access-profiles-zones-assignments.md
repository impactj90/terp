# ZMI-TICKET-223 Research: Access Profiles, Zones, Employee Access Assignments tRPC Routers

## 1. Go Business Logic to Port

### 1.1 Access Profile Service (`apps/api/internal/service/access_profile.go`, 143 lines)

**Service Methods:**

| Method | Signature | Logic |
|--------|-----------|-------|
| `Create` | `(ctx, CreateAccessProfileInput) -> (*AccessProfile, error)` | Validates code/name non-empty (trimmed). Checks code uniqueness per tenant via `GetByCode`. Creates with `IsActive=true`. |
| `GetByID` | `(ctx, id) -> (*AccessProfile, error)` | Simple lookup, returns `ErrAccessProfileNotFound` on miss. |
| `Update` | `(ctx, id, UpdateAccessProfileInput) -> (*AccessProfile, error)` | Fetches existing, applies partial updates (name, description, isActive). Code is NOT updatable. |
| `Delete` | `(ctx, id) -> error` | Checks existence, then calls `HasAssignments` on the repository (queries `employee_access_assignments` for `access_profile_id` references). Blocks deletion if in use (`ErrAccessProfileInUse`). |
| `List` | `(ctx, tenantID) -> ([]AccessProfile, error)` | Lists all profiles for tenant. Repository orders by `code ASC`. |

**Input Structs:**
- `CreateAccessProfileInput`: TenantID (uuid), Code (string), Name (string), Description (string)
- `UpdateAccessProfileInput`: Name (*string), Description (*string), IsActive (*bool) -- all optional pointers

**Errors:** `ErrAccessProfileNotFound`, `ErrAccessProfileCodeRequired`, `ErrAccessProfileNameRequired`, `ErrAccessProfileCodeExists`, `ErrAccessProfileInUse`

**Permission:** `access_control.manage` (from `routes.go` line 1329)

---

### 1.2 Access Zone Service (`apps/api/internal/service/access_zone.go`, 141 lines)

**Service Methods:**

| Method | Signature | Logic |
|--------|-----------|-------|
| `Create` | `(ctx, CreateAccessZoneInput) -> (*AccessZone, error)` | Validates code/name non-empty (trimmed). Checks code uniqueness per tenant via `GetByCode`. Sets `IsActive=true`. If `SortOrder` provided, applies it. |
| `GetByID` | `(ctx, id) -> (*AccessZone, error)` | Simple lookup, returns `ErrAccessZoneNotFound` on miss. |
| `Update` | `(ctx, id, UpdateAccessZoneInput) -> (*AccessZone, error)` | Fetches existing, applies partial updates (name, description, isActive, sortOrder). Code is NOT updatable. |
| `Delete` | `(ctx, id) -> error` | Checks existence, then hard deletes. No in-use check (unlike access profiles). |
| `List` | `(ctx, tenantID) -> ([]AccessZone, error)` | Lists all zones for tenant. Repository orders by `sort_order ASC, code ASC`. |

**Input Structs:**
- `CreateAccessZoneInput`: TenantID (uuid), Code (string), Name (string), Description (string), SortOrder (*int)
- `UpdateAccessZoneInput`: Name (*string), Description (*string), IsActive (*bool), SortOrder (*int) -- all optional pointers

**Errors:** `ErrAccessZoneNotFound`, `ErrAccessZoneCodeRequired`, `ErrAccessZoneNameRequired`, `ErrAccessZoneCodeExists`

**Permission:** `access_control.manage` (from `routes.go` line 1309)

---

### 1.3 Employee Access Assignment Service (`apps/api/internal/service/employee_access_assignment.go`, 121 lines)

**Service Methods:**

| Method | Signature | Logic |
|--------|-----------|-------|
| `Create` | `(ctx, CreateEmployeeAccessAssignmentInput) -> (*EmployeeAccessAssignment, error)` | Validates EmployeeID and AccessProfileID are non-nil UUIDs. Creates with `IsActive=true`. ValidFrom and ValidTo are optional. |
| `GetByID` | `(ctx, id) -> (*EmployeeAccessAssignment, error)` | Simple lookup (with Employee and AccessProfile preloaded in repository), returns `ErrEmployeeAccessAssignmentNotFound` on miss. |
| `Update` | `(ctx, id, UpdateEmployeeAccessAssignmentInput) -> (*EmployeeAccessAssignment, error)` | Fetches existing (with preloads), applies partial updates (validFrom, validTo, isActive). EmployeeID and AccessProfileID are NOT updatable. |
| `Delete` | `(ctx, id) -> error` | Checks existence, then hard deletes. |
| `List` | `(ctx, tenantID) -> ([]EmployeeAccessAssignment, error)` | Lists all for tenant (with Employee and AccessProfile preloaded). Repository orders by `created_at DESC`. |

**Input Structs:**
- `CreateEmployeeAccessAssignmentInput`: TenantID (uuid), EmployeeID (uuid), AccessProfileID (uuid), ValidFrom (*time.Time), ValidTo (*time.Time)
- `UpdateEmployeeAccessAssignmentInput`: ValidFrom (*time.Time), ValidTo (*time.Time), IsActive (*bool) -- all optional pointers

**Errors:** `ErrEmployeeAccessAssignmentNotFound`, `ErrEmployeeAccessAssignmentEmployeeRequired`, `ErrEmployeeAccessAssignmentProfileRequired`

**Permission:** `access_control.manage` (from `routes.go` line 1349)

---

## 2. Database Schema

### 2.1 `access_zones` Table (migration 000073)

```sql
CREATE TABLE access_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);
CREATE INDEX idx_access_zones_tenant ON access_zones(tenant_id);
```

### 2.2 `access_profiles` Table (migration 000073)

```sql
CREATE TABLE access_profiles (
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
CREATE INDEX idx_access_profiles_tenant ON access_profiles(tenant_id);
```

### 2.3 `employee_access_assignments` Table (migration 000073)

```sql
CREATE TABLE employee_access_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    access_profile_id UUID NOT NULL REFERENCES access_profiles(id) ON DELETE CASCADE,
    valid_from DATE,
    valid_to DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_employee_access_assignments_tenant ON employee_access_assignments(tenant_id);
CREATE INDEX idx_employee_access_assignments_employee ON employee_access_assignments(employee_id);
CREATE INDEX idx_employee_access_assignments_profile ON employee_access_assignments(access_profile_id);
```

All three tables have `update_updated_at_column()` triggers.

### 2.4 Prisma Schema Status

**NONE of these tables have Prisma models yet.** The following models need to be added to `apps/web/prisma/schema.prisma`:
- `AccessZone`
- `AccessProfile`
- `EmployeeAccessAssignment`

The tables already exist in the database (from Go migration 000073). The Prisma schema needs to be updated to describe them.

**Reverse relations needed on existing models:**
- `Tenant` model (line 81): add `accessZones AccessZone[]`, `accessProfiles AccessProfile[]`, `employeeAccessAssignments EmployeeAccessAssignment[]`
- `Employee` model (line 507): add `accessAssignments EmployeeAccessAssignment[]`

---

## 3. Existing Go Layers (Files to be Replaced)

### 3.1 Repository Layer

**AccessProfileRepository** (`apps/api/internal/repository/access_profile.go`, 91 lines):
- Uses `*DB` (GORM wrapper)
- Methods: `Create`, `GetByID`, `GetByCode`, `List`, `Update`, `Delete`, `HasAssignments`
- `GetByID`: Uses `First(&ap, "id = ?", id)`
- `GetByCode`: Filters by `tenant_id = ? AND code = ?`
- `List`: Orders by `code ASC`
- `HasAssignments`: Counts `EmployeeAccessAssignment` rows where `access_profile_id = ?`
- `Delete`: Hard delete with `RowsAffected == 0` check

**AccessZoneRepository** (`apps/api/internal/repository/access_zone.go`, 79 lines):
- Same GORM patterns as AccessProfile
- `List`: Orders by `sort_order ASC, code ASC`
- No `HasAssignments` check (zones can be freely deleted)

**EmployeeAccessAssignmentRepository** (`apps/api/internal/repository/employee_access_assignment.go`, 70 lines):
- `GetByID`: Preloads `Employee` and `AccessProfile` relations
- `List`: Preloads `Employee` and `AccessProfile`, orders by `created_at DESC`

### 3.2 Handler Layer

**AccessProfileHandler** (`apps/api/internal/handler/access_profile.go`, 178 lines):
- Uses generated models from `gen/models` package for request/response
- Request models: `CreateAccessProfileRequest`, `UpdateAccessProfileRequest`
- Response models: `AccessProfile`, `AccessProfileList`
- `accessProfileToResponse` maps Go model to generated response with `strfmt.UUID`, `strfmt.DateTime`
- Error handling via switch on service error sentinels

**AccessZoneHandler** (`apps/api/internal/handler/access_zone.go`, 185 lines):
- Same pattern as AccessProfile
- Also handles `SortOrder` field in create/update
- `accessZoneToResponse` maps SortOrder as `int64(az.SortOrder)`

**EmployeeAccessAssignmentHandler** (`apps/api/internal/handler/employee_access_assignment.go`, 208 lines):
- Parses `EmployeeID` and `AccessProfileID` from `strfmt.UUID` to `uuid.UUID`
- Handles `ValidFrom`/`ValidTo` as `strfmt.Date` (nullable)
- `employeeAccessAssignmentToResponse` includes `EmployeeID` and `AccessProfileID` as `strfmt.UUID`

### 3.3 Route Registration (`apps/api/internal/handler/routes.go`)

All three route groups are registered under the tenant-scoped router at lines 1307-1365:

```go
// RegisterAccessZoneRoutes (line 1307)
permManage := permissions.ID("access_control.manage").String()
r.Route("/access-zones", func(r chi.Router) {
    // GET /, POST /, GET /{id}, PATCH /{id}, DELETE /{id}
})

// RegisterAccessProfileRoutes (line 1327)
// Same permission, routes under /access-profiles

// RegisterEmployeeAccessAssignmentRoutes (line 1347)
// Same permission, routes under /employee-access-assignments
```

All use the same permission: `access_control.manage`.

### 3.4 Domain Models

**AccessProfile** (`apps/api/internal/model/access_profile.go`):
```go
type AccessProfile struct {
    ID          uuid.UUID
    TenantID    uuid.UUID
    Code        string    // varchar(50)
    Name        string    // varchar(255)
    Description string    // text
    IsActive    bool      // default:true
    CreatedAt   time.Time
    UpdatedAt   time.Time
}
```
Table: `access_profiles`

**AccessZone** (`apps/api/internal/model/access_zone.go`):
```go
type AccessZone struct {
    ID          uuid.UUID
    TenantID    uuid.UUID
    Code        string    // varchar(50)
    Name        string    // varchar(255)
    Description string    // text
    IsActive    bool      // default:true
    SortOrder   int       // default:0
    CreatedAt   time.Time
    UpdatedAt   time.Time
}
```
Table: `access_zones`

**EmployeeAccessAssignment** (`apps/api/internal/model/employee_access_assignment.go`):
```go
type EmployeeAccessAssignment struct {
    ID              uuid.UUID
    TenantID        uuid.UUID
    EmployeeID      uuid.UUID
    AccessProfileID uuid.UUID
    ValidFrom       *time.Time  // nullable date
    ValidTo         *time.Time  // nullable date
    IsActive        bool        // default:true
    CreatedAt       time.Time
    UpdatedAt       time.Time
    // Relations
    Employee        *Employee
    AccessProfile   *AccessProfile
}
```
Table: `employee_access_assignments`

---

## 4. OpenAPI Schema Definitions

From `api/schemas/access-control.yaml`:

**AccessZone response:** id, tenant_id, code, name, description (nullable), is_active, sort_order, created_at, updated_at

**CreateAccessZoneRequest:** code (required, 1-50), name (required, 1-255), description, sort_order

**UpdateAccessZoneRequest:** name (1-255), description, is_active, sort_order

**AccessProfile response:** id, tenant_id, code, name, description (nullable), is_active, created_at, updated_at

**CreateAccessProfileRequest:** code (required, 1-50), name (required, 1-255), description

**UpdateAccessProfileRequest:** name (1-255), description, is_active

**EmployeeAccessAssignment response:** id, tenant_id, employee_id, access_profile_id, valid_from (date, nullable), valid_to (date, nullable), is_active, created_at, updated_at

**CreateEmployeeAccessAssignmentRequest:** employee_id (required, uuid), access_profile_id (required, uuid), valid_from (date), valid_to (date)

**UpdateEmployeeAccessAssignmentRequest:** valid_from (date), valid_to (date), is_active

---

## 5. Existing tRPC Patterns (from Ticket 222)

### 5.1 Router Structure

Each router file follows this pattern (from `apps/web/src/server/routers/*.ts`):

```typescript
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

const RESOURCE_MANAGE = permissionIdByKey("resource.manage")!

// Output schemas (z.object)
const resourceOutputSchema = z.object({ ... })

// Input schemas (z.object)
const createResourceInputSchema = z.object({ ... })
const updateResourceInputSchema = z.object({ id: z.string().uuid(), ... })

// Router
export const resourceRouter = createTRPCRouter({
  list: tenantProcedure.use(requirePermission(...)).input(...).output(...).query(...),
  getById: tenantProcedure.use(requirePermission(...)).input(...).output(...).query(...),
  create: tenantProcedure.use(requirePermission(...)).input(...).output(...).mutation(...),
  update: tenantProcedure.use(requirePermission(...)).input(...).output(...).mutation(...),
  delete: tenantProcedure.use(requirePermission(...)).input(...).output(...).mutation(...),
})
```

### 5.2 Key Patterns

- **Procedure types:** `tenantProcedure` for all CRUD (provides auth + tenant)
- **Permission middleware:** `.use(requirePermission(PERM_ID))`
- **Tenant ID access:** `ctx.tenantId!` (non-null asserted)
- **User access:** `ctx.user.id` (guaranteed by protectedProcedure)
- **Prisma access:** `ctx.prisma.<model>.findMany/findFirst/create/update/delete`
- **Error throwing:** `throw new TRPCError({ code: "NOT_FOUND"|"BAD_REQUEST"|"CONFLICT", message: "..." })`
- **Delete output:** `z.object({ success: z.boolean() })` returning `{ success: true }`
- **List output:** `z.object({ data: z.array(outputSchema) })`
- **Partial updates:** Build `data: Record<string, unknown> = {}`, check each field with `if (input.field !== undefined)`
- **Uniqueness checks:** `prisma.model.findFirst({ where: { tenantId, uniqueField } })`
- **Existence checks:** `prisma.model.findFirst({ where: { id, tenantId } })` + throw NOT_FOUND

### 5.3 Permission Key

From `apps/web/src/server/lib/permission-catalog.ts` (line 183):
```typescript
p("access_control.manage", "access_control", "manage",
  "Manage access zones, profiles, and employee assignments")
```
This permission is already in the catalog. All three routers use the same permission.

### 5.4 Context (`apps/web/src/server/trpc.ts`)

```typescript
type TRPCContext = {
  prisma: PrismaClient
  authToken: string | null
  user: ContextUser | null
  session: Session | null
  tenantId: string | null
}
```

### 5.5 Router Registration (`apps/web/src/server/root.ts`)

Currently has 41 router entries. New routers need:
1. Import statement
2. Entry in the `createTRPCRouter({ ... })` map

---

## 6. Frontend Hooks to Migrate

### 6.1 Current REST Hooks (`apps/web/src/hooks/api/use-access-control.ts`, 105 lines)

The file currently uses `useApiQuery`/`useApiMutation` from `@/hooks` (REST-based).

| Hook | Current API Call | tRPC Equivalent |
|------|-----------------|-----------------|
| `useAccessZones(options)` | `GET /access-zones` | `trpc.accessZones.list.queryOptions()` |
| `useAccessZone(id)` | `GET /access-zones/{id}` | `trpc.accessZones.getById.queryOptions({ id })` |
| `useCreateAccessZone()` | `POST /access-zones` | `trpc.accessZones.create.mutationOptions()` |
| `useUpdateAccessZone()` | `PATCH /access-zones/{id}` | `trpc.accessZones.update.mutationOptions()` |
| `useDeleteAccessZone()` | `DELETE /access-zones/{id}` | `trpc.accessZones.delete.mutationOptions()` |
| `useAccessProfiles(options)` | `GET /access-profiles` | `trpc.accessProfiles.list.queryOptions()` |
| `useAccessProfile(id)` | `GET /access-profiles/{id}` | `trpc.accessProfiles.getById.queryOptions({ id })` |
| `useCreateAccessProfile()` | `POST /access-profiles` | `trpc.accessProfiles.create.mutationOptions()` |
| `useUpdateAccessProfile()` | `PATCH /access-profiles/{id}` | `trpc.accessProfiles.update.mutationOptions()` |
| `useDeleteAccessProfile()` | `DELETE /access-profiles/{id}` | `trpc.accessProfiles.delete.mutationOptions()` |
| `useEmployeeAccessAssignments(options)` | `GET /employee-access-assignments` | `trpc.employeeAccessAssignments.list.queryOptions()` |
| `useCreateEmployeeAccessAssignment()` | `POST /employee-access-assignments` | `trpc.employeeAccessAssignments.create.mutationOptions()` |
| `useUpdateEmployeeAccessAssignment()` | `PATCH /employee-access-assignments/{id}` | `trpc.employeeAccessAssignments.update.mutationOptions()` |
| `useDeleteEmployeeAccessAssignment()` | `DELETE /employee-access-assignments/{id}` | `trpc.employeeAccessAssignments.delete.mutationOptions()` |

### 6.2 Hook Export (`apps/web/src/hooks/api/index.ts`, lines 534-550)

All 14 hooks are already exported from the index. The exports reference `./use-access-control`. After migration, this import path stays the same -- only the internal implementation changes.

### 6.3 Frontend Components Using These Hooks

Three components import from `@/hooks/api`:
- `apps/web/src/components/access-control/zones-tab.tsx` -- uses `useAccessZones`, `useCreateAccessZone`, `useUpdateAccessZone`, `useDeleteAccessZone`
- `apps/web/src/components/access-control/profiles-tab.tsx` -- uses `useAccessProfiles`, `useCreateAccessProfile`, `useUpdateAccessProfile`, `useDeleteAccessProfile`
- `apps/web/src/components/access-control/assignments-tab.tsx` -- uses `useEmployeeAccessAssignments`, `useCreateEmployeeAccessAssignment`, `useUpdateEmployeeAccessAssignment`, `useDeleteEmployeeAccessAssignment`, `useAccessProfiles`, `useEmployees`

### 6.4 tRPC Hook Pattern (from Ticket 222)

From `apps/web/src/hooks/api/use-shift-planning.ts`:

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// Query hook
export function useShifts(options = {}) {
  const { enabled = true } = options
  const trpc = useTRPC()
  return useQuery(trpc.shifts.list.queryOptions(undefined, { enabled }))
}

// Single item query
export function useShift(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(trpc.shifts.getById.queryOptions({ id }, { enabled: enabled && !!id }))
}

// Mutation hooks
export function useCreateShift() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.shifts.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.shifts.list.queryKey() })
    },
  })
}
```

---

## 7. Implementation Plan

### 7.1 Prisma Schema Additions

Add to `apps/web/prisma/schema.prisma` (after last model, currently `EmployeeMessageRecipient` at line 2067):

**New models:**

1. `AccessZone` -- maps to `access_zones` table
   - Fields: id (UUID), tenantId, code (VarChar 50), name (VarChar 255), description (Text, nullable), isActive (Boolean, default true), sortOrder (Int, default 0), createdAt, updatedAt
   - Relations: tenant -> Tenant
   - Unique: `@@unique([tenantId, code])`
   - Index: `@@index([tenantId])`

2. `AccessProfile` -- maps to `access_profiles` table
   - Fields: id (UUID), tenantId, code (VarChar 50), name (VarChar 255), description (Text, nullable), isActive (Boolean, default true), createdAt, updatedAt
   - Relations: tenant -> Tenant, employeeAccessAssignments -> EmployeeAccessAssignment[]
   - Unique: `@@unique([tenantId, code])`
   - Index: `@@index([tenantId])`

3. `EmployeeAccessAssignment` -- maps to `employee_access_assignments` table
   - Fields: id (UUID), tenantId, employeeId, accessProfileId, validFrom (Date, nullable), validTo (Date, nullable), isActive (Boolean, default true), createdAt, updatedAt
   - Relations: tenant -> Tenant, employee -> Employee, accessProfile -> AccessProfile
   - Indexes: `@@index([tenantId])`, `@@index([employeeId])`, `@@index([accessProfileId])`

**Reverse relations to add on existing models:**
- `Tenant` model (line 143, before `@@index` block): add `accessZones AccessZone[]`, `accessProfiles AccessProfile[]`, `employeeAccessAssignments EmployeeAccessAssignment[]`
- `Employee` model (line 591, after `messageRecipients`): add `accessAssignments EmployeeAccessAssignment[]`

### 7.2 tRPC Router Files to Create

1. **`apps/web/src/server/routers/accessZones.ts`** -- Access Zone CRUD (5 procedures)
   - `list`: Query, returns `{ data: AccessZone[] }`, ordered by sortOrder ASC, code ASC
   - `getById`: Query, returns single AccessZone
   - `create`: Mutation, validates code/name non-empty, code uniqueness per tenant
   - `update`: Mutation, partial update (name, description, isActive, sortOrder), code NOT updatable
   - `delete`: Mutation, hard delete (no in-use check)

2. **`apps/web/src/server/routers/accessProfiles.ts`** -- Access Profile CRUD (5 procedures)
   - `list`: Query, returns `{ data: AccessProfile[] }`, ordered by code ASC
   - `getById`: Query, returns single AccessProfile
   - `create`: Mutation, validates code/name non-empty, code uniqueness per tenant
   - `update`: Mutation, partial update (name, description, isActive), code NOT updatable
   - `delete`: Mutation, checks if profile has assignments (`employeeAccessAssignment.count`), blocks if in use

3. **`apps/web/src/server/routers/employeeAccessAssignments.ts`** -- Employee Access Assignment CRUD (5 procedures)
   - `list`: Query, returns `{ data: EmployeeAccessAssignment[] }`, ordered by createdAt DESC
   - `getById`: Query, returns single assignment
   - `create`: Mutation, validates employeeId and accessProfileId non-empty/exist, validates FK references
   - `update`: Mutation, partial update (validFrom, validTo, isActive), employeeId/accessProfileId NOT updatable
   - `delete`: Mutation, hard delete

### 7.3 Router Registration

Update `apps/web/src/server/root.ts`:
```typescript
import { accessZonesRouter } from "./routers/accessZones"
import { accessProfilesRouter } from "./routers/accessProfiles"
import { employeeAccessAssignmentsRouter } from "./routers/employeeAccessAssignments"

// Add to appRouter:
accessZones: accessZonesRouter,
accessProfiles: accessProfilesRouter,
employeeAccessAssignments: employeeAccessAssignmentsRouter,
```

### 7.4 Frontend Hook Migration

Replace `apps/web/src/hooks/api/use-access-control.ts` content from REST-based (`useApiQuery`/`useApiMutation`) to tRPC-based (`useTRPC` from `@/trpc`). All existing hook names and signatures remain the same. Invalidation keys change from REST paths to tRPC query keys.

---

## 8. Key Implementation Notes

### 8.1 Access Zone-Specific Notes

- **SortOrder field:** AccessZone has a `sortOrder` field that AccessProfile does not. The create input accepts optional `sortOrder`, defaulting to 0.
- **List ordering:** `sort_order ASC, code ASC` (from repository line 58)
- **No in-use check on delete:** Unlike AccessProfile, zones can be freely deleted
- **Code uniqueness:** `UNIQUE(tenant_id, code)` constraint at DB level

### 8.2 Access Profile-Specific Notes

- **HasAssignments check:** Before deletion, the Go service checks if any `employee_access_assignments` reference the profile. In tRPC:
  ```typescript
  const count = await ctx.prisma.employeeAccessAssignment.count({
    where: { accessProfileId: input.id },
  })
  if (count > 0) {
    throw new TRPCError({ code: "CONFLICT", message: "Access profile is in use by employee assignments and cannot be deleted" })
  }
  ```
- **Code uniqueness:** `UNIQUE(tenant_id, code)` constraint at DB level
- **List ordering:** `code ASC` (from repository line 58)

### 8.3 Employee Access Assignment-Specific Notes

- **Validity periods:** `validFrom` and `validTo` are optional `Date` fields (not DateTime). In Zod:
  ```typescript
  validFrom: z.string().date().optional(),  // or z.coerce.date().optional()
  validTo: z.string().date().optional(),
  ```
- **FK validation:** The Go handler validates `EmployeeID` and `AccessProfileID` by parsing UUID strings. In tRPC, Zod handles UUID validation. Additionally, the create mutation should verify that the referenced employee and access profile exist in the same tenant.
- **Preloaded relations:** The Go repository preloads `Employee` and `AccessProfile` on `GetByID` and `List`. In Prisma:
  ```typescript
  include: { employee: true, accessProfile: true }
  ```
  The tRPC output schema should optionally include employee and accessProfile data if the frontend needs it. The current REST response only includes IDs (not full objects), but the repository preloads them for potential handler use.
- **List ordering:** `created_at DESC` (from repository line 49)
- **No uniqueness constraint on (employee_id, access_profile_id):** The DB schema allows multiple assignments of the same profile to the same employee (for different validity periods).

### 8.4 Date Handling Notes

- The `valid_from` and `valid_to` columns are `DATE` type (not `TIMESTAMPTZ`). In Prisma: `@db.Date`.
- The Go handler uses `strfmt.Date` for these fields and checks `!time.Time(req.ValidFrom).IsZero()` before setting.
- In the tRPC output schema, these should be `z.date().nullable()` or `z.string().nullable()` depending on how Prisma returns Date fields.

### 8.5 General Patterns to Follow

1. Use `tenantProcedure` for all procedures (provides auth + tenant)
2. Use `.use(requirePermission(ACCESS_CONTROL_MANAGE))` for permission checks
3. Follow the exact same validation logic as the Go service methods
4. Map Prisma records to output schemas explicitly (as done in shifts.ts, macros.ts)
5. Use `TRPCError` with appropriate codes: `NOT_FOUND`, `BAD_REQUEST`, `CONFLICT`
6. Follow naming convention: camelCase for procedure names (list, getById, create, update, delete)
7. Delete operations return `{ success: true }`

---

## 9. Test Structure

### 9.1 Test Pattern (from `apps/web/src/server/__tests__/systemSettings-router.test.ts`)

```typescript
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "../trpc"
import { accessZonesRouter } from "../routers/accessZones"
import { permissionIdByKey } from "../lib/permission-catalog"
import { createMockContext, createMockSession, createUserWithPermissions, createMockUserTenant } from "./helpers"

const ACCESS_CONTROL_MANAGE = permissionIdByKey("access_control.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(accessZonesRouter)

// Mock Prisma and create test context with/without permissions
function createTestContext(prisma: Record<string, unknown>) { ... }
function createNoPermContext(prisma: Record<string, unknown>) { ... }

// Test each procedure: happy path, permission denied, not found, validation errors
```

### 9.2 Test Files to Create

1. `apps/web/src/server/__tests__/accessZones-router.test.ts`
2. `apps/web/src/server/__tests__/accessProfiles-router.test.ts`
3. `apps/web/src/server/__tests__/employeeAccessAssignments-router.test.ts`

---

## 10. File Inventory

### 10.1 Files to Create

| File | Description |
|------|-------------|
| `apps/web/src/server/routers/accessZones.ts` | Access Zones tRPC router (5 procedures) |
| `apps/web/src/server/routers/accessProfiles.ts` | Access Profiles tRPC router (5 procedures) |
| `apps/web/src/server/routers/employeeAccessAssignments.ts` | Employee Access Assignments tRPC router (5 procedures) |
| `apps/web/src/server/__tests__/accessZones-router.test.ts` | Tests for access zones router |
| `apps/web/src/server/__tests__/accessProfiles-router.test.ts` | Tests for access profiles router |
| `apps/web/src/server/__tests__/employeeAccessAssignments-router.test.ts` | Tests for employee access assignments router |

### 10.2 Files to Modify

| File | Change |
|------|--------|
| `apps/web/prisma/schema.prisma` | Add 3 new models (AccessZone, AccessProfile, EmployeeAccessAssignment) + reverse relations on Tenant and Employee |
| `apps/web/src/server/root.ts` | Import and register 3 new routers |
| `apps/web/src/hooks/api/use-access-control.ts` | Rewrite from REST to tRPC hooks (same export signatures) |

### 10.3 Existing Go Files (reference only, not modified)

| File | Lines |
|------|-------|
| `apps/api/internal/service/access_profile.go` | 143 |
| `apps/api/internal/handler/access_profile.go` | 178 |
| `apps/api/internal/repository/access_profile.go` | 91 |
| `apps/api/internal/service/access_zone.go` | 141 |
| `apps/api/internal/handler/access_zone.go` | 185 |
| `apps/api/internal/repository/access_zone.go` | 79 |
| `apps/api/internal/service/employee_access_assignment.go` | 121 |
| `apps/api/internal/handler/employee_access_assignment.go` | 208 |
| `apps/api/internal/repository/employee_access_assignment.go` | 70 |
| `apps/api/internal/model/access_profile.go` | 24 |
| `apps/api/internal/model/access_zone.go` | 25 |
| `apps/api/internal/model/employee_access_assignment.go` | 29 |
