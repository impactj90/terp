---
date: 2026-04-12T15:30:27Z
researcher: Tolga Ayvazoglu
git_commit: 5b1b0d19bd70e070030805866f81a4dfe49f6700
branch: master
repository: terp
topic: "Bestandsaufnahme: Eingangsrechnungen mit Order/CostCenter-Zuordnung"
tags: [research, codebase, inbound-invoices, orders, cost-centers, datev-export]
status: complete
last_updated: 2026-04-12
last_updated_by: Tolga Ayvazoglu
---

# Research: Bestandsaufnahme Eingangsrechnungen mit Order/CostCenter-Zuordnung

**Date**: 2026-04-12T15:30:27Z
**Researcher**: Tolga Ayvazoglu
**Git Commit**: 5b1b0d19bd70e070030805866f81a4dfe49f6700
**Branch**: master
**Repository**: terp

## Research Question

Vollständige Bestandsaufnahme der betroffenen Code-Bereiche für die Erweiterung: Eingangsrechnungen sollen optional einem Auftrag (Order) und/oder einer Kostenstelle (CostCenter) zugeordnet werden können.

---

## 1. InboundInvoice-Modell

### Prisma-Schema (vollständig)

**Datei**: `prisma/schema.prisma:5594-5651`

```prisma
model InboundInvoice {
  id                  String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId            String    @map("tenant_id") @db.Uuid
  number              String    @db.VarChar(50)
  source              String    @default("manual") @db.VarChar(20)
  sourceEmailLogId    String?   @map("source_email_log_id") @db.Uuid
  sourceMessageId     String?   @map("source_message_id") @db.VarChar(500)
  supplierId          String?   @map("supplier_id") @db.Uuid
  supplierStatus      String    @default("matched") @map("supplier_status") @db.VarChar(20)
  invoiceNumber       String?   @map("invoice_number") @db.VarChar(100)
  invoiceDate         DateTime? @map("invoice_date") @db.Date
  dueDate             DateTime? @map("due_date") @db.Date
  totalNet            Decimal?  @map("total_net") @db.Decimal(12, 2)
  totalVat            Decimal?  @map("total_vat") @db.Decimal(12, 2)
  totalGross          Decimal?  @map("total_gross") @db.Decimal(12, 2)
  currency            String    @default("EUR") @db.VarChar(3)
  paymentTermDays     Int?      @map("payment_term_days")
  sellerName          String?   @map("seller_name") @db.VarChar(255)
  sellerVatId         String?   @map("seller_vat_id") @db.VarChar(50)
  sellerTaxNumber     String?   @map("seller_tax_number") @db.VarChar(50)
  sellerStreet        String?   @map("seller_street") @db.VarChar(255)
  sellerZip           String?   @map("seller_zip") @db.VarChar(20)
  sellerCity          String?   @map("seller_city") @db.VarChar(100)
  sellerCountry       String?   @map("seller_country") @db.VarChar(5)
  sellerIban          String?   @map("seller_iban") @db.VarChar(34)
  sellerBic           String?   @map("seller_bic") @db.VarChar(11)
  buyerName           String?   @map("buyer_name") @db.VarChar(255)
  buyerVatId          String?   @map("buyer_vat_id") @db.VarChar(50)
  buyerReference      String?   @map("buyer_reference") @db.VarChar(100)
  zugferdProfile      String?   @map("zugferd_profile") @db.VarChar(30)
  zugferdRawXml       String?   @map("zugferd_raw_xml") @db.Text
  pdfStoragePath      String?   @map("pdf_storage_path") @db.Text
  pdfOriginalFilename String?   @map("pdf_original_filename") @db.VarChar(255)
  status              String    @default("DRAFT") @db.VarChar(30)
  approvalVersion     Int       @default(1) @map("approval_version")
  submittedBy         String?   @map("submitted_by") @db.Uuid
  submittedAt         DateTime? @map("submitted_at") @db.Timestamptz(6)
  datevExportedAt     DateTime? @map("datev_exported_at") @db.Timestamptz(6)
  datevExportedBy     String?   @map("datev_exported_by") @db.Uuid
  notes               String?   @db.Text
  createdAt           DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdBy           String?   @map("created_by") @db.Uuid

  tenant           Tenant                    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  supplier         CrmAddress?               @relation(fields: [supplierId], references: [id], onDelete: SetNull)
  sourceEmailLog   InboundEmailLog?          @relation(fields: [sourceEmailLogId], references: [id], onDelete: SetNull)
  submitter        User?                     @relation("InboundInvoiceSubmitter", fields: [submittedBy], references: [id], onDelete: SetNull)
  datevExporter    User?                     @relation("InboundInvoiceDatevExporter", fields: [datevExportedBy], references: [id], onDelete: SetNull)
  createdByUser    User?                     @relation("InboundInvoiceCreator", fields: [createdBy], references: [id], onDelete: SetNull)
  lineItems        InboundInvoiceLineItem[]
  approvals        InboundInvoiceApproval[]

  @@index([tenantId, status], map: "idx_inbound_invoices_tenant_status")
  @@index([tenantId, supplierId], map: "idx_inbound_invoices_tenant_supplier")
  @@index([tenantId, invoiceDate(sort: Desc)], map: "idx_inbound_invoices_tenant_date")
  @@map("inbound_invoices")
}
```

