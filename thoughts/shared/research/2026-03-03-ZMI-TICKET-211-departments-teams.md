# Research: ZMI-TICKET-211 -- Departments + Teams tRPC Routers

Date: 2026-03-03

---

## 1. Existing Go Business Logic

### 1.1 Department Service (`apps/api/internal/service/department.go` -- 308 lines)

**Error Constants:**
```go
ErrDepartmentNotFound       = errors.New("department not found")
ErrDepartmentCodeRequired   = errors.New("department code is required")
ErrDepartmentNameRequired   = errors.New("department name is required")
ErrDepartmentCodeExists     = errors.New("department code already exists")
ErrCircularReference        = errors.New("circular reference detected")
ErrCannotDeleteWithChildren = errors.New("cannot delete department with children")
ErrParentNotFound           = errors.New("parent department not found")
```

**Create -- `CreateDepartmentInput`:**
- Fields: `TenantID`, `Code`, `Name`, `Description`, `ParentID` (optional), `ManagerEmployeeID` (optional)
- Validation: `Code` and `Name` required (trimmed, empty check)
- Uniqueness: Check `GetByCode(tenantID, code)` -- returns error if exists
- Parent validation: If `ParentID` provided, verify parent exists and belongs to same tenant
- Defaults: `IsActive = true`

**Update -- `UpdateDepartmentInput`:**
- Fields: `Code*`, `Name*`, `Description*`, `ParentID*`, `ManagerEmployeeID*`, `IsActive*`, `ClearParentID bool`
- All fields are optional (pointer-based partial update pattern)
- Code: trims, empty check, uniqueness check if changed
- Name: trims, empty check
- Description: trims
- Parent changes: `ClearParentID` sets parent to nil; otherwise if `ParentID` provided:
  1. Self-reference check (`parentID == deptID` -> circular)
  2. Parent existence + same-tenant check
  3. **Deep circular reference check** via `checkCircularReference()`

**Circular Reference Detection Algorithm (`checkCircularReference`):**
```
Input: deptID (the department being updated), parentID (proposed new parent)
1. Initialize visited set with deptID
2. Set current = parentID
3. Loop:
   a. If current is in visited -> CIRCULAR REFERENCE ERROR
   b. Add current to visited
   c. Fetch parent record for current
   d. If fetch fails (not found) -> break (end of chain, safe)
   e. If parent.ParentID is nil -> break (reached root, safe)
   f. Set current = parent.ParentID
4. Return nil (no circular reference)
```

**Delete:**
- Verify department exists
- Check for children via `GetChildren(id)` -- if any exist, return `ErrCannotDeleteWithChildren`
- Hard delete

**List / ListActive:**
- `List(tenantID)` -- all departments for tenant
- `ListActive(tenantID)` -- only `is_active = true`

**GetHierarchy (Tree Query):**
- Fetches all departments for tenant (ordered `parent_id NULLS FIRST, name ASC`)
- Calls `buildTree()` to construct tree

**Tree Building Algorithm (`buildTree`):**
```
Input: flat list of departments
1. Build nodeMap: map[UUID]*DepartmentNode (each with empty Children slice)
2. Iterate departments:
   a. If ParentID is nil -> add to roots
   b. Else if parent exists in nodeMap -> append node to parent.Children
3. Update roots: re-sync roots[i].Children from nodeMap (because nodes were copied by value)
4. Return roots
```

**DepartmentNode structure:**
```go
type DepartmentNode struct {
    Department model.Department `json:"department"`
    Children   []DepartmentNode `json:"children,omitempty"`
}
```

### 1.2 Department Handler (`apps/api/internal/handler/department.go` -- 275 lines)

**List -- `GET /departments`:**
- Query params: `active` (string "true"), `parent_id` (UUID string)
- If `active=true` -> calls `ListActive`; else calls `List`
- If `parent_id` provided -> post-filters results client-side (only departments with matching ParentID)
- Response: `{ "data": [...departments] }`

