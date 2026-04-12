# Research: CRM_04 Aufgaben & Nachrichten (Tasks & Messages)

**Date:** 2026-03-17
**Ticket:** `thoughts/shared/tickets/orgAuftrag/TICKET_CRM_04_AUFGABEN.md`

---

## 1. Existing CRM Implementation Patterns

### File Structure

All CRM features follow a consistent pattern across layers:

| Layer | Pattern | Example Files |
|-------|---------|---------------|
| Router | `src/trpc/routers/crm/<name>.ts` | `addresses.ts`, `correspondence.ts`, `inquiries.ts` |
| CRM Router Index | `src/trpc/routers/crm/index.ts` | Merges all CRM sub-routers |
| Service | `src/lib/services/crm-<name>-service.ts` | `crm-inquiry-service.ts` |
| Repository | `src/lib/services/crm-<name>-repository.ts` | `crm-inquiry-repository.ts` |
| Hooks | `src/hooks/use-crm-<name>.ts` | `use-crm-inquiries.ts` |
| UI Components | `src/components/crm/<name>-*.tsx` | `inquiry-list.tsx`, `inquiry-form-sheet.tsx` |
| Page | `src/app/[locale]/(dashboard)/crm/<name>/page.tsx` | `inquiries/page.tsx` |
| Tests (Router) | `src/trpc/routers/__tests__/crm<Name>-router.test.ts` | `crmInquiries-router.test.ts` |
| Tests (Service) | `src/lib/services/__tests__/crm-<name>-service.test.ts` | `crm-inquiry-service.test.ts` |
| E2E Tests | `src/e2e-browser/<num>-crm-<name>.spec.ts` | `22-crm-inquiries.spec.ts` |

### CRM Router Index (`src/trpc/routers/crm/index.ts`)

```ts
import { createTRPCRouter } from "@/trpc/init"
import { crmAddressesRouter } from "./addresses"
import { crmCorrespondenceRouter } from "./correspondence"
import { crmInquiriesRouter } from "./inquiries"
import { numberSequencesRouter } from "./numberSequences"

export const crmRouter = createTRPCRouter({
  addresses: crmAddressesRouter,
  correspondence: crmCorrespondenceRouter,
  inquiries: crmInquiriesRouter,
  numberSequences: numberSequencesRouter,
})
```

The CRM router is registered in `_app.ts` as:
```ts
import { crmRouter } from "./crm"
// ...
crm: crmRouter,
```

New `tasks` sub-router must be added to `src/trpc/routers/crm/index.ts`.

---

## 2. Prisma Schema Patterns

### File: `prisma/schema.prisma`

**Current CRM models (lines ~216-445):**
- `CrmAddressType` enum (line 216)
- `CrmCorrespondenceDirection` enum (line 227)
- `CrmInquiryStatus` enum (line 363)
- `CrmAddress` model (line 264)
- `CrmContact` model (line 312)
- `CrmBankAccount` model (line 343)
- `CrmCorrespondence` model (line 378)
- `CrmInquiry` model (line 415)

**No CrmTask models exist yet** — confirmed via grep.

### Enum pattern

```prisma
enum CrmTaskType {
  TASK
  MESSAGE

  @@map("crm_task_type")
}

enum CrmTaskStatus {
  OPEN
  IN_PROGRESS
  COMPLETED
  CANCELLED

  @@map("crm_task_status")
}
```

Convention: enum name matches PascalCase, `@@map` converts to snake_case.

### Model pattern

All CRM models follow:
- UUID primary key with `@default(dbgenerated("gen_random_uuid()"))`
- `tenantId` mapped to `tenant_id`
- Tenant relation with `onDelete: Cascade`
- `createdAt` / `updatedAt` with `@db.Timestamptz(6)`
- `@@map("crm_table_name")` for table naming
- `@@index` for common query patterns

### Relations that need adding

When adding `CrmTask` and `CrmTaskAssignee`:
1. **Tenant model** (line ~85): Add `crmTasks CrmTask[]` to relations list (after line 182 `crmInquiries`)
2. **CrmAddress model** (line ~264): Add `tasks CrmTask[]` relation
3. **CrmContact model** (line ~312): Add `tasks CrmTask[]` relation
4. **CrmInquiry model** (line ~415): Add `tasks CrmTask[]` relation
5. **Employee model** (line ~807): Add `crmTaskAssignees CrmTaskAssignee[]` relation (after line 905)
6. **Team model** (line ~746): Add `crmTaskAssignees CrmTaskAssignee[]` relation (after line 761)

