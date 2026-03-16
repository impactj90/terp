# Plan: CRM_01 Adressverwaltung

## Overview

Implement the foundational CRM Address Management system. This includes:
- 4 new database tables: `number_sequences`, `crm_addresses`, `crm_contacts`, `crm_bank_accounts`
- 1 new Prisma enum: `CrmAddressType`
- Tenant-scoped auto-incrementing number sequences for customer/supplier numbers
- Full CRUD for addresses with paginated search/filter, soft-delete/restore
- Nested CRUD for contacts and bank accounts within an address
- All procedures gated by `requireModule("crm")` and CRM-specific permissions
- UI: list page with data table, detail page with tabs, form sheets/dialogs
- Router unit tests

---

## Phase 1: Database & Schema (Migration + Prisma)

### 1.1 Create migration file

**File:** `supabase/migrations/20260101000095_create_crm_tables.sql`

```sql
-- CRM Address Type enum
CREATE TYPE crm_address_type AS ENUM ('CUSTOMER', 'SUPPLIER', 'BOTH');

-- Number Sequences (shared across modules)
CREATE TABLE number_sequences (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key         VARCHAR(50) NOT NULL,
    prefix      VARCHAR(20) NOT NULL DEFAULT '',
    next_value  INT         NOT NULL DEFAULT 1,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_number_sequences_tenant_key UNIQUE (tenant_id, key)
);

CREATE INDEX idx_number_sequences_tenant_id ON number_sequences(tenant_id);

-- CRM Addresses
CREATE TABLE crm_addresses (
    id                UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    number            VARCHAR(50)     NOT NULL,
    type              crm_address_type NOT NULL DEFAULT 'CUSTOMER',
    company           VARCHAR(255)    NOT NULL,
    street            VARCHAR(255),
    zip               VARCHAR(20),
    city              VARCHAR(100),
    country           VARCHAR(10)     DEFAULT 'DE',
    phone             VARCHAR(50),
    fax               VARCHAR(50),
    email             VARCHAR(255),
    website           VARCHAR(255),
    tax_number        VARCHAR(50),
    vat_id            VARCHAR(50),
    match_code        VARCHAR(100),
    notes             TEXT,
    payment_term_days INT,
    discount_percent  DOUBLE PRECISION,
    discount_days     INT,
    discount_group    VARCHAR(50),
    price_list_id     UUID,
    is_active         BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by_id     UUID            REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT uq_crm_addresses_tenant_number UNIQUE (tenant_id, number)
);

CREATE INDEX idx_crm_addresses_tenant_id ON crm_addresses(tenant_id);
CREATE INDEX idx_crm_addresses_tenant_type ON crm_addresses(tenant_id, type);
CREATE INDEX idx_crm_addresses_tenant_match_code ON crm_addresses(tenant_id, match_code);
CREATE INDEX idx_crm_addresses_tenant_company ON crm_addresses(tenant_id, company);

-- CRM Contacts
CREATE TABLE crm_contacts (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    address_id  UUID        NOT NULL REFERENCES crm_addresses(id) ON DELETE CASCADE,
    first_name  VARCHAR(100) NOT NULL,
    last_name   VARCHAR(100) NOT NULL,
    position    VARCHAR(100),
    department  VARCHAR(100),
    phone       VARCHAR(50),
    email       VARCHAR(255),
    notes       TEXT,
    is_primary  BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_crm_contacts_address_id ON crm_contacts(address_id);
CREATE INDEX idx_crm_contacts_tenant_id ON crm_contacts(tenant_id);

-- CRM Bank Accounts
CREATE TABLE crm_bank_accounts (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    address_id      UUID        NOT NULL REFERENCES crm_addresses(id) ON DELETE CASCADE,
    iban            VARCHAR(34) NOT NULL,
    bic             VARCHAR(11),
    bank_name       VARCHAR(255),
    account_holder  VARCHAR(255),
    is_default      BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_crm_bank_accounts_address_id ON crm_bank_accounts(address_id);
CREATE INDEX idx_crm_bank_accounts_tenant_id ON crm_bank_accounts(tenant_id);
```

### 1.2 Update Prisma schema

**File:** `prisma/schema.prisma`

Add the following models **after** the `TenantModule` model block. Add the enum before the models.

#### Add enum (place before CrmAddress model):

```prisma
enum CrmAddressType {
  CUSTOMER
  SUPPLIER
  BOTH

  @@map("crm_address_type")
}
```

#### Add NumberSequence model:

```prisma
// -----------------------------------------------------------------------------
// NumberSequence
// -----------------------------------------------------------------------------
// Migration: 000095
//
// Shared utility model for auto-incrementing, tenant-scoped number sequences.
// Used by CRM, Billing, and Warehouse modules.
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

#### Add CrmAddress model:

```prisma
// -----------------------------------------------------------------------------
// CrmAddress
// -----------------------------------------------------------------------------
// Migration: 000095
//
// Core CRM entity representing a customer, supplier, or both.
model CrmAddress {
  id              String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String         @map("tenant_id") @db.Uuid
  number          String         @db.VarChar(50)
  type            CrmAddressType @default(CUSTOMER)
  company         String         @db.VarChar(255)
  street          String?        @db.VarChar(255)
  zip             String?        @db.VarChar(20)
  city            String?        @db.VarChar(100)
  country         String?        @default("DE") @db.VarChar(10)
  phone           String?        @db.VarChar(50)
  fax             String?        @db.VarChar(50)
  email           String?        @db.VarChar(255)
  website         String?        @db.VarChar(255)
  taxNumber       String?        @map("tax_number") @db.VarChar(50)
  vatId           String?        @map("vat_id") @db.VarChar(50)
  matchCode       String?        @map("match_code") @db.VarChar(100)
  notes           String?        @db.Text
  paymentTermDays Int?           @map("payment_term_days")
  discountPercent Float?         @map("discount_percent")
  discountDays    Int?           @map("discount_days")
  discountGroup   String?        @map("discount_group") @db.VarChar(50)
  priceListId     String?        @map("price_list_id") @db.Uuid
  isActive        Boolean        @default(true) @map("is_active")
  createdAt       DateTime       @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime       @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById     String?        @map("created_by_id") @db.Uuid

  tenant       Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  contacts     CrmContact[]
  bankAccounts CrmBankAccount[]

  @@unique([tenantId, number], map: "uq_crm_addresses_tenant_number")
  @@index([tenantId], map: "idx_crm_addresses_tenant_id")
  @@index([tenantId, type], map: "idx_crm_addresses_tenant_type")
  @@index([tenantId, matchCode], map: "idx_crm_addresses_tenant_match_code")
  @@index([tenantId, company], map: "idx_crm_addresses_tenant_company")
  @@map("crm_addresses")
}
```

#### Add CrmContact model:

```prisma
// -----------------------------------------------------------------------------
// CrmContact
// -----------------------------------------------------------------------------
// Migration: 000095
//
// Contact person within a CRM address.
model CrmContact {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId   String   @map("tenant_id") @db.Uuid
  addressId  String   @map("address_id") @db.Uuid
  firstName  String   @map("first_name") @db.VarChar(100)
  lastName   String   @map("last_name") @db.VarChar(100)
  position   String?  @db.VarChar(100)
  department String?  @db.VarChar(100)
  phone      String?  @db.VarChar(50)
  email      String?  @db.VarChar(255)
  notes      String?  @db.Text
  isPrimary  Boolean  @default(false) @map("is_primary")
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt  DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant  Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  address CrmAddress @relation(fields: [addressId], references: [id], onDelete: Cascade)

  @@index([addressId], map: "idx_crm_contacts_address_id")
  @@index([tenantId], map: "idx_crm_contacts_tenant_id")
  @@map("crm_contacts")
}
```

#### Add CrmBankAccount model:

```prisma
// -----------------------------------------------------------------------------
// CrmBankAccount
// -----------------------------------------------------------------------------
// Migration: 000095
//
// Bank account information for a CRM address.
model CrmBankAccount {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String   @map("tenant_id") @db.Uuid
  addressId     String   @map("address_id") @db.Uuid
  iban          String   @db.VarChar(34)
  bic           String?  @db.VarChar(11)
  bankName      String?  @map("bank_name") @db.VarChar(255)
  accountHolder String?  @map("account_holder") @db.VarChar(255)
  isDefault     Boolean  @default(false) @map("is_default")
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant  Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  address CrmAddress @relation(fields: [addressId], references: [id], onDelete: Cascade)

  @@index([addressId], map: "idx_crm_bank_accounts_address_id")
  @@index([tenantId], map: "idx_crm_bank_accounts_tenant_id")
  @@map("crm_bank_accounts")
}
```

#### Add relations to Tenant model:

In the Tenant model's relations section (after the existing `tenantModules TenantModule[]` line), add:

```prisma
  numberSequences     NumberSequence[]
  crmAddresses        CrmAddress[]
  crmContacts         CrmContact[]
  crmBankAccounts     CrmBankAccount[]
