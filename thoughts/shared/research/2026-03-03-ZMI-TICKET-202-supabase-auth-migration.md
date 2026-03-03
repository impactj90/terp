# Research: ZMI-TICKET-202 — Supabase Auth Migration

Date: 2026-03-03

---

## 1. Current Go Auth Implementation

### 1.1 JWT Management

**File:** `/home/tolga/projects/terp/apps/api/internal/auth/jwt.go` (87 lines)

The JWT system uses `github.com/golang-jwt/jwt/v5` with HMAC-SHA256 signing.

**Claims struct:**
```go
type Claims struct {
    jwt.RegisteredClaims
    UserID      uuid.UUID `json:"user_id"`
    Email       string    `json:"email"`
    DisplayName string    `json:"display_name"`
    Role        string    `json:"role"`
}
```

**JWTManager struct:**
```go
type JWTManager struct {
    Secret []byte
    Issuer string
    Expiry time.Duration
}
```

Key methods:
- `Generate(userID uuid.UUID, email, name, role string) (string, error)` — creates a signed JWT with standard claims (Issuer, Subject, IssuedAt, ExpiresAt, NotBefore) plus custom claims (UserID, Email, DisplayName, Role).
- `Validate(tokenString string) (*Claims, error)` — parses and validates a JWT, returns `ErrExpiredToken` or `ErrInvalidToken`.

### 1.2 Auth Config

**File:** `/home/tolga/projects/terp/apps/api/internal/auth/config.go` (31 lines)

```go
type Config struct {
    DevMode      bool
    JWTSecret    []byte
    JWTExpiry    time.Duration
    JWTIssuer    string
    CookieSecure bool
    FrontendURL  string
}
```

Loaded in `main.go` (lines 42-49):
```go
authConfig := &auth.Config{
    DevMode:      cfg.IsDevelopment(),
    JWTSecret:    []byte(cfg.JWT.Secret),
    JWTExpiry:    cfg.JWT.Expiry,
    JWTIssuer:    "terp-api",
    CookieSecure: cfg.IsProduction(),
    FrontendURL:  cfg.FrontendURL,
}
```

Environment variables from `/home/tolga/projects/terp/apps/api/internal/config/config.go`:
- `JWT_SECRET` (default: `"dev-secret-change-in-production"`)
- `JWT_EXPIRY` (default: `"24h"`)
- `ENV` (default: `"development"`)

### 1.3 Auth Context

**File:** `/home/tolga/projects/terp/apps/api/internal/auth/context.go` (51 lines)

**Context User struct** (the lightweight user stored in request context):
```go
type User struct {
    ID          uuid.UUID `json:"id"`
    Email       string    `json:"email"`
    DisplayName string    `json:"display_name"`
    Role        string    `json:"role"`
}
```

Key functions:
- `ContextWithUser(ctx, *User) context.Context`
- `UserFromContext(ctx) (*User, bool)`
- `ContextWithClaims(ctx, *Claims) context.Context`
- `ClaimsFromContext(ctx) (*Claims, bool)`
- `User.IsAdmin() bool` — checks `u.Role == "admin"`

### 1.4 Auth Middleware

**File:** `/home/tolga/projects/terp/apps/api/internal/middleware/auth.go` (71 lines)

`AuthMiddleware(jwtManager)` returns an `http.Handler` middleware that:
1. Extracts token from `Authorization: Bearer <token>` header, falling back to `token` cookie.
2. Returns 401 if no token is found.
3. Validates the token via `jwtManager.Validate(tokenString)`.
4. On success, creates an `auth.User` from claims and adds both user and claims to request context.

Token extraction order:
1. `Authorization` header (Bearer scheme)
2. `token` cookie

### 1.5 Auth Handler

**File:** `/home/tolga/projects/terp/apps/api/internal/handler/auth.go` (912 lines)

**AuthHandler struct** — has 24 dependencies injected via constructor:
- `jwtManager`, `authConfig`
- `userService`, `tenantService`, `employeeService`
- `bookingTypeService`, `absenceService`, `holidayService`
- `dayPlanService`, `weekPlanService`, `tariffService`
- `departmentService`, `teamService`
- Various repos: `bookingRepo`, `dailyValueRepo`, `monthlyValueRepo`, `empDayPlanRepo`, `absenceDayRepo`, `vacationBalanceRepo`, `accountRepo`
- `vacationConfigSeeder`, `shiftService`, `userGroupService`

