---
date: 2026-04-18T22:25:49+02:00
researcher: impactj90
git_commit: e18f63e2e1bfbac9d7c24766ef82424ddb516a33
branch: staging
repository: terp
topic: "Rechnungsausgangsbuch — Bestandsaufnahme relevanter Infrastruktur"
tags: [research, codebase, billing, documents, pdf, csv, datev, permissions, navigation]
status: complete
last_updated: 2026-04-18
last_updated_by: impactj90
---

# Research: Rechnungsausgangsbuch — Bestandsaufnahme relevanter Infrastruktur

**Date**: 2026-04-18T22:25:49+02:00
**Researcher**: impactj90
**Git Commit**: e18f63e2e1bfbac9d7c24766ef82424ddb516a33
**Branch**: staging
**Repository**: terp

## Research Question

Bestandsaufnahme der relevanten bestehenden Infrastruktur für ein neues Feature „Rechnungsausgangsbuch" (monatlicher Report aller finalisierten Ausgangsrechnungen + Gutschriften mit USt-Aufschlüsselung, Export als PDF und CSV). Sieben Bereiche: Datenmodell, Billing-tRPC-Router, PDF-Pipeline, CSV-Export, Konzern-Umsatzauswertung, Permissions + Navigation, Leistungszeitraum-Feld.

## Summary

- **Datenmodell**: Das Prisma-Modell heißt nicht `Document`/`DocumentLine`, sondern `BillingDocument` / `BillingDocumentPosition`. Rechnungen und Gutschriften teilen sich dieselbe Tabelle, unterschieden über `type` (`INVOICE` vs. `CREDIT_NOTE`). Bestehender Index `[tenantId, documentDate]` ist vorhanden; kombiniert `type` oder `status` + `documentDate` existiert nicht.
- **Billing-Router**: Flache `billing/*`-Subrouter unter `src/trpc/routers/billing/`, gewrappt in `tenantProcedure.use(requireModule("billing"))` + `requirePermission(...)`. Datumsfilter-Pattern ist `dateFrom` / `dateTo` als `z.coerce.date()`, über `documentDate: { gte, lte }` im `where`.
- **PDF-Pipeline**: `@react-pdf/renderer` + `renderToBuffer`, Upload in Supabase-Storage-Bucket `documents`, Auslieferung über signierte URL (60 s TTL) aus tRPC-Mutation — Client macht `window.open`. Shared Components in `src/lib/pdf/` (`BillingDocumentPdf`, `FusszeilePdf`, `PositionTablePdf`, `TotalsSummaryPdf`, `RichTextPdf`). Briefkopf kommt aus `BillingTenantConfig` (ein Eintrag pro Tenant).
- **CSV-Export**: DATEV-Eingangsrechnungen-Export ist **hand-rolled** in `inbound-invoice-datev-export-service.ts` (kein Shared-Helper), Windows-1252 via `iconv-lite`, `;`-Delimiter, CRLF, bedingtes Quoting. Auslieferung als Base64-String in tRPC-Return, Client baut Blob + `<a download>`.
- **Konzern-Umsatz**: `crm.addresses.getGroupStats` nutzt zwei parallele `prisma.billingDocument.aggregate`-Calls (INVOICE + / CREDIT_NOTE −), Status-Filter: `status: { not: "CANCELLED" }`. Felder: `subtotalNet`, `totalGross`. Date-Filter über `documentDate` `gte`/`lte`.
- **Permissions + Navigation**: Permissions deterministisch als UUIDv5 in `permission-catalog.ts`, per SQL-Migration in `user_groups.permissions` JSONB seeded. Fakturierungs-Sidebar in `sidebar-nav-config.ts` Block `billingSection` (module `billing`), i18n-Namespace `nav` in `messages/de.json`.
- **Leistungszeitraum**: Feld existiert **nicht**. Weder im Schema (`BillingDocument` / `BillingDocumentPosition`), noch in UI, i18n, tRPC-Inputs oder Migrations.

---

## Detailed Findings

### 1. Document-Datenmodell (Prisma)

**Wichtig**: Modelle heißen `BillingDocument` (Tabelle `billing_documents`) und `BillingDocumentPosition` (Tabelle `billing_document_positions`) — nicht `Document`/`DocumentLine`.

#### Enums — `prisma/schema.prisma`

**`BillingDocumentType`** (Zeilen 625–635):
```prisma
enum BillingDocumentType {
  OFFER
  ORDER_CONFIRMATION
  DELIVERY_NOTE
  SERVICE_NOTE
  RETURN_DELIVERY
  INVOICE
  CREDIT_NOTE
  @@map("billing_document_type")
}
```
`CREDIT_NOTE` ist ein Enum-Wert — es gibt kein separates `CreditNote`-Modell.

**`BillingDocumentStatus`** (Zeilen 637–645):
```prisma
enum BillingDocumentStatus {
  DRAFT
  PRINTED
  PARTIALLY_FORWARDED
  FORWARDED
  CANCELLED
  @@map("billing_document_status")
}
```
`PRINTED` markiert finalisiert (Print = Finalize-Event).

**`BillingPositionType`** (Zeilen 647–655): `ARTICLE`, `FREE`, `TEXT`, `PAGE_BREAK`, `SUBTOTAL`.

#### `BillingDocument` (`prisma/schema.prisma:863–949`)

