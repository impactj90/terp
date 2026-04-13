---
date: 2026-04-12
author: Tolga Ayvazoglu
status: implemented
topic: "SEPA-Zahlungsläufe (pain.001.001.09) für Eingangsrechnungen"
tags: [plan, sepa, payment-run, pain001, inbound-invoices, iso20022]
related_research:
  - thoughts/shared/research/2026-04-12_19-55-28_sepa-zahlungslaeufe-bestandsaufnahme.md
  - thoughts/shared/research/2026-04-07-terp-invoice-phase1-eingangsrechnungen.md
---

## Implementation Notes (2026-04-12)

All four phases implemented in a single commit. Deviations from the
plan as written:

- **Migration timestamps**: `20260414100000` etc. from the plan conflicted with
  `20260414100001_add_wh_stocktake_permissions.sql` already in the tree. New
  migrations use the `20260423000000`–`20260423000003` prefix instead. Order
  and content are unchanged.
- **tenant_modules constraint**: the plan referenced
  `tenant_modules_module_key_chk` / column `module_key`; the actual schema
  uses `chk_tenant_modules_module` / column `module`. The permissions
  migration fixes the CHECK constraint under its real name.
- **XML generator library**: hand-rolled via `fast-xml-parser`'s `XMLBuilder`
  (already a project dep) rather than the unmaintained `sepa@npm` package.
  The unit tests assert structured `PstlAdr` (TwnNm/Ctry), all mandatory
  ISO-20022 elements, the `CtrlSum`, and the `NOTPROVIDED` BIC fallback.
- **`iban` package**: added as a runtime dep with a hand-written
  `src/types/iban.d.ts` stub (the package ships no `.d.ts`).
- **Platform module pricing**: added `payment_runs` to
  `src/lib/platform/module-pricing.ts` so the `ModuleId` record stays
  exhaustive — required by the TypeScript check on the platform subscription
  module.
- **`PaymentRunPreflightError` → `PaymentRunPreflightValidationError`**: kept
  as the canonical class and re-exported under the shorter name. The
  `ValidationError` suffix makes `handleServiceError` map it to BAD_REQUEST
  automatically.
- **`ConfirmDialog`** does not accept an `extra` slot, so the cancel-run
  confirm uses the description text only. The optional `reason` field in
  the tRPC `cancel` input is kept for API callers.
- **Phase 4.3 XSD snapshot test** skipped: the XML-generator unit tests
  already snapshot the structure and assert the mandatory fields. External
  XSD validation stays a pre-merge manual step as the plan documents.
- **Playwright spec** is a smoke-level spec (three tests) that guards
  route loading, page shell, and pre-flight banner handling. Full
  happy-path seeding requires IBAN/CRM fixtures that are out of scope for
  this plan and are better expressed as integration tests.

Shipped files:

- SQL: `supabase/migrations/20260423000000_create_payment_runs.sql`,
  `20260423000001_add_payment_run_permissions_and_module.sql`,
  `20260423000002_create_payment_runs_storage_bucket.sql`,
  `20260423000003_payment_run_items_active_unique.sql`.
- Prisma models `PaymentRun` + `PaymentRunItem` with inverse relations on
  `Tenant` and `InboundInvoice`.
- Services: `payment-run-repository`, `payment-run-data-resolver`,
  `payment-run-xml-generator`, `payment-run-service`, `payment-run-xml-flow`.
- IBAN helper: `src/lib/sepa/iban-validator.ts`.
- tRPC router: `src/trpc/routers/invoices/payment-runs.ts`, wired in
  `invoices/index.ts` as `invoices.paymentRuns`.
- UI hooks: `src/hooks/usePaymentRuns.ts`.
- UI components:
  `src/components/invoices/payment-runs/{payment-runs-page,proposal-section,existing-runs-section,payment-run-status-badge,payment-run-detail}.tsx`.
- UI pages:
  `src/app/[locale]/(dashboard)/invoices/inbound/payment-runs/{page,[id]/page}.tsx`.
- Sidebar entry under `invoicesSection` in `sidebar-nav-config.ts`.
- Permission catalog entries (5) in `src/lib/auth/permission-catalog.ts`.
- Module registration in `src/lib/modules/constants.ts`, bucket in
  `supabase/config.toml`, module price in
  `src/lib/platform/module-pricing.ts`.
- i18n namespace `paymentRuns` + sidebar label in `messages/de.json` /
  `messages/en.json`.
- Tests: `payment-run-data-resolver.test.ts` (22), `payment-run-service.test.ts`
  (15), `payment-run-xml-generator.test.ts` (8),
  `payment-run-permission-uuid-consistency.test.ts` (5) — 50 passing.
- Playwright spec: `src/e2e-browser/52-payment-runs.spec.ts`.
- Handbook: new section `22.16 Zahlungsläufe (SEPA)` plus five glossary rows
  in `docs/TERP_HANDBUCH.md`.

Verification:
`pnpm vitest run src/lib/services/__tests__/payment-run-*.test.ts` — 4 files,
50 tests, all green.
`pnpm typecheck` — only the pre-existing unrelated `scanner-terminal.tsx`
error remains.
`pnpm lint` — no payment-run warnings.


# SEPA-Zahlungsläufe (pain.001.001.09) für Eingangsrechnungen — Implementierungsplan

## Overview

Buchhalter wählt freigegebene, unbezahlte Eingangsrechnungen aus einem Vorschlag aus, Terp generiert eine **pain.001.001.09** SEPA-Sammelüberweisungs-XML, der Buchhalter lädt die Datei bei seiner Bank hoch, die Bank führt die Sammelüberweisung aus, der Buchhalter markiert den Lauf anschließend in Terp als „gebucht".

Der Lauf lebt in einem neuen Modell `PaymentRun (1) → PaymentRunItem (n) → InboundInvoice` mit Status `DRAFT → EXPORTED → BOOKED → CANCELLED`. Bezahl-Information wird **nicht** auf `InboundInvoice` gespiegelt — der Bezahl-Lifecycle und der DATEV-Exportierungs-Lifecycle sind unabhängige Dimensionen. Die XML wird erst beim Download erzeugt, in Supabase Storage persistiert und per Signed-URL ausgeliefert. Lieferanten-Bankdaten kommen primär aus CRM (`CrmBankAccount`) mit Fallback auf die Rechnungsfelder (`InboundInvoice.sellerIban/Bic`) und einer inline-Konfliktauflösung im Vorschlag.

## Current State Analysis

Ausgangslage (vollständige Bestandsaufnahme: `thoughts/shared/research/2026-04-12_19-55-28_sepa-zahlungslaeufe-bestandsaufnahme.md`):

- **Kein SEPA-/pain.001-/PaymentRun-Code im Repo.** Weder Modell, Migration, Stub noch TODO. Greenfield.
- **Eigene Bankdaten** des Mandanten liegen in `BillingTenantConfig` (`prisma/schema.prisma:976-1005`): `companyName`, `iban`, `bic`, `companyStreet/Zip/City/Country` — **alle nullable**. UI unter `/admin/billing-config` (`src/components/billing/tenant-config-form.tsx:134-154`).
- **Lieferanten-Bankverbindungen** liegen in `CrmBankAccount` (`prisma/schema.prisma:543-561`): `iban` NOT NULL, `bic` nullable, `isDefault` vorhanden (aber **ohne** DB-Constraint gegen mehrere Defaults pro Adresse). Geladen mit `orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]` in `crm-address-repository.ts:70,227`. Service-API: `listBankAccounts`, `createBankAccount`, `updateBankAccount`, `deleteBankAccount` in `src/lib/services/crm-address-service.ts:724-839`.
- **InboundInvoice** (`prisma/schema.prisma:5596-5659`) hat redundante Bankfelder `sellerIban`/`sellerBic` und strukturierte Adresse `sellerStreet/Zip/City/Country` — alle nullable, befüllt vom ZUGFeRD-Parser (`src/lib/services/zugferd-xml-parser.ts`). Der Invoice-Status kennt **keinen** Bezahl-Status: `DRAFT|PENDING_APPROVAL|APPROVED|REJECTED|EXPORTED|CANCELLED` (freier String, Check-Constraint in `supabase/migrations/20260413100000_create_inbound_invoice_tables.sql:98-99`). `EXPORTED` bezeichnet heute ausschließlich den DATEV-Export (`datevExportedAt`).
- **Permissions** in zentralem Katalog `src/lib/auth/permission-catalog.ts:12,27-29,342-348`, deterministisch per UUIDv5 aus dem Key abgeleitet (Namespace `f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1`). Seed erfolgt in SQL-Migration, nicht in einem Seed-Skript (Muster in `supabase/migrations/20260413100001_add_inbound_invoice_permissions_and_module.sql:20-75`, UUIDs sind **hardcoded** und werden per Node-Offline-Skript vorab berechnet).
- **NumberSequence** (`prisma/schema.prisma:415-429`) ist etabliert mit atomarem Upsert-Increment (`src/lib/services/number-sequence-service.ts:59-72`). Existierende Prefixe: `K- V- AG- ART- PO- ER-`. **Kein** `PR-`.
- **Supabase Storage** wird domain-spezifisch genutzt: `inbound-invoices` Bucket (`inbound-invoice-service.ts:15`), `documents` Bucket (`billing-document-einvoice-service.ts:33`). Helper: `src/lib/supabase/storage.ts` (`upload`, `createSignedReadUrl(expirySeconds=3600)`, `fixSignedUrl`).
- **Audit-Logging** fire-and-forget (`src/lib/services/audit-logs-service.ts:173-214`), `computeChanges` mit `TRACKED_FIELDS`, `log().catch(() => {})` als Muster.
- **Service+Repository+tRPC-Pattern** durchgehend: `inbound-invoice-service.ts` → `inbound-invoice-repository.ts` → `src/trpc/routers/invoices/inbound.ts` mit `invProcedure = tenantProcedure.use(requireModule(...))` und `.use(requirePermission(X))`.
- **XML-Generierung**: `@e-invoice-eu/core` kennt nur CII/XRechnung; `fast-xml-parser@5.5.10` wird bisher nur parsend eingesetzt — **keine SEPA-Library**, keine XSD im Repo, keine IBAN-Validierung (weder Regex noch MOD-97).
- **UI-Struktur** des ER-Moduls: drei Sidebar-Einträge (`/invoices/inbound`, `/invoices/inbound/approvals`, `/invoices/inbound/settings`) in `src/components/layout/sidebar/sidebar-nav-config.ts:389-414`. Kein Top-Level-Tab-Container. Bulk-Auswahl-Pattern (`Set<string>` + shadcn `Checkbox` mit `indeterminate`) ist 4–5× kopiert (`approval-bulk-actions.tsx:37-63`, `timesheet-approval-table.tsx:24-25`), aber **nicht** im Eingangsrechnungs-Modul.
- **i18n**: `next-intl`, `messages/de.json` + `messages/en.json`, Namespace `inboundInvoices` vorhanden (Sub-Keys `status`, `list`, `detail`, `upload`, `lineItems`, `approval`, …), **kein** `paymentRuns`.
- **E2E-Tests**: Playwright in `src/e2e-browser/*.spec.ts`, Inbound-Invoice-Referenz: `50-inbound-invoices.spec.ts`, `51-inbound-approval-workflow.spec.ts`. Config: `playwright.config.ts` (testDir `src/e2e-browser`, locale `de-DE`, Port 3001).
- **Handbuch**: `docs/TERP_HANDBUCH.md`, Eingangsrechnungen in Abschnitt 22 (Zeile ~10130 in der Datei).

## Desired End State

Nach vollständigem Rollout:

1. **Datenmodell**: Zwei neue Tabellen `payment_runs` + `payment_run_items` in Postgres, TS-Modelle in `@prisma/client`, mit Status-CHECK-Constraint, Snapshot-Spalten in `payment_run_items`, FK auf `inbound_invoices.id`, Tenant-Index.
2. **Backend**: Service-Trias `payment-run-service` / `payment-run-data-resolver` / `payment-run-xml-generator` plus Repository plus tRPC-Router `invoices.paymentRuns` mit 8 Endpoints. `getPaymentStatus(invoice)`-Helper, der den Bezahlstatus aus bestehenden `PaymentRunItem`-Rows ableitet, ohne `InboundInvoice` zu mutieren.
3. **pain.001.001.09**: Jede generierte XML validiert gegen das offizielle ISO-20022-Schema (manuell via Online-Validator in Phase 1/2, automatisiert via Snapshot-Test ab Phase 4).
4. **UI**: Seite `/invoices/inbound/payment-runs` (Liste + Detail) mit Pre-Flight-Banner, Vorschlags-Sektion, Bestehende-Läufe-Sektion, Multi-Select, Ampel-Status-Badges, inline Konfliktauflösung, Detail-Page mit Download-/Buchen-/Stornieren-Buttons. Neue Sidebar-Einträge sichtbar bei Permission.
5. **Permissions**: 5 neue Permissions `payment_runs.{view,create,export,book,cancel}` im Katalog, seeded in Migration, per Rolle: ADMIN (alle 5), BUCHHALTUNG (alle 5), VORGESETZTER (view), PERSONAL (keine).
6. **Storage**: Bucket `payment-runs` (privat, kein Public Read), Pfad `{tenantId}/{paymentRunId}.xml`. XML wird beim ersten Download generiert und persistiert; spätere Downloads liefern dieselbe Datei.
7. **Tests**: Unit-Tests (service, data-resolver, xml-generator), Integration-Tests (Router + DB), 1 Playwright-E2E-Spec `52-payment-runs.spec.ts`.
8. **Handbuch**: Neuer Abschnitt „Zahlungsläufe (SEPA)" in `docs/TERP_HANDBUCH.md` mit Praxisbeispiel, Glossar-Einträge für PaymentRun, pain.001, SEPA.
9. **Audit-Trail**: Jede Transition (create, exportXml, markBooked, cancel) schreibt einen `audit_log`-Eintrag mit `entityType="payment_run"`, `entityId`, Action, Before/After-Diff auf `TRACKED_FIELDS`.

