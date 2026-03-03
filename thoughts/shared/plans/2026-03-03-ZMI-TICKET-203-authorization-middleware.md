# Implementation Plan: ZMI-TICKET-203 — Authorization Middleware

Date: 2026-03-03
Ticket: ZMI-TICKET-203
Dependencies: ZMI-TICKET-200 (Prisma schema), ZMI-TICKET-201 (tRPC setup), ZMI-TICKET-202 (Supabase auth)

---

## Overview

Port the Go authorization system (PermissionChecker, RequirePermission, data scopes) to tRPC middleware. Create a permissions router for the static permission catalog, and migrate the frontend `usePermissions` hook from openapi-fetch to tRPC.

---

## Phase 1: Permission Catalog and Helper Functions

**Goal:** Create the static permission catalog in TypeScript (mirroring Go's `permissions.go`) and extend the existing permission resolution helpers.

### 1.1 Install `uuid` dependency

The Go permission system generates deterministic UUIDs using SHA1 (UUID v5). The `uuid` npm package provides `v5()` for this purpose.

**Action:** Install `uuid` and its types.

```bash
cd apps/web && pnpm add uuid && pnpm add -D @types/uuid
```

### 1.2 Create permission catalog: `apps/web/src/server/lib/permission-catalog.ts`

**New file.** Static list of all 46 permissions with deterministic UUID generation matching the Go backend.

```typescript
import { v5 as uuidv5 } from "uuid"

const PERMISSION_NAMESPACE = "f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1"

export interface Permission {
  id: string        // UUID string
  key: string       // e.g. "employees.view"
  resource: string  // e.g. "employees"
  action: string    // e.g. "view"
  description: string
}

function permissionId(key: string): string {
  return uuidv5(key, PERMISSION_NAMESPACE)
}

function p(key: string, resource: string, action: string, description: string): Permission {
  return { id: permissionId(key), key, resource, action, description }
}

export const ALL_PERMISSIONS: Permission[] = [
  // ... all 46 permissions from Go's permissions.go, e.g.:
  p("employees.view", "employees", "view", "View employee records"),
  p("employees.create", "employees", "create", "Create employee records"),
  // ... (complete list from research doc section 5.1)
]

// Lookup maps
const byId = new Map<string, Permission>()
const byKey = new Map<string, Permission>()
for (const perm of ALL_PERMISSIONS) {
  byId.set(perm.id, perm)
  byKey.set(perm.key, perm)
}

/** Get permission by its UUID string */
export function lookupPermission(id: string): Permission | undefined {
  return byId.get(id)
}

/** Get permission UUID by human-readable key (e.g. "employees.view") */
export function permissionIdByKey(key: string): string | undefined {
  return byKey.get(key)?.id
}

/** Get all permissions as a list */
export function listPermissions(): Permission[] {
  return [...ALL_PERMISSIONS]
}
```

**Key design decisions:**
- Use `uuidv5(key, namespace)` which uses SHA1 internally, matching Go's `uuid.NewSHA1(ns, []byte(key))`
- Export both lookup-by-ID and lookup-by-key for flexibility
- The `key` field (e.g. `"employees.view"`) is added to the TypeScript model for convenience, even though the Go Permission struct only has `Resource` + `Action` (key is implicit)

**Reference files:**
- `apps/api/internal/permissions/permissions.go` (lines 33-84) — source of truth for all 46 permissions
- Go namespace constant: `"f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1"` (line 9)

### 1.3 Extend permission helpers: `apps/web/src/server/lib/permissions.ts`

**Modify existing file.** Add `hasPermission()` and `hasAnyPermission()` functions that mirror Go's `PermissionChecker.Has()` and `HasAny()` methods.

```typescript
// Add to existing file:

/**
 * Checks if a user has a specific permission (by UUID).
 * Mirrors Go PermissionChecker.Has()
 *
 * Order of precedence:
 * 1. UserGroup with isAdmin:true and isActive:true -> true (all permissions)
 * 2. UserGroup with isActive:false -> false (no permissions)
 * 3. No UserGroup but role === "admin" -> true (fallback)
 * 4. Otherwise -> check permission in UserGroup.permissions array
 */
export function hasPermission(user: ContextUser, permissionId: string): boolean {
  if (!permissionId) return false

  const userGroup = user.userGroup

  if (userGroup) {
    if (!userGroup.isActive) return false
    if (userGroup.isAdmin) return true
    const permissions = userGroup.permissions as string[] | null
    return permissions?.includes(permissionId) ?? false
  }

  // Fallback: role-based admin
  return user.role === "admin"
}

/**
 * Checks if a user has ANY of the specified permissions.
 * Mirrors Go PermissionChecker.HasAny()
 */
export function hasAnyPermission(user: ContextUser, permissionIds: string[]): boolean {
  return permissionIds.some(id => hasPermission(user, id))
}
```

**Why extend this file instead of creating a new one:** The existing `resolvePermissions()` and `isUserAdmin()` already live here. Adding `hasPermission()` and `hasAnyPermission()` keeps all permission logic together. The middleware functions in Phase 2 will call these helpers.

**Reference files:**
- `apps/api/internal/middleware/authorization.go` (lines 116-142) — Go `Has()` and `HasAny()` logic
- `apps/web/src/server/lib/permissions.ts` — existing file to modify

### Phase 1 Verification

1. **Unit test:** Create `apps/web/src/server/__tests__/permission-catalog.test.ts`
   - Verify the generated UUID for `"employees.view"` matches the Go backend
   - Run Go: `go test -v -run TestPermissionID ./internal/permissions/...` or manually confirm by checking a known UUID
   - Verify all 46 permissions are present
   - Verify `lookupPermission()` and `permissionIdByKey()` work correctly

2. **Unit test:** Add to `apps/web/src/server/__tests__/permissions.test.ts` (or create new)
   - `hasPermission()`: admin user bypasses, inactive group denies, regular user with permission, regular user without permission, no group with admin role
   - `hasAnyPermission()`: at least one match, no match

3. **Run:** `cd apps/web && pnpm vitest run src/server/__tests__/permission-catalog.test.ts`

---

## Phase 2: tRPC Authorization Middleware

**Goal:** Create the four middleware functions that mirror Go's authorization middleware, plus add tenant access validation to `tenantProcedure`.

### 2.1 Create middleware file: `apps/web/src/server/middleware/authorization.ts`

**New file.** Separate file for authorization middleware (keeps `trpc.ts` clean).

```typescript
import { TRPCError } from "@trpc/server"
import { initTRPC } from "@trpc/server"
import type { TRPCContext, ContextUser } from "../trpc"
import { hasPermission, hasAnyPermission, isUserAdmin } from "../lib/permissions"

// We need access to the tRPC instance for middleware creation.
// Export middleware factory functions that take the tRPC instance.
```

**Design decision — middleware factory pattern:**

The tRPC middleware must be created from the same `t` instance as the procedures. Two options:
1. Export middleware directly from `trpc.ts` (clutters the file)
2. Pass the `t` instance to a factory function (keeps separation)
3. Create middleware as standalone functions using the experimental `t._config` (fragile)

**Chosen approach:** Create middleware helper functions in the separate file, but wire them via the `t.procedure.use()` pattern in `trpc.ts`. The middleware functions will be *standalone functions* that receive the context and return pass/fail, and we compose them via `t.middleware()` in `trpc.ts`.

**Revised architecture:**

The authorization middleware file exports *reusable middleware creators* that use tRPC's `t.middleware()`. Since `t` is initialized in `trpc.ts`, we need to either:
- Export `t.middleware` from `trpc.ts`, or
- Define the middleware in `trpc.ts` itself

**Final approach:** Add a new export `createMiddleware` from `trpc.ts`, then create middleware in the separate file. This is the cleanest pattern.

### 2.2 Modify `apps/web/src/server/trpc.ts`

Add the following export (after `const t = initTRPC...`):

```typescript
/**
 * Middleware factory — used by authorization middleware in separate files.
 */
export const createMiddleware = t.middleware
```

### 2.3 Create `apps/web/src/server/middleware/authorization.ts`

**New file.** Contains all four middleware functions.

The middleware context type after `protectedProcedure` guarantees `user: ContextUser` and `session: Session` are non-null. The middleware functions must be used *after* `protectedProcedure` in the procedure chain.

```typescript
import { TRPCError } from "@trpc/server"
import { createMiddleware } from "../trpc"
import type { ContextUser } from "../trpc"
import { hasPermission, hasAnyPermission, isUserAdmin } from "../lib/permissions"

/**
 * Context type after protectedProcedure — user is guaranteed non-null.
 */
type AuthenticatedContext = {
  user: ContextUser
  [key: string]: unknown
}

// --- 1. requirePermission ---

/**
 * Middleware that checks if the user has ANY of the specified permissions.
 * Mirrors Go's RequirePermission middleware.
 *
 * Usage: protectedProcedure.use(requirePermission(permId1, permId2))
 *
 * @param permissionIds - UUID strings of required permissions (OR logic)
 */
export function requirePermission(...permissionIds: string[]) {
  return createMiddleware(async ({ ctx, next }) => {
    const user = (ctx as AuthenticatedContext).user
    if (!user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" })
    }

    if (!hasAnyPermission(user, permissionIds)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions" })
    }

    return next({ ctx })
  })
}

// --- 2. requireSelfOrPermission ---

/**
 * Middleware that allows access if the user is accessing their own resource
 * (matched by user ID), OR if they have the specified permission.
 * Mirrors Go's RequireSelfOrPermission middleware.
 *
 * In tRPC, we use a getter function instead of URL params.
 *
 * @param userIdGetter - Function to extract user ID from procedure input
 * @param permissionId - UUID string of the fallback permission
 */
export function requireSelfOrPermission(
  userIdGetter: (input: unknown) => string,
  permissionId: string
) {
  return createMiddleware(async ({ ctx, input, next }) => {
    const user = (ctx as AuthenticatedContext).user
    if (!user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" })
    }

    const targetUserId = userIdGetter(input)

    // Self-access: user's own ID matches target
    if (user.id === targetUserId) {
      return next({ ctx })
    }

    // Otherwise: check permission
    if (!hasPermission(user, permissionId)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions" })
    }

    return next({ ctx })
  })
}

// --- 3. requireEmployeePermission ---

/**
 * Middleware that handles "own vs all" employee-scoped access patterns.
 * Mirrors Go's RequireEmployeePermission middleware.
 *
 * - If the user's employeeId matches the target employee: allows if user has
 *   ownPermission OR allPermission
 * - If the target is a different employee: allows only if user has allPermission
 *
 * @param employeeIdGetter - Function to extract employee ID from procedure input
 * @param ownPermission - UUID string for "own data" permission
 * @param allPermission - UUID string for "all data" permission
 */
export function requireEmployeePermission(
  employeeIdGetter: (input: unknown) => string,
  ownPermission: string,
  allPermission: string
) {
  return createMiddleware(async ({ ctx, input, next }) => {
    const user = (ctx as AuthenticatedContext).user
    if (!user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" })
    }

    // Admin bypass (mirrors Go: admin has all permissions)
    if (isUserAdmin(user)) {
      return next({ ctx })
    }

    const targetEmployeeId = employeeIdGetter(input)

    // Own employee check
    if (user.employeeId && user.employeeId === targetEmployeeId) {
      if (hasPermission(user, ownPermission) || hasPermission(user, allPermission)) {
        return next({ ctx })
      }
    } else {
      // Different employee — need "all" permission
      if (hasPermission(user, allPermission)) {
        return next({ ctx })
      }
    }

    throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions" })
  })
}

// --- 4. applyDataScope ---

/**
 * Data scope types matching Go's DataScopeType.
 */
export type DataScopeType = "all" | "tenant" | "department" | "employee"

/**
 * Data scope filter added to context for use in Prisma queries.
 * Mirrors Go's access.Scope struct.
 */
export type DataScope = {
  type: DataScopeType
  tenantIds: string[]
  departmentIds: string[]
  employeeIds: string[]
}

/**
 * Middleware that reads the user's data scope configuration and adds
 * a DataScope object to the context. Downstream procedures use this
 * to filter Prisma queries.
 *
 * Mirrors Go's scopeFromContext() and access.ScopeFromUser().
 */
export function applyDataScope() {
  return createMiddleware(async ({ ctx, next }) => {
    const user = (ctx as AuthenticatedContext).user

    const scope: DataScope = {
      type: (user?.dataScopeType as DataScopeType) || "all",
      tenantIds: user?.dataScopeTenantIds ?? [],
      departmentIds: user?.dataScopeDepartmentIds ?? [],
      employeeIds: user?.dataScopeEmployeeIds ?? [],
    }

    return next({
      ctx: { ...ctx, dataScope: scope },
    })
  })
}
```

**Note on `requireEmployeePermission` admin bypass:** The Go `Has()` method already handles admin bypass internally (lines 121-127 of `authorization.go`). Since our `hasPermission()` also handles this, the explicit `isUserAdmin()` check in `requireEmployeePermission` is technically redundant — BUT we keep it for clarity and to match the Go pattern where `checker.EmployeeID()` is checked before `checker.Has()`. The admin check in `requireEmployeePermission` ensures admins pass through even if they have no `employeeId` set (which would skip the self-check branch entirely).

### 2.4 Add tenant access validation to `tenantProcedure` in `apps/web/src/server/trpc.ts`

**Modify existing file.** The current `tenantProcedure` has a `NOTE` comment saying ZMI-TICKET-203 will add tenant access validation.

Replace the existing `tenantProcedure` definition:

```typescript
export const tenantProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    if (!ctx.tenantId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Tenant ID required",
      })
    }

    // Validate that the user has access to this tenant via userTenants
    const hasAccess = ctx.user.userTenants.some(
      (ut) => ut.tenantId === ctx.tenantId
    )

    if (!hasAccess) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Access to tenant denied",
      })
    }

    return next({
      ctx: {
        ...ctx,
        tenantId: ctx.tenantId, // narrowed to non-null
      },
    })
  }
)
```

**Note:** Admin users should still be subject to tenant access validation. The `userTenants` table is the authoritative source for which tenants a user can access. Even admin users must have a `userTenants` entry. This matches the existing Go middleware behavior where tenant access is separate from permission checks.

### 2.5 Export middleware from `apps/web/src/server/index.ts`

**Modify existing file.** Add re-exports:

```typescript
export { createMiddleware } from "./trpc"
export {
  requirePermission,
  requireSelfOrPermission,
  requireEmployeePermission,
  applyDataScope,
} from "./middleware/authorization"
export type { DataScope, DataScopeType } from "./middleware/authorization"
```

### Phase 2 Verification

1. **Unit test:** Create `apps/web/src/server/__tests__/authorization.test.ts`
   - Tests for `requirePermission`:
     - Admin user bypasses all permission checks -> passes
     - User with correct permission -> passes
     - User without permission -> throws FORBIDDEN
     - Inactive group -> throws FORBIDDEN
     - No group, admin role -> passes
   - Tests for `requireSelfOrPermission`:
     - Self-access (user.id matches target) -> passes regardless of permission
     - Non-self with permission -> passes
     - Non-self without permission -> throws FORBIDDEN
   - Tests for `requireEmployeePermission`:
     - Own employee with ownPermission -> passes
     - Own employee with allPermission -> passes
     - Own employee without either -> throws FORBIDDEN
     - Other employee with allPermission -> passes
     - Other employee with only ownPermission -> throws FORBIDDEN
     - Admin user -> passes regardless
   - Tests for `applyDataScope`:
     - User with "all" scope -> context.dataScope.type === "all"
     - User with "department" scope -> correct departmentIds in context
     - User with "employee" scope -> correct employeeIds in context
   - Tests for tenant access validation in `tenantProcedure`:
     - User with matching userTenants entry -> passes
     - User without matching entry -> throws FORBIDDEN

2. **Test pattern:** Follow the existing test pattern from `procedures.test.ts`:
   - Use `createCallerFactory` with a test router
   - Use `createMockUser()` and `createMockContext()` helpers (can be extracted to a shared test utility)
   - Create test procedures that use the middleware

3. **Run:** `cd apps/web && pnpm vitest run src/server/__tests__/authorization.test.ts`

---

## Phase 3: Permissions Router

**Goal:** Create a `permissions` tRPC router that serves the static permission catalog, replacing the Go `PermissionHandler.List()` endpoint.

### 3.1 Create `apps/web/src/server/routers/permissions.ts`

**New file.** Simple router with one procedure.

```typescript
import { z } from "zod"
import { createTRPCRouter, protectedProcedure } from "../trpc"
import { listPermissions } from "../lib/permission-catalog"

const permissionSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  resource: z.string(),
  action: z.string(),
  description: z.string(),
})

const listOutputSchema = z.object({
  permissions: z.array(permissionSchema),
})

export const permissionsRouter = createTRPCRouter({
  /**
   * permissions.list — Returns all available permissions in the system.
   *
   * Replaces: GET /permissions (Go PermissionHandler.List)
   * Used by: user group management UI (permission picker),
   *          usePermissionChecker hook (catalog lookup)
   */
  list: protectedProcedure
    .output(listOutputSchema)
    .query(() => {
      return {
        permissions: listPermissions(),
      }
    }),
})
```

**Design notes:**
- Uses `protectedProcedure` (requires auth, no tenant needed) — the Go endpoint also only requires authentication
- Returns all fields including `key` for convenience (the Go endpoint returns `id`, `resource`, `action`, `description` but no key — the key is computed from `resource.action` on the frontend)
- The output shape is `{ permissions: [...] }` rather than the Go `{ data: [...] }` wrapper — the frontend will be updated in Phase 4

### 3.2 Register in root router: `apps/web/src/server/root.ts`

**Modify existing file.**

```typescript
import { permissionsRouter } from "./routers/permissions"

export const appRouter = createTRPCRouter({
  health: healthRouter,
  auth: authRouter,
  permissions: permissionsRouter,  // Add this
})
```

### Phase 3 Verification

1. **Unit test:** Add to `apps/web/src/server/__tests__/permissions-router.test.ts`
   - `permissions.list` returns all 46 permissions
   - Each permission has valid UUID, key, resource, action, description
   - Unauthenticated request throws UNAUTHORIZED

2. **Manual test:** Start dev server, call `trpc.permissions.list.query()` from browser console or via curl

3. **Run:** `cd apps/web && pnpm vitest run src/server/__tests__/permissions-router.test.ts`

---

## Phase 4: Frontend Hook Migration

**Goal:** Migrate `usePermissions` from openapi-fetch (Go backend) to tRPC, and update `usePermissionChecker` to work with the new data shape.

### 4.1 Rewrite `apps/web/src/hooks/api/use-permissions.ts`

**Modify existing file.** Replace the openapi-fetch implementation with tRPC.

```typescript
import { useTRPC } from '@/trpc'
import { useQuery } from '@tanstack/react-query'

/**
 * Hook to fetch the permission catalog (all available permissions) via tRPC.
 *
 * Replaces the previous openapi-fetch call to GET /permissions.
 * Returns { permissions: Permission[] }.
 */
export function usePermissions(enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.permissions.list.queryOptions(undefined, {
      enabled,
      staleTime: 5 * 60 * 1000,
    })
  )
}
```

### 4.2 Update `apps/web/src/hooks/use-has-permission.ts`

**Modify existing file.** Update the `catalogMap` construction to match the new tRPC response shape.

The current code accesses `permissionsQuery.data?.data` (Go API wraps in `{ data: [...] }`). The tRPC response shape is `{ permissions: [...] }`.

**Change:**

```typescript
// Before (openapi-fetch, Go response shape):
const catalogMap = useMemo(() => {
  const map = new Map<string, string>()
  if (!permissionsQuery.data?.data) return map
  permissionsQuery.data.data.forEach((perm) => {
    const key = buildPermissionKey(perm.resource, perm.action)
    if (key && perm.id) {
      map.set(key, perm.id)
    }
  })
  return map
}, [permissionsQuery.data])

// After (tRPC response shape):
const catalogMap = useMemo(() => {
  const map = new Map<string, string>()
  if (!permissionsQuery.data?.permissions) return map
  permissionsQuery.data.permissions.forEach((perm) => {
    const key = buildPermissionKey(perm.resource, perm.action)
    if (key && perm.id) {
      map.set(key, perm.id)
    }
  })
  return map
}, [permissionsQuery.data])
```

Also update the comment on line 28:
```typescript
// Permission catalog from tRPC (replaces Go backend openapi-fetch)
```

### 4.3 Update `apps/web/src/components/user-groups/user-group-form-sheet.tsx`

**Modify existing file.** Update the permission data access pattern.

**Change:**

```typescript
// Before:
const permissions = permissionsData?.data ?? []

// After:
const permissions = permissionsData?.permissions ?? []
```

### 4.4 Search for any other consumers of `usePermissions`

Run a search for all imports of `usePermissions` to ensure nothing is missed:

```bash
grep -r "usePermissions" apps/web/src/ --include="*.ts" --include="*.tsx"
```

Known consumers:
1. `apps/web/src/hooks/use-has-permission.ts` — updated in 4.2
2. `apps/web/src/components/user-groups/user-group-form-sheet.tsx` — updated in 4.3
3. `apps/web/src/hooks/api/index.ts` — re-export, no change needed
4. `apps/web/src/hooks/api/use-permissions.ts` — the hook itself, updated in 4.1

### Phase 4 Verification

1. **Type check:** `cd apps/web && pnpm typecheck` — ensure no type errors from the migration
2. **Manual test:**
   - Log in as admin -> navigate to User Group management -> verify permission picker loads
   - Check browser DevTools network tab -> confirm tRPC call to `permissions.list` instead of Go `/permissions`
   - Verify `usePermissionChecker().check(["employees.view"])` works correctly
3. **Verify no openapi-fetch references to `/permissions`:** Confirm the Go backend endpoint is no longer called for permissions catalog

---

## Phase 5: Tests

**Goal:** Comprehensive test coverage for all new code.

### 5.1 Test file: `apps/web/src/server/__tests__/permission-catalog.test.ts`

Tests for the permission catalog module:

```
describe("permission-catalog")
  it("generates correct UUID for known permission key")
    // Compare with Go: permissionID("employees.view") should produce
    // the same UUID as uuid.NewSHA1(namespace, "employees.view")
  it("contains exactly 46 permissions")
  it("all permissions have unique IDs")
  it("all permissions have unique keys")
  it("lookupPermission returns correct permission by UUID")
  it("lookupPermission returns undefined for unknown UUID")
  it("permissionIdByKey returns correct UUID for known key")
  it("permissionIdByKey returns undefined for unknown key")
  it("listPermissions returns a copy (not the original array)")
```

### 5.2 Test file: `apps/web/src/server/__tests__/permission-helpers.test.ts`

Tests for `hasPermission()` and `hasAnyPermission()`:

```
describe("hasPermission")
  it("returns false for empty permission ID")
  it("returns true for admin group user (active, isAdmin)")
  it("returns false for inactive admin group")
  it("returns true for user with specific permission in group")
  it("returns false for user without specific permission in group")
  it("returns true for no-group user with admin role (fallback)")
  it("returns false for no-group user with non-admin role")
  it("returns false for inactive group even with permission present")

describe("hasAnyPermission")
  it("returns true if user has at least one of the permissions")
  it("returns false if user has none of the permissions")
  it("returns true for admin user regardless")
```

### 5.3 Test file: `apps/web/src/server/__tests__/authorization.test.ts`

Integration-style tests using `createCallerFactory`:

```
describe("requirePermission middleware")
  // Create a test router with: protectedProcedure.use(requirePermission(permId)).query(...)
  it("allows admin user")
  it("allows user with required permission")
  it("blocks user without required permission")
  it("blocks user with inactive group")
  it("accepts any of multiple permissions (OR logic)")

describe("requireSelfOrPermission middleware")
  // Create a test router with input schema { userId: string }
  it("allows self-access without permission")
  it("allows non-self with permission")
  it("blocks non-self without permission")

describe("requireEmployeePermission middleware")
  // Create a test router with input schema { employeeId: string }
  it("allows admin user regardless of employeeId")
  it("allows own employee with ownPermission")
  it("allows own employee with allPermission")
  it("blocks own employee without either permission")
  it("allows other employee with allPermission")
  it("blocks other employee with only ownPermission")
  it("blocks user with no employeeId and only ownPermission")

describe("applyDataScope middleware")
  // Create a test router that returns ctx.dataScope
  it("adds scope 'all' for default user")
  it("adds scope 'department' with correct IDs")
  it("adds scope 'employee' with correct IDs")
  it("adds scope 'tenant' with correct IDs")

describe("tenantProcedure tenant access validation")
  it("allows user with matching userTenants entry")
  it("blocks user without matching userTenants entry")
  it("blocks user with empty userTenants")
```

### 5.4 Test file: `apps/web/src/server/__tests__/permissions-router.test.ts`

Tests for the permissions router:

```
describe("permissions.list")
  it("returns all permissions for authenticated user")
  it("each permission has id, key, resource, action, description")
  it("throws UNAUTHORIZED for unauthenticated request")
  it("returns consistent results across calls")
```

### 5.5 Shared test utilities

**Consider extracting to `apps/web/src/server/__tests__/helpers.ts`:**

The `createMockUser()`, `createMockSession()`, and `createMockContext()` functions from `procedures.test.ts` are needed in multiple test files. Extract them to a shared helper file.

```typescript
// apps/web/src/server/__tests__/helpers.ts
import type { TRPCContext, ContextUser } from "../trpc"
import type { Session, User as SupabaseUser } from "@supabase/supabase-js"
import type { UserGroup } from "@/generated/prisma/client"

export function createMockUser(overrides: Partial<ContextUser> = {}): ContextUser { ... }
export function createMockSession(): Session { ... }
export function createMockContext(overrides: Partial<TRPCContext> = {}): TRPCContext { ... }

// Additional helpers for authorization tests:
export function createMockUserGroup(overrides: Partial<UserGroup> = {}): UserGroup {
  return {
    id: "00000000-0000-0000-0000-000000000010",
    tenantId: null,
    name: "Test Group",
    code: "test-group",
    description: null,
    permissions: [],  // JSON array of permission UUID strings
    isAdmin: false,
    isSystem: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as UserGroup
}

export function createAdminUser(): ContextUser {
  return createMockUser({
    userGroup: createMockUserGroup({ isAdmin: true, isActive: true }),
  })
}

export function createUserWithPermissions(permissionIds: string[]): ContextUser {
  return createMockUser({
    userGroup: createMockUserGroup({
      permissions: permissionIds as unknown as JsonValue,
      isAdmin: false,
      isActive: true,
    }),
  })
}
```

### Phase 5 Verification

1. **Run all tests:** `cd apps/web && pnpm vitest run src/server/__tests__/`
2. **Check coverage:** `cd apps/web && pnpm vitest run --coverage src/server/__tests__/`
3. **Verify no regressions:** `cd apps/web && pnpm vitest run` (run full test suite)

---

## Phase 6: Final Verification

### 6.1 Type check

```bash
cd apps/web && pnpm typecheck
```

### 6.2 Lint check

```bash
cd apps/web && pnpm lint
```

### 6.3 Full test suite

```bash
cd apps/web && pnpm vitest run
```

### 6.4 Acceptance Criteria Checklist

From the ticket:

- [ ] `requirePermission()` blocks access without matching permission
  - Verified by: authorization.test.ts "blocks user without required permission"
- [ ] Admin bypass works for UserGroups with `is_admin: true`
  - Verified by: authorization.test.ts "allows admin user"
- [ ] Data scope filter correctly applied (all/department/employee)
  - Verified by: authorization.test.ts "applyDataScope middleware" tests
- [ ] Self-access pattern works (own data without permission)
  - Verified by: authorization.test.ts "allows self-access without permission"
- [ ] Permissions loaded from `user_groups.permissions` JSON
  - Verified by: permission-helpers.test.ts "returns true for user with specific permission in group"
- [ ] `permissions.list` endpoint returns all available permissions
  - Verified by: permissions-router.test.ts "returns all permissions"
- [ ] Frontend hook uses tRPC instead of fetch
  - Verified by: code review of `use-permissions.ts`, type check passes

### 6.5 Compatibility Notes

- The authorization middleware is created but NOT yet applied to any routers (that is ZMI-TICKET-210+)
- The Go backend still runs in parallel — permission catalog is now served from both Go (`GET /permissions`) and tRPC (`permissions.list`)
- The `usePermissions` hook migration removes the Go dependency for the frontend
- Data scope middleware adds `dataScope` to context but no router uses it yet

---

## File Summary

### New Files
| File | Purpose |
|------|---------|
| `apps/web/src/server/lib/permission-catalog.ts` | Static permission catalog with UUID generation |
| `apps/web/src/server/middleware/authorization.ts` | tRPC authorization middleware (requirePermission, requireSelfOrPermission, requireEmployeePermission, applyDataScope) |
| `apps/web/src/server/routers/permissions.ts` | Permissions list tRPC router |
| `apps/web/src/server/__tests__/helpers.ts` | Shared test utilities |
| `apps/web/src/server/__tests__/permission-catalog.test.ts` | Permission catalog tests |
| `apps/web/src/server/__tests__/permission-helpers.test.ts` | Permission helper function tests |
| `apps/web/src/server/__tests__/authorization.test.ts` | Authorization middleware tests |
| `apps/web/src/server/__tests__/permissions-router.test.ts` | Permissions router tests |

### Modified Files
| File | Changes |
|------|---------|
| `apps/web/package.json` | Add `uuid` + `@types/uuid` dependencies |
| `apps/web/src/server/lib/permissions.ts` | Add `hasPermission()` and `hasAnyPermission()` functions |
| `apps/web/src/server/trpc.ts` | Export `createMiddleware`; add tenant access validation to `tenantProcedure` |
| `apps/web/src/server/root.ts` | Register `permissionsRouter` |
| `apps/web/src/server/index.ts` | Re-export middleware and types |
| `apps/web/src/hooks/api/use-permissions.ts` | Migrate from openapi-fetch to tRPC |
| `apps/web/src/hooks/use-has-permission.ts` | Update data access pattern for tRPC response shape |
| `apps/web/src/components/user-groups/user-group-form-sheet.tsx` | Update `permissionsData?.data` to `permissionsData?.permissions` |

### Go Files Replaced (functional parity)
| Go File | TypeScript Replacement |
|---------|----------------------|
| `apps/api/internal/middleware/authorization.go` | `apps/web/src/server/middleware/authorization.ts` + `apps/web/src/server/lib/permissions.ts` |
| `apps/api/internal/handler/permission.go` | `apps/web/src/server/routers/permissions.ts` |
| `apps/api/internal/handler/scope.go` | `applyDataScope()` in `apps/web/src/server/middleware/authorization.ts` |
| `apps/api/internal/permissions/permissions.go` | `apps/web/src/server/lib/permission-catalog.ts` |
| `apps/api/internal/access/scope.go` | `DataScope` type in `apps/web/src/server/middleware/authorization.ts` |
