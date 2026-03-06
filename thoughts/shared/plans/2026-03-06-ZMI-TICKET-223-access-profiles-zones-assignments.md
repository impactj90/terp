# ZMI-TICKET-223: Access Profiles, Zones, Employee Access Assignments -- Implementation Plan

## Overview

Implement tRPC routers for three access control entities (Access Zones, Access Profiles, Employee Access Assignments) to replace the existing Go backend endpoints. This includes Prisma schema additions, three new tRPC router files, router registration, frontend hook migration from REST to tRPC, and comprehensive unit tests.

All three entities share the same permission (`access_control.manage`) and follow the standard CRUD pattern already established in the codebase (e.g., shifts, macros from ZMI-TICKET-222).

## Current State Analysis

### What Exists:
- **Go backend**: Full CRUD for all three entities via Chi router with GORM repositories
  - `apps/api/internal/service/access_profile.go` (143 lines)
  - `apps/api/internal/service/access_zone.go` (141 lines)
  - `apps/api/internal/service/employee_access_assignment.go` (121 lines)
- **Database**: Tables `access_zones`, `access_profiles`, `employee_access_assignments` exist (migration 000073)
- **OpenAPI schemas**: Defined in `api/schemas/access-control.yaml`
- **Frontend hooks**: REST-based hooks in `apps/web/src/hooks/api/use-access-control.ts` (105 lines)
- **Frontend components**: Three tabs consume these hooks:
  - `apps/web/src/components/access-control/zones-tab.tsx`
  - `apps/web/src/components/access-control/profiles-tab.tsx`
  - `apps/web/src/components/access-control/assignments-tab.tsx`
- **Permission**: `access_control.manage` already registered in permission catalog (`apps/web/src/server/lib/permission-catalog.ts` line 183)

### What's Missing:
- Prisma models for all three tables (not yet in `apps/web/prisma/schema.prisma`)
- tRPC routers for all three entities
- tRPC-based frontend hooks (currently REST-based)
- Unit tests for the new routers

### Key Discoveries:
- The Prisma schema ends at line 2067 with `EmployeeMessageRecipient`; new models go after this
- The `Tenant` model relations block is at lines 99-143 in the Prisma schema
- The `Employee` model reverse relations are at lines 569-591
- `apps/web/src/server/root.ts` currently has 41 routers registered (lines 52-93)
- The `access_control.manage` permission ID is already in the catalog at line 183
- `valid_from` and `valid_to` are `DATE` columns (not `TIMESTAMPTZ`) -- must use `@db.Date` in Prisma
- Access Profile deletion requires in-use check (employee_access_assignments count); Access Zone deletion does not
- Employee Access Assignment `getById` and `list` preload `Employee` and `AccessProfile` relations in Go, but the REST response only returns IDs. The tRPC router should include related data for frontend flexibility
- No unique constraint on `(employee_id, access_profile_id)` -- multiple assignments per employee-profile pair are valid (for different validity periods)

## Desired End State

After this plan is complete:
1. Three new Prisma models describe the existing DB tables
2. Three new tRPC routers provide full CRUD with business logic ported from Go
3. All routers are registered in `root.ts` and accessible via the tRPC client
4. Frontend hooks use tRPC instead of REST, with same export names and signatures
5. All three routers have comprehensive unit tests
6. `prisma generate` succeeds, TypeScript compiles, all tests pass

### Verification:
- `cd apps/web && npx prisma generate` completes without errors
- `cd apps/web && npx tsc --noEmit` compiles without errors
- `cd apps/web && npx vitest run src/server/__tests__/accessZones-router.test.ts` passes
- `cd apps/web && npx vitest run src/server/__tests__/accessProfiles-router.test.ts` passes
- `cd apps/web && npx vitest run src/server/__tests__/employeeAccessAssignments-router.test.ts` passes
- Frontend components render and CRUD operations work via tRPC (manual verification)

## What We're NOT Doing

- Terminal integration (ZMI-TICKET-225)
- Filtering/pagination on list endpoints (not in Go service)
- Zone-to-profile many-to-many relationships (ticket mentions `zone_ids` but the DB schema and Go service have no such junction table)
- Creating new DB migrations (tables already exist from migration 000073)
- Modifying frontend components (only the hook implementation changes; the component API stays the same)

## Implementation Approach

Follow the standard pattern established by ZMI-TICKET-222 (shifts, macros, employee messages):
1. Add Prisma models to describe existing tables
2. Create tRPC routers porting Go business logic to TypeScript/Prisma
3. Register routers in root.ts
4. Migrate frontend hooks from REST to tRPC
5. Write unit tests using the established mock-Prisma pattern

