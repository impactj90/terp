---
date: 2026-04-13
author: Claude (Opus 4.6)
status: draft
topic: Mahnwesen (Dunning) für ausgehende Kundenrechnungen
research: thoughts/shared/research/2026-04-13_mahnwesen-bestandsaufnahme.md
---

# Mahnwesen-Implementierungsplan

## Overview

Wenn eine Ausgangsrechnung über ihr Fälligkeitsdatum hinaus unbezahlt bleibt, erstellt Terp gestufte Mahnungen mit konfigurierbaren Gebühren und Verzugszinsen, generiert PDFs, versendet sie per E-Mail und protokolliert alles als `CrmCorrespondence`. Das Feature ist vollständig manuell freigabepflichtig — kein Auto-Versand.

Der Plan ist strikt sequentiell in fünf Phasen gegliedert. Jede Phase endet mit einem Verifikationspunkt. Alle Designentscheidungen sind im Command-Input (D1–D12) final festgelegt; dieser Plan übersetzt sie 1:1 in konkrete Datei-Pfade, Service-Signaturen, Migrationen, Routen, UI-Komponenten und Tests.

## Current State Analysis

Bestandsaufnahme ausführlich in `thoughts/shared/research/2026-04-13_mahnwesen-bestandsaufnahme.md`. Zusammenfassung:

- **Kein Mahnwesen im Code.** Keine Tabellen, Services, Routen, Permissions, i18n-Keys.
- `BillingDocument` hat keine Mahn-Marker. `openAmount`, `dueDate`, `isOverdue` werden live in `billing-payment-service.ts:75-98` berechnet.
- Geldbeträge in Billing sind `Prisma.Float`, nicht Decimal oder Cents.
- Keine Mahnsperre auf `CrmAddress` oder `BillingDocument`.
- PDF-Stack steht (`@react-pdf/renderer` + Supabase Storage Bucket `documents`), E-Mail-Stack steht (`email-send-service`), Cron-Infrastruktur steht.
- `BillingDocumentTemplate` nutzt regex-basierten `{{key}}`-Platzhalter-Parser in `billing-document-service.ts:20-52`.
- Permission-Catalog nutzt UUIDv5 mit Namespace `f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1` — UUIDs werden beim Modul-Load deterministisch aus dem Key berechnet, d.h. das Umbenennen eines Keys invalidiert bestehende Rollen.

### Wichtige Korrekturen zur Spec (gegen den Codebase gecheckt)

Die Command-Input-Spec beschreibt **Routen und Sidebar-Struktur** in einer Form, die die Codebase-Konventionen nicht wörtlich unterstützt. Der Plan macht zwei minimale Anpassungen:

1. **URL-Prefix**: Die Spec spricht von `/fakturierung/mahnwesen/*`. Der Codebase nutzt durchgehend englische URL-Pfade (`/orders/*`, `/invoices/*`, `/crm/*`). Der Plan verwendet daher `/orders/dunning/*` analog zu `/orders/documents`, `/orders/open-items`, `/orders/recurring`. Die German-labels (Sidebar-Key `billingDunning`, Title "Mahnwesen") bleiben unverändert — nur der Path-Segment wechselt.
2. **Sidebar-Struktur**: Die Spec beschreibt einen Baum (Fakturierung → Mahnwesen → Vorschlag/Mahnläufe/Vorlagen/Einstellungen). Die Sidebar-Config in `src/components/layout/sidebar/sidebar-nav-config.ts` kennt aber **keine verschachtelten Subsections** — nur flache `NavItem`-Listen unter einer `NavSection`. Der Plan realisiert das über **einen einzigen Sidebar-Eintrag** `billingDunning` → `/orders/dunning`, dessen Zielseite die vier Tabs (Vorschlag, Mahnläufe, Vorlagen, Einstellungen) intern rendert. Das entspricht D7 Schritt 1, wo der Buchhalter auf einer Seite mit Default-Tab "Vorschlag" landet.

Diese zwei Anpassungen sind reine Naming-Konformitäten und ändern an der Business-Logik nichts.

## Desired End State

Ein Buchhalter mit passenden Permissions kann:

1. Im Admin-Bereich Mahnwesen aktivieren, Karenzzeiten/Gebühren/Zinssatz konfigurieren und Default-Templates seeden.
2. Über `/orders/dunning` einen Mahn-Vorschlag einsehen, der alle mahnfähigen Rechnungen pro Kunde gruppiert und Zielstufe + Zinsen + Gebühren berechnet.
3. Per Checkbox einzelne Rechnungen aus einer Sammelmahnung entfernen und einen Mahnlauf mit Status `DRAFT` erzeugen.
4. Jede gedraftete Mahnung einzeln versenden (E-Mail + PDF oder Brief-Markierung), stornieren oder in PDF-Preview anschauen.
5. Mahnsperren auf Kunden-Detail und Beleg-Detail setzen und entfernen.

Ein täglicher Cron erzeugt eine Notification pro Tenant, wenn mahnfähige Rechnungen existieren. Jeder Versand erzeugt einen `CrmCorrespondence`-Eintrag (type `email`/`letter`, direction `OUTGOING`). Eine Stornierung erzeugt einen zusätzlichen `note`-Eintrag als Folge-Audit.

### Verifikation am Ende

- Alle Phase-Verifikationspunkte erfüllt.
- Playwright-Happy-Path `src/e2e-browser/53-mahnwesen-happy-path.spec.ts` grün (17 Assertions aus D7).
- Vitest-Suite `reminder-eligibility-service.test.ts` grün (9 Filter-Cases aus D5).
- Handbuch-Abschnitt "22.17 Mahnwesen" mit drei Praxisbeispielen vorhanden.

## What We're NOT Doing

Explizit aus dem Scope (aus Command-Input übernommen):

- **Automatischer Versand ohne manuelle Freigabe** — jede Mahnung muss einzeln per Klick freigegeben werden.
- **Inkasso-Integration** — Buchhalter entscheidet außerhalb Terp.
- **Mahnbescheid-Vorbereitung** (gerichtliches Mahnverfahren).
- **Rabattierung von Zinsen/Gebühren nach Einzelfall** — Workaround ist Stornieren + Manuelle Korrektur.
- **Persistierung von `openAmount`/`dueDate` auf `BillingDocument`** — separates Refactoring-Ticket (Risiko R1, R2 aus Bestandsaufnahme bleiben bestehen).
- **Float→Decimal-Migration** des Money-Typs — separates großes Refactoring (R3).
- **Erweiterung `BillingDocumentType`-Enum um `DUNNING_REMINDER`** — bewusst nicht, um Fan-out auf PDF-Storage, EmailTemplate, NumberSequence zu vermeiden (R10). Reminder lebt in eigenem Modell.
- **Vereinheitlichung `BillingDocumentTemplate` + `ReminderTemplate`** — bewusst zwei parallele Systeme (D1).
- **Versand per Briefdruck-Service** — nur E-Mail oder manuelle Brief-Markierung (D7).
- **Änderung des `BillingDocumentStatus`-Enums** — bleibt `DRAFT, PRINTED, PARTIALLY_FORWARDED, FORWARDED, CANCELLED`. Mahnstufe wird über Helper aus `ReminderItem` abgeleitet.

## Hard Constraints

- Keine Änderungen an existierenden Cron-Routes.
- Keine Erweiterung von `BillingDocumentType`-Enum.
- Keine Änderung an `BillingDocumentStatus`-Enum.
- Audit-Logging fire-and-forget, never throws.
- Permission-UUIDs deterministisch (UUIDv5 aus Key, keine Key-Änderungen nach Phase 1).
- Zinsberechnung strict in Integer-Cents.
- Platzhalter-Parser wird extrahiert und von beiden Template-Systemen geteilt.

## Implementation Approach

Fünf Phasen, strikt sequentiell:

1. **Phase 1** — Datenmodell (Migrationen, Models), Permissions, Shared Helper (Platzhalter-Parser extrahieren), Settings-Backend, alle Services ohne tRPC. Unit-Tests pro Service.
2. **Phase 2** — tRPC-Router, PDF-Generator, E-Mail-Versand, Cron-Route. Backend vollständig via Postman spielbar.
3. **Phase 3** — UI: Page mit 4 Tabs, Mahnsperre-Widgets, Sidebar-Eintrag, i18n-Keys.
4. **Phase 4** — Edge-Case-Tests (D5-Filter), Playwright-Happy-Path, Race-Condition-Test.
5. **Phase 5** — Handbuch + Glossar.

Zwischen jeder Phase steht ein manueller Verifikationspunkt. Die Phase muss dort enden und auf Bestätigung des Users warten.

---

## Phase 1: Datenmodell + Shared Helper + Services

### Overview

Alle Tabellen existieren, Permissions sind registriert, der Platzhalter-Parser ist extrahiert, sämtliche Services sind testbar ohne tRPC oder UI. Kein Frontend-Code in dieser Phase.

### Changes Required

#### 1.1 Prisma-Migration für Reminder-Modelle

**File**: `supabase/migrations/YYYYMMDDHHMMSS_create_dunning_tables.sql`

Erzeugt via `pnpm db:migrate:new create_dunning_tables`. Enthält:

```sql
-- ReminderSettings: ein Datensatz pro Tenant
CREATE TABLE reminder_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  max_level INT NOT NULL DEFAULT 3 CHECK (max_level BETWEEN 1 AND 4),
  grace_period_days INT[] NOT NULL DEFAULT ARRAY[7, 14, 21],
  fee_amounts DOUBLE PRECISION[] NOT NULL DEFAULT ARRAY[0, 2.5, 5]::double precision[],
  interest_enabled BOOLEAN NOT NULL DEFAULT true,
  interest_rate_percent DOUBLE PRECISION NOT NULL DEFAULT 9,
  fees_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ReminderTemplate: parallel zu BillingDocumentTemplate
CREATE TABLE reminder_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  level INT NOT NULL CHECK (level BETWEEN 1 AND 4),
  header_text TEXT NOT NULL DEFAULT '',
  footer_text TEXT NOT NULL DEFAULT '',
  email_subject VARCHAR(255) NOT NULL DEFAULT '',
  email_body TEXT NOT NULL DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX reminder_templates_tenant_level_idx ON reminder_templates(tenant_id, level);

-- Reminder: ein Anschreiben an einen Kunden
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number VARCHAR(50) NOT NULL,
  customer_address_id UUID NOT NULL REFERENCES crm_addresses(id) ON DELETE RESTRICT,
  level INT NOT NULL CHECK (level BETWEEN 1 AND 4),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',  -- DRAFT | SENT | CANCELLED
  sent_at TIMESTAMPTZ,
  sent_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  send_method VARCHAR(20),  -- 'email' | 'letter' | 'manual'
  pdf_storage_path TEXT,
  total_open_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_interest DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_fees DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_due DOUBLE PRECISION NOT NULL DEFAULT 0,
  header_text TEXT NOT NULL DEFAULT '',
  footer_text TEXT NOT NULL DEFAULT '',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (tenant_id, number)
);
CREATE INDEX reminders_tenant_status_idx ON reminders(tenant_id, status);
CREATE INDEX reminders_tenant_customer_idx ON reminders(tenant_id, customer_address_id);
CREATE INDEX reminders_tenant_sent_at_idx ON reminders(tenant_id, sent_at);

-- ReminderItem: eine Zeile pro Rechnung in einem Reminder
CREATE TABLE reminder_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reminder_id UUID NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  billing_document_id UUID NOT NULL REFERENCES billing_documents(id) ON DELETE RESTRICT,
  invoice_number VARCHAR(50) NOT NULL,
  invoice_date TIMESTAMPTZ NOT NULL,
  due_date TIMESTAMPTZ NOT NULL,
  original_amount DOUBLE PRECISION NOT NULL,
  open_amount_at_reminder DOUBLE PRECISION NOT NULL,
  days_overdue INT NOT NULL,
  interest_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  fee_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  level_at_reminder INT NOT NULL CHECK (level_at_reminder BETWEEN 1 AND 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reminder_items_reminder_idx ON reminder_items(reminder_id);
CREATE INDEX reminder_items_billing_document_idx ON reminder_items(billing_document_id);

-- Flags auf bestehenden Modellen
ALTER TABLE crm_addresses ADD COLUMN dunning_blocked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE crm_addresses ADD COLUMN dunning_block_reason TEXT;
ALTER TABLE billing_documents ADD COLUMN dunning_blocked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE billing_documents ADD COLUMN dunning_block_reason TEXT;
```

