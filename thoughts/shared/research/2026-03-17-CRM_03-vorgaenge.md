# Research: CRM_03 Vorgänge / Inquiries

**Date:** 2026-03-17
**Ticket:** `thoughts/shared/tickets/orgAuftrag/TICKET_CRM_03_VORGAENGE.md`

---

## 1. CRM Router Patterns (Reference: CRM_01 & CRM_02)

### CRM Router Index (`src/trpc/routers/crm/index.ts`)

The CRM module uses a nested router structure. Each sub-domain has its own file, merged in the index:

```ts
import { createTRPCRouter } from "@/trpc/init"
import { crmAddressesRouter } from "./addresses"
import { crmCorrespondenceRouter } from "./correspondence"
import { numberSequencesRouter } from "./numberSequences"

export const crmRouter = createTRPCRouter({
  addresses: crmAddressesRouter,
  correspondence: crmCorrespondenceRouter,
  numberSequences: numberSequencesRouter,
})
```

The CRM router is registered in `src/trpc/routers/_app.ts` as `crm: crmRouter` (line 157). **New inquiries router must be added here as `inquiries: crmInquiriesRouter`.**

### Router Pattern (`src/trpc/routers/crm/correspondence.ts`)

Key patterns from the correspondence router:

1. **Permission constants** at top using `permissionIdByKey()`:
   ```ts
   const CORR_VIEW = permissionIdByKey("crm_correspondence.view")!
   const CORR_CREATE = permissionIdByKey("crm_correspondence.create")!
   ```

2. **Base procedure with module guard**:
   ```ts
   const crmProcedure = tenantProcedure.use(requireModule("crm"))
   ```

3. **Procedure chain**: `crmProcedure.use(requirePermission(PERM)).input(schema).query/mutation(handler)`

4. **Handler pattern**: `try { return await service.method(ctx.prisma as unknown as PrismaClient, ctx.tenantId!, ...) } catch (err) { handleServiceError(err) }`

5. **Delete returns**: `{ success: true }`

6. **Service import**: `import * as crmCorrespondenceService from "@/lib/services/crm-correspondence-service"`

7. **PrismaClient cast**: `ctx.prisma as unknown as PrismaClient` (required due to type mismatch)

### Addresses Router (`src/trpc/routers/crm/addresses.ts`)

Identical pattern. Has sub-procedures for contacts and bank accounts (flat, not nested):
- `contactsList`, `contactsCreate`, `contactsUpdate`, `contactsDelete`
- `bankAccountsList`, `bankAccountsCreate`, etc.

**Imports used**: `z`, `createTRPCRouter`, `tenantProcedure`, `handleServiceError`, `requirePermission`, `requireModule`, `permissionIdByKey`, service module, `PrismaClient` type.

---

## 2. Service + Repository Pattern

### Service (`src/lib/services/crm-correspondence-service.ts`)

Pattern:
- **Error classes** at top: `CrmCorrespondenceNotFoundError`, `CrmCorrespondenceValidationError`
- **Functions accept**: `(prisma: PrismaClient, tenantId: string, ...)`
- **Delegates to repo** for data access
- **Validates** cross-entity references (address belongs to tenant, contact belongs to address)
- **Update** builds partial data object from input fields

Error class naming convention determines HTTP status code in `handleServiceError`:
- `*NotFoundError` → `NOT_FOUND`
- `*ValidationError` → `BAD_REQUEST`
- `*ConflictError` → `CONFLICT`
- `*ForbiddenError` → `FORBIDDEN`

### Repository (`src/lib/services/crm-correspondence-repository.ts`)

Pattern:
- Pure Prisma queries, no business logic
- `findMany()` builds `where` object with optional filters, returns `{ items, total }` via `Promise.all([findMany, count])`
- `findById()` uses `findFirst` with `{ id, tenantId }` and `include`
- `create()` takes data object, calls `prisma.model.create({ data })`
- `update()` uses `updateMany` for tenant-scoped update, then `findFirst` to return updated record
- `remove()` uses `deleteMany` with `{ id, tenantId }`, returns `count > 0`

