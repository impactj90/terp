# Implementation Plan: ZMI-TICKET-211 - Departments + Teams tRPC Routers

## Overview

This ticket implements tRPC routers for Departments (with tree hierarchy) and Teams (with member management), replacing the corresponding Go backend services. It also migrates the existing frontend hooks from the openapi-fetch pattern (`useApiQuery`/`useApiMutation`) to tRPC hooks (`useTRPC`).

**Files created:** 2 new router files, 2 new test files
**Files modified:** 3 existing files (root.ts, use-departments.ts, use-teams.ts)

### Permission Constants

Both routers use `departments.manage` and `teams.manage` from the permission catalog:
```ts
const DEPARTMENTS_MANAGE = permissionIdByKey("departments.manage")!
const TEAMS_MANAGE = permissionIdByKey("teams.manage")!
```

These already exist in `apps/web/src/server/lib/permission-catalog.ts` at lines 103-104.

---

## Phase 1: Departments tRPC Router

### Files

| Action | Path |
|--------|------|
| **Create** | `apps/web/src/server/routers/departments.ts` |
| **Modify** | `apps/web/src/server/root.ts` |

### Implementation Details

#### 1.1 Output Schemas

```ts
const departmentOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  managerEmployeeId: z.string().uuid().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// Recursive type for tree nodes (use z.lazy for recursive schema)
const departmentTreeNodeSchema: z.ZodType<DepartmentTreeNode> = z.object({
  department: departmentOutputSchema,
  children: z.lazy(() => z.array(departmentTreeNodeSchema)),
})

// Type definition needed for z.lazy:
type DepartmentTreeNode = {
  department: z.infer<typeof departmentOutputSchema>
  children: DepartmentTreeNode[]
}
```

#### 1.2 Input Schemas

```ts
const createDepartmentInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  parentId: z.string().uuid().optional(),
  managerEmployeeId: z.string().uuid().optional(),
})

const updateDepartmentInputSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),  // null = clear parent
  managerEmployeeId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
})
```

#### 1.3 Helper: `mapDepartmentToOutput`

Maps a Prisma Department record to the output schema shape. Follow the pattern from `mapUserToOutput` in `users.ts`.

#### 1.4 Helper: `buildDepartmentTree`

Port the Go `buildTree` algorithm. This is the critical algorithm:

```ts
function buildDepartmentTree(
  departments: DepartmentOutput[]
): DepartmentTreeNode[] {
  // 1. Build a map of id -> node (each with empty children array)
  const nodeMap = new Map<string, DepartmentTreeNode>()
  for (const dept of departments) {
    nodeMap.set(dept.id, { department: dept, children: [] })
  }

  // 2. Build tree structure
  const roots: DepartmentTreeNode[] = []
  for (const dept of departments) {
    const node = nodeMap.get(dept.id)!
    if (dept.parentId === null) {
      roots.push(node)
    } else {
      const parent = nodeMap.get(dept.parentId)
      if (parent) {
        parent.children.push(node)
      }
      // If parent not found in map, treat as orphan (skip)
    }
  }

  return roots
}
```

**Key difference from Go:** In TypeScript, objects are references, so no need for the Go workaround of re-syncing root children from nodeMap.

#### 1.5 Helper: `checkCircularReference`

Port the Go circular reference detection. This requires repeated Prisma lookups:

```ts
async function checkCircularReference(
  prisma: PrismaClient,
  deptId: string,
  proposedParentId: string
): Promise<boolean> {
  const visited = new Set<string>([deptId])
  let current: string | null = proposedParentId

  while (current !== null) {
    if (visited.has(current)) return true  // circular!
    visited.add(current)

    const parent = await prisma.department.findUnique({
      where: { id: current },
      select: { parentId: true },
    })
    if (!parent) break  // end of chain
    current = parent.parentId
  }

  return false  // no circular reference
}
```

#### 1.6 Procedures

**`departments.list`** (query):
- Uses `tenantProcedure` + `requirePermission(DEPARTMENTS_MANAGE)`
- Input (optional): `{ isActive?: boolean, parentId?: string }`
- Builds `where` clause with `tenantId` from context
- If `isActive` provided, adds to where clause
- If `parentId` provided, adds to where clause (improvement over Go which post-filters)
- Orders by `code ASC`
- Output: `{ data: Department[] }`

