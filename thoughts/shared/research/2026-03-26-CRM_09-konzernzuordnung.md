# Research: CRM_09 — Konzern-/Filialen-Zuordnung

**Date:** 2026-03-26
**Ticket:** `thoughts/shared/tickets/orgAuftrag/TICKET_CRM_09_KONZERNZUORDNUNG.md`

---

## 1. CrmAddress Model (Prisma Schema)

**File:** `prisma/schema.prisma`, lines 285–339

### Fields

| Field | Type | Mapping | Notes |
|-------|------|---------|-------|
| `id` | `String` (UUID) | PK, `gen_random_uuid()` | |
| `tenantId` | `String` (UUID) | `tenant_id` | FK → Tenant |
| `number` | `String` (VarChar 50) | | Auto-generated (K-1, L-1) |
| `type` | `CrmAddressType` | | Enum: CUSTOMER, SUPPLIER, BOTH |
| `company` | `String` (VarChar 255) | | Required |
| `street` | `String?` (VarChar 255) | | |
| `zip` | `String?` (VarChar 20) | | |
| `city` | `String?` (VarChar 100) | | |
| `country` | `String?` (VarChar 10) | | Default "DE" |
| `phone` | `String?` (VarChar 50) | | |
| `fax` | `String?` (VarChar 50) | | |
| `email` | `String?` (VarChar 255) | | |
| `website` | `String?` (VarChar 255) | | |
| `taxNumber` | `String?` (VarChar 50) | `tax_number` | |
| `vatId` | `String?` (VarChar 50) | `vat_id` | |
| `leitwegId` | `String?` (VarChar 50) | `leitweg_id` | |
| `matchCode` | `String?` (VarChar 100) | `match_code` | Auto-generated from company |
| `notes` | `String?` (Text) | | |
| `paymentTermDays` | `Int?` | `payment_term_days` | |
| `discountPercent` | `Float?` | `discount_percent` | |
| `discountDays` | `Int?` | `discount_days` | |
| `discountGroup` | `String?` (VarChar 50) | `discount_group` | |
| `ourCustomerNumber` | `String?` (VarChar 50) | `our_customer_number` | |
| `salesPriceListId` | `String?` (UUID) | `sales_price_list_id` | FK → BillingPriceList |
| `purchasePriceListId` | `String?` (UUID) | `purchase_price_list_id` | FK → BillingPriceList |
| `isActive` | `Boolean` | `is_active` | Default true (soft delete) |
| `createdAt` | `DateTime` | `created_at` | |
| `updatedAt` | `DateTime` | `updated_at` | |
| `createdById` | `String?` (UUID) | `created_by_id` | |

### Relations (outgoing)

| Relation | Target | FK |
|----------|--------|-----|
| `tenant` | `Tenant` | `tenantId` → `id`, onDelete: Cascade |
| `salesPriceList` | `BillingPriceList?` | `salesPriceListId` → `id` |
| `purchasePriceList` | `BillingPriceList?` | `purchasePriceListId` → `id` |

### Relations (incoming)

| Relation | Source Model | Notes |
|----------|-------------|-------|
| `contacts` | `CrmContact[]` | |
| `bankAccounts` | `CrmBankAccount[]` | |
| `correspondences` | `CrmCorrespondence[]` | |
| `inquiries` | `CrmInquiry[]` | |
| `tasks` | `CrmTask[]` | |
| `billingDocuments` | `BillingDocument[]` | Primary address |
| `billingDocumentsDelivery` | `BillingDocument[]` | @relation("DeliveryAddress") |
| `billingDocumentsInvoice` | `BillingDocument[]` | @relation("InvoiceAddress") |
| `billingServiceCases` | `BillingServiceCase[]` | |
| `billingRecurringInvoices` | `BillingRecurringInvoice[]` | |
| `articleSuppliers` | `WhArticleSupplier[]` | |
| `purchaseOrders` | `WhPurchaseOrder[]` | |
| `supplierInvoices` | `WhSupplierInvoice[]` | |

### Indexes

