# ZMI-TICKET-210 Research: Tenants, Users, User Groups tRPC Routers

## 1. Existing Go Services to Port

### 1.1 Tenant Service

**File:** `/home/tolga/projects/terp/apps/api/internal/service/tenant.go`

#### Error Sentinels (lines 14-21)
```go
ErrTenantNotFound             = errors.New("tenant not found")
ErrTenantSlugExists           = errors.New("tenant slug already exists")
ErrInvalidTenantSlug          = errors.New("invalid tenant slug")
ErrInvalidTenantName          = errors.New("invalid tenant name")
ErrInvalidAddress             = errors.New("invalid tenant address")
ErrInvalidTenantVacationBasis = errors.New("invalid tenant vacation basis")
```

#### Dependencies (lines 25-43)
- `tenantRepository` interface (Create, GetByID, GetBySlug, Update, List, Delete, Upsert)
- `userTenantRepository` interface (ListTenantsForUser, AddUserToTenant)

#### Input Types

**CreateTenantInput** (lines 50-62):
- `Name` string (required, non-empty after trim)
- `Slug` string (required, >= 3 chars, lowercased)
- `AddressStreet` string (required, non-empty)
- `AddressZip` string (required, non-empty)
- `AddressCity` string (required, non-empty)
- `AddressCountry` string (required, non-empty)
- `Phone` *string (optional)
- `Email` *string (optional)
- `PayrollExportBasePath` *string (optional)
- `Notes` *string (optional)
- `VacationBasis` *model.VacationBasis (optional, defaults to "calendar_year")

**UpdateTenantInput** (lines 64-76): All fields optional (`*string` / `*bool` / `*model.VacationBasis`)

#### Business Logic Rules

1. **Create** (lines 79-134):
   - Slug: lowercased, trimmed, min 3 chars
   - Name: trimmed, non-empty
   - Address: all 4 fields (street, zip, city, country) must be non-empty
   - Slug uniqueness check via `GetBySlug`
   - VacationBasis defaults to `calendar_year`, must be `calendar_year` or `entry_date`
   - Sets `IsActive = true` by default

2. **Update** (lines 155-215):
   - Only provided fields are updated (nil = skip)
   - Same validation as create for each field
   - VacationBasis validated against enum

3. **Deactivate** (lines 223-230):
   - Fetches tenant by ID, sets `IsActive = false`, saves

4. **ListForUser** (line 249-251):
   - Returns only tenants the user has access to via `userTenantRepo.ListTenantsForUser`

5. **AddUserToTenant** (lines 254-256):
   - Delegates to `userTenantRepo.AddUserToTenant` (idempotent)

#### Helper functions (lines 258-271)
- `stringPointer(value string) *string`
- `normalizeOptionalString(value *string) *string` - trims, returns nil if empty

### 1.2 Tenant Handler

**File:** `/home/tolga/projects/terp/apps/api/internal/handler/tenant.go`

#### Endpoints & Behavior

1. **List** (lines 26-72): GET /tenants
   - Gets authenticated user via `auth.UserFromContext`
   - Calls `ListForUser(ctx, user.ID)` -- only returns user-authorized tenants
   - Optional client-side name filter (query param `name`, case-insensitive contains)
   - Optional active filter (query param `active`, boolean)

2. **Get** (lines 74-89): GET /tenants/{id}
   - Parses UUID from URL param
   - Calls `GetByID`

3. **Create** (lines 91-150): POST /tenants
   - Decodes `models.CreateTenantRequest` (generated from OpenAPI)
   - Validates with `.Validate(nil)`
   - Maps to `service.CreateTenantInput`
   - **After creation: auto-adds creating user to tenant** via `AddUserToTenant(ctx, user.ID, tenant.ID, "owner")`
   - Error mapping: slug exists -> 400, invalid slug -> 400, etc.

4. **Update** (lines 152-213): PATCH /tenants/{id}
   - Fetches tenant first, then applies partial update
   - Uses `models.UpdateTenantRequest`

5. **Delete** (lines 215-234): DELETE /tenants/{id}
   - Calls `Deactivate` (NOT actual delete) -> sets `is_active = false`
   - Returns 204 No Content

### 1.3 Tenant Repository

**File:** `/home/tolga/projects/terp/apps/api/internal/repository/tenant.go`

**TenantListFilters** (lines 24-27):
```go
type TenantListFilters struct {
    Name   *string
    Active *bool
}
```