Pattern gleicht den bisherigen Supabase-Migrationen (`supabase/migrations/*.sql`) mit snake_case-Spaltennamen.

#### 1.2 Prisma-Schema-Erweiterung

**File**: `prisma/schema.prisma`

Vier neue Models, zwei neue Felder auf bestehenden Models:

```prisma
model CrmAddress {
  // ... bestehende Felder ...
  dunningBlocked      Boolean @default(false) @map("dunning_blocked")
  dunningBlockReason  String? @map("dunning_block_reason")
  reminders           Reminder[]  // neue Relation
}

model BillingDocument {
  // ... bestehende Felder ...
  dunningBlocked      Boolean @default(false) @map("dunning_blocked")
  dunningBlockReason  String? @map("dunning_block_reason")
  reminderItems       ReminderItem[]  // neue Relation
}

model ReminderSettings {
  id                   String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId             String   @unique @map("tenant_id") @db.Uuid
  enabled              Boolean  @default(false)
  maxLevel             Int      @default(3) @map("max_level")
  gracePeriodDays      Int[]    @default([7, 14, 21]) @map("grace_period_days")
  feeAmounts           Float[]  @default([0, 2.5, 5]) @map("fee_amounts")
  interestEnabled      Boolean  @default(true) @map("interest_enabled")
  interestRatePercent  Float    @default(9) @map("interest_rate_percent")
  feesEnabled          Boolean  @default(true) @map("fees_enabled")
  createdAt            DateTime @default(now()) @map("created_at")
  updatedAt            DateTime @updatedAt @map("updated_at")
  tenant               Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@map("reminder_settings")
}

model ReminderTemplate {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String   @map("tenant_id") @db.Uuid
  name         String   @db.VarChar(255)
  level        Int
  headerText   String   @default("") @map("header_text")
  footerText   String   @default("") @map("footer_text")
  emailSubject String   @default("") @map("email_subject") @db.VarChar(255)
  emailBody    String   @default("") @map("email_body")
  isDefault    Boolean  @default(false) @map("is_default")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  createdById  String?  @map("created_by_id") @db.Uuid
  tenant       Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  createdBy    User?    @relation(fields: [createdById], references: [id], onDelete: SetNull)
  @@index([tenantId, level])
  @@map("reminder_templates")
}

model Reminder {
  id                String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String         @map("tenant_id") @db.Uuid
  number            String         @db.VarChar(50)
  customerAddressId String         @map("customer_address_id") @db.Uuid
  level             Int
  status            String         @default("DRAFT") @db.VarChar(20)
  sentAt            DateTime?      @map("sent_at")
  sentById          String?        @map("sent_by_id") @db.Uuid
  sendMethod        String?        @map("send_method") @db.VarChar(20)
  pdfStoragePath    String?        @map("pdf_storage_path")
  totalOpenAmount   Float          @default(0) @map("total_open_amount")
  totalInterest     Float          @default(0) @map("total_interest")
  totalFees         Float          @default(0) @map("total_fees")
  totalDue          Float          @default(0) @map("total_due")
  headerText        String         @default("") @map("header_text")
  footerText        String         @default("") @map("footer_text")
  notes             String?
  createdAt         DateTime       @default(now()) @map("created_at")
  updatedAt         DateTime       @updatedAt @map("updated_at")
  createdById       String?        @map("created_by_id") @db.Uuid
  tenant            Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  customerAddress   CrmAddress     @relation(fields: [customerAddressId], references: [id], onDelete: Restrict)
  items             ReminderItem[]
  sentBy            User?          @relation("ReminderSentBy", fields: [sentById], references: [id], onDelete: SetNull)
  createdBy         User?          @relation("ReminderCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  @@unique([tenantId, number])
  @@index([tenantId, status])
  @@index([tenantId, customerAddressId])
  @@index([tenantId, sentAt])
  @@map("reminders")
}

model ReminderItem {
  id                   String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId             String          @map("tenant_id") @db.Uuid
  reminderId           String          @map("reminder_id") @db.Uuid
  billingDocumentId    String          @map("billing_document_id") @db.Uuid
  invoiceNumber        String          @map("invoice_number") @db.VarChar(50)
  invoiceDate          DateTime        @map("invoice_date")
  dueDate              DateTime        @map("due_date")
  originalAmount       Float           @map("original_amount")
  openAmountAtReminder Float           @map("open_amount_at_reminder")
  daysOverdue          Int             @map("days_overdue")
  interestAmount       Float           @default(0) @map("interest_amount")
  feeAmount            Float           @default(0) @map("fee_amount")
  levelAtReminder      Int             @map("level_at_reminder")
  createdAt            DateTime        @default(now()) @map("created_at")
  tenant               Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  reminder             Reminder        @relation(fields: [reminderId], references: [id], onDelete: Cascade)
  billingDocument      BillingDocument @relation(fields: [billingDocumentId], references: [id], onDelete: Restrict)
  @@index([reminderId])
  @@index([billingDocumentId])
  @@map("reminder_items")
}
```

`Tenant` und `User` bekommen die passenden `@relation`-Rückseiten.

#### 1.3 NumberSequence-Prefix

**File**: `src/lib/services/number-sequence-service.ts` lines 35-59

Ergänze `DEFAULT_PREFIXES`:

```typescript
const DEFAULT_PREFIXES: Record<string, string> = {
  // ... bestehend ...
  dunning: "MA-",
}
```

**Format `MA-YYYY-NNN` mit jährlichem Reset (precision adjustment)**. Der `dunning`-Eintrag in `DEFAULT_PREFIXES` wird nur als Doku geführt. Der Reminder-Service nutzt eigene jahresspezifische Sequence-Keys `dunning_2026`, `dunning_2027`, ... mit Prefix `MA-2026-`, `MA-2027-` und einer Helper-Funktion `getNextReminderNumber(prisma, tenantId, now)`, die den `numberSequence.upsert` direkt aufruft und das Ergebnis auf 3 Stellen padded (`MA-2026-007`). Implementation in `src/lib/services/reminder-service.ts:getNextReminderNumber`.

#### 1.4 Permissions im Catalog registrieren

**File**: `src/lib/auth/permission-catalog.ts`

Die Permission-UUIDs werden per UUIDv5 aus dem Key berechnet. Da der Key nach Registrierung nicht mehr geändert werden darf (R15), werden die fünf Keys in Phase 1 **ein für alle Mal** festgezogen:

```typescript
// irgendwo im ALL_PERMISSIONS-Array, Block nach billing_recurring
p("dunning.view",     "dunning", "view",     "View dunning proposal, runs, history, settings"),
p("dunning.create",   "dunning", "create",   "Create dunning runs and edit draft reminders"),
p("dunning.send",     "dunning", "send",     "Finalize and send reminders (email or letter)"),
p("dunning.cancel",   "dunning", "cancel",   "Cancel reminders and manage dunning blocks"),
p("dunning.settings", "dunning", "settings", "Configure dunning levels, fees, interest, templates"),
```

Keine weiteren Code-Änderungen — `permissionIdByKey("dunning.view")` funktioniert automatisch.

**Module-Registry**: Falls `dunning` als neues Modul in der Module-Registry registriert werden muss (so dass Tenants es de-/aktivieren können), prüfen via grep auf `"billing"` in `src/lib/modules/*.ts` oder `src/lib/platform/module-pricing.ts`. Wenn die Module-Registry ein eigener Kanal ist, wird `dunning` dort als Sub-Feature von `billing` behandelt — d.h. es gibt **kein eigenes Modul**, die Permissions setzen `module: "billing"` im entsprechenden Feld der NavItem. Der Platform-Operator schaltet Mahnwesen nicht separat frei — es ist Teil von Billing. Diese Entscheidung festhalten: kein neues Modul, `dunning.*`-Permissions gehören zu `billing`.

#### 1.5 Platzhalter-Parser extrahieren (Refactoring)

**New File**: `src/lib/templates/placeholder-resolver.ts`

```typescript
/**
 * Shared placeholder resolver used by BillingDocumentTemplate and ReminderTemplate.
 * Regex-based {{key}} replacement, case-insensitive.
 */
export function resolvePlaceholders(
  text: string,
  context: Record<string, string | number | null | undefined>,
): string {
  return text.replace(/\{\{(\w+)\}\}/gi, (_match, key: string) => {
    const val = context[key.toLowerCase()]
    if (val === undefined || val === null) return ""
    return String(val)
  })
}

/**
 * Builds the standard letter-salutation/contact placeholder block
 * used by BillingDocumentTemplate. Extracted unchanged from
 * billing-document-service.ts:20-52.
 */
export function buildContactPlaceholders(
  address?: { company?: string | null } | null,
  contact?: {
    firstName?: string | null
    lastName?: string | null
    salutation?: string | null
    title?: string | null
    letterSalutation?: string | null
  } | null,
): Record<string, string> {
  return {
    briefanrede: contact?.letterSalutation || "Sehr geehrte Damen und Herren,",
    anrede: contact?.salutation ?? "",
    titel: contact?.title ?? "",
    vorname: contact?.firstName ?? "",
    nachname: contact?.lastName ?? "",
    firma: address?.company ?? "",
    lettersalutation: contact?.letterSalutation || "Dear Sir or Madam,",
    salutation: contact?.salutation ?? "",
    title: contact?.title ?? "",
    firstname: contact?.firstName ?? "",
    lastname: contact?.lastName ?? "",
    company: address?.company ?? "",
  }
}
```

**File**: `src/lib/services/billing-document-service.ts` lines 20-52

Ersetze die bestehende `resolveTemplatePlaceholders`-Funktion durch einen Re-Export, damit die 4 bestehenden Callsites (2 in billing-document-service.ts, 2 in components/billing/document-editor.tsx) unverändert bleiben:

```typescript
import { resolvePlaceholders, buildContactPlaceholders } from "@/lib/templates/placeholder-resolver"

export function resolveTemplatePlaceholders(
  html: string,
  address?: { company?: string | null } | null,
  contact?: Parameters<typeof buildContactPlaceholders>[1],
): string {
  return resolvePlaceholders(html, buildContactPlaceholders(address, contact))
}
```

**Regression-Check**: Der bestehende Test `src/lib/services/__tests__/billing-document-service.test.ts` muss grün bleiben, insbesondere die Platzhalter-Assertions. Diese Test-Datei wurde in der Bestandsaufnahme als existierend dokumentiert.

**Neuer Unit-Test**: `src/lib/templates/__tests__/placeholder-resolver.test.ts` mit Tests für:
- Unknown placeholder → empty string
- Known placeholder → replaced
- Numeric value → stringified
- `null`/`undefined` → empty string
- Case-insensitivity: `{{KundenName}}` und `{{kundenname}}` treffen dieselbe Context-Key

#### 1.6 Dunning Interest Service

**New File**: `src/lib/services/dunning-interest-service.ts`

```typescript
/**
 * Calculates statutory late-payment interest (Verzugszinsen, BGB §288) in
 * Integer-Cents internally to avoid Float drift. Input and output are Float EUR
 * to stay compatible with the rest of the billing stack which uses Prisma.Float.
 */
export function calculateInterest(
  openAmount: number, // Float EUR
  daysOverdue: number, // Int
  annualRatePercent: number, // Float, e.g. 9
): number {
  if (openAmount <= 0 || daysOverdue <= 0 || annualRatePercent <= 0) return 0
  const amountCents = Math.round(openAmount * 100)
  const dailyRateCents = (amountCents * annualRatePercent) / 100 / 365
  const totalInterestCents = Math.round(dailyRateCents * daysOverdue)
  return totalInterestCents / 100
}

/** Looks up the fee for a given level from the settings array (0-indexed: level 1 → feeAmounts[0]). */
export function feeForLevel(feeAmounts: number[], level: number): number {
  if (level < 1 || level > feeAmounts.length) return 0
  return feeAmounts[level - 1] ?? 0
}
```

**Unit Tests**: `src/lib/services/__tests__/dunning-interest-service.test.ts`

- `calculateInterest(1000, 30, 9)` → dokumentiert den **tatsächlichen** Wert (Unit-Test-Oracle), nicht eine geschätzte 7,40. Der Test fixiert das berechnete Ergebnis, so dass spätere Änderungen an der Rundung auffallen.
- Edge cases: 0 EUR, 0 Tage, 0% Zinssatz, sehr große Beträge (Overflow?), sehr kleine Beträge (Abrundung auf 0).

