---
date: 2026-04-10T20:39:28+02:00
researcher: impactj90
git_commit: 91581279b26b3219f0c66dc17b8483898287e11b
branch: staging
repository: terp
topic: "Platform Subscription Billing (Phase 10) — Dogfood Approach via Operator Tenant"
tags: [research, codebase, billing, platform-admin, phase-10, recurring-invoices, subscription, dogfood]
status: complete
last_updated: 2026-04-10
last_updated_by: impactj90
---

# Research: Platform Subscription Billing (Phase 10) — Dogfood Approach via Operator Tenant

**Date**: 2026-04-10T20:39:28+02:00
**Researcher**: impactj90
**Git Commit**: 91581279b26b3219f0c66dc17b8483898287e11b
**Branch**: staging
**Repository**: terp

## Research Question

After Phase 9 the platform admin can manage tenants and book modules, but `operator_note` is a free-text breadcrumb with no billing connection. The operator (solo dev, expecting 0-5 customers in the next 6 months) needs to actually invoice customers for module subscriptions.

Strategic decision from sparring: **dogfood TERP's own billing module** rather than building parallel platform billing or integrating Stripe/Lexoffice. Invoice delivery only for Phase 10a (SEPA is deferred to 10b). Thin automation — with 0-5 customers, heavy cron orchestration is overkill.

This research maps what TERP's billing module can already do today, identifies the gaps specifically for the dogfood-platform-billing use case, sketches the bridge architecture (operator tenant as billing backend for platform bookings), and lists concrete open questions the subsequent Phase 10 plan has to answer.

## Summary

**The good news**: Virtually everything needed for dogfood subscription billing already exists.

- `BillingRecurringInvoice` is a first-class model with an **already-running daily cron** at `/api/cron/recurring-invoices` (04:00 UTC) that materializes due templates into `BillingDocument` rows. The cron iterates cross-tenant by default, with `(tenantId, templateId)` checkpoint idempotency.
- `BillingDocumentPosition.unitPrice` + `positionTemplate` JSONB on `BillingRecurringInvoice` provide per-line pricing without needing the article catalog — line items can be free-text.
- `CrmAddress` (the billing debtor) and `BillingRecurringInvoice` both have service functions that accept `prisma + tenantId` as plain parameters — a `platformAuthedProcedure` handler can call them directly without any impersonation or tenant-context middleware.
- `BillingDocument.finalize()` auto-generates the PDF via `@react-pdf/renderer` and writes to Supabase Storage; if `BillingTenantConfig.eInvoiceEnabled` is set, it also produces a ZUGFeRD/XRechnung XML via `@e-invoice-eu/core`.
- Email dispatch for invoices already exists: `email.send.send` (generic tRPC mutation, `documents.send` permission) → `email-send-service.ts` → `TenantSmtpConfig` → nodemailer → `EmailSendLog` with exponential retry via `/api/cron/email-retry` (5-min schedule).

**What's missing for the dogfood bridge**:

1. No concept of "operator home tenant" anywhere in the codebase. A new env var `PLATFORM_OPERATOR_TENANT_ID` has to be introduced through `src/lib/config.ts` and `src/instrumentation.ts` startup validation.
2. No Prisma schema linkage between a `Tenant` row (as a TERP customer) and a `CrmAddress` row in another tenant. The bridge must create a `CrmAddress` inside the operator tenant for each TERP customer, with some mechanism to avoid duplicates on re-booking.
3. `BillingRecurringInvoice` generates `BillingDocument` rows in **DRAFT** status. No current path auto-finalizes them. Auto-delivery (PDF + email send) is a new orchestration the platform has to add.
4. No subscription-state table exists. The current `tenant_modules` row has `enabledAt`, `operator_note`, `enabledByPlatformUserId` but no `startDate`, `endDate`, `cancellationScheduledFor`, `billingCycle`, `unitPrice`, or link to a `BillingRecurringInvoice` row.
5. `BillingPriceList` can key entries by `itemKey` (free text), so a "module price catalog" can live inside the operator tenant's own price list — but there is no existing platform-side price catalog concept.
6. Per-module pricing in a price list keyed by `itemKey` would work but requires the operator to populate that price list (no seed/template exists).

**Architecturally clean path**: Phase 10 is mostly a **bridge + small subscription-state extension**, not a ground-up billing system. The hard work (PDF, XRechnung, recurring cron, retry, SMTP) is done.

## Detailed Findings

### 1. Existing billing module inventory

#### 1.1 BillingDocument

`prisma/schema.prisma:750-830`

Core invoice/offer/delivery-note entity. Fields:

- **Identity**: `id`, `tenantId`, `number` (unique per tenant, generated from `NumberSequence`)
- **Classification**: `type` (`BillingDocumentType` enum — `OFFER`, `ORDER_CONFIRMATION`, `DELIVERY_NOTE`, `SERVICE_NOTE`, `RETURN_DELIVERY`, `INVOICE`, `CREDIT_NOTE`), `status` (`BillingDocumentStatus` — `DRAFT`, `PRINTED`, `PARTIALLY_FORWARDED`, `FORWARDED`, `CANCELLED`)
- **Parties**: `addressId` (required FK → `CrmAddress`), `contactId?`, `deliveryAddressId?`, `invoiceAddressId?` (all FKs to CrmAddress)
- **Dates**: `orderDate?`, `documentDate` (default now), `deliveryDate?`
- **Payment terms**: `paymentTermDays?`, `discountPercent?`/`discountDays?` (Skonto tier 1), `discountPercent2?`/`discountDays2?` (Skonto tier 2)
- **Totals**: `subtotalNet`, `totalVat`, `totalGross` — all `Float`, computed/stored (recalculated by `recalculateTotals()` when positions change)
- **Text**: `headerText`, `footerText`, `notes`, `internalNotes`
- **Storage**: `pdfUrl` (storage path, not URL), `eInvoiceXmlUrl`
- **Lifecycle**: `printedAt`, `printedById`, `createdAt`, `updatedAt`, `createdById`
- **Chain**: `parentDocumentId?` (self-ref for Angebot → AB → Lieferschein → Rechnung chain)

All monetary fields are `Float` (double precision), **not** `Decimal` or integer cents.

**Status transitions** (`src/lib/services/billing-document-service.ts`):

- `DRAFT → PRINTED` via `finalize()` (line 512): requires at least one position, sets `printedAt`/`printedById`. After the transaction commits, the service best-effort generates the PDF via `billing-document-pdf-service.generateAndStorePdf()` and, if `BillingTenantConfig.eInvoiceEnabled=true` and type is INVOICE or CREDIT_NOTE, also generates the XRechnung XML.
- `PRINTED → FORWARDED` via `forward()` (line 645): creates a child document of a type determined by the forwarding rules table (lines 88-96).
- `* → CANCELLED` via `cancel()` (line 770): atomic guard against transitioning from CANCELLED/FORWARDED.

**There is no "paid" or "overdue" status on `BillingDocument`**. Payment state is computed at query time from `BillingPayment` rows (see §1.7).

**Programmatic creation**: `create(prisma, tenantId, input, createdById, audit)` at line 210-238 accepts `tenantId` as a plain string — no tRPC context coupling. Minimum required input: `type` + `addressId`.

**Router**: `src/trpc/routers/billing/documents.ts`

#### 1.2 BillingDocumentPosition

`prisma/schema.prisma:839-863`

Line items on a billing document. Fields:

- `id`, `documentId` (FK → `BillingDocument`, onDelete Cascade), `sortOrder`
- `type` (`BillingPositionType` — `ARTICLE`, `FREE`, `TEXT`, `PAGE_BREAK`, `SUBTOTAL`) — defaults to `FREE`
- `articleId?` (FK → `WhArticle`, optional) — if null, position is free-text
- `articleNumber?`, `description?`, `quantity?`, `unit?`, `unitPrice?`, `flatCosts?`, `totalPrice` (computed: `round(qty * unitPrice + flat, 2)`)
- `priceType?` (`STANDARD`/`ESTIMATE`/`BY_EFFORT`)
- `vatRate?` (percentage as Float, e.g. `19.0`)