Relevante Felder:
- `id` UUID, `tenantId` UUID (required)
- `number` VarChar(50), unique pro Tenant
- `type` `BillingDocumentType` (required)
- `status` `BillingDocumentStatus`, default `DRAFT`
- `addressId` UUID (required) — primärer Empfänger, FK zu `CrmAddress`
- Optional: `contactId`, `deliveryAddressId`, `invoiceAddressId`, `inquiryId`, `orderId`, `parentDocumentId`
- Datumsfelder: `orderDate?`, `documentDate` (default `now()`, `@db.Timestamptz(6)`), `deliveryDate?`
- **Kein `totalNet`-Feld** — Netto-Summe ist `subtotalNet` (`Float`, default 0)
- `totalVat` (`Float`, default 0)
- `totalGross` (`Float`, default 0)
- `pdfUrl?`, `eInvoiceXmlUrl?`
- `printedAt?`, `printedById?`, `createdAt`, `updatedAt`, `createdById?`

**Relations** (`schema.prisma:926–939`):
```prisma
tenant              Tenant                    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
address             CrmAddress                @relation(fields: [addressId], references: [id])
contact             CrmContact?               @relation(fields: [contactId], references: [id], onDelete: SetNull)
deliveryAddress     CrmAddress?               @relation("DeliveryAddress", fields: [deliveryAddressId], references: [id], onDelete: SetNull)
invoiceAddress      CrmAddress?               @relation("InvoiceAddress", fields: [invoiceAddressId], references: [id], onDelete: SetNull)
inquiry             CrmInquiry?               @relation(fields: [inquiryId], references: [id], onDelete: SetNull)
order               Order?                    @relation(fields: [orderId], references: [id], onDelete: SetNull)
parentDocument      BillingDocument?          @relation("DocumentChain", fields: [parentDocumentId], references: [id], onDelete: SetNull)
childDocuments      BillingDocument[]         @relation("DocumentChain")
positions           BillingDocumentPosition[]
billingServiceCases BillingServiceCase[]
payments            BillingPayment[]
reminderItems       ReminderItem[]
bankAllocations     BillingDocumentBankAllocation[]
```

**Indizes** (`schema.prisma:941–948`):
```prisma
@@unique([tenantId, number])
@@index([tenantId, type])
@@index([tenantId, status])
@@index([tenantId, addressId])
@@index([tenantId, inquiryId])
@@index([tenantId, parentDocumentId])
@@index([tenantId, documentDate])
```
Kein kombinierter Index `[tenantId, type, documentDate]` oder `[tenantId, status, documentDate]`.

#### `BillingDocumentPosition` (`prisma/schema.prisma:958–982`)

Relevante Felder:
- `documentId` FK, `sortOrder` Int, `type` `BillingPositionType` (default `FREE`)
- `articleId?`, `articleNumber?`, `description?`, `quantity?`, `unit?`
- `unitPrice?`, `flatCosts?`, `totalPrice?`, `priceType?`
- `vatRate?` Float — **einziges Tax-Feld** (heißt nicht `taxRate`)
- `deliveryDate?`, `confirmedDate?`, `createdAt`, `updatedAt`
- **Keine `totalNet` / `totalGross` / `taxRate`-Felder auf der Position** — nur `totalPrice` und `vatRate`

Index: `@@index([documentId, sortOrder])`.

### 2. Bestehende tRPC-Router im Billing-Modul

#### Router-Datei-Map

**Outbound (`billing.*`)** — Index `src/trpc/routers/billing/index.ts`:

| Subkey | Datei |
|---|---|
| `billing.documents` | `src/trpc/routers/billing/documents.ts` |
| `billing.documentTemplates` | `src/trpc/routers/billing/documentTemplates.ts` |
| `billing.tenantConfig` | `src/trpc/routers/billing/tenantConfig.ts` |
| `billing.serviceCases` | `src/trpc/routers/billing/serviceCases.ts` |
| `billing.payments` | `src/trpc/routers/billing/payments.ts` |
| `billing.priceLists` | `src/trpc/routers/billing/priceLists.ts` |
| `billing.recurringInvoices` | `src/trpc/routers/billing/recurringInvoices.ts` |
| `billing.reminders` | `src/trpc/routers/billing/reminders.ts` |

**Inbound (`invoices.*`)** — Index `src/trpc/routers/invoices/index.ts`:

| Subkey | Datei | Module-Guard |
|---|---|---|
| `invoices.inbound` | `src/trpc/routers/invoices/inbound.ts` | `inbound_invoices` |
| `invoices.paymentRuns` | `src/trpc/routers/invoices/payment-runs.ts` | `payment_runs` |
| `invoices.inboundPayments` | `src/trpc/routers/invoices/inbound-invoice-payments.ts` | `inbound_invoices` |

Merge im Root-Router: `src/trpc/routers/_app.ts:85/89` (billing) und `:195/199` (invoices).

#### Multi-Tenant-Scoping

Kontext-Shape in `src/trpc/init.ts:51–70`:
```ts
export type TRPCContext = {
  prisma: PrismaClient
  authToken: string | null
  user: ContextUser | null
  session: Session | null
  tenantId: string | null
  ipAddress: string | null
  userAgent: string | null
  impersonation: ImpersonationContext | null
}
```

`tenantId` wird aus dem `x-tenant-id`-Header extrahiert (`init.ts:93–96`).

Procedure-Kette:
1. `publicProcedure` — kein Auth, Impersonation-Boundary
2. `protectedProcedure` (`init.ts:329–344`) — wirft `UNAUTHORIZED` wenn `ctx.user`/`ctx.session` null
3. `tenantProcedure` (`init.ts:354–382`) — wirft `FORBIDDEN` wenn `ctx.tenantId` null oder wenn User keinen `user_tenants`-Eintrag für den Tenant hat
4. **Local billing base**: `const billingProcedure = tenantProcedure.use(requireModule("billing"))` (`billing/documents.ts:20`)

`requireModule` (`src/lib/modules/index.ts:70–98`) macht `prisma.tenantModule.findUnique({ tenantId_module })` und wirft `FORBIDDEN` wenn fehlt.

#### Permission-Checks

