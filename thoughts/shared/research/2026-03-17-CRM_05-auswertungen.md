# Research: CRM_05 Auswertungen (CRM Reports/Analytics)

**Date:** 2026-03-17
**Ticket:** TICKET_CRM_05_AUSWERTUNGEN.md
**Status:** Research Complete

---

## 1. Existing CRM Prisma Models

All models are in `/home/tolga/projects/terp/prisma/schema.prisma`.

### CrmAddress (line 265)

```prisma
model CrmAddress {
  id              String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String         @map("tenant_id") @db.Uuid
  number          String         @db.VarChar(50)
  type            CrmAddressType @default(CUSTOMER)     // CUSTOMER | SUPPLIER | BOTH
  company         String         @db.VarChar(255)
  street          String?        @db.VarChar(255)
  zip             String?        @db.VarChar(20)
  city            String?        @db.VarChar(100)
  country         String?        @default("DE") @db.VarChar(10)
  phone           String?        @db.VarChar(50)
  fax             String?        @db.VarChar(50)
  email           String?        @db.VarChar(255)
  website         String?        @db.VarChar(255)
  taxNumber       String?
  vatId           String?
  matchCode       String?
  notes           String?        @db.Text
  paymentTermDays Int?
  discountPercent Float?
  discountDays    Int?
  discountGroup   String?
  priceListId     String?        @db.Uuid
  isActive        Boolean        @default(true)
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  createdById     String?        @db.Uuid

  // Relations
  contacts        CrmContact[]
  bankAccounts    CrmBankAccount[]
  correspondences CrmCorrespondence[]
  inquiries       CrmInquiry[]
  tasks           CrmTask[]

  @@map("crm_addresses")
}
```

**Key fields for reports:**
- `type` (CrmAddressType enum: CUSTOMER, SUPPLIER, BOTH) -- for address distribution stats
- `isActive` -- for active/inactive counts
- `createdAt` -- for "new addresses this month"

### CrmCorrespondence (line 397)

```prisma
model CrmCorrespondence {
  id          String                      @id @db.Uuid
  tenantId    String                      @db.Uuid
  addressId   String                      @db.Uuid
  direction   CrmCorrespondenceDirection  // INCOMING | OUTGOING | INTERNAL
  type        String                      // "phone", "email", "letter", "fax", "visit"
  date        DateTime                    @db.Timestamptz(6)
  contactId   String?                     @db.Uuid
  inquiryId   String?                     @db.Uuid
  fromUser    String?
  toUser      String?
  subject     String
  content     String?
  attachments Json?                       @db.JsonB
  createdAt   DateTime                    @default(now())
  updatedAt   DateTime                    @updatedAt
  createdById String?                     @db.Uuid

  @@index([tenantId, date])
  @@map("crm_correspondences")
}
```

**Key fields for reports:**
- `direction` (CrmCorrespondenceDirection enum: INCOMING, OUTGOING, INTERNAL) -- for direction breakdown
- `type` (string: "phone", "email", "letter", "fax", "visit") -- for type distribution
- `date` -- for time series grouping (day/week/month)

### CrmInquiry (line 434)

```prisma
model CrmInquiry {
  id             String           @id @db.Uuid
  tenantId       String           @db.Uuid
  number         String           @db.VarChar(50)
  title          String           @db.VarChar(255)
  addressId      String           @db.Uuid
  contactId      String?          @db.Uuid
  status         CrmInquiryStatus @default(OPEN)   // OPEN | IN_PROGRESS | CLOSED | CANCELLED
  effort         String?          @db.VarChar(20)   // Gering/Mittel/Hoch
  creditRating   String?
  notes          String?
  orderId        String?          @db.Uuid
  closedAt       DateTime?
  closedById     String?          @db.Uuid
  closingReason  String?
  closingRemarks String?
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt
  createdById    String?          @db.Uuid

  // Relations
  address         CrmAddress
  correspondences CrmCorrespondence[]
  tasks           CrmTask[]

  @@index([tenantId, status])
  @@index([tenantId, addressId])
  @@map("crm_inquiries")
}
```