**Endpoints:**

| Method | Path | Handler | Auth Required |
|--------|------|---------|---------------|
| GET | `/auth/dev/login` | `DevLogin` | No (dev only) |
| GET | `/auth/dev/users` | `DevUsers` | No (dev only) |
| POST | `/auth/login` | `Login` | No |
| POST | `/auth/refresh` | `Refresh` | Yes |
| GET | `/auth/me` | `Me` | Yes |
| GET | `/auth/permissions` | `Permissions` | Yes |
| POST | `/auth/logout` | `Logout` | Yes |

**Route registration** (`/home/tolga/projects/terp/apps/api/internal/handler/routes.go`, lines 16-35):
```go
func RegisterAuthRoutes(r chi.Router, h *AuthHandler, jwtManager *auth.JWTManager, devMode bool) {
    r.Route("/auth", func(r chi.Router) {
        if devMode {
            r.Get("/dev/login", h.DevLogin)
            r.Get("/dev/users", h.DevUsers)
        }
        r.Post("/login", h.Login)
        r.Post("/refresh", h.Refresh)
        r.Group(func(r chi.Router) {
            r.Use(middleware.AuthMiddleware(jwtManager))
            r.Get("/me", h.Me)
            r.Get("/permissions", h.Permissions)
            r.Post("/logout", h.Logout)
        })
    })
}
```

### 1.6 Auth Flow Detail

**Login flow (`Login` handler, lines 666-782):**
1. Decodes `{email, password}` from request body.
2. Two paths based on `X-Tenant-ID` header presence:
   - **With tenant header:** Calls `userService.Authenticate(ctx, tenantID, email, password)` — looks up user by email within the tenant.
   - **Without tenant header:** Calls `userService.AuthenticateByEmail(ctx, email, password)` — global email lookup, then loads tenant from `user.TenantID`.
3. Both paths verify: user is active, not locked, password hash matches (bcrypt).
4. Backfills `user_tenants` entry via `tenantService.AddUserToTenant()`.
5. Generates JWT with `jwtManager.Generate(user.ID, user.Email, user.DisplayName, string(user.Role))`.
6. Sets `token` HTTP-only cookie (Lax same-site, secure in production, max-age = JWT expiry).
7. Returns JSON: `{token, user, tenant}`.

**Refresh flow (`Refresh` handler, lines 786-812):**
1. Gets user from context (requires auth middleware).
2. Generates new JWT token.
3. Sets new cookie.
4. Returns `{token}`.

**Me flow (`Me` handler, lines 816-833):**
1. Gets user from context.
2. Fetches full user from DB via `userService.GetByID()` (includes `employee_id`).
3. Falls back to context user if DB lookup fails.
4. Returns User object directly.

**Permissions flow (`Permissions` handler, lines 837-897):**
1. Gets user from context.
2. Loads full user with relations via `userService.GetWithRelations()` (preloads Tenant, UserGroup, Employee).
3. Logic:
   - If user's UserGroup is inactive: returns empty permissions, `is_admin: false`.
   - If user has admin role or UserGroup.IsAdmin: returns ALL permission IDs from the registry.
   - Otherwise: returns permission IDs from `UserGroup.Permissions` (JSON array in DB).
4. Response: `{ data: { permission_ids: string[], is_admin: boolean } }`

**Logout flow (`Logout` handler, lines 901-912):**
1. Clears the `token` cookie (MaxAge: -1).
2. Returns 204 No Content.

**DevLogin flow (`DevLogin` handler, lines 142-648):**
1. Only available in dev mode.
2. Takes `role` query param (admin/user).
3. Upserts dev tenant, dev users, dev booking types, absence types, holidays, day plans, week plans, shifts, user groups, tariffs, employees, employee-user links, user-tenant entries, employee day plans, departments, teams, team members, accounts, bookings, daily values, monthly values, absence days, vacation balances, and vacation config.
4. Generates JWT and sets cookie.
5. Returns `{token, user, tenant}`.

### 1.7 Dev Users

**File:** `/home/tolga/projects/terp/apps/api/internal/auth/devusers.go` (41 lines)

