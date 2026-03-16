# CRM_01 — Adressverwaltung (Stammdaten)

| Field | Value |
|-------|-------|
| **Module** | CRM |
| **Dependencies** | None (foundational ticket) |
| **Complexity** | L |
| **New Models** | `CrmAddress`, `CrmContact`, `CrmBankAccount`, `NumberSequence` |

---

## Goal

Provide a comprehensive address management system for customers and suppliers. This is the foundational CRM data that all other CRM, Billing, and Warehouse tickets build upon. Includes configurable tenant-scoped number sequences (used across all three modules), multiple contacts per address, bank account data, and full CRUD with search/filter.

---

## Prisma Models

### NumberSequence

Shared utility model for auto-incrementing, tenant-scoped number sequences (customer numbers, document numbers, article numbers, etc.). Used by CRM, Billing, and Warehouse modules.

```prisma
model NumberSequence {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId   String   @map("tenant_id") @db.Uuid
  key        String   // e.g. "customer", "supplier", "offer", "invoice", "article"
  prefix     String   @default("") // e.g. "K-", "L-", "A-"
  nextValue  Int      @default(1) @map("next_value")
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt  DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, key])
  @@map("number_sequences")
}
```

### CrmAddress

```prisma
enum CrmAddressType {
  CUSTOMER
  SUPPLIER
  BOTH

  @@map("crm_address_type")
}

model CrmAddress {
  id              String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String         @map("tenant_id") @db.Uuid
  number          String         // Auto-generated via NumberSequence
  type            CrmAddressType @default(CUSTOMER)
  company         String
  street          String?
  zip             String?
  city            String?
  country         String?        @default("DE")
  phone           String?
  fax             String?
  email           String?
  website         String?
  taxNumber       String?        @map("tax_number")
  vatId           String?        @map("vat_id")
  matchCode       String?        @map("match_code")
  notes           String?
  paymentTermDays Int?           @map("payment_term_days") // Default days until due
  discountPercent Float?         @map("discount_percent")   // Default discount %
  discountDays    Int?           @map("discount_days")       // Skonto days
  discountGroup   String?        @map("discount_group")
  priceListId     String?        @map("price_list_id") @db.Uuid // Default price list (ORD_04)
  isActive        Boolean        @default(true) @map("is_active")
  createdAt       DateTime       @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime       @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById     String?        @map("created_by_id") @db.Uuid

  tenant       Tenant           @relation(fields: [tenantId], references: [id])
  contacts     CrmContact[]
  bankAccounts CrmBankAccount[]

  @@unique([tenantId, number])
  @@index([tenantId, type])
  @@index([tenantId, matchCode])
  @@index([tenantId, company])
  @@map("crm_addresses")
}
```

### CrmContact

```prisma
model CrmContact {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId   String   @map("tenant_id") @db.Uuid
  addressId  String   @map("address_id") @db.Uuid
  firstName  String   @map("first_name")
  lastName   String   @map("last_name")
  position   String?
  department String?
  phone      String?
  email      String?
  notes      String?
  isPrimary  Boolean  @default(false) @map("is_primary")
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt  DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant  Tenant     @relation(fields: [tenantId], references: [id])
  address CrmAddress @relation(fields: [addressId], references: [id], onDelete: Cascade)

  @@index([addressId])
  @@map("crm_contacts")
}
```

### CrmBankAccount

```prisma
model CrmBankAccount {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String   @map("tenant_id") @db.Uuid
  addressId     String   @map("address_id") @db.Uuid
  iban          String
  bic           String?
  bankName      String?  @map("bank_name")
  accountHolder String?  @map("account_holder")
  isDefault     Boolean  @default(false) @map("is_default")
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant  Tenant     @relation(fields: [tenantId], references: [id])
  address CrmAddress @relation(fields: [addressId], references: [id], onDelete: Cascade)

  @@index([addressId])
  @@map("crm_bank_accounts")
}
```

---

## Permissions

Add to `permission-catalog.ts`:

```ts
// CRM Module
p("crm_addresses.view", "crm_addresses", "view", "View CRM addresses"),
p("crm_addresses.create", "crm_addresses", "create", "Create CRM addresses"),
p("crm_addresses.edit", "crm_addresses", "edit", "Edit CRM addresses"),
p("crm_addresses.delete", "crm_addresses", "delete", "Delete CRM addresses"),
```

---

## tRPC Router

**File:** `src/trpc/routers/crm/addresses.ts`

All procedures use `tenantProcedure.use(requireModule("crm"))`.

### Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `list` | query | `crm_addresses.view` | `{ search?, type?, isActive?, page, pageSize }` | Paginated list with search across company, number, matchCode, city |
| `getById` | query | `crm_addresses.view` | `{ id }` | Single address with contacts & bankAccounts included |
| `create` | mutation | `crm_addresses.create` | Full address fields | Auto-generates number via NumberSequence |
| `update` | mutation | `crm_addresses.edit` | `{ id, ...fields }` | Partial update |
| `delete` | mutation | `crm_addresses.delete` | `{ id }` | Soft-delete (sets isActive=false). Hard-delete only if no linked records exist. |
| `restore` | mutation | `crm_addresses.edit` | `{ id }` | Restores soft-deleted address |

### Contacts Sub-Procedures

| Procedure | Type | Permission | Input |
|-----------|------|-----------|-------|
| `contacts.list` | query | `crm_addresses.view` | `{ addressId }` |
| `contacts.create` | mutation | `crm_addresses.edit` | `{ addressId, firstName, lastName, ...fields }` |
| `contacts.update` | mutation | `crm_addresses.edit` | `{ id, ...fields }` |
| `contacts.delete` | mutation | `crm_addresses.edit` | `{ id }` |

### BankAccounts Sub-Procedures

| Procedure | Type | Permission | Input |
|-----------|------|-----------|-------|
| `bankAccounts.list` | query | `crm_addresses.view` | `{ addressId }` |
| `bankAccounts.create` | mutation | `crm_addresses.edit` | `{ addressId, iban, ...fields }` |
| `bankAccounts.update` | mutation | `crm_addresses.edit` | `{ id, ...fields }` |
| `bankAccounts.delete` | mutation | `crm_addresses.edit` | `{ id }` |

### NumberSequence Admin Procedures

**File:** `src/trpc/routers/crm/numberSequences.ts`

| Procedure | Type | Permission | Input |
|-----------|------|-----------|-------|
| `list` | query | `settings.manage` | — |
| `update` | mutation | `settings.manage` | `{ key, prefix?, nextValue? }` |

### Example Router Code

```ts
// src/trpc/routers/crm/addresses.ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as crmAddressService from "@/lib/services/crm-address-service"

const CRM_VIEW = permissionIdByKey("crm_addresses.view")!
const CRM_CREATE = permissionIdByKey("crm_addresses.create")!
const CRM_EDIT = permissionIdByKey("crm_addresses.edit")!
const CRM_DELETE = permissionIdByKey("crm_addresses.delete")!

const crmProcedure = tenantProcedure.use(requireModule("crm"))

export const crmAddressesRouter = createTRPCRouter({
  list: crmProcedure
    .use(requirePermission(CRM_VIEW))
    .input(z.object({
      search: z.string().optional(),
      type: z.enum(["CUSTOMER", "SUPPLIER", "BOTH"]).optional(),
      isActive: z.boolean().optional().default(true),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(25),
    }))
    .query(async ({ ctx, input }) => {
      try {
        return await crmAddressService.list(ctx.prisma, ctx.tenantId!, input)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: crmProcedure
    .use(requirePermission(CRM_VIEW))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await crmAddressService.getById(ctx.prisma, ctx.tenantId!, input.id)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: crmProcedure
    .use(requirePermission(CRM_CREATE))
    .input(z.object({
      type: z.enum(["CUSTOMER", "SUPPLIER", "BOTH"]).default("CUSTOMER"),
      company: z.string().min(1),
      street: z.string().optional(),
      zip: z.string().optional(),
      city: z.string().optional(),
      country: z.string().optional().default("DE"),
      phone: z.string().optional(),
      fax: z.string().optional(),
      email: z.string().email().optional(),
      website: z.string().optional(),
      taxNumber: z.string().optional(),
      vatId: z.string().optional(),
      matchCode: z.string().optional(),
      notes: z.string().optional(),
      paymentTermDays: z.number().int().optional(),
      discountPercent: z.number().optional(),
      discountDays: z.number().int().optional(),
      discountGroup: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmAddressService.create(
          ctx.prisma, ctx.tenantId!, input, ctx.user!.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // ... update, delete, restore follow same pattern
})
```