Operations: Create, GetByID, GetBySlug, Update, List (with filters), Delete, Upsert. All standard GORM.

### 1.4 User Service

**File:** `/home/tolga/projects/terp/apps/api/internal/service/user.go`

#### Error Sentinels (lines 16-26)
```go
ErrUserNotFound           = errors.New("user not found")
ErrPermissionDenied       = errors.New("permission denied")
ErrInvalidCredentials     = errors.New("invalid credentials")
ErrUserInactive           = errors.New("user inactive")
ErrUserLocked             = errors.New("user locked")
ErrPasswordNotSet         = errors.New("password not set")
ErrPasswordRequired       = errors.New("password required")
ErrInvalidCurrentPassword = errors.New("invalid current password")
ErrInvalidDataScopeType   = errors.New("invalid data scope type")
```

#### Dependencies (lines 33-38)
- `userRepo` (*repository.UserRepository)
- `userGroupRepo` (userGroupLookupRepository - GetByID only)
- `notificationSvc` (*NotificationService)
- `userTenantRepo` (userTenantRepoForUser - AddUserToTenant only)

#### Input Types

**CreateUserInput** (lines 44-59):
- TenantID, Email, Username, DisplayName, UserGroupID, EmployeeID
- Password, SSOID, IsActive, IsLocked
- DataScopeType, DataScopeTenantIDs, DataScopeDepartmentIDs, DataScopeEmployeeIDs

**ChangePasswordInput** (lines 61-68):
- RequesterID, TargetID, RequesterRole, RequesterCanManage
- CurrentPassword, NewPassword

#### Business Logic Rules

1. **CreateUser** (lines 386-465):
   - Sets `Role = user`, `IsActive = true`, `IsLocked = false` defaults
   - Normalizes DataScopeType (default "all", validates enum)
   - Hashes password with bcrypt if provided
   - If UserGroupID provided: looks up group, sets `user.UserGroupID`, promotes to admin if `group.IsAdmin`
   - **Auto-adds user to tenant** via `userTenantRepo.AddUserToTenant(ctx, user.ID, *user.TenantID, "member")`

2. **Update** (lines 209-346):
   - Permission check: requester must be self, have `users.manage`, or be admin
   - Admin-only fields: user_group_id, is_active, is_locked, data_scope_*, sso_id, employee_id, username
   - Updates map[string]any (loose typing)
   - If `user_group_id` changes: looks up group, sets role to admin if `group.IsAdmin`, user otherwise
   - Sends notification on display_name change

3. **Delete** (lines 349-371):
   - Admin or `users.manage` permission required
   - Cannot delete yourself

4. **ChangePassword** (lines 483-516):
   - Permission check: self, admin, or `users.manage`
   - Self-change (non-admin): must provide valid current password
   - Admin/manager: can change without current password
   - Hashes new password with bcrypt

5. **List** (lines 194-206):
   - Takes `ListUsersParams` (Query, Limit, Cursor)
   - Returns users + total count

6. **GetByID** (lines 105-111), **GetWithRelations** (lines 114-120), **GetByEmail** (lines 123-129)

### 1.5 User Handler

**File:** `/home/tolga/projects/terp/apps/api/internal/handler/user.go`

#### Endpoints & Behavior

1. **List** (lines 35-62): GET /users
   - Query params: `search` (string), `limit` (int, default 20, max 100)
   - Returns `{ data: User[], meta: { total, limit } }`

2. **Create** (lines 65-188): POST /users
   - Uses `models.CreateUserRequest` (generated)
   - TenantID from body or `X-Tenant-ID` header fallback
   - Audit logs on success
   - Returns 201 with user response

3. **GetByID** (lines 191-211): GET /users/{id}

4. **Update** (lines 214-363): PATCH /users/{id}
   - Uses inline struct for request (not generated model for PATCH)
   - Calls `hasUsersManagePermission(ctx)` to check `users.manage` permission
   - Audit logs on success

5. **Delete** (lines 366-403): DELETE /users/{id}
   - Checks `users.manage` permission
   - Returns 204

6. **ChangePassword** (lines 406-464): POST /users/{id}/password
   - Body: `{ current_password, new_password }`
   - Returns 204

#### Permission Helper (lines 466-472)
```go
func hasUsersManagePermission(ctx context.Context) bool {
    checker, ok := middleware.PermissionCheckerFromContext(ctx)
    return ok && checker.Has(permissions.ID("users.manage").String())
}
```

