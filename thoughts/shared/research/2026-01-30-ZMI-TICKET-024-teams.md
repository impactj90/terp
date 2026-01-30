# Research: ZMI-TICKET-024 - Teams (Mitarbeitergruppen)

**Date:** 2026-01-30
**Ticket:** ZMI-TICKET-024
**Status:** Fully implemented

---

## Summary

The Teams (Mitarbeitergruppen) feature is **already fully implemented** across all layers of the application. The implementation includes GORM domain models, PostgreSQL migrations, repository data access, service business logic, HTTP handlers, OpenAPI specifications, generated Swagger models, route registration with permission-based authorization, dev seed data, and comprehensive test coverage. Teams are also integrated with the report service for filtering employees by team scope.

---

## Existing Patterns

### GORM Models (`apps/api/internal/model/team.go`)

Two domain models exist:

**Team struct:**
- `ID` (uuid.UUID, primary key, auto-generated)
- `TenantID` (uuid.UUID, required, indexed) -- multi-tenancy
- `DepartmentID` (*uuid.UUID, optional, indexed) -- FK to departments
- `Name` (varchar(255), required)
- `Description` (text, optional)
- `LeaderEmployeeID` (*uuid.UUID, optional) -- FK to employees
- `IsActive` (bool, default true)
- `MemberCount` (int, computed field with `gorm:"-"`, not stored in DB)
- `CreatedAt` / `UpdatedAt` (time.Time)
- Relations: `Department`, `Leader` (Employee), `Members` ([]TeamMember)
- Table name: `teams`

**TeamMember struct:**
- `TeamID` (uuid.UUID, composite primary key)
- `EmployeeID` (uuid.UUID, composite primary key)
- `JoinedAt` (time.Time, default now)
- `Role` (TeamMemberRole: "member", "lead", "deputy")
- Relations: `Team`, `Employee`
- Table name: `team_members`

**TeamMemberRole enum** (string type):
- `TeamMemberRoleMember` = "member"
- `TeamMemberRoleLead` = "lead"
- `TeamMemberRoleDeputy` = "deputy"

Pattern notes:
- Uses UUID primary keys (same as all other models)
- Multi-tenancy via `TenantID` with index
- Composite primary key for join table (`team_id`, `employee_id`)
- `MemberCount` is a computed field populated by the repository, not stored in DB
- Optional foreign keys use pointer types (`*uuid.UUID`)

### Database Migration (`db/migrations/000010_create_teams.up.sql`)

```sql
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    leader_employee_id UUID, -- FK added later after employees table
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

CREATE TABLE team_members (
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL, -- FK added later after employees table
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    role VARCHAR(50) DEFAULT 'member',
    PRIMARY KEY (team_id, employee_id)
);

CREATE INDEX idx_teams_tenant ON teams(tenant_id);
CREATE INDEX idx_teams_department ON teams(department_id);
CREATE INDEX idx_team_members_employee ON team_members(employee_id);
```

Down migration: `DROP TABLE IF EXISTS team_members; DROP TABLE IF EXISTS teams;`

Notes:
- `UNIQUE(tenant_id, name)` ensures team names are unique per tenant
- `ON DELETE CASCADE` for tenant FK means deleting a tenant removes its teams
- `ON DELETE SET NULL` for department FK preserves teams if department is deleted
- `leader_employee_id` and `team_members.employee_id` FKs are noted as "added later" (after employees table creation in a subsequent migration)
- Composite primary key `(team_id, employee_id)` prevents duplicate memberships
- Migration number is 000010

### Repository (`apps/api/internal/repository/team.go`)

`TeamRepository` struct with `*DB` dependency. Methods:

| Method | Description |
|--------|-------------|
| `Create(ctx, *model.Team)` | Creates team with explicit column selection |
| `GetByID(ctx, id)` | Retrieves team by UUID |
| `GetByName(ctx, tenantID, name)` | Retrieves team by tenant+name combo |
| `Update(ctx, *model.Team)` | Full save of team |
| `Delete(ctx, id)` | Hard delete with row-count check |
| `List(ctx, tenantID)` | All teams for tenant, preloads Department+Leader, ordered by name ASC, populates member counts |
| `ListActive(ctx, tenantID)` | Active teams only, same preloads |
| `ListByDepartment(ctx, departmentID)` | Teams filtered by department, same preloads |
| `GetWithMembers(ctx, id)` | Team with Department+Leader+Members+Members.Employee+Members.Employee.Department preloaded |
| `AddMember(ctx, teamID, employeeID, role)` | Creates TeamMember record |
| `RemoveMember(ctx, teamID, employeeID)` | Hard deletes TeamMember with row-count check |
| `GetMember(ctx, teamID, employeeID)` | Single member lookup |
| `UpdateMemberRole(ctx, teamID, employeeID, role)` | Updates role column |
| `GetMemberTeams(ctx, employeeID)` | Reverse lookup: teams for an employee via JOIN |
| `GetMembers(ctx, teamID)` | All members of a team, ordered by joined_at ASC |
| `Upsert(ctx, *model.Team)` | FirstOrCreate pattern for dev seeding |
| `UpsertMember(ctx, *model.TeamMember)` | FirstOrCreate pattern for dev seeding |