#### 1.7 Reminder Settings Service

**New File**: `src/lib/services/reminder-settings-service.ts`

```typescript
import { Prisma } from "@prisma/client"
import { ValidationError, NotFoundError } from "@/lib/errors"

export type ReminderSettingsInput = {
  enabled?: boolean
  maxLevel?: number
  gracePeriodDays?: number[]
  feeAmounts?: number[]
  interestEnabled?: boolean
  interestRatePercent?: number
  feesEnabled?: boolean
}

export async function getSettings(prisma: Prisma.TransactionClient, tenantId: string) {
  const existing = await prisma.reminderSettings.findUnique({ where: { tenantId } })
  if (existing) return existing
  // Lazy-create with defaults so the UI never has to handle "no settings yet"
  return await prisma.reminderSettings.create({ data: { tenantId } })
}

export async function updateSettings(
  prisma: Prisma.TransactionClient,
  tenantId: string,
  input: ReminderSettingsInput,
) {
  validateInput(input)
  await getSettings(prisma, tenantId) // ensures row exists
  return await prisma.reminderSettings.update({ where: { tenantId }, data: input })
}

function validateInput(input: ReminderSettingsInput) {
  if (input.maxLevel !== undefined && (input.maxLevel < 1 || input.maxLevel > 4)) {
    throw new ValidationError("maxLevel muss zwischen 1 und 4 liegen")
  }
  if (input.interestRatePercent !== undefined && input.interestRatePercent < 0) {
    throw new ValidationError("interestRatePercent darf nicht negativ sein")
  }
  if (input.gracePeriodDays !== undefined && input.maxLevel !== undefined) {
    if (input.gracePeriodDays.length !== input.maxLevel) {
      throw new ValidationError(
        `gracePeriodDays muss genau ${input.maxLevel} Werte enthalten`,
      )
    }
  }
  if (input.feeAmounts !== undefined && input.maxLevel !== undefined) {
    if (input.feeAmounts.length !== input.maxLevel) {
      throw new ValidationError(
        `feeAmounts muss genau ${input.maxLevel} Werte enthalten`,
      )
    }
  }
}
```

**Unit Tests**: `src/lib/services/__tests__/reminder-settings-service.test.ts`

- `getSettings` erzeugt Default-Row bei erstem Aufruf.
- `updateSettings` mit inkonsistenten Array-Längen wirft `ValidationError`.
- `updateSettings` mit `maxLevel = 5` wirft `ValidationError`.

#### 1.8 Reminder Template Service

**New File**: `src/lib/services/reminder-template-service.ts`

```typescript
import { Prisma } from "@prisma/client"

export async function list(prisma: Prisma.TransactionClient, tenantId: string) {
  return await prisma.reminderTemplate.findMany({
    where: { tenantId },
    orderBy: [{ level: "asc" }, { name: "asc" }],
  })
}

export async function getById(prisma: Prisma.TransactionClient, tenantId: string, id: string) {
  const tpl = await prisma.reminderTemplate.findFirst({ where: { id, tenantId } })
  if (!tpl) throw new NotFoundError("ReminderTemplate", id)
  return tpl
}

export async function getDefaultForLevel(
  prisma: Prisma.TransactionClient, tenantId: string, level: number,
) {
  return await prisma.reminderTemplate.findFirst({
    where: { tenantId, level, isDefault: true },
  })
}

export async function create(/* ... */) { /* ... */ }
export async function update(/* ... */) { /* ... */ }
export async function remove(/* ... */) { /* ... */ }

/**
 * Seeds the three D9 default templates if none exist for this tenant.
 * Idempotent: skipped entirely if any template already exists.
 */
export async function seedDefaultsForTenant(
  prisma: Prisma.TransactionClient,
  tenantId: string,
): Promise<{ seeded: number }> {
  const existing = await prisma.reminderTemplate.count({ where: { tenantId } })
  if (existing > 0) return { seeded: 0 }

  const defaults = [
    {
      name: "Zahlungserinnerung (Stufe 1)",
      level: 1,
      headerText: "{{briefanrede}}, vielleicht ist es Ihrer Aufmerksamkeit entgangen: Folgende Rechnungen sind bei uns noch offen.",
      footerText: "Wir bitten um zeitnahen Ausgleich bis zum {{faelligAm}}. Sollte sich die Angelegenheit zwischenzeitlich erledigt haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.",
      emailSubject: "Zahlungserinnerung {{rechnungsnummer}}",
      emailBody: "{{briefanrede}},\n\nanbei erhalten Sie unsere Zahlungserinnerung.\n\nMit freundlichen Grüßen",
      isDefault: true,
    },
    {
      name: "Erste Mahnung (Stufe 2)",
      level: 2,
      headerText: "{{briefanrede}}, trotz unserer Zahlungserinnerung haben wir keinen Zahlungseingang feststellen können.",
      footerText: "Wir fordern Sie auf, den Gesamtbetrag von {{gesamtsumme}} bis zum {{faelligAm}} auf unser Konto zu überweisen.",
      emailSubject: "Mahnung {{rechnungsnummer}} — Stufe 2",
      emailBody: "{{briefanrede}},\n\nanbei erhalten Sie unsere Mahnung der Stufe 2.\n\nMit freundlichen Grüßen",
      isDefault: true,
    },
    {
      name: "Letzte Mahnung (Stufe 3)",
      level: 3,
      headerText: "{{briefanrede}}, trotz unserer wiederholten Aufforderungen haben Sie die folgenden Rechnungen nicht ausgeglichen.",
      footerText: "Dies ist unsere letzte Zahlungsaufforderung. Sollte bis zum {{faelligAm}} kein Zahlungseingang erfolgen, werden wir weitere rechtliche Schritte einleiten.",
      emailSubject: "Letzte Mahnung {{rechnungsnummer}} — Stufe 3",
      emailBody: "{{briefanrede}},\n\nanbei erhalten Sie unsere letzte Mahnung.\n\nMit freundlichen Grüßen",
      isDefault: true,
    },
  ]

  await prisma.reminderTemplate.createMany({
    data: defaults.map((d) => ({ ...d, tenantId })),
  })
  return { seeded: defaults.length }
}
```

**Unit Tests**: `src/lib/services/__tests__/reminder-template-service.test.ts`

- `seedDefaultsForTenant` ist idempotent (zweiter Aufruf → `seeded: 0`).
- `getDefaultForLevel(tenant, 1)` liefert nach Seed das Stufe-1-Template.

#### 1.9 Reminder Eligibility Service (D5)

**New File**: `src/lib/services/reminder-eligibility-service.ts`

Der Herzstück-Service: implementiert die D5-Filter-Logik deterministisch und liefert einen strukturierten Grund zurück, wenn eine Rechnung nicht mahnfähig ist.

```typescript
import { Prisma } from "@prisma/client"
import { computeDueDate } from "@/lib/services/billing-payment-service"
import { calculateInterest, feeForLevel } from "@/lib/services/dunning-interest-service"
import { getCurrentDunningLevel } from "@/lib/services/reminder-level-helper"
import { getSettings } from "@/lib/services/reminder-settings-service"

export type EligibilityReason =
  | "ok"
  | "no_payment_term"
  | "wrong_status"
  | "wrong_type"
  | "not_overdue_yet"
  | "in_grace_period"
  | "fully_paid"
  | "invoice_blocked"
  | "customer_blocked"
  | "in_discount_period"
  | "max_level_reached" // precision adjustment: distinct from fully_paid
  | "dunning_disabled"

export type EligibleInvoice = {
  billingDocumentId: string
  invoiceNumber: string
  invoiceDate: Date
  dueDate: Date
  daysOverdue: number
  openAmount: number
  currentLevel: number
  targetLevel: number
  interestAmount: number
  feeAmount: number
  reason: EligibilityReason
}

export type EligibleCustomerGroup = {
  customerAddressId: string
  customerName: string
  customerEmail: string | null
  groupTargetLevel: number
  invoices: EligibleInvoice[]
  totalOpenAmount: number
  totalInterest: number
  totalFees: number
  totalDue: number
}

export async function listEligibleInvoices(
  prisma: Prisma.TransactionClient,
  tenantId: string,
): Promise<EligibleCustomerGroup[]> {
  const settings = await getSettings(prisma, tenantId)
  if (!settings.enabled) return []

  // Load all potentially relevant invoices (type=INVOICE, status ∈ printed/forwarded)
  // with payments, credit notes, address, in one query.
  const candidates = await prisma.billingDocument.findMany({
    where: {
      tenantId,
      type: "INVOICE",
      status: { in: ["PRINTED", "FORWARDED", "PARTIALLY_FORWARDED"] },
    },
    include: {
      payments: true,
      childDocuments: true, // credit notes for openAmount reduction
      address: true,
    },
  })

  const now = new Date()
  const gracePeriodFirstLevel = settings.gracePeriodDays[0] ?? 7
  const groups = new Map<string, EligibleCustomerGroup>()

  for (const doc of candidates) {
    const reason = await evaluateInvoice(prisma, doc, settings, now, gracePeriodFirstLevel)
    if (reason.reason !== "ok") continue
    // Group by customer
    const addressId = doc.addressId
    if (!addressId) continue
    let group = groups.get(addressId)
    if (!group) {
      group = {
        customerAddressId: addressId,
        customerName: doc.address?.company ?? "(unbenannt)",
        customerEmail: doc.address?.email ?? null,
        groupTargetLevel: reason.targetLevel,
        invoices: [],
        totalOpenAmount: 0,
        totalInterest: 0,
        totalFees: 0,
        totalDue: 0,
      }
      groups.set(addressId, group)
    }
    group.invoices.push(reason)
    group.totalOpenAmount += reason.openAmount
    group.totalInterest += reason.interestAmount
    if (reason.targetLevel > group.groupTargetLevel) {
      group.groupTargetLevel = reason.targetLevel
    }
  }

  // Fee is per reminder, not per invoice — apply once per group using groupTargetLevel
  for (const group of groups.values()) {
    group.totalFees = feeForLevel(settings.feeAmounts, group.groupTargetLevel)
    group.totalDue = group.totalOpenAmount + group.totalInterest + group.totalFees
  }

  return Array.from(groups.values()).sort((a, b) => a.customerName.localeCompare(b.customerName))
}

async function evaluateInvoice(
  prisma: Prisma.TransactionClient,
  doc: any,
  settings: any,
  now: Date,
  gracePeriodFirstLevel: number,
): Promise<EligibleInvoice & { reason: EligibilityReason }> {
  // D5 filter chain — order matters for precise reason reporting.
  if (doc.paymentTermDays === null) return makeIneligible(doc, "no_payment_term")
  if (doc.type !== "INVOICE") return makeIneligible(doc, "wrong_type")
  if (doc.dunningBlocked) return makeIneligible(doc, "invoice_blocked")
  if (doc.address?.dunningBlocked) return makeIneligible(doc, "customer_blocked")

  const dueDate = computeDueDate(doc.documentDate, doc.paymentTermDays)
  if (!dueDate) return makeIneligible(doc, "no_payment_term")

  const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / 86400000)
  if (daysOverdue < gracePeriodFirstLevel) return makeIneligible(doc, "in_grace_period")

  // Open amount calculation — live, matching billing-payment-service.enrichOpenItem
  const creditNoteReduction = (doc.childDocuments ?? []).reduce(
    (sum: number, cn: any) => sum + cn.totalGross, 0,
  )
  const effectiveTotalGross = doc.totalGross - creditNoteReduction
  const paidAmount = doc.payments
    .filter((p: any) => p.status === "ACTIVE")
    .reduce((sum: number, p: any) => sum + p.amount, 0)
  const openAmount = Math.max(0, effectiveTotalGross - paidAmount)
  if (openAmount <= 0) return makeIneligible(doc, "fully_paid")

  // Skonto-Tier-2 exclusion
  if (doc.discountDays2 !== null && doc.discountDays2 !== undefined) {
    const skontoDeadline = new Date(doc.documentDate)
    skontoDeadline.setDate(skontoDeadline.getDate() + doc.discountDays2)
    if (skontoDeadline > now) return makeIneligible(doc, "in_discount_period")
  }

  // Compute target level: currentLevel + 1, capped at maxLevel
  const currentLevel = await getCurrentDunningLevel(prisma, doc.id)
  const targetLevel = Math.min(currentLevel + 1, settings.maxLevel)

  // Once currentLevel == maxLevel, the invoice drops out of the proposal
  // under its own dedicated reason `max_level_reached` — distinct from
  // `fully_paid` so the UI can show these separately ("Maximal gemahnt —
  // keine weitere Stufe möglich" group below the regular proposal groups).
  if (currentLevel >= settings.maxLevel) return makeIneligible(doc, "max_level_reached")

  const interestAmount = settings.interestEnabled
    ? calculateInterest(openAmount, daysOverdue, settings.interestRatePercent)
    : 0

  return {
    billingDocumentId: doc.id,
    invoiceNumber: doc.number,
    invoiceDate: doc.documentDate,
    dueDate,
    daysOverdue,
    openAmount,
    currentLevel,
    targetLevel,
    interestAmount,
    feeAmount: 0, // fee is applied per-reminder, not per-invoice
    reason: "ok",
  }
}

function makeIneligible(doc: any, reason: EligibilityReason) {
  return {
    billingDocumentId: doc.id,
    invoiceNumber: doc.number,
    invoiceDate: doc.documentDate,
    dueDate: doc.documentDate,
    daysOverdue: 0,
    openAmount: 0,
    currentLevel: 0,
    targetLevel: 0,
    interestAmount: 0,
    feeAmount: 0,
    reason,
  }
}
```

