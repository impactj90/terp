# ZMI-TICKET-141: E-Mail-Versand — Implementation Plan

## Overview

Implement per-tenant SMTP email sending for all document types. Each tenant configures their own SMTP server and email templates. Documents (invoices, quotes, credit notes, purchase orders, dunning) are sent as PDF attachments with customizable HTML templates and placeholder resolution. Includes retry logic via Vercel cron, a full send log, and a shared email compose dialog used across all document types.

## Current State Analysis

**No email infrastructure exists.** Zero SMTP libraries, email tables, email services, or email UI components. Email addresses are stored on entities (`User.email`, `Employee.email`, `CrmAddress.email`, `CrmContact.email`, `Tenant.email`, `BillingTenantConfig.email`) but never used for outbound mail.

**What IS ready:**
- PDF generation and storage: `billing-document-pdf-service.ts`, `wh-purchase-order-pdf-service.ts` — PDFs stored in Supabase Storage bucket `"documents"`
- PDF retrieval for attachment: `storage.download("documents", doc.pdfUrl)` returns `Blob` → `Buffer` (pattern from `billing-document-einvoice-service.ts:392-403`)
- Per-tenant config pattern: `BillingTenantConfig` with `@unique tenantId`, upsert repository
- Cron job pattern: `src/app/api/cron/` with `CRON_SECRET` auth, checkpoint system, per-tenant iteration
- Permission system: `permission-catalog.ts` with deterministic UUIDv5, group-based JSONB arrays
- Notification system (in-app only): service + repository + tRPC router pattern to follow

### Key Discoveries:
- `storage.download(bucket, path)` returns `Blob | null` — exact pattern for email attachments (`src/lib/supabase/storage.ts:75-80`)
- `BillingDocument.pdfUrl` stores a storage path string, not a URL (`prisma/schema.prisma:731`)
- Document status flow: `DRAFT → PRINTED → FORWARDED/CANCELLED` — email send only after `PRINTED` (`billing-document-service.ts:512-643`)
- `PurchaseOrderSendDialog` at `src/components/warehouse/purchase-order-send-dialog.tsx` records send method but doesn't actually send email
- `proxyPassword` in `SystemSetting` is stored plain, excluded from API responses via `mapToOutput` (`src/trpc/routers/systemSettings.ts:109-135`)
- No application-layer encryption exists anywhere in the codebase
- Inbucket is in the Supabase stack but disabled (`supabase/config.toml:45`)
- Latest migration: `20260410100000_deactivate_legacy_english_booking_types.sql`
- Latest permission migration: `20260409100001_add_dsgvo_permissions_to_groups.sql`

## Desired End State

A tenant admin can:
1. Configure their SMTP server (host, port, credentials, from address) in the admin settings
2. Test the SMTP connection with a "Send test email" button
3. Manage email templates per document type with placeholder preview
4. Configure default attachments (e.g., AGB/terms PDF) per document type

Any user with `documents.send` permission can:
1. Open a finalized document (invoice, quote, credit note, PO)
2. Click "Send Email" → shared compose dialog opens
3. Recipient pre-filled from CRM contact, template auto-selected by document type
4. Review/edit subject + body, add CC, toggle default attachments
5. Send → PDF auto-attached, email sent via tenant's SMTP, send log entry created
6. View send history per document

The system:
- Retries failed sends (3 attempts with exponential backoff: 1min, 5min, 15min) via cron
- Updates document status to reflect email was sent
- Maintains full audit trail in `email_send_log`

### Verification:
- `pnpm typecheck` passes
- `pnpm test` passes (new tests for email service, template resolution, retry logic)
- `pnpm lint` passes
- SMTP config admin UI works with Inbucket in dev
- Email compose dialog works for all document types
- PDFs are correctly attached
- Retry cron processes failed emails
- Send log shows complete history

## What We're NOT Doing

- **Global/platform SMTP** — each tenant brings their own SMTP server from day one (decision from research)
- **XRechnung email delivery** — separate concern (ZMI-TICKET-142)
- **Customer portal notifications** — separate concern (ZMI-TICKET-190)
- **Dunning automation** — email infrastructure only; automatic dunning workflow is ZMI-TICKET-162
- **Rich template editor UI** — V1 uses a code/HTML editor for templates, not a drag-and-drop builder
- **Email receiving/inbox** — outbound only
- **Email module gating** — email is core functionality, not a separate module; no `requireModule("email")`
- **Application-layer encryption for SMTP passwords** — follow the existing `proxyPassword` pattern: store plain, exclude from API read responses, rely on Supabase DB-level encryption at rest

## Implementation Approach

Follow the established service + repository pattern. Build bottom-up: database tables → services → tRPC routers → hooks → UI components. Use `react-email` for template rendering to ensure cross-client HTML compatibility. Use `nodemailer` as the SMTP transport. Retry via a Vercel cron job that polls `email_send_log` for retryable records.

The shared `EmailComposeDialog` component will be mounted in `DocumentEditor` (billing documents) and `PurchaseOrderDetail` (purchase orders), receiving a generic `DocumentEmailContext` prop that abstracts document type differences.

---

## Phase 1: Database Schema & Migrations

### Overview
Create the four new database tables and register new permissions. Enable Inbucket for local development.

### Changes Required:

#### 1. Migration: Create email tables
**File**: `supabase/migrations/20260411100000_create_email_tables.sql`

```sql
-- tenant_smtp_config: Per-tenant SMTP server configuration (one row per tenant)
CREATE TABLE tenant_smtp_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  host VARCHAR(255) NOT NULL,
  port INTEGER NOT NULL DEFAULT 587,
  username VARCHAR(255) NOT NULL,
  password VARCHAR(500) NOT NULL,
  encryption VARCHAR(10) NOT NULL DEFAULT 'STARTTLS' CHECK (encryption IN ('STARTTLS', 'SSL', 'NONE')),
  from_email VARCHAR(255) NOT NULL,
  from_name VARCHAR(255),
  reply_to_email VARCHAR(255),
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

-- email_templates: Per-tenant, per-document-type email templates
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_type VARCHAR(30) NOT NULL,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body_html TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_templates_tenant_type ON email_templates(tenant_id, document_type);
-- Ensure only one default template per tenant+type
CREATE UNIQUE INDEX idx_email_templates_default ON email_templates(tenant_id, document_type) WHERE is_default = true;

-- email_default_attachments: Configurable default attachments (e.g., AGB) per document type
CREATE TABLE email_default_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_type VARCHAR(30),
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  storage_bucket VARCHAR(100) NOT NULL DEFAULT 'documents',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_default_attachments_tenant ON email_default_attachments(tenant_id);

-- email_send_log: Full audit trail for all sent emails
CREATE TABLE email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id UUID,
  document_type VARCHAR(30),
  to_email VARCHAR(255) NOT NULL,
  cc_emails TEXT[],
  subject VARCHAR(500) NOT NULL,
  body_html TEXT NOT NULL,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'retrying')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  sent_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_send_log_tenant ON email_send_log(tenant_id);
CREATE INDEX idx_email_send_log_document ON email_send_log(tenant_id, document_id);
CREATE INDEX idx_email_send_log_status ON email_send_log(status, next_retry_at) WHERE status IN ('pending', 'retrying');
```

#### 2. Migration: Add permissions to system groups
**File**: `supabase/migrations/20260411100001_add_email_permissions_to_groups.sql`

New permissions to register in `permission-catalog.ts`:
- `documents.send` — Send documents via email
- `email_templates.view` — View email templates
- `email_templates.manage` — Create/edit/delete email templates
- `email_smtp.view` — View SMTP configuration
- `email_smtp.manage` — Manage SMTP configuration