| Name | Columns |
|------|---------|
| `uq_crm_addresses_tenant_number` | `[tenantId, number]` (unique) |
| `idx_crm_addresses_tenant_id` | `[tenantId]` |
| `idx_crm_addresses_tenant_type` | `[tenantId, type]` |
| `idx_crm_addresses_tenant_match_code` | `[tenantId, matchCode]` |
| `idx_crm_addresses_tenant_company` | `[tenantId, company]` |

### CrmAddressType Enum

Defined at line 237:
```
enum CrmAddressType {
  CUSTOMER
  SUPPLIER
  BOTH
  @@map("crm_address_type")
}
```

**No `parentAddressId` or self-referencing relation exists yet.**

---

## 2. CRM Address Service

**File:** `src/lib/services/crm-address-service.ts` (623 lines)

### Error Classes (lines 48–81)

- `CrmAddressNotFoundError` — "CRM address not found"
- `CrmAddressValidationError` — custom message
- `CrmAddressConflictError` — custom message
- `CrmContactNotFoundError` — "CRM contact not found"
- `CrmBankAccountNotFoundError` — "CRM bank account not found"

### Service Functions

| Function | Lines | Description |
|----------|-------|-------------|
| `generateLetterSalutation` | 28–44 | Helper for auto-generating letter salutations |
| `list` | 85–97 | Delegates to `repo.findMany`; params: search, type, isActive, page, pageSize |
| `getById` | 99–109 | Calls `repo.findById`, throws `CrmAddressNotFoundError` if null |
| `create` | 111–192 | Validates company name, generates number via `numberSeqService`, auto-generates matchCode, creates via repo, logs audit |
| `update` | 194–269 | Validates existing, builds partial data, calls `repo.update`, logs audit with diff |
| `remove` | 271–294 | Soft-delete via `repo.softDelete`, logs audit |
| `restoreAddress` | 296–317 | Restores via `repo.restore`, logs audit |
| `listContacts` | 321–331 | Lists contacts for an address |
| `createContact` | 333–395 | Validates address exists, auto-generates letterSalutation, creates contact |
| `updateContact` | 397–473 | Updates contact with auto-letterSalutation logic |
| `deleteContact` | 475–494 | Hard-deletes contact |
| `listBankAccounts` | 498–508 | Lists bank accounts for an address |
| `createBankAccount` | 510–552 | Validates address exists, normalizes IBAN, creates bank account |
| `updateBankAccount` | 554–601 | Updates bank account |
| `deleteBankAccount` | 603–622 | Hard-deletes bank account |

### Tenant Isolation Pattern

All functions take `tenantId` as a parameter. The service delegates to repository functions that scope all queries with `tenantId`. The `repo.findById` call uses `findFirst({ where: { id, tenantId } })`.

### Audit Pattern

All mutation functions accept an optional `AuditContext` parameter (`{ userId, ipAddress, userAgent }`). Audit logging uses `auditLog.log()` with `.catch()` to prevent audit failures from breaking the main operation. Updates compute diffs via `auditLog.computeChanges()`.

### Tracked Fields for Audit (line 9–14)

```ts
const ADDRESS_TRACKED_FIELDS = [
  "type", "company", "street", "zip", "city", "country", "phone", "fax",
  "email", "website", "taxNumber", "vatId", "leitwegId", "matchCode", "notes",
  "paymentTermDays", "discountPercent", "discountDays", "discountGroup",
  "ourCustomerNumber", "salesPriceListId", "purchasePriceListId", "isActive",
]
```

---

## 3. CRM Address Repository

**File:** `src/lib/services/crm-address-repository.ts` (282 lines)

### Repository Functions