### Status-Workflow (6 Status-Werte)

Status ist **kein Prisma-Enum**, sondern ein `String @db.VarChar(30)` mit folgenden Werten:

| Status | Bedeutung |
|--------|-----------|
| `DRAFT` | Initialzustand, editierbar |
| `PENDING_APPROVAL` | Wartet auf Freigabe |
| `APPROVED` | Alle Freigabeschritte genehmigt |
| `REJECTED` | Freigabe abgelehnt |
| `EXPORTED` | DATEV-Export durchgeführt |
| `CANCELLED` | Storniert (Endzustand) |

**State-Machine:**
```
DRAFT ─→ submitForApproval ─→ PENDING_APPROVAL (wenn Policies) / APPROVED (ohne Policies)
DRAFT ─→ cancel ─→ CANCELLED
DRAFT ─→ delete (Hard Delete, nur DRAFT)
PENDING_APPROVAL ─→ alle Steps genehmigt ─→ APPROVED
PENDING_APPROVAL ─→ ein Step abgelehnt ─→ REJECTED
PENDING_APPROVAL ─→ Material-Feldänderung ─→ DRAFT (Approvals invalidiert)
APPROVED ─→ exportDatev ─→ EXPORTED
REJECTED ─→ Re-Edit + Re-Submit ─→ DRAFT
EXPORTED ─→ reopenExported ─→ DRAFT
CANCELLED (Endzustand)
```

**Material-Felder** (lösen approvalVersion-Increment aus): `totalNet`, `totalVat`, `totalGross`, `supplierId`, `dueDate`

### Bestehende Verknüpfungen

**Existiert**: Supplier (`supplierId` → CrmAddress), Email-Quelle, Benutzer-Audit
**Fehlt**: Keine Verknüpfung zu Order, CostCenter, Project oder anderen Entitäten.

### Service-Funktionen (Schreibzugriffe)

**Datei**: `src/lib/services/inbound-invoice-service.ts`

| Funktion | Beschreibung |
|----------|-------------|
| `createFromUpload(prisma, tenantId, file, filename, userId, audit?)` | Erstellt aus PDF, parst ZUGFeRD, matched Supplier |
| `update(prisma, tenantId, id, data, audit?)` | Update nur bei DRAFT/REJECTED; approvalVersion bei Material-Änderung |
| `updateLineItems(prisma, tenantId, invoiceId, items, audit?)` | Summen-Validierung (±0.01 Toleranz) |
| `assignSupplier(prisma, tenantId, id, supplierId, audit?)` | Supplier-Zuweisung |
| `submitForApproval(prisma, tenantId, id, userId, audit?)` | DRAFT/REJECTED → PENDING_APPROVAL/APPROVED |
| `reopenExported(prisma, tenantId, id, audit?)` | EXPORTED → DRAFT |
| `cancel(prisma, tenantId, id, audit?)` | → CANCELLED |
| `remove(prisma, tenantId, id, audit?)` | Hard Delete, nur DRAFT |

**Datei**: `src/lib/services/inbound-invoice-approval-service.ts`

| Funktion | Beschreibung |
|----------|-------------|
| `createApprovalSteps(prisma, tenantId, invoiceId, grossAmount, approvalVersion)` | Erzeugt Steps aus Policies |
| `approve(prisma, tenantId, invoiceId, approvalId, userId, audit?)` | Genehmigt Step; bei alle Steps → APPROVED |
| `reject(prisma, tenantId, invoiceId, approvalId, userId, reason, audit?)` | → REJECTED |
| `handleMaterialChange(prisma, tenantId, invoiceId, newVersion)` | Invalidiert alte Approvals |