### Address Service (`src/lib/services/crm-address-service.ts`)

Shows the NumberSequence integration pattern:
```ts
import * as numberSeqService from "./number-sequence-service"

// In create():
const numberKey = type === "SUPPLIER" ? "supplier" : "customer"
const number = await numberSeqService.getNextNumber(prisma, tenantId, numberKey)
```

---

## 3. NumberSequence Pattern

### Model (`prisma/schema.prisma`, line 241)

```prisma
model NumberSequence {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  key       String   @db.VarChar(50)
  prefix    String   @default("") @db.VarChar(20)
  nextValue Int      @default(1) @map("next_value")
  ...
  @@unique([tenantId, key], map: "uq_number_sequences_tenant_key")
  @@map("number_sequences")
}
```

### Service (`src/lib/services/number-sequence-service.ts`)

Key function:
```ts
const DEFAULT_PREFIXES: Record<string, string> = {
  customer: "K-",
  supplier: "L-",
}

export async function getNextNumber(prisma, tenantId, key): Promise<string> {
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

**For CRM_03**: Add `inquiry: "V-"` (Vorgang) to `DEFAULT_PREFIXES`. The key used will be `"inquiry"`. The upsert auto-creates the sequence on first use.

### Router (`src/trpc/routers/crm/numberSequences.ts`)

Simple router with `list` and `update` — allows admin to configure prefix/nextValue. Gated by `settings.manage` permission. **No changes needed** for CRM_03 since the sequence auto-creates.

---

## 4. Order Model Integration

### Order Model (`prisma/schema.prisma`, line 1131)

```prisma
model Order {
  id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId           String    @map("tenant_id") @db.Uuid
  code               String    @db.VarChar(50)
  name               String    @db.VarChar(255)
  description        String?   @db.Text
  status             String    @default("active") @db.VarChar(20)
  customer           String?   @db.VarChar(255)
  costCenterId       String?   @map("cost_center_id") @db.Uuid
  billingRatePerHour Decimal?  @map("billing_rate_per_hour") @db.Decimal(10, 2)
  validFrom          DateTime? @map("valid_from") @db.Date
  validTo            DateTime? @map("valid_to") @db.Date
  isActive           Boolean   @default(true) @map("is_active")
  ...
  @@unique([tenantId, code], map: "orders_tenant_id_code_key")
  @@map("orders")
}
```

### Order Service (`src/lib/services/order-service.ts`)

Key `create` signature:
```ts
export async function create(prisma, tenantId, input: {
  code: string
  name: string
  description?: string
  status?: string
  customer?: string
  costCenterId?: string
  billingRatePerHour?: number
  validFrom?: string
  validTo?: string
})
```

**For CRM_03 `createOrder`**: The inquiry service needs to:
1. Generate a unique code (e.g., from inquiry number: `"CRM-V-1"`)
2. Call `orderService.create(prisma, tenantId, { code, name: inquiry.title, customer: address.company })`
3. Link the resulting order via `orderId` on the inquiry

**For `close` with `closeLinkedOrder`**: Update the linked order's `status` to `"completed"` or `"closed"` via `orderService.update(prisma, tenantId, { id: orderId, status: "completed" })`.

### Order Repository (`src/lib/services/order-repository.ts`)

Uses `findByCode(prisma, tenantId, code)` for uniqueness checks. The `update` function accepts a generic `Record<string, unknown>` data object.

---

## 5. Permission Catalog (`src/lib/auth/permission-catalog.ts`)

### Pattern

```ts
function p(key, resource, action, description): Permission {
  return { id: permissionId(key), key, resource, action, description }
}