| Function | Lines | Description |
|----------|-------|-------------|
| `findMany` | 6–56 | Paginated list with search (company/number/matchCode/city), type filter (CUSTOMER also matches BOTH, SUPPLIER also matches BOTH), isActive filter |
| `findById` | 58–72 | `findFirst({ where: { id, tenantId }, include: { contacts, bankAccounts, salesPriceList, purchasePriceList } })` |
| `create` | 74–105 | `prisma.crmAddress.create({ data })` |
| `update` | 107–114 | `tenantScopedUpdate(prisma.crmAddress, { id, tenantId }, data, { entity: "CrmAddress" })` |
| `softDelete` | 116–122 | Sets `isActive: false` via `tenantScopedUpdate` |
| `restore` | 124–130 | Sets `isActive: true` via `tenantScopedUpdate` |
| `hardDelete` | 132–141 | `deleteMany({ where: { id, tenantId } })` |
| `findContacts` | 145–154 | `findMany` with `addressId` and `tenantId` |
| `findContactById` | 156–164 | `findFirst({ where: { id, tenantId } })` |
| `createContact` | 166–185 | `prisma.crmContact.create({ data })` |
| `updateContact` | 187–194 | `tenantScopedUpdate` |
| `deleteContact` | 196–205 | `deleteMany` |
| `findBankAccounts` | 209–218 | |
| `findBankAccountById` | 220–228 | |
| `createBankAccount` | 230–243 | |
| `updateBankAccount` | 245–252 | |
| `deleteBankAccount` | 254–263 | |
| `countContacts` | 267–273 | |
| `countBankAccounts` | 275–281 | |

### Key Pattern: `findById` includes

The `findById` function includes `contacts`, `bankAccounts`, `salesPriceList`, `purchasePriceList`. The new `parentAddress` and `childAddresses` relations will need to be added to this include.

---

## 4. CRM Address Router

**File:** `src/trpc/routers/crm/addresses.ts` (342 lines)

### Permissions Used

```ts
const CRM_VIEW = permissionIdByKey("crm_addresses.view")!
const CRM_CREATE = permissionIdByKey("crm_addresses.create")!
const CRM_EDIT = permissionIdByKey("crm_addresses.edit")!
const CRM_DELETE = permissionIdByKey("crm_addresses.delete")!
```

### Module Guard

```ts
const crmProcedure = tenantProcedure.use(requireModule("crm"))
```

### Procedures

| Procedure | Type | Permission | Input |
|-----------|------|-----------|-------|
| `list` | query | `CRM_VIEW` | search?, type?, isActive? (default true), page (default 1), pageSize (default 25) |
| `getById` | query | `CRM_VIEW` | id (uuid) |
| `create` | mutation | `CRM_CREATE` | type?, company (min 1), street?, zip?, city?, country?, phone?, fax?, email?, website?, taxNumber?, vatId?, leitwegId?, matchCode?, notes?, paymentTermDays?, discountPercent?, discountDays?, discountGroup?, ourCustomerNumber?, salesPriceListId?, purchasePriceListId? |
| `update` | mutation | `CRM_EDIT` | id (uuid), + all create fields as optional/nullable |
| `delete` | mutation | `CRM_DELETE` | id (uuid) |
| `restore` | mutation | `CRM_EDIT` | id (uuid) |
| `contactsList` | query | `CRM_VIEW` | addressId (uuid) |
| `contactsCreate` | mutation | `CRM_EDIT` | addressId, firstName, lastName, salutation?, title?, letterSalutation?, position?, department?, phone?, email?, notes?, isPrimary? |
| `contactsUpdate` | mutation | `CRM_EDIT` | id, + contact fields as optional/nullable |
| `contactsDelete` | mutation | `CRM_EDIT` | id (uuid) |
| `bankAccountsList` | query | `CRM_VIEW` | addressId (uuid) |
| `bankAccountsCreate` | mutation | `CRM_EDIT` | addressId, iban, bic?, bankName?, accountHolder?, isDefault? |
| `bankAccountsUpdate` | mutation | `CRM_EDIT` | id, + bank fields as optional/nullable |
| `bankAccountsDelete` | mutation | `CRM_EDIT` | id (uuid) |

### Router Registration