**Key fields for reports:**
- `status` (CrmInquiryStatus enum: OPEN, IN_PROGRESS, CLOSED, CANCELLED) -- for pipeline chart
- `effort` (string: Gering/Mittel/Hoch) -- for effort distribution
- `createdAt` / `closedAt` -- for avg days to close calculation
- `addressId` -- for top addresses by inquiry count

### CrmTask (line 475)

```prisma
model CrmTask {
  id            String        @id @db.Uuid
  tenantId      String        @db.Uuid
  type          CrmTaskType   @default(TASK)      // TASK | MESSAGE
  subject       String        @db.VarChar(255)
  description   String?
  addressId     String?       @db.Uuid
  contactId     String?       @db.Uuid
  inquiryId     String?       @db.Uuid
  status        CrmTaskStatus @default(OPEN)      // OPEN | IN_PROGRESS | COMPLETED | CANCELLED
  dueAt         DateTime?
  dueTime       String?       @db.VarChar(5)
  durationMin   Int?
  attachments   Json?
  completedAt   DateTime?
  completedById String?       @db.Uuid
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  createdById   String?       @db.Uuid

  assignees CrmTaskAssignee[]

  @@index([tenantId, status])
  @@index([tenantId, dueAt])
  @@map("crm_tasks")
}
```

### CrmTaskAssignee (line 515)

```prisma
model CrmTaskAssignee {
  id         String    @id @db.Uuid
  taskId     String    @db.Uuid
  employeeId String?   @db.Uuid
  teamId     String?   @db.Uuid
  readAt     DateTime?
  createdAt  DateTime  @default(now())

  task     CrmTask
  employee Employee?
  team     Team?

  @@unique([taskId, employeeId])
  @@unique([taskId, teamId])
  @@map("crm_task_assignees")
}
```

**Key fields for reports:**
- `status` (CrmTaskStatus: OPEN, IN_PROGRESS, COMPLETED, CANCELLED) -- completion rate
- `dueAt` / `completedAt` -- overdue detection, avg completion time
- `type` (TASK vs MESSAGE) -- for filtering (reports should focus on TASK type)
- `assignees` -> `employeeId` -- for tasks-by-assignee breakdown

### Enums

```prisma
enum CrmAddressType { CUSTOMER, SUPPLIER, BOTH }
enum CrmCorrespondenceDirection { INCOMING, OUTGOING, INTERNAL }
enum CrmInquiryStatus { OPEN, IN_PROGRESS, CLOSED, CANCELLED }
enum CrmTaskType { TASK, MESSAGE }
enum CrmTaskStatus { OPEN, IN_PROGRESS, COMPLETED, CANCELLED }
```

---

## 2. CRM Router Structure

### Directory: `src/trpc/routers/crm/`

Files:
- `index.ts` -- Merges all CRM sub-routers
- `addresses.ts` -- Address CRUD + contacts + bank accounts
- `correspondence.ts` -- Correspondence CRUD
- `inquiries.ts` -- Inquiry CRUD + status transitions + order linking
- `tasks.ts` -- Task CRUD + status transitions + assignees + my tasks
- `numberSequences.ts` -- Number sequence configuration

### CRM Router Registration (`src/trpc/routers/crm/index.ts`)

```ts
import { createTRPCRouter } from "@/trpc/init"
import { crmAddressesRouter } from "./addresses"
import { crmCorrespondenceRouter } from "./correspondence"
import { crmInquiriesRouter } from "./inquiries"
import { crmTasksRouter } from "./tasks"
import { numberSequencesRouter } from "./numberSequences"

export const crmRouter = createTRPCRouter({
  addresses: crmAddressesRouter,
  correspondence: crmCorrespondenceRouter,
  inquiries: crmInquiriesRouter,
  tasks: crmTasksRouter,
  numberSequences: numberSequencesRouter,
})
```

