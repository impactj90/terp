# Research: HR_01 — Personalakte mit Anhängen

Date: 2026-03-27

---

## 1. Employee Model & HR Patterns

### Employee Prisma Model

- **File:** `prisma/schema.prisma` (line 1408)
- **Table:** `employees`
- 50+ fields including personal data, employment details, group/order/activity FKs, tariff overrides
- Soft delete via `deletedAt` column
- Composite unique: `[tenantId, personnelNumber]` and `[tenantId, pin]`
- Indexes: `tenantId`, `departmentId`, `tenantId+isActive`, `deletedAt`, `tenantId+lastName+firstName`

### Employee Relations (reverse)

The Employee model has many reverse relations already:
```
contacts, cards, tariffAssignments, cappingExceptions, vacationBalances,
shiftAssignments, employeeDayPlans, macroAssignments, messageRecipients,
accessAssignments, monthlyValues, rawTerminalBookings, bookings, dailyValues,
dailyAccountValues, absenceDays, corrections, orderBookings,
crmTaskAssignees, assignedServiceCases
```

A new `hrPersonnelFileEntries HrPersonnelFileEntry[]` relation will need to be added.

### Existing Employee-Related Services

All in `src/lib/services/`:
- `employees-service.ts` / `employees-repository.ts` — Core CRUD with DataScope support
- `employee-contacts-service.ts` / `employee-contacts-repository.ts`
- `employee-cards-service.ts` / `employee-cards-repository.ts`
- `employee-tariff-assignment-service.ts` / `employee-tariff-assignment-repository.ts`
- `employee-messages-service.ts` / `employee-messages-repository.ts`
- `employee-access-assignment-service.ts` / `employee-access-assignment-repository.ts`
- `employee-capping-exception-service.ts` / `employee-capping-exception-repository.ts`
- `employee-day-plans-service.ts` / `employee-day-plans-repository.ts`
- `absence-type-service.ts`, `absences-service.ts` — HR absence management

### Employee Detail Page — Tabs

- **File:** `src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx`
- Uses `<Tabs defaultValue="overview">` with `<TabsList>` and `<TabsTrigger>`
- Currently 2 tabs: `overview` and `tariff-assignments`
- Tab components: `<TabsContent value="...">` wrapping content
- The new "Personalakte" tab will be added as a third tab here
- Components come from `@/components/ui/tabs` (shadcn/ui Tabs)

### Employee Detail Sheet (sidebar)

- **File:** `src/components/employees/employee-detail-sheet.tsx`
- Uses Sheet component (`@/components/ui/sheet`)
- Sections: Contact, Employment, Contract, Access Cards, Emergency Contacts
- The sheet is a simpler read-only view; the full detail is on the `[id]/page.tsx`

---

## 2. File Upload Patterns (Supabase Storage)

### Existing Implementations

Two established file upload patterns exist:

#### CRM Correspondence Attachments (CRM_07)
- **Service:** `src/lib/services/crm-correspondence-attachment-service.ts`
- **Bucket:** `crm-attachments`
- **Max size:** 10 MB
- **MIME types:** PDF, JPEG, PNG, WebP, DOCX, XLSX
- **Storage path:** `{tenantId}/{correspondenceId}/{fileId}.{ext}`
- **Max per correspondence:** 5

#### Warehouse Article Images (WH_13)
- **Service:** `src/lib/services/wh-article-image-service.ts`
- **Bucket:** `wh-article-images`
- **Max size:** 5 MB
- **MIME types:** JPEG, PNG, WebP
- **Storage path:** `{tenantId}/{articleId}/{imageId}.{ext}`
- Additional: thumbnail generation with sharp, isPrimary, sortOrder, reorder

### Upload Flow (3-step pattern)

Both services follow the same pattern:

1. **`getUploadUrl`** — Client requests signed upload URL
   - Validates mime type, checks parent entity exists + belongs to tenant
   - Checks attachment count limit
   - Generates storage path: `{tenantId}/{parentId}/{uuid}.{ext}`
   - Creates signed upload URL via `supabase.storage.from(BUCKET).createSignedUploadUrl(path)`
   - Returns `{ signedUrl, storagePath, token }`

