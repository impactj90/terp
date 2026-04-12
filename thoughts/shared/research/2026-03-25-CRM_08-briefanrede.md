# Research: CRM_08 — Briefanrede bei Kontaktpersonen

Date: 2026-03-25

---

## 1. Prisma Schema — CrmContact Model

**File:** `/home/tolga/projects/terp/prisma/schema.prisma`
**Lines:** 341–369

```prisma
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

  tenant          Tenant              @relation(...)
  address         CrmAddress          @relation(...)
  correspondences CrmCorrespondence[]
  inquiries       CrmInquiry[]
  tasks           CrmTask[]
  billingDocuments  BillingDocument[]
  billingServiceCases BillingServiceCase[]
  billingRecurringInvoices BillingRecurringInvoice[]
  purchaseOrders           WhPurchaseOrder[]

  @@index([addressId], map: "idx_crm_contacts_address_id")
  @@index([tenantId], map: "idx_crm_contacts_tenant_id")
  @@map("crm_contacts")
}
```

**Existing fields:** id, tenantId, addressId, firstName, lastName, position, department, phone, email, notes, isPrimary, createdAt, updatedAt

**Missing fields for CRM_08:** salutation, title, letterSalutation — none exist yet.

---

## 2. Service Layer

### crm-address-service.ts (contains Contact service functions)

**File:** `/home/tolga/projects/terp/src/lib/services/crm-address-service.ts`

**CONTACT_TRACKED_FIELDS** (line 16–19):
```ts
const CONTACT_TRACKED_FIELDS = [
  "firstName", "lastName", "position", "department", "phone", "email",
  "notes", "isPrimary",
]
```

#### `createContact` (lines 309–361)

Input type:
```ts
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
```

Logic:
- Validates address exists
- Trims and validates firstName, lastName (non-empty)
- Passes optional fields through with `|| null` fallback
- Calls `repo.createContact(prisma, { ... })`
- Logs audit event

#### `updateContact` (lines 363–420)

Input type:
```ts
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
```

Logic:
- Finds existing contact by id + tenantId
- Validates firstName/lastName if provided (non-empty)
- Iterates `optionalFields = ["position", "department", "phone", "email", "notes", "isPrimary"]` (line 401)
- Calls `repo.updateContact(prisma, tenantId, input.id, data)`
- Logs audit with computed changes

#### `deleteContact` (lines 422–441)
- Finds existing, calls `repo.deleteContact`, logs audit

### crm-address-repository.ts (contains Contact repository functions)

**File:** `/home/tolga/projects/terp/src/lib/services/crm-address-repository.ts`

#### `findContacts` (lines 143–152)
- `prisma.crmContact.findMany({ where: { tenantId, addressId }, orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] })`

#### `findContactById` (lines 154–162)
- `prisma.crmContact.findFirst({ where: { id, tenantId } })`

#### `createContact` (lines 164–180)
Input type:
```ts
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
```
- `prisma.crmContact.create({ data })`

#### `updateContact` (lines 182–189)
- `tenantScopedUpdate(prisma.crmContact, { id, tenantId }, data, { entity: "CrmContact" })`

#### `deleteContact` (lines 191–200)
- `prisma.crmContact.deleteMany({ where: { id, tenantId } })`

#### Address `findById` (lines 58–71)
- Includes contacts with `orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }]`
- This is how the address detail page loads contacts alongside the address

---

## 3. tRPC Router

**File:** `/home/tolga/projects/terp/src/trpc/routers/crm/addresses.ts`

All procedures use `crmProcedure` (tenantProcedure + requireModule("crm")).

### Contact procedures:

#### `contactsList` (lines 171–184)
- Permission: `CRM_VIEW`
- Input: `{ addressId: z.string().uuid() }`
- Calls `crmAddressService.listContacts`

#### `contactsCreate` (lines 186–210)
- Permission: `CRM_EDIT`
- Input schema (lines 188–198):
  ```ts
  z.object({
    addressId: z.string().uuid(),
    firstName: z.string().min(1).max(255),
    lastName: z.string().min(1).max(255),
    position: z.string().max(255).optional(),
    department: z.string().max(255).optional(),
    phone: z.string().max(255).optional(),
    email: z.string().email().optional().or(z.literal("")),
    notes: z.string().max(2000).optional(),
    isPrimary: z.boolean().optional().default(false),
  })
  ```
- Calls `crmAddressService.createContact`

#### `contactsUpdate` (lines 212–236)
- Permission: `CRM_EDIT`
- Input schema (lines 214–224):
  ```ts
  z.object({
    id: z.string().uuid(),
    firstName: z.string().min(1).max(255).optional(),
    lastName: z.string().min(1).max(255).optional(),
    position: z.string().max(255).nullable().optional(),
    department: z.string().max(255).nullable().optional(),
    phone: z.string().max(255).nullable().optional(),
    email: z.string().email().nullable().optional().or(z.literal("")),
    notes: z.string().max(2000).nullable().optional(),
    isPrimary: z.boolean().optional(),
  })
  ```
