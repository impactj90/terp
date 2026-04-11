---
date: 2026-04-10T21:05:00+02:00
researcher: impactj90
git_commit: 91581279b26b3219f0c66dc17b8483898287e11b
branch: staging
repository: terp
topic: "Platform Subscription Billing — Phase 10a (Dogfood-Bridge, Auto-Finalize)"
tags: [plan, platform-admin, billing, subscriptions, phase-10, dogfood]
status: ready-for-review
last_updated: 2026-04-10
last_updated_by: impactj90
---

# Plan: Platform Subscription Billing — Phase 10a (Dogfood Bridge, Auto-Finalize)

**Date**: 2026-04-10T21:05:00+02:00
**Researcher**: impactj90
**Git Commit**: 91581279b26b3219f0c66dc17b8483898287e11b
**Branch**: staging
**Repository**: terp
**Research basis**: `thoughts/shared/research/2026-04-10-platform-subscription-billing.md`

## Overview

Phase 9 gave the operator lifecycle control over tenants and modules, but `tenant_modules.operator_note` is just a free-text breadcrumb — no billing connection. Phase 10a closes the loop: when the operator books a module on `/platform/tenants/[id]/modules`, the platform also creates a **`BillingRecurringInvoice` inside a designated operator tenant** that represents the ongoing contract. The existing `/api/cron/recurring-invoices` daily cron then auto-generates DRAFT invoices; a new auto-finalize step transitions them to PRINTED (PDF + XRechnung). Email delivery stays manual in 10a — the operator sends invoices through the existing tenant-side billing UI with 2 clicks per invoice. For 0-5 customers that's 10 clicks per month.

The approach is pure **dogfood**: no parallel platform billing engine, no third-party integration (Stripe, Lexoffice), no new PDF stack. Everything reuses `BillingRecurringInvoice`, `BillingDocument.finalize()`, `billing-document-pdf-service`, and `billing-document-einvoice-service` — the exact same code paths that tenants already use for their own recurring billing.

**Strategic rationale (beyond pragmatism)**: The operator tenant becomes a first-class customer of its own billing module. Every bug in the billing flow is a bug the operator feels personally. The operator's day-to-day use of their own product is the strongest possible QA against drift between "platform billing" and "tenant billing" — because they cannot diverge by construction.

### Out of scope (Phase 10a)

- **Auto-email of finalized invoices** — deferred to Phase 10b. Email has the most edge cases (SMTP down, bounces, wrong recipient). The operator manually sends via the tenant-side `email.send.send` mutation.
- **SEPA Lastschrift** (pain.008.xml, mandate management, Creditor-ID) — deferred to Phase 10c or later.
- **Automated Mahnwesen (dunning)** — operator checks overdue status via tenant-side `listOpenItems` UI.
- **Platform-side overdue dashboard** — only a small "overdue" badge next to the latest-invoice link in Phase 10a.
- **Pro-rated cancellation / mid-cycle refunds** — operator issues credit notes manually via tenant-side UI.
- **Tiered pricing, volume discounts, promo codes** — `unit_price` is a single flat Float per subscription.
- **Multi-currency** — EUR only.
- **Payment-provider webhooks** (Stripe, PayPal, sevDesk).
- **Support Session mechanism (Phase 6/7)** — **explicitly preserved as-is**. Operators continue to access Fremd-Tenants via the consent-based impersonation flow. Phase 10a is orthogonal: it bills customers via the operator tenant, not a change to impersonation or consent.

## Decisions from strategic sparring + constraint

The research document listed 8 open questions. User decisions (with deltas from the research lean called out explicitly):

| # | Topic | Decision | Research lean | Delta |
|---|---|---|---|---|
| Q1 | Subscription state | New `platform_subscriptions` table | New table | ✓ match |
| Q2 | Price catalog | **Hardcoded `MODULE_PRICES` constant** in `src/lib/platform/module-pricing.ts` | BillingPriceList in operator tenant | **Against research** |
| Q3 | Auto-finalize trigger | **New separate cron** `/api/cron/platform-subscription-autofinalize` scheduled 15 min after recurring-invoices; detects via `BillingRecurringInvoice.lastGeneratedAt ≥ today` + `internalNotes` marker | `autoFinalize` Boolean on BillingRecurringInvoice | Variant (constraint-driven — see below) |
| Q4 | CrmAddress mapping | **Column `operatorCrmAddressId` on `platform_subscriptions`** (not a separate mapping table) | Dedicated mapping table | **Against research** |
| Q5 | Billing cycle granularity | Per-subscription | Per-subscription | ✓ match |
| Q6 | Mid-cycle cancellation | Run period to end, no pro-rata | Same | ✓ match |
| Q7 | Payment status in platform UI | Link out to tenant UI, plus an overdue badge computed on-the-fly | Link out only | Slight extension |
| Q8 | Seed data | Add second tenant "Test Customer GmbH" with sample subscription | Same | ✓ match |

**Phase cut**: Auto-email delivery moves from Phase 10a to Phase 10b. Phase 10a only auto-finalizes (DRAFT → PRINTED + PDF + XRechnung). The operator manually triggers email send from the tenant-side UI.

**Env var consistency**: `PLATFORM_OPERATOR_TENANT_ID` is **one env var**, shared with any future Phase 10 dashboard work. Do not introduce a second pinning mechanism.

### Hard constraint: Terp code stays untouched

Operator-declared rule for Phase 10a:

> **Terp-Code (`src/lib/services/billing-*`, `src/lib/services/crm-*`, `src/lib/services/email-*`, `src/trpc/routers/`) bleibt unverändert. Wenn ein Fall eine Terp-Änderung nötig scheint, stoppen und fragen.**

Additionally:

> **Platform services only READ Terp models directly via Prisma. Writes to Terp tables go exclusively through the existing Terp services (`billing-*`, `crm-*`, `email-*`) called with `(prisma, tenantId, ...)`.**

This constraint changes two design points from where the research landed:

1. **No Prisma inverse relations on `Tenant`, `CrmAddress`, `BillingRecurringInvoice`, `BillingDocument`.** The new `PlatformSubscription` model has plain `String? @db.Uuid` columns without `@relation` declarations; the SQL-level foreign keys (via `REFERENCES` in the migration) still enforce referential integrity at the DB level. Platform code does explicit follow-up queries instead of Prisma `include`. This avoids appending platform-specific array fields to Terp models' generated TypeScript types.

2. **A new separate cron** `/api/cron/platform-subscription-autofinalize` (instead of extending `/api/cron/recurring-invoices`). The existing recurring-invoices cron is treated as Terp infrastructure and is not touched. The new cron runs 15 minutes later (04:15 UTC) and reconstructs "what did the 04:00 cron generate?" via DB queries — specifically `BillingRecurringInvoice.lastGeneratedAt ≥ today` combined with a distinguishing marker in `internalNotes` (`[platform_subscription:<id>]`) that the platform writes at subscription-create time.

The marker convention: when `subscription-service.createSubscription` calls `billing-recurring-invoice-service.create()`, it sets `internalNotes = "[platform_subscription:<sub.id>]"`. Because the recurring-invoice `generate()` step copies `internalNotes` verbatim onto the new `BillingDocument` (verified at `src/lib/services/billing-recurring-invoice-service.ts:357`), the autofinalize cron can find the DRAFT invoice with a precise `contains` filter — no FK needed, no TERP schema change needed, no ambiguity when the same customer has multiple subscriptions.

## Pre-flight inventory (verified 2026-04-10)

These facts come from the research document and have been spot-checked against the `staging` branch at commit `91581279`. The plan is written against them; any of them being wrong invalidates the phase it appears in.

### Billing

- **`BillingRecurringInvoice.generate()`** (`src/lib/services/billing-recurring-invoice-service.ts:314-425`) is fully self-contained: accepts `prisma + tenantId + recurringId + generatedById`, materializes a DRAFT `BillingDocument` in a single transaction, advances `nextDueDate`. Leaves the generated document in DRAFT — no PDF, no finalize.
- **`generateDue()`** (same file, lines 429-515) already returns exactly the shape Phase 10a needs:
  ```ts
  {
    generated: number
    failed: number
    skipped: number
    results: Array<{
      tenantId: string
      recurringId: string
      invoiceId?: string       // present on success
      error?: string           // present on failure
      skipped?: boolean        // present on checkpoint hit
    }>
  }
  ```
  **No return-shape extension needed**.
- **`billing-document-service.finalize(prisma, tenantId, id, finalizedById, orderParams?, audit?)`** (`src/lib/services/billing-document-service.ts:512`) accepts plain parameters. It transitions DRAFT → PRINTED inside a transaction, then best-effort generates PDF + (if `BillingTenantConfig.eInvoiceEnabled`) XRechnung XML. Failures in PDF/XML do not roll back the status transition.
- **`BillingDocument` has no back-ref column to `BillingRecurringInvoice`** (verified via schema grep). The link from "which subscription generated this invoice?" must be stored on the platform side.
- **`CrmAddress` — required by both `BillingDocument.addressId` and `BillingRecurringInvoice.addressId`** (non-nullable). The only mandatory field for `crm-address-service.create()` is `company` (non-empty); everything else is optional. Service accepts `prisma + tenantId + input + createdById` as plain parameters.
- **Operator tenant needs `NumberSequence` with key `"invoice"` before recurring billing runs.** Dev tenant already has it (`RE-`, `next_value=8` at `supabase/seed.sql:2858`). Staging/prod operator tenants need this initialized — flag in Phase 10a.7.

### Cron infrastructure

- **`/api/cron/recurring-invoices/route.ts`** runs daily at 04:00 UTC (`vercel.json`), calls `generateDue()` cross-tenant, checkpoints per `(tenantId:templateId)` composite string. The cron does NOT currently use `CronExecutionLogger`. Authentication is inline `CRON_SECRET` Bearer check.
- **Cross-tenant queries from cron code are normal** — the existing `generateDue()` already queries `BillingRecurringInvoice` without tenant filter.

### Platform

- **`platformAuthedProcedure` can call tenant-scoped services directly** by passing `prisma + tenantId` as plain parameters. The tenant's `impersonationBoundary` middleware is on the tenant tRPC instance only — platform procedures do not trigger the `AsyncLocalStorage` dual-write into `platform_audit_logs`. The platform handler must write platform-audit rows explicitly via `platformAudit.log()` (same pattern as all existing `tenantManagement.*` mutations).
- **`PLATFORM_SYSTEM_USER_ID`** (`src/trpc/init.ts:33`, value `"00000000-0000-0000-0000-00000000beef"`) exists as a `public.users` row with `role='system'`, `isActive=false`, `isLocked=true`, `tenantId=NULL`. Already used in `tenantManagement.create` as the `audit.userId` when writing tenant-side audit entries on behalf of the platform operator.
- **`tenant_modules` after Phase 9** has `operatorNote` (VarChar(255), nullable) replacing the old `contractReference`. Nothing else on that table supports subscription lifecycle.

### Environment config

- **`src/lib/config.ts`** uses a plain object literal (`serverEnv`), no Zod. Optional vars default to `''`. Validation in `validateEnv()` at line 65-81 only checks presence of a hardcoded required list. Startup hook in `src/instrumentation.ts:1-6`.

### CRM

- **Zero existing schema linkage between `Tenant` rows and `CrmAddress` rows in other tenants.** Phase 10a introduces the first such linkage via `platform_subscriptions.operatorCrmAddressId`.
- **`CrmAddressType.CUSTOMER`** is the default on `crm-address-service.create()`, so no explicit type needed for operator-side booking.

## Desired end state

After Phase 10a is merged:

1. `PLATFORM_OPERATOR_TENANT_ID` env var identifies a single tenant per environment that acts as the billing backend. If unset, subscription features stay hidden but the rest of the platform still works.
2. Booking a module on `/platform/tenants/[id]/modules` creates a `platform_subscriptions` row **and** a corresponding `BillingRecurringInvoice` inside the operator tenant, with a `CrmAddress` auto-created for the customer tenant (or reused if already present).
3. The daily cron at 04:00 UTC generates DRAFT invoices per the existing flow, then a new auto-finalize step transitions platform-linked invoices to PRINTED with PDF + XRechnung.
4. The operator logs into the operator tenant (normal tenant login) once per month, sees the new PRINTED invoices in the billing UI, and manually sends them via the existing `email.send` flow.
5. Cancelling a subscription on the platform sets `endDate` on the linked `BillingRecurringInvoice` so the cron naturally stops generating at the end of the current period. The `platform_subscriptions` row is marked `cancelled` and, after the last generation runs, `ended`.
6. The platform tenant detail page shows current subscriptions with: cycle, unit price, next billing date, latest generated invoice number + link-out, and an overdue badge if the latest invoice is past its due date.
7. Local dev has a second tenant "Test Customer GmbH" with a pre-seeded active CRM subscription and one DRAFT invoice ready to click through.

## Phases

### Phase 10a.1 — Env var, pricing constants, startup validation

#### Overview

Lay the foundation: introduce `PLATFORM_OPERATOR_TENANT_ID`, define the hardcoded module price catalog, and add a startup warning if the env var is set but points at a non-existent/inactive tenant.

#### Changes required

**File: `src/lib/config.ts`** — extend `serverEnv` at line 8-44:

```ts
export const serverEnv = {
  // ... existing fields ...
  platformOperatorTenantId: process.env.PLATFORM_OPERATOR_TENANT_ID ?? "",
  // ... rest ...
} as const
```

Do **not** add to `required[]` in `validateEnv()` — the var is optional. Phase 10a features gate on its presence at request time.

**File: `.env.example`** — add:

```
# Phase 10: Operator tenant for subscription billing.
# When set, platform module bookings also create BillingRecurringInvoice rows
# inside this tenant. Leave blank to disable subscription features entirely.
PLATFORM_OPERATOR_TENANT_ID=
```

**New file: `src/lib/platform/module-pricing.ts`**:

```ts
/**
 * Hardcoded module price catalog for platform subscription billing.
 *
 * Phase 10a intentionally does not use a DB-backed price list. At 0-5
 * customers with 1-2 price changes per year, the overhead of a price list
 * UI, migrations, and per-environment seeding is not worth it. Prices are
 * COPIED into `platform_subscriptions.unitPrice` at subscription start
 * time, so a later price change does not retroactively affect existing
 * subscriptions — each contract "freezes" the price it was signed at.
 *
 * To change prices: edit this file, commit, deploy. New subscriptions from
 * that deploy onward use the new price. Existing subscriptions are unaffected
 * unless the operator explicitly updates them (future feature).
 *
 * To migrate to a DB-backed price list later: replace `getModulePrice()`
 * with a query against whatever source of truth; the rest of the bridge
 * is unchanged.
 *
 * ## ⚠️ CONTRACT: `description` is a stable identifier — DO NOT CHANGE
 *
 * The `description` field on each module is used by
 * `cancelSubscription` Path B to identify which position to remove from
 * a shared recurring invoice's `positionTemplate` (see plan FLAG 9).
 *
 * Subscriptions created BEFORE a description change still carry the OLD
 * description in their recurring invoices' positionTemplate — cancelling
 * those subscriptions after the change will fail to find the position,
 * log a warning, and leave an orphan position that the operator must
 * remove manually via the tenant-side billing UI.
 *
 * If you absolutely need to change wording:
 *   1. Do it in a breaking deploy where you also manually migrate all
 *      existing `billing_recurring_invoices.positionTemplate` JSONB rows
 *      in the operator tenant, OR
 *   2. Wait until all existing subscriptions have naturally ended.
 *
 * ADDING a new module is safe (new `description` string, no existing data).
 * DELETING a module requires ensuring no active subscriptions reference it.
 */
import type { ModuleId } from "@/lib/modules/constants"

export type BillingCycle = "MONTHLY" | "ANNUALLY"

type ModulePricing = {
  monthly: number
  annual: number
  vatRate: number  // percentage, e.g. 19
  description: string  // used as the FREE-position description on generated invoices
}

export const MODULE_PRICES: Record<ModuleId, ModulePricing> = {
  core: {
    monthly: 8,
    annual: 80,
    vatRate: 19,
    description: "Terp Core — Benutzer, Mitarbeiter, Stammdaten",
  },
  crm: {
    monthly: 4,
    annual: 40,
    vatRate: 19,
    description: "Terp CRM — Adressen, Kontakte, Korrespondenz, Anfragen",
  },
  billing: {
    monthly: 4,
    annual: 40,
    vatRate: 19,
    description: "Terp Fakturierung — Angebote, Rechnungen, Zahlungen",
  },
  warehouse: {
    monthly: 4,
    annual: 40,
    vatRate: 19,
    description: "Terp Lager — Artikel, Bestand, Einkauf",
  },
  inbound_invoices: {
    monthly: 3,
    annual: 30,
    vatRate: 19,
    description: "Terp Eingangsrechnungen — Erfassung und Freigabe",
  },
}

export function getModulePrice(
  module: ModuleId,
  cycle: BillingCycle,
): { unitPrice: number; vatRate: number; description: string } {
  const entry = MODULE_PRICES[module]
  return {
    unitPrice: cycle === "MONTHLY" ? entry.monthly : entry.annual,
    vatRate: entry.vatRate,
    description: entry.description,
  }
}
```

**File: `src/instrumentation.ts`** — extend `register()` with a soft-validation step. It must not fail startup if the tenant is missing — the platform must still boot for ops/hotfix scenarios. A warning in the log is enough.

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv, serverEnv } = await import("./lib/config")
    validateEnv()

    // Phase 10a: soft-validate the operator tenant id if set.
    if (serverEnv.platformOperatorTenantId) {
      const { prisma } = await import("./lib/db")
      try {
        const tenant = await prisma.tenant.findUnique({
          where: { id: serverEnv.platformOperatorTenantId },
          select: { id: true, name: true, isActive: true },
        })
        if (!tenant) {
          console.warn(
            `[platform-subscriptions] PLATFORM_OPERATOR_TENANT_ID=${serverEnv.platformOperatorTenantId} does not exist. Subscription features will fail at runtime.`,
          )
        } else if (!tenant.isActive) {
          console.warn(
            `[platform-subscriptions] Operator tenant "${tenant.name}" is inactive. Subscription features will fail until it is reactivated.`,
          )
        } else {
          console.log(
            `[platform-subscriptions] Operator tenant "${tenant.name}" active.`,
          )
        }
      } catch (err) {
        console.warn(
          "[platform-subscriptions] Failed to validate operator tenant on startup:",
          err,
        )
      }
    }
  }
}
```

#### Success criteria

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [ ] Running `pnpm dev` with `PLATFORM_OPERATOR_TENANT_ID` **unset** still boots the platform with no warning
- [ ] Setting `PLATFORM_OPERATOR_TENANT_ID=10000000-0000-0000-0000-000000000001` and restarting `pnpm dev` logs `[platform-subscriptions] Operator tenant "Dev Company" active.`
- [ ] Setting `PLATFORM_OPERATOR_TENANT_ID=99999999-0000-0000-0000-000000000000` (non-existent UUID) logs a warning but the platform still boots
- [x] Unit test `src/lib/platform/__tests__/module-pricing.test.ts`:
  - `getModulePrice("crm", "MONTHLY")` returns `{ unitPrice: 4, vatRate: 19, description: /CRM/ }`
  - `getModulePrice("crm", "ANNUALLY")` returns `{ unitPrice: 40, ... }`
  - All 5 modules defined

---

### Phase 10a.2 — Prisma schema + migration for `platform_subscriptions`

#### Overview

Introduce the subscription lifecycle table. Keep it physically separate from `tenant_modules` — that table stays a pure feature-toggle. `platform_subscriptions` models "one contract" and supports history (multiple rows per `(tenantId, module)`).

**Constraint-honoring design**: `PlatformSubscription` declares NO Prisma `@relation` fields and NO inverse relations are added to `Tenant`, `CrmAddress`, `BillingRecurringInvoice`, or `BillingDocument`. Foreign keys are defined only at the SQL level via `REFERENCES` clauses in the migration. Platform code reads related Terp rows via explicit follow-up queries. This keeps Terp models' generated TypeScript types untouched.

#### Changes required

**File: `prisma/schema.prisma`** — add after the existing `TenantModule` model (around line 306). **No changes to `Tenant`, `CrmAddress`, `BillingRecurringInvoice`, or `BillingDocument` models** — those Terp-domain models remain byte-identical.

```prisma
// -----------------------------------------------------------------------------
// Platform Subscriptions (Phase 10a — dogfood billing bridge)
// -----------------------------------------------------------------------------
// Each row represents ONE contract between the platform operator and a
// customer tenant for ONE module. Multiple rows per (tenant_id, module) are
// expected — one per contract instance (active + historical).
//
// The bridge to the operator tenant's billing module lives in three ID
// columns:
//   - operator_crm_address_id → CrmAddress row inside the operator tenant
//     that represents this customer. Set once on first subscription, reused
//     for all subsequent subscriptions of the same customer.
//   - billing_recurring_invoice_id → BillingRecurringInvoice inside the
//     operator tenant. Set on subscription create. When the subscription is
//     cancelled, the recurring invoice's endDate is set; the cron will stop
//     generating at the next natural period boundary.
//   - last_generated_invoice_id → most recently finalized BillingDocument
//     generated from this subscription. Updated by the auto-finalize cron.
//
// IMPORTANT: These columns are plain UUID fields in Prisma — NO @relation
// declarations. The foreign keys are defined at the SQL level only (via
// REFERENCES in the migration). This keeps Terp-domain Prisma types
// (CrmAddress, BillingRecurringInvoice, BillingDocument) untouched — they
// do not gain a `platformSubscriptions` array field in their generated
// TypeScript types. Platform code reads related rows via explicit
// follow-up queries (two-query pattern).
//
// Referential integrity is still enforced by Postgres. ON DELETE SET NULL
// on all three FKs means deleting a CrmAddress / recurring invoice / billing
// document leaves the platform_subscription row intact as a historical
// record with nulled-out pointers.
model PlatformSubscription {
  id                             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId                       String    @map("tenant_id") @db.Uuid
  module                         String    @db.VarChar(50)
  status                         String    @db.VarChar(20)   // "active" | "cancelled" | "ended"
  billingCycle                   String    @map("billing_cycle") @db.VarChar(20)  // "MONTHLY" | "ANNUALLY"
  unitPrice                      Float     @map("unit_price")
  currency                       String    @default("EUR") @db.VarChar(3)
  startDate                      DateTime  @map("start_date") @db.Timestamptz(6)
  endDate                        DateTime? @map("end_date") @db.Timestamptz(6)           // set when cancelled; scheduled end
  actualEndDate                  DateTime? @map("actual_end_date") @db.Timestamptz(6)    // when status flipped to "ended"
  operatorCrmAddressId           String?   @map("operator_crm_address_id") @db.Uuid      // SQL-only FK → crm_addresses(id)
  billingRecurringInvoiceId      String?   @map("billing_recurring_invoice_id") @db.Uuid // SQL-only FK → billing_recurring_invoices(id)
  lastGeneratedInvoiceId         String?   @map("last_generated_invoice_id") @db.Uuid    // SQL-only FK → billing_documents(id)
  createdAt                      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  createdByPlatformUserId        String    @map("created_by_platform_user_id") @db.Uuid
  cancelledAt                    DateTime? @map("cancelled_at") @db.Timestamptz(6)
  cancelledByPlatformUserId      String?   @map("cancelled_by_platform_user_id") @db.Uuid
  cancellationReason             String?   @map("cancellation_reason") @db.VarChar(500)

  // NOTE: `tenantId` is also a plain UUID here — no @relation to Tenant.
  // Platform code looks up tenants via prisma.tenant.findUnique when needed.
  // This keeps Tenant's generated type free of a `platformSubscriptions` field.

  @@index([tenantId, status], map: "idx_platform_subscriptions_tenant_status")
  @@index([status, endDate], map: "idx_platform_subscriptions_status_end_date")
  @@index([billingRecurringInvoiceId], map: "idx_platform_subscriptions_billing_ri")
  @@index([operatorCrmAddressId], map: "idx_platform_subscriptions_operator_crm_address")
  @@map("platform_subscriptions")
}
```

**Important**: Do NOT add `platformSubscriptions PlatformSubscription[]` to `Tenant`, `CrmAddress`, `BillingRecurringInvoice`, or `BillingDocument`. Those models must remain unchanged.

**New file: `supabase/migrations/20260422000000_create_platform_subscriptions.sql`** (timestamp places it after the last existing migration `20260421300001`):

```sql
-- Phase 10a: platform subscription lifecycle table.
-- See thoughts/shared/plans/2026-04-10-platform-subscription-billing.md.
--
-- One row per contract instance. Multiple rows per (tenant_id, module) are
-- expected — one per contract instance, supporting history. The bridge to
-- the operator tenant's billing domain lives in the three nullable FK
-- columns. None cascade-delete.

CREATE TABLE public.platform_subscriptions (
  id                             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                      UUID         NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module                         VARCHAR(50)  NOT NULL,
  status                         VARCHAR(20)  NOT NULL,
  billing_cycle                  VARCHAR(20)  NOT NULL,
  unit_price                     DOUBLE PRECISION NOT NULL,
  currency                       VARCHAR(3)   NOT NULL DEFAULT 'EUR',
  start_date                     TIMESTAMPTZ  NOT NULL,
  end_date                       TIMESTAMPTZ,
  actual_end_date                TIMESTAMPTZ,
  operator_crm_address_id        UUID         REFERENCES public.crm_addresses(id) ON DELETE SET NULL,
  billing_recurring_invoice_id   UUID         REFERENCES public.billing_recurring_invoices(id) ON DELETE SET NULL,
  last_generated_invoice_id      UUID         REFERENCES public.billing_documents(id) ON DELETE SET NULL,
  created_at                     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by_platform_user_id    UUID         NOT NULL,
  cancelled_at                   TIMESTAMPTZ,
  cancelled_by_platform_user_id  UUID,
  cancellation_reason            VARCHAR(500),

  CONSTRAINT platform_subscriptions_status_check
    CHECK (status IN ('active', 'cancelled', 'ended')),
  CONSTRAINT platform_subscriptions_billing_cycle_check
    CHECK (billing_cycle IN ('MONTHLY', 'ANNUALLY')),
  CONSTRAINT platform_subscriptions_module_check
    CHECK (module IN ('core', 'crm', 'billing', 'warehouse', 'inbound_invoices')),
  CONSTRAINT platform_subscriptions_cancelled_fields_consistency
    CHECK (
      (status = 'cancelled' AND cancelled_at IS NOT NULL AND end_date IS NOT NULL)
      OR status <> 'cancelled'
    ),
  CONSTRAINT platform_subscriptions_ended_fields_consistency
    CHECK (
      (status = 'ended' AND actual_end_date IS NOT NULL)
      OR status <> 'ended'
    )
);

CREATE INDEX idx_platform_subscriptions_tenant_status
  ON public.platform_subscriptions(tenant_id, status);

CREATE INDEX idx_platform_subscriptions_status_end_date
  ON public.platform_subscriptions(status, end_date);

CREATE INDEX idx_platform_subscriptions_billing_ri
  ON public.platform_subscriptions(billing_recurring_invoice_id)
  WHERE billing_recurring_invoice_id IS NOT NULL;

CREATE INDEX idx_platform_subscriptions_operator_crm_address
  ON public.platform_subscriptions(operator_crm_address_id)
  WHERE operator_crm_address_id IS NOT NULL;