**Get -- `GET /departments/{id}`:**
- Path param: `id` (UUID)
- Returns single department

**Create -- `POST /departments`:**
- Uses `models.CreateDepartmentRequest` (OpenAPI generated)
- Calls `req.Validate(nil)` for generated validation
- Maps: `*req.Code`, `*req.Name`, `req.Description`, optional `req.ParentID`, optional `req.ManagerID`
- Error mapping: code required -> 400, name required -> 400, code exists -> 400, parent not found -> 400
- Returns 201 with created department

**Update -- `PATCH /departments/{id}`:**
- Uses `models.UpdateDepartmentRequest` (OpenAPI generated)
- Only sets fields if non-empty string
- `IsActive` always set from request (known limitation with bool zero value)
- Error mapping: not found -> 404, code/name required -> 400, code exists -> 400, circular -> 400, parent not found -> 400

**Delete -- `DELETE /departments/{id}`:**
- Returns 204 on success
- Error mapping: not found -> 404, has children -> 400

**GetTree -- `GET /departments/tree`:**
- Returns hierarchy as array of DepartmentNode

### 1.3 Department Repository (`apps/api/internal/repository/department.go` -- 176 lines)

**Key queries:**
- `Create`: SELECT specific fields (TenantID, ParentID, Code, Name, Description, ManagerEmployeeID, IsActive)
- `GetByID`: `First(&dept, "id = ?", id)`
- `GetByCode`: `WHERE tenant_id = ? AND code = ?`
- `Update`: `Save(dept)` (full record save)
- `Delete`: `Delete(&Department{}, "id = ?", id)` -- checks RowsAffected for not-found
- `List`: `WHERE tenant_id = ?` ORDER BY `code ASC`
- `ListActive`: `WHERE tenant_id = ? AND is_active = ?` ORDER BY `code ASC`
- `GetChildren`: `WHERE parent_id = ?` ORDER BY `code ASC`
- `GetRoots`: `WHERE tenant_id = ? AND parent_id IS NULL` ORDER BY `code ASC`
- `GetHierarchy`: `WHERE tenant_id = ?` ORDER BY `parent_id NULLS FIRST, name ASC`
- `Upsert`: `Where("id = ?").Assign(dept).FirstOrCreate(dept)` (dev seeding only)

### 1.4 Team Service (`apps/api/internal/service/team.go` -- 290 lines)

**Error Constants:**
```go
ErrTeamNotFound     = errors.New("team not found")
ErrTeamNameRequired = errors.New("team name is required")
ErrTeamNameExists   = errors.New("team name already exists")
ErrMemberNotFound   = errors.New("team member not found")
ErrMemberExists     = errors.New("employee is already a team member")
ErrInvalidRole      = errors.New("invalid team member role")
```

**Create -- `CreateTeamInput`:**
- Fields: `TenantID`, `Name`, `Description`, `DepartmentID` (optional), `LeaderEmployeeID` (optional)
- Validation: Name required (trimmed, empty check)
- Uniqueness: `GetByName(tenantID, name)` -- returns error if exists
- Defaults: `IsActive = true`

**Update -- `UpdateTeamInput`:**
- Fields: `Name*`, `Description*`, `DepartmentID*`, `LeaderEmployeeID*`, `IsActive*`, `ClearDepartment bool`, `ClearLeader bool`
- Name: trims, empty check, uniqueness check if changed
- Description: trims
- `ClearDepartment` sets DepartmentID to nil; else if provided, sets it
- `ClearLeader` sets LeaderEmployeeID to nil; else if provided, sets it

**Delete:**
- Verify team exists, then hard delete
- No check for existing members (unlike departments which check for children)

**List / ListActive / ListByDepartment:**
- `List(tenantID)`, `ListActive(tenantID)`, `ListByDepartment(departmentID)`

**Member Management:**

`ValidateTeamMemberRole(role string)`:
- Valid roles: `"member"`, `"lead"`, `"deputy"`
- Returns typed `model.TeamMemberRole` or `ErrInvalidRole`