- Calls `crmAddressService.updateContact`

#### `contactsDelete` (lines 238–253)
- Permission: `CRM_EDIT`
- Input: `{ id: z.string().uuid() }`
- Calls `crmAddressService.deleteContact`

---

## 4. React Hook

**File:** `/home/tolga/projects/terp/src/hooks/use-crm-addresses.ts`

Contact hooks (lines 103–161):

| Hook | tRPC Procedure | Type |
|------|---------------|------|
| `useCrmContacts(addressId, enabled)` | `crm.addresses.contactsList` | query |
| `useCreateCrmContact()` | `crm.addresses.contactsCreate` | mutation |
| `useUpdateCrmContact()` | `crm.addresses.contactsUpdate` | mutation |
| `useDeleteCrmContact()` | `crm.addresses.contactsDelete` | mutation |

All mutation hooks invalidate `contactsList` and `getById` query keys on success.

Exported from `/home/tolga/projects/terp/src/hooks/index.ts` at lines 668–671.

---

## 5. UI Components

### contact-form-dialog.tsx

**File:** `/home/tolga/projects/terp/src/components/crm/contact-form-dialog.tsx`

**Props interface** (lines 22–38):
```ts
interface ContactFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  addressId: string
  contact?: {
    id: string
    firstName: string
    lastName: string
    position: string | null
    department: string | null
    phone: string | null
    email: string | null
    notes: string | null
    isPrimary: boolean
  } | null
  onSuccess?: () => void
}
```

**FormState** (lines 40–49):
```ts
interface FormState {
  firstName: string
  lastName: string
  position: string
  department: string
  phone: string
  email: string
  notes: string
  isPrimary: boolean
}
```

**Form layout** (lines 150–243):
1. Row 1 (grid-cols-2): **firstName**, **lastName** — both required
2. Row 2 (grid-cols-2): **position**, **department**
3. Row 3 (grid-cols-2): **phone**, **email**
4. Row 4: **notes** (Textarea, 2 rows)
5. Row 5: **isPrimary** (Checkbox)

**Dialog width:** `sm:max-w-md` (line 144)

**Imports used:** Dialog, Input, Label, Button, Textarea, Checkbox, Alert — from `@/components/ui/*`

**Does NOT import:** Select, Combobox, or any dropdown component.

**i18n namespace:** `crmAddresses` (line 69)

### contact-list.tsx

**File:** `/home/tolga/projects/terp/src/components/crm/contact-list.tsx`

**CrmContact interface** (lines 22–31):
```ts
interface CrmContact {
  id: string
  firstName: string
  lastName: string
  position: string | null
  department: string | null
  phone: string | null
  email: string | null
  isPrimary: boolean
}
```

**Table columns** (lines 58–65): Name, Position, Department, Phone, Email, isPrimary (Badge), Actions

**Name display** (line 74): `{contact.firstName} {contact.lastName}` — no salutation or title shown.

### Address detail page

**File:** `/home/tolga/projects/terp/src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx`

Imports ContactList and ContactFormDialog. Uses `address.contacts` from the `useCrmAddress` hook (which returns contacts via the `findById` include).

---

## 6. Migration Pattern

**Latest migration file:** `/home/tolga/projects/terp/supabase/migrations/20260329100000_wh_po_position_types.sql`

**Naming convention:** `YYYYMMDDHHMMSS_snake_case_description.sql`

**Content pattern:**
```sql
-- Comment describing the change
ALTER TABLE table_name
  ADD COLUMN column_name type constraints;
```

The next migration would be numbered `20260330100000` (or later) and named something like `20260330100000_crm_contact_salutation_fields.sql`.

---

## 7. Existing Auto-Generate Patterns

### matchCode auto-generation in crm-address-service.ts (line 130–131)

```ts
// Auto-generate matchCode from company if not provided
const matchCode = input.matchCode?.trim() || company.toUpperCase().slice(0, 20)
```

Pattern: If input field is empty/missing, derive from other fields. Applied at create time. The generated value is stored in DB — it is not a computed field.

### matchCode auto-generation in wh-article-service.ts (line 130–131)

Same pattern:
```ts
const matchCode = input.matchCode?.trim() || name.toUpperCase().slice(0, 20)
```

### Auto-fill from supplier in wh-purchase-order-service.ts (line 434, 448)

Fills price/article number from WhArticleSupplier link when creating a purchase order position.

### Key insight for CRM_08

The auto-generation pattern in this codebase is:
1. Check if the field is provided/non-empty in input
2. If not, compute from other fields
3. Store the computed value in DB (not a virtual/computed field)
4. The user can override by providing their own value

This maps directly to the letterSalutation behavior: auto-generate from salutation + title + lastName, but allow manual override.

---

## 8. Handbook

**File:** `/home/tolga/projects/terp/docs/TERP_HANDBUCH.md`

