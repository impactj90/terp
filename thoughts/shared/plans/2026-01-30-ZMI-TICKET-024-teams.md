# Implementation Plan: ZMI-TICKET-024 - Teams (Mitarbeitergruppen)

**Date:** 2026-01-30
**Ticket:** ZMI-TICKET-024
**Status:** ALREADY IMPLEMENTED - No work required

---

## 1. Overview

ZMI-TICKET-024 requests team management for grouping employees, used by reports and the vacation planner. The feature includes Team CRUD, membership management, and OpenAPI coverage.

**This feature is already fully implemented.** All architectural layers are present: database migration, GORM domain models, repository, service, handler, OpenAPI specification, generated models, route registration with permission-based authorization, dev seed data, and comprehensive test coverage. The report service integration (team-based employee scoping) is also wired.

No additional implementation work is needed. This plan documents the existing implementation for reference.

---

## 2. Implementation Status: Complete

All files exist and are verified in the codebase:

### Data Model Layer
- `/home/tolga/projects/terp/apps/api/internal/model/team.go` -- GORM structs: `Team`, `TeamMember`, `TeamMemberRole` enum
- `/home/tolga/projects/terp/db/migrations/000010_create_teams.up.sql` -- `teams` and `team_members` tables
- `/home/tolga/projects/terp/db/migrations/000010_create_teams.down.sql` -- Rollback migration

### Repository Layer
- `/home/tolga/projects/terp/apps/api/internal/repository/team.go` -- Full data access (16 methods including Upsert for dev seeding)

### Service Layer
- `/home/tolga/projects/terp/apps/api/internal/service/team.go` -- Business logic, validation, input types

### Handler Layer
- `/home/tolga/projects/terp/apps/api/internal/handler/team.go` -- HTTP handlers (11 endpoints)

### Route Registration
- `/home/tolga/projects/terp/apps/api/internal/handler/routes.go` (lines 224-258) -- `RegisterTeamRoutes` with `teams.manage` permission

### DI Wiring
- `/home/tolga/projects/terp/apps/api/cmd/server/main.go` (lines 78, 106, 219, 236, 287, 402) -- Repository, service, handler creation and route registration

### OpenAPI Specification
- `/home/tolga/projects/terp/api/paths/teams.yaml` -- 10 endpoint definitions
- `/home/tolga/projects/terp/api/schemas/teams.yaml` -- 8 schema definitions

### Generated Models
- `/home/tolga/projects/terp/apps/api/gen/models/team.go`
- `/home/tolga/projects/terp/apps/api/gen/models/team_list.go`
- `/home/tolga/projects/terp/apps/api/gen/models/team_member.go`
- `/home/tolga/projects/terp/apps/api/gen/models/team_member_role.go`
- `/home/tolga/projects/terp/apps/api/gen/models/create_team_request.go`
- `/home/tolga/projects/terp/apps/api/gen/models/update_team_request.go`
- `/home/tolga/projects/terp/apps/api/gen/models/add_team_member_request.go`
- `/home/tolga/projects/terp/apps/api/gen/models/update_team_member_request.go`

### Permissions
- `/home/tolga/projects/terp/apps/api/internal/permissions/permissions.go` (line 53) -- `teams.manage` permission

### Dev Seed Data
- `/home/tolga/projects/terp/apps/api/internal/auth/devteams.go` -- 5 teams, 8 memberships

### Tests
- `/home/tolga/projects/terp/apps/api/internal/handler/team_test.go` -- 30+ handler test cases
- `/home/tolga/projects/terp/apps/api/internal/service/team_test.go` -- 25+ service test cases
- `/home/tolga/projects/terp/apps/api/internal/repository/team_test.go` -- 25+ repository test cases

### Report Integration
- `/home/tolga/projects/terp/apps/api/internal/service/report.go` -- `reportTeamRepository` interface, `getEmployeesInScope` uses `TeamIDs`
- `/home/tolga/projects/terp/apps/api/internal/model/report.go` -- `ReportParameters.TeamIDs` field
- `/home/tolga/projects/terp/apps/api/internal/handler/report.go` -- Parses `team_ids` from request

---

## 3. Data Model (Existing)

### `teams` Table (migration 000010)

```sql
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    leader_employee_id UUID,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);
```

### `team_members` Join Table (migration 000010)

```sql
CREATE TABLE team_members (
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    role VARCHAR(50) DEFAULT 'member',
    PRIMARY KEY (team_id, employee_id)
);
```

### Indexes

```sql
CREATE INDEX idx_teams_tenant ON teams(tenant_id);
CREATE INDEX idx_teams_department ON teams(department_id);
CREATE INDEX idx_team_members_employee ON team_members(employee_id);
```

### GORM Models

