# Research: CRM_06 — "Unsere Kundennummer" beim Lieferanten

Date: 2026-03-25

---

## 1. Prisma Schema — CrmAddress Model

**File:** `/home/tolga/projects/terp/prisma/schema.prisma`, lines 281-332

The `CrmAddress` model currently has these fields:

```prisma
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
  leitwegId       String?        @map("leitweg_id") @db.VarChar(50)
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

  // Relations
  tenant          Tenant               @relation(...)
  contacts        CrmContact[]
  bankAccounts    CrmBankAccount[]
  correspondences CrmCorrespondence[]
  inquiries       CrmInquiry[]
  tasks           CrmTask[]
  billingDocuments         BillingDocument[]
  billingDocumentsDelivery BillingDocument[] @relation("DeliveryAddress")
  billingDocumentsInvoice  BillingDocument[] @relation("InvoiceAddress")
  billingServiceCases      BillingServiceCase[]
  billingRecurringInvoices BillingRecurringInvoice[]
  priceList                BillingPriceList?    @relation(...)
  articleSuppliers         WhArticleSupplier[]
  purchaseOrders           WhPurchaseOrder[]
  supplierInvoices         WhSupplierInvoice[]

  @@unique([tenantId, number], map: "uq_crm_addresses_tenant_number")
  @@index([tenantId], map: "idx_crm_addresses_tenant_id")
  @@index([tenantId, type], map: "idx_crm_addresses_tenant_type")
  @@index([tenantId, matchCode], map: "idx_crm_addresses_tenant_match_code")
  @@index([tenantId, company], map: "idx_crm_addresses_tenant_company")
  @@map("crm_addresses")
}
```

**No `ourCustomerNumber` field exists yet.**

### CrmAddressType Enum (line 233)

```prisma
enum CrmAddressType {
  CUSTOMER
  SUPPLIER
  BOTH
  @@map("crm_address_type")
}
```

---

## 2. CRM Address Service

**File:** `/home/tolga/projects/terp/src/lib/services/crm-address-service.ts`

### Tracked Fields for Audit (line 9-14)

```ts
const ADDRESS_TRACKED_FIELDS = [
  "type", "company", "street", "zip", "city", "country", "phone", "fax",
  "email", "website", "taxNumber", "vatId", "leitwegId", "matchCode", "notes",
  "paymentTermDays", "discountPercent", "discountDays", "discountGroup",
  "priceListId", "isActive",
]
```

**`ourCustomerNumber` must be added here.**

### `create` method (line 90-167)

Input type (lines 93-114):
```ts
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
  leitwegId?: string
  matchCode?: string
  notes?: string
  paymentTermDays?: number
  discountPercent?: number
  discountDays?: number
  discountGroup?: string
  priceListId?: string | null
}
```

The field values are passed to `repo.create()` on lines 132-156. Each optional string field follows the pattern: `fieldName: input.fieldName || null`.

### `update` method (line 169-242)

Input type (lines 172-194):
```ts
input: {
  id: string
  type?: CrmAddressType
  company?: string
  street?: string | null
  zip?: string | null
  // ... all other fields as optional, nullable
  priceListId?: string | null
}
```

The update uses a `directFields` array (lines 213-218) to iterate over optional fields:
```ts
const directFields = [
  "type", "street", "zip", "city", "country", "phone", "fax",
  "email", "website", "taxNumber", "vatId", "leitwegId", "matchCode", "notes",
  "paymentTermDays", "discountPercent", "discountDays", "discountGroup",
  "priceListId",
] as const
```

**`ourCustomerNumber` must be added to this array.**

---

## 3. CRM Address Repository

**File:** `/home/tolga/projects/terp/src/lib/services/crm-address-repository.ts`

### `create` method (lines 73-102)

Data parameter type includes all fields explicitly. The new field needs to be added:
```ts
data: {
  tenantId: string
  number: string
  type: CrmAddressType
  company: string
  // ... all optional fields ...
  priceListId?: string | null
  createdById?: string | null
}
```
Calls `prisma.crmAddress.create({ data })`.

### `findById` method (lines 58-71)

Includes `contacts`, `bankAccounts`, and `priceList`. No changes needed for the new field -- it comes automatically from the model.

### `update` method (lines 104-111)

Takes `data: Record<string, unknown>` -- **no changes needed** since it passes data generically.

---

## 4. CRM Address tRPC Router

**File:** `/home/tolga/projects/terp/src/trpc/routers/crm/addresses.ts`

### `create` input schema (lines 60-81)

```ts
z.object({
  type: z.enum(["CUSTOMER", "SUPPLIER", "BOTH"]).optional().default("CUSTOMER"),
  company: z.string().min(1, "Company is required").max(500),
  // ... all other fields ...
  priceListId: z.string().uuid().nullable().optional(),
})
```

**`ourCustomerNumber` needs to be added as: `z.string().max(50).optional()`**

### `update` input schema (lines 98-120)

