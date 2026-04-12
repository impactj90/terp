# Billing Document Editor (WYSIWYG-Feel) — Implementation Plan

## Overview

Replace the current tab-based billing document detail view with a WYSIWYG A4 document editor. Users should feel like they're editing a real document — not filling out a web form. The existing structured components (position table, totals, autocomplete) are preserved and embedded into the new layout. New free-text areas (header text, footer text) are editable inline via Tiptap. A tenant-level Briefpapier (letterhead) configuration provides the Fußzeile (company footer) shown on every document. Text templates enable reusable content per document type. PDF export via `@react-pdf/renderer` generates documents server-side from the same data.

**Trigger**: Kundenfeedback Pro-Di GmbH (19.03.2026)

## Current State Analysis

### What exists
- **Single `BillingDocument` model** for all 7 document types (OFFER → CREDIT_NOTE), with `notes` and `internalNotes` as only free-text fields
- **`BillingDocumentPosition`** with 5 position types (ARTICLE, FREE, TEXT, PAGE_BREAK, SUBTOTAL), inline blur-commit editing
- **32 UI components** in `src/components/billing/`, tab-based detail view (Overview | Positions | Chain)
- **Complete CRUD + workflow** (finalize, forward, cancel, duplicate) with document chain (Belegkette)
- **PDF stub** in `billing-document-pdf-service.ts` — returns `null`, no library installed
- **Recurring invoice `positionTemplate`** (JSONB) — the only template concept

### What's missing
- No `headerText`/`footerText` fields on documents
- No document template model (reusable text blocks)
- No tenant letterhead/Briefpapier config (logo, bank, Fußzeile)
- No A4 document layout component
- No rich text editing
- No PDF generation pipeline
- No file upload infrastructure (for logo)

### Key Discoveries
- `forward()` at `billing-document-service.ts:379` copies all header fields + positions — must include new text fields
- `duplicate()` at `billing-document-service.ts:497` same pattern — must include new text fields
- Tenant has `settings: Json?` but it's unused for billing
- No Supabase Storage usage anywhere — logo upload is greenfield
- `document-detail.tsx` is 328 lines, will be replaced entirely

## Desired End State

A billing document detail page that:
1. Renders as a DIN-A4 paper (white, margins, shadow) with the document content laid out like a real business letter
2. Shows tenant letterhead (logo, company address) at top and Fußzeile (bank, legal) at bottom — from tenant config
3. Has inline-editable rich text areas (Tiptap, bold/italic) for header text (above positions) and footer text (below positions)
4. Embeds existing `DocumentPositionTable` and `DocumentTotalsSummary` in the document flow
5. Shows Belegkette (document chain) in a collapsible sidebar panel beside the A4 page
6. Can load text templates per document type when creating/editing
7. Generates PDFs via @react-pdf/renderer server-side on finalization, stored in Supabase Storage

### Verification
- Create an OFFER, add header text (bold formatting), positions, footer text → PDF matches screen
- Forward OFFER to ORDER_CONFIRMATION → header/footer text copied
- Change tenant Briefpapier → all documents show updated Fußzeile
- Save text as template → new document of same type auto-loads it

## What We're NOT Doing

- No replacement of existing position components (table, autocomplete, calculation)
- No full rich-text formatting (no tables, images, colors in free text — only bold/italic)
- No real-time collaboration / multi-user editing
- No version history / change tracking
- No drag & drop for positions (backend `reorder` exists, frontend DnD deferred)
- No custom fonts or full layout editor (fixed DIN 5008-inspired layout)

## Implementation Approach

5 phases, each independently testable. Phase 1 lays the data foundation. Phase 2 is the core UX change. Phases 3-5 add editing, templates, and PDF.

---

## Phase 1: Database Schema + Backend Services

### Overview
Add `headerText`/`footerText` to `BillingDocument`, create `BillingDocumentTemplate` model for reusable text blocks, create `BillingTenantConfig` model for letterhead/Briefpapier settings. Wire up services, repositories, tRPC routers, and hooks.

### Changes Required

#### 1. Supabase Migration

**File**: `supabase/migrations/<next>_billing_document_editor.sql`

