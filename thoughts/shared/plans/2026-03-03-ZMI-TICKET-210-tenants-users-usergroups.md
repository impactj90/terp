# ZMI-TICKET-210 Implementation Plan: Tenants, Users, User Groups tRPC Routers

## Overview

Port the Go Tenant, User, and UserGroup services to tRPC routers with Prisma, plus migrate all legacy frontend hooks to tRPC. This ticket replaces ~2,500 lines of Go code (services + handlers + repositories) with ~3 tRPC router files and ~4 frontend hook files.

### Dependencies (all already implemented)

- **ZMI-TICKET-200**: Prisma schema (User, Tenant, UserGroup, UserTenant models)
- **ZMI-TICKET-201**: tRPC server setup (`createTRPCRouter`, `publicProcedure`, `protectedProcedure`, `tenantProcedure`)
- **ZMI-TICKET-202**: Supabase Auth (`createAdminClient` for password changes)
- **ZMI-TICKET-203**: Authorization middleware (`requirePermission`, `requireSelfOrPermission`)

### Files to Create

| File | Purpose |
|------|---------|
| `apps/web/src/server/routers/tenants.ts` | Tenants tRPC router |
| `apps/web/src/server/routers/users.ts` | Users tRPC router |
| `apps/web/src/server/routers/userGroups.ts` | UserGroups tRPC router |

### Files to Modify

| File | Change |
|------|--------|
| `apps/web/src/server/root.ts` | Register 3 new routers |
| `apps/web/src/hooks/api/use-tenants.ts` | Rewrite to use tRPC |
| `apps/web/src/hooks/api/use-user.ts` | Rewrite to use tRPC |
| `apps/web/src/hooks/api/use-users.ts` | Rewrite to use tRPC |
| `apps/web/src/hooks/api/use-user-groups.ts` | Rewrite to use tRPC |

---

## Phase 1: Tenants Router

### 1.1 Create `apps/web/src/server/routers/tenants.ts`

**Pattern to follow**: Auth router (`apps/web/src/server/routers/auth.ts`)

#### Imports

```typescript
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, protectedProcedure, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
```

#### Permission Constants

```typescript
const TENANTS_MANAGE = permissionIdByKey("tenants.manage")!
```

#### Zod Schemas

Define output and input schemas at the top of the file (matching the pattern from `auth.ts`):

```typescript
// --- Enums ---
const vacationBasisEnum = z.enum(["calendar_year", "entry_date"])

// --- Output ---
const tenantOutputSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  isActive: z.boolean().nullable(),
  addressStreet: z.string().nullable(),
  addressZip: z.string().nullable(),
  addressCity: z.string().nullable(),
  addressCountry: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  payrollExportBasePath: z.string().nullable(),
  notes: z.string().nullable(),
  vacationBasis: z.string(),
  settings: z.unknown().nullable(),
  createdAt: z.date().nullable(),
  updatedAt: z.date().nullable(),
})

// --- Input: Create ---
const createTenantInputSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(3, "Slug must be at least 3 characters"),
  addressStreet: z.string().min(1, "Street is required"),
  addressZip: z.string().min(1, "ZIP is required"),
  addressCity: z.string().min(1, "City is required"),
  addressCountry: z.string().min(1, "Country is required"),
  phone: z.string().nullish(),
  email: z.string().email().nullish(),
  payrollExportBasePath: z.string().nullish(),
  notes: z.string().nullish(),
  vacationBasis: vacationBasisEnum.optional().default("calendar_year"),
})

// --- Input: Update ---
const updateTenantInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  addressStreet: z.string().min(1).optional(),
  addressZip: z.string().min(1).optional(),
  addressCity: z.string().min(1).optional(),
  addressCountry: z.string().min(1).optional(),
  phone: z.string().nullish(),
  email: z.string().email().nullish(),
  payrollExportBasePath: z.string().nullish(),
  notes: z.string().nullish(),
  vacationBasis: vacationBasisEnum.optional(),
  isActive: z.boolean().optional(),
})
```

#### Procedures

**`tenants.list`** (query)
- Procedure base: `protectedProcedure` (NOT tenantProcedure -- listing tenants does not require a tenant context)
- Input: optional `{ name?: string, active?: boolean }` filter
- Logic (port from Go `TenantHandler.List` + `TenantService.ListForUser`):
  1. Get `ctx.user.id`
  2. Query `prisma.userTenant.findMany({ where: { userId }, include: { tenant: true } })`
  3. Extract tenants from results
  4. Apply optional name filter (case-insensitive contains) on the returned list
  5. Apply optional active filter
  6. Return tenant array
- Output: `z.array(tenantOutputSchema)`