The migration adds UUIDs (computed via `uuidv5(key, NAMESPACE)`) to ADMIN, PERSONAL, VORGESETZTER, and BUCHHALTUNG system groups, following the pattern in `20260409100001_add_dsgvo_permissions_to_groups.sql`.

#### 3. Prisma schema additions
**File**: `prisma/schema.prisma`

Add four new models: `TenantSmtpConfig`, `EmailTemplate`, `EmailDefaultAttachment`, `EmailSendLog` with appropriate relations to `Tenant`, `User`, and each other. Add back-references on the `Tenant` model.

#### 4. Enable Inbucket for development
**File**: `supabase/config.toml`

```toml
[inbucket]
enabled = true
```

SMTP endpoint: `127.0.0.1:54324` (no auth), Web UI: `http://localhost:54324`

### Success Criteria:

#### Automated Verification:
- [x] Migration applies cleanly: `pnpm db:reset`
- [x] Prisma client regenerates: `pnpm db:generate`
- [x] Type checking passes: `pnpm typecheck`
- [ ] Inbucket accessible at `http://localhost:54324` after `pnpm db:start`

#### Manual Verification:
- [x] Tables visible in Prisma Studio: `pnpm db:studio`
- [x] Inbucket web UI shows inbox

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 2: SMTP Configuration Backend

### Overview
Build the SMTP config service, repository, and tRPC router. Install `nodemailer` for SMTP transport and connection testing.

### Changes Required:

#### 1. Install dependencies
```bash
pnpm add nodemailer
pnpm add -D @types/nodemailer
```

#### 2. SMTP Config Repository
**File**: `src/lib/services/email-smtp-config-repository.ts`

Follow `billing-tenant-config-repository.ts` pattern. Two functions:
- `findByTenantId(prisma, tenantId)` — `prisma.tenantSmtpConfig.findUnique({ where: { tenantId } })`
- `upsert(prisma, tenantId, data)` — `prisma.tenantSmtpConfig.upsert(...)` (upsert pattern, `@unique tenantId`)

#### 3. SMTP Config Service
**File**: `src/lib/services/email-smtp-config-service.ts`

Functions:
- `get(prisma, tenantId)` — returns config or `null`
- `upsert(prisma, tenantId, data, audit?)` — saves config, sets `is_verified = false` when credentials change, optional audit log
- `testConnection(prisma, tenantId)` — creates a `nodemailer` transporter from stored config, calls `transporter.verify()`, on success sends a test email to the `from_email`, updates `is_verified = true` and `verified_at`
- `createTransporter(config)` — internal helper: builds `nodemailer.createTransport({ host, port, secure, auth })` from a `TenantSmtpConfig` record

**Password handling**: Store plain (consistent with `proxyPassword` pattern). The `get` function returns the config with password — the **router** is responsible for excluding it from the response via `mapToOutput`, exactly like `systemSettings.ts:109-135`.

#### 4. SMTP Config tRPC Router
**File**: `src/trpc/routers/email/smtpConfig.ts`

```typescript
const EMAIL_SMTP_VIEW = permissionIdByKey("email_smtp.view")!
const EMAIL_SMTP_MANAGE = permissionIdByKey("email_smtp.manage")!

get: tenantProcedure
  .use(requirePermission(EMAIL_SMTP_VIEW))
  .query(async ({ ctx }) => {
    const config = await smtpConfigService.get(ctx.prisma, ctx.tenantId!)
    return config ? mapToOutput(config) : null  // mapToOutput EXCLUDES password
  })

upsert: tenantProcedure
  .use(requirePermission(EMAIL_SMTP_MANAGE))
  .input(upsertInputSchema)
  .mutation(...)

testConnection: tenantProcedure
  .use(requirePermission(EMAIL_SMTP_MANAGE))
  .mutation(async ({ ctx }) => {
    return smtpConfigService.testConnection(ctx.prisma, ctx.tenantId!)
  })
```

`mapToOutput` excludes `password` field — returns `hasPassword: boolean` instead (true if password is set).

#### 5. Email Router Index
**File**: `src/trpc/routers/email/index.ts`

```typescript
export const emailRouter = router({
  smtpConfig: smtpConfigRouter,
  // templates and send will be added in later phases
})
```

Mount in `src/trpc/routers/_app.ts` as `email: emailRouter`.

#### 6. Permission Catalog Updates
**File**: `src/lib/auth/permission-catalog.ts`

Add to `ALL_PERMISSIONS` array:
```typescript
// Email Module
p("documents.send", "documents", "send", "Send documents via email"),
p("email_templates.view", "email_templates", "view", "View email templates"),
p("email_templates.manage", "email_templates", "manage", "Manage email templates"),
p("email_smtp.view", "email_smtp", "view", "View SMTP configuration"),
p("email_smtp.manage", "email_smtp", "manage", "Manage SMTP configuration"),
```

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Lint passes: `pnpm lint`
- [ ] Unit tests for `email-smtp-config-service.ts`: SMTP config CRUD, `testConnection` with mocked nodemailer, password exclusion from output

#### Manual Verification:
- [ ] SMTP config upsert via tRPC call stores data correctly
- [ ] `testConnection` succeeds against Inbucket (`127.0.0.1:54324`, no auth)
- [ ] Password is excluded from `get` response

**Implementation Note**: Pause after this phase for manual SMTP testing with Inbucket.

---

## Phase 3: Email Templates Backend

### Overview
Build the email template system using `react-email` for rendering. Includes CRUD, placeholder resolution, and preview.

### Changes Required:

#### 1. Install react-email
```bash
pnpm add @react-email/components react-email
```

#### 2. Email Template Repository
**File**: `src/lib/services/email-template-repository.ts`

Functions:
- `findMany(prisma, tenantId, filters?)` — list templates, optionally filtered by `documentType`
- `findById(prisma, tenantId, id)` — single template with tenant scoping
- `findDefault(prisma, tenantId, documentType)` — find the `is_default = true` template for a document type
- `create(prisma, tenantId, data)` — create template; if `is_default = true`, unset previous default for same tenant+type in a transaction
- `update(prisma, tenantId, id, data)` — update template; handle `is_default` toggle
- `remove(prisma, tenantId, id)` — delete template

#### 3. Email Template Service
**File**: `src/lib/services/email-template-service.ts`

Functions:
- `list(prisma, tenantId, documentType?)` — pass-through to repo
- `getById(prisma, tenantId, id)` — throws `EmailTemplateNotFoundError` if not found
- `getDefault(prisma, tenantId, documentType)` — returns default template or `null`
- `create(prisma, tenantId, data, audit?)` — delegates to repo, audit log
- `update(prisma, tenantId, id, data, audit?)` — delegates to repo, audit log
- `remove(prisma, tenantId, id, audit?)` — delegates to repo, audit log
- `resolvePlaceholders(template, context)` — replaces `{Kundenname}`, `{Anrede}`, `{Dokumentennummer}`, `{Betrag}`, `{Fälligkeitsdatum}`, `{Firmenname}`, `{Projektname}` in both subject and body_html
- `preview(prisma, tenantId, templateId, documentId)` — loads template + document data, resolves placeholders, renders with react-email, returns HTML string

#### 4. Placeholder Resolution Engine
**File**: `src/lib/services/email-placeholder-resolver.ts`

Standalone module — pure function, no side effects:

```typescript
interface PlaceholderContext {
  kundenname?: string      // CrmAddress.company or CrmContact full name
  anrede?: string          // "Herr/Frau Nachname" from CrmContact
  dokumentennummer?: string // BillingDocument.number or WhPurchaseOrder.number
  betrag?: string          // formatted gross amount (e.g., "6.241,31 €")
  faelligkeitsdatum?: string // due date formatted
  firmenname?: string      // Tenant.name or BillingTenantConfig.companyName
  projektname?: string     // Project name if linked
}

function resolvePlaceholders(text: string, ctx: PlaceholderContext): string {
  // Replace {Kundenname} → ctx.kundenname, etc.
  // Missing placeholders → empty string
}
```

#### 5. React-Email Base Template
**File**: `src/lib/email/templates/base-document-email.tsx`

A react-email component that wraps the resolved HTML body with:
- Responsive container
- Tenant branding (company name in header)
- Clean footer with company address
- Cross-client compatible HTML (inline styles via react-email)

This is the **rendering wrapper**, not the template content. The template `body_html` from the database is inserted into this wrapper.

#### 6. Default Template Seeds
**File**: `src/lib/email/default-templates.ts`

Default HTML templates for each document type (in German):
- `INVOICE` — "Rechnung {Dokumentennummer}"
- `OFFER` — "Angebot {Dokumentennummer}"
- `ORDER_CONFIRMATION` — "Auftragsbestätigung {Dokumentennummer}"
- `CREDIT_NOTE` — "Gutschrift {Dokumentennummer}"
- `DELIVERY_NOTE` — "Lieferschein {Dokumentennummer}"
- `SERVICE_NOTE` — "Serviceschein {Dokumentennummer}"
- `RETURN_DELIVERY` — "Rücklieferschein {Dokumentennummer}"
- `PURCHASE_ORDER` — "Bestellung {Dokumentennummer}"

These are used when a tenant has no custom template for a document type. They are NOT seeded into the database — they're code-level fallbacks returned by `getDefault()` when no DB template exists.

#### 7. Email Template tRPC Router
**File**: `src/trpc/routers/email/templates.ts`

```typescript
const EMAIL_TEMPLATES_VIEW = permissionIdByKey("email_templates.view")!
const EMAIL_TEMPLATES_MANAGE = permissionIdByKey("email_templates.manage")!

list: tenantProcedure.use(requirePermission(EMAIL_TEMPLATES_VIEW)).query(...)
getById: tenantProcedure.use(requirePermission(EMAIL_TEMPLATES_VIEW)).query(...)
create: tenantProcedure.use(requirePermission(EMAIL_TEMPLATES_MANAGE)).mutation(...)
update: tenantProcedure.use(requirePermission(EMAIL_TEMPLATES_MANAGE)).mutation(...)
remove: tenantProcedure.use(requirePermission(EMAIL_TEMPLATES_MANAGE)).mutation(...)
preview: tenantProcedure.use(requirePermission(EMAIL_TEMPLATES_VIEW)).input(previewInputSchema).query(...)
```

Update `src/trpc/routers/email/index.ts` to add `templates: emailTemplateRouter`.

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Lint passes: `pnpm lint`
- [ ] Unit tests:
  - `resolvePlaceholders`: all 7 placeholders resolved correctly, missing → empty string
  - Template CRUD: create, read, update, delete with tenant isolation
  - Default template uniqueness: setting new default unsets previous
  - Preview: template + document data → resolved HTML

#### Manual Verification:
- [ ] Template CRUD works via tRPC DevTools or test script
- [ ] Preview returns correctly rendered HTML

**Implementation Note**: Pause after this phase for template review.

---

## Phase 4: Core Email Send Service

### Overview
Build the central email sending service that orchestrates SMTP transport, PDF attachment, template resolution, and send logging.

### Changes Required:

#### 1. Email Send Repository
**File**: `src/lib/services/email-send-log-repository.ts`

Functions:
- `create(prisma, tenantId, data)` — insert send log entry with `status: 'pending'`
- `findByDocumentId(prisma, tenantId, documentId, pagination?)` — list send log for a document
- `findRetryable(prisma, limit?)` — find records where `status IN ('pending', 'retrying') AND (next_retry_at IS NULL OR next_retry_at <= now())`, ordered by `created_at ASC`, limit 50
- `updateStatus(prisma, id, status, errorMessage?, nextRetryAt?)` — update status fields
- `markSent(prisma, id)` — set `status = 'sent'`, `sent_at = now()`
- `markFailed(prisma, id, errorMessage)` — set `status = 'failed'`, `error_message`
- `markRetrying(prisma, id, retryCount, nextRetryAt)` — set `status = 'retrying'`, increment retry count

#### 2. Email Default Attachments Repository
**File**: `src/lib/services/email-default-attachment-repository.ts`

Functions:
- `findMany(prisma, tenantId, documentType?)` — list active attachments for a tenant, optionally filtered by document type (include `document_type IS NULL` entries which apply to all types)
- `create(prisma, tenantId, data)` — insert attachment config
- `remove(prisma, tenantId, id)` — delete attachment config

#### 3. Email Send Service
**File**: `src/lib/services/email-send-service.ts`

The central orchestrator. Functions:

**`send(prisma, tenantId, input, sentBy)`** — Main send flow:
1. Load SMTP config via `smtpConfigService.get()` — throw `SmtpNotConfiguredError` if null
2. Load template: if `input.templateId` provided, use it; else load default for `input.documentType`
3. Build placeholder context from document data (load document + CRM contact/address + tenant config)
4. Resolve placeholders in subject and body
5. Render HTML via react-email base template wrapper
6. Fetch document PDF from Supabase Storage: `storage.download("documents", pdfStoragePath)` → `Buffer`
7. Fetch default attachments if `input.attachDefaults` is true
8. Create `email_send_log` entry with `status: 'pending'`
9. Create nodemailer transporter from SMTP config
10. Send email with `transporter.sendMail({ from, to, cc, subject, html, attachments })`
11. On success: `markSent(logId)`, return `{ success: true, logId }`
12. On failure: determine retry — if `retryCount < 3`, `markRetrying` with `nextRetryAt`; else `markFailed`

**`getDocumentEmailContext(prisma, tenantId, documentId, documentType)`** — Build the context needed for the compose dialog:
- Load document data (number, amount, due date, status)
- Load linked CRM address + contact (recipient email, company name, salutation)
- Load default template for document type
- Load default attachments
- Resolve placeholders in template
- Return `{ recipient, subject, bodyHtml, pdfFileName, defaultAttachments, canSend: boolean }`

**`getSendLog(prisma, tenantId, documentId, pagination?)`** — List send history for a document

**Retry backoff calculation:**
```typescript
function getNextRetryAt(retryCount: number): Date {
  const delays = [60_000, 300_000, 900_000] // 1min, 5min, 15min
  const delay = delays[retryCount] ?? delays[delays.length - 1]
  return new Date(Date.now() + delay)
}
```

#### 4. Document Context Builders
**File**: `src/lib/services/email-document-context.ts`

Pure functions that extract email-relevant data from different document types:

```typescript
interface DocumentEmailData {
  documentId: string
  documentType: string
  documentNumber: string
  pdfStoragePath: string | null
  recipientEmail: string | null
  recipientName: string | null
  salutation: string | null
  grossAmount: string | null
  dueDate: string | null
  projectName: string | null
  tenantCompanyName: string
}

async function buildBillingDocumentEmailData(prisma, tenantId, documentId): Promise<DocumentEmailData>
async function buildPurchaseOrderEmailData(prisma, tenantId, purchaseOrderId): Promise<DocumentEmailData>
```

These abstract the differences between billing documents and purchase orders so the email service deals with a single `DocumentEmailData` interface.

#### 5. Email Send tRPC Router
**File**: `src/trpc/routers/email/send.ts`

