# Implementation Plan: CRM_06 — "Unsere Kundennummer" beim Lieferanten

Date: 2026-03-25

---

## Overview

Add an optional `ourCustomerNumber` field to CRM addresses (suppliers) that stores our own customer number at the supplier. Display it on the address form (only for SUPPLIER/BOTH), the address detail page, and the purchase order detail page.

**Complexity:** S (small) — single optional field, no new models, no complex business logic.

---

## Phase 1: Database Migration

### 1.1 Prisma Schema

**File:** `prisma/schema.prisma` (line ~303, after `discountGroup`)

**Change:** Add `ourCustomerNumber` field to `CrmAddress` model, before `priceListId`.

```prisma
  discountGroup   String?        @map("discount_group") @db.VarChar(50)
  ourCustomerNumber String?      @map("our_customer_number") @db.VarChar(50)
  priceListId     String?        @map("price_list_id") @db.Uuid
```

**Placement rationale:** Group it near the other supplier-relevant data fields. Placing it after `discountGroup` and before `priceListId` keeps it logically grouped with commercial/supplier data.

### 1.2 Supabase Migration

**File (new):** `supabase/migrations/20260328100000_crm_address_our_customer_number.sql`

```sql
-- CRM_06: Add "our customer number at supplier" field
ALTER TABLE crm_addresses
ADD COLUMN our_customer_number VARCHAR(50);
```

**Why no index?** This field is not used for filtering or searching — only displayed. No index needed.

### 1.3 Regenerate Prisma Client

```bash
pnpm db:generate
```

### Verification

- `pnpm typecheck` passes (or at least no new errors from this field)
- `prisma/schema.prisma` compiles: `npx prisma validate`
- Migration file exists and contains valid SQL

### Dependencies

None — this is the first phase.

---

## Phase 2: Service Layer

### 2.1 CRM Address Service — Tracked Fields

**File:** `src/lib/services/crm-address-service.ts` (line 9-14)

**Change:** Add `"ourCustomerNumber"` to `ADDRESS_TRACKED_FIELDS` array:

```ts
const ADDRESS_TRACKED_FIELDS = [
  "type", "company", "street", "zip", "city", "country", "phone", "fax",
  "email", "website", "taxNumber", "vatId", "leitwegId", "matchCode", "notes",
  "paymentTermDays", "discountPercent", "discountDays", "discountGroup",
  "priceListId", "isActive", "ourCustomerNumber",
]
```

### 2.2 CRM Address Service — `create` input type

**File:** `src/lib/services/crm-address-service.ts` (line 93-114)

**Change:** Add `ourCustomerNumber?: string` to the `create` input type (after `discountGroup`):

```ts
  input: {
    // ... existing fields ...
    discountGroup?: string
    ourCustomerNumber?: string
    priceListId?: string | null
  },
```

### 2.3 CRM Address Service — `create` field mapping

**File:** `src/lib/services/crm-address-service.ts` (line 132-156)

**Change:** Add the field to the `repo.create()` call (after `discountGroup`, before `priceListId`):

```ts
    discountGroup: input.discountGroup || null,
    ourCustomerNumber: input.ourCustomerNumber || null,
    priceListId: input.priceListId ?? null,
```

### 2.4 CRM Address Service — `update` input type

**File:** `src/lib/services/crm-address-service.ts` (line 172-194)

**Change:** Add `ourCustomerNumber?: string | null` to the `update` input type (after `discountGroup`):

```ts
  input: {
    // ... existing fields ...
    discountGroup?: string | null
    ourCustomerNumber?: string | null
    priceListId?: string | null
  },
```

### 2.5 CRM Address Service — `update` directFields array

**File:** `src/lib/services/crm-address-service.ts` (line 213-218)

**Change:** Add `"ourCustomerNumber"` to the `directFields` array:

```ts
  const directFields = [
    "type", "street", "zip", "city", "country", "phone", "fax",
    "email", "website", "taxNumber", "vatId", "leitwegId", "matchCode", "notes",
    "paymentTermDays", "discountPercent", "discountDays", "discountGroup",
    "ourCustomerNumber", "priceListId",
  ] as const
```

### 2.6 CRM Address Repository — `create` data type

**File:** `src/lib/services/crm-address-repository.ts` (line 73-99)

**Change:** Add `ourCustomerNumber?: string | null` to the `create` data parameter type (after `discountGroup`):

