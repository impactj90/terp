# Implementation Plan: CRM_02 Korrespondenz (Correspondence Protocol)

Date: 2026-03-16

**Ticket:** `thoughts/shared/tickets/orgAuftrag/TICKET_CRM_02_KORRESPONDENZ.md`
**Research:** `thoughts/shared/research/2026-03-16-CRM_02-korrespondenz.md`

---

## Overview

Implement a correspondence log (Korrespondenz) for CRM addresses. Every phone call, email, letter, fax, or visit is recorded with direction (incoming/outgoing/internal), linked to a contact person and optionally to an inquiry. Supports full-text search across subject and content, date range filtering, and direction/type filtering.

**Total new files:** 12
**Total modified files:** 8

---

## Phase 1: Prisma Schema (Model, Enum, Relations, Migration)

### 1A. Add Enum + Model to Prisma Schema

**File to modify:** `prisma/schema.prisma`

**Add the `CrmCorrespondenceDirection` enum** (place after the existing `CrmAddressType` enum):

```prisma
enum CrmCorrespondenceDirection {
  INCOMING
  OUTGOING
  INTERNAL

  @@map("crm_correspondence_direction")
}
```

**Add the `CrmCorrespondence` model** (place after `CrmBankAccount` model):

```prisma
model CrmCorrespondence {
  id            String                      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String                      @map("tenant_id") @db.Uuid
  addressId     String                      @map("address_id") @db.Uuid
  direction     CrmCorrespondenceDirection
  type          String                      // "phone", "email", "letter", "fax", "visit"
  date          DateTime                    @db.Timestamptz(6)
  contactId     String?                     @map("contact_id") @db.Uuid
  inquiryId     String?                     @map("inquiry_id") @db.Uuid
  fromUser      String?                     @map("from_user")
  toUser        String?                     @map("to_user")
  subject       String
  content       String?
  attachments   Json?                       @db.JsonB
  createdAt     DateTime                    @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime                    @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById   String?                     @map("created_by_id") @db.Uuid

  tenant  Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  address CrmAddress @relation(fields: [addressId], references: [id], onDelete: Cascade)
  contact CrmContact? @relation(fields: [contactId], references: [id], onDelete: SetNull)

  @@index([tenantId, addressId])
  @@index([tenantId, date])
  @@index([tenantId, inquiryId])
  @@map("crm_correspondences")
}
```

**Add reverse relations:**

- On `CrmAddress` model: add `correspondences CrmCorrespondence[]`
- On `CrmContact` model: add `correspondences CrmCorrespondence[]`
- On `Tenant` model: add `crmCorrespondences CrmCorrespondence[]`

### 1B. Create SQL Migration

**File to create:** `supabase/migrations/20260101000096_create_crm_correspondences.sql`

```sql
-- CRM_02: Correspondence Protocol
CREATE TYPE crm_correspondence_direction AS ENUM ('INCOMING', 'OUTGOING', 'INTERNAL');

CREATE TABLE crm_correspondences (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    address_id      UUID            NOT NULL REFERENCES crm_addresses(id) ON DELETE CASCADE,
    direction       crm_correspondence_direction NOT NULL,
    type            TEXT            NOT NULL,
    date            TIMESTAMPTZ     NOT NULL,
    contact_id      UUID            REFERENCES crm_contacts(id) ON DELETE SET NULL,
    inquiry_id      UUID,
    from_user       TEXT,
    to_user         TEXT,
    subject         TEXT            NOT NULL,
    content         TEXT,
    attachments     JSONB,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by_id   UUID
);

CREATE INDEX idx_crm_correspondences_tenant_address ON crm_correspondences(tenant_id, address_id);
CREATE INDEX idx_crm_correspondences_tenant_date ON crm_correspondences(tenant_id, date);
CREATE INDEX idx_crm_correspondences_tenant_inquiry ON crm_correspondences(tenant_id, inquiry_id);
```

### 1C. Regenerate Prisma Client

Run: `pnpm db:generate`

### Verification

- [ ] `pnpm db:generate` completes without errors
- [ ] `pnpm typecheck` shows no new type errors related to CrmCorrespondence
- [ ] Migration SQL is syntactically valid
- [ ] Reverse relations on CrmAddress, CrmContact, and Tenant compile

### Dependencies

- None (first phase)

---

## Phase 2: Permission Catalog Entries

### File to modify: `src/lib/auth/permission-catalog.ts`

**Add 4 permission entries** at the end of the `ALL_PERMISSIONS` array, after the existing CRM address permissions:

```ts
// CRM Correspondence
p("crm_correspondence.view", "crm_correspondence", "view", "View CRM correspondence"),
p("crm_correspondence.create", "crm_correspondence", "create", "Create CRM correspondence"),
p("crm_correspondence.edit", "crm_correspondence", "edit", "Edit CRM correspondence"),
p("crm_correspondence.delete", "crm_correspondence", "delete", "Delete CRM correspondence"),
```

### Verification

- [ ] `pnpm typecheck` passes (no new errors)
- [ ] `permissionIdByKey("crm_correspondence.view")` returns a valid UUID
- [ ] All 4 keys resolve to unique UUIDs

### Dependencies

- None (independent of Phase 1, but logically follows it)

---

## Phase 3: Repository (Data Access Layer)

### File to create: `src/lib/services/crm-correspondence-repository.ts`

**Pattern:** Functional module with exported functions. Follow the exact pattern from `crm-address-repository.ts`.

**Functions to implement:**

#### `findMany(prisma, tenantId, params)`

```ts
export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    addressId?: string
    inquiryId?: string
    search?: string
    direction?: "INCOMING" | "OUTGOING" | "INTERNAL"
    type?: string
    dateFrom?: Date
    dateTo?: Date
    page: number
    pageSize: number
  }
): Promise<{ items: CrmCorrespondence[]; total: number }>
```

Build `where` clause:
- Always include `tenantId`
- If `addressId` provided: add to where
- If `inquiryId` provided: add to where
- If `direction` provided: add to where
- If `type` provided: add to where
- If `dateFrom` provided: `date: { gte: dateFrom }`
- If `dateTo` provided: `date: { lte: dateTo }` (merge with gte if both)
- If `search` provided: `OR: [{ subject: { contains: search, mode: "insensitive" } }, { content: { contains: search, mode: "insensitive" } }]`

