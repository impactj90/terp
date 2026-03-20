# E-Rechnung (ZUGFeRD / XRechnung) Implementation Plan

## Overview

Implement ZUGFeRD 2.x EN 16931 (COMFORT profile) e-invoicing for INVOICE and CREDIT_NOTE billing documents. When a tenant enables e-invoicing, finalized invoices and credit notes will automatically get a CII-XML generated, embedded into the PDF as PDF/A-3, and stored separately for XRechnung download. This is a legal requirement for B2B invoicing in Germany starting 01.01.2027.

**Library:** `@e-invoice-eu/core` v2.3.4 (npm) — TypeScript-native, supports CII + UBL, all ZUGFeRD profiles, PDF/A-3 embedding via `@cantoo/pdf-lib`. Actively maintained (9 contributors, 162 stars, last publish 2026-03-19). Chosen over `node-zugferd` which is WIP (v0.0.8, 1 contributor, stale npm).

## Current State Analysis

### What exists:
- **BillingTenantConfig** (`prisma/schema.prisma:768-790`): `companyName`, `companyAddress` (freetext), `iban`, `bic`, `bankName`, `taxId` (USt-IdNr.), contact fields
- **CrmAddress** (`prisma/schema.prisma:272-318`): `company`, `street`, `zip`, `city`, `country`, `taxNumber`, `vatId`
- **BillingDocument** (`prisma/schema.prisma:621-700`): `pdfUrl`, `subtotalNet`, `totalVat`, `totalGross`, `paymentTermDays`, `discountPercent`, `discountDays`
- **PDF flow** (`billing-document-pdf-service.ts`): `generateAndStorePdf()` renders React PDF → Supabase Storage upload → `pdfUrl` on document. `getSignedDownloadUrl()` creates 60s signed URL with Docker URL rewriting.
- **finalize()** (`billing-document-service.ts:349-409`): Updates status to PRINTED, calls `pdfService.generateAndStorePdf()` in try/catch (errors swallowed).
- **Storage** (`pdf-storage.ts`): Bucket `"documents"`, path `{type-folder}/{tenantId}_{docId}.pdf`

### What's missing:
- **BillingTenantConfig**: `taxNumber` (Steuernummer), `leitwegId`, `eInvoiceEnabled`, structured address (`companyStreet`, `companyZip`, `companyCity`, `companyCountry`)
- **BillingDocument**: `eInvoiceXmlUrl`
- **CrmAddress**: `leitwegId`
- E-Invoice service for XML generation, PDF embedding, and storage
- UI for new fields and XML download

## Desired End State

After implementation:
1. Tenants can enable e-invoicing via a toggle in billing config
2. Tenants can provide structured seller address + Steuernummer for e-invoicing
3. CRM addresses can have a Leitweg-ID for B2G recipients
4. Finalizing an INVOICE/CREDIT_NOTE with e-invoicing enabled automatically generates ZUGFeRD CII-XML
5. The XML is embedded into the PDF (PDF/A-3) and also stored separately
6. Users can download the standalone XML from the document editor
7. Finalize dialog shows a warning when required e-invoice fields are missing (non-blocking)

### Verification:
- `pnpm test` — all unit + integration tests pass
- `pnpm typecheck` — no new type errors
- `pnpm lint` — no lint errors
- Generated XML passes KoSIT EN 16931 validation locally
- XML download button visible for finalized INVOICE/CREDIT_NOTE with XML
- E-Rechnung toggle, Steuernummer, Leitweg-ID visible in tenant config form

## What We're NOT Doing

- **UBL/XRechnung pure XML output** — only CII format (ZUGFeRD) for now. `@e-invoice-eu/core` supports UBL natively if needed later for B2G.
- **Multi-currency** — hardcoded EUR. Add `currency` field on BillingDocument later if needed.
- **Automatic KoSIT CI validation** — requires Java, manual local use only.
- **E-invoice for OFFER/DELIVERY_NOTE/etc.** — only INVOICE (380) and CREDIT_NOTE (381).
- **Peppol delivery** — no electronic transmission, just file generation.

---

## Phase 1: Schema Migration + Prisma

### Overview
Add all new database fields across 3 models and regenerate the Prisma client.

### Changes Required:

#### 1. Supabase Migration
**File**: `supabase/migrations/20260101000105_add_einvoice_fields.sql`