---

## Service Layer

**Files:**
- `src/lib/services/crm-address-service.ts` — Business logic
- `src/lib/services/crm-address-repository.ts` — Prisma queries
- `src/lib/services/number-sequence-service.ts` — Number generation

### NumberSequence Service

```ts
// src/lib/services/number-sequence-service.ts
import type { PrismaClient } from "@/generated/prisma/client"

export class NumberSequenceNotFoundError extends Error {
  constructor(key: string) {
    super(`Number sequence "${key}" not found`)
  }
}

/**
 * Atomically gets the next number for a sequence key,
 * incrementing the counter in a single query (prevents race conditions).
 * Auto-creates the sequence if it doesn't exist.
 */
export async function getNextNumber(
  prisma: PrismaClient,
  tenantId: string,
  key: string
): Promise<string> {
  const seq = await prisma.numberSequence.upsert({
    where: { tenantId_key: { tenantId, key } },
    update: { nextValue: { increment: 1 } },
    create: { tenantId, key, nextValue: 2 }, // returns 1, sets next to 2
  })
  const value = seq.nextValue - 1 // upsert returns the POST-increment value
  return `${seq.prefix}${value}`
}
```

### CrmAddress Service Pattern

```ts
// src/lib/services/crm-address-service.ts
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./crm-address-repository"
import * as numberSeqService from "./number-sequence-service"

export class CrmAddressNotFoundError extends Error { /* ... */ }
export class CrmAddressValidationError extends Error { /* ... */ }

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: CreateCrmAddressInput,
  createdById: string
) {
  const numberKey = input.type === "SUPPLIER" ? "supplier" : "customer"
  const number = await numberSeqService.getNextNumber(prisma, tenantId, numberKey)

  return repo.create(prisma, {
    tenantId,
    number,
    ...input,
    createdById,
  })
}
```

---

## UI Components

### Page Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/crm` | `CrmDashboardPage` | CRM overview/redirect to addresses |
| `/crm/addresses` | `CrmAddressesPage` | Address list with search/filter |
| `/crm/addresses/[id]` | `CrmAddressDetailPage` | Address detail with tabs |

### Component Files

All in `src/components/crm/`:

| Component | Description |
|-----------|-------------|
| `address-list.tsx` | Data table with columns: Number, Company, Type, City, Phone, Email. Toolbar with search, type filter, active/inactive toggle. |
| `address-form-sheet.tsx` | Sheet (slide-out) form for create/edit. Follows pattern from existing form sheets. |
| `address-detail.tsx` | Detail view with tabs: Overview, Contacts, Bank Accounts, Correspondence (CRM_02), Inquiries (CRM_03), Documents (ORD_01), Tasks (CRM_04) |
| `contact-list.tsx` | Contact sub-table within address detail |
| `contact-form-dialog.tsx` | Dialog form for create/edit contacts |
| `bank-account-list.tsx` | Bank account sub-table within address detail |
| `bank-account-form-dialog.tsx` | Dialog form for create/edit bank accounts |

### Pattern References

- Table component: Follow existing data-table pattern (see `src/components/employees/employee-list.tsx`)
- Form sheet: Follow existing sheet form pattern (see `src/components/orders/order-form-sheet.tsx` or similar)
- Detail page with tabs: Follow existing tab layout (see `src/components/employees/employee-detail.tsx`)
- Sidebar navigation: Add "CRM" section with sub-items to `sidebar-nav-config.ts`

