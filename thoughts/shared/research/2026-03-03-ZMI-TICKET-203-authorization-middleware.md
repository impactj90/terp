# Research: ZMI-TICKET-203 — Authorization Middleware

Date: 2026-03-03
Status: Complete

## 1. Existing Go Authorization Middleware

### 1.1 PermissionChecker (`apps/api/internal/middleware/authorization.go`)

The `PermissionChecker` is the core authorization primitive. It holds a user reference and a pre-computed permission set.

**Struct definition (lines 29-35):**
```go
type PermissionChecker struct {
    user          *model.User
    permissionSet map[string]struct{}
    hasGroup      bool
    groupActive   bool
    groupAdmin    bool
}
```

**Construction logic (`NewPermissionCheckerForUser`, lines 87-114):**
1. If user has a `UserGroup`:
   - Sets `hasGroup = true`
   - Records `groupActive` and `groupAdmin` from the group
   - If group is active AND NOT admin, parses `UserGroup.Permissions` JSON into `permissionSet` map
   - If group IS admin, the permission set stays empty (admin bypass via `Has()` method)
2. If user has no `UserGroup`, the checker still works but falls back to role-based check in `Has()`

**Permission check logic (`Has()`, lines 116-133):**
```go
func (c *PermissionChecker) Has(id string) bool {
    if c == nil || c.user == nil || id == "" {
        return false
    }
    if c.hasGroup {
        if !c.groupActive {
            return false  // inactive group = no permissions
        }
        if c.groupAdmin {
            return true   // admin group = all permissions
        }
        _, ok := c.permissionSet[id]
        return ok
    }
    return c.user.Role == model.RoleAdmin  // fallback: role-based admin
}
```

**Key behaviors:**
- Admin bypass: `UserGroup.IsAdmin == true` grants ALL permissions
- Inactive group: denies ALL permissions (even if admin)
- No group fallback: `user.Role == "admin"` grants all
- Permissions stored as UUID strings in JSONB array

**`HasAny()` (lines 135-142):** checks if user has ANY of the provided permission IDs.

**`EmployeeID()` (lines 144-149):** returns the user's linked employee ID (for self-access checks).

### 1.2 Authorization Middleware Functions

**`RequirePermission(ids ...string)` (lines 158-173):**
- Chi middleware that checks `HasAny(ids...)`
- Returns 403 Forbidden if none of the permissions are held
- Loads/caches PermissionChecker in context

**`RequireSelfOrPermission(param, permissionID)` (lines 175-203):**
- Extracts user ID from URL param
- If extracted ID matches `checker.user.ID`, allows access (self-access)
- Otherwise, checks `checker.Has(permissionID)`
- Used for: user profile edit, password change

**`RequireEmployeePermission(param, ownID, allID)` (lines 206-249):**
- Extracts employee ID from URL param (or via custom resolver)
- If user's `EmployeeID` matches the target employee:
  - Allowed if user has `ownID` permission OR `allID` permission
- If NOT own employee:
  - Only allowed if user has `allID` permission
- Used for: time tracking (view_own vs view_all), absences (request vs manage)

**`RequireEmployeePermissionFromResolver(resolver, ownID, allID)` (lines 213-215):**
- Same as above but uses a custom resolver function to extract employee ID
- Used for: booking creation (reads employee_id from request body)

### 1.3 Permission Handler (`apps/api/internal/handler/permission.go`)

Simple handler that returns the static permission catalog:
```go
func (h *PermissionHandler) List(w http.ResponseWriter, _ *http.Request) {
    list := permissions.List()
    // Maps to models.Permission { ID, Resource, Action, Description }
    respondJSON(w, http.StatusOK, &permissionListResponse{Data: results})
}
```

### 1.4 Scope Handler (`apps/api/internal/handler/scope.go`)