**Wichtig**: Der Service exportiert auch `evaluateInvoice` als Standalone-Funktion, damit der D5-Filter-Matrix-Test pro Case isoliert prüfen kann.

#### 1.10 Reminder Level Helper

**New File**: `src/lib/services/reminder-level-helper.ts`

```typescript
import { Prisma } from "@prisma/client"

/**
 * Returns the current dunning level of an invoice, derived from the highest
 * levelAtReminder across all ReminderItems whose Reminder.status is SENT.
 * Cancelled reminders don't count.
 */
export async function getCurrentDunningLevel(
  prisma: Prisma.TransactionClient,
  billingDocumentId: string,
): Promise<number> {
  const result = await prisma.reminderItem.findFirst({
    where: {
      billingDocumentId,
      reminder: { status: "SENT" },
    },
    orderBy: { levelAtReminder: "desc" },
    select: { levelAtReminder: true },
  })
  return result?.levelAtReminder ?? 0
}

export type ReminderStatusInfo =
  | { status: "never" }
  | { status: "sent"; level: number; sentAt: Date }

export async function getReminderStatus(
  prisma: Prisma.TransactionClient,
  billingDocumentId: string,
): Promise<ReminderStatusInfo> {
  const latest = await prisma.reminderItem.findFirst({
    where: {
      billingDocumentId,
      reminder: { status: "SENT" },
    },
    include: { reminder: true },
    orderBy: { levelAtReminder: "desc" },
  })
  if (!latest || !latest.reminder.sentAt) return { status: "never" }
  return {
    status: "sent",
    level: latest.levelAtReminder,
    sentAt: latest.reminder.sentAt,
  }
}
```

**Unit Tests**: `src/lib/services/__tests__/reminder-level-helper.test.ts`

- Rechnung ohne ReminderItems → level 0, status `never`.
- Rechnung mit einem SENT-Reminder auf Level 2 → level 2.
- Rechnung mit einem SENT-Reminder auf Level 2 und einem CANCELLED-Reminder auf Level 3 → level 2 (cancelled zählt nicht).

#### 1.11 Reminder Repository & Service

**New Files**:
- `src/lib/services/reminder-repository.ts` — Prisma-Wrapper (`create`, `createWithItems`, `findById`, `findByIdWithItems`, `list`, `listByStatus`, `updateStatus`, `updateSentFields`).
- `src/lib/services/reminder-service.ts` — Business-Logic-Wrapper: `createRun(selection)`, `cancelReminder(id)`, `markSent(id, sendMethod, storagePath)`.

`createRun` bekommt als Input die gewählten Gruppen + pro Gruppe die ausgewählten Rechnungs-IDs. Es bildet jeden ausgewählten Kunden in **einen** Reminder ab (Sammelmahnung). Innerhalb einer einzigen `$transaction`:

1. Load settings + templates.
2. Für jeden Kunden:
   - Rufe `listEligibleInvoices` erneut auf und snapshot pro gewählter Rechnung aus der Live-Antwort (never trust client-supplied amounts).
   - Generiere Nummer via `getNextNumber(tx, tenantId, "dunning")` → `MA-{n}`.
   - Resolve Template via `getDefaultForLevel(tenantId, groupTargetLevel)`, rendere `headerText`/`footerText` mit dem neuen `resolvePlaceholders`.
   - Lege `Reminder` mit `status = DRAFT` an + N `ReminderItem`s.
3. Retourniere die erstellten `Reminder`-IDs.

**Idempotenz-Schutz gegen Race** (Phase 4-Test): Snapshot-Vergleich beim zweiten parallelen Call wird durch `@@unique([tenantId, number])` gedeckt — wenn beide Calls in derselben Sekunde `getNextNumber` rufen, liefert der atomare Upsert-Increment unterschiedliche Nummern. Problem wäre eher doppelte ReminderItems für dieselbe Rechnung: Phase 4 testet das via Unique-Index auf `(tenantId, billingDocumentId)` in `reminder_items` **nur für SENT-Reminders**. Lösung: statt Unique-Index auf DB-Ebene prüfen wir in `createRun`: wenn für eine `billingDocumentId` bereits ein DRAFT-Reminder existiert, wird diese Rechnung übersprungen (mit Log-Warning). So verhindert das zweite parallele Call kein Doppel-Insert.

**Unit Tests**: `src/lib/services/__tests__/reminder-service.test.ts`

- `createRun` mit leerer Auswahl → leeres Ergebnis.
- `createRun` mit Auswahl → Reminder + Items angelegt, Status `DRAFT`, Number aus Sequence.
- `createRun` mit bereits im DRAFT existierender Rechnung → diese Rechnung wird übersprungen.
- `cancelReminder` setzt Status auf CANCELLED, schreibt aber keine Audit-Logs direkt (Side-Effect im Router).

### Success Criteria: Phase 1

#### Automated Verification:
- [x] Migration wendet sauber an: `pnpm db:reset`
- [x] Prisma-Client generiert: `pnpm db:generate`
- [x] Type-Check grün: `pnpm typecheck` (only pre-existing scanner-terminal TS2589 error remains)
- [x] Alle Unit-Tests grün: `pnpm test src/lib/services/__tests__/reminder-*.test.ts src/lib/services/__tests__/dunning-*.test.ts src/lib/templates/__tests__/placeholder-resolver.test.ts` (48/48 pass)
- [x] Bestehende billing-document-service-Tests grün: `pnpm test src/lib/services/__tests__/billing-document-service.test.ts` (25/25 pass; einvoice-test mock extended with new dunning fields)
- [x] Lint grün: `pnpm lint` (only one pre-existing error in `src/trpc/platform/__tests__/helpers.ts` remains)
- [x] `permissionIdByKey("dunning.view")` ist in Vitest-Snapshot stabil (snapshot-test in `src/lib/auth/__tests__/permission-catalog.test.ts`, falls nicht vorhanden → anlegen) — file created with all 5 dunning UUIDs locked

#### Manual Verification:
- [ ] Via `pnpm db:studio`: Tabellen `reminders`, `reminder_items`, `reminder_templates`, `reminder_settings` existieren.
- [ ] Via `psql`: `crm_addresses.dunning_blocked` und `billing_documents.dunning_blocked` existieren.
- [ ] Manueller Service-Call (z.B. Vitest-Script oder temporärer API-Endpunkt): `seedDefaultsForTenant` für einen Test-Tenant erzeugt 3 Templates, zweiter Aufruf erzeugt 0 weitere.
- [ ] `resolvePlaceholders("{{briefanrede}}", { briefanrede: "Sehr geehrter Herr Müller" })` liefert `"Sehr geehrter Herr Müller"`.
- [ ] Bestehende Billing-Dokumente werden unverändert gerendert (Smoke-Test: ein beliebiges Dokument öffnen und prüfen dass Header/Footer gleich aussehen wie vorher).

**Implementation Note**: Nach Abschluss dieser Phase und erfolgreicher automatischer Verifikation bitte hier pausieren und auf manuelle Bestätigung warten, bevor Phase 2 startet.

---

## Phase 2: tRPC-Router + PDF-Generator + Cron + E-Mail

### Overview

Backend ist vollständig via Postman/tRPC-Client spielbar. Reminder können erstellt werden, PDFs werden generiert und in Supabase Storage abgelegt, E-Mails werden (mit Mock oder echtem SMTP) versendet, Cron erzeugt Notifications.

### Changes Required

#### 2.1 tRPC Router: `reminders.ts`

**New File**: `src/trpc/routers/billing/reminders.ts`

Namespace-Anker: Das Router-File liegt unter `billing/` parallel zu `billingDocuments`, `billingPayments` etc. — **nicht** unter `invoices/` wie das SEPA-Feature, weil Mahnwesen Ausgangsrechnungen betrifft (Verkauf, nicht Einkauf).

Endpoints:

```typescript
export const remindersRouter = createTRPCRouter({
  // Eligibility + Proposal
  getEligibleProposal: tenantProcedure
    .use(requirePermission(permissionIdByKey("dunning.view")!))
    .query(async ({ ctx }) => {
      return await reminderEligibilityService.listEligibleInvoices(ctx.prisma, ctx.tenantId!)
    }),

  // Settings
  getSettings: tenantProcedure
    .use(requirePermission(permissionIdByKey("dunning.view")!))
    .query(async ({ ctx }) => await reminderSettingsService.getSettings(ctx.prisma, ctx.tenantId!)),

  updateSettings: tenantProcedure
    .use(requirePermission(permissionIdByKey("dunning.settings")!))
    .input(settingsUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await reminderSettingsService.updateSettings(ctx.prisma, ctx.tenantId!, input)
      if (input.enabled === true) {
        // Seed defaults on first activation — idempotent
        await reminderTemplateService.seedDefaultsForTenant(ctx.prisma, ctx.tenantId!)
      }
      return result
    }),

  // Templates
  listTemplates:   /* ... */,
  getTemplate:     /* ... */,
  createTemplate:  /* ... */,
  updateTemplate:  /* ... */,
  deleteTemplate:  /* ... */,

  // Runs
  createRun: tenantProcedure
    .use(requirePermission(permissionIdByKey("dunning.create")!))
    .input(z.object({
      groups: z.array(z.object({
        customerAddressId: z.string().uuid(),
        billingDocumentIds: z.array(z.string().uuid()).min(1),
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return await reminderService.createRun(ctx.prisma, ctx.tenantId!, input, ctx.user!.id)
    }),

  listRuns: tenantProcedure
    .use(requirePermission(permissionIdByKey("dunning.view")!))
    .input(z.object({ status: z.enum(["DRAFT","SENT","CANCELLED","ALL"]).optional() }))
    .query(/* ... */),

  getRun: tenantProcedure
    .use(requirePermission(permissionIdByKey("dunning.view")!))
    .input(z.object({ id: z.string().uuid() }))
    .query(/* ... */),

  // Sending
  send: tenantProcedure
    .use(requirePermission(permissionIdByKey("dunning.send")!))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return await reminderService.sendReminder(ctx.prisma, ctx.tenantId!, input.id, ctx.user!.id)
    }),

  markSentManually: tenantProcedure
    .use(requirePermission(permissionIdByKey("dunning.send")!))
    .input(z.object({ id: z.string().uuid(), method: z.enum(["letter","manual"]) }))
    .mutation(async ({ ctx, input }) => {
      return await reminderService.markSentManually(ctx.prisma, ctx.tenantId!, input.id, input.method, ctx.user!.id)
    }),

  cancel: tenantProcedure
    .use(requirePermission(permissionIdByKey("dunning.cancel")!))
    .input(z.object({ id: z.string().uuid(), reason: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      return await reminderService.cancelReminder(ctx.prisma, ctx.tenantId!, input.id, input.reason, ctx.user!.id)
    }),

  // Blocks
  setInvoiceBlock: tenantProcedure
    .use(requirePermission(permissionIdByKey("dunning.cancel")!))
    .input(z.object({
      billingDocumentId: z.string().uuid(),
      blocked: z.boolean(),
      reason: z.string().max(500).optional(),
    }))
    .mutation(/* updates billing_documents.dunning_blocked */),

  setCustomerBlock: tenantProcedure
    .use(requirePermission(permissionIdByKey("dunning.cancel")!))
    .input(z.object({
      customerAddressId: z.string().uuid(),
      blocked: z.boolean(),
      reason: z.string().max(500).optional(),
    }))
    .mutation(/* updates crm_addresses.dunning_blocked */),
})
```