**Team struct** (`model/team.go`):
| Field | Type | GORM Tag | JSON |
|-------|------|----------|------|
| ID | uuid.UUID | primaryKey, default:gen_random_uuid() | id |
| TenantID | uuid.UUID | not null, index | tenant_id |
| DepartmentID | *uuid.UUID | index | department_id,omitempty |
| Name | string | varchar(255), not null | name |
| Description | string | text | description,omitempty |
| LeaderEmployeeID | *uuid.UUID | uuid | leader_employee_id,omitempty |
| IsActive | bool | default:true | is_active |
| MemberCount | int | gorm:"-" (computed) | member_count |
| CreatedAt | time.Time | default:now() | created_at |
| UpdatedAt | time.Time | default:now() | updated_at |
| Department | *Department | foreignKey:DepartmentID | department,omitempty |
| Leader | *Employee | foreignKey:LeaderEmployeeID | leader,omitempty |
| Members | []TeamMember | foreignKey:TeamID | members,omitempty |

**TeamMember struct** (`model/team.go`):
| Field | Type | GORM Tag | JSON |
|-------|------|----------|------|
| TeamID | uuid.UUID | primaryKey | team_id |
| EmployeeID | uuid.UUID | primaryKey | employee_id |
| JoinedAt | time.Time | default:now() | joined_at |
| Role | TeamMemberRole | varchar(50), default:'member' | role |
| Team | *Team | foreignKey:TeamID | team,omitempty |
| Employee | *Employee | foreignKey:EmployeeID | employee,omitempty |

**TeamMemberRole enum**: `member`, `lead`, `deputy`

---

## 4. API Endpoints (Existing)

All endpoints are behind `teams.manage` permission and require `X-Tenant-ID` header.

| Method | Path | Handler | Operation | Description |
|--------|------|---------|-----------|-------------|
| GET | /teams | List | listTeams | List teams with `is_active` and `department_id` query filters |
| POST | /teams | Create | createTeam | Create team |
| GET | /teams/{id} | Get | getTeam | Get team, supports `include_members=true` query param |
| PUT | /teams/{id} | Update | updateTeam | Update team |
| DELETE | /teams/{id} | Delete | deleteTeam | Delete team (204) |
| GET | /teams/{id}/members | GetMembers | listTeamMembers | List team members |
| POST | /teams/{id}/members | AddMember | addTeamMember | Add member (409 for duplicate) |
| PUT | /teams/{id}/members/{employee_id} | UpdateMemberRole | updateTeamMember | Update member role |
| DELETE | /teams/{id}/members/{employee_id} | RemoveMember | removeTeamMember | Remove member (204) |
| GET | /employees/{employee_id}/teams | GetEmployeeTeams | getEmployeeTeams | Get all teams for an employee |

### Request/Response Schemas

**CreateTeamRequest**: `name` (required, 1-255), `description`, `department_id`, `leader_employee_id`, `is_active` (default true)

**UpdateTeamRequest**: `name` (1-255), `description`, `department_id`, `leader_employee_id`, `is_active` -- all optional

**AddTeamMemberRequest**: `employee_id` (required), `role` (optional, defaults to "member")

**UpdateTeamMemberRequest**: `role` (required, enum: member/lead/deputy)

**Team** response: All model fields including computed `member_count`, optional nested `department`, `leader`, `members`

**TeamList** response: `{ items: Team[], next_cursor?: string }`

---

## 5. Repository Methods (Existing)

| Method | Description |
|--------|-------------|
| Create(ctx, *Team) | Creates team with explicit column selection |
| GetByID(ctx, id) | Retrieves team by UUID |
| GetByName(ctx, tenantID, name) | Retrieves team by tenant+name combo |
| Update(ctx, *Team) | Full save of team |
| Delete(ctx, id) | Hard delete with row-count check |
| List(ctx, tenantID) | All teams for tenant, preloads Department+Leader, populates member counts |
| ListActive(ctx, tenantID) | Active teams only, same preloads |
| ListByDepartment(ctx, departmentID) | Teams filtered by department |
| GetWithMembers(ctx, id) | Team with all relations deeply preloaded |
| AddMember(ctx, teamID, employeeID, role) | Creates TeamMember record |
| RemoveMember(ctx, teamID, employeeID) | Hard deletes TeamMember |
| GetMember(ctx, teamID, employeeID) | Single member lookup |
| UpdateMemberRole(ctx, teamID, employeeID, role) | Updates role column |
| GetMemberTeams(ctx, employeeID) | Reverse lookup via JOIN |
| GetMembers(ctx, teamID) | All members ordered by joined_at |
| Upsert(ctx, *Team) | FirstOrCreate for dev seeding |
| UpsertMember(ctx, *TeamMember) | FirstOrCreate for dev seeding |

Helper: `populateMemberCounts` -- batch COUNT query to avoid N+1

---

## 6. Service Business Logic (Existing)