```sql
-- 1. Add free-text fields to billing_documents
ALTER TABLE billing_documents ADD COLUMN header_text TEXT;
ALTER TABLE billing_documents ADD COLUMN footer_text TEXT;
ALTER TABLE billing_documents ADD COLUMN pdf_url TEXT;

-- 2. Document text templates (reusable header/footer per type)
CREATE TABLE billing_document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  document_type billing_document_type,
  header_text TEXT,
  footer_text TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_billing_doc_templates_tenant
  ON billing_document_templates(tenant_id);
CREATE INDEX idx_billing_doc_templates_tenant_type
  ON billing_document_templates(tenant_id, document_type);
CREATE UNIQUE INDEX idx_billing_doc_templates_default
  ON billing_document_templates(tenant_id, document_type)
  WHERE is_default = true;

-- 3. Tenant billing/letterhead configuration (Briefpapier)
CREATE TABLE billing_tenant_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  company_name VARCHAR(255),
  company_address TEXT,
  logo_url TEXT,
  bank_name VARCHAR(255),
  iban VARCHAR(34),
  bic VARCHAR(11),
  tax_id VARCHAR(50),
  commercial_register VARCHAR(255),
  managing_director VARCHAR(255),
  footer_html TEXT,
  phone VARCHAR(50),
  email VARCHAR(255),
  website VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Supabase Storage buckets (run via Supabase Dashboard or supabase/config.toml)
-- Bucket: "documents" — stores generated PDFs
--   Path convention: {documentType}/{tenantId}_{documentId}.pdf
--   documentType in lowercase German: angebot, auftragsbestaetigung, lieferschein,
--     serviceschein, ruecklieferschein, rechnung, gutschrift
--   Access: authenticated users with tenant check (RLS policy)
-- Bucket: "tenant-logos" — stores tenant logos (from Phase 4)
--   Path convention: {tenantId}/logo.{ext}
```

#### 2. Prisma Schema

**File**: `prisma/schema.prisma`

Add to `BillingDocument` model (after `internalNotes`):
```prisma
  headerText            String?                @map("header_text")
  footerText            String?                @map("footer_text")
  pdfUrl                String?                @map("pdf_url")
```

Add new models:
```prisma
model BillingDocumentTemplate {
  id           String               @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String               @map("tenant_id") @db.Uuid
  name         String               @db.VarChar(255)
  documentType BillingDocumentType? @map("document_type")
  headerText   String?              @map("header_text")
  footerText   String?              @map("footer_text")
  isDefault    Boolean              @default(false) @map("is_default")
  createdAt    DateTime             @default(now()) @map("created_at") @db.Timestamptz
  updatedAt    DateTime             @updatedAt @map("updated_at") @db.Timestamptz
  createdById  String?              @map("created_by_id") @db.Uuid

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([tenantId, documentType])
  @@map("billing_document_templates")
}

model BillingTenantConfig {
  id                 String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId           String   @unique @map("tenant_id") @db.Uuid
  companyName        String?  @map("company_name") @db.VarChar(255)
  companyAddress     String?  @map("company_address")
  logoUrl            String?  @map("logo_url")
  bankName           String?  @map("bank_name") @db.VarChar(255)
  iban               String?  @db.VarChar(34)
  bic                String?  @db.VarChar(11)
  taxId              String?  @map("tax_id") @db.VarChar(50)
  commercialRegister String?  @map("commercial_register") @db.VarChar(255)
  managingDirector   String?  @map("managing_director") @db.VarChar(255)
  footerHtml         String?  @map("footer_html")
  phone              String?  @db.VarChar(50)
  email              String?  @db.VarChar(255)
  website            String?  @db.VarChar(255)
  createdAt          DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt          DateTime @updatedAt @map("updated_at") @db.Timestamptz

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@map("billing_tenant_configs")
}
```

Add relations to `Tenant` model:
```prisma
  billingDocumentTemplates BillingDocumentTemplate[]
  billingTenantConfig      BillingTenantConfig?
```

#### 3. Billing Document Service Updates

**File**: `src/lib/services/billing-document-service.ts`

Update `forward()` (~line 430) to copy new fields:
```typescript
// In the repo.create call, add:
headerText: existing.headerText,
footerText: existing.footerText,
```

Update `duplicate()` (~line 530) identically:
```typescript
headerText: existing.headerText,
footerText: existing.footerText,
```

Update the `create` and `update` input validation in the router to accept `headerText` and `footerText`.

#### 4. New Service: Billing Document Template

**File**: `src/lib/services/billing-document-template-service.ts`
**File**: `src/lib/services/billing-document-template-repository.ts`

Standard CRUD pattern (list, getById, create, update, delete) following existing service+repo pattern. Additional methods:
- `listByType(tenantId, documentType)` — returns templates for a specific type + generic templates (type = null)
- `getDefault(tenantId, documentType)` — returns the default template for a type, or null

#### 5. New Service: Billing Tenant Config

**File**: `src/lib/services/billing-tenant-config-service.ts`
**File**: `src/lib/services/billing-tenant-config-repository.ts`