**File**: `src/trpc/routers/billing/index.ts`

Neues Sub-Router registrieren:

```typescript
export const billingRouter = createTRPCRouter({
  documents: billingDocumentsRouter,
  documentTemplates: billingDocumentTemplatesRouter,
  tenantConfig: billingTenantConfigRouter,
  serviceCases: billingServiceCasesRouter,
  payments: billingPaymentsRouter,
  priceLists: billingPriceListsRouter,
  recurringInvoices: billingRecurringInvoicesRouter,
  reminders: remindersRouter,  // NEU
})
```

Damit erreichbar als `trpc.billing.reminders.getEligibleProposal.useQuery()`.

#### 2.2 Sende-Flow im Reminder Service

**File**: `src/lib/services/reminder-service.ts`

`sendReminder(prisma, tenantId, reminderId, userId)`:

1. Lade Reminder + Items + CustomerAddress.
2. Guard: Status muss `DRAFT` sein, sonst `ValidationError`.
3. **Zahlt-Check (Safety-Net)**: Für jedes Item rufe erneut `enrichOpenItem` o.Ä. auf. Wenn `openAmount <= 0` (Rechnung ist zwischen Proposal und Send vollständig bezahlt worden), setze Item auf `open_amount_at_reminder = 0` und filtere es beim PDF aus, aber ziehe es **nicht** vom Total ab (die Total-Snapshots bleiben wie im DRAFT). **Einfachere Alternative**: Wenn *alle* Items zwischenzeitlich bezahlt sind, brich den Versand ab mit `ValidationError("Alle enthaltenen Rechnungen sind mittlerweile bezahlt")`. **Wir gehen den einfachen Weg.**
4. Generiere PDF via `reminderPdfService.generateAndStorePdf(reminder, items, address, settings)` → liefert Storage-Path `reminders/{tenantId}/{reminderId}.pdf`.
5. Sende E-Mail via `emailSendService.sendReminder(...)` (neue Methode, analog zur bestehenden `send()`-Methode in `email-send-service.ts`). Wenn Versand fehlschlägt → wirf Fehler, Status bleibt `DRAFT`, PDF-Path wird persistiert.
6. Update: `status=SENT, sentAt=now(), sentById=userId, sendMethod="email", pdfStoragePath`.
7. Lege `CrmCorrespondence`-Eintrag an via `crmCorrespondenceService.create(...)` mit Feldern aus D11.
8. Fire-and-forget: Audit-Log (hard constraint).

**Wichtig**: Die Schritte 4–7 sind **nicht** in einer einzigen DB-Transaktion, weil PDF-Upload und E-Mail externe I/O sind. Stattdessen:
- PDF-Upload zuerst (idempotent über Storage-Path).
- E-Mail-Versand (mit EmailSendLog, der Retry-Logik enthält).
- Erst dann DB-Transaktion: Reminder-Status + CrmCorrespondence atomar.

Wenn E-Mail-Versand fehlschlägt, bleibt der Reminder in `DRAFT` und der Buchhalter kann retryen. PDF wird beim Retry nicht neu generiert, wenn der Path bereits existiert.

#### 2.3 PDF Generator

**New File**: `src/lib/pdf/reminder-pdf.tsx`

Analog zu `src/lib/pdf/billing-document-pdf.tsx` (Entry-Point). Enthält:

- `RichTextPdf` für `headerText` (bereits gerenderter Text mit Platzhaltern aufgelöst)
- `ReminderItemTablePdf` — neue Komponente: Positionstabelle mit Spalten Rechnungsnummer, Rechnungsdatum, Fälligkeit, Offener Betrag, Tage überfällig, Zinsen, (Gebühr nur einmal unten)
- `TotalsSummaryPdf` o.Ä. — wiederverwenden wenn möglich, sonst neue Summen-Komponente mit Zeilen „Offener Betrag", „Verzugszinsen", „Mahngebühr", „Gesamtsumme"
- `RichTextPdf` für `footerText`
- `FusszeilePdf` wiederverwenden (Absender aus `BillingTenantConfig`)

**New File**: `src/lib/services/reminder-pdf-service.ts`

```typescript
import { renderToStream } from "@react-pdf/renderer"
import { uploadPdf, getSignedReadUrl } from "@/lib/pdf/pdf-storage"

export async function generateAndStorePdf(
  prisma: Prisma.TransactionClient,
  tenantId: string,
  reminderId: string,
): Promise<string> {
  const reminder = await prisma.reminder.findFirstOrThrow({
    where: { id: reminderId, tenantId },
    include: { items: true, customerAddress: true },
  })
  const tenantConfig = await prisma.billingTenantConfig.findUnique({ where: { tenantId } })
  const pdfElement = <ReminderPdf reminder={reminder} tenantConfig={tenantConfig} />
  const stream = await renderToStream(pdfElement)
  const buffer = await streamToBuffer(stream)
  const path = `reminders/${tenantId}/${reminderId}.pdf`
  await uploadPdf(path, buffer)
  return path
}

export async function getSignedDownloadUrl(path: string): Promise<string> {
  return await getSignedReadUrl(path, 60)
}
```

Bucket: `documents` (vorhandener, gleich wie Billing).

#### 2.4 E-Mail-Versand erweitern

**File**: `src/lib/services/email-send-service.ts`

Bestehender Service wird um eine `sendReminder(...)`-Methode erweitert. Alternative: eine generische `sendWithAttachment(...)`-Methode extrahieren und von beiden Pfaden nutzen. **Wir wählen die generische Variante**, um die Zwei-Systeme-Lage nicht weiter zu zementieren:

```typescript
export async function sendGenericEmail(
  prisma: Prisma.TransactionClient,
  tenantId: string,
  input: {
    toEmail: string
    subject: string
    bodyHtml: string
    attachmentName: string
    attachmentBuffer: Buffer
    attachmentContentType: string
    referenceType: "billing_document" | "reminder"
    referenceId: string
    sentByUserId: string
  },
): Promise<{ logId: string }> {
  // Load SMTP config, send via nodemailer, create EmailSendLog row (adapt existing code path)
}
```

Der bestehende `send()`-Flow wird refactored, um `sendGenericEmail` aufzurufen. `EmailSendLog.documentType` wird um `"reminder"` als String-Wert erweitert (das Feld ist ein String, kein Enum — siehe Bestandsaufnahme). Falls `documentType` ein Enum ist (per grep zu verifizieren in Phase 2), dann eigenes Feld `EmailSendLog.referenceType` oder ähnlich. **Einfacher Fallback wenn Enum-Erweiterung heikel**: eigenes `ReminderEmailSendLog`-Modell analog zu `EmailSendLog`. **Default: wir nutzen das bestehende EmailSendLog**, wenn `documentType` ein String ist.

**Retry-Verhalten**: Der bestehende Retry-Cron (`email-retry`, alle 5min) bleibt unverändert — er findet alle `EmailSendLog`-Rows mit `status="retrying"` und versendet neu. Wenn eine Reminder-E-Mail in Retry geht, bleibt der Reminder selbst in DB auf `status=SENT` (weil der DB-Write im `send`-Flow erst **nach** erfolgreichem E-Mail-Trigger passiert). Das ist ein Trade-off: wenn das SMTP einmal hängt und retry fehlschlägt, merkt das niemand am Reminder-Status. **Kompromiss**: Reminder erst nach erfolgreichem ersten Versandversuch auf SENT setzen; `EmailSendLog.status=retrying` setzt der `retry-cron`, der Reminder bleibt SENT. Der Buchhalter sieht im `EmailSendLog`-Tab, dass die E-Mail in retry ist. Das ist konsistent mit dem Billing-Email-Verhalten.

#### 2.5 Cron Route: `dunning-candidates`

**New File**: `src/app/api/cron/dunning-candidates/route.ts`

```typescript
import { NextResponse, type NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { reminderEligibilityService } from "@/lib/services/reminder-eligibility-service"

export async function GET(request: NextRequest) {
  // CRON_SECRET check (duplicated block, matching other cron routes)
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Find all tenants with dunning enabled
  const enabledTenants = await prisma.reminderSettings.findMany({
    where: { enabled: true },
    select: { tenantId: true },
  })

  let tenantsNotified = 0
  let totalCustomersAffected = 0

  for (const { tenantId } of enabledTenants) {
    const groups = await reminderEligibilityService.listEligibleInvoices(prisma, tenantId)
    if (groups.length === 0) continue

    // Find admin users with dunning.view permission for this tenant
    const recipients = await findDunningRecipients(prisma, tenantId)
    if (recipients.length === 0) continue

    // One summary notification per recipient (NOT one per customer — too noisy)
    const title = "Mahnfähige Rechnungen"
    const message = `${groups.length} Kunden haben überfällige Rechnungen, die für eine Mahnung bereit sind.`
    const link = "/orders/dunning"

    await prisma.notification.createMany({
      data: recipients.map((userId) => ({
        tenantId, userId, type: "reminders", title, message, link,
      })),
    })

    tenantsNotified++
    totalCustomersAffected += groups.length
  }

  return NextResponse.json({
    success: true,
    tenantsNotified,
    totalCustomersAffected,
  })
}

async function findDunningRecipients(
  prisma: Prisma.TransactionClient, tenantId: string,
): Promise<string[]> {
  // Query users with any role that includes dunning.view permission.
  // Uses the existing role_permissions join via permission_id.
  const dunningViewPermissionId = permissionIdByKey("dunning.view")!
  const users = await prisma.user.findMany({
    where: {
      userTenants: { some: { tenantId } },
      // Role lookup via role_permissions — exact query depends on schema.
      // Fallback: fetch all users in tenant, filter by `hasAnyPermission(user, [dunningViewId])`.
    },
    select: { id: true },
  })
  return users.map((u) => u.id)
}
```

**Schedule**: Eintrag in `vercel.json`:

```json
{ "path": "/api/cron/dunning-candidates", "schedule": "0 5 * * *" }
```

Täglich 05:00 UTC — nach `recurring-invoices` (04:00) und `platform-subscription-autofinalize` (04:15).

**Audit**: Kein `dunning_audit_log` in dieser Phase. Der Cron ist idempotent — zwei Notifications pro Tag wären nervig, daher: Dedupe-Check im Cron, dass für `(tenantId, userId, type=reminders, link=/orders/dunning)` nicht schon heute eine Notification existiert. Einfachster Mechanismus: `prisma.notification.findFirst({ where: { ..., createdAt: { gte: startOfDay } } })` vor Create.

#### 2.6 Integration-Tests für Router

**New File**: `src/trpc/routers/__tests__/reminders-router.test.ts`

Pattern analog zu `billingDocuments-router.test.ts`. Testet:
- `getEligibleProposal` ohne aktives Mahnwesen → leeres Array
- `getEligibleProposal` mit aktivem Mahnwesen + mahnfähiger Rechnung → enthält diese
- `createRun` → erzeugt Reminder + Items, Nummer aus Sequence
- `send` mit gemocktem SMTP und PDF-Service → setzt Status SENT, erzeugt `CrmCorrespondence`-Row
- `cancel` nach SENT → Status CANCELLED, zweiter Correspondence-Eintrag (note)
- Permission-Checks: User ohne `dunning.view` → FORBIDDEN auf `getEligibleProposal`; ohne `dunning.send` auf `send`

Mocking: Der Email-Service wird via `vi.mock("@/lib/services/email-send-service")` gemockt. Der PDF-Service wird gemockt, damit kein echter Storage-Upload passiert.

### Success Criteria: Phase 2

#### Automated Verification:
- [ ] Type-Check grün: `pnpm typecheck`
- [ ] Router-Tests grün: `pnpm test src/trpc/routers/__tests__/reminders-router.test.ts`
- [ ] Bestehende Billing-Router-Tests grün: `pnpm test src/trpc/routers/__tests__/billingDocuments-router.test.ts src/trpc/routers/__tests__/billingPayments-router.test.ts`
- [ ] Cron-Route-Test grün: `pnpm test src/app/api/cron/dunning-candidates/__tests__/route.test.ts` (neu, Pattern aus calculate-days)
- [ ] Lint grün: `pnpm lint`