All three routers use the same permission (`access_control.manage`) and follow identical CRUD patterns, differing only in field sets and specific business rules.

---

## Phase 1: Prisma Schema

### Overview
Add three new Prisma models and reverse relations on existing models so that `prisma generate` produces the TypeScript types needed by the routers.

### Changes Required:

#### 1. Add reverse relations to Tenant model
**File**: `apps/web/prisma/schema.prisma` (after line 143, inside Tenant relations block)
**Changes**: Add three new relation arrays before the `@@index` block

```prisma
  accessZones                   AccessZone[]
  accessProfiles                AccessProfile[]
  employeeAccessAssignments     EmployeeAccessAssignment[]
```

#### 2. Add reverse relation to Employee model
**File**: `apps/web/prisma/schema.prisma` (after line 591, inside Employee reverse relations block)
**Changes**: Add one new relation array after `messageRecipients`

```prisma
  accessAssignments EmployeeAccessAssignment[]
```

#### 3. Add AccessZone model
**File**: `apps/web/prisma/schema.prisma` (after the EmployeeMessageRecipient model, line 2067)
**Changes**: Add new model

```prisma
// -----------------------------------------------------------------------------
// AccessZone
// -----------------------------------------------------------------------------
// Migration: 000073
//
// Physical access zone/area definition.
// Trigger: update_updated_at_column() auto-sets updated_at on UPDATE
model AccessZone {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  code        String   @db.VarChar(50)
  name        String   @db.VarChar(255)
  description String?  @db.Text
  isActive    Boolean  @default(true) @map("is_active")
  sortOrder   Int      @default(0) @map("sort_order")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  // Indexes
  @@unique([tenantId, code])
  @@index([tenantId], map: "idx_access_zones_tenant")
  @@map("access_zones")
}
```

#### 4. Add AccessProfile model
**File**: `apps/web/prisma/schema.prisma` (after AccessZone model)
**Changes**: Add new model

```prisma
// -----------------------------------------------------------------------------
// AccessProfile
// -----------------------------------------------------------------------------
// Migration: 000073
//
// Named access profile grouping access permissions.
// Trigger: update_updated_at_column() auto-sets updated_at on UPDATE
model AccessProfile {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  code        String   @db.VarChar(50)
  name        String   @db.VarChar(255)
  description String?  @db.Text
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant                    Tenant                      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employeeAccessAssignments EmployeeAccessAssignment[]

  // Indexes
  @@unique([tenantId, code])
  @@index([tenantId], map: "idx_access_profiles_tenant")
  @@map("access_profiles")
}
```

#### 5. Add EmployeeAccessAssignment model
**File**: `apps/web/prisma/schema.prisma` (after AccessProfile model)
**Changes**: Add new model

```prisma
// -----------------------------------------------------------------------------
// EmployeeAccessAssignment
// -----------------------------------------------------------------------------
// Migration: 000073
//
// Links an employee to an access profile with optional validity period.
// Trigger: update_updated_at_column() auto-sets updated_at on UPDATE
model EmployeeAccessAssignment {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String    @map("tenant_id") @db.Uuid
  employeeId      String    @map("employee_id") @db.Uuid
  accessProfileId String    @map("access_profile_id") @db.Uuid
  validFrom       DateTime? @map("valid_from") @db.Date
  validTo         DateTime? @map("valid_to") @db.Date
  isActive        Boolean   @default(true) @map("is_active")
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  tenant        Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee      Employee      @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  accessProfile AccessProfile @relation(fields: [accessProfileId], references: [id], onDelete: Cascade)

  // Indexes
  @@index([tenantId], map: "idx_employee_access_assignments_tenant")
  @@index([employeeId], map: "idx_employee_access_assignments_employee")
  @@index([accessProfileId], map: "idx_employee_access_assignments_profile")
  @@map("employee_access_assignments")
}
```

### Success Criteria:

#### Automated Verification:
- [x] Prisma generate succeeds: `cd /home/tolga/projects/terp/apps/web && npx prisma generate`
- [x] TypeScript compiles: `cd /home/tolga/projects/terp/apps/web && npx tsc --noEmit`

#### Manual Verification:
- [ ] Inspect generated Prisma types and confirm `AccessZone`, `AccessProfile`, `EmployeeAccessAssignment` are available

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: tRPC Routers

