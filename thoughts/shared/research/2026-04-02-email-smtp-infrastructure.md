---
date: 2026-04-02T12:00:00+02:00
researcher: Claude
git_commit: 3eddc24536569472528958253dd4a9f7e957c541
branch: staging
repository: terp
topic: "Email/SMTP Infrastructure — Can tenants send emails via the ERP?"
tags: [research, codebase, email, smtp, notifications, mail-sending]
status: complete
last_updated: 2026-04-02
last_updated_by: Claude
last_updated_note: "Added decisions: skip global SMTP (V1), go straight to per-tenant SMTP; local testing strategy with Inbucket + Google Workspace"
---

# Research: Email/SMTP Infrastructure — Can Tenants Send Emails via the ERP?

**Date**: 2026-04-02
**Researcher**: Claude
**Git Commit**: 3eddc245
**Branch**: staging
**Repository**: terp

## Research Question
Can companies set up their own mail (SMTP) servers and send emails directly to customers through this ERP system, regardless of which mail provider they use?

## Summary

**No email-sending capability exists today.** The codebase has zero email infrastructure — no SMTP library, no email service, no email-related environment variables, no email configuration UI, and no email-related database tables. Email addresses are stored as data fields on entities (User, Employee, CrmAddress, Tenant) but are never used for outbound mail.

However, there is a **fully specified ticket** (ZMI-TICKET-141) that describes the planned email feature in detail, including per-tenant SMTP configuration, email templates with placeholders, automatic PDF attachments, retry logic, and a send log. This ticket is in "Proposed" status. Its original blocker (ZMI-TICKET-140 — PDF generation) is already implemented, so email sending can proceed.

## Detailed Findings

### 1. Current State: No Email Sending Infrastructure

| Area | Status |
|---|---|
| npm packages (nodemailer, resend, sendgrid, etc.) | **Not installed** |
| SMTP environment variables | **None defined** |
| `src/lib/config.ts` | **No email config** |
| Prisma schema email tables (templates, send_log, smtp_config) | **Do not exist** |
| Email service/repository | **Do not exist** |
| Email tRPC router | **Does not exist** |
| Email UI components | **Do not exist** |
| Supabase Inbucket (local email capture) | **Disabled** (`supabase/config.toml:45`) |
| Docker email services (Mailhog, etc.) | **None** |

### 2. How "Email" Is Used Today

Email appears in four contexts, none of which send mail:

1. **Data field on Prisma models** — `User.email`, `Employee.email`, `CrmAddress.email`, `CrmContact.email`, `Tenant.email`, `BillingTenantConfig.email`. These store addresses but no code reads them for sending.

2. **Supabase Auth credential** — `signInWithPassword({ email, password })` in `src/app/[locale]/(auth)/login/page.tsx:41`. Used only for authentication.

3. **Purchase order method enum** — `WhPurchaseOrderMethod.EMAIL` in `prisma/schema.prisma:4366`. The send dialog (`src/components/warehouse/purchase-order-send-dialog.tsx`) records that an order was communicated via email, but doesn't actually send one.

4. **CRM correspondence type** — `CrmCorrespondence.type` stores `"email"` as a channel label in `prisma/schema.prisma:516`. Records that a correspondence happened via email, but the app doesn't send it.

5. **E-Invoice XML** — `BillingTenantConfig.email` is embedded as `cbc:ElectronicMail` in XRechnung XML in `src/lib/services/billing-document-einvoice-service.ts:239-243`. It's a data value in generated XML, not a sending trigger.

### 3. Notification System (Database-Only, No Email Channel)

The existing notification system is entirely in-app:
- `src/lib/services/notification-service.ts` — writes to `notifications` table
- `src/lib/services/notification-repository.ts` — Prisma queries for notifications
- `NotificationPreference` model (`prisma/schema.prisma:2815-2833`) has four boolean flags: `approvalsEnabled`, `errorsEnabled`, `remindersEnabled`, `systemEnabled` — none for email delivery
- Real-time delivery via pub/sub WebSocket (`src/lib/pubsub/singleton`), not email

### 4. Planned Feature: ZMI-TICKET-141 — E-Mail-Versand

**Status**: Proposed (not started)
**Blocked by**: ZMI-TICKET-140 (PDF generation)
**File**: `thoughts/shared/tickets/ZMI-TICKET-141-email-versand.md`

This ticket specifies:

#### Database Tables (planned)
- `email_templates` — per-tenant, per-document-type email templates with HTML body and placeholders
- `email_default_attachments` — configurable default attachments (e.g., AGB/terms) per document type
- `email_send_log` — full send audit trail with status tracking (pending/sent/failed/retrying)

#### SMTP Configuration (planned)
- Business rule #1: "E-Mails werden über SMTP versendet (Konfiguration pro Tenant oder global)"
- Note at bottom: "SMTP-Konfiguration: Zunächst global (z.B. SendGrid/Mailgun). Tenant-eigener SMTP in V2."
- This means V1 = single global SMTP provider, V2 = each tenant brings their own SMTP server

#### Template Placeholders (planned)
- `{Kundenname}`, `{Anrede}`, `{Dokumentennummer}`, `{Betrag}`, `{Fälligkeitsdatum}`, `{Firmenname}`, `{Projektname}`

#### API Endpoints (planned)
- `POST /documents/{id}/send` — send document via email
- `GET /documents/{id}/send-log` — view send history
- Full CRUD for templates and default attachments
- Preview endpoint for templates with placeholder resolution

#### Retry Logic (planned)
- 3 retries with exponential backoff (1min, 5min, 15min)
- After 3 failures: status = failed

#### Permissions (planned)
- `documents.send` — send documents
- `email_templates.manage` — manage templates

### 5. Other Tickets That Depend on Email

| Ticket | Dependency on ZMI-TICKET-141 |
|---|---|
| ZMI-TICKET-162 (Mahnwesen/Dunning) | Blocked — needs email to send payment reminders |
| ZMI-TICKET-130 (Angebote/Quotes) | Email sending deferred to 141 |
| ZMI-TICKET-124 (Document Editor UI) | Email send UI deferred to 141 |
| ZMI-TICKET-123 (Document Editor Workflow) | Email deferred to 141 |
| ZMI-TICKET-190 (Kundenportal/Customer Portal) | Email invites reference 141 |

## Code References
- `prisma/schema.prisma:30` — User.email (auth credential)
- `prisma/schema.prisma:4364-4370` — WhPurchaseOrderMethod enum with EMAIL value
- `prisma/schema.prisma:516` — CrmCorrespondence.type (stores "email" as label)
- `supabase/config.toml:45-46` — Inbucket disabled
- `src/lib/config.ts:8-23` — serverEnv/clientEnv (no email vars)
- `src/lib/services/notification-service.ts` — in-app only notification system
- `src/lib/services/billing-document-einvoice-service.ts:239-243` — email in XRechnung XML
- `src/components/warehouse/purchase-order-send-dialog.tsx:27` — EMAIL as order method enum
- `package.json` — no email-sending dependencies

## Architecture Documentation

There is no email architecture implemented. The planned architecture (from ZMI-TICKET-141) follows the existing service + repository pattern:
- tRPC router (thin) → Email Service (business logic, template resolution, retry) → Email Repository (Prisma) + SMTP Transport

The SMTP transport layer is not yet specified in detail beyond "SMTP configuration per tenant or global."

## Historical Context (from thoughts/)
- `thoughts/shared/tickets/ZMI-TICKET-141-email-versand.md` — Full specification for email sending feature (proposed, not started)
- `thoughts/shared/tickets/ZMI-TICKET-162-mahnwesen.md` — Dunning feature, blocked by email
- `thoughts/shared/tickets/ZMI-TICKET-130-angebote-erstellung-versand.md` — Quotes, email deferred
- `thoughts/shared/tickets/ZMI-TICKET-124-dokumenten-editor-frontend-ui.md` — Document editor, email UI deferred
- `thoughts/shared/tickets/ZMI-TICKET-123-dokumenten-editor-workflow.md` — Document workflow, email deferred
- `thoughts/shared/tickets/ZMI-TICKET-190-kundenportal-porta.md` — Customer portal, email invites

## Decisions (2026-04-02)

### Skip V1 Global SMTP — Go Straight to Per-Tenant SMTP

The original ZMI-TICKET-141 spec planned two phases:
- V1: Single global SMTP provider (e.g., SendGrid) — all tenants share one sender like `noreply@terp-app.de`
- V2: Each tenant configures their own SMTP server

**Decision**: Skip V1 entirely. Each tenant configures their own SMTP from day one. Rationale: tenants need their customers to receive emails from their own domain (e.g., `rechnung@mueller-gmbh.de`), not from a generic platform address. A global sender adds no value and would need to be replaced anyway.