### Migration pattern

File: `supabase/migrations/20260101000098_create_crm_tasks.sql`

Example from `000097_create_crm_inquiries.sql`:
```sql
-- CRM_03: Inquiry / Vorgang Management

CREATE TYPE crm_inquiry_status AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED', 'CANCELLED');

CREATE TABLE crm_inquiries (
    id               UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID              NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- ... columns ...
    created_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_... UNIQUE (tenant_id, number)
);

CREATE INDEX idx_... ON crm_inquiries(...);
```

The next migration number is **000098**.

---

## 3. tRPC Router Patterns

### File: `src/trpc/routers/crm/inquiries.ts`

Standard CRM router structure:

```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as crmInquiryService from "@/lib/services/crm-inquiry-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const INQ_VIEW = permissionIdByKey("crm_inquiries.view")!
const INQ_CREATE = permissionIdByKey("crm_inquiries.create")!
const INQ_EDIT = permissionIdByKey("crm_inquiries.edit")!
const INQ_DELETE = permissionIdByKey("crm_inquiries.delete")!

// --- Base procedure with module guard ---
const crmProcedure = tenantProcedure.use(requireModule("crm"))

// --- Input Schemas ---
const listInput = z.object({ ... })

// --- Router ---
export const crmInquiriesRouter = createTRPCRouter({
  list: crmProcedure
    .use(requirePermission(INQ_VIEW))
    .input(listInput)
    .query(async ({ ctx, input }) => {
      try {
        return await crmInquiryService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
  // ...
})
```

Key patterns:
- `crmProcedure = tenantProcedure.use(requireModule("crm"))` — all CRM routes require CRM module
- Permission constants via `permissionIdByKey`
- `ctx.prisma as unknown as PrismaClient` cast
- `ctx.tenantId!` non-null assertion (guaranteed by tenantProcedure)
- `ctx.user!.id` for current user ID
- try/catch with `handleServiceError(err)`
- Input schemas defined at file top with `z.object`

### Special note for `myTasks`

The `myTasks` procedure should use `tenantProcedure.use(requireModule("crm"))` without `requirePermission` — any authenticated tenant user can see their own tasks. The user's `employeeId` is available from `ctx.user!.employeeId`.

---

## 4. Service + Repository Pattern

### Service: `src/lib/services/crm-inquiry-service.ts`

```ts
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./crm-inquiry-repository"

// --- Error Classes ---
export class CrmInquiryNotFoundError extends Error {
  constructor(message = "CRM inquiry not found") {
    super(message)
    this.name = "CrmInquiryNotFoundError"
  }
}

export class CrmInquiryValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CrmInquiryValidationError"
  }
}

export class CrmInquiryConflictError extends Error { ... }

// --- Service Functions ---
export async function list(prisma, tenantId, params) { ... }
export async function getById(prisma, tenantId, id) { ... }
export async function create(prisma, tenantId, input, createdById) { ... }
export async function update(prisma, tenantId, input) { ... }
export async function remove(prisma, tenantId, id) { ... }
```

Error classes follow naming convention:
- `CrmTaskNotFoundError` -> maps to `NOT_FOUND` via `handleServiceError`
- `CrmTaskValidationError` -> maps to `BAD_REQUEST`
- `CrmTaskConflictError` -> maps to `CONFLICT`

All service functions take `(prisma, tenantId, ...)` as first two args.

### Repository: `src/lib/services/crm-inquiry-repository.ts`

```ts
import type { PrismaClient, CrmInquiryStatus } from "@/generated/prisma/client"

export async function findMany(prisma, tenantId, params) {
  const where: Record<string, unknown> = { tenantId }
  // ... build where ...
  const [items, total] = await Promise.all([
    prisma.crmInquiry.findMany({ where, orderBy, skip, take, include }),
    prisma.crmInquiry.count({ where }),
  ])
  return { items, total }
}

export async function findById(prisma, tenantId, id) {
  return prisma.crmInquiry.findFirst({ where: { id, tenantId }, include: { ... } })
}

export async function create(prisma, data) {
  return prisma.crmInquiry.create({ data, include: { ... } })
}

export async function update(prisma, tenantId, id, data) {
  await prisma.crmInquiry.updateMany({ where: { id, tenantId }, data })
  return prisma.crmInquiry.findFirst({ where: { id, tenantId }, include: { ... } })
}

export async function remove(prisma, tenantId, id): Promise<boolean> {
  const { count } = await prisma.crmInquiry.deleteMany({ where: { id, tenantId } })
  return count > 0
}
```