### tRPC-Mutations

**Datei**: `src/trpc/routers/invoices/inbound.ts`

| Procedure | Permission | Service-Funktion |
|-----------|-----------|-----------------|
| `createFromUpload` | `inbound_invoices.upload` | `service.createFromUpload()` |
| `update` | `inbound_invoices.edit` | `service.update()` |
| `updateLineItems` | `inbound_invoices.edit` | `service.updateLineItems()` |
| `assignSupplier` | `inbound_invoices.edit` | `service.assignSupplier()` |
| `submitForApproval` | `inbound_invoices.edit` | `service.submitForApproval()` |
| `reopenExported` | `inbound_invoices.manage` | `service.reopenExported()` |
| `cancel` | `inbound_invoices.manage` | `service.cancel()` |
| `remove` | `inbound_invoices.manage` | `service.remove()` |
| `approve` | `inbound_invoices.approve` | `approvalService.approve()` |
| `reject` | `inbound_invoices.approve` | `approvalService.reject()` |
| `exportDatev` | `inbound_invoices.export` | `datevExportService.exportToCsv()` |

### Hooks

**Datei**: `src/hooks/useInboundInvoices.ts`

Alle Query- und Mutation-Hooks vorhanden (1:1 Mapping auf tRPC-Procedures), inklusive automatischer Cache-Invalidierung.

---

## 2. CostCenter-Modell und Order-Modell

### CostCenter Prisma-Schema

**Datei**: `prisma/schema.prisma:1344-1364`

```prisma
model CostCenter {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  code        String   @db.VarChar(50)
  name        String   @db.VarChar(255)
  description String?  @db.Text
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant    Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employees Employee[]
  orders    Order[]

  @@unique([tenantId, code], map: "cost_centers_tenant_id_code_key")
  @@index([tenantId], map: "idx_cost_centers_tenant")
  @@index([tenantId, isActive], map: "idx_cost_centers_active")
  @@map("cost_centers")
}
```

### Order Prisma-Schema

**Datei**: `prisma/schema.prisma:2110-2142`

```prisma
model Order {
  id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId           String    @map("tenant_id") @db.Uuid
  code               String    @db.VarChar(50)
  name               String    @db.VarChar(255)
  description        String?   @db.Text
  status             String    @default("active") @db.VarChar(20)
  customer           String?   @db.VarChar(255)
  costCenterId       String?   @map("cost_center_id") @db.Uuid
  billingRatePerHour Decimal?  @map("billing_rate_per_hour") @db.Decimal(10, 2)
  validFrom          DateTime? @map("valid_from") @db.Date
  validTo            DateTime? @map("valid_to") @db.Date
  isActive           Boolean   @default(true) @map("is_active")
  createdAt          DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant              Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  costCenter          CostCenter?       @relation(fields: [costCenterId], references: [id], onDelete: SetNull)
  assignments         OrderAssignment[]
  defaultForEmployees Employee[]        @relation("EmployeeDefaultOrder")
  orderBookings       OrderBooking[]
  crmInquiries        CrmInquiry[]
  billingDocuments    BillingDocument[]
  billingServiceCases BillingServiceCase[]

  @@unique([tenantId, code], map: "orders_tenant_id_code_key")
  @@index([tenantId], map: "idx_orders_tenant")
  @@index([tenantId, isActive], map: "idx_orders_tenant_active")
  @@index([tenantId, status], map: "idx_orders_tenant_status")
  @@index([costCenterId], map: "idx_orders_cost_center")
  @@map("orders")
}
```

### Order.costCenterId Nutzung

**Geschrieben in**:
- `src/lib/services/order-service.ts:119` — `create()`: `costCenterId: input.costCenterId || undefined`
- `src/lib/services/order-service.ts:225-226` — `update()`: `if (input.costCenterId !== undefined) { data.costCenterId = input.costCenterId }`
- `src/trpc/routers/orders.ts:60-70` — Create-Input: `costCenterId: z.string().optional()`
- `src/trpc/routers/orders.ts:72-84` — Update-Input: `costCenterId: z.string().nullable().optional()`

**Gelesen in**:
- `src/lib/services/order-repository.ts:10-14` — `orderInclude` enthält `costCenter: { select: { id: true, code: true, name: true } }`
- Wird in `findMany()` und `findById()` mitgeladen
- `src/trpc/routers/orders.ts:91-128` — `mapOrderToOutput()` mapped costCenter in Output