```go
func scopeFromContext(ctx context.Context) (access.Scope, error) {
    checker, ok := middleware.PermissionCheckerFromContext(ctx)
    if !ok {
        return access.Scope{Type: model.DataScopeAll}, nil
    }
    return access.ScopeFromUser(checker.User())
}
```

### 1.5 Data Scope System (`apps/api/internal/access/scope.go`)

**Scope struct:**
```go
type Scope struct {
    Type          model.DataScopeType
    TenantIDs     []uuid.UUID
    DepartmentIDs []uuid.UUID
    EmployeeIDs   []uuid.UUID
}
```

**DataScopeType values** (from `apps/api/internal/model/user.go`):
```go
const (
    DataScopeAll        DataScopeType = "all"
    DataScopeTenant     DataScopeType = "tenant"
    DataScopeDepartment DataScopeType = "department"
    DataScopeEmployee   DataScopeType = "employee"
)
```

**`ScopeFromUser(user)` (lines 19-45):**
- Reads `user.DataScopeType` (defaults to "all" if empty)
- Parses `user.DataScopeTenantIDs`, `DataScopeDepartmentIDs`, `DataScopeEmployeeIDs` from string arrays to UUID arrays
- Returns a `Scope` struct

**Scope filtering methods:**
- `AllowsTenant(tenantID)`: For `DataScopeTenant`, checks if tenant is in allowed list
- `AllowsEmployee(employee)`: For `DataScopeDepartment`, checks employee's department; for `DataScopeEmployee`, checks employee ID
- `AllowsEmployeeID(employeeID)`: For `DataScopeEmployee`, checks if ID is in allowed list
- `ApplyEmployeeScope(query, employeeCol, deptCol)`: Applies WHERE clause to GORM query based on scope type

---

## 2. tRPC Server Setup (from TICKET-201 and TICKET-202)

### 2.1 tRPC Initialization (`apps/web/src/server/trpc.ts`)

**Context type:**
```typescript
export type TRPCContext = {
    prisma: PrismaClient
    authToken: string | null
    user: ContextUser | null
    session: Session | null
    tenantId: string | null
}
```

**ContextUser type:**
```typescript
export type ContextUser = PrismaUser & {
    userGroup: UserGroup | null
    userTenants: (UserTenant & { tenant: Tenant })[]
}
```

The `ContextUser` already includes `userGroup` with its `permissions` JSONB field and `isAdmin` boolean. This is loaded during context creation in `createTRPCContext()` via:
```typescript
const dbUser = await prisma.user.findUnique({
    where: { id: supabaseUser.id },
    include: {
        userGroup: true,
        userTenants: { include: { tenant: true } },
    },
})
```

### 2.2 Existing Procedure Types

Three procedure types exist:
1. **`publicProcedure`** - No auth required
2. **`protectedProcedure`** - Requires valid session and user (narrows `user` to non-null)
3. **`tenantProcedure`** - Requires auth AND `X-Tenant-ID` header (narrows `tenantId` to non-null)

**NOTE in `tenantProcedure` (line 179):**
```typescript
// NOTE: Does not validate that the user has access to the tenant.
// ZMI-TICKET-203 will add tenant access validation.
```

### 2.3 Existing Middleware Pattern

The middleware pattern uses `t.procedure.use()`:
```typescript
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
    if (!ctx.user || !ctx.session) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "..." })
    }
    return next({
        ctx: { ...ctx, user: ctx.user, session: ctx.session },
    })
})
```

### 2.4 Router Structure

- **`apps/web/src/server/root.ts`** - Root router merging sub-routers
- **`apps/web/src/server/index.ts`** - Re-exports
- **`apps/web/src/server/routers/health.ts`** - Health check (publicProcedure)
- **`apps/web/src/server/routers/auth.ts`** - Auth endpoints (protectedProcedure)
- **`apps/web/src/server/lib/permissions.ts`** - Permission resolution helpers

### 2.5 Existing Permission Resolution (`apps/web/src/server/lib/permissions.ts`)