Key patterns:
- **Tenant isolation**: All queries include `tenantId` in the where clause
- **Pagination**: `skip: (page - 1) * pageSize, take: pageSize`
- **Update pattern**: `updateMany` (for tenant scoping) then `findFirst` (to return updated record)
- **Delete pattern**: `deleteMany` with tenant scope, return `count > 0`
- **Search pattern**: `OR` with `contains` + `mode: "insensitive"`

### Transaction pattern (for task+assignees)

From `src/lib/services/tariffs-repository.ts`:
```ts
return prisma.$transaction(async (tx) => {
  const created = await tx.tariff.create({ data: ... })
  await tx.tariffWeekPlan.createMany({ data: ... })
  return tx.tariff.findFirst({ where: { id: created.id }, include: { ... } })
})
```

---

## 5. Permission System

### File: `src/lib/auth/permission-catalog.ts`

Permissions are statically defined with deterministic UUIDs:

```ts
const PERMISSION_NAMESPACE = "f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1"

function p(key, resource, action, description): Permission {
  return { id: permissionId(key), key, resource, action, description }
}

export const ALL_PERMISSIONS: Permission[] = [
  // ... existing permissions ...
  // CRM Module
  p("crm_addresses.view", "crm_addresses", "view", "View CRM addresses"),
  // ...
  // CRM Inquiries
  p("crm_inquiries.view", "crm_inquiries", "view", "View CRM inquiries"),
  p("crm_inquiries.create", "crm_inquiries", "create", "Create CRM inquiries"),
  p("crm_inquiries.edit", "crm_inquiries", "edit", "Edit CRM inquiries"),
  p("crm_inquiries.delete", "crm_inquiries", "delete", "Delete CRM inquiries"),
]
```

CRM permissions are grouped together at the end of the array. New `crm_tasks.*` permissions should be added after the CRM Inquiries block (after line 240).

Permissions to add:
```ts
// CRM Tasks
p("crm_tasks.view", "crm_tasks", "view", "View CRM tasks and messages"),
p("crm_tasks.create", "crm_tasks", "create", "Create CRM tasks and messages"),
p("crm_tasks.edit", "crm_tasks", "edit", "Edit CRM tasks and messages"),
p("crm_tasks.delete", "crm_tasks", "delete", "Delete CRM tasks and messages"),
```

### Permission lookup

```ts
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
const TASK_VIEW = permissionIdByKey("crm_tasks.view")!
```

### Authorization middleware

File: `src/lib/auth/middleware.ts`

Usage: `crmProcedure.use(requirePermission(TASK_VIEW))`

---

## 6. Module System

### File: `src/lib/modules/index.ts`

The `requireModule` middleware checks if a module is enabled for the tenant:

```ts
export function requireModule(module: string) {
  return createMiddleware(async ({ ctx, next }) => {
    const enabled = await hasModule(prisma, tenantId, module)
    if (!enabled) {
      throw new TRPCError({ code: "FORBIDDEN", message: `Module "${module}" is not enabled...` })
    }
    return next({ ctx })
  })
}
```

Usage: `const crmProcedure = tenantProcedure.use(requireModule("crm"))`

All CRM tasks procedures must use this middleware.

---

## 7. Notification System

### Model: `Notification` (line 2167 in schema.prisma)

```prisma
model Notification {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String    @map("tenant_id") @db.Uuid
  userId    String    @map("user_id") @db.Uuid
  type      String    @db.VarChar(20)     // "errors", "reminders", "approvals", "system"
  title     String    @db.VarChar(255)
  message   String    @db.Text
  link      String?   @db.Text
  readAt    DateTime? @map("read_at") @db.Timestamptz(6)
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  // ...
}
```

### Creating notifications

Pattern from `src/lib/services/employee-messages-repository.ts`:
```ts
export async function createNotification(prisma, data) {
  return prisma.notification.create({ data })
}
```

