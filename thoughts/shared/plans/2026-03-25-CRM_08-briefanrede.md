# Implementation Plan: CRM_08 — Briefanrede bei Kontaktpersonen

Date: 2026-03-25

---

## Phase 1: Database Migration

### 1a. Create Supabase migration

**File (new):** `supabase/migrations/20260330100000_crm_contact_salutation_fields.sql`

```sql
-- CRM_08: Add salutation, title, and letter_salutation to crm_contacts
ALTER TABLE crm_contacts
  ADD COLUMN salutation VARCHAR(20),
  ADD COLUMN title VARCHAR(50),
  ADD COLUMN letter_salutation VARCHAR(255);
```

**Verification:** `pnpm db:reset` should complete without errors.

### 1b. Update Prisma schema

**File:** `prisma/schema.prisma` (lines 341–369, CrmContact model)

Add three new fields between `lastName` (line 346) and `position` (line 347):

```prisma
model CrmContact {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId   String   @map("tenant_id") @db.Uuid
  addressId  String   @map("address_id") @db.Uuid
  firstName  String   @map("first_name") @db.VarChar(100)
  lastName   String   @map("last_name") @db.VarChar(100)
  salutation String?  @db.VarChar(20)                          // NEW
  title      String?  @db.VarChar(50)                          // NEW
  letterSalutation String? @map("letter_salutation") @db.VarChar(255)  // NEW
  position   String?  @db.VarChar(100)
  // ... rest unchanged
```

**Verification:** `pnpm db:generate` should regenerate the Prisma client without errors. Verify with `pnpm typecheck` (baseline ~1463 errors; count should not increase).

---

## Phase 2: Service Layer

### 2a. Add `generateLetterSalutation` helper

**File:** `src/lib/services/crm-address-service.ts`

Add the helper function near the top of the file, after the BANK_ACCOUNT_TRACKED_FIELDS constant (around line 23):

```ts
// --- Letter Salutation Helper ---

export function generateLetterSalutation(
  salutation?: string | null,
  title?: string | null,
  lastName?: string | null
): string {
  if (!salutation || !lastName) return ""
  const prefix = salutation === "Herr" ? "Sehr geehrter Herr" : "Sehr geehrte Frau"
  const titlePart = title ? ` ${title}` : ""
  return `${prefix}${titlePart} ${lastName}`
}
```

Note: For "Divers", we also use "Sehr geehrte/r" — but the simple approach is to only auto-generate for "Herr" and "Frau". For "Divers", the user should manually fill in the letter salutation. Update the function accordingly:

```ts
export function generateLetterSalutation(
  salutation?: string | null,
  title?: string | null,
  lastName?: string | null
): string {
  if (!salutation || !lastName) return ""
  if (salutation === "Herr") {
    const titlePart = title ? ` ${title}` : ""
    return `Sehr geehrter Herr${titlePart} ${lastName}`
  }
  if (salutation === "Frau") {
    const titlePart = title ? ` ${title}` : ""
    return `Sehr geehrte Frau${titlePart} ${lastName}`
  }
  // "Divers" or unknown — no auto-generation
  return ""
}
```

### 2b. Update CONTACT_TRACKED_FIELDS

**File:** `src/lib/services/crm-address-service.ts` (line 16–19)

Add the three new fields to tracked fields for audit logging:

```ts
const CONTACT_TRACKED_FIELDS = [
  "firstName", "lastName", "salutation", "title", "letterSalutation",
  "position", "department", "phone", "email",
  "notes", "isPrimary",
]
```

### 2c. Update `createContact` service function

**File:** `src/lib/services/crm-address-service.ts` (lines 309–361)

**Input type** — add three new optional fields:

```ts
input: {
  addressId: string
  firstName: string
  lastName: string
  salutation?: string      // NEW
  title?: string           // NEW
  letterSalutation?: string // NEW
  position?: string
  department?: string
  phone?: string
  email?: string
  notes?: string
  isPrimary?: boolean
}
```

**Auto-generation logic** — add after the firstName/lastName validation (after line 337), before the `repo.createContact` call:

```ts
// Auto-generate letterSalutation if not provided
const letterSalutation = input.letterSalutation?.trim() ||
  generateLetterSalutation(input.salutation, input.title, lastName) || null
```

**Pass to repository** — add new fields in the `repo.createContact` data object (after line 343, lastName):

```ts
const created = await repo.createContact(prisma, {
  tenantId,
  addressId: input.addressId,
  firstName,
  lastName,
  salutation: input.salutation || null,       // NEW
  title: input.title || null,                 // NEW
  letterSalutation,                           // NEW (auto-generated or manual)
  position: input.position || null,
  department: input.department || null,
  phone: input.phone || null,
  email: input.email || null,
  notes: input.notes || null,
  isPrimary: input.isPrimary ?? false,
})
```

### 2d. Update `updateContact` service function

**File:** `src/lib/services/crm-address-service.ts` (lines 363–420)

**Input type** — add three new optional/nullable fields:

```ts
input: {
  id: string
  firstName?: string
  lastName?: string
  salutation?: string | null      // NEW
  title?: string | null           // NEW
  letterSalutation?: string | null // NEW
  position?: string | null
  // ... rest unchanged
}
```

**Add new fields to optionalFields array** (line 401):

```ts
const optionalFields = ["salutation", "title", "letterSalutation", "position", "department", "phone", "email", "notes", "isPrimary"] as const
```

**Auto-generation on update** — add after the optionalFields loop (after line 406), before `repo.updateContact`:

```ts
// Auto-generate letterSalutation if salutation/name changed and letterSalutation not explicitly set
if (input.letterSalutation === undefined) {
  // Only auto-generate if salutation or lastName were updated
  if (input.salutation !== undefined || input.lastName !== undefined) {
    const effectiveSalutation = (data.salutation as string | null | undefined) ?? existing.salutation
    const effectiveTitle = (data.title as string | null | undefined) ?? existing.title
    const effectiveLastName = (data.lastName as string | undefined) ?? existing.lastName
    const autoGenerated = generateLetterSalutation(effectiveSalutation, effectiveTitle, effectiveLastName)
    if (autoGenerated) {
      // Only overwrite if existing letterSalutation was auto-generated (i.e., matches what we would have generated before)
      const previousAutoGenerated = generateLetterSalutation(existing.salutation, existing.title, existing.lastName)
      if (!existing.letterSalutation || existing.letterSalutation === previousAutoGenerated) {
        data.letterSalutation = autoGenerated
      }
    }
  }
}
```

This logic preserves manual overrides: if the existing `letterSalutation` does not match what auto-generation would have produced, it is considered manually overridden and is not touched.

### 2e. Update repository `createContact` type

**File:** `src/lib/services/crm-address-repository.ts` (lines 164–180)

Add three new optional fields to the `data` parameter type:

```ts
export async function createContact(
  prisma: PrismaClient,
  data: {
    tenantId: string
    addressId: string
    firstName: string
    lastName: string
    salutation?: string | null       // NEW
    title?: string | null            // NEW
    letterSalutation?: string | null // NEW
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
```

No changes needed to `updateContact` repository function — it already accepts `Record<string, unknown>`.

**Verification:** `pnpm typecheck` — error count should not increase from baseline.

---

## Phase 3: tRPC Router

**File:** `src/trpc/routers/crm/addresses.ts`

### 3a. Update `contactsCreate` input schema (lines 188–198)

Add three new fields after `lastName`:

```ts
.input(z.object({
  addressId: z.string().uuid(),
  firstName: z.string().min(1, "First name is required").max(255),
  lastName: z.string().min(1, "Last name is required").max(255),
  salutation: z.string().max(20).optional(),            // NEW
  title: z.string().max(50).optional(),                 // NEW
  letterSalutation: z.string().max(255).optional(),     // NEW
  position: z.string().max(255).optional(),
  department: z.string().max(255).optional(),
  phone: z.string().max(255).optional(),
  email: z.string().email().optional().or(z.literal("")),
  notes: z.string().max(2000).optional(),
  isPrimary: z.boolean().optional().default(false),
}))
```