#### Manual Verification:
- [ ] Via tRPC-DevTools oder Postman: `trpc.billing.reminders.updateSettings({ enabled: true })` → Settings aktiv, 3 Default-Templates existieren.
- [ ] Rechnung im Test-Tenant manuell überfällig machen (documentDate in der Vergangenheit, paymentTermDays=7) → `getEligibleProposal` enthält die Kundengruppe.
- [ ] `createRun` mit dieser Gruppe → Reminder mit Nummer `MA-1` (oder passend zur Sequence) existiert in DB mit Status DRAFT.
- [ ] `send` → PDF unter `reminders/{tenantId}/{reminderId}.pdf` existiert (Supabase Studio prüfen), Reminder hat Status SENT, `sentAt` gesetzt.
- [ ] Supabase Signed URL öffnen → PDF ist lesbar, enthält Rechnungsliste, Summen, Header/Footer mit aufgelösten Platzhaltern.
- [ ] `CrmCorrespondence`-Row für den Kunden existiert mit `subject="Mahnung MA-1 — Stufe 1"`.
- [ ] Cron-Route via `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/dunning-candidates` → JSON mit `tenantsNotified ≥ 1` und Notifications für Admin-User.

**Implementation Note**: Nach Abschluss dieser Phase auf manuelle Bestätigung warten.

---

## Phase 3: UI

### Overview

Buchhalter kann den vollständigen D7-Workflow durchklicken. Eine Seite mit 4 Tabs, zwei neue Widgets in bestehenden Detail-Seiten, Sidebar-Eintrag, i18n.

### Changes Required

#### 3.1 Sidebar-Eintrag

**File**: `src/components/layout/sidebar/sidebar-nav-config.ts` lines 340-388

Im `billingSection.items`-Array zwischen `billingRecurringInvoices` und `billingTemplates` einfügen:

```typescript
{
  titleKey: 'billingDunning',
  href: '/orders/dunning',
  icon: AlertCircle, // oder MailWarning / BellRing — Auswahl in Phase 3 mit UX
  module: 'billing',
  permissions: ['dunning.view'],
},
```

Icon-Import aus `lucide-react` oben in der Datei ergänzen.

#### 3.2 Hauptseite mit Tabs

**New File**: `src/app/[locale]/(dashboard)/orders/dunning/page.tsx`

```tsx
import { DunningPage } from "@/components/billing/dunning/dunning-page"

export default function Page() {
  return <DunningPage />
}
```

**New File**: `src/components/billing/dunning/dunning-page.tsx`

Enthält `Tabs` (shadcn) mit vier `TabsContent`:

```tsx
"use client"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { DunningProposalTab } from "./dunning-proposal-tab"
import { DunningRunsTab } from "./dunning-runs-tab"
import { DunningTemplatesTab } from "./dunning-templates-tab"
import { DunningSettingsTab } from "./dunning-settings-tab"
import { DunningPreFlightBanner } from "./dunning-pre-flight-banner"
import { useTranslations } from "next-intl"
import { trpc } from "@/trpc/client"

export function DunningPage() {
  const t = useTranslations("billingDunning")
  const { data: settings } = trpc.billing.reminders.getSettings.useQuery()
  const { data: templates } = trpc.billing.reminders.listTemplates.useQuery()

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <DunningPreFlightBanner settings={settings} templates={templates} />
      <Tabs defaultValue="proposal">
        <TabsList>
          <TabsTrigger value="proposal">{t("tabs.proposal")}</TabsTrigger>
          <TabsTrigger value="runs">{t("tabs.runs")}</TabsTrigger>
          <TabsTrigger value="templates">{t("tabs.templates")}</TabsTrigger>
          <TabsTrigger value="settings">{t("tabs.settings")}</TabsTrigger>
        </TabsList>
        <TabsContent value="proposal"><DunningProposalTab /></TabsContent>
        <TabsContent value="runs"><DunningRunsTab /></TabsContent>
        <TabsContent value="templates"><DunningTemplatesTab /></TabsContent>
        <TabsContent value="settings"><DunningSettingsTab /></TabsContent>
      </Tabs>
    </div>
  )
}
```

#### 3.3 Pre-Flight-Banner

**New File**: `src/components/billing/dunning/dunning-pre-flight-banner.tsx`

```tsx
export function DunningPreFlightBanner({ settings, templates }) {
  const t = useTranslations("billingDunning")
  if (!settings) return null
  if (!settings.enabled) {
    return <Alert variant="warning">{t("preFlight.disabled")} <Link href="#settings">{t("preFlight.goToSettings")}</Link></Alert>
  }
  if (!templates || templates.length === 0) {
    return <Alert variant="warning">{t("preFlight.noTemplates")} <Link href="#templates">{t("preFlight.goToTemplates")}</Link></Alert>
  }
  return null
}
```

#### 3.4 Proposal Tab

**New File**: `src/components/billing/dunning/dunning-proposal-tab.tsx`

Enthält:
- `useQuery(trpc.billing.reminders.getEligibleProposal)`
- Pro Kundengruppe einen `Collapsible` mit:
  - Kopfzeile: Checkbox "Mahnung erstellen" (Default an), Kundenname, Zielstufe-Badge, Anzahl Rechnungen, Summe offen, Summe Zinsen, Summe Gebühr, Gesamtsumme
  - Ausgeklappter Inhalt: Tabelle mit Checkbox pro Rechnung (Default an), Spalten Belegnr., Belegdatum, Fälligkeit, offener Betrag, Tage überfällig, Zinsen (dieser Rechnung)
- State: `Set<string>` für ausgewählte Gruppen + `Map<customerAddressId, Set<billingDocumentId>>` für Per-Rechnungs-Auswahl (Pattern aus `document-print-dialog.tsx:58-79`)
- **Dynamic Sum Recalc**: Wenn einzelne Checkboxen abgewählt werden, die Gruppensumme im State neu berechnen (clientseitig — re-queryen ist zu teuer)
- Primary-Button: "Mahnungen erstellen" → `useMutation(trpc.billing.reminders.createRun)` → bei Erfolg → Tab-Wechsel zu "Runs" + Toast

#### 3.5 Runs Tab

**New File**: `src/components/billing/dunning/dunning-runs-tab.tsx`

- Filter: Status-Select (`all/draft/sent/cancelled`)
- Tabelle mit Spalten: Nummer, Kundenname, Stufe, Status-Badge, Erstellt am, Versendet am, Gesamtbetrag
- Row-Click → `DunningReminderDetailSheet` (Sheet-Komponente analog zum bestehenden Billing-Detail-Sheet)

**New File**: `src/components/billing/dunning/dunning-reminder-detail-sheet.tsx`

- Lädt Reminder + Items via `trpc.billing.reminders.getRun`
- Zeigt: Kopfdaten, Positionstabelle, Summen, PDF-Preview (wenn SENT → signed URL über neuen Endpoint `getPdfDownloadUrl`)
- Action-Buttons je nach Status:
  - DRAFT: "Versenden" (Confirm-Dialog), "Als Brief markieren", "Bearbeiten" (Header/Footer-Text), "Löschen" (= setzt DRAFT auf CANCELLED oder echtes Delete, Entscheidung: echtes Delete weil nichts versendet)
  - SENT: "Stornieren" (Confirm-Dialog)
  - CANCELLED: read-only

#### 3.6 Templates Tab

**New File**: `src/components/billing/dunning/dunning-templates-tab.tsx`

Analog zum bestehenden Billing-Briefkonfigurator (`src/components/billing/template-list.tsx` + `template-form-sheet.tsx`). CRUD-Formular mit `RichTextEditor` für `headerText`, `footerText`, `emailBody`, plain-input für `name`, `emailSubject`, `level`, Checkbox `isDefault`. Button "Defaults erzeugen" (nur sichtbar wenn `templates.length === 0`) ruft `seedDefaultsForTenant` über einen neuen Endpoint (Phase 2 ergänzen).

#### 3.7 Settings Tab

**New File**: `src/components/billing/dunning/dunning-settings-tab.tsx`

Formular mit:
- Switch "Mahnwesen aktiv"
- Slider/Input "Max. Mahnstufen" (1-4)
- Dynamisches Array-Input für `gracePeriodDays` (Länge = maxLevel)
- Dynamisches Array-Input für `feeAmounts` (Länge = maxLevel)
- Switch "Verzugszinsen berechnen"
- Input "Zinssatz p.a. (%)"
- Switch "Mahngebühren berechnen"
- Save-Button → `updateSettings`-Mutation

#### 3.8 Mahnsperre-Widget auf CrmAddress-Detail

**File**: `src/components/crm/address-detail-sheet.tsx` (bestehend) — neue Section vor dem Speichern-Button:

```tsx
<div className="space-y-2">
  <Label>{t("crm.dunningBlock")}</Label>
  <Checkbox checked={form.dunningBlocked} onCheckedChange={(v) => setForm(p => ({ ...p, dunningBlocked: v === true }))} />
  {form.dunningBlocked && (
    <Textarea placeholder={t("crm.dunningBlockReason")} value={form.dunningBlockReason ?? ""} onChange={...} />
  )}
</div>
```

Der bestehende `crm.addresses.update`-tRPC-Endpoint muss `dunningBlocked` + `dunningBlockReason` im Input-Schema akzeptieren. Entweder der bestehende Endpoint wird erweitert (einfacher), oder ein neuer dedizierter `setCustomerBlock`-Endpoint aus Phase 2 wird aufgerufen (separater Call).

**Entscheidung**: Beide Pfade offen lassen. Die Form nutzt den bestehenden Update-Endpoint (erweitert), weil Buchhalter die Mahnsperre beim Kunden-Edit gleich mitsetzen. Der dedizierte `setCustomerBlock`-Endpoint aus Phase 2 ist für das Dunning-Tab-Detail (wenn man im Mahnlauf-Sheet beim Kunden "Mahnsperre setzen" klickt).

#### 3.9 Mahnsperre-Widget auf BillingDocument-Detail

**File**: `src/components/billing/document-detail-sheet.tsx` (bestehend) — analog zum CrmAddress-Widget. Plus neuer Button "Mahnstufe zurücksetzen" mit Pflicht-Begründung → ruft `setInvoiceBlock` mit `blocked=true` + `reason` als Soft-Reset (hart zurücksetzen wäre das Löschen von ReminderItems — bewusst nicht).

**Wichtig**: "Mahnstufe zurücksetzen" ist **nicht** identisch mit Mahnsperre. Der Command-Input beschreibt es als separate Aktion mit Pflicht-Begründung. Mapping-Entscheidung: Reset entspricht einem `dunningBlocked=true` mit Begründung "Mahnstufe zurückgesetzt wegen: {reason}". Die Mahnstufe wird effektiv ausgeschlossen, wenn der Block später wieder entfernt wird und die Rechnung neu in den Vorschlag kommt, springt sie wieder von Level 0 ein (weil cancelled Reminders via `getCurrentDunningLevel` nicht zählen, aber SENT-Reminders zählen — eine Soft-Reset-Semantik via dunningBlocked löst das **nicht** elegant). **Einfachere Lösung**: Der Button "Mahnstufe zurücksetzen" erzeugt einen `CANCELLED`-Override für alle SENT-ReminderItems dieser Rechnung — aber das wäre ein invasiver DB-Eingriff. **Entscheidung: Zurückziehen — der Button entfällt in diesem Plan.** Stattdessen: "Mahnsperre setzen" + "Mahnsperre entfernen" reichen für die Praxis. Wenn der Buchhalter die Mahnstufe vergessen will, storniert er den entsprechenden Reminder im Mahnläufe-Tab. Diese Entscheidung wird im Handbuch dokumentiert.

#### 3.10 i18n-Keys

**Files**: `messages/de.json` + `messages/en.json`

Neuer Top-Level-Key `billingDunning` mit allen UI-Strings. Umfang ca. 40-60 Keys. Plus:
- `nav.billingDunning` = "Mahnwesen" / "Dunning"
- In `modules.billing` dependencies ergänzen falls nötig (prüfen)

### Success Criteria: Phase 3

#### Automated Verification:
- [ ] Type-Check grün: `pnpm typecheck`
- [ ] Lint grün: `pnpm lint`
- [ ] Build grün: `pnpm build`
- [ ] i18n-Key-Consistency: beide messages-Dateien haben dieselben Keys unter `billingDunning` (Check via Script oder manuell)