Pattern from `src/lib/services/daily-calc.ts`:
```ts
await this.prisma.notification.create({
  data: {
    tenantId,
    userId,
    type: "errors",
    title: "Timesheet error",
    message: `Calculation error detected on ${dateLabel}.`,
    link,
  },
})
```

For CRM tasks, notifications should be created with:
- `type: "reminders"` (for task assignments)
- `userId` from the employee's linked user (`employee.user.id`)
- `link: "/crm/tasks"` or task-specific URL
- Need to resolve employee -> user mapping via `employee.findFirst({ include: { user: true } })`

### User-Employee mapping

The `User` model has `employeeId` (optional, unique) linking to an Employee.
The `Employee` model has a reverse `user User?` relation.

To send notifications for a task assignee (employee), look up the employee's user:
```ts
const employee = await prisma.employee.findFirst({
  where: { id: employeeId, tenantId },
  include: { user: true },
})
if (employee?.user) {
  await prisma.notification.create({
    data: { tenantId, userId: employee.user.id, type: "reminders", title, message }
  })
}
```

For team assignments, expand team members:
```ts
const teamMembers = await prisma.teamMember.findMany({
  where: { teamId },
  include: { employee: { include: { user: true } } },
})
```

---

## 8. UI Component Patterns

### Page structure

Page files are minimal `'use client'` wrappers:

```tsx
// src/app/[locale]/(dashboard)/crm/inquiries/page.tsx
'use client'
import { InquiryList } from "@/components/crm/inquiry-list"

export default function CrmInquiriesPage() {
  return (
    <div className="container mx-auto py-6">
      <InquiryList />
    </div>
  )
}
```

### List component (`inquiry-list.tsx`)

Key patterns:
- `'use client'` directive
- `useTranslations('crmInquiries')` for i18n
- Filter state: `useState` for search, statusFilter, page
- Data fetching via custom hooks: `useCrmInquiries({ search, status, page, pageSize })`
- Table from `@/components/ui/table`
- Row click navigates to detail: `router.push(\`/crm/inquiries/${item.id}\`)`
- Actions via `DropdownMenu` in last column
- Pagination with prev/next buttons
- Form sheet opened via state: `<InquiryFormSheet open={formOpen} ... />`
- Delete via `ConfirmDialog`
- Toast notifications via `sonner`

### Form Sheet (`inquiry-form-sheet.tsx`)

Key patterns:
- Sheet from `@/components/ui/sheet`
- Manual form state with `useState<FormState>`
- `useEffect` to populate form when `editItem` changes
- Form validation inline before submit
- Mutation via hooks: `useCreateCrmInquiry()`, `useUpdateCrmInquiry()`
- `SheetFooter` with Cancel + Submit buttons
- Error display via `Alert`
- Loading spinner via `Loader2` icon

### Status Badge (`inquiry-status-badge.tsx`)

```tsx
const STATUS_CONFIG: Record<string, { icon: typeof CircleDot; variant: ... }> = {
  OPEN: { icon: CircleDot, variant: 'default' },
  IN_PROGRESS: { icon: Loader, variant: 'secondary' },
  CLOSED: { icon: CheckCircle, variant: 'outline' },
  CANCELLED: { icon: XCircle, variant: 'destructive' },
}
```

### Detail page (`inquiry-detail.tsx`)

Key patterns:
- Back button with `ArrowLeft`
- Header with title, badges, action buttons
- Tabs for overview and related data
- Cards with `DetailRow` components
- Multiple dialog states for close/cancel/reopen/delete
- `ConfirmDialog` for destructive actions

### Address detail page tabs

The address detail page (`src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx`) has tabs including:
```tsx
<TabsTrigger value="inquiries">{t('tabInquiries')}</TabsTrigger>
// ...
<TabsContent value="inquiries" className="mt-6">
  <InquiryList addressId={address.id} />
</TabsContent>
```

A new "Tasks" tab should be added here with `<TaskList addressId={address.id} />`.

---

## 9. Hook Patterns

### File: `src/hooks/use-crm-inquiries.ts`

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

interface UseCrmInquiriesOptions {
  enabled?: boolean
  addressId?: string
  search?: string
  status?: "OPEN" | "IN_PROGRESS" | "CLOSED" | "CANCELLED"
  page?: number
  pageSize?: number
}

export function useCrmInquiries(options: UseCrmInquiriesOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.inquiries.list.queryOptions(
      { ...input, page: input.page ?? 1, pageSize: input.pageSize ?? 25 },
      { enabled }
    )
  )
}