COMMENT ON TABLE  public.platform_subscriptions IS 'Platform subscription lifecycle records. One row per contract; multiple rows per (tenant_id, module) expected for history.';
COMMENT ON COLUMN public.platform_subscriptions.operator_crm_address_id    IS 'FK to a CrmAddress inside the operator tenant representing this customer. Set once on first subscription; reused for subsequent subscriptions of the same customer.';
COMMENT ON COLUMN public.platform_subscriptions.billing_recurring_invoice_id IS 'FK to BillingRecurringInvoice inside the operator tenant. When subscription is cancelled, endDate is set on the linked recurring template.';
COMMENT ON COLUMN public.platform_subscriptions.last_generated_invoice_id IS 'Updated by the auto-finalize cron step after each successful finalization. Used by the platform UI to show "last invoice" link-out.';
```

#### Success criteria

- [x] Migration applies cleanly via `npx supabase db push --local`
- [x] `pnpm db:generate` produces no errors
- [x] `pnpm typecheck` passes
- [x] Manual DB check: `\d platform_subscriptions` shows all columns, all 5 CHECK constraints, 4 indexes
- [ ] Manual DB check: attempting `INSERT` with `status='wrong'` fails via CHECK
- [ ] Manual DB check: attempting `INSERT` with `status='cancelled'` and `cancelled_at IS NULL` fails via the consistency CHECK

---

### Phase 10a.3 — Subscription service layer

#### Overview

All business logic for the bridge lives in one service file at `src/lib/platform/subscription-service.ts`. The service has four public functions: `createSubscription`, `cancelSubscription`, `listForCustomer`, and `findOrCreateOperatorCrmAddress`. It accepts `prisma + platformUser + audit` as plain parameters and **only writes to Terp tables through the existing Terp services** (`crm-address-service`, `billing-recurring-invoice-service`). Direct reads of Terp models via Prisma are allowed.

**Shared-invoice model (critical)**: Multiple active subscriptions for the same customer share ONE `BillingRecurringInvoice` per `(customerTenantId, billingCycle)` combination. A customer with 3 monthly modules gets ONE monthly recurring invoice with 3 positions, not 3 separate recurring invoices. Maximum 2 recurring invoices per customer: one MONTHLY, one ANNUALLY. The `platform_subscriptions` table still has one row per module (1-to-1 with the customer's module bookings); multiple subscription rows can point at the same `billingRecurringInvoiceId`.

**`internalNotes` marker — space-separated list**: Under the shared model, a recurring invoice's `internalNotes` contains a space-separated list of markers, one per subscription currently sharing it: `"[platform_subscription:<id1>] [platform_subscription:<id2>]"`. The existing `generate()` copies the full `internalNotes` verbatim onto every generated `BillingDocument` (verified at `billing-recurring-invoice-service.ts:357`), so every generated invoice contains markers for all subscriptions that contributed a position. The autofinalize cron queries DRAFT invoices by each subscription's own marker via `contains` — which matches correctly even when the invoice has multiple markers.

**Position identification for removal**: Positions in `positionTemplate` are identified by their `description` field, which comes from the code constant `MODULE_PRICES[module].description`. When cancelling a subscription mid-period while other subscriptions remain on the same recurring invoice, the platform filters positions by `description !== MODULE_PRICES[cancelledModule].description`. This is a code-constant match, not a user-provided string, so it's stable across deploys unless `MODULE_PRICES` is edited. See FLAG 9 for the fragility scope.

**Transaction ordering for createSubscription**:
1. Find-or-create `CrmAddress` in the operator tenant
2. Insert `platform_subscriptions` row with `billingRecurringInvoiceId = null` (to get the id for the marker)
3. Find existing active `BillingRecurringInvoice` for `(operatorTenantId, crmAddressId, matching cycle)`
4a. If NONE found: create a new recurring invoice with one position + this subscription's marker
4b. If found: update the existing recurring invoice with appended position + appended marker
5. Update `platform_subscriptions.billingRecurringInvoiceId` to link the row

All five steps inside a single `prisma.$transaction`.

#### Changes required

**New file: `src/lib/platform/subscription-service.ts`**:

```ts
/**
 * Platform Subscription Service (Phase 10a).
 *
 * Bridges platform module bookings to BillingRecurringInvoice rows in the
 * designated operator tenant. The operator tenant is identified by the
 * PLATFORM_OPERATOR_TENANT_ID env var.
 *
 * All functions accept prisma + tenantId as plain parameters. Audit entries
 * land in platform_audit_logs (via the caller) and tenant-side audit_logs
 * (transitively via the underlying service calls with PLATFORM_SYSTEM_USER_ID
 * as the audit userId).
 *
 * THIS SERVICE DOES NOT WRITE platform_audit_logs ITSELF. The caller
 * (tenantManagement.enableModule / disableModule) writes one platform audit
 * entry per booking via platformAudit.log(). Keeping the audit write at the
 * caller level matches the pattern of every other mutation in tenantManagement.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client"
import { TRPCError } from "@trpc/server"
import { serverEnv } from "@/lib/config"
import { PLATFORM_SYSTEM_USER_ID } from "@/trpc/init"
import type { ModuleId } from "@/lib/modules/constants"
import { getModulePrice, type BillingCycle } from "./module-pricing"
import * as crmAddressService from "@/lib/services/crm-address-service"
import * as billingRecurringService from "@/lib/services/billing-recurring-invoice-service"
import type { AuditContext } from "@/lib/services/audit-logs-service"

type Tx = PrismaClient | Prisma.TransactionClient

export class PlatformSubscriptionConfigError extends Error {
  constructor() {
    super("PLATFORM_OPERATOR_TENANT_ID is not configured")
    this.name = "PlatformSubscriptionConfigError"
  }
}

export class PlatformSubscriptionNotFoundError extends Error {
  constructor(id: string) {
    super(`Platform subscription not found: ${id}`)
    this.name = "PlatformSubscriptionNotFoundError"
  }
}

/**
 * Returns the operator tenant id, or throws if unconfigured.
 * Caller is responsible for deciding whether to fail hard or fall back.
 */
export function requireOperatorTenantId(): string {
  if (!serverEnv.platformOperatorTenantId) {
    throw new PlatformSubscriptionConfigError()
  }
  return serverEnv.platformOperatorTenantId
}

export function isSubscriptionBillingEnabled(): boolean {
  return serverEnv.platformOperatorTenantId !== ""
}

/**
 * Find-or-create the CrmAddress inside the operator tenant representing
 * a customer tenant. If any existing platform_subscription for this customer
 * already points at a CrmAddress, reuse it. Otherwise create a new one from
 * the customer tenant's address fields.
 *
 * NOTE: At 0-5 customers with sequential operator clicks, concurrent
 * bookings for the same new customer are extremely unlikely. No transaction-
 * level lock is added. If a duplicate CrmAddress slips through, the operator
 * can manually delete one — it's a rare cosmetic issue, not a data bug.
 */
export async function findOrCreateOperatorCrmAddress(
  prisma: Tx,
  customerTenantId: string,
): Promise<string> {
  const operatorTenantId = requireOperatorTenantId()

  // 1. Check if we already have a mapping via any prior subscription.
  const existing = await prisma.platformSubscription.findFirst({
    where: {
      tenantId: customerTenantId,
      operatorCrmAddressId: { not: null },
    },
    select: { operatorCrmAddressId: true },
  })
  if (existing?.operatorCrmAddressId) {
    return existing.operatorCrmAddressId
  }

  // 2. Load the customer tenant's address fields.
  const customerTenant = await prisma.tenant.findUnique({
    where: { id: customerTenantId },
    select: {
      name: true,
      email: true,
      addressStreet: true,
      addressZip: true,
      addressCity: true,
      addressCountry: true,
    },
  })
  if (!customerTenant) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Customer tenant ${customerTenantId} not found`,
    })
  }

  // 3. Create a new CrmAddress inside the operator tenant using the
  //    existing service. Uses PLATFORM_SYSTEM_USER_ID as the creator.
  const newAddress = await crmAddressService.create(
    prisma as PrismaClient,
    operatorTenantId,
    {
      type: "CUSTOMER",
      company: customerTenant.name,
      street: customerTenant.addressStreet ?? undefined,
      zip: customerTenant.addressZip ?? undefined,
      city: customerTenant.addressCity ?? undefined,
      country: customerTenant.addressCountry ?? "DE",
      email: customerTenant.email ?? undefined,
    },
    PLATFORM_SYSTEM_USER_ID,
    // audit: undefined — the caller will write a single platform_audit_logs row
  )

  return newAddress.id
}

export interface CreateSubscriptionInput {
  customerTenantId: string
  module: ModuleId
  billingCycle: BillingCycle
  startDate?: Date  // defaults to now
}

export interface CreateSubscriptionResult {
  subscriptionId: string
  operatorCrmAddressId: string
  billingRecurringInvoiceId: string
  /** True if this subscription created a NEW recurring invoice; false if it joined an existing shared one. */
  joinedExistingRecurring: boolean
}

/**
 * Marker format: stored in the recurring invoice's `internalNotes` so the
 * autofinalize cron can precisely identify which DRAFT BillingDocument to
 * finalize, even when a customer has multiple subscriptions. The marker
 * is copied verbatim onto each generated BillingDocument by the existing
 * `billing-recurring-invoice-service.generate()` at line 357.
 *
 * Under the shared-invoice model, a recurring invoice's internalNotes
 * field contains a space-separated list of markers (one per subscription
 * currently sharing it). The autofinalize cron uses `contains` matching
 * on a single subscription's marker, which works correctly regardless
 * of how many other markers are present.
 */
export function platformSubscriptionMarker(subscriptionId: string): string {
  return `[platform_subscription:${subscriptionId}]`
}

/**
 * Position shape used by the platform when constructing positionTemplate
 * for a BillingRecurringInvoice. Narrower than Terp's generic position
 * type — the platform always creates FREE positions with a fixed set of
 * fields. Removal identification uses the `description` field.
 */
type PlatformPositionTemplateEntry = {
  type: "FREE"
  description: string
  quantity: number
  unit: string
  unitPrice: number
  vatRate: number
}

function buildPositionForModule(
  module: ModuleId,
  cycle: BillingCycle,
): PlatformPositionTemplateEntry {
  const { unitPrice, vatRate, description } = getModulePrice(module, cycle)
  return {
    type: "FREE",
    description,
    quantity: 1,
    unit: cycle === "MONTHLY" ? "Monat" : "Jahr",
    unitPrice,
    vatRate,
  }
}

/**
 * Appends a new subscription marker to an existing internalNotes string.
 * Handles the null/empty case and the space-separator convention.
 */
function appendMarker(
  existingInternalNotes: string | null,
  subscriptionId: string,
): string {
  const marker = platformSubscriptionMarker(subscriptionId)
  const existing = (existingInternalNotes ?? "").trim()
  return existing.length > 0 ? `${existing} ${marker}` : marker
}

/**
 * Removes a single subscription marker from an internalNotes string.
 * Used by cancelSubscription when other subs still share the recurring
 * invoice.
 */
function removeMarker(
  existingInternalNotes: string | null,
  subscriptionId: string,
): string {
  const marker = platformSubscriptionMarker(subscriptionId)
  const existing = existingInternalNotes ?? ""
  // Replace the marker (and any one leading/trailing space) then normalize
  // whitespace. Handles all three positions: leading, middle, trailing.
  return existing
    .split(/\s+/)
    .filter((token) => token.length > 0 && token !== marker)
    .join(" ")
}

/**
 * Create a new subscription for a customer tenant + module.
 *
 * Under the shared-invoice model, this EITHER creates a new
 * BillingRecurringInvoice for this (customer, cycle) combination OR joins
 * an existing one by appending a position + marker.
 *
 * Steps (all inside a single $transaction):
 *   1. Find-or-create the CrmAddress in the operator tenant.
 *   2. Insert the platform_subscriptions row FIRST (with
 *      billing_recurring_invoice_id=null) so we have an id for the marker.
 *   3. Look for an existing active BillingRecurringInvoice for this
 *      (operatorTenantId, crmAddressId, matching interval).
 *   4a. If none: create a new one with positionTemplate=[thisModulePosition]
 *       and internalNotes=thisSubMarker.
 *   4b. If exists: update it with positionTemplate=[...oldPositions, thisModulePosition]
 *       and internalNotes=existing + " " + thisSubMarker.
 *   5. Update platform_subscriptions.billingRecurringInvoiceId.
 */
export async function createSubscription(
  prisma: PrismaClient,
  input: CreateSubscriptionInput,
  platformUserId: string,
): Promise<CreateSubscriptionResult> {
  const operatorTenantId = requireOperatorTenantId()
  const startDate = input.startDate ?? new Date()
  const { unitPrice } = getModulePrice(input.module, input.billingCycle)
  const interval: "MONTHLY" | "ANNUALLY" =
    input.billingCycle === "MONTHLY" ? "MONTHLY" : "ANNUALLY"

  return await prisma.$transaction(async (tx) => {
    // 1. CrmAddress find-or-create.
    const operatorCrmAddressId = await findOrCreateOperatorCrmAddress(
      tx,
      input.customerTenantId,
    )

    // 2. Insert platform_subscriptions row FIRST to get an id for the marker.
    const sub = await tx.platformSubscription.create({
      data: {
        tenantId: input.customerTenantId,
        module: input.module,
        status: "active",
        billingCycle: input.billingCycle,
        unitPrice,
        currency: "EUR",
        startDate,
        operatorCrmAddressId,
        billingRecurringInvoiceId: null, // set in step 5
        createdByPlatformUserId: platformUserId,
      },
    })

    // 3. Look for an existing active recurring invoice for this
    //    (operatorTenantId, crmAddressId, matching interval).
    //    findFirst (not findUnique) because no composite unique index
    //    exists — we simply expect at most one matching row under normal
    //    use. If multiple somehow exist (manual intervention), the newest
    //    one wins via orderBy.
    const existingRecurring = await tx.billingRecurringInvoice.findFirst({
      where: {
        tenantId: operatorTenantId,
        addressId: operatorCrmAddressId,
        interval,
        isActive: true,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, positionTemplate: true, internalNotes: true },
    })

    const newPosition = buildPositionForModule(input.module, input.billingCycle)

    let billingRecurringInvoiceId: string
    let joinedExistingRecurring: boolean

    if (!existingRecurring) {
      // 4a. No existing recurring invoice → create new.
      const recurring = await billingRecurringService.create(
        tx as PrismaClient,
        operatorTenantId,
        {
          name: `Abo ${interval.toLowerCase()} — Tenant ${input.customerTenantId.slice(0, 8)}`,
          addressId: operatorCrmAddressId,
          interval,
          startDate,
          autoGenerate: true,
          positionTemplate: [newPosition],
          paymentTermDays: 14,
          internalNotes: platformSubscriptionMarker(sub.id),
        },
        PLATFORM_SYSTEM_USER_ID,
        // audit: undefined — caller writes the single platform_audit_logs row
      )
      billingRecurringInvoiceId = recurring.id
      joinedExistingRecurring = false
    } else {
      // 4b. Existing recurring invoice → append position + marker.
      const existingPositions =
        (existingRecurring.positionTemplate as unknown as PlatformPositionTemplateEntry[]) ?? []
      const updatedPositions = [...existingPositions, newPosition]
      const updatedNotes = appendMarker(existingRecurring.internalNotes, sub.id)

      await billingRecurringService.update(
        tx as PrismaClient,
        operatorTenantId,
        {
          id: existingRecurring.id,
          positionTemplate: updatedPositions as unknown as Array<Record<string, unknown>>,
          internalNotes: updatedNotes,
        },
        // audit: undefined
      )
      billingRecurringInvoiceId = existingRecurring.id
      joinedExistingRecurring = true
    }

    // 5. Link the subscription to the (new or existing) recurring invoice.
    await tx.platformSubscription.update({
      where: { id: sub.id },
      data: { billingRecurringInvoiceId },
    })

    return {
      subscriptionId: sub.id,
      operatorCrmAddressId,
      billingRecurringInvoiceId,
      joinedExistingRecurring,
    }
  })
}

export interface CancelSubscriptionInput {
  subscriptionId: string
  reason: string
  cancelledAt?: Date
}

/**
 * Cancel a subscription.
 *
 * ## Two cancellation paths under the shared-invoice model
 *
 * Because multiple subscriptions can share ONE recurring invoice, cancel
 * has to branch on "am I the last active subscription on this recurring?":
 *
 * **Path A — LAST active subscription on the recurring invoice**:
 * Set endDate on the recurring invoice so the cron stops generating.
 * Uses the `nextDueDate - 1ms` formula described below. Zero further
 * invoices generated. Template auto-deactivates on the next cron run.
 *
 * **Path B — OTHER active subscriptions still share the recurring invoice**:
 * Remove THIS module's position from `positionTemplate` and THIS
 * subscription's marker from `internalNotes`. The recurring invoice
 * continues to generate invoices with the remaining positions for the
 * remaining subscriptions. NO endDate change on the recurring invoice.
 *
 * In BOTH paths, the `platform_subscriptions` row is marked `cancelled`
 * with the reason + metadata.
 *
 * ## endDate semantics — VERIFIED against existing Terp code (Path A only)
 *
 * The existing `billing-recurring-invoice-service.generate()` has two
 * endDate checks, both using strict `>` comparison:
 *
 *   Line 332 (upfront gate, at start of transaction):
 *     if (template.endDate && template.nextDueDate > template.endDate) {
 *       // deactivate + throw — no invoice generated
 *     }
 *
 *   Line 405 (post-advance gate, after generation succeeds):
 *     if (template.endDate && nextDue > template.endDate) {
 *       updateData.isActive = false
 *     }
 *
 * Because the upfront check uses strict `>`, setting
 * `endDate === nextDueDate` does NOT trip it — generation would proceed.
 * We want the NEXT scheduled generation to be SKIPPED per Q6 decision
 * ("Kunde hat bereits bezahlt bis Periodenende"). Setting
 * `endDate = nextDueDate - 1 ms` is strictly less than and reliably
 * trips the `>` check. 1ms resolution is fine on a single
 * Vercel/Postgres deployment (no clock-skew concern).
 *
 * Consequence in Path A: the cron runs ZERO more times on this recurring
 * invoice after cancellation.
 *
 * Path B does not touch endDate — the recurring invoice continues with
 * its existing endDate (typically null = runs forever) for the remaining
 * subscriptions.
 */
export async function cancelSubscription(
  prisma: PrismaClient,
  input: CancelSubscriptionInput,
  platformUserId: string,
): Promise<void> {
  const operatorTenantId = requireOperatorTenantId()
  const cancelledAt = input.cancelledAt ?? new Date()

  await prisma.$transaction(async (tx) => {
    const sub = await tx.platformSubscription.findUnique({
      where: { id: input.subscriptionId },
    })
    if (!sub) {
      throw new PlatformSubscriptionNotFoundError(input.subscriptionId)
    }
    if (sub.status !== "active") {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Subscription is already ${sub.status}`,
      })
    }

    // Default: the subscription's own endDate = cancelledAt (today).
    // This may be overridden to "nextDueDate - 1ms" in Path A below so
    // the subscription row reflects the actual service end date.
    let subEndDate: Date = cancelledAt

    if (sub.billingRecurringInvoiceId) {
      // Count other active subs on the same recurring invoice.
      const siblingCount = await tx.platformSubscription.count({
        where: {
          billingRecurringInvoiceId: sub.billingRecurringInvoiceId,
          status: "active",
          id: { not: sub.id },
        },
      })

      // Load the recurring invoice (defense-in-depth: tenantId filter).
      const ri = await tx.billingRecurringInvoice.findFirst({
        where: {
          id: sub.billingRecurringInvoiceId,
          tenantId: operatorTenantId,
        },
        select: {
          nextDueDate: true,
          positionTemplate: true,
          internalNotes: true,
        },
      })

      if (!ri) {
        // Defensive: the recurring invoice doesn't exist or belongs to
        // a different tenant. Log and fall through to just marking the
        // subscription cancelled without touching any Terp row.
        console.warn(
          `[subscription-service] cancelSubscription: recurring invoice ${sub.billingRecurringInvoiceId} ` +
            `for subscription ${sub.id} not found in operator tenant ${operatorTenantId}. ` +
            `Marking subscription cancelled without touching the recurring template.`,
        )
      } else if (siblingCount === 0) {
        // Path A: last active sub → set endDate on the recurring invoice
        // so the next cron run skips generation and deactivates the template.
        subEndDate = new Date(ri.nextDueDate.getTime() - 1)
        await billingRecurringService.update(
          tx as PrismaClient,
          operatorTenantId,
          {
            id: sub.billingRecurringInvoiceId,
            endDate: subEndDate,
          },
          // audit: undefined
        )
      } else {
        // Path B: other subs still share this recurring → remove position
        // + marker but keep the recurring invoice active.
        const targetDescription = getModulePrice(
          sub.module as ModuleId,
          sub.billingCycle as BillingCycle,
        ).description

        const currentPositions =
          (ri.positionTemplate as unknown as PlatformPositionTemplateEntry[]) ?? []

        // Remove ONE matching position (not all) so that if the same
        // description accidentally appears twice, only one is removed.
        const removedIndex = currentPositions.findIndex(
          (p) => p.description === targetDescription,
        )
        if (removedIndex === -1) {
          console.warn(
            `[subscription-service] cancelSubscription Path B: no position found ` +
              `in recurring invoice ${sub.billingRecurringInvoiceId} matching description ` +
              `"${targetDescription}" for subscription ${sub.id} module ${sub.module}. ` +
              `The description may have been manually edited in the tenant-side UI (FLAG 9). ` +
              `Marker will still be removed and subscription will still be marked cancelled.`,
          )
        }
        const filteredPositions =
          removedIndex === -1
            ? currentPositions
            : [
                ...currentPositions.slice(0, removedIndex),
                ...currentPositions.slice(removedIndex + 1),
              ]
        const filteredNotes = removeMarker(ri.internalNotes, sub.id)

        await billingRecurringService.update(
          tx as PrismaClient,
          operatorTenantId,
          {
            id: sub.billingRecurringInvoiceId,
            positionTemplate: filteredPositions as unknown as Array<Record<string, unknown>>,
            internalNotes: filteredNotes,
          },
          // audit: undefined
        )
        // subEndDate stays at cancelledAt — the recurring continues for
        // other subs, so "when did THIS subscription actually stop being
        // billed" is today.
      }
    }

    // Update platform_subscriptions (same pattern in both paths).
    await tx.platformSubscription.update({
      where: { id: sub.id },
      data: {
        status: "cancelled",
        endDate: subEndDate,
        cancelledAt,
        cancelledByPlatformUserId: platformUserId,
        cancellationReason: input.reason,
      },
    })
  })
}

