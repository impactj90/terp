# Terp Invoice Phase 1 — Eingangsrechnungen: Implementation Plan

## Overview

Implement a complete inbound invoice module for Pro-Di GmbH: IMAP email receiving of invoice PDFs, ZUGFeRD/XRechnung XML parsing, manual upload fallback, multi-step approval workflow with amount-based threshold routing, and DATEV CSV export. Replaces their current Excel-based process.

## Current State Analysis

**No inbound invoice infrastructure exists.** The codebase has:
- Outbound email (SMTP config, templates, send, retry cron) — pattern to mirror for IMAP
- Warehouse supplier invoices (`WhSupplierInvoice`) — manual entry only, no PDF/IMAP/approval/export. Fundamentally different lifecycle.
- Suppliers stored as `CrmAddress` with `type = SUPPLIER | BOTH` — has `email`, `vatId`, `taxNumber`, `leitwegId`
- IBAN on `CrmBankAccount` (1:n to CrmAddress)
- Audit logging (`audit_logs` table + `audit-logs-service.ts`)
- Notification system (inline `prisma.notification.create` in domain services + PubSub SSE)
- Module gating (`requireModule()` + `tenant_modules` table, CHECK constraint currently: core/crm/billing/warehouse)
- Number sequences (`number_sequence_service.ts`, no `inbound_invoice` key yet)
- No IMAP libraries installed. No ZUGFeRD parsing. No Levenshtein/fuzzy matching.

### Key Discoveries:
- Latest migration: `20260411100001_add_email_permissions_to_groups.sql`
- SMTP config pattern: `email-smtp-config-repository.ts` / `email-smtp-config-service.ts` / `src/trpc/routers/email/smtpConfig.ts` — 1:1 mirror for IMAP
- Cron pattern: `src/app/api/cron/email-retry/route.ts` — `CRON_SECRET` auth, `runtime = "nodejs"`, `maxDuration = 300`
- Permission naming: `resource.action` (two-level, dot-separated), UUIDv5 deterministic
- Module keys: `AVAILABLE_MODULES` in `src/lib/modules/constants.ts`, CHECK constraint in `20260101000093_create_tenant_modules.sql`
- Tenant scoping: Repository-level `tenantId` in every `where` clause, `tenantScopedUpdate` helper
- Side-by-side UI: Only in `document-editor.tsx` (A4 canvas + collapsible sidebar)
- `vercel.json`: 7 existing crons, pattern `{ path, schedule }`

## Desired End State

A tenant admin can:
1. Configure an IMAP inbox (host, port, credentials) for receiving invoices
2. Test the IMAP connection
3. Configure approval threshold rules (amount ranges → number of approval steps → approver roles/users)
4. View the inbound email processing log for debugging

Any user with `inbound_invoices.upload` permission can:
1. Upload a PDF manually via drag & drop
2. System auto-extracts ZUGFeRD/XRechnung XML if present → fields pre-filled
3. Manual fallback: see PDF side-by-side, fill header + line items manually
4. System matches supplier via USt-ID > Steuernummer > Email-Domain > Fuzzy name match
5. If no match: prompt to create new or assign existing supplier

The system automatically:
- Polls IMAP every 3 minutes, extracts PDF/XML attachments, creates draft invoices
- Deduplicates via `(tenantId, supplierId, invoiceNumber)` and `(tenantId, sourceMessageId)`
- Triggers approval workflow based on amount thresholds
- Sends notifications to approvers, reminds after 24h
- Notifies admin after 3 consecutive IMAP poll failures

Users with `inbound_invoices.approve` permission can:
1. See invoices pending their approval
2. Approve or reject (with reason) each step

Users with `inbound_invoices.export` permission can:
1. Export approved invoices as DATEV Buchungsstapel CSV (Windows-1252, semicolon-delimited)

### Verification:
- `pnpm typecheck` passes
- `pnpm test` passes (new tests for parser, cron, approval, export)
- `pnpm lint` passes
- IMAP config works with Inbucket (IMAP port 54325)
- Manual upload + ZUGFeRD parsing works
- Approval workflow with multi-step thresholds works
- DATEV CSV is importable

## What We're NOT Doing

- **KI-gestützte PDF-Auslesung** (Claude API) — Phase 2
- **3-Way-Match** gegen Warehouse-Bestellungen/Wareneingänge — Phase 2
- **DATEV-Buchungssatz-Vorschläge** (Konto/Kostenstelle/Steuerschlüssel) — Phase 3
- **SEPA-XML-Generierung** — Phase 3
- **GoBD-Hash-Ketten-Archiv** — Phase 3
- **Skonto-Frist-Alarme** — Phase 2
- **Generischer E-Mail-Inbox-Layer** — IMAP-Poller bedient nur Eingangsrechnungs-Pipeline
- **Auto-Eskalation** an nächste Person — Phase 1 sendet nur Erinnerungen
- **Parallele Approvals** — Phase 1 nur sequentiell (Datenmodell erlaubt Parallel später)
- **Substitution / Vertretung** — Phase 2. Keine originalApproverId, isSubstitute, resolveSubstitute in Phase 1
- **Mehrwährung** — alles EUR
- **OCR für reine Bild-Dateien** — Phase 2
- **Lerneffekt-Tabelle** für Lieferanten-Patterns — Phase 2
- **Application-layer encryption** für IMAP-Passwörter — follow existing `proxyPassword` pattern

## Implementation Approach

Mirror the email-send infrastructure (ZMI-TICKET-141) for IMAP receiving. Build bottom-up: database → services → routers → hooks → UI. Use `imapflow` + `mailparser` for IMAP, `pdf-lib` + `fast-xml-parser` for ZUGFeRD parsing. New module key `inbound_invoices` with `requireModule` gating. Separate `InboundInvoice` table (not extending `WhSupplierInvoice`). Approval steps as first-class records in `inbound_invoice_approvals`.

---

## Phase 1: Database Schema & Migrations

### Overview
Create all new database tables, enums, indexes, permissions, module registration, storage bucket config, and number sequence. This is the foundation — everything else builds on it.

### Changes Required:

#### 1. Migration: Create inbound invoice tables
**File**: `supabase/migrations/20260413100000_create_inbound_invoice_tables.sql`