### 1.6 User Repository

**File:** `/home/tolga/projects/terp/apps/api/internal/repository/user.go`

**ListUsersParams** (lines 111-115):
```go
type ListUsersParams struct {
    Query  string
    Limit  int
    Cursor *uuid.UUID
}
```

Operations: Create, GetByID, GetByEmail, FindByEmail (no tenant), GetByEmployeeID, Update, UpdateRoleByGroup, List (with search+pagination), Count, Delete, Upsert, GetByUsername, ListByTenant, GetWithRelations (preloads Tenant, UserGroup, Employee).

### 1.7 UserGroup Service

**File:** `/home/tolga/projects/terp/apps/api/internal/service/usergroup.go`

#### Error Sentinels (lines 15-24)
```go
ErrUserGroupNotFound       = errors.New("user group not found")
ErrUserGroupNameRequired   = errors.New("user group name is required")
ErrUserGroupNameExists     = errors.New("user group with this name already exists")
ErrUserGroupCodeRequired   = errors.New("user group code is required")
ErrUserGroupCodeExists     = errors.New("user group code already exists for this tenant")
ErrCannotDeleteSystemGroup = errors.New("cannot delete system group")
ErrCannotModifySystemGroup = errors.New("cannot modify system group")
ErrInvalidPermissionID     = errors.New("invalid permission id")
```

#### Dependencies
- `userGroupRepo` (userGroupRepositoryForService - Create, GetByID, GetByName, GetByCode, Update, Upsert, Delete, List, ListByActive)
- `userRepo` (userRepository - UpdateRoleByGroup only)

#### Input Types

**CreateUserGroupInput** (lines 53-61):
- TenantID (uuid), Name (string), Code (string), Description (string)
- Permissions ([]string - permission UUIDs), IsAdmin (bool), IsActive (bool)

**UpdateUserGroupInput** (lines 137-144):
All optional: Name, Code, Description, Permissions (*[]string), IsAdmin, IsActive (*bool)

#### Business Logic Rules

1. **Create** (lines 64-125):
   - Name: trimmed, non-empty
   - Code: trimmed, uppercased; defaults to uppercased name if empty
   - Uniqueness checks: name and code within tenant
   - Validates all permission IDs against catalog (calls `permissions.Lookup(id)`)
   - Converts permissions to JSON bytes
   - `IsActive` defaults to true if not set
   - `IsSystem = false` always for created groups

2. **Update** (lines 147-233):
   - System groups cannot be modified
   - Name uniqueness check (if changed)
   - Code uniqueness check (if changed), uppercased
   - Permission validation
   - **If IsAdmin changed: updates role for all users in the group** via `userRepo.UpdateRoleByGroup`

3. **Delete** (lines 236-248):
   - System groups cannot be deleted
   - Fetches to verify existence first

4. **List** (lines 251-256):
   - Optional `active` filter (if provided, uses `ListByActive`)
   - Includes system groups (tenant_id IS NULL)

#### Permission Validation (lines 281-288)
```go
func validatePermissionIDs(ids []string) error {
    for _, id := range ids {
        if _, ok := permissions.Lookup(id); !ok {
            return ErrInvalidPermissionID
        }
    }
    return nil
}
```

### 1.8 UserGroup Handler

**File:** `/home/tolga/projects/terp/apps/api/internal/handler/usergroup.go`

#### Endpoints & Behavior

1. **List** (lines 28-57): GET /user-groups
   - Gets tenantID from context (middleware)
   - Optional `active` query param (boolean)
   - Returns `{ data: UserGroup[] }`

2. **Get** (lines 59-74): GET /user-groups/{id}

3. **Create** (lines 76-140): POST /user-groups
   - Uses `models.CreateUserGroupRequest`
   - Converts `PermissionIds` (strfmt.UUID[]) to string[]
   - Audit log on success

4. **Update** (lines 142-219): PATCH /user-groups/{id}
   - Uses `models.UpdateUserGroupRequest`
   - **Note (line 178-181):** IsAdmin/IsActive always set (cannot distinguish "provided" vs "default false")

5. **Delete** (lines 221-253): DELETE /user-groups/{id}
   - Returns 204

### 1.9 UserGroup Repository

**File:** `/home/tolga/projects/terp/apps/api/internal/repository/usergroup.go`

