# Research: ORD_01 Belegkette (Billing Document Chain)

Date: 2026-03-17
Ticket: `thoughts/shared/tickets/orgAuftrag/TICKET_ORD_01_BELEGKETTE.md`

---

## 1. Prisma Schema Patterns

### General Model Patterns

All models follow these conventions:
- UUID primary keys: `@id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`
- `tenantId` field: `String @map("tenant_id") @db.Uuid`
- Timestamps: `createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)` and `updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)`
- Column mapping: `camelCase` in Prisma → `snake_case` via `@map`
- Table mapping: `@@map("table_name")` (plural snake_case)
- Indexes: `@@index([tenantId, ...])` with explicit map names
- Unique constraints: `@@unique([tenantId, field], map: "uq_...")`

### Tenant Model (line 85)

```prisma
model Tenant {
  id   String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name String @db.VarChar(255)
  slug String @unique @db.VarChar(100)
  // ... many fields ...

  // Relations — extensive list of reverse relations
  orders       Order[]
  crmAddresses CrmAddress[]
  crmInquiries CrmInquiry[]
  // etc.

  @@map("tenants")
}
```

**Key:** New models MUST add a reverse relation to Tenant. Currently has `crmAddresses`, `crmContacts`, `crmBankAccounts`, `crmCorrespondences`, `crmInquiries`, `crmTasks`, `numberSequences`, `tenantModules`, `orders`.

Needs to add: `billingDocuments BillingDocument[]`

### NumberSequence Model (line 243)

```prisma
model NumberSequence {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  key       String   @db.VarChar(50)
  prefix    String   @default("") @db.VarChar(20)
  nextValue Int      @default(1) @map("next_value")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, key], map: "uq_number_sequences_tenant_key")
  @@index([tenantId], map: "idx_number_sequences_tenant_id")
  @@map("number_sequences")
}
```

### CrmAddress Model (line 265)

```prisma
model CrmAddress {
  id              String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String         @map("tenant_id") @db.Uuid
  number          String         @db.VarChar(50)
  type            CrmAddressType @default(CUSTOMER)
  company         String         @db.VarChar(255)
  // ... address fields, payment terms ...
  paymentTermDays Int?           @map("payment_term_days")
  discountPercent Float?         @map("discount_percent")
  discountDays    Int?           @map("discount_days")
  discountGroup   String?        @map("discount_group") @db.VarChar(50)

  tenant          Tenant               @relation(...)
  contacts        CrmContact[]
  bankAccounts    CrmBankAccount[]
  correspondences CrmCorrespondence[]
  inquiries       CrmInquiry[]
  tasks           CrmTask[]

  @@unique([tenantId, number], map: "uq_crm_addresses_tenant_number")
  @@map("crm_addresses")
}
```

**Needs added:** Reverse relations for BillingDocument:
- `billingDocuments BillingDocument[]` (primary address)
- `billingDocumentsDelivery BillingDocument[]` (delivery address via named relation "DeliveryAddress")
- `billingDocumentsInvoice BillingDocument[]` (invoice address via named relation "InvoiceAddress")

### CrmContact Model (line 314)

```prisma
model CrmContact {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId   String   @map("tenant_id") @db.Uuid
  addressId  String   @map("address_id") @db.Uuid
  // ... name, contact info ...

  tenant          Tenant              @relation(...)
  address         CrmAddress          @relation(...)
  correspondences CrmCorrespondence[]
  inquiries       CrmInquiry[]
  tasks           CrmTask[]

  @@map("crm_contacts")
}
```

**Needs added:** `billingDocuments BillingDocument[]`

### CrmInquiry Model (line 434)

```prisma
model CrmInquiry {
  id             String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId       String           @map("tenant_id") @db.Uuid
  number         String           @db.VarChar(50)
  title          String           @db.VarChar(255)
  addressId      String           @map("address_id") @db.Uuid
  contactId      String?          @map("contact_id") @db.Uuid
  status         CrmInquiryStatus @default(OPEN)
  orderId        String?          @map("order_id") @db.Uuid
  // ... closing fields ...

  tenant          Tenant              @relation(...)
  address         CrmAddress          @relation(...)
  contact         CrmContact?         @relation(...)
  order           Order?              @relation(...)
  correspondences CrmCorrespondence[]
  tasks           CrmTask[]

  @@unique([tenantId, number])
  @@map("crm_inquiries")
}
```