### 3b. Update `contactsUpdate` input schema (lines 214–224)

Add three new fields after `lastName`:

```ts
.input(z.object({
  id: z.string().uuid(),
  firstName: z.string().min(1).max(255).optional(),
  lastName: z.string().min(1).max(255).optional(),
  salutation: z.string().max(20).nullable().optional(),            // NEW
  title: z.string().max(50).nullable().optional(),                 // NEW
  letterSalutation: z.string().max(255).nullable().optional(),     // NEW
  position: z.string().max(255).nullable().optional(),
  department: z.string().max(255).nullable().optional(),
  phone: z.string().max(255).nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  notes: z.string().max(2000).nullable().optional(),
  isPrimary: z.boolean().optional(),
}))
```

No other router changes needed — the router passes `input` straight to the service.

**Verification:** `pnpm typecheck` — error count should not increase.

---

## Phase 4: React Hook

**File:** `src/hooks/use-crm-addresses.ts`

**No code changes needed.** The hooks (`useCreateCrmContact`, `useUpdateCrmContact`, `useCrmContacts`) use tRPC's inferred types from the router. Since we updated the Zod schemas in the router, the hook types auto-update via tRPC inference. No manual type definitions exist in this file.

**Verification:** Confirm by checking that the hook file has no locally defined contact type interfaces. Already verified in research — it only calls `trpc.crm.addresses.*` procedures.

---

## Phase 5: UI Components

### 5a. Update `contact-form-dialog.tsx`

**File:** `src/components/crm/contact-form-dialog.tsx`

#### 5a-i. Add imports

Add `Select` components and the `Wand2` icon:

```ts
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Wand2 } from 'lucide-react'
```

#### 5a-ii. Add `generateLetterSalutation` client-side helper

Add at the top of the file (after imports), duplicating the server-side logic for UI preview:

```ts
function generateLetterSalutation(
  salutation: string,
  title: string,
  lastName: string
): string {
  if (!salutation || !lastName) return ""
  if (salutation === "Herr") {
    const titlePart = title ? ` ${title}` : ""
    return `Sehr geehrter Herr${titlePart} ${lastName}`
  }
  if (salutation === "Frau") {
    const titlePart = title ? ` ${title}` : ""
    return `Sehr geehrte Frau${titlePart} ${lastName}`
  }
  return ""
}
```

#### 5a-iii. Update `ContactFormDialogProps.contact` type (lines 26–36)

Add new optional fields:

```ts
contact?: {
  id: string
  firstName: string
  lastName: string
  salutation: string | null       // NEW
  title: string | null            // NEW
  letterSalutation: string | null // NEW
  position: string | null
  department: string | null
  phone: string | null
  email: string | null
  notes: string | null
  isPrimary: boolean
} | null
```

#### 5a-iv. Update `FormState` interface (lines 40–49)

Add new fields:

```ts
interface FormState {
  salutation: string       // NEW
  title: string            // NEW
  letterSalutation: string // NEW
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

#### 5a-v. Update `INITIAL_STATE` (lines 51–60)

```ts
const INITIAL_STATE: FormState = {
  salutation: '',       // NEW
  title: '',            // NEW
  letterSalutation: '', // NEW
  firstName: '',
  lastName: '',
  position: '',
  department: '',
  phone: '',
  email: '',
  notes: '',
  isPrimary: false,
}
```

#### 5a-vi. Update `useEffect` for edit mode (lines 82–92)

Add new fields to the form population:

```ts
setForm({
  salutation: contact.salutation || '',       // NEW
  title: contact.title || '',                 // NEW
  letterSalutation: contact.letterSalutation || '', // NEW
  firstName: contact.firstName,
  lastName: contact.lastName,
  position: contact.position || '',
  department: contact.department || '',
  phone: contact.phone || '',
  email: contact.email || '',
  notes: contact.notes || '',
  isPrimary: contact.isPrimary,
})
```

#### 5a-vii. Add `letterSalutationManuallyEdited` ref

Track whether the user has manually typed in the letter salutation field:

```ts
const letterSalutationManuallyEdited = React.useRef(false)
```

Reset it in the `useEffect` when the dialog opens:

```ts
React.useEffect(() => {
  if (open) {
    setError(null)
    letterSalutationManuallyEdited.current = false
    // ... rest of existing logic
  }
}, [open, contact])
```

#### 5a-viii. Add auto-update effect for letterSalutation

After the existing `useEffect`, add:

```ts
React.useEffect(() => {
  if (!letterSalutationManuallyEdited.current) {
    const auto = generateLetterSalutation(form.salutation, form.title, form.lastName)
    setForm((p) => ({ ...p, letterSalutation: auto }))
  }
}, [form.salutation, form.title, form.lastName])
```

#### 5a-ix. Update `handleSubmit` — pass new fields

For **create** (lines 121–131):

```ts
await createMutation.mutateAsync({
  addressId,
  firstName: form.firstName.trim(),
  lastName: form.lastName.trim(),
  salutation: form.salutation || undefined,              // NEW
  title: form.title || undefined,                        // NEW
  letterSalutation: form.letterSalutation.trim() || undefined, // NEW
  position: form.position.trim() || undefined,
  department: form.department.trim() || undefined,
  phone: form.phone.trim() || undefined,
  email: form.email.trim() || undefined,
  notes: form.notes.trim() || undefined,
  isPrimary: form.isPrimary,
})
```

For **update** (lines 109–119):

```ts
await updateMutation.mutateAsync({
  id: contact!.id,
  firstName: form.firstName.trim(),
  lastName: form.lastName.trim(),
  salutation: form.salutation || null,              // NEW
  title: form.title || null,                        // NEW
  letterSalutation: form.letterSalutation.trim() || null, // NEW
  position: form.position.trim() || null,
  department: form.department.trim() || null,
  phone: form.phone.trim() || null,
  email: form.email.trim() || null,
  notes: form.notes.trim() || null,
  isPrimary: form.isPrimary,
})
```

#### 5a-x. Update dialog width

Change `sm:max-w-md` to `sm:max-w-lg` (line 144) to accommodate the additional fields.

#### 5a-xi. Add form fields to the JSX

Insert a new row **before** the existing firstName/lastName row (before line 151). The new row contains Anrede and Titel:

```tsx
{/* Row 0: Anrede + Titel */}
<div className="grid grid-cols-2 gap-4">
  <div className="space-y-2">
    <Label htmlFor="salutation">{t('labelSalutation')}</Label>
    <Select
      value={form.salutation}
      onValueChange={(value) => setForm((p) => ({ ...p, salutation: value }))}
      disabled={isSubmitting}
    >
      <SelectTrigger id="salutation">
        <SelectValue placeholder={t('selectSalutation')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="Herr">{t('salutationHerr')}</SelectItem>
        <SelectItem value="Frau">{t('salutationFrau')}</SelectItem>
        <SelectItem value="Divers">{t('salutationDivers')}</SelectItem>
      </SelectContent>
    </Select>
  </div>
  <div className="space-y-2">
    <Label htmlFor="title">{t('labelTitle')}</Label>
    <Select
      value={form.title}
      onValueChange={(value) => setForm((p) => ({ ...p, title: value }))}
      disabled={isSubmitting}
    >
      <SelectTrigger id="title">
        <SelectValue placeholder={t('selectTitle')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="Dr.">Dr.</SelectItem>
        <SelectItem value="Prof.">Prof.</SelectItem>
        <SelectItem value="Prof. Dr.">Prof. Dr.</SelectItem>
      </SelectContent>
    </Select>
  </div>
</div>
```

Insert a new row **after** the existing firstName/lastName row (after line 170). The new row contains the Briefanrede field with auto-generate button:

```tsx
{/* Row: Briefanrede */}
<div className="space-y-2">
  <Label htmlFor="letterSalutation">{t('labelLetterSalutation')}</Label>
  <div className="flex gap-2">
    <Input
      id="letterSalutation"
      value={form.letterSalutation}
      onChange={(e) => {
        letterSalutationManuallyEdited.current = true
        setForm((p) => ({ ...p, letterSalutation: e.target.value }))
      }}
      placeholder={t('letterSalutationPlaceholder')}
      disabled={isSubmitting}
      className="flex-1"
    />
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={() => {
        const auto = generateLetterSalutation(form.salutation, form.title, form.lastName)
        if (auto) {
          setForm((p) => ({ ...p, letterSalutation: auto }))
          letterSalutationManuallyEdited.current = false
        }
      }}
      disabled={isSubmitting}
      title={t('autoGenerateLetterSalutation')}
    >
      <Wand2 className="h-4 w-4" />
    </Button>
  </div>
</div>
```

### 5b. Update `contact-list.tsx`

**File:** `src/components/crm/contact-list.tsx`

#### 5b-i. Update `CrmContact` interface (lines 22–31)

Add optional fields so the data flows through (even if not displayed in columns):

```ts
interface CrmContact {
  id: string
  firstName: string
  lastName: string
  salutation: string | null       // NEW
  title: string | null            // NEW
  letterSalutation: string | null // NEW
  position: string | null
  department: string | null
  phone: string | null
  email: string | null
  isPrimary: boolean
}
```

#### 5b-ii. Update name display (line 74)

Include salutation and title in the name column:

```tsx
<TableCell className="font-medium">
  {[contact.salutation, contact.title, contact.firstName, contact.lastName].filter(Boolean).join(' ')}
</TableCell>
```

### 5c. Add i18n translations

**File:** `messages/de.json`

Add new keys inside the `crmAddresses` namespace, after `"labelDepartment": "Abteilung"` (around line 5220):

```json
"labelSalutation": "Anrede",
"labelTitle": "Titel",
"labelLetterSalutation": "Briefanrede",
"selectSalutation": "Anrede wählen",
"selectTitle": "Titel wählen",
"salutationHerr": "Herr",
"salutationFrau": "Frau",
"salutationDivers": "Divers",
"letterSalutationPlaceholder": "z. B. Sehr geehrter Herr Dr. Müller",
"autoGenerateLetterSalutation": "Briefanrede automatisch generieren",
```

**Verification:** `pnpm dev` — open a CRM address, click "Kontakt hinzufuegen", verify new fields render.

---

## Phase 6: Tests

### 6a. Unit tests for `generateLetterSalutation`

**File (new):** `src/lib/services/__tests__/generateLetterSalutation.test.ts`

```ts
import { describe, it, expect } from "vitest"
import { generateLetterSalutation } from "../crm-address-service"

describe("generateLetterSalutation", () => {
  it("generates for Herr with title", () => {
    expect(generateLetterSalutation("Herr", "Dr.", "Müller"))
      .toBe("Sehr geehrter Herr Dr. Müller")
  })

  it("generates for Frau without title", () => {
    expect(generateLetterSalutation("Frau", null, "Schmidt"))
      .toBe("Sehr geehrte Frau Schmidt")
  })

  it("generates for Herr with Prof. Dr. title", () => {
    expect(generateLetterSalutation("Herr", "Prof. Dr.", "Weber"))
      .toBe("Sehr geehrter Herr Prof. Dr. Weber")
  })

  it("returns empty string when salutation is missing", () => {
    expect(generateLetterSalutation(null, "Dr.", "Test")).toBe("")
  })

  it("returns empty string when lastName is missing", () => {
    expect(generateLetterSalutation("Herr", null, null)).toBe("")
  })

  it("returns empty string for Divers (no auto-generation)", () => {
    expect(generateLetterSalutation("Divers", null, "Test")).toBe("")
  })
})
```

**Run:** `pnpm vitest run src/lib/services/__tests__/generateLetterSalutation.test.ts`

### 6b. Integration tests for create/update with new fields

**File:** `src/trpc/routers/__tests__/crmAddresses-router.test.ts`

Add new test cases after the existing `contactsCreate` describe block (after line 420):

```ts
describe("crm.addresses.contactsCreate — salutation fields", () => {
  it("creates contact with salutation, title, and auto-generated letterSalutation", async () => {
    const newContact = {
      id: CONTACT_ID,
      tenantId: TENANT_ID,
      addressId: ADDRESS_ID,
      firstName: "Max",
      lastName: "Müller",
      salutation: "Herr",
      title: "Dr.",
      letterSalutation: "Sehr geehrter Herr Dr. Müller",
      position: null,
      department: null,
      phone: null,
      email: null,
      notes: null,
      isPrimary: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const prisma = {
      crmAddress: {
        findFirst: vi.fn().mockResolvedValue(mockAddress),
      },
      crmContact: {
        create: vi.fn().mockResolvedValue(newContact),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.contactsCreate({
      addressId: ADDRESS_ID,
      firstName: "Max",
      lastName: "Müller",
      salutation: "Herr",
      title: "Dr.",
    })

    // Verify the create call was made with auto-generated letterSalutation
    expect(prisma.crmContact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        salutation: "Herr",
        title: "Dr.",
        letterSalutation: "Sehr geehrter Herr Dr. Müller",
      }),
    })
    expect(result.letterSalutation).toBe("Sehr geehrter Herr Dr. Müller")
  })

  it("preserves manually provided letterSalutation", async () => {
    const newContact = {
      id: CONTACT_ID,
      tenantId: TENANT_ID,
      addressId: ADDRESS_ID,
      firstName: "Hans",
      lastName: "Schmidt",
      salutation: "Herr",
      title: null,
      letterSalutation: "Lieber Hans",
      position: null,
      department: null,
      phone: null,
      email: null,
      notes: null,
      isPrimary: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const prisma = {
      crmAddress: {
        findFirst: vi.fn().mockResolvedValue(mockAddress),
      },
      crmContact: {
        create: vi.fn().mockResolvedValue(newContact),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    await caller.contactsCreate({
      addressId: ADDRESS_ID,
      firstName: "Hans",
      lastName: "Schmidt",
      salutation: "Herr",
      letterSalutation: "Lieber Hans",
    })

    expect(prisma.crmContact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        letterSalutation: "Lieber Hans",
      }),
    })
  })
})
```

### 6c. Tenant isolation test

No additional tenant isolation test is needed for this feature because:
- The `salutation`, `title`, and `letterSalutation` fields are simple columns on `crm_contacts`
- All existing tenant isolation (via `tenantId` scoping in `findContactById`, `createContact`, `updateContact`, `deleteContact`) applies automatically
- Existing tenant isolation tests in the test suite already cover contact operations

**Verification:** `pnpm vitest run src/trpc/routers/__tests__/crmAddresses-router.test.ts`

---

## Phase 7: Handbook

**File:** `docs/TERP_HANDBUCH.md` (section 12.2, lines 4279–4325)

### 7a. Update table columns (lines 4289–4299)

Add Anrede column between Name and Position:

```
| Spalte | Beschreibung |
|--------|-------------|
| **Name** | Anrede + Titel + Vorname + Nachname |
| **Position** | Funktion im Unternehmen (z. B. Geschäftsführer) |
| **Abteilung** | Abteilung im Unternehmen (z. B. Einkauf) |
| **Telefon** | Durchwahl |
| **E-Mail** | E-Mail-Adresse |
| **Hauptkontakt** | Badge, wenn als Hauptkontakt markiert |
| **Aktionen** | ⋯-Menü: Bearbeiten, Löschen |
```

### 7b. Update "Neuen Kontakt anlegen" section (lines 4301–4310)

```
##### Neuen Kontakt anlegen

1. 📍 Tab „Kontakte" → **„Kontakt hinzufügen"** (oben rechts)
2. ✅ Dialog öffnet sich: „Neuen Kontakt anlegen"
3. Ausfüllen:
   - **Anrede** (Dropdown: Herr / Frau / Divers), **Titel** (Dropdown: Dr. / Prof. / Prof. Dr.)
   - **Vorname** (Pflicht), **Nachname** (Pflicht)
   - **Briefanrede** — wird automatisch generiert (z. B. „Sehr geehrter Herr Dr. Müller"), kann manuell überschrieben werden. Zauberstab-Button regeneriert den Vorschlag.
   - **Position**, **Abteilung**, **Telefon**, **E-Mail**, **Notizen**
   - **Hauptkontakt** (Checkbox)
4. 📍 „Anlegen"
5. ✅ Kontakt erscheint in der Tabelle
```

### 7c. Add Praxisbeispiel after "Kontakt löschen" section (after line 4323)

```
##### Praxisbeispiel: Briefanrede

**Szenario:** Sie legen einen neuen Kontakt für den Kunden „Müller GmbH" an.

1. 📍 Adresse „Müller GmbH" öffnen → Tab **„Kontakte"** → **„Kontakt hinzufügen"**
2. ✅ Dialog öffnet sich
3. **Anrede:** „Herr" wählen
4. **Titel:** „Dr." wählen
5. **Vorname:** „Thomas", **Nachname:** „Müller"
6. ✅ **Briefanrede** zeigt automatisch: „Sehr geehrter Herr Dr. Müller"
7. 📍 „Anlegen"
8. ✅ Kontakt erscheint in der Tabelle als „Herr Dr. Thomas Müller"

**Manuell überschreiben:**
1. 📍 ⋯-Menü des Kontakts → **„Bearbeiten"**
2. **Briefanrede** manuell ändern zu: „Lieber Thomas"
3. 📍 „Speichern"
4. ✅ Die manuelle Briefanrede bleibt erhalten — sie wird nicht automatisch überschrieben

💡 **Hinweis:** Die Briefanrede wird in Belegen und Reports als persönliche Anrede verwendet (z. B. in Angebotsschreiben oder Rechnungsbegleitschreiben).
```

**Verification:** Read the updated handbook section and verify the Praxisbeispiel is step-by-step clickable (matching the actual UI flow).

---

## Summary of All Files

| # | File | Action |
|---|------|--------|
| 1 | `supabase/migrations/20260330100000_crm_contact_salutation_fields.sql` | **CREATE** — migration adding 3 columns |
| 2 | `prisma/schema.prisma` | **EDIT** — add salutation, title, letterSalutation to CrmContact |
| 3 | `src/lib/services/crm-address-service.ts` | **EDIT** — add generateLetterSalutation helper, update createContact/updateContact, update CONTACT_TRACKED_FIELDS |
| 4 | `src/lib/services/crm-address-repository.ts` | **EDIT** — add fields to createContact data type |
| 5 | `src/trpc/routers/crm/addresses.ts` | **EDIT** — add fields to contactsCreate/contactsUpdate Zod schemas |
| 6 | `src/hooks/use-crm-addresses.ts` | **NO CHANGE** — tRPC inferred types auto-update |
| 7 | `src/components/crm/contact-form-dialog.tsx` | **EDIT** — add Anrede/Titel dropdowns, Briefanrede field with auto-generate |
| 8 | `src/components/crm/contact-list.tsx` | **EDIT** — update CrmContact interface, update name display |
| 9 | `messages/de.json` | **EDIT** — add 10 new translation keys |
| 10 | `src/lib/services/__tests__/generateLetterSalutation.test.ts` | **CREATE** — unit tests for helper |
| 11 | `src/trpc/routers/__tests__/crmAddresses-router.test.ts` | **EDIT** — add integration tests |
| 12 | `docs/TERP_HANDBUCH.md` | **EDIT** — update section 12.2 with new fields and Praxisbeispiel |

## Verification Sequence

1. `pnpm db:reset` — migration applies cleanly
2. `pnpm db:generate` — Prisma client regenerated
3. `pnpm typecheck` — no new type errors
4. `pnpm vitest run src/lib/services/__tests__/generateLetterSalutation.test.ts` — unit tests pass
5. `pnpm vitest run src/trpc/routers/__tests__/crmAddresses-router.test.ts` — integration tests pass
6. `pnpm lint` — no lint errors
7. `pnpm dev` — manual UI verification: create contact with Anrede/Titel, verify auto-generated Briefanrede, verify manual override persists