export const ALL_PERMISSIONS: Permission[] = [
  // ...
  // CRM Module
  p("crm_addresses.view", "crm_addresses", "view", "View CRM addresses"),
  // ...
  // CRM Correspondence
  p("crm_correspondence.view", "crm_correspondence", "view", "View CRM correspondence"),
  // ...
]
```

**For CRM_03**, add after the correspondence permissions (line ~234):
```ts
// CRM Inquiries
p("crm_inquiries.view", "crm_inquiries", "view", "View CRM inquiries"),
p("crm_inquiries.create", "crm_inquiries", "create", "Create CRM inquiries"),
p("crm_inquiries.edit", "crm_inquiries", "edit", "Edit CRM inquiries"),
p("crm_inquiries.delete", "crm_inquiries", "delete", "Delete CRM inquiries"),
```

### Seed Data

Permissions are generated deterministically from the key via UUID v5. No seed SQL needed — they're computed at runtime.

---

## 6. Module System (`src/lib/modules/index.ts`)

### requireModule middleware

```ts
export function requireModule(module: string) {
  return createMiddleware(async ({ ctx, next }) => {
    const { tenantId, prisma } = ctx
    if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant ID required" })
    if (module === "core") return next({ ctx })
    const enabled = await hasModule(prisma, tenantId, module)
    if (!enabled) throw new TRPCError({ code: "FORBIDDEN", message: `Module "${module}" is not enabled...` })
    return next({ ctx })
  })
}
```

All CRM routers use: `const crmProcedure = tenantProcedure.use(requireModule("crm"))`

### Module Constants (`src/lib/modules/constants.ts`)

The `"crm"` module is already defined. The doc comment in index.ts shows: `"crm" — CRM (addresses, contacts, correspondence, inquiries)` — inquiries already mentioned.

---

## 7. Test Patterns

### Unit/Service Tests (`src/lib/services/__tests__/crm-correspondence-service.test.ts`)

Pattern:
- **Constants**: Fixed UUIDs (`TENANT_ID`, `USER_ID`, `ADDRESS_ID`, etc.)
- **Mock data objects** for each entity
- **`createMockPrisma()`**: Returns object with mocked model methods (`vi.fn()`)
- **Tests structure**: `describe("service-name") > describe("method") > it("behavior")`
- **Mock setup**: `(prisma.model.method as ReturnType<typeof vi.fn>).mockResolvedValue(data)`
- **Assertions**: `expect(result.field).toBe(...)`, `expect(prisma.model.method).toHaveBeenCalledWith(...)`
- **Error tests**: `await expect(service.method(...)).rejects.toThrow("message")`

### Router/Integration Tests (`src/trpc/routers/__tests__/crmCorrespondence-router.test.ts`)

Pattern:
- **Module mock** at top: `vi.mock("@/lib/db", () => ({ prisma: { tenantModule: { findMany: vi.fn()..., findUnique: vi.fn()... } } }))`
- **Permission constants**: `const CORR_VIEW = permissionIdByKey("crm_correspondence.view")!`
- **`createCallerFactory(router)`** for creating test callers
- **`MODULE_MOCK`** object and `withModuleMock()` helper to inject tenantModule mock into prisma
- **`createTestContext(prisma, permissions)`** using helpers from `./helpers`
- **`createNoPermContext(prisma)`** for permission denial tests
- **Tests**: Check paginated returns, permission enforcement, input filtering, error propagation

### Router Test Helpers (`src/trpc/routers/__tests__/helpers.ts`)

Key exports:
- `autoMockPrisma(partial)` — Proxy that auto-stubs undefined model/methods
- `createMockUser(overrides)` — Creates `ContextUser`
- `createMockSession()` — Creates Supabase `Session`
- `createMockContext(overrides)` — Creates `TRPCContext` with auto-mocked prisma
- `createUserWithPermissions(permissionIds, overrides)` — User with specific permissions
- `createMockUserTenant(userId, tenantId)` — UserTenant join

### E2E Browser Tests

#### Addresses (`src/e2e-browser/20-crm-addresses.spec.ts`)

- `test.describe.serial("UC-CRM-01: Address Management")`
- Uses helpers: `navigateTo`, `waitForTableLoad`, `fillInput`, `selectOption`, `submitAndWaitForClose`, `expectTableContains`, `openRowActions`, `clickMenuItem`, `clickTab`
- First test enables CRM module via admin settings
- Tests create, search, filter, detail view, sub-entity CRUD, soft-delete/restore

#### Correspondence (`src/e2e-browser/21-crm-correspondence.spec.ts`)

- `test.describe.serial("UC-CRM-02: Correspondence")`
- Pre-condition: creates address with contact
- Tests: log phone call, log email, search, filter by direction, view detail, edit, delete
- All tests navigate to address detail > "Korrespondenz" tab
- Uses `clickTab(page, "Korrespondenz")` to switch tabs

#### E2E Helpers (`src/e2e-browser/helpers/`)

- `forms.ts`: `fillInput`, `selectOption`, `submitAndWaitForClose`, `waitForSheet`, `expectTableContains`, `openRowActions`, `clickMenuItem`, `clickTab`
- `nav.ts`: `navigateTo`, `waitForTableLoad`, `expectPageTitle`

#### Global Setup (`src/e2e-browser/global-setup.ts`)

Runs SQL cleanup before test suite. Pattern:
```sql
-- Delete child records first (FK dependencies)
DELETE FROM crm_correspondences WHERE address_id IN (SELECT id FROM crm_addresses WHERE company LIKE 'E2E%');
-- Delete parent records
DELETE FROM crm_addresses WHERE company LIKE 'E2E%';
-- Reset number sequences
INSERT INTO number_sequences ... ON CONFLICT DO UPDATE SET next_value = GREATEST(..., 100);
```

**For CRM_03**, add:
```sql
-- Delete inquiry-linked correspondence
DELETE FROM crm_correspondences WHERE inquiry_id IN (SELECT id FROM crm_inquiries WHERE title LIKE 'E2E%');
-- Delete inquiries
DELETE FROM crm_inquiries WHERE title LIKE 'E2E%';
-- Reset inquiry number sequence
-- (add to existing INSERT...ON CONFLICT for number_sequences)
```

---

## 8. Migration Patterns

### Naming Convention

Files in `supabase/migrations/`:
- `20260101000095_create_crm_tables.sql` — CRM_01 (addresses, contacts, bank accounts, number_sequences)
- `20260101000096_create_crm_correspondences.sql` — CRM_02

**Next migration**: `20260101000097_create_crm_inquiries.sql`

### CRM_01 Migration Structure (`20260101000095`)

```sql
CREATE TYPE crm_address_type AS ENUM ('CUSTOMER', 'SUPPLIER', 'BOTH');
CREATE TABLE crm_addresses ( ... );
CREATE INDEX idx_... ON crm_addresses(...);
CREATE TABLE crm_contacts ( ... );
CREATE TABLE crm_bank_accounts ( ... );
```

### CRM_02 Migration Structure (`20260101000096`)

```sql
CREATE TYPE crm_correspondence_direction AS ENUM ('INCOMING', 'OUTGOING', 'INTERNAL');
CREATE TABLE crm_correspondences ( ... );
CREATE INDEX idx_... ON crm_correspondences(...);
```

**Note**: The `inquiry_id` column in `crm_correspondences` is already created as `UUID` (no FK constraint) since the `crm_inquiries` table doesn't exist yet. The CRM_03 migration should:
1. Create the `crm_inquiry_status` enum
2. Create the `crm_inquiries` table
3. Add FK constraint: `ALTER TABLE crm_correspondences ADD CONSTRAINT fk_crm_correspondences_inquiry FOREIGN KEY (inquiry_id) REFERENCES crm_inquiries(id) ON DELETE SET NULL;`

---

## 9. Prisma Schema — Existing CRM Models

### CrmAddress (line 263)

Key relations:
```prisma
contacts        CrmContact[]
bankAccounts    CrmBankAccount[]
correspondences CrmCorrespondence[]
```

**Needs addition**: `inquiries CrmInquiry[]`

### CrmContact (line 310)

Has relation: `correspondences CrmCorrespondence[]`

**Needs addition**: `inquiries CrmInquiry[]` (for the optional contactId on inquiry)

### CrmCorrespondence (line 366)

Already has `inquiryId String? @map("inquiry_id") @db.Uuid` field and index.
**Missing**: Relation to `CrmInquiry` model (needs to be added when model is created).

### Order (line 1131)

**Needs addition**: `crmInquiries CrmInquiry[]` for the reverse relation.

---

## 10. Seed Data (`supabase/seed.sql`)

### CRM Seed Pattern

CRM data uses UUID ranges:
- Addresses: `c1000000-0000-4000-a000-00000000000X`
- Contacts: `c2000000-0000-4000-a000-00000000000X`
- Bank Accounts: `c3000000-0000-4000-a000-00000000000X`
- Correspondence: `c4000000-0000-4000-a000-00000000000X`

**For CRM_03 inquiries**: Use `c5000000-0000-4000-a000-00000000000X`

Seed data is inserted with `ON CONFLICT (id) DO NOTHING` for idempotency.

Example pattern:
```sql
INSERT INTO crm_inquiries (id, tenant_id, number, title, address_id, contact_id, status, effort, notes, created_by_id)
VALUES
  ('c5000000-...', '10000000-...', 'V-1', 'Großauftrag Frästeile', 'c1000000-...001', 'c2000000-...001', 'OPEN', 'high', '...', '00000000-...001'),
  ...