**`departments.getTree`** (query):
- Uses `tenantProcedure` + `requirePermission(DEPARTMENTS_MANAGE)`
- No input
- Fetches all departments for tenant, ordered by `parentId NULLS FIRST, name ASC`
- Maps results, then calls `buildDepartmentTree()`
- Output: `DepartmentTreeNode[]`

**`departments.getById`** (query):
- Uses `tenantProcedure` + `requirePermission(DEPARTMENTS_MANAGE)`
- Input: `{ id: string }`
- `findFirst` with `{ id, tenantId }` (tenant-scoped)
- Throws `NOT_FOUND` if missing
- Output: `Department`

**`departments.create`** (mutation):
- Uses `tenantProcedure` + `requirePermission(DEPARTMENTS_MANAGE)`
- Input: `createDepartmentInputSchema`
- Business logic (ported from Go `department.go` Create):
  1. Trim `code` and `name`; validate non-empty after trim
  2. Check code uniqueness: `findFirst({ tenantId, code })` -> `CONFLICT` if exists
  3. If `parentId` provided: verify parent exists and belongs to same tenant -> `BAD_REQUEST` ("Parent department not found") if not
  4. Create with `isActive: true` default
  5. Map and return created department

**`departments.update`** (mutation):
- Uses `tenantProcedure` + `requirePermission(DEPARTMENTS_MANAGE)`
- Input: `updateDepartmentInputSchema`
- Business logic (ported from Go `department.go` Update):
  1. Verify department exists (tenant-scoped) -> `NOT_FOUND`
  2. Build partial update `data` object
  3. If `code` provided: trim, validate non-empty, check uniqueness if changed (exclude self) -> `CONFLICT`
  4. If `name` provided: trim, validate non-empty -> `BAD_REQUEST`
  5. If `description` provided: trim, set (allow null)
  6. If `parentId` is explicitly `null`: clear parent (set to null)
  7. If `parentId` is a string UUID:
     a. Self-reference check (`parentId === id`) -> `BAD_REQUEST` ("Circular reference detected")
     b. Parent existence + same-tenant check -> `BAD_REQUEST` ("Parent department not found")
     c. Deep circular reference check via `checkCircularReference()` -> `BAD_REQUEST` ("Circular reference detected")
  8. If `managerEmployeeId` provided: set (allow null to clear)
  9. If `isActive` provided: set
  10. `prisma.department.update({ where: { id }, data })`
  11. Return updated department

**`departments.delete`** (mutation):
- Uses `tenantProcedure` + `requirePermission(DEPARTMENTS_MANAGE)`
- Input: `{ id: string }`
- Business logic (ported from Go `department.go` Delete):
  1. Verify department exists (tenant-scoped) -> `NOT_FOUND`
  2. Check for children: `prisma.department.count({ where: { parentId: id } })` -> if > 0, `BAD_REQUEST` ("Cannot delete department with child departments")
  3. Check for employees: `prisma.employee.count({ where: { departmentId: id } })` -> if > 0, `BAD_REQUEST` ("Cannot delete department with assigned employees")
  4. Hard delete
  5. Return `{ success: true }`

#### 1.7 Register in App Router

In `apps/web/src/server/root.ts`, add:
```ts
import { departmentsRouter } from "./routers/departments"

export const appRouter = createTRPCRouter({
  // ... existing
  departments: departmentsRouter,
})
```

### Verification

1. TypeScript compilation: `cd apps/web && npx tsc --noEmit`
2. Run existing tests to verify no regressions: `cd apps/web && npx vitest run src/server/__tests__/`
3. Manual verification: The router exports correctly from root.ts and type inference works

---

## Phase 2: Teams tRPC Router

### Files

| Action | Path |
|--------|------|
| **Create** | `apps/web/src/server/routers/teams.ts` |
| **Modify** | `apps/web/src/server/root.ts` |

### Implementation Details

#### 2.1 Output Schemas