**Needs added:** `billingDocuments BillingDocument[]`

### Order Model (line 1273)

```prisma
model Order {
  id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId           String    @map("tenant_id") @db.Uuid
  code               String    @db.VarChar(50)
  name               String    @db.VarChar(255)
  status             String    @default("active") @db.VarChar(20)
  customer           String?   @db.VarChar(255)
  // ...

  tenant              Tenant            @relation(...)
  assignments         OrderAssignment[]
  defaultForEmployees Employee[]
  orderBookings       OrderBooking[]
  crmInquiries        CrmInquiry[]

  @@unique([tenantId, code])
  @@map("orders")
}
```

**Needs added:** `billingDocuments BillingDocument[]`

### Existing Enum Patterns

```prisma
enum CrmAddressType {
  CUSTOMER
  SUPPLIER
  BOTH
  @@map("crm_address_type")
}

enum CrmInquiryStatus {
  OPEN
  IN_PROGRESS
  CLOSED
  CANCELLED
  @@map("crm_inquiry_status")
}

enum CrmTaskType {
  TASK
  MESSAGE
  @@map("crm_task_type")
}
```

Pattern: UPPER_SNAKE_CASE values, `@@map("snake_case_name")`.

### Migration Numbering

Latest migration: `20260101000098_create_crm_tasks.sql`
Next migration: `20260101000099_create_billing_documents.sql`

### Migration SQL Pattern (from 000098)

```sql
-- CRM_04: Tasks & Messages
CREATE TYPE crm_task_type AS ENUM ('TASK', 'MESSAGE');
CREATE TYPE crm_task_status AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

CREATE TABLE crm_tasks (
    id               UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID              NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type             crm_task_type     NOT NULL DEFAULT 'TASK',
    subject          VARCHAR(255)      NOT NULL,
    -- ... columns ...
    created_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_crm_tasks_tenant_status ON crm_tasks(tenant_id, status);
-- ... more indexes ...

-- Trigger for updated_at
CREATE TRIGGER set_crm_tasks_updated_at
  BEFORE UPDATE ON crm_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

Pattern: CREATE TYPE → CREATE TABLE → CREATE INDEX → CREATE TRIGGER for updated_at.

---

## 2. Service + Repository Architecture

### Service Pattern (crm-address-service.ts)

```typescript
import type { PrismaClient, CrmAddressType } from "@/generated/prisma/client"
import * as repo from "./crm-address-repository"
import * as numberSeqService from "./number-sequence-service"

// --- Error Classes ---
export class CrmAddressNotFoundError extends Error {
  constructor(message = "CRM address not found") {
    super(message)
    this.name = "CrmAddressNotFoundError"
  }
}
export class CrmAddressValidationError extends Error { /* ... */ }
export class CrmAddressConflictError extends Error { /* ... */ }

// --- Service Functions (exported, stateless) ---
export async function list(prisma: PrismaClient, tenantId: string, params: {...}) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(prisma: PrismaClient, tenantId: string, id: string) {
  const item = await repo.findById(prisma, tenantId, id)
  if (!item) throw new CrmAddressNotFoundError()
  return item
}

export async function create(prisma: PrismaClient, tenantId: string, input: {...}, createdById: string) {
  // Validation
  // Number generation via numberSeqService.getNextNumber(prisma, tenantId, "key")
  return repo.create(prisma, { tenantId, number, ...data })
}

export async function update(prisma: PrismaClient, tenantId: string, input: { id: string; ...fields }) {
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) throw new CrmAddressNotFoundError()
  // Build data object, only include defined fields
  return repo.update(prisma, tenantId, input.id, data)
}

export async function remove(prisma: PrismaClient, tenantId: string, id: string) {
  // Soft-delete or hard-delete
}
```

**Key patterns:**
- All functions take `prisma: PrismaClient` and `tenantId: string` as first two args
- Error classes follow naming: `{Entity}NotFoundError`, `{Entity}ValidationError`, `{Entity}ConflictError`
- Error class names end with recognized suffixes for `handleServiceError`
- Number generation: `numberSeqService.getNextNumber(prisma, tenantId, "key")`
- Validation happens in service, data access in repository

### Repository Pattern (crm-address-repository.ts)

```typescript
import type { PrismaClient, CrmAddressType } from "@/generated/prisma/client"