```typescript
const DOCUMENTS_SEND = permissionIdByKey("documents.send")!

// Get context for compose dialog (pre-fill recipient, template, etc.)
getContext: tenantProcedure
  .use(requirePermission(DOCUMENTS_SEND))
  .input(z.object({ documentId: z.string().uuid(), documentType: z.string() }))
  .query(...)

// Send email
send: tenantProcedure
  .use(requirePermission(DOCUMENTS_SEND))
  .input(sendInputSchema)
  .mutation(...)

// Get send log for a document
sendLog: tenantProcedure
  .use(requirePermission(DOCUMENTS_SEND))
  .input(z.object({ documentId: z.string().uuid(), page: z.number().default(1), pageSize: z.number().default(20) }))
  .query(...)
```

**`sendInputSchema`:**
```typescript
z.object({
  documentId: z.string().uuid(),
  documentType: z.string(),
  to: z.string().email(),
  cc: z.array(z.string().email()).optional(),
  templateId: z.string().uuid().optional(),
  subject: z.string().min(1).max(500),
  bodyHtml: z.string().min(1),
  attachDefaults: z.boolean().default(true),
})
```

Update `src/trpc/routers/email/index.ts` to add `send: emailSendRouter`.

#### 6. React hooks
**File**: `src/hooks/use-email.ts`

```typescript
export function useEmailContext(documentId: string, documentType: string) { ... }
export function useSendEmail() { ... }
export function useEmailSendLog(documentId: string) { ... }
```

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Lint passes: `pnpm lint`
- [ ] Unit tests:
  - `send`: mock nodemailer + storage → success path creates log entry with `status: 'sent'`
  - `send`: mock nodemailer failure → `status: 'retrying'`, `retry_count: 1`, `next_retry_at` set
  - `send`: SMTP not configured → throws `SmtpNotConfiguredError`
  - `send`: document has no PDF → throws appropriate error
  - `getDocumentEmailContext`: returns pre-filled data from billing document
  - `getDocumentEmailContext`: returns pre-filled data from purchase order
  - Retry backoff: correct delay calculation for retry counts 0, 1, 2, 3+

#### Manual Verification:
- [ ] Send email via tRPC mutation → appears in Inbucket inbox
- [ ] PDF attachment is correct and downloadable
- [ ] Send log entry created with `status: 'sent'`
- [ ] CC recipients receive the email

**Implementation Note**: Pause after this phase — the core send flow must work end-to-end with Inbucket before building the UI.

---

## Phase 5: Retry Cron Job

### Overview
Implement the Vercel cron job that retries failed email sends with exponential backoff.

### Changes Required:

#### 1. Cron route handler
**File**: `src/app/api/cron/email-retry/route.ts`

Follow the pattern from `wh-corrections/route.ts` (simplest cron variant — no `CronExecutionLogger`, no checkpoints needed since retry is idempotent):

```typescript
export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(request: Request) {
  // 1. Authenticate with CRON_SECRET (same pattern as all other crons)
  // 2. Query email_send_log for retryable records:
  //    status IN ('pending', 'retrying') AND next_retry_at <= now()
  //    LIMIT 50, ORDER BY created_at ASC
  // 3. For each record:
  //    a. Load tenant SMTP config
  //    b. If no SMTP config → markFailed("SMTP not configured")
  //    c. Build nodemailer transporter
  //    d. Rebuild the email (stored subject, body_html, reload PDF from storage)
  //    e. Attempt send
  //    f. On success: markSent()
  //    g. On failure: if retry_count < 3 → markRetrying(retry_count + 1, nextRetryAt)
  //                   else → markFailed(error_message)
  // 4. Return JSON summary: { processed, succeeded, failed, skipped }
}
```

**No per-tenant iteration needed** — the query directly finds all retryable records across tenants. Each record carries its own `tenant_id` for SMTP config lookup.

#### 2. Register in vercel.json
**File**: `vercel.json`

Add to the crons array:
```json
{ "path": "/api/cron/email-retry", "schedule": "*/5 * * * *" }
```

Every 5 minutes — frequent enough for the 1min/5min/15min backoff schedule.

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Lint passes: `pnpm lint`
- [ ] Unit test: mock failing send → creates retrying record → cron picks it up → retries → marks sent
- [ ] Unit test: 3 failures → status becomes 'failed', no more retries
- [ ] Unit test: CRON_SECRET auth works (401 without, 200 with)

#### Manual Verification:
- [ ] Configure a deliberately wrong SMTP, send email, observe retry entries in `email_send_log`
- [ ] Fix SMTP config, wait for cron → email eventually delivered
- [ ] After 3 failures, record shows `status: 'failed'`

**Implementation Note**: Pause after this phase for retry flow verification.

---

## Phase 6: SMTP Config Admin UI

### Overview
Build the admin UI for SMTP configuration with a test connection button.

### Changes Required:

#### 1. SMTP Config Hook
**File**: `src/hooks/use-email-smtp-config.ts`

```typescript
export function useEmailSmtpConfig() {
  return useQuery(trpc.email.smtpConfig.get.queryOptions())
}
export function useUpsertEmailSmtpConfig() {
  return useMutation({
    ...trpc.email.smtpConfig.upsert.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries(...)
  })
}
export function useTestEmailSmtpConnection() {
  return useMutation(trpc.email.smtpConfig.testConnection.mutationOptions())
}
```

#### 2. SMTP Config Form Component
**File**: `src/components/email/smtp-config-form.tsx`

Follow `tenant-config-form.tsx` pattern. A `<Card>` form with:
- **SMTP Server section**: Host, Port (number input), Encryption (Select: STARTTLS/SSL/NONE)
- **Authentication section**: Username, Password (type="password", placeholder shows "••••••" if `hasPassword` is true)
- **Sender section**: From Email, From Name, Reply-To Email
- **Status section**: Connection verified badge (green check + `verified_at` timestamp, or yellow warning "Not verified")
- **Actions**: "Save" button + "Test Connection" button (sends test email, shows success/error toast)

The password field: if `hasPassword` is true from API, show placeholder. Only send password to the API if the user actually typed a new value (avoid overwriting with empty string).

#### 3. Admin Settings Page Integration
**File**: Mount the SMTP config form in the existing admin/settings page structure.

Find the appropriate settings page (likely under `src/app/[locale]/(dashboard)/admin/` or `src/app/[locale]/(dashboard)/settings/`) and add an "E-Mail / SMTP" tab or section that renders `<SmtpConfigForm />`.

#### 4. i18n translations
**Files**: `messages/de.json`, `messages/en.json`

Add translation keys for all SMTP config labels, placeholders, success/error messages, and button text.

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Lint passes: `pnpm lint`
- [ ] Build succeeds: `pnpm build`

#### Manual Verification:
- [ ] SMTP form renders in admin settings
- [ ] Can enter SMTP credentials and save
- [ ] Password field shows placeholder when password exists
- [ ] "Test Connection" succeeds with Inbucket config (`127.0.0.1:54324`, no auth)
- [ ] "Test Connection" shows error with invalid config
- [ ] Verified status updates after successful test
- [ ] Form loads saved values correctly on page reload

**Implementation Note**: Pause for UI review. Use `/frontend-design` skill for building this component.

---

## Phase 7: Email Template Admin UI

### Overview
Build the admin UI for managing email templates with preview.

### Changes Required:

#### 1. Template Hooks
**File**: `src/hooks/use-email-templates.ts`

```typescript
export function useEmailTemplates(documentType?: string) { ... }
export function useEmailTemplate(id: string) { ... }
export function useCreateEmailTemplate() { ... }
export function useUpdateEmailTemplate() { ... }
export function useDeleteEmailTemplate() { ... }
export function usePreviewEmailTemplate(templateId: string, documentId: string) { ... }
```