ON CONFLICT (id) DO NOTHING;
```

**Number sequence seed**: Currently seeds customer (K-1..K-6) and supplier (L-1..L-3). Need to ensure `inquiry` sequence exists or relies on auto-creation via upsert.

---

## 11. Address Detail Page Tabs (`src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx`)

### Current Tab Structure

```tsx
<Tabs defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">{t('tabOverview')}</TabsTrigger>
    <TabsTrigger value="contacts">{t('tabContacts')}</TabsTrigger>
    <TabsTrigger value="bankAccounts">{t('tabBankAccounts')}</TabsTrigger>
    <TabsTrigger value="correspondence">{t('tabCorrespondence')}</TabsTrigger>
    <TabsTrigger value="inquiries">{t('tabInquiries')}</TabsTrigger>
    <TabsTrigger value="documents">{t('tabDocuments')}</TabsTrigger>
  </TabsList>
  ...
  <TabsContent value="inquiries" className="mt-6">
    <Card>
      <CardContent className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">{t('comingSoon')} — CRM_03</p>
      </CardContent>
    </Card>
  </TabsContent>
```

**The "Anfragen" (Inquiries) tab already exists as a placeholder** (line 293-299). Replace the placeholder with `<InquiryList addressId={address.id} />` component.

The i18n key `tabInquiries` is already defined:
- DE: `"tabInquiries": "Anfragen"` (line 5124)
- EN: `"tabInquiries": "Inquiries"` (line 5124)

### Correspondence Tab Pattern

The correspondence tab renders:
```tsx
<TabsContent value="correspondence" className="mt-6">
  <CorrespondenceList addressId={address.id} tenantId={address.tenantId} />