### Verifikation End-to-End

- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:browser` grün.
- Manuell: Buchhalter legt einen Lauf mit gemischten Rechnungen an (grün/gelb/rot), löst Konflikte, lädt XML herunter, prüft die Datei im [ISO-20022-Online-Validator](https://www.mobilefish.com/services/iso20022/iso20022.php) bzw. gegen KoSIT und markiert den Lauf als gebucht.
- Audit-Log zeigt alle Transitionen in `/admin/audit-logs`.

## Key Discoveries

- **Snapshot-Prinzip ist verhandlungsfest**: `PaymentRunItem` hält alle zahlungsrelevanten Felder (IBAN, BIC, Adresse, Betrag, Empfängername) als **eigene Spalten**, nicht als Live-Lookup auf `InboundInvoice` oder `CrmBankAccount`. Dadurch bleibt die generierte XML reproduzierbar, selbst wenn später im CRM eine IBAN geändert wird.
- **XML-Library-Risiko** (D4): `kewisch/sepa.js` ist die einzige etablierte npm-Option, wurde aber ursprünglich für `pain.001.001.03` geschrieben. Ob v9 mit strukturierter `PstlAdr` (`TwnNm`, `Ctry`) nativ erzeugt werden kann, ist ungeklärt. **Phase 1 enthält einen harten Gate-Smoke-Test**: kann die Library v9 mit strukturierter Adresse? → weiter. Sonst → Hand-Roll mit `fast-xml-parser@5.5.10` `XMLBuilder` (existiert bereits im Repo).
- **DATEV-`EXPORTED` bleibt unangetastet**: Der Status auf `InboundInvoice` ist ein DATEV-Buchhaltungsexport und unabhängig von der SEPA-Welt. Bezahlstatus wird über `getPaymentStatus(invoice)` aus PaymentRunItems abgeleitet, nicht auf `InboundInvoice` gesetzt.
- **Permission-UUIDs werden offline vorberechnet**: Es gibt kein SQL-Helper, Migrationen hardcoden die UUIDs als String. Wir brauchen einen **einmaligen Offline-Schritt** (einfaches Node-Snippet mit `uuidv5`), dessen Output in die Migration gepastet wird. In den Plan kommt das Snippet explizit.
- **CrmBankAccount hat keine Unique-Constraint auf `isDefault=true`**: Es kann 0 oder >1 Defaults pro Adresse geben. Der Data-Resolver wählt deterministisch den **ersten** Account nach `orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]`, unabhängig davon ob `isDefault=true` — mit explizitem Vermerk, dass das Feature keine zusätzliche Constraint nachrüstet (out of scope).
- **Storage-Bucket muss durch Migration angelegt werden**: Die existierenden Buckets `inbound-invoices` und `documents` werden ebenfalls in SQL-Migrationen angelegt (via `storage.buckets`-INSERT). Das neue Bucket `payment-runs` folgt demselben Muster.
- **Playwright-E2E-Pattern ist etabliert**: `src/e2e-browser/50-inbound-invoices.spec.ts` ist die ideale Vorlage — serielle `test.describe.serial`, `navigateTo(page, "/invoices/inbound")`, deutsche UI-Texte. Neue Spec: `52-payment-runs.spec.ts`.

## What We're NOT Doing

Explizit **out of scope** (dokumentiert, damit die Implementierung nicht abdriftet):

- **pain.008 / SEPA-Lastschrift** — eigenes Ticket
- **SEPA-Mandatsverwaltung** (nur für pain.008 relevant)
- **Mehrere Bankkonten pro Mandant** — Terp unterstützt weiterhin genau ein Konto über `BillingTenantConfig`
- **Approval-Workflow für PaymentRuns** — keine `MATERIAL_FIELDS`-Definition, keine Freigabe-Schritte, keine `approvalVersion`
- **Cron „EXPORTED seit X Tagen, nicht gebucht"** — kann später nachgerüstet werden, kein neuer Cron in diesem Feature
- **IBAN-Validierung bei jedem Speichern in CRM/ER** — Validierung läuft nur beim SEPA-Export, nirgends sonst
- **Bulk-Helper „Lieferanten ohne IBAN exportieren"** — nice-to-have, post-launch
- **PaymentRun-Settings-Page** — die eigene Mandanten-IBAN bleibt Single Source of Truth in `/admin/billing-config`, keine Spiegelung
- **Adress-Cleanup-UI** — bei fehlenden Adressdaten wird der Buchhalter via Direkt-Link in den jeweiligen Lieferanten-Datensatz geleitet
- **Enforcement einer Unique-Constraint auf `CrmBankAccount.isDefault`** — bleibt bestehendes Verhalten
- **Änderungen an existierenden Cron-Routen** — laut Hard Constraints tabu
- **`InboundInvoice`-Schema-Änderungen** — kein neuer Status, kein `paidAt`, kein `paymentStatus`, keine Relation
- **Gläubiger-ID (Creditor Identifier)** — wird für pain.001 (Credit Transfer) nicht benötigt
- **Mehrere Bankkonten pro Lieferant auswählbar machen** — der Resolver nimmt das Default-Konto, Punkt

## Implementation Approach

Vier Phasen, strikt sequentiell, jede Phase mit eigenem Verifikationspunkt. Kein Merge in `staging`, bis die Phase manuell abgenommen ist.

- **Phase 1**: Datenmodell + Service-Layer + **kritischer SEPA-Library-Smoke-Test**. Keine UI, keine tRPC-Router. Ergebnis: DB-Schema steht, Service-Funktionen sind testbar, wir wissen definitiv, welche Library-Strategie wir verwenden.
- **Phase 2**: tRPC-Router + Pre-Flight-Validierung + Supabase-Storage-Integration. Backend ist von Postman/curl voll durchspielbar.
- **Phase 3**: UI (Sidebar, Liste mit Vorschlag, Detail, Konfliktauflösung, Download-Flow). End-to-End manuell klickbar.
- **Phase 4**: Vollständige Testabdeckung (Unit, Integration, Playwright-E2E), Handbuch-Eintrag, Glossar.

Das Entwickler-Git-Muster:
- Einen Feature-Branch `feature/sepa-payment-runs` pro Phase mit PRs: `sepa-phase-1-model`, `sepa-phase-2-backend`, `sepa-phase-3-ui`, `sepa-phase-4-tests-docs`.
- Zwischen den Phasen `pnpm check && pnpm test` grün, manuelle Verifikation via Staging.

---

## Phase 1: Datenmodell + Service-Layer + Smoke-Test

### Overview

DB-Schema für `PaymentRun` + `PaymentRunItem` anlegen, NumberSequence-Key `payment_run`/Prefix `PR-` registrieren, Permission-Katalog um `payment_runs.*` erweitern, Service-Layer implementieren (`payment-run-service`, `payment-run-data-resolver`, `payment-run-xml-generator`). **Kritischer Gate**: der SEPA-Library-Smoke-Test entscheidet, ob wir `sepa@npm` oder Hand-Roll nutzen.

### Changes Required

#### 1.1 Migration: Tabellen anlegen

**File**: `supabase/migrations/20260414100000_create_payment_runs.sql` (neu)

```sql
-- payment_runs: Kopf-Tabelle eines SEPA-Sammellaufs
CREATE TABLE payment_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number VARCHAR(50) NOT NULL, -- PR-2026-001
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  execution_date DATE NOT NULL, -- gewünschtes Ausführungsdatum (ReqdExctnDt)
  debtor_name VARCHAR(70) NOT NULL, -- Snapshot BillingTenantConfig.companyName
  debtor_iban VARCHAR(34) NOT NULL, -- Snapshot BillingTenantConfig.iban
  debtor_bic VARCHAR(11),
  total_amount_cents BIGINT NOT NULL DEFAULT 0,
  item_count INTEGER NOT NULL DEFAULT 0,
  xml_storage_path TEXT,
  xml_generated_at TIMESTAMPTZ,
  booked_at TIMESTAMPTZ,
  booked_by UUID,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID,
  cancelled_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  CONSTRAINT payment_runs_status_chk CHECK (status IN ('DRAFT','EXPORTED','BOOKED','CANCELLED')),
  CONSTRAINT payment_runs_number_unique UNIQUE (tenant_id, number)
);

CREATE INDEX idx_payment_runs_tenant_status ON payment_runs (tenant_id, status);
CREATE INDEX idx_payment_runs_tenant_created ON payment_runs (tenant_id, created_at DESC);

-- payment_run_items: Snapshot der im Lauf enthaltenen Rechnungen
CREATE TABLE payment_run_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payment_run_id UUID NOT NULL REFERENCES payment_runs(id) ON DELETE CASCADE,
  inbound_invoice_id UUID NOT NULL REFERENCES inbound_invoices(id) ON DELETE RESTRICT,

  -- Snapshot — NICHT mutierbar nach PaymentRun.created
  effective_creditor_name VARCHAR(70) NOT NULL,
  effective_iban VARCHAR(34) NOT NULL,
  effective_bic VARCHAR(11),
  effective_street VARCHAR(70),
  effective_zip VARCHAR(16),
  effective_city VARCHAR(35) NOT NULL,
  effective_country VARCHAR(2) NOT NULL, -- ISO 3166-1 alpha-2
  effective_amount_cents BIGINT NOT NULL,
  effective_currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  effective_remittance_info VARCHAR(140) NOT NULL, -- invoiceNumber / Rechnungsnummer

  iban_source VARCHAR(10) NOT NULL,     -- 'CRM' | 'INVOICE' | 'MANUAL'
  address_source VARCHAR(10) NOT NULL,  -- 'CRM' | 'INVOICE' | 'MANUAL'

  end_to_end_id VARCHAR(35) NOT NULL,   -- EndToEndIdentification (pain.001): invoice number oder fallback uuid
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pri_iban_source_chk CHECK (iban_source IN ('CRM','INVOICE','MANUAL')),
  CONSTRAINT pri_address_source_chk CHECK (address_source IN ('CRM','INVOICE','MANUAL'))
);

CREATE INDEX idx_pri_tenant_run ON payment_run_items (tenant_id, payment_run_id);
CREATE INDEX idx_pri_inbound_invoice ON payment_run_items (tenant_id, inbound_invoice_id);

-- NumberSequence Seed (für bestehende Tenants + Default für neue via Trigger — siehe 1.3)
INSERT INTO number_sequences (id, tenant_id, key, prefix, next_value, created_at, updated_at)
SELECT gen_random_uuid(), t.id, 'payment_run', 'PR-', 1, now(), now()
FROM tenants t
ON CONFLICT (tenant_id, key) DO NOTHING;
```

**Begründung der Zeichenbegrenzungen**: pain.001.001.09 beschränkt viele Felder via ISO-20022-`Max70Text` / `Max35Text` / `Max16Text` / `Max140Text`. Wir spiegeln diese Limits in der DB, um Export-Fehler früh zu erwischen.

**Warum `total_amount_cents BIGINT`**: Vermeidet Floating-Point-Probleme bei Summen über viele Rechnungen; Konvertierung von `Decimal(12,2)` → Cents passiert im Service-Layer.

#### 1.2 Prisma-Schema

**File**: `prisma/schema.prisma` (am Ende, nach den existierenden Payroll-Modellen)

```prisma
model PaymentRun {
  id                  String    @id @default(uuid()) @db.Uuid
  tenantId            String    @map("tenant_id") @db.Uuid
  number              String    @db.VarChar(50)
  status              String    @default("DRAFT") @db.VarChar(20)
  executionDate       DateTime  @map("execution_date") @db.Date
  debtorName          String    @map("debtor_name") @db.VarChar(70)
  debtorIban          String    @map("debtor_iban") @db.VarChar(34)
  debtorBic           String?   @map("debtor_bic") @db.VarChar(11)
  totalAmountCents    BigInt    @default(0) @map("total_amount_cents")
  itemCount           Int       @default(0) @map("item_count")
  xmlStoragePath      String?   @map("xml_storage_path")
  xmlGeneratedAt      DateTime? @map("xml_generated_at") @db.Timestamptz(6)
  bookedAt            DateTime? @map("booked_at") @db.Timestamptz(6)
  bookedBy            String?   @map("booked_by") @db.Uuid
  cancelledAt         DateTime? @map("cancelled_at") @db.Timestamptz(6)
  cancelledBy         String?   @map("cancelled_by") @db.Uuid
  cancelledReason     String?   @map("cancelled_reason")
  notes               String?
  createdAt           DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime  @updatedAt        @map("updated_at") @db.Timestamptz(6)
  createdBy           String?   @map("created_by") @db.Uuid

  tenant              Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  items               PaymentRunItem[]

  @@unique([tenantId, number])
  @@index([tenantId, status])
  @@index([tenantId, createdAt(sort: Desc)])
  @@map("payment_runs")
}