Konstanten werden pro Router-Datei aufgelöst:
```ts
const BILLING_VIEW = permissionIdByKey("billing_documents.view")!
```
`requirePermission` (`src/lib/auth/middleware.ts:40–59`) ruft `hasAnyPermission(user, permissionIds)`; Admin (`userGroup.isAdmin === true`) bypasst.

Beispiele:
- `billing/documents.ts:150–163` — `list`: `.use(requirePermission(BILLING_VIEW))`
- `billing/documents.ts:231–254` — `finalize`: `.use(requirePermission(BILLING_FINALIZE))`
- `billing/reminders.ts:112–165` — Dunning nutzt eigenen Namespace `dunning.view/create/send/cancel/settings`

Billing-Permission-Keys: `billing_documents.view/create/edit/delete/finalize`, `billing_service_cases.*`, `billing_payments.*`, `billing_price_lists.*`, `billing_recurring.*`, `dunning.*`.

#### Datumsfilter-Pattern

Kanonisch in `billing/documents.ts:35–45`:
```ts
const listInput = z.object({
  type: documentTypeEnum.optional(),
  status: documentStatusEnum.optional(),
  addressId: z.string().uuid().optional(),
  inquiryId: z.string().uuid().optional(),
  search: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})
```

Repository (`src/lib/services/billing-document-repository.ts:37–43`):
```ts
if (params.dateFrom || params.dateTo) {
  const dateFilter: Record<string, unknown> = {}
  if (params.dateFrom) dateFilter.gte = params.dateFrom
  if (params.dateTo) dateFilter.lte = params.dateTo
  where.documentDate = dateFilter
}
```

Variationen (Konsistenz ist **nicht** domänenweit uniform):
| Router | Zod-Typ |
|---|---|
| `billing.documents.list` | `z.coerce.date()` |
| `billing.payments.openItems.list` | `z.coerce.date()` |
| `invoices.inbound.list` | `z.string()` |
| `invoices.inbound.exportDatev` | `z.string()`, manuelles `new Date(...)` |
| `crm.reports.*` | `z.string().datetime()` |

#### Beispiel end-to-end: `billing.documents.list`

Router (`billing/documents.ts:150–163`):
```ts
list: billingProcedure
  .use(requirePermission(BILLING_VIEW))
  .input(listInput)
  .query(async ({ ctx, input }) => {
    try {
      return await billingDocService.list(ctx.prisma as unknown as PrismaClient, ctx.tenantId!, input)
    } catch (err) { handleServiceError(err) }
  })
```

Service (`src/lib/services/billing-document-service.ts:163–179`) ist Passthrough. Repository (`billing-document-repository.ts:44–59`):
```ts
const [items, total] = await Promise.all([
  prisma.billingDocument.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (params.page - 1) * params.pageSize,
    take: params.pageSize,
    include: {
      address: true,
      contact: true,
      parentDocument: { select: { id: true, number: true, type: true } },
    },
  }),
  prisma.billingDocument.count({ where }),
])
return { items, total }
```

`handleServiceError` (`src/trpc/errors.ts:10–105`) mappt Domain-Error-Klassen auf tRPC-Codes (NotFound→NOT_FOUND, Validation→BAD_REQUEST etc.).

### 3. PDF-Generierung (`@react-pdf/renderer`)

#### Entry-Point

`src/lib/services/billing-document-pdf-service.ts` — Hauptfunktion `generateAndStorePdf()` (Zeile 29):

1. Lädt Document (`billingDocService.getById`), Empfängeradresse (`prisma.crmAddress.findFirst`), Briefkopf-Konfiguration (`billingTenantConfigRepo.findByTenantId`) — Zeilen 35–52
2. Baut React-Tree: `React.createElement(BillingDocumentPdf, { document, address, tenantConfig })` (Zeilen 55–72)
3. `renderToBuffer(pdfElement)` → PDF-Bytes (Zeile 74)
4. Upload via `storage.upload("documents", path, Buffer, { contentType: "application/pdf", upsert: true })` (Zeilen 86–92)
5. Speichert nur den Storage-Pfad in `BillingDocument.pdfUrl` (Zeile 95)
6. Best-effort Audit-Log-Eintrag (`pdf_generated`, Zeilen 98–107)

Trigger aus `finalize()`: `billing-document-service.ts:553`. Fehler in PDF-Generierung rollen Finalize **nicht** zurück (Zeile 556 nur `console.error`).

Download-Funktion `generateAndGetDownloadUrl()` (Zeile 138):
- Falls `doc.pdfUrl` nicht gesetzt → `generateAndStorePdf(...)`
- Dann `storage.createSignedReadUrl("documents", storagePath, 60)` (60-Sekunden-TTL)
- Retourniert `{ signedUrl, filename }` (Zeile 130: `filename = doc.number.replace(/[/\\]/g, "_") + ".pdf"`)

#### Briefkopf-Daten

Prisma-Modell `BillingTenantConfig` (`schema.prisma:1017–1046`, Tabelle `billing_tenant_configs`, eine Zeile pro Tenant via `@unique tenantId`):

Relevante Felder: `companyName`, `companyAddress`, `logoUrl`, `bankName`, `iban`, `bic`, `taxId`, `commercialRegister`, `managingDirector`, `phone`, `email`, `website`, `taxNumber`, `leitwegId`, `eInvoiceEnabled`, `companyStreet/Zip/City/Country`.

Repository (`src/lib/services/billing-tenant-config-repository.ts`):
- `findByTenantId(prisma, tenantId)` → `prisma.billingTenantConfig.findUnique({ where: { tenantId } })` (Zeile 7)
- `upsert(prisma, tenantId, data)` (Zeile 38)

Service (`src/lib/services/billing-tenant-config-service.ts`): `get()` (Zeile 21), `upsert()` (Zeile 51) schreibt zusätzlich Audit-Log.