**File:** `src/trpc/routers/crm/index.ts` (line 16)
```ts
export const crmRouter = createTRPCRouter({
  addresses: crmAddressesRouter,
  correspondence: crmCorrespondenceRouter,
  inquiries: crmInquiriesRouter,
  tasks: crmTasksRouter,
  reports: crmReportsRouter,
  numberSequences: numberSequencesRouter,
})
```

---

## 5. CRM Address Hooks

**File:** `src/hooks/use-crm-addresses.ts` (222 lines)

### Address Hooks

| Hook | Lines | tRPC Procedure | Cache Invalidation |
|------|-------|---------------|-------------------|
| `useCrmAddresses(options)` | 15–30 | `crm.addresses.list` | — |
| `useCrmAddress(id, enabled)` | 32–40 | `crm.addresses.getById` | — |
| `useCreateCrmAddress()` | 42–53 | `crm.addresses.create` | `list` |
| `useUpdateCrmAddress()` | 55–69 | `crm.addresses.update` | `list`, `getById` |
| `useDeleteCrmAddress()` | 71–85 | `crm.addresses.delete` | `list`, `getById` |
| `useRestoreCrmAddress()` | 87–101 | `crm.addresses.restore` | `list`, `getById` |

### Contact Hooks

| Hook | Lines | tRPC Procedure | Cache Invalidation |
|------|-------|---------------|-------------------|
| `useCrmContacts(addressId)` | 105–113 | `crm.addresses.contactsList` | — |
| `useCreateCrmContact()` | 115–129 | `crm.addresses.contactsCreate` | `contactsList`, `getById` |
| `useUpdateCrmContact()` | 131–145 | `crm.addresses.contactsUpdate` | `contactsList`, `getById` |
| `useDeleteCrmContact()` | 147–161 | `crm.addresses.contactsDelete` | `contactsList`, `getById` |

### Bank Account Hooks

| Hook | Lines | tRPC Procedure | Cache Invalidation |
|------|-------|---------------|-------------------|
| `useCrmBankAccounts(addressId)` | 165–173 | `crm.addresses.bankAccountsList` | — |
| `useCreateCrmBankAccount()` | 175–189 | `crm.addresses.bankAccountsCreate` | `bankAccountsList`, `getById` |
| `useUpdateCrmBankAccount()` | 191–205 | `crm.addresses.bankAccountsUpdate` | `bankAccountsList`, `getById` |
| `useDeleteCrmBankAccount()` | 207–221 | `crm.addresses.bankAccountsDelete` | `bankAccountsList`, `getById` |

---

## 6. CRM Address UI Components

### Address Detail Page

**File:** `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx` (415 lines)

Structure:
- Header: company name, number, type badge, status badge, Edit/Deactivate buttons
- **8 Tabs**: overview, contacts, bankAccounts, correspondence, inquiries, tasks, documents, serviceCases
- **Overview Tab** (lines 200–279): Grid of cards showing address, communication, tax, payment, supplier data, notes
- Uses: `useCrmAddress`, `useDeleteCrmAddress`, `useRestoreCrmAddress`, `useDeleteCrmContact`, `useDeleteCrmBankAccount`
- Includes: `AddressFormSheet`, `ContactList`, `ContactFormDialog`, `BankAccountList`, `BankAccountFormDialog`, `CorrespondenceList`, `InquiryList`, `TaskList`, `BillingDocumentList`, `ServiceCaseList`

**Where "Firmenverbund" section should go:** A new card in the overview tab (lines 200–279), or a new tab added to the `TabsList` (line 188). The ticket says "Neuer Abschnitt 'Firmenverbund'" in the detail page. A card in the overview tab grid after the existing cards would be the most natural placement.

### Address List Page

**File:** `src/app/[locale]/(dashboard)/crm/addresses/page.tsx` (255 lines)

Structure:
- Page header with "Neue Adresse" button
- Filter bar: SearchInput, type Select, status Select, clear filters
- Card with `AddressDataTable` component
- Pagination
- `AddressFormSheet` for create/edit
- `ConfirmDialog` for delete confirmation

### Address Data Table

**File:** `src/components/crm/address-data-table.tsx` (199 lines)