**`tenants.getById`** (query)
- Procedure base: `protectedProcedure` then `.use(requirePermission(TENANTS_MANAGE))`
- Input: `{ id: string }`
- Logic:
  1. `prisma.tenant.findUnique({ where: { id: input.id } })`
  2. Throw `NOT_FOUND` if null
- Output: `tenantOutputSchema`

**`tenants.create`** (mutation)
- Procedure base: `protectedProcedure` then `.use(requirePermission(TENANTS_MANAGE))`
- Input: `createTenantInputSchema`
- Logic (port from Go `TenantService.Create` lines 79-134):
  1. Normalize: `slug = input.slug.trim().toLowerCase()`, `name = input.name.trim()`
  2. Re-validate after trim: slug >= 3 chars, name non-empty
  3. Validate address fields are non-empty after trim
  4. Check slug uniqueness: `prisma.tenant.findUnique({ where: { slug } })` -- throw `CONFLICT` if exists
  5. Validate vacationBasis enum
  6. Normalize optional strings (trim, set null if empty)
  7. `prisma.tenant.create({ data: { ... } })` with `isActive: true`
  8. **Auto-add creator to tenant**: `prisma.userTenant.upsert({ where: { userId_tenantId: { userId: ctx.user.id, tenantId: tenant.id } }, create: { userId: ctx.user.id, tenantId: tenant.id, role: "owner" }, update: {} })`
  9. Return created tenant
- Output: `tenantOutputSchema`
- Error mapping:
  - Slug exists -> `CONFLICT` ("Tenant slug already exists")
  - Invalid slug -> `BAD_REQUEST`
  - Invalid name -> `BAD_REQUEST`
  - Invalid address -> `BAD_REQUEST`
  - Invalid vacation basis -> `BAD_REQUEST`

**`tenants.update`** (mutation)
- Procedure base: `protectedProcedure` then `.use(requirePermission(TENANTS_MANAGE))`
- Input: `updateTenantInputSchema`
- Logic (port from Go `TenantService.Update` lines 155-215):
  1. Fetch tenant: `prisma.tenant.findUnique({ where: { id: input.id } })`, throw `NOT_FOUND` if null
  2. Build `data` object with only provided fields (skip undefined)
  3. For each provided field: trim, validate non-empty where required
  4. Normalize optional strings (phone, email, etc.)
  5. Validate vacationBasis if provided
  6. `prisma.tenant.update({ where: { id: input.id }, data })`
  7. Return updated tenant
- Output: `tenantOutputSchema`

**`tenants.deactivate`** (mutation)
- Procedure base: `protectedProcedure` then `.use(requirePermission(TENANTS_MANAGE))`
- Input: `{ id: string }`
- Logic (port from Go `TenantService.Deactivate` lines 223-230):
  1. Fetch tenant, throw `NOT_FOUND` if null
  2. `prisma.tenant.update({ where: { id: input.id }, data: { isActive: false } })`
  3. Return `{ success: true }`
- Output: `z.object({ success: z.boolean() })`

### 1.2 Register Router

Modify `apps/web/src/server/root.ts`:

```typescript
import { tenantsRouter } from "./routers/tenants"

export const appRouter = createTRPCRouter({
  health: healthRouter,
  auth: authRouter,
  permissions: permissionsRouter,
  tenants: tenantsRouter,   // new
})
```

### 1.3 Verification Criteria

- [ ] `tenants.list` returns only tenants the user has access to (via `userTenants`)
- [ ] `tenants.list` does NOT require `tenants.manage` permission
- [ ] `tenants.list` supports optional `name` and `active` filters
- [ ] `tenants.create` validates slug (lowercase, >= 3 chars), name, address fields
- [ ] `tenants.create` checks slug uniqueness and returns CONFLICT if exists
- [ ] `tenants.create` auto-adds the creating user to the tenant with role "owner"
- [ ] `tenants.create` defaults vacationBasis to "calendar_year"
- [ ] `tenants.update` only updates provided fields (partial update)
- [ ] `tenants.deactivate` sets `isActive = false` (soft delete)
- [ ] All mutating operations require `tenants.manage` permission
- [ ] TypeScript compiles without errors

---

## Phase 2: User Groups Router

Implemented before Users because Users depends on UserGroup lookups (role promotion on group assignment).

### 2.1 Create `apps/web/src/server/routers/userGroups.ts`

#### Imports

```typescript
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey, lookupPermission } from "../lib/permission-catalog"
```

#### Permission Constants

```typescript
const USERS_MANAGE = permissionIdByKey("users.manage")!
```

Note: The Go backend uses `users.manage` for all UserGroup operations. The ticket mentions `user_groups.read` and `user_groups.write` but these permissions do NOT exist in the permission catalog (only 46 permissions, none for `user_groups.*`). **Use `users.manage` to match the Go backend.**

#### Zod Schemas