Operations: Create, GetByID, GetByName, GetByCode, Update, Delete, List, Upsert, ListByActive.

**List** (lines 102-113): Includes system groups via `WHERE tenant_id = ? OR tenant_id IS NULL`, ordered by `is_system DESC, name ASC`.

**GetByName/GetByCode** (lines 51-65, 68-82): Includes system groups (tenant_id OR NULL), returns nil (not error) if not found.

### 1.10 Route Registration / Permissions

**File:** `/home/tolga/projects/terp/apps/api/internal/handler/routes.go`

**Tenant Routes** (lines 60-81):
- `GET /tenants` -- open to all authenticated users (no permission required)
- `POST /tenants` -- requires `tenants.manage`
- `GET /tenants/{id}` -- requires `tenants.manage`
- `PATCH /tenants/{id}` -- requires `tenants.manage`
- `DELETE /tenants/{id}` -- requires `tenants.manage`

**User Routes** (lines 37-58):
- `GET /users` -- requires `users.manage`
- `POST /users` -- requires `users.manage`
- `GET /users/{id}` -- requires `users.manage`
- `PATCH /users/{id}` -- self OR `users.manage`
- `DELETE /users/{id}` -- requires `users.manage`
- `POST /users/{id}/password` -- self OR `users.manage`

**UserGroup Routes** (lines 173-192):
- All CRUD operations require `users.manage`

### 1.11 Response Mappers

**File:** `/home/tolga/projects/terp/apps/api/internal/handler/response.go`

- `mapUserToResponse(u *model.User) *models.User` (lines 28-98) -- Maps all fields including DataScope arrays
- `mapUsersToResponse(users []model.User) []*models.User` (lines 100-106)
- `mapUserGroupToResponse(ug *model.UserGroup) *models.UserGroup` (lines 108-158) -- Includes resolved permissions (looks up each permission ID from catalog)

---

## 2. Existing tRPC Setup

### 2.1 Server Initialization

**File:** `/home/tolga/projects/terp/apps/web/src/server/trpc.ts`

#### Context Type (lines 39-49)
```typescript
export type TRPCContext = {
  prisma: PrismaClient
  authToken: string | null
  user: ContextUser | null
  session: Session | null
  tenantId: string | null
}
```

#### ContextUser Type (lines 28-31)
```typescript
export type ContextUser = PrismaUser & {
  userGroup: UserGroup | null
  userTenants: (UserTenant & { tenant: Tenant })[]
}
```

#### Context Factory (lines 57-120)
`createTRPCContext(opts: FetchCreateContextFnOptions): Promise<TRPCContext>`
- Extracts Bearer token from Authorization header
- Extracts tenant ID from `x-tenant-id` header
- Validates token with Supabase admin client (`getUser`)
- Loads user from DB with `prisma.user.findUnique` including `userGroup` and `userTenants.tenant`
- Rejects inactive (`isActive !== false`) or locked users

#### Procedure Types (lines 127-214)
- `publicProcedure` (line 155) -- no auth required
- `protectedProcedure` (lines 161-176) -- requires `user` and `session` non-null, narrows context
- `tenantProcedure` (lines 186-214) -- extends protectedProcedure, requires `tenantId` header, validates user has access to tenant via `userTenants`

#### Exported Factories (lines 143-149)
```typescript
export const createTRPCRouter = t.router
export const createCallerFactory = t.createCallerFactory
export const createMiddleware = t.middleware
```

#### Error Formatting (lines 127-138)
Includes Zod error flattening in error response.

### 2.2 Root Router

**File:** `/home/tolga/projects/terp/apps/web/src/server/root.ts`

```typescript
export const appRouter = createTRPCRouter({
  health: healthRouter,
  auth: authRouter,
  permissions: permissionsRouter,
})
export type AppRouter = typeof appRouter
export const createCaller = createCallerFactory(appRouter)
```

New routers (tenants, users, userGroups) will be added here.

### 2.3 Server Exports

**File:** `/home/tolga/projects/terp/apps/web/src/server/index.ts`

Exports: `appRouter`, `AppRouter`, `createCaller`, `createTRPCContext`, `createTRPCRouter`, `createMiddleware`, `publicProcedure`, `protectedProcedure`, `tenantProcedure`, `requirePermission`, `requireSelfOrPermission`, `requireEmployeePermission`, `applyDataScope`, `DataScope`, `DataScopeType`.