```sql
-- tenant_imap_configs: Per-tenant IMAP server configuration
CREATE TABLE tenant_imap_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  host VARCHAR(255) NOT NULL,
  port INTEGER NOT NULL DEFAULT 993,
  username VARCHAR(255) NOT NULL,
  password VARCHAR(500) NOT NULL,
  encryption VARCHAR(10) NOT NULL DEFAULT 'SSL' CHECK (encryption IN ('SSL', 'STARTTLS', 'NONE')),
  mailbox VARCHAR(255) NOT NULL DEFAULT 'INBOX',
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  -- IMAP polling state
  uid_validity BIGINT,
  uid_next INTEGER,
  last_poll_at TIMESTAMPTZ,
  last_poll_error TEXT,
  last_poll_error_at TIMESTAMPTZ,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

-- inbound_email_log: Log of all processed inbound emails
CREATE TABLE inbound_email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id VARCHAR(500),
  from_email VARCHAR(255),
  subject VARCHAR(500),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uid INTEGER,
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processed', 'failed', 'skipped_no_attachment', 'skipped_no_pdf', 'skipped_duplicate')),
  error_message TEXT,
  attachment_count INTEGER NOT NULL DEFAULT 0,
  invoice_id UUID,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inbound_email_log_tenant ON inbound_email_log(tenant_id, created_at DESC);
CREATE INDEX idx_inbound_email_log_status ON inbound_email_log(status) WHERE status IN ('pending', 'failed');
CREATE UNIQUE INDEX idx_inbound_email_log_message_id ON inbound_email_log(tenant_id, message_id) WHERE message_id IS NOT NULL;

-- inbound_invoices: Main inbound invoice table
CREATE TABLE inbound_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number VARCHAR(50) NOT NULL,
  -- Source tracking
  source VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (source IN ('imap', 'manual', 'zugferd')),
  source_email_log_id UUID REFERENCES inbound_email_log(id) ON DELETE SET NULL,
  source_message_id VARCHAR(500),
  -- Supplier
  supplier_id UUID REFERENCES crm_addresses(id) ON DELETE SET NULL,
  supplier_status VARCHAR(20) NOT NULL DEFAULT 'matched'
    CHECK (supplier_status IN ('matched', 'unknown', 'pending_review')),
  -- Invoice data
  invoice_number VARCHAR(100),
  invoice_date DATE,
  due_date DATE,
  total_net NUMERIC(12,2),
  total_vat NUMERIC(12,2),
  total_gross NUMERIC(12,2),
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  payment_term_days INTEGER,
  -- Seller info from ZUGFeRD (may not match CrmAddress yet)
  seller_name VARCHAR(255),
  seller_vat_id VARCHAR(50),
  seller_tax_number VARCHAR(50),
  seller_street VARCHAR(255),
  seller_zip VARCHAR(20),
  seller_city VARCHAR(100),
  seller_country VARCHAR(5),
  seller_iban VARCHAR(34),
  seller_bic VARCHAR(11),
  -- Buyer info from ZUGFeRD
  buyer_name VARCHAR(255),
  buyer_vat_id VARCHAR(50),
  buyer_reference VARCHAR(100),
  -- ZUGFeRD
  zugferd_profile VARCHAR(30),
  zugferd_raw_xml TEXT,
  -- PDF storage
  pdf_storage_path TEXT,
  pdf_original_filename VARCHAR(255),
  -- Workflow
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXPORTED', 'CANCELLED')),
  approval_version INTEGER NOT NULL DEFAULT 1,
  submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  -- DATEV
  datev_exported_at TIMESTAMPTZ,
  datev_exported_by UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Notes
  notes TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_inbound_invoices_tenant_status ON inbound_invoices(tenant_id, status);
CREATE INDEX idx_inbound_invoices_tenant_supplier ON inbound_invoices(tenant_id, supplier_id);
CREATE INDEX idx_inbound_invoices_tenant_date ON inbound_invoices(tenant_id, invoice_date DESC);
CREATE UNIQUE INDEX idx_inbound_invoices_dedup_supplier ON inbound_invoices(tenant_id, supplier_id, invoice_number)
  WHERE supplier_id IS NOT NULL AND invoice_number IS NOT NULL;
CREATE UNIQUE INDEX idx_inbound_invoices_dedup_message ON inbound_invoices(tenant_id, source_message_id)
  WHERE source_message_id IS NOT NULL;

-- inbound_invoice_line_items: Line items per invoice
CREATE TABLE inbound_invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES inbound_invoices(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  article_number VARCHAR(100),
  description TEXT,
  quantity NUMERIC(12,4),
  unit VARCHAR(20),
  unit_price_net NUMERIC(12,4),
  total_net NUMERIC(12,2),
  vat_rate NUMERIC(5,2),
  vat_amount NUMERIC(12,2),
  total_gross NUMERIC(12,2),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inbound_invoice_line_items_invoice ON inbound_invoice_line_items(invoice_id);

-- inbound_invoice_approval_policies: Configurable approval threshold rules
CREATE TABLE inbound_invoice_approval_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount_min NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_max NUMERIC(12,2),
  step_order INTEGER NOT NULL DEFAULT 1,
  approver_group_id UUID REFERENCES user_groups(id) ON DELETE SET NULL,
  approver_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (approver_group_id IS NOT NULL OR approver_user_id IS NOT NULL)
);

CREATE INDEX idx_approval_policies_tenant ON inbound_invoice_approval_policies(tenant_id, is_active, amount_min, amount_max);

-- inbound_invoice_approvals: Individual approval step records
CREATE TABLE inbound_invoice_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES inbound_invoices(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  approval_version INTEGER NOT NULL,
  -- Who should approve
  approver_group_id UUID REFERENCES user_groups(id) ON DELETE SET NULL,
  approver_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Decision
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'INVALIDATED')),
  decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  rejection_reason TEXT,
  -- Escalation
  due_at TIMESTAMPTZ,
  last_reminder_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_approvals_invoice ON inbound_invoice_approvals(invoice_id, approval_version, step_order);
CREATE INDEX idx_approvals_pending ON inbound_invoice_approvals(tenant_id, status, due_at)
  WHERE status = 'PENDING';
CREATE INDEX idx_approvals_approver ON inbound_invoice_approvals(approver_user_id, status)
  WHERE status = 'PENDING';
```

#### 2. Migration: Add permissions + module
**File**: `supabase/migrations/20260413100001_add_inbound_invoice_permissions_and_module.sql`

```sql
-- Add 'inbound_invoices' to tenant_modules CHECK constraint
ALTER TABLE tenant_modules DROP CONSTRAINT IF EXISTS tenant_modules_module_check;
ALTER TABLE tenant_modules ADD CONSTRAINT tenant_modules_module_check
  CHECK (module IN ('core', 'crm', 'billing', 'warehouse', 'inbound_invoices'));

-- Add number sequence default prefix for inbound invoices
INSERT INTO number_sequences (tenant_id, key, prefix, next_value)
SELECT t.id, 'inbound_invoice', 'ER-', 1
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM number_sequences ns WHERE ns.tenant_id = t.id AND ns.key = 'inbound_invoice'
);

-- Permissions: Register keys in permission-catalog.ts FIRST, then compute UUIDs
-- via uuidv5(key, 'f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1') and write as string
-- literals below. Follow EXACTLY the pattern in 20260411100001_add_email_permissions_to_groups.sql.
-- NO placeholders — compute real UUIDs before writing this migration.
--
-- Keys to register and compute:
--   inbound_invoices.view, inbound_invoices.upload, inbound_invoices.edit,
--   inbound_invoices.approve, inbound_invoices.export, inbound_invoices.manage,
--   email_imap.view, email_imap.manage
--
-- Group assignments:
--   ADMIN:        all 8
--   BUCHHALTUNG:  view, upload, edit, approve, export, email_imap.view
--   VORGESETZTER: view, approve
--   PERSONAL:     view, upload, edit, approve
--
-- Use the exact UPDATE pattern from 20260411100001:
--   UPDATE user_groups SET permissions = (
--     SELECT jsonb_agg(DISTINCT val) FROM (
--       SELECT jsonb_array_elements(permissions) AS val
--       UNION ALL SELECT '"<real-uuid>"'::jsonb
--       ...
--     ) sub
--   ) WHERE code = '<GROUP>' AND tenant_id IS NULL;
```

#### 3. Prisma schema additions
**File**: `prisma/schema.prisma`

Add 6 new models: `TenantImapConfig`, `InboundEmailLog`, `InboundInvoice`, `InboundInvoiceLineItem`, `InboundInvoiceApprovalPolicy`, `InboundInvoiceApproval`. Add back-references on `Tenant`, `User`, and `CrmAddress` models.

#### 4. Permission catalog
**File**: `src/lib/auth/permission-catalog.ts`

Add to `ALL_PERMISSIONS`:
```typescript
// Inbound Invoices
p("inbound_invoices.view", "inbound_invoices", "view", "View inbound invoices"),
p("inbound_invoices.upload", "inbound_invoices", "upload", "Upload inbound invoices"),
p("inbound_invoices.edit", "inbound_invoices", "edit", "Edit inbound invoices"),
p("inbound_invoices.approve", "inbound_invoices", "approve", "Approve inbound invoices"),
p("inbound_invoices.export", "inbound_invoices", "export", "Export inbound invoices"),
p("inbound_invoices.manage", "inbound_invoices", "manage", "Manage inbound invoices"),
p("email_imap.view", "email_imap", "view", "View IMAP configuration"),
p("email_imap.manage", "email_imap", "manage", "Manage IMAP configuration"),
```

#### 5. Module constant
**File**: `src/lib/modules/constants.ts`

Add `"inbound_invoices"` to `AVAILABLE_MODULES`.

#### 6. Number sequence default prefix
**File**: `src/lib/services/number-sequence-service.ts`

Add to `DEFAULT_PREFIXES`:
```typescript
inbound_invoice: "ER-",
```

#### 7. Storage bucket config
**File**: `supabase/config.toml`

Add new bucket:
```toml
[storage.buckets.inbound-invoices]
public = false
file_size_limit = "20MiB"
allowed_mime_types = ["application/pdf", "text/xml", "application/xml", "image/jpeg", "image/png"]
```

#### 8. GreenMail for IMAP development
**File**: `docker/docker-compose.yml`

GreenMail provides SMTP + IMAP for local dev. Added as `greenmail` service in docker-compose.yml.
Standalone: `docker run -d --name greenmail --network host -e GREENMAIL_OPTS='-Dgreenmail.setup.test.all -Dgreenmail.users=test:test@test.local' greenmail/standalone:latest`