Das PDF-Service benutzt das **Repository direkt**, nicht den Service (`billing-document-pdf-service.ts:44`).

#### Shared-PDF-Components (in `src/lib/pdf/`)

- **`billing-document-pdf.tsx`** — Root-Document. Props: `document`, `address`, `tenantConfig`. A4 (20mm top / 15mm bottom / 25mm horizontal padding), Absendereile + Logo oben rechts (`<Image>`, maxHeight 50pt / maxWidth 150pt), Empfängerblock, Beleg-Info, Header-Text (`RichTextPdf`), `PositionTablePdf`, `TotalsSummaryPdf`, Footer-Text (`RichTextPdf`), `FusszeilePdf`.
- **`fusszeile-pdf.tsx`** — 3-spaltige Fußzeile, absolut positioniert bottom 10mm. Props: `FusszeileConfig` (companyName, companyAddress, phone, email, bankName, iban, bic, taxId, commercialRegister, managingDirector).
- **`position-table-pdf.tsx`** — 6-spaltige Tabelle (Pos 6% / Beschreibung 40% / Menge 10% / Einheit 8% / Einzelpreis 16% / Gesamt 20%). Spezialbehandlung für `PAGE_BREAK`, `TEXT`, `SUBTOTAL`. Formatiert `de-DE`/EUR.
- **`totals-summary-pdf.tsx`** — Rechtsbündiger 180pt-Block: Netto, MwSt, Brutto (bold, mit Border-Top). Props: `subtotalNet`, `totalVat`, `totalGross`.
- **`rich-text-pdf.tsx`** — Parst Tiptap-HTML (`<p>`, `<strong>`, `<b>`, `<em>`, `<i>`, `<br>`).
- **`reminder-pdf.tsx`** — Eigenes Dokument für Mahnungen, nutzt `FusszeilePdf` + `RichTextPdf`.
- Weitere (nicht Rechnungsbezug): `purchase-order-pdf.tsx`, `qr-label-pdf.tsx`, `stocktake-protocol-pdf.tsx`, `audit-log-export-pdf.tsx`, `datev-steuerberater-anleitung-pdf.tsx`.

#### Auslieferung

**Keine Streaming-API-Route.** Auslieferung ausschließlich über tRPC + signierte Supabase-Storage-URL.

Router `billing.documents.downloadPdf` (`src/trpc/routers/billing/documents.ts:323`) → `billingPdfService.generateAndGetDownloadUrl(prisma, tenantId, input.id)` → retourniert `{ signedUrl, filename }`.

Hook (`src/hooks/use-billing-documents.ts:166`):
```ts
export function useDownloadBillingDocumentPdf() {
  const trpc = useTRPC()
  return useMutation(trpc.billing.documents.downloadPdf.mutationOptions())
}
```

Client (`src/components/billing/document-editor.tsx:338–339`):
```ts
const result = await downloadPdfMutation.mutateAsync({ id: doc.id })
if (result?.signedUrl) window.open(result.signedUrl, '_blank')
```

Supabase Storage setzt `Content-Disposition` selbst basierend auf dem gespeicherten Objekt-Path (`getStoragePath` in `src/lib/pdf/pdf-storage.ts`: `rechnung/RE-…_Muster_GmbH.pdf` etc.). Der `filename`-Return wird aktuell nicht ausgewertet.

### 4. CSV-Export-Muster (DATEV Eingangsrechnungen)

#### Call-Chain

```
inbound-invoice-detail.tsx:305 (Button)
 → useInboundInvoices.ts:209 (Hook)
  → invoices.inbound.exportDatev (inbound.ts:411)
   → datevExportService.exportToCsv (inbound-invoice-datev-export-service.ts:188)
    → returns { csv: Buffer (win1252), filename, count }
   → result.csv.toString("base64") (inbound.ts:436)
  → Client: atob → Uint8Array → Blob → <a download>.click()
```

#### tRPC-Procedure (`src/trpc/routers/invoices/inbound.ts:411–443`)

- `invProcedure = tenantProcedure.use(requireModule("inbound_invoices"))` (Zeile 24)
- Permission: `requirePermission(EXPORT)` mit `EXPORT = permissionIdByKey("inbound_invoices.export")` (Zeile 19)
- Input: `{ invoiceIds?: UUID[], dateFrom?: string, dateTo?: string }`
- Return: `{ csv: string (base64), filename: string, count: number }`

#### Service (`src/lib/services/inbound-invoice-datev-export-service.ts`)

**Alles hand-rolled — keine Shared-CSV-Utility.** Keine Library (`papaparse`, `csv-stringify` etc.) verwendet.

Query (Zeilen 197–223): `prisma.inboundInvoice.findMany({ where: { tenantId, status: "APPROVED", ... }, include: { supplier, lineItems, order, costCenter } })`.

Zwei Header-Zeilen + N Datenzeilen (Zeilen 230–279):
- **Row 1** — `buildDatevHeader()` (Zeilen 94–130): 26 Felder semikolon-getrennt, `"EXTF"`/`700`/`21`/`"Buchungsstapel"`/`12`/Timestamp/Fiscal-Year-Start/`"4"`/`"0"`
- **Row 2** — `buildColumnHeader()` (Zeilen 135–180): 39 Spaltennamen
- **Row N+** — 39-Feld-Array je Invoice, `.join(";")` (Zeile 275)

Post-Processing (Zeilen 282–315):
1. `lines.join("\r\n") + "\r\n"` (Trailing CRLF)
2. `iconv.encode(csvString, "win1252")` → `Buffer`
3. `prisma.inboundInvoice.updateMany(...)` setzt `status: "EXPORTED"`, `datevExportedAt`, `datevExportedBy`
4. `auditLog.log(...)` mit `action: "export"`, `entityType: "inbound_invoice"`, `entityId: "batch"`
5. Filename: `DATEV_Buchungsstapel_YYYYMMDD.csv`