```go
var DevUsers = map[string]DevUser{
    "admin": {
        ID:          uuid.MustParse("00000000-0000-0000-0000-000000000001"),
        Email:       "admin@dev.local",
        DisplayName: "Dev Admin",
        Role:        "admin",
    },
    "user": {
        ID:          uuid.MustParse("00000000-0000-0000-0000-000000000002"),
        Email:       "user@dev.local",
        DisplayName: "Dev User",
        Role:        "user",
    },
}
```

### 1.8 Dev User Groups

**File:** `/home/tolga/projects/terp/apps/api/internal/auth/devusergroups.go` (109 lines)

Four predefined groups:
- `ADMIN` (19001) — `is_admin: true`, grants all permissions
- `HR` (19002) — 22 explicit permissions
- `TEAMLEAD` (19003) — 10 explicit permissions
- `EMPLOYEE` (19004) — 2 permissions (`time_tracking.view_own`, `absences.request`)

---

## 2. Users Table / Model

### 2.1 SQL Migrations

**Initial creation:** `/home/tolga/projects/terp/db/migrations/000001_create_users.up.sql`
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_role CHECK (role IN ('user', 'admin'))
);
```

**Multi-tenancy columns:** `000008_alter_users_multitenancy.up.sql`
- Added: `tenant_id UUID`, `user_group_id UUID`, `employee_id UUID`, `username VARCHAR(100)`, `is_active BOOLEAN`, `deleted_at TIMESTAMPTZ`
- Unique index: `(tenant_id, email)`, partial unique: `(tenant_id, username) WHERE username IS NOT NULL`

**Employee FK:** `000014_link_users_employees.up.sql`
- Added FK: `users.employee_id REFERENCES employees(id) ON DELETE SET NULL`

**Auth/scope fields:** `000039_add_user_auth_scope_fields.up.sql`
- Added: `password_hash VARCHAR(255)`, `sso_id VARCHAR(255)`, `is_locked BOOLEAN DEFAULT false`
- Added: `data_scope_type VARCHAR(20) DEFAULT 'all'` with CHECK constraint
- Added: `data_scope_tenant_ids UUID[]`, `data_scope_department_ids UUID[]`, `data_scope_employee_ids UUID[]`

**User-tenant join table:** `000084_create_user_tenants.up.sql`
```sql
CREATE TABLE user_tenants (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role       VARCHAR(50) NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, tenant_id)
);
```

### 2.2 GORM Model

**File:** `/home/tolga/projects/terp/apps/api/internal/model/user.go` (70 lines)

```go
type User struct {
    ID                     uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    TenantID               *uuid.UUID     `gorm:"type:uuid;index"`
    UserGroupID            *uuid.UUID     `gorm:"type:uuid;index"`
    EmployeeID             *uuid.UUID     `gorm:"type:uuid"`
    Email                  string         `gorm:"type:varchar(255);not null"`
    Username               *string        `gorm:"type:varchar(100)"`
    DisplayName            string         `gorm:"type:varchar(255);not null"`
    AvatarURL              *string        `gorm:"type:text"`
    Role                   UserRole       `gorm:"type:varchar(50);not null;default:'user'"`
    IsActive               bool           `gorm:"default:true"`
    PasswordHash           *string        `gorm:"type:varchar(255)" json:"-"`
    SSOID                  *string        `gorm:"type:varchar(255)"`
    IsLocked               bool           `gorm:"default:false"`
    DataScopeType          DataScopeType  `gorm:"type:varchar(20);not null;default:'all'"`
    DataScopeTenantIDs     pq.StringArray `gorm:"type:uuid[];default:'{}'"`
    DataScopeDepartmentIDs pq.StringArray `gorm:"type:uuid[];default:'{}'"`
    DataScopeEmployeeIDs   pq.StringArray `gorm:"type:uuid[];default:'{}'"`
    CreatedAt              time.Time
    UpdatedAt              time.Time
    DeletedAt              gorm.DeletedAt `gorm:"index"`

    // Relations
    Tenant    *Tenant    `gorm:"foreignKey:TenantID"`
    UserGroup *UserGroup `gorm:"foreignKey:UserGroupID"`
    Employee  *Employee  `gorm:"foreignKey:EmployeeID"`
}
```

### 2.3 ID Format Compatibility

- `users.id` is `UUID` with `gen_random_uuid()` default.
- Supabase Auth also uses UUID for `auth.users.id`.
- The DB trigger in the ticket spec uses `NEW.id` from `auth.users` as the `public.users.id`, which is compatible.
- Dev user IDs are deterministic UUIDs: `00000000-0000-0000-0000-000000000001` (admin), `00000000-0000-0000-0000-000000000002` (user).
- The `sso_id` column on users (`VARCHAR(255)`) could store Supabase Auth UID if needed as an alternative to matching IDs directly.

---

## 3. tRPC Server Setup (ZMI-TICKET-201)

### 3.1 Server-Side tRPC

**File:** `/home/tolga/projects/terp/apps/web/src/server/trpc.ts` (138 lines)

**Context type:**
```typescript
export type TRPCContext = {
    prisma: PrismaClient
    authToken: string | null     // Raw Bearer token from Authorization header
    user: null                   // Null until ZMI-TICKET-202
    session: null                // Null until ZMI-TICKET-202
    tenantId: string | null      // From X-Tenant-ID header
}
```

**Context factory:**
```typescript
export function createTRPCContext(opts: FetchCreateContextFnOptions): TRPCContext {
    const authHeader = opts.req.headers.get("authorization")
    const authToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null
    const tenantId = opts.req.headers.get("x-tenant-id")
    return { prisma, authToken, user: null, session: null, tenantId }
}
```

**Procedure types:**
- `publicProcedure` — no auth required
- `protectedProcedure` — checks `ctx.authToken` is non-null, throws `UNAUTHORIZED` otherwise. NOTE: Currently only checks token presence, NOT validity.
- `tenantProcedure` — extends `protectedProcedure`, additionally requires `ctx.tenantId` is non-null, throws `FORBIDDEN` otherwise.

**Error formatting:** Includes Zod validation error details in response.

### 3.2 Root Router

**File:** `/home/tolga/projects/terp/apps/web/src/server/root.ts` (23 lines)

```typescript
export const appRouter = createTRPCRouter({
    health: healthRouter,
})
export type AppRouter = typeof appRouter
export const createCaller = createCallerFactory(appRouter)
```

Currently only has `health` router. New routers (including `auth`) need to be added here.

### 3.3 Health Router

**File:** `/home/tolga/projects/terp/apps/web/src/server/routers/health.ts` (35 lines)

```typescript
export const healthRouter = createTRPCRouter({
    check: publicProcedure.output(z.object({...})).query(async ({ ctx }) => {
        // Tests DB connectivity
    }),
})
```

### 3.4 tRPC API Route Handler

**File:** `/home/tolga/projects/terp/apps/web/src/app/api/trpc/[trpc]/route.ts` (21 lines)

Uses `fetchRequestHandler` from `@trpc/server/adapters/fetch` at `/api/trpc` endpoint.

### 3.5 How to Add New Routers

1. Create router file in `/home/tolga/projects/terp/apps/web/src/server/routers/` (e.g., `auth.ts`).
2. Import and add to `appRouter` in `/home/tolga/projects/terp/apps/web/src/server/root.ts`.
3. Types are automatically inferred on the client side via `AppRouter` type.

### 3.6 Tests

**File:** `/home/tolga/projects/terp/apps/web/src/server/__tests__/procedures.test.ts` (98 lines)

Tests demonstrate creating mock contexts and calling procedures via `createCallerFactory`:
```typescript
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

