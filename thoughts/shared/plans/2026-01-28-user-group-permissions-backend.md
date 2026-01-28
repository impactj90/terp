# User Group Permissions Backend Implementation Plan

## Overview

Implement enforceable, testable user-group permissions in the API and wire the frontend to consume these permissions, so the UI’s group configuration directly controls access across the product.

## Current State Analysis

- Permissions are defined as deterministic UUIDs in `apps/api/internal/permissions/permissions.go:19` and stored per group as JSON permission IDs with an admin bypass helper in `apps/api/internal/model/usergroup.go:29`.
- User groups and permission IDs are CRUDed and surfaced via handlers, but no permission enforcement exists in routing/middleware; routes are only protected by auth and tenant headers (`apps/api/internal/handler/routes.go:31`).
- User role is stored in JWT and used for admin-only UI gating (`apps/web/src/hooks/use-has-role.ts:37`, `apps/web/src/app/[locale]/(dashboard)/admin/user-groups/page.tsx:93`), but role does not reflect granular permissions.
- /auth/me returns a User record without permissions (`apps/api/internal/handler/auth.go:637`).

## Desired End State

- API endpoints enforce permissions derived from the current user’s group, with admin groups bypassing checks and inactive groups granting no permissions.
- User group creation and updates reject unknown permission IDs.
- UI authorization uses permissions (not just role) for admin screens and actions.
- A dedicated endpoint exposes the current user’s permission IDs for frontend gating.
- Comprehensive tests cover permission evaluation and route enforcement, including “own vs all” cases.

### Key Discoveries
- Permissions are keyed by deterministic UUIDs, not strings like `employees.view` (`apps/api/internal/permissions/permissions.go:19`).
- `UserGroup.HasPermission` expects permission IDs and implements admin bypass (`apps/api/internal/model/usergroup.go:29`).
- No permission middleware exists in the router; all tenant routes are currently wide open once authenticated (`apps/api/internal/handler/routes.go:141`).

## What We’re NOT Doing

- Not introducing new permission categories beyond the existing catalog.
- Not redesigning authentication or embedding permissions into JWTs.
- Not changing the user-role system beyond what’s necessary to enforce permissions.
- Not adding a full UI testing suite if one does not already exist.

## Implementation Approach

- Add a permission evaluation module to load the current user (with group + employee) and check permission IDs deterministically.
- Create middleware helpers to enforce permissions per route, with special handling for employee-scoped “own vs all” access.
- Validate permission IDs during user group create/update.
- Add a new endpoint to fetch the current user’s permission IDs (for UI gating), and update OpenAPI + generated types.
- Expand backend tests to cover permission evaluation and route enforcement.

## Phase 1: Permission Helpers + Validation + AuthZ Core

### Overview
Introduce a single source of truth for permission IDs, validate group inputs, and build a reusable authorization checker.

### Changes Required

#### 1) Export permission ID helpers
**File**: `apps/api/internal/permissions/permissions.go`
**Changes**: Export helpers like `ID(key string) uuid.UUID` or `MustID(key string)` and/or `Key(resource, action)` so middleware uses deterministic IDs consistently.

```go
// Example
func ID(key string) uuid.UUID {
    return permissionID(key)
}

func Key(resource, action string) string {
    return fmt.Sprintf("%s.%s", resource, action)
}
```

#### 2) Validate permission IDs on group create/update
**File**: `apps/api/internal/service/usergroup.go`
**Changes**: Add validation to reject any permission IDs not in `permissions.Lookup`, returning a 400 error.

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

#### 3) Add authorization checker
**File**: `apps/api/internal/middleware` (new file, e.g. `authorization.go`)
**Changes**: Implement a `PermissionChecker` that loads the user with relations (`UserRepository.GetWithRelations`) and evaluates permissions.

Behavior decisions:
- If the user has a group and `IsActive == false`, deny all permission-protected requests.
- If the group is active and `IsAdmin == true`, allow all.
- If no group is assigned, allow only if user role is `admin` (backwards compatibility).

```go
func (c *PermissionChecker) Has(id string) bool
func (c *PermissionChecker) HasAny(ids ...string) bool
```

### Success Criteria

#### Automated Verification
- [x] Go tests pass: `make test`
- [ ] Lint passes: `make lint`

#### Manual Verification
- [ ] Creating/updating a group with an unknown permission ID returns 400.
- [ ] A user with an inactive group receives 403 on protected endpoints.

**Implementation Note**: Pause after this phase for manual verification before moving on.

---

## Phase 2: Route-Level Permission Enforcement

### Overview
Apply authorization middleware to enforce permissions per endpoint, including “own vs all” rules.

### Changes Required

#### 1) Add permission middleware helpers
**File**: `apps/api/internal/middleware/authorization.go`
**Changes**: Add helpers like:

```go
func RequirePermission(ids ...string) func(http.Handler) http.Handler
func RequireEmployeePermission(param string, ownID, allID string) func(http.Handler) http.Handler
```

#### 2) Wire middleware into router
**File**: `apps/api/internal/handler/routes.go`
**Changes**: Wrap route groups with permission middleware. Mapping decisions:

- **Employees** (`employees.*`):
  - GET list/search/get: `employees.view`
  - POST create: `employees.create`
  - PUT update, nested POST/DELETE for contacts/cards: `employees.edit`
  - DELETE employee: `employees.delete`