Columns: Checkbox, Number, Company, Type (badge), City, Phone, Email, Status (badge), Actions (dropdown menu: view, edit, deactivate/restore)

Interface:
```ts
interface CrmAddress {
  id: string
  number: string
  company: string
  type: 'CUSTOMER' | 'SUPPLIER' | 'BOTH'
  city: string | null
  phone: string | null
  email: string | null
  isActive: boolean
}
```

**Where group indicator should go:** The `CrmAddress` interface would need a `_count?: { childAddresses?: number }` or similar field. A tree icon could be added to the Company column (line 132) next to the company name.

### Address Form Sheet

**File:** `src/components/crm/address-form-sheet.tsx` (555 lines)

Sections: Basic Information, Address, Communication, Tax Information, Payment Terms, Supplier Data, Price Lists, Notes.

### Other CRM Components (for reference)

- `src/components/crm/contact-list.tsx` — Contact list component
- `src/components/crm/contact-form-dialog.tsx` — Contact form dialog
- `src/components/crm/bank-account-list.tsx` — Bank account list
- `src/components/crm/bank-account-form-dialog.tsx` — Bank account form dialog
- `src/components/crm/correspondence-list.tsx`
- `src/components/crm/correspondence-form-sheet.tsx`
- `src/components/crm/correspondence-detail-dialog.tsx`
- `src/components/crm/correspondence-attachment-upload.tsx`
- `src/components/crm/correspondence-attachment-list.tsx`
- `src/components/crm/inquiry-list.tsx`
- `src/components/crm/inquiry-form-sheet.tsx`
- `src/components/crm/inquiry-detail.tsx`
- `src/components/crm/task-list.tsx`
- `src/components/crm/task-form-sheet.tsx`
- `src/components/crm/task-detail-dialog.tsx`
- `src/components/crm/report-address-stats.tsx`
- `src/components/crm/reports-overview.tsx`

---

## 7. Migration Patterns

**Directory:** `supabase/migrations/` (129 files total)

### Naming Convention

Format: `YYYYMMDDHHMMSS_descriptive_name.sql`

Latest 3 migrations:
- `20260403100000_crm_correspondence_attachments.sql`
- `20260404100000_add_crm_attachment_permissions_to_groups.sql`
- `20260405100000_price_list_type_sales_purchase.sql`

### Recent Migration Example

**File:** `supabase/migrations/20260405100000_price_list_type_sales_purchase.sql`

```sql
-- Add type column to billing_price_lists to distinguish sales vs purchase price lists
ALTER TABLE billing_price_lists
  ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'sales';

-- Index for type-based queries
CREATE INDEX idx_billing_price_lists_tenant_type
  ON billing_price_lists (tenant_id, type);

-- Add purchase_price_list_id to crm_addresses
ALTER TABLE crm_addresses
  ADD COLUMN purchase_price_list_id UUID REFERENCES billing_price_lists(id);

-- Rename existing price_list_id to sales_price_list_id
ALTER TABLE crm_addresses
  RENAME COLUMN price_list_id TO sales_price_list_id;

-- Index for purchase price list lookups
CREATE INDEX idx_crm_addresses_purchase_price_list
  ON crm_addresses (tenant_id, purchase_price_list_id);
```

**Next migration number:** `20260406100000` (following the pattern)

---

## 8. Existing Self-Referencing Patterns

### Department Model

**File:** `prisma/schema.prisma`, lines 1305–1333

```prisma
model Department {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String   @map("tenant_id") @db.Uuid
  parentId          String?  @map("parent_id") @db.Uuid
  // ...
  parent    Department?  @relation("DepartmentTree", fields: [parentId], references: [id], onDelete: SetNull)
  children  Department[] @relation("DepartmentTree")
  // ...
  @@index([parentId], map: "idx_departments_parent")
}
```

**Service:** `src/lib/services/department-service.ts` (335 lines)