```

### 1.3 Regenerate Prisma client

```bash
pnpm db:generate
```

### Success Criteria
- Migration applies cleanly: `supabase migration up` or `pnpm db:reset`
- `pnpm db:generate` succeeds
- `pnpm typecheck` passes (at baseline level)

---

## Phase 2: Permissions & Service Layer

### 2.1 Add CRM permissions to permission-catalog.ts

**File:** `src/lib/auth/permission-catalog.ts`

Add these 4 entries at the end of the `ALL_PERMISSIONS` array (before the closing `]`):

```ts
  // CRM Module
  p("crm_addresses.view", "crm_addresses", "view", "View CRM addresses"),
  p("crm_addresses.create", "crm_addresses", "create", "Create CRM addresses"),
  p("crm_addresses.edit", "crm_addresses", "edit", "Edit CRM addresses"),
  p("crm_addresses.delete", "crm_addresses", "delete", "Delete CRM addresses"),
```

### 2.2 Create number-sequence-service.ts

**File:** `src/lib/services/number-sequence-service.ts`

Follow the contact-type-service.ts pattern. Functions to implement:

```ts
import type { PrismaClient } from "@/generated/prisma/client"

// --- Error Classes ---

export class NumberSequenceNotFoundError extends Error {
  constructor(key: string) {
    super(`Number sequence "${key}" not found`)
    this.name = "NumberSequenceNotFoundError"
  }
}

export class NumberSequenceValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NumberSequenceValidationError"
  }
}

// --- Service Functions ---

/**
 * Atomically gets the next number for a sequence key,
 * incrementing the counter in a single query (prevents race conditions).
 * Auto-creates the sequence if it doesn't exist (via upsert).
 *
 * Returns the formatted number string: prefix + value (e.g. "K-1", "L-42").
 */
export async function getNextNumber(
  prisma: PrismaClient,
  tenantId: string,
  key: string
): Promise<string> {
  const seq = await prisma.numberSequence.upsert({
    where: { tenantId_key: { tenantId, key } },
    update: { nextValue: { increment: 1 } },
    create: { tenantId, key, prefix: "", nextValue: 2 },
    // Returns the row AFTER update. For create, nextValue=2 means value 1 was consumed.
    // For update, nextValue was incremented, so current value = nextValue - 1.
  })
  const value = seq.nextValue - 1
  return `${seq.prefix}${value}`
}

/**
 * Lists all number sequences for a tenant.
 */
export async function list(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.numberSequence.findMany({
    where: { tenantId },
    orderBy: { key: "asc" },
  })
}

/**
 * Updates prefix and/or nextValue for a sequence.
 */
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  key: string,
  input: { prefix?: string; nextValue?: number }
) {
  const existing = await prisma.numberSequence.findUnique({
    where: { tenantId_key: { tenantId, key } },
  })
  if (!existing) {
    throw new NumberSequenceNotFoundError(key)
  }

  if (input.nextValue !== undefined && input.nextValue < 1) {
    throw new NumberSequenceValidationError("Next value must be at least 1")
  }

  const data: Record<string, unknown> = {}
  if (input.prefix !== undefined) data.prefix = input.prefix
  if (input.nextValue !== undefined) data.nextValue = input.nextValue

  return prisma.numberSequence.update({
    where: { tenantId_key: { tenantId, key } },
    data,
  })
}
```

### 2.3 Create crm-address-repository.ts

**File:** `src/lib/services/crm-address-repository.ts`

Follow the contact-type-repository.ts pattern. Pure Prisma queries, no business logic.

```ts
import type { PrismaClient, CrmAddressType } from "@/generated/prisma/client"

// --- Address Repository ---

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    search?: string
    type?: CrmAddressType
    isActive?: boolean
    page: number
    pageSize: number
  }
) {
  const where: Record<string, unknown> = { tenantId }

  if (params.isActive !== undefined) {
    where.isActive = params.isActive
  }

  if (params.type) {
    // If type is CUSTOMER, also match BOTH. If SUPPLIER, also match BOTH.
    if (params.type === "CUSTOMER") {
      where.type = { in: ["CUSTOMER", "BOTH"] }
    } else if (params.type === "SUPPLIER") {
      where.type = { in: ["SUPPLIER", "BOTH"] }
    } else {
      where.type = params.type
    }
  }

  if (params.search) {
    const term = params.search.trim()
    if (term.length > 0) {
      where.OR = [
        { company: { contains: term, mode: "insensitive" } },
        { number: { contains: term, mode: "insensitive" } },
        { matchCode: { contains: term, mode: "insensitive" } },
        { city: { contains: term, mode: "insensitive" } },
      ]
    }
  }

  const [items, total] = await Promise.all([
    prisma.crmAddress.findMany({
      where,
      orderBy: { company: "asc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.crmAddress.count({ where }),
  ])

  return { items, total }
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.crmAddress.findFirst({
    where: { id, tenantId },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] },
      bankAccounts: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
    },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    number: string
    type: CrmAddressType
    company: string
    street?: string | null
    zip?: string | null
    city?: string | null
    country?: string | null
    phone?: string | null
    fax?: string | null
    email?: string | null
    website?: string | null
    taxNumber?: string | null
    vatId?: string | null
    matchCode?: string | null
    notes?: string | null
    paymentTermDays?: number | null
    discountPercent?: number | null
    discountDays?: number | null
    discountGroup?: string | null
    createdById?: string | null
  }
) {
  return prisma.crmAddress.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.crmAddress.update({ where: { id }, data })
}

export async function softDelete(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.crmAddress.update({
    where: { id },
    data: { isActive: false },
  })
}

export async function restore(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.crmAddress.update({
    where: { id },
    data: { isActive: true },
  })
}

export async function hardDelete(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const { count } = await prisma.crmAddress.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

// --- Contact Repository ---

export async function findContacts(
  prisma: PrismaClient,
  tenantId: string,
  addressId: string
) {
  return prisma.crmContact.findMany({
    where: { tenantId, addressId },
    orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }],
  })
}