### Overview
Create three tRPC router files porting the Go business logic to TypeScript/Prisma. Register them in `root.ts`.

### Changes Required:

#### 1. Access Zones Router
**File**: `apps/web/src/server/routers/accessZones.ts` (new file)
**Changes**: Full CRUD router with 5 procedures

**Structure** (following `shifts.ts` pattern):
- Permission constant: `ACCESS_CONTROL_MANAGE = permissionIdByKey("access_control.manage")!`
- Output schema: `accessZoneOutputSchema` with fields: id, tenantId, code, name, description (nullable), isActive, sortOrder, createdAt, updatedAt
- Create input: code (required, min 1, max 50), name (required, min 1, max 255), description (optional), sortOrder (optional int)
- Update input: id (uuid), name (optional), description (nullable optional), isActive (optional), sortOrder (optional int). Code is NOT updatable.

**Procedures:**

| Procedure | Type | Business Logic |
|-----------|------|---------------|
| `list` | query | `findMany` where tenantId, orderBy `[{ sortOrder: "asc" }, { code: "asc" }]` |
| `getById` | query | `findFirst` where id + tenantId, throw NOT_FOUND if null |
| `create` | mutation | Trim code/name, validate non-empty, check code uniqueness (`findFirst` where tenantId + code), create with `isActive: true`, `sortOrder: input.sortOrder ?? 0` |
| `update` | mutation | Verify exists, build partial update data (name with trim+validate, description with nullable handling, isActive, sortOrder) |
| `delete` | mutation | Verify exists, hard delete (no in-use check) |

#### 2. Access Profiles Router
**File**: `apps/web/src/server/routers/accessProfiles.ts` (new file)
**Changes**: Full CRUD router with 5 procedures

**Structure** (following `shifts.ts` pattern):
- Same permission constant as Access Zones
- Output schema: `accessProfileOutputSchema` with fields: id, tenantId, code, name, description (nullable), isActive, createdAt, updatedAt (no sortOrder)
- Create input: code (required, min 1, max 50), name (required, min 1, max 255), description (optional)
- Update input: id (uuid), name (optional), description (nullable optional), isActive (optional). Code is NOT updatable.

**Procedures:**

| Procedure | Type | Business Logic |
|-----------|------|---------------|
| `list` | query | `findMany` where tenantId, orderBy `{ code: "asc" }` |
| `getById` | query | `findFirst` where id + tenantId, throw NOT_FOUND if null |
| `create` | mutation | Trim code/name, validate non-empty, check code uniqueness, create with `isActive: true` |
| `update` | mutation | Verify exists, build partial update data (name with trim+validate, description nullable, isActive) |
| `delete` | mutation | Verify exists, **check in-use** via `prisma.employeeAccessAssignment.count({ where: { accessProfileId: input.id } })`, throw CONFLICT if count > 0 with message "Access profile is in use by employee assignments and cannot be deleted", then hard delete |

**Critical difference from Access Zones**: The delete procedure must check `HasAssignments` before deletion (ported from Go `access_profile.go` line 129-134).

#### 3. Employee Access Assignments Router
**File**: `apps/web/src/server/routers/employeeAccessAssignments.ts` (new file)
**Changes**: Full CRUD router with 5 procedures

**Structure**:
- Same permission constant
- Output schema: `employeeAccessAssignmentOutputSchema` with fields: id, tenantId, employeeId, accessProfileId, validFrom (date nullable), validTo (date nullable), isActive, createdAt, updatedAt
- Create input: employeeId (uuid, required), accessProfileId (uuid, required), validFrom (string date, optional), validTo (string date, optional)
- Update input: id (uuid), validFrom (string date, nullable optional), validTo (string date, nullable optional), isActive (optional). EmployeeID and AccessProfileID are NOT updatable.

**Date handling**: `validFrom` and `validTo` are `@db.Date` columns. In Zod input: use `z.string().date().optional()` for create and `z.string().date().nullable().optional()` for update. In output schema: use `z.date().nullable()`. Convert string input to `new Date(input.validFrom)` before storing via Prisma.

**Procedures:**