### Registration in Root Router (`src/trpc/routers/_app.ts`, line 81, 157)

```ts
import { crmRouter } from "./crm"

export const appRouter = createTRPCRouter({
  // ... other routers ...
  crm: crmRouter,
})
```

**Action for CRM_05:** Add `reports: crmReportsRouter` to the `crmRouter` in `src/trpc/routers/crm/index.ts`. No changes needed to `_app.ts` since `crmRouter` is already registered.

---

## 3. Service + Repository Pattern

### Pattern Summary

Each CRM feature follows this architecture:

```
Router (thin)  -->  Service (business logic)  -->  Repository (Prisma queries)
```

- **Router** (`src/trpc/routers/crm/X.ts`): Defines tRPC procedures, validates input with zod, calls service functions, wraps errors with `handleServiceError`
- **Service** (`src/lib/services/crm-X-service.ts`): Business logic, validation, custom error classes
- **Repository** (`src/lib/services/crm-X-repository.ts`): Raw Prisma queries, tenant-scoped

### Key Patterns Observed

**Router Pattern:**
```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as crmXService from "@/lib/services/crm-X-service"
import type { PrismaClient } from "@/generated/prisma/client"

const X_VIEW = permissionIdByKey("crm_X.view")!

const crmProcedure = tenantProcedure.use(requireModule("crm"))

export const crmXRouter = createTRPCRouter({
  someQuery: crmProcedure
    .use(requirePermission(X_VIEW))
    .input(z.object({ ... }))
    .query(async ({ ctx, input }) => {
      try {
        return await crmXService.someFunction(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
```

**Service Pattern:**
```ts
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./crm-X-repository"

// Error classes follow naming convention: CrmXNotFoundError, CrmXValidationError, CrmXConflictError
export class CrmXNotFoundError extends Error {
  constructor(message = "CRM X not found") {
    super(message)
    this.name = "CrmXNotFoundError"
  }
}

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: { ... }
) {
  return repo.findMany(prisma, tenantId, params)
}
```

**Repository Pattern:**
```ts
import type { PrismaClient } from "@/generated/prisma/client"

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params: { ... }
) {
  const where: Record<string, unknown> = { tenantId }
  // Build where clause...
  const [items, total] = await Promise.all([
    prisma.crmX.findMany({ where, orderBy: {...}, skip: ..., take: ... }),
    prisma.crmX.count({ where }),
  ])
  return { items, total }
}
```

**For CRM_05 Reports:** Since this is read-only with no CRUD, the pattern simplifies:
- **No repository needed** -- the service can contain Prisma queries directly (or a repository can be used for consistency)
- **Service functions** will use `prisma.crmX.groupBy()`, `prisma.crmX.count()`, `prisma.crmX.aggregate()`, and `prisma.$queryRaw` (for date_trunc)
- **No error classes needed** (read-only, no not-found/validation/conflict scenarios)

---

## 4. Permission & Module Middleware

### requireModule("crm")

**File:** `src/lib/modules/index.ts`

```ts
export function requireModule(module: string) {
  return createMiddleware(async ({ ctx, next }) => {
    const { tenantId, prisma } = ctx
    if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant ID required" })
    if (module === "core") return next({ ctx })

    const enabled = await hasModule(prisma, tenantId, module)
    if (!enabled) throw new TRPCError({
      code: "FORBIDDEN",
      message: `Module "${module}" is not enabled for this tenant`,
    })
    return next({ ctx })
  })
}
```

Uses `prisma.tenantModule.findUnique({ where: { tenantId_module: { tenantId, module } } })`.

### requirePermission

**File:** `src/lib/auth/middleware.ts`

Usage pattern in all CRM routers:
```ts
const crmProcedure = tenantProcedure.use(requireModule("crm"))

// Then per procedure:
crmProcedure
  .use(requirePermission(permissionIdByKey("crm_addresses.view")!))
  .query(...)
```