`AddMember(teamID, employeeID, role)`:
- Verify team exists
- Check member not already in team (`GetMember`) -> `ErrMemberExists`
- Add member, then return the created member

`RemoveMember(teamID, employeeID)`:
- Verify team exists
- Remove member -> `ErrMemberNotFound` if not found

`UpdateMemberRole(teamID, employeeID, role)`:
- Verify team exists
- Update role -> `ErrMemberNotFound` if not found
- Return updated member

`GetMembers(teamID)`:
- Verify team exists -> `ErrTeamNotFound`
- Return all members

`GetMemberTeams(employeeID)`:
- Return all teams for an employee

### 1.5 Team Handler (`apps/api/internal/handler/team.go` -- 450 lines)

**List -- `GET /teams`:**
- Query params: `is_active` (string "true"), `department_id` (UUID string)
- Priority: `department_id` > `is_active` > all (they are mutually exclusive in the handler)
- Response: `{ "items": [...teams], "next_cursor": "" }`

**Get -- `GET /teams/{id}`:**
- Query params: `include_members` (string "true")
- If include_members: uses `GetWithMembers`; else `GetByID`

**Create -- `POST /teams`:**
- Uses `models.CreateTeamRequest` (OpenAPI generated)
- Maps: `*req.Name`, `req.Description`, optional `req.DepartmentID`, optional `req.LeaderEmployeeID`
- Returns 201

**Update -- `PUT /teams/{id}`:**
- Uses `models.UpdateTeamRequest`
- Only sets fields if non-empty string
- `IsActive` always set from request

**Delete -- `DELETE /teams/{id}`:**
- Returns 204 on success

**GetMembers -- `GET /teams/{id}/members`:**
- Response: `{ "items": [...members] }`

**AddMember -- `POST /teams/{id}/members`:**
- Uses `models.AddTeamMemberRequest`
- Default role: `"member"` if not specified
- Validates role via `ValidateTeamMemberRole`
- Error mapping: team not found -> 404, member exists -> 409
- Returns 201 with created TeamMember

**RemoveMember -- `DELETE /teams/{id}/members/{employee_id}`:**
- Path params: `id`, `employee_id`
- Returns 204

**UpdateMemberRole -- `PUT /teams/{id}/members/{employee_id}`:**
- Uses `models.UpdateTeamMemberRequest`
- Returns updated TeamMember

**GetEmployeeTeams -- `GET /employees/{employee_id}/teams`:**
- Response: `{ "items": [...teams] }`

### 1.6 Team Repository (`apps/api/internal/repository/team.go` -- 300 lines)

**Key queries:**
- `Create`: SELECT specific fields (TenantID, DepartmentID, Name, Description, LeaderEmployeeID, IsActive)
- `GetByName`: `WHERE tenant_id = ? AND name = ?`
- `List`: Preloads `Department`, `Leader`; `WHERE tenant_id = ?` ORDER BY `name ASC`; then `populateMemberCounts`
- `ListActive`: Same as List but with `AND is_active = ?`; then `populateMemberCounts`
- `ListByDepartment`: Preloads `Department`, `Leader`; `WHERE department_id = ?`; then `populateMemberCounts`
- `GetWithMembers`: Preloads `Department`, `Leader`, `Members`, `Members.Employee`, `Members.Employee.Department`

**`populateMemberCounts` pattern:**
1. Collect all team IDs
2. Single query: `SELECT team_id, COUNT(*) FROM team_members WHERE team_id IN ? GROUP BY team_id`
3. Build lookup map, populate `team.MemberCount` field

**Member operations:**
- `AddMember`: Creates TeamMember with teamID, employeeID, role
- `RemoveMember`: Deletes by `team_id = ? AND employee_id = ?`, checks RowsAffected
- `GetMember`: `WHERE team_id = ? AND employee_id = ?`
- `UpdateMemberRole`: Updates `role` field, checks RowsAffected
- `GetMemberTeams`: JOIN query `teams JOIN team_members ON team_members.team_id = teams.id WHERE team_members.employee_id = ?`
- `GetMembers`: `WHERE team_id = ?` ORDER BY `joined_at ASC`