export function useCreateCrmInquiry() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.inquiries.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.crm.inquiries.list.queryKey() })
    },
  })
}
```

Key patterns:
- `useTRPC()` from `@/trpc`
- `useQuery` with `trpc.<path>.queryOptions(input, { enabled })`
- `useMutation` with `trpc.<path>.mutationOptions()`
- `onSuccess` invalidates related queries via `queryClient.invalidateQueries`
- Hooks barrel-exported from `src/hooks/index.ts`

### Barrel export (`src/hooks/index.ts`, line ~699)

Add after the CRM Inquiries block:
```ts
// CRM Tasks
export {
  useCrmTasks,
  useMyTasks,
  useCrmTaskById,
  useCreateCrmTask,
  useUpdateCrmTask,
  useCompleteCrmTask,
  useCancelCrmTask,
  useReopenCrmTask,
  useMarkCrmTaskRead,
  useDeleteCrmTask,
} from './use-crm-tasks'
```

---

## 10. Test Patterns

### Router test: `src/trpc/routers/__tests__/crmInquiries-router.test.ts`

```ts
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { crmInquiriesRouter } from "../crm/inquiries"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { createMockContext, createMockSession, createUserWithPermissions, createMockUserTenant } from "./helpers"

// Mock the db module for requireModule
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
    },
  },
}))

const createCaller = createCallerFactory(crmInquiriesRouter)

// Helper: merge module mock with test prisma
function withModuleMock(prisma) {
  return { ...MODULE_MOCK, ...prisma }
}

function createTestContext(prisma, permissions = [all permissions]) {
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

// Tests
describe("crm.inquiries.list", () => {
  it("returns paginated list", async () => {
    const prisma = {
      crmInquiry: {
        findMany: vi.fn().mockResolvedValue([mockInquiry]),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.list({ page: 1, pageSize: 10 })
    expect(result.items).toHaveLength(1)
  })

  it("requires permission", async () => {
    const caller = createCaller(createNoPermContext(prisma))
    await expect(caller.list(...)).rejects.toThrow("Insufficient permissions")
  })
})
```

### Test helpers: `src/trpc/routers/__tests__/helpers.ts`

Key utilities:
- `createMockContext(overrides)` — creates full TRPCContext mock with `autoMockPrisma`
- `createMockUser(overrides)` — user with all default fields
- `createMockSession()` — minimal session
- `createUserWithPermissions(permissionIds, overrides)` — user with specific permissions in UserGroup
- `createMockUserTenant(userId, tenantId)` — for tenant access validation
- `autoMockPrisma(partial)` — Proxy that auto-stubs missing Prisma methods

### Service test: `src/lib/services/__tests__/crm-inquiry-service.test.ts`

```ts
import { describe, it, expect, vi } from "vitest"
import * as service from "../crm-inquiry-service"
import type { PrismaClient } from "@/generated/prisma/client"

function createMockPrisma(overrides = {}) {
  return {
    crmAddress: { findFirst: vi.fn() },
    crmInquiry: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), create: vi.fn(), ... },
    ...overrides,
  } as unknown as PrismaClient
}

describe("crm-inquiry-service", () => {
  describe("create", () => {
    it("creates inquiry", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockAddress)
      // ... setup ...
      const result = await service.create(prisma, TENANT_ID, input, USER_ID)
      expect(result.number).toBe("V-1")
    })
  })
})
```

### E2E test: `src/e2e-browser/22-crm-inquiries.spec.ts`

```ts
import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad } from "./helpers/nav";
import { fillInput, selectOption, submitAndWaitForClose, waitForSheet, expectTableContains, clickTab } from "./helpers/forms";