Minimal service (get, upsert pattern since it's 1:1 with tenant):
- `get(tenantId)` — returns config or null
- `upsert(tenantId, data)` — creates or updates

#### 6. tRPC Routers

**File**: `src/trpc/routers/billing/documentTemplates.ts`

```typescript
// Procedures:
// Queries: list, getById, listByType, getDefault
// Mutations: create, update, delete, setDefault
```

**File**: `src/trpc/routers/billing/tenantConfig.ts`

```typescript
// Procedures:
// Queries: get
// Mutations: upsert
```

Register in `src/trpc/routers/billing/index.ts`.

Update `src/trpc/routers/billing/documents.ts`:
- `create` mutation: accept optional `headerText`, `footerText`, `templateId`
- `update` mutation: accept optional `headerText`, `footerText`
- `getById` query: include `headerText`, `footerText` in response (already included if schema field exists)

#### 7. React Hooks

**File**: `src/hooks/use-billing-document-templates.ts`

```typescript
export function useBillingDocumentTemplates()
export function useBillingDocumentTemplatesByType(type: BillingDocumentType)
export function useDefaultBillingDocumentTemplate(type: BillingDocumentType)
export function useCreateBillingDocumentTemplate()
export function useUpdateBillingDocumentTemplate()
export function useDeleteBillingDocumentTemplate()
```

**File**: `src/hooks/use-billing-tenant-config.ts`

```typescript
export function useBillingTenantConfig()
export function useUpsertBillingTenantConfig()
```

### Success Criteria

#### Automated Verification:
- [x] Migration applies cleanly: `pnpm db:reset`
- [x] Prisma client generates: `pnpm db:generate`
- [x] Type checking passes: `pnpm typecheck` (1 pre-existing error in recurring-detail.tsx, 0 new errors)
- [x] Existing billing tests pass: `pnpm vitest run src/trpc/routers/__tests__/billingDocuments-router.test.ts` (22 tests)
- [x] New template CRUD tests pass (13 tests)
- [x] New tenant config tests pass (7 tests)
- [x] Forward/duplicate copy headerText+footerText (unit test)

#### Manual Verification:
- [ ] `billing.documents.create` accepts `headerText`/`footerText`
- [ ] `billing.documents.update` persists `headerText`/`footerText`
- [ ] `billing.documentTemplates.list` returns templates
- [ ] `billing.tenantConfig.get` / `upsert` works

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: A4 Document Layout Shell

### Overview
Replace `document-detail.tsx` with a new WYSIWYG document editor that renders the billing document as a DIN-A4 page. The existing `DocumentPositionTable` and `DocumentTotalsSummary` are embedded inside the A4 layout. The Belegkette (document chain) moves to a collapsible sidebar beside the A4 page. All existing action buttons (finalize, forward, cancel, duplicate) remain.

### Changes Required

#### 1. New Component: Document Editor

**File**: `src/components/billing/document-editor.tsx`

This is the main component, replacing `document-detail.tsx` on the detail page.

**Layout structure (DIN 5008-inspired)**:
```
┌─ Toolbar ────────────────────────────────────────────────────────┐
│  [Back] Beleg RE-2026-001 [RECHNUNG] [ENTWURF]   [Actions...] │
└──────────────────────────────────────────────────────────────────┘

┌─ Main Content ──────────────────────┐  ┌─ Sidebar ──────────┐
│  ┌─ A4 Page ─────────────────────┐  │  │  Belegkette        │
│  │                               │  │  │  ├ Erstellt aus:    │
│  │  [Absender-Zeile]             │  │  │  │  AN-2026-001     │
│  │  [Logo ────────────── rechts] │  │  │  └ Folgebelege:     │
│  │                               │  │  │     LS-2026-001     │
│  │  [Empfänger-Adresse]         │  │  │                      │
│  │                               │  │  │  Metadaten          │
│  │  [Beleg-Info Block]           │  │  │  Erstellt: 19.03.   │
│  │  Nr: RE-2026-001              │  │  │  Gedruckt: —        │
│  │  Datum: 19.03.2026            │  │  │                      │
│  │  Lieferdatum: 25.03.2026      │  │  │  Konditionen        │
│  │                               │  │  │  Zahlungsziel: 30T  │
│  │  ┌─ Header Text ──────────┐  │  │  │  Skonto: 2%/10T     │
│  │  │  (Tiptap placeholder)  │  │  │  │                      │
│  │  └────────────────────────┘  │  │  └──────────────────────┘
│  │                               │  │
│  │  ┌─ Positionstabelle ─────┐  │  │
│  │  │  (existing component)  │  │  │
│  │  └────────────────────────┘  │  │
│  │                               │  │
│  │  [Summenblock] ── rechts     │  │
│  │                               │  │
│  │  ┌─ Footer Text ──────────┐  │  │
│  │  │  (Tiptap placeholder)  │  │  │
│  │  └────────────────────────┘  │  │
│  │                               │  │
│  │  ─── Trennlinie ──────────── │  │
│  │  [Fußzeile: Tenant Config]   │  │
│  │                               │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

**CSS for A4 appearance**:
```css
.document-page {
  width: 210mm;
  min-height: 297mm;
  padding: 20mm 25mm 15mm 25mm;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  margin: 0 auto;
  position: relative;
}

/* Surrounding area */
.document-canvas {
  background: hsl(var(--muted) / 0.3);
  padding: 2rem;
  min-height: 100vh;
}
```

**Key implementation details**:
- The A4 page is a single scrollable `div` with fixed width (210mm)
- In Phase 2, header/footer text areas are static (show HTML from DB, no editing yet — Tiptap comes in Phase 3)
- The `DocumentPositionTable` is embedded directly in the page flow (no card wrapper)
- The `DocumentTotalsSummary` is right-aligned below positions
- The Fußzeile section renders `BillingTenantConfig.footerHtml` as static HTML, or a placeholder if not configured
- Tenant letterhead (company name, address, logo) from `BillingTenantConfig` renders at the top

**Sidebar** (right of A4, collapsible):
- Belegkette (chain) — same content as current chain tab
- Metadaten — created/printed dates, created by
- Konditionen — payment terms, discount (moved from current overview tab)
- Bemerkungen — notes, internal notes (existing fields, not on the A4 page itself)

#### 2. Update Detail Page Route

**File**: `src/app/[locale]/(dashboard)/orders/documents/[id]/page.tsx`

Replace `BillingDocumentDetail` import with new `DocumentEditor`.

#### 3. Keep Old Component (Rename)

**File**: `src/components/billing/document-detail-legacy.tsx`

Rename current `document-detail.tsx` → `document-detail-legacy.tsx` temporarily during transition. Delete after Phase 2 is verified.

### Success Criteria

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Build succeeds: `pnpm build` (typecheck passes, no new lint errors)
- [x] No linting errors: `pnpm lint` (0 new errors, 133 pre-existing)

#### Manual Verification:
- [ ] Document detail page renders as A4 paper layout
- [ ] Existing position table works (add, edit, delete positions)
- [ ] Totals summary displays correctly
- [ ] Sidebar shows Belegkette with working links
- [ ] Sidebar shows Konditionen and Bemerkungen
- [ ] Action buttons work (finalize, forward, cancel, duplicate)
- [ ] Immutable notice shows for non-DRAFT documents
- [ ] Responsive: A4 page scrolls horizontally on small screens
- [ ] Tenant letterhead area renders (placeholder if no config)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Tiptap Inline Rich Text Editing

### Overview
Install Tiptap and create a reusable `RichTextEditor` component (bold/italic only). Wire it up for `headerText` (above positions) and `footerText` (below positions) in the document editor. Auto-save on blur following the existing blur-commit pattern.

### Changes Required

#### 1. Install Tiptap

```bash
pnpm add @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder
```

#### 2. Reusable RichTextEditor Component

**File**: `src/components/ui/rich-text-editor.tsx`

```typescript
interface RichTextEditorProps {
  content: string       // HTML string
  onUpdate: (html: string) => void
  placeholder?: string
  editable?: boolean    // false for readonly / immutable documents
  className?: string
}
```

**Features**:
- Tiptap `StarterKit` with only `Bold` and `Italic` enabled (disable heading, lists, code, etc.)
- `Placeholder` extension for empty-state hint text
- Minimal floating toolbar on text selection: **B** | *I* buttons
- `onUpdate` fires on blur (not on every keystroke) — matches existing blur-commit pattern
- When `editable={false}`, renders as static HTML (no cursor, no toolbar)
- Styling: inherits document font, seamless with A4 layout (no visible border in editing mode, subtle focus ring)

#### 3. Wire Into Document Editor

**File**: `src/components/billing/document-editor.tsx`

Replace static header/footer text rendering with `RichTextEditor`:

```tsx
{/* Header Text — above positions */}
<RichTextEditor
  content={doc.headerText ?? ''}
  onUpdate={(html) => updateMutation.mutate({
    id: doc.id,
    headerText: html
  })}
  placeholder="Einleitungstext eingeben..."
  editable={isDraft}
/>

{/* ... Position Table + Totals ... */}

{/* Footer Text — below positions */}
<RichTextEditor
  content={doc.footerText ?? ''}
  onUpdate={(html) => updateMutation.mutate({
    id: doc.id,
    footerText: html
  })}
  placeholder="Schlusstext / Zahlungsbedingungen..."
  editable={isDraft}
/>
```

**Auto-save pattern**: `useUpdateBillingDocument` already exists. On blur, the Tiptap content is saved via the existing `billing.documents.update` mutation. Debounce is not needed since blur fires once.

#### 4. Tiptap Content Sanitization

In the billing document service (`update` method), sanitize the HTML to strip anything beyond bold/italic:
- Allow: `<p>`, `<strong>`, `<em>`, `<br>`
- Strip everything else (prevent XSS from pasted content)
- Use a simple regex-based sanitizer or `sanitize-html` (lightweight, already proven)

Check if `sanitize-html` or similar is already a dependency. If not, add it or use a minimal custom sanitizer since the allowed tags are very limited.

### Success Criteria

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Build succeeds: `pnpm build`
- [x] Tiptap renders without hydration errors

#### Manual Verification:
- [ ] Click into header text area → cursor appears, can type
- [ ] Select text → floating toolbar with B/I buttons appears
- [ ] Bold and italic formatting works
- [ ] Click outside (blur) → text is saved (verify via page reload)
- [ ] Non-DRAFT documents show header/footer as read-only HTML
- [ ] Paste from clipboard strips unsupported formatting
- [ ] Forward document → header/footer text is copied to new document
- [ ] Duplicate document → header/footer text is copied

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Template System + Tenant Briefpapier Config

### Overview
Build the template management UI (save/load reusable header+footer texts per document type) and the tenant Briefpapier configuration UI (logo, company address, bank details, Fußzeile). The Fußzeile from tenant config renders at the bottom of every document.

### Changes Required

#### 4A: Template System UI

##### 1. Template Management Page

**File**: `src/app/[locale]/(dashboard)/orders/templates/page.tsx`

New page under the orders section. Shows all billing document templates for the tenant.

**File**: `src/components/billing/template-list.tsx`

Table with columns: Name, Dokumenttyp (or "Alle"), Standard (checkmark), Actions (edit, delete).

**File**: `src/components/billing/template-form-sheet.tsx`

Sheet (side panel) for creating/editing a template:
- Name (text input)
- Dokumenttyp (select: one of the 7 types, or empty for "Alle Typen")
- Kopftext (Tiptap `RichTextEditor`)
- Schlusstext (Tiptap `RichTextEditor`)
- Als Standard setzen (checkbox)

##### 2. Template Selection in Document Editor

**File**: `src/components/billing/document-editor.tsx`

When document is DRAFT, show a template selector dropdown in the toolbar:
- Lists templates matching the document's type + generic templates (type = null)
- Selecting a template fills `headerText` and `footerText` (with confirmation if fields are non-empty)
- The default template for the document type is auto-applied when creating a new document

##### 3. Auto-Apply Default Template on Document Creation

**File**: `src/lib/services/billing-document-service.ts`

In the `create` method, if no `headerText`/`footerText` provided and no `templateId` specified:
- Look up default template for the document type
- If found, pre-fill `headerText` and `footerText`

#### 4B: Tenant Briefpapier Configuration

##### 1. Settings Page

**File**: `src/app/[locale]/(dashboard)/admin/billing-config/page.tsx`

Admin page for tenant billing/letterhead configuration.

**File**: `src/components/billing/tenant-config-form.tsx`

Form with sections:
- **Unternehmen**: Company name, address (textarea), phone, email, website
- **Logo**: Upload field (Supabase Storage) with preview
- **Bankverbindung**: Bank name, IBAN, BIC
- **Rechtliches**: Tax ID (USt-IdNr.), Commercial register (Handelsregister), Managing director (Geschäftsführer)
- **Fußzeile**: Tiptap `RichTextEditor` for custom footer HTML — OR auto-generate from the fields above with a toggle

##### 2. Logo Upload via Supabase Storage

**File**: `src/lib/services/file-upload-service.ts`

New service for file uploads via Supabase Storage:
```typescript
export async function uploadLogo(
  tenantId: string,
  file: Buffer,
  filename: string
): Promise<string> // returns public URL
```

- Bucket: `tenant-logos` (create via migration or Supabase dashboard)
- Path: `{tenantId}/logo.{ext}`
- Overwrites existing logo for the tenant
- Returns public URL

**File**: `src/trpc/routers/billing/tenantConfig.ts`

Add `uploadLogo` mutation that accepts base64 file data.

##### 3. Fußzeile Rendering in Document Editor

**File**: `src/components/billing/document-editor.tsx`

At the bottom of the A4 page, below the footer text, render a separator line and the Fußzeile:
- If `BillingTenantConfig.footerHtml` exists → render as HTML
- If no footerHtml but other fields exist → auto-generate a standard 3-column footer:
  ```
  [Company Name]          [Bankverbindung]        [Rechtliches]
  [Address]               [IBAN]                  [USt-IdNr.]
  [Phone / Email]         [BIC / Bank]            [HRB / GF]
  ```
- If no config → show placeholder "Briefpapier konfigurieren →" with link to admin page

##### 4. Navigation

Add "Vorlagen" to the orders section navigation.
Add "Briefpapier" to the admin section navigation.

### Success Criteria

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Build succeeds: `pnpm build`
- [x] Template CRUD tests pass (13 tests)
- [x] Tenant config upsert tests pass (7 tests)

#### Manual Verification:
- [ ] Create a template with header+footer text for OFFER type
- [ ] Set template as default for OFFER
- [ ] Create a new OFFER → header/footer auto-filled from default template
- [ ] Select a different template → header/footer replaced (with confirmation)
- [ ] Admin: configure company name, address, bank details
- [ ] Admin: upload logo → appears in document header
- [ ] Admin: Fußzeile renders on all documents
- [ ] Admin: change Fußzeile → existing documents reflect change immediately

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 5.

---

## Phase 5: PDF Export (@react-pdf/renderer + Supabase Storage)

### Overview
Implement PDF generation using `@react-pdf/renderer`, store the generated PDF in Supabase Storage (bucket `documents`), and persist the URL on `BillingDocument.pdfUrl`. The PDF is generated **once** on finalization — subsequent downloads serve the stored file. Re-generation only happens when the document changes (e.g. re-finalize after cancel-and-reopen, or future use cases). The A4 UI on screen remains pure HTML/CSS — the PDF is a separate artifact built from a parallel React-PDF component tree.

### Storage Convention

```
Bucket: "documents"
Path:   {documentType}/{tenantId}_{documentId}.pdf

documentType mapping (BillingDocumentType → lowercase German):
  OFFER               → angebot
  ORDER_CONFIRMATION  → auftragsbestaetigung
  DELIVERY_NOTE       → lieferschein
  SERVICE_NOTE        → serviceschein
  RETURN_DELIVERY     → ruecklieferschein
  INVOICE             → rechnung
  CREDIT_NOTE         → gutschrift

Example: rechnung/abc123_def456.pdf
```

### Changes Required

#### 1. Install @react-pdf/renderer

```bash
pnpm add @react-pdf/renderer
```

#### 2. Supabase Storage Setup

Create the `documents` bucket (public read for authenticated users with tenant-scoped RLS):
- Via `supabase/config.toml` or Supabase Dashboard
- RLS policy: authenticated users can read files where path starts with their tenant ID fragment
- Upload policy: only server-side (service role key) — users never upload directly

#### 3. React-PDF Document Component

**File**: `src/lib/pdf/billing-document-pdf.tsx`

A React-PDF component tree mirroring the A4 HTML layout. Uses `@react-pdf/renderer` primitives (`Document`, `Page`, `View`, `Text`, `Image`, `StyleSheet`).

```tsx
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: {
    paddingTop: '20mm',
    paddingBottom: '15mm',
    paddingHorizontal: '25mm',
    fontFamily: 'Helvetica',
    fontSize: 10,
  },
  senderLine: { fontSize: 7, color: '#666', marginBottom: 4 },
  recipientBlock: { marginBottom: 20 },
  docInfoBlock: { marginBottom: 16 },
  headerText: { marginBottom: 12 },
  positionTable: { marginBottom: 8 },
  footerText: { marginTop: 12, marginBottom: 20 },
  fusszeile: {
    position: 'absolute',
    bottom: '10mm',
    left: '25mm',
    right: '25mm',
    borderTopWidth: 0.5,
    borderTopColor: '#ccc',
    paddingTop: 6,
    fontSize: 7,
    color: '#666',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
})