```ts
  data: {
    // ... existing fields ...
    discountGroup?: string | null
    ourCustomerNumber?: string | null
    priceListId?: string | null
    createdById?: string | null
  }
```

**Note:** The `update` method in the repository uses `Record<string, unknown>` — no changes needed there.

**Note:** The `findById` method uses `include` without explicit `select` — the new field is automatically included in query results. No changes needed.

### Verification

- `pnpm typecheck` — no new errors from service/repository changes
- Input types accept the new field
- The `directFields` array allows pass-through for updates

### Dependencies

Phase 1 must be complete (Prisma types must include `ourCustomerNumber`).

---

## Phase 3: Router Layer

### 3.1 tRPC Router — `create` input schema

**File:** `src/trpc/routers/crm/addresses.ts` (line 60-81)

**Change:** Add `ourCustomerNumber` to the `create` Zod schema (after `discountGroup`, before `priceListId`):

```ts
      discountGroup: z.string().max(100).optional(),
      ourCustomerNumber: z.string().max(50).optional(),
      priceListId: z.string().uuid().nullable().optional(),
```

### 3.2 tRPC Router — `update` input schema

**File:** `src/trpc/routers/crm/addresses.ts` (line 98-120)

**Change:** Add `ourCustomerNumber` to the `update` Zod schema (after `discountGroup`, before `priceListId`):

```ts
      discountGroup: z.string().max(100).nullable().optional(),
      ourCustomerNumber: z.string().max(50).nullable().optional(),
      priceListId: z.string().uuid().nullable().optional(),
```

### Verification

- `pnpm typecheck` — no new errors
- The router correctly passes the field to the service layer (already happens because `input` is spread directly to service)

### Dependencies

Phase 2 must be complete (service input types must accept the new field).

---

## Phase 4: UI — Address Form

### 4.1 i18n Translations — German

**File:** `messages/de.json`

**Change 1** — In the `crmAddresses` namespace (after `"sectionPayment": "Zahlungsbedingungen"`, around line 5174), add:

```json
    "sectionSupplier": "Lieferantendaten",
```

**Change 2** — In the `crmAddresses` namespace (after `"labelDiscountGroup": "Rabattgruppe"`, around line 5192), add:

```json
    "labelOurCustomerNumber": "Unsere Kundennummer",
```

**Change 3** — In the `warehousePurchaseOrders` namespace (after `"detailSupplier": "Lieferant"`, around line 5769), add:

```json
    "detailOurCustomerNumber": "Unsere Kundennr.",
```

### 4.2 i18n Translations — English

**File:** `messages/en.json`

**Change 1** — In the `crmAddresses` namespace (same position as German), add:

```json
    "sectionSupplier": "Supplier Data",
```

**Change 2** — In the `crmAddresses` namespace (same position as German), add:

```json
    "labelOurCustomerNumber": "Our Customer Number",
```

**Change 3** — In the `warehousePurchaseOrders` namespace (same position as German), add:

```json
    "detailOurCustomerNumber": "Our Customer No.",
```

### 4.3 FormState Interface

**File:** `src/components/crm/address-form-sheet.tsx` (line 28-49)

**Change:** Add `ourCustomerNumber: string` to the `FormState` interface (after `discountGroup`):

```ts
interface FormState {
  // ... existing fields ...
  discountGroup: string
  ourCustomerNumber: string
  priceListId: string
  notes: string
}
```

### 4.4 INITIAL_STATE

**File:** `src/components/crm/address-form-sheet.tsx` (line 51-72)

**Change:** Add `ourCustomerNumber: ''` (after `discountGroup`):

```ts
const INITIAL_STATE: FormState = {
  // ... existing fields ...
  discountGroup: '',
  ourCustomerNumber: '',
  priceListId: '',
  notes: '',
}
```

### 4.5 AddressFormSheetProps.address type

**File:** `src/components/crm/address-form-sheet.tsx` (line 77-99)

**Change:** Add `ourCustomerNumber: string | null` to the address prop type (after `discountGroup`):

```ts
  address?: {
    // ... existing fields ...
    discountGroup: string | null
    ourCustomerNumber: string | null
    priceListId: string | null
    notes: string | null
  } | null
```

### 4.6 Effect to populate form from address

**File:** `src/components/crm/address-form-sheet.tsx` (line 115-145)

**Change:** Add field mapping inside the `if (address)` block (after `discountGroup`):

```ts
          discountGroup: address.discountGroup || '',
          ourCustomerNumber: address.ourCustomerNumber || '',
          priceListId: address.priceListId || '',
```