Use `Promise.all([findMany, count])` pattern. OrderBy: `{ date: "desc" }`.

Include `contact` relation in findMany for displaying contact name in list.

#### `findById(prisma, tenantId, id)`

```ts
export async function findById(prisma: PrismaClient, tenantId: string, id: string)
```

Use `prisma.crmCorrespondence.findFirst({ where: { id, tenantId }, include: { contact: true, address: true } })`.

#### `create(prisma, data)`

```ts
export async function create(prisma: PrismaClient, data: { tenantId: string; addressId: string; direction: ...; type: string; date: Date; contactId?: string; inquiryId?: string; fromUser?: string; toUser?: string; subject: string; content?: string; attachments?: unknown; createdById?: string })
```

Use `prisma.crmCorrespondence.create({ data })`.

#### `update(prisma, tenantId, id, data)`

```ts
export async function update(prisma: PrismaClient, tenantId: string, id: string, data: Partial<...>)
```

Use `prisma.crmCorrespondence.updateMany({ where: { id, tenantId }, data })` then return the updated record.

#### `remove(prisma, tenantId, id)`

```ts
export async function remove(prisma: PrismaClient, tenantId: string, id: string): Promise<boolean>
```

Use `prisma.crmCorrespondence.deleteMany({ where: { id, tenantId } })` — return `count > 0`. This is a hard delete (correspondence is a log; soft-delete not needed per ticket).

### Verification

- [ ] `pnpm typecheck` passes
- [ ] All functions export correctly
- [ ] Import path `@/generated/prisma/client` used for types

### Dependencies

- Phase 1 (Prisma schema must be generated first)

---

## Phase 4: Service (Business Logic)

### File to create: `src/lib/services/crm-correspondence-service.ts`

**Pattern:** Functional module following `crm-address-service.ts`.

#### Error Classes

```ts
export class CrmCorrespondenceNotFoundError extends Error {
  constructor(message = "CRM correspondence not found") {
    super(message)
    this.name = "CrmCorrespondenceNotFoundError"
  }
}

export class CrmCorrespondenceValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CrmCorrespondenceValidationError"
  }
}
```

These names are critical: `handleServiceError` in `src/trpc/errors.ts` maps `*NotFoundError` to `NOT_FOUND` and `*ValidationError` to `BAD_REQUEST`.

#### Functions

**`list(prisma, tenantId, params)`** — Thin wrapper around `repo.findMany()`.

**`getById(prisma, tenantId, id)`** — Calls `repo.findById()`, throws `CrmCorrespondenceNotFoundError` if null.

**`create(prisma, tenantId, input, createdById)`** — Validation:
1. Verify `addressId` belongs to tenant: query `prisma.crmAddress.findFirst({ where: { id: input.addressId, tenantId } })`. Throw `CrmCorrespondenceValidationError("Address not found in this tenant")` if null.
2. If `contactId` provided: verify contact belongs to the address: `prisma.crmContact.findFirst({ where: { id: input.contactId, addressId: input.addressId, tenantId } })`. Throw validation error if null.
3. If `inquiryId` provided: skip validation for now (CRM_03 not yet implemented), but keep the field.
4. Call `repo.create(prisma, { tenantId, ...input, createdById })`.

**`update(prisma, tenantId, input)`** — Where `input` has `id` plus optional fields:
1. Verify existing record: `repo.findById(prisma, tenantId, input.id)`. Throw `CrmCorrespondenceNotFoundError` if null.
2. If `contactId` changes and is provided, validate it belongs to the address of the existing record.
3. Build partial update data from provided fields.
4. Call `repo.update(prisma, tenantId, input.id, data)`.

**`remove(prisma, tenantId, id)`** — Call `repo.remove(prisma, tenantId, id)`. Throw `CrmCorrespondenceNotFoundError` if returns false.

### Verification

- [ ] `pnpm typecheck` passes
- [ ] Error class names end with `NotFoundError` / `ValidationError`
- [ ] All functions follow `(prisma, tenantId, ...)` signature pattern
- [ ] Import: `import * as repo from "./crm-correspondence-repository"`

### Dependencies

- Phase 3 (repository must exist)

---

## Phase 5: tRPC Router + Wire into Root Router

### 5A. Create Router

**File to create:** `src/trpc/routers/crm/correspondence.ts`

**Pattern:** Follow `src/trpc/routers/crm/addresses.ts` exactly.

```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission } from "@/lib/auth/middleware"
import { requireModule } from "@/lib/modules"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as crmCorrespondenceService from "@/lib/services/crm-correspondence-service"
import type { PrismaClient } from "@/generated/prisma/client"
```

**Permission constants:**

```ts
const CORR_VIEW = permissionIdByKey("crm_correspondence.view")!
const CORR_CREATE = permissionIdByKey("crm_correspondence.create")!
const CORR_EDIT = permissionIdByKey("crm_correspondence.edit")!
const CORR_DELETE = permissionIdByKey("crm_correspondence.delete")!
```

**Base procedure:**

```ts
const crmProcedure = tenantProcedure.use(requireModule("crm"))
```

**Procedures:**

| Procedure | Type | Permission | Notes |
|-----------|------|-----------|-------|
| `list` | query | `CORR_VIEW` | Input: `{ addressId?, inquiryId?, search?, direction?, type?, dateFrom?, dateTo?, page, pageSize }` |
| `getById` | query | `CORR_VIEW` | Input: `{ id: z.string().uuid() }` |
| `create` | mutation | `CORR_CREATE` | Input: full create schema (see ticket for fields) |
| `update` | mutation | `CORR_EDIT` | Input: `{ id, ...optional fields }` |
| `delete` | mutation | `CORR_DELETE` | Input: `{ id }`, returns `{ success: true }` |

**Input schemas:**

