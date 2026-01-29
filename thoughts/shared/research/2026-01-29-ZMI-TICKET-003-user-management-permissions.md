---
date: 2026-01-29T12:42:05+01:00
researcher: codex
git_commit: 3fb3145cd7d990f6fa61ad6aafc290195b3e69c8
branch: master
repository: terp
topic: "ZMI-TICKET-003 user management and permissions"
tags: [research, user-management, permissions, user-groups, auth, api, web]
status: complete
last_updated: 2026-01-29
last_updated_by: codex
---

# Research: ZMI-TICKET-003 user management and permissions

**Date**: 2026-01-29T12:42:05+01:00  
**Researcher**: codex  
**Git Commit**: 3fb3145cd7d990f6fa61ad6aafc290195b3e69c8  
**Branch**: master  
**Repository**: terp

## Research Question

Implement ZMI-style user accounts, user groups, and granular permissions that control API access and data visibility, including data scope and audit logging coverage.

## Summary

- User and user group storage is backed by `users` and `user_groups` tables with tenant and group linkage, role fields, and JSON permission storage; a later migration adds `code` and `is_active` on groups. ([db/migrations/000001_create_users.up.sql#L4-L15](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/db/migrations/000001_create_users.up.sql#L4-L15), [db/migrations/000008_alter_users_multitenancy.up.sql#L1-L15](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/db/migrations/000008_alter_users_multitenancy.up.sql#L1-L15), [db/migrations/000007_create_user_groups.up.sql#L1-L12](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/db/migrations/000007_create_user_groups.up.sql#L1-L12), [db/migrations/000036_add_user_group_code_active.up.sql#L1-L12](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/db/migrations/000036_add_user_group_code_active.up.sql#L1-L12))
- Permission catalog is defined in code as deterministic UUIDs for resource/action pairs; group permissions are stored as JSON arrays of permission IDs and validated on create/update. ([apps/api/internal/permissions/permissions.go#L9-L68](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/permissions/permissions.go#L9-L68), [apps/api/internal/model/usergroup.go#L11-L43](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/model/usergroup.go#L11-L43), [apps/api/internal/service/usergroup.go#L62-L281](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/service/usergroup.go#L62-L281))
- Authorization middleware loads the user with group relations, denies inactive groups, bypasses for admin groups, and enforces `RequirePermission` plus employee-scoped “own vs all” rules; routes wire these checks across user, group, employee, booking, and absence endpoints. ([apps/api/internal/middleware/authorization.go#L69-L239](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/middleware/authorization.go#L69-L239), [apps/api/internal/handler/routes.go#L38-L401](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/handler/routes.go#L38-L401))
- `/auth/permissions` returns permission IDs and an `is_admin` flag (returning all permissions for admin); `/permissions` exposes the permission catalog; the web UI consumes both to gate admin user/group pages by `users.manage`. ([apps/api/internal/handler/auth.go#L657-L718](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/handler/auth.go#L657-L718), [apps/api/internal/handler/permission.go#L22-L38](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/handler/permission.go#L22-L38), [apps/web/src/hooks/use-has-permission.ts#L14-L45](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/web/src/hooks/use-has-permission.ts#L14-L45), [apps/web/src/app/%5Blocale%5D/(dashboard)/admin/users/page.tsx#L26-L55](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/web/src/app/%5Blocale%5D/(dashboard)/admin/users/page.tsx#L26-L55), [apps/web/src/app/%5Blocale%5D/(dashboard)/admin/user-groups/page.tsx#L97-L131](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/web/src/app/%5Blocale%5D/(dashboard)/admin/user-groups/page.tsx#L97-L131))
- Tenant scoping is enforced via the `X-Tenant-ID` header and context; employee listing uses tenant + optional department filter, and employee/time-tracking endpoints apply “own vs all” checks rather than a dedicated user data-scope model. ([apps/api/internal/middleware/tenant.go#L35-L71](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/middleware/tenant.go#L35-L71), [apps/api/internal/handler/employee.go#L29-L86](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/handler/employee.go#L29-L86), [apps/api/internal/repository/employee.go#L21-L166](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/repository/employee.go#L21-L166), [apps/api/internal/handler/routes.go#L313-L384](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/handler/routes.go#L313-L384))
- Audit log endpoints are defined in OpenAPI and generated models exist, but there are no corresponding handlers or repositories in `apps/api/internal`. ([api/paths/audit-logs.yaml#L1-L94](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/api/paths/audit-logs.yaml#L1-L94), [apps/api/gen/models/audit_log.go#L18-L80](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/gen/models/audit_log.go#L18-L80))

**Note**: `./hack/spec_metadata.sh` is referenced by the research workflow but is not present in this repository; metadata was collected manually.

## Detailed Findings

### 1) Data model and migrations for users and user groups

- The initial `users` table defines email, display name, avatar URL, and role (user/admin) with audit timestamps. ([db/migrations/000001_create_users.up.sql#L4-L36](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/db/migrations/000001_create_users.up.sql#L4-L36))
- Multitenancy and user-group linkage are added via `tenant_id`, `user_group_id`, `employee_id`, `username`, `is_active`, and `deleted_at`, with tenant-scoped unique indexes for username/email. ([db/migrations/000008_alter_users_multitenancy.up.sql#L1-L15](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/db/migrations/000008_alter_users_multitenancy.up.sql#L1-L15))
- User groups are stored per-tenant with `permissions` JSONB plus `is_admin` and `is_system`, and later gained a `code` and `is_active` field. ([db/migrations/000007_create_user_groups.up.sql#L1-L12](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/db/migrations/000007_create_user_groups.up.sql#L1-L12), [db/migrations/000036_add_user_group_code_active.up.sql#L1-L12](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/db/migrations/000036_add_user_group_code_active.up.sql#L1-L12))
- The runtime User model includes tenant, user group, and employee linkage plus `role` and `is_active`; there is no password field in the model. ([apps/api/internal/model/user.go#L18-L38](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/model/user.go#L18-L38))

### 2) Permissions catalog and storage

- Permissions are a deterministic UUID catalog defined in code for resources like employees, time tracking, absences, and admin settings. ([apps/api/internal/permissions/permissions.go#L9-L51](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/permissions/permissions.go#L9-L51))
- User group permissions are stored as JSON arrays of permission IDs; admin groups bypass checks. ([apps/api/internal/model/usergroup.go#L11-L43](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/model/usergroup.go#L11-L43))
- The user group service validates permission IDs and syncs user roles when a group’s `is_admin` flag changes. ([apps/api/internal/service/usergroup.go#L94-L229](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/service/usergroup.go#L94-L229))

### 3) Authorization middleware and route enforcement

- Permission checks load the authenticated user with related group and employee, deny inactive groups, and allow admin groups or admin roles by default. ([apps/api/internal/middleware/authorization.go#L69-L133](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/middleware/authorization.go#L69-L133))
- Middleware helpers enforce `RequirePermission`, `RequireSelfOrPermission`, and employee-scoped access based on “own vs all” permissions. ([apps/api/internal/middleware/authorization.go#L151-L239](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/middleware/authorization.go#L151-L239))
- Routes enforce `users.manage` for `/users` and `/user-groups`, and apply permission checks for employee and booking endpoints with own/all logic for time tracking. ([apps/api/internal/handler/routes.go#L38-L384](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/handler/routes.go#L38-L384))

### 4) Auth endpoints and permission exposure

- `/auth/permissions` returns permission IDs and `is_admin` based on the user’s group; admin groups receive the full permission list. ([apps/api/internal/handler/auth.go#L657-L718](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/handler/auth.go#L657-L718))
- `/permissions` exposes the catalog in API responses. ([apps/api/internal/handler/permission.go#L22-L38](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/handler/permission.go#L22-L38))

### 5) User and user-group API behaviors

- User endpoints support list/get/update/delete; user-group assignment happens in user updates and is guarded by `users.manage`. ([apps/api/internal/handler/user.go#L28-L171](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/handler/user.go#L28-L171))
- User-group CRUD endpoints use tenant context, validate permission IDs, and return permission objects in responses. ([apps/api/internal/handler/usergroup.go#L24-L216](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/handler/usergroup.go#L24-L216), [apps/api/internal/handler/response.go#L79-L134](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/handler/response.go#L79-L134))

### 6) Data access scoping (mandant/department/employee)

- Tenant scoping is enforced via `X-Tenant-ID` and the tenant middleware, not via user-specific data scope fields. ([apps/api/internal/middleware/tenant.go#L35-L71](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/middleware/tenant.go#L35-L71))
- Employee list queries filter by tenant and optional department/is_active filters; there is no per-user scope model in the filter. ([apps/api/internal/handler/employee.go#L29-L86](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/handler/employee.go#L29-L86), [apps/api/internal/repository/employee.go#L21-L166](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/repository/employee.go#L21-L166))
- Time-tracking and absence routes use employee-scoped authorization (own vs all) rather than explicit department/mandant scope assignments. ([apps/api/internal/handler/routes.go#L313-L444](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/handler/routes.go#L313-L444))

### 7) Audit logging coverage

- OpenAPI specifies audit log endpoints and models, and generated Go models exist, but no internal handler or repository implementation is present in `apps/api/internal`. ([api/paths/audit-logs.yaml#L1-L94](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/api/paths/audit-logs.yaml#L1-L94), [apps/api/gen/models/audit_log.go#L18-L80](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/gen/models/audit_log.go#L18-L80))

### 8) Frontend integration and gating

- The web app resolves permissions by mapping catalog entries (`/permissions`) to current permission IDs (`/auth/permissions`). ([apps/web/src/hooks/use-has-permission.ts#L14-L45](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/web/src/hooks/use-has-permission.ts#L14-L45), [apps/web/src/hooks/api/use-current-permissions.ts#L1-L7](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/web/src/hooks/api/use-current-permissions.ts#L1-L7), [apps/web/src/hooks/api/use-permissions.ts#L1-L7](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/web/src/hooks/api/use-permissions.ts#L1-L7))
- Admin user management pages gate access with `users.manage`, and user groups categorize permissions by resource/action. ([apps/web/src/app/%5Blocale%5D/(dashboard)/admin/users/page.tsx#L26-L55](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/web/src/app/%5Blocale%5D/(dashboard)/admin/users/page.tsx#L26-L55), [apps/web/src/app/%5Blocale%5D/(dashboard)/admin/user-groups/page.tsx#L66-L171](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/web/src/app/%5Blocale%5D/(dashboard)/admin/user-groups/page.tsx#L66-L171))
- Navigation is still role-gated by `admin` in the sidebar config. ([apps/web/src/components/layout/sidebar/sidebar-nav-config.ts#L105-L215](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts#L105-L215))

## Code References

- [apps/api/internal/model/user.go#L18-L38](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/model/user.go#L18-L38) - User model fields (tenant, group, employee linkage, role, active flags).
- [db/migrations/000001_create_users.up.sql#L4-L36](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/db/migrations/000001_create_users.up.sql#L4-L36) - Base users table schema.
- [db/migrations/000008_alter_users_multitenancy.up.sql#L1-L15](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/db/migrations/000008_alter_users_multitenancy.up.sql#L1-L15) - Tenant, user_group, employee linkage, and unique indices.
- [db/migrations/000007_create_user_groups.up.sql#L1-L12](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/db/migrations/000007_create_user_groups.up.sql#L1-L12) - User groups table with permissions JSON.
- [db/migrations/000036_add_user_group_code_active.up.sql#L1-L12](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/db/migrations/000036_add_user_group_code_active.up.sql#L1-L12) - Group `code` and `is_active` columns.
- [apps/api/internal/permissions/permissions.go#L9-L68](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/permissions/permissions.go#L9-L68) - Permission catalog and deterministic IDs.
- [apps/api/internal/service/usergroup.go#L62-L281](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/service/usergroup.go#L62-L281) - Permission validation, group create/update, admin role sync.
- [apps/api/internal/middleware/authorization.go#L69-L239](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/middleware/authorization.go#L69-L239) - Permission checker and own-vs-all authorization.
- [apps/api/internal/handler/routes.go#L38-L444](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/handler/routes.go#L38-L444) - Route-level permission enforcement for users, groups, employees, bookings, absences.
- [apps/api/internal/handler/auth.go#L657-L718](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/handler/auth.go#L657-L718) - `/auth/permissions` response logic.
- [apps/api/internal/handler/permission.go#L22-L38](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/handler/permission.go#L22-L38) - `/permissions` catalog endpoint.
- [apps/api/internal/handler/user.go#L28-L171](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/handler/user.go#L28-L171) - User list/get/update/delete handlers.
- [apps/api/internal/handler/usergroup.go#L24-L216](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/handler/usergroup.go#L24-L216) - User group CRUD handlers.
- [apps/api/internal/middleware/tenant.go#L35-L71](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/middleware/tenant.go#L35-L71) - Tenant context enforcement.
- [apps/api/internal/handler/employee.go#L29-L86](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/handler/employee.go#L29-L86) - Employee list uses tenant + optional department filters.
- [apps/api/internal/repository/employee.go#L21-L166](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/repository/employee.go#L21-L166) - Tenant-scoped employee query filters.
- [apps/web/src/hooks/use-has-permission.ts#L14-L45](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/web/src/hooks/use-has-permission.ts#L14-L45) - Frontend permission resolution.
- [apps/web/src/app/%5Blocale%5D/(dashboard)/admin/users/page.tsx#L26-L55](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/web/src/app/%5Blocale%5D/(dashboard)/admin/users/page.tsx#L26-L55) - Admin users page gated by `users.manage`.
- [apps/web/src/app/%5Blocale%5D/(dashboard)/admin/user-groups/page.tsx#L66-L171](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/web/src/app/%5Blocale%5D/(dashboard)/admin/user-groups/page.tsx#L66-L171) - Permission category display for groups.
- [apps/web/src/components/layout/sidebar/sidebar-nav-config.ts#L105-L215](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/web/src/components/layout/sidebar/sidebar-nav-config.ts#L105-L215) - Role-based navigation gating.
- [api/paths/auth.yaml#L91-L104](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/api/paths/auth.yaml#L91-L104) - OpenAPI current-user permissions endpoint.
- [api/paths/user-groups.yaml#L1-L158](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/api/paths/user-groups.yaml#L1-L158) - OpenAPI user group endpoints and permissions catalog.
- [api/paths/users.yaml#L1-L90](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/api/paths/users.yaml#L1-L90) - OpenAPI user endpoints.
- [api/paths/audit-logs.yaml#L1-L94](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/api/paths/audit-logs.yaml#L1-L94) - OpenAPI audit log endpoints.
- [apps/api/gen/models/audit_log.go#L18-L80](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/gen/models/audit_log.go#L18-L80) - Generated AuditLog model.

## Architecture Documentation

- Authentication uses JWT middleware to load a user into context, then permission checks load the full user (including group and employee) for request-scoped authorization decisions. ([apps/api/internal/middleware/auth.go#L11-L52](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/middleware/auth.go#L11-L52), [apps/api/internal/middleware/authorization.go#L69-L239](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/middleware/authorization.go#L69-L239))
- Permissions are stored centrally in code and referenced by deterministic UUID; user groups store permission IDs in JSON and API responses map those IDs back into permission objects. ([apps/api/internal/permissions/permissions.go#L9-L68](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/permissions/permissions.go#L9-L68), [apps/api/internal/handler/response.go#L79-L134](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/handler/response.go#L79-L134))
- Tenant scoping uses a required header to populate context; most tenant-scoped handlers fetch the tenant ID from context to scope repository queries. ([apps/api/internal/middleware/tenant.go#L35-L71](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/middleware/tenant.go#L35-L71), [apps/api/internal/handler/employee.go#L29-L86](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/api/internal/handler/employee.go#L29-L86))
- The web UI resolves permissions client-side by joining `/permissions` (catalog) with `/auth/permissions` (assigned IDs) and uses `users.manage` to control admin user/group pages. ([apps/web/src/hooks/use-has-permission.ts#L14-L45](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/web/src/hooks/use-has-permission.ts#L14-L45), [apps/web/src/app/%5Blocale%5D/(dashboard)/admin/users/page.tsx#L26-L55](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/apps/web/src/app/%5Blocale%5D/(dashboard)/admin/users/page.tsx#L26-L55))

## Historical Context (from thoughts/)

- [thoughts/shared/research/2026-01-28-user-group-management.md](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/thoughts/shared/research/2026-01-28-user-group-management.md) - Prior snapshot of user group management; notes that permissions and UI gating were role-based at that time.
- [thoughts/shared/plans/2026-01-28-user-group-permissions-backend.md](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/thoughts/shared/plans/2026-01-28-user-group-permissions-backend.md) - Implementation plan for adding permission enforcement and frontend permission gating.
- [thoughts/shared/docs/admin-users.md](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/thoughts/shared/docs/admin-users.md) - Historical note that the admin users page was not implemented at the time.

## Related Research

- [thoughts/shared/research/2026-01-27-dev-mode-seeding-investigation.md](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/thoughts/shared/research/2026-01-27-dev-mode-seeding-investigation.md) - Notes that dev-mode seeding does not create user groups.
- [thoughts/shared/research/2026-01-29-ZMI-TICKET-001-mandant-master-data.md](https://github.com/impactj90/terp/blob/3fb3145cd7d990f6fa61ad6aafc290195b3e69c8/thoughts/shared/research/2026-01-29-ZMI-TICKET-001-mandant-master-data.md) - Tenant (mandant) master data context relevant to tenant scoping.

## Open Questions

- Are audit log handlers implemented in a different package or planned for later, given that OpenAPI and generated models exist?
- Is user data-scope (mandant/department/employee) intended to be modeled separately from the existing tenant header + own/all permission checks?