| Procedure | Type | Business Logic |
|-----------|------|---------------|
| `list` | query | `findMany` where tenantId, orderBy `{ createdAt: "desc" }`, include `{ employee: true, accessProfile: true }` |
| `getById` | query | `findFirst` where id + tenantId, include `{ employee: true, accessProfile: true }`, throw NOT_FOUND if null |
| `create` | mutation | Validate employeeId and accessProfileId are provided (Zod handles UUID format). Verify employee exists in same tenant: `prisma.employee.findFirst({ where: { id, tenantId } })`. Verify accessProfile exists in same tenant: `prisma.accessProfile.findFirst({ where: { id, tenantId } })`. Throw BAD_REQUEST if either not found. Create with `isActive: true`. |
| `update` | mutation | Verify exists, build partial update: validFrom (convert string date or set null), validTo (convert string date or set null), isActive |
| `delete` | mutation | Verify exists, hard delete |

**Note on preloaded relations**: The Go repository preloads Employee and AccessProfile on getById and list. For list, this is useful for the assignments-tab.tsx which needs employee and profile details to display. Include these relations in the output schema as optional nested objects, OR include the flat IDs and let the frontend join. Given the Go pattern preloads them, include them in the response for feature parity.

#### 4. Router Registration
**File**: `apps/web/src/server/root.ts`
**Changes**: Add 3 imports and 3 entries

```typescript
// Add imports after line 50 (after employeeMessagesRouter import):
import { accessZonesRouter } from "./routers/accessZones"
import { accessProfilesRouter } from "./routers/accessProfiles"
import { employeeAccessAssignmentsRouter } from "./routers/employeeAccessAssignments"

// Add entries inside createTRPCRouter after line 93 (after employeeMessages):
accessZones: accessZonesRouter,
accessProfiles: accessProfilesRouter,
employeeAccessAssignments: employeeAccessAssignmentsRouter,
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `cd /home/tolga/projects/terp/apps/web && npx tsc --noEmit`
- [x] Prisma generate still succeeds: `cd /home/tolga/projects/terp/apps/web && npx prisma generate`

#### Manual Verification:
- [ ] Inspect router files and confirm all 5 procedures exist in each
- [ ] Verify permission checks are in place on all procedures
- [ ] Verify the delete procedure on accessProfiles includes the in-use check

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Frontend Hook Migration

### Overview
Rewrite `apps/web/src/hooks/api/use-access-control.ts` from REST-based hooks to tRPC-based hooks, preserving the same export names and function signatures.

### Changes Required:

#### 1. Rewrite use-access-control.ts
**File**: `apps/web/src/hooks/api/use-access-control.ts`
**Changes**: Complete rewrite following the pattern in `use-shift-planning.ts`

Replace all `useApiQuery`/`useApiMutation` calls with tRPC equivalents:

**Pattern for query hooks:**
```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useAccessZones(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options
  const trpc = useTRPC()
  return useQuery(trpc.accessZones.list.queryOptions(undefined, { enabled }))
}