#### Manual Verification:
- [ ] Sidebar-Eintrag "Mahnwesen" erscheint für User mit `dunning.view` in der Fakturierung-Gruppe.
- [ ] Sidebar-Eintrag verschwindet für User ohne `dunning.view`.
- [ ] `/orders/dunning` rendert die 4 Tabs, Default ist "Vorschlag".
- [ ] Pre-Flight-Banner erscheint bei deaktiviertem Mahnwesen und ist klickbar zu Settings.
- [ ] Pre-Flight-Banner erscheint bei 0 Templates und ist klickbar zu Templates.
- [ ] Settings-Tab: Enabled-Switch + Save → Settings gespeichert, Default-Templates erzeugt (Netzwerk-Tab prüfen).
- [ ] Templates-Tab zeigt 3 Defaults nach Aktivierung.
- [ ] Manuelle Test-Rechnung überfällig machen → Vorschlag-Tab zeigt Kundengruppe mit korrekter Summe.
- [ ] Einzelne Rechnung abwählen → Gruppensumme aktualisiert sich dynamisch.
- [ ] "Mahnungen erstellen" → Navigation zu Runs-Tab, neuer DRAFT-Reminder.
- [ ] Detail-Sheet öffnet sich, zeigt korrekte Items und Summen.
- [ ] "Versenden" → Reminder status=SENT, PDF-Preview im Sheet anzeigbar.
- [ ] Im CRM → Kunden-Detail → Korrespondenz-Tab: neuer `email` OUTGOING Eintrag sichtbar.
- [ ] "Stornieren" → Status CANCELLED, zweiter Korrespondenz-Eintrag (note).
- [ ] Mahnsperre-Widget auf Kunden-Detail: Checkbox + Begründung speichert korrekt.
- [ ] Mahnsperre-Widget auf Beleg-Detail: Checkbox + Begründung speichert korrekt.

**Implementation Note**: Manuelle Klickstrecke ist der primäre Acceptance-Test. Nach Abschluss auf Bestätigung warten.

---

## Phase 4: Tests + Edge Cases

### Overview

Absicherung des Features gegen die häufigsten Fehlerfälle. Zwei Primär-Artefakte: die D5-Filter-Test-Matrix und der D7-Happy-Path-E2E.

### Changes Required

#### 4.1 D5-Filter-Matrix als Vitest-Integration-Test

**New File**: `src/lib/services/__tests__/reminder-eligibility-service.test.ts`

Nutzt das bestehende Test-DB-Setup mit Transaction-Rollback-Isolation. Jeder Test seedet eine Rechnung, die genau einen Filter trifft, und assertet die Eligibility-Antwort.

```typescript
import { describe, it, expect, beforeEach } from "vitest"
import { testDb } from "@/test/helpers/test-db"
import { seedTestTenant, seedTestCustomer } from "@/test/helpers/seed"
import { listEligibleInvoices } from "@/lib/services/reminder-eligibility-service"
import { getSettings, updateSettings } from "@/lib/services/reminder-settings-service"

describe("reminder-eligibility-service — D5 filter matrix", () => {
  let tenantId: string
  let customerAddressId: string

  beforeEach(async () => {
    tenantId = await seedTestTenant()
    customerAddressId = await seedTestCustomer(tenantId)
    // Enable dunning with default settings (7-day grace period)
    await updateSettings(testDb, tenantId, { enabled: true })
  })

  it("paymentTermDays=null → not eligible (no_payment_term)", async () => {
    await seedInvoice(tenantId, customerAddressId, { paymentTermDays: null, documentDate: daysAgo(30) })
    const groups = await listEligibleInvoices(testDb, tenantId)
    expect(groups).toHaveLength(0)
  })

  it("status=DRAFT → not eligible", async () => {
    await seedInvoice(tenantId, customerAddressId, { status: "DRAFT", documentDate: daysAgo(30) })
    const groups = await listEligibleInvoices(testDb, tenantId)
    expect(groups).toHaveLength(0)
  })

  it("type=OFFER → not eligible", async () => {
    await seedInvoice(tenantId, customerAddressId, { type: "OFFER", documentDate: daysAgo(30) })
    const groups = await listEligibleInvoices(testDb, tenantId)
    expect(groups).toHaveLength(0)
  })

  it("openAmount=0 (fully paid) → not eligible", async () => {
    const id = await seedInvoice(tenantId, customerAddressId, { totalGross: 100, documentDate: daysAgo(30) })
    await seedPayment(tenantId, id, 100)
    const groups = await listEligibleInvoices(testDb, tenantId)
    expect(groups).toHaveLength(0)
  })

  it("daysOverdue=3 with gracePeriod=7 → not eligible (in_grace_period)", async () => {
    await seedInvoice(tenantId, customerAddressId, {
      paymentTermDays: 7,
      documentDate: daysAgo(3), // due in +4 days? Need doc date such that dueDate - now = -3
      // Adjust: documentDate = now - 10 days, paymentTermDays = 7 → dueDate = now - 3 days → daysOverdue = 3
    })
    const groups = await listEligibleInvoices(testDb, tenantId)
    expect(groups).toHaveLength(0)
  })

  it("billingDocument.dunningBlocked=true → not eligible (invoice_blocked)", async () => {
    await seedInvoice(tenantId, customerAddressId, {
      paymentTermDays: 7, documentDate: daysAgo(30), dunningBlocked: true,
    })
    const groups = await listEligibleInvoices(testDb, tenantId)
    expect(groups).toHaveLength(0)
  })

  it("customerAddress.dunningBlocked=true → not eligible (customer_blocked)", async () => {
    await testDb.crmAddress.update({
      where: { id: customerAddressId },
      data: { dunningBlocked: true },
    })
    await seedInvoice(tenantId, customerAddressId, { paymentTermDays: 7, documentDate: daysAgo(30) })
    const groups = await listEligibleInvoices(testDb, tenantId)
    expect(groups).toHaveLength(0)
  })

  it("discountDays2=60, documentDate=30 days ago → not eligible (in_discount_period)", async () => {
    await seedInvoice(tenantId, customerAddressId, {
      paymentTermDays: 14, documentDate: daysAgo(30), discountDays2: 60, discountPercent2: 2,
    })
    const groups = await listEligibleInvoices(testDb, tenantId)
    expect(groups).toHaveLength(0)
  })

  it("all conditions met → eligible with target level 1", async () => {
    await seedInvoice(tenantId, customerAddressId, {
      paymentTermDays: 7, documentDate: daysAgo(30), totalGross: 100,
    })
    const groups = await listEligibleInvoices(testDb, tenantId)
    expect(groups).toHaveLength(1)
    expect(groups[0].invoices[0].targetLevel).toBe(1)
    expect(groups[0].totalOpenAmount).toBe(100)
  })
})
```

Die Seed-Helper in `src/test/helpers/seed.ts` müssen ggf. um `seedInvoice` und `seedPayment` erweitert werden, falls nicht vorhanden.

#### 4.2 Dunning Interest Service Test

**File**: `src/lib/services/__tests__/dunning-interest-service.test.ts` (bereits in Phase 1 angelegt, hier erweitert)

- `calculateInterest(1000, 30, 9)` → Oracle-Wert (selbst messen, dokumentieren)
- Edge cases: 0, negative, huge values
- Rundungsverhalten: `calculateInterest(100, 1, 9)` → prüfen dass das Ergebnis auf Cents gerundet ist

#### 4.3 PDF-Smoke-Test

**New File**: `src/lib/pdf/__tests__/reminder-pdf.test.ts`

- Rendert `<ReminderPdf>` mit Mock-Daten, assertet dass der resultierende Buffer > 1000 bytes und mit `%PDF-` beginnt
- Kein Visual Regression, nur "PDF ist valide"

#### 4.4 Cron Route Test

**New File**: `src/app/api/cron/dunning-candidates/__tests__/route.test.ts`

Pattern aus `calculate-days/route.test.ts`:
- Auth-Check: ohne `CRON_SECRET` → 503
- Auth-Check: falscher Bearer → 401
- Happy path: aktivierter Tenant mit mahnfähiger Rechnung → Notification angelegt
- Kein Tenant aktiv → keine Notifications
- Dedupe: zweiter Aufruf am selben Tag erzeugt keine weitere Notification

#### 4.5 Race Condition Test

**File**: `src/lib/services/__tests__/reminder-service.test.ts`

Zusätzlicher Test:

```typescript
it("parallel createRun calls for the same invoice do not create duplicate items", async () => {
  const [result1, result2] = await Promise.all([
    reminderService.createRun(testDb, tenantId, { groups: [{ customerAddressId, billingDocumentIds: [invoiceId] }] }, userId),
    reminderService.createRun(testDb, tenantId, { groups: [{ customerAddressId, billingDocumentIds: [invoiceId] }] }, userId),
  ])
  // One should succeed, one should skip (or both succeed but produce different reminder numbers)
  const allItems = await testDb.reminderItem.findMany({ where: { billingDocumentId: invoiceId } })
  // At most one DRAFT reminder item for this invoice at any time
  const draftItemCount = allItems.filter(i => /* reminder status is DRAFT */).length
  expect(draftItemCount).toBeLessThanOrEqual(1)
})
```

#### 4.6 Playwright Happy Path

**New File**: `src/e2e-browser/53-mahnwesen-happy-path.spec.ts`

(Pfad-Korrektur: die Spec sagt `src/test/e2e/` — tatsächlich ist `src/e2e-browser/` die richtige Location gemäß `playwright.config.ts`.)

Nutzt die bestehenden Helpers aus `src/e2e-browser/helpers/` (auth, nav, forms, global-setup). Seed im `globalSetup` oder vor-dem-Test per direkter DB-Operation:

```typescript
import { test, expect } from "@playwright/test"
import { loginAs } from "./helpers/auth"
import { navigateTo } from "./helpers/nav"
import { seedDunningHappyPathData } from "./helpers/dunning-seed"

test.describe("Mahnwesen Happy Path (D7)", () => {
  test.beforeEach(async ({ page }) => {
    await seedDunningHappyPathData() // creates tenant, enables dunning, seeds templates, customer, 2 overdue invoices
    await loginAs(page, "buchhalter", ["dunning.view", "dunning.create", "dunning.send"])
  })

  test("full proposal → create run → send → cancel → reappear flow", async ({ page }) => {
    // 1-2: Navigate
    await navigateTo(page, "/orders/dunning")
    await expect(page.getByRole("tab", { name: /vorschlag/i })).toHaveAttribute("data-state", "active")

    // 3: No pre-flight banner
    await expect(page.getByTestId("pre-flight-banner")).toHaveCount(0)

    // 4: Customer group visible
    const groupRow = page.getByTestId("proposal-group-row").first()
    await expect(groupRow).toContainText("Test Kunde GmbH")
    await expect(groupRow).toContainText("2 Rechnungen")
    await expect(groupRow).toContainText("Stufe 1")

    // 5: Expand group
    await groupRow.getByRole("button", { name: /details/i }).click()
    await expect(page.getByTestId("proposal-invoice-row")).toHaveCount(2)

    // 6-7: Deselect one invoice, check sum updates
    const firstInvoiceRow = page.getByTestId("proposal-invoice-row").first()
    const initialSum = await page.getByTestId("group-total-due").textContent()
    await firstInvoiceRow.getByRole("checkbox").uncheck()
    await expect(page.getByTestId("group-total-due")).not.toHaveText(initialSum!)

    // 8: Create run
    await page.getByRole("button", { name: /mahnungen erstellen/i }).click()
    await expect(page.getByRole("tab", { name: /mahnläufe/i })).toHaveAttribute("data-state", "active")
    await expect(page.getByTestId("reminder-row")).toContainText("DRAFT")

    // 9: Open detail, verify only 1 invoice is in the reminder
    await page.getByTestId("reminder-row").first().click()
    await expect(page.getByTestId("reminder-item-row")).toHaveCount(1)

    // 10: Send with confirm
    await page.getByRole("button", { name: /versenden/i }).click()
    await page.getByRole("button", { name: /bestätigen/i }).click()
    await expect(page.getByTestId("reminder-status-badge")).toContainText("SENT")

    // 11: PDF in storage — query via tRPC (the download-url endpoint)
    const pdfPath = await page.evaluate(async () => {
      const res = await fetch("/api/trpc/billing.reminders.getPdfDownloadUrl?...")
      return await res.json()
    })
    expect(pdfPath).toBeTruthy()

    // 12: Correspondence entry — fetch via CRM router
    // (or navigate to the address detail page)

    // 13: Navigate to customer CRM detail → Korrespondenz tab
    await navigateTo(page, "/crm/addresses/{customerId}")
    await page.getByRole("tab", { name: /korrespondenz/i }).click()
    await expect(page.getByTestId("correspondence-row").first()).toContainText("Mahnung MA-")
    await expect(page.getByTestId("correspondence-row").first()).toContainText("email")

    // 14-15: Cancel
    await navigateTo(page, "/orders/dunning")
    await page.getByRole("tab", { name: /mahnläufe/i }).click()
    await page.getByTestId("reminder-row").first().click()
    await page.getByRole("button", { name: /stornieren/i }).click()
    await page.getByRole("button", { name: /bestätigen/i }).click()
    await expect(page.getByTestId("reminder-status-badge")).toContainText("CANCELLED")
    // Second correspondence entry
    await navigateTo(page, "/crm/addresses/{customerId}")
    await page.getByRole("tab", { name: /korrespondenz/i }).click()
    await expect(page.getByTestId("correspondence-row")).toHaveCount(2)
    await expect(page.getByTestId("correspondence-row").first()).toContainText("storniert")

    // 16-17: Both invoices reappear in proposal
    await navigateTo(page, "/orders/dunning")
    await expect(page.getByTestId("proposal-invoice-row")).toHaveCount(2)
  })
})
```