---

## 2. tRPC Patterns (from ZMI-TICKET-210)

### 2.1 File Structure

```
apps/web/src/server/
  trpc.ts                    -- tRPC init, context, procedure types
  root.ts                    -- appRouter merging all sub-routers
  index.ts                   -- barrel exports
  middleware/
    authorization.ts         -- requirePermission, requireSelfOrPermission, etc.
  lib/
    permission-catalog.ts    -- ALL_PERMISSIONS, permissionIdByKey(), lookupPermission()
    permissions.ts           -- hasPermission, hasAnyPermission, isUserAdmin, resolvePermissions
  routers/
    health.ts
    auth.ts
    permissions.ts
    tenants.ts               -- CRUD for tenants
    users.ts                 -- CRUD for users
    userGroups.ts            -- CRUD for user groups
  __tests__/
    helpers.ts               -- createMockUser, createMockContext, etc.
    procedures.test.ts
    ...
```

### 2.2 Procedure Types

- **`publicProcedure`** -- No auth required.
- **`protectedProcedure`** -- Requires valid Supabase session + resolved user. Throws `UNAUTHORIZED`.
- **`tenantProcedure`** -- Extends protectedProcedure. Requires `X-Tenant-ID` header. Validates user has access to tenant via `userTenants`. Throws `FORBIDDEN`.

### 2.3 Permission Middleware Usage

```ts
import { permissionIdByKey } from "../lib/permission-catalog"
import { requirePermission } from "../middleware/authorization"

const DEPARTMENTS_MANAGE = permissionIdByKey("departments.manage")!
const TEAMS_MANAGE = permissionIdByKey("teams.manage")!
```

Usage on procedures:
```ts
tenantProcedure
  .use(requirePermission(DEPARTMENTS_MANAGE))
  .input(...)
  .output(...)
  .query(async ({ ctx, input }) => { ... })
```

### 2.4 Router Registration Pattern

In `apps/web/src/server/root.ts`:
```ts
import { departmentsRouter } from "./routers/departments"
import { teamsRouter } from "./routers/teams"

export const appRouter = createTRPCRouter({
  // ... existing routers
  departments: departmentsRouter,
  teams: teamsRouter,
})
```

### 2.5 Common Router Patterns (from tenants.ts, users.ts, userGroups.ts)

**Schema definition pattern:**
```ts
// Output schema
const departmentOutputSchema = z.object({ ... })

// Input schemas
const createDepartmentInputSchema = z.object({ ... })
const updateDepartmentInputSchema = z.object({ ... })
```

**Query with filtering:**
```ts
list: tenantProcedure
  .use(requirePermission(PERM_ID))
  .input(z.object({ ... }).optional())
  .output(z.object({ data: z.array(outputSchema) }))
  .query(async ({ ctx, input }) => {
    // Build where clause using ctx.tenantId
    // Use ctx.prisma for queries
    // Map results to output shape
  }),
```

**Mutation with validation:**
```ts
create: tenantProcedure
  .use(requirePermission(PERM_ID))
  .input(createInputSchema)
  .output(outputSchema)
  .mutation(async ({ ctx, input }) => {
    // Normalize/trim inputs
    // Uniqueness checks via prisma.findFirst/findUnique
    // Create via prisma.create
    // Return mapped output
  }),
```

**Error throwing pattern:**
```ts
throw new TRPCError({
  code: "NOT_FOUND",    // or "BAD_REQUEST", "CONFLICT", "FORBIDDEN"
  message: "Department not found",
})
```

**TRPCError codes used:**
- `"UNAUTHORIZED"` -- No auth
- `"FORBIDDEN"` -- No permission or tenant access denied
- `"NOT_FOUND"` -- Resource not found
- `"BAD_REQUEST"` -- Validation errors
- `"CONFLICT"` -- Uniqueness violations
- `"INTERNAL_SERVER_ERROR"` -- Unexpected errors