#### 2. Template List Component
**File**: `src/components/email/email-template-list.tsx`

Data table with:
- Columns: Name, Document Type (badge), Default (checkmark icon), Updated At
- Filter by document type (Select dropdown)
- Actions: Edit, Delete, Set as Default
- "Create Template" button

#### 3. Template Edit Sheet
**File**: `src/components/email/email-template-sheet.tsx`

Sheet (side panel) form with:
- Name input
- Document Type select (INVOICE, OFFER, ORDER_CONFIRMATION, CREDIT_NOTE, DELIVERY_NOTE, SERVICE_NOTE, RETURN_DELIVERY, PURCHASE_ORDER)
- Subject input with placeholder hint chips (clickable to insert `{Kundenname}`, etc.)
- Body HTML textarea/editor with placeholder hint chips
- "Is Default" toggle
- Preview button → opens preview panel showing rendered HTML

#### 4. Template Preview Component
**File**: `src/components/email/email-template-preview.tsx`

Renders the resolved HTML in an iframe (sandboxed). Allows selecting a sample document to preview with real data.

#### 5. Admin Page
**File**: Mount template management in the admin settings, as a separate tab/section alongside SMTP config.

#### 6. i18n translations
**Files**: `messages/de.json`, `messages/en.json`

Add translation keys for template management UI.

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Lint passes: `pnpm lint`
- [ ] Build succeeds: `pnpm build`

#### Manual Verification:
- [ ] Template list loads and displays templates
- [ ] Can create a new template with placeholders
- [ ] Can edit an existing template
- [ ] Setting as default unsets previous default for same type
- [ ] Preview shows resolved HTML with real document data
- [ ] Placeholder chips insert correctly into subject/body fields

**Implementation Note**: Pause for template UI review. Use `/frontend-design` skill for building these components.

---

## Phase 8: Shared Email Compose Dialog & Document Integration

### Overview
Build the shared `EmailComposeDialog` component and integrate it into all document detail views. This is the user-facing send flow.

### Changes Required:

#### 1. Email Compose Dialog
**File**: `src/components/email/email-compose-dialog.tsx`

A `<Dialog>` component following the `PurchaseOrderSendDialog` pattern (`src/components/warehouse/purchase-order-send-dialog.tsx`).

**Props:**
```typescript
interface EmailComposeDialogProps {
  documentId: string
  documentType: string
  documentNumber: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSent?: () => void  // callback after successful send
}
```

**Behavior:**
1. On open: calls `useEmailContext(documentId, documentType)` → pre-fills recipient, subject, body from default template
2. If SMTP not configured: shows alert with link to admin settings
3. Form fields:
   - **To**: email input, pre-filled from CRM contact
   - **CC**: multi-email input (chip-style)
   - **Subject**: text input, pre-filled from template
   - **Body**: HTML textarea, pre-filled from resolved template
   - **Attachments section**: shows document PDF (always attached, not removable) + default attachments (toggleable checkboxes)
4. "Send" button → calls `useSendEmail()` mutation
5. Loading state with `<Loader2>` spinner during send
6. On success: toast, close dialog, call `onSent()`
7. On error: toast with error message, dialog stays open

#### 2. Send Log Panel
**File**: `src/components/email/email-send-log.tsx`

A collapsible section that shows send history for a document. Used inside document detail views.

- List of send attempts: date, recipient, status badge (sent/failed/retrying/pending), error message if failed
- Shown below the document content or in a tab

#### 3. Integration: Document Editor (Billing Documents)
**File**: `src/components/billing/document-editor.tsx`

Add to the toolbar action buttons (right side), after the PDF download button, only visible when `isImmutable` (status is not DRAFT):

```tsx
{isImmutable && (
  <Button variant="outline" onClick={() => setShowEmailDialog(true)}>
    <Mail className="h-4 w-4 mr-1" />
    {t('sendEmail')}
  </Button>
)}
```

Add state: `const [showEmailDialog, setShowEmailDialog] = React.useState(false)`

Render at bottom:
```tsx
<EmailComposeDialog
  documentId={doc.id}
  documentType={doc.type}
  documentNumber={doc.number}
  open={showEmailDialog}
  onOpenChange={setShowEmailDialog}
/>
```

Add `<EmailSendLog documentId={doc.id} />` section below the document content area.

#### 4. Integration: Purchase Order Detail
**File**: `src/components/warehouse/purchase-order-detail.tsx`

Modify the existing "Send" button behavior. When `method === 'EMAIL'` in the `PurchaseOrderSendDialog`, instead of just recording the method, also open the `EmailComposeDialog`. Alternatively, add a separate "Send Email" button alongside the existing "Send" button:

```tsx
<Button size="sm" variant="outline" onClick={() => setShowEmailDialog(true)}>
  <Mail className="h-4 w-4 sm:mr-2" />
  <span className="hidden sm:inline">{t('sendEmail')}</span>
</Button>
```

Add `<EmailComposeDialog>` and `<EmailSendLog>` to the PO detail view.

#### 5. Default Attachments Management
**File**: `src/trpc/routers/email/defaultAttachments.ts`

Simple CRUD router for `email_default_attachments`:
- `list`: get all active attachments for tenant, optionally filtered by document type
- `create`: add new default attachment (file upload to Supabase Storage + record)
- `remove`: delete attachment record + optionally remove file from storage

**File**: `src/hooks/use-email-default-attachments.ts`
**File**: `src/components/email/email-default-attachments.tsx` — admin UI for managing default attachments

#### 6. i18n translations
**Files**: `messages/de.json`, `messages/en.json`

Add translation keys for compose dialog, send log, and all new button labels.

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `pnpm typecheck`
- [x] Lint passes: `pnpm lint`
- [ ] Build succeeds: `pnpm build`
- [ ] Existing tests still pass: `pnpm test`

#### Manual Verification:
- [ ] "Send Email" button appears on finalized billing documents (PRINTED, FORWARDED, etc.)
- [ ] "Send Email" button does NOT appear on DRAFT documents
- [ ] Compose dialog opens with pre-filled recipient, subject, body
- [ ] Can edit all fields before sending
- [ ] Email arrives in Inbucket with correct subject, body, and PDF attachment
- [ ] Send log shows the sent email entry
- [ ] Works for all billing document types (INVOICE, OFFER, ORDER_CONFIRMATION, etc.)
- [ ] Works for purchase orders
- [ ] Default attachments appear as toggleable checkboxes in compose dialog
- [ ] SMTP not configured → shows helpful error message with admin link

**Implementation Note**: This is the final user-facing phase. Pause for comprehensive end-to-end testing. Use `/frontend-design` skill for the compose dialog and send log components.

---

## Phase 9: Unit & Router Tests

### Overview
Write comprehensive service unit tests and tRPC router integration tests for all email backend code. Follow the existing test patterns: service tests use `createMockPrisma()` factory with `vi.fn()` stubs; router tests use `createCallerFactory` + `createMockContext` from `src/trpc/routers/__tests__/helpers.ts`; cron tests use `vi.hoisted()` + dynamic `import("../route")`.

### Changes Required:

#### 1. Placeholder Resolver Unit Tests
**File**: `src/lib/services/__tests__/email-placeholder-resolver.test.ts`

Follow `crm-correspondence-service.test.ts` pattern (pure function tests, no Prisma mock needed):