### 2.4 Example Routers

#### Health Router
**File:** `/home/tolga/projects/terp/apps/web/src/server/routers/health.ts`
- Uses `publicProcedure`
- Defines output schema with `z.object()`
- Single `query` that tests DB connectivity

#### Auth Router
**File:** `/home/tolga/projects/terp/apps/web/src/server/routers/auth.ts`
- Uses `protectedProcedure`
- Three procedures: `me` (query), `permissions` (query), `logout` (mutation)
- Defines output schemas inline with Zod
- Uses `resolvePermissions(user)` and `isUserAdmin(user)` from lib
- Uses `createAdminClient()` for Supabase admin operations

#### Permissions Router
**File:** `/home/tolga/projects/terp/apps/web/src/server/routers/permissions.ts`
- Uses `protectedProcedure`
- Single `list` query returning static permission catalog

### 2.5 Authorization Middleware

**File:** `/home/tolga/projects/terp/apps/web/src/server/middleware/authorization.ts`

Four middleware functions:

1. **`requirePermission(...permissionIds: string[])`** (lines 39-58)
   - OR logic: user needs ANY of the specified permissions
   - Uses `hasAnyPermission(user, permissionIds)`

2. **`requireSelfOrPermission(userIdGetter, permissionId)`** (lines 72-102)
   - Allows if `user.id === targetUserId`
   - Otherwise checks `hasPermission(user, permissionId)`

3. **`requireEmployeePermission(employeeIdGetter, ownPermission, allPermission)`** (lines 118-159)
   - Admin bypass
   - Own employee: needs ownPermission OR allPermission
   - Other employee: needs allPermission only

4. **`applyDataScope()`** (lines 186-201)
   - Reads `user.dataScopeType` and scope arrays
   - Adds `DataScope` object to context

### 2.6 Permission Library

**File:** `/home/tolga/projects/terp/apps/web/src/server/lib/permissions.ts`

Functions: `resolvePermissions(user)`, `isUserAdmin(user)`, `hasPermission(user, permissionId)`, `hasAnyPermission(user, permissionIds)`

**File:** `/home/tolga/projects/terp/apps/web/src/server/lib/permission-catalog.ts`

- `ALL_PERMISSIONS` array (46 permissions)
- `permissionIdByKey(key: string): string | undefined` -- key lookup (e.g., "users.manage" -> UUID)
- `lookupPermission(id: string): Permission | undefined`
- `listPermissions(): Permission[]`

Relevant permission keys for this ticket:
- `"users.manage"` -- used for user and user group CRUD
- `"tenants.manage"` -- used for tenant CRUD (except list)

### 2.7 tRPC API Route Handler

**File:** `/home/tolga/projects/terp/apps/web/src/app/api/trpc/[trpc]/route.ts`

Uses `fetchRequestHandler` from `@trpc/server/adapters/fetch` at endpoint `/api/trpc`.

### 2.8 tRPC Client (Frontend)

**File:** `/home/tolga/projects/terp/apps/web/src/trpc/provider.tsx`

- Creates `TRPCClient<AppRouter>` with `httpBatchLink`
- URL: `/api/trpc`
- Headers: Authorization (Bearer token from Supabase session), x-tenant-id from `tenantIdStorage`
- Shared `QueryClient` between tRPC and legacy hooks

**File:** `/home/tolga/projects/terp/apps/web/src/trpc/context.ts`

```typescript
export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>()
```

**File:** `/home/tolga/projects/terp/apps/web/src/trpc/index.ts`

Exports: `TRPCProvider`, `useTRPC`, `useTRPCClient`, `TRPCReactProvider`

---

## 3. Prisma Schema

**File:** `/home/tolga/projects/terp/apps/web/prisma/schema.prisma`

### 3.1 User Model (lines 28-64)