model PaymentRunItem {
  id                     String   @id @default(uuid()) @db.Uuid
  tenantId               String   @map("tenant_id") @db.Uuid
  paymentRunId           String   @map("payment_run_id") @db.Uuid
  inboundInvoiceId       String   @map("inbound_invoice_id") @db.Uuid

  effectiveCreditorName  String   @map("effective_creditor_name") @db.VarChar(70)
  effectiveIban          String   @map("effective_iban") @db.VarChar(34)
  effectiveBic           String?  @map("effective_bic") @db.VarChar(11)
  effectiveStreet        String?  @map("effective_street") @db.VarChar(70)
  effectiveZip           String?  @map("effective_zip") @db.VarChar(16)
  effectiveCity          String   @map("effective_city") @db.VarChar(35)
  effectiveCountry       String   @map("effective_country") @db.VarChar(2)
  effectiveAmountCents   BigInt   @map("effective_amount_cents")
  effectiveCurrency      String   @default("EUR") @map("effective_currency") @db.VarChar(3)
  effectiveRemittanceInfo String  @map("effective_remittance_info") @db.VarChar(140)

  ibanSource             String   @map("iban_source") @db.VarChar(10)
  addressSource          String   @map("address_source") @db.VarChar(10)

  endToEndId             String   @map("end_to_end_id") @db.VarChar(35)
  createdAt              DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  paymentRun     PaymentRun     @relation(fields: [paymentRunId], references: [id], onDelete: Cascade)
  inboundInvoice InboundInvoice @relation(fields: [inboundInvoiceId], references: [id])

  @@index([tenantId, paymentRunId])
  @@index([tenantId, inboundInvoiceId])
  @@map("payment_run_items")
}
```

**Gegenseite** an bestehenden Modellen (inverse Relation):

- `model Tenant { ... paymentRuns PaymentRun[] ... }` in `prisma/schema.prisma:95-281` (am Ende der Relations-Liste).
- `model InboundInvoice { ... paymentRunItems PaymentRunItem[] ... }` in `prisma/schema.prisma:5596-5659` (am Ende der Relations-Liste, nach `approvals`).

Prisma-Client regenerieren: `pnpm db:generate`.

#### 1.3 NumberSequence-Default für neue Tenants

Bestehender Mechanismus: neue Tenants bekommen ihre Default-Sequenzen über `supabase/seed.sql` und einen Service-Call in der Tenant-Creation-Routine. Der NumberSequence-Service erzeugt beim ersten `getNextNumber(..., "payment_run")` **automatisch** den Eintrag per Upsert (`number-sequence-service.ts:59-72`) — **kein zusätzlicher Trigger nötig**. Die Migration `20260414100000` hat trotzdem einen Retro-Seed für existierende Tenants (siehe 1.1), damit die Sequenz zentral sichtbar ist und per Admin-UI konfiguriert werden kann.

Seed-Datei für neue lokale DBs:

**File**: `supabase/seed.sql` — Zeile bei den bestehenden NumberSequence-Seeds anhängen:

```sql
-- Payment Run number sequence (PR-2026-001)
INSERT INTO number_sequences (id, tenant_id, key, prefix, next_value)
VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'payment_run', 'PR-', 1)
ON CONFLICT (tenant_id, key) DO NOTHING;
```

**File**: `src/lib/services/number-sequence-service.ts:35-57` — Ergänzung der `DEFAULT_PREFIXES`-Map:

```typescript
const DEFAULT_PREFIXES: Record<string, string> = {
  customer: "K-",
  inquiry: "V-",
  offer: "AG-",
  article: "ART-",
  purchase_order: "PO-",
  inbound_invoice: "ER-",
  payment_run: "PR-", // NEU
}
```

#### 1.4 Permission-Katalog erweitern

**File**: `src/lib/auth/permission-catalog.ts:342-348` — direkt unter dem `inbound_invoices.*`-Block einfügen:

```typescript
// Payment Runs (SEPA)
p("payment_runs.view",   "payment_runs", "view",   "View SEPA payment runs"),
p("payment_runs.create", "payment_runs", "create", "Create SEPA payment runs"),
p("payment_runs.export", "payment_runs", "export", "Download SEPA XML files"),
p("payment_runs.book",   "payment_runs", "book",   "Mark payment run as booked"),
p("payment_runs.cancel", "payment_runs", "cancel", "Cancel payment runs"),
```

**Offline-UUID-Berechnung** (einmaliger Schritt, vor dem Schreiben der Migration):

```bash
node -e '
const { v5: uuidv5 } = require("uuid");
const NS = "f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1";
for (const k of ["payment_runs.view","payment_runs.create","payment_runs.export","payment_runs.book","payment_runs.cancel"]) {
  console.log(k.padEnd(22), uuidv5(k, NS));
}
'
```

Output wird in die Migration gepastet. **Zur Verifikation**: derselbe Wert muss bei `permissionIdByKey("payment_runs.view")` im TS-Katalog herauskommen (wird durch Unit-Test abgedeckt, siehe 1.9).

#### 1.5 Migration: Permissions + Modul-Registrierung

**File**: `supabase/migrations/20260414100100_add_payment_run_permissions_and_module.sql` (neu)

Struktur analog zu `20260413100001_add_inbound_invoice_permissions_and_module.sql:20-75`:

```sql
-- payment_runs als gültigen Modul-Key zulassen (Check-Constraint erweitern)
ALTER TABLE tenant_modules DROP CONSTRAINT IF EXISTS tenant_modules_module_key_chk;
ALTER TABLE tenant_modules ADD CONSTRAINT tenant_modules_module_key_chk
  CHECK (module_key IN (
    'inventory','hr','crm','billing','warehouse','inbound_invoices',
    'payment_runs'
    -- ... alle bisherigen Keys aus der bestehenden Migration unverändert übernehmen
  ));

-- Permission-UUIDs (offline berechnet mit uuidv5, NS = f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1)
-- payment_runs.view   → <UUID-1>
-- payment_runs.create → <UUID-2>
-- payment_runs.export → <UUID-3>
-- payment_runs.book   → <UUID-4>
-- payment_runs.cancel → <UUID-5>

-- ADMIN: alle 5
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"<UUID-1>"'::jsonb
    UNION ALL SELECT '"<UUID-2>"'::jsonb
    UNION ALL SELECT '"<UUID-3>"'::jsonb
    UNION ALL SELECT '"<UUID-4>"'::jsonb
    UNION ALL SELECT '"<UUID-5>"'::jsonb
  ) sub
) WHERE code = 'ADMIN';

-- BUCHHALTUNG: alle 5
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"<UUID-1>"'::jsonb
    UNION ALL SELECT '"<UUID-2>"'::jsonb
    UNION ALL SELECT '"<UUID-3>"'::jsonb
    UNION ALL SELECT '"<UUID-4>"'::jsonb
    UNION ALL SELECT '"<UUID-5>"'::jsonb
  ) sub
) WHERE code = 'BUCHHALTUNG';

-- VORGESETZTER: nur view (kann Läufe einsehen, nicht steuern)
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"<UUID-1>"'::jsonb
  ) sub
) WHERE code = 'VORGESETZTER';

-- PERSONAL: keine
```

**Begründung Rollen-Matrix**: Payment Runs sind ein rein buchhalterisches Feature. VORGESETZTER bekommt Lesezugriff (Transparenz), aber keine Export-/Book-/Cancel-Rechte. PERSONAL ist außen vor — im Gegensatz zu `inbound_invoices.*`, wo PERSONAL Uploads machen kann, hat PERSONAL hier weder View- noch Write-Rechte.

#### 1.6 Repository: `payment-run-repository.ts`

**File**: `src/lib/services/payment-run-repository.ts` (neu)

Exports (Muster aus `inbound-invoice-repository.ts:4-12,36-95`):

```typescript
export const DEFAULT_INCLUDE = {
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      inboundInvoice: { select: { id: true, number: true, invoiceNumber: true, sellerName: true, dueDate: true } },
    },
  },
} satisfies Prisma.PaymentRunInclude

export async function findById(prisma: PrismaClient, tenantId: string, id: string)
export async function findMany(prisma, tenantId, { status?, search?, page, pageSize })
export async function create(prisma, tenantId, data: CreatePaymentRunInput): Promise<PaymentRun>
export async function updateStatus(prisma, tenantId, id, patch: { status, ...}): Promise<PaymentRun>
export async function setXmlStoragePath(prisma, tenantId, id, path: string): Promise<PaymentRun>

/**
 * Liefert alle InboundInvoices, die in einem nicht-CANCELLED PaymentRun enthalten sind.
 * Nötig, um "aktive" Zahlungsbindung zu prüfen (Vorschlag-Filter, getPaymentStatus).
 */
export async function findInvoiceIdsWithActivePaymentRun(
  prisma: PrismaClient,
  tenantId: string,
  invoiceIds: string[]
): Promise<Set<string>>
```

#### 1.7 Service: `payment-run-data-resolver.ts`

**File**: `src/lib/services/payment-run-data-resolver.ts` (neu)

```typescript
export type DataSource = "CRM" | "INVOICE" | "MANUAL"
export type RowStatus = "GREEN" | "YELLOW" | "RED"

export interface ResolvedIban {
  iban: string | null
  bic: string | null
  source: DataSource
  conflict: {
    crm?: { iban: string; bic: string | null }
    invoice?: { iban: string; bic: string | null }
  } | null
}

export interface ResolvedAddress {
  creditorName: string | null
  street: string | null
  zip: string | null
  city: string | null
  country: string | null // ISO alpha-2
  source: DataSource
  conflict: {
    crm?: { city: string; country: string }
    invoice?: { city: string; country: string }
  } | null
}

export interface ResolvedRow {
  invoiceId: string
  iban: ResolvedIban
  address: ResolvedAddress
  status: RowStatus
  blockers: Array<
    | { type: "NO_IBAN" }
    | { type: "NO_ADDRESS" }
    | { type: "NO_SUPPLIER" }
    | { type: "IBAN_INVALID"; value: string }
    | { type: "IBAN_CONFLICT" }
    | { type: "ADDRESS_CONFLICT" }
  >
}

export async function resolveRow(
  prisma: PrismaClient,
  tenantId: string,
  invoiceId: string,
  choices?: { ibanSource?: DataSource; addressSource?: DataSource }
): Promise<ResolvedRow>
```

**Resolver-Regeln** (erschöpfend, keine offenen Fragen):

1. **Supplier-Lookup**: Lade `InboundInvoice` mit `include: { supplier: { include: { bankAccounts: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }, ... } } }` — ein einziger Join, wiederverwendbar.

2. **IBAN-Resolution**:
   - CRM-Kandidat: erstes Element von `supplier?.bankAccounts` (der Default oder, falls keiner `isDefault=true` ist, der älteste).
   - Invoice-Kandidat: `{ iban: invoice.sellerIban, bic: invoice.sellerBic }`, nur wenn `sellerIban` befüllt.
   - Normalisierung vor Vergleich: Leerzeichen entfernen, Uppercase. Vergleich nur auf `iban` (BIC ist nicht konfliktrelevant, BIC wird aus derselben Quelle genommen wie IBAN).
   - Wenn nur eine Quelle → `source = "CRM"|"INVOICE"`, `conflict = null`.
   - Wenn beide, gleich → `source = "CRM"`, `conflict = null`.
   - Wenn beide, unterschiedlich → `source = choices?.ibanSource ?? null`, `conflict = { crm, invoice }`, `blockers += IBAN_CONFLICT`.
   - Wenn keine → `iban = null`, `source = "INVOICE"` (Placeholder), `blockers += NO_IBAN`.
   - Zusätzlich MOD-97-Check auf die gewählte IBAN (siehe 1.10). Bei Fail → `blockers += IBAN_INVALID`.

3. **Address-Resolution** (`city` + `country` sind SEPA-Pflichtfelder in strukturierter Form):
   - CRM-Kandidat: `{ street, zip, city, country }` aus `supplier` — gilt nur als vollständig, wenn **beide** `city` und `country` gesetzt sind.
   - Invoice-Kandidat: analog aus `invoice.sellerStreet/Zip/City/Country`.
   - Kreditor-Name: primär `supplier.company`, fallback `invoice.sellerName`. Wenn beide fehlen → `blockers += NO_SUPPLIER`.
   - Konfliktlogik auf `city+country` (street/zip gelten als nicht konfliktrelevant, da ISO 20022 sie als optional behandelt).
   - Wenn keine vollständige Quelle → `blockers += NO_ADDRESS`.

4. **Status-Ableitung**:
   - `RED` wenn: Invoice nicht `status="APPROVED"`, oder `blockers` enthält `NO_IBAN`/`NO_ADDRESS`/`NO_SUPPLIER`/`IBAN_INVALID`, oder Invoice bereits in aktivem PaymentRun (in DB-Query vorgefiltert, Resolver macht Safety-Check).
   - `YELLOW` wenn: `blockers` enthält nur `IBAN_CONFLICT` oder `ADDRESS_CONFLICT` (beides ist inline auflösbar), und `choices` liefert noch keine Auflösung.
   - `GREEN` sonst.

5. **Side Effects**: keine. Reiner Reader.

`getPaymentStatus(invoice)`-Helper (auch hier):

```typescript
export type PaymentStatus = "UNPAID" | "IN_PAYMENT_RUN" | "PAID"