```typescript
describe("email-placeholder-resolver", () => {
  describe("resolvePlaceholders", () => {
    it("replaces all 7 placeholders when all values provided", ...)
    it("replaces {Kundenname} with company name", ...)
    it("replaces {Anrede} with salutation", ...)
    it("replaces {Dokumentennummer} with document number", ...)
    it("replaces {Betrag} with formatted amount", ...)
    it("replaces {Fälligkeitsdatum} with due date", ...)
    it("replaces {Firmenname} with tenant company name", ...)
    it("replaces {Projektname} with project name", ...)
    it("replaces missing placeholders with empty string", ...)
    it("handles text with no placeholders (passthrough)", ...)
    it("handles multiple occurrences of same placeholder", ...)
    it("handles special characters in values (HTML entities, umlauts)", ...)
    it("handles empty string input", ...)
  })
})
```

#### 2. SMTP Config Service Unit Tests
**File**: `src/lib/services/__tests__/email-smtp-config-service.test.ts`

Follow `crm-correspondence-service.test.ts` pattern with `createMockPrisma()` factory. Mock `nodemailer` at module level with `vi.mock("nodemailer", ...)`:

```typescript
const { mockVerify, mockSendMail } = vi.hoisted(() => ({
  mockVerify: vi.fn(),
  mockSendMail: vi.fn(),
}))

vi.mock("nodemailer", () => ({
  createTransport: vi.fn(() => ({
    verify: mockVerify,
    sendMail: mockSendMail,
  })),
}))

describe("email-smtp-config-service", () => {
  describe("get", () => {
    it("returns config when exists", ...)
    it("returns null when no config for tenant", ...)
  })

  describe("upsert", () => {
    it("creates new config", ...)
    it("updates existing config", ...)
    it("resets is_verified to false when host changes", ...)
    it("resets is_verified to false when password changes", ...)
    it("preserves is_verified when only from_name changes", ...)
  })

  describe("testConnection", () => {
    it("calls transporter.verify() and sends test email on success", ...)
    it("sets is_verified=true and verified_at on success", ...)
    it("throws SmtpNotConfiguredError when no config exists", ...)
    it("throws SmtpConnectionError when verify() fails", ...)
    it("builds transporter with correct STARTTLS config (port 587, secure=false)", ...)
    it("builds transporter with correct SSL config (port 465, secure=true)", ...)
  })

  describe("createTransporter", () => {
    it("maps encryption=STARTTLS to secure=false", ...)
    it("maps encryption=SSL to secure=true", ...)
    it("maps encryption=NONE to secure=false, no TLS", ...)
  })
})
```

#### 3. Email Template Service Unit Tests
**File**: `src/lib/services/__tests__/email-template-service.test.ts`

```typescript
describe("email-template-service", () => {
  describe("list", () => {
    it("returns templates filtered by documentType", ...)
    it("returns all templates when no filter", ...)
  })

  describe("getById", () => {
    it("returns template when found", ...)
    it("throws EmailTemplateNotFoundError when not found", ...)
    it("throws EmailTemplateNotFoundError for wrong tenant", ...)
  })

  describe("getDefault", () => {
    it("returns DB default template when exists", ...)
    it("returns code-level fallback template when no DB default", ...)
    it("returns correct fallback for each document type (INVOICE, OFFER, etc.)", ...)
  })

  describe("create", () => {
    it("creates template with is_default=false", ...)
    it("creates template with is_default=true and unsets previous default", ...)
    it("writes audit log when audit context provided", ...)
  })

  describe("update", () => {
    it("updates template fields", ...)
    it("toggles is_default and unsets previous default in transaction", ...)
    it("throws EmailTemplateNotFoundError for nonexistent id", ...)
  })

  describe("remove", () => {
    it("deletes template", ...)
    it("throws EmailTemplateNotFoundError for wrong tenant", ...)
  })

  describe("preview", () => {
    it("resolves placeholders from document + contact data", ...)
    it("renders HTML via react-email wrapper", ...)
    it("throws when template not found", ...)
    it("throws when document not found", ...)
  })
})
```

#### 4. Email Send Service Unit Tests
**File**: `src/lib/services/__tests__/email-send-service.test.ts`

Mock `nodemailer`, `@/lib/supabase/storage`, and sibling services at module level:

```typescript
vi.mock("nodemailer", () => ({ createTransport: vi.fn(() => ({ sendMail: mockSendMail })) }))
vi.mock("@/lib/supabase/storage", () => ({ download: mockDownload }))

describe("email-send-service", () => {
  describe("send", () => {
    it("sends email with PDF attachment and creates send log with status=sent", ...)
    it("fetches PDF from storage using document's pdfStoragePath", ...)
    it("attaches default attachments when attachDefaults=true", ...)
    it("skips default attachments when attachDefaults=false", ...)
    it("resolves placeholders in subject and body before sending", ...)
    it("sets from address from tenant SMTP config", ...)
    it("includes CC recipients in email", ...)
    it("throws SmtpNotConfiguredError when no SMTP config", ...)
    it("throws DocumentPdfNotFoundError when document has no pdfUrl", ...)
    it("throws DocumentPdfNotFoundError when storage.download returns null", ...)
    it("on SMTP failure: creates send log with status=retrying, retry_count=1", ...)
    it("on SMTP failure with retry_count=2: sets status=retrying, next_retry_at +15min", ...)
    it("on SMTP failure with retry_count>=3: sets status=failed", ...)
  })

  describe("getDocumentEmailContext", () => {
    it("builds context from billing document (INVOICE)", ...)
    it("builds context from billing document (OFFER)", ...)
    it("builds context from purchase order (PURCHASE_ORDER)", ...)
    it("pre-fills recipient email from CRM contact", ...)
    it("falls back to CRM address email when no contact", ...)
    it("returns canSend=false when document has no PDF", ...)
    it("returns canSend=false when no SMTP configured", ...)
    it("returns resolved template subject and body", ...)
    it("returns default attachments list", ...)
  })

  describe("getNextRetryAt", () => {
    it("returns +1min for retryCount=0", ...)
    it("returns +5min for retryCount=1", ...)
    it("returns +15min for retryCount=2", ...)
    it("returns +15min for retryCount>=3 (capped)", ...)
  })

  describe("getSendLog", () => {
    it("returns paginated send log entries for document", ...)
    it("returns empty list when no entries", ...)
  })
})
```

#### 5. Email Send tRPC Router Tests
**File**: `src/trpc/routers/__tests__/emailSend-router.test.ts`

Follow `crmCorrespondence-router.test.ts` pattern with `createCallerFactory` + `createMockContext`:

```typescript
import { createCallerFactory } from "@/trpc/init"
import { emailSendRouter } from "../email/send"
import { createMockContext, createUserWithPermissions, createMockUserTenant } from "./helpers"

vi.mock("@/lib/db", () => ({ prisma: { tenantModule: { ... } } }))
vi.mock("@/lib/services/email-send-service", () => ({ send: mockSend, getDocumentEmailContext: mockGetContext, getSendLog: mockGetSendLog }))

const DOCUMENTS_SEND = permissionIdByKey("documents.send")!
const createCaller = createCallerFactory(emailSendRouter)

describe("email.send router", () => {
  describe("getContext", () => {
    it("returns pre-filled email context for a document", ...)
    it("requires documents.send permission", ...)
    it("rejects without permission (FORBIDDEN)", ...)
  })

  describe("send", () => {
    it("calls email send service and returns success", ...)
    it("validates input: rejects invalid email in 'to' field", ...)
    it("validates input: rejects empty subject", ...)
    it("requires documents.send permission", ...)
    it("passes sentBy from ctx.user.id", ...)
  })

  describe("sendLog", () => {
    it("returns paginated send log", ...)
    it("requires documents.send permission", ...)
  })
})
```

#### 6. Email SMTP Config Router Tests
**File**: `src/trpc/routers/__tests__/emailSmtpConfig-router.test.ts`