```prisma
model User {
  id                     String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email                  String    @unique @db.VarChar(255)
  displayName            String    @map("display_name") @db.VarChar(255)
  avatarUrl              String?   @map("avatar_url") @db.Text
  role                   String    @default("user") @db.VarChar(50)
  createdAt              DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt              DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  tenantId               String?   @map("tenant_id") @db.Uuid
  userGroupId            String?   @map("user_group_id") @db.Uuid
  employeeId             String?   @unique @map("employee_id") @db.Uuid
  username               String?   @db.VarChar(100)
  isActive               Boolean?  @default(true) @map("is_active")
  deletedAt              DateTime? @map("deleted_at") @db.Timestamptz(6)
  passwordHash           String?   @map("password_hash") @db.VarChar(255)
  ssoId                  String?   @map("sso_id") @db.VarChar(255)
  isLocked               Boolean   @default(false) @map("is_locked")
  dataScopeType          String    @default("all") @map("data_scope_type") @db.VarChar(20)
  dataScopeTenantIds     String[]  @default([]) @map("data_scope_tenant_ids") @db.Uuid
  dataScopeDepartmentIds String[]  @default([]) @map("data_scope_department_ids") @db.Uuid
  dataScopeEmployeeIds   String[]  @default([]) @map("data_scope_employee_ids") @db.Uuid

  tenant      Tenant?      @relation(fields: [tenantId], references: [id])
  userGroup   UserGroup?   @relation(fields: [userGroupId], references: [id])
  employee    Employee?    @relation(fields: [employeeId], references: [id], onDelete: SetNull)
  userTenants UserTenant[]

  @@unique([tenantId, email], map: "idx_users_tenant_email")
  @@map("users")
}
```

Note: `isActive` is `Boolean?` (nullable), `isLocked` is `Boolean` (non-nullable).

### 3.2 Tenant Model (lines 76-114)

```prisma
model Tenant {
  id                   String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name                 String    @db.VarChar(255)
  slug                 String    @unique @db.VarChar(100)
  settings             Json?     @default("{}") @db.JsonB
  isActive             Boolean?  @default(true) @map("is_active")
  createdAt            DateTime? @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt            DateTime? @default(now()) @map("updated_at") @db.Timestamptz(6)
  addressStreet        String?   @map("address_street") @db.VarChar(255)
  addressZip           String?   @map("address_zip") @db.VarChar(20)
  addressCity          String?   @map("address_city") @db.VarChar(100)
  addressCountry       String?   @map("address_country") @db.VarChar(100)
  phone                String?   @db.VarChar(50)
  email                String?   @db.VarChar(255)
  payrollExportBasePath String?  @map("payroll_export_base_path") @db.Text
  notes                String?   @db.Text
  vacationBasis        String    @default("calendar_year") @map("vacation_basis") @db.VarChar(20)

  users       User[]
  userGroups  UserGroup[]
  userTenants UserTenant[]
  // ... other relations

  @@map("tenants")
}
```

Note: `isActive` is `Boolean?` (nullable), `createdAt`/`updatedAt` are `DateTime?`.

### 3.3 UserGroup Model (lines 127-147)

```prisma
model UserGroup {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String?   @map("tenant_id") @db.Uuid
  name        String    @db.VarChar(100)
  code        String    @db.VarChar(50)
  description String?   @db.Text
  permissions Json?     @default("[]") @db.JsonB
  isAdmin     Boolean?  @default(false) @map("is_admin")
  isSystem    Boolean?  @default(false) @map("is_system")
  isActive    Boolean   @default(true) @map("is_active")
  createdAt   DateTime? @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime? @default(now()) @map("updated_at") @db.Timestamptz(6)

  tenant Tenant? @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  users  User[]

  @@index([tenantId], map: "idx_user_groups_tenant")
  @@map("user_groups")
}
```

Note: `isAdmin` and `isSystem` are `Boolean?` (nullable). `tenantId` is nullable (NULL = system group).

### 3.4 UserTenant Model (lines 156-169)

```prisma
model UserTenant {
  userId    String   @map("user_id") @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  role      String   @default("member") @db.VarChar(50)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@id([userId, tenantId])
  @@map("user_tenants")
}
```

Composite primary key: `(userId, tenantId)`. No surrogate ID.

---

## 4. Frontend Hooks

### 4.1 Tenants

**File:** `/home/tolga/projects/terp/apps/web/src/hooks/api/use-tenants.ts`

```typescript
// List tenants
export function useTenants(options: UseTenantsOptions = {}) {
  return useApiQuery('/tenants', { enabled, params })
}
// Get single tenant
export function useTenant(id: string, enabled = true) {
  return useApiQuery('/tenants/{id}', { path: { id }, enabled })
}
// Create tenant
export function useCreateTenant() {
  return useApiMutation('/tenants', 'post', { invalidateKeys: [['/tenants']] })
}
// Update tenant
export function useUpdateTenant() {
  return useApiMutation('/tenants/{id}', 'patch', { invalidateKeys: [['/tenants']] })
}
// Deactivate tenant (uses DELETE)
export function useDeactivateTenant() {
  return useApiMutation('/tenants/{id}', 'delete', { invalidateKeys: [['/tenants']] })
}
```

