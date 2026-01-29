# ZMI-TICKET-003 User Management and Permissions Implementation Plan

## Overview

Implement ZMI-style user accounts, group-based permissions (including booking overview functions), data access scopes, audit logging, and OpenAPI coverage so API access and data visibility are enforced consistently.

## Current State Analysis

- Users and user groups exist with tenant linkage, JSON permission IDs, and permission enforcement middleware; `/auth/permissions` and `/permissions` are live and the admin UI already consumes them. (`apps/api/internal/model/user.go`, `apps/api/internal/model/usergroup.go`, `apps/api/internal/middleware/authorization.go`, `apps/api/internal/handler/auth.go`, `apps/api/internal/handler/permission.go`, `apps/web/src/hooks/use-has-permission.ts`)
- CRUD for users (list/get/update/delete) and user groups is implemented, but user creation and password change endpoints are missing. (`apps/api/internal/handler/user.go`, `api/paths/users.yaml`)
- Data scope (mandant/department/employee) and audit logging are not implemented in the API code; audit endpoints exist only in OpenAPI. (`apps/api/internal/middleware/tenant.go`, `api/paths/audit-logs.yaml`)
- Permission catalog does not include all admin/config modules or booking overview function permissions. (`apps/api/internal/permissions/permissions.go`)

## Desired End State

- Users have required fields (username, password hash or external auth mapping, optional SSO id, active/locked flags) and user-group assignment; CRUD and password change endpoints exist and are documented.
- User groups control access via module/tab/function permissions, including booking overview function permissions.
- Data scope (all employees / specific mandants / specific departments / specific employees) is stored per user and enforced on list/detail endpoints.
- Audit logs capture user identity for create/update/delete actions, and audit log endpoints are implemented.
- OpenAPI documents new fields, endpoints, and authorization errors; generated types are updated.

### Key Discoveries:
- Permission enforcement is centralized in `AuthorizationMiddleware` with `RequirePermission` and employee-scoped helpers. (`apps/api/internal/middleware/authorization.go`)
- Permission catalog is a deterministic UUID list; user groups store permission IDs as JSON. (`apps/api/internal/permissions/permissions.go`, `apps/api/internal/model/usergroup.go`)
- Tenant scoping is provided via `X-Tenant-ID` header and context, but not per-user scope. (`apps/api/internal/middleware/tenant.go`)

## What We’re NOT Doing

- Building new UI screens beyond updating the existing admin users/user-groups pages to show new permissions.
- Redesigning JWT or multi-tenant auth flow beyond adding password-based login and change password support.
- Implementing full reporting module functionality; only permission scaffolding and OpenAPI coverage.

## Implementation Approach

- Extend the existing permission catalog and reuse the permission middleware by adding new permission IDs for missing modules and booking overview functions; wire them into routes.
- Add user data-scope fields and enforce scopes in handlers/repositories for employee-scoped data.
- Introduce an audit log model, repository, and service; write logs from create/update/delete handlers.
- Add user creation and password change endpoints with bcrypt password hashing.
- Update OpenAPI specs and regenerate bundled OpenAPI + TypeScript types.

## Phase 1: Schema + Model Updates

### Overview
Add database fields for user authentication/scope and create an audit log table; update models to match.

### Changes Required:

#### 1) User fields + data scope columns
**Files**:
- `db/migrations/0000XX_add_user_auth_scope_fields.up.sql` (new)
- `apps/api/internal/model/user.go`

**Changes**:
- Add `password_hash`, `sso_id`, `is_locked`, `data_scope_type`, `data_scope_tenant_ids`, `data_scope_department_ids`, `data_scope_employee_ids` columns.
- Update `User` model with new fields; exclude `password_hash` from JSON responses.

#### 2) Audit logs schema
**Files**:
- `db/migrations/0000XX_create_audit_logs.up.sql` (new)
- `apps/api/internal/model/auditlog.go` (new)