```sql
-- BillingTenantConfig: E-Invoice fields + structured seller address
ALTER TABLE billing_tenant_configs ADD COLUMN tax_number VARCHAR(50);
ALTER TABLE billing_tenant_configs ADD COLUMN leitweg_id VARCHAR(50);
ALTER TABLE billing_tenant_configs ADD COLUMN e_invoice_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE billing_tenant_configs ADD COLUMN company_street VARCHAR(255);
ALTER TABLE billing_tenant_configs ADD COLUMN company_zip VARCHAR(20);
ALTER TABLE billing_tenant_configs ADD COLUMN company_city VARCHAR(100);
ALTER TABLE billing_tenant_configs ADD COLUMN company_country VARCHAR(10) DEFAULT 'DE';

-- BillingDocument: XML storage path
ALTER TABLE billing_documents ADD COLUMN e_invoice_xml_url TEXT;

-- CrmAddress: Leitweg-ID for B2G recipients
ALTER TABLE crm_addresses ADD COLUMN leitweg_id VARCHAR(50);
```

#### 2. Prisma Schema
**File**: `prisma/schema.prisma`

Add to `BillingTenantConfig` (after line 783, before `createdAt`):
```prisma
  taxNumber          String?  @map("tax_number") @db.VarChar(50)
  leitwegId          String?  @map("leitweg_id") @db.VarChar(50)
  eInvoiceEnabled    Boolean  @default(false) @map("e_invoice_enabled")
  companyStreet      String?  @map("company_street") @db.VarChar(255)
  companyZip         String?  @map("company_zip") @db.VarChar(20)
  companyCity        String?  @map("company_city") @db.VarChar(100)
  companyCountry     String?  @default("DE") @map("company_country") @db.VarChar(10)
```

Add to `BillingDocument` (after line 667 `pdfUrl`):
```prisma
  eInvoiceXmlUrl     String?  @map("e_invoice_xml_url")
```

Add to `CrmAddress` (after line 287 `vatId`):
```prisma
  leitwegId          String?  @map("leitweg_id") @db.VarChar(50)
```

#### 3. Regenerate Prisma Client
```bash
pnpm db:generate
```

### Success Criteria:

#### Automated Verification:
- [x] Migration applies cleanly: `supabase db reset` or apply migration
- [x] Prisma client regenerates: `pnpm db:generate`
- [x] Type checking passes: `pnpm typecheck` (no new errors beyond baseline ~1463)
- [x] Existing tests pass: `pnpm test`

#### Manual Verification:
- [ ] Fields visible in Prisma Studio

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 2.

---

## Phase 2: E-Invoice Service

### Overview
Create the core e-invoice service that handles validation, XML generation, PDF/A-3 embedding, and storage. Also extend `pdf-storage.ts` with XML path helper.

### Changes Required:

#### 0. Install dependency
```bash
pnpm add @e-invoice-eu/core
```

#### 1. XML Storage Path Helper
**File**: `src/lib/pdf/pdf-storage.ts`

Add `getXmlStoragePath` function alongside existing `getStoragePath`:

```ts
export function getXmlStoragePath(doc: {
  type: BillingDocumentType
  tenantId: string
  id: string
}): string {
  return `${DOCUMENT_TYPE_PATHS[doc.type]}/${doc.tenantId}_${doc.id}.xml`
}
```

#### 2. New E-Invoice Service
**File**: `src/lib/services/billing-document-einvoice-service.ts`

Complete service with these exports:

**Error Classes:**
```ts
export class EInvoiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EInvoiceError"
  }
}

export class EInvoiceValidationError extends Error {
  missingFields: string[]
  constructor(missingFields: string[]) {
    super(`E-Invoice validation failed. Missing: ${missingFields.join(", ")}`)
    this.name = "EInvoiceValidationError"
    this.missingFields = missingFields
  }
}
```

**Unit Mapping:**
```ts
const UNIT_MAPPING: Record<string, string> = {
  "Stk": "C62",    // Piece/Unit
  "Std": "HUR",    // Hour
  "kg": "KGM",     // Kilogram
  "m": "MTR",      // Metre
  "m²": "MTK",     // Square metre
  "m³": "MTQ",     // Cubic metre
  "l": "LTR",      // Litre
  "t": "TNE",      // Tonne
  "Psch": "LS",    // Lump sum
  "km": "KMT",     // Kilometre
}
// Fallback: "C62" for unknown units
```