export function useAccessZone(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(trpc.accessZones.getById.queryOptions({ id }, { enabled: enabled && !!id }))
}
```

**Pattern for mutation hooks:**
```typescript
export function useCreateAccessZone() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.accessZones.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.accessZones.list.queryKey() })
    },
  })
}
```

**Full hook mapping (14 hooks total):**

| Hook | tRPC Router | Procedure | Invalidates |
|------|-------------|-----------|-------------|
| `useAccessZones(options)` | `accessZones` | `list` | -- |
| `useAccessZone(id, enabled)` | `accessZones` | `getById` | -- |
| `useCreateAccessZone()` | `accessZones` | `create` | `accessZones.list` |
| `useUpdateAccessZone()` | `accessZones` | `update` | `accessZones.list` |
| `useDeleteAccessZone()` | `accessZones` | `delete` | `accessZones.list` |
| `useAccessProfiles(options)` | `accessProfiles` | `list` | -- |
| `useAccessProfile(id, enabled)` | `accessProfiles` | `getById` | -- |
| `useCreateAccessProfile()` | `accessProfiles` | `create` | `accessProfiles.list` |
| `useUpdateAccessProfile()` | `accessProfiles` | `update` | `accessProfiles.list` |
| `useDeleteAccessProfile()` | `accessProfiles` | `delete` | `accessProfiles.list` |
| `useEmployeeAccessAssignments(options)` | `employeeAccessAssignments` | `list` | -- |
| `useCreateEmployeeAccessAssignment()` | `employeeAccessAssignments` | `create` | `employeeAccessAssignments.list` |
| `useUpdateEmployeeAccessAssignment()` | `employeeAccessAssignments` | `update` | `employeeAccessAssignments.list` |
| `useDeleteEmployeeAccessAssignment()` | `employeeAccessAssignments` | `delete` | `employeeAccessAssignments.list` |

**Note**: The index file (`apps/web/src/hooks/api/index.ts` lines 534-550) already exports all 14 hooks from `./use-access-control`. No changes needed there since the export names and source file remain the same.

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `cd /home/tolga/projects/terp/apps/web && npx tsc --noEmit`

#### Manual Verification:
- [ ] Access Control page loads without errors
- [ ] Zones tab: list, create, edit, delete all work
- [ ] Profiles tab: list, create, edit, delete all work
- [ ] Assignments tab: list, create, edit, delete all work
- [ ] Deleting a profile that is in use shows appropriate error message

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Unit Tests

### Overview
Create comprehensive unit tests for all three routers following the established test pattern from `systemSettings-router.test.ts`.

### Changes Required:

#### 1. Access Zones Router Tests
**File**: `apps/web/src/server/__tests__/accessZones-router.test.ts` (new file)

**Test cases:**
- `accessZones.list` -- returns all zones ordered by sortOrder/code
- `accessZones.list` -- denies access without permission
- `accessZones.getById` -- returns zone by ID
- `accessZones.getById` -- throws NOT_FOUND for missing ID
- `accessZones.create` -- creates zone with valid input
- `accessZones.create` -- validates code required (empty after trim)
- `accessZones.create` -- validates name required (empty after trim)
- `accessZones.create` -- rejects duplicate code within tenant (CONFLICT)
- `accessZones.create` -- defaults sortOrder to 0
- `accessZones.update` -- partial update succeeds
- `accessZones.update` -- throws NOT_FOUND for missing zone
- `accessZones.update` -- validates name non-empty when provided
- `accessZones.delete` -- deletes existing zone
- `accessZones.delete` -- throws NOT_FOUND for missing zone

#### 2. Access Profiles Router Tests
**File**: `apps/web/src/server/__tests__/accessProfiles-router.test.ts` (new file)

**Test cases:**
- `accessProfiles.list` -- returns all profiles ordered by code
- `accessProfiles.list` -- denies access without permission
- `accessProfiles.getById` -- returns profile by ID
- `accessProfiles.getById` -- throws NOT_FOUND for missing ID
- `accessProfiles.create` -- creates profile with valid input
- `accessProfiles.create` -- validates code required
- `accessProfiles.create` -- validates name required
- `accessProfiles.create` -- rejects duplicate code (CONFLICT)
- `accessProfiles.update` -- partial update succeeds
- `accessProfiles.update` -- throws NOT_FOUND for missing profile
- `accessProfiles.update` -- validates name non-empty when provided
- `accessProfiles.delete` -- deletes profile with no assignments
- `accessProfiles.delete` -- throws NOT_FOUND for missing profile
- `accessProfiles.delete` -- blocks deletion when profile is in use (CONFLICT)

#### 3. Employee Access Assignments Router Tests
**File**: `apps/web/src/server/__tests__/employeeAccessAssignments-router.test.ts` (new file)

**Test cases:**
- `employeeAccessAssignments.list` -- returns all assignments ordered by createdAt DESC
- `employeeAccessAssignments.list` -- denies access without permission
- `employeeAccessAssignments.getById` -- returns assignment by ID
- `employeeAccessAssignments.getById` -- throws NOT_FOUND for missing ID
- `employeeAccessAssignments.create` -- creates assignment with valid input
- `employeeAccessAssignments.create` -- creates assignment with validFrom/validTo
- `employeeAccessAssignments.create` -- rejects invalid employee ID (BAD_REQUEST)
- `employeeAccessAssignments.create` -- rejects invalid access profile ID (BAD_REQUEST)
- `employeeAccessAssignments.update` -- partial update succeeds (isActive, validFrom, validTo)
- `employeeAccessAssignments.update` -- throws NOT_FOUND for missing assignment
- `employeeAccessAssignments.delete` -- deletes existing assignment
- `employeeAccessAssignments.delete` -- throws NOT_FOUND for missing assignment

**Test pattern** (from `systemSettings-router.test.ts`):
```typescript
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "../trpc"
import { accessZonesRouter } from "../routers/accessZones"
import { permissionIdByKey } from "../lib/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

