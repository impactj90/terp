# User Group Management Implementation Plan

## Overview

Implement full user group management across API and web UI, including permission catalog, group CRUD with admin/active flags, member previews, and user-to-group assignment with role synchronization.

## Current State Analysis

- `user_groups` exists in DB with `permissions` JSONB, `is_admin`, `is_system`, but no `code` or `is_active`. (`db/migrations/000007_create_user_groups.up.sql:1`) 
- Users have `user_group_id` in DB and model, but API user responses do not expose it and update does not accept it. (`db/migrations/000008_alter_users_multitenancy.up.sql:2`, `apps/api/internal/handler/user.go:76`) 
- User group handlers return raw models and don’t implement `/permissions` or `active` filtering. (`apps/api/internal/handler/usergroup.go:23`) 
- OpenAPI expects `code`, `is_active`, `Permission` objects, and `/permissions`, which are not implemented. (`api/schemas/user-groups.yaml:2`, `api/paths/user-groups.yaml:2`) 
- Frontend has no user group UI or hooks; admin gating uses `user.role` only. (`apps/web/src/hooks/use-has-role.ts:37`) 

## Desired End State

- User groups are fully manageable via UI: list cards with member count and avatar preview, create/edit form with permission grid, admin toggle, active toggle, and protected system groups.
- Permission catalog is served via `GET /permissions` with descriptions and is used to render the permission picker.
- `GET /user-groups?active=` supports filtering and returns `UserGroupList` wrapper per OpenAPI.
- Users can be assigned to groups via an admin users page; user responses include `user_group_id`.
- Admin groups confer admin role for permission checks by syncing user role when group assignment or group admin flag changes.

### Key Discoveries

- User group admin bypass already exists in `UserGroup.HasPermission`. (`apps/api/internal/model/usergroup.go:27`) 
- User models already include `user_group_id` and `UserGroup` relation. (`apps/api/internal/model/user.go:20`) 
- OpenAPI defines a `Permission` object with `resource` + `action` and `/permissions` path. (`api/schemas/user-groups.yaml:58`, `api/paths/user-groups.yaml:141`) 

## What We’re NOT Doing

- Implementing full RBAC enforcement across all endpoints.
- Building audit logs or history for permission changes.
- Adding a permissions database table (permissions are cataloged in code).

## Implementation Approach

- Align DB schema and API models to OpenAPI (add `code`, `is_active`, add `is_admin` to schema).
- Implement a static permission catalog with deterministic UUIDs and expose `/permissions`.
- Map stored permission IDs to permission objects in API responses.
- Add admin users page for assignment and user groups admin page with card UI.
- Sync `user.role` with group `is_admin` on assignment and on group admin toggle.

## Phase 1: Backend schema + permission catalog

### Overview
Add user group `code` and `is_active`, define a permission catalog, and expose `/permissions`.

### Changes Required

#### 1) Database migration
**File**: `db/migrations/000036_add_user_group_code_active.up.sql`  
**Changes**: Add `code` and `is_active` columns, default active, and unique index per tenant. Populate `code` for existing rows. 

**File**: `db/migrations/000036_add_user_group_code_active.down.sql`  
**Changes**: Drop columns and index.

#### 2) UserGroup model updates
**File**: `apps/api/internal/model/usergroup.go`  
**Changes**: Add `Code` and `IsActive` fields; update JSON tags. 

#### 3) Permission catalog
**File**: `apps/api/internal/permissions/permissions.go` (new)  
**Changes**: Define deterministic UUIDs for each permission, provide `ListPermissions()` and `LookupPermission(id)` helpers. 

#### 4) Permissions handler
**File**: `apps/api/internal/handler/permission.go` (new)  
**Changes**: Implement `ListPermissions` returning `models.PermissionList`. 

#### 5) Routes wiring
**File**: `apps/api/internal/handler/routes.go`  
**Changes**: Register `/permissions` route. 

### Success Criteria

#### Automated Verification:
- [ ] `make test`

#### Manual Verification:
- [ ] `GET /api/v1/permissions` returns a list of permissions with descriptions.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: User group CRUD alignment + role syncing

### Overview
Align handlers/services with OpenAPI (`code`, `is_active`, `is_admin`), add active filtering, and sync user roles based on group admin status.

### Changes Required