export async function findContactById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.crmContact.findFirst({
    where: { id, tenantId },
  })
}

export async function createContact(
  prisma: PrismaClient,
  data: {
    tenantId: string
    addressId: string
    firstName: string
    lastName: string
    position?: string | null
    department?: string | null
    phone?: string | null
    email?: string | null
    notes?: string | null
    isPrimary?: boolean
  }
) {
  return prisma.crmContact.create({ data })
}

export async function updateContact(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.crmContact.update({ where: { id }, data })
}

export async function deleteContact(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const { count } = await prisma.crmContact.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

// --- Bank Account Repository ---

export async function findBankAccounts(
  prisma: PrismaClient,
  tenantId: string,
  addressId: string
) {
  return prisma.crmBankAccount.findMany({
    where: { tenantId, addressId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  })
}

export async function findBankAccountById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.crmBankAccount.findFirst({
    where: { id, tenantId },
  })
}

export async function createBankAccount(
  prisma: PrismaClient,
  data: {
    tenantId: string
    addressId: string
    iban: string
    bic?: string | null
    bankName?: string | null
    accountHolder?: string | null
    isDefault?: boolean
  }
) {
  return prisma.crmBankAccount.create({ data })
}

export async function updateBankAccount(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.crmBankAccount.update({ where: { id }, data })
}

export async function deleteBankAccount(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const { count } = await prisma.crmBankAccount.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

// --- Counting helpers (for hard-delete checks) ---

export async function countContacts(
  prisma: PrismaClient,
  addressId: string
) {
  return prisma.crmContact.count({ where: { addressId } })
}

export async function countBankAccounts(
  prisma: PrismaClient,
  addressId: string
) {
  return prisma.crmBankAccount.count({ where: { addressId } })
}
```

### 2.4 Create crm-address-service.ts

**File:** `src/lib/services/crm-address-service.ts`

Follow the contact-type-service.ts pattern for error classes and function signatures.

```ts
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

export class CrmAddressValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CrmAddressValidationError"
  }
}

export class CrmAddressConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CrmAddressConflictError"
  }
}

export class CrmContactNotFoundError extends Error {
  constructor(message = "CRM contact not found") {
    super(message)
    this.name = "CrmContactNotFoundError"
  }
}

export class CrmBankAccountNotFoundError extends Error {
  constructor(message = "CRM bank account not found") {
    super(message)
    this.name = "CrmBankAccountNotFoundError"
  }
}

// --- Address Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    search?: string
    type?: CrmAddressType
    isActive?: boolean
    page: number
    pageSize: number
  }
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const address = await repo.findById(prisma, tenantId, id)
  if (!address) {
    throw new CrmAddressNotFoundError()
  }
  return address
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    type?: CrmAddressType
    company: string
    street?: string
    zip?: string
    city?: string
    country?: string
    phone?: string
    fax?: string
    email?: string
    website?: string
    taxNumber?: string
    vatId?: string
    matchCode?: string
    notes?: string
    paymentTermDays?: number
    discountPercent?: number
    discountDays?: number
    discountGroup?: string
  },
  createdById: string
) {
  const company = input.company.trim()
  if (company.length === 0) {
    throw new CrmAddressValidationError("Company name is required")
  }

  const type = input.type ?? "CUSTOMER"

  // Determine sequence key from type
  const numberKey = type === "SUPPLIER" ? "supplier" : "customer"
  const number = await numberSeqService.getNextNumber(prisma, tenantId, numberKey)

  // Auto-generate matchCode from company if not provided
  const matchCode = input.matchCode?.trim() || company.toUpperCase().slice(0, 20)

  return repo.create(prisma, {
    tenantId,
    number,
    type,
    company,
    street: input.street || null,
    zip: input.zip || null,
    city: input.city || null,
    country: input.country || "DE",
    phone: input.phone || null,
    fax: input.fax || null,
    email: input.email || null,
    website: input.website || null,
    taxNumber: input.taxNumber || null,
    vatId: input.vatId || null,
    matchCode,
    notes: input.notes || null,
    paymentTermDays: input.paymentTermDays ?? null,
    discountPercent: input.discountPercent ?? null,
    discountDays: input.discountDays ?? null,
    discountGroup: input.discountGroup || null,
    createdById,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    type?: CrmAddressType
    company?: string
    street?: string | null
    zip?: string | null
    city?: string | null
    country?: string | null
    phone?: string | null
    fax?: string | null
    email?: string | null
    website?: string | null
    taxNumber?: string | null
    vatId?: string | null
    matchCode?: string | null
    notes?: string | null
    paymentTermDays?: number | null
    discountPercent?: number | null
    discountDays?: number | null
    discountGroup?: string | null
  }
) {
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new CrmAddressNotFoundError()
  }

  const data: Record<string, unknown> = {}

  if (input.company !== undefined) {
    const company = input.company.trim()
    if (company.length === 0) {
      throw new CrmAddressValidationError("Company name is required")
    }
    data.company = company
  }

  // Pass through all optional fields
  const directFields = [
    "type", "street", "zip", "city", "country", "phone", "fax",
    "email", "website", "taxNumber", "vatId", "matchCode", "notes",
    "paymentTermDays", "discountPercent", "discountDays", "discountGroup",
  ] as const

  for (const field of directFields) {
    if (input[field] !== undefined) {
      data[field] = input[field]
    }
  }

  if (Object.keys(data).length === 0) {
    return existing
  }

  return repo.update(prisma, tenantId, input.id, data)
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new CrmAddressNotFoundError()
  }

  // Soft-delete: set isActive=false
  return repo.softDelete(prisma, tenantId, id)
}

export async function restoreAddress(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new CrmAddressNotFoundError()
  }
  return repo.restore(prisma, tenantId, id)
}

// --- Contact Service Functions ---

export async function listContacts(
  prisma: PrismaClient,
  tenantId: string,
  addressId: string
) {
  // Verify address exists
  const address = await repo.findById(prisma, tenantId, addressId)
  if (!address) {
    throw new CrmAddressNotFoundError()
  }
  return repo.findContacts(prisma, tenantId, addressId)
}