```ts
const teamMemberRoleEnum = z.enum(["member", "lead", "deputy"])

const teamOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  departmentId: z.string().uuid().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  leaderEmployeeId: z.string().uuid().nullable(),
  isActive: z.boolean(),
  memberCount: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
  department: z.object({
    id: z.string().uuid(),
    name: z.string(),
    code: z.string(),
  }).nullable().optional(),
  leader: z.object({
    id: z.string().uuid(),
    firstName: z.string(),
    lastName: z.string(),
  }).nullable().optional(),
})

const teamMemberOutputSchema = z.object({
  teamId: z.string().uuid(),
  employeeId: z.string().uuid(),
  role: teamMemberRoleEnum,
  joinedAt: z.date(),
  employee: z.object({
    id: z.string().uuid(),
    firstName: z.string(),
    lastName: z.string(),
  }).optional(),
})
```

#### 2.2 Input Schemas

```ts
const createTeamInputSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  departmentId: z.string().uuid().optional(),
  leaderEmployeeId: z.string().uuid().optional(),
})

const updateTeamInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),  // null = clear
  leaderEmployeeId: z.string().uuid().nullable().optional(),  // null = clear
  isActive: z.boolean().optional(),
})

const listTeamsInputSchema = z.object({
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(20),
  search: z.string().optional(),
  isActive: z.boolean().optional(),
  departmentId: z.string().uuid().optional(),
}).optional()

const addMemberInputSchema = z.object({
  teamId: z.string().uuid(),
  employeeId: z.string().uuid(),
  role: teamMemberRoleEnum.optional().default("member"),
})

const updateMemberInputSchema = z.object({
  teamId: z.string().uuid(),
  employeeId: z.string().uuid(),
  role: teamMemberRoleEnum,
})

const removeMemberInputSchema = z.object({
  teamId: z.string().uuid(),
  employeeId: z.string().uuid(),
})
```

#### 2.3 Procedures

**`teams.list`** (query):
- Uses `tenantProcedure` + `requirePermission(TEAMS_MANAGE)`
- Input: `listTeamsInputSchema`
- Build `where`: always scoped to `tenantId`
  - If `isActive` provided: add to where
  - If `departmentId` provided: add to where
  - If `search` provided: add name `contains` (case insensitive)
- Pagination: offset-based (`skip: (page - 1) * pageSize`, `take: pageSize`)
- Include `department` and `leader` relations
- Compute `memberCount` using Prisma `_count`: `include: { _count: { select: { members: true } } }`
- Also run `prisma.team.count({ where })` for `total`
- Order by `name ASC`
- Output: `{ items: Team[], total: number }`
- Map results: set `memberCount` from `team._count.members`

**`teams.getById`** (query):
- Uses `tenantProcedure` + `requirePermission(TEAMS_MANAGE)`
- Input: `{ id: string, includeMembers?: boolean }`
- `findFirst` with `{ id, tenantId }`
- Include `department`, `leader`, `_count: { select: { members: true } }`
- If `includeMembers`: also include `members: { include: { employee: true }, orderBy: { joinedAt: 'asc' } }`
- Throws `NOT_FOUND` if missing
- Output: team with optional members array

**`teams.create`** (mutation):
- Uses `tenantProcedure` + `requirePermission(TEAMS_MANAGE)`
- Input: `createTeamInputSchema`
- Business logic:
  1. Trim name, validate non-empty after trim
  2. Check name uniqueness: `findFirst({ tenantId, name })` -> `CONFLICT`
  3. Trim description if provided
  4. Create with `isActive: true` default
  5. Return created team (with `memberCount: 0`)

**`teams.update`** (mutation):
- Uses `tenantProcedure` + `requirePermission(TEAMS_MANAGE)`
- Input: `updateTeamInputSchema`
- Business logic:
  1. Verify team exists (tenant-scoped) -> `NOT_FOUND`
  2. Build partial update `data` object
  3. If `name` provided: trim, validate non-empty, check uniqueness if changed (exclude self) -> `CONFLICT`
  4. If `description` provided: trim (allow null to clear)
  5. If `departmentId` is explicitly `null`: clear department
  6. If `departmentId` is a UUID: set it
  7. If `leaderEmployeeId` is explicitly `null`: clear leader
  8. If `leaderEmployeeId` is a UUID: set it
  9. If `isActive` provided: set
  10. Update and return