### Available CRM Permissions (`src/lib/auth/permission-catalog.ts`, lines 224-246)

```
crm_addresses.view        crm_addresses.create       crm_addresses.edit        crm_addresses.delete
crm_correspondence.view   crm_correspondence.create  crm_correspondence.edit   crm_correspondence.delete
crm_inquiries.view        crm_inquiries.create       crm_inquiries.edit        crm_inquiries.delete
crm_tasks.view            crm_tasks.create           crm_tasks.edit            crm_tasks.delete
```

**For CRM_05 Reports:** Use existing `.view` permissions per the ticket spec. No new permissions needed:
- `crm_addresses.view` for address stats and overview
- `crm_correspondence.view` for correspondence reports
- `crm_inquiries.view` for inquiry pipeline
- `crm_tasks.view` for task completion reports

---

## 5. Recharts Usage

### Package.json Status

**recharts is NOT in package.json.** Despite the ticket saying "already a dependency", it is not installed. The ORD_06 Auswertungen ticket also references recharts.

The only BarChart/chart references in the codebase are:
- `BarChart3` icon from `lucide-react` (used in sidebar nav config and account detail sheet)
- No actual recharts components exist anywhere in the codebase

**Action:** recharts will need to be installed: `pnpm add recharts`

### Existing Chart Patterns

There are no existing chart components to follow. This will be the first use of recharts in the project.

For reference, the NOK-234 year overview research (`thoughts/shared/research/2026-01-26-NOK-234-year-overview.md`) noted: "No chart library is currently installed, but data visualization can be implemented with a simple custom component or by adding recharts/chart.js."

---

## 6. Existing CRM UI Components

### Directory: `src/components/crm/`

22 component files:

**Address components:**
- `address-data-table.tsx` -- Data table for address list
- `address-form-sheet.tsx` -- Create/edit sheet form
- `contact-list.tsx` -- Contacts sub-list
- `contact-form-dialog.tsx` -- Contact create/edit dialog
- `bank-account-list.tsx` -- Bank accounts sub-list
- `bank-account-form-dialog.tsx` -- Bank account create/edit dialog

**Correspondence components:**
- `correspondence-type-badge.tsx` -- Badge for correspondence type
- `correspondence-form-sheet.tsx` -- Create/edit sheet form
- `correspondence-detail-dialog.tsx` -- Detail view dialog
- `correspondence-list.tsx` -- List component

**Inquiry components:**
- `inquiry-status-badge.tsx` -- Status badge
- `inquiry-list.tsx` -- List component
- `inquiry-close-dialog.tsx` -- Close confirmation dialog
- `inquiry-link-order-dialog.tsx` -- Link order dialog
- `inquiry-form-sheet.tsx` -- Create/edit sheet form
- `inquiry-detail.tsx` -- Detail view

**Task components:**
- `task-status-badge.tsx` -- Status badge
- `task-assignee-select.tsx` -- Assignee selector
- `task-form-sheet.tsx` -- Create/edit sheet form
- `task-detail-dialog.tsx` -- Detail dialog
- `task-list.tsx` -- List component

### UI Library Stack

The project uses:
- **shadcn/ui** components (`@/components/ui/`) -- Button, Card, CardContent, Select, Skeleton, Badge, etc.
- **next-intl** for translations (`useTranslations('...')`)
- **lucide-react** for icons
- **sonner** for toast notifications
- **date-fns** for date formatting
- **@tanstack/react-query** for data fetching (via tRPC hooks)

### Page Layout Pattern

CRM pages follow this structure:
```tsx
'use client'

export default function CrmXPage() {
  return (
    <div className="container mx-auto py-6">
      <XList />      // or full inline implementation like addresses page
    </div>
  )
}
```

The addresses page (`src/app/[locale]/(dashboard)/crm/addresses/page.tsx`) is the most elaborate, with inline state management, filters, pagination, and data table. Other CRM pages delegate to a `<XList />` component.