**UI**:
- `src/components/orders/order-form-sheet.tsx:280-301` — Select-Dropdown mit `useCostCenters({ enabled: open })`
- Format: `"{code} - {name}"`, Sentinel `__none__` für "Keine Kostenstelle"

### Auswertungs-Endpoints

**Fehlt**: Kein Endpoint "alles zu Auftrag X" oder "alles zu Kostenstelle Y" als Aggregation.

**Vorhanden**:
- `orderBookings.list` mit Filter `orderId` — gibt Buchungen pro Auftrag
- `reports.generate` akzeptiert `costCenterIds?: string[]`, nutzt es aber nur für Mitarbeiter-Filterung
- BillingDocument hat `orderId`-FK, aber kein aggregierender Endpoint darauf

### Dropdown-taugliche Endpoints

| Endpoint | Datei | Sortierung | Filter |
|----------|-------|------------|--------|
| `costCenters.list` | `src/trpc/routers/costCenters.ts:88-120` | `code ASC` | `isActive?: boolean` |
| `orders.list` | `src/trpc/routers/orders.ts:142-162` | `code ASC` | `isActive?: boolean`, `status?: string` |

**Hooks**: `useCostCenters()` in `src/hooks/use-cost-centers.ts`, `useOrders()` in `src/hooks/use-orders.ts`

---

## 3. Eingangsrechnungs-UI

### Pages

| Route | Datei | Inhalt |
|-------|-------|--------|
| `/invoices/inbound` | `src/app/[locale]/(dashboard)/invoices/inbound/page.tsx` | Liste aller ER |
| `/invoices/inbound/[id]` | `src/app/[locale]/(dashboard)/invoices/inbound/[id]/page.tsx` | Detail/Bearbeitung |
| `/invoices/inbound/approvals` | `src/app/[locale]/(dashboard)/invoices/inbound/approvals/page.tsx` | Pending Approvals |
| `/invoices/inbound/settings` | `src/app/[locale]/(dashboard)/invoices/inbound/settings/page.tsx` | IMAP, Approval Rules, Email Log |

### Formular-Komponente

**Kein dediziertes Form**: Die Bearbeitung geschieht **inline** in der Detail-Seite.

**Datei**: `src/components/invoices/inbound-invoice-detail.tsx:43-501`

- Layout: Zwei-Spalten-Split (PDF links, Sidebar rechts)
- React-State für Formularfelder (Zeilen 62-65)
- **Sidebar-Cards**:
  - Invoice Data Card (Zeilen 293-366): invoiceNumber, invoiceDate, dueDate, totalNet/Vat/Gross, paymentTermDays
  - Supplier Card (Zeilen 369-395): Assigned Supplier oder ZUGFeRD-Seller-Info
  - Approval History Card (Zeilen 398-406): Timeline, nur bei nicht-DRAFT
  - ZUGFeRD Info Card (Zeilen 410-422)
  - Notes Card (Zeilen 425-438)
- **Line Items**: `InboundInvoiceLineItems` Komponente unterhalb des Split-Pane (Zeilen 446-451)

**Upload**: `src/components/invoices/inbound-invoice-upload-dialog.tsx:21-149` — Drag-and-Drop PDF

### Freigabe-Workflow UI

| Komponente | Datei | Beschreibung |
|-----------|-------|-------------|
| `InboundPendingApprovals` | `src/components/invoices/inbound-pending-approvals.tsx:23-107` | Tabelle wartender Freigaben |
| `InboundApprovalTimeline` | `src/components/invoices/inbound-approval-timeline.tsx:32-94` | Timeline-Visualisierung der Steps |
| Aktions-Buttons | `src/components/invoices/inbound-invoice-detail.tsx:234-262` | Save, Submit, Approve, Reject, DATEV Export |

### Combobox/Dropdown-Patterns (Suche)

Das Projekt nutzt **kein shadcn Command/cmdk** für Entity-Auswahl. Stattdessen gibt es zwei Patterns:

**Pattern 1: Popover + Input** (Autocomplete)
- **Beispiel**: `DescriptionCombobox` in `src/components/billing/document-position-table.tsx:88-177`
- **Beispiel**: `ArticleSearchPopover` in `src/components/warehouse/article-search-popover.tsx:36-145`
- Technik: `Popover` + `PopoverAnchor` + `Input`, Ergebnisliste mit `onMouseDown` + `e.preventDefault()`, `setTimeout` in `onBlur` (150ms)