/**
 * List all subscriptions for a customer tenant, including historical.
 *
 * NOTE: Because `PlatformSubscription` has no Prisma `@relation` fields
 * (constraint: Terp models untouched), we cannot use `include`. Instead,
 * we fetch subscriptions first, then batch-load the related recurring
 * invoice and last-generated-invoice rows in two follow-up queries. The
 * result shape mimics an `include` for callers' convenience.
 *
 * Defense-in-depth: the batch queries additionally filter by
 * `tenantId = operatorTenantId`, so even if a platform_subscriptions
 * row contains a stale/corrupted billing id that now belongs to a
 * different tenant (should never happen, but belt-and-braces), the
 * follow-up query returns nothing instead of leaking data.
 *
 * When `PLATFORM_OPERATOR_TENANT_ID` is unset, follow-up queries are
 * skipped entirely — subscriptions are returned with null relations,
 * which the UI renders gracefully.
 */
export async function listForCustomer(
  prisma: PrismaClient,
  customerTenantId: string,
) {
  const subs = await prisma.platformSubscription.findMany({
    where: { tenantId: customerTenantId },
    orderBy: [
      { status: "asc" },     // active first
      { startDate: "desc" }, // newest first
    ],
  })
  if (subs.length === 0) return []

  const operatorTenantId = serverEnv.platformOperatorTenantId
  if (!operatorTenantId) {
    // Unconfigured — return subscriptions with null related rows.
    return subs.map((sub) => ({
      ...sub,
      billingRecurringInvoice: null as null | {
        id: string
        nextDueDate: Date
        lastGeneratedAt: Date | null
        isActive: boolean
      },
      lastGeneratedInvoice: null as null | {
        id: string
        number: string
        documentDate: Date
        paymentTermDays: number | null
        totalGross: number
        status: string
      },
    }))
  }

  // Batch-load related rows, scoped to the operator tenant.
  const recurringIds = Array.from(
    new Set(subs.map((s) => s.billingRecurringInvoiceId).filter((x): x is string => x !== null)),
  )
  const lastInvoiceIds = Array.from(
    new Set(subs.map((s) => s.lastGeneratedInvoiceId).filter((x): x is string => x !== null)),
  )

  const [recurring, lastInvoices] = await Promise.all([
    recurringIds.length > 0
      ? prisma.billingRecurringInvoice.findMany({
          where: {
            id: { in: recurringIds },
            tenantId: operatorTenantId, // defense-in-depth
          },
          select: {
            id: true,
            nextDueDate: true,
            lastGeneratedAt: true,
            isActive: true,
          },
        })
      : [],
    lastInvoiceIds.length > 0
      ? prisma.billingDocument.findMany({
          where: {
            id: { in: lastInvoiceIds },
            tenantId: operatorTenantId, // defense-in-depth
          },
          select: {
            id: true,
            number: true,
            documentDate: true,
            paymentTermDays: true,
            totalGross: true,
            status: true,
          },
        })
      : [],
  ])

  const recurringById = new Map(recurring.map((r) => [r.id, r]))
  const lastInvoiceById = new Map(lastInvoices.map((i) => [i.id, i]))

  return subs.map((sub) => ({
    ...sub,
    billingRecurringInvoice: sub.billingRecurringInvoiceId
      ? recurringById.get(sub.billingRecurringInvoiceId) ?? null
      : null,
    lastGeneratedInvoice: sub.lastGeneratedInvoiceId
      ? lastInvoiceById.get(sub.lastGeneratedInvoiceId) ?? null
      : null,
  }))
}

/**
 * Mark subscriptions as "ended" when their recurring template has gone
 * inactive. Called from the cron post-step.
 */
export async function sweepEndedSubscriptions(prisma: PrismaClient): Promise<number> {
  // Skip entirely if platform billing isn't configured — there's
  // nothing to sweep because no platform_subscriptions should have
  // linked recurring invoices.
  const operatorTenantId = serverEnv.platformOperatorTenantId
  if (!operatorTenantId) return 0

  // Two-query pattern: load cancelled subscriptions first, then batch-read
  // the linked recurring templates separately. PlatformSubscription has no
  // Prisma relation to BillingRecurringInvoice (constraint: Terp models
  // untouched), so `include` is not available here.
  const cancelled = await prisma.platformSubscription.findMany({
    where: {
      status: "cancelled",
      billingRecurringInvoiceId: { not: null },
    },
    select: { id: true, billingRecurringInvoiceId: true },
  })
  if (cancelled.length === 0) return 0

  const recurringIds = cancelled
    .map((s) => s.billingRecurringInvoiceId)
    .filter((x): x is string => x !== null)
  // Defense-in-depth: scope the batch query to the operator tenant
  // even though the ids come from trusted platform_subscriptions rows.
  const recurring = await prisma.billingRecurringInvoice.findMany({
    where: {
      id: { in: recurringIds },
      tenantId: operatorTenantId,
    },
    select: { id: true, isActive: true },
  })
  const isActiveById = new Map(recurring.map((r) => [r.id, r.isActive]))

  let ended = 0
  for (const sub of cancelled) {
    if (!sub.billingRecurringInvoiceId) continue
    const stillActive = isActiveById.get(sub.billingRecurringInvoiceId)
    if (stillActive === false) {
      await prisma.platformSubscription.update({
        where: { id: sub.id },
        data: {
          status: "ended",
          actualEndDate: new Date(),
        },
      })
      ended++
    }
  }
  return ended
}
```

#### Success criteria

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] Unit tests at `src/lib/platform/__tests__/subscription-service.test.ts`:
  - `isSubscriptionBillingEnabled()` returns `false` when env var empty, `true` when set
  - `findOrCreateOperatorCrmAddress()` reuses existing when a subscription for the same customer already has one (mock prisma)
  - `findOrCreateOperatorCrmAddress()` creates new when none exists, calling `crmAddressService.create` with expected fields
  - `appendMarker()` produces `"[platform_subscription:X]"` from null input; `"existing [platform_subscription:X]"` from existing; idempotent: same sub id appended twice produces two markers (no dedupe — that's a caller concern)
  - `removeMarker()` removes the target marker from leading/middle/trailing positions, leaves other markers intact, normalizes whitespace
  - `removeMarker()` with a NON-EXISTENT marker returns the input unchanged (whitespace-normalized) — should not throw or silently corrupt other markers
  - **createSubscription — new recurring path**: with no existing recurring invoice for the (customer, cycle), creates a new `BillingRecurringInvoice` via `billingRecurringService.create` with positionTemplate containing ONE position and internalNotes containing ONE marker. Returns `joinedExistingRecurring: false`. Mock spy: `billingRecurringService.update` is NOT called.
  - **createSubscription — shared recurring path**: with an existing active recurring invoice for the same (customer, cycle) having positions `[A]` and internalNotes `"[platform_subscription:oldSub]"`, calls `billingRecurringService.update` with positionTemplate `[A, newPosition]` and internalNotes `"[platform_subscription:oldSub] [platform_subscription:newSub]"`. Returns `joinedExistingRecurring: true`. Mock spy: `billingRecurringService.create` is NOT called.
  - **createSubscription — cycle isolation**: an existing MONTHLY recurring for the same customer does NOT match when creating an ANNUALLY subscription; a new annual recurring is created instead. Two separate recurring invoices coexist.
  - `cancelSubscription()` on a non-active subscription throws CONFLICT
  - **cancelSubscription — Path A (last sub)**: with no sibling active subscriptions, sets `endDate = nextDueDate - 1ms` on the recurring invoice, marks the subscription cancelled with `endDate = nextDueDate - 1ms`. Mock spy: `billingRecurringService.update` called with `{ endDate }`, NOT with positionTemplate or internalNotes.
  - **cancelSubscription — Path B (others remain)**: with at least one sibling active subscription, removes the matching position (by description) and the subscription's marker from internalNotes, calls `billingRecurringService.update` with `{ positionTemplate, internalNotes }` (no endDate). Marks the subscription cancelled with `endDate = cancelledAt`.
  - **cancelSubscription — Path B with missing description**: if no position matches the module's description, logs a warning but still removes the marker and marks the subscription cancelled.
  - **cancelSubscription — Path B with DUPLICATE descriptions**: if two positions happen to have the same description (e.g. a defensive state or a past bug), `findIndex` + `splice(idx, 1)` removes exactly ONE of them (the first match), leaves the other in place. This matches the "remove ONE matching position" comment in the service code. Test assertion: positions array length decreases by exactly 1, not 2.
  - `sweepEndedSubscriptions()` transitions cancelled → ended when the recurring template is inactive (via two-query pattern)

---

### Phase 10a.4 — Wire `enableModule` / `disableModule` into subscription flow

#### Overview

Extend `tenantManagement.enableModule` and `tenantManagement.disableModule` so that each booking also creates/cancels a `platform_subscription` when `PLATFORM_OPERATOR_TENANT_ID` is configured. Add a `billingCycle` input field to the enable mutation (defaults `MONTHLY`). Do not affect existing behavior when the env var is empty.

#### Changes required

**File: `src/trpc/platform/routers/tenantManagement.ts`**:

1. Import the new service at the top:
```ts
import * as subscriptionService from "@/lib/platform/subscription-service"
```

2. Extend the `enableModule` input schema — add `billingCycle`:
```ts
enableModule: platformAuthedProcedure
  .input(
    z.object({
      tenantId: tenantIdSchema,
      moduleKey: moduleEnum,
      operatorNote: z.string().trim().max(255).optional(),
      billingCycle: z.enum(["MONTHLY", "ANNUALLY"]).default("MONTHLY"),
    }),
  )