### 4.7 handleSubmit payload

**File:** `src/components/crm/address-form-sheet.tsx` (line 162-182)

**Change:** Add the field to the payload object (after `discountGroup`):

```ts
        discountGroup: form.discountGroup.trim() || undefined,
        ourCustomerNumber: form.ourCustomerNumber.trim() || undefined,
        notes: form.notes.trim() || undefined,
```

### 4.8 Render — New "Lieferantendaten" section

**File:** `src/components/crm/address-form-sheet.tsx`

**Change:** Add a new conditionally-rendered section after the "Payment Terms" section (after line 429, before the "Price List" section). This is the first field with type-conditional rendering in this form.

```tsx
            {/* Supplier Data — only for SUPPLIER or BOTH */}
            {(form.type === 'SUPPLIER' || form.type === 'BOTH') && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">{t('sectionSupplier')}</h3>
                <div className="space-y-2">
                  <Label htmlFor="ourCustomerNumber">{t('labelOurCustomerNumber')}</Label>
                  <Input
                    id="ourCustomerNumber"
                    value={form.ourCustomerNumber}
                    onChange={(e) => updateField('ourCustomerNumber', e.target.value)}
                    disabled={isSubmitting}
                    maxLength={50}
                    placeholder="z.B. KD-12345"
                  />
                </div>
              </div>
            )}
```

**Placement:** Between the Payment Terms section (`</div>` on line 429) and the Price List section (`{priceListsData?.items ...}` on line 432).

### Verification

- Open the address form for a SUPPLIER address — the "Lieferantendaten" section with "Unsere Kundennummer" field is visible
- Open the address form for a CUSTOMER address — the section is NOT visible
- Switch the type dropdown from CUSTOMER to SUPPLIER — the section appears
- Switch the type dropdown from SUPPLIER to CUSTOMER — the section disappears
- Enter a value, save, reopen — value is preserved
- Enter a value > 50 chars — HTML maxLength prevents it

### Dependencies

Phase 3 must be complete (router Zod schemas must accept the field).

---

## Phase 5: UI — Address Detail Page & Purchase Order Detail

### 5.1 Address Detail Page — Overview Tab

**File:** `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx` (around line 235)

**Change:** Add a conditional "Lieferantendaten" card after the "Zahlungsbedingungen" card and before the "Notizen" card. Only show when address type is SUPPLIER or BOTH and the field has a value.

Insert after the Payment card's closing `</Card>` (line 251) and before the Notes card (line 253):

```tsx
            {(address.type === 'SUPPLIER' || address.type === 'BOTH') && address.ourCustomerNumber && (
              <Card>
                <CardContent className="pt-6">
                  <h3 className="text-sm font-medium text-muted-foreground mb-4">{t('sectionSupplier')}</h3>
                  <div className="divide-y">
                    <DetailRow label={t('labelOurCustomerNumber')} value={address.ourCustomerNumber} />
                  </div>
                </CardContent>
              </Card>
            )}
```

**Note:** The `address` object comes from the `getById` query which already returns all fields — `ourCustomerNumber` is automatically available after the schema change.

### 5.2 Purchase Order Detail — Supplier Info

**File:** `src/components/warehouse/purchase-order-detail.tsx` (around line 135-139)

**Change 1:** Extend the supplier type cast to include `ourCustomerNumber`:

```ts
  const supplier = order.supplier as {
    id: string
    company?: string | null
    number?: string | null
    ourCustomerNumber?: string | null
  } | null
```

**Change 2:** Add a `DetailRow` after the supplier row (after line 224, before the contact `DetailRow`):

```tsx
            {supplier?.ourCustomerNumber && (
              <DetailRow
                label={t('detailOurCustomerNumber')}
                value={supplier.ourCustomerNumber}
              />
            )}
```

**Note:** The purchase order repository already uses `supplier: true` (full include), so the field is automatically available from the DB.

### Verification

- View the detail page of a SUPPLIER address with `ourCustomerNumber` set — "Lieferantendaten" card shows the value
- View the detail page of a CUSTOMER address — no "Lieferantendaten" card
- View the detail page of a SUPPLIER address WITHOUT `ourCustomerNumber` — no "Lieferantendaten" card
- View a purchase order for a supplier with `ourCustomerNumber` — "Unsere Kundennr." appears after "Lieferant"
- View a purchase order for a supplier WITHOUT `ourCustomerNumber` — row is not shown