**`populateMemberCounts` helper:**
- Collects team IDs from a slice
- Runs a `SELECT team_id, COUNT(*) as count FROM team_members WHERE team_id IN (?) GROUP BY team_id`
- Builds a map and populates the computed `MemberCount` field on each team
- Called by `List`, `ListActive`, and `ListByDepartment`

Error variables: `ErrTeamNotFound`, `ErrMemberNotFound`

### Service (`apps/api/internal/service/team.go`)

`TeamService` struct with `teamRepository` interface dependency.

**Interface definition (`teamRepository`):**
```go
type teamRepository interface {
    Create(ctx context.Context, team *model.Team) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.Team, error)
    GetByName(ctx context.Context, tenantID uuid.UUID, name string) (*model.Team, error)
    Update(ctx context.Context, team *model.Team) error
    Delete(ctx context.Context, id uuid.UUID) error
    List(ctx context.Context, tenantID uuid.UUID) ([]model.Team, error)
    ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.Team, error)
    ListByDepartment(ctx context.Context, departmentID uuid.UUID) ([]model.Team, error)
    GetWithMembers(ctx context.Context, id uuid.UUID) (*model.Team, error)
    AddMember(ctx context.Context, teamID, employeeID uuid.UUID, role model.TeamMemberRole) error
    RemoveMember(ctx context.Context, teamID, employeeID uuid.UUID) error
    GetMember(ctx context.Context, teamID, employeeID uuid.UUID) (*model.TeamMember, error)
    UpdateMemberRole(ctx context.Context, teamID, employeeID uuid.UUID, role model.TeamMemberRole) error
    GetMemberTeams(ctx context.Context, employeeID uuid.UUID) ([]model.Team, error)
    GetMembers(ctx context.Context, teamID uuid.UUID) ([]model.TeamMember, error)
    Upsert(ctx context.Context, team *model.Team) error
    UpsertMember(ctx context.Context, member *model.TeamMember) error
}
```

**Input types:**
- `CreateTeamInput`: TenantID, Name, Description, DepartmentID (*uuid.UUID), LeaderEmployeeID (*uuid.UUID)
- `UpdateTeamInput`: Name (*string), Description (*string), DepartmentID (*uuid.UUID), LeaderEmployeeID (*uuid.UUID), IsActive (*bool), ClearDepartment (bool), ClearLeader (bool)

**Business logic:**
- `Create`: Trims name, validates non-empty, checks duplicate name per tenant, defaults IsActive=true
- `Update`: Fetches existing, applies only provided fields, validates name uniqueness if changed, supports clearing department/leader via `ClearDepartment`/`ClearLeader` flags
- `Delete`: Verifies team exists before deleting
- `AddMember`: Verifies team exists, checks for duplicate membership, returns created member
- `RemoveMember`: Verifies team exists, returns ErrMemberNotFound if not found
- `UpdateMemberRole`: Verifies team exists, returns updated member
- `GetMembers`: Verifies team exists before fetching members
- `ValidateTeamMemberRole` (package-level): Validates role string against enum values
- `UpsertDevTeam` / `UpsertDevTeamMember`: For dev mode seeding

Error variables: `ErrTeamNotFound`, `ErrTeamNameRequired`, `ErrTeamNameExists`, `ErrMemberNotFound`, `ErrMemberExists`, `ErrInvalidRole`

### Handler (`apps/api/internal/handler/team.go`)

`TeamHandler` struct with `*service.TeamService` dependency.

**Response wrapper types:**
- `TeamList` struct: `Items []model.Team`, `NextCursor string` (for pagination)
- `TeamMemberList` struct: `Items []model.TeamMember`

**Endpoints:**

