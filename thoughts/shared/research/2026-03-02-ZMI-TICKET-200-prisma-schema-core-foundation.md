---
date: 2026-03-02T12:00:00+01:00
researcher: claude
git_commit: 4afc1559
branch: master
repository: terp
topic: "ZMI-TICKET-200: Prisma Schema Core Foundation — Current Go Codebase State"
tags: [research, codebase, prisma, migration, users, tenants, user-groups, user-tenants]
status: complete
last_updated: 2026-03-02
last_updated_by: claude
---

# Research: ZMI-TICKET-200 — Prisma Schema Core Foundation

**Date**: 2026-03-02
**Git Commit**: 4afc1559
**Branch**: master
**Repository**: terp

## Research Question

Document the current state of the four core entities (users, tenants, user_groups, user_tenants) across all layers of the Go backend, the existing Next.js frontend integration, and the SQL migration history — as context for the planned Prisma migration in ZMI-TICKET-200.

## Summary

The four core tables are fully implemented in the Go backend with GORM models, repository/service/handler layers, and 10 SQL migrations. The Next.js frontend has **zero** database integration — no Prisma, no tRPC, no Supabase client, no DB connection of any kind. It communicates exclusively with the Go API via `openapi-fetch` over HTTP. The Prisma migration would therefore be a greenfield addition to the frontend, replacing Go model structs with Prisma SDL while preserving the existing PostgreSQL schema unchanged.

## Detailed Findings

### 1. Go Models (`apps/api/internal/model/`)

#### `base.go` (14 lines)
Defines `BaseModel` with `ID uuid.UUID`, `CreatedAt`, `UpdatedAt`. **Not actually embedded** by any of the four core entities — they each declare their own ID/timestamp fields independently.

#### `user.go` (71 lines)
- **Struct**: 20 data fields + 3 relation fields
- **Key fields beyond the ticket's Prisma schema**:
  - `Role UserRole` (`"user"` | `"admin"`) — enum with CHECK constraint in DB
  - `PasswordHash *string` (json:"-", excluded from API responses)
  - `SSOID *string` — external SSO identifier
  - `IsLocked bool` — account lockout flag
  - `DataScopeType DataScopeType` (`"all"` | `"tenant"` | `"department"` | `"employee"`)
  - `DataScopeTenantIDs`, `DataScopeDepartmentIDs`, `DataScopeEmployeeIDs` — all `pq.StringArray` (PostgreSQL UUID arrays)
- **Methods**: `TableName()`, `IsTenantUser()`, `IsAdmin()` (checks `UserGroup.IsAdmin`, not `Role`)
- **Soft delete**: Uses `gorm.DeletedAt`
- **Relations**: `Tenant`, `UserGroup`, `Employee` via GORM `foreignKey` tags

#### `tenant.go` (41 lines)
- **Struct**: 16 data fields, no relation fields
- **Key fields beyond the ticket's Prisma schema**:
  - `Slug string` (unique index) — ticket uses `subdomain`, Go uses `slug`
  - `AddressStreet`, `AddressZip`, `AddressCity`, `AddressCountry` — address fields
  - `Phone`, `Email` — contact fields
  - `PayrollExportBasePath *string` — payroll config
  - `Notes *string` — free text
  - `VacationBasis VacationBasis` (`"calendar_year"` | `"entry_date"`)
- **No soft delete** — tenants are deactivated (`IsActive=false`) via `TenantService.Deactivate`
- **`VacationBasis` type** defined in `model/tariff.go:14`

#### `usergroup.go` (45 lines)
- **Struct**: 11 data fields, no relation fields
- **Key fields beyond the ticket's Prisma schema**:
  - `Code string` — short code (auto-derived from name, uppercased)
  - `IsSystem bool` — marks system-seeded groups (cannot be modified/deleted)
  - `TenantID *uuid.UUID` — nullable (NULL = system-wide group)
- **No soft delete**, no `DeletedAt`
- **Methods**: `TableName()`, `HasPermission(permission string) bool` — unmarshals `Permissions` JSON, admin groups short-circuit to `true`

#### `user_tenant.go` (18 lines)
- **Struct**: 4 fields — `UserID`, `TenantID` (composite PK), `Role`, `CreatedAt`
- **Key differences from ticket's Prisma schema**:
  - Go model has `Role string` (default `"member"`) — ticket's Prisma schema has no `Role` field
  - Go model has no `ID` field — uses composite PK; ticket's schema has a UUID `id` field