test.describe.serial("UC-CRM-03: Inquiries", () => {
  test("create an inquiry", async ({ page }) => {
    await navigateTo(page, "/crm/inquiries");
    await page.getByRole("button", { name: "Neue Anfrage" }).click();
    await waitForSheet(page);
    await fillInput(page, "inqTitle", INQUIRY_TITLE);
    await submitAndWaitForClose(page);
    await expect(page.getByText(INQUIRY_TITLE)).toBeVisible({ timeout: 10_000 });
  });
})
```

E2E helpers:
- `navigateTo(page, path)` — navigate and wait for main content
- `waitForSheet(page)` — wait for sheet to open
- `fillInput(page, id, value)` — fill by element ID
- `selectOption(page, label, option)` — select dropdown option
- `submitAndWaitForClose(page)` — click submit and wait for sheet close
- `expectTableContains(page, text)` — verify table row exists
- `clickTab(page, name)` — click a tab

Next E2E test number: **23** (`23-crm-tasks.spec.ts`).

---

## 11. Sidebar Navigation

### File: `src/components/layout/sidebar/sidebar-nav-config.ts`

```ts
export interface NavItem {
  titleKey: string     // Translation key in 'nav' namespace
  href: string
  icon: LucideIcon
  permissions?: string[]
  module?: string
  badge?: number
}

export interface NavSection {
  titleKey: string
  items: NavItem[]
  module?: string
}
```

CRM section (line 275-293):
```ts
{
  titleKey: 'crm',
  module: 'crm',
  items: [
    {
      titleKey: 'crmAddresses',
      href: '/crm/addresses',
      icon: BookOpen,
      module: 'crm',
      permissions: ['crm_addresses.view'],
    },
    {
      titleKey: 'crmInquiries',
      href: '/crm/inquiries',
      icon: FileText,
      module: 'crm',
      permissions: ['crm_inquiries.view'],
    },
  ],
},
```

Add new item for tasks:
```ts
{
  titleKey: 'crmTasks',
  href: '/crm/tasks',
  icon: ClipboardCheck,  // Already imported at line 10
  module: 'crm',
  permissions: ['crm_tasks.view'],
},
```

### Navigation filtering

`sidebar-nav.tsx` filters items by:
1. Module check: `item.module && !enabledModules.has(item.module)` -> hidden
2. Permission check: `check(item.permissions)` -> hidden if no matching permissions

---

## 12. Handbook Structure

### File: `docs/TERP_HANDBUCH.md`

CRM section starts at **## 12. CRM** (line 4105). Each feature follows this structure:

```
### 12.X Feature Name

**Was ist es?** [1-2 sentence description of what the feature is]

**Wozu dient es?** [1-2 sentence description of the purpose]

warning Modul: Das CRM-Modul muss fur den Mandanten aktiviert sein (...)

warning Berechtigung: "[permission description]" (Lesen), "[permission description]" (Schreiben)

pointer Seitenleiste -> **CRM** -> **[Menu Item]**

checkmark Seite mit Titel "...", Tabelle aller ..., Suchfeld und Filter.

#### Feature Liste

Tabelle mit Spalten:

| Spalte | Beschreibung |
|--------|-------------|
| ... | ... |

**Filter:**
- ...

##### Neues [Entity] anlegen

1. pointer **"Neu..."** (oben rechts)
2. checkmark Seitliches Formular (Sheet) offnet sich: "..."
3. Felder ausfuellen:
   - **Feld** (Pflicht/Optional)
4. pointer "Anlegen"
5. checkmark [Result]

##### [Entity] bearbeiten
...