Note: There is no `TERP_HANDBUCH_V2.md` — only `TERP_HANDBUCH.md` exists.

### Section 12.2 Kontaktpersonen (lines 4279–4325)

Current documented fields for "Neuen Kontakt anlegen" (lines 4301–4310):

```
1. Tab "Kontakte" -> "Kontakt hinzufuegen"
2. Dialog oeffnet sich: "Neuen Kontakt anlegen"
3. Ausfuellen:
   - Vorname (Pflicht), Nachname (Pflicht)
   - Position, Abteilung, Telefon, E-Mail, Notizen
   - Hauptkontakt (Checkbox)
4. "Anlegen"
5. Kontakt erscheint in der Tabelle
```

Current documented table columns (lines 4289–4299):

| Column | Description |
|--------|-------------|
| Name | Vorname + Nachname |
| Position | Funktion im Unternehmen |
| Abteilung | Abteilung |
| Telefon | Durchwahl |
| E-Mail | E-Mail-Adresse |
| Hauptkontakt | Badge |
| Aktionen | Menu |

**Fields that need adding to handbook:** Anrede, Titel, Briefanrede

---

## 9. i18n Translations

**File:** `/home/tolga/projects/terp/messages/de.json`

Existing CRM contact labels under `crmAddresses` namespace (lines 5213–5236):

```json
"contactsTitle": "Kontaktpersonen",
"addContact": "Kontakt hinzufuegen",
"createContactTitle": "Neuen Kontakt anlegen",
"editContactTitle": "Kontakt bearbeiten",
"labelFirstName": "Vorname",
"labelLastName": "Nachname",
"labelPosition": "Position",
"labelDepartment": "Abteilung",
"labelIsPrimary": "Hauptkontakt",
"deleteContact": "Kontakt loeschen",
"deleteContactDescription": "Moechten Sie den Kontakt \"{name}\" wirklich loeschen?"
```

**Missing translations needed:** labelSalutation ("Anrede"), labelTitle ("Titel"), labelLetterSalutation ("Briefanrede"), and dropdown option labels.

---

## 10. UI Component for Dropdowns

**File:** `/home/tolga/projects/terp/src/components/ui/select.tsx`

Uses `@radix-ui/react-select` with exports: `Select`, `SelectGroup`, `SelectValue`, `SelectTrigger`, `SelectContent`, `SelectItem`, etc. This is the standard dropdown component used across the app.

---

## 11. Test File

**File:** `/home/tolga/projects/terp/src/trpc/routers/__tests__/crmAddresses-router.test.ts`

Existing contact test (lines 381–420): `crm.addresses.contactsCreate` — tests creating a contact with firstName/lastName. The mock contact object (lines 385–399) does not include salutation/title/letterSalutation fields. This test will need updating.

---

## 12. Files to Modify (Summary)

| # | File | Change |
|---|------|--------|
| 1 | `prisma/schema.prisma` (line 347) | Add salutation, title, letterSalutation fields to CrmContact |
| 2 | `supabase/migrations/` | New migration: ADD COLUMN salutation, title, letter_salutation |
| 3 | `src/lib/services/crm-address-service.ts` | Add fields to createContact/updateContact input + auto-generate logic + CONTACT_TRACKED_FIELDS |
| 4 | `src/lib/services/crm-address-repository.ts` | Add fields to createContact data type |
| 5 | `src/trpc/routers/crm/addresses.ts` | Add fields to contactsCreate/contactsUpdate Zod schemas |
| 6 | `src/hooks/use-crm-addresses.ts` | No changes needed (hooks pass through all fields) |
| 7 | `src/components/crm/contact-form-dialog.tsx` | Add salutation dropdown, title dropdown, letterSalutation text field + auto-generate logic |
| 8 | `src/components/crm/contact-list.tsx` | Optionally add salutation display to CrmContact interface |
| 9 | `messages/de.json` | Add labelSalutation, labelTitle, labelLetterSalutation, dropdown options |
| 10 | `docs/TERP_HANDBUCH.md` | Update section 12.2 with new fields |
| 11 | `src/trpc/routers/__tests__/crmAddresses-router.test.ts` | Add tests for new fields |
| 12 | `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx` | May need type updates if contact type is locally defined |

---

## 13. Contact Usage in Other Components

CrmContact is referenced via `contactId` in these components (as a dropdown selection):

- `src/components/crm/correspondence-form-sheet.tsx` — contactId dropdown
- `src/components/crm/inquiry-form-sheet.tsx` — contactId dropdown
- `src/components/crm/task-form-sheet.tsx` — contactId dropdown
- `src/components/billing/service-case-form-sheet.tsx` — contactId dropdown
- `src/components/billing/recurring-form.tsx` — contactId selection
- `src/components/warehouse/purchase-order-form.tsx` — contactId dropdown

These components select contacts by ID and display `firstName + lastName`. The `letterSalutation` field would be available on the CrmContact model for use in document generation (PDF templates, etc.) but these UI components do not need changes for CRM_08.