export async function findMany(prisma: PrismaClient, tenantId: string, params: {...}) {
  const where: Record<string, unknown> = { tenantId }
  // Build where clause from params
  const [items, total] = await Promise.all([
    prisma.model.findMany({ where, orderBy, skip, take }),
    prisma.model.count({ where }),
  ])
  return { items, total }
}

export async function findById(prisma: PrismaClient, tenantId: string, id: string) {
  return prisma.model.findFirst({
    where: { id, tenantId },
    include: { /* relations */ },
  })
}

export async function create(prisma: PrismaClient, data: {...}) {
  return prisma.model.create({ data })
}

export async function update(prisma: PrismaClient, tenantId: string, id: string, data: Record<string, unknown>) {
  // Using updateMany for tenant scoping, then fetch
  await prisma.model.updateMany({ where: { id, tenantId }, data })
  return prisma.model.findFirst({ where: { id, tenantId }, include: { ... } })
}

export async function remove(prisma: PrismaClient, tenantId: string, id: string): Promise<boolean> {
  const { count } = await prisma.model.deleteMany({ where: { id, tenantId } })
  return count > 0
}
```

**Key patterns:**
- `findMany` returns `{ items, total }` using `Promise.all([findMany, count])`
- `findById` uses `findFirst` with `{ id, tenantId }` and includes relations
- `update` uses `updateMany` for tenant scoping then re-fetches
- No classes — pure functions

### Number Sequence Service (number-sequence-service.ts)

```typescript
const DEFAULT_PREFIXES: Record<string, string> = {
  customer: "K-",
  supplier: "L-",
  inquiry: "V-",
}

export async function getNextNumber(prisma: PrismaClient, tenantId: string, key: string): Promise<string> {
  const defaultPrefix = DEFAULT_PREFIXES[key] ?? ""
  const seq = await prisma.numberSequence.upsert({
    where: { tenantId_key: { tenantId, key } },
    update: { nextValue: { increment: 1 } },
    create: { tenantId, key, prefix: defaultPrefix, nextValue: 2 },
  })
  const value = seq.nextValue - 1
  return `${seq.prefix}${value}`
}
```

**For billing documents, the DEFAULT_PREFIXES map needs to be extended with:**
```typescript
offer: "A-",
order_confirmation: "AB-",
delivery_note: "L-",    // Note: conflicts with supplier prefix!
service_note: "LS-",
return_delivery: "R-",
invoice: "RE-",
credit_note: "G-",
```

**Important:** The "L-" prefix for delivery_note would conflict with the existing "L-" for supplier. The ticket says prefix "L" for Lieferschein. Need separate keys e.g. `billing_delivery_note` or `delivery_note` vs `supplier`.

### CRM Inquiry Service (for reference on status workflow + Order integration)

Key patterns from `crm-inquiry-service.ts`:
- Status workflow: OPEN -> IN_PROGRESS -> CLOSED/CANCELLED, with reopen
- Auto-transition: OPEN -> IN_PROGRESS on first update
- Linked order creation: generates `code`, calls `orderService.create()`
- Close with optional linked order close
- Validation: address belongs to tenant, contact belongs to address

---

## 3. tRPC Router Patterns

### init.ts — Procedure Types

```typescript
export const publicProcedure = t.procedure           // No auth
export const protectedProcedure = t.procedure.use()  // Requires auth (user + session)
export const tenantProcedure = protectedProcedure.use() // Requires auth + tenantId + user has access
```

### Router Pattern (crm/addresses.ts)

```typescript
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as crmAddressService from "@/lib/services/crm-address-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Permission Constants ---
const CRM_VIEW = permissionIdByKey("crm_addresses.view")!
const CRM_CREATE = permissionIdByKey("crm_addresses.create")!
const CRM_EDIT = permissionIdByKey("crm_addresses.edit")!
const CRM_DELETE = permissionIdByKey("crm_addresses.delete")!

// --- Base procedure with module guard ---
const crmProcedure = tenantProcedure.use(requireModule("crm"))