**Partial update pattern (from users.ts, tenants.ts):**
```ts
// Build update data with only provided fields
const data: Record<string, unknown> = {}
if (input.name !== undefined) {
  const name = input.name.trim()
  if (name.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "..." })
  data.name = name
}
// ... more fields
await ctx.prisma.model.update({ where: { id: input.id }, data })
```

**Delete pattern:**
```ts
delete: tenantProcedure
  .use(requirePermission(PERM_ID))
  .input(z.object({ id: z.string().uuid() }))
  .output(z.object({ success: z.boolean() }))
  .mutation(async ({ ctx, input }) => {
    // Verify exists
    // Delete
    return { success: true }
  }),
```

### 2.6 Context Available in Procedures

After `tenantProcedure`:
- `ctx.prisma` -- PrismaClient
- `ctx.user` -- ContextUser (non-null, includes userGroup, userTenants)
- `ctx.session` -- Session (non-null)
- `ctx.tenantId` -- string (non-null)
- `ctx.authToken` -- string (non-null)

---

## 3. Database Schema (Prisma)

### 3.1 Department Model

```prisma
model Department {
  id                String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String       @map("tenant_id") @db.Uuid
  parentId          String?      @map("parent_id") @db.Uuid
  code              String       @db.VarChar(50)
  name              String       @db.VarChar(255)
  description       String?      @db.Text
  managerEmployeeId String?      @map("manager_employee_id") @db.Uuid
  isActive          Boolean      @default(true) @map("is_active")
  createdAt         DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime     @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant    Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  parent    Department?  @relation("DepartmentTree", fields: [parentId], references: [id], onDelete: SetNull)
  children  Department[] @relation("DepartmentTree")
  manager   Employee?    @relation("DepartmentManager", fields: [managerEmployeeId], references: [id], onDelete: SetNull)
  employees Employee[]   @relation("EmployeeDepartment")
  teams     Team[]

  // Indexes
  @@unique([tenantId, code], map: "departments_tenant_id_code_key")
  @@index([tenantId], map: "idx_departments_tenant")
  @@index([parentId], map: "idx_departments_parent")
  @@index([tenantId, isActive], map: "idx_departments_active")
  @@map("departments")
}
```

**Key constraints:**
- `tenantId + code` is unique (DB-level constraint)
- `parentId` references self (`DepartmentTree` relation)
- `managerEmployeeId` references `employees.id` with `ON DELETE SET NULL`

### 3.2 Team Model

```prisma
model Team {
  id               String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId         String       @map("tenant_id") @db.Uuid
  departmentId     String?      @map("department_id") @db.Uuid
  name             String       @db.VarChar(255)
  description      String?      @db.Text
  leaderEmployeeId String?      @map("leader_employee_id") @db.Uuid
  isActive         Boolean      @default(true) @map("is_active")
  createdAt        DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime     @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant     Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  department Department?  @relation(fields: [departmentId], references: [id], onDelete: SetNull)
  leader     Employee?    @relation("TeamLeader", fields: [leaderEmployeeId], references: [id], onDelete: SetNull)
  members    TeamMember[]

  // Indexes
  @@unique([tenantId, name], map: "teams_tenant_id_name_key")
  @@index([tenantId], map: "idx_teams_tenant")
  @@index([departmentId], map: "idx_teams_department")
  @@map("teams")
}
```

**Key constraints:**
- `tenantId + name` is unique (DB-level constraint)
- `departmentId` references departments with `ON DELETE SET NULL`
- `leaderEmployeeId` references employees with `ON DELETE SET NULL`

### 3.3 TeamMember Model

```prisma
model TeamMember {
  teamId     String   @map("team_id") @db.Uuid
  employeeId String   @map("employee_id") @db.Uuid
  joinedAt   DateTime @default(now()) @map("joined_at") @db.Timestamptz(6)
  role       String   @default("member") @db.VarChar(50)

  // Relations
  team     Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  // Composite primary key
  @@id([teamId, employeeId])
  @@index([employeeId], map: "idx_team_members_employee")
  @@map("team_members")
}
```