Already ported from Go in TICKET-202:

```typescript
export function resolvePermissions(user: ContextUser): string[] {
    const userGroup = user.userGroup
    if (!userGroup) return []
    if (!userGroup.isActive) return []
    if (userGroup.isAdmin) return []  // admin handled via is_admin flag
    const permissions = userGroup.permissions as string[] | null
    return permissions ?? []
}

export function isUserAdmin(user: ContextUser): boolean {
    if (user.userGroup?.isAdmin) return true
    return user.role === "admin"
}
```

### 2.6 Test Patterns (`apps/web/src/server/__tests__/procedures.test.ts`)

Tests use `createCallerFactory` with mock contexts:
```typescript
function createMockUser(overrides: Partial<ContextUser> = {}): ContextUser {
    return {
        id: "00000000-0000-0000-0000-000000000001",
        email: "test@example.com",
        displayName: "Test User",
        // ... all fields ...
        userGroup: null,
        userTenants: [],
        ...overrides,
    } as ContextUser
}

function createMockContext(overrides: Partial<TRPCContext> = {}): TRPCContext {
    return {
        prisma: {} as TRPCContext["prisma"],
        authToken: null,
        user: null,
        session: null,
        tenantId: null,
        ...overrides,
    }
}
```

### 2.7 Client-Side tRPC Setup

- **`apps/web/src/trpc/context.ts`** - Creates `TRPCProvider`, `useTRPC`, `useTRPCClient`
- **`apps/web/src/trpc/server.ts`** - Server-side caller for Server Components

---

## 3. Prisma Schema — Relevant Models

### 3.1 User Model (`apps/web/prisma/schema.prisma`, lines 28-63)

```prisma
model User {
    id                     String    @id @db.Uuid
    email                  String    @unique
    displayName            String    @map("display_name")
    role                   String    @default("user")       // 'user' | 'admin'
    tenantId               String?   @map("tenant_id") @db.Uuid
    userGroupId            String?   @map("user_group_id") @db.Uuid
    employeeId             String?   @map("employee_id") @db.Uuid
    isActive               Boolean?  @default(true)
    isLocked               Boolean   @default(false)
    dataScopeType          String    @default("all") @map("data_scope_type")
    dataScopeTenantIds     String[]  @default([]) @map("data_scope_tenant_ids") @db.Uuid
    dataScopeDepartmentIds String[]  @default([]) @map("data_scope_department_ids") @db.Uuid
    dataScopeEmployeeIds   String[]  @default([]) @map("data_scope_employee_ids") @db.Uuid

    // Relations
    tenant      Tenant?      @relation(fields: [tenantId], references: [id])
    userGroup   UserGroup?   @relation(fields: [userGroupId], references: [id])
    userTenants UserTenant[]
}
```

Key fields for authorization:
- `employeeId` - Links user to an employee record (for self-access patterns)
- `userGroupId` - Links to UserGroup (permissions source)
- `dataScopeType` - One of: "all", "tenant", "department", "employee"
- `dataScopeTenantIds` - Array of tenant UUIDs (for tenant scope)
- `dataScopeDepartmentIds` - Array of department UUIDs (for department scope)
- `dataScopeEmployeeIds` - Array of employee UUIDs (for employee scope)

### 3.2 UserGroup Model (lines 115-135)

```prisma
model UserGroup {
    id          String    @id @db.Uuid
    tenantId    String?   @map("tenant_id") @db.Uuid
    name        String
    code        String
    description String?
    permissions Json?     @default("[]") @db.JsonB    // Array of permission UUID strings
    isAdmin     Boolean?  @default(false)
    isSystem    Boolean?  @default(false)
    isActive    Boolean   @default(true)
}
```

Key fields:
- `permissions` - JSONB array of permission UUID strings (e.g., `["uuid1", "uuid2", ...]`)
- `isAdmin` - When true, grants all permissions (bypass check)
- `isActive` - When false, denies all permissions regardless of admin status