// --- Router ---
export const crmAddressesRouter = createTRPCRouter({
  list: crmProcedure
    .use(requirePermission(CRM_VIEW))
    .input(z.object({ /* zod schema */ }))
    .query(async ({ ctx, input }) => {
      try {
        return await crmAddressService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: crmProcedure
    .use(requirePermission(CRM_CREATE))
    .input(z.object({ /* zod schema */ }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmAddressService.create(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          ctx.user!.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
  // ... update, delete follow same pattern
})
```

**Key patterns:**
- `ctx.prisma as unknown as PrismaClient` cast (due to extended Prisma type)
- `ctx.tenantId!` non-null assertion (guaranteed by tenantProcedure)
- `ctx.user!.id` for createdById
- try/catch with `handleServiceError(err)` on every procedure
- Module guard: `tenantProcedure.use(requireModule("crm"))` — billing would use `requireModule("billing")`
- Permission constants derived from `permissionIdByKey("key")!`
- Mutations use `.mutation()`, reads use `.query()`
- Delete returns `{ success: true }`

### CRM Router Index (crm/index.ts)

```typescript
import { createTRPCRouter } from "@/trpc/init"
import { crmAddressesRouter } from "./addresses"
import { crmInquiriesRouter } from "./inquiries"
// ...

export const crmRouter = createTRPCRouter({
  addresses: crmAddressesRouter,
  inquiries: crmInquiriesRouter,
  // ...
})
```

### Root Router Registration (_app.ts)

```typescript
import { crmRouter } from "./crm"
export const appRouter = createTRPCRouter({
  crm: crmRouter,
  // ...
})
```

**For billing:** Create `src/trpc/routers/billing/index.ts` with `billingRouter`, then add to _app.ts as `billing: billingRouter`.

### handleServiceError (errors.ts)

Maps domain errors to tRPC errors by checking error class name suffix:
- `*NotFoundError` → `NOT_FOUND`
- `*ValidationError` / `*InvalidError` → `BAD_REQUEST`
- `*ConflictError` / `*DuplicateError` → `CONFLICT`
- `*ForbiddenError` / `*AccessDeniedError` → `FORBIDDEN`
- Prisma P2025 → NOT_FOUND, P2002 → CONFLICT, P2003 → BAD_REQUEST

---

## 4. Permission Catalog

**File:** `src/lib/auth/permission-catalog.ts`

```typescript
const PERMISSION_NAMESPACE = "f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1"

function p(key: string, resource: string, action: string, description: string): Permission {
  return { id: permissionId(key), key, resource, action, description }
}

export const ALL_PERMISSIONS: Permission[] = [
  // Core
  p("employees.view", "employees", "view", "View employee records"),
  // ...

  // CRM Module
  p("crm_addresses.view", "crm_addresses", "view", "View CRM addresses"),
  p("crm_addresses.create", "crm_addresses", "create", "Create CRM addresses"),
  p("crm_addresses.edit", "crm_addresses", "edit", "Edit CRM addresses"),
  p("crm_addresses.delete", "crm_addresses", "delete", "Delete CRM addresses"),
  // ... same pattern for crm_correspondence, crm_inquiries, crm_tasks
]
```

**For billing documents, add:**
```typescript
p("billing_documents.view", "billing_documents", "view", "View billing documents"),
p("billing_documents.create", "billing_documents", "create", "Create billing documents"),
p("billing_documents.edit", "billing_documents", "edit", "Edit billing documents"),
p("billing_documents.delete", "billing_documents", "delete", "Delete billing documents"),
p("billing_documents.print", "billing_documents", "print", "Print/finalize billing documents"),
```

Comment in file says "All 48 permissions" — update comment after adding.

Lookup maps at bottom auto-build from ALL_PERMISSIONS:
```typescript
const byId = new Map<string, Permission>()
const byKey = new Map<string, Permission>()
```

---

## 5. Module System

**File:** `src/lib/modules/index.ts`

```typescript
export function requireModule(module: string) {
  return createMiddleware(async ({ ctx, next }) => {
    if (module === "core") return next({ ctx })
    const enabled = await hasModule(prisma, tenantId, module)
    if (!enabled) throw new TRPCError({ code: "FORBIDDEN", message: `Module "${module}" is not enabled...` })
    return next({ ctx })
  })
}
```

**Constants file:** `src/lib/modules/constants.ts`
```typescript
export const AVAILABLE_MODULES = ["core", "crm", "billing", "warehouse"] as const
export type ModuleId = (typeof AVAILABLE_MODULES)[number]
```

**"billing" module already exists** in the constants. Just need to use `requireModule("billing")` in the billing router.

The module check queries `tenant_modules` table (TenantModule model). The module is enabled when a row exists with `{ tenantId, module: "billing" }`.

---

## 6. Test Patterns

### Router Tests (crmInquiries-router.test.ts)

```typescript
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { crmInquiriesRouter } from "../crm/inquiries"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { createMockContext, createMockSession, createUserWithPermissions, createMockUserTenant } from "./helpers"

// Mock the db module used by requireModule middleware
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
    },
  },
}))

// Mock external services
vi.mock("@/lib/services/order-service", () => ({
  create: vi.fn().mockResolvedValue({...}),
  update: vi.fn().mockResolvedValue({}),
}))

const createCaller = createCallerFactory(crmInquiriesRouter)

// --- Helpers ---
const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
  },
}