</TabsContent>
```

**Inquiry tab should follow same pattern**: `<InquiryList addressId={address.id} />`

---

## 12. i18n Messages

### Structure (`messages/de.json`, `messages/en.json`)

CRM messages use namespace keys: `"crmAddresses"`, `"crmCorrespondence"`.

**For CRM_03**: Add `"crmInquiries"` namespace.

### Sidebar Navigation Keys

In `messages/de.json` (line 106):
```json
"crmAddresses": "Adressen"
```

**For inquiries page in sidebar** (if adding): Add `"crmInquiries": "Vorgänge"` / `"Inquiries"`.

### CRM Correspondence i18n Structure (reference)

```json
"crmCorrespondence": {
  "title": "Korrespondenz",
  "newEntry": "Neuer Eintrag",
  "createTitle": "Neuen Korrespondenzeintrag anlegen",
  "editTitle": "Korrespondenzeintrag bearbeiten",
  "searchPlaceholder": "...",
  "direction": "Richtung",
  "directionAll": "...",
  ...
  "noEntries": "...",
  "deleteTitle": "...",
  "deleteDescription": "...",
  "confirm": "Bestätigen",
  "cancel": "Abbrechen",
  "save": "Speichern",
  "create": "Anlegen",
  "close": "Schließen",
  "actions": "Aktionen",
  "view": "Anzeigen",
  "edit": "Bearbeiten",
  "delete": "Löschen"
}
```

---

## 13. Sidebar Navigation (`src/components/layout/sidebar/sidebar-nav-config.ts`)

### CRM Section (line 276-287)

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
  ],
},
```