**Validation Function:**
```ts
export function validateEInvoiceRequirements(
  tenantConfig: BillingTenantConfig,
  document: BillingDocument & { positions: BillingDocumentPosition[] },
  address: CrmAddress
): string[]
```
Returns array of missing field descriptions. Checks:
- tenantConfig: `companyName`, `companyStreet`, `companyZip`, `companyCity`, `taxId` OR `taxNumber` (at least one)
- address: `company`, `street`, `zip`, `city`, `country`
- document: at least one ARTICLE or FREE position with price

**XML Generation:**
```ts
export async function generateXml(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
): Promise<Buffer>
```
Loads document + positions + address + tenantConfig, maps to `@e-invoice-eu/core` Invoice JSON schema for format `ZUGFeRD-EN16931`:
- BT-1 Invoice number ← `doc.number`
- BT-2 Issue date ← `doc.documentDate`
- BT-3 Type code ← INVOICE→"380", CREDIT_NOTE→"381"
- BT-5 Currency ← "EUR"
- BT-9 Due date ← `documentDate + paymentTermDays`
- BT-10 Buyer reference ← `address.leitwegId` (when present)
- BT-20 Payment terms text ← constructed from `paymentTermDays` + Skonto if set
- BT-27..40 Seller ← tenantConfig fields (structured address)
- BT-44..55 Buyer ← address fields
- BT-81/84 Payment ← `tenantConfig.iban`, `tenantConfig.bic`
- Line items: filter ARTICLE + FREE positions only, map unit via `UNIT_MAPPING`, VAT category "S" (standard) or "E" (exempt when rate=0)
- Totals from document: `subtotalNet`, `totalVat`, `totalGross`

**PDF/A-3 Embedding:**
```ts
export async function embedXmlInPdf(
  pdfBuffer: Buffer,
  xmlBuffer: Buffer,
  filename: string
): Promise<Buffer>
```
Uses `@e-invoice-eu/core`'s `InvoiceService.generate()` with the `pdf` option to attach CII-XML into existing PDF as PDF/A-3b. The library handles XMP metadata and XML attachment. Since our PDF from `@react-pdf/renderer` already has fonts embedded, the known font-embedding limitation (Issue #165) does not affect us.

**Main Orchestrator:**
```ts
export async function generateAndStoreEInvoice(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
): Promise<{ xmlStoragePath: string }>
```
1. Load document, address, tenantConfig
2. Validate (`validateEInvoiceRequirements`) → throw `EInvoiceValidationError` if missing fields
3. Map BillingDocument → `@e-invoice-eu/core` Invoice JSON schema
4. Download existing PDF from Supabase Storage
5. Call `InvoiceService.generate(invoiceData, { format: 'ZUGFeRD-EN16931', pdf: { data: pdfBuffer, ... } })` — returns PDF/A-3 with embedded CII-XML
6. Extract standalone XML from the generate result for separate storage
7. Upload XML to Supabase Storage: `getXmlStoragePath(...)` in bucket `"documents"`
8. Upload replaced PDF/A-3 to Supabase Storage (overwrites original PDF)
9. Update `eInvoiceXmlUrl` on BillingDocument
10. Return `{ xmlStoragePath }`

**Signed Download URL:**
```ts
export async function getSignedXmlDownloadUrl(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
): Promise<{ signedUrl: string; filename: string } | null>
```
Same pattern as `billing-document-pdf-service.ts:104-136`:
- Load document, read `eInvoiceXmlUrl`
- Create signed URL (60s)
- Docker URL rewriting
- Filename: `{doc.number}.xml`

### Success Criteria:

#### Automated Verification:
- [x] `pnpm typecheck` — no new errors
- [x] `pnpm lint` — passes
- [ ] Unit tests for validation + XML generation pass (written in Phase 5)

#### Manual Verification:
- [x] `@e-invoice-eu/core` installs without issues

**Implementation Note**: After completing this phase, proceed to Phase 3. The service is not yet wired up.

---

## Phase 3: Backend Integration

### Overview
Wire the e-invoice service into finalize(), add the downloadXml procedure, and extend tenant config and CRM address input schemas.

### Changes Required:

#### 1. Finalize Hook
**File**: `src/lib/services/billing-document-service.ts`