```

3. After the existing `tenantModule.upsert(...)` call in the handler, and before the `platformAudit.log(...)`, insert the subscription creation:

```ts
// --- Phase 10a: also create a platform_subscription if billing is enabled.
// Check if an active subscription already exists for this (tenantId, module).
// If so, skip creation (the operator is re-enabling a module that was
// already active — no new contract). If not, create one.
let subscriptionResult: Awaited<ReturnType<typeof subscriptionService.createSubscription>> | null = null
if (subscriptionService.isSubscriptionBillingEnabled()) {
  const existing = await ctx.prisma.platformSubscription.findFirst({
    where: {
      tenantId: input.tenantId,
      module: input.moduleKey,
      status: "active",
    },
    select: { id: true },
  })
  if (!existing) {
    subscriptionResult = await subscriptionService.createSubscription(
      ctx.prisma,
      {
        customerTenantId: input.tenantId,
        module: input.moduleKey,
        billingCycle: input.billingCycle,
      },
      ctx.platformUser.id,
    )
  }
}
```

4. Extend the `platformAudit.log` metadata to include subscription + billing cycle info:

```ts
await platformAudit.log(ctx.prisma, {
  platformUserId: ctx.platformUser.id,
  action: "module.enabled",
  entityType: "tenant_module",
  entityId: row.id,
  targetTenantId: input.tenantId,
  metadata: {
    moduleKey: input.moduleKey,
    operatorNote: input.operatorNote ?? null,
    billingCycle: input.billingCycle,
    subscriptionId: subscriptionResult?.subscriptionId ?? null,
    billingRecurringInvoiceId: subscriptionResult?.billingRecurringInvoiceId ?? null,
  },
  ipAddress: ctx.ipAddress,
  userAgent: ctx.userAgent,
})

return row
```

5. In `disableModule`, after the existing `tenantModule.delete(...)` and before `platformAudit.log(...)`, cancel the matching subscription:

```ts
// --- Phase 10a: cancel the active subscription if billing is enabled.
let cancelledSubscriptionId: string | null = null
if (subscriptionService.isSubscriptionBillingEnabled()) {
  const activeSub = await ctx.prisma.platformSubscription.findFirst({
    where: {
      tenantId: input.tenantId,
      module: input.moduleKey,
      status: "active",
    },
    select: { id: true },
  })
  if (activeSub) {
    await subscriptionService.cancelSubscription(
      ctx.prisma,
      {
        subscriptionId: activeSub.id,
        reason: input.reason ?? "Platform module disabled",
      },
      ctx.platformUser.id,
    )
    cancelledSubscriptionId = activeSub.id
  }
}
```

6. Include `cancelledSubscriptionId` in the audit metadata.

**File: `src/app/platform/(authed)/tenants/[id]/modules/page.tsx`** — extend the enable dialog with a billing cycle selector:

```tsx
const [billingCycle, setBillingCycle] = useState<"MONTHLY" | "ANNUALLY">("MONTHLY")
```

Inside the enable dialog content, between the operator note input and the dialog footer:

```tsx
<div className="space-y-2">
  <Label htmlFor="billingCycle">Abrechnungszyklus</Label>
  <Select
    value={billingCycle}
    onValueChange={(v) => setBillingCycle(v as "MONTHLY" | "ANNUALLY")}
  >
    <SelectTrigger id="billingCycle">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="MONTHLY">Monatlich</SelectItem>
      <SelectItem value="ANNUALLY">Jährlich</SelectItem>
    </SelectContent>
  </Select>
</div>
```

Update the `enableMutation.mutate(...)` call to pass `billingCycle`:

```ts
enableMutation.mutate({
  tenantId,
  moduleKey: enableDialog.moduleKey as ModuleId,
  operatorNote: operatorNote.trim() || undefined,
  billingCycle,
})
```

Reset `billingCycle` to `"MONTHLY"` in the dialog `onOpenChange` cleanup.

#### Success criteria

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm vitest run src/trpc/platform/routers/__tests__/tenantManagement.test.ts`:
  - Existing tests still pass
  - New test: `enableModule` with `billingCycle=MONTHLY` and `PLATFORM_OPERATOR_TENANT_ID` set creates a `platform_subscriptions` row (mocked); metadata contains `subscriptionId` and `billingRecurringInvoiceId`
  - New test: `enableModule` when env var is empty does NOT attempt subscription creation, metadata fields are null
  - New test: `enableModule` for a module that already has an active subscription skips creation (re-enable scenario)
  - New test: `disableModule` cancels the active subscription when env var is set
  - New test: `disableModule` on a module with no subscription still succeeds (env var set but no prior booking via platform)

---

### Phase 10a.5 — New auto-finalize cron route (separate from recurring-invoices)

#### Overview

**The existing `/api/cron/recurring-invoices` route is NOT modified.** It is treated as Terp infrastructure under the operator's hard constraint. Instead, Phase 10a introduces a **new separate cron** at `/api/cron/platform-subscription-autofinalize` scheduled 15 minutes later (04:15 UTC). The new cron reconstructs "what did the 04:00 recurring-invoices cron generate today for platform subscriptions?" via DB queries:

1. Load all `platform_subscriptions` with status ∈ {active, cancelled} and a linked `billingRecurringInvoiceId`.
2. For each, READ the linked `BillingRecurringInvoice.lastGeneratedAt` directly via Prisma.
3. If `lastGeneratedAt ≥ today 00:00 UTC`, find the DRAFT `BillingDocument` in the operator tenant whose `internalNotes` contains the subscription's unique marker `[platform_subscription:<sub.id>]`.
4. If found AND it's not already the subscription's `lastGeneratedInvoiceId`, call `billing-document-service.finalize()` through the existing Terp service.
5. Update `platform_subscriptions.lastGeneratedInvoiceId` to the finalized document's id.
6. Run `sweepEndedSubscriptions()` at the end.

**Terp constraint compliance**:
- NO modifications to `src/app/api/cron/recurring-invoices/route.ts`
- NO modifications to `billing-recurring-invoice-service.ts`
- All writes to Terp tables go through the existing Terp service (`billing-document-service.finalize`)
- All direct Prisma queries on Terp tables (`BillingRecurringInvoice`, `BillingDocument`) are READ-only

#### Changes required

**New file: `src/lib/platform/subscription-autofinalize-service.ts`**:

```ts
/**
 * Platform subscription auto-finalize service (Phase 10a).
 *
 * Transitions DRAFT BillingDocuments generated by the daily recurring-
 * invoices cron to PRINTED status for platform-linked subscriptions.
 * Runs from a separate cron at /api/cron/platform-subscription-autofinalize
 * scheduled 15 minutes after the main recurring-invoices cron.
 *
 * Detection strategy (no FK from BillingDocument back to
 * BillingRecurringInvoice — see plan Phase 10a.5):
 *
 *   1. Load platform_subscriptions with a linked billing_recurring_invoice_id.
 *   2. Read BillingRecurringInvoice.lastGeneratedAt directly via Prisma.
 *      If it's >= today 00:00 UTC, the main cron generated an invoice today.
 *   3. Find the DRAFT BillingDocument in the operator tenant whose
 *      internalNotes contains the subscription marker
 *      `[platform_subscription:<sub.id>]`. This marker was written at
 *      subscription-create time (see subscription-service.createSubscription)
 *      and is copied verbatim onto every generated document by the existing
 *      billing-recurring-invoice-service.generate() at line 357.
 *   4. If its id does not already equal the subscription's
 *      lastGeneratedInvoiceId, finalize it via the existing Terp service.
 *   5. Update the subscription's lastGeneratedInvoiceId pointer.
 *
 * All writes to Terp tables (step 4) go through the existing Terp service.
 * Direct Prisma access to Terp tables is read-only (steps 2, 3).
 */
import type { PrismaClient } from "@/generated/prisma/client"
import { PLATFORM_SYSTEM_USER_ID } from "@/trpc/init"
import { serverEnv } from "@/lib/config"
import * as billingDocService from "@/lib/services/billing-document-service"
import * as platformAudit from "@/lib/platform/audit-service"
import * as subscriptionService from "./subscription-service"
import { platformSubscriptionMarker } from "./subscription-service"

export interface AutoFinalizeSummary {
  /** The operator tenant id this run targeted, or null if unconfigured. Always set before the function returns. */
  operatorTenantId: string | null
  /** Total active subscriptions scanned this run. */
  scanned: number
  /** Number of UNIQUE BillingDocuments finalized this run. May be less than `subscriptionPointersUpdated` when subscriptions share a recurring invoice. */
  finalized: number
  finalizeFailed: number
  /** Number of subscription rows whose `lastGeneratedInvoiceId` pointer was updated. Always >= `finalized`. */
  subscriptionPointersUpdated: number
  skippedAlreadyFinalized: number
  skippedSharedDocAlreadyFinalizedThisRun: number
  skippedNoDraftFound: number
  skippedNotDueToday: number
  endedSubscriptions: number
  errors: Array<{ subscriptionId?: string; invoiceId?: string; error: string }>
}

/**
 * Main entrypoint. Called from the /api/cron/platform-subscription-autofinalize
 * route.
 */
export async function autofinalizePending(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<AutoFinalizeSummary> {
  const summary: AutoFinalizeSummary = {
    operatorTenantId: null,
    scanned: 0,
    finalized: 0,
    finalizeFailed: 0,
    subscriptionPointersUpdated: 0,
    skippedAlreadyFinalized: 0,
    skippedSharedDocAlreadyFinalizedThisRun: 0,
    skippedNoDraftFound: 0,
    skippedNotDueToday: 0,
    endedSubscriptions: 0,
    errors: [],
  }

  // Skip entirely if platform billing isn't configured.
  if (!serverEnv.platformOperatorTenantId) {
    return summary
  }
  const operatorTenantId = serverEnv.platformOperatorTenantId
  summary.operatorTenantId = operatorTenantId

  // UTC start of today — matches the main cron's "today" semantics.
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  )

  // Step 1: load candidate subscriptions.
  //
  // Filter to `status = 'active'` only. Cancelled subscriptions either
  // (Path A) have their recurring invoice's endDate set to trip the
  // generate() gate — zero future DRAFTs are produced — or (Path B)
  // have had their marker removed from internalNotes, so a marker query
  // would find nothing. Scanning cancelled subs would only produce
  // spurious `skippedNoDraftFound` warnings.
  const subs = await prisma.platformSubscription.findMany({
    where: {
      status: "active",
      billingRecurringInvoiceId: { not: null },
    },
    select: {
      id: true,
      billingRecurringInvoiceId: true,
      lastGeneratedInvoiceId: true,
    },
  })
  summary.scanned = subs.length

  // Shared-doc idempotency guard: under the shared-invoice model, multiple
  // subscriptions can resolve to the SAME DRAFT document. We must call
  // billing-document-service.finalize() exactly once per document in a
  // given run. Subsequent subscriptions that find the same document still
  // update their lastGeneratedInvoiceId pointer.
  const finalizedThisRun = new Set<string>()

  for (const sub of subs) {
    if (!sub.billingRecurringInvoiceId) continue

    try {
      // Step 2: did the main cron generate today for this recurring template?
      //         READ the Terp model directly via Prisma (read-only is allowed
      //         by the constraint). Defense-in-depth: scope by operator tenant.
      const recurring = await prisma.billingRecurringInvoice.findFirst({
        where: {
          id: sub.billingRecurringInvoiceId,
          tenantId: operatorTenantId,
        },
        select: { lastGeneratedAt: true },
      })
      if (!recurring?.lastGeneratedAt || recurring.lastGeneratedAt < todayStart) {
        summary.skippedNotDueToday++
        continue
      }

      // Step 3: find the DRAFT BillingDocument by the subscription marker.
      //         The marker is guaranteed-unique per subscription (it contains
      //         the sub.id which is a UUID) and is copied onto every generated
      //         BillingDocument by the existing generate() at
      //         billing-recurring-invoice-service.ts:357.
      //         Under shared invoices, the same DRAFT may match multiple
      //         subscriptions' markers — that's expected.
      const marker = platformSubscriptionMarker(sub.id)
      const draftInvoice = await prisma.billingDocument.findFirst({
        where: {
          tenantId: operatorTenantId,
          type: "INVOICE",
          status: "DRAFT",
          internalNotes: { contains: marker },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      })
      if (!draftInvoice) {
        summary.skippedNoDraftFound++
        // Warn loudly: we expected a DRAFT invoice because the recurring
        // template's lastGeneratedAt is >= today, but none matches the
        // subscription marker. The most likely explanation is that
        // someone edited the recurring template's internalNotes in the
        // tenant-side UI and removed the marker. See FLAG 2b in the plan.
        console.warn(
          `[subscription-autofinalize] No DRAFT invoice found for subscription ${sub.id} ` +
          `(operator tenant ${operatorTenantId}, recurring template ${sub.billingRecurringInvoiceId}). ` +
          `Expected marker in internalNotes: "${marker}". ` +
          `The marker may have been overwritten in the tenant-side billing UI. ` +
          `The operator must manually finalize any stranded DRAFT invoices for this customer.`
        )
        continue
      }

      // Step 4: idempotency check — skip if a previous run already
      //         processed this exact invoice for this subscription.
      if (draftInvoice.id === sub.lastGeneratedInvoiceId) {
        summary.skippedAlreadyFinalized++
        continue
      }

      // Step 5: finalize — but only once per unique document in this run.
      //         A second subscription sharing the same recurring invoice
      //         would find the same DRAFT document; we must not call
      //         finalize() twice on the same document (would throw because
      //         it's no longer DRAFT after the first call).
      //
      // Capture the "already finalized by a sibling this run" state BEFORE
      // we mutate the set — the audit metadata below depends on knowing
      // which branch ran.
      const alreadyFinalizedBySibling = finalizedThisRun.has(draftInvoice.id)
      if (alreadyFinalizedBySibling) {
        // Already finalized earlier in this run by a sibling subscription.
        // Do NOT call finalize again, but still update the pointer and
        // write an audit log for this subscription.
        summary.skippedSharedDocAlreadyFinalizedThisRun++
      } else {
        await billingDocService.finalize(
          prisma,
          operatorTenantId,
          draftInvoice.id,
          PLATFORM_SYSTEM_USER_ID,
        )
        finalizedThisRun.add(draftInvoice.id)
        summary.finalized++
      }

      // Step 6: update the subscription pointer (in BOTH branches —
      //         first-finalize-this-run AND shared-doc-already-finalized).
      await prisma.platformSubscription.update({
        where: { id: sub.id },
        data: { lastGeneratedInvoiceId: draftInvoice.id },
      })
      summary.subscriptionPointersUpdated++

      // Platform audit log (fire-and-forget). One entry per subscription
      // that was processed, regardless of whether the underlying
      // finalize() call ran or was deduped. Use the captured bool —
      // finalizedThisRun.has() would now return true in both branches
      // because we added the id above.
      await platformAudit.log(prisma, {
        platformUserId: null,
        action: "subscription.invoice_auto_finalized",
        entityType: "billing_document",
        entityId: draftInvoice.id,
        targetTenantId: operatorTenantId,
        metadata: {
          subscriptionId: sub.id,
          recurringInvoiceId: sub.billingRecurringInvoiceId,
          sharedDoc: alreadyFinalizedBySibling
            ? "already-finalized-this-run"
            : "finalized-this-run",
        },
      })
    } catch (err) {
      summary.finalizeFailed++
      summary.errors.push({
        subscriptionId: sub.id,
        error: err instanceof Error ? err.message : String(err),
      })
      console.error(
        `[subscription-autofinalize] Failed for subscription ${sub.id}:`,
        err,
      )
      // Do not throw — continue with the next subscription.
    }
  }

  // Sweep cancelled subscriptions whose recurring template has deactivated.
  summary.endedSubscriptions = await subscriptionService
    .sweepEndedSubscriptions(prisma)
    .catch((err) => {
      summary.errors.push({ error: `sweepEnded failed: ${String(err)}` })
      return 0
    })

  return summary
}
```