| Method | Handler | Description |
|--------|---------|-------------|
| GET /teams | `List` | Lists teams with optional `is_active` and `department_id` query filters |
| POST /teams | `Create` | Creates team using `models.CreateTeamRequest` (generated) |
| GET /teams/{id} | `Get` | Gets team, supports `include_members=true` query param |
| PUT /teams/{id} | `Update` | Updates team using `models.UpdateTeamRequest` (generated) |
| DELETE /teams/{id} | `Delete` | Deletes team, returns 204 |
| GET /teams/{id}/members | `GetMembers` | Lists team members |
| POST /teams/{id}/members | `AddMember` | Adds member using `models.AddTeamMemberRequest` (generated), defaults role to "member" |
| DELETE /teams/{id}/members/{employee_id} | `RemoveMember` | Removes member, returns 204 |
| PUT /teams/{id}/members/{employee_id} | `UpdateMemberRole` | Updates role using `models.UpdateTeamMemberRequest` (generated) |
| GET /employees/{employee_id}/teams | `GetEmployeeTeams` | Gets all teams for an employee |

Pattern notes:
- Uses generated models (`models.CreateTeamRequest`, etc.) for request parsing and validation
- Calls `req.Validate(nil)` on generated models for input validation
- Extracts tenant from context via `middleware.TenantFromContext`
- Maps service errors to HTTP status codes (404, 400, 409, 500)
- Returns 409 Conflict for duplicate team membership

### Route Registration (`apps/api/internal/handler/routes.go`)

```go
func RegisterTeamRoutes(r chi.Router, h *TeamHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("teams.manage").String()
    r.Route("/teams", func(r chi.Router) {
        // ... routes with authz.RequirePermission(permManage)
    })
    // Employee teams endpoint per OpenAPI spec
    r.With(authz.RequirePermission(permManage)).Get("/employees/{employee_id}/teams", h.GetEmployeeTeams)
}
```

All team routes require `teams.manage` permission. The `/employees/{employee_id}/teams` endpoint is registered outside the `/teams` route group but still within the same registration function.

### Main DI Wiring (`apps/api/cmd/server/main.go`)

```go
teamRepo := repository.NewTeamRepository(db)         // line 78
teamService := service.NewTeamService(teamRepo)        // line 106
teamHandler := handler.NewTeamHandler(teamService)     // line 236
handler.RegisterTeamRoutes(r, teamHandler, authzMiddleware)  // line 402
```

Team routes are registered in the tenant-scoped route group (requires authentication + `X-Tenant-ID` header).

The report service also receives `teamRepo`:
```go
reportService := service.NewReportService(reportRepo, employeeRepo, dailyValueRepo, monthlyValueRepo, absenceDayRepo, vacationBalanceRepo, teamRepo)
```

The auth handler receives `teamService` for dev seeding:
```go
authHandler := handler.NewAuthHandler(..., teamService, ...)
```

### OpenAPI Specification

**Paths** (`api/paths/teams.yaml`):
- `GET /teams` - listTeams (filters: department_id, is_active, limit, cursor)
- `POST /teams` - createTeam
- `GET /teams/{id}` - getTeam (query: include_members)
- `PUT /teams/{id}` - updateTeam
- `DELETE /teams/{id}` - deleteTeam
- `GET /teams/{id}/members` - listTeamMembers
- `POST /teams/{id}/members` - addTeamMember (409 for duplicate)
- `PUT /teams/{id}/members/{employee_id}` - updateTeamMember
- `DELETE /teams/{id}/members/{employee_id}` - removeTeamMember
- `GET /employees/{employee_id}/teams` - getEmployeeTeams

**Schemas** (`api/schemas/teams.yaml`):
- `Team` - id, tenant_id, department_id, name, description, leader_employee_id, is_active, member_count, created_at, updated_at, department (ref), leader (ref), members (array ref). Required: id, tenant_id, name, is_active
- `TeamMember` - team_id, employee_id, joined_at, role, employee (ref). Required: team_id, employee_id, joined_at, role
- `TeamMemberRole` - enum: member, lead, deputy
- `TeamList` - items (array of Team), next_cursor. Required: items
- `CreateTeamRequest` - name (required, 1-255), description, department_id, leader_employee_id, is_active (default true)
- `UpdateTeamRequest` - name (1-255), description, department_id, leader_employee_id, is_active (all optional)
- `AddTeamMemberRequest` - employee_id (required), role (optional)
- `UpdateTeamMemberRequest` - role (required)

### Generated Models (`apps/api/gen/models/`)