This means the implementation must include from the start:
- A `tenant_smtp_config` table storing per-tenant SMTP credentials
- An admin UI for tenants to enter and test their SMTP settings
- Encryption at rest for stored SMTP passwords

### Document-to-Email Flow (Confirmed)

The core user flow is: **Create document → Finalize → Send via email** — all within the ERP.

#### How it works end-to-end:

1. User creates a document (invoice, quote, credit note, purchase order, etc.)
2. User finalizes the document → PDF is generated and stored in Supabase Storage (already implemented)
3. User clicks "Send" on the finalized document
4. System auto-selects the email template matching the **document type** (e.g., invoice template for invoices, quote template for quotes)
5. Placeholders are resolved from document + contact data ({Kundenname}, {Dokumentennummer}, {Betrag}, etc.)
6. The generated PDF is auto-attached
7. Recipient email is pre-filled from the linked CRM contact's email address
8. User can review/edit the email, add CC recipients, toggle default attachments (e.g., AGB)
9. Email is sent via the tenant's configured SMTP server
10. Send log entry is created, document status updates to "sent"

#### Template auto-selection by document type:

| Document Type | Auto-Selected Template | Auto-Attached PDF |
|---|---|---|
| Rechnung (Invoice) | Invoice template | Invoice PDF |
| Angebot (Quote) | Quote template | Quote PDF |
| Gutschrift (Credit Note) | Credit note template | Credit note PDF |
| Mahnung (Dunning) | Dunning template | Dunning PDF |
| Bestellung (Purchase Order) | PO template | PO PDF |

Each tenant can customize templates per document type, or fall back to the platform-provided defaults.

#### Existing PDF services that feed into this flow:

- `src/lib/services/billing-document-pdf-service.ts` — invoices, quotes, credit notes
- `src/lib/services/wh-purchase-order-pdf-service.ts` — purchase orders
- `src/lib/services/billing-document-einvoice-service.ts` — ZUGFeRD/XRechnung e-invoices (PDF/A-3 with embedded XML)

All PDFs are already stored in Supabase Storage, so the email service just needs to fetch the stored PDF and attach it — no re-generation required.

### Local Testing Strategy

| Phase | SMTP Target | Purpose |
|---|---|---|
| Development | **Inbucket** (local, already in Supabase stack) | Fast iteration, no real emails sent |
| Integration test | **Google Workspace** (team account) | Verify real delivery, spam score, attachments |
| Production | Whatever each tenant configures | Their own SMTP |

#### Inbucket (Development)

Already configured in `supabase/config.toml` but disabled. To enable:

```toml
[inbucket]
enabled = true
```

SMTP endpoint: `127.0.0.1:54324` (no auth required)
Web UI: `http://localhost:54324` — inspect all captured emails

#### Google Workspace (Integration Testing)

Requires an App Password (myaccount.google.com → Security → 2-Step Verification → App Passwords):

- **Host**: `smtp.gmail.com`
- **Port**: `587`
- **Encryption**: STARTTLS
- **Username**: `your-name@your-domain.com`
- **Password**: App Password (not regular password)

## Resolved Questions
1. ~~**PDF generation dependency**~~: ZMI-TICKET-140 is **already implemented**. PDF generation exists via `@react-pdf/renderer` (server-side) for billing documents (`src/lib/services/billing-document-pdf-service.ts`), purchase orders (`src/lib/services/wh-purchase-order-pdf-service.ts`), and QR labels (`src/lib/services/wh-qr-service.ts`). PDFs are stored in Supabase Storage. **Email sending is no longer blocked by this dependency.**

## Open Questions
1. **SMTP config storage**: The ticket defines template and log tables but does not specify a database table for storing SMTP credentials (host, port, username, password, encryption). This will need to be designed.
2. **Email HTML rendering & template system**: Needs to support both pre-built templates (shipped with the platform as starting points) and fully custom templates that tenants can create/edit themselves. Requires a visual or code-based template editor in the admin UI. Library choice (react-email, mjml, or similar) must produce HTML that renders correctly across all major email clients (Gmail, Outlook, Apple Mail).
3. **Tenant SMTP security**: Storing tenant SMTP passwords requires encryption at rest — no encryption utilities exist in the codebase today.
4. **SMTP connection test**: The admin UI should include a "Test Connection" button that sends a test email — needs to be specified.