After the existing PDF generation block (line 406), add e-invoice generation:

```ts
// Generate E-Invoice XML on finalization (after PDF)
if (existing.type === "INVOICE" || existing.type === "CREDIT_NOTE") {
  const config = await billingTenantConfigRepo.findByTenantId(prisma, tenantId)
  if (config?.eInvoiceEnabled) {
    try {
      await eInvoiceService.generateAndStoreEInvoice(prisma, tenantId, id)
    } catch {
      console.error(`E-Invoice generation failed for document ${id}`)
    }
  }
}
```

Add import at top:
```ts
import * as eInvoiceService from "./billing-document-einvoice-service"
import * as billingTenantConfigRepo from "./billing-tenant-config-repository"
```

Note: `billingTenantConfigRepo` may already be imported — check first.

#### 2. downloadXml Procedure
**File**: `src/trpc/routers/billing/documents.ts`

Add new mutation procedure `downloadXml` alongside existing `downloadPdf`:

```ts
downloadXml: billingProcedure
  .use(requirePermission(BILLING_VIEW))
  .input(z.object({ id: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    try {
      return await eInvoiceService.getSignedXmlDownloadUrl(
        ctx.prisma as unknown as PrismaClient,
        ctx.tenantId!,
        input.id
      )
    } catch (err) {
      handleServiceError(err)
    }
  }),
```

Add import: `import * as eInvoiceService from "@/lib/services/billing-document-einvoice-service"`

#### 3. Tenant Config — Extend Input Schema
**File**: `src/trpc/routers/billing/tenantConfig.ts`

Add to `upsertInput` (line 18-32):
```ts
taxNumber: z.string().max(50).nullable().optional(),
leitwegId: z.string().max(50).nullable().optional(),
eInvoiceEnabled: z.boolean().optional(),
companyStreet: z.string().max(255).nullable().optional(),
companyZip: z.string().max(20).nullable().optional(),
companyCity: z.string().max(100).nullable().optional(),
companyCountry: z.string().max(10).nullable().optional(),
```

#### 4. Tenant Config — Extend Repository Data Type
**File**: `src/lib/services/billing-tenant-config-repository.ts`

Add to the `upsert` data parameter type:
```ts
taxNumber?: string | null
leitwegId?: string | null
eInvoiceEnabled?: boolean
companyStreet?: string | null
companyZip?: string | null
companyCity?: string | null
companyCountry?: string | null
```

#### 5. Tenant Config — Extend Service
**File**: `src/lib/services/billing-tenant-config-service.ts`

The service's `upsert` function passes data through to the repository. If the data type is explicitly typed (not spread from `Parameters`), extend it to match the repository. If it uses generic pass-through, no changes needed — verify.

#### 6. CRM Address — Extend Update Input
**File**: `src/trpc/routers/crm/addresses.ts`

Add `leitwegId` to the `update` input schema:
```ts
leitwegId: z.string().max(50).optional().or(z.literal("")),
```

Also add to `create` input schema with the same pattern.

#### 7. CRM Address — Extend Service
**File**: `src/lib/services/crm-address-service.ts`

Add `"leitwegId"` to the `directFields` array in the `update()` function (line ~178).
Also handle it in `create()` if not already passed through.

### Success Criteria:

#### Automated Verification:
- [x] `pnpm typecheck` — no new errors
- [x] `pnpm lint` — passes
- [x] Existing tests pass: `pnpm test`
- [ ] Router tests for downloadXml + tenantConfig fields pass (written in Phase 5)

#### Manual Verification:
- [ ] Finalize an INVOICE with eInvoiceEnabled → XML generated in Storage
- [ ] downloadXml returns signed URL for finalized INVOICE with XML

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 4.

---

## Phase 4: UI Components

### Overview
Add E-Rechnung section to tenant config form, XML download button to document editor, validation warning to finalize dialog, and Leitweg-ID field to address form.

### Changes Required:

#### 1. Tenant Config Form — E-Rechnung Section
**File**: `src/components/billing/tenant-config-form.tsx`

**New state variables** (after line 29, existing state declarations):
```ts
const [taxNumber, setTaxNumber] = React.useState('')
const [leitwegId, setLeitwegId] = React.useState('')
const [eInvoiceEnabled, setEInvoiceEnabled] = React.useState(false)
const [companyStreet, setCompanyStreet] = React.useState('')
const [companyZip, setCompanyZip] = React.useState('')
const [companyCity, setCompanyCity] = React.useState('')
const [companyCountry, setCompanyCountry] = React.useState('DE')
```

