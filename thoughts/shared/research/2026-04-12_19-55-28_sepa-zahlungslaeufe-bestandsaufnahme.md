---
date: 2026-04-12T19:55:28+0200
researcher: Tolga Ayvazoglu
git_commit: 260955d8d94b435e766db6464e16f41a0d1ca834
branch: staging
repository: terp
topic: "SEPA-Zahlungsläufe (pain.001.001.09) für freigegebene Eingangsrechnungen – Bestandsaufnahme"
tags: [research, codebase, sepa, payment-run, inbound-invoices, pain001, iso20022, billing]
status: complete
last_updated: 2026-04-12
last_updated_by: Tolga Ayvazoglu
---

# Research: SEPA-Zahlungsläufe für freigegebene Eingangsrechnungen – Bestandsaufnahme

**Date**: 2026-04-12T19:55:28+0200
**Researcher**: Tolga Ayvazoglu
**Git Commit**: 260955d8d94b435e766db6464e16f41a0d1ca834
**Branch**: staging
**Repository**: terp

## Research Question

Vollständige Bestandsaufnahme der von einem geplanten SEPA-Zahlungslauf-Feature betroffenen Code-Bereiche. Reine Recherche, keine Vorschläge. Geplantes Feature: `PaymentRun (1) → PaymentRunItem (n) → InboundInvoice`, Status `DRAFT → EXPORTED → BOOKED → CANCELLED`, Format `pain.001.001.09`, Download als Datei zum manuellen Bank-Upload.

## Summary

- **Kein einziger SEPA-/pain.001-/PaymentRun-Treffer im Source-Tree.** Weder Modell, noch Migration, noch Stub, noch TODO. Das Feature wird vollständig neu gebaut.
- **Eigene Bankdaten** (IBAN/BIC/Bankname) liegen in `BillingTenantConfig` – nullable. Eine **Gläubiger-ID (Creditor Identifier, CI)** existiert nirgends im Schema.
- **Lieferanten-Bankverbindungen** liegen in `CrmBankAccount` (IBAN NOT NULL, BIC nullable, `isDefault` vorhanden). `InboundInvoice.sellerIban`/`sellerBic` existieren zusätzlich aus dem ZUGFeRD-Parser – beide Quellen werden jedoch nicht synchronisiert.
- **Strukturierte Lieferantenadresse** (`seller{Street,Zip,City,Country}` auf `InboundInvoice` bzw. `CrmAddress.{street,zip,city,country}`) ist **vollständig nullable** – unter pain.001.001.09 mit PostalAddress v9 kritisch.
- **InboundInvoice kennt keinen Bezahl-Status.** Statuswerte: `DRAFT | PENDING_APPROVAL | APPROVED | REJECTED | EXPORTED | CANCELLED`. Kein `paidAt`, kein `paymentStatus`, keine Relation zu einem Payment(Run)-Modell.
- **Permissions-System**: zentraler Katalog in `src/lib/auth/permission-catalog.ts`, Enforcement via `requirePermission`-Middleware, Seed in einer Migration. Namespace `inbound_invoices.*` existiert mit 6 Permissions; `payment_runs.*` existiert nicht.
- **XML-Generierung**: `@e-invoice-eu/core` (nur CII/XRechnung) und `fast-xml-parser` (nur Parsing, Generator-Schicht vorhanden) – **kein SEPA-/ISO-20022-Support**. Keine XSD-Datei im Repo; KoSIT-Validator läuft ausschließlich als externes Java-Tool.
- **Download-Pattern**: (a) tRPC-Mutation returnt base64 (DATEV-CSV), (b) tRPC-Mutation returnt Supabase Signed URL (E-Rechnung XML). Keine eigenen Next.js-Routes für File-Download im Einsatz.
- **Tabellen mit Mehrfach-Auswahl** existieren als etabliertes Pattern (Set<string> + shadcn Checkbox mit `indeterminate`), aber **nicht** im Eingangsrechnungs-Modul – dort gibt es aktuell keine Bulk-Auswahl.
- **Eingangsrechnungs-Modul nutzt Sidebar-Navigation** (`/invoices/inbound`, `/invoices/inbound/approvals`, `/invoices/inbound/settings`), keine Top-Level-Tabs. Die Settings-Seite selbst nutzt Tabs intern (`imap | approval-rules | email-log`) und berührt keine Bankdaten.
- **NumberSequence** ist etabliert (`key`, `prefix`, `nextValue`, unique per Tenant). Existierende Prefixe: `K- V- AG- ART- PO- ER-`. Kein `PR-` o.ä. vorhanden.
- **Cron-Jobs**: 14 Routen, zwei berühren Eingangsrechnungen (`email-imap-poll`, `inbound-invoice-escalations`). **Kein** Payment-/SEPA-Cron.
- **i18n**: `next-intl`, `messages/de.json` + `messages/en.json`, Namespace `inboundInvoices` existiert. **Kein** `paymentRuns`/`zahlungslaeufe`.

## Detailed Findings

## 1. TenantConfig — eigene Bankdaten des Mandanten

**Existiert:**

- `BillingTenantConfig` enthält alle Bankstammdaten – `prisma/schema.prisma:976-1005`:

```prisma
model BillingTenantConfig {
  id            String @id @default(uuid()) @db.Uuid
  tenantId      String @unique @db.Uuid
  companyName   String? @db.VarChar(255)
  companyAddress String?
  bankName      String? @db.VarChar(255)
  iban          String? @db.VarChar(34)
  bic           String? @db.VarChar(11)
  // ...
  companyStreet  String? @db.VarChar(255)
  companyZip     String? @db.VarChar(20)
  companyCity    String? @db.VarChar(100)
  companyCountry String? @db.VarChar(10) @default("DE")
  taxId          String? @db.VarChar(50)
  taxNumber      String? @db.VarChar(50)
  leitwegId      String? @db.VarChar(50)
  eInvoiceEnabled Boolean @default(false)
}
```

- Relation zu `Tenant` eins-zu-eins via `tenantId` (`prisma/schema.prisma:207`).
- Bearbeitungs-UI existiert unter `/admin/billing-config`, implementiert in `src/components/billing/tenant-config-form.tsx:134-154` – bearbeitet heute IBAN/BIC/`bankName`/companyStreet/Zip/City/Country. Permission: `billing_documents.edit`.
- Lese-/Schreib-Service: `src/lib/services/billing-tenant-config-service.ts` (Typ hat `iban?: string | null`, `bic?: string | null` als optional).
- Verwendung der Felder heute: Einbettung in E-Rechnung-CII als `PayeeFinancialAccount` (`src/lib/services/billing-document-einvoice-service.ts`).

**Existiert nicht / fehlt:**