All prices are `Float`. VAT is **per-position only** — there is no global tenant-level VAT rate or price-list-level VAT rate.

**Relevance for dogfood billing**: `FREE` position type with free-text `description` plus `unitPrice` + `vatRate` covers the "one line item per booked module" use case without needing to seed the warehouse article catalog.

#### 1.3 BillingDocumentTemplate

`prisma/schema.prisma:872-889`

Invoice **text templates only** — `headerText` and `footerText` HTML blocks with placeholder substitution (`{{briefanrede}}`, `{{firma}}`, etc.). No line items, no payment terms, no VAT. One "default" per `(tenantId, documentType)` via application-level logic (no DB unique constraint). On `BillingDocument.create()`, if no header/footer is supplied, the default template for the type is resolved and placeholders are substituted at create-time (not at render-time), and the resolved text is stored on the document itself — not referenced back via FK.

**Service**: `src/lib/services/billing-document-template-service.ts`

#### 1.4 BillingTenantConfig

`prisma/schema.prisma:898-927`

Per-tenant letterhead and bank configuration: `companyName`, `companyStreet`/Zip/City/Country (defaults `DE`), `logoUrl`, `bankName`/`iban`/`bic`, `taxId`, `taxNumber`, `commercialRegister`, `managingDirector`, `footerHtml`, `phone`, `email`, `website`, `leitwegId` (E-Invoice recipient ID), `eInvoiceEnabled` (Boolean, default false).

**Not stored here**: VAT rates, number ranges, default templates. VAT is per-position. Number ranges live in `NumberSequence`. Default templates live on `BillingDocumentTemplate.isDefault`.

**Service**: `src/lib/services/billing-tenant-config-service.ts` — `get(prisma, tenantId)` and `upsert(prisma, tenantId, input)`. Returns `null` if not yet created.

#### 1.5 BillingPriceList + BillingPriceListEntry

`prisma/schema.prisma:1024-1072`

**`BillingPriceList`**: catalog with `name`, `type` (VARCHAR default `"sales"`, values `"sales"` or `"purchase"`), `isDefault`, `validFrom`/`validTo` (list-level), `isActive`. Per-customer assignment via `CrmAddress.salesPriceListId` / `purchasePriceListId`.

**`BillingPriceListEntry`**: keyed either by `articleId` (FK → `WhArticle`) OR by `itemKey` (free-text string) — no DB constraint enforces exactly one. Fields: `description?`, `unitPrice` (required Float, net), `minQuantity?` (for volume tiers), `unit?`, `validFrom?`, `validTo?`.

**No VAT rate on price-list entries.** VAT is resolved per-position at invoice creation time.

**Price lookup** — `billing-price-list-service.lookupPrice()` (lines 454-530):
1. If address has an assigned price list, search there by `articleId` or `itemKey`
2. Pick the volume-tier entry with the highest `minQuantity ≤ qty` (if qty provided)
3. Fall back to the default price list of the same type
4. For purchase type only, fall back to `WhArticleSupplier.buyPrice`
5. Enforce `validFrom/validTo` windows

**Relevance for dogfood billing**: The `itemKey` mechanism is exactly what a "module price catalog" needs — one entry per module keyed by e.g. `"module:crm"` or similar, with `unitPrice` and `description`. The existing `lookupPrice()` flow is unneeded for platform bookings (the platform writes `unitPrice` directly into the position template); `BillingPriceList` is only needed as a **source of truth** for "current price of module X" that the Phase 10 bridge can query when creating a new booking.

**Service**: `src/lib/services/billing-price-list-service.ts`

#### 1.6 BillingRecurringInvoice — THE critical model

`prisma/schema.prisma:1081-1120`

Fields:

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `tenantId` | UUID | FK → Tenant |
| `name` | String | human-readable label |
| `addressId` | UUID | FK → CrmAddress, **required** |
| `contactId?` | UUID? | FK → CrmContact, optional |
| `interval` | `BillingRecurringInterval` enum | `MONTHLY`, `QUARTERLY`, `SEMI_ANNUALLY`, `ANNUALLY` |
| `startDate` | Timestamptz | required |
| `endDate?` | Timestamptz? | auto-deactivates when `nextDueDate > endDate` |
| `nextDueDate` | Timestamptz | initialized to `startDate`; advanced by the cron after each run |
| `lastGeneratedAt?` | Timestamptz? | set after each successful generation |
| `autoGenerate` | Boolean | default `false` — cron only processes rows where this is true |
| `isActive` | Boolean | default `true` |
| `deliveryType?`, `deliveryTerms?`, `paymentTermDays?`, `discountPercent?`, `discountDays?`, `notes?`, `internalNotes?` | | all copied verbatim onto the generated BillingDocument |
| `positionTemplate` | JSONB | array of position objects (opaque to Prisma) |
| `createdAt`, `updatedAt`, `createdById?` | | `createdById` is reused as `generatedById` by the cron |

**`positionTemplate` JSONB shape** (inferred from `billing-recurring-invoice-service.ts:362-372`): array of `{ type, articleId?, articleNumber?, description?, quantity?, unit?, unitPrice?, flatCosts?, vatRate? }` objects. No Prisma type validation — caller must produce valid data.

**Indexes**: `(tenantId, isActive)`, `(tenantId, nextDueDate)`.

**Materialization** — `generate(prisma, tenantId, recurringId, generatedById, audit?)` at `src/lib/services/billing-recurring-invoice-service.ts:314-425`:

Wrapped in a single `prisma.$transaction`:
1. Loads the template, validates `isActive=true` and `nextDueDate ≤ endDate`
2. Gets next invoice number via `numberSeqService.getNextNumber(tx, tenantId, "invoice")`
3. Creates a `BillingDocument` with `type: "INVOICE"`, `documentDate: template.nextDueDate`, all copied fields, status **`DRAFT`**
4. Expands `positionTemplate` JSONB into concrete `BillingDocumentPosition` rows via `createManyPositions`
5. Calls `recalculateTotals(tx, tenantId, invoiceDoc.id)` to fill in `subtotalNet`/`totalVat`/`totalGross`
6. Advances `nextDueDate` by the interval (via `calculateNextDueDate()`) and sets `lastGeneratedAt = now()`
7. If the new `nextDueDate > endDate`, also sets `isActive = false`
8. Returns the created `BillingDocument`

**The generated document is left in DRAFT status** — not finalized. No PDF is generated. No email is sent. The operator (or a separate pipeline) must explicitly call `finalize()` to trigger the PDF+XRechnung generation and then `email.send.send` to deliver it.

**Cron trigger** — `src/app/api/cron/recurring-invoices/route.ts` + `vercel.json` schedule `0 4 * * *` (daily 04:00 UTC):

1. Inline `CRON_SECRET` Bearer check
2. Computes `runKey = today.toISOString().slice(0, 10)` (YYYY-MM-DD)
3. Loads completed `CronCheckpoint` rows for this run into a Set (composite key `"${tenantId}:${templateId}"` — **not a UUID**)
4. Cleans checkpoints older than 30 days
5. Calls `recurringService.generateDue(prisma, today, { cronName, runKey, completedKeys })`

**`generateDue()` cross-tenant query** — `billing-recurring-invoice-service.ts:429-515` + `billing-recurring-invoice-repository.ts:140-153`:

```ts
prisma.billingRecurringInvoice.findMany({
  where: {
    isActive: true,
    autoGenerate: true,
    nextDueDate: { lte: today },
  },
  // no tenantId filter — cross-tenant by design
})
```

For each result, calls `generate()` with `template.tenantId`. Skipped templates are those already in `completedKeys`. On per-template failure, increments `failed` counter and continues. After success, upserts a checkpoint row.

**Can a recurring invoice be created by platform code with `{ tenantId, crmAddressId, positions, cycle, startDate }`?** — Yes. `create(prisma, tenantId, input, createdById, audit?)` at `billing-recurring-invoice-service.ts:94-186` takes `tenantId` as a plain string. Required input: `name`, `addressId`, `interval`, `startDate`, non-empty `positionTemplate` array. Validates address/contact exist and `endDate > startDate`.