```typescript
const permissionOutputSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  resource: z.string(),
  action: z.string(),
  description: z.string(),
})

const userGroupOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  name: z.string(),
  code: z.string(),
  description: z.string().nullable(),
  permissions: z.array(permissionOutputSchema),  // resolved permissions, not raw UUIDs
  isAdmin: z.boolean().nullable(),
  isSystem: z.boolean().nullable(),
  isActive: z.boolean(),
  createdAt: z.date().nullable(),
  updatedAt: z.date().nullable(),
})

const createUserGroupInputSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().optional(),  // defaults to uppercased name if empty
  description: z.string().optional(),
  permissions: z.array(z.string().uuid()).default([]),
  isAdmin: z.boolean().default(false),
  isActive: z.boolean().default(true),
})

const updateUserGroupInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  description: z.string().optional(),
  permissions: z.array(z.string().uuid()).optional(),
  isAdmin: z.boolean().optional(),
  isActive: z.boolean().optional(),
})
```

#### Helper Functions

```typescript
/**
 * Resolve permission UUIDs from JSONB to full permission objects.
 * Mirrors Go's mapUserGroupToResponse (response.go lines 108-158).
 */
function resolvePermissionIds(permissionsJson: unknown): z.infer<typeof permissionOutputSchema>[] {
  const ids = (permissionsJson as string[] | null) ?? []
  return ids
    .map((id) => lookupPermission(id))
    .filter(Boolean)
    .map((p) => ({
      id: p!.id,
      key: p!.key,
      resource: p!.resource,
      action: p!.action,
      description: p!.description,
    }))
}

/**
 * Validate all permission IDs exist in the catalog.
 * Mirrors Go's validatePermissionIDs (usergroup.go lines 281-288).
 */
function validatePermissionIds(ids: string[]): void {
  for (const id of ids) {
    if (!lookupPermission(id)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Invalid permission ID: ${id}`,
      })
    }
  }
}
```

#### Procedures

**`userGroups.list`** (query)
- Procedure base: `tenantProcedure.use(requirePermission(USERS_MANAGE))`
- Input: optional `{ active?: boolean }`
- Logic (port from Go `UserGroupService.List` lines 251-256):
  1. Build where clause: `{ OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] }` (include system groups)
  2. If `active` filter provided: add `isActive` to where clause
  3. `prisma.userGroup.findMany({ where, orderBy: [{ isSystem: "desc" }, { name: "asc" }] })`
  4. Map each group through `resolvePermissionIds` for the permissions field
- Output: `z.object({ data: z.array(userGroupOutputSchema) })`

**`userGroups.getById`** (query)
- Procedure base: `tenantProcedure.use(requirePermission(USERS_MANAGE))`
- Input: `{ id: string }`
- Logic:
  1. `prisma.userGroup.findUnique({ where: { id: input.id }, include: { _count: { select: { users: true } } } })`
  2. Throw `NOT_FOUND` if null
  3. Resolve permissions
- Output: `userGroupOutputSchema.extend({ usersCount: z.number() })`

**`userGroups.create`** (mutation)
- Procedure base: `tenantProcedure.use(requirePermission(USERS_MANAGE))`
- Input: `createUserGroupInputSchema`
- Logic (port from Go `UserGroupService.Create` lines 64-125):
  1. `name = input.name.trim()`, validate non-empty
  2. `code = (input.code?.trim() || name).toUpperCase()`, validate non-empty
  3. Check name uniqueness within tenant (include system groups: `OR: [{ tenantId }, { tenantId: null }]`):
     ```typescript
     const existingByName = await ctx.prisma.userGroup.findFirst({
       where: { name, OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] }
     })
     ```
     Throw `CONFLICT` if exists
  4. Check code uniqueness (same pattern)
  5. Validate all permission IDs via `validatePermissionIds(input.permissions)`
  6. Create with `isSystem: false`
  7. Resolve permissions for response
- Output: `userGroupOutputSchema`
- Error mapping:
  - Name exists -> `CONFLICT`
  - Code exists -> `CONFLICT`
  - Invalid permission -> `BAD_REQUEST`

**`userGroups.update`** (mutation)
- Procedure base: `tenantProcedure.use(requirePermission(USERS_MANAGE))`
- Input: `updateUserGroupInputSchema`
- Logic (port from Go `UserGroupService.Update` lines 147-233):
  1. Fetch group, throw `NOT_FOUND` if null
  2. Check `isSystem` -- throw `FORBIDDEN` ("Cannot modify system group") if true
  3. Store `previousIsAdmin = group.isAdmin`
  4. If name changed: trim, validate, check uniqueness
  5. If code changed: uppercase, trim, validate, check uniqueness
  6. If permissions provided: validate all IDs
  7. Build update data object
  8. `prisma.userGroup.update({ where: { id }, data })`
  9. **If isAdmin changed**: cascade role update to all users in this group:
     ```typescript
     if (input.isAdmin !== undefined && (previousIsAdmin ?? false) !== input.isAdmin) {
       const newRole = input.isAdmin ? "admin" : "user"
       await ctx.prisma.user.updateMany({
         where: { userGroupId: input.id },
         data: { role: newRole },
       })
     }
     ```
  10. Resolve permissions for response
- Output: `userGroupOutputSchema`

**`userGroups.delete`** (mutation)
- Procedure base: `tenantProcedure.use(requirePermission(USERS_MANAGE))`
- Input: `{ id: string }`
- Logic (port from Go `UserGroupService.Delete` lines 236-248):
  1. Fetch group, throw `NOT_FOUND` if null
  2. Check `isSystem` -- throw `FORBIDDEN` ("Cannot delete system group") if true
  3. `prisma.userGroup.delete({ where: { id: input.id } })`
  4. Return `{ success: true }`
- Output: `z.object({ success: z.boolean() })`

### 2.2 Register Router

Add to `apps/web/src/server/root.ts`:

```typescript
import { userGroupsRouter } from "./routers/userGroups"