### 3.3 UserTenant Model (lines 144-157)

```prisma
model UserTenant {
    userId    String   @map("user_id") @db.Uuid
    tenantId  String   @map("tenant_id") @db.Uuid
    role      String   @default("member")
    user   User   @relation(...)
    tenant Tenant @relation(...)
    @@id([userId, tenantId])
}
```

### 3.4 Employee Model (Go: `apps/api/internal/model/employee.go`)

Key fields relevant to authorization:
- `ID` - Employee UUID
- `TenantID` - Required UUID (not nullable)
- `DepartmentID` - Optional UUID (used for department scope filtering)

Note: The Employee model is NOT in the Prisma schema yet. It will need to be added when router implementations start (TICKET-210+).

---

## 4. Frontend Hooks

### 4.1 Current Permission Hook (`apps/web/src/hooks/api/use-permissions.ts`)

Uses old openapi-fetch to get the permission catalog from the Go backend:
```typescript
export function usePermissions(enabled = true) {
    return useApiQuery('/permissions', {
        enabled,
        staleTime: 5 * 60 * 1000,
    })
}
```

This will be migrated to `trpc.permissions.list.useQuery()`.

### 4.2 Current Permissions Hook (`apps/web/src/hooks/api/use-current-permissions.ts`)

Already migrated to tRPC in TICKET-202:
```typescript
export function useCurrentPermissions(enabled = true) {
    const trpc = useTRPC()
    return useQuery(
        trpc.auth.permissions.queryOptions(undefined, {
            enabled,
            staleTime: 5 * 60 * 1000,
        })
    )
}
```

Returns `{ permission_ids: string[], is_admin: boolean }`.

### 4.3 Permission Checker Hook (`apps/web/src/hooks/use-has-permission.ts`)

Uses both hooks to provide a `check(keys)` function:
```typescript
export function usePermissionChecker() {
    const permissionsQuery = usePermissions(isAuthenticated)       // catalog from Go
    const currentPermissionsQuery = useCurrentPermissions(isAuthenticated)  // user's from tRPC

    // Builds a catalog map: "resource.action" -> UUID string
    // Builds an allowed set: Set<UUID string>
    // check(keys): admin -> true; otherwise checks if any key's UUID is in allowed set

    return { check, isAdmin, isLoading }
}
```

This hook maps human-readable permission keys (e.g., `"employees.view"`) to UUIDs via the catalog, then checks against the user's permission UUIDs.

---

## 5. Available Permissions

### 5.1 Permission Registry (`apps/api/internal/permissions/permissions.go`)

Permissions are defined as a static list with deterministic UUIDs (SHA1 of key string):