**Router**: `src/trpc/routers/billing/recurringInvoices.ts` — `generateDue` is also exposed as a tenant tRPC mutation with `REC_GENERATE` permission for manual triggering.

#### 1.7 BillingPayment

`prisma/schema.prisma:996-1018`

Payment tracking. Fields: `documentId` (FK → BillingDocument), `date`, `amount` (Float), `type` (`CASH` / `BANK`), `status` (`ACTIVE` / `CANCELLED`), `isDiscount` (for Skonto writeoffs), `notes`, `cancelledAt`, `cancelledById`.

**Payment state is always computed**, never stored on the document. `computePaymentStatus()` at `billing-payment-service.ts:34-43` returns `"UNPAID" | "PARTIAL" | "PAID" | "OVERPAID"` based on sum of ACTIVE payment amounts vs `effectiveTotalGross = totalGross − sum(CREDIT_NOTE children.totalGross)`, with 0.01 tolerance.

`isOverdue()` at line 55-62: `dueDate = documentDate + paymentTermDays; overdue = dueDate < now && status !== "PAID" && status !== "OVERPAID"`.

**No "import" path**: all payments are entered manually. There is no `source`, `importedAt`, or bank-import column. No payment webhook or reconciliation job exists. `listOpenItems()` / `getOpenItemsSummary()` are the query paths the tenant-side UI uses to surface "what's unpaid".

**Relevance for Phase 10**: The operator tenant will use the existing tenant-side UI to track who paid what — nothing on the platform needs to know about payments directly. `isOverdue()` is a free feature once the bridge creates `BillingDocument` rows.

#### 1.8 BillingServiceCase

`prisma/schema.prisma:936-971`

Field-service case tracking (Kundendienst). Separate workflow `OPEN → IN_PROGRESS → CLOSED → INVOICED` with `createInvoice()` that creates a DRAFT `BillingDocument`. **Not relevant for subscription billing** — this is for one-off service jobs with their own lifecycle.

### 2. PDF + email delivery path

#### 2.1 PDF generation

**Library**: `@react-pdf/renderer` (imported at `src/lib/services/billing-document-pdf-service.ts:5`).

**Template**: React component tree rooted at `BillingDocumentPdf` in `src/lib/pdf/billing-document-pdf.tsx:96`. Sub-components:
- `src/lib/pdf/rich-text-pdf.tsx` — renders `headerText`/`footerText` HTML
- `src/lib/pdf/position-table-pdf.tsx` — positions table
- `src/lib/pdf/totals-summary-pdf.tsx` — net/VAT/gross totals
- `src/lib/pdf/fusszeile-pdf.tsx` — absolute-positioned footer with tenant banking/legal info

**Storage**: Supabase Storage bucket `"documents"` (private). Path pattern from `src/lib/pdf/pdf-storage.ts:27-36`: `{DOCUMENT_TYPE_PATH}/{sanitized(number_company)}.pdf` (e.g. `rechnung/RE-2024-0001_Mueller_GmbH.pdf`).

**`BillingDocument.pdfUrl`**: stores the **storage path**, not a URL. Signed URLs are generated on-demand by `getSignedDownloadUrl()` at `billing-document-pdf-service.ts:117` with 60-second expiry.

**Automatic generation**: During `billing-document-service.finalize()` at line 571-577, after the transaction commits. Best-effort — a PDF failure is logged but does not roll back finalization.

**Manual generation**: `billing.documents.downloadPdf` tRPC mutation regenerates if missing.

#### 2.2 E-invoice XML (XRechnung / ZUGFeRD)

**Library**: `@e-invoice-eu/core` (`InvoiceService` at `src/lib/services/billing-document-einvoice-service.ts:2`). Supports two modes: `"CII"` for standalone XML and `"Factur-X-EN16931"` for XML-embedded PDF/A-3.

**Storage**: Same `documents` bucket; XML at `{type}/{number_company}.xml`. ZUGFeRD PDF/A-3 **overwrites** the plain PDF at the same `pdfUrl` path.

**Gate**: `BillingTenantConfig.eInvoiceEnabled=true` + `doc.type IN (INVOICE, CREDIT_NOTE)`. Triggered automatically in `finalize()` at line 583-592, only if plain PDF generation succeeded.

**Validation** — `validateEInvoiceRequirements()` at line 51-81: requires seller `companyName`/street/zip/city/(taxId|taxNumber); requires buyer `company`/street/zip/city/country; requires at least one ARTICLE or FREE position. Throws `EInvoiceValidationError` with a `missingFields` array.

#### 2.3 Email delivery — generic, not billing-specific

**There is no `billing-document-email-service.ts`**. Billing invoices use the generic `email-send-service.ts`.

**tRPC entry point**: `email.send.send` at `src/trpc/routers/email/send.ts:47-61`. `tenantProcedure` mutation, requires `documents.send` permission. Calls `emailSendService.send(prisma, tenantId, input, userId)`.

**`email-send-service.send()`** flow at `src/lib/services/email-send-service.ts:77`:

1. Load `TenantSmtpConfig` via `smtpConfigService.get(prisma, tenantId)` — throws `SmtpNotConfiguredError` if absent
2. Load document data via `getDocumentData()` → dispatches to `buildBillingDocumentEmailData()` at `src/lib/services/email-document-context.ts:45-93` — queries `billingDocument` with relations, returns `DocumentEmailData` including `pdfStoragePath`
3. Download PDF from storage as `Buffer` — throws `DocumentPdfNotFoundError` if missing
4. Wrap body HTML via `renderBaseEmail()` from `src/lib/email/templates/base-document-email.ts:14`
5. Build attachments (always PDF first; optionally adds `emailDefaultAttachment` rows from DB)
6. Create `EmailSendLog` row with `status: "pending"`
7. Build nodemailer transporter via `smtpConfigService.createTransporter(smtpConfig)` — SSL→`secure:true`, NONE→`tls.rejectUnauthorized:false`
8. `transporter.sendMail(...)` with PDF as inline `Buffer` content
9. On success: `sendLogRepo.markSent()`; on failure with retries remaining: `markRetrying()` with exponential backoff 1min/5min/15min (max 3 retries, from `RETRY_DELAYS` at line 28); after max retries: `markFailed()`

**Pre-send context query**: `email.send.getContext` → `getDocumentEmailContext()` at `email-send-service.ts:221-279`. Resolves the default `EmailTemplate` for the document type (DB table first, then code-level fallback at `src/lib/email/default-templates.ts`), runs placeholder substitution (`{Kundenname}`, `{Anrede}`, `{Dokumentennummer}`, `{Betrag}`, `{Fälligkeitsdatum}`, etc.) via `src/lib/services/email-placeholder-resolver.ts:28-37`, returns pre-filled `subject`/`bodyHtml`/`recipient`/`canSend`/`smtpConfigured`.

**`EmailSendLog` schema** includes: `tenantId`, `documentId`, `documentType`, `toEmail`, `ccEmails[]`, `subject`, `bodyHtml`, `templateId?`, `sentBy?`, `status`, `sentAt`, `retryCount`, `nextRetryAt`, `errorMessage`.

**Retry cron**: `GET /api/cron/email-retry` at `src/app/api/cron/email-retry/route.ts` — `*/5 * * * *`. Fetches up to 50 rows where `status IN ('pending','retrying') AND (nextRetryAt IS NULL OR nextRetryAt ≤ now)`, re-attempts via fresh transporter, re-downloads PDF from `billingDocument.pdfUrl` if needed. Cross-tenant, no tenantId parameter.

**`user-welcome-email-service.ts`** (referenced from the demo-tenant plan) follows the same pattern — also accepts `tenantId` as a plain parameter, no tRPC context coupling. Confirms the billing email path is callable from any server-side context.

### 3. Cron infrastructure

**All cron routes in `src/app/api/cron/`**:

| Path | Schedule (`vercel.json`) | Purpose |
|---|---|---|
| `calculate-days` | `0 2 * * *` | Daily daily-value recalculation per tenant |
| `calculate-months` | `0 3 2 * *` | Monthly time-account per tenant |
| `execute-macros` | `*/15 * * * *` | Run due macros per tenant |
| `generate-day-plans` | `0 1 * * 0` | Weekly day-plan generation per tenant |
| `recurring-invoices` | `0 4 * * *` | **Recurring invoice generation — the critical one** |
| `wh-corrections` | `0 6 * * *` | Warehouse corrections (only tenants with `warehouse` module) |
| `email-retry` | `*/5 * * * *` | Email retry across all tenants |
| `email-imap-poll` | `*/3 * * * *` | IMAP polling for inbound invoices |
| `inbound-invoice-escalations` | `0 * * * *` | Overdue approval reminders |
| `expire-demo-tenants` | `0 1 * * *` | Demo tenant expiry |
| `platform-cleanup` | `*/5 * * * *` | Stale support sessions + login attempts |
| `dsgvo-retention` | *(not in vercel.json)* | Suspended — manual only |
| `export-template-schedules` | *(not in vercel.json)* | Suspended — requires `EXPORT_SCHEDULES_CRON_ENABLED=true` |

**Auth pattern** — copy-pasted inline in every route (e.g. `src/app/api/cron/recurring-invoices/route.ts:23-30`):

```ts
const authHeader = request.headers.get("authorization")
const cronSecret = process.env.CRON_SECRET
if (!cronSecret) return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
if (authHeader !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
```

There is **no shared wrapper or middleware** — each route re-implements this block.

**Per-tenant iteration pattern**: Most routes call `prisma.tenant.findMany({ where: { isActive: true }, select: { id: true } })` then loop sequentially with per-tenant `try/catch` + skip-and-continue on errors. `wh-corrections` filters by tenant module. `email-retry`, `email-imap-poll`, `inbound-invoice-escalations`, `recurring-invoices`, `platform-cleanup` operate cross-tenant without a tenant loop (they query on other conditions directly).

**Checkpoint idempotency** — `CronCheckpoint` model at `prisma/schema.prisma:4556-4572`:

```
model CronCheckpoint {
  id, cronName (VarChar 100), runKey (VarChar 255), tenantId (Uuid),
  status (default "completed"), durationMs?, createdAt
  @@unique([cronName, runKey, tenantId])
}
```

Used by `calculate-days`, `calculate-months`, `execute-macros`, `generate-day-plans`, `recurring-invoices`, `expire-demo-tenants`. Pattern: at start, load completed checkpoints for current `runKey` into a Set; skip those during the loop; upsert after success; delete checkpoints older than 30 days at the start of each run.

**Note on `recurring-invoices` checkpoint key**: The route stores checkpoints with `tenantId` set to the composite string `"${tenantId}:${templateId}"` (see `billing-recurring-invoice-service.ts:452,487`). The unique constraint on `(cronName, runKey, tenantId)` in Postgres works only because the `tenant_id` column accepts arbitrary UUID-shaped strings — the composite encoding is a documented quirk, not a bug.

**Execution logging** — `CronExecutionLogger` at `src/lib/services/cron-execution-logger.ts` writes to `Schedule`/`ScheduleExecution`/`ScheduleTaskExecution` models. Used by `calculate-days`, `calculate-months`, `execute-macros`, `generate-day-plans`. **`recurring-invoices` does NOT use it** — no Schedule rows are written for that cron.

### 4. CRM address model + link to billing

#### 4.1 CrmAddress

`prisma/schema.prisma:359-418`

Customer/supplier master record. Key fields:

- `id`, `tenantId`, `number` (auto from `NumberSequence` — `"customer"` prefix `K-` or `"supplier"` prefix `L-`)
- `type` (`CrmAddressType` — `CUSTOMER`, `SUPPLIER`, `BOTH`) — **default `CUSTOMER`**
- `company` (**required**), `street?`, `zip?`, `city?`, `country?` (default `"DE"`)
- `phone?`, `fax?`, `email?` (address-level), `website?`
- `taxNumber?` (Steuernummer), `vatId?` (USt-IdNr.), `leitwegId?` (XRechnung BuyerReference)
- `matchCode?` (auto-generated from `company.toUpperCase().slice(0,20)` if blank)
- `paymentTermDays?`, `discountPercent?`/`discountDays?` (per-customer default Skonto)
- `ourCustomerNumber?`
- `salesPriceListId?` / `purchasePriceListId?` (FKs to `BillingPriceList`)
- `isActive` (soft-delete flag), `createdAt`, `updatedAt`, `createdById?`
- `parentAddressId?` — self-ref for 2-level hierarchy (subsidiaries)

Unique constraint: `@@unique([tenantId, number])`.

**Relations that matter for billing**: `billingDocuments`, `billingDocumentsDelivery` (via `"DeliveryAddress"`), `billingDocumentsInvoice` (via `"InvoiceAddress"`), `billingServiceCases`, `billingRecurringInvoices`, `salesPriceList`, `purchasePriceList`.

#### 4.2 CrmContact

`prisma/schema.prisma:426-457`

Person-at-customer records. Fields: `addressId` (FK to `CrmAddress`, cascade), `firstName`, `lastName`, `salutation?` (`"Herr"`/`"Frau"`/`"Divers"`), `title?`, `letterSalutation?` (auto-generated), `position?`, `department?`, `phone?`, `email?`, `notes?`, `isPrimary`.

#### 4.3 Billing FKs to CRM

- **`BillingDocument.addressId`** — **required, non-nullable** (`schema.prisma:758`)
- **`BillingDocument.contactId`** — optional, `onDelete: SetNull`
- **`BillingRecurringInvoice.addressId`** — **required, non-nullable** (`schema.prisma:1085`)
- **`BillingRecurringInvoice.contactId`** — optional, `onDelete: SetNull`

Both `BillingDocument` and `BillingRecurringInvoice` require a `CrmAddress` to exist before they can be created. The FK has no `onDelete` clause, meaning restrict by default — a `CrmAddress` with billing documents cannot be deleted.

#### 4.4 Programmatic CrmAddress/CrmContact creation

**`crm-address-service.create(prisma, tenantId, input, createdById, audit?)`** at `src/lib/services/crm-address-service.ts:135-216`:
- Minimum required: `company` (non-empty after trim)
- Side effects: auto-generates `number` via `numberSeqService.getNextNumber(prisma, tenantId, "customer"|"supplier")`; auto-generates `matchCode` from company; writes fire-and-forget audit log
- Accepts `tenantId` as plain string — callable from platform code

**`crm-address-service.createContact(prisma, tenantId, input, audit?)`** at line 559-621:
- Required: `addressId` (must exist in same tenantId), `firstName`, `lastName`
- Side effects: auto-generates `letterSalutation`; fire-and-forget audit log
- Accepts `tenantId` as plain string

#### 4.5 Minimum data to render an invoice PDF + XRechnung

**PDF** (`billing-document-pdf-service.ts:38-41`) reads `CrmAddress.{company, street, zip, city}`. All four are nullable in the schema; no runtime validation.

**XRechnung** (`billing-document-einvoice-service.validateEInvoiceRequirements()` lines 51-81) requires on the **buyer**:
- `address.company`
- `address.street`
- `address.zip`
- `address.city`
- `address.country`

`vatId` and `leitwegId` are **not** required but are included in the XML when present. The service throws `EInvoiceValidationError` listing missing fields if any buyer or seller field is absent.

**Email delivery**: No single "recipient email" field is built into billing document creation. The email recipient is resolved at `email.send.send` time via `getDocumentEmailContext()` which queries `CrmAddress.email` and/or `CrmContact.email` to populate the `recipient` field for the pre-send dialog. The operator (or an automated caller) chooses which to use when calling `email.send.send`.

#### 4.6 Cross-tenant linkage between Tenant and CrmAddress

**None exists.** The `Tenant` model has no `crmAddressId`, no FK to `CrmAddress`, no join table. `Tenant` has inline address fields (`addressStreet`, `addressZip`, `addressCity`, `addressCountry`) as plain `String?` columns but these are for the tenant's own headquarters, not for any cross-tenant customer record.