**Extend useEffect** (config loading, line 32-47):
```ts
setTaxNumber(config.taxNumber ?? '')
setLeitwegId(config.leitwegId ?? '')
setEInvoiceEnabled(config.eInvoiceEnabled ?? false)
setCompanyStreet(config.companyStreet ?? '')
setCompanyZip(config.companyZip ?? '')
setCompanyCity(config.companyCity ?? '')
setCompanyCountry(config.companyCountry ?? 'DE')
```

**Extend handleSubmit** (upsertMutation call, line 52-65):
Add to the mutation object:
```ts
taxNumber: taxNumber || null,
leitwegId: leitwegId || null,
eInvoiceEnabled,
companyStreet: companyStreet || null,
companyZip: companyZip || null,
companyCity: companyCity || null,
companyCountry: companyCountry || null,
```

**New Card section** — insert after the "Rechtliches" card (after line 156), before the "Fußzeile" card:

```tsx
{/* E-Rechnung */}
<Card>
  <CardHeader>
    <CardTitle className="text-lg">E-Rechnung</CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    <div className="flex items-center gap-3">
      <Switch
        id="e-invoice-enabled"
        checked={eInvoiceEnabled}
        onCheckedChange={setEInvoiceEnabled}
      />
      <Label htmlFor="e-invoice-enabled">E-Rechnung aktivieren (ZUGFeRD / XRechnung)</Label>
    </div>
    <p className="text-sm text-muted-foreground">
      Wenn aktiviert, wird bei Rechnungen und Gutschriften automatisch eine EN 16931 konforme E-Rechnung (CII-XML) erstellt und in das PDF eingebettet.
    </p>
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor="tax-number">Steuernummer</Label>
        <Input id="tax-number" value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} placeholder="123/456/78901" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="leitweg-id">Leitweg-ID</Label>
        <Input id="leitweg-id" value={leitwegId} onChange={(e) => setLeitwegId(e.target.value)} placeholder="991-12345-67" />
        <p className="text-xs text-muted-foreground">Für XRechnung an öffentliche Auftraggeber</p>
      </div>
    </div>
    <div className="space-y-2">
      <Label className="text-sm font-medium">Strukturierte Firmenadresse (für E-Rechnung)</Label>
      <p className="text-xs text-muted-foreground">
        Diese Felder werden für das maschinenlesbare XML verwendet. Die Freitext-Adresse oben bleibt für den PDF-Briefkopf.
      </p>
    </div>
    <div className="space-y-2">
      <Label htmlFor="company-street">Straße</Label>
      <Input id="company-street" value={companyStreet} onChange={(e) => setCompanyStreet(e.target.value)} placeholder="Musterstraße 1" />
    </div>
    <div className="grid grid-cols-3 gap-4">
      <div className="space-y-2">
        <Label htmlFor="company-zip">PLZ</Label>
        <Input id="company-zip" value={companyZip} onChange={(e) => setCompanyZip(e.target.value)} placeholder="12345" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="company-city">Ort</Label>
        <Input id="company-city" value={companyCity} onChange={(e) => setCompanyCity(e.target.value)} placeholder="Musterstadt" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="company-country">Land</Label>
        <Input id="company-country" value={companyCountry} onChange={(e) => setCompanyCountry(e.target.value)} placeholder="DE" />
      </div>
    </div>
  </CardContent>
</Card>
```

Add imports: `Switch` from `@/components/ui/switch`.

#### 2. Document Editor — XML Download Button
**File**: `src/components/billing/document-editor.tsx`

Add after the PDF button (after line 309, inside the `isImmutable` block area):

```tsx
{isImmutable && (doc as Record<string, unknown>).eInvoiceXmlUrl && (doc.type === 'INVOICE' || doc.type === 'CREDIT_NOTE') && (
  <Button
    variant="outline"
    disabled={downloadXmlMutation.isPending}
    onClick={async () => {
      try {
        const result = await downloadXmlMutation.mutateAsync({ id: doc.id })
        if (result?.signedUrl) {
          window.open(result.signedUrl, '_blank')
        }
      } catch {
        toast.error('XML-Download fehlgeschlagen')
      }
    }}
  >
    <FileCode className="h-4 w-4 mr-1" />
    {downloadXmlMutation.isPending ? 'Lade XML...' : 'E-Rechnung XML'}
  </Button>
)}
```