```ts
const listInput = z.object({
  addressId: z.string().uuid().optional(),
  inquiryId: z.string().uuid().optional(),
  search: z.string().optional(),
  direction: z.enum(["INCOMING", "OUTGOING", "INTERNAL"]).optional(),
  type: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})

const createInput = z.object({
  addressId: z.string().uuid(),
  direction: z.enum(["INCOMING", "OUTGOING", "INTERNAL"]),
  type: z.string().min(1),
  date: z.coerce.date(),
  contactId: z.string().uuid().optional(),
  inquiryId: z.string().uuid().optional(),
  fromUser: z.string().optional(),
  toUser: z.string().optional(),
  subject: z.string().min(1),
  content: z.string().optional(),
  attachments: z.array(z.object({
    name: z.string(),
    url: z.string().url(),
    size: z.number(),
    mimeType: z.string(),
  })).optional(),
})

const updateInput = z.object({
  id: z.string().uuid(),
  direction: z.enum(["INCOMING", "OUTGOING", "INTERNAL"]).optional(),
  type: z.string().min(1).optional(),
  date: z.coerce.date().optional(),
  contactId: z.string().uuid().nullable().optional(),
  inquiryId: z.string().uuid().nullable().optional(),
  fromUser: z.string().nullable().optional(),
  toUser: z.string().nullable().optional(),
  subject: z.string().min(1).optional(),
  content: z.string().nullable().optional(),
  attachments: z.array(z.object({
    name: z.string(),
    url: z.string().url(),
    size: z.number(),
    mimeType: z.string(),
  })).nullable().optional(),
})
```

**Important patterns:**
- All procedures use `ctx.prisma as unknown as PrismaClient`
- All procedures wrap in try/catch with `handleServiceError(err)`
- `create` passes `ctx.user!.id` as `createdById`
- `delete` returns `{ success: true }`

### 5B. Wire into CRM Router

**File to modify:** `src/trpc/routers/crm/index.ts`

Add import and merge:

```ts
import { crmCorrespondenceRouter } from "./correspondence"

export const crmRouter = createTRPCRouter({
  addresses: crmAddressesRouter,
  correspondence: crmCorrespondenceRouter,
  numberSequences: numberSequencesRouter,
})
```

No changes needed to `src/trpc/routers/_app.ts` since `crmRouter` is already registered there.

### Verification

- [ ] `pnpm typecheck` passes
- [ ] All 5 procedures are accessible via `trpc.crm.correspondence.*`
- [ ] Module guard (`requireModule("crm")`) is on every procedure
- [ ] Permission guards use the correct permission IDs
- [ ] No changes needed to `_app.ts`

### Dependencies

- Phase 2 (permissions must exist)
- Phase 4 (service must exist)

---

## Phase 6: React Hooks

### File to create: `src/hooks/use-crm-correspondence.ts`

**Pattern:** Follow `src/hooks/use-crm-addresses.ts` exactly.

**Hooks to implement:**

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
```

| Hook | Type | Invalidation |
|------|------|-------------|
| `useCrmCorrespondence(filters)` | `useQuery` | — |
| `useCrmCorrespondenceById(id)` | `useQuery` | — |
| `useCreateCrmCorrespondence()` | `useMutation` | Invalidate `trpc.crm.correspondence.list.queryKey()` |
| `useUpdateCrmCorrespondence()` | `useMutation` | Invalidate `trpc.crm.correspondence.list.queryKey()` |
| `useDeleteCrmCorrespondence()` | `useMutation` | Invalidate `trpc.crm.correspondence.list.queryKey()` |

**`useCrmCorrespondence` options interface:**

```ts
interface UseCrmCorrespondenceOptions {
  enabled?: boolean
  addressId?: string
  inquiryId?: string
  search?: string
  direction?: "INCOMING" | "OUTGOING" | "INTERNAL"
  type?: string
  dateFrom?: Date
  dateTo?: Date
  page?: number
  pageSize?: number
}
```

### File to modify: `src/hooks/index.ts`

Add barrel exports at the bottom (after CRM Addresses block):

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

### Verification

- [ ] `pnpm typecheck` passes
- [ ] All hooks export from `@/hooks`
- [ ] Query invalidation targets the list queryKey

### Dependencies

- Phase 5 (tRPC router must be wired)

---

## Phase 7: UI Components

All files in `src/components/crm/`. Use `'use client'` directive. Follow patterns from existing CRM components (contact-list.tsx, contact-form-dialog.tsx, bank-account-list.tsx).

### 7A. Correspondence Type Badge

**File to create:** `src/components/crm/correspondence-type-badge.tsx`

A small component that renders an icon + label for each correspondence type:

| Type | Icon (lucide-react) | Label (de/en) |
|------|---------------------|---------------|
| `phone` | `Phone` | Telefon / Phone |
| `email` | `Mail` | E-Mail / Email |
| `letter` | `FileText` | Brief / Letter |
| `fax` | `Printer` | Fax / Fax |
| `visit` | `UserCheck` | Besuch / Visit |

Also render direction with icons:
| Direction | Icon | Label |
|-----------|------|-------|
| `INCOMING` | `ArrowDownLeft` | Eingehend / Incoming |
| `OUTGOING` | `ArrowUpRight` | Ausgehend / Outgoing |
| `INTERNAL` | `ArrowLeftRight` | Intern / Internal |

Use Badge component from `@/components/ui/badge` with appropriate variant styling.

### 7B. Correspondence List

**File to create:** `src/components/crm/correspondence-list.tsx`

**Pattern:** Follow `contact-list.tsx` / `bank-account-list.tsx` structure but with toolbar filters.

**Props:**
```ts
interface CorrespondenceListProps {
  addressId: string
  tenantId: string
}
```

**Features:**
- Header with title "Korrespondenz" and "Neuer Eintrag" button (Plus icon)
- Search input (searches subject + content)
- Direction filter dropdown (All / Incoming / Outgoing / Internal)
- Type filter dropdown (All / Phone / Email / Letter / Fax / Visit)
- Date range filter (optional, from/to date pickers)
- Table columns: Datum, Richtung (direction icon), Typ (type badge), Betreff, Kontakt, Aktionen
- Pagination (page, pageSize=25)
- Empty state message
- Row actions menu: Anzeigen (detail), Bearbeiten, Loschen

**Data source:** `useCrmCorrespondence({ addressId, ...filters })`

**State management:**
- `search`, `direction`, `type`, `dateFrom`, `dateTo` filter state
- `page` pagination state
- `formOpen` / `editItem` for form sheet
- `detailItem` for detail dialog
- `deleteItem` for delete confirmation

### 7C. Correspondence Form Sheet

**File to create:** `src/components/crm/correspondence-form-sheet.tsx`

**Pattern:** Follow `address-form-sheet.tsx` (Sheet with scrollable content area).

**Props:**
```ts
interface CorrespondenceFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  addressId: string
  editItem?: CrmCorrespondence | null
  contacts?: CrmContact[]  // For contact dropdown
}
```

**Form sections:**

1. **Grunddaten (Basic Data)**
   - Direction: Radio group or SegmentedControl (Eingehend / Ausgehend / Intern)
   - Type: Select dropdown (Telefon / E-Mail / Brief / Fax / Besuch)
   - Date: DatePicker (default: today)

2. **Beteiligte (Participants)**
   - Contact: Select dropdown populated with contacts from the address (optional)
   - Von (From User): Text input (optional, for internal sender)
   - An (To User): Text input (optional, for internal recipient)

3. **Inhalt (Content)**
   - Subject: Text input (required)
   - Content: Textarea (optional, multi-line)

4. **Anhange (Attachments)**
   - Placeholder for file attachment (JSONB metadata only, actual upload via Supabase Storage is future enhancement)
   - For initial implementation: display attachments if present, but skip upload UI

**On submit:**
- If `editItem`: call `useUpdateCrmCorrespondence().mutateAsync()`
- If new: call `useCreateCrmCorrespondence().mutateAsync()`
- Close sheet on success, show toast

### 7D. Correspondence Detail Dialog

**File to create:** `src/components/crm/correspondence-detail-dialog.tsx`

**Pattern:** Follow `contact-form-dialog.tsx` / dialog pattern but read-only.

**Props:**
```ts
interface CorrespondenceDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: CrmCorrespondence | null
}
```

**Display:**
- Header: Subject as title, direction badge + type badge
- Date and time
- Contact name (if linked)
- From/To user fields
- Content (full text, preserving line breaks)
- Attachments list (if any) with download links
- Footer: "Schliessen" button only

### Verification

- [ ] `pnpm typecheck` passes
- [ ] All components use `'use client'` directive
- [ ] Components use `useTranslations('crmCorrespondence')` for i18n
- [ ] Badge component renders correctly for all types/directions
- [ ] Sheet form scrolls when content overflows

### Dependencies

- Phase 6 (hooks must exist)

---

## Phase 8: Integration into Address Detail Page + i18n

### 8A. Replace Correspondence Tab Placeholder

**File to modify:** `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx`

Replace the current placeholder:
```tsx
<TabsContent value="correspondence" className="mt-6">
  <Card>
    <CardContent className="flex items-center justify-center py-16">
      <p className="text-muted-foreground">{t('comingSoon')} — CRM_02</p>
    </CardContent>
  </Card>