**`teams.delete`** (mutation):
- Uses `tenantProcedure` + `requirePermission(TEAMS_MANAGE)`
- Input: `{ id: string }`
- Verify team exists (tenant-scoped) -> `NOT_FOUND`
- Hard delete (members cascade via DB FK)
- Return `{ success: true }`

**`teams.getMembers`** (query):
- Uses `tenantProcedure` + `requirePermission(TEAMS_MANAGE)`
- Input: `{ teamId: string }`
- Verify team exists (tenant-scoped) -> `NOT_FOUND`
- `prisma.teamMember.findMany({ where: { teamId }, include: { employee: true }, orderBy: { joinedAt: 'asc' } })`
- Output: `{ items: TeamMember[] }`

**`teams.addMember`** (mutation):
- Uses `tenantProcedure` + `requirePermission(TEAMS_MANAGE)`
- Input: `addMemberInputSchema`
- Business logic:
  1. Verify team exists (tenant-scoped) -> `NOT_FOUND`
  2. Check if member already exists: `findUnique({ teamId_employeeId: { teamId, employeeId } })` -> `CONFLICT` ("Employee is already a team member")
  3. Create team member with role (default "member")
  4. Return created member

**`teams.updateMemberRole`** (mutation):
- Uses `tenantProcedure` + `requirePermission(TEAMS_MANAGE)`
- Input: `updateMemberInputSchema`
- Business logic:
  1. Verify team exists (tenant-scoped) -> `NOT_FOUND`
  2. Update: `prisma.teamMember.update({ where: { teamId_employeeId: ... }, data: { role } })`
  3. If update fails (record not found) -> `NOT_FOUND` ("Team member not found")
  4. Return updated member

**`teams.removeMember`** (mutation):
- Uses `tenantProcedure` + `requirePermission(TEAMS_MANAGE)`
- Input: `removeMemberInputSchema`
- Business logic:
  1. Verify team exists (tenant-scoped) -> `NOT_FOUND`
  2. Delete: `prisma.teamMember.delete({ where: { teamId_employeeId: ... } })`
  3. If delete fails (record not found) -> `NOT_FOUND` ("Team member not found")
  4. Return `{ success: true }`

**`teams.getByEmployee`** (query):
- Uses `tenantProcedure` + `requirePermission(TEAMS_MANAGE)`
- Input: `{ employeeId: string }`
- Query: `prisma.teamMember.findMany({ where: { employeeId }, include: { team: { include: { department: true, leader: true, _count: { select: { members: true } } } } } })`
- Map results to team output format
- Output: `{ items: Team[] }`

#### 2.4 Register in App Router

Add to `apps/web/src/server/root.ts`:
```ts
import { teamsRouter } from "./routers/teams"

export const appRouter = createTRPCRouter({
  // ... existing + departments from Phase 1
  teams: teamsRouter,
})
```

### Verification

1. TypeScript compilation: `cd apps/web && npx tsc --noEmit`
2. Run existing tests: `cd apps/web && npx vitest run src/server/__tests__/`
3. Verify router type exports work for client inference

---

## Phase 3: Frontend Hooks Migration

### Files

| Action | Path |
|--------|------|
| **Modify** | `apps/web/src/hooks/api/use-departments.ts` |
| **Modify** | `apps/web/src/hooks/api/use-teams.ts` |

### Implementation Details

#### 3.1 Migrate `use-departments.ts`

Replace `useApiQuery`/`useApiMutation` with `useTRPC` pattern. Follow the exact pattern from `use-tenants.ts` and `use-user-groups.ts`.

**Before pattern:**
```ts
import { useApiQuery, useApiMutation } from '@/hooks'
```

**After pattern:**
```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
```

**Hook mapping:**

| Old Hook | New Implementation |
|----------|-------------------|
| `useDepartments(options)` | `useQuery(trpc.departments.list.queryOptions({ isActive: options.active, parentId: options.parentId }, { enabled }))` |
| `useDepartment(id)` | `useQuery(trpc.departments.getById.queryOptions({ id }, { enabled: enabled && !!id }))` |
| `useDepartmentTree()` | `useQuery(trpc.departments.getTree.queryOptions(undefined, { enabled }))` |
| `useCreateDepartment()` | `useMutation({ ...trpc.departments.create.mutationOptions(), onSuccess: invalidate list + tree })` |
| `useUpdateDepartment()` | `useMutation({ ...trpc.departments.update.mutationOptions(), onSuccess: invalidate list + tree })` |
| `useDeleteDepartment()` | `useMutation({ ...trpc.departments.delete.mutationOptions(), onSuccess: invalidate list + tree })` |