- **Keine Gläubiger-ID (Creditor Identifier / SEPA CI, DE…ZZZ…)** – grep schema.prisma auf `creditor` → nur `EmployeeGarnishment.creditorName`, `creditorAddress` (Lohnpfändung, nichts mit SEPA CI).
- **Kein dedizierter Auftraggeber-Name** – wird implizit aus `companyName` gezogen, aber nicht auf 70 Zeichen begrenzt.
- **Kein Feld auf `Tenant` direkt** für Bankdaten (`prisma/schema.prisma:95-281`).
- **Kein `InboundInvoiceConfig`-Modell** – inbound-invoice-spezifische Konfiguration existiert als Settings-Page mit Tabs für IMAP, Approval-Policies, Email-Log, ohne eigenes Konfig-Modell mit Bankdaten.
- **Die existierende Eingangsrechnungs-Settings-Page** (`src/app/[locale]/(dashboard)/invoices/inbound/settings/page.tsx:1-84`) **berührt keine Bankdaten** – nur IMAP-Konfig, Approval-Rules, Email-Log.

## 2. InboundInvoice — Felder für SEPA-Ausgang

**Existiert** – `prisma/schema.prisma:5596-5659`:

Kompletter Field-Dump (Name, Typ, Nullability):

| Feld | Typ | Nullable |
|---|---|---|
| `id` | String @id | nein |
| `tenantId` | String | nein |
| `number` | String(50) | nein |
| `source` | String(20) `default "manual"` | nein |
| `sourceEmailLogId` | String | ja |
| `sourceMessageId` | String(500) | ja |
| `supplierId` | String (FK → CrmAddress) | ja |
| `supplierStatus` | String(20) `matched\|unknown\|pending_review` | nein |
| `invoiceNumber` | String(100) | ja |
| `invoiceDate` | DateTime (Date) | ja |
| `dueDate` | DateTime (Date) | ja |
| `totalNet` | Decimal(12,2) | ja |
| `totalVat` | Decimal(12,2) | ja |
| `totalGross` | Decimal(12,2) | ja |
| `currency` | String(3) `default "EUR"` | nein |
| `paymentTermDays` | Int | ja |
| `sellerName` | String(255) | ja |
| `sellerVatId` | String(50) | ja |
| `sellerTaxNumber` | String(50) | ja |
| `sellerStreet` | String(255) | ja |
| `sellerZip` | String(20) | ja |
| `sellerCity` | String(100) | ja |
| `sellerCountry` | String(5) | ja |
| `sellerIban` | String(34) | ja |
| `sellerBic` | String(11) | ja |
| `buyerName` | String(255) | ja |
| `buyerVatId` | String(50) | ja |
| `buyerReference` | String(100) | ja |
| `zugferdProfile` | String(30) | ja |
| `zugferdRawXml` | Text | ja |
| `pdfStoragePath` | Text | ja |
| `pdfOriginalFilename` | String(255) | ja |
| `status` | String(30) `default "DRAFT"` | nein |
| `approvalVersion` | Int `default 1` | nein |
| `submittedBy` | String (UUID) | ja |
| `submittedAt` | DateTime | ja |
| `datevExportedAt` | DateTime | ja |
| `datevExportedBy` | String (UUID) | ja |
| `notes` | Text | ja |
| `orderId` | String (UUID) | ja |
| `costCenterId` | String (UUID) | ja |
| `createdAt` / `updatedAt` / `createdBy` | — | — |

**Status-Werte** (verifiziert gegen `supabase/migrations/20260413100000_create_inbound_invoice_tables.sql:98-99`):
`DRAFT | PENDING_APPROVAL | APPROVED | REJECTED | EXPORTED | CANCELLED`.

Der Status ist ein freies `String(30)`, **kein Prisma-Enum**. Die Werte sind im Service-Layer und der Migration als CHECK-Constraint / Konvention festgelegt.

**Relationen**:
- `supplier: CrmAddress?` (`schema.prisma:5643`)
- `lineItems: InboundInvoiceLineItem[]` (`schema.prisma:5650`)
- `approvals: InboundInvoiceApproval[]` (`schema.prisma:5651`)

**Existiert nicht / fehlt:**

- **Kein `paidAt`, `paymentStatus`, `paid`, `markAsPaid`** – weder auf dem Modell noch im Service. Grep `paidAt|paymentStatus|markAsPaid` in `src/lib/services/inbound-invoice*.ts` → null Treffer.
- **Kein `PAID`-Status im Status-Enum.**
- **Keine Relation auf PaymentRun/Payment/SEPA**.
- **`sellerIban` und `sellerBic`** sind vorhanden, aber **nullable** – werden vom ZUGFeRD-Parser befüllt (`src/lib/services/zugferd-xml-parser.ts`). Bei Manuell-Upload ohne ZUGFeRD sind beide leer.
- **Strukturierte Lieferantenadresse** (`sellerStreet/Zip/City/Country`) ist **vollständig nullable** – für pain.001.001.09 mit strukturierter `PostalAddress` (ab v9 Pflicht, wo verwendet) nicht verlässlich befüllt.

## 3. CrmAddress / Lieferanten-Bankverbindung

**Existiert** – `prisma/schema.prisma:543-561` (`CrmBankAccount`):

```prisma
model CrmBankAccount {
  id            String   @id @default(uuid()) @db.Uuid
  tenantId      String   @db.Uuid
  addressId     String   @db.Uuid
  iban          String   @db.VarChar(34)        // NOT NULL
  bic           String?  @db.VarChar(11)
  bankName      String?  @db.VarChar(255)
  accountHolder String?  @db.VarChar(255)
  isDefault     Boolean  @default(false)
  createdAt     DateTime @default(now()) @db.Timestamptz(6)
  updatedAt     DateTime @updatedAt          @db.Timestamptz(6)
  tenant        Tenant   @relation(...)
  address       CrmAddress @relation(...)
}
```

**CrmAddress** – `prisma/schema.prisma:437-496` – Auszug der für SEPA relevanten Felder:

- `company` (String, NOT NULL)
- `number` (String, NOT NULL, unique per tenant; Business-Key z.B. „L-0042")
- `type` (enum `CrmAddressType`: `CUSTOMER | SUPPLIER`, Zeile 441)
- `street`, `zip`, `city` – alle `String?`, **nullable**
- `country` – `String? default "DE"`, nullable
- `taxNumber`, `vatId`, `leitwegId` – nullable
- `paymentTermDays`, `discountPercent`, `discountDays`
- Relation `bankAccounts: CrmBankAccount[]` (`schema.prisma:473`) – 1:N

**Default-Flag**: `CrmBankAccount.isDefault: Boolean @default(false)` – vorhanden.

**UI für Bankkonten**:
- `src/components/crm/bank-account-list.tsx`
- `src/components/crm/bank-account-form-dialog.tsx`

**Existiert nicht / fehlt:**

- **Kein direkter Weg zur „korrekten" Bankverbindung** bei einer Überweisung. `CrmAddress` hat N `bankAccounts`, `isDefault` ist vorhanden – aber **keine Unique-Constraint auf `isDefault=true` pro Adresse** ist im Schema-Auszug sichtbar, was bedeutet dass ein Lieferant theoretisch 0 oder >1 Defaults haben kann.
- **Keine Konsistenz-Enforcement** zwischen `InboundInvoice.sellerIban` (aus ZUGFeRD) und `CrmBankAccount.iban` des verknüpften Lieferanten. Es gibt weder Service-Funktion noch DB-Trigger, der nach Supplier-Matching die IBAN abgleicht.
- **`CrmAddress` hält selbst keine Bankdaten** – kein `iban`/`bic` Feld direkt auf der Adresse. Bankverbindungen ausschließlich über die `CrmBankAccount`-Relation.
- **Tests**: keine dedizierten Testdateien für `CrmBankAccount`; indirekt getestet über Billing-E-Invoice-Tests.

## 4. Berechtigungen

**Existiert** – zentraler Katalog: `src/lib/auth/permission-catalog.ts:342-348`:

```typescript
p("inbound_invoices.view",    "inbound_invoices", "view",    "View inbound invoices"),
p("inbound_invoices.upload",  "inbound_invoices", "upload",  "Upload inbound invoices"),
p("inbound_invoices.edit",    "inbound_invoices", "edit",    "Edit inbound invoices"),
p("inbound_invoices.approve", "inbound_invoices", "approve", "Approve inbound invoices"),
p("inbound_invoices.export",  "inbound_invoices", "export",  "Export inbound invoices"),
p("inbound_invoices.manage",  "inbound_invoices", "manage",  "Manage inbound invoices"),
```

Permission-IDs werden deterministisch via **UUIDv5** (Namespace `f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1`) aus dem Key erzeugt – `permission-catalog.ts:12, 27-29`. Lookup via `permissionIdByKey(key)` (`permission-catalog.ts:401-403`).

**Seeding** in SQL-Migration, nicht in einem separaten Seed-Skript:
- `supabase/migrations/20260413100001_add_inbound_invoice_permissions_and_module.sql:20-75`
- Zielt auf `user_groups.permissions` (JSONB-Array mit UUIDs)
- Rollen: ADMIN (alle 6), BUCHHALTUNG (alle außer `manage`), VORGESETZTER (view + approve), PERSONAL (view, upload, edit, approve)

**Enforcement** – `src/lib/auth/middleware.ts:40-59`:

```typescript
export function requirePermission(...permissionIds: string[]) {
  return createMiddleware(async ({ ctx, next }) => {
    const user = (ctx as AuthenticatedContext).user
    if (!user) throw new TRPCError({ code: "UNAUTHORIZED", ... })
    if (!hasAnyPermission(user, permissionIds))
      throw new TRPCError({ code: "FORBIDDEN", ... })
    return next({ ctx })
  })
}
```

**Verwendung im Router** – `src/trpc/routers/invoices/inbound.ts:13-20`:

```typescript
const VIEW    = permissionIdByKey("inbound_invoices.view")!
const UPLOAD  = permissionIdByKey("inbound_invoices.upload")!
const EDIT    = permissionIdByKey("inbound_invoices.edit")!
const APPROVE = permissionIdByKey("inbound_invoices.approve")!
const EXPORT  = permissionIdByKey("inbound_invoices.export")!
const MANAGE  = permissionIdByKey("inbound_invoices.manage")!
```

Modul-Guard: `invProcedure = tenantProcedure.use(requireModule("inbound_invoices"))` (`inbound.ts:24`). Permission-Check dann per `.use(requirePermission(VIEW))` pro Procedure.

Prozedurweise Permission-Zuordnung im Eingangsrechnungs-Router (Auszug):

| Procedure | Permission |
|---|---|
| `list`, `getById`, `getPdfUrl`, `approvalHistory` | VIEW |
| `getUploadUrl`, `createFromUpload` | UPLOAD |
| `update`, `updateLineItems`, `assignSupplier`, `submitForApproval` | EDIT |
| `approve`, `reject`, `pendingApprovals` | APPROVE |
| `exportDatev` | EXPORT |
| `reopenExported`, `cancel`, `remove` | MANAGE |

**Existiert nicht / fehlt:**

- **Keine `payment_runs.*` Permissions** im Katalog. Grep `payment_runs` in `src/lib/auth/permission-catalog.ts` → null Treffer.
- **Kein zentrales String-Enum oder TS-Const für Permission-Keys** – die Keys sind freie Strings im Katalog, Lookup erfolgt via `permissionIdByKey(stringKey)`.

## 5. UI-Patterns für Listenansicht mit Mehrfachauswahl

**Existiert** als etabliertes Pattern – aber **nicht** im Eingangsrechnungs-Modul.

Pattern basiert auf:
- Selection-State als `Set<string>` im Parent (bzw. in einem Hook)
- shadcn `Checkbox` mit `checked={allSelected ? true : isIndeterminate ? 'indeterminate' : false}`
- Keine Nutzung von `@tanstack/react-table`-Selection
- Shadcn-Komponenten: `src/components/ui/checkbox.tsx` (liefert `Minus`-Icon für indeterminate, `Check` für true), `src/components/ui/table.tsx`

**Konkrete Beispiele mit Checkbox + Bulk-Action-Button**:

1. `src/components/approvals/approval-bulk-actions.tsx:37-63`

```tsx
const allSelected    = selectedCount > 0 && selectedCount === totalCount
const isIndeterminate = selectedCount > 0 && selectedCount < totalCount

const handleSelectAllChange = (value: boolean | 'indeterminate') => {
  if (value === true || value === 'indeterminate') onSelectAll()
  else onClearSelection()
}

<Checkbox
  checked={allSelected ? true : isIndeterminate ? 'indeterminate' : false}
  onCheckedChange={handleSelectAllChange}
  disabled={disabled}
  aria-label={t('selectAll')}
/>
```

2. `src/components/monthly-values/monthly-values-batch-actions.tsx:39-65` – identisches Schema, drei Bulk-Buttons (close/reopen/recalculate).

3. `src/components/employees/bulk-actions.tsx:36-37, 109-130` – nutzt `selectedIds: Set<string>`, bietet Dialog für "ausgewählte vs. gefilterte" Bulk-Aktionen.

4. Row-Level-Checkbox-Tabellen:
   - `src/components/approvals/timesheet-approval-table.tsx:24-25, 176-182`
   - `src/components/approvals/absence-approval-table.tsx:29-30, 160-166`
   - Beide speichern `selectedIds: Set<string>` und deaktivieren die Checkbox, wenn die Zeile nicht bulk-fähig ist.

**Existiert nicht / fehlt:**

- **`src/components/invoices/inbound-invoice-list.tsx:49-100`** hat **keine** Bulk-Auswahl – ausschließlich Zeilenaktionen per Dropdown-Menu.
- Es gibt **keine wiederverwendbare `<BulkSelectableTable>`-Komponente**; jedes Feature kopiert das Pattern.

## 6. Tab-Pattern im Eingangsrechnungs-Modul

**Existiert** – das Modul hat **keine Top-Level-Tabs**, sondern drei separate Pages, die über die Sidebar-Navigation angesteuert werden:

Seiten:
- `src/app/[locale]/(dashboard)/invoices/inbound/page.tsx` – List
- `src/app/[locale]/(dashboard)/invoices/inbound/[id]/page.tsx` – Detail
- `src/app/[locale]/(dashboard)/invoices/inbound/approvals/page.tsx` – Approval-Queue (Perm. `inbound_invoices.approve`)
- `src/app/[locale]/(dashboard)/invoices/inbound/settings/page.tsx` – Settings (Perm. `inbound_invoices.manage`)

**Sidebar-Konfig** – `src/components/layout/sidebar/sidebar-nav-config.ts:389-414`:

```typescript
{
  titleKey: 'invoicesSection',
  module: 'inbound_invoices',
  items: [
    { titleKey: 'inboundInvoices',  href: '/invoices/inbound',          icon: FileInput, permissions: ['inbound_invoices.view'] },
    { titleKey: 'inboundApprovals', href: '/invoices/inbound/approvals', icon: FileCheck, permissions: ['inbound_invoices.approve'] },
    { titleKey: 'inboundSettings',  href: '/invoices/inbound/settings',  icon: Settings2, permissions: ['inbound_invoices.manage'] },
  ],
}
```

**Nur die Settings-Seite verwendet `<Tabs>`** (aus `@/components/ui/tabs`) – intern drei Tabs: `imap`, `approval-rules`, `email-log` (`settings/page.tsx:9-12, 50-68`).

**Existiert nicht / fehlt:**

- **Kein Top-Level-Tab-Container** im Eingangsrechnungs-Modul, an den sich ein neuer Tab „Zahlungsläufe" anhängen ließe. Der existierende Weg ist: neuer Sidebar-Eintrag + neue Page.

## 7. XML-Generierung im Codebase

**Existiert:**

- **`@e-invoice-eu/core` v2.3.4** (`package.json:52`) – verwendet in `src/lib/services/billing-document-einvoice-service.ts`:

```typescript
import { InvoiceService } from "@e-invoice-eu/core"
// generateXml(), embedXmlInPdf(), generateAndStoreEInvoice()
```
  Erzeugt ausschließlich **CII** (Cross-Industry-Invoice) / Factur-X-EN16931 / XRechnung. **Keine SEPA-Unterstützung** – die Library ist auf E-Rechnung spezialisiert.

- **`fast-xml-parser` v5.5.10** (`package.json:90`) – verwendet in `src/lib/services/zugferd-xml-parser.ts`:

```typescript
import { XMLParser } from "fast-xml-parser"
// Nur Parsing von ZUGFeRD/Factur-X (MINIMUM, BASIC_WL, BASIC, EN16931, XRECHNUNG, EXTENDED)
```
  Die Library liefert auch einen `XMLBuilder` – technisch zur XML-Erzeugung geeignet, wird aktuell aber ausschließlich parsend eingesetzt.

- **Keine weitere XML-bezogene Direct-Dependency** (Grep in `package.json` nach `xml|xmlbuilder|sax|xpath|xmldom|libxml|xsd|xrechnung|zugferd|sepa|pain|iban|bic|ebics|iso20022`).

**File-Download-Patterns im Einsatz** (beide über tRPC, keine eigene Next.js-Route):

1. **DATEV-CSV, base64 in tRPC-Response** – `src/trpc/routers/invoices/inbound.ts:420-439`:

```typescript
const result = await datevExportService.exportToCsv(
  ctx.prisma as unknown as PrismaClient, ctx.tenantId!, { ... },
  ctx.user!.id, { userId: ctx.user!.id, ipAddress: ctx.ipAddress, ... }
)
return {
  csv: result.csv.toString("base64"),
  filename: result.filename,
  count: result.count,
}
```

2. **E-Rechnung-XML, Supabase Signed URL** – `src/trpc/routers/billing/documents.ts:355-382`:

```typescript
let result = await eInvoiceService.getSignedXmlDownloadUrl(...)
if (!result) {
  await eInvoiceService.generateAndStoreEInvoice(...)
  result = await eInvoiceService.getSignedXmlDownloadUrl(...)
}
return result // { signedUrl, filename }
```

**XSD-Validierung**:

- **Keine `.xsd`-Dateien im Repo** committed (Glob `**/*.xsd`).
- Der einzige existierende Validator ist **extern**: `tools/kosit/README.md` – `pnpm validate:einvoice` (Skript in `package.json:44`) startet einen **Java-basierten KoSIT-Validator** (`validator.jar`, `validator-configuration-xrechnung`), der manuell heruntergeladen werden muss.

**Existiert nicht / fehlt:**

- **Keine pain.001-/ISO-20022-/SEPA-Codegen-Library** vorhanden.
- **Keine IBAN-Validierungs-Library** (`iban`, `ibantools` o.ä.) – weder Direct noch Dev Dep.
- **Keine XSD-Runtime-Validierung** im Code (Grep `xmllint|libxml|XMLSchema|validateXml` → null im `src/`).
- **Kein gemeinsamer XML-Builder-Helper** – XML wird ad-hoc pro Format erzeugt.

## 8. NumberSequence

**Existiert** – `prisma/schema.prisma:415-429`:

```prisma
model NumberSequence {
  id        String   @id @default(uuid()) @db.Uuid
  tenantId  String   @db.Uuid
  key       String   @db.VarChar(50)
  prefix    String   @default("") @db.VarChar(20)
  nextValue Int      @default(1)
  createdAt DateTime @default(now()) @db.Timestamptz(6)
  updatedAt DateTime @updatedAt          @db.Timestamptz(6)
  @@unique([tenantId, key])
}
```

**Bestehende Keys / Prefixe** (aus `supabase/seed.sql`):

| key | prefix |
|---|---|
| `customer` | `K-` |
| `inquiry` | `V-` |
| `offer` | `AG-` |
| `article` | `ART-` |
| `purchase_order` | `PO-` |
| `inbound_invoice` | `ER-` |

**Existiert nicht / fehlt:**

- **Kein `payment_run` / `PR-` Sequenz-Key** – Grep `payment_run|PR-` in `supabase/seed.sql` → null.

## 9. Cron-Jobs

**Existiert** – Verzeichnis: `src/app/api/cron/`. Schedules in `vercel.json`.

14 Routen, davon 12 aktiv in `vercel.json`, 2 suspendiert (`dsgvo-retention`, `export-template-schedules`).

**Berühren Eingangsrechnungen**:

1. `src/app/api/cron/email-imap-poll/route.ts` – **alle 3 min** (`*/3 * * * *`).
   - Liest alle aktiven IMAP-Configs, pollt Mailbox, erzeugt `InboundInvoice`-DRAFTs aus angehängten PDFs.
   - Bei 3+ Folge-Fehlern: Benachrichtigung an Admins mit `email_imap.manage`.
   - Zeilen 17–117.

2. `src/app/api/cron/inbound-invoice-escalations/route.ts` – **stündlich** (`0 * * * *`).
   - `approvalRepo.findOverdueSteps(prisma, 200)` liefert PENDING-Approvals >24h.
   - Erzeugt `Notification`-Rows (type `"reminders"`), pushed Unread-Count via pubsub, setzt `lastReminderAt` (24h Cooldown).
   - **Ändert keine Invoice-Status** – reine Erinnerungen. Zeilen 40–126.

**Andere Cron-Jobs** (nicht eingangsrechnungs-spezifisch): `calculate-days` (02:00), `calculate-months` (03:00, Tag 2), `email-retry` (*/5), `execute-macros` (*/15), `expire-demo-tenants` (01:00), `generate-day-plans` (So 01:00), `platform-cleanup` (*/5), `platform-subscription-autofinalize` (04:15), `recurring-invoices` (04:00), `wh-corrections` (06:00).

**Existiert nicht / fehlt:**

- **Kein Cron für Payment/SEPA**. `recurring-invoices` erzeugt Ausgangsrechnungen, verarbeitet aber keinen Zahlungsfluss.
- **Kein bestehender Mechanismus, der Eingangsrechnungen auf „bezahlt" flippt** – weder zeit- noch ereignisgetrieben.

## 10. Tests

**Existiert:**

- **Test-Runner**: Vitest. Config: `vitest.config.ts:1-19` – `include: ["src/**/__tests__/**/*.test.ts"]`, Environment `node`, Alias `@`→`./src`.
- **Struktur**: Tests in `src/**/__tests__/*.test.ts` (ko-lokalisiert), **kein** separates `tests/`.

**Inbound-Invoice-Tests**:

| Datei | Typ |
|---|---|
| `src/lib/services/__tests__/inbound-invoice-service.test.ts` | Unit (Mock Prisma, Storage) |
| `src/lib/services/__tests__/inbound-invoice-service.integration.test.ts` | Integration (echte DB) |
| `src/lib/services/__tests__/inbound-invoice-approval-service.integration.test.ts` | Integration |
| `src/lib/services/__tests__/inbound-invoice-supplier-matcher.test.ts` | Unit |
| `src/lib/services/__tests__/inbound-invoice-datev-export-service.test.ts` | Unit |

**XML-Assertions** (Pattern im Codebase):

- `src/lib/services/__tests__/zugferd-parser-service.test.ts:18-26`:

```typescript
const xmlAtt = attachments.find((a) => a.filename.toLowerCase().includes("xml"))
expect(xmlAtt).toBeDefined()
expect(xmlAtt!.content.toString("utf-8")).toContain("CrossIndustryInvoice")
```

- `src/lib/services/__tests__/billing-document-einvoice-service.test.ts` – Tests für E-Invoice-XML-Generierung; nutzt `makeTenantConfig({...})` und `makeAddress({...})` Factories mit Defaults.

**Seed-Pattern in Integration-Tests** – `inbound-invoice-approval-service.integration.test.ts:71-94`:

```typescript
beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TEST_TENANT_ID },
    update: {},
    create: { id: TEST_TENANT_ID, name: "...", slug: "...", isActive: true },
  })
  for (const [id, name] of [...]) {
    await prisma.user.upsert({
      where: { id }, update: {},
      create: { id, email: `${name}@test.local`, displayName: name },
    })
    await prisma.userTenant.upsert({ ... })
  }
})
```

**Zentrale Helpers** – `src/trpc/routers/__tests__/helpers.ts` (259 Zeilen):

- `autoMockPrisma()`, `createMockContext()`, `createMockUser()`, `createMockSession()`, `createMockUserGroup()`
- `createAdminUser()`, `createUserWithPermissions(permissionIds)`
- `createMockTenant()`, `createMockUserTenant()`

Platform-Pendant: `src/trpc/platform/__tests__/helpers.ts`.

**Factory-Pattern Beispiel** – `billing-document-einvoice-service.test.ts:9-37`:

```typescript
function makeTenantConfig(overrides: Partial<BillingTenantConfig> = {}) {
  return {
    id: "c0000000-0000-4000-a000-000000000001",
    tenantId: TENANT_ID,
    companyName: "Test GmbH",
    companyStreet: "Musterstraße 1",
    iban: "DE89370400440532013000",
    eInvoiceEnabled: true,
    ...overrides,
  }
}
```

**Existiert nicht / fehlt:**

- **Keine dedizierten Unit-Tests für `CrmBankAccount`, `CrmAddress`, `BillingTenantConfig`** als eigenständige Testdateien – sie werden indirekt über Billing/E-Invoice-Tests abgedeckt.
- **Kein Integration-Test, der generiertes XML gegen ein XSD validiert** – nur substring-basiert (`toContain(...)`).
- **Keine gemeinsame Factory-Library** für Tenants/Users/Addresses – jedes Integration-Test-File seedet eigenständig via `prisma.upsert`.

## 11. i18n

**Existiert:**

- **Library**: `next-intl`. Config:
  - `src/i18n/routing.ts` – `locales: ['de','en']`, `defaultLocale: 'de'`, `localePrefix: 'as-needed'`
  - `src/i18n/request.ts:1-13` – lädt Messages pro Locale
  - `src/i18n/navigation.ts:1-5` – `Link`, `redirect`, `useRouter` Helpers
- **Message-Files**: `messages/de.json`, `messages/en.json`
- 60+ Top-Level-Namespaces. Für unsere Zwecke relevant:
  - `inboundInvoices` mit Sub-Keys: `approval`, `common`, `datev`, `detail`, `emailLog`, `imap`, `lineItems`, `list`, `policy`, `settings`, `status`, `supplier`, `upload`
  - Nav-Labels in `sidebar`/`nav`: `inboundInvoices`, `inboundApprovals`, `inboundSettings`
  - Module-Labels: `name_inbound_invoices`, `desc_inbound_invoices`
- **Nutzungs-Pattern** – `src/components/invoices/inbound-invoice-list.tsx:5,50`:

```tsx
import { useTranslations } from 'next-intl'

export function InboundInvoiceList() {
  const t = useTranslations('inboundInvoices')
  // ...
  return <Input placeholder={t('list.searchPlaceholder')} />
}
```

**Existiert nicht / fehlt:**

- **Kein `paymentRuns`/`zahlungslaeufe` Namespace** in `messages/de.json` oder `messages/en.json`.
- Im `billing`-Namespace existieren generische Payment-Keys (`billing_payment`, `paymentFormTitle`, `paymentFieldDate`, `paymentTermDays`) – aber **nicht SEPA-spezifisch**.

## 12. Existierende SEPA-Spuren im Codebase

**Existiert:**

- **CRM-Bankkonto-UI und -Service** als Datenlieferant für pain.001 (IBAN/BIC auf `CrmBankAccount`):
  - `src/components/crm/bank-account-list.tsx`
  - `src/components/crm/bank-account-form-dialog.tsx`
- **IBAN/BIC-Felder** auf: `BillingTenantConfig`, `CrmBankAccount`, `InboundInvoice` (`sellerIban`/`sellerBic`), `Employee` (Payroll), `EmployeeSavings.recipientIban` (VWL).
- **Creditor-Referenzen** (nicht SEPA-CI): `EmployeeGarnishment.creditorName`, `EmployeeGarnishment.creditorAddress` – Lohnpfändungs-Kontext, kein SEPA.
- **`BillingPayment`-Modell** (`supabase/migrations/20260101000101_create_billing_payments.sql`) – dokumentenbezogene Zahlungserfassung (Typ `CASH|BANK`, Status `ACTIVE|CANCELLED`, amount, date). **Kein Zahlungsbatching, keine SEPA-Initiation, keine Debitor-/Kreditor-Struktur.**
- **`billing-payment-service.ts`** berechnet Payment-Status (`UNPAID|PARTIAL|PAID|OVERPAID`) auf Ausgangsrechnungen.

**Suche nach Begriffen (`sepa`, `pain.001`, `pain001`, `PaymentRun`, `payment_run`, `CstmrCdtTrfInitn`, `GrpHdr`, `PmtInf`, `CdtTrfTxInf`)**:

- **Null Treffer** im `src/` für SEPA-spezifische XML-Begriffe.
- **Null Treffer** in `prisma/schema.prisma` für `PaymentRun`/`sepa`/`pain`.
- **Null Treffer** in `supabase/migrations/` für SEPA-Payment-Run-Strukturen.
- **Null TODO/Stub/Partial-Implementierung**.

**package.json – SEPA-bezogene Dependencies**:

- **Keine**. Keine Direct-Dep auf `sepa`, `sepa-xml`, `iban`, `ibantools`, `pain001`, `iso20022`, `ebics`, `ebics-sepa-builder`, `xmlbuilder`.

## Code References

**Prisma-Modelle**:
- `prisma/schema.prisma:95-281` — `Tenant`
- `prisma/schema.prisma:415-429` — `NumberSequence`
- `prisma/schema.prisma:437-496` — `CrmAddress`
- `prisma/schema.prisma:543-561` — `CrmBankAccount`
- `prisma/schema.prisma:976-1005` — `BillingTenantConfig`
- `prisma/schema.prisma:1726-1728` — `Employee.iban|bic|accountHolder`
- `prisma/schema.prisma:5596-5659` — `InboundInvoice`
- `prisma/schema.prisma:5985` — `EmployeeSavings.recipientIban`
- `prisma/schema.prisma:6010-6011` — `EmployeeGarnishment.creditor*`

**Migrations**:
- `supabase/migrations/20260413100000_create_inbound_invoice_tables.sql:98-99` — Status-Constraint
- `supabase/migrations/20260413100001_add_inbound_invoice_permissions_and_module.sql:20-75` — Permission Seed
- `supabase/migrations/20260416100000_add_payroll_master_data.sql:288-289` — Garnishment Creditor
- `supabase/migrations/20260101000101_create_billing_payments.sql` — BillingPayment
- `supabase/seed.sql` — NumberSequence-Prefixe

**Services (Inbound Invoice)**:
- `src/lib/services/inbound-invoice-service.ts` — `createFromUpload`, `list`, `update`, `updateLineItems`, `submitForApproval`, `assignSupplier`, `reopenExported`, `cancel`, `remove`, `getUploadUrl`, `getPdfSignedUrl`
- `src/lib/services/inbound-invoice-repository.ts:4-12, 36-95, 111-122` — `DEFAULT_INCLUDE`, `findMany`, `updateStatus`
- `src/lib/services/inbound-invoice-approval-service.ts:89-352` — `createApprovalSteps`, `approve`, `reject`, `handleMaterialChange`
- `src/lib/services/inbound-invoice-approval-repository.ts` — `findByInvoiceId`, `findOverdueSteps`, `findPendingForUser`
- `src/lib/services/inbound-invoice-line-item-repository.ts`
- `src/lib/services/inbound-invoice-datev-export-service.ts:188-316` — `exportToCsv`
- `src/lib/services/inbound-invoice-approval-service.ts:18` — `MATERIAL_FIELDS = ["totalNet","totalVat","totalGross","supplierId","dueDate"]`

**Services (andere)**:
- `src/lib/services/billing-document-einvoice-service.ts` — CII-XML via `@e-invoice-eu/core`
- `src/lib/services/zugferd-xml-parser.ts` — Parsing via `fast-xml-parser`
- `src/lib/services/billing-tenant-config-service.ts:32-33` — `iban?/bic?` optional
- `src/lib/services/billing-payment-service.ts` — `BillingPayment` CRUD, Payment-Status
- `src/lib/services/audit-logs-service.ts:173-214` — `log()`, `logBulk()`, `computeChanges()`

**tRPC Router**:
- `src/trpc/routers/_app.ts:89, 196` — `invoicesRouter` Registrierung
- `src/trpc/routers/invoices/index.ts:7-12` — `invoicesRouter` Komposition
- `src/trpc/routers/invoices/inbound.ts:13-24` — Permission-Konstanten + Modul-Guard
- `src/trpc/routers/invoices/inbound.ts:87-102` — `list`-Prozedur (Muster)
- `src/trpc/routers/invoices/inbound.ts:411-443` — `exportDatev`-Prozedur
- `src/trpc/routers/billing/documents.ts:355-382` — `downloadXml`-Prozedur (Supabase-Signed-URL-Muster)

**Auth/Permissions**:
- `src/lib/auth/permission-catalog.ts:12,27-29,342-348,401-403`
- `src/lib/auth/permissions.ts:26-93`
- `src/lib/auth/middleware.ts:40-59` — `requirePermission`

**UI**:
- `src/app/[locale]/(dashboard)/invoices/inbound/page.tsx`
- `src/app/[locale]/(dashboard)/invoices/inbound/[id]/page.tsx`
- `src/app/[locale]/(dashboard)/invoices/inbound/approvals/page.tsx`
- `src/app/[locale]/(dashboard)/invoices/inbound/settings/page.tsx:9-12,50-68`
- `src/components/invoices/inbound-invoice-list.tsx:49-100`
- `src/components/billing/tenant-config-form.tsx:134-154` — IBAN/BIC-Eingabe
- `src/components/employees/payroll/bank-details-tab.tsx:19-24,41-162` — IBAN-Masking-Pattern
- `src/components/layout/sidebar/sidebar-nav-config.ts:389-414`
- `src/components/ui/checkbox.tsx:9-36` — shadcn Checkbox mit `indeterminate`
- `src/components/ui/table.tsx:4-116`
- `src/components/ui/tabs.tsx`
- `src/components/approvals/approval-bulk-actions.tsx:37-63`
- `src/components/monthly-values/monthly-values-batch-actions.tsx:39-65`
- `src/components/employees/bulk-actions.tsx:36-37,109-130`
- `src/components/approvals/timesheet-approval-table.tsx:24-25,176-182`
- `src/components/approvals/absence-approval-table.tsx:29-30,160-166`
- `src/components/crm/bank-account-list.tsx`
- `src/components/crm/bank-account-form-dialog.tsx`

**Cron**:
- `src/app/api/cron/email-imap-poll/route.ts:17-117` — `*/3 * * * *`
- `src/app/api/cron/inbound-invoice-escalations/route.ts:40-126` — `0 * * * *`
- `vercel.json` — alle Cron-Schedules
- `src/app/api/cron/recurring-invoices/route.ts` — Pattern-Referenz für tägliche Tenant-Iteration
- `src/app/api/cron/platform-subscription-autofinalize/route.ts` — Pattern-Referenz für idempotente Folge-Crons

**i18n**:
- `src/i18n/routing.ts`, `src/i18n/request.ts:1-13`, `src/i18n/navigation.ts:1-5`
- `messages/de.json`, `messages/en.json` — Namespace `inboundInvoices`

**Tests**:
- `vitest.config.ts:1-19`
- `src/trpc/routers/__tests__/helpers.ts` — Mock-Helpers
- `src/lib/services/__tests__/inbound-invoice-service.test.ts`
- `src/lib/services/__tests__/inbound-invoice-service.integration.test.ts`
- `src/lib/services/__tests__/inbound-invoice-approval-service.integration.test.ts:46-57,71-94`
- `src/lib/services/__tests__/inbound-invoice-datev-export-service.test.ts`
- `src/lib/services/__tests__/billing-document-einvoice-service.test.ts:9-73`
- `src/lib/services/__tests__/zugferd-parser-service.test.ts:18-26`
- `src/lib/services/__tests__/audit-logs-service.test.ts:40-79`

**package.json**:
- `package.json:44` — `"validate:einvoice"` Skript (KoSIT-Java)
- `package.json:52` — `@e-invoice-eu/core@^2.3.4`
- `package.json:55` — `@prisma/client@^7.4.2`
- `package.json:89` — `exceljs@^4.4.0`
- `package.json:90` — `fast-xml-parser@^5.5.10`
- `tools/kosit/README.md` — KoSIT-Validator-Setup

## Architecture Insights

- **Service + Repository + tRPC-Thin-Router** – bestätigt via Inbound-Invoice-Vertikale. Services kapseln Business-Logik, Repositories die Prisma-Queries, Router sind dünne Permission- + Validation-Wrappers.
- **Status-Transitions sind dezentral** – kein State-Machine-Helper, jede Transition-Funktion setzt `status` direkt + ruft `auditLog.log()`.
- **Audit-Logging ist fire-and-forget** – `log()` schluckt Fehler, schreibt bei Platform-Impersonation doppelt (`auditLog` + `platformAuditLog`).
- **Permissions sind deterministisch per UUIDv5 aus Key abgeleitet**, was Seeding in SQL-Migrationen ohne TS-Runtime-Abhängigkeit ermöglicht.
- **Modul-Guard + Permission-Check getrennt** – `requireModule("inbound_invoices")` zuerst, dann `requirePermission(ID)`.
- **File-Download via tRPC** ist eingebürgert – entweder base64 (DATEV) oder via Supabase Signed URL (E-Rechnung).
- **Cron-Routes sind CRON_SECRET-gehärtet** und iterieren Tenant-weise mit Checkpoint-Pattern; werden in `vercel.json` gescheduled.
- **IBAN/BIC-Felder existieren in 4 verschiedenen Modellen** (BillingTenantConfig, CrmBankAccount, InboundInvoice, Employee/EmployeeSavings) – ohne gemeinsame Normalisierung oder Validator-Helper.

## Risiken und Überraschungen

**1. `InboundInvoice` kennt keinen Bezahl-Status.**
Das Status-Feld ist ein Freitext-String (`String(30)`) mit CHECK-Constraint auf 6 Werten. Keine `PAID`/`IN_PAYMENT`-Semantik, kein `paidAt`, kein `paymentStatus`. „Gebucht markieren" durch den Buchhalter hat heute keinen Ort, an dem es persistiert werden könnte, außer über einen neuen `PaymentRunItem.status` oder ein zusätzliches Feld auf `InboundInvoice`. Wer den Status nach Bezahlung setzen darf/muss, ist offen.

**2. `BillingTenantConfig.iban`, `bic`, `companyName`, `companyStreet/Zip/City/Country` sind alle nullable.**
Eigene Bankdaten des Mandanten sind im Schema als optional modelliert – ein Mandant kann einen SEPA-Lauf theoretisch ohne IBAN/Auftraggeber-Name starten. Es gibt keine Datenbank-seitige Garantie, dass diese Felder bei aktivierter Zahlungslauf-Funktion existieren.

**3. Strukturierte Lieferantenadresse ist komplett nullable.**
- `CrmAddress.street/zip/city/country` – alle `String?`, `country` mit `default "DE"` (aber immer noch nullable).
- `InboundInvoice.sellerStreet/Zip/City/Country` – alle nullable.
- Realen Datenbestand (wie viele Datensätze haben eine vollständige Adresse?) ist aus dem Codebase nicht ableitbar – muss per SQL-Query am DB-Stand gemessen werden.
- pain.001.001.09 erlaubt zwar auch `UnstructuredAddress` mit Adresszeilen, viele Banken akzeptieren aber nur `StructuredAddress` – hier ist die Datenqualität ein echtes Planungsrisiko.

**4. `InboundInvoice.sellerIban` vs. `CrmBankAccount.iban` – zwei Wahrheiten.**
- `sellerIban` wird aus dem ZUGFeRD-XML befüllt (`zugferd-xml-parser.ts`).
- `CrmBankAccount.iban` wird vom User in der CRM-UI gepflegt.
- Keine Synchronisation, keine Konsistenz-Prüfung, kein „Default pro Lieferant"-Enforcement. Ein Lieferant kann mehrere `CrmBankAccount`s mit `isDefault=true` haben – oder gar keinen Default. In welcher Reihenfolge die IBAN für einen Payment-Run gewählt wird, ist nicht modelliert.
- Für Rechnungen ohne ZUGFeRD-Parsing und ohne zugeordneten Lieferanten (`supplierId=null`, `supplierStatus="unknown"|"pending_review"`) gibt es **keinen IBAN-Datensatz**.

**5. `CrmBankAccount.bic` ist nullable, `iban` ist NOT NULL.**
pain.001.001.09 verlangt BIC nur noch optional (IBAN-only möglich seit 2016). Aber: bei grenzüberschreitenden Transfers ist BIC oft Pflicht, und einige Banken verweigern SEPA-Uploads ohne BIC. Wird als fehlend bzw. optional durchgereicht, hat das Feature eine Qualitäts-Lücke.

**6. Keine Gläubiger-ID (Creditor Identifier) im Schema.**
Für pain.001 (Credit Transfer) ist die CI nicht zwingend, für pain.008 (Direct Debit) aber zwingend. Falls das Feature später um Lastschrift erweitert wird, muss ein neues Feld her. Für den Credit-Transfer-Fall allein kein Blocker, aber planungsrelevant.

**7. Keine IBAN-/BIC-Validierung im Codebase.**
Weder Regex noch MOD-97-Check noch Länder-Längen-Tabelle. Alle IBAN-Felder sind freier Text mit `VarChar(34)`/`VarChar(11)` als einzigem Zwang. Verdrucker, Leerzeichen, Ländercode-Fehler können heute in jedes dieser Felder gelangen.

**8. Keine SEPA-Library, keine XSD-Datei, keine XSD-Runtime-Validierung.**
Weder `@e-invoice-eu/core` noch `fast-xml-parser` beherrschen pain.001 nativ. Der KoSIT-Validator ist ein externes Java-Tool für XRechnung, keine Laufzeit-XML-Validierung im Node-Prozess. Jede pain.001-Erzeugung läuft heute technisch „ins Leere" – weder zur Erzeugung noch zur Prüfung gibt es Bordmittel.

**9. Eingangsrechnungs-Modul nutzt Sidebar-Navigation, keine Top-Level-Tabs.**
Der geplante „Tab Zahlungsläufe" existiert als Pattern im Modul **nicht**. Entweder wird eine neue Page analog zu `/invoices/inbound/approvals` und `/settings` eingeführt, oder das Modul wird strukturell umgebaut. Die einzige existierende Tab-Nutzung ist **innerhalb** der Settings-Page (imap/approval-rules/email-log).

**10. Bulk-Auswahl-Pattern existiert, aber nicht im Eingangsrechnungs-Modul.**
`src/components/invoices/inbound-invoice-list.tsx` hat heute nur Row-Actions. Das Set<string>+Checkbox-Indeterminate-Pattern ist 4-5 Mal kopiert (approvals, monthly-values, employees, timesheet/absence) – eine neue Liste müsste das Muster erneut kopieren.

**11. Kein Cron für Payments/SEPA – aber Pattern vorhanden.**
`recurring-invoices` und `platform-subscription-autofinalize` liefern gute Vorlagen (tägliche Tenant-Iteration, idempotentes Finalisieren per Marker). Für reine DRAFT→EXPORTED-Übergänge durch User-Aktion wird vermutlich kein Cron benötigt. Erinnerungen an „EXPORTED seit X Tagen, nicht gebucht" müssten einen neuen Cron erfordern.

**12. Keine Relation `InboundInvoice → PaymentRun` heute.**
Weder als `@relation` noch als FK. Die Erweiterung ist Greenfield – aber es gibt auch keine bestehenden Indexe/Constraints, die das neue Schema berücksichtigen. Besonders: der kombinierte Lookup „alle APPROVED-Rechnungen mit `dueDate BETWEEN NOW AND NOW+7d`, die in keinem aktiven (nicht-CANCELLED) PaymentRun liegen" ist heute ohne Join gegen eine noch nicht existierende Tabelle nicht implementierbar.

**13. Der Parameter „wie viele Datensätze haben heute vollständige Daten" ist aus Code nicht beantwortbar.**
Die Fragen im Auftrag („Lieferanten ohne sellerIban/ohne CrmBankAccount → wie viele betroffen") lassen sich nur am tatsächlichen Datenbank-Stand per SQL messen. Der Codebase gibt darüber keine Auskunft – das muss vor der Planung an einer echten DB (Staging) geprüft werden.

**14. `BillingTenantConfig`-Settings-UI liegt unter `/admin/billing-config`.**
Sie ist dort, wo der Operator sie am wenigsten vermutet, wenn er „Eingangsrechnungs-Bankdaten" sucht – nämlich nicht unter `/invoices/inbound/settings`. Das Routing des Zahlungslauf-Features muss wissen, wo die eigene IBAN herkommt.

**15. `exchange`/Überraschung – `submittedAt` statt `approvedAt`.**
`InboundInvoice` hat `submittedAt` (Zeitpunkt der Vorlage zur Freigabe) und `datevExportedAt`, aber kein dediziertes `approvedAt`-Timestamp. Der Freigabe-Zeitpunkt lebt auf `InboundInvoiceApproval` pro Step. Für ein „was wurde in den letzten 7 Tagen freigegeben?"-Filter ist der Query nicht trivial – ein Default-Vorschlag per Due-Date (wie geplant) ist robuster, aber ein „Approval-Datum"-Filter würde einen Join auf die Approval-Tabelle nötig machen.

## Related Research

- `thoughts/shared/research/2026-04-07-terp-invoice-phase1-eingangsrechnungen.md` — Ursprüngliche Phase-1-Recherche zum Eingangsrechnungs-Modul
- `thoughts/shared/research/2026-04-12_15-34-14_inbound-invoice-order-costcenter-bestandsaufnahme.md` — Bestandsaufnahme für Auftrag/Kostenstelle-Erweiterung auf Eingangsrechnungen
- `thoughts/shared/research/2026-04-02-email-smtp-infrastructure.md` — IMAP/Email-Poller-Kontext

## Open Questions

1. **Wie viele `CrmAddress SUPPLIER`-Datensätze haben heute (a) 0 Bankkonten, (b) >1 Default-Bankkonto, (c) genau 1 Default?** → nur via DB-Query beantwortbar.
2. **Wie vollständig sind `seller{Street,Zip,City,Country}` auf bestehenden `InboundInvoice`-Datensätzen?** → nur via DB-Query.
3. **Wie oft divergiert `InboundInvoice.sellerIban` von `CrmBankAccount.iban` des verknüpften Lieferanten?** → nur via DB-Query.
4. **Haben die produktiven Mandanten `BillingTenantConfig.iban` gesetzt?** → nur via DB-Query.
5. **Soll „als gebucht markieren" idempotent sein (mehrfach, ohne Nebenwirkung) oder als harte Transition?** → Produktentscheidung.
6. **Soll der EXPORTED-Status der `InboundInvoice` durch den PaymentRun (re)set werden, oder bleibt EXPORTED dem DATEV-Flow vorbehalten?** → Konflikt zweier Exportwege, Produktentscheidung.
7. **Wird pain.001 im Node-Prozess serialisiert (Hand-Roll via `fast-xml-parser` `XMLBuilder`) oder eine neue Lib hinzugefügt?** → rein technische Entscheidung.