| Key | Resource | Action | Description |
|-----|----------|--------|-------------|
| `employees.view` | employees | view | View employee records |
| `employees.create` | employees | create | Create employee records |
| `employees.edit` | employees | edit | Edit employee records |
| `employees.delete` | employees | delete | Delete employee records |
| `time_tracking.view_own` | time_tracking | view_own | View own time tracking data |
| `time_tracking.view_all` | time_tracking | view_all | View all time tracking data |
| `time_tracking.edit` | time_tracking | edit | Edit time tracking entries |
| `time_tracking.approve` | time_tracking | approve | Approve time tracking entries |
| `booking_overview.change_day_plan` | booking_overview | change_day_plan | Change day plan in booking overview |
| `booking_overview.calculate_day` | booking_overview | calculate_day | Calculate day in booking overview |
| `booking_overview.calculate_month` | booking_overview | calculate_month | Calculate month in booking overview |
| `booking_overview.delete_bookings` | booking_overview | delete_bookings | Delete bookings in booking overview |
| `absences.request` | absences | request | Request absences |
| `absences.approve` | absences | approve | Approve absences |
| `absences.manage` | absences | manage | Manage absences |
| `day_plans.manage` | day_plans | manage | Manage day plans |
| `week_plans.manage` | week_plans | manage | Manage week plans |
| `tariffs.manage` | tariffs | manage | Manage tariffs |
| `departments.manage` | departments | manage | Manage departments |
| `teams.manage` | teams | manage | Manage teams |
| `booking_types.manage` | booking_types | manage | Manage booking types |
| `absence_types.manage` | absence_types | manage | Manage absence types |
| `holidays.manage` | holidays | manage | Manage holidays |
| `accounts.manage` | accounts | manage | Manage accounts |
| `notifications.manage` | notifications | manage | Manage notifications |
| `groups.manage` | groups | manage | Manage employee, workflow, and activity groups |
| `reports.view` | reports | view | View reports |
| `reports.manage` | reports | manage | Generate and manage reports |
| `users.manage` | users | manage | Manage users |
| `tenants.manage` | tenants | manage | Manage tenants |
| `settings.manage` | settings | manage | Manage settings |
| `time_plans.manage` | time_plans | manage | Manage employee day plans and time plan assignments |
| `activities.manage` | activities | manage | Manage activities for orders |
| `orders.manage` | orders | manage | Manage orders |
| `order_assignments.manage` | order_assignments | manage | Manage order assignments |
| `order_bookings.manage` | order_bookings | manage | Manage order bookings |
| `order_bookings.view` | order_bookings | view | View order bookings |
| `payroll.manage` | payroll | manage | Manage payroll exports and interfaces |
| `payroll.view` | payroll | view | View payroll exports |
| `schedules.manage` | schedules | manage | Manage schedules and execute scheduled tasks |
| `contact_management.manage` | contact_management | manage | Manage contact types and contact kinds |
| `terminal_bookings.manage` | terminal_bookings | manage | Manage terminal bookings and import batches |
| `access_control.manage` | access_control | manage | Manage access zones, profiles, and employee assignments |
| `vehicle_data.manage` | vehicle_data | manage | Manage vehicles, routes, and trip records |
| `travel_allowance.manage` | travel_allowance | manage | Manage travel allowance rule sets |
| `shift_planning.manage` | shift_planning | manage | Manage shift definitions and assignments |
| `macros.manage` | macros | manage | Manage macros and macro assignments |
| `locations.manage` | locations | manage | Manage work locations |
| `corrections.manage` | corrections | manage | Manage corrections |
| `monthly_evaluations.manage` | monthly_evaluations | manage | Manage monthly evaluation templates |

**Total: 46 permissions**

### 5.2 Permission ID Generation

Permission IDs are deterministic UUIDs generated using SHA1 namespace:
```go
const permissionNamespace = "f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1"

func permissionID(key string) uuid.UUID {
    ns := uuid.MustParse(permissionNamespace)
    return uuid.NewSHA1(ns, []byte(key))
}
```

The same algorithm must be replicated in TypeScript to ensure matching UUIDs. The `uuid` npm package supports `v5()` which uses SHA1.

---

## 6. Route Permission Mapping (from `apps/api/internal/handler/routes.go`)

Summary of authorization patterns used across all routes:

### Pattern 1: Simple RequirePermission
Most routes use this pattern (single permission):
```go
r.With(authz.RequirePermission(permManage)).Get("/", h.List)
```

### Pattern 2: RequireSelfOrPermission
Used for user self-edit:
```go
r.With(authz.RequireSelfOrPermission("id", permManage)).Patch("/{id}", h.Update)
r.With(authz.RequireSelfOrPermission("id", permManage)).Post("/{id}/password", h.ChangePassword)
```

### Pattern 3: RequireEmployeePermission (own vs all)
Used for employee-scoped data:
```go
// Absences: own employee = request perm, other employees = manage perm
r.With(authz.RequireEmployeePermission("id", requestPerm, managePerm)).Get("/employees/{id}/absences", h.ListByEmployee)

// Bookings: own employee = view_own, other employees = view_all
r.With(authz.RequireEmployeePermission("id", viewOwn, viewAll)).Get("/", h.GetDayView)
```