2. **Client uploads directly** to Supabase Storage using signed URL

3. **`confirmUpload`** — Client confirms upload, creates DB record
   - Validates size and mime type again
   - Verifies parent entity exists
   - Re-checks attachment count (race condition protection)
   - Creates Prisma record with metadata

### Download Flow

- **`listAttachments`** / **`listImages`** — Fetches records + generates signed download URLs
- **`getDownloadUrl`** — Single attachment download URL
- Uses `supabase.storage.from(BUCKET).createSignedUrl(path, expirySeconds)`
- Expiry: 3600 seconds (1 hour)

### Delete Flow

- **`deleteAttachment`** / **`deleteImage`**
  - Finds record (tenant-scoped)
  - Deletes from storage: `supabase.storage.from(BUCKET).remove([path])`
  - Deletes DB record

### fixSignedUrl Pattern

```ts
function fixSignedUrl(signedUrl: string): string {
  const internalUrl = serverEnv.supabaseUrl
  const publicUrl = clientEnv.supabaseUrl
  if (internalUrl && publicUrl && internalUrl !== publicUrl) {
    return signedUrl.replace(internalUrl, publicUrl)
  }
  return signedUrl
}
```
Used in all storage services to handle Docker internal/public URL mismatch.

### Supabase Admin Client

- **File:** `src/lib/supabase/admin.ts`
- `createAdminClient()` — Creates service-role client that bypasses RLS
- Uses `serverEnv.supabaseServiceRoleKey`

### Bucket Configuration

- **File:** `supabase/config.toml`
- Buckets defined under `[storage.buckets.<name>]`
- Properties: `public`, `file_size_limit`, `allowed_mime_types`

Existing buckets:
```toml
[storage.buckets.documents]        # PDF, XML, 10MiB, private
[storage.buckets.tenant-logos]     # images, 2MiB, public
[storage.buckets.wh-article-images] # images, 5MiB, private
[storage.buckets.crm-attachments]  # PDF/images/office, 10MiB, private
```

The new bucket `hr-personnel-files` needs to be added here with `file_size_limit = "20MiB"` (per ticket spec).

---

## 3. Service + Repository Pattern

### Canonical Example: `wh-article-service.ts`

- **Service file:** `src/lib/services/wh-article-service.ts`
- **Repository file:** `src/lib/services/wh-article-repository.ts`

### Service Pattern

```ts
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./wh-article-repository"
import * as auditLog from "./audit-logs-service"

// Error Classes (named: {Domain}NotFoundError, {Domain}ValidationError, {Domain}ConflictError)
export class WhArticleNotFoundError extends Error {
  constructor(message = "Article not found") { super(message); this.name = "WhArticleNotFoundError" }
}

// Service functions receive (prisma, tenantId, ...) — never access global prisma
export async function list(prisma: PrismaClient, tenantId: string, params: {...}) { ... }
export async function getById(prisma: PrismaClient, tenantId: string, id: string) { ... }
export async function create(prisma: PrismaClient, tenantId: string, input: {...}, createdById: string, audit?: AuditContext) { ... }
export async function update(prisma: PrismaClient, tenantId: string, input: {...}, audit?: AuditContext) { ... }
export async function remove(prisma: PrismaClient, tenantId: string, id: string, audit?: AuditContext) { ... }
```

### Repository Pattern

```ts
import type { PrismaClient } from "@/generated/prisma/client"

export async function findMany(prisma: PrismaClient, tenantId: string, params: {...}) { ... }
export async function findById(prisma: PrismaClient, tenantId: string, id: string) { ... }
export async function create(prisma: PrismaClient, data: {...}) { ... }
export async function update(prisma: PrismaClient, tenantId: string, id: string, data: {...}) { ... }
```

### Key Rules