Add hook usage at the top of the component:
```ts
const downloadXmlMutation = useDownloadBillingDocumentXml()
```

Add imports: `FileCode` from `lucide-react`, `useDownloadBillingDocumentXml` from `@/hooks`.

#### 3. Finalize Dialog — Validation Warning
**File**: `src/components/billing/document-print-dialog.tsx`

Add props for e-invoice validation:
```ts
interface DocumentFinalizeDialogProps {
  // ...existing...
  eInvoiceEnabled?: boolean
  eInvoiceMissingFields?: string[]
}
```

After the destructive Alert (line 82), add conditional warning:

```tsx
{eInvoiceEnabled && (documentType === 'INVOICE' || documentType === 'CREDIT_NOTE') && eInvoiceMissingFields && eInvoiceMissingFields.length > 0 && (
  <Alert>
    <AlertTriangle className="h-4 w-4" />
    <AlertDescription>
      <p className="font-medium">E-Rechnung: Pflichtfelder fehlen</p>
      <p className="text-sm mt-1">
        {eInvoiceMissingFields.join(', ')}
      </p>
      <p className="text-sm text-muted-foreground mt-1">
        Die E-Rechnung (XML) wird nicht erstellt. Der Beleg wird trotzdem abgeschlossen und das PDF generiert.
      </p>
    </AlertDescription>
  </Alert>
)}
```

The parent component (`document-editor.tsx`) passes these props by loading tenantConfig and running client-side validation. Add to the editor:
```ts
const { data: tenantConfig } = useBillingTenantConfig()
```

Compute `eInvoiceMissingFields` from available data and pass to the dialog.

#### 4. Address Form — Leitweg-ID
**File**: `src/components/crm/address-form-sheet.tsx`

In the `FormState` interface, add: `leitwegId: string`

In the "Tax Information" section (2-col grid with `taxNumber` and `vatId`), add a third field or expand to 3-col grid:

```tsx
<div className="space-y-2">
  <Label htmlFor="leitwegId">{t('leitwegId', 'Leitweg-ID')}</Label>
  <Input
    id="leitwegId"
    value={form.leitwegId}
    onChange={(e) => setForm(prev => ({ ...prev, leitwegId: e.target.value }))}
    placeholder="991-12345-67"
  />
</div>
```

Add `leitwegId` to the submit payload construction.

#### 5. New Hook — XML Download
**File**: `src/hooks/use-billing-documents.ts`

Add after `useDownloadBillingDocumentPdf`:
```ts
export function useDownloadBillingDocumentXml() {
  const trpc = useTRPC()
  return useMutation(trpc.billing.documents.downloadXml.mutationOptions())
}
```

#### 6. Export Hook
**File**: `src/hooks/index.ts`

Add `useDownloadBillingDocumentXml` to the `use-billing-documents` export block (after line 738).

### Success Criteria:

#### Automated Verification:
- [x] `pnpm typecheck` — no new errors
- [x] `pnpm lint` — passes

#### Manual Verification:
- [ ] Tenant config form shows "E-Rechnung" card with Switch, Steuernummer, Leitweg-ID, structured address fields
- [ ] Existing `companyAddress` textarea still present in "Unternehmen" section
- [ ] "E-Rechnung XML" button appears on finalized INVOICE/CREDIT_NOTE with eInvoiceXmlUrl
- [ ] "E-Rechnung XML" button NOT visible on OFFER, DELIVERY_NOTE, or DRAFT documents
- [ ] Clicking "E-Rechnung XML" downloads an XML file
- [ ] Finalize dialog shows warning when eInvoiceEnabled but required fields missing
- [ ] Finalize still works even when warning is shown (non-blocking)
- [ ] CRM address form shows Leitweg-ID field in Tax Information section

**Implementation Note**: After completing this phase and all manual verification passes, proceed to Phase 5.

---

## Phase 5: Tests + KoSIT Tooling

### Overview
Add comprehensive tests (unit, integration, XML validation, E2E) and set up KoSIT validator tooling.

### Changes Required:

#### 1. Unit Tests — E-Invoice Service
**File**: `src/lib/services/__tests__/billing-document-einvoice-service.test.ts`