export const appRouter = createTRPCRouter({
  // ... existing
  userGroups: userGroupsRouter,
})
```

### 2.3 Verification Criteria

- [ ] `userGroups.list` includes system groups (tenantId IS NULL) alongside tenant groups
- [ ] `userGroups.list` orders by isSystem DESC, name ASC
- [ ] `userGroups.list` supports optional `active` filter
- [ ] `userGroups.create` defaults code to uppercased name if not provided
- [ ] `userGroups.create` validates all permission IDs against catalog
- [ ] `userGroups.create` checks name and code uniqueness within tenant (including system groups)
- [ ] `userGroups.update` rejects modifications to system groups
- [ ] `userGroups.update` cascades isAdmin change to all users in the group (role update)
- [ ] `userGroups.delete` rejects deletion of system groups
- [ ] Permissions in response are resolved to full objects (id, key, resource, action, description)
- [ ] All operations require `users.manage` permission
- [ ] TypeScript compiles without errors

---

## Phase 3: Users Router

### 3.1 Create `apps/web/src/server/routers/users.ts`

#### Imports

```typescript
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission, requireSelfOrPermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
import { isUserAdmin } from "../lib/permissions"
import { createAdminClient } from "@/lib/supabase/admin"
```

#### Permission Constants

```typescript
const USERS_MANAGE = permissionIdByKey("users.manage")!
```

#### Zod Schemas

```typescript
const dataScopeTypeEnum = z.enum(["all", "tenant", "department", "employee"])

const userOutputSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  role: z.string(),
  tenantId: z.string().uuid().nullable(),
  userGroupId: z.string().uuid().nullable(),
  employeeId: z.string().uuid().nullable(),
  username: z.string().nullable(),
  ssoId: z.string().nullable(),
  isActive: z.boolean().nullable(),
  isLocked: z.boolean(),
  dataScopeType: z.string(),
  dataScopeTenantIds: z.array(z.string()),
  dataScopeDepartmentIds: z.array(z.string()),
  dataScopeEmployeeIds: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const userWithRelationsOutputSchema = userOutputSchema.extend({
  tenant: z.object({ id: z.string(), name: z.string(), slug: z.string() }).nullable(),
  userGroup: z.object({ id: z.string(), name: z.string(), code: z.string() }).nullable(),
  employee: z.object({ id: z.string(), firstName: z.string(), lastName: z.string() }).nullable(),
})

const createUserInputSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1),
  tenantId: z.string().uuid().optional(),  // fallback to ctx.tenantId
  username: z.string().optional(),
  userGroupId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  password: z.string().optional(),
  ssoId: z.string().optional(),
  isActive: z.boolean().optional().default(true),
  isLocked: z.boolean().optional().default(false),
  dataScopeType: dataScopeTypeEnum.optional().default("all"),
  dataScopeTenantIds: z.array(z.string().uuid()).optional().default([]),
  dataScopeDepartmentIds: z.array(z.string().uuid()).optional().default([]),
  dataScopeEmployeeIds: z.array(z.string().uuid()).optional().default([]),
})

const updateUserInputSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1).optional(),
  avatarUrl: z.string().nullable().optional(),
  userGroupId: z.string().uuid().nullable().optional(),
  username: z.string().nullable().optional(),
  employeeId: z.string().uuid().nullable().optional(),
  ssoId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  isLocked: z.boolean().optional(),
  dataScopeType: dataScopeTypeEnum.optional(),
  dataScopeTenantIds: z.array(z.string().uuid()).optional(),
  dataScopeDepartmentIds: z.array(z.string().uuid()).optional(),
  dataScopeEmployeeIds: z.array(z.string().uuid()).optional(),
})