**E-Mail-Mocking**: Im Playwright-Setup wird `email-send-service` via einer Env-Variable `EMAIL_MOCK=1` in einen Spy-Modus geschaltet. Der Spy schreibt jeden Send-Call in eine Datei oder einen In-Memory-Store, den der Test über einen Test-only-Endpoint abfragen kann. Falls `EMAIL_MOCK` nicht bereits existiert, muss dieser Schalter im `email-send-service` eingebaut werden (ein Early-Return nach dem EmailSendLog-Write, der die eigentliche Nodemailer-Transmission skippt und stattdessen in `global.__emailSpy` schreibt).

**New File**: `src/e2e-browser/helpers/dunning-seed.ts` — seed helpers.

**New File**: `src/e2e-browser/helpers/email-spy.ts` — reads spy state from the server.

### Success Criteria: Phase 4

#### Automated Verification:
- [ ] Alle Unit-Tests grün: `pnpm test`
- [ ] D5-Filter-Matrix-Test grün: `pnpm vitest run src/lib/services/__tests__/reminder-eligibility-service.test.ts`
- [ ] Dunning-Interest-Test grün: `pnpm vitest run src/lib/services/__tests__/dunning-interest-service.test.ts`
- [ ] PDF-Smoke-Test grün: `pnpm vitest run src/lib/pdf/__tests__/reminder-pdf.test.ts`
- [ ] Cron-Route-Test grün: `pnpm vitest run src/app/api/cron/dunning-candidates/__tests__/route.test.ts`
- [ ] Race-Condition-Test grün
- [ ] Playwright-Happy-Path grün: `pnpm playwright test src/e2e-browser/53-mahnwesen-happy-path.spec.ts`

#### Manual Verification:
- [ ] Test-Suite läuft 3× hintereinander stabil ohne Flakes.
- [ ] Playwright-Test läuft auch im headless mode grün.

**Implementation Note**: Nach Abschluss auf Bestätigung warten.

---

## Phase 5: Handbuch + Glossar

### Overview

Dokumentation im TERP_HANDBUCH.md, konsistent zu bestehenden Feature-Abschnitten.

### Changes Required

#### 5.1 Neuer Handbuch-Abschnitt 22.17

**File**: `docs/TERP_HANDBUCH.md` (oder `docs/TERP_HANDBUCH_V2.md` — die aktuellere Version nutzen, per grep prüfen)

Neuer Abschnitt "22.17 Mahnwesen" mit folgenden Unterabschnitten:

1. **Überblick** — Was ist Mahnwesen, wann brauche ich es.
2. **Voraussetzungen**:
   - Mahnwesen unter `/orders/dunning` → Einstellungen aktivieren
   - Drei Default-Templates werden automatisch erzeugt; optional eigene anlegen
   - Berechtigungen: `dunning.view`, `dunning.create`, `dunning.send`, `dunning.cancel`, `dunning.settings`
3. **Konfiguration**:
   - Maximalstufe (1-4)
   - Karenzzeiten (gracePeriodDays)
   - Gebühren pro Stufe
   - Verzugszinssatz (Default 9% p.a. B2B)
   - Gebühren an/aus, Zinsen an/aus
4. **Workflow** (12 Schritte aus D7, in Langform als Tutorial)
5. **Mahnsperre**:
   - Kunden-Mahnsperre (auf CrmAddress)
   - Rechnungs-Mahnsperre (auf BillingDocument)
6. **Praxisbeispiel 1**: Kunde hat 2 überfällige Rechnungen → Sammelmahnung Stufe 1
7. **Praxisbeispiel 2**: Rechnung soll nicht gemahnt werden (Mahnsperre)
8. **Praxisbeispiel 3**: Mahnlauf-Stornierung nach versehentlichem Erstellen
9. **Hinweise & Grenzen**:
   - Rechnungen ohne `paymentTermDays` sind **nicht mahnfähig** (müssen manuell bearbeitet werden)
   - Rechnungen mit aktivem Skonto-Tier-2 werden bis zum Ablauf nicht gemahnt
   - Kein Auto-Versand — jede Mahnung muss manuell freigegeben werden
   - Reset einer Mahnstufe erfolgt über Reminder-Stornierung, nicht über ein separates "Reset"-Feature

Jedes Praxisbeispiel enthält **klickbare Schritte** (entspricht der User-Feedback-Regel: Handbook als Acceptance-Test).

#### 5.2 Glossar-Einträge

Neue Einträge im Glossar-Abschnitt:

- **Mahnwesen** — Prozess zur systematischen Einforderung überfälliger Kundenrechnungen
- **Mahnstufe** — Gestufte Eskalation (1-4): Zahlungserinnerung → Mahnung → Letzte Mahnung → (ggf. weitere)
- **Verzugszinsen** — Gesetzliche Zinsen nach BGB §288, Default 9% p.a. bei B2B
- **Mahngebühr** — Pauschale Aufwandsentschädigung pro Mahnstufe
- **Mahnsperre** — Kennzeichen auf Kunde oder Rechnung, das diese vom Mahn-Vorschlag ausschließt
- **Sammelmahnung** — Eine Mahnung, die mehrere offene Rechnungen eines Kunden zusammenfasst
- **Karenzzeit** (gracePeriodDays) — Wartezeit zwischen Fälligkeit und erster Mahnstufe bzw. zwischen Stufen

#### 5.3 Permissions-Tabelle

Im Berechtigungsabschnitt des Handbuchs die 5 neuen Permissions eintragen:

| Key | Beschreibung |
|---|---|
| `dunning.view` | Vorschlag, Mahnläufe, Historie, Einstellungen einsehen |
| `dunning.create` | Mahnlauf erstellen, Entwürfe bearbeiten |
| `dunning.send` | Mahnung final versenden |
| `dunning.cancel` | Mahnung stornieren, Mahnsperren setzen/entfernen |
| `dunning.settings` | Stufen, Gebühren, Zinssatz, Templates pflegen |

#### 5.4 Sidebar-Route-Tabelle

Falls das Handbuch eine Routen-Tabelle enthält, Eintrag ergänzen:

| Pfad | Titel | Berechtigung |
|---|---|---|
| `/orders/dunning` | Mahnwesen | `dunning.view` |

### Success Criteria: Phase 5

#### Automated Verification:
- [ ] Markdown ist valide (keine Broken-Link-Tools hier etablieren, nur visual)

#### Manual Verification:
- [ ] Handbuch-Abschnitt liest sich konsistent zu vorhandenen Feature-Abschnitten (Stichprobenvergleich mit SEPA-Abschnitt).
- [ ] Drei Praxisbeispiele sind Schritt-für-Schritt klickbar.
- [ ] Permissions-Tabelle vollständig.
- [ ] Glossar-Einträge verlinken ggf. zu Handbuch-Abschnitt.

---

## Testing Strategy

### Unit Tests

- `placeholder-resolver.test.ts` — bestehendes Verhalten + unknown-keys
- `dunning-interest-service.test.ts` — Zinsrechnung in Integer-Cents, Edge cases
- `reminder-settings-service.test.ts` — Validierung, Lazy-Create
- `reminder-template-service.test.ts` — Idempotenter Seed
- `reminder-level-helper.test.ts` — Level-Derivation
- `reminder-service.test.ts` — createRun, cancel, Race-Condition

### Integration Tests

- `reminder-eligibility-service.test.ts` — D5 Filter-Matrix (9 Cases)
- `reminders-router.test.ts` — tRPC-Endpoints mit gemocktem Email/PDF
- `cron/dunning-candidates/route.test.ts` — Cron-Logik inkl. Auth + Dedupe
- `reminder-pdf.test.ts` — PDF-Smoke (valider Buffer)

### E2E Tests

- `e2e-browser/53-mahnwesen-happy-path.spec.ts` — D7 Workflow 17 Assertions
- Email via Mock-Spy (keine echten SMTP-Calls)
- PDF-Existenz im Storage wird über Download-URL-Endpunkt geprüft

### Manual Testing Steps

1. Mahnwesen aktivieren → Defaults werden geseedet
2. Test-Rechnung überfällig machen → Vorschlag zeigt Kundengruppe
3. Mahnlauf erstellen → DRAFT sichtbar
4. Versenden → SENT + CrmCorrespondence + PDF
5. Stornieren → CANCELLED + zweite Korrespondenz
6. Cron manuell triggern (`curl`) → Notification erscheint bei Admin-User
7. Mahnsperre auf Kunde setzen → alle seine Rechnungen verschwinden aus Vorschlag
8. Mahnsperre entfernen → Rechnungen erscheinen wieder

## Performance Considerations

- `listEligibleInvoices` lädt alle INVOICE-Dokumente im Mandanten mit Status PRINTED/FORWARDED/PARTIALLY_FORWARDED. Das ist bereits teuer (Risiko R1 aus der Bestandsaufnahme). Für MVP akzeptabel; für Hot-Tenants wäre eine persistierte `dueDate`/`openAmount`-Spalte nötig (separates Refactoring-Ticket, nicht im Scope).
- Der Cron läuft täglich und ist an die O(n)-Komplexität des Eligibility-Services gebunden. Bei großem Wachstum (>10k offene Rechnungen pro Tenant) wird der Cron langsam. Monitoring: Cron-Dauer via `console.time` loggen, wenn >30s → Ticket.

## Migration Notes

- Keine Datenmigration für bestehende Rechnungen. Beim ersten Öffnen von `/orders/dunning` nach dem Deploy:
  - Settings-Row wird lazy erzeugt (`enabled=false`)
  - Keine Templates existieren
  - Pre-Flight-Banner erscheint
- Bestehende Mandanten können das Feature schrittweise aktivieren. Solange `enabled=false`, passiert nichts (Cron überspringt, Proposal leer).
- Rückwärtskompatibilität: Alle neuen Felder sind optional oder haben Defaults. Kein Breaking Change am bestehenden Code.

## References

- Bestandsaufnahme: `thoughts/shared/research/2026-04-13_mahnwesen-bestandsaufnahme.md`
- SEPA-Feature als Struktur-Vorbild (commit `e7a491cf`): `src/lib/services/payment-run-*.ts`, `src/trpc/routers/invoices/payment-runs.ts`, `src/e2e-browser/52-payment-runs.spec.ts`
- Platzhalter-Parser (wird extrahiert): `src/lib/services/billing-document-service.ts:20-52`
- Permission-Catalog-Pattern: `src/lib/auth/permission-catalog.ts`
- Cron-Pattern (Notification-only): `src/app/api/cron/inbound-invoice-escalations/route.ts`
- Sidebar-Config: `src/components/layout/sidebar/sidebar-nav-config.ts:340-388`
- Notification-System: `src/lib/services/notification-service.ts`, `src/components/layout/notifications.tsx`
- NumberSequence-Service: `src/lib/services/number-sequence-service.ts`
- ZMI-TICKET-162: `thoughts/shared/tickets/ZMI-TICKET-162-mahnwesen.md` (Original-Feature-Spec)