function withModuleMock(prisma: Record<string, unknown>) {
  return { ...MODULE_MOCK, ...prisma }
}

function createTestContext(prisma, permissions = [ALL_PERMS]) {
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
    await expect(caller.list({...})).rejects.toThrow("Insufficient permissions")
  })
})
```

**Key patterns:**
- Mock `@/lib/db` for requireModule middleware
- Mock external service deps with `vi.mock()`
- `createCallerFactory(router)` → `createCaller(ctx)` → call procedures directly
- `MODULE_MOCK` with `tenantModule.findUnique` returning the module
- Permission tests: create context with empty permissions, expect "Insufficient permissions"
- Each test creates its own prisma mock with only the needed methods

### Service Tests (crm-inquiry-service.test.ts)

```typescript
import { describe, it, expect, vi } from "vitest"
import * as service from "../crm-inquiry-service"
import type { PrismaClient } from "@/generated/prisma/client"

function createMockPrisma(overrides = {}) {
  return {
    crmAddress: { findFirst: vi.fn() },
    crmInquiry: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    numberSequence: { upsert: vi.fn() },
    // ...
    ...overrides,
  } as unknown as PrismaClient
}

describe("crm-inquiry-service", () => {
  describe("create", () => {
    it("creates with auto-generated number", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockAddress)
      ;(prisma.numberSequence.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ prefix: "V-", nextValue: 2 })
      ;(prisma.crmInquiry.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockInquiry)

      const result = await service.create(prisma, TENANT_ID, { title: "Test", addressId: ADDRESS_ID }, USER_ID)
      expect(result.number).toBe("V-1")
    })
  })
})
```

**Key patterns:**
- Mock prisma as plain object with vi.fn() methods
- Cast to PrismaClient via `as unknown as PrismaClient`
- Test service functions directly (no router overhead)
- Mock return values with `.mockResolvedValue()` / `.mockResolvedValueOnce()`

### Test Helpers (src/trpc/routers/__tests__/helpers.ts)

Available helpers:
- `autoMockPrisma(partial)` — Proxy that auto-stubs missing methods
- `createMockUser(overrides)` — Creates mock ContextUser
- `createMockSession()` — Creates mock Session
- `createMockContext(overrides)` — Creates mock TRPCContext (auto-wraps prisma with autoMockPrisma)
- `createMockUserGroup(overrides)` — Creates mock UserGroup
- `createAdminUser(overrides)` — Mock admin user
- `createUserWithPermissions(permissionIds, overrides)` — Mock user with specific permissions
- `createMockTenant(overrides)` — Creates mock Tenant
- `createMockUserTenant(userId, tenantId, tenant?)` — Creates mock UserTenant with tenant

### E2E Browser Tests

**Config:** `playwright.config.ts`
- `testDir: "src/e2e-browser"`, workers: 1, fullyParallel: false
- Base URL: `http://localhost:3001`
- Locale: `de-DE`
- Viewport: `{ width: 1280, height: 1080 }`
- Auth setup project saves to `.auth/admin.json`

**Global Setup:** `src/e2e-browser/global-setup.ts`
- Runs SQL cleanup before test suite via `psql` command
- Deletes E2E-prefixed data (company names like 'E2E%', codes like 'E2E%')
- Resets number sequences to safe values (next_value >= 100)
- Pattern: DELETE child records (FK deps) → DELETE parent records → reset sequences