The following generated models exist and are used by the handler layer:
- `apps/api/gen/models/team.go` - Team response model
- `apps/api/gen/models/team_list.go` - TeamList with Items + NextCursor
- `apps/api/gen/models/team_member.go` - TeamMember response model
- `apps/api/gen/models/team_member_role.go` - TeamMemberRole enum with validation
- `apps/api/gen/models/create_team_request.go` - CreateTeamRequest with name validation (required, 1-255 chars)
- `apps/api/gen/models/update_team_request.go` - UpdateTeamRequest (all fields optional)
- `apps/api/gen/models/add_team_member_request.go` - AddTeamMemberRequest with employee_id (required) and role (optional)
- `apps/api/gen/models/update_team_member_request.go` - UpdateTeamMemberRequest with role (required)

### Permissions (`apps/api/internal/permissions/permissions.go`)

```go
{ID: permissionID("teams.manage"), Resource: "teams", Action: "manage", Description: "Manage teams"}
```

Deterministic UUID via SHA1 namespace. Single permission controls all team operations.

### Dev Seed Data (`apps/api/internal/auth/devteams.go`)

5 predefined teams:
| ID | Name | Department | Leader |
|----|------|------------|--------|
| ...0901 | Backend Team | Software Development | Admin |
| ...0902 | Frontend Team | Software Development | Anna |
| ...0903 | DevOps Team | Infrastructure | (none) |
| ...0904 | HR Core Team | Human Resources | (none) |
| ...0905 | Accounting Team | Finance | (none) |

8 predefined memberships across 5 employees:
- Backend: Admin (lead), Thomas (member), Maria (member)
- Frontend: Anna (lead), User (member)
- DevOps: Thomas (member)
- HR Core: Maria (deputy)
- Accounting: Anna (member)

---

## Dependencies

### Teams depend on:
- `tenants` table (teams.tenant_id FK, CASCADE delete)
- `departments` table (teams.department_id FK, SET NULL on delete)
- `employees` table (teams.leader_employee_id, team_members.employee_id)

### Other modules that depend on Teams:
- **Report Service** (`apps/api/internal/service/report.go`):
  - `reportTeamRepository` interface requires `List(ctx, tenantID)` and `GetMembers(ctx, teamID)`
  - `ReportService` struct has `teamRepo` field
  - `getEmployeesInScope` method uses team filtering: if `ReportParameters.TeamIDs` is set, collects all unique employee IDs from specified teams
  - Wired in main.go: `service.NewReportService(..., teamRepo)`

- **Report Model** (`apps/api/internal/model/report.go`):
  - `ReportParameters` struct has `TeamIDs []uuid.UUID` field

- **Report Handler** (`apps/api/internal/handler/report.go`):
  - Parses `req.Parameters.TeamIds` from request and maps to `input.TeamIDs`

- **Auth Handler** (`apps/api/cmd/server/main.go`):
  - Receives `teamService` for dev mode data seeding

---

## Key Files

| File | Purpose |
|------|---------|
| `apps/api/internal/model/team.go` | GORM domain models (Team, TeamMember, TeamMemberRole) |
| `apps/api/internal/repository/team.go` | Data access layer with GORM queries |
| `apps/api/internal/service/team.go` | Business logic, validation, repository interface |
| `apps/api/internal/handler/team.go` | HTTP handlers using generated request models |
| `apps/api/internal/handler/routes.go` | Route registration (RegisterTeamRoutes) |
| `apps/api/cmd/server/main.go` | DI wiring (lines 78, 106, 236, 287, 402) |
| `db/migrations/000010_create_teams.up.sql` | Database schema (teams + team_members tables) |
| `db/migrations/000010_create_teams.down.sql` | Rollback migration |
| `api/paths/teams.yaml` | OpenAPI path definitions (10 endpoints) |
| `api/schemas/teams.yaml` | OpenAPI schema definitions (8 schemas) |
| `apps/api/gen/models/team.go` | Generated Team response model |
| `apps/api/gen/models/team_list.go` | Generated TeamList model |
| `apps/api/gen/models/team_member.go` | Generated TeamMember model |
| `apps/api/gen/models/team_member_role.go` | Generated TeamMemberRole enum |
| `apps/api/gen/models/create_team_request.go` | Generated create request model |
| `apps/api/gen/models/update_team_request.go` | Generated update request model |
| `apps/api/gen/models/add_team_member_request.go` | Generated add member request model |
| `apps/api/gen/models/update_team_member_request.go` | Generated update member request model |
| `apps/api/internal/permissions/permissions.go` | teams.manage permission definition (line 53) |
| `apps/api/internal/auth/devteams.go` | Dev seed data (5 teams, 8 memberships) |
| `apps/api/internal/handler/team_test.go` | Handler tests (30+ test cases) |
| `apps/api/internal/service/team_test.go` | Service tests |
| `apps/api/internal/repository/team_test.go` | Repository tests |
| `apps/api/internal/service/report.go` | Report service with team-based employee scoping |
| `apps/api/internal/model/report.go` | ReportParameters.TeamIDs field |
| `apps/api/internal/handler/report.go` | Report handler parsing team_ids from request |