#### Encoding

- **Windows-1252** via `iconv-lite` v0.7.2 (`package.json:93`), Import `import * as iconv from "iconv-lite"` (Zeile 2), Aufruf `iconv.encode(csvString, "win1252")` (Zeile 280)
- **Kein BOM** für DATEV
- Das separate `export-engine-service.ts` (Lohn-Templates) unterstützt zusätzlich `"utf-8-bom"` (prependet `Buffer.from([0xef, 0xbb, 0xbf])`) und `"utf-8"` — wird aber von der DATEV-Rechnungs-Pipeline **nicht** benutzt

#### Delimiter / Quoting / Line-Endings

- Separator: `;`
- Line-Terminator: `\r\n`
- Quoting via `escapeField()` (Zeilen 60–65):
```ts
function escapeField(value: string): string {
  if (value.includes(";") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
```
  Nur bei `;` oder `"` wird gequotet; interne `"` werden verdoppelt. Header-Zeile nutzt hart-codierte Literal-Quotes (nicht via `escapeField`).

#### Helper

- `formatDatevDate(date): string` — `DDMM` 4-stellig (nicht `TTMMJJJJ`), `getDate().padStart(2,"0") + (getMonth()+1).padStart(2,"0")` (Zeilen 37–41)
- `formatDecimal(value): string` — `value.toFixed(2).replace(".", ",")` (Zeilen 46–48)
- `truncate(str, maxLen): string` — `str.slice(0, maxLen)` (Zeilen 53–55)
- `detectVatRate(lineItems)` — Modus der `vatRate`-Werte, Fallback 19 (Zeilen 70–86)
- `VAT_KEY_MAP: Record<number, number>` — `{ 19: 9, 7: 8, 0: 0 }` (Zeilen 17–21)

#### Browser-Download (`inbound-invoice-detail.tsx:216–236`)

```ts
const blob = new Blob(
  [Uint8Array.from(atob(result.csv), (c) => c.charCodeAt(0))],
  { type: 'text/csv;charset=windows-1252' }
)
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = result.filename
a.click()
URL.revokeObjectURL(url)
```
Kein HTTP-`Content-Disposition` — Filename über `a.download`.

### 5. Umsatz-Aggregation im CRM (Konzern)

#### Entry-Points

- Page: `src/app/[locale]/(dashboard)/crm/reports/page.tsx` (Route `/crm/reports`)
- Tab-Wrapper: `src/components/crm/reports-overview.tsx:150` (Tab `value="groups"`)
- UI-Root: `src/components/crm/report-group-stats.tsx:143`

#### tRPC

**`crm.addresses.listGroups`** (`src/trpc/routers/crm/addresses.ts:208–219`) — gated by `requirePermission(CRM_VIEW)`, delegiert an `crmAddressService.listGroups(prisma, tenantId)`, das wiederum `repo.findParentAddresses(...)` aufruft (`crm-address-repository.ts:290–310`):
```ts
prisma.crmAddress.findMany({
  where: { tenantId, isActive: true, childAddresses: { some: {} } },
  select: { id, company, number, type, city, _count: { select: { childAddresses: true } } },
  orderBy: { company: "asc" },
})
```

**`crm.addresses.getGroupStats`** (`src/trpc/routers/crm/addresses.ts:221–240`) — Lazy-Load pro Konzern:
- Input: `{ parentId: UUID, dateFrom?: string, dateTo?: string }`
- Permission: `requirePermission(CRM_VIEW)`

Hook (`src/hooks/use-crm-addresses.ts:144`):
```ts
export function useCrmGroupStats(parentId, dateFrom?, dateTo?, enabled = true) {
  return useQuery(
    trpc.crm.addresses.getGroupStats.queryOptions(
      { parentId, dateFrom, dateTo },
      { enabled: enabled && !!parentId }
    )
  )
}
```
`enabled` ist an den `expanded`-State der Zeile gekoppelt — Revenue nur bei Aufklappen.

#### Aggregations-Pattern (`src/lib/services/crm-address-service.ts:493–577`)

Drei parallele Prisma-Calls:

**INVOICE-Aggregate:**
```ts
prisma.billingDocument.aggregate({
  where: {
    tenantId,
    addressId: { in: allAddressIds },
    type: "INVOICE",
    status: { not: "CANCELLED" },
    ...(dateFrom || dateTo ? { documentDate: dateFilter } : {}),
  },
  _sum: { subtotalNet: true, totalGross: true },
})
```

**CREDIT_NOTE-Aggregate:** Identisch, aber `type: "CREDIT_NOTE"`.

**Count** über `{ type: { in: ["INVOICE", "CREDIT_NOTE"] } }`.

Netto-Berechnung (Zeilen 564–565):
```ts
const totalNet   = (invoiceAgg._sum.subtotalNet ?? 0) - (creditAgg._sum.subtotalNet ?? 0)
const totalGross = (invoiceAgg._sum.totalGross  ?? 0) - (creditAgg._sum.totalGross  ?? 0)
```

Rundung: `Math.round(x * 100) / 100`.

**Wichtige Filter-Semantik**:
- **Status**: `{ not: "CANCELLED" }` — d.h. `DRAFT`, `PRINTED`, `PARTIALLY_FORWARDED`, `FORWARDED` zählen mit. Nicht „nur finalisiert".
- **Address-Scope**: Parent-Adresse + alle aktiven direkten Kinder (`parentAddressId = parent`, `isActive: true`). Keine Rekursion auf Enkel.
- **Datumsfeld**: `documentDate` `gte`/`lte`, beide inklusiv. `dateFrom`/`dateTo` sind `YYYY-MM-DD` Strings, konvertiert via `new Date(...)`.
- **Gruppierung**: Keine Monats-/Jahres-Aufgliederung — ein Skalar pro Konzern.

