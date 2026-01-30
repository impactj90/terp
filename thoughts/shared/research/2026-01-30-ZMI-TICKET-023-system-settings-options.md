---
date: 2026-01-30T12:00:00+01:00
researcher: tolga
git_commit: d9316fba
branch: master
repository: terp
topic: "ZMI-TICKET-023: System Settings Options and Safety Tools"
tags: [research, codebase, system-settings, cleanup, server-alive, rounding, audit, permissions]
status: complete
last_updated: 2026-01-30
last_updated_by: tolga
---

# Research: ZMI-TICKET-023 System Settings Options and Safety Tools

**Date**: 2026-01-30
**Researcher**: tolga
**Git Commit**: d9316fba
**Branch**: master
**Repository**: terp

## Research Question

What existing code is relevant to system settings, configuration/settings management, dangerous/admin operations, permission gating, audit logging, rounding relative to plan, cleanup operations, and server alive monitoring? Document only what exists.

## Summary

There is no dedicated system settings model, handler, service, or repository in the codebase. System settings currently live as a JSONB `settings` field on the `Tenant` model, created in migration 000002. The `settings` column is typed as `datatypes.JSON` (GORM) with a default of `'{}'`. It is exposed in the Tenant OpenAPI schema as `additionalProperties: true` but is never read, written, or validated by any service logic -- the tenant service does not handle `settings` in create or update flows. A `settings.manage` permission already exists in the permissions registry. The rounding module has an explicit TODO comment referencing ZMI-TICKET-023 for relative rounding. Audit logging, notification, and permission-gating infrastructure are mature and provide clear patterns for implementation.

---

## Detailed Findings

### 1. Existing System Settings Infrastructure

#### 1.1 Tenant Model Settings Field

**File**: `apps/api/internal/model/tenant.go`

The `Tenant` struct has a `Settings` field:

```go
Settings datatypes.JSON `gorm:"type:jsonb;default:'{}'" json:"settings"`
```

This field was created in migration `000002_create_tenants.up.sql`:

```sql
CREATE TABLE tenants (
    ...
    settings JSONB DEFAULT '{}',
    ...
);
COMMENT ON COLUMN tenants.settings IS 'Tenant-specific configuration as JSON';
```

**Current usage**: The `Settings` field is never read or written by any Go code. The `TenantService` (`apps/api/internal/service/tenant.go`) does not include `Settings` in `CreateTenantInput` or `UpdateTenantInput` structs. The tenant handler does not process this field.

#### 1.2 Tenant OpenAPI Schema

**File**: `api/schemas/tenants.yaml`

The Tenant schema includes settings as an untyped object:

```yaml
settings:
  type: object
  additionalProperties: true
  example: {}
```

There is no structured schema for what goes inside `settings`. Neither `CreateTenantRequest` nor `UpdateTenantRequest` include a `settings` field.

#### 1.3 Settings Permission

**File**: `apps/api/internal/permissions/permissions.go`

A `settings.manage` permission exists:

```go
{ID: permissionID("settings.manage"), Resource: "settings", Action: "manage", Description: "Manage settings"},
```

This permission is registered but not used by any handler or route. No routes reference `settings.manage`.

#### 1.4 Application Config

**File**: `apps/api/internal/config/config.go`