export async function createContact(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    addressId: string
    firstName: string
    lastName: string
    position?: string
    department?: string
    phone?: string
    email?: string
    notes?: string
    isPrimary?: boolean
  }
) {
  // Verify address exists
  const address = await repo.findById(prisma, tenantId, input.addressId)
  if (!address) {
    throw new CrmAddressNotFoundError()
  }

  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()
  if (firstName.length === 0) {
    throw new CrmAddressValidationError("First name is required")
  }
  if (lastName.length === 0) {
    throw new CrmAddressValidationError("Last name is required")
  }

  return repo.createContact(prisma, {
    tenantId,
    addressId: input.addressId,
    firstName,
    lastName,
    position: input.position || null,
    department: input.department || null,
    phone: input.phone || null,
    email: input.email || null,
    notes: input.notes || null,
    isPrimary: input.isPrimary ?? false,
  })
}

export async function updateContact(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    firstName?: string
    lastName?: string
    position?: string | null
    department?: string | null
    phone?: string | null
    email?: string | null
    notes?: string | null
    isPrimary?: boolean
  }
) {
  const existing = await repo.findContactById(prisma, tenantId, input.id)
  if (!existing) {
    throw new CrmContactNotFoundError()
  }

  const data: Record<string, unknown> = {}

  if (input.firstName !== undefined) {
    const firstName = input.firstName.trim()
    if (firstName.length === 0) {
      throw new CrmAddressValidationError("First name is required")
    }
    data.firstName = firstName
  }
  if (input.lastName !== undefined) {
    const lastName = input.lastName.trim()
    if (lastName.length === 0) {
      throw new CrmAddressValidationError("Last name is required")
    }
    data.lastName = lastName
  }

  const optionalFields = ["position", "department", "phone", "email", "notes", "isPrimary"] as const
  for (const field of optionalFields) {
    if (input[field] !== undefined) {
      data[field] = input[field]
    }
  }

  return repo.updateContact(prisma, tenantId, input.id, data)
}

export async function deleteContact(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const existing = await repo.findContactById(prisma, tenantId, id)
  if (!existing) {
    throw new CrmContactNotFoundError()
  }
  await repo.deleteContact(prisma, tenantId, id)
}

// --- Bank Account Service Functions ---

export async function listBankAccounts(
  prisma: PrismaClient,
  tenantId: string,
  addressId: string
) {
  const address = await repo.findById(prisma, tenantId, addressId)
  if (!address) {
    throw new CrmAddressNotFoundError()
  }
  return repo.findBankAccounts(prisma, tenantId, addressId)
}

export async function createBankAccount(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    addressId: string
    iban: string
    bic?: string
    bankName?: string
    accountHolder?: string
    isDefault?: boolean
  }
) {
  const address = await repo.findById(prisma, tenantId, input.addressId)
  if (!address) {
    throw new CrmAddressNotFoundError()
  }

  const iban = input.iban.trim().replace(/\s/g, "").toUpperCase()
  if (iban.length === 0) {
    throw new CrmAddressValidationError("IBAN is required")
  }

  return repo.createBankAccount(prisma, {
    tenantId,
    addressId: input.addressId,
    iban,
    bic: input.bic || null,
    bankName: input.bankName || null,
    accountHolder: input.accountHolder || null,
    isDefault: input.isDefault ?? false,
  })
}

export async function updateBankAccount(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    iban?: string
    bic?: string | null
    bankName?: string | null
    accountHolder?: string | null
    isDefault?: boolean
  }
) {
  const existing = await repo.findBankAccountById(prisma, tenantId, input.id)
  if (!existing) {
    throw new CrmBankAccountNotFoundError()
  }

  const data: Record<string, unknown> = {}

  if (input.iban !== undefined) {
    const iban = input.iban.trim().replace(/\s/g, "").toUpperCase()
    if (iban.length === 0) {
      throw new CrmAddressValidationError("IBAN is required")
    }
    data.iban = iban
  }

  const optionalFields = ["bic", "bankName", "accountHolder", "isDefault"] as const
  for (const field of optionalFields) {
    if (input[field] !== undefined) {
      data[field] = input[field]
    }
  }

  return repo.updateBankAccount(prisma, tenantId, input.id, data)
}