### Dependencies

Phase 4 must be complete (translations must exist).

---

## Phase 6: Tests

### 6.1 Update Mock Address Object

**File:** `src/trpc/routers/__tests__/crmAddresses-router.test.ts` (line 69-98)

**Change:** Add `ourCustomerNumber: null` to the `mockAddress` object (after `discountGroup`):

```ts
const mockAddress = {
  // ... existing fields ...
  discountGroup: null,
  ourCustomerNumber: null,
  priceListId: null,
  // ... rest ...
}
```

### 6.2 Add Test: `crm.addresses.create` — with ourCustomerNumber

**File:** `src/trpc/routers/__tests__/crmAddresses-router.test.ts`

**Change:** Add a new test inside the existing `describe("crm.addresses.create")` block:

```ts
  it("creates supplier address with ourCustomerNumber", async () => {
    const prisma = {
      numberSequence: {
        upsert: vi.fn().mockResolvedValue({
          prefix: "L-",
          nextValue: 2,
        }),
      },
      crmAddress: {
        create: vi.fn().mockResolvedValue({
          ...mockAddress,
          type: "SUPPLIER",
          number: "L-1",
          ourCustomerNumber: "KD-99887",
        }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.create({
      company: "Test GmbH",
      type: "SUPPLIER",
      ourCustomerNumber: "KD-99887",
    })

    expect(result.ourCustomerNumber).toBe("KD-99887")
    expect(prisma.crmAddress.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ourCustomerNumber: "KD-99887",
      }),
    })
  })
```

### 6.3 Add Test: `crm.addresses.update` — saves ourCustomerNumber

**File:** `src/trpc/routers/__tests__/crmAddresses-router.test.ts`

**Change:** Add a new `describe("crm.addresses.update")` block after the existing `create` tests:

```ts
describe("crm.addresses.update", () => {
  it("saves ourCustomerNumber", async () => {
    const updatedAddress = {
      ...mockAddress,
      type: "SUPPLIER",
      ourCustomerNumber: "KD-12345",
    }

    const prisma = {
      crmAddress: {
        findFirst: vi.fn().mockResolvedValue({ ...mockAddress, type: "SUPPLIER" }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    // tenantScopedUpdate calls updateMany then findFirst again
    prisma.crmAddress.findFirst
      .mockResolvedValueOnce({ ...mockAddress, type: "SUPPLIER" })  // initial find
      .mockResolvedValueOnce(updatedAddress)  // after update

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.update({
      id: ADDRESS_ID,
      ourCustomerNumber: "KD-12345",
    })

    expect(result.ourCustomerNumber).toBe("KD-12345")
    expect(prisma.crmAddress.updateMany).toHaveBeenCalledWith({
      where: { id: ADDRESS_ID, tenantId: TENANT_ID },
      data: expect.objectContaining({
        ourCustomerNumber: "KD-12345",
      }),
    })
  })

  it("clears ourCustomerNumber when set to null", async () => {
    const supplierWithNumber = {
      ...mockAddress,
      type: "SUPPLIER",
      ourCustomerNumber: "KD-12345",
    }
    const clearedAddress = {
      ...mockAddress,
      type: "SUPPLIER",
      ourCustomerNumber: null,
    }

    const prisma = {
      crmAddress: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(supplierWithNumber)
          .mockResolvedValueOnce(clearedAddress),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.update({
      id: ADDRESS_ID,
      ourCustomerNumber: null,
    })

    expect(result.ourCustomerNumber).toBeNull()
  })
})
```

### 6.4 Add Test: `crm.addresses.getById` — returns ourCustomerNumber

**File:** `src/trpc/routers/__tests__/crmAddresses-router.test.ts`

**Change:** Add a test inside the existing `describe("crm.addresses.getById")` block:

```ts
  it("returns ourCustomerNumber for supplier address", async () => {
    const supplierAddress = {
      ...mockAddress,
      type: "SUPPLIER",
      ourCustomerNumber: "KD-99887",
      contacts: [],
      bankAccounts: [],
    }

    const prisma = {
      crmAddress: {
        findFirst: vi.fn().mockResolvedValue(supplierAddress),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.getById({ id: ADDRESS_ID })

    expect(result.ourCustomerNumber).toBe("KD-99887")
  })
```

### 6.5 Tenant Isolation