The application config loads from environment variables: `ENV`, `PORT`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRY`, `LOG_LEVEL`, `BASE_URL`, `FRONTEND_URL`. There is no system settings or tenant settings loading mechanism. Configuration is static at startup; no runtime-configurable settings exist.

---

### 2. Rounding Implementation

#### 2.1 Current Rounding Engine

**File**: `apps/api/internal/calculation/rounding.go`

The rounding module implements interval-based rounding anchored at absolute midnight (00:00). Supported types: `none`, `up`, `down`, `nearest`, `add`, `subtract`.

There is an explicit TODO for ZMI-TICKET-023:

```go
// TODO(ZMI-TICKET-023): Add support for rounding relative to plan start time.
// When system settings enable relative rounding, the rounding grid should be
// anchored at the planned start time (e.g., ComeFrom) instead of absolute
// clock intervals (00:00). Requires system settings service from ZMI-TICKET-023.
```

The `RoundTime()` function signature is `RoundTime(minutes int, config *RoundingConfig) int`. It does not accept a plan anchor point.

#### 2.2 Rounding Configuration Types

**File**: `apps/api/internal/calculation/types.go`

```go
type RoundingConfig struct {
    Type     RoundingType
    Interval int // Rounding interval in minutes for up/down/nearest modes
    AddValue int // Fixed value to add/subtract for add/subtract modes
}
```

No field for anchor point or relative-to-plan flag exists.

#### 2.3 Calculator Integration

**File**: `apps/api/internal/calculation/calculator.go`

The `processBookings()` method calls `RoundComeTime()` and `RoundGoTime()` which delegate to `RoundTime()`. These calls pass only the time and config, not the plan start time.

Scope of rounding is already configurable: `RoundAllBookings` flag on `DayPlanInput` controls whether only first-in/last-out are rounded vs. all bookings.

#### 2.4 Day Plan Model Rounding Fields

**File**: `apps/api/internal/model/dayplan.go`

The `DayPlan` model stores rounding config per plan:

```go
RoundingComeType     *RoundingType
RoundingComeInterval *int
RoundingGoType       *RoundingType
RoundingGoInterval   *int
RoundAllBookings     bool
RoundingComeAddValue *int
RoundingGoAddValue   *int
```

The plan also stores the arrival/departure window anchor points:

```go
ComeFrom *int  // Earliest allowed arrival (minutes from midnight)
GoFrom   *int  // Earliest allowed departure (minutes from midnight)
```

These are the anchor points needed for relative rounding but are not currently passed to `RoundTime()`.

#### 2.5 Reference: Relative Rounding Behavior

**File**: `thoughts/shared/reference/zmi-calculation-manual-reference.md` (Section 7.8)

When the system setting "Abgleich relativ zur Kommt-/Gehtzeit" is enabled:
- The rounding grid is anchored at the planned start time instead of midnight.
- Example: plan start 8:10, 15-min round-up. Absolute: 8:11 rounds to 8:15. Relative: 8:11 rounds to 8:25 (grid at 8:10, 8:25, 8:40, ...).

This is a **global system setting**, not per-plan.

#### 2.6 Prior Research on This Gap

**File**: `thoughts/shared/research/2026-01-29-ZMI-TICKET-006-day-plan-advanced-rules.md`

Documents: "Rounding relative to plan start: NOT implemented. Depends on system settings (ZMI-TICKET-023)."

Also: "There is no system settings table or service yet."

---

### 3. Audit Logging Infrastructure

#### 3.1 Audit Log Model

**File**: `apps/api/internal/model/auditlog.go`

```go
type AuditLog struct {
    ID          uuid.UUID
    TenantID    uuid.UUID
    UserID      *uuid.UUID
    Action      AuditAction  // create, update, delete, approve, reject, close, reopen, export, import, login, logout
    EntityType  string
    EntityID    uuid.UUID
    EntityName  *string
    Changes     datatypes.JSON
    Metadata    datatypes.JSON
    IPAddress   *string
    UserAgent   *string
    PerformedAt time.Time
}
```

Actions are typed constants. The `Changes` field stores before/after JSON diffs. `Metadata` stores additional context.

#### 3.2 Audit Log Migration

**File**: `db/migrations/000040_create_audit_logs.up.sql`

Table with indexes on `tenant_id`, `user_id`, `entity_type + entity_id`, `action`, and `performed_at`.

#### 3.3 Audit Log Service

**File**: `apps/api/internal/service/auditlog.go`

Provides `Create`, `List`, and `GetByID` operations. Supports filtering by user, entity_type, entity_id, action, date range.

#### 3.4 Audit Log Repository

**File**: `apps/api/internal/repository/auditlog.go`

GORM-based repository with cursor pagination, filtering, preloading of user relation.

#### 3.5 Audit Log Handler

**File**: `apps/api/internal/handler/auditlog.go`

HTTP handler for `GET /audit-logs` and `GET /audit-logs/{id}`.

#### 3.6 Audit Log Wiring

**File**: `apps/api/cmd/server/main.go`

Audit log service is wired into multiple handlers via `SetAuditService()`:

```go
userHandler.SetAuditService(auditLogService)
userGroupHandler.SetAuditService(auditLogService)
bookingHandler.SetAuditService(auditLogService)
absenceHandler.SetAuditService(auditLogService)
employeeHandler.SetAuditService(auditLogService)
calculationRuleHandler.SetAuditService(auditLogService)
vacationCappingRuleHandler.SetAuditService(auditLogService)
vacationCappingRuleGroupHandler.SetAuditService(auditLogService)
employeeCappingExceptionHandler.SetAuditService(auditLogService)
exportInterfaceHandler.SetAuditService(auditLogService)
```

Pattern: Handlers call audit service after successful mutations. The `SetAuditService()` pattern allows optional audit logging.

#### 3.7 Audit Log OpenAPI

**File**: `api/paths/audit-logs.yaml`, `api/schemas/audit-logs.yaml`

Full CRUD spec with filtering by `user_id`, `entity_type`, `entity_id`, `action`, date range. Uses `PaginationMeta` from `common.yaml`.

---

### 4. Permission and Authorization Infrastructure

#### 4.1 Permission Registry

**File**: `apps/api/internal/permissions/permissions.go`

Deterministic UUID generation from string keys. All permissions declared in `allPermissions` slice. Key format: `{resource}.{action}`. Relevant existing permissions:

- `settings.manage` -- "Manage settings" (unused by any route)
- `booking_overview.delete_bookings` -- "Delete bookings in booking overview"
- `tenants.manage` -- "Manage tenants"
- `users.manage` -- "Manage users"

#### 4.2 Authorization Middleware

**File**: `apps/api/internal/middleware/authorization.go`

`AuthorizationMiddleware` provides:
- `RequirePermission(ids ...string)` -- checks user has any of the given permissions
- `RequireSelfOrPermission(param, permissionID)` -- self-access or permission check
- `RequireEmployeePermission(param, ownID, allID)` -- employee-scoped permission

`PermissionChecker` loads user with relations, checks group admin flag, or checks permission set from `UserGroup.Permissions` (JSONB array of permission ID strings).

#### 4.3 Route Registration Pattern

**File**: `apps/api/internal/handler/routes.go`

All route registration follows this pattern:

```go
func RegisterFooRoutes(r chi.Router, h *FooHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("foo.manage").String()
    r.Route("/foo", func(r chi.Router) {
        if authz == nil {
            // Fallback routes without authz (for testing)
            ...
            return
        }
        r.With(authz.RequirePermission(permManage)).Get("/", h.List)
        ...
    })
}
```

Dangerous operations use multiple permission checks stacked with `r.With()`:

```go
r.With(
    authz.RequirePermission(edit),
    authz.RequirePermission(permDeleteBookings),
    authz.RequireEmployeePermissionFromResolver(bookingResolver, viewOwn, viewAll),
).Delete("/{id}", h.Delete)
```

#### 4.4 User Roles and Groups

**File**: `apps/api/internal/model/user.go`

Users have a `Role` field (`admin` or `user`). User groups have `IsAdmin` (bool) and `Permissions` (JSONB array). Admin users/groups bypass individual permission checks.

---

### 5. Notification Infrastructure

#### 5.1 Notification Model

**File**: `apps/api/internal/model/notification.go`

```go
type NotificationType string