```typescript
describe("email.smtpConfig router", () => {
  describe("get", () => {
    it("returns config without password (mapToOutput excludes it)", ...)
    it("returns hasPassword=true when password is set", ...)
    it("returns hasPassword=false when no config", ...)
    it("requires email_smtp.view permission", ...)
  })

  describe("upsert", () => {
    it("creates/updates SMTP config", ...)
    it("requires email_smtp.manage permission", ...)
    it("validates port range", ...)
    it("validates email format for from_email", ...)
  })

  describe("testConnection", () => {
    it("calls service.testConnection and returns result", ...)
    it("requires email_smtp.manage permission", ...)
    it("returns error message on connection failure", ...)
  })
})
```

#### 7. Email Template Router Tests
**File**: `src/trpc/routers/__tests__/emailTemplates-router.test.ts`

```typescript
describe("email.templates router", () => {
  describe("list", () => {
    it("returns templates filtered by documentType", ...)
    it("requires email_templates.view permission", ...)
  })

  describe("create", () => {
    it("creates template and returns it", ...)
    it("requires email_templates.manage permission", ...)
    it("validates required fields (name, subject, body_html, document_type)", ...)
  })

  describe("update", () => {
    it("updates template fields", ...)
    it("requires email_templates.manage permission", ...)
  })

  describe("remove", () => {
    it("deletes template", ...)
    it("requires email_templates.manage permission", ...)
  })

  describe("preview", () => {
    it("returns rendered HTML with resolved placeholders", ...)
    it("requires email_templates.view permission", ...)
  })
})
```

#### 8. Email Retry Cron Route Tests
**File**: `src/app/api/cron/email-retry/__tests__/route.test.ts`

Follow `execute-macros/__tests__/route.test.ts` pattern with `vi.hoisted()` + dynamic import:

```typescript
const { mockFindRetryable, mockSendMail, mockMarkSent, mockMarkFailed, mockMarkRetrying, mockGetSmtpConfig, mockDownload } = vi.hoisted(() => ({
  mockFindRetryable: vi.fn(),
  mockSendMail: vi.fn(),
  mockMarkSent: vi.fn(),
  mockMarkFailed: vi.fn(),
  mockMarkRetrying: vi.fn(),
  mockGetSmtpConfig: vi.fn(),
  mockDownload: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: { emailSendLog: { findMany: mockFindRetryable, update: vi.fn() } } }))
vi.mock("nodemailer", () => ({ createTransport: vi.fn(() => ({ sendMail: mockSendMail })) }))
vi.mock("@/lib/supabase/storage", () => ({ download: mockDownload }))
// ... mock service modules

describe("GET /api/cron/email-retry", () => {
  describe("authorization", () => {
    it("returns 401 without Authorization header", ...)
    it("returns 401 with wrong CRON_SECRET", ...)
    it("returns 503 when CRON_SECRET env var missing", ...)
    it("returns 200 with correct Bearer token", ...)
  })

  describe("retry processing", () => {
    it("picks up pending records and sends them", ...)
    it("picks up retrying records where next_retry_at <= now", ...)
    it("skips records where next_retry_at > now", ...)
    it("marks sent on successful retry", ...)
    it("increments retry_count and sets next_retry_at on failure (retryCount < 3)", ...)
    it("marks failed when retry_count >= 3", ...)
    it("marks failed with 'SMTP not configured' when tenant has no SMTP config", ...)
    it("continues processing remaining records when one fails", ...)
    it("processes max 50 records per run", ...)
    it("returns JSON summary with processed/succeeded/failed counts", ...)
  })

  describe("PDF attachment on retry", () => {
    it("re-downloads PDF from storage for each retry", ...)
    it("marks failed when PDF no longer available in storage", ...)
  })
})
```

### Success Criteria:

#### Automated Verification:
- [x] All tests pass: `pnpm test` (42 tests across 5 files)
- [x] No test relies on external SMTP or network — all transport/storage mocked
- [ ] Permission tests verify FORBIDDEN for each protected procedure
- [x] Type checking passes: `pnpm typecheck`

#### Manual Verification:
- [ ] Test coverage review: every service function has at least one happy-path and one error-path test

**Implementation Note**: Run `pnpm test` and ensure all new + existing tests pass before proceeding to E2E.

---

## Phase 10: E2E Browser Tests

### Overview
Write Playwright E2E tests covering the full email sending user flow. Follow the `test.describe.serial` pattern from existing E2E specs (e.g., `21-crm-correspondence.spec.ts`). Tests use the admin auth session from `.auth/admin.json` and run against the live dev app with Inbucket as the SMTP target.

**Prerequisite**: Before running E2E tests, Inbucket must be enabled (`supabase/config.toml`) and a tenant SMTP config must be seeded pointing to Inbucket (`127.0.0.1:54324`, no auth). The global setup (`src/e2e-browser/global-setup.ts`) should clean up E2E email data via psql.

### Changes Required:

#### 1. Global Setup: Email Data Cleanup
**File**: `src/e2e-browser/global-setup.ts`

Add cleanup queries for email tables (same pattern as existing cleanup):

```sql
DELETE FROM email_send_log WHERE to_email LIKE 'e2e-%';
DELETE FROM email_templates WHERE name LIKE 'E2E%';
-- tenant_smtp_config is cleaned per-tenant, not deleted
```

#### 2. E2E: SMTP Configuration
**File**: `src/e2e-browser/60-email-smtp-config.spec.ts`

```typescript
import { test, expect } from "@playwright/test"
import { navigateTo, waitForTableLoad } from "./helpers/nav"
import { fillInput, selectOption, submitAndWaitForClose, waitForSheet } from "./helpers/forms"

test.describe.serial("UC-EMAIL-01: SMTP Configuration", () => {
  test("navigate to email settings page", async ({ page }) => {
    // Navigate to admin/settings → Email/SMTP tab
    // Assert the SMTP config form is visible
  })

  test("save SMTP configuration for Inbucket", async ({ page }) => {
    // Fill Host: 127.0.0.1, Port: 54324, Encryption: NONE
    // Fill From Email: e2e-test@example.com, From Name: E2E Test
    // Username/Password: leave empty (Inbucket needs no auth)
    // Click Save → expect success toast
    // Assert form reloads with saved values
  })

  test("test SMTP connection succeeds", async ({ page }) => {
    // Click "Test Connection" button
    // Expect success toast
    // Assert verified badge appears with timestamp
  })

  test("test SMTP connection fails with invalid config", async ({ page }) => {
    // Change host to invalid.example.com → Save
    // Click "Test Connection"
    // Expect error toast
    // Assert verified badge shows "Not verified"
    // Restore valid Inbucket config
  })
})
```

#### 3. E2E: Email Template Management
**File**: `src/e2e-browser/61-email-templates.spec.ts`

```typescript
const TEMPLATE_NAME = "E2E Rechnungsvorlage"
const TEMPLATE_SUBJECT = "Rechnung {Dokumentennummer}"

test.describe.serial("UC-EMAIL-02: Email Templates", () => {
  test("navigate to email template management", async ({ page }) => {
    // Navigate to admin/settings → Email Templates tab
    // Assert template list is visible (may be empty)
  })

  test("create a new invoice email template", async ({ page }) => {
    // Click "Create Template" button → sheet opens
    // Fill: Name=TEMPLATE_NAME, Document Type=Rechnung, Subject=TEMPLATE_SUBJECT
    // Fill body_html with placeholder text including {Kundenname}, {Betrag}
    // Set as Default toggle = on
    // Submit → sheet closes
    // Assert template appears in list with "Default" badge
  })

  test("preview template with real document data", async ({ page }) => {
    // Open template → click Preview
    // Select an existing finalized invoice as sample document
    // Assert preview iframe shows resolved placeholders (actual customer name, amount)
  })

  test("edit template subject", async ({ page }) => {
    // Open row action menu → Edit
    // Change subject to "Aktualisiert: {Dokumentennummer}"
    // Submit → verify updated in list
  })

  test("create second template and set as default replaces first", async ({ page }) => {
    // Create another invoice template with is_default=true
    // Assert new template has Default badge
    // Assert first template no longer has Default badge
  })

  test("delete template", async ({ page }) => {
    // Open row action menu → Delete → confirm
    // Assert template removed from list
  })
})
```