const changePasswordInputSchema = z.object({
  userId: z.string().uuid(),
  newPassword: z.string().min(1, "New password is required"),
})
```

#### Helper: Admin-Only Fields Check

```typescript
/**
 * Fields that require admin/users.manage to modify.
 * Mirrors Go user.go lines 231-247.
 */
const ADMIN_ONLY_FIELDS = [
  "userGroupId", "isActive", "isLocked",
  "dataScopeType", "dataScopeTenantIds", "dataScopeDepartmentIds", "dataScopeEmployeeIds",
  "ssoId", "employeeId", "username",
] as const

function hasAdminOnlyFields(input: Record<string, unknown>): boolean {
  return ADMIN_ONLY_FIELDS.some((field) => input[field] !== undefined)
}
```

#### Procedures

**`users.list`** (query)
- Procedure base: `tenantProcedure.use(requirePermission(USERS_MANAGE))`
- Input: `{ search?: string, limit?: number }` with defaults `limit = 20`
- Logic (port from Go `UserService.List` + `UserHandler.List`):
  1. Clamp limit: `Math.min(Math.max(input.limit ?? 20, 1), 100)`
  2. Build where clause with tenant filter: `{ tenantId: ctx.tenantId }`
  3. If search provided: add `OR` condition on `email`, `displayName`, `username` (case-insensitive contains)
  4. Query users with count:
     ```typescript
     const [users, total] = await Promise.all([
       ctx.prisma.user.findMany({ where, take: limit, orderBy: { createdAt: "desc" } }),
       ctx.prisma.user.count({ where }),
     ])
     ```
  5. Return `{ data: users, meta: { total, limit } }`
- Output: `z.object({ data: z.array(userOutputSchema), meta: z.object({ total: z.number(), limit: z.number() }) })`

**`users.getById`** (query)
- Procedure base: `tenantProcedure.use(requirePermission(USERS_MANAGE))`
- Input: `{ id: string }`
- Logic:
  1. `prisma.user.findUnique({ where: { id }, include: { tenant: true, userGroup: true, employee: true } })`
  2. Throw `NOT_FOUND` if null
  3. Map to response with relations
- Output: `userWithRelationsOutputSchema`

**`users.create`** (mutation)
- Procedure base: `tenantProcedure.use(requirePermission(USERS_MANAGE))`
- Input: `createUserInputSchema`
- Logic (port from Go `UserService.CreateUser` lines 386-465):
  1. Determine tenantId: `input.tenantId ?? ctx.tenantId`
  2. Set defaults: `role = "user"`, `isActive = input.isActive ?? true`, `isLocked = input.isLocked ?? false`
  3. Validate dataScopeType (already validated by Zod enum)
  4. If `input.userGroupId` provided:
     - Fetch group: `prisma.userGroup.findUnique({ where: { id: input.userGroupId } })`
     - Throw `BAD_REQUEST` ("User group not found") if null
     - If `group.isAdmin`: set `role = "admin"`
  5. Handle password: if provided, hash with bcrypt (`bcryptjs` or Supabase admin). **Decision**: Since Supabase manages auth, use Supabase admin API to create user if needed. For the DB record, the Go backend stores `passwordHash` -- keep this behavior for backward compatibility. Use `bcryptjs` for hashing if password is provided.
     - **Alternative**: Skip password hashing entirely -- just store null. Password management goes through Supabase. The `password` field in the create input can be used to set the Supabase user password via admin API if a Supabase user needs to be created alongside.
     - **Recommendation**: For now, if password is provided, use `bcrypt.hash(password, 10)` from `bcryptjs` to set `passwordHash`. This maintains backward compatibility.
  6. Normalize optional strings (username, ssoId -- trim, set null/undefined if empty)
  7. Create user: `prisma.user.create({ data: { ... } })`
  8. **Auto-add to tenant**: `prisma.userTenant.upsert({ where: { userId_tenantId: { userId: user.id, tenantId } }, create: { userId: user.id, tenantId, role: "member" }, update: {} })`
  9. Return created user
- Output: `userOutputSchema`

**`users.update`** (mutation)
- Procedure base: `tenantProcedure.use(requireSelfOrPermission((input) => (input as { id: string }).id, USERS_MANAGE))`
- Input: `updateUserInputSchema`
- Logic (port from Go `UserService.Update` lines 209-346):
  1. Fetch target user, throw `NOT_FOUND` if null
  2. Check admin-only fields: if any admin-only field is being set AND the requester is NOT the target AND requester doesn't have `users.manage` AND isn't admin -> throw `FORBIDDEN`
     ```typescript
     const isSelf = ctx.user.id === input.id
     const canManage = hasPermission(ctx.user, USERS_MANAGE) || isUserAdmin(ctx.user)
     if (hasAdminOnlyFields(input) && !canManage) {
       throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions for admin fields" })
     }
     ```
  3. Build Prisma `data` update object from provided fields:
     - `displayName`: validate non-empty after trim
     - `avatarUrl`: set to null or string value
     - `userGroupId`: if null, set to null and role to "user". If UUID, look up group; if `group.isAdmin`, set role to "admin", else "user"
     - `username`: set to null or trimmed value
     - `employeeId`: set to null or UUID value
     - `ssoId`: set to null or value
     - `isActive`, `isLocked`: direct set
     - `dataScopeType`: validate enum
     - `dataScopeTenantIds`, `dataScopeDepartmentIds`, `dataScopeEmployeeIds`: direct set
  4. `prisma.user.update({ where: { id: input.id }, data })`
  5. Return updated user
- Output: `userOutputSchema`

**`users.delete`** (mutation)
- Procedure base: `tenantProcedure.use(requirePermission(USERS_MANAGE))`
- Input: `{ id: string }`
- Logic (port from Go `UserService.Delete` lines 349-371):
  1. Cannot delete self: if `ctx.user.id === input.id`, throw `FORBIDDEN` ("Cannot delete yourself")
  2. Fetch user, throw `NOT_FOUND` if null
  3. `prisma.user.delete({ where: { id: input.id } })` (or soft-delete via `deletedAt` if the model supports it -- check: the User model has `deletedAt` field, so use soft delete: `prisma.user.update({ where: { id }, data: { deletedAt: new Date() } })`)
     - **Note**: The Go `UserService.Delete` calls `userRepo.Delete` which does a hard delete. Match this behavior: `prisma.user.delete({ where: { id: input.id } })`
  4. Return `{ success: true }`
- Output: `z.object({ success: z.boolean() })`

**`users.changePassword`** (mutation)
- Procedure base: `tenantProcedure.use(requireSelfOrPermission((input) => (input as { userId: string }).userId, USERS_MANAGE))`
- Input: `changePasswordInputSchema`
- Logic (port from Go `UserService.ChangePassword`, adapted for Supabase):
  1. Validate `newPassword` non-empty (Zod handles this)
  2. Verify target user exists: `prisma.user.findUnique({ where: { id: input.userId } })`, throw `NOT_FOUND` if null
  3. Use Supabase Admin API to update password:
     ```typescript
     const adminClient = createAdminClient()
     const { error } = await adminClient.auth.admin.updateUserById(input.userId, {
       password: input.newPassword,
     })
     if (error) {
       throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update password" })
     }
     ```
  4. Return `{ success: true }`
- Output: `z.object({ success: z.boolean() })`

### 3.2 Register Router

Add to `apps/web/src/server/root.ts`:

```typescript
import { usersRouter } from "./routers/users"