The existing tenant isolation is already tested by the `"throws not found for wrong tenant"` test case in `crm.addresses.getById`. Since `ourCustomerNumber` is a regular field on `CrmAddress` and all queries are tenant-scoped via `where: { id, tenantId }`, no additional tenant isolation test is needed. The field automatically inherits the existing tenant-scoping behavior.

### Verification

```bash
pnpm vitest run src/trpc/routers/__tests__/crmAddresses-router.test.ts
```

All tests pass, including the new ones.

### Dependencies

Phase 2 and Phase 3 must be complete (service and router must accept the field).

---

## Phase 7: Handbook

### 7.1 Update Section 12.1 — "Neue Adresse anlegen"

**File:** `docs/TERP_HANDBUCH.md` (around line 4213)

**Change:** After step 7 (Zahlungsbedingungen), add a new step for supplier data:

```
7a. *(Nur bei Typ „Lieferant" oder „Kunde & Lieferant")* Abschnitt **Lieferantendaten** ausfüllen:
   - **Unsere Kundennummer** (optional, max. 50 Zeichen) — Die eigene Kundennummer, die wir beim Lieferanten haben
```

### 7.2 Update Section "Adressdetails" — Overview Tab table

**File:** `docs/TERP_HANDBUCH.md` (around line 4254-4260)

**Change:** Add a new row to the overview table:

```
| **Lieferantendaten** | Unsere Kundennummer (nur bei Lieferanten/Kunde & Lieferant, nur wenn gepflegt) |
```

Insert after the Zahlungsbedingungen row and before the Notizen row.

### 7.3 Add Note about Purchase Order Display

**File:** `docs/TERP_HANDBUCH.md`

**Change:** In the purchase order section (section 16 area), add a note:

```
💡 **Hinweis:** Wenn beim Lieferanten eine „Unsere Kundennummer" hinterlegt ist (📍 CRM → Adressen → Lieferant bearbeiten → Lieferantendaten), wird diese in der Bestelldetailansicht unter dem Lieferantennamen angezeigt.
```

### 7.4 Praxisbeispiel Update

In the existing Praxisbeispiel for address creation (around line 4519+), add the `ourCustomerNumber` field to the supplier example if one exists there.

### Verification

- Read through handbook section 12.1 — the new field is documented
- The overview table includes the "Lieferantendaten" card
- Readers can follow the step-by-step instructions to find and use the field

### Dependencies

Phase 5 must be complete (UI must be implemented before documenting it).

---

## Summary — Files to Modify

| # | File | Phase | Change |
|---|------|-------|--------|
| 1 | `prisma/schema.prisma` | 1 | Add `ourCustomerNumber` field to `CrmAddress` |
| 2 | `supabase/migrations/20260328100000_crm_address_our_customer_number.sql` | 1 | **NEW** — ALTER TABLE migration |
| 3 | `src/lib/services/crm-address-service.ts` | 2 | Add to tracked fields, create input, create mapping, update input, directFields |
| 4 | `src/lib/services/crm-address-repository.ts` | 2 | Add to `create` data type |
| 5 | `src/trpc/routers/crm/addresses.ts` | 3 | Add to create and update Zod schemas |
| 6 | `messages/de.json` | 4 | Add 3 translation keys (sectionSupplier, labelOurCustomerNumber, detailOurCustomerNumber) |
| 7 | `messages/en.json` | 4 | Add 3 translation keys (same) |
| 8 | `src/components/crm/address-form-sheet.tsx` | 4 | Add to FormState, INITIAL_STATE, props, effect, payload, render (conditional section) |
| 9 | `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx` | 5 | Add conditional "Lieferantendaten" card |
| 10 | `src/components/warehouse/purchase-order-detail.tsx` | 5 | Add `ourCustomerNumber` to supplier type cast and DetailRow |
| 11 | `src/trpc/routers/__tests__/crmAddresses-router.test.ts` | 6 | Add to mock, add create/update/getById tests |
| 12 | `docs/TERP_HANDBUCH.md` | 7 | Update section 12.1 with new field documentation |

## Files NOT needing changes

- `src/hooks/use-crm-addresses.ts` — hooks are generic pass-through wrappers
- `src/hooks/index.ts` — no new hooks needed
- `src/lib/services/wh-purchase-order-repository.ts` — already uses `supplier: true` include
- `src/trpc/routers/crm/index.ts` — no structural changes
- `src/lib/services/crm-address-repository.ts` `update` method — uses `Record<string, unknown>`, no type change needed
- `src/lib/services/crm-address-repository.ts` `findById` method — returns all model fields automatically