**Pattern 2: Dialog + Input** (Suche in Dialog)
- **Beispiel**: `SupplierAssignmentDialog` in `src/components/invoices/supplier-assignment-dialog.tsx:24-105`
- Technik: `Dialog` + `Input` mit Search-Icon, Ergebnisliste als Buttons

**Pattern 3: Einfaches Select** (ohne Suche)
- Standard shadcn `Select` für kurze Listen (Status-Filter, Encryption-Type, etc.)
- `src/components/orders/order-form-sheet.tsx:280-301` nutzt einfaches `Select` für CostCenter

---

## 4. Eingangsrechnungs-Settings

### Settings-Page

**Existiert**: `src/app/[locale]/(dashboard)/invoices/inbound/settings/page.tsx:1-85`

Drei Tabs:
1. IMAP-Konfiguration → `ImapConfigForm`
2. Freigaberegeln → `ApprovalPolicyList`
3. Email-Log → `InboundEmailLog`

Permission-Guard: `email_imap.manage` ODER `inbound_invoices.manage`

### Settings-Modell

**TenantImapConfig** (`prisma/schema.prisma:5533-5557`): Per-Tenant IMAP-Konfiguration (host, port, username, password, encryption, mailbox, isVerified, Polling-State)

**InboundInvoiceApprovalPolicy** (`prisma/schema.prisma:5689-5707`): Freigaberegeln (amountMin, amountMax, stepOrder, approverGroupId/approverUserId, isActive)

**Kein generisches TenantSettings-Modell** für Eingangsrechnungen. Jede Einstellung hat ein eigenes Modell.

### Neuen Setting-Flag hinzufügen (Pattern)

1. Prisma-Schema erweitern (Feld mit Default)
2. SQL-Migration: `ALTER TABLE ... ADD COLUMN ... NOT NULL DEFAULT ...`
3. Service: Upsert-Input erweitern
4. tRPC: Input/Output-Schema erweitern
5. UI: Form-Feld hinzufügen (Switch für Boolean, Select für Enum)
6. Hook: ggf. Translation-Key

**Referenz**: IMAP-Config-Flow als Vorlage:
- Service: `src/lib/services/email-imap-config-service.ts`
- Repository: `src/lib/services/email-imap-config-repository.ts`
- Router: `src/trpc/routers/invoices/imapConfig.ts`
- Form: `src/components/invoices/imap-config-form.tsx`
- Hook: `src/hooks/useImapConfig.ts`

---

## 5. DATEV-Export für Eingangsrechnungen

### Export-Service

**Datei**: `src/lib/services/inbound-invoice-datev-export-service.ts`

### Exportierte Felder (14 Spalten, Buchungsstapel-Format)

| Pos | DATEV-Feld | Quelle | Bemerkung |
|-----|-----------|--------|-----------|
| 1 | Umsatz (ohne S/H-Kz) | `totalGross` | Komma-Dezimal |
| 2 | Soll/Haben-Kennzeichen | hardcoded `"S"` | |
| 3 | WKZ Umsatz | hardcoded `"EUR"` | |
| 4 | Kurs | leer | Phase 3 |
| 5 | Basis-Umsatz | leer | Phase 3 |
| 6 | WKZ Basis-Umsatz | leer | Phase 3 |
| 7 | Konto | leer | **Phase 3: Aufwandskonto** |
| 8 | Gegenkonto | leer | **Phase 3: Kreditorenkonto** |
| 9 | BU-Schlüssel | VAT via `VAT_KEY_MAP` | 19%→9, 7%→8, 0%→0 |
| 10 | Belegdatum | `invoiceDate` | Format DDMM |
| 11 | Belegfeld 1 | `invoiceNumber` | Max 12 Zeichen |
| 12 | Belegfeld 2 | leer | |
| 13 | Skonto | leer | |
| 14 | Buchungstext | `supplier.company`/`sellerName` + `invoiceNumber` | Max 60 Zeichen |

**KOST1/KOST2 fehlen komplett** — werden aktuell nicht exportiert.

### Liquid-Template-Engine

**Datei**: `src/lib/services/liquid-engine.ts`