export async function deleteBankAccount(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const existing = await repo.findBankAccountById(prisma, tenantId, id)
  if (!existing) {
    throw new CrmBankAccountNotFoundError()
  }
  await repo.deleteBankAccount(prisma, tenantId, id)
}
```

### Success Criteria
- All error classes follow `*NotFoundError`, `*ValidationError`, `*ConflictError` naming convention
- Service functions match the ticket spec's procedure table
- No raw SQL, all Prisma queries in repository

---

## Phase 3: tRPC Routers

### 3.1 Create crm/addresses.ts router

**File:** `src/trpc/routers/crm/addresses.ts`

Follow the `locations.ts` router pattern. Key differences:
- Uses `crmProcedure` (tenantProcedure with `requireModule("crm")`)
- 4 separate permission constants (view, create, edit, delete)
- Paginated list with search/filter
- Includes sub-procedures for contacts and bank accounts via separate sub-routers

```ts
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
  // Address CRUD
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
        return await crmAddressService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  getById: crmProcedure
    .use(requirePermission(CRM_VIEW))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await crmAddressService.getById(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  create: crmProcedure
    .use(requirePermission(CRM_CREATE))
    .input(z.object({
      type: z.enum(["CUSTOMER", "SUPPLIER", "BOTH"]).optional().default("CUSTOMER"),
      company: z.string().min(1, "Company is required"),
      street: z.string().optional(),
      zip: z.string().optional(),
      city: z.string().optional(),
      country: z.string().optional().default("DE"),
      phone: z.string().optional(),
      fax: z.string().optional(),
      email: z.string().email().optional().or(z.literal("")),
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
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          ctx.user!.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  update: crmProcedure
    .use(requirePermission(CRM_EDIT))
    .input(z.object({
      id: z.string().uuid(),
      type: z.enum(["CUSTOMER", "SUPPLIER", "BOTH"]).optional(),
      company: z.string().min(1).optional(),
      street: z.string().nullable().optional(),
      zip: z.string().nullable().optional(),
      city: z.string().nullable().optional(),
      country: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      fax: z.string().nullable().optional(),
      email: z.string().email().nullable().optional().or(z.literal("")),
      website: z.string().nullable().optional(),
      taxNumber: z.string().nullable().optional(),
      vatId: z.string().nullable().optional(),
      matchCode: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      paymentTermDays: z.number().int().nullable().optional(),
      discountPercent: z.number().nullable().optional(),
      discountDays: z.number().int().nullable().optional(),
      discountGroup: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmAddressService.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  delete: crmProcedure
    .use(requirePermission(CRM_DELETE))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await crmAddressService.remove(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  restore: crmProcedure
    .use(requirePermission(CRM_EDIT))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmAddressService.restoreAddress(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // --- Contact Sub-Procedures ---

  contactsList: crmProcedure
    .use(requirePermission(CRM_VIEW))
    .input(z.object({ addressId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await crmAddressService.listContacts(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.addressId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  contactsCreate: crmProcedure
    .use(requirePermission(CRM_EDIT))
    .input(z.object({
      addressId: z.string().uuid(),
      firstName: z.string().min(1, "First name is required"),
      lastName: z.string().min(1, "Last name is required"),
      position: z.string().optional(),
      department: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional().or(z.literal("")),
      notes: z.string().optional(),
      isPrimary: z.boolean().optional().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmAddressService.createContact(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  contactsUpdate: crmProcedure
    .use(requirePermission(CRM_EDIT))
    .input(z.object({
      id: z.string().uuid(),
      firstName: z.string().min(1).optional(),
      lastName: z.string().min(1).optional(),
      position: z.string().nullable().optional(),
      department: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      email: z.string().email().nullable().optional().or(z.literal("")),
      notes: z.string().nullable().optional(),
      isPrimary: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmAddressService.updateContact(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  contactsDelete: crmProcedure
    .use(requirePermission(CRM_EDIT))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await crmAddressService.deleteContact(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  // --- Bank Account Sub-Procedures ---

  bankAccountsList: crmProcedure
    .use(requirePermission(CRM_VIEW))
    .input(z.object({ addressId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return await crmAddressService.listBankAccounts(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.addressId
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  bankAccountsCreate: crmProcedure
    .use(requirePermission(CRM_EDIT))
    .input(z.object({
      addressId: z.string().uuid(),
      iban: z.string().min(1, "IBAN is required"),
      bic: z.string().optional(),
      bankName: z.string().optional(),
      accountHolder: z.string().optional(),
      isDefault: z.boolean().optional().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmAddressService.createBankAccount(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  bankAccountsUpdate: crmProcedure
    .use(requirePermission(CRM_EDIT))
    .input(z.object({
      id: z.string().uuid(),
      iban: z.string().min(1).optional(),
      bic: z.string().nullable().optional(),
      bankName: z.string().nullable().optional(),
      accountHolder: z.string().nullable().optional(),
      isDefault: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await crmAddressService.updateBankAccount(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  bankAccountsDelete: crmProcedure
    .use(requirePermission(CRM_EDIT))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await crmAddressService.deleteBankAccount(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
```

### 3.2 Create crm/numberSequences.ts router

**File:** `src/trpc/routers/crm/numberSequences.ts`

This is a simple admin router for managing number sequences (settings). Uses `settings.manage` permission, no module guard (number sequences are cross-module).

```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as numberSequenceService from "@/lib/services/number-sequence-service"
import type { PrismaClient } from "@/generated/prisma/client"

const SETTINGS_MANAGE = permissionIdByKey("settings.manage")!

export const numberSequencesRouter = createTRPCRouter({
  list: tenantProcedure
    .use(requirePermission(SETTINGS_MANAGE))
    .query(async ({ ctx }) => {
      try {
        return await numberSequenceService.list(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  update: tenantProcedure
    .use(requirePermission(SETTINGS_MANAGE))
    .input(z.object({
      key: z.string().min(1),
      prefix: z.string().optional(),
      nextValue: z.number().int().min(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await numberSequenceService.update(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.key,
          { prefix: input.prefix, nextValue: input.nextValue }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
```

### 3.3 Update crm/index.ts

**File:** `src/trpc/routers/crm/index.ts`

Replace the placeholder with a merged router:

```ts
/**
 * CRM Router
 *
 * Merges CRM sub-routers: addresses, numberSequences.
 * All address procedures are guarded by requireModule("crm").
 */
import { createTRPCRouter } from "@/trpc/init"
import { crmAddressesRouter } from "./addresses"
import { numberSequencesRouter } from "./numberSequences"

export const crmRouter = createTRPCRouter({
  addresses: crmAddressesRouter,
  numberSequences: numberSequencesRouter,
})
```

### 3.4 Mount crmRouter in _app.ts

**File:** `src/trpc/routers/_app.ts`

Add import at the top (after the existing imports):

```ts
import { crmRouter } from "./crm"
```

Add to the `appRouter` object (after `tenantModules: tenantModulesRouter,`):

```ts
  crm: crmRouter,
```

### Success Criteria
- All address procedures gated by `requireModule("crm")`
- All address procedures gated by appropriate `crm_addresses.*` permissions
- Number sequence procedures gated by `settings.manage`
- `pnpm typecheck` passes (at baseline level)

---

## Phase 4: React Hooks

### 4.1 Create use-crm-addresses.ts

**File:** `src/hooks/use-crm-addresses.ts`

Follow the `use-locations.ts` pattern exactly.

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ==================== Address Hooks ====================

interface UseCrmAddressesOptions {
  search?: string
  type?: "CUSTOMER" | "SUPPLIER" | "BOTH"
  isActive?: boolean
  page?: number
  pageSize?: number
  enabled?: boolean
}

export function useCrmAddresses(options: UseCrmAddressesOptions = {}) {
  const { enabled = true, ...input } = options
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.addresses.list.queryOptions(
      {
        search: input.search,
        type: input.type,
        isActive: input.isActive,
        page: input.page ?? 1,
        pageSize: input.pageSize ?? 25,
      },
      { enabled }
    )
  )
}

export function useCrmAddress(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.addresses.getById.queryOptions(
      { id },
      { enabled: enabled && !!id }
    )
  )
}

export function useCreateCrmAddress() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.addresses.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.list.queryKey(),
      })
    },
  })
}

export function useUpdateCrmAddress() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.addresses.update.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.list.queryKey(),
      })
    },
  })
}

export function useDeleteCrmAddress() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.addresses.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.list.queryKey(),
      })
    },
  })
}

export function useRestoreCrmAddress() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.addresses.restore.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.list.queryKey(),
      })
    },
  })
}

// ==================== Contact Hooks ====================

export function useCrmContacts(addressId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.addresses.contactsList.queryOptions(
      { addressId },
      { enabled: enabled && !!addressId }
    )
  )
}

export function useCreateCrmContact() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.addresses.contactsCreate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.contactsList.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.getById.queryKey(),
      })
    },
  })
}

export function useUpdateCrmContact() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.addresses.contactsUpdate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.contactsList.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.getById.queryKey(),
      })
    },
  })
}

export function useDeleteCrmContact() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.addresses.contactsDelete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.contactsList.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.getById.queryKey(),
      })
    },
  })
}

// ==================== Bank Account Hooks ====================

export function useCrmBankAccounts(addressId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.addresses.bankAccountsList.queryOptions(
      { addressId },
      { enabled: enabled && !!addressId }
    )
  )
}

export function useCreateCrmBankAccount() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.addresses.bankAccountsCreate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.bankAccountsList.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.getById.queryKey(),
      })
    },
  })
}

export function useUpdateCrmBankAccount() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.addresses.bankAccountsUpdate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.bankAccountsList.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.getById.queryKey(),
      })
    },
  })
}

export function useDeleteCrmBankAccount() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.addresses.bankAccountsDelete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.bankAccountsList.queryKey(),
      })
      queryClient.invalidateQueries({
        queryKey: trpc.crm.addresses.getById.queryKey(),
      })
    },
  })
}
```

### 4.2 Export from hooks/index.ts

**File:** `src/hooks/index.ts`

Add at the end of the file:

```ts
// CRM Addresses
export {
  useCrmAddresses,
  useCrmAddress,
  useCreateCrmAddress,
  useUpdateCrmAddress,
  useDeleteCrmAddress,
  useRestoreCrmAddress,
  useCrmContacts,
  useCreateCrmContact,
  useUpdateCrmContact,
  useDeleteCrmContact,
  useCrmBankAccounts,
  useCreateCrmBankAccount,
  useUpdateCrmBankAccount,
  useDeleteCrmBankAccount,
} from './use-crm-addresses'
```

### Success Criteria
- All hooks compile
- Query invalidation happens on mutation success
- Hooks follow the exact same patterns as `use-locations.ts`

---

## Phase 5: UI Components

All components follow the patterns from the employee module. Every file uses `'use client'` at the top.

### 5.1 Create address data table

**File:** `src/components/crm/address-data-table.tsx`

Follow `src/components/employees/employee-data-table.tsx` pattern.

Props:
```ts
interface AddressDataTableProps {
  addresses: CrmAddress[]
  isLoading: boolean
  selectedIds: Set<string>
  onSelectIds: (ids: Set<string>) => void
  onView: (address: CrmAddress) => void
  onEdit: (address: CrmAddress) => void
  onDelete: (address: CrmAddress) => void
}
```

Columns:
- Checkbox (select)
- Number (font-mono)
- Company (font-medium)
- Type (badge: Kunde/Lieferant/Beides)
- City
- Phone
- Email
- Status (active/inactive badge)
- Actions dropdown (View, Edit, Delete/Deactivate)

Use `useTranslations('crmAddresses')` for all labels.

Include a `AddressDataTableSkeleton` function.

### 5.2 Create address form sheet

**File:** `src/components/crm/address-form-sheet.tsx`

Follow `src/components/employees/employee-form-sheet.tsx` pattern.

Props:
```ts
interface AddressFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  address?: CrmAddress | null  // null = create mode
  onSuccess?: () => void
}
```

Form sections:
1. **Basic Information** - type (Select: CUSTOMER/SUPPLIER/BOTH), company (required), matchCode
2. **Address** - street, zip, city, country
3. **Communication** - phone, fax, email, website
4. **Tax Information** - taxNumber, vatId
5. **Payment Terms** - paymentTermDays, discountPercent, discountDays, discountGroup
6. **Notes** - notes (textarea)

Uses `useCreateCrmAddress()` and `useUpdateCrmAddress()` from hooks.
Uses `useTranslations('crmAddresses')` for all labels.

### 5.3 Create contact list component

**File:** `src/components/crm/contact-list.tsx`

Simpler table displayed within the address detail Contacts tab.

Props:
```ts
interface ContactListProps {
  addressId: string
  contacts: CrmContact[]
  onAdd: () => void
  onEdit: (contact: CrmContact) => void
  onDelete: (contact: CrmContact) => void
}
```

Columns: Name (firstName + lastName), Position, Department, Phone, Email, Primary (badge), Actions.

Includes "Add Contact" button at the top.

### 5.4 Create contact form dialog

**File:** `src/components/crm/contact-form-dialog.tsx`

Uses Dialog component (not Sheet) since contacts are simpler forms.

Props:
```ts
interface ContactFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  addressId: string
  contact?: CrmContact | null  // null = create mode
  onSuccess?: () => void
}
```

Fields: firstName (required), lastName (required), position, department, phone, email, notes, isPrimary (checkbox).

Uses `useCreateCrmContact()` and `useUpdateCrmContact()` from hooks.

### 5.5 Create bank account list component

**File:** `src/components/crm/bank-account-list.tsx`

Similar to contact-list.tsx.

Props:
```ts
interface BankAccountListProps {
  addressId: string
  bankAccounts: CrmBankAccount[]
  onAdd: () => void
  onEdit: (bankAccount: CrmBankAccount) => void
  onDelete: (bankAccount: CrmBankAccount) => void
}
```

Columns: IBAN, BIC, Bank Name, Account Holder, Default (badge), Actions.

### 5.6 Create bank account form dialog

**File:** `src/components/crm/bank-account-form-dialog.tsx`

Similar to contact-form-dialog.tsx.

Props:
```ts
interface BankAccountFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  addressId: string
  bankAccount?: CrmBankAccount | null
  onSuccess?: () => void
}
```

Fields: iban (required), bic, bankName, accountHolder, isDefault (checkbox).

Uses `useCreateCrmBankAccount()` and `useUpdateCrmBankAccount()` from hooks.

### Success Criteria
- Components follow existing patterns exactly (same imports, same structure)
- All components use `'use client'` directive
- All text uses `useTranslations('crmAddresses')` (translations added in Phase 6)
- No console errors or warnings

---

## Phase 6: Pages & Navigation

### 6.1 Create CRM overview page

**File:** `src/app/[locale]/(dashboard)/crm/page.tsx`

Simple redirect page to `/crm/addresses`. Follow the dashboard pattern.

```tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function CrmPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/crm/addresses')
  }, [router])

  return null
}
```

### 6.2 Create CRM addresses list page

**File:** `src/app/[locale]/(dashboard)/crm/addresses/page.tsx`

Follow `src/app/[locale]/(dashboard)/admin/employees/page.tsx` pattern exactly.

Key elements:
- `useHasPermission(['crm_addresses.view'])` for access check
- `useCrmAddresses(...)` for data fetching
- Search input, type filter (Select: All/Customer/Supplier), active/inactive toggle
- `<Card>` with `<AddressDataTable>` inside
- `<Pagination>` below
- `<AddressFormSheet>` for create/edit
- `<ConfirmDialog>` for delete
- Uses `useTranslations('crmAddresses')` for all text
- Navigation to detail: `router.push(\`/crm/addresses/\${address.id}\`)`
- Includes `EmptyState` and `PageSkeleton` helper components

### 6.3 Create CRM address detail page

**File:** `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx`

Follow `src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx` pattern exactly.

Key elements:
- Back button -> `/crm/addresses`
- Header: Company name, number, type badge, status badge, Edit/Delete buttons
- Tabs:
  - **Overview** - Two-column card layout with address details (address fields, tax info, payment terms)
  - **Contacts** - `<ContactList>` with add/edit/delete dialogs
  - **Bank Accounts** - `<BankAccountList>` with add/edit/delete dialogs
  - **Correspondence** - Placeholder tab (text: "Coming soon - CRM_02")
  - **Inquiries** - Placeholder tab (text: "Coming soon - CRM_03")
  - **Documents** - Placeholder tab (text: "Coming soon - ORD_01")
- `<AddressFormSheet>` for editing
- `<ConfirmDialog>` for delete/deactivate
- `<ContactFormDialog>` for contact create/edit
- `<ConfirmDialog>` for contact delete
- `<BankAccountFormDialog>` for bank account create/edit
- `<ConfirmDialog>` for bank account delete

### 6.4 Add CRM addresses to sidebar nav

**File:** `src/components/layout/sidebar/sidebar-nav-config.ts`

Add `Contact` icon import (already imported). Add the `crmAddresses` nav item to the CRM section's items array.

In the CRM section (the one with `titleKey: 'crm'`, `module: 'crm'`), add after the existing `crmOverview` item:

```ts
{
  titleKey: 'crmAddresses',
  href: '/crm/addresses',
  icon: BookOpen,
  module: 'crm',
  permissions: ['crm_addresses.view'],
},
```

### 6.5 Add i18n translations

**File:** `messages/de.json`

Add to `nav` section (after `"crmOverview": "CRM-Ubersicht",`):

```json
"crmAddresses": "Adressen",
```

Add a new top-level `crmAddresses` namespace:

```json
"crmAddresses": {
  "title": "Adressverwaltung",
  "subtitle": "Kunden- und Lieferantenadressen verwalten",
  "newAddress": "Neue Adresse",
  "searchPlaceholder": "Firma, Nummer, Matchcode oder Ort suchen...",
  "allStatus": "Alle",
  "active": "Aktiv",
  "inactive": "Inaktiv",
  "allTypes": "Alle Typen",
  "typeCustomer": "Kunde",
  "typeSupplier": "Lieferant",
  "typeBoth": "Kunde & Lieferant",
  "clearFilters": "Filter zurucksetzen",
  "columnNumber": "Nummer",
  "columnCompany": "Firma",
  "columnType": "Typ",
  "columnCity": "Ort",
  "columnPhone": "Telefon",
  "columnEmail": "E-Mail",
  "columnStatus": "Status",
  "columnActions": "Aktionen",
  "selectAll": "Alle auswahlen",
  "viewDetails": "Details anzeigen",
  "edit": "Bearbeiten",
  "deactivate": "Deaktivieren",
  "deactivateAddress": "Adresse deaktivieren",
  "deactivateDescription": "Mochten Sie die Adresse \"{company}\" wirklich deaktivieren?",
  "deactivateFailed": "Deaktivierung fehlgeschlagen",
  "restore": "Wiederherstellen",
  "emptyTitle": "Keine Adressen gefunden",
  "emptyFilterHint": "Versuchen Sie, Ihre Filter anzupassen",
  "emptyGetStarted": "Erstellen Sie Ihre erste Adresse",
  "addAddress": "Adresse hinzufugen",
  "addressNotFound": "Adresse nicht gefunden",
  "backToList": "Zuruck zur Liste",
  "createTitle": "Neue Adresse anlegen",
  "createDescription": "Erstellen Sie eine neue Kunden- oder Lieferantenadresse",
  "editTitle": "Adresse bearbeiten",
  "editDescription": "Adressinformationen aktualisieren",
  "sectionBasic": "Grunddaten",
  "sectionAddress": "Anschrift",
  "sectionCommunication": "Kommunikation",
  "sectionTax": "Steuerinformationen",
  "sectionPayment": "Zahlungsbedingungen",
  "sectionNotes": "Notizen",
  "labelType": "Typ",
  "labelCompany": "Firma",
  "labelMatchCode": "Matchcode",
  "labelStreet": "Strase",
  "labelZip": "PLZ",
  "labelCity": "Ort",
  "labelCountry": "Land",
  "labelPhone": "Telefon",
  "labelFax": "Fax",
  "labelEmail": "E-Mail",
  "labelWebsite": "Webseite",
  "labelTaxNumber": "Steuernummer",
  "labelVatId": "USt-IdNr.",
  "labelPaymentTermDays": "Zahlungsziel (Tage)",
  "labelDiscountPercent": "Skonto (%)",
  "labelDiscountDays": "Skontotage",
  "labelDiscountGroup": "Rabattgruppe",
  "labelNotes": "Notizen",
  "cancel": "Abbrechen",
  "save": "Speichern",
  "create": "Anlegen",
  "saving": "Wird gespeichert...",
  "tabOverview": "Ubersicht",
  "tabContacts": "Kontakte",
  "tabBankAccounts": "Bankverbindungen",
  "tabCorrespondence": "Korrespondenz",
  "tabInquiries": "Anfragen",
  "tabDocuments": "Belege",
  "comingSoon": "In Vorbereitung",
  "contactsTitle": "Kontaktpersonen",
  "addContact": "Kontakt hinzufugen",
  "createContactTitle": "Neuen Kontakt anlegen",
  "editContactTitle": "Kontakt bearbeiten",
  "labelFirstName": "Vorname",
  "labelLastName": "Nachname",
  "labelPosition": "Position",
  "labelDepartment": "Abteilung",
  "labelIsPrimary": "Hauptkontakt",
  "deleteContact": "Kontakt loschen",
  "deleteContactDescription": "Mochten Sie den Kontakt \"{name}\" wirklich loschen?",
  "bankAccountsTitle": "Bankverbindungen",
  "addBankAccount": "Bankverbindung hinzufugen",
  "createBankAccountTitle": "Neue Bankverbindung anlegen",
  "editBankAccountTitle": "Bankverbindung bearbeiten",
  "labelIban": "IBAN",
  "labelBic": "BIC",
  "labelBankName": "Bank",
  "labelAccountHolder": "Kontoinhaber",
  "labelIsDefault": "Standard",
  "deleteBankAccount": "Bankverbindung loschen",
  "deleteBankAccountDescription": "Mochten Sie die Bankverbindung wirklich loschen?",
  "confirm": "Bestatigen",
  "delete": "Loschen"
}
```

**File:** `messages/en.json`

Add to `nav` section (after `"crmOverview": "CRM Overview",`):

```json
"crmAddresses": "Addresses",
```

Add a new top-level `crmAddresses` namespace:

```json
"crmAddresses": {
  "title": "Address Management",
  "subtitle": "Manage customer and supplier addresses",
  "newAddress": "New Address",
  "searchPlaceholder": "Search company, number, match code or city...",
  "allStatus": "All",
  "active": "Active",
  "inactive": "Inactive",
  "allTypes": "All Types",
  "typeCustomer": "Customer",
  "typeSupplier": "Supplier",
  "typeBoth": "Customer & Supplier",
  "clearFilters": "Clear Filters",
  "columnNumber": "Number",
  "columnCompany": "Company",
  "columnType": "Type",
  "columnCity": "City",
  "columnPhone": "Phone",
  "columnEmail": "Email",
  "columnStatus": "Status",
  "columnActions": "Actions",
  "selectAll": "Select all",
  "viewDetails": "View Details",
  "edit": "Edit",
  "deactivate": "Deactivate",
  "deactivateAddress": "Deactivate Address",
  "deactivateDescription": "Are you sure you want to deactivate the address \"{company}\"?",
  "deactivateFailed": "Deactivation failed",
  "restore": "Restore",
  "emptyTitle": "No addresses found",
  "emptyFilterHint": "Try adjusting your filters",
  "emptyGetStarted": "Create your first address",
  "addAddress": "Add Address",
  "addressNotFound": "Address not found",
  "backToList": "Back to List",
  "createTitle": "Create New Address",
  "createDescription": "Create a new customer or supplier address",
  "editTitle": "Edit Address",
  "editDescription": "Update address information",
  "sectionBasic": "Basic Information",
  "sectionAddress": "Address",
  "sectionCommunication": "Communication",
  "sectionTax": "Tax Information",
  "sectionPayment": "Payment Terms",
  "sectionNotes": "Notes",
  "labelType": "Type",
  "labelCompany": "Company",
  "labelMatchCode": "Match Code",
  "labelStreet": "Street",
  "labelZip": "ZIP",
  "labelCity": "City",
  "labelCountry": "Country",
  "labelPhone": "Phone",
  "labelFax": "Fax",
  "labelEmail": "Email",
  "labelWebsite": "Website",
  "labelTaxNumber": "Tax Number",
  "labelVatId": "VAT ID",
  "labelPaymentTermDays": "Payment Terms (Days)",
  "labelDiscountPercent": "Discount (%)",
  "labelDiscountDays": "Discount Days",
  "labelDiscountGroup": "Discount Group",
  "labelNotes": "Notes",
  "cancel": "Cancel",
  "save": "Save",
  "create": "Create",
  "saving": "Saving...",
  "tabOverview": "Overview",
  "tabContacts": "Contacts",
  "tabBankAccounts": "Bank Accounts",
  "tabCorrespondence": "Correspondence",
  "tabInquiries": "Inquiries",
  "tabDocuments": "Documents",
  "comingSoon": "Coming Soon",
  "contactsTitle": "Contact Persons",
  "addContact": "Add Contact",
  "createContactTitle": "Create New Contact",
  "editContactTitle": "Edit Contact",
  "labelFirstName": "First Name",
  "labelLastName": "Last Name",
  "labelPosition": "Position",
  "labelDepartment": "Department",
  "labelIsPrimary": "Primary Contact",
  "deleteContact": "Delete Contact",
  "deleteContactDescription": "Are you sure you want to delete the contact \"{name}\"?",
  "bankAccountsTitle": "Bank Accounts",
  "addBankAccount": "Add Bank Account",
  "createBankAccountTitle": "Create New Bank Account",
  "editBankAccountTitle": "Edit Bank Account",
  "labelIban": "IBAN",
  "labelBic": "BIC",
  "labelBankName": "Bank",
  "labelAccountHolder": "Account Holder",
  "labelIsDefault": "Default",
  "deleteBankAccount": "Delete Bank Account",
  "deleteBankAccountDescription": "Are you sure you want to delete this bank account?",
  "confirm": "Confirm",
  "delete": "Delete"
}
```

### Success Criteria
- Navigation works end-to-end
- CRM section visible when CRM module enabled
- Pages render correctly
- i18n translations load for both locales

---

## Phase 7: Tests

### 7.1 Create router unit tests

**File:** `src/trpc/routers/__tests__/crmAddresses-router.test.ts`

Follow `src/trpc/routers/__tests__/tenantModules-router.test.ts` pattern exactly.

```ts
import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { crmAddressesRouter } from "../crm/addresses"
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

// --- Constants ---
const CRM_VIEW = permissionIdByKey("crm_addresses.view")!
const CRM_CREATE = permissionIdByKey("crm_addresses.create")!
const CRM_EDIT = permissionIdByKey("crm_addresses.edit")!
const CRM_DELETE = permissionIdByKey("crm_addresses.delete")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ADDRESS_ID = "b0000000-0000-4000-b000-000000000001"

const createCaller = createCallerFactory(crmAddressesRouter)

// --- Helpers ---
function createTestContext(
  prisma: Record<string, unknown>,
  permissions: string[] = [CRM_VIEW, CRM_CREATE, CRM_EDIT, CRM_DELETE]
) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

function createNoPermContext(prisma: Record<string, unknown>) {
  return createTestContext(prisma, [])
}
```

Test cases to include:

```ts
describe("crm.addresses.list", () => {
  it("returns paginated addresses", async () => {
    // Mock prisma.crmAddress.findMany and count
    // Call caller.list({ page: 1, pageSize: 10 })
    // Assert items and total returned
  })

  it("rejects without crm_addresses.view permission", async () => {
    // Use createNoPermContext
    // Expect "Insufficient permissions" error
  })
})

describe("crm.addresses.create", () => {
  it("creates address with auto-generated number", async () => {
    // Mock numberSequence.upsert to return { prefix: "K-", nextValue: 2 }
    // Mock crmAddress.create to return the created address
    // Assert number is "K-1"
  })

  it("rejects without crm_addresses.create permission", async () => {
    // Only give CRM_VIEW perm
    // Expect "Insufficient permissions" error
  })
})

describe("crm.addresses.getById", () => {
  it("returns address with contacts and bank accounts", async () => {
    // Mock crmAddress.findFirst with include result
    // Assert all nested data returned
  })

  it("throws not found for wrong tenant", async () => {
    // Mock findFirst to return null
    // Expect NOT_FOUND error
  })
})

describe("crm.addresses.delete", () => {
  it("soft-deletes address (sets isActive=false)", async () => {
    // Mock findFirst to return existing address
    // Mock update to return address with isActive=false
    // Assert success: true returned
  })
})

describe("crm.addresses.restore", () => {
  it("restores soft-deleted address", async () => {
    // Mock findFirst to return inactive address
    // Mock update to return address with isActive=true
    // Assert restored address returned
  })
})

describe("crm.addresses.contactsCreate", () => {
  it("creates contact for existing address", async () => {
    // Mock address findFirst to return address
    // Mock crmContact.create to return contact
    // Assert contact returned
  })
})

describe("crm.addresses.bankAccountsCreate", () => {
  it("creates bank account for existing address", async () => {
    // Mock address findFirst to return address
    // Mock crmBankAccount.create to return bank account
    // Assert bank account returned
  })
})
```

### Success Criteria
- `pnpm test` passes (all existing + new tests)
- `pnpm typecheck` passes (at baseline level)

---

## Implementation Order Summary

| Phase | Files Created | Files Modified | Verification |
|-------|-------------|---------------|-------------|
| 1 | `supabase/migrations/20260101000095_create_crm_tables.sql` | `prisma/schema.prisma` | `pnpm db:generate` |
| 2 | `src/lib/services/number-sequence-service.ts`, `src/lib/services/crm-address-repository.ts`, `src/lib/services/crm-address-service.ts` | `src/lib/auth/permission-catalog.ts` | `pnpm typecheck` |
| 3 | `src/trpc/routers/crm/addresses.ts`, `src/trpc/routers/crm/numberSequences.ts` | `src/trpc/routers/crm/index.ts`, `src/trpc/routers/_app.ts` | `pnpm typecheck` |
| 4 | `src/hooks/use-crm-addresses.ts` | `src/hooks/index.ts` | `pnpm typecheck` |
| 5 | `src/components/crm/address-data-table.tsx`, `src/components/crm/address-form-sheet.tsx`, `src/components/crm/contact-list.tsx`, `src/components/crm/contact-form-dialog.tsx`, `src/components/crm/bank-account-list.tsx`, `src/components/crm/bank-account-form-dialog.tsx` | — | `pnpm typecheck` |
| 6 | `src/app/[locale]/(dashboard)/crm/page.tsx`, `src/app/[locale]/(dashboard)/crm/addresses/page.tsx`, `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx` | `src/components/layout/sidebar/sidebar-nav-config.ts`, `messages/de.json`, `messages/en.json` | `pnpm typecheck` |
| 7 | `src/trpc/routers/__tests__/crmAddresses-router.test.ts` | — | `pnpm test`, `pnpm typecheck` |

**Total: 18 new files, 7 modified files**