---

## Observations

1. **Feature is complete**: Teams exist across all architectural layers -- model, migration, repository, service, handler, OpenAPI spec, generated models, routes, permissions, seed data, and tests.

2. **Many-to-many relationship**: Teams and Employees are linked via the `team_members` join table with a composite primary key `(team_id, employee_id)`. This prevents duplicate memberships at the database level.

3. **Computed MemberCount**: The `MemberCount` field on the Team model uses `gorm:"-"` (excluded from DB) and is populated via a separate aggregate query in the repository's `populateMemberCounts` helper. This avoids N+1 queries by batching count lookups.

4. **Role enum**: Three roles exist (member, lead, deputy). Validation happens both at the service layer (`ValidateTeamMemberRole`) and via the generated Swagger model enum validation.

5. **Report integration**: The report service uses `TeamIDs` in `ReportParameters` to filter employees. When team IDs are specified in a report, the service calls `teamRepo.GetMembers` for each team and collects unique employee IDs. The `reportTeamRepository` interface defines only the two methods needed by reports (`List` and `GetMembers`), following the interface segregation principle.

6. **Unique constraint**: Team names must be unique per tenant (`UNIQUE(tenant_id, name)`). This is enforced at both the database level and the service level (via `GetByName` check before create/update).

7. **Pagination**: The OpenAPI spec defines `limit` and `cursor` parameters for list endpoints, and the `TeamList` response includes `next_cursor`. However, the current handler implementation does not use cursor-based pagination -- it returns all teams matching the filter criteria.

8. **No soft delete**: Teams use hard delete (`DELETE FROM`), not soft delete. Cascading delete on `team_members` ensures cleanup.

9. **UpdateTeamRequest IsActive issue**: The handler notes that `IsActive` cannot be reliably detected as "provided" vs "default false" with the current OpenAPI/generated model design, since `bool` defaults to `false` in Go. The handler always passes `input.IsActive = &req.IsActive`.

10. **Dev seeding**: The auth handler seeds teams on dev login using `UpsertDevTeam` and `UpsertDevTeamMember`, following the same upsert pattern used for other dev entities.

11. **Authorization**: All team endpoints require the single `teams.manage` permission. There is no read-only permission for teams (unlike employees which have separate view/create/edit/delete permissions).

12. **Handler uses generated models**: Following the CLAUDE.md instruction, the handler imports and uses `gen/models` for request/response payloads (CreateTeamRequest, UpdateTeamRequest, AddTeamMemberRequest, UpdateTeamMemberRequest).

13. **Handler response format**: The handler returns domain models (`model.Team`, `model.TeamMember`) directly as JSON responses rather than mapping to generated response models. Only request parsing uses the generated models.

---

## Open Questions

1. **Cursor-based pagination not implemented**: The OpenAPI spec defines `limit` and `cursor` parameters for `GET /teams`, but the handler ignores these and returns all teams. Is this intentional or a gap to be addressed?

2. **No `system_settings.manage` permission usage for teams**: The `teams.manage` permission is the only gatekeeper. Should there be separate read vs. write permissions (e.g., `teams.view` + `teams.manage`)?

3. **Foreign key constraints for leader_employee_id**: The migration comments indicate `leader_employee_id` FK is "added later after employees table." Is there a subsequent migration that adds this FK constraint, or does it remain without a database-level FK?

4. **No tenant scoping in some repository methods**: `GetByID`, `GetWithMembers`, `Delete`, member operations, and `GetMemberTeams` do not filter by tenant_id. They rely on the UUID being globally unique. Is this acceptable for the multi-tenancy model, or should additional tenant checks be added?

5. **No audit logging for team operations**: Unlike users, bookings, absences, and other entities that have `SetAuditService` wiring, the team handler does not emit audit log events.