LiquidJS ist als Template-Engine vorhanden mit DATEV-spezifischen Filtern:
- `datev_date` — Datumsformatierung (TTMMJJJJ, etc.)
- `datev_decimal` — Komma-Dezimal
- `datev_string` — Semicolon-sichere Strings
- `pad_left`, `pad_right` — Padding

**Aber**: Der Inbound-Invoice-DATEV-Export nutzt **kein Liquid-Template**. Er baut die CSV direkt im Code (`buildDatevHeader()`, `buildColumnHeader()`, Row-Array). Liquid wird im Payroll-Export-Kontext verwendet.

### KOST1/KOST2 im Codebase

**Nicht vorhanden**: Weder KOST1 noch KOST2 werden irgendwo im Code verwendet.

**Kostenstelle** wird verwendet in:
- Payroll-Export (`src/lib/services/payroll-export-service.ts:139-166`): Spalte "Kostenstelle" mit `costCenterCode` pro Zeile
- Das ist aber **DATEV LODAS-Format** (Lohn), nicht Buchungsstapel

### Header-Spezifikation

```
EXTF;700;21;Buchungsstapel;12;{timestamp};;;{beraterNr};{mandantenNr};{fiscalYearStart};;4;;;;;0;;
```

- Datenkategorie 21 = Buchungsstapel
- Sachkontenlänge = 4
- Buchungstyp 0 = Eingangsrechnungen
- Encoding: Windows-1252, CRLF

### Alle DATEV-Exports im Codebase

1. **Inbound Invoice Buchungsstapel** — `src/lib/services/inbound-invoice-datev-export-service.ts` (ohne KOST)
2. **Payroll LODAS** — `src/lib/services/payroll-export-service.ts` (mit Kostenstelle, UTF-8)

---

## 6. Berechtigungen

### inbound_invoices.* Permissions

**Datei**: `src/lib/auth/permission-catalog.ts:342-348`

```typescript
p("inbound_invoices.view", "inbound_invoices", "view", "View inbound invoices"),
p("inbound_invoices.upload", "inbound_invoices", "upload", "Upload inbound invoices"),
p("inbound_invoices.edit", "inbound_invoices", "edit", "Edit inbound invoices"),
p("inbound_invoices.approve", "inbound_invoices", "approve", "Approve inbound invoices"),
p("inbound_invoices.export", "inbound_invoices", "export", "Export inbound invoices"),
p("inbound_invoices.manage", "inbound_invoices", "manage", "Manage inbound invoices"),
```

Zusätzlich:
- `email_imap.view`, `email_imap.manage` (für IMAP-Settings)

### Verwandte Permissions

- `cost_centers.manage` (Zeile 208)
- `orders.manage` (Zeile 143)

### Permission-Prüfung in Routern

**Datei**: `src/trpc/routers/invoices/inbound.ts:13-20`

```typescript
const VIEW = permissionIdByKey("inbound_invoices.view")!
const UPLOAD = permissionIdByKey("inbound_invoices.upload")!
const EDIT = permissionIdByKey("inbound_invoices.edit")!
const APPROVE = permissionIdByKey("inbound_invoices.approve")!
const EXPORT = permissionIdByKey("inbound_invoices.export")!
const MANAGE = permissionIdByKey("inbound_invoices.manage")!
```

Jede Procedure: `invProcedure.use(requirePermission(PERMISSION_ID))`

### Middleware

**Datei**: `src/lib/auth/middleware.ts:30-59`

`requirePermission(...permissionIds)` — OR-Logik. Prüft `hasAnyPermission(user, permissionIds)`.

**Datei**: `src/lib/auth/permissions.ts:73-93`

`hasPermission(user, permissionId)`: isAdmin → true; dann `userGroup.permissions.includes(id)` oder Key-Lookup.

### Zentrale Definition

- **Catalog**: `src/lib/auth/permission-catalog.ts` — 146 Permissions mit UUID v5 (deterministisch, Go-Backend-kompatibel)
- **Seed**: `supabase/seed.sql:126-148` — Admin (isAdmin=true), Users (3 Basis-Permissions)
- **Migration**: `supabase/migrations/20260413100001_add_inbound_invoice_permissions_and_module.sql` — Weist 8 Permissions an ADMIN, BUCHHALTUNG, VORGESETZTER, PERSONAL Gruppen zu

### Modul-Guard

Alle Inbound-Invoice-Procedures: `tenantProcedure.use(requireModule("inbound_invoices"))`

---

## 7. Auswertungen / Reporting

### Order-Detail-Page Tabs

**Datei**: `src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx:187-302`