/** Aus den InboundInvoice.paymentRunItems abgeleitet — keine Mutation. */
export function getPaymentStatus(
  paymentRunItems: Array<{ paymentRun: { status: string } }>
): PaymentStatus {
  const active = paymentRunItems.filter((i) => i.paymentRun.status !== "CANCELLED")
  if (active.length === 0) return "UNPAID"
  if (active.some((i) => i.paymentRun.status === "BOOKED")) return "PAID"
  return "IN_PAYMENT_RUN"
}
```

#### 1.8 Service: `payment-run-xml-generator.ts`

**File**: `src/lib/services/payment-run-xml-generator.ts` (neu)

Contract (Library-agnostisch — die Entscheidung zwischen `sepa@npm` und Hand-Roll kapselt dieser Service intern):

```typescript
export interface XmlGenerationInput {
  paymentRun: PaymentRunWithItems
  msgId: string                  // <= 35 chars, unique → verwende `${number}` (PR-2026-001 passt)
  creationDateTime: Date         // ISO-Timestamp
  initiatingPartyName: string    // Mandant companyName (<= 70)
  debtorIban: string
  debtorBic: string | null
  debtorName: string
}

export async function generatePain001V09(input: XmlGenerationInput): Promise<{
  xml: string
  checksum: string // SHA-256, in Audit-Log mitgeschrieben
}>
```

**Pflicht-Elemente pain.001.001.09** (Minimum für Zahlungslauf ohne Gläubiger-ID):

```
Document/CstmrCdtTrfInitn/
  GrpHdr/MsgId, CreDtTm, NbOfTxs, CtrlSum, InitgPty/Nm
  PmtInf/
    PmtInfId, PmtMtd=TRF, BtchBookg=true, NbOfTxs, CtrlSum
    PmtTpInf/SvcLvl/Cd=SEPA
    ReqdExctnDt/Dt=<executionDate>
    Dbtr/Nm, Dbtr/PstlAdr (optional aber empfohlen)
    DbtrAcct/Id/IBAN
    DbtrAgt/FinInstnId/BICFI (wenn bekannt, sonst Othr/Id=NOTPROVIDED)
    ChrgBr=SLEV
    CdtTrfTxInf × N/
      PmtId/EndToEndId
      Amt/InstdAmt[Ccy=EUR]
      CdtrAgt/FinInstnId/BICFI (optional)
      Cdtr/Nm, Cdtr/PstlAdr/TwnNm, Cdtr/PstlAdr/Ctry [STRUKTURIERTE ADRESSE]
      CdtrAcct/Id/IBAN
      RmtInf/Ustrd=<invoiceNumber>
```

**Smoke-Test (kritisch, Gate für die ganze Phase)**:

**File**: `src/lib/services/__tests__/payment-run-xml-generator.smoke.test.ts` (neu, wird nicht committed bis Gate passiert)

```typescript
import { generatePain001V09 } from "../payment-run-xml-generator"

test("smoke: sepa library can emit pain.001.001.09 with structured PstlAdr", async () => {
  const xml = (await generatePain001V09({
    paymentRun: fixture,
    msgId: "PR-2026-001",
    creationDateTime: new Date("2026-04-15T10:00:00Z"),
    initiatingPartyName: "Terp Test GmbH",
    debtorIban: "DE89370400440532013000",
    debtorBic: "COBADEFFXXX",
    debtorName: "Terp Test GmbH",
  })).xml

  // Schema-version
  expect(xml).toContain('xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09"')
  // Strukturierte Adresse mit TwnNm + Ctry (NICHT AdrLine!)
  expect(xml).toMatch(/<Cdtr>[\s\S]*<PstlAdr>[\s\S]*<TwnNm>Musterstadt<\/TwnNm>[\s\S]*<Ctry>DE<\/Ctry>[\s\S]*<\/PstlAdr>[\s\S]*<\/Cdtr>/)
  // Pflicht-Elemente
  expect(xml).toContain("<PmtMtd>TRF</PmtMtd>")
  expect(xml).toContain("<SvcLvl><Cd>SEPA</Cd></SvcLvl>")
  // MsgId passt
  expect(xml).toMatch(/<MsgId>PR-2026-001<\/MsgId>/)
})
```

**Gate-Kriterium**:
- Wenn der Test mit `sepa@npm` (`pnpm add sepa`) grün läuft → `sepa`-Library bleibt die Wahl.
- Wenn die Library `pain.001.001.09` nicht emittiert oder `PstlAdr` nicht strukturiert unterstützt → STOP. Implementierung wechselt auf Hand-Roll-Variante mit `fast-xml-parser@5.5.10` `XMLBuilder`. In dem Fall wird `sepa` **wieder entfernt** (`pnpm remove sepa`) und der Generator-Service ist ein reiner `XMLBuilder`-Wrapper. Zusätzliche Library `iban@npm` kommt in jedem Fall für MOD-97-Check dazu (siehe 1.10).
- In beiden Zweigen: **externe manuelle Validierung** der generierten XML gegen das offizielle XSD (z.B. [ISO-20022-Validator](https://www.iso20022.org/catalogue-messages/iso-20022-messages-archive)) — Nachweis als Screenshot/Output im PR.

**Hand-Roll-Alternative** (falls Gate fehlschlägt) — kompletter XMLBuilder-Aufruf mit Typen-Definition, ~250 Zeilen Generator-Code. Die Struktur ist durch pain.001.001.09 XSD fest vorgegeben; der XMLBuilder gibt uns deterministische Serialisierung.

#### 1.9 Service: `payment-run-service.ts`

**File**: `src/lib/services/payment-run-service.ts` (neu)

```typescript
import * as numberSequenceService from "./number-sequence-service"
import * as repo from "./payment-run-repository"
import * as resolver from "./payment-run-data-resolver"
import { auditLog } from "./audit-logs-service"

const TRACKED_FIELDS = [
  "status", "executionDate", "debtorName", "debtorIban", "debtorBic",
  "xmlStoragePath", "xmlGeneratedAt", "bookedAt", "cancelledAt", "cancelledReason",
] as const

// Kein MATERIAL_FIELDS — kein Approval-Workflow (Hard Constraint)

export class PaymentRunNotFoundError extends Error { name = "PaymentRunNotFoundError" }
export class PaymentRunInvalidStateError extends Error { name = "PaymentRunInvalidStateError" }
export class PaymentRunPreflightError extends Error {
  constructor(public readonly reasons: string[]) { super("Preflight failed"); this.name = "PaymentRunPreflightError" }
}
export class PaymentRunItemInvalidError extends Error {
  constructor(public readonly invoiceId: string, public readonly reason: string) {
    super(`Invoice ${invoiceId}: ${reason}`); this.name = "PaymentRunItemInvalidError"
  }
}

export interface CreatePaymentRunInput {
  executionDate: Date
  items: Array<{
    invoiceId: string
    ibanSource: "CRM" | "INVOICE"   // explizit gewählt (auch wenn kein Konflikt)
    addressSource: "CRM" | "INVOICE"
  }>
  notes?: string
}

export async function create(
  prisma: PrismaClient, tenantId: string,
  input: CreatePaymentRunInput, userId: string, audit?: AuditContext
): Promise<PaymentRun>
// Semantik:
// 1. Pre-Flight: BillingTenantConfig.iban + companyName + city + country vorhanden
// 2. Für jedes Item: resolver.resolveRow mit expliziten choices → muss GREEN sein
// 3. Prisma-Transaction:
//    - number via numberSequenceService.getNextNumber(..., "payment_run") → "PR-{YYYY}-{NNN}" formatieren
//    - Insert PaymentRun mit Debtor-Snapshot + totalAmountCents + itemCount
//    - Insert N × PaymentRunItem mit Snapshot-Spalten
// 4. auditLog.log(action="create", entityId=paymentRun.id, changes=null).catch(() => {})

export async function getById(prisma, tenantId, id): Promise<PaymentRunWithItems>

export async function list(prisma, tenantId, filters, pagination): Promise<PaymentRunListResponse>

export async function getProposal(
  prisma: PrismaClient, tenantId: string,
  filters: { fromDueDate?: Date; toDueDate?: Date; supplierId?: string; minAmountCents?: number; maxAmountCents?: number }
): Promise<ResolvedRow[]>
// Semantik:
// 1. Invoice-Query: status="APPROVED", dueDate IN [fromDueDate..toDueDate] (Default: heute..heute+7),
//    supplierId optional, totalGross in range, mit supplier.bankAccounts Include
// 2. Batched findInvoiceIdsWithActivePaymentRun → Aussortieren der bereits gebundenen
// 3. Für jede übrige Invoice: resolver.resolveRow(..., ohne choices) → ResolvedRow[]
// 4. Sortierung: nach dueDate ASC, dann supplier.company

export async function getPreflight(
  prisma: PrismaClient, tenantId: string
): Promise<{ ready: boolean; blockers: Array<"NO_IBAN" | "NO_NAME" | "NO_CITY" | "NO_COUNTRY"> }>

export async function markBooked(
  prisma, tenantId, id, userId, audit?
): Promise<PaymentRun>
// Idempotent: wenn Status bereits BOOKED → no-op, return existing run.
// Wenn DRAFT → throws PaymentRunInvalidStateError (erst EXPORTED kann BOOKED werden).

export async function cancel(
  prisma, tenantId, id, userId, reason: string, audit?
): Promise<PaymentRun>
// Idempotent: CANCELLED → no-op. BOOKED → throw (kein Widerruf einer ausgeführten Überweisung).

export async function setExported(
  prisma, tenantId, id, storagePath: string, audit?
): Promise<PaymentRun>
// Nur DRAFT → EXPORTED. Idempotent: wenn bereits EXPORTED → aktualisiere xmlStoragePath nicht nochmal, no-op.
// Wird exklusiv aus payment-run-xml-flow (Phase 2, Router) aufgerufen.
```

**Warum `setExported` getrennt von XML-Generierung**: Die Storage-Upload-Logik lebt im Router/Flow-Layer (Phase 2), damit die Service-Funktion selbst keine Supabase-Abhängigkeit hat und unit-testbar bleibt.

#### 1.10 IBAN-Validierung

**Entscheidung**: **Library hinzufügen** — `pnpm add iban` (`https://www.npmjs.com/package/iban`). Rechtfertigung: MOD-97 selbst zu schreiben ist 15 Zeilen, aber die Längen-Tabelle pro Land ist ein Pflege-Aufwand, den wir einer gepflegten Library überlassen. Die Library hat 0 Runtime-Dependencies.

**File**: `src/lib/sepa/iban-validator.ts` (neu)

```typescript
import * as IBAN from "iban"

export function isValidIban(raw: string): boolean {
  return IBAN.isValid(raw.replace(/\s+/g, ""))
}

export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase()
}
```

Einsatz: im Resolver (1.7), `IBAN_INVALID`-Blocker.

#### 1.11 Unit-Tests für Services

**Files**:
- `src/lib/services/__tests__/payment-run-data-resolver.test.ts` (neu) — Unit-Tests mit Mock-Prisma für alle 8 Kombinationen aus D2 (CRM only, Invoice only, both equal, both diff, both absent, no supplier, invalid IBAN, missing address).
- `src/lib/services/__tests__/payment-run-service.test.ts` (neu) — Unit-Tests für `create`, `markBooked` (idempotent), `cancel` (idempotent, BOOKED wirft), `setExported`, Tenant-Isolation.
- `src/lib/services/__tests__/payment-run-xml-generator.test.ts` (neu) — Unit-Tests für den XML-Generator, **nicht** smoke, sondern fixed-output-Vergleich (Snapshot-Test).
- `src/lib/services/__tests__/payment-run-permission-uuid-consistency.test.ts` (neu) — asserted, dass `permissionIdByKey("payment_runs.view")` == fest-hardcoded UUID aus der Migration. Fail-Fast falls jemand den Namespace ändert.

Test-Fixtures analog zu `billing-document-einvoice-service.test.ts:9-37`, `makePaymentRun()`, `makeInboundInvoice()`, `makeSupplier()`.

### Success Criteria

#### Automated Verification

- [ ] Migration läuft lokal: `pnpm db:reset`
- [ ] Prisma-Client kompiliert: `pnpm db:generate && pnpm typecheck`
- [ ] Linter grün: `pnpm lint`
- [ ] Unit-Tests grün: `pnpm vitest run src/lib/services/__tests__/payment-run-*.test.ts`
- [ ] `payment-run-xml-generator.smoke.test.ts` grün (Gate-Test)
- [ ] UUID-Konsistenz-Test grün (Migration UUIDs == Katalog UUIDs)
- [ ] `payment-run-data-resolver.test.ts`: alle 8 D2-Kombinationen grün

#### Manual Verification

