---
date: 2026-01-28T19:00:16+01:00
researcher: tolga
git_commit: 24241a01551581d43928115e96b973fcc8be2164
branch: master
repository: terp
topic: "User group management and permissions"
tags: [research, user-groups, permissions, api, web]
status: complete
last_updated: 2026-01-28
last_updated_by: tolga
---

# Research: User group management and permissions

**Date**: 2026-01-28T19:00:16+01:00  
**Researcher**: tolga  
**Git Commit**: 24241a01551581d43928115e96b973fcc8be2164  
**Branch**: master  
**Repository**: terp

## Research Question

Create user group management for defining permission sets and access control. Understand what exists today in the API, DB, and frontend related to user groups, permissions, and group assignment.

## Summary

- The database includes a `user_groups` table with `permissions` JSONB, `is_admin`, and `is_system` flags, and users have a `user_group_id` foreign key for assignment. (`db/migrations/000007_create_user_groups.up.sql`, `db/migrations/000008_alter_users_multitenancy.up.sql`) 
- The backend implements user group model, repository, service, and handlers. The service enforces unique group names per tenant and blocks updates/deletes to system groups; the model’s `HasPermission` returns true for admin groups. (`apps/api/internal/model/usergroup.go`, `apps/api/internal/service/usergroup.go`, `apps/api/internal/handler/usergroup.go`) 
- OpenAPI defines richer user-group schemas and endpoints (e.g., `code`, `is_active`, `Permission` objects, wrapper list response, and `/permissions` listing), but the current handler returns raw `UserGroup` arrays and does not implement `/permissions`. (`api/schemas/user-groups.yaml`, `api/paths/user-groups.yaml`) 
- Frontend role gating is based on the `user.role` enum (user/admin); there is no dedicated user group UI or hooks in the web app. (`apps/web/src/hooks/use-has-role.ts`) 

## Detailed Findings

### 1) Database schema and user-group linkage

- `user_groups` schema includes `permissions` JSONB, `is_admin`, and `is_system`; uniqueness is currently on `(tenant_id, name)`. (`db/migrations/000007_create_user_groups.up.sql:1`) 
- Users have a `user_group_id` column and index to associate a user to a group. (`db/migrations/000008_alter_users_multitenancy.up.sql:2`) 

### 2) Backend model and permission behavior

- `UserGroup` model includes `Permissions` JSONB, `IsAdmin`, and `IsSystem`. (`apps/api/internal/model/usergroup.go:11`) 
- `UserGroup.HasPermission` short-circuits to true when `IsAdmin` is true; otherwise it checks the stored permission strings. (`apps/api/internal/model/usergroup.go:27`) 
- `User.IsAdmin` checks `UserGroup.IsAdmin` (requires preloaded `UserGroup`). (`apps/api/internal/model/user.go:50`) 

### 3) Service and handler behavior

- The service validates name presence, checks for name uniqueness per tenant, and forbids modifying or deleting system groups. (`apps/api/internal/service/usergroup.go:49`, `apps/api/internal/service/usergroup.go:105`, `apps/api/internal/service/usergroup.go:157`) 
- The handler exposes CRUD under `/user-groups`, decodes `CreateUserGroupRequest` and `UpdateUserGroupRequest`, converts `permission_ids` to string IDs, and returns raw `model.UserGroup` data. (`apps/api/internal/handler/usergroup.go:23`) 
- The handler does not apply an `active` query filter, does not expose `/permissions`, and returns arrays rather than the OpenAPI `UserGroupList` wrapper. (`apps/api/internal/handler/usergroup.go:23`, `api/paths/user-groups.yaml:2`) 

### 4) OpenAPI expectations for user groups and permissions

- The OpenAPI `UserGroup` schema includes `code`, `is_active`, and `permissions` as `Permission` objects; `CreateUserGroupRequest` and `UpdateUserGroupRequest` include `code` and `permission_ids`, with `is_active` on update. (`api/schemas/user-groups.yaml:2`) 
- The OpenAPI paths define `GET /user-groups?active=...` and a `GET /permissions` endpoint for listing available permissions. (`api/paths/user-groups.yaml:2`, `api/paths/user-groups.yaml:141`) 

### 5) Frontend role gating and user groups UI

- Admin access in the frontend is based on `user.role` and `useHasRole(['admin'])`. (`apps/web/src/hooks/use-has-role.ts:37`) 
- There are no `user-groups` hooks or pages under `apps/web/src/app/[locale]/(dashboard)/admin/`; only existing admin sections like employees/teams/etc are present. (`apps/web/src/app/[locale]/(dashboard)/admin/`) 

## Code References

- `db/migrations/000007_create_user_groups.up.sql:1` - User groups table schema with permissions/admin/system flags.
- `db/migrations/000008_alter_users_multitenancy.up.sql:2` - Users table `user_group_id` column.
- `apps/api/internal/model/usergroup.go:11` - UserGroup model fields and JSON tags.
- `apps/api/internal/model/usergroup.go:27` - `HasPermission` admin bypass behavior.
- `apps/api/internal/model/user.go:20` - User model includes `user_group_id` and `UserGroup` relation.
- `apps/api/internal/model/user.go:50` - `User.IsAdmin` derives from the group.
- `apps/api/internal/service/usergroup.go:49` - Create flow with name validation and permissions JSON.
- `apps/api/internal/service/usergroup.go:105` - Update flow with system group guard.
- `apps/api/internal/handler/usergroup.go:23` - User group CRUD handlers and permission ID mapping.
- `api/schemas/user-groups.yaml:2` - OpenAPI user group/permission schemas.
- `api/paths/user-groups.yaml:2` - OpenAPI user group and permissions endpoints.
- `apps/web/src/hooks/use-has-role.ts:37` - Frontend admin role gating.

## Architecture Documentation

- User groups are stored per-tenant in `user_groups` with permissions stored as JSON arrays of strings and `is_admin` as a boolean. (`db/migrations/000007_create_user_groups.up.sql:1`, `apps/api/internal/model/usergroup.go:11`) 
- Users reference groups via `user_group_id` and `User.IsAdmin` derives from the related group. (`db/migrations/000008_alter_users_multitenancy.up.sql:2`, `apps/api/internal/model/user.go:20`) 
- The current handler exposes CRUD but does not translate stored permission IDs into `Permission` objects or implement permission catalog listing. (`apps/api/internal/handler/usergroup.go:23`) 

## Historical Context (from thoughts/)

- `thoughts/shared/research/2026-01-27-dev-mode-seeding-investigation.md` notes that user groups are not seeded in dev login flows. 
- `thoughts/shared/plans/tickets/TICKET-017-create-user-group-model-repository-DONE.md` documents the original model/repository intent and the admin bypass in `HasPermission`. 

## Related Research

- `thoughts/shared/research/2026-01-25-NOK-215-generate-typescript-api-client.md` - Notes the OpenAPI structure used for generating API types, including user-group schemas and paths.

## Open Questions

- There is no permission catalog implementation in the API codebase; only the OpenAPI schema describes `Permission` objects and `/permissions`. Where should the canonical permission list live in the current architecture? 