**New file: `src/app/api/cron/platform-subscription-autofinalize/route.ts`**:

```ts
/**
 * Platform subscription auto-finalize cron (Phase 10a).
 *
 * Runs daily at 04:15 UTC — 15 minutes after /api/cron/recurring-invoices.
 * Reconstructs which DRAFT invoices were generated today for platform-
 * linked subscriptions and finalizes them (DRAFT → PRINTED + PDF + XRechnung).
 *
 * This cron is entirely platform-side. It does not modify the main
 * recurring-invoices cron route or any Terp service. It only READS
 * Terp models and WRITES through the existing billing-document-service.finalize().
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import * as autofinalize from "@/lib/platform/subscription-autofinalize-service"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const summary = await autofinalize.autofinalizePending(prisma, new Date())
    return NextResponse.json({ ok: true, ...summary })
  } catch (err) {
    console.error("[platform-subscription-autofinalize] fatal:", err)
    return NextResponse.json(
      {
        error: "Internal error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
```

**File: `vercel.json`** — add a new entry to the `crons` array:

```json
{
  "path": "/api/cron/platform-subscription-autofinalize",
  "schedule": "15 4 * * *"
}
```

Place it adjacent to the existing `/api/cron/recurring-invoices` entry so the ordering relationship is visible when reviewing `vercel.json`.

#### Success criteria

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `src/app/api/cron/recurring-invoices/route.ts` is **unchanged** on this phase (`git diff --stat` shows no delta on that file)
- [x] `pnpm vitest run src/lib/platform/__tests__/subscription-autofinalize-service.test.ts`:
  - `autofinalizePending` returns a zeroed summary when `platformOperatorTenantId` is empty
  - Only scans `status = 'active'` subscriptions (does NOT scan cancelled ones)
  - Skips subscriptions whose recurring template has `lastGeneratedAt < today 00:00 UTC` (increments `skippedNotDueToday`)
  - Skips when no DRAFT invoice matches the marker (`skippedNoDraftFound`) AND emits a `console.warn` with the subscription id + marker text
  - Skips when the found DRAFT id equals `lastGeneratedInvoiceId` already (`skippedAlreadyFinalized`)
  - **Shared-doc idempotency**: when two subscriptions share the same recurring invoice and produce the same DRAFT document id, `billingDocService.finalize` is called EXACTLY ONCE; the second subscription still has its `lastGeneratedInvoiceId` pointer updated and `skippedSharedDocAlreadyFinalizedThisRun` increments. `finalized = 1`, `subscriptionPointersUpdated = 2` in that scenario.
  - **Shared-doc audit metadata correctness**: in the same scenario, the first subscription's `platform_audit_logs` entry has `metadata.sharedDoc = "finalized-this-run"`, and the second has `metadata.sharedDoc = "already-finalized-this-run"`. (Spy on `platformAudit.log` calls and verify the order-dependent labels — this catches the "always finalized-this-run" off-by-one if `finalizedThisRun.has()` is checked after `.add()` instead of before.)
  - Calls `billingDocService.finalize` with operator tenant id and `PLATFORM_SYSTEM_USER_ID` as the finalizer
  - Updates `lastGeneratedInvoiceId` to the finalized document's id for every subscription that matched a draft
  - Continues on per-subscription failure (does not abort the run)
  - Calls `sweepEndedSubscriptions` at the end regardless of how many were finalized
  - Uses `internalNotes: { contains: '[platform_subscription:<id>]' }` in the prisma query (spy on `prisma.billingDocument.findFirst`)
  - The `recurring.findFirst` query has a `tenantId: operatorTenantId` filter (defense-in-depth)
- [ ] Manual cron trigger test: after `pnpm db:reset` (which seeds 2 subscriptions sharing ONE recurring invoice — see Phase 10a.7), `curl -H "Authorization: Bearer <secret>" http://localhost:3001/api/cron/recurring-invoices` generates ONE DRAFT with two positions, then `curl ... http://localhost:3001/api/cron/platform-subscription-autofinalize` returns `{ ok: true, operatorTenantId: '10000000-...-0001', finalized: 1, subscriptionPointersUpdated: 2, skippedSharedDocAlreadyFinalizedThisRun: 1, ... }` and the DB row flips to PRINTED with populated `pdf_url`. Both platform_subscriptions rows now have their `last_generated_invoice_id` pointing at the same document.

---

### Phase 10a.6 — Platform UI: subscription info on modules page

#### Overview

Extend `/platform/tenants/[id]/modules` to show per-module subscription status alongside the existing booking info. Add a new tRPC query `tenantManagement.listSubscriptions({ tenantId })`. Add a small overdue badge computed on-the-fly using the tenant-side `billing-payment-service.isOverdue` helper.

Deliberately **do NOT** add a separate `/platform/subscriptions` list view in Phase 10a. For 0-5 customers the per-tenant-modules view is enough. A dedicated list page is a Phase 10b nice-to-have.

#### Changes required

**File: `src/trpc/platform/routers/tenantManagement.ts`** — add a new query:

```ts
import * as subscriptionService from "@/lib/platform/subscription-service"
import * as billingPaymentService from "@/lib/services/billing-payment-service"

// ... inside the router object:

listSubscriptions: platformAuthedProcedure
  .input(z.object({ tenantId: tenantIdSchema }))
  .query(async ({ ctx, input }) => {
    const subs = await subscriptionService.listForCustomer(
      ctx.prisma,
      input.tenantId,
    )

    // For each subscription with a lastGeneratedInvoiceId, compute overdue
    // state on the fly using the tenant-side helper. The helper requires
    // the full document + payments + credit notes — we pass a compact
    // projection.
    if (!subscriptionService.isSubscriptionBillingEnabled()) {
      return subs.map((s) => ({ ...s, isOverdue: false }))
    }
    const operatorTenantId = subscriptionService.requireOperatorTenantId()
    const result: Array<typeof subs[number] & { isOverdue: boolean }> = []
    for (const sub of subs) {
      let isOverdue = false
      if (sub.lastGeneratedInvoiceId) {
        try {
          const openItem = await billingPaymentService.getOpenItemById(
            ctx.prisma,
            operatorTenantId,
            sub.lastGeneratedInvoiceId,
          )
          isOverdue = openItem?.isOverdue ?? false
        } catch {
          // invoice might not be in open-items (e.g. already paid or not an
          // INVOICE type) — leave isOverdue=false
        }
      }
      result.push({ ...sub, isOverdue })
    }
    return result
  }),
```

**File: `src/app/platform/(authed)/tenants/[id]/modules/page.tsx`**:

1. Add a new query next to `modulesQuery`:
```ts
const subscriptionsQuery = useQuery(
  trpc.tenantManagement.listSubscriptions.queryOptions({ tenantId }),
)
```

2. Build a lookup map:
```ts
const activeSubByModule = useMemo(() => {
  const map = new Map<string, (typeof subscriptionsQuery.data)[number]>()
  for (const sub of subscriptionsQuery.data ?? []) {
    if (sub.status === "active") map.set(sub.module, sub)
  }
  return map
}, [subscriptionsQuery.data])
```

3. In the modules table, after the existing "Operator" column and before the "Aktion" column, add a new column "Abo":

```tsx
<TableHead>Abo</TableHead>
```

And inside each `TableRow`, a new `TableCell`:

```tsx
<TableCell className="text-xs">
  {(() => {
    const sub = activeSubByModule.get(row.module)
    if (!sub) return <span className="text-muted-foreground">—</span>
    return (
      <div className="space-y-0.5">
        <div>
          <Badge variant="outline">{sub.billingCycle === "MONTHLY" ? "Monatl." : "Jährl."}</Badge>
          {" "}
          {sub.unitPrice.toFixed(2)} {sub.currency}
        </div>
        {sub.billingRecurringInvoice?.nextDueDate ? (
          <div className="text-muted-foreground">
            Nächste: {formatDate(sub.billingRecurringInvoice.nextDueDate)}
          </div>
        ) : null}
        {sub.lastGeneratedInvoice ? (
          <div>
            <span className="font-mono">{sub.lastGeneratedInvoice.number}</span>
            {sub.isOverdue ? (
              <Badge variant="destructive" className="ml-1">überfällig</Badge>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  })()}
</TableCell>
```

4. Also extend the modules page card description to mention the Abo:

```tsx
<CardDescription>
  Gebuchte Module und laufende Abonnements für diesen Tenant.
</CardDescription>
```

#### Success criteria

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [ ] Platform UI smoke test: on `/platform/tenants/<dev-tenant-id>/modules` the Abo column shows subscription info when present
- [ ] Enable a module manually and verify the new row shows up in the Abo column after refresh

---

### Phase 10a.7 — Seed data: second tenant + sample subscription

#### Overview

Extend `supabase/seed.sql` to add a second tenant "Test Customer GmbH", a corresponding `CrmAddress` in the dev tenant's CRM, a sample `platform_subscriptions` row for the CRM module with a linked `BillingRecurringInvoice`, and one pre-generated DRAFT `BillingDocument` so the operator has something to click through on first boot.

#### Changes required

**File: `supabase/seed.sql`** — append a new section at the end (after the existing inbound-invoices seed):

```sql
-- =============================================================
-- Phase 10a: Platform Subscription Billing seed
-- =============================================================
-- Creates a second tenant "Test Customer GmbH" and wires up a sample
-- subscription billed by the dev tenant (which acts as the operator
-- tenant when PLATFORM_OPERATOR_TENANT_ID=10000000-0000-0000-0000-000000000001).

-- 1. Second tenant — the first "paying customer"
INSERT INTO tenants (id, name, slug, is_active, address_street, address_zip, address_city, address_country, email, created_at, updated_at)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  'Test Customer GmbH', 'test-customer', true,
  'Kundenstraße 42', '12345', 'Berlin', 'Deutschland',
  'buchhaltung@test-customer.local',
  NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

-- 2. CrmAddress for Test Customer inside the Dev Company (operator) tenant
INSERT INTO crm_addresses (
  id, tenant_id, number, type, company, street, zip, city, country, email,
  match_code, is_active, created_at, updated_at
)
VALUES (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',  -- operator tenant
  'K-999',
  'CUSTOMER',
  'Test Customer GmbH',
  'Kundenstraße 42',
  '12345',
  'Berlin',
  'DE',
  'buchhaltung@test-customer.local',
  'TEST CUSTOMER GMBH',
  true,
  NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

-- 3. platform_subscriptions rows — two subscriptions (core + crm) for
--    Test Customer. Under the shared-invoice model, BOTH subscriptions
--    will end up pointing at the SAME recurring invoice in step 5, so
--    the seed mirrors the runtime flow exactly: enabling a second
--    module for a customer joins an existing recurring invoice instead
--    of creating a new one.
INSERT INTO platform_subscriptions (
  id, tenant_id, module, status, billing_cycle, unit_price, currency,
  start_date, operator_crm_address_id, billing_recurring_invoice_id,
  created_at, created_by_platform_user_id
)
VALUES
  (
    '50000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',  -- customer tenant
    'core',
    'active',
    'MONTHLY',
    8,
    'EUR',
    date_trunc('month', NOW()),
    '30000000-0000-0000-0000-000000000001',  -- CrmAddress in operator
    NULL,                                    -- set in step 5
    NOW(),
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'crm',
    'active',
    'MONTHLY',
    4,
    'EUR',
    date_trunc('month', NOW()),
    '30000000-0000-0000-0000-000000000001',
    NULL,                                    -- set in step 5 (SAME recurring invoice as sub #1)
    NOW(),
    '00000000-0000-0000-0000-000000000001'
  )
ON CONFLICT (id) DO NOTHING;

-- 4. ONE BillingRecurringInvoice in the operator tenant covering BOTH
--    subscriptions — shared-invoice model. positionTemplate contains
--    two positions (core + crm), internal_notes contains both subscription
--    markers space-separated. Both markers are copied verbatim onto
--    every generated BillingDocument by the existing
--    billing-recurring-invoice-service.generate() at line 357, and the
--    autofinalize cron matches each subscription to the (single) DRAFT
--    invoice via its own marker.
--    next_due_date = NOW() so the first cron run generates the DRAFT
--    immediately.
INSERT INTO billing_recurring_invoices (
  id, tenant_id, name, address_id, interval, start_date, next_due_date,
  auto_generate, is_active, payment_term_days, internal_notes,
  position_template, created_at, updated_at, created_by_id
)
VALUES (
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Abo monthly — Test Customer GmbH',
  '30000000-0000-0000-0000-000000000001',
  'MONTHLY',
  date_trunc('month', NOW()),
  NOW(),
  true,
  true,
  14,
  '[platform_subscription:50000000-0000-0000-0000-000000000001] [platform_subscription:50000000-0000-0000-0000-000000000002]',
  '[
    {"type":"FREE","description":"Terp Core — Benutzer, Mitarbeiter, Stammdaten","quantity":1,"unit":"Monat","unitPrice":8,"vatRate":19},
    {"type":"FREE","description":"Terp CRM — Adressen, Kontakte, Korrespondenz, Anfragen","quantity":1,"unit":"Monat","unitPrice":4,"vatRate":19}
  ]'::jsonb,
  NOW(), NOW(), NULL
) ON CONFLICT (id) DO NOTHING;

-- 5. Link BOTH subscriptions to the SAME recurring invoice.
UPDATE platform_subscriptions
  SET billing_recurring_invoice_id = '40000000-0000-0000-0000-000000000001'
  WHERE id IN (
    '50000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000002'
  )
  AND billing_recurring_invoice_id IS NULL;

-- 6. Pre-enable the core + crm tenant_modules on Test Customer so the
--    feature gate matches the subscription state on first login.
INSERT INTO tenant_modules (tenant_id, module, enabled_at, enabled_by_platform_user_id)
VALUES
  ('20000000-0000-0000-0000-000000000001', 'core', NOW(), '00000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000001', 'crm',  NOW(), '00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;
```

**Note on the platform user seed**: the existing dev setup creates one platform user. The `created_by_platform_user_id` column has **no FK constraint** per the Phase 9 schema, so even if the UUID is wrong, the insert succeeds. The important thing is that the UUID here matches whatever the dev platform user is — if not, update the constant to match.

**Note on cron ordering during local testing**: to manually exercise the full flow, trigger the crons in order:
1. `curl -H "Authorization: Bearer <secret>" http://localhost:3001/api/cron/recurring-invoices` — generates the DRAFT
2. `curl -H "Authorization: Bearer <secret>" http://localhost:3001/api/cron/platform-subscription-autofinalize` — finalizes it

In production, vercel.json schedules them 15 minutes apart (04:00 and 04:15 UTC) so no manual ordering is needed.