Circular reference check (lines 46–65):
```ts
async function checkCircularReference(
  prisma: PrismaClient, tenantId: string,
  deptId: string, proposedParentId: string
): Promise<boolean> {
  const visited = new Set<string>([deptId])
  let current: string | null = proposedParentId
  while (current !== null) {
    if (visited.has(current)) return true
    visited.add(current)
    const record = await repo.findParentId(prisma, tenantId, current)
    if (!record) break
    current = record.parentId
  }
  return false
}
```

Parent validation in `update()` (lines 223–255):
1. Self-reference check: `input.parentId === input.id`
2. Parent existence + same-tenant check via `repo.findById(prisma, tenantId, input.parentId)`
3. Deep circular reference check via `checkCircularReference()`

**Repository:** `src/lib/services/department-repository.ts` (127 lines)

Key helper: `findParentId(prisma, tenantId, id)` — returns `{ parentId: true }` select for the circular reference walk.

Also: `countChildren(prisma, tenantId, parentId)` — used to prevent deleting departments with children.

### WhArticleGroup Model

**File:** `prisma/schema.prisma`, lines 4198–4214

```prisma
model WhArticleGroup {
  parentId  String?  @map("parent_id") @db.Uuid
  parent   WhArticleGroup?  @relation("ArticleGroupTree", fields: [parentId], references: [id], onDelete: SetNull)
  children WhArticleGroup[] @relation("ArticleGroupTree")
  @@index([tenantId, parentId])
}
```

**Service:** `src/lib/services/wh-article-group-service.ts` (151 lines)

Same circular reference check pattern (lines 28–47). Also prevents deletion when children or articles exist.

### BillingDocument Self-Reference

**File:** `prisma/schema.prisma`, lines 687, 737–738

```prisma
parentDocumentId    String?                @map("parent_document_id") @db.Uuid
parentDocument   BillingDocument?          @relation("DocumentChain", fields: [parentDocumentId], references: [id], onDelete: SetNull)
childDocuments      BillingDocument[]         @relation("DocumentChain")
```

---

## 9. Revenue/Stats Queries

### CRM Report Service

**File:** `src/lib/services/crm-report-service.ts` (378 lines)

| Function | Lines | Description |
|----------|-------|-------------|
| `overview` | 17–65 | Counts: totalAddresses, newAddressesThisMonth, openInquiries, pendingTasks, overdueTaskCount, correspondenceThisWeek |
| `addressStats` | 67–98 | Groups by type, counts active/inactive |
| `correspondenceByPeriod` | 100–148 | Raw SQL with date_trunc, groups by period and direction |
| `correspondenceByType` | 150–169 | Groups by type |
| `inquiryPipeline` | 171–238 | Groups by status, calculates avgDaysToClose, top 10 addresses by inquiry count |
| `inquiryByEffort` | 240–266 | Groups by effort |
| `taskCompletion` | 268–322 | Counts total/completed/cancelled/overdue, calculates completionRate, avgCompletionDays |
| `tasksByAssignee` | 324–378 | Raw SQL joining task_assignees, tasks, employees |

### CRM Reports Router

**File:** `src/trpc/routers/crm/reports.ts` (157 lines)

Procedures: `overview`, `addressStats`, `correspondenceByPeriod`, `correspondenceByType`, `inquiryPipeline`, `inquiryByEffort`, `taskCompletion`, `tasksByAssignee`.

### BillingDocument Revenue Fields

**File:** `prisma/schema.prisma`, lines 706–708

```prisma
subtotalNet         Float    @default(0) @map("subtotal_net")
totalVat            Float    @default(0) @map("total_vat")
totalGross          Float    @default(0) @map("total_gross")
```

The `BillingDocument` model links to `CrmAddress` via `addressId` (line 679). Document types include INVOICE and CREDIT_NOTE which would be relevant for revenue calculation.

**No existing revenue aggregation per address exists.** There are no queries that sum `totalGross` or `subtotalNet` grouped by address. The `getGroupRevenue` function described in the ticket would be entirely new functionality.