```ts
describe("billing-document-einvoice-service", () => {
  describe("validateEInvoiceRequirements", () => {
    it("returns empty array when all required fields present")
    it("returns missing fields when companyName absent")
    it("returns missing fields when taxId AND taxNumber absent")
    it("passes when taxId present but taxNumber absent")
    it("passes when taxNumber present but taxId absent")
    it("returns missing fields when buyer address incomplete")
    it("returns missing fields when document has no positions")
    it("returns missing fields when companyStreet/companyZip/companyCity absent")
  })

  describe("generateXml", () => {
    it("generates valid CII XML for INVOICE")
    it("generates valid CII XML for CREDIT_NOTE with type code 381")
    it("maps INVOICE type to code 380")
    it("includes all line items with correct BT fields")
    it("calculates payment due date from documentDate + paymentTermDays")
    it("includes Skonto text when discountPercent set")
    it("maps unit strings to UN/ECE Rec 20 codes")
    it("sets VAT category S for standard rate")
    it("sets VAT category E for exempt (0% rate)")
    it("includes seller IBAN and BIC when present")
    it("includes buyer VAT ID when present")
    it("includes Leitweg-ID when present (BT-10 BuyerReference)")
    it("excludes TEXT and PAGE_BREAK positions from XML")
  })

  describe("generateAndStoreEInvoice", () => {
    // These need mocked Supabase Storage
    it("generates XML and uploads to Supabase Storage")
    it("embeds XML into existing PDF as PDF/A-3")
    it("updates eInvoiceXmlUrl on document")
    it("throws EInvoiceValidationError when required fields missing")
    it("uses correct storage path: {type}/{tenantId}_{docId}.xml")
  })

  describe("getSignedXmlDownloadUrl", () => {
    it("returns signed URL and filename for existing XML")
    it("returns null when no XML generated")
    it("replaces internal URL with public URL")
  })
})
```

#### 2. XML Structure Validation Tests
**File**: `src/lib/services/__tests__/einvoice-xml-validation.test.ts`

Fast unit tests that parse generated XML and validate structure (no Java needed):

```ts
describe("E-Invoice XML Structure Validation", () => {
  // Generate XML once in beforeAll, parse with a simple XML parser

  // Root structure
  it("generated XML parses without errors")
  it("root element is rsm:CrossIndustryInvoice")

  // Mandatory BT fields
  it("contains BT-1 (Invoice Number)")
  it("contains BT-2 (Issue Date) in YYYYMMDD format")
  it("contains BT-3 (Type Code) = 380 for INVOICE")
  it("contains BT-3 (Type Code) = 381 for CREDIT_NOTE")
  it("contains BT-5 (Currency Code) = EUR")
  it("contains BT-27 (Seller Name)")
  it("contains BT-31 (Seller VAT ID) or BT-32 (Seller Tax Number)")
  it("contains BT-35..40 (Seller Address)")
  it("contains BT-44 (Buyer Name)")
  it("contains BT-50..55 (Buyer Address)")

  // Line items
  it("contains line items with BT-126, BT-129, BT-131, BT-153")
  it("excludes TEXT and PAGE_BREAK positions")

  // Totals
  it("contains BT-106 (Line Net Total)")
  it("contains BT-109, BT-110, BT-112")
  it("totals are mathematically correct: BT-109 + BT-110 = BT-112")

  // Tax
  it("VAT category is S for standard rate")
  it("VAT category is E for exempt (0%)")

  // Payment
  it("contains payment due date when paymentTermDays set")
  it("contains IBAN and BIC when present")

  // Optional
  it("contains BT-48 (Buyer VAT ID) when present")
  it("contains BT-10 (Leitweg-ID) when present")
})
```

#### 3. Integration Tests — Router
**File**: `src/trpc/routers/__tests__/billingDocumentsEInvoice-router.test.ts`

Follow existing pattern from `billingDocuments-router.test.ts` and `billingTenantConfig-router.test.ts`:

```ts
describe("billing.documents.downloadXml", () => {
  it("requires billing_documents.view permission")
  it("requires billing module enabled")
  it("returns signed URL for finalized INVOICE with XML")
  it("returns null for document without XML")
})

describe("billing.tenantConfig.upsert — E-Invoice fields", () => {
  it("saves taxNumber")
  it("saves leitwegId")
  it("saves eInvoiceEnabled")
  it("saves companyStreet, companyZip, companyCity, companyCountry")
})
```