**Helpers:**
- `helpers/auth.ts`: `loginAsAdmin(page)`, `loginAsUser(page)`, `login(page, email, password)`, SEED constants
- `helpers/nav.ts`: `navigateTo(page, path)`, `waitForTableLoad(page)`, `expectPageTitle(page, title)`
- `helpers/forms.ts`: `fillInput(page, id, value)`, `selectOption(page, label, optionText)`, `submitAndWaitForClose(page)`, `waitForSheet(page)`, `expectTableContains(page, text)`, `clickTab(page, name)`

**Test Pattern (22-crm-inquiries.spec.ts):**
```typescript
import { test, expect } from "@playwright/test";
import { navigateTo, waitForTableLoad } from "./helpers/nav";
import { fillInput, selectOption, submitAndWaitForClose, waitForSheet, expectTableContains, clickTab } from "./helpers/forms";

test.describe.serial("UC-CRM-03: Inquiries", () => {
  test("create address with contact for inquiry tests", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    await page.getByRole("button", { name: "Neue Adresse" }).click();
    await waitForSheet(page);
    await fillInput(page, "company", COMPANY);
    await submitAndWaitForClose(page);
    await expectTableContains(page, COMPANY);
  });

  test("create an inquiry from address detail tab", async ({ page }) => {
    await navigateTo(page, "/crm/addresses");
    // ... click row, navigate to detail, click tab, fill form, submit
  });
});
```

**Naming:** Files are numbered: `20-crm-addresses.spec.ts`, `21-crm-correspondence.spec.ts`, `22-crm-inquiries.spec.ts`, `23-crm-tasks.spec.ts`, `24-crm-reports.spec.ts`. Billing documents would be `30-billing-documents.spec.ts`.

---

## 7. UI Component Patterns

### Component Structure

Files in `src/components/crm/`:
- `inquiry-list.tsx` — Data table with filters, pagination, actions
- `inquiry-form-sheet.tsx` — Side sheet form for create/edit
- `inquiry-detail.tsx` — Full detail page with tabs
- `inquiry-status-badge.tsx` — Status badge component
- `inquiry-close-dialog.tsx` — Close confirmation dialog
- `inquiry-link-order-dialog.tsx` — Order linking dialog

### List Component Pattern (inquiry-list.tsx)

```tsx
'use client'
import { useCrmInquiries, useDeleteCrmInquiry } from '@/hooks'
import { useTranslations } from 'next-intl'
import { Table, TableBody, ... } from '@/components/ui/table'

export function InquiryList({ addressId }: InquiryListProps) {
  const t = useTranslations('crmInquiries')
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [page, setPage] = React.useState(1)

  const { data, isLoading } = useCrmInquiries({ addressId, search, status, page, pageSize })

  return (
    <div className="space-y-4">
      {/* Header with title + "New" button */}
      {/* Filters: search input + status select */}
      {/* Table with columns, row click navigates to detail */}
      {/* Pagination */}
      {/* Form Sheet (create/edit) */}
      {/* Delete ConfirmDialog */}
    </div>
  )
}
```

### Detail Component Pattern (inquiry-detail.tsx)

```tsx
'use client'
export function InquiryDetail({ id }: { id: string }) {
  const t = useTranslations('crmInquiries')
  const router = useRouter()
  const { data: inquiry, isLoading } = useCrmInquiryById(id)

  // Dialog states for edit, close, cancel, reopen, delete
  // Mutation hooks for cancel, reopen, delete

  return (
    <div className="space-y-6">
      {/* Header: back button, title, number badge, status badge, action buttons */}
      {/* Immutable notice (Alert) when closed */}
      {/* Tabs: Overview, Correspondence, Tasks */}
      {/* Tab content: Cards with DetailRow components */}
      {/* Dialogs: FormSheet, CloseDialog, ConfirmDialogs */}
    </div>
  )
}
```

### App Router Pages

Pattern: `src/app/[locale]/(dashboard)/crm/inquiries/page.tsx` and `src/app/[locale]/(dashboard)/crm/inquiries/[id]/page.tsx`

For billing: `src/app/[locale]/(dashboard)/orders/documents/page.tsx`, `[id]/page.tsx`, `new/page.tsx`

---

## 8. Hooks Pattern

**File:** `src/hooks/use-crm-inquiries.ts`