**Key constraints:**
- Composite PK: `(teamId, employeeId)` -- no surrogate ID
- Role values: `"member"` (default), `"lead"`, `"deputy"`
- Both FKs cascade on delete

### 3.4 Related Models

**Employee** (relevant fields for relations):
- `id`, `tenantId`, `firstName`, `lastName`, `departmentId`
- Has reverse relations: `managedDepartments`, `ledTeams`, `teamMemberships`

---

## 4. Frontend Hooks (Being Migrated)

### 4.1 Department Hooks (`apps/web/src/hooks/api/use-departments.ts`)

Uses `useApiQuery` / `useApiMutation` (openapi-fetch based, hitting Go backend).

**Queries:**
| Hook | Go Endpoint | Params |
|------|------------|--------|
| `useDepartments(options)` | `GET /departments` | `active`, `parent_id` |
| `useDepartment(id)` | `GET /departments/{id}` | path: `id` |
| `useDepartmentTree()` | `GET /departments/tree` | none |

**Mutations:**
| Hook | Go Endpoint | Invalidates |
|------|------------|------------|
| `useCreateDepartment()` | `POST /departments` | `/departments`, `/departments/tree` |
| `useUpdateDepartment()` | `PATCH /departments/{id}` | `/departments`, `/departments/tree` |
| `useDeleteDepartment()` | `DELETE /departments/{id}` | `/departments`, `/departments/tree` |

### 4.2 Team Hooks (`apps/web/src/hooks/api/use-teams.ts`)

**Queries:**
| Hook | Go Endpoint | Params |
|------|------------|--------|
| `useTeams(options)` | `GET /teams` | `limit`, `cursor`, `department_id`, `is_active` |
| `useTeam(id)` | `GET /teams/{id}` | `include_members: true` |
| `useTeamMembers(teamId)` | `GET /teams/{id}/members` | path: `id` |

**Mutations:**
| Hook | Go Endpoint | Invalidates |
|------|------------|------------|
| `useCreateTeam()` | `POST /teams` | `/teams` |
| `useUpdateTeam()` | `PUT /teams/{id}` | `/teams` |
| `useDeleteTeam()` | `DELETE /teams/{id}` | `/teams` |
| `useAddTeamMember()` | `POST /teams/{id}/members` | `/teams`, `/teams/{id}` |
| `useUpdateTeamMember()` | `PUT /teams/{id}/members/{employee_id}` | `/teams`, `/teams/{id}` |
| `useRemoveTeamMember()` | `DELETE /teams/{id}/members/{employee_id}` | `/teams`, `/teams/{id}` |

---

## 5. Key Implementation Details

### 5.1 Permission Strings

From `apps/web/src/server/lib/permission-catalog.ts`:
```ts
p("departments.manage", "departments", "manage", "Manage departments")   // line 103
p("teams.manage", "teams", "manage", "Manage teams")                     // line 104
```

Usage:
```ts
const DEPARTMENTS_MANAGE = permissionIdByKey("departments.manage")!
const TEAMS_MANAGE = permissionIdByKey("teams.manage")!
```

Go routes apply `departments.manage` to ALL department operations (list, create, get, update, delete, tree).
Go routes apply `teams.manage` to ALL team operations (list, create, get, update, delete, members CRUD, employee teams).

### 5.2 Department-Specific Edge Cases

1. **Code uniqueness is per-tenant** (DB constraint: `@@unique([tenantId, code])`)
2. **Circular reference detection** must walk up the parent chain. In Prisma this means repeated `findUnique` calls or a recursive approach.
3. **Cannot delete departments with children** -- must check `children` relation first
4. **Parent must be same tenant** -- critical security check
5. **Tree building** is done in application code, not via recursive SQL. The Go approach fetches all departments flat and builds the tree in memory.
6. **List with `parent_id` filter** -- Go does post-filtering in handler (fetches all, then filters). In tRPC this can be done with a Prisma `where` clause directly.
7. **Description field** is nullable in Prisma (String?) but non-nullable in Go model (empty string). The tRPC router should use `z.string().nullable()`.