Aktuell 3 Tabs:
1. **Details** — Stammdaten (Code, Name, Beschreibung, Status, Kunde, Gültigkeitszeitraum, Stundensatz, Kostenstelle)
2. **Assignments** — Mitarbeiter-Zuweisungen
3. **Bookings** — Zeitbuchungen

**Fehlt**: Kein Tab "Eingangsrechnungen", kein Tab "Belege", keine Finanz-Aggregation.

### Verknüpfte Belege in anderen Kontexten

**BillingDocument hat `orderId` FK** (`prisma/schema.prisma:843`), wird in `billing-document-repository.ts:62-81` beim findById mit `order: { select: { id, code, name } }` geladen und in `document-editor.tsx:721-726` angezeigt.

**CRM Inquiry Detail** (`src/components/crm/inquiry-detail.tsx:299-441`) hat einen "Dokumente"-Tab mit BillingDocument-Tabelle.

### Tab-Pattern für neue Tabs

```tsx
// In Tabs-Komponente (shadcn/radix):
<Tabs defaultValue="details">
  <TabsList>
    <TabsTrigger value="details">{t('tabDetails')}</TabsTrigger>
    <TabsTrigger value="assignments">{t('tabAssignments')}</TabsTrigger>
    <TabsTrigger value="bookings">{t('tabBookings')}</TabsTrigger>
    {/* Neuer Tab hier einfügen */}
  </TabsList>
  <TabsContent value="details" className="mt-6">...</TabsContent>
  <TabsContent value="assignments" className="mt-6 space-y-4">...</TabsContent>
  <TabsContent value="bookings" className="mt-6 space-y-4">...</TabsContent>
  {/* Neuer TabsContent hier */}
</Tabs>
```

**Referenz-Implementationen**:
- `src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx` — 3 Tabs (einfachstes Beispiel)
- `src/components/crm/inquiry-detail.tsx` — 4 Tabs mit Dokumenten-Tab
- `src/components/warehouse/article-detail.tsx` — 7 Tabs (komplex)

---

## 8. Tests

### InboundInvoice Test-Dateien

| Datei | Typ | Zeilen |
|-------|-----|--------|
| `src/lib/services/__tests__/inbound-invoice-service.test.ts` | Unit | ~383 |
| `src/lib/services/__tests__/inbound-invoice-service.integration.test.ts` | Integration | ~448 |
| `src/lib/services/__tests__/inbound-invoice-approval-service.integration.test.ts` | Integration | ~418 |
| `src/lib/services/__tests__/inbound-invoice-datev-export-service.test.ts` | Mixed | ~273 |
| `src/lib/services/__tests__/inbound-invoice-supplier-matcher.test.ts` | Unit | ~170 |
| `src/app/api/cron/inbound-invoice-escalations/integration.test.ts` | Integration | ~150 |

### Approval-Workflow-Tests

**Existieren**: `inbound-invoice-approval-service.integration.test.ts:151-417`

Abgedeckte Szenarien:
- Auto-Approval (keine Policies)
- Single-Step Approval (direkter User)
- Two-Step Workflow (User + Gruppe, betragabhängig)
- Rejection mit Reason
- Submitter-Guard (keine Selbst-Genehmigung)
- Authorization-Guard (nur zugewiesener Approver)
- Gruppen-Mitgliedschaft
- Material-Change-Invalidierung
- `findPendingForUser()` Query

### Test-Helpers

**Datei**: `src/trpc/routers/__tests__/helpers.ts`

| Helper | Beschreibung |
|--------|-------------|
| `autoMockPrisma()` | Proxy-basierter Auto-Stub für Prisma |
| `createMockUser()` | Mock ContextUser mit Defaults |
| `createMockContext()` | Mock TRPCContext |
| `createMockUserGroup()` | Mock UserGroup mit Permissions |
| `createUserWithPermissions()` | User mit spezifischen Permission-IDs |

### CostCenter in Tests

**Datei**: `src/trpc/routers/__tests__/cost-centers-router.test.ts`

Factory: `makeCostCenter({ id, code, name, isActive, ... })` — inline in Testdatei, kein geteilter Helper.

### Order in Tests

**Datei**: `src/trpc/routers/__tests__/orders-router.test.ts`

Factory: `makeOrder({ id, code, name, costCenterId, costCenter, ... })` — inline in Testdatei.