---

## 4. Frontend Auth State

### 4.1 Auth Provider

**File:** `/home/tolga/projects/terp/apps/web/src/providers/auth-provider.tsx` (103 lines)

Provides `AuthContextValue`:
```typescript
export interface AuthContextValue {
    user: User | null
    isLoading: boolean
    isAuthenticated: boolean
    error: Error | null
    logout: () => Promise<void>
    refetch: () => Promise<void>
}
```

- Uses `useCurrentUser(hasToken)` — only fetches if a token exists in localStorage.
- Uses `useLogout()` for logout mutation.
- On logout, clears all React Query cache via `queryClient.clear()`.
- Checks `authStorage.getToken()` to determine if it should attempt to load user.

### 4.2 Auth Hooks

**File:** `/home/tolga/projects/terp/apps/web/src/hooks/use-auth.ts` (125 lines)

- `useCurrentUser(enabled)` — calls `GET /auth/me` via openapi-fetch.
- `useLogin()` — calls `POST /auth/login`, stores token and tenant ID on success.
- `useDevLogin()` — calls `GET /auth/dev/login?role=...`, stores token and tenant ID.
- `useDevUsers()` — calls `GET /auth/dev/users`.
- `useLogout()` — calls `POST /auth/logout`, clears token and tenant ID from localStorage.