Searching `prisma/schema.prisma` for `crmAddressId`, `crm_address_id`, `sourceTenantId`, `billedTenantId`, `linkedCrmAddressId` returns zero matches.

**Consequence for the bridge**: when Operator Tenant books a module for TERP Customer Tenant, the bridge must explicitly create (or find-by-match) a `CrmAddress` inside the Operator Tenant that represents the TERP Customer Tenant. There is no existing mechanism — Phase 10 has to design one.

### 5. Platform state (Phase 9)

#### 5.1 TenantModule after Phase 9 rename

`prisma/schema.prisma:291-306`:

| Prisma field | DB column | Type | Notes |
|---|---|---|---|
| `id` | | UUID | PK |
| `tenantId` | `tenant_id` | UUID | FK cascade |
| `module` | | VARCHAR(50) | e.g. `"core"`, `"crm"` |
| `enabledAt` | `enabled_at` | Timestamptz | default now |
| `enabledById?` | `enabled_by_id` | UUID? | FK → users, SetNull |
| `enabledByPlatformUserId?` | `enabled_by_platform_user_id` | UUID? | **no FK** — soft ref |
| `operatorNote?` | `operator_note` | VARCHAR(255)? | free-text breadcrumb |

Unique: `@@unique([tenantId, module])`. Partial index on `operator_note` where non-null.

**No subscription-state columns**: there is no `startDate`, `endDate`, `cancellationScheduledFor`, `billingCycle`, `unitPrice`, `billingRecurringInvoiceId`, `paymentMethod`, or similar on `tenant_modules`. Everything about subscription lifecycle needs to either (a) go on this table as new columns or (b) live in a new `platform_subscriptions` table that joins via `(tenantId, module)`.

#### 5.2 platform_audit_logs

`prisma/schema.prisma:1227-1245`:

No FK constraints anywhere (all UUID columns are soft refs so deleted operators/tenants don't lose history). Written via `platformAudit.log(prisma, data)` at `src/lib/platform/audit-service.ts:82-108` — fire-and-forget, never throws. Already used by every mutation in `tenantManagement.ts`.

#### 5.3 platformTenantManagementRouter

`src/trpc/platform/routers/tenantManagement.ts` — 11 procedures (`list`, `getById`, `create`, `update`, `deactivate`, `reactivate`, `softDelete`, `listModules`, `enableModule`, `disableModule`). All use `platformAuthedProcedure`. `create` runs `users-service.create` from inside a platform `$transaction`, passing `PLATFORM_SYSTEM_USER_ID` as the audit-context `userId`.

`tenantIdSchema` at line 33-36 accepts any hex-shaped UUID string (not strictly v4), so dev fixture `10000000-0000-0000-0000-000000000001` passes.

#### 5.4 PLATFORM_SYSTEM_USER_ID sentinel

`src/trpc/init.ts:33-34` — constant `"00000000-0000-0000-0000-00000000beef"`. Corresponding `public.users` row created by `supabase/migrations/20260421200000_create_platform_system_user.sql` with `email: platform-system@internal.terp`, `role: system` (the migration widens the `valid_role` CHECK), `tenant_id: NULL`, `is_active: false`, `is_locked: true`. **No `auth.users` row** — the sentinel cannot log in.

Used in two places:
1. `src/trpc/init.ts:185` — impersonation branch loads this user to synthesize `ContextUser`
2. `src/trpc/platform/routers/tenantManagement.ts:198` — `create` passes this as `audit.userId` when calling `users-service.create` so tenant-side `audit_logs` entries have a valid FK target

#### 5.5 Cross-tenant writes from platform code — the critical answer

**Yes, `platformAuthedProcedure` can directly call tenant-scoped services** by passing `prisma` + an explicit `tenantId` string.

All tenant-scoped services in `src/lib/services/` are fully self-contained:
- `billing-recurring-invoice-service.create(prisma, tenantId, input, createdById, audit?)`
- `billing-document-service.create(prisma, tenantId, input, createdById, audit?)`
- `billing-document-service.finalize(prisma, tenantId, id, finalizedById, orderParams?, audit?)`
- `crm-address-service.create(prisma, tenantId, input, createdById, audit?)`
- `email-send-service.send(prisma, tenantId, input, userId)`

All accept `tenantId` as a plain parameter. None pull `tenantId` from an ambient context.

#### 5.6 Audit behavior when platform code writes into tenant data

`audit-logs-service.log()` at line 177 calls `getImpersonation()` which reads `impersonationStorage.getStore()`. The storage is only populated via `impersonationStorage.run(ctx.impersonation, () => next())` inside the `impersonationBoundary` middleware at `src/trpc/init.ts:308-314`.

**Crucially: this middleware lives on the tenant tRPC instance, not the platform tRPC instance.** The two are separate `initTRPC.context<...>().create(...)` calls:
- Tenant: `src/trpc/init.ts` — `publicProcedure = t.procedure.use(impersonationBoundary)` at line 323
- Platform: `src/trpc/platform/init.ts` — independent `t = initTRPC.context<PlatformTRPCContext>().create(...)` at line 158, no impersonation boundary

**Consequence**: when a `platformAuthedProcedure` handler calls a tenant service that internally calls `auditLog.log()`, `getImpersonation()` returns `null`. The audit write lands only in tenant `audit_logs` — not in `platform_audit_logs`. The platform-side audit row must be written explicitly by the handler via `platformAudit.log(ctx.prisma, {...})`.

This means Phase 10 bridge code must dual-log manually: call the tenant service (which writes its own tenant-audit row) and then explicitly call `platformAudit.log()` for the platform-side record. The existing `tenantManagement.ts` procedures already follow this pattern.

**There is no risk of accidentally polluting `platform_audit_logs` with `impersonation.*`-prefixed entries when platform billing code runs** — because the impersonation boundary is never activated on platform procedures.

### 6. Environment configuration + multi-environment concerns

#### 6.1 Config structure

`src/lib/config.ts`:

- `serverEnv` at line 8-44 — plain object literal with `as const`. Each field is `process.env.X ?? '' | defaultValue`. **No Zod schema.**
- `clientEnv` at line 47-56 — same pattern for `NEXT_PUBLIC_*` vars.
- `isDev` / `isProd` — derived booleans.
- `validateEnv()` at line 65-81 — plain array of required keys, filters missing, throws `Error` listing them. Required list: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `INTERNAL_API_KEY`, `ANTHROPIC_API_KEY`, `FIELD_ENCRYPTION_KEY_V1`, `PLATFORM_JWT_SECRET`.
- **Optional vars** (not in required list): `PLATFORM_IMPERSONATION_ENABLED`, `PLATFORM_COOKIE_DOMAIN`.

**Pattern for adding a new optional env var like `PLATFORM_OPERATOR_TENANT_ID`**: add a new line to `serverEnv` with `process.env.PLATFORM_OPERATOR_TENANT_ID ?? ''`, optionally add a getter if runtime re-read is needed (like `platformImpersonationEnabled` at line 41-43). Do **not** add it to `required[]` unless absolutely necessary — the recommended behavior is "optional, with runtime feature-gate".

#### 6.2 Startup validation

`src/instrumentation.ts:1-6`:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv } = await import('./lib/config')
    validateEnv()
  }
}
```

Called by Next.js during server startup on the Node.js runtime only (not Edge). Dynamic import prevents it from running at build time.

**A future `PLATFORM_OPERATOR_TENANT_ID` validator** (if e.g. "must be a real, active tenant id if set") would extend `validateEnv()` — but the current implementation only checks presence, not DB existence. Any "does the tenant exist" check would need to be a new startup routine, possibly separate from `validateEnv()` to keep concerns separated.

#### 6.3 Dev tenant seeding

`supabase/seed.sql`:

- Line 113-120: dev tenant insert — `id = '10000000-0000-0000-0000-000000000001'`, `name = 'Dev Company'`, `slug = 'dev-company'`, `is_active = true`. `ON CONFLICT (id) DO NOTHING`.
- All subsequent seed data uses this fixed UUID.
- Two `auth.users`: `admin@dev.local` (ID ...0001), `user@dev.local` (...0002)
- Two `user_groups`: Administrators (isAdmin=true), Users
- `user_tenants` memberships for both users
- `tenant_modules` seed at line 1907-1913 + line 3929-3931: `core`, `crm`, `billing`, `warehouse`, `inbound_invoices` — **all 5 modules enabled on the dev tenant**
- Employees, departments, day plans, tariffs, holidays, bookings, billing documents, warehouse data, HR entries — all tenant-scoped

**No environment branching**. The file has a single code path. Staging and prod do not run this seed — they receive only migrations via `pnpm db:push:staging`. Tenants on staging/prod are created via the `platformTenantManagementRouter.create` procedure.

**"Operator home tenant" concept**: zero matches across the codebase for `operator.*home`, `PLATFORM_OPERATOR_TENANT`, `operator_tenant`, `operatorTenant`, `homeTenant`. Phase 10 introduces this concept from scratch.

## The bridge architecture — what has to be built

This is intentionally a sketch for the subsequent plan. It is not a commitment.

### Components

1. **Env var** `PLATFORM_OPERATOR_TENANT_ID` (optional)
   - New line in `serverEnv`
   - Optional startup validation: if set, log a warning (not a fatal error) if the tenant does not exist or is inactive
   - The rest of the platform continues to work if the var is empty — the "subscription billing" UI simply stays hidden

2. **Subscription-state persistence**
   - Either (a) extend `tenant_modules` with new columns: `start_date`, `end_date`, `cancellation_scheduled_for`, `billing_cycle` (enum), `unit_price` (Float), `operator_billing_recurring_invoice_id` (UUID? FK to `BillingRecurringInvoice`), `payment_method` (enum), `sepa_mandate_ref` (for 10b)
   - Or (b) create a new `platform_subscriptions` table with (`tenant_id`, `module`) as the join key and all subscription metadata there, leaving `tenant_modules` as the "what's currently active" view only
   - Decision deferred to the plan

3. **Price catalog**
   - Option (a): add `platform_module_prices` table with (`module`, `cycle`) → `unit_price` for the default catalog
   - Option (b): use a `BillingPriceList` inside the operator tenant with `itemKey = "module:crm"` etc. as the source of truth, and have the platform read from it via `billing-price-list-service.list/listEntries(prisma, OPERATOR_TENANT_ID)`
   - Option (b) is more dogfood-consistent but requires the platform to read tenant data (still fine from `platformAuthedProcedure`)

4. **CrmAddress auto-creation on first booking**
   - When Operator Tenant first books a module for TERP Customer "Müller GmbH", the bridge code calls `crm-address-service.create(prisma, OPERATOR_TENANT_ID, { company: customerTenant.name, street: customerTenant.addressStreet, zip: ..., city: ..., country: ..., email: customerTenant.email }, PLATFORM_SYSTEM_USER_ID)`
   - The resulting `crmAddressId` is stored on `platform_subscriptions` (or on `tenant_modules` as a new column) as the persistent link
   - On subsequent bookings for the same customer tenant, the stored `crmAddressId` is reused
   - If the customer tenant's name/address changes later, there is no existing sync — the operator has to update the `CrmAddress` manually (out of scope for 10a)

5. **`BillingRecurringInvoice` creation per booking**
   - On `enableModule` success in `tenantManagement.ts`: if `PLATFORM_OPERATOR_TENANT_ID` is set, additionally call `billing-recurring-invoice-service.create(prisma, OPERATOR_TENANT_ID, { name: "Abo ${customer.name} — ${module}", addressId: crmAddressId, interval: "MONTHLY" | "ANNUALLY", startDate, positionTemplate: [{ type: "FREE", description: "Modul: ${module}", quantity: 1, unitPrice: priceFromCatalog, vatRate: 19 }], autoGenerate: true }, PLATFORM_SYSTEM_USER_ID)`
   - The returned `recurringInvoiceId` is stored on `platform_subscriptions`/`tenant_modules`
   - On `disableModule`: the bridge sets `endDate` on the existing `BillingRecurringInvoice` (via `update()`) so it stops generating after the end of the current billing period

6. **Auto-finalize + auto-email of generated DRAFT invoices**
   - The existing `/api/cron/recurring-invoices` leaves `BillingDocument` rows in `DRAFT`. Phase 10 needs a follow-up step:
     - Either extend the existing cron to optionally call `finalize()` and then `email.send.send()` if a flag on the recurring template is set
     - Or add a **new** cron at `/api/cron/platform-subscription-autofinalize` that scans for DRAFT invoices originating from operator-tenant recurring templates and finalizes + emails them
     - Either approach requires knowing which templates "belong to" the platform subscription flow vs. regular tenant-side recurring invoices — see open question 3 below

7. **Platform UI for subscription management**
   - On `/platform/tenants/[id]/modules`: display `unit_price`, `billing_cycle`, `next_billing_date`, `operator_note`, link to the latest generated invoice in the operator tenant
   - Possibly a new page `/platform/subscriptions` with MRR, overdue, upcoming renewals — but this can also live as tabs on the tenant detail page for minimal UI changes in 10a

### Out of scope for Phase 10a (explicit)

- **SEPA Lastschrift** (pain.008.xml, mandate management) — deferred to 10b
- **Automated dunning / Mahnlauf** — operator checks manually via tenant-side `listOpenItems`
- **Platform-side overdue dashboard** — operator uses tenant-side billing UI for this
- **Individual per-tenant pricing overrides beyond simple `unit_price` on the subscription row** — no tiered discounts, no volume pricing, no promotional codes
- **Tax exemption edge cases, reverse charge** — use operator tenant's VAT rate at position level
- **Payment-provider webhooks** (Stripe, etc.)
- **Support session mechanism** (Phase 6/7 consent flow for Fremd-Tenants) — **remains untouched**. The operator continues to use Support Sessions + Impersonation for reading into OTHER customers' tenant data. Phase 10 is orthogonal to this: billing for customers via the operator tenant, not a change to impersonation.
- **Multi-currency** — EUR only
- **Invoice numbering strategy** — reuses existing operator tenant's `NumberSequence` `"invoice"` key

## Open Questions

These are the decisions the subsequent plan must resolve. Each has at least two reasonable answers and the research deliberately does not commit to one.

### Q1: Subscription-state table or columns on `tenant_modules`?

**Option A**: Extend `tenant_modules` with 7-8 new columns (`start_date`, `end_date`, `cancellation_scheduled_for`, `billing_cycle`, `unit_price`, `operator_billing_recurring_invoice_id`, `payment_method`, `sepa_mandate_ref`).
- Pro: single table, one row per active subscription, easy to query
- Con: mixes Phase 9's "control plane" with Phase 10's "billing state"; table grows wider and its purpose blurs

**Option B**: New `platform_subscriptions` table keyed on `(tenant_id, module)` with all the lifecycle fields.
- Pro: separation of concerns, `tenant_modules` stays a pure enable/disable toggle
- Con: join required for every query; two tables to keep in sync; on deactivate, do we delete the subscription or just set `end_date`?

**My opinionated lean** (as researcher, not as plan author): **Option B** because subscription history (even after cancellation) is valuable — the operator wants to see "Müller GmbH had CRM from 2026-01 to 2026-06 then downgraded". `tenant_modules` as-is doesn't model history (deletion loses information).

### Q2: Price catalog location — platform table or operator tenant BillingPriceList?

**Option A**: New `platform_module_prices` table with `(module, cycle) → unit_price`. Platform owns the catalog; operator tenant doesn't need any configuration.
- Pro: platform is self-contained, no operator-tenant dependency for pricing
- Con: duplicates the concept of a "price list" — TERP already has `BillingPriceList`

**Option B**: A `BillingPriceList` inside the operator tenant with `itemKey = "module:crm"` etc. Platform reads it via `billing-price-list-service.listEntries(prisma, OPERATOR_TENANT_ID, priceListId)`.
- Pro: maximum dogfood — you use your own product to manage your own prices; the operator can adjust prices from the tenant-side UI they already know
- Con: tightly couples the platform to the operator tenant's price list id; what if the operator deletes it?

**My opinionated lean**: **Option B with a designated price list** (e.g. look up by `name = "platform_modules"` or store the id in env / a `platform_config` table). The dogfood consistency is exactly what you want — you edit module prices in the same UI you edit customer prices, with the same version history.

### Q3: Auto-finalize + auto-email — extend existing cron or new cron?

**Option A**: Extend `/api/cron/recurring-invoices` with an optional `autoFinalize` + `autoEmail` flag on `BillingRecurringInvoice` (new Boolean columns). If true, after successful `generate()`, the cron also calls `finalize()` and `email.send.send()`.
- Pro: one cron to rule them all; minimal new infrastructure
- Con: changes a shared cron that also serves normal tenant-side recurring invoices; risk of affecting other tenants

**Option B**: New cron `/api/cron/platform-subscription-autofinalize` that runs after `recurring-invoices` (e.g. 04:15 UTC). Finds DRAFT invoices in the operator tenant created today by the recurring flow, finalizes + emails them.
- Pro: clean separation; no change to the existing cron
- Con: two crons to monitor; more wiring; potentially a race if a normal recurring-invoice run takes longer than expected

**My opinionated lean**: **Option A** with the new Boolean columns. It's less new infrastructure and the existing cron is already well-tested for the generate path. But the plan should carefully specify that `autoFinalize` only runs for templates where both columns are explicitly set to `true`, so existing tenant-side recurring invoices are unaffected.

### Q4: How does the bridge know which `CrmAddress` represents a customer tenant?

The Phase 10 bridge needs a stable way to look up "the `CrmAddress` inside the operator tenant that represents TERP customer tenant X" on every subsequent booking for the same customer.

**Option A**: Store the operator-tenant `crmAddressId` in a new column on the new `platform_subscriptions` table (or on `tenant_modules`). Works per-subscription, but the same customer booking a second module has to re-look-up the first subscription to find the address.

**Option B**: New table `platform_tenant_customer_mapping` with `(customer_tenant_id, operator_crm_address_id)` as a 1:1 mapping. Cleaner: one lookup per customer regardless of how many modules.

**Option C**: Store the customer tenant id in a new column on `CrmAddress` inside the operator tenant — e.g. `linked_customer_tenant_id UUID?`. Can be looked up with a single `findFirst({ where: { tenantId: OPERATOR_TENANT_ID, linkedCustomerTenantId } })`.
- Pro: no new table
- Con: pollutes the tenant-side `crm_addresses` model with a platform-specific column

**My opinionated lean**: **Option B**. It's one extra table but keeps the tenant-side model clean and the mapping explicit. The table is tiny (one row per customer tenant ever).

### Q5: Billing cycle granularity — per subscription or per module?

Is the billing cycle (monthly/annually) set once per tenant, or can the same customer have CRM monthly and Billing annually?

- If per-subscription: flexibility, matches real-world sales negotiations
- If per-tenant: simplicity, one `BillingRecurringInvoice` per tenant covering all modules

**My opinionated lean**: **per-subscription**. Easy to model (each subscription has its own `BillingRecurringInvoice`) and matches how SaaS billing actually works.

### Q6: What happens to the generated `BillingDocument` when a module is disabled mid-cycle?

Scenarios:
- Customer cancels CRM on 2026-04-15, billing cycle is monthly starting on 1st
- Do we: (a) stop immediately, issue a pro-rated credit note for the 15 unused days, (b) run the subscription to end of month then stop, (c) run to end of the **paid-through** period (which for monthly = already done), then stop
- Do we support mid-cycle downgrade (enterprise → business) or only at cycle end?

**My opinionated lean**: **Option (b) — run to end of period, then stop**. Simplest possible semantics for 0-5 customers. The operator sets `endDate` on the `BillingRecurringInvoice` to the end of the current period, the cron runs one more time, then the recurring invoice auto-deactivates. No credit notes, no pro-rating. If a customer really wants a pro-rated refund, the operator issues a manual `CREDIT_NOTE` via the tenant-side UI.

### Q7: How does the platform UI show the operator "who has paid"?

Given the operator will primarily check this via the tenant-side billing UI (per the research brief's constraint), do we need **any** payment status display on the platform UI, or does `/platform/tenants/[id]/modules` just show "abo läuft, letzte Rechnung erzeugt am X" and link out to the tenant UI?

**My opinionated lean**: **Link out**. Don't duplicate the tenant-side "offene Posten" view on the platform. The platform UI shows the subscription state (active/cancelled/renewal date); the "is it paid" question is answered by clicking through to the operator tenant's billing UI.

### Q8: Seed data for local development

Does local dev get a seeded operator tenant + a sample subscription so the platform UI has something to show?

- The existing seed creates the dev tenant with all 5 modules enabled but no `platform_subscriptions` row
- A Phase 10 plan should decide whether to extend the seed with a sample subscription (e.g. make dev tenant its own customer — self-reference — or create a second tenant "Test Customer GmbH" and have dev tenant bill them)

**My opinionated lean**: **Create a second "Test Customer GmbH" tenant in the seed**, have Dev Company bill them for CRM and Billing modules with a sample monthly subscription. This gives an immediately useful UI to click through during local development.

## Code References

### Billing core

- `prisma/schema.prisma:510-568` — BillingDocumentType, BillingDocumentStatus, BillingPositionType, BillingPriceType, BillingRecurringInterval, BillingServiceCaseStatus enums
- `prisma/schema.prisma:750-830` — BillingDocument
- `prisma/schema.prisma:839-863` — BillingDocumentPosition
- `prisma/schema.prisma:872-889` — BillingDocumentTemplate
- `prisma/schema.prisma:898-927` — BillingTenantConfig
- `prisma/schema.prisma:936-971` — BillingServiceCase
- `prisma/schema.prisma:982-1018` — BillingPaymentType/Status enums + BillingPayment
- `prisma/schema.prisma:1024-1072` — BillingPriceList + BillingPriceListEntry
- `prisma/schema.prisma:1081-1120` — **BillingRecurringInvoice** (the critical one)

### Billing services

- `src/lib/services/billing-document-service.ts:210-238` — create (accepts tenantId)
- `src/lib/services/billing-document-service.ts:512-595` — finalize (auto-PDF + auto-XRechnung)
- `src/lib/services/billing-document-service.ts:155-167` — position total calculation
- `src/lib/services/billing-recurring-invoice-service.ts:94-186` — create (accepts tenantId)
- `src/lib/services/billing-recurring-invoice-service.ts:314-425` — generate (materialize DRAFT BillingDocument from template)
- `src/lib/services/billing-recurring-invoice-service.ts:429-515` — generateDue (cross-tenant batch)
- `src/lib/services/billing-recurring-invoice-service.ts:25-45` — calculateNextDueDate
- `src/lib/services/billing-recurring-invoice-repository.ts:140-153` — findDue (cross-tenant query)
- `src/lib/services/billing-payment-service.ts:34-43` — computePaymentStatus (UNPAID/PARTIAL/PAID/OVERPAID)
- `src/lib/services/billing-payment-service.ts:55-62` — isOverdue
- `src/lib/services/billing-price-list-service.ts:454-530` — lookupPrice with fallback chain

### PDF + email

- `src/lib/services/billing-document-pdf-service.ts:21,38-41,95,117` — bucket, select, pdfUrl set, signed URL
- `src/lib/pdf/billing-document-pdf.tsx:96` — React-PDF root
- `src/lib/pdf/pdf-storage.ts:3-47` — path conventions
- `src/lib/services/billing-document-einvoice-service.ts:2,51-81,143-148,228,328,387,418-424` — InvoiceService, validation, UBL fields, format selection
- `src/lib/services/email-send-service.ts:77-218` — send flow
- `src/lib/services/email-send-service.ts:221-279` — getDocumentEmailContext (pre-send dialog data)
- `src/lib/services/email-send-service.ts:28` — RETRY_DELAYS constant
- `src/lib/services/email-document-context.ts:45-93` — buildBillingDocumentEmailData
- `src/lib/services/email-smtp-config-service.ts:27` — createTransporter
- `src/lib/email/templates/base-document-email.ts:14` — renderBaseEmail
- `src/lib/email/default-templates.ts` — code-level email template fallbacks
- `src/lib/services/email-placeholder-resolver.ts:28-37` — placeholder substitution
- `src/trpc/routers/email/send.ts:47-61` — email.send.send mutation

### Cron infrastructure

- `vercel.json:crons[]` — all 11 scheduled cron entries
- `src/app/api/cron/recurring-invoices/route.ts:21-83` — full flow
- `src/app/api/cron/email-retry/route.ts` — retry cron
- `prisma/schema.prisma:4556-4572` — CronCheckpoint model
- `prisma/schema.prisma:4420-4546` — Schedule + ScheduleExecution + ScheduleTaskExecution (cron execution logging)
- `src/lib/services/cron-execution-logger.ts:26-150` — logger API

### CRM

- `prisma/schema.prisma:311-317` — CrmAddressType enum
- `prisma/schema.prisma:359-418` — CrmAddress
- `prisma/schema.prisma:426-457` — CrmContact
- `src/lib/services/crm-address-service.ts:135-216` — create (accepts tenantId)
- `src/lib/services/crm-address-service.ts:559-621` — createContact (accepts tenantId)
- `src/lib/services/crm-address-service.ts:29-45` — generateLetterSalutation
- `src/trpc/routers/crm/addresses.ts:244-332` — contact CRUD procedures

### Platform

- `src/trpc/init.ts:33-34` — PLATFORM_SYSTEM_USER_ID constant
- `src/trpc/init.ts:156-248` — impersonation branch in createTRPCContext
- `src/trpc/init.ts:308-314` — impersonationBoundary middleware
- `src/trpc/init.ts:323` — publicProcedure with impersonation boundary
- `src/trpc/platform/init.ts:54-71` — PlatformTRPCContext type
- `src/trpc/platform/init.ts:98-153` — createPlatformTRPCContext
- `src/trpc/platform/init.ts:158` — platform tRPC instance (separate from tenant)
- `src/trpc/platform/init.ts:185-208` — platformAuthedProcedure
- `src/trpc/platform/init.ts:218-249` — platformImpersonationProcedure
- `src/trpc/platform/routers/tenantManagement.ts:33-36` — tenantIdSchema (lenient UUID)
- `src/trpc/platform/routers/tenantManagement.ts:56-581` — all 11 procedures
- `src/trpc/platform/routers/tenantManagement.ts:198` — PLATFORM_SYSTEM_USER_ID used as audit.userId
- `src/lib/platform/audit-service.ts:82-108` — platformAudit.log
- `src/lib/platform/impersonation-context.ts:24-36` — impersonationStorage + getImpersonation
- `src/lib/services/audit-logs-service.ts:173-214` — log() with dual-write
- `prisma/schema.prisma:291-306` — TenantModule (Phase 9)
- `prisma/schema.prisma:1227-1245` — PlatformAuditLog

### Config + seeding

- `src/lib/config.ts:8-44` — serverEnv
- `src/lib/config.ts:47-56` — clientEnv
- `src/lib/config.ts:65-81` — validateEnv
- `src/instrumentation.ts:1-6` — startup validation hook
- `supabase/seed.sql:113-120` — dev tenant insert
- `supabase/seed.sql:1907-1913` — initial tenant_modules seed for dev tenant
- `supabase/seed.sql:3929-3931` — inbound_invoices module seed
- `supabase/migrations/20260421200000_create_platform_system_user.sql` — sentinel user migration
- `supabase/migrations/20260421300001_add_tenant_module_platform_fields.sql` — operator_note column

## Historical Context (from thoughts/)

### Billing module evolution

- `thoughts/shared/research/2026-03-18-ORD_05-wiederkehrende-rechnungen.md` — Original research identifying the gaps that led to `BillingRecurringInvoice` + the cron
- `thoughts/shared/plans/2026-03-18-ORD_05-wiederkehrende-rechnungen.md` — Implementation plan for the recurring-invoice cron (now the one this research builds on)
- `thoughts/shared/research/2026-03-17-ORD_03-offene-posten.md` — Open items / payment tracking research
- `thoughts/shared/plans/2026-03-17-ORD_03-offene-posten.md` — Payment tracking implementation
- `thoughts/shared/tickets/ZMI-TICKET-162-mahnwesen.md` — Mahnwesen (dunning) ticket — not yet implemented per this research; would be Phase 10c or later
- `thoughts/shared/tickets/ZMI-TICKET-163-zahlungsbedingungen.md` — Payment terms templates ticket
- `thoughts/shared/tickets/ZMI-TICKET-164-rechnungslisten-dashboard.md` — Finance dashboard ticket

### PDF + E-Invoice

- `thoughts/shared/tickets/ZMI-TICKET-140-pdf-generierung.md` — PDF engine ticket (implemented)
- `thoughts/shared/tickets/ZMI-TICKET-142-xrechnung.md` — XRechnung ticket (implemented)
- `thoughts/shared/plans/2026-03-20-ORD-ERECHNUNG-zugferd-einvoice.md` — ZUGFeRD implementation plan (implemented)

### Email infrastructure

- `thoughts/shared/research/2026-04-02-email-smtp-infrastructure.md` — Original SMTP research
- `thoughts/shared/plans/2026-04-02-ZMI-TICKET-141-email-versand.md` — Email dispatch plan (implemented — the `email-send-service.ts` that Phase 10 will reuse)

### Platform admin

- `thoughts/shared/plans/2026-04-09-platform-admin-system.md` — Phase 1-9 plan. **Phase 9 explicitly defers subscription billing, Stripe, and MRR** to a follow-up plan — which is exactly this research.

### Price lists

- `thoughts/shared/plans/2026-03-18-ORD_04-preislisten.md` — Price list implementation plan (implemented)
- `thoughts/shared/tickets/misc/price-list-sales-purchase-separation.md` — Sales vs. purchase separation (implemented per research of the current state)

### No prior Phase 10 / platform subscription documents

A search for "Phase 10" or "platform subscription" as standalone planning docs returned zero results. This research is the first document in that stream.

## Related Research

- `thoughts/shared/research/2026-04-09-platform-admin-system.md` — Platform admin system research (Phase 1-9)
- `thoughts/shared/research/2026-04-09-demo-tenant-system.md` — Demo tenant system research (touches the `users-service.create` Phase 0 fix that Phase 10 bridge code will reuse)
- `thoughts/shared/research/2026-03-18-ORD_05-wiederkehrende-rechnungen.md` — Original recurring invoices research
- `thoughts/shared/research/2026-04-02-email-smtp-infrastructure.md` — Tenant SMTP infrastructure research

## Appendix: The "out of scope" list that stays out of scope

For clarity, these items are explicitly NOT being researched or planned in Phase 10a:

- **SEPA Lastschrift / direct debit** — pain.008.xml generation, mandate management, Creditor-ID registration, return-debit handling. Deferred to Phase 10b.
- **Automated Mahnwesen (dunning)** — reminder emails at N days overdue, escalation levels, interest/fee calculations. Deferred.
- **Payment-provider integration** — Stripe, PayPal, Lexoffice, sevDesk webhooks. The operator wants to dogfood their own billing module, not outsource to a third party.
- **Platform-side overdue dashboard** — the operator checks offene Posten via the tenant-side UI they already built and know.
- **Individual per-tenant pricing overrides beyond a simple `unit_price` on the subscription row** — no tiered discounts, no promotional codes, no volume pricing.
- **Tax exemption edge cases** — reverse charge, non-EU customers, exemptions. Operator tenant's default 19% VAT applies.
- **Multi-currency** — EUR only.
- **Support Session mechanism (Phase 6/7 consent flow)** — **explicitly preserved as-is**. Platform operators continue to access other tenants' data via consent-based impersonation. Phase 10 is orthogonal: billing for customers via the operator tenant, not a change to how the operator reads into customer data.
- **Credit notes, refunds, pro-rated cancellation** — if needed, the operator issues them manually via the tenant-side billing UI.
- **Invoice number strategy changes** — reuses the existing operator-tenant `NumberSequence` `"invoice"` key with default `RE-` prefix (set at tenant config level).