export const appRouter = createTRPCRouter({
  // ... existing
  users: usersRouter,
})
```

### 3.3 Verification Criteria

- [ ] `users.list` filters by tenantId from context
- [ ] `users.list` supports search across email, displayName, username
- [ ] `users.list` returns paginated results with total count
- [ ] `users.create` auto-adds user to tenant via `userTenants` join table
- [ ] `users.create` promotes role to "admin" if assigned to an admin user group
- [ ] `users.update` allows self-update for non-admin fields (displayName, avatarUrl)
- [ ] `users.update` requires `users.manage` for admin-only fields
- [ ] `users.update` cascades role change when userGroupId changes
- [ ] `users.delete` prevents self-deletion
- [ ] `users.changePassword` uses Supabase Admin API
- [ ] All operations except self-update require `users.manage` permission
- [ ] TypeScript compiles without errors

---

## Phase 4: Frontend Hooks Migration

### 4.1 Rewrite `apps/web/src/hooks/api/use-tenants.ts`

Replace legacy `useApiQuery`/`useApiMutation` with tRPC hooks.

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

interface UseTenantsOptions {
  enabled?: boolean
  params?: { active?: boolean; include_inactive?: boolean; name?: string }
}

export function useTenants(options: UseTenantsOptions = {}) {
  const { enabled = true, params } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.tenants.list.queryOptions(
      { name: params?.name, active: params?.active },
      { enabled }
    )
  )
}

export function useTenant(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.tenants.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useCreateTenant() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.tenants.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.tenants.list.queryKey() })
    },
  })
}

export function useUpdateTenant() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.tenants.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.tenants.list.queryKey() })
    },
  })
}

export function useDeactivateTenant() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.tenants.deactivate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.tenants.list.queryKey() })
    },
  })
}
```

### 4.2 Rewrite `apps/web/src/hooks/api/use-user.ts`

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useUser(userId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.users.getById.queryOptions(
      { id: userId },
      { enabled: enabled && !!userId }
    )
  )
}