const (
    NotificationTypeApprovals NotificationType = "approvals"
    NotificationTypeErrors    NotificationType = "errors"
    NotificationTypeReminders NotificationType = "reminders"
    NotificationTypeSystem    NotificationType = "system"
)
```

The `system` notification type is directly relevant to Server Alive alerts.

#### 5.2 Notification Service

**File**: `apps/api/internal/service/notification.go`

Key methods for Server Alive integration:
- `Create(ctx, input CreateNotificationInput)` -- creates a notification for a single user
- `CreateForTenantAdmins(ctx, tenantID, input)` -- creates notifications for all admin users in a tenant

The `CreateForTenantAdmins` method iterates all users, filters by `RoleAdmin`, and creates individual notifications. This can be used to notify admins about server alive failures.

Notification preferences are per-user per-type. Users can disable `system` notifications.

#### 5.3 Real-time Notification Stream

**File**: `apps/api/internal/handler/notification.go`

SSE-based real-time notification streaming at `GET /notifications/stream`. Heartbeat every 10 seconds.

---

### 6. Booking and Cleanup Operation Patterns

#### 6.1 Single Booking Delete

**File**: `apps/api/internal/service/booking.go`

The existing `Delete()` method pattern:
1. Fetch booking by ID
2. Check month not closed (`checkMonthNotClosed`)
3. Store references for recalc
4. Delete booking
5. Trigger recalculation

Permission gated via `booking_overview.delete_bookings` permission.

#### 6.2 Booking Repository Bulk Operations

**File**: `apps/api/internal/repository/booking.go`

Existing bulk operations:
- `UpdateCalculatedTimes(ctx, updates map[uuid.UUID]int)` -- uses GORM transaction
- No existing bulk delete method

The repository has date-range query methods:
- `GetByEmployeeAndDateRange(ctx, tenantID, employeeID, startDate, endDate)`
- `GetByDateRange(ctx, tenantID, startDate, endDate)`

These can be used to identify bookings for bulk cleanup operations.

#### 6.3 Order Management

**Files**: `apps/api/internal/service/order.go`, `apps/api/internal/model/order.go`

Orders exist with full CRUD. The order model has standard soft-delete patterns. No "mark as deleted" flag exists; orders use hard delete via `Delete()`.

#### 6.4 Daily Value Management

**File**: `apps/api/internal/repository/dailyvalue.go`

Daily values are upserted during calculation. No bulk delete exists. Relevant for "delete booking data" which would also clear daily values.

#### 6.5 Employee Day Plans

**File**: `apps/api/internal/handler/employeedayplan.go`

An existing `DeleteRange` operation exists for employee day plans:
- `POST /employee-day-plans/delete-range` -- deletes plans for a date range
- Permission gated via `time_plans.manage`

This is the closest existing pattern to a "cleanup" operation.

---

### 7. Application Config and Environment

#### 7.1 Config Structure

**File**: `apps/api/internal/config/config.go`

Static configuration loaded from environment variables at startup:

```go
type Config struct {
    Env         string
    Port        string
    DatabaseURL string
    JWT         JWTConfig
    LogLevel    string
    BaseURL     string
    FrontendURL string
}
```

No proxy settings, no runtime-configurable settings.

#### 7.2 No Proxy Infrastructure

No proxy-related code exists anywhere in the codebase. No email sending infrastructure exists. No internet access from the API server beyond database connectivity.

---

### 8. Data Access Scope

**File**: `apps/api/internal/access/scope.go`

Data scope enforcement for multi-tenant and department/employee isolation:

```go
type Scope struct {
    Type          model.DataScopeType  // all, tenant, department, employee
    TenantIDs     []uuid.UUID
    DepartmentIDs []uuid.UUID
    EmployeeIDs   []uuid.UUID
}
```

Method `ApplyEmployeeScope()` applies WHERE clauses to GORM queries. Cleanup operations would need to respect data scope.

---

### 9. Migration Patterns

#### 9.1 Current Migration Count

Latest migration: `000061_create_payroll_exports.up.sql`. Next migration would be 000062.

#### 9.2 Migration Naming Pattern

Format: `{number}_{description}.{up|down}.sql`

Examples:
- `000002_create_tenants.up.sql` -- create table
- `000037_add_tenant_mandant_fields.up.sql` -- alter table add columns

#### 9.3 ALTER TABLE Pattern

**File**: `db/migrations/000037_add_tenant_mandant_fields.up.sql`

```sql
ALTER TABLE tenants
  ADD COLUMN address_street VARCHAR(255),
  ADD COLUMN address_zip VARCHAR(20),
  ...
  ADD COLUMN vacation_basis VARCHAR(20) NOT NULL DEFAULT 'calendar_year';