**Cache invalidation for departments:** On any mutation success, invalidate both:
- `trpc.departments.list.queryKey()`
- `trpc.departments.getTree.queryKey()`

#### 3.2 Migrate `use-teams.ts`

**Hook mapping:**

| Old Hook | New Implementation |
|----------|-------------------|
| `useTeams(options)` | `useQuery(trpc.teams.list.queryOptions({ page: 1, pageSize: options.limit, departmentId: options.departmentId, isActive: options.isActive }, { enabled }))` |
| `useTeam(id)` | `useQuery(trpc.teams.getById.queryOptions({ id, includeMembers: true }, { enabled: enabled && !!id }))` |
| `useTeamMembers(teamId)` | `useQuery(trpc.teams.getMembers.queryOptions({ teamId }, { enabled: enabled && !!teamId }))` |
| `useCreateTeam()` | `useMutation({ ...trpc.teams.create.mutationOptions(), onSuccess: invalidate list })` |
| `useUpdateTeam()` | `useMutation({ ...trpc.teams.update.mutationOptions(), onSuccess: invalidate list })` |
| `useDeleteTeam()` | `useMutation({ ...trpc.teams.delete.mutationOptions(), onSuccess: invalidate list })` |
| `useAddTeamMember()` | `useMutation({ ...trpc.teams.addMember.mutationOptions(), onSuccess: invalidate list + getById })` |
| `useUpdateTeamMember()` | `useMutation({ ...trpc.teams.updateMemberRole.mutationOptions(), onSuccess: invalidate list + getById })` |
| `useRemoveTeamMember()` | `useMutation({ ...trpc.teams.removeMember.mutationOptions(), onSuccess: invalidate list + getById })` |

**Cache invalidation for teams:** On CRUD mutations, invalidate:
- `trpc.teams.list.queryKey()`

On member mutations, additionally invalidate:
- `trpc.teams.getById.queryKey()` (to refresh member data)
- `trpc.teams.getMembers.queryKey()` (to refresh member lists)

#### 3.3 Interface Changes

The `useTeams` hook interface changes slightly since the Go backend used cursor-based pagination but the tRPC router uses offset-based:

```ts
interface UseTeamsOptions {
  page?: number        // was: cursor
  pageSize?: number    // was: limit
  departmentId?: string
  isActive?: boolean
  search?: string      // new
  enabled?: boolean
}
```

Consumers accessing `data.items` and `data.next_cursor` will need to update to `data.items` and `data.total`. Verify all consumers.

### Verification

1. TypeScript compilation: `cd apps/web && npx tsc --noEmit`
2. Verify hook function signatures are backwards-compatible where possible
3. Search for all usages of the old hooks to ensure no breakage:
   - `grep -r "useDepartments\|useDepartment\|useDepartmentTree\|useCreateDepartment\|useUpdateDepartment\|useDeleteDepartment" apps/web/src/`
   - `grep -r "useTeams\|useTeam\|useTeamMembers\|useCreateTeam\|useUpdateTeam\|useDeleteTeam\|useAddTeamMember\|useUpdateTeamMember\|useRemoveTeamMember" apps/web/src/`

---

## Phase 4: Tests

### Files

| Action | Path |
|--------|------|
| **Create** | `apps/web/src/server/__tests__/departments-router.test.ts` |
| **Create** | `apps/web/src/server/__tests__/teams-router.test.ts` |

### Implementation Details

Tests use the `createCallerFactory` pattern established in `procedures.test.ts` and `authorization.test.ts`. Since we need to mock Prisma, tests use the caller pattern with a mocked prisma client in context.

#### 4.1 Test Helpers

Use helpers from `apps/web/src/server/__tests__/helpers.ts`:
- `createMockUser`, `createMockSession`, `createMockContext`
- `createUserWithPermissions`, `createAdminUser`
- `createMockUserTenant`