#### UI

Date-Filter-Card (`report-group-stats.tsx:185–220`): Zwei `<Input type="date">` plus Reset-Button.
KPI-Card (Zeilen 224–236), BarChart (Recharts, Zeilen 239–254) — zeigt Tochter-Count pro Konzern, nicht Umsatz.
Tabelle (Zeilen 257–289): Konzern-Name / Kundennummer / Anzahl Töchter / Netto / Brutto / Dokumente. Revenue-Zellen zeigen `—` bis Row expanded ist. Formatierung via `Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })`.

### 6. Permissions + Navigation

#### Permission-Catalog (`src/lib/auth/permission-catalog.ts`)

- Static TS-Array `ALL_PERMISSIONS` (Zeile 44) mit 101 Einträgen
- Jeder Eintrag: `{ id, key, resource, action, description }`
- `id` deterministisch: `uuidv5(key, PERMISSION_NAMESPACE)` mit `PERMISSION_NAMESPACE = "f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1"` (Zeile 12)
- Lookup-Maps: `byId`, `byKey` (Zeilen 417–422); Helper `permissionIdByKey(key)` (Zeile 430), `lookupPermission(id)` (Zeile 425), `listPermissions()` (Zeile 435)

#### Seeding

**Keine Runtime-Seed-Skripte / `prisma/seed.ts`.** Permissions werden **nicht** als eigene Tabelle gespeichert, sondern sind UUIDs direkt in der `user_groups.permissions` JSONB-Spalte.

Migrations, die Permissions in Gruppen injecten:
- `supabase/migrations/20260101000088_user_groups_nullable_tenant_and_defaults.sql` — seedet Systemgruppen (`ADMIN`, `PERSONAL`, `VORGESETZTER`, `MITARBEITER`) mit `tenant_id IS NULL`, via `INSERT ... ON CONFLICT ... DO UPDATE SET`
- `supabase/migrations/20260325120000_add_module_permissions_to_groups.sql` — Modul-Permissions + neue Gruppen (`LAGER`, `BUCHHALTUNG`, `VERTRIEB`)
- Spätere Migrations (`20260413100001`, `20260423000001`, `20260428000000`, …) folgen demselben idempotenten Upsert-Pattern

`ON CONFLICT`-Target (Zeile 275 in `20260325120000`):
```sql
ON CONFLICT (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), code)
DO UPDATE SET name = EXCLUDED.name, ...
```

Admin-Bypass: `userGroup.isAdmin === true` überspringt alle UUID-Checks.

#### Runtime-Auflösung

Server: `src/lib/auth/permissions.ts` — `resolvePermissions(user)` (Zeilen 26–47) liefert `userGroup.permissions` als `string[]` oder leer. `isUserAdmin(user)` (Zeilen 56–61) prüft `userGroup.isAdmin || user.role === "admin"`.

Client: `src/hooks/use-has-permission.ts` — `usePermissionChecker()` baut `catalogMap` (key → UUID) und `allowedSet` (User-UUIDs), liefert `check(keys: string[])` (`true` wenn `isAdmin` oder mind. ein Key matched).

#### Sidebar-Navigation (`src/components/layout/sidebar/sidebar-nav-config.ts`)

NavItem-Interface (Zeilen 67–106):
```ts
export interface NavItem {
  titleKey: string        // Key im 'nav' i18n-Namespace
  href: string
  icon: LucideIcon
  permissions?: string[]  // Dot-notation keys; public wenn undefined
  module?: string         // Versteckt wenn Modul nicht aktiviert
  badge?: number
}

export interface NavSection {
  titleKey: string
  items: NavItem[]
  subGroups?: NavSubGroup[]
  module?: string  // Gated die ganze Section
}
```

**`billingSection`** (Zeilen 401–455):
```ts
{
  titleKey: 'billingSection',   // → "Fakturierung"
  module: 'billing',
  items: [
    { titleKey: 'billingDocuments',        href: '/orders/documents',  icon: FileText,    module: 'billing', permissions: ['billing_documents.view'] },
    { titleKey: 'billingServiceCases',     href: '/orders/service-cases', icon: Wrench,   module: 'billing', permissions: ['billing_service_cases.view'] },
    { titleKey: 'billingOpenItems',        href: '/orders/open-items', icon: Wallet,      module: 'billing', permissions: ['billing_payments.view'] },
    { titleKey: 'billingPriceLists',       href: '/orders/price-lists',icon: Tag,         module: 'billing', permissions: ['billing_price_lists.view'] },
    { titleKey: 'billingRecurringInvoices',href: '/orders/recurring',  icon: Repeat,      module: 'billing', permissions: ['billing_recurring.view'] },
    { titleKey: 'billingDunning',          href: '/orders/dunning',    icon: AlertCircle, module: 'billing', permissions: ['dunning.view'] },
    { titleKey: 'billingTemplates',        href: '/orders/templates',  icon: FileStack,   module: 'billing', permissions: ['billing_documents.view'] },
  ],
},
```

i18n-Keys liegen im `'nav'`-Namespace in `messages/de.json` (Zeilen 141–157):
```json
"billingSection": "Fakturierung",
"billingDocuments": "Belege",
"billingServiceCases": "Kundendienst",
"billingOpenItems": "Offene Posten",
"billingPriceLists": "Verkaufspreislisten",
"billingRecurringInvoices": "Wiederkehrende Rechnungen",
"billingDunning": "Mahnwesen",
"billingTemplates": "Vorlagen"
```

Filterung (`sidebar-nav-config.ts:780–808` `filterNavSection()`): Erst Modul-Gate (Section + Item), dann `check(item.permissions)` via `usePermissionChecker`.