---

## 7. Hooks Pattern

### Files:
- `src/hooks/use-crm-addresses.ts` -- Address + contact + bank account hooks
- `src/hooks/use-crm-correspondence.ts` -- Correspondence hooks
- `src/hooks/use-crm-inquiries.ts` -- Inquiry hooks
- `src/hooks/use-crm-tasks.ts` -- Task hooks

### Pattern for Query Hooks

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

interface UseXOptions {
  enabled?: boolean
  // filter fields...
}

export function useX(options: UseXOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.X.Y.queryOptions(
      { /* input params */ },
      { enabled }
    )
  )
}
```

### Pattern for Mutation Hooks

```ts
export function useCreateX() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.X.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.X.list.queryKey(),
      })
    },
  })
}
```

### Key Import: `useTRPC`

```ts
// src/trpc/index.ts
export { TRPCProvider, useTRPC, useTRPCClient } from "./context"
```

**For CRM_05 Reports:** Only query hooks are needed (no mutations). The hooks will be:
```ts
export function useCrmOverview() {
  const trpc = useTRPC()
  return useQuery(trpc.crm.reports.overview.queryOptions())
}

export function useCrmAddressStats(filters?) {
  const trpc = useTRPC()
  return useQuery(trpc.crm.reports.addressStats.queryOptions(filters ?? {}))
}

// etc. for each report procedure
```

---

## 8. Test Patterns

### Router Tests (`src/trpc/routers/__tests__/`)

Files:
- `crmAddresses-router.test.ts` (333 lines)
- `crmCorrespondence-router.test.ts`
- `crmInquiries-router.test.ts`
- `crmTasks-router.test.ts` (422 lines)

**Pattern:**

```ts
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { crmXRouter } from "../crm/X"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// Mock the db module used by requireModule middleware
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
    },
  },
}))

const X_VIEW = permissionIdByKey("crm_X.view")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(crmXRouter)

// Module mock helper
const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
  },
}

function withModuleMock(prisma: Record<string, unknown>) {
  return { ...MODULE_MOCK, ...prisma }
}