GreenMail endpoints:
- SMTP: `127.0.0.1:3025`
- IMAP: `127.0.0.1:3143` (plain, encryption=NONE)
- IMAPS: `127.0.0.1:3993` (SSL, self-signed)

Test user: `test` / `test`

### Success Criteria:

#### Automated Verification:
- [x] Migration applies cleanly: `pnpm db:reset`
- [x] Prisma client regenerates: `pnpm db:generate`
- [x] Type checking passes: `pnpm typecheck`
- [x] Lint passes: `pnpm lint`

#### Manual Verification:
- [ ] New tables visible in Prisma Studio: `pnpm db:studio`
- [ ] `inbound-invoices` bucket exists in Supabase Storage
- [x] GreenMail IMAP reachable on port 3143

**Implementation Note**: Pause after this phase. All subsequent phases depend on the schema being correct.

---

## Phase 2: IMAP Config Backend

### Overview
Build the IMAP config service, repository, and tRPC router — a 1:1 mirror of the SMTP config pattern. Install `imapflow` and `mailparser`.

### Changes Required:

#### 1. Install dependencies
```bash
pnpm add imapflow mailparser
pnpm add -D @types/mailparser
```

(`imapflow` ships its own TypeScript definitions.)

#### 2. IMAP Config Repository
**File**: `src/lib/services/email-imap-config-repository.ts`

Mirror `email-smtp-config-repository.ts`:
```typescript
function findByTenantId(prisma: PrismaClient, tenantId: string): Promise<TenantImapConfig | null>
function upsert(prisma: PrismaClient, tenantId: string, data: ImapConfigUpsertData): Promise<TenantImapConfig>
function findAllActive(prisma: PrismaClient): Promise<TenantImapConfig[]>  // for cron — no tenantId filter
function updatePollState(prisma: PrismaClient, id: string, state: PollStateUpdate): Promise<void>
```

`findAllActive` returns configs where `is_active = true`. Used by the IMAP poll cron (cross-tenant).
`updatePollState` writes `uid_validity`, `uid_next`, `last_poll_at`, `last_poll_error`, `consecutive_failures`.

#### 3. IMAP Config Service
**File**: `src/lib/services/email-imap-config-service.ts`

```typescript
const CREDENTIAL_FIELDS = ["host", "port", "username", "password", "encryption"]

function get(prisma, tenantId): Promise<TenantImapConfig | null>
function upsert(prisma, tenantId, input, audit?): Promise<TenantImapConfig>
  // Detects credential changes via CREDENTIAL_FIELDS, resets isVerified
function testConnection(prisma, tenantId): Promise<{ success: true; messageCount: number }>
  // Creates ImapFlow client, connects, opens mailbox, reads status, disconnects
  // On success: sets isVerified=true, verifiedAt
  // On failure: throws ImapConnectionError
function createImapClient(config: TenantImapConfig): ImapFlow
  // Builds ImapFlow instance from config with conditional TLS
```

Error classes: `ImapNotConfiguredError`, `ImapConnectionError`.

#### 4. IMAP Config tRPC Router
**File**: `src/trpc/routers/invoices/imapConfig.ts`

```typescript
const IMAP_VIEW = permissionIdByKey("email_imap.view")!
const IMAP_MANAGE = permissionIdByKey("email_imap.manage")!
const invProcedure = tenantProcedure.use(requireModule("inbound_invoices"))

get: invProcedure.use(requirePermission(IMAP_VIEW)).query(...)
  // Returns mapToOutput(config) — password masked as hasPassword: boolean

upsert: invProcedure.use(requirePermission(IMAP_MANAGE)).input(upsertSchema).mutation(...)
  // Zod schema: host, port, username, password?, encryption, mailbox

testConnection: invProcedure.use(requirePermission(IMAP_MANAGE)).mutation(...)
  // Returns { success: true, messageCount }
```

`mapToOutput`: Same pattern as SMTP — excludes `password`, `uidValidity`, `uidNext`, adds `hasPassword: boolean`.

#### 5. Invoices Router Index
**File**: `src/trpc/routers/invoices/index.ts`

```typescript
export const invoicesRouter = createTRPCRouter({
  imapConfig: imapConfigRouter,
  // inbound, approvalPolicy added in later phases
})
```

Mount in `src/trpc/routers/_app.ts` as `invoices: invoicesRouter`.

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Lint passes: `pnpm lint`
- [x] Unit tests: IMAP config CRUD, testConnection with mocked imapflow, password exclusion

#### Manual Verification:
- [x] `testConnection` succeeds against GreenMail IMAP (`127.0.0.1:3143`, user: `test`, pass: `test`, encryption: NONE)
- [x] Password excluded from `get` response (`hasPassword: true`, no `password` field)

**Implementation Note**: Pause for IMAP connectivity test with GreenMail.

---

## Phase 3: ZUGFeRD/XRechnung Parser Service

### Overview
Build the PDF attachment extractor and CII XML parser. Pure functions, no database interaction. Install `pdf-lib` and `fast-xml-parser`.

### Changes Required:

#### 1. Install dependencies
```bash
pnpm add pdf-lib fast-xml-parser
```

#### 2. PDF Attachment Extractor
**File**: `src/lib/services/zugferd-pdf-extractor.ts`

```typescript
interface PdfAttachment {
  filename: string
  content: Buffer
  contentType: string
}

function extractAttachments(pdfBuffer: Buffer): Promise<PdfAttachment[]>
  // Uses pdf-lib: PDFDocument.load → catalog.EmbeddedFiles → name tree → extract streams
  // Returns all embedded files

function extractZugferdXml(pdfBuffer: Buffer): Promise<Buffer | null>
  // Calls extractAttachments, filters for known ZUGFeRD filenames:
  // 'factur-x.xml', 'ZUGFeRD-invoice.xml', 'zugferd-invoice.xml', 'xrechnung.xml'
  // Returns first match or null
```

#### 3. CII XML Parser
**File**: `src/lib/services/zugferd-xml-parser.ts`

```typescript
interface ParsedInvoice {
  // Header
  invoiceNumber: string | null      // BT-1
  invoiceDate: string | null        // BT-2 (YYYYMMDD → ISO date)
  invoiceTypeCode: string | null    // BT-3
  currency: string | null           // BT-5
  dueDate: string | null            // BT-9
  // Seller (BG-4)
  sellerName: string | null         // BT-27
  sellerVatId: string | null        // BT-31
  sellerTaxNumber: string | null    // BT-32
  sellerStreet: string | null       // BT-35
  sellerZip: string | null          // BT-38
  sellerCity: string | null         // BT-37
  sellerCountry: string | null      // BT-40
  sellerIban: string | null         // BT-84
  sellerBic: string | null          // BT-86
  // Buyer (BG-7)
  buyerName: string | null          // BT-44
  buyerVatId: string | null         // BT-48
  buyerReference: string | null     // BT-10 (Leitweg-ID)
  // Totals (BG-22)
  totalNet: number | null           // BT-109
  totalVat: number | null           // BT-110
  totalGross: number | null         // BT-112
  amountDue: number | null          // BT-115
  // Payment terms
  paymentTermDays: number | null
  // Line items (BG-25)
  lineItems: ParsedLineItem[]
  // Meta
  profile: string | null            // ZUGFeRD profile detected
}

interface ParsedLineItem {
  lineId: string | null             // BT-126
  description: string | null        // BT-153
  quantity: number | null           // BT-129
  unit: string | null               // BT-130
  unitPriceNet: number | null       // BT-146
  totalNet: number | null           // BT-131
  vatRate: number | null            // BT-152
  vatAmount: number | null          // BT-117 per line
  articleNumber: string | null      // BT-155 (Seller item number)
}

function parseZugferdXml(xmlBuffer: Buffer): ParsedInvoice
  // Uses fast-xml-parser to parse CII XML
  // Navigates: rsm:CrossIndustryInvoice > rsm:SupplyChainTradeTransaction
  // Extracts all fields from BG-4 (Seller), BG-7 (Buyer), BG-22 (Totals), BG-25 (Lines)
  // Handles namespace prefixes: rsm:, ram:, udt:
  // Returns ParsedInvoice with nulls for missing fields

function detectProfile(xmlBuffer: Buffer): string | null
  // Reads GuidelineSpecifiedDocumentContextParameter.ID
  // Maps to profile name: MINIMUM, BASIC_WL, BASIC, EN16931, EXTENDED, XRECHNUNG
```

#### 4. Combined Parser Service
**File**: `src/lib/services/zugferd-parser-service.ts`