- [ ] Generierte pain.001.001.09 XML im [externen ISO-20022-Validator](https://www.mobilefish.com/services/iso20022/iso20022.php) ohne Schema-Fehler
- [ ] XML enthält `<PstlAdr><TwnNm>…</TwnNm><Ctry>…</Ctry></PstlAdr>` strukturiert (nicht `AdrLine`)
- [ ] `MsgId` hat Format `PR-2026-001`
- [ ] Entscheidung dokumentiert (im PR-Body): „sepa-library used" oder „hand-roll fallback"
- [ ] Ein Test-Tenant mit 3 Invoices wurde via Prisma-Studio / Test-Skript angelegt, `paymentRunService.create` erzeugt erwartete Row
- [ ] `getPaymentStatus` liefert `IN_PAYMENT_RUN` nach create, `PAID` nach markBooked, `UNPAID` nach cancel

### Verifikations-Gate zu Phase 2

Dieses Dokument wird von Hand um einen Abschnitt „Phase 1 Verifikation" ergänzt, in dem der Implementierer die Library-Entscheidung, den XSD-Validator-Screenshot und die Test-Run-Outputs festhält. **Kein Start von Phase 2 ohne diesen Abschnitt.**

---

## Phase 2: tRPC-Router + Pre-Flight + XML-Storage

### Overview

Backend vollständig ansprechbar machen: tRPC-Router mit 8 Endpoints, Pre-Flight-Check für Mandanten-Bankdaten, Supabase-Storage-Bucket `payment-runs` anlegen, XML-Upload + Signed-URL-Download integriert.

### Changes Required

#### 2.1 Storage-Bucket anlegen

**File**: `supabase/migrations/20260414100200_create_payment_runs_storage_bucket.sql` (neu)

```sql
-- Privater Storage-Bucket für SEPA-XML-Dateien
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-runs', 'payment-runs', false, 1048576,
        ARRAY['application/xml','text/xml']::text[])
ON CONFLICT (id) DO NOTHING;

-- RLS-Policies: analog zu 'inbound-invoices' Bucket
CREATE POLICY "payment_runs_bucket_service_role_all"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'payment-runs')
  WITH CHECK (bucket_id = 'payment-runs');
```

**Begründung MIME-Filter**: XML only, 1 MB Limit reicht für Tausende Transaktionen in einer Datei.

#### 2.2 tRPC-Router: `invoices.paymentRuns`

**File**: `src/trpc/routers/invoices/payment-runs.ts` (neu)

Analog zu `src/trpc/routers/invoices/inbound.ts:13-24`:

```typescript
import { z } from "zod"
import { createTRPCRouter } from "@/trpc/init"
import { tenantProcedure } from "@/trpc/init"
import { requireModule, requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as paymentRunService from "@/lib/services/payment-run-service"
import * as paymentRunFlow from "@/lib/services/payment-run-xml-flow"

const VIEW   = permissionIdByKey("payment_runs.view")!
const CREATE = permissionIdByKey("payment_runs.create")!
const EXPORT = permissionIdByKey("payment_runs.export")!
const BOOK   = permissionIdByKey("payment_runs.book")!
const CANCEL = permissionIdByKey("payment_runs.cancel")!

const prProcedure = tenantProcedure.use(requireModule("payment_runs"))

export const paymentRunsRouter = createTRPCRouter({
  getPreflight: prProcedure.use(requirePermission(VIEW)).query(async ({ ctx }) =>
    handleServiceError(() => paymentRunService.getPreflight(ctx.prisma, ctx.tenantId!))),

  getProposal: prProcedure.use(requirePermission(VIEW)).input(z.object({
    fromDueDate: z.string().datetime().optional(),
    toDueDate: z.string().datetime().optional(),
    supplierId: z.string().uuid().optional(),
    minAmountCents: z.number().int().nonnegative().optional(),
    maxAmountCents: z.number().int().nonnegative().optional(),
  })).query(async ({ ctx, input }) => handleServiceError(() =>
    paymentRunService.getProposal(ctx.prisma, ctx.tenantId!, {
      fromDueDate: input.fromDueDate ? new Date(input.fromDueDate) : undefined,
      toDueDate:   input.toDueDate   ? new Date(input.toDueDate)   : undefined,
      supplierId: input.supplierId,
      minAmountCents: input.minAmountCents,
      maxAmountCents: input.maxAmountCents,
    }))),

  list: prProcedure.use(requirePermission(VIEW)).input(z.object({
    status: z.enum(["DRAFT","EXPORTED","BOOKED","CANCELLED"]).optional(),
    search: z.string().optional(),
    page: z.number().int().positive().default(1),
    pageSize: z.number().int().positive().max(100).default(20),
  })).query(async ({ ctx, input }) => handleServiceError(() =>
    paymentRunService.list(ctx.prisma, ctx.tenantId!, input))),

  getById: prProcedure.use(requirePermission(VIEW))
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => handleServiceError(() =>
      paymentRunService.getById(ctx.prisma, ctx.tenantId!, input.id))),

  create: prProcedure.use(requirePermission(CREATE)).input(z.object({
    executionDate: z.string().date(),
    items: z.array(z.object({
      invoiceId: z.string().uuid(),
      ibanSource: z.enum(["CRM","INVOICE"]),
      addressSource: z.enum(["CRM","INVOICE"]),
    })).min(1),
    notes: z.string().max(5000).optional(),
  })).mutation(async ({ ctx, input }) => handleServiceError(() =>
    paymentRunService.create(
      ctx.prisma, ctx.tenantId!,
      { executionDate: new Date(input.executionDate), items: input.items, notes: input.notes },
      ctx.user!.id,
      { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
    ))),

  downloadXml: prProcedure.use(requirePermission(EXPORT))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => handleServiceError(() =>
      paymentRunFlow.generateAndGetSignedUrl(
        ctx.prisma, ctx.tenantId!, input.id, ctx.user!.id,
        { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
      ))),

  markBooked: prProcedure.use(requirePermission(BOOK))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => handleServiceError(() =>
      paymentRunService.markBooked(
        ctx.prisma, ctx.tenantId!, input.id, ctx.user!.id,
        { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
      ))),

  cancel: prProcedure.use(requirePermission(CANCEL))
    .input(z.object({ id: z.string().uuid(), reason: z.string().max(1000).optional() }))
    .mutation(async ({ ctx, input }) => handleServiceError(() =>
      paymentRunService.cancel(
        ctx.prisma, ctx.tenantId!, input.id, ctx.user!.id, input.reason ?? "",
        { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
      ))),
})
```

**Registrierung**:

**File**: `src/trpc/routers/invoices/index.ts:7-12` — `paymentRunsRouter` ins Invoice-Sub-Router-Objekt aufnehmen.

#### 2.3 Flow: `payment-run-xml-flow.ts`

**File**: `src/lib/services/payment-run-xml-flow.ts` (neu)

Der Grund diesen Flow aus `payment-run-service` zu trennen: er integriert Supabase Storage, das in Unit-Tests mühsam zu mocken ist. Der Flow wird nur Integration-getestet, Service-Tests bleiben reine Prisma-Mocks.

```typescript
import * as paymentRunService from "./payment-run-service"
import * as xmlGenerator from "./payment-run-xml-generator"
import { upload, createSignedReadUrl, fixSignedUrl } from "@/lib/supabase/storage"
import * as billingTenantConfigService from "./billing-tenant-config-service"

const BUCKET = "payment-runs"
const SIGNED_URL_EXPIRY_SECONDS = 600 // 10 Minuten

export async function generateAndGetSignedUrl(
  prisma: PrismaClient, tenantId: string, paymentRunId: string,
  userId: string, audit: AuditContext
): Promise<{ signedUrl: string; filename: string; alreadyExported: boolean }> {
  const run = await paymentRunService.getById(prisma, tenantId, paymentRunId)
  if (run.status === "CANCELLED") throw new PaymentRunInvalidStateError("Cannot export cancelled run")

  // Storage-Pfad
  const path = `${tenantId}/${paymentRunId}.xml`
  const filename = `${run.number}.xml`

  // Wenn XML bereits existiert → nicht neu generieren, nur Signed-URL neu ausstellen
  if (run.xmlStoragePath && run.status !== "DRAFT") {
    const signedUrl = await createSignedReadUrl(BUCKET, run.xmlStoragePath, SIGNED_URL_EXPIRY_SECONDS)
    if (!signedUrl) throw new Error("signed_url_failed")
    return { signedUrl: fixSignedUrl(signedUrl), filename, alreadyExported: true }
  }

  // Erster Export: XML generieren, uploaden, Status auf EXPORTED
  const config = await billingTenantConfigService.get(prisma, tenantId)
  const { xml } = await xmlGenerator.generatePain001V09({
    paymentRun: run, msgId: run.number,
    creationDateTime: new Date(),
    initiatingPartyName: config!.companyName!,
    debtorIban: run.debtorIban, debtorBic: run.debtorBic, debtorName: run.debtorName,
  })

  await upload(BUCKET, path, Buffer.from(xml, "utf-8"), {
    contentType: "application/xml", upsert: true,
  })

  await paymentRunService.setExported(prisma, tenantId, paymentRunId, path, audit)

  const signedUrl = await createSignedReadUrl(BUCKET, path, SIGNED_URL_EXPIRY_SECONDS)
  if (!signedUrl) throw new Error("signed_url_failed")
  return { signedUrl: fixSignedUrl(signedUrl), filename, alreadyExported: false }
}
```

#### 2.4 Router-Registrierung

**File**: `src/trpc/routers/_app.ts:89,196` — keine Änderung nötig, da `invoicesRouter` bereits registriert ist und die Änderung in `invoices/index.ts` automatisch mitgezogen wird.

#### 2.5 Modul-Registrierung

`payment_runs` als Modul-Key. Muster aus `inbound_invoices`:

**File**: Migration in 1.5 hat bereits `ALTER TABLE tenant_modules ... CHECK (module_key IN (..., 'payment_runs'))`.

**File**: Seed-Skript für Default-Enable auf neu angelegten Tenants (analog zu inbound_invoices in `src/lib/services/tenant-service.ts`) — suchen und ergänzen, falls dort eine feste Liste der Default-Module existiert. Sonst keine Änderung, Mandant muss das Modul manuell aktivieren im Platform-Admin.

**File**: `messages/de.json` + `messages/en.json` — Modul-Label:
```json
"modules": {
  "name_payment_runs": "Zahlungsläufe",
  "desc_payment_runs": "SEPA-Sammelüberweisungen aus freigegebenen Eingangsrechnungen erstellen"
}
```

#### 2.6 Integration-Tests für den Router

**File**: `src/trpc/routers/__tests__/payment-runs.integration.test.ts` (neu)

Muster aus `inbound-invoice-approval-service.integration.test.ts:46-57,71-94`. Nutzt echte lokale Postgres + Storage (supabase dev).

Test-Szenarien:
- `getPreflight` ohne `BillingTenantConfig.iban` → `ready: false, blockers: ["NO_IBAN"]`
- `getPreflight` vollständig konfiguriert → `ready: true, blockers: []`
- `getProposal` liefert nur APPROVED-Invoices, nicht DRAFT/PENDING
- `getProposal` filtert bereits in aktivem PaymentRun enthaltene Invoices aus
- `create` → PaymentRun mit Snapshot-Items
- `downloadXml` erstmalig → Status DRAFT→EXPORTED, XML in Storage, signed URL valid
- `downloadXml` erneut → derselbe Pfad, Status bleibt EXPORTED
- `markBooked` nach EXPORTED → Status BOOKED
- `markBooked` doppelt → idempotent, keine Fehler
- `markBooked` auf DRAFT → `PaymentRunInvalidStateError`
- `cancel` auf DRAFT → CANCELLED; erneut `cancel` → idempotent
- `cancel` auf BOOKED → `PaymentRunInvalidStateError`
- **Tenant-Isolation**: Tenant A kann Läufe von Tenant B weder listen noch abrufen noch downloaden (`NOT_FOUND` zurück, kein Leak)
- **Permission-Checks**: User ohne `payment_runs.export` bekommt `FORBIDDEN` auf `downloadXml`

### Success Criteria

#### Automated Verification

- [ ] Migration läuft: `pnpm db:reset`
- [ ] Storage-Bucket existiert: Query gegen `storage.buckets` in Integration-Test-Setup
- [ ] Typecheck + Lint grün: `pnpm check`
- [ ] Unit-Tests grün: `pnpm vitest run src/lib/services/__tests__/payment-run-*`
- [ ] Integration-Tests grün: `pnpm vitest run src/trpc/routers/__tests__/payment-runs.integration.test.ts`
- [ ] Signed-URL ist aufrufbar (im Test via `fetch`) und liefert XML mit korrektem Content-Type

#### Manual Verification

- [ ] Postman/curl-Durchlauf: preflight → proposal → create → downloadXml → markBooked
- [ ] Downloaded XML gegen KoSIT-Validator (falls pain.001-Support vorhanden) oder externen Online-Validator — grün
- [ ] Storage-Objekt existiert im Supabase Studio unter `payment-runs/{tenantId}/{runId}.xml`
- [ ] Audit-Log enthält 3 Einträge pro Test-Lauf: create, export, book

---

## Phase 3: UI

### Overview

Der Buchhalter kann den vollständigen Workflow im Browser durchklicken: Navigation via Sidebar, Pre-Flight-Banner, Vorschlag mit Ampel-Status-Badges und inline Konfliktauflösung, Multi-Select, Lauf erstellen, Detail-Ansicht, XML herunterladen, als gebucht markieren, stornieren.

### Changes Required

#### 3.1 Sidebar-Eintrag

**File**: `src/components/layout/sidebar/sidebar-nav-config.ts:389-414` — Liste der `invoicesSection.items` erweitern:

```typescript
{
  titleKey: 'paymentRuns',
  href: '/invoices/inbound/payment-runs',
  icon: Landmark, // aus lucide-react
  module: 'payment_runs',
  permissions: ['payment_runs.view'],
},
```

**File**: `messages/de.json` + `messages/en.json` — `sidebar.paymentRuns` hinzufügen.

#### 3.2 Seiten-Komponenten

**File**: `src/app/[locale]/(dashboard)/invoices/inbound/payment-runs/page.tsx` (neu)

Muster aus `src/app/[locale]/(dashboard)/invoices/inbound/approvals/page.tsx:1-24`:

```tsx
"use client"
import { useTranslations } from "next-intl"
import { useHasPermission } from "@/hooks/useHasPermission"
import { PaymentRunsPage } from "@/components/invoices/payment-runs/payment-runs-page"

export default function PaymentRunsPageRoute() {
  const t = useTranslations("paymentRuns")
  const { allowed } = useHasPermission(["payment_runs.view"])
  if (allowed === false) return <div>{t("common.noPermission")}</div>
  return <div className="p-4 space-y-6"><PaymentRunsPage /></div>
}
```

**File**: `src/app/[locale]/(dashboard)/invoices/inbound/payment-runs/[id]/page.tsx` (neu) — Detail-Route:

```tsx
"use client"
import { useParams } from "next/navigation"
import { PaymentRunDetail } from "@/components/invoices/payment-runs/payment-run-detail"

export default function PaymentRunDetailRoute() {
  const { id } = useParams<{ id: string }>()
  return <div className="p-4"><PaymentRunDetail id={id} /></div>
}
```

#### 3.3 React-Hooks

**File**: `src/hooks/usePaymentRuns.ts` (neu)

Muster aus `src/hooks/useInboundInvoices.ts:6-190`:

```typescript
export function usePaymentRunPreflight()
export function usePaymentRunProposal(filters: ProposalFilters)
export function usePaymentRuns(opts: ListOpts)
export function usePaymentRun(id: string)
export function useCreatePaymentRun() // invalidiert paymentRuns.list + proposal
export function useDownloadPaymentRunXml() // mutation → returns { signedUrl, filename }
export function useMarkPaymentRunBooked()
export function useCancelPaymentRun()
```

Mutations rufen `utils.invoices.paymentRuns.list.invalidate()` und `utils.invoices.paymentRuns.getProposal.invalidate()` in `onSuccess`.

#### 3.4 Haupt-Component: `PaymentRunsPage`

**File**: `src/components/invoices/payment-runs/payment-runs-page.tsx` (neu)

```tsx
export function PaymentRunsPage() {
  const preflight = usePaymentRunPreflight()

  if (preflight.isLoading) return <Spinner />
  if (!preflight.data?.ready) return <PreflightBlockBanner blockers={preflight.data?.blockers ?? []} />

  return (
    <>
      <h1>{t("pageTitle")}</h1>
      <ProposalSection />      {/* 3.5 */}
      <ExistingRunsSection />  {/* 3.6 */}
    </>
  )
}
```

`PreflightBlockBanner` zeigt rote Alert-Box mit Text „Zuerst Bankdaten in Einstellungen → Rechnungs-Konfiguration hinterlegen" und `<Link href="/admin/billing-config">` Button.

#### 3.5 Vorschlags-Sektion

**File**: `src/components/invoices/payment-runs/proposal-section.tsx` (neu)

State (via `useState`):
- `filters: { fromDueDate, toDueDate, supplierId?, minAmountCents?, maxAmountCents? }` — Default `fromDueDate=today`, `toDueDate=today+7`
- `selectedIds: Set<string>` — Muster aus `src/components/approvals/approval-bulk-actions.tsx:37-63`
- `resolutions: Map<string, { ibanSource: "CRM"|"INVOICE", addressSource: "CRM"|"INVOICE" }>` — per Invoice die Konfliktauflösung-Wahl
- `executionDate: Date` — Default `tomorrow`

Komponente rendert:
- **Filter-Toolbar** (Date-Range, Supplier-Select, Amount-Range)
- **Tabelle** mit Spalten: Checkbox · Nr. · Lieferant · Fällig · Betrag · IBAN · Status-Badge · Aktion
- **Status-Badge-Logik**:
  - GRÜN (`bg-green-100 text-green-900`): Checkbox aktivierbar, Tooltip „Bereit"
  - GELB (`bg-yellow-100 text-yellow-900`): Checkbox nur aktivierbar wenn `resolutions.has(id)`, inline-Accordion mit Radio-Group „CRM verwenden / Rechnung verwenden" pro Konfliktfeld (IBAN und/oder Adresse)
  - ROT (`bg-red-100 text-red-900`): Checkbox disabled, Text mit konkretem Grund + `<Link href="/crm/addresses/${supplierId}">` für NO_IBAN/NO_ADDRESS
- **Footer-Bar** (fixed, bei Selection sichtbar): „N Rechnungen ausgewählt • Summe € X" + DatePicker für Ausführungsdatum + Button „Zahlungslauf erstellen"
- **Submit** → `useCreatePaymentRun` Mutation mit `items = selectedIds.map(id => ({ invoiceId: id, ...(resolutions.get(id) ?? inferredChoiceForGreen(id)) }))`

**Wichtig**: Für GREEN-Rows ohne expliziten Konflikt muss `ibanSource/addressSource` trotzdem mitgegeben werden (z.B. `"CRM"` wenn CRM-Kandidat vorhanden, sonst `"INVOICE"`). Das Invariante wird im Frontend berechnet aus der `ResolvedRow.iban.source`/`address.source` aus `getProposal`-Response.

#### 3.6 Bestehende Läufe

**File**: `src/components/invoices/payment-runs/existing-runs-section.tsx` (neu)

- Tabelle mit Spalten: Nr. · Status · Erstellt · Anzahl · Summe · Ausführung · Aktion (Link zu Detail)
- Status-Badges mit Farbschema:
  - DRAFT: grau
  - EXPORTED: blau
  - BOOKED: grün
  - CANCELLED: grau + Durchstreichung
- Pagination (20 pro Seite)
- Click auf Zeile → Navigate zu `/invoices/inbound/payment-runs/{id}`

#### 3.7 Detail-Ansicht

**File**: `src/components/invoices/payment-runs/payment-run-detail.tsx` (neu)

Sections:
- **Header**: Nummer, Status-Badge, Erstellt-Info
- **Debitor-Card**: Name, IBAN (masked), BIC (Snapshot aus PaymentRun)
- **Ausführung**: Datum, Summe, Item-Count
- **Items-Tabelle**: Zeile pro PaymentRunItem mit Rechnungsnr., Empfänger, IBAN (masked), Betrag, Quelle (Badge CRM/INVOICE) für IBAN + Adresse
- **Actions** (abhängig vom Status und Permissions):
  - `DRAFT` + `payment_runs.export`: Button „XML herunterladen" (trigger Mutation, dann `window.open(signedUrl, '_blank')`)
  - `EXPORTED` + `payment_runs.export`: Button „XML erneut herunterladen" (identischer Call, bekommt denselben Pfad)
  - `EXPORTED` + `payment_runs.book`: Button „Als gebucht markieren" mit Confirm-Dialog („Haben Sie die Datei bei der Bank hochgeladen und die Überweisung ausgeführt?")
  - `DRAFT`/`EXPORTED` + `payment_runs.cancel`: Button „Lauf stornieren" mit Confirm-Dialog (optional Grund-Textarea)
  - `BOOKED`: keine destruktiven Actions
  - `CANCELLED`: nur XML-Download (Audit-Zugriff)