interface BillingDocumentPdfProps {
  document: BillingDocumentWithPositions
  address: CrmAddress
  tenantConfig: BillingTenantConfig | null
}

export function BillingDocumentPdf({ document, address, tenantConfig }: BillingDocumentPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Absender-Zeile */}
        <Text style={styles.senderLine}>
          {tenantConfig?.companyName} · {tenantConfig?.companyAddress?.replace(/\n/g, ' · ')}
        </Text>

        {/* Logo (top-right) */}
        {tenantConfig?.logoUrl && (
          <Image src={tenantConfig.logoUrl} style={styles.logo} />
        )}

        {/* Empfänger */}
        <View style={styles.recipientBlock}>
          <Text>{address.company}</Text>
          <Text>{address.street}</Text>
          <Text>{address.zip} {address.city}</Text>
        </View>

        {/* Beleg-Info */}
        <View style={styles.docInfoBlock}>
          <Text style={styles.docInfoLabel}>{documentTypeLabel(document.type)}</Text>
          <Text>Nr.: {document.number}</Text>
          <Text>Datum: {formatDate(document.documentDate)}</Text>
          {document.deliveryDate && <Text>Liefertermin: {formatDate(document.deliveryDate)}</Text>}
        </View>

        {/* Header Text (rich text → parsed to Text elements) */}
        {document.headerText && (
          <View style={styles.headerText}>
            <RichTextPdf html={document.headerText} />
          </View>
        )}

        {/* Positionstabelle */}
        <PositionTablePdf positions={document.positions} />

        {/* Summenblock */}
        <TotalsSummaryPdf
          subtotalNet={document.subtotalNet}
          totalVat={document.totalVat}
          totalGross={document.totalGross}
        />

        {/* Footer Text */}
        {document.footerText && (
          <View style={styles.footerText}>
            <RichTextPdf html={document.footerText} />
          </View>
        )}

        {/* Fußzeile (tenant config, absolute-positioned at bottom) */}
        {tenantConfig && <FusszeileBlock config={tenantConfig} />}
      </Page>
    </Document>
  )
}
```

#### 4. Rich Text HTML → React-PDF Converter

**File**: `src/lib/pdf/rich-text-pdf.tsx`

Converts Tiptap HTML (limited to `<p>`, `<strong>`, `<em>`, `<br>`) into React-PDF `<Text>` elements:

```tsx
// Parses simple HTML into react-pdf Text nodes
// Supports: <p>, <strong> (bold), <em> (italic), <br>
export function RichTextPdf({ html }: { html: string }) {
  // Parse HTML → tree of { type, bold, italic, text } nodes
  // Render as <Text> with fontFamily/fontWeight/fontStyle
}
```

Lightweight parser — the allowed HTML is minimal (bold/italic only), so a simple regex or small DOM parser suffices.

#### 5. PDF Sub-Components

**File**: `src/lib/pdf/position-table-pdf.tsx`

React-PDF table rendering for positions:
- Table header row: Pos, Beschreibung, Menge, Einheit, Einzelpreis, Gesamt
- One row per position (skip PAGE_BREAK/SUBTOTAL or render them appropriately)
- TEXT positions render description only (no price columns)
- SUBTOTAL positions render as bold separator with running total
- Number formatting: `Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })`

**File**: `src/lib/pdf/totals-summary-pdf.tsx`

Right-aligned summary block: Netto, MwSt, Brutto.

**File**: `src/lib/pdf/fusszeile-pdf.tsx`

3-column footer from `BillingTenantConfig`: Company | Bank | Legal.

#### 6. Document Type → Storage Path Mapping

**File**: `src/lib/pdf/pdf-storage.ts`

```typescript
const DOCUMENT_TYPE_PATHS: Record<BillingDocumentType, string> = {
  OFFER: 'angebot',
  ORDER_CONFIRMATION: 'auftragsbestaetigung',
  DELIVERY_NOTE: 'lieferschein',
  SERVICE_NOTE: 'serviceschein',
  RETURN_DELIVERY: 'ruecklieferschein',
  INVOICE: 'rechnung',
  CREDIT_NOTE: 'gutschrift',
}