ALTER TABLE tenants
  ADD CONSTRAINT chk_tenants_vacation_basis
  CHECK (vacation_basis IN ('calendar_year', 'entry_date'));
```

---

### 10. OpenAPI Spec Structure

#### 10.1 Main Spec

**File**: `api/openapi.yaml`

Swagger 2.0 format. References paths and schemas from subdirectories.

#### 10.2 Path Files

**Directory**: `api/paths/`

One YAML file per resource domain. Each defines endpoints with tags, summary, description, operationId, parameters, and response schemas.

Existing file count: ~50 path files covering all domains.

No `system-settings.yaml` path file exists.

#### 10.3 Schema Files

**Directory**: `api/schemas/`

One YAML file per resource domain. Each defines request/response schemas.

Existing file count: ~50 schema files covering all domains.

No `system-settings.yaml` schema file exists.

#### 10.4 Schema Pattern

Settings-like schemas use the pattern seen in `api/schemas/tenants.yaml`:

```yaml
Tenant:
  type: object
  required:
    - id
    - name
    ...
  properties:
    settings:
      type: object
      additionalProperties: true
```

For structured settings, a typed schema with explicit properties and validation would replace `additionalProperties: true`.

---

### 11. Handler Wiring Pattern

**File**: `apps/api/cmd/server/main.go`

Standard wiring order:
1. Initialize repository: `fooRepo := repository.NewFooRepository(db)`
2. Initialize service: `fooService := service.NewFooService(fooRepo, ...deps)`
3. Initialize handler: `fooHandler := handler.NewFooHandler(fooService)`
4. Wire cross-cutting: `fooHandler.SetAuditService(auditLogService)`
5. Register routes in router block: `handler.RegisterFooRoutes(r, fooHandler, authzMiddleware)`

All handlers are created before routes are registered. Cross-cutting concerns (audit, notification) are wired after handler creation.

---

### 12. Test Infrastructure

Test patterns observed across the codebase:
- `testutil.SetupTestDB(t)` for transaction-based isolation (auto-rollback on cleanup)
- Table-driven tests with `t.Run()`
- `require.NoError` / `assert.ErrorIs` from testify
- Unit tests in `*_test.go` alongside implementation files
- Calculation tests in `apps/api/internal/calculation/*_test.go`

---

## Cross-References

| Aspect | Files | Notes |
|--------|-------|-------|
| Tenant settings field | `model/tenant.go`, `db/migrations/000002_create_tenants.up.sql` | JSONB column exists, unused |
| Settings permission | `permissions/permissions.go` | `settings.manage` exists, unused |
| Rounding TODO | `calculation/rounding.go` | Explicit ZMI-TICKET-023 reference |
| Rounding types | `calculation/types.go`, `calculation/rounding.go` | No anchor point parameter |
| Calculator integration | `calculation/calculator.go` | Calls RoundTime without plan anchor |
| Day plan anchors | `model/dayplan.go` | ComeFrom/GoFrom available |
| Audit log | `model/auditlog.go`, `service/auditlog.go`, `repository/auditlog.go`, `handler/auditlog.go` | Full CRUD, action types, JSON changes |
| Notification service | `service/notification.go` | CreateForTenantAdmins for server alive |
| Permission system | `permissions/permissions.go`, `middleware/authorization.go` | RequirePermission pattern |
| Route registration | `handler/routes.go` | Pattern with authz nil fallback |
| Booking delete | `service/booking.go`, `repository/booking.go` | Single delete with month check |
| Employee day plan delete range | `handler/employeedayplan.go` | Closest cleanup pattern |
| App config | `config/config.go` | Static env-only config |
| Prior research | `research/2026-01-29-ZMI-TICKET-006-day-plan-advanced-rules.md` | Documents missing relative rounding |
| ZMI system settings docs | `impl_plan/zmi-docs/07-system-settings.md` | Full reference for all settings areas |
| Reference manual section 7.8 | `reference/zmi-calculation-manual-reference.md` lines 766-807 | Relative rounding algorithm |
| Main wiring | `cmd/server/main.go` | Dependency injection pattern |
| Latest migration | `db/migrations/000061_*` | Next is 000062 |

---

## Open Questions

1. Should system settings be stored in the existing `tenants.settings` JSONB column, or should a separate `system_settings` table be created? The JSONB approach means settings are tenant-scoped by default but requires JSON schema validation at the application level. A dedicated table gives column-level validation and migration control.

2. For cleanup operations, should the repository provide new bulk-delete methods (e.g., `DeleteBookingsByDateRange`) operating at the SQL level, or should existing single-delete methods be called in a loop within a transaction?

3. Server Alive monitoring implies a background process or scheduled job that checks calculation completion times. No background job infrastructure exists in the codebase. Should this be a separate goroutine, an external cron, or deferred?

4. Proxy settings imply outbound HTTP calls for email and internet access. No email sending infrastructure exists. Should this be deferred until email sending is implemented?

5. The "birthday list window" and "follow-up entries" program start features are desktop-client concepts. Should these be API-accessible settings that the frontend reads, or should they be deferred?