**Changes**:
- Create `audit_logs` table with fields matching OpenAPI (`tenant_id`, `user_id`, `action`, `entity_type`, `entity_id`, `changes`, `metadata`, `ip_address`, `user_agent`, `performed_at`).
- Add GORM model with JSONB fields for changes/metadata and timestamps.

### Success Criteria:

#### Automated Verification:
- [x] Migrations apply cleanly: `make migrate`
- [x] Go build passes: `go test ./apps/api/...` (or `make test`)

#### Manual Verification:
- [ ] DB schema includes new user scope fields and audit_logs table.

**Implementation Note**: Pause after this phase for manual confirmation before proceeding.

---

## Phase 2: Permission Catalog Expansion + Route Wiring

### Overview
Add module/tab/function permission IDs and enforce them in routes.

### Changes Required:

#### 1) Expand permission catalog
**File**: `apps/api/internal/permissions/permissions.go`
**Changes**:
- Add permissions for configuration/admin modules missing from the catalog (departments, teams, booking_types, absence_types, holidays, accounts, notifications, reports).
- Add booking overview function permissions: `booking_overview.change_day_plan`, `booking_overview.calculate_day`, `booking_overview.calculate_month`, `booking_overview.delete_bookings`.

#### 2) Wire permissions into routes
**File**: `apps/api/internal/handler/routes.go`
**Changes**:
- Add `RequirePermission` checks for new modules (departments, teams, booking-types, absence-types, holidays, accounts, notifications, monthly eval).
- Add booking overview function permissions to `POST /employees/{id}/day/{date}/calculate` and monthly eval recalc endpoints.