### Pattern 4: Chained middleware (multiple checks)
```go
r.With(
    authz.RequirePermission(edit),
    authz.RequireEmployeePermissionFromResolver(resolver, viewOwn, viewAll),
).Post("/bookings", okHandler)
```

### Pattern 5: Open read, restricted write
Tenants list is open to all authenticated users, but CRUD requires permission:
```go
r.Get("/", h.List)  // no permission check
r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
```

---

## 7. Dependencies and Prerequisites

### Already Completed
- **ZMI-TICKET-200** - Prisma schema with UserGroup model (including `permissions` JSON, `isAdmin`, `isActive`)
- **ZMI-TICKET-201** - tRPC server setup with `publicProcedure`, `protectedProcedure`, `tenantProcedure`
- **ZMI-TICKET-202** - Supabase auth with user context loading (includes `userGroup` relation in context)

### Already Exists in TypeScript
- `resolvePermissions()` and `isUserAdmin()` in `apps/web/src/server/lib/permissions.ts`
- `useCurrentPermissions()` hook (already uses tRPC)
- `usePermissionChecker()` hook with `check()` function

### What Needs to Be Created

1. **Permission middleware functions** in `apps/web/src/server/trpc.ts` (or separate file):
   - `requirePermission(...permissionIds: string[])` - tRPC middleware
   - `requireSelfOrPermission(employeeIdGetter, permissionId)` - tRPC middleware
   - `requireEmployeePermission(employeeIdGetter, ownPermission, allPermission)` - tRPC middleware

2. **Data scope context enrichment**:
   - `applyDataScope()` - tRPC middleware that adds scope filter to context
   - Scope filter type for use in Prisma queries

3. **Permission catalog** in TypeScript:
   - Static list of all 46 permissions (mirroring Go `permissions.go`)
   - UUID generation using same SHA1 namespace algorithm
   - Export as typed constants

4. **Permissions router** (`apps/web/src/server/routers/permissions.ts`):
   - `permissions.list` query - returns all available permissions

5. **Frontend hook migration**:
   - Update `use-permissions.ts` to use tRPC instead of openapi-fetch

6. **Tenant access validation** in `tenantProcedure`:
   - Check that user has access to the requested tenant via `userTenants`

---

## 8. Key Design Decisions

### 8.1 Permission IDs are UUIDs, not human-readable keys
The Go system stores permission UUIDs in `user_groups.permissions` JSONB, NOT human-readable keys like `"employees.view"`. The UUID is generated deterministically from the key. The TypeScript implementation MUST use the same UUID generation to maintain compatibility with existing DB data.

### 8.2 Middleware must work with tRPC input, not URL params
Go uses URL params (`chi.URLParam(r, "id")`) for employee/user ID extraction. tRPC uses typed input objects. The middleware must accept a getter function: `(input: unknown) => string`.

### 8.3 Data scope lives on User, not UserGroup
The `data_scope_type` and `data_scope_*_ids` fields are on the `User` model directly, NOT on `UserGroup`. The UserGroup only has `permissions` and `isAdmin`.

### 8.4 Context already has userGroup loaded
The `createTRPCContext()` in TICKET-202 already loads `userGroup` when resolving the user. No additional DB query is needed for permission checking - just parse the `permissions` JSONB from the already-loaded `userGroup`.

### 8.5 Admin bypass order of precedence
1. If user has UserGroup with `isAdmin: true` and `isActive: true` -> ALL permissions granted
2. If user has UserGroup with `isActive: false` -> NO permissions (even if admin)
3. If user has no UserGroup but `role === "admin"` -> ALL permissions granted (fallback)
4. Otherwise -> check specific permission in UserGroup.permissions array