```typescript
interface ZugferdParseResult {
  hasZugferd: boolean
  parsedInvoice: ParsedInvoice | null
  rawXml: string | null
  profile: string | null
  parseErrors: string[]
}

function parsePdfForZugferd(pdfBuffer: Buffer): Promise<ZugferdParseResult>
  // 1. extractZugferdXml(pdfBuffer)
  // 2. If XML found: parseZugferdXml(xmlBuffer), detectProfile(xmlBuffer)
  // 3. Return result with error tracking (invalid XML, missing required fields)

function parseStandaloneXml(xmlBuffer: Buffer): ZugferdParseResult
  // For standalone XRechnung XML files received via email
```

#### 5. Test fixtures
**Directory**: `src/lib/services/__tests__/fixtures/zugferd/`

Place 3–4 sample ZUGFeRD PDF/XML files:
- `en16931-sample.pdf` — EN16931 profile with embedded XML
- `basic-sample.pdf` — BASIC profile
- `xrechnung-sample.xml` — Standalone XRechnung XML
- `plain-pdf.pdf` — PDF without embedded XML (negative test)

**User provides these fixtures manually** before Phase 3 starts. Do NOT generate them. If they are missing, ask the user.

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Lint passes: `pnpm lint`
- [x] Unit tests (11 passing):
  - `extractZugferdXml`: extracts XML from EN16931 PDF, returns null for plain PDF
  - `parseZugferdXml`: parses all mandatory BT fields from EN16931 sample
  - `parseZugferdXml`: handles BASIC profile (no line items allowed if missing)
  - `detectProfile`: correctly identifies EN16931, BASIC, EXTENDED, XRECHNUNG
  - `parsePdfForZugferd`: end-to-end PDF → ParsedInvoice
  - `parseStandaloneXml`: parses standalone XRechnung XML

#### Manual Verification:
- [x] Parser correctly handles real-world ZUGFeRD invoices (27 fixtures, EN16931 + XRECHNUNG verified)

**Implementation Note**: Pause for parser validation with test fixtures.

---

## Phase 4: IMAP Poll Cron + Inbound Email Log

### Overview
Build the IMAP polling cron job and supplier matching service. Polls all active tenant IMAP configs, extracts PDF/XML attachments, matches suppliers, creates draft InboundInvoice records.

### Changes Required:

#### 1. Install fastest-levenshtein
```bash
pnpm add fastest-levenshtein
```

#### 2. Supplier Matching Service
**File**: `src/lib/services/inbound-invoice-supplier-matcher.ts`

```typescript
import { distance } from 'fastest-levenshtein'

interface SupplierMatchResult {
  supplierId: string | null
  matchMethod: 'vat_id' | 'tax_number' | 'email_domain' | 'fuzzy_name' | null
  confidence: number  // 0.0 to 1.0
}

function matchSupplier(
  prisma: PrismaClient,
  tenantId: string,
  parsed: ParsedInvoice,
  senderEmail: string | null
): Promise<SupplierMatchResult>
  // Matching order (first match wins):
  // 1. parsed.sellerVatId → CrmAddress.vatId (exact, case-insensitive)
  // 2. parsed.sellerTaxNumber → CrmAddress.taxNumber (exact)
  // 3. senderEmail domain → CrmAddress.email domain
  // 4. parsed.sellerName → CrmAddress.company (Levenshtein similarity > 0.85)
  // All queries scoped to tenantId + type IN (SUPPLIER, BOTH) + isActive

function levenshteinSimilarity(a: string, b: string): number
  // Uses fastest-levenshtein distance(), normalized to 0–1:
  // 1 - (distance(a.toLowerCase().trim(), b.toLowerCase().trim()) / Math.max(a.length, b.length))
```

#### 2. Inbound Email Log Repository
**File**: `src/lib/services/inbound-email-log-repository.ts`

```typescript
function create(prisma, tenantId, data): Promise<InboundEmailLog>
function findByMessageId(prisma, tenantId, messageId): Promise<InboundEmailLog | null>
function markProcessed(prisma, id, invoiceId): Promise<void>
function markFailed(prisma, id, errorMessage): Promise<void>
function markSkipped(prisma, id, status: 'skipped_no_attachment' | 'skipped_no_pdf' | 'skipped_duplicate'): Promise<void>
function findMany(prisma, tenantId, filters?, pagination?): Promise<{ items, total }>
  // For admin debug view. Filters: status, dateRange, search (from_email, subject)
```

#### 3. IMAP Poll Service
**File**: `src/lib/services/email-imap-poll-service.ts`

```typescript
function pollInbox(prisma: PrismaClient, config: TenantImapConfig): Promise<PollResult>
  // 1. Create ImapFlow client from config
  // 2. Connect, getMailboxLock('INBOX')
  // 3. Check uidValidity — if changed, reset state
  // 4. Fetch messages in range storedUidNext:*
  // 5. For each message:
  //    a. Check dedup: findByMessageId(messageId)
  //    b. Parse with simpleParser (mailparser)
  //    c. Filter attachments: PDF and XML only
  //    d. If no PDF attachment: log as skipped_no_attachment / skipped_no_pdf
  //    e. Check attachment size: if > 20 MB → markFailed(id, 'attachment_too_large'), skip
  //    f. Upload PDF to storage: inbound-invoices/{tenantId}/{invoiceId}/{filename}
  //    f. Parse for ZUGFeRD XML
  //    g. Match supplier
  //    h. Create InboundInvoice (status: DRAFT, source: 'imap')
  //    i. If ZUGFeRD found: create line items, set source: 'zugferd'
  //    j. Update email log: markProcessed
  // 6. Update poll state: uidValidity, uidNext, lastPollAt, resetConsecutiveFailures
  // 7. Release lock, logout

interface PollResult {
  processed: number
  skipped: number
  failed: number
  errors: string[]
}
```

#### 4. IMAP Poll Cron Route
**File**: `src/app/api/cron/email-imap-poll/route.ts`

```typescript
export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(request: Request) {
  // 1. CRON_SECRET auth guard (same pattern as email-retry)
  // 2. imapConfigRepo.findAllActive(prisma) — cross-tenant
  // 3. For each config: try { pollInbox(prisma, config) } catch { updateConsecutiveFailures }
  // 4. If consecutiveFailures >= 3: send error notification to users with email_imap.manage permission
  // 5. Return summary JSON
}
```

#### 5. Register cron in vercel.json
**File**: `vercel.json`

Add:
```json
{ "path": "/api/cron/email-imap-poll", "schedule": "*/3 * * * *" }
```

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Lint passes: `pnpm lint`
- [x] Unit tests:
  - `matchSupplier`: vatId match, taxNumber match, email domain match, fuzzy name match, no match
  - `levenshteinSimilarity`: known pairs with expected scores
  - `pollInbox` with mocked imapflow/mailparser: processes new mail, skips seen, handles no-attachment
  - Cron route: CRON_SECRET guard, processes multiple tenants, handles errors

#### Integration Tests (replace manual verification):
- [x] Plain PDF without ZUGFeRD → source=imap, no line items, pdf_storage_path set
- [x] ZUGFeRD EN16931 PDF → source=zugferd, profile=EN16931, fields pre-filled, line items created
- [x] Plain-text email without attachments → skipped_no_attachment in log, no invoice
- [x] Dedup via Message-ID → second poll skips, invoice count unchanged
- [x] Attachment > 20 MB → failed with "too_large", no invoice
- [x] Supplier match by VAT ID → supplierId set, supplierStatus=matched

**Implementation Note**: Pause for end-to-end IMAP test with GreenMail.

---

## Phase 5: InboundInvoice CRUD Backend

### Overview
Build the core CRUD service, repository, and tRPC router for inbound invoices. Includes manual upload, edit, delete, duplicate check, and line item management.

### Changes Required:

#### 1. InboundInvoice Repository
**File**: `src/lib/services/inbound-invoice-repository.ts`

```typescript
function create(prisma, tenantId, data): Promise<InboundInvoice>
function findById(prisma, tenantId, id): Promise<InboundInvoice | null>
  // Includes: supplier, lineItems, approvals, createdByUser
function findMany(prisma, tenantId, filters?, pagination?): Promise<{ items, total }>
  // Filters: status, supplierId, search (invoiceNumber, sellerName), dateRange, supplierStatus
function update(prisma, tenantId, id, data): Promise<InboundInvoice>
  // Uses tenantScopedUpdate helper
function updateStatus(prisma, tenantId, id, status): Promise<void>
function remove(prisma, tenantId, id): Promise<void>
  // Hard delete, only DRAFT/REJECTED allowed
function checkDuplicateSupplier(prisma, tenantId, supplierId, invoiceNumber): Promise<boolean>
function checkDuplicateMessageId(prisma, tenantId, messageId): Promise<boolean>
```