### 4.2 User (Single)

**File:** `/home/tolga/projects/terp/apps/web/src/hooks/api/use-user.ts`

```typescript
export function useUser(userId: string, enabled = true) {
  return useApiQuery('/users/{id}', { path: { id: userId }, enabled })
}
export function useUpdateUser() {
  return useApiMutation('/users/{id}', 'patch', {
    invalidateKeys: [['/users/{id}'], ['/auth/me'], ['/users']],
  })
}
```

### 4.3 Users (List)

**File:** `/home/tolga/projects/terp/apps/web/src/hooks/api/use-users.ts`

```typescript
export function useUsers(options: UseUsersOptions = {}) {
  return useApiQuery('/users', { params: { limit, search }, enabled })
}
export function useCreateUser() {
  return useApiMutation('/users', 'post', { invalidateKeys: [['/users']] })
}
export function useDeleteUser() {
  return useApiMutation('/users/{id}', 'delete', { invalidateKeys: [['/users']] })
}
export function useChangeUserPassword() {
  return useApiMutation('/users/{id}/password', 'post')
}
```

### 4.4 User Groups

**File:** `/home/tolga/projects/terp/apps/web/src/hooks/api/use-user-groups.ts`

```typescript
export function useUserGroups(options: UseUserGroupsOptions = {}) {
  return useApiQuery('/user-groups', { params: { active }, enabled })
}
export function useUserGroup(id: string, enabled = true) {
  return useApiQuery('/user-groups/{id}', { path: { id }, enabled })
}
export function useCreateUserGroup() {
  return useApiMutation('/user-groups', 'post', {
    invalidateKeys: [['/user-groups'], ['/permissions']],
  })
}
export function useUpdateUserGroup() {
  return useApiMutation('/user-groups/{id}', 'patch', {
    invalidateKeys: [['/user-groups'], ['/user-groups/{id}'], ['/auth/permissions']],
  })
}
export function useDeleteUserGroup() {
  return useApiMutation('/user-groups/{id}', 'delete', {
    invalidateKeys: [['/user-groups'], ['/auth/permissions']],
  })
}
```

### 4.5 Legacy API Client

All hooks use `useApiQuery` and `useApiMutation` from `/home/tolga/projects/terp/apps/web/src/hooks/use-api-query.ts` and `/home/tolga/projects/terp/apps/web/src/hooks/use-api-mutation.ts`.

These use `api.GET()`, `api.POST()`, etc. from `@/lib/api` (openapi-fetch), typed against `paths` from `@/lib/api/types`.

The tRPC replacement hooks will use `useTRPC()` from `@/trpc/context` instead.

---

## 5. Existing Patterns

### 5.1 tRPC Procedure Pattern (from auth router)

```typescript
export const someRouter = createTRPCRouter({
  procedureName: protectedProcedure
    .input(z.object({ /* input schema */ }))          // optional
    .output(z.object({ /* output schema */ }))         // optional
    .query(async ({ ctx, input }) => {
      // Access ctx.prisma, ctx.user, ctx.tenantId
      // Return typed data
    }),

  mutationName: tenantProcedure
    .use(requirePermission(permissionId))              // middleware chaining
    .input(z.object({ /* input schema */ }))
    .mutation(async ({ ctx, input }) => {
      // Perform mutation
    }),
})
```

### 5.2 Error Handling Pattern

From existing tRPC code, errors are thrown as `TRPCError`:

```typescript
throw new TRPCError({
  code: "NOT_FOUND",       // maps to HTTP status
  message: "Human-readable message",
})
```

Available codes used: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`, `CONFLICT`, `INTERNAL_SERVER_ERROR`.

### 5.3 Permission Check Pattern

From authorization middleware, permissions are checked by UUID. The UUID is obtained from the permission catalog:

```typescript
import { permissionIdByKey } from "../lib/permission-catalog"

// Get permission UUID from key
const USERS_MANAGE = permissionIdByKey("users.manage")!
const TENANTS_MANAGE = permissionIdByKey("tenants.manage")!