export function useUpdateUser() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.users.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.users.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.auth.me.queryKey() })
    },
  })
}
```

### 4.3 Rewrite `apps/web/src/hooks/api/use-users.ts`

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

interface UseUsersOptions {
  limit?: number
  search?: string
  enabled?: boolean
}

export function useUsers(options: UseUsersOptions = {}) {
  const { limit = 100, search, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.users.list.queryOptions(
      { limit, search: search || undefined },
      { enabled }
    )
  )
}

export function useCreateUser() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.users.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.users.list.queryKey() })
    },
  })
}

export function useDeleteUser() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.users.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.users.list.queryKey() })
    },
  })
}

export function useChangeUserPassword() {
  const trpc = useTRPC()
  return useMutation(trpc.users.changePassword.mutationOptions())
}
```

### 4.4 Rewrite `apps/web/src/hooks/api/use-user-groups.ts`

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

interface UseUserGroupsOptions {
  active?: boolean
  enabled?: boolean
}

export function useUserGroups(options: UseUserGroupsOptions = {}) {
  const { active, enabled = true } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.userGroups.list.queryOptions(
      { active },
      { enabled }
    )
  )
}

export function useUserGroup(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.userGroups.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useCreateUserGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.userGroups.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.userGroups.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.permissions.queryKey() })
    },
  })
}

export function useUpdateUserGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.userGroups.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.userGroups.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.auth.permissions.queryKey() })
    },
  })
}

export function useDeleteUserGroup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.userGroups.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.userGroups.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.auth.permissions.queryKey() })
    },
  })
}
```

### 4.5 Verification Criteria

- [ ] All 4 hook files compile without errors
- [ ] Hook API signatures remain compatible with existing component usage (same function names, same return shapes)
- [ ] Query invalidation patterns match the original hooks (e.g., updating a user invalidates both `users` and `auth.me`)
- [ ] `enabled` parameter works correctly to prevent unnecessary fetches
- [ ] All hooks use `useTRPC()` from `@/trpc` (not legacy `useApiQuery`)

### 4.6 Important Note on Hook API Shape Compatibility

The tRPC hooks return slightly different data shapes than the legacy `useApiQuery` hooks. The legacy hooks return data shaped by the Go API response (snake_case fields, wrapped in `{ data: ... }`). The tRPC hooks return Prisma-shaped data (camelCase). Callers of these hooks will need to be checked and potentially adjusted. The key differences:

1. **Field naming**: `display_name` -> `displayName`, `is_active` -> `isActive`, etc. (camelCase vs snake_case)
2. **Response wrapping**: Legacy `useApiQuery` returns `{ data: { data: [...] } }` (double-wrapped), tRPC returns the data directly
3. **Mutation call pattern**: Legacy uses `mutate({ path: { id }, body: { ... } })`, tRPC uses `mutate({ id, ...fields })`

**Mitigation strategy**: Search for all import sites of these hook files and verify compatibility. Common callers can be found via:
```bash
grep -r "use-tenants\|useTenants\|use-user\|useUser\|use-users\|useUsers\|use-user-groups\|useUserGroups" apps/web/src/ --include="*.tsx" --include="*.ts"
```

Update callers as needed to match the new tRPC response shapes.

---

## Phase 5: Integration Testing & Cleanup

### 5.1 Verify TypeScript Compilation

```bash
cd apps/web && npx tsc --noEmit
```

### 5.2 Verify tRPC Client Types

The `AppRouter` type is exported from `root.ts` and used by the tRPC client (`provider.tsx`). After adding the 3 new routers, verify that:
- The client can infer all procedure types
- `useTRPC().tenants.list.queryOptions()` is properly typed
- Mutation input/output types are inferred correctly

### 5.3 Manual Testing Checklist

1. **Tenant CRUD**:
   - List tenants (should only show user's tenants)
   - Create a tenant (verify slug validation, auto user-tenant entry)
   - Update a tenant (verify partial update)
   - Deactivate a tenant

2. **User CRUD**:
   - List users (with search)
   - Create a user (verify auto user-tenant entry, group assignment)
   - Update self (displayName, avatarUrl)
   - Update other user (admin fields, group assignment with role cascade)
   - Delete user (verify self-deletion prevention)
   - Change password (via Supabase admin API)

3. **UserGroup CRUD**:
   - List user groups (with active filter, includes system groups)
   - Create group (name/code validation, permission validation)
   - Update group (isAdmin change cascades role)
   - Delete group (system group protection)

### 5.4 Update Root Router Registration

Final state of `apps/web/src/server/root.ts`:

```typescript
import { createTRPCRouter, createCallerFactory } from "./trpc"
import { healthRouter } from "./routers/health"
import { authRouter } from "./routers/auth"
import { permissionsRouter } from "./routers/permissions"
import { tenantsRouter } from "./routers/tenants"
import { usersRouter } from "./routers/users"
import { userGroupsRouter } from "./routers/userGroups"