Page-Header: Kein separater `<PageHeader>`. Topbar-Breadcrumbs in `src/components/layout/header.tsx:26` + `src/components/layout/breadcrumbs.tsx` leiten aus `usePathname()` ab; Mapping in `segmentToKey`-Lookup (Zeilen 19–63), `'breadcrumbs'` i18n-Namespace.

### 7. Leistungszeitraum-Feld

**Das Feld existiert nicht.** Alle Suchen waren negativ:

- `prisma/schema.prisma` `BillingDocument` (Zeilen 863–949): nur `orderDate`, `documentDate`, `deliveryDate` — kein `serviceDate*` / `performancePeriod*` / `leistungszeitraum*`
- `BillingDocumentPosition` (Zeilen 958–982): nur `deliveryDate`, `confirmedDate`
- UI (`src/**/*.tsx`): null Treffer für "Leistungszeitraum", "Leistungsdatum", "Service period", "Performance date"
- `messages/de.json`: kein Invoice-relevanter `leistung*`-Key (einzige Treffer: `Leistungsschein` als Document-Type-Label Zeile 6624, sowie Payroll-Keys wie `Zusatzleistungen`, `Vermögenswirksame Leistungen`)
- `messages/en.json`: null Treffer
- `src/trpc/routers/` + `src/lib/services/`: null Treffer für `serviceDate*`, `servicePeriod*`, `performanceDate*` etc.
- `supabase/migrations/`: null Treffer (einziger `leistung`-Hit ist Payroll-VL-Tabelle)

## Code References

**Schema:**
- `prisma/schema.prisma:625–645` — Enums `BillingDocumentType`, `BillingDocumentStatus`
- `prisma/schema.prisma:863–949` — `BillingDocument` (inkl. Indizes 941–948)
- `prisma/schema.prisma:958–982` — `BillingDocumentPosition`
- `prisma/schema.prisma:1017–1046` — `BillingTenantConfig`

**tRPC:**
- `src/trpc/init.ts:51–70,329–344,354–382` — Context, `protectedProcedure`, `tenantProcedure`
- `src/lib/auth/middleware.ts:40–59` — `requirePermission`
- `src/lib/modules/index.ts:70–98` — `requireModule`
- `src/trpc/errors.ts:10–105` — `handleServiceError`
- `src/trpc/routers/billing/documents.ts:20,35–45,150–163,231–254,308,323`
- `src/lib/services/billing-document-service.ts:163–179,553`
- `src/lib/services/billing-document-repository.ts:5–60`

**PDF:**
- `src/lib/services/billing-document-pdf-service.ts:29,44,74,86–92,95,117,130,138`
- `src/lib/pdf/billing-document-pdf.tsx`
- `src/lib/pdf/fusszeile-pdf.tsx`
- `src/lib/pdf/position-table-pdf.tsx`
- `src/lib/pdf/totals-summary-pdf.tsx`
- `src/lib/pdf/rich-text-pdf.tsx`
- `src/lib/pdf/reminder-pdf.tsx`
- `src/lib/pdf/pdf-storage.ts` — `getStoragePath`, Upload/SignedUrl-Wrapper
- `src/lib/services/billing-tenant-config-repository.ts:7,38`
- `src/lib/services/billing-tenant-config-service.ts:21,51`

**CSV/DATEV:**
- `src/lib/services/inbound-invoice-datev-export-service.ts:17–21,37–41,46–48,53–55,60–65,70–86,94–130,135–180,188–315`
- `src/trpc/routers/invoices/inbound.ts:19,24,411–443`
- `src/components/invoices/inbound-invoice-detail.tsx:216–236,305`
- `src/hooks/useInboundInvoices.ts:209–216`
- `package.json:93` — `iconv-lite: ^0.7.2`
- `src/lib/services/export-engine-service.ts:134–152` — alternative Encoding-Utils (UTF-8 BOM)

**Konzern-Umsatz:**
- `src/app/[locale]/(dashboard)/crm/reports/page.tsx`
- `src/components/crm/reports-overview.tsx:150`
- `src/components/crm/report-group-stats.tsx:43–141,143,145–146,185–220,224–236,239–254,257–289,279–282`
- `src/trpc/routers/crm/addresses.ts:208–240`
- `src/lib/services/crm-address-service.ts:486–577`
- `src/lib/services/crm-address-repository.ts:290–310`
- `src/hooks/use-crm-addresses.ts:134–152`

**Permissions + Navigation:**
- `src/lib/auth/permission-catalog.ts:12,31–38,44,250–395,417–435`
- `src/lib/auth/permissions.ts:26–47,56–61`
- `src/hooks/use-has-permission.ts:15–65`
- `supabase/migrations/20260101000088_user_groups_nullable_tenant_and_defaults.sql`
- `supabase/migrations/20260325120000_add_module_permissions_to_groups.sql`
- `src/components/layout/sidebar/sidebar-nav-config.ts:67–106,401–455,457–489,491–502,766–808`
- `src/components/layout/sidebar/sidebar-nav.tsx:63,80–85`
- `messages/de.json:141–157`
- `src/components/layout/header.tsx:26`
- `src/components/layout/breadcrumbs.tsx:19–63,90,113,146`

## Architecture Documentation

**Pattern 1 — Router → Service → Repository**: Alle Billing-Router sind dünne Wrapper. `handleServiceError` mappt Domain-Errors. Service erhält `(prisma, tenantId, ...)`; Tenant-Scope in jedem `where`-Block.

**Pattern 2 — Procedure-Chain**: `tenantProcedure.use(requireModule("billing")).use(requirePermission(KEY)).input(...).query/mutation(...)`.

