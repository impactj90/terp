# TICKET-117: Align Handlers with OpenAPI Spec

**Type**: Refactoring
**Effort**: M
**Sprint**: Backlog
**Priority**: High

## Description

Handlers were implemented with deviations from the OpenAPI specification. The OpenAPI spec should be the single source of truth. This ticket tracks aligning all handlers to match the spec exactly.

## Known Discrepancies

### Teams Handler (`/teams`)

| Issue | OpenAPI Spec | Current Implementation | Status |
|-------|--------------|------------------------|--------|
| List filter param | `is_active` | ~~`active_only`~~ `is_active` | ✅ Fixed |
| Pagination | `limit` + `cursor` params | `TeamList` wrapper added | ✅ Fixed |
| Update method | `PUT` | ~~`PATCH`~~ `PUT` | ✅ Fixed |
| Get team query | `include_members` param | Added | ✅ Fixed |
| Member path param | `employee_id` | ~~`employeeId`~~ `employee_id` | ✅ Fixed |
| Members response | `{items: [...]}` wrapper | `TeamMemberList` wrapper | ✅ Fixed |
| AddMember response | Returns `TeamMember` body (201) | Returns body | ✅ Fixed |
| UpdateMemberRole response | Returns `TeamMember` body (200) | Returns body | ✅ Fixed |
| Missing endpoint | `GET /employees/{employee_id}/teams` | Added | ✅ Fixed |

### Departments Handler (`/departments`)

| Issue | OpenAPI Spec | Current Implementation | Status |
|-------|--------------|------------------------|--------|
| List filter param | `active` | ~~`active_only`~~ `active` | ✅ Fixed |
| Parent filter | `parent_id` query param | Added | ✅ Fixed |
| Response format | `DepartmentList` wrapper | `DepartmentList` with `data` | ✅ Fixed |

### Holidays Handler (`/holidays`)

- Appears mostly aligned, verify response formats

### Other Handlers to Audit

- [ ] `/accounts`
- [ ] `/cost-centers`
- [ ] `/employment-types`
- [ ] `/user-groups`
- [ ] `/tenants`
- [ ] `/users`

## Common Patterns to Fix

1. **Query param naming**: Standardize on spec names (`is_active`, `active`, not `active_only`)
2. **Pagination**: Add `limit`/`cursor` support where spec defines it
3. **Response wrappers**: Use `{items: [...]}` or `*List` schemas as defined
4. **HTTP methods**: Use exact methods from spec (PUT vs PATCH)
5. **Response bodies**: Return proper response bodies as defined in spec
6. **Path params**: Use exact names from spec (snake_case: `employee_id`)

## Implementation Approach

1. For each handler, compare against corresponding `api/paths/*.yaml`
2. Update query param names to match spec
3. Update response formats to match spec schemas
4. Add missing query params and endpoints
5. Fix HTTP methods where different
6. Update tests to match new behavior

## Files to Modify

- `apps/api/internal/handler/team.go`
- `apps/api/internal/handler/department.go`
- `apps/api/internal/handler/routes.go`
- All handler test files
- Potentially service layer for new endpoints

## Acceptance Criteria

- [x] All handler endpoints match OpenAPI spec exactly (Teams & Departments)
- [x] Query param names match spec (`is_active`, `active`, `parent_id`)
- [x] Response formats match spec schemas (`TeamList`, `TeamMemberList`, `DepartmentList`)
- [x] HTTP methods match spec (PUT for team update and member role update)
- [x] All tests updated and passing
- [x] `make lint` passes