#### [Entity] Details
...
```

The next section number would be **12.10** (after 12.9 Praxisbeispiel). Or it could be integrated as **12.10 Aufgaben & Nachrichten**.

---

## 13. Error Handling Pattern

### File: `src/trpc/errors.ts`

`handleServiceError` maps error class names to tRPC codes:
- `*NotFoundError` -> `NOT_FOUND`
- `*ValidationError` / `*InvalidError` -> `BAD_REQUEST`
- `*ConflictError` / `*DuplicateError` -> `CONFLICT`
- `*ForbiddenError` / `*AccessDeniedError` -> `FORBIDDEN`

For CRM tasks:
```ts
export class CrmTaskNotFoundError extends Error {
  constructor(message = "CRM task not found") { super(message); this.name = "CrmTaskNotFoundError" }
}
export class CrmTaskValidationError extends Error {
  constructor(message: string) { super(message); this.name = "CrmTaskValidationError" }
}
export class CrmTaskConflictError extends Error {
  constructor(message: string) { super(message); this.name = "CrmTaskConflictError" }
}
```

---

## 14. Key Implementation Notes

### User context

From `src/trpc/init.ts`:
- `ctx.user!.id` — user UUID
- `ctx.user!.employeeId` — linked employee UUID (nullable)
- `ctx.tenantId!` — current tenant UUID

### myTasks query logic

The `myTasks` query needs to find tasks where:
1. The user's `employeeId` is directly in `CrmTaskAssignee.employeeId`, OR
2. The user's employee is a member of a team in `CrmTaskAssignee.teamId`

```sql
-- Conceptual query:
SELECT t.* FROM crm_tasks t
JOIN crm_task_assignees a ON a.task_id = t.id
WHERE t.tenant_id = ?
AND (
  a.employee_id = ?  -- direct assignment
  OR a.team_id IN (
    SELECT team_id FROM team_members WHERE employee_id = ?
  )
)
```

### Prisma $transaction for create

When creating a task with assignees, use a transaction:
```ts
return prisma.$transaction(async (tx) => {
  const task = await tx.crmTask.create({ data: taskData })
  if (assignees.length > 0) {
    await tx.crmTaskAssignee.createMany({
      data: assignees.map(a => ({ taskId: task.id, ...a }))
    })
  }
  // Create notifications for each assignee...
  return tx.crmTask.findFirst({ where: { id: task.id }, include: { assignees: true, ... } })
})
```

### JSON attachments

From `crm-correspondence-repository.ts`, nullable JSON fields need special handling:
```ts
import { Prisma } from "@/generated/prisma/client"
const createData = {
  ...data,
  attachments: data.attachments === null ? Prisma.JsonNull : data.attachments,
}
```

### Complete file list for implementation

| # | File | Action |
|---|------|--------|
| 1 | `supabase/migrations/20260101000098_create_crm_tasks.sql` | Create |
| 2 | `prisma/schema.prisma` | Edit (add enums, models, relations) |
| 3 | `src/lib/auth/permission-catalog.ts` | Edit (add 4 permissions) |
| 4 | `src/lib/services/crm-task-repository.ts` | Create |
| 5 | `src/lib/services/crm-task-service.ts` | Create |
| 6 | `src/trpc/routers/crm/tasks.ts` | Create |
| 7 | `src/trpc/routers/crm/index.ts` | Edit (add tasks router) |
| 8 | `src/hooks/use-crm-tasks.ts` | Create |
| 9 | `src/hooks/index.ts` | Edit (add exports) |
| 10 | `src/components/crm/task-list.tsx` | Create |
| 11 | `src/components/crm/task-form-sheet.tsx` | Create |
| 12 | `src/components/crm/task-detail-dialog.tsx` | Create |
| 13 | `src/components/crm/task-assignee-select.tsx` | Create |
| 14 | `src/components/crm/task-status-badge.tsx` | Create |
| 15 | `src/app/[locale]/(dashboard)/crm/tasks/page.tsx` | Create |
| 16 | `src/components/layout/sidebar/sidebar-nav-config.ts` | Edit (add nav item) |
| 17 | `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx` | Edit (add Tasks tab) |
| 18 | `src/trpc/routers/__tests__/crmTasks-router.test.ts` | Create |
| 19 | `src/lib/services/__tests__/crm-task-service.test.ts` | Create |
| 20 | `src/e2e-browser/23-crm-tasks.spec.ts` | Create |
| 21 | `docs/TERP_HANDBUCH.md` | Edit (add section 12.10) |

---

## 15. Translation Keys Needed

Based on patterns from existing CRM translations (`crmInquiries`, `crmAddresses`), new keys should be in namespace `crmTasks`:

Navigation key in `nav` namespace: `crmTasks`

---

## 16. Summary of Conventions

1. **Router**: thin wrapper, delegates to service, wraps in try/catch + handleServiceError
2. **Service**: business logic, throws domain error classes, calls repository
3. **Repository**: pure Prisma queries, tenant-scoped, returns `{ items, total }` for lists
4. **Hooks**: one file per CRM entity, uses `useTRPC()`, invalidates queries on mutation success
5. **UI**: Sheet for forms, Table for lists, Tabs for detail pages, Badge for status
6. **Tests**: Vitest for unit/integration, Playwright for E2E, mock Prisma with vi.fn()
7. **Permissions**: 4 per entity (view, create, edit, delete), deterministic UUIDs
8. **Module guard**: `tenantProcedure.use(requireModule("crm"))` on all CRM routes
9. **Pagination**: `page` + `pageSize` params, return `{ items, total }`
10. **Error mapping**: NotFoundError -> NOT_FOUND, ValidationError -> BAD_REQUEST, ConflictError -> CONFLICT