#### 4. E2E: Full Email Send Flow (Billing Document)
**File**: `src/e2e-browser/62-email-send-billing.spec.ts`

```typescript
const INVOICE_COMPANY = "E2E Email GmbH"
const INVOICE_EMAIL = "e2e-billing@example.com"

test.describe.serial("UC-EMAIL-03: Send Billing Document Email", () => {
  test("precondition: create CRM address with email", async ({ page }) => {
    // Navigate to CRM → create address with company=INVOICE_COMPANY, email=INVOICE_EMAIL
  })

  test("precondition: create and finalize an invoice", async ({ page }) => {
    // Navigate to documents → create new invoice for INVOICE_COMPANY
    // Add at least one position
    // Click Finalize → confirm dialog
    // Assert status changes to PRINTED
    // Assert PDF download button is visible
  })

  test("Send Email button is visible on finalized document", async ({ page }) => {
    // Assert "Send Email" button is visible in toolbar
    // Assert "Send Email" button is NOT visible on DRAFT documents (navigate to a draft to verify)
  })

  test("open compose dialog and verify pre-filled fields", async ({ page }) => {
    // Navigate to the finalized invoice
    // Click "Send Email" → dialog opens
    // Assert To field is pre-filled with INVOICE_EMAIL
    // Assert Subject contains the document number
    // Assert Body contains resolved placeholders (INVOICE_COMPANY, amount)
    // Assert PDF attachment is listed (document PDF filename)
  })

  test("send email successfully", async ({ page }) => {
    // In the compose dialog, click "Send"
    // Assert loading spinner appears
    // Assert success toast appears
    // Assert dialog closes
  })

  test("verify send log entry appears on document", async ({ page }) => {
    // On the document detail page, find the send log section
    // Assert one entry with status "Sent", recipient=INVOICE_EMAIL, timestamp
  })

  test("send with CC recipients", async ({ page }) => {
    // Click "Send Email" again
    // Add CC: e2e-cc@example.com
    // Send → success
    // Assert send log shows second entry
  })

  test("send email for a quote (OFFER)", async ({ page }) => {
    // Create and finalize a quote for same address
    // Click "Send Email" → verify template auto-selects quote template
    // Send → success → verify in send log
  })

  test("send email for a credit note (CREDIT_NOTE)", async ({ page }) => {
    // Create and finalize a credit note
    // Send email → success
  })
})
```

#### 5. E2E: Send Email from Purchase Order
**File**: `src/e2e-browser/63-email-send-purchase-order.spec.ts`

```typescript
const PO_SUPPLIER = "E2E Email Lieferant GmbH"
const PO_EMAIL = "e2e-supplier@example.com"

test.describe.serial("UC-EMAIL-04: Send Purchase Order Email", () => {
  test("precondition: create supplier with email", async ({ page }) => {
    // Navigate to CRM → create supplier address with email=PO_EMAIL
  })

  test("precondition: create purchase order", async ({ page }) => {
    // Navigate to warehouse → purchase orders → create PO for PO_SUPPLIER
    // Add positions
  })

  test("send PO via email", async ({ page }) => {
    // On PO detail, click "Send Email"
    // Assert compose dialog opens with PO_EMAIL pre-filled
    // Assert PO PDF is listed as attachment
    // Click Send → success
  })

  test("verify PO send log", async ({ page }) => {
    // Assert send log entry on PO detail page
  })
})
```

#### 6. E2E: Error Handling
**File**: `src/e2e-browser/64-email-error-handling.spec.ts`

```typescript
test.describe.serial("UC-EMAIL-05: Email Error Handling", () => {
  test("compose dialog shows SMTP-not-configured warning when no config", async ({ page }) => {
    // This test requires temporarily removing SMTP config or using a second tenant with no config
    // Assert alert message appears in compose dialog with link to admin settings
  })

  test("compose dialog shows error toast on send failure", async ({ page }) => {
    // Configure SMTP with invalid host
    // Try to send → expect error toast
    // Assert dialog stays open (user can retry)
    // Restore valid SMTP config
  })
})
```

### Success Criteria:

#### Automated Verification:
- [ ] All E2E tests pass: `pnpm exec playwright test src/e2e-browser/6*.spec.ts`
- [ ] Tests are idempotent (global-setup cleans E2E data before run)
- [ ] No flaky timeouts (use `toBeVisible({ timeout: 10_000 })` for async operations)
- [ ] All existing E2E tests still pass: `pnpm exec playwright test`

#### Manual Verification:
- [ ] Watch the E2E run in headed mode (`--headed`) to verify visual correctness
- [ ] Check Inbucket inbox to confirm emails were actually delivered during E2E run
- [ ] Verify that E2E cleanup in `global-setup.ts` correctly removes test data

**Implementation Note**: Run E2E tests in headed mode first to catch any visual or timing issues. Only switch to headless after confirming stability.

## Performance Considerations

- **PDF download for attachment**: PDFs are already in Supabase Storage. `storage.download()` fetches them server-side. For large PDFs, this adds latency to the send flow. Consider: the send mutation should return quickly (log entry created), with actual SMTP delivery happening async. However, for V1, synchronous send is acceptable since the dialog shows a loading spinner.
- **Retry cron**: Runs every 5 minutes, processes max 50 records per run. This is safe for Vercel's 5-minute timeout.
- **Template rendering**: react-email rendering is fast (<100ms per email). No caching needed for V1.
- **SMTP connections**: Each send creates a new transporter. For V1 this is fine. If volume grows, connection pooling can be added later.

## Migration Notes

- All new tables use `ON DELETE CASCADE` on `tenant_id` — deleting a tenant cleans up all email data
- `email_send_log.document_id` does NOT have a FK constraint to a specific table (it could reference `billing_documents` or `wh_purchase_orders`). The `document_type` column disambiguates.
- No data migration needed — this is entirely new infrastructure
- The `is_verified` flag on `tenant_smtp_configs` resets to `false` whenever credentials change, requiring re-verification

## References

- Original ticket: `thoughts/shared/tickets/ZMI-TICKET-141-email-versand.md`
- Research: `thoughts/shared/research/2026-04-02-email-smtp-infrastructure.md`
- Notification service pattern: `src/lib/services/notification-service.ts`, `src/lib/services/notification-repository.ts`
- BillingTenantConfig pattern: `src/lib/services/billing-tenant-config-service.ts`, `src/lib/services/billing-tenant-config-repository.ts`
- PDF storage pattern: `src/lib/services/billing-document-pdf-service.ts:28-96`
- PDF download pattern: `src/lib/supabase/storage.ts:75-80`
- Cron job pattern: `src/app/api/cron/wh-corrections/route.ts`
- Send dialog pattern: `src/components/warehouse/purchase-order-send-dialog.tsx`
- Document editor toolbar: `src/components/billing/document-editor.tsx:314-433`
- Permission catalog: `src/lib/auth/permission-catalog.ts`
- System settings password pattern: `src/trpc/routers/systemSettings.ts:109-135`