**For CRM_03**: Add inquiries nav item:
```ts
{
  titleKey: 'crmInquiries',
  href: '/crm/inquiries',
  icon: FileText,  // or ClipboardList
  module: 'crm',
  permissions: ['crm_inquiries.view'],
},
```

---

## 14. Page Route Structure

### Current CRM Routes

```
src/app/[locale]/(dashboard)/crm/page.tsx           → Redirects to /crm/addresses
src/app/[locale]/(dashboard)/crm/addresses/page.tsx  → Address list
src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx → Address detail
```

**For CRM_03**:
```
src/app/[locale]/(dashboard)/crm/inquiries/page.tsx      → Global inquiry list
src/app/[locale]/(dashboard)/crm/inquiries/[id]/page.tsx → Inquiry detail with tabs
```

---

## 15. Component Patterns (`src/components/crm/`)

### Existing Components

| File | Pattern |
|------|---------|
| `address-data-table.tsx` | Data table with column definitions |
| `address-form-sheet.tsx` | Sheet form for create/edit |
| `contact-list.tsx` | Sub-entity list within detail page tab |
| `contact-form-dialog.tsx` | Dialog form for sub-entity |
| `bank-account-list.tsx` | Sub-entity list pattern |
| `bank-account-form-dialog.tsx` | Dialog form pattern |
| `correspondence-list.tsx` | List with inline filters, table, pagination, form sheet, detail dialog, delete confirm |
| `correspondence-form-sheet.tsx` | Sheet form with sections |
| `correspondence-detail-dialog.tsx` | Read-only detail dialog |
| `correspondence-type-badge.tsx` | Badge components for type/direction |

### CorrespondenceList Pattern (most relevant for InquiryList)

```tsx
interface CorrespondenceListProps {
  addressId: string
  tenantId: string
}

export function CorrespondenceList({ addressId }: ...) {
  const t = useTranslations('crmCorrespondence')
  // Filter state (search, direction, type, page)
  // Dialog state (formOpen, editItem, detailItem, deleteItem)
  // Data fetching: useCrmCorrespondence({ addressId, ...filters })
  // Delete mutation
  return (
    <div className="space-y-4">
      {/* Header with title + "New" button */}
      {/* Filter bar: search input + select dropdowns */}
      {/* Table with columns and row actions (view/edit/delete) */}
      {/* Pagination */}
      {/* Form sheet, detail dialog, delete confirm */}
    </div>
  )
}
```

### Badge Component Pattern (`correspondence-type-badge.tsx`)

```tsx
const CONFIG: Record<string, { icon: typeof Icon; variant: '...' }> = { ... }

export function BadgeName({ value }: { value: string }) {
  const t = useTranslations('namespace')
  const config = CONFIG[value]
  return <Badge variant={config?.variant}><Icon />{label}</Badge>
}
```

---

## 16. Hook Patterns (`src/hooks/use-crm-correspondence.ts`)

### Structure

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// List with filters
export function useCrmCorrespondence(options: { enabled?, ...filters }) {
  const trpc = useTRPC()
  return useQuery(trpc.crm.correspondence.list.queryOptions({ ...input }, { enabled }))
}

// Get by ID
export function useCrmCorrespondenceById(id: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(trpc.crm.correspondence.getById.queryOptions({ id }, { enabled: enabled && !!id }))
}