#### 2. InboundInvoice Line Item Repository
**File**: `src/lib/services/inbound-invoice-line-item-repository.ts`

```typescript
function createMany(prisma, invoiceId, items: LineItemInput[]): Promise<void>
function findByInvoiceId(prisma, invoiceId): Promise<InboundInvoiceLineItem[]>
function deleteByInvoiceId(prisma, invoiceId): Promise<void>
function replaceAll(prisma, invoiceId, items: LineItemInput[]): Promise<void>
  // Delete existing + create new in transaction
```

#### 3. InboundInvoice Service
**File**: `src/lib/services/inbound-invoice-service.ts`

```typescript
const MATERIAL_FIELDS = ['totalNet', 'totalVat', 'totalGross', 'supplierId', 'dueDate'] as const
const TRACKED_FIELDS = [
  'invoiceNumber', 'invoiceDate', 'dueDate', 'totalNet', 'totalVat', 'totalGross',
  'supplierId', 'paymentTermDays', 'notes', 'status'
] as const

function createFromUpload(prisma, tenantId, file: Buffer, filename: string, userId: string, audit?): Promise<InboundInvoice>
  // 1. Upload PDF to storage: inbound-invoices/{tenantId}/{newId}/{filename}
  // 2. Parse for ZUGFeRD
  // 3. Match supplier
  // 4. Generate number via numberSequenceService.getNextNumber('inbound_invoice')
  // 5. Create InboundInvoice (status: DRAFT, source: zugferd/manual)
  // 6. If ZUGFeRD: create line items
  // 7. Check duplicate (supplierId + invoiceNumber) — throw ConflictError if exists
  // 8. Audit log
  // 9. Return created invoice

function getById(prisma, tenantId, id): Promise<InboundInvoice>
  // Throws NotFoundError if not found

function list(prisma, tenantId, filters?, pagination?): Promise<{ items, total }>

function update(prisma, tenantId, id, data, audit?): Promise<InboundInvoice>
  // Guards: only DRAFT or REJECTED status
  // Check if material fields changed → increment approvalVersion, invalidate approvals
  // Audit log with computeChanges

function updateLineItems(prisma, tenantId, invoiceId, items: LineItemInput[], audit?): Promise<void>
  // Guards: only DRAFT or REJECTED
  // Validate: if items provided, sum must match header totals (±0.01)
  // Replace all line items

function submitForApproval(prisma, tenantId, id, userId, audit?): Promise<InboundInvoice>
  // Guards: status must be DRAFT or REJECTED, supplier must be matched
  // Required fields: invoiceNumber, invoiceDate, totalGross, supplierId
  // Sets submittedBy, submittedAt
  // Creates approval steps from policy (see Phase 6)
  // Sets status: PENDING_APPROVAL
  // Sends notifications to first-step approvers

function assignSupplier(prisma, tenantId, id, supplierId, audit?): Promise<InboundInvoice>
  // For SUPPLIER_UNKNOWN invoices: link to existing CrmAddress
  // Sets supplierStatus: 'matched'

function reopenExported(prisma, tenantId, id, audit?): Promise<InboundInvoice>
  // Guards: status must be EXPORTED
  // Sets status back to DRAFT, clears datevExportedAt/datevExportedBy
  // Permission: inbound_invoices.manage
  // Audit log mandatory

function cancel(prisma, tenantId, id, audit?): Promise<void>
  // Sets status: CANCELLED

function remove(prisma, tenantId, id, audit?): Promise<void>
  // Guards: only DRAFT
  // Remove from storage + DB

function getUploadUrl(prisma, tenantId): Promise<{ signedUrl, storagePath, token }>
  // For 3-step client-side upload pattern

function getPdfSignedUrl(prisma, tenantId, id): Promise<{ signedUrl: string; filename: string } | null>
  // Creates signed read URL with 3600s expiry for PDF iframe
```

Error classes: `InboundInvoiceNotFoundError`, `InboundInvoiceValidationError`, `InboundInvoiceConflictError`, `InboundInvoiceDuplicateError`.

#### 4. InboundInvoice tRPC Router
**File**: `src/trpc/routers/invoices/inbound.ts`

```typescript
const invProcedure = tenantProcedure.use(requireModule("inbound_invoices"))

list: invProcedure.use(requirePermission(VIEW)).input(listSchema).query(...)
getById: invProcedure.use(requirePermission(VIEW)).input(z.object({ id: z.string().uuid() })).query(...)
getUploadUrl: invProcedure.use(requirePermission(UPLOAD)).input(uploadUrlSchema).mutation(...)
createFromUpload: invProcedure.use(requirePermission(UPLOAD)).input(createFromUploadSchema).mutation(...)
update: invProcedure.use(requirePermission(EDIT)).input(updateSchema).mutation(...)
updateLineItems: invProcedure.use(requirePermission(EDIT)).input(lineItemsSchema).mutation(...)
assignSupplier: invProcedure.use(requirePermission(EDIT)).input(assignSupplierSchema).mutation(...)
submitForApproval: invProcedure.use(requirePermission(EDIT)).input(submitSchema).mutation(...)
reopenExported: invProcedure.use(requirePermission(MANAGE)).input(z.object({ id: z.string().uuid() })).mutation(...)
cancel: invProcedure.use(requirePermission(MANAGE)).input(cancelSchema).mutation(...)
remove: invProcedure.use(requirePermission(MANAGE)).input(removeSchema).mutation(...)
getPdfUrl: invProcedure.use(requirePermission(VIEW)).input(z.object({ id: z.string().uuid() })).query(...)
```

Update `src/trpc/routers/invoices/index.ts`:
```typescript
export const invoicesRouter = createTRPCRouter({
  imapConfig: imapConfigRouter,
  inbound: inboundInvoiceRouter,
})
```

#### 5. React hooks
**File**: `src/hooks/useInboundInvoices.ts`

Thin tRPC wrappers for all procedures (following the existing hooks pattern in `src/hooks/`).

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Lint passes: `pnpm lint`
- [x] Unit tests (14 passing):
  - `createFromUpload`: PDF stored, ZUGFeRD parsed, supplier matched, invoice created
  - `createFromUpload`: line items created when ZUGFeRD detected
  - `createFromUpload`: DuplicateError on duplicate (supplierId, invoiceNumber)
  - `update`: material field change increments approvalVersion
  - `update`: non-material change does not increment approvalVersion
  - `update`: rejects non-DRAFT/REJECTED invoices
  - `submitForApproval`: requires matched supplier, invoice number, date, totalGross
  - `submitForApproval`: sets status PENDING_APPROVAL on valid submit
  - `updateLineItems`: sum mismatch → ValidationError (±0.01 tolerance)
  - `updateLineItems`: accepts sum within tolerance
  - `remove`: only DRAFT allowed, removes storage + DB
  - `reopenExported`: rejects non-EXPORTED invoices

**Implementation Note**: Pause for CRUD validation.

---

## Phase 6: Approval Workflow Backend

### Overview
Build the approval policy service, step creation, approve/reject/substitute logic, snapshot-hash version tracking, and submitter ≠ approver guard.

### Changes Required:

#### 1. Approval Policy Repository
**File**: `src/lib/services/inbound-invoice-approval-policy-repository.ts`

```typescript
function findByTenant(prisma, tenantId): Promise<InboundInvoiceApprovalPolicy[]>
function findForAmount(prisma, tenantId, grossAmount: number): Promise<InboundInvoiceApprovalPolicy[]>
  // WHERE is_active = true AND amount_min <= grossAmount AND (amount_max IS NULL OR amount_max >= grossAmount)
  // ORDER BY step_order ASC
function create(prisma, tenantId, data): Promise<InboundInvoiceApprovalPolicy>
function update(prisma, tenantId, id, data): Promise<InboundInvoiceApprovalPolicy>
function remove(prisma, tenantId, id): Promise<void>
```

#### 2. Approval Repository
**File**: `src/lib/services/inbound-invoice-approval-repository.ts`