const ACCESS_CONTROL_MANAGE = permissionIdByKey("access_control.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(accessZonesRouter)

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([ACCESS_CONTROL_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

function createNoPermContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}
```

Each test mocks only the Prisma methods used by that procedure (e.g., `findMany`, `findFirst`, `create`, `update`, `delete`, `count`).

### Success Criteria:

#### Automated Verification:
- [x] Access Zones tests pass: `cd /home/tolga/projects/terp/apps/web && npx vitest run src/server/__tests__/accessZones-router.test.ts`
- [x] Access Profiles tests pass: `cd /home/tolga/projects/terp/apps/web && npx vitest run src/server/__tests__/accessProfiles-router.test.ts`
- [x] Employee Access Assignments tests pass: `cd /home/tolga/projects/terp/apps/web && npx vitest run src/server/__tests__/employeeAccessAssignments-router.test.ts`
- [x] Full test suite still passes: `cd /home/tolga/projects/terp/apps/web && npx vitest run`
- [x] TypeScript compiles: `cd /home/tolga/projects/terp/apps/web && npx tsc --noEmit`

#### Manual Verification:
- [ ] Review test coverage and confirm all business logic branches are tested

**Implementation Note**: After completing this phase and all automated verification passes, this ticket is complete.

---

## Testing Strategy

### Unit Tests:
- All router procedures tested with mocked Prisma client
- Permission denial tested for each router (at least on `list`)
- NOT_FOUND error paths tested for getById, update, delete
- Validation errors tested for create (empty code, empty name, duplicate code)
- Access profile in-use deletion check tested (CONFLICT error)
- Employee access assignment FK validation tested (invalid employee, invalid profile)

### Integration Tests:
- Not in scope for this ticket (would require running DB + tRPC server)

### Manual Testing Steps:
1. Navigate to Access Control page
2. Test each tab (Zones, Profiles, Assignments)
3. Create, edit, and delete entries in each tab
4. Try to delete a profile that has assignments -- verify error message
5. Create an assignment with validity dates -- verify dates persist
6. Verify permission checks by testing as user without `access_control.manage`

## Performance Considerations

- List queries return all records for a tenant (no pagination). This matches Go behavior. If tenants accumulate many records, pagination can be added later.
- Employee Access Assignments list includes `employee` and `accessProfile` relations. This adds two JOINs per query. Acceptable for typical data volumes.

## Migration Notes

- No database migrations needed -- tables already exist from migration 000073
- Prisma schema is read-only against the database (documented in schema header). The `@@map` directives point to existing tables.
- Frontend components do not need changes. They import hooks by name from `@/hooks/api`, and the hook names/signatures remain identical.

## File Inventory

### Files to Create (6):
| File | Description |
|------|-------------|
| `apps/web/src/server/routers/accessZones.ts` | Access Zones tRPC router (5 procedures) |
| `apps/web/src/server/routers/accessProfiles.ts` | Access Profiles tRPC router (5 procedures) |
| `apps/web/src/server/routers/employeeAccessAssignments.ts` | Employee Access Assignments tRPC router (5 procedures) |
| `apps/web/src/server/__tests__/accessZones-router.test.ts` | Tests for access zones router |
| `apps/web/src/server/__tests__/accessProfiles-router.test.ts` | Tests for access profiles router |
| `apps/web/src/server/__tests__/employeeAccessAssignments-router.test.ts` | Tests for employee access assignments router |

### Files to Modify (3):
| File | Change |
|------|--------|
| `apps/web/prisma/schema.prisma` | Add 3 new models + reverse relations on Tenant (line ~143) and Employee (line ~591) |
| `apps/web/src/server/root.ts` | Import and register 3 new routers |
| `apps/web/src/hooks/api/use-access-control.ts` | Rewrite from REST to tRPC hooks (same export names) |

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-223-access-profiles-zones-assignments.md`
- Research document: `thoughts/shared/research/2026-03-06-ZMI-TICKET-223-access-profiles-zones-assignments.md`
- Similar implementation (shifts router): `apps/web/src/server/routers/shifts.ts`
- Similar implementation (macros router): `apps/web/src/server/routers/macros.ts`
- Go service (access profile): `apps/api/internal/service/access_profile.go`
- Go service (access zone): `apps/api/internal/service/access_zone.go`
- Go service (employee access assignment): `apps/api/internal/service/employee_access_assignment.go`
- Frontend hooks (current REST): `apps/web/src/hooks/api/use-access-control.ts`
- Frontend hooks (tRPC pattern): `apps/web/src/hooks/api/use-shift-planning.ts`
- Test pattern: `apps/web/src/server/__tests__/systemSettings-router.test.ts`
- Permission catalog: `apps/web/src/server/lib/permission-catalog.ts` (line 183)
- Prisma schema: `apps/web/prisma/schema.prisma`