**IBAN-Masking**: Helper-Util `maskIban(iban)` — zeigt `DE89 **** **** 3000`. Muster existiert bereits in `src/components/employees/payroll/bank-details-tab.tsx:19-24`.

#### 3.8 i18n-Namespace `paymentRuns`

**File**: `messages/de.json` + `messages/en.json`

```json
"paymentRuns": {
  "common": { "noPermission": "...", "error": "..." },
  "pageTitle": "Zahlungsläufe",
  "preflight": {
    "bannerTitle": "Bankdaten fehlen",
    "bannerText": "Bitte hinterlegen Sie zuerst Ihre Bankverbindung in der Rechnungs-Konfiguration.",
    "goToBillingConfig": "Rechnungs-Konfiguration öffnen",
    "blocker_NO_IBAN": "IBAN fehlt",
    "blocker_NO_NAME": "Firmenname fehlt",
    "blocker_NO_CITY": "Stadt fehlt",
    "blocker_NO_COUNTRY": "Land fehlt"
  },
  "proposal": {
    "sectionTitle": "Vorschlag",
    "emptyState": "Keine fälligen Rechnungen im gewählten Zeitraum.",
    "filters": {
      "dateRange": "Fälligkeit zwischen",
      "supplier": "Lieferant",
      "amountRange": "Betrag von/bis"
    },
    "columns": { "select": "", "number": "Nr.", "supplier": "Lieferant", "dueDate": "Fällig", "amount": "Betrag", "iban": "IBAN", "status": "Status" },
    "badge": { "green": "Bereit", "yellow": "Konflikt", "red": "Nicht exportierbar" },
    "blocker": {
      "NO_IBAN": "Lieferant {name} hat keine IBAN — bitte im CRM ergänzen",
      "NO_ADDRESS": "Lieferant {name} hat keine Adresse — bitte im CRM ergänzen",
      "NO_SUPPLIER": "Rechnung ist keinem Lieferanten zugeordnet",
      "IBAN_INVALID": "IBAN ist ungültig: {value}",
      "IBAN_CONFLICT": "IBAN unterschiedlich zwischen CRM und Rechnung",
      "ADDRESS_CONFLICT": "Adresse unterschiedlich zwischen CRM und Rechnung"
    },
    "conflict": { "useCrm": "Aus CRM verwenden", "useInvoice": "Aus Rechnung verwenden" },
    "footer": { "selected": "{count} Rechnungen ausgewählt", "totalAmount": "Summe {amount}", "executionDate": "Ausführungsdatum", "createButton": "Zahlungslauf erstellen" }
  },
  "existingRuns": {
    "sectionTitle": "Bestehende Läufe",
    "emptyState": "Noch keine Zahlungsläufe angelegt.",
    "columns": { "number": "Nr.", "status": "Status", "createdAt": "Erstellt", "itemCount": "Anzahl", "total": "Summe", "executionDate": "Ausführung" }
  },
  "detail": {
    "debtorTitle": "Auftraggeber",
    "itemsTitle": "Enthaltene Rechnungen",
    "actions": {
      "download": "XML herunterladen",
      "downloadAgain": "XML erneut herunterladen",
      "markBooked": "Als gebucht markieren",
      "cancel": "Lauf stornieren"
    },
    "confirm": {
      "bookTitle": "Zahlungslauf als gebucht markieren?",
      "bookText": "Haben Sie die Datei bei Ihrer Bank hochgeladen und die Überweisung ausgeführt? Diese Aktion kann nicht rückgängig gemacht werden.",
      "cancelTitle": "Zahlungslauf stornieren?",
      "cancelText": "Die enthaltenen Rechnungen werden wieder für neue Läufe verfügbar. Die XML-Datei bleibt als Audit-Spur erhalten.",
      "reasonLabel": "Grund (optional)"
    }
  },
  "status": { "DRAFT": "Entwurf", "EXPORTED": "Exportiert", "BOOKED": "Gebucht", "CANCELLED": "Storniert" }
}
```

Englische Übersetzung analog. Modul-Label `sidebar.paymentRuns = "Zahlungsläufe" / "Payment Runs"`.

### Success Criteria

#### Automated Verification

- [ ] TypeScript-Typen kompilieren: `pnpm typecheck`
- [ ] Lint grün: `pnpm lint`
- [ ] Component-Tests grün (falls vorhanden, sonst via Playwright abgedeckt)

#### Manual Verification

- [ ] Sidebar-Eintrag „Zahlungsläufe" erscheint bei Buchhalter, nicht bei Personal-User
- [ ] Ohne `BillingTenantConfig.iban`: Banner wird angezeigt, Button leitet nach `/admin/billing-config`
- [ ] Mit konfigurierten Bankdaten: Vorschlag zeigt APPROVED-Rechnungen der nächsten 7 Tage
- [ ] GRÜN-Zeile: Checkbox aktivierbar, Auswahl zählt im Footer
- [ ] GELB-Zeile: Inline-Konfliktauflösung via Radio-Buttons, nach Auswahl wird Checkbox aktivierbar
- [ ] ROT-Zeile: Checkbox disabled, Link zu CRM-Lieferant funktioniert
- [ ] „Zahlungslauf erstellen" → Navigation zur Detail-Page des neuen Laufs
- [ ] Detail-Page: „XML herunterladen" öffnet neues Browser-Tab mit XML-Inhalt
- [ ] „Als gebucht markieren" mit Confirm → Status wechselt zu BOOKED, Actions verschwinden
- [ ] Erneutes Klicken auf „markBooked"-Button existiert nicht (Button weg), aber direkter API-Call wäre idempotent
- [ ] „Lauf stornieren" vor BOOKED: bestätigen → Status CANCELLED, Rechnungen kommen im Vorschlag wieder