- Every query MUST include `tenantId` filter
- Repository = pure Prisma data access, no business logic
- Service = business logic, validation, audit logging
- Error classes follow naming convention: `{Domain}NotFoundError`, `{Domain}ValidationError`, `{Domain}ConflictError`, `{Domain}ForbiddenError`
- These are mapped by `handleServiceError` in `src/trpc/errors.ts` via constructor name suffix

### Attachment Services (Combined Pattern)

The attachment services (`crm-correspondence-attachment-service.ts`, `wh-article-image-service.ts`) combine service + repository in a single file. Repository functions are exported but in the same file under a `// Repository Functions` section. This is acceptable for simpler entities.

---

## 4. Permission System

### Permission Catalog

- **File:** `src/lib/auth/permission-catalog.ts`
- Currently 95 permissions defined
- Each permission: `{ id: UUID, key: string, resource: string, action: string, description: string }`
- IDs generated deterministically via UUIDv5 with namespace `f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1`
- Pattern: `p("resource.action", "resource", "action", "Description")`

### Permission Registration

New permissions are added to the `ALL_PERMISSIONS` array. Then:
- Lookup maps are auto-built: `byId`, `byKey`
- `permissionIdByKey("employees.view")` returns the UUID

### Permissions to Add (per ticket)

```ts
p("hr_personnel_file.view", "hr_personnel_file", "view", "View personnel file entries"),
p("hr_personnel_file.create", "hr_personnel_file", "create", "Create personnel file entries"),
p("hr_personnel_file.edit", "hr_personnel_file", "edit", "Edit personnel file entries"),
p("hr_personnel_file.delete", "hr_personnel_file", "delete", "Delete personnel file entries"),
p("hr_personnel_file.view_confidential", "hr_personnel_file", "view_confidential", "View confidential entries"),
p("hr_personnel_file_categories.manage", "hr_personnel_file_categories", "manage", "Manage personnel file categories"),
```

Total will become 101 permissions.

### Authorization Middleware

- **File:** `src/lib/auth/middleware.ts`
- `requirePermission(...permissionIds)` — Checks user has ANY of specified permissions (OR logic)
- `requireSelfOrPermission(getter, permId)` — Self-access or permission
- `requireEmployeePermission(getter, ownPerm, allPerm)` — Own vs all employee data
- `applyDataScope()` — Adds DataScope filter to context

### Usage in Routers

```ts
const EMPLOYEES_VIEW = permissionIdByKey("employees.view")!

tenantProcedure
  .use(requirePermission(EMPLOYEES_VIEW))
  .input(schema)
  .query(async ({ ctx, input }) => { ... })
```

### User Groups & Permission Migration

Permissions are added to default user groups via SQL migrations:
```sql
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"<permission-uuid>"'::jsonb
  ) sub
) WHERE code = 'PERSONAL' AND tenant_id IS NULL;
```

Default groups: `ADMIN` (isAdmin=true), `PERSONAL`, `VORGESETZTER`, `MITARBEITER`, plus module-specific: `VERTRIEB`, `LAGER`.

---

## 5. tRPC Router Patterns

### Base Router Structure

- **File:** `src/trpc/init.ts`
- Procedure types: `publicProcedure`, `protectedProcedure`, `tenantProcedure`
- `tenantProcedure` = protectedProcedure + tenant ID requirement + tenant access validation

### Simple Router Example (employees)

```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission, applyDataScope } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as employeesService from "@/lib/services/employees-service"

const EMPLOYEES_VIEW = permissionIdByKey("employees.view")!

export const employeesRouter = createTRPCRouter({
  list: tenantProcedure
    .use(requirePermission(EMPLOYEES_VIEW))
    .use(applyDataScope())
    .input(z.object({ ... }))
    .query(async ({ ctx, input }) => {
      try {
        return await employeesService.list(ctx.prisma, ctx.tenantId, ctx.dataScope, input)
      } catch (err) { handleServiceError(err) }
    }),
})
```

### Module-Guarded Router (warehouse/crm)