export function getStoragePath(doc: { type: BillingDocumentType; tenantId: string; id: string }): string {
  return `${DOCUMENT_TYPE_PATHS[doc.type]}/${doc.tenantId}_${doc.id}.pdf`
}
```

#### 7. PDF Generation + Storage Service

**File**: `src/lib/services/billing-document-pdf-service.ts`

Replace the stub. The service now has two public functions:

```typescript
import { renderToBuffer } from '@react-pdf/renderer'
import { createAdminClient } from '@/lib/supabase/admin'
import { BillingDocumentPdf } from '@/lib/pdf/billing-document-pdf'
import { getStoragePath } from '@/lib/pdf/pdf-storage'

const BUCKET = 'documents'

/**
 * Generate PDF, upload to Supabase Storage, persist pdfUrl on document.
 * Called once on finalization. Overwrites any existing PDF for this document.
 */
export async function generateAndStorePdf(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
): Promise<string> {
  const doc = await billingDocService.getById(prisma, tenantId, documentId)
  if (!doc) throw new BillingDocumentNotFoundError()

  const address = await crmAddressRepo.findById(prisma, tenantId, doc.addressId)
  const tenantConfig = await billingTenantConfigRepo.findByTenantId(prisma, tenantId)

  // 1. Render PDF to buffer
  const buffer = await renderToBuffer(
    <BillingDocumentPdf
      document={doc}
      address={address}
      tenantConfig={tenantConfig}
    />
  )

  // 2. Upload to Supabase Storage
  const supabase = createAdminClient()
  const storagePath = getStoragePath(doc)

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, Buffer.from(buffer), {
      contentType: 'application/pdf',
      upsert: true,  // overwrite on re-generation
    })

  if (uploadError) throw new Error(`PDF upload failed: ${uploadError.message}`)

  // 3. Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath)

  // 4. Persist URL on document
  await repo.update(prisma, tenantId, documentId, { pdfUrl: publicUrl })

  return publicUrl
}