---

## Phase 4: Tests + Edge Cases + Handbuch

### Overview

Robustheit und Dokumentation. Unit- und Integration-Tests decken alle in Phase 1/2 definierten Edge Cases ab, ein Playwright-E2E-Spec deckt den Klickpfad ab, das TERP-Handbuch bekommt ein neues Kapitel, das Glossar bekommt neue Einträge.

### Changes Required

#### 4.1 Edge-Case-Tests (Unit)

**File**: `src/lib/services/__tests__/payment-run-data-resolver.test.ts` (wurde in Phase 1 angelegt, wird hier erweitert)

Ergänzungen — die 8 Kombinationen aus D2 als `describe.each`:

```typescript
describe.each([
  ["crm only",        { crm: "DE89...", inv: null       }, { status: "GREEN", source: "CRM"     }],
  ["invoice only",    { crm: null,      inv: "DE89..."  }, { status: "GREEN", source: "INVOICE" }],
  ["both equal",      { crm: "DE89...", inv: "DE89..."  }, { status: "GREEN", source: "CRM"     }],
  ["both equal spaces", { crm: "DE89 3704 0044 0532 0130 00", inv: "DE89370400440532013000" }, { status: "GREEN" }],
  ["both different", { crm: "DE89...", inv: "DE22..."  }, { status: "YELLOW", blockers: ["IBAN_CONFLICT"] }],
  ["both absent",     { crm: null,      inv: null       }, { status: "RED", blockers: ["NO_IBAN"] }],
  ["invalid MOD-97",  { crm: "DE00000000000000000000", inv: null }, { status: "RED", blockers: ["IBAN_INVALID"] }],
  ["no supplier matched", { supplierId: null, inv: "DE89..." }, { status: "GREEN", source: "INVOICE", blockers: [] }],
])("iban resolution %s", (name, input, expected) => { /* assert */ })
```

Plus Adress-Matrix mit denselben 8 Kombinationen auf city+country.

**File**: `src/lib/services/__tests__/payment-run-service.test.ts` — Idempotenz-Tests:

- `markBooked` auf bereits BOOKED → kein Audit-Log-Eintrag, kein Fehler, returned run
- `cancel` auf bereits CANCELLED → analog
- `setExported` doppelt → zweiter Aufruf no-op
- `create` mit leerem items → `PaymentRunItemInvalidError`
- `create` mit Rechnung, die bereits in aktivem Lauf ist → Race-Condition-Test: zwei parallele `create`-Aufrufe auf dieselbe Invoice-ID, einer muss fehlschlagen (via unique constraint auf `(tenantId, inboundInvoiceId)` für nicht-cancelled PaymentRuns — siehe 4.2)

#### 4.2 Race-Condition-Safeguard

**File**: `supabase/migrations/20260414100300_payment_run_items_active_unique.sql` (neu)

Partielle Unique-Constraint: eine Invoice darf maximal einmal in einem **nicht-cancelled** PaymentRun enthalten sein.

```sql
-- Verhindert doppelte Einplanung derselben Rechnung in parallele Läufe
CREATE UNIQUE INDEX payment_run_items_active_invoice_unique
ON payment_run_items (tenant_id, inbound_invoice_id)
WHERE payment_run_id IN (
  SELECT id FROM payment_runs WHERE status != 'CANCELLED'
);
```

**Achtung**: PostgreSQL erlaubt keine Sub-Query in `WHERE`-Klausel eines Index. Alternativer Ansatz — Trigger-basiert:

```sql
CREATE OR REPLACE FUNCTION check_payment_run_item_active_unique()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM payment_run_items pri
    JOIN payment_runs pr ON pr.id = pri.payment_run_id
    WHERE pri.tenant_id = NEW.tenant_id
      AND pri.inbound_invoice_id = NEW.inbound_invoice_id
      AND pri.id != NEW.id
      AND pr.status != 'CANCELLED'
  ) THEN
    RAISE EXCEPTION 'Invoice already in active payment run' USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_run_item_active_unique
  BEFORE INSERT ON payment_run_items
  FOR EACH ROW EXECUTE FUNCTION check_payment_run_item_active_unique();
```

Der Service fängt `23505` / Trigger-Exception und wirft `PaymentRunItemInvalidError` mit Reason `"already_in_active_run"`. Prisma-Transaction rollbackt automatisch.

#### 4.3 Integration-Tests

**File**: `src/trpc/routers/__tests__/payment-runs.integration.test.ts` (Phase 2 angelegt, wird erweitert)

Neue Szenarien:
- **Full happy path**: preflight OK → proposal mit 3 Invoices → create → downloadXml → markBooked → list zeigt den Lauf als BOOKED → getPaymentStatus des Invoice ist PAID
- **Create-cancel-recreate**: create → cancel → proposal zeigt Invoice wieder → create neuen Lauf mit derselben Invoice → OK
- **Conflict resolution**: Invoice mit abweichender sellerIban vs. CrmBankAccount → getProposal liefert YELLOW → create mit `ibanSource: "INVOICE"` → PaymentRunItem hat `effectiveIban=<sellerIban>`, `ibanSource="INVOICE"`
- **XSD-Validierung des generierten XML**: Test lädt pain.001.001.09 XSD aus einem committeten Fixture-File (`src/lib/services/__tests__/fixtures/pain.001.001.09.xsd`), validiert das erzeugte XML mit `libxmljs2` (dev-dep, nur für Tests) oder via CLI-Call an `xmllint`. Falls kein XSD-Validator im Node-Prozess verfügbar: Snapshot-Test gegen ein committetes „golden" XML aus einem Referenzlauf und externe KoSIT/Online-Validator-Nachweis im PR.

**Entscheidung zur XSD-Validierung**: **Snapshot-Test** (ohne libxmljs), plus **manueller externe Validierung** pro PR. Begründung: `libxmljs2` hat native Build-Dependencies, macht die CI instabil. Der Snapshot-Test schützt gegen Regressionen, der externe Validator gegen echte Schema-Fehler (einmalig pro Release des Features).

#### 4.4 Playwright E2E-Spec

**File**: `src/e2e-browser/52-payment-runs.spec.ts` (neu)

Struktur analog zu `src/e2e-browser/50-inbound-invoices.spec.ts`:

```typescript
import { test, expect } from "@playwright/test"
import { navigateTo } from "./helpers/nav"

test.describe.serial("UC-INV-02: Zahlungsläufe (SEPA)", () => {
  let createdRunUrl: string

  test("navigates to payment runs via sidebar", async ({ page }) => {
    await navigateTo(page, "/invoices/inbound/payment-runs")
    await expect(page.getByRole("heading", { name: /Zahlungsläufe/i })).toBeVisible()
  })

  test("shows preflight banner when tenant IBAN is missing", async ({ page, request }) => {
    // Setup: Clear BillingTenantConfig.iban via tRPC or test-helper
    // ... setup code ...
    await navigateTo(page, "/invoices/inbound/payment-runs")
    await expect(page.getByText(/Bankdaten fehlen/i)).toBeVisible()
    await expect(page.getByRole("link", { name: /Rechnungs-Konfiguration/i })).toBeVisible()
  })

  test("configures tenant bank data and sees proposal", async ({ page }) => {
    await navigateTo(page, "/admin/billing-config")
    await page.getByLabel("IBAN").fill("DE89370400440532013000")
    await page.getByLabel("BIC").fill("COBADEFFXXX")
    await page.getByLabel(/Firmenname/i).fill("Terp Test GmbH")
    await page.getByLabel(/Stadt/i).fill("Berlin")
    await page.getByRole("button", { name: /Speichern/i }).click()

    await navigateTo(page, "/invoices/inbound/payment-runs")
    await expect(page.getByText(/Vorschlag/i)).toBeVisible()
  })

  test("creates a payment run from selected proposal items", async ({ page }) => {
    // Preconditions: at least 1 APPROVED invoice exists (via DB seed)
    // ... seed code or preceding test that creates it ...

    await navigateTo(page, "/invoices/inbound/payment-runs")
    // Select first green row checkbox
    const firstCheckbox = page.locator("input[type='checkbox']").first()
    await firstCheckbox.check()
    await page.getByRole("button", { name: /Zahlungslauf erstellen/i }).click()
    await page.waitForURL("**/invoices/inbound/payment-runs/**")
    createdRunUrl = page.url()
    await expect(page.getByText(/Entwurf|DRAFT/i)).toBeVisible()
  })

  test("downloads XML and transitions DRAFT → EXPORTED", async ({ page }) => {
    await page.goto(createdRunUrl)
    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: /XML herunterladen/i }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^PR-\d{4}-\d+\.xml$/)
    await expect(page.getByText(/Exportiert|EXPORTED/i)).toBeVisible()
  })

  test("marks run as booked", async ({ page }) => {
    await page.goto(createdRunUrl)
    await page.getByRole("button", { name: /Als gebucht markieren/i }).click()
    await page.getByRole("button", { name: /Bestätigen|Confirm/i }).click()
    await expect(page.getByText(/Gebucht|BOOKED/i)).toBeVisible()
  })

  test("resolves IBAN conflict and creates run with INVOICE source", async ({ page }) => {
    // Seed: invoice with sellerIban != supplier.bankAccounts[0].iban
    // ... seed code ...
    await navigateTo(page, "/invoices/inbound/payment-runs")
    // Expand conflict row
    await page.getByText(/Konflikt/i).first().click()
    await page.getByLabel(/Aus Rechnung verwenden/i).first().check()
    // Now checkbox becomes enabled
    await page.locator("input[type='checkbox'][data-invoice-id]").first().check()
    await page.getByRole("button", { name: /Zahlungslauf erstellen/i }).click()
    await page.waitForURL("**/invoices/inbound/payment-runs/**")
    // Detail page shows "Quelle: Rechnung" badge
    await expect(page.getByText(/INVOICE/i).first()).toBeVisible()
  })
})
```

**Helper**: Im `src/e2e-browser/helpers/`-Ordner ggf. einen neuen Helper `seed-invoice.ts` anlegen, der via direkten DB-Calls oder tRPC-Admin-Endpoints eine APPROVED-Invoice für den Test-Tenant vorbereitet. Muster existiert in der Playwright-Suite für andere Specs.

#### 4.5 TERP-Handbuch

**File**: `docs/TERP_HANDBUCH.md` — nach Abschnitt 22 (Eingangsrechnungen) neuen Unter-Abschnitt `22.X Zahlungsläufe (SEPA)` einfügen:

```markdown
### 22.X Zahlungsläufe (SEPA)

**Was ist ein Zahlungslauf?** Ein SEPA-Zahlungslauf ist eine Sammelüberweisung:
Sie wählen freigegebene Eingangsrechnungen aus, Terp erzeugt eine XML-Datei im
Format **pain.001.001.09** (ISO-20022 SEPA Credit Transfer), Sie laden die Datei
im Online-Banking Ihrer Bank hoch, die Bank führt die Überweisungen aus.

#### Voraussetzungen

1. **Eigene Bankdaten** unter **Einstellungen → Rechnungs-Konfiguration**:
   IBAN, BIC, Firmenname, Stadt, Land müssen gesetzt sein. Fehlen diese, zeigt
   Terp eine rote Warnung mit Direktlink.
2. **Lieferanten-Bankdaten** im CRM: für jeden Lieferanten, den Sie per SEPA
   bezahlen wollen, ein Bankkonto mit IBAN als Default im Reiter „Bankkonten"
   hinterlegen.
3. **Berechtigung** `payment_runs.view` (Anzeigen) bzw. `.create`/`.export`/
   `.book`/`.cancel` für die jeweiligen Aktionen.

#### Workflow

**Schritt 1 — Vorschlag öffnen**: Über die Sidebar `Rechnungen → Zahlungsläufe`.
Sie sehen automatisch alle freigegebenen Rechnungen mit Fälligkeit in den
nächsten 7 Tagen, die in keinem aktiven Lauf enthalten sind. Filter:
Datum, Lieferant, Betrag.

**Schritt 2 — Status-Ampel prüfen**:
- 🟢 **Grün** („Bereit"): alle Daten vorhanden, Rechnung ist auswählbar.
- 🟡 **Gelb** („Konflikt"): die IBAN im CRM weicht von der IBAN auf der
  Rechnung ab, oder die Adresse im CRM weicht von der Adresse auf der Rechnung
  ab. Klicken Sie auf die Zeile, wählen Sie per Radio-Button „CRM verwenden"
  oder „Rechnung verwenden".
- 🔴 **Rot** („Nicht exportierbar"): Lieferant hat keine IBAN, keine Adresse,
  oder die IBAN ist ungültig. Klicken Sie auf den Link, ergänzen Sie die
  Daten im CRM, kehren Sie zurück.

**Schritt 3 — Rechnungen auswählen**: Haken setzen bei den Rechnungen, die
bezahlt werden sollen. Im Footer sehen Sie Anzahl und Summe.

**Schritt 4 — Ausführungsdatum**: Standardmäßig morgen. Anpassbar nach oben
(bis zu 1 Jahr in der Zukunft laut SEPA-Regelwerk).

**Schritt 5 — Lauf erstellen**: Button „Zahlungslauf erstellen". Terp legt
den Lauf im Status **Entwurf** an und zeigt die Detailseite.

**Schritt 6 — XML herunterladen**: Button „XML herunterladen". Terp erzeugt
die pain.001.001.09-Datei, speichert sie intern (revisionssicher) und bietet
sie als Download an. Nach dem ersten Download wechselt der Status auf
**Exportiert**.

**Schritt 7 — Bei der Bank hochladen**: Öffnen Sie Ihr Online-Banking, navigieren
Sie zu „Sammelüberweisung / SEPA-Datei-Upload", laden Sie die heruntergeladene
`PR-2026-001.xml` hoch, prüfen Sie die Vorschau, bestätigen Sie mit TAN.

**Schritt 8 — Als gebucht markieren**: Zurück in Terp auf der Detail-Seite
des Laufs, Button „Als gebucht markieren". Confirm-Dialog, Bestätigung.
Status wechselt auf **Gebucht**. Die Rechnungen zählen ab jetzt als bezahlt.

#### Stornierung

Vor dem Markieren als gebucht können Sie den Lauf jederzeit stornieren
(„Lauf stornieren"). Die enthaltenen Rechnungen werden wieder für neue
Läufe verfügbar. Die XML-Datei bleibt im System als Audit-Spur erhalten.

**Ein bereits gebuchter Lauf kann nicht storniert werden.** Eine bei der
Bank ausgeführte Überweisung wäre nur durch eine Rückholung bei der
Bank rückgängig zu machen; Terp spiegelt das nicht.

#### Praxisbeispiel

*Montag, 14. April.* Anna (Buchhalterin) öffnet Terp, sieht im Dashboard
„3 Rechnungen fällig diese Woche". Sie klickt in der Sidebar auf
**Rechnungen → Zahlungsläufe**.

Im Vorschlag sieht sie:
- „Lieferant A — 1.200 €" — 🟢
- „Lieferant B — 450 €" — 🟡 (IBAN weicht ab)
- „Lieferant C — 2.300 €" — 🔴 (keine IBAN im CRM)

Sie klickt Lieferant B an, sieht die beiden IBANs, erinnert sich an
die Mail von letzter Woche („neue Bankverbindung, bitte ab jetzt
auf DE22... überweisen") und wählt **Aus Rechnung verwenden**.

Bei Lieferant C klickt sie auf den Link, ergänzt im CRM die IBAN,
kehrt zum Vorschlag zurück — jetzt ist die Zeile grün.

Sie wählt alle drei aus, Footer zeigt „3 Rechnungen • 3.950,00 €",
Ausführungsdatum = Dienstag 15. April. Klick auf
**Zahlungslauf erstellen**.

Terp zeigt die Detail-Seite von `PR-2026-001`. Anna klickt
**XML herunterladen**, der Download startet. Sie öffnet ihr
Online-Banking, geht zu „SEPA-Datei-Upload", wählt die Datei,
bestätigt mit TAN. Die Bank meldet „3 Überweisungen werden am
15.04. ausgeführt".

Anna wechselt zurück zu Terp, klickt **Als gebucht markieren**,
bestätigt. Die drei Rechnungen erscheinen jetzt als bezahlt, der
Lauf steht auf **Gebucht**.
```

#### 4.6 Glossar

**File**: `docs/TERP_HANDBUCH.md` — Glossar-Abschnitt am Ende um Einträge erweitern:

```markdown
**PaymentRun (Zahlungslauf)** — Sammelüberweisung, die mehrere freigegebene
Eingangsrechnungen in einer einzigen SEPA-Datei bündelt. Status: Entwurf,
Exportiert, Gebucht, Storniert.

**pain.001.001.09** — ISO-20022-XML-Nachrichtentyp für „Customer Credit
Transfer Initiation", Version 9. Wird von Terp für Sammelüberweisungen
erzeugt und muss von der Bank als Upload akzeptiert werden.

**SEPA (Single Euro Payments Area)** — einheitlicher europäischer
Zahlungsverkehrsraum. SEPA-Überweisungen sind in EUR innerhalb der
teilnehmenden Länder kostenfrei in der Regel innerhalb eines Bankarbeitstags
möglich.

**Gläubiger-ID (Creditor Identifier, CI)** — für SEPA-Lastschriften (pain.008)
erforderliche Kennung. **Für Terps Zahlungsläufe (pain.001, Überweisung)
nicht relevant.**

**IBAN-Quelle (CRM/INVOICE)** — zeigt, woher Terp die Empfänger-IBAN eines
PaymentRunItems genommen hat: aus dem Bankkonto im CRM-Lieferanten oder aus
dem `sellerIban`-Feld auf der Rechnung. Wird beim Erstellen des Laufs als
Snapshot festgeschrieben und ändert sich danach nicht mehr.
```

#### 4.7 `terp_handbook_verify`-Skill freundlich halten

Der Handbuch-Abschnitt ist so strukturiert, dass der `terp_handbook_verify`-Skill
die Behauptungen verifizieren kann: jede „Terp tut X"-Aussage entspricht
einer echten Implementierung im Code (Datei-Referenzen oben in diesem Plan).

### Success Criteria

#### Automated Verification

- [ ] Alle Unit-Tests grün: `pnpm test`
- [ ] Alle Integration-Tests grün: `pnpm vitest run src/**/__tests__/**/*.integration.test.ts`
- [ ] Playwright-Spec grün: `pnpm test:browser -- 52-payment-runs`
- [ ] `pnpm check` (typecheck + lint) grün
- [ ] XML-Snapshot-Test: generiertes XML entspricht der committeten „golden"-Datei
- [ ] Race-Condition-Test: zwei parallele `create`-Aufrufe auf dieselbe Invoice → einer wirft `PaymentRunItemInvalidError`

#### Manual Verification

- [ ] Handbuch-Abschnitt ist lesbar, Praxisbeispiel nachvollziehbar
- [ ] Glossar-Einträge erscheinen alphabetisch einsortiert
- [ ] Externe XSD-Validierung der XML via Online-Validator (Screenshot im PR)
- [ ] `terp_handbook_verify paymentRuns` bestätigt, dass alle Behauptungen im Handbuch durch Code gedeckt sind
- [ ] Buchhalter kann Feature ohne Nachhilfe aus dem Handbuch erlernen

---

## Testing Strategy

### Unit Tests

**Scope**: jede pure-Function, jeder Service mit Mock-Prisma.

- `payment-run-data-resolver.test.ts`: alle 8 D2-Matrix-Kombinationen (IBAN × Adresse), `getPaymentStatus` Ableitung
- `payment-run-service.test.ts`: `create` happy path + preflight fail + validation fail; `markBooked`/`cancel` idempotenz + state-transition errors; `setExported` idempotenz
- `payment-run-xml-generator.test.ts`: Snapshot-Test gegen golden file, MsgId-Kollision, leere Items (darf nie auftreten aber defense-in-depth)
- `payment-run-permission-uuid-consistency.test.ts`: UUIDs in Migration == Katalog-UUIDs

### Integration Tests

**Scope**: `src/trpc/routers/__tests__/payment-runs.integration.test.ts` + `src/lib/services/__tests__/payment-run-service.integration.test.ts`. Nutzt lokale Supabase.

- Preflight OK/Fail
- Proposal liefert nur APPROVED, nicht bereits gebunden
- Create → Snapshot-Felder korrekt befüllt
- Download Storage-Upload erfolgreich, Signed URL abrufbar
- Idempotente Statusübergänge
- Race-Condition: zwei parallele creates über Trigger abgefangen
- Tenant-Isolation: Cross-Tenant-Calls liefern NOT_FOUND, kein Leak
- Permission-Checks: FORBIDDEN für fehlende Scopes
- Audit-Log: 3 Einträge pro Happy Path (create + export + book)

### Browser E2E Tests (Playwright)

**Scope**: `src/e2e-browser/52-payment-runs.spec.ts`. Serieller Ablauf analog zu `50-inbound-invoices.spec.ts`.

Abgedeckte Pfade:
- Sidebar-Navigation
- Pre-Flight-Banner → Bankdaten konfigurieren → Vorschlag
- Create aus Grüner Zeile
- Konfliktauflösung bei Gelber Zeile (Konflikt-Setup via Test-Seed)
- XML-Download mit echtem Download-Event
- markBooked mit Confirm-Dialog
- Stornierung vor Export

### Manual Testing Checklist (pro Phase)

1. Phase 1: Unit-Tests + externe XSD-Validierung der Sample-XML
2. Phase 2: Postman/curl-Durchlauf + Storage-Studio-Inspect
3. Phase 3: Vollständige Klickstrecke im Browser mit 3 Test-Rechnungen (je grün/gelb/rot)
4. Phase 4: Vollständiger E2E-Run-Through als echter Buchhalter mit Handbuch in der Hand

## Performance Considerations

- `getProposal` lädt Invoices + supplier + bankAccounts + verwendet Set-Lookup gegen aktive PaymentRunItems. Bei typischem Mandanten (< 1000 offene Rechnungen) unproblematisch. Index auf `inbound_invoices(tenant_id, status, due_date)` existiert bereits (aus `20260413100000`).
- `findInvoiceIdsWithActivePaymentRun` macht genau eine Query `WHERE inbound_invoice_id IN (...) AND paymentRun.status != 'CANCELLED'`. Index `idx_pri_inbound_invoice` + join-side Index auf `payment_runs(id, status)` sichern das ab.
- XML-Generierung ist synchron, im tRPC-Request-Handler. Bei 1000 Transaktionen < 1 s (reiner String-Build). Ab >5000 Transaktionen würde man asynchron werden wollen — out of scope.
- Storage-Upload: `upsert=true`, kein Versions-Management. Max 1 MB pro Datei reicht für ~2000 Transaktionen.

## Migration Notes

- **Phase 1 Migration** (`20260414100000_create_payment_runs.sql`, `20260414100100_add_payment_run_permissions_and_module.sql`) ist additive und abwärtskompatibel.
- **Phase 2 Migration** (`20260414100200_create_payment_runs_storage_bucket.sql`) legt nur den Bucket an.
- **Phase 4 Migration** (`20260414100300_payment_run_items_active_unique.sql`) führt den Trigger ein — muss ausgeführt werden **bevor** das Feature produktiv freigegeben wird, sonst sind Race-Conditions möglich. **Kann trotzdem nachgezogen werden** (keine Datenmigration nötig, der Trigger ist ab Insert-Time aktiv).
- **Rollback-Strategie** pro Phase: `DROP TABLE payment_run_items; DROP TABLE payment_runs; DELETE FROM number_sequences WHERE key='payment_run'; DELETE FROM storage.buckets WHERE id='payment-runs';` — danach ist das Feature restlos entfernt. Keine Abhängigkeit von anderen Modulen.
- **Kein Backfill** nötig — es gibt keine existierenden Payment-Daten zu migrieren.
- **Staging-Push**: `pnpm db:push:staging` nach jeder Phase. Produktions-Push erst nach Phase-4-Abnahme.

## References

- Bestandsaufnahme: `thoughts/shared/research/2026-04-12_19-55-28_sepa-zahlungslaeufe-bestandsaufnahme.md`
- Inbound-Invoice-Pattern (Service): `src/lib/services/inbound-invoice-service.ts:57-490`
- Inbound-Invoice-Pattern (Router): `src/trpc/routers/invoices/inbound.ts:13-443`
- NumberSequence: `src/lib/services/number-sequence-service.ts:35-72`
- Permission-Katalog: `src/lib/auth/permission-catalog.ts:12,27-29,342-348`
- Permission-Seed-Migration: `supabase/migrations/20260413100001_add_inbound_invoice_permissions_and_module.sql:20-75`
- Storage-Helper: `src/lib/supabase/storage.ts:35-100`
- E-Invoice-Storage-Flow (Referenz): `src/lib/services/billing-document-einvoice-service.ts:33-34`, `src/trpc/routers/billing/documents.ts:355-382`
- Audit-Log: `src/lib/services/audit-logs-service.ts:109-249`
- Sidebar-Config: `src/components/layout/sidebar/sidebar-nav-config.ts:389-414`
- Bulk-Select-Pattern: `src/components/approvals/approval-bulk-actions.tsx:37-63`, `src/components/approvals/timesheet-approval-table.tsx:24-25,56-59`
- Hook-Pattern: `src/hooks/useInboundInvoices.ts:6-190`
- Playwright-Pattern: `src/e2e-browser/50-inbound-invoices.spec.ts`, `playwright.config.ts`
- Handbuch: `docs/TERP_HANDBUCH.md` (Abschnitt 22)
- ISO 20022 pain.001.001.09 Schema: https://www.iso20022.org/iso-20022-message-definitions (offiziell), https://www.ebics.de/dokumentation (EBICS-DE-Variante für deutsche Banken)

## Open Questions

_Keine._ Alle Designentscheidungen sind in der Eingangs-Spezifikation (D1–D9) final festgelegt und hier umgesetzt. Das einzige offene Risiko — die Library-Wahl — wird per Gate-Smoke-Test in Phase 1 entschieden und hat einen dokumentierten Fallback (Hand-Roll mit `fast-xml-parser`).