// Use in middleware chain
tenantProcedure.use(requirePermission(USERS_MANAGE))
```

### 5.4 Supabase Admin Client for Password Changes

**File:** `/home/tolga/projects/terp/apps/web/src/lib/supabase/admin.ts`

The Go service uses bcrypt for password hashing. The tRPC version should use the Supabase Admin API for password changes since authentication is now handled by Supabase:

```typescript
import { createAdminClient } from "@/lib/supabase/admin"

const adminClient = createAdminClient()
// Update user password via Supabase admin
await adminClient.auth.admin.updateUserById(userId, { password: newPassword })
```

Note: The Go backend hashes passwords with bcrypt and stores in `password_hash` column. The tRPC version should use Supabase Admin API instead since Supabase manages auth.

### 5.5 Prisma Database Client

**File:** `/home/tolga/projects/terp/apps/web/src/lib/db/prisma.ts`

Singleton PrismaClient available via `ctx.prisma` in tRPC procedures. Uses PrismaPg adapter for PostgreSQL.

### 5.6 Root Router Registration Pattern

New routers are added to `/home/tolga/projects/terp/apps/web/src/server/root.ts`:

```typescript
import { tenantsRouter } from "./routers/tenants"
import { usersRouter } from "./routers/users"
import { userGroupsRouter } from "./routers/userGroups"

export const appRouter = createTRPCRouter({
  health: healthRouter,
  auth: authRouter,
  permissions: permissionsRouter,
  tenants: tenantsRouter,      // new
  users: usersRouter,          // new
  userGroups: userGroupsRouter, // new
})
```

---

## 6. Go Model Types (for reference)

### 6.1 VacationBasis Enum

**File:** `/home/tolga/projects/terp/apps/api/internal/model/tariff.go` (lines 12-21)
```go
type VacationBasis string
const (
    VacationBasisCalendarYear VacationBasis = "calendar_year"
    VacationBasisEntryDate    VacationBasis = "entry_date"
)
```

### 6.2 UserRole Enum

**File:** `/home/tolga/projects/terp/apps/api/internal/model/user.go` (lines 12-17)
```go
type UserRole string
const (
    RoleUser  UserRole = "user"
    RoleAdmin UserRole = "admin"
)
```

### 6.3 DataScopeType Enum

**File:** `/home/tolga/projects/terp/apps/api/internal/model/user.go` (lines 19-26)
```go
type DataScopeType string
const (
    DataScopeAll        DataScopeType = "all"
    DataScopeTenant     DataScopeType = "tenant"
    DataScopeDepartment DataScopeType = "department"
    DataScopeEmployee   DataScopeType = "employee"
)
```

---

## 7. Key Implementation Notes

### 7.1 Tenant List: No Permission Required
`GET /tenants` is open to all authenticated users. The data is filtered to only show tenants the user has access to. This maps to `protectedProcedure` (not tenantProcedure), since there is no tenant context for listing tenants.

### 7.2 Tenant CRUD: Auto-Add Creator
When creating a tenant, the handler auto-adds the creating user to the new tenant with role `"owner"` via `AddUserToTenant`.

### 7.3 User Create: Auto-Add to Tenant
When creating a user with a `tenantId`, the service auto-adds the user to that tenant via `userTenantRepo.AddUserToTenant(ctx, user.ID, *user.TenantID, "member")`.

### 7.4 UserGroup IsAdmin Change: Cascade Role Update
When a user group's `isAdmin` flag changes, all users in that group get their `role` column updated via `userRepo.UpdateRoleByGroup(groupID, newRole)`.

### 7.5 System Groups Protection
System groups (`isSystem = true`) cannot be modified or deleted.

### 7.6 Password Change Mechanism
The Go backend uses bcrypt hashing stored in `password_hash`. For the tRPC version, since auth is managed by Supabase, password changes should use the Supabase Admin API (`adminClient.auth.admin.updateUserById`). The `password_hash` column in the DB may still need to be updated for backward compatibility if the Go backend is still running.

### 7.7 UserGroup Permissions: JSON Array of UUID Strings
The `permissions` column is JSONB containing a JSON array of permission UUID strings (e.g., `["uuid1", "uuid2"]`). These are validated against the permission catalog.

### 7.8 Tenant ID Sources
- For tenant-scoped operations: from `ctx.tenantId` (X-Tenant-ID header)
- For user creation: from request body `tenantId` OR fallback to `ctx.tenantId`
- For tenant list: not required (protectedProcedure, not tenantProcedure)