---

## Hooks

**File:** `src/hooks/use-crm-addresses.ts`

```ts
export function useCrmAddresses(filters) {
  return useQuery(trpc.crm.addresses.list.queryOptions(filters))
}

export function useCrmAddress(id: string) {
  return useQuery(trpc.crm.addresses.getById.queryOptions({ id }))
}

export function useCreateCrmAddress() {
  return useMutation({
    ...trpc.crm.addresses.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.crm.addresses.list.queryKey() })
    },
  })
}

// ... useUpdateCrmAddress, useDeleteCrmAddress, useRestoreCrmAddress
```

Similar hooks for contacts and bank accounts.

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/crm-address-service.test.ts`

- `getNextNumber` — returns prefix+value, increments atomically
- `getNextNumber` — auto-creates sequence if missing
- `create` — generates customer number for CUSTOMER type
- `create` — generates supplier number for SUPPLIER type
- `create` — auto-generates matchCode from company name if not provided
- `list` — filters by type, search, isActive
- `list` — paginates correctly
- `getById` — throws CrmAddressNotFoundError for wrong tenant
- `update` — partial update preserves other fields
- `delete` — soft-deletes (sets isActive=false)
- `delete` — hard-deletes if no linked records

### Router Tests

**File:** `src/trpc/routers/__tests__/crmAddresses-router.test.ts`

```ts
describe("crm.addresses", () => {
  it("list — requires crm_addresses.view permission", async () => { /* 403 without */ })
  it("list — requires CRM module enabled", async () => { /* 403 if module disabled */ })
  it("create — assigns auto-generated number", async () => { /* verify number */ })
  it("getById — scoped to tenant", async () => { /* cross-tenant 404 */ })
  it("delete — soft-deletes by default", async () => { /* isActive=false */ })
})
```

### E2E Tests

**File:** `src/e2e-browser/20-crm-addresses.spec.ts`

```ts
test.describe("UC-CRM-01: Address Management", () => {
  test("create a customer address", async ({ page }) => {
    // Navigate to /crm/addresses
    // Click "New Address" button
    // Fill form: company, street, zip, city, phone, email
    // Submit → verify address appears in list with auto-generated number
  })

  test("add contact to existing address", async ({ page }) => {
    // Navigate to address detail
    // Click Contacts tab
    // Click "Add Contact"
    // Fill: firstName, lastName, email
    // Submit → verify contact in list
  })

  test("search addresses by company name", async ({ page }) => {
    // Type in search box → verify filtered results
  })

  test("filter addresses by type (Customer/Supplier)", async ({ page }) => {
    // Select type filter → verify results match
  })

  test("soft-delete and restore address", async ({ page }) => {
    // Delete address → verify removed from active list
    // Toggle to show inactive → verify address visible
    // Restore → verify back in active list
  })
})
```

---

## Acceptance Criteria

- [ ] `NumberSequence` model created with migration; tenant-scoped unique constraint on `(tenantId, key)`
- [ ] `CrmAddress` model created with all fields from ZMI feature analysis section 1.1
- [ ] `CrmContact` model with cascade delete when parent address is deleted
- [ ] `CrmBankAccount` model with cascade delete
- [ ] Customer and supplier number sequences auto-initialize per tenant
- [ ] Address number auto-generated on create; prefix configurable via settings
- [ ] Search works across company, number, matchCode, city fields
- [ ] Type filter (Customer / Supplier / Both) works
- [ ] Active/inactive toggle works (soft-delete)
- [ ] Contacts: full CRUD within address detail
- [ ] Bank accounts: full CRUD within address detail
- [ ] All procedures gated by `requireModule("crm")` — returns 403 if CRM disabled
- [ ] All procedures gated by appropriate `crm_addresses.*` permissions
- [ ] Cross-tenant isolation verified in tests
- [ ] Address detail page has tab placeholders for Correspondence, Inquiries, Documents, Tasks (linked in future tickets)
- [ ] Sidebar navigation shows CRM section when CRM module is enabled