function createTestContext(
  prisma: Record<string, unknown>,
  permissions: string[] = [X_VIEW, ...]
) {
  return createMockContext({
    prisma: withModuleMock(prisma) as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

describe("crm.X.list", () => {
  it("returns data", async () => {
    const prisma = {
      crmX: {
        findMany: vi.fn().mockResolvedValue([...]),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.list({ ... })
    expect(result.items).toHaveLength(1)
  })

  it("requires permission", async () => {
    const prisma = { crmX: { ... } }
    const caller = createCaller(createTestContext(prisma, []))
    await expect(caller.list({ ... })).rejects.toThrow("Insufficient permissions")
  })
})
```

**Test helpers file:** `src/trpc/routers/__tests__/helpers.ts`

Key exports:
- `createMockContext(overrides)` -- Creates TRPCContext with auto-mocked Prisma
- `createMockSession()` -- Creates mock Supabase session
- `createMockUser(overrides)` -- Creates ContextUser
- `createUserWithPermissions(permissionIds, overrides)` -- User with specific permissions
- `createMockUserTenant(userId, tenantId)` -- UserTenant join record
- `autoMockPrisma(partial)` -- Auto-stubs missing Prisma methods

### Service Tests (`src/lib/services/__tests__/`)

Files:
- `crm-correspondence-service.test.ts`
- `crm-inquiry-service.test.ts`
- `crm-task-service.test.ts` (554 lines)

**Pattern:**

```ts
import { describe, it, expect, vi } from "vitest"
import * as service from "../crm-X-service"
import type { PrismaClient } from "@/generated/prisma/client"

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"

function createMockPrisma(overrides = {}) {
  return {
    crmX: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      groupBy: vi.fn(),     // will be needed for reports
      aggregate: vi.fn(),   // will be needed for reports
    },
    // ... other models needed
    $transaction: vi.fn().mockImplementation(async (fn) => fn(txMock)),
    $queryRaw: vi.fn(),     // will be needed for date_trunc
    ...overrides,
  } as unknown as PrismaClient
}

describe("crm-X-service", () => {
  describe("someFunction", () => {
    it("returns correct data", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmX.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([...])

      const result = await service.someFunction(prisma, TENANT_ID, { ... })
      expect(result).toEqual(...)
    })
  })
})
```

### E2E Browser Tests (`src/e2e-browser/`)

Files:
- `20-crm-addresses.spec.ts`
- `21-crm-correspondence.spec.ts`
- `22-crm-inquiries.spec.ts`
- `23-crm-tasks.spec.ts`

**Pattern:**

```ts
import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad } from "./helpers/nav";
import {
  fillInput,
  selectOption,
  submitAndWaitForClose,
  waitForSheet,
  expectTableContains,
  clickTab,
} from "./helpers/forms";

test.describe.serial("UC-CRM-XX: Feature Name", () => {
  test("do something", async ({ page }) => {
    await navigateTo(page, "/crm/reports");
    // Verify elements are visible
    await expect(page.getByText("some text").first()).toBeVisible();
  });
});
```

**Numbering convention:** CRM specs use 20-29 range. The next available number is **24**.

---

## 9. Handbook Structure

**File:** `/home/tolga/projects/terp/docs/TERP_HANDBUCH.md`

### Current CRM Section (Section 12)

The CRM section starts at line 4106 with heading `## 12. CRM -- Kunden- und Lieferantenverwaltung`.

**Current subsections:**
```
12.1  Adressen verwalten
12.2  Kontaktpersonen
12.3  Bankverbindungen
12.4  Nummernkreise
12.5  Korrespondenz
12.6  Praxisbeispiel: Korrespondenz protokollieren
12.7  Praxisbeispiel: Neuen Kunden mit Kontakten und Bankverbindung anlegen
12.8  Anfragen
12.9  Praxisbeispiel: Kundenanfrage anlegen und abschliessen
12.10 Aufgaben & Nachrichten
```

The next subsection should be **12.11 Auswertungen**.

### Section Writing Pattern

Each feature section follows this structure:

1. **What is it?** (bold) -- One-paragraph explanation
2. **Wozu dient es?** (bold) -- Purpose explanation
3. **Module/Permission warnings** -- `(exclamation) Modul:` and `(exclamation) Berechtigung:` lines
4. **Navigation path** -- `(pin) Seitenleiste -> CRM -> X`
5. **Verification check** -- `(check) Seite mit Titel "X", ...`
6. **Feature sections** with `####` headings for sub-features
7. **Tables** for field descriptions: `| Field | Description |`
8. **Step-by-step instructions** with numbered lists

### Appendix: Page Table

The developer page table (line 4975+) needs a new entry:
```
| `/crm/reports` | CRM -> Auswertungen | crm_addresses.view |
```

### Table of Contents

The ToC (line 12-46) needs a new entry:
```
    - [12.11 Auswertungen](#1211-auswertungen)
```

### Glossary (Section 13)

May need a new entry for "Auswertung (CRM)".

---

## 10. CRM Sidebar Navigation

**File:** `/home/tolga/projects/terp/src/components/layout/sidebar/sidebar-nav-config.ts`

### Current CRM Section (lines 275-301)

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
    {
      titleKey: 'crmTasks',
      href: '/crm/tasks',
      icon: ClipboardCheck,
      module: 'crm',
      permissions: ['crm_tasks.view'],
    },
  ],
},
```

### NavItem interface

```ts
interface NavItem {
  titleKey: string          // Translation key in 'nav' namespace
  href: string              // Navigation href
  icon: LucideIcon          // Lucide icon component
  permissions?: string[]    // Required permissions
  module?: string           // Required module
  badge?: number            // Optional badge count
}
```

**Action for CRM_05:** Add a new item after `crmTasks`:
```ts
{
  titleKey: 'crmReports',
  href: '/crm/reports',
  icon: BarChart3,           // Already imported in the file
  module: 'crm',
  permissions: ['crm_addresses.view'],
},
```

Note: `BarChart3` is already imported in the nav config file.

---

## 11. Page Route Pattern

### CRM Page Routes (`src/app/[locale]/(dashboard)/crm/`)

```
crm/
  page.tsx                  -- Redirects to /crm/addresses
  addresses/
    page.tsx                -- Addresses list (full inline)
    [id]/
      page.tsx              -- Address detail
  inquiries/
    page.tsx                -- Inquiries list
    [id]/
      page.tsx              -- Inquiry detail
  tasks/
    page.tsx                -- Tasks list