#### 4. E2E Browser Tests
**File**: `src/e2e-browser/35-billing-einvoice.spec.ts`

```ts
test.describe("UC-ORD-EINV: E-Rechnung", () => {
  test("tenant config shows E-Rechnung section")
  test("XML download button visible for finalized INVOICE")
  test("XML download button NOT visible for OFFER")
  test("XML download button NOT visible for DRAFT INVOICE")
  test("download XML triggers file download")
  test("finalize INVOICE shows warning when taxId missing")
})
```

#### 5. KoSIT Validator Tooling

**File**: `tools/kosit/README.md` — documentation for local KoSIT validator setup

**File**: `tools/kosit/.gitkeep` — keep empty directory in repo

**Add to `.gitignore`**:
```
tools/kosit/*.jar
tools/kosit/*.zip
tools/kosit/xrechnung/
```

**Add to `package.json` scripts**:
```json
"validate:einvoice": "java -jar tools/kosit/validator.jar --scenarios tools/kosit/xrechnung/scenarios.xml"
```

### Success Criteria:

#### Automated Verification:
- [x] All new unit tests pass: `pnpm vitest run src/lib/services/__tests__/billing-document-einvoice-service.test.ts`
- [ ] XML validation tests pass: `pnpm vitest run src/lib/services/__tests__/einvoice-xml-validation.test.ts` (deferred — requires live XML generation)
- [x] Router integration tests pass: `pnpm vitest run src/trpc/routers/__tests__/billingDocumentsEInvoice-router.test.ts`
- [x] All existing tests still pass: `pnpm test`
- [x] `pnpm typecheck` — no new errors
- [x] `pnpm lint` — passes

#### Manual Verification:
- [ ] KoSIT validator setup works per README instructions
- [ ] `pnpm validate:einvoice <generated-xml>` reports "is valid" for a generated XML
- [ ] E2E browser tests pass: `pnpm exec playwright test src/e2e-browser/35-billing-einvoice.spec.ts`
- [ ] Cross-tenant isolation: XML only accessible with correct tenant

**Implementation Note**: After completing this phase and all verification passes, the feature is complete.

---

## Testing Strategy

### Unit Tests:
- Validation function: all permutations of missing/present fields
- XML generation: BT field mapping, type codes, unit mapping, VAT categories, payment terms, Skonto text
- Storage: correct paths, Supabase interactions (mocked)
- Error handling: validation errors, storage errors

### Integration Tests:
- Router permission checks (view, module guard)
- End-to-end: finalize → XML generated → downloadXml returns URL
- Tenant config upsert with new fields

### XML Structure Tests:
- Parse generated XML, verify EN 16931 mandatory BT fields present
- Mathematical consistency of totals
- Date formats (YYYYMMDD)
- Currency codes, VAT category codes

### E2E Browser Tests:
- UI visibility conditions for XML button
- File download flow
- Tenant config form new section
- Finalize warning display

### Manual Validation:
- KoSIT validator (Java-based, EN 16931 XSD + Schematron)

## Performance Considerations

- XML generation is CPU-light (template + string construction); no performance concern
- PDF/A-3 embedding requires loading PDF into memory — same as current PDF generation, already proven
- No additional database queries beyond what finalize() already does (address, tenantConfig already loaded for PDF)
- XML Storage upload is small (typically 5-50KB) — negligible latency

## Migration Notes

- All new columns are nullable or have defaults → zero-downtime migration
- No data migration needed — new fields are empty until users populate them
- `eInvoiceEnabled` defaults to `false` → no existing tenants affected
- Existing documents won't have `eInvoiceXmlUrl` → XML button hidden (correct behavior)

## References

- Original ticket: `thoughts/shared/tickets/orgAuftrag/TICKET_ORD_ERECHNUNG.md`
- ZUGFeRD spec: EN 16931 / CII (Cross-Industry Invoice)
- @e-invoice-eu/core v2.3.4: npm package for ZUGFeRD/XRechnung generation (https://github.com/gflohr/e-invoice-eu)
- KoSIT Validator: https://github.com/itplr-kosit/validator
- Existing PDF service: `src/lib/services/billing-document-pdf-service.ts`
- Existing storage: `src/lib/pdf/pdf-storage.ts`