```typescript
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useCrmInquiries(options = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.inquiries.list.queryOptions({ ...input, page: input.page ?? 1, pageSize: input.pageSize ?? 25 }, { enabled })
  )
}

export function useCrmInquiryById(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.inquiries.getById.queryOptions({ id }, { enabled: enabled && !!id })
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

// Similar for update, close, cancel, reopen, delete — all invalidate list + getById
```

**Pattern:** Each mutation invalidates the list query key and the getById query key.

---

## 9. Handbook Structure

**File:** `docs/TERP_HANDBUCH.md` (V2, 5119 lines, German language)

### Structure Pattern

Each section follows:
```markdown
### 12.8 Anfragen

**Was ist es?** [1-2 sentence description of what it is]

**Wozu dient es?** [1-2 sentence description of purpose/value]

⚠️ Modul: [module requirement with navigation path]

⚠️ Berechtigung: [permission requirements]

📍 [navigation path]

✅ [what user sees on the page]

#### [Feature] Liste

Tabelle mit Spalten:

| Spalte | Beschreibung |
|--------|-------------|
| **Nummer** | ... |
| **Titel** | ... |

**Filter:**
- **Suchfeld**: ...
- **Status-Filter**: ...

##### [Action: Neu anlegen]

1. 📍 **"Button text"** (position)
2. ✅ Sheet/Dialog opens
3. Fill fields: **Field** (type, required/optional)
4. 📍 "Submit button"
5. ✅ Expected result

##### [Action: Bearbeiten]
// ... same numbered step pattern

#### [Feature] Details

📍 Navigation path
✅ What user sees

[Tabs description]
[Cards with fields tables]

#### Status-Workflow (if applicable)

| Status | Badge | Bedeutung |
|--------|-------|-----------|

**Aktionen auf der Detailseite:**

| Aktion | Button | Bedingung |
|--------|--------|-----------|
```

### Current Table of Contents

The handbook currently has sections 1-13 (Glossar). CRM is section 12.
A new billing section should be **section 13** (pushing Glossar to 14), or could be a subsection of 12, or a new top-level section.

The ticket says the handbook should be extended. The most logical placement is as a new section after CRM (section 13: "Belege & Fakturierung" or "Auftragsbelege"), renumbering Glossar to 14.

### Language Notes
- Written entirely in German
- Uses formal "Sie" address
- Technical terms: Beleg (document), Belegkette (document chain), Angebot (offer), Auftragsbestätigung (order confirmation), Lieferschein (delivery note), Leistungsschein (service note), Rücklieferung (return delivery), Rechnung (invoice), Gutschrift (credit note)
- Navigation uses emoji markers: 📍 (path), ✅ (check), ⚠️ (warning), 💡 (hint)

---

## 10. Existing Relations & Reverse Relations Needed

### Models That Need Reverse Relations Added

| Model | Relation Name | Type | Description |
|-------|-------------|------|-------------|
| **Tenant** | `billingDocuments` | `BillingDocument[]` | All billing docs for tenant |
| **CrmAddress** | `billingDocuments` | `BillingDocument[]` | Primary address documents |
| **CrmAddress** | `billingDocumentsDelivery` | `BillingDocument[]` | As delivery address (named relation) |
| **CrmAddress** | `billingDocumentsInvoice` | `BillingDocument[]` | As invoice address (named relation) |
| **CrmContact** | `billingDocuments` | `BillingDocument[]` | Contact's documents |
| **CrmInquiry** | `billingDocuments` | `BillingDocument[]` | Documents linked to inquiry |
| **Order** | `billingDocuments` | `BillingDocument[]` | Documents linked to Terp order |

### Self-Referencing Relation on BillingDocument

```prisma
parentDocument   BillingDocument?    @relation("DocumentChain", fields: [parentDocumentId], references: [id], onDelete: SetNull)
childDocuments   BillingDocument[]   @relation("DocumentChain")
```

---