```typescript
function createMany(prisma, invoiceId, tenantId, steps: ApprovalStepInput[]): Promise<void>
function findByInvoiceId(prisma, invoiceId, approvalVersion?): Promise<InboundInvoiceApproval[]>
function findPendingForUser(prisma, tenantId, userId): Promise<InboundInvoiceApproval[]>
  // PENDING steps where approver_user_id = userId OR user is member of approver_group_id
function findNextPending(prisma, invoiceId, approvalVersion): Promise<InboundInvoiceApproval | null>
function updateDecision(prisma, id, decision: { status, decidedBy, rejectionReason? }): Promise<void>
function invalidateByVersion(prisma, invoiceId, belowVersion: number): Promise<number>
  // UPDATE ... SET status = 'INVALIDATED' WHERE approval_version < belowVersion
function findOverdueSteps(prisma, limit?): Promise<InboundInvoiceApproval[]>
  // status = 'PENDING' AND due_at < now()
function updateLastReminderAt(prisma, id): Promise<void>
```

#### 3. Approval Workflow Service
**File**: `src/lib/services/inbound-invoice-approval-service.ts`

```typescript
const DEFAULT_ESCALATION_HOURS = 24

function createApprovalSteps(prisma, tenantId, invoiceId, grossAmount: number, approvalVersion: number): Promise<void>
  // 1. Load policies for amount via approvalPolicyRepo.findForAmount
  // 2. If no policies: auto-approve (set invoice status to APPROVED directly)
  // 3. For each policy step: create InboundInvoiceApproval record
  //    - If approverGroupId: store group reference, members resolved at authorization check time
  //    - If approverUserId: use directly
  //    - Set due_at = now + escalationThresholdHours
  // 4. Set invoice status to PENDING_APPROVAL

function approve(prisma, tenantId, invoiceId, approvalId, userId, audit?): Promise<InboundInvoice>
  // Guards:
  //   - Approval must be PENDING
  //   - Approval must belong to this invoice
  //   - approvalVersion must match invoice.approvalVersion
  //   - userId must be authorized (matching approverUserId, or member of approverGroupId)
  //   - userId !== invoice.submittedBy (submitter ≠ approver guard)
  // Actions:
  //   - Set approval status: APPROVED, decidedBy, decidedAt
  //   - Check if all steps for this version are APPROVED
  //   - If yes: set invoice status to APPROVED
  //   - If no: send notification to next pending step's approver
  //   - Audit log

function reject(prisma, tenantId, invoiceId, approvalId, userId, reason: string, audit?): Promise<InboundInvoice>
  // Same guards as approve
  // Actions:
  //   - Set approval status: REJECTED, decidedBy, decidedAt, rejectionReason
  //   - Set invoice status: REJECTED
  //   - Send notification to submittedBy user
  //   - Audit log

function handleMaterialChange(prisma, tenantId, invoiceId, newVersion: number): Promise<void>
  // Called by inbound-invoice-service.update when material fields change
  // 1. invalidateByVersion(invoiceId, newVersion)
  // 2. If invoice was PENDING_APPROVAL: set status back to DRAFT
  // 3. Audit log: "Approval workflow reset due to material change"

function isUserAuthorized(prisma, tenantId, approval: InboundInvoiceApproval, userId: string): Promise<boolean>
  // 1. Direct match: approval.approverUserId === userId
  // 2. Group match: user is member of approval.approverGroupId (JOIN user_group_members)
```

#### 4. Approval Policy tRPC Router
**File**: `src/trpc/routers/invoices/approvalPolicy.ts`

```typescript
const invProcedure = tenantProcedure.use(requireModule("inbound_invoices"))

list: invProcedure.use(requirePermission(MANAGE)).query(...)
create: invProcedure.use(requirePermission(MANAGE)).input(createSchema).mutation(...)
update: invProcedure.use(requirePermission(MANAGE)).input(updateSchema).mutation(...)
remove: invProcedure.use(requirePermission(MANAGE)).input(removeSchema).mutation(...)
```

#### 5. Approval procedures on inbound router
**File**: `src/trpc/routers/invoices/inbound.ts` (add to existing)

```typescript
approve: invProcedure.use(requirePermission(APPROVE)).input(approveSchema).mutation(...)
reject: invProcedure.use(requirePermission(APPROVE)).input(rejectSchema).mutation(...)
pendingApprovals: invProcedure.use(requirePermission(APPROVE)).query(...)
  // Returns invoices pending the current user's approval
approvalHistory: invProcedure.use(requirePermission(VIEW)).input(z.object({ invoiceId: z.string().uuid() })).query(...)
```

Update `src/trpc/routers/invoices/index.ts`:
```typescript
export const invoicesRouter = createTRPCRouter({
  imapConfig: imapConfigRouter,
  inbound: inboundInvoiceRouter,
  approvalPolicy: approvalPolicyRouter,
})
```

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Lint passes: `pnpm lint`
- [x] Integration tests (9 passing, replace manual verification):
  - Auto-approve when no policies exist
  - Single-step approval: create step, approve → APPROVED
  - Two-step approval: 2 policies, approve sequentially → APPROVED
  - Rejection → REJECTED with reason
  - Submitter ≠ approver guard: throws when same user
  - Unauthorized user cannot approve
  - Group membership authorization (user in approverGroup)
  - Material change invalidates approvals
  - findPendingForUser returns correct steps

**Implementation Note**: Pause for workflow validation.

---

## Phase 7: Escalation Cron + Notifications

### Overview
Build the escalation cron job that reminds approvers of overdue approval steps, and integrate notifications throughout the approval workflow.

### Changes Required:

#### 1. Escalation Cron Route
**File**: `src/app/api/cron/inbound-invoice-escalations/route.ts`

```typescript
export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(request: Request) {
  // 1. CRON_SECRET auth guard
  // 2. Find overdue PENDING approvals: due_at < now()
  // 3. For each: check lastReminderAt — skip if < 24h ago
  // 4. Send reminder notification (type: "reminders") to approver
  // 5. Update lastReminderAt
  // 6. Publish PubSub unread count update
  // 7. Return summary
}
```

#### 2. Register cron
**File**: `vercel.json`

```json
{ "path": "/api/cron/inbound-invoice-escalations", "schedule": "0 * * * *" }
```

#### 3. Notification integration in approval service
Add notification creation at these points (following the `absences-service.ts` pattern — inline `prisma.notification.create` + `hub.publish`):

- **submitForApproval** → notify first-step approver(s): `type: "approvals"`, link to invoice detail
- **approve** (not final) → notify next-step approver: `type: "approvals"`
- **approve** (final) → notify submitter: `type: "approvals"`, message "Rechnung XY wurde freigegeben"
- **reject** → notify submitter: `type: "approvals"`, message includes rejection reason
- **escalation cron** → remind approver: `type: "reminders"`
- **IMAP 3x failure** → notify users with `email_imap.manage`: `type: "errors"`

#### 4. PubSub integration
After each notification creation, call `publishUnreadCountUpdate` (pattern from `absences-service.ts:18-39`).

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Lint passes: `pnpm lint`
- [x] Integration tests (5 passing, replace manual verification):
  - Escalation cron: sends reminder for overdue step, creates notification
  - Escalation cron: skips step within 24h cooldown
  - Escalation cron: sends reminder when cooldown expired
  - Escalation cron: ignores non-overdue steps
  - Escalation cron: CRON_SECRET auth guard
- [x] Notifications integrated at all workflow transition points:
  - submitForApproval → notify first-step approver(s)
  - approve (not final) → notify next-step approver
  - approve (final) → notify submitter "Rechnung freigegeben"
  - reject → notify submitter with rejection reason
  - IMAP 3x failure → notify users with email_imap.manage permission

**Implementation Note**: Pause for notification flow validation.

---

## Phase 8: DATEV Export

### Overview
Build the DATEV Buchungsstapel CSV export for approved invoices. Windows-1252 encoding, semicolon delimiter, DATEV header row.

### Changes Required:

#### 1. DATEV Export Service
**File**: `src/lib/services/inbound-invoice-datev-export-service.ts`