```

### Simple Page Pattern

```tsx
// src/app/[locale]/(dashboard)/crm/tasks/page.tsx
'use client'
import { TaskList } from "@/components/crm/task-list"

export default function CrmTasksPage() {
  return (
    <div className="container mx-auto py-6">
      <TaskList />
    </div>
  )
}
```

**For CRM_05:** Create `src/app/[locale]/(dashboard)/crm/reports/page.tsx`:
```tsx
'use client'
import { CrmReportsPage } from "@/components/crm/reports-overview"

export default function CrmReportsRoute() {
  return (
    <div className="container mx-auto py-6">
      <CrmReportsPage />
    </div>
  )
}
```

---

## Summary: Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `src/trpc/routers/crm/reports.ts` | tRPC router with 8 query procedures |
| `src/lib/services/crm-report-service.ts` | Service with Prisma aggregation queries |
| `src/hooks/use-crm-reports.ts` | React hooks wrapping report queries |
| `src/app/[locale]/(dashboard)/crm/reports/page.tsx` | Reports page route |
| `src/components/crm/reports-overview.tsx` | Dashboard with KPI cards |
| `src/components/crm/report-address-stats.tsx` | Address distribution charts |
| `src/components/crm/report-correspondence-chart.tsx` | Correspondence time series chart |
| `src/components/crm/report-inquiry-pipeline.tsx` | Inquiry pipeline visualization |
| `src/components/crm/report-task-completion.tsx` | Task completion metrics |
| `src/trpc/routers/__tests__/crmReports-router.test.ts` | Router tests |
| `src/lib/services/__tests__/crm-report-service.test.ts` | Service tests |
| `src/e2e-browser/24-crm-reports.spec.ts` | E2E browser tests |

### Files to Modify

| File | Change |
|------|--------|
| `src/trpc/routers/crm/index.ts` | Add `reports: crmReportsRouter` |
| `src/components/layout/sidebar/sidebar-nav-config.ts` | Add reports nav item to CRM section |
| `docs/TERP_HANDBUCH.md` | Add section 12.11 Auswertungen + glossary + page table entry + ToC entry |

### Package Installation

```bash
pnpm add recharts
```

### Translation Keys Needed

In the `nav` namespace:
- `crmReports` -- "Auswertungen"

In a `crmReports` namespace:
- `title` -- "CRM Auswertungen"
- `subtitle` -- "Berichte und Analysen"
- `overview` -- "Übersicht"
- `totalAddresses` -- "Adressen gesamt"
- `newThisMonth` -- "Neu diesen Monat"
- `openInquiries` -- "Offene Anfragen"
- `pendingTasks` -- "Offene Aufgaben"
- `overdueTasks` -- "Überfällige Aufgaben"
- `correspondenceThisWeek` -- "Korrespondenz diese Woche"
- `addressStats` -- "Adress-Statistik"
- `correspondenceReport` -- "Korrespondenz-Bericht"
- `inquiryPipeline` -- "Anfragen-Pipeline"
- `taskCompletion` -- "Aufgaben-Auswertung"
- Various chart labels and filter labels