CostCenter-Relation wird als verschachtetes Objekt gemocked:
```typescript
makeOrder({ costCenterId: CC_ID, costCenter: { id: CC_ID, code: "CC001", name: "Engineering" } })
```

### Test-Infrastruktur

- **Framework**: Vitest, `environment: "node"`
- **Unit Tests**: Gemocktes Prisma via `autoMockPrisma()`
- **Integration Tests**: Echte PostgreSQL via `DATABASE_URL` aus `.env.local`, `describe.sequential()`
- **Cleanup**: Manuelles `deleteMany()` in `afterAll()` in FK-Abhängigkeitsreihenfolge
- **Fixtures**: ZUGFeRD-PDFs in `src/lib/services/__tests__/fixtures/zugferd/`

---

## Risiken und Überraschungen

### 1. Status ist kein Enum
Status ist `String @db.VarChar(30)`, nicht als Prisma-Enum modelliert. Neues `orderId`/`costCenterId`-Feld hat keine Enum-Risiken, aber die Status-Prüfungen im Service sind String-basiert.

### 2. Material-Feld-Mechanismus
`orderId` und `costCenterId` sind vermutlich **keine Material-Felder** (die approvalVersion nicht triggern sollten). Die aktuelle Liste der Material-Felder ist in `inbound-invoice-service.ts` im `update()` hardcoded. Muss bewusst entschieden werden.

### 3. DATEV-Export baut CSV direkt im Code
Kein Template-System für den Buchungsstapel — Felder werden als Array zusammengebaut. KOST1/KOST2 müssten als **zusätzliche Positionen im Row-Array** eingefügt werden (Position ist im DATEV-Format fix definiert).

### 4. Phase-3-Platzhalter im DATEV-Export
Konto (Pos 7) und Gegenkonto (Pos 8) sind aktuell leer. KOST1/KOST2 sind im DATEV-Buchungsstapel eigene Spalten (typisch Pos 36/37 im vollen Format). Der aktuelle Export hat nur 14 Spalten — müsste auf mindestens 37 Spalten erweitert werden.

### 5. Kein generisches TenantSettings-Modell
Es gibt kein zentrales `TenantSettings`-Modell mit Feature-Flags. Falls die Order/CostCenter-Zuordnung optional pro Mandant sein soll, braucht es entweder ein neues Modell oder ein neues Feld auf einem bestehenden.

### 6. Inline-Form statt dedizierter Formular-Komponente
Die Detail-Page enthält die gesamte Form-Logik inline. Neue Felder (orderId, costCenterId) müssen direkt in `inbound-invoice-detail.tsx` eingebaut werden — kein wiederverwendbares Form.

### 7. Keine bestehende Order-Inbound-Invoice-Verbindung
BillingDocument hat bereits `orderId`-FK zu Order. InboundInvoice hat **keine** solche Verbindung. Die neue Relation muss als eigenständige Migration angelegt werden.

### 8. CostCenter-Dropdown nutzt einfaches Select
Im Order-Form wird CostCenter als einfaches `Select` (nicht suchbar) dargestellt. Bei vielen Kostenstellen müsste evtl. auf Combobox/Autocomplete gewechselt werden. Für Eingangsrechnungen sollte direkt das suchbare Pattern (`ArticleSearchPopover`/`SupplierAssignmentDialog`) verwendet werden.

### 9. Zwei getrennte Nummer-Sequenzen
Orders haben `code` (manuell), InboundInvoices haben `number` (auto-generiert via NumberSequence "ER-"). Die Zuordnung ist rein referenziell.

### 10. Integration-Tests mit echtem Cleanup
Tests löschen Daten in `afterAll()`. Neue FK-Beziehungen (inbound_invoice → order, → cost_center) müssen in der Cleanup-Reihenfolge berücksichtigt werden.

### 11. Approval-Policy nutzt nur grossAmount
Approval-Policies filtern aktuell nur nach Betragsgrenzen. Falls die Order/CostCenter-Zuordnung den Freigabe-Workflow beeinflussen soll (z.B. "alle ER für Auftrag X müssen von Y freigegeben werden"), wäre das eine Erweiterung des Policy-Modells.

### 12. `buyerReference` existiert bereits
Das Feld `buyerReference` (`VarChar(100)`) auf InboundInvoice könnte theoretisch als Order-Referenz missbraucht werden, ist aber ein ZUGFeRD-Feld (BT-10 Buyer Reference). Nicht dafür verwenden — eigenes FK-Feld anlegen.