```ts
import { requireModule } from "@/lib/modules"

const whProcedure = tenantProcedure.use(requireModule("warehouse"))

// All procedures use whProcedure instead of tenantProcedure
```

### Nested Router Pattern (CRM correspondence + attachments)

Attachments are nested inside the correspondence router:
```ts
export const crmCorrespondenceRouter = createTRPCRouter({
  list: crmProcedure.use(requirePermission(CORR_VIEW)).input(...).query(...),
  create: crmProcedure.use(requirePermission(CORR_CREATE)).input(...).mutation(...),
  // ...

  attachments: createTRPCRouter({
    list: crmProcedure.use(requirePermission(CORR_VIEW)).input(...).query(...),
    getUploadUrl: crmProcedure.use(requirePermission(CORR_UPLOAD)).input(...).mutation(...),
    confirm: crmProcedure.use(requirePermission(CORR_UPLOAD)).input(...).mutation(...),
    delete: crmProcedure.use(requirePermission(CORR_UPLOAD)).input(...).mutation(...),
    getDownloadUrl: crmProcedure.use(requirePermission(CORR_VIEW)).input(...).query(...),
  }),
})
```

### Module Router Index

Modules with sub-routers use an `index.ts`:
```ts
// src/trpc/routers/warehouse/index.ts
export const warehouseRouter = createTRPCRouter({
  articles: whArticlesRouter,
  purchaseOrders: whPurchaseOrdersRouter,
  // ...
})
```

### Root Router Registration

- **File:** `src/trpc/routers/_app.ts`
- Imports all routers and merges them:
```ts
export const appRouter = createTRPCRouter({
  employees: employeesRouter,
  crm: crmRouter,
  warehouse: warehouseRouter,
  // ...
})
```

For HR_01, a new `hr` module directory could be created or the router added as a top-level entry. Since there's no `hr` module directory yet, it could be:
- Option A: `src/trpc/routers/hrPersonnelFile.ts` as top-level router
- Option B: `src/trpc/routers/hr/index.ts` + `hr/personnelFile.ts` (matching CRM/warehouse pattern)

The ticket specifies path `src/trpc/routers/hr/personnelFile.ts`, so Option B.

### PrismaClient Cast Pattern

Every router casts prisma:
```ts
ctx.prisma as unknown as PrismaClient
```

---

## 6. UI Patterns

### Tabs in Employee Detail

- **File:** `src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx`
- Uses shadcn/ui `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`
- Currently 2 tabs: "overview" and "tariff-assignments"
- Tab content is inline or via imported components

### Dialog/Sheet Patterns

- **Sheets:** `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetFooter` from `@/components/ui/sheet`
- **Dialogs:** `ConfirmDialog` from `@/components/ui/confirm-dialog`
- Form sheets use `ScrollArea` for content overflow

### Dashboard Widgets

- **File:** `src/app/[locale]/(dashboard)/dashboard/page.tsx`
- Layout: Header, QuickActions, Stats Cards Grid (4-col), Two-column grid (PendingActions + RecentActivity)
- **StatsCard:** `src/components/dashboard/stats-card.tsx` — Reusable card with title, value, description, icon, trend, loading/error states
- **PendingActions:** `src/components/dashboard/pending-actions.tsx` — Section with list items, loading skeleton, empty state
- Components are exported from `src/components/dashboard/index.ts`

### Component Organization

- Employee components in `src/components/employees/`
- Dashboard components in `src/components/dashboard/`
- For HR_01, components would go in `src/components/hr/`

---

## 7. Migration Patterns

### Migration Numbering

Recent migrations use date-based format: `YYYYMMDDHHMMSS_description.sql`

Latest migrations (as of 2026-03-27):
```
20260407100000_wh_stock_reservations.sql
20260407100001_add_wh_reservation_permissions_to_groups.sql
```

Next available: `20260408100000_...` or later.

### Migration Structure