Create a test-specific context factory:
```ts
import { permissionIdByKey } from "../lib/permission-catalog"

const DEPARTMENTS_MANAGE = permissionIdByKey("departments.manage")!
const TEAMS_MANAGE = permissionIdByKey("teams.manage")!
const TENANT_ID = "00000000-0000-0000-0000-000000000100"

function createDeptTestContext(prisma: MockPrisma) {
  const userId = "00000000-0000-0000-0000-000000000001"
  return createMockContext({
    prisma: prisma as unknown as TRPCContext["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([DEPARTMENTS_MANAGE], {
      userTenants: [createMockUserTenant(userId, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}
```

Mock Prisma approach: Create mock objects with `vi.fn()` for each Prisma method used by the router. This follows the unit test pattern (no real DB).

#### 4.2 Department Router Tests (`departments-router.test.ts`)

Port from Go `department_test.go`. Tests organized by procedure:

**`departments.list`:**
- Returns departments for tenant
- Filters by `isActive` when provided
- Filters by `parentId` when provided
- Returns empty array when no departments
- Requires DEPARTMENTS_MANAGE permission

**`departments.getTree`:**
- Builds correct tree from flat list (port Go `TestDepartmentService_GetHierarchy`)
  - Create Engineering (root) with children Backend, Frontend
  - Create HR (root) with no children
  - Verify: 2 roots, Engineering has 2 children
- Returns empty array for empty tenant
- Requires DEPARTMENTS_MANAGE permission

**`departments.getById`:**
- Returns department when found
- Throws NOT_FOUND for missing department
- Scopes query to tenant

**`departments.create`:**
- Creates department successfully
- Trims whitespace from code, name, description
- Rejects empty code (after trim) with BAD_REQUEST
- Rejects empty name (after trim) with BAD_REQUEST
- Rejects duplicate code with CONFLICT
- Creates with parent successfully
- Rejects non-existent parent with BAD_REQUEST
- Sets isActive true by default

**`departments.update`:**
- Updates name, description, isActive
- Updates code
- Rejects empty name with BAD_REQUEST
- Rejects empty code with BAD_REQUEST
- Rejects duplicate code with CONFLICT
- Allows updating to same code (no false conflict)
- Rejects NOT_FOUND for missing department
- Rejects self-referencing parent with BAD_REQUEST
- Rejects circular chain parent with BAD_REQUEST (A->B->C, set A.parent=C)
- Rejects non-existent parent with BAD_REQUEST
- Clears parent when parentId is explicitly null

**`departments.delete`:**
- Deletes department successfully
- Throws NOT_FOUND for missing department
- Rejects deletion when department has children with BAD_REQUEST
- Rejects deletion when department has employees with BAD_REQUEST

#### 4.3 Team Router Tests (`teams-router.test.ts`)

Port from Go `team_test.go`. Tests organized by procedure:

**`teams.list`:**
- Returns teams with member counts
- Filters by isActive
- Filters by departmentId
- Returns total count for pagination
- Requires TEAMS_MANAGE permission

**`teams.getById`:**
- Returns team with relations
- Returns team with members when includeMembers=true
- Throws NOT_FOUND for missing team

**`teams.create`:**
- Creates team successfully
- Trims whitespace from name, description
- Rejects empty name with BAD_REQUEST
- Rejects duplicate name with CONFLICT
- Creates with department assignment
- Sets isActive true by default

**`teams.update`:**
- Updates name, description, isActive
- Rejects empty name with BAD_REQUEST
- Rejects duplicate name with CONFLICT
- Allows same name (no false conflict)
- Clears department when departmentId is null
- Clears leader when leaderEmployeeId is null
- Throws NOT_FOUND for missing team

**`teams.delete`:**
- Deletes team successfully
- Throws NOT_FOUND for missing team

**`teams.addMember`:**
- Adds member successfully with default role "member"
- Adds member with specified role
- Rejects duplicate member with CONFLICT
- Throws NOT_FOUND for missing team

**`teams.updateMemberRole`:**
- Updates role successfully
- Throws NOT_FOUND for missing team
- Throws NOT_FOUND for non-member employee

**`teams.removeMember`:**
- Removes member successfully
- Throws NOT_FOUND for missing team
- Throws NOT_FOUND for non-member employee