```typescript
interface DatevExportOptions {
  invoiceIds: string[]        // specific invoices to export
  dateFrom?: Date             // or date range
  dateTo?: Date
}

const VAT_KEY_MAP: Record<number, number> = {
  19: 9,   // Vorsteuer 19%
  7: 8,    // Vorsteuer 7%
  0: 0,    // steuerfrei
}

function exportToCsv(prisma, tenantId, options: DatevExportOptions, userId: string, audit?): Promise<Buffer>
  // 1. Load approved invoices (status = APPROVED, not yet exported unless re-export)
  // 2. Build DATEV header row (format version, data category, etc.)
  // 3. For each invoice, build data row:
  //    - Belegdatum: invoice_date (DDMM format for DATEV)
  //    - Belegnummer: invoice_number (max 12 chars, DATEV limit)
  //    - Umsatz: total_gross (comma as decimal separator)
  //    - Soll/Haben: "S" (always Soll for inbound invoices)
  //    - WKZ Umsatz: "EUR"
  //    - USt-Schlüssel: from VAT_KEY_MAP
  //    - Buchungstext: "{supplier.company} {invoiceNumber}" (max 60 chars)
  //    - Kreditor: supplier.vatId or empty
  // 4. Encode to Windows-1252 (iconv-lite)
  // 5. Mark invoices as exported: datev_exported_at, datev_exported_by
  // 6. Audit log
  // 7. Return Buffer

function buildDatevHeader(tenantConfig): string
  // DATEV Buchungsstapel header line:
  // "EXTF";700;21;"Buchungsstapel";...
  // Fields: format version, data category, format name, format version,
  //         created timestamp, exported from, exported by, fiscal year start, etc.

function formatDatevDate(date: Date): string
  // Returns DDMM (4 digits, no year — DATEV standard for Belegdatum)
```

#### 2. Install iconv-lite
```bash
pnpm add iconv-lite
```
(`iconv-lite` ships its own TypeScript definitions — no `@types` needed.)

#### 3. DATEV Export tRPC procedure
**File**: `src/trpc/routers/invoices/inbound.ts` (add to existing)

```typescript
exportDatev: invProcedure.use(requirePermission(EXPORT)).input(exportSchema).mutation(...)
  // Input: { invoiceIds?: string[], dateFrom?, dateTo? }
  // Returns: { csv: base64string, filename: string, count: number }
```

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Lint passes: `pnpm lint`
- [x] Unit + Integration tests (10 passing):
  - `formatDatevDate`: correct DDMM format (15.03 → "1503", 31.12 → "3112")
  - VAT key mapping: 19% → 9, 7% → 8, 0% → 0
  - `buildDatevHeader`: starts with "EXTF", correct structure, semicolon delimiter
  - Integration: exports correct DATEV CSV format (header + column header + data rows)
  - Integration: Windows-1252 encoding with German Umlauts (Müller & Söhne)
  - Integration: Buchungstext truncation at 60 chars
  - Integration: marks invoices as EXPORTED with timestamp + user
  - Integration: throws when no approved invoices found
  - Integration: semicolon delimiter throughout

**Implementation Note**: Pause for DATEV format validation.

---

## Phase 9: Inbound Invoice List + Detail UI

### Overview
Build the main UI: invoice list page with filters/pagination, and the side-by-side detail page with PDF viewer + edit form + line items table.

### Changes Required:

#### 1. Invoice list page
**File**: `src/app/invoices/inbound/page.tsx`

Route: `/invoices/inbound`. Module-gated.

**File**: `src/components/invoices/inbound-invoice-list.tsx`

Following the `purchase-order-list.tsx` pattern:
- shadcn Table with columns: Number, Supplier, Invoice Number, Date, Amount, Status, Source
- Filters: status dropdown (ALL/DRAFT/PENDING_APPROVAL/APPROVED/REJECTED/EXPORTED), search (invoice number, supplier), date range
- Pagination: page state, pageSize 25
- Mobile card layout at `sm:hidden`
- Row click → navigates to detail page
- Action menu: Cancel, Delete (status-gated)

#### 2. Invoice detail page
**File**: `src/app/invoices/inbound/[id]/page.tsx`

**File**: `src/components/invoices/inbound-invoice-detail.tsx`

Side-by-side layout (adapting `document-editor.tsx` pattern):

**Left pane**: PDF viewer
```tsx
<div className="flex-1 min-w-0 overflow-hidden">
  <iframe
    src={pdfSignedUrl}
    className="w-full h-full border-0"
    title="Invoice PDF"
  />
</div>
```

**Right pane**: Collapsible form sidebar (`w-96` / `w-8`, `sticky top-4`)

Form sections (shadcn Card):
1. **Status + Actions**: Status badge, action buttons (Submit, Approve, Reject, Export — status-gated)
2. **Invoice Header**: invoiceNumber, invoiceDate, dueDate, totalNet, totalVat, totalGross, paymentTermDays
3. **Supplier**: Matched supplier display OR "Assign Supplier" / "Create New Supplier" buttons for SUPPLIER_UNKNOWN
4. **Line Items**: Inline-editable table below the form cards
5. **ZUGFeRD Info**: Profile badge, raw XML toggle (collapsible)
6. **Notes**: Textarea
7. **Approval History**: Timeline of approval steps (Phase 10)

Fields are editable only in DRAFT/REJECTED status. Pre-filled from ZUGFeRD if available.

#### 3. Upload dialog
**File**: `src/components/invoices/inbound-invoice-upload-dialog.tsx`

Dialog with drag-and-drop zone (following `article-image-upload.tsx` pattern):
- Accept PDF files only (max 20MB)
- 3-step upload: getUploadUrl → PUT to signed URL → createFromUpload
- Progress indicator
- On success: navigate to the new invoice detail page

#### 4. Line items table
**File**: `src/components/invoices/inbound-invoice-line-items.tsx`

Inline-editable table:
- Columns: Position, Article Number, Description, Qty, Unit, Unit Price, Net, VAT Rate, VAT, Gross
- Add row button, delete row button per row
- Auto-calculate: totalNet = quantity × unitPriceNet, vatAmount = totalNet × vatRate / 100, totalGross = totalNet + vatAmount
- Footer: Sum row with totals
- Validation warning if sum ≠ header totals (±0.01)

#### 5. Status badge
**File**: `src/components/invoices/inbound-invoice-status-badge.tsx`

Following `purchase-order-status-badge.tsx` pattern:
```typescript
const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  DRAFT: 'secondary',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'success',
  REJECTED: 'destructive',
  EXPORTED: 'default',
  CANCELLED: 'outline',
}
```

#### 6. Supplier assignment dialog
**File**: `src/components/invoices/supplier-assignment-dialog.tsx`

For SUPPLIER_UNKNOWN invoices:
- Search existing suppliers (CrmAddress with type SUPPLIER/BOTH)
- "Create New" button → opens CRM address creation form pre-filled with ZUGFeRD seller data
- On assignment: calls `assignSupplier` mutation

#### 7. Navigation
Add "Eingangsrechnungen" to the main navigation sidebar under a new "Rechnungen" section. Module-gated.

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Lint passes: `pnpm lint`

#### Manual Verification:
- [ ] List page loads with filters and pagination
- [ ] Upload a PDF → redirected to detail page with side-by-side layout
- [ ] ZUGFeRD fields are pre-filled correctly
- [ ] Edit header fields in DRAFT status
- [ ] Add/remove/edit line items
- [ ] Assign supplier for SUPPLIER_UNKNOWN invoice
- [ ] PDF viewer displays correctly in iframe

**Implementation Note**: UI components are ready. Manual verification required for visual/interactive testing.

---

## Phase 10: Approval Workflow UI

### Overview
Build the approver-facing UI: pending approvals list, approve/reject actions with confirmation dialogs, and approval history timeline on the invoice detail page.

### Changes Required:

#### 1. Pending approvals page
**File**: `src/app/invoices/inbound/approvals/page.tsx`

**File**: `src/components/invoices/inbound-pending-approvals.tsx`

List of invoices pending the current user's approval:
- Table: Invoice Number, Supplier, Amount, Date, Step, Due
- Row click → navigates to invoice detail with approval focus
- Badge for overdue items (due_at < now)
- Empty state: "Keine ausstehenden Freigaben"

#### 2. Approve/Reject on detail page
**File**: `src/components/invoices/inbound-invoice-detail.tsx` (extend)

When current user has a PENDING approval step for this invoice:
- **Approve Button** → `ConfirmDialog` with summary
- **Reject Button** → Dialog with required `rejectionReason` textarea

Submitter ≠ approver guard: If current user is the submitter, approve button is disabled with tooltip "Sie können Ihre eigene Rechnung nicht freigeben".

#### 3. Approval history timeline
**File**: `src/components/invoices/inbound-approval-timeline.tsx`

Vertical timeline (within the detail sidebar):
- Each step shows: step number, approver name, status badge, decided_at, rejection_reason (if rejected)
- Current pending step highlighted
- INVALIDATED steps shown in muted color with "Ungültig (Rechnung geändert)" label