To aggregate revenue per group, the query would need to:
1. Get the parent address ID and all child address IDs
2. Sum `subtotalNet` / `totalGross` from `billing_documents` where `address_id IN (parent + children)` and `type = 'INVOICE'` (minus CREDIT_NOTE)
3. Filter by `tenant_id` and optional date range

---

## 10. Handbook

**File:** `docs/TERP_HANDBUCH.md`

### CRM Section Location

Lines 4172–4287: Section "12. CRM -- Kunden- und Lieferantenverwaltung"

### Subsections

- 12.1 Adressen verwalten (line 4174)
- 12.2 Kontaktpersonen (line 4289)
- 12.3 Bankverbindungen
- 12.4 Nummernkreise
- 12.5 Korrespondenz

### Address List Section (lines 4188–4207)

Table columns documented: Nummer, Firma, Typ, Ort, Telefon, E-Mail, Status, Aktionen.

No mention of Konzern/group indicator.

### Address Detail Section (lines 4256–4287)

Documents 8 tabs: Ubersicht, Kontakte, Bankverbindungen, Korrespondenz, Anfragen, Aufgaben, Belege, Kundendienst.

Overview tab cards: Anschrift, Kommunikation, Steuerinformationen, Zahlungsbedingungen, Lieferantendaten, Notizen.

No mention of Firmenverbund section.

### What Needs Updating

1. **Address list table** (line 4190): Add a column or indicator for "Konzern" (group icon)
2. **Address detail overview tab** (line 4264): Add a "Firmenverbund" card
3. **New subsection**: A new subsection (e.g., 12.X Firmenverbund / Konzernzuordnung) explaining the parent-child hierarchy feature

---

## 11. Test Patterns

### Router Tests

**File:** `src/trpc/routers/__tests__/crmAddresses-router.test.ts` (555 lines)

#### Test Structure

Uses `vi.mock` for the DB module (`@/lib/db`), defines permission constants, and uses `createCallerFactory` with the router.

#### Helper Functions

- `withModuleMock(prisma)` — merges module mock into prisma
- `createTestContext(prisma, permissions)` — creates full mock context
- `createNoPermContext(prisma)` — creates context with no permissions

#### Test Context Factory (from helpers.ts)

**File:** `src/trpc/routers/__tests__/helpers.ts`

Uses `createMockContext`, `createMockSession`, `createUserWithPermissions`, `createMockUserTenant` and `autoMockPrisma` for auto-stubbing missing Prisma methods.

#### Test Pattern

Each test:
1. Creates a mock `prisma` object with the needed model methods
2. Creates a test context with `createTestContext(prisma)`
3. Creates a caller with `createCaller(ctx)`
4. Calls the procedure and asserts results

Example (lines 104–135):
```ts
describe("crm.addresses.list", () => {
  it("returns paginated addresses", async () => {
    const prisma = {
      crmAddress: {
        findMany: vi.fn().mockResolvedValue([mockAddress]),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createTestContext(prisma))
    const result = await caller.list({ page: 1, pageSize: 10 })
    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
  })
})
```

#### Mock Address Object (lines 69–100)

```ts
const mockAddress = {
  id: ADDRESS_ID,
  tenantId: TENANT_ID,
  number: "K-1",
  type: "CUSTOMER",
  company: "Test GmbH",
  street: "Teststr. 1",
  zip: "12345",
  city: "Berlin",
  country: "DE",
  phone: "+49123456",
  fax: null,
  email: "test@test.de",
  website: null,
  taxNumber: null, vatId: null, matchCode: "TEST GMBH",
  notes: null, paymentTermDays: 30,
  discountPercent: null, discountDays: null, discountGroup: null,
  ourCustomerNumber: null,
  salesPriceListId: null, purchasePriceListId: null,
  isActive: true,
  createdAt: new Date(), updatedAt: new Date(),
  createdById: USER_ID,
  contacts: [], bankAccounts: [],
}
```

**No existing service-level tests exist** (`src/lib/services/__tests__/crm-address-service.test.ts` does not exist).

### Other CRM Test Files