- **Time Tracking** (`time_tracking.*`):
  - `/bookings` list: `time_tracking.view_all`
  - `/bookings` create/update/delete: allow if booking employee == current user and has `view_own`, else require `view_all` (and `edit` for mutations).
  - `/employees/{id}/day/{date}` and `/daily-values`:
    - If `{id}` matches current user’s employee ID: `time_tracking.view_own`
    - Else: `time_tracking.view_all`
  - `/daily-values/{id}/approve`: `time_tracking.approve`

- **Absences** (`absences.*`):
  - `/employees/{id}/absences` list/create: own -> `absences.request`, others -> `absences.manage`
  - `/absences` list/delete: `absences.manage`
  - `/absences/{id}/approve|reject`: `absences.approve`
  - `/absence-types` CRUD: `absences.manage`

- **Configuration**:
  - `/day-plans/*`: `day_plans.manage`
  - `/week-plans/*`: `week_plans.manage`
  - `/tariffs/*`: `tariffs.manage`

- **Admin**:
  - `/users/*` and `/user-groups/*`: `users.manage`
  - `/tenants/*`: `tenants.manage`
  - `/permissions`: `users.manage`

#### 3) Enforce user update rules with permissions
**File**: `apps/api/internal/service/user.go`
**Changes**: Replace “admin-only” checks with `users.manage` in permission-aware contexts, while still allowing self-profile updates.

### Success Criteria

#### Automated Verification
- [x] Go tests pass: `make test`
- [ ] Lint passes: `make lint`

#### Manual Verification
- [ ] Non-admin, non-permitted users receive 403 from protected endpoints.
- [ ] A user with `view_own` can access only their own employee/time-tracking endpoints.

**Implementation Note**: Pause after this phase for manual verification before moving on.

---

## Phase 3: Frontend Integration + API Exposure

### Overview
Expose permission IDs for the current user and update the UI to gate by permissions.

### Changes Required

#### 1) Add permissions endpoint for current user
**File**: `apps/api/internal/handler/auth.go`
**Changes**: Add `GET /auth/permissions` that returns a list of permission IDs and admin flag for the current user.

Example response:
```json
{ "data": { "permission_ids": ["..."], "is_admin": false } }
```

#### 2) Update OpenAPI + regenerate types
**Files**: `api/openapi.yaml`, `apps/api/cmd/server/openapi.bundled.yaml`
**Changes**: Add endpoint + schema; run `make generate-all`.

#### 3) Add frontend hooks + gating
**Files**:
- `apps/web/src/hooks/api` (new hook `useCurrentPermissions`)
- `apps/web/src/hooks/use-has-permission.ts` (new helper)
- `apps/web/src/app/[locale]/(dashboard)/admin/user-groups/page.tsx`
- `apps/web/src/app/[locale]/(dashboard)/admin/users/page.tsx`

**Changes**: Replace `useHasRole(['admin'])` gating with permission checks for `users.manage`.

### Success Criteria

#### Automated Verification
- [x] OpenAPI + types regenerated: `make generate-all`
- [x] Frontend typecheck/lint passes: `pnpm -C apps/web check`

#### Manual Verification
- [ ] Admin pages are visible only when `users.manage` is present.
- [ ] Users without permissions see 403 when trying protected API actions.

**Implementation Note**: Pause after this phase for manual verification before moving on.

---

## Phase 4: Comprehensive Tests

### Overview
Add unit and integration-style tests to ensure permissions are enforced correctly.

### Changes Required

#### 1) Permission evaluation tests
**File**: `apps/api/internal/middleware/authorization_test.go`
**Changes**: Cover:
- Admin group bypass
- Inactive group deny
- Unknown permission IDs rejection
- “Own vs all” checks

#### 2) Route enforcement tests
**File**: `apps/api/internal/handler/authorization_test.go`
**Changes**: Use a test router with real middleware and minimal stub handlers to validate 403/200 for representative endpoints in each category.

#### 3) User group validation tests
**File**: `apps/api/internal/service/usergroup_test.go`
**Changes**: Add invalid permission ID test cases for create/update.

### Success Criteria

#### Automated Verification
- [x] Go tests pass: `make test`

#### Manual Verification
- [ ] Manual spot checks on key endpoints confirm 403/200 behavior matches permissions.

---

## Testing Strategy

### Unit Tests
- Permission evaluation logic (admin bypass, inactive group deny, permission ID validation).
- Helper functions for permission ID normalization.

### Integration Tests
- Representative endpoints per permission category (employees, absences, time tracking, configuration, admin).
- Own vs all access control on employee-scoped endpoints.

### Manual Testing Steps
1. Create a group with only `employees.view` and verify employees list works, create/update/delete fail.
2. Create a group with `time_tracking.view_own` and verify only own day/booking views work.
3. Create a group with `users.manage` and verify admin pages show and user group CRUD works.

## Performance Considerations

- Cache permission IDs in the request context to avoid repeated JSON parsing per request.
- Avoid extra database hits by using `GetWithRelations` once per request.

## Migration Notes

- No DB migrations required; only API behavior changes.
- If needed, backfill admin groups to ensure administrators retain access.

## References

- Permissions catalog: `apps/api/internal/permissions/permissions.go:19`
- User group permission storage: `apps/api/internal/model/usergroup.go:29`
- Router registration: `apps/api/internal/handler/routes.go:31`
- Admin UI gating (role-only): `apps/web/src/hooks/use-has-role.ts:37`