Table creation example (`wh_article_images`):
```sql
CREATE TABLE wh_article_images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id    UUID NOT NULL REFERENCES wh_articles(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  ...
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wh_article_images_article_sort ON wh_article_images (article_id, sort_order);
CREATE INDEX idx_wh_article_images_tenant ON wh_article_images (tenant_id);
```

### Permission Migration Pattern

Separate migration for adding permissions to user groups:
```sql
-- Add <permission> to user groups
-- Permission UUID: <uuid> (UUIDv5 with namespace f68a2ad7-...)
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"<uuid>"'::jsonb
  ) sub
) WHERE code = 'PERSONAL' AND tenant_id IS NULL;
```

### Total Migration Count

Currently 107+ SQL migration files in `supabase/migrations/`. Some use the `20260101000NNN` format (legacy), newer ones use `YYYYMMDDHHMMSS`.

---

## 8. Test Patterns

### Test File Location

- Router tests: `src/trpc/routers/__tests__/<routerName>-router.test.ts`
- ~90 test files currently

### Test Helpers

- **File:** `src/trpc/routers/__tests__/helpers.ts`
- `autoMockPrisma(partial)` — Proxy that auto-stubs missing Prisma methods
- `createMockUser(overrides)` — Mock ContextUser
- `createMockSession()` — Mock Supabase Session
- `createMockContext(overrides)` — Mock TRPCContext (auto-wraps prisma)
- `createMockUserGroup(overrides)` — Mock UserGroup
- `createAdminUser(overrides)` — User with isAdmin group
- `createUserWithPermissions(permIds, overrides)` — User with specific permissions
- `createMockTenant(overrides)` — Mock Tenant
- `createMockUserTenant(userId, tenantId)` — Mock UserTenant join entry

### Router Test Pattern

Example from `whArticleImages-router.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { whArticlesRouter } from "../warehouse/articles"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { createMockContext, createMockSession, createUserWithPermissions, createMockUserTenant } from "./helpers"

// Mock service module
vi.mock("@/lib/services/wh-article-image-service", () => ({
  listImages: vi.fn().mockResolvedValue([]),
  getUploadUrl: vi.fn().mockResolvedValue({ signedUrl: "...", storagePath: "...", token: "..." }),
  // ...
}))

// Mock db module for requireModule middleware
vi.mock("@/lib/db", () => ({
  prisma: { tenantModule: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "warehouse" }) } },
}))

const createCaller = createCallerFactory(whArticlesRouter)

function createTestContext(prisma, permissions = ALL_PERMS) {
  return createMockContext({
    prisma: withModuleMock(prisma),
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

describe("warehouse.articles.images", () => {
  it("returns images sorted by sortOrder", async () => {
    const caller = createCaller(createTestContext({}))
    const result = await caller.images.list({ articleId: ARTICLE_ID })
    expect(Array.isArray(result)).toBe(true)
  })

  it("requires permission", async () => {
    const caller = createCaller(createNoPermContext({}))
    await expect(caller.images.list({ articleId: ARTICLE_ID })).rejects.toThrow("Insufficient permissions")
  })
})
```

### Key Testing Patterns

1. **Service mocking:** `vi.mock("@/lib/services/...")` — Mock service at module level
2. **Module guard mocking:** Mock `@/lib/db` with `tenantModule.findUnique` returning the module
3. **Permission testing:** Create contexts with specific permissions, verify FORBIDDEN errors
4. **Caller factory:** `createCallerFactory(router)` to create test callers
5. **No real DB:** Tests use mocked Prisma, not real database connections

---

## 9. Seed Data Patterns

### Dev Seed File

- **File:** `supabase/seed.sql`
- Run via: `pnpm db:reset`
- Seeds: auth users, tenant, user groups, employees, departments, day plans, tariffs, holidays, etc.
- Dev tenant ID: `10000000-0000-0000-0000-000000000001`

### Default Data via Migrations

System-level defaults are seeded via migrations (not seed.sql):
- `000086_seed_default_absence_types.sql` — Default absence types
- `000087_seed_default_booking_types.sql` — Default booking types
- `000088_user_groups_nullable_tenant_and_defaults.sql` — Default user groups (ADMIN, PERSONAL, VORGESETZTER, MITARBEITER)