```ts
z.object({
  id: z.string().uuid(),
  type: z.enum(["CUSTOMER", "SUPPLIER", "BOTH"]).optional(),
  company: z.string().min(1).max(500).optional(),
  // ... all other fields ...
  priceListId: z.string().uuid().nullable().optional(),
})
```

**`ourCustomerNumber` needs to be added as: `z.string().max(50).nullable().optional()`**

### Router structure (from `/home/tolga/projects/terp/src/trpc/routers/crm/index.ts`)

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

## 5. Address Form UI

**File:** `/home/tolga/projects/terp/src/components/crm/address-form-sheet.tsx`

### FormState interface (lines 28-49)

```ts
interface FormState {
  type: 'CUSTOMER' | 'SUPPLIER' | 'BOTH'
  company: string
  matchCode: string
  // ... all other string fields ...
  notes: string
}
```

### INITIAL_STATE (lines 51-72)

All fields initialized as empty strings (except `type: 'CUSTOMER'` and `country: 'DE'`).

### AddressFormSheetProps.address type (lines 77-99)

Explicitly typed with all fields. `ourCustomerNumber` needs to be added.

### Effect to populate form from address (lines 115-145)

Maps `address` fields to `form` state on open. Pattern: `fieldName: address.fieldName || ''`.

### handleSubmit payload (lines 162-182)

Constructs payload object. Pattern: `fieldName: form.fieldName.trim() || undefined`.

### Form sections rendered

The form has these sections:
1. **Basic Information** (lines 219-258): Type select, MatchCode, Company
2. **Address** (lines 261-301): Street, Zip, City, Country
3. **Communication** (lines 304-346): Phone, Fax, Email, Website
4. **Tax Information** (lines 349-382): TaxNumber, VatId, Leitweg-ID
5. **Payment Terms** (lines 384-429): PaymentTermDays, DiscountPercent, DiscountDays, DiscountGroup
6. **Price List** (lines 431-456): PriceListId select
7. **Notes** (lines 458-471): Notes textarea

**The new "Unsere Kundennummer" field should be added as a new section or within an existing section, conditionally visible when `form.type === 'SUPPLIER' || form.type === 'BOTH'`.**

No existing conditional visibility based on type exists in the form -- this will be the first field with type-conditional rendering.

---

## 6. Address Detail Page (Overview Tab)

**File:** `/home/tolga/projects/terp/src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx`

The overview tab (lines 200-262) displays fields in 4 cards:
1. Address card (Street, Zip, City, Country)
2. Communication card (Phone, Fax, Email, Website)
3. Tax card (TaxNumber, VatId, MatchCode)
4. Payment card (PaymentTermDays, DiscountPercent, DiscountDays, DiscountGroup, PriceList)

**`ourCustomerNumber` should be displayed conditionally (when address type is SUPPLIER or BOTH) in the overview, likely in a "Lieferantendaten" section or the Tax card.**

---

## 7. Purchase Order Detail Page

**File:** `/home/tolga/projects/terp/src/components/warehouse/purchase-order-detail.tsx`

### Supplier info display (lines 135-144, 217-224)

The supplier is typed as:
```ts
const supplier = order.supplier as {
  id: string
  company?: string | null
  number?: string | null
} | null
```

And displayed as:
```tsx
<DetailRow
  label={t('detailSupplier')}
  value={
    supplier
      ? `${supplier.number ? supplier.number + ' — ' : ''}${supplier.company || ''}`
      : undefined
  }
/>
```

**The `ourCustomerNumber` should be shown as a new `DetailRow` after the supplier row, conditionally when `supplier?.ourCustomerNumber` exists.**

### Purchase Order Repository — `findById` includes full supplier

**File:** `/home/tolga/projects/terp/src/lib/services/wh-purchase-order-repository.ts`, lines 65-86

```ts
return prisma.whPurchaseOrder.findFirst({
  where: { id, tenantId },
  include: {
    supplier: true,  // <-- includes ALL CrmAddress fields
    contact: true,
    inquiry: { select: { id: true, number: true, title: true } },
    positions: { ... },
  },
})
```

Since `supplier: true` includes all fields, `ourCustomerNumber` will automatically be available after adding it to the schema. **No repository changes needed.**

---

## 8. Latest Migration Number

**Directory:** `/home/tolga/projects/terp/supabase/migrations/`

Latest migrations:
```
20260327120000_add_supplier_invoice_permissions_to_groups.sql
```

**Next migration should be: `20260328100000_crm_address_our_customer_number.sql`**

---

## 9. Hook Files

**File:** `/home/tolga/projects/terp/src/hooks/use-crm-addresses.ts`

Hooks defined (exported via `/home/tolga/projects/terp/src/hooks/index.ts`, lines 660-676):
- `useCrmAddresses` — list query
- `useCrmAddress` — single address query
- `useCreateCrmAddress` — create mutation
- `useUpdateCrmAddress` — update mutation (invalidates both list and getById)
- `useDeleteCrmAddress` — delete mutation
- `useRestoreCrmAddress` — restore mutation