**Note on removing the seed from staging / prod**: `supabase/seed.sql` runs only on `pnpm db:reset` against the local Supabase. Staging and prod only receive migrations via `pnpm db:push:staging`. The "Test Customer GmbH" seeded here therefore **never appears on staging or prod automatically** — those environments are populated via the platform UI (`tenantManagement.create`) by the operator. No cleanup is needed when the real first customer comes. If a developer ever manually imports this seed into staging for smoke-testing, they must also manually delete tenant `20000000-0000-0000-0000-000000000001` + its `platform_subscriptions` (ids `50000000-0000-0000-0000-00000000000{1,2}`) + its `billing_recurring_invoices` (ids `40000000-0000-0000-0000-00000000000{1,2}`) + the `crm_addresses` row `30000000-0000-0000-0000-000000000001` in the operator tenant before going live. This is a defensive note, not a required cleanup step.

#### Success criteria

- [x] `pnpm db:reset` completes without errors (full reset = seed re-applied)
- [x] After reset: `SELECT COUNT(*) FROM platform_subscriptions` returns **2** (core + crm) with `billing_recurring_invoice_id` populated on both — **both pointing at the SAME recurring invoice id**
- [x] After reset: `SELECT COUNT(*) FROM billing_recurring_invoices WHERE tenant_id = '10000000-...-0001'` returns **1** (shared invoice model — one recurring template serves both subscriptions)
- [x] After reset: the seeded recurring invoice has BOTH markers in `internal_notes` — `'[platform_subscription:50000000-...0001] [platform_subscription:50000000-...0002]'`
- [x] After reset: `jsonb_array_length(position_template)` on the recurring invoice returns `2` (core + crm positions)
- [ ] Manually trigger the first cron: `curl -H "Authorization: Bearer <secret>" http://localhost:3001/api/cron/recurring-invoices` — response shows `generated: 1` (ONE document, not two)
- [ ] ONE DRAFT `billing_documents` row now exists with BOTH markers in `internal_notes` and TWO positions (net total 12€, gross 14.28€ at 19% VAT)
- [ ] Manually trigger the second cron: `curl -H "Authorization: Bearer <secret>" http://localhost:3001/api/cron/platform-subscription-autofinalize` — response shows `{ ok: true, operatorTenantId: '10000000-...-0001', finalized: 1, subscriptionPointersUpdated: 2, skippedSharedDocAlreadyFinalizedThisRun: 1, ... }` (finalize called exactly once; both subscriptions' pointers updated)
- [ ] The invoice has transitioned: `SELECT status FROM billing_documents WHERE tenant_id = '10000000-...-0001' AND type = 'INVOICE' ORDER BY created_at DESC LIMIT 1` returns one `PRINTED` row
- [ ] PDF was stored: the row has a non-null `pdf_url`
- [ ] BOTH `platform_subscriptions.last_generated_invoice_id` fields point at the SAME billing document id
- [ ] `/platform/tenants/20000000-0000-0000-0000-000000000001/modules` shows both core and crm rows with their respective "Abo" column values ("Monatl. 8.00 EUR" and "Monatl. 4.00 EUR"), same next due date on both, and the SAME invoice number linked under both modules

---

### Phase 10a.8 — Tests + documentation + `AGENTS.md` update

#### Overview

Consolidate the testing story and update project-level documentation so future sessions understand that Phase 10a introduced subscription billing.

#### Changes required

**File: `CLAUDE.md`** — add a new short section after "Architecture":

```markdown
## Platform Subscription Billing (Phase 10a)

When `PLATFORM_OPERATOR_TENANT_ID` is set, the platform admin's module
bookings also create `BillingRecurringInvoice` rows inside the designated
operator tenant, wrapped in `platform_subscriptions` lifecycle records.
Two daily crons run in sequence:

1. `/api/cron/recurring-invoices` at 04:00 UTC — Terp cron, generates
   DRAFT invoices from all due recurring templates (cross-tenant).
2. `/api/cron/platform-subscription-autofinalize` at 04:15 UTC — new
   platform cron, finalizes DRAFT invoices belonging to platform
   subscriptions (matched via an `[platform_subscription:<id>]` marker
   in `BillingRecurringInvoice.internalNotes`). Finalize triggers PDF
   + XRechnung generation as a side effect of the existing Terp service.

Email delivery is manual in Phase 10a — operator sends from the tenant-
side billing UI with 2 clicks per invoice.

**Hard constraint**: Terp-side code (`src/lib/services/billing-*`,
`crm-*`, `email-*`, `src/trpc/routers/`) must not be modified by platform
features. Platform code may READ Terp models directly via Prisma, but
all WRITES to Terp tables go through the existing Terp services with
`(prisma, tenantId, ...)`. Prisma relations from platform models to
Terp models are defined at the SQL level only (via migration `REFERENCES`
clauses) — no `@relation` declarations in `schema.prisma`.

Key files:
- `src/lib/platform/module-pricing.ts` — hardcoded module price catalog
- `src/lib/platform/subscription-service.ts` — bridge logic (create, cancel, list)
- `src/lib/platform/subscription-autofinalize-service.ts` — autofinalize logic
- `src/app/api/cron/platform-subscription-autofinalize/route.ts` — cron route
- `prisma/schema.prisma` `PlatformSubscription` model — subscription state

See `thoughts/shared/plans/2026-04-10-platform-subscription-billing.md`
for the full plan.
```

**File: `README.md`** (if it documents env vars) — add `PLATFORM_OPERATOR_TENANT_ID` to the environment section with a one-line description.

#### Success criteria

- [x] Full test suite passes: `pnpm vitest run src/lib/platform src/trpc/platform` (all 51 new tests pass; 2 pre-existing argon2-heavy tests are flaky under concurrent load but pass in isolation — unrelated to Phase 10a)
- [x] `pnpm typecheck` shows no new errors (only the single pre-existing TS2589 in retention-logs-table.tsx remains)
- [x] `pnpm lint` shows no new errors

---

## Manual verification checklist (end-to-end)

After all phases merged and `pnpm db:reset`:

1. **Setup**
   - [ ] `PLATFORM_OPERATOR_TENANT_ID=10000000-0000-0000-0000-000000000001` set in `.env.local`
   - [ ] `pnpm dev` logs `[platform-subscriptions] Operator tenant "Dev Company" active.`
   - [ ] Log in as platform user

2. **Booking flow (tests the shared-invoice path)**
   - [ ] Navigate to `/platform/tenants/20000000-0000-0000-0000-000000000001/modules` (Test Customer GmbH)
   - [ ] The core row already shows "Monatl. 8.00 EUR" from the seed — confirm
   - [ ] The crm row already shows "Monatl. 4.00 EUR" from the seed — confirm
   - [ ] **Record the current `next_due_date`** of the shared recurring invoice: `SELECT next_due_date FROM billing_recurring_invoices WHERE id = '40000000-0000-0000-0000-000000000001'` — note the value `$NDD_BEFORE`
   - [ ] Click "Aktivieren" on the Billing module
   - [ ] Dialog shows: operator note field + billing cycle selector
   - [ ] Select **MONTHLY** (same cycle as the existing core+crm subscriptions — this exercises the shared-invoice "join existing" path)
   - [ ] Submit
   - [ ] Row now shows "Monatl. 4.00 EUR" + the SAME next due date as core/crm
   - [ ] DB check: `SELECT COUNT(DISTINCT billing_recurring_invoice_id) FROM platform_subscriptions WHERE tenant_id = '20000000-...'` returns **1** (all three subscriptions share the same recurring invoice)
   - [ ] DB check: `SELECT jsonb_array_length(position_template) FROM billing_recurring_invoices WHERE id = '40000000-...-0001'` returns **3**
   - [ ] DB check: the recurring invoice's `internal_notes` contains **three** `[platform_subscription:...]` markers space-separated
   - [ ] **FLAG 10 verification — `next_due_date` UNCHANGED**: re-query `SELECT next_due_date FROM billing_recurring_invoices WHERE id = '40000000-0000-0000-0000-000000000001'` and confirm the value equals `$NDD_BEFORE`. Adding a mid-cycle module does not re-anchor the billing cycle — the new position will first be billed on the existing next-due boundary (documented in FLAG 10 as "join at next cycle boundary").

3. **Cron flow — TWO crons, in STRICT ORDER**
   - [ ] **Step 3.1 (MUST run first)**: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/recurring-invoices` — response shows `generated: 1` (one recurring → one DRAFT, not three)
   - [ ] Confirm between steps: ONE DRAFT invoice now exists in the operator tenant for Test Customer GmbH with THREE positions (core + crm + billing). Verify via `SELECT status, jsonb_array_length('[]'::jsonb) FROM billing_documents WHERE tenant_id='10000000-...' AND type='INVOICE' ORDER BY created_at DESC LIMIT 1` — status is `DRAFT`.
   - [ ] **Step 3.2 (MUST run second, and only after 3.1 completes)**: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/platform-subscription-autofinalize` — response shows `{ ok: true, operatorTenantId: '10000000-0000-0000-0000-000000000001', finalized: 1, subscriptionPointersUpdated: 3, skippedSharedDocAlreadyFinalizedThisRun: 2, ... }`
   - [ ] The single invoice is now PRINTED in the operator tenant billing UI
   - [ ] All three subscriptions' `last_generated_invoice_id` point at the same document
   - [ ] PDF download works from the billing UI
   - [ ] If `BillingTenantConfig.eInvoiceEnabled` is true on the operator tenant, XML is also present
   - [ ] Verify `src/app/api/cron/recurring-invoices/route.ts` was **not modified**: `git diff HEAD -- src/app/api/cron/recurring-invoices/route.ts` shows no changes
   - [ ] **Reversed-order safety check**: if 3.2 is ever run before 3.1 (e.g. from a manual curl mistake or if the 04:00 cron failed), the autofinalize returns a zeroed summary (`finalized: 0, skippedNotDueToday: 3`) because `recurring.lastGeneratedAt < todayStart`. Running 3.1 afterward then 3.2 again produces the expected `finalized: 1`. Verify at least once.

3b. **Booking flow — cycle isolation (creates SECOND recurring invoice)**
   - [ ] Click "Aktivieren" on warehouse module, select ANNUALLY
   - [ ] DB check: `SELECT COUNT(*) FROM billing_recurring_invoices WHERE tenant_id = '10000000-...' AND is_active = true` returns **2** (one monthly sharing core+crm+billing, one annually for warehouse alone)
   - [ ] The modules page shows warehouse with "Jährl. 40.00 EUR" and a DIFFERENT next due date from the monthly modules

4. **Cancellation flow — Path B (other subs remain on the recurring)**
   - [ ] Precondition: the PRINTED invoice from step 3.2 still exists in the operator tenant (it's the already-generated document containing core+crm+billing). Record its id as `$PRINTED_DOC_ID`.
   - [ ] Back in platform UI, disable the CRM module for Test Customer with a reason "Test Path B"
   - [ ] The Abo column no longer shows CRM
   - [ ] Check DB: `SELECT status, end_date, cancellation_reason FROM platform_subscriptions WHERE module = 'crm' AND tenant_id = '20000000-...'` → `status=cancelled`, `end_date` close to now (NOT nextDueDate-1ms), reason stored
   - [ ] Check DB: the recurring invoice's `end_date` is still **null** (not set, because core + billing still share it)
   - [ ] Check DB: `jsonb_array_length(position_template)` on the recurring invoice is now **2** (core + billing, CRM removed)
   - [ ] Check DB: the recurring invoice's `internal_notes` no longer contains the CRM subscription marker, but still contains the core + billing markers
   - [ ] **Already-generated DRAFT/PRINTED is unchanged**: `SELECT jsonb_array_length(positions.*) ...` or look at the operator tenant billing UI — the PRINTED invoice `$PRINTED_DOC_ID` STILL contains THREE positions including CRM. Cancelling a subscription only edits the TEMPLATE for future generations; it does NOT retroactively rewrite already-generated invoices. The customer who already received the bundle invoice still owes the full amount for the period that was already invoiced.
   - [ ] Trigger both crons (in order, 3.1 then 3.2): at the next natural period boundary, the new DRAFT generates with ONLY core + billing positions (no CRM). For this test scenario, since `next_due_date` is likely still in the future, the cron will skip → `generated: 0`. You can verify the shape by manually setting `next_due_date = NOW()` in the DB temporarily, then running the crons, then inspecting the newly generated DRAFT.

4b. **Cancellation flow — Path A (last sub on the recurring)**
   - [ ] Disable the warehouse module (annual recurring) — this is the only sub on that recurring
   - [ ] Check DB: `SELECT end_date FROM billing_recurring_invoices WHERE id = <annual_recurring>` → set to `nextDueDate - 1ms`
   - [ ] Check DB: the warehouse platform_subscription shows `status=cancelled`, `end_date = nextDueDate - 1ms` (matching the recurring)
   - [ ] Trigger the main cron: `generated: 1` (only the monthly recurring generates; the annual one skips because endDate trips the upfront gate)
   - [ ] Trigger autofinalize: the warehouse subscription is swept from `cancelled` to `ended` via `sweepEndedSubscriptions` because the annual recurring's `isActive` flipped to false

5. **Overdue badge**
   - [ ] In the operator tenant billing UI, look at one of the generated PRINTED invoices — it's not yet paid
   - [ ] Manually update its `document_date` in the DB to be 30 days in the past
   - [ ] Refresh `/platform/tenants/.../modules`: the Abo column shows "überfällig" badge next to the invoice number

6. **Env var empty fallback**
   - [ ] Clear `PLATFORM_OPERATOR_TENANT_ID`, restart dev server
   - [ ] Book another module on Test Customer — no error, no subscription created
   - [ ] The Abo column shows "—" for that module
   - [ ] Trigger the autofinalize cron: returns a zeroed summary, nothing finalized

## Flags — things the user should know before merging

These are points where the plan deliberately took a shortcut or depends on something that could break under stress. Ranked by risk.

### FLAG 1 — Operator tenant NumberSequence bootstrap (medium risk)

Staging and production operator tenants created **after** Phase 10a ships will **not** automatically have a `number_sequences` row for the `invoice` key. The first subscription billing run will trigger `numberSeqService.getNextNumber(prisma, OPERATOR_TENANT_ID, "invoice")`, which does an atomic upsert — so it self-initializes with `next_value=1` and an empty prefix.

The default empty prefix means the first invoice number will be literally `"1"`, which is legally acceptable in Germany but looks ugly and breaks your visual continuity with dev (which uses `RE-`).

**Mitigation**: before deploying Phase 10a to staging/prod, manually insert a row:
```sql
INSERT INTO number_sequences (tenant_id, key, prefix, next_value)
VALUES ('<prod-operator-tenant-id>', 'invoice', 'RE-', 1);
```

The plan does not automate this because it's a one-time per-environment setup and the automation would require knowing when a tenant becomes "the operator tenant" which is only via env var.

**Alternative I considered but did not use**: have the subscription-service auto-initialize the sequence on first use. Rejected because it mixes billing-config concerns into the subscription bridge.

### FLAG 2 — `lastGeneratedInvoiceId` back-ref coupling (low risk)

Phase 10a stores `lastGeneratedInvoiceId` on `platform_subscriptions` instead of adding a back-ref column to `BillingDocument`. This keeps the billing schema untouched but means:

- If a `BillingDocument` is deleted, the SQL-level FK `ON DELETE SET NULL` (defined in the migration, enforced by Postgres) cleans up — but then the platform UI loses its "last invoice" link and the operator has to check the billing UI directly.
- Because Prisma has no relation declaration, the generated Prisma client does not surface a typed "dangling pointer" warning. Code that reads `sub.lastGeneratedInvoiceId` has to tolerate null.
- A subscription with rapidly generated invoices (not possible in monthly/annual cycles, but theoretically) would lose history — `lastGeneratedInvoiceId` is only the most recent.

**Mitigation**: none needed for 0-5 customers. If invoice-per-subscription history becomes important, add a new `platform_subscription_invoices` join table later.

### FLAG 2b — `internalNotes` marker convention (low-medium risk)

Phase 10a uses `BillingRecurringInvoice.internalNotes` as a hidden metadata channel to carry the `[platform_subscription:<uuid>]` marker. This is a convention, not a typed field:

- The convention is one-directional: subscription-service writes the marker on create; the autofinalize cron reads it.
- If a tenant-side user manually edits `internalNotes` on a platform-created recurring invoice and removes the marker, the autofinalize cron will stop finding its DRAFT invoices for that subscription. The invoices will remain in DRAFT until the operator manually finalizes them via the tenant-side UI — same as a failed auto-finalize (FLAG 4 below).
- Nothing protects the marker from being overwritten. A future tenant-side UI improvement could highlight that `internalNotes` starting with `[platform_subscription:` is system-managed, but that's out of scope.

**Mitigation for Phase 10a**: none. The operator is the only person who has write access to the operator tenant's recurring invoices, and they would not break their own markers. If Phase 10a expands to multi-operator teams, this needs rethinking.

**Alternative considered**: add a dedicated `platform_subscription_id` column to `BillingRecurringInvoice`. Rejected because it requires modifying a Terp model — against the hard constraint.

### FLAG 3 — Race condition on first CrmAddress creation (very low risk)

`findOrCreateOperatorCrmAddress` uses a "check-then-create" pattern without transaction-level locking. Two concurrent first-bookings for the same new customer tenant could both create a `CrmAddress`, producing a duplicate.

**Probability**: effectively zero for a solo operator clicking one button at a time. **Mitigation**: if it ever happens, manually delete the duplicate. If the problem materializes, add a unique index on `crm_addresses(tenant_id, match_code)` where `match_code` is deterministic from the customer tenant's name.

### FLAG 4 — Auto-finalize failure leaves invoices in DRAFT (low risk)

If `finalize()` fails (e.g. PDF generation crashes for a malformed header), the `BillingDocument` stays in DRAFT. The operator has to manually finalize it via the tenant-side billing UI. This is the same failure mode as tenant-side `finalize()` today — consistent behavior, no new failure class.

**Mitigation**: the auto-finalize service logs the error per invoice and continues. No single invoice failure aborts the cron run. The operator notices on their monthly billing check.

### FLAG 5 — No e-invoice config validation before first generation (low risk)

If the operator tenant has `BillingTenantConfig.eInvoiceEnabled = true` but missing seller fields (companyName, taxId, etc.), the first finalize call will succeed at the PDF level but **throw** at the XRechnung validation step. The XRechnung failure is currently best-effort in `finalize()`, so the status still transitions to PRINTED — but the auto-finalize logs an error and the operator has to manually regenerate the XML after fixing config.

**Mitigation**: before enabling `eInvoiceEnabled` on the operator tenant, the operator should fill in the billing tenant config fully. This is already the behavior tenants face today — no new requirement.

### FLAG 6 — Two-path cancellation under the shared-invoice model (low risk — verified)

Because multiple platform subscriptions can share ONE `BillingRecurringInvoice`, `cancelSubscription` branches on whether this is the LAST active subscription on the recurring:

**Path A — last active sub**: Computes `endDate = nextDueDate - 1 millisecond` on the recurring invoice. **Verified against Terp code** at `src/lib/services/billing-recurring-invoice-service.ts:332` and `:405` — both checks use strict `>`, so subtracting 1ms is sufficient. Consequence: the cron runs ZERO more times on this recurring invoice after cancellation (Q6 decision: "Kunde hat bereits bezahlt bis Periodenende").

**Path B — other active subs remain**: Does NOT touch `endDate` on the recurring invoice. Instead:
- Removes ONE position matching the module's description (from `MODULE_PRICES[module].description`) from `positionTemplate`
- Removes this subscription's marker from `internalNotes` via `removeMarker()` which splits on whitespace, filters out the target marker, rejoins with single spaces
- Calls `billingRecurringService.update()` with the filtered positionTemplate + internalNotes
- The recurring invoice continues generating invoices with the remaining positions for the remaining subscriptions
- The cancelled subscription's `end_date` is set to `cancelledAt` (today), reflecting that THIS subscription's service ended today even though the recurring invoice continues for others

**Residual risks — Path A**:
- **Timezone**: `nextDueDate` is `Timestamptz`, JS `Date` comparison is UTC-internal. No ambiguity.
- **Clock skew**: single Vercel/Postgres, NTP-synced. 1ms resolution fine.
- **Same-day cancellation after morning cron**: `nextDueDate` already advanced by the morning run. `endDate = advancedNextDue - 1ms` skips the NEXT-NEXT generation. Customer already received this morning's invoice. Correct.
- **Same-day cancellation before morning cron**: If the operator cancels at 03:00 while `nextDueDate` is still pointing at today's 00:00 (the 04:00 cron hasn't advanced it yet), the formula produces `endDate = nextDueDate - 1ms = yesterday 23:59:59.999`. At 04:00 the upfront gate at `generate():332` checks `nextDueDate > endDate` → `today 00:00 > yesterday 23:59:59.999` → YES → deactivate, no invoice generated. Zero generations today. Customer does not receive today's invoice. Per Q6 this is correct ("keine weitere Rechnung nach Cancel"). If the operator wants today's invoice to go out, they should delay the cancel click until after the cron runs.

**Residual risks — Path B**:
- **Position match by description is fragile**: documented separately as FLAG 9. If the operator manually edited the description in the tenant-side billing UI, `cancelSubscription` logs a warning and still removes the marker but leaves the position in place. Next generation will still include the "orphan" position. Operator has to manually remove it via tenant-side UI.
- **Sibling count race**: if two concurrent `cancelSubscription` calls for different subs on the same recurring invoice arrive at the same moment, the `count()` + `update()` is not fully atomic. Both might see `siblingCount > 0` (Path B) when actually the second cancel should be Path A. Mitigation: the `$transaction` scope + Postgres row-level isolation make this extremely unlikely in practice. For 0-5 customers with manual sequential clicks, it's effectively impossible. If it ever matters, wrap the count+update in a `SELECT FOR UPDATE` on the recurring invoice row.

The prior "medium risk" marking was based on the assumption that the semantics hadn't been verified against code. They have. Both paths remain "low risk — verified" after the shared-invoice refactor.

### FLAG 7 — Consistency with future Phase 10 dashboard (no code conflict)

The `PLATFORM_OPERATOR_TENANT_ID` env var is designed to be shared with any future "operator self-tenant dashboard" work (the topic from the earlier strategic discussion). The subscription billing bridge and the dashboard widgets are orthogonal features using the same configuration — no conflict. The plan deliberately keeps the env var name and validation in `src/lib/config.ts` so both features can import it from one place.

### FLAG 8 — Two crons, one logical operation (low risk)

Phase 10a splits the logical "generate + finalize daily subscription invoices" operation into **two separate crons** to honor the Terp constraint:

- `/api/cron/recurring-invoices` at 04:00 UTC (existing, untouched)
- `/api/cron/platform-subscription-autofinalize` at 04:15 UTC (new)

The 15-minute gap is arbitrary but generous — the main cron takes seconds for a handful of templates. If the main cron runs long and overlaps with the autofinalize window, the autofinalize still works because it queries `lastGeneratedAt ≥ todayStart` (not "generated in the last 15 minutes"), so late-arriving generations from the main cron are still picked up on the next day's autofinalize run or on a retry.

**Failure modes**:
- Main cron succeeds, autofinalize cron fails → DRAFT invoices exist but not finalized. Operator manually finalizes from the tenant-side billing UI. Next day's autofinalize run picks them up automatically if they're still DRAFT and the marker + `lastGeneratedAt` checks still pass (they do, until the template generates a new invoice).
- Main cron fails, autofinalize runs anyway → autofinalize finds no new DRAFTs (because none were generated), completes with a zeroed summary. No state pollution.
- Both succeed → normal flow, all invoices in PRINTED state.

**Not tested in Phase 10a**: what happens if the two crons run in reversed order (autofinalize before recurring-invoices). In production this cannot happen because they are scheduled 15 minutes apart. In dev with manual curl-triggering, running autofinalize first is a no-op (zero summary) and the subsequent recurring-invoices run generates the DRAFT that the next autofinalize run picks up. Safe but reviewer should note it.

### FLAG 9 — Position identification by description (low-medium risk)

`cancelSubscription` Path B removes a position from a shared recurring invoice's `positionTemplate` by matching `description === MODULE_PRICES[module].description`. This is a convention, not a typed field.

**Why this instead of a custom JSONB field**: `billing-recurring-invoice-service.create()` has a STRICTLY TYPED position input (`src/lib/services/billing-recurring-invoice-service.ts:112-122`) — only the named fields are allowed. Adding a custom field like `_platformModule` would require either a TypeScript cast (ugly) or a post-create update() call to add the custom field (two roundtrips). Description matching avoids both.

**Fragility scenarios**:
- **Tenant-side manual edit**: If the operator (as tenant user) opens the operator tenant's billing UI and manually changes the description of a position on a platform-managed recurring invoice, future `cancelSubscription` Path B calls for that module will log a warning ("no position found matching description") and leave the position in place. The marker is still removed and the subscription is still marked cancelled — it's a display-only drift that the operator can clean up manually.
- **MODULE_PRICES description change in code**: If a Phase 10a deploy changes `MODULE_PRICES.crm.description`, subscriptions created BEFORE the deploy carry the old description in their recurring invoices. Cancellation of those subs will fail to find the position by the new description. Mitigation: never change an existing module's description — add a new module or accept the drift until old subscriptions naturally expire. A warning comment in `src/lib/platform/module-pricing.ts` documents this contract.
- **Localization**: descriptions are hardcoded German. If `MODULE_PRICES.description` ever becomes i18n-keyed, the matching breaks entirely. Out of scope for Phase 10a.

**Mitigation for Phase 10a**: none. The operator is the only one with write access to the operator tenant's recurring invoices, and they wouldn't knowingly sabotage their own platform. For 0-5 customers this is acceptable. If Phase 10b needs stronger identification, the plan is to cast through the loose `update()` type to store a `_platformModule` custom JSONB field — documented here but not implemented in 10a.

### FLAG 10 — New positions join at the next cycle boundary (accepted trade-off)

Under the shared-invoice model, adding a second module to an existing customer mid-cycle appends a position to the existing recurring invoice but does NOT change `nextDueDate`. The next generation happens at the recurring invoice's existing next-period boundary. Between the add time and that boundary, the customer uses the new module "for free".

**Example**: Customer has Core monthly since 2026-01-01. On 2026-01-15 (mid-month), operator adds CRM. The existing recurring invoice has `nextDueDate = 2026-02-01`. On 2026-02-01 the cron generates an invoice with BOTH Core and CRM positions. Customer effectively got CRM "for free" from Jan 15 to Jan 31.

**Why this is accepted**:
- For 0-5 customers the operator can manually issue a prorated invoice via the tenant-side billing UI if they want to charge for the partial period.
- Alternative (immediate billing for a partial period) would require either a separate one-off invoice at add time (complicates the flow) or pro-rating logic in `createSubscription` (out of scope per Q6: "no pro-rata").
- First subscription ever for a customer creates a NEW recurring invoice with `nextDueDate = startDate = now`, so the first invoice is generated on the next cron run — no "free period" for the first module.

**Operator-visible consequence**: The modules page shows the "next billing date" from the shared recurring invoice, which is the same for all modules on that recurring. A module added mid-cycle appears with the existing next billing date, not a "starts billing on X" date specific to the new module. Phase 10b could add a per-subscription "billing starts at" display if this causes confusion.

## References

- **Research basis**: `thoughts/shared/research/2026-04-10-platform-subscription-billing.md`
- **Phase 9 plan**: `thoughts/shared/plans/2026-04-09-platform-admin-system.md`
- **Demo tenant plan** (reuses `users-service.create` widened tx): `thoughts/shared/plans/2026-04-09-demo-tenant-system.md`
- **Recurring invoice original plan**: `thoughts/shared/plans/2026-03-18-ORD_05-wiederkehrende-rechnungen.md`
- **Email dispatch plan**: `thoughts/shared/plans/2026-04-02-ZMI-TICKET-141-email-versand.md`
- **Critical files**:
  - `src/lib/services/billing-recurring-invoice-service.ts:314-515` — generate + generateDue
  - `src/lib/services/billing-document-service.ts:512-595` — finalize (auto-PDF + XRechnung)
  - `src/app/api/cron/recurring-invoices/route.ts` — existing Terp cron, **NOT modified** by Phase 10a (Terp constraint). The new autofinalize cron lives at `src/app/api/cron/platform-subscription-autofinalize/route.ts` instead.
  - `src/trpc/platform/routers/tenantManagement.ts:472-527` — enableModule (target for subscription wiring)
  - `src/trpc/platform/routers/tenantManagement.ts:529-581` — disableModule (target for cancellation wiring)
  - `src/trpc/init.ts:33-34` — PLATFORM_SYSTEM_USER_ID constant
  - `src/lib/config.ts:8-44` — serverEnv (target for PLATFORM_OPERATOR_TENANT_ID)
  - `src/instrumentation.ts:1-6` — startup validation hook
  - `prisma/schema.prisma:291-306` — TenantModule (unchanged by Phase 10a)
  - `prisma/schema.prisma:1081-1120` — BillingRecurringInvoice (target for inverse relation)
  - `prisma/schema.prisma:359-418` — CrmAddress (target for inverse relation)

## What is NOT in this plan

- **Phase 10b** (Auto-email delivery) will extend the auto-finalize step with `email.send.send` after successful finalization. Requires: recipient resolution (CrmAddress.email vs CrmContact.email), default template selection, send-log tracking, retry config.
- **Phase 10c** (SEPA Lastschrift) will add SEPA mandate management, pain.008.xml generation, Creditor-ID registration, and return-debit handling. Large standalone project.
- **Price catalog UI** — if/when hardcoded constants become painful (estimated 18+ months), migrate to a `BillingPriceList` inside the operator tenant (research Option B) or a new `platform_module_prices` DB table. Estimated 2-3 hours of work on top of Phase 10a.
- **Platform-wide subscription dashboard** — a `/platform/subscriptions` page listing all contracts across tenants with MRR, churn, upcoming renewals. Nice-to-have; not blocking.
- **Subscription price updates** — currently a subscription "freezes" its price at creation time. Changing the price on an existing subscription requires manual update via DB or a new mutation. Not needed for 0-5 customers where prices rarely change.
- **Cross-tenant support for the operator tenant** — the operator tenant is pinned by env var per environment. There is no concept of multiple operator tenants or "which operator tenant is the billing source for which subscription". Single source of truth by design.