For HR_01, default categories should be seeded via a migration (tenant-independent defaults or part of seed.sql).

### Bucket Setup

Buckets are configured in `supabase/config.toml`, NOT via migrations. The new bucket needs to be added there:

```toml
[storage.buckets.hr-personnel-files]
public = false
file_size_limit = "20MiB"
allowed_mime_types = ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]
```

---

## 10. Hook Patterns

### Hook File Location

- All hooks in `src/hooks/` (flat directory, ~77 files)
- Barrel export: `src/hooks/index.ts`

### Hook Structure

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// Query Hook
export function useEmployees(options = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.employees.list.queryOptions(input, { enabled })
  )
}

// Single Item Hook
export function useEmployee(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.employees.getById.queryOptions({ id }, { enabled: enabled && !!id })
  )
}

// Mutation Hook
export function useCreateEmployee() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.employees.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.employees.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.employees.search.queryKey() })
    },
  })
}
```

### Attachment Hook Pattern (CRM)

The attachment hooks from `use-crm-correspondence-attachments.ts` are exported in barrel:
```ts
export {
  useCrmCorrespondenceAttachments,
  useUploadCrmCorrespondenceAttachment,
  useDeleteCrmCorrespondenceAttachment,
  useCrmCorrespondenceDownloadUrl,
} from './use-crm-correspondence-attachments'
```

### Barrel Export Pattern

```ts
// src/hooks/index.ts
export {
  useHookA,
  useHookB,
} from './use-domain-name'
```

---

## Summary of Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260408100000_create_hr_personnel_file.sql` | 3 tables: categories, entries, attachments |
| `supabase/migrations/20260408100001_add_hr_personnel_file_permissions_to_groups.sql` | Add permissions to PERSONAL group |
| `src/lib/services/hr-personnel-file-service.ts` | Service: business logic |
| `src/lib/services/hr-personnel-file-repository.ts` | Repository: Prisma queries |
| `src/lib/services/hr-personnel-file-attachment-service.ts` | Attachment service (storage) |
| `src/trpc/routers/hr/index.ts` | HR module router index |
| `src/trpc/routers/hr/personnelFile.ts` | Personnel file router |
| `src/hooks/use-hr-personnel-file.ts` | React hooks |
| `src/components/hr/personnel-file-tab.tsx` | Tab component for employee detail |
| `src/components/hr/personnel-file-entry-dialog.tsx` | Entry form dialog |
| `src/trpc/routers/__tests__/hrPersonnelFile-router.test.ts` | Router tests |

### Files to Modify

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add 3 models, update Employee + Tenant relations |
| `src/lib/auth/permission-catalog.ts` | Add 6 new permissions |
| `supabase/config.toml` | Add `hr-personnel-files` bucket |
| `src/trpc/routers/_app.ts` | Register `hr` router |
| `src/hooks/index.ts` | Export HR hooks |
| `src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx` | Add "Personalakte" tab |

### Key Patterns to Follow

1. **Storage service:** Follow `crm-correspondence-attachment-service.ts` pattern (3-step upload: getUploadUrl → client upload → confirmUpload)
2. **Service errors:** `HrPersonnelFileNotFoundError`, `HrPersonnelFileValidationError`, `HrPersonnelFileForbiddenError`
3. **Router:** Use `tenantProcedure` (no module guard needed since HR is core), nest `categories`, `entries`, `attachments` sub-routers
4. **Permissions:** Use `permissionIdByKey()` for constants, `requirePermission()` middleware
5. **Tests:** Mock service + use `createCallerFactory`, test permission gates
6. **Hooks:** Use `useTRPC()` pattern with `queryOptions` / `mutationOptions`
7. **Migration:** Date-based naming, next available: `20260408100000`
8. **Prisma models:** Follow existing naming convention with `@@map("table_name")`, `@map("column_name")`