**Pattern 3 — Datumsfilter**: `dateFrom`/`dateTo` Zod, im Repository zu `{ gte, lte }` im entsprechenden Prisma-Where (meist `documentDate`). Inklusive Bounds.

**Pattern 4 — PDF als Storage-Objekt**: React-PDF `renderToBuffer` → Supabase Storage (`documents`-Bucket, private) → Pfad wird in `BillingDocument.pdfUrl` persistiert → Signed-URL (60s) bei Download.

**Pattern 5 — CSV-Export als Base64-tRPC-Return**: Buffer → Base64 → Client dekodiert zu `Uint8Array` → Blob → `<a download>.click()`. Keine API-Route, kein HTTP-Content-Disposition vom Server.

**Pattern 6 — Permission-Katalog als Code + Migration-Seeding**: Statisches TS-Array mit UUIDv5-IDs; Migrations embedden UUIDs per idempotentem `INSERT ... ON CONFLICT DO UPDATE` in `user_groups.permissions` JSONB.

**Pattern 7 — Sidebar-Filter**: Module-Gate (Section + Item) → Permission-Gate (Key-Array, OR-Semantik).

**Pattern 8 — CRM-Aggregation**: Parallel `prisma.aggregate` für Invoice/Credit-Note, Netto/Brutto-Subtraktion, `status: { not: "CANCELLED" }`-Filter.

## Historical Context (from thoughts/)

**Billing / Belegkette / Outbound**:
- `thoughts/shared/plans/2026-03-17-ORD_01-belegkette.md` — Document-Chain-Plan (Angebot → Lieferschein → Rechnung → Gutschrift)
- `thoughts/shared/research/2026-03-17-ORD_01-belegkette.md` — Research-Companion
- `thoughts/shared/tickets/orgAuftrag/TICKET_ORD_01_BELEGKETTE.md` — Ticket
- `thoughts/shared/tickets/orgAuftrag/TICKET_ORD_06_AUSWERTUNGEN.md` — Auftrags-/Rechnungs-Reporting (Rechnungsausgangsbuch-Scope)
- `thoughts/shared/tickets/ZMI-TICKET-164-rechnungslisten-dashboard.md`
- `thoughts/shared/tickets/ZMI-TICKET-132-rechnungen-einfach-lieferschein.md`
- `thoughts/shared/tickets/ZMI-TICKET-133-abschlagsrechnungen.md`
- `thoughts/shared/tickets/ZMI-TICKET-134-schlussrechnung.md`

**Inbound / Phase 1 + 2**:
- `thoughts/shared/research/2026-04-07-terp-invoice-phase1-eingangsrechnungen.md`
- `thoughts/shared/plans/2026-04-07-terp-invoice-phase1-eingangsrechnungen.md`
- `thoughts/shared/research/2026-04-12_15-34-14_inbound-invoice-order-costcenter-bestandsaufnahme.md`
- `thoughts/shared/plans/2026-04-12-inbound-invoice-order-costcenter.md`

**DATEV**:
- `thoughts/shared/tickets/ZMI-TICKET-182-datev-export.md` — Ticket (Buchungsstapel beide Richtungen)
- `thoughts/shared/research/2026-04-08-datev-lohn-vollstaendiger-datenlieferant.md` — Payroll-DATEV (Kontext)
- `thoughts/shared/plans/2026-04-08-datev-lohn-template-export-engine.md` — Template-Export-Engine (geteilt)

**PDF-Pipeline**:
- `thoughts/shared/plans/2026-03-19-billing-document-editor.md`
- `thoughts/shared/plans/2026-03-19-billing-document-editor-research.md`
- `thoughts/shared/research/2026-03-19-billing-vorgang.md`
- `thoughts/shared/plans/2026-03-20-ORD-ERECHNUNG-zugferd-einvoice.md`
- `thoughts/shared/plans/2026-03-25-EK_01-bestelldruck-pdf.md`
- `thoughts/shared/research/2026-03-25-EK_01-bestelldruck-pdf.md`

**CRM-Auswertungen / Konzerne**:
- `thoughts/shared/plans/2026-03-17-CRM_05-auswertungen.md`
- `thoughts/shared/research/2026-03-17-CRM_05-auswertungen.md`
- `thoughts/shared/plans/2026-03-26-CRM_09-konzernzuordnung.md`
- `thoughts/shared/research/2026-03-26-CRM_09-konzernzuordnung.md`
- `thoughts/shared/tickets/orgAuftrag/TICKET_CRM_05_AUSWERTUNGEN.md`
- `thoughts/shared/tickets/orgAuftrag/TICKET_CRM_09_KONZERNZUORDNUNG.md`

**Gutschrift / Credit Note**:
- Eingebettet in `ORD_01-belegkette` und `2026-03-19-billing-document-editor`
- `thoughts/shared/tickets/ZMI-TICKET-121-dokumenten-editor-datenmodell.md`
- `thoughts/shared/tickets/ZMI-TICKET-123-dokumenten-editor-workflow.md`
- `thoughts/shared/tickets/ZMI-TICKET-120-nummernkreise-datenmodell-logik-api.md`

## Related Research

- `thoughts/shared/research/2026-04-07-terp-invoice-phase1-eingangsrechnungen.md` — Eingangsrechnungen-Pendant (Datenmodell + DATEV)
- `thoughts/shared/research/2026-03-19-billing-vorgang.md` — Billing-Vorgang + PDF-Rendering
- `thoughts/shared/research/2026-03-17-CRM_05-auswertungen.md` — CRM-Auswertungen
- `thoughts/shared/research/2026-03-26-CRM_09-konzernzuordnung.md` — Konzern-Zuordnung

## Open Questions

- Keine — alle 7 Fragestellungen wurden beantwortet; das Leistungszeitraum-Feld existiert nachweislich nicht.