**`teams.getMembers`:**
- Returns members ordered by joinedAt
- Throws NOT_FOUND for missing team
- Returns empty array for team with no members

**`teams.getByEmployee`:**
- Returns teams for an employee
- Returns empty array for employee with no teams

#### 4.4 Tree Building Pure Function Test

Add a dedicated test for the `buildDepartmentTree` function if it is exported:

```ts
describe("buildDepartmentTree", () => {
  it("builds correct tree from flat list", () => {
    const departments = [
      makeDept({ id: "1", parentId: null, code: "ENG", name: "Engineering" }),
      makeDept({ id: "2", parentId: "1", code: "BACKEND", name: "Backend" }),
      makeDept({ id: "3", parentId: "1", code: "FRONTEND", name: "Frontend" }),
      makeDept({ id: "4", parentId: null, code: "HR", name: "HR" }),
    ]
    const tree = buildDepartmentTree(departments)
    expect(tree).toHaveLength(2)
    const eng = tree.find(n => n.department.code === "ENG")
    expect(eng?.children).toHaveLength(2)
    const hr = tree.find(n => n.department.code === "HR")
    expect(hr?.children).toHaveLength(0)
  })

  it("returns empty array for empty input", () => {
    expect(buildDepartmentTree([])).toEqual([])
  })

  it("handles orphan nodes (parent not in list)", () => {
    const departments = [
      makeDept({ id: "1", parentId: "999", code: "ORPHAN", name: "Orphan" }),
    ]
    const tree = buildDepartmentTree(departments)
    expect(tree).toHaveLength(0)  // orphan has parent not in list
  })
})
```

### Verification

1. Run all tRPC tests: `cd apps/web && npx vitest run src/server/__tests__/`
2. Run specifically the new tests:
   - `npx vitest run src/server/__tests__/departments-router.test.ts`
   - `npx vitest run src/server/__tests__/teams-router.test.ts`
3. Verify no existing test regressions
4. TypeScript compilation: `cd apps/web && npx tsc --noEmit`

---

## Success Criteria

- [ ] `departments.list` returns flat list filtered by tenant, with optional `isActive` and `parentId` filters
- [ ] `departments.getTree` returns hierarchical tree structure built in application code
- [ ] `departments.create` validates code+name required, code uniqueness per tenant, parent existence
- [ ] `departments.update` handles partial updates, circular reference detection, code uniqueness
- [ ] `departments.delete` prevents deletion when children or employees exist
- [ ] `teams.list` returns paginated list with member counts, department/leader relations
- [ ] `teams.create` validates name required, name uniqueness per tenant
- [ ] `teams.update` handles partial updates, name uniqueness, nullable fields
- [ ] `teams.delete` hard-deletes (members cascade via FK)
- [ ] `teams.addMember` validates team exists, member not already in team, valid role
- [ ] `teams.updateMemberRole` validates team exists, member exists, valid role
- [ ] `teams.removeMember` validates team exists, member exists
- [ ] `teams.getMembers` returns members ordered by joinedAt
- [ ] `teams.getByEmployee` returns all teams for an employee
- [ ] Frontend hooks in `use-departments.ts` use `useTRPC()` pattern
- [ ] Frontend hooks in `use-teams.ts` use `useTRPC()` pattern
- [ ] All new unit tests pass
- [ ] Tree-building algorithm correctly handles roots, children, empty input
- [ ] Circular reference detection works for self-reference and chain cycles
- [ ] TypeScript compiles without errors
- [ ] No regressions in existing tests

## File Summary

| # | Action | File Path | Phase |
|---|--------|-----------|-------|
| 1 | Create | `apps/web/src/server/routers/departments.ts` | 1 |
| 2 | Modify | `apps/web/src/server/root.ts` | 1+2 |
| 3 | Create | `apps/web/src/server/routers/teams.ts` | 2 |
| 4 | Modify | `apps/web/src/hooks/api/use-departments.ts` | 3 |
| 5 | Modify | `apps/web/src/hooks/api/use-teams.ts` | 3 |
| 6 | Create | `apps/web/src/server/__tests__/departments-router.test.ts` | 4 |
| 7 | Create | `apps/web/src/server/__tests__/teams-router.test.ts` | 4 |