</TabsContent>
```

With the actual component:
```tsx
<TabsContent value="correspondence" className="mt-6">
  <CorrespondenceList addressId={id} tenantId={tenantId} />
</TabsContent>
```

Add import:
```tsx
import { CorrespondenceList } from "@/components/crm/correspondence-list"
```

### 8B. Add i18n Translations

**File to modify:** `messages/de.json`

Add new top-level key `"crmCorrespondence"`:

```json
"crmCorrespondence": {
  "title": "Korrespondenz",
  "newEntry": "Neuer Eintrag",
  "createTitle": "Neuen Korrespondenzeintrag anlegen",
  "editTitle": "Korrespondenzeintrag bearbeiten",
  "detailTitle": "Korrespondenzdetails",
  "searchPlaceholder": "Betreff oder Inhalt durchsuchen…",
  "direction": "Richtung",
  "directionAll": "Alle Richtungen",
  "directionIncoming": "Eingehend",
  "directionOutgoing": "Ausgehend",
  "directionInternal": "Intern",
  "type": "Typ",
  "typeAll": "Alle Typen",
  "typePhone": "Telefon",
  "typeEmail": "E-Mail",
  "typeLetter": "Brief",
  "typeFax": "Fax",
  "typeVisit": "Besuch",
  "date": "Datum",
  "dateFrom": "Von",
  "dateTo": "Bis",
  "subject": "Betreff",
  "content": "Inhalt",
  "contact": "Kontakt",
  "fromUser": "Von (intern)",
  "toUser": "An (intern)",
  "attachments": "Anhänge",
  "noEntries": "Noch keine Korrespondenzeinträge vorhanden.",
  "deleteTitle": "Eintrag löschen",
  "deleteDescription": "Möchten Sie den Korrespondenzeintrag \"{subject}\" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.",
  "confirm": "Bestätigen",
  "cancel": "Abbrechen",
  "save": "Speichern",
  "create": "Anlegen",
  "close": "Schließen",
  "actions": "Aktionen",
  "view": "Anzeigen",
  "edit": "Bearbeiten",
  "delete": "Löschen",
  "basicData": "Grunddaten",
  "participants": "Beteiligte",
  "contentSection": "Inhalt",
  "selectContact": "Kontakt auswählen…",
  "noContact": "Kein Kontakt"
}
```

**File to modify:** `messages/en.json`

Add matching English translations:

```json
"crmCorrespondence": {
  "title": "Correspondence",
  "newEntry": "New Entry",
  "createTitle": "Create Correspondence Entry",
  "editTitle": "Edit Correspondence Entry",
  "detailTitle": "Correspondence Details",
  "searchPlaceholder": "Search subject or content…",
  "direction": "Direction",
  "directionAll": "All Directions",
  "directionIncoming": "Incoming",
  "directionOutgoing": "Outgoing",
  "directionInternal": "Internal",
  "type": "Type",
  "typeAll": "All Types",
  "typePhone": "Phone",
  "typeEmail": "Email",
  "typeLetter": "Letter",
  "typeFax": "Fax",
  "typeVisit": "Visit",
  "date": "Date",
  "dateFrom": "From",
  "dateTo": "To",
  "subject": "Subject",
  "content": "Content",
  "contact": "Contact",
  "fromUser": "From (internal)",
  "toUser": "To (internal)",
  "attachments": "Attachments",
  "noEntries": "No correspondence entries yet.",
  "deleteTitle": "Delete Entry",
  "deleteDescription": "Are you sure you want to delete the correspondence entry \"{subject}\"? This action cannot be undone.",
  "confirm": "Confirm",
  "cancel": "Cancel",
  "save": "Save",
  "create": "Create",
  "close": "Close",
  "actions": "Actions",
  "view": "View",
  "edit": "Edit",
  "delete": "Delete",
  "basicData": "Basic Data",
  "participants": "Participants",
  "contentSection": "Content",
  "selectContact": "Select contact…",
  "noContact": "No contact"
}
```

### 8C. Update Address Detail Page Tab Reference in Handbook (placeholder reference)

The existing handbook line 4205 says:
> **Tab "Korrespondenz":** Platzhalter — "In Vorbereitung — CRM_02"

This will be updated in Phase 9 (handbook update) to reference the new section 12.5.

### Verification

- [ ] Address detail page shows CorrespondenceList in the Korrespondenz tab
- [ ] No TypeScript errors
- [ ] German and English translations render correctly
- [ ] The "In Vorbereitung" placeholder is gone

### Dependencies

- Phase 7 (UI components must exist)

---

## Phase 9: Handbook Update (TERP_HANDBUCH.md)

### File to modify: `docs/TERP_HANDBUCH.md`

The handbook currently has sections 12.1 through 12.5 for CRM. The new correspondence section must be inserted as a new subsection. The numbering must be adjusted:

**Current structure:**
- 12.1 Adressen verwalten
- 12.2 Kontaktpersonen
- 12.3 Bankverbindungen
- 12.4 Nummernkreise
- 12.5 Praxisbeispiel: Neuen Kunden mit Kontakten und Bankverbindung anlegen

**New structure:**
- 12.1 Adressen verwalten
- 12.2 Kontaktpersonen
- 12.3 Bankverbindungen
- 12.4 Nummernkreise
- **12.5 Korrespondenz** (NEW)
- **12.6 Praxisbeispiel: Korrespondenz protokollieren** (NEW)
- 12.7 Praxisbeispiel: Neuen Kunden mit Kontakten und Bankverbindung anlegen (renumbered from 12.5)

### 9A. Update Table of Contents

In the table of contents (lines 34-39), add the new entries and renumber:

```markdown
12. [CRM — Kunden- und Lieferantenverwaltung](#12-crm--kunden--und-lieferantenverwaltung)
    - [12.1 Adressen verwalten](#121-adressen-verwalten)
    - [12.2 Kontaktpersonen](#122-kontaktpersonen)
    - [12.3 Bankverbindungen](#123-bankverbindungen)
    - [12.4 Nummernkreise](#124-nummernkreise)
    - [12.5 Korrespondenz](#125-korrespondenz)
    - [12.6 Praxisbeispiel: Korrespondenz protokollieren](#126-praxisbeispiel-korrespondenz-protokollieren)
    - [12.7 Praxisbeispiel: Neuen Kunden mit Kontakten und Bankverbindung anlegen](#127-praxisbeispiel-neuen-kunden-mit-kontakten-und-bankverbindung-anlegen)
```

### 9B. Update Address Detail Tabs Reference

On line 4205, change:
```
**Tab „Korrespondenz":** Platzhalter — „In Vorbereitung — CRM_02"
```
To:
```
**Tab „Korrespondenz":** → Abschnitt 12.5
```

### 9C. Insert New Section 12.5 Korrespondenz

Insert after the "12.4 Nummernkreise" section (after line 4325), before the current practice example. The new section should follow the documentation style of 12.2 (Kontaktpersonen) and 12.3 (Bankverbindungen):

```markdown
---

### 12.5 Korrespondenz

**Was ist es?** Korrespondenz ist das Kommunikationsprotokoll einer CRM-Adresse. Jeder Telefonanruf, jede E-Mail, jeder Brief, jedes Fax und jeder Besuch wird als Eintrag mit Datum, Richtung (eingehend/ausgehend/intern), Typ und Betreff erfasst. Optional kann ein Kontaktpartner aus der Adresse verknüpft werden.

**Wozu dient es?** Die lückenlose Dokumentation aller Kommunikationsvorgänge mit Kunden und Lieferanten ist eine Grundvoraussetzung für professionelles CRM. Alle Mitarbeiter sehen auf einen Blick, wann zuletzt mit einem Kunden kommuniziert wurde, welche Themen besprochen wurden und wer der Ansprechpartner war.

⚠️ Berechtigung: „CRM-Korrespondenz anzeigen" (Lesen), „CRM-Korrespondenz erstellen/bearbeiten/löschen" (Schreiben)

📍 Adressdetailseite → Tab **„Korrespondenz"**

✅ Tabelle aller Korrespondenzeinträge dieser Adresse, sortiert nach Datum (neueste zuerst)

Tabelle mit Spalten:

| Spalte | Beschreibung |
|--------|-------------|
| **Datum** | Datum des Kommunikationsvorgangs |
| **Richtung** | Icon + Text: Eingehend (↙), Ausgehend (↗), Intern (↔) |
| **Typ** | Badge mit Icon: Telefon, E-Mail, Brief, Fax, Besuch |
| **Betreff** | Betreffzeile des Eintrags |
| **Kontakt** | Verknüpfte Kontaktperson (falls vorhanden) |
| **Aktionen** | ⋯-Menü: Anzeigen, Bearbeiten, Löschen |

**Filter:**
- **Suchfeld**: Durchsucht Betreff und Inhalt gleichzeitig (Volltextsuche, Groß-/Kleinschreibung egal)
- **Richtung-Filter**: Alle / Eingehend / Ausgehend / Intern
- **Typ-Filter**: Alle / Telefon / E-Mail / Brief / Fax / Besuch
- **Datumsbereich**: Von-Datum und Bis-Datum (optional)

##### Neuen Korrespondenzeintrag anlegen

1. 📍 Tab „Korrespondenz" → **„Neuer Eintrag"** (oben rechts)
2. ✅ Seitliches Formular (Sheet) öffnet sich: „Neuen Korrespondenzeintrag anlegen"
3. Abschnitt **Grunddaten** ausfüllen:
   - **Richtung** (Eingehend / Ausgehend / Intern) — Pflicht
   - **Typ** (Dropdown: Telefon / E-Mail / Brief / Fax / Besuch) — Pflicht
   - **Datum** (Standard: heute) — Pflicht
4. Abschnitt **Beteiligte** ausfüllen:
   - **Kontakt** (Dropdown: Kontaktpersonen dieser Adresse, optional)
   - **Von (intern)** (Freitext, optional — z. B. interner Absender)
   - **An (intern)** (Freitext, optional — z. B. interner Empfänger)
5. Abschnitt **Inhalt** ausfüllen:
   - **Betreff** (Pflicht)
   - **Inhalt** (Freitext, optional — Gesprächsnotizen, E-Mail-Text etc.)
6. 📍 „Anlegen"
7. ✅ Eintrag erscheint in der Tabelle, sortiert nach Datum

##### Korrespondenzeintrag anzeigen

1. 📍 ⋯-Menü des Eintrags → **„Anzeigen"**
2. ✅ Dialog zeigt alle Details: Betreff, Richtung, Typ, Datum, Kontakt, Von/An, Inhalt, Anhänge

##### Korrespondenzeintrag bearbeiten

1. 📍 ⋯-Menü des Eintrags → **„Bearbeiten"**
2. ✅ Formular öffnet sich mit den aktuellen Werten vorausgefüllt
3. Gewünschte Felder ändern
4. 📍 „Speichern"

##### Korrespondenzeintrag löschen

1. 📍 ⋯-Menü des Eintrags → **„Löschen"**
2. ✅ Bestätigungsdialog: „Möchten Sie den Korrespondenzeintrag ‚{Betreff}' wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden."
3. 📍 „Bestätigen"
4. ✅ Eintrag wird unwiderruflich gelöscht

💡 **Hinweis:** Korrespondenzeinträge werden hart gelöscht (kein Soft-Delete), da es sich um ein Kommunikationsprotokoll handelt. Beim Löschen einer übergeordneten Adresse werden alle zugehörigen Korrespondenzeinträge automatisch mit gelöscht (Kaskade).

💡 **Hinweis:** Die Verknüpfung mit Anfragen (Vorgänge) wird in CRM_03 implementiert. Das Feld „Anfrage" ist im Datenmodell bereits vorbereitet, aber in der Oberfläche noch nicht sichtbar.
```

### 9D. Insert New Section 12.6 Practice Example

```markdown
---

### 12.6 Praxisbeispiel: Korrespondenz protokollieren

Szenario: Bei der Adresse „Müller Maschinenbau GmbH" (aus dem Praxisbeispiel 12.7) soll ein Telefonat mit der Einkaufsleiterin Claudia Berger protokolliert werden. Anschließend wird eine ausgehende E-Mail-Bestätigung erfasst.

##### Schritt 1 — Telefonat protokollieren

📍 CRM → Adressen → „Müller Maschinenbau GmbH" → Tab **„Korrespondenz"** → **„Neuer Eintrag"**

- Richtung: **Eingehend**
- Typ: **Telefon**
- Datum: (heute)
- Kontakt: **Claudia Berger** (aus Dropdown)
- Betreff: `Anfrage zu Lieferzeiten Bauteil X-500`
- Inhalt: `Frau Berger erkundigt sich nach Lieferzeiten für 50 Stück Bauteil X-500. Liefertermin voraussichtlich KW 14. Angebot wird per E-Mail nachgereicht.`

📍 „Anlegen"

✅ Eintrag erscheint in der Tabelle: Datum = heute, Richtung = Eingehend (↙), Typ = Telefon, Betreff = „Anfrage zu Lieferzeiten Bauteil X-500", Kontakt = Claudia Berger.

##### Schritt 2 — Ausgehende E-Mail protokollieren

📍 Tab „Korrespondenz" → **„Neuer Eintrag"**

- Richtung: **Ausgehend**
- Typ: **E-Mail**
- Datum: (heute)
- Kontakt: **Claudia Berger**
- Von (intern): `Max Mustermann`
- Betreff: `Angebot Bauteil X-500 — 50 Stück`
- Inhalt: `Angebot Nr. A-2026-042 per E-Mail an c.berger@mueller-maschinenbau.de versendet. Liefertermin KW 14, Preis gemäß Rahmenvertrag.`

📍 „Anlegen"

✅ Zwei Einträge in der Korrespondenzliste. Der neueste (E-Mail, ausgehend) steht oben.

##### Schritt 3 — Suche und Filter testen

📍 Suchfeld: `Bauteil X-500`

✅ Beide Einträge werden gefunden (Betreff enthält den Suchbegriff).

📍 Richtung-Filter: **Ausgehend**

✅ Nur der E-Mail-Eintrag wird angezeigt.

📍 Filter zurücksetzen.
```

### 9E. Renumber Existing Section 12.5 to 12.7

Change the heading of the existing practice example:
- `### 12.5 Praxisbeispiel:` becomes `### 12.7 Praxisbeispiel:`

Also update any internal cross-references from "12.5" to "12.7" if present.

### 9F. Update Glossary

Add a new glossary entry in section 13 (alphabetical position):

```markdown
| **Korrespondenz (CRM)** | Kommunikationsprotokoll einer CRM-Adresse (Telefonate, E-Mails, Briefe, Besuche) | 📍 CRM → Adressen → Detail → Tab Korrespondenz |
```

### 9G. Update "Wo Adressen außerdem erscheinen" Table

Update the row for "Korrespondenz" in the table near line 4411:

Change:
```
| Korrespondenz (geplant) | 📍 CRM → Adressen → Detail → Tab „Korrespondenz" | Briefe, E-Mails zu dieser Adresse |
```
To:
```
| Korrespondenz | 📍 CRM → Adressen → Detail → Tab „Korrespondenz" | Telefonate, E-Mails, Briefe, Faxe, Besuche zu dieser Adresse (→ 12.5) |
```

### Verification

- [ ] Table of contents includes 12.5 and 12.6, old 12.5 renumbered to 12.7
- [ ] Tab reference in 12.1 Adressdetails points to "→ Abschnitt 12.5"
- [ ] New section follows the style of 12.2 and 12.3 (Was ist es?, Wozu dient es?, table, CRUD steps)
- [ ] Practice example follows the style of 12.5 (step-by-step with emojis)
- [ ] Glossary entry added
- [ ] "Wo Adressen erscheinen" table updated

### Dependencies

- Phase 8 (integration must be done so the handbook describes the actual UI)

---

## Phase 10: Unit / Integration Tests

### 10A. Service Tests

**File to create:** `src/lib/services/__tests__/crm-correspondence-service.test.ts`

**Pattern:** Since CRM_01 has no service-level tests (only router tests), follow the general Vitest pattern with mocked Prisma.

**Test cases:**

```ts
describe("crm-correspondence-service", () => {
  describe("create", () => {
    it("creates entry linked to address and contact", async () => {
      // Mock: crmAddress.findFirst returns valid address
      // Mock: crmContact.findFirst returns valid contact
      // Mock: crmCorrespondence.create returns created record
      // Assert: repo.create called with correct data
    })

    it("rejects if addressId belongs to different tenant", async () => {
      // Mock: crmAddress.findFirst returns null
      // Assert: throws CrmCorrespondenceValidationError
    })

    it("rejects if contactId does not belong to addressId", async () => {
      // Mock: crmAddress.findFirst returns valid address
      // Mock: crmContact.findFirst returns null
      // Assert: throws CrmCorrespondenceValidationError
    })

    it("creates entry without optional contactId", async () => {
      // Mock: crmAddress.findFirst returns valid address
      // No contactId provided
      // Assert: creates successfully
    })
  })

  describe("getById", () => {
    it("returns entry when found", async () => { ... })
    it("throws CrmCorrespondenceNotFoundError when not found", async () => { ... })
  })

  describe("remove", () => {
    it("removes entry successfully", async () => { ... })
    it("throws CrmCorrespondenceNotFoundError when entry does not exist", async () => { ... })
  })
})
```

### 10B. Router Tests

**File to create:** `src/trpc/routers/__tests__/crmCorrespondence-router.test.ts`

**Pattern:** Follow `crmAddresses-router.test.ts` exactly (use `createMockContext`, `createCallerFactory`, module mock, permission mock).

**Required mocks:**

```ts
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
    },
  },
}))
```

**Test cases:**

```ts
describe("crm.correspondence", () => {
  describe("list", () => {
    it("returns paginated list", async () => { ... })
    it("requires crm_correspondence.view permission", async () => { ... })
    it("requires CRM module enabled", async () => { ... })
    it("filters by direction", async () => { ... })
    it("filters by type", async () => { ... })
    it("searches by subject substring (case-insensitive)", async () => { ... })
    it("filters by date range", async () => { ... })
  })

  describe("getById", () => {
    it("returns single entry with contact details", async () => { ... })
    it("throws NOT_FOUND for missing entry", async () => { ... })
  })

  describe("create", () => {
    it("creates entry with all fields", async () => { ... })
    it("requires crm_correspondence.create permission", async () => { ... })
    it("validates addressId belongs to tenant", async () => { ... })
  })

  describe("update", () => {
    it("updates existing entry", async () => { ... })
    it("requires crm_correspondence.edit permission", async () => { ... })
  })

  describe("delete", () => {
    it("deletes entry and returns success", async () => { ... })
    it("requires crm_correspondence.delete permission", async () => { ... })
  })
})
```

### Verification

- [ ] `pnpm vitest run src/lib/services/__tests__/crm-correspondence-service.test.ts` passes
- [ ] `pnpm vitest run src/trpc/routers/__tests__/crmCorrespondence-router.test.ts` passes
- [ ] Permission rejection tests pass
- [ ] Module guard rejection test passes
- [ ] All service validation paths are tested

### Dependencies

- Phase 5 (router must exist for router tests)
- Phase 4 (service must exist for service tests)

---

## Phase 11: E2E Browser Tests (Playwright)

### 11A. Update Global Cleanup

**File to modify:** `src/e2e-browser/global-setup.ts`

Add correspondence cleanup SQL **before** the CRM address deletion (since correspondences have FK to addresses):

```sql
-- CRM correspondence records (spec 21)
DELETE FROM crm_correspondences WHERE address_id IN (SELECT id FROM crm_addresses WHERE company LIKE 'E2E%');
```

Insert this line right before:
```sql
DELETE FROM crm_contacts WHERE address_id IN (SELECT id FROM crm_addresses WHERE company LIKE 'E2E%');
```

### 11B. Create E2E Test Spec

**File to create:** `src/e2e-browser/21-crm-correspondence.spec.ts`

**Pattern:** Follow `20-crm-addresses.spec.ts` exactly (imports, serial describe, helper usage).

**Prerequisites:** The CRM module must be enabled and at least one address with a contact must exist. The spec can rely on data created by spec 20 (serial execution), or create its own address at the start.

**Constants:**

```ts
const COMPANY = "E2E Korr GmbH"
const CONTACT_FIRST = "E2E Anna"
const CONTACT_LAST = "E2E Schmidt"
const SUBJECT_PHONE = "E2E Telefongespräch Liefertermin"
const SUBJECT_EMAIL = "E2E Auftragsbestätigung per E-Mail"
```

**Test cases:**

```ts
test.describe.serial("UC-CRM-02: Correspondence", () => {
  test("create address with contact for correspondence tests", async ({ page }) => {
    // Navigate to CRM addresses
    // Create a new address "E2E Korr GmbH"
    // Navigate to address detail
    // Create a contact (E2E Anna E2E Schmidt)
  })

  test("log a phone call (incoming)", async ({ page }) => {
    // Navigate to address detail → Tab "Korrespondenz"
    // Click "Neuer Eintrag"
    // Fill: direction=Eingehend, type=Telefon, date=today
    // Select contact: E2E Anna E2E Schmidt
    // Fill subject + content
    // Submit → verify entry appears in list
  })

  test("log an outgoing email", async ({ page }) => {
    // Click "Neuer Eintrag"
    // Fill: direction=Ausgehend, type=E-Mail
    // Fill subject + content
    // Submit → verify entry appears in list
  })

  test("search correspondence by subject", async ({ page }) => {
    // Type subject keyword in search field
    // Verify filtered results
  })

  test("filter by direction", async ({ page }) => {
    // Select "Eingehend" in direction filter
    // Verify only incoming entry shown
    // Clear filter
  })

  test("view correspondence detail", async ({ page }) => {
    // Open ⋯ menu → "Anzeigen"
    // Verify detail dialog shows all fields
    // Close dialog
  })

  test("edit correspondence entry", async ({ page }) => {
    // Open ⋯ menu → "Bearbeiten"
    // Modify subject
    // Submit → verify updated in list
  })

  test("delete correspondence entry", async ({ page }) => {
    // Open ⋯ menu → "Löschen"
    // Confirm deletion
    // Verify entry removed from list
  })
})
```

### Verification

- [ ] `pnpm playwright test src/e2e-browser/21-crm-correspondence.spec.ts` passes
- [ ] Global cleanup deletes E2E correspondence records
- [ ] Tests are idempotent (can run repeatedly)
- [ ] Tests use serial execution order
- [ ] All CRUD operations verified via UI

### Dependencies

- Phase 8 (UI must be integrated into address detail page)
- Phase 11A (cleanup must be updated first)

---

## File Summary

### New Files (12)

| # | File | Phase |
|---|------|-------|
| 1 | `supabase/migrations/20260101000096_create_crm_correspondences.sql` | 1 |
| 2 | `src/lib/services/crm-correspondence-repository.ts` | 3 |
| 3 | `src/lib/services/crm-correspondence-service.ts` | 4 |
| 4 | `src/trpc/routers/crm/correspondence.ts` | 5 |
| 5 | `src/hooks/use-crm-correspondence.ts` | 6 |
| 6 | `src/components/crm/correspondence-type-badge.tsx` | 7 |
| 7 | `src/components/crm/correspondence-list.tsx` | 7 |
| 8 | `src/components/crm/correspondence-form-sheet.tsx` | 7 |
| 9 | `src/components/crm/correspondence-detail-dialog.tsx` | 7 |
| 10 | `src/lib/services/__tests__/crm-correspondence-service.test.ts` | 10 |
| 11 | `src/trpc/routers/__tests__/crmCorrespondence-router.test.ts` | 10 |
| 12 | `src/e2e-browser/21-crm-correspondence.spec.ts` | 11 |

### Modified Files (8)

| # | File | Phase | Change |
|---|------|-------|--------|
| 1 | `prisma/schema.prisma` | 1 | Add enum, model, reverse relations |
| 2 | `src/lib/auth/permission-catalog.ts` | 2 | Add 4 permission entries |
| 3 | `src/trpc/routers/crm/index.ts` | 5 | Add correspondence sub-router |
| 4 | `src/hooks/index.ts` | 6 | Add barrel exports |
| 5 | `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx` | 8 | Replace placeholder tab |
| 6 | `messages/de.json` | 8 | Add crmCorrespondence translations |
| 7 | `messages/en.json` | 8 | Add crmCorrespondence translations |
| 8 | `docs/TERP_HANDBUCH.md` | 9 | Add section 12.5, 12.6, renumber 12.5→12.7, update ToC/glossary/references |
| 9 | `src/e2e-browser/global-setup.ts` | 11 | Add correspondence cleanup SQL |

---

## Execution Order & Dependencies Graph

```
Phase 1 (Schema + Migration)
    ↓
Phase 2 (Permissions)     ← independent of Phase 1, but logically after
    ↓
Phase 3 (Repository)      ← depends on Phase 1
    ↓
Phase 4 (Service)         ← depends on Phase 3
    ↓
Phase 5 (Router + Wire)   ← depends on Phase 2 + Phase 4
    ↓
Phase 6 (Hooks)           ← depends on Phase 5
    ↓
Phase 7 (UI Components)   ← depends on Phase 6
    ↓
Phase 8 (Integration + i18n) ← depends on Phase 7
    ↓
Phase 9 (Handbook)        ← depends on Phase 8
    ↓
Phase 10 (Unit Tests)     ← depends on Phase 4 + Phase 5
    ↓
Phase 11 (E2E Tests)      ← depends on Phase 8 + Phase 11A
```

**Note:** Phases 10 and 11 can be developed in parallel with phases 7-9 since they test the backend (which is complete after Phase 5). However, E2E tests require the full UI integration (Phase 8).

---

## Final Verification Checklist

After all phases are complete:

- [ ] `pnpm db:generate` succeeds
- [ ] `pnpm typecheck` passes (no new errors)
- [ ] `pnpm lint` passes
- [ ] `pnpm vitest run src/lib/services/__tests__/crm-correspondence-service.test.ts` passes
- [ ] `pnpm vitest run src/trpc/routers/__tests__/crmCorrespondence-router.test.ts` passes
- [ ] `pnpm playwright test src/e2e-browser/21-crm-correspondence.spec.ts` passes
- [ ] Address detail page → Korrespondenz tab shows list (no placeholder)
- [ ] Create, read, update, delete all work through the UI
- [ ] Search, direction filter, type filter, date range filter all work
- [ ] Permission gates enforced (test without permission → access denied)
- [ ] Module guard enforced (CRM module disabled → forbidden)
- [ ] Cross-tenant isolation: entries from tenant A not visible to tenant B
- [ ] Handbook section 12.5 documents the feature completely
- [ ] Handbook practice example 12.6 walks through a realistic scenario
- [ ] German and English translations complete