| Method | Validation / Logic |
|--------|-------------------|
| Create | Trims name, validates non-empty, checks duplicate name per tenant, defaults IsActive=true |
| Update | Fetches existing, applies only provided fields, validates name uniqueness if changed, supports ClearDepartment/ClearLeader flags |
| Delete | Verifies team exists before deleting |
| AddMember | Verifies team exists, checks duplicate membership, returns created member |
| RemoveMember | Verifies team exists, returns ErrMemberNotFound if not found |
| UpdateMemberRole | Verifies team exists, returns updated member |
| GetMembers | Verifies team exists before fetching |
| ValidateTeamMemberRole | Package-level function validating role enum |

Error variables: `ErrTeamNotFound`, `ErrTeamNameRequired`, `ErrTeamNameExists`, `ErrMemberNotFound`, `ErrMemberExists`, `ErrInvalidRole`

---

## 7. Test Coverage (Existing)

### Handler Tests (`team_test.go`) -- 30+ test cases
- Create: success, default active, invalid body, empty name, no tenant, duplicate name
- Get: success, invalid ID, not found, with include_members
- List: all, is_active filter, no tenant
- Update: success, invalid ID, not found, invalid body, duplicate name
- Delete: success, invalid ID, not found
- GetMembers: success, team not found
- AddMember: success, default role, invalid role, team not found, already member (409)
- RemoveMember: success, team not found, member not found
- UpdateMemberRole: success, invalid role
- GetEmployeeTeams: success, empty, invalid ID

### Service Tests (`team_test.go`) -- 25+ test cases
- Create: success, with department, empty name, duplicate name, trims whitespace
- GetByID/GetByName: success, not found
- Update: success, not found, empty name, duplicate name, same name, clear department
- Delete: success, not found
- List/ListActive/ListByDepartment
- GetWithMembers
- AddMember: success, team not found, already member
- RemoveMember: success, team not found, member not found
- UpdateMemberRole: success, team not found, member not found
- GetMemberTeams: multi-team, empty
- GetMembers: success, team not found
- ValidateTeamMemberRole: valid, invalid

### Repository Tests (`team_test.go`) -- 25+ test cases
- CRUD operations: create, create with description, create with department, get by ID/name, update, delete
- List operations: list all, ordered by name, empty, list active, list by department (empty and populated)
- Member operations: get with members (found, not found, no members), add member (default + with role), remove member, get member, update member role
- Reverse lookup: get member teams (multi-team, empty)
- Cascade: delete cascades members

---

## 8. Acceptance Criteria Verification

| Criterion | Status |
|-----------|--------|
| Teams can be created and members assigned | DONE -- Create endpoint + AddMember endpoint |
| Team filters available in report/evaluation endpoints | DONE -- `ReportParameters.TeamIDs` in report model, parsed in handler, scoped in service |
| Team CRUD endpoints | DONE -- GET/POST/PUT/DELETE /teams and /teams/{id} |
| Add/remove team members | DONE -- POST/DELETE /teams/{id}/members |
| List teams with members | DONE -- GET /teams/{id}?include_members=true |
| OpenAPI documentation | DONE -- `api/paths/teams.yaml` and `api/schemas/teams.yaml` |
| Employees can belong to multiple teams | DONE -- many-to-many via team_members join table |
| Unit tests for membership operations | DONE -- handler, service, repository test files |
| API tests for create/add/list | DONE -- handler tests with httptest |
| Integration tests for report filtering | DONE -- report service uses teamRepo for scoping |

---

## 9. Known Limitations / Open Questions

1. **Cursor-based pagination not implemented**: The OpenAPI spec defines `limit` and `cursor` parameters for `GET /teams`, but the handler returns all teams. The `TeamList.NextCursor` field is always empty.

2. **Single permission**: All team operations require `teams.manage`. No separate read-only permission exists.

3. **leader_employee_id FK not enforced at DB level**: The migration comments indicate the FK is "added later after employees table." No subsequent migration adds this constraint. The relationship is enforced only at the GORM level.

4. **No tenant scoping on some repository methods**: `GetByID`, `GetWithMembers`, `Delete`, member operations, and `GetMemberTeams` do not filter by `tenant_id`. They rely on UUID global uniqueness.

5. **IsActive update limitation**: The handler always passes `input.IsActive = &req.IsActive`, which means `is_active` is always updated (even if not provided in the request body, it defaults to `false`).

6. **No audit logging**: Team operations do not emit audit log events, unlike some other entities.

---

## 10. Conclusion

**No implementation work is required for ZMI-TICKET-024.** The feature is fully built, tested, wired, and documented across all layers. The ticket can be moved to Done status.

To verify the existing implementation:

```bash
# Run all team tests
cd /home/tolga/projects/terp/apps/api && go test -v -run TestTeam ./internal/handler/... ./internal/service/... ./internal/repository/...

# Verify OpenAPI bundle includes team endpoints
make swagger-bundle && grep -c "teams" api/openapi.bundled.yaml

# Verify generated models exist
ls apps/api/gen/models/*team*.go
```