## 11. Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260101000099_create_billing_documents.sql` | DB migration |
| `src/lib/services/billing-document-service.ts` | Business logic |
| `src/lib/services/billing-document-repository.ts` | Data access |
| `src/lib/services/billing-document-position-service.ts` | Position logic |
| `src/lib/services/billing-document-pdf-service.ts` | PDF generation |
| `src/trpc/routers/billing/documents.ts` | tRPC router |
| `src/trpc/routers/billing/index.ts` | Billing router index |
| `src/hooks/use-billing-documents.ts` | React hooks |
| `src/components/billing/document-list.tsx` | List view |
| `src/components/billing/document-form.tsx` | Create/edit form |
| `src/components/billing/document-detail.tsx` | Detail view |
| `src/components/billing/document-position-table.tsx` | Positions table |
| `src/components/billing/document-position-row.tsx` | Position row |
| `src/components/billing/document-forward-dialog.tsx` | Forward dialog |
| `src/components/billing/document-print-dialog.tsx` | Print dialog |
| `src/components/billing/document-type-badge.tsx` | Type badge |
| `src/components/billing/document-status-badge.tsx` | Status badge |
| `src/components/billing/document-totals-summary.tsx` | Totals display |
| `src/app/[locale]/(dashboard)/orders/documents/page.tsx` | List page |
| `src/app/[locale]/(dashboard)/orders/documents/[id]/page.tsx` | Detail page |
| `src/app/[locale]/(dashboard)/orders/documents/new/page.tsx` | Create page |
| `src/trpc/routers/__tests__/billingDocuments-router.test.ts` | Router tests |
| `src/lib/services/__tests__/billing-document-service.test.ts` | Service tests |
| `src/e2e-browser/30-billing-documents.spec.ts` | E2E tests |

### Modified Files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add enums, BillingDocument, BillingDocumentPosition models; add reverse relations to Tenant, CrmAddress, CrmContact, CrmInquiry, Order |
| `src/lib/auth/permission-catalog.ts` | Add 5 billing_documents permissions |
| `src/lib/services/number-sequence-service.ts` | Add DEFAULT_PREFIXES for billing document types |
| `src/trpc/routers/_app.ts` | Import and register billingRouter |
| `src/e2e-browser/global-setup.ts` | Add billing document cleanup SQL |
| `docs/TERP_HANDBUCH.md` | Add section 13 for billing documents |

---

## 12. Additional Technical Notes

### Prisma Type Cast Pattern

Every router uses this pattern because the tRPC context has a slightly different Prisma type:
```typescript
ctx.prisma as unknown as PrismaClient
```

### Module Guard + Permission Chain

```typescript
const billingProcedure = tenantProcedure.use(requireModule("billing"))

export const billingDocumentsRouter = createTRPCRouter({
  list: billingProcedure
    .use(requirePermission(BILLING_VIEW))
    .input(...)
    .query(...)
})
```

### Number Sequence Keys for Billing

The ticket specifies 7 document types, each with its own number sequence key. The default prefixes from the ticket:

| Key | Prefix | Document Type |
|-----|--------|--------------|
| `offer` | `A-` | Angebot |
| `order_confirmation` | `AB-` | Auftragsbestätigung |
| `delivery_note` | `LS-` | Lieferschein (changed from L- to avoid supplier conflict) |
| `service_note` | `LS-` | Leistungsschein |
| `return_delivery` | `R-` | Rücklieferung |
| `invoice` | `RE-` | Rechnung |
| `credit_note` | `G-` | Gutschrift |

**Note:** The ticket says prefix "L" for delivery_note but "L-" is already used for suppliers. Should use "LS-" for Lieferschein to avoid conflict. Or use distinct keys like `billing_delivery_note`.

### Forwarding Rules (Belegkette)

```typescript
const FORWARDING_RULES: Record<BillingDocumentType, BillingDocumentType[]> = {
  OFFER: ["ORDER_CONFIRMATION"],
  ORDER_CONFIRMATION: ["DELIVERY_NOTE", "SERVICE_NOTE"],
  DELIVERY_NOTE: ["INVOICE"],
  SERVICE_NOTE: ["INVOICE"],
  RETURN_DELIVERY: ["CREDIT_NOTE"],
  INVOICE: [],
  CREDIT_NOTE: [],
}
```

### Document Immutability

After `print()`:
- Status DRAFT → PRINTED
- All mutations on document and positions rejected (except forward, cancel)
- `printedAt` and `printedById` set

### Totals Calculation

On every position change:
- Per position: `totalPrice = quantity * unitPrice + flatCosts`
- Per document: `subtotalNet = sum(position.totalPrice)`, `totalVat = sum by vat rate`, `totalGross = subtotalNet + totalVat`