#### 4. DATEV export button
On the list page, when status filter = APPROVED:
- "DATEV Export" button in the header
- Opens dialog: select invoices (checkbox) or "Alle exportieren"
- Downloads CSV file
- On success: toast + status changes to EXPORTED

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Lint passes: `pnpm lint`
- [x] All i18n — no hardcoded strings, all in de.json + en.json

#### Manual Verification:
- [ ] Approver sees pending invoices in the approvals list
- [ ] Can approve → next step triggered or invoice approved
- [ ] Can reject with reason → submitter sees reason
- [ ] Submitter cannot approve own invoice
- [ ] Approval history shows all steps with timestamps
- [ ] DATEV export downloads correct CSV

**Implementation Note**: Pause for complete workflow walkthrough.

---

## Phase 11: Admin UI (Approval Policy + Email Log)

### Overview
Build the admin settings pages for approval policy configuration and the inbound email log debug view.

### Changes Required:

#### 1. IMAP Config page
**File**: `src/app/settings/email-imap/page.tsx`

**File**: `src/components/invoices/imap-config-form.tsx`

Following the SMTP config form pattern:
- Form fields: Host, Port, Username, Password, Encryption (SSL/STARTTLS/NONE), Mailbox
- "Verbindung testen" button → calls testConnection, shows messageCount on success
- Verified badge after successful test
- Last poll info: lastPollAt, consecutiveFailures, lastPollError (read-only display)

#### 2. Approval policy page
**File**: `src/app/invoices/inbound/settings/page.tsx`

**File**: `src/components/invoices/approval-policy-list.tsx`

Table of current threshold rules:
- Columns: Amount Range (min–max), Step, Approver (Role or User), Active
- Add button → Sheet form
- Edit/Delete per row

**File**: `src/components/invoices/approval-policy-sheet.tsx`

Sheet form (following `template-form-sheet.tsx` pattern):
- Fields: amountMin, amountMax (optional = unlimited), stepOrder, approverType (group/user toggle), approverGroupId (user group dropdown), approverUserId (user search), isActive
- Validation: amountMin < amountMax, stepOrder > 0, either group or user required

#### 3. Email log debug page
**File**: `src/app/invoices/inbound/email-log/page.tsx`

**File**: `src/components/invoices/inbound-email-log.tsx`

Accessible to users with `inbound_invoices.manage` permission.

Table of all inbound email log entries:
- Columns: Received At, From, Subject, Status, Attachments, Invoice Link
- Filters: status dropdown (all/processed/failed/skipped_*), search (from, subject), date range
- Pagination
- Status badge with color coding:
  - `processed` → green
  - `failed` → red
  - `skipped_*` → yellow
  - `pending` → gray

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Lint passes: `pnpm lint`
- [x] All i18n — translations in de.json + en.json (~80 keys for imap/policy/emailLog/settings)

#### Manual Verification:
- [ ] IMAP config form saves and test connection works
- [ ] Approval policies can be created, edited, deleted
- [ ] Amount range validation works
- [ ] Email log shows all processed emails with correct status colors
- [ ] Email log filters work

**Implementation Note**: Pause for admin UI validation.

---

## Phase 12: E2E Playwright Tests

### Overview
End-to-end browser tests covering critical user flows. **All unit/service/router/cron tests are written in their respective phases (2–11)** — this phase only covers Playwright E2E.

### Changes Required:

#### 1. E2E test setup
**File**: `src/e2e-browser/inbound-invoices.spec.ts`

Playwright tests following existing `src/e2e-browser/` patterns. Auth: admin session from `.auth/`. Module must be enabled for test tenant.

#### 2. Test scenarios

**Flow 1: Manual Upload + ZUGFeRD → Approve → Export**
- Upload ZUGFeRD PDF → verify fields pre-filled + line items
- Submit for approval → switch to approver → approve → verify APPROVED
- Export DATEV → verify CSV download

**Flow 2: Plain PDF + Manual Entry → Reject → Re-submit**
- Upload plain PDF → fill header + line items manually
- Submit → reject with reason → verify submitter sees reason
- Edit → re-submit → approve

**Flow 3: Admin Configuration**
- Configure IMAP settings → test connection
- Create approval policy rules → verify in list

### Success Criteria:

#### Automated Verification:
- [ ] E2E tests pass: `pnpm playwright test src/e2e-browser/inbound-invoices.spec.ts`
- [ ] Full test suite still passes: `pnpm test`

#### Manual Verification:
- [ ] Complete walkthrough: upload → capture → approve → export

---

## Testing Strategy

**Tests are written per phase, not batched at the end.** Each phase's Success Criteria includes required tests as a mandatory sub-task.

### Per-Phase Test Responsibilities:
| Phase | Test File(s) | What to Test |
|---|---|---|
| 2 | `__tests__/email-imap-config-service.test.ts` | IMAP config CRUD, testConnection (mocked imapflow), password exclusion |
| 3 | `__tests__/zugferd-parser-service.test.ts` | PDF extraction, XML parsing, profile detection, plain PDF negative test |
| 4 | `__tests__/inbound-invoice-supplier-matcher.test.ts`, `__tests__/email-imap-poll-service.test.ts`, `cron/email-imap-poll/__tests__/route.test.ts` | Supplier matching (4 strategies), poll service (mocked imapflow/mailparser), cron auth guard, attachment size check |
| 5 | `__tests__/inbound-invoice-service.test.ts`, `routers/__tests__/invoices-inbound.test.ts` | CRUD, duplicate detection, line item validation, permissions, module gating |
| 6 | `__tests__/inbound-invoice-approval-service.test.ts` | Step creation, approve/reject, submitter guard, material change, group auth |
| 7 | `cron/inbound-invoice-escalations/__tests__/route.test.ts` | Overdue detection, reminder cooldown, notification creation |
| 8 | `__tests__/inbound-invoice-datev-export-service.test.ts` | DATEV format, encoding, VAT mapping, truncation |
| 12 | `e2e-browser/inbound-invoices.spec.ts` | Full user flows via Playwright |

### Test patterns:
- Service: `createMockPrisma()`, `vi.hoisted()` for mocked deps
- Router: `createCallerFactory` + `createMockContext`
- Cron: `vi.hoisted()` + dynamic import
- E2E: Playwright with `.auth/` sessions

## Performance Considerations

- **IMAP poll cron**: Process tenants sequentially (not parallel) to avoid connection overload. Max 50 messages per poll per tenant. `maxDuration = 300` allows 5 minutes total.
- **Supplier matching**: vatId/taxNumber queries use indexed columns. Fuzzy name matching loads all active suppliers for tenant — acceptable for typical supplier counts (< 5000). Cache supplier list per cron run if needed.
- **DATEV export**: Batch load invoices in single query. String encoding is fast. No streaming needed for typical export sizes (< 1000 invoices).
- **Approval step creation**: Single transaction per invoice. No N+1 queries.

## Migration Notes

- All new tables use `tenant_id` for multi-tenancy isolation
- `tenant_modules` CHECK constraint must be updated to include `inbound_invoices`
- Number sequence `inbound_invoice` auto-seeded for all existing tenants
- No data migration needed — this is a greenfield module
- Storage bucket `inbound-invoices` created via `supabase/config.toml`

## References

- Research: `thoughts/shared/research/2026-04-07-terp-invoice-phase1-eingangsrechnungen.md`
- Email-Versand Plan (Pattern-Vorlage): `thoughts/shared/plans/2026-04-02-ZMI-TICKET-141-email-versand.md`
- SMTP Config Pattern: `src/lib/services/email-smtp-config-service.ts`, `src/lib/services/email-smtp-config-repository.ts`, `src/trpc/routers/email/smtpConfig.ts`
- Cron Pattern: `src/app/api/cron/email-retry/route.ts`
- Audit Log: `src/lib/services/audit-logs-service.ts`
- Permission Catalog: `src/lib/auth/permission-catalog.ts`
- Module Gating: `src/lib/modules/index.ts`, `src/lib/modules/constants.ts`
- Number Sequences: `src/lib/services/number-sequence-service.ts`
- Side-by-Side UI: `src/components/billing/document-editor.tsx`
- Supplier Model: `prisma/schema.prisma:302-359` (CrmAddress)
- Storage: `src/lib/supabase/storage.ts`
- imapflow docs: https://imapflow.com/
- ZUGFeRD corpus: https://github.com/ZUGFeRD/corpus
- DATEV Buchungsstapel-Format: https://developer.datev.de/datev/platform/de/dtvf