**No changes needed in hooks.** The hooks are generic wrappers around tRPC mutations/queries and pass through all input fields.

---

## 10. Existing Test Patterns

**File:** `/home/tolga/projects/terp/src/trpc/routers/__tests__/crmAddresses-router.test.ts`

### Test Setup Pattern

```ts
import { createCallerFactory } from "@/trpc/init"
import { crmAddressesRouter } from "../crm/addresses"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { createMockContext, createMockSession, createUserWithPermissions, createMockUserTenant } from "./helpers"

// Mock the db module for requireModule middleware
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
    },
  },
}))

const createCaller = createCallerFactory(crmAddressesRouter)
```

### Context Factory Pattern

```ts
function createTestContext(prisma, permissions = [CRM_VIEW, CRM_CREATE, CRM_EDIT, CRM_DELETE]) {
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
```

### Mock Address Object (lines 69-98)

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
  taxNumber: null,
  vatId: null,
  matchCode: "TEST GMBH",
  notes: null,
  paymentTermDays: 30,
  discountPercent: null,
  discountDays: null,
  discountGroup: null,
  priceListId: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: USER_ID,
  contacts: [],
  bankAccounts: [],
}
```

**`ourCustomerNumber: null` needs to be added to this mock.**

### Existing Test Cases

- `crm.addresses.list` — returns paginated, rejects without permission
- `crm.addresses.create` — creates with auto number, rejects without permission
- `crm.addresses.getById` — returns with relations, throws not found for wrong tenant
- `crm.addresses.delete` — soft-deletes (sets isActive=false)
- `crm.addresses.restore` — restores soft-deleted
- `crm.addresses.contactsCreate` — creates contact for existing address
- `crm.addresses.bankAccountsCreate` — creates bank account for existing address

### Tests Needed for CRM_06

Following existing patterns, add:
1. `crm.addresses.update` — saves `ourCustomerNumber` (mock `findFirst` + `updateMany`)
2. `crm.addresses.getById` — returns `ourCustomerNumber` field
3. Tenant isolation — `ourCustomerNumber` only visible for own tenant's addresses (covered by existing tenant scoping)

---

## 11. i18n Translations

**File:** `/home/tolga/projects/terp/messages/de.json`

### crmAddresses namespace (lines 5131-5230+)

Relevant existing keys:
```json
"sectionTax": "Steuerinformationen",
"sectionPayment": "Zahlungsbedingungen",
"labelTaxNumber": "Steuernummer",
"labelVatId": "USt-IdNr.",
```

**Keys to add:**
```json
"sectionSupplier": "Lieferantendaten",
"labelOurCustomerNumber": "Unsere Kundennummer"
```

### warehousePurchaseOrders namespace

Relevant existing keys (lines 5768-5775):
```json
"detailSupplier": "Lieferant",
"detailContact": "Ansprechpartner",
```

**Key to add:**
```json
"detailOurCustomerNumber": "Unsere Kundennummer"
```

---

## 12. Summary of All Files to Modify

| # | File | Change |
|---|------|--------|
| 1 | `prisma/schema.prisma` | Add `ourCustomerNumber` field to `CrmAddress` model |
| 2 | `supabase/migrations/20260328100000_crm_address_our_customer_number.sql` | New migration: `ALTER TABLE crm_addresses ADD COLUMN our_customer_number VARCHAR(50)` |
| 3 | `src/lib/services/crm-address-service.ts` | Add to `ADDRESS_TRACKED_FIELDS`, `create` input type, `create` field mapping, `update` input type, `directFields` array |
| 4 | `src/lib/services/crm-address-repository.ts` | Add to `create` data type parameter |
| 5 | `src/trpc/routers/crm/addresses.ts` | Add to `create` and `update` Zod schemas |
| 6 | `src/components/crm/address-form-sheet.tsx` | Add to `FormState`, `INITIAL_STATE`, `AddressFormSheetProps.address`, effect, payload, and render (conditionally when type is SUPPLIER or BOTH) |
| 7 | `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx` | Add `DetailRow` for `ourCustomerNumber` (conditionally when type is SUPPLIER or BOTH) |
| 8 | `src/components/warehouse/purchase-order-detail.tsx` | Add `DetailRow` for `ourCustomerNumber` after supplier row (conditionally when value exists) |
| 9 | `messages/de.json` | Add translation keys for the new field |
| 10 | `src/trpc/routers/__tests__/crmAddresses-router.test.ts` | Add `ourCustomerNumber` to mock, add update/getById test cases |

### Files NOT needing changes

- `src/hooks/use-crm-addresses.ts` — hooks are generic pass-through
- `src/hooks/index.ts` — no new hooks needed
- `src/lib/services/wh-purchase-order-repository.ts` — already uses `supplier: true` include
- `src/trpc/routers/crm/index.ts` — no structural changes