User type is imported from OpenAPI-generated types:
```typescript
export type User = components['schemas']['User']
```

### 4.3 Token Storage

**File:** `/home/tolga/projects/terp/apps/web/src/lib/api/client.ts` (135 lines)

- **Token storage:** `localStorage.getItem('auth_token')` / `localStorage.setItem('auth_token', ...)`
- **Tenant storage:** `localStorage.getItem('tenant_id')` / `localStorage.setItem('tenant_id', ...)`
- Auth middleware on the API client adds `Authorization: Bearer <token>` header to all requests.
- Tenant middleware adds `X-Tenant-ID` header to all requests.

The API client uses `openapi-fetch` with the Go backend's base URL (`http://localhost:8080/api/v1`).

### 4.4 Protected Route Component

**File:** `/home/tolga/projects/terp/apps/web/src/components/auth/protected-route.tsx` (83 lines)

- Uses `useAuth()` hook from AuthProvider.
- If loading: shows loading fallback.
- If not authenticated: redirects to `/login?returnUrl=<current-path>`.
- If authenticated: renders children.

### 4.5 Login Page

**File:** `/home/tolga/projects/terp/apps/web/src/app/[locale]/(auth)/login/page.tsx` (179 lines)

- Email/password form that calls `useLogin()` mutation.
- Dev login buttons calling `useDevLogin()` with 'admin' or 'user' role.
- On success: calls `refetch()` to update auth state, then `router.push(returnUrl)`.
- Redirects away if already authenticated.

### 4.6 Dashboard Layout

**File:** `/home/tolga/projects/terp/apps/web/src/app/[locale]/(dashboard)/layout.tsx` (22 lines)

```tsx
<ProtectedRoute loadingFallback={<LoadingSkeleton />}>
    <TenantProvider>
        <TenantGuard loadingFallback={<LoadingSkeleton />}>
            <AppLayout>{children}</AppLayout>
        </TenantGuard>
    </TenantProvider>
</ProtectedRoute>
```

### 4.7 Root Layout Provider Hierarchy

**File:** `/home/tolga/projects/terp/apps/web/src/app/[locale]/layout.tsx` (56 lines)

```
NextIntlClientProvider
  ThemeProvider
    TRPCReactProvider (includes QueryClientProvider)
      AuthProvider
        {children}
```

### 4.8 tRPC Client Provider

**File:** `/home/tolga/projects/terp/apps/web/src/trpc/provider.tsx` (105 lines)

- Creates `tRPCClient` with `httpBatchLink` to `/api/trpc`.
- Forwards `Authorization: Bearer <token>` from `authStorage.getToken()`.
- Forwards `X-Tenant-ID` from `tenantIdStorage.getTenantId()`.
- Unifies QueryClient for both tRPC and legacy openapi-fetch hooks.

### 4.9 Permission Hooks

**File:** `/home/tolga/projects/terp/apps/web/src/hooks/use-has-permission.ts` (69 lines)

- `usePermissionChecker()` — loads both permission catalog (`GET /permissions`) and current user permissions (`GET /auth/permissions`), builds a Set for fast lookup.
- `useHasPermission(keys)` — returns `{ allowed: boolean, isLoading: boolean }`.
- Admin users (from `is_admin` flag in permissions response) get all permissions.

**File:** `/home/tolga/projects/terp/apps/web/src/hooks/api/use-current-permissions.ts` (8 lines)

```typescript
export function useCurrentPermissions(enabled = true) {
    return useApiQuery('/auth/permissions', { enabled, staleTime: 5 * 60 * 1000 })
}
```

**File:** `/home/tolga/projects/terp/apps/web/src/hooks/api/use-permissions.ts` (8 lines)

```typescript
export function usePermissions(enabled = true) {
    return useApiQuery('/permissions', { enabled, staleTime: 5 * 60 * 1000 })
}
```

### 4.10 Role Hooks

**File:** `/home/tolga/projects/terp/apps/web/src/hooks/use-has-role.ts` (98 lines)