export const appRouter = createTRPCRouter({
  health: healthRouter,
  auth: authRouter,
  permissions: permissionsRouter,
  tenants: tenantsRouter,
  users: usersRouter,
  userGroups: userGroupsRouter,
})

export type AppRouter = typeof appRouter
export const createCaller = createCallerFactory(appRouter)
```

---

## Risk Areas & Edge Cases

### 1. Password Handling Divergence
The Go backend uses `bcrypt` hashing stored in `password_hash`. The tRPC version uses Supabase Admin API. During the transition period where both backends run:
- **Risk**: Password changes via tRPC won't update `password_hash` in the DB, breaking Go-side authentication.
- **Mitigation**: In `users.changePassword`, also update the `passwordHash` column in the DB using `bcryptjs`:
  ```typescript
  import bcrypt from "bcryptjs"
  const hash = await bcrypt.hash(input.newPassword, 10)
  await ctx.prisma.user.update({ where: { id: input.userId }, data: { passwordHash: hash } })
  ```
  This keeps both systems in sync until the Go backend is fully decommissioned.

### 2. User Create: Supabase User Sync
When creating a user via tRPC, the user record is created in the `users` table but NOT in Supabase `auth.users`. The Go backend had the same pattern (users exist in `users` table, authentication is separate). Verify this is still the expected behavior.

### 3. Nullable Boolean Fields
The Prisma schema has `isActive` as `Boolean?` (nullable) on User and Tenant, but `Boolean` (non-nullable) on UserGroup. The Go backend treats `isActive` as non-nullable bool. Watch for `null` vs `false` confusion in the tRPC layer.

### 4. UserGroup Uniqueness Checks Include System Groups
The Go backend checks name/code uniqueness including system groups (`WHERE tenant_id = ? OR tenant_id IS NULL`). The tRPC version must replicate this -- a tenant cannot create a group with the same name as a system group.

### 5. Concurrent Slug/Name Conflicts
Uniqueness checks (tenant slug, group name/code) use check-then-insert pattern, which has a race condition. The DB has unique indexes that will catch this:
- `tenants.slug` has `@unique`
- `user_groups` has COALESCE-based unique indexes (DB-level only, not Prisma-modeled)

Handle Prisma unique constraint errors (`P2002`) as `CONFLICT` errors.

### 6. Frontend API Shape Changes
The tRPC responses use camelCase (Prisma default) while the Go API used snake_case. All consuming components need to be updated. This is the highest-risk area for regressions.

### 7. User Delete: Hard vs Soft Delete
The Go backend does hard delete. The Prisma User model has a `deletedAt` field. Decide: maintain Go's hard-delete behavior or switch to soft delete. **Recommendation**: Use hard delete to match Go behavior and avoid breaking existing queries that don't filter by `deletedAt`.

---

## Testing Strategy

### Unit/Integration Tests (if test infrastructure exists)

For each router, test:
1. **Happy path**: All CRUD operations with valid input
2. **Validation errors**: Missing required fields, invalid enums, too-short strings
3. **Permission enforcement**: Verify FORBIDDEN when lacking required permissions
4. **Business logic edge cases**:
   - Tenant: duplicate slug, empty address
   - User: self-deletion prevention, admin field restriction, group-role cascade
   - UserGroup: system group protection, isAdmin cascade, permission validation

### Smoke Test Script

After implementation, run:
```bash
# Start the dev server
cd apps/web && npm run dev

# In another terminal, test endpoints via curl or a test script
# (Requires a valid Supabase token)
```

### Frontend Verification

1. Navigate to tenant management UI -- verify list, create, update, deactivate work
2. Navigate to user management UI -- verify list, create, update, delete, password change work
3. Navigate to user group management UI -- verify list, create, update, delete work
4. Check browser console for any tRPC errors or type mismatches

---

## Implementation Order Summary

| Phase | What | Files | Est. Lines |
|-------|------|-------|------------|
| 1 | Tenants Router | `routers/tenants.ts`, `root.ts` | ~200 |
| 2 | UserGroups Router | `routers/userGroups.ts`, `root.ts` | ~250 |
| 3 | Users Router | `routers/users.ts`, `root.ts` | ~300 |
| 4 | Frontend Hooks | 4 hook files | ~200 |
| 5 | Integration & Cleanup | Verify compilation, test, fix callers | ~varies |

**Total estimated new code**: ~950 lines of TypeScript (replacing ~2,500 lines of Go + handler code).

Each phase is independently deployable and verifiable. Phases 1-3 can be done in any order since they are independent routers, but Phase 2 (UserGroups) before Phase 3 (Users) is recommended because Users references UserGroup lookups. Phase 4 (frontend hooks) depends on Phases 1-3 being complete. Phase 5 is always last.