/**
 * Legacy query — returns stored URL or generates on-demand (fallback).
 * Primarily for backwards compatibility with the existing generatePdf tRPC query.
 */
export async function getPdfUrl(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
): Promise<string> {
  const doc = await billingDocService.getById(prisma, tenantId, documentId)
  if (!doc) throw new BillingDocumentNotFoundError()

  // If already generated, return stored URL
  if (doc.pdfUrl) return doc.pdfUrl

  // Fallback: generate now (should not happen in normal flow)
  return generateAndStorePdf(prisma, tenantId, documentId)
}
```

#### 8. Hook PDF Generation Into Finalize

**File**: `src/lib/services/billing-document-service.ts`

In the `finalize()` method, after setting `status: 'PRINTED'` and `printedAt`, call PDF generation:

```typescript
// After: await repo.update(prisma, tenantId, id, { status: 'PRINTED', printedAt: new Date(), printedById })
// Add:
await pdfService.generateAndStorePdf(prisma, tenantId, id)
```

This ensures the PDF is generated exactly once when the document is finalized. The `pdfUrl` is then available on the document for all subsequent access.

#### 9. Clear pdfUrl on Status Changes That Invalidate the PDF

If a document's status can revert (e.g., cancel → re-create as draft via duplicate, or future "reopen" functionality), the `pdfUrl` should be cleared when the content could change:

- `duplicate()` — new document starts as DRAFT with `pdfUrl: null` (already the case since `pdfUrl` is not copied)
- `forward()` — new child document starts as DRAFT with `pdfUrl: null` (same)
- If a "reopen" feature is added later: clear `pdfUrl` when moving back to DRAFT

**No change needed now** — `forward()` and `duplicate()` don't copy `pdfUrl` (it's not in the field list), so new documents naturally start without a PDF.

#### 10. PDF Button in Document Editor

**File**: `src/components/billing/document-editor.tsx`

Add "PDF herunterladen" button in the toolbar:
- **If `doc.pdfUrl` exists** → `<a href={doc.pdfUrl} target="_blank">` (instant, no server call)
- **If `doc.pdfUrl` is null** (DRAFT, not yet finalized) → button disabled with tooltip "PDF wird bei Abschluss generiert"
- Optional: "PDF neu generieren" action for admin/edge cases (calls `generateAndStorePdf` explicitly)

#### 11. Update Finalize Dialog

**File**: `src/components/billing/document-print-dialog.tsx` (DocumentFinalizeDialog)

After finalization succeeds, the document now has `pdfUrl`. Show a "PDF öffnen" link/button in the success state of the dialog. Optionally auto-open in new tab.

#### 12. tRPC Router Updates

**File**: `src/trpc/routers/billing/documents.ts`

- Update `generatePdf` query to use `pdfService.getPdfUrl()` (returns URL string, not buffer)
- Add `regeneratePdf` mutation (for explicit re-generation, e.g., after tenant config changes)
- Ensure `getById` response includes `pdfUrl` field (automatic if schema field exists)

### Success Criteria

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Build succeeds: `pnpm build`
- [x] PDF generation pipeline implemented (renderToBuffer + Supabase Storage)
- [x] PDF generation hooked into finalize (with graceful error handling)
- [x] `pdfUrl` persisted on document after finalization
- [x] `forward()` and `duplicate()` do NOT copy `pdfUrl` (new docs have null — pdfUrl not in field list)

#### Manual Verification:
- [ ] Finalize a document → PDF generated and stored automatically
- [ ] Click "PDF herunterladen" → opens stored PDF instantly (no re-generation)
- [ ] PDF contains: tenant letterhead, recipient, document info, header text, positions, totals, footer text, Fußzeile
- [ ] Bold/italic formatting preserved in PDF
- [ ] Position table columns align correctly
- [ ] Currency formatting correct (EUR, de-DE)
- [ ] Multi-page documents: positions overflow to next page, Fußzeile on every page
- [ ] Forward a document with PDF → new child document has no pdfUrl (null)
- [ ] Finalize the child → child gets its own PDF
- [ ] "PDF neu generieren" regenerates and overwrites the stored file

**Implementation Note**: After completing this phase, the full feature is complete. Run comprehensive end-to-end testing.

---

## Testing Strategy

### Unit Tests

**New test files**:
- `src/trpc/routers/__tests__/billingDocumentTemplates-router.test.ts` — Template CRUD
- `src/trpc/routers/__tests__/billingTenantConfig-router.test.ts` — Config get/upsert
- `src/lib/services/__tests__/billing-document-template-service.test.ts` — Default template logic
- `src/lib/services/__tests__/billing-tenant-config-service.test.ts` — Config upsert

**Updates to existing tests**:
- `billingDocuments-router.test.ts` — Test headerText/footerText in create, update, forward, duplicate

### Key Test Cases
- Create document with headerText/footerText → persisted
- Forward document → headerText/footerText copied to new document
- Duplicate document → headerText/footerText copied
- Create document without template → default template auto-applied
- Create template, set as default → verify auto-application
- Only one default per (tenantId, documentType)
- Upsert tenant config → idempotent
- HTML sanitization strips dangerous tags

### E2E Browser Tests

Update `src/e2e-browser/30-billing-documents.spec.ts`:
- Verify A4 layout renders
- Verify header/footer text editing (type, blur, reload, verify)
- Verify PDF download button works

## Performance Considerations

- **Tiptap**: Minimal bundle impact (~30KB gzipped for starter-kit). Only loaded on document detail page.
- **@react-pdf/renderer**: Server-side rendering, no browser dependency. `renderToBuffer` typically ~500ms-1s for a standard document. Generated once on finalization, then served from Supabase Storage — subsequent downloads are instant (no server-side work).
- **A4 Layout**: Fixed 210mm width means horizontal scroll on very small screens. Accept this — billing documents are not a mobile use case.
- **Rich text content**: Store as HTML. Keep content short (typically 1-5 paragraphs). No size concerns.

## Migration Notes

- **Existing documents**: `headerText` and `footerText` are nullable — existing documents render normally with empty text areas
- **No data migration needed**: New fields are additive, no existing data affected
- **Tenant config**: Created on first use. Documents render without config (placeholder shown).
- **Backwards compatibility**: The old tab-based detail view can be kept as `document-detail-legacy.tsx` during transition

## References

- Research: `thoughts/shared/plans/2026-03-19-billing-document-editor-research.md`
- Schema: `prisma/schema.prisma:619` (BillingDocument), `:702` (BillingDocumentPosition)
- Service: `src/lib/services/billing-document-service.ts`
- Current detail: `src/components/billing/document-detail.tsx`
- PDF stub: `src/lib/services/billing-document-pdf-service.ts`
- Forward logic: `src/lib/services/billing-document-service.ts:379`
- Duplicate logic: `src/lib/services/billing-document-service.ts:497`