### 5.3 Team-Specific Edge Cases

1. **Name uniqueness is per-tenant** (DB constraint: `@@unique([tenantId, name])`)
2. **No delete restriction** -- teams can be deleted even with existing members (CASCADE on team_members FK)
3. **MemberCount** is a computed field (not stored). Go calculates it via a separate GROUP BY query. In Prisma, use `_count: { select: { members: true } }`.
4. **Team list preloads** Department and Leader relations, plus member counts
5. **GetWithMembers** preloads deeply: `Members -> Employee -> Department`
6. **AddMember** defaults role to `"member"` if not specified
7. **Valid roles**: `"member"`, `"lead"`, `"deputy"` -- validated via enum
8. **GetMembers** orders by `joined_at ASC`
9. **GetMemberTeams** (employee's teams) is exposed at `GET /employees/{employee_id}/teams` in Go

### 5.4 Go Route -> tRPC Procedure Mapping

**Departments:**
| Go Route | tRPC Procedure | Type |
|----------|---------------|------|
| `GET /departments` | `departments.list` | query |
| `GET /departments/tree` | `departments.getTree` | query |
| `GET /departments/{id}` | `departments.getById` | query |
| `POST /departments` | `departments.create` | mutation |
| `PATCH /departments/{id}` | `departments.update` | mutation |
| `DELETE /departments/{id}` | `departments.delete` | mutation |

**Teams:**
| Go Route | tRPC Procedure | Type |
|----------|---------------|------|
| `GET /teams` | `teams.list` | query |
| `GET /teams/{id}` | `teams.getById` | query |
| `POST /teams` | `teams.create` | mutation |
| `PUT /teams/{id}` | `teams.update` | mutation |
| `DELETE /teams/{id}` | `teams.delete` | mutation |
| `GET /teams/{id}/members` | `teams.getMembers` | query |
| `POST /teams/{id}/members` | `teams.addMember` | mutation |
| `PUT /teams/{id}/members/{eid}` | `teams.updateMemberRole` | mutation |
| `DELETE /teams/{id}/members/{eid}` | `teams.removeMember` | mutation |
| `GET /employees/{eid}/teams` | `teams.getByEmployee` | query |

### 5.5 Output Schema Shapes

**Department output** (based on Go model + Prisma):
```ts
{
  id: string           // uuid
  tenantId: string     // uuid
  parentId: string | null
  code: string
  name: string
  description: string | null
  managerEmployeeId: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
```

**Department tree node:**
```ts
{
  department: DepartmentOutput
  children: DepartmentTreeNode[]
}
```

**Team output** (based on Go model + Prisma):
```ts
{
  id: string
  tenantId: string
  departmentId: string | null
  name: string
  description: string | null
  leaderEmployeeId: string | null
  isActive: boolean
  memberCount: number         // computed
  createdAt: Date
  updatedAt: Date
  department?: { id, name, code } | null    // when included
  leader?: { id, firstName, lastName } | null  // when included
}
```

**TeamMember output:**
```ts
{
  teamId: string
  employeeId: string
  role: "member" | "lead" | "deputy"
  joinedAt: Date
  employee?: { id, firstName, lastName, ... }  // when included
}
```

### 5.6 Files to Create

1. `apps/web/src/server/routers/departments.ts` -- Department tRPC router
2. `apps/web/src/server/routers/teams.ts` -- Team tRPC router

### 5.7 Files to Modify

1. `apps/web/src/server/root.ts` -- Register new routers in appRouter
2. `apps/web/src/hooks/api/use-departments.ts` -- Migrate to tRPC hooks
3. `apps/web/src/hooks/api/use-teams.ts` -- Migrate to tRPC hooks