#### 3) Update permission categories in UI
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/user-groups/page.tsx`
**Changes**:
- Extend `CATEGORY_DEFINITIONS` and resource labels/actions to include new permissions and booking overview functions.

### Success Criteria:

#### Automated Verification:
- [x] Permission catalog compiles and tests pass: `make test`

#### Manual Verification:
- [ ] Admin user-group page shows new permission categories.
- [ ] A user without booking overview permissions receives 403 on calculate endpoints.

---

## Phase 3: User CRUD + Password Change

### Overview
Add user creation and password change endpoints, and implement password hashing + login.

### Changes Required:

#### 1) User creation + update requests
**Files**:
- `apps/api/internal/handler/user.go`
- `apps/api/internal/service/user.go`
- `apps/api/internal/repository/user.go`
- `api/schemas/users.yaml`
- `api/paths/users.yaml`

**Changes**:
- Add `POST /users` with `CreateUserRequest` including username/email/display_name/password or external auth mapping.
- Allow admins to set `is_active`, `is_locked`, and data scope fields in update.

#### 2) Change password endpoint
**Files**:
- `apps/api/internal/handler/user.go` (or new handler)
- `apps/api/internal/service/user.go`
- `api/paths/users.yaml`

**Changes**:
- Add `POST /users/{id}/password` requiring current password for self; allow admin resets with `users.manage`.
- Hash passwords with bcrypt, store in `password_hash`.

#### 3) Implement credential login
**Files**:
- `apps/api/internal/handler/auth.go`
- `apps/api/internal/service/user.go`

**Changes**:
- Implement `/auth/login` to validate tenant + email + password, check `is_active`/`is_locked`, and issue JWT.

### Success Criteria:

#### Automated Verification:
- [x] Auth/login and user password change tests pass: `make test`

#### Manual Verification:
- [ ] Admin can create a user and set group + scope.
- [ ] User can change password using current password.
- [ ] Locked user cannot log in.

---

## Phase 4: Data Access Scope Enforcement

### Overview
Store and enforce per-user data scopes for employee-scoped data.

### Changes Required:

#### 1) Add scope parsing helpers
**Files**:
- `apps/api/internal/middleware/authorization.go` or new `apps/api/internal/access/scope.go`

**Changes**:
- Parse user scope fields into a struct (scope type + ID lists).
- Add helper to validate tenant scope and to check employee/department access.

#### 2) Enforce scope in handlers/repositories
**Files**:
- `apps/api/internal/handler/employee.go`
- `apps/api/internal/handler/booking.go`
- `apps/api/internal/handler/absence.go`
- `apps/api/internal/handler/monthlyeval.go`
- `apps/api/internal/repository/employee.go`
- `apps/api/internal/repository/booking.go`
- `apps/api/internal/repository/absenceday.go`
- `apps/api/internal/repository/dailyvalue.go`

**Changes**:
- Filter list results based on allowed employees or departments.
- Deny access to detail endpoints when the target employee is outside scope.
- Enforce tenant scope (mandant list) for tenant-scoped endpoints.

### Success Criteria:

#### Automated Verification:
- [x] Data scope unit tests pass: `go test ./apps/api/internal/...`

#### Manual Verification:
- [ ] User scoped to Department A cannot access Department B employees.
- [ ] User scoped to specific employees sees only those employees' bookings/absences.

---

## Phase 5: Audit Logging

### Overview
Implement audit log storage and log create/update/delete actions with user identity.

### Changes Required:

#### 1) Audit log repository + service
**Files**:
- `apps/api/internal/repository/auditlog.go` (new)
- `apps/api/internal/service/auditlog.go` (new)

**Changes**:
- Implement `Create`, `List`, and `GetByID` with filters matching OpenAPI.

#### 2) Audit log handlers
**Files**:
- `apps/api/internal/handler/auditlog.go` (new)
- `apps/api/internal/handler/routes.go`

**Changes**:
- Implement `GET /audit-logs` and `GET /audit-logs/{id}` using service.

#### 3) Emit audit logs from handlers
**Files**:
- `apps/api/internal/handler/user.go`
- `apps/api/internal/handler/usergroup.go`
- `apps/api/internal/handler/booking.go`
- `apps/api/internal/handler/absence.go`
- `apps/api/internal/handler/employee.go`

**Changes**:
- On create/update/delete, write audit log with user ID, entity type, entity ID, and action.

### Success Criteria:

#### Automated Verification:
- [x] Audit log tests pass: `make test`

#### Manual Verification:
- [ ] Creating/updating/deleting a user or booking creates an audit log entry with user ID.

---

## Phase 6: OpenAPI + Types Regeneration

### Overview
Ensure OpenAPI docs and generated types reflect new endpoints/fields.

### Changes Required:

- Update `api/schemas/users.yaml` with new fields and requests.
- Update `api/paths/users.yaml` for POST + password change + delete.
- Update `api/paths/audit-logs.yaml` if needed.
- Regenerate bundled OpenAPI + TS types: `make generate-all`.

### Success Criteria:

#### Automated Verification:
- [x] OpenAPI bundles regenerated: `make generate-all`
- [ ] Web typecheck passes: `pnpm -C apps/web check`

#### Manual Verification:
- [ ] Generated API types include new user fields and audit log endpoints.

---

## Testing Strategy

### Unit Tests:
- Permission evaluation for new permission IDs.
- Data scope parsing and enforcement for all/department/employee scopes.
- Password hashing and change password rules.
- Audit log creation payload includes user ID.

### Integration Tests:
- Booking/absence create/update enforcement under permission and scope constraints.
- Effective permissions endpoint reflects user group permissions.

### Manual Testing Steps:
1. Create a user with restricted department scope; verify employee list is filtered.
2. Create a user without booking overview calculate permission; verify calculate endpoints return 403.
3. Change password with valid and invalid current password.
4. Create/update/delete user group and verify audit logs record the actions.

## Performance Considerations

- Avoid per-request full employee ID expansion when department scope can be enforced via joins.
- Cache permission checks using existing PermissionChecker context to reduce repeated JSON parsing.

## Migration Notes

- Existing users should default to `data_scope_type=all` and `is_locked=false`.
- Passwords for existing users remain unset; login should handle null password hashes gracefully.

## References

- Ticket: `thoughts/shared/tickets/ZMI-TICKET-003-user-management-permissions.md`
- Research: `thoughts/shared/research/2026-01-29-ZMI-TICKET-003-user-management-permissions.md`