- `useHasRole(roles)` — checks if current user's role is in the provided array.
- `useHasMinRole(minRole)` — uses role hierarchy `['user', 'admin']`.
- `useUserRole()` — returns current user's role or null.

### 4.11 User Menu

**File:** `/home/tolga/projects/terp/apps/web/src/components/auth/user-menu.tsx` (52 lines)

Shows user's `display_name` and `role`, with sign-out button.

---

## 5. Prisma Schema

**File:** `/home/tolga/projects/terp/apps/web/prisma/schema.prisma` (157 lines)

**Important note at top of file:** This schema is READ-ONLY against the existing PostgreSQL database. DO NOT run `prisma db push` or `prisma migrate dev`. Schema changes are managed via SQL migrations in `db/migrations/`.

### 5.1 User Model

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
    employeeId             String?   @map("employee_id") @db.Uuid
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

    // Relations
    tenant      Tenant?      @relation(fields: [tenantId], references: [id])
    userGroup   UserGroup?   @relation(fields: [userGroupId], references: [id])
    userTenants UserTenant[]

    @@unique([tenantId, email], map: "idx_users_tenant_email")
    @@index([email], map: "idx_users_email")
    @@index([displayName], map: "idx_users_display_name")
    @@index([tenantId], map: "idx_users_tenant")
    @@index([userGroupId], map: "idx_users_user_group")
    @@index([deletedAt], map: "idx_users_deleted_at")
    @@map("users")
}
```

Note: The `Employee` relation is not in the Prisma schema but exists in the GORM model and DB. The Prisma schema is a core subset.

### 5.2 UserGroup Model

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
    @@map("user_groups")
}
```

### 5.3 UserTenant Model

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

### 5.4 Tenant Model

```prisma
model Tenant {
    id                    String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
    name                  String    @db.VarChar(255)
    slug                  String    @unique @db.VarChar(100)
    settings              Json?     @default("{}") @db.JsonB
    isActive              Boolean?  @default(true) @map("is_active")
    createdAt             DateTime? @default(now()) @map("created_at") @db.Timestamptz(6)
    updatedAt             DateTime? @default(now()) @map("updated_at") @db.Timestamptz(6)
    addressStreet         String?   @map("address_street")
    addressZip            String?   @map("address_zip")
    addressCity           String?   @map("address_city")
    addressCountry        String?   @map("address_country")
    phone                 String?
    email                 String?
    payrollExportBasePath String?   @map("payroll_export_base_path")
    notes                 String?
    vacationBasis         String    @default("calendar_year") @map("vacation_basis")

    users       User[]
    userGroups  UserGroup[]
    userTenants UserTenant[]
    @@map("tenants")
}
```

---

## 6. Permission System

### 6.1 Permission Registry

**File:** `/home/tolga/projects/terp/apps/api/internal/permissions/permissions.go` (101 lines)

- 44 permissions registered in `allPermissions` slice.
- Permission IDs are deterministic SHA1-based UUIDs derived from a namespace UUID and the permission key string (e.g., `"employees.view"`).
- Format: `{resource}.{action}` (e.g., `employees.view`, `time_tracking.edit`, `absences.approve`).
- `permissionID(key) uuid.UUID` — `uuid.NewSHA1(namespace, []byte(key))`
- `ID(key) uuid.UUID` — public alias for `permissionID`.
- `List() []Permission` — returns all permissions.
- `Lookup(id string) (Permission, bool)` — lookup by UUID string.

### 6.2 Permission Storage

Permissions are stored in `user_groups.permissions` as a JSONB array of UUID strings:
```json
["f1a2b3c4-...", "e5f6a7b8-..."]
```

### 6.3 Permission Checking Flow

**Go middleware** (`/home/tolga/projects/terp/apps/api/internal/middleware/authorization.go`):
1. `LoadPermissionChecker(ctx, userRepo)` — loads user with relations, creates `PermissionChecker`.
2. `PermissionChecker.Has(id)`:
   - If user has UserGroup and it's inactive: always false.
   - If UserGroup.IsAdmin: always true.
   - Otherwise: checks if permission ID is in the set parsed from UserGroup.Permissions.
   - Fallback (no UserGroup): checks `user.Role == "admin"`.