- **No relations declared** on the struct (unlike ticket's schema which has `user` and `tenant` relations)

### 2. Discrepancies: Ticket's Prisma Schema vs. Actual DB Schema

| Aspect | Ticket's Prisma Schema | Actual Go/DB Schema |
|--------|----------------------|---------------------|
| **User fields** | 11 fields | 20+ fields (missing: `role`, `password_hash`, `sso_id`, `is_locked`, `data_scope_type`, `data_scope_*_ids`, `tenant_id`) |
| **User.tenant_id** | Not present | Present — nullable FK to tenants |
| **Tenant.subdomain** | `subdomain String @unique` | `slug VARCHAR(100) UNIQUE` — different column name |
| **Tenant fields** | 7 fields | 16 fields (missing: address, contact, payroll, notes, vacation_basis) |
| **Tenant.deleted_at** | Present in Prisma | **Not present** in DB — tenants use `is_active` flag |
| **UserGroup.data_scope** | `data_scope String @default("all")` | **Not on UserGroup** — `data_scope_type` is on `User` |
| **UserGroup.code** | Not present | Present — `VARCHAR(50) NOT NULL`, unique per tenant |
| **UserGroup.is_system** | Not present | Present — `BOOLEAN DEFAULT false` |
| **UserTenant.id** | UUID `@id` | **No `id` column** — composite PK `(user_id, tenant_id)` |
| **UserTenant.role** | Not present | Present — `VARCHAR(50) DEFAULT 'member'` |
| **UserTenant relations** | `user` and `tenant` declared | No relations on Go struct |

### 3. SQL Migration History

10 migrations touch the four core tables:

| Migration | Table | Operation |
|-----------|-------|-----------|
| `000001_create_users` | users | CREATE TABLE — id, email, display_name, avatar_url, role, timestamps. Trigger: `update_updated_at_column()` |
| `000002_create_tenants` | tenants | CREATE TABLE — id, name, slug, settings, is_active, timestamps |
| `000007_create_user_groups` | user_groups | CREATE TABLE — id, tenant_id (NOT NULL), name, description, permissions, is_admin, is_system, timestamps. UNIQUE(tenant_id, name) |
| `000008_alter_users_multitenancy` | users | ADD: tenant_id, user_group_id, employee_id, username, is_active, deleted_at. Multiple indexes including tenant-scoped unique constraints |
| `000014_link_users_employees` | users | ADD FK constraint: employee_id → employees(id) ON DELETE SET NULL |
| `000036_add_user_group_code_active` | user_groups | ADD: code (backfilled from name), is_active |
| `000037_add_tenant_mandant_fields` | tenants | ADD: address fields, phone, email, payroll_export_base_path, notes, vacation_basis. CHECK constraint on vacation_basis |
| `000039_add_user_auth_scope_fields` | users | ADD: password_hash, sso_id, is_locked, data_scope_type, data_scope_*_ids arrays. CHECK constraint on data_scope_type |
| `000084_create_user_tenants` | user_tenants | CREATE TABLE — composite PK(user_id, tenant_id), role, created_at. Backfills from existing users.tenant_id |
| `000087_user_groups_nullable_tenant` | user_groups | DROP NOT NULL on tenant_id. Recreate COALESCE indexes. Seed 4 system groups (ADMIN, PERSONAL, VORGESETZTER, MITARBEITER) |

### 4. Repository Layer

#### `UserRepository` (`repository/user.go`)
12 methods: `Create`, `GetByID`, `GetByEmail` (tenant-scoped), `FindByEmail` (global), `GetByEmployeeID`, `Update`, `UpdateRoleByGroup` (bulk), `List` (cursor-paginated with ILIKE search), `Count`, `Delete` (soft), `Upsert`, `GetByUsername`, `ListByTenant` (preloads UserGroup), `GetWithRelations` (preloads Tenant+UserGroup+Employee).

#### `TenantRepository` (`repository/tenant.go`)
7 methods: `Create`, `GetByID`, `GetBySlug`, `Update`, `List` (optional active/name filters), `Delete` (hard), `Upsert`.

#### `UserGroupRepository` (`repository/usergroup.go`)
9 methods: `Create`, `GetByID`, `GetByName`, `GetByCode`, `Update`, `Delete`, `List`, `Upsert`, `ListByActive`. All list/lookup queries use `WHERE tenant_id = ? OR tenant_id IS NULL` to include system groups.

#### `UserTenantRepository` (`repository/user_tenant.go`)
3 methods: `UserHasAccess` (COUNT query), `ListTenantsForUser` (JOIN with tenants where active), `AddUserToTenant` (FirstOrCreate, idempotent).

### 5. Service Layer

#### `UserService` (`service/user.go`)
- `CreateUser`: Validates, hashes password if provided, resolves UserGroup for admin role sync, creates user, auto-adds to tenant via UserTenantRepo
- `Update`: Permission gates (self vs manage), admin-only field checks, syncs Role when UserGroup changes, fires notification on display_name change
- `Authenticate` / `AuthenticateByEmail`: bcrypt comparison, checks IsActive/IsLocked
- `ChangePassword`: Requires current password for self-change (unless admin)
- `Delete`: Soft delete

#### `TenantService` (`service/tenant.go`)
- `Create`: Validates slug (min 3 chars), address fields, checks slug uniqueness
- `Update`: Patch semantics, validates non-nil fields
- `Deactivate`: Sets `IsActive=false` (no hard delete)
- `ListForUser`: Delegates to `UserTenantRepo.ListTenantsForUser`
- `AddUserToTenant`: Delegates to `UserTenantRepo.AddUserToTenant`

#### `UserGroupService` (`service/usergroup.go`)
- `Create`: Auto-derives code from name, validates permission IDs against `permissions.Lookup()`, sets `IsSystem=false`
- `Update`: Blocks modification of system groups, syncs user roles when IsAdmin changes via `UserRepo.UpdateRoleByGroup`
- `Delete`: Blocks deletion of system groups

### 6. Handler Layer / HTTP Endpoints

**Auth** (`handler/auth.go`, `routes.go:18-35`):
- `POST /auth/login` — tenant-scoped or global auth, backfills `user_tenants` on success
- `GET /auth/me` — returns current user with mapped response
- `GET /auth/dev/login` — seeds all dev data (tenants, users, groups, employees, etc.)

**Users** (`handler/user.go`, `routes.go:38-58`):
- CRUD at `/users/` with `users.manage` permission
- `PATCH /users/{id}` — self-update allowed without permission
- `POST /users/{id}/password` — self or admin

**Tenants** (`handler/tenant.go`, `routes.go:63-81`):
- `GET /tenants/` — returns only user-authorized tenants (no permission needed)
- CRUD requires `tenants.manage`
- `DELETE` calls `Deactivate`, not hard delete
- `POST` auto-adds creating user as `"owner"` in user_tenants

**User Groups** (`handler/usergroup.go`, `routes.go:174-192`):
- CRUD at `/user-groups/` with `users.manage` permission
- Response mapping resolves permission IDs to full `Permission` objects via `permissions.Lookup()`

### 7. Middleware Chain

1. **AuthMiddleware** (`middleware/auth.go`) — JWT from Bearer token or cookie → `auth.User` in context
2. **TenantMiddleware** (`middleware/tenant.go`) — `X-Tenant-ID` header → validates tenant exists and is active → checks `UserTenantRepo.UserHasAccess` → 403 if denied
3. **AuthorizationMiddleware** (`middleware/authorization.go`) — preloads user with relations via `GetWithRelations` → builds `PermissionChecker` with permission map from `UserGroup.Permissions`

### 8. Current Next.js Frontend State

**No database integration exists in the frontend:**
- No Prisma, no tRPC, no Supabase client, no `@prisma/client`, no `schema.prisma`
- No `DATABASE_URL` or `SUPABASE_*` env vars in the frontend
- `apps/web/src/lib/` contains only: `utils.ts`, `time-utils.ts`, and `api/` (HTTP client via `openapi-fetch`)
- All data fetching goes through TanStack Query hooks → `openapi-fetch` HTTP client → Go API backend
- Frontend env vars: `API_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_NAME` only

### 9. Dev Login Seeding Order (`handler/auth.go:142`)

Shows entity creation dependencies:
1. Upsert tenant
2. Upsert users
3. Seed booking types, absence types, holidays, day plans, week plans, shifts, **user groups**
4. Link users to employees
5. Add users to tenants (user_tenants)
6. Seed employee day plans, departments, teams, accounts, bookings, values

## Code References

- `apps/api/internal/model/base.go` — BaseModel struct (not embedded by core entities)
- `apps/api/internal/model/user.go:29-55` — User struct definition
- `apps/api/internal/model/user.go:63-70` — IsTenantUser() and IsAdmin() methods
- `apps/api/internal/model/tenant.go:10-28` — Tenant struct definition
- `apps/api/internal/model/tenant.go:35-40` — GetVacationBasis() method
- `apps/api/internal/model/usergroup.go:11-23` — UserGroup struct definition
- `apps/api/internal/model/usergroup.go:30-44` — HasPermission() method
- `apps/api/internal/model/user_tenant.go:9-14` — UserTenant struct definition
- `apps/api/internal/repository/user.go` — UserRepository (12 methods)
- `apps/api/internal/repository/tenant.go` — TenantRepository (7 methods)
- `apps/api/internal/repository/usergroup.go` — UserGroupRepository (9 methods)
- `apps/api/internal/repository/user_tenant.go` — UserTenantRepository (3 methods)
- `apps/api/internal/service/user.go` — UserService (auth, CRUD, password management)
- `apps/api/internal/service/tenant.go` — TenantService (CRUD, deactivation)
- `apps/api/internal/service/usergroup.go` — UserGroupService (CRUD, permission validation)
- `apps/api/internal/handler/auth.go:142` — DevLogin seeding order
- `apps/api/internal/handler/auth.go:666` — Login flow (shows cross-entity interaction)
- `apps/api/internal/handler/routes.go:18-192` — All route registrations
- `apps/api/internal/middleware/tenant.go:43` — RequireTenant with UserHasAccess check
- `apps/api/internal/middleware/authorization.go:69` — Permission loading via GetWithRelations
- `apps/web/src/lib/api/client.ts` — HTTP API client (only DB access path in frontend)
- `db/migrations/000001_create_users.up.sql` — Initial users table
- `db/migrations/000002_create_tenants.up.sql` — Initial tenants table
- `db/migrations/000007_create_user_groups.up.sql` — Initial user_groups table
- `db/migrations/000084_create_user_tenants.up.sql` — user_tenants join table with backfill
- `db/migrations/000087_user_groups_nullable_tenant_and_defaults.up.sql` — System groups seeding

## Architecture Documentation

### Entity Relationships
```
User ──FK──> Tenant        (user.tenant_id → tenants.id, nullable)
User ──FK──> UserGroup     (user.user_group_id → user_groups.id, nullable)
User ──FK──> Employee      (user.employee_id → employees.id, nullable)
UserGroup ──FK──> Tenant   (user_groups.tenant_id → tenants.id, nullable for system groups)
UserTenant ──FK──> User    (user_tenants.user_id → users.id, CASCADE)
UserTenant ──FK──> Tenant  (user_tenants.tenant_id → tenants.id, CASCADE)
```

### Authentication & Authorization Flow
```
Request → AuthMiddleware (JWT → User context)
       → TenantMiddleware (X-Tenant-ID → validate + UserHasAccess via user_tenants)
       → AuthorizationMiddleware (preload UserGroup.Permissions → PermissionChecker)
       → Handler (checks specific permissions via PermissionChecker.Has())
```

### Data Access Patterns
- **Tenant scoping**: Most repositories filter by `tenant_id = ?` from middleware context
- **System groups**: UserGroup queries use `WHERE tenant_id = ? OR tenant_id IS NULL` to include system groups
- **Soft delete**: Only `User` model uses soft delete (`gorm.DeletedAt`); `Tenant` uses `IsActive` flag; `UserGroup` and `UserTenant` use hard delete
- **Composite PK**: `user_tenants` uses `(user_id, tenant_id)` composite primary key — no surrogate `id` column

## Historical Context (from thoughts/)

### Related Tickets
- `thoughts/shared/tickets/ZMI-TICKET-200-prisma-schema-core-foundation.md` — This ticket: Prisma core schema for users, tenants, user_groups, user_tenants
- `thoughts/shared/tickets/ZMI-TICKET-201-trpc-server-setup.md` — tRPC server setup (depends on 200)
- `thoughts/shared/tickets/ZMI-TICKET-202-supabase-auth-migration.md` — Supabase auth replacing Go JWT (depends on 200)
- `thoughts/shared/tickets/ZMI-TICKET-203-authorization-middleware.md` — tRPC permission middleware (depends on 200, 202)
- `thoughts/shared/tickets/ZMI-TICKET-204-prisma-schema-org-tabellen.md` — Org tables Prisma schema (depends on 200)
- `thoughts/shared/tickets/ZMI-TICKET-205-prisma-schema-employee.md` — Employee Prisma schema (depends on 200)
- `thoughts/shared/tickets/ZMI-TICKET-257-go-backend-decommission.md` — Final Go backend removal

### Migration Roadmap
The full migration spans ZMI-TICKET-200 through ZMI-TICKET-257 (49 tickets):
- **200-205**: Foundation (Prisma schemas, tRPC, Supabase auth, authorization)
- **210-227**: tRPC CRUD routers for all domain entities
- **228-250**: Calculation engine port, booking/absence/vacation services
- **257**: Go backend decommission

## Related Research
- `thoughts/shared/research/2026-01-25-NOK-214-nextjs-project-init.md` — Next.js project initialization research

## Open Questions

1. **Prisma schema accuracy**: The ticket's proposed Prisma schema has significant discrepancies with the actual DB schema (see Section 2). The schema needs to be updated to match the real database before implementation.
2. **BaseModel pattern**: The ticket mentions a `BaseModel` pattern, but the existing Go code doesn't embed `BaseModel` in any of the four core entities. Should Prisma use a generator-level abstract model, or define fields inline per model?
3. **Connection pooling**: The ticket specifies Supabase Connection Pooler (port 6543), but the current dev setup uses direct PostgreSQL (port 5432 via Docker Compose). The production connection strategy needs clarification.
4. **Migration safety**: The ticket's acceptance criteria state "no `prisma db push`" — Prisma should use `prisma db pull` to introspect and then hand-curate. However, with 87+ migrations already applied, the introspected schema will be significantly larger than just the four core tables.