#### 1) OpenAPI schemas update
**Files**: 
- `api/schemas/user-groups.yaml` (add `is_admin`, update permission action enum if needed) 
- `api/schemas/users.yaml` (add `user_group_id` to `User`, add `user_group_id` to `UpdateUserRequest`) 

#### 2) Generated models/types
**Files**: 
- `apps/api/gen/models/*.go` (regenerate) 
- `apps/web/src/lib/api/types.ts` (regenerate) 

#### 3) User group repository/service
**File**: `apps/api/internal/repository/usergroup.go`  
**Changes**: Add `GetByCode`, `ListByActive`, update queries. 

**File**: `apps/api/internal/service/usergroup.go`  
**Changes**: Require `code`, check `code` uniqueness, set `is_active`, accept `is_admin`, and sync user roles when `is_admin` changes. 

#### 4) User group handler mapping
**File**: `apps/api/internal/handler/usergroup.go`  
**Changes**: Parse `active` query param, return `models.UserGroupList`, map permission IDs to permission objects, include `code`, `is_active`, `is_admin`. 

#### 5) User update to support group assignment
**File**: `apps/api/internal/handler/user.go`  
**Changes**: Accept `user_group_id`, enforce admin-only assignment. 

**File**: `apps/api/internal/service/user.go`  
**Changes**: Apply group assignment, set `role` based on group admin flag. 

**File**: `apps/api/internal/repository/user.go`  
**Changes**: Add `UpdateRoleByGroup` helper for group admin toggle updates. 

### Success Criteria

#### Automated Verification:
- [ ] `make test`

#### Manual Verification:
- [ ] `GET /api/v1/user-groups?active=true` filters active groups.
- [ ] Creating/updating groups accepts `code`, `is_active`, and `is_admin`.
- [ ] Assigning a user to an admin group updates their effective role to admin.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Frontend user group UI + user assignment

### Overview
Add user group admin UI and admin users page with group assignment.

### Changes Required

#### 1) API hooks
**Files**: 
- `apps/web/src/hooks/api/use-user-groups.ts` (new) 
- `apps/web/src/hooks/api/use-permissions.ts` (new) 
- `apps/web/src/hooks/api/use-users.ts` (new) 
- `apps/web/src/hooks/api/index.ts` (export new hooks) 

#### 2) User groups admin page
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/user-groups/page.tsx` (new)  
**Changes**: Card per group, filters (search/status), member count + avatar preview using user list, and action buttons. 

#### 3) User group form sheet
**File**: `apps/web/src/components/user-groups/user-group-form-sheet.tsx` (new)  
**Changes**: Create/edit form with name, code, description, admin toggle, active toggle, and permission grid (checkboxes grouped by category with descriptions and expandable details). 

#### 4) Admin users page
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/users/page.tsx` (new)  
**Changes**: List users with group assignment dropdown and save behavior; uses `useUsers` + `useUserGroups`. 

#### 5) Navigation and translations
**Files**: 
- `apps/web/src/components/layout/sidebar/sidebar-nav-config.ts` (add User Groups entry) 
- `apps/web/messages/en.json` and `apps/web/messages/de.json` (add `nav.userGroups`, `adminUserGroups`, `adminUsers` strings) 

### Success Criteria

#### Automated Verification:
- [ ] `make test` (or `pnpm -C apps/web lint` if preferred)

#### Manual Verification:
- [ ] User groups page shows cards with member count and avatar preview.
- [ ] Permission grid supports multi-select and shows descriptions with expandable details.
- [ ] Admin toggle and active toggle update groups.
- [ ] System groups cannot be edited/deleted in UI.
- [ ] Users page allows assigning groups and updates user roles accordingly.

---

## Testing Strategy

### Unit Tests:
- Update existing user group handler/service tests to include `code`, `is_active`, `is_admin`.
- Add tests for `/permissions` handler if needed.

### Integration Tests:
- Ensure user group list returns wrapper response with permission objects.

### Manual Testing Steps:
1. Create a new group with permissions and verify it appears in list with active status.
2. Toggle admin flag and ensure members gain admin access after assignment.
3. Assign users to groups from admin users page; verify member count updates in group cards.
4. Deactivate a group and ensure it is filtered out when active filter is enabled.

## Performance Considerations

- Frontend member previews are computed client-side from the users list; use small avatar preview counts and memoization.

## Migration Notes

- Existing user groups will receive generated `code` values in migration.

## References

- Research: `thoughts/shared/research/2026-01-28-user-group-management.md`