**Frontend** (`/home/tolga/projects/terp/apps/web/src/hooks/use-has-permission.ts`):
1. Fetches permission catalog from `GET /permissions` (all available permissions).
2. Fetches current user's permissions from `GET /auth/permissions`.
3. Builds a Map of `{key -> id}` from catalog and a Set of allowed IDs.
4. `check(keys)`: if admin, return true; otherwise check if any key's ID is in the allowed set.

### 6.4 Frontend Permission Endpoint Response Format

From `GET /auth/permissions`:
```json
{
    "data": {
        "permission_ids": ["uuid1", "uuid2", ...],
        "is_admin": true
    }
}
```

---

## 7. Dependencies and Configuration

### 7.1 Package.json (apps/web)

**File:** `/home/tolga/projects/terp/apps/web/package.json`

**Existing relevant dependencies:**
- `@trpc/client`: `^11.11.0`
- `@trpc/server`: `^11.11.0`
- `@trpc/tanstack-react-query`: `^11.11.0`
- `@tanstack/react-query`: `^5.90.20`
- `@prisma/client`: `^7.4.2`
- `@prisma/adapter-pg`: `^7.4.2`
- `prisma`: `^7.4.2` (devDep)
- `zod`: `^4.3.6`
- `openapi-fetch`: `^0.15.0`
- `next`: `^16.1.0`
- `pg`: `^8.19.0`

**Not installed (required for migration):**
- `@supabase/supabase-js` — Supabase client
- `@supabase/ssr` — Server-side Supabase client for Next.js App Router

### 7.2 Environment Variables

**File:** `/home/tolga/projects/terp/apps/web/.env.local`
```
API_URL=http://localhost:8080/api/v1
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
NEXT_PUBLIC_APP_NAME=Terp
DATABASE_URL=postgres://dev:dev@localhost:5432/terp
```

**Not configured (required for Supabase):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only)

### 7.3 Next.js Middleware

**File:** `/home/tolga/projects/terp/apps/web/src/middleware.ts` (8 lines)

Currently only handles i18n routing via `next-intl`. Matcher excludes `api`, `trpc`, `_next`, `_vercel`, and static files.

This will need to be extended for Supabase session refresh.

### 7.4 Prisma Client

**File:** `/home/tolga/projects/terp/apps/web/src/lib/db/prisma.ts`

Uses `PrismaPg` adapter with `process.env.DATABASE_URL`. Singleton pattern for hot-reload safety. This is the same database connection used by the tRPC context.

### 7.5 Environment Config

**File:** `/home/tolga/projects/terp/apps/web/src/config/env.ts`

Currently only has `apiUrl` and `appName`. Will need Supabase URL and anon key added.

---

## 8. Key Relationships and Data Flow Summary

### Current Auth Flow (Go Backend):

```
Client → POST /auth/login {email, password}
  → Go AuthHandler.Login()
    → UserService.Authenticate() (bcrypt check)
    → JWTManager.Generate() (HS256 token with user claims)
    → Set HTTP-only cookie + return {token, user, tenant}

Client → GET /auth/me [Authorization: Bearer <token>]
  → AuthMiddleware validates JWT
  → AuthHandler.Me() returns full user from DB

Client → GET /auth/permissions [Authorization: Bearer <token>]
  → AuthMiddleware validates JWT
  → AuthHandler.Permissions() loads user+group, returns permission IDs
```

### Current Frontend Auth Flow:

```
Login Page → useLogin() → POST /auth/login → store token in localStorage
  → refetch() → useCurrentUser() → GET /auth/me → AuthProvider context update
  → router.push(returnUrl)

Any page → AuthProvider checks localStorage for token
  → If token exists: fetch GET /auth/me
  → If no token: isAuthenticated = false

Dashboard layout → ProtectedRoute checks isAuthenticated
  → If false: redirect to /login?returnUrl=...

API calls → openapi-fetch middleware adds Authorization header from localStorage
           → openapi-fetch middleware adds X-Tenant-ID header from localStorage
```

### Token Storage Locations:
- **Go backend:** HTTP-only cookie named `token` (set by Login/DevLogin/Refresh handlers)
- **Frontend:** `localStorage.auth_token` (set by useLogin/useDevLogin hooks)
- **Both are used:** The Go middleware checks Authorization header first, then cookie fallback

### ID Format:
- `users.id`: UUID (v4, generated by `gen_random_uuid()`)
- `auth.users.id` (Supabase): UUID
- These are compatible for direct ID mapping via the DB trigger.