- `src/trpc/routers/__tests__/crmCorrespondence-router.test.ts`
- `src/trpc/routers/__tests__/crmInquiries-router.test.ts`
- `src/trpc/routers/__tests__/crmReports-router.test.ts`
- `src/trpc/routers/__tests__/crmTasks-router.test.ts`

---

## 12. Error Mapping

**File:** `src/trpc/errors.ts` (107 lines)

`handleServiceError` maps error class names:
- `*NotFoundError` → tRPC `NOT_FOUND`
- `*ValidationError` / `*InvalidError` → tRPC `BAD_REQUEST`
- `*ConflictError` / `*DuplicateError` → tRPC `CONFLICT`
- `*ForbiddenError` / `*AccessDeniedError` → tRPC `FORBIDDEN`

The existing `CrmAddressValidationError` will automatically map to `BAD_REQUEST`, which is appropriate for hierarchy validation errors (circular reference, max depth, type mismatch).

---

## 13. i18n / Translations

**Files:** `messages/de.json`, `messages/en.json`

The `crmAddresses` namespace (de.json line 5143–5261) contains all existing CRM address translations. New keys for Firmenverbund would be added here, e.g.:
- `sectionGroup` / `labelParentAddress` / `labelChildAddresses`
- `groupIndicatorTooltip`
- Validation error messages

---

## 14. Utility: tenantScopedUpdate

**File:** `src/lib/services/prisma-helpers.ts` (87 lines)

`tenantScopedUpdate(delegate, where, data, opts)`:
1. Calls `updateMany({ where: { id, tenantId }, data })`
2. Checks `count === 0` → throws `TenantScopedNotFoundError`
3. Refetches with `findFirst` including optional `include`/`select`

This is the standard pattern for all repository updates.

---

## 15. Summary of Key Files for CRM_09 Implementation

### Must Modify

| File | What to Change |
|------|---------------|
| `prisma/schema.prisma` (line 285) | Add `parentAddressId`, `parentAddress`, `childAddresses` to CrmAddress |
| `supabase/migrations/20260406100000_crm_address_parent_hierarchy.sql` | New migration: ADD COLUMN, FK, INDEX |
| `src/lib/services/crm-address-repository.ts` | Add `findParentId`, `countChildren`, update `findById` include, add `findByIdBasic` for validation |
| `src/lib/services/crm-address-service.ts` | Add `setParentAddress`, `getAddressWithHierarchy`, `getGroupRevenue` |
| `src/trpc/routers/crm/addresses.ts` | Add `setParent`, `getHierarchy`, `getGroupStats` procedures |
| `src/hooks/use-crm-addresses.ts` | Add `useCrmAddressHierarchy`, `useSetCrmAddressParent`, `useCrmGroupStats` |
| `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx` | Add "Firmenverbund" section in overview tab |
| `src/components/crm/address-data-table.tsx` | Add group indicator icon |
| `src/trpc/routers/__tests__/crmAddresses-router.test.ts` | Add hierarchy tests |
| `messages/de.json` | Add Firmenverbund translations |
| `messages/en.json` | Add Firmenverbund translations |
| `docs/TERP_HANDBUCH.md` (line ~4264) | Document Firmenverbund feature |

### May Create

| File | Purpose |
|------|---------|
| `src/components/crm/address-group-section.tsx` | Firmenverbund section component |
| `src/components/crm/address-parent-search.tsx` | Konzern search/assign dialog |

### Reference Patterns

| Pattern | Reference File |
|---------|---------------|
| Self-referencing relation | `department-service.ts` (checkCircularReference at line 46) |
| Self-referencing Prisma | `prisma/schema.prisma` Department model at line 1305 |
| Repository countChildren | `department-repository.ts` (countChildren at line 109) |
| findParentId for circular walk | `department-repository.ts` (findParentId at line 63) |
| Revenue aggregation fields | BillingDocument `subtotalNet`/`totalGross` at schema line 706 |
| Raw SQL aggregation | `crm-report-service.ts` correspondenceByPeriod at line 100 |