// Mutations with cache invalidation
export function useCreateCrmCorrespondence() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.correspondence.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.crm.correspondence.list.queryKey() })
    },
  })
}
```

### Registration in Hooks Index (`src/hooks/index.ts`, line 678-685)

```ts
// CRM Correspondence
export {
  useCrmCorrespondence,
  useCrmCorrespondenceById,
  useCreateCrmCorrespondence,
  useUpdateCrmCorrespondence,
  useDeleteCrmCorrespondence,
} from './use-crm-correspondence'
```

---

## 17. Error Handling (`src/trpc/errors.ts`)

`handleServiceError(err)` maps error class names to tRPC codes:
- `*NotFoundError` → `NOT_FOUND`
- `*ValidationError` / `*InvalidError` → `BAD_REQUEST`
- `*ConflictError` / `*DuplicateError` → `CONFLICT`
- `*ForbiddenError` / `*AccessDeniedError` → `FORBIDDEN`
- Prisma errors: P2025 → NOT_FOUND, P2002 → CONFLICT, P2003 → BAD_REQUEST

**For CRM_03**: Use error classes named `CrmInquiryNotFoundError`, `CrmInquiryValidationError`, `CrmInquiryConflictError`.

---

## 18. E2E Test Placeholder Tab

The address E2E test (spec 20) already tests the inquiries tab placeholder:

```ts
test("placeholder tabs show coming soon message", async ({ page }) => {
  await clickTab(page, "Anfragen");
  await expect(page.getByText("In Vorbereitung")).toBeVisible();
});
```

**When CRM_03 is implemented**: This test will need to be updated or the placeholder will be replaced, which will break this specific assertion. The test should be updated to verify the inquiry list component loads instead.

---

## 19. Summary of Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260101000097_create_crm_inquiries.sql` | Migration |
| `src/lib/services/crm-inquiry-service.ts` | Service (business logic) |
| `src/lib/services/crm-inquiry-repository.ts` | Repository (Prisma queries) |
| `src/trpc/routers/crm/inquiries.ts` | tRPC router |
| `src/hooks/use-crm-inquiries.ts` | React hooks |
| `src/components/crm/inquiry-list.tsx` | List component (for address detail + global page) |
| `src/components/crm/inquiry-form-sheet.tsx` | Create/edit form |
| `src/components/crm/inquiry-detail.tsx` | Detail view (inquiry detail page) |
| `src/components/crm/inquiry-close-dialog.tsx` | Close inquiry dialog |
| `src/components/crm/inquiry-status-badge.tsx` | Status badge |
| `src/components/crm/inquiry-link-order-dialog.tsx` | Link/create order dialog |
| `src/app/[locale]/(dashboard)/crm/inquiries/page.tsx` | Global inquiry list page |
| `src/app/[locale]/(dashboard)/crm/inquiries/[id]/page.tsx` | Inquiry detail page |
| `src/lib/services/__tests__/crm-inquiry-service.test.ts` | Service unit tests |
| `src/trpc/routers/__tests__/crmInquiries-router.test.ts` | Router integration tests |
| `src/e2e-browser/22-crm-inquiries.spec.ts` | E2E browser tests |

### Modified Files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `CrmInquiryStatus` enum, `CrmInquiry` model, add relations to CrmAddress, CrmContact, CrmCorrespondence, Order |
| `src/lib/auth/permission-catalog.ts` | Add 4 inquiry permissions after line 234 |
| `src/lib/services/number-sequence-service.ts` | Add `inquiry: "V-"` to DEFAULT_PREFIXES |
| `src/trpc/routers/crm/index.ts` | Import and add `inquiries: crmInquiriesRouter` |
| `src/hooks/index.ts` | Export inquiry hooks |
| `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx` | Replace inquiry tab placeholder with `<InquiryList>` |
| `src/components/layout/sidebar/sidebar-nav-config.ts` | Add inquiries nav item to CRM section |
| `messages/de.json` | Add `crmInquiries` namespace + sidebar nav key |
| `messages/en.json` | Add `crmInquiries` namespace + sidebar nav key |
| `supabase/seed.sql` | Add inquiry seed data |
| `src/e2e-browser/global-setup.ts` | Add inquiry cleanup SQL |
| `src/e2e-browser/20-crm-addresses.spec.ts` | Update placeholder tab test |
